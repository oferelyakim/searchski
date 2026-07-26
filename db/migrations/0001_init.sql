-- Searchski initial schema. Target: Supabase (Postgres 15+ with PostGIS).
--
-- Run in the Supabase SQL editor, or:
--   psql "$DATABASE_URL" -f db/migrations/0001_init.sql
--
-- Design notes:
--  * ski_area.id is the OpenSkiMap id — TEXT, and the real primary key.
--    wikidata_qid is present on only ~7% of areas and is enrichment only.
--  * conditions_cache is keyed on ski_area_id ALONE and upserted. It is a
--    cache, not a log; an append-only table here would grow without bound.
--  * Everything curated carries a verification status and is never presented
--    as fact until a human sets it to 'verified'.

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE verification_status AS ENUM ('verified', 'unverified', 'stale');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE operating_status AS ENUM ('operating', 'disused', 'abandoned', 'proposed', 'unknown');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- Pass regions (hand-mapped commercial lift-pass areas)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pass_region (
  id            text PRIMARY KEY,
  name          text NOT NULL,
  country       text NOT NULL,
  marketed_km   numeric,
  official_url  text,
  source        text NOT NULL DEFAULT 'curated',
  verification  verification_status NOT NULL DEFAULT 'unverified',
  fetched_at    timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- The spine
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ski_area (
  id                  text PRIMARY KEY,            -- OpenSkiMap id
  name                text NOT NULL,
  country             text,
  region_code         text,
  region_name         text,
  localities          text[] NOT NULL DEFAULT '{}',
  location            geography(Point, 4326) NOT NULL,
  status              operating_status NOT NULL DEFAULT 'unknown',
  websites            text[] NOT NULL DEFAULT '{}',
  wikidata_qid        text,                        -- nullable, ~7% coverage

  base_elev_m         int,
  top_elev_m          int,
  vertical_m          int,

  runs_total          int  NOT NULL DEFAULT 0,
  km_total            numeric NOT NULL DEFAULT 0,
  runs_by_difficulty  jsonb NOT NULL DEFAULT '{}'::jsonb,
  terrain_mix         jsonb NOT NULL DEFAULT '{}'::jsonb,

  lifts_total         int NOT NULL DEFAULT 0,
  lifts_km_total      numeric NOT NULL DEFAULT 0,
  lifts_by_type       jsonb NOT NULL DEFAULT '{}'::jsonb,

  snowmaking_km       numeric NOT NULL DEFAULT 0,
  has_night_ski       boolean,                     -- NULL = unknown, not "no"
  night_ski_km        numeric,

  uphill_capacity_pph int NOT NULL DEFAULT 0,
  capacity_per_km     numeric,

  is_significant      boolean NOT NULL DEFAULT false,
  pass_region_id      text REFERENCES pass_region(id) ON DELETE SET NULL,

  source              text NOT NULL DEFAULT 'openskimap',
  fetched_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ski_area_location_idx    ON ski_area USING gist (location);
CREATE INDEX IF NOT EXISTS ski_area_country_idx     ON ski_area (country) WHERE is_significant;
CREATE INDEX IF NOT EXISTS ski_area_km_idx          ON ski_area (km_total DESC) WHERE is_significant;
CREATE INDEX IF NOT EXISTS ski_area_name_trgm_idx   ON ski_area USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS ski_area_pass_region_idx ON ski_area (pass_region_id);

-- Multilingual / alternate names. Critical: Gudauri ships as
-- "გუდაური, Gudauri, Гудаури" in one string upstream.
CREATE TABLE IF NOT EXISTS ski_area_alias (
  ski_area_id text NOT NULL REFERENCES ski_area(id) ON DELETE CASCADE,
  alias       text NOT NULL,
  script      text,
  PRIMARY KEY (ski_area_id, alias)
);
CREATE INDEX IF NOT EXISTS ski_area_alias_trgm_idx ON ski_area_alias USING gin (alias gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- Seasonal facts
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pass_price (
  id             bigserial PRIMARY KEY,
  pass_region_id text REFERENCES pass_region(id) ON DELETE CASCADE,
  ski_area_id    text REFERENCES ski_area(id) ON DELETE CASCADE,
  season         text NOT NULL,
  category       text NOT NULL CHECK (category IN ('adult','youth','child','senior')),
  duration       text NOT NULL CHECK (duration IN ('1day','3day','6day','season')),
  price          numeric NOT NULL,
  currency       text NOT NULL,
  is_dynamic     boolean NOT NULL DEFAULT false,
  source         text NOT NULL,
  source_url     text,
  verification   verification_status NOT NULL DEFAULT 'unverified',
  fetched_at     timestamptz NOT NULL DEFAULT now(),
  CHECK (pass_region_id IS NOT NULL OR ski_area_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS pass_price_lookup_idx ON pass_price (season, category, duration);

CREATE TABLE IF NOT EXISTS season_dates (
  ski_area_id text NOT NULL REFERENCES ski_area(id) ON DELETE CASCADE,
  season      text NOT NULL,
  opens_on    date,
  closes_on   date,
  source      text NOT NULL,
  source_url  text,
  verification verification_status NOT NULL DEFAULT 'unverified',
  fetched_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (ski_area_id, season)
);

-- ---------------------------------------------------------------------------
-- Live conditions cache. Upsert only — one row per area, never append.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS conditions_cache (
  ski_area_id text PRIMARY KEY REFERENCES ski_area(id) ON DELETE CASCADE,
  payload     jsonb NOT NULL,
  fetched_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS conditions_cache_expiry_idx ON conditions_cache (expires_at);

-- ---------------------------------------------------------------------------
-- Travel
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS airport (
  iata             text PRIMARY KEY,
  name             text NOT NULL,
  country          text NOT NULL,
  location         geography(Point, 4326) NOT NULL,
  direct_from_tlv  boolean NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS airport_transfer (
  airport_iata  text NOT NULL REFERENCES airport(iata) ON DELETE CASCADE,
  ski_area_id   text NOT NULL REFERENCES ski_area(id) ON DELETE CASCADE,
  drive_minutes int NOT NULL,
  distance_km   numeric NOT NULL,
  source        text NOT NULL,
  verification  verification_status NOT NULL DEFAULT 'unverified',
  PRIMARY KEY (airport_iata, ski_area_id)
);
CREATE INDEX IF NOT EXISTS airport_transfer_area_idx ON airport_transfer (ski_area_id, drive_minutes);

-- ---------------------------------------------------------------------------
-- Israel layer. Hand-curated. NOTHING here may be machine-generated.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS israel_profile (
  ski_area_id             text PRIMARY KEY REFERENCES ski_area(id) ON DELETE CASCADE,
  kosher_availability     smallint CHECK (kosher_availability BETWEEN 0 AND 3),
  kosher_notes            text,
  chabad_distance_km      numeric,
  chabad_name             text,
  hebrew_ski_school       boolean,
  hebrew_ski_school_notes text,
  shabbat_notes           text,
  apres_level             smallint CHECK (apres_level BETWEEN 0 AND 3),
  family_score            smallint CHECK (family_score BETWEEN 0 AND 3),
  israeli_gateway_airports text[] NOT NULL DEFAULT '{}',
  source_url              text,
  -- Defaults to unverified on purpose: a row is a claim until a human checks it.
  verification            verification_status NOT NULL DEFAULT 'unverified',
  curated_by              text,
  curated_at              timestamptz NOT NULL DEFAULT now()
);

-- Free OSM-derived nightlife proxy. Factual, always available, weaker signal
-- than the curated apres_level above.
CREATE TABLE IF NOT EXISTS apres_proxy (
  ski_area_id      text PRIMARY KEY REFERENCES ski_area(id) ON DELETE CASCADE,
  bar_count        int NOT NULL DEFAULT 0,
  restaurant_count int NOT NULL DEFAULT 0,
  nightclub_count  int NOT NULL DEFAULT 0,
  density_score    numeric NOT NULL DEFAULT 0,
  source           text NOT NULL DEFAULT 'openstreetmap',
  fetched_at       timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Trips (Stage 3). We record what the user plans; we never transact.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS trip (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid,
  name       text NOT NULL,
  date_from  date,
  date_to    date,
  party      jsonb NOT NULL DEFAULT '{}'::jsonb,
  budget     numeric,
  currency   text,
  status     text NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS trip_item (
  id       bigserial PRIMARY KEY,
  trip_id  uuid NOT NULL REFERENCES trip(id) ON DELETE CASCADE,
  kind     text NOT NULL CHECK (kind IN ('resort','flight','lodging','pass','school','transfer')),
  ref_id   text,
  payload  jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- We are never the merchant of record. See PLAN.md section 9.
  booked_externally boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS trip_item_trip_idx ON trip_item (trip_id);

-- ---------------------------------------------------------------------------
-- Row Level Security. Reference data is world-readable; trips are private.
-- ---------------------------------------------------------------------------
ALTER TABLE ski_area        ENABLE ROW LEVEL SECURITY;
ALTER TABLE ski_area_alias  ENABLE ROW LEVEL SECURITY;
ALTER TABLE pass_region     ENABLE ROW LEVEL SECURITY;
ALTER TABLE pass_price      ENABLE ROW LEVEL SECURITY;
ALTER TABLE season_dates    ENABLE ROW LEVEL SECURITY;
ALTER TABLE airport         ENABLE ROW LEVEL SECURITY;
ALTER TABLE airport_transfer ENABLE ROW LEVEL SECURITY;
ALTER TABLE israel_profile  ENABLE ROW LEVEL SECURITY;
ALTER TABLE apres_proxy     ENABLE ROW LEVEL SECURITY;
ALTER TABLE conditions_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE trip            ENABLE ROW LEVEL SECURITY;
ALTER TABLE trip_item       ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['ski_area','ski_area_alias','pass_region','pass_price',
                           'season_dates','airport','airport_transfer',
                           'israel_profile','apres_proxy','conditions_cache']
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON %I; CREATE POLICY %I ON %I FOR SELECT USING (true);',
      t || '_public_read', t, t || '_public_read', t
    );
  END LOOP;
END $$;

DROP POLICY IF EXISTS trip_owner ON trip;
CREATE POLICY trip_owner ON trip
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS trip_item_owner ON trip_item;
CREATE POLICY trip_item_owner ON trip_item
  FOR ALL USING (EXISTS (SELECT 1 FROM trip WHERE trip.id = trip_item.trip_id AND trip.user_id = auth.uid()));
