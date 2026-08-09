/**
 * The agency cast.
 *
 * One host runs the interview; specialists speak only when their domain is
 * genuinely engaged (a family answer wakes the family specialist, an origin
 * answer wakes transfers). The theatre maps one-to-one onto real subsystems —
 * a specialist never says anything the deterministic engine cannot back up,
 * and every line they speak is a fixed dictionary string, not model output.
 * The LLM parses free text into `SearchCriteria` and nothing else; the cast
 * costs zero tokens.
 *
 * Names are proper nouns and are not translated. Roles are.
 */

import type { MessageKey } from '@/i18n/dictionary';

export const CAST_IDS = ['maya', 'jonas', 'lena', 'marco', 'tomer', 'noa'] as const;
export type CastId = (typeof CAST_IDS)[number];

export interface CastMember {
  id: CastId;
  name: string;
  roleKey: MessageKey;
  /** Fixed hex, readable on both themes as a badge background with white text. */
  color: string;
  /** Small pictogram beside the name. Decorative; hidden from screen readers. */
  emoji: string;
}

export const CAST: Record<CastId, CastMember> = {
  maya: { id: 'maya', name: 'Maya', roleKey: 'cast.maya.role', color: '#7c4dbe', emoji: '🏔️' },
  jonas: { id: 'jonas', name: 'Jonas', roleKey: 'cast.jonas.role', color: '#0b6e99', emoji: '✈️' },
  lena: { id: 'lena', name: 'Lena', roleKey: 'cast.lena.role', color: '#a05e03', emoji: '🏨' },
  marco: { id: 'marco', name: 'Marco', roleKey: 'cast.marco.role', color: '#0f7a52', emoji: '🎿' },
  tomer: { id: 'tomer', name: 'Tomer', roleKey: 'cast.tomer.role', color: '#b04a17', emoji: '🚐' },
  noa: { id: 'noa', name: 'Noa', roleKey: 'cast.noa.role', color: '#b0316e', emoji: '🧒' },
};
