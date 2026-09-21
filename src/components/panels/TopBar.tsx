import type { DataBundle } from "@/lib/data/types";

import IndicatorMenu from "./IndicatorMenu";
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
export default function TopBar({ bundle }: TopBarProps) {
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
    <header className="relative z-40 flex h-14 shrink-0 items-center gap-4 border-b border-line bg-paper px-4">
      <span className="shrink-0 text-base font-semibold text-ink">전북교육지도</span>

      {bundle ? (
        <IndicatorMenu series={bundle.series} />
      ) : (
        <SkeletonBar className="h-7 w-56" />
      )}

      <div className="ml-auto flex min-w-0 shrink-0 items-center gap-4">
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
  );
}
