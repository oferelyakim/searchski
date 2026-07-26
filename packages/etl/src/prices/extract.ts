/**
 * Pass-price extraction: two Claude calls per resort, deliberately not one.
 *
 * ---------------------------------------------------------------------------
 * WHY TWO CALLS — DO NOT "OPTIMISE" THIS INTO ONE
 * ---------------------------------------------------------------------------
 * Step 1 searches the web. The `web_search_20260209` server tool returns
 * citation blocks alongside its text, and `output_config.format` (structured
 * outputs) is documented as incompatible with citations — combining them risks
 * a 400 that would only show up once the tool is pointed at the live API.
 *
 * There is a second, better reason: separating them means the extraction can be
 * re-run over step 1's saved text without re-searching. Re-reading somebody
 * else's website because our JSON schema changed is both wasteful and rude, and
 * PLAN.md §9 asks us to be a polite client. Step 1's raw text is therefore
 * returned to the caller so it can be kept.
 *
 * The split also keeps the money where the value is: searching needs reasoning
 * (picking the operator's own page over an aggregator), transcription does not.
 * Step 1 runs at `medium` effort, step 2 at `low`.
 * ---------------------------------------------------------------------------
 *
 * LEGAL POSTURE (PLAN.md §9, README rule 4). Prices, currencies and dates are
 * facts and safe to ingest. The prompts below forbid reproducing marketing
 * prose or descriptions, forbid bypassing any login or paywall, and prefer the
 * operator's own site over aggregators. Nothing here fetches a page directly —
 * retrieval happens inside Anthropic's server-side tool.
 *
 * Never throws. Every failure mode — no key, refusal, API error, unparseable
 * output — comes back as a typed result the caller can log and move past.
 */

import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';

/** The model both steps run on. */
export const PRICE_MODEL = 'claude-opus-5';

/**
 * Cap on server-side searches per resort. Low on purpose: this reads other
 * people's websites, and an unbounded search budget is how a well-meaning
 * script turns into a nuisance crawler.
 */
export const MAX_SEARCHES = 3;

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

/**
 * Structured outputs reject unsupported JSON Schema keywords, so this stays to
 * plain types and nullables — no min/max, no regex, no recursion. Matches the
 * discipline already used in packages/nlp.
 */
export const PassPriceExtractionSchema = z.object({
  /** A real, sourced price was found. False is a perfectly good answer. */
  found: z.boolean(),
  /** Page says pricing is dynamic / demand-based / a "from" price. */
  isDynamic: z.boolean(),
  /** Adult 1-day, as printed. Never computed, never converted. */
  adultDay: z.number().nullable(),
  /** Adult 6-day (or 6 consecutive days), as printed. */
  adult6Day: z.number().nullable(),
  /** ISO 4217, e.g. EUR / BGN / GEL. */
  currency: z.string().nullable(),
  /** The exact page the figures were read from. No URL means no row. */
  sourceUrl: z.string().nullable(),
  /** True only if the PAGE named the season. False means we assumed it. */
  seasonConfirmed: z.boolean(),
  /** One short factual caveat. Never marketing copy. */
  notes: z.string().nullable(),
});

export type PassPriceExtraction = z.infer<typeof PassPriceExtractionSchema>;

// ---------------------------------------------------------------------------
// Input / output shapes
// ---------------------------------------------------------------------------

export interface ExtractInput {
  areaName: string;
  /** Alternate/native-script names. Gudauri ships as three scripts at once. */
  aliases: string[];
  country: string | null;
  regionName: string | null;
  /** From SkiArea.websites — the strongest hint at the real operator domain. */
  websites: string[];
  /** Set when the area is sold under a hand-mapped consortium ticket. */
  passRegionName?: string | null;
  passRegionUrl?: string | null;
  /** "2026/27". */
  season: string;
}

export type ExtractResult =
  | {
      status: 'ok';
      extraction: PassPriceExtraction;
      /** Step 1's prose. Kept so step 2 can be re-run without re-searching. */
      researchNote: string;
      /** True when step 1 hit max_tokens — the note may be truncated. */
      truncated: boolean;
    }
  | { status: 'refused'; reason: string }
  | { status: 'empty'; reason: string }
  | { status: 'error'; reason: string };

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------

const SEARCH_SYSTEM = `You research one narrow factual question: the published adult lift-pass prices for a single ski resort, for a single season. You are not writing a review or a summary of the resort.

How to search
- Find the OPERATOR'S OWN website — the company that runs the lifts, or the consortium that sells the ticket. A candidate domain is usually supplied; prefer it when it really is the operator.
- Aggregators, ski-holiday retailers and price-comparison sites are a last resort. If one is genuinely all that exists, use it but SAY SO and give its URL.
- Never open, and never try to work around, anything behind a login, paywall, or a booking flow that needs dates entered. Public price pages only.

What to report
- The adult 1-day lift pass price and the adult 6-day (or 6-consecutive-day) lift pass price, high season, exactly as printed.
- The currency, as an ISO 4217 code (EUR, BGN, GEL, CHF...).
- Whether the page says prices are dynamic, demand-based, date-dependent, or shown as "from" prices. If so, say which figure is the lowest advertised one.
- The exact URL of the page you read the numbers from.
- Whether that page itself names the season, or whether you are assuming it applies.

Hard rules
- Report only numbers that appear on the page you read. Do not estimate, do not convert currencies, do not carry a figure over from a previous season, do not average across categories, and do not infer a 6-day price from a 1-day price.
- If you cannot find an official price for this season, write "NOT FOUND" and one line on why. That is a correct and useful answer. A number you are unsure of is not — someone budgets a family holiday on this.
- Facts only: prices, currency, dates, the URL. Do not reproduce marketing copy, resort descriptions, images, or any editorial text from the page.
- Keep the whole answer under 200 words.`;

const EXTRACT_SYSTEM = `You convert one short research note into structured fields. You are a transcriber, not a researcher: every value you emit must already be stated in the note you were given. You have no other sources and must not use background knowledge.

- found: true only when the note gives an actual adult lift-pass price AND the URL it was read from. "NOT FOUND", "could not find", or a price with no source, is found: false.
- isDynamic: true when the note says pricing is dynamic, demand-based, date-dependent, or that the figure is a "from" / lowest / starting price.
- adultDay / adult6Day: the numbers as stated. null when the note does not give that duration. Never compute one from the other, never convert a currency, never round.
- currency: ISO 4217 code. null when the note does not make it explicit.
- sourceUrl: the exact URL the note says the figures came from. null when the note gives none.
- seasonConfirmed: true ONLY if the note says the page itself named the season. If the note is silent, or says the season is assumed or inferred, this is false.
- notes: at most one short factual caveat, 200 characters maximum — for example "aggregator, not the operator" or "6-day figure is for consecutive days only". Never marketing copy, never a description of the resort. null when there is nothing to flag.

When the note is ambiguous, prefer null and found: false. An absent price is a fine outcome; a wrong one is not.`;

function buildSearchPrompt(input: ExtractInput): string {
  const lines: string[] = [];
  lines.push(`Resort: ${input.areaName}`);
  const otherNames = input.aliases.filter((a) => a && a !== input.areaName);
  if (otherNames.length > 0) lines.push(`Also known as: ${otherNames.slice(0, 6).join(' / ')}`);
  lines.push(`Country: ${input.country ?? 'unknown'}${input.regionName ? ` (${input.regionName})` : ''}`);
  if (input.websites.length > 0) {
    lines.push(`Candidate official website(s): ${input.websites.slice(0, 3).join(' , ')}`);
  } else {
    lines.push('Candidate official website: none on record — find the operator yourself.');
  }
  if (input.passRegionName) {
    lines.push(
      `Note: this area is sold under the "${input.passRegionName}" multi-area pass${
        input.passRegionUrl ? ` (${input.passRegionUrl})` : ''
      }. If the resort has no ticket of its own, the consortium price is the right answer — say which one you are quoting.`,
    );
  }
  lines.push(`Season: ${input.season}`);
  lines.push('');
  lines.push(
    `Find the official adult lift-pass prices for ${input.areaName} for the ${input.season} winter season. Report the adult 1-day price, the adult 6-day price, the currency, whether pricing is dynamic, the exact URL you read, and whether that page states the season.`,
  );
  return lines.join('\n');
}

function buildExtractPrompt(input: ExtractInput, researchNote: string): string {
  return [
    `Resort: ${input.areaName} (${input.country ?? 'unknown country'})`,
    `Season asked for: ${input.season}`,
    '',
    'Research note to transcribe:',
    '"""',
    researchNote,
    '"""',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Steps
// ---------------------------------------------------------------------------

function textOf(content: Anthropic.ContentBlock[]): string {
  return content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Step 1: search. Returns the model's prose, or a failure reason.
 *
 * Server-side tools run their own sampling loop and can come back with
 * `stop_reason: 'pause_turn'` when they hit the per-request iteration cap. The
 * documented way to continue is to re-send with the assistant turn appended —
 * no extra "continue" message. Bounded here so a pathological case cannot spin.
 */
async function search(
  client: Anthropic,
  input: ExtractInput,
): Promise<{ text: string; truncated: boolean } | { failure: ExtractResult }> {
  const messages: Anthropic.MessageParam[] = [
    { role: 'user', content: buildSearchPrompt(input) },
  ];

  let response = await client.messages.create({
    model: PRICE_MODEL,
    max_tokens: 8_000,
    system: SEARCH_SYSTEM,
    // Enough reasoning to tell an operator page from a reseller, no more. The
    // task is a bounded lookup, not an investigation.
    output_config: { effort: 'medium' },
    tools: [
      {
        type: 'web_search_20260209',
        name: 'web_search',
        max_uses: MAX_SEARCHES,
      },
    ],
    messages,
  });

  for (let i = 0; i < 2 && response.stop_reason === 'pause_turn'; i += 1) {
    messages.push({ role: 'assistant', content: response.content });
    response = await client.messages.create({
      model: PRICE_MODEL,
      max_tokens: 8_000,
      system: SEARCH_SYSTEM,
      output_config: { effort: 'medium' },
      tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: MAX_SEARCHES }],
      messages,
    });
  }

  // Check stop_reason BEFORE touching content: on a refusal the content array
  // is empty or partial, and indexing it blindly is how this crashes.
  if (response.stop_reason === 'refusal') {
    const detail = response.stop_details?.explanation ?? response.stop_details?.category ?? '';
    return { failure: { status: 'refused', reason: `search declined${detail ? `: ${detail}` : ''}` } };
  }

  const text = textOf(response.content);
  if (!text) {
    return { failure: { status: 'empty', reason: `search returned no text (stop_reason=${response.stop_reason})` } };
  }

  return { text, truncated: response.stop_reason === 'max_tokens' };
}

/** Step 2: transcribe step 1's prose into the schema. No searching, no web tool. */
async function transcribe(
  client: Anthropic,
  input: ExtractInput,
  researchNote: string,
): Promise<{ extraction: PassPriceExtraction } | { failure: ExtractResult }> {
  const response = await client.messages.parse({
    model: PRICE_MODEL,
    max_tokens: 4_000,
    system: EXTRACT_SYSTEM,
    output_config: {
      effort: 'low',
      format: zodOutputFormat(PassPriceExtractionSchema),
    },
    messages: [{ role: 'user', content: buildExtractPrompt(input, researchNote) }],
  });

  if (response.stop_reason === 'refusal') {
    return { failure: { status: 'refused', reason: 'extraction declined' } };
  }
  if (!response.parsed_output) {
    return {
      failure: { status: 'empty', reason: `extraction produced no parsed output (stop_reason=${response.stop_reason})` },
    };
  }

  return { extraction: response.parsed_output };
}

/**
 * Find the published adult lift-pass prices for one resort.
 *
 * Always resolves. `status: 'ok'` does NOT mean a price was found — check
 * `extraction.found`. It means the two calls completed and the answer, whatever
 * it is, is trustworthy enough to record.
 */
export async function extractPassPrice(client: Anthropic, input: ExtractInput): Promise<ExtractResult> {
  let researchNote: string;
  let truncated: boolean;

  try {
    const step1 = await search(client, input);
    if ('failure' in step1) return step1.failure;
    researchNote = step1.text;
    truncated = step1.truncated;
  } catch (err) {
    return { status: 'error', reason: `search: ${messageOf(err)}` };
  }

  try {
    const step2 = await transcribe(client, input, researchNote);
    if ('failure' in step2) return step2.failure;
    return { status: 'ok', extraction: step2.extraction, researchNote, truncated };
  } catch (err) {
    return { status: 'error', reason: `extraction: ${messageOf(err)}` };
  }
}
