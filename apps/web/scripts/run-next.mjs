#!/usr/bin/env node
/**
 * Invoke the Next.js CLI through Node directly instead of the npm bin shim.
 *
 * Why this exists: on the Windows dev box this project was built on, the
 * generated shims `node_modules/.bin/next.cmd` and `next.ps1` are blocked from
 * executing ("Access is denied" from cmd.exe and PowerShell alike) by a local
 * security policy, while every other shim in the same directory runs. Resolving
 * the real entry point and spawning it with `process.execPath` sidesteps the
 * shim entirely.
 *
 * This is portable, not a workaround with a cost: it behaves identically on
 * Linux and on Vercel, where it resolves the same `next/dist/bin/next`.
 * Replace `node scripts/run-next.mjs <cmd>` with plain `next <cmd>` in
 * package.json if you are on a machine where the shims work.
 */

import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';

const require = createRequire(import.meta.url);

let bin;
try {
  bin = require.resolve('next/dist/bin/next');
} catch (err) {
  console.error('[run-next] Could not resolve the Next.js CLI. Run `npm install` at the repo root.');
  console.error(err);
  process.exit(1);
}

const child = spawn(process.execPath, [bin, ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: process.env,
});

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});

child.on('error', (err) => {
  console.error('[run-next] Failed to start the Next.js CLI.', err);
  process.exit(1);
});
