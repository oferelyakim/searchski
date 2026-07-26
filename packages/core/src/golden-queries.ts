/**
 * The golden query set: 20 hand-written queries with expected outcomes.
 *
 * PLAN.md section 7: "Golden query set: 20 hand-written queries with expected
 * top-5, scored on every weight change. The entire product value is ranking
 * quality; without this you are guessing."
 *
 * Expectations are written as ASSERTIONS over the result set, not as hardcoded
 * rankings. A hardcoded top-5 breaks the moment the ETL adds a resort, and then
 * gets deleted, and then the safety net is gone. An assertion like "the #1
 * result tops out above 2800 m" survives a changing roster and still fails
 * loudly when the scorer regresses.
 *
 * Every query also runs the GLOBAL_INVARIANTS, which are the properties that
 * must hold for *any* query: scores in range, contributions summing to the
 * score, hard filters respected, never an unexplained empty list.
 */

import { parseQueryDeterministic } from './criteria.js';
import {
  failedHardFilters,
  kmOfDifficulty,
  matchAreaName,
  normaliseForMatch,
  scoreArea,
  search,
  shareOfDifficulty,
  type ScoringContext,
} from './scoring.js';
import type { ScoreFactor, ScoredResult, SearchCriteria, SearchResponse, SkiArea } from './types.js';

// ---------------------------------------------------------------------------
// Assertion plumbing
// ---------------------------------------------------------------------------

export interface AssertionContext {
  response: SearchResponse;
  areas: readonly SkiArea[];
  ctx: ScoringContext;
}

export interface GoldenAssertion {
  name: string;
  /** Return null to pass, or a message explaining the failure. */
  check(a: AssertionContext): string | null;
}

export interface GoldenQuery {
  id: string;
  /** The text a user would actually type. Parsed by parseQueryDeterministic. */
  text: string;
  /** Why this query is in the set. */
  intent: string;
  /**
   * Criteria fields the deterministic parser MUST extract from `text`. This is
   * what stops the parser silently rotting once the LLM path exists.
   */
  expectParsed?: Partial<SearchCriteria>;
  /** Extra criteria merged over the parsed ones (rarely needed). */
  override?: Partial<SearchCriteria>;
  assertions: GoldenAssertion[];
  /** Skip the content assertions when running against unknown real data. */
  fixtureOnly?: boolean;
}

const F = (name: string, check: (a: AssertionContext) => string | null): GoldenAssertion => ({ name, check });

function top(a: AssertionContext): ScoredResult | null {
  return a.response.results[0] ?? null;
}

function factor(result: ScoredResult, key: string): ScoreFactor | undefined {
  return result.factors.find((f) => f.key === key);
}

function names(results: readonly ScoredResult[], n = 3): string {
  return results.slice(0, n).map((r) => `${r.area.name} (${r.score})`).join(', ') || '(none)';
}

// --- reusable assertion builders -------------------------------------------

const nonEmpty = F('returns at least one result', (a) =>
  a.response.results.length > 0 ? null : 'no results at all',
);

function topInCountries(codes: string[]): GoldenAssertion {
  return F(`#1 is in ${codes.join('/')}`, (a) => {
    const t = top(a);
    if (!t) return 'no results';
    return codes.includes(t.area.country ?? '')
      ? null
      : `#1 was ${t.area.name} (${t.area.country}); top 3 = ${names(a.response.results)}`;
  });
}

function countryInTopN(code: string, n: number): GoldenAssertion {
  return F(`a ${code} resort appears in the top ${n}`, (a) => {
    const slice = a.response.results.slice(0, n);
    return slice.some((r) => r.area.country === code) ? null : `top ${n} = ${names(a.response.results, n)}`;
  });
}

function allResultsInCountries(codes: string[]): GoldenAssertion {
  return F(`every result is in ${codes.join('/')}`, (a) => {
    if (a.response.relaxedFilters?.includes('countries')) return null; // relaxation is legitimate
    const bad = a.response.results.filter((r) => !codes.includes(r.area.country ?? ''));
    return bad.length === 0 ? null : `found ${bad.map((r) => `${r.area.name}=${r.area.country}`).join(', ')}`;
  });
}

function topTopElevAtLeast(m: number): GoldenAssertion {
  return F(`#1 tops out at >= ${m} m`, (a) => {
    const t = top(a);
    if (!t) return 'no results';
    return (t.area.topElevM ?? 0) >= m ? null : `#1 was ${t.area.name} at ${t.area.topElevM} m; top 3 = ${names(a.response.results)}`;
  });
}

function topKmAtLeast(km: number): GoldenAssertion {
  return F(`#1 has >= ${km} km of piste`, (a) => {
    const t = top(a);
    if (!t) return 'no results';
    return t.area.kmTotal >= km ? null : `#1 was ${t.area.name} at ${t.area.kmTotal} km; top 3 = ${names(a.response.results)}`;
  });
}

/** Median modelled skier density across the returned results. */
function medianCapacityPerKm(a: AssertionContext): number {
  const vals = a.response.results.map((r) => r.area.capacityPerKm ?? 0).sort((x, y) => x - y);
  return vals[Math.floor(vals.length / 2)] ?? 0;
}

function topDensityBelowMedian(): GoldenAssertion {
  return F('#1 is a LOW-density resort (quiet slopes, not high throughput)', (a) => {
    const t = top(a);
    if (!t) return 'no results';
    const median = medianCapacityPerKm(a);
    return (t.area.capacityPerKm ?? 0) <= median
      ? null
      : `#1 ${t.area.name} has ${t.area.capacityPerKm} people/h per km vs a median of ${median} — that is a BUSY resort being sold as quiet`;
  });
}

function topDensityAboveMedian(): GoldenAssertion {
  return F('#1 is a HIGH-throughput resort (short queues)', (a) => {
    const t = top(a);
    if (!t) return 'no results';
    const median = medianCapacityPerKm(a);
    return (t.area.capacityPerKm ?? 0) >= median
      ? null
      : `#1 ${t.area.name} has ${t.area.capacityPerKm} people/h per km vs a median of ${median}`;
  });
}

function everyResultPriceAtMost(max: number): GoldenAssertion {
  return F(`no result costs more than ${max}/day (unknown prices are allowed)`, (a) => {
    if (a.response.relaxedFilters?.includes('maxPassPricePerDay')) return null;
    const bad = a.response.results.filter((r) => {
      const p = r.factors.find((f) => f.key === 'passPrice');
      if (!p || p.dataMissing) return false;
      const m = p.reason.match(/about\s*[€$₪]?([\d.]+)/);
      return m?.[1] != null && Number(m[1]) > max;
    });
    return bad.length === 0 ? null : `over budget: ${bad.map((r) => r.area.name).join(', ')}`;
  });
}

// ---------------------------------------------------------------------------
// The invariants — checked on every single query
// ---------------------------------------------------------------------------

export const GLOBAL_INVARIANTS: readonly GoldenAssertion[] = [
  F('every score is between 0 and 100', (a) => {
    const bad = a.response.results.filter((r) => !(r.score >= 0 && r.score <= 100));
    return bad.length === 0 ? null : bad.map((r) => `${r.area.name}=${r.score}`).join(', ');
  }),

  F('factor contributions sum to the score', (a) => {
    for (const r of a.response.results) {
      const sum = r.factors.reduce((s, f) => s + f.contribution, 0);
      if (Math.abs(sum - r.score) > 0.001) {
        return `${r.area.name}: factors sum to ${sum.toFixed(4)} but score is ${r.score}`;
      }
    }
    return null;
  }),

  F('applied factor weights sum to 100', (a) => {
    for (const r of a.response.results) {
      if (r.factors.length === 0) return `${r.area.name} has no factors at all`;
      const sum = r.factors.reduce((s, f) => s + f.weight, 0);
      if (Math.abs(sum - 100) > 0.001) return `${r.area.name}: weights sum to ${sum.toFixed(4)}`;
    }
    return null;
  }),

  F('every factor raw score is in 0..1', (a) => {
    for (const r of a.response.results) {
      for (const f of r.factors) {
        if (!(f.raw >= 0 && f.raw <= 1)) return `${r.area.name}.${f.key} raw=${f.raw}`;
      }
    }
    return null;
  }),

  F('every factor carries a human-readable reason', (a) => {
    for (const r of a.response.results) {
      for (const f of r.factors) {
        if (!f.reason || f.reason.trim().length < 20) return `${r.area.name}.${f.key} reason="${f.reason}"`;
        if (!/[.!?]$/.test(f.reason.trim())) return `${r.area.name}.${f.key} reason is not a sentence`;
      }
    }
    return null;
  }),

  F('every returned result passes the hard filters (or they were relaxed)', (a) => {
    const relaxed = new Set(a.response.relaxedFilters ?? []);
    for (const r of a.response.results) {
      const failed = failedHardFilters(r.area, a.response.criteria, a.ctx).filter((f) => !relaxed.has(f));
      if (failed.length > 0) return `${r.area.name} still fails ${failed.join(', ')}`;
    }
    return null;
  }),

  F('never a closed or insignificant resort, whatever was relaxed', (a) => {
    const bad = a.response.results.filter((r) => r.area.status !== 'operating' || r.area.isSignificant === false);
    return bad.length === 0 ? null : bad.map((r) => `${r.area.name} (${r.area.status}, significant=${r.area.isSignificant})`).join(', ');
  }),

  F('an empty result list always explains itself', (a) =>
    a.response.results.length > 0 || (a.response.relaxedFilters?.length ?? 0) > 0
      ? null
      : 'returned zero results with no relaxedFilters — the user gets a dead end with no explanation'),

  F('results are ordered exactly as compareResults documents', (a) => {
    // Rebuild the sort key from the public shape of each result: named resorts
    // first (longer match first), then fewer soft misses, then higher score.
    // Anything out of order here means the UI is showing an order the engine
    // cannot justify.
    const key = (r: ScoredResult): number[] => [
      r.nameMatch ? 0 : 1,
      r.nameMatch ? -normaliseForMatch(r.nameMatch.matched).length : 0,
      r.failedFilters.filter((f) => f.startsWith('want')).length,
      -r.score,
    ];
    for (let i = 1; i < a.response.results.length; i += 1) {
      const prev = key(a.response.results[i - 1]!);
      const cur = key(a.response.results[i]!);
      for (let k = 0; k < prev.length; k += 1) {
        const d = cur[k]! - prev[k]!;
        if (d > 1e-9) break; // correctly ordered on this key
        if (d < -1e-9) {
          return `${a.response.results[i]!.area.name} sorts above ${a.response.results[i - 1]!.area.name} on key ${k}`;
        }
      }
    }
    return null;
  }),

  F('a pinned result is still fully explained, never an opaque lookup', (a) => {
    for (const r of a.response.results) {
      if (!r.nameMatch) continue;
      if (r.factors.length === 0) return `${r.area.name} was pinned by name but carries no factor breakdown`;
      const sum = r.factors.reduce((s, f) => s + f.weight, 0);
      if (Math.abs(sum - 100) > 0.001) return `${r.area.name} was pinned and its weights sum to ${sum}`;
    }
    return null;
  }),

  F('a name match never smuggles a resort past the hard filters', (a) => {
    const relaxed = new Set(a.response.relaxedFilters ?? []);
    for (const r of a.response.results) {
      if (!r.nameMatch) continue;
      const failed = failedHardFilters(r.area, a.response.criteria, a.ctx).filter((f) => !relaxed.has(f));
      if (failed.length > 0) return `${r.area.name} was pinned by name despite failing ${failed.join(', ')}`;
    }
    return null;
  }),

  F('missing data never scores a resort to zero on that factor', (a) => {
    for (const r of a.response.results) {
      for (const f of r.factors) {
        if (f.dataMissing && f.raw < 0.3) {
          // A partially-missing factor may still score low on the data we DO
          // have (a 1200 m resort is genuinely snow-poor). What must never
          // happen is a factor with no usable data landing near zero.
          const noDataAtAll = /neither helped nor hurt|we will not guess|neither gained nor lost/.test(f.reason);
          if (noDataAtAll) return `${r.area.name}.${f.key} fell back to ${f.raw} instead of neutral`;
        }
      }
    }
    return null;
  }),
];

// ---------------------------------------------------------------------------
// The 20 queries
// ---------------------------------------------------------------------------

export const GOLDEN_QUERIES: readonly GoldenQuery[] = [
  // 1 ------------------------------------------------------------------------
  {
    id: 'G01',
    text: 'cheap beginner friendly resort with good nightlife',
    intent: 'The canonical Bulgaria query. Cheap + beginner + party is exactly Bansko/Borovets.',
    expectParsed: { ability: 'beginner', wantApres: true, maxPassPricePerDay: 45 },
    assertions: [
      nonEmpty,
      countryInTopN('BG', 3),
      F('#1 has a real nightlife signal, not a neutral fallback', (a) => {
        const t = top(a);
        const f = t ? factor(t, 'apresFit') : undefined;
        if (!f) return 'apresFit factor missing';
        return f.raw >= 0.6 ? null : `#1 ${t!.area.name} apresFit raw=${f.raw}`;
      }),
      everyResultPriceAtMost(45),
    ],
    fixtureOnly: true,
  },

  // 2 ------------------------------------------------------------------------
  {
    id: 'G02',
    text: 'highest altitude, snow sure skiing',
    intent: 'Altitude must dominate when asked for, and must stay monotonic above 2800 m.',
    expectParsed: { wantSnowsure: true, minTopElevM: 2500 },
    assertions: [
      nonEmpty,
      topTopElevAtLeast(2800),
      F('snowReliability is the heaviest factor on #1', (a) => {
        const t = top(a);
        if (!t) return 'no results';
        const best = t.factors[0];
        return best?.key === 'snowReliability' || best?.key === 'altitudeFit'
          ? null
          : `heaviest factor on #1 was ${best?.key}`;
      }),
    ],
    fixtureOnly: true,
  },

  // 3 ------------------------------------------------------------------------
  {
    id: 'G03',
    text: 'expert terrain, big ski area',
    intent: 'Experts want steep terrain AND enough of it. Both must bind.',
    expectParsed: { ability: 'expert', minKm: 100 },
    assertions: [
      nonEmpty,
      topKmAtLeast(100),
      F('#1 actually has advanced or expert terrain', (a) => {
        const t = top(a);
        if (!t) return 'no results';
        const steep = kmOfDifficulty(t.area, 'advanced') + kmOfDifficulty(t.area, 'expert') + kmOfDifficulty(t.area, 'freeride');
        return steep > 0 ? null : `#1 ${t.area.name} has no advanced/expert/freeride km`;
      }),
      F('every result meets the 100 km floor', (a) => {
        if (a.response.relaxedFilters?.includes('minKm')) return null;
        const bad = a.response.results.filter((r) => r.area.kmTotal > 0 && r.area.kmTotal < 100);
        return bad.length === 0 ? null : bad.map((r) => `${r.area.name}=${r.area.kmTotal}km`).join(', ');
      }),
    ],
    fixtureOnly: true,
  },

  // 4 ------------------------------------------------------------------------
  {
    id: 'G04',
    text: 'somewhere with night skiing',
    intent: 'The tri-state test. A documented "no" must sink; an unknown must not.',
    expectParsed: { wantNightSki: true },
    assertions: [
      nonEmpty,
      F('every resort without night skiing ranks below every resort with it', (a) => {
        const lastWithIdx = a.response.results.map((r) => r.area.hasNightSki).lastIndexOf(true);
        const firstWithoutIdx = a.response.results.findIndex((r) => r.area.hasNightSki === false);
        if (firstWithoutIdx === -1 || lastWithIdx === -1) return null;
        return firstWithoutIdx > lastWithIdx
          ? null
          : `${a.response.results[firstWithoutIdx]!.area.name} (no night ski) ranked above ${a.response.results[lastWithIdx]!.area.name}`;
      }),
      F('unknown night skiing is neutral, not a "no"', (a) => {
        for (const r of a.response.results) {
          const f = factor(r, 'nightSki');
          if (!f) return 'nightSki factor missing';
          if (r.area.hasNightSki === null && (f.raw !== 0.5 || !f.dataMissing)) {
            return `${r.area.name} has unknown night skiing but scored raw=${f.raw}, dataMissing=${f.dataMissing}`;
          }
        }
        return null;
      }),
      F('#1 actually has night skiing', (a) => {
        const t = top(a);
        return t?.area.hasNightSki === true ? null : `#1 was ${t?.area.name} (hasNightSki=${t?.area.hasNightSki})`;
      }),
    ],
  },

  // 5 ------------------------------------------------------------------------
  {
    id: 'G05',
    text: 'family holiday in Bulgaria with young kids',
    intent: 'Country filter plus family terrain. Bulgaria has enough resorts not to trigger relaxation.',
    expectParsed: { countries: ['BG'], wantFamily: true },
    assertions: [
      nonEmpty,
      allResultsInCountries(['BG']),
      F('#1 has a genuinely gentle mountain', (a) => {
        const t = top(a);
        if (!t) return 'no results';
        const gentle = shareOfDifficulty(t.area, 'novice') + shareOfDifficulty(t.area, 'easy');
        return gentle >= 0.3 ? null : `#1 ${t.area.name} is only ${(gentle * 100).toFixed(0)}% green/blue`;
      }),
    ],
    fixtureOnly: true,
  },

  // 6 ------------------------------------------------------------------------
  {
    id: 'G06',
    text: 'kosher food and a hebrew speaking ski school',
    intent: 'The moat. Only VERIFIED curated rows may move the ranking.',
    expectParsed: { wantKosher: true, wantHebrewSkiSchool: true },
    assertions: [
      nonEmpty,
      F('#1 has a verified Israel profile', (a) => {
        const t = top(a);
        if (!t) return 'no results';
        return t.israel?.provenance.verification === 'verified'
          ? null
          : `#1 ${t.area.name} profile verification = ${t.israel?.provenance.verification ?? 'none'}`;
      }),
      F('unverified curated data is always neutral and flagged', (a) => {
        for (const r of a.response.results) {
          const f = factor(r, 'israelFit');
          if (!f) return 'israelFit factor missing';
          const verified = r.israel?.provenance.verification === 'verified';
          if (!verified && (f.raw !== 0.5 || !f.dataMissing)) {
            return `${r.area.name} has unverified/absent curated data but israelFit raw=${f.raw}, dataMissing=${f.dataMissing}`;
          }
        }
        return null;
      }),
      F('a verified "no kosher food" resort is demoted below everything else', (a) => {
        const idx = a.response.results.findIndex(
          (r) => r.israel?.provenance.verification === 'verified' && r.israel.kosherAvailability === 0,
        );
        if (idx === -1) return null;
        return idx === a.response.results.length - 1 || a.response.results[idx]!.failedFilters.includes('wantKosher')
          ? null
          : `resort with verified zero kosher availability was not demoted`;
      }),
    ],
    fixtureOnly: true,
  },

  // 7 ------------------------------------------------------------------------
  {
    id: 'G07',
    text: 'uncrowded slopes for a nervous intermediate',
    intent:
      'PLAN section 5 headline query. "Uncrowded" is about SLOPE DENSITY, not lift throughput — ' +
      'this query previously returned the busiest region in the Dolomites at #1.',
    expectParsed: { ability: 'intermediate', wantUncrowded: true },
    assertions: [
      nonEmpty,
      topDensityBelowMedian(),
      F('"uncrowded" does not silently also ask for short queues', (a) =>
        a.response.criteria.wantShortLiftQueues !== true ? null : 'wantShortLiftQueues was set by the word "uncrowded"'),
      F('liftQueues does not leak into a slope-quiet query', (a) => {
        const t = top(a);
        if (!t) return 'no results';
        return factor(t, 'liftQueues') == null ? null : 'liftQueues scored a query that never asked about queues';
      }),
      F('the crowding explanation admits it is a model, not a measurement', (a) => {
        const t = top(a);
        const f = t ? factor(t, 'slopeQuiet') : undefined;
        if (!f) return 'slopeQuiet factor missing';
        if (!/people an hour/.test(f.reason)) return `reason is not in plain language: "${f.reason}"`;
        return /model, not a headcount|no visitor numbers/.test(f.reason)
          ? null
          : `reason does not distinguish model from measurement: "${f.reason}"`;
      }),
    ],
    fixtureOnly: true,
  },

  // 8 ------------------------------------------------------------------------
  {
    id: 'G08',
    text: 'good for intermediates, cheap, decent nightlife, under 4 hours from Sofia airport',
    intent: 'PLAN section 7 acceptance test: this must return Bansko above Cortina, and show why.',
    expectParsed: {
      ability: 'intermediate',
      wantApres: true,
      originAirport: 'SOF',
      maxTransferMinutes: 240,
      // "under 4 hours" is a duration, NOT a EUR 4 lift pass. The budget here
      // comes from the word "cheap" alone.
      maxPassPricePerDay: 45,
      currency: 'EUR',
    },
    assertions: [
      nonEmpty,
      topInCountries(['BG']),
      F('no result has a known transfer over 4 hours', (a) => {
        if (a.response.relaxedFilters?.includes('maxTransferMinutes')) return null;
        const bad = a.response.results.filter((r) => r.transfer != null && r.transfer.driveMinutes > 240);
        return bad.length === 0 ? null : bad.map((r) => `${r.area.name}=${r.transfer?.driveMinutes}min`).join(', ');
      }),
      F('the winner can explain itself factor by factor', (a) => {
        const t = top(a);
        if (!t) return 'no results';
        return t.factors.length >= 4 ? null : `only ${t.factors.length} factors on the winner`;
      }),
    ],
    fixtureOnly: true,
  },

  // 9 ------------------------------------------------------------------------
  {
    id: 'G09',
    text: 'group trip with a first timer and an expert',
    intent: 'Mixed-ability groups are the common real case. Score the worst-served member and say so.',
    expectParsed: { groupAbilities: ['first_timer', 'expert'] },
    assertions: [
      nonEmpty,
      F('the parser produced a group, not a single ability', (a) => {
        const g = a.response.criteria.groupAbilities ?? [];
        return g.includes('first_timer') && g.includes('expert') ? null : `groupAbilities = ${JSON.stringify(g)}`;
      }),
      F('the reason names the least well-served member', (a) => {
        const t = top(a);
        const f = t ? factor(t, 'abilityFit') : undefined;
        if (!f) return 'abilityFit factor missing';
        return /least well-served|group/.test(f.reason) ? null : `reason was "${f.reason}"`;
      }),
      F('#1 works for the first timer as well as the expert', (a) => {
        const t = top(a);
        if (!t) return 'no results';
        const gentleKm = kmOfDifficulty(t.area, 'novice') + kmOfDifficulty(t.area, 'easy');
        const steepKm = kmOfDifficulty(t.area, 'advanced') + kmOfDifficulty(t.area, 'expert') + kmOfDifficulty(t.area, 'freeride');
        return gentleKm >= 5 && steepKm >= 5 ? null : `#1 ${t.area.name}: ${gentleKm.toFixed(1)}km gentle, ${steepKm.toFixed(1)}km steep`;
      }),
    ],
    fixtureOnly: true,
  },

  // 10 -----------------------------------------------------------------------
  {
    id: 'G10',
    text: 'skiing in Norway',
    intent: 'Nothing matches. The engine must relax and explain, never return a bare empty list.',
    expectParsed: { countries: ['NO'] },
    assertions: [
      F('relaxedFilters explains what was given up', (a) =>
        (a.response.relaxedFilters?.length ?? 0) > 0 ? null : 'no relaxedFilters set'),
      F('countries was the filter relaxed', (a) =>
        a.response.relaxedFilters?.includes('countries') ? null : `relaxed = ${JSON.stringify(a.response.relaxedFilters)}`),
      F('results are shown after relaxing rather than a dead end', (a) =>
        a.response.results.length > 0 ? null : 'still empty after relaxation'),
    ],
    fixtureOnly: true,
  },

  // 11 -----------------------------------------------------------------------
  {
    id: 'G11',
    text: 'סקי בגאורגיה למתקדמים',
    intent: 'Hebrew. "Skiing in Georgia for advanced skiers." Hebrew glues prepositions on (בגאורגיה).',
    expectParsed: { countries: ['GE'], ability: 'advanced' },
    assertions: [
      nonEmpty,
      allResultsInCountries(['GE']),
      F('the parser understood the Hebrew country name with its prefix', (a) =>
        a.response.criteria.countries?.includes('GE') ? null : `countries = ${JSON.stringify(a.response.criteria.countries)}`),
    ],
    fixtureOnly: true,
  },

  // 12 -----------------------------------------------------------------------
  {
    id: 'G12',
    text: 'סקי לילה בבולגריה למשפחות עם ילדים',
    intent: 'Hebrew. "Night skiing in Bulgaria for families with children." Three signals in one sentence.',
    expectParsed: { countries: ['BG'], wantNightSki: true, wantFamily: true },
    assertions: [
      nonEmpty,
      allResultsInCountries(['BG']),
      F('#1 has night skiing', (a) => {
        const t = top(a);
        return t?.area.hasNightSki === true ? null : `#1 ${t?.area.name} hasNightSki=${t?.area.hasNightSki}`;
      }),
      F('#1 is a gentle mountain', (a) => {
        const t = top(a);
        if (!t) return 'no results';
        const gentle = shareOfDifficulty(t.area, 'novice') + shareOfDifficulty(t.area, 'easy');
        return gentle >= 0.3 ? null : `#1 ${t.area.name} is only ${(gentle * 100).toFixed(0)}% green/blue`;
      }),
    ],
    fixtureOnly: true,
  },

  // 13 -----------------------------------------------------------------------
  {
    id: 'G13',
    text: 'אוכל כשר ובית חב"ד קרוב, למתחילים, עד 60 יורו ליום',
    intent: 'Hebrew. "Kosher food and a Chabad house nearby, for beginners, up to EUR 60 a day." The full Israel layer.',
    expectParsed: { wantKosher: true, ability: 'beginner', maxPassPricePerDay: 60, currency: 'EUR' },
    assertions: [
      nonEmpty,
      F('a Chabad radius was picked up', (a) =>
        a.response.criteria.maxChabadDistanceKm != null ? null : 'maxChabadDistanceKm not set'),
      F('the per-day budget was read as per-day, not as a trip total', (a) =>
        a.response.criteria.maxPassPricePerDay === 60 ? null : `maxPassPricePerDay = ${a.response.criteria.maxPassPricePerDay}`),
      everyResultPriceAtMost(60),
      F('#1 has verified kosher information', (a) => {
        const t = top(a);
        if (!t) return 'no results';
        const ok = t.israel?.provenance.verification === 'verified' && (t.israel.kosherAvailability ?? 0) >= 1;
        return ok ? null : `#1 ${t.area.name} kosher=${t.israel?.kosherAvailability} verification=${t.israel?.provenance.verification}`;
      }),
    ],
    fixtureOnly: true,
  },

  // 14 -----------------------------------------------------------------------
  {
    id: 'G14',
    text: '100km+ of pistes please',
    intent: 'A bare size floor with no other criteria. The size filter must be hard.',
    expectParsed: { minKm: 100 },
    assertions: [
      nonEmpty,
      F('"100km+" is a size, not a budget', (a) =>
        a.response.criteria.maxPassPricePerDay == null ? null : `maxPassPricePerDay = ${a.response.criteria.maxPassPricePerDay}`),
      F('every result has at least 100 km', (a) => {
        if (a.response.relaxedFilters?.includes('minKm')) return null;
        const bad = a.response.results.filter((r) => r.area.kmTotal > 0 && r.area.kmTotal < 100);
        return bad.length === 0 ? null : bad.map((r) => `${r.area.name}=${r.area.kmTotal}`).join(', ');
      }),
      F('bigger is better, but with diminishing returns', (a) => {
        // The step from 100 to 150 km must be worth more than 250 to 300 km.
        const c = a.response.criteria;
        const mk = (kmTotal: number): SkiArea => ({ ...a.areas[0]!, id: `synthetic-${kmTotal}`, kmTotal });
        const at = (kmTotal: number) => factor(scoreArea(mk(kmTotal), c, a.ctx), 'sizeFit')?.raw ?? 0;
        const small = at(150) - at(100);
        const large = at(300) - at(250);
        return small > large ? null : `sizeFit gain 100->150 was ${small.toFixed(4)}, 250->300 was ${large.toFixed(4)}`;
      }),
    ],
  },

  // 15 -----------------------------------------------------------------------
  {
    id: 'G15',
    text: 'complete beginner, first time on skis, never skied before',
    intent: 'Absolute novice km must beat novice share. 5% of 200 km beats 40% of 8 km.',
    expectParsed: { ability: 'first_timer' },
    assertions: [
      nonEmpty,
      F('#1 has at least 8 km of genuinely gentle terrain', (a) => {
        const t = top(a);
        if (!t) return 'no results';
        const gentleKm = kmOfDifficulty(t.area, 'novice') + kmOfDifficulty(t.area, 'easy');
        return gentleKm >= 8 ? null : `#1 ${t.area.name} has only ${gentleKm.toFixed(1)} km of green/blue`;
      }),
      F('abilityFit is the biggest contributor for #1', (a) => {
        const t = top(a);
        if (!t) return 'no results';
        return t.factors[0]?.key === 'abilityFit' ? null : `biggest factor was ${t.factors[0]?.key}`;
      }),
    ],
    fixtureOnly: true,
  },

  // 16 -----------------------------------------------------------------------
  {
    id: 'G16',
    text: 'snow sure resort in Bulgaria',
    intent:
      'THE data-gap test. `piste:snowmaking` is tagged on 0.7% of runs worldwide (772 of 108,612), ' +
      'so a zero is silence everywhere — not evidence of absence anywhere.',
    expectParsed: { countries: ['BG'], wantSnowsure: true },
    assertions: [
      nonEmpty,
      allResultsInCountries(['BG']),
      F('a snowmaking zero is flagged and never punished, in any country', (a) => {
        for (const r of a.response.results) {
          if (r.area.snowmakingKm > 0) continue;
          const f = factor(r, 'snowReliability');
          if (!f) return 'snowReliability factor missing';
          if (!f.dataMissing) return `${r.area.name} has snowmakingKm=0 but dataMissing=false`;
          if (f.raw < 0.35) return `${r.area.name} was punished to ${f.raw} for a field nobody tagged`;
          if (!/could not establish/.test(f.reason)) {
            return `${r.area.name} implies there is no snowmaking rather than saying we do not know: "${f.reason}"`;
          }
        }
        return null;
      }),
    ],
    fixtureOnly: true,
  },

  // 17 -----------------------------------------------------------------------
  {
    id: 'G17',
    text: 'family resort with no lift queues, under 60 euro a day',
    intent:
      'The MIRROR of G07: this one asks about waiting for lifts, not about how busy the pistes feel, ' +
      'and must therefore favour the opposite kind of resort.',
    expectParsed: { wantFamily: true, wantShortLiftQueues: true, maxPassPricePerDay: 60, currency: 'EUR' },
    assertions: [
      nonEmpty,
      everyResultPriceAtMost(60),
      topDensityAboveMedian(),
      F('"no lift queues" does not silently also ask for quiet slopes', (a) =>
        a.response.criteria.wantUncrowded !== true ? null : 'wantUncrowded was set by the phrase "no lift queues"'),
      F('only the engaged factors plus the base ones apply', (a) => {
        const t = top(a);
        if (!t) return 'no results';
        const keys = new Set(t.factors.map((f) => f.key));
        // Not asked for, zero base weight -> must not appear at all.
        const shouldBeAbsent = ['nightSki', 'apresFit', 'israelFit', 'abilityFit', 'transferTime', 'slopeQuiet'];
        const leaked = shouldBeAbsent.filter((k) => keys.has(k));
        return leaked.length === 0 ? null : `irrelevant factors diluted the score: ${leaked.join(', ')}`;
      }),
      F('#1 is a gentle mountain', (a) => {
        const t = top(a);
        if (!t) return 'no results';
        const gentle = shareOfDifficulty(t.area, 'novice') + shareOfDifficulty(t.area, 'easy');
        return gentle >= 0.3 ? null : `#1 ${t.area.name} is only ${(gentle * 100).toFixed(0)}% green/blue`;
      }),
    ],
    fixtureOnly: true,
  },

  // 18 -----------------------------------------------------------------------
  {
    id: 'G18',
    text: 'big ski area in Italy, ski in ski out',
    intent: 'Country + size together. ski-in/ski-out is parsed but has no data yet — it must not silently do nothing wrong.',
    expectParsed: { countries: ['IT'], minKm: 100, wantSkiInSkiOut: true },
    assertions: [
      nonEmpty,
      allResultsInCountries(['IT']),
      F('every result meets the size floor', (a) => {
        if (a.response.relaxedFilters?.includes('minKm')) return null;
        const bad = a.response.results.filter((r) => r.area.kmTotal > 0 && r.area.kmTotal < 100);
        return bad.length === 0 ? null : bad.map((r) => `${r.area.name}=${r.area.kmTotal}`).join(', ');
      }),
      F('ski-in/ski-out was understood even though we cannot score it yet', (a) =>
        a.response.criteria.wantSkiInSkiOut === true ? null : 'wantSkiInSkiOut not parsed'),
    ],
    fixtureOnly: true,
  },

  // 19 -----------------------------------------------------------------------
  {
    id: 'G19',
    text: 'lift pass under €50 a day',
    intent: 'Currency symbol plus a per-day marker. The budget is a hard filter on KNOWN prices only.',
    expectParsed: { maxPassPricePerDay: 50, currency: 'EUR' },
    assertions: [
      nonEmpty,
      everyResultPriceAtMost(50),
      F('resorts with no known price are not excluded', (a) => {
        const withoutPrice = a.areas.filter(
          (area) => area.status === 'operating' && area.isSignificant !== false && a.ctx.passPrices?.[area.id] == null,
        );
        if (withoutPrice.length === 0) return null;
        const shown = new Set(a.response.results.map((r) => r.area.id));
        const missing = withoutPrice.filter((area) => !shown.has(area.id));
        return missing.length === 0 ? null : `priceless resorts were filtered out: ${missing.map((x) => x.name).join(', ')}`;
      }),
      F('the price explanation states its basis', (a) => {
        const t = top(a);
        const f = t ? factor(t, 'passPrice') : undefined;
        if (!f) return 'passPrice factor missing';
        return f.dataMissing || /day ticket|divided by/.test(f.reason) ? null : `reason was "${f.reason}"`;
      }),
    ],
  },

  // 20 -----------------------------------------------------------------------
  {
    id: 'G20',
    text: 'רוצים מקום לא עמוס עם שלג בטוח וסקי לילה',
    intent: 'Hebrew. "We want somewhere uncrowded with reliable snow and night skiing." Three booleans, no country.',
    expectParsed: { wantUncrowded: true, wantSnowsure: true, wantNightSki: true },
    assertions: [
      nonEmpty,
      topDensityBelowMedian(),
      F('#1 is not a resort documented as having no night skiing', (a) => {
        const t = top(a);
        return t?.area.hasNightSki !== false ? null : `#1 ${t.area.name} has no night skiing`;
      }),
      F('every apres/nightlife factor names its source', (a) => {
        // apresFit is not engaged here, so it must not appear at all.
        const t = top(a);
        return t && !factor(t, 'apresFit') ? null : 'apresFit leaked into a query that did not ask about nightlife';
      }),
      F('the three requested factors all carry real weight', (a) => {
        const t = top(a);
        if (!t) return 'no results';
        for (const key of ['slopeQuiet', 'snowReliability', 'nightSki']) {
          const f = factor(t, key);
          if (!f) return `${key} factor missing`;
          if (f.weight < 10) return `${key} was only weighted ${f.weight}`;
        }
        return null;
      }),
    ],
    fixtureOnly: true,
  },
  // 21 -----------------------------------------------------------------------
  {
    id: 'G21',
    text: 'Val Gardena',
    intent:
      'A bare resort name. Upstream merged Val Gardena into the Alta Badia record, so this only ' +
      'works if search() reads the alias list — and it is only honest if the boundary note is there to explain it.',
    assertions: [
      nonEmpty,
      F('#1 is the resort the user named', (a) => {
        const t = top(a);
        if (!t) return 'no results';
        const named = t.area.name === 'Alta Badia' || t.area.aliases.some((x) => /val gardena/i.test(x));
        return named ? null : `#1 was ${t.area.name}; top 3 = ${names(a.response.results)}`;
      }),
      F('#1 was pinned by an alias, and says which one', (a) => {
        const t = top(a);
        if (!t) return 'no results';
        if (!t.nameMatch) return `#1 ${t.area.name} carries no nameMatch, so the UI cannot explain the pin`;
        return /val gardena/i.test(t.nameMatch.matched)
          ? null
          : `pinned on "${t.nameMatch.matched}" rather than the name the user typed`;
      }),
      F('#1 carries the boundary note explaining the merge', (a) => {
        const t = top(a);
        if (!t) return 'no results';
        return t.area.boundaryNote != null && t.area.boundaryNote.length > 0
          ? null
          : `${t.area.name} has no boundaryNote, so its km total silently covers two resorts`;
      }),
      F('the pinned result is still scored and explained', (a) => {
        const t = top(a);
        if (!t) return 'no results';
        return t.factors.length >= 3 && t.score > 0
          ? null
          : `pinned result has ${t.factors.length} factors and score ${t.score}`;
      }),
    ],
    fixtureOnly: true,
  },

  // 22 -----------------------------------------------------------------------
  {
    id: 'G22',
    text: 'is Livigno good for beginners',
    intent: 'A resort name inside a real sentence. Pinning must not swallow the rest of the query.',
    expectParsed: { ability: 'beginner' },
    assertions: [
      nonEmpty,
      F('#1 is the resort the user named', (a) => {
        const t = top(a);
        return t?.area.name === 'Livigno' ? null : `#1 was ${t?.area.name}; top 3 = ${names(a.response.results)}`;
      }),
      F('the rest of the sentence was still parsed', (a) =>
        a.response.criteria.ability === 'beginner' ? null : `ability = ${a.response.criteria.ability}`),
      F('abilityFit still ran on the pinned resort', (a) => {
        const t = top(a);
        if (!t) return 'no results';
        const f = factor(t, 'abilityFit');
        return f && !f.dataMissing ? null : 'the pin replaced the scoring instead of reordering it';
      }),
      F('unnamed resorts are still returned below it, not filtered out', (a) =>
        a.response.results.length >= 3 ? null : `only ${a.response.results.length} results — the pin acted as a filter`),
    ],
    fixtureOnly: true,
  },
  // 23 -----------------------------------------------------------------------
  {
    id: 'G23',
    text: 'Crystal',
    intent:
      'The positive half of the ambiguous-name pair. "Crystal" is the only single-word alias in the ' +
      'GE/BG/IT dataset that is also an ordinary English word; naming it exactly must still pin it.',
    assertions: [
      nonEmpty,
      F('#1 is Crystal, pinned by name', (a) => {
        const t = top(a);
        if (!t) return 'no results';
        if (t.area.name !== 'Crystal') return `#1 was ${t.area.name}; top 3 = ${names(a.response.results)}`;
        return t.nameMatch ? null : 'Crystal was #1 but carries no nameMatch to explain why';
      }),
      F('an exact ambiguous name still pins despite the guard', (a) => {
        const t = top(a);
        return t?.nameMatch?.matched === 'Crystal' ? null : `pinned on "${t?.nameMatch?.matched}"`;
      }),
    ],
    fixtureOnly: true,
  },

  // 24 -----------------------------------------------------------------------
  {
    id: 'G24',
    text: 'crystal clear snow for beginners',
    intent:
      'THE NEGATIVE CASE, and the one that regresses silently. An ordinary-word name embedded in prose ' +
      'must pin nothing at all — the user is describing snow, not naming a resort in Georgia.',
    expectParsed: { ability: 'beginner' },
    assertions: [
      nonEmpty,
      F('nothing at all was pinned', (a) => {
        const pinned = a.response.results.filter((r) => r.nameMatch);
        return pinned.length === 0
          ? null
          : `false pin: ${pinned.map((r) => `${r.area.name} via "${r.nameMatch?.matched}"`).join(', ')}`;
      }),
      F('#1 is not the ambiguously-named resort', (a) => {
        const t = top(a);
        return t?.area.name !== 'Crystal' ? null : 'Crystal was pinned to #1 by the word "crystal" in prose';
      }),
      F('the ranking is identical to the same query with matching disabled', (a) => {
        const withoutMatching = search(a.areas, { ...a.response.criteria, rawQuery: undefined }, a.ctx);
        const got = a.response.results.map((r) => r.area.id).join(',');
        const want = withoutMatching.results.map((r) => r.area.id).join(',');
        return got === want ? null : `name matching perturbed a prose query:\n        got  ${got}\n        want ${want}`;
      }),
      F('the rest of the query was still parsed and scored', (a) => {
        if (a.response.criteria.ability !== 'beginner') return `ability = ${a.response.criteria.ability}`;
        const t = top(a);
        const f = t ? factor(t, 'abilityFit') : undefined;
        return f && !f.dataMissing ? null : 'abilityFit did not run on the winner';
      }),
    ],
    fixtureOnly: true,
  },
];

// ---------------------------------------------------------------------------
// Standalone checks — properties of the scorer that no single query expresses
// ---------------------------------------------------------------------------

export interface StandaloneCheck {
  id: string;
  name: string;
  run(areas: readonly SkiArea[], ctx: ScoringContext): string | null;
}

function cloneArea(base: SkiArea, patch: Partial<SkiArea>): SkiArea {
  return { ...base, ...patch };
}

export const STANDALONE_CHECKS: readonly StandaloneCheck[] = [
  {
    id: 'S01',
    name: 'a 5% novice share of 200 km beats a 40% novice share of 8 km for a first timer',
    run: (areas, ctx) => {
      const base = areas[0]!;
      const big = cloneArea(base, {
        id: 'chk-big',
        name: 'Big area, small novice share',
        kmTotal: 200,
        terrainMix: { novice: 0.05, easy: 0.05, intermediate: 0.6, advanced: 0.3 },
        runsByDifficulty: {},
      });
      const tiny = cloneArea(base, {
        id: 'chk-tiny',
        name: 'Tiny area, big novice share',
        kmTotal: 8,
        terrainMix: { novice: 0.4, easy: 0.3, intermediate: 0.3 },
        runsByDifficulty: {},
      });
      const c: SearchCriteria = { ability: 'first_timer' };
      const bigRaw = factor(scoreArea(big, c, ctx), 'abilityFit')?.raw ?? 0;
      const tinyRaw = factor(scoreArea(tiny, c, ctx), 'abilityFit')?.raw ?? 0;
      return bigRaw > tinyRaw
        ? null
        : `abilityFit: 10 km of novice terrain in a 200 km area scored ${bigRaw.toFixed(4)}, 3.2 km in an 8 km area scored ${tinyRaw.toFixed(4)}`;
    },
  },
  {
    id: 'S02',
    name: 'unverified curated data cannot change a score by even a fraction of a point',
    run: (areas, ctx) => {
      const base = areas.find((a) => ctx.israelProfiles?.[a.id] == null) ?? areas[0]!;
      const plain = cloneArea(base, { id: 'chk-plain' });
      const withUnverified = cloneArea(base, { id: 'chk-unverified' });
      const c: SearchCriteria = { wantKosher: true, wantHebrewSkiSchool: true, wantApres: true, wantFamily: true };
      const ctx2: ScoringContext = {
        ...ctx,
        israelProfiles: {
          ...(ctx.israelProfiles ?? {}),
          'chk-unverified': {
            skiAreaId: 'chk-unverified',
            kosherAvailability: 3,
            kosherNotes: null,
            chabadDistanceKm: 1,
            chabadName: null,
            hebrewSkiSchool: true,
            hebrewSkiSchoolNotes: null,
            shabbatNotes: null,
            apresLevel: 3,
            familyScore: 3,
            israeliGatewayAirports: [],
            provenance: { source: 'curated', fetchedAt: '2026-07-26T00:00:00.000Z', verification: 'unverified' },
          },
        },
      };
      const a = scoreArea(plain, c, ctx2).score;
      const b = scoreArea(withUnverified, c, ctx2).score;
      return Math.abs(a - b) < 1e-9
        ? null
        : `an unverified profile moved the score from ${a} to ${b} — unverified data must never rank`;
    },
  },
  {
    id: 'S03',
    name: 'a missing field scores neutral, strictly between a documented no and a documented yes',
    run: (areas, ctx) => {
      const base = areas[0]!;
      const c: SearchCriteria = { wantNightSki: true };
      const yes = factor(scoreArea(cloneArea(base, { id: 'y', hasNightSki: true }), c, ctx), 'nightSki')?.raw ?? -1;
      const unk = factor(scoreArea(cloneArea(base, { id: 'u', hasNightSki: null }), c, ctx), 'nightSki')?.raw ?? -1;
      const no = factor(scoreArea(cloneArea(base, { id: 'n', hasNightSki: false }), c, ctx), 'nightSki')?.raw ?? -1;
      return yes > unk && unk > no ? null : `nightSki raws were yes=${yes}, unknown=${unk}, no=${no}`;
    },
  },
  {
    id: 'S04',
    name: 'a snowmaking zero is a data gap in EVERY country — no nationality penalty',
    run: (areas, ctx) => {
      /*
       * `piste:snowmaking` is on 0.7% of runs worldwide, and missing on 309 of
       * 310 Italian areas in our own Stage 0 QA report. An earlier version of
       * the scorer had a per-country allow-list, which quietly read those 309
       * Italian zeros as "we checked and there is none". Two identical resorts
       * reporting zero must score identically wherever they are.
       */
      const base = areas[0]!;
      const shared = { topElevM: 2200, baseElevM: 1200, verticalM: 1000, kmTotal: 50, snowmakingKm: 0 };
      const countries = ['BG', 'GE', 'IT', 'AT', 'FR', 'CH', 'JP', null];
      const scores = countries.map((country) => {
        const r = scoreArea(cloneArea(base, { id: `chk-${country ?? 'null'}`, country, ...shared }), { wantSnowsure: true }, ctx);
        return { country, f: factor(r, 'snowReliability') };
      });
      for (const { country, f } of scores) {
        if (!f) return 'snowReliability factor missing';
        if (!f.dataMissing) return `a snowmaking zero in ${country} was read as a fact rather than a gap`;
        if (!/could not establish/.test(f.reason)) return `${country} reason implies there is no snowmaking: "${f.reason}"`;
      }
      const raws = scores.map((s) => s.f!.raw);
      const spread = Math.max(...raws) - Math.min(...raws);
      if (spread > 1e-9) {
        return `identical resorts scored differently by country: ${scores.map((s) => `${s.country}=${s.f!.raw.toFixed(4)}`).join(', ')}`;
      }
      // And positive evidence must still count for something.
      const withSnowmaking = scoreArea(
        cloneArea(base, { id: 'chk-sm', country: 'IT', ...shared, snowmakingKm: 40 }),
        { wantSnowsure: true },
        ctx,
      );
      const smF = factor(withSnowmaking, 'snowReliability');
      if (!smF) return 'snowReliability factor missing';
      if (smF.dataMissing) return 'a resort with real snowmaking coverage was still flagged as a data gap';
      return smF.raw > raws[0]! ? null : `mapped snowmaking (${smF.raw.toFixed(4)}) did not beat an unknown (${raws[0]!.toFixed(4)})`;
    },
  },
  {
    id: 'S05',
    name: 'scoring is deterministic — same input, byte-identical output',
    run: (areas, ctx) => {
      const c = parseQueryDeterministic('cheap beginner resort in Bulgaria with night skiing and kosher food');
      const a = JSON.stringify(areas.map((x) => scoreArea(x, c, ctx).score));
      const b = JSON.stringify(areas.map((x) => scoreArea(x, c, ctx).score));
      return a === b ? null : 'two identical runs produced different scores';
    },
  },
  {
    id: 'S06',
    name: 'a group scores no higher than its weakest member alone',
    run: (areas, ctx) => {
      for (const area of areas) {
        const solo = factor(scoreArea(area, { ability: 'first_timer' }, ctx), 'abilityFit')?.raw ?? 0;
        const group = factor(scoreArea(area, { groupAbilities: ['first_timer', 'expert'] }, ctx), 'abilityFit')?.raw ?? 0;
        if (group > solo + 1e-9) {
          return `${area.name}: group scored ${group.toFixed(4)} but the first timer alone scored ${solo.toFixed(4)}`;
        }
      }
      return null;
    },
  },
  {
    id: 'S07',
    name: 'a query with no criteria at all still returns a sane, explained ranking',
    run: (areas, ctx) => {
      const res = scoreArea(areas[0]!, {}, ctx);
      if (res.factors.length === 0) return 'no factors applied to a bare query';
      const sum = res.factors.reduce((s, f) => s + f.weight, 0);
      if (Math.abs(sum - 100) > 0.001) return `weights summed to ${sum}`;
      return null;
    },
  },
  {
    id: 'S09',
    name: 'no resort can be the best answer to BOTH "quiet slopes" and "no lift queues"',
    run: (areas, ctx) => {
      /*
       * This is the invariant that would have caught the original bug. The two
       * questions are answered by the same field read with opposite signs, so
       * one resort winning both means one of them is not being honoured.
       */
      const quiet = search(areas, { wantUncrowded: true }, ctx);
      const queues = search(areas, { wantShortLiftQueues: true }, ctx);
      const q1 = quiet.results[0];
      const l1 = queues.results[0];
      if (!q1 || !l1) return 'one of the two searches returned nothing';
      if (q1.area.id === l1.area.id) {
        return `${q1.area.name} won both "quiet slopes" and "no lift queues" — one of them is not being scored`;
      }
      const qd = q1.area.capacityPerKm ?? 0;
      const ld = l1.area.capacityPerKm ?? 0;
      if (!(qd < ld)) {
        return `the "quiet" winner (${q1.area.name}, ${qd} people/h per km) is not less dense than the "no queues" winner (${l1.area.name}, ${ld})`;
      }
      // And the two factors must move in opposite directions on the same area.
      const sample = areas.find((x) => (x.capacityPerKm ?? 0) > 0);
      if (sample) {
        const a = factor(scoreArea(sample, { wantUncrowded: true }, ctx), 'slopeQuiet')?.raw ?? 0;
        const b = factor(scoreArea(sample, { wantShortLiftQueues: true }, ctx), 'liftQueues')?.raw ?? 0;
        const denser = cloneArea(sample, { id: 'chk-denser', capacityPerKm: (sample.capacityPerKm ?? 0) * 2 });
        const a2 = factor(scoreArea(denser, { wantUncrowded: true }, ctx), 'slopeQuiet')?.raw ?? 0;
        const b2 = factor(scoreArea(denser, { wantShortLiftQueues: true }, ctx), 'liftQueues')?.raw ?? 0;
        if (!(a2 < a)) return `doubling the density did not make slopeQuiet worse (${a.toFixed(4)} -> ${a2.toFixed(4)})`;
        if (!(b2 > b)) return `doubling the density did not make liftQueues better (${b.toFixed(4)} -> ${b2.toFixed(4)})`;
      }
      return null;
    },
  },
  {
    id: 'S10',
    name: 'name matching changes no criteria-based query — G01 to G20 keep their winners',
    run: (areas, ctx) => {
      /*
       * THE regression that matters. An over-eager matcher would quietly wreck
       * every criteria-based query, and those are the product. Name matching
       * keys off `rawQuery`, so blanking it gives us the pre-matching ranking
       * to compare against.
       */
      const broken: string[] = [];
      for (const q of GOLDEN_QUERIES) {
        // G21/G22/G23 name a resort and are SUPPOSED to change. G24 deliberately
        // stays in: an ordinary word buried in prose must leave the ranking alone,
        // which is exactly what this check measures.
        if (q.id === 'G21' || q.id === 'G22' || q.id === 'G23') continue;
        const criteria = { ...parseQueryDeterministic(q.text), ...(q.override ?? {}) };
        const withMatching = search(areas, criteria, ctx).results[0];
        const withoutMatching = search(areas, { ...criteria, rawQuery: undefined }, ctx).results[0];
        if (!withMatching || !withoutMatching) continue;
        if (withMatching.area.id !== withoutMatching.area.id) {
          broken.push(
            `${q.id}: "${withoutMatching.area.name}" -> "${withMatching.area.name}" (pinned on "${withMatching.nameMatch?.matched}")`,
          );
        }
      }
      return broken.length === 0 ? null : `name matching changed the winner of ${broken.length} query(s): ${broken.join('; ')}`;
    },
  },
  {
    id: 'S11',
    name: 'name matching folds accents, respects word boundaries, and ignores short names',
    run: (areas) => {
      const alta = areas.find((a) => a.aliases.some((x) => /gr[öo]den/i.test(x)));
      if (alta) {
        // Diacritics must fold in BOTH directions: nobody types the diaeresis.
        for (const typed of ['groden', 'Gröden', 'selva', 'urtijei']) {
          if (!alta.aliases.some((x) => normaliseForMatch(x) === normaliseForMatch(typed))) continue;
          if (matchAreaName(alta, typed) == null) return `"${typed}" did not match an alias it folds to`;
        }
      }
      const sample = areas[0]!;
      // Word boundaries: an alias must not match inside a longer word.
      const probe = { ...sample, name: 'Selva', aliases: [] };
      if (matchAreaName(probe, 'selvage industry') != null) return '"Selva" matched inside "selvage"';
      if (matchAreaName(probe, 'we love selva') == null) return '"Selva" failed to match as a whole word';
      // Below the minimum length, nothing pins.
      const short = { ...sample, name: 'Val', aliases: ['Ax'] };
      if (matchAreaName(short, 'val thorens and ax') != null) return 'a 3-character name was allowed to pin';
      // Longest match wins when several fire.
      const multi = { ...sample, name: 'Selva', aliases: ['Selva di Val Gardena'] };
      const m = matchAreaName(multi, 'skiing in selva di val gardena next week');
      if (m?.matched !== 'Selva di Val Gardena') return `expected the longest alias to win, got "${m?.matched}"`;

      // Ordinary-word names pin only on an exact query, in any casing or
      // spacing, and never when embedded in prose.
      const ambiguous = { ...sample, name: 'Crystal', aliases: [] };
      for (const exact of ['Crystal', 'crystal', '  CRYSTAL  ']) {
        if (matchAreaName(ambiguous, exact) == null) return `"${exact}" should pin the resort named Crystal`;
      }
      for (const prose of ['crystal clear snow for beginners', 'looking for crystal snow', 'crystal clear']) {
        const hit = matchAreaName(ambiguous, prose);
        if (hit != null) return `"${prose}" falsely pinned Crystal via "${hit.matched}"`;
      }
      // The guard is scoped to the ambiguous set — ordinary resort names must
      // keep matching inside a sentence.
      const normal = { ...sample, name: 'Livigno', aliases: [] };
      if (matchAreaName(normal, 'is livigno good for beginners') == null) {
        return 'the ambiguous-name guard leaked onto an ordinary resort name';
      }
      return null;
    },
  },
  {
    id: 'S08',
    name: 'the parser never throws, whatever it is fed',
    run: () => {
      const inputs = ['', '   ', '???', '🎿🎿🎿', 'a'.repeat(5000), '100km+ under €50 a day in IT for an expert', 'עד 4 שעות מסופיה'];
      for (const i of inputs) {
        try {
          parseQueryDeterministic(i);
        } catch (err) {
          return `threw on ${JSON.stringify(i.slice(0, 40))}: ${String(err)}`;
        }
      }
      return null;
    },
  },
];
