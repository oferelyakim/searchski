import { NextResponse } from 'next/server';
import type { SearchCriteria } from '@searchski/core/types';
import { crewReply } from '@searchski/nlp';
import { CALL_COST_USD, canSpend, llmConfigured, record, recordSkipped } from '@/lib/llm-budget';

export const runtime = 'nodejs';

/**
 * POST /api/chat — one in-character crew acknowledgment of a refinement.
 *
 * Runs on a Haiku-class model (~$0.002/call) behind the same daily budget as
 * the parser. `reply: null` is a fully supported answer, not an error: the
 * client falls back to its fixed dictionary acknowledgment, which is exactly
 * the no-API-key behavior. This route must never 4xx/5xx for budget reasons.
 *
 * The model phrases; it never ranks and never invents — the prompt grounds it
 * in the counts, the top results, and the active criteria it is handed. See
 * `crewReply` in @searchski/nlp.
 */

interface ChatRequestBody {
  speakerName?: string;
  speakerRole?: string;
  locale?: string;
  userMessage?: string | null;
  actionLabel?: string | null;
  changedKeys?: string[];
  totalBefore?: number;
  totalAfter?: number;
  topResults?: { name: string; country: string | null; km: number; score: number }[];
  criteria?: SearchCriteria;
}

const MAX_USER_MESSAGE = 500;
const MAX_TOP_RESULTS = 4;

export async function POST(
  request: Request,
): Promise<NextResponse<{ reply: string | null; reason?: string }>> {
  if (!llmConfigured()) return NextResponse.json({ reply: null, reason: 'no-key' });
  if (!canSpend(CALL_COST_USD.chat)) {
    recordSkipped();
    return NextResponse.json({ reply: null, reason: 'budget' });
  }

  let body: ChatRequestBody;
  try {
    body = (await request.json()) as ChatRequestBody;
  } catch {
    return NextResponse.json({ reply: null, reason: 'bad-request' });
  }

  const reply = await crewReply({
    speakerName: (body.speakerName ?? 'Maya').slice(0, 40),
    speakerRole: (body.speakerRole ?? 'trip host').slice(0, 60),
    locale: body.locale === 'he' ? 'he' : 'en',
    userMessage:
      typeof body.userMessage === 'string' ? body.userMessage.slice(0, MAX_USER_MESSAGE) : null,
    actionLabel: typeof body.actionLabel === 'string' ? body.actionLabel.slice(0, 80) : null,
    changedKeys: Array.isArray(body.changedKeys) ? body.changedKeys.slice(0, 20) : [],
    totalBefore: typeof body.totalBefore === 'number' ? body.totalBefore : 0,
    totalAfter: typeof body.totalAfter === 'number' ? body.totalAfter : 0,
    topResults: Array.isArray(body.topResults) ? body.topResults.slice(0, MAX_TOP_RESULTS) : [],
    criteria: body.criteria ?? {},
  });

  if (reply !== null) record(CALL_COST_USD.chat);
  return NextResponse.json({ reply });
}
