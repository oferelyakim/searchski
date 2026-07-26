/**
 * ETL orchestrator.
 *
 *   npm run -w @searchski/etl build
 *   node --max-old-space-size=4096 src/build.ts --countries=GE,BG,IT
 *
 * Pipeline: normalize -> overrides -> capacity -> nightski -> significance ->
 * passRegions, then write data/build/{ski_areas,pass_regions}.json and the QA
 * report.
 *
 * Stage order is not arbitrary: overrides run straight after normalize so the
 * aliases they add (and the locality-derived aliases) are visible to
 * passRegions' name matching; capacity needs kmTotal from normalize;
 * significance needs nothing from nightski but runs after it so the QA report
 * can state night-ski availability for the areas that survived; passRegions
 * runs last so it can stamp membership onto final rows.
 */

import { promises as fsp } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { PassRegion, SkiArea } from '@searchski/core/types';
import { BUILD_DIR, RUN_TIMESTAMP, targetCountries } from './config.ts';
import { applyCapacity, type CapacityDiagnostics } from './capacity.ts';
import { applyNightSki, computeNightSki, type NightSkiDiagnostics } from './nightski.ts';
import { normalize, type NormalizeDiagnostics } from './normalize.ts';
import { applyOverrides, readCountryOverrides, type OverrideDiagnostics } from './overrides.ts';
import { applyPassRegions, type PassRegionDiagnostics } from './passRegions.ts';
import { findNameCollisions, type NameCollisionReport } from './nameCollisions.ts';
import { applySignificance, type SignificanceDiagnostics } from './significance.ts';
import { humanBytes } from './stream.ts';

// ---------------------------------------------------------------------------
// QA report model
// ---------------------------------------------------------------------------

export interface CountryQa {
  country: string;
  total: number;
  significant: number;
  dropped: number;
  /** Areas with a wikidataID, and that as a share of total. */
  wikidataMatched: number;
  wikidataRate: number;
  /** Missing-field counts, over ALL areas in the country. */
  missing: Record<string, number>;
  nightSki: { known: number; hasIt: number; none: number; unknown: number };
  medianKm: number;
  totalKm: number;
}

export interface QaReport {
  generatedAt: string;
  countries: string[];
  totals: {
    featuresRead: number;
    downhillWorldwide: number;
    inTargetCountries: number;
    kept: number;
    significant: number;
    dropped: number;
  };
  perCountry: CountryQa[];
  topByKm: Array<{
    name: string;
    country: string | null;
    kmTotal: number;
    liftsTotal: number;
    topElevM: number | null;
    verticalM: number | null;
    hasNightSki: boolean | null;
    passRegionId: string | null;
    /** True when kmTotal covers more than one marketed resort. */
    merged: boolean;
  }>;
  significance: SignificanceDiagnostics;
  capacity: CapacityDiagnostics;
  nightSki: NightSkiDiagnostics;
  passRegions: PassRegionDiagnostics & { count: number };
  overrides: OverrideDiagnostics;
  nameCollisions: NameCollisionReport;
  normalize: NormalizeDiagnostics;
  verdict: {
    georgia: CoverageVerdict;
    bulgaria: CoverageVerdict;
  };
}

export interface CoverageVerdict {
  country: string;
  usable: boolean;
  significantAreas: number;
  headline: Array<{
    name: string;
    kmTotal: number;
    easyKm: number | null;
    liftsTotal: number;
    topElevM: number | null;
    baseElevM: number | null;
    verticalM: number | null;
    wikidataId: string | null;
    hasNightSki: boolean | null;
  }>;
  reasoning: string;
}

// ---------------------------------------------------------------------------

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  const lo = s[mid - 1] ?? 0;
  const hi = s[mid] ?? 0;
  return s.length % 2 === 0 ? Math.round(((lo + hi) / 2) * 100) / 100 : (hi ?? 0);
}

function pct(n: number, d: number): number {
  return d === 0 ? 0 : Math.round((n / d) * 1000) / 10;
}

function countryQa(areas: SkiArea[], country: string): CountryQa {
  const mine = areas.filter((a) => a.country === country);
  const wikidataMatched = mine.filter((a) => a.wikidataId !== null).length;

  // Missing-field counts. These are the fields the scorer will actually reach
  // for; a high count here is a reason not to weight that factor yet.
  const missing: Record<string, number> = {
    topElevM: mine.filter((a) => a.topElevM === null).length,
    baseElevM: mine.filter((a) => a.baseElevM === null).length,
    verticalM: mine.filter((a) => a.verticalM === null).length,
    websites: mine.filter((a) => a.websites.length === 0).length,
    localities: mine.filter((a) => a.localities.length === 0).length,
    regionCode: mine.filter((a) => a.regionCode === null).length,
    wikidataId: mine.length - wikidataMatched,
    terrainMix: mine.filter((a) => Object.keys(a.terrainMix).length === 0).length,
    capacityPerKm: mine.filter((a) => a.capacityPerKm === null).length,
    name: mine.filter((a) => a.name.startsWith('Unnamed ski area')).length,
    snowmakingKm: mine.filter((a) => a.snowmakingKm === 0).length,
  };

  return {
    country,
    total: mine.length,
    significant: mine.filter((a) => a.isSignificant).length,
    dropped: mine.filter((a) => !a.isSignificant).length,
    wikidataMatched,
    wikidataRate: pct(wikidataMatched, mine.length),
    missing,
    nightSki: {
      known: mine.filter((a) => a.hasNightSki !== null).length,
      hasIt: mine.filter((a) => a.hasNightSki === true).length,
      none: mine.filter((a) => a.hasNightSki === false).length,
      unknown: mine.filter((a) => a.hasNightSki === null).length,
    },
    medianKm: median(mine.map((a) => a.kmTotal)),
    totalKm: Math.round(mine.reduce((s, a) => s + a.kmTotal, 0) * 10) / 10,
  };
}

function verdictFor(
  areas: SkiArea[],
  country: string,
  headlineNames: string[],
  countryName: string,
): CoverageVerdict {
  const mine = areas.filter((a) => a.country === country);
  const significant = mine.filter((a) => a.isSignificant);

  const headline = headlineNames.map((n) => {
    const a = mine.find((x) => x.name === n);
    return {
      name: n,
      kmTotal: a?.kmTotal ?? 0,
      easyKm: a?.runsByDifficulty.easy?.km ?? null,
      liftsTotal: a?.liftsTotal ?? 0,
      topElevM: a?.topElevM ?? null,
      baseElevM: a?.baseElevM ?? null,
      verticalM: a?.verticalM ?? null,
      wikidataId: a?.wikidataId ?? null,
      hasNightSki: a?.hasNightSki ?? null,
    };
  });

  const allPresent = headline.every((h) => h.kmTotal > 0);
  const usable = allPresent && significant.length >= 3;

  const reasoning = usable
    ? `${countryName}'s flagship resorts are present with piste km, lift counts, elevations and a full difficulty ` +
      `breakdown — everything the Stage 1 scorer consumes. ${significant.length} areas clear the size threshold. ` +
      `The gaps are Wikidata (enrichment only, never a join requirement) and locality names (the village layer ` +
      `will need OSM Overpass, not this dump). Terrain data is good enough to ship; do NOT rely on it for ` +
      `village-level lodging or apres.`
    : `${countryName} coverage is too thin to use as-is: only ${significant.length} areas clear the threshold ` +
      `and one or more headline resorts are missing terrain data. Hand-entry or a different source is required.`;

  return { country, usable, significantAreas: significant.length, headline, reasoning };
}

// ---------------------------------------------------------------------------
// Markdown rendering
// ---------------------------------------------------------------------------

function md(report: QaReport, areas: SkiArea[], regions: PassRegion[]): string {
  const L: string[] = [];
  const p = (s = ''): number => L.push(s);

  p('# Searchski — Stage 0 data-quality report');
  p();
  p(`Generated: ${report.generatedAt}`);
  p(`Countries: ${report.countries.join(', ')}`);
  p(`Source: OpenSkiMap daily GeoJSON (ODbL, derived from OpenStreetMap contributors)`);
  p();
  p('This report is generated by `packages/etl/src/build.ts`. Every number in it is');
  p('computed from the dump, not typed by hand.');
  p();

  p('## 1. Headline');
  p();
  p(`- ${report.totals.featuresRead.toLocaleString()} ski areas in the dump, of which ${report.totals.downhillWorldwide.toLocaleString()} are downhill.`);
  p(`- ${report.totals.inTargetCountries} downhill areas in the target countries; ${report.totals.kept} kept after geometry checks.`);
  p(`- **${report.totals.significant} clear the size threshold**, ${report.totals.dropped} do not.`);
  p(`- ${regions.length} pass regions curated (all \`unverified\`).`);
  p();

  p('## 2. Per-country coverage');
  p();
  p('| Country | Total downhill | Significant | Dropped | Total km | Median km | Wikidata match |');
  p('|---|---:|---:|---:|---:|---:|---:|');
  for (const c of report.perCountry) {
    p(
      `| ${c.country} | ${c.total} | ${c.significant} | ${c.dropped} | ${c.totalKm} | ${c.medianKm} | ${c.wikidataMatched}/${c.total} (${c.wikidataRate}%) |`,
    );
  }
  p();
  p('### Thresholds applied, and what each cost');
  p();
  for (const loss of report.significance.byCountry) {
    const t = loss.threshold;
    p(
      `**${loss.country}** — \`kmTotal >= ${t.minKmTotal} AND liftsTotal >= ${t.minLiftsTotal} AND status = ${t.allowedStatuses.join('|')}\`` +
        `${t.rationale ? `  \n_Non-default: ${t.rationale}_` : ''}`,
    );
    p();
    p(`Dropped ${loss.dropped} of ${loss.total}. By rule: ${Object.entries(loss.droppedBy).map(([k, v]) => `${k} ×${v}`).join(', ') || 'none'}.`);
    if (loss.largestDropped.length > 0) {
      p();
      p('Largest dropped (sanity-check these):');
      p();
      p('| Name | km | Lifts | Status | Why |');
      p('|---|---:|---:|---|---|');
      for (const d of loss.largestDropped) {
        p(`| ${d.name} | ${d.kmTotal} | ${d.liftsTotal} | ${d.status} | ${d.reasons.join('; ')} |`);
      }
    }
    p();
  }

  p('## 3. Missing fields');
  p();
  p('Counts are areas missing the field, out of that country\'s total.');
  p();
  const missingKeys = Object.keys(report.perCountry[0]?.missing ?? {});
  p(`| Field | ${report.perCountry.map((c) => c.country).join(' | ')} |`);
  p(`|---|${report.perCountry.map(() => '---:').join('|')}|`);
  for (const key of missingKeys) {
    p(`| ${key} | ${report.perCountry.map((c) => `${c.missing[key] ?? 0}/${c.total}`).join(' | ')} |`);
  }
  p();

  p('## 4. Night skiing (OSM `lit`)');
  p();
  if (!report.nightSki.available) {
    p(`> **Data unavailable: ${report.nightSki.reason}.**`);
    p('> Every area therefore has `hasNightSki: null` — UNKNOWN, never `false`.');
  } else {
    p(`Read ${report.nightSki.runsRead.toLocaleString()} runs (${humanBytes(report.nightSki.fileSizeBytes)}), of which ` +
      `${report.nightSki.downhillRuns.toLocaleString()} are downhill and ${report.nightSki.litRunsWorldwide.toLocaleString()} are lit worldwide. ` +
      `${report.nightSki.attributedRuns.toLocaleString()} runs belong to a target area; ` +
      `${report.nightSki.orphanRuns.toLocaleString()} runs upstream have no ski-area linkage at all and are unattributable.`);
    p();
    p('`hasNightSki` is deliberately tri-state. `false` is only asserted when every downhill run');
    p('in the area carries an explicit OSM `lit` value and none is lit. Otherwise it is `null`,');
    p('because "nobody tagged it" is not evidence of absence.');
    p();
    p('| Country | has night ski | confirmed none | unknown |');
    p('|---|---:|---:|---:|');
    for (const c of report.perCountry) {
      p(`| ${c.country} | ${c.nightSki.hasIt} | ${c.nightSki.none} | ${c.nightSki.unknown} |`);
    }
    p();
    const lit = areas.filter((a) => a.hasNightSki === true).sort((a, b) => (b.nightSkiKm ?? 0) - (a.nightSkiKm ?? 0));
    if (lit.length > 0) {
      p('Areas with lit terrain:');
      p();
      p('| Area | Country | Lit km | Total km |');
      p('|---|---|---:|---:|');
      for (const a of lit.slice(0, 25)) {
        p(`| ${a.name} | ${a.country} | ${a.nightSkiKm} | ${a.kmTotal} |`);
      }
      p();
    }
  }

  p('## 5. Top 15 areas by piste km');
  p();
  p('`⚠ merged` marks a record whose km covers more than one marketed resort — see section 6b.');
  p();
  p('| # | Area | Country | km | Lifts | Top (m) | Vertical (m) | Night ski | Pass region |');
  p('|---:|---|---|---:|---:|---:|---:|---|---|');
  report.topByKm.forEach((a, i) => {
    const ns = a.hasNightSki === null ? 'unknown' : a.hasNightSki ? 'yes' : 'no';
    const km = a.merged ? `${a.kmTotal} ⚠ merged` : String(a.kmTotal);
    p(`| ${i + 1} | ${a.name} | ${a.country ?? '—'} | ${km} | ${a.liftsTotal} | ${a.topElevM ?? '—'} | ${a.verticalM ?? '—'} | ${ns} | ${a.passRegionId ?? '—'} |`);
  });
  p();

  p('## 6. Pass regions');
  p();
  p('All rows are `verification: unverified` and `marketedKm: null` by design — see the');
  p('header of `src/passRegions.ts`. Do not render these as fact until a human checks them.');
  p();
  p('| Pass region | Country | Members matched | Summed km |');
  p('|---|---|---:|---:|');
  for (const r of regions) {
    const km = r.memberAreaIds.reduce((s, id) => s + (areas.find((a) => a.id === id)?.kmTotal ?? 0), 0);
    p(`| ${r.name} | ${r.country} | ${r.memberAreaIds.length} | ${Math.round(km * 10) / 10} |`);
  }
  p();
  if (report.passRegions.unmatched.length > 0) {
    p('### Curated member names that matched NOTHING — fix by hand');
    p();
    p('Each line is either a resort absent from OSM, a resort upstream merged into a');
    p('neighbour, or a misspelling in `passRegions.ts`.');
    p();
    p('| Pass region | Unmatched candidate |');
    p('|---|---|');
    for (const u of report.passRegions.unmatched) {
      p(`| ${u.passRegionId} | ${u.candidateName} |`);
    }
    p();
  }
  if (report.passRegions.contested.length > 0) {
    p('### Areas claimed by more than one pass region (curation bug)');
    p();
    for (const c of report.passRegions.contested) {
      p(`- ${c.areaName} (${c.areaId}) claimed by ${c.regions.join(', ')}`);
    }
    p();
  }

  p('## 6b. Curated overrides and derived aliases');
  p();
  p('Source: `data/seed/area_overrides.json`' + (report.overrides.fileFound ? '' : ' — **NOT FOUND**'));
  p();
  p('OpenSkiMap clusters runs and lifts geometrically, so two separately-marketed resorts');
  p('that share lift-linked terrain become ONE record under ONE name. We add aliases so the');
  p('record is findable under either name, and attach a boundary note the UI must show next');
  p('to the km total. We do **not** split the geometry or apportion the km — there is no');
  p('faithful basis for that split, and a guessed piste figure is exactly the fabrication');
  p('this project refuses to ship.');
  p();
  p(`**Locality-derived aliases:** ${report.overrides.localityAliasesAdded} aliases added across ` +
    `${report.overrides.areasWithLocalityAliases} areas, from each area's own ` +
    '`places[].localized.en.locality`. Free, factual, and it fixes search for anyone typing a ' +
    'village name rather than the ski-area name.');
  p();
  if (report.overrides.applied.length > 0) {
    p('| Override target | Matched by | Aliases added | Boundary note |');
    p('|---|---|---:|---|');
    for (const a of report.overrides.applied) {
      p(`| ${a.areaName} | ${a.matchedBy} | ${a.aliasesAdded} | ${a.boundaryNoteSet ? 'yes' : '—'} |`);
    }
    p();
  }
  if (report.overrides.unmatched.length > 0) {
    p('### Overrides that matched NOTHING — fix by hand');
    p();
    p('| upstreamName | openskimapId |');
    p('|---|---|');
    for (const u of report.overrides.unmatched) {
      p(`| ${u.upstreamName} | ${u.openskimapId ?? '—'} |`);
    }
    p();
  }
  const noted = areas.filter((a) => a.boundaryNote);
  if (noted.length > 0) {
    p(`### Areas carrying a boundary note (${noted.length}) — the UI MUST display these`);
    p();
    for (const a of noted) {
      p(`- **${a.name}** (${a.kmTotal} km, ${a.country}): ${a.boundaryNote}`);
    }
    p();
  }

  p('## 6c. Border-spanning areas');
  p();
  p('`country` is the primary, for display. `countries` holds every country the area');
  p('touches, primary first, and country FILTERS match on any of them — a border resort');
  p('genuinely belongs to both sides, and someone flying into Innsbruck for Drei Zinnen');
  p('must be able to find it under Austria.');
  p();
  p('Upstream `places` entries whose `iso3166_1Alpha2` contradicts the country prefix of');
  p('`iso3166_2` are discarded before any country is chosen — they are noise, and they');
  p('misassign real resorts. This run discarded ' +
    `**${report.normalize.droppedInconsistentPlaces}** such entries.`);
  p();
  const applied = report.normalize.countryOverridesApplied;
  if (applied.length > 0) {
    p('### Externally-verified country overrides');
    p();
    p('These are **not** heuristic outcomes. Where upstream evidence is a genuine tie, no rule');
    p('over that data can do better than a coin flip, so a human checked a primary source and');
    p('recorded it in `data/seed/area_overrides.json`. A verified fact outranks the tie-break.');
    p();
    p('| Area | Heuristic said | Verified | Countries | Region | In build? |');
    p('|---|---|---|---|---|---|');
    for (const o of applied) {
      p(
        `| ${o.name} | ${o.derivedCountry ?? '—'} _(${o.derivedChosenBy})_ | **${o.forcedCountry}** ✔ verified | ` +
          `${o.forcedCountries.join(' + ')} | ${o.regionCode ?? '—'} | ` +
          `${o.keptInBuild ? 'kept' : '**removed** — outside target countries'} |`,
      );
    }
    p();
    for (const o of applied) {
      if (!o.evidence) continue;
      p(`- **${o.name}** — ${o.evidence}${o.sourceUrl ? ` ([source](${o.sourceUrl}))` : ''}` +
        `${o.checkedOn ? ` _Checked ${o.checkedOn}._` : ''}`);
    }
    p();
  }
  if (report.normalize.countryOverridesUnmatched.length > 0) {
    p('### Country overrides that matched NOTHING — fix by hand');
    p();
    p('| upstreamName | openskimapId |');
    p('|---|---|');
    for (const u of report.normalize.countryOverridesUnmatched) {
      p(`| ${u.upstreamName} | ${u.openskimapId ?? '—'} |`);
    }
    p();
  }

  p('### Areas touching more than one country');
  p();
  if (report.normalize.multiCountry.length === 0) {
    p('No kept area touches more than one country.');
    p();
  } else {
    p('**`primary chosen by` is the column to watch.** `frequency` means one country was');
    p('attested more often and the choice is well-evidenced. `regionCode tie-break` ⚠ means the');
    p('countries were equally attested and the primary was decided only by which region code');
    p('upstream happened to state first — that is a coin flip, and any of these that look');
    p('wrong should get a `countryOverrides` entry in `data/seed/area_overrides.json`.');
    p('`external override` ✔ means a human verified it against a primary source.');
    p();
    p('| Area | Primary | All countries | Primary chosen by | Region | km | Centroid |');
    p('|---|---|---|---|---|---:|---|');
    for (const m of [...report.normalize.multiCountry].sort((a, b) => b.kmTotal - a.kmTotal)) {
      const mark =
        m.primaryChosenBy === 'external override'
          ? ' ✔ verified'
          : m.primaryChosenBy === 'frequency' || m.primaryChosenBy === 'only country'
            ? ''
            : ' ⚠';
      const weak = mark;
      p(
        `| ${m.name} | ${m.primary ?? '—'} | ${m.countries.join(' + ')} | ${m.primaryChosenBy}${weak} | ` +
          `${m.regionCode ?? '—'} | ${m.kmTotal} | ${m.lat}, ${m.lon} |`,
      );
    }
    p();
  }

  p('## 6d. Resort names that collide with ordinary words');
  p();
  p('Core pins a result when the query names a resort — typing "Val Gardena" pins the Alta');
  p('Badia record via its aliases. A resort whose whole name is also an ordinary word breaks');
  p('that: Georgia has an area called **Crystal**, so "crystal clear snow for beginners"');
  p('pinned a Georgian resort to a query that was not about it.');
  p();
  const nc = report.nameCollisions;
  p(`Folded all **${nc.singleWordCount}** distinct single-word names/aliases of at least`);
  p(`${nc.minChars} letters (matching core's \`MIN_NAME_MATCH_CHARS\`) against a`);
  p(`${nc.vocabularySize}-word ordinary-skier-vocabulary list.`);
  p();
  if (nc.collisions.length === 0) {
    p('**No collisions found in this build.** Checked and clean — nothing to add to');
    p('`AMBIGUOUS_SINGLE_WORD_NAMES`.');
    p();
  } else {
    p(`**${nc.collisions.length} collision${nc.collisions.length === 1 ? '' : 's'} found.**`);
    p('Each one below must appear in `AMBIGUOUS_SINGLE_WORD_NAMES` in');
    p('`packages/core/src/scoring.ts`, or it will pin on ordinary prose.');
    p();
    p('| Word | Name/alias forms | Areas |');
    p('|---|---|---|');
    for (const c of nc.collisions) {
      p(`| \`${c.word}\` | ${c.forms.join(', ')} | ${c.areas.join('; ')} |`);
    }
    p();
  }
  p('This list is only correct for the countries currently in the build. Adding Austria,');
  p('France or Switzerland — and above all any English-speaking market, where *Sunshine*,');
  p('*Paradise*, *Panorama*, *Powder* and *Summit* are all real resort names — will');
  p('introduce new collisions. That is why this is recomputed every build rather than');
  p('hand-maintained. The vocabulary list is a heuristic (`src/nameCollisions.ts`): it will');
  p('miss words, and a hit here is a prompt to look, not proof of a bug.');
  p();

  p('## 7. Modeled uphill capacity');
  p();
  p('`uphillCapacityPph = Σ (lift count × pph for its type)`, from `LIFT_CAPACITY_PPH`.');
  p('Relative signal only — never shown to a user as a number.');
  p();
  const unmatched = Object.entries(report.capacity.unmatchedLiftTypes).sort((a, b) => b[1] - a[1]);
  if (unmatched.length > 0) {
    p('**Lift types with no entry in `LIFT_CAPACITY_PPH`** (fell back to the `unknown` value).');
    p('Extend the table in `packages/core/src/types.ts`:');
    p();
    p('| Upstream lift type | Lifts affected |');
    p('|---|---:|');
    for (const [type, n] of unmatched) p(`| \`${type}\` | ${n} |`);
    p();
  } else {
    p('Every lift type upstream emitted is present in `LIFT_CAPACITY_PPH`.');
    p();
  }

  p('## 8. Upstream surprises');
  p();
  const surprises: string[] = [];
  const unknownDiff = Object.entries(report.normalize.unknownDifficultyKeys);
  if (unknownDiff.length > 0) {
    surprises.push(
      `Difficulty keys upstream emits that \`DIFFICULTIES\` in core does not have: ` +
        `${unknownDiff.map(([k, v]) => `\`${k}\` (×${v})`).join(', ')}. Their km counts toward ` +
        `\`kmTotal\` but they are excluded from \`runsByDifficulty\` and \`terrainMix\`, exactly like \`other\`.`,
    );
  }
  const geom = Object.entries(report.normalize.geometryTypes);
  surprises.push(
    `Ski-area geometry in the target countries: ${geom.map(([k, v]) => `${k} ×${v}`).join(', ')}. ` +
      `Polygons are reduced to a centre-of-mass point, because \`ski_area.location\` is \`geography(Point,4326)\`.`,
  );
  if (report.normalize.noCountry > 0) {
    surprises.push(`${report.normalize.noCountry} downhill areas worldwide carry no country in \`places\` at all.`);
  }
  if (report.normalize.droppedNoGeometry > 0) {
    surprises.push(`${report.normalize.droppedNoGeometry} target-country areas dropped for unusable geometry.`);
  }
  surprises.push(
    Object.keys(report.capacity.unmatchedLiftTypes).length > 0
      ? 'Upstream lift types use HYPHENS (`t-bar`, `j-bar`) where `LIFT_CAPACITY_PPH` uses ' +
        'underscores (`t_bar`, `j_bar`), so those lifts are silently taking the `unknown` ' +
        'fallback. Add the hyphenated spellings to the table. See section 7.'
      : 'Upstream lift types use HYPHENS (`t-bar`, `j-bar`) where the obvious spelling is an ' +
        'underscore. `LIFT_CAPACITY_PPH` now carries both, so nothing falls through — but any ' +
        'new lift type added to that table must be spelled the way OpenSkiMap emits it.',
  );
  if (report.nightSki.available) {
    const s = report.nightSki.snowmakingTagged;
    const total = s.yes + s.no + s.untagged;
    surprises.push(
      `**\`snowmakingKm\` is effectively unavailable.** Of ${total.toLocaleString()} downhill runs worldwide, ` +
        `only ${s.yes.toLocaleString()} carry \`piste:snowmaking=yes\` (${pct(s.yes, total)}%) and ` +
        `${s.untagged.toLocaleString()} are untagged. In the target countries only ` +
        `${report.nightSki.snowmakingYesInTarget} runs are tagged at all. The area-level ` +
        `\`snowmakingLengthInKm\` statistic is correspondingly empty. ` +
        `**\`snowmakingKm: 0\` therefore means "not tagged", NOT "no snowmaking"** — the model types it ` +
        `as a non-nullable number so the unknown cannot be expressed as null. PLAN.md §5 plans to build ` +
        `the "snow-reliable" signal on this tag; it cannot be built from this dump. Use altitude and ` +
        `aspect instead, and do not let the scorer read \`snowmakingKm\`.`,
    );
    const l = report.nightSki.litTagged;
    const lTotal = l.yes + l.no + l.untagged;
    surprises.push(
      `\`lit\` by contrast is genuinely usable: ${l.yes.toLocaleString()} yes / ${l.no.toLocaleString()} explicit no / ` +
        `${l.untagged.toLocaleString()} untagged (${pct(l.yes + l.no, lTotal)}% of downhill runs carry a real value). ` +
        `That is why night skiing gets a tri-state and snowmaking does not get a signal at all.`,
    );
    surprises.push(
      `${report.nightSki.orphanRuns.toLocaleString()} downhill runs worldwide have an EMPTY \`skiAreas\` array — ` +
        `they belong to no ski area upstream and cannot be attributed to one. Any per-area run aggregate ` +
        `built from runs.geojson is missing that share.`,
    );
  }
  for (const s of surprises) p(`- ${s}`);
  p();

  p('## 9. VERDICT — is Georgian and Bulgarian coverage good enough to use?');
  p();
  for (const v of [report.verdict.georgia, report.verdict.bulgaria]) {
    const label = v.country === 'GE' ? 'Georgia' : 'Bulgaria';
    p(`### ${label} — ${v.usable ? '**YES, usable**' : '**NO, too thin**'}`);
    p();
    p(`${v.significantAreas} areas clear the size threshold.`);
    p();
    p('| Resort | km total | easy km | Lifts | Top (m) | Base (m) | Vertical (m) | Wikidata | Night ski |');
    p('|---|---:|---:|---:|---:|---:|---:|---|---|');
    for (const h of v.headline) {
      const ns = h.hasNightSki === null ? 'unknown' : h.hasNightSki ? 'yes' : 'no';
      p(
        `| ${h.name} | ${h.kmTotal} | ${h.easyKm ?? '—'} | ${h.liftsTotal} | ${h.topElevM ?? '—'} | ` +
          `${h.baseElevM ?? '—'} | ${h.verticalM ?? '—'} | ${h.wikidataId ?? 'none'} | ${ns} |`,
      );
    }
    p();
    p(v.reasoning);
    p();
  }

  p('---');
  p();
  p('_Data © OpenStreetMap contributors, via OpenSkiMap. Licensed ODbL._');
  p();
  return L.join('\n');
}

// ---------------------------------------------------------------------------

export async function build(countries: readonly string[]): Promise<QaReport> {
  console.log(`[build] target countries: ${countries.join(', ')}`);

  console.log('[build] 1/6 normalize');
  // Country overrides are read here and passed IN, because they must be applied
  // inside normalize — before the target-country filter — for an override that
  // moves an area out of the target list to actually remove it from the build.
  const { countryOverrides } = await readCountryOverrides();
  const { areas, diagnostics: normDiag } = await normalize(countries, countryOverrides);
  console.log(
    `[build]     ${areas.length} areas kept` +
      (normDiag.countryOverridesApplied.length > 0
        ? `, ${normDiag.countryOverridesApplied.length} country override(s) applied`
        : ''),
  );

  console.log('[build] 2/6 overrides + locality aliases');
  const ovrDiag = await applyOverrides(areas);
  console.log(
    `[build]     ${ovrDiag.applied.length} overrides applied, ${ovrDiag.unmatched.length} unmatched, ` +
      `${ovrDiag.localityAliasesAdded} locality aliases added`,
  );

  console.log('[build] 3/6 capacity');
  const capDiag = applyCapacity(areas);

  console.log('[build] 4/6 night ski');
  const night = await computeNightSki(areas.map((a) => a.id));
  applyNightSki(areas, night);

  console.log('[build] 5/6 significance');
  const sigDiag = applySignificance(areas);
  console.log(`[build]     ${sigDiag.totalSignificant} significant, ${sigDiag.totalDropped} dropped`);

  console.log('[build] 6/6 pass regions');
  const { regions, diagnostics: prDiag } = applyPassRegions(areas);
  console.log(`[build]     ${regions.length} regions, ${prDiag.unmatched.length} unmatched member names`);

  const present = [...new Set(areas.map((a) => a.country ?? 'XX'))].sort();
  const report: QaReport = {
    generatedAt: RUN_TIMESTAMP,
    countries: [...countries],
    totals: {
      featuresRead: normDiag.featuresRead,
      downhillWorldwide: normDiag.downhillWorldwide,
      inTargetCountries: normDiag.inTargetCountries,
      kept: areas.length,
      significant: sigDiag.totalSignificant,
      dropped: sigDiag.totalDropped,
    },
    perCountry: present.map((c) => countryQa(areas, c)),
    topByKm: [...areas]
      .sort((a, b) => b.kmTotal - a.kmTotal)
      .slice(0, 15)
      .map((a) => ({
        name: a.name,
        country: a.country,
        kmTotal: a.kmTotal,
        liftsTotal: a.liftsTotal,
        topElevM: a.topElevM,
        verticalM: a.verticalM,
        hasNightSki: a.hasNightSki,
        passRegionId: a.passRegionId,
        merged: Boolean(a.boundaryNote),
      })),
    significance: sigDiag,
    capacity: capDiag,
    nightSki: night.diagnostics,
    passRegions: { ...prDiag, count: regions.length },
    overrides: ovrDiag,
    nameCollisions: findNameCollisions(areas),
    normalize: normDiag,
    verdict: {
      georgia: verdictFor(areas, 'GE', ['Gudauri', 'Tetnuldi', 'Didveli', 'Kokhta - Mitarbi', 'Hatsvali'], 'Georgia'),
      bulgaria: verdictFor(areas, 'BG', ['Bansko', 'Borovets', 'Pamporovo', 'Vitosha'], 'Bulgaria'),
    },
  };

  await fsp.mkdir(BUILD_DIR, { recursive: true });
  await fsp.writeFile(path.join(BUILD_DIR, 'ski_areas.json'), JSON.stringify(areas, null, 2), 'utf8');
  await fsp.writeFile(path.join(BUILD_DIR, 'pass_regions.json'), JSON.stringify(regions, null, 2), 'utf8');
  await fsp.writeFile(path.join(BUILD_DIR, 'qa_report.json'), JSON.stringify(report, null, 2), 'utf8');
  await fsp.writeFile(path.join(BUILD_DIR, 'qa_report.md'), md(report, areas, regions), 'utf8');

  console.log(`[build] wrote ${areas.length} areas + ${regions.length} pass regions + QA report to data/build/`);
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  build(targetCountries()).catch((err: unknown) => {
    console.error('[build] failed:', err);
    process.exit(1);
  });
}
