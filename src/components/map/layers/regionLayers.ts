import { GeoJsonLayer, PathLayer } from "@deck.gl/layers";
import type { PickingInfo } from "@deck.gl/core";
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from "geojson";

import type { RegionFeature, Ring } from "@/lib/geo/geo";
import { REGION_MATERIAL } from "@/components/map/lighting";
import { dim } from "@/lib/colors";

type RGBA = [number, number, number, number];

/** Non-selected regions, once something IS selected: lightness only (dim(rgb, 0.55)), alpha unchanged — per the task brief's literal factor. */
export const UNSELECTED_DIM = 0.55;
/**
 * The selected region itself: 원색 그대로 (raw palette color, unmodified) —
 * changed from 1.15 (Task 4A's original choice) to 1.0 per Task 6, Section
 * C-추가 #4: brightening an ALREADY-bright top face (e.g. Viridis's
 * near-yellow high end) pushed it bright enough to wash out same-hue school
 * points on top of it (중학교's amber dot). The selection cue still reads
 * clearly without it — this region is no longer DIMMED like every other
 * non-selected one (UNSELECTED_DIM=0.55), plus the `region-top-rings` layer
 * (Task A) draws its outline wider and brighter than every other region's.
 */
export const SELECTED_BRIGHTEN = 1.0;
/** Default deck.gl `transitions` duration (ms) for this layer's animated props — see the `transitionDuration` option below. */
const DEFAULT_TRANSITION_DURATION = 600;

/** `t => 1 - (1-t)^3` — deck.gl's `transitions` easing takes a plain function; not shipped by deck.gl itself. */
export function easeCubicOut(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

type NeighborFeatureCollection = FeatureCollection<
  Polygon | MultiPolygon,
  { code: string; name: string }
>;

export interface NeighborsLayerOptions {
  /**
   * Task C — true once the VWorld basemap tiles are visible underneath:
   * swaps the opaque backdrop for a translucent navy mask so the basemap
   * actually reads through the neighbor silhouette/border instead of being
   * fully hidden by it. Defaults to false (the original opaque backdrop),
   * so every pre-Task-C call site (`makeNeighborsLayer(fc)`, no options)
   * keeps rendering exactly as before.
   */
  masked?: boolean;
}

/** Flat, unpickable silhouette of the 시도 bordering 전북 (backdrop context only). */
export function makeNeighborsLayer(fc: NeighborFeatureCollection, opts: NeighborsLayerOptions = {}) {
  const masked = opts.masked ?? false;

  return new GeoJsonLayer<{ code: string; name: string }>({
    id: "neighbors",
    data: fc,
    filled: true,
    stroked: true,
    getFillColor: masked ? [11, 15, 25, 140] : [22, 27, 40],
    getLineColor: masked ? [40, 48, 66, 160] : [40, 48, 66],
    lineWidthMinPixels: 1,
    pickable: false,
    updateTriggers: {
      getFillColor: [masked],
      getLineColor: [masked],
    },
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

/** Applies the shared selection dim/brighten rule to a raw `fillColorOf(code)` result — used by both `makeRegionsLayer` and `makeIslandsLayer` so a region's mainland and its islands always render the exact same color. */
function selectionAwareFillColor(
  code: string,
  fillColorOf: (code: string) => RGBA,
  selectedCode: string | null,
): RGBA {
  const [r, g, b, a] = fillColorOf(code);
  if (!selectedCode) return [r, g, b, a];
  const factor = code === selectedCode ? SELECTED_BRIGHTEN : UNSELECTED_DIM;
  const [dr, dg, db] = dim([r, g, b], factor);
  return [dr, dg, db, a];
}

export interface RegionsLayerOptions {
  /** Injection point: bar height (m) for a region code — DeckMap hands in `makeElevationScale(def, map)` for the currently-selected indicator. */
  elevationOf: (code: string) => number;
  /** Injection point: fill color for a region code — DeckMap hands in `makeColorScale(def, map).colorOf` for the currently-selected indicator. */
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
   * effect on bar height, only color (the `region-top-rings` layer marks
   * the selection with a wider, brighter outline instead).
   */
  selectedCode?: string | null;
  onClick?: (code: string) => void;
  /** deck.gl `transitions` duration (ms) for getElevation/getFillColor. Defaults to 600. Task 6, Section A.4 — pass 0 when `prefers-reduced-motion: reduce`. */
  transitionDuration?: number;
}

/** The extruded 3D body of the scene — height/color driven entirely by the injected accessors. */
export function makeRegionsLayer(fc: RegionsFeatureCollection, opts: RegionsLayerOptions) {
  const selectedCode = opts.selectedCode ?? null;
  const transitionDuration = opts.transitionDuration ?? DEFAULT_TRANSITION_DURATION;

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
    getFillColor: (f) => selectionAwareFillColor(f.properties.code, opts.fillColorOf, selectedCode),
    material: REGION_MATERIAL,
    pickable: true,
    autoHighlight: true,
    highlightColor: [255, 255, 255, 60],
    updateTriggers: {
      getElevation: [opts.triggerKey],
      getFillColor: [opts.triggerKey, selectedCode],
    },
    transitions: {
      getElevation: { type: "interpolation", duration: transitionDuration, easing: easeCubicOut },
      getFillColor: { type: "interpolation", duration: transitionDuration },
    },
    onClick: opts.onClick
      ? (info: PickingInfo<Feature<Polygon | MultiPolygon, RegionFeature["properties"]>>) => {
          const code = info.object?.properties?.code;
          if (code) opts.onClick?.(code);
        }
      : undefined,
  });
}

export interface IslandsLayerOptions {
  /** Same injection point as `RegionsLayerOptions.fillColorOf` — MUST be the same function the caller hands `makeRegionsLayer`, so a region's mainland and its islands are always the exact same color. */
  fillColorOf: (code: string) => RGBA;
  triggerKey: string | number;
  /** Same selection semantics as `RegionsLayerOptions.selectedCode` — kept in sync so an island brightens/dims exactly like its region's mainland part. */
  selectedCode?: string | null;
  onClick?: (code: string) => void;
  /** deck.gl `transitions` duration (ms) for getFillColor. Defaults to 600 (matches `makeRegionsLayer`, so a color change morphs in sync across the mainland/islands split). Task 6, Section A.4. */
  transitionDuration?: number;
}

/**
 * Task 6, Section C.1 — "섬은 평면으로": the flat sibling of `regions`, fed
 * `bundle.regionsIslands` (each region's non-largest MultiPolygon parts —
 * see `splitRegionIslands` in geo.ts). `extruded: false` so small/detached
 * islands (고군산군도, 위도 등) never render as thin extruded spikes at the
 * scene's `ELEVATION_FLOOR`; same fill color and click/tooltip behavior as
 * `regions` (this layer stays pickable, and every GeoJsonLayer feature here
 * still carries `properties.code`, so DeckMap's existing generic
 * getTooltip/handleRegionClick dispatch needs no changes at all).
 */
export function makeIslandsLayer(fc: RegionsFeatureCollection, opts: IslandsLayerOptions) {
  const selectedCode = opts.selectedCode ?? null;
  const transitionDuration = opts.transitionDuration ?? DEFAULT_TRANSITION_DURATION;

  return new GeoJsonLayer<RegionFeature["properties"]>({
    id: "region-islands",
    data: fc,
    extruded: false,
    filled: true,
    getFillColor: (f) => selectionAwareFillColor(f.properties.code, opts.fillColorOf, selectedCode),
    pickable: true,
    autoHighlight: true,
    highlightColor: [255, 255, 255, 60],
    updateTriggers: {
      getFillColor: [opts.triggerKey, selectedCode],
    },
    transitions: {
      getFillColor: { type: "interpolation", duration: transitionDuration },
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
 * One region's ring datum for `makeRegionTopRingsLayer` — `ring` is a single
 * closed `[lng, lat]` boundary (see `ringsOf` in geo.ts, which DeckMap calls
 * to build this list once per `bundle.regionsMain` change). A MultiPolygon
 * region (or one with interior holes) contributes one item per part, each
 * carrying that region's `code`.
 */
export interface RegionTopRingDatum {
  code: string;
  ring: Ring;
}

export interface RegionTopRingsLayerOptions {
  /** Same injection point as `RegionsLayerOptions.elevationOf` — each ring floats 5m above its own region's top face. */
  elevationOf: (code: string) => number;
  /** The currently-selected 시군 code, or null when nothing is selected — the matching ring draws wider/brighter than the rest. */
  selectedCode: string | null;
  /** Included in `updateTriggers.getPath` — `elevationOf`'s output depends on the selected indicator, same as every other elevation-driven layer here. */
  triggerKey: string | number;
  /** deck.gl `transitions` duration (ms) for getPath. Defaults to 600. Task 6, Section A.4 — pass 0 when `prefers-reduced-motion: reduce`. */
  transitionDuration?: number;
}

/**
 * Task A — a top-face outline ring for EVERY 시군 at once (replaces the old,
 * per-selection `makeSelectedRingLayer`): `extruded: true` GeoJsonLayers have
 * no stroke sub-layer of their own (`stroked` is only honored when NOT
 * extruded — see `makeFootprintLayer`'s ground-level equivalent), so without
 * this, a region's block has no visible top edge at all. The selected
 * region's ring is simply drawn wider (2px vs 1px) and brighter/more opaque
 * than every other region's — no separate layer needed for that emphasis.
 *
 * `shadowEnabled: false` (this ring never casts a shadow onto neighboring
 * geometry) isn't part of PathLayer's public TS prop type — deck.gl's shadow
 * pass reads `layer.props.shadowEnabled` directly off the runtime props
 * object (`shouldDrawLayer` in the installed `@deck.gl/core`'s
 * shadow-pass.js), entirely bypassing whatever the TS type declares.
 * `PathLayer<DataT, ExtraPropsT>`'s own second generic parameter exists for
 * exactly this kind of experimental/runtime-only prop: explicitly
 * instantiating it here widens the constructor's expected prop shape
 * WITHOUT an `as unknown as ...` escape hatch.
 */
export function makeRegionTopRingsLayer(rings: RegionTopRingDatum[], opts: RegionTopRingsLayerOptions) {
  const { selectedCode } = opts;
  const transitionDuration = opts.transitionDuration ?? DEFAULT_TRANSITION_DURATION;

  return new PathLayer<RegionTopRingDatum, { shadowEnabled: boolean }>({
    id: "region-top-rings",
    data: rings,
    getPath: (d): Point3[] => d.ring.map(([x, y]) => [x, y, opts.elevationOf(d.code) + 5]),
    widthUnits: "pixels",
    getWidth: (d) => (d.code === selectedCode ? 2 : 1),
    getColor: (d): RGBA => (d.code === selectedCode ? [255, 255, 255, 230] : [236, 239, 245, 90]),
    jointRounded: true,
    shadowEnabled: false,
    pickable: false,
    updateTriggers: {
      getPath: [opts.triggerKey],
      getWidth: [selectedCode],
      getColor: [selectedCode],
    },
    transitions: {
      getPath: transitionDuration,
    },
  });
}
