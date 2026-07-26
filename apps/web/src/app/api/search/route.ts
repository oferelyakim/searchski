import { NextResponse } from 'next/server';
import type { SearchCriteria, SearchResponse } from '@searchski/core/types';
import { runSearch } from '@/lib/search-service';

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

/**
 * Whitelist the request body into a SearchCriteria. Nothing that is not an
 * explicitly known field reaches the scorer.
 */
function parseCriteria(raw: unknown): SearchCriteria | undefined {
  if (!isRecord(raw)) return undefined;
  const out: SearchCriteria = {};

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

  if (typeof raw['originAirport'] === 'string') {
    const code = raw['originAirport'].toUpperCase();
    if (/^[A-Z]{3}$/.test(code)) out.originAirport = code;
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

  return out;
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
  const criteria = parseCriteria(body['criteria']);

  try {
    const response = await runSearch({ query, criteria });
    return NextResponse.json(response);
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
