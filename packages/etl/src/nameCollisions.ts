/**
 * Single-word resort names that collide with ordinary skier vocabulary.
 *
 * ---------------------------------------------------------------------------
 * THE HAZARD
 * ---------------------------------------------------------------------------
 * Core pins a result when the query names a resort: typing "Val Gardena" pins
 * the Alta Badia record through its aliases. That is exactly right for
 * "Gudauri" or "Sestriere" — and exactly wrong for a resort whose name is also
 * an ordinary word. Georgia has an area called **Crystal**, so
 * "crystal clear snow for beginners" pinned a Georgian resort to the top of a
 * query that was not about it at all.
 *
 * Core carries an exception set for these (`AMBIGUOUS_SINGLE_WORD_NAMES` in
 * packages/core/src/scoring.ts). The problem is that the set is only correct
 * for the countries currently in the build. Add Austria, France, Switzerland —
 * and above all any English-speaking market, where "Sunshine", "Paradise",
 * "Panorama", "Powder" and "Summit" are all real resort names — and new
 * collisions appear that nobody will think to re-derive by hand.
 *
 * So this module re-derives them on every build and the QA report prints them.
 * The next person to add a country reads the collision in the report instead of
 * discovering it from a user typing "powder" and getting a resort called Powder.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS DOES NOT IMPORT FROM CORE
 * ---------------------------------------------------------------------------
 * It would be tempting to import `AMBIGUOUS_SINGLE_WORD_NAMES` and diff against
 * it. We deliberately do not:
 *
 *  - The ETL runs on plain `node src/build.ts`. Importing scoring.ts drags the
 *    whole scoring engine — and its TS-ESM `.js` specifiers — into a process
 *    that has no resolve shim registered.
 *  - A build-time dependency on a constant that may not have landed yet turns a
 *    reporting nicety into a hard build failure.
 *
 * Instead the report lists EVERY collision as a checklist, and states that each
 * must appear in the core exception set. That stays correct whether or not core
 * already covers a given word, and it cannot break the ETL.
 *
 * The folding below MUST stay in step with `normaliseForMatch` in
 * packages/core/src/scoring.ts, and MIN_NAME_MATCH_CHARS with core's constant of
 * the same name. If those two drift, this report silently stops describing
 * reality — which is why both carry this warning.
 */

import type { SkiArea } from '@searchski/core/types';

/**
 * Mirror of `MIN_NAME_MATCH_CHARS` in packages/core/src/scoring.ts.
 * Names shorter than this cannot pin at all, so they cannot collide.
 */
export const MIN_NAME_MATCH_CHARS = 4;

/**
 * Mirror of `normaliseForMatch` in packages/core/src/scoring.ts:
 * NFD, strip combining marks, lower-case, everything non-alphanumeric to a
 * single space. `\p{L}` rather than `[a-z]` so Cyrillic and Georgian aliases
 * fold rather than vanish.
 */
export function foldForMatch(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Mn}+/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Ordinary vocabulary a skier might type in a query that is NOT about a
 * specific resort.
 *
 * THIS IS A HEURISTIC, not a dictionary. It is a hand-written net, it will miss
 * words, and a word appearing here is a prompt to look — not proof of a bug.
 * Deliberately English-and-ski-jargon weighted, because that (plus Hebrew,
 * which does not collide with Latin-script resort names) is what users type.
 * It intentionally does NOT include Italian/German toponym components like
 * "monte", "alta" or "neve": those are ordinary words in their own languages
 * but nobody queries in them here, and including them would bury the real
 * signal under false alarms.
 *
 * Words shorter than MIN_NAME_MATCH_CHARS are harmless to include — they are
 * filtered out before the intersection — but are omitted for clarity.
 */
export const ORDINARY_SKI_VOCABULARY: readonly string[] = [
  // Snow and conditions
  'snow', 'snowy', 'powder', 'fresh', 'deep', 'ice', 'icy', 'slush', 'crust',
  'base', 'groomed', 'grooming', 'blizzard', 'storm', 'frozen', 'freeze',
  'sunshine', 'sunny', 'cloud', 'cloudy', 'rain', 'wind', 'windy', 'warm',
  'cold', 'mild', 'weather', 'forecast', 'conditions', 'temperature',
  // Terrain
  'alpine', 'glacier', 'mountain', 'mountains', 'summit', 'peak', 'peaks',
  'slope', 'slopes', 'piste', 'pistes', 'trail', 'trails', 'runs', 'bowl',
  'bowls', 'chute', 'chutes', 'glade', 'glades', 'moguls', 'park', 'parks',
  'pipe', 'terrain', 'vertical', 'altitude', 'elevation', 'valley', 'valleys',
  'village', 'villages', 'forest', 'woods', 'tree', 'trees', 'lake', 'lakes',
  'river', 'ridge', 'cliff', 'rock', 'rocks', 'cirque', 'plateau',
  'panorama', 'paradise', 'view', 'views', 'vista', 'vistas', 'scenic',
  // Lifts and queueing
  'lift', 'lifts', 'gondola', 'gondolas', 'cable', 'chair', 'chairs',
  'chairlift', 'drag', 'queue', 'queues', 'line', 'lines',
  // Ability and people
  'beginner', 'beginners', 'novice', 'easy', 'intermediate', 'advanced',
  'expert', 'experts', 'learner', 'lesson', 'lessons', 'school', 'instructor',
  'guide', 'guides', 'family', 'families', 'kids', 'children', 'child',
  'adult', 'adults', 'group', 'groups', 'teen', 'teens',
  // Trip logistics and money
  'resort', 'resorts', 'hotel', 'hotels', 'lodge', 'lodges', 'lodging',
  'chalet', 'chalets', 'apartment', 'hostel', 'budget', 'cheap', 'cheaper',
  'affordable', 'expensive', 'luxury', 'price', 'prices', 'cost', 'costs',
  'deal', 'deals', 'pass', 'passes', 'ticket', 'tickets', 'season', 'seasons',
  'week', 'weekend', 'holiday', 'holidays', 'vacation', 'trip', 'travel',
  'flight', 'flights', 'airport', 'transfer', 'transfers', 'drive', 'driving',
  // Vibe, food, the Israel layer
  'quiet', 'quieter', 'crowded', 'uncrowded', 'busy', 'empty', 'lively',
  'party', 'nightlife', 'apres', 'night', 'nights', 'evening', 'restaurant',
  'restaurants', 'food', 'kosher', 'chabad', 'shabbat', 'bars', 'club',
  'clubs', 'wellness', 'pool', 'sauna', 'thermal',
  // Generic descriptors that are also common resort names
  'good', 'great', 'best', 'better', 'nice', 'beautiful', 'amazing',
  'perfect', 'ideal', 'quality', 'safe', 'safety', 'reliable', 'sure',
  'clear', 'clean', 'white', 'black', 'blue', 'green', 'gold', 'golden',
  'silver', 'star', 'stars', 'crystal', 'diamond', 'eagle', 'bear', 'wolf',
  'sunrise', 'sunset', 'morning', 'high', 'higher', 'highest', 'large',
  'small', 'long', 'short', 'wide', 'narrow', 'steep', 'flat', 'gentle',
  'north', 'south', 'east', 'west', 'upper', 'lower', 'central', 'near',
  'close', 'quietest', 'sunniest',
];

export interface NameCollision {
  /** The folded single word that collides. */
  word: string;
  /** The exact name/alias forms it came from. */
  forms: string[];
  /** Areas carrying it: "Crystal [GE]". */
  areas: string[];
}

export interface NameCollisionReport {
  /** Distinct single-word names/aliases at least MIN_NAME_MATCH_CHARS long. */
  singleWordCount: number;
  vocabularySize: number;
  minChars: number;
  collisions: NameCollision[];
}

/**
 * Fold every name and alias in the build, keep the single words long enough to
 * pin, and intersect against ordinary vocabulary.
 */
export function findNameCollisions(
  areas: readonly SkiArea[],
  vocabulary: readonly string[] = ORDINARY_SKI_VOCABULARY,
): NameCollisionReport {
  const vocab = new Set(vocabulary.map((w) => foldForMatch(w)).filter((w) => w.length > 0));

  // folded word -> { original forms, owning areas }
  const index = new Map<string, { forms: Set<string>; areas: Set<string> }>();

  for (const area of areas) {
    for (const raw of [area.name, ...area.aliases]) {
      if (!raw) continue;
      const folded = foldForMatch(raw);
      if (!folded || folded.includes(' ')) continue; // single words only
      if (folded.length < MIN_NAME_MATCH_CHARS) continue;
      let entry = index.get(folded);
      if (!entry) {
        entry = { forms: new Set(), areas: new Set() };
        index.set(folded, entry);
      }
      entry.forms.add(raw);
      entry.areas.add(`${area.name}${area.country ? ` [${area.country}]` : ''}`);
    }
  }

  const collisions: NameCollision[] = [];
  for (const [word, entry] of index) {
    if (!vocab.has(word)) continue;
    collisions.push({
      word,
      forms: [...entry.forms].sort(),
      areas: [...entry.areas].sort(),
    });
  }
  collisions.sort((a, b) => a.word.localeCompare(b.word));

  return {
    singleWordCount: index.size,
    vocabularySize: vocab.size,
    minChars: MIN_NAME_MATCH_CHARS,
    collisions,
  };
}
