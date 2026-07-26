import type { Metadata } from 'next';
import Link from 'next/link';
import type { SkiArea } from '@searchski/core/types';
import { compareResults, scoreArea } from '@searchski/core';
import { getI18n } from '@/i18n/server';
import { getDataset } from '@/lib/data';
import { SHOW_REGIONAL_LAYER } from '@/lib/features';
import { toScoringContext } from '@/lib/search-service';
import {
  DIFFICULTY_COLOR,
  DIFFICULTY_ORDER,
  countryName,
  crowdingBucket,
  difficultyKey,
  flagEmoji,
  km,
  metres,
  minutesToHm,
  money,
  nightSkiState,
  percent,
  verificationOf,
} from '@/lib/format';
import { ResortMap } from '@/components/ResortMap';
import { VerificationBadge } from '@/components/VerificationBadge';
import { BoundaryNote, CountryList } from '@/components/AreaFacts';

export const metadata: Metadata = {
  title: 'Compare',
  description: 'Compare up to four ski resorts side by side.',
};

const MAX = 4;

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function TerrainStrip({ area }: { area: SkiArea }) {
  const buckets = DIFFICULTY_ORDER.map((d) => ({
    difficulty: d,
    km: area.runsByDifficulty[d]?.km ?? 0,
  })).filter((b) => b.km > 0);
  const total = buckets.reduce((s, b) => s + b.km, 0);
  if (total <= 0) return <span className="text-xs text-muted">—</span>;

  return (
    <div>
      <div className="flex h-3 w-full gap-0.5 overflow-hidden rounded">
        {buckets.map((b) => (
          <div
            key={b.difficulty}
            style={{ width: `${(b.km / total) * 100}%`, backgroundColor: DIFFICULTY_COLOR[b.difficulty] }}
          />
        ))}
      </div>
      <ul className="mt-1 space-y-0.5">
        {buckets.map((b) => (
          <li key={b.difficulty} className="flex items-center gap-1.5 text-[11px]">
            <span
              aria-hidden="true"
              className="h-2 w-2 shrink-0 rounded-sm"
              style={{ backgroundColor: DIFFICULTY_COLOR[b.difficulty] }}
            />
            <span className="text-muted">{b.difficulty}</span>
            <span className="ms-auto font-mono text-fg">{percent(b.km / total)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default async function ComparePage({ searchParams }: PageProps) {
  const { t } = await getI18n();
  const params = await searchParams;
  const data = await getDataset();

  const raw = params['ids'];
  const requested = (Array.isArray(raw) ? raw.join(',') : (raw ?? ''))
    .split(',')
    .map((s) => decodeURIComponent(s.trim()))
    .filter(Boolean);

  const seen = new Set<string>();
  const picked: SkiArea[] = [];
  for (const id of requested) {
    if (seen.has(id) || picked.length >= MAX) continue;
    const area = data.areasById.get(id);
    if (area) {
      picked.push(area);
      seen.add(id);
    }
  }

  // Order comes from the core comparator, never from this file. Ranking rules
  // (pinned name matches, soft misses, score, size) live in exactly one place,
  // so the columns here can't drift out of step with the results list the user
  // picked them from. URL order is a selection order, not a ranking.
  const ctx = toScoringContext(data, 'deterministic');
  const areas = picked
    .map((area) => scoreArea(area, {}, ctx))
    .sort(compareResults)
    .map((scored) => scored.area);

  if (areas.length === 0) {
    return (
      <div className="space-y-3">
        <h1 className="text-xl font-semibold text-fg">{t('compare.title')}</h1>
        <p className="text-sm text-muted">{t('compare.empty')}</p>
        <Link href="/" className="inline-block rounded-lg bg-accent px-3 py-2 text-sm text-accent-fg no-underline">
          {t('compare.back')}
        </Link>
      </div>
    );
  }

  const removeHref = (id: string) => {
    const rest = areas.filter((a) => a.id !== id).map((a) => encodeURIComponent(a.id));
    return rest.length > 0 ? `/compare?ids=${rest.join(',')}` : '/compare';
  };

  const priceFor = (area: SkiArea) => {
    const candidates = data.passPrices.filter(
      (p) =>
        p.category === 'adult' &&
        p.duration === '1day' &&
        (p.skiAreaId === area.id || (p.passRegionId !== null && p.passRegionId === area.passRegionId)),
    );
    return candidates.sort((a, b) => a.price - b.price)[0] ?? null;
  };

  const transferFor = (area: SkiArea) => (data.transfersByArea[area.id] ?? [])[0] ?? null;

  const allRows: { label: string; render: (area: SkiArea) => React.ReactNode }[] = [
    {
      label: t('criteria.countries'),
      render: (a) => <CountryList area={a} />,
    },
    {
      label: t('resort.pistes'),
      // Comparing a merged 252 km record against a single 78 km resort is
      // exactly the misleading case boundaryNote exists to prevent.
      render: (a) => (
        <div>
          <span className="font-mono">{km(a.kmTotal, 0)}</span>
          <BoundaryNote area={a} compact />
        </div>
      ),
    },
    { label: t('resort.runs'), render: (a) => <span className="font-mono">{a.runsTotal}</span> },
    { label: t('resort.liftsTotal'), render: (a) => <span className="font-mono">{a.liftsTotal}</span> },
    { label: t('resort.vertical'), render: (a) => <span className="font-mono">{metres(a.verticalM)}</span> },
    { label: t('resort.top'), render: (a) => <span className="font-mono">{metres(a.topElevM)}</span> },
    { label: t('resort.base'), render: (a) => <span className="font-mono">{metres(a.baseElevM)}</span> },
    { label: t('resort.terrain'), render: (a) => <TerrainStrip area={a} /> },
    {
      label: t('resort.snowmaking'),
      render: (a) =>
        a.snowmakingKm > 0 ? (
          <span className="font-mono">{km(a.snowmakingKm, 0)}</span>
        ) : (
          <span className="text-unknown">{t('resort.unknown')}</span>
        ),
    },
    {
      label: t('resort.crowding'),
      render: (a) => {
        const c = crowdingBucket(a);
        return c.level === 'unknown' ? (
          <span className="text-unknown">{t('resort.unknown')}</span>
        ) : (
          <span>
            {c.level}
            <span className="ms-1 font-mono text-muted">
              ({Math.round(c.capacityPerKm ?? 0).toLocaleString()} p/h/km)
            </span>
          </span>
        );
      },
    },
    {
      label: t('resort.nightSki'),
      render: (a) => {
        const state = nightSkiState(a);
        // null is unknown, never "no".
        return state === 'unknown' ? (
          <span className="text-unknown">{t('resort.unknown')}</span>
        ) : (
          <span>{state === 'yes' ? t('resort.yes') : t('resort.no')}</span>
        );
      },
    },
    {
      label: t('resort.travel'),
      render: (a) => {
        const transfer = transferFor(a);
        return transfer ? (
          <span className="font-mono">
            {transfer.airportIata} · {minutesToHm(transfer.driveMinutes)}
          </span>
        ) : (
          <span className="text-unknown">{t('resort.unknown')}</span>
        );
      },
    },
    {
      label: t('resort.passPrices'),
      render: (a) => {
        const price = priceFor(a);
        return price ? (
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="font-mono">{money(price.price, price.currency)}</span>
            <VerificationBadge status={verificationOf(price.provenance) ?? 'unverified'} t={t} />
          </span>
        ) : (
          <span className="text-unknown">{t('resort.unknown')}</span>
        );
      },
    },
    {
      label: t('resort.israel'),
      render: (a) => {
        const profile = data.israelById[a.id];
        if (!profile) return <span className="text-unknown">{t('israel.none')}</span>;
        const status = verificationOf(profile.provenance) ?? 'unverified';
        // Never render an unverified kosher level as a fact.
        return (
          <span className="flex flex-col gap-1">
            <VerificationBadge status={status} t={t} />
            <span className="text-xs text-muted">
              {t('israel.kosher')}:{' '}
              {status === 'verified' && profile.kosherAvailability !== null
                ? t(`israel.kosher.${profile.kosherAvailability}` as 'israel.kosher.0')
                : t('verify.unverified')}
            </span>
          </span>
        );
      },
    },
  ];

  // The regional row is dropped rather than restructured away, so re-enabling it
  // is the same one-line flag as everywhere else. See src/lib/features.ts.
  // Filtered as a separate statement so the literal above keeps its contextual
  // typing — chaining .filter() onto it strands every `render` parameter as any.
  const rows = allRows.filter(
    (row) => SHOW_REGIONAL_LAYER || row.label !== t('resort.israel')
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-xl font-semibold text-fg">{t('compare.title')}</h1>
        <Link href="/" className="text-sm text-accent no-underline">
          {t('compare.back')}
        </Link>
      </div>
      <p className="text-xs text-muted">{t('compare.limit')}</p>

      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <table className="w-full min-w-[40rem] border-collapse text-sm">
          <caption className="sr-only">{t('compare.title')}</caption>
          <thead>
            <tr>
              <th scope="col" className="sticky start-0 z-10 bg-surface p-3 text-start text-xs font-medium text-muted">
                &nbsp;
              </th>
              {areas.map((area) => (
                <th key={area.id} scope="col" className="border-s border-border p-3 text-start align-top">
                  <Link href={`/resort/${encodeURIComponent(area.id)}`} className="font-semibold text-fg no-underline hover:text-accent">
                    {area.name}
                  </Link>
                  <div className="mt-1">
                    <Link href={removeHref(area.id)} className="text-[11px] text-muted no-underline hover:text-bad">
                      {t('compare.remove')}
                    </Link>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label} className="border-t border-border">
                <th scope="row" className="sticky start-0 z-10 bg-surface p-3 text-start align-top text-xs font-medium text-muted">
                  {row.label}
                </th>
                {areas.map((area) => (
                  <td key={area.id} className="border-s border-border p-3 align-top text-fg">
                    {row.render(area)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section className="rounded-xl border border-border bg-surface p-4">
        <h2 className="text-sm font-semibold text-fg">{t('resort.map')}</h2>
        <div className="mt-3">
          <ResortMap
            markers={areas.map((a, i) => ({
              id: a.id,
              name: a.name,
              lat: a.lat,
              lon: a.lon,
              primary: i === 0,
            }))}
            label={`Map comparing ${areas.map((a) => a.name).join(', ')}`}
            height={320}
          />
        </div>
      </section>
    </div>
  );
}
