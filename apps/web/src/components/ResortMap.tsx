'use client';

import dynamic from 'next/dynamic';
import type { MapCanvasProps } from './MapCanvas';

/**
 * Client-only wrapper around MapLibre.
 *
 * MapLibre touches `window` at import time, so the canvas is dynamically
 * imported with `ssr: false`. That is only legal inside a client component,
 * which is the entire reason this thin file exists — server pages import this,
 * never MapCanvas directly.
 */
const MapCanvas = dynamic(() => import('./MapCanvas'), {
  ssr: false,
  loading: () => (
    <div
      className="grid w-full place-items-center rounded-lg border border-border bg-surface-2 text-sm text-muted"
      style={{ height: 340 }}
    >
      Loading map…
    </div>
  ),
});

export function ResortMap(props: MapCanvasProps) {
  return <MapCanvas {...props} />;
}
