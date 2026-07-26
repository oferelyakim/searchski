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
 *   - Pure. No I/O, no randomness, and NO HIDDEN CLOCK.
 *
 * That last point used to read "no clock" full stop, and dates changed it.
 * "February" cannot be resolved to a year without knowing what today is, so the
 * clock is now a PARAMETER (`opts.today`) with a documented default, never a
 * bare `new Date()` buried in a matching rule. The seam is the whole point: a
 * golden suite whose expected output changes when February arrives is not a
 * regression test, it is a calendar. Every test in this repo injects a pinned
 * `today`; production passes nothing and gets the system clock.
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

/**
 * A trip with a stated start but no stated length: nights. A European ski
 * holiday is sold by the week, so "I'm going in February" is a week unless the
 * user said otherwise. `dateTo - dateFrom` is the night count, so seven nights
 * is 1 Feb -> 8 Feb.
 */
export const DEFAULT_TRIP_NIGHTS = 7;
/** "long weekend": Thursday night through Sunday night. */
export const LONG_WEEKEND_NIGHTS = 3;
/** "weekend": Friday night through Sunday night. Resorts are in Europe, so
 *  Fri–Sun rather than the Israeli Thu–Sat. */
export const WEEKEND_NIGHTS = 2;
/**
 * Longest trip we will read out of free text. A longer span is a misparse, not
 * a holiday, and we fall back to the default rather than emit it.
 */
export const MAX_TRIP_NIGHTS = 90;

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
// When — trip dates
// ---------------------------------------------------------------------------

/**
 * ===========================================================================
 * THE YEAR PROBLEM
 * ===========================================================================
 * "February" carries no year, and the naive reading — "February of the current
 * calendar year" — is wrong for half the year. Asked in October it means the
 * February four months away, which is NEXT calendar year. Asked in March it
 * means the February eleven months away, which is also next calendar year. Only
 * between January and February does the current year happen to be right.
 *
 * The rule, applied everywhere below: RESOLVE FORWARD. A month, or a day in a
 * month, always becomes the next occurrence that has not already started. The
 * one refinement is the month you are standing in: on 15 January, "a week in
 * January" means the rest of this month, not a booking eleven and a half months
 * out, so a month still in progress anchors on today instead of rolling a year.
 *
 * All arithmetic is UTC. A local-midnight `Date` would make the same query
 * resolve differently in Tel Aviv and in Vancouver, and the ranking has to be
 * reproducible everywhere.
 */

const MS_PER_DAY = 86_400_000;

/** Months, 0-based, that are roughly the northern-hemisphere ski season. */
const NORTHERN_SEASON_MONTHS: ReadonlySet<number> = new Set([10, 11, 0, 1, 2, 3]);

/** Midnight UTC on the day this `Date` falls in. */
function utcDay(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function isoDay(ms: number): string {
  const d = new Date(ms);
  const m = `${d.getUTCMonth() + 1}`.padStart(2, '0');
  const day = `${d.getUTCDate()}`.padStart(2, '0');
  return `${d.getUTCFullYear()}-${m}-${day}`;
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

/** Day-of-week 0..6 (Sunday = 0) on or after `todayMs`; today counts. */
function comingDow(todayMs: number, dow: number): number {
  const delta = (dow - new Date(todayMs).getUTCDay() + 7) % 7;
  return todayMs + delta * MS_PER_DAY;
}

/** Day-of-week strictly after `todayMs`. */
function nextDow(todayMs: number, dow: number): number {
  const delta = (dow - new Date(todayMs).getUTCDay() + 7) % 7;
  return todayMs + (delta === 0 ? 7 : delta) * MS_PER_DAY;
}

export interface DateWindow {
  /** ISO YYYY-MM-DD, the night you arrive. */
  dateFrom: string;
  /** ISO YYYY-MM-DD, the morning you leave. */
  dateTo: string;
}

function windowOf(fromMs: number, nights: number): DateWindow {
  const n = Math.min(Math.max(Math.round(nights), 1), MAX_TRIP_NIGHTS);
  return { dateFrom: isoDay(fromMs), dateTo: isoDay(fromMs + n * MS_PER_DAY) };
}

/**
 * Is any part of this window inside the northern-hemisphere season?
 *
 * A ski trip that resolved into July is almost certainly a misparse. We report
 * that (see `describeCriteria`) and we DO NOT correct it: silently shifting a
 * date the user typed is how you put somebody on a plane in the wrong month.
 * Nor is it a filter — southern-hemisphere and glacier skiing are real.
 */
export function isNorthernSkiSeason(dateFrom: string, dateTo: string): boolean {
  const from = Date.parse(`${dateFrom}T00:00:00Z`);
  const to = Date.parse(`${dateTo}T00:00:00Z`);
  if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) return false;
  let ms = from;
  for (let step = 0; step < 400 && ms <= to; step += 1) {
    if (NORTHERN_SEASON_MONTHS.has(new Date(ms).getUTCMonth())) return true;
    ms += MS_PER_DAY;
  }
  return NORTHERN_SEASON_MONTHS.has(new Date(to).getUTCMonth());
}

// --- month lexicon ---------------------------------------------------------

const MONTH_BY_PREFIX: Readonly<Record<string, number>> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

function monthFromToken(token: string): number | null {
  return MONTH_BY_PREFIX[token.slice(0, 3).toLowerCase()] ?? null;
}

/**
 * "may" is deliberately absent from the BARE month alternation. Every other
 * month name is unambiguous in English, but "we may want night skiing" is not a
 * date, and a hallucinated May is worse than a missing one. It is accepted with
 * a day number beside it ("14 may"), or behind an explicit preposition
 * ("in may") — see MONTH_BARE_RE below.
 */
const MONTH_SRC = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
const MONTH_SRC_NO_MAY = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
/** Ordinal suffix on a day number: "14th", "1st". */
const ORD = '(?:st|nd|rd|th)?';
/** Everything a user types between two halves of a range. */
const RANGE = '(?:\\s*(?:-|–|—|to|until|till|through|thru)\\s*)';

const ISO_RANGE_RE = new RegExp(`\\b(\\d{4})-(\\d{1,2})-(\\d{1,2})${RANGE}(\\d{4})-(\\d{1,2})-(\\d{1,2})\\b`);
const ISO_SINGLE_RE = /\b(\d{4})-(\d{1,2})-(\d{1,2})\b/;
/** "14 February to 21 February" */
const DAY_MONTH_RANGE_RE = new RegExp(`\\b(\\d{1,2})${ORD}\\s*(?:of\\s+)?${MONTH_SRC}${RANGE}(\\d{1,2})${ORD}\\s*(?:of\\s+)?${MONTH_SRC}\\b`);
/** "14–21 February" */
const DAYS_MONTH_RE = new RegExp(`\\b(\\d{1,2})${ORD}${RANGE}(\\d{1,2})${ORD}\\s*(?:of\\s+)?${MONTH_SRC}\\b`);
/** "Feb 14 to Feb 21" and "February 14–21" */
const MONTH_DAYS_RE = new RegExp(`\\b${MONTH_SRC}\\s*(\\d{1,2})${ORD}${RANGE}(?:${MONTH_SRC}\\s*)?(\\d{1,2})${ORD}\\b`);
/** "first week of March", "last week of January" */
const WEEK_OF_MONTH_RE = new RegExp(`\\b(first|1st|second|2nd|third|3rd|fourth|4th|last)\\s+week\\s+(?:of|in)\\s+(?:the\\s+)?${MONTH_SRC}\\b`);
/** "end of January", "early February", "mid-March" */
const PART_OF_MONTH_RE = new RegExp(`\\b(early|start of|beginning of|middle of|mid|late|end of)[\\s-]+(?:the\\s+)?${MONTH_SRC}\\b`);
/** "14 February" / "the 14th of February" */
const DAY_MONTH_RE = new RegExp(`\\b(\\d{1,2})${ORD}\\s*(?:of\\s+)?${MONTH_SRC}\\b`);
/** "February 14" */
const MONTH_DAY_RE = new RegExp(`\\b${MONTH_SRC}\\s+(\\d{1,2})${ORD}\\b`);
/** "in February" — the only form in which a bare "may" is accepted. */
const MONTH_PREPOSITION_RE = new RegExp(`\\b(?:in|during|for|over|around|about)\\s+(?:the\\s+)?${MONTH_SRC}\\b`);
const MONTH_BARE_RE = new RegExp(`\\b${MONTH_SRC_NO_MAY}\\b`);

// --- Hebrew ----------------------------------------------------------------

/**
 * Hebrew dates are handled by REWRITING them into the English the patterns
 * above already read, rather than by duplicating fourteen regexes in a second
 * script. Order matters and is longest-first: "סוף שבוע" (weekend) has to be
 * consumed before "שבוע" (week) and before "סוף" (end of), or "a long weekend
 * in March" becomes "the end of a week".
 *
 * Only the forms a Hebrew speaker would actually type are here: month names
 * with or without their glued preposition, week/weekend/fortnight, next week,
 * and beginning/middle/end of. This is deliberately narrower than the English
 * surface — an unparsed date is a missing filter, an invented one is a wrong
 * answer.
 */
const HEBREW_DATE_TERMS: ReadonlyArray<readonly [string, string]> = [
  ['סוף שבוע ארוך', ' long weekend '],
  ['סופש ארוך', ' long weekend '],
  ['סוף השבוע', ' weekend '],
  ['סוף שבוע', ' weekend '],
  ['סופש', ' weekend '],
  ['שבועיים', ' two weeks '],
  ['השבוע הבא', ' next week '],
  ['שבוע הבא', ' next week '],
  ['שבוע הקרוב', ' next week '],
  ['החודש הבא', ' next month '],
  ['חודש הבא', ' next month '],
  ['שבוע', ' week '],
  ['לילות', ' nights '],
  ['ימים', ' days '],
  ['תחילת', ' beginning of '],
  ['אמצע', ' mid '],
  ['סוף', ' end of '],
  ['עד', ' to '],
  ['במאי', ' in may '],
  ['ינואר', ' january '],
  ['פברואר', ' february '],
  ['מרץ', ' march '],
  ['מרס', ' march '],
  ['אפריל', ' april '],
  ['מאי', ' may '],
  ['יוני', ' june '],
  ['יולי', ' july '],
  ['אוגוסט', ' august '],
  ['ספטמבר', ' september '],
  ['אוקטובר', ' october '],
  ['נובמבר', ' november '],
  ['דצמבר', ' december '],
];

/** Single-letter Hebrew prefixes left stranded in front of a rewritten month. */
const STRANDED_HEBREW_PREFIX = new RegExp(`[בלמהוכש] +(?=${MONTH_SRC}\\b)`, 'g');

/**
 * The text the date patterns run against: the folded Latin form with Hebrew
 * date vocabulary rewritten into English. This is a SEPARATE copy — nothing
 * else in the parser sees it, so turning "ליום" ("per day") into "לday" here
 * cannot disturb the money parser reading the same sentence.
 */
function foldDateText(latin: string): string {
  let out = latin;
  for (const [he, en] of HEBREW_DATE_TERMS) {
    if (out.includes(he)) out = out.split(he).join(en);
  }
  return out.replace(STRANDED_HEBREW_PREFIX, '').replace(/\s+/g, ' ').trim();
}

// --- durations -------------------------------------------------------------

/**
 * How many nights, if the text says. A stated number of DAYS is read as that
 * many nights, matching how the trip is sold ("7 days / 7 nights") and matching
 * the "a week = 7 nights" default above. Arguable, documented, one place to
 * change.
 */
function parseNights(t: string): number | null {
  const explicit = t.match(/\b(\d{1,3})\s*nights?\b/) ?? t.match(/\b(\d{1,3})\s*days?\b/);
  if (explicit?.[1] != null) return Number(explicit[1]);
  const weeks = t.match(/\b(\d{1,2})\s*weeks?\b/);
  if (weeks?.[1] != null) return Number(weeks[1]) * 7;
  if (/\b(?:two weeks|fortnight)\b/.test(t)) return 14;
  if (/\blong weekend\b/.test(t)) return LONG_WEEKEND_NIGHTS;
  if (/\bweekend\b/.test(t)) return WEEKEND_NIGHTS;
  if (/\bweeks?\b/.test(t)) return 7;
  return null;
}

// --- forward resolution ----------------------------------------------------

/**
 * A written-out ISO date, only if it is a real one.
 *
 * `Date.UTC(9999, 98, 99)` cheerfully returns a day in the year 10007 rather
 * than failing, so "9999-99-99" would otherwise become a booking window a
 * geological era from now. Anything that is not a genuine calendar day is
 * rejected here and the text falls through to the later, fuzzier patterns.
 */
function isoToMs(year: number, month1: number, day: number): number | null {
  if (!(year >= 1970 && year <= 2100)) return null;
  if (!(month1 >= 1 && month1 <= 12)) return null;
  if (!(day >= 1 && day <= daysInMonth(year, month1 - 1))) return null;
  return Date.UTC(year, month1 - 1, day);
}

/** The next occurrence of this day-of-month that has not already passed. */
function resolveDayInMonth(todayMs: number, month: number, day: number): number {
  const y0 = new Date(todayMs).getUTCFullYear();
  for (let y = y0; y <= y0 + 1; y += 1) {
    const ms = Date.UTC(y, month, Math.min(Math.max(day, 1), daysInMonth(y, month)));
    if (ms >= todayMs) return ms;
  }
  const y = y0 + 1;
  return Date.UTC(y, month, Math.min(Math.max(day, 1), daysInMonth(y, month)));
}

type MonthPosition = 'start' | 'mid' | 'end' | 'week1' | 'week2' | 'week3' | 'week4' | 'lastWeek';

/**
 * Where in the month a phrase points. "end of January" anchors the window's
 * END on the 31st rather than its start on some arbitrary day, so it means the
 * end of January whether the trip is a long weekend or a fortnight.
 */
function startDayFor(year: number, month: number, nights: number, position: MonthPosition): number {
  const dim = daysInMonth(year, month);
  const clamp = (d: number): number => Math.min(Math.max(d, 1), dim);
  switch (position) {
    case 'start':
      return 1;
    case 'mid':
      return clamp(15 - Math.floor(nights / 2));
    case 'end':
      return clamp(dim - nights);
    case 'week1':
      return 1;
    case 'week2':
      return clamp(8);
    case 'week3':
      return clamp(15);
    case 'week4':
      return clamp(22);
    case 'lastWeek':
      return clamp(dim - 6);
  }
}

/**
 * Resolve a month reference forward. See THE YEAR PROBLEM above: pick the first
 * year in which the window has not already started, and let a month that is
 * still in progress anchor on today rather than skipping a whole year.
 */
function resolveMonthWindow(todayMs: number, month: number, nights: number, position: MonthPosition): DateWindow {
  const y0 = new Date(todayMs).getUTCFullYear();
  for (let y = y0; y <= y0 + 1; y += 1) {
    let from = Date.UTC(y, month, startDayFor(y, month, nights, position));
    const monthEnd = Date.UTC(y, month, daysInMonth(y, month));
    if (from < todayMs && todayMs <= monthEnd) from = todayMs;
    if (from >= todayMs) return windowOf(from, nights);
  }
  const y = y0 + 1;
  return windowOf(Date.UTC(y, month, startDayFor(y, month, nights, position)), nights);
}

/** An explicit day-to-day range, resolved forward on its START. */
function rangeWindow(
  todayMs: number,
  startMonth: number,
  startDay: number,
  endMonth: number,
  endDay: number,
): DateWindow {
  const from = resolveDayInMonth(todayMs, startMonth, startDay);
  const fromYear = new Date(from).getUTCFullYear();
  // "28 December to 4 January" crosses the year; a later month index does not.
  const toYear = endMonth < startMonth ? fromYear + 1 : fromYear;
  const to = Date.UTC(toYear, endMonth, Math.min(Math.max(endDay, 1), daysInMonth(toYear, endMonth)));
  const nights = Math.round((to - from) / MS_PER_DAY);
  // A backwards or absurd range is a misparse of the second half, not a
  // 300-night trip. Keep the start we are confident about, default the length.
  if (nights < 1 || nights > MAX_TRIP_NIGHTS) return windowOf(from, DEFAULT_TRIP_NIGHTS);
  return windowOf(from, nights);
}

// --- the date parser -------------------------------------------------------

/**
 * Pull a trip window out of the text, or return null. Ordered most explicit
 * first, and a NAMED MONTH always beats a relative phrase: "a long weekend in
 * March" is March, not the coming Friday.
 */
function parseDates(t: string, todayMs: number): DateWindow | null {
  /*
   * "in 3 weeks" is an OFFSET, not a length: it says when the trip starts and
   * nothing about how long it lasts. Reading it as both gave a three-week
   * holiday starting three weeks out. So the offset phrase is masked out of the
   * text before the duration is read, and "in 3 weeks for 5 nights" still gets
   * both halves right.
   */
  const offset = t.match(/\bin\s+(\d{1,2})\s+(weeks?|days?)\b/);
  const stated = parseNights(offset?.[0] != null ? t.replace(offset[0], ' ') : t);
  const nights = stated != null ? Math.min(Math.max(stated, 1), MAX_TRIP_NIGHTS) : DEFAULT_TRIP_NIGHTS;

  // 1. "2027-02-14 to 2027-02-21" — a fully-specified window. Believe it as
  //    typed, including the year: nothing to resolve forward.
  const isoRange = t.match(ISO_RANGE_RE);
  if (isoRange?.[1] != null && isoRange[4] != null) {
    const from = isoToMs(Number(isoRange[1]), Number(isoRange[2]), Number(isoRange[3]));
    const to = isoToMs(Number(isoRange[4]), Number(isoRange[5]), Number(isoRange[6]));
    if (from != null) {
      const span = to != null ? Math.round((to - from) / MS_PER_DAY) : 0;
      return span >= 1 && span <= MAX_TRIP_NIGHTS ? windowOf(from, span) : windowOf(from, nights);
    }
  }

  // 2. "2027-02-14" — an explicit start with the length from the text, or a week.
  const isoSingle = t.match(ISO_SINGLE_RE);
  if (isoSingle?.[1] != null) {
    const from = isoToMs(Number(isoSingle[1]), Number(isoSingle[2]), Number(isoSingle[3]));
    if (from != null) return windowOf(from, nights);
  }

  // 3. "14 February to 21 February"
  const dayMonthRange = t.match(DAY_MONTH_RANGE_RE);
  if (dayMonthRange?.[1] != null) {
    const m1 = monthFromToken(dayMonthRange[2] ?? '');
    const m2 = monthFromToken(dayMonthRange[4] ?? '');
    if (m1 != null && m2 != null) {
      return rangeWindow(todayMs, m1, Number(dayMonthRange[1]), m2, Number(dayMonthRange[3]));
    }
  }

  // 4. "14–21 February"
  const daysMonth = t.match(DAYS_MONTH_RE);
  if (daysMonth?.[1] != null) {
    const m = monthFromToken(daysMonth[3] ?? '');
    if (m != null) return rangeWindow(todayMs, m, Number(daysMonth[1]), m, Number(daysMonth[2]));
  }

  // 5. "Feb 14 to Feb 21" and "February 14–21"
  const monthDays = t.match(MONTH_DAYS_RE);
  if (monthDays?.[1] != null) {
    const m1 = monthFromToken(monthDays[1]);
    const m2 = monthDays[3] != null ? monthFromToken(monthDays[3]) : m1;
    if (m1 != null && m2 != null) {
      return rangeWindow(todayMs, m1, Number(monthDays[2]), m2, Number(monthDays[4]));
    }
  }

  // 6. "first week of March", "last week of January"
  const weekOf = t.match(WEEK_OF_MONTH_RE);
  if (weekOf?.[1] != null) {
    const m = monthFromToken(weekOf[2] ?? '');
    if (m != null) {
      const which = weekOf[1];
      const position: MonthPosition =
        which === 'last' ? 'lastWeek'
          : which === 'second' || which === '2nd' ? 'week2'
            : which === 'third' || which === '3rd' ? 'week3'
              : which === 'fourth' || which === '4th' ? 'week4'
                : 'week1';
      return resolveMonthWindow(todayMs, m, stated ?? 7, position);
    }
  }

  // 7. "end of January", "early February", "mid March"
  const partOf = t.match(PART_OF_MONTH_RE);
  if (partOf?.[1] != null) {
    const m = monthFromToken(partOf[2] ?? '');
    if (m != null) {
      const word = partOf[1];
      const position: MonthPosition =
        word === 'late' || word === 'end of' ? 'end' : word === 'mid' || word === 'middle of' ? 'mid' : 'start';
      return resolveMonthWindow(todayMs, m, nights, position);
    }
  }

  // 8. A single named day: "14 February" / "February 14".
  const dayMonth = t.match(DAY_MONTH_RE);
  if (dayMonth?.[1] != null) {
    const m = monthFromToken(dayMonth[2] ?? '');
    if (m != null) return windowOf(resolveDayInMonth(todayMs, m, Number(dayMonth[1])), nights);
  }
  const monthDay = t.match(MONTH_DAY_RE);
  if (monthDay?.[1] != null) {
    const m = monthFromToken(monthDay[1]);
    if (m != null) return windowOf(resolveDayInMonth(todayMs, m, Number(monthDay[2])), nights);
  }

  // 9. A bare month: "a week in February", "in February", "February".
  const prep = t.match(MONTH_PREPOSITION_RE);
  const bare = prep ?? t.match(MONTH_BARE_RE);
  if (bare?.[1] != null) {
    const m = monthFromToken(bare[1]);
    if (m != null) return resolveMonthWindow(todayMs, m, nights, 'start');
  }

  // 10. Relative, and only when no month was named.
  if (/\bnext month\b/.test(t)) {
    const now = new Date(todayMs);
    return resolveMonthWindow(todayMs, (now.getUTCMonth() + 1) % 12, nights, 'start');
  }
  if (/\bnext week\b/.test(t)) return windowOf(nextDow(todayMs, 1), nights);
  if (/\bnext weekend\b/.test(t)) {
    return windowOf(comingDow(todayMs, 5) + 7 * MS_PER_DAY - (nights - WEEKEND_NIGHTS) * MS_PER_DAY, nights);
  }
  if (/\bweekend\b/.test(t)) {
    // Anchored so the window always ENDS on Sunday: a weekend is Fri->Sun, a
    // long weekend Thu->Sun. If that start is already behind us, take the next.
    let from = comingDow(todayMs, 5) - (nights - WEEKEND_NIGHTS) * MS_PER_DAY;
    if (from < todayMs) from = comingDow(todayMs + 7 * MS_PER_DAY, 5) - (nights - WEEKEND_NIGHTS) * MS_PER_DAY;
    return windowOf(from, nights);
  }
  if (offset?.[1] != null) {
    const days = Number(offset[1]) * (offset[2]?.startsWith('week') === true ? 7 : 1);
    return windowOf(todayMs + days * MS_PER_DAY, nights);
  }

  // A duration with no anchor ("a week in Austria") is NOT a date. Saying
  // nothing is the correct answer; inventing a February is not.
  return null;
}

// ---------------------------------------------------------------------------
// Party size
// ---------------------------------------------------------------------------

/**
 * Only ever an explicit count. "with kids" says a family is coming, which is
 * already `wantFamily`; it does not say how many, and guessing a headcount that
 * ends up in a hotel booking link is not a guess worth making.
 */
function parseParty(latin: string, raw: string): { adults?: number; children?: number } {
  const out: { adults?: number; children?: number } = {};

  const adults =
    latin.match(/\b(\d{1,2})\s*(?:adults?|grown[-\s]?ups?)\b/) ?? raw.match(/\b(\d{1,2})\s*מבוגרים/);
  const children =
    latin.match(/\b(\d{1,2})\s*(?:kids?|child|children)\b/) ?? raw.match(/\b(\d{1,2})\s*ילדים/);
  const people =
    latin.match(/\b(?:for|party of|group of|we are)\s+(\d{1,2})\s+(?:people|persons?|pax|skiers?|of us)\b/) ??
    latin.match(/\b(\d{1,2})\s+(?:people|persons?|pax)\b/) ??
    raw.match(/\b(\d{1,2})\s*אנשים/);

  if (adults?.[1] != null) out.adults = Number(adults[1]);
  if (children?.[1] != null) out.children = Number(children[1]);
  // "4 of us" only tells us the party size, not its composition. Read it as
  // adults rather than inventing a split.
  if (out.adults == null && people?.[1] != null) out.adults = Number(people[1]);

  if (out.adults != null && !(out.adults >= 1 && out.adults <= 20)) delete out.adults;
  if (out.children != null && !(out.children >= 1 && out.children <= 12)) delete out.children;
  return out;
}

// ---------------------------------------------------------------------------
// The parser
// ---------------------------------------------------------------------------

/**
 * Options for `parseQueryDeterministic`.
 *
 * `today` is the clock seam. It exists so that every date in the golden suite
 * is pinned and the suite's expected output never depends on when it is run.
 * Production omits it and gets the system clock.
 */
export interface ParseOptions {
  /** "Today", for resolving relative and bare-month dates. Defaults to now. */
  today?: Date;
}

/**
 * Turn free text into structured criteria. Never throws; an unparseable string
 * yields `{ rawQuery }`, which the scorer handles as "rank by the base
 * qualities" rather than as an error.
 */
export function parseQueryDeterministic(text: string, opts?: ParseOptions): SearchCriteria {
  const raw = (text ?? '').normalize('NFC');
  const latin = foldLatin(raw);
  // The one clock read in this file, and it is a parameter with a default.
  const todayMs = utcDay(opts?.today ?? new Date());
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

  // --- when ----------------------------------------------------------------
  // Dates are METADATA, not a ranking signal. They travel to the booking links
  // and the conditions panel; `seasonFit` in scoring.ts refuses to rank on them
  // while we hold no season_dates. See the note on SearchCriteria.dateFrom.
  const dates = parseDates(foldDateText(latin), todayMs);
  if (dates) {
    criteria.dateFrom = dates.dateFrom;
    criteria.dateTo = dates.dateTo;
  }

  // --- how many ------------------------------------------------------------
  const party = parseParty(latin, raw);
  if (party.adults != null) criteria.adults = party.adults;
  if (party.children != null) criteria.children = party.children;

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
  if (c.dateFrom != null && c.dateTo != null) {
    const nights = Math.round((Date.parse(`${c.dateTo}T00:00:00Z`) - Date.parse(`${c.dateFrom}T00:00:00Z`)) / MS_PER_DAY);
    bits.push(
      Number.isFinite(nights) && nights > 0
        ? `travelling ${c.dateFrom} to ${c.dateTo} (${nights} night${nights === 1 ? '' : 's'})`
        : `travelling ${c.dateFrom} to ${c.dateTo}`,
    );
  } else if (c.dateFrom != null) {
    bits.push(`travelling from ${c.dateFrom}`);
  }
  if (c.adults != null || c.children != null) {
    const who: string[] = [];
    if (c.adults != null) who.push(`${c.adults} adult${c.adults === 1 ? '' : 's'}`);
    if (c.children != null) who.push(`${c.children} child${c.children === 1 ? '' : 'ren'}`);
    bits.push(`for ${who.join(' and ')}`);
  }

  const main =
    bits.length > 0
      ? `Looking for ${bits.join(', ')}.`
      : 'No specific requirements picked up — showing the strongest all-round resorts.';

  // A ski trip that resolved into July is far more likely a misparse than a
  // glacier booking. Say so; do not silently move the dates the user typed.
  if (c.dateFrom != null && c.dateTo != null && !isNorthernSkiSeason(c.dateFrom, c.dateTo)) {
    return `${main} Those dates fall outside the usual November-to-April northern-hemisphere season — we read them exactly as you typed them and have not adjusted them, so check them if that is not what you meant.`;
  }
  return main;
}
