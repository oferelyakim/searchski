'use client';

import { useEffect, useState } from 'react';
import { useI18n } from '@/i18n/client';
import type { Conditions } from '@/lib/conditions';
import { formatDate } from '@/lib/format';

/**
 * Seven-day forecast, fetched client-side after paint.
 *
 * Weather is the least important thing on a resort page and the most likely to
 * fail, so it never blocks render and never throws. If it is unavailable the
 * panel simply says so.
 */

interface ApiShape {
  conditions: Conditions | null;
  error?: string;
}

function codeIcon(code: number | null): string {
  if (code === null) return '·';
  if (code === 0) return '☀';
  if (code <= 2) return '⛅';
  if (code === 3) return '☁';
  if (code <= 48) return '🌫';
  if (code <= 67) return '🌧';
  if (code <= 77) return '❄';
  if (code <= 86) return '🌨';
  return '⛈';
}

export function ConditionsPanel({ resortId }: { resortId: string }) {
  const { locale, t } = useI18n();
  const [state, setState] = useState<'loading' | 'ready' | 'unavailable'>('loading');
  const [conditions, setConditions] = useState<Conditions | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/conditions/${encodeURIComponent(resortId)}`);
        const data = (await res.json()) as ApiShape;
        if (cancelled) return;
        if (data.conditions) {
          setConditions(data.conditions);
          setState('ready');
        } else {
          setState('unavailable');
        }
      } catch {
        if (!cancelled) setState('unavailable');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [resortId]);

  if (state === 'loading') {
    return <p className="text-sm text-muted">…</p>;
  }

  if (state === 'unavailable' || !conditions) {
    return <p className="text-sm text-muted">Forecast is not available right now.</p>;
  }

  return (
    <div>
      {conditions.current ? (
        <p className="text-sm text-fg">
          <span className="font-mono text-lg">
            {conditions.current.tempC === null ? '—' : `${Math.round(conditions.current.tempC)}°C`}
          </span>
          <span className="ms-2 text-muted">
            {codeIcon(conditions.current.weatherCode)}
            {conditions.current.windKph !== null
              ? ` · ${Math.round(conditions.current.windKph)} km/h`
              : ''}
          </span>
        </p>
      ) : null}

      <ul className="mt-3 grid grid-cols-4 gap-1.5 sm:grid-cols-7">
        {conditions.daily.map((day) => (
          <li key={day.date} className="rounded-md border border-border bg-surface-2 px-1.5 py-2 text-center">
            <div className="text-[10px] text-muted">{formatDate(day.date, locale)}</div>
            <div aria-hidden="true" className="text-base leading-tight">
              {codeIcon(day.weatherCode)}
            </div>
            <div className="font-mono text-[11px] text-fg">
              {day.tempMaxC === null ? '—' : Math.round(day.tempMaxC)}°
              <span className="text-muted">
                /{day.tempMinC === null ? '—' : Math.round(day.tempMinC)}°
              </span>
            </div>
            {day.snowfallCm !== null && day.snowfallCm > 0 ? (
              <div className="font-mono text-[10px] text-accent">{day.snowfallCm.toFixed(1)} cm</div>
            ) : null}
          </li>
        ))}
      </ul>

      <p className="mt-2 text-[11px] text-muted">
        {conditions.attribution}
        {conditions.provider === 'openmeteo_free' ? ' · free non-commercial tier' : ''}
        {' · '}
        {t('resort.conditions')} {new Date(conditions.fetchedAt).toISOString().slice(11, 16)} UTC
      </p>
    </div>
  );
}
