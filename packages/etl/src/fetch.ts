/**
 * Download the three OpenSkiMap dumps to data/raw/.
 *
 *   npm run -w @searchski/etl fetch
 *
 * Behaviour:
 *  - Skips any dump already present in data/raw/ and COMPLETE.
 *  - Otherwise adopts a complete copy from the operator's scratchpad if there
 *    is one (avoids re-downloading ~1 GB that is already on the disk).
 *  - Otherwise streams from tiles.openskimap.org straight to disk.
 *
 * "Complete" means the FeatureCollection's closing "]}" is physically at EOF —
 * see stream.ts. A half-downloaded dump is treated as absent, because a
 * truncated runs.geojson silently under-reports night skiing rather than
 * failing, and a silent under-report is the worst possible outcome here.
 *
 * SIZE WARNING: the server serves these gzip-encoded. Content-Length on the
 * wire is the COMPRESSED size (runs.geojson ~234 MB) but what lands on disk is
 * decompressed (~0.9-1.0 GB). Do not compare the two — a size-equality check
 * against Content-Length will always fail. We check the terminator instead.
 */

import { createWriteStream, promises as fsp } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { DUMPS, DUMP_URL, RAW_DIR, SCRATCHPAD_DIR, rawPath, type DumpName } from './config.ts';
import { checkDump, humanBytes } from './stream.ts';

async function adoptFromScratchpad(name: DumpName): Promise<boolean> {
  const src = path.join(SCRATCHPAD_DIR, `${name}.geojson`);
  const check = await checkDump(src);
  if (!check.exists) return false;
  if (!check.complete) {
    console.log(
      `    scratchpad copy present (${humanBytes(check.sizeBytes)}) but unusable: ${check.reason}`,
    );
    return false;
  }
  console.log(`    adopting complete scratchpad copy (${humanBytes(check.sizeBytes)})`);
  await fsp.copyFile(src, rawPath(name));
  return true;
}

async function download(name: DumpName): Promise<void> {
  const url = DUMP_URL[name];
  const dest = rawPath(name);
  const tmp = `${dest}.partial`;

  console.log(`    downloading ${url}`);
  const res = await fetch(url);
  if (!res.ok || !res.body) {
    throw new Error(`GET ${url} failed: ${res.status} ${res.statusText}`);
  }
  const wire = Number(res.headers.get('content-length') ?? 0);
  if (wire > 0) {
    console.log(`    ${humanBytes(wire)} on the wire (compressed; expands on disk)`);
  }

  // Stream to a .partial file so an interrupted run can never leave a truncated
  // file sitting at the real path looking authoritative.
  await pipeline(Readable.fromWeb(res.body as Parameters<typeof Readable.fromWeb>[0]), createWriteStream(tmp));

  const check = await checkDump(tmp);
  if (!check.complete) {
    await fsp.rm(tmp, { force: true });
    throw new Error(`downloaded ${name} is incomplete: ${check.reason}`);
  }
  await fsp.rename(tmp, dest);
  console.log(`    wrote ${humanBytes(check.sizeBytes)} to data/raw/${name}.geojson`);
}

export async function fetchAll(names: readonly DumpName[] = DUMPS): Promise<void> {
  await fsp.mkdir(RAW_DIR, { recursive: true });

  for (const name of names) {
    console.log(`[fetch] ${name}.geojson`);
    const existing = await checkDump(rawPath(name));
    if (existing.complete) {
      console.log(`    already present and complete (${humanBytes(existing.sizeBytes)}) — skipping`);
      continue;
    }
    if (existing.exists) {
      console.log(`    existing file unusable (${existing.reason}) — refetching`);
      await fsp.rm(rawPath(name), { force: true });
    }
    if (await adoptFromScratchpad(name)) continue;
    await download(name);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  fetchAll().catch((err: unknown) => {
    console.error('[fetch] failed:', err);
    process.exit(1);
  });
}
