/**
 * @searchski/core — the domain model plus the deterministic scoring engine.
 *
 * The ranking is deterministic and explainable. An LLM never ranks: Stage 3
 * uses Claude to turn free text into `SearchCriteria` and to write prose about
 * a result, and `search()` below decides the order, every time, the same way.
 */

// --- the contract ----------------------------------------------------------
export * from './types.js';

// --- the engine ------------------------------------------------------------
export {
  DEFAULT_WEIGHTS,
  DEFAULT_LIMIT,
  MIN_RESULTS_BEFORE_RELAXING,
  RELAXATION_ORDER,
  FILTER_LABELS,
  MIN_NAME_MATCH_CHARS,
  scoreArea,
  search,
  compareResults,
  matchAreaName,
  normaliseForMatch,
  failedHardFilters,
  softMisses,
  explainRelaxation,
  bestTransfer,
  dailyPassPrice,
  effectiveCapacityPerKm,
  kmOfDifficulty,
  shareOfDifficulty,
  type DailyPassPrice,
  type FactorKey,
  type FactorWeight,
  type HardFilterKey,
  type ScoringContext,
} from './scoring.js';

// --- the deterministic parser (Stage-3 LLM fallback) -----------------------
export {
  parseQueryDeterministic,
  describeCriteria,
  isNorthernSkiSeason,
  BIG_AREA_MIN_KM,
  CHEAP_PASS_EUR_PER_DAY,
  DEFAULT_CHABAD_RADIUS_KM,
  GLACIER_TOP_M,
  HIGH_ALTITUDE_TOP_M,
  BARE_AMOUNT_PER_DAY_CEILING,
  ASSUMED_TRIP_DAYS,
  DEFAULT_TRIP_NIGHTS,
  LONG_WEEKEND_NIGHTS,
  WEEKEND_NIGHTS,
  MAX_TRIP_NIGHTS,
  type DateWindow,
  type ParseOptions,
} from './criteria.js';

// --- fixtures / data loading (does I/O; not imported by the scorer) --------
export { loadAreas, syntheticContext, SYNTHETIC_AREAS, SYNTHETIC_NOTE, BUILD_DIR, REPO_ROOT, type LoadedData } from './fixtures.js';

// --- the golden query set --------------------------------------------------
export {
  GOLDEN_QUERIES,
  GLOBAL_INVARIANTS,
  STANDALONE_CHECKS,
  // The pinned clock, so any other harness resolves "February" the same way
  // this one does rather than against whatever day it happens to run on.
  GOLDEN_TODAY,
  parseGolden,
  type AssertionContext,
  type GoldenAssertion,
  type GoldenQuery,
  type StandaloneCheck,
} from './golden-queries.js';
