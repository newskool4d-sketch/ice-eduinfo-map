/**
 * Pure tooltip line-assembly for the map's hover tooltip. Extracted from
 * DeckMap.tsx (Fix round 1, review finding #1) — this logic previously
 * lived inline in that component with zero automated coverage. No
 * deck.gl/React imports: this module only imports from src/lib/geo,
 * src/lib/stats and src/lib/indicators/types, so it is directly unit
 * testable (see tests/unit/tooltipText.test.ts) without any DOM/WebGL
 * setup. DeckMap.tsx imports `makeLinesOf` from here instead of defining
 * this logic itself.
 */
import { formatDecimal, formatInt } from "./format";
import { isRegionCode, regionName } from "./geo/regions";
import { SCHOOL_LEVEL_LABELS } from "./schoolVisuals";
import type { School } from "./schools/types";
import { rank, vsProvince } from "./stats";
import type { IndicatorDef } from "./indicators/types";

function nameOf(code: string): string {
  return isRegionCode(code) ? regionName(code) : code;
}

/**
 * `def.format(value)` already embeds the unit for some indicators
 * (formatPercent -> "%", formatArea -> "㎡") but not others (formatInt/
 * formatDecimal). Appending `def.unit` unconditionally would double up for
 * the first group ("12.3%%"); only appending when it isn't already there
 * handles both without a per-indicator special case.
 */
export function formatWithUnit(def: IndicatorDef, value: number): string {
  const formatted = def.format(value);
  return formatted.endsWith(def.unit) ? formatted : `${formatted}${def.unit}`;
}

/**
 * "+1,234명" / "-3.2%" — sign always shown, magnitude formatted (and
 * unit-suffixed) the same way as the main value.
 */
export function formatDelta(def: IndicatorDef, delta: number): string {
  const formatted = formatWithUnit(def, Math.abs(delta));
  return delta < 0 ? `-${formatted}` : `+${formatted}`;
}

export interface LinesOfParams {
  def: IndicatorDef;
  /** Already-resolved display label — displayLabel(def, series) from stats.ts, dynamic for students_change_5y. */
  label: string;
  map: Map<string, number | null>;
}

/**
 * Builds a `(code) => string[]` tooltip-line function for one indicator's
 * currently loaded value map: [name, "label: value 단위", "14개 시군 중
 * n위", "전북 {평균|총계} 대비 ±x"] — or just [name, "label: 자료 없음"]
 * (2 lines) when the region has no data for this indicator.
 *
 * `rank(map)` is computed once here, not per hovered code: the caller
 * (DeckMap.tsx) re-creates this function via useMemo only when
 * `def`/`label`/`map` change, not on every pointer move.
 */
export function makeLinesOf({ def, label, map }: LinesOfParams): (code: string) => string[] {
  const ranks = rank(map);
  return (code: string): string[] => {
    const name = nameOf(code);
    const value = map.get(code);
    if (value === null || value === undefined) {
      return [name, `${label}: 자료 없음`];
    }
    const valueLine = `${label}: ${formatWithUnit(def, value)}`;
    const r = ranks.get(code);
    const rankLine = r !== undefined ? `14개 시군 중 ${r}위` : "순위 없음";
    const delta = vsProvince(map, code);
    // vsProvince is always `value - 52000행`, per stats.ts — but the 52000
    // row is only a true (Σ/Σ) *average* for ratio-kind indicators; for
    // count-kind indicators it's the province-wide *total* (Σ), so labeling
    // the comparison "평균 대비" there would misreport what the number is
    // (e.g. 임실군's students_total delta is -164,634, i.e. against the
    // total, not a ~11,854 provincial average — "총계 대비" is the honest
    // label).
    const deltaNoun = def.kind === "ratio" ? "평균" : "총계";
    const deltaLine =
      delta === null
        ? `전북 ${deltaNoun} 대비: 자료 없음`
        : `전북 ${deltaNoun} 대비 ${formatDelta(def, delta)}`;
    return [name, valueLine, rankLine, deltaLine];
  };
}

/**
 * Builds the school-point hover tooltip's lines: 학교명 / 학교급 /
 * 학생수·학급수·학급당 학생수 / 소규모 여부 / 분교장 표시 (per the task
 * brief). The first line renders as the tooltip's bold title (see
 * components/map/tooltip.ts), same convention as `makeLinesOf`'s region
 * tooltip.
 */
export function schoolTooltipLines(
  school: Pick<School, "name" | "level" | "students" | "classes" | "studentsPerClass" | "small" | "branch">,
): string[] {
  const students = school.students != null ? `학생 ${formatInt(school.students)}명` : "학생수 자료 없음";
  const classes = school.classes != null ? `${formatInt(school.classes)}학급` : "학급수 자료 없음";
  const perClass =
    school.studentsPerClass != null ? `학급당 ${formatDecimal(school.studentsPerClass, 1)}명` : "학급당 자료 없음";

  const lines = [school.name, SCHOOL_LEVEL_LABELS[school.level], `${students} · ${classes} · ${perClass}`];
  if (school.small) lines.push("소규모학교");
  if (school.branch) lines.push("분교장");
  return lines;
}
