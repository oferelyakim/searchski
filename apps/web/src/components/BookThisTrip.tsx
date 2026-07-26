import {
  carRentalLinks,
  flightLinks,
  lodgingLinks,
  transferLinks,
  type AffiliateConfig,
  type OutboundLink,
} from '@searchski/affiliates';
import type { SkiArea } from '@searchski/core/types';
import type { MessageKey } from '@/i18n/dictionary';
import { countryName } from '@/lib/format';
import { passengerCount, type Gateway, type TripWindow } from '@/lib/trip';
import { OutboundLinkGroup } from './OutboundLink';

/**
 * "Book this trip" — four SEPARATE searches, never one purchase.
 *
 * ===========================================================================
 * THE RULE THIS COMPONENT EXISTS TO OBEY
 * ===========================================================================
 * There is no cart, no combined price, and no single "book this trip" button,
 * and none may be added here. Flights and lodging are rendered as visually and
 * functionally distinct groups that the user follows and pays for
 * independently.
 *
 * That is not a layout preference. Under the EU Package Travel Directive
 * (2015/2302), whoever COMBINES a flight with accommodation into a single sale
 * becomes the "organiser": strictly liable for the performance of the entire
 * trip and legally required to hold insolvency protection in an EU country of
 * establishment. Presenting separate links does not create a package. Bundling
 * them into one transaction does. See PLAN.md §9 and the header of
 * packages/affiliates/src/index.ts.
 * ===========================================================================
 *
 * Two more rules, both enforced by `OutboundLinkView` and repeated here so they
 * are not lost in a refactor:
 *   * the provider is named BEFORE the click, always;
 *   * a monetized link carries rel="noopener nofollow sponsored" and says in
 *     words that it is an affiliate link.
 *
 * And one about honesty: the provider URL formats in the affiliates package are
 * documented, unverified guesses. Nothing here may assert a price, an
 * availability or a booking. These are searches.
 */

type T = (key: MessageKey) => string;

export interface BookThisTripProps {
  area: SkiArea;
  /**
   * The airport the traveller flies into, derived on the page. Null when we
   * hold none near this resort — in which case the transfer and car groups do
   * not render at all, rather than rendering something broken.
   */
  gateway: Gateway | null;
  trip: TripWindow;
  config: AffiliateConfig;
  t: T;
  /** Where to go to fill in the missing trip details. */
  searchHref: string;
}

/**
 * Every builder throws rather than emit a link with a silently dropped trip
 * window. That is the right behaviour for the package and the wrong behaviour
 * for a page render, so a throw here degrades to "no links of this kind" and is
 * logged. It never takes the resort page down.
 */
function safely(kind: string, build: () => OutboundLink[]): OutboundLink[] {
  try {
    return build();
  } catch (err) {
    console.warn(`[searchski/book] ${kind} links could not be built:`, err);
    return [];
  }
}

function Missing({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-lg border border-dashed border-border px-3 py-2 text-xs leading-relaxed text-muted">
      {children}
    </p>
  );
}

export function BookThisTrip({ area, gateway, trip, config, t, searchHref }: BookThisTripProps) {
  // The village you would actually sleep in, when we know it; otherwise the
  // area's own name. Never a guess at a hotel.
  const place = area.localities[0] ?? area.name;
  const country = area.country ? countryName(area.country) : undefined;
  const passengers = passengerCount(trip);
  const origin = trip.originAirport;
  const departDate = trip.dateFrom;

  // A flight search needs an origin AND a destination AND a departure date.
  // Missing any one of them means NO flight link — we do not default the
  // origin (this product is not Israel-specific and TLV is not a fallback) and
  // we do not invent a date.
  const flights =
    origin && gateway && departDate
      ? safely('flight', () =>
          flightLinks(
            {
              originIata: origin,
              destIata: gateway.iata,
              departDate,
              returnDate: trip.dateTo,
              adults: trip.adults,
            },
            config,
          ),
        )
      : [];

  const lodging = safely('lodging', () =>
    lodgingLinks(
      {
        place,
        country,
        checkIn: trip.dateFrom,
        checkOut: trip.dateTo,
        adults: trip.adults,
        lat: area.lat,
        lon: area.lon,
      },
      config,
    ),
  );

  const transfer = gateway
    ? safely('transfer', () =>
        transferLinks(
          {
            airportIata: gateway.iata,
            destination: place,
            country,
            arriveDate: trip.dateFrom,
            returnDate: trip.dateTo,
            passengers,
          },
          config,
        ),
      )
    : [];

  const car = gateway
    ? safely('car', () =>
        carRentalLinks(
          {
            airportIata: gateway.iata,
            pickUpDate: trip.dateFrom,
            dropOffDate: trip.dateTo,
          },
          config,
        ),
      )
    : [];

  const anyMonetized = [...flights, ...lodging, ...transfer, ...car].some((l) => l.monetized);

  return (
    <div className="space-y-4">
      <p className="text-xs leading-relaxed text-muted">{t('book.intro')}</p>

      {/* What the links below were actually built with. Shown, not assumed. */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {trip.dateFrom ? (
          <span className="rounded-full border border-accent/40 bg-accent-soft px-2.5 py-1 text-fg">
            <span className="font-medium">{t('book.window')}:</span>{' '}
            <span className="font-mono">
              {trip.dateFrom}
              {trip.dateTo ? ` → ${trip.dateTo}` : ''}
            </span>
          </span>
        ) : null}
        {trip.adults !== undefined || trip.children !== undefined ? (
          <span className="rounded-full border border-border px-2.5 py-1 text-muted">
            <span className="font-mono">{trip.adults ?? 2}</span> {t('criteria.adults').toLowerCase()}
            {trip.children ? (
              <>
                {' · '}
                <span className="font-mono">{trip.children}</span> {t('criteria.children').toLowerCase()}
              </>
            ) : null}
          </span>
        ) : null}
        {gateway ? (
          <span className="rounded-full border border-border px-2.5 py-1 text-muted">
            {t('book.arriveAt')} <span className="font-mono text-fg">{gateway.iata}</span>
            {gateway.name && gateway.name !== gateway.iata ? ` · ${gateway.name}` : ''}
          </span>
        ) : null}
        <a href={searchHref} className="rounded-full border border-border px-2.5 py-1 text-accent no-underline">
          {t('book.setTrip')}
        </a>
      </div>

      {!trip.dateFrom ? <Missing>{t('book.noDates')}</Missing> : null}

      <div className="grid gap-5 sm:grid-cols-2">
        {/* --- 1. Flights. A separate group. Never combined with lodging. --- */}
        <div className="space-y-2">
          {flights.length > 0 ? (
            <OutboundLinkGroup title={t('book.flights')} note={t('book.flightsNote')} links={flights} />
          ) : (
            <>
              <h3 className="text-sm font-semibold text-fg">{t('book.flights')}</h3>
              {/* No origin means no flight link at all — not a broken one, and
                  never a guessed departure airport. */}
              <Missing>
                {!trip.originAirport
                  ? t('book.noOrigin')
                  : !gateway
                    ? t('book.noAirport')
                    : t('book.noFlightDates')}
              </Missing>
            </>
          )}
        </div>

        {/* --- 2. Lodging. A separate group. Never combined with flights. --- */}
        <div className="space-y-2">
          <OutboundLinkGroup title={t('book.lodging')} note={t('book.lodgingNote')} links={lodging} />
        </div>

        {/* --- 3. Transfer. The most useful link on a ski page: a family with
                skis cannot take a saloon taxi from Sofia to Bansko. --- */}
        <div className="space-y-2">
          {transfer.length > 0 ? (
            <OutboundLinkGroup title={t('book.transfer')} note={t('book.transferNote')} links={transfer} />
          ) : (
            <>
              <h3 className="text-sm font-semibold text-fg">{t('book.transfer')}</h3>
              <Missing>{t('book.noAirport')}</Missing>
            </>
          )}
        </div>

        {/* --- 4. Car hire, LAST and with the caveat. Winter tyres and chains
                are a legal requirement in much of the Alps in season, and
                several resort villages are car-free. See the affiliates
                package. --- */}
        {car.length > 0 ? (
          <div className="space-y-2">
            <OutboundLinkGroup title={t('book.car')} note={t('book.carNote')} links={car} />
          </div>
        ) : null}
      </div>

      <div className="space-y-1.5 border-t border-border pt-3">
        <p className="text-[11px] leading-relaxed text-muted">{t('book.unverifiedUrls')}</p>
        {anyMonetized ? (
          <p className="text-[11px] leading-relaxed text-muted">{t('book.affiliate')}</p>
        ) : null}
      </div>
    </div>
  );
}
