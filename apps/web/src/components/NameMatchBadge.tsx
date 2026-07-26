'use client';

import type { NameMatch } from '@searchski/core/types';
import { useT } from '@/i18n/client';

/**
 * Why this result is sitting above better-scoring ones.
 *
 * A name-matched result is PINNED by `compareResults`, so it can appear above a
 * card with a higher score. A lower number above a higher one with no
 * explanation reads as a bug — and a user who decides one number on the page is
 * broken stops trusting all of them.
 *
 * The badge always shows `matched` — the name or alias the user actually typed
 * — and never the resort's own name. That is the whole point in the case this
 * exists for: search "Val Gardena" and the top card is titled "Alta Badia".
 * Echoing the card's own title back would explain nothing. Showing
 * `matched "Val Gardena"` plus the `boundaryNote` next to the km total tells
 * the true and slightly surprising story: upstream merged the two records, and
 * this one really does contain Val Gardena.
 *
 * `isPrimaryName` splits the two cases, because they need different phrasing:
 * "you typed this resort's name" is self-evident and just needs acknowledging;
 * "you typed one of its other names" is the one that needs explaining.
 */
export function NameMatchBadge({ nameMatch }: { nameMatch: NameMatch }) {
  const t = useT();
  const isAlias = !nameMatch.isPrimaryName;

  return (
    <p
      className={`mt-2 flex items-start gap-1.5 rounded-md border px-2 py-1.5 text-[11px] leading-snug ${
        isAlias ? 'border-accent/50 bg-accent-soft text-fg' : 'border-border bg-surface-2 text-muted'
      }`}
    >
      <svg
        aria-hidden="true"
        className="mt-0.5 shrink-0 text-accent"
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
      >
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" strokeLinecap="round" />
      </svg>
      <span>
        <span className="font-medium">
          {isAlias ? t('result.nameMatchAlias') : t('result.nameMatchPrimary')}
        </span>{' '}
        <span className="font-medium text-accent">&ldquo;{nameMatch.matched}&rdquo;</span>
        {isAlias ? <span className="text-muted"> — {t('result.nameMatchWhy')}</span> : null}
      </span>
    </p>
  );
}
