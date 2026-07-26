/**
 * Pass-price discovery CLI.
 *
 *   npm run prices:discover -- --limit=10 --countries=BG,GE
 *
 * Walks the significant resorts that have no current-season price, asks Claude
 * to find the operator's published adult lift-pass prices (see extract.ts for
 * why that is two API calls), and writes what it finds to
 * data/build/pass_prices.json plus a human-readable report.
 *
 * ---------------------------------------------------------------------------
 * THE RULE THIS FILE EXISTS TO ENFORCE: never invent a price.
 * ---------------------------------------------------------------------------
 * A resort with no published price we can point at renders as "not available".
 * That is a correct answer. A plausible-looking wrong number is not — somebody
 * budgets a family holiday on this. Concretely, every row must clear four
 * guards before it is stored:
 *
 *   1. a source URL, or the row is discarded outright;
 *   2. a currency we recognise, because a bare number is unusable;
 *   3. a sane figure (positive, finite, and a 6-day pass that is not cheaper
 *      than a 1-day pass);
 *   4. `verification: 'unverified'`, always, with no way to set anything else.
 *
 * Dynamic pricing and an unconfirmed season are recorded as first-class states
 * rather than smoothed away: `isDynamic` marks a figure as a floor, and a
 * `seasonConfirmed: false` attempt is called out in the report for a human.
 * ---------------------------------------------------------------------------
 *
 * Politeness (PLAN.md §9): resorts are processed one at a time with a delay
 * between calls, and the web-search budget per resort is capped low. Nothing
 * here fetches a page directly.
 *
 * Resumability: results are written after every single resort, and every
 * attempt — including the misses — is journalled. Ctrl-C once to stop after the
 * current resort; nothing already done is lost, and the next run picks up where
 * this one stopped.
 */

import { promises as fsp } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import Anthropic from '@anthropic-ai/sdk';
import type { PassPrice, PassRegion, Provenance, SkiArea } from '@searchski/core/types';
import { BUILD_DIR } from '../config.ts';
import { extractPassPrice, MAX_SEARCHES, PRICE_MODEL, type PassPriceExtraction } from './extract.ts';
import { renderReport } from './report.ts';
import {
  attemptKey,
  isSettled,
  readPrices,
  readState,
  replaceRows,
  writePrices,
  writeReport,
  writeState,
  type AttemptOutcome,
  type AttemptRecord,
} from './state.ts';

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

interface Options {
  limit: number;
  season: string;
  countries: string[] | null;
  force: boolean;
  delayMs: number;
  dryRun: boolean;
}

const DEFAULT_LIMIT = 25;
/** ~1 request per 1-2s is the crawl-delay PLAN.md §9 commits to. */
const DEFAULT_DELAY_MS = 2_000;

/**
 * Northern-hemisphere season for a date. From July onward the season being sold
 * is the coming winter; before that it is the one currently running.
 */
export function currentSeason(now: Date = new Date()): string {
  const year = now.getUTCFullYear();
  const start = now.getUTCMonth() >= 6 ? year : year - 1;
  return `${start}/${String((start + 1) % 100).padStart(2, '0')}`;
}

function flagValue(argv: readonly string[], name: string): string | null {
  const prefix = `--${name}=`;
  const hit = argv.find((a) => a.startsWith(prefix));
  return hit === undefined ? null : hit.slice(prefix.length);
}

function hasFlag(argv: readonly string[], name: string): boolean {
  return argv.includes(`--${name}`);
}

export function parseOptions(argv: readonly string[]): Options {
  const rawLimit = flagValue(argv, 'limit');
  const parsedLimit = rawLimit === null ? DEFAULT_LIMIT : Number.parseInt(rawLimit, 10);
  const rawDelay = flagValue(argv, 'delay-ms');
  const parsedDelay = rawDelay === null ? DEFAULT_DELAY_MS : Number.parseInt(rawDelay, 10);
  const rawCountries = flagValue(argv, 'countries');

  return {
    limit: Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : DEFAULT_LIMIT,
    season: flagValue(argv, 'season') ?? currentSeason(),
    countries:
      rawCountries === null
        ? null
        : rawCountries
            .split(',')
            .map((c) => c.trim().toUpperCase())
            .filter((c) => c.length > 0),
    force: hasFlag(argv, 'force'),
    delayMs: Number.isFinite(parsedDelay) && parsedDelay >= 0 ? parsedDelay : DEFAULT_DELAY_MS,
    dryRun: hasFlag(argv, 'dry-run'),
  };
}

const HELP = `
Find published adult lift-pass prices for resorts that have none.

  npm run prices:discover -- [flags]

  --limit=N          resorts to query this run          (default ${DEFAULT_LIMIT})
  --season=2026/27   season to look for                 (default: current)
  --countries=IT,BG  restrict to these ISO codes        (default: all)
  --force            re-check resorts already answered  (default: skip them)
  --delay-ms=N       pause between resorts              (default ${DEFAULT_DELAY_MS})
  --dry-run          print the plan and cost estimate, call nothing
  --help             this text

Needs ANTHROPIC_API_KEY. Without it the command explains itself and exits 0 —
it spends money and makes outbound requests, so it never runs by accident.
`;

// ---------------------------------------------------------------------------
// Cost estimate (used by --dry-run and the no-key message)
// ---------------------------------------------------------------------------

/**
 * Rough per-resort token cost. Step 1's input is dominated by whatever the
 * search tool injects, which is the number with the widest spread — treat the
 * output as an order of magnitude, not a quote.
 */
const EST_INPUT_TOKENS = 13_000;
const EST_OUTPUT_TOKENS = 2_100;
const EST_SEARCHES_PER_RESORT = 2.5;
/** claude-opus-5, USD per million tokens. */
const USD_PER_MTOK_IN = 5;
const USD_PER_MTOK_OUT = 25;
/** Anthropic's web-search tool, published at $10 per 1,000 searches. */
const USD_PER_SEARCH = 0.01;

function estimateUsd(resorts: number): number {
  const tokens = (EST_INPUT_TOKENS / 1e6) * USD_PER_MTOK_IN + (EST_OUTPUT_TOKENS / 1e6) * USD_PER_MTOK_OUT;
  const search = EST_SEARCHES_PER_RESORT * USD_PER_SEARCH;
  return resorts * (tokens + search);
}

// ---------------------------------------------------------------------------
// Row construction — where "never invent a price" is actually enforced
// ---------------------------------------------------------------------------

const CURRENCY_SYMBOLS: Record<string, string> = {
  '€': 'EUR',
  '£': 'GBP',
  $: 'USD',
  '₾': 'GEL',
  лв: 'BGN',
};

function normaliseCurrency(raw: string | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (/^[A-Za-z]{3}$/.test(trimmed)) return trimmed.toUpperCase();
  return CURRENCY_SYMBOLS[trimmed] ?? null;
}

function normaliseUrl(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw.trim());
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.toString();
  } catch {
    return null;
  }
}

function hostOf(raw: string): string | null {
  try {
    return new URL(raw).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
}

/** Same host, or one is a subdomain of the other. Good enough for GE/BG/IT. */
function sameSite(a: string, b: string): boolean {
  return a === b || a.endsWith(`.${b}`) || b.endsWith(`.${a}`);
}

function isSaneAmount(value: number | null): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 && value < 100_000;
}

interface RowBuild {
  rows: PassPrice[];
  outcome: AttemptOutcome;
  /** Populated whenever no row was produced, or a figure was dropped. */
  reason: string | null;
}

export function buildRows(
  area: SkiArea,
  extraction: PassPriceExtraction,
  season: string,
  fetchedAt: string,
): RowBuild {
  if (!extraction.found) {
    return { rows: [], outcome: 'not_found', reason: extraction.notes?.trim() || 'no published price located' };
  }

  // Guard 1: no source URL, no row. A price we cannot point at is a rumour.
  const sourceUrl = normaliseUrl(extraction.sourceUrl);
  if (!sourceUrl) {
    return { rows: [], outcome: 'discarded', reason: 'a figure came back with no usable source URL — discarded' };
  }

  // Guard 2: a number without a currency cannot be shown to anyone.
  const currency = normaliseCurrency(extraction.currency);
  if (!currency) {
    return { rows: [], outcome: 'discarded', reason: 'currency missing or unrecognised — discarded' };
  }

  // Guard 3: sane figures.
  const day = isSaneAmount(extraction.adultDay) ? extraction.adultDay : null;
  let sixDay = isSaneAmount(extraction.adult6Day) ? extraction.adult6Day : null;
  const dropped: string[] = [];
  if (sixDay !== null && day !== null && sixDay < day) {
    // A 6-day pass costing less than a 1-day pass is a transcription error
    // essentially every time. Keep the 1-day, drop the 6-day, say so.
    dropped.push('6-day figure was lower than the 1-day figure and was dropped as implausible');
    sixDay = null;
  }
  if (day === null && sixDay === null) {
    return { rows: [], outcome: 'discarded', reason: 'no usable adult 1-day or 6-day figure — discarded' };
  }

  const host = hostOf(sourceUrl);
  const official =
    host !== null && area.websites.some((w) => {
      const known = hostOf(w);
      return known !== null && sameSite(host, known);
    });

  const noteParts: string[] = [
    'Machine-assisted discovery (Claude web search) against the operator\'s published prices. Facts only; awaiting human verification.',
  ];
  if (!official) {
    noteParts.push(
      'Source domain is not one of this area\'s known official websites — confirm it is the operator before trusting the figure.',
    );
  }
  if (!extraction.seasonConfirmed) {
    noteParts.push(`The page did not state the season; ${season} is ASSUMED. Verify before display.`);
  }
  if (extraction.isDynamic) {
    noteParts.push('Dynamic/demand-based pricing: this is a FLOOR, not the price a skier will pay.');
  }
  if (dropped.length > 0) noteParts.push(`${dropped.join('; ')}.`);
  const modelNote = extraction.notes?.trim();
  if (modelNote) noteParts.push(`Note: ${modelNote.slice(0, 200)}`);

  const provenance: Provenance = {
    // `official` when the page really is the operator's own domain. Otherwise
    // `curated`: the claim is a human-checkable assertion, not a primary
    // source, and it is the honest label for an aggregator page. Either way
    // the verification status below is what gates display.
    source: official ? 'official' : 'curated',
    sourceUrl,
    fetchedAt,
    // Never anything else. Discovery cannot promote its own findings.
    verification: 'unverified',
    note: noteParts.join(' '),
  };

  const rows: PassPrice[] = [];
  const base = {
    // Attached to the ski area, never to the pass region: we asked about this
    // resort, and stamping a consortium id onto the answer would assert the
    // figure covers the whole consortium, which we did not establish.
    passRegionId: null,
    skiAreaId: area.id,
    season,
    category: 'adult' as const,
    currency,
    isDynamic: extraction.isDynamic,
    provenance,
  };
  if (day !== null) rows.push({ ...base, duration: '1day', price: day });
  if (sixDay !== null) rows.push({ ...base, duration: '6day', price: sixDay });

  return { rows, outcome: 'found', reason: dropped.length > 0 ? dropped.join('; ') : null };
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readAreas(): Promise<SkiArea[]> {
  const file = path.join(BUILD_DIR, 'ski_areas.json');
  try {
    const raw = await fsp.readFile(file, 'utf8');
    return JSON.parse(raw) as SkiArea[];
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error('data/build/ski_areas.json is missing. Run `npm run etl:all` first.');
    }
    throw err;
  }
}

/**
 * Pass regions are optional context, not a requirement. Knowing that Alta Badia
 * is sold under Dolomiti Superski is the difference between finding the ticket
 * and concluding the resort publishes no price.
 */
async function readPassRegions(): Promise<Map<string, PassRegion>> {
  const file = path.join(BUILD_DIR, 'pass_regions.json');
  try {
    const raw = await fsp.readFile(file, 'utf8');
    const regions = JSON.parse(raw) as PassRegion[];
    return new Map(regions.map((r) => [r.id, r]));
  } catch {
    return new Map();
  }
}

function pad(text: string, width: number): string {
  return text.length >= width ? text.slice(0, width) : text.padEnd(width, ' ');
}

function summarise(rows: readonly PassPrice[]): string {
  return rows.map((r) => `${r.duration} ${r.currency} ${r.price}`).join(', ');
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (hasFlag(argv, 'help')) {
    console.log(HELP);
    process.exit(0);
  }

  const options = parseOptions(argv);

  const allAreas = await readAreas();
  const significant = allAreas.filter((a) => a.isSignificant);
  const passRegions = await readPassRegions();
  const prices = await readPrices();
  const state = await readState();

  const attemptIndex = new Map<string, AttemptRecord>();
  for (const a of state.attempts) attemptIndex.set(attemptKey(a.skiAreaId, a.season), a);

  const pricedAreas = new Set(
    prices.filter((p) => p.season === options.season && p.skiAreaId).map((p) => p.skiAreaId as string),
  );

  // --- build the queue ----------------------------------------------------
  const inScope = significant.filter((area) => {
    if (!options.countries) return true;
    const codes = area.countries.length > 0 ? area.countries : area.country ? [area.country] : [];
    return codes.some((c) => options.countries?.includes(c.toUpperCase()));
  });

  const eligible = inScope.filter((area) => {
    if (options.force) return true;
    if (pricedAreas.has(area.id)) return false;
    const attempt = attemptIndex.get(attemptKey(area.id, options.season));
    // Errors are retried; settled answers are not re-asked without --force.
    return !(attempt && isSettled(attempt.outcome));
  });

  // Sort biggest first: a run cut short by --limit should have covered the
  // resorts most people are actually searching for.
  eligible.sort((a, b) => b.kmTotal - a.kmTotal);
  const queue = eligible.slice(0, options.limit);

  const scopeLabel = options.countries ? options.countries.join(',') : 'all countries';
  console.log('');
  console.log(`[prices] season ${options.season} | ${scopeLabel} | model ${PRICE_MODEL}`);
  console.log(
    `[prices] ${significant.length} significant resorts, ${inScope.length} in scope, ${pricedAreas.size} already priced, ${eligible.length} eligible.`,
  );
  console.log(
    `[prices] this run would query ${queue.length} (limit ${options.limit}), serially, ${options.delayMs}ms apart, max ${MAX_SEARCHES} searches each.`,
  );
  console.log(
    `[prices] rough cost: ~$${estimateUsd(queue.length).toFixed(2)} for this run; ~$${estimateUsd(eligible.length).toFixed(2)} to clear the whole backlog.`,
  );
  console.log('');

  if (options.dryRun) {
    for (const area of queue) {
      console.log(`  ${pad(area.country ?? '??', 3)} ${pad(area.name, 40)} ${area.kmTotal.toFixed(1)} km`);
    }
    console.log('');
    console.log('[prices] --dry-run: nothing was called. Drop the flag to run for real.');
    process.exit(0);
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.log('[prices] ANTHROPIC_API_KEY is not set — nothing was called, and that is not a failure.');
    console.log('');
    console.log('  This command is the one part of the ETL that costs money and makes');
    console.log('  outbound requests to third-party websites, so it never runs by accident.');
    console.log('');
    console.log('  To run it:');
    console.log('    1. export ANTHROPIC_API_KEY=sk-ant-...');
    console.log('    2. npm run prices:discover -- --dry-run        # see the plan and the cost');
    console.log('    3. npm run prices:discover -- --limit=5        # start small');
    console.log('');
    console.log('  Until then the site simply shows "price not available", which is correct.');
    console.log('');
    process.exit(0);
  }

  // --- run ----------------------------------------------------------------
  const client = new Anthropic({ apiKey, timeout: 180_000 });

  let stopRequested = false;
  process.on('SIGINT', () => {
    if (stopRequested) {
      console.log('\n[prices] second interrupt — exiting now.');
      process.exit(130);
    }
    stopRequested = true;
    console.log('\n[prices] stop requested. Finishing the current resort, then writing results.');
  });

  let working = [...prices];
  const tally = { found: 0, dynamic: 0, notFound: 0, discarded: 0, errored: 0 };

  for (let i = 0; i < queue.length; i += 1) {
    const area = queue[i];
    if (!area) continue;
    if (stopRequested) break;
    if (i > 0 && options.delayMs > 0) await sleep(options.delayMs);

    const counter = `${String(i + 1).padStart(3, ' ')}/${queue.length}`;
    const label = `[prices] ${counter} ${pad(area.country ?? '??', 3)} ${pad(area.name, 34)}`;

    const passRegion = area.passRegionId ? passRegions.get(area.passRegionId) : undefined;
    const result = await extractPassPrice(client, {
      areaName: area.name,
      aliases: area.aliases,
      country: area.country,
      regionName: area.regionName,
      websites: area.websites,
      passRegionName: passRegion?.name ?? null,
      passRegionUrl: passRegion?.officialUrl ?? null,
      season: options.season,
    });

    const now = new Date().toISOString();
    let record: AttemptRecord;

    if (result.status === 'ok') {
      const built = buildRows(area, result.extraction, options.season, now);

      // Discovery adds and updates; it never deletes. A `--force` re-check that
      // comes back empty is far more likely to be a search that went wrong than
      // an operator withdrawing a published price — and the row it would delete
      // might be one a human has since verified. Only a NEW set of rows
      // replaces the old ones.
      const hadRows = working.some((p) => p.skiAreaId === area.id && p.season === options.season);
      if (built.rows.length > 0) {
        working = replaceRows(working, area.id, options.season, built.rows);
      }
      const keptNote = built.rows.length === 0 && hadRows ? 'the existing row was kept' : null;

      record = {
        skiAreaId: area.id,
        areaName: area.name,
        country: area.country,
        season: options.season,
        outcome: built.outcome,
        isDynamic: built.rows.some((r) => r.isDynamic),
        seasonConfirmed: built.outcome === 'found' ? result.extraction.seasonConfirmed : false,
        sourceUrl: built.rows[0]?.provenance.sourceUrl ?? null,
        reason: [built.reason, keptNote].filter((r): r is string => Boolean(r)).join('; ') || null,
        checkedAt: now,
      };

      if (built.outcome === 'found') {
        const dyn = record.isDynamic;
        if (dyn) tally.dynamic += 1;
        else tally.found += 1;
        const flags = [
          dyn ? 'FLOOR' : null,
          result.extraction.seasonConfirmed ? null : 'season assumed',
        ].filter((f): f is string => f !== null);
        console.log(
          `${label} ${pad(dyn ? 'dynamic' : 'found', 10)} ${pad(summarise(built.rows), 34)} ${
            hostOf(record.sourceUrl ?? '') ?? '—'
          }${flags.length > 0 ? `  [${flags.join(', ')}]` : ''}`,
        );
      } else if (built.outcome === 'discarded') {
        tally.discarded += 1;
        console.log(`${label} ${pad('discarded', 10)} ${record.reason ?? ''}`);
      } else {
        tally.notFound += 1;
        console.log(`${label} ${pad('not found', 10)} ${record.reason ?? ''}`);
      }
    } else {
      tally.errored += 1;
      record = {
        skiAreaId: area.id,
        areaName: area.name,
        country: area.country,
        season: options.season,
        outcome: 'error',
        isDynamic: false,
        seasonConfirmed: false,
        sourceUrl: null,
        reason: `${result.status}: ${result.reason}`,
        checkedAt: now,
      };
      console.log(`${label} ${pad('error', 10)} ${record.reason}`);
    }

    attemptIndex.set(attemptKey(area.id, options.season), record);

    // Persist after EVERY resort. A crash, a 529, or a Ctrl-C must never cost
    // more than the one call that was in flight.
    await writePrices(working);
    await writeState({ attempts: [...attemptIndex.values()], updatedAt: now });
  }

  const generatedAt = new Date().toISOString();
  await writeReport(
    renderReport({
      season: options.season,
      generatedAt,
      areas: significant,
      prices: working,
      attempts: [...attemptIndex.values()],
      countryFilter: options.countries,
    }),
  );

  console.log('');
  console.log(
    `[prices] done: ${tally.found} found, ${tally.dynamic} dynamic (floor), ${tally.notFound} not found, ${tally.discarded} discarded, ${tally.errored} errored.`,
  );
  console.log(`[prices] wrote data/build/pass_prices.json (${working.length} rows) and pass_prices_report.md.`);
  console.log('[prices] every row is verification:"unverified" — read the report before displaying any of it.');
  console.log('');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main().catch((err: unknown) => {
    console.error(`[prices] FAILED: ${err instanceof Error ? err.message : String(err)}`);
    console.error('[prices] anything already discovered is on disk in data/build/pass_prices.json.');
    process.exit(1);
  });
}
