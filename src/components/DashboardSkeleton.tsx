import TopBar from "@/components/panels/TopBar";
import { DEFAULT_INDICATOR_ID } from "@/lib/indicators/registry";
import { ACTIVE_PROFILE } from "@/lib/profiles";

/**
 * The <Suspense> fallback for Dashboard in app/page.tsx. nuqs's useMapQuery()
 * (used inside Dashboard) calls useSearchParams() under the hood, which
 * requires a Suspense boundary above it for `next build`'s static
 * prerendering — this is the static shell Next renders in that gap, before
 * Dashboard itself takes over client-side.
 *
 * Layout skeleton only, light theme, no data: reuses TopBar with `bundle={null}`
 * (its own loading state — indicator menu + KPI tiles render as skeleton
 * bars) rather than duplicating that markup here. `indicatorId` is never
 * displayed in the bundle-less state, so any valid id works.
 *
 * The Incheon profile replaces TopBar with IncheonHeader once loaded, and
 * TopBar's validation note ("폐교·연도별 추이는 제공 준비 중") contradicts the
 * Incheon trends panel (code review 2026-11-07). IncheonHeader itself needs
 * DesignProvider/URL state, so the Incheon shell is a neutral title bar only.
 */
export default function DashboardSkeleton() {
  return (
    <div className="grid h-full grid-rows-[56px_1fr] bg-paper text-ink">
      {ACTIVE_PROFILE.id === "incheon"
        ? <header className="flex items-center border-b border-line px-4 text-base font-semibold">인천 교육지도</header>
        : <TopBar indicatorId={DEFAULT_INDICATOR_ID} bundle={null} />}
      <div className="flex items-center justify-center text-sm text-ink-muted">지도 준비 중</div>
    </div>
  );
}
