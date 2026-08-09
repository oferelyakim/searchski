'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { SearchCriteria, SearchResponse } from '@searchski/core/types';
import { useT } from '@/i18n/client';
import { countryName } from '@/lib/format';
import { withoutCriterion, type ChipKey } from '@/lib/criteria-ui';
import { CAST, type CastId } from '@/lib/interview/cast';
import {
  applyChips,
  initialInterviewState,
  skipToResults,
  STEPS,
  withParsedCriteria,
  type InterviewChip,
  type InterviewState,
} from '@/lib/interview/script';
import { crewCommentary, fillTemplate } from '@/lib/interview/commentary';
import { AvatarBadge, SpeakerLine } from './AvatarBadge';
import { CriteriaChips } from '../CriteriaChips';
import { ResultCard } from '../ResultCard';

const COMPARE_KEY = 'searchski.compare';
const MAX_COMPARE = 4;

/** One bubble in the transcript. */
interface Entry {
  id: number;
  kind: 'question' | 'answer' | 'reaction';
  speaker?: CastId;
  text: string;
}

/**
 * The interview.
 *
 * A chat-shaped front end over the same `SearchCriteria` object the classic
 * search edits directly. Chips apply deterministic patches; a typed answer on
 * the steps that allow it goes through /api/search's parser and lands in the
 * same shape. The transcript is theatre — the criteria object is the truth,
 * and it is shown back, editable, the moment results appear.
 *
 * Async choreography note: every awaited sequence checks `gen` against a ref
 * before touching state, so "start over" (which bumps the ref) makes any
 * in-flight sequence drop its writes instead of resurrecting a dead interview.
 */
export function InterviewExperience({ totalAtStart }: { totalAtStart: number }) {
  const t = useT();

  const [entries, setEntries] = useState<Entry[]>([]);
  const [iv, setIv] = useState<InterviewState>(initialInterviewState);
  const [typing, setTyping] = useState(false);
  const [count, setCount] = useState<number>(totalAtStart);
  const [multiSel, setMultiSel] = useState<string[]>([]);
  const [textOpen, setTextOpen] = useState(false);
  const [textValue, setTextValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [response, setResponse] = useState<SearchResponse | null>(null);
  const [resultsLoading, setResultsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [compare, setCompare] = useState<string[]>([]);

  const genRef = useRef(0);
  const idRef = useRef(0);
  const startedRef = useRef(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const push = useCallback((entry: Omit<Entry, 'id'>) => {
    idRef.current += 1;
    const withId = { ...entry, id: idRef.current };
    setEntries((prev) => [...prev, withId]);
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [entries, typing, response]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(COMPARE_KEY);
      const parsed: unknown = raw ? JSON.parse(raw) : null;
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

  const toggleCompare = (id: string) => {
    const next = compare.includes(id)
      ? compare.filter((c) => c !== id)
      : [...compare, id].slice(0, MAX_COMPARE);
    persistCompare(next);
  };

  /** POST /api/search. Returns null on any failure — callers degrade quietly. */
  const callSearch = useCallback(
    async (body: { query?: string; criteria?: SearchCriteria }): Promise<SearchResponse | null> => {
      try {
        const res = await fetch('/api/search', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        });
        const data = (await res.json()) as SearchResponse & { error?: string };
        return Array.isArray(data.results) ? data : null;
      } catch {
        return null;
      }
    },
    [],
  );

  /** The live "still in play" number. Fire-and-forget; a miss keeps the old count. */
  const refreshCount = useCallback(
    (criteria: SearchCriteria, gen: number) => {
      void callSearch({ criteria: { ...criteria, limit: 1 } }).then((resp) => {
        if (resp && gen === genRef.current) setCount(resp.totalConsidered);
      });
    },
    [callSearch],
  );

  const askStep = useCallback(
    async (state: InterviewState, gen: number) => {
      if (state.stepId === null || gen !== genRef.current) return;
      const step = STEPS[state.stepId];
      setTyping(true);
      await sleep(700);
      if (gen !== genRef.current) return;
      setTyping(false);
      push({ kind: 'question', speaker: step.speaker, text: t(step.promptKey) });
    },
    [push, t],
  );

  const finish = useCallback(
    async (state: InterviewState, gen: number) => {
      setResultsLoading(true);
      setError(null);
      const criteria: SearchCriteria = { ...state.criteria, limit: 12 };
      const resp = await callSearch({ criteria });
      if (gen !== genRef.current) return;
      setResultsLoading(false);
      if (!resp) {
        setError(t('search.error'));
        return;
      }
      setResponse(resp);
      setCount(resp.totalConsidered);
      push({
        kind: 'question',
        speaker: 'maya',
        text: fillTemplate(t('iv.done'), { n: String(resp.totalConsidered) }),
      });
    },
    [callSearch, push, t],
  );

  /** Speak reactions, then either ask the next question or finish. */
  const advance = useCallback(
    async (next: InterviewState, reactions: { speaker: CastId; textKey: string }[], gen: number) => {
      refreshCount(next.criteria, gen);
      for (const reaction of reactions) {
        await sleep(400);
        if (gen !== genRef.current) return;
        push({
          kind: 'reaction',
          speaker: reaction.speaker,
          // Reaction keys are MessageKeys by construction in the script.
          text: t(reaction.textKey as Parameters<typeof t>[0]),
        });
      }
      if (next.stepId === null) await finish(next, gen);
      else await askStep(next, gen);
    },
    [askStep, finish, push, refreshCount, t],
  );

  const chipLabel = useCallback(
    (chip: InterviewChip): string => {
      if (chip.label) return chip.label;
      if (chip.countryCode) return countryName(chip.countryCode);
      return chip.labelKey ? t(chip.labelKey) : chip.id;
    },
    [t],
  );

  const answerWithChips = useCallback(
    (chipIds: string[], label: string, typed?: { numberValue?: number; iataValue?: string }) => {
      if (iv.stepId === null || busy) return;
      const gen = genRef.current;
      push({ kind: 'answer', text: label });
      setMultiSel([]);
      setTextOpen(false);
      setTextValue('');
      const { state: next, reactions } = applyChips(iv, chipIds, typed);
      setIv(next);
      void advance(next, reactions, gen);
    },
    [advance, busy, iv, push],
  );

  /** A typed answer on a 'parse' step: the server's parser reads it. */
  const answerWithText = useCallback(async () => {
    const text = textValue.trim();
    if (iv.stepId === null || text === '' || busy) return;
    const step = STEPS[iv.stepId];
    const gen = genRef.current;

    if (step.freeText === 'number') {
      const match = text.replace(/[,\s]/g, '').match(/\d+(?:\.\d+)?/);
      if (!match) return;
      answerWithChips([], text, { numberValue: Number(match[0]) });
      return;
    }
    if (step.freeText === 'iata') {
      const match = text.toUpperCase().match(/\b[A-Z]{3}\b/);
      if (!match) return;
      answerWithChips([], text, { iataValue: match[0] });
      return;
    }

    // 'parse' — one round trip; the response doubles as the count refresh.
    push({ kind: 'answer', text });
    setBusy(true);
    setTextOpen(false);
    setTextValue('');
    const resp = await callSearch({ query: text, criteria: { ...iv.criteria, limit: 1 } });
    if (gen !== genRef.current) return;
    setBusy(false);
    if (resp) {
      const { limit: _limit, ...parsed } = resp.criteria;
      const next = withParsedCriteria(iv, parsed);
      setIv(next);
      setCount(resp.totalConsidered);
      void advance(next, [], gen);
    } else {
      // Parser unreachable: keep the interview moving rather than trapping the
      // user on a dead step. Their text is lost and we say nothing false.
      const { state: next } = applyChips(iv, []);
      setIv(next);
      void advance(next, [], gen);
    }
  }, [advance, answerWithChips, busy, callSearch, iv, push, textValue]);

  const onSkip = useCallback(() => {
    if (busy) return;
    const gen = genRef.current;
    const next = skipToResults(iv);
    setIv(next);
    void finish(next, gen);
  }, [busy, finish, iv]);

  const onRestart = useCallback(() => {
    genRef.current += 1;
    const gen = genRef.current;
    setEntries([]);
    setIv(initialInterviewState());
    setResponse(null);
    setError(null);
    setTyping(false);
    setBusy(false);
    setMultiSel([]);
    setTextOpen(false);
    setTextValue('');
    setCount(totalAtStart);
    void askStep(initialInterviewState(), gen);
  }, [askStep, totalAtStart]);

  // Opening line, once. The ref guards React strict-mode's double effect.
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    void askStep(initialInterviewState(), genRef.current);
  }, [askStep]);

  /** Re-run the finished search after a chip edit or a date change. */
  const rerun = useCallback(
    (criteria: SearchCriteria, facts: InterviewState['facts']) => {
      const gen = genRef.current;
      const nextState: InterviewState = { criteria, facts, stepId: null };
      setIv(nextState);
      setResultsLoading(true);
      void callSearch({ criteria: { ...criteria, limit: 12 } }).then((resp) => {
        if (gen !== genRef.current) return;
        setResultsLoading(false);
        if (resp) {
          setResponse(resp);
          setCount(resp.totalConsidered);
        }
      });
    },
    [callSearch],
  );

  const onRemoveChip = (key: ChipKey) => {
    const facts =
      key === 'dateFrom' || key === 'dateTo' ? { ...iv.facts, datesAssumed: false } : iv.facts;
    rerun(withoutCriterion(iv.criteria, key), facts);
  };

  const onDateChange = (key: 'dateFrom' | 'dateTo', value: string) => {
    const criteria: SearchCriteria = { ...iv.criteria };
    if (value === '') delete criteria[key];
    else criteria[key] = value;
    rerun(criteria, { ...iv.facts, datesAssumed: false });
  };

  const step = iv.stepId === null ? null : STEPS[iv.stepId];
  const commentary = response ? crewCommentary(iv, response) : [];

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      {/* The counter: the interview visibly narrowing the world. */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p aria-live="polite" className="rounded-full border border-border bg-surface px-3 py-1 text-xs text-muted">
          {fillTemplate(t('iv.count'), { n: count.toLocaleString() })}
        </p>
        <div className="flex items-center gap-3 text-xs">
          {iv.stepId !== null && iv.stepId !== 'party' ? (
            <button type="button" onClick={onSkip} className="text-accent underline-offset-2 hover:underline">
              {t('iv.skip')}
            </button>
          ) : null}
          {iv.stepId === null || iv.stepId !== 'party' ? (
            <button type="button" onClick={onRestart} className="text-muted underline-offset-2 hover:underline">
              {t('iv.restart')}
            </button>
          ) : null}
          <Link href="/search" className="text-muted no-underline underline-offset-2 hover:text-fg hover:underline">
            {t('iv.classic')}
          </Link>
        </div>
      </div>

      {/* Transcript */}
      <div className="space-y-3" aria-live="polite">
        {entries.map((entry) =>
          entry.kind === 'answer' ? (
            <div key={entry.id} className="flex justify-end">
              <div className="max-w-[85%] rounded-2xl rounded-ee-md bg-accent px-3.5 py-2 text-sm text-accent-fg">
                {entry.text}
              </div>
            </div>
          ) : (
            <div key={entry.id} className="flex items-end gap-2">
              <AvatarBadge id={entry.speaker ?? 'maya'} />
              <div className="max-w-[85%] space-y-0.5">
                <SpeakerLine id={entry.speaker ?? 'maya'} role={t(CAST[entry.speaker ?? 'maya'].roleKey)} />
                <div
                  className={`rounded-2xl rounded-es-md border border-border bg-surface px-3.5 py-2 text-sm text-fg ${
                    entry.kind === 'reaction' ? 'border-s-2' : ''
                  }`}
                  style={entry.kind === 'reaction' ? { borderInlineStartColor: CAST[entry.speaker ?? 'maya'].color } : undefined}
                >
                  {entry.text}
                </div>
              </div>
            </div>
          ),
        )}

        {typing || busy ? (
          <div className="flex items-end gap-2">
            <AvatarBadge id={step?.speaker ?? 'maya'} />
            <div className="rounded-2xl rounded-es-md border border-border bg-surface px-4 py-3">
              <span className="typing-dots" aria-label={t('iv.typing')}>
                <span /><span /><span />
              </span>
            </div>
          </div>
        ) : null}
      </div>

      {/* Answer controls for the current step */}
      {step !== null && !typing && !busy ? (
        <div className="rounded-xl border border-border bg-surface p-3">
          <div className="flex flex-wrap gap-2">
            {step.chips.map((chip) => {
              const selected = multiSel.includes(chip.id);
              return (
                <button
                  key={chip.id}
                  type="button"
                  aria-pressed={step.multi ? selected : undefined}
                  onClick={() => {
                    if (step.multi) {
                      setMultiSel((prev) =>
                        prev.includes(chip.id) ? prev.filter((c) => c !== chip.id) : [...prev, chip.id],
                      );
                    } else {
                      answerWithChips([chip.id], chipLabel(chip));
                    }
                  }}
                  className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
                    selected
                      ? 'border-accent bg-accent text-accent-fg'
                      : 'border-border bg-bg text-fg hover:border-accent hover:text-accent'
                  }`}
                >
                  {chipLabel(chip)}
                </button>
              );
            })}
            {step.freeText ? (
              <button
                type="button"
                onClick={() => setTextOpen((v) => !v)}
                className="rounded-full border border-dashed border-border px-3 py-1.5 text-sm text-muted hover:border-accent hover:text-accent"
              >
                {t('iv.other')}
              </button>
            ) : null}
          </div>

          {step.multi ? (
            <button
              type="button"
              onClick={() =>
                answerWithChips(
                  multiSel,
                  multiSel.length === 0
                    ? t('iv.noPreference')
                    : multiSel
                        .map((id) => {
                          const chip = step.chips.find((c) => c.id === id);
                          return chip ? chipLabel(chip) : id;
                        })
                        .join(' · '),
                )
              }
              className="mt-2.5 rounded-lg bg-accent px-3.5 py-1.5 text-sm font-medium text-accent-fg"
            >
              {t('iv.confirm')}
            </button>
          ) : null}

          {textOpen && step.freeText ? (
            <form
              className="mt-2.5 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void answerWithText();
              }}
            >
              <input
                autoFocus
                value={textValue}
                onChange={(e) => setTextValue(e.target.value)}
                placeholder={step.freeTextKey ? t(step.freeTextKey) : ''}
                className="min-w-0 flex-1 rounded-lg border border-border bg-bg px-3 py-1.5 text-sm text-fg placeholder:text-muted"
              />
              <button type="submit" className="rounded-lg bg-accent px-3.5 py-1.5 text-sm font-medium text-accent-fg">
                {t('iv.send')}
              </button>
            </form>
          ) : null}
        </div>
      ) : null}

      {error ? <p className="text-sm text-bad">{error}</p> : null}
      {resultsLoading ? <p className="text-sm text-muted">{t('search.searching')}</p> : null}

      {/* Results */}
      {response !== null && iv.stepId === null ? (
        <div className="space-y-4">
          {iv.facts.datesAssumed && iv.criteria.dateFrom && iv.criteria.dateTo ? (
            <div className="rounded-xl border border-warn/40 bg-warn/10 p-3 text-xs text-fg">
              <p className="mb-2 text-warn">{t('iv.assumedDates')}</p>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="date"
                  value={iv.criteria.dateFrom}
                  onChange={(e) => onDateChange('dateFrom', e.target.value)}
                  className="rounded-lg border border-border bg-bg px-2 py-1 text-fg"
                  aria-label={t('criteria.dateFrom')}
                />
                <span aria-hidden="true">→</span>
                <input
                  type="date"
                  value={iv.criteria.dateTo}
                  onChange={(e) => onDateChange('dateTo', e.target.value)}
                  className="rounded-lg border border-border bg-bg px-2 py-1 text-fg"
                  aria-label={t('criteria.dateTo')}
                />
              </div>
            </div>
          ) : null}

          <CriteriaChips criteria={response.criteria} parsedBy={response.parsedBy} onRemove={onRemoveChip} />

          {commentary.length > 0 ? (
            <section aria-labelledby="crew-heading" className="rounded-xl border border-border bg-surface p-4">
              <h2 id="crew-heading" className="text-sm font-semibold text-fg">
                {t('iv.crewHeading')}
              </h2>
              <ul className="mt-2 space-y-2">
                {commentary.map((line, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-fg">
                    <AvatarBadge id={line.speaker} size={24} />
                    <span>
                      <span className="font-semibold" style={{ color: CAST[line.speaker].color }}>
                        {CAST[line.speaker].name}:
                      </span>{' '}
                      {fillTemplate(t(line.key), line.values)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {typeof iv.facts.budgetPerPersonUsd === 'number' ? (
            <p className="text-xs text-muted">
              {fillTemplate(t('iv.budgetNote'), {
                budget: `$${iv.facts.budgetPerPersonUsd.toLocaleString('en-US')}`,
              })}
            </p>
          ) : null}

          <section aria-label={t('search.results')}>
            {response.results.length === 0 ? (
              <p className="text-sm text-muted">{t('search.noResults')}</p>
            ) : (
              <ul className="space-y-3">
                {response.results.map((result) => (
                  <li key={result.area.id}>
                    <ResultCard
                      result={result}
                      selected={compare.includes(result.area.id)}
                      canSelect={compare.length < MAX_COMPARE || compare.includes(result.area.id)}
                      onToggleCompare={toggleCompare}
                      criteria={response.criteria}
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      ) : null}

      <div ref={bottomRef} />
    </div>
  );
}
