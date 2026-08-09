/**
 * Stage 3: natural language -> SearchCriteria.
 *
 * ---------------------------------------------------------------------------
 * THE RULE: the LLM parses. It never ranks.
 * ---------------------------------------------------------------------------
 * This module's entire job is turning "somewhere cheap and cheerful for a
 * nervous intermediate, kosher food nearby" into a typed `SearchCriteria`
 * object. That object then goes to the deterministic scorer in
 * `@searchski/core`, which produces the ranking.
 *
 * Never let the model choose or order resorts. Ranking must stay reproducible
 * and debuggable — the golden query suite in packages/core regression-tests it,
 * and it cannot test something a language model decides afresh each call.
 * ---------------------------------------------------------------------------
 *
 * Degrades safely: with no ANTHROPIC_API_KEY, or on any API failure, this falls
 * back to `parseQueryDeterministic` from core. The product works without a key.
 */

import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import { parseQueryDeterministic, type SearchCriteria, type ScoredResult } from '@searchski/core';

// ---------------------------------------------------------------------------
// Schema. Mirrors SearchCriteria in @searchski/core/types.
// Structured outputs reject unsupported JSON Schema keywords, so keep this to
// plain types, enums and optionals — no min/max, no regex, no recursion.
// ---------------------------------------------------------------------------

const AbilityEnum = z.enum(['first_timer', 'beginner', 'intermediate', 'advanced', 'expert']);

const CriteriaSchema = z.object({
  ability: AbilityEnum.nullable(),
  groupAbilities: z.array(AbilityEnum).nullable(),
  countries: z.array(z.string()).nullable(),
  minKm: z.number().nullable(),
  maxKm: z.number().nullable(),
  minVerticalM: z.number().nullable(),
  minTopElevM: z.number().nullable(),
  wantNightSki: z.boolean().nullable(),
  wantApres: z.boolean().nullable(),
  wantFamily: z.boolean().nullable(),
  wantUncrowded: z.boolean().nullable(),
  wantSnowsure: z.boolean().nullable(),
  wantSkiInSkiOut: z.boolean().nullable(),
  wantKosher: z.boolean().nullable(),
  wantHebrewSkiSchool: z.boolean().nullable(),
  maxChabadDistanceKm: z.number().nullable(),
  originAirport: z.string().nullable(),
  maxTransferMinutes: z.number().nullable(),
  maxPassPricePerDay: z.number().nullable(),
  currency: z.string().nullable(),
});

type RawCriteria = z.infer<typeof CriteriaSchema>;

const SYSTEM_PROMPT = `You extract structured search criteria from a skier's description of the trip they want.

You are a PARSER, not a recommender. Never name, choose, rank, or suggest resorts — a separate deterministic scoring engine does that. Your only output is the criteria object.

Rules:
- Only populate a field when the user's words actually support it. Everything else stays null. Inventing a constraint the user did not express silently narrows their results.
- Countries are ISO 3166-1 alpha-2 codes (Georgia GE, Bulgaria BG, Italy IT, Austria AT, France FR, Switzerland CH).
- The input may be English or Hebrew. Handle both. Hebrew country names: גאורגיה=GE, בולגריה=BG, איטליה=IT, אוסטריה=AT, צרפת=FR, שווייץ=CH.
- "nervous intermediate", "not confident" -> ability "beginner", not "intermediate". Take the cautious reading; a scared skier on hard terrain is the failure that ruins a trip.
- A mixed group ("me and my kids", "my wife is a beginner, I ski black runs") -> populate groupAbilities with every level mentioned.
- Budget: a bare number with a currency near "pass"/"lift"/"per day" is maxPassPricePerDay. A total trip budget is NOT a pass price — leave it null.
- "kosher", "כשר" -> wantKosher. "Shabbat", "שבת", "Chabad", "חב\\"ד" -> also set wantKosher unless clearly unrelated.
- Departure airport defaults to TLV only if the user implies flying from Israel.`;

export interface ParseResult {
  criteria: SearchCriteria;
  parsedBy: 'llm' | 'deterministic';
  /** Set when the LLM path was attempted and failed. Surfaced for debugging. */
  fallbackReason?: string;
}

export interface NlpConfig {
  apiKey?: string | undefined;
  model?: string;
  /** Milliseconds. Parsing is in the user's critical path — fail fast. */
  timeoutMs?: number;
}

/** Drop nulls so downstream `field !== undefined` checks behave. */
function compact(raw: RawCriteria, rawQuery: string): SearchCriteria {
  const out: Record<string, unknown> = { rawQuery };
  for (const [key, value] of Object.entries(raw)) {
    if (value === null || value === undefined) continue;
    if (Array.isArray(value) && value.length === 0) continue;
    out[key] = value;
  }
  return out as SearchCriteria;
}

/**
 * Parse a free-text query into criteria.
 *
 * Always resolves — never throws. A failed LLM call degrades to the
 * deterministic keyword parser rather than breaking search.
 */
export async function parseQuery(text: string, config: NlpConfig = {}): Promise<ParseResult> {
  const apiKey = config.apiKey ?? process.env.ANTHROPIC_API_KEY;
  const trimmed = text.trim();

  if (!trimmed) return { criteria: {}, parsedBy: 'deterministic' };
  if (!apiKey) {
    return { criteria: parseQueryDeterministic(trimmed), parsedBy: 'deterministic' };
  }

  const client = new Anthropic({ apiKey, timeout: config.timeoutMs ?? 20_000 });

  try {
    const response = await client.messages.parse({
      model: config.model ?? process.env.ANTHROPIC_MODEL ?? 'claude-opus-5',
      max_tokens: 16_000,
      system: SYSTEM_PROMPT,
      // Effort `low` suits a bounded extraction task. Thinking stays on
      // (the default on Opus 5) — disabling it is a known source of leaked
      // internal tags and is not worth the saving here.
      output_config: {
        effort: 'low',
        format: zodOutputFormat(CriteriaSchema),
      },
      messages: [{ role: 'user', content: trimmed }],
    });

    // Refusals and schema-parse failures both surface as a null parsed_output.
    if (response.stop_reason === 'refusal' || !response.parsed_output) {
      return {
        criteria: parseQueryDeterministic(trimmed),
        parsedBy: 'deterministic',
        fallbackReason:
          response.stop_reason === 'refusal' ? 'model declined the request' : 'no parsed output',
      };
    }

    return { criteria: compact(response.parsed_output, trimmed), parsedBy: 'llm' };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return { criteria: parseQueryDeterministic(trimmed), parsedBy: 'deterministic', fallbackReason: reason };
  }
}

// ---------------------------------------------------------------------------
// Explanations
// ---------------------------------------------------------------------------

/**
 * Turn a scored result's factor breakdown into a sentence or two of prose.
 *
 * The model is given the factors the DETERMINISTIC scorer already produced and
 * asked to phrase them. It is not asked whether the resort is a good match —
 * that has already been decided. This keeps explanations honest: they describe
 * the real reason for the ranking rather than inventing a plausible one.
 *
 * Returns null when unavailable; callers fall back to rendering the raw
 * `ScoreFactor.reason` strings, which are already human-readable.
 */
export async function explainResult(
  result: ScoredResult,
  criteria: SearchCriteria,
  config: NlpConfig = {}
): Promise<string | null> {
  const apiKey = config.apiKey ?? process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const top = result.factors
    .filter((f) => !f.dataMissing)
    .sort((a, b) => b.contribution - a.contribution)
    .slice(0, 5)
    .map((f) => `- ${f.label}: ${f.reason} (contributed ${f.contribution.toFixed(1)} points)`)
    .join('\n');

  const missing = result.factors
    .filter((f) => f.dataMissing)
    .map((f) => f.label)
    .join(', ');

  const client = new Anthropic({ apiKey, timeout: config.timeoutMs ?? 20_000 });

  try {
    const response = await client.messages.create({
      model: config.model ?? process.env.ANTHROPIC_MODEL ?? 'claude-opus-5',
      max_tokens: 16_000,
      output_config: { effort: 'low' },
      system: `You write one short paragraph (max 3 sentences) explaining why a ski resort matched someone's search.

You are given the scoring factors that ALREADY determined this result's rank. Explain those factors in plain language. Do not add reasons that are not in the list, do not compare to resorts you were not given, and do not claim facts about the resort beyond what the factors state.

If some factors are listed as having no data, say so plainly rather than glossing over it — a skier deciding where to spend a week deserves to know what we could not check.`,
      messages: [
        {
          role: 'user',
          content: `Resort: ${result.area.name} (${result.area.country ?? 'unknown country'})
Score: ${result.score.toFixed(0)}/100
The skier asked for: ${criteria.rawQuery ?? JSON.stringify(criteria)}

Top scoring factors:
${top || '(none)'}

Factors we had no data for: ${missing || '(none)'}`,
        },
      ],
    });

    if (response.stop_reason === 'refusal') return null;
    const textBlock = response.content.find((b) => b.type === 'text');
    return textBlock && textBlock.type === 'text' ? textBlock.text.trim() : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Crew chat replies
// ---------------------------------------------------------------------------

export interface CrewReplyInput {
  /** Which crew member is speaking, e.g. "Marco", "ski & terrain". */
  speakerName: string;
  speakerRole: string;
  /** UI locale — the reply's default language. */
  locale: string;
  /** The traveller's typed message, or null when they tapped a chip. */
  userMessage: string | null;
  /** The chip they tapped, already translated, or null for typed messages. */
  actionLabel: string | null;
  /** Criteria keys the action actually changed. Empty = nothing changed. */
  changedKeys: string[];
  totalBefore: number;
  totalAfter: number;
  topResults: { name: string; country: string | null; km: number; score: number }[];
  criteria: SearchCriteria;
}

/**
 * One short, in-character chat message reacting to a refinement.
 *
 * This is the ONE place the cast speaks model output, and it runs on a
 * Haiku-class model because the task is small. The prompt hard-grounds the
 * reply in the facts JSON: result counts, the top resorts' names and numbers,
 * and the active criteria. The model may phrase; it may not invent — no
 * prices, no availability, no resorts beyond the list, no ranking opinions of
 * its own. The deterministic scorer has already decided the order.
 *
 * Returns null when unavailable (no key, refusal, error); callers fall back
 * to the fixed dictionary acknowledgment, which is the no-key behavior.
 */
export async function crewReply(
  input: CrewReplyInput,
  config: NlpConfig = {},
): Promise<string | null> {
  const apiKey = config.apiKey ?? process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const client = new Anthropic({ apiKey, timeout: config.timeoutMs ?? 15_000 });
  const language = input.locale === 'he' ? 'Hebrew' : 'English';

  try {
    const response = await client.messages.create({
      model: config.model ?? process.env.ANTHROPIC_CHAT_MODEL ?? 'claude-haiku-4-5',
      max_tokens: 300,
      system: `You are ${input.speakerName}, the ${input.speakerRole} specialist in Searchski's small ski-trip crew, chatting with a traveller about their live search results.

Write ONE short chat message — one or two sentences, no greeting, no sign-off — reacting to what just happened to their search. Default to ${language}; if the traveller's own message is clearly in a different language, mirror theirs.

Hard rules:
- Ground every claim ONLY in the JSON facts provided. Never invent resorts, prices, availability, snow conditions, or bookings, and never claim to have booked anything.
- You may cite the result counts and the name/km/score figures of the listed top results. Nothing else is a fact you know.
- If changedKeys is empty, the request changed nothing — say so plainly and name two or three things the traveller CAN ask for: a country, a minimum size ("over 100 km"), night skiing, a shorter transfer, family-friendly, snow-sure.
- If the traveller named a place or resort you cannot see in the facts, admit it was not matched rather than pretending.
- Competent colleague tone. At most one emoji. No exclamation-mark pileups, no marketing voice.`,
      messages: [
        {
          role: 'user',
          content: JSON.stringify({
            userMessage: input.userMessage,
            actionLabel: input.actionLabel,
            changedKeys: input.changedKeys,
            totalBefore: input.totalBefore,
            totalAfter: input.totalAfter,
            topResults: input.topResults,
            activeCriteria: input.criteria,
          }),
        },
      ],
    });

    if (response.stop_reason === 'refusal') return null;
    const textBlock = response.content.find((b) => b.type === 'text');
    const text = textBlock && textBlock.type === 'text' ? textBlock.text.trim() : '';
    return text.length > 0 ? text : null;
  } catch {
    return null;
  }
}
