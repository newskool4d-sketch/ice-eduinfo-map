import { FlyToInterpolator, WebMercatorViewport } from "@deck.gl/core";

import type { Bbox } from "@/lib/geo/geo";

export const OVERVIEW_PITCH = 50;
export const OVERVIEW_BEARING = -15;

export const VIEW_LIMITS = {
  minZoom: 7.5,
  maxZoom: 12,
  minPitch: 0,
  maxPitch: 60,
} as const;

// deck.gl 9.4's MapController accepts `maxBounds`/`rubberBand` directly (see
// ControllerOptions in @deck.gl/core/dist/controllers/controller.d.ts) — no
// type augmentation needed.
export const CONTROLLER = {
  dragRotate: true,
  doubleClickZoom: false,
  keyboard: false,
  inertia: 300,
  maxBounds: [
    [125.6, 34.7],
    [128.7, 36.7],
  ] as [[number, number], [number, number]],
  rubberBand: true,
};

type Size = { width: number; height: number };
type LngLat = readonly [number, number];

function bboxCorners(bbox: Bbox): LngLat[] {
  const [minLng, minLat, maxLng, maxLat] = bbox;
  return [
    [minLng, minLat],
    [maxLng, minLat],
    [maxLng, maxLat],
    [minLng, maxLat],
  ];
}

export interface FitViewOptions {
  pitch: number;
  bearing: number;
  /** Minimum on-screen distance (px) from every point to the canvas edge. */
  padding: number;
  minZoom: number;
  maxZoom: number;
}

type FitResult = { longitude: number; latitude: number; zoom: number };

function isContained(
  viewport: WebMercatorViewport,
  points: readonly LngLat[],
  size: Size,
  padding: number,
): boolean {
  for (const point of points) {
    const [x, y] = viewport.project([point[0], point[1]]);
    if (x < padding || x > size.width - padding || y < padding || y > size.height - padding) {
      return false;
    }
  }
  return true;
}

/**
 * Fits a camera to a set of ground points (e.g. a bbox's corners, plus any
 * label anchor points that must also stay on-screen) at a *fixed, non-zero*
 * pitch/bearing.
 *
 * `WebMercatorViewport.fitBounds()` is flat-only (its own type doc says
 * "Only supports non-perspective mode": it always computes for pitch 0 /
 * bearing 0, regardless of what's passed into the constructor beforehand —
 * verified directly against @deck.gl/core 9.4.0). Tilting and rotating the
 * camera afterward, uncompensated, changes what's actually visible within
 * the same frustum — corners of the flat-fit bbox can end up clipped outside
 * the canvas. This function starts from that flat fit as a reasonable
 * initial guess, then iteratively corrects for the pitch/bearing by
 * projecting every input point through a *pitched* viewport and:
 *   1. zooming out (in 0.05 steps, down to `minZoom`) until every point's
 *      projected pixel position falls within the padded frame, then
 *   2. re-centering on the pixel-space bounding-box center of the
 *      (now-contained) projected points, by unprojecting that pixel back to
 *      a ground [lng, lat] and using it as the new camera target.
 * Steps 1-2 together are one "pass"; a handful of passes converge quickly in
 * practice (re-centering shifts the projected pixel positions only a little
 * each time) — capped at 3 passes regardless.
 */
export function fitViewToPoints(points: readonly LngLat[], size: Size, opts: FitViewOptions): FitResult {
  const { pitch, bearing, padding, minZoom, maxZoom } = opts;

  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;
  for (const [lng, lat] of points) {
    if (lng < minLng) minLng = lng;
    if (lat < minLat) minLat = lat;
    if (lng > maxLng) maxLng = lng;
    if (lat > maxLat) maxLat = lat;
  }

  const flat = new WebMercatorViewport({ width: size.width, height: size.height }).fitBounds(
    [
      [minLng, minLat],
      [maxLng, maxLat],
    ],
    { padding },
  );

  let longitude = flat.longitude;
  let latitude = flat.latitude;
  let zoom = Math.min(flat.zoom, maxZoom);

  const RECENTER_PASSES = 3;
  const ZOOM_STEP = 0.05;

  for (let pass = 0; pass < RECENTER_PASSES; pass++) {
    let viewport = new WebMercatorViewport({ width: size.width, height: size.height, longitude, latitude, zoom, pitch, bearing });

    while (!isContained(viewport, points, size, padding)) {
      if (zoom <= minZoom) break;
      zoom = Math.max(minZoom, zoom - ZOOM_STEP);
      viewport = new WebMercatorViewport({ width: size.width, height: size.height, longitude, latitude, zoom, pitch, bearing });
    }

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const point of points) {
      const [x, y] = viewport.project([point[0], point[1]]);
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
    const [newLng, newLat] = viewport.unproject([(minX + maxX) / 2, (minY + maxY) / 2]);
    longitude = newLng;
    latitude = newLat;
  }

  return { longitude, latitude, zoom };
}

/** The subset of a deck.gl MapViewState this module produces. */
type OverviewViewState = {
  longitude: number;
  latitude: number;
  zoom: number;
  pitch: number;
  bearing: number;
} & typeof VIEW_LIMITS;

/**
 * Computes the camera view state that frames `bbox` (e.g. `unionBbox` of all
 * 14 regions) and every region's label point in the overview camera style
 * (pitch 50 / bearing -15), used for DeckMap's initial (uncontrolled)
 * `initialViewState`. Label points are included (not just the bbox corners)
 * because a region's tallest/farthest label can otherwise land outside the
 * frame even when the polygon bbox itself just barely fits.
 */
export function fitOverview(bbox: Bbox, labelPoints: readonly LngLat[], size: Size): OverviewViewState {
  const points = [...bboxCorners(bbox), ...labelPoints];
  const { longitude, latitude, zoom } = fitViewToPoints(points, size, {
    pitch: OVERVIEW_PITCH,
    bearing: OVERVIEW_BEARING,
    padding: 60,
    minZoom: VIEW_LIMITS.minZoom,
    maxZoom: VIEW_LIMITS.maxZoom,
  });
  return {
    longitude,
    latitude,
    zoom,
    pitch: OVERVIEW_PITCH,
    bearing: OVERVIEW_BEARING,
    ...VIEW_LIMITS,
  };
}

type RegionViewState = OverviewViewState & {
  transitionInterpolator: FlyToInterpolator;
  transitionDuration: "auto";
};

const FIT_REGION_PITCH = 55;

/**
 * Computes the camera view state that flies to a single selected region's
 * bbox (pitch 55, closer padding, capped zoom). Wired up by useCamera.ts's
 * `flyTo`, called whenever `selectedCode` changes (or is re-selected).
 */
export function fitRegion(bbox: Bbox, size: Size): RegionViewState {
  const { longitude, latitude, zoom } = fitViewToPoints(bboxCorners(bbox), size, {
    pitch: FIT_REGION_PITCH,
    bearing: OVERVIEW_BEARING,
    padding: 80,
    minZoom: VIEW_LIMITS.minZoom,
    maxZoom: 10.5,
  });
  return {
    longitude,
    latitude,
    zoom,
    pitch: FIT_REGION_PITCH,
    bearing: OVERVIEW_BEARING,
    ...VIEW_LIMITS,
    transitionInterpolator: new FlyToInterpolator({ speed: 1.5 }),
    transitionDuration: "auto",
  };
}
