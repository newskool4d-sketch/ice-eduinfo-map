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
    description: "테스트용 설명",
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

// Task 6, Section C-추가 #5 — count 지표 색 구간: count-kind indicators' 14
// 시군 values skew hard toward 전주시, so equal-WIDTH linear buckets leave
// most regions in the bottom step. Color buckets switch to quantile
// (equal-COUNT) for count-kind by default; height/domain stay linear
// (unaffected — this option only ever changes `colorOf`/`ticks`, never
// `domainOf`/makeElevationScale).
describe("makeColorScale — colorBuckets option (Task 6, Section C-추가 #5)", () => {
  // Skewed like a real count-kind indicator: 4 low/clustered values + 1 big
  // outlier (전주시-like).
  const skewedCodes = ["52110", "52130", "52140", "52180", "52190"];
  const skewedMap = new Map<string, number | null>([
    ["52110", 1000],
    ["52130", 3],
    ["52140", 2],
    ["52180", 1],
    ["52190", 0],
  ]);

  it("count-kind indicators default to quantile bucketing", () => {
    const { colorBuckets } = makeColorScale(def({ kind: "count" }), skewedMap);
    expect(colorBuckets).toBe("quantile");
  });

  it("ratio-kind indicators default to linear bucketing", () => {
    const { colorBuckets } = makeColorScale(def({ kind: "ratio" }), skewedMap);
    expect(colorBuckets).toBe("linear");
  });

  it("an explicit colorBuckets option overrides the kind-based default", () => {
    expect(makeColorScale(def({ kind: "ratio" }), skewedMap, { colorBuckets: "quantile" }).colorBuckets).toBe(
      "quantile",
    );
    expect(makeColorScale(def({ kind: "count" }), skewedMap, { colorBuckets: "linear" }).colorBuckets).toBe(
      "linear",
    );
  });

  it("quantile mode spreads a skewed dataset across distinct color buckets (linear clusters most into the bottom one)", () => {
    const linear = makeColorScale(def({ kind: "count" }), skewedMap, { colorBuckets: "linear" });
    const linearColors = new Set(skewedCodes.map((c) => linear.colorOf(c).join(",")));
    // Linear (equal-width [0,1000] buckets): 0/1/2/3 all fall in the bottom
    // 200-wide bucket alongside each other — at most 2 distinct colors
    // among the 5 regions (bottom bucket + the outlier's own top bucket).
    expect(linearColors.size).toBeLessThanOrEqual(2);

    const quantile = makeColorScale(def({ kind: "count" }), skewedMap, { colorBuckets: "quantile" });
    const quantileColors = new Set(skewedCodes.map((c) => quantile.colorOf(c).join(",")));
    // Quantile (rank-based, 5 distinct values / 5 buckets): every region
    // lands in its own bucket.
    expect(quantileColors.size).toBe(5);
  });

  it("still exposes 6 ticks (domain ends + 4 interior boundaries) — height/domain unaffected by bucket mode", () => {
    const { ticks } = makeColorScale(def({ kind: "count" }), skewedMap, { colorBuckets: "quantile" });
    expect(ticks).toHaveLength(6);
    expect(ticks[0]).toBe(0); // count-kind floors at 0, same domainOf() the elevation scale uses
    expect(ticks[5]).toBe(1000);
  });

  it("null values are still NULL_COLOR under quantile mode", () => {
    const map = new Map<string, number | null>([
      ["52110", 5],
      ["52130", null],
    ]);
    const { colorOf } = makeColorScale(def({ kind: "count" }), map);
    expect(colorOf("52130")).toEqual([...NULL_COLOR, 255]);
  });

  it("does not throw when every value is null (empty quantile domain fallback)", () => {
    const map = new Map<string, number | null>([
      ["52110", null],
      ["52130", null],
    ]);
    expect(() => makeColorScale(def({ kind: "count", domain: [0, 10] }), map)).not.toThrow();
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
