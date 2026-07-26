/**
 * Hand-mapped commercial lift-pass areas (PLAN.md §3, "Change 2").
 *
 * The problem this solves: a user searches "Dolomiti Superski" and OpenSkiMap
 * hands back a dozen unrelated polygons, because a pass region is a COMMERCIAL
 * construct and OSM only models physical ones. Pass price attaches here; piste
 * stats attach to the ski areas.
 *
 * ---------------------------------------------------------------------------
 * RULES THIS FILE OBEYS
 * ---------------------------------------------------------------------------
 * 1. Every row is `verification: 'unverified'`. These member lists are written
 *    from domain knowledge, not read off the operator's site by a machine. Per
 *    core/types.ts, unverified curated data is stored but MUST NOT be rendered
 *    as fact in the UI until a human checks it against the operator.
 *
 * 2. `marketedKm` is null on EVERY row. The operators' marketed totals
 *    (Dolomiti Superski's famous figure, etc.) are real numbers on real
 *    websites, but writing one from memory is fabrication — and marketed km
 *    deliberately differs from our summed km, so a wrong value here is
 *    invisible rather than obviously broken. Fill these in by hand, from the
 *    operator, with verification: 'verified'.
 *
 * 3. Member areas are matched against the ACTUAL names in the OpenSkiMap dump,
 *    by normalized key (see nameKey). Candidates that match nothing are
 *    REPORTED, not silently dropped — see PassRegionDiagnostics.unmatched and
 *    the QA report. An unmatched candidate means either the resort is absent
 *    from OSM, or upstream merged it into a neighbour, or our spelling is off.
 *    All three are things a human must look at.
 *
 * ---------------------------------------------------------------------------
 * OBSERVED UPSTREAM MERGING — why some candidates will never match
 * ---------------------------------------------------------------------------
 * OpenSkiMap does not slice Italy the way the pass operators do. Notably:
 *  - "Alta Badia" upstream is a single 253 km blob that appears to swallow the
 *    whole Sella Ronda circuit; there is no separate "Val Gardena" area at all.
 *  - "Monterosa Ski" is ONE area, not the three valleys (Champoluc, Gressoney,
 *    Alagna) the pass is sold as.
 * So a pass region legitimately having one member is not a bug.
 */

import type { PassRegion, SkiArea } from '@searchski/core/types';
import { RUN_TIMESTAMP } from './config.ts';
import { nameKey } from './names.ts';

/** A curated pass region before member ids are resolved. */
interface PassRegionSpec {
  id: string;
  name: string;
  country: string;
  officialUrl: string | null;
  /**
   * Names to match against the dump. Spelled as the OPERATOR sells them and,
   * where upstream differs, as UPSTREAM writes them — both are listed so the
   * unmatched report stays meaningful.
   */
  memberNames: string[];
  note: string;
}

const SPECS: readonly PassRegionSpec[] = [
  {
    id: 'it-dolomiti-superski',
    name: 'Dolomiti Superski',
    country: 'IT',
    officialUrl: 'https://www.dolomitisuperski.com/',
    note:
      'One ticket over the 12 Dolomite valleys. Upstream merges several of them, ' +
      'so member count here is lower than the operator advertises.',
    memberNames: [
      'Alta Badia',
      'Cortina d’Ampezzo',
      "Cortina d'Ampezzo",
      'Cortina Tofane',
      'Lagazuoi - 5 Torri',
      'Cristallo - Faloria',
      'Kronplatz - Plan de Corones',
      'Seiser Alm - Mont de Sëuc - Alpe di Siusi',
      'Val Gardena',
      'Val di Fassa',
      'Belvedere - Col Rodella - Passo Pordoi',
      'Buffaure - Ciampac',
      'Vigo di Fassa - Ciampedie',
      'Carezza',
      'Arabba',
      'Marmolada',
      'Ski Civetta',
      '3 Zinnen Dolomites (Dobbiaco - San Candido - Braies - Sesto - Alta Pusteria)',
      'Drei Zinnen - Tre Cime',
      'Alpe Cermis',
      'Ski Area Alpe Lusia',
      'Latemar Dolomites',
      'San Martino di Castrozza - Passo Rolle',
      'San Martino di Castrozza',
      'Passo Rolle',
      'Ski Area San Pellegrino - Falcade',
      'Gitschberg Jochtal',
      'Brixen Plose - Plose di Bressanone',
    ],
  },
  {
    id: 'it-via-lattea',
    name: 'Via Lattea (Milky Way)',
    country: 'IT',
    officialUrl: 'https://www.vialattea.it/',
    note: 'Piedmont/Susa valley circuit. The French side (Montgenèvre) is out of scope for an IT-only build.',
    memberNames: [
      'Sestriere',
      'Sauze D’Oulx',
      "Sauze D'Oulx",
      'Sansicario',
      'San Sicario',
      'Cesana',
      'Cesana Torinese',
      'Claviere',
      'Pragelato',
      'Borgata',
    ],
  },
  {
    id: 'it-skirama-dolomiti',
    name: 'Skirama Dolomiti Adamello Brenta',
    country: 'IT',
    officialUrl: 'https://www.skirama.it/',
    note: 'Trentino multi-area pass; the constituent areas are NOT lift-connected to each other.',
    memberNames: [
      'Campiglio Dolomiti di Brenta',
      'Madonna di Campiglio',
      'Pinzolo',
      'Folgarida-Marilleva',
      'Ponte di Legno - Passo Tonale',
      'Pejo 3000',
      'Pejo',
      'Paganella',
      'Monte Bondone',
      'Alpe Cimbra',
      'Folgaria',
      'Ski Center Lavarone',
    ],
  },
  {
    id: 'it-monterosa-ski',
    name: 'Monterosa Ski',
    country: 'IT',
    officialUrl: 'https://www.monterosa-ski.com/',
    note: 'Aosta valley. Upstream models the three valleys as one area, so expect a single member.',
    // Antagnod is deliberately NOT listed. It is a separate Ayas-valley resort
    // that appears on some Monterosa combined tickets and not others, and we
    // are not confident enough to assert membership. Add it only after
    // checking the operator's own pass map.
    memberNames: ['Monterosa Ski', 'Champoluc', 'Gressoney', 'Alagna'],
  },
];

/**
 * Resorts that sell their own pass and belong to no multi-area consortium.
 * Modelled as one-member pass regions so pass_price has something to hang off
 * (the schema's pass_price row needs either a pass_region_id or a ski_area_id,
 * and keeping every price on a pass_region keeps the query path uniform).
 *
 * These four are the Israeli market's actual top non-Alpine destinations
 * (PLAN.md §11): Gudauri is Israel's #1 ski destination, +30% YoY.
 */
const STANDALONE: readonly PassRegionSpec[] = [
  {
    id: 'ge-gudauri',
    name: 'Gudauri',
    country: 'GE',
    officialUrl: null, // taken from the area's own OSM `websites` when present
    note: 'Standalone. Israel’s single most popular ski destination.',
    memberNames: ['Gudauri'],
  },
  {
    id: 'bg-bansko',
    name: 'Bansko',
    country: 'BG',
    officialUrl: null,
    note: 'Standalone, operated by Yulen AD.',
    memberNames: ['Bansko'],
  },
  {
    id: 'bg-borovets',
    name: 'Borovets',
    country: 'BG',
    officialUrl: null,
    note: 'Standalone, operated by Borosport.',
    memberNames: ['Borovets'],
  },
  {
    id: 'bg-pamporovo',
    name: 'Pamporovo',
    country: 'BG',
    officialUrl: null,
    note: 'Standalone.',
    memberNames: ['Pamporovo'],
  },
];

export interface UnmatchedCandidate {
  passRegionId: string;
  candidateName: string;
}

export interface PassRegionDiagnostics {
  /** Curated member names that matched no area in the dump. FIX THESE BY HAND. */
  unmatched: UnmatchedCandidate[];
  /** id -> resolved member names, so the QA report can show what we actually got. */
  matched: Record<string, string[]>;
  /** Areas claimed by more than one pass region — a curation bug if non-empty. */
  contested: Array<{ areaId: string; areaName: string; regions: string[] }>;
}

export interface PassRegionResult {
  regions: PassRegion[];
  diagnostics: PassRegionDiagnostics;
}

/**
 * Resolve curated pass regions against the normalized areas and stamp
 * `passRegionId` onto each member area, in place.
 */
export function applyPassRegions(areas: SkiArea[]): PassRegionResult {
  // Index by normalized name AND by every alias, so a Cyrillic-only or
  // German-only upstream name still matches an English candidate.
  const index = new Map<string, SkiArea[]>();
  const add = (key: string, area: SkiArea): void => {
    const k = nameKey(key);
    if (!k) return;
    const list = index.get(k);
    if (list) {
      if (!list.includes(area)) list.push(area);
    } else {
      index.set(k, [area]);
    }
  };
  for (const area of areas) {
    add(area.name, area);
    for (const alias of area.aliases) add(alias, area);
  }

  const diagnostics: PassRegionDiagnostics = { unmatched: [], matched: {}, contested: [] };
  const regions: PassRegion[] = [];
  const claimedBy = new Map<string, string[]>();

  for (const spec of [...SPECS, ...STANDALONE]) {
    const memberIds: string[] = [];
    const memberNames: string[] = [];

    for (const candidate of spec.memberNames) {
      const hits = (index.get(nameKey(candidate)) ?? []).filter((a) => a.country === spec.country);
      if (hits.length === 0) {
        diagnostics.unmatched.push({ passRegionId: spec.id, candidateName: candidate });
        continue;
      }
      for (const hit of hits) {
        if (memberIds.includes(hit.id)) continue;
        memberIds.push(hit.id);
        memberNames.push(hit.name);
        claimedBy.set(hit.id, [...(claimedBy.get(hit.id) ?? []), spec.id]);
      }
    }

    diagnostics.matched[spec.id] = memberNames;

    // For a standalone region, prefer the member's own website from OSM over a
    // hand-typed URL: it is sourced data rather than something we remembered.
    let officialUrl = spec.officialUrl;
    if (officialUrl === null && memberIds.length === 1) {
      const only = areas.find((a) => a.id === memberIds[0]);
      officialUrl = only?.websites[0] ?? null;
    }

    regions.push({
      id: spec.id,
      name: spec.name,
      country: spec.country,
      // Never invented. See the header comment.
      marketedKm: null,
      officialUrl,
      memberAreaIds: memberIds,
      provenance: {
        source: 'curated',
        sourceUrl: spec.officialUrl,
        fetchedAt: RUN_TIMESTAMP,
        verification: 'unverified',
        note: `${spec.note} Member list hand-written and matched by name against OpenSkiMap; NOT confirmed against the operator.`,
      },
    });
  }

  // Stamp membership. An area contested by two regions keeps the first and is
  // reported — silently picking one would hide a curation bug.
  for (const area of areas) {
    const owners = claimedBy.get(area.id);
    if (!owners || owners.length === 0) continue;
    area.passRegionId = owners[0] ?? null;
    if (owners.length > 1) {
      diagnostics.contested.push({ areaId: area.id, areaName: area.name, regions: owners });
    }
  }

  return { regions, diagnostics };
}
