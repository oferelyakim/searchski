/**
 * Outbound booking links.
 *
 * ---------------------------------------------------------------------------
 * THE LOAD-BEARING RULE OF THIS PACKAGE
 * ---------------------------------------------------------------------------
 * Searchski builds LINKS. It never sells a package, never takes payment, and is
 * never the merchant of record.
 *
 * This is not a style preference — it is the difference between running a
 * website and being a regulated tour operator. Under the EU Package Travel
 * Directive (2015/2302), whoever COMBINES a flight with accommodation into a
 * single sale becomes the "organiser": strictly liable for the performance of
 * the entire trip, and legally required to hold insolvency protection in an EU
 * country of establishment.
 *
 * Presenting separate links that the user follows and books independently does
 * not create a package. Bundling them into one transaction does. Do not add a
 * cart, a combined price, or a single "book this trip" button to this codebase
 * without legal advice first. See PLAN.md sections 9 and 1 (column C).
 * ---------------------------------------------------------------------------
 *
 * Every builder degrades gracefully: with no affiliate credentials configured,
 * it returns a plain, unattributed, still-working link. Nothing here requires
 * an account to function.
 */

export interface AffiliateConfig {
  /** Travelpayouts marker (flights + hotels). Free signup, no volume gate. */
  travelpayoutsMarker?: string | undefined;
  /** Booking.com affiliate id, if you have one. */
  bookingAid?: string | undefined;
  /** Optional sub-id for campaign attribution. */
  subId?: string | undefined;
}

export interface FlightLinkParams {
  originIata: string;
  destIata: string;
  departDate: string; // YYYY-MM-DD
  returnDate?: string | undefined;
  adults?: number;
}

export interface LodgingLinkParams {
  /** Place name to search — a village or resort, e.g. "Bansko". */
  place: string;
  country?: string | undefined;
  checkIn?: string | undefined; // YYYY-MM-DD
  checkOut?: string | undefined;
  adults?: number;
  lat?: number | undefined;
  lon?: number | undefined;
}

export interface TransferLinkParams {
  /** Arrival airport, IATA. e.g. "SOF". */
  airportIata: string;
  /** Where the car is going — a resort or village name, e.g. "Bansko". */
  destination: string;
  country?: string | undefined;
  /** Arrival date, YYYY-MM-DD. */
  arriveDate?: string | undefined;
  /** Return leg date, YYYY-MM-DD. Omit for one-way. */
  returnDate?: string | undefined;
  /** Head count including children. Ski luggage is the real constraint. */
  passengers?: number;
}

export interface CarRentalLinkParams {
  airportIata: string;
  pickUpDate?: string | undefined; // YYYY-MM-DD
  dropOffDate?: string | undefined;
}

export interface OutboundLink {
  /** Where the link goes. */
  url: string;
  /** Display label. */
  label: string;
  /** The third party the user is being sent to — ALWAYS shown in the UI. */
  provider: string;
  /** True when the URL carries our affiliate attribution. Must be disclosed. */
  monetized: boolean;
  kind: 'flight' | 'lodging' | 'pass' | 'school' | 'transfer' | 'car' | 'official';
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

/** YYYY-MM-DD -> YYMMDD, the compact form Skyscanner URLs use. */
function compactDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) throw new Error(`Expected YYYY-MM-DD, got: ${iso}`);
  return `${m[1]!.slice(2)}${m[2]}${m[3]}`;
}

function isValidIata(code: string): boolean {
  return /^[A-Z]{3}$/.test(code);
}

/** Uppercase and check an IATA code, or throw. */
function requireIata(code: string, field: string): string {
  const up = code.toUpperCase();
  if (!isValidIata(up)) throw new Error(`${field} must be a 3-letter IATA code, got: ${code}`);
  return up;
}

/**
 * Reject a malformed date rather than emit a link that silently drops the trip
 * window. A prefilled search that quietly loses its dates is worse than one
 * that never claimed to have them.
 */
function requireIsoDate(value: string, field: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${field} must be YYYY-MM-DD, got: ${value}`);
  }
  return value;
}

/** "Bansko" + "Bulgaria" -> "Bansko, Bulgaria". */
function placeLabel(place: string, country?: string | undefined): string {
  return country ? `${place}, ${country}` : place;
}

/**
 * Wrap a URL in the Travelpayouts redirector when a marker is configured.
 *
 * NOTE: the `tp.media` redirect host and its parameter names are taken from
 * Travelpayouts' published deep-link format. Affiliate networks change these
 * without notice — verify the format against your dashboard before relying on
 * the revenue, and see PLAN.md section 12.
 *
 * UNVERIFIED, and specifically relevant to the transfer and car programs added
 * below: some Travelpayouts campaigns also want a per-program campaign id
 * (`p=<number>`) alongside the marker, and drop attribution without it. That id
 * is per-account and is not modelled here. If transfer clicks show up in the
 * dashboard as unattributed, that missing `p=` is the first thing to check.
 * Attribution failing costs revenue; it does not break the link for the user,
 * which is the property that matters.
 */
function withTravelpayouts(url: string, cfg: AffiliateConfig): { url: string; monetized: boolean } {
  if (!cfg.travelpayoutsMarker) return { url, monetized: false };
  const p = new URLSearchParams({
    marker: cfg.travelpayoutsMarker,
    u: url,
  });
  if (cfg.subId) p.set('sub_id', cfg.subId);
  return { url: `https://tp.media/r?${p.toString()}`, monetized: true };
}

// ---------------------------------------------------------------------------
// Flights
// ---------------------------------------------------------------------------

/**
 * Flights are a DEEP LINK, never an API call. Verified 2026-07-26:
 *   - Amadeus Self-Service was decommissioned 2026-07-17.
 *   - Kiwi.com Tequila is invitation-only for new partners.
 *   - Travelpayouts gates live flight search behind 50,000 MAU.
 *   - Duffel charges per-search past a 1,500:1 search-to-book ratio, which a
 *     browse-heavy planner would blow through immediately.
 * On top of that, the carriers that actually fly Israelis to ski (Wizz, Israir,
 * Arkia, El Al) are thin or absent in aggregator content regardless.
 */
export function flightLinks(p: FlightLinkParams, cfg: AffiliateConfig = {}): OutboundLink[] {
  const origin = p.originIata.toUpperCase();
  const dest = p.destIata.toUpperCase();
  if (!isValidIata(origin) || !isValidIata(dest)) {
    throw new Error(`Invalid IATA pair: ${p.originIata} -> ${p.destIata}`);
  }
  const adults = Math.max(1, p.adults ?? 1);
  const out: OutboundLink[] = [];

  // Skyscanner: works with no account; affiliate wrapping is optional.
  const legs = p.returnDate
    ? `${compactDate(p.departDate)}/${compactDate(p.returnDate)}`
    : compactDate(p.departDate);
  const skyRaw =
    `https://www.skyscanner.net/transport/flights/${origin.toLowerCase()}/${dest.toLowerCase()}/${legs}/` +
    `?adults=${adults}&cabinclass=economy`;
  const sky = withTravelpayouts(skyRaw, cfg);
  out.push({
    url: sky.url,
    label: `${origin} to ${dest} on Skyscanner`,
    provider: 'Skyscanner',
    monetized: sky.monetized,
    kind: 'flight',
  });

  // Google Flights: best low-cost-carrier coverage, never monetized.
  const gfQuery = p.returnDate
    ? `Flights from ${origin} to ${dest} on ${p.departDate} through ${p.returnDate}`
    : `Flights from ${origin} to ${dest} on ${p.departDate}`;
  out.push({
    url: `https://www.google.com/travel/flights?q=${encodeURIComponent(gfQuery)}`,
    label: `${origin} to ${dest} on Google Flights`,
    provider: 'Google Flights',
    monetized: false,
    kind: 'flight',
  });

  return out;
}

// ---------------------------------------------------------------------------
// Lodging
// ---------------------------------------------------------------------------

export function lodgingLinks(p: LodgingLinkParams, cfg: AffiliateConfig = {}): OutboundLink[] {
  const out: OutboundLink[] = [];
  const dest = placeLabel(p.place, p.country);
  const adults = Math.max(1, p.adults ?? 2);
  const checkIn = p.checkIn ? requireIsoDate(p.checkIn, 'checkIn') : undefined;
  const checkOut = p.checkOut ? requireIsoDate(p.checkOut, 'checkOut') : undefined;

  const bookingParams = new URLSearchParams({ ss: dest, group_adults: String(adults) });
  // UNVERIFIED URL FORMAT. `checkin`/`checkout` are Booking.com's long-standing
  // ISO-date search params; treat as a best guess, not a contract.
  if (checkIn) bookingParams.set('checkin', checkIn);
  if (checkOut) bookingParams.set('checkout', checkOut);
  if (cfg.bookingAid) bookingParams.set('aid', cfg.bookingAid);
  out.push({
    url: `https://www.booking.com/searchresults.html?${bookingParams.toString()}`,
    label: `Stays in ${p.place} on Booking.com`,
    provider: 'Booking.com',
    monetized: Boolean(cfg.bookingAid),
    kind: 'lodging',
  });

  // Apartments and chalets — the dominant stock in Bansko and Gudauri, which
  // hotel-centric wholesalers under-serve.
  //
  // UNVERIFIED URL FORMAT. Vrbo has used `arrival`/`departure` and then `d1`/`d2`
  // for the stay window over the years; `d1`/`d2` is the current best guess. If
  // the dates stop landing, this is a two-line fix here.
  const vrboParams = new URLSearchParams({ q: dest, adults: String(adults) });
  if (checkIn) vrboParams.set('d1', checkIn);
  if (checkOut) vrboParams.set('d2', checkOut);
  const vrboRaw = `https://www.vrbo.com/search?${vrboParams.toString()}`;
  const vrbo = withTravelpayouts(vrboRaw, cfg);
  out.push({
    url: vrbo.url,
    label: `Apartments and chalets in ${p.place}`,
    provider: 'Vrbo',
    monetized: vrbo.monetized,
    kind: 'lodging',
  });

  return out;
}

// ---------------------------------------------------------------------------
// Airport transfers
// ---------------------------------------------------------------------------
//
// Disproportionately important for this product. Sofia -> Bansko is ~2.5 hours
// and Tbilisi -> Gudauri is ~2 hours of mountain road; neither is a taxi rank
// decision, and a family with skis, boots and boot bags does not fit in a
// saloon car. A prebooked vehicle with a roof box or a minibus is the single
// most useful link on the page.
//
// It is still only a LINK. A transfer sold alongside a flight or a bed by the
// same seller is exactly the combination the Package Travel Directive is about
// (see the header). Separate links, followed and paid for separately, are not.

/** Normalized shape the per-provider URL builders consume. */
interface TransferQuery {
  airport: string; // IATA, uppercase
  destination: string; // "Bansko, Bulgaria"
  arriveDate?: string | undefined;
  returnDate?: string | undefined;
  passengers: number;
}

/**
 * Kiwitaxi.
 *
 * UNVERIFIED URL FORMAT — not tested against the live site, and expected to
 * drift. Kiwitaxi's actual results pages key off internal numeric location ids
 * that we do not have and cannot derive from a resort name, so this targets the
 * search entry point and passes the trip as descriptive query params. Worst
 * case the params are ignored and the user lands on a working search form with
 * the affiliate cookie already set — degraded, never broken. Do not "fix" this
 * by inventing location ids.
 */
function kiwitaxiUrl(q: TransferQuery): string {
  const params = new URLSearchParams({
    from: q.airport,
    to: q.destination,
    passengers: String(q.passengers),
  });
  if (q.arriveDate) params.set('date', q.arriveDate);
  if (q.returnDate) params.set('return_date', q.returnDate);
  return `https://kiwitaxi.com/?${params.toString()}`;
}

/**
 * GetTransfer.
 *
 * UNVERIFIED URL FORMAT — same caveat as Kiwitaxi. Wider country coverage
 * (150+) than Kiwitaxi, so it is the fallback that answers when the primary has
 * no cars in a thin market like Gudauri. Lower rate (10%) but a long cookie.
 */
function getTransferUrl(q: TransferQuery): string {
  const params = new URLSearchParams({
    from: q.airport,
    to: q.destination,
    pax: String(q.passengers),
  });
  if (q.arriveDate) params.set('date', q.arriveDate);
  if (q.returnDate) params.set('date_return', q.returnDate);
  return `https://gettransfer.com/en/?${params.toString()}`;
}

/**
 * Airport-to-resort transfers, best earner first.
 *
 * Both providers are reached through Travelpayouts when a marker is configured
 * and as plain, unattributed links when it is not. No account is required for
 * either link to work.
 */
export function transferLinks(p: TransferLinkParams, cfg: AffiliateConfig = {}): OutboundLink[] {
  const airport = requireIata(p.airportIata, 'airportIata');
  const destination = placeLabel(p.destination, p.country);
  const query: TransferQuery = {
    airport,
    destination,
    arriveDate: p.arriveDate ? requireIsoDate(p.arriveDate, 'arriveDate') : undefined,
    returnDate: p.returnDate ? requireIsoDate(p.returnDate, 'returnDate') : undefined,
    // Ski parties are rarely solo; 2 is a safer default than 1 because it never
    // hides the larger vehicles a family actually needs.
    passengers: Math.max(1, p.passengers ?? 2),
  };

  const out: OutboundLink[] = [];

  // Kiwitaxi first: ~50% revenue share, 102 countries, fixed prices quoted up
  // front, and it covers both the Bulgarian and Georgian routes this site cares
  // about most.
  const kiwi = withTravelpayouts(kiwitaxiUrl(query), cfg);
  out.push({
    url: kiwi.url,
    label: `${airport} to ${p.destination} transfer`,
    provider: 'Kiwitaxi',
    monetized: kiwi.monetized,
    kind: 'transfer',
  });

  const gt = withTravelpayouts(getTransferUrl(query), cfg);
  out.push({
    url: gt.url,
    label: `${airport} to ${p.destination} transfer`,
    provider: 'GetTransfer',
    monetized: gt.monetized,
    kind: 'transfer',
  });

  return out;
}

// ---------------------------------------------------------------------------
// Car rental
// ---------------------------------------------------------------------------
//
// PRESENT THIS AS AN OPTION, NEVER AS THE DEFAULT. A hire car is frequently the
// wrong answer for a ski trip, and the UI should say so rather than let a user
// find out at a mountain checkpoint:
//
//   - Winter tyres and/or snow chains are a legal requirement, not advice, on
//     much of the Alpine road network in season (Austria, Italy and France all
//     impose winter-equipment rules, enforced with fines and turn-backs).
//     Rental fleets do not always include them, and where they do it is a paid
//     extra that has to be requested at booking.
//   - Many resort villages restrict or charge heavily for parking, and some
//     car-free villages (Zermatt, Avoriaz, Wengen and others) do not let you
//     drive in at all — the car becomes a valley car park bill for the week.
//   - Mountain-road driving in snow is a skill, and it is being asked of
//     someone who has just come off a 04:00 flight.
//
// A car earns its keep for multi-resort trips, self-catering runs to a valley
// supermarket, and regions with genuinely poor transfer coverage. Otherwise the
// transfer links above are the better recommendation and the better earner.

interface CarQuery {
  airport: string;
  pickUpDate?: string | undefined;
  dropOffDate?: string | undefined;
}

/**
 * The rental desks the traveller is choosing between open around this time, and
 * an out-of-hours pickup carries a surcharge. Arbitrary but sane; the user
 * changes it on the provider's own form.
 */
const DEFAULT_RENTAL_TIME = '10:00';

/**
 * Discover Cars.
 *
 * UNVERIFIED URL FORMAT — not tested against the live site. Targets the search
 * entry point with the trip as query params so that an ignored param degrades
 * to a working search form rather than a 404.
 */
function discoverCarsUrl(q: CarQuery): string {
  const params = new URLSearchParams({ pickup_place: q.airport });
  if (q.pickUpDate) {
    params.set('pickup_date', q.pickUpDate);
    params.set('pickup_time', DEFAULT_RENTAL_TIME);
  }
  if (q.dropOffDate) {
    params.set('dropoff_date', q.dropOffDate);
    params.set('dropoff_time', DEFAULT_RENTAL_TIME);
  }
  return `https://www.discovercars.com/?${params.toString()}`;
}

/**
 * Rentalcars.com.
 *
 * UNVERIFIED URL FORMAT — same caveat. Kept as a second option because supplier
 * coverage at small regional airports (Plovdiv, Kutaisi) differs from Discover
 * Cars, and the thin-market case is the whole reason this site exists.
 */
function rentalcarsUrl(q: CarQuery): string {
  const params = new URLSearchParams({ pickupLocation: q.airport });
  if (q.pickUpDate) {
    params.set('pickupDate', q.pickUpDate);
    params.set('pickupTime', DEFAULT_RENTAL_TIME);
  }
  if (q.dropOffDate) {
    params.set('dropoffDate', q.dropOffDate);
    params.set('dropoffTime', DEFAULT_RENTAL_TIME);
  }
  return `https://www.rentalcars.com/?${params.toString()}`;
}

/** Car hire from the arrival airport. See the caveats above this function. */
export function carRentalLinks(p: CarRentalLinkParams, cfg: AffiliateConfig = {}): OutboundLink[] {
  const airport = requireIata(p.airportIata, 'airportIata');
  const query: CarQuery = {
    airport,
    pickUpDate: p.pickUpDate ? requireIsoDate(p.pickUpDate, 'pickUpDate') : undefined,
    dropOffDate: p.dropOffDate ? requireIsoDate(p.dropOffDate, 'dropOffDate') : undefined,
  };

  const out: OutboundLink[] = [];

  const dc = withTravelpayouts(discoverCarsUrl(query), cfg);
  out.push({
    url: dc.url,
    label: `Car hire at ${airport}`,
    provider: 'Discover Cars',
    monetized: dc.monetized,
    kind: 'car',
  });

  const rc = withTravelpayouts(rentalcarsUrl(query), cfg);
  out.push({
    url: rc.url,
    label: `Car hire at ${airport}`,
    provider: 'Rentalcars.com',
    monetized: rc.monetized,
    kind: 'car',
  });

  return out;
}

// ---------------------------------------------------------------------------
// Official resort links (never monetized, always safe)
// ---------------------------------------------------------------------------

/**
 * Link OUT to the resort's own trail map. We never embed or reproduce it —
 * piste maps are copyrighted artwork. See PLAN.md section 9.
 */
export function officialLinks(websites: string[], resortName: string): OutboundLink[] {
  return websites
    .filter((w) => /^https?:\/\//i.test(w))
    .map((w) => ({
      url: w,
      label: `${resortName} official site`,
      provider: new URL(w).hostname.replace(/^www\./, ''),
      monetized: false,
      kind: 'official' as const,
    }));
}

/** Read affiliate config from the environment. All values optional. */
export function configFromEnv(env: Record<string, string | undefined> = process.env): AffiliateConfig {
  return {
    travelpayoutsMarker: env.TRAVELPAYOUTS_MARKER,
    bookingAid: env.BOOKING_AID,
    subId: env.AFFILIATE_SUB_ID,
  };
}
