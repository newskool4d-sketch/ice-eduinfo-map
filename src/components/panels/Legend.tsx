import type { RGB } from "@/lib/colors";
import { NULL_COLOR } from "@/lib/colors";
import type { IndicatorDef } from "@/lib/indicators/types";

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
}

function rgbCss([r, g, b]: readonly number[]): string {
  return `rgb(${r}, ${g}, ${b})`;
}

/** Bottom-bar legend: 5 color swatches + boundary values, a missing-data swatch, a one-line scale caveat, and the data source/reference date. */
export default function Legend({ def, ticks, palette, hasNull, referenceDate }: LegendProps) {
  const notes: string[] = ["높이·색 모두 값에 비례"];
  if (def.scale === "sqrt") notes.push("제곱근 스케일");
  // Covers both of the brief's sub-conditions (an explicit def.domain override,
  // or a ratio-kind indicator whose data minimum isn't 0) with one check: in
  // either case the resulting scale's lower bound (ticks[0]) simply isn't 0.
  if (ticks[0] !== 0) notes.push("기준선 ≠ 0");

  return (
    <div className="flex flex-wrap items-center gap-4 text-xs text-[#e6e9f0]/70">
      <span className="shrink-0 text-sm font-semibold text-[#e6e9f0]" data-testid="legend-indicator-label">
        {def.label}
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
