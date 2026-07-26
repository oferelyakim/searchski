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

/**
 * Serialize a trip window back into a query string, `?`-prefixed or empty.
 *
 * With `groups` omitted or empty this is byte-for-byte what it always was, so
 * every existing single-party link keeps its exact URL. When groups ARE passed,
 * they become the authoritative statement of party size and origin and the
 * scalar `adults`/`children`/`originAirport` params are dropped — two sources of
 * truth for "how many of you are there" is how a shared link starts lying.
 */
export function tripToQuery(trip: TripWindow, groups?: readonly TravellerGroup[]): string {
  const explicit = groups !== undefined && groups.length > 0;
  const p = new URLSearchParams();
  if (trip.dateFrom) p.set('dateFrom', trip.dateFrom);
  if (trip.dateTo) p.set('dateTo', trip.dateTo);
  if (!explicit) {
    if (trip.adults !== undefined) p.set('adults', String(trip.adults));
    if (trip.children !== undefined) p.set('children', String(trip.children));
    if (trip.originAirport) p.set('originAirport', trip.originAirport);
  }
  const q = [p.toString(), explicit ? groupsToQuery(groups) : ''].filter((s) => s !== '').join('&');
  return q === '' ? '' : `?${q}`;
}

/**
 * Head count for a transfer vehicle. Children occupy seats and their skis
 * occupy boot bags, so they count.
 *
 * Returns undefined when the user told us nothing — the affiliates package then
 * applies its own documented default of 2, which is deliberately not 1 because
 * a solo default hides the larger vehicles a family actually needs. A
 * `TravellerGroup` always states both, so it always gets a real number.
 */
export function passengerCount(party: {
  adults?: number | undefined;
  children?: number | undefined;
}): number | undefined {
  if (party.adults === undefined && party.children === undefined) return undefined;
  return Math.max(1, (party.adults ?? 2) + (party.children ?? 0));
}

// ---------------------------------------------------------------------------
// Traveller groups
// ---------------------------------------------------------------------------
//
// A ski trip is often several parties converging on ONE resort: four friends fly
// from Berlin, a couple drives up from Milan, one person is already in the Alps
// and needs nothing but a bed. A single origin and a fixed set of four links
// serves none of them — the driver is shown a flight search they cannot use, and
// the Berliners cannot get one at all.
//
// WHAT VARIES PER GROUP: where they set off from, how many of them there are,
// and which of the four searches they actually want.
//
// WHAT DOES NOT: the dates. One resort, one window. Per-group dates would double
// this model and the editor UI, and every rendered link would then have to say
// whose dates it carried — a lot of complexity for a case that barely occurs.
//
// THE PACKAGE-TRAVEL RULE APPLIES TWICE OVER HERE. No cart and no combined price
// WITHIN a group, and none ACROSS groups either. Six groups mean up to six sets
// of separate links that six people follow and pay for themselves; they never
// mean one basket. Combining a flight with accommodation into a single sale is
// what makes a seller the "organiser" under the EU Package Travel Directive
// 2015/2302 — see the header of packages/affiliates/src/index.ts and PLAN.md §9.

/** Which of the four searches a group actually wants. */
export interface TravellerNeeds {
  flight: boolean;
  lodging: boolean;
  transfer: boolean;
  car: boolean;
}

export interface TravellerGroup {
  /**
   * Positional and stable within one page: `g1`, `g2`… Deliberately NOT
   * serialized — the URL's own ordering already carries it, and a random id in
   * a shared link is noise that cannot be proofread.
   */
  id: string;
  /** "Berlin crew", "Mum and Dad". May be empty; the UI then falls back. */
  label: string;
  /**
   * IATA code this group departs from. ABSENT MEANS NOT FLYING — someone
   * driving from Milan has no origin airport, and there is no default one.
   */
  originAirport?: string | undefined;
  adults: number;
  children: number;
  needs: TravellerNeeds;
}

/**
 * Above six groups this is a spreadsheet, not a web page: the URL stops being
 * proofreadable, the editor stops fitting on a phone, and the honest advice is a
 * shared document. Extra groups in a hand-edited URL are dropped, not rendered.
 */
export const MAX_GROUPS = 6;

/** Labels are a name, not a note. Long enough for "Mum and Dad and the kids". */
export const MAX_GROUP_LABEL = 32;

/**
 * Party size for a group the user has not sized yet. Two, not one, for the same
 * reason the affiliates package defaults transfers to two: a solo default hides
 * the larger vehicles and family rooms a ski party actually needs.
 */
export const DEFAULT_GROUP_ADULTS = 2;

/** Fixed order — it is the order of the needs code in the URL and of the UI. */
export const NEED_KINDS = ['flight', 'lodging', 'transfer', 'car'] as const;
export type NeedKind = (typeof NEED_KINDS)[number];

const NEED_CODE: Record<NeedKind, string> = {
  flight: 'f',
  lodging: 'l',
  transfer: 't',
  car: 'c',
};

/** What a single traveller with no stated preferences gets: everything. */
export const ALL_NEEDS: TravellerNeeds = {
  flight: true,
  lodging: true,
  transfer: true,
  car: true,
};

/** `{flight,transfer}` -> `"ft"`. All-false is `"-"`, never the empty string. */
export function needsToCode(needs: TravellerNeeds): string {
  const code = NEED_KINDS.filter((kind) => needs[kind])
    .map((kind) => NEED_CODE[kind])
    .join('');
  return code === '' ? '-' : code;
}

/**
 * `"ft"` -> `{flight,transfer}`.
 *
 * An ABSENT or EMPTY code means "not stated", which degrades to everything —
 * the same set a single-party page shows today. `"-"` is the explicit "this
 * group asked for nothing", which is a different statement and is preserved.
 */
export function needsFromCode(code: string | undefined): TravellerNeeds {
  if (code === undefined || code === '') return { ...ALL_NEEDS };
  const lower = code.toLowerCase();
  return {
    flight: lower.includes(NEED_CODE.flight),
    lodging: lower.includes(NEED_CODE.lodging),
    transfer: lower.includes(NEED_CODE.transfer),
    car: lower.includes(NEED_CODE.car),
  };
}

/** True when a group asked for nothing at all. Rendered as a note, not a crash. */
export function needsNothing(needs: TravellerNeeds): boolean {
  return !NEED_KINDS.some((kind) => needs[kind]);
}

/**
 * A label safe to put in a comma-delimited URL field.
 *
 * The comma is the field separator and `searchParams` hands us values that are
 * ALREADY percent-decoded, so a `%2C` inside a label would arrive as a real
 * comma and shift every field after it. Replacing it here — on the way in AND on
 * the way out — means that can never happen, and makes the transform idempotent
 * so a link round-trips through parse/encode unchanged.
 */
export function sanitizeGroupLabel(raw: string): string {
  return raw
    .replace(/[,\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_GROUP_LABEL)
    .trim();
}

/**
 * One group as a single query-string value.
 *
 * FORMAT:  `g=<label>,<origin>,<adults>,<children>,<needs>`
 * EXAMPLE: `g=Berlin%20crew,LTN,4,0,flt`
 *          `g=Milan%20pair,,2,1,l`     <- no origin: they are driving
 *
 * Chosen over base64 JSON because a trip organiser pastes this link into a group
 * chat and other people read it. Five positional fields in a fixed order are
 * proofreadable, hand-editable and about a fifth the length. Only the label is
 * percent-encoded, and only because it is the one free-text field.
 */
export function encodeGroup(group: TravellerGroup): string {
  return [
    encodeURIComponent(sanitizeGroupLabel(group.label)),
    group.originAirport ?? '',
    String(group.adults),
    String(group.children),
    needsToCode(group.needs),
  ].join(',');
}

/**
 * Parse one `g` value. `raw` must ALREADY be URL-decoded — which is what both
 * Next's `searchParams` and `URLSearchParams.get` hand you.
 *
 * Never returns null: a group in a shared link is a person, and silently
 * deleting one because a field is junk would quietly change what the organiser
 * sent. Junk fields fall back to a documented default instead; the one thing
 * never invented is the origin airport, because a wrong departure city is a
 * wrong flight search rather than a missing one.
 */
export function parseGroup(raw: string, index: number): TravellerGroup {
  const parts = raw.split(',');
  const group: TravellerGroup = {
    id: `g${index + 1}`,
    label: sanitizeGroupLabel(parts[0] ?? ''),
    adults: partySize(parts[2], 1) ?? DEFAULT_GROUP_ADULTS,
    children: partySize(parts[3], 0) ?? 0,
    needs: needsFromCode(parts[4]),
  };
  const origin = (parts[1] ?? '').trim().toUpperCase();
  if (isIataCode(origin)) group.originAirport = origin;
  return group;
}

/**
 * The groups a URL explicitly carries. EMPTY when it carries none — that is the
 * ordinary case, and it is what keeps the single-party page free of any
 * multi-group machinery at all.
 */
export function groupsFromSearchParams(
  params: Record<string, string | string[] | undefined>,
): TravellerGroup[] {
  const raw = params['g'];
  const list = Array.isArray(raw) ? raw : typeof raw === 'string' ? [raw] : [];
  return list
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .slice(0, MAX_GROUPS)
    .map((value, i) => parseGroup(value, i));
}

/** `g=…&g=…`, with no leading separator. Empty string for no groups. */
export function groupsToQuery(groups: readonly TravellerGroup[]): string {
  return groups
    .slice(0, MAX_GROUPS)
    .map((group) => `g=${encodeGroup(group)}`)
    .join('&');
}

/**
 * What to call a group on screen. An unnamed group is "Group 2" rather than an
 * empty heading — a shared page has to read sensibly even when the organiser
 * could not be bothered to name anybody. `fallback` is the translated word.
 */
export function groupLabelOrDefault(
  group: TravellerGroup,
  index: number,
  fallback: string,
): string {
  return group.label === '' ? `${fallback} ${index + 1}` : group.label;
}

/** Ids follow position, so they stay correct after an add or a remove. */
export function renumberGroups(groups: readonly TravellerGroup[]): TravellerGroup[] {
  return groups.map((group, i) => ({ ...group, id: `g${i + 1}` }));
}

/**
 * The single group a plain trip window already describes — everyone, from one
 * place, wanting everything. Used to seed the editor the moment someone says
 * they are travelling from more than one place, so nothing they already typed on
 * the search page is thrown away.
 */
export function implicitGroup(trip: TripWindow): TravellerGroup {
  const group: TravellerGroup = {
    id: 'g1',
    label: '',
    adults: trip.adults ?? DEFAULT_GROUP_ADULTS,
    children: trip.children ?? 0,
    needs: { ...ALL_NEEDS },
  };
  if (trip.originAirport) group.originAirport = trip.originAirport;
  return group;
}

/**
 * A freshly added group. No origin, so no flight — an unticked flight box is
 * the honest state for a group we know nothing about, and the alternative is a
 * flight toggle that is on but cannot produce a link.
 */
export function newGroup(index: number): TravellerGroup {
  return {
    id: `g${index + 1}`,
    label: '',
    adults: DEFAULT_GROUP_ADULTS,
    children: 0,
    needs: { flight: false, lodging: true, transfer: true, car: false },
  };
}

/** Fold one group's origin and party size back into a plain trip window. */
export function tripWithGroup(trip: TripWindow, group: TravellerGroup): TripWindow {
  const next: TripWindow = { ...trip, adults: group.adults, children: group.children };
  if (group.originAirport) next.originAirport = group.originAirport;
  else delete next.originAirport;
  return next;
}

/**
 * The trip window to show back to the user and to carry to the search page,
 * which is single-origin by nature. The first group is the closest honest
 * approximation of "the trip"; the rest keep their own values in the links.
 */
export function tripWithPrimaryGroup(
  trip: TripWindow,
  groups: readonly TravellerGroup[],
): TripWindow {
  const first = groups[0];
  return first ? tripWithGroup(trip, first) : trip;
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
