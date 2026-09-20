"use client";

import MapShell from "@/components/map/MapShell";

export default function Dashboard() {
  return (
    <div className="grid h-full grid-rows-[56px_1fr_48px] bg-[#0b0f19] text-[#e6e9f0]">
      <header className="flex h-[56px] items-center gap-4 border-b border-white/10 px-4">
        <span className="text-base font-semibold">전북교육지도</span>
        <span className="text-sm text-[#e6e9f0]/50">조건별 맵 · KPI (준비 중)</span>
      </header>

      <div className="grid grid-cols-[1fr_360px] overflow-hidden">
        <main className="relative min-h-0 min-w-0 overflow-hidden">
          <MapShell />
        </main>

        <aside className="w-[360px] overflow-y-auto border-l border-white/10 p-4">
          <p className="text-sm text-[#e6e9f0]/50">시군을 선택하세요</p>
        </aside>
      </div>

      <footer className="flex h-[48px] items-center border-t border-white/10 px-4">
        <span className="text-xs text-[#e6e9f0]/50">범례 · 출처</span>
      </footer>
    </div>
  );
}
