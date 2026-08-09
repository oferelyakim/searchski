/**
 * The interview: a short, branching question script that compiles to a
 * `SearchCriteria` object.
 *
 * Design rules, in order of importance:
 *
 *  1. FASTER THAN A FORM. At most seven questions on any path, every one
 *     answerable in a single tap. Free text is opt-in per step, never required.
 *  2. DETERMINISTIC BY DEFAULT. A chip maps to a fixed criteria patch — no
 *     model, no tokens, no ambiguity. Only a typed "other" answer goes through
 *     the LLM parser, and it lands in the same `SearchCriteria` shape.
 *  3. NOTHING INVENTED. Budget is interview metadata (`InterviewFacts`), not a
 *     ranking signal — we hold no flight or lodging prices, so pretending to
 *     rank by total cost would be fiction. The one softened rule is the month
 *     chips: they pencil in a concrete Saturday-to-Saturday week because the
 *     booking links downstream need real dates to be useful. That week is
 *     flagged `datesAssumed` and the UI must say it chose it and offer an edit.
 *
 * Pure module: no I/O, no React, safe on server and client.
 */

import type { Ability, SearchCriteria } from '@searchski/core/types';
import type { MessageKey } from '@/i18n/dictionary';
import type { CastId } from './cast';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export type PartyKind = 'solo' | 'couple' | 'friends' | 'family';

/**
 * Facts the interview learns that are NOT search criteria. Budget shapes what
 * the results page says (and one advisory chime-in), never the ranking.
 */
export interface InterviewFacts {
  partyKind?: PartyKind;
  /** USD per person, all-in, as the user stated it. null = "no limit". */
  budgetPerPersonUsd?: number | null;
  /** True when a month chip pencilled in a concrete week the user never typed. */
  datesAssumed?: boolean;
}

export const STEP_IDS = [
  'party',
  'sizeFriends',
  'sizeFamily',
  'ability',
  'vibe',
  'budget',
  'origin',
  'when',
  'where',
] as const;
export type StepId = (typeof STEP_IDS)[number];

export interface InterviewState {
  criteria: SearchCriteria;
  facts: InterviewFacts;
  /** null = interview finished (or skipped) — show results. */
  stepId: StepId | null;
}

export function initialInterviewState(): InterviewState {
  return { criteria: {}, facts: {}, stepId: 'party' };
}

// ---------------------------------------------------------------------------
// Script shape
// ---------------------------------------------------------------------------

/** A specialist speaking one fixed line in response to an answer. */
export interface Reaction {
  speaker: CastId;
  textKey: MessageKey;
}

export interface InterviewChip {
  id: string;
  /** Translated label. Exactly one of labelKey / label is set. */
  labelKey?: MessageKey;
  /** Literal label for things that must not be translated: "3", "EWR". */
  label?: string;
  /** ISO country whose display name IS the label, via Intl.DisplayNames. */
  countryCode?: string;
  patch?: SearchCriteria;
  facts?: Partial<InterviewFacts>;
  /** Month (1-12) for date-window chips; the engine computes the actual week. */
  month?: number;
  reaction?: Reaction;
}

/** How a typed "other" answer on this step is interpreted. */
export type FreeTextKind = 'parse' | 'number' | 'iata';

export interface InterviewStep {
  id: StepId;
  speaker: CastId;
  promptKey: MessageKey;
  /** Pick several chips before confirming. */
  multi?: boolean;
  freeText?: FreeTextKind;
  /** Placeholder for the free-text input, when enabled. */
  freeTextKey?: MessageKey;
  chips: InterviewChip[];
}

// ---------------------------------------------------------------------------
// The script
// ---------------------------------------------------------------------------

const abilityChip = (id: string, labelKey: MessageKey, ability: Ability): InterviewChip => ({
  id,
  labelKey,
  patch: { ability },
});

export const STEPS: Record<StepId, InterviewStep> = {
  party: {
    id: 'party',
    speaker: 'maya',
    promptKey: 'iv.party.q',
    chips: [
      { id: 'solo', labelKey: 'iv.party.solo', patch: { adults: 1 }, facts: { partyKind: 'solo' } },
      { id: 'couple', labelKey: 'iv.party.couple', patch: { adults: 2 }, facts: { partyKind: 'couple' } },
      { id: 'friends', labelKey: 'iv.party.friends', facts: { partyKind: 'friends' } },
      {
        id: 'family',
        labelKey: 'iv.party.family',
        patch: { wantFamily: true },
        facts: { partyKind: 'family' },
        reaction: { speaker: 'noa', textKey: 'iv.noa.family' },
      },
    ],
  },

  sizeFriends: {
    id: 'sizeFriends',
    speaker: 'maya',
    promptKey: 'iv.sizeFriends.q',
    freeText: 'number',
    freeTextKey: 'iv.sizeFriends.other',
    chips: [
      { id: 's3', label: '3', patch: { adults: 3 } },
      { id: 's4', label: '4', patch: { adults: 4 } },
      { id: 's5', label: '5', patch: { adults: 5 } },
      { id: 's6', label: '6', patch: { adults: 6 } },
    ],
  },

  sizeFamily: {
    id: 'sizeFamily',
    speaker: 'noa',
    promptKey: 'iv.sizeFamily.q',
    chips: [
      { id: 'f11', label: '1 + 1', patch: { adults: 1, children: 1 } },
      { id: 'f21', label: '2 + 1', patch: { adults: 2, children: 1 } },
      { id: 'f22', label: '2 + 2', patch: { adults: 2, children: 2 } },
      { id: 'f23', label: '2 + 3', patch: { adults: 2, children: 3 } },
      { id: 'f42', label: '4 + 2', patch: { adults: 4, children: 2 } },
    ],
  },

  ability: {
    id: 'ability',
    speaker: 'marco',
    promptKey: 'iv.ability.q',
    chips: [
      abilityChip('first', 'iv.ability.first', 'first_timer'),
      abilityChip('beginner', 'iv.ability.beginner', 'beginner'),
      {
        id: 'mixed',
        labelKey: 'iv.ability.mixed',
        patch: { groupAbilities: ['beginner', 'advanced'] },
        reaction: { speaker: 'marco', textKey: 'iv.marco.mixed' },
      },
      abilityChip('intermediate', 'iv.ability.intermediate', 'intermediate'),
      abilityChip('advanced', 'iv.ability.advanced', 'advanced'),
    ],
  },

  vibe: {
    id: 'vibe',
    speaker: 'maya',
    promptKey: 'iv.vibe.q',
    multi: true,
    freeText: 'parse',
    freeTextKey: 'iv.vibe.other',
    chips: [
      { id: 'snowsure', labelKey: 'iv.vibe.snowsure', patch: { wantSnowsure: true } },
      { id: 'apres', labelKey: 'iv.vibe.apres', patch: { wantApres: true } },
      {
        id: 'uncrowded',
        labelKey: 'iv.vibe.uncrowded',
        patch: { wantUncrowded: true },
        reaction: { speaker: 'marco', textKey: 'iv.marco.uncrowded' },
      },
      { id: 'queues', labelKey: 'iv.vibe.queues', patch: { wantShortLiftQueues: true } },
      { id: 'night', labelKey: 'iv.vibe.night', patch: { wantNightSki: true } },
      {
        id: 'skiinout',
        labelKey: 'iv.vibe.skiinout',
        patch: { wantSkiInSkiOut: true },
        reaction: { speaker: 'lena', textKey: 'iv.lena.skiinout' },
      },
      { id: 'big', labelKey: 'iv.vibe.big', patch: { minKm: 100 } },
    ],
  },

  budget: {
    id: 'budget',
    speaker: 'jonas',
    promptKey: 'iv.budget.q',
    freeText: 'number',
    freeTextKey: 'iv.budget.other',
    chips: [
      {
        id: 'b1000',
        labelKey: 'iv.budget.1000',
        facts: { budgetPerPersonUsd: 1000 },
        reaction: { speaker: 'jonas', textKey: 'iv.jonas.tight' },
      },
      { id: 'b1500', labelKey: 'iv.budget.1500', facts: { budgetPerPersonUsd: 1500 } },
      { id: 'b2000', labelKey: 'iv.budget.2000', facts: { budgetPerPersonUsd: 2000 } },
      { id: 'bopen', labelKey: 'iv.budget.open', facts: { budgetPerPersonUsd: null } },
    ],
  },

  origin: {
    id: 'origin',
    speaker: 'jonas',
    promptKey: 'iv.origin.q',
    freeText: 'iata',
    freeTextKey: 'iv.origin.other',
    chips: [
      {
        id: 'ewr',
        label: 'Newark · EWR',
        patch: { originAirport: 'EWR' },
        reaction: { speaker: 'tomer', textKey: 'iv.tomer.origin' },
      },
      {
        id: 'jfk',
        label: 'New York · JFK',
        patch: { originAirport: 'JFK' },
        reaction: { speaker: 'tomer', textKey: 'iv.tomer.origin' },
      },
      {
        id: 'tlv',
        label: 'Tel Aviv · TLV',
        patch: { originAirport: 'TLV' },
        reaction: { speaker: 'tomer', textKey: 'iv.tomer.origin' },
      },
      { id: 'noflight', labelKey: 'iv.origin.skip' },
    ],
  },

  when: {
    id: 'when',
    speaker: 'maya',
    promptKey: 'iv.when.q',
    chips: [
      { id: 'dec', labelKey: 'iv.when.dec', month: 12 },
      { id: 'jan', labelKey: 'iv.when.jan', month: 1 },
      { id: 'feb', labelKey: 'iv.when.feb', month: 2 },
      { id: 'mar', labelKey: 'iv.when.mar', month: 3 },
      { id: 'flex', labelKey: 'iv.when.flex' },
    ],
  },

  where: {
    id: 'where',
    speaker: 'maya',
    promptKey: 'iv.where.q',
    multi: true,
    freeText: 'parse',
    freeTextKey: 'iv.where.other',
    chips: [
      { id: 'anywhere', labelKey: 'iv.where.anywhere' },
      { id: 'at', countryCode: 'AT', patch: { countries: ['AT'] } },
      { id: 'it', countryCode: 'IT', patch: { countries: ['IT'] } },
      { id: 'fr', countryCode: 'FR', patch: { countries: ['FR'] } },
      { id: 'ch', countryCode: 'CH', patch: { countries: ['CH'] } },
      { id: 'bg', countryCode: 'BG', patch: { countries: ['BG'] } },
      {
        id: 'ge',
        countryCode: 'GE',
        patch: { countries: ['GE'] },
        reaction: { speaker: 'marco', textKey: 'iv.marco.georgia' },
      },
    ],
  },
};

/** The next question, given everything answered so far. null = done. */
export function nextStepId(current: StepId, state: InterviewState): StepId | null {
  switch (current) {
    case 'party':
      if (state.facts.partyKind === 'friends') return 'sizeFriends';
      if (state.facts.partyKind === 'family') return 'sizeFamily';
      return 'ability';
    case 'sizeFriends':
    case 'sizeFamily':
      return 'ability';
    case 'ability':
      return 'vibe';
    case 'vibe':
      return 'budget';
    case 'budget':
      return 'origin';
    case 'origin':
      return 'when';
    case 'when':
      return 'where';
    case 'where':
      return null;
  }
}

// ---------------------------------------------------------------------------
// Applying answers
// ---------------------------------------------------------------------------

/**
 * The pencilled-in week for a month chip: Saturday to Saturday, seven nights.
 *
 * December aims at the holiday fortnight (the Saturday on or after the 19th);
 * other months take the second Saturday. If the month's window has already
 * begun, it rolls to next year. These dates are a SUGGESTION and every caller
 * must set `datesAssumed` and render the edit affordance — see module header.
 */
export function monthWindow(month: number, now: Date): { dateFrom: string; dateTo: string } {
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const anchorDay = month === 12 ? 19 : 8;
  let year = now.getUTCFullYear();
  const build = (y: number) => {
    const anchor = new Date(Date.UTC(y, month - 1, anchorDay));
    const toSaturday = (6 - anchor.getUTCDay() + 7) % 7;
    const from = new Date(anchor.getTime() + toSaturday * 86400000);
    return { from, to: new Date(from.getTime() + 7 * 86400000) };
  };
  let window = build(year);
  if (window.from.getTime() <= now.getTime()) window = build(year + 1);
  return { dateFrom: iso(window.from), dateTo: iso(window.to) };
}

/** Merge one criteria patch, concatenating array fields instead of replacing. */
function mergePatch(into: SearchCriteria, patch: SearchCriteria): SearchCriteria {
  const merged: Record<string, unknown> = { ...into };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined || value === null) continue;
    const existing = merged[key];
    if (Array.isArray(value) && Array.isArray(existing)) {
      merged[key] = [...new Set([...(existing as unknown[]), ...value])];
    } else {
      merged[key] = value;
    }
  }
  return merged as SearchCriteria;
}

export interface AppliedAnswer {
  state: InterviewState;
  /** Specialist chime-ins earned by this answer, deduped, in cast order. */
  reactions: Reaction[];
}

/**
 * Apply the chips the user tapped on the CURRENT step, plus optional typed
 * values already validated by the caller (`numberValue` for 'number' steps,
 * `iataValue` for 'iata' steps). 'parse' free text is handled by the caller —
 * it needs the server — and arrives here as no chips at all; the caller then
 * swaps in the parsed criteria via `withParsedCriteria`.
 */
export function applyChips(
  state: InterviewState,
  chipIds: string[],
  typed?: { numberValue?: number; iataValue?: string },
): AppliedAnswer {
  if (state.stepId === null) return { state, reactions: [] };
  const step = STEPS[state.stepId];

  let criteria = state.criteria;
  let facts = { ...state.facts };
  const reactions: Reaction[] = [];

  for (const chipId of chipIds) {
    const chip = step.chips.find((c) => c.id === chipId);
    if (!chip) continue;
    if (chip.patch) criteria = mergePatch(criteria, chip.patch);
    if (chip.facts) facts = { ...facts, ...chip.facts };
    if (chip.month !== undefined) {
      criteria = { ...criteria, ...monthWindow(chip.month, new Date()) };
      facts = { ...facts, datesAssumed: true };
    }
    if (chip.reaction && !reactions.some((r) => r.textKey === chip.reaction?.textKey)) {
      reactions.push(chip.reaction);
    }
  }

  if (typed?.numberValue !== undefined && Number.isFinite(typed.numberValue)) {
    if (step.id === 'budget') {
      facts = { ...facts, budgetPerPersonUsd: Math.max(100, Math.round(typed.numberValue)) };
      if (facts.budgetPerPersonUsd !== null && (facts.budgetPerPersonUsd ?? 0) <= 1100) {
        reactions.push({ speaker: 'jonas', textKey: 'iv.jonas.tight' });
      }
    } else if (step.id === 'sizeFriends') {
      const n = Math.min(16, Math.max(1, Math.round(typed.numberValue)));
      criteria = { ...criteria, adults: n };
    }
  }

  if (typed?.iataValue !== undefined && /^[A-Z]{3}$/.test(typed.iataValue)) {
    criteria = { ...criteria, originAirport: typed.iataValue };
    reactions.push({ speaker: 'tomer', textKey: 'iv.tomer.origin' });
  }

  const next: InterviewState = { criteria, facts, stepId: null };
  next.stepId = nextStepId(step.id, next);
  return { state: next, reactions };
}

/**
 * Replace the accumulated criteria with what the server parsed from a typed
 * answer (parser output already merged over the running criteria server-side),
 * then advance past the current step.
 */
export function withParsedCriteria(state: InterviewState, parsed: SearchCriteria): InterviewState {
  if (state.stepId === null) return { ...state, criteria: parsed };
  const next: InterviewState = { ...state, criteria: parsed, stepId: null };
  next.stepId = nextStepId(state.stepId, next);
  return next;
}

/** End the interview now with whatever has been gathered. */
export function skipToResults(state: InterviewState): InterviewState {
  return { ...state, stepId: null };
}
