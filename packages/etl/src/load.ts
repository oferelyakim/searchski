/**
 * Load data/build/*.json into Postgres.
 *
 *   DATABASE_URL=postgresql://... npm run -w @searchski/etl load
 *
 * With DATABASE_URL unset this prints what it WOULD do and exits 0. That is the
 * expected state for Stage 0 — the app runs entirely from the committed JSON
 * artifacts (see .env.example, SEARCHSKI_DATA_SOURCE=static). A missing
 * database is a configuration, not a failure, and must never break a build.
 *
 * Idempotency: every write is an INSERT ... ON CONFLICT DO UPDATE keyed on the
 * natural primary key (ski_area.id is the OpenSkiMap id). Re-running is safe and
 * converges. Aliases are deleted-then-reinserted per area, because an alias
 * removed upstream must disappear rather than linger.
 *
 * Ordering is forced by foreign keys: pass_region before ski_area (ski_area
 * references it), ski_area before ski_area_alias and pass_price.
 */

import { promises as fsp } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import postgres from 'postgres';
import type { PassPrice, PassRegion, SkiArea } from '@searchski/core/types';
import { BUILD_DIR } from './config.ts';
import { detectScript } from './names.ts';

/** Batch size for multi-row upserts. Keeps parameter counts inside Postgres limits. */
const CHUNK = 250;

function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function readJson<T>(file: string): Promise<T> {
  const raw = await fsp.readFile(path.join(BUILD_DIR, file), 'utf8');
  return JSON.parse(raw) as T;
}

/** Same, but a missing file is a valid state rather than an error. */
async function readJsonIfPresent<T>(file: string): Promise<T | null> {
  try {
    return await readJson<T>(file);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
}

export interface LoadCounts {
  passRegions: number;
  skiAreas: number;
  aliases: number;
  passPrices: number;
  /** Rows dropped because their ski_area_id is not in ski_areas.json. */
  passPricesSkipped: number;
}

export async function load(databaseUrl: string): Promise<LoadCounts> {
  const areas = await readJson<SkiArea[]>('ski_areas.json');
  const regions = await readJson<PassRegion[]>('pass_regions.json');
  // Written by `npm run prices:discover`. Absent on a fresh clone, which is
  // fine — the site renders "price not available" and that is correct.
  const passPrices = (await readJsonIfPresent<PassPrice[]>('pass_prices.json')) ?? [];

  // ssl:'require' is what Supabase's pooler expects; `postgres` still honours
  // sslmode in the URL if the caller set one explicitly.
  const sql = postgres(databaseUrl, { ssl: 'require', max: 4, onnotice: () => {} });

  const counts: LoadCounts = {
    passRegions: 0,
    skiAreas: 0,
    aliases: 0,
    passPrices: 0,
    passPricesSkipped: 0,
  };

  try {
    await sql.begin(async (tx) => {
      // --- pass_region first: ski_area.pass_region_id references it ---------
      for (const batch of chunk(regions, CHUNK)) {
        const rows = batch.map((r) => ({
          id: r.id,
          name: r.name,
          country: r.country,
          marketed_km: r.marketedKm,
          official_url: r.officialUrl,
          source: r.provenance.source,
          verification: r.provenance.verification ?? 'unverified',
          fetched_at: r.provenance.fetchedAt,
        }));
        await tx`
          INSERT INTO pass_region ${tx(rows)}
          ON CONFLICT (id) DO UPDATE SET
            name         = EXCLUDED.name,
            country      = EXCLUDED.country,
            marketed_km  = EXCLUDED.marketed_km,
            official_url = EXCLUDED.official_url,
            source       = EXCLUDED.source,
            verification = EXCLUDED.verification,
            fetched_at   = EXCLUDED.fetched_at
        `;
        counts.passRegions += rows.length;
      }

      // --- ski_area --------------------------------------------------------
      // location is geography(Point,4326): built from lon/lat via PostGIS.
      // ST_MakePoint takes (x=lon, y=lat) — swapping them silently puts every
      // resort in the wrong hemisphere, so it is spelled out here.
      for (const batch of chunk(areas, CHUNK)) {
        const rows = batch.map((a) => ({
          id: a.id,
          name: a.name,
          country: a.country,
          countries: a.countries ?? (a.country ? [a.country] : []),
          region_code: a.regionCode,
          region_name: a.regionName,
          localities: a.localities,
          lon: a.lon,
          lat: a.lat,
          status: a.status,
          websites: a.websites,
          wikidata_qid: a.wikidataId,
          base_elev_m: a.baseElevM,
          top_elev_m: a.topElevM,
          vertical_m: a.verticalM,
          runs_total: a.runsTotal,
          km_total: a.kmTotal,
          runs_by_difficulty: JSON.stringify(a.runsByDifficulty),
          terrain_mix: JSON.stringify(a.terrainMix),
          lifts_total: a.liftsTotal,
          lifts_km_total: a.liftsKmTotal,
          lifts_by_type: JSON.stringify(a.liftsByType),
          snowmaking_km: a.snowmakingKm,
          has_night_ski: a.hasNightSki,
          night_ski_km: a.nightSkiKm,
          uphill_capacity_pph: a.uphillCapacityPph,
          capacity_per_km: a.capacityPerKm,
          is_significant: a.isSignificant,
          pass_region_id: a.passRegionId,
          boundary_note: a.boundaryNote ?? null,
          source: a.provenance.source,
          fetched_at: a.provenance.fetchedAt,
        }));

        await tx`
          INSERT INTO ski_area (
            id, name, country, countries, region_code, region_name, localities, location,
            status, websites, wikidata_qid, base_elev_m, top_elev_m, vertical_m,
            runs_total, km_total, runs_by_difficulty, terrain_mix,
            lifts_total, lifts_km_total, lifts_by_type,
            snowmaking_km, has_night_ski, night_ski_km,
            uphill_capacity_pph, capacity_per_km, is_significant, pass_region_id,
            boundary_note, source, fetched_at, updated_at
          )
          SELECT
            v.id, v.name, v.country, v.countries, v.region_code, v.region_name, v.localities,
            ST_SetSRID(ST_MakePoint(v.lon, v.lat), 4326)::geography,
            v.status::operating_status, v.websites, v.wikidata_qid,
            v.base_elev_m, v.top_elev_m, v.vertical_m,
            v.runs_total, v.km_total, v.runs_by_difficulty::jsonb, v.terrain_mix::jsonb,
            v.lifts_total, v.lifts_km_total, v.lifts_by_type::jsonb,
            v.snowmaking_km, v.has_night_ski, v.night_ski_km,
            v.uphill_capacity_pph, v.capacity_per_km, v.is_significant, v.pass_region_id,
            v.boundary_note, v.source, v.fetched_at, now()
          FROM ${tx(rows)} AS v
          ON CONFLICT (id) DO UPDATE SET
            name                = EXCLUDED.name,
            country             = EXCLUDED.country,
            countries           = EXCLUDED.countries,
            region_code         = EXCLUDED.region_code,
            region_name         = EXCLUDED.region_name,
            localities          = EXCLUDED.localities,
            location            = EXCLUDED.location,
            status              = EXCLUDED.status,
            websites            = EXCLUDED.websites,
            wikidata_qid        = EXCLUDED.wikidata_qid,
            base_elev_m         = EXCLUDED.base_elev_m,
            top_elev_m          = EXCLUDED.top_elev_m,
            vertical_m          = EXCLUDED.vertical_m,
            runs_total          = EXCLUDED.runs_total,
            km_total            = EXCLUDED.km_total,
            runs_by_difficulty  = EXCLUDED.runs_by_difficulty,
            terrain_mix         = EXCLUDED.terrain_mix,
            lifts_total         = EXCLUDED.lifts_total,
            lifts_km_total      = EXCLUDED.lifts_km_total,
            lifts_by_type       = EXCLUDED.lifts_by_type,
            snowmaking_km       = EXCLUDED.snowmaking_km,
            has_night_ski       = EXCLUDED.has_night_ski,
            night_ski_km        = EXCLUDED.night_ski_km,
            uphill_capacity_pph = EXCLUDED.uphill_capacity_pph,
            capacity_per_km     = EXCLUDED.capacity_per_km,
            is_significant      = EXCLUDED.is_significant,
            pass_region_id      = EXCLUDED.pass_region_id,
            boundary_note       = EXCLUDED.boundary_note,
            source              = EXCLUDED.source,
            fetched_at          = EXCLUDED.fetched_at,
            updated_at          = now()
        `;
        counts.skiAreas += rows.length;
      }

      // --- ski_area_alias: replace wholesale per area -----------------------
      const ids = areas.map((a) => a.id);
      for (const batch of chunk(ids, CHUNK)) {
        await tx`DELETE FROM ski_area_alias WHERE ski_area_id IN ${tx(batch)}`;
      }

      const aliasRows = areas.flatMap((a) =>
        // Dedupe within an area: (ski_area_id, alias) is the primary key, and a
        // duplicate in one INSERT would abort the whole statement.
        [...new Set(a.aliases)].map((alias) => ({
          ski_area_id: a.id,
          alias,
          script: detectScript(alias),
        })),
      );
      for (const batch of chunk(aliasRows, CHUNK)) {
        await tx`
          INSERT INTO ski_area_alias ${tx(batch)}
          ON CONFLICT (ski_area_id, alias) DO UPDATE SET script = EXCLUDED.script
        `;
        counts.aliases += batch.length;
      }

      // --- pass_price ------------------------------------------------------
      // Two guards before anything is written, both restating rules the
      // discovery tool already enforces — this is the last gate before the
      // data becomes queryable, and it is cheap to check twice:
      //   * a price with no source_url is discarded, never stored;
      //   * verification is forced to 'unverified'. Nothing in this pipeline
      //     may promote its own findings to fact.
      const knownAreaIds = new Set(ids);
      const priceRows = passPrices.filter((p) => {
        if (!p.skiAreaId || !knownAreaIds.has(p.skiAreaId)) return false;
        if (!p.provenance?.sourceUrl) return false;
        return Number.isFinite(p.price);
      });
      counts.passPricesSkipped = passPrices.length - priceRows.length;

      // pass_price has a surrogate bigserial key and no natural unique
      // constraint, so ON CONFLICT has nothing to key on. Instead, clear the
      // exact (area, season) pairs we are about to rewrite. Region-level rows
      // and other seasons — including anything a human added by hand — are
      // left alone, because ski_area_id = ANY(...) never matches NULL.
      const bySeason = new Map<string, string[]>();
      for (const p of priceRows) {
        const list = bySeason.get(p.season);
        if (list) list.push(p.skiAreaId as string);
        else bySeason.set(p.season, [p.skiAreaId as string]);
      }
      for (const [season, areaIds] of bySeason) {
        for (const batch of chunk([...new Set(areaIds)], CHUNK)) {
          await tx`
            DELETE FROM pass_price
            WHERE season = ${season} AND ski_area_id = ANY(${batch})
          `;
        }
      }

      for (const batch of chunk(priceRows, CHUNK)) {
        const rows = batch.map((p) => ({
          pass_region_id: p.passRegionId,
          ski_area_id: p.skiAreaId,
          season: p.season,
          category: p.category,
          duration: p.duration,
          price: p.price,
          currency: p.currency,
          is_dynamic: p.isDynamic,
          source: p.provenance.source,
          source_url: p.provenance.sourceUrl ?? null,
          verification: 'unverified',
          fetched_at: p.provenance.fetchedAt,
        }));
        await tx`INSERT INTO pass_price ${tx(rows)}`;
        counts.passPrices += rows.length;
      }
    });
  } finally {
    await sql.end({ timeout: 5 });
  }

  return counts;
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    console.log('');
    console.log('[load] DATABASE_URL is not set — nothing to load. This is expected.');
    console.log('');
    console.log('  Stage 0 runs entirely from the committed JSON artifacts:');
    console.log('    data/build/ski_areas.json');
    console.log('    data/build/pass_regions.json');
    console.log('    data/build/pass_prices.json   (optional; written by prices:discover)');
    console.log('  and .env.example ships with SEARCHSKI_DATA_SOURCE=static for exactly this.');
    console.log('');
    console.log('  To load Postgres later:');
    console.log('    1. create the Supabase project');
    console.log('    2. run db/migrations/*.sql in the SQL editor, in order');
    console.log('       (0001_init.sql, then 0002_boundary_note.sql)');
    console.log('    3. DATABASE_URL=postgresql://... npm run -w @searchski/etl load');
    console.log('');
    process.exit(0);
  }

  try {
    const counts = await load(databaseUrl);
    console.log(
      `[load] upserted ${counts.skiAreas} ski areas, ${counts.passRegions} pass regions, ${counts.aliases} aliases, ${counts.passPrices} pass prices.`,
    );
    if (counts.passPricesSkipped > 0) {
      console.log(
        `[load] skipped ${counts.passPricesSkipped} pass price row(s): no source URL, or an unknown ski_area_id.`,
      );
    }
  } catch (err) {
    // A database that is unreachable/misconfigured is a real failure — but it
    // must be a legible one, not a driver stack trace.
    console.error('[load] FAILED. The build artifacts in data/build/ are untouched and still valid.');
    console.error(`[load] ${(err as Error).message}`);
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main();
}
