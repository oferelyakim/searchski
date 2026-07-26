import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { NextConfig } from 'next';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');

const nextConfig: NextConfig = {
  reactStrictMode: true,

  // `@searchski/core` and `@searchski/affiliates` are workspace packages that
  // ship raw TypeScript source (their package.json `main` points at src/), so
  // Next has to compile them rather than treating them as built dependencies.
  transpilePackages: ['@searchski/core', '@searchski/affiliates', '@searchski/nlp'],

  // Those packages live outside apps/web.
  experimental: {
    externalDir: true,
  },

  // Vercel: trace from the monorepo root so the committed ETL artifacts in
  // data/build/ are bundled into the serverless functions that read them.
  // Without this, `src/lib/data-static.ts` finds nothing in production and the
  // app silently falls back to the sample dataset.
  outputFileTracingRoot: repoRoot,
  outputFileTracingIncludes: {
    // data/seed is included as well because the ETL does not (yet) emit an
    // airports artifact, and `src/lib/data-static.ts` falls back to the curated
    // seed list for them. Without it the arrival airport is unknown in
    // production and every transfer and car-hire link silently disappears.
    '/**': ['../../data/build/**/*.json', '../../data/seed/airports.json'],
  },

  // No ESLint config ships with this app; do not let lint gate a deploy.
  // TypeScript errors DO gate the build — that is deliberate.
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: false },

  turbopack: {
    root: repoRoot,
  },

  webpack(config) {
    // The workspace packages are ESM TypeScript and import siblings with an
    // explicit `.js` extension (`./types.js`), which is what the TS spec
    // requires for ESM output. Only the `.ts` file exists on disk, so webpack
    // needs to be told the mapping. Turbopack infers this on its own.
    config.resolve = config.resolve ?? {};
    config.resolve.extensionAlias = {
      ...(config.resolve.extensionAlias as Record<string, string[]> | undefined),
      '.js': ['.ts', '.tsx', '.js'],
      '.mjs': ['.mts', '.mjs'],
    };
    return config;
  },
};

export default nextConfig;
