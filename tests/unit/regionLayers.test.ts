import { describe, expect, it, vi } from "vitest";
import type { FeatureCollection, Polygon } from "geojson";
import type { Color } from "@deck.gl/core";

import type { RegionFeature } from "@/lib/geo/geo";
import {
  easeCubicOut,
  makeFootprintLayer,
  makeNeighborsLayer,
  makeRegionsLayer,
  makeSelectedRingLayer,
  SELECTED_BRIGHTEN,
  UNSELECTED_DIM,
} from "@/components/map/layers/regionLayers";
import { ELEVATION_FLOOR, ELEVATION_MAX, makeElevationScale } from "@/lib/scales";
import { dim, makeColorScale } from "@/lib/colors";
import { valueMap } from "@/lib/stats";
import type { IndicatorDef, IndicatorFile } from "@/lib/indicators/types";
import { formatInt } from "@/lib/format";

function regionsFixture(): FeatureCollection<Polygon, RegionFeature["properties"]> {
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { code: "52110", name: "전주시", bbox: [0, 0, 1, 1], labelPoint: [0.5, 0.5] },
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [0, 0],
              [1, 0],
              [1, 1],
              [0, 1],
              [0, 0],
            ],
          ],
        },
      },
      {
        type: "Feature",
        properties: { code: "52130", name: "군산시", bbox: [2, 0, 3, 1], labelPoint: [2.5, 0.5] },
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [2, 0],
              [3, 0],
              [3, 1],
              [2, 1],
              [2, 0],
            ],
          ],
        },
      },
    ],
  };
}

const featureA = regionsFixture().features[0];

describe("easeCubicOut", () => {
  it("maps 0 -> 0 and 1 -> 1", () => {
    expect(easeCubicOut(0)).toBe(0);
    expect(easeCubicOut(1)).toBe(1);
  });

  it("is monotonically increasing and matches the cubic-out formula", () => {
    expect(easeCubicOut(0.5)).toBeCloseTo(1 - Math.pow(0.5, 3), 10);
    expect(easeCubicOut(0.25)).toBeLessThan(easeCubicOut(0.75));
  });
});

describe("makeRegionsLayer", () => {
  it("is extruded, pickable, and auto-highlighting", () => {
    const layer = makeRegionsLayer(regionsFixture(), {
      elevationOf: () => 1000,
      fillColorOf: () => [1, 2, 3, 255],
      triggerKey: "v1",
    });
    expect(layer.props.id).toBe("regions");
    expect(layer.props.extruded).toBe(true);
    expect(layer.props.pickable).toBe(true);
    expect(layer.props.autoHighlight).toBe(true);
    expect(layer.props.highlightColor).toEqual([255, 255, 255, 60]);
  });

  it("getElevation/getFillColor delegate to the injected accessors, keyed by properties.code", () => {
    const elevationOf = vi.fn((code: string) => (code === "52110" ? 111 : 222));
    const fillColorOf = vi.fn(
      (code: string): [number, number, number, number] =>
        code === "52110" ? [10, 20, 30, 255] : [40, 50, 60, 255],
    );
    const layer = makeRegionsLayer(regionsFixture(), { elevationOf, fillColorOf, triggerKey: "v1" });

    const ctx = { index: 0, data: regionsFixture().features, target: [] };
    type Ctx = typeof ctx;
    // `getElevation`/`getFillColor` are typed as `Accessor<...>` (value | function);
    // these factories always pass a function, so the cast just recovers that for the test.
    const getElevation = layer.props.getElevation as (f: typeof featureA, ctx: Ctx) => number;
    const getFillColor = layer.props.getFillColor as (f: typeof featureA, ctx: Ctx) => Color;
    expect(getElevation(featureA, ctx)).toBe(111);
    expect(elevationOf).toHaveBeenCalledWith("52110");
    expect(getFillColor(featureA, ctx)).toEqual([10, 20, 30, 255]);
    expect(fillColorOf).toHaveBeenCalledWith("52110");
  });

  it("updateTriggers.getElevation/getFillColor include the triggerKey", () => {
    const layer = makeRegionsLayer(regionsFixture(), {
      elevationOf: () => 1,
      fillColorOf: () => [0, 0, 0, 255],
      triggerKey: "indicator-42",
    });
    expect(layer.props.updateTriggers.getElevation).toContain("indicator-42");
    expect(layer.props.updateTriggers.getFillColor).toContain("indicator-42");
  });

  it("uses the shared REGION_MATERIAL and a 600ms interpolation transition", () => {
    const layer = makeRegionsLayer(regionsFixture(), {
      elevationOf: () => 1,
      fillColorOf: () => [0, 0, 0, 255],
      triggerKey: "v1",
    });
    expect(layer.props.material).toEqual({
      ambient: 0.45,
      diffuse: 0.6,
      shininess: 24,
      specularColor: [0.15, 0.15, 0.15],
    });
    const transitions = layer.props.transitions as {
      getElevation: { duration: number; type: string };
      getFillColor: { duration: number };
    };
    expect(transitions.getElevation.duration).toBe(600);
    expect(transitions.getElevation.type).toBe("interpolation");
    expect(transitions.getFillColor.duration).toBe(600);
  });

  it("forwards clicks with the clicked feature's code", () => {
    const onClick = vi.fn();
    const layer = makeRegionsLayer(regionsFixture(), {
      elevationOf: () => 1,
      fillColorOf: () => [0, 0, 0, 255],
      triggerKey: "v1",
      onClick,
    });
    // @ts-expect-error — minimal PickingInfo stub for this unit test.
    layer.props.onClick({ object: featureA }, {});
    expect(onClick).toHaveBeenCalledWith("52110");
  });

  describe("selection-aware fillColorOf (Task 4A)", () => {
    const fillColorOf = vi.fn(
      (code: string): [number, number, number, number] =>
        code === "52110" ? [10, 20, 30, 255] : [40, 50, 60, 255],
    );

    it("passes fillColorOf's colors through unchanged when selectedCode is null (no selection)", () => {
      const layer = makeRegionsLayer(regionsFixture(), {
        elevationOf: () => 1,
        fillColorOf,
        triggerKey: "v1",
        selectedCode: null,
      });
      const ctx = { index: 0, data: regionsFixture().features, target: [] };
      type Ctx = typeof ctx;
      const getFillColor = layer.props.getFillColor as (f: typeof featureA, ctx: Ctx) => Color;
      expect(getFillColor(featureA, ctx)).toEqual([10, 20, 30, 255]);
    });

    it("brightens the selected region's color (alpha stays 255)", () => {
      const layer = makeRegionsLayer(regionsFixture(), {
        elevationOf: () => 1,
        fillColorOf,
        triggerKey: "v1",
        selectedCode: "52110",
      });
      const ctx = { index: 0, data: regionsFixture().features, target: [] };
      type Ctx = typeof ctx;
      const getFillColor = layer.props.getFillColor as (f: typeof featureA, ctx: Ctx) => Color;
      const [r, g, b, a] = getFillColor(featureA, ctx) as [number, number, number, number];
      const [er, eg, eb] = dim([10, 20, 30], SELECTED_BRIGHTEN);
      expect([r, g, b, a]).toEqual([er, eg, eb, 255]);
      // Genuinely brighter, not just "different" — and never dimmed.
      expect(r).toBeGreaterThanOrEqual(10);
      expect(a).toBe(255);
    });

    it("dims a non-selected region's color by exactly dim(rgb, 0.55), alpha stays 255", () => {
      const fixture = regionsFixture();
      const layer = makeRegionsLayer(fixture, {
        elevationOf: () => 1,
        fillColorOf,
        triggerKey: "v1",
        selectedCode: "52110", // fixture.features[1] (52130) is NOT selected
      });
      const ctx = { index: 0, data: fixture.features, target: [] };
      type Ctx = typeof ctx;
      const getFillColor = layer.props.getFillColor as (f: typeof featureA, ctx: Ctx) => Color;
      const [r, g, b, a] = getFillColor(fixture.features[1], ctx) as [number, number, number, number];
      const [er, eg, eb] = dim([40, 50, 60], UNSELECTED_DIM);
      expect([r, g, b, a]).toEqual([er, eg, eb, 255]);
      expect(a).toBe(255);
    });

    it("updateTriggers.getFillColor includes selectedCode (alongside triggerKey); getElevation is unaffected by selection", () => {
      const layer = makeRegionsLayer(regionsFixture(), {
        elevationOf: () => 1,
        fillColorOf,
        triggerKey: "v1",
        selectedCode: "52110",
      });
      expect(layer.props.updateTriggers.getFillColor).toContain("v1");
      expect(layer.props.updateTriggers.getFillColor).toContain("52110");
      expect(layer.props.updateTriggers.getElevation).toEqual(["v1"]);
    });

    it("updateTriggers.getFillColor reflects a null selectedCode too (deselecting must re-trigger)", () => {
      const layer = makeRegionsLayer(regionsFixture(), {
        elevationOf: () => 1,
        fillColorOf,
        triggerKey: "v1",
        selectedCode: null,
      });
      expect(layer.props.updateTriggers.getFillColor).toEqual(["v1", null]);
    });

    it("omitting selectedCode behaves the same as null (backward compatible with pre-4A call sites)", () => {
      const layer = makeRegionsLayer(regionsFixture(), {
        elevationOf: () => 1,
        fillColorOf,
        triggerKey: "v1",
      });
      const ctx = { index: 0, data: regionsFixture().features, target: [] };
      type Ctx = typeof ctx;
      const getFillColor = layer.props.getFillColor as (f: typeof featureA, ctx: Ctx) => Color;
      expect(getFillColor(featureA, ctx)).toEqual([10, 20, 30, 255]);
      expect(layer.props.updateTriggers.getFillColor).toEqual(["v1", null]);
    });
  });

  describe("wired to a real indicator (scales.ts/colors.ts), not a trivial mock", () => {
    function indicatorFixture(): IndicatorDef {
      return {
        id: "students_total",
        group: "scale",
        label: "학생수",
        unit: "명",
        polarity: "neutral",
        kind: "count",
        format: formatInt,
        source: { name: "KESS", url: "https://example.com", year: 2026 },
        aggregate: { kind: "sum", field: "students" },
        description: "테스트용 설명",
      };
    }

    function fileFixture(): IndicatorFile {
      return {
        id: "students_total",
        year: 2026,
        referenceDate: "2026-04-01",
        source: indicatorFixture().source,
        rows: [
          { regionCode: "52110", value: 100 }, // matches regionsFixture()'s first feature
          { regionCode: "52130", value: 0 }, // matches regionsFixture()'s second feature
          { regionCode: "52000", value: 100 },
        ],
      };
    }

    it("reflects the injected indicator's real values in getElevation, keyed by triggerKey=indicatorId", () => {
      const def = indicatorFixture();
      const map = valueMap(fileFixture());
      const elevationOf = makeElevationScale(def, map);
      const { colorOf } = makeColorScale(def, map);
      const fixture = regionsFixture();

      const layer = makeRegionsLayer(fixture, {
        elevationOf,
        fillColorOf: colorOf,
        triggerKey: def.id, // a real indicatorId, not an arbitrary "v1" string
      });

      const ctx = { index: 0, data: fixture.features, target: [] };
      type Ctx = typeof ctx;
      const getElevation = layer.props.getElevation as (f: typeof featureA, ctx: Ctx) => number;
      const getFillColor = layer.props.getFillColor as (f: typeof featureA, ctx: Ctx) => Color;

      // 52110 has the domain max (100 of [0,100]) -> tallest, brightest step.
      expect(getElevation(fixture.features[0], ctx)).toBeCloseTo(ELEVATION_MAX, 5);
      // 52130 has the domain min (0) -> the floor, not an arbitrary mock value.
      expect(getElevation(fixture.features[1], ctx)).toBeCloseTo(ELEVATION_FLOOR, 5);
      expect(getElevation(fixture.features[0], ctx)).toBeGreaterThan(getElevation(fixture.features[1], ctx));

      expect(getFillColor(fixture.features[0], ctx)).toEqual(colorOf("52110"));
      expect(getFillColor(fixture.features[1], ctx)).toEqual(colorOf("52130"));

      expect(layer.props.updateTriggers.getElevation).toContain("students_total");
      expect(layer.props.updateTriggers.getFillColor).toContain("students_total");
    });
  });
});

describe("makeSelectedRingLayer", () => {
  it("has empty data and is invisible when feature is null", () => {
    const layer = makeSelectedRingLayer(null, 1000);
    expect(layer.props.data).toEqual([]);
    expect(layer.props.visible).toBe(false);
  });

  it("projects each ring's points to [lng, lat, elevation+10] when given a feature", () => {
    const layer = makeSelectedRingLayer(featureA, 1000);
    expect(layer.props.visible).toBe(true);
    const data = layer.props.data as [number, number, number][][];
    expect(data).toHaveLength(1); // one ring, no holes
    expect(data[0][0]).toEqual([0, 0, 1010]);
  });
});

describe("makeNeighborsLayer", () => {
  it("is filled/stroked and not pickable", () => {
    const layer = makeNeighborsLayer({ type: "FeatureCollection", features: [] });
    expect(layer.props.id).toBe("neighbors");
    expect(layer.props.filled).toBe(true);
    expect(layer.props.stroked).toBe(true);
    expect(layer.props.getFillColor).toEqual([22, 27, 40]);
    expect(layer.props.getLineColor).toEqual([40, 48, 66]);
    expect(layer.props.lineWidthMinPixels).toBe(1);
    expect(layer.props.pickable).toBe(false);
  });
});

describe("makeFootprintLayer", () => {
  it("is a non-extruded, unfilled outline layer", () => {
    const layer = makeFootprintLayer(regionsFixture());
    expect(layer.props.id).toBe("footprint");
    expect(layer.props.extruded).toBe(false);
    expect(layer.props.filled).toBe(false);
    expect(layer.props.stroked).toBe(true);
    expect(layer.props.lineWidthUnits).toBe("pixels");
    expect(layer.props.getLineWidth).toBe(1);
    expect(layer.props.getLineColor).toEqual([90, 100, 125, 160]);
    expect(layer.props.pickable).toBe(false);
  });
});
