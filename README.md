# Searchski

A ski-vacation decision engine. Describe the trip you want in plain language and
get ranked resort matches — each with an explanation of exactly why it matched,
and an honest admission where the data isn't there.

**3,729 ski areas across 27 European countries**, 951 of them large enough to be
worth showing.

> **Scope note.** This started as an Israel-specific product; the kosher, Chabad
> and Hebrew-instruction layer is still in the schema and still verification-gated,
> but it is **dormant** — see `apps/web/src/lib/features.ts`. The universal
> replacement is ski-school *languages*: "teaches in English, German and Italian"
> is useful to every visitor, where "Hebrew: yes/no" only served one. Hebrew
> remains a supported **input and UI locale**, which is a feature for everyone and
> proves the right-to-left layer works end to end.

See [PLAN.md](PLAN.md) for the full plan, the competitive picture, the verified
data-source audit, and the honest assessment of whether this is a good idea.

---

## What this is, and what it deliberately is not

**It is** a decision engine and a referral site. It ranks resorts against your
criteria, explains why, and links out to third parties to book.

**It is not** a tour operator. Searchski never combines a flight and a hotel
into a single sale, never takes payment, and is never the merchant of record.
Doing so would make it the "organiser" under the EU Package Travel Directive
(2015/2302): strictly liable for the whole trip and legally required to hold
insolvency protection. Do not add a cart to this codebase without legal advice.
See [PLAN.md](PLAN.md) §9.

---

## Quick start

Requires **Node 20+** (developed on 24). No Python, no Docker, no local database.

```bash
npm install --ignore-scripts

# Stage 0 — download the open data and build the dataset.
# First run downloads ~900 MB from OpenSkiMap into data/raw/ (gitignored).
npm run etl:all

# Stage 1 — check the ranking still behaves, then run the site.
npm run golden
npm run dev
```

The app runs at `http://localhost:3000` with **no database and no API keys**.

### Two things about this Windows machine

**`--ignore-scripts` is required.** OS policy here blocks executing `.exe`
files under `node_modules`, so esbuild's postinstall fails with `EPERM`. That
also means **`tsx` cannot run**, so the ETL executes under **Node 24's native
TypeScript type-stripping** (`node src/build.ts`) instead. The practical
constraint is erasable-syntax-only TypeScript: no `enum`, no `namespace`, no
constructor parameter properties. `tsx` is kept as a devDependency for machines
without the restriction. On Linux/macOS/CI, plain `npm install` works.

**The upstream dumps are gzip-served**, so the `content-length` header reports
the compressed size. `runs.geojson` is ~234 MB on the wire and **798 MB on
disk**. The fetcher validates that each file ends with its closing `]}` before
using it — a truncated download is otherwise indistinguishable from a small one,
and would silently under-report night skiing.

---

## How the data works

Two interchangeable sources, selected by `SEARCHSKI_DATA_SOURCE`:

| Mode | Reads from | When |
|---|---|---|
| `static` (default) | committed JSON in `data/build/` | day one, and every read-only deployment |
| `supabase` | Postgres + PostGIS | once you want trips, curation, and write features |

Three countries is a small enough dataset to commit, so **the site deploys to
Vercel with no database at all**. Supabase is an upgrade, not a prerequisite.

### Pipeline

```
OpenSkiMap bulk GeoJSON  ->  packages/etl  ->  data/build/*.json  ->  apps/web
   (ODbL, daily dumps)         normalize          committed           Next.js
                               + derive                                  |
                                                 Supabase (optional) <---'
```

Refresh cadence is monthly for structure — piste geometry barely changes.
Prices are seasonal. Weather is fetched live and never stored.

### Lift-pass prices (seasonal, opt-in)

```bash
npm run prices:discover -- --dry-run          # what it would query, and roughly what it would cost
npm run prices:discover -- --limit=5          # needs ANTHROPIC_API_KEY
```

Finds the operator's published adult 1-day and 6-day prices for resorts that
have none, using the Claude API's server-side web search. It is the only part
of the pipeline that costs money and makes outbound requests to third parties,
so **without `ANTHROPIC_API_KEY` it explains itself and exits 0** rather than
running by accident. Serial, with a delay between calls, and a low per-resort
search budget — see PLAN.md §9.

It writes `data/build/pass_prices.json`, a resume journal
(`pass_prices_state.json`, so a crash or Ctrl-C never re-reads a site it has
already read), and `pass_prices_report.md`. Three things about the output:

- **Every row is `verification: 'unverified'`** and renders as *"€X as listed
  on domain.com, checked <date>"*, never as bare fact. See rule 2 below.
- **A price with no source URL is discarded, not stored.** A resort with no
  price renders "not available" — the correct answer, not a bug. An absent
  price is fine; a wrong one is a family's ruined budget.
- **Dynamic pricing and an assumed season are recorded, not smoothed away.**
  `isDynamic` marks a figure as a floor; rows whose page never named the season
  are listed in the report for a human to check.

---

## Layout

```
packages/core        domain types, deterministic scoring engine, golden queries
packages/etl         OpenSkiMap ingest, derivation, QA report, pass prices, Supabase loader
packages/affiliates  outbound booking links (link-out only, never a package)
apps/web             Next.js 15 App Router, deploys to Vercel
db/migrations        Supabase schema
data/seed            hand-maintained factual seeds (airports, pass regions)
data/build           generated, committed — what the app reads by default
data/raw             downloaded dumps, gitignored, ~780 MB
```

`packages/core/src/types.ts` is the contract between all three packages. Change
it deliberately.

---

## The rules this codebase enforces

These are encoded in the types and the schema, not just in prose.

**1. Unknown is not false.** `hasNightSki === null` means "we have no data" and
renders as *unknown*. `false` means we checked. Conflating them would quietly
mislead. The same tri-state applies to every optional derived field.

**2. Curated data is a claim until a human verifies it.** Anything typed by a
human — lift-pass prices, ski-school languages, and the dormant regional layer —
defaults to `verification: 'unverified'`, renders as "not yet checked" rather
than as fact, and cannot influence the ranking until confirmed. Prices are the
sharp end: someone budgets a trip on them, and many large resorts price
dynamically, so a scraped figure is a floor and never a quote. This is the one
place in the system where being silent beats being helpful.

**3. Missing data goes neutral, never zero.** Georgian and Bulgarian resorts
have sparser OSM tagging than Alpine ones. Scoring a missing field as zero would
systematically bury exactly the resorts this product exists to surface.

**4. Facts in, expression out.** Piste km, elevations, prices and dates are
facts and safe to ingest. Trail-map images, photos and editorial prose are
copyrighted expression — we render our own maps from OSM and link out to
official ones.

**5. The LLM parses; it never ranks.** Natural language becomes a
`SearchCriteria` object, which the deterministic scorer consumes. Ranking stays
debuggable and reproducible, and the golden query suite can regression-test it.

---

## Deploying

**Vercel** — import the repo, root directory `apps/web`, framework Next.js. No
environment variables are required for the default static mode.

**Supabase** (optional) — create a project, run
`db/migrations/0001_init.sql` in the SQL editor, then:

```bash
DATABASE_URL="postgresql://..." npm run db:load
```

and set `SEARCHSKI_DATA_SOURCE=supabase` plus the two `NEXT_PUBLIC_SUPABASE_*`
values in Vercel.

**Cloudflare is not required.** It only becomes useful if you later self-host
map tiles (R2 + PMTiles).

Copy `.env.example` to `.env.local` for anything optional. Every value in it is
optional; the app degrades cleanly without each one.

---

## Known issues

**Three high-severity npm advisories, all transitive Next.js dependencies.**
`postcss` (XSS via CSS stringify; path traversal via `sourceMappingURL`) and
`sharp`/libvips (CVE-2026-33327/33328/35590/35591).

Assessed rather than ignored: both require attacker-controlled input to reach —
untrusted CSS for postcss, untrusted images for sharp. This app compiles only
its own stylesheets and serves no user-uploaded images, so neither path is
reachable today. That changes the moment you accept user images or third-party
CSS, so re-assess if you add either.

`npm audit fix --force` proposes Next 9.3.3 (2020). That is not a fix. A root
`overrides` block lifts top-level `postcss` to a patched release, but Next 15
keeps a nested `postcss@8.4.31` and pins `sharp` below 0.35, and neither moves.
**The real remedy is upgrading Next 15.5 → 16.2**, which should be done and
tested deliberately, not as part of a security sweep.

## Attribution

Ski area, piste and lift data from [OpenSkiMap](https://openskimap.org) and
[OpenStreetMap](https://www.openstreetmap.org/copyright), licensed **ODbL**.
Cross-references from [Wikidata](https://www.wikidata.org) (**CC0**). Weather
from [Open-Meteo](https://open-meteo.com) — note the free tier is
**non-commercial only**; move to the paid tier before earning revenue.
