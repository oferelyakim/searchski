import type { Difficulty, SkiArea } from '@searchski/core/types';
import type { MessageKey } from '@/i18n/dictionary';
import {
  DIFFICULTY_COLOR,
  DIFFICULTY_ORDER,
  crowdingBucket,
  difficultyKey,
  humanLiftType,
  km,
  metres,
  nightSkiState,
  percent,
} from '@/lib/format';

/**
 * The resort profile's charts.
 *
 * All server-rendered: they are static pictures of static data, so they cost
 * no client JavaScript. Rules applied throughout:
 *   * fixed category order (easiest → hardest), never cycled by rank
 *   * a legend is always present and direct-labels every segment, so identity
 *     never rests on colour alone
 *   * 2px surface-coloured gaps between stacked segments
 *   * numbers wear text tokens, never the series colour
 *   * a missing value is drawn as "unknown", never as zero
 */

type T = (key: MessageKey) => string;

export function StatTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface-2 px-3 py-2">
      <div className="text-[11px] uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-0.5 font-mono text-lg leading-tight text-fg">{value}</div>
      {hint ? <div className="mt-0.5 text-[11px] text-muted">{hint}</div> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Terrain mix — a part-to-whole stacked bar
// ---------------------------------------------------------------------------

export function TerrainMix({ area, t }: { area: SkiArea; t: T }) {
  const buckets = DIFFICULTY_ORDER.map((d) => ({
    difficulty: d,
    km: area.runsByDifficulty[d]?.km ?? 0,
    count: area.runsByDifficulty[d]?.count ?? 0,
  })).filter((b) => b.km > 0);

  const total = buckets.reduce((sum, b) => sum + b.km, 0);

  if (total <= 0) {
    return (
      <p className="text-sm text-muted">
        No difficulty breakdown in the data for this area — that is missing data, not an absence of
        pistes.
      </p>
    );
  }

  return (
    <div>
      {/* 2px surface gaps separate segments; the track is the surface colour. */}
      <div
        className="flex h-6 w-full gap-0.5 overflow-hidden rounded"
        role="img"
        aria-label={buckets
          .map((b) => `${t(difficultyKey(b.difficulty))} ${Math.round((b.km / total) * 100)}%`)
          .join(', ')}
      >
        {buckets.map((b) => (
          <div
            key={b.difficulty}
            className="h-full first:rounded-s last:rounded-e"
            style={{
              width: `${(b.km / total) * 100}%`,
              backgroundColor: DIFFICULTY_COLOR[b.difficulty as Difficulty],
            }}
          />
        ))}
      </div>

      <ul className="mt-3 grid gap-x-4 gap-y-1.5 sm:grid-cols-2">
        {buckets.map((b) => (
          <li key={b.difficulty} className="flex items-center gap-2 text-xs">
            <span
              aria-hidden="true"
              className="h-2.5 w-2.5 shrink-0 rounded-sm"
              style={{ backgroundColor: DIFFICULTY_COLOR[b.difficulty as Difficulty] }}
            />
            <span className="text-fg">{t(difficultyKey(b.difficulty))}</span>
            <span className="ms-auto font-mono text-muted">
              {km(b.km, 1)} · {percent(b.km / total)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Elevation — a range, not a time series. Drawn as a labelled vertical span.
// ---------------------------------------------------------------------------

export function ElevationProfile({ area, t }: { area: SkiArea; t: T }) {
  const base = area.baseElevM;
  const top = area.topElevM;

  if (base === null || top === null || top <= base) {
    return <p className="text-sm text-muted">{t('resort.unknown')}</p>;
  }

  const ceiling = Math.ceil(top / 500) * 500;
  const floor = Math.floor(base / 500) * 500;
  const span = Math.max(1, ceiling - floor);
  const topPct = ((ceiling - top) / span) * 100;
  const heightPct = ((top - base) / span) * 100;

  return (
    <div className="flex gap-4">
      <div className="relative h-40 w-10 shrink-0 rounded bg-surface-2">
        <div
          className="absolute inset-x-1 rounded"
          style={{
            top: `${topPct}%`,
            height: `${heightPct}%`,
            background: 'linear-gradient(to bottom, var(--c-accent), var(--c-accent-soft))',
          }}
          role="img"
          aria-label={`${t('resort.base')} ${Math.round(base)} m to ${t('resort.top')} ${Math.round(top)} m`}
        />
      </div>
      <dl className="flex flex-1 flex-col justify-between py-1 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-muted">{t('resort.top')}</dt>
          <dd className="font-mono text-fg">{metres(top)}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted">{t('resort.vertical')}</dt>
          <dd className="font-mono text-fg">{metres(area.verticalM ?? top - base)}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted">{t('resort.base')}</dt>
          <dd className="font-mono text-fg">{metres(base)}</dd>
        </div>
      </dl>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Lifts — a ranked horizontal bar list
// ---------------------------------------------------------------------------

export function LiftBreakdown({ area, t }: { area: SkiArea; t: T }) {
  const rows = Object.entries(area.liftsByType)
    .map(([type, bucket]) => ({ type, count: bucket.count, km: bucket.km }))
    .filter((r) => r.count > 0)
    .sort((a, b) => b.count - a.count);

  if (rows.length === 0) {
    return <p className="text-sm text-muted">{t('resort.unknown')}</p>;
  }

  const max = Math.max(...rows.map((r) => r.count));

  return (
    <ul className="space-y-2">
      {rows.map((row) => (
        <li key={row.type}>
          <div className="flex items-baseline justify-between gap-3 text-xs">
            <span className="text-fg">{humanLiftType(row.type)}</span>
            <span className="font-mono text-muted">
              {row.count} · {km(row.km, 1)}
            </span>
          </div>
          <div className="mt-1 h-1.5 w-full rounded-full bg-surface-2">
            <div
              className="h-full rounded-full bg-accent"
              style={{ width: `${Math.max(3, (row.count / max) * 100)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Crowding — a status meter. Icon + words, never colour alone.
// ---------------------------------------------------------------------------

export function CrowdingIndicator({ area, t }: { area: SkiArea; t: T }) {
  const { level, capacityPerKm } = crowdingBucket(area);

  const copy: Record<typeof level, { label: string; tone: string; steps: number }> = {
    quiet: { label: 'Quiet — high lift throughput per km of piste', tone: 'text-good', steps: 1 },
    moderate: { label: 'Moderate throughput per km of piste', tone: 'text-muted', steps: 2 },
    busy: { label: 'Low throughput per km — expect queues at peak', tone: 'text-warn', steps: 3 },
    unknown: { label: t('resort.unknown'), tone: 'text-unknown', steps: 0 },
  };
  const current = copy[level];

  return (
    <div>
      <div className="flex items-center gap-2">
        <span aria-hidden="true" className={current.tone}>
          {level === 'unknown' ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="9" />
              <path d="M9.5 9.5a2.5 2.5 0 1 1 3 2.45V13M12 16.5v.5" strokeLinecap="round" />
            </svg>
          ) : level === 'quiet' ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="m4 12 6 6L20 6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 4v9M12 17v.5" strokeLinecap="round" />
              <circle cx="12" cy="12" r="9" />
            </svg>
          )}
        </span>
        <span className={`text-sm ${current.tone}`}>{current.label}</span>
      </div>

      <div className="mt-2 flex gap-0.5" aria-hidden="true">
        {[1, 2, 3].map((step) => (
          <div
            key={step}
            className={`h-1.5 flex-1 rounded-full ${
              current.steps >= step && level !== 'unknown' ? 'bg-accent' : 'bg-surface-2'
            }`}
          />
        ))}
      </div>

      <p className="mt-2 text-xs text-muted">
        {capacityPerKm === null
          ? t('resort.capacityHelp')
          : `${t('resort.capacity')}: ${Math.round(area.uphillCapacityPph).toLocaleString()} p/h — about ${Math.round(capacityPerKm).toLocaleString()} per km of piste. ${t('resort.capacityHelp')}`}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Night skiing — the null case is "unknown", never "no"
// ---------------------------------------------------------------------------

export function NightSki({ area, t }: { area: SkiArea; t: T }) {
  const state = nightSkiState(area);
  return (
    <div className="text-sm">
      {state === 'unknown' ? (
        <>
          <p className="text-unknown">{t('resort.unknown')}</p>
          <p className="mt-1 text-xs text-muted">
            OpenStreetMap has no <code className="font-mono">lit</code> tag on these pistes. That means
            we do not know — it does not mean there is no night skiing.
          </p>
        </>
      ) : state === 'yes' ? (
        <>
          <p className="text-fg">{t('resort.yes')}</p>
          {area.nightSkiKm ? (
            <p className="mt-1 text-xs text-muted">{km(area.nightSkiKm, 1)} of floodlit piste tagged.</p>
          ) : null}
        </>
      ) : (
        <>
          <p className="text-fg">{t('resort.no')}</p>
          <p className="mt-1 text-xs text-muted">No floodlit pistes are tagged in OpenStreetMap.</p>
        </>
      )}
    </div>
  );
}
