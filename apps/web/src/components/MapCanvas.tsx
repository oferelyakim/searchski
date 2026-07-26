'use client';

import { useEffect, useRef } from 'react';
import maplibregl, { type StyleSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

/**
 * MapLibre GL with a free raster basemap. No Mapbox, no Google, no API key.
 *
 * ------------------------------- TILE POLICY -------------------------------
 * `tile.openstreetmap.org` is the OSM Foundation's own tile server. It is free
 * and needs no key, but its Tile Usage Policy forbids heavy or commercial use
 * and requires the attribution below, which is rendered by MapLibre's own
 * attribution control and cannot be removed.
 *
 * Before this site carries real traffic or affiliate revenue, move to
 * self-hosted PMTiles on R2 or a free-tier vector provider (PLAN.md §2 and
 * §10 already budget for it). Until then this is one map view per resort
 * page, which is exactly the "light use" the policy allows.
 * ---------------------------------------------------------------------------
 */

const OSM_ATTRIBUTION = '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

const RASTER_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      maxzoom: 19,
      attribution: OSM_ATTRIBUTION,
    },
  },
  layers: [
    {
      id: 'osm',
      type: 'raster',
      source: 'osm',
      minzoom: 0,
      maxzoom: 22,
    },
  ],
};

export interface MapMarker {
  id: string;
  name: string;
  lat: number;
  lon: number;
  /** The resort this map is centred on gets the accent pin. */
  primary?: boolean;
}

export interface MapCanvasProps {
  markers: MapMarker[];
  zoom?: number;
  height?: number;
  label: string;
}

export default function MapCanvas({ markers, zoom = 11, height = 340, label }: MapCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || mapRef.current) return;

    const first = markers[0];
    const map = new maplibregl.Map({
      container,
      style: RASTER_STYLE,
      center: first ? [first.lon, first.lat] : [10, 46],
      zoom: markers.length > 1 ? 5 : zoom,
      attributionControl: { compact: true },
    });
    mapRef.current = map;

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }));
    map.getCanvas().setAttribute('aria-label', label);

    for (const marker of markers) {
      const el = document.createElement('div');
      el.style.width = '16px';
      el.style.height = '16px';
      el.style.borderRadius = '50%';
      el.style.border = '2px solid #ffffff';
      el.style.boxShadow = '0 1px 3px rgba(0,0,0,0.45)';
      el.style.background = marker.primary ? 'var(--c-accent)' : 'var(--c-bad)';
      el.setAttribute('role', 'img');
      el.setAttribute('aria-label', marker.name);

      new maplibregl.Marker({ element: el })
        .setLngLat([marker.lon, marker.lat])
        .setPopup(new maplibregl.Popup({ offset: 14 }).setText(marker.name))
        .addTo(map);
    }

    if (markers.length > 1) {
      const bounds = new maplibregl.LngLatBounds();
      for (const m of markers) bounds.extend([m.lon, m.lat]);
      map.fitBounds(bounds, { padding: 56, maxZoom: 11, duration: 0 });
    }

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [markers, zoom, label]);

  return (
    <div
      ref={containerRef}
      style={{ height }}
      className="w-full overflow-hidden rounded-lg border border-border"
      // MapLibre canvases are not keyboard-navigable content; the resort's
      // coordinates are also given as text next to the map.
      aria-label={label}
      role="region"
    />
  );
}
