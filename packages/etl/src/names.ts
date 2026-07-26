/**
 * Multilingual name handling.
 *
 * OpenSkiMap collapses OSM's name / name:xx tags into ONE string. Georgia's
 * flagship resort ships literally as:
 *
 *     "გუდაური, Gudauri, Гудаури"
 *
 * Rendering that as a display name is unusable, and searching it as one token
 * means "Gudauri" does not match. So we split the blob into a display `name`
 * plus an `aliases` list that drives search (see ski_area_alias in
 * db/migrations/0001_init.sql, which stores a `script` per alias).
 *
 * SPLIT POLICY — deliberately conservative:
 *   we split on "," "/" "|" and the full-width variants only.
 *   We do NOT split on " - ", because Italian/French resorts legitimately use
 *   it to join two DIFFERENT places ("Alpe Cimbra - Folgaria"), and losing that
 *   would corrupt real names. Over-splitting is worse than under-splitting:
 *   an unsplit alias is still searchable, a wrongly-split one is a fake resort.
 */

export type Script =
  | 'latin'
  | 'cyrillic'
  | 'georgian'
  | 'greek'
  | 'hebrew'
  | 'arabic'
  | 'han'
  | 'kana'
  | 'hangul'
  | 'other';

/**
 * Unicode blocks we care about. Order matters only for readability; each test
 * is independent. Ranges are the standard blocks (BMP only — sufficient here,
 * upstream contains no astral-plane resort names).
 */
const SCRIPT_RANGES: ReadonlyArray<{ script: Script; re: RegExp }> = [
  // Basic Latin letters + Latin-1 Supplement + Extended-A/B, incl. accents.
  { script: 'latin', re: /[A-Za-zÀ-ɏḀ-ỿ]/ },
  { script: 'cyrillic', re: /[Ѐ-ӿԀ-ԯ]/ },
  { script: 'georgian', re: /[Ⴀ-ჿᲐ-Ჿ]/ },
  { script: 'greek', re: /[Ͱ-Ͽἀ-῿]/ },
  { script: 'hebrew', re: /[֐-׿]/ },
  { script: 'arabic', re: /[؀-ۿݐ-ݿ]/ },
  { script: 'han', re: /[一-鿿㐀-䶿]/ },
  { script: 'kana', re: /[぀-ヿ]/ },
  { script: 'hangul', re: /[가-힯ᄀ-ᇿ]/ },
];

/**
 * Dominant script of a string, by counting characters per script and taking the
 * max. Digits, spaces and punctuation are ignored so "Bansko 2000" is `latin`.
 */
export function detectScript(text: string): Script {
  const counts = new Map<Script, number>();
  for (const ch of text) {
    for (const { script, re } of SCRIPT_RANGES) {
      if (re.test(ch)) {
        counts.set(script, (counts.get(script) ?? 0) + 1);
        break;
      }
    }
  }
  let best: Script = 'other';
  let bestN = 0;
  for (const [script, n] of counts) {
    if (n > bestN) {
      best = script;
      bestN = n;
    }
  }
  return best;
}

/** Separators that indicate "the same place, written several ways". */
const BLOB_SPLIT = /[,/|、，／]/;

export interface SplitName {
  /** Preferred display form — the Latin-script variant when one exists. */
  name: string;
  /** Every distinct form seen, display name included. Drives search. */
  aliases: string[];
}

/**
 * Split a possibly-multilingual name blob.
 *
 * Display-name rule: prefer the first Latin-script part, because the UI is
 * English/Hebrew and a Georgian-script primary label is unreadable to the
 * audience. If no part is Latin, keep the first part as-is — we never
 * transliterate, because a machine transliteration is invented data.
 */
export function splitName(rawName: string | null | undefined, fallbackId: string): SplitName {
  const raw = (rawName ?? '').trim();
  if (raw.length === 0) {
    // Never invent a name. Make the absence obvious and traceable to the id.
    return { name: `Unnamed ski area (${fallbackId.slice(0, 8)})`, aliases: [] };
  }

  const parts = raw
    .split(BLOB_SPLIT)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  // Not a blob: one part, or splitting produced nothing useful.
  if (parts.length <= 1) {
    return { name: raw, aliases: [raw] };
  }

  const latin = parts.find((p) => detectScript(p) === 'latin');
  const display = latin ?? parts[0] ?? raw;

  // Dedupe case-insensitively but keep the first-seen casing.
  const seen = new Set<string>();
  const aliases: string[] = [];
  for (const p of [display, ...parts, raw]) {
    const key = p.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    aliases.push(p);
  }

  return { name: display, aliases };
}

/**
 * Normalized key for matching a hand-written resort name against upstream data:
 * lowercased, accents stripped, punctuation and whitespace collapsed.
 * Used by passRegions.ts so "Alta Badia" matches "Alta  Badia" and "Val Gardena
 * / Gröden" matches "val gardena groden".
 */
export function nameKey(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip combining accents
    .toLocaleLowerCase()
    .replace(/[^a-z0-9Ѐ-ӿႠ-ჿ]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}
