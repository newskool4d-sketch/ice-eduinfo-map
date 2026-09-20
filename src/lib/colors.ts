/**
 * Pure value -> fill-color scale for the extruded 3D map. No React import.
 */
import { scaleQuantile, scaleQuantize } from "d3-scale";
import { interpolateBlues, interpolateOrRd, interpolateViridis } from "d3-scale-chromatic";

import { domainOf } from "./scales";
import { regionValues } from "./stats";
import type { IndicatorDef, Polarity } from "./indicators/types";

export type RGB = [number, number, number];
export type RGBA = [number, number, number, number];

/** Fixed gray for a missing (null) value — never sampled from a data palette. */
export const NULL_COLOR: RGB = [90, 96, 110];

// [0.25, 0.95] (not [0, 1]): the lightest step of any of these interpolators
// is close to white, which fades into this app's light-on-dark map chrome;
// starting at 0.25 keeps even the lowest bucket visibly distinct. Capping at
// 0.95 (not 1.0) avoids the darkest, near-black extreme for the same reason
// in reverse (interpolateViridis's high end is bright yellow, not dark, but
// OrRd/Blues both go very dark at t=1).
const PALETTE_SAMPLE_T = [0.25, 0.425, 0.6, 0.775, 0.95] as const;

const RGB_FUNC_PATTERN = /^rgba?\((\d+),\s*(\d+),\s*(\d+)/;
const HEX_PATTERN = /^#([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})$/;

/**
 * Parses a d3-scale-chromatic interpolator's output into [r,g,b].
 *
 * These interpolators are NOT consistent in their output format:
 * interpolateOrRd/interpolateBlues return `rgb(r, g, b)` strings, but
 * interpolateViridis returns `#rrggbb` hex strings instead (it's backed by a
 * precomputed color table via interpolateRgbBasis, not a two/three-color rgb
 * interpolation — confirmed empirically against the installed
 * d3-scale-chromatic@3.1.0; see task-2-report.md). Handling both formats
 * here is what keeps paletteFor('neutral') correct.
 */
export function parseColor(css: string): RGB {
  const rgbMatch = RGB_FUNC_PATTERN.exec(css);
  if (rgbMatch) {
    return [Number(rgbMatch[1]), Number(rgbMatch[2]), Number(rgbMatch[3])];
  }
  const hexMatch = HEX_PATTERN.exec(css);
  if (hexMatch) {
    return [parseInt(hexMatch[1], 16), parseInt(hexMatch[2], 16), parseInt(hexMatch[3], 16)];
  }
  throw new Error(`parseColor: unrecognized color format "${css}"`);
}

function interpolatorFor(polarity: Polarity): (t: number) => string {
  switch (polarity) {
    case "higherWorse":
      return interpolateOrRd;
    case "higherBetter":
      return interpolateBlues;
    case "neutral":
      return interpolateViridis;
  }
}

/**
 * 5-step palette for a polarity, sampled at PALETTE_SAMPLE_T. Palettes are
 * monotonic-lightness (colorblind-safe) by construction: higherWorse ->
 * OrRd, higherBetter -> Blues, neutral -> Viridis. RdYlGn-style diverging
 * palettes are deliberately not used (not monotonic, and "middle = neutral"
 * reads poorly against a dark 3D scene).
 */
export function paletteFor(polarity: Polarity): RGB[] {
  const interpolate = interpolatorFor(polarity);
  return PALETTE_SAMPLE_T.map((t) => parseColor(interpolate(t)));
}

/** How `makeColorScale` splits the palette's 5 steps across the domain — see `ColorScale.colorBuckets`. */
export type ColorBucketMode = "linear" | "quantile";

export interface ColorScale {
  colorOf: (code: string) => RGBA;
  /** Domain ends plus the 4 interior bucket-boundary values — 6 values bounding the 5 buckets. Always [domainOf()[0], …, domainOf()[1]] regardless of `colorBuckets` — only what falls BETWEEN those ends changes. */
  ticks: number[];
  /**
   * Task 6, Section C-추가 #5 — which bucket rule ACTUALLY produced
   * `ticks`/`colorOf`: 'linear' (scaleQuantize — 5 equal-WIDTH buckets
   * across the domain) or 'quantile' (scaleQuantile — 5 equal-COUNT
   * buckets, i.e. by rank/percentile). Defaults to 'quantile' for
   * count-kind indicators (their 14 시군 values skew hard toward 전주시, so
   * equal-width buckets left most regions in the bottom step) and 'linear'
   * otherwise — see `makeColorScale`'s `opts.colorBuckets`. Legend shows a
   * "색 구간: 고유값 5분위" note only when this is 'quantile'.
   *
   * Fix round 1/5, finding 1 — this can be 'linear' even when quantile was
   * requested (the kind-based default, or an explicit
   * `opts.colorBuckets: 'quantile'`): with FEWER THAN `palette.length` (5)
   * DISTINCT non-null region values, `makeColorScale` falls back to
   * 'linear' instead (fix round 2, finding 9: the threshold is `< 5`, not
   * `<= 5` — exactly 5 distinct values still uses quantile; see its doc
   * comment for why). Callers/Legend must
   * always read the MODE FROM THIS FIELD rather than re-deriving it from
   * `def.kind` or `opts`.
   */
  colorBuckets: ColorBucketMode;
}

export interface ColorScaleOptions {
  /**
   * Requests a mode, overriding the `def.kind`-based default. Not a
   * guarantee, though — `makeColorScale` can still fall back to 'linear'
   * regardless of this option when the data has too few distinct values
   * for a quantile split to mean anything (see `ColorScale.colorBuckets`).
   */
  colorBuckets?: ColorBucketMode;
}

/**
 * Builds a code -> RGBA color accessor plus the tick boundaries for a
 * Legend, over the same domain domainOf() computes for the elevation scale
 * (so height and color always encode the same domain — bucket MODE never
 * changes the domain itself, only how the 5 palette steps are split across
 * it). A null value (or a code absent from `map`) always returns
 * NULL_COLOR; alpha is always 255.
 *
 * Fix round 1/5, finding 1 — quantile bucketing on TIES: `scaleQuantile`
 * computes its 4 interior thresholds by interpolating within the SORTED
 * value array, then buckets a value via bisect-RIGHT against those
 * thresholds — so a value that lands exactly ON a threshold is pushed into
 * the bucket ABOVE it, not the one below. With real closed_schools_unused
 * data ([0,0,0,0,0,0,1,1,1,1,1,2,8,9] — 14 시군, only 5 distinct values,
 * six of them tied at 0), the first threshold itself computes to 0, so
 * every region actually AT 0 gets bucketed into palette[1]: palette[0] is
 * never used at all, and the Legend's ticks render as 0, 0, 0, 1, 1, 9
 * (not strictly increasing — actively misleading). Two-part fix:
 *  1. With FEWER THAN `palette.length` (5) DISTINCT non-null values, a
 *     "5-quantile" split isn't meaningful anyway (fewer than one value per
 *     bucket) — fall back to the linear/quantize scale instead, and
 *     report the ACTUAL mode used via the returned `colorBuckets` (never
 *     silently pretend quantile ran). This is data-driven: it applies even
 *     when quantile was explicitly requested via `opts.colorBuckets`.
 *  2. With `palette.length` (5) or more distinct values, quantile still
 *     runs, but its domain is the DEDUPLICATED distinct values (not the raw
 *     per-region array) — every repeated value collapses to one entry
 *     first, so a threshold interpolated between two ADJACENT DISTINCT
 *     values can still land exactly on one of them without starving a whole
 *     bucket the way un-deduplicated ties did. Fix round 2, finding 9
 *     (controller ruling) moved the boundary from `> 5` to `>= 5`: EXACTLY
 *     5 distinct values (e.g. real closed_schools_unused data) still gets
 *     one value per bucket cleanly once deduplicated, so there's no reason
 *     to force it to linear — verified empirically (thresholds
 *     0.8/1.6/4.4/8.2 over distinct values [0,1,2,8,9], all 5 colors used).
 */
export function makeColorScale(
  def: IndicatorDef,
  map: Map<string, number | null>,
  opts: ColorScaleOptions = {},
): ColorScale {
  const domain = domainOf(def, map);
  const palette = paletteFor(def.polarity);
  const requestedBuckets: ColorBucketMode = opts.colorBuckets ?? (def.kind === "count" ? "quantile" : "linear");

  const distinctValues = Array.from(
    new Set(
      regionValues(map)
        .map((r) => r.value)
        .filter((v): v is number => v !== null),
    ),
  ).sort((a, b) => a - b);
  // Fix round 2, finding 9 (controller ruling) — >= , not >: with EXACTLY
  // palette.length (5) distinct values, a 5-quantile split over the
  // deduplicated distinct-value domain still assigns one value per bucket
  // cleanly (fix round 1's dedup fix is what makes that safe — see this
  // function's own doc comment). The strict `>` used to route that exact
  // boundary case to 'linear' instead, which is what let real
  // closed_schools_unused data (5 distinct values, heavily tied at the low
  // end) cluster into only 2 colors instead of spreading across all 5.
  const colorBuckets: ColorBucketMode =
    requestedBuckets === "quantile" && distinctValues.length >= palette.length ? "quantile" : "linear";

  if (colorBuckets === "quantile") {
    // scaleQuantile takes the raw DATA array (not a [min,max] pair) — it
    // sorts internally and splits it into `palette.length` roughly-equal-
    // COUNT groups, unlike scaleQuantize's equal-WIDTH value ranges. Built
    // from `distinctValues` (deduplicated — see the fix-round comment
    // above), which is always non-empty here (the `colorBuckets` check
    // above already routes an all-null map, or one with too few distinct
    // values, to the 'linear' branch instead).
    const quantile = scaleQuantile<RGB>().domain(distinctValues).range(palette);
    const ticks = [domain[0], ...quantile.quantiles(), domain[1]];

    function colorOf(code: string): RGBA {
      const value = map.get(code);
      if (value === null || value === undefined) return [...NULL_COLOR, 255];
      const [r, g, b] = quantile(value);
      return [r, g, b, 255];
    }

    return { colorOf, ticks, colorBuckets };
  }

  const quantize = scaleQuantize<RGB>().domain(domain).range(palette);
  const ticks = [domain[0], ...quantize.thresholds(), domain[1]];

  function colorOf(code: string): RGBA {
    const value = map.get(code);
    if (value === null || value === undefined) return [...NULL_COLOR, 255];
    const [r, g, b] = quantize(value);
    return [r, g, b, 255];
  }

  return { colorOf, ticks, colorBuckets };
}

function clampByte(v: number): number {
  return Math.min(255, Math.max(0, Math.round(v)));
}

/** Darkens/lightens an RGB triple by `factor` (e.g. 0.5 = half brightness), clamped to [0,255]. For the non-selected-region dimming a later task wires up; alpha is handled separately by the caller (always 255 on this map). */
export function dim(rgb: RGB, factor: number): RGB {
  return [clampByte(rgb[0] * factor), clampByte(rgb[1] * factor), clampByte(rgb[2] * factor)];
}
