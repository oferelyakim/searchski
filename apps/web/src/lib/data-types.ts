/**
 * Shapes shared by the data layer and both of its sources.
 *
 * Lives in its own module so `data.ts` (the façade) and the source modules it
 * imports do not form an import cycle.
 */

import type {
  Airport,
  AirportTransfer,
  ApresProxy,
  IsraelProfile,
  PassPrice,
  PassRegion,
  SkiArea,
} from '@searchski/core/types';

export type DataSourceName = 'static' | 'supabase' | 'sample';

/** Raw lists as they come off a source, before indexing. */
export interface RawDataset {
  areas: SkiArea[];
  passRegions: PassRegion[];
  israelProfiles: IsraelProfile[];
  apres: ApresProxy[];
  airports: Airport[];
  transfers: AirportTransfer[];
  passPrices: PassPrice[];
  /** Human-readable notes about what was and was not found. */
  notes: string[];
}

export interface DatasetMeta {
  /** The source that actually served this data. */
  source: DataSourceName;
  /** The source that was requested via SEARCHSKI_DATA_SOURCE. */
  requestedSource: DataSourceName;
  /** True when the built-in sample rows are being served. */
  isSample: boolean;
  loadedAt: string;
  areaCount: number;
  countries: string[];
  notes: string[];
}

export function emptyRawDataset(): RawDataset {
  return {
    areas: [],
    passRegions: [],
    israelProfiles: [],
    apres: [],
    airports: [],
    transfers: [],
    passPrices: [],
    notes: [],
  };
}
