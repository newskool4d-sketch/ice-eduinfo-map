import { GeoJsonLayer, PathLayer } from "@deck.gl/layers";
import type { PickingInfo } from "@deck.gl/core";
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from "geojson";

import { ringsOf, type RegionFeature } from "@/lib/geo/geo";
import { REGION_MATERIAL } from "@/components/map/lighting";
import { dim } from "@/lib/colors";

type RGBA = [number, number, number, number];

/** Non-selected regions, once something IS selected: lightness only (dim(rgb, 0.55)), alpha unchanged — per the task brief's literal factor. */
export const UNSELECTED_DIM = 0.55;
/** The selected region itself: 원색 + 약간 밝게 (raw color, slightly brightened) — factor is this task's own choice, the brief doesn't pin an exact number. */
export const SELECTED_BRIGHTEN = 1.15;

/** `t => 1 - (1-t)^3` — deck.gl's `transitions` easing takes a plain function; not shipped by deck.gl itself. */
export function easeCubicOut(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

type NeighborFeatureCollection = FeatureCollection<
  Polygon | MultiPolygon,
  { code: string; name: string }
>;

/** Flat, unpickable silhouette of the 시도 bordering 전북 (backdrop context only). */
export function makeNeighborsLayer(fc: NeighborFeatureCollection) {
  return new GeoJsonLayer<{ code: string; name: string }>({
    id: "neighbors",
    data: fc,
    filled: true,
    stroked: true,
    getFillColor: [22, 27, 40],
    getLineColor: [40, 48, 66],
    lineWidthMinPixels: 1,
    pickable: false,
  });
}

type RegionsFeatureCollection = FeatureCollection<
  Polygon | MultiPolygon,
  RegionFeature["properties"]
>;

/**
 * Ground-level outline of all 14 시군, drawn under the extruded `regions`
 * layer. `extruded: true` on a GeoJsonLayer suppresses its own stroke
 * sub-layer, so this flat footprint is what makes the base outline visible.
 */
export function makeFootprintLayer(fc: RegionsFeatureCollection) {
  return new GeoJsonLayer<RegionFeature["properties"]>({
    id: "footprint",
    data: fc,
    extruded: false,
    filled: false,
    stroked: true,
    lineWidthUnits: "pixels",
    getLineWidth: 1,
    getLineColor: [90, 100, 125, 160],
    pickable: false,
  });
}

export interface RegionsLayerOptions {
  /** Injection point: bar height (m) for a region code. Swapped for a real indicator by a later task. */
  elevationOf: (code: string) => number;
  /** Injection point: fill color for a region code. Swapped for a real indicator by a later task. */
  fillColorOf: (code: string) => RGBA;
  /** Included in `updateTriggers` so changing e.g. the selected indicator re-evaluates the accessors above. */
  triggerKey: string | number;
  /**
   * The currently-selected 시군 code, or null when nothing is selected.
   * Optional (defaults to null) for backward compatibility with pre-Task-4A
   * call sites. When set, `getFillColor` brightens the selected region and
   * dims every other one (lightness only — alpha always stays 255); also
   * included in `updateTriggers.getFillColor` (alongside `triggerKey`) so a
   * selection change re-evaluates fill color even when the indicator
   * itself didn't change. Does NOT affect `getElevation` — selection has no
   * effect on bar height, only color (the separate `selected-ring` layer
   * marks the selection's height instead).
   */
  selectedCode?: string | null;
  onClick?: (code: string) => void;
}

/** The extruded 3D body of the scene — height/color driven entirely by the injected accessors. */
export function makeRegionsLayer(fc: RegionsFeatureCollection, opts: RegionsLayerOptions) {
  const selectedCode = opts.selectedCode ?? null;

  return new GeoJsonLayer<RegionFeature["properties"]>({
    id: "regions",
    data: fc,
    extruded: true,
    filled: true,
    getElevation: (f) => opts.elevationOf(f.properties.code),
    elevationScale: 1,
    // Inline (not a separately-declared function): a standalone function
    // needs its own parameter type annotation, and GeoJsonLayer's generic
    // Accessor type is keyed to `Feature<Geometry, ...>` (every geometry
    // kind it could in principle carry) — narrowing that annotation to
    // `Polygon | MultiPolygon` (accurate for this app's data, but narrower
    // than the prop's declared type) makes TS reject the assignment.
    // Inline, contextual typing infers the correct (wider) parameter type
    // instead, same as `getElevation` above.
    getFillColor: (f) => {
      const code = f.properties.code;
      const [r, g, b, a] = opts.fillColorOf(code);
      if (!selectedCode) return [r, g, b, a];
      const factor = code === selectedCode ? SELECTED_BRIGHTEN : UNSELECTED_DIM;
      const [dr, dg, db] = dim([r, g, b], factor);
      return [dr, dg, db, a];
    },
    material: REGION_MATERIAL,
    pickable: true,
    autoHighlight: true,
    highlightColor: [255, 255, 255, 60],
    updateTriggers: {
      getElevation: [opts.triggerKey],
      getFillColor: [opts.triggerKey, selectedCode],
    },
    transitions: {
      getElevation: { type: "interpolation", duration: 600, easing: easeCubicOut },
      getFillColor: { type: "interpolation", duration: 600 },
    },
    onClick: opts.onClick
      ? (info: PickingInfo<Feature<Polygon | MultiPolygon, RegionFeature["properties"]>>) => {
          const code = info.object?.properties?.code;
          if (code) opts.onClick?.(code);
        }
      : undefined,
  });
}

/** `[lng, lat, elevation]` path point, as consumed by PathLayer's default (identity) coordinate format. */
type Point3 = [number, number, number];

/**
 * Highlights the currently-selected region with a bright outline traced
 * `elevation + 10`m above its top face (since `extruded: true` regions have
 * no stroke sub-layer of their own). `feature: null` (nothing selected)
 * yields an empty, invisible layer.
 */
export function makeSelectedRingLayer(feature: RegionFeature | null, elevation: number) {
  const data: Point3[][] = feature
    ? ringsOf(feature).map((ring) => ring.map(([lng, lat]): Point3 => [lng, lat, elevation + 10]))
    : [];
  return new PathLayer<Point3[]>({
    id: "selected-ring",
    data,
    getPath: (d) => d,
    widthUnits: "pixels",
    getWidth: 2,
    jointRounded: true,
    getColor: [255, 255, 255, 230],
    visible: !!feature,
  });
}
