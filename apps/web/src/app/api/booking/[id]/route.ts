import { NextResponse } from 'next/server';
import {
  carRentalLinks,
  configFromEnv,
  flightLinks,
  lodgingLinks,
  officialLinks,
  transferLinks,
  type OutboundLink,
} from '@searchski/affiliates';
import type { PassPrice, PassRegion } from '@searchski/core/types';
import { getResort } from '@/lib/data';
import { gatewayAirport, tripFromCriteria, passengerCount, type Gateway } from '@/lib/trip';

export const runtime = 'nodejs';

/**
 * GET /api/booking/[id]?dateFrom&dateTo&adults&children&originAirport
 *
 * Everything the booking panel of the resort modal needs, in one response:
 * the gateway airport, the outbound search links for each component, and the
 * lift-pass prices with their verification status intact.
 *
 * Affiliate attribution happens HERE, server-side, so marker ids stay out of
 * the client bundle. The links are separate searches on independent
 * providers — never a package, never a price. See BookThisTrip's header and
 * PLAN.md §9; this route must never combine components into one purchase.
 */

export interface BookingApiResponse {
  gateway: Gateway | null;
  flights: OutboundLink[];
  lodging: OutboundLink[];
  transfer: OutboundLink[];
  car: OutboundLink[];
  official: OutboundLink[];
  passPrices: PassPrice[];
  passRegion: PassRegion | null;
  /** Why a group is empty, so the UI explains instead of just omitting. */
  notes: { noOrigin: boolean; noDates: boolean; noGateway: boolean };
}

/**
 * Builders throw on malformed input (their correct behaviour); a page fetch
 * degrades to "no links of this kind" instead. Same pattern as BookThisTrip.
 */
function safely(kind: string, build: () => OutboundLink[]): OutboundLink[] {
  try {
    return build();
  } catch (err) {
    console.warn(`[searchski/api/booking] ${kind} links could not be built:`, err);
    return [];
  }
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse<BookingApiResponse | { error: string }>> {
  let id: string;
  try {
    id = (await context.params).id;
  } catch {
    return NextResponse.json({ error: 'bad request' }, { status: 400 });
  }

  const bundle = await getResort(id);
  if (!bundle) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const { area, transfers, airports } = bundle;

  const url = new URL(request.url);
  const q = (key: string) => url.searchParams.get(key) ?? undefined;
  // tripFromCriteria validates everything and drops junk — a malformed date
  // becomes no date, never a broken link.
  const trip = tripFromCriteria({
    dateFrom: q('dateFrom'),
    dateTo: q('dateTo'),
    adults: q('adults') === undefined ? undefined : Number(q('adults')),
    children: q('children') === undefined ? undefined : Number(q('children')),
    originAirport: q('originAirport'),
  });

  const gateway = gatewayAirport(area, airports, transfers);
  const cfg = configFromEnv();
  const place = area.localities[0] ?? area.name;
  const passengers = passengerCount(trip);

  const flights =
    trip.originAirport && trip.dateFrom && gateway
      ? safely('flight', () =>
          flightLinks(
            {
              originIata: trip.originAirport as string,
              destIata: gateway.iata,
              departDate: trip.dateFrom as string,
              returnDate: trip.dateTo,
              adults: trip.adults ?? 2,
            },
            cfg,
          ),
        )
      : [];

  const lodging = safely('lodging', () =>
    lodgingLinks(
      {
        place,
        country: area.country ?? undefined,
        checkIn: trip.dateFrom,
        checkOut: trip.dateTo,
        adults: trip.adults ?? 2,
        lat: area.lat,
        lon: area.lon,
      },
      cfg,
    ),
  );

  const transfer = gateway
    ? safely('transfer', () =>
        transferLinks(
          {
            airportIata: gateway.iata,
            destination: place,
            country: area.country ?? undefined,
            arriveDate: trip.dateFrom,
            returnDate: trip.dateTo,
            ...(passengers === undefined ? {} : { passengers }),
          },
          cfg,
        ),
      )
    : [];

  const car = gateway
    ? safely('car', () =>
        carRentalLinks(
          { airportIata: gateway.iata, pickUpDate: trip.dateFrom, dropOffDate: trip.dateTo },
          cfg,
        ),
      )
    : [];

  const official = safely('official', () => officialLinks(area.websites, area.name));

  return NextResponse.json({
    gateway,
    flights,
    lodging,
    transfer,
    car,
    official,
    passPrices: bundle.passPrices,
    passRegion: bundle.passRegion,
    notes: {
      noOrigin: trip.originAirport === undefined,
      noDates: trip.dateFrom === undefined,
      noGateway: gateway === null,
    },
  });
}
