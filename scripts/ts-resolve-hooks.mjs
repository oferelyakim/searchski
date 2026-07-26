/**
 * Module resolution hook: maps "./x.js" specifiers onto "./x.ts" source files.
 *
 * Loaded by scripts/ts-resolve.mjs — see that file for why this exists.
 *
 * Node's ESM loader runs hooks on a separate thread, so this module must have
 * no side effects and no dependencies beyond node: builtins.
 */

import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export async function resolve(specifier, context, nextResolve) {
  // Only rewrite relative ".js" specifiers, and only when the .js does NOT
  // exist but a sibling .ts does. That makes the hook a no-op for real
  // compiled output, for node_modules, and for bare specifiers.
  if (specifier.startsWith('.') && specifier.endsWith('.js') && context.parentURL) {
    try {
      const asJs = new URL(specifier, context.parentURL);
      if (!existsSync(fileURLToPath(asJs))) {
        const asTs = new URL(specifier.slice(0, -3) + '.ts', context.parentURL);
        if (existsSync(fileURLToPath(asTs))) {
          return { url: asTs.href, format: 'module-typescript', shortCircuit: true };
        }
      }
    } catch {
      // Fall through to default resolution on any URL parsing problem.
    }
  }
  return nextResolve(specifier, context);
}
