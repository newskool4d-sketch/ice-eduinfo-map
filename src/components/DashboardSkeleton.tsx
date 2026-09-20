/**
 * The <Suspense> fallback for Dashboard in app/page.tsx. nuqs's useMapQuery()
 * (used inside Dashboard) calls useSearchParams() under the hood, which
 * requires a Suspense boundary above it for `next build`'s static
 * prerendering — this is the static shell Next renders in that gap, before
 * Dashboard itself takes over client-side. Layout skeleton only: same
 * 56px-header + fill-body shape as the real Dashboard, dark, no data.
 */
export default function DashboardSkeleton() {
  return (
    <div className="grid h-full grid-rows-[56px_1fr] bg-[#0b0f19] text-[#e6e9f0]">
      <header className="flex h-14 shrink-0 items-center gap-4 border-b border-white/10 px-4">
        <span className="shrink-0 text-base font-semibold">전북교육지도</span>
      </header>
      <div className="flex items-center justify-center text-sm text-[#e6e9f0]/50">지도 준비 중</div>
    </div>
  );
}
