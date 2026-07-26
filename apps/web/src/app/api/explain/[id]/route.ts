import { NextResponse } from 'next/server';
import type { SearchCriteria } from '@searchski/core/types';
import { scoreArea } from '@searchski/core';
import { explainResult } from '@searchski/nlp';
import { getDataset } from '@/lib/data';
import { CALL_COST_USD, canSpend, llmConfigured, record, recordSkipped } from '@/lib/llm-budget';
import { toScoringContext } from '@/lib/search-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/explain/[id]  — body: `{ criteria: SearchCriteria }`
 *
 * Optional prose rendering of a result's factor breakdown.
 *
 * FOUR RULES, all load-bearing:
 *  1. It is a rendering of the deterministic factors, never a substitute for
 *     them. The caller keeps the numbers on screen either way.
 *  2. It is OPTIONAL. `explainResult` returns null with no API key or on any
 *     failure, and this route returns `{ explanation: null }` — the UI then
 *     shows the raw `ScoreFactor.reason` strings it was already showing.
 *  3. It costs money per call, so it is invoked lazily by the client (only
 *     when a user opens a specific result's breakdown) and never for a whole
 *     page of results.
 *  4. It is also subject to the daily spend ceiling in `@/lib/llm-budget`.
 *     Over budget it returns `{ explanation: null, reason: 'budget' }` with
 *     HTTP 200 — the SAME shape rule 2 already produces, so the fallback path
 *     is one the UI exercises every day rather than a special case that only
 *     runs when something has gone wrong. A 429 here would turn a cost control
 *     into a broken button.
 */

interface ExplainApiResponse {
  explanation: string | null;
  error?: string;
  /**
   * Machine-readable: why there is no prose. Absent when an explanation was
   * produced, or when none was configured in the first place.
   */
  reason?: 'budget';
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

    // The budget gate sits AFTER the resort lookup so an unknown id still gets
    // its own answer, and BEFORE the call so the ceiling is never overshot.
    // With no key there is nothing to budget: `explainResult` returns null for
    // free, and charging for that would exhaust the day against no API calls.
    if (llmConfigured() && !canSpend(CALL_COST_USD.explain)) {
      recordSkipped();
      console.warn(
        '[searchski/api/explain] daily LLM budget spent — returning no explanation. ' +
          'The factor breakdown the UI falls back to is unaffected.',
      );
      return NextResponse.json({ explanation: null, reason: 'budget' as const });
    }

    const scored = scoreArea(area, criteria, toScoringContext(data, 'deterministic'));
    const explanation = await explainResult(scored, criteria);
    // Charged on the way out regardless of the result: `explainResult` swallows
    // its own failures, and a refusal or a timeout still burned tokens.
    if (llmConfigured()) record(CALL_COST_USD.explain);
    return NextResponse.json({ explanation });
  } catch (err) {
    console.error('[searchski/api/explain] failed', err);
    return NextResponse.json({ explanation: null, error: 'Explanation unavailable.' });
  }
}
