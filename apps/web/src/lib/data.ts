/**
 * Data access layer.
 *
 * SERVER ONLY. Never import this from a client component — it touches the
 * filesystem and reads environment variables.
 *
 * Two interchangeable sources sit behind one `getDataset()` call, selected by
 * `SEARCHSKI_DATA_SOURCE`:
 *
 *   static   (DEFAULT) — reads the committed JSON artifacts in data/build/ at
 *                        the repo root. Requires no database and no env vars
 *                        at all. This is how the site deploys to Vercel on day
 *                        one (PLAN.md §2).
 *   supabase           — reads Postgres through @supabase/supabase-js using the
 *                        public anon key and the world-read RLS policies from
 *                        db/migrations/0001_init.sql.
 *
 * If the selected source yields nothing (the ETL has not run, Supabase is
 * unreachable) we fall back to the built-in sample dataset and flag it, rather
 * than rendering an empty site or throwing. Which source actually served the
 * request is logged once per load and surfaced in the UI.
 */

import type {
  Airport,
  AirportTransfer,
  ApresProxy,
  IsraelProfile,
  PassPrice,
  PassRegion,
  SkiArea,
} from '@searchski/core/types';
import { loadStatic } from './data-static';
import { loadSupabase } from './data-supabase';
import {
  emptyRawDataset,
  type DataSourceName,
  type DatasetMeta,
  type RawDataset,
} from './data-types';
import {
  SAMPLE_AIRPORTS,
  SAMPLE_APRES,
  SAMPLE_AREAS,
  SAMPLE_ISRAEL_PROFILES,
  SAMPLE_PASS_PRICES,
  SAMPLE_PASS_REGIONS,
  SAMPLE_TRANSFERS,
} from './sample-data';

export type { DataSourceName, DatasetMeta, RawDataset } from './data-types';

export interface Dataset extends RawDataset {
  areasById: Map<string, SkiArea>;
  passRegionsById: Map<string, PassRegion>;
  israelById: Record<string, IsraelProfile>;
  apresById: Record<string, ApresProxy>;
  transfersByArea: Record<string, AirportTransfer[]>;
  airportsByIata: Record<string, Airport>;
  meta: DatasetMeta;
}

function sampleRawDataset(): RawDataset {
  return {
    areas: SAMPLE_AREAS,
    passRegions: SAMPLE_PASS_REGIONS,
    israelProfiles: SAMPLE_ISRAEL_PROFILES,
    apres: SAMPLE_APRES,
    airports: SAMPLE_AIRPORTS,
    transfers: SAMPLE_TRANSFERS,
    passPrices: SAMPLE_PASS_PRICES,
    notes: [],
  };
}

function requestedSource(): DataSourceName {
  const raw = (process.env['SEARCHSKI_DATA_SOURCE'] ?? 'static').trim().toLowerCase();
  return raw === 'supabase' ? 'supabase' : 'static';
}

function index(raw: RawDataset, meta: DatasetMeta): Dataset {
  const areasById = new Map<string, SkiArea>();
  for (const a of raw.areas) areasById.set(a.id, a);

  const passRegionsById = new Map<string, PassRegion>();
  for (const p of raw.passRegions) passRegionsById.set(p.id, p);

  const israelById: Record<string, IsraelProfile> = {};
  for (const p of raw.israelProfiles) israelById[p.skiAreaId] = p;

  const apresById: Record<string, ApresProxy> = {};
  for (const p of raw.apres) apresById[p.skiAreaId] = p;

  const transfersByArea: Record<string, AirportTransfer[]> = {};
  for (const t of raw.transfers) {
    const bucket = transfersByArea[t.skiAreaId];
    if (bucket) bucket.push(t);
    else transfersByArea[t.skiAreaId] = [t];
  }
  for (const list of Object.values(transfersByArea)) {
    list.sort((a, b) => a.driveMinutes - b.driveMinutes);
  }

  const airportsByIata: Record<string, Airport> = {};
  for (const a of raw.airports) airportsByIata[a.iata] = a;

  return {
    ...raw,
    areasById,
    passRegionsById,
    israelById,
    apresById,
    transfersByArea,
    airportsByIata,
    meta,
  };
}

async function build(): Promise<Dataset> {
  const requested = requestedSource();
  const notes: string[] = [];
  let raw: RawDataset = emptyRawDataset();
  let served: DataSourceName = requested;

  if (requested === 'supabase') {
    try {
      raw = await loadSupabase();
    } catch (err) {
      notes.push(`Supabase load failed: ${err instanceof Error ? err.message : String(err)}`);
      raw = emptyRawDataset();
    }
    if (raw.areas.length === 0) {
      notes.push('Supabase returned no ski areas; falling back to the static artifacts.');
      try {
        raw = await loadStatic();
        served = 'static';
      } catch (err) {
        notes.push(`Static load failed: ${err instanceof Error ? err.message : String(err)}`);
        raw = emptyRawDataset();
      }
    }
  } else {
    try {
      raw = await loadStatic();
    } catch (err) {
      notes.push(`Static load failed: ${err instanceof Error ? err.message : String(err)}`);
      raw = emptyRawDataset();
    }
  }

  if (raw.areas.length === 0) {
    notes.push(
      'No ski areas from any configured source — serving the built-in sample dataset. Run `npm run etl:all` to produce data/build/*.json.',
    );
    raw = { ...sampleRawDataset(), notes: [...raw.notes] };
    served = 'sample';
  }

  // Border resorts appear under every country they touch, so the filter list
  // is drawn from `countries`, not the single display `country`.
  const countries = [
    ...new Set(
      raw.areas.flatMap((a) =>
        a.countries && a.countries.length > 0 ? a.countries : a.country ? [a.country] : [],
      ),
    ),
  ].sort();

  const meta: DatasetMeta = {
    source: served,
    requestedSource: requested,
    isSample: served === 'sample',
    loadedAt: new Date().toISOString(),
    areaCount: raw.areas.length,
    countries,
    notes: [...raw.notes, ...notes],
  };

  console.log(
    `[searchski/data] requested="${requested}" served="${served}" areas=${raw.areas.length} ` +
      `passRegions=${raw.passRegions.length} israelProfiles=${raw.israelProfiles.length} ` +
      `transfers=${raw.transfers.length} passPrices=${raw.passPrices.length}`,
  );
  for (const note of meta.notes) console.log(`[searchski/data] ${note}`);

  return index(raw, meta);
}

// --- process-level cache ----------------------------------------------------
// Static JSON never changes within a deployment, so cache it for the life of
// the process. Supabase gets a short TTL so curation edits show up.
const CACHE_TTL_MS = 5 * 60 * 1000;
let cached: { at: number; promise: Promise<Dataset> } | null = null;

export function getDataset(): Promise<Dataset> {
  const now = Date.now();
  if (cached) {
    const isSupabase = requestedSource() === 'supabase';
    if (!isSupabase || now - cached.at < CACHE_TTL_MS) return cached.promise;
  }
  const promise = build().catch((err: unknown) => {
    // Absolute last resort: never let a data failure take a page down.
    console.error('[searchski/data] fatal load error, serving sample dataset', err);
    cached = null;
    return index(sampleRawDataset(), {
      source: 'sample',
      requestedSource: requestedSource(),
      isSample: true,
      loadedAt: new Date().toISOString(),
      areaCount: SAMPLE_AREAS.length,
      countries: ['BG', 'GE', 'IT'],
      notes: ['A fatal error occurred loading the configured data source.'],
    });
  });
  cached = { at: now, promise };
  return promise;
}

/** Everything a single resort page needs, in one call. */
export interface ResortBundle {
  area: SkiArea;
  israel: IsraelProfile | null;
  apres: ApresProxy | null;
  transfers: AirportTransfer[];
  airports: Record<string, Airport>;
  passRegion: PassRegion | null;
  passPrices: PassPrice[];
  meta: DatasetMeta;
}

export async function getResort(id: string): Promise<ResortBundle | null> {
  const data = await getDataset();
  const area = data.areasById.get(id);
  if (!area) return null;

  const passRegion = area.passRegionId ? (data.passRegionsById.get(area.passRegionId) ?? null) : null;
  const passPrices = data.passPrices.filter(
    (p) => p.skiAreaId === area.id || (p.passRegionId !== null && p.passRegionId === area.passRegionId),
  );

  return {
    area,
    israel: data.israelById[area.id] ?? null,
    apres: data.apresById[area.id] ?? null,
    transfers: data.transfersByArea[area.id] ?? [],
    airports: data.airportsByIata,
    passRegion,
    passPrices,
    meta: data.meta,
  };
}
