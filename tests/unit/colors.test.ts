import { describe, expect, it } from "vitest";

import { NULL_COLOR, dim, makeColorScale, paletteFor, parseColor } from "@/lib/colors";
import type { IndicatorDef } from "@/lib/indicators/types";
import { formatInt } from "@/lib/format";

function def(overrides: Partial<IndicatorDef> = {}): IndicatorDef {
  return {
    id: "x",
    group: "scale",
    label: "x",
    unit: "명",
    polarity: "neutral",
    kind: "ratio",
    format: formatInt,
    source: { name: "KESS", url: "https://example.com", year: 2026 },
    aggregate: { kind: "sum", field: "students" },
    ...overrides,
  };
}

describe("parseColor", () => {
  it("parses an rgb(...) css string (interpolateOrRd/interpolateBlues format)", () => {
    expect(parseColor("rgb(253, 211, 161)")).toEqual([253, 211, 161]);
  });

  it("parses a #rrggbb hex string (interpolateViridis's actual output format)", () => {
    // Confirmed empirically against the installed d3-scale-chromatic@3.1.0:
    // interpolateViridis returns hex, not rgb(...), unlike interpolateOrRd/
    // interpolateBlues — see task-2-report.md.
    expect(parseColor("#3b528b")).toEqual([0x3b, 0x52, 0x8b]);
  });

  it("throws on an unrecognized format", () => {
    expect(() => parseColor("not-a-color")).toThrow();
  });
});

describe("paletteFor", () => {
  it("returns 5 [r,g,b] triples for every polarity", () => {
    for (const polarity of ["higherWorse", "higherBetter", "neutral"] as const) {
      const palette = paletteFor(polarity);
      expect(palette).toHaveLength(5);
      for (const rgb of palette) {
        expect(rgb).toHaveLength(3);
        for (const c of rgb) {
          expect(c).toBeGreaterThanOrEqual(0);
          expect(c).toBeLessThanOrEqual(255);
        }
      }
    }
  });

  it("does not throw for neutral (interpolateViridis's hex output must parse)", () => {
    expect(() => paletteFor("neutral")).not.toThrow();
  });

  it("uses a different palette per polarity", () => {
    const worse = paletteFor("higherWorse");
    const better = paletteFor("higherBetter");
    const neutral = paletteFor("neutral");
    expect(worse).not.toEqual(better);
    expect(worse).not.toEqual(neutral);
    expect(better).not.toEqual(neutral);
  });
});

describe("NULL_COLOR", () => {
  it("is a fixed gray, distinct from any palette step", () => {
    expect(NULL_COLOR).toEqual([90, 96, 110]);
  });
});

describe("makeColorScale", () => {
  const map = new Map<string, number | null>([
    ["52110", 0],
    ["52130", 25],
    ["52140", 50],
    ["52150", 75],
    ["52160", 100],
    ["52170", null],
  ]);

  it("quantizes into 5 steps drawn from the polarity's palette, alpha always 255", () => {
    const { colorOf } = makeColorScale(def({ polarity: "higherWorse", domain: [0, 100] }), map);
    const palette = paletteFor("higherWorse");
    const lowColor = colorOf("52110");
    const highColor = colorOf("52160");
    expect(lowColor).toEqual([...palette[0], 255]);
    expect(highColor).toEqual([...palette[4], 255]);
    expect(lowColor[3]).toBe(255);
  });

  it("returns NULL_COLOR with alpha 255 for a null value", () => {
    const { colorOf } = makeColorScale(def({ domain: [0, 100] }), map);
    expect(colorOf("52170")).toEqual([...NULL_COLOR, 255]);
  });

  it("returns NULL_COLOR for a code missing from the map", () => {
    const { colorOf } = makeColorScale(def({ domain: [0, 100] }), map);
    expect(colorOf("99999")).toEqual([...NULL_COLOR, 255]);
  });

  it("exposes ticks as the domain ends plus 4 interior thresholds (6 total)", () => {
    const { ticks } = makeColorScale(def({ domain: [0, 100] }), map);
    expect(ticks).toHaveLength(6);
    expect(ticks[0]).toBe(0);
    expect(ticks[5]).toBe(100);
    // Interior thresholds are strictly increasing between the domain ends.
    for (let i = 1; i < ticks.length; i++) {
      expect(ticks[i]).toBeGreaterThan(ticks[i - 1]);
    }
  });

  it("derives its domain the same way domainOf does (count floors at 0)", () => {
    const countMap = new Map<string, number | null>([
      ["52110", 10],
      ["52130", 100],
    ]);
    const { ticks } = makeColorScale(def({ kind: "count" }), countMap);
    expect(ticks[0]).toBe(0);
    expect(ticks[5]).toBe(100);
  });
});

describe("dim", () => {
  it("scales each channel by factor and rounds", () => {
    expect(dim([100, 200, 50], 0.5)).toEqual([50, 100, 25]);
  });

  it("clamps to the 0-255 byte range", () => {
    expect(dim([200, 200, 200], 2)).toEqual([255, 255, 255]);
    expect(dim([10, 10, 10], -1)).toEqual([0, 0, 0]);
  });
});
