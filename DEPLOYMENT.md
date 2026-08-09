# Deploying Searchski

Everything here is optional except step 1. The site runs on Vercel with **no
database and no API keys** — that is the default and it is a real deployment,
not a demo mode.

Order matters: get it live first, then add capability. Each step below is
independently useful and independently reversible.

---

## Step 0 — Put it in git

There is no repository yet. Before anything else:

```bash
git init
git add -A
git status --short | wc -l          # sanity: should be a few hundred files, not tens of thousands
git check-ignore -v data/raw/runs.geojson   # sanity: MUST print a match
git commit -m "Searchski: initial build"
```

Both checks matter. `data/raw/` is **920 MB** of re-downloadable upstream dumps
and is gitignored; if `git check-ignore` prints nothing, stop and fix it before
committing, because it is far more annoying to remove afterwards.

`data/build/` (735 KB) is **deliberately not ignored** — it is the dataset the
app reads in `static` mode, so it has to be in the repo for Vercel to serve
anything. If you ever move to Supabase-only, that's when to start ignoring it.

## Step 1 — Vercel (this is the whole launch)

1. Push to GitHub (`gh repo create` or via the web UI).
2. Vercel → **Add New → Project** → import the repo.
3. Settings:
   - **Root Directory:** `apps/web`
   - **Framework:** Next.js (auto-detected)
   - **Build/Install commands:** leave as default
   - **Environment variables:** none
4. Deploy.

**Which branch becomes production.** Vercel builds *production* from the
branch its project settings track and every other branch as a *preview*
deployment with its own URL. **Done for this repo on 2026-08-09:** `main` is
the GitHub default and the Vercel production branch (project `chai-tov-ski`,
Settings → Environments → Production → Branch Tracking). If either side is
ever reset, the failure mode and the two fixes are:

The symptom is production serving stale code while new pushes only get
preview URLs — Vercel records a production branch at import time and does
not follow a later GitHub default-branch change. Two fixes, either works:

- **Create `main`** from the active branch, set it as the GitHub default
  (repo → Settings → General → Default branch), and let Vercel track it.
  The long-term-clean option.
- **Or** leave GitHub alone and set Vercel → Project → **Settings → Git →
  Production Branch** to the active branch name. Zero repo changes; every
  push to that branch then goes straight to production.

Auto-deploy needs no configuration beyond this: once the repo is imported,
every `git push` triggers a build — production for the production branch,
preview URLs for everything else.

That's it. The app reads the committed JSON in `data/build/`, which is why no
database is needed — three countries is a small enough dataset to ship in the
repo. `next.config.ts` already sets `outputFileTracingRoot` to the monorepo root
so those files get bundled into the serverless functions.

**Verify the deploy is reading real data, not the sample fallback.** Search for
`Gudauri` — if it returns a resort with ~40 km of piste and a 3246 m summit,
`data/build/` was bundled correctly. If you get a handful of obviously
placeholder resorts, tracing failed and everything downstream will be wrong.

---

## Step 2 — Supabase (only when you need to write)

Not needed for search. Add it when you want saved trips, the curation admin, or
to stop shipping data in the repo.

1. Create a project at supabase.com. Note the region — pick Frankfurt or London
   for European latency.
2. **SQL Editor** → run the migrations **in order**:
   ```
   db/migrations/0001_init.sql
   db/migrations/0002_boundary_note.sql
   db/migrations/0003_countries.sql
   ```
   `0001` enables PostGIS and `pg_trgm` itself — no extension setup needed first.
3. Load the data from your machine:
   ```bash
   DATABASE_URL="postgresql://postgres.[ref]:[pw]@aws-0-[region].pooler.supabase.com:6543/postgres" \
     npm run db:load
   ```
   Get that string from **Project Settings → Database → Connection string →
   Transaction pooler**. Use the pooler, not the direct connection.
4. In Vercel, set:
   ```
   SEARCHSKI_DATA_SOURCE=supabase
   NEXT_PUBLIC_SUPABASE_URL=https://[ref].supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=[anon key]
   ```
   `DATABASE_URL` stays out of Vercel — it is only used by the loader on your
   machine, and it is a superuser-grade credential.

> ⚠️ **`db:load` has never been run against a live database.** There is no
> Postgres on the machine this was built on, so the no-database path is verified
> and the upsert path is not. Run it against a scratch Supabase project first and
> read the output before pointing anything real at it.

Row Level Security is on for every table. Reference data is world-readable;
`trip` and `trip_item` are restricted to their owner via `auth.uid()`.

---

## Step 3 — Cloudflare

**You don't need it.** Vercel + Supabase is the whole stack.

It becomes useful in exactly one case: if you want to self-host map tiles
instead of using the free basemap, put PMTiles in R2 and serve them through a
Worker. That is a cost optimisation for later, not a launch requirement.

---

## Step 4 — Optional services

Each degrades cleanly by absence. Add them when they earn their place.

| Variable | Unlocks | Without it |
|---|---|---|
| `ANTHROPIC_API_KEY` | natural-language query parsing + per-result explanations | deterministic keyword parsing, which works — the factor reasons are already readable prose |
| `TRAVELPAYOUTS_MARKER` | affiliate attribution on flight/lodging links | plain unattributed links that still work |
| `BOOKING_AID` | Booking.com attribution | same |
| `OPENMETEO_API_KEY` | commercial-licensed weather | free tier, **which is non-commercial only** — see below |

### The one that will bite you

**Open-Meteo's free tier is licensed for non-commercial use only.** The moment
the site earns affiliate revenue, that tier no longer covers you. It is $29/mo
for the Standard plan. Budget it as a condition of monetising, not as an
optimisation — it is the single cheapest way to be in the wrong on licensing.

---

## Keeping data fresh

| What | How often | Command |
|---|---|---|
| Ski areas, runs, lifts | monthly | `npm run etl:all`, commit `data/build/` |
| Israel layer (kosher, Chabad, Hebrew instruction) | pre-season + spot checks | edit `data/seed/`, re-run ETL |
| Pass prices | annually, autumn | hand-entered; no scraper ships enabled |
| Weather | live | request-time, 1h cache, never stored |

Piste geometry barely changes — monthly is generous. The first ETL run downloads
~900 MB into `data/raw/` (gitignored); later runs reuse it unless you delete it.

To run the refresh in CI instead, use `ubuntu-latest` — the Windows-specific
constraints in the README (`--ignore-scripts`, no `tsx`) do not apply there.

---

## Before you take money

Two things, in this order:

1. **Verify the Israel layer.** Everything in `data/seed/israel_layer_research.json`
   is `unverified`, which means it is ignored by ranking and shown as "not yet
   checked". Confirm each row against its `sourceUrl`, then set
   `verification: "verified"` and put your name in `curatedBy`. About 30 minutes.
   A wrong kosher claim damages a real family's holiday — this is the one place
   in the system where silence beats helpfulness.

2. **Stay a referral site.** Separate links the user follows and books
   themselves. The moment you combine a flight and a hotel into one sale you
   become the "organiser" under the EU Package Travel Directive: strictly liable
   for the whole trip and legally required to hold insolvency protection. Do not
   add a cart without legal advice. See PLAN.md §9.
