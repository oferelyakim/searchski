'use client';

import Link from 'next/link';
import { useCallback, useId, useState } from 'react';
import type { ScoredResult, SearchCriteria } from '@searchski/core/types';
import { useT } from '@/i18n/client';
import { ScoreBreakdown, TopFactors } from './ScoreBreakdown';
import { BoundaryNote, CountryList } from './AreaFacts';
import { NameMatchBadge } from './NameMatchBadge';
import { crowdingBucket, km, metres, minutesToHm, nightSkiState } from '@/lib/format';

export interface ResultCardProps {
  result: ScoredResult;
  selected: boolean;
  canSelect: boolean;
  onToggleCompare: (id: string) => void;
  /** Passed to /api/explain so the prose describes THIS search. */
  criteria: SearchCriteria;
}

function ScoreDial({ score }: { score: number }) {
  const t = useT();
  const clamped = Math.max(0, Math.min(100, score));
  return (
    <div className="flex shrink-0 flex-col items-center">
      <div
        className="relative grid h-14 w-14 place-items-center rounded-full"
        style={{
          background: `conic-gradient(var(--c-accent) ${clamped * 3.6}deg, var(--c-border) 0deg)`,
        }}
        role="img"
        aria-label={`${t('result.score')}: ${clamped.toFixed(0)} out of 100`}
      >
        <span className="grid h-11 w-11 place-items-center rounded-full bg-surface font-mono text-sm font-semibold text-fg">
          {clamped.toFixed(0)}
        </span>
      </div>
      <span className="mt-1 text-[10px] uppercase tracking-wide text-muted">{t('result.score')}</span>
    </div>
  );
}

export function ResultCard({
  result,
  selected,
  canSelect,
  onToggleCompare,
  criteria,
}: ResultCardProps) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [explanation, setExplanation] = useState<string | null>(null);
  const [explaining, setExplaining] = useState(false);
  const [explainTried, setExplainTried] = useState(false);
  const panelId = useId();
  const { area } = result;
  const crowding = crowdingBucket(area);
  const night = nightSkiState(area);

  /**
   * The prose explanation is fetched lazily, once, when the user opens THIS
   * card's breakdown — never for a whole page of results, because each call
   * costs money. It is additive: the factor breakdown renders regardless, and
   * a null result simply means no extra paragraph.
   */
  const openBreakdown = useCallback(() => {
    setOpen((wasOpen) => {
      if (wasOpen) return false;
      if (!explainTried) {
        setExplainTried(true);
        setExplaining(true);
        void (async () => {
          try {
            const res = await fetch(`/api/explain/${encodeURIComponent(area.id)}`, {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ criteria }),
            });
            const data = (await res.json()) as { explanation: string | null };
            setExplanation(typeof data.explanation === 'string' ? data.explanation : null);
          } catch {
            setExplanation(null);
          } finally {
            setExplaining(false);
          }
        })();
      }
      return true;
    });
  }, [area.id, criteria, explainTried]);

  return (
    <article className="rounded-xl border border-border bg-surface p-4 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold leading-tight">
            <Link href={`/resort/${encodeURIComponent(area.id)}`} className="text-fg no-underline hover:text-accent">
              {area.name}
            </Link>
          </h3>
          <p className="mt-0.5 text-xs text-muted">
            <CountryList area={area} />
            {area.regionName ? ` · ${area.regionName}` : ''}
          </p>

          <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
            <div className="flex gap-1">
              <dt className="sr-only">{t('resort.pistes')}</dt>
              <dd className="font-mono text-fg">{km(area.kmTotal, 0)}</dd>
              <dd>{t('resort.pistes')}</dd>
            </div>
            <div className="flex gap-1">
              <dt className="sr-only">{t('resort.vertical')}</dt>
              <dd className="font-mono text-fg">{metres(area.verticalM)}</dd>
              <dd>{t('resort.vertical')}</dd>
            </div>
            <div className="flex gap-1">
              <dt className="sr-only">{t('resort.liftsTotal')}</dt>
              <dd className="font-mono text-fg">{area.liftsTotal}</dd>
              <dd>{t('resort.liftsTotal')}</dd>
            </div>
            {result.transfer ? (
              <div className="flex gap-1">
                <dt className="sr-only">{t('resort.travel')}</dt>
                <dd className="font-mono text-fg">{minutesToHm(result.transfer.driveMinutes)}</dd>
                <dd>
                  {t('resort.driveTime')} · {result.transfer.airportIata}
                </dd>
              </div>
            ) : null}
          </dl>

          {/* The km figure above is only honest with this note beside it. */}
          <BoundaryNote area={area} compact />

          {/*
            A pinned result can sit above a higher score. Say so, or the
            ranking looks broken. Renders directly under the title so the
            explanation is adjacent to the surprise.
          */}
          {result.nameMatch ? <NameMatchBadge nameMatch={result.nameMatch} /> : null}

          <div className="mt-2 flex flex-wrap gap-1.5">
            <span
              className={`rounded-full border px-2 py-0.5 text-[11px] ${
                crowding.level === 'unknown'
                  ? 'border-border text-unknown'
                  : crowding.level === 'quiet'
                    ? 'border-good/40 bg-good/10 text-good'
                    : crowding.level === 'moderate'
                      ? 'border-border text-muted'
                      : 'border-warn/40 bg-warn/10 text-warn'
              }`}
            >
              {t('resort.crowding')}:{' '}
              {crowding.level === 'unknown' ? t('resort.unknown') : crowding.level}
            </span>
            {/* null is unknown. It is NEVER "no night skiing". */}
            <span
              className={`rounded-full border px-2 py-0.5 text-[11px] ${
                night === 'unknown' ? 'border-border text-unknown' : 'border-border text-muted'
              }`}
            >
              {t('resort.nightSki')}:{' '}
              {night === 'unknown' ? t('resort.unknown') : night === 'yes' ? t('resort.yes') : t('resort.no')}
            </span>
          </div>

          <TopFactors factors={result.factors} />

          {result.failedFilters.length > 0 ? (
            <p className="mt-2 rounded-md border border-warn/40 bg-warn/10 px-2 py-1 text-[11px] text-warn">
              {t('result.relaxed')} {result.failedFilters.join(', ')}
            </p>
          ) : null}
        </div>

        <ScoreDial score={result.score} />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
        <button
          type="button"
          onClick={openBreakdown}
          aria-expanded={open}
          aria-controls={panelId}
          className="rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-fg hover:border-accent"
        >
          {open ? t('result.whyHide') : t('result.why')}
        </button>
        <button
          type="button"
          onClick={() => onToggleCompare(area.id)}
          disabled={!selected && !canSelect}
          aria-pressed={selected}
          className="rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-fg hover:border-accent disabled:cursor-not-allowed disabled:opacity-40"
        >
          {selected ? `✓ ${t('result.added')}` : t('result.compare')}
        </button>
        <Link
          href={`/resort/${encodeURIComponent(area.id)}`}
          className="ms-auto rounded-md bg-accent px-2.5 py-1.5 text-xs font-medium text-accent-fg no-underline hover:opacity-90"
        >
          {t('result.view')}
        </Link>
      </div>

      {open ? (
        <div id={panelId} className="mt-3 space-y-3">
          {/*
            Prose, when available, sits ABOVE the numbers and never replaces
            them. It is a rendering of these same factors, not a second
            opinion — so if it is missing, nothing is lost.
          */}
          {explaining ? (
            <p className="text-xs text-muted">{t('result.explaining')}</p>
          ) : explanation ? (
            <div className="rounded-lg border border-accent/30 bg-accent-soft/50 p-3">
              <p className="text-sm leading-relaxed text-fg">{explanation}</p>
              <p className="mt-1.5 text-[11px] text-muted">{t('result.explainedBy')}</p>
            </div>
          ) : null}

          <ScoreBreakdown factors={result.factors} />
        </div>
      ) : null}
    </article>
  );
}
