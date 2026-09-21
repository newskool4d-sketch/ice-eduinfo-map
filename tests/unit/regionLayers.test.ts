import { describe, expect, it, vi } from "vitest";
import type { FeatureCollection, Polygon } from "geojson";
import type { Color } from "@deck.gl/core";

import type { RegionFeature } from "@/lib/geo/geo";
import {
  easeCubicOut,
  makeFootprintLayer,
  makeIslandsLayer,
  makeNeighborsLayer,
  makeRegionsLayer,
  makeRegionTopRingsLayer,
} from "@/components/map/layers/regionLayers";
import { ELEVATION_FLOOR, ELEVATION_MAX, makeElevationScale } from "@/lib/scales";
import { makeColorScale, mix } from "@/lib/colors";
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
    // 밝은 디오라마 — hover darkens a pastel top face by ~10% (black @ 25/255)
    // instead of the dark theme's white wash.
    expect(layer.props.highlightColor).toEqual([0, 0, 0, 25]);
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
    // 밝은 디오라마 (lighting.ts, Task 2 fix round 1) — matte daylight material,
    // phong exposure with shadows off (specularColor on luma's byte scale).
    expect(layer.props.material).toEqual({
      ambient: 0.7,
      diffuse: 0.3,
      shininess: 8,
      specularColor: [20, 20, 20],
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

  describe("transitionDuration option (Task 6, Section A.4 — reduced motion)", () => {
    it("defaults to a 600ms transition when omitted", () => {
      const layer = makeRegionsLayer(regionsFixture(), {
        elevationOf: () => 1,
        fillColorOf: () => [0, 0, 0, 255],
        triggerKey: "v1",
      });
      const transitions = layer.props.transitions as {
        getElevation: { duration: number };
        getFillColor: { duration: number };
      };
      expect(transitions.getElevation.duration).toBe(600);
      expect(transitions.getFillColor.duration).toBe(600);
    });

    it("omits transitions entirely when transitionDuration: 0 (prefers-reduced-motion — no per-frame collision FBO re-render)", () => {
      const layer = makeRegionsLayer(regionsFixture(), {
        elevationOf: () => 1,
        fillColorOf: () => [0, 0, 0, 255],
        triggerKey: "v1",
        transitionDuration: 0,
      });
      expect(layer.props.transitions).toBeUndefined();
    });
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

    it("keeps the selected region's raw palette color — 원색 그대로 (alpha stays 255)", () => {
      const layer = makeRegionsLayer(regionsFixture(), {
        elevationOf: () => 1,
        fillColorOf,
        triggerKey: "v1",
        selectedCode: "52110",
      });
      const ctx = { index: 0, data: regionsFixture().features, target: [] };
      type Ctx = typeof ctx;
      const getFillColor = layer.props.getFillColor as (f: typeof featureA, ctx: Ctx) => Color;
      const color = getFillColor(featureA, ctx);
      expect(color).toEqual([10, 20, 30, 255]);
    });

    // 밝은 디오라마 — a non-selected region fades TOWARD the paper color
    // ([255,252,246]) rather than darkening: dim() on a pastel just muddies
    // it, whereas a paper fade keeps the hue and reads as "in the background".
    it("fades a non-selected region 45% toward paper, alpha stays 255", () => {
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
      const [er, eg, eb] = mix([40, 50, 60], [255, 252, 246], 0.45);
      expect([r, g, b, a]).toEqual([er, eg, eb, 255]);
      expect(a).toBe(255);
      // Genuinely lighter than the raw color (a fade toward paper), never darker.
      expect(r).toBeGreaterThan(40);
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

// Task A — replaces the old per-selection `makeSelectedRingLayer`: ALL 14
// 시군 now get a top-face outline ring (id "region-top-rings", a single
// PathLayer instead of one conditionally-visible layer), with the selected
// region's ring simply drawn wider/brighter than the rest.
describe("makeRegionTopRingsLayer", () => {
  const rings = [
    { code: "52110", ring: [[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]] as [number, number][] },
    { code: "52130", ring: [[2, 0], [3, 0], [3, 1], [2, 1], [2, 0]] as [number, number][] },
  ];

  it("is a non-pickable, rounded-joint PathLayer with id 'region-top-rings'", () => {
    const layer = makeRegionTopRingsLayer(rings, { elevationOf: () => 0, selectedCode: null, triggerKey: "v1" });
    expect(layer.props.id).toBe("region-top-rings");
    expect(layer.props.widthUnits).toBe("pixels");
    expect(layer.props.jointRounded).toBe(true);
    expect(layer.props.pickable).toBe(false);
    expect(layer.props.data).toBe(rings); // reference stability — see DeckMap's own `rings` useMemo
  });

  it("does not cast a shadow (shadowEnabled: false)", () => {
    const layer = makeRegionTopRingsLayer(rings, { elevationOf: () => 0, selectedCode: null, triggerKey: "v1" });
    expect(layer.props.shadowEnabled).toBe(false);
  });

  it("getPath appends elevationOf(code)+5 as the z coordinate for every point of the region's ring", () => {
    const elevationOf = vi.fn((code: string) => (code === "52110" ? 1000 : 2000));
    const layer = makeRegionTopRingsLayer(rings, { elevationOf, selectedCode: null, triggerKey: "v1" });
    type Datum = (typeof rings)[number];
    type Ctx = { index: number; data: Datum[]; target: number[] };
    const getPath = layer.props.getPath as unknown as (d: Datum, ctx: Ctx) => [number, number, number][];
    const ctx: Ctx = { index: 0, data: rings, target: [] };
    expect(getPath(rings[0], ctx)).toEqual([
      [0, 0, 1005],
      [1, 0, 1005],
      [1, 1, 1005],
      [0, 1, 1005],
      [0, 0, 1005],
    ]);
    expect(elevationOf).toHaveBeenCalledWith("52110");
  });

  it("getWidth is 2px for the selected region's ring, 1px for every other", () => {
    const layer = makeRegionTopRingsLayer(rings, { elevationOf: () => 0, selectedCode: "52110", triggerKey: "v1" });
    type Datum = (typeof rings)[number];
    type Ctx = { index: number; data: Datum[]; target: number[] };
    const getWidth = layer.props.getWidth as (d: Datum, ctx: Ctx) => number;
    const ctx: Ctx = { index: 0, data: rings, target: [] };
    expect(getWidth(rings[0], ctx)).toBe(2); // 52110 — selected
    expect(getWidth(rings[1], ctx)).toBe(1); // 52130 — not selected
  });

  // 밝은 디오라마 — ink-colored rings on pastel top faces: the selected
  // region's is near-opaque ink, every other a translucent gray.
  it("getColor is near-opaque ink for the selected region, translucent gray for every other", () => {
    const layer = makeRegionTopRingsLayer(rings, { elevationOf: () => 0, selectedCode: "52110", triggerKey: "v1" });
    type Datum = (typeof rings)[number];
    type Ctx = { index: number; data: Datum[]; target: number[] };
    const getColor = layer.props.getColor as unknown as (d: Datum, ctx: Ctx) => [number, number, number, number];
    const ctx: Ctx = { index: 0, data: rings, target: [] };
    expect(getColor(rings[0], ctx)).toEqual([28, 35, 49, 230]);
    expect(getColor(rings[1], ctx)).toEqual([60, 60, 70, 120]);
  });

  it("getWidth/getColor read as unselected (1px, dim) when selectedCode is null", () => {
    const layer = makeRegionTopRingsLayer(rings, { elevationOf: () => 0, selectedCode: null, triggerKey: "v1" });
    type Datum = (typeof rings)[number];
    type Ctx = { index: number; data: Datum[]; target: number[] };
    const getWidth = layer.props.getWidth as (d: Datum, ctx: Ctx) => number;
    const getColor = layer.props.getColor as unknown as (d: Datum, ctx: Ctx) => [number, number, number, number];
    const ctx: Ctx = { index: 0, data: rings, target: [] };
    expect(getWidth(rings[0], ctx)).toBe(1);
    expect(getColor(rings[0], ctx)).toEqual([60, 60, 70, 120]);
  });

  it("updateTriggers.getPath includes triggerKey; getWidth/getColor include selectedCode", () => {
    const layer = makeRegionTopRingsLayer(rings, {
      elevationOf: () => 0,
      selectedCode: "52110",
      triggerKey: "indicator-7",
    });
    expect(layer.props.updateTriggers.getPath).toContain("indicator-7");
    expect(layer.props.updateTriggers.getWidth).toContain("52110");
    expect(layer.props.updateTriggers.getColor).toContain("52110");
  });

  it("defaults to a 600ms getPath transition; a custom transitionDuration overrides it", () => {
    const defaultLayer = makeRegionTopRingsLayer(rings, { elevationOf: () => 0, selectedCode: null, triggerKey: "v1" });
    expect(defaultLayer.props.transitions).toMatchObject({ getPath: 600 });

    const instantLayer = makeRegionTopRingsLayer(rings, {
      elevationOf: () => 0,
      selectedCode: null,
      triggerKey: "v1",
      transitionDuration: 0,
    });
    expect(instantLayer.props.transitions).toBeUndefined(); // 0ms → omitted
  });
});

describe("makeNeighborsLayer", () => {
  it("is filled/stroked and not pickable", () => {
    const layer = makeNeighborsLayer({ type: "FeatureCollection", features: [] });
    expect(layer.props.id).toBe("neighbors");
    expect(layer.props.filled).toBe(true);
    expect(layer.props.stroked).toBe(true);
    expect(layer.props.lineWidthMinPixels).toBe(1);
    expect(layer.props.pickable).toBe(false);
  });

  // Task C — masked defaults to false (options omitted entirely, matching
  // every pre-Task-C call site) and renders the opaque backdrop. 밝은
  // 디오라마 (spec §2/§4): the backdrop is a warm light gray with a slightly
  // darker outline; the masked variant is a translucent white silhouette
  // (a touch brighter than the basemap wash) with a warm gray outline.
  describe("masked option (Task C — VWorld basemap)", () => {
    it("defaults to the opaque backdrop colors when masked is omitted", () => {
      const layer = makeNeighborsLayer({ type: "FeatureCollection", features: [] });
      expect(layer.props.getFillColor).toEqual([232, 228, 220]);
      expect(layer.props.getLineColor).toEqual([190, 182, 170]);
    });

    it("renders the same opaque backdrop colors when masked: false", () => {
      const layer = makeNeighborsLayer({ type: "FeatureCollection", features: [] }, { masked: false });
      expect(layer.props.getFillColor).toEqual([232, 228, 220]);
      expect(layer.props.getLineColor).toEqual([190, 182, 170]);
    });

    it("renders a translucent white mask when masked: true, so the basemap shows through", () => {
      const layer = makeNeighborsLayer({ type: "FeatureCollection", features: [] }, { masked: true });
      expect(layer.props.getFillColor).toEqual([255, 255, 255, 90]);
      expect(layer.props.getLineColor).toEqual([120, 110, 100, 120]);
    });

    it("updateTriggers.getFillColor/getLineColor include masked", () => {
      const maskedLayer = makeNeighborsLayer({ type: "FeatureCollection", features: [] }, { masked: true });
      expect(maskedLayer.props.updateTriggers.getFillColor).toEqual([true]);
      expect(maskedLayer.props.updateTriggers.getLineColor).toEqual([true]);

      const unmaskedLayer = makeNeighborsLayer({ type: "FeatureCollection", features: [] }, { masked: false });
      expect(unmaskedLayer.props.updateTriggers.getFillColor).toEqual([false]);
      expect(unmaskedLayer.props.updateTriggers.getLineColor).toEqual([false]);
    });
  });
});

describe("makeFootprintLayer", () => {
  // 밝은 디오라마 (spec §4) — the ground-level 바닥판 is now a filled paper plate
  // ([255,252,246]) with a warm gray outline, not just an outline.
  it("is a non-extruded, paper-filled, outlined base plate", () => {
    const layer = makeFootprintLayer(regionsFixture());
    expect(layer.props.id).toBe("footprint");
    expect(layer.props.extruded).toBe(false);
    expect(layer.props.filled).toBe(true);
    expect(layer.props.getFillColor).toEqual([255, 252, 246]);
    expect(layer.props.stroked).toBe(true);
    expect(layer.props.lineWidthUnits).toBe("pixels");
    expect(layer.props.getLineWidth).toBe(1);
    expect(layer.props.getLineColor).toEqual([200, 192, 180, 200]);
    expect(layer.props.pickable).toBe(false);
  });
});

// Task 6, Section C.1 — 섬은 평면으로: the flat sibling of `regions`, drawn
// for each region's non-largest MultiPolygon parts (see splitRegionIslands
// in geo.ts). Must match `regions`' own fillColorOf/selection behavior
// exactly (same visual color, just not extruded) and stay pickable so
// hover/click parity holds (getTooltip/handleRegionClick dispatch on
// `info.object.properties.code`, which every GeoJsonLayer feature carries
// regardless of layer id — no per-layer-id special-casing needed there).
describe("makeIslandsLayer", () => {
  it("is a flat (non-extruded), filled, pickable layer with id 'region-islands'", () => {
    const layer = makeIslandsLayer(regionsFixture(), {
      fillColorOf: () => [1, 2, 3, 255],
      triggerKey: "v1",
    });
    expect(layer.props.id).toBe("region-islands");
    expect(layer.props.extruded).toBe(false);
    expect(layer.props.filled).toBe(true);
    expect(layer.props.pickable).toBe(true);
    expect(layer.props.highlightColor).toEqual([0, 0, 0, 25]); // same hover darken as `regions`
  });

  it("getFillColor delegates to fillColorOf, keyed by properties.code", () => {
    const fillColorOf = vi.fn(
      (code: string): [number, number, number, number] =>
        code === "52110" ? [10, 20, 30, 255] : [40, 50, 60, 255],
    );
    const layer = makeIslandsLayer(regionsFixture(), { fillColorOf, triggerKey: "v1" });
    const ctx = { index: 0, data: regionsFixture().features, target: [] };
    type Ctx = typeof ctx;
    const getFillColor = layer.props.getFillColor as (f: typeof featureA, ctx: Ctx) => Color;
    expect(getFillColor(featureA, ctx)).toEqual([10, 20, 30, 255]);
    expect(fillColorOf).toHaveBeenCalledWith("52110");
  });

  it("applies the same selection rule as makeRegionsLayer (selected: raw color; others: 45% toward paper)", () => {
    const fillColorOf = (): [number, number, number, number] => [10, 20, 30, 255];
    const fixture = regionsFixture();
    const layer = makeIslandsLayer(fixture, { fillColorOf, triggerKey: "v1", selectedCode: "52110" });
    const ctx = { index: 0, data: fixture.features, target: [] };
    type Ctx = typeof ctx;
    const getFillColor = layer.props.getFillColor as (f: typeof featureA, ctx: Ctx) => Color;
    expect(getFillColor(featureA, ctx)).toEqual([10, 20, 30, 255]); // 52110 — selected
    const [er, eg, eb] = mix([10, 20, 30], [255, 252, 246], 0.45);
    expect(getFillColor(fixture.features[1], ctx)).toEqual([er, eg, eb, 255]); // 52130 — not selected
  });

  it("forwards clicks with the clicked feature's code, same as makeRegionsLayer", () => {
    const onClick = vi.fn();
    const layer = makeIslandsLayer(regionsFixture(), {
      fillColorOf: () => [0, 0, 0, 255],
      triggerKey: "v1",
      onClick,
    });
    // @ts-expect-error — minimal PickingInfo stub for this unit test.
    layer.props.onClick({ object: featureA }, {});
    expect(onClick).toHaveBeenCalledWith("52110");
  });

  it("updateTriggers.getFillColor includes triggerKey and selectedCode", () => {
    const layer = makeIslandsLayer(regionsFixture(), {
      fillColorOf: () => [0, 0, 0, 255],
      triggerKey: "indicator-42",
      selectedCode: "52110",
    });
    expect(layer.props.updateTriggers.getFillColor).toContain("indicator-42");
    expect(layer.props.updateTriggers.getFillColor).toContain("52110");
  });
});
