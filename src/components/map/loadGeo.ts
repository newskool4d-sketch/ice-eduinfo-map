import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";

import type { RegionFeature } from "@/lib/geo/geo";

export type RegionsFeatureCollection = FeatureCollection<
  Polygon | MultiPolygon,
  RegionFeature["properties"]
>;

export type NeighborsFeatureCollection = FeatureCollection<
  Polygon | MultiPolygon,
  { code: string; name: string }
>;

export interface LoadedGeo {
  regions: RegionsFeatureCollection;
  neighbors: NeighborsFeatureCollection;
  /** Individual characters from public/data/charset.json, ready for TextLayer's `characterSet`. */
  charset: string[];
}

// Temporary loader (per the task brief): T2 moves this fetch logic into a
// DataProvider that also loads indicator JSON. Kept as its own module so
// that move doesn't have to touch DeckMap.tsx's rendering logic.
export async function loadGeo(): Promise<LoadedGeo> {
  const [regionsRes, neighborsRes, charsetRes] = await Promise.all([
    fetch("/data/regions.geojson"),
    fetch("/data/neighbors.geojson"),
    fetch("/data/charset.json"),
  ]);

  for (const [label, res] of [
    ["regions.geojson", regionsRes],
    ["neighbors.geojson", neighborsRes],
    ["charset.json", charsetRes],
  ] as const) {
    if (!res.ok) {
      throw new Error(`loadGeo: failed to fetch ${label} (HTTP ${res.status})`);
    }
  }

  const [regions, neighbors, charsetString] = await Promise.all([
    regionsRes.json() as Promise<RegionsFeatureCollection>,
    neighborsRes.json() as Promise<NeighborsFeatureCollection>,
    charsetRes.json() as Promise<string>,
  ]);

  return { regions, neighbors, charset: Array.from(charsetString) };
}
