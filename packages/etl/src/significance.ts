/**
 * `isSignificant` — the size threshold that keeps search results from being
 * noise (PLAN.md §5: "OpenSkiMap's 6,983 areas include a great many
 * one-drag-lift village hills").
 *
 * ---------------------------------------------------------------------------
 * THE THRESHOLDS, AND WHY THEY ARE WHAT THEY ARE
 * ---------------------------------------------------------------------------
 * DEFAULT (applies to Italy and anywhere else):
 *     kmTotal >= 5  AND  liftsTotal >= 3  AND  status === 'operating'
 *
 * PLAN.md §5 suggested ">= 5km pistes or >= 3 lifts, tuned per country". We use
 * AND, not OR, in dense-OSM countries: in Italy an OR test admits hundreds of
 * single-lift village hills that happen to have 5 km of piste mapped, and the
 * whole point of the flag is to not show those.
 *
 * GEORGIA and BULGARIA:
 *     kmTotal >= 5  AND  liftsTotal >= 1  AND  status === 'operating'
 *
 * The lift requirement is relaxed to 1 because in these countries OSM LIFT
 * mapping is measurably behind PISTE mapping, and the AND-3-lifts rule drops
 * real, commercially operating resorts. The concrete case that forced this:
 * Chepelare (BG) has 12.3 km of mapped piste and exactly ONE mapped lift. It is
 * a genuine Bulgarian resort with a full lift system; OSM simply has not mapped
 * it. Dropping it would be a data-coverage artifact presented as a product
 * decision. The km bar is NOT relaxed, because piste km is the dimension OSM
 * covers well in both countries and it remains a real size signal.
 *
 * This asymmetry is a deliberate, documented bet, not a fudge — and
 * countryLosses() reports exactly who each threshold costs so it stays honest.
 *
 * `status === 'operating'` is required everywhere: a disused or proposed area
 * is not somewhere anyone can buy a lift pass this winter.
 */

import type { SkiArea } from '@searchski/core/types';

export interface SignificanceThreshold {
  minKmTotal: number;
  minLiftsTotal: number;
  /** Statuses that may qualify. Everything else is excluded. */
  allowedStatuses: readonly string[];
  /** Why this differs from the default — surfaced in the QA report. */
  rationale?: string;
}

export const DEFAULT_THRESHOLD: SignificanceThreshold = {
  minKmTotal: 5,
  minLiftsTotal: 3,
  allowedStatuses: ['operating'],
};

export const COUNTRY_THRESHOLDS: Readonly<Record<string, SignificanceThreshold>> = {
  GE: {
    minKmTotal: 5,
    minLiftsTotal: 1,
    allowedStatuses: ['operating'],
    rationale:
      'OSM lift mapping in Georgia lags piste mapping; a 3-lift bar is a mapping artifact, not a size test.',
  },
  BG: {
    minKmTotal: 5,
    minLiftsTotal: 1,
    allowedStatuses: ['operating'],
    rationale:
      'Same as GE. Concretely: Chepelare has 12.3 km of piste and 1 mapped lift, and is a real operating resort.',
  },
};

export function thresholdFor(country: string | null): SignificanceThreshold {
  if (!country) return DEFAULT_THRESHOLD;
  return COUNTRY_THRESHOLDS[country] ?? DEFAULT_THRESHOLD;
}

/** Which specific rules an area failed. Empty array = significant. */
export function failedRules(area: SkiArea): string[] {
  const t = thresholdFor(area.country);
  const failed: string[] = [];
  if (area.kmTotal < t.minKmTotal) failed.push(`kmTotal ${area.kmTotal} < ${t.minKmTotal}`);
  if (area.liftsTotal < t.minLiftsTotal) {
    failed.push(`liftsTotal ${area.liftsTotal} < ${t.minLiftsTotal}`);
  }
  if (!t.allowedStatuses.includes(area.status)) failed.push(`status '${area.status}' not operating`);
  return failed;
}

export interface DroppedArea {
  id: string;
  name: string;
  country: string | null;
  kmTotal: number;
  liftsTotal: number;
  status: string;
  reasons: string[];
}

export interface CountryLoss {
  country: string;
  total: number;
  significant: number;
  dropped: number;
  /** Which rule did the dropping, counted per rule. Sums >= dropped. */
  droppedBy: Record<string, number>;
  threshold: SignificanceThreshold;
  /** The biggest things we dropped, so a human can sanity-check the cut. */
  largestDropped: DroppedArea[];
}

export interface SignificanceDiagnostics {
  byCountry: CountryLoss[];
  totalSignificant: number;
  totalDropped: number;
}

/** Set isSignificant on every area in place and report what each country lost. */
export function applySignificance(areas: SkiArea[]): SignificanceDiagnostics {
  const dropped: DroppedArea[] = [];

  for (const area of areas) {
    const failed = failedRules(area);
    area.isSignificant = failed.length === 0;
    if (!area.isSignificant) {
      dropped.push({
        id: area.id,
        name: area.name,
        country: area.country,
        kmTotal: area.kmTotal,
        liftsTotal: area.liftsTotal,
        status: area.status,
        reasons: failed,
      });
    }
  }

  const countries = [...new Set(areas.map((a) => a.country ?? 'XX'))].sort();
  const byCountry: CountryLoss[] = countries.map((country) => {
    const mine = areas.filter((a) => (a.country ?? 'XX') === country);
    const myDropped = dropped.filter((d) => (d.country ?? 'XX') === country);
    const droppedBy: Record<string, number> = {};
    for (const d of myDropped) {
      for (const r of d.reasons) {
        // Bucket by rule kind, not by the specific numbers in the message.
        const kind = r.startsWith('kmTotal')
          ? 'below km threshold'
          : r.startsWith('liftsTotal')
            ? 'below lift threshold'
            : 'not operating';
        droppedBy[kind] = (droppedBy[kind] ?? 0) + 1;
      }
    }
    return {
      country,
      total: mine.length,
      significant: mine.filter((a) => a.isSignificant).length,
      dropped: myDropped.length,
      droppedBy,
      threshold: thresholdFor(country),
      largestDropped: myDropped.sort((a, b) => b.kmTotal - a.kmTotal).slice(0, 5),
    };
  });

  return {
    byCountry,
    totalSignificant: areas.filter((a) => a.isSignificant).length,
    totalDropped: dropped.length,
  };
}
