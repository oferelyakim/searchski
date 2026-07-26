-- Searchski migration 0003: ski_area.countries
--
-- Run in the Supabase SQL editor, or:
--   psql "$DATABASE_URL" -f db/migrations/0003_countries.sql
--
-- WHY
-- `country` holds ONE ISO 3166-1 alpha-2 code, but a border resort genuinely
-- belongs to both sides. Drei Zinnen straddles the Italian/Austrian border and
-- La Thuile is lift-linked to La Rosière in France. Collapsing those to a
-- single code is lossy: a skier flying into Innsbruck cannot find Drei Zinnen
-- by filtering on Austria.
--
-- `countries` holds every distinct country the area touches, PRIMARY FIRST, so
-- countries[1] always equals `country`. Filters should match on ANY element;
-- display uses `country`.
--
-- This also hardens against upstream noise. OpenSkiMap's `places` array can
-- contain internally contradictory entries — Kaunertaler Gletscher, an Austrian
-- glacier in Tyrol, carries an entry whose alpha-2 says Italy while its
-- subdivision is AT-7 (Tyrol). The ETL discards entries where alpha-2
-- contradicts the subdivision prefix before choosing a country at all.

ALTER TABLE ski_area
  ADD COLUMN IF NOT EXISTS countries text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN ski_area.countries IS
  'Every ISO 3166-1 alpha-2 country the area touches, primary first (countries[1] = country). '
  'Border resorts belong to both sides; country filters should match ANY element. '
  'Populated by packages/etl/src/normalize.ts.';

-- Backfill existing rows so the invariant countries[1] = country holds even
-- before the next ETL run.
--
-- The `country IS NOT NULL` guard is load-bearing, not decorative. ski_area.country
-- is nullable (an area upstream gave no place at all), and ARRAY[NULL] would
-- produce a one-element array whose element is NULL. That does NOT violate the
-- column's NOT NULL — that constrains the array, not its elements — so it would
-- pass silently and then read back as a country named "nothing". Rows with a
-- NULL country correctly keep the '{}' default: no countries known.
--
-- coalesce() covers the case where the column already existed and held NULL,
-- since cardinality(NULL) is NULL, not 0.
UPDATE ski_area
   SET countries = ARRAY[country]
 WHERE country IS NOT NULL
   AND coalesce(cardinality(countries), 0) = 0;

-- On a fresh database this UPDATE simply matches zero rows: 0001 creates the
-- table empty, so there is nothing to backfill and the statement is a no-op.

-- Membership lookups are the whole point of the column.
CREATE INDEX IF NOT EXISTS ski_area_countries_idx
  ON ski_area USING gin (countries);
