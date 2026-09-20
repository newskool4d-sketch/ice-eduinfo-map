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
  // Skewed like a real count-kind indicator: low/clustered values + 2 big
  // outliers (전주시-like). 7 distinct values (> palette.length/5) so this
  // fixture actually exercises the quantile branch — fix round 1/5,
  // finding 1: with palette.length (5) or fewer distinct values,
  // makeColorScale now falls back to 'linear' regardless of what's
  // requested (see the "tied values" describe block below), so a fixture
  // meant to exercise "quantile mode" needs MORE than 5 distinct values.
  const skewedCodes = ["52110", "52130", "52140", "52180", "52190", "52210", "52310"];
  const skewedMap = new Map<string, number | null>([
    ["52110", 1000],
    ["52130", 3],
    ["52140", 2],
    ["52180", 1],
    ["52190", 0],
    ["52210", 500],
    ["52310", 10],
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
    // Linear (equal-width [0,1000] buckets, width 200): 0/1/2/3/10 all fall
    // in the bottom bucket alongside each other — far fewer distinct colors
    // than quantile mode manages below, among the same 7 regions.
    expect(linearColors.size).toBeLessThan(5);

    const quantile = makeColorScale(def({ kind: "count" }), skewedMap, { colorBuckets: "quantile" });
    expect(quantile.colorBuckets).toBe("quantile"); // 7 distinct values > palette.length (5) — no fallback here
    const quantileColors = new Set(skewedCodes.map((c) => quantile.colorOf(c).join(",")));
    // Quantile (rank-based, over the 7 DEDUPLICATED distinct values): all 5
    // palette buckets get used, unlike linear's clustering above.
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

  // Fix round 1/5, finding 1 — the exact real-world dataset that exposed the
  // tie-bucketing bug: public/data/indicators/closed_schools_unused.json's
  // 14 시군 values as of this fix (only 5 distinct values, 6 of them tied at
  // the domain floor 0). Copied in directly rather than re-derived so this
  // regresses loudly even if the live data file's shape changes later.
  it("falls back to linear for the real closed_schools_unused dataset (exactly palette.length distinct values, heavy ties)", () => {
    const tiedValues = [0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 2, 8, 9];
    const tiedMap = new Map<string, number | null>(tiedValues.map((value, i) => [`code-${i}`, value]));
    const testDef = def({ kind: "count", polarity: "higherWorse" });

    // Quantile was never even asked for here (count-kind defaults to it) —
    // this is the data-driven fallback, not an opt-out.
    const scale = makeColorScale(testDef, tiedMap);
    expect(scale.colorBuckets).toBe("linear");
    expect(scale.ticks).toHaveLength(6);
    for (let i = 1; i < scale.ticks.length; i++) {
      expect(scale.ticks[i]).toBeGreaterThan(scale.ticks[i - 1]);
    }
    // The regression this fix targets: a value tied at the domain floor
    // must reach the FIRST palette color, not skip straight to the second.
    const palette = paletteFor("higherWorse");
    expect(scale.colorOf("code-0")).toEqual([...palette[0], 255]);

    // An explicit request for quantile is overridden by the same
    // data-driven fallback (Task 6, Section C-추가 #5's `opts.colorBuckets`
    // is a request, not a guarantee — see ColorScaleOptions' doc comment).
    const requested = makeColorScale(testDef, tiedMap, { colorBuckets: "quantile" });
    expect(requested.colorBuckets).toBe("linear");
  });

  it("uses quantile with strictly increasing ticks and all 5 colors for a 14-distinct-value dataset", () => {
    const distinct14 = [10, 20, 30, 40, 50, 60, 70, 80, 90, 200, 400, 700, 1000, 2000];
    const map14 = new Map<string, number | null>(distinct14.map((value, i) => [`code-${i}`, value]));
    const scale = makeColorScale(def({ kind: "count" }), map14);

    expect(scale.colorBuckets).toBe("quantile");
    expect(scale.ticks).toHaveLength(6);
    for (let i = 1; i < scale.ticks.length; i++) {
      expect(scale.ticks[i]).toBeGreaterThan(scale.ticks[i - 1]);
    }
    const colorsUsed = new Set(distinct14.map((_, i) => scale.colorOf(`code-${i}`).join(",")));
    expect(colorsUsed.size).toBe(5);
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
