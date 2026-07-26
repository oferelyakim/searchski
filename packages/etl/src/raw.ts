/**
 * Shapes of the raw OpenSkiMap GeoJSON dumps, as actually observed on
 * 2026-07-26 against https://tiles.openskimap.org/geojson/*.geojson
 *
 * These are DESCRIPTIVE, not normative. Every field is optional/nullable
 * because upstream is OSM-derived and wildly inconsistent. Nothing in here is
 * exported into the domain model — normalize.ts is the only bridge, and it maps
 * into the frozen `@searchski/core` types.
 *
 * Observed quirks worth remembering:
 *  - `properties.lit` on a run is TRI-STATE: true | false | null. `false` means
 *    OSM says lit=no; `null` means nobody tagged it. That distinction is the
 *    entire basis of hasNightSki's null semantics.
 *  - `properties.skiAreas` on a run is an array of *whole Feature objects*, not
 *    ids. The id lives at skiAreas[i].properties.id.
 *  - Ski-area geometry is usually Point but is sometimes Polygon/MultiPolygon.
 *  - `properties.name` may be a multilingual blob: "გუდაური, Gudauri, Гудаури".
 */

export type Position = [number, number] | [number, number, number] | number[];

export interface RawGeometryPoint {
  type: 'Point';
  coordinates: Position;
}
export interface RawGeometryLineString {
  type: 'LineString';
  coordinates: Position[];
}
export interface RawGeometryMultiLineString {
  type: 'MultiLineString';
  coordinates: Position[][];
}
export interface RawGeometryPolygon {
  type: 'Polygon';
  coordinates: Position[][];
}
export interface RawGeometryMultiPolygon {
  type: 'MultiPolygon';
  coordinates: Position[][][];
}

export type RawGeometry =
  | RawGeometryPoint
  | RawGeometryLineString
  | RawGeometryMultiLineString
  | RawGeometryPolygon
  | RawGeometryMultiPolygon;

/** One entry of `properties.places`. A feature can touch several. */
export interface RawPlace {
  iso3166_2?: string | null;
  iso3166_1Alpha2?: string | null;
  localized?: {
    en?: {
      region?: string | null;
      country?: string | null;
      locality?: string | null;
    } | null;
  } | null;
}

export interface RawSource {
  id?: string | null;
  type?: string | null;
}

/** One difficulty bucket of statistics.runs.byActivity.downhill.byDifficulty. */
export interface RawDifficultyStat {
  count?: number | null;
  lengthInKm?: number | null;
  minElevation?: number | null;
  maxElevation?: number | null;
  snowmakingLengthInKm?: number | null;
  snowfarmingLengthInKm?: number | null;
  combinedElevationChange?: number | null;
}

/** One entry of statistics.lifts.byType. */
export interface RawLiftStat {
  count?: number | null;
  lengthInKm?: number | null;
  minElevation?: number | null;
  maxElevation?: number | null;
  combinedElevationChange?: number | null;
}

export interface RawSkiAreaStatistics {
  runs?: {
    byActivity?: Record<
      string,
      { byDifficulty?: Record<string, RawDifficultyStat> | null } | null
    > | null;
    minElevation?: number | null;
    maxElevation?: number | null;
  } | null;
  lifts?: {
    byType?: Record<string, RawLiftStat> | null;
    minElevation?: number | null;
    maxElevation?: number | null;
  } | null;
}

export interface RawSkiAreaProperties {
  id?: string | null;
  name?: string | null;
  type?: string | null;
  activities?: string[] | null;
  places?: RawPlace[] | null;
  runConvention?: string | null;
  sources?: RawSource[] | null;
  statistics?: RawSkiAreaStatistics | null;
  status?: string | null;
  websites?: string[] | null;
  wikidataID?: string | null;
}

export interface RawSkiAreaFeature {
  type?: string;
  geometry?: RawGeometry | null;
  properties?: RawSkiAreaProperties | null;
}

/** The nested ski-area stub embedded in a run's `skiAreas` array. */
export interface RawSkiAreaStub {
  type?: string;
  geometry?: RawGeometry | null;
  properties?: { id?: string | null; name?: string | null } | null;
}

export interface RawRunProperties {
  id?: string | null;
  name?: string | null;
  type?: string | null;
  uses?: string[] | null;
  /** TRI-STATE. true = OSM lit=yes, false = OSM lit=no, null = untagged. */
  lit?: boolean | null;
  difficulty?: string | null;
  status?: string | null;
  places?: RawPlace[] | null;
  /** Array of whole Features, NOT ids. */
  skiAreas?: RawSkiAreaStub[] | null;
  snowmaking?: boolean | null;
  elevationProfile?: {
    heights?: number[] | null;
    resolution?: number | null;
  } | null;
}

export interface RawRunFeature {
  type?: string;
  geometry?: RawGeometry | null;
  properties?: RawRunProperties | null;
}
