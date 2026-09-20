import type { Feature, FeatureCollection, MultiPolygon, Polygon, Position } from "geojson";

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
    /**
     * Task 6, Section C.2 — a manual per-region pixel nudge for the map's
     * TextLayer label (`getPixelOffset`), sourced from
     * `data/manual/label-offsets.json` and injected by `build-regions.ts`.
     * `[0, 0]` (no nudge) for every region not listed there — the pipeline
     * always writes SOME value, so this is never optional/undefined on a
     * real `regions.geojson`.
     */
    labelOffset: [number, number];
  }
>;

/** A FeatureCollection of `RegionFeature`s — the shape of `public/data/regions.geojson` (and, post Task 6 Section C.1, of DataProvider's derived `regionsMain`/`regionsIslands`). The single source of truth for this shape; `src/lib/data/types.ts` re-exports it rather than redefining it. */
export type RegionsFeatureCollection = FeatureCollection<Polygon | MultiPolygon, RegionFeature["properties"]>;

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

/** Shoelace formula on a single ring, unsigned — a PLANAR (not geodesic) area, adequate for comparing two parts of the SAME small region against each other (Task 6, Section C.1: "구면 근사 없이 평면 shoelace 로 충분"). Never used across regions or as an absolute measurement. */
function ringArea(ring: readonly Position[]): number {
  let sum = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[i + 1];
    sum += x1 * y2 - x2 * y1;
  }
  return Math.abs(sum) / 2;
}

/** A MultiPolygon coordinate part's OUTER ring is always `part[0]` (subsequent entries are holes, ignored for area-comparison purposes — a hole only ever shrinks a part, never changes which SIBLING part is biggest by enough to flip the outcome for this app's real geometry). */
function partArea(part: readonly Position[][]): number {
  return ringArea(part[0]);
}

export interface SplitIslandsResult {
  /** Every input region's single largest-area part, always as a `Polygon` — exactly one feature per input region, in the same order. */
  main: RegionsFeatureCollection;
  /** Whatever's left after removing each region's largest part — ONLY for regions that were originally a `MultiPolygon` with more than one part (a plain single-part `Polygon` region contributes nothing here). A region with exactly 2 remaining parts still serializes as a `Polygon`; 2+ remaining parts serialize as one `MultiPolygon` feature bundling all of them. */
  islands: RegionsFeatureCollection;
}

/**
 * Task 6, Section C.1 — "섬은 평면으로": splits each region's MultiPolygon
 * into its single largest-area part (rendered extruded, by the `regions`
 * layer) and whatever else is left (rendered flat, by the `region-islands`
 * layer — 고군산군도/위도 등 소규모 섬이 돌출된 기둥처럼 보이지 않도록). A
 * region that's already a plain `Polygon` (one part) is unaffected — it
 * goes entirely into `main`. Pure/planar (no geodesic projection — see
 * `ringArea`'s doc comment); computed once by DataProvider and reused for
 * the data bundle's lifetime (참조 안정).
 */
export function splitRegionIslands(fc: RegionsFeatureCollection): SplitIslandsResult {
  const mainFeatures: RegionFeature[] = [];
  const islandFeatures: RegionFeature[] = [];

  for (const feature of fc.features) {
    const { geometry, properties } = feature;
    if (geometry.type === "Polygon") {
      mainFeatures.push(feature as RegionFeature);
      continue;
    }

    const parts = geometry.coordinates; // Position[][][], one entry per disjoint polygon part
    let largestIdx = 0;
    let largestArea = -Infinity;
    parts.forEach((part, i) => {
      const area = partArea(part);
      if (area > largestArea) {
        largestArea = area;
        largestIdx = i;
      }
    });

    mainFeatures.push({
      type: "Feature",
      properties,
      geometry: { type: "Polygon", coordinates: parts[largestIdx] },
    });

    const rest = parts.filter((_, i) => i !== largestIdx);
    if (rest.length > 0) {
      islandFeatures.push({
        type: "Feature",
        properties,
        geometry:
          rest.length === 1
            ? { type: "Polygon", coordinates: rest[0] }
            : { type: "MultiPolygon", coordinates: rest },
      });
    }
  }

  return {
    main: { type: "FeatureCollection", features: mainFeatures },
    islands: { type: "FeatureCollection", features: islandFeatures },
  };
}
