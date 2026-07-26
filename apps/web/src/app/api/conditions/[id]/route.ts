import { NextResponse } from 'next/server';
import { getConditions, type Conditions } from '@/lib/conditions';
import { getResort } from '@/lib/data';

export const runtime = 'nodejs';

/**
 * GET /api/conditions/[id]
 *
 * Open-Meteo forecast for the resort's coordinates.
 *
 * ============================ LICENCE WARNING ==============================
 * Open-Meteo's free tier needs NO API KEY and is NON-COMMERCIAL ONLY. Before
 * this site carries affiliate links or earns any revenue it must move to the
 * paid Standard tier (~$29/mo) — set CONDITIONS_PROVIDER=openmeteo_paid and
 * OPENMETEO_API_KEY. PLAN.md §10 budgets for it; §12 flags that Open-Meteo's
 * exact definition of "non-commercial" is unverified, so assume it applies.
 * ===========================================================================
 *
 * Responses are cached in memory for one hour (see lib/conditions.ts).
 * The route NEVER fails a page: on any error it returns 200 with
 * `{ conditions: null }` and the UI simply omits the forecast.
 */

interface ConditionsApiResponse {
  conditions: Conditions | null;
  cached: boolean;
  error?: string;
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse<ConditionsApiResponse>> {
  try {
    const { id } = await context.params;
    const bundle = await getResort(decodeURIComponent(id));
    if (!bundle) {
      return NextResponse.json({ conditions: null, cached: false, error: 'Unknown resort.' });
    }

    const { area } = bundle;
    if (!Number.isFinite(area.lat) || !Number.isFinite(area.lon) || (area.lat === 0 && area.lon === 0)) {
      return NextResponse.json({
        conditions: null,
        cached: false,
        error: 'No coordinates on file for this resort.',
      });
    }

    const { conditions, cached } = await getConditions(area.id, area.lat, area.lon);
    return NextResponse.json(
      { conditions, cached },
      { headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' } },
    );
  } catch (err) {
    // Weather must never take a resort page down.
    console.error('[searchski/api/conditions] failed', err);
    return NextResponse.json({ conditions: null, cached: false, error: 'Forecast unavailable.' });
  }
}
