/**
 * Modeled uphill capacity — the "uncrowded" signal (PLAN.md §5).
 *
 * OSM essentially never carries a lift's real hourly capacity, so we model it
 * from lift TYPE using the conservative industry-typical values frozen in
 * LIFT_CAPACITY_PPH (@searchski/core). Two formulas, both deliberately simple:
 *
 *     uphillCapacityPph = Σ over lift types ( count × pph(type) )
 *     capacityPerKm     = uphillCapacityPph / kmTotal
 *
 * capacityPerKm is the one that actually means something: total throughput
 * divided by the piste km that throughput has to spread over. High = the
 * mountain swallows its own lift output, i.e. short queues and empty pistes.
 *
 * HARD LIMITS OF THIS MODEL, so nobody mistakes it for a measurement:
 *  - It ignores detachable vs fixed-grip, chair width (a "chair_lift" is
 *    anything from a 2-seater to a 8-place bubble), and lift length.
 *  - It ignores actual visitor numbers, which is what crowding really is.
 *  It is only ever valid as a RELATIVE comparison between resorts, and
 *  core/types.ts says so too. Never render it as a number to a user.
 */

import { LIFT_CAPACITY_PPH, type SkiArea } from '@searchski/core/types';

export interface CapacityDiagnostics {
  /**
   * Lift types present upstream that LIFT_CAPACITY_PPH has no entry for, with
   * how many lifts fell back to the `unknown` value. Extend the table in
   * packages/core/src/types.ts when anything meaningful shows up here.
   */
  unmatchedLiftTypes: Record<string, number>;
  /** Areas with lifts but zero piste km, so capacityPerKm is undefined. */
  areasWithoutKm: number;
  /** Areas with no lifts at all in the data. */
  areasWithoutLifts: number;
}

const FALLBACK_PPH = LIFT_CAPACITY_PPH['unknown'] ?? 800;

/** Capacity for one lift of the given type, falling back to `unknown`. */
export function pphForType(
  type: string,
  unmatched: Record<string, number>,
  count: number,
): number {
  const known = LIFT_CAPACITY_PPH[type];
  if (typeof known === 'number') return known;
  unmatched[type] = (unmatched[type] ?? 0) + count;
  return FALLBACK_PPH;
}

/**
 * Fill uphillCapacityPph and capacityPerKm on every area, in place.
 * Returns diagnostics so build.ts can surface unmatched lift types in the QA
 * report rather than swallowing them.
 */
export function applyCapacity(areas: SkiArea[]): CapacityDiagnostics {
  const diagnostics: CapacityDiagnostics = {
    unmatchedLiftTypes: {},
    areasWithoutKm: 0,
    areasWithoutLifts: 0,
  };

  for (const area of areas) {
    let pph = 0;
    let liftCount = 0;
    for (const [type, bucket] of Object.entries(area.liftsByType)) {
      const count = bucket.count;
      if (count <= 0) continue;
      liftCount += count;
      pph += count * pphForType(type, diagnostics.unmatchedLiftTypes, count);
    }

    area.uphillCapacityPph = Math.round(pph);

    if (liftCount === 0) diagnostics.areasWithoutLifts++;

    if (area.kmTotal > 0) {
      // pph per piste km. Rounded to 1dp — the model is nowhere near precise
      // enough to justify more, and false precision invites false trust.
      area.capacityPerKm = Math.round((area.uphillCapacityPph / area.kmTotal) * 10) / 10;
    } else {
      // Unknown, not zero: we cannot divide by a piste length we do not have.
      area.capacityPerKm = null;
      if (liftCount > 0) diagnostics.areasWithoutKm++;
    }
  }

  return diagnostics;
}
