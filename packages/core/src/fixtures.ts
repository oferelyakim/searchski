/**
 * Fixture data for the scoring engine.
 *
 * ===========================================================================
 * READ THIS BEFORE USING ANY NUMBER IN HERE
 * ===========================================================================
 * If `data/build/ski_areas.json` exists at the repo root, `loadAreas()` reads
 * it and these fixtures are not used.
 *
 * If it does not, everything below is SYNTHESISED. The resorts are real and the
 * figures are in the right ballpark, but they were typed by hand to exercise
 * the scorer, not researched. Every synthesised row carries
 * `provenance.source = 'derived'` and a `note` that says so. Nothing in here
 * may ever be rendered to a user as a fact about a real resort.
 *
 * The set is deliberately shaped to stress the engine:
 *   - Georgia and Bulgaria with snowmakingKm = 0 (the OSM data gap, not a fact)
 *   - one enormous Italian area and one 12 km Georgian one
 *   - `hasNightSki` in all three states: true, false and null
 *   - verified and unverified IsraelProfile rows side by side
 *   - one non-operating area and one below the significance threshold, so the
 *     hard filters have something to bite on
 *
 * This module does I/O. `scoring.ts` does not, and must not.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  LIFT_CAPACITY_PPH,
  type AirportTransfer,
  type ApresProxy,
  type Difficulty,
  type DifficultyBucket,
  type IsraelProfile,
  type LiftTypeBucket,
  type OperatingStatus,
  type PassPrice,
  type Provenance,
  type SkiArea,
} from './types.js';
import type { ScoringContext } from './scoring.js';

export const SYNTHETIC_NOTE =
  'SYNTHESISED FIXTURE — modelled on a real resort but typed by hand for testing. Never display as fact.';

const FIXTURE_DATE = '2026-07-26T00:00:00.000Z';

function synthProvenance(extra?: string): Provenance {
  return {
    source: 'derived',
    sourceUrl: null,
    fetchedAt: FIXTURE_DATE,
    verification: 'unverified',
    note: extra ? `${SYNTHETIC_NOTE} ${extra}` : SYNTHETIC_NOTE,
  };
}

// ---------------------------------------------------------------------------
// Fixture builder — keeps terrainMix, runsByDifficulty and capacity consistent
// ---------------------------------------------------------------------------

interface FixtureSpec {
  id: string;
  name: string;
  aliases?: string[];
  country: string;
  /** Border fixtures only. Defaults to [country]. Primary first. */
  countries?: string[];
  regionCode?: string | null;
  regionName?: string | null;
  localities: string[];
  lat: number;
  lon: number;
  status?: OperatingStatus;
  baseElevM: number | null;
  topElevM: number | null;
  kmTotal: number;
  /** Shares by difficulty. Must sum to ~1. */
  mix: Partial<Record<Difficulty, number>>;
  /** Lift counts by OSM lift type; drives modelled uphill capacity. */
  lifts: Record<string, number>;
  snowmakingKm: number;
  hasNightSki: boolean | null;
  nightSkiKm?: number | null;
  isSignificant?: boolean;
  passRegionId?: string | null;
  websites?: string[];
  wikidataId?: string | null;
  /** Set when upstream merged two marketed resorts into this one record. */
  boundaryNote?: string | null;
}

function buildArea(spec: FixtureSpec): SkiArea {
  const vertical = spec.topElevM != null && spec.baseElevM != null ? spec.topElevM - spec.baseElevM : null;

  const runsByDifficulty: Partial<Record<Difficulty, DifficultyBucket>> = {};
  const terrainMix: Partial<Record<Difficulty, number>> = {};
  for (const [key, share] of Object.entries(spec.mix)) {
    const d = key as Difficulty;
    const s = share ?? 0;
    if (s <= 0) continue;
    const bucketKm = Math.round(s * spec.kmTotal * 10) / 10;
    terrainMix[d] = s;
    runsByDifficulty[d] = {
      count: Math.max(1, Math.round(bucketKm / 1.6)),
      km: bucketKm,
      minElevM: spec.baseElevM,
      maxElevM: spec.topElevM,
      elevationChangeM: vertical != null ? Math.round(vertical * s * 2.2) : null,
      snowmakingKm: Math.round(spec.snowmakingKm * s * 10) / 10,
    };
  }

  const liftsByType: Record<string, LiftTypeBucket> = {};
  let uphillCapacityPph = 0;
  let liftsTotal = 0;
  let liftsKmTotal = 0;
  for (const [type, count] of Object.entries(spec.lifts)) {
    if (count <= 0) continue;
    const perLift = LIFT_CAPACITY_PPH[type] ?? LIFT_CAPACITY_PPH['unknown'] ?? 800;
    // Rough modelled lift line lengths, only used for liftsKmTotal.
    const typicalKm = type === 'gondola' || type === 'cable_car' ? 3.2 : type === 'chair_lift' ? 1.6 : 0.9;
    liftsByType[type] = {
      count,
      km: Math.round(count * typicalKm * 10) / 10,
      minElevM: spec.baseElevM,
      maxElevM: spec.topElevM,
    };
    uphillCapacityPph += count * perLift;
    liftsTotal += count;
    liftsKmTotal += count * typicalKm;
  }

  return {
    id: spec.id,
    name: spec.name,
    aliases: spec.aliases ?? [],
    country: spec.country,
    // Fixtures are single-country; the ETL populates the real multi-country
    // list for border resorts. Primary first, so countries[0] === country.
    countries: spec.countries ?? [spec.country],
    regionCode: spec.regionCode ?? null,
    regionName: spec.regionName ?? null,
    localities: spec.localities,
    lat: spec.lat,
    lon: spec.lon,
    status: spec.status ?? 'operating',
    websites: spec.websites ?? [],
    wikidataId: spec.wikidataId ?? null,
    boundaryNote: spec.boundaryNote ?? null,
    baseElevM: spec.baseElevM,
    topElevM: spec.topElevM,
    verticalM: vertical,
    runsTotal: Object.values(runsByDifficulty).reduce((s, b) => s + (b?.count ?? 0), 0),
    kmTotal: spec.kmTotal,
    runsByDifficulty,
    liftsTotal,
    liftsKmTotal: Math.round(liftsKmTotal * 10) / 10,
    liftsByType,
    snowmakingKm: spec.snowmakingKm,
    hasNightSki: spec.hasNightSki,
    nightSkiKm: spec.nightSkiKm ?? null,
    uphillCapacityPph,
    capacityPerKm: spec.kmTotal > 0 ? Math.round((uphillCapacityPph / spec.kmTotal) * 10) / 10 : null,
    terrainMix,
    isSignificant: spec.isSignificant ?? true,
    passRegionId: spec.passRegionId ?? null,
    provenance: synthProvenance(),
  };
}

// ---------------------------------------------------------------------------
// The synthesised roster
// ---------------------------------------------------------------------------

const SPECS: readonly FixtureSpec[] = [
  // --- Georgia: the #1 Israeli destination, and the sparsest OSM coverage ---
  {
    id: 'fx-ge-gudauri',
    name: 'Gudauri',
    aliases: ['გუდაური', 'Гудаури'],
    country: 'GE',
    regionName: 'Mtskheta-Mtianeti',
    localities: ['Gudauri'],
    lat: 42.4783,
    lon: 44.4783,
    baseElevM: 1990,
    topElevM: 3246,
    kmTotal: 57,
    mix: { novice: 0.1, easy: 0.25, intermediate: 0.4, advanced: 0.2, expert: 0.05 },
    lifts: { gondola: 3, chair_lift: 4, drag_lift: 2 },
    snowmakingKm: 0, // OSM data gap for GE, NOT an absence of snowmaking
    hasNightSki: true,
    nightSkiKm: 3,
  },
  {
    id: 'fx-ge-bakuriani',
    name: 'Bakuriani',
    aliases: ['ბაკურიანი'],
    country: 'GE',
    regionName: 'Samtskhe-Javakheti',
    localities: ['Bakuriani'],
    lat: 41.7492,
    lon: 43.5322,
    baseElevM: 1700,
    topElevM: 2702,
    kmTotal: 26,
    mix: { novice: 0.18, easy: 0.34, intermediate: 0.36, advanced: 0.12 },
    lifts: { gondola: 2, chair_lift: 3, drag_lift: 5 },
    snowmakingKm: 0,
    hasNightSki: true,
    nightSkiKm: 2,
  },
  {
    id: 'fx-ge-goderdzi',
    name: 'Goderdzi',
    aliases: ['გოდერძი'],
    country: 'GE',
    regionName: 'Adjara',
    localities: ['Goderdzi'],
    lat: 41.6333,
    lon: 42.5,
    baseElevM: 2000,
    topElevM: 2390,
    kmTotal: 12,
    mix: { novice: 0.15, easy: 0.3, intermediate: 0.4, advanced: 0.15 },
    lifts: { chair_lift: 2, drag_lift: 1 },
    snowmakingKm: 0,
    hasNightSki: null, // genuinely unknown — the neutral case
  },

  {
    // The one name in the whole GE/BG/IT dataset that is also an ordinary
    // English word. Exists here so the false-pin guard has something real to
    // bite on. Deliberately given NO pass price, so the "resorts with no known
    // price are not filtered out" assertion has a subject.
    id: 'fx-ge-crystal',
    name: 'Crystal',
    aliases: ['კრისტალი'],
    country: 'GE',
    regionName: 'Samtskhe-Javakheti',
    localities: ['Bakuriani'],
    lat: 41.7333,
    lon: 43.4667,
    baseElevM: 1900,
    topElevM: 2200,
    kmTotal: 9,
    mix: { novice: 0.2, easy: 0.35, intermediate: 0.35, advanced: 0.1 },
    lifts: { chair_lift: 2, drag_lift: 2 },
    snowmakingKm: 0,
    hasNightSki: null,
  },

  // --- Bulgaria: cheap, well-understood, and also untagged for snowmaking ---
  {
    id: 'fx-bg-bansko',
    name: 'Bansko',
    aliases: ['Банско'],
    country: 'BG',
    regionName: 'Blagoevgrad',
    localities: ['Bansko'],
    lat: 41.8383,
    lon: 23.4886,
    baseElevM: 990,
    topElevM: 2515,
    kmTotal: 32,
    mix: { novice: 0.12, easy: 0.28, intermediate: 0.45, advanced: 0.15 },
    lifts: { gondola: 1, chair_lift: 6, drag_lift: 7 },
    snowmakingKm: 0, // VERIFIED upstream as 0 — and verified to be a data gap
    hasNightSki: true,
    nightSkiKm: 5,
  },
  {
    id: 'fx-bg-borovets',
    name: 'Borovets',
    aliases: ['Боровец'],
    country: 'BG',
    regionName: 'Sofia',
    localities: ['Borovets'],
    lat: 42.2669,
    lon: 23.6058,
    baseElevM: 1300,
    topElevM: 2537,
    kmTotal: 58,
    mix: { novice: 0.1, easy: 0.3, intermediate: 0.45, advanced: 0.15 },
    lifts: { gondola: 1, chair_lift: 6, drag_lift: 15 },
    snowmakingKm: 0,
    hasNightSki: true,
    nightSkiKm: 4,
  },
  {
    id: 'fx-bg-pamporovo',
    name: 'Pamporovo',
    aliases: ['Пампорово'],
    country: 'BG',
    regionName: 'Smolyan',
    localities: ['Pamporovo'],
    lat: 41.6597,
    lon: 24.6931,
    baseElevM: 1450,
    topElevM: 1937,
    kmTotal: 37,
    mix: { novice: 0.2, easy: 0.45, intermediate: 0.3, advanced: 0.05 },
    lifts: { chair_lift: 6, drag_lift: 8 },
    snowmakingKm: 0,
    hasNightSki: true,
    nightSkiKm: 2,
  },
  {
    id: 'fx-bg-kartala',
    name: 'Kartala',
    country: 'BG',
    regionName: 'Blagoevgrad',
    localities: ['Blagoevgrad'],
    lat: 42.0333,
    lon: 23.0667,
    status: 'proposed', // exists on paper; must never appear in a search
    baseElevM: 1500,
    topElevM: 2100,
    kmTotal: 15,
    mix: { easy: 0.4, intermediate: 0.6 },
    lifts: { chair_lift: 2 },
    snowmakingKm: 0,
    hasNightSki: null,
  },

  // --- Italy: dense data, real snowmaking tagging, pass-region hierarchy ----
  {
    // Models the real Stage 0 record: upstream merged Val Gardena into the
    // Alta Badia polygon, so the alias list is what makes Val Gardena findable
    // at all, and boundaryNote is what stops the km total being a lie.
    id: 'fx-it-valgardena',
    name: 'Alta Badia',
    aliases: [
      'Val Gardena',
      'Gröden',
      'Ortisei',
      'Selva di Val Gardena',
      'Wolkenstein',
      'Sëlva',
      'Urtijëi',
      'Santa Cristina',
      'Sellaronda',
    ],
    boundaryNote:
      'Upstream merges Val Gardena into this record, so the piste total covers both Alta Badia and Val Gardena. We do not split it: we have no faithful basis for apportioning the kilometres.',
    country: 'IT',
    regionCode: 'IT-32',
    regionName: 'Trentino-Alto Adige',
    localities: ['Selva', 'Ortisei', 'Corvara'],
    lat: 46.5546,
    lon: 11.7594,
    baseElevM: 1236,
    topElevM: 2518,
    kmTotal: 300,
    mix: { novice: 0.05, easy: 0.3, intermediate: 0.55, advanced: 0.09, expert: 0.01 },
    lifts: { gondola: 30, cable_car: 4, chair_lift: 35, drag_lift: 15 },
    snowmakingKm: 285,
    hasNightSki: false,
    passRegionId: 'fx-pr-dolomiti',
  },
  {
    id: 'fx-it-cervinia',
    name: 'Breuil-Cervinia',
    aliases: ['Cervinia', 'Il Cervino'],
    country: 'IT',
    regionCode: 'IT-23',
    regionName: 'Valle d’Aosta',
    localities: ['Breuil-Cervinia'],
    lat: 45.9364,
    lon: 7.6306,
    baseElevM: 2050,
    topElevM: 3480,
    kmTotal: 150,
    mix: { novice: 0.06, easy: 0.34, intermediate: 0.48, advanced: 0.1, expert: 0.02 },
    lifts: { gondola: 8, cable_car: 3, chair_lift: 10, drag_lift: 6 },
    snowmakingKm: 90,
    hasNightSki: false,
  },
  {
    id: 'fx-it-livigno',
    name: 'Livigno',
    country: 'IT',
    regionCode: 'IT-25',
    regionName: 'Lombardia',
    localities: ['Livigno'],
    lat: 46.5381,
    lon: 10.1353,
    baseElevM: 1816,
    topElevM: 2900,
    kmTotal: 115,
    mix: { novice: 0.08, easy: 0.29, intermediate: 0.48, advanced: 0.13, expert: 0.02 },
    lifts: { gondola: 6, cable_car: 1, chair_lift: 14, drag_lift: 9 },
    snowmakingKm: 85,
    hasNightSki: true,
    nightSkiKm: 2,
  },
  {
    id: 'fx-it-campiglio',
    name: 'Madonna di Campiglio',
    country: 'IT',
    regionCode: 'IT-32',
    regionName: 'Trentino-Alto Adige',
    localities: ['Madonna di Campiglio', 'Pinzolo'],
    lat: 46.2297,
    lon: 10.8264,
    baseElevM: 1550,
    topElevM: 2504,
    kmTotal: 150,
    mix: { novice: 0.09, easy: 0.33, intermediate: 0.45, advanced: 0.12, expert: 0.01 },
    lifts: { gondola: 10, chair_lift: 16, drag_lift: 7 },
    snowmakingKm: 135,
    hasNightSki: null,
  },

  // --- Austria and France: the easy case, kept small on purpose ------------
  {
    id: 'fx-at-kitzbuehel',
    name: 'Kitzbühel',
    aliases: ['KitzSki'],
    country: 'AT',
    regionCode: 'AT-7',
    regionName: 'Tirol',
    localities: ['Kitzbühel', 'Kirchberg'],
    lat: 47.4467,
    lon: 12.3919,
    baseElevM: 800,
    topElevM: 2000,
    kmTotal: 233,
    mix: { novice: 0.05, easy: 0.3, intermediate: 0.48, advanced: 0.15, expert: 0.02 },
    lifts: { gondola: 20, chair_lift: 30, drag_lift: 7 },
    snowmakingKm: 210,
    hasNightSki: true,
    nightSkiKm: 3,
  },
  {
    id: 'fx-at-saalbach',
    name: 'Saalbach-Hinterglemm',
    country: 'AT',
    regionCode: 'AT-5',
    regionName: 'Salzburg',
    localities: ['Saalbach', 'Hinterglemm', 'Leogang'],
    lat: 47.3925,
    lon: 12.6367,
    baseElevM: 1003,
    topElevM: 2096,
    kmTotal: 270,
    mix: { novice: 0.05, easy: 0.32, intermediate: 0.49, advanced: 0.12, expert: 0.02 },
    lifts: { gondola: 25, chair_lift: 28, drag_lift: 17 },
    snowmakingKm: 240,
    hasNightSki: true,
    nightSkiKm: 2,
  },
  {
    id: 'fx-fr-valthorens',
    name: 'Val Thorens',
    country: 'FR',
    regionCode: 'FR-ARA',
    regionName: 'Auvergne-Rhône-Alpes',
    localities: ['Val Thorens'],
    lat: 45.2978,
    lon: 6.5806,
    baseElevM: 1800,
    topElevM: 3230,
    kmTotal: 150,
    mix: { novice: 0.05, easy: 0.2, intermediate: 0.5, advanced: 0.2, expert: 0.05 },
    lifts: { gondola: 9, cable_car: 2, chair_lift: 17, drag_lift: 5 },
    snowmakingKm: 60,
    hasNightSki: null,
  },
  {
    id: 'fx-fr-tignes',
    name: 'Tignes',
    aliases: ['Espace Killy'],
    country: 'FR',
    regionCode: 'FR-ARA',
    regionName: 'Auvergne-Rhône-Alpes',
    localities: ['Tignes', 'Val Claret'],
    lat: 45.4686,
    lon: 6.9058,
    baseElevM: 1550,
    topElevM: 3456,
    kmTotal: 150,
    mix: { novice: 0.06, easy: 0.24, intermediate: 0.46, advanced: 0.18, expert: 0.06 },
    lifts: { gondola: 8, cable_car: 2, chair_lift: 16, drag_lift: 12 },
    snowmakingKm: 70,
    hasNightSki: false,
  },

  // --- One village hill, below the significance threshold ------------------
  {
    id: 'fx-de-hocheck',
    name: 'Oberaudorf Hocheck',
    country: 'DE',
    regionName: 'Bayern',
    localities: ['Oberaudorf'],
    lat: 47.6461,
    lon: 12.1719,
    baseElevM: 600,
    topElevM: 1000,
    kmTotal: 4,
    mix: { novice: 0.3, easy: 0.5, intermediate: 0.2 },
    lifts: { chair_lift: 1, drag_lift: 2 },
    snowmakingKm: 3.5,
    hasNightSki: true,
    nightSkiKm: 2,
    isSignificant: false, // one village hill; noise in a search result
  },
];

/** The synthesised roster. See the file header before trusting a number. */
export const SYNTHETIC_AREAS: readonly SkiArea[] = SPECS.map(buildArea);

// ---------------------------------------------------------------------------
// Curated side data (also synthesised)
// ---------------------------------------------------------------------------

function israelProv(verification: 'verified' | 'unverified' | 'stale'): Provenance {
  return {
    source: 'curated',
    sourceUrl: null,
    fetchedAt: FIXTURE_DATE,
    verification,
    note: SYNTHETIC_NOTE,
  };
}

/**
 * Note the deliberate spread of verification statuses. The Alpine rows carry
 * real-looking numbers with `verification: 'unverified'` precisely so the
 * golden harness can prove they are ignored: an unverified apresLevel of 3
 * must not lift a resort by a single point.
 */
const ISRAEL_PROFILES: readonly IsraelProfile[] = [
  {
    skiAreaId: 'fx-ge-gudauri',
    kosherAvailability: 1,
    kosherNotes: 'Synthesised. A small amount of imported kosher product in Gudauri; the real supply is in Tbilisi.',
    chabadDistanceKm: 120,
    chabadName: 'Chabad of Tbilisi',
    hebrewSkiSchool: true,
    hebrewSkiSchoolNotes: 'Synthesised. Several Hebrew-speaking instructors work the season here.',
    shabbatNotes: 'Synthesised.',
    apresLevel: 2,
    familyScore: 2,
    israeliGatewayAirports: ['TBS', 'KUT'],
    provenance: israelProv('verified'),
  },
  {
    skiAreaId: 'fx-bg-bansko',
    kosherAvailability: 2,
    kosherNotes: 'Synthesised. Kosher catering runs in the Israeli high season.',
    chabadDistanceKm: 160,
    chabadName: 'Chabad of Sofia',
    hebrewSkiSchool: true,
    hebrewSkiSchoolNotes: 'Synthesised.',
    shabbatNotes: 'Synthesised.',
    apresLevel: 3,
    familyScore: 2,
    israeliGatewayAirports: ['SOF'],
    provenance: israelProv('verified'),
  },
  {
    skiAreaId: 'fx-bg-borovets',
    kosherAvailability: 1,
    kosherNotes: 'Synthesised.',
    chabadDistanceKm: 145,
    chabadName: 'Chabad of Sofia',
    hebrewSkiSchool: false,
    hebrewSkiSchoolNotes: 'Synthesised. No Hebrew-speaking school found.',
    shabbatNotes: null,
    apresLevel: 3,
    familyScore: 2,
    israeliGatewayAirports: ['SOF'],
    provenance: israelProv('verified'),
  },
  {
    skiAreaId: 'fx-bg-pamporovo',
    kosherAvailability: 0,
    kosherNotes: 'Synthesised. Nothing kosher found within reach.',
    chabadDistanceKm: 175,
    chabadName: 'Chabad of Sofia',
    hebrewSkiSchool: false,
    hebrewSkiSchoolNotes: 'Synthesised.',
    shabbatNotes: null,
    apresLevel: 1,
    familyScore: 3,
    israeliGatewayAirports: ['SOF', 'PDV'],
    provenance: israelProv('verified'),
  },
  // Unverified rows below. These must not move the ranking by a single point.
  {
    skiAreaId: 'fx-it-valgardena',
    kosherAvailability: 3,
    kosherNotes: 'UNVERIFIED synthesised placeholder — deliberately generous so the gate is testable.',
    chabadDistanceKm: 5,
    chabadName: 'placeholder',
    hebrewSkiSchool: true,
    hebrewSkiSchoolNotes: 'UNVERIFIED synthesised placeholder.',
    shabbatNotes: null,
    apresLevel: 3,
    familyScore: 3,
    israeliGatewayAirports: ['VRN', 'VCE'],
    provenance: israelProv('unverified'),
  },
  {
    skiAreaId: 'fx-at-kitzbuehel',
    kosherAvailability: 2,
    kosherNotes: 'UNVERIFIED synthesised placeholder.',
    chabadDistanceKm: 90,
    chabadName: 'placeholder',
    hebrewSkiSchool: null,
    hebrewSkiSchoolNotes: null,
    shabbatNotes: null,
    apresLevel: 3,
    familyScore: 2,
    israeliGatewayAirports: ['SZG', 'INN'],
    provenance: israelProv('unverified'),
  },
  {
    skiAreaId: 'fx-fr-valthorens',
    kosherAvailability: 1,
    kosherNotes: 'STALE synthesised placeholder from a previous season.',
    chabadDistanceKm: 110,
    chabadName: 'placeholder',
    hebrewSkiSchool: false,
    hebrewSkiSchoolNotes: null,
    shabbatNotes: null,
    apresLevel: 3,
    familyScore: 2,
    israeliGatewayAirports: ['GVA', 'LYS'],
    provenance: israelProv('stale'),
  },
];

/** OSM bar/pub/nightclub density near the base. Free, factual, weaker signal. */
const APRES_PROXIES: ReadonlyArray<Omit<ApresProxy, 'provenance'>> = [
  { skiAreaId: 'fx-ge-gudauri', barCount: 9, restaurantCount: 24, nightclubCount: 1, densityScore: 0.42 },
  { skiAreaId: 'fx-ge-bakuriani', barCount: 6, restaurantCount: 18, nightclubCount: 0, densityScore: 0.28 },
  { skiAreaId: 'fx-ge-goderdzi', barCount: 1, restaurantCount: 3, nightclubCount: 0, densityScore: 0.05 },
  { skiAreaId: 'fx-bg-bansko', barCount: 41, restaurantCount: 120, nightclubCount: 8, densityScore: 0.95 },
  { skiAreaId: 'fx-bg-borovets', barCount: 28, restaurantCount: 62, nightclubCount: 5, densityScore: 0.78 },
  { skiAreaId: 'fx-bg-pamporovo', barCount: 11, restaurantCount: 30, nightclubCount: 1, densityScore: 0.35 },
  { skiAreaId: 'fx-it-valgardena', barCount: 34, restaurantCount: 180, nightclubCount: 3, densityScore: 0.6 },
  { skiAreaId: 'fx-it-cervinia', barCount: 22, restaurantCount: 70, nightclubCount: 2, densityScore: 0.52 },
  { skiAreaId: 'fx-it-livigno', barCount: 30, restaurantCount: 95, nightclubCount: 4, densityScore: 0.7 },
  { skiAreaId: 'fx-it-campiglio', barCount: 26, restaurantCount: 88, nightclubCount: 3, densityScore: 0.62 },
  { skiAreaId: 'fx-at-kitzbuehel', barCount: 45, restaurantCount: 150, nightclubCount: 7, densityScore: 0.9 },
  { skiAreaId: 'fx-at-saalbach', barCount: 52, restaurantCount: 140, nightclubCount: 9, densityScore: 0.97 },
  { skiAreaId: 'fx-fr-valthorens', barCount: 24, restaurantCount: 72, nightclubCount: 4, densityScore: 0.66 },
  { skiAreaId: 'fx-fr-tignes', barCount: 21, restaurantCount: 65, nightclubCount: 3, densityScore: 0.58 },
];

const TRANSFERS: ReadonlyArray<Omit<AirportTransfer, 'provenance'>> = [
  { airportIata: 'TBS', skiAreaId: 'fx-ge-gudauri', driveMinutes: 120, distanceKm: 120 },
  { airportIata: 'TBS', skiAreaId: 'fx-ge-bakuriani', driveMinutes: 130, distanceKm: 180 },
  { airportIata: 'KUT', skiAreaId: 'fx-ge-goderdzi', driveMinutes: 180, distanceKm: 160 },
  { airportIata: 'SOF', skiAreaId: 'fx-bg-bansko', driveMinutes: 150, distanceKm: 160 },
  { airportIata: 'SOF', skiAreaId: 'fx-bg-borovets', driveMinutes: 75, distanceKm: 73 },
  { airportIata: 'SOF', skiAreaId: 'fx-bg-pamporovo', driveMinutes: 200, distanceKm: 230 },
  { airportIata: 'PDV', skiAreaId: 'fx-bg-pamporovo', driveMinutes: 90, distanceKm: 85 },
  { airportIata: 'VRN', skiAreaId: 'fx-it-valgardena', driveMinutes: 180, distanceKm: 220 },
  { airportIata: 'VCE', skiAreaId: 'fx-it-valgardena', driveMinutes: 210, distanceKm: 240 },
  { airportIata: 'TRN', skiAreaId: 'fx-it-cervinia', driveMinutes: 120, distanceKm: 120 },
  { airportIata: 'MXP', skiAreaId: 'fx-it-cervinia', driveMinutes: 130, distanceKm: 150 },
  { airportIata: 'MXP', skiAreaId: 'fx-it-livigno', driveMinutes: 200, distanceKm: 210 },
  { airportIata: 'VRN', skiAreaId: 'fx-it-campiglio', driveMinutes: 165, distanceKm: 175 },
  { airportIata: 'SZG', skiAreaId: 'fx-at-kitzbuehel', driveMinutes: 90, distanceKm: 85 },
  { airportIata: 'INN', skiAreaId: 'fx-at-kitzbuehel', driveMinutes: 75, distanceKm: 95 },
  { airportIata: 'SZG', skiAreaId: 'fx-at-saalbach', driveMinutes: 95, distanceKm: 90 },
  { airportIata: 'GVA', skiAreaId: 'fx-fr-valthorens', driveMinutes: 150, distanceKm: 155 },
  { airportIata: 'LYS', skiAreaId: 'fx-fr-valthorens', driveMinutes: 180, distanceKm: 190 },
  { airportIata: 'GVA', skiAreaId: 'fx-fr-tignes', driveMinutes: 175, distanceKm: 180 },
];

/** Adult day tickets, EUR, season 2026/27. Synthesised, ballpark only. */
const PASS_PRICES: ReadonlyArray<{ skiAreaId: string; price: number }> = [
  { skiAreaId: 'fx-ge-gudauri', price: 35 },
  { skiAreaId: 'fx-ge-bakuriani', price: 30 },
  { skiAreaId: 'fx-ge-goderdzi', price: 25 },
  { skiAreaId: 'fx-bg-bansko', price: 42 },
  { skiAreaId: 'fx-bg-borovets', price: 40 },
  { skiAreaId: 'fx-bg-pamporovo', price: 38 },
  { skiAreaId: 'fx-it-valgardena', price: 72 },
  { skiAreaId: 'fx-it-cervinia', price: 65 },
  { skiAreaId: 'fx-it-livigno', price: 58 },
  { skiAreaId: 'fx-it-campiglio', price: 68 },
  { skiAreaId: 'fx-at-kitzbuehel', price: 70 },
  { skiAreaId: 'fx-at-saalbach', price: 68 },
  { skiAreaId: 'fx-fr-valthorens', price: 62 },
  { skiAreaId: 'fx-fr-tignes', price: 61 },
];

// ---------------------------------------------------------------------------
// Assembling the ScoringContext
// ---------------------------------------------------------------------------

function indexBy<T>(rows: readonly T[], key: (row: T) => string): Record<string, T> {
  const out: Record<string, T> = {};
  for (const row of rows) out[key(row)] = row;
  return out;
}

function groupBy<T>(rows: readonly T[], key: (row: T) => string): Record<string, T[]> {
  const out: Record<string, T[]> = {};
  for (const row of rows) {
    const k = key(row);
    (out[k] ??= []).push(row);
  }
  return out;
}

/** The synthesised context: profiles, apres proxies, transfers and prices. */
export function syntheticContext(): ScoringContext {
  const apres: ApresProxy[] = APRES_PROXIES.map((p) => ({
    ...p,
    provenance: { source: 'openstreetmap', sourceUrl: null, fetchedAt: FIXTURE_DATE, note: SYNTHETIC_NOTE },
  }));
  const transfers: AirportTransfer[] = TRANSFERS.map((t) => ({
    ...t,
    provenance: { source: 'derived', sourceUrl: null, fetchedAt: FIXTURE_DATE, note: SYNTHETIC_NOTE },
  }));
  const prices: PassPrice[] = PASS_PRICES.map((p) => ({
    passRegionId: null,
    skiAreaId: p.skiAreaId,
    season: '2026/27',
    category: 'adult',
    duration: '1day',
    price: p.price,
    currency: 'EUR',
    isDynamic: false,
    provenance: { source: 'curated', sourceUrl: null, fetchedAt: FIXTURE_DATE, verification: 'verified', note: SYNTHETIC_NOTE },
  }));

  return {
    israelProfiles: indexBy(ISRAEL_PROFILES, (p) => p.skiAreaId),
    apresProxies: indexBy(apres, (p) => p.skiAreaId),
    transfers: groupBy(transfers, (t) => t.skiAreaId),
    passPrices: groupBy(prices, (p) => p.skiAreaId ?? ''),
  };
}

// ---------------------------------------------------------------------------
// Real data, if the ETL has produced any
// ---------------------------------------------------------------------------

const HERE = dirname(fileURLToPath(import.meta.url));
/** packages/core/src -> repo root */
export const REPO_ROOT = resolve(HERE, '..', '..', '..');
export const BUILD_DIR = join(REPO_ROOT, 'data', 'build');

function readJson(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

/** The ETL may emit a bare array or wrap it; accept either. */
function unwrap(payload: unknown, ...keys: string[]): unknown[] | null {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === 'object') {
    const obj = payload as Record<string, unknown>;
    for (const k of [...keys, 'items', 'data', 'rows']) {
      const v = obj[k];
      if (Array.isArray(v)) return v;
    }
  }
  return null;
}

function looksLikeSkiArea(row: unknown): row is SkiArea {
  if (!row || typeof row !== 'object') return false;
  const r = row as Record<string, unknown>;
  return typeof r['id'] === 'string' && typeof r['name'] === 'string' && typeof r['kmTotal'] === 'number';
}

export interface LoadedData {
  areas: readonly SkiArea[];
  ctx: ScoringContext;
  /** True when the numbers came from data/build, false when synthesised. */
  real: boolean;
  source: string;
}

/**
 * Load the real ETL output when it exists, otherwise the synthesised fixtures.
 * Side data files are optional and loaded independently of each other, so a
 * half-built `data/build` still produces a working search.
 */
export function loadAreas(): LoadedData {
  const areasPath = join(BUILD_DIR, 'ski_areas.json');
  if (existsSync(areasPath)) {
    const rows = unwrap(readJson(areasPath), 'areas', 'skiAreas', 'ski_areas');
    const areas = (rows ?? []).filter(looksLikeSkiArea);
    if (areas.length > 0) {
      const ctx: ScoringContext = {};
      const profiles = unwrap(readJson(join(BUILD_DIR, 'israel_profiles.json')), 'profiles', 'israelProfiles');
      if (profiles) {
        ctx.israelProfiles = indexBy(profiles as IsraelProfile[], (p) => p.skiAreaId);
      }
      const apres = unwrap(readJson(join(BUILD_DIR, 'apres_proxies.json')), 'apres', 'apresProxies');
      if (apres) ctx.apresProxies = indexBy(apres as ApresProxy[], (p) => p.skiAreaId);
      const transfers = unwrap(readJson(join(BUILD_DIR, 'airport_transfers.json')), 'transfers');
      if (transfers) ctx.transfers = groupBy(transfers as AirportTransfer[], (t) => t.skiAreaId);
      const prices = unwrap(readJson(join(BUILD_DIR, 'pass_prices.json')), 'prices', 'passPrices');
      if (prices) {
        ctx.passPrices = groupBy(
          (prices as PassPrice[]).filter((p) => p.skiAreaId != null || p.passRegionId != null),
          (p) => p.skiAreaId ?? p.passRegionId ?? '',
        );
      }
      return { areas, ctx, real: true, source: areasPath };
    }
  }
  return {
    areas: SYNTHETIC_AREAS,
    ctx: syntheticContext(),
    real: false,
    source: 'synthesised fixtures (packages/core/src/fixtures.ts)',
  };
}
