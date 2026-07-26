/**
 * Defensive coercion from loosely-shaped rows into the contract types.
 *
 * Two producers feed this app and neither is under our control:
 *   * the ETL writes camelCase JSON into data/build/
 *   * Supabase returns snake_case columns
 *
 * Every reader here accepts both spellings and supplies a safe default, so a
 * missing or renamed field degrades a single value rather than 500-ing a page.
 * Nothing is invented: a missing number becomes null, never a guess.
 */

import type {
  Airport,
  AirportTransfer,
  ApresProxy,
  Difficulty,
  DifficultyBucket,
  IsraelProfile,
  LiftTypeBucket,
  OperatingStatus,
  PassPrice,
  PassRegion,
  Provenance,
  SkiArea,
  SourceKind,
  VerificationStatus,
} from '@searchski/core/types';

export type Row = Record<string, unknown>;

const OPERATING_STATUSES: readonly OperatingStatus[] = [
  'operating',
  'disused',
  'abandoned',
  'proposed',
  'unknown',
];
const VERIFICATIONS: readonly VerificationStatus[] = ['verified', 'unverified', 'stale'];
const SOURCE_KINDS: readonly SourceKind[] = [
  'openskimap',
  'openstreetmap',
  'wikidata',
  'derived',
  'curated',
  'official',
];

/** Difficulty order used everywhere in the UI (easiest first). */
export const DIFFICULTY_ORDER: readonly Difficulty[] = [
  'novice',
  'easy',
  'intermediate',
  'advanced',
  'expert',
  'freeride',
  'other',
];

export function isRow(value: unknown): value is Row {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Read the first present key from a row, trying camelCase then snake_case. */
function pick(row: Row, ...keys: string[]): unknown {
  for (const key of keys) {
    const v = row[key];
    if (v !== undefined) return v;
  }
  return undefined;
}

export function str(row: Row, ...keys: string[]): string | null {
  const v = pick(row, ...keys);
  return typeof v === 'string' && v.length > 0 ? v : null;
}

export function reqStr(fallback: string, row: Row, ...keys: string[]): string {
  return str(row, ...keys) ?? fallback;
}

export function num(row: Row, ...keys: string[]): number | null {
  const v = pick(row, ...keys);
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

export function reqNum(fallback: number, row: Row, ...keys: string[]): number {
  return num(row, ...keys) ?? fallback;
}

export function bool(row: Row, ...keys: string[]): boolean | null {
  const v = pick(row, ...keys);
  if (typeof v === 'boolean') return v;
  if (v === 'true') return true;
  if (v === 'false') return false;
  return null;
}

export function strArray(row: Row, ...keys: string[]): string[] {
  const v = pick(row, ...keys);
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === 'string');
  if (typeof v === 'string' && v.length > 0) return [v];
  return [];
}

function level0to3(row: Row, ...keys: string[]): 0 | 1 | 2 | 3 | null {
  const n = num(row, ...keys);
  if (n === null) return null;
  const r = Math.round(n);
  return r === 0 || r === 1 || r === 2 || r === 3 ? r : null;
}

export function coerceProvenance(value: unknown, fallbackSource: SourceKind, row?: Row): Provenance {
  const p = isRow(value) ? value : {};
  const rawSource = str(p, 'source') ?? (row ? str(row, 'source') : null);
  const source = SOURCE_KINDS.find((s) => s === rawSource) ?? fallbackSource;

  const rawVerification = str(p, 'verification') ?? (row ? str(row, 'verification') : null);
  const verification = VERIFICATIONS.find((v) => v === rawVerification);

  const provenance: Provenance = {
    source,
    sourceUrl: str(p, 'sourceUrl', 'source_url') ?? (row ? str(row, 'sourceUrl', 'source_url') : null),
    fetchedAt:
      str(p, 'fetchedAt', 'fetched_at') ??
      (row ? str(row, 'fetchedAt', 'fetched_at', 'curatedAt', 'curated_at') : null) ??
      new Date(0).toISOString(),
    note: str(p, 'note'),
  };
  if (verification) provenance.verification = verification;
  return provenance;
}

function coerceDifficultyBucket(value: unknown): DifficultyBucket {
  const r = isRow(value) ? value : {};
  return {
    count: reqNum(0, r, 'count', 'runs'),
    km: reqNum(0, r, 'km'),
    minElevM: num(r, 'minElevM', 'min_elev_m'),
    maxElevM: num(r, 'maxElevM', 'max_elev_m'),
    elevationChangeM: num(r, 'elevationChangeM', 'elevation_change_m'),
    snowmakingKm: reqNum(0, r, 'snowmakingKm', 'snowmaking_km'),
  };
}

function coerceLiftBucket(value: unknown): LiftTypeBucket {
  const r = isRow(value) ? value : {};
  return {
    count: reqNum(0, r, 'count', 'lifts'),
    km: reqNum(0, r, 'km'),
    minElevM: num(r, 'minElevM', 'min_elev_m'),
    maxElevM: num(r, 'maxElevM', 'max_elev_m'),
  };
}

/** PostGIS `location` may come back as GeoJSON, WKT, or plain lat/lon columns. */
function coords(row: Row): { lat: number; lon: number } {
  const lat = num(row, 'lat', 'latitude');
  const lon = num(row, 'lon', 'lng', 'longitude');
  if (lat !== null && lon !== null) return { lat, lon };

  const loc = pick(row, 'location', 'centroid', 'geom');
  if (isRow(loc)) {
    const c = loc['coordinates'];
    if (Array.isArray(c) && typeof c[0] === 'number' && typeof c[1] === 'number') {
      return { lon: c[0], lat: c[1] };
    }
  }
  if (typeof loc === 'string') {
    const m = loc.match(/POINT\s*\(\s*(-?[\d.]+)\s+(-?[\d.]+)\s*\)/i);
    if (m && m[1] !== undefined && m[2] !== undefined) {
      return { lon: Number(m[1]), lat: Number(m[2]) };
    }
  }
  return { lat: 0, lon: 0 };
}

export function coerceSkiArea(value: unknown): SkiArea | null {
  if (!isRow(value)) return null;
  const id = str(value, 'id', 'openskimapId', 'openskimap_id', 'skiAreaId', 'ski_area_id');
  if (!id) return null;

  const { lat, lon } = coords(value);

  const runsByDifficulty: Partial<Record<Difficulty, DifficultyBucket>> = {};
  const rawRuns = pick(value, 'runsByDifficulty', 'runs_by_difficulty', 'kmByDifficulty', 'km_by_difficulty');
  if (isRow(rawRuns)) {
    for (const d of DIFFICULTY_ORDER) {
      const bucket = rawRuns[d];
      if (bucket !== undefined) runsByDifficulty[d] = coerceDifficultyBucket(bucket);
    }
  }

  const liftsByType: Record<string, LiftTypeBucket> = {};
  const rawLifts = pick(value, 'liftsByType', 'lifts_by_type');
  if (isRow(rawLifts)) {
    for (const [k, v] of Object.entries(rawLifts)) liftsByType[k] = coerceLiftBucket(v);
  }

  const terrainMix: Partial<Record<Difficulty, number>> = {};
  const rawMix = pick(value, 'terrainMix', 'terrain_mix');
  if (isRow(rawMix)) {
    for (const d of DIFFICULTY_ORDER) {
      const n = num(rawMix, d);
      if (n !== null) terrainMix[d] = n;
    }
  }

  const rawStatus = str(value, 'status');
  const kmTotal = reqNum(0, value, 'kmTotal', 'km_total');
  const uphillCapacityPph = reqNum(0, value, 'uphillCapacityPph', 'uphill_capacity_pph');
  const capacityPerKm =
    num(value, 'capacityPerKm', 'capacity_per_km') ??
    (kmTotal > 0 && uphillCapacityPph > 0 ? uphillCapacityPph / kmTotal : null);

  const country = str(value, 'country');
  // Border resorts belong to both sides; `countries` is authoritative for
  // filtering, `country` for display. Older rows carry only `country`.
  const countries = strArray(value, 'countries');

  return {
    id,
    name: reqStr(id, value, 'name'),
    aliases: strArray(value, 'aliases'),
    country,
    countries: countries.length > 0 ? countries : country ? [country] : [],
    boundaryNote: str(value, 'boundaryNote', 'boundary_note'),
    regionCode: str(value, 'regionCode', 'region_code'),
    regionName: str(value, 'regionName', 'region_name'),
    localities: strArray(value, 'localities'),
    lat,
    lon,
    status: OPERATING_STATUSES.find((s) => s === rawStatus) ?? 'unknown',
    websites: strArray(value, 'websites', 'website'),
    wikidataId: str(value, 'wikidataId', 'wikidata_qid', 'wikidata_id'),
    baseElevM: num(value, 'baseElevM', 'base_elev_m'),
    topElevM: num(value, 'topElevM', 'top_elev_m'),
    verticalM: num(value, 'verticalM', 'vertical_m'),
    runsTotal: reqNum(0, value, 'runsTotal', 'runs_total'),
    kmTotal,
    runsByDifficulty,
    liftsTotal: reqNum(0, value, 'liftsTotal', 'lifts_total'),
    liftsKmTotal: reqNum(0, value, 'liftsKmTotal', 'lifts_km_total'),
    liftsByType,
    snowmakingKm: reqNum(0, value, 'snowmakingKm', 'snowmaking_km'),
    hasNightSki: bool(value, 'hasNightSki', 'has_night_ski'),
    nightSkiKm: num(value, 'nightSkiKm', 'night_ski_km', 'kmLit', 'km_lit'),
    uphillCapacityPph,
    capacityPerKm,
    terrainMix,
    isSignificant: bool(value, 'isSignificant', 'is_significant') ?? true,
    passRegionId: str(value, 'passRegionId', 'pass_region_id'),
    provenance: coerceProvenance(pick(value, 'provenance'), 'openskimap', value),
  };
}

export function coercePassRegion(value: unknown): PassRegion | null {
  if (!isRow(value)) return null;
  const id = str(value, 'id', 'passRegionId', 'pass_region_id');
  if (!id) return null;
  return {
    id,
    name: reqStr(id, value, 'name'),
    country: reqStr('', value, 'country'),
    marketedKm: num(value, 'marketedKm', 'marketed_km', 'totalKm', 'total_km'),
    officialUrl: str(value, 'officialUrl', 'official_url'),
    memberAreaIds: strArray(value, 'memberAreaIds', 'member_area_ids'),
    provenance: coerceProvenance(pick(value, 'provenance'), 'curated', value),
  };
}

export function coerceIsraelProfile(value: unknown): IsraelProfile | null {
  if (!isRow(value)) return null;
  const skiAreaId = str(value, 'skiAreaId', 'ski_area_id');
  if (!skiAreaId) return null;
  return {
    skiAreaId,
    kosherAvailability: level0to3(value, 'kosherAvailability', 'kosher_availability'),
    kosherNotes: str(value, 'kosherNotes', 'kosher_notes'),
    chabadDistanceKm: num(value, 'chabadDistanceKm', 'chabad_distance_km'),
    chabadName: str(value, 'chabadName', 'chabad_name'),
    hebrewSkiSchool: bool(value, 'hebrewSkiSchool', 'hebrew_ski_school'),
    hebrewSkiSchoolNotes: str(value, 'hebrewSkiSchoolNotes', 'hebrew_ski_school_notes'),
    shabbatNotes: str(value, 'shabbatNotes', 'shabbat_notes'),
    apresLevel: level0to3(value, 'apresLevel', 'apres_level'),
    familyScore: level0to3(value, 'familyScore', 'family_score'),
    israeliGatewayAirports: strArray(value, 'israeliGatewayAirports', 'israeli_gateway_airports'),
    // Curated rows default to `unverified` on purpose. See PLAN.md §9.
    provenance: coerceProvenance(pick(value, 'provenance'), 'curated', value),
  };
}

export function coerceApresProxy(value: unknown): ApresProxy | null {
  if (!isRow(value)) return null;
  const skiAreaId = str(value, 'skiAreaId', 'ski_area_id');
  if (!skiAreaId) return null;
  return {
    skiAreaId,
    barCount: reqNum(0, value, 'barCount', 'bar_count'),
    restaurantCount: reqNum(0, value, 'restaurantCount', 'restaurant_count'),
    nightclubCount: reqNum(0, value, 'nightclubCount', 'nightclub_count'),
    densityScore: reqNum(0, value, 'densityScore', 'density_score'),
    provenance: coerceProvenance(pick(value, 'provenance'), 'openstreetmap', value),
  };
}

export function coerceAirport(value: unknown): Airport | null {
  if (!isRow(value)) return null;
  const iata = str(value, 'iata', 'airportIata', 'airport_iata');
  if (!iata) return null;
  const { lat, lon } = coords(value);
  return {
    iata,
    name: reqStr(iata, value, 'name'),
    country: reqStr('', value, 'country'),
    lat,
    lon,
    directFromTLV: bool(value, 'directFromTLV', 'direct_from_tlv') ?? false,
  };
}

export function coerceAirportTransfer(value: unknown): AirportTransfer | null {
  if (!isRow(value)) return null;
  const airportIata = str(value, 'airportIata', 'airport_iata');
  const skiAreaId = str(value, 'skiAreaId', 'ski_area_id');
  const driveMinutes = num(value, 'driveMinutes', 'drive_minutes');
  if (!airportIata || !skiAreaId || driveMinutes === null) return null;
  return {
    airportIata,
    skiAreaId,
    driveMinutes,
    distanceKm: reqNum(0, value, 'distanceKm', 'distance_km'),
    provenance: coerceProvenance(pick(value, 'provenance'), 'derived', value),
  };
}

export function coercePassPrice(value: unknown): PassPrice | null {
  if (!isRow(value)) return null;
  const price = num(value, 'price');
  if (price === null) return null;
  const category = str(value, 'category') ?? 'adult';
  const duration = str(value, 'duration') ?? '1day';
  const validCategory = ['adult', 'youth', 'child', 'senior'].includes(category)
    ? (category as PassPrice['category'])
    : 'adult';
  const validDuration = ['1day', '3day', '6day', 'season'].includes(duration)
    ? (duration as PassPrice['duration'])
    : '1day';
  return {
    passRegionId: str(value, 'passRegionId', 'pass_region_id'),
    skiAreaId: str(value, 'skiAreaId', 'ski_area_id'),
    season: reqStr('', value, 'season'),
    category: validCategory,
    duration: validDuration,
    price,
    currency: reqStr('EUR', value, 'currency'),
    isDynamic: bool(value, 'isDynamic', 'is_dynamic') ?? false,
    provenance: coerceProvenance(pick(value, 'provenance'), 'curated', value),
  };
}

/**
 * Accept `[...]`, `{ items: [...] }`, `{ data: [...] }` or
 * `{ skiAreas: [...] }` — we do not control what the ETL chooses to wrap in.
 */
export function unwrapList(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (isRow(payload)) {
    for (const key of ['items', 'data', 'rows', 'records', 'features']) {
      const v = payload[key];
      if (Array.isArray(v)) return v;
    }
    // Single-key object wrapping exactly one array, whatever it is named.
    const arrays = Object.values(payload).filter(Array.isArray);
    if (arrays.length === 1 && arrays[0]) return arrays[0];
  }
  return [];
}
