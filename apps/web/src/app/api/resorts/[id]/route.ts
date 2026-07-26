import { NextResponse } from 'next/server';
import type {
  Airport,
  AirportTransfer,
  ApresProxy,
  IsraelProfile,
  PassPrice,
  PassRegion,
  SkiArea,
} from '@searchski/core/types';
import { getResort } from '@/lib/data';

export const runtime = 'nodejs';

/**
 * GET /api/resorts/[id]
 *
 * Everything a resort page needs, in one response. Curated Israel-layer values
 * are returned with their provenance intact so a consumer cannot accidentally
 * present an unverified claim as fact.
 */

interface ResortApiResponse {
  area: SkiArea;
  israel: IsraelProfile | null;
  apres: ApresProxy | null;
  transfers: AirportTransfer[];
  airports: Airport[];
  passRegion: PassRegion | null;
  passPrices: PassPrice[];
  dataSource: string;
  isSampleData: boolean;
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse<ResortApiResponse | { error: string }>> {
  let id: string;
  try {
    ({ id } = await context.params);
  } catch {
    return NextResponse.json({ error: 'Malformed request.' }, { status: 400 });
  }

  try {
    const bundle = await getResort(decodeURIComponent(id));
    if (!bundle) {
      return NextResponse.json({ error: `No ski area with id "${id}".` }, { status: 404 });
    }

    const usedAirports = new Set(bundle.transfers.map((t) => t.airportIata));
    const airports = Object.values(bundle.airports).filter((a) => usedAirports.has(a.iata));

    return NextResponse.json({
      area: bundle.area,
      israel: bundle.israel,
      apres: bundle.apres,
      transfers: bundle.transfers,
      airports,
      passRegion: bundle.passRegion,
      passPrices: bundle.passPrices,
      dataSource: bundle.meta.source,
      isSampleData: bundle.meta.isSample,
    });
  } catch (err) {
    console.error('[searchski/api/resorts] lookup failed', err);
    return NextResponse.json({ error: 'Resort lookup is temporarily unavailable.' }, { status: 503 });
  }
}
