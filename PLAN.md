# Searchski - Build Plan (rev 2)

A ski-vacation decision engine for the Israeli market. Users describe what they
want ("uncrowded, good for a nervous intermediate, kosher food nearby, under
X per person") and get resort matches, ranked and explained, with links out to
book flights, lodging, and passes.

**Status:** greenfield, nothing built.
**Revision date:** 2026-07-26. All external sources re-verified on this date;
see Section 4 for status and Section 12 for what must be re-checked before it
becomes load-bearing.

---

## 0. What changed from rev 1, and why

Rev 1 was a good plan for building a ski-resort *database*. It was not a plan
for the product. Five things forced a rewrite:

1. **A well-funded incumbent is already doing exactly this, from Tel Aviv.**
   WeSki (WeTrip Ltd) - founded 2016, Tel Aviv + London, backed by easyJet and
   Uri Levine of Waze - shipped a conversational AI ski trip planner in March
   2026 that dynamically assembles flights + transfers + lodging + ski services
   across 300+ resorts, on roughly $100M trailing-12-month sales. Rev 1's
   Phase 3 endpoint is their shipped product. See Section 11.
2. **Selling assembled packages makes you a regulated tour operator.** Under the
   EU Package Travel Directive (2015/2302), whoever combines flight + lodging
   into one sale is the "organiser": strictly liable for the whole trip and
   legally required to hold insolvency protection (bonding/guarantee fund) in
   an EU country of establishment. That is not a solo-builder move. The plan now
   deliberately stops at referral. See Section 9.
3. **No self-serve flight API sells the routes Israelis actually fly.** Amadeus
   Self-Service was decommissioned 2026-07-17. Kiwi Tequila is invitation-only.
   Travelpayouts gates live flight search behind 50,000 MAU. And TLV ski routes
   run on Wizz, Israir, Arkia, and El Al - low-cost and Israeli carriers that
   are thin-to-absent in aggregator content anyway. Flights are a link-out.
4. **The country list was wrong for the audience.** Israeli ski destinations in
   early 2026 rank: Georgia (#1, +30% YoY), Bulgaria, France, Austria, Italy.
   Germany is irrelevant. Georgia was absent from rev 1 entirely.
5. **The only defensible data is the data nobody else will build.** Piste km and
   lift counts are commodity (skiresort.info has 6,109 resorts; where-to-ski.com
   has 675 with live pass prices). Kosher food, Hebrew-speaking ski school,
   Chabad proximity, Shabbat-workable lodging, and Israeli school-holiday
   alignment exist in no global dataset and never will. That is the moat.

---

## 1. Honest framing: three possible projects

Decide which one you are building before writing code. The architecture is the
same for all three; the scope, cost, and legal exposure are not.

| | A. Personal / friends | B. Niche affiliate site | C. Booking business |
|---|---|---|---|
| Users | you + ~20 people | Israeli skiers, organic | paying customers |
| Revenue | none | affiliate referral | margin on packages |
| Legal exposure | none | near-none (referral only) | EU organiser: strict liability + bonding |
| Weather API | Open-Meteo free tier OK | needs paid ($29/mo - free tier is non-commercial only) | paid |
| Running cost | ~0 | ~$50-150/mo | $$ + insurance + counsel |
| Competes with WeSki? | no | obliquely | head-on. Don't. |
| Verdict | **do this now** | **realistic ceiling** | only after B works |

This plan builds A, which is the same codebase as B minus the affiliate links
and the paid weather tier. It explicitly does **not** build C.

---

## 2. Architecture and stack

**Stack decision (revised 2026-07-26 after checking the actual machine).** The
dev box has Node 24 and git, but **no Python, no Docker, and no local
Postgres**. Combined with the stated hosting target (Supabase + Vercel), Python
and FastAPI are dropped. Everything is TypeScript.

| Concern | Choice | Why |
|---|---|---|
| Language | **TypeScript everywhere** | Node 24 is the only runtime present; one language across ETL, scoring, and web |
| DB | **Supabase Postgres + PostGIS** | managed, generous free tier, PostGIS available |
| Web + API | **Next.js 15 (App Router) on Vercel** | API routes replace FastAPI; one deployable |
| Scoring | pure TS in `packages/core` | shared by ETL and web, testable with no I/O |
| ETL | Node CLI in `packages/etl`, run locally or in GitHub Actions | monthly cadence; no server needed |
| Geo maths | **Turf.js** | PostGIS is not available at build time; Turf covers length/centroid/distance |
| Map | **MapLibre GL** | free basemap now; Cloudflare R2 + PMTiles only if self-hosted tiles are wanted later |

**Cloudflare is not needed to launch.** Vercel + Supabase is the whole stack.
R2 becomes useful only when self-hosting map tiles.

```
  Ingestion (offline, monthly)      Storage              Serving (Vercel)
  ---------------------------      -------              ----------------
  OpenSkiMap bulk GeoJSON  -.
  OSM Overpass             --+--> data/build/*.json --> Next.js App Router
  Wikidata SPARQL          -'     (committed)            /api/search
                            |            |               deterministic scorer
  Hand-curated Israel layer-'            v               (packages/core)
                                  Supabase Postgres            |
                                  + PostGIS (optional          v
                                   upgrade, same data)   MapLibre + resort pages
                                                               |
  Live, never stored:                                          v
  Open-Meteo, affiliate deep links --------------------> link-out only
```

**Two-mode data access.** The app reads `data/build/*.json` by default and
Supabase when `SEARCHSKI_DATA_SOURCE=supabase`. Three countries is a small
enough dataset to commit, so the site deploys to Vercel and works with **no
database at all**. Supabase becomes an upgrade for write features (trips,
curation admin), not a launch requirement.

Live data (weather, lodging prices, flight prices) is fetched at request time
or rendered as an outbound link. It is never the system of record.

---

## 3. Data model

Three changes from rev 1, all load-bearing.

**Change 1: OpenSkiMap ID is the spine, not Wikidata.** Wikidata Q-IDs do not
exist for a large share of ski areas, and coverage collapses outside the Alps -
exactly where this product goes (Gudauri, Bulgarian resorts). Wikidata becomes a
nullable enrichment join. A resort with no Q-ID must still be a first-class row.

**Change 2: three entity levels, not one.** These do not line up, and every one
of them is queried differently:

| Level | Example | Source | Carries |
|---|---|---|---|
| `ski_area` | Alta Badia, Val Gardena | OpenSkiMap geometry | pistes, lifts, km, vertical |
| `pass_region` | Dolomiti Superski (12 areas, one ticket) | hand-mapped | lift pass price, total km sold |
| `village` | Corvara, Bansko town, Gudauri | OSM place | lodging, apres, kosher, ski-in/out |

Your user searches "Dolomiti Superski." OpenSkiMap hands you 12+ polygons. The
pass price attaches to the region, the nightlife and hotels to the village, the
piste stats to the areas. Italy is the worst place to discover this late.

**Change 3: an Israel layer and a trip layer.**

```sql
-- Spine
ski_area(id, openskimap_id UNIQUE NOT NULL, wikidata_qid NULL, name, country,
         geom, centroid, base_elev_m, top_elev_m, vertical_m, website,
         is_significant bool)          -- size threshold; see Section 5
ski_area_alias(ski_area_id, name, lang) -- Groeden/Val Gardena/Selva, Cyrillic
pass_region(id, name, country, total_km, official_url)
pass_region_member(pass_region_id, ski_area_id)
village(id, name, country, geom, ski_area_id, base_lift_distance_m)

-- Derived, recomputed on refresh
area_stats(ski_area_id PK, runs_total, km_total, km_by_difficulty jsonb,
           lifts_total, lifts_by_type jsonb, km_lit, has_night_ski,
           snowmaking_km, uphill_capacity_pph, crowding_index,
           mean_aspect_deg, sun_score, computed_at)

-- Facts with provenance
pass_price(pass_region_id, season, category, duration, price, currency,
           is_dynamic, source, source_url, fetched_at)
season_dates(ski_area_id, season, opens_on, closes_on, source, fetched_at)

-- Live, short TTL. PK is resort_id alone - upsert, do not append.
conditions_cache(ski_area_id PK, payload jsonb, fetched_at, expires_at)

-- Travel
airport(iata, name, country, geom)
airport_transfer(airport_iata, village_id, drive_minutes, typical_cost, source)

-- The Israel layer: hand-curated, ~100 rows, highest value per hour of work
il_village_profile(village_id PK, kosher_options text[], chabad_distance_km,
                   hebrew_ski_school bool, shabbat_notes text,
                   apres_level int,      -- 0-3, curated
                   family_score int, party_score int,
                   israeli_charter_airport text, curated_at, curated_by)

-- Trips (Phase 3+)
trip(id, user_id, name, date_from, date_to, party jsonb, budget, status)
trip_item(trip_id, kind, ref_id, payload jsonb, booked_externally bool)
```

Note `run` and `lift` tables carry over from rev 1 unchanged, but now reference
`ski_area_id`. `run.lit` aggregates into `area_stats.has_night_ski` - that is
your night-skiing answer, free, from OSM.

---

## 4. Sources - verified 2026-07-26

### Confirmed working

| Source | Gives | Status as of 2026-07-26 | Cost |
|---|---|---|---|
| **OpenSkiMap** | 6,983 downhill ski areas / 70 countries / 96,184 runs, as daily GeoJSON + GeoPackage | live, daily refresh | free (ODbL) |
| **OpenSkiStats** | derived per-area metrics incl. slope orientation | live | free |
| **Wikidata SPARQL** | Q-IDs, coords, websites, cross-IDs | live | free (CC0) |
| **OSM / Overpass** | `lit=yes`, `piste:snowmaking`, bars/nightclubs near base | live | free (ODbL) |
| **Open-Meteo** | forecast + historical archive | live. 10k calls/day | **free tier is NON-COMMERCIAL. $29/mo Standard for commercial use.** |
| **LiteAPI (Nuitee)** | live hotel search + booking | live, self-serve, core endpoints free | free to integrate; requires funded wallet + card to book |
| **Travelpayouts** | affiliate links, flights + hotels, cached fare data | live, free signup | free; **live flight search API gated at 50,000 MAU** |
| **Tripadvisor Content API** | ratings, amenities | live, 5,000 calls/mo free | requires credit card + daily budget cap |
| **Duffel** | real flight booking | live, self-serve, public pricing | $3/confirmed order + 1% managed content; **search fee kicks in past a 1,500:1 search-to-book ratio** |

### Dead or unobtainable - do not plan around these

| Source | Status |
|---|---|
| **Amadeus Self-Service** | **decommissioned 2026-07-17.** Keys disabled, portal gone. Enterprise/AQC only. |
| **Kiwi.com Tequila** | new partners **invitation-only**. Not obtainable. |
| **Skyscanner API** | partner-gated, commercial agreement required. Not self-serve. |
| **Booking.com Demand API** | volume-gated, long onboarding. |
| **Airbnb** | no public API, affiliate program dead since 2021. |

### The flight problem, stated plainly

Duffel is the only self-serve flight API left, and two things make it a poor fit
here: a browse-heavy planner will blow straight through the 1,500:1
search-to-book ratio into per-search fees, and low-cost/Israeli carriers (Wizz,
Israir, Arkia) - which are most of the TLV ski market - are weak or absent in
aggregator content regardless.

**Decision: flights are a deep link, not an API.** Link out to Skyscanner /
Google Flights / Kayak with route + dates prefilled, via Travelpayouts affiliate
where available. Store airports and drive-time transfers ourselves; that is the
part actually worth owning, and nobody else models it well.

---

## 5. Deriving the qualities people actually search on

Rev 1's own headline example - "sunny, uncrowded, nervous intermediate,
ski-in/ski-out, pass under X" - was answerable by roughly one and a half fields
in its schema. All five are derivable, most for free:

| Query term | How | Cost |
|---|---|---|
| night skiing | OSM `lit=yes` on pistes -> `has_night_ski` | free |
| sunny | slope aspect from geometry + DEM (OpenSkiStats method) + Open-Meteo historical cloud cover | free |
| uncrowded | modeled uphill capacity (lift type x standard pph) / piste km. **Two opposed readings — see note below.** | free |
| snow-reliable | altitude + vertical + aspect. Beats any live snow API for a decision made in October. **Not snowmaking — see note below.** | free |
| nervous intermediate | km_easy + km_intermediate share, plus "no scary way home" (blue route from top) | free |
| ski-in/ski-out | PostGIS distance from lodging to nearest lift base | free |
| apres / party | OSM bar+pub+nightclub density near base as a proxy, **overridden by hand-curated `apres_level`** | free |
| kosher / Hebrew / Chabad | hand-curated, ~100 villages | ~1-2 days of work |

**Size threshold (`is_significant`):** OpenSkiMap's 6,983 areas include a great
many one-drag-lift village hills. Without a filter (suggested: >= 5km pistes or
>= 3 lifts, tuned per country) search results are noise. Set it in Phase 0.
Measured in Stage 0: this keeps 179 of 346 areas across GE/BG/IT.

### Two corrections from building Stage 0

Both of these were wrong in this plan before the data was loaded. They are
recorded rather than quietly edited, because the reasoning matters more than
the conclusion.

**1. Snowmaking coverage is not a usable signal.** This plan proposed building
snow reliability partly on OSM `piste:snowmaking`. Measured against the real
dump: **772 of 108,612 downhill runs worldwide carry the tag (0.7%), and three
runs in total across Georgia, Bulgaria and Italy.** `snowmakingKm = 0` therefore
means "nobody tagged it" essentially everywhere, including 309 of 310 Italian
resorts. Treating a zero as "no snowmaking" would penalise almost the entire
roster on a fact never established. Rule: a positive value is evidence, a zero
is always unknown, in every country. Altitude and vertical carry the factor.

**2. "Uncrowded" is two opposite questions.** Modeled uphill capacity per piste
km is the ski industry's skier-density metric, and it points both ways at once:

| The user asks | Wants | Because |
|---|---|---|
| "no lift queues" | **high** capacity per km | more uphill throughput = shorter waits |
| "uncrowded slopes" | **low** capacity per km | fewer people delivered onto the same piste |

Answering both with one factor ranked Alta Badia — the busiest region in the
Dolomites — first for "uncrowded slopes". They are now separate criteria with
opposed signs. Note this is a *model*, not a measurement: we have no visitor
or bed-count data, and the UI must not imply otherwise.

---

## 6. Freshness tiers

| Tier | Data | Cadence |
|---|---|---|
| Static | geometry, runs, lifts, stats, aspect | monthly re-pull of OpenSkiMap |
| Curated | Israel layer, apres, pass_region mapping | manual, reviewed pre-season |
| Seasonal | pass prices, opening dates | annually in autumn + spot checks |
| Live | weather, lodging quotes, flight links | request-time, short TTL, never stored |

---

## 7. Phases

### Phase 0 - Data spine, three countries (days)
**Countries: Georgia, Bulgaria, Italy.** Chosen for the Israeli market's actual
top destinations *and* because they stress-test the pipeline in three different
ways: Georgia (sparse OSM, Cyrillic/Georgian script, weak Wikidata), Bulgaria
(tiny, simple, cheap to verify by hand), Italy (dense, and the nastiest
pass-region hierarchy in Europe). Austria and France are deliberately excluded -
they are the easy case and would give false confidence.

- [ ] Repo scaffold, Docker Compose (Postgres 16 + PostGIS), schema from Section 3.
- [ ] Load OpenSkiMap ski_areas / runs / lifts for GE, BG, IT.
- [ ] Compute `area_stats`: length from geometry with elevation correction, km by
      difficulty, lift counts, `km_lit`, snowmaking, uphill capacity, aspect.
- [ ] Set and tune `is_significant`.
- [ ] Wikidata SPARQL join; **report match rate per country** - expect it to be
      poor for Georgia. That is information, not failure.
- [ ] Hand-map `pass_region` for Italy (Dolomiti Superski, Via Lattea, Milky Way)
      and Bulgaria. ~20 rows, an afternoon.
- [ ] Data-quality report: coverage %, match rate, missing fields, per country.

**Gate:** are Gudauri and Bansko represented well enough to be useful? If
Georgian OSM coverage is too thin, decide then whether to hand-enter it (it is
one resort) or drop Georgia.

### Phase 1 - Search that works (weeks)
- [ ] Deterministic weighted scorer over structured criteria. No LLM in ranking.
- [ ] **Golden query set: 20 hand-written queries with expected top-5, scored on
      every weight change.** The entire product value is ranking quality; without
      this you are guessing. Write it before the scorer.
- [ ] Open-Meteo conditions behind a provider interface.
- [ ] FastAPI: `/search`, `/resorts/{id}`, `/regions/{id}`.
- [ ] Next.js + MapLibre on own OSM-derived tiles. Link out to official maps.
- [ ] Monthly static refresh job (cron is fine; Prefect is premature).

**Acceptance:** "intermediate-friendly, cheap, good nightlife, under 4h from
Sofia airport" returns Bansko above Cortina, and you can see why.

### Phase 2 - The Israel layer (this is the actual product)
- [ ] Curate `il_village_profile` for the top ~100 villages across GE/BG/IT/AT/FR.
- [ ] Israeli school-holiday calendar (Hanukkah, Passover, winter break) as a
      first-class date filter - crowding and price both spike.
- [ ] `airport` + `airport_transfer` with real drive times from TLV-reachable
      airports (SOF, TBS, KUT, VCE, TRN, MXP).
- [ ] Affiliate link-out: flights (Travelpayouts/Skyscanner), lodging (LiteAPI or
      Travelpayouts), passes/school (direct or CheckYeti).
- [ ] Pass prices for the top ~50 regions. Start by hand; scrape only if the
      manual load becomes real. Facts only, robots.txt respected. (Section 9)

**Acceptance:** a friend planning Hanukkah in Bansko gets resort + village +
transfer time + kosher options + three booking links, and it beats what Issta
would have sold them.

### Phase 3 - Natural language and trips
- [ ] Claude API with structured output: free text -> criteria JSON -> existing
      deterministic scorer. The LLM parses and explains; it never ranks.
- [ ] `trip` / `trip_item`: shortlist, share with the group, track what is booked.
      Booking still happens on partner sites; we record, we do not transact.
- [ ] Optional paid upgrades drop in behind existing interfaces: paid Open-Meteo
      tier, snow API, RateHawk for apartment depth.

### Phase 4 - Only if Phase 2 shows real demand
Becoming the merchant of record (true packaging) means EU organiser status:
strict liability, insolvency bonding, insurance, counsel. Do not start this
without evidence that people are clicking through and booking.

---

## 8. Provider interfaces (build in Phase 1)

Unchanged in spirit from rev 1, corrected for what actually exists.

```python
class ConditionsProvider(Protocol):     # openmeteo_free | openmeteo_paid | snowapi
    def get(self, area_id: int) -> Conditions: ...

class LodgingProvider(Protocol):        # liteapi | travelpayouts_link | ratehawk
    def search(self, lat, lon, radius_km, check_in, check_out, guests) -> list[Offer]: ...

class FlightLinkProvider(Protocol):     # deep link only - NOT a booking API
    def link(self, origin_iata, dest_iata, depart, ret, pax) -> str: ...

class PassPriceProvider(Protocol):      # manual | scraper | feed
    def get(self, pass_region_id: int, season: str) -> list[PassPrice]: ...
```

Selected by env var. Adding a paid tier = one class + one env change.

---

## 9. Legal - corrected for a European product sold to Israelis

Rev 1 leaned on US case law (Feist, Van Buren, hiQ). Those do not protect you in
the EU. What actually governs:

- **EU Package Travel Directive 2015/2302.** Combining flight + lodging into one
  sale makes you the **organiser**: strictly liable for performance of the whole
  package, and legally obliged to hold insolvency protection in your EU country
  of establishment. Applies to non-EU traders selling to EU travellers too.
  A 2026 revision adds a 60-day complaint-response duty and 6-month refund
  window. **Referral links avoid this entirely; "linked travel arrangements"
  do not.** This is the single biggest reason Phase 4 is gated.
- **Database Directive sui generis right.** Do not mirror any one site's catalog
  wholesale. Merge sources, re-verify, re-present in our own structure.
- **Ryanair v PR Aviation (CJEU).** A site's T&Cs can contractually restrict
  scraping even where copyright does not. Never create an account on a site you
  scrape - that forms the contract.
- **GDPR.** No named instructors, review authors, or staff. Drop any field
  carrying a person's name, even from public pages.
- **Licensing.** OSM/OpenSkiMap = ODbL (attribution + share-alike on a
  redistributed derived database - relevant the moment you expose bulk data via
  your own API). Wikipedia/DBpedia = CC-BY-SA. Wikidata = CC0.
- **Facts vs expression.** Ingest prices, dates, counts, elevations. Never copy
  trail-map images, photos, or editorial prose. Render our own maps; link out.
- **Scraper hygiene.** robots.txt + crawl-delay, identifiable UA with contact,
  ~1 req/1-2s per domain, hard caching, seasonal not continuous, back off on
  429/403, honor any takedown immediately, log source + fetched_at per field.

Not legal advice. Before Phase 4, get counsel.

---

## 10. Real cost floor

Rev 1 claimed "zero paid services." That is true only for personal use.

| Item | Personal (A) | Affiliate site (B) |
|---|---|---|
| Postgres + PostGIS | local Docker, $0 | ~$20-40/mo VPS |
| Open-Meteo | free (non-commercial) | **$29/mo** (commercial licence required) |
| Map tiles | self-hosted, $0 | ~$0-20/mo |
| Claude API (Phase 3) | a few $/mo | $10-50/mo |
| Scraping proxies (only if Phase 2 scraping is needed) | $0 | $50-200/mo |
| **Total** | **~$0-10/mo** | **~$60-150/mo, up to $350 with scraping** |

---

## 11. Competitive picture (researched 2026-07-26)

**Direct, and formidable: WeSki** - Tel Aviv + London, founded 2016 by Yotam
Idan et al., backed by easyJet and Uri Levine (Waze). Conversational AI trip
planner launched March 2026; dynamically assembles flights, transfers, lodging
and ski services across 300+ resorts. Reported ~$100M trailing-12-month sales
and $1M in a single day in January 2026. They already cover Gudauri. An airline
investor gives them flight content you cannot buy at any price.

**Decision-layer incumbents** (commodity data, weak personalization):
skiresort.info (6,109 resorts, daily snow reports, pass-price comparison),
where-to-ski.com (675 resorts, 41 countries, live pass prices + snow),
OnTheSnow, ZRankings, Powderhounds, Skibookers (AI matching by "style and
mood").

**Package operators:** Crystal Ski (TUI, 150 resorts), Inghams, Iglu Ski (50+
operators aggregated), Snowtrex (500 resorts, 2,500 properties), Sunweb, Heidi.

**In Israel:** Issta (60+ branches, sells ski packages) and Eshet Tours (#2 by
sales, sells dynamic packages and ski). Traditional, offline-leaning, and by
WeSki's own claim about 20% more expensive than self-assembly.

**Market:** roughly 50,000 Israelis ski in Europe each winter; 16%+ of Israeli
travellers chose a ski trip in January 2026, up ~40% on January 2023. Top
destinations early 2026: Georgia (+30% YoY), Bulgaria, France, Austria, Italy.

**Read:** the market is real and growing, and it is not empty. Head-on
competition with WeSki on packaging is unwinnable for a solo builder - they have
capital, an airline, and a four-year head start. The uncontested ground is the
Israel-specific decision layer: kosher, Hebrew, Chabad, Shabbat, chag dates,
transfer times from TLV-reachable airports. No global player will ever build it,
and it is exactly the kind of data one person can curate by hand.

---

## 12. Assumptions still to verify before relying on them

Everything in Section 4 was checked on 2026-07-26. These were not, and each one
would change a decision if wrong:

- [x] ~~OpenSkiMap's actual coverage quality for Georgia and Bulgaria~~ —
      **measured in Stage 0. Both usable.** Georgia 11 areas / 7 significant,
      Bulgaria 25 / 5. Gudauri, Bansko, Borovets and Pamporovo all carry piste km,
      lift counts, elevations and a full difficulty breakdown. Wikidata match rate
      is 1.6% across the three countries (0% in Georgia), which is why the spine
      is the OpenSkiMap id. **But see the piste-undercount limitation below.**
- [ ] **Georgian piste coverage is undercounted, and it biases one factor.**
      OSM maps Gudauri at 40.5 km against a marketed figure roughly double that,
      because much of its terrain is off-piste and ungroomed. Piste km is the
      denominator of the crowding model, so an undercount inflates modelled
      skier density and makes Georgian resorts look busier than they ski. The
      direction of the error is known; the magnitude is not. Do not "correct" it
      with a fudge factor — either import marketed piste km as a separate,
      clearly-labelled field, or leave the model honest and say so in the UI.
- [ ] **Border resorts need their country resolved from geometry, not from the
      first `places` entry.** 5 of 346 areas touch more than one country, and
      upstream sometimes emits internally contradictory entries (Kaunertaler
      Gletscher carries `IT` paired with the Tyrolean subdivision `AT-7`, and was
      being served as Italian). Handled by carrying a `countries[]` array, but
      the primary-country choice is still a heuristic.
- [ ] Travelpayouts' Israel-market affiliate terms and whether TLV-origin routes
      are covered in their cached fare data.
- [ ] Whether LiteAPI inventory is meaningful in Bansko and Gudauri (both are
      apartment-heavy markets that wholesalers under-serve).
- [ ] Bulgaria's euro adoption status and its effect on displayed BGN/EUR pricing.
- [ ] Israeli regulatory position on affiliate referral vs. selling travel -
      Tourism Services Law and its successor bill. Referral is very likely fine;
      confirm before taking money.
- [ ] Open-Meteo's exact definition of "non-commercial" for an affiliate-funded
      site. Assume it is commercial and budget the $29/mo.
- [ ] Whether Duffel's search-fee ratio can be avoided by only calling it on
      explicit user intent - moot while flights stay link-out.

---

## 13. Start here

1. Scaffold the repo, `docker compose up` Postgres+PostGIS, apply Section 3 schema.
2. Load OpenSkiMap for Georgia, Bulgaria, Italy. Look at the data before writing
   another line of plan.
3. Compute `area_stats`; tune `is_significant`; see how many real resorts remain.
4. Hand-map `pass_region` for Italy and Bulgaria.
5. Produce the Phase 0 data-quality report - especially the Georgia verdict.
6. Write the 20 golden queries before writing the scorer.

Build Phase 0 end to end before touching any API, scraper, or affiliate account.
```
