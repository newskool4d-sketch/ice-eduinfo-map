import type { ReactNode } from "react";
import type { MapMetricSpec } from "@/lib/mapMetrics";
import { ACTIVE_PROFILE } from "@/lib/profiles";

import { METRIC_RAMP } from "@/lib/mapMetrics";

interface MetricLegendProps {
  metric: MapMetricSpec;
  density: boolean;
  densityUnavailable?: boolean;
  children?: ReactNode;
  schoolSelected?: boolean;
  mobile?: boolean;
  clustered?: boolean;
  targetsSeparate?: boolean;
}

export default function MetricLegend({
  metric,
  density,
  densityUnavailable = false,
  children,
  schoolSelected = false,
  mobile = false,
  clustered = false,
  targetsSeparate = false,
}: MetricLegendProps) {
  if (ACTIVE_PROFILE.id === "incheon") return <IncheonMetricLegend
    metric={metric} density={density} densityUnavailable={densityUnavailable}
    schoolSelected={schoolSelected} mobile={mobile} clustered={clustered} targetsSeparate={targetsSeparate}>{children}</IncheonMetricLegend>;
  const legend = density
    ? METRIC_RAMP.map((color, i) => ({
        color,
        label: i === 0 ? "낮음" : i === METRIC_RAMP.length - 1 ? "높음" : "",
      }))
    : metric.legend;
  return (
    <section
      aria-label="선택 지표 범례"
      data-testid="metric-legend"
      className={`pointer-events-none absolute ${schoolSelected ? "bottom-36 lg:bottom-4" : "bottom-4"} right-3 z-10 w-80 max-w-[calc(100%_-_72px)] rounded-xl border border-line bg-surface/95 p-3 shadow-sm`}
    >
      <h2
        data-testid="legend-indicator-label"
        className="text-sm font-semibold"
      >
        {metric.title}
      </h2>
      <p className="mt-1 text-xs text-ink-muted">
        {density
          ? "상대 집중도 · 낮음 → 높음"
          : metric.regionOverlay ? "시군 면: 학생 증감률 · 원: 작은학교" : metric.kind === "region"
            ? "시군 단위"
            : `학교 단위 · ${ACTIVE_PROFILE.province.shortName} 전체 기준`}
        <span className="block">{metric.date}</span>
      </p>
      <p className="mt-1 text-xs font-medium">{metric.summary}</p>
      <div className="mt-2 flex gap-1">
        {legend.map((item, i) => (
          <div key={i} className="min-w-0 flex-1">
            <div
              className="h-2 rounded-sm"
              style={{
                backgroundColor: `rgb(${item.color.slice(0, 3).join(",")})`,
              }}
            />
            <span className="break-words text-[10px] text-ink-muted">
              {item.label}
            </span>
          </div>
        ))}
      </div>
      {metric.proportional && <p className="mt-2 text-[11px] text-ink-muted">원 크기: 학교별 수치 · 최소 크기는 선택 편의를 위한 표시입니다.</p>}
      {metric.regionOverlay && <p className="mt-2 text-[11px] text-ink-muted">● 학생 60명 이하 본교 · 주황 테두리: 신입생 0명 강조 시</p>}
      {metric.specialEducation && <p className="mt-2 text-[11px] text-ink-muted">● 일반학교 특수학급 · ◆ 특수학교 (별도 집계)</p>}
      <p
        data-testid="legend-description"
        className="mt-2 hidden text-[11px] leading-relaxed text-ink-muted sm:block"
      >
        {metric.note}
      </p>
      <details className="pointer-events-auto mt-2 text-[11px] text-ink-muted sm:hidden">
        <summary>지도 읽는 법</summary>
        <p className="mt-1 leading-relaxed">{metric.note}</p>
      </details>
      {children}
      {densityUnavailable && (
        <p className="mt-1 text-[11px] text-ink-muted">
          이 기기에서는 학교별 수치로 표시합니다.
        </p>
      )}
    </section>
  );
}

function IncheonMetricLegend({ metric, density, densityUnavailable, schoolSelected, mobile, clustered, targetsSeparate, children }: MetricLegendProps) {
  const numeric = !density && metric.kind !== "category" && !metric.regionOverlay;
  const labelOf = (label: string) => numeric && metric.unit && label.endsWith(metric.unit)
    ? label.slice(0, -metric.unit.length) : label;
  return <section aria-label="선택 지표 범례" data-testid="metric-legend"
    className={`ice-map-legend ${schoolSelected ? "ice-map-legend-raised" : ""}`}>
    <div className="ice-legend-heading">
      <h2 data-testid="legend-indicator-label">{metric.title}</h2>
      {numeric && <span>단위: {metric.unit}</span>}
    </div>
    <p className="ice-legend-total">{metric.summary}</p>
    <details className="ice-legend-details" open={!mobile}>
      <summary>{density ? "집중도 범례" : "색상 범례"}<span aria-hidden="true">접기 / 펼치기</span></summary>
      <div className="ice-legend-body">
        <p className="ice-legend-scope">{density ? "상대 집중도 · 낮음 → 높음" : metric.kind === "region" ? "군·구 단위" : "개별 학교의 색상 · 인천 전체 기준"}</p>
        {density ? <div className="ice-legend-density">
          <div style={{ background: `linear-gradient(to right, ${METRIC_RAMP.map(c => `rgb(${c.slice(0, 3).join(",")})`).join(",")})` }} />
          <p><span>낮음</span><span>높음</span></p>
        </div> : <ul className="ice-legend-items">
          {metric.legend.map((item, i) => <li key={i}>
            <span aria-hidden="true" className="ice-legend-swatch" style={{ background: `rgb(${item.color.slice(0, 3).join(",")})` }} />
            <span>{labelOf(item.label)}</span>
          </li>)}
        </ul>}
        {clustered && <p className="ice-legend-clusters"><span aria-hidden="true">12</span>숫자 원: 학교·분교 위치 수<br />{targetsSeparate ? "소규모학교는 색 점으로 따로 표시합니다." : "확대하면 개별 학교로 나뉩니다."}</p>}
        <p className="ice-legend-date">{metric.date}</p>
        <details className="ice-legend-note"><summary>집계 기준·지도 읽는 법</summary>
          <p data-testid="legend-description">{metric.note}</p>
          {metric.proportional && <p>개별 원 크기: 학교별 수치 · 최소 크기는 선택 편의를 위한 표시입니다.</p>}
          {metric.specialEducation && <p>● 일반학교 특수학급 · ◆ 특수학교 (별도 집계)</p>}
        </details>
        {children}
        {densityUnavailable && <p>이 기기에서는 학교별 수치로 표시합니다.</p>}
      </div>
    </details>
  </section>;
}
