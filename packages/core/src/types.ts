/**
 * Searchski domain model.
 *
 * This file is the contract between the ETL, the scoring engine, and the web
 * app. Changing a type here is a breaking change for all three — do it
 * deliberately.
 *
 * Provenance rule: every field that came from outside carries where it came
 * from. Fields we derived ourselves are marked `derived`. Fields a human typed
 * are marked `curated` and carry a verification status. Nothing is ever
 * silently invented.
 */

// ---------------------------------------------------------------------------
// Provenance
// ---------------------------------------------------------------------------

export type SourceKind =
  | 'openskimap' // bulk GeoJSON, ODbL
  | 'openstreetmap' // Overpass, ODbL
  | 'wikidata' // SPARQL, CC0
  | 'derived' // computed by us from the above
  | 'curated' // typed by a human, must carry VerificationStatus
  | 'official'; // resort's own site (facts only)

/**
 * Curated data is untrustworthy until a human confirms it against a primary
 * source. `unverified` rows are stored but MUST NOT be shown as fact in the UI.
 */
export type VerificationStatus = 'verified' | 'unverified' | 'stale';

export interface Provenance {
  source: SourceKind;
  sourceUrl?: string | null;
  fetchedAt: string; // ISO 8601
  verification?: VerificationStatus;
  note?: string | null;
}

// ---------------------------------------------------------------------------
// Ski terrain
// ---------------------------------------------------------------------------

/** Difficulty buckets exactly as OpenSkiMap emits them. `other` = untagged. */
export const DIFFICULTIES = [
  'novice',
  'easy',
  'intermediate',
  'advanced',
  'expert',
  'freeride',
  'other',
] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export interface DifficultyBucket {
  count: number;
  km: number;
  minElevM: number | null;
  maxElevM: number | null;
  /** Sum of all downhill elevation change across runs in this bucket. */
  elevationChangeM: number | null;
  snowmakingKm: number;
}

export interface LiftTypeBucket {
  count: number;
  km: number;
  minElevM: number | null;
  maxElevM: number | null;
}

/**
 * Modeled hourly uphill capacity per lift type, persons/hour.
 *
 * OSM almost never tags real capacity, so we model it from lift type using
 * conservative industry-typical values. This is an ESTIMATE and is only ever
 * used as a *relative* crowding signal between resorts, never displayed as a
 * hard number.
 */
export const LIFT_CAPACITY_PPH: Record<string, number> = {
  gondola: 2400,
  cable_car: 1600,
  chair_lift: 2200,
  mixed_lift: 2000,
  funicular: 1800,
  platter: 800,
  drag_lift: 850,
  rope_tow: 600,
  magic_carpet: 700,
  zip_line: 0,
  // OpenSkiMap emits HYPHENATED keys for these two. The underscore spellings
  // are kept as aliases because OSM itself uses `aerialway=t-bar` while some
  // downstream tools normalise to underscores — the Stage 0 QA report caught
  // 23 lifts silently falling through to `unknown` because only the underscore
  // form was listed here.
  't-bar': 900,
  't_bar': 900,
  'j-bar': 800,
  'j_bar': 800,
  unknown: 800,
};

// ---------------------------------------------------------------------------
// The spine
// ---------------------------------------------------------------------------

export type OperatingStatus = 'operating' | 'disused' | 'abandoned' | 'proposed' | 'unknown';

export interface SkiArea {
  /** OpenSkiMap id. THE primary key. Stable, always present. */
  id: string;
  /** Cleaned primary display name (multilingual blobs split into aliases). */
  name: string;
  /** Every other name form seen, incl. non-Latin scripts. Drives search. */
  aliases: string[];
  /**
   * PRIMARY ISO 3166-1 alpha-2, for display. Null only if upstream had no
   * place at all. For a border resort this is one of several — see `countries`.
   */
  country: string | null;
  /**
   * EVERY distinct country the area touches, primary first. Usually length 1.
   *
   * Border resorts genuinely belong to both sides: Drei Zinnen straddles the
   * Italian/Austrian border, and La Thuile is lift-linked to La Rosière in
   * France. Collapsing those to a single country is lossy, and it means a
   * skier flying into Innsbruck cannot find Drei Zinnen under Austria.
   * Country filters should match on ANY entry here; display uses `country`.
   */
  countries: string[];
  /** ISO 3166-2 subdivision, e.g. "IT-32". */
  regionCode: string | null;
  regionName: string | null;
  /** Localities the area touches — the candidate villages to sleep in. */
  localities: string[];

  lat: number;
  lon: number;

  status: OperatingStatus;
  websites: string[];
  /** Present on only ~7% of areas. Enrichment only — never a join requirement. */
  wikidataId: string | null;

  /**
   * Set when upstream merged two separately-marketed resorts into this one
   * record, so `kmTotal` describes something larger than `name` implies.
   * Example: OpenSkiMap's "Alta Badia" record also contains all of Val Gardena.
   *
   * When this is non-null the UI MUST show it anywhere the km total appears.
   * We deliberately do NOT split the geometry or apportion the km — we have no
   * faithful basis for that, and a guessed piste figure is exactly the
   * fabrication this project refuses to ship. Seeded from
   * data/seed/area_overrides.json.
   */
  boundaryNote?: string | null;

  // --- derived terrain metrics ---
  baseElevM: number | null;
  topElevM: number | null;
  verticalM: number | null;

  runsTotal: number;
  kmTotal: number;
  runsByDifficulty: Partial<Record<Difficulty, DifficultyBucket>>;

  liftsTotal: number;
  liftsKmTotal: number;
  liftsByType: Record<string, LiftTypeBucket>;

  snowmakingKm: number;
  /** null = unknown (no OSM `lit` data), not "no night skiing". */
  hasNightSki: boolean | null;
  nightSkiKm: number | null;

  /** Modeled, relative-only. See LIFT_CAPACITY_PPH. */
  uphillCapacityPph: number;
  /** capacity per piste km. Higher = more lift throughput per km = less queueing. */
  capacityPerKm: number | null;

  /**
   * Share of terrain by ability, 0..1, used by the scorer.
   * Computed over downhill km only, excluding `other`.
   */
  terrainMix: Partial<Record<Difficulty, number>>;

  /** Passes the size threshold to appear in search. See etl/significance.ts. */
  isSignificant: boolean;

  /** Which pass_region this belongs to, if hand-mapped. */
  passRegionId: string | null;

  provenance: Provenance;
}

/**
 * A commercially-sold lift pass area. Hand-mapped: Dolomiti Superski is one of
 * these covering ~12 SkiAreas. Most SkiAreas belong to none.
 */
export interface PassRegion {
  id: string;
  name: string;
  country: string;
  /** Marketed total, as the operator states it — often larger than our sum. */
  marketedKm: number | null;
  officialUrl: string | null;
  memberAreaIds: string[];
  provenance: Provenance;
}

export interface PassPrice {
  passRegionId: string | null;
  skiAreaId: string | null;
  season: string; // "2026/27"
  category: 'adult' | 'youth' | 'child' | 'senior';
  duration: '1day' | '3day' | '6day' | 'season';
  price: number;
  currency: string;
  isDynamic: boolean;
  provenance: Provenance;
}

/**
 * When one resort opens and closes for one season. Mirrors `season_dates` in
 * db/migrations/0001_init.sql.
 *
 * ===========================================================================
 * WE HOLD NONE OF THESE. The table exists and is EMPTY.
 * ===========================================================================
 * Nothing in the ETL produces this row today, so `ScoringContext.seasons` is
 * always absent in practice and the `seasonFit` factor that reads it is inert:
 * it reports itself at zero weight and says out loud that we do not know when
 * the resort opens. See the note on `seasonFit` in scoring.ts.
 *
 * The type is here so the factor is wired for real data rather than rewritten
 * for it. Both dates are nullable because a source often publishes an opening
 * date months before it will commit to a closing one — `null` is "not stated",
 * never "does not open", exactly as rule 1 requires.
 */
export interface SeasonDates {
  skiAreaId: string;
  season: string; // "2026/27"
  /** ISO YYYY-MM-DD, or null when the source did not state it. */
  opensOn: string | null;
  closesOn: string | null;
  provenance: Provenance;
}

// ---------------------------------------------------------------------------
// Travel
// ---------------------------------------------------------------------------

export interface Airport {
  iata: string;
  name: string;
  country: string;
  lat: number;
  lon: number;
  /** Reachable on a direct flight from TLV (informational; verify seasonally). */
  directFromTLV: boolean;
}

export interface AirportTransfer {
  airportIata: string;
  skiAreaId: string;
  driveMinutes: number;
  distanceKm: number;
  provenance: Provenance;
}

// ---------------------------------------------------------------------------
// The Israel layer — DORMANT. Retained, not surfaced, not scored.
// ---------------------------------------------------------------------------

/**
 * Israel-specific resort attributes.
 *
 * ===========================================================================
 * DORMANT — retained, not surfaced, not scored.
 * ===========================================================================
 * Searchski was originally scoped to Israeli skiers. It is now a universal
 * product, so the Israel-specific concepts on this row — `kosherAvailability`,
 * `kosherNotes`, `chabadDistanceKm`, `chabadName`, `hebrewSkiSchool`,
 * `hebrewSkiSchoolNotes`, `shabbatNotes`, `israeliGatewayAirports` — no longer
 * drive ANY scoring factor and are no longer a first-class product concept.
 * The `israelFit` factor that read them has been deleted, along with the
 * `maxChabadDistanceKm` hard filter and the kosher/Hebrew soft misses.
 *
 * The type is deliberately NOT deleted. The curated research in
 * `data/seed/israel_layer_research.json` maps onto it field for field, that is
 * real hand-verified work, and the niche may be re-enabled as an opt-in layer
 * later. Deleting the shape would throw the data away; leaving it inert costs
 * nothing.
 *
 * Two fields on this row are NOT Israel-specific and are still read by the
 * scorer: `apresLevel` and `familyScore` are ordinary curated resort ratings
 * that happen to live here for historical reasons. `apresFit` and `familyFit`
 * prefer them over the OSM proxy when — and only when — the row is verified.
 * If the Israel layer is ever split out, those two should move with the
 * general-purpose curation, not with the kosher fields.
 *
 * HARD RULE, unchanged for whatever is still read: no field here may ever be
 * machine-generated or guessed. A row with `verification: 'unverified'` renders
 * as "not yet checked", never as a fact.
 */
export interface IsraelProfile {
  skiAreaId: string;
  /** 0 = none known, 1 = limited, 2 = good, 3 = extensive. null = not researched. */
  kosherAvailability: 0 | 1 | 2 | 3 | null;
  kosherNotes: string | null;
  /** Straight-line km to nearest Chabad house; sourced from chabad.org directory. */
  chabadDistanceKm: number | null;
  chabadName: string | null;
  hebrewSkiSchool: boolean | null;
  hebrewSkiSchoolNotes: string | null;
  shabbatNotes: string | null;
  /** 0..3 curated nightlife intensity. Distinct from the OSM bar-density proxy. */
  apresLevel: 0 | 1 | 2 | 3 | null;
  familyScore: 0 | 1 | 2 | 3 | null;
  /** Airports with useful TLV service for this resort. */
  israeliGatewayAirports: string[];
  provenance: Provenance;
}

/** Free, factual OSM-derived nightlife proxy. Always available; weaker signal. */
export interface ApresProxy {
  skiAreaId: string;
  barCount: number;
  restaurantCount: number;
  nightclubCount: number;
  /** 0..1 normalized against the dataset. */
  densityScore: number;
  provenance: Provenance;
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

export type Ability = 'first_timer' | 'beginner' | 'intermediate' | 'advanced' | 'expert';

export interface SearchCriteria {
  /** Free text the user typed. Kept for explanation, never used for ranking. */
  rawQuery?: string;

  ability?: Ability;
  /** Mixed-ability group: score for the weakest AND the strongest. */
  groupAbilities?: Ability[];

  countries?: string[];
  minKm?: number;
  maxKm?: number;
  minVerticalM?: number;
  minTopElevM?: number;

  /**
   * ISO YYYY-MM-DD. The trip window: `dateFrom` is the night you arrive,
   * `dateTo` the morning you leave, so the number of nights is the difference
   * between them and "14–21 February" is seven nights.
   *
   * These are METADATA. They are carried through to booking links and to the
   * conditions panel; they DO NOT rank. We hold no `SeasonDates` for any
   * resort, so there is no honest basis for scoring one higher because it is
   * open on your dates — see `seasonFit` in scoring.ts, which reports itself at
   * zero weight and says so. Adding dates to a query must leave the ranking
   * byte-identical, and the golden suite asserts exactly that.
   */
  dateFrom?: string;
  dateTo?: string;
  /** Party size, for lodging and transfer links. Defaults to 2 downstream. */
  adults?: number;
  children?: number;

  wantNightSki?: boolean;
  wantApres?: boolean;
  wantFamily?: boolean;
  /**
   * "Quiet slopes." Modelled skier density: prefers FEWER skiers per km of
   * piste. Deliberately separate from `wantShortLiftQueues` — the same lift
   * capacity per km reads as short waits and as busy pistes at the same time,
   * so one field cannot answer both questions. See `slopeQuiet` in scoring.ts.
   */
  wantUncrowded?: boolean;
  /**
   * "No lift queues." Prefers MORE uphill capacity per km of piste. The
   * opposite optimisation to `wantUncrowded`; asking for both is legitimate and
   * the weights trade them off.
   */
  wantShortLiftQueues?: boolean;
  wantSnowsure?: boolean;
  wantSkiInSkiOut?: boolean;

  // Israel layer
  wantKosher?: boolean;
  wantHebrewSkiSchool?: boolean;
  maxChabadDistanceKm?: number;

  // Travel
  originAirport?: string;
  maxTransferMinutes?: number;

  maxPassPricePerDay?: number;
  currency?: string;

  limit?: number;
}

/**
 * Set when the user's raw query named this resort, by its display name or by
 * any of its aliases. Named resorts are pinned above unnamed ones in the
 * ranking; this records WHICH name matched so the UI can say why, which matters
 * most exactly when the match is non-obvious — typing "Val Gardena" and getting
 * a card headed "Alta Badia" is confusing until you can see the alias that
 * connected them and the `boundaryNote` explaining the merge.
 */
export interface NameMatch {
  /** The name or alias that matched, exactly as stored. */
  matched: string;
  /** True when it was the area's primary display name rather than an alias. */
  isPrimaryName: boolean;
}

/** One factor's contribution to a score. Every factor must be explainable. */
export interface ScoreFactor {
  key: string;
  /** Human-readable, shown in the UI. */
  label: string;
  /** 0..1 raw factor score. */
  raw: number;
  weight: number;
  /** raw * weight — contribution to the final 0..100. */
  contribution: number;
  /** Why this factor scored the way it did. */
  reason: string;
  /** True when we had no data, so the factor fell back to neutral. */
  dataMissing: boolean;
}

export interface ScoredResult {
  area: SkiArea;
  /** 0..100. */
  score: number;
  factors: ScoreFactor[];
  /** Hard filters this area failed, if returned in a relaxed search. */
  failedFilters: string[];
  /**
   * Non-null when the query named this resort. Truthy means "pinned above the
   * unnamed results"; the value says which name or alias did it.
   */
  nameMatch?: NameMatch | null;
  israel?: IsraelProfile | null;
  apres?: ApresProxy | null;
  transfer?: { airportIata: string; driveMinutes: number } | null;
}

export interface SearchResponse {
  criteria: SearchCriteria;
  results: ScoredResult[];
  totalConsidered: number;
  /** Set when filters were relaxed because nothing matched. */
  relaxedFilters?: string[];
  /** Set when an LLM parsed the query; null when deterministic parsing was used. */
  parsedBy?: 'llm' | 'deterministic';
}
