import { describe, expect, it } from "vitest";

import {
  CONTROLLER,
  fitOverview,
  fitRegion,
  OVERVIEW_BEARING,
  OVERVIEW_PITCH,
  PANEL_WIDTH,
  VIEW_LIMITS,
} from "@/components/map/camera";

// Roughly 전북's bbox (see public/data/regions.geojson after `npm run data:regions`).
const JB_BBOX: [number, number, number, number] = [125.97, 35.3, 127.91, 36.16];
const SIZE = { width: 1240, height: 900 };

describe("fitOverview", () => {
  it("returns a finite zoom within [minZoom, maxZoom]", () => {
    const viewState = fitOverview(JB_BBOX, SIZE);
    expect(Number.isFinite(viewState.zoom)).toBe(true);
    expect(viewState.zoom).toBeGreaterThanOrEqual(VIEW_LIMITS.minZoom);
    expect(viewState.zoom).toBeLessThanOrEqual(VIEW_LIMITS.maxZoom);
  });

  it("returns finite longitude/latitude roughly centered on the bbox", () => {
    const viewState = fitOverview(JB_BBOX, SIZE);
    expect(Number.isFinite(viewState.longitude)).toBe(true);
    expect(Number.isFinite(viewState.latitude)).toBe(true);
    expect(viewState.longitude).toBeGreaterThan(JB_BBOX[0]);
    expect(viewState.longitude).toBeLessThan(JB_BBOX[2]);
    expect(viewState.latitude).toBeGreaterThan(JB_BBOX[1]);
    expect(viewState.latitude).toBeLessThan(JB_BBOX[3]);
  });

  it("uses the fixed overview pitch/bearing and view limits", () => {
    const viewState = fitOverview(JB_BBOX, SIZE);
    expect(viewState.pitch).toBe(OVERVIEW_PITCH);
    expect(viewState.bearing).toBe(OVERVIEW_BEARING);
    expect(viewState.minZoom).toBe(VIEW_LIMITS.minZoom);
    expect(viewState.maxZoom).toBe(VIEW_LIMITS.maxZoom);
    expect(viewState.minPitch).toBe(VIEW_LIMITS.minPitch);
    expect(viewState.maxPitch).toBe(VIEW_LIMITS.maxPitch);
  });
});

describe("fitRegion", () => {
  it("returns a finite zoom, pitch 55, and a fly-to transition", () => {
    const bbox: [number, number, number, number] = [127.0, 35.7, 127.24, 35.9]; // ~전주시
    const viewState = fitRegion(bbox, SIZE);
    expect(Number.isFinite(viewState.zoom)).toBe(true);
    expect(viewState.pitch).toBe(55);
    expect(viewState.transitionDuration).toBe("auto");
    expect(viewState.transitionInterpolator).toBeDefined();
  });
});

describe("constants", () => {
  it("PANEL_WIDTH is 360", () => {
    expect(PANEL_WIDTH).toBe(360);
  });

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
