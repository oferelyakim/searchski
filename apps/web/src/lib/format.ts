/**
 * Presentation helpers. Pure, no I/O, safe in client and server components.
 *
 * The honesty rules of PLAN.md §9 are enforced here rather than repeated in
 * every component:
 *   * `nightSkiLabel(null)` is "unknown", never "no".
 *   * `curatedValue()` refuses to hand back an unverified curated value.
 */

import type {
  Difficulty,
  IsraelProfile,
  Provenance,
  SkiArea,
  VerificationStatus,
} from '@searchski/core/types';
import type { MessageKey } from '@/i18n/dictionary';

export const DIFFICULTY_ORDER: readonly Difficulty[] = [
  'novice',
  'easy',
  'intermediate',
  'advanced',
  'expert',
  'freeride',
  'other',
];

/**
 * Piste-difficulty colours resolve to theme-aware CSS custom properties, so
 * light and dark each get their own validated steps rather than a flip.
 * Definitions and the reasoning live in app/globals.css.
 */
export const DIFFICULTY_COLOR: Record<Difficulty, string> = {
  novice: 'var(--piste-novice)',
  easy: 'var(--piste-easy)',
  intermediate: 'var(--piste-intermediate)',
  advanced: 'var(--piste-advanced)',
  expert: 'var(--piste-expert)',
  freeride: 'var(--piste-freeride)',
  other: 'var(--piste-other)',
};

export function difficultyKey(d: Difficulty): MessageKey {
  return `difficulty.${d}` as MessageKey;
}

const COUNTRY_NAMES: Record<string, string> = {
  GE: 'Georgia',
  BG: 'Bulgaria',
  IT: 'Italy',
  AT: 'Austria',
  FR: 'France',
  CH: 'Switzerland',
  DE: 'Germany',
  ES: 'Spain',
  AD: 'Andorra',
  SI: 'Slovenia',
  SK: 'Slovakia',
  CZ: 'Czechia',
  PL: 'Poland',
  RO: 'Romania',
  RS: 'Serbia',
  BA: 'Bosnia and Herzegovina',
  ME: 'Montenegro',
  MK: 'North Macedonia',
  GR: 'Greece',
  TR: 'Türkiye',
  NO: 'Norway',
  SE: 'Sweden',
  FI: 'Finland',
  IL: 'Israel',
};

export function countryName(code: string | null): string {
  if (!code) return '—';
  return COUNTRY_NAMES[code] ?? code;
}

export function flagEmoji(code: string | null): string {
  if (!code || code.length !== 2) return '';
  const base = 0x1f1e6;
  const upper = code.toUpperCase();
  const a = upper.codePointAt(0);
  const b = upper.codePointAt(1);
  if (a === undefined || b === undefined) return '';
  return String.fromCodePoint(base + (a - 65), base + (b - 65));
}

export function km(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return `${value.toFixed(digits)} km`;
}

export function metres(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return `${Math.round(value).toLocaleString()} m`;
}

export function minutesToHm(total: number | null | undefined): string {
  if (total === null || total === undefined || !Number.isFinite(total)) return '—';
  const h = Math.floor(total / 60);
  const m = Math.round(total % 60);
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

export function money(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${amount} ${currency}`;
  }
}

export function percent(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return `${Math.round(value * 100)}%`;
}

/** Lift type keys arrive as OSM tokens: `chair_lift` → `Chair lift`. */
export function humanLiftType(key: string): string {
  const cleaned = key.replace(/_/g, ' ').trim();
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

// ---------------------------------------------------------------------------
// Honesty helpers
// ---------------------------------------------------------------------------

export function verificationOf(provenance: Provenance | null | undefined): VerificationStatus | null {
  if (!provenance) return null;
  return provenance.verification ?? null;
}

export function isVerified(provenance: Provenance | null | undefined): boolean {
  return verificationOf(provenance) === 'verified';
}

/**
 * Gate on a curated value. Returns the value ONLY when a human has verified
 * it. Everything else comes back as a claim the UI must label, never assert.
 */
export function curatedValue<T>(
  profile: IsraelProfile | null | undefined,
  read: (p: IsraelProfile) => T | null,
): { value: T | null; status: VerificationStatus | 'absent'; claim: T | null } {
  if (!profile) return { value: null, status: 'absent', claim: null };
  const raw = read(profile);
  const status = verificationOf(profile.provenance) ?? 'unverified';
  if (raw === null || raw === undefined) return { value: null, status, claim: null };
  return status === 'verified' ? { value: raw, status, claim: raw } : { value: null, status, claim: raw };
}

/** `null` is unknown. It is NEVER "no night skiing". */
export function nightSkiState(area: SkiArea): 'yes' | 'no' | 'unknown' {
  if (area.hasNightSki === null || area.hasNightSki === undefined) return 'unknown';
  return area.hasNightSki ? 'yes' : 'no';
}

/**
 * Crowding bucket from modelled capacity per piste km. Relative only — see
 * LIFT_CAPACITY_PPH in the contract types.
 */
export function crowdingBucket(area: SkiArea): {
  level: 'quiet' | 'moderate' | 'busy' | 'unknown';
  capacityPerKm: number | null;
} {
  const cpk = area.capacityPerKm;
  if (cpk === null || !Number.isFinite(cpk)) return { level: 'unknown', capacityPerKm: null };
  if (cpk >= 400) return { level: 'quiet', capacityPerKm: cpk };
  if (cpk >= 200) return { level: 'moderate', capacityPerKm: cpk };
  return { level: 'busy', capacityPerKm: cpk };
}

/** A resort's own site, if we hold one. Used for the outbound link. */
export function officialSite(area: SkiArea): string | null {
  const site = area.websites.find((w) => /^https?:\/\//i.test(w));
  return site ?? null;
}

/**
 * We never embed or mirror an operator's trail map — that is their artwork,
 * and PLAN.md §9 draws the line at facts. We link to their site instead.
 */
export function trailMapLink(area: SkiArea): string | null {
  return officialSite(area);
}

export function formatDate(iso: string, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale === 'he' ? 'he-IL' : 'en-GB', {
      day: 'numeric',
      month: 'short',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}
