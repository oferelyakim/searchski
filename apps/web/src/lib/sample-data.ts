/**
 * Built-in sample dataset.
 *
 * Used ONLY when `data/build/*.json` is absent — i.e. before the ETL has been
 * run, or on a fresh clone. It exists so `next build` and `next dev` never
 * fail on missing data, not so the site can pretend to have data.
 *
 * Two rules hold here:
 *  1. Every row is flagged `isSample` at the dataset level and the UI renders a
 *     standing banner. Nothing from this file is ever presented as researched.
 *  2. NOT ONE curated Israel-layer row is marked `verified`. Sample kosher,
 *     Chabad or Hebrew-school claims would be fabrications, and PLAN.md §9 is
 *     explicit that an unverified claim here harms a real person's trip. They
 *     therefore all render as "not yet verified".
 *
 * The piste/lift figures are order-of-magnitude public figures, present to make
 * the ranking visibly do something. They are not a data source.
 */

import type {
  Airport,
  AirportTransfer,
  ApresProxy,
  Difficulty,
  DifficultyBucket,
  IsraelProfile,
  PassPrice,
  PassRegion,
  Provenance,
  SkiArea,
} from '@searchski/core/types';

const SAMPLE_PROV: Provenance = {
  source: 'curated',
  sourceUrl: null,
  fetchedAt: '2026-07-26T00:00:00.000Z',
  verification: 'unverified',
  note: 'Built-in sample row. Run the ETL to replace with real OpenSkiMap data.',
};

interface AreaSeed {
  id: string;
  name: string;
  aliases: string[];
  country: string;
  regionName: string;
  localities: string[];
  lat: number;
  lon: number;
  base: number;
  top: number;
  km: number;
  runs: number;
  lifts: number;
  liftMix: Record<string, number>;
  mix: Partial<Record<Difficulty, number>>;
  snowmakingKm: number;
  hasNightSki: boolean | null;
  nightSkiKm: number | null;
  website: string;
  passRegionId: string | null;
}

const SEEDS: AreaSeed[] = [
  {
    id: 'sample-gudauri',
    name: 'Gudauri',
    aliases: ['გუდაური', 'Гудаури'],
    country: 'GE',
    regionName: 'Mtskheta-Mtianeti',
    localities: ['Gudauri'],
    lat: 42.4783,
    lon: 44.4783,
    base: 1990,
    top: 3279,
    km: 70,
    runs: 26,
    lifts: 9,
    liftMix: { gondola: 2, chair_lift: 6, drag_lift: 1 },
    mix: { novice: 0.05, easy: 0.3, intermediate: 0.4, advanced: 0.2, freeride: 0.05 },
    snowmakingKm: 4,
    hasNightSki: true,
    nightSkiKm: 2.5,
    website: 'https://gudauri.ski/',
    passRegionId: null,
  },
  {
    id: 'sample-bakuriani',
    name: 'Bakuriani',
    aliases: ['ბაკურიანი'],
    country: 'GE',
    regionName: 'Samtskhe-Javakheti',
    localities: ['Bakuriani'],
    lat: 41.7489,
    lon: 43.5322,
    base: 1700,
    top: 2702,
    km: 32,
    runs: 18,
    lifts: 11,
    liftMix: { gondola: 1, chair_lift: 5, drag_lift: 5 },
    mix: { novice: 0.2, easy: 0.35, intermediate: 0.3, advanced: 0.15 },
    snowmakingKm: 12,
    hasNightSki: null,
    nightSkiKm: null,
    website: 'https://bakuriani.ski/',
    passRegionId: null,
  },
  {
    id: 'sample-bansko',
    name: 'Bansko',
    aliases: ['Банско'],
    country: 'BG',
    regionName: 'Blagoevgrad',
    localities: ['Bansko'],
    lat: 41.8386,
    lon: 23.4886,
    base: 990,
    top: 2560,
    km: 75,
    runs: 20,
    lifts: 14,
    liftMix: { gondola: 1, chair_lift: 8, drag_lift: 5 },
    mix: { novice: 0.08, easy: 0.32, intermediate: 0.45, advanced: 0.15 },
    snowmakingKm: 65,
    hasNightSki: true,
    nightSkiKm: 5,
    website: 'https://banskoski.com/',
    passRegionId: null,
  },
  {
    id: 'sample-borovets',
    name: 'Borovets',
    aliases: ['Боровец'],
    country: 'BG',
    regionName: 'Sofia',
    localities: ['Borovets'],
    lat: 42.2683,
    lon: 23.6039,
    base: 1300,
    top: 2560,
    km: 58,
    runs: 23,
    lifts: 12,
    liftMix: { gondola: 1, chair_lift: 6, drag_lift: 5 },
    mix: { novice: 0.1, easy: 0.35, intermediate: 0.4, advanced: 0.15 },
    snowmakingKm: 40,
    hasNightSki: true,
    nightSkiKm: 3,
    website: 'https://borovets-bg.com/',
    passRegionId: null,
  },
  {
    id: 'sample-pamporovo',
    name: 'Pamporovo',
    aliases: ['Пампорово'],
    country: 'BG',
    regionName: 'Smolyan',
    localities: ['Pamporovo'],
    lat: 41.6603,
    lon: 24.6931,
    base: 1450,
    top: 1937,
    km: 37,
    runs: 20,
    lifts: 13,
    liftMix: { chair_lift: 5, drag_lift: 8 },
    mix: { novice: 0.15, easy: 0.45, intermediate: 0.35, advanced: 0.05 },
    snowmakingKm: 30,
    hasNightSki: true,
    nightSkiKm: 2,
    website: 'https://pamporovoresort.bg/',
    passRegionId: null,
  },
  {
    id: 'sample-alta-badia',
    name: 'Alta Badia',
    aliases: ['Corvara', 'La Villa'],
    country: 'IT',
    regionName: 'Trentino-Alto Adige',
    localities: ['Corvara', 'La Villa', 'Badia'],
    lat: 46.5508,
    lon: 11.8747,
    base: 1324,
    top: 2550,
    km: 130,
    runs: 53,
    lifts: 51,
    liftMix: { gondola: 9, chair_lift: 30, cable_car: 2, drag_lift: 10 },
    mix: { novice: 0.05, easy: 0.5, intermediate: 0.38, advanced: 0.07 },
    snowmakingKm: 128,
    hasNightSki: false,
    nightSkiKm: 0,
    website: 'https://www.altabadia.org/',
    passRegionId: 'sample-dolomiti-superski',
  },
  {
    id: 'sample-val-gardena',
    name: 'Val Gardena',
    aliases: ['Gröden', 'Gherdëina', 'Selva'],
    country: 'IT',
    regionName: 'Trentino-Alto Adige',
    localities: ['Selva', 'Ortisei', 'Santa Cristina'],
    lat: 46.5546,
    lon: 11.7594,
    base: 1236,
    top: 2518,
    km: 175,
    runs: 79,
    lifts: 79,
    liftMix: { gondola: 15, chair_lift: 40, cable_car: 4, drag_lift: 20 },
    mix: { novice: 0.04, easy: 0.42, intermediate: 0.44, advanced: 0.1 },
    snowmakingKm: 170,
    hasNightSki: false,
    nightSkiKm: 0,
    website: 'https://www.valgardena.it/',
    passRegionId: 'sample-dolomiti-superski',
  },
  {
    id: 'sample-livigno',
    name: 'Livigno',
    aliases: [],
    country: 'IT',
    regionName: 'Lombardia',
    localities: ['Livigno'],
    lat: 46.5381,
    lon: 10.1353,
    base: 1816,
    top: 2900,
    km: 115,
    runs: 40,
    lifts: 31,
    liftMix: { gondola: 5, chair_lift: 18, cable_car: 1, drag_lift: 7 },
    mix: { novice: 0.06, easy: 0.34, intermediate: 0.45, advanced: 0.1, freeride: 0.05 },
    snowmakingKm: 90,
    hasNightSki: null,
    nightSkiKm: null,
    website: 'https://www.livigno.eu/',
    passRegionId: null,
  },
  {
    id: 'sample-sestriere',
    name: 'Sestriere',
    aliases: ['Via Lattea'],
    country: 'IT',
    regionName: 'Piemonte',
    localities: ['Sestriere'],
    lat: 44.9578,
    lon: 6.8783,
    base: 1350,
    top: 2823,
    km: 146,
    runs: 61,
    lifts: 22,
    liftMix: { gondola: 3, chair_lift: 14, drag_lift: 5 },
    mix: { novice: 0.05, easy: 0.3, intermediate: 0.45, advanced: 0.15, freeride: 0.05 },
    snowmakingKm: 110,
    hasNightSki: true,
    nightSkiKm: 3,
    website: 'https://www.vialattea.it/',
    passRegionId: 'sample-via-lattea',
  },
  {
    id: 'sample-madonna-di-campiglio',
    name: 'Madonna di Campiglio',
    aliases: [],
    country: 'IT',
    regionName: 'Trentino-Alto Adige',
    localities: ['Madonna di Campiglio', 'Pinzolo'],
    lat: 46.2297,
    lon: 10.8272,
    base: 1522,
    top: 2504,
    km: 156,
    runs: 57,
    lifts: 33,
    liftMix: { gondola: 8, chair_lift: 18, cable_car: 1, drag_lift: 6 },
    mix: { novice: 0.05, easy: 0.3, intermediate: 0.5, advanced: 0.15 },
    snowmakingKm: 150,
    hasNightSki: false,
    nightSkiKm: 0,
    website: 'https://www.campigliodolomiti.it/',
    passRegionId: null,
  },
];

const LIFT_PPH: Record<string, number> = {
  gondola: 2400,
  cable_car: 1600,
  chair_lift: 2200,
  drag_lift: 850,
};

function buildArea(seed: AreaSeed): SkiArea {
  const runsByDifficulty: Partial<Record<Difficulty, DifficultyBucket>> = {};
  for (const [difficulty, share] of Object.entries(seed.mix)) {
    const km = Number((seed.km * (share ?? 0)).toFixed(1));
    const bucket: DifficultyBucket = {
      count: Math.max(1, Math.round(seed.runs * (share ?? 0))),
      km,
      minElevM: seed.base,
      maxElevM: seed.top,
      elevationChangeM: Math.round((seed.top - seed.base) * 0.8),
      snowmakingKm: Number((seed.snowmakingKm * (share ?? 0)).toFixed(1)),
    };
    runsByDifficulty[difficulty as Difficulty] = bucket;
  }

  const liftsByType: SkiArea['liftsByType'] = {};
  let uphillCapacityPph = 0;
  let liftsKmTotal = 0;
  for (const [type, count] of Object.entries(seed.liftMix)) {
    const km = count * 1.4;
    liftsKmTotal += km;
    uphillCapacityPph += count * (LIFT_PPH[type] ?? 800);
    liftsByType[type] = {
      count,
      km: Number(km.toFixed(1)),
      minElevM: seed.base,
      maxElevM: seed.top,
    };
  }

  return {
    id: seed.id,
    name: seed.name,
    aliases: seed.aliases,
    country: seed.country,
    countries: [seed.country],
    boundaryNote: null,
    regionCode: null,
    regionName: seed.regionName,
    localities: seed.localities,
    lat: seed.lat,
    lon: seed.lon,
    status: 'operating',
    websites: [seed.website],
    wikidataId: null,
    baseElevM: seed.base,
    topElevM: seed.top,
    verticalM: seed.top - seed.base,
    runsTotal: seed.runs,
    kmTotal: seed.km,
    runsByDifficulty,
    liftsTotal: seed.lifts,
    liftsKmTotal: Number(liftsKmTotal.toFixed(1)),
    liftsByType,
    snowmakingKm: seed.snowmakingKm,
    hasNightSki: seed.hasNightSki,
    nightSkiKm: seed.nightSkiKm,
    uphillCapacityPph,
    capacityPerKm: Number((uphillCapacityPph / seed.km).toFixed(1)),
    terrainMix: seed.mix,
    isSignificant: true,
    passRegionId: seed.passRegionId,
    provenance: SAMPLE_PROV,
  };
}

export const SAMPLE_AREAS: SkiArea[] = SEEDS.map(buildArea);

export const SAMPLE_PASS_REGIONS: PassRegion[] = [
  {
    id: 'sample-dolomiti-superski',
    name: 'Dolomiti Superski',
    country: 'IT',
    marketedKm: 1200,
    officialUrl: 'https://www.dolomitisuperski.com/',
    memberAreaIds: ['sample-alta-badia', 'sample-val-gardena'],
    provenance: SAMPLE_PROV,
  },
  {
    id: 'sample-via-lattea',
    name: 'Via Lattea (Milky Way)',
    country: 'IT',
    marketedKm: 400,
    officialUrl: 'https://www.vialattea.it/',
    memberAreaIds: ['sample-sestriere'],
    provenance: SAMPLE_PROV,
  },
];

export const SAMPLE_AIRPORTS: Airport[] = [
  { iata: 'TBS', name: 'Tbilisi International', country: 'GE', lat: 41.6692, lon: 44.9547, directFromTLV: true },
  { iata: 'KUT', name: 'Kutaisi International', country: 'GE', lat: 42.1767, lon: 42.4826, directFromTLV: true },
  { iata: 'SOF', name: 'Sofia', country: 'BG', lat: 42.6967, lon: 23.4114, directFromTLV: true },
  { iata: 'PDV', name: 'Plovdiv', country: 'BG', lat: 42.0678, lon: 24.8508, directFromTLV: false },
  { iata: 'VCE', name: 'Venice Marco Polo', country: 'IT', lat: 45.5053, lon: 12.3519, directFromTLV: true },
  { iata: 'MXP', name: 'Milan Malpensa', country: 'IT', lat: 45.6306, lon: 8.7281, directFromTLV: true },
  { iata: 'TRN', name: 'Turin Caselle', country: 'IT', lat: 45.2008, lon: 7.6497, directFromTLV: false },
  { iata: 'VRN', name: 'Verona Villafranca', country: 'IT', lat: 45.3957, lon: 10.8885, directFromTLV: false },
];

function transfer(airportIata: string, skiAreaId: string, driveMinutes: number, distanceKm: number): AirportTransfer {
  return {
    airportIata,
    skiAreaId,
    driveMinutes,
    distanceKm,
    provenance: { ...SAMPLE_PROV, source: 'derived' },
  };
}

export const SAMPLE_TRANSFERS: AirportTransfer[] = [
  transfer('TBS', 'sample-gudauri', 130, 120),
  transfer('TBS', 'sample-bakuriani', 175, 180),
  transfer('KUT', 'sample-gudauri', 260, 250),
  transfer('SOF', 'sample-bansko', 150, 160),
  transfer('SOF', 'sample-borovets', 75, 73),
  transfer('SOF', 'sample-pamporovo', 200, 230),
  transfer('PDV', 'sample-pamporovo', 95, 90),
  transfer('VCE', 'sample-alta-badia', 195, 200),
  transfer('VCE', 'sample-val-gardena', 190, 195),
  transfer('VRN', 'sample-madonna-di-campiglio', 150, 155),
  transfer('MXP', 'sample-livigno', 210, 215),
  transfer('TRN', 'sample-sestriere', 90, 95),
];

/**
 * Every one of these is `unverified` on purpose — see the header comment.
 * The UI must render them as "not yet verified", never as fact.
 */
export const SAMPLE_ISRAEL_PROFILES: IsraelProfile[] = [
  {
    skiAreaId: 'sample-gudauri',
    kosherAvailability: null,
    kosherNotes: 'Chabad Tbilisi has historically arranged kosher catering for groups. Needs checking for the coming season.',
    chabadDistanceKm: 120,
    chabadName: 'Chabad of Tbilisi',
    hebrewSkiSchool: null,
    hebrewSkiSchoolNotes: 'Several Israeli-run ski schools operate here; none confirmed.',
    shabbatNotes: null,
    apresLevel: 2,
    familyScore: 1,
    israeliGatewayAirports: ['TBS', 'KUT'],
    provenance: { ...SAMPLE_PROV, verification: 'unverified' },
  },
  {
    skiAreaId: 'sample-bansko',
    kosherAvailability: null,
    kosherNotes: 'Reported kosher options in Bansko town. Not checked.',
    chabadDistanceKm: 160,
    chabadName: 'Chabad of Bulgaria (Sofia)',
    hebrewSkiSchool: null,
    hebrewSkiSchoolNotes: null,
    shabbatNotes: null,
    apresLevel: 3,
    familyScore: 2,
    israeliGatewayAirports: ['SOF'],
    provenance: { ...SAMPLE_PROV, verification: 'unverified' },
  },
  {
    skiAreaId: 'sample-val-gardena',
    kosherAvailability: null,
    kosherNotes: null,
    chabadDistanceKm: null,
    chabadName: null,
    hebrewSkiSchool: null,
    hebrewSkiSchoolNotes: null,
    shabbatNotes: null,
    apresLevel: 2,
    familyScore: 3,
    israeliGatewayAirports: ['VCE', 'VRN'],
    provenance: { ...SAMPLE_PROV, verification: 'stale' },
  },
];

export const SAMPLE_APRES: ApresProxy[] = [
  { skiAreaId: 'sample-bansko', barCount: 48, restaurantCount: 120, nightclubCount: 9, densityScore: 0.92, provenance: { ...SAMPLE_PROV, source: 'openstreetmap' } },
  { skiAreaId: 'sample-borovets', barCount: 22, restaurantCount: 55, nightclubCount: 4, densityScore: 0.61, provenance: { ...SAMPLE_PROV, source: 'openstreetmap' } },
  { skiAreaId: 'sample-gudauri', barCount: 11, restaurantCount: 34, nightclubCount: 2, densityScore: 0.38, provenance: { ...SAMPLE_PROV, source: 'openstreetmap' } },
  { skiAreaId: 'sample-livigno', barCount: 40, restaurantCount: 95, nightclubCount: 5, densityScore: 0.78, provenance: { ...SAMPLE_PROV, source: 'openstreetmap' } },
  { skiAreaId: 'sample-val-gardena', barCount: 30, restaurantCount: 110, nightclubCount: 3, densityScore: 0.66, provenance: { ...SAMPLE_PROV, source: 'openstreetmap' } },
  { skiAreaId: 'sample-alta-badia', barCount: 18, restaurantCount: 80, nightclubCount: 1, densityScore: 0.44, provenance: { ...SAMPLE_PROV, source: 'openstreetmap' } },
  { skiAreaId: 'sample-sestriere', barCount: 16, restaurantCount: 45, nightclubCount: 2, densityScore: 0.4, provenance: { ...SAMPLE_PROV, source: 'openstreetmap' } },
];

export const SAMPLE_PASS_PRICES: PassPrice[] = [
  { passRegionId: null, skiAreaId: 'sample-gudauri', season: '2026/27', category: 'adult', duration: '1day', price: 35, currency: 'EUR', isDynamic: false, provenance: SAMPLE_PROV },
  { passRegionId: null, skiAreaId: 'sample-bansko', season: '2026/27', category: 'adult', duration: '1day', price: 60, currency: 'EUR', isDynamic: false, provenance: SAMPLE_PROV },
  { passRegionId: null, skiAreaId: 'sample-borovets', season: '2026/27', category: 'adult', duration: '1day', price: 55, currency: 'EUR', isDynamic: false, provenance: SAMPLE_PROV },
  { passRegionId: null, skiAreaId: 'sample-pamporovo', season: '2026/27', category: 'adult', duration: '1day', price: 48, currency: 'EUR', isDynamic: false, provenance: SAMPLE_PROV },
  { passRegionId: 'sample-dolomiti-superski', skiAreaId: null, season: '2026/27', category: 'adult', duration: '1day', price: 82, currency: 'EUR', isDynamic: true, provenance: SAMPLE_PROV },
  { passRegionId: 'sample-via-lattea', skiAreaId: null, season: '2026/27', category: 'adult', duration: '1day', price: 49, currency: 'EUR', isDynamic: true, provenance: SAMPLE_PROV },
  { passRegionId: null, skiAreaId: 'sample-livigno', season: '2026/27', category: 'adult', duration: '1day', price: 62, currency: 'EUR', isDynamic: false, provenance: SAMPLE_PROV },
  { passRegionId: null, skiAreaId: 'sample-madonna-di-campiglio', season: '2026/27', category: 'adult', duration: '1day', price: 72, currency: 'EUR', isDynamic: true, provenance: SAMPLE_PROV },
];
