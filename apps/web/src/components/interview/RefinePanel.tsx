'use client';

import { useState } from 'react';
import type { SearchCriteria } from '@searchski/core/types';
import { useT } from '@/i18n/client';
import type { MessageKey } from '@/i18n/dictionary';
import type { CastId } from '@/lib/interview/cast';

/**
 * The refinement controls that live under the chat once results are showing.
 *
 * Quick chips are deterministic criteria patches — tap "bigger resorts" and
 * `minKm: 100` is applied, no model involved, instantly reversible by tapping
 * again. The free-text box goes through the same parser as the interview's
 * typed answers. Both paths end in the same place: a re-run of the search and
 * a one-line acknowledgment from the specialist who owns that dimension.
 */

export interface RefineChip {
  id: string;
  labelKey: MessageKey;
  /** Applied when toggled ON; the same keys are REMOVED when toggled off. */
  patch: SearchCriteria;
  /** Who acknowledges the change in the chat. */
  speaker: CastId;
}

export const REFINE_CHIPS: RefineChip[] = [
  { id: 'big', labelKey: 'iv.refine.big', patch: { minKm: 100 }, speaker: 'marco' },
  { id: 'huge', labelKey: 'iv.refine.huge', patch: { minKm: 250 }, speaker: 'marco' },
  { id: 'snowsure', labelKey: 'iv.vibe.snowsure', patch: { wantSnowsure: true }, speaker: 'marco' },
  { id: 'uncrowded', labelKey: 'iv.vibe.uncrowded', patch: { wantUncrowded: true }, speaker: 'marco' },
  { id: 'night', labelKey: 'iv.vibe.night', patch: { wantNightSki: true }, speaker: 'marco' },
  { id: 'apres', labelKey: 'iv.vibe.apres', patch: { wantApres: true }, speaker: 'lena' },
  { id: 'skiinout', labelKey: 'iv.vibe.skiinout', patch: { wantSkiInSkiOut: true }, speaker: 'lena' },
  { id: 'family', labelKey: 'criteria.wantFamily', patch: { wantFamily: true }, speaker: 'noa' },
  {
    id: 'closer',
    labelKey: 'iv.refine.closer',
    patch: { maxTransferMinutes: 120 },
    speaker: 'tomer',
  },
];

/** Is this chip currently reflected in the criteria? */
export function refineChipActive(chip: RefineChip, criteria: SearchCriteria): boolean {
  return Object.entries(chip.patch).every(([key, value]) => {
    const current = (criteria as Record<string, unknown>)[key];
    return typeof value === 'number' ? current === value : current === value;
  });
}

export function RefinePanel({
  criteria,
  busy,
  onToggleChip,
  onFreeText,
}: {
  criteria: SearchCriteria;
  busy: boolean;
  onToggleChip: (chip: RefineChip, active: boolean) => void;
  onFreeText: (text: string) => void;
}) {
  const t = useT();
  const [text, setText] = useState('');

  return (
    <div className="space-y-2.5">
      <p className="text-xs font-medium text-muted">{t('iv.refine.heading')}</p>
      <div className="flex flex-wrap gap-1.5">
        {REFINE_CHIPS.map((chip) => {
          const active = refineChipActive(chip, criteria);
          return (
            <button
              key={chip.id}
              type="button"
              disabled={busy}
              aria-pressed={active}
              onClick={() => onToggleChip(chip, active)}
              className={`rounded-full border px-2.5 py-1 text-xs transition-colors disabled:opacity-50 ${
                active
                  ? 'border-accent bg-accent text-accent-fg'
                  : 'border-border bg-bg text-fg hover:border-accent hover:text-accent'
              }`}
            >
              {t(chip.labelKey)}
            </button>
          );
        })}
      </div>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const trimmed = text.trim();
          if (trimmed === '' || busy) return;
          setText('');
          onFreeText(trimmed);
        }}
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t('iv.refine.placeholder')}
          aria-label={t('iv.refine.heading')}
          className="min-w-0 flex-1 rounded-lg border border-border bg-bg px-3 py-1.5 text-sm text-fg placeholder:text-muted"
        />
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-accent-fg disabled:opacity-50"
        >
          {t('iv.send')}
        </button>
      </form>
    </div>
  );
}
