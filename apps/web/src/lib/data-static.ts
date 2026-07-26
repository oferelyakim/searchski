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
let resolvedSeedDir: string | null | undefined;

/** Walk up from cwd looking for `data/<leaf>`. */
async function findDataDir(leaf: string, envVar?: string): Promise<string | null> {
  const candidates: string[] = [];
  const fromEnv = envVar ? process.env[envVar] : undefined;
  if (fromEnv) candidates.push(path.resolve(fromEnv));

  let dir = process.cwd();
  for (let i = 0; i < 6; i += 1) {
    candidates.push(path.join(dir, 'data', leaf));
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  for (const candidate of candidates) {
    if (await exists(candidate)) return candidate;
  }
  return null;
}

/**
 * Locate `data/build`. Next.js runs with cwd at apps/web in dev and at various
 * places on Vercel, so we search rather than assume.
 */
async function resolveDataDir(): Promise<string | null> {
  if (resolvedDir === undefined) resolvedDir = await findDataDir('build', 'SEARCHSKI_DATA_DIR');
  return resolvedDir;
}

/** Locate `data/seed` — the hand-maintained factual seeds. */
async function resolveSeedDir(): Promise<string | null> {
  if (resolvedSeedDir === undefined) resolvedSeedDir = await findDataDir('seed', 'SEARCHSKI_SEED_DIR');
  return resolvedSeedDir;
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

/**
 * Airports, from `data/seed/airports.json`, when the ETL produced none.
 *
 * The ETL writes only `ski_areas.json` and `pass_regions.json` today, so
 * `data/build/airports.json` does not exist and the airport list would
 * otherwise be empty — which silently costs the resort pages their arrival
 * airport, and with it every transfer and car-hire link. The seed file is a
 * hand-maintained list of IATA codes and coordinates, and coordinates are
 * objective public facts; its own header says so.
 *
 * What we deliberately do NOT take from it is any claim that needs verifying.
 * `directFromTLV` in that file is marked unverified and route maps change every
 * season, so it is gated behind `SHOW_REGIONAL_LAYER` in the UI rather than
 * shown as fact. And no drive time is synthesised from these coordinates: the
 * seed file says drive times are derived at ETL time and must not be
 * hand-entered, and a guessed mountain-road duration is exactly the fabrication
 * rule 1 forbids.
 *
 * The file is `{ _comment: [...], airports: [...] }`, which `unwrapList` cannot
 * disambiguate — two arrays, no known key — so it is read explicitly.
 */
async function readSeedAirports(notes: string[]): Promise<unknown[]> {
  const dir = await resolveSeedDir();
  if (!dir) {
    notes.push('No data/seed directory found, so no fallback airport list is available.');
    return [];
  }
  const file = path.join(dir, 'airports.json');
  if (!(await exists(file))) {
    notes.push('data/seed/airports.json not found; the airport list stays empty.');
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(await fs.readFile(file, 'utf8'));
    const list =
      typeof parsed === 'object' && parsed !== null && Array.isArray((parsed as { airports?: unknown }).airports)
        ? ((parsed as { airports: unknown[] }).airports)
        : unwrapList(parsed);
    notes.push(
      `data/build had no airports, so ${list.length} were read from the curated seed data/seed/airports.json. ` +
        'Coordinates only — no drive times are derived from them.',
    );
    return list;
  } catch (err) {
    notes.push(
      `data/seed/airports.json could not be parsed: ${err instanceof Error ? err.message : String(err)}`,
    );
    return [];
  }
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

  const [areasRaw, passRegionsRaw, israelRaw, apresRaw, builtAirportsRaw, transfersRaw, pricesRaw] =
    await Promise.all([
      readList(dir, FILES.areas, notes),
      readList(dir, FILES.passRegions, notes),
      readList(dir, FILES.israelProfiles, notes),
      readList(dir, FILES.apres, notes),
      readList(dir, FILES.airports, notes),
      readList(dir, FILES.transfers, notes),
      readList(dir, FILES.passPrices, notes),
    ]);

  const airportsRaw =
    builtAirportsRaw.length > 0 ? builtAirportsRaw : await readSeedAirports(notes);

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
