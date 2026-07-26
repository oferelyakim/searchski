/**
 * The human-facing half of pass-price discovery.
 *
 * data/build/pass_prices_report.md exists so that a person can see, without
 * reading JSON, three things: how much of the roster is covered, which resorts
 * still have no price and why, and — most importantly — which stored rows are
 * standing on an assumption and need checking by hand.
 *
 * The two "needs checking" sections are not decoration. A last season's price
 * shown as this season's, or a dynamic "from" figure shown as *the* price, is a
 * real harm to somebody budgeting a holiday. The report is where those get
 * surfaced instead of quietly sitting in a JSON file.
 */

import type { PassPrice, SkiArea } from '@searchski/core/types';
import type { AttemptRecord } from './state.ts';

export interface ReportInput {
  season: string;
  generatedAt: string;
  /** Every significant area — the denominator, regardless of --countries. */
  areas: readonly SkiArea[];
  /** All rows in pass_prices.json, all seasons. */
  prices: readonly PassPrice[];
  /** Every journal entry, all seasons. */
  attempts: readonly AttemptRecord[];
  /** Country filter used on this run, if any. Reported for context. */
  countryFilter: readonly string[] | null;
}

interface CountryTally {
  country: string;
  total: number;
  withPrice: number;
  dynamic: number;
  notFound: number;
  errored: number;
  unchecked: number;
}

function esc(text: string): string {
  // Only `|` can break a Markdown table cell; leave everything else alone so
  // resort names in Cyrillic or Georgian script survive intact.
  return text.replace(/\|/g, '\\|');
}

function hostOf(url: string | null | undefined): string {
  if (!url) return '—';
  try {
    return new URL(url).hostname.replace(/^www\./i, '');
  } catch {
    return '—';
  }
}

function money(row: PassPrice | undefined): string {
  if (!row) return '—';
  return `${row.currency} ${row.price}`;
}

export function renderReport(input: ReportInput): string {
  const { season, generatedAt, areas, prices, attempts, countryFilter } = input;

  const seasonPrices = prices.filter((p) => p.season === season);
  const seasonAttempts = attempts.filter((a) => a.season === season);

  const priceByArea = new Map<string, PassPrice[]>();
  for (const row of seasonPrices) {
    if (!row.skiAreaId) continue;
    const list = priceByArea.get(row.skiAreaId);
    if (list) list.push(row);
    else priceByArea.set(row.skiAreaId, [row]);
  }

  const attemptByArea = new Map<string, AttemptRecord>();
  for (const a of seasonAttempts) attemptByArea.set(a.skiAreaId, a);

  const areaById = new Map<string, SkiArea>();
  for (const a of areas) areaById.set(a.id, a);

  // --- per-country tallies -------------------------------------------------
  const tallies = new Map<string, CountryTally>();
  const tallyFor = (country: string): CountryTally => {
    let t = tallies.get(country);
    if (!t) {
      t = { country, total: 0, withPrice: 0, dynamic: 0, notFound: 0, errored: 0, unchecked: 0 };
      tallies.set(country, t);
    }
    return t;
  };

  for (const area of areas) {
    const t = tallyFor(area.country ?? '??');
    t.total += 1;
    const rows = priceByArea.get(area.id);
    if (rows && rows.length > 0) {
      t.withPrice += 1;
      if (rows.some((r) => r.isDynamic)) t.dynamic += 1;
      continue;
    }
    const attempt = attemptByArea.get(area.id);
    if (!attempt) t.unchecked += 1;
    else if (attempt.outcome === 'error') t.errored += 1;
    else t.notFound += 1;
  }

  const ordered = [...tallies.values()].sort((a, b) => a.country.localeCompare(b.country));

  // --- rows that need a human ---------------------------------------------
  const unconfirmedSeason = seasonAttempts
    .filter((a) => a.outcome === 'found' && !a.seasonConfirmed)
    .sort((a, b) => a.areaName.localeCompare(b.areaName));

  const dynamicRows = seasonAttempts
    .filter((a) => a.outcome === 'found' && a.isDynamic)
    .sort((a, b) => a.areaName.localeCompare(b.areaName));

  const missing = areas
    .filter((a) => !priceByArea.has(a.id))
    .sort((a, b) => (a.country ?? '').localeCompare(b.country ?? '') || a.name.localeCompare(b.name));

  const out: string[] = [];

  out.push(`# Lift-pass prices — ${season}`);
  out.push('');
  out.push(`Generated ${generatedAt} by \`npm run prices:discover\`.`);
  out.push('');
  out.push(
    'Every row in `pass_prices.json` is stored as **`verification: unverified`**. Per the repo rules (README, "Curated data is a claim until a human verifies it") none of it may be shown as bare fact — it renders as *"€X as listed on domain.com, checked <date>"*, or not at all.',
  );
  if (countryFilter && countryFilter.length > 0) {
    out.push('');
    out.push(
      `> This run was limited to \`--countries=${countryFilter.join(',')}\`. The coverage table below still counts the whole significant roster, so the other countries show as *not yet checked* rather than disappearing.`,
    );
  }
  out.push('');

  // --- coverage ------------------------------------------------------------
  out.push('## Coverage by country');
  out.push('');
  out.push('| Country | Significant resorts | With a price | of which dynamic | No price found | Errored | Not yet checked |');
  out.push('|---|---:|---:|---:|---:|---:|---:|');
  let all: CountryTally = { country: 'All', total: 0, withPrice: 0, dynamic: 0, notFound: 0, errored: 0, unchecked: 0 };
  for (const t of ordered) {
    out.push(
      `| ${t.country} | ${t.total} | ${t.withPrice} | ${t.dynamic} | ${t.notFound} | ${t.errored} | ${t.unchecked} |`,
    );
    all = {
      country: 'All',
      total: all.total + t.total,
      withPrice: all.withPrice + t.withPrice,
      dynamic: all.dynamic + t.dynamic,
      notFound: all.notFound + t.notFound,
      errored: all.errored + t.errored,
      unchecked: all.unchecked + t.unchecked,
    };
  }
  out.push(
    `| **All** | **${all.total}** | **${all.withPrice}** | **${all.dynamic}** | **${all.notFound}** | **${all.errored}** | **${all.unchecked}** |`,
  );
  out.push('');

  // --- season not confirmed ------------------------------------------------
  out.push('## Needs human checking — the page never named the season');
  out.push('');
  if (unconfirmedSeason.length === 0) {
    out.push(`No stored ${season} row is standing on an assumed season.`);
  } else {
    out.push(
      `These rows are stored with \`season: "${season}"\` but the page they came from did **not** say so. The figure may be last season's. Check each one against the operator before any of it is displayed.`,
    );
    out.push('');
    out.push('| Resort | Country | 1-day | 6-day | Source |');
    out.push('|---|---|---|---|---|');
    for (const a of unconfirmedSeason) {
      const rows = priceByArea.get(a.skiAreaId) ?? [];
      out.push(
        `| ${esc(a.areaName)} | ${a.country ?? '??'} | ${money(rows.find((r) => r.duration === '1day'))} | ${money(
          rows.find((r) => r.duration === '6day'),
        )} | ${hostOf(a.sourceUrl)} |`,
      );
    }
  }
  out.push('');

  // --- dynamic -------------------------------------------------------------
  out.push('## Dynamic pricing — the stored figure is a floor, not the price');
  out.push('');
  if (dynamicRows.length === 0) {
    out.push('No resort reported demand-based pricing this run.');
  } else {
    out.push(
      'These operators price by date or demand. `isDynamic` is set on every row below and the UI must present the number as a *starting* price, never as what a skier will pay.',
    );
    out.push('');
    out.push('| Resort | Country | From (1-day) | From (6-day) | Source |');
    out.push('|---|---|---|---|---|');
    for (const a of dynamicRows) {
      const rows = priceByArea.get(a.skiAreaId) ?? [];
      out.push(
        `| ${esc(a.areaName)} | ${a.country ?? '??'} | ${money(rows.find((r) => r.duration === '1day'))} | ${money(
          rows.find((r) => r.duration === '6day'),
        )} | ${hostOf(a.sourceUrl)} |`,
      );
    }
  }
  out.push('');

  // --- still missing -------------------------------------------------------
  out.push('## Still missing a price');
  out.push('');
  if (missing.length === 0) {
    out.push(`Every significant resort has a ${season} price on file.`);
  } else {
    out.push(
      `${missing.length} of ${areas.length} significant resorts have no ${season} price. These render as **"not available"** — which is the correct outcome, not a bug.`,
    );
    out.push('');
    out.push('| Resort | Country | Status | Reason |');
    out.push('|---|---|---|---|');
    for (const area of missing) {
      const attempt = attemptByArea.get(area.id);
      const status = attempt ? attempt.outcome.replace('_', ' ') : 'not yet checked';
      const reason = attempt?.reason ?? 'not queried in any run so far';
      out.push(`| ${esc(area.name)} | ${area.country ?? '??'} | ${status} | ${esc(reason)} |`);
    }
  }
  out.push('');

  out.push('---');
  out.push('');
  out.push(
    'Prices, currencies and dates are facts (PLAN.md §9) and are the only thing ingested here. No marketing copy, description or image is copied, no login or paywall is bypassed, and the operator\'s own site is preferred over aggregators. Discovery is machine-assisted and every row awaits human verification.',
  );
  out.push('');

  return out.join('\n');
}
