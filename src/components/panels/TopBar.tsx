import type { DataBundle } from "@/lib/data/types";
import { referenceDateLabel } from "@/lib/stats";

import IndicatorMenu from "./IndicatorMenu";
import KpiTiles from "./KpiTiles";

export interface TopBarProps {
  /** The current `indicator` URL param — needed here only to look up its file's referenceDate (기준일). */
  indicatorId: string;
  /** null while DataProvider is loading/erroring — IndicatorMenu and KpiTiles show skeletons in that case. */
  bundle: DataBundle | null;
}

function SkeletonBar({ className }: { className: string }) {
  return <div aria-hidden className={`animate-pulse rounded bg-white/10 ${className}`} />;
}

/**
 * The 56px-fixed status-room header: title / IndicatorMenu / (right-aligned)
 * KpiTiles / 기준일. `relative z-40` keeps this whole header — and
 * IndicatorMenu's absolutely-positioned popover inside it — painted above
 * the deck.gl canvas below (which has no z-index of its own, but sits later
 * in DOM order in the same stacking context and would otherwise paint over
 * an unstacked header).
 */
export default function TopBar({ indicatorId, bundle }: TopBarProps) {
  const file = bundle?.indicators[indicatorId];

  return (
    <header className="relative z-40 flex h-14 shrink-0 items-center gap-4 border-b border-white/10 bg-[#0b0f19] px-4">
      <span className="shrink-0 text-base font-semibold text-[#e6e9f0]">전북교육지도</span>

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

        <span className="shrink-0 text-xs tabular-nums text-[#e6e9f0]/70">
          {bundle && file ? referenceDateLabel(bundle.manifest, file) : <SkeletonBar className="h-4 w-20" />}
        </span>
      </div>
    </header>
  );
}
