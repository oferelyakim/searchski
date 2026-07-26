# Searchski — Build Plan

A European ski-vacation planner. Users describe what they want ("sunny, uncrowded,
great for a nervous intermediate, ski-in/ski-out, lift pass under €X") and get
resort matches, ranked and explained. This document is the master plan and the
brief for implementation. It is written so it can be handed to Claude Code in an
IDE and executed phase by phase.

**Status:** greenfield. This file is the only artifact so far. Nothing here is
built yet.

---

## 0. Guiding principles

1. **Free-tier first.** Every phase ships on free/open data and free API tiers.
   Paid sources are only added where they demonstrably pay for themselves (live
   lodging inventory, live snow conditions at scale).
2. **Facts, not expression.** We ingest factual specs (piste km, lift counts,
   prices, dates, coordinates). We never copy editorial reviews, star ratings
   as-presented, photos, or trail-map images. We render our own maps from open
   geodata and link out to official maps. (See §9.)
3. **One entity spine.** Every resort is keyed on its **Wikidata Q-ID**. All
   other sources (OSM/OpenSkiMap, Wikipedia, scraped aggregators, lodging APIs)
   join onto that spine. Entity resolution is the hardest engineering problem —
   treat it as first-class, not an afterthought.
4. **Three freshness tiers, not "weekly".** Data changes at very different
   rates; the scheduler must reflect that (see §6). "Weekly" only fits
   conditions; structure is near-static, prices are seasonal, lodging is live.
5. **Source abstraction for the upgrade path.** Every category of data is read
   through a provider interface with a free implementation now and a paid
   implementation slotted in later without touching callers (see §8).
6. **Transparent matching before AI.** The core match is a deterministic,
   debuggable weighted-scoring algorithm over structured fields. An LLM is used
   only for what it is good at: parsing the natural-language query into
   structured criteria, and explaining results. The LLM never does the ranking.

---

## 1. Architecture overview

```
                 ┌─────────────────── Ingestion layer ───────────────────┐
                 │                                                        │
 OpenSkiMap ─────┤ seeders (bulk, licensed-open)                          │
 Wikidata SPARQL ┤   → normalize → entity-resolve on Wikidata Q-ID        │
 Wikipedia/DBpedia┤                                                       │
 (later) scrapers ┤ enrichers (facts only: prices, dates)                 │
 (later) APIs    ─┤ connectors (conditions, lodging — live, provider IF)  │
                 └───────────────────────────┬────────────────────────────┘
                                             │
                                   ┌─────────▼─────────┐
                                   │  Postgres+PostGIS  │  ← system of record
                                   │  resorts / runs /  │     (static + seasonal)
                                   │  lifts / prices /  │
                                   │  conditions_cache  │
                                   └─────────┬─────────┘
                                             │
                    ┌────────────────────────▼────────────────────────┐
                    │  API (FastAPI)                                    │
                    │   /resorts  /resorts/{id}  /search (criteria)     │
                    │   match engine (weighted scoring)                 │
                    │   live pass-through: conditions, lodging quotes   │
                    └────────────────────────┬────────────────────────┘
                                             │
                                   ┌─────────▼─────────┐
                                   │  Web frontend      │
                                   │  (Next.js + map)   │
                                   └───────────────────┘
```

Live data (snow conditions, lodging price/availability) is **fetched at request
time, not stored** — both for freshness and to respect API caching terms.

---

## 2. Tech stack

Pick boring, well-supported tools. Recommended default (adjust to taste):

| Concern | Choice | Why |
|---|---|---|
| Language (backend/ETL) | **Python 3.12** | Best geodata + scraping ecosystem |
| DB | **PostgreSQL 16 + PostGIS** | Geometry, distance queries (ski-in/ski-out), JSONB |
| API | **FastAPI** | Fast, typed, async |
| ETL orchestration | **Prefect** (or plain cron to start) | Freshness-tiered scheduling |
| Geospatial | **GeoPandas, Shapely, pyproj** | Length-from-geometry, lift-proximity |
| Scraping (Phase 2) | **Playwright** (+ stealth) | Aggregators sit behind Cloudflare |
| Frontend | **Next.js + MapLibre GL** | MapLibre renders our own OSM-derived tiles, no map-tile fees |
| NL query parsing (Phase 3) | **Claude API** (structured output) | Query → criteria JSON; explanations |
| Containerization | **Docker Compose** | Postgres + api + worker locally |

Everything above has a free/OSS tier. MapLibre + self-hosted or free OSM tiles
avoids Google/Mapbox map fees.

---

## 3. Data model (initial schema)

Postgres. Geometry in `EPSG:4326`, computations in a local projection or via
geography type. This is a starting schema — evolve as needed.

```sql
-- The entity spine. One row per ski area.
CREATE TABLE resort (
  id              bigserial PRIMARY KEY,
  wikidata_qid    text UNIQUE,               -- e.g. 'Q1541550' — the join key
  openskimap_id   text UNIQUE,               -- OpenSkiMap ski_area id
  name            text NOT NULL,
  country         text,                       -- ISO code
  region          text,
  location        geography(Point,4326),      -- resort centroid
  base_elev_m     int,
  top_elev_m      int,
  vertical_m      int,                        -- top - base (derived)
  website         text,
  sources         jsonb,                      -- {field: {value, source, fetched_at}}
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

-- Runs (pistes). Geometry from OSM; length derived, not tagged.
CREATE TABLE run (
  id            bigserial PRIMARY KEY,
  resort_id     bigint REFERENCES resort(id),
  osm_id        text,
  name          text,
  difficulty    text,                          -- novice|easy|intermediate|advanced|expert|freeride
  piste_type    text,                          -- downhill|nordic|skitour|snow_park|...
  geom          geography(LineString,4326),
  length_m      numeric,                       -- computed from geom (+ elevation for true slope length)
  lit           boolean
);

-- Lifts.
CREATE TABLE lift (
  id            bigserial PRIMARY KEY,
  resort_id     bigint REFERENCES resort(id),
  osm_id        text,
  name          text,
  aerialway     text,                          -- chair_lift|gondola|cable_car|drag_lift|...
  geom          geography(LineString,4326),
  length_m      numeric,
  capacity_pph  int,                           -- persons/hour, often missing in OSM
  occupancy     int
);

-- Derived per-resort aggregates (materialized from run/lift), recomputed on refresh.
CREATE TABLE resort_stats (
  resort_id        bigint PRIMARY KEY REFERENCES resort(id),
  runs_total       int,
  km_total         numeric,
  km_novice        numeric,
  km_easy          numeric,
  km_intermediate  numeric,
  km_advanced      numeric,
  km_expert        numeric,
  lifts_total      int,
  lifts_by_type    jsonb,
  computed_at      timestamptz
);

-- Lift-pass prices. Seasonal; scraped (facts) or manual. Model dynamic pricing later.
CREATE TABLE pass_price (
  id            bigserial PRIMARY KEY,
  resort_id     bigint REFERENCES resort(id),
  season        text,                          -- '2026/27'
  category      text,                          -- adult|youth|child|senior
  duration      text,                          -- '1day'|'6day'|'season'
  price         numeric,
  currency      text,
  is_dynamic    boolean DEFAULT false,         -- flagship resorts w/ demand pricing
  source        text,
  source_url    text,
  fetched_at    timestamptz
);

-- Live conditions: short-TTL cache only. Never the system of record.
CREATE TABLE conditions_cache (
  resort_id     bigint REFERENCES resort(id),
  snow_base_cm  int,
  snow_top_cm   int,
  lifts_open    int,
  runs_open     int,
  weather       jsonb,
  fetched_at    timestamptz,
  PRIMARY KEY (resort_id, fetched_at)
);
```

Lodging is **not** stored as inventory — it is fetched live via the lodging
provider interface (§8) and only a `place_id`/property-id reference may be cached
(per Google/Booking terms). Ski-in/ski-out is *derived*: PostGIS distance from a
property's coordinates to the nearest lift base.

---

## 4. Data sources — free tier first, with upgrade prep

### Tier A — FREE, open, bulk (the foundation; build Phase 0/1 entirely on these)

| Source | Gives us | Access | License | Notes |
|---|---|---|---|---|
| **OpenSkiMap** (`openskimap.org`) | ski_areas, runs, lifts as daily GeoJSON/GeoPackage, difficulty, elevation | Bulk download | ODbL | Already clusters runs→resorts. **Primary seed.** `github.com/russellporter/openskidata-processor` |
| **OpenSkiStats** (`openskistats.org`) | per-area derived metrics (vertical, run counts, orientation) | GitHub / data files | open | Reference for derived stats |
| **Wikidata** (Q130003 = ski resort) | Q-ID spine, coords, elevation, operator, website, country, cross-IDs | SPARQL `query.wikidata.org/sparql` | **CC0** | The join key. Most permissive. |
| **Wikipedia / DBpedia** (`Infobox ski area`) | skiable area, trail counts, lift counts, vertical (marketing stats) | DBpedia SPARQL / dumps | CC-BY-SA | Fills aggregate numbers OSM lacks |
| **OpenStreetMap / Overpass** | raw pistes/lifts for gap-filling a region | Overpass API | ODbL | Use for regions OpenSkiMap misses |
| **Gov open data** (opendata.swiss Seilbahninventar; data.gouv.fr; data.gv.at; dati.lombardia/trentino; South Tyrol) | authoritative regional lift/piste inventory | per-portal | Licence Ouverte / CC-BY | Optional accuracy boost per region |

### Tier B — FREE API tiers (add in Phase 1/2)

| Source | Gives us | Free tier | Caching/ToS |
|---|---|---|---|
| **Tripadvisor Content API** | ratings, reviews, photos, amenities (enrichment) | 5,000 calls/mo free | Attribution + display rules |
| **Google Places API** | coords, photos, ratings for lodging/POIs | pay-per-call, small free tiers | **Store only `place_id`; no caching content** |
| **Open-Meteo / MET Norway** | free weather/mountain forecasts | free, no key (Open-Meteo) | good free fallback for conditions before paid snow API |
| **LiteAPI (Nuitée)** | lodging: coords, amenities, photos, live rates, booking | **self-serve, free to start, no volume gate** | storable static content; margin-based earnings |
| **Travelpayouts** | lodging affiliate (price + link) | free, instant, 50% rev-share | referral; limited content reuse |

### Tier C — Paid / contracted (prep interfaces now, adopt when it pays off)

| Source | Gives us | Onboarding | When |
|---|---|---|---|
| **RateHawk / ETG** | wholesale hotels + **apartments/villas**, strong Alps | ~1–2 wk contract, no IATA | when you want rental depth + margin |
| **Expedia Rapid (+ Vrbo)** | hotels + **vacation rentals** in one API | ~12–20 wk certification | scale phase |
| **OnTheSnow / Mountain News API** | clean JSON snow + terrain + lift status + history | paid partner | when free weather isn't enough |
| **Weather Unlocked / Weather Company** | elevation-band ski forecasts | paid | conditions at scale |
| **skiresort.info data feed** | licensed price/spec baseline | B2B negotiation | if scraping maintenance gets heavy |

**Do NOT use:** Booking.com **Demand** API early (volume-gated, lengthy) — its
affiliate program is instant but bars content reuse. **Airbnb** — no public API,
affiliate dead since 2021, not obtainable for a startup; substitute Vrbo (Expedia
Rapid) + RateHawk apartments. **Amadeus Self-Service** — decommissioned July 2026.

---

## 5. The gap fields (what free/open data can't give)

These need scraping (facts only) or a paid source. Prioritize official sites.

| Field | Free/open? | Plan |
|---|---|---|
| Trails, lifts, difficulty, elevation, km | ✅ OpenSkiMap/OSM/Wikipedia | Done in Phase 0/1 |
| Lift-pass prices | ❌ | Phase 2: scrape official site (primary) + skiresort.info/bergfex (cross-check). Facts only. |
| Ski-school prices | ❌ | Phase 2: scrape school/resort price tables (no instructor names — GDPR). Or CheckYeti/Maison Sport affiliate. |
| Opening/closing dates | ❌ | Phase 2: bergfex/j2ski/official |
| Trail-map image | ⚠️ copyrighted | **Render our own** from OSM; link out to official map |
| Snow depth / open lifts | partial | Free weather (Open-Meteo) → paid snow API later |
| Lodging + ski-in/ski-out | ❌ | LiteAPI (free) live; ski-in/ski-out **derived** via PostGIS lift-proximity |

---

## 6. Freshness tiers (scheduler design)

| Tier | Data | Cadence | Mechanism |
|---|---|---|---|
| **Static** | geometry, runs, lifts, difficulty, vertical, stats | monthly | re-pull OpenSkiMap dump, re-resolve, recompute stats |
| **Seasonal** | pass prices, ski-school tariffs, opening dates | annually (autumn) + spot | scrape jobs each pre-season; flag dynamic-priced resorts |
| **Dynamic** | snow, open lifts, weather, lodging price/availability | live / on-request | fetch at request time, short-TTL cache only |

"Weekly" is optional for conditions but never needed for structure. Build the
scheduler around these three tiers from the start.

---

## 7. Phased plan

Each phase is shippable and runs on free tiers. Acceptance criteria are concrete
so progress is measurable.

### Phase 0 — Proof of concept: seed the Alps from free data (days)
**Goal:** prove entity resolution and data quality on one region before
committing to architecture.
- [ ] Repo scaffold (§10), Docker Compose with Postgres+PostGIS, schema (§3).
- [ ] Seeder: download OpenSkiMap `ski_areas`, `runs`, `lifts` GeoJSON; load
      into Postgres for AT/FR/CH/IT.
- [ ] Compute `resort_stats` from geometry (run length from LineString +
      elevation; km by difficulty; lift counts by type).
- [ ] Seeder: Wikidata SPARQL for Q130003 in those countries → populate
      `resort.wikidata_qid`, coords, website, elevation.
- [ ] **Entity resolution:** match OpenSkiMap areas ↔ Wikidata items (name +
      geodistance; manual review list for ambiguous). This is the key risk —
      measure match rate.
- [ ] Enricher: DBpedia infobox stats to fill gaps (skiable area, trail counts).
- [ ] Output: a CSV/JSON report of the resulting resort table + a data-quality
      summary (coverage %, match rate, missing-field counts).

**Acceptance:** ≥200 Alpine resorts with name, coords, vertical, run/lift counts,
km-by-difficulty; Wikidata match rate reported; a written note on data-quality
gaps. Decision gate: is open-data quality good enough to proceed? (Expected: yes.)

### Phase 1 — MVP: full European structural DB + search (weeks)
**Goal:** a usable planner on free data alone.
- [ ] Extend seeders to all European countries.
- [ ] Conditions connector using **Open-Meteo** (free) behind the conditions
      provider interface (§8).
- [ ] Match engine: weighted scoring over structured criteria (difficulty mix,
      size, altitude/snow-reliability proxy, vertical, beginner/expert
      friendliness). Deterministic and explainable.
- [ ] FastAPI: `/resorts`, `/resorts/{id}`, `/search` (criteria in → ranked out).
- [ ] Next.js frontend: filter UI + resort profiles + MapLibre map rendering our
      own OSM-derived runs/lifts. Link out to official trail maps.
- [ ] Freshness scheduler: monthly static refresh job.

**Acceptance:** search "intermediate-friendly, 100km+ pistes, high altitude"
returns sensible ranked European resorts with map, stats, and conditions; monthly
refresh runs; zero paid services used.

### Phase 2 — Commercial/gap data (the hard, ongoing-cost part)
**Goal:** add prices, dates, lodging.
- [ ] Scrapers (Playwright + stealth): official resort sites (primary) for pass
      prices + opening dates; skiresort.info/bergfex as cross-check. **Facts
      only**; per-domain rate limits; robots.txt respected; identifiable UA;
      hard caching. (§9)
- [ ] `pass_price` populated for top N resorts; `is_dynamic` flagged.
- [ ] Lodging provider: **LiteAPI** implementation of the lodging interface
      (§8) — live rates/availability, storable static content.
- [ ] Ski-in/ski-out derivation: PostGIS nearest-lift-base distance per property.
- [ ] Optional: Tripadvisor free tier for ratings/reviews enrichment.
- [ ] Seasonal scraper jobs scheduled for pre-season.

**Acceptance:** a resort profile shows current pass prices (with source +
fetched_at), opening dates, and live LiteAPI lodging with a derived
ski-in/ski-out flag. Scraper is polite and robots-respecting.

### Phase 3 — AI matching & personalization
**Goal:** natural-language planning.
- [ ] Claude API (structured output): NL query → criteria JSON fed to the
      existing deterministic match engine (LLM parses, does not rank).
- [ ] LLM-generated per-result explanations ("why this resort fits you").
- [ ] Saved preferences, trip shortlists.
- [ ] Optional upgrade: swap Open-Meteo → paid snow API; add RateHawk lodging
      provider for apartment/chalet depth — both drop in via the interfaces.

**Acceptance:** a free-text prompt yields a ranked, explained shortlist; paid
providers can be enabled by config without touching callers.

---

## 8. The upgrade path — provider interfaces to build NOW

To make "free now, paid later" a config change rather than a rewrite, define
these interfaces in Phase 1 and back them with free implementations. Paid
implementations are added in Phase 2/3 without changing any caller.

```python
# lodging: free=LiteAPI/Travelpayouts, paid=RateHawk/ExpediaRapid
class LodgingProvider(Protocol):
    def search(self, lat: float, lon: float, radius_km: float,
               check_in: date, check_out: date, guests: int) -> list[LodgingOffer]: ...
    # LodgingOffer: name, coords, price, currency, amenities, ski_in_out(derived), booking_url

# conditions: free=OpenMeteo, paid=OnTheSnow/WeatherUnlocked
class ConditionsProvider(Protocol):
    def get(self, resort_id: int) -> Conditions: ...
    # Conditions: snow_base_cm, snow_top_cm, lifts_open, runs_open, forecast

# prices: free=scraper, paid=skiresort.info feed
class PassPriceProvider(Protocol):
    def get(self, resort_id: int, season: str) -> list[PassPrice]: ...
```

Select the implementation via environment/config:
`LODGING_PROVIDER=liteapi`, `CONDITIONS_PROVIDER=openmeteo`, etc. Adding a paid
tier = writing one new class and flipping one env var.

---

## 9. Legal guardrails (not legal advice — verify with counsel)

**The load-bearing rule: ingest facts, never expression.**

- ✅ **Safe to scrape (facts):** prices, opening dates, lift counts/types, piste
  km by difficulty, elevations, ski-school *prices*. Facts aren't copyrightable
  (Feist). Scraping public pages isn't a computer crime (Van Buren, hiQ).
- ❌ **Never copy (expression / high risk):** trail-map & piste-map **images**,
  photos, editorial review prose, star ratings as-presented. Render our own
  maps from OSM; link out to official maps; derive our own scores from raw facts.
- ❌ **No personal data:** named ski instructors, review authors, staff (GDPR
  applies even to public data). Drop any field carrying a person's name.
- ❌ **No login/auth bypass:** never create accounts on scraped sites (avoids
  forming a binding contract; EU *Ryanair* case means even T&Cs can restrict
  scraping) and never defeat anti-bot to reach gated content.
- ⚠️ **Don't mirror a whole dataset:** EU database sui-generis right. Merge
  multiple sources, re-verify, re-present in our own layout — don't lift one
  site's catalog wholesale.
- **Licensing to honor:** OSM/OpenSkiMap = **ODbL** (attribution + share-alike on
  a redistributed derived *database*). Wikipedia/DBpedia = **CC-BY-SA**.
  Wikidata = **CC0**. If we ever redistribute the DB, honor ODbL/CC-BY-SA.
- **Scraper hygiene:** obey robots.txt + Crawl-delay; identifiable User-Agent
  with contact URL; per-domain rate limits (~1 req / 1–2s, 5s for small sites);
  hard caching; crawl seasonally/weekly not continuously; back off on 429/403;
  honor any cease-and-desist immediately; log source + fetched_at per field.

---

## 10. Repo structure

```
searchski/
├── PLAN.md                     # this file
├── docker-compose.yml          # postgres+postgis, api, worker
├── pyproject.toml
├── db/
│   └── migrations/             # schema (§3)
├── searchski/
│   ├── seeders/                # openskimap.py, wikidata.py, dbpedia.py, osm_overpass.py
│   ├── enrichers/              # dbpedia_stats.py
│   ├── scrapers/               # (phase 2) skiresort_info.py, bergfex.py, official/
│   ├── providers/              # lodging/, conditions/, prices/  (§8 interfaces + impls)
│   ├── resolve/                # entity_resolution.py  (Wikidata Q-ID matching)
│   ├── stats/                  # geometry.py (length-from-geom), aggregate.py
│   ├── match/                  # scoring.py (deterministic), criteria.py
│   ├── api/                    # FastAPI app
│   └── config.py               # provider selection via env
├── scheduler/                  # prefect flows / cron: static, seasonal, dynamic
├── web/                        # Next.js + MapLibre frontend
└── tests/
```

---

## 11. Immediate next steps (start here)

1. Scaffold repo per §10; `docker-compose up` Postgres+PostGIS; apply schema §3.
2. Write `seeders/openskimap.py`: download the Alps subset, load runs/lifts/areas.
3. Write `stats/geometry.py`: compute run/lift length from geometry; aggregate
   `resort_stats`.
4. Write `seeders/wikidata.py` + `resolve/entity_resolution.py`: attach Q-IDs,
   coords, website; report match rate.
5. Produce the Phase 0 data-quality report and decide whether to proceed to
   Phase 1. (It should be a clear yes.)

Build Phase 0 end-to-end before writing any scraper or touching any paid API.
The open-data foundation is where the leverage is; everything else is
incremental enrichment on top of it.
