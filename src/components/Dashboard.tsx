"use client";

import { useMemo, useState, type ReactNode } from "react";

import MapShell from "@/components/map/MapShell";
import Footer from "@/components/panels/Footer";
import Legend from "@/components/panels/Legend";
import RegionList from "@/components/panels/RegionList";
import RegionPanel from "@/components/panels/RegionPanel";
import TopBar from "@/components/panels/TopBar";
import { DataProvider, useData } from "@/lib/data/DataProvider";
import type { DataBundle } from "@/lib/data/types";
import type { RegionCode } from "@/lib/geo/regions";
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

function DashboardInner({
  bundle,
  indicatorId,
  regionCode,
  setRegion,
}: {
  bundle: DataBundle;
  indicatorId: string;
  regionCode: RegionCode | null;
  setRegion: (code: RegionCode | null) => void;
}) {
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
  // fix round, review finding #4 — the Legend's "(특수학교는 위치 자료 없음)"
  // caveat must only show for a region that actually HAS such a school; a
  // school's own regionCode never equals `regionCode` when it's null, so
  // this is safely false without a selected region too.
  const hasSchoolsWithoutLocation = useMemo(
    () => bundle.schools.schools.some((s) => s.regionCode === regionCode && s.lat === null),
    [bundle.schools, regionCode],
  );
  // The registry's static label with students_change_5y's "5년" replaced by
  // the real series year span (추가 요구 #5) — Legend's `def` prop is
  // otherwise passed straight from the registry, so this is the one field we
  // override before handing it to Legend.
  const legendDef = useMemo(() => ({ ...def, label: displayLabel(def, bundle.series) }), [def, bundle.series]);

  // Task 4B — the highlighted school (map point / RegionPanel row click).
  // Owned here (not the URL: it's a transient view-state, not something a
  // shared link should restore) and mirrored to both MapShell (map dot
  // highlight) and RegionPanel (row highlight) so either side can drive it.
  // Cleared whenever the selected 시군 itself changes, so a highlighted id
  // from a previous region never silently survives into the next one (it
  // would just never match any point there, but a stale value is still
  // wrong to keep around). Reset-on-prop-change during render (the React-
  // recommended "adjusting state when a prop changes" pattern —
  // react.dev/learn/you-might-not-need-an-effect) rather than in a
  // useEffect, which would cost an extra cascading render for no benefit.
  const [highlightedSchoolId, setHighlightedSchoolId] = useState<string | null>(null);
  const [highlightedForRegion, setHighlightedForRegion] = useState(regionCode);
  if (regionCode !== highlightedForRegion) {
    setHighlightedForRegion(regionCode);
    setHighlightedSchoolId(null);
  }

  return (
    <div className="grid grid-rows-[1fr_auto] overflow-hidden">
      <div className="grid grid-cols-[1fr_360px] overflow-hidden">
        <main className="relative min-h-0 min-w-0 overflow-hidden">
          <MapShell
            indicatorId={indicatorId}
            selectedCode={regionCode}
            onSelect={setRegion}
            highlightedSchoolId={highlightedSchoolId}
            onHighlightSchool={setHighlightedSchoolId}
          />
        </main>

        <aside className="w-[360px] overflow-y-auto border-l border-white/10 p-4">
          {regionCode ? (
            <RegionPanel
              bundle={bundle}
              highlightedSchoolId={highlightedSchoolId}
              onHighlightSchool={setHighlightedSchoolId}
            />
          ) : (
            <RegionList bundle={bundle} />
          )}
        </aside>
      </div>

      <div>
        <footer className="flex min-h-12 flex-wrap items-center gap-x-4 gap-y-1 overflow-x-auto border-t border-white/10 px-4 py-2">
          <Legend
            def={legendDef}
            ticks={ticks}
            palette={palette}
            hasNull={hasNull}
            referenceDate={file.referenceDate}
            schoolLevelsVisible={!!regionCode}
            hasSchoolsWithoutLocation={hasSchoolsWithoutLocation}
          />
        </footer>
        {/* Task 5 — replaces the old inline "학교 위치 기준 …" span: Footer
            now covers every named source (KESS/학교 위치/경계/폐교), read
            entirely from manifest.sources, not just the school-location one. */}
        <Footer manifest={bundle.manifest} />
      </div>
    </div>
  );
}

function DashboardBody() {
  // URL is the source of truth for indicatorId (nuqs) — this replaces Task
  // 2's local useState. Called unconditionally here (not inside the
  // status === "ready" branch below), so the URL is established immediately
  // and TopBar (rendered regardless of load status) always has it.
  const { indicatorId, regionCode, setRegion } = useMapQuery();
  const state = useData();
  const bundle = state.status === "ready" ? state.bundle : null;

  return (
    <div className="grid h-full grid-rows-[56px_1fr] bg-[#0b0f19] text-[#e6e9f0]">
      <TopBar indicatorId={indicatorId} bundle={bundle} />
      {state.status === "loading" && <CenteredMessage>데이터 불러오는 중…</CenteredMessage>}
      {state.status === "error" && (
        <CenteredMessage>데이터를 불러오지 못했습니다: {state.error}</CenteredMessage>
      )}
      {state.status === "ready" && (
        <DashboardInner
          bundle={state.bundle}
          indicatorId={indicatorId}
          regionCode={regionCode}
          setRegion={setRegion}
        />
      )}
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
