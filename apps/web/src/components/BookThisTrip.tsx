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
import {
  ALL_NEEDS,
  groupLabelOrDefault,
  needsNothing,
  passengerCount,
  type Gateway,
  type TravellerGroup,
  type TravellerNeeds,
  type TripWindow,
} from '@/lib/trip';
import { OutboundLinkGroup } from './OutboundLink';
import { TravellerGroups } from './TravellerGroups';

/**
 * "Book this trip" — SEPARATE searches, never one purchase.
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
 *
 * MULTIPLE TRAVELLER GROUPS DO NOT WEAKEN THIS — THEY DOUBLE IT. There is no
 * combining within a group and none across groups either. Six groups mean up to
 * six sets of separate links that six people follow and pay for themselves. A
 * "book everything for everyone" button would be the single most expensive line
 * of code in this repository.
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
  /**
   * Traveller groups the URL explicitly carries.
   *
   * EMPTY IS THE ORDINARY CASE and takes the single-party path below, which
   * renders exactly what this component rendered before groups existed. A
   * solo traveller or one family must not pay for a feature they did not ask
   * for.
   */
  groups?: TravellerGroup[] | undefined;
  /** IATA codes we hold, offered to the group editor as autocomplete hints. */
  airports?: string[] | undefined;
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

/**
 * Who is travelling and what they want. The single-party path fills this from
 * the trip window with every need switched on — which is what a page with no
 * groups has always shown — and passes `adults`/`children` through UNDEFINED
 * where the user stated nothing, so the affiliates package applies its own
 * documented defaults exactly as before.
 */
interface Party {
  originAirport?: string | undefined;
  adults?: number | undefined;
  children?: number | undefined;
  needs: TravellerNeeds;
}

interface LinkSet {
  flights: OutboundLink[];
  lodging: OutboundLink[];
  transfer: OutboundLink[];
  car: OutboundLink[];
}

function buildLinks(
  area: SkiArea,
  gateway: Gateway | null,
  trip: TripWindow,
  party: Party,
  config: AffiliateConfig,
): LinkSet {
  // The village you would actually sleep in, when we know it; otherwise the
  // area's own name. Never a guess at a hotel.
  const place = area.localities[0] ?? area.name;
  const country = area.country ? countryName(area.country) : undefined;
  // Dates are trip-wide on purpose: one resort, one window, for everybody.
  const departDate = trip.dateFrom;
  const origin = party.originAirport;

  // A flight search needs an origin AND a destination AND a departure date.
  // Missing any one of them means NO flight link — we do not default the
  // origin (this product is not Israel-specific and TLV is not a fallback) and
  // we do not invent a date.
  const flights =
    party.needs.flight && origin && gateway && departDate
      ? safely('flight', () =>
          flightLinks(
            {
              originIata: origin,
              destIata: gateway.iata,
              departDate,
              returnDate: trip.dateTo,
              // Flight seats are sold per adult; children are a separate fare
              // class the provider asks about itself. Adults stay adults here.
              adults: party.adults,
            },
            config,
          ),
        )
      : [];

  const lodging = party.needs.lodging
    ? safely('lodging', () =>
        lodgingLinks(
          {
            place,
            country,
            checkIn: trip.dateFrom,
            checkOut: trip.dateTo,
            adults: party.adults,
            lat: area.lat,
            lon: area.lon,
          },
          config,
        ),
      )
    : [];

  const transfer =
    party.needs.transfer && gateway
      ? safely('transfer', () =>
          transferLinks(
            {
              airportIata: gateway.iata,
              destination: place,
              country,
              arriveDate: trip.dateFrom,
              returnDate: trip.dateTo,
              // Children occupy seats and their skis occupy boot bags, so the
              // transfer head count is adults PLUS children. This is the one
              // place the two numbers are added together.
              passengers: passengerCount(party),
            },
            config,
          ),
        )
      : [];

  const car =
    party.needs.car && gateway
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

  return { flights, lodging, transfer, car };
}

function allOf(set: LinkSet): OutboundLink[] {
  return [...set.flights, ...set.lodging, ...set.transfer, ...set.car];
}

/** Why a flight search could not be built for this party. Never a guess. */
function flightGap(
  party: Party,
  gateway: Gateway | null,
  trip: TripWindow,
  t: T,
  perGroup: boolean,
): string {
  if (!party.originAirport) return perGroup ? t('book.groupNoOrigin') : t('book.noOrigin');
  if (!gateway) return t('book.noAirport');
  return t('book.noFlightDates');
}

export function BookThisTrip({
  area,
  gateway,
  trip,
  config,
  t,
  searchHref,
  groups = [],
  airports = [],
}: BookThisTripProps) {
  const multi = groups.length > 0;

  // ---- single party: the ordinary case, unchanged ------------------------
  const soloParty: Party = {
    originAirport: trip.originAirport,
    adults: trip.adults,
    children: trip.children,
    needs: ALL_NEEDS,
  };
  const solo = multi ? null : buildLinks(area, gateway, trip, soloParty, config);

  // ---- several groups: one link set each, never combined -----------------
  const perGroup = groups.map((group) => {
    const party: Party = {
      originAirport: group.originAirport,
      adults: group.adults,
      children: group.children,
      needs: group.needs,
    };
    return { group, party, links: buildLinks(area, gateway, trip, party, config) };
  });

  const everyLink = solo ? allOf(solo) : perGroup.flatMap((entry) => allOf(entry.links));
  const anyMonetized = everyLink.some((l) => l.monetized);

  return (
    <div className="space-y-4">
      <p className="text-xs leading-relaxed text-muted">{t('book.intro')}</p>
      {multi ? <p className="text-xs leading-relaxed text-muted">{t('book.groupsIntro')}</p> : null}

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
        {/* Party size is a per-group fact once there are groups, so it is shown
            on each group instead of once, wrongly, up here. */}
        {!multi && (trip.adults !== undefined || trip.children !== undefined) ? (
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

      {/* One quiet line when there is one group; the editor once there are
          several. Nothing else about this page changes for a solo traveller. */}
      <TravellerGroups trip={trip} groups={groups} airports={airports} />

      {solo ? (
        <div className="grid gap-5 sm:grid-cols-2">
          {/* --- 1. Flights. A separate group. Never combined with lodging. --- */}
          <div className="space-y-2">
            {solo.flights.length > 0 ? (
              <OutboundLinkGroup title={t('book.flights')} note={t('book.flightsNote')} links={solo.flights} />
            ) : (
              <>
                <h3 className="text-sm font-semibold text-fg">{t('book.flights')}</h3>
                {/* No origin means no flight link at all — not a broken one, and
                    never a guessed departure airport. */}
                <Missing>{flightGap(soloParty, gateway, trip, t, false)}</Missing>
              </>
            )}
          </div>

          {/* --- 2. Lodging. A separate group. Never combined with flights. --- */}
          <div className="space-y-2">
            <OutboundLinkGroup title={t('book.lodging')} note={t('book.lodgingNote')} links={solo.lodging} />
          </div>

          {/* --- 3. Transfer. The most useful link on a ski page: a family with
                  skis cannot take a saloon taxi from Sofia to Bansko. --- */}
          <div className="space-y-2">
            {solo.transfer.length > 0 ? (
              <OutboundLinkGroup title={t('book.transfer')} note={t('book.transferNote')} links={solo.transfer} />
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
          {solo.car.length > 0 ? (
            <div className="space-y-2">
              <OutboundLinkGroup title={t('book.car')} note={t('book.carNote')} links={solo.car} />
            </div>
          ) : null}
        </div>
      ) : (
        /* Each group is its own region with its own heading, so a shared page
           read linearly says whose links these are before it reads them. */
        <div className="space-y-4">
          {perGroup.map(({ group, party, links }, index) => {
            const name = groupLabelOrDefault(group, index, t('book.groupFallback'));
            const headingId = `book-group-${group.id}`;
            return (
              <section
                key={group.id}
                aria-labelledby={headingId}
                className="rounded-lg border border-border p-3"
              >
                <div className="flex flex-wrap items-baseline gap-2">
                  <h3 id={headingId} className="text-sm font-semibold text-fg">
                    {name}
                  </h3>
                  <span className="text-xs text-muted">
                    <span className="font-mono">{group.adults}</span>{' '}
                    {t('criteria.adults').toLowerCase()}
                    {group.children > 0 ? (
                      <>
                        {' · '}
                        <span className="font-mono">{group.children}</span>{' '}
                        {t('criteria.children').toLowerCase()}
                      </>
                    ) : null}
                    {' · '}
                    {group.originAirport ? (
                      <span className="font-mono text-fg">{group.originAirport}</span>
                    ) : (
                      t('book.groupDriving')
                    )}
                  </span>
                </div>

                {needsNothing(group.needs) ? (
                  <div className="mt-2">
                    <Missing>{t('book.groupNothing')}</Missing>
                  </div>
                ) : (
                  <div className="mt-3 grid gap-5 sm:grid-cols-2">
                    {/* Only what this group asked for. The person driving up
                        from Milan is never shown a flight search. */}
                    {group.needs.flight ? (
                      <div className="space-y-2">
                        {links.flights.length > 0 ? (
                          <OutboundLinkGroup
                            title={t('book.flights')}
                            note={t('book.flightsNote')}
                            links={links.flights}
                            headingLevel={4}
                          />
                        ) : (
                          <>
                            <h4 className="text-sm font-semibold text-fg">{t('book.flights')}</h4>
                            <Missing>{flightGap(party, gateway, trip, t, true)}</Missing>
                          </>
                        )}
                      </div>
                    ) : null}

                    {group.needs.lodging ? (
                      <div className="space-y-2">
                        <OutboundLinkGroup
                          title={t('book.lodging')}
                          note={t('book.lodgingNote')}
                          links={links.lodging}
                          headingLevel={4}
                        />
                      </div>
                    ) : null}

                    {group.needs.transfer ? (
                      <div className="space-y-2">
                        {links.transfer.length > 0 ? (
                          <OutboundLinkGroup
                            title={t('book.transfer')}
                            note={t('book.transferNote')}
                            links={links.transfer}
                            headingLevel={4}
                          />
                        ) : (
                          <>
                            <h4 className="text-sm font-semibold text-fg">{t('book.transfer')}</h4>
                            <Missing>{t('book.noAirport')}</Missing>
                          </>
                        )}
                      </div>
                    ) : null}

                    {group.needs.car ? (
                      <div className="space-y-2">
                        {links.car.length > 0 ? (
                          <OutboundLinkGroup
                            title={t('book.car')}
                            note={t('book.carNote')}
                            links={links.car}
                            headingLevel={4}
                          />
                        ) : (
                          <>
                            <h4 className="text-sm font-semibold text-fg">{t('book.car')}</h4>
                            <Missing>{t('book.noAirport')}</Missing>
                          </>
                        )}
                      </div>
                    ) : null}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}

      <div className="space-y-1.5 border-t border-border pt-3">
        <p className="text-[11px] leading-relaxed text-muted">{t('book.unverifiedUrls')}</p>
        {anyMonetized ? (
          <p className="text-[11px] leading-relaxed text-muted">{t('book.affiliate')}</p>
        ) : null}
      </div>
    </div>
  );
}
