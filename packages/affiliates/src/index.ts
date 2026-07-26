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

export interface OutboundLink {
  /** Where the link goes. */
  url: string;
  /** Display label. */
  label: string;
  /** The third party the user is being sent to — ALWAYS shown in the UI. */
  provider: string;
  /** True when the URL carries our affiliate attribution. Must be disclosed. */
  monetized: boolean;
  kind: 'flight' | 'lodging' | 'pass' | 'school' | 'transfer' | 'official';
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

/**
 * Wrap a URL in the Travelpayouts redirector when a marker is configured.
 *
 * NOTE: the `tp.media` redirect host and its parameter names are taken from
 * Travelpayouts' published deep-link format. Affiliate networks change these
 * without notice — verify the format against your dashboard before relying on
 * the revenue, and see PLAN.md section 12.
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
  const dest = p.country ? `${p.place}, ${p.country}` : p.place;
  const adults = Math.max(1, p.adults ?? 2);

  const bookingParams = new URLSearchParams({ ss: dest, group_adults: String(adults) });
  if (p.checkIn) bookingParams.set('checkin', p.checkIn);
  if (p.checkOut) bookingParams.set('checkout', p.checkOut);
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
  const vrboRaw = `https://www.vrbo.com/search?q=${encodeURIComponent(dest)}&adults=${adults}`;
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
