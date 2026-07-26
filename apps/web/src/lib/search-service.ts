/**
 * The single call site for `@searchski/core`.
 *
 * Everything the web app knows about the scoring package goes through here, so
 * if the real core lands with a different signature this is the only file to
 * change.
 *
 * Stage 3 (PLAN.md §7) swaps the parser for a Claude call that emits the same
 * `SearchCriteria` shape. The seam is `parseQuery()` below — see the marked
 * block. The scorer is never replaced: the LLM parses and explains, it never
 * ranks.
 */

import type { PassPrice, SearchCriteria, SearchResponse } from '@searchski/core/types';
import { search, type ScoringContext } from '@searchski/core';
import { parseQuery as nlpParseQuery, type ParseResult } from '@searchski/nlp';
import { getDataset, type Dataset } from './data';

export interface RunSearchInput {
  query?: string | undefined;
  criteria?: SearchCriteria | undefined;
}

/**
 * ---------------------------------------------------------------------------
 * Natural-language parsing (Stage 3).
 *
 * `@searchski/nlp` owns this. It uses Claude with structured output when
 * `ANTHROPIC_API_KEY` is set and falls back to `parseQueryDeterministic`
 * internally when the key is absent or the call fails — it NEVER throws, so
 * there is no try/catch and no feature flag here.
 *
 * The LLM parses. It never ranks: whichever parser ran, the output is the same
 * `SearchCriteria` shape and the deterministic scorer decides the order.
 *
 * `parsedBy` is carried through to the response so the UI can tell the user a
 * model interpreted their words — at which point the editable chips stop being
 * a nicety and become the correction mechanism.
 * ---------------------------------------------------------------------------
 */
export async function parseQuery(query: string): Promise<ParseResult> {
  const result = await nlpParseQuery(query);
  if (result.fallbackReason) {
    console.log(`[searchski/search] LLM parsing unavailable (${result.fallbackReason}); used the deterministic parser.`);
  }
  return result;
}

/** Merge explicit structured filters over anything parsed from the free text. */
export function mergeCriteria(parsed: SearchCriteria, explicit?: SearchCriteria): SearchCriteria {
  if (!explicit) return parsed;
  const merged: SearchCriteria = { ...parsed };
  for (const [key, value] of Object.entries(explicit)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value) && value.length === 0) continue;
    (merged as Record<string, unknown>)[key] = value;
  }
  // The user's own words always win for display purposes.
  if (explicit.rawQuery !== undefined) merged.rawQuery = explicit.rawQuery;
  return merged;
}

/**
 * Build the core's `ScoringContext` from our indexed dataset.
 *
 * `passPrices` is keyed by SkiArea.id AND by PassRegion.id — the core lets an
 * area inherit its pass region's price when it has none of its own.
 */
export function toScoringContext(data: Dataset, parsedBy: 'llm' | 'deterministic'): ScoringContext {
  const passPrices: Record<string, PassPrice[]> = {};
  for (const price of data.passPrices) {
    for (const key of [price.skiAreaId, price.passRegionId]) {
      if (!key) continue;
      const bucket = passPrices[key];
      if (bucket) bucket.push(price);
      else passPrices[key] = [price];
    }
  }

  return {
    israelProfiles: data.israelById,
    apresProxies: data.apresById,
    transfers: data.transfersByArea,
    passPrices,
    parsedBy,
  };
}

export async function runSearch(input: RunSearchInput): Promise<SearchResponse> {
  const data = await getDataset();

  let criteria: SearchCriteria;
  let parsedBy: 'llm' | 'deterministic' = 'deterministic';

  const query = typeof input.query === 'string' ? input.query.trim() : '';
  if (query.length > 0) {
    const parsed = await parseQuery(query);
    criteria = mergeCriteria(parsed.criteria, input.criteria);
    parsedBy = parsed.parsedBy;
    if (criteria.rawQuery === undefined) criteria.rawQuery = query;
  } else {
    criteria = { ...(input.criteria ?? {}) };
  }

  const response = search(data.areas, criteria, toScoringContext(data, parsedBy));
  return { ...response, criteria, parsedBy };
}
