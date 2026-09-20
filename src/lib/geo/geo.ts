import type { Feature, MultiPolygon, Polygon, Position } from "geojson";

/** A closed ring of [lng, lat] points (no altitude). */
export type Ring = [number, number][];

export type Bbox = [minLng: number, minLat: number, maxLng: number, maxLat: number];

/** The shape of a feature in `public/data/regions.geojson`, as produced by `build-regions.ts`. */
export type RegionFeature = Feature<
  Polygon | MultiPolygon,
  {
    code: string;
    name: string;
    bbox: Bbox;
    labelPoint: [number, number];
  }
>;

function toLngLat(position: Position): [number, number] {
  return [position[0], position[1]];
}

/**
 * Returns every ring (exterior boundaries and, if present, holes) of a
 * Polygon or MultiPolygon feature, each as a flat `[lng, lat][]` array.
 *
 * Used by `makeSelectedRingLayer` to trace the full outline of a selected
 * region with a `PathLayer`.
 */
export function ringsOf(
  feature: Feature<Polygon | MultiPolygon, unknown>,
): Ring[] {
  const { geometry } = feature;
  if (geometry.type === "Polygon") {
    return geometry.coordinates.map((ring) => ring.map(toLngLat));
  }
  const rings: Ring[] = [];
  for (const polygon of geometry.coordinates) {
    for (const ring of polygon) {
      rings.push(ring.map(toLngLat));
    }
  }
  return rings;
}

/**
 * Computes the bounding box of a feature directly from its geometry.
 * Fallback for when `properties.bbox` is missing or untrusted (the
 * pipeline normally precomputes `bbox` with mapshaper's `this.bounds`).
 */
export function bboxOf(feature: Feature<Polygon | MultiPolygon, unknown>): Bbox {
  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;
  for (const ring of ringsOf(feature)) {
    for (const [lng, lat] of ring) {
      if (lng < minLng) minLng = lng;
      if (lat < minLat) minLat = lat;
      if (lng > maxLng) maxLng = lng;
      if (lat > maxLat) maxLat = lat;
    }
  }
  if (!Number.isFinite(minLng)) {
    throw new Error("bboxOf: feature has no coordinates");
  }
  return [minLng, minLat, maxLng, maxLat];
}

/**
 * Unions the bounding boxes of a list of region features, preferring the
 * precomputed `properties.bbox` (fast) and falling back to `bboxOf` when a
 * feature doesn't carry one.
 */
export function unionBbox(
  features: readonly Feature<Polygon | MultiPolygon, { bbox?: Bbox }>[],
): Bbox {
  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;
  for (const feature of features) {
    const [a, b, c, d] = feature.properties?.bbox ?? bboxOf(feature);
    if (a < minLng) minLng = a;
    if (b < minLat) minLat = b;
    if (c > maxLng) maxLng = c;
    if (d > maxLat) maxLat = d;
  }
  if (!Number.isFinite(minLng)) {
    throw new Error("unionBbox: no features given");
  }
  return [minLng, minLat, maxLng, maxLat];
}
