"use client";

import { useMemo, type ReactNode } from "react";

import MapShell from "@/components/map/MapShell";
import Legend from "@/components/panels/Legend";
import TopBar from "@/components/panels/TopBar";
import { DataProvider, useData } from "@/lib/data/DataProvider";
import type { DataBundle } from "@/lib/data/types";
import { indicatorById } from "@/lib/indicators/registry";
import { makeColorScale, paletteFor } from "@/lib/colors";
import { displayLabel, regionValues, valueMap } from "@/lib/stats";
import { useMapQuery } from "@/lib/state/urlState";

function CenteredMessage({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full w-full items-center justify-center bg-[#0b0f19] px-6 text-center text-sm text-[#e6e9f0]/50">
      {children}
    </div>
  );
}

function DashboardInner({ bundle, indicatorId }: { bundle: DataBundle; indicatorId: string }) {
  const def = indicatorById(indicatorId);
  if (!def) throw new Error(`Dashboard: unknown indicatorId "${indicatorId}"`);
  const file = bundle.indicators[indicatorId];

  const map = useMemo(() => valueMap(file), [file]);
  // Only `ticks` is needed here — Dashboard renders Legend, not the 3D
  // layers, so `colorOf` itself (also returned by makeColorScale) isn't
  // consumed here; DeckMap independently derives its own copy of the full
  // color scale from the same pure function over the same bundle+indicatorId
  // inputs (see "상태 위치" in the brief — no scale objects are prop-drilled
  // between Dashboard and DeckMap).
  const { ticks } = useMemo(() => makeColorScale(def, map), [def, map]);
  const palette = useMemo(() => paletteFor(def.polarity), [def.polarity]);
  const hasNull = useMemo(() => regionValues(map).some((r) => r.value === null), [map]);
  // The registry's static label with students_change_5y's "5년" replaced by
  // the real series year span (추가 요구 #5) — Legend's `def` prop is
  // otherwise passed straight from the registry, so this is the one field we
  // override before handing it to Legend.
  const legendDef = useMemo(() => ({ ...def, label: displayLabel(def, bundle.series) }), [def, bundle.series]);

  return (
    <div className="grid grid-rows-[1fr_auto] overflow-hidden">
      <div className="grid grid-cols-[1fr_360px] overflow-hidden">
        <main className="relative min-h-0 min-w-0 overflow-hidden">
          <MapShell indicatorId={indicatorId} />
        </main>

        <aside className="w-[360px] overflow-y-auto border-l border-white/10 p-4">
          <p className="text-sm text-[#e6e9f0]/50">시군을 선택하세요</p>
        </aside>
      </div>

      <footer className="flex min-h-12 items-center overflow-x-auto border-t border-white/10 px-4 py-2">
        <Legend def={legendDef} ticks={ticks} palette={palette} hasNull={hasNull} referenceDate={file.referenceDate} />
      </footer>
    </div>
  );
}

function DashboardBody() {
  // URL is the source of truth for indicatorId (nuqs) — this replaces Task
  // 2's local useState. Called unconditionally here (not inside the
  // status === "ready" branch below), so the URL is established immediately
  // and TopBar (rendered regardless of load status) always has it.
  const { indicatorId } = useMapQuery();
  const state = useData();
  const bundle = state.status === "ready" ? state.bundle : null;

  return (
    <div className="grid h-full grid-rows-[56px_1fr] bg-[#0b0f19] text-[#e6e9f0]">
      <TopBar indicatorId={indicatorId} bundle={bundle} />
      {state.status === "loading" && <CenteredMessage>데이터 불러오는 중…</CenteredMessage>}
      {state.status === "error" && (
        <CenteredMessage>데이터를 불러오지 못했습니다: {state.error}</CenteredMessage>
      )}
      {state.status === "ready" && <DashboardInner bundle={state.bundle} indicatorId={indicatorId} />}
    </div>
  );
}

export default function Dashboard() {
  return (
    <DataProvider>
      <DashboardBody />
    </DataProvider>
  );
}
