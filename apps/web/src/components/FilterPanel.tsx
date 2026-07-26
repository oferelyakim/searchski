'use client';

import { useId, useState } from 'react';
import type { Ability, SearchCriteria } from '@searchski/core/types';
import { useT } from '@/i18n/client';
import { ABILITIES, abilityKey, CRITERION_LABEL, VISIBLE_BOOLEAN_KEYS, withCriterion } from '@/lib/criteria-ui';
import { countryName, flagEmoji } from '@/lib/format';
import { SHOW_REGIONAL_LAYER } from '@/lib/features';
import { MAX_PARTY, isIsoDate } from '@/lib/trip';

/**
 * Structured controls over the same `SearchCriteria` object the chips render.
 * There is exactly one source of truth, so the sentence, the chips and these
 * controls cannot disagree.
 */

interface FilterPanelProps {
  criteria: SearchCriteria;
  countries: string[];
  airports: string[];
  onChange: (next: SearchCriteria) => void;
  onReset: () => void;
}

function NumberField({
  id,
  label,
  value,
  suffix,
  min,
  max,
  step,
  onChange,
}: {
  id: string;
  label: string;
  value: number | undefined;
  suffix?: string;
  min?: number;
  max?: number;
  step?: number;
  onChange: (v: number | undefined) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-xs font-medium text-muted">
        {label}
        {suffix ? <span className="font-normal"> ({suffix})</span> : null}
      </label>
      <input
        id={id}
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        step={step ?? 1}
        value={value ?? ''}
        onChange={(e) => {
          const raw = e.target.value;
          onChange(raw === '' ? undefined : Number(raw));
        }}
        className="w-full rounded-md border border-border bg-surface-2 px-2 py-1.5 text-sm text-fg"
      />
    </div>
  );
}

/**
 * Party size is a whole number of people inside a sane range. An empty box
 * means "not stated" and stays that way — the affiliates package applies its
 * own documented default downstream rather than us inventing one here.
 */
function clampParty(value: number | undefined, min: number): number | undefined {
  if (value === undefined || !Number.isFinite(value)) return undefined;
  return Math.min(MAX_PARTY, Math.max(min, Math.round(value)));
}

function DateField({
  id,
  label,
  value,
  min,
  onChange,
}: {
  id: string;
  label: string;
  value: string | undefined;
  min?: string | undefined;
  onChange: (v: string | undefined) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-xs font-medium text-muted">
        {label}
      </label>
      <input
        id={id}
        type="date"
        // The native control emits YYYY-MM-DD or an empty string, which is
        // exactly the two states SearchCriteria models. `isIsoDate` still
        // guards it: a keyboard-entered 31 February must not reach a link.
        value={value ?? ''}
        min={min}
        onChange={(e) => {
          const raw = e.target.value;
          onChange(raw === '' || !isIsoDate(raw) ? undefined : raw);
        }}
        className="w-full rounded-md border border-border bg-surface-2 px-2 py-1.5 text-sm text-fg"
      />
    </div>
  );
}

/**
 * "Flying from", as free text.
 *
 * A three-letter IATA code, typed. There is NO default and no preselected
 * option: Searchski is not an Israeli product any more, and quietly assuming
 * TLV would put a wrong origin into every flight link for everyone else. The
 * datalist is only a hint drawn from the airports we happen to hold; any code
 * in the world is accepted.
 *
 * Committed on blur rather than per keystroke, so a half-typed "TL" never
 * re-runs the search and never lands in the criteria.
 */
function AirportField({
  id,
  label,
  hint,
  placeholder,
  value,
  options,
  onChange,
}: {
  id: string;
  label: string;
  hint: string;
  placeholder: string;
  value: string | undefined;
  options: string[];
  onChange: (v: string | undefined) => void;
}) {
  const listId = `${id}-options`;
  const [text, setText] = useState(value ?? '');
  const [seen, setSeen] = useState(value);

  // Sync down from the criteria when something else changed them ("Clear all",
  // a removed chip, a re-parsed sentence) without clobbering live typing.
  if (seen !== value) {
    setSeen(value);
    if ((value ?? '') !== text.trim().toUpperCase()) setText(value ?? '');
  }

  const commit = () => {
    const code = text.trim().toUpperCase();
    const valid = /^[A-Z]{3}$/.test(code);
    // Anything that is not a complete code is cleared rather than kept, so the
    // box and the criteria can never disagree about where you are flying from.
    setText(valid ? code : '');
    onChange(valid ? code : undefined);
  };

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-xs font-medium text-muted">
        {label}
      </label>
      <input
        id={id}
        type="text"
        inputMode="text"
        autoComplete="off"
        spellCheck={false}
        maxLength={3}
        list={listId}
        placeholder={placeholder}
        aria-describedby={`${id}-hint`}
        value={text}
        onChange={(e) => setText(e.target.value.toUpperCase())}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            e.currentTarget.blur();
          }
        }}
        className="w-full rounded-md border border-border bg-surface-2 px-2 py-1.5 font-mono text-sm uppercase text-fg"
      />
      <datalist id={listId}>
        {options.map((iata) => (
          <option key={iata} value={iata} />
        ))}
      </datalist>
      <p id={`${id}-hint`} className="text-[11px] leading-snug text-muted">
        {hint}
      </p>
    </div>
  );
}

export function FilterPanel({ criteria, countries, airports, onChange, onReset }: FilterPanelProps) {
  const t = useT();
  const uid = useId();

  const set = (key: keyof SearchCriteria, value: unknown) => onChange(withCriterion(criteria, key, value));

  const toggleCountry = (code: string) => {
    const current = criteria.countries ?? [];
    const next = current.includes(code) ? current.filter((c) => c !== code) : [...current, code];
    set('countries', next);
  };

  return (
    <section aria-labelledby={`${uid}-filters`} className="rounded-xl border border-border bg-surface p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 id={`${uid}-filters`} className="text-sm font-semibold text-fg">
          {t('search.filters')}
        </h2>
        <button
          type="button"
          onClick={onReset}
          className="rounded-md border border-border px-2 py-1 text-xs text-muted hover:border-bad hover:text-bad"
        >
          {t('search.reset')}
        </button>
      </div>
      <p className="mt-1 text-xs text-muted">{t('search.filtersHint')}</p>

      <div className="mt-4 space-y-4">
        {/* ------------------------------------------------------------------
            The trip window.

            Dates, party size and origin airport are METADATA, not filters:
            they are carried into the outbound booking links and shown back as
            chips, and they leave the ranking byte-identical. Every one of them
            is optional and none has a default — there is deliberately no
            preselected origin airport, because assuming one would put a wrong
            departure into every flight link.
           ------------------------------------------------------------------ */}
        <fieldset className="rounded-lg border border-border p-3">
          <legend className="px-1 text-xs font-semibold text-fg">{t('search.trip')}</legend>
          <p className="text-[11px] leading-snug text-muted">{t('search.tripHint')}</p>
          <div className="mt-2.5 grid gap-3 sm:grid-cols-2">
            <DateField
              id={`${uid}-datefrom`}
              label={t('criteria.dateFrom')}
              value={criteria.dateFrom}
              onChange={(v) => set('dateFrom', v)}
            />
            <DateField
              id={`${uid}-dateto`}
              label={t('criteria.dateTo')}
              value={criteria.dateTo}
              min={criteria.dateFrom}
              onChange={(v) => set('dateTo', v)}
            />
            <NumberField
              id={`${uid}-adults`}
              label={t('criteria.adults')}
              value={criteria.adults}
              min={1}
              max={MAX_PARTY}
              onChange={(v) => set('adults', clampParty(v, 1))}
            />
            <NumberField
              id={`${uid}-children`}
              label={t('criteria.children')}
              value={criteria.children}
              min={0}
              max={MAX_PARTY}
              onChange={(v) => set('children', clampParty(v, 0))}
            />
          </div>
          <div className="mt-3">
            <AirportField
              id={`${uid}-origin`}
              label={t('criteria.originAirport')}
              hint={t('search.originHint')}
              placeholder={t('search.originPlaceholder')}
              value={criteria.originAirport}
              options={airports}
              onChange={(v) => set('originAirport', v)}
            />
          </div>
        </fieldset>

        {/* --- ability --- */}
        <div className="flex flex-col gap-1">
          <label htmlFor={`${uid}-ability`} className="text-xs font-medium text-muted">
            {t('criteria.ability')}
          </label>
          <select
            id={`${uid}-ability`}
            value={criteria.ability ?? ''}
            onChange={(e) => set('ability', e.target.value === '' ? undefined : (e.target.value as Ability))}
            className="w-full rounded-md border border-border bg-surface-2 px-2 py-1.5 text-sm text-fg"
          >
            <option value="">{t('criteria.any')}</option>
            {ABILITIES.map((a) => (
              <option key={a} value={a}>
                {t(abilityKey(a))}
              </option>
            ))}
          </select>
        </div>

        {/* --- countries --- */}
        {countries.length > 0 ? (
          <fieldset>
            <legend className="text-xs font-medium text-muted">{t('criteria.countries')}</legend>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {countries.map((code) => {
                const checked = (criteria.countries ?? []).includes(code);
                return (
                  <label
                    key={code}
                    className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${
                      checked ? 'border-accent bg-accent-soft text-fg' : 'border-border text-muted'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleCountry(code)}
                      className="h-3 w-3 accent-[var(--c-accent)]"
                    />
                    <span aria-hidden="true">{flagEmoji(code)}</span>
                    {countryName(code)}
                  </label>
                );
              })}
            </div>
          </fieldset>
        ) : null}

        {/* --- wants --- */}
        <fieldset>
          <legend className="text-xs font-medium text-muted">{t('search.filters')}</legend>
          <div className="mt-1.5 grid gap-1.5 sm:grid-cols-2">
            {VISIBLE_BOOLEAN_KEYS.map((key) => {
              const checked = Boolean((criteria as Record<string, unknown>)[key]);
              return (
                <label key={key} className="inline-flex cursor-pointer items-center gap-2 text-sm text-fg">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => set(key as keyof SearchCriteria, e.target.checked)}
                    className="h-4 w-4 accent-[var(--c-accent)]"
                  />
                  {t(CRITERION_LABEL[key])}
                </label>
              );
            })}
          </div>
        </fieldset>

        {/* --- numbers --- */}
        <div className="grid gap-3 sm:grid-cols-2">
          <NumberField
            id={`${uid}-price`}
            label={t('criteria.maxPassPricePerDay')}
            suffix={criteria.currency ?? 'EUR'}
            value={criteria.maxPassPricePerDay}
            min={0}
            step={5}
            onChange={(v) => set('maxPassPricePerDay', v)}
          />
          <NumberField
            id={`${uid}-transfer`}
            label={t('criteria.maxTransferMinutes')}
            suffix="min"
            value={criteria.maxTransferMinutes}
            min={0}
            step={15}
            onChange={(v) => set('maxTransferMinutes', v)}
          />
          <NumberField
            id={`${uid}-minkm`}
            label={t('criteria.minKm')}
            suffix="km"
            value={criteria.minKm}
            min={0}
            step={10}
            onChange={(v) => set('minKm', v)}
          />
          <NumberField
            id={`${uid}-minvert`}
            label={t('criteria.minVerticalM')}
            suffix="m"
            value={criteria.minVerticalM}
            min={0}
            step={100}
            onChange={(v) => set('minVerticalM', v)}
          />
          {SHOW_REGIONAL_LAYER ? (
            <NumberField
              id={`${uid}-chabad`}
              label={t('criteria.maxChabadDistanceKm')}
              suffix="km"
              value={criteria.maxChabadDistanceKm}
              min={0}
              step={10}
              onChange={(v) => set('maxChabadDistanceKm', v)}
            />
          ) : null}
        </div>
      </div>
    </section>
  );
}
