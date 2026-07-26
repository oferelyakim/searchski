import { NextResponse } from 'next/server';
import type { SearchCriteria } from '@searchski/core/types';
import { scoreArea } from '@searchski/core';
import { explainResult } from '@searchski/nlp';
import { getDataset } from '@/lib/data';
import { toScoringContext } from '@/lib/search-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/explain/[id]  — body: `{ criteria: SearchCriteria }`
 *
 * Optional prose rendering of a result's factor breakdown.
 *
 * THREE RULES, all load-bearing:
 *  1. It is a rendering of the deterministic factors, never a substitute for
 *     them. The caller keeps the numbers on screen either way.
 *  2. It is OPTIONAL. `explainResult` returns null with no API key or on any
 *     failure, and this route returns `{ explanation: null }` — the UI then
 *     shows the raw `ScoreFactor.reason` strings it was already showing.
 *  3. It costs money per call, so it is invoked lazily by the client (only
 *     when a user opens a specific result's breakdown) and never for a whole
 *     page of results.
 */

interface ExplainApiResponse {
  explanation: string | null;
  error?: string;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse<ExplainApiResponse>> {
  // Nothing here may fail loudly: an explanation is a bonus, never a blocker.
  try {
    const { id } = await context.params;

    let criteria: SearchCriteria = {};
    try {
      const body: unknown = await request.json();
      if (isRecord(body) && isRecord(body['criteria'])) {
        criteria = body['criteria'] as SearchCriteria;
      }
    } catch {
      // An unparseable body just means "explain with no criteria".
    }

    const data = await getDataset();
    const area = data.areasById.get(decodeURIComponent(id));
    if (!area) {
      return NextResponse.json({ explanation: null, error: 'Unknown resort.' });
    }

    const scored = scoreArea(area, criteria, toScoringContext(data, 'deterministic'));
    const explanation = await explainResult(scored, criteria);
    return NextResponse.json({ explanation });
  } catch (err) {
    console.error('[searchski/api/explain] failed', err);
    return NextResponse.json({ explanation: null, error: 'Explanation unavailable.' });
  }
}
