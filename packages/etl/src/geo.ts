/**
 * Geometry helpers.
 *
 * Two jobs:
 *  1. Reduce a ski area's geometry to one representative lat/lon. Upstream is
 *     usually a Point but sometimes a Polygon/MultiPolygon, and ski_area.location
 *     in the schema is geography(Point,4326) — so a polygon MUST be reduced.
 *  2. Measure a run's true (3D) length from its coordinates.
 */

import { centerOfMass, centroid } from '@turf/turf';
import type { Feature, Polygon, MultiPolygon } from 'geojson';
import type { RawGeometry, Position } from './raw.ts';

export interface LatLon {
  lat: number;
  lon: number;
}

function isFiniteLatLon(lon: number, lat: number): boolean {
  return (
    Number.isFinite(lon) &&
    Number.isFinite(lat) &&
    lat >= -90 &&
    lat <= 90 &&
    lon >= -180 &&
    lon <= 180
  );
}

/**
 * Representative point for a ski area.
 *
 * Point       -> itself.
 * Polygon(s)  -> centre of mass (turf). Chosen over the bbox centre because a
 *                ski area polygon is typically an L or a star of valleys, and a
 *                bbox centre routinely lands on a different mountain. Chosen
 *                over turf.centroid (mean of vertices) because vertex density
 *                varies wildly with OSM mapping effort.
 * Line(s)     -> midpoint of the vertex list (only a fallback; ski areas are
 *                not normally lines).
 *
 * Returns null rather than guessing when the geometry is absent or degenerate.
 */
export function representativePoint(geom: RawGeometry | null | undefined): LatLon | null {
  if (!geom) return null;

  if (geom.type === 'Point') {
    const c = geom.coordinates;
    const lon = Number(c[0]);
    const lat = Number(c[1]);
    return isFiniteLatLon(lon, lat) ? { lat, lon } : null;
  }

  if (geom.type === 'Polygon' || geom.type === 'MultiPolygon') {
    const feature = {
      type: 'Feature',
      properties: {},
      geometry: geom as unknown as Polygon | MultiPolygon,
    } as Feature<Polygon | MultiPolygon>;
    for (const fn of [centerOfMass, centroid]) {
      try {
        const pt = fn(feature);
        const c = pt.geometry.coordinates;
        const lon = Number(c[0]);
        const lat = Number(c[1]);
        if (isFiniteLatLon(lon, lat)) return { lat, lon };
      } catch {
        // fall through to the next strategy
      }
    }
    return null;
  }

  // LineString / MultiLineString fallback: middle vertex.
  const flat: Position[] =
    geom.type === 'LineString'
      ? geom.coordinates
      : geom.type === 'MultiLineString'
        ? geom.coordinates.flat()
        : [];
  if (flat.length === 0) return null;
  const mid = flat[Math.floor(flat.length / 2)];
  if (!mid) return null;
  const lon = Number(mid[0]);
  const lat = Number(mid[1]);
  return isFiniteLatLon(lon, lat) ? { lat, lon } : null;
}

const EARTH_RADIUS_M = 6_371_008.8; // IUGG mean radius
const DEG2RAD = Math.PI / 180;

/**
 * Great-circle distance between two lon/lat pairs, in metres (haversine).
 * At piste scale (tens to thousands of metres) the spherical error is far below
 * the positional error of the underlying OSM trace, so an ellipsoidal formula
 * would be false precision.
 */
function haversineM(a: Position, b: Position): number {
  const lon1 = Number(a[0]);
  const lat1 = Number(a[1]);
  const lon2 = Number(b[0]);
  const lat2 = Number(b[1]);
  if (!Number.isFinite(lon1) || !Number.isFinite(lat1)) return 0;
  if (!Number.isFinite(lon2) || !Number.isFinite(lat2)) return 0;

  const dLat = (lat2 - lat1) * DEG2RAD;
  const dLon = (lon2 - lon1) * DEG2RAD;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * DEG2RAD) * Math.cos(lat2 * DEG2RAD) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(s)));
}

/**
 * True (slope-following) length of a run, in kilometres.
 *
 * FORMULA, per consecutive coordinate pair:
 *
 *     segment = sqrt( horizontal_m^2 + (z2 - z1)^2 )
 *
 * i.e. Pythagoras on the horizontal great-circle distance and the elevation
 * delta. OpenSkiMap's own coordinates carry elevation as the third ordinate
 * ([lon, lat, ele]), so this is measured, not modelled.
 *
 * This matters: a 600 m-vertical black run measures ~8% short in 2D. Where the
 * third ordinate is absent the term is simply 0 and the result degrades to
 * plain 2D length rather than failing.
 */
export function lineLengthKm(geom: RawGeometry | null | undefined): number {
  if (!geom) return 0;
  const lines: Position[][] =
    geom.type === 'LineString'
      ? [geom.coordinates]
      : geom.type === 'MultiLineString'
        ? geom.coordinates
        : [];

  let metres = 0;
  for (const line of lines) {
    for (let i = 1; i < line.length; i++) {
      const p = line[i - 1];
      const q = line[i];
      if (!p || !q) continue;
      const flat = haversineM(p, q);
      const z1 = Number(p[2]);
      const z2 = Number(q[2]);
      const dz = Number.isFinite(z1) && Number.isFinite(z2) ? z2 - z1 : 0;
      metres += Math.sqrt(flat * flat + dz * dz);
    }
  }
  return metres / 1000;
}
