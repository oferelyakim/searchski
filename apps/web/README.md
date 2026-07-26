# @searchski/web

The Searchski web app — Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS v4.

A ski-trip decision engine for the Israeli market. Users describe a trip in their
own words; the app parses that into structured criteria, ranks resorts with the
deterministic scorer in `@searchski/core`, and shows the reason for every point
it awarded.

---

## Quick start

From the **repo root** (this is an npm workspaces monorepo — always install at the root):

```bash
npm install
npm run dev -w @searchski/web      # http://localhost:3000
```

No environment variables are required. With none set, the app reads the
committed JSON artifacts in `data/build/` and runs with no database and no API
keys. That is deliberate: it is how the site deploys to Vercel on day one.

```bash
npm run build -w @searchski/web    # production build
npm run start -w @searchski/web    # serve the production build
npm run typecheck -w @searchski/web
```

### `scripts/run-next.mjs`

The `dev` / `build` / `start` scripts call `node scripts/run-next.mjs <cmd>`
rather than `next <cmd>`. On the Windows box this was built on, the generated
`node_modules/.bin/next.cmd` and `next.ps1` shims are blocked from executing by
a local security policy ("Access is denied") while every other shim in the same
directory runs fine. The launcher resolves `next/dist/bin/next` and spawns it
with `process.execPath`, which behaves identically on Linux and on Vercel. If
your machine runs the shims fine, you can replace it with plain `next <cmd>`.

---

## Environment variables

Every value is optional. See `.env.example` at the repo root; copy it to
`.env.local` to override.

| Variable | Default | Effect |
|---|---|---|
| `SEARCHSKI_DATA_SOURCE` | `static` | `static` reads `data/build/*.json`; `supabase` reads Postgres |
| `SEARCHSKI_DATA_DIR` | auto-detected | Explicit path to the `data/build` directory |
| `NEXT_PUBLIC_SUPABASE_URL` | — | Required when `SEARCHSKI_DATA_SOURCE=supabase` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | — | Anon key; the tables carry world-read RLS policies |
| `ANTHROPIC_API_KEY` | — | Enables LLM query parsing and prose explanations |
| `ANTHROPIC_MODEL` | `claude-opus-5` | Model used by `@searchski/nlp` |
| `CONDITIONS_PROVIDER` | `openmeteo_free` | Set to `openmeteo_paid` with `OPENMETEO_API_KEY` for the commercial tier |
| `TRAVELPAYOUTS_MARKER`, `BOOKING_AID`, `AFFILIATE_SUB_ID` | — | Affiliate attribution; absent values degrade to plain links |

**Never put a secret in a `NEXT_PUBLIC_*` variable.** Only the Supabase URL and
anon key are public by design. `ANTHROPIC_API_KEY` and the affiliate
credentials are read server-side only.

---

## The data access layer

`src/lib/data.ts` is the single entry point (`getDataset()` / `getResort(id)`).
It is **server-only** — never import it from a client component.

Two interchangeable sources sit behind it, chosen by `SEARCHSKI_DATA_SOURCE`:

**`static` (default)** — `src/lib/data-static.ts` reads the committed artifacts
the ETL writes to `data/build/`. It searches upward from `process.cwd()` for the
directory, and matches each dataset against a list of candidate filenames
(`ski_areas.json`, `skiAreas.json`, …) so an ETL rename cannot take the site
down. Every file is optional; a missing one is a logged note, not an error.

**`supabase`** — `src/lib/data-supabase.ts` reads the tables from
`db/migrations/0001_init.sql` with the public anon key. `@supabase/supabase-js`
is imported lazily so it never enters the bundle in static mode. If Supabase
returns nothing or errors, the layer falls back to `static`.

If **both** yield nothing, the app serves the built-in sample rows in
`src/lib/sample-data.ts` and renders a standing banner saying so. Not one
curated Israel-layer row in that sample is marked `verified` — a fabricated
kosher claim is exactly the harm PLAN.md §9 forbids.

Which source actually served a request is logged once per load and surfaced in
`dataset.meta`.

Both sources funnel through `src/lib/coerce.ts`, which accepts camelCase *and*
snake_case, supplies safe defaults, and never invents a value — a missing number
becomes `null`, never a guess.

### Vercel deployment

Set the project's **Root Directory** to `apps/web`. Vercel installs at the repo
root (it detects the workspace) and builds here.

`next.config.ts` sets `outputFileTracingRoot` to the monorepo root and
`outputFileTracingIncludes` for `data/build/**/*.json`. Without that, the
serverless functions cannot see the artifacts and the app silently falls back to
the sample dataset.

---

## Pages

| Route | What it is |
|---|---|
| `/` | Search. Natural-language input, parsed criteria as editable chips, structured filters bound to the same criteria object, ranked results with score breakdowns. |
| `/resort/[id]` | Resort profile: terrain mix, elevation, lift breakdown, crowding, night skiing, forecast, Israel layer, transfers, pass prices, MapLibre map, official links. |
| `/compare?ids=a,b,c` | Up to four resorts side by side. |
| `/about` | Data sources, licences, and the referral-not-tour-operator statement. Legally load-bearing — see PLAN.md §9. |

## API routes

| Route | Notes |
|---|---|
| `POST /api/search` | `{ query?, criteria? }` → `SearchResponse`. Body is whitelisted field by field. Never 500s: a failure returns a well-formed empty response with an `error` string. |
| `GET /api/resorts/[id]` | Full resort bundle with provenance intact. 404 for unknown ids. |
| `GET /api/conditions/[id]` | Open-Meteo forecast, 1-hour in-memory cache. Always 200; unavailable forecasts return `{ conditions: null }`. |
| `POST /api/explain/[id]` | Optional Claude-written prose rendering of a result's factors. Returns `{ explanation: null }` with no API key or on any failure. |

---

## Design rules that are not negotiable

These come from PLAN.md §9. They are enforced in code, not by convention.

**Every score is explained.** `ScoreFactor.reason` strings are rendered verbatim
(`src/components/ScoreBreakdown.tsx`). A factor with `dataMissing: true` renders
as a *missing-data* state — dashed border, "not enough data" — never as a low
score. "We do not know" and "this resort is bad at that" must never look alike.

**Curated values are claims until verified.** Anything from the Israel layer
whose `provenance.verification !== 'verified'` renders through `CuratedFact` as
a quoted claim with an explicit caveat, never as fact. Kosher availability
additionally carries a "do not rely on this for kashrut" warning. `format.ts →
curatedValue()` refuses to hand back an unverified value at all.

**`hasNightSki === null` is "unknown", never "no".** Enforced by
`format.ts → nightSkiState()`.

**`boundaryNote` appears everywhere the km total does.** When upstream merged
two resorts into one record, Alta Badia's 252.8 km covers Val Gardena too.
`components/AreaFacts.tsx → BoundaryNote` renders on the resort page, in result
cards, and in the compare table. We do not split or apportion the number — we
have no faithful basis for that.

**Outbound links name the third party before the click.** `OutboundLinkView`
always shows `provider`, and monetized links carry
`rel="noopener nofollow sponsored"` plus an "affiliate link" label.

**Flights and lodging are never one action.** Combining them into a single sale
would make Searchski the "organiser" under the EU Package Travel Directive —
strict liability plus mandatory insolvency bonding. Separate groups, no cart, no
combined price.

**The LLM parses; it never ranks.** `@searchski/nlp` turns free text into
`SearchCriteria`; `@searchski/core.search()` decides the order deterministically.
When `parsedBy === 'llm'` the UI says so, because the chips are then a model's
interpretation the user needs to be able to correct.

---

## Map

MapLibre GL with OSM raster tiles — no Mapbox, no Google, no API key. The
attribution control is not removable.

`tile.openstreetmap.org` is the OSMF tile server; its usage policy forbids heavy
or commercial use. Before real traffic, move to self-hosted PMTiles or a
free-tier vector provider (PLAN.md §2, §10). `MapCanvas.tsx` is dynamically
imported with `ssr: false` from the client wrapper `ResortMap.tsx`.

## Weather

Open-Meteo's free tier needs no key **and is non-commercial only**. The moment
this site carries affiliate links, move to the paid tier
(`CONDITIONS_PROVIDER=openmeteo_paid` + `OPENMETEO_API_KEY`). PLAN.md §10 budgets
~$29/mo; §12 flags that "non-commercial" is undefined for an affiliate site —
assume it applies.

## i18n

`en` and `he`, one flat dictionary per locale in `src/i18n/dictionary.ts`. The
locale lives in a cookie so the first HTML response already carries the right
`lang` and `dir` — a client-only switch would render LTR English and then flip,
which for an RTL audience is not acceptable. Resort, region and locality names
are never translated; they come from OpenStreetMap in their own script.

## Theming

Semantic CSS custom properties in `globals.css`; components name a role
(`bg-surface`, `text-muted`), never a colour. Light and dark each get their own
values — dark is a selected palette, not an inverted one. OS preference is the
default; the header toggle writes `data-theme` and wins in both directions,
applied by a blocking inline script so there is no flash.

Piste-difficulty colours are a validated categorical scale (lightness band,
chroma floor, adjacent-pair CVD separation, normal-vision separation and 3:1
contrast all pass against both surfaces). They deliberately depart from literal
green/blue/red/black, because the near-black and orange failed CVD and contrast
checks — difficulty is always direct-labelled in the legend as well, so identity
never rests on colour alone.

No webfonts, no CDN, no external requests of any kind.
