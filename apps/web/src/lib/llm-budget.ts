/**
 * A daily ceiling on what the web app spends at Anthropic — and an honest
 * account of what that ceiling is not.
 *
 * ---------------------------------------------------------------------------
 * READ THIS BEFORE TRUSTING IT: THIS IS A SPEED BUMP, NOT A HARD CAP.
 * ---------------------------------------------------------------------------
 * The counter below lives in one process's memory. That means:
 *
 *   - It resets on every restart, redeploy, and cold start.
 *   - It is PER INSTANCE. On Vercel (or any serverless/multi-worker host) there
 *     are N of these at once, so the real worst case is N x the configured
 *     budget, and N is not a number this module can see.
 *   - It counts ESTIMATED dollars, not billed ones. `@searchski/nlp` does not
 *     report token usage back, so each call is charged at the flat estimates in
 *     `CALL_COST_USD` below. A pathologically long query costs more than we
 *     record.
 *
 * So it will stop a runaway retry loop inside one instance, and it will not
 * stop a determined crawler hitting a scaled-out deployment. THE REAL BACKSTOP
 * IS A SPEND LIMIT IN THE ANTHROPIC CONSOLE (Settings > Limits), which is
 * enforced by the party doing the billing. Set one. This module is the thing
 * that keeps the site cheap on an ordinary day; the console limit is the thing
 * that keeps a bad day from being expensive.
 *
 * ---------------------------------------------------------------------------
 * THE DESIGN RULE: exceeding the budget DEGRADES, it never fails.
 * ---------------------------------------------------------------------------
 * Every caller of `canSpend` must have a working answer for `false`:
 *
 *   /api/search      -> parse with `parseQueryDeterministic` instead. Search
 *                       keeps working exactly as it does with no API key set,
 *                       which is a supported, tested configuration.
 *   /api/explain/:id -> `{ explanation: null }` with HTTP 200. The UI already
 *                       falls back to the deterministic factor reasons.
 *
 * A 429 or a 503 here would turn a cost control into an outage. Nothing in this
 * module throws, and nothing that consults it may fail because of it.
 */

// ---------------------------------------------------------------------------
// The cost model
// ---------------------------------------------------------------------------

/**
 * Anthropic's published list prices for `claude-opus-5`, USD per million
 * tokens, AS OF 2026-07-26. RE-CHECK at platform.claude.com/docs/en/pricing.
 *
 * Deliberately duplicated from `packages/etl/src/prices/cost.ts` rather than
 * imported: the web app must not depend on the ETL package to render a page.
 * If you update one, update the other — they are the only two copies.
 */
const USD_PER_MTOK_IN = 5;
const USD_PER_MTOK_OUT = 25;

/**
 * What one call of each kind is assumed to cost. Both run at `effort: 'low'`
 * with thinking on, so the output figure is mostly reasoning tokens — which
 * bill as output, and are the expensive half.
 */
const CALL_TOKENS = {
  /** Query parsing: system prompt + one short query -> a criteria object. */
  parse: { input: 1_200, output: 700 },
  /** Explanation: a factor breakdown -> at most three sentences. */
  explain: { input: 900, output: 900 },
  /** Crew chat ack: facts JSON -> one or two sentences. Runs on Haiku. */
  chat: { input: 900, output: 150 },
} as const;

/**
 * Crew chat runs on `claude-haiku-4-5`, list price AS OF 2026-07: $1 in /
 * $5 out per MTok. Same re-check caveat as the Opus figures above.
 */
const USD_PER_MTOK_HAIKU_IN = 1;
const USD_PER_MTOK_HAIKU_OUT = 5;

function priceOf(tokens: { input: number; output: number }): number {
  return (tokens.input / 1e6) * USD_PER_MTOK_IN + (tokens.output / 1e6) * USD_PER_MTOK_OUT;
}

function priceOfHaiku(tokens: { input: number; output: number }): number {
  return (
    (tokens.input / 1e6) * USD_PER_MTOK_HAIKU_IN + (tokens.output / 1e6) * USD_PER_MTOK_HAIKU_OUT
  );
}

/** Per-call estimates the routes charge themselves. parse/explain ~$0.025; chat ~$0.002. */
export const CALL_COST_USD = {
  parse: priceOf(CALL_TOKENS.parse),
  explain: priceOf(CALL_TOKENS.explain),
  chat: priceOfHaiku(CALL_TOKENS.chat),
} as const;

// ---------------------------------------------------------------------------
// The budget
// ---------------------------------------------------------------------------

export const DAILY_BUDGET_ENV = 'SEARCHSKI_LLM_DAILY_USD';

/** ~80 parses or ~70 explanations a day. Enough for real use, cheap to be wrong about. */
export const DEFAULT_DAILY_USD = 2;

/**
 * The day's budget in USD.
 *
 * Unset  -> the default.
 * `0`    -> a deliberate off switch: no LLM call is ever made, and the site
 *           runs on the deterministic parser. This is a supported mode, not a
 *           degraded one.
 * Junk   -> the default, with a warning. Guessing "unlimited" from a typo is
 *           the one interpretation that can produce a bill.
 */
export function dailyBudgetUsd(): number {
  const raw = process.env[DAILY_BUDGET_ENV];
  if (raw === undefined || raw.trim() === '') return DEFAULT_DAILY_USD;
  const parsed = Number.parseFloat(raw);
  if (!Number.isFinite(parsed) || parsed < 0) {
    console.warn(
      `[searchski/llm-budget] ${DAILY_BUDGET_ENV}="${raw}" is not a number — using the $${DEFAULT_DAILY_USD.toFixed(2)} default.`,
    );
    return DEFAULT_DAILY_USD;
  }
  return parsed;
}

/** UTC, so the reset does not move with the server's timezone or with DST. */
function utcDay(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

const state: { day: string; spentUsd: number; skipped: number } = {
  day: utcDay(),
  spentUsd: 0,
  skipped: 0,
};

/** Roll the counter over at UTC midnight. Called before every read and write. */
function rollover(now?: Date): void {
  const today = utcDay(now);
  if (state.day !== today) {
    state.day = today;
    state.spentUsd = 0;
    state.skipped = 0;
  }
}

/**
 * Can this instance afford one more call of roughly this size today?
 *
 * Checks the estimate BEFORE the call, so the budget is never overshot by a
 * call we could see coming. Never throws; a `false` is an instruction to
 * degrade, not an error to propagate.
 */
export function canSpend(estimatedUsd: number): boolean {
  rollover();
  const budget = dailyBudgetUsd();
  if (budget <= 0) return false;
  if (!Number.isFinite(estimatedUsd) || estimatedUsd < 0) return false;
  return state.spentUsd + estimatedUsd <= budget;
}

/** Book a call against today's budget. Call it after the request goes out. */
export function record(actualUsd: number): void {
  rollover();
  if (!Number.isFinite(actualUsd) || actualUsd <= 0) return;
  state.spentUsd += actualUsd;
}

/** Note that a call was skipped for budget reasons — for the log line, not for logic. */
export function recordSkipped(): void {
  rollover();
  state.skipped += 1;
}

export interface BudgetSnapshot {
  /** UTC date the counter is currently accumulating against. */
  day: string;
  budgetUsd: number;
  spentUsd: number;
  remainingUsd: number;
  /** Calls declined today because the budget was gone. */
  skipped: number;
  /** False when the budget is 0 — LLM calls are switched off entirely. */
  enabled: boolean;
}

export function budgetSnapshot(): BudgetSnapshot {
  rollover();
  const budgetUsd = dailyBudgetUsd();
  return {
    day: state.day,
    budgetUsd,
    spentUsd: state.spentUsd,
    remainingUsd: Math.max(0, budgetUsd - state.spentUsd),
    skipped: state.skipped,
    enabled: budgetUsd > 0,
  };
}

/**
 * True when a Claude call is even possible. With no key, `@searchski/nlp`
 * already falls back for free — charging the budget for a call that never
 * happens would exhaust it against nothing.
 */
export function llmConfigured(): boolean {
  const key = process.env['ANTHROPIC_API_KEY'];
  return typeof key === 'string' && key.trim().length > 0;
}

/** Test seam. Resets the in-process counter; never called by the app. */
export function resetForTesting(): void {
  state.day = utcDay();
  state.spentUsd = 0;
  state.skipped = 0;
}
