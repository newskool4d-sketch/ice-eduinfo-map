import { FlyToInterpolator, WebMercatorViewport } from "@deck.gl/core";

import type { Bbox } from "@/lib/geo/geo";

/** Width (px) reserved for the dashboard's right-hand info panel (see Dashboard.tsx). */
export const PANEL_WIDTH = 360;

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
 * 14 regions) in the overview camera style (pitch 50 / bearing -15), used
 * for DeckMap's initial (uncontrolled) `initialViewState`.
 */
export function fitOverview(bbox: Bbox, size: Size): OverviewViewState {
  const [minLng, minLat, maxLng, maxLat] = bbox;
  const viewport = new WebMercatorViewport({
    width: size.width,
    height: size.height,
  }).fitBounds(
    [
      [minLng, minLat],
      [maxLng, maxLat],
    ],
    { padding: 60 },
  );
  return {
    longitude: viewport.longitude,
    latitude: viewport.latitude,
    zoom: viewport.zoom,
    pitch: OVERVIEW_PITCH,
    bearing: OVERVIEW_BEARING,
    ...VIEW_LIMITS,
  };
}

type RegionViewState = OverviewViewState & {
  transitionInterpolator: FlyToInterpolator;
  transitionDuration: "auto";
};

/**
 * Computes the camera view state that flies to a single selected region's
 * bbox (pitch 55, closer padding, capped zoom). Not wired up by DeckMap yet
 * (region selection lands in a later task) — built now per the task brief so
 * the next task doesn't also have to design the camera transition.
 */
export function fitRegion(bbox: Bbox, size: Size): RegionViewState {
  const [minLng, minLat, maxLng, maxLat] = bbox;
  const viewport = new WebMercatorViewport({
    width: size.width,
    height: size.height,
  }).fitBounds(
    [
      [minLng, minLat],
      [maxLng, maxLat],
    ],
    { padding: 80, maxZoom: 10.5 },
  );
  return {
    longitude: viewport.longitude,
    latitude: viewport.latitude,
    zoom: viewport.zoom,
    pitch: 55,
    bearing: OVERVIEW_BEARING,
    ...VIEW_LIMITS,
    transitionInterpolator: new FlyToInterpolator({ speed: 1.5 }),
    transitionDuration: "auto",
  };
}
