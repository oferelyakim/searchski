'use client';

import { useId, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import type { MessageKey } from '@/i18n/dictionary';
import { useT } from '@/i18n/client';
import {
  MAX_GROUPS,
  MAX_GROUP_LABEL,
  MAX_PARTY,
  NEED_KINDS,
  groupLabelOrDefault,
  groupsToQuery,
  implicitGroup,
  newGroup,
  renumberGroups,
  sanitizeGroupLabel,
  tripToQuery,
  tripWithGroup,
  type NeedKind,
  type TravellerGroup,
  type TripWindow,
} from '@/lib/trip';

/**
 * The multi-group editor.
 *
 * ===========================================================================
 * THE DEFAULT IS ONE GROUP AND ZERO EXTRA UI
 * ===========================================================================
 * Someone travelling alone, or as one family, sees exactly what they saw
 * before: a single line of quiet text asking whether they are travelling from
 * more than one place. Nothing expands, nothing is prefilled, no rows appear.
 * The machinery below exists only once they say yes.
 *
 * That ordering is the whole design. Several parties converging on one resort
 * is real and common enough to serve — four friends from Berlin, a couple
 * driving from Milan, one person already in the Alps who needs a bed — but it
 * is still the minority case, and making the majority case worse to serve it
 * would be a bad trade.
 * ===========================================================================
 *
 * State lives in the URL, because the point of this feature is that a trip
 * organiser sends ONE link and everybody sees the same page. Local state here
 * is only a draft between commits, so a fast second click is computed from what
 * you just did rather than from a router response that has not landed yet.
 *
 * No cart is added by any of this. Six groups mean up to six sets of separate
 * links that six people follow and pay for themselves — never one basket. See
 * packages/affiliates/src/index.ts.
 */

export interface TravellerGroupsProps {
  trip: TripWindow;
  /** Groups the URL explicitly carries. Empty is the ordinary case. */
  groups: TravellerGroup[];
  /** IATA codes we happen to hold, offered as autocomplete hints only. */
  airports: string[];
}

const NEED_LABEL: Record<NeedKind, MessageKey> = {
  flight: 'book.needFlight',
  lodging: 'book.needLodging',
  transfer: 'book.needTransfer',
  car: 'book.needCar',
};

const ADULT_OPTIONS = Array.from({ length: MAX_PARTY }, (_, i) => i + 1);
const CHILD_OPTIONS = Array.from({ length: MAX_PARTY + 1 }, (_, i) => i);

export function TravellerGroups({ trip, groups, airports }: TravellerGroupsProps) {
  const t = useT();
  const router = useRouter();
  const pathname = usePathname();
  const uid = useId();

  const [draft, setDraft] = useState<TravellerGroup[]>(groups);
  const [seen, setSeen] = useState<string>(groupsToQuery(groups));

  // Adopt whatever the server just rendered, without clobbering a draft we are
  // mid-way through committing. Same shape as the origin field in FilterPanel.
  const incoming = groupsToQuery(groups);
  if (seen !== incoming) {
    setSeen(incoming);
    setDraft(groups);
  }

  const go = (query: string) => router.replace(`${pathname}${query}`, { scroll: false });

  const commit = (next: TravellerGroup[]) => {
    const numbered = renumberGroups(next);
    setDraft(numbered);
    setSeen(groupsToQuery(numbered));
    go(tripToQuery(trip, numbered));
  };

  /**
   * Falling back to one group is a return to the SIMPLE view, not a one-row
   * version of this editor: the group's origin and party size fold back into
   * the ordinary trip params and the `g=` machinery leaves the URL entirely.
   * Its per-group needs are deliberately not preserved — a single party with a
   * hidden "no car links" flag and no visible control to clear it would be a
   * trap.
   */
  const collapse = (only: TravellerGroup | undefined) => {
    setDraft([]);
    setSeen('');
    go(tripToQuery(only ? tripWithGroup(trip, only) : trip));
  };

  const startMulti = () => commit([implicitGroup(trip), newGroup(1)]);

  const removeAt = (index: number) => {
    const rest = draft.filter((_, i) => i !== index);
    if (rest.length <= 1) collapse(rest[0]);
    else commit(rest);
  };

  const patch = (index: number, change: (group: TravellerGroup) => TravellerGroup) =>
    commit(draft.map((group, i) => (i === index ? change(group) : group)));

  /**
   * Origin and flight move together, because a flight search cannot be built
   * without a departure airport and we never invent one.
   *   cleared  -> flight OFF. Somebody driving up from Milan does not want a
   *               flight search, and leaving the toggle on would render a
   *               "we cannot build this" note instead of a link, forever.
   *   set      -> flight ON, but only on the transition from having none.
   *               Naming an airport is what people do when they intend to fly;
   *               if they are being driven, one click puts it back.
   */
  const setOrigin = (index: number, raw: string) => {
    const code = raw.trim().toUpperCase();
    const valid = /^[A-Z]{3}$/.test(code);
    patch(index, (group) => {
      const next: TravellerGroup = { ...group, needs: { ...group.needs } };
      if (valid) {
        if (!group.originAirport) next.needs.flight = true;
        next.originAirport = code;
      } else {
        delete next.originAirport;
        next.needs.flight = false;
      }
      return next;
    });
  };

  // ---- the ordinary case: one line of text, and nothing else --------------
  if (draft.length === 0) {
    return (
      <p className="text-xs text-muted">
        <button
          type="button"
          onClick={startMulti}
          className="rounded text-accent underline decoration-dotted underline-offset-4 hover:decoration-solid"
        >
          {t('book.multiPrompt')}
        </button>
      </p>
    );
  }

  const full = draft.length >= MAX_GROUPS;

  return (
    <section aria-labelledby={`${uid}-groups`} className="space-y-3 rounded-lg border border-border p-3">
      <div>
        <h3 id={`${uid}-groups`} className="text-sm font-semibold text-fg">
          {t('book.groupsTitle')}
        </h3>
        <p className="mt-1 text-xs leading-relaxed text-muted">{t('book.multiHint')}</p>
        <p className="mt-1 text-[11px] leading-relaxed text-muted">{t('book.groupsDatesNote')}</p>
      </div>

      {/* A list, so a screen reader announces "3 items" and reads them in
          order rather than presenting six unrelated forms. */}
      <ul className="space-y-2">
        {draft.map((group, index) => {
          const rowId = `${uid}-${group.id}`;
          const name = groupLabelOrDefault(group, index, t('book.groupFallback'));
          return (
            <li key={group.id}>
              <fieldset className="rounded-lg border border-border bg-surface-2 px-3 pb-3 pt-1">
                <legend className="px-1 text-xs font-semibold text-fg">{name}</legend>

                <div className="grid gap-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]">
                  <div className="flex flex-col gap-1">
                    <label htmlFor={`${rowId}-label`} className="text-[11px] font-medium text-muted">
                      {t('book.groupName')}
                    </label>
                    <input
                      // Remounts when the committed label changes underneath us
                      // (a shared link opened, a group removed above this one),
                      // and otherwise keeps whatever is being typed.
                      key={`label-${group.label}`}
                      id={`${rowId}-label`}
                      type="text"
                      defaultValue={group.label}
                      maxLength={MAX_GROUP_LABEL}
                      placeholder={t('book.groupNamePlaceholder')}
                      autoComplete="off"
                      onBlur={(e) => {
                        // Sanitized here, not only on the way into the URL, so
                        // the box, the heading below and the link never show
                        // three different spellings of the same name.
                        const clean = sanitizeGroupLabel(e.target.value);
                        e.target.value = clean;
                        if (clean === group.label) return;
                        patch(index, (g) => ({ ...g, label: clean }));
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          e.currentTarget.blur();
                        }
                      }}
                      className="w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm text-fg"
                    />
                  </div>

                  <div className="flex flex-col gap-1">
                    <label htmlFor={`${rowId}-origin`} className="text-[11px] font-medium text-muted">
                      {t('criteria.originAirport')}
                    </label>
                    <input
                      key={`origin-${group.originAirport ?? ''}`}
                      id={`${rowId}-origin`}
                      type="text"
                      defaultValue={group.originAirport ?? ''}
                      maxLength={3}
                      list={`${uid}-airports`}
                      placeholder={t('search.originPlaceholder')}
                      autoComplete="off"
                      spellCheck={false}
                      aria-describedby={`${rowId}-origin-hint`}
                      onBlur={(e) => {
                        const code = e.target.value.trim().toUpperCase();
                        const valid = /^[A-Z]{3}$/.test(code);
                        // Half a code is not a code. Clearing the box rather
                        // than keeping "LT" means what you see and what the
                        // flight link is built from can never disagree.
                        const settled = valid ? code : '';
                        e.target.value = settled;
                        if (settled === (group.originAirport ?? '')) return;
                        setOrigin(index, settled);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          e.currentTarget.blur();
                        }
                      }}
                      className="w-full rounded-md border border-border bg-surface px-2 py-1.5 font-mono text-sm uppercase text-fg"
                    />
                    <span id={`${rowId}-origin-hint`} className="sr-only">
                      {t('search.originHint')}
                    </span>
                  </div>

                  <div className="flex flex-col gap-1">
                    <label htmlFor={`${rowId}-adults`} className="text-[11px] font-medium text-muted">
                      {t('criteria.adults')}
                    </label>
                    <select
                      id={`${rowId}-adults`}
                      value={group.adults}
                      onChange={(e) =>
                        patch(index, (g) => ({ ...g, adults: Number(e.target.value) }))
                      }
                      className="w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm text-fg"
                    >
                      {ADULT_OPTIONS.map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex flex-col gap-1">
                    <label htmlFor={`${rowId}-children`} className="text-[11px] font-medium text-muted">
                      {t('criteria.children')}
                    </label>
                    <select
                      id={`${rowId}-children`}
                      value={group.children}
                      onChange={(e) =>
                        patch(index, (g) => ({ ...g, children: Number(e.target.value) }))
                      }
                      className="w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm text-fg"
                    >
                      {CHILD_OPTIONS.map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
                  <fieldset className="min-w-0">
                    <legend className="sr-only">
                      {t('book.groupNeeds')} — {name}
                    </legend>
                    <div className="flex flex-wrap gap-1.5">
                      {NEED_KINDS.map((kind) => {
                        const checked = group.needs[kind];
                        return (
                          <label
                            key={kind}
                            className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${
                              checked ? 'border-accent bg-accent-soft text-fg' : 'border-border text-muted'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) =>
                                patch(index, (g) => ({
                                  ...g,
                                  needs: { ...g.needs, [kind]: e.target.checked },
                                }))
                              }
                              className="h-3 w-3 accent-[var(--c-accent)]"
                            />
                            {t(NEED_LABEL[kind])}
                          </label>
                        );
                      })}
                    </div>
                  </fieldset>

                  <button
                    type="button"
                    onClick={() => removeAt(index)}
                    aria-label={`${t('book.removeGroup')}: ${name}`}
                    className="rounded-md border border-border px-2 py-1 text-xs text-muted hover:border-bad hover:text-bad"
                  >
                    {t('book.removeGroup')}
                  </button>
                </div>
              </fieldset>
            </li>
          );
        })}
      </ul>

      <datalist id={`${uid}-airports`}>
        {airports.map((iata) => (
          <option key={iata} value={iata} />
        ))}
      </datalist>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => commit([...draft, newGroup(draft.length)])}
          disabled={full}
          className="rounded-md border border-border px-2.5 py-1 text-xs text-accent disabled:cursor-not-allowed disabled:text-muted"
        >
          {t('book.addGroup')}
        </button>
        {full ? <span className="text-[11px] text-muted">{t('book.groupsFull')}</span> : null}
      </div>
    </section>
  );
}
