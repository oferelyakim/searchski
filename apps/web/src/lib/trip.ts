/**
 * The trip window — dates, party size, and the airport you are flying from.
 *
 * These four values are METADATA, exactly as `SearchCriteria` says: they are
 * carried into outbound booking links and shown back to the user, and they do
 * NOT rank. We hold no `SeasonDates` for any resort, so scoring a resort higher
 * because it is "open on your dates" would be an invention. Adding dates to a
 * query leaves the ranking byte-identical.
 *
 * EVERYTHING HERE IS OPTIONAL. No page, no link group and no filter may require
 * a date, a head count or an origin airport. The degradation is always the
 * same: the thing that genuinely cannot be built without the value is not
 * rendered, and we say which value is missing. We never substitute a default
 * date, and we never assume an origin airport — this product is not
 * Israel-specific and TLV is not a fallback.
 *
 * Pure and client-safe: no I/O, no server imports.
 */

import type { Airport, SearchCriteria, SkiArea } from '@searchski/core/types';

export interface TripWindow {
  /** ISO YYYY-MM-DD, the night you arrive. */
  dateFrom?: string | undefined;
  /** ISO YYYY-MM-DD, the morning you leave. */
  dateTo?: string | undefined;
  adults?: number | undefined;
  children?: number | undefined;
  /** IATA code of the airport the traveller is departing FROM. Never defaulted. */
  originAirport?: string | undefined;
}

/** The party-size ceiling. Above this it is a group booking, not a family. */
export const MAX_PARTY = 16;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * True only for a real calendar day in ISO form.
 *
 * The shape test alone accepts `2027-02-31`, which every downstream provider
 * would silently reinterpret or drop. A link that quietly loses or shifts the
 * trip window is worse than one that never claimed to have it — the same
 * reasoning as `requireIsoDate` in the affiliates package.
 */
export function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !ISO_DATE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function isIataCode(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Z]{3}$/.test(value);
}

/** A whole number inside [min, max], or null. Never rounds junk into a number. */
export function partySize(value: unknown, min: number): number | null {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isFinite(n) || !Number.isInteger(n)) return null;
  if (n < min || n > MAX_PARTY) return null;
  return n;
}

/** The trip half of a `SearchCriteria`, with nothing invented. */
export function tripFromCriteria(criteria: SearchCriteria): TripWindow {
  const trip: TripWindow = {};
  if (isIsoDate(criteria.dateFrom)) trip.dateFrom = criteria.dateFrom;
  if (isIsoDate(criteria.dateTo)) trip.dateTo = criteria.dateTo;
  const adults = partySize(criteria.adults, 1);
  if (adults !== null) trip.adults = adults;
  const children = partySize(criteria.children, 0);
  if (children !== null) trip.children = children;
  const origin = typeof criteria.originAirport === 'string' ? criteria.originAirport.toUpperCase() : null;
  if (isIataCode(origin)) trip.originAirport = origin;
  return trip;
}

/**
 * Read the trip window off a URL query string.
 *
 * This is what carries a search's dates through to the resort page, so a link
 * followed from the results list arrives with the trip already filled in.
 * Anything malformed is DROPPED, not repaired: an unreadable date becomes no
 * date, and the page then says out loud that it has none.
 */
export function tripFromSearchParams(
  params: Record<string, string | string[] | undefined>,
): TripWindow {
  const one = (key: string): string | undefined => {
    const raw = params[key];
    const value = Array.isArray(raw) ? raw[0] : raw;
    return typeof value === 'string' && value.length > 0 ? value : undefined;
  };
  return tripFromCriteria({
    dateFrom: one('dateFrom'),
    dateTo: one('dateTo'),
    adults: one('adults') === undefined ? undefined : Number(one('adults')),
    children: one('children') === undefined ? undefined : Number(one('children')),
    originAirport: one('originAirport'),
  });
}

/** Serialize a trip window back into a query string, `?`-prefixed or empty. */
export function tripToQuery(trip: TripWindow): string {
  const p = new URLSearchParams();
  if (trip.dateFrom) p.set('dateFrom', trip.dateFrom);
  if (trip.dateTo) p.set('dateTo', trip.dateTo);
  if (trip.adults !== undefined) p.set('adults', String(trip.adults));
  if (trip.children !== undefined) p.set('children', String(trip.children));
  if (trip.originAirport) p.set('originAirport', trip.originAirport);
  const q = p.toString();
  return q === '' ? '' : `?${q}`;
}

/**
 * Head count for a transfer vehicle. Children occupy seats and their skis
 * occupy boot bags, so they count.
 *
 * Returns undefined when the user told us nothing — the affiliates package then
 * applies its own documented default of 2, which is deliberately not 1 because
 * a solo default hides the larger vehicles a family actually needs.
 */
export function passengerCount(trip: TripWindow): number | undefined {
  if (trip.adults === undefined && trip.children === undefined) return undefined;
  return Math.max(1, (trip.adults ?? 2) + (trip.children ?? 0));
}

// ---------------------------------------------------------------------------
// Gateway airport
// ---------------------------------------------------------------------------

/**
 * How far a "gateway" airport may be from a resort, straight line, before we
 * decline to call it one.
 *
 * 250 km is chosen against the routes this product actually cares about:
 * Sofia -> Bansko is ~100 km and already a 2.5-hour mountain drive, Vienna to
 * the Austrian resorts is longer still and the airport seed file itself flags
 * it as "long transfer". Beyond this the honest answer is that we hold no
 * gateway for the resort, and the transfer and car groups simply do not render.
 */
export const MAX_GATEWAY_KM = 250;

const EARTH_RADIUS_KM = 6371;

/** Great-circle distance in km. A straight line, NOT a driving distance. */
export function haversineKm(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

export interface Gateway {
  iata: string;
  name: string;
  /**
   * Where the airport came from.
   *   `transfer` — a stored AirportTransfer row, so a MEASURED drive time exists.
   *   `derived`  — nearest airport by straight-line distance. No drive time is
   *                known and none is shown; inventing one would be exactly the
   *                fabrication rule 1 forbids.
   */
  basis: 'transfer' | 'derived';
  /** Straight-line km. Present for both bases; never presented as road distance. */
  straightLineKm: number;
  /** Measured drive time, minutes. Only ever set when `basis === 'transfer'`. */
  driveMinutes: number | null;
}

/**
 * The airport a traveller would actually fly into for this resort.
 *
 * Prefers a stored transfer row, which carries a real drive time. Falls back to
 * the nearest airport we hold by great-circle distance — enough to build a
 * transfer or car-hire search, which needs only an IATA code, while claiming
 * nothing about how long the drive takes.
 *
 * Returns null rather than a far-away airport. "We do not know" is a valid
 * answer and the UI renders it as one.
 */
export function gatewayAirport(
  area: SkiArea,
  airportsByIata: Record<string, Airport>,
  transfers: { airportIata: string; driveMinutes: number; distanceKm: number }[],
): Gateway | null {
  const nearestTransfer = [...transfers].sort((a, b) => a.driveMinutes - b.driveMinutes)[0];
  if (nearestTransfer) {
    const airport = airportsByIata[nearestTransfer.airportIata];
    return {
      iata: nearestTransfer.airportIata,
      name: airport?.name ?? nearestTransfer.airportIata,
      basis: 'transfer',
      straightLineKm: airport ? haversineKm(area, airport) : nearestTransfer.distanceKm,
      driveMinutes: nearestTransfer.driveMinutes,
    };
  }

  let best: { airport: Airport; km: number } | null = null;
  for (const airport of Object.values(airportsByIata)) {
    if (!isIataCode(airport.iata.toUpperCase())) continue;
    const distance = haversineKm(area, airport);
    if (distance > MAX_GATEWAY_KM) continue;
    if (best === null || distance < best.km) best = { airport, km: distance };
  }
  if (best === null) return null;

  return {
    iata: best.airport.iata.toUpperCase(),
    name: best.airport.name,
    basis: 'derived',
    straightLineKm: best.km,
    driveMinutes: null,
  };
}
