'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ScoredResult, SearchCriteria, SearchResponse } from '@searchski/core/types';
import { useI18n } from '@/i18n/client';
import { withoutCriterion, type ChipKey } from '@/lib/criteria-ui';
import { countryName } from '@/lib/format';
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
import { CrewMeeting } from './CrewMeeting';
import { RefinePanel, type RefineChip } from './RefinePanel';
import { ResortCardCompact } from './ResortCardCompact';
import { ResortModal } from './ResortModal';

/** Criteria keys whose change means the search genuinely moved. */
function changedCriteriaKeys(before: SearchCriteria, after: SearchCriteria): string[] {
  const ignore = new Set(['rawQuery', 'limit']);
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const changed: string[] = [];
  for (const key of keys) {
    if (ignore.has(key)) continue;
    const a = (before as Record<string, unknown>)[key];
    const b = (after as Record<string, unknown>)[key];
    if (JSON.stringify(a) !== JSON.stringify(b)) changed.push(key);
  }
  return changed;
}

/** Which specialist owns a set of changed criteria keys. */
function speakerForKeys(keys: string[]): CastId {
  const owner: [RegExp, CastId][] = [
    [/minKm|maxKm|wantSnowsure|wantNightSki|wantUncrowded|wantShortLiftQueues|minVerticalM|minTopElevM|ability/i, 'marco'],
    [/originAirport/i, 'jonas'],
    [/maxTransferMinutes/i, 'tomer'],
    [/wantFamily|children/i, 'noa'],
    [/wantSkiInSkiOut|wantApres/i, 'lena'],
  ];
  for (const [pattern, speaker] of owner) {
    if (keys.some((key) => pattern.test(key))) return speaker;
  }
  return 'maya';
}

/** One bubble in the transcript. */
interface Entry {
  id: number;
  kind: 'question' | 'answer' | 'reaction';
  speaker?: CastId;
  text: string;
}

/**
 * The interview, in two phases.
 *
 * PHASE 1 — the chat, centered and alone, exactly a text conversation.
 * PHASE 2 — results: the layout splits. Resort cards take the wide column;
 * the SAME chat continues in a side panel with refinement chips and a
 * free-text box, so "make them bigger" is a conversation turn, not a filter
 * form. A card click opens the full dossier + booking modal.
 *
 * The chat is theatre over one `SearchCriteria` object — chips patch it
 * deterministically, typed text goes through the server parser, and the
 * criteria stay visible and editable above the results at all times.
 *
 * Async choreography note: every awaited sequence checks `gen` against a ref
 * before touching state, so "start over" (which bumps the ref) makes any
 * in-flight sequence drop its writes instead of resurrecting a dead interview.
 */
export function InterviewExperience({ totalAtStart }: { totalAtStart: number }) {
  const { t, locale } = useI18n();

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
  const [selected, setSelected] = useState<ScoredResult | null>(null);

  const genRef = useRef(0);
  const idRef = useRef(0);
  const startedRef = useRef(false);
  const transcriptEndRef = useRef<HTMLDivElement>(null);

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const push = useCallback((entry: Omit<Entry, 'id'>) => {
    idRef.current += 1;
    const withId = { ...entry, id: idRef.current };
    setEntries((prev) => [...prev, withId]);
  }, []);

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [entries, typing]);

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
    setSelected(null);
    setCount(totalAtStart);
    void askStep(initialInterviewState(), gen);
  }, [askStep, totalAtStart]);

  // Opening line, once. The ref guards React strict-mode's double effect.
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    void askStep(initialInterviewState(), genRef.current);
  }, [askStep]);

  // -------------------------------------------------------------------------
  // Refinement (results phase): the chat keeps going.
  // -------------------------------------------------------------------------

  /**
   * The crew's reply to a refinement. Tries the Haiku-backed /api/chat for a
   * genuinely conversational, grounded acknowledgment; falls back to the
   * fixed dictionary line when the model is off, over budget, or slow. The
   * fallback is honest about the one case that felt dead in testing: a
   * request the parser could not turn into any change says so instead of
   * pretending it worked.
   */
  const crewAck = useCallback(
    async (
      input: {
        userMessage: string | null;
        actionLabel: string | null;
        changedKeys: string[];
        totalBefore: number;
      },
      resp: SearchResponse,
      gen: number,
    ) => {
      const speaker = speakerForKeys(input.changedKeys);
      const member = CAST[speaker];
      const fallback =
        input.changedKeys.length === 0 && input.userMessage !== null
          ? t('iv.noChange')
          : fillTemplate(t('iv.refined'), { n: String(resp.totalConsidered) });

      let reply: string | null = null;
      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            speakerName: member.name,
            speakerRole: t(member.roleKey),
            locale,
            userMessage: input.userMessage,
            actionLabel: input.actionLabel,
            changedKeys: input.changedKeys,
            totalBefore: input.totalBefore,
            totalAfter: resp.totalConsidered,
            topResults: resp.results.slice(0, 4).map((r) => ({
              name: r.area.name,
              country: r.area.country,
              km: Math.round(r.area.kmTotal),
              score: Math.round(r.score),
            })),
            criteria: resp.criteria,
          }),
        });
        const data = (await res.json()) as { reply?: string | null };
        reply = typeof data.reply === 'string' && data.reply.trim() !== '' ? data.reply : null;
      } catch {
        reply = null;
      }
      if (gen !== genRef.current) return;
      push({ kind: 'reaction', speaker, text: reply ?? fallback });
    },
    [locale, push, t],
  );

  /** Re-run the finished search; `ack` carries what to react to, or null for silent edits. */
  const rerun = useCallback(
    async (
      criteria: SearchCriteria,
      facts: InterviewState['facts'],
      ack: { userMessage: string | null; actionLabel: string | null } | null,
    ) => {
      const gen = genRef.current;
      const before = iv.criteria;
      const totalBefore = count;
      setIv({ criteria, facts, stepId: null });
      setBusy(true);
      const resp = await callSearch({ criteria: { ...criteria, limit: 12 } });
      if (gen !== genRef.current) return;
      setBusy(false);
      if (!resp) {
        setError(t('search.error'));
        return;
      }
      setError(null);
      const { limit: _limit, ...clean } = resp.criteria;
      setIv({ criteria: clean, facts, stepId: null });
      setResponse(resp);
      setCount(resp.totalConsidered);
      if (ack) {
        void crewAck(
          { ...ack, changedKeys: changedCriteriaKeys(before, clean), totalBefore },
          resp,
          gen,
        );
      }
    },
    [callSearch, count, crewAck, iv.criteria, t],
  );

  const onToggleRefineChip = useCallback(
    (chip: RefineChip, active: boolean) => {
      if (busy) return;
      const label = `${active ? '− ' : '+ '}${t(chip.labelKey)}`;
      push({ kind: 'answer', text: label });
      let criteria: Record<string, unknown> = { ...iv.criteria };
      if (active) {
        for (const key of Object.keys(chip.patch)) delete criteria[key];
      } else {
        criteria = { ...criteria, ...chip.patch };
      }
      void rerun(criteria as SearchCriteria, iv.facts, {
        userMessage: null,
        actionLabel: label,
      });
    },
    [busy, iv, push, rerun, t],
  );

  const onRefineText = useCallback(
    async (text: string) => {
      if (busy) return;
      const gen = genRef.current;
      const before = iv.criteria;
      const totalBefore = count;
      push({ kind: 'answer', text });
      setBusy(true);
      const resp = await callSearch({ query: text, criteria: { ...iv.criteria, limit: 12 } });
      if (gen !== genRef.current) return;
      setBusy(false);
      if (!resp) {
        setError(t('search.error'));
        return;
      }
      setError(null);
      const { limit: _limit, ...clean } = resp.criteria;
      setIv({ criteria: clean, facts: iv.facts, stepId: null });
      setResponse(resp);
      setCount(resp.totalConsidered);
      void crewAck(
        {
          userMessage: text,
          actionLabel: null,
          changedKeys: changedCriteriaKeys(before, clean),
          totalBefore,
        },
        resp,
        gen,
      );
    },
    [busy, callSearch, count, crewAck, iv, push, t],
  );

  const onRemoveChip = (key: ChipKey) => {
    const facts =
      key === 'dateFrom' || key === 'dateTo' ? { ...iv.facts, datesAssumed: false } : iv.facts;
    void rerun(withoutCriterion(iv.criteria, key), facts, null);
  };

  const onDateChange = (key: 'dateFrom' | 'dateTo', value: string) => {
    const criteria: SearchCriteria = { ...iv.criteria };
    if (value === '') delete criteria[key];
    else criteria[key] = value;
    void rerun(criteria, { ...iv.facts, datesAssumed: false }, null);
  };

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  const step = iv.stepId === null ? null : STEPS[iv.stepId];
  const inResults = iv.stepId === null && response !== null;
  const commentary = response ? crewCommentary(iv, response) : [];

  // Whoever spoke last holds the big tile; while "typing", the upcoming
  // speaker takes it, so the camera cuts to them before the words land.
  const lastSpoken = [...entries].reverse().find((e) => e.kind !== 'answer');
  const activeSpeaker: CastId =
    typing && step ? step.speaker : (lastSpoken?.speaker ?? 'maya');

  // Relative match strength within the visible set, for the card wash.
  const scores = response?.results.map((r) => r.score) ?? [];
  const minScore = scores.length > 0 ? Math.min(...scores) : 0;
  const maxScore = scores.length > 0 ? Math.max(...scores) : 1;
  const tintFor = (score: number) =>
    maxScore > minScore ? (score - minScore) / (maxScore - minScore) : 0.5;

  const topBar = (
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
  );

  const transcript = (
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
            <AvatarBadge id={entry.speaker ?? 'maya'} size={inResults ? 28 : 36} />
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
          <AvatarBadge id={step?.speaker ?? 'maya'} size={inResults ? 28 : 36} />
          <div className="rounded-2xl rounded-es-md border border-border bg-surface px-4 py-3">
            <span className="typing-dots" aria-label={t('iv.typing')}>
              <span /><span /><span />
            </span>
          </div>
        </div>
      ) : null}
      <div ref={transcriptEndRef} />
    </div>
  );

  const answerControls =
    step !== null && !typing && !busy ? (
      <div className="rounded-xl border border-border bg-surface p-3">
        <div className="flex flex-wrap gap-2">
          {step.chips.map((chip) => {
            const chipSelected = multiSel.includes(chip.id);
            return (
              <button
                key={chip.id}
                type="button"
                aria-pressed={step.multi ? chipSelected : undefined}
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
                  chipSelected
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
    ) : null;

  // ------------------------------------------------------------------
  // PHASE 1 — the interview, centered.
  // ------------------------------------------------------------------
  if (!inResults) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        {topBar}
        <CrewMeeting active={activeSpeaker} speaking={typing || busy} />
        {transcript}
        {answerControls}
        {error ? <p className="text-sm text-bad">{error}</p> : null}
        {resultsLoading ? <p className="text-sm text-muted">{t('search.searching')}</p> : null}
      </div>
    );
  }

  // ------------------------------------------------------------------
  // PHASE 2 — results: cards wide, the chat continues at the side.
  // ------------------------------------------------------------------
  return (
    <div className="space-y-4">
      {topBar}

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* Wide column: what the crew found. */}
        <div className="min-w-0 space-y-4">
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
            <section aria-labelledby="crew-heading" className="rounded-xl border border-border bg-surface p-3">
              <h2 id="crew-heading" className="sr-only">
                {t('iv.crewHeading')}
              </h2>
              <ul className="flex flex-wrap gap-x-6 gap-y-1.5">
                {commentary.map((line, i) => (
                  <li key={i} className="flex items-center gap-1.5 text-xs text-fg">
                    <AvatarBadge id={line.speaker} size={18} />
                    <span>{fillTemplate(t(line.key), line.values)}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {error ? <p className="text-sm text-bad">{error}</p> : null}

          <section aria-label={t('search.results')}>
            {response.results.length === 0 ? (
              <p className="text-sm text-muted">{t('search.noResults')}</p>
            ) : (
              <>
                <p className="mb-2 text-[11px] text-muted">{t('iv.shadeLegend')}</p>
                <ul className={`grid grid-cols-1 gap-3 sm:grid-cols-2 ${busy ? 'opacity-60' : ''}`}>
                  {response.results.map((result) => (
                    <li key={result.area.id}>
                      <ResortCardCompact
                        result={result}
                        onOpen={setSelected}
                        tint={tintFor(result.score)}
                      />
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        </div>

        {/* Side panel: the conversation, still alive. First on mobile so the
            refine box is one thumb away; side column on desktop. */}
        <aside className="order-first min-w-0 space-y-3 rounded-xl border border-border bg-surface p-3 lg:sticky lg:top-16 lg:order-none">
          <CrewMeeting active={activeSpeaker} speaking={busy} compact />
          <div className="max-h-40 space-y-3 overflow-y-auto pe-1 lg:max-h-[38dvh]">{transcript}</div>
          <RefinePanel
            criteria={iv.criteria}
            busy={busy}
            onToggleChip={onToggleRefineChip}
            onFreeText={(text) => void onRefineText(text)}
          />
          <p className="text-[10px] leading-snug text-muted">{t('iv.aiNote')}</p>
        </aside>
      </div>

      {selected ? (
        <ResortModal result={selected} criteria={iv.criteria} onClose={() => setSelected(null)} />
      ) : null}
    </div>
  );
}
