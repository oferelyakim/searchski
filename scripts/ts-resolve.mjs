/**
 * Lets `node file.ts` run this repo's TypeScript sources directly.
 *
 *   node --import ./scripts/ts-resolve.mjs packages/core/src/golden.ts
 *
 * ---------------------------------------------------------------------------
 * WHY THIS EXISTS
 * ---------------------------------------------------------------------------
 * Node 22.18+ strips TypeScript types natively, so it can execute a .ts file
 * with no build step and no dependencies. What it does NOT do is rewrite the
 * TS-ESM import convention: TypeScript style says you write
 *
 *     import { parse } from './criteria.js';
 *
 * inside criteria.ts, and the bundler resolves it to the .ts source. Node takes
 * that specifier literally, looks for criteria.js, and fails. tsx normally
 * papers over this — but tsx is built on esbuild, whose native binary lives in
 * node_modules and is blocked from executing by OS policy on at least one
 * machine in this project (EPERM / "Access is denied"). That machine cannot run
 * `npm run golden` at all without this shim.
 *
 * So: this hook maps a relative ".js" specifier onto the sibling ".ts" file,
 * but ONLY when the .js does not exist. It is a no-op for compiled output, for
 * node_modules, and for anyone whose toolchain already works — which is why it
 * is safe to wire into the default `golden` script rather than a special one.
 *
 * Requires Node >= 22.18 (native type stripping). On older Node, use the
 * `golden:tsx` script instead.
 */

import { register } from 'node:module';

register(new URL('./ts-resolve-hooks.mjs', import.meta.url));
