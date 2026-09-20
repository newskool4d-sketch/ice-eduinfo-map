import type { RGB } from "@/lib/colors";
import { NULL_COLOR } from "@/lib/colors";
import type { IndicatorDef } from "@/lib/indicators/types";
import { SCHOOL_LEVEL_COLORS, SCHOOL_LEVEL_LABELS, SCHOOL_LEVEL_ORDER } from "@/lib/schoolVisuals";

export interface LegendProps {
  def: IndicatorDef;
  /** Domain ends + 4 interior quantize thresholds (6 values), as returned by makeColorScale(). */
  ticks: number[];
  /** The 5 palette colors, in the same order as the buckets ticks[i]..ticks[i+1]. */
  palette: RGB[];
  hasNull: boolean;
  /**
   * The indicator file's referenceDate (e.g. "2026-04-01"). Not part of
   * IndicatorDef (that's a registry-only type; referenceDate is a per-file
   * runtime field) — Dashboard.tsx reads it off bundle.indicators[id] and
   * passes it through.
   */
  referenceDate: string;
  /** Task 4B — true whenever a 시군 is selected (the school layer is then visible on the map), adding the 4 학교급 color swatches to the legend. Defaults to false (no school layer without a selection). */
  schoolLevelsVisible?: boolean;
  /** fix round, review finding #4 — true only when the SELECTED region itself has at least one school with no coordinate (lat == null, i.e. a 특수학교 row — see School.locationMissingReason). Gates the "(특수학교는 위치 자료 없음)" caveat so it isn't shown for a region where every school actually has a point on the map. Defaults to false. */
  hasSchoolsWithoutLocation?: boolean;
  /** Task 6, Section C-추가 #5 — which bucket rule produced `ticks`/the map's actual colors (see makeColorScale's `ColorScale.colorBuckets`). Defaults to 'linear' (no note) — pass 'quantile' to add a "색 구간: 5분위" note, e.g. for a count-kind indicator's skewed 14-시군 distribution. */
  colorBuckets?: "linear" | "quantile";
}

function rgbCss([r, g, b]: readonly number[]): string {
  return `rgb(${r}, ${g}, ${b})`;
}

/** Bottom-bar legend: 5 color swatches + boundary values, a missing-data swatch, a one-line scale caveat, and the data source/reference date. When `schoolLevelsVisible`, also shows the 4 학교급 point colors (Task 4B). */
export default function Legend({
  def,
  ticks,
  palette,
  hasNull,
  referenceDate,
  schoolLevelsVisible = false,
  hasSchoolsWithoutLocation = false,
  colorBuckets = "linear",
}: LegendProps) {
  // Fix round 1/5, finding 4 — "높이·색 모두 값에 비례" next to a "색 구간: 5분위"
  // note directly contradicts itself (color is rank-based under quantile,
  // not proportional to value). Swap the base note to the color-agnostic
  // "높이는 값에 비례" whenever colorBuckets is 'quantile'; height itself is
  // unaffected (still linear) either way — only this sentence changes.
  const notes: string[] = [colorBuckets === "quantile" ? "높이는 값에 비례" : "높이·색 모두 값에 비례"];
  if (def.scale === "sqrt") notes.push("제곱근 스케일");
  // Covers both of the brief's sub-conditions (an explicit def.domain override,
  // or a ratio-kind indicator whose data minimum isn't 0) with one check: in
  // either case the resulting scale's lower bound (ticks[0]) simply isn't 0.
  if (ticks[0] !== 0) notes.push("기준선 ≠ 0");
  // Task 6, Section C-추가 #5 — count-kind indicators' color buckets are
  // quantile (rank-based), not the equal-width linear split the base note
  // implies for color; this note prevents that misreading without changing
  // the (still-linear) height encoding.
  if (colorBuckets === "quantile") notes.push("색 구간: 5분위");

  return (
    <div className="flex flex-wrap items-center gap-4 text-xs text-[#e6e9f0]/70">
      <span className="flex shrink-0 flex-col">
        <span className="text-sm font-semibold text-[#e6e9f0]" data-testid="legend-indicator-label">
          {def.label}
        </span>
        <span className="max-w-[280px] text-[10px] leading-snug text-[#e6e9f0]/50" data-testid="legend-description">
          {def.description}
        </span>
      </span>

      <div className="flex items-end gap-0.5">
        {palette.map((rgb, i) => (
          <div key={i} className="flex flex-col items-center gap-1">
            <span
              data-testid="legend-swatch"
              className="h-3 w-7"
              style={{ backgroundColor: rgbCss(rgb) }}
              aria-hidden
            />
            <span className="tabular-nums text-[10px] text-[#e6e9f0]/50">{def.format(ticks[i])}</span>
          </div>
        ))}
        <span className="pb-[18px] tabular-nums text-[10px] text-[#e6e9f0]/50">
          {def.format(ticks[ticks.length - 1])}
        </span>
        {hasNull && (
          <div className="ml-2 flex flex-col items-center gap-1">
            <span
              data-testid="legend-null-swatch"
              className="h-3 w-7"
              style={{ backgroundColor: rgbCss(NULL_COLOR) }}
              aria-hidden
            />
            <span className="text-[10px] text-[#e6e9f0]/50">자료 없음</span>
          </div>
        )}
      </div>

      {schoolLevelsVisible && (
        <div className="flex items-center gap-2 border-l border-white/10 pl-4">
          <span className="shrink-0 text-[10px] text-[#e6e9f0]/50">학교</span>
          {SCHOOL_LEVEL_ORDER.map((level) => {
            const [r, g, b] = SCHOOL_LEVEL_COLORS[level];
            return (
              <span key={level} className="flex items-center gap-1">
                <span
                  data-testid="legend-school-swatch"
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: rgbCss([r, g, b]) }}
                  aria-hidden
                />
                <span className="text-[10px] text-[#e6e9f0]/50">{SCHOOL_LEVEL_LABELS[level]}</span>
              </span>
            );
          })}
          {hasSchoolsWithoutLocation && (
            <span className="text-[10px] text-[#e6e9f0]/50">(특수학교는 위치 자료 없음)</span>
          )}
        </div>
      )}

      <p>{notes.join(" · ")}</p>

      <a
        href={def.source.url}
        target="_blank"
        rel="noreferrer"
        className="underline decoration-dotted underline-offset-2 hover:text-[#e6e9f0]"
      >
        {def.source.name}
      </a>
      <span>기준일 {referenceDate}</span>
    </div>
  );
}
