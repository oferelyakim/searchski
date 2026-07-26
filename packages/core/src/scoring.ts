/**
 * Searchski deterministic scoring engine.
 *
 * ===========================================================================
 * THE ONE RULE
 * ===========================================================================
 * The ranking is deterministic and explainable. An LLM never ranks. Given the
 * same areas, criteria and context, `search()` returns byte-identical output
 * forever. Every number a user sees can be traced to a factor, a weight and a
 * sentence in plain English.
 *
 * ===========================================================================
 * THE SECOND RULE: missing data is NEUTRAL, never zero
 * ===========================================================================
 * OSM coverage is excellent in the Alps and thin in Georgia and Bulgaria —
 * which are the #1 and #2 destinations for this product's audience. If a
 * missing field scored 0 we would systematically bury exactly the resorts the
 * user came for. So:
 *
 *   - a factor with no data returns 0.5 (neutral) and sets `dataMissing`,
 *   - a factor with *partial* data renormalises over the components it does
 *     have rather than scoring the missing ones as zero,
 *   - hard filters NEVER exclude an area for a field we do not know. You are
 *     only ever filtered out on evidence, never on absence of evidence.
 *
 * ===========================================================================
 * THE THIRD RULE: unverified curated data must not influence ranking
 * ===========================================================================
 * `IsraelProfile` rows are hand-typed. Telling someone a restaurant is kosher
 * when it is not is a real harm to a real person's trip. So curated fields are
 * only read when `provenance.verification === 'verified'`. Anything else goes
 * neutral with `dataMissing: true`, and the reason string says so out loud.
 *
 * This module is PURE. No I/O, no clock, no randomness, no network.
 */

import {
  LIFT_CAPACITY_PPH,
  type Ability,
  type AirportTransfer,
  type ApresProxy,
  type Difficulty,
  type IsraelProfile,
  type NameMatch,
  type PassPrice,
  type ScoreFactor,
  type ScoredResult,
  type SearchCriteria,
  type SearchResponse,
  type SeasonDates,
  type SkiArea,
} from './types.js';

// ---------------------------------------------------------------------------
// Context — everything the scorer needs that does not live on SkiArea itself.
// ---------------------------------------------------------------------------

/** A resolved lift-pass price, normalised to one adult day. */
export interface DailyPassPrice {
  price: number;
  currency: string;
  /** How we got to a per-day number, e.g. "6-day pass / 6". Shown to users. */
  basis: string;
}

/**
 * Side data for scoring. All maps are keyed by `SkiArea.id`, except
 * `passPrices` which also accepts a `PassRegion.id` key (an area inherits its
 * pass region's price when it has no price of its own).
 *
 * Every field is optional: the engine must produce a sensible, explained
 * ranking from `SkiArea` alone.
 */
export interface ScoringContext {
  israelProfiles?: Readonly<Record<string, IsraelProfile>>;
  apresProxies?: Readonly<Record<string, ApresProxy>>;
  transfers?: Readonly<Record<string, readonly AirportTransfer[]>>;
  passPrices?: Readonly<Record<string, readonly PassPrice[]>>;
  /**
   * When each resort opens and closes, keyed by `SkiArea.id`.
   *
   * ALWAYS ABSENT TODAY. The `season_dates` table exists and is empty, and
   * nothing in the ETL fills it. The `seasonFit` factor is written against this
   * map so that the day it has rows the factor starts working; until then it
   * declares itself inert (weight 0) and says out loud that we do not know.
   * Wiring the map now is not the same as pretending it has data.
   */
  seasons?: ReadonlyMap<string, SeasonDates>;
  /** Per-factor weight overrides. Merged over DEFAULT_WEIGHTS. */
  weights?: Partial<Record<FactorKey, Partial<FactorWeight>>>;
  /** Recorded on the response so the UI can say how the query was understood. */
  parsedBy?: 'llm' | 'deterministic';
}

// ---------------------------------------------------------------------------
// Factors and weights
// ---------------------------------------------------------------------------

export type FactorKey =
  | 'abilityFit'
  | 'sizeFit'
  | 'snowReliability'
  | 'liftQueues'
  | 'slopeQuiet'
  | 'nightSki'
  | 'apresFit'
  | 'familyFit'
  | 'verticalFit'
  | 'altitudeFit'
  | 'transferTime'
  | 'israelFit'
  | 'passPrice'
  | 'seasonFit';

export interface FactorWeight {
  /**
   * Weight when the user did not mention this. 0 means "off unless asked" —
   * a query about nightlife should not be quietly re-ranked by night skiing.
   */
  base: number;
  /** Weight when the query explicitly engages this factor. */
  active: number;
}

/**
 * THE tuning surface. Every weight in the product lives here and nowhere else.
 *
 * These are *relative* numbers. For any given query the engine collects the
 * factors that actually apply, then renormalises their weights to sum to
 * exactly 100 — so a three-criteria query is decided by those three criteria
 * and is not diluted by eight irrelevant ones.
 *
 * Rationale for the ordering:
 *   - abilityFit is the highest active weight: a resort you cannot ski is not
 *     a match at any price.
 *   - israelFit is second: it is the entire reason this product exists, and it
 *     is the only data no competitor has.
 *   - the always-on base weights are deliberately small. They exist so that a
 *     bare query ("ski") still returns big, high, snow-reliable areas first
 *     instead of an arbitrary order.
 */
export const DEFAULT_WEIGHTS: Readonly<Record<FactorKey, FactorWeight>> = {
  abilityFit: { base: 0, active: 26 },
  israelFit: { base: 0, active: 24 },
  snowReliability: { base: 6, active: 22 },
  familyFit: { base: 0, active: 18 },
  sizeFit: { base: 8, active: 18 },
  nightSki: { base: 0, active: 18 },
  passPrice: { base: 0, active: 18 },
  apresFit: { base: 0, active: 16 },
  // The two capacity readings are mirror images and BOTH have base 0 on
  // purpose. Either one as an always-on default would bake a hidden preference
  // for over- or under-lifted resorts into every query that never asked.
  liftQueues: { base: 0, active: 16 },
  slopeQuiet: { base: 0, active: 16 },
  altitudeFit: { base: 3, active: 16 },
  transferTime: { base: 0, active: 14 },
  verticalFit: { base: 3, active: 14 },
  /*
   * UNREACHABLE TODAY, and deliberately so.
   *
   * `active` is what seasonFit WILL be worth once `season_dates` has rows — a
   * resort that is shut on your dates is not a match at any price, so it sits
   * with the heavier factors. But we hold no season dates for any resort on
   * earth, so the factor returns `inert: true` on every evaluation and is
   * reported at weight 0 instead. This number is the value of the data, not a
   * claim that we have it.
   */
  seasonFit: { base: 0, active: 20 },
};

// ---------------------------------------------------------------------------
// Tuning constants — named so they are auditable, not buried in expressions.
// ---------------------------------------------------------------------------

/** Below 3 results we start relaxing filters rather than showing a dead end. */
export const MIN_RESULTS_BEFORE_RELAXING = 3;

/** Default page size when the caller does not ask for one. */
export const DEFAULT_LIMIT = 20;

/**
 * `piste:snowmaking` is not a usable signal of ABSENCE anywhere in the world.
 *
 * Measured against the upstream dump on 2026-07-26: 772 of 108,612 downhill
 * runs carry the tag — 0.7% globally, and three runs across Georgia, Bulgaria
 * and Italy combined. The Stage 0 QA report has snowmakingKm missing on 25/25
 * Bulgarian areas, 11/11 Georgian, and 309/310 ITALIAN.
 *
 * So the rule is global, not per-country:
 *   snowmakingKm > 0   -> positive evidence, scored.
 *   snowmakingKm === 0 -> ALWAYS "we could not establish this", never a
 *                         penalty, in every country.
 *
 * An earlier version of this file kept a per-country allow-list (BG, GE and the
 * Balkans). That was the right instinct with the wrong scope: it left Italy —
 * over half the roster — being read as "we checked and there is none" on a fact
 * nobody ever established. There is no country where a zero is informative.
 *
 * PLAN.md section 5 lists snowmaking as a free snow-reliability input. On this
 * evidence it is not: altitude and vertical carry the factor, and snowmaking is
 * a bonus when present and silent otherwise.
 */
const SNOWMAKING_ZERO_IS_ALWAYS_A_DATA_GAP = true;

/** Piste km at which "big enough" saturates when the user gave no minimum. */
const DEFAULT_SIZE_TARGET_KM = 80;
/** Top-station elevation ramp for altitudeFit: 800 m scores 0, 3500 m scores 1. */
const ALT_FLOOR_M = 800;
const ALT_CEILING_M = 3500;
/** snowReliability altitude ramp. 1200 m is marginal, 3000 m is bankable. */
const SNOW_ALT_FLOOR_M = 1200;
const SNOW_ALT_CEILING_M = 3000;
/** Vertical drop at which verticalFit saturates when the user gave no minimum. */
const DEFAULT_VERTICAL_TARGET_M = 800;
/** Snowmaking coverage (as a share of piste km) that earns full marks. */
const SNOWMAKING_FULL_MARKS_SHARE = 0.5;
/** Lift throughput (persons/hour per piste km) at which queues stop mattering. */
const CAPACITY_TARGET_PPH_PER_KM = 700;
/**
 * Modelled skier-density band for `slopeQuiet`, in persons/hour of lift
 * capacity per km of piste. At or below the floor the pistes should feel empty;
 * at or above the ceiling they are dense by any resort's own marketing.
 */
const DENSITY_QUIET_PPH_PER_KM = 200;
const DENSITY_BUSY_PPH_PER_KM = 1200;
/** Transfer ramp: 30 min is perfect, 240 min scores 0. */
const TRANSFER_BEST_MIN = 30;
const TRANSFER_WORST_MIN = 240;
/** Absolute price ramp used when the user gave no budget. */
const PRICE_BEST_EUR = 20;
const PRICE_WORST_EUR = 90;
/** Novice+easy share that earns full marks on the terrain half of familyFit. */
const FAMILY_TERRAIN_TARGET_SHARE = 0.45;

/**
 * Shortest resort name or alias allowed to pin a result to the top.
 *
 * Names this short collide with ordinary prose — Georgia has an area called
 * "Crystal", and "crystal clear snow" would otherwise pin it. Four characters
 * plus a word-boundary match keeps the false-positive rate low, and because a
 * name match is only a SOFT pin (the area is still fully scored and explained,
 * never filtered in or out) a wrong pin costs one place in the ranking rather
 * than a wrong answer. Raise this if false pins show up in real query logs.
 */
export const MIN_NAME_MATCH_CHARS = 4;

/**
 * Single-word names that are also ordinary words. For these ONLY, a pin
 * requires the folded query to equal the folded name — an embedded match is
 * far more likely to be someone describing snow than naming a resort.
 *
 * Derived, not guessed: folding all 179 single-word aliases in the GE/BG/IT
 * dataset against ordinary ski vocabulary yields exactly this one collision.
 * The ETL flags new collisions in its QA report when countries are added —
 * re-check this set then rather than trying to predict it.
 */
const AMBIGUOUS_SINGLE_WORD_NAMES: ReadonlySet<string> = new Set(['crystal']);

// ---------------------------------------------------------------------------
// Small pure helpers
// ---------------------------------------------------------------------------

const MS_PER_DAY = 86_400_000;

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

/** ISO YYYY-MM-DD -> midnight UTC, or null if it is not a date. */
function parseIsoDay(value: string | null | undefined): number | null {
  if (value == null) return null;
  const ms = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(ms) ? ms : null;
}

function roundTo(n: number, dp: number): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

/**
 * Diminishing-returns curve.
 *
 *   saturating(v, t) = 1 - exp(-1.5 * v / t)
 *
 *   v/t = 0    -> 0.00
 *   v/t = 0.5  -> 0.53
 *   v/t = 1    -> 0.78     (the target is "good", not "perfect")
 *   v/t = 2    -> 0.95
 *   v/t = 4    -> 0.9975
 *
 * This is the shape the product needs: with t = 80 km, the step from 20 km to
 * 60 km is worth 0.36 while the step from 300 km to 340 km is worth 0.002.
 * Exactly the intuition — more terrain always helps a little, and stops
 * mattering once there is more than anyone can ski in a week.
 */
function saturating(value: number, target: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  const t = Number.isFinite(target) && target > 0 ? target : 1;
  return 1 - Math.exp((-1.5 * value) / t);
}

/** Linear ramp from `floor` (0) to `ceiling` (1), clamped at both ends. */
function ramp(value: number, floor: number, ceiling: number): number {
  if (ceiling <= floor) return 0;
  return clamp01((value - floor) / (ceiling - floor));
}

function pct(x: number): string {
  return `${Math.round(x * 100)}%`;
}

function km(x: number): string {
  return x >= 10 ? `${Math.round(x)} km` : `${roundTo(x, 1)} km`;
}

/** Grading vocabulary shared by the reason strings, so wording stays consistent. */
function verdict(raw: number): string {
  if (raw >= 0.85) return 'an excellent match';
  if (raw >= 0.65) return 'a good match';
  if (raw >= 0.45) return 'a workable match';
  if (raw >= 0.25) return 'a weak match';
  return 'a poor match';
}

const ABILITY_LABEL: Readonly<Record<Ability, string>> = {
  first_timer: 'a first-timer',
  beginner: 'a beginner',
  intermediate: 'an intermediate',
  advanced: 'an advanced skier',
  expert: 'an expert',
};

// ---------------------------------------------------------------------------
// Resort-name matching
// ---------------------------------------------------------------------------

/**
 * Fold a name or a query to a comparable form: decomposed, accents stripped,
 * lower-cased, everything that is not a letter or a digit collapsed to a single
 * space.
 *
 * Stripping diacritics is load-bearing, not cosmetic. Alta Badia's alias list
 * includes `Sëlva`, `Urtijëi` and `Gröden`, and nobody reaches for a diaeresis
 * when typing into a search box. `\p{L}` rather than `[a-z]` keeps the Cyrillic
 * and Georgian aliases (Гудаури, გუდაური) matchable too.
 */
export function normaliseForMatch(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Mn}+/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Does the user's raw text name this resort?
 *
 * Matches the area's `name` and every entry in `aliases` against the query on
 * WORD BOUNDARIES — the alias has to appear as a whole run of words, so
 * "Selva" matches "selva di val gardena" typed as a query but "val" never
 * matches "value". Aliases shorter than MIN_NAME_MATCH_CHARS are skipped.
 *
 * When several aliases match, the LONGEST wins: a query naming
 * "Selva di Val Gardena" should report that, not the bare "Selva" that also
 * matched, and across areas the more specific name is the stronger signal of
 * what the user meant.
 */
export function matchAreaName(area: SkiArea, rawQuery: string | undefined | null): NameMatch | null {
  if (!rawQuery) return null;
  const folded = normaliseForMatch(rawQuery);
  if (folded.length === 0) return null;
  const haystack = ` ${folded} `;

  let best: { matched: string; isPrimaryName: boolean; normalised: string } | null = null;
  const candidates: Array<{ text: string; primary: boolean }> = [
    { text: area.name, primary: true },
    ...area.aliases.map((a) => ({ text: a, primary: false })),
  ];

  for (const candidate of candidates) {
    if (!candidate.text) continue;
    const normalised = normaliseForMatch(candidate.text);
    // Length is counted over letters only, so "Val" (3) cannot pin but
    // "Sëlva" -> "selva" (5) can.
    if (normalised.replace(/\s+/g, '').length < MIN_NAME_MATCH_CHARS) continue;
    // A name that is also an ordinary word only pins on an exact query. "Crystal"
    // names the resort; "crystal clear snow" describes the weather.
    if (!normalised.includes(' ') && AMBIGUOUS_SINGLE_WORD_NAMES.has(normalised)) {
      if (folded !== normalised) continue;
    } else if (!haystack.includes(` ${normalised} `)) {
      continue;
    }
    if (best == null || normalised.length > best.normalised.length) {
      best = { matched: candidate.text, isPrimaryName: candidate.primary, normalised };
    }
  }

  return best ? { matched: best.matched, isPrimaryName: best.isPrimaryName } : null;
}

/** Length of a name match after folding, used to rank competing pins. */
function nameMatchStrength(match: NameMatch | null | undefined): number {
  return match ? normaliseForMatch(match.matched).length : 0;
}

// ---------------------------------------------------------------------------
// Terrain accessors — tolerate either representation, prefer km buckets.
// ---------------------------------------------------------------------------

/** Piste km in one difficulty bucket, falling back to share x total. */
export function kmOfDifficulty(area: SkiArea, d: Difficulty): number {
  const bucket = area.runsByDifficulty[d];
  if (bucket && Number.isFinite(bucket.km) && bucket.km > 0) return bucket.km;
  const share = area.terrainMix[d];
  if (share != null && Number.isFinite(share) && area.kmTotal > 0) return share * area.kmTotal;
  return 0;
}

/** Share of graded downhill terrain in one difficulty bucket, 0..1. */
export function shareOfDifficulty(area: SkiArea, d: Difficulty): number {
  const share = area.terrainMix[d];
  if (share != null && Number.isFinite(share)) return clamp01(share);
  if (area.kmTotal > 0) {
    const bucket = area.runsByDifficulty[d];
    if (bucket && Number.isFinite(bucket.km)) return clamp01(bucket.km / area.kmTotal);
  }
  return 0;
}

/** True when we have any graded terrain breakdown at all. */
function hasTerrainData(area: SkiArea): boolean {
  if (area.kmTotal <= 0) return false;
  const mixKeys = Object.keys(area.terrainMix);
  if (mixKeys.length > 0) return true;
  return Object.keys(area.runsByDifficulty).length > 0;
}

/**
 * Lift throughput per piste km. Uses the ETL's value when present, otherwise
 * recomputes it from the lift inventory with LIFT_CAPACITY_PPH so that an area
 * with lifts but no derived field is not silently treated as unknown.
 */
export function effectiveCapacityPerKm(area: SkiArea): number | null {
  if (area.capacityPerKm != null && Number.isFinite(area.capacityPerKm) && area.capacityPerKm > 0) {
    return area.capacityPerKm;
  }
  if (area.kmTotal <= 0) return null;
  let pph = area.uphillCapacityPph;
  if (!Number.isFinite(pph) || pph <= 0) {
    pph = 0;
    for (const [type, bucket] of Object.entries(area.liftsByType)) {
      const perLift = LIFT_CAPACITY_PPH[type] ?? LIFT_CAPACITY_PPH['unknown'] ?? 800;
      pph += (bucket?.count ?? 0) * perLift;
    }
  }
  if (pph <= 0) return null;
  return pph / area.kmTotal;
}

// ---------------------------------------------------------------------------
// Ability model
// ---------------------------------------------------------------------------

interface AbilityProfile {
  /** How useful each difficulty bucket is to this skier, 0..1. */
  weights: Partial<Record<Difficulty, number>>;
  /** Share of the mountain at which "enough of the resort suits me" saturates. */
  shareTarget: number;
  /** Absolute usable km at which "enough to fill a week" saturates. */
  kmTarget: number;
}

/**
 * Two things matter to a skier and they are not the same thing: what
 * *fraction* of the mountain they can use (do they spend the week on one
 * side?) and how many *kilometres* that actually is (will they be bored by
 * Wednesday?).
 *
 * The absolute-km term is deliberately the heavier of the two, because a 5%
 * novice share of a 200 km area (10 km of gentle runs) is genuinely a better
 * beginner week than a 40% novice share of an 8 km hill (3 km).
 */
const ABILITY_SHARE_WEIGHT = 0.35;
const ABILITY_KM_WEIGHT = 0.65;

const ABILITY_PROFILES: Readonly<Record<Ability, AbilityProfile>> = {
  first_timer: {
    weights: { novice: 1.0, easy: 0.7, intermediate: 0.1 },
    shareTarget: 0.35,
    kmTarget: 8,
  },
  beginner: {
    weights: { novice: 0.8, easy: 1.0, intermediate: 0.4 },
    shareTarget: 0.45,
    kmTarget: 12,
  },
  intermediate: {
    weights: { novice: 0.2, easy: 0.6, intermediate: 1.0, advanced: 0.4 },
    shareTarget: 0.55,
    kmTarget: 30,
  },
  advanced: {
    weights: { intermediate: 0.5, advanced: 1.0, expert: 0.8, freeride: 0.6 },
    shareTarget: 0.35,
    kmTarget: 25,
  },
  expert: {
    weights: { intermediate: 0.2, advanced: 0.8, expert: 1.0, freeride: 1.0 },
    shareTarget: 0.25,
    kmTarget: 15,
  },
};

interface AbilityScore {
  raw: number;
  usableKm: number;
  usableShare: number;
}

/**
 * abilityFit for a single ability.
 *
 *   usableShare = SUM_d  profileWeight(d) * terrainShare(d)
 *   usableKm    = SUM_d  profileWeight(d) * km(d)
 *   raw = 0.35 * saturating(usableShare, shareTarget)
 *       + 0.65 * saturating(usableKm,    kmTarget)
 */
function scoreAbility(area: SkiArea, ability: Ability): AbilityScore {
  const profile = ABILITY_PROFILES[ability];
  let usableShare = 0;
  let usableKm = 0;
  for (const [difficulty, w] of Object.entries(profile.weights)) {
    const d = difficulty as Difficulty;
    usableShare += (w ?? 0) * shareOfDifficulty(area, d);
    usableKm += (w ?? 0) * kmOfDifficulty(area, d);
  }
  const raw =
    ABILITY_SHARE_WEIGHT * saturating(usableShare, profile.shareTarget) +
    ABILITY_KM_WEIGHT * saturating(usableKm, profile.kmTarget);
  return { raw: clamp01(raw), usableKm, usableShare };
}

// ---------------------------------------------------------------------------
// Context lookups
// ---------------------------------------------------------------------------

function israelProfileFor(area: SkiArea, ctx: ScoringContext): IsraelProfile | null {
  return ctx.israelProfiles?.[area.id] ?? null;
}

/** Curated data is only real once a human has checked it. */
function isVerified(profile: IsraelProfile | null): profile is IsraelProfile {
  return profile != null && profile.provenance.verification === 'verified';
}

function apresProxyFor(area: SkiArea, ctx: ScoringContext): ApresProxy | null {
  return ctx.apresProxies?.[area.id] ?? null;
}

/**
 * Best transfer for this query: the one from the requested origin airport if
 * the user named one, otherwise the shortest drive we know about.
 */
export function bestTransfer(
  area: SkiArea,
  criteria: SearchCriteria,
  ctx: ScoringContext,
): { airportIata: string; driveMinutes: number } | null {
  const list = ctx.transfers?.[area.id];
  if (!list || list.length === 0) return null;
  const wanted = criteria.originAirport?.toUpperCase();
  const pool = wanted ? list.filter((t) => t.airportIata.toUpperCase() === wanted) : list.slice();
  if (pool.length === 0) return null;
  let best = pool[0]!;
  for (const t of pool) {
    if (t.driveMinutes < best.driveMinutes) best = t;
  }
  return { airportIata: best.airportIata, driveMinutes: best.driveMinutes };
}

/**
 * Normalise whatever pass prices we hold into one adult day.
 *
 * Preference order: an explicit 1-day adult price, then a 6-day divided by 6,
 * then a 3-day divided by 3. Multi-day passes are cheaper per day than a
 * single day, so the derived numbers are optimistic — the `basis` string says
 * which one was used so the UI never states it as a day-ticket price.
 */
export function dailyPassPrice(
  area: SkiArea,
  criteria: SearchCriteria,
  ctx: ScoringContext,
): DailyPassPrice | null {
  const byArea = ctx.passPrices?.[area.id];
  const byRegion = area.passRegionId ? ctx.passPrices?.[area.passRegionId] : undefined;
  const all = [...(byArea ?? []), ...(byRegion ?? [])];
  if (all.length === 0) return null;

  const wantCurrency = criteria.currency?.toUpperCase();
  const adults = all.filter(
    (p) => p.category === 'adult' && (!wantCurrency || p.currency.toUpperCase() === wantCurrency),
  );
  const pool = adults.length > 0 ? adults : all.filter((p) => p.category === 'adult');
  if (pool.length === 0) return null;

  const oneDay = pool.find((p) => p.duration === '1day');
  if (oneDay) return { price: oneDay.price, currency: oneDay.currency, basis: 'adult day ticket' };
  const sixDay = pool.find((p) => p.duration === '6day');
  if (sixDay) {
    return {
      price: roundTo(sixDay.price / 6, 2),
      currency: sixDay.currency,
      basis: 'adult 6-day pass divided by 6',
    };
  }
  const threeDay = pool.find((p) => p.duration === '3day');
  if (threeDay) {
    return {
      price: roundTo(threeDay.price / 3, 2),
      currency: threeDay.currency,
      basis: 'adult 3-day pass divided by 3',
    };
  }
  return null;
}

function money(p: DailyPassPrice): string {
  const symbol = p.currency === 'EUR' ? '€' : p.currency === 'USD' ? '$' : p.currency === 'ILS' ? '₪' : '';
  return symbol ? `${symbol}${roundTo(p.price, 0)}` : `${roundTo(p.price, 0)} ${p.currency}`;
}

// ---------------------------------------------------------------------------
// Factor definitions
// ---------------------------------------------------------------------------

interface FactorInput {
  area: SkiArea;
  criteria: SearchCriteria;
  israel: IsraelProfile | null;
  apres: ApresProxy | null;
  transfer: { airportIata: string; driveMinutes: number } | null;
  price: DailyPassPrice | null;
  season: SeasonDates | null;
}

interface FactorOutcome {
  raw: number;
  reason: string;
  dataMissing: boolean;
  /**
   * "I have nothing to say, and I must not pretend otherwise."
   *
   * An inert factor is REPORTED — it keeps its label and its reason, so the UI
   * can tell the user why their input did not change anything — but it is
   * applied at weight 0. Weight 0 is not the same as a neutral 0.5 at some
   * small weight: a neutral factor still compresses every other factor's
   * renormalised share and can flip a near-tie through rounding, whereas an
   * inert one leaves the arithmetic bit-for-bit as if it had never run.
   *
   * That distinction is the whole reason `seasonFit` can exist before
   * `season_dates` does. See the factor for the argument.
   */
  inert?: boolean;
}

interface FactorDef {
  key: FactorKey;
  label: string;
  /** True when the query explicitly engages this factor (uses `active` weight). */
  isActive(c: SearchCriteria): boolean;
  evaluate(input: FactorInput): FactorOutcome;
}

const NEUTRAL = 0.5;

const FACTORS: readonly FactorDef[] = [
  // -------------------------------------------------------------------------
  {
    key: 'abilityFit',
    label: 'Terrain for your level',
    isActive: (c) => c.ability != null || (c.groupAbilities?.length ?? 0) > 0,
    evaluate: ({ area, criteria }) => {
      const group = criteria.groupAbilities ?? [];
      const abilities: Ability[] = group.length > 0 ? group : criteria.ability ? [criteria.ability] : [];
      if (abilities.length === 0) {
        return {
          raw: NEUTRAL,
          reason: 'You did not say what level you ski, so terrain difficulty was not used to rank this resort.',
          dataMissing: true,
        };
      }
      if (!hasTerrainData(area)) {
        return {
          raw: NEUTRAL,
          reason:
            'No run-difficulty breakdown has been mapped for this resort yet, so we could not judge how well it suits your level. It was neither helped nor hurt by that.',
          dataMissing: true,
        };
      }

      // A group is only as happy as its worst-served member. Score the weakest
      // link and name them, because that is the decision the group is making.
      let worst: { ability: Ability; score: AbilityScore } | null = null;
      for (const ability of abilities) {
        const score = scoreAbility(area, ability);
        if (worst == null || score.raw < worst.score.raw) worst = { ability, score };
      }
      const w = worst!;
      const who = ABILITY_LABEL[w.ability];
      const detail = `about ${pct(w.score.usableShare)} of the marked terrain works for ${who}, which is roughly ${km(w.score.usableKm)} of runs`;
      const reason =
        abilities.length > 1
          ? `Scored on the least well-served member of your group, ${who}: ${detail} — ${verdict(w.score.raw)} for the group as a whole.`
          : `For ${who}, ${detail} — ${verdict(w.score.raw)}.`;
      return { raw: w.score.raw, reason, dataMissing: false };
    },
  },

  // -------------------------------------------------------------------------
  {
    key: 'sizeFit',
    label: 'Size of the ski area',
    isActive: (c) => c.minKm != null || c.maxKm != null,
    evaluate: ({ area, criteria }) => {
      if (!(area.kmTotal > 0)) {
        return {
          raw: NEUTRAL,
          reason: 'We have no piste-length figure for this resort, so its size neither helped nor hurt its score.',
          dataMissing: true,
        };
      }
      // raw = saturating(kmTotal, target), target = the stated minimum or 80 km.
      // Overshooting a stated maximum decays as maxKm / kmTotal.
      const target = criteria.minKm != null && criteria.minKm > 0 ? criteria.minKm : DEFAULT_SIZE_TARGET_KM;
      let raw = saturating(area.kmTotal, target);
      const notes: string[] = [];
      if (criteria.minKm != null && area.kmTotal < criteria.minKm) {
        notes.push(`that is short of the ${km(criteria.minKm)} you asked for`);
      } else if (criteria.minKm != null) {
        notes.push(`comfortably above the ${km(criteria.minKm)} you asked for`);
      }
      if (criteria.maxKm != null && area.kmTotal > criteria.maxKm) {
        raw *= clamp01(criteria.maxKm / area.kmTotal);
        notes.push(`larger than the ${km(criteria.maxKm)} limit you set`);
      }
      if (notes.length === 0) {
        notes.push(
          area.kmTotal >= 150
            ? 'a large area you could not ski out in a week'
            : area.kmTotal >= 60
              ? 'a solid week of skiing'
              : 'a compact area you would cover in a couple of days',
        );
      }
      return {
        raw: clamp01(raw),
        reason: `${km(area.kmTotal)} of marked piste — ${notes.join(', ')}.`,
        dataMissing: false,
      };
    },
  },

  // -------------------------------------------------------------------------
  {
    key: 'snowReliability',
    label: 'Snow reliability',
    isActive: (c) => c.wantSnowsure === true,
    evaluate: ({ area }) => {
      /*
       * Snow reliability for a decision made in October, when no live snow
       * report exists yet. Three components, weighted:
       *
       *   altitude   0.45   ramp(topElevM, 1200 m -> 3000 m)
       *   vertical   0.25   saturating(verticalM, 900 m)
       *                     — a big vertical means the top can hold snow even
       *                       when the valley is bare
       *   snowmaking 0.30   min(1, snowmakingKm / kmTotal / 0.5)
       *                     — 50% coverage earns full marks, and ONLY ever
       *                       votes when snowmakingKm > 0 (see the note on
       *                       SNOWMAKING_ZERO_IS_ALWAYS_A_DATA_GAP above:
       *                       0.7% global tagging means a zero is silence,
       *                       not evidence, in every country)
       *
       * raw = SUM(weight_i * component_i) / SUM(weight_i over PRESENT components)
       *
       * Renormalising over present components is the important part. A missing
       * component does not score 0 and does not score 0.5 either — it simply
       * does not vote, and we judge the resort on what we actually know. In
       * practice this means almost every resort on earth is scored on altitude
       * and vertical alone, which is the honest answer.
       */
      const parts: Array<{ w: number; v: number }> = [];
      const notes: string[] = [];
      let missing = false;

      if (area.topElevM != null) {
        const v = ramp(area.topElevM, SNOW_ALT_FLOOR_M, SNOW_ALT_CEILING_M);
        parts.push({ w: 0.45, v });
        notes.push(`tops out at ${Math.round(area.topElevM)} m`);
      } else {
        missing = true;
        notes.push('we have no top-station elevation');
      }

      if (area.verticalM != null && area.verticalM > 0) {
        const v = saturating(area.verticalM, 900);
        parts.push({ w: 0.25, v });
        notes.push(`with ${Math.round(area.verticalM)} m of vertical`);
      } else {
        missing = true;
      }

      // Snowmaking only ever votes as positive evidence. A zero is silence.
      const snowmakingKnown = SNOWMAKING_ZERO_IS_ALWAYS_A_DATA_GAP
        ? area.kmTotal > 0 && area.snowmakingKm > 0
        : area.kmTotal > 0;
      if (snowmakingKnown) {
        const coverage = area.snowmakingKm / area.kmTotal;
        parts.push({ w: 0.3, v: clamp01(coverage / SNOWMAKING_FULL_MARKS_SHARE) });
        notes.push(`and has snowmaking mapped on about ${pct(clamp01(coverage))} of its pistes`);
      } else {
        missing = true;
        notes.push(
          'we could not establish how much snowmaking it has — barely any resort in the world has it recorded in our sources, so we left it out of the calculation rather than assume there is none',
        );
      }

      const totalW = parts.reduce((s, p) => s + p.w, 0);
      if (totalW === 0) {
        return {
          raw: NEUTRAL,
          reason: 'We know nothing about this resort’s altitude or snowmaking, so snow reliability neither helped nor hurt its score.',
          dataMissing: true,
        };
      }
      const raw = clamp01(parts.reduce((s, p) => s + p.w * p.v, 0) / totalW);
      return {
        raw,
        reason: `Snow reliability looks like ${verdict(raw)}: it ${notes.join(', ')}.`,
        dataMissing: missing,
      };
    },
  },

  // -------------------------------------------------------------------------
  /*
   * ===========================================================================
   * The two readings of capacityPerKm. READ THIS BEFORE CHANGING EITHER.
   * ===========================================================================
   * Lift capacity per km of piste measures two things at once, with OPPOSITE
   * signs, and both readings are correct:
   *
   *   - Lift queues.    High capacity per km = more uphill throughput for the
   *                     same terrain = shorter waits.  -> liftQueues
   *   - Slope crowding. Capacity per km IS the industry's skier-density metric.
   *                     High density = more people on the piste. Resorts market
   *                     LOW density as uncrowded.       -> slopeQuiet
   *
   * "No lift queues" and "quiet slopes" are genuinely opposed optimisations.
   * Collapsing them into one factor produced a real wrong answer: "uncrowded
   * slopes for a nervous intermediate" returned the busiest region in the
   * Dolomites at #1. Careful wording in the reason string does not fix that,
   * because the RANKING is what misleads.
   *
   * Asking for both is legitimate; the renormalised weights trade them off.
   */
  {
    key: 'liftQueues',
    label: 'Lift queues',
    isActive: (c) => c.wantShortLiftQueues === true,
    evaluate: ({ area }) => {
      // raw = saturating(capacityPerKm, 700 pph/km). More uphill throughput per
      // km of piste means shorter waits at the bottom of the lift.
      const cpk = effectiveCapacityPerKm(area);
      if (cpk == null) {
        return {
          raw: NEUTRAL,
          reason: 'We could not work out this resort’s lift capacity, so queueing neither helped nor hurt its score.',
          dataMissing: true,
        };
      }
      const raw = saturating(cpk, CAPACITY_TARGET_PPH_PER_KM);
      const feel =
        raw >= 0.75
          ? 'plenty of uphill capacity for the amount of piste, so queues are usually short'
          : raw >= 0.5
            ? 'a fair amount of uphill capacity for the amount of piste'
            : 'not much uphill capacity for the amount of piste, so expect to wait at the busy lifts';
      return {
        raw,
        reason: `The lifts can carry roughly ${Math.round(cpk)} people an hour for every kilometre of piste — ${feel}. This is worked out from the lift types and the length of the pistes, not from measured queue times.`,
        dataMissing: false,
      };
    },
  },

  // -------------------------------------------------------------------------
  {
    key: 'slopeQuiet',
    label: 'How busy the slopes feel',
    isActive: (c) => c.wantUncrowded === true,
    evaluate: ({ area }) => {
      /*
       * INVERTED against liftQueues, on purpose.
       *
       *   raw = 1 - ramp(capacityPerKm, 200 -> 1200 pph/km)
       *
       * Lift capacity per piste km is the ski industry's skier-density proxy:
       * the more people the lifts can put onto each kilometre of piste, the
       * more crowded that piste feels. Low density scores high here.
       *
       * This is a MODEL, not a measurement. We have no visitor numbers, no
       * ticket sales and no occupancy data — only lift types, lift counts and
       * piste length. The reason string has to say so, because a skier
       * planning a week deserves to know which of those two things they are
       * being shown.
       */
      const cpk = effectiveCapacityPerKm(area);
      if (cpk == null) {
        return {
          raw: NEUTRAL,
          reason: 'We could not work out this resort’s lift capacity or piste length, so how busy it feels neither helped nor hurt its score.',
          dataMissing: true,
        };
      }
      const raw = clamp01(1 - ramp(cpk, DENSITY_QUIET_PPH_PER_KM, DENSITY_BUSY_PPH_PER_KM));
      const feel =
        raw >= 0.75
          ? 'that is low, so the pistes should feel quiet even in half term'
          : raw >= 0.5
            ? 'that is around average, so expect company on the main runs'
            : 'that is high, so the pistes are likely to feel busy';
      return {
        raw,
        reason: `The lifts can put roughly ${Math.round(cpk)} people an hour onto every kilometre of piste — ${feel}. This is our estimate of how crowded the slopes get, worked out from the lift types and the piste length. It is a model, not a headcount: we have no visitor numbers for any resort.`,
        dataMissing: false,
      };
    },
  },

  // -------------------------------------------------------------------------
  {
    key: 'nightSki',
    label: 'Night skiing',
    isActive: (c) => c.wantNightSki === true,
    evaluate: ({ area }) => {
      if (area.hasNightSki === true) {
        const extent = area.nightSkiKm != null && area.nightSkiKm > 0 ? ` (about ${km(area.nightSkiKm)} of it)` : '';
        return {
          raw: 1,
          reason: `This resort has floodlit pistes${extent}, so you can ski after dark.`,
          dataMissing: false,
        };
      }
      if (area.hasNightSki === false) {
        return {
          raw: 0,
          reason: 'No floodlit pistes are mapped here, so there is no night skiing.',
          dataMissing: false,
        };
      }
      return {
        raw: NEUTRAL,
        reason: 'Nobody has recorded whether these pistes are floodlit, so night skiing neither helped nor hurt this resort’s score. Worth checking with the resort.',
        dataMissing: true,
      };
    },
  },

  // -------------------------------------------------------------------------
  {
    key: 'apresFit',
    label: 'Après-ski and nightlife',
    isActive: (c) => c.wantApres === true,
    evaluate: ({ area, israel, apres }) => {
      // Curated, human-verified apresLevel beats the OSM proxy; the OSM proxy
      // beats nothing. The reason string always names the source it used.
      if (isVerified(israel) && israel.apresLevel != null) {
        const raw = clamp01(israel.apresLevel / 3);
        const words = ['no real nightlife to speak of', 'a quiet bar or two', 'a decent bar scene', 'a full-on party town'];
        return {
          raw,
          reason: `Rated ${words[israel.apresLevel] ?? 'unrated'} from our own verified notes on the resort.`,
          dataMissing: false,
        };
      }
      if (apres != null && Number.isFinite(apres.densityScore)) {
        const raw = clamp01(apres.densityScore);
        return {
          raw,
          reason: `We have not hand-checked the nightlife here, so this is estimated from OpenStreetMap: ${apres.barCount} bars, ${apres.restaurantCount} restaurants and ${apres.nightclubCount} clubs near the base — ${verdict(raw)} for a lively evening.`,
          dataMissing: false,
        };
      }
      return {
        raw: NEUTRAL,
        reason: 'We have neither verified notes nor any mapped bars for this resort, so nightlife neither helped nor hurt its score.',
        dataMissing: true,
      };
    },
  },

  // -------------------------------------------------------------------------
  {
    key: 'familyFit',
    label: 'Good for families',
    isActive: (c) => c.wantFamily === true,
    evaluate: ({ area, israel }) => {
      /*
       * Two halves, averaged when both exist:
       *   terrain  = min(1, (novice share + easy share) / 0.45)
       *   curated  = familyScore / 3, only if the row is verified
       * If only one half exists it carries the whole factor.
       */
      const parts: number[] = [];
      const notes: string[] = [];
      let missing = false;

      if (hasTerrainData(area)) {
        const gentle = shareOfDifficulty(area, 'novice') + shareOfDifficulty(area, 'easy');
        const gentleKm = kmOfDifficulty(area, 'novice') + kmOfDifficulty(area, 'easy');
        parts.push(clamp01(gentle / FAMILY_TERRAIN_TARGET_SHARE));
        notes.push(`${pct(clamp01(gentle))} of the pistes are gentle green or blue runs (about ${km(gentleKm)})`);
      } else {
        missing = true;
        notes.push('we have no run-difficulty breakdown');
      }

      if (isVerified(israel) && israel.familyScore != null) {
        parts.push(clamp01(israel.familyScore / 3));
        const words = ['not set up for children', 'workable with children', 'good with children', 'excellent with children'];
        notes.push(`and our verified notes rate it ${words[israel.familyScore] ?? 'unrated'}`);
      } else {
        missing = true;
        notes.push('and we have not yet hand-checked its childcare and ski-school setup');
      }

      if (parts.length === 0) {
        return {
          raw: NEUTRAL,
          reason: 'We know too little about this resort to judge it for families, so it neither gained nor lost points here.',
          dataMissing: true,
        };
      }
      const raw = clamp01(parts.reduce((s, v) => s + v, 0) / parts.length);
      return {
        raw,
        reason: `For a family this is ${verdict(raw)}: ${notes.join(', ')}.`,
        dataMissing: missing,
      };
    },
  },

  // -------------------------------------------------------------------------
  {
    key: 'verticalFit',
    label: 'Vertical drop',
    isActive: (c) => c.minVerticalM != null,
    evaluate: ({ area, criteria }) => {
      // raw = saturating(verticalM, target), target = stated minimum or 800 m.
      if (area.verticalM == null || !(area.verticalM > 0)) {
        return {
          raw: NEUTRAL,
          reason: 'We have no vertical-drop figure for this resort, so it neither helped nor hurt its score.',
          dataMissing: true,
        };
      }
      const target = criteria.minVerticalM != null && criteria.minVerticalM > 0 ? criteria.minVerticalM : DEFAULT_VERTICAL_TARGET_M;
      const raw = saturating(area.verticalM, target);
      const tail =
        criteria.minVerticalM != null
          ? area.verticalM >= criteria.minVerticalM
            ? `, above the ${Math.round(criteria.minVerticalM)} m you asked for`
            : `, short of the ${Math.round(criteria.minVerticalM)} m you asked for`
          : area.verticalM >= 1000
            ? ' — long top-to-bottom descents'
            : ' — fairly short runs';
      return {
        raw,
        reason: `${Math.round(area.verticalM)} m of vertical drop${tail}.`,
        dataMissing: false,
      };
    },
  },

  // -------------------------------------------------------------------------
  {
    key: 'altitudeFit',
    label: 'Altitude',
    isActive: (c) => c.minTopElevM != null,
    evaluate: ({ area, criteria }) => {
      // raw = ramp(topElevM, 800 m -> 3500 m). Deliberately linear and
      // monotonic so "highest altitude" queries order by height, plainly.
      if (area.topElevM == null) {
        return {
          raw: NEUTRAL,
          reason: 'We have no top-station elevation for this resort, so altitude neither helped nor hurt its score.',
          dataMissing: true,
        };
      }
      const raw = ramp(area.topElevM, ALT_FLOOR_M, ALT_CEILING_M);
      const tail =
        criteria.minTopElevM != null
          ? area.topElevM >= criteria.minTopElevM
            ? `, above the ${Math.round(criteria.minTopElevM)} m you wanted`
            : `, below the ${Math.round(criteria.minTopElevM)} m you wanted`
          : '';
      return {
        raw,
        reason: `The highest lift reaches ${Math.round(area.topElevM)} m${tail}.`,
        dataMissing: false,
      };
    },
  },

  // -------------------------------------------------------------------------
  {
    key: 'transferTime',
    label: 'Transfer from the airport',
    isActive: (c) => c.maxTransferMinutes != null || c.originAirport != null,
    evaluate: ({ criteria, transfer }) => {
      // raw = 1 - (driveMinutes - 30) / (240 - 30), clamped.
      if (transfer == null) {
        return {
          raw: NEUTRAL,
          reason: 'We have no measured drive time from an airport to this resort, so the transfer neither helped nor hurt its score.',
          dataMissing: true,
        };
      }
      const raw = clamp01(1 - (transfer.driveMinutes - TRANSFER_BEST_MIN) / (TRANSFER_WORST_MIN - TRANSFER_BEST_MIN));
      const hrs = Math.floor(transfer.driveMinutes / 60);
      const mins = transfer.driveMinutes % 60;
      const pretty = hrs > 0 ? `${hrs}h${mins > 0 ? ` ${mins}m` : ''}` : `${mins} minutes`;
      const tail =
        criteria.maxTransferMinutes != null
          ? transfer.driveMinutes <= criteria.maxTransferMinutes
            ? ', inside the limit you set'
            : ', longer than the limit you set'
          : '';
      return {
        raw,
        reason: `About ${pretty} by road from ${transfer.airportIata}${tail}.`,
        dataMissing: false,
      };
    },
  },

  // -------------------------------------------------------------------------
  {
    key: 'israelFit',
    label: 'Kosher, Hebrew and Chabad',
    isActive: (c) => c.wantKosher === true || c.wantHebrewSkiSchool === true || c.maxChabadDistanceKm != null,
    evaluate: ({ criteria, israel }) => {
      /*
       * HARD RULE. This factor only reads a curated row when a human has set
       * verification to 'verified'. Unverified rows exist, but they never move
       * a resort up or down and are never stated as fact. The cost of being
       * wrong here is somebody's Shabbat, not a bad afternoon.
       */
      if (!isVerified(israel)) {
        const why = israel == null ? 'We have not researched' : 'We have notes but have not yet verified';
        return {
          raw: NEUTRAL,
          reason: `${why} the kosher food, Hebrew-speaking ski school and Chabad options for this resort, so none of that counted for or against it. We will not guess.`,
          dataMissing: true,
        };
      }

      const parts: number[] = [];
      const notes: string[] = [];
      let missing = false;

      if (criteria.wantKosher === true) {
        if (israel.kosherAvailability != null) {
          parts.push(clamp01(israel.kosherAvailability / 3));
          const words = ['no kosher food we could find', 'limited kosher food', 'good kosher options', 'extensive kosher options'];
          notes.push(words[israel.kosherAvailability] ?? 'kosher availability unrated');
        } else {
          missing = true;
          notes.push('kosher food has not been researched here');
        }
      }

      if (criteria.wantHebrewSkiSchool === true) {
        if (israel.hebrewSkiSchool != null) {
          parts.push(israel.hebrewSkiSchool ? 1 : 0);
          notes.push(israel.hebrewSkiSchool ? 'Hebrew-speaking ski instruction is available' : 'no Hebrew-speaking ski instruction');
        } else {
          missing = true;
          notes.push('we do not know whether ski lessons are available in Hebrew');
        }
      }

      if (criteria.maxChabadDistanceKm != null) {
        if (israel.chabadDistanceKm != null) {
          // Inside the requested radius scores 0.5..1.0 (closer is better);
          // outside it decays towards 0.
          const ratio = israel.chabadDistanceKm / Math.max(criteria.maxChabadDistanceKm, 1);
          parts.push(ratio <= 1 ? clamp01(0.5 + 0.5 * (1 - ratio)) : clamp01(0.5 / ratio));
          const named = israel.chabadName ? ` (${israel.chabadName})` : '';
          notes.push(`the nearest Chabad house${named} is about ${Math.round(israel.chabadDistanceKm)} km away`);
        } else {
          missing = true;
          notes.push('we have not located the nearest Chabad house');
        }
      }

      if (parts.length === 0) {
        return {
          raw: NEUTRAL,
          reason: `Our verified notes for this resort do not cover what you asked about (${notes.join('; ') || 'no detail recorded'}), so it neither gained nor lost points here.`,
          dataMissing: true,
        };
      }
      const raw = clamp01(parts.reduce((s, v) => s + v, 0) / parts.length);
      return {
        raw,
        reason: `From our verified notes: ${notes.join('; ')} — ${verdict(raw)} for what you asked for.`,
        dataMissing: missing,
      };
    },
  },

  // -------------------------------------------------------------------------
  {
    key: 'passPrice',
    label: 'Lift pass price',
    isActive: (c) => c.maxPassPricePerDay != null,
    evaluate: ({ criteria, price }) => {
      /*
       * With a stated budget: at or under budget scores 0.6..1.0 (cheaper is
       * better within it); over budget decays as budget/price.
       * Without a budget: linear ramp, EUR 20/day = 1.0, EUR 90/day = 0.
       */
      if (price == null) {
        return {
          raw: NEUTRAL,
          reason: 'We do not hold a lift-pass price for this resort, so price neither helped nor hurt its score. Check the resort site before you book.',
          dataMissing: true,
        };
      }
      const budget = criteria.maxPassPricePerDay;
      if (budget != null && budget > 0) {
        const ratio = price.price / budget;
        const raw = ratio <= 1 ? clamp01(0.6 + 0.4 * (1 - ratio)) : clamp01(1 / ratio) * 0.6;
        const tail = ratio <= 1 ? `, within your ${money({ ...price, price: budget })} a day budget` : `, over your ${money({ ...price, price: budget })} a day budget`;
        return {
          raw,
          reason: `A lift pass works out at about ${money(price)} a day (${price.basis})${tail}.`,
          dataMissing: false,
        };
      }
      const raw = clamp01(1 - (price.price - PRICE_BEST_EUR) / (PRICE_WORST_EUR - PRICE_BEST_EUR));
      return {
        raw,
        reason: `A lift pass works out at about ${money(price)} a day (${price.basis}) — ${raw >= 0.6 ? 'cheap by European standards' : raw >= 0.35 ? 'about average for Europe' : 'expensive'}.`,
        dataMissing: false,
      };
    },
  },

  // -------------------------------------------------------------------------
  /*
   * ===========================================================================
   * seasonFit — the factor that refuses to answer.
   * ===========================================================================
   * A trip window is the single most obvious thing to rank on: show me the
   * resorts that are OPEN on my dates. We are not going to do it, because we
   * cannot. `season_dates` exists in the schema and is empty; no ETL stage
   * fills it; there is no free, licensable, per-resort feed of opening and
   * closing dates for 3,729 European ski areas.
   *
   * Everything available to us instead is a proxy. Altitude correlates with a
   * long season. So does latitude, and glacier terrain, and a north-facing
   * aspect. Every one of those would produce a plausible-looking date-aware
   * ranking, and every one of them would be an invention: the user asked
   * "is it open on 14 February" and would be shown an answer to "is it high".
   * A skier who books flights on that has been actively misled, and the number
   * would look exactly as confident as a real one. That is the failure this
   * codebase exists to refuse — see README rule 1 and rule 3.
   *
   * So the factor is INERT. It is reported, with its label and a sentence
   * explaining itself, at weight ZERO — so the score is bit-for-bit what it
   * would have been had no dates been supplied, not merely close. The golden
   * suite asserts that byte-identity directly, which is what will catch a
   * future change that quietly starts weighting dates.
   *
   * It is not dead code. The moment `ScoringContext.seasons` carries a
   * verified row this factor scores the real overlap between the trip and the
   * open season, at the real weight, with no other edit needed anywhere.
   */
  {
    key: 'seasonFit',
    label: 'Open on your dates',
    isActive: (c) => c.dateFrom != null || c.dateTo != null,
    evaluate: ({ criteria, season }) => {
      const tripFrom = parseIsoDay(criteria.dateFrom);
      const tripTo = parseIsoDay(criteria.dateTo) ?? tripFrom;

      const unknown: FactorOutcome = {
        raw: NEUTRAL,
        reason:
          'We do not know when this resort opens and closes for the season — nobody has published those dates into our sources — so your travel dates neither helped nor hurt its score. Check the resort’s own site before you book flights.',
        dataMissing: true,
        inert: true,
      };
      if (season == null || tripFrom == null || tripTo == null) return unknown;

      // Rule 3: a hand-typed season that nobody has checked cannot rank. Being
      // told a resort is open when it shut a fortnight ago is a wasted flight.
      if (season.provenance.verification !== 'verified') {
        return {
          raw: NEUTRAL,
          reason:
            'We hold opening dates for this resort but nobody has checked them against the operator, so they neither helped nor hurt its score. We will not rank on an unverified date.',
          dataMissing: true,
          inert: true,
        };
      }

      const opens = parseIsoDay(season.opensOn);
      const closes = parseIsoDay(season.closesOn);
      if (opens == null && closes == null) return unknown;

      // A missing end of the range is unbounded on that side, never "closed".
      const overlapStart = Math.max(tripFrom, opens ?? tripFrom);
      const overlapEnd = Math.min(tripTo, closes ?? tripTo);
      const tripMs = Math.max(tripTo - tripFrom, MS_PER_DAY);
      const raw = clamp01((overlapEnd - overlapStart) / tripMs);
      const partial = opens == null || closes == null;

      const window =
        opens != null && closes != null
          ? `open from ${season.opensOn} to ${season.closesOn}`
          : opens != null
            ? `opens on ${season.opensOn}, with no closing date published`
            : `closes on ${season.closesOn}, with no opening date published`;
      const verdictText =
        raw >= 0.999
          ? 'which covers your whole trip'
          : raw <= 0
            ? 'which does not overlap your trip at all'
            : `which covers about ${pct(raw)} of your trip`;
      return {
        raw,
        reason: `For the ${season.season} season this resort is ${window} — ${verdictText}. Opening dates move with the snow; confirm with the resort before you book.`,
        dataMissing: partial,
      };
    },
  },
];

// ---------------------------------------------------------------------------
// Hard filters
// ---------------------------------------------------------------------------

export type HardFilterKey =
  | 'status'
  | 'significance'
  | 'countries'
  | 'minKm'
  | 'maxKm'
  | 'minVerticalM'
  | 'minTopElevM'
  | 'maxTransferMinutes'
  | 'maxPassPricePerDay'
  | 'maxChabadDistanceKm';

/**
 * The order in which filters are given up when a search comes back too thin.
 * Least important first. `status` and `significance` are absent on purpose:
 * a closed resort or a single drag lift behind a village is never a useful
 * answer, however empty the result list gets.
 */
export const RELAXATION_ORDER: readonly HardFilterKey[] = [
  'maxChabadDistanceKm',
  'maxPassPricePerDay',
  'maxTransferMinutes',
  'maxKm',
  'minVerticalM',
  'minTopElevM',
  'minKm',
  'countries',
];

/** Human wording for the filters, used when we tell the user what we relaxed. */
export const FILTER_LABELS: Readonly<Record<HardFilterKey, string>> = {
  status: 'only resorts currently operating',
  significance: 'only resorts big enough to be worth a trip',
  countries: 'the countries you chose',
  minKm: 'the minimum size you asked for',
  maxKm: 'the maximum size you asked for',
  minVerticalM: 'the minimum vertical drop you asked for',
  minTopElevM: 'the minimum altitude you asked for',
  maxTransferMinutes: 'the maximum transfer time you asked for',
  maxPassPricePerDay: 'your lift-pass budget',
  maxChabadDistanceKm: 'the maximum distance to a Chabad house',
};

/**
 * Which hard filters this area fails.
 *
 * Absence of evidence is never a failure: an area with no known pass price is
 * not excluded by a budget, and an area with no known transfer is not excluded
 * by a transfer limit. Only a value we actually hold can disqualify a resort.
 */
export function failedHardFilters(area: SkiArea, criteria: SearchCriteria, ctx: ScoringContext): HardFilterKey[] {
  const failed: HardFilterKey[] = [];

  if (area.status !== 'operating') failed.push('status');
  if (area.isSignificant === false) failed.push('significance');

  if (criteria.countries && criteria.countries.length > 0) {
    const wanted = new Set(criteria.countries.map((c) => c.toUpperCase()));
    // Match on ANY country the area touches, not just the display primary.
    // Border resorts belong to both sides: Drei Zinnen straddles the
    // Italian/Austrian border, so someone flying into Innsbruck and filtering
    // on Austria must still find it. `countries` is primary-first and always
    // contains `country`; we fall back to `country` alone for older artifacts
    // built before that field existed.
    const held = area.countries?.length ? area.countries : area.country ? [area.country] : [];
    // A null country cannot be shown to match, so it is excluded — but this is
    // the one place absence loses, and it only bites when the user named
    // countries explicitly.
    if (!held.some((c) => wanted.has(c.toUpperCase()))) failed.push('countries');
  }

  if (criteria.minKm != null && area.kmTotal > 0 && area.kmTotal < criteria.minKm) failed.push('minKm');
  if (criteria.maxKm != null && area.kmTotal > 0 && area.kmTotal > criteria.maxKm) failed.push('maxKm');
  if (criteria.minVerticalM != null && area.verticalM != null && area.verticalM < criteria.minVerticalM) {
    failed.push('minVerticalM');
  }
  if (criteria.minTopElevM != null && area.topElevM != null && area.topElevM < criteria.minTopElevM) {
    failed.push('minTopElevM');
  }

  if (criteria.maxTransferMinutes != null) {
    const t = bestTransfer(area, criteria, ctx);
    if (t != null && t.driveMinutes > criteria.maxTransferMinutes) failed.push('maxTransferMinutes');
  }

  if (criteria.maxPassPricePerDay != null) {
    const p = dailyPassPrice(area, criteria, ctx);
    if (p != null && p.price > criteria.maxPassPricePerDay) failed.push('maxPassPricePerDay');
  }

  if (criteria.maxChabadDistanceKm != null) {
    const profile = israelProfileFor(area, ctx);
    // Unverified curated data cannot exclude anybody either.
    if (isVerified(profile) && profile.chabadDistanceKm != null && profile.chabadDistanceKm > criteria.maxChabadDistanceKm) {
      failed.push('maxChabadDistanceKm');
    }
  }

  return failed;
}

/**
 * "Soft misses": things the user explicitly asked for that this resort is
 * *documented* not to have. Not hard filters — the resort still appears and
 * still carries a full explained score — but it is ranked below every resort
 * that does not miss, because no amount of good snow makes up for the thing
 * you actually came for being absent.
 *
 * Only definite negatives count. Unknown never demotes.
 */
export function softMisses(area: SkiArea, criteria: SearchCriteria, ctx: ScoringContext): string[] {
  const misses: string[] = [];
  if (criteria.wantNightSki === true && area.hasNightSki === false) misses.push('wantNightSki');
  const profile = israelProfileFor(area, ctx);
  if (isVerified(profile)) {
    if (criteria.wantKosher === true && profile.kosherAvailability === 0) misses.push('wantKosher');
    if (criteria.wantHebrewSkiSchool === true && profile.hebrewSkiSchool === false) misses.push('wantHebrewSkiSchool');
  }
  return misses;
}

// ---------------------------------------------------------------------------
// scoreArea
// ---------------------------------------------------------------------------

/**
 * Score one area against one query.
 *
 * 1. Collect the factors that apply. A factor applies when the query engages
 *    it (`active` weight) or when it has a non-zero `base` weight.
 * 2. Renormalise those weights to sum to exactly 100.
 * 3. contribution = raw * normalisedWeight; score = SUM(contributions).
 *
 * Because of step 2, `score` is always 0..100 and the factor contributions
 * always add up to it. Nothing is hidden.
 */
export function scoreArea(area: SkiArea, criteria: SearchCriteria, ctx: ScoringContext = {}): ScoredResult {
  const israel = israelProfileFor(area, ctx);
  const apres = apresProxyFor(area, ctx);
  const transfer = bestTransfer(area, criteria, ctx);
  const price = dailyPassPrice(area, criteria, ctx);
  const season = ctx.seasons?.get(area.id) ?? null;
  const input: FactorInput = { area, criteria, israel, apres, transfer, price, season };

  const applied: Array<{ def: FactorDef; weight: number; outcome: FactorOutcome }> = [];
  let totalWeight = 0;
  for (const def of FACTORS) {
    const override = ctx.weights?.[def.key];
    const defaults = DEFAULT_WEIGHTS[def.key];
    const w: FactorWeight = {
      base: override?.base ?? defaults.base,
      active: override?.active ?? defaults.active,
    };
    const nominal = def.isActive(criteria) ? w.active : w.base;
    if (!(nominal > 0)) continue;
    const outcome = def.evaluate(input);
    // An INERT factor is still reported — the user asked about something and
    // deserves to be told why it changed nothing — but at weight 0, so it
    // leaves the renormalisation denominator and therefore every other
    // factor's contribution bit-for-bit unchanged. See FactorOutcome.inert.
    const weight = outcome.inert === true ? 0 : nominal;
    applied.push({ def, weight, outcome });
    totalWeight += weight;
  }

  const factors: ScoreFactor[] = [];
  let score = 0;
  for (const { def, weight, outcome } of applied) {
    const normalised = totalWeight > 0 ? roundTo((weight / totalWeight) * 100, 6) : 0;
    const contribution = roundTo(clamp01(outcome.raw) * normalised, 6);
    score += contribution;
    factors.push({
      key: def.key,
      label: def.label,
      raw: roundTo(clamp01(outcome.raw), 6),
      weight: normalised,
      contribution,
      reason: outcome.reason,
      dataMissing: outcome.dataMissing,
    });
  }

  // Sort factors by what actually moved this result, so the UI's first line is
  // the strongest reason rather than an arbitrary one.
  factors.sort((a, b) => b.contribution - a.contribution || a.key.localeCompare(b.key));

  const hard = failedHardFilters(area, criteria, ctx);
  const soft = softMisses(area, criteria, ctx);

  return {
    area,
    score: roundTo(Math.min(100, Math.max(0, score)), 4),
    factors,
    failedFilters: [...hard, ...soft],
    // A name match never changes the score — it changes the ORDER. The factor
    // breakdown stays exactly what it would have been, so a pinned result is
    // still explained rather than being an opaque lookup.
    nameMatch: matchAreaName(area, criteria.rawQuery),
    israel,
    apres,
    transfer,
  };
}

// ---------------------------------------------------------------------------
// search
// ---------------------------------------------------------------------------

/**
 * Compare two scored results. THE definition of result order.
 *
 *   1. named resorts first          — you typed "Val Gardena", you get it
 *   2. longer name match first      — "Selva di Val Gardena" beats "Selva"
 *   3. fewer soft misses first      — asked for night skiing, documented "no"
 *   4. higher score first
 *   5. larger area, then id         — makes the order total and reproducible
 *
 * Keys 1 and 3 are tiers, not score adjustments: nothing here alters `score`,
 * so the factor contributions still add up to it exactly. The trailing id
 * comparison means the same input always produces the same output.
 */
export function compareResults(a: ScoredResult, b: ScoredResult): number {
  const aPinned = a.nameMatch ? 1 : 0;
  const bPinned = b.nameMatch ? 1 : 0;
  if (aPinned !== bPinned) return bPinned - aPinned;
  if (aPinned === 1) {
    const strength = nameMatchStrength(b.nameMatch) - nameMatchStrength(a.nameMatch);
    if (strength !== 0) return strength;
  }
  const aSoft = a.failedFilters.filter((f) => f.startsWith('want')).length;
  const bSoft = b.failedFilters.filter((f) => f.startsWith('want')).length;
  if (aSoft !== bSoft) return aSoft - bSoft;
  if (b.score !== a.score) return b.score - a.score;
  if (b.area.kmTotal !== a.area.kmTotal) return b.area.kmTotal - a.area.kmTotal;
  return a.area.id.localeCompare(b.area.id);
}

/**
 * Filter, score, order.
 *
 * Hard filters run first and are unaffected by name matching — typing a resort
 * name pins it, it does not smuggle it past a country filter or resurrect a
 * closed resort. See `compareResults` for the ordering.
 */
export function search(areas: readonly SkiArea[], criteria: SearchCriteria, ctx: ScoringContext = {}): SearchResponse {
  const evaluated = areas.map((area) => ({
    area,
    hard: failedHardFilters(area, criteria, ctx),
    soft: softMisses(area, criteria, ctx),
  }));

  // Only filters the user actually engaged can be relaxed.
  const engaged = new Set<HardFilterKey>();
  for (const e of evaluated) for (const f of e.hard) engaged.add(f);
  const relaxable = RELAXATION_ORDER.filter((f) => engaged.has(f));

  const active = new Set<HardFilterKey>(engaged);
  const relaxed: HardFilterKey[] = [];
  let pool = evaluated.filter((e) => e.hard.every((f) => !active.has(f)));

  let i = 0;
  while (pool.length < MIN_RESULTS_BEFORE_RELAXING && i < relaxable.length) {
    const drop = relaxable[i]!;
    i += 1;
    active.delete(drop);
    relaxed.push(drop);
    pool = evaluated.filter((e) => e.hard.every((f) => !active.has(f)));
  }

  const scored = pool.map((e) => scoreArea(e.area, criteria, ctx));
  scored.sort(compareResults);

  const limit = criteria.limit != null && criteria.limit > 0 ? criteria.limit : DEFAULT_LIMIT;
  const response: SearchResponse = {
    criteria,
    results: scored.slice(0, limit),
    totalConsidered: pool.length,
  };
  if (relaxed.length > 0) response.relaxedFilters = relaxed;
  if (ctx.parsedBy) response.parsedBy = ctx.parsedBy;
  return response;
}

/** Sentence explaining a relaxation, for the UI banner. */
export function explainRelaxation(relaxedFilters: readonly string[]): string {
  if (relaxedFilters.length === 0) return '';
  const parts = relaxedFilters.map((f) => FILTER_LABELS[f as HardFilterKey] ?? f);
  return `Too few resorts matched everything you asked for, so we set aside ${parts.join(', then ')} to show you the closest alternatives.`;
}
