'use client';

import { useId } from 'react';
import type { Ability, SearchCriteria } from '@searchski/core/types';
import { useT } from '@/i18n/client';
import { ABILITIES, abilityKey, CRITERION_LABEL, VISIBLE_BOOLEAN_KEYS, withCriterion } from '@/lib/criteria-ui';
import { countryName, flagEmoji } from '@/lib/format';
import { SHOW_REGIONAL_LAYER } from '@/lib/features';

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
          <div className="flex flex-col gap-1">
            <label htmlFor={`${uid}-airport`} className="text-xs font-medium text-muted">
              {t('criteria.originAirport')}
            </label>
            <select
              id={`${uid}-airport`}
              value={criteria.originAirport ?? ''}
              onChange={(e) => set('originAirport', e.target.value === '' ? undefined : e.target.value)}
              className="w-full rounded-md border border-border bg-surface-2 px-2 py-1.5 text-sm text-fg"
            >
              <option value="">{t('criteria.any')}</option>
              {airports.map((iata) => (
                <option key={iata} value={iata}>
                  {iata}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
    </section>
  );
}
