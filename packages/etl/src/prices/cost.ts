/**
 * What pass-price discovery costs, and the ceiling it will not cross.
 *
 * ---------------------------------------------------------------------------
 * ONE PLACE. If a price changes, or the prompt gets fatter, edit THIS FILE.
 * ---------------------------------------------------------------------------
 * Every dollar figure the tool prints — the dry-run estimate, the confirmation
 * prompt, the refusal message, the running total — comes from the two constants
 * below. Nothing else in the codebase multiplies tokens by a rate.
 *
 * WHY A CEILING AND A PROMPT, WHICH ARE NOT THE SAME GUARD:
 *   - The interactive prompt (discover.ts) guards against INATTENTION. A human
 *     mistypes `--limit=500`, sees "$71", and types anything but `y`.
 *   - The ceiling here guards against AUTOMATION. `--yes` deliberately does not
 *     bypass it, because a script that is already wrong will happily answer
 *     every prompt. Only raising SEARCHSKI_MAX_SPEND_USD lifts it, and raising
 *     an env var is an act nobody performs by accident.
 *
 * Neither guard is a billing limit. See README > "Spend guards".
 */

// ---------------------------------------------------------------------------
// Published rates
// ---------------------------------------------------------------------------

/**
 * Anthropic's published list prices for `claude-opus-5`, USD.
 *
 * AS OF 2026-07-26. These are a snapshot of a third party's price list, not a
 * contract — RE-CHECK THEM at https://platform.claude.com/docs/en/pricing
 * before trusting an estimate, and especially before raising the ceiling. A
 * stale rate here makes every number this tool prints quietly wrong in the one
 * direction that costs money.
 */
export const RATES = {
  asOf: '2026-07-26',
  model: 'claude-opus-5',
  /** $5 per million input tokens. */
  usdPerMTokIn: 5,
  /** $25 per million output tokens (thinking tokens bill as output). */
  usdPerMTokOut: 25,
  /** Cache reads bill at 0.1x input, writes at 1.25x. Unused today; kept honest. */
  usdPerMTokCacheRead: 0.5,
  usdPerMTokCacheWrite: 6.25,
  /** Anthropic's server-side web-search tool: $10 per 1,000 searches. */
  usdPerWebSearch: 0.01,
} as const;

/**
 * What ONE resort is expected to consume across the two calls in extract.ts.
 *
 * Step 1's input is dominated by whatever the web-search tool injects, which is
 * the number with by far the widest spread. Treat the resulting dollar figure as
 * an order of magnitude, not a quote — which is exactly why the run also tracks
 * what it ACTUALLY spent (see `usageUsd`) rather than trusting this.
 */
export const PER_RESORT_ESTIMATE = {
  inputTokens: 13_000,
  outputTokens: 2_100,
  webSearches: 2.5,
} as const;

// ---------------------------------------------------------------------------
// Estimating
// ---------------------------------------------------------------------------

/** The headline number: roughly what one resort costs. ~$0.14 at 2026-07 rates. */
export const USD_PER_RESORT: number =
  (PER_RESORT_ESTIMATE.inputTokens / 1e6) * RATES.usdPerMTokIn +
  (PER_RESORT_ESTIMATE.outputTokens / 1e6) * RATES.usdPerMTokOut +
  PER_RESORT_ESTIMATE.webSearches * RATES.usdPerWebSearch;

export function estimateUsd(resorts: number): number {
  return Math.max(0, resorts) * USD_PER_RESORT;
}

/** How many resorts fit in a budget. Floor, so the answer is always affordable. */
export function resortsAffordable(budgetUsd: number): number {
  if (!Number.isFinite(budgetUsd) || budgetUsd <= 0) return 0;
  return Math.floor(budgetUsd / USD_PER_RESORT);
}

// ---------------------------------------------------------------------------
// Measuring what was really spent
// ---------------------------------------------------------------------------

/**
 * Token and tool counts actually reported by the API, summed across every call
 * made for one resort. Produced by extract.ts; priced here.
 */
export interface CallUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
  cacheCreationInputTokens: number;
  webSearches: number;
}

export const ZERO_USAGE: CallUsage = {
  inputTokens: 0,
  outputTokens: 0,
  cacheReadInputTokens: 0,
  cacheCreationInputTokens: 0,
  webSearches: 0,
};

export function addUsage(a: CallUsage, b: CallUsage): CallUsage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    cacheReadInputTokens: a.cacheReadInputTokens + b.cacheReadInputTokens,
    cacheCreationInputTokens: a.cacheCreationInputTokens + b.cacheCreationInputTokens,
    webSearches: a.webSearches + b.webSearches,
  };
}

/** Price a real usage record. This is what the running total accumulates. */
export function usageUsd(u: CallUsage): number {
  return (
    (u.inputTokens / 1e6) * RATES.usdPerMTokIn +
    (u.outputTokens / 1e6) * RATES.usdPerMTokOut +
    (u.cacheReadInputTokens / 1e6) * RATES.usdPerMTokCacheRead +
    (u.cacheCreationInputTokens / 1e6) * RATES.usdPerMTokCacheWrite +
    u.webSearches * RATES.usdPerWebSearch
  );
}

// ---------------------------------------------------------------------------
// The ceiling
// ---------------------------------------------------------------------------

export const MAX_SPEND_ENV = 'SEARCHSKI_MAX_SPEND_USD';

/**
 * Deliberately small. A first real run should be a rounding error, and somebody
 * who wants to spend $130 clearing the backlog should have to say so out loud.
 */
export const DEFAULT_MAX_SPEND_USD = 5;

/**
 * The hard ceiling for one run, in USD.
 *
 * `0` is a legitimate value and means "nothing may run". A malformed value is
 * NOT silently coerced to something permissive — it falls back to the default
 * and says so, because the failure mode of guessing high is a bill.
 */
export function maxSpendUsd(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env[MAX_SPEND_ENV];
  if (raw === undefined || raw.trim() === '') return DEFAULT_MAX_SPEND_USD;
  const parsed = Number.parseFloat(raw);
  if (!Number.isFinite(parsed) || parsed < 0) {
    console.warn(
      `[prices] ${MAX_SPEND_ENV}="${raw}" is not a number — using the $${DEFAULT_MAX_SPEND_USD.toFixed(2)} default.`,
    );
    return DEFAULT_MAX_SPEND_USD;
  }
  return parsed;
}

export function usd(amount: number): string {
  return `$${amount.toFixed(2)}`;
}
