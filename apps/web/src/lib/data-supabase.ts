/**
 * Supabase data source — the optional upgrade path.
 *
 * Reads the tables created by `db/migrations/0001_init.sql` using the public
 * anon key. Those tables carry `FOR SELECT USING (true)` RLS policies, so the
 * anon key grants read-only access to reference data and nothing else. The
 * service-role key and DATABASE_URL are for the ETL loader and must never
 * reach this app.
 *
 * Enabled with `SEARCHSKI_DATA_SOURCE=supabase`. If the env vars are missing or
 * a query fails, we return what we have and let data.ts fall back to static.
 *
 * `@supabase/supabase-js` is imported lazily so it never enters the bundle of a
 * deployment running in the default static mode.
 */

import {
  coerceAirport,
  coerceAirportTransfer,
  coerceApresProxy,
  coerceIsraelProfile,
  coercePassPrice,
  coercePassRegion,
  coerceSkiArea,
  isRow,
  type Row,
} from './coerce';
import { emptyRawDataset, type RawDataset } from './data-types';

/** Selected instead of `*` so a schema addition can never break the read. */
const SKI_AREA_COLUMNS = [
  'id',
  'name',
  'country',
  'region_code',
  'region_name',
  'localities',
  'status',
  'websites',
  'wikidata_qid',
  'base_elev_m',
  'top_elev_m',
  'vertical_m',
  'runs_total',
  'km_total',
  'runs_by_difficulty',
  'terrain_mix',
  'lifts_total',
  'lifts_km_total',
  'lifts_by_type',
  'snowmaking_km',
  'has_night_ski',
  'night_ski_km',
  'uphill_capacity_pph',
  'capacity_per_km',
  'is_significant',
  'pass_region_id',
  'source',
  'fetched_at',
].join(',');

interface MinimalQuery {
  select: (columns: string) => MinimalQuery;
  limit: (n: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
}
interface MinimalClient {
  from: (table: string) => MinimalQuery;
}

const PAGE_LIMIT = 5000;

async function table(client: MinimalClient, name: string, columns: string, notes: string[]): Promise<Row[]> {
  try {
    const { data, error } = await client.from(name).select(columns).limit(PAGE_LIMIT);
    if (error) {
      notes.push(`Supabase table "${name}" errored: ${error.message}`);
      return [];
    }
    if (!Array.isArray(data)) {
      notes.push(`Supabase table "${name}" returned no array.`);
      return [];
    }
    notes.push(`Read ${data.length} rows from Supabase table "${name}".`);
    return data.filter(isRow);
  } catch (err) {
    notes.push(`Supabase table "${name}" threw: ${err instanceof Error ? err.message : String(err)}`);
    return [];
  }
}

function compact<T>(rows: Row[], coerce: (v: unknown) => T | null): T[] {
  const out: T[] = [];
  for (const row of rows) {
    const value = coerce(row);
    if (value !== null) out.push(value);
  }
  return out;
}

/**
 * `location` is `geography(Point,4326)`. PostgREST returns it as WKB hex, which
 * is not worth decoding here — the ETL is expected to also populate plain
 * lat/lon columns, or a view. Until then we take whatever `coerce.coords()` can
 * make of it and log when a row has no usable position.
 */
export async function loadSupabase(): Promise<RawDataset> {
  const notes: string[] = [];
  const url = process.env['NEXT_PUBLIC_SUPABASE_URL'];
  const key = process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY'];

  if (!url || !key) {
    return {
      ...emptyRawDataset(),
      notes: [
        'SEARCHSKI_DATA_SOURCE=supabase but NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY are not set.',
      ],
    };
  }

  const { createClient } = await import('@supabase/supabase-js');
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  }) as unknown as MinimalClient;

  const [areaRows, passRegionRows, israelRows, apresRows, airportRows, transferRows, priceRows] =
    await Promise.all([
      table(client, 'ski_area', `${SKI_AREA_COLUMNS},lat,lon`, notes).then(async (rows) =>
        // Some deployments will not have the convenience lat/lon columns.
        rows.length > 0 ? rows : table(client, 'ski_area', SKI_AREA_COLUMNS, notes),
      ),
      table(client, 'pass_region', '*', notes),
      table(client, 'israel_profile', '*', notes),
      table(client, 'apres_proxy', '*', notes),
      table(client, 'airport', '*', notes),
      table(client, 'airport_transfer', '*', notes),
      table(client, 'pass_price', '*', notes),
    ]);

  const areas = compact(areaRows, coerceSkiArea);
  const positionless = areas.filter((a) => a.lat === 0 && a.lon === 0).length;
  if (positionless > 0) {
    notes.push(
      `${positionless} Supabase ski areas have no readable coordinates — add lat/lon columns or a GeoJSON view. Their maps will not render.`,
    );
  }

  // pass_region.memberAreaIds is not a column; derive it from the areas.
  const passRegions = compact(passRegionRows, coercePassRegion).map((region) => ({
    ...region,
    memberAreaIds:
      region.memberAreaIds.length > 0
        ? region.memberAreaIds
        : areas.filter((a) => a.passRegionId === region.id).map((a) => a.id),
  }));

  return {
    areas,
    passRegions,
    israelProfiles: compact(israelRows, coerceIsraelProfile),
    apres: compact(apresRows, coerceApresProxy),
    airports: compact(airportRows, coerceAirport),
    transfers: compact(transferRows, coerceAirportTransfer),
    passPrices: compact(priceRows, coercePassPrice),
    notes,
  };
}
