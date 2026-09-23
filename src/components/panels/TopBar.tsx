import type { DataBundle } from "@/lib/data/types";
import { ACTIVE_PROFILE } from "@/lib/profiles";

import MapTopicMenu from "./MapTopicMenu";
import KpiTiles, { KPI_INDICATOR_IDS } from "./KpiTiles";

export interface TopBarProps {
  /**
   * The current `indicator` URL param. NOT used for the "기준 …" caption
   * (Task 5 fix round 1, coordinator ruling — see the caption's own
   * comment below); kept as a prop because the caller (Dashboard.tsx)
   * already has it on hand and IndicatorMenu's popover reads its own copy
   * via useMapQuery() regardless, so this stays available for any future
   * TopBar need without forcing a Dashboard.tsx change to add it back.
   */
  indicatorId: string;
  onExploreIssues?: () => void;
  /** null while DataProvider is loading/erroring — IndicatorMenu and KpiTiles show skeletons in that case. */
  bundle: DataBundle | null;
}

function SkeletonBar({ className }: { className: string }) {
  return <div aria-hidden className={`animate-pulse rounded bg-ink/10 ${className}`} />;
}

/**
 * The 56px-fixed status-room header: title / IndicatorMenu / (right-aligned)
 * KpiTiles / 기준일. `relative z-40` keeps this whole header — and
 * IndicatorMenu's absolutely-positioned popover inside it — painted above
 * the deck.gl canvas below (which has no z-index of its own, but sits later
 * in DOM order in the same stacking context and would otherwise paint over
 * an unstacked header).
 */
export default function TopBar({ bundle, onExploreIssues }: TopBarProps) {
  // Task 5 fix round 1 (coordinator ruling): this caption sits directly
  // beside KpiTiles' 4 fixed KESS-sourced tiles, so it must show THEIR OWN
  // reference date — never the currently-selected MAP indicator's (that
  // stays exactly where it already showed, in Legend and RegionPanel's own
  // footer). Anchored on KPI_INDICATOR_IDS[0] rather than the `indicatorId`
  // prop; all 4 KPI tiles are KESS-sourced and share one referenceDate, so
  // any of the 4 would give the same value. This bug was invisible before
  // Task 5 because every indicator file happened to share one referenceDate
  // — 폐교 지표 (2026-07-16) is the first to genuinely differ from KESS's
  // (2026-04-01). Rendered as the raw ISO date string (not the
  // no-zero-pad "년.월.일" `referenceDateLabel` format RegionPanel's footer
  // still uses) to match Legend's own "기준일 {referenceDate}" convention —
  // one consistent date format for the two reference-date captions that
  // now coexist in the same view.
  const kpiFile = bundle?.indicators[KPI_INDICATOR_IDS[0]];

  return (
    <div className="shrink-0">
    <header className="relative z-40 flex h-14 shrink-0 items-center gap-2 sm:gap-4 border-b border-line bg-paper px-4">
      <span className="shrink-0 text-base font-semibold text-ink">{ACTIVE_PROFILE.province.shortName}교육지도</span>

      {bundle ? (
        <MapTopicMenu series={bundle.series} onExploreIssues={onExploreIssues} />
      ) : (
        <SkeletonBar className="h-7 w-56" />
      )}

      <div className="ml-auto hidden min-w-0 shrink-0 2xl:flex items-center gap-4">
        {bundle ? (
          <KpiTiles indicators={bundle.indicators} series={bundle.series} manifest={bundle.manifest} />
        ) : (
          <div className="flex shrink-0 items-center gap-2" aria-hidden>
            {Array.from({ length: 4 }).map((_, i) => (
              <SkeletonBar key={i} className="h-10 w-[104px]" />
            ))}
          </div>
        )}

        <span data-testid="topbar-reference-date" className="shrink-0 text-xs tabular-nums text-ink-muted">
          {bundle && kpiFile ? `기준 ${kpiFile.referenceDate}` : <SkeletonBar className="h-4 w-20" />}
        </span>
      </div>
    </header>
    {ACTIVE_PROFILE.validation && <div role="note" className="shrink-0 border-b border-line bg-amber-50 px-4 py-2 text-xs text-ink" data-testid="data-quality-note">
      통계 {ACTIVE_PROFILE.validation.referenceDate} · 경계 2026-07-01 · 검증 {ACTIVE_PROFILE.validation.status}.
      학생수는 KESS 기준(교육청 자료와 91개 학교 차이), 교원은 정규·기간제 합계(휴직 포함, 강사 제외)로 독립 총계 미확보.
      좌표는 서로 다른 기준일의 자료를 연결했습니다. 폐교·연도별 추이는 제공 준비 중입니다.
    </div>}
    </div>
  );
}
