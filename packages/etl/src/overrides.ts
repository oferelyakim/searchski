/**
 * Hand-curated corrections for upstream OpenSkiMap clustering artifacts.
 *
 * Reads data/seed/area_overrides.json — see that file's `_comment` block for
 * the reasoning. In short: OpenSkiMap clusters geometrically, so two
 * separately-marketed resorts that share lift-linked terrain become ONE record
 * under ONE name. The other resort is then unsearchable and the surviving
 * record's km describes something bigger than its name.
 *
 * This module does exactly two things about that:
 *   1. adds ALIASES so the record is findable under either marketed name;
 *   2. attaches a BOUNDARY NOTE the UI must show next to the km total.
 *
 * It explicitly does NOT split geometry or apportion km between the merged
 * resorts. There is no faithful basis for such a split, and a guessed piste
 * figure is precisely the fabrication this project refuses to ship.
 *
 * Matching is by `openskimapId` when present (stable), else by exact
 * `upstreamName`. Overrides that match nothing are REPORTED, never silently
 * dropped — an unmatched override means the id changed, the name changed, or
 * the area left the dump, and all three need a human.
 */

import { promises as fsp } from 'node:fs';
import path from 'node:path';
import type { SkiArea } from '@searchski/core/types';
import { REPO_ROOT } from './config.ts';

export interface AreaOverride {
  openskimapId: string | null;
  upstreamName: string;
  addAliases: string[];
  boundaryNote: string | null;
  source?: string;
  verification?: string;
  mergedMarketedAreas?: string[];
}

/**
 * An externally-verified correction to the country a resort belongs to.
 *
 * This exists because the frequency/tie-break rule in normalize.ts CANNOT settle
 * every case. Kaunertaler Gletscher is attested exactly once as IT and once as
 * AT, so the tie-break decides it on which region code upstream happens to state
 * first — a coin flip. No heuristic over that data can do better; only an
 * external fact can. Hence: a human checks a primary source, records the
 * evidence and the URL, and that beats the heuristic.
 *
 * These are `verification: 'verified'` claims backed by `evidence` + `sourceUrl`,
 * NOT guesses. Anything unverifiable belongs nowhere near this block.
 */
export interface CountryOverride {
  openskimapId: string | null;
  upstreamName: string;
  /** ISO 3166-1 alpha-2 that becomes the PRIMARY country. */
  forceCountry: string;
  /** Optional: replaces the whole derived array. Primary is forced first. */
  forceCountries?: string[] | null;
  evidence?: string;
  sourceUrl?: string | null;
  checkedOn?: string;
  verification?: string;
  effect?: string;
}

interface OverridesFile {
  verification?: string;
  seededAt?: string;
  overrides?: AreaOverride[];
  countryOverrides?: CountryOverride[];
}

export interface AppliedOverride {
  areaId: string;
  areaName: string;
  matchedBy: 'openskimapId' | 'upstreamName';
  aliasesAdded: number;
  boundaryNoteSet: boolean;
}

export interface OverrideDiagnostics {
  /** False when the seed file is absent — not an error, just nothing to apply. */
  fileFound: boolean;
  filePath: string;
  applied: AppliedOverride[];
  /** Overrides whose target is not in the dump. FIX THESE BY HAND. */
  unmatched: Array<{ upstreamName: string; openskimapId: string | null }>;
  /** Aliases added from `places[].localized.en.locality`, across all areas. */
  localityAliasesAdded: number;
  /** Areas that gained at least one locality-derived alias. */
  areasWithLocalityAliases: number;
  /** Areas carrying a boundaryNote after this stage. */
  areasWithBoundaryNote: number;
}

export const OVERRIDES_PATH = path.join(REPO_ROOT, 'data', 'seed', 'area_overrides.json');

async function readOverridesFile(): Promise<{ file: OverridesFile; found: boolean }> {
  try {
    const raw = await fsp.readFile(OVERRIDES_PATH, 'utf8');
    return { file: JSON.parse(raw) as OverridesFile, found: true };
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') return { file: {}, found: false };
    throw new Error(`data/seed/area_overrides.json is unreadable: ${(err as Error).message}`);
  }
}

export async function readOverrides(): Promise<{ overrides: AreaOverride[]; found: boolean }> {
  const { file, found } = await readOverridesFile();
  return { overrides: file.overrides ?? [], found };
}

/**
 * Country overrides, normalized to upper-case ISO codes.
 *
 * Read separately from the alias overrides because they are applied at a
 * different point in the pipeline: alias overrides run AFTER normalize, but a
 * country override must run INSIDE normalize, before the target-country filter.
 * Otherwise forcing an area to AT could not remove it from a GE/BG/IT build —
 * which is the entire point of the Kaunertaler entry.
 */
export async function readCountryOverrides(): Promise<{
  countryOverrides: CountryOverride[];
  found: boolean;
}> {
  const { file, found } = await readOverridesFile();
  const countryOverrides = (file.countryOverrides ?? []).map((o) => ({
    ...o,
    forceCountry: o.forceCountry.toUpperCase(),
    forceCountries: o.forceCountries?.map((c) => c.toUpperCase()) ?? null,
  }));
  return { countryOverrides, found };
}

/** Case-insensitive push that never duplicates an existing alias. */
function addAlias(area: SkiArea, alias: string): boolean {
  const trimmed = alias.trim();
  if (trimmed.length === 0) return false;
  const key = trimmed.toLocaleLowerCase();
  if (area.name.toLocaleLowerCase() === key) return false;
  if (area.aliases.some((a) => a.toLocaleLowerCase() === key)) return false;
  area.aliases.push(trimmed);
  return true;
}

/**
 * Add every locality an area touches as a search alias.
 *
 * This is free and factual — it is upstream's own `places[].localized.en.locality`
 * — and it is what would have surfaced the Alta Badia / Val Gardena merge on its
 * own, because that record lists Sëlva and Urtijëi among its localities. It also
 * fixes the common case of a user searching the VILLAGE ("Corvara", "Selva")
 * rather than the ski-area name.
 *
 * Localities are aliases, not names: the display name stays whatever upstream
 * called the area.
 */
export function applyLocalityAliases(areas: SkiArea[]): { added: number; areas: number } {
  let added = 0;
  let touched = 0;
  for (const area of areas) {
    let any = false;
    for (const locality of area.localities) {
      if (addAlias(area, locality)) {
        added++;
        any = true;
      }
    }
    if (any) touched++;
  }
  return { added, areas: touched };
}

/**
 * Apply locality-derived aliases and the curated overrides, in place.
 * Locality aliases go first so a curated alias that merely repeats a locality
 * is deduped rather than counted twice.
 */
export async function applyOverrides(areas: SkiArea[]): Promise<OverrideDiagnostics> {
  const locality = applyLocalityAliases(areas);
  const { overrides, found } = await readOverrides();

  const diagnostics: OverrideDiagnostics = {
    fileFound: found,
    filePath: OVERRIDES_PATH,
    applied: [],
    unmatched: [],
    localityAliasesAdded: locality.added,
    areasWithLocalityAliases: locality.areas,
    areasWithBoundaryNote: 0,
  };

  if (!found) {
    console.warn('[overrides] data/seed/area_overrides.json not found — no curated overrides applied.');
  }

  const byId = new Map(areas.map((a) => [a.id, a]));

  for (const override of overrides) {
    let target: SkiArea | undefined;
    let matchedBy: 'openskimapId' | 'upstreamName' = 'openskimapId';

    if (override.openskimapId) {
      target = byId.get(override.openskimapId);
    }
    if (!target) {
      // Exact name match, as specified. Not fuzzy: an override silently landing
      // on the wrong resort is worse than one that fails loudly.
      matchedBy = 'upstreamName';
      target = areas.find((a) => a.name === override.upstreamName);
    }

    if (!target) {
      diagnostics.unmatched.push({
        upstreamName: override.upstreamName,
        openskimapId: override.openskimapId,
      });
      console.warn(
        `[overrides] no area matched override "${override.upstreamName}"` +
          `${override.openskimapId ? ` (id ${override.openskimapId})` : ''} — skipped.`,
      );
      continue;
    }

    let aliasesAdded = 0;
    for (const alias of override.addAliases ?? []) {
      if (addAlias(target, alias)) aliasesAdded++;
    }

    let boundaryNoteSet = false;
    if (override.boundaryNote) {
      target.boundaryNote = override.boundaryNote;
      boundaryNoteSet = true;
    }

    diagnostics.applied.push({
      areaId: target.id,
      areaName: target.name,
      matchedBy,
      aliasesAdded,
      boundaryNoteSet,
    });
  }

  // Normalize the field across every area so the JSON artifact is uniform:
  // explicit null rather than an absent key.
  for (const area of areas) {
    if (area.boundaryNote === undefined) area.boundaryNote = null;
    if (area.boundaryNote !== null) diagnostics.areasWithBoundaryNote++;
  }

  return diagnostics;
}
