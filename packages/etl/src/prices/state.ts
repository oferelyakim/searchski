/**
 * Persistence for pass-price discovery.
 *
 * Two artifacts live in data/build/:
 *
 *   pass_prices.json        the PassPrice rows the web app reads. Only rows
 *                           that carry a real source URL ever land here.
 *   pass_prices_state.json  the journal: one record per resort per season,
 *                           including the ones where nothing was found.
 *
 * The journal is what makes the run resumable. Without it a crash halfway
 * through would re-ask Claude — and re-read somebody else's website — for every
 * resort that legitimately has no published price. It is also the only place
 * the *reason* for a miss is recorded, which is what the report needs.
 *
 * Every write goes through a temp file + rename so a Ctrl-C between `open` and
 * `close` cannot leave a half-written JSON array behind.
 */

import { promises as fsp } from 'node:fs';
import path from 'node:path';
import type { PassPrice } from '@searchski/core/types';
import { BUILD_DIR } from '../config.ts';

export const PRICES_FILE: string = path.join(BUILD_DIR, 'pass_prices.json');
export const STATE_FILE: string = path.join(BUILD_DIR, 'pass_prices_state.json');
export const REPORT_FILE: string = path.join(BUILD_DIR, 'pass_prices_report.md');

/**
 * `found`     — at least one sourced price row was written.
 * `not_found` — the search completed and there is no published price we can
 *               stand behind. A settled, useful answer; not retried.
 * `discarded` — a figure came back but failed a guard (no source URL, no
 *               currency, no usable duration). Settled: the answer was bad.
 * `error`     — the call failed, was refused, or returned nothing. NOT settled;
 *               a later run retries it.
 */
export type AttemptOutcome = 'found' | 'not_found' | 'discarded' | 'error';

export interface AttemptRecord {
  skiAreaId: string;
  areaName: string;
  country: string | null;
  season: string;
  outcome: AttemptOutcome;
  /** True when the stored figure is a floor, not the price. */
  isDynamic: boolean;
  /** False means the season on the row is an assumption a human must check. */
  seasonConfirmed: boolean;
  sourceUrl: string | null;
  /** Why this resort ended where it did. Always populated for non-`found`. */
  reason: string | null;
  checkedAt: string;
}

export interface PriceState {
  /** Journal entries, keyed in memory by `${skiAreaId}|${season}`. */
  attempts: AttemptRecord[];
  updatedAt: string;
}

export function attemptKey(skiAreaId: string, season: string): string {
  return `${skiAreaId}|${season}`;
}

/**
 * Outcomes a rerun should NOT re-ask about. `error` is deliberately absent:
 * a transient 529 must not permanently mark a resort as checked.
 */
export function isSettled(outcome: AttemptOutcome): boolean {
  return outcome === 'found' || outcome === 'not_found' || outcome === 'discarded';
}

async function readJsonIfPresent<T>(file: string): Promise<T | null> {
  try {
    const raw = await fsp.readFile(file, 'utf8');
    return JSON.parse(raw) as T;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw new Error(`${path.basename(file)} exists but could not be read: ${(err as Error).message}`);
  }
}

async function writeAtomic(file: string, contents: string): Promise<void> {
  await fsp.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  await fsp.writeFile(tmp, contents, 'utf8');
  await fsp.rename(tmp, file);
}

export async function readPrices(): Promise<PassPrice[]> {
  const parsed = await readJsonIfPresent<unknown>(PRICES_FILE);
  if (parsed === null) return [];
  if (!Array.isArray(parsed)) {
    throw new Error('pass_prices.json is not a JSON array — refusing to overwrite it.');
  }
  return parsed as PassPrice[];
}

export async function writePrices(rows: readonly PassPrice[]): Promise<void> {
  await writeAtomic(PRICES_FILE, `${JSON.stringify(rows, null, 2)}\n`);
}

export async function readState(): Promise<PriceState> {
  const parsed = await readJsonIfPresent<PriceState>(STATE_FILE);
  if (parsed === null || !Array.isArray(parsed.attempts)) {
    return { attempts: [], updatedAt: new Date().toISOString() };
  }
  return parsed;
}

export async function writeState(state: PriceState): Promise<void> {
  await writeAtomic(STATE_FILE, `${JSON.stringify(state, null, 2)}\n`);
}

export async function writeReport(markdown: string): Promise<void> {
  await writeAtomic(REPORT_FILE, markdown);
}

/**
 * Replace every row for one (area, season) pair. Rows for other seasons, other
 * areas, or region-level rows a human added by hand are left untouched — this
 * file is not exclusively ours.
 */
export function replaceRows(
  all: readonly PassPrice[],
  skiAreaId: string,
  season: string,
  next: readonly PassPrice[],
): PassPrice[] {
  const kept = all.filter((p) => !(p.skiAreaId === skiAreaId && p.season === season));
  return [...kept, ...next];
}
