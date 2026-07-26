import type { VerificationStatus } from '@searchski/core/types';
import type { MessageKey } from '@/i18n/dictionary';

/**
 * The honesty primitive.
 *
 * Every curated Israel-layer value passes through here. A value whose
 * verification is not exactly `verified` is rendered as a claim we have not
 * checked — never as fact. PLAN.md §9: claiming a restaurant is kosher when it
 * is not is a real harm to a real person's trip.
 */

export type Status = VerificationStatus | 'absent';

const STYLES: Record<Status, string> = {
  verified: 'border-good/40 bg-good/10 text-good',
  unverified: 'border-warn/40 bg-warn/10 text-warn',
  stale: 'border-warn/40 bg-warn/10 text-warn',
  absent: 'border-border bg-surface-2 text-muted',
};

const LABEL_KEY: Record<Status, MessageKey | null> = {
  verified: 'verify.verified',
  unverified: 'verify.unverified',
  stale: 'verify.stale',
  absent: null,
};

export function VerificationBadge({
  status,
  t,
}: {
  status: Status;
  t: (key: MessageKey) => string;
}) {
  const key = LABEL_KEY[status];
  if (!key) return null;
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${STYLES[status]}`}
    >
      {status === 'verified' ? (
        <svg aria-hidden="true" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
          <path d="m4 12 6 6L20 6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : (
        <svg aria-hidden="true" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 8v5M12 16.5v.5" strokeLinecap="round" />
        </svg>
      )}
      {t(key)}
    </span>
  );
}

/**
 * A single curated fact, rendered honestly.
 *
 * When `status !== 'verified'` the value is shown as a *claim* in muted,
 * italic type with an explicit caveat underneath. It is never presented in the
 * same voice as a verified fact.
 */
export function CuratedFact({
  label,
  value,
  claim,
  status,
  t,
  extraWarning,
}: {
  label: string;
  /** The verified value. Only ever non-null when status === 'verified'. */
  value: string | null;
  /** The unverified claim, if we hold one. */
  claim: string | null;
  status: Status;
  t: (key: MessageKey) => string;
  /** Additional caveat, e.g. the kashrut warning. */
  extraWarning?: string;
}) {
  const hasAnything = value !== null || claim !== null;

  return (
    <div className="border-t border-border py-3 first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <dt className="text-sm font-medium text-fg">{label}</dt>
        <VerificationBadge status={status} t={t} />
      </div>

      {!hasAnything ? (
        <dd className="mt-1 text-sm text-muted">{t('israel.none')}</dd>
      ) : value !== null ? (
        <dd className="mt-1 text-sm text-fg">{value}</dd>
      ) : (
        <dd className="mt-1 space-y-1">
          <p className="text-sm italic text-muted">&ldquo;{claim}&rdquo;</p>
          <p className="text-xs text-warn">
            {status === 'stale' ? t('verify.explainStale') : t('verify.explainUnverified')}
          </p>
          {extraWarning ? <p className="text-xs font-medium text-bad">{extraWarning}</p> : null}
        </dd>
      )}
    </div>
  );
}
