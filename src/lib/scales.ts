/**
 * Pure value -> height scale for the extruded 3D map. No React import.
 */
import { regionValues } from "./stats";
import type { IndicatorDef } from "./indicators/types";

/** Thin plate at value 0 (or null) — 0 elevation would read as "missing region", not "value 0". */
export const ELEVATION_FLOOR = 800;

/**
 * Chosen from screenshot comparison across the 12,000-20,000m band required
 * by 추가 요구 #1 (candidates 12000/15000/18000/20000, against both
 * students_total and students_per_class — see task-2-report.md for all 6
 * screenshots). 50,000m (Task 1A's dummy-data placeholder) made 전주시 tall
 * enough to hide shorter regions' top faces/labels behind it even with the
 * 추가 요구 #2 depth-test fix in place for the labels themselves. Within the
 * required band, legibility strictly improves as MAX decreases: 전주시,
 * 익산시, and 완주군 sit close enough on screen that their labels visibly
 * crowd together at 18000/20000 (most obvious on students_per_class, where
 * every region's height is closer together, making MAX's own effect on
 * label crowding visible independent of any one indicator's outlier
 * region), and read cleanly at 12000/15000. 12000 (the low end of the
 * required band) was picked over 15000 since the two look effectively
 * identical and lower is strictly better for this scene's tightest cluster.
 */
export const ELEVATION_MAX = 12000;

function clamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value));
}

/**
 * The [min, max] value domain the elevation/color scales normalize against.
 * `def.domain` wins when set. Otherwise, computed from the 14 시군 values
 * (52000 excluded, nulls excluded): count-kind indicators are floored at 0
 * (a true "zero students" baseline is meaningful); ratio-kind indicators use
 * the data's own [min, max] (a ratio like 학급당 학생수 has no meaningful
 * zero baseline, and flooring it at 0 would compress the actually-useful
 * range). A zero-width domain (every region tied) widens to [min, min+1] so
 * downstream division never sees a zero denominator.
 */
export function domainOf(
  def: Pick<IndicatorDef, "domain" | "kind">,
  map: Map<string, number | null>,
): [number, number] {
  if (def.domain) return def.domain;

  const values = regionValues(map)
    .map((r) => r.value)
    .filter((v): v is number => v !== null);
  if (values.length === 0) return [0, 1];

  const max = Math.max(...values);
  const min = def.kind === "count" ? 0 : Math.min(...values);
  if (max === min) return [min, min + 1];
  return [min, max];
}

/**
 * Builds a code -> elevation(meters) accessor for `makeRegionsLayer`'s
 * `elevationOf`. `h = FLOOR + (MAX - FLOOR) * norm`, where
 * `norm = clamp((v - d0) / (d1 - d0), 0, 1)`, square-rooted first when
 * `def.scale === 'sqrt'`. A null value (or a code absent from `map`) always
 * returns FLOOR.
 */
export function makeElevationScale(
  def: Pick<IndicatorDef, "domain" | "kind" | "scale">,
  map: Map<string, number | null>,
): (code: string) => number {
  const [d0, d1] = domainOf(def, map);
  return (code: string): number => {
    const value = map.get(code);
    if (value === null || value === undefined) return ELEVATION_FLOOR;
    let norm = clamp((value - d0) / (d1 - d0), 0, 1);
    if (def.scale === "sqrt") norm = Math.sqrt(norm);
    return ELEVATION_FLOOR + (ELEVATION_MAX - ELEVATION_FLOOR) * norm;
  };
}
