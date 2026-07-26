/**
 * ETL configuration: paths, target countries, upstream URLs.
 *
 * Target countries resolve in this order (first wins):
 *   1. --countries=GE,BG,IT   CLI flag
 *   2. SEARCHSKI_COUNTRIES    env var
 *   3. DEFAULT_COUNTRIES      Stage 0: Georgia, Bulgaria, Italy (PLAN.md §7)
 */

import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));

/** Repo root = packages/etl/src -> packages/etl -> packages -> <root>. */
export const REPO_ROOT: string = path.resolve(here, '..', '..', '..');
export const RAW_DIR: string = path.join(REPO_ROOT, 'data', 'raw');
export const BUILD_DIR: string = path.join(REPO_ROOT, 'data', 'build');

export type DumpName = 'ski_areas' | 'runs' | 'lifts';

export const DUMPS: readonly DumpName[] = ['ski_areas', 'runs', 'lifts'] as const;

export const DUMP_URL: Record<DumpName, string> = {
  ski_areas: 'https://tiles.openskimap.org/geojson/ski_areas.geojson',
  runs: 'https://tiles.openskimap.org/geojson/runs.geojson',
  lifts: 'https://tiles.openskimap.org/geojson/lifts.geojson',
};

export function rawPath(name: DumpName): string {
  return path.join(RAW_DIR, `${name}.geojson`);
}

/**
 * Scratchpad the operator pre-downloaded dumps into. fetch.ts copies from here
 * instead of re-downloading, but ONLY when the local copy looks complete.
 * Overridable so this is not hard-wired to one machine.
 */
export const SCRATCHPAD_DIR: string =
  process.env.SEARCHSKI_SCRATCHPAD ??
  'C:\\Users\\OFEREL~1\\AppData\\Local\\Temp\\claude\\c--Users-OferElyakim-Ofer-s-Repos-SearchSki\\5dd4d5d5-76ed-4d91-a8f2-dd8f38f3c42f\\scratchpad';

/** Stage 0 of PLAN.md §7: Georgia, Bulgaria, Italy. */
export const DEFAULT_COUNTRIES: readonly string[] = ['GE', 'BG', 'IT'] as const;

function parseCountryList(value: string): string[] {
  return value
    .split(',')
    .map((c) => c.trim().toUpperCase())
    .filter((c) => c.length > 0);
}

/** Resolve target countries from CLI argv, then env, then the Stage 0 default. */
export function targetCountries(argv: readonly string[] = process.argv.slice(2)): string[] {
  const flag = argv.find((a) => a.startsWith('--countries='));
  if (flag) {
    const parsed = parseCountryList(flag.slice('--countries='.length));
    if (parsed.length > 0) return parsed;
  }
  const env = process.env.SEARCHSKI_COUNTRIES;
  if (env) {
    const parsed = parseCountryList(env);
    if (parsed.length > 0) return parsed;
  }
  return [...DEFAULT_COUNTRIES];
}

/** ISO date stamp used for every Provenance.fetchedAt written in one run. */
export const RUN_TIMESTAMP: string = new Date().toISOString();

export const OPENSKIMAP_ATTRIBUTION =
  'OpenSkiMap (ODbL), derived from OpenStreetMap contributors';
