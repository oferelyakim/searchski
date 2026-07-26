/**
 * Deterministic natural-language -> SearchCriteria parser.
 *
 * This is the Stage-3 LLM's FALLBACK, and it must work standalone: with no
 * ANTHROPIC_API_KEY, no network and no budget, typing "cheap beginner resort in
 * Bulgaria with night skiing" still has to produce a usable search. When the
 * LLM is available it produces the same `SearchCriteria` shape and the same
 * scorer runs — the LLM parses and explains, it never ranks.
 *
 * Design rules:
 *   - Recall over precision. A missed keyword costs a slightly worse ranking;
 *     a hallucinated one changes the answer. So every pattern here is a literal
 *     the user could plausibly have typed, never an inference.
 *   - English and Hebrew, in one pass. Hebrew is matched by substring rather
 *     than word boundary because Hebrew glues its prepositions on: "בבולגריה"
 *     ("in Bulgaria") contains "בולגריה".
 *   - Pure. No I/O, no clock, no randomness.
 */

import type { Ability, SearchCriteria } from './types.js';

// ---------------------------------------------------------------------------
// Documented defaults. These are guesses, and they are all stated here rather
// than hidden in the matching code, because every one of them is arguable.
// ---------------------------------------------------------------------------

/** "cheap" / "זול" with no number attached: EUR per adult lift-pass day. */
export const CHEAP_PASS_EUR_PER_DAY = 45;
/** "near a Chabad house" with no number: km. Generous, because a Chabad house
 *  in the nearest city is normal for Bansko (Sofia) and Gudauri (Tbilisi). */
export const DEFAULT_CHABAD_RADIUS_KM = 200;
/** "high altitude" with no number: metres at the top station. */
export const HIGH_ALTITUDE_TOP_M = 2500;
/** "glacier": metres at the top station. */
export const GLACIER_TOP_M = 2800;
/** "big area" with no number: km of piste. */
export const BIG_AREA_MIN_KM = 100;
/**
 * A bare money amount with no "per day": is "under 300" a day ticket or a
 * week's pass? Amounts up to this are read as per-day; larger amounts are read
 * as a 6-day pass and divided by 6. Crude, documented, and easy to override
 * once real query logs exist.
 */
export const BARE_AMOUNT_PER_DAY_CEILING = 150;
export const ASSUMED_TRIP_DAYS = 6;

// ---------------------------------------------------------------------------
// Lexicons
// ---------------------------------------------------------------------------

interface CountryEntry {
  iso: string;
  /** Lower-cased Latin substrings. */
  latin: string[];
  /** Hebrew substrings, matched as-is. */
  hebrew: string[];
}

/**
 * The five countries the Israeli ski market actually books, plus the obvious
 * neighbours so a query naming Switzerland is not silently dropped. Hebrew
 * names are mandatory for the five in PLAN.md section 11.
 */
const COUNTRIES: readonly CountryEntry[] = [
  { iso: 'GE', latin: ['georgia', 'georgian', 'gudauri', 'bakuriani', 'tbilisi', 'caucasus'], hebrew: ['גאורגיה', 'גיאורגיה', 'גורג׳יה', "גורג'יה", 'גודאורי'] },
  { iso: 'BG', latin: ['bulgaria', 'bulgarian', 'bansko', 'borovets', 'pamporovo', 'sofia'], hebrew: ['בולגריה', 'בנסקו', 'בורובץ', 'סופיה'] },
  { iso: 'IT', latin: ['italy', 'italian', 'italia', 'dolomites', 'dolomiti', 'sudtirol', 'south tyrol'], hebrew: ['איטליה', 'דולומיטים', 'דולומיטי'] },
  { iso: 'AT', latin: ['austria', 'austrian', 'osterreich', 'österreich', 'tyrol', 'tirol', 'salzburg'], hebrew: ['אוסטריה', 'טירול'] },
  { iso: 'FR', latin: ['france', 'french', 'alpe d', 'trois vallees', 'three valleys', 'tarentaise'], hebrew: ['צרפת', 'האלפים הצרפתיים'] },
  { iso: 'CH', latin: ['switzerland', 'swiss', 'schweiz', 'suisse'], hebrew: ['שוויץ', 'שווייץ'] },
  { iso: 'DE', latin: ['germany', 'german', 'deutschland', 'bavaria', 'bayern'], hebrew: ['גרמניה'] },
  { iso: 'ES', latin: ['spain', 'spanish', 'espana', 'españa', 'pyrenees'], hebrew: ['ספרד'] },
  { iso: 'AD', latin: ['andorra'], hebrew: ['אנדורה'] },
  { iso: 'SI', latin: ['slovenia', 'slovenian'], hebrew: ['סלובניה'] },
  { iso: 'SK', latin: ['slovakia', 'slovakian'], hebrew: ['סלובקיה'] },
  { iso: 'CZ', latin: ['czech', 'czechia'], hebrew: ['צכיה', "צ'כיה"] },
  { iso: 'PL', latin: ['poland', 'polish', 'zakopane'], hebrew: ['פולין'] },
  { iso: 'RO', latin: ['romania', 'romanian'], hebrew: ['רומניה'] },
  { iso: 'TR', latin: ['turkey', 'turkish', 'erciyes', 'palandoken'], hebrew: ['טורקיה'] },
  { iso: 'GR', latin: ['greece', 'greek'], hebrew: ['יוון'] },
  { iso: 'NO', latin: ['norway', 'norwegian'], hebrew: ['נורבגיה'] },
  { iso: 'SE', latin: ['sweden', 'swedish'], hebrew: ['שבדיה'] },
  { iso: 'FI', latin: ['finland', 'finnish', 'lapland'], hebrew: ['פינלנד'] },
  { iso: 'JP', latin: ['japan', 'japanese', 'hokkaido', 'niseko'], hebrew: ['יפן'] },
  { iso: 'US', latin: ['colorado', 'utah', 'united states'], hebrew: ["ארה״ב", 'ארהב'] },
  { iso: 'CA', latin: ['canada', 'canadian', 'whistler'], hebrew: ['קנדה'] },
];

/** ISO codes we accept as a bare uppercase token, e.g. "IT", "GE". */
const ISO_TOKENS = new Set(COUNTRIES.map((c) => c.iso));

/** Airport hints, so "4 hours from Sofia" becomes an origin plus a limit. */
const AIRPORTS: ReadonlyArray<{ iata: string; terms: string[]; hebrew: string[] }> = [
  { iata: 'SOF', terms: ['sofia'], hebrew: ['סופיה'] },
  { iata: 'PDV', terms: ['plovdiv'], hebrew: ['פלובדיב'] },
  { iata: 'TBS', terms: ['tbilisi'], hebrew: ['טביליסי'] },
  { iata: 'KUT', terms: ['kutaisi'], hebrew: ['קוטאיסי'] },
  { iata: 'VCE', terms: ['venice', 'venezia'], hebrew: ['ונציה'] },
  { iata: 'VRN', terms: ['verona'], hebrew: ['ורונה'] },
  { iata: 'MXP', terms: ['milan', 'milano', 'malpensa'], hebrew: ['מילאנו', 'מילנו'] },
  { iata: 'TRN', terms: ['turin', 'torino'], hebrew: ['טורינו'] },
  { iata: 'INN', terms: ['innsbruck'], hebrew: ['אינסברוק'] },
  { iata: 'SZG', terms: ['salzburg'], hebrew: ['זלצבורג'] },
  { iata: 'VIE', terms: ['vienna', 'wien'], hebrew: ['וינה'] },
  { iata: 'GVA', terms: ['geneva', 'geneve', 'genève'], hebrew: ['ז׳נבה', "ז'נבה", 'ג׳נבה'] },
  { iata: 'LYS', terms: ['lyon'], hebrew: ['ליון'] },
  { iata: 'GNB', terms: ['grenoble'], hebrew: ['גרנובל'] },
  { iata: 'TLV', terms: ['tel aviv', 'ben gurion'], hebrew: ['תל אביב', 'בן גוריון'] },
];

interface AbilityEntry {
  ability: Ability;
  latin: RegExp[];
  hebrew: string[];
}

/**
 * Order matters: the more specific phrase must win. "first timer" must not be
 * swallowed by "beginner", and "nervous intermediate" must not be read as two
 * separate abilities.
 */
const ABILITIES: readonly AbilityEntry[] = [
  {
    ability: 'first_timer',
    latin: [/first[-\s]?time(?:r|rs)?/i, /never (?:skied|been skiing|on skis)/i, /complete beginner/i, /absolute beginner/i, /learn(?:ing)? to ski/i, /total beginner/i],
    hebrew: ['פעם ראשונה', 'מעולם לא', 'מתחיל לגמרי', 'ללמוד לסקי', 'לומדים לסקי', 'ראשון על מגלשיים'],
  },
  {
    ability: 'expert',
    latin: [/\bexperts?\b/i, /off[-\s]?piste/i, /free[-\s]?ride/i, /black runs?/i, /steep and deep/i, /couloir/i, /ski touring/i],
    hebrew: ['מומחה', 'מומחים', 'אקספרט', 'אוף פיסט', 'פרירייד', 'מסלולים שחורים', 'סקי אקסטרים', 'אקסטרים'],
  },
  {
    ability: 'advanced',
    latin: [/\badvanced\b/i, /strong skiers?/i, /red and black/i, /confident skiers?/i],
    hebrew: ['מתקדם', 'מתקדמים', 'סקייארים חזקים'],
  },
  {
    ability: 'intermediate',
    latin: [/nervous intermediate/i, /cautious intermediate/i, /timid intermediate/i, /\bintermediates?\b/i, /blue and red/i, /red runs?/i, /cruis(?:y|ing)/i],
    hebrew: ['בינוני', 'בינוניים', 'רמה בינונית', 'מסלולים אדומים', 'מסלולים כחולים'],
  },
  {
    ability: 'beginner',
    latin: [/\bbeginners?\b/i, /\bnovices?\b/i, /green runs?/i, /just started/i, /second season/i, /easy slopes?/i],
    hebrew: ['מתחיל', 'מתחילים', 'מתחילות', 'מסלולים ירוקים', 'רמה מתחילה'],
  },
];

// ---------------------------------------------------------------------------
// Matching helpers
// ---------------------------------------------------------------------------

/**
 * Fold the query to a comparable Latin form: lower-cased, accents stripped,
 * punctuation flattened to spaces. Hebrew is left alone (NFC-normalised only)
 * and matched against the raw string.
 */
function foldLatin(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[_/\\|,;:!?()[\]{}"“”]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function hasAny(haystack: string, needles: readonly string[]): boolean {
  return needles.some((n) => n.length > 0 && haystack.includes(n));
}

function anyRegex(text: string, patterns: readonly RegExp[]): boolean {
  return patterns.some((p) => p.test(text));
}

/** Both scripts, one call. */
function matches(latinText: string, rawText: string, latin: readonly string[], hebrew: readonly string[]): boolean {
  return hasAny(latinText, latin) || hasAny(rawText, hebrew);
}

// ---------------------------------------------------------------------------
// Sub-parsers
// ---------------------------------------------------------------------------

function parseCountries(latin: string, raw: string): string[] {
  const found = new Set<string>();
  for (const c of COUNTRIES) {
    if (matches(latin, raw, c.latin, c.hebrew)) found.add(c.iso);
  }
  // Bare uppercase ISO tokens, checked against the ORIGINAL casing so the
  // English word "it" never becomes Italy.
  for (const m of raw.matchAll(/\b([A-Z]{2})\b/g)) {
    const code = m[1]!;
    if (ISO_TOKENS.has(code)) found.add(code);
  }
  return [...found].sort();
}

/** Blank out a span so a later, less specific pattern cannot match it again. */
function mask(text: string, start: number, length: number): string {
  return text.slice(0, start) + ' '.repeat(length) + text.slice(start + length);
}

function parseAbilities(latinIn: string, rawIn: string): { ability?: Ability; groupAbilities?: Ability[] } {
  // ABILITIES is ordered most-specific first, and each match CONSUMES its span.
  // Without this, "complete beginner" matches first_timer and then matches
  // /\bbeginners?\b/ as well, and one person turns into a mixed group.
  let latin = latinIn;
  let raw = rawIn;
  const found: Ability[] = [];

  for (const entry of ABILITIES) {
    let hit = false;
    for (const pattern of entry.latin) {
      const p = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`);
      let m: RegExpExecArray | null;
      const spans: Array<[number, number]> = [];
      while ((m = p.exec(latin)) !== null) {
        spans.push([m.index, m[0].length]);
        if (m[0].length === 0) p.lastIndex += 1;
      }
      for (const [start, len] of spans.reverse()) latin = mask(latin, start, len);
      if (spans.length > 0) hit = true;
    }
    for (const term of entry.hebrew) {
      let idx = raw.indexOf(term);
      while (idx !== -1) {
        raw = mask(raw, idx, term.length);
        hit = true;
        idx = raw.indexOf(term);
      }
    }
    if (hit && !found.includes(entry.ability)) found.push(entry.ability);
  }

  if (found.length === 0) return {};
  if (found.length === 1) return { ability: found[0]! };

  // Two or more distinct abilities in one sentence is a mixed group — the
  // single most common real-world case, and the one the scorer handles by
  // scoring the weakest member.
  const order: Ability[] = ['first_timer', 'beginner', 'intermediate', 'advanced', 'expert'];
  const group = order.filter((a) => found.includes(a));
  return { groupAbilities: group, ability: group[group.length - 1] };
}

interface MoneyHit {
  amount: number;
  perDay: boolean;
  currency?: string;
}

function parseMoney(latin: string, raw: string): MoneyHit | null {
  const perDay =
    /\b(?:per|a|each|\/)\s*day\b/.test(latin) ||
    /\bdaily\b/.test(latin) ||
    /\bper[-\s]?diem\b/.test(latin) ||
    raw.includes('ליום') ||
    raw.includes('ל יום');

  let currency: string | undefined;
  if (/[€]|\beur(?:o|os)?\b/.test(latin) || raw.includes('יורו') || raw.includes('אירו')) currency = 'EUR';
  else if (/[$]|\busd\b|\bdollars?\b/.test(latin) || raw.includes('דולר')) currency = 'USD';
  else if (/[₪]|\bils\b|\bnis\b|\bshekels?\b/.test(latin) || raw.includes('שקל') || raw.includes('ש"ח') || raw.includes('שח')) currency = 'ILS';

  /**
   * "under 4 hours from Sofia" and "under 100 km of piste" both look exactly
   * like "under 50 euros" to a naive money regex. Anything followed by a
   * duration, a distance or a headcount is not a price.
   */
  const NOT_MONEY = /^\s*(?:h\b|hr|hrs|hours?|min\b|mins|minutes?|sec|km\b|kilomet|m\b|metres?|meters?|days?\b|nights?|weeks?|people|persons?|pax|adults?|kids?|children|skiers?|%)/;
  const NOT_MONEY_HE = /^\s*(?:שע|דק|ק"?מ|קמ|קילומטר|מטר|ימים|יום|לילות|אנשים|ילדים)/;

  // Ordered from most explicit to least, so "under €50 a day" reads the 50 and
  // not some other number in the sentence.
  const patterns: RegExp[] = [
    /(?:under|below|less than|no more than|max(?:imum)?(?: of)?|up to|budget of|around)\s*[€$₪£]?\s*(\d{1,5})/g,
    /[€$₪£]\s*(\d{1,5})/g,
    /(\d{1,5})\s*(?:€|\$|₪|£|eur(?:os?)?|usd|dollars?|ils|nis|shekels?)/g,
  ];
  for (const p of patterns) {
    for (const m of latin.matchAll(p)) {
      if (m[1] == null) continue;
      const after = latin.slice(m.index + m[0].length, m.index + m[0].length + 14);
      if (NOT_MONEY.test(after)) continue;
      return { amount: Number(m[1]), perDay, currency };
    }
  }
  // Hebrew: "עד 60", "פחות מ-60", "מקסימום 60"
  for (const m of raw.matchAll(/(?:עד|פחות מ|מקסימום|תקציב של|בערך)\s*[-־]?\s*(\d{1,5})/g)) {
    if (m[1] == null) continue;
    const after = raw.slice(m.index + m[0].length, m.index + m[0].length + 14);
    if (NOT_MONEY_HE.test(after)) continue;
    return { amount: Number(m[1]), perDay, currency };
  }
  return null;
}

function parseKm(latin: string, raw: string): { minKm?: number; maxKm?: number } {
  const out: { minKm?: number; maxKm?: number } = {};

  // "100km+", "at least 100 km", "over 100km", "מעל 100 קמ"
  const plus = latin.match(/(\d{1,4})\s*(?:km|kilometers?|kilometres?)\s*\+/);
  const atLeast = latin.match(/(?:at least|over|more than|minimum(?: of)?|min|bigger than|from)\s*(\d{1,4})\s*(?:km|kilometers?|kilometres?)/);
  const hebMin = raw.match(/(?:מעל|לפחות|יותר מ)\s*[-־]?\s*(\d{1,4})\s*(?:ק"?מ|קמ|קילומטר)/);
  const plainKm = latin.match(/(\d{1,4})\s*(?:km|kilometers?|kilometres?)\b(?!\s*(?:from|away|transfer|drive))/);
  const under = latin.match(/(?:under|less than|below|max(?:imum)?(?: of)?|up to)\s*(\d{1,4})\s*(?:km|kilometers?|kilometres?)/);
  const hebMax = raw.match(/(?:עד|פחות מ)\s*[-־]?\s*(\d{1,4})\s*(?:ק"?מ|קמ|קילומטר)/);

  if (plus?.[1]) out.minKm = Number(plus[1]);
  else if (atLeast?.[1]) out.minKm = Number(atLeast[1]);
  else if (hebMin?.[1]) out.minKm = Number(hebMin[1]);

  if (under?.[1]) out.maxKm = Number(under[1]);
  else if (hebMax?.[1]) out.maxKm = Number(hebMax[1]);

  // A bare "150 km of pistes" with no comparator reads as a floor, because
  // nobody types a size to exclude bigger resorts.
  if (out.minKm == null && out.maxKm == null && plainKm?.[1]) out.minKm = Number(plainKm[1]);

  // "big ski area" / "אזור גדול"
  const bigWords = /\b(?:big|large|huge|vast|massive|extensive|enormous)\b[^.]{0,24}\b(?:area|resort|domain|terrain|mountain|ski)\b|\b(?:area|resort|domain|terrain)\b[^.]{0,12}\b(?:big|large|huge|vast|massive)\b|\bmega\b|\blots of (?:piste|terrain|skiing)\b|\bplenty of (?:piste|terrain|skiing)\b/;
  const bigHeb = ['אזור גדול', 'שטח גדול', 'הרבה מסלולים', 'אתר גדול', 'הרבה סקי'];
  if (out.minKm == null && (bigWords.test(latin) || hasAny(raw, bigHeb))) out.minKm = BIG_AREA_MIN_KM;

  return out;
}

function parseTransfer(latin: string, raw: string): { originAirport?: string; maxTransferMinutes?: number } {
  const out: { originAirport?: string; maxTransferMinutes?: number } = {};

  for (const a of AIRPORTS) {
    if (matches(latin, raw, a.terms, a.hebrew)) {
      out.originAirport = a.iata;
      break;
    }
  }
  const iata = raw.match(/\b([A-Z]{3})\b/g)?.find((c) => AIRPORTS.some((a) => a.iata === c));
  if (iata) out.originAirport = iata;

  const hours = latin.match(/(?:under|less than|within|max(?:imum)?(?: of)?|up to|no more than)?\s*(\d{1,2}(?:\.\d)?)\s*(?:h|hr|hrs|hours?)\b/);
  const mins = latin.match(/(?:under|less than|within|max(?:imum)?(?: of)?|up to|no more than)\s*(\d{1,3})\s*(?:min|mins|minutes?)\b/);
  const hebHours = raw.match(/(?:עד|פחות מ|תוך)\s*[-־]?\s*(\d{1,2})\s*(?:שעות|שעה)/);

  if (hours?.[1]) out.maxTransferMinutes = Math.round(Number(hours[1]) * 60);
  else if (hebHours?.[1]) out.maxTransferMinutes = Number(hebHours[1]) * 60;
  else if (mins?.[1]) out.maxTransferMinutes = Number(mins[1]);

  // A duration only means "transfer" if the sentence is about getting there.
  if (out.maxTransferMinutes != null) {
    const aboutTravel =
      /\b(?:from|transfer|drive|driving|airport|away|journey|door to door)\b/.test(latin) ||
      hasAny(raw, ['נסיעה', 'העברה', 'שדה תעופה', 'מרחק', 'טרנספר']);
    if (!aboutTravel && out.originAirport == null) delete out.maxTransferMinutes;
  }
  // A limit with no named airport is still useful: the scorer falls back to the
  // shortest transfer it knows about for each resort.
  return out;
}

// ---------------------------------------------------------------------------
// The parser
// ---------------------------------------------------------------------------

/**
 * Turn free text into structured criteria. Never throws; an unparseable string
 * yields `{ rawQuery }`, which the scorer handles as "rank by the base
 * qualities" rather than as an error.
 */
export function parseQueryDeterministic(text: string): SearchCriteria {
  const raw = (text ?? '').normalize('NFC');
  const latin = foldLatin(raw);
  const criteria: SearchCriteria = { rawQuery: text };

  // --- who is skiing -------------------------------------------------------
  const abilities = parseAbilities(latin, raw);
  if (abilities.groupAbilities) {
    criteria.groupAbilities = abilities.groupAbilities;
  } else if (abilities.ability) {
    criteria.ability = abilities.ability;
  }

  // --- where ---------------------------------------------------------------
  const countries = parseCountries(latin, raw);
  if (countries.length > 0) criteria.countries = countries;

  // --- how big -------------------------------------------------------------
  const size = parseKm(latin, raw);
  if (size.minKm != null) criteria.minKm = size.minKm;
  if (size.maxKm != null) criteria.maxKm = size.maxKm;

  // --- booleans ------------------------------------------------------------
  if (
    matches(
      latin,
      raw,
      ['night ski', 'night-ski', 'night skiing', 'floodlit', 'flood lit', 'lit slopes', 'lit pistes', 'after dark', 'evening skiing', 'ski at night'],
      ['סקי לילה', 'סקי בלילה', 'מסלולים מוארים', 'תאורה בלילה', 'גלישת לילה'],
    )
  ) {
    criteria.wantNightSki = true;
  }

  if (
    matches(
      latin,
      raw,
      ['apres', 'apres-ski', 'apres ski', 'nightlife', 'night life', 'party', 'parties', 'partying', 'clubbing', 'nightclub', 'bars', 'lively', 'buzzing', 'drinking'],
      ['אפרה סקי', 'אפטר סקי', 'אפרה-סקי', 'חיי לילה', 'מסיבות', 'מסיבה', 'ברים', 'בילויים', 'תוסס'],
    )
  ) {
    criteria.wantApres = true;
  }

  if (
    matches(
      latin,
      raw,
      ['family', 'families', 'with kids', 'with children', 'my kids', 'toddler', 'child friendly', 'kid friendly', 'childcare', 'kindergarten'],
      ['משפחה', 'משפחות', 'משפחתי', 'עם ילדים', 'ילדים', 'פעוטות', 'גן ילדים'],
    )
  ) {
    criteria.wantFamily = true;
  }

  /*
   * "Quiet slopes" and "no lift queues" are DIFFERENT asks that pull the
   * ranking in opposite directions (see the capacityPerKm note in scoring.ts).
   * Route them apart. A query asking for both sets both — that is not a
   * contradiction to ask for, only to optimise simultaneously, and the weights
   * will trade them off honestly.
   */
  if (
    matches(
      latin,
      raw,
      ['uncrowded', 'not crowded', 'no crowds', 'quiet', 'peaceful', 'not busy', 'empty slopes', 'empty pistes', 'deserted', 'off the beaten track', 'away from the crowds'],
      ['לא עמוס', 'לא צפוף', 'שקט', 'מסלולים ריקים', 'פחות אנשים', 'בלי המונים'],
    )
  ) {
    criteria.wantUncrowded = true;
  }

  if (
    matches(
      latin,
      raw,
      ['no lift queues', 'no queues', 'short queues', 'no waiting', 'no queuing', 'no lift lines', 'short lift lines', 'short waits', 'fast lifts', 'modern lifts', 'no liftlines'],
      ['ללא תורים', 'בלי תורים', 'אין תורים', 'בלי להמתין', 'מעליות מהירות', 'תורים קצרים'],
    )
  ) {
    criteria.wantShortLiftQueues = true;
  }

  if (
    matches(
      latin,
      raw,
      ['snow sure', 'snow-sure', 'snowsure', 'guaranteed snow', 'reliable snow', 'good snow', 'snow reliability', 'high altitude', 'highest altitude', 'glacier', 'snow certainty'],
      ['שלג בטוח', 'שלג מובטח', 'שלג טוב', 'גובה רב', 'גבוה', 'קרחון', 'שלג מובטח'],
    )
  ) {
    criteria.wantSnowsure = true;
  }

  if (
    matches(
      latin,
      raw,
      ['ski in ski out', 'ski-in ski-out', 'ski in/ski out', 'ski in', 'slopeside', 'slope side', 'on the piste', 'doorstep skiing'],
      ['סקי אין סקי אאוט', 'צמוד למסלול', 'על המסלול', 'יציאה ישירה למסלול'],
    )
  ) {
    criteria.wantSkiInSkiOut = true;
  }

  // --- the Israel layer ----------------------------------------------------
  if (matches(latin, raw, ['kosher', 'kashrut', 'kosher food', 'glatt'], ['כשר', 'כשרות', 'אוכל כשר', 'גלאט'])) {
    criteria.wantKosher = true;
  }
  if (
    matches(
      latin,
      raw,
      ['hebrew ski school', 'hebrew speaking', 'hebrew-speaking', 'speaks hebrew', 'hebrew instructor', 'israeli instructor', 'lessons in hebrew'],
      ['בעברית', 'דובר עברית', 'דוברי עברית', 'מדריך ישראלי', 'בית ספר לסקי בעברית', 'שיעורים בעברית'],
    )
  ) {
    criteria.wantHebrewSkiSchool = true;
  }
  if (matches(latin, raw, ['chabad', 'habad', 'beit chabad', 'synagogue', 'shul', 'minyan', 'shabbat', 'shabbos'], ['חב"ד', 'חבד', 'בית חב"ד', 'בית כנסת', 'מניין', 'שבת'])) {
    criteria.maxChabadDistanceKm = DEFAULT_CHABAD_RADIUS_KM;
  }

  // --- altitude / vertical -------------------------------------------------
  if (matches(latin, raw, ['glacier', 'glacial skiing'], ['קרחון'])) {
    criteria.minTopElevM = GLACIER_TOP_M;
  } else if (matches(latin, raw, ['high altitude', 'highest altitude', 'very high', 'high up', 'altitude'], ['גובה רב', 'גובה גבוה', 'הכי גבוה'])) {
    criteria.minTopElevM = HIGH_ALTITUDE_TOP_M;
  }
  const explicitTop = latin.match(/(?:above|over|at least|higher than)\s*(\d{3,4})\s*(?:m|metres?|meters?)\b/);
  if (explicitTop?.[1]) criteria.minTopElevM = Number(explicitTop[1]);

  const vertical = latin.match(/(\d{3,4})\s*(?:m|metres?|meters?)\s*(?:of\s*)?vertical|vertical\s*(?:drop\s*)?(?:of\s*)?(\d{3,4})\s*(?:m|metres?|meters?)/);
  if (vertical) {
    const v = vertical[1] ?? vertical[2];
    if (v) criteria.minVerticalM = Number(v);
  }

  // --- travel --------------------------------------------------------------
  const transfer = parseTransfer(latin, raw);
  if (transfer.originAirport) criteria.originAirport = transfer.originAirport;
  if (transfer.maxTransferMinutes != null) criteria.maxTransferMinutes = transfer.maxTransferMinutes;

  // --- budget --------------------------------------------------------------
  const money = parseMoney(latin, raw);
  const saysCheap = matches(
    latin,
    raw,
    ['cheap', 'cheapest', 'budget', 'affordable', 'inexpensive', 'low cost', 'good value', 'not expensive'],
    ['זול', 'בזול', 'זולה', 'תקציב', 'משתלם', 'לא יקר'],
  );
  if (money) {
    if (money.currency) criteria.currency = money.currency;
    criteria.maxPassPricePerDay = money.perDay
      ? money.amount
      : money.amount <= BARE_AMOUNT_PER_DAY_CEILING
        ? money.amount
        : Math.round(money.amount / ASSUMED_TRIP_DAYS);
  } else if (saysCheap) {
    criteria.maxPassPricePerDay = CHEAP_PASS_EUR_PER_DAY;
    criteria.currency = 'EUR';
  }

  return criteria;
}

/**
 * A short, plain sentence describing what we understood. Shown under the search
 * box so a mis-parse is visible and correctable rather than mysterious.
 */
export function describeCriteria(c: SearchCriteria): string {
  const bits: string[] = [];
  if (c.groupAbilities?.length) bits.push(`a mixed group (${c.groupAbilities.join(', ').replace(/_/g, ' ')})`);
  else if (c.ability) bits.push(`${c.ability.replace(/_/g, ' ')} level`);
  if (c.countries?.length) bits.push(`in ${c.countries.join(', ')}`);
  if (c.minKm != null) bits.push(`at least ${c.minKm} km of piste`);
  if (c.maxKm != null) bits.push(`no more than ${c.maxKm} km of piste`);
  if (c.minTopElevM != null) bits.push(`topping out above ${c.minTopElevM} m`);
  if (c.minVerticalM != null) bits.push(`at least ${c.minVerticalM} m vertical`);
  if (c.wantNightSki) bits.push('night skiing');
  if (c.wantApres) bits.push('nightlife');
  if (c.wantFamily) bits.push('somewhere good for families');
  if (c.wantUncrowded) bits.push('quiet slopes');
  if (c.wantShortLiftQueues) bits.push('short lift queues');
  if (c.wantSnowsure) bits.push('reliable snow');
  if (c.wantSkiInSkiOut) bits.push('ski-in ski-out lodging');
  if (c.wantKosher) bits.push('kosher food');
  if (c.wantHebrewSkiSchool) bits.push('a Hebrew-speaking ski school');
  if (c.maxChabadDistanceKm != null) bits.push(`a Chabad house within ${c.maxChabadDistanceKm} km`);
  if (c.maxTransferMinutes != null) {
    bits.push(`within ${Math.round(c.maxTransferMinutes / 60)}h of ${c.originAirport ?? 'an airport'}`);
  } else if (c.originAirport) {
    bits.push(`flying via ${c.originAirport}`);
  }
  if (c.maxPassPricePerDay != null) bits.push(`a lift pass under ${c.maxPassPricePerDay} ${c.currency ?? 'EUR'} a day`);
  return bits.length > 0 ? `Looking for ${bits.join(', ')}.` : 'No specific requirements picked up — showing the strongest all-round resorts.';
}
