'use client';

import Link from 'next/link';
import { useCallback, useEffect, useId, useState } from 'react';
import type { SearchCriteria, SearchResponse } from '@searchski/core/types';
import { useT } from '@/i18n/client';
import { clearedCriteria, countCriteria, withoutCriterion, type ChipKey } from '@/lib/criteria-ui';
import { CriteriaChips } from './CriteriaChips';
import { FilterPanel } from './FilterPanel';
import { ResultCard } from './ResultCard';

const COMPARE_KEY = 'searchski.compare';
const MAX_COMPARE = 4;

export interface SearchExperienceProps {
  initialResponse: SearchResponse;
  countries: string[];
  airports: string[];
}

/**
 * The search page.
 *
 * One `SearchCriteria` object is the single source of truth. Free text is
 * parsed into it on the server; the chips and the filter panel edit it
 * directly. Editing a chip or a filter re-runs the search with the criteria as
 * given and does NOT re-parse the sentence — otherwise removing a chip the
 * parser got wrong would immediately put it back, which is exactly the
 * frustration this UI exists to prevent.
 */
export function SearchExperience({ initialResponse, countries, airports }: SearchExperienceProps) {
  const t = useT();
  const inputId = useId();
  const [text, setText] = useState(initialResponse.criteria.rawQuery ?? '');
  const [criteria, setCriteria] = useState<SearchCriteria>(initialResponse.criteria);
  const [response, setResponse] = useState<SearchResponse>(initialResponse);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [compare, setCompare] = useState<string[]>([]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(COMPARE_KEY);
      if (!raw) return;
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        setCompare(parsed.filter((v): v is string => typeof v === 'string').slice(0, MAX_COMPARE));
      }
    } catch {
      // A corrupt localStorage entry is not worth a broken page.
    }
  }, []);

  const persistCompare = useCallback((ids: string[]) => {
    setCompare(ids);
    try {
      window.localStorage.setItem(COMPARE_KEY, JSON.stringify(ids));
    } catch {
      // Private mode / quota. The in-memory selection still works.
    }
  }, []);

  const run = useCallback(
    async (body: { query?: string; criteria?: SearchCriteria }) => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch('/api/search', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        });
        const data = (await res.json()) as SearchResponse & { error?: string };
        if (data.error) setError(data.error);
        if (Array.isArray(data.results)) {
          setResponse(data);
          setCriteria(data.criteria ?? {});
        }
      } catch {
        setError(t('search.error'));
      } finally {
        setLoading(false);
      }
    },
    [t],
  );

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    void run({ query: text });
  };

  const onCriteriaChange = (next: SearchCriteria) => {
    setCriteria(next);
    void run({ criteria: next });
  };

  const onRemoveChip = (key: ChipKey) => onCriteriaChange(withoutCriterion(criteria, key));

  const onReset = () => {
    const next = clearedCriteria(criteria);
    setCriteria(next);
    void run({ criteria: next });
  };

  const toggleCompare = (id: string) => {
    const next = compare.includes(id)
      ? compare.filter((c) => c !== id)
      : [...compare, id].slice(0, MAX_COMPARE);
    persistCompare(next);
  };

  const activeCount = countCriteria(criteria);

  return (
    <div className="space-y-5">
      <form onSubmit={onSubmit} className="rounded-xl border border-border bg-surface p-4">
        <label htmlFor={inputId} className="block text-base font-semibold text-fg">
          {t('search.heading')}
        </label>
        <p className="sr-only" id={`${inputId}-help`}>
          {t('search.inputLabel')}
        </p>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <input
            id={inputId}
            name="query"
            type="search"
            value={text}
            onChange={(e) => setText(e.target.value)}
            aria-describedby={`${inputId}-help`}
            placeholder={t('search.placeholder')}
            className="min-w-0 flex-1 rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-sm text-fg placeholder:text-muted"
          />
          <button
            type="submit"
            disabled={loading}
            className="shrink-0 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-accent-fg disabled:opacity-60"
          >
            {loading ? t('search.searching') : t('search.submit')}
          </button>
        </div>
      </form>

      <CriteriaChips criteria={criteria} parsedBy={response.parsedBy} onRemove={onRemoveChip} />

      {error ? (
        <p role="alert" className="rounded-lg border border-bad/40 bg-bad/10 px-3 py-2 text-sm text-bad">
          {error}
        </p>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]">
        <div className="lg:sticky lg:top-4 lg:self-start">
          <FilterPanel
            criteria={criteria}
            countries={countries}
            airports={airports}
            onChange={onCriteriaChange}
            onReset={onReset}
          />
        </div>

        <div>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold text-fg">
              {t('search.results')}{' '}
              <span className="font-normal text-muted">
                — {response.results.length} of {response.totalConsidered} {t('search.resultsCount')}
                {activeCount > 0 ? ` · ${activeCount} criteria` : ''}
              </span>
            </h2>
            {compare.length > 0 ? (
              <Link
                href={`/compare?ids=${compare.map(encodeURIComponent).join(',')}`}
                className="rounded-md border border-accent px-2.5 py-1.5 text-xs font-medium text-accent no-underline"
              >
                {t('nav.compare')} ({compare.length})
              </Link>
            ) : null}
          </div>

          {response.relaxedFilters && response.relaxedFilters.length > 0 ? (
            <p className="mt-2 rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-xs text-warn">
              {t('search.relaxed')} {response.relaxedFilters.join(', ')}
            </p>
          ) : null}

          <div aria-live="polite" aria-busy={loading} className="mt-3 space-y-3">
            {response.results.length === 0 ? (
              <p className="rounded-lg border border-border bg-surface p-4 text-sm text-muted">
                {t('search.noResults')}
              </p>
            ) : (
              response.results.map((result) => (
                <ResultCard
                  key={result.area.id}
                  result={result}
                  criteria={criteria}
                  selected={compare.includes(result.area.id)}
                  canSelect={compare.length < MAX_COMPARE}
                  onToggleCompare={toggleCompare}
                />
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
