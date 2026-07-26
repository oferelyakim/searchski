/**
 * Night skiing, from OSM's `lit` tag on pistes (PLAN.md §5 — free, and nobody
 * else in the market exposes it as a filter).
 *
 * MEMORY: runs.geojson decompresses to ~0.9-1.0 GB. This module never holds
 * more than one run feature at a time — see stream.ts for why that works.
 * We only accumulate counters for ski-area ids we were asked about, so the
 * working set is ~40 areas for Stage 0, not ~96,000 runs.
 *
 * ---------------------------------------------------------------------------
 * THE TRI-STATE, WHICH IS THE WHOLE POINT
 * ---------------------------------------------------------------------------
 * Upstream `properties.lit` is genuinely three-valued:
 *     true  -> OSM says lit=yes
 *     false -> OSM says lit=no          (a mapper actually checked)
 *     null  -> nobody ever tagged it    (we know nothing)
 *
 * So hasNightSki resolves as:
 *     true  <- at least one lit run
 *     false <- no lit run AND every downhill run in the area carries an
 *              explicit lit value (i.e. the area was fully surveyed)
 *     null  <- anything else: no lit runs, but some runs were never tagged,
 *              so "no night skiing" is not a claim we are entitled to make
 *
 * That last rule is strict on purpose. Telling someone a resort has no night
 * skiing when it does is a wasted trip; saying "we don't know" is honest and
 * the UI can fall back to a link-out. `false` is a positive assertion and has
 * to be earned.
 *
 * If runs.geojson is missing or truncated, EVERY area gets null — never false.
 */

import type { SkiArea } from '@searchski/core/types';
import { rawPath } from './config.ts';
import { lineLengthKm } from './geo.ts';
import { checkDump, humanBytes, streamFeatures, type StreamStats } from './stream.ts';
import type { RawRunFeature } from './raw.ts';

export interface NightSkiTally {
  /** 3D km of runs with lit === true. */
  litKm: number;
  litRuns: number;
  /** Downhill runs with an explicit lit value (true or false). */
  taggedRuns: number;
  /** Downhill runs with lit === null. */
  untaggedRuns: number;
}

export interface NightSkiDiagnostics {
  /** False when runs.geojson was missing/truncated — everything stays null. */
  available: boolean;
  reason: string;
  fileSizeBytes: number;
  runsRead: number;
  downhillRuns: number;
  /** Runs that named at least one of our target areas. */
  attributedRuns: number;
  /** Runs with no `skiAreas` linkage at all — orphans, unattributable. */
  orphanRuns: number;
  litRunsWorldwide: number;
  streamStats: StreamStats;
  /** Per-area outcome counts, for the QA report. */
  areasTrue: number;
  areasFalse: number;
  areasNull: number;
  /**
   * OSM `lit` tag coverage over ALL downhill runs worldwide. This is the
   * denominator that makes the tri-state honest — see the QA report.
   */
  litTagged: { yes: number; no: number; untagged: number };
  /**
   * OSM `piste:snowmaking` coverage, tallied on the same pass because it is
   * free while we are already streaming. Reported because PLAN.md §5 wants to
   * build the "snow-reliable" signal on this tag, and the numbers say it
   * cannot be built from this dump yet.
   */
  snowmakingTagged: { yes: number; no: number; untagged: number };
  /** Downhill runs with snowmaking=true belonging to a target area. */
  snowmakingYesInTarget: number;
}

export interface NightSkiResult {
  /** Keyed by ski area id. Only ids that were asked for appear. */
  tallies: Map<string, NightSkiTally>;
  diagnostics: NightSkiDiagnostics;
}

/**
 * Stream runs.geojson and tally lit terrain for `areaIds`.
 *
 * Attribution: a run carries `properties.skiAreas`, an array of whole ski-area
 * Features (NOT ids — the id is at skiAreas[i].properties.id). A run that spans
 * two areas is credited to BOTH, because from a skier's point of view it is
 * lit terrain at either. That does mean area km can sum to more than the
 * region's true lit km; we never sum nightSkiKm across areas.
 */
export async function computeNightSki(areaIds: Iterable<string>): Promise<NightSkiResult> {
  const wanted = new Set(areaIds);
  const tallies = new Map<string, NightSkiTally>();
  const streamStats: StreamStats = { parsed: 0, skipped: 0 };

  const diagnostics: NightSkiDiagnostics = {
    available: false,
    reason: '',
    fileSizeBytes: 0,
    runsRead: 0,
    downhillRuns: 0,
    attributedRuns: 0,
    orphanRuns: 0,
    litRunsWorldwide: 0,
    streamStats,
    areasTrue: 0,
    areasFalse: 0,
    areasNull: 0,
    litTagged: { yes: 0, no: 0, untagged: 0 },
    snowmakingTagged: { yes: 0, no: 0, untagged: 0 },
    snowmakingYesInTarget: 0,
  };

  const file = rawPath('runs');
  const check = await checkDump(file);
  diagnostics.fileSizeBytes = check.sizeBytes;

  if (!check.complete) {
    diagnostics.reason = check.exists
      ? `runs.geojson unusable: ${check.reason}`
      : 'runs.geojson not present';
    console.warn(`[nightski] ${diagnostics.reason} — hasNightSki stays NULL (unknown) for every area.`);
    return { tallies, diagnostics };
  }

  diagnostics.available = true;
  diagnostics.reason = 'ok';
  console.log(`[nightski] streaming ${humanBytes(check.sizeBytes)} of runs.geojson…`);

  for (const id of wanted) {
    tallies.set(id, { litKm: 0, litRuns: 0, taggedRuns: 0, untaggedRuns: 0 });
  }

  for await (const run of streamFeatures<RawRunFeature>(file, streamStats)) {
    diagnostics.runsRead++;
    if (diagnostics.runsRead % 250_000 === 0) {
      console.log(`[nightski]   ${diagnostics.runsRead.toLocaleString()} runs…`);
    }

    const props = run.properties;
    if (!props) continue;

    // Downhill pistes only. A lit nordic loop or sledding track is not night
    // skiing in the sense the user is asking about.
    if (!(props.uses ?? []).includes('downhill')) continue;
    diagnostics.downhillRuns++;

    const lit = props.lit;
    if (lit === true) {
      diagnostics.litRunsWorldwide++;
      diagnostics.litTagged.yes++;
    } else if (lit === false) {
      diagnostics.litTagged.no++;
    } else {
      diagnostics.litTagged.untagged++;
    }

    const snow = props.snowmaking;
    if (snow === true) diagnostics.snowmakingTagged.yes++;
    else if (snow === false) diagnostics.snowmakingTagged.no++;
    else diagnostics.snowmakingTagged.untagged++;

    const parents = props.skiAreas ?? [];
    if (parents.length === 0) {
      diagnostics.orphanRuns++;
      continue;
    }

    // Cheap pre-filter: touch the geometry only for runs we actually want.
    let relevant = false;
    for (const parent of parents) {
      const pid = parent?.properties?.id;
      if (pid && wanted.has(pid)) {
        relevant = true;
        break;
      }
    }
    if (!relevant) continue;
    diagnostics.attributedRuns++;
    if (snow === true) diagnostics.snowmakingYesInTarget++;

    const km = lit === true ? lineLengthKm(run.geometry) : 0;

    for (const parent of parents) {
      const pid = parent?.properties?.id;
      if (!pid) continue;
      const tally = tallies.get(pid);
      if (!tally) continue;
      if (lit === null || lit === undefined) {
        tally.untaggedRuns++;
      } else {
        tally.taggedRuns++;
        if (lit === true) {
          tally.litRuns++;
          tally.litKm += km;
        }
      }
    }
  }

  console.log(
    `[nightski] read ${diagnostics.runsRead.toLocaleString()} runs ` +
      `(${diagnostics.downhillRuns.toLocaleString()} downhill, ` +
      `${diagnostics.litRunsWorldwide.toLocaleString()} lit worldwide, ` +
      `${diagnostics.attributedRuns.toLocaleString()} in target areas).`,
  );

  return { tallies, diagnostics };
}

/** Apply tallies to areas in place, resolving the tri-state described above. */
export function applyNightSki(areas: SkiArea[], result: NightSkiResult): void {
  const { tallies, diagnostics } = result;

  for (const area of areas) {
    if (!diagnostics.available) {
      area.hasNightSki = null;
      area.nightSkiKm = null;
      continue;
    }

    const tally = tallies.get(area.id);
    if (!tally) {
      area.hasNightSki = null;
      area.nightSkiKm = null;
      continue;
    }

    if (tally.litRuns > 0) {
      area.hasNightSki = true;
      area.nightSkiKm = Math.round(tally.litKm * 100) / 100;
    } else if (tally.taggedRuns > 0 && tally.untaggedRuns === 0) {
      // Fully surveyed and nothing is lit — we are entitled to say "no".
      area.hasNightSki = false;
      area.nightSkiKm = 0;
    } else {
      // Partially or wholly untagged. We do not know.
      area.hasNightSki = null;
      area.nightSkiKm = null;
    }
  }

  diagnostics.areasTrue = areas.filter((a) => a.hasNightSki === true).length;
  diagnostics.areasFalse = areas.filter((a) => a.hasNightSki === false).length;
  diagnostics.areasNull = areas.filter((a) => a.hasNightSki === null).length;
}
