"use client";

import { useState } from "react";

import Sparkline from "@/components/ui/Sparkline";
import type { DataBundle } from "@/lib/data/types";
import { REGION_CODES, regionName } from "@/lib/geo/regions";
import { GROUP_LABELS, GROUP_ORDER } from "@/lib/indicators/groups";
import { indicatorById, INDICATORS } from "@/lib/indicators/registry";
import type { IndicatorGroup, SchoolLevel } from "@/lib/indicators/types";
import { SCHOOL_LEVEL_LABELS, SCHOOL_LEVEL_ORDER } from "@/lib/schoolVisuals";
import type { School } from "@/lib/schools/types";
import { displayLabel, rank, referenceDateLabel, trend, valueMap, vsProvince } from "@/lib/stats";
import { useMapQuery } from "@/lib/state/urlState";
import { formatDelta } from "@/lib/tooltipText";

export interface RegionPanelProps {
  bundle: Pick<DataBundle, "indicators" | "series" | "manifest" | "schools">;
  /** The currently-highlighted school (map point click / this panel's own row click), or null. Owned by Dashboard, mirrored to DeckMap so either side can drive it. */
  highlightedSchoolId: string | null;
  /** Called with a school id to highlight it, or null to clear. This component does its own "click the same row again -> clear" toggle before calling it (mirroring DeckMap's point-click handler). */
  onHighlightSchool: (id: string | null) => void;
}

type LevelFilter = SchoolLevel | "all";

const LEVEL_FILTERS: LevelFilter[] = ["all", ...SCHOOL_LEVEL_ORDER];
const LEVEL_FILTER_LABELS: Record<LevelFilter, string> = { all: "전체", ...SCHOOL_LEVEL_LABELS };

/** desc by students; a null student count (rare — 자료 없음) sorts last rather than first/undefined-ordered. */
function byStudentsDesc(a: School, b: School): number {
  if (a.students === b.students) return 0;
  if (a.students === null) return 1;
  if (b.students === null) return -1;
  return b.students - a.students;
}

interface OtherIndicatorRow {
  group: IndicatorGroup;
  id: string;
  label: string;
  valueText: string;
  rankText: string;
  isCurrent: boolean;
}

/**
 * The right panel's selected state: the current indicator's value/rank/전북
 * 대비 for `regionCode`, its 5-year trend (Sparkline), and a full 15-row
 * "다른 지표" table. Self-contained like IndicatorMenu/RegionList — reads
 * `indicatorId`/`regionCode` and writes both via useMapQuery() itself, so
 * Dashboard only needs to pass the loaded data bundle (and only render this
 * at all once `regionCode` is set — the `!regionCode` guard below is a
 * defensive fallback, not the primary gate).
 */
export default function RegionPanel({ bundle, highlightedSchoolId, onHighlightSchool }: RegionPanelProps) {
  const { indicatorId, regionCode, setIndicator, setRegion } = useMapQuery();
  const [levelFilter, setLevelFilter] = useState<LevelFilter>("all");

  if (!regionCode) return null;

  const def = indicatorById(indicatorId);
  if (!def) throw new Error(`RegionPanel: unknown indicatorId "${indicatorId}"`);

  const file = bundle.indicators[indicatorId];
  const map = valueMap(file);
  const label = displayLabel(def, bundle.series);
  const value = map.get(regionCode);
  const regionRank = rank(map).get(regionCode) ?? null;
  const delta = vsProvince(map, regionCode);
  // Fix-round-1 ruling (tooltipText.ts): count-kind 52000 rows are a total
  // (총계), not an average, so only ratio-kind indicators say "평균 대비".
  const deltaNoun = def.kind === "ratio" ? "평균" : "총계";
  // Same warning-tone rule as KpiTiles: an INCREASE is only ever flagged when
  // higher reads as worse.
  const isWarnDelta = delta !== null && delta > 0 && def.polarity === "higherWorse";

  // Task 4B — 학교 목록: the selected 시군's schools, then the 학교급 chip
  // filter, sorted by students desc. The summary line ("학교 N개 · 소규모
  // M개") intentionally reflects THIS filtered set (not the region's full
  // count) so it always matches what the table below actually shows.
  const regionSchools = bundle.schools.schools.filter((s) => s.regionCode === regionCode);
  const filteredSchools = (levelFilter === "all" ? regionSchools : regionSchools.filter((s) => s.level === levelFilter))
    .slice()
    .sort(byStudentsDesc);
  const smallCount = filteredSchools.filter((s) => s.small).length;
  // fix-round-1: 특수학교 rows carry no coordinate (see School.locationMissingReason) — surfaced in the summary line whenever the current filter includes any.
  const noLocationCount = filteredSchools.filter((s) => s.lat === null).length;

  const seriesFile = bundle.series[indicatorId];
  const trendRows = seriesFile ? trend(seriesFile, regionCode) : [];

  const otherRows: OtherIndicatorRow[] = INDICATORS.map((otherDef) => {
    const otherMap = valueMap(bundle.indicators[otherDef.id]);
    const otherValue = otherMap.get(regionCode);
    const otherRank = rank(otherMap).get(regionCode) ?? null;
    return {
      group: otherDef.group,
      id: otherDef.id,
      label: otherDef.label,
      valueText: otherValue === null || otherValue === undefined ? "자료 없음" : otherDef.format(otherValue),
      rankText: otherRank !== null ? `${otherRank}위` : "–",
      isCurrent: otherDef.id === indicatorId,
    };
  });

  // Plain block flow, no inner scroll region: Dashboard's <aside> is
  // already `overflow-y-auto` at a fixed 360px width — letting it scroll
  // this whole panel as one unit (rather than nesting a second `flex-1
  // overflow-y-auto` pocket just around the 다른 지표 table) means every
  // row is always in normal flow. A nested scroll pocket here previously
  // left the last group's rows scrolled out of view with no visible
  // scrollbar (confirmed against a real screenshot) — easy to misread as
  // missing data. What now scrolls out of view on a short viewport is the
  // footer, which reads unambiguously as "there's more below".
  return (
    <div className="text-[#e6e9f0]">
      <div className="mb-3 flex items-start justify-between gap-2">
        <h2 className="text-lg font-semibold">{regionName(regionCode)}</h2>
        <button
          type="button"
          aria-label="선택 해제"
          onClick={() => setRegion(null)}
          className="rounded px-2 py-1 text-[#e6e9f0]/60 hover:bg-white/10 hover:text-[#e6e9f0]"
        >
          ✕
        </button>
      </div>

      <section className="mb-4 rounded-lg bg-white/5 p-3">
        <p data-testid="region-panel-current-label" className="text-xs text-[#e6e9f0]/60">
          {label}
        </p>
        <p className="mt-1 tabular-nums">
          <span data-testid="region-panel-current-value" className="text-2xl font-bold">
            {value === null || value === undefined ? "자료 없음" : def.format(value)}
          </span>
          <span className="ml-1 text-sm text-[#e6e9f0]/50">{def.unit}</span>
        </p>
        <p className="mt-1 text-xs text-[#e6e9f0]/70">
          {regionRank !== null ? `${REGION_CODES.length}개 시군 중 ${regionRank}위` : "순위 없음"}
        </p>
        <p
          data-testid="region-panel-delta"
          className={`text-xs ${isWarnDelta ? "text-orange-400" : "text-[#e6e9f0]/70"}`}
        >
          {delta === null ? `전북 ${deltaNoun} 대비 자료 없음` : `전북 ${deltaNoun} 대비 ${formatDelta(def, delta)}`}
        </p>
      </section>

      <section className="mb-4">
        <p className="mb-1 text-xs text-[#e6e9f0]/60">추이</p>
        {seriesFile ? <Sparkline data={trendRows} /> : <p className="text-xs text-[#e6e9f0]/50">추이 없음</p>}
      </section>

      <section className="mb-4">
        <p className="mb-1 text-xs text-[#e6e9f0]/60">다른 지표</p>
        <table className="w-full border-collapse text-xs">
          <tbody>
            {GROUP_ORDER.flatMap((group) => {
              const items = otherRows.filter((row) => row.group === group);
              if (items.length === 0) return [];
              return [
                <tr key={`${group}-header`}>
                  <th
                    scope="colgroup"
                    colSpan={3}
                    className="pt-2 pb-1 text-left text-[10px] font-normal uppercase tracking-wide text-[#e6e9f0]/40"
                  >
                    {GROUP_LABELS[group]}
                  </th>
                </tr>,
                // The whole row activates the indicator switch (fix round 1,
                // review finding #3) — only the label cell used to. The
                // <button> stays the sole keyboard/a11y affordance (tab
                // stop, accessible name); the <tr>'s own onClick is a
                // mouse-only convenience for the rest of the row. The
                // button's handler stops propagation so a click ON the
                // button doesn't ALSO fire the row's handler (it would
                // bubble there otherwise — same setIndicator(row.id) call,
                // so a double-fire would be silently idempotent rather than
                // visibly broken, but the guard makes that explicit instead
                // of accidental).
                ...items.map((row) => (
                  <tr
                    key={row.id}
                    onClick={() => setIndicator(row.id)}
                    className="cursor-pointer hover:bg-white/5"
                  >
                    <td className="py-0.5">
                      <button
                        type="button"
                        data-testid={`other-indicator-${row.id}`}
                        aria-current={row.isCurrent ? "true" : undefined}
                        onClick={(event) => {
                          event.stopPropagation();
                          setIndicator(row.id);
                        }}
                        className={`w-full rounded px-1 py-0.5 text-left ${
                          row.isCurrent ? "bg-white/10 font-semibold" : ""
                        }`}
                      >
                        {row.label}
                      </button>
                    </td>
                    <td className="py-0.5 text-right tabular-nums text-[#e6e9f0]/80">{row.valueText}</td>
                    <td className="py-0.5 pl-2 text-right tabular-nums text-[#e6e9f0]/50">{row.rankText}</td>
                  </tr>
                )),
              ];
            })}
          </tbody>
        </table>
      </section>

      <section className="mb-4">
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <p className="text-xs text-[#e6e9f0]/60">
            학교 {filteredSchools.length}개 · 소규모 {smallCount}개
            {noLocationCount > 0 && <> · 위치 없음 {noLocationCount}개</>}
          </p>
          <p className="text-[10px] text-[#e6e9f0]/40">위치 기준 {bundle.schools.referenceDate.location}</p>
        </div>

        <div className="mb-2 flex flex-wrap gap-1">
          {LEVEL_FILTERS.map((level) => (
            <button
              key={level}
              type="button"
              onClick={() => setLevelFilter(level)}
              aria-pressed={levelFilter === level}
              className={`rounded px-2 py-0.5 text-xs ${
                levelFilter === level ? "bg-white/20 font-semibold text-[#e6e9f0]" : "text-[#e6e9f0]/60 hover:bg-white/10"
              }`}
            >
              {LEVEL_FILTER_LABELS[level]}
            </button>
          ))}
        </div>

        {filteredSchools.length === 0 ? (
          <p className="text-xs text-[#e6e9f0]/50">해당 학교급의 학교가 없습니다</p>
        ) : (
          <table className="w-full border-collapse text-xs">
            <tbody>
              {filteredSchools.map((school) => {
                const isHighlighted = school.id === highlightedSchoolId;
                return (
                  <tr
                    key={school.id}
                    data-testid={`school-row-${school.id}`}
                    aria-current={isHighlighted ? "true" : undefined}
                    onClick={() => onHighlightSchool(isHighlighted ? null : school.id)}
                    className={`cursor-pointer ${isHighlighted ? "bg-white/15" : "hover:bg-white/5"}`}
                  >
                    <td className="py-0.5 pr-1">
                      <span className="mr-1 inline-block rounded bg-white/10 px-1 text-[10px] text-[#e6e9f0]/70">
                        {SCHOOL_LEVEL_LABELS[school.level]}
                      </span>
                      {school.name}
                      {school.branch && (
                        <span className="ml-1 inline-block rounded bg-white/10 px-1 text-[10px] text-[#e6e9f0]/50">
                          분교장
                        </span>
                      )}
                      {school.small && (
                        <span className="ml-1 inline-block rounded bg-orange-400/20 px-1 text-[10px] text-orange-300">
                          소규모
                        </span>
                      )}
                      {school.lat === null && (
                        <span
                          className="ml-1 inline-block rounded bg-white/10 px-1 text-[10px] text-[#e6e9f0]/50"
                          title={school.locationMissingReason}
                        >
                          위치 없음
                        </span>
                      )}
                    </td>
                    <td className="py-0.5 text-right tabular-nums text-[#e6e9f0]/80">
                      {school.students === null ? "자료 없음" : `${school.students.toLocaleString("ko-KR")}명`}
                    </td>
                    <td className="py-0.5 pl-2 text-right tabular-nums text-[#e6e9f0]/50">
                      {school.studentsPerClass === null ? "–" : school.studentsPerClass.toFixed(1)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      <footer className="text-[10px] text-[#e6e9f0]/40">
        {def.source.name} · {referenceDateLabel(bundle.manifest, file)}
      </footer>
    </div>
  );
}
