'use client';

import type { SearchCriteria } from '@searchski/core/types';
import { useT } from '@/i18n/client';
import { chipsFor, type ChipKey } from '@/lib/criteria-ui';
import { countryName } from '@/lib/format';

/**
 * The parsed query, shown back to the user as editable chips.
 *
 * This is a trust feature, not chrome: the user must always be able to see how
 * their words were interpreted, and correct it when we got it wrong. If the
 * parser reads "not too crowded" as `wantUncrowded` the chip says so; if it
 * missed something, the absence is equally visible.
 */
export function CriteriaChips({
  criteria,
  parsedBy,
  onRemove,
}: {
  criteria: SearchCriteria;
  /** Which parser produced these criteria. Disclosed to the user. */
  parsedBy: 'llm' | 'deterministic' | undefined;
  onRemove: (key: ChipKey) => void;
}) {
  const t = useT();
  const chips = chipsFor(criteria, t, countryName);
  const byLlm = parsedBy === 'llm';

  return (
    <section aria-labelledby="parsed-heading" className="rounded-xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="parsed-heading" className="text-sm font-semibold text-fg">
          {t('search.parsedHeading')}
        </h2>
        {/*
          Which parser ran is disclosed, always. When a model interpreted the
          user's words the chips are an interpretation that can be wrong, and
          the user has to know that in order to want to correct it. A silently
          wrong reading is worse than a crude one.
        */}
        {criteria.rawQuery ? (
          <span
            className={`rounded-full border px-2 py-0.5 text-[11px] ${
              byLlm ? 'border-accent/40 bg-accent-soft text-fg' : 'border-border text-muted'
            }`}
          >
            {byLlm ? 'Claude' : 'keywords'}
          </span>
        ) : null}
      </div>

      {chips.length === 0 ? (
        <p className="mt-2 text-sm text-muted">{t('search.parsedEmpty')}</p>
      ) : (
        <>
          <ul className="mt-2 flex flex-wrap gap-2">
            {chips.map((chip) => (
              <li key={chip.key}>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/40 bg-accent-soft px-2.5 py-1 text-xs text-fg">
                  <span>
                    <span className="font-medium">{chip.label}</span>
                    {chip.value ? <span className="text-muted">: {chip.value}</span> : null}
                  </span>
                  <button
                    type="button"
                    onClick={() => onRemove(chip.key)}
                    className="-me-1 grid h-4 w-4 place-items-center rounded-full text-muted hover:bg-bad/15 hover:text-bad"
                    aria-label={`${t('criteria.remove')}: ${chip.label}`}
                  >
                    <svg aria-hidden="true" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                      <path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" />
                    </svg>
                  </button>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted">{t('search.parsedHelp')}</p>
          {criteria.rawQuery ? (
            <p className={`mt-1 text-xs ${byLlm ? 'text-warn' : 'text-muted'}`}>
              {byLlm ? t('search.parsedByLlm') : t('search.parsedByDeterministic')}
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}
