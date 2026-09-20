import { describe, expect, it } from "vitest";
import { WebMercatorViewport } from "@deck.gl/core";

import {
  CONTROLLER,
  fitOverview,
  fitRegion,
  fitViewToPoints,
  OVERVIEW_BEARING,
  OVERVIEW_PITCH,
  VIEW_LIMITS,
} from "@/components/map/camera";

// Roughly 전북's bbox (see public/data/regions.geojson after `npm run data:regions`).
const JB_BBOX: [number, number, number, number] = [125.97, 35.3, 127.91, 36.16];
const SIZE = { width: 1600, height: 900 };
const PADDING = 60;

function bboxCorners([minLng, minLat, maxLng, maxLat]: [number, number, number, number]) {
  return [
    [minLng, minLat],
    [maxLng, minLat],
    [maxLng, maxLat],
    [minLng, maxLat],
  ] as const;
}

/** Projects every point through a viewport built from `viewState` and asserts it's within the padded frame. */
function expectAllContained(
  points: readonly (readonly [number, number])[],
  viewState: { longitude: number; latitude: number; zoom: number; pitch: number; bearing: number },
  size: typeof SIZE,
  padding: number,
) {
  const viewport = new WebMercatorViewport({
    width: size.width,
    height: size.height,
    longitude: viewState.longitude,
    latitude: viewState.latitude,
    zoom: viewState.zoom,
    pitch: viewState.pitch,
    bearing: viewState.bearing,
  });
  for (const point of points) {
    const [x, y] = viewport.project([point[0], point[1]]);
    expect(x).toBeGreaterThanOrEqual(padding);
    expect(x).toBeLessThanOrEqual(size.width - padding);
    expect(y).toBeGreaterThanOrEqual(padding);
    expect(y).toBeLessThanOrEqual(size.height - padding);
  }
}

describe("fitViewToPoints", () => {
  it("keeps every corner of a synthetic bbox inside the padded frame at pitch 50 / bearing -15", () => {
    const corners = bboxCorners(JB_BBOX);
    const result = fitViewToPoints(corners, SIZE, {
      pitch: 50,
      bearing: -15,
      padding: PADDING,
      minZoom: VIEW_LIMITS.minZoom,
      maxZoom: VIEW_LIMITS.maxZoom,
    });

    expect(result.zoom).toBeGreaterThanOrEqual(VIEW_LIMITS.minZoom);
    expect(result.zoom).toBeLessThanOrEqual(VIEW_LIMITS.maxZoom);
    expectAllContained(corners, { ...result, pitch: 50, bearing: -15 }, SIZE, PADDING);
  });

  it("does not exceed maxZoom even for a single (degenerate) point", () => {
    const result = fitViewToPoints([[127.1, 35.8]], SIZE, {
      pitch: 50,
      bearing: -15,
      padding: PADDING,
      minZoom: VIEW_LIMITS.minZoom,
      maxZoom: VIEW_LIMITS.maxZoom,
    });
    expect(result.zoom).toBeLessThanOrEqual(VIEW_LIMITS.maxZoom);
    expect(Number.isFinite(result.longitude)).toBe(true);
    expect(Number.isFinite(result.latitude)).toBe(true);
  });
});

describe("fitOverview", () => {
  it("returns a finite zoom within [minZoom, maxZoom]", () => {
    const viewState = fitOverview(JB_BBOX, [], SIZE);
    expect(Number.isFinite(viewState.zoom)).toBe(true);
    expect(viewState.zoom).toBeGreaterThanOrEqual(VIEW_LIMITS.minZoom);
    expect(viewState.zoom).toBeLessThanOrEqual(VIEW_LIMITS.maxZoom);
  });

  it("returns finite longitude/latitude roughly centered on the bbox", () => {
    const viewState = fitOverview(JB_BBOX, [], SIZE);
    expect(Number.isFinite(viewState.longitude)).toBe(true);
    expect(Number.isFinite(viewState.latitude)).toBe(true);
    expect(viewState.longitude).toBeGreaterThan(JB_BBOX[0]);
    expect(viewState.longitude).toBeLessThan(JB_BBOX[2]);
    expect(viewState.latitude).toBeGreaterThan(JB_BBOX[1]);
    expect(viewState.latitude).toBeLessThan(JB_BBOX[3]);
  });

  it("uses the fixed overview pitch/bearing and view limits", () => {
    const viewState = fitOverview(JB_BBOX, [], SIZE);
    expect(viewState.pitch).toBe(OVERVIEW_PITCH);
    expect(viewState.bearing).toBe(OVERVIEW_BEARING);
    expect(viewState.minZoom).toBe(VIEW_LIMITS.minZoom);
    expect(viewState.maxZoom).toBe(VIEW_LIMITS.maxZoom);
    expect(viewState.minPitch).toBe(VIEW_LIMITS.minPitch);
    expect(viewState.maxPitch).toBe(VIEW_LIMITS.maxPitch);
  });

  it("keeps the bbox corners AND every label point inside the padded canvas (the acceptance bar: nothing clipped)", () => {
    // Worst-case-ish label points: at/near the bbox edges, like a region
    // whose labelPoint sits close to 전북's outer boundary (e.g. 부안군/고창군
    // on the west coast, 무주군/장수군 to the east).
    const labelPoints: [number, number][] = [
      [JB_BBOX[0] + 0.02, JB_BBOX[1] + 0.02],
      [JB_BBOX[2] - 0.02, JB_BBOX[3] - 0.02],
      [126.65, 35.68], // ~부안군
      [127.72, 35.83], // ~무주군
      [127.17, 35.82], // ~전주시 (interior)
    ];
    const viewState = fitOverview(JB_BBOX, labelPoints, SIZE);
    expectAllContained([...bboxCorners(JB_BBOX), ...labelPoints], viewState, SIZE, 60);
  });
});

describe("fitRegion", () => {
  const REGION_BBOX: [number, number, number, number] = [127.0, 35.7, 127.24, 35.9]; // ~전주시

  it("returns a finite zoom, pitch 55, and a fly-to transition", () => {
    const viewState = fitRegion(REGION_BBOX, SIZE);
    expect(Number.isFinite(viewState.zoom)).toBe(true);
    expect(viewState.pitch).toBe(55);
    expect(viewState.transitionDuration).toBe("auto");
    expect(viewState.transitionInterpolator).toBeDefined();
  });

  it("keeps the region's bbox corners inside the padded canvas at pitch 55", () => {
    const viewState = fitRegion(REGION_BBOX, SIZE);
    expectAllContained(bboxCorners(REGION_BBOX), viewState, SIZE, 80);
  });
});

describe("constants", () => {
  it("CONTROLLER carries the specified interaction options", () => {
    expect(CONTROLLER.dragRotate).toBe(true);
    expect(CONTROLLER.doubleClickZoom).toBe(false);
    expect(CONTROLLER.keyboard).toBe(false);
    expect(CONTROLLER.inertia).toBe(300);
    expect(CONTROLLER.maxBounds).toEqual([
      [125.6, 34.7],
      [128.7, 36.7],
    ]);
    expect(CONTROLLER.rubberBand).toBe(true);
  });
});
