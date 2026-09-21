/**
 * A minimal inline trend line for RegionPanel's "추이" section: a single
 * series (one region, one indicator, 5 years), so per the dataviz skill's
 * single-series rule this needs no legend — RegionPanel's own heading
 * already names the indicator. Pure SVG (no chart library): a 2px polyline,
 * the last point emphasized (larger, filled dot), and year-axis labels for
 * only the first/last year (per the task brief — no gridlines, no
 * per-point labels, no hover layer: this is a glanceable trend indicator,
 * and every value it plots is already shown as text elsewhere in the panel
 * — the current-indicator card and the 다른 지표 table).
 */
import { THEME } from "@/lib/theme";

export interface SparklinePoint {
  year: number;
  value: number | null;
}

export interface SparklineProps {
  data: SparklinePoint[];
  /** Formats a value for... nothing visible yet (reserved) — kept out: Sparkline only ever draws the line + year labels, never a value label, per the brief. */
  className?: string;
}

// Matches RegionPanel's actual rendered width (360px aside - 2*16px p-4
// padding = 328px) reasonably closely: `preserveAspectRatio="none"` below
// scales each axis independently to fill width="100%"/height={VIEW_HEIGHT},
// so a badly-mismatched viewBox width would stretch the stroke/text/dot
// horizontally. This won't be exact for every viewport, but keeps the
// distortion negligible for this app's fixed 360px panel instead of the
// ~1.37x stretch a 240-wide viewBox produced.
const VIEW_WIDTH = 328;
const VIEW_HEIGHT = 56;
const PAD_X = 4;
const PAD_TOP = 6;
const PAD_BOTTOM = 16; // room for the year-axis labels below the line

// A single accent hue (dataviz skill: sequential/single-series = one hue) —
// distinct from the app's neutral text tokens, legible on the light panel
// background, paper (#f5f2eb). Text (year labels) stays in the app's own
// muted text token, never this line color, per the skill's "text wears text
// tokens" rule.
const LINE_COLOR = THEME.accent;

function buildPath(points: { year: number; value: number }[]): {
  d: string;
  last: { x: number; y: number };
} {
  const years = points.map((p) => p.year);
  const values = points.map((p) => p.value);
  const minYear = Math.min(...years);
  const maxYear = Math.max(...years);
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);

  const xScale = (year: number): number => {
    if (maxYear === minYear) return (PAD_X + (VIEW_WIDTH - PAD_X)) / 2;
    return PAD_X + ((year - minYear) / (maxYear - minYear)) * (VIEW_WIDTH - PAD_X * 2);
  };
  const yTop = PAD_TOP;
  const yBottom = VIEW_HEIGHT - PAD_BOTTOM;
  const yScale = (value: number): number => {
    if (maxValue === minValue) return (yTop + yBottom) / 2;
    return yBottom - ((value - minValue) / (maxValue - minValue)) * (yBottom - yTop);
  };

  const coords = points.map((p) => [xScale(p.year), yScale(p.value)] as const);
  const d = coords.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
  const [lastX, lastY] = coords[coords.length - 1];
  return { d, last: { x: lastX, y: lastY } };
}

/** Pure SVG sparkline: polyline + emphasized last point + min/max year labels only. Renders "추이 없음" when there are fewer than 2 usable (non-null) points to draw a line through. */
export default function Sparkline({ data, className }: SparklineProps) {
  const points = data
    .filter((d): d is { year: number; value: number } => d.value !== null)
    .sort((a, b) => a.year - b.year);

  if (points.length < 2) {
    return <p className={`text-xs text-ink-muted ${className ?? ""}`}>추이 없음</p>;
  }

  const { d, last } = buildPath(points);
  const firstYear = points[0].year;
  const lastYear = points[points.length - 1].year;

  return (
    <svg
      role="img"
      aria-label={`${firstYear}년부터 ${lastYear}년까지의 추이`}
      viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
      width="100%"
      height={VIEW_HEIGHT}
      className={className}
      preserveAspectRatio="none"
    >
      <path d={d} fill="none" stroke={LINE_COLOR} strokeWidth={2} vectorEffect="non-scaling-stroke" />
      <circle cx={last.x} cy={last.y} r={3.5} fill={LINE_COLOR} />
      <text x={PAD_X} y={VIEW_HEIGHT - 2} fontSize={10} fill={THEME.inkMuted} textAnchor="start">
        {firstYear}
      </text>
      <text x={VIEW_WIDTH - PAD_X} y={VIEW_HEIGHT - 2} fontSize={10} fill={THEME.inkMuted} textAnchor="end">
        {lastYear}
      </text>
    </svg>
  );
}
