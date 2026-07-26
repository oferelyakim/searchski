/**
 * One description of every search criterion, shared by the chips and the
 * filter controls so the two can never drift apart.
 *
 * Showing the user exactly what their words were turned into is a core trust
 * feature, not a debug view: if we misread "nervous intermediate" they have to
 * be able to see it and fix it.
 *
 * Client-safe — pure data and formatting, no server imports.
 */

import type { Ability, SearchCriteria } from '@searchski/core/types';
import type { MessageKey } from '@/i18n/dictionary';
import { SHOW_REGIONAL_LAYER } from '@/lib/features';

export const ABILITIES: readonly Ability[] = [
  'first_timer',
  'beginner',
  'intermediate',
  'advanced',
  'expert',
];

export function abilityKey(a: Ability): MessageKey {
  return `ability.${a}` as MessageKey;
}

/** Criteria that appear as chips, in the order they read best. */
export const CHIP_ORDER = [
  // The trip window reads first — "14–21 February, 2 adults, from LTN" is the
  // frame everything else sits inside. It is metadata: it never ranks, it is
  // carried into the booking links, and every one of these is optional.
  'dateFrom',
  'dateTo',
  'adults',
  'children',
  'ability',
  'groupAbilities',
  'countries',
  'wantKosher',
  'wantHebrewSkiSchool',
  'maxChabadDistanceKm',
  'wantUncrowded',
  'wantSnowsure',
  'wantNightSki',
  'wantApres',
  'wantFamily',
  'wantSkiInSkiOut',
  'maxPassPricePerDay',
  'originAirport',
  'maxTransferMinutes',
  'minKm',
  'maxKm',
  'minVerticalM',
  'minTopElevM',
] as const;

export type ChipKey = (typeof CHIP_ORDER)[number];

/**
 * Regional-layer criteria. These stay in `CHIP_ORDER` and keep their labels so
 * the types and translations survive intact — only the rendering is gated, so
 * re-enabling is one boolean rather than a reconstruction job.
 *
 * They also still PARSE: an old saved query carrying `wantKosher` remains valid
 * and simply stops being shown or scored. Dropping the key would turn a
 * dormant preference into a parse error.
 */
const REGIONAL_CHIPS: readonly ChipKey[] = [
  'wantKosher',
  'wantHebrewSkiSchool',
  'maxChabadDistanceKm',
];

/** The chips actually rendered, in order. */
export const VISIBLE_CHIP_ORDER: readonly ChipKey[] = SHOW_REGIONAL_LAYER
  ? CHIP_ORDER
  : CHIP_ORDER.filter((key) => !REGIONAL_CHIPS.includes(key));

export const CRITERION_LABEL: Record<ChipKey, MessageKey> = {
  dateFrom: 'criteria.dateFrom',
  dateTo: 'criteria.dateTo',
  adults: 'criteria.adults',
  children: 'criteria.children',
  ability: 'criteria.ability',
  groupAbilities: 'criteria.groupAbilities',
  countries: 'criteria.countries',
  wantKosher: 'criteria.wantKosher',
  wantHebrewSkiSchool: 'criteria.wantHebrewSkiSchool',
  maxChabadDistanceKm: 'criteria.maxChabadDistanceKm',
  wantUncrowded: 'criteria.wantUncrowded',
  wantSnowsure: 'criteria.wantSnowsure',
  wantNightSki: 'criteria.wantNightSki',
  wantApres: 'criteria.wantApres',
  wantFamily: 'criteria.wantFamily',
  wantSkiInSkiOut: 'criteria.wantSkiInSkiOut',
  maxPassPricePerDay: 'criteria.maxPassPricePerDay',
  originAirport: 'criteria.originAirport',
  maxTransferMinutes: 'criteria.maxTransferMinutes',
  minKm: 'criteria.minKm',
  maxKm: 'criteria.maxKm',
  minVerticalM: 'criteria.minVerticalM',
  minTopElevM: 'criteria.minTopElevM',
};

/** Booleans render as a bare label; everything else as "label: value". */
export const BOOLEAN_KEYS: readonly ChipKey[] = [
  'wantKosher',
  'wantHebrewSkiSchool',
  'wantUncrowded',
  'wantSnowsure',
  'wantNightSki',
  'wantApres',
  'wantFamily',
  'wantSkiInSkiOut',
];

/**
 * The boolean toggles the filter panel actually renders.
 *
 * `BOOLEAN_KEYS` itself is left whole on purpose — it answers "does this
 * criterion render as a bare label or as label: value", which is a formatting
 * question that stays true whether or not the criterion is currently shown.
 * Filtering it directly would make a hidden chip render as "Kosher food: true"
 * the day the flag goes back on.
 */
export const VISIBLE_BOOLEAN_KEYS: readonly ChipKey[] = BOOLEAN_KEYS.filter((key) =>
  VISIBLE_CHIP_ORDER.includes(key)
);

export interface Chip {
  key: ChipKey;
  label: string;
  value: string | null;
}

export function chipsFor(
  criteria: SearchCriteria,
  t: (key: MessageKey) => string,
  countryLabel: (code: string) => string,
): Chip[] {
  const chips: Chip[] = [];

  for (const key of VISIBLE_CHIP_ORDER) {
    const raw = (criteria as Record<string, unknown>)[key];
    if (raw === undefined || raw === null) continue;
    if (Array.isArray(raw) && raw.length === 0) continue;
    if (raw === false) continue;

    const label = t(CRITERION_LABEL[key]);

    if (BOOLEAN_KEYS.includes(key)) {
      chips.push({ key, label, value: null });
      continue;
    }

    let value: string;
    switch (key) {
      case 'ability':
        value = t(abilityKey(raw as Ability));
        break;
      case 'groupAbilities':
        value = (raw as Ability[]).map((a) => t(abilityKey(a))).join(' + ');
        break;
      case 'countries':
        value = (raw as string[]).map(countryLabel).join(', ');
        break;
      case 'maxChabadDistanceKm':
        value = `${String(raw)} km`;
        break;
      case 'maxTransferMinutes': {
        const mins = Number(raw);
        value = mins >= 60 ? `${Math.round((mins / 60) * 10) / 10} h` : `${mins} min`;
        break;
      }
      case 'maxPassPricePerDay':
        value = `${String(raw)}${criteria.currency ? ` ${criteria.currency}` : ''} / day`;
        break;
      case 'minKm':
      case 'maxKm':
        value = `${String(raw)} km`;
        break;
      case 'minVerticalM':
      case 'minTopElevM':
        value = `${String(raw)} m`;
        break;
      default:
        value = String(raw);
    }
    chips.push({ key, label, value });
  }

  return chips;
}

/** Remove one criterion, returning a new object. */
export function withoutCriterion(criteria: SearchCriteria, key: ChipKey): SearchCriteria {
  const next: Record<string, unknown> = { ...criteria };
  delete next[key];
  // `ability` is derived from `groupAbilities` when a group was parsed.
  if (key === 'groupAbilities') delete next['ability'];
  if (key === 'maxPassPricePerDay') delete next['currency'];
  return next as SearchCriteria;
}

/** Set or clear one criterion, returning a new object. */
export function withCriterion(
  criteria: SearchCriteria,
  key: keyof SearchCriteria,
  value: unknown,
): SearchCriteria {
  const next: Record<string, unknown> = { ...criteria };
  const isEmpty =
    value === undefined ||
    value === null ||
    value === false ||
    value === '' ||
    (Array.isArray(value) && value.length === 0) ||
    (typeof value === 'number' && !Number.isFinite(value));
  if (isEmpty) delete next[key as string];
  else next[key as string] = value;
  return next as SearchCriteria;
}

/** Everything except the user's raw sentence — used by "clear all". */
export function clearedCriteria(criteria: SearchCriteria): SearchCriteria {
  const next: SearchCriteria = {};
  if (criteria.rawQuery !== undefined) next.rawQuery = criteria.rawQuery;
  if (criteria.limit !== undefined) next.limit = criteria.limit;
  return next;
}

export function countCriteria(criteria: SearchCriteria): number {
  return VISIBLE_CHIP_ORDER.reduce((n, key) => {
    const raw = (criteria as Record<string, unknown>)[key];
    if (raw === undefined || raw === null || raw === false) return n;
    if (Array.isArray(raw) && raw.length === 0) return n;
    return n + 1;
  }, 0);
}
