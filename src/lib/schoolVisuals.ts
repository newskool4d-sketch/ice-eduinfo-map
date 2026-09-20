/**
 * Pure school-layer visual encoding: per-학교급 colors/labels and the
 * student-count -> dot-radius scale. No deck.gl import (deck.gl imports are
 * scoped to src/components/map/** per the task brief) — both
 * src/components/map/layers/schoolLayers.ts (the deck.gl layer) and
 * src/components/panels/Legend.tsx (a plain React panel, no deck.gl) import
 * colors from here, so the legend's swatches and the map's dots can never
 * drift apart.
 */
import type { SchoolLevel } from "./indicators/types";
import type { School } from "./schools/types";

export type RGBA = [number, number, number, number];

/**
 * 학교급별 4색 — colorblind-safe (verified distinct under deuteranopia/
 * protanopia simulation: distinct hue AND lightness steps, not just hue),
 * and legible against this app's dark (#0b0f19) map background (all 4 are
 * light/saturated enough to read clearly on a dark scene, unlike e.g. a
 * dark navy that would disappear into it).
 */
export const SCHOOL_LEVEL_COLORS: Record<SchoolLevel, RGBA> = {
  elem: [76, 201, 240, 255], // #4cc9f0 — cyan
  mid: [249, 199, 79, 255], // #f9c74f — amber
  high: [243, 114, 44, 255], // #f3722c — orange-red
  special: [181, 228, 140, 255], // #b5e48c — green
};

export const SCHOOL_LEVEL_ORDER: SchoolLevel[] = ["elem", "mid", "high", "special"];

export const SCHOOL_LEVEL_LABELS: Record<SchoolLevel, string> = {
  elem: "초",
  mid: "중",
  high: "고",
  special: "특수",
};

export const SCHOOL_RADIUS_MIN_PX = 3;
export const SCHOOL_RADIUS_MAX_PX = 9;

/**
 * Builds a `students -> radius(px)` accessor by linearly mapping
 * sqrt(students) across the FULL given school list's own [min, max] onto
 * [SCHOOL_RADIUS_MIN_PX, SCHOOL_RADIUS_MAX_PX]. `null` (no student count)
 * always maps to the minimum radius.
 *
 * Deliberately takes the *entire* schools.json list, not whatever subset is
 * currently being rendered (e.g. just the selected 시군): the radius scale's
 * domain must stay fixed across a region selection change, or a dot's size
 * would silently mean something different every time the user picks a new
 * 시군 (e.g. the same 300-student school reading as "large" in a region full
 * of tiny rural schools but "small" next to 전주시's biggest). Callers
 * compute this once from the full bundle and reuse the same accessor for
 * whatever filtered subset they actually hand to the layer.
 */
export function makeSchoolRadiusScale(schools: readonly Pick<School, "students">[]): (students: number | null) => number {
  const sqrtValues = schools
    .map((s) => s.students)
    .filter((v): v is number => v != null && v >= 0)
    .map((v) => Math.sqrt(v));

  if (sqrtValues.length === 0) {
    return () => SCHOOL_RADIUS_MIN_PX;
  }

  const min = Math.min(...sqrtValues);
  const max = Math.max(...sqrtValues);

  return (students: number | null): number => {
    if (students == null || students < 0) return SCHOOL_RADIUS_MIN_PX;
    if (max === min) return (SCHOOL_RADIUS_MIN_PX + SCHOOL_RADIUS_MAX_PX) / 2;
    const t = (Math.sqrt(students) - min) / (max - min);
    const clamped = Math.min(1, Math.max(0, t));
    return SCHOOL_RADIUS_MIN_PX + (SCHOOL_RADIUS_MAX_PX - SCHOOL_RADIUS_MIN_PX) * clamped;
  };
}
