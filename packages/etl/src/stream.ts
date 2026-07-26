/**
 * Streaming reader for the OpenSkiMap GeoJSON dumps.
 *
 * WHY THIS EXISTS: runs.geojson decompresses to roughly 0.9-1.0 GB. Calling
 * JSON.parse on it is not an option — it exceeds V8's max string length long
 * before it exceeds RAM. Fortunately the dumps are emitted in a
 * newline-delimited layout:
 *
 *   {"type": "FeatureCollection", "features":[
 *   {"type":"Feature", ...}
 *   ,
 *   {"type":"Feature", ...}
 *   ]}
 *
 * i.e. exactly one complete feature per line, with bare "," separator lines.
 * So we read line by line and JSON.parse each feature independently, and peak
 * memory is one feature, not one file. This layout was verified on 2026-07-26
 * for ski_areas.geojson and runs.geojson.
 *
 * If upstream ever switches to pretty-printed JSON this reader degrades safely:
 * it yields nothing and `parsedCount` stays 0, which callers treat as "data
 * unavailable" rather than "no results".
 */

import { createReadStream, promises as fsp } from 'node:fs';
import readline from 'node:readline';

export interface StreamStats {
  /** Lines that parsed into a feature. */
  parsed: number;
  /** Lines that were not JSON (header, separators, terminator). Expected: ~3. */
  skipped: number;
}

/**
 * Yield every feature in a newline-delimited GeoJSON FeatureCollection.
 * Never loads the whole file. `stats` is mutated as it goes so callers can
 * report progress and detect a degenerate parse.
 */
export async function* streamFeatures<T>(
  filePath: string,
  stats: StreamStats = { parsed: 0, skipped: 0 },
): AsyncGenerator<T, void, undefined> {
  const input = createReadStream(filePath, { encoding: 'utf8', highWaterMark: 1 << 20 });
  const rl = readline.createInterface({ input, crlfDelay: Infinity });

  try {
    for await (const rawLine of rl) {
      // Strip the leading "," that separates features when the emitter puts the
      // comma on the same line as the next feature, and the trailing "," when
      // it puts it on the same line as the previous one. Both occur.
      let line = rawLine.trim();
      if (line.startsWith(',')) line = line.slice(1).trim();
      if (line.endsWith(',')) line = line.slice(0, -1).trim();
      if (line.length === 0) continue;
      // Header line, terminator line, or a stray separator.
      if (line[0] !== '{') {
        stats.skipped++;
        continue;
      }
      let feature: T;
      try {
        feature = JSON.parse(line) as T;
      } catch {
        // A truncated final line of a half-downloaded file lands here.
        stats.skipped++;
        continue;
      }
      stats.parsed++;
      yield feature;
    }
  } finally {
    rl.close();
    input.destroy();
  }
}

export interface FileCheck {
  exists: boolean;
  sizeBytes: number;
  /** True when the FeatureCollection terminator is present at EOF. */
  complete: boolean;
  reason: string;
}

/**
 * Decide whether a dump on disk is usable.
 *
 * A partially-downloaded dump is WORSE than a missing one: it silently produces
 * an under-count (e.g. "no lit runs in Bulgaria" when Bulgaria simply had not
 * downloaded yet). So we require the closing "]}" of the FeatureCollection to
 * be physically present at EOF before we will read a byte of it.
 */
export async function checkDump(filePath: string): Promise<FileCheck> {
  let sizeBytes = 0;
  try {
    const st = await fsp.stat(filePath);
    sizeBytes = st.size;
    if (!st.isFile()) {
      return { exists: false, sizeBytes: 0, complete: false, reason: 'not a file' };
    }
  } catch {
    return { exists: false, sizeBytes: 0, complete: false, reason: 'missing' };
  }

  if (sizeBytes === 0) {
    return { exists: true, sizeBytes, complete: false, reason: 'zero bytes' };
  }

  const tailLen = Math.min(64, sizeBytes);
  let tail = '';
  let fh: fsp.FileHandle | undefined;
  try {
    fh = await fsp.open(filePath, 'r');
    const buf = Buffer.alloc(tailLen);
    await fh.read(buf, 0, tailLen, sizeBytes - tailLen);
    tail = buf.toString('utf8');
  } catch (err) {
    // EBUSY on Windows = another process still holds the file open for writing.
    return {
      exists: true,
      sizeBytes,
      complete: false,
      reason: `unreadable (${(err as NodeJS.ErrnoException).code ?? 'error'}) — likely still downloading`,
    };
  } finally {
    await fh?.close();
  }

  const complete = tail.replace(/\s/g, '').endsWith(']}');
  return {
    exists: true,
    sizeBytes,
    complete,
    reason: complete ? 'ok' : 'truncated — no FeatureCollection terminator at EOF',
  };
}

export function humanBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(1)} ${units[i]}`;
}
