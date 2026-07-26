/**
 * Golden-query harness.
 *
 *   npm run golden            (from packages/core, or `npm run golden` at root)
 *   npx tsx src/golden.ts --verbose
 *   npx tsx src/golden.ts --query G08
 *
 * Runs every golden query through the deterministic parser and the scorer,
 * checks its assertions plus the global invariants, prints a pass/fail table,
 * and exits non-zero if anything failed. Run it on every weight change — the
 * entire product value is ranking quality, and this is the only thing standing
 * between a tuned scorer and a guess.
 *
 * When `data/build/ski_areas.json` exists the harness runs TWICE: once against
 * the synthesised fixtures (where the content assertions are meaningful because
 * the roster is known) and once against the real data for the invariants only.
 * Content assertions cannot be trusted against a roster nobody has seen yet.
 */

import { describeCriteria, parseQueryDeterministic } from './criteria.js';
import { loadAreas, SYNTHETIC_AREAS, syntheticContext } from './fixtures.js';
import { explainRelaxation, search, type ScoringContext } from './scoring.js';
import {
  GLOBAL_INVARIANTS,
  GOLDEN_QUERIES,
  STANDALONE_CHECKS,
  type AssertionContext,
  type GoldenQuery,
} from './golden-queries.js';
import type { SearchCriteria, SkiArea } from './types.js';

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const argv = process.argv.slice(2);
const VERBOSE = argv.includes('--verbose') || argv.includes('-v');
const ONLY = (() => {
  const i = argv.findIndex((a) => a === '--query' || a === '-q');
  return i >= 0 ? argv[i + 1]?.toUpperCase() : undefined;
})();

// ---------------------------------------------------------------------------
// Output helpers (no colour codes — this runs in CI and in PowerShell)
// ---------------------------------------------------------------------------

function pad(s: string, n: number): string {
  return s.length >= n ? s.slice(0, n) : s + ' '.repeat(n - s.length);
}

function rule(width = 96): string {
  return '-'.repeat(width);
}

interface Row {
  id: string;
  label: string;
  passed: boolean;
  failures: string[];
  detail: string;
}

// ---------------------------------------------------------------------------
// Parser expectation checking
// ---------------------------------------------------------------------------

function checkParsed(q: GoldenQuery, parsed: SearchCriteria): string[] {
  const problems: string[] = [];
  const expected = q.expectParsed;
  if (!expected) return problems;
  for (const [key, want] of Object.entries(expected)) {
    const got = (parsed as Record<string, unknown>)[key];
    const same = Array.isArray(want)
      ? Array.isArray(got) && want.length === got.length && want.every((v, i) => v === got[i])
      : want === got;
    if (!same) problems.push(`parser: expected ${key}=${JSON.stringify(want)}, got ${JSON.stringify(got)}`);
  }
  return problems;
}

// ---------------------------------------------------------------------------
// Running one query
// ---------------------------------------------------------------------------

function runQuery(q: GoldenQuery, areas: readonly SkiArea[], ctx: ScoringContext, contentAssertions: boolean): Row {
  const parsed = parseQueryDeterministic(q.text);
  const criteria: SearchCriteria = { ...parsed, ...(q.override ?? {}) };
  const response = search(areas, criteria, { ...ctx, parsedBy: 'deterministic' });
  const actx: AssertionContext = { response, areas, ctx };

  const failures: string[] = [];
  if (contentAssertions) failures.push(...checkParsed(q, parsed));
  for (const inv of GLOBAL_INVARIANTS) {
    const msg = inv.check(actx);
    if (msg) failures.push(`invariant "${inv.name}": ${msg}`);
  }
  if (contentAssertions) {
    for (const a of q.assertions) {
      const msg = a.check(actx);
      if (msg) failures.push(`${a.name}: ${msg}`);
    }
  }

  const detail = response.results
    .slice(0, 3)
    .map((r, i) => `${i + 1}. ${r.area.name} ${r.score}`)
    .join('  |  ');

  return { id: q.id, label: q.text, passed: failures.length === 0, failures, detail };
}

// ---------------------------------------------------------------------------
// Report for one dataset
// ---------------------------------------------------------------------------

function runSuite(title: string, areas: readonly SkiArea[], ctx: ScoringContext, contentAssertions: boolean): boolean {
  console.log('');
  console.log(rule());
  console.log(title);
  console.log(rule());

  const queries = GOLDEN_QUERIES.filter((q) => (ONLY ? q.id === ONLY : true));
  const rows: Row[] = queries.map((q) => runQuery(q, areas, ctx, contentAssertions));

  console.log(`${pad('ID', 5)}${pad('RESULT', 8)}${pad('QUERY', 52)}TOP 3`);
  console.log(rule());
  for (const r of rows) {
    console.log(`${pad(r.id, 5)}${pad(r.passed ? 'PASS' : 'FAIL', 8)}${pad(r.label, 52)}${r.detail}`);
    if (!r.passed) for (const f of r.failures) console.log(`     ${' '.repeat(7)}-> ${f}`);
  }

  // --- standalone property checks ------------------------------------------
  console.log('');
  console.log(`${pad('ID', 5)}${pad('RESULT', 8)}PROPERTY`);
  console.log(rule());
  const checkRows: Row[] = [];
  if (!ONLY) {
    for (const c of STANDALONE_CHECKS) {
      const msg = c.run(areas, ctx);
      checkRows.push({ id: c.id, label: c.name, passed: msg == null, failures: msg ? [msg] : [], detail: '' });
      console.log(`${pad(c.id, 5)}${pad(msg == null ? 'PASS' : 'FAIL', 8)}${c.name}`);
      if (msg) console.log(`     ${' '.repeat(7)}-> ${msg}`);
    }
  }

  const all = [...rows, ...checkRows];
  const failed = all.filter((r) => !r.passed);
  console.log(rule());
  console.log(`${all.length - failed.length}/${all.length} passed${failed.length > 0 ? ` — FAILING: ${failed.map((f) => f.id).join(', ')}` : ''}`);
  return failed.length === 0;
}

// ---------------------------------------------------------------------------
// Verbose explanation dump — proof that every result can say why
// ---------------------------------------------------------------------------

function explain(areas: readonly SkiArea[], ctx: ScoringContext): void {
  const q = GOLDEN_QUERIES.find((x) => x.id === (ONLY ?? 'G08')) ?? GOLDEN_QUERIES[0]!;
  const criteria = parseQueryDeterministic(q.text);
  const response = search(areas, criteria, { ...ctx, parsedBy: 'deterministic' });

  console.log('');
  console.log(rule());
  console.log(`EXPLANATION DUMP — ${q.id}: "${q.text}"`);
  console.log(rule());
  console.log(describeCriteria(criteria));
  if (response.relaxedFilters?.length) console.log(explainRelaxation(response.relaxedFilters));
  console.log(`${response.totalConsidered} resorts passed the filters.`);
  for (const r of response.results.slice(0, 3)) {
    console.log('');
    console.log(`${r.area.name} (${r.area.country}) — ${r.score}/100`);
    for (const f of r.factors) {
      const flag = f.dataMissing ? ' [data gap]' : '';
      console.log(`   ${pad(f.label, 30)} ${pad(`${(f.raw * 100).toFixed(0)}%`, 6)} x ${pad(f.weight.toFixed(1), 6)} = ${pad(f.contribution.toFixed(1), 6)}${flag}`);
      console.log(`     ${f.reason}`);
    }
    if (r.failedFilters.length > 0) console.log(`   Falls short on: ${r.failedFilters.join(', ')}`);
  }
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

function main(): void {
  const loaded = loadAreas();

  console.log('Searchski golden-query harness');
  console.log(`Node ${process.version}`);
  console.log(`${GOLDEN_QUERIES.length} golden queries, ${GLOBAL_INVARIANTS.length} invariants, ${STANDALONE_CHECKS.length} property checks`);

  let ok = runSuite(
    `FIXTURES — ${SYNTHETIC_AREAS.length} synthesised areas (content assertions ON)`,
    SYNTHETIC_AREAS,
    syntheticContext(),
    true,
  );

  if (loaded.real) {
    console.log('');
    console.log(`Real ETL output found at ${loaded.source} (${loaded.areas.length} areas).`);
    console.log('Running the invariants against it. Content assertions stay off — they are written');
    console.log('against a known fixture roster and would be meaningless against unseen data.');
    const realOk = runSuite(
      `REAL DATA — ${loaded.areas.length} areas from data/build (invariants only)`,
      loaded.areas,
      loaded.ctx,
      false,
    );
    ok = ok && realOk;
  } else {
    console.log('');
    console.log('No data/build/ski_areas.json yet — running against synthesised fixtures only.');
  }

  if (VERBOSE) explain(loaded.real ? loaded.areas : SYNTHETIC_AREAS, loaded.real ? loaded.ctx : syntheticContext());

  console.log('');
  console.log(ok ? 'GOLDEN SUITE PASSED' : 'GOLDEN SUITE FAILED');
  process.exit(ok ? 0 : 1);
}

main();
