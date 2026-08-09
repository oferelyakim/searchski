'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ScoredResult, SearchCriteria } from '@searchski/core/types';
import type { OutboundLink } from '@searchski/affiliates';
import { useT } from '@/i18n/client';
import { countryName, flagEmoji, km, metres, minutesToHm, nightSkiState } from '@/lib/format';
import { tripFromCriteria, tripToQuery, type Gateway } from '@/lib/trip';
import { ScoreBreakdown } from '../ScoreBreakdown';
import { OutboundLinkGroup } from '../OutboundLink';

/**
 * Shape returned by /api/booking/[id]. Kept structurally (not imported from
 * the route file) so the client bundle never pulls server-only modules.
 */
interface BookingBundle {
  gateway: Gateway | null;
  flights: OutboundLink[];
  lodging: OutboundLink[];
  transfer: OutboundLink[];
  car: OutboundLink[];
  official: OutboundLink[];
  passPrices: {
    category: 'adult' | 'youth' | 'child' | 'senior';
    duration: '1day' | '3day' | '6day' | 'season';
    price: number;
    currency: string;
    season: string;
    isDynamic: boolean;
  }[];
  notes: { noOrigin: boolean; noDates: boolean; noGateway: boolean };
}

/**
 * The resort dossier, opened from a results card.
 *
 * Facts on top, the score's reasoning in the middle, booking at the bottom.
 * The booking section keeps the user on our page until the final click: every
 * component is a named partner opened in a NEW TAB with the trip window
 * carried over. Deliberately separate searches — see BookThisTrip's header
 * for the Package Travel Directive rule; this modal must never gain a cart,
 * a combined price, or a single "book it all" button.
 */
export function ResortModal({
  result,
  criteria,
  onClose,
}: {
  result: ScoredResult;
  criteria: SearchCriteria;
  onClose: () => void;
}) {
  const t = useT();
  const { area } = result;
  const [bundle, setBundle] = useState<BookingBundle | null>(null);
  const [bundleFailed, setBundleFailed] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);

  const trip = tripFromCriteria(criteria);

  useEffect(() => {
    restoreRef.current = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
      restoreRef.current?.focus?.();
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (trip.dateFrom) params.set('dateFrom', trip.dateFrom);
    if (trip.dateTo) params.set('dateTo', trip.dateTo);
    if (trip.adults !== undefined) params.set('adults', String(trip.adults));
    if (trip.children !== undefined) params.set('children', String(trip.children));
    if (trip.originAirport) params.set('originAirport', trip.originAirport);
    const query = params.toString();
    void fetch(`/api/booking/${encodeURIComponent(area.id)}${query ? `?${query}` : ''}`)
      .then((res) => (res.ok ? (res.json() as Promise<BookingBundle>) : null))
      .then((data) => {
        if (data) setBundle(data);
        else setBundleFailed(true);
      })
      .catch(() => setBundleFailed(true));
    // The modal mounts fresh per resort; area.id is the only real dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [area.id]);

  const onBackdrop = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose],
  );

  const night = nightSkiState(area);
  const score = Math.max(0, Math.min(100, result.score));
  const price =
    bundle?.passPrices.find((p) => p.category === 'adult' && p.duration === '1day') ??
    bundle?.passPrices.find((p) => p.category === 'adult') ??
    bundle?.passPrices[0];

  const facts: { label: string; value: string }[] = [];
  if (area.kmTotal > 0) facts.push({ label: t('resort.pistes'), value: km(area.kmTotal) });
  if (area.runsTotal > 0) facts.push({ label: t('resort.runs'), value: String(area.runsTotal) });
  if (area.liftsTotal > 0) facts.push({ label: t('resort.liftsTotal'), value: String(area.liftsTotal) });
  if (area.topElevM !== null) facts.push({ label: t('resort.top'), value: metres(area.topElevM) });
  if (area.baseElevM !== null) facts.push({ label: t('resort.base'), value: metres(area.baseElevM) });
  if (area.verticalM !== null) {
    facts.push({ label: t('resort.vertical'), value: metres(area.verticalM) });
  }
  if (area.snowmakingKm > 0) {
    facts.push({ label: t('resort.snowmaking'), value: km(area.snowmakingKm) });
  }
  facts.push({
    label: t('resort.nightSki'),
    value:
      night === 'yes' ? t('resort.yes') : night === 'no' ? t('resort.no') : t('resort.unknown'),
  });

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={area.name}
      onClick={onBackdrop}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-6"
    >
      <div className="max-h-[92dvh] w-full max-w-2xl overflow-y-auto rounded-t-2xl border border-border bg-bg shadow-2xl sm:rounded-2xl">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-border bg-surface/95 p-4 backdrop-blur">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold text-fg">{area.name}</h2>
            <p className="mt-0.5 text-xs text-muted">
              <span aria-hidden="true">{flagEmoji(area.country)} </span>
              {countryName(area.country)}
              {area.regionName ? ` · ${area.regionName}` : ''}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="rounded-full bg-accent-soft px-2.5 py-1 font-mono text-sm font-semibold text-fg">
              {score.toFixed(0)}
            </span>
            <button
              ref={closeRef}
              type="button"
              onClick={onClose}
              aria-label={t('iv.modalClose')}
              className="grid h-8 w-8 place-items-center rounded-full border border-border text-muted hover:border-accent hover:text-accent"
            >
              <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>

        <div className="space-y-5 p-4">
          {/* Facts */}
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
            {facts.map((fact) => (
              <div key={fact.label}>
                <dt className="text-[11px] uppercase tracking-wide text-muted">{fact.label}</dt>
                <dd className="text-sm font-medium text-fg">{fact.value}</dd>
              </div>
            ))}
          </dl>

          {/* Lift pass, verification-gated: an unverified scraped price renders
              as a sourced claim with its date, never as bare fact. */}
          {price ? (
            <p className="rounded-lg border border-border bg-surface px-3 py-2 text-xs text-fg">
              <span className="font-semibold">{t('resort.passPrices')}:</span>{' '}
              {price.price} {price.currency}
              {price.isDynamic ? '+' : ''} / {t('iv.perDay')}
              <span className="text-muted"> — {t('verify.unverified')}. {t('verify.explainUnverified')}</span>
            </p>
          ) : null}

          {/* Why it scored this way */}
          <section aria-labelledby="modal-why">
            <h3 id="modal-why" className="mb-2 text-sm font-semibold text-fg">
              {t('result.why')}
            </h3>
            <ScoreBreakdown factors={result.factors} />
          </section>

          {/* Booking */}
          <section aria-labelledby="modal-book" className="rounded-xl border border-border bg-surface p-4">
            <h3 id="modal-book" className="text-sm font-semibold text-fg">
              {t('book.title')}
            </h3>
            <p className="mt-1 text-xs text-muted">{t('iv.bookHandoff')}</p>

            {bundleFailed ? <p className="mt-3 text-sm text-bad">{t('error.generic')}</p> : null}
            {!bundle && !bundleFailed ? (
              <p className="mt-3 text-sm text-muted">{t('search.searching')}</p>
            ) : null}

            {bundle ? (
              <div className="mt-3 space-y-4">
                {bundle.gateway ? (
                  <p className="text-xs text-muted">
                    {t('book.arriveAt')}{' '}
                    <span className="font-medium text-fg">
                      {bundle.gateway.name} ({bundle.gateway.iata})
                    </span>
                    {bundle.gateway.driveMinutes !== null
                      ? ` · ${minutesToHm(bundle.gateway.driveMinutes)} ${t('resort.driveTime')}`
                      : ''}
                  </p>
                ) : (
                  <p className="text-xs text-muted">{t('book.noAirport')}</p>
                )}

                {bundle.flights.length > 0 ? (
                  <OutboundLinkGroup title={t('book.flights')} note={t('book.flightsNote')} links={bundle.flights} headingLevel={4} />
                ) : bundle.notes.noOrigin ? (
                  <p className="text-xs text-muted">{t('book.noOrigin')}</p>
                ) : bundle.notes.noDates ? (
                  <p className="text-xs text-muted">{t('book.noFlightDates')}</p>
                ) : null}

                <OutboundLinkGroup title={t('book.lodging')} note={t('book.lodgingNote')} links={bundle.lodging} headingLevel={4} />
                <OutboundLinkGroup title={t('book.transfer')} note={t('book.transferNote')} links={bundle.transfer} headingLevel={4} />
                <OutboundLinkGroup title={t('book.car')} links={bundle.car} headingLevel={4} />

                <p className="text-[11px] text-muted">{t('book.intro')}</p>
              </div>
            ) : null}
          </section>

          <div className="flex items-center justify-between gap-3 pb-2">
            <Link
              href={`/resort/${encodeURIComponent(area.id)}${tripToQuery(trip)}`}
              className="text-sm font-medium text-accent underline-offset-2 hover:underline"
            >
              {t('iv.fullPage')}
            </Link>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-border px-3.5 py-1.5 text-sm text-fg hover:border-accent"
            >
              {t('iv.modalClose')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
