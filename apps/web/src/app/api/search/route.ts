import { NextResponse } from 'next/server';
import type { SearchCriteria, SearchResponse } from '@searchski/core/types';
import { parseQueryDeterministic } from '@searchski/core';
import { mergeCriteria, runSearch, type RunSearchInput } from '@/lib/search-service';
import { CALL_COST_USD, canSpend, llmConfigured, record, recordSkipped } from '@/lib/llm-budget';
import { MAX_PARTY, isIsoDate, partySize } from '@/lib/trip';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/search
 *
 * Body: `{ query?: string, criteria?: SearchCriteria }`
 *
 *  * `query` is parsed by `parseQueryDeterministic` (the Stage-3 LLM path sits
 *    behind `ANTHROPIC_API_KEY` — see the marked seam in search-service.ts).
 *  * `criteria` is applied on top, so a user who removes a mis-parsed chip is
 *    not fighting the parser on every keystroke.
 *
 * Never returns a 500 to the user. A failure comes back as a well-formed,
 * empty SearchResponse with an `error` string the UI can show.
 *
 * ---------------------------------------------------------------------------
 * THIS ENDPOINT IS PUBLIC AND UNAUTHENTICATED, AND IT CAN SPEND MONEY.
 * ---------------------------------------------------------------------------
 * One Claude call per query with free text is cheap; a crawler or a retry loop
 * hitting it is not. Two guards, in this order, both of which DEGRADE rather
 * than fail — `parsedBy: 'deterministic'` is a supported mode (it is what runs
 * with no API key at all), so neither guard can take search down:
 *
 *   1. Don't buy what you already have. If the keyword parser already extracted
 *      criteria from a short, unambiguous query, the model has nothing to add.
 *      A skipped call beats a budgeted one.
 *   2. A daily spend ceiling (`@/lib/llm-budget`). Over it, parse
 *      deterministically and say so in `llmSkipped`.
 *
 * Neither is a billing limit — see the header of llm-budget.ts for what they do
 * not cover, and set a spend limit in the Anthropic console as well.
 */

/** Machine-readable: why the model did not parse this query. */
type LlmSkipReason =
  /** The keyword parser had already extracted everything the query says. */
  | 'deterministic_sufficient'
  /** Today's LLM budget for this instance is exhausted. */
  | 'budget';

type SearchApiResponse = SearchResponse & {
  error?: string;
  /** Absent when the model ran, or when no API key is configured at all. */
  llmSkipped?: LlmSkipReason;
};

const BOOLEAN_KEYS = [
  'wantNightSki',
  'wantApres',
  'wantFamily',
  'wantUncrowded',
  'wantSnowsure',
  'wantSkiInSkiOut',
  'wantKosher',
  'wantHebrewSkiSchool',
] as const;

const NUMBER_KEYS = [
  'minKm',
  'maxKm',
  'minVerticalM',
  'minTopElevM',
  'maxChabadDistanceKm',
  'maxTransferMinutes',
  'maxPassPricePerDay',
  'limit',
] as const;

const ABILITIES = ['first_timer', 'beginner', 'intermediate', 'advanced', 'expert'] as const;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function strings(v: unknown, max: number): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out = v.filter((x): x is string => typeof x === 'string' && x.length > 0).slice(0, max);
  return out.length > 0 ? out : undefined;
}

/** A whitelisted criteria object plus every input that was thrown away. */
interface ParsedCriteria {
  criteria: SearchCriteria;
  /** Human-readable reasons, surfaced to the user rather than swallowed. */
  rejected: string[];
}

/**
 * Whitelist the request body into a SearchCriteria. Nothing that is not an
 * explicitly known field reaches the scorer.
 *
 * Trip dates get their own gate. A malformed date is REJECTED here, not passed
 * on: `@searchski/affiliates` throws on anything that is not YYYY-MM-DD, and a
 * link that silently drops or shifts the trip window is worse than one that
 * never claimed to have it. Rejections are reported back to the user; the rest
 * of the search still runs, because losing a whole result set over one bad
 * field would be a worse failure than the field itself.
 */
function parseCriteria(raw: unknown): ParsedCriteria | undefined {
  if (!isRecord(raw)) return undefined;
  const out: SearchCriteria = {};
  const rejected: string[] = [];

  if (typeof raw['rawQuery'] === 'string') out.rawQuery = raw['rawQuery'].slice(0, 500);

  const ability = raw['ability'];
  if (typeof ability === 'string' && (ABILITIES as readonly string[]).includes(ability)) {
    out.ability = ability as SearchCriteria['ability'];
  }

  const group = strings(raw['groupAbilities'], 5)?.filter((a) =>
    (ABILITIES as readonly string[]).includes(a),
  );
  if (group && group.length > 0) out.groupAbilities = group as NonNullable<SearchCriteria['groupAbilities']>;

  const countries = strings(raw['countries'], 30)?.map((c) => c.toUpperCase().slice(0, 2));
  if (countries) out.countries = countries;

  if (raw['originAirport'] !== undefined && raw['originAirport'] !== null) {
    const code = typeof raw['originAirport'] === 'string' ? raw['originAirport'].toUpperCase() : '';
    if (/^[A-Z]{3}$/.test(code)) out.originAirport = code;
    else rejected.push('originAirport must be a 3-letter IATA code');
  }

  // --- the trip window: optional everywhere, validated when present ---
  for (const key of ['dateFrom', 'dateTo'] as const) {
    const value = raw[key];
    if (value === undefined || value === null || value === '') continue;
    if (isIsoDate(value)) out[key] = value;
    else rejected.push(`${key} must be a real calendar date in YYYY-MM-DD form`);
  }
  if (out.dateFrom && out.dateTo && out.dateTo < out.dateFrom) {
    // Lexicographic comparison is exact for zero-padded ISO dates.
    delete out.dateTo;
    rejected.push('dateTo cannot be before dateFrom');
  }

  for (const [key, min] of [
    ['adults', 1],
    ['children', 0],
  ] as const) {
    const value = raw[key];
    if (value === undefined || value === null || value === '') continue;
    const n = partySize(value, min);
    if (n !== null) out[key] = n;
    else rejected.push(`${key} must be a whole number between ${min} and ${MAX_PARTY}`);
  }

  if (typeof raw['currency'] === 'string' && /^[A-Za-z]{3}$/.test(raw['currency'])) {
    out.currency = raw['currency'].toUpperCase();
  }

  for (const key of BOOLEAN_KEYS) {
    if (raw[key] === true) out[key] = true;
  }

  for (const key of NUMBER_KEYS) {
    const value = raw[key];
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1_000_000) {
      out[key] = value;
    }
  }

  return { criteria: out, rejected };
}

// ---------------------------------------------------------------------------
// Guard 1: don't pay for a parse we already have
// ---------------------------------------------------------------------------

/** "3 days in Bulgaria" is a lookup. A paragraph about a nervous intermediate is not. */
const CHEAP_MAX_CHARS = 60;
const CHEAP_MAX_WORDS = 8;

/**
 * Constructions the keyword parser has no way to represent: contrast,
 * disjunction, exclusion, hedging, and questions. Their presence means the
 * query is doing something the regexes cannot see, so pay for the model.
 *
 * Negations like "not crowded" and "no crowds" are deliberately absent — the
 * deterministic parser has explicit phrases for those and gets them right.
 */
const NEEDS_A_MODEL =
  /\?|\b(?:but|except|without|instead|rather|prefer|prefers|preferably|maybe|perhaps|or|nor|unless|although|though|ideally|possibly|somewhere|something|anything)\b/i;

/** Same idea in Hebrew. Anchored on whitespace: `\b` is ASCII-only, and "או" is a substring of "גאורגיה". */
const NEEDS_A_MODEL_HE = /(?:^|\s)(?:או|אבל|אולי|בלי|למעט|במקום|העדפה|מעדיף|מעדיפה)(?:$|\s)/;

/**
 * True when the LLM has nothing left to contribute.
 *
 * Biased toward spending: every condition must hold, and anything unusual about
 * the query buys the model. A wrong "skip" quietly degrades the user's results,
 * which is far worse than a few cents.
 */
function deterministicIsEnough(query: string, criteria: SearchCriteria): boolean {
  if (query.length > CHEAP_MAX_CHARS) return false;

  const words = query.trim().split(/\s+/).filter((w) => w.length > 0);
  if (words.length === 0 || words.length > CHEAP_MAX_WORDS) return false;

  if (NEEDS_A_MODEL.test(query) || NEEDS_A_MODEL_HE.test(query)) return false;

  // `rawQuery` is echoed back by the parser and is not a signal.
  const signals = Object.keys(criteria).filter((k) => k !== 'rawQuery');
  return signals.length > 0;
}

// ---------------------------------------------------------------------------
// Choosing a parser
// ---------------------------------------------------------------------------

interface ParsePlan {
  input: RunSearchInput;
  skipped: LlmSkipReason | null;
  /** Charged against the daily budget after the request goes out. 0 when nothing is called. */
  chargeUsd: number;
}

/**
 * Decide whether this request gets the model.
 *
 * Passing a `query` to `runSearch` is what triggers the LLM; passing only
 * `criteria` is what does not. Both paths produce the same `SearchCriteria`
 * shape and the same deterministic ranking — the LLM parses, it never ranks.
 */
function planParse(query: string | undefined, explicit: SearchCriteria | undefined): ParsePlan {
  if (query === undefined || query.trim().length === 0) {
    return { input: { criteria: explicit }, skipped: null, chargeUsd: 0 };
  }

  // With no key, `@searchski/nlp` already falls back for free. Charging the
  // budget for a call that cannot happen would exhaust it against nothing, and
  // reporting a "skip" would imply a choice nobody made.
  if (!llmConfigured()) {
    return { input: { query, criteria: explicit }, skipped: null, chargeUsd: 0 };
  }

  const deterministic = parseQueryDeterministic(query);
  // Exactly what `runSearch` would have built, minus the API call: the user's
  // explicit chips still win over whatever the keywords found.
  const withoutTheModel = (): SearchCriteria => {
    const merged = mergeCriteria(deterministic, explicit);
    if (merged.rawQuery === undefined) merged.rawQuery = query;
    return merged;
  };

  if (deterministicIsEnough(query, deterministic)) {
    return { input: { criteria: withoutTheModel() }, skipped: 'deterministic_sufficient', chargeUsd: 0 };
  }

  if (!canSpend(CALL_COST_USD.parse)) {
    recordSkipped();
    return { input: { criteria: withoutTheModel() }, skipped: 'budget', chargeUsd: 0 };
  }

  return { input: { query, criteria: explicit }, skipped: null, chargeUsd: CALL_COST_USD.parse };
}

function emptyResponse(criteria: SearchCriteria, error: string): SearchApiResponse {
  return {
    criteria,
    results: [],
    totalConsidered: 0,
    parsedBy: 'deterministic',
    error,
  };
}

export async function POST(request: Request): Promise<NextResponse<SearchApiResponse>> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(emptyResponse({}, 'Request body was not valid JSON.'), { status: 400 });
  }

  if (!isRecord(body)) {
    return NextResponse.json(emptyResponse({}, 'Request body must be a JSON object.'), { status: 400 });
  }

  const query = typeof body['query'] === 'string' ? body['query'].slice(0, 500) : undefined;
  const parsed = parseCriteria(body['criteria']);
  const criteria = parsed?.criteria;
  const rejected = parsed?.rejected ?? [];

  const plan = planParse(query, criteria);
  if (plan.skipped === 'budget') {
    console.warn(
      '[searchski/api/search] daily LLM budget spent — parsing deterministically. ' +
        'Search is unaffected; raise SEARCHSKI_LLM_DAILY_USD if this is not what you want.',
    );
  }

  try {
    const response = await runSearch(plan.input);
    // Charged after the request goes out, not after it succeeds: a refusal or a
    // timeout mid-call still burned tokens. Over-counting a call that failed
    // before reaching the API is the safe direction for a spend guard.
    if (plan.chargeUsd > 0) record(plan.chargeUsd);

    // A rejected field is reported, never silently absorbed: the user typed
    // something we refused, and they are entitled to know which part vanished.
    // The results still come back — one bad date must not empty the page.
    return NextResponse.json({
      ...response,
      ...(rejected.length > 0 ? { error: `Ignored: ${rejected.join('; ')}.` } : {}),
      ...(plan.skipped ? { llmSkipped: plan.skipped } : {}),
    });
  } catch (err) {
    if (plan.chargeUsd > 0) record(plan.chargeUsd);
    console.error('[searchski/api/search] search failed', err);
    return NextResponse.json(
      emptyResponse(criteria ?? {}, 'Search is temporarily unavailable. Your filters were kept.'),
      { status: 200 },
    );
  }
}

/** A GET is a common mistake; answer it usefully instead of with a 405 page. */
export function GET(): NextResponse<{ error: string; usage: string }> {
  return NextResponse.json(
    {
      error: 'Use POST.',
      usage: 'POST /api/search with { "query": "...", "criteria": { ... } }',
    },
    { status: 405 },
  );
}
