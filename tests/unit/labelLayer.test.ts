import { describe, expect, it, vi } from "vitest";
import type { Position } from "@deck.gl/core";

import { makeRegionLabelLayer, type RegionLabel } from "@/components/map/layers/labelLayer";

const labels: RegionLabel[] = [
  { code: "52110", name: "전주시", position: [127.1, 35.8] },
  { code: "52130", name: "군산시", position: [126.7, 35.9] },
];

describe("makeRegionLabelLayer", () => {
  it("is a billboard text layer with the given fontFamily/characterSet", () => {
    const layer = makeRegionLabelLayer(labels, {
      elevationOf: () => 0,
      textOf: (code) => code,
      triggerKey: "v1",
      fontFamily: "Test Font",
      characterSet: ["a", "b"],
    });
    expect(layer.props.id).toBe("region-labels");
    expect(layer.props.billboard).toBe(true);
    expect(layer.props.fontFamily).toBe("Test Font");
    expect(layer.props.characterSet).toEqual(["a", "b"]);
    expect(layer.props.fontWeight).toBe(600);
    expect(layer.props.getAlignmentBaseline).toBe("bottom");
    expect(layer.props.fontSettings).toEqual({ sdf: true, fontSize: 48 });
    expect(layer.props.outlineWidth).toBe(0.15);
  });

  it("getPosition appends elevationOf(code)+200 as the z coordinate", () => {
    const elevationOf = vi.fn((code: string) => (code === "52110" ? 1000 : 2000));
    const layer = makeRegionLabelLayer(labels, {
      elevationOf,
      textOf: (code) => code,
      triggerKey: "v1",
      fontFamily: "Test Font",
      characterSet: ["a"],
    });
    type Ctx = { index: number; data: RegionLabel[]; target: number[] };
    const getPosition = layer.props.getPosition as (d: RegionLabel, ctx: Ctx) => Position;
    const ctx: Ctx = { index: 0, data: labels, target: [] };
    expect(getPosition(labels[0], ctx)).toEqual([127.1, 35.8, 1200]);
    expect(elevationOf).toHaveBeenCalledWith("52110");
  });

  it("getText delegates to textOf(code)", () => {
    const textOf = vi.fn((code: string) => `${code}!`);
    const layer = makeRegionLabelLayer(labels, {
      elevationOf: () => 0,
      textOf,
      triggerKey: "v1",
      fontFamily: "Test Font",
      characterSet: ["a"],
    });
    type Ctx = { index: number; data: RegionLabel[]; target: number[] };
    const getText = layer.props.getText as (d: RegionLabel, ctx: Ctx) => string;
    const ctx: Ctx = { index: 0, data: labels, target: [] };
    expect(getText(labels[1], ctx)).toBe("52130!");
  });

  it("updateTriggers include the triggerKey for both getPosition and getText", () => {
    const layer = makeRegionLabelLayer(labels, {
      elevationOf: () => 0,
      textOf: (code) => code,
      triggerKey: "indicator-7",
      fontFamily: "Test Font",
      characterSet: ["a"],
    });
    expect(layer.props.updateTriggers.getPosition).toContain("indicator-7");
    expect(layer.props.updateTriggers.getText).toContain("indicator-7");
  });

  // 추가 요구 #2: labels must always draw on top of a taller neighboring
  // region, not get depth-tested away behind it. `depthCompare: 'always'`
  // (not `depthWriteEnabled: false` alone — that only stops the label from
  // *writing* depth, it would still be *tested* against and hidden by an
  // already-drawn taller neighbor) makes every fragment pass the depth test
  // unconditionally; confirmed against the installed luma.gl@9.4 types
  // (CompareFunction in @luma.gl/core's adapter/types/parameters.d.ts) and
  // against @deck.gl/core's CompositeLayer.getSubLayerProps, which forwards
  // `this.props.parameters` verbatim to every sub-layer TextLayer renders
  // (MultiIconLayer for characters, TextBackgroundLayer for background) — so
  // setting it once here on the outer TextLayer is sufficient.
  it("disables the depth test so labels always draw on top (추가 요구 #2)", () => {
    const layer = makeRegionLabelLayer(labels, {
      elevationOf: () => 0,
      textOf: (code) => code,
      triggerKey: "v1",
      fontFamily: "Test Font",
      characterSet: ["a"],
    });
    expect(layer.props.parameters).toMatchObject({
      depthCompare: "always",
      depthWriteEnabled: false,
    });
  });
});
