/**
 * Open-Meteo forecast provider.
 *
 * =========================== LICENCE WARNING ===============================
 * Open-Meteo's free tier requires NO API KEY, and it is NON-COMMERCIAL ONLY.
 *
 * The moment Searchski carries affiliate links or earns any revenue, this must
 * move to the paid Open-Meteo Standard tier (~$29/mo, api key + customer
 * endpoint `customer-api.open-meteo.com`). PLAN.md §10 budgets for it and
 * PLAN.md §12 flags the definition of "non-commercial" as unverified — assume
 * it is commercial and pay.
 *
 * The switch is `CONDITIONS_PROVIDER=openmeteo_paid` + `OPENMETEO_API_KEY`,
 * handled in `endpoint()` below.
 * ===========================================================================
 *
 * Weather is decoration on a planning tool, never the reason a page exists.
 * Every failure path here returns null and the page renders without it.
 */

const TTL_MS = 60 * 60 * 1000; // 1 hour
const FETCH_TIMEOUT_MS = 6000;

export interface DailyConditions {
  date: string;
  tempMaxC: number | null;
  tempMinC: number | null;
  snowfallCm: number | null;
  precipitationMm: number | null;
  weatherCode: number | null;
}

export interface Conditions {
  skiAreaId: string;
  lat: number;
  lon: number;
  fetchedAt: string;
  timezone: string | null;
  current: {
    tempC: number | null;
    windKph: number | null;
    snowfallCm: number | null;
    weatherCode: number | null;
  } | null;
  daily: DailyConditions[];
  /** Shown in the UI next to the forecast. Required by Open-Meteo's terms. */
  attribution: string;
  provider: 'openmeteo_free' | 'openmeteo_paid';
}

interface CacheEntry {
  at: number;
  value: Conditions | null;
}

// In-memory only. Survives within a warm serverless instance and no longer;
// that is the intent — conditions are never a system of record (PLAN.md §6).
const cache = new Map<string, CacheEntry>();

function isPaid(): boolean {
  return (
    (process.env['CONDITIONS_PROVIDER'] ?? 'openmeteo_free') === 'openmeteo_paid' &&
    Boolean(process.env['OPENMETEO_API_KEY'])
  );
}

function endpoint(lat: number, lon: number): string {
  const params = new URLSearchParams({
    latitude: lat.toFixed(4),
    longitude: lon.toFixed(4),
    current: 'temperature_2m,weather_code,wind_speed_10m,snowfall',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,snowfall_sum,precipitation_sum',
    timezone: 'auto',
    forecast_days: '7',
    wind_speed_unit: 'kmh',
  });

  if (isPaid()) {
    params.set('apikey', process.env['OPENMETEO_API_KEY'] ?? '');
    return `https://customer-api.open-meteo.com/v1/forecast?${params.toString()}`;
  }
  return `https://api.open-meteo.com/v1/forecast?${params.toString()}`;
}

function numOrNull(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function numArray(v: unknown): (number | null)[] {
  return Array.isArray(v) ? v.map(numOrNull) : [];
}

function parse(payload: unknown, skiAreaId: string, lat: number, lon: number): Conditions | null {
  const root = asRecord(payload);
  if (!root) return null;

  const currentRaw = asRecord(root['current']);
  const dailyRaw = asRecord(root['daily']);
  const times = Array.isArray(dailyRaw?.['time'])
    ? (dailyRaw['time'] as unknown[]).filter((t): t is string => typeof t === 'string')
    : [];

  const maxT = numArray(dailyRaw?.['temperature_2m_max']);
  const minT = numArray(dailyRaw?.['temperature_2m_min']);
  const snow = numArray(dailyRaw?.['snowfall_sum']);
  const precip = numArray(dailyRaw?.['precipitation_sum']);
  const codes = numArray(dailyRaw?.['weather_code']);

  const daily: DailyConditions[] = times.map((date, i) => ({
    date,
    tempMaxC: maxT[i] ?? null,
    tempMinC: minT[i] ?? null,
    snowfallCm: snow[i] ?? null,
    precipitationMm: precip[i] ?? null,
    weatherCode: codes[i] ?? null,
  }));

  if (daily.length === 0 && !currentRaw) return null;

  return {
    skiAreaId,
    lat,
    lon,
    fetchedAt: new Date().toISOString(),
    timezone: typeof root['timezone'] === 'string' ? root['timezone'] : null,
    current: currentRaw
      ? {
          tempC: numOrNull(currentRaw['temperature_2m']),
          windKph: numOrNull(currentRaw['wind_speed_10m']),
          snowfallCm: numOrNull(currentRaw['snowfall']),
          weatherCode: numOrNull(currentRaw['weather_code']),
        }
      : null,
    daily,
    attribution: 'Weather data by Open-Meteo.com (CC BY 4.0)',
    provider: isPaid() ? 'openmeteo_paid' : 'openmeteo_free',
  };
}

/**
 * Never throws. Returns null when the forecast is unavailable for any reason.
 * A null is cached too, briefly, so a hard-down upstream cannot be hammered.
 */
export async function getConditions(
  skiAreaId: string,
  lat: number,
  lon: number,
): Promise<{ conditions: Conditions | null; cached: boolean }> {
  const key = `${skiAreaId}:${lat.toFixed(3)}:${lon.toFixed(3)}`;
  const hit = cache.get(key);
  const now = Date.now();
  if (hit && now - hit.at < (hit.value === null ? 5 * 60 * 1000 : TTL_MS)) {
    return { conditions: hit.value, cached: true };
  }

  let value: Conditions | null = null;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(endpoint(lat, lon), {
        signal: controller.signal,
        headers: { accept: 'application/json' },
        // Next's own fetch cache on top of ours; harmless if unsupported.
        next: { revalidate: 3600 },
      });
      if (res.ok) {
        value = parse((await res.json()) as unknown, skiAreaId, lat, lon);
      } else {
        console.warn(`[searchski/conditions] Open-Meteo returned ${res.status} for ${skiAreaId}`);
      }
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    console.warn(
      `[searchski/conditions] forecast unavailable for ${skiAreaId}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  cache.set(key, { at: now, value });
  return { conditions: value, cached: false };
}

/** WMO weather interpretation codes, trimmed to what a skier cares about. */
export function weatherCodeLabel(code: number | null): string {
  if (code === null) return 'Unknown';
  if (code === 0) return 'Clear';
  if (code <= 2) return 'Partly cloudy';
  if (code === 3) return 'Overcast';
  if (code <= 48) return 'Fog';
  if (code <= 57) return 'Drizzle';
  if (code <= 67) return 'Rain';
  if (code <= 77) return 'Snow';
  if (code <= 82) return 'Showers';
  if (code <= 86) return 'Snow showers';
  return 'Thunderstorm';
}
