-- Searchski migration 0002: ski_area.boundary_note
--
-- Run in the Supabase SQL editor, or:
--   psql "$DATABASE_URL" -f db/migrations/0002_boundary_note.sql
--
-- WHY
-- OpenSkiMap clusters runs and lifts into ski areas geometrically. Where two
-- separately-marketed resorts share lift-linked terrain it emits ONE record
-- under ONE name, and that record's piste km then describes more than its name
-- does.
--
-- Verified case (Stage 0 QA, 2026-07-26): OpenSkiMap id
-- 01ebf9136b08663b151ea8896e3ba66547ea5482 is named "Alta Badia" and reports
-- 252.8 km, but its own `places` localities include Santa Cristina, Sëlva and
-- Urtijëi — the three villages of Val Gardena. Two marketed resorts, one row.
--
-- We do NOT split the geometry or apportion the km: there is no faithful basis
-- for that split, and a guessed piste figure presented as fact is the exact
-- failure mode this schema's provenance rules exist to prevent. Instead the row
-- carries an honest note, and the UI must render it wherever km_total appears.
--
-- NULL is the overwhelmingly common case and means "no known merge", which is
-- distinct from "we checked and it is clean" — nobody has checked most rows.

ALTER TABLE ski_area
  ADD COLUMN IF NOT EXISTS boundary_note text;

COMMENT ON COLUMN ski_area.boundary_note IS
  'Set when upstream merged two separately-marketed resorts into this record, so '
  'km_total covers more than the name implies. The UI MUST display this wherever '
  'km_total is shown. NULL = no known merge. Seeded from data/seed/area_overrides.json.';
