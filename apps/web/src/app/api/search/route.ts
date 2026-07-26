import { NextResponse } from 'next/server';
import type { SearchCriteria, SearchResponse } from '@searchski/core/types';
import { runSearch } from '@/lib/search-service';
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
 */

type SearchApiResponse = SearchResponse & { error?: string };

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

  try {
    const response = await runSearch({ query, criteria });
    // A rejected field is reported, never silently absorbed: the user typed
    // something we refused, and they are entitled to know which part vanished.
    // The results still come back — one bad date must not empty the page.
    return NextResponse.json(
      rejected.length > 0
        ? { ...response, error: `Ignored: ${rejected.join('; ')}.` }
        : response,
    );
  } catch (err) {
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
