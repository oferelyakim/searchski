/**
 * ski_areas.geojson -> SkiArea[].
 *
 * Filters to downhill areas in the target countries and maps upstream's
 * statistics blob onto the frozen domain model in @searchski/core.
 *
 * Everything derived here is arithmetic over numbers OpenSkiMap already
 * published (it computes run lengths from geometry with elevation correction on
 * its side). We do not re-measure pistes from run geometry, because summing
 * runs.geojson per area double-counts shared/parallel segments and disagrees
 * with every published figure. Where we DO measure geometry ourselves — night
 * ski km — the reason is that upstream publishes no lit-length statistic.
 */

import { DIFFICULTIES, type Difficulty, type DifficultyBucket, type LiftTypeBucket, type OperatingStatus, type SkiArea } from '@searchski/core/types';
import { DUMP_URL, OPENSKIMAP_ATTRIBUTION, RUN_TIMESTAMP, rawPath } from './config.ts';
import { representativePoint } from './geo.ts';
import { splitName } from './names.ts';
import { streamFeatures, type StreamStats } from './stream.ts';
import type { CountryOverride } from './overrides.ts';
import type { RawDifficultyStat, RawLiftStat, RawPlace, RawSkiAreaFeature } from './raw.ts';

const DIFFICULTY_SET = new Set<string>(DIFFICULTIES);

const STATUSES = new Set<OperatingStatus>([
  'operating',
  'disused',
  'abandoned',
  'proposed',
  'unknown',
]);

export interface NormalizeDiagnostics {
  /** Features read from the dump. */
  featuresRead: number;
  /** Features whose activities include 'downhill', worldwide. */
  downhillWorldwide: number;
  /** Downhill areas per country code, worldwide — the denominator for coverage. */
  downhillByCountry: Record<string, number>;
  /** Downhill areas in the target countries, before any drop. */
  inTargetCountries: number;
  /** Dropped for want of usable geometry (lat/lon is non-nullable in the model). */
  droppedNoGeometry: number;
  /** Downhill areas with no `places` entry carrying a country at all. */
  noCountry: number;
  /** Difficulty keys upstream emitted that the model does not know about. */
  unknownDifficultyKeys: Record<string, number>;
  /** Ski-area geometry types seen in the target countries. */
  geometryTypes: Record<string, number>;
  /** `places` entries discarded because alpha2 contradicted the subdivision. */
  droppedInconsistentPlaces: number;
  /** Kept areas that touch more than one country. Reported in the QA report. */
  multiCountry: MultiCountryArea[];
  /** Externally-verified country overrides that fired. */
  countryOverridesApplied: AppliedCountryOverride[];
  /** Country overrides that matched no area at all. FIX THESE BY HAND. */
  countryOverridesUnmatched: Array<{ upstreamName: string; openskimapId: string | null }>;
  streamStats: StreamStats;
}

export interface AppliedCountryOverride {
  id: string;
  name: string;
  matchedBy: 'openskimapId' | 'upstreamName';
  /** What the heuristic would have chosen, and how. */
  derivedCountry: string | null;
  derivedChosenBy: PrimaryChosenBy;
  /** What the verified fact says. */
  forcedCountry: string;
  forcedCountries: string[];
  regionCode: string | null;
  /** False when the forced country puts the area outside the target list. */
  keptInBuild: boolean;
  evidence: string | null;
  sourceUrl: string | null;
  checkedOn: string | null;
}

export interface MultiCountryArea {
  id: string;
  name: string;
  /** Primary first. */
  countries: string[];
  primary: string | null;
  primaryChosenBy: string;
  regionCode: string | null;
  kmTotal: number;
  lat: number;
  lon: number;
  droppedInconsistent: number;
}

export interface NormalizeResult {
  areas: SkiArea[];
  diagnostics: NormalizeDiagnostics;
}

function firstNonNull<T>(values: Array<T | null | undefined>): T | null {
  for (const v of values) {
    if (v !== null && v !== undefined && v !== '') return v;
  }
  return null;
}

interface FlatPlaces {
  country: string | null;
  /** Every distinct valid country touched, primary first. */
  countries: string[];
  regionCode: string | null;
  regionName: string | null;
  localities: string[];
  /** How the primary was chosen — surfaced in the QA report for multi-country areas. */
  primaryChosenBy: PrimaryChosenBy;
  /** Entries discarded as internally contradictory. */
  droppedInconsistent: number;
  /** Entries that survived the consistency check, for re-deriving region metadata. */
  validPlaces: RawPlace[];
}

export type PrimaryChosenBy =
  | 'only country'
  | 'frequency'
  | 'regionCode tie-break'
  | 'upstream order'
  | 'external override'
  | 'none';

/**
 * True when a place entry contradicts itself: `iso3166_1Alpha2` disagrees with
 * the country prefix of `iso3166_2`.
 *
 * This is upstream noise and it misassigns real resorts. Observed 2026-07-26:
 * Kaunertaler Gletscher — an Austrian glacier in Tyrol — carries a third place
 * entry reading `{alpha2: 'IT', iso3166_2: 'AT-7'}`. Alpha-2 says Italy while
 * the subdivision is Tyrol; they cannot both be right, so the entry is
 * evidence of nothing and is discarded before any country is chosen.
 *
 * An entry with a null subdivision is NOT inconsistent — there is nothing to
 * disagree with — so Slovenia's `{alpha2: 'SI', iso3166_2: null}` on
 * Macesnovc Rateče is kept.
 */
function isInconsistentPlace(p: RawPlace | null | undefined): boolean {
  const alpha2 = p?.iso3166_1Alpha2?.toUpperCase();
  const sub = p?.iso3166_2?.toUpperCase();
  if (!alpha2 || !sub) return false;
  const prefix = sub.split('-')[0];
  if (!prefix) return false;
  return prefix !== alpha2;
}

/**
 * Flatten `properties.places`, which is an ARRAY — a ski area can straddle a
 * border or several communes.
 *
 * Order of operations matters:
 *  1. Discard internally contradictory entries (see isInconsistentPlace).
 *  2. Collect every distinct remaining country — that is `countries`.
 *  3. Pick the PRIMARY as the most frequently attested country. On a tie,
 *     prefer whichever country matches the region code upstream stated first;
 *     on a further tie, upstream order.
 *  4. Take regionCode/regionName from the primary country's own entries, so a
 *     resort never displays an Austrian subdivision under an Italian flag.
 *
 * Localities collect ALL distinct values across every valid entry, because
 * those are the candidate villages to sleep in (PLAN.md §3).
 */
export function flattenPlaces(places: RawPlace[] | null | undefined): FlatPlaces {
  const all = places ?? [];
  const droppedInconsistent = all.filter(isInconsistentPlace).length;
  const list = all.filter((p) => !isInconsistentPlace(p));

  // Distinct countries in upstream order, with attestation counts.
  const counts = new Map<string, number>();
  for (const p of list) {
    const cc = p?.iso3166_1Alpha2?.toUpperCase();
    if (!cc) continue;
    counts.set(cc, (counts.get(cc) ?? 0) + 1);
  }

  // The region code upstream states first, used only to break a tie.
  const firstRegionCode = firstNonNull(list.map((p) => p?.iso3166_2 ?? null));
  const tieBreakCountry = firstRegionCode?.toUpperCase().split('-')[0] ?? null;

  let country: string | null = null;
  let primaryChosenBy: FlatPlaces['primaryChosenBy'] = 'none';

  if (counts.size === 1) {
    country = [...counts.keys()][0] ?? null;
    primaryChosenBy = 'only country';
  } else if (counts.size > 1) {
    const max = Math.max(...counts.values());
    const leaders = [...counts.entries()].filter(([, n]) => n === max).map(([cc]) => cc);
    if (leaders.length === 1) {
      country = leaders[0] ?? null;
      primaryChosenBy = 'frequency';
    } else if (tieBreakCountry && leaders.includes(tieBreakCountry)) {
      country = tieBreakCountry;
      primaryChosenBy = 'regionCode tie-break';
    } else {
      country = leaders[0] ?? null;
      primaryChosenBy = 'upstream order';
    }
  }

  // Primary first, then the rest in upstream order.
  const countries = country
    ? [country, ...[...counts.keys()].filter((cc) => cc !== country)]
    : [...counts.keys()];

  // Region metadata must come from the primary country's entries.
  const { regionCode, regionName } = deriveRegion(list, country);

  const seen = new Set<string>();
  const localities: string[] = [];
  for (const p of list) {
    const loc = p?.localized?.en?.locality;
    if (!loc) continue;
    const key = loc.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    localities.push(loc);
  }

  return {
    country,
    countries,
    regionCode,
    regionName,
    localities,
    primaryChosenBy,
    droppedInconsistent,
    validPlaces: list,
  };
}

/**
 * Region code/name taken from a specific country's own place entries.
 *
 * Kept separate so a forced primary (see applyCountryOverride) re-derives its
 * region the same way the frequency path does — otherwise forcing Kaunertaler
 * to Austria would leave it displaying the Italian subdivision IT-BZ.
 * Falls back to the first stated value when the country has no entry of its own.
 */
export function deriveRegion(
  validPlaces: RawPlace[],
  country: string | null,
): { regionCode: string | null; regionName: string | null } {
  const primaryEntries = country
    ? validPlaces.filter((p) => p?.iso3166_1Alpha2?.toUpperCase() === country)
    : validPlaces;
  return {
    regionCode:
      firstNonNull(primaryEntries.map((p) => p?.iso3166_2 ?? null)) ??
      firstNonNull(validPlaces.map((p) => p?.iso3166_2 ?? null)),
    regionName:
      firstNonNull(primaryEntries.map((p) => p?.localized?.en?.region ?? null)) ??
      firstNonNull(validPlaces.map((p) => p?.localized?.en?.region ?? null)),
  };
}

/**
 * Overlay an externally-verified country override on a derived FlatPlaces.
 *
 * `forceCountry` becomes the primary. `forceCountries`, when given, replaces the
 * whole array; otherwise the derived array is kept and merely reordered so the
 * forced primary leads. Either way the invariant `countries[0] === country`
 * holds, and region metadata is re-derived from the forced primary's own
 * entries.
 */
export function applyCountryOverride(
  places: FlatPlaces,
  forceCountry: string,
  forceCountries: string[] | null | undefined,
): FlatPlaces {
  const primary = forceCountry.toUpperCase();
  const rest = (forceCountries?.map((c) => c.toUpperCase()) ?? places.countries).filter(
    (c) => c !== primary,
  );
  const { regionCode, regionName } = deriveRegion(places.validPlaces, primary);
  return {
    ...places,
    country: primary,
    countries: [primary, ...rest],
    regionCode,
    regionName,
    primaryChosenBy: 'external override',
  };
}

function num(v: number | null | undefined): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

function nullableNum(v: number | null | undefined): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** Round to `places` decimals — keeps JSON artifacts small and diffable. */
function round(v: number, places = 3): number {
  const f = 10 ** places;
  return Math.round(v * f) / f;
}

function toStatus(raw: string | null | undefined): OperatingStatus {
  if (!raw) return 'unknown';
  const s = raw.toLowerCase() as OperatingStatus;
  return STATUSES.has(s) ? s : 'unknown';
}

interface TerrainDerivation {
  runsTotal: number;
  kmTotal: number;
  snowmakingKm: number;
  runsByDifficulty: Partial<Record<Difficulty, DifficultyBucket>>;
  terrainMix: Partial<Record<Difficulty, number>>;
  minElevM: number | null;
  maxElevM: number | null;
}

/**
 * Map statistics.runs.byActivity.downhill.byDifficulty onto the model.
 *
 * kmTotal INCLUDES the `other` bucket: `other` is untagged-difficulty piste,
 * which is real skiable terrain and belongs in a resort's size. terrainMix
 * EXCLUDES it, per the contract in core/types.ts, because a share-of-ability
 * figure computed over runs of unknown ability is meaningless.
 */
export function deriveTerrain(
  byDifficulty: Record<string, RawDifficultyStat> | null | undefined,
  unknownKeys: Record<string, number>,
): TerrainDerivation {
  const runsByDifficulty: Partial<Record<Difficulty, DifficultyBucket>> = {};
  let runsTotal = 0;
  let kmTotal = 0;
  let snowmakingKm = 0;
  let minElevM: number | null = null;
  let maxElevM: number | null = null;

  for (const [key, stat] of Object.entries(byDifficulty ?? {})) {
    if (!stat) continue;
    if (!DIFFICULTY_SET.has(key)) {
      // Upstream emits difficulty keys the frozen model does not have — as of
      // 2026-07-26, `extreme` (1 Italian area). We cannot add it to
      // runsByDifficulty without changing core/types.ts, and we will not
      // silently re-label it as `expert` because that would be inventing an
      // ability rating. So: its km DOES count toward kmTotal (it is real
      // skiable terrain and belongs in the resort's size) but it is excluded
      // from runsByDifficulty and therefore from terrainMix, exactly like
      // `other`. The key is reported in the QA report so core can be extended.
      unknownKeys[key] = (unknownKeys[key] ?? 0) + 1;
      runsTotal += num(stat.count);
      kmTotal += num(stat.lengthInKm);
      snowmakingKm += num(stat.snowmakingLengthInKm);
      continue;
    }
    const difficulty = key as Difficulty;
    const km = num(stat.lengthInKm);
    const bucket: DifficultyBucket = {
      count: num(stat.count),
      km: round(km),
      minElevM: nullableNum(stat.minElevation),
      maxElevM: nullableNum(stat.maxElevation),
      elevationChangeM: nullableNum(stat.combinedElevationChange),
      // snowfarming (stored snow) is deliberately NOT folded into snowmaking:
      // they are different technologies and conflating them overstates
      // artificial-snow coverage.
      snowmakingKm: round(num(stat.snowmakingLengthInKm)),
    };
    runsByDifficulty[difficulty] = bucket;

    runsTotal += bucket.count;
    kmTotal += km;
    snowmakingKm += num(stat.snowmakingLengthInKm);
    if (bucket.minElevM !== null) minElevM = minElevM === null ? bucket.minElevM : Math.min(minElevM, bucket.minElevM);
    if (bucket.maxElevM !== null) maxElevM = maxElevM === null ? bucket.maxElevM : Math.max(maxElevM, bucket.maxElevM);
  }

  // terrainMix: share of downhill km by difficulty, over non-`other` km only,
  // so the values sum to 1 (within float epsilon) whenever any is defined.
  const mixDenominator = Object.entries(runsByDifficulty)
    .filter(([d]) => d !== 'other')
    .reduce((acc, [, b]) => acc + (b?.km ?? 0), 0);

  const terrainMix: Partial<Record<Difficulty, number>> = {};
  if (mixDenominator > 0) {
    for (const [d, b] of Object.entries(runsByDifficulty)) {
      if (d === 'other' || !b) continue;
      terrainMix[d as Difficulty] = round(b.km / mixDenominator, 4);
    }
  }

  return {
    runsTotal,
    kmTotal: round(kmTotal),
    snowmakingKm: round(snowmakingKm),
    runsByDifficulty,
    terrainMix,
    minElevM,
    maxElevM,
  };
}

interface LiftDerivation {
  liftsTotal: number;
  liftsKmTotal: number;
  liftsByType: Record<string, LiftTypeBucket>;
  minElevM: number | null;
  maxElevM: number | null;
}

export function deriveLifts(byType: Record<string, RawLiftStat> | null | undefined): LiftDerivation {
  const liftsByType: Record<string, LiftTypeBucket> = {};
  let liftsTotal = 0;
  let liftsKmTotal = 0;
  let minElevM: number | null = null;
  let maxElevM: number | null = null;

  for (const [type, stat] of Object.entries(byType ?? {})) {
    if (!stat) continue;
    const bucket: LiftTypeBucket = {
      count: num(stat.count),
      km: round(num(stat.lengthInKm)),
      minElevM: nullableNum(stat.minElevation),
      maxElevM: nullableNum(stat.maxElevation),
    };
    liftsByType[type] = bucket;
    liftsTotal += bucket.count;
    liftsKmTotal += bucket.km;
    if (bucket.minElevM !== null) minElevM = minElevM === null ? bucket.minElevM : Math.min(minElevM, bucket.minElevM);
    if (bucket.maxElevM !== null) maxElevM = maxElevM === null ? bucket.maxElevM : Math.max(maxElevM, bucket.maxElevM);
  }

  return { liftsTotal, liftsKmTotal: round(liftsKmTotal), liftsByType, minElevM, maxElevM };
}

/**
 * Parse ski_areas.geojson and emit SkiArea rows for the target countries.
 *
 * Fields owned by later stages are left at their "not computed yet" values:
 * hasNightSki/nightSkiKm null, capacity 0/null, isSignificant false,
 * passRegionId null. build.ts fills them in order.
 */
export async function normalize(
  countries: readonly string[],
  countryOverrides: readonly CountryOverride[] = [],
): Promise<NormalizeResult> {
  const target = new Set(countries.map((c) => c.toUpperCase()));
  const overrideById = new Map(
    countryOverrides.filter((o) => o.openskimapId).map((o) => [o.openskimapId as string, o]),
  );
  const overrideByName = new Map(countryOverrides.map((o) => [o.upstreamName, o]));
  const firedOverrides = new Set<CountryOverride>();
  const streamStats: StreamStats = { parsed: 0, skipped: 0 };
  const diagnostics: NormalizeDiagnostics = {
    featuresRead: 0,
    downhillWorldwide: 0,
    downhillByCountry: {},
    inTargetCountries: 0,
    droppedNoGeometry: 0,
    noCountry: 0,
    unknownDifficultyKeys: {},
    geometryTypes: {},
    droppedInconsistentPlaces: 0,
    multiCountry: [],
    countryOverridesApplied: [],
    countryOverridesUnmatched: [],
    streamStats,
  };

  const areas: SkiArea[] = [];

  for await (const feature of streamFeatures<RawSkiAreaFeature>(rawPath('ski_areas'), streamStats)) {
    diagnostics.featuresRead++;
    const props = feature.properties;
    if (!props?.id) continue;

    const activities = props.activities ?? [];
    if (!activities.includes('downhill')) continue;
    diagnostics.downhillWorldwide++;

    const derived = flattenPlaces(props.places);
    diagnostics.droppedInconsistentPlaces += derived.droppedInconsistent;

    // An externally-verified country override beats the heuristic. Applied HERE,
    // before the target-country filter, so forcing an area out of the target
    // list actually removes it from the build.
    const displayName = splitName(props.name, props.id).name;
    const override = overrideById.get(props.id) ?? overrideByName.get(displayName);
    let places = derived;
    if (override) {
      firedOverrides.add(override);
      places = applyCountryOverride(derived, override.forceCountry, override.forceCountries);
      const keptInBuild = target.has(places.country ?? '');
      diagnostics.countryOverridesApplied.push({
        id: props.id,
        name: displayName,
        matchedBy: overrideById.has(props.id) ? 'openskimapId' : 'upstreamName',
        derivedCountry: derived.country,
        derivedChosenBy: derived.primaryChosenBy,
        forcedCountry: places.country ?? override.forceCountry,
        forcedCountries: places.countries,
        regionCode: places.regionCode,
        keptInBuild,
        evidence: override.evidence ?? null,
        sourceUrl: override.sourceUrl ?? null,
        checkedOn: override.checkedOn ?? null,
      });
      console.log(
        `[normalize] country override: ${displayName} ${derived.country} -> ${places.country}` +
          ` (${keptInBuild ? 'stays in build' : 'leaves build'})`,
      );
    }

    if (places.country === null) {
      diagnostics.noCountry++;
    } else {
      diagnostics.downhillByCountry[places.country] =
        (diagnostics.downhillByCountry[places.country] ?? 0) + 1;
    }

    // Dataset selection matches on the PRIMARY country only, deliberately.
    // Matching on any of `countries` would drag every Austrian, French and Swiss
    // border resort into a nominally GE/BG/IT build. `countries` exists so a
    // SEARCH filter can match either side (see failedHardFilters in
    // core/scoring.ts); it is not a widening of Stage 0's scope.
    if (places.country === null || !target.has(places.country)) continue;
    diagnostics.inTargetCountries++;

    const geomType = feature.geometry?.type ?? 'none';
    diagnostics.geometryTypes[geomType] = (diagnostics.geometryTypes[geomType] ?? 0) + 1;

    const point = representativePoint(feature.geometry);
    if (!point) {
      diagnostics.droppedNoGeometry++;
      continue;
    }

    if (places.countries.length > 1) {
      diagnostics.multiCountry.push({
        id: props.id,
        name: displayName,
        countries: places.countries,
        primary: places.country,
        primaryChosenBy: places.primaryChosenBy,
        regionCode: places.regionCode,
        kmTotal: 0, // filled below once terrain is derived
        lat: round(point.lat, 6),
        lon: round(point.lon, 6),
        droppedInconsistent: places.droppedInconsistent,
      });
    }

    const { name, aliases } = splitName(props.name, props.id);

    const downhillStats = props.statistics?.runs?.byActivity?.['downhill']?.byDifficulty ?? null;
    const terrain = deriveTerrain(downhillStats, diagnostics.unknownDifficultyKeys);
    const lifts = deriveLifts(props.statistics?.lifts?.byType);

    // Elevation: prefer the downhill-only extremes derived from the difficulty
    // buckets, because statistics.runs.{min,max}Elevation spans ALL activities
    // and a nordic loop in the valley would drag the base elevation down.
    // Fall back to the all-activity figure, then to lift extremes.
    const topElevM =
      terrain.maxElevM ??
      nullableNum(props.statistics?.runs?.maxElevation) ??
      lifts.maxElevM ??
      nullableNum(props.statistics?.lifts?.maxElevation);
    const baseElevM =
      terrain.minElevM ??
      nullableNum(props.statistics?.runs?.minElevation) ??
      lifts.minElevM ??
      nullableNum(props.statistics?.lifts?.minElevation);
    const verticalM =
      topElevM !== null && baseElevM !== null ? Math.round(topElevM - baseElevM) : null;

    // Backfill km on the multi-country record now that terrain is derived.
    const mc = diagnostics.multiCountry.at(-1);
    if (mc && mc.id === props.id) mc.kmTotal = terrain.kmTotal;

    areas.push({
      id: props.id,
      name,
      aliases,
      country: places.country,
      countries: places.countries,
      regionCode: places.regionCode,
      regionName: places.regionName,
      localities: places.localities,
      lat: round(point.lat, 6),
      lon: round(point.lon, 6),
      status: toStatus(props.status),
      websites: props.websites ?? [],
      wikidataId: props.wikidataID ?? null,

      baseElevM: baseElevM === null ? null : Math.round(baseElevM),
      topElevM: topElevM === null ? null : Math.round(topElevM),
      verticalM,

      runsTotal: terrain.runsTotal,
      kmTotal: terrain.kmTotal,
      runsByDifficulty: terrain.runsByDifficulty,

      liftsTotal: lifts.liftsTotal,
      liftsKmTotal: lifts.liftsKmTotal,
      liftsByType: lifts.liftsByType,

      snowmakingKm: terrain.snowmakingKm,
      hasNightSki: null, // set by nightski.ts — null means UNKNOWN, never "no"
      nightSkiKm: null,

      uphillCapacityPph: 0, // set by capacity.ts
      capacityPerKm: null,

      terrainMix: terrain.terrainMix,
      isSignificant: false, // set by significance.ts
      passRegionId: null, // set by passRegions.ts

      provenance: {
        source: 'openskimap',
        sourceUrl: DUMP_URL.ski_areas,
        fetchedAt: RUN_TIMESTAMP,
        note: OPENSKIMAP_ATTRIBUTION,
      },
    });
  }

  // A country override that never fired is a silent no-op — surface it.
  for (const o of countryOverrides) {
    if (firedOverrides.has(o)) continue;
    diagnostics.countryOverridesUnmatched.push({
      upstreamName: o.upstreamName,
      openskimapId: o.openskimapId,
    });
    console.warn(
      `[normalize] country override matched NOTHING: "${o.upstreamName}"` +
        `${o.openskimapId ? ` (id ${o.openskimapId})` : ''} — skipped.`,
    );
  }

  // Stable output ordering so data/build/*.json diffs are meaningful.
  areas.sort((a, b) => (a.country ?? '').localeCompare(b.country ?? '') || b.kmTotal - a.kmTotal || a.id.localeCompare(b.id));

  return { areas, diagnostics };
}
