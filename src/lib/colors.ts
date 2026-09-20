/**
 * Pure value -> fill-color scale for the extruded 3D map. No React import.
 */
import { scaleQuantize } from "d3-scale";
import { interpolateBlues, interpolateOrRd, interpolateViridis } from "d3-scale-chromatic";

import { domainOf } from "./scales";
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

export interface ColorScale {
  colorOf: (code: string) => RGBA;
  /** Domain ends plus the 4 interior quantize thresholds — 6 values bounding the 5 buckets. */
  ticks: number[];
}

/**
 * Builds a code -> RGBA color accessor plus the tick boundaries for a
 * Legend, via a 5-step scaleQuantize over the same domain domainOf()
 * computes for the elevation scale (so height and color always encode the
 * same domain). A null value (or a code absent from `map`) always returns
 * NULL_COLOR; alpha is always 255.
 */
export function makeColorScale(def: IndicatorDef, map: Map<string, number | null>): ColorScale {
  const domain = domainOf(def, map);
  const palette = paletteFor(def.polarity);
  const quantize = scaleQuantize<RGB>().domain(domain).range(palette);
  const ticks = [domain[0], ...quantize.thresholds(), domain[1]];

  function colorOf(code: string): RGBA {
    const value = map.get(code);
    if (value === null || value === undefined) return [...NULL_COLOR, 255];
    const [r, g, b] = quantize(value);
    return [r, g, b, 255];
  }

  return { colorOf, ticks };
}

function clampByte(v: number): number {
  return Math.min(255, Math.max(0, Math.round(v)));
}

/** Darkens/lightens an RGB triple by `factor` (e.g. 0.5 = half brightness), clamped to [0,255]. For the non-selected-region dimming a later task wires up; alpha is handled separately by the caller (always 255 on this map). */
export function dim(rgb: RGB, factor: number): RGB {
  return [clampByte(rgb[0] * factor), clampByte(rgb[1] * factor), clampByte(rgb[2] * factor)];
}
