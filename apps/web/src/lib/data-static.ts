/**
 * Static data source — the default, and the one that lets the site deploy with
 * no database and no environment variables at all.
 *
 * Reads the committed JSON artifacts the ETL writes to `data/build/` at the
 * repo root. Every file is optional: a missing file is a note, not an error.
 * File names are matched against a candidate list per dataset because the ETL
 * is written by another agent and we do not want a naming difference to take
 * the site down.
 *
 * On Vercel these files are pulled into the function bundle by
 * `outputFileTracingIncludes` in next.config.ts.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import {
  coerceAirport,
  coerceAirportTransfer,
  coerceApresProxy,
  coerceIsraelProfile,
  coercePassPrice,
  coercePassRegion,
  coerceSkiArea,
  unwrapList,
} from './coerce';
import { emptyRawDataset, type RawDataset } from './data-types';

/** Candidate file names per dataset, first match wins. */
const FILES = {
  areas: ['ski_areas.json', 'skiAreas.json', 'ski_area.json', 'areas.json'],
  passRegions: ['pass_regions.json', 'passRegions.json', 'pass_region.json'],
  israelProfiles: [
    'israel_profiles.json',
    'israelProfiles.json',
    'israel_profile.json',
    'il_profiles.json',
  ],
  apres: ['apres_proxy.json', 'apresProxy.json', 'apres.json'],
  airports: ['airports.json', 'airport.json'],
  transfers: ['airport_transfers.json', 'airportTransfers.json', 'transfers.json'],
  passPrices: ['pass_prices.json', 'passPrices.json', 'pass_price.json'],
} as const;

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

let resolvedDir: string | null | undefined;

/**
 * Locate `data/build`. Next.js runs with cwd at apps/web in dev and at various
 * places on Vercel, so we search rather than assume.
 */
async function resolveDataDir(): Promise<string | null> {
  if (resolvedDir !== undefined) return resolvedDir;

  const candidates: string[] = [];
  const fromEnv = process.env['SEARCHSKI_DATA_DIR'];
  if (fromEnv) candidates.push(path.resolve(fromEnv));

  let dir = process.cwd();
  for (let i = 0; i < 6; i += 1) {
    candidates.push(path.join(dir, 'data', 'build'));
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  for (const candidate of candidates) {
    if (await exists(candidate)) {
      resolvedDir = candidate;
      return candidate;
    }
  }
  resolvedDir = null;
  return null;
}

async function readList(dir: string, names: readonly string[], notes: string[]): Promise<unknown[]> {
  for (const name of names) {
    const file = path.join(dir, name);
    if (!(await exists(file))) continue;
    try {
      const text = await fs.readFile(file, 'utf8');
      const list = unwrapList(JSON.parse(text) as unknown);
      notes.push(`Read ${list.length} rows from data/build/${name}.`);
      return list;
    } catch (err) {
      notes.push(`data/build/${name} could not be parsed: ${err instanceof Error ? err.message : String(err)}`);
      return [];
    }
  }
  notes.push(`No file found for ${names[0]} — that dataset is empty.`);
  return [];
}

function compact<T>(rows: unknown[], coerce: (v: unknown) => T | null): T[] {
  const out: T[] = [];
  for (const row of rows) {
    const value = coerce(row);
    if (value !== null) out.push(value);
  }
  return out;
}

export async function loadStatic(): Promise<RawDataset> {
  const notes: string[] = [];
  const dir = await resolveDataDir();
  if (!dir) {
    return {
      ...emptyRawDataset(),
      notes: ['data/build/ was not found anywhere above the working directory.'],
    };
  }
  notes.push(`Static data directory: ${dir}`);

  const [areasRaw, passRegionsRaw, israelRaw, apresRaw, airportsRaw, transfersRaw, pricesRaw] =
    await Promise.all([
      readList(dir, FILES.areas, notes),
      readList(dir, FILES.passRegions, notes),
      readList(dir, FILES.israelProfiles, notes),
      readList(dir, FILES.apres, notes),
      readList(dir, FILES.airports, notes),
      readList(dir, FILES.transfers, notes),
      readList(dir, FILES.passPrices, notes),
    ]);

  return {
    areas: compact(areasRaw, coerceSkiArea),
    passRegions: compact(passRegionsRaw, coercePassRegion),
    israelProfiles: compact(israelRaw, coerceIsraelProfile),
    apres: compact(apresRaw, coerceApresProxy),
    airports: compact(airportsRaw, coerceAirport),
    transfers: compact(transfersRaw, coerceAirportTransfer),
    passPrices: compact(pricesRaw, coercePassPrice),
    notes,
  };
}
