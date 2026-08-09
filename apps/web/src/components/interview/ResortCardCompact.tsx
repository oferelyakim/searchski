'use client';

import type { ScoredResult } from '@searchski/core/types';
import { useT } from '@/i18n/client';
import { countryName, flagEmoji, km, metres, minutesToHm } from '@/lib/format';
import { TopFactors } from '../ScoreBreakdown';

/**
 * One resort in the results grid: the highlights, not the dossier.
 *
 * The whole card is a button that opens the modal — the modal owns the full
 * facts, the score breakdown and the booking links. This card's job is to be
 * scannable in a grid of twelve: name, score, four numbers, and the top
 * reasons it ranked where it did.
 */
export function ResortCardCompact({
  result,
  onOpen,
}: {
  result: ScoredResult;
  onOpen: (result: ScoredResult) => void;
}) {
  const t = useT();
  const { area } = result;
  const score = Math.max(0, Math.min(100, result.score));

  const stats: { label: string; value: string }[] = [];
  if (area.kmTotal > 0) stats.push({ label: t('resort.pistes'), value: km(area.kmTotal) });
  if (area.topElevM !== null) stats.push({ label: t('resort.top'), value: metres(area.topElevM) });
  if (area.verticalM !== null) {
    stats.push({ label: t('resort.vertical'), value: metres(area.verticalM) });
  }
  if (result.transfer) {
    stats.push({
      label: result.transfer.airportIata,
      value: minutesToHm(result.transfer.driveMinutes),
    });
  }

  return (
    <button
      type="button"
      onClick={() => onOpen(result)}
      className="group w-full rounded-xl border border-border bg-surface p-4 text-start transition-shadow hover:border-accent hover:shadow-md focus-visible:border-accent"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-base font-semibold text-fg group-hover:text-accent">
            {area.name}
          </h3>
          <p className="mt-0.5 text-xs text-muted">
            <span aria-hidden="true">{flagEmoji(area.country)} </span>
            {countryName(area.country)}
            {area.regionName ? ` · ${area.regionName}` : ''}
          </p>
        </div>
        <div
          className="relative grid h-11 w-11 shrink-0 place-items-center rounded-full"
          style={{
            background: `conic-gradient(var(--c-accent) ${score * 3.6}deg, var(--c-border) 0deg)`,
          }}
          role="img"
          aria-label={`${t('result.score')}: ${score.toFixed(0)} / 100`}
        >
          <span className="grid h-8.5 w-8.5 place-items-center rounded-full bg-surface font-mono text-xs font-semibold text-fg">
            {score.toFixed(0)}
          </span>
        </div>
      </div>

      {stats.length > 0 ? (
        <dl className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
          {stats.map((stat) => (
            <div key={stat.label} className="flex items-baseline gap-1 text-xs">
              <dt className="text-muted">{stat.label}</dt>
              <dd className="font-medium text-fg">{stat.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      <div className="mt-3">
        <TopFactors factors={result.factors} max={2} />
      </div>

      {result.failedFilters.length > 0 ? (
        <p className="mt-2 text-xs text-warn">
          {t('result.relaxed')} {result.failedFilters.join(', ')}
        </p>
      ) : null}

      <p className="mt-3 text-xs font-medium text-accent">{t('iv.cardOpen')}</p>
    </button>
  );
}
