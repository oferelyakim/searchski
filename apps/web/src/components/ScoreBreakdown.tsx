'use client';

import type { ScoreFactor } from '@searchski/core/types';
import { useT } from '@/i18n/client';

/**
 * Why a resort scored what it scored.
 *
 * A result is never a black box. Every factor shows its own contribution, the
 * weight it was given, and the `reason` string the scorer wrote — in the
 * scorer's own words, not re-derived here.
 *
 * Factors with `dataMissing: true` are rendered as a MISSING-DATA state, not a
 * low score. "We do not know" and "this resort is bad at that" are completely
 * different things and must never look alike.
 */

function FactorRow({ factor }: { factor: ScoreFactor }) {
  const t = useT();
  const share = factor.weight > 0 ? Math.min(1, factor.contribution / factor.weight) : 0;

  if (factor.dataMissing) {
    return (
      <li className="rounded-lg border border-dashed border-border bg-surface-2/50 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm font-medium text-muted">{factor.label}</span>
          <span className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[11px] font-medium text-unknown">
            <svg aria-hidden="true" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <circle cx="12" cy="12" r="9" />
              <path d="M9.5 9.5a2.5 2.5 0 1 1 3 2.45V13" strokeLinecap="round" />
              <path d="M12 16.5v.5" strokeLinecap="round" />
            </svg>
            {t('result.noData')}
          </span>
        </div>
        <p className="mt-1 text-xs text-muted">{factor.reason}</p>
        <p className="mt-1 text-[11px] italic text-muted">{t('result.noDataExplain')}</p>
      </li>
    );
  }

  return (
    <li className="rounded-lg border border-border bg-surface-2/50 p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm font-medium text-fg">{factor.label}</span>
        <span className="font-mono text-xs text-muted">
          +{factor.contribution.toFixed(1)}
          <span className="opacity-60"> / {factor.weight.toFixed(0)}</span>
        </span>
      </div>
      <div
        className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-border"
        role="img"
        aria-label={`${Math.round(share * 100)}% of the available ${factor.weight.toFixed(0)} points`}
      >
        <div
          className="h-full rounded-full bg-accent transition-[width]"
          style={{ width: `${Math.max(2, share * 100)}%` }}
        />
      </div>
      <p className="mt-1.5 text-xs text-muted">{factor.reason}</p>
    </li>
  );
}

export function ScoreBreakdown({ factors }: { factors: ScoreFactor[] }) {
  if (factors.length === 0) return null;
  return (
    <ul className="grid gap-2 sm:grid-cols-2">
      {factors.map((factor) => (
        <FactorRow key={factor.key} factor={factor} />
      ))}
    </ul>
  );
}

/**
 * The always-visible summary: the top contributing factors, with their reasons.
 * The full breakdown sits behind a disclosure, but a user never has to open it
 * to learn *something* about why this resort is here.
 */
export function TopFactors({ factors, max = 3 }: { factors: ScoreFactor[]; max?: number }) {
  const t = useT();
  const ranked = [...factors].sort((a, b) => {
    if (a.dataMissing !== b.dataMissing) return a.dataMissing ? 1 : -1;
    return b.contribution - a.contribution;
  });
  const top = ranked.slice(0, max);
  if (top.length === 0) return null;

  return (
    <ul className="mt-3 space-y-1.5">
      {top.map((factor) => (
        <li key={factor.key} className="flex items-start gap-2 text-xs leading-snug">
          <span
            aria-hidden="true"
            className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
              factor.dataMissing ? 'bg-unknown' : 'bg-accent'
            }`}
          />
          <span className={factor.dataMissing ? 'text-muted' : 'text-fg'}>
            <span className="font-medium">{factor.label}</span>
            {factor.dataMissing ? (
              <span className="text-unknown"> — {t('result.noData')}</span>
            ) : null}
            <span className="text-muted"> · {factor.reason}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
