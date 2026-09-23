"use client";

import { useEffect, useRef, useState } from "react";
import { THEME } from "@/lib/theme";

export interface TimeSeriesPoint {
  year: number;
  value: number | null;
}

interface Props {
  data: TimeSeriesPoint[];
  label: string;
  place: string;
  unit: string;
  format: (value: number) => string;
  onShowStudents?: () => void;
  readable?: boolean;
}

const WIDTH = 320;
const HEIGHT = 126;
const LEFT = 12;
const RIGHT = 12;
const TOP = 14;
const BOTTOM = 22;

export default function TimeSeriesChart({ data, label, place, unit, format, onShowStudents, readable = false }: Props) {
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const chartRef = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ width: WIDTH, height: 190 });
  const rows = [...data].sort((a, b) => a.year - b.year);
  const valid = rows.filter((row): row is { year: number; value: number } => row.value !== null);
  const first = rows[0];
  const last = rows[rows.length - 1];
  const active = rows.find((row) => row.year === selectedYear) ?? last;
  const activeIndex = active ? rows.findIndex((row) => row.year === active.year) : -1;
  const previous = activeIndex > 0 ? rows[activeIndex - 1] : null;
  const delta = active?.value != null && previous?.value != null ? active.value - previous.value : null;
  const formatNumber = (value: number) => {
    const result = format(value);
    return unit && result.endsWith(unit) ? result.slice(0, -unit.length) : result;
  };
  const changeUnit = unit === "%" ? "%p" : unit;
  const hasChart = rows.length >= 2 && valid.length >= 2;
  useEffect(() => {
    if (!readable || !hasChart || !chartRef.current || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) setSize({ width, height });
    });
    observer.observe(chartRef.current);
    return () => observer.disconnect();
  }, [readable, hasChart]);

  if (rows.length < 2 || valid.length < 2) {
    return <section aria-label={`${place} ${label} 시계열 추이`} className="rounded-xl border border-line bg-paper p-3">
      <h3 className="text-sm font-semibold">시계열 추이 · {place}</h3>
      <p className="mt-2 text-xs text-ink-muted"><span>추이 없음</span> · 연도별 자료가 제공되지 않습니다.</p>
      {onShowStudents && <button type="button" onClick={onShowStudents} className="mt-2 min-h-11 text-xs font-semibold text-accent-text underline">학생수 연도별 추이 보기</button>}
    </section>;
  }

  const min = Math.min(...valid.map((row) => row.value));
  const max = Math.max(...valid.map((row) => row.value));
  const width = readable ? size.width : WIDTH;
  const height = readable ? size.height : HEIGHT;
  const left = readable ? 78 : LEFT;
  const right = readable ? 26 : RIGHT;
  const top = readable ? 22 : TOP;
  const bottom = readable ? 28 : BOTTOM;
  const x = (year: number) => left + ((year - first.year) / (last.year - first.year)) * (width - left - right);
  const y = (value: number) => max === min ? (top + height - bottom) / 2
    : height - bottom - ((value - min) / (max - min)) * (height - top - bottom);
  const middle = valid.every(row => Number.isInteger(row.value)) ? Math.round((min + max) / 2) : (min + max) / 2;
  const ticks = [...new Set(max === min ? [min] : [min, middle, max])];
  const lineColor = readable ? "var(--color-accent-text)" : THEME.accent;
  const segments: { year: number; value: number }[][] = [];
  for (const [index, row] of rows.entries()) {
    if (row.value === null) continue;
    if (!segments.length || rows[index - 1]?.value === null)
      segments.push([]);
    segments[segments.length - 1].push({ year: row.year, value: row.value });
  }
  const aria = `${place} ${label} ${first.year}년부터 ${last.year}년까지의 추이`;

  return <section aria-label={`${place} ${label} 시계열 추이`} className={`${readable ? "ice-time-series " : ""}rounded-xl border border-line bg-paper p-3`}>
    <h3 className="text-sm font-semibold">시계열 추이 · {place}</h3>
    <p className="mt-1 text-xs text-ink-muted">{label} · {first.year}–{last.year} · 연도를 눌러 값을 확인하세요</p>
    <svg ref={chartRef} role="img" aria-label={aria} viewBox={`0 0 ${width} ${height}`} width="100%" className="mt-3 h-32 w-full" preserveAspectRatio={readable ? "xMidYMid meet" : "none"}>
      {readable ? ticks.map(value=><g key={value}><line x1={left} x2={width-right} y1={y(value)} y2={y(value)} stroke="var(--color-line)" strokeDasharray="3 4" /><text x={left-10} y={y(value)+4} textAnchor="end" fontSize="13" fill="var(--color-ink-muted)">{formatNumber(value)}</text></g>) : <line x1={left} x2={width - right} y1={height - bottom} y2={height - bottom} stroke="#dce2e7" />}
      {segments.map((segment, index) => segment.length > 1 ? <path key={index} d={segment.map((row, point) => `${point ? "L" : "M"}${x(row.year)},${y(row.value)}`).join(" ")} fill="none" stroke={lineColor} strokeWidth="2.5" vectorEffect="non-scaling-stroke" /> : null)}
      {valid.map((row) => <circle key={row.year} cx={x(row.year)} cy={y(row.value)} r={row.year === active?.year ? 5 : 3.5} fill={lineColor} stroke={readable ? "var(--color-surface)" : "white"} strokeWidth="2" vectorEffect="non-scaling-stroke" />)}
      {rows.filter((_, index)=>!readable || width >= 330 || index % 2 === 0 || index === rows.length-1).map((row) => <text key={row.year} x={x(row.year)} y={height - 4} textAnchor="middle" fontSize={readable ? "13" : "11"} fill={THEME.inkMuted}>{row.year}</text>)}
    </svg>
    <p className="mt-1 text-sm font-semibold tabular-nums" aria-live="polite">
      {active.year}년 {active.value === null ? "자료 없음" : `${formatNumber(active.value)}${unit}`}
      {delta !== null && <span className="ml-2 text-xs font-normal text-ink-muted">전년 대비 {delta > 0 ? "+" : delta < 0 ? "−" : "±"}{formatNumber(Math.abs(delta))}{changeUnit}</span>}
    </p>
    <div className={`${readable ? "ice-year-values " : ""}mt-3 grid gap-1`} style={readable ? undefined : { gridTemplateColumns: `repeat(${rows.length}, minmax(0, 1fr))` }} aria-label="연도별 값">
      {rows.map((row) => <button key={row.year} type="button" aria-pressed={row.year === active.year} onClick={() => setSelectedYear(row.year)} className="min-h-12 rounded border border-line bg-surface px-1 py-1 text-center text-xs aria-pressed:border-accent aria-pressed:bg-accent-soft">
        <span className="block text-ink-muted">{row.year}</span>
        <strong className={`block ${readable ? "" : "truncate "}tabular-nums`} title={row.value === null ? "자료 없음" : `${formatNumber(row.value)}${unit}`}>{row.value === null ? "—" : formatNumber(row.value)}</strong>
      </button>)}
    </div>
    <p className="mt-2 text-[11px] text-ink-muted">{readable ? "세로축은 값 차이가 보이도록 조정됩니다. " : "각 연도 교육통계 기준 값입니다. "}빈 연도는 선으로 연결하지 않습니다.</p>
  </section>;
}
