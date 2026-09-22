"use client";

import { parseAsString, useQueryState } from "nuqs";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import IssueExplorer, { IssueLegend } from "@/components/panels/IssueExplorer";
import { useIssueData } from "@/lib/issues/useIssueData";
import { issueById } from "@/lib/issues/registry";
import { buildIssueModel } from "@/lib/issues/model";
import SchoolExplorer, {
  SchoolLegend,
} from "@/components/panels/SchoolExplorer";
import { filterSchools, type SchoolFilters } from "@/lib/schools/filter";
import { hasCoordinates } from "@/components/map/layers/schoolLayers";
import MapShell from "@/components/map/MapShell";
import Footer from "@/components/panels/Footer";
import Legend from "@/components/panels/Legend";
import RegionList from "@/components/panels/RegionList";
import RegionPanel from "@/components/panels/RegionPanel";
import TopBar from "@/components/panels/TopBar";
import { DataProvider, useData, useRetry } from "@/lib/data/DataProvider";
import type { DataBundle } from "@/lib/data/types";
import type { RegionCode } from "@/lib/geo/regions";
import { indicatorById } from "@/lib/indicators/registry";
import { makeColorScale, paletteFor } from "@/lib/colors";
import { displayLabel, regionValues, valueMap } from "@/lib/stats";
import { MAP_VIEWS, useMapQuery } from "@/lib/state/urlState";

function CenteredMessage({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full w-full items-center justify-center bg-paper px-6 text-center text-sm text-ink-muted">
      {children}
    </div>
  );
}

/**
 * Task 6, Section A.5 — DataProvider's error state: shows the underlying
 * cause (load.ts's fetchJson throws e.g. "loadBundle: failed to fetch
 * /data/regions.geojson (HTTP 404)" — filename + HTTP status already
 * embedded in the message for the common "file missing/renamed" case) and a
 * "다시 시도" button that re-runs the SAME load from scratch via
 * DataProvider's useRetry().
 */
function DataErrorMessage({ error }: { error: string }) {
  const retry = useRetry();
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-paper px-6 text-center text-sm text-ink-muted">
      <p>데이터를 불러오지 못했습니다.</p>
      <p className="max-w-md text-xs text-ink-muted">{error}</p>
      <button
        type="button"
        onClick={retry}
        className="rounded bg-ink/5 px-3 py-1.5 text-ink hover:bg-ink/15"
      >
        다시 시도
      </button>
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
  const { ticks, colorBuckets } = useMemo(
    () => makeColorScale(def, map),
    [def, map],
  );
  const palette = useMemo(() => paletteFor(def.polarity), [def.polarity]);
  const hasNull = useMemo(
    () => regionValues(map).some((r) => r.value === null),
    [map],
  );
  // fix round, review finding #4 — the Legend's "(특수학교는 위치 자료 없음)"
  // caveat must only show for a region that actually HAS such a school; a
  // school's own regionCode never equals `regionCode` when it's null, so
  // this is safely false without a selected region too.
  const hasSchoolsWithoutLocation = useMemo(
    () =>
      bundle.schools.schools.some(
        (s) => s.regionCode === regionCode && s.lat === null,
      ),
    [bundle.schools, regionCode],
  );
  // The registry's static label with students_change_5y's "5년" replaced by
  // the real series year span (추가 요구 #5) — Legend's `def` prop is
  // otherwise passed straight from the registry, so this is the one field we
  // override before handing it to Legend.
  const legendDef = useMemo(
    () => ({ ...def, label: displayLabel(def, bundle.series) }),
    [def, bundle.series],
  );

  const [name, setName] = useState("");
  const [level, setLevel] = useState<SchoolFilters["level"]>("all");
  const { view: tab, setView: setTab, issueId, issueMetric, setIssue, setIssueMetric } = useMapQuery();
  const { state: issueState, retry: retryIssues } = useIssueData(tab === "issues" || ["special_classes", "special_students", "zero_entrant_schools"].includes(indicatorId), bundle.schools);
  const issueModel = useMemo(() => {
    const definition = issueById(issueId);
    return tab === "issues" && definition && issueState.status === "ready"
      ? buildIssueModel(bundle, issueState.data, definition, issueMetric)
      : null;
  }, [tab, issueId, issueMetric, issueState, bundle]);
  const [panelOpen, setPanelOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [highlightedSchoolId, setHighlightedSchoolId] = useQueryState("school", parseAsString.withOptions({ history: "push", shallow: true }));
  const [schoolFocusNonce, setSchoolFocusNonce] = useState(0);
  const panelRef = useRef<HTMLElement>(null);
  const panelButtonRef = useRef<HTMLButtonElement>(null);
  const panelReturnFocusRef = useRef<HTMLElement | null>(null);
  const filteredSchools = useMemo(
    () => tab === "issues"
      ? (issueModel?.schools ?? bundle.schools.schools).filter((school) => !regionCode || school.regionCode === regionCode)
      : filterSchools(bundle.schools.schools, { name, level, regionCode }),
    [bundle.schools, name, level, regionCode, tab, issueModel],
  );
  const selectedSchool =
    filteredSchools.find((s) => s.id === highlightedSchoolId) ?? null;
  useEffect(() => {
    if (highlightedSchoolId && !selectedSchool) void setHighlightedSchoolId(null, { history: "replace" });
  }, [highlightedSchoolId, selectedSchool, setHighlightedSchoolId]);

  useEffect(() => {
    if (!panelOpen) return;
    const previous =
      panelReturnFocusRef.current ??
      (document.activeElement as HTMLElement | null);
    const opener = panelButtonRef.current;
    panelRef.current
      ?.querySelector<HTMLButtonElement>('[aria-label="패널 닫기"]')
      ?.focus();
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        setPanelOpen(false);
      }
    };
    document.addEventListener("keydown", close, true);
    return () => {
      document.removeEventListener("keydown", close, true);
      if (previous?.isConnected) previous.focus();
      else opener?.focus();
    };
  }, [panelOpen]);

  useEffect(() => {
    const compact = window.matchMedia("(max-width: 1023px)");
    const resize = () => {
      if (!compact.matches) setPanelOpen(false);
    };
    compact.addEventListener("change", resize);
    return () => compact.removeEventListener("change", resize);
  }, []);

  const selectSchool = (id: string | null) => {
    setHighlightedSchoolId(id);
    if (id) setCollapsed(false);
    setSchoolFocusNonce((n) => n + 1);
    if (id) requestAnimationFrame(() => panelRef.current?.querySelector('[aria-label="선택한 학교"]')?.scrollIntoView({ block: "nearest" }));
    if (
      id &&
      bundle.schools.schools.find((s) => s.id === id && hasCoordinates(s))
    )
      setPanelOpen(false);
  };
  const changeFilters = (filters: SchoolFilters) => {
    setName(filters.name);
    setLevel(filters.level);
    if (filters.regionCode !== regionCode)
      setRegion(filters.regionCode as RegionCode | null);
  };
  const showStatistics = (code: RegionCode) => {
    setRegion(code);
    setTab("statistics");
    setCollapsed(false);
    setPanelOpen(window.matchMedia("(max-width: 1023px)").matches);
  };

  return (
    <div className="flex min-h-0 flex-col overflow-hidden">
      <span
        aria-live="polite"
        className="sr-only"
        data-testid="indicator-announcement"
      >{`지표 변경: ${legendDef.label}`}</span>
      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        {panelOpen && (
          <button
            type="button"
            aria-label="패널 바깥 닫기"
            onClick={() => setPanelOpen(false)}
            className="fixed inset-0 z-40 bg-ink/20 lg:hidden"
          />
        )}
        <aside
          ref={panelRef}
          aria-label="학교 탐색 및 시군 통계"
          role={panelOpen ? "dialog" : undefined}
          aria-modal={panelOpen ? true : undefined}
          onKeyDown={(event) => {
            if (!panelOpen || event.key !== "Tab") return;
            const items = Array.from(
              event.currentTarget.querySelectorAll<HTMLElement>(
                'button, input, select, a[href], summary, [tabindex="0"]',
              ),
            ).filter(
              (el) =>
                el.getClientRects().length &&
                el.tabIndex >= 0 &&
                !el.hasAttribute("disabled"),
            );
            const first = items[0],
              last = items[items.length - 1];
            if (event.shiftKey && document.activeElement === first) {
              event.preventDefault();
              last?.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
              event.preventDefault();
              first?.focus();
            }
          }}
          className={`${panelOpen ? "flex" : "hidden"} ${collapsed ? "lg:hidden" : "lg:flex"} fixed inset-x-0 bottom-0 z-50 max-h-[75%] flex-col rounded-t-2xl border-t border-line bg-surface shadow-xl lg:relative lg:inset-auto lg:z-10 lg:h-full lg:max-h-none lg:w-[360px] lg:shrink-0 lg:rounded-none lg:border-r lg:border-t-0 lg:shadow-none`}
        >
          <div className="flex shrink-0 items-center gap-1 border-b border-line px-3 py-2">
            <div
              role="tablist"
              aria-label="탐색 유형"
              className="flex flex-1 gap-1"
            >
              {MAP_VIEWS.map((value, index) => (
                <button
                  type="button"
                  role="tab"
                  id={`tab-${value}`}
                  aria-controls={`panel-${value}`}
                  aria-selected={tab === value}
                  tabIndex={tab === value ? 0 : -1}
                  key={value}
                  onClick={() => setTab(value)}
                  onKeyDown={(event) => {
                    if (
                      ["ArrowLeft", "ArrowRight", "Home", "End"].includes(
                        event.key,
                      )
                    ) {
                      event.preventDefault();
                      const next = event.key === "Home" ? MAP_VIEWS[0]
                        : event.key === "End" ? MAP_VIEWS[MAP_VIEWS.length - 1]
                        : MAP_VIEWS[(index + (event.key === "ArrowRight" ? 1 : MAP_VIEWS.length - 1)) % MAP_VIEWS.length];
                      setTab(next);
                      document.getElementById(`tab-${next}`)?.focus();
                    }
                  }}
                  className={`min-h-11 rounded-lg px-3 text-sm ${tab === value ? "bg-accent-soft font-semibold text-accent-text" : "text-ink-muted hover:bg-paper"}`}
                >
                  {value === "schools" ? "학교 탐색" : value === "issues" ? "교육문제" : "시군 통계"}
                </button>
              ))}
            </div>
            <button
              type="button"
              aria-label="패널 닫기"
              onClick={() => {
                setPanelOpen(false);
                setCollapsed(true);
              }}
              className="min-h-11 min-w-11 rounded-lg text-ink-muted hover:bg-paper"
            >
              ✕
            </button>
          </div>
          <div
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4"
            role="tabpanel"
            id={`panel-${tab}`}
            aria-labelledby={`tab-${tab}`}
          >
            {tab === "schools" ? (
              <SchoolExplorer
                schools={filteredSchools}
                filters={{ name, level, regionCode }}
                onFilters={changeFilters}
                selectedSchoolId={highlightedSchoolId}
                selectedSchool={selectedSchool}
                onSelect={selectSchool}
                onStatistics={showStatistics}
              />
            ) : tab === "issues" ? (
              issueState.status === "ready" ? <IssueExplorer
                bundle={bundle} data={issueState.data} model={issueModel} issueId={issueId}
                region={regionCode} schools={filteredSchools} selectedSchool={selectedSchool}
                onIssue={(id) => { setHighlightedSchoolId(null); setIssue(id); }}
                onMetric={(metric) => { setHighlightedSchoolId(null); setIssueMetric(metric); }}
                onRegion={setRegion} onSchool={selectSchool} onStatistics={showStatistics}
                onSearch={(code) => { setName(""); setLevel("all"); setRegion(code); setTab("schools"); }}
              /> : issueState.status === "error" ? <div role="alert" className="space-y-3 text-sm"><p>{issueState.message}</p><button className="min-h-11 rounded border border-line px-3" onClick={retryIssues}>다시 시도</button></div>
              : <p role="status" className="py-8 text-sm text-ink-muted">교육문제 자료 불러오는 중…</p>
            ) : (
              <>
                {regionCode ? (
                  <RegionPanel
                    bundle={bundle}
                    highlightedSchoolId={highlightedSchoolId}
                    onHighlightSchool={selectSchool}
                    showSchools={false}
                  />
                ) : (
                  <RegionList bundle={bundle} />
                )}
                <div className="mt-4 border-t border-line pt-4">
                  <Legend
                    def={legendDef}
                    ticks={ticks}
                    palette={palette}
                    hasNull={hasNull}
                    referenceDate={file.referenceDate}
                    hasSchoolsWithoutLocation={hasSchoolsWithoutLocation}
                    colorBuckets={colorBuckets}
                  />
                </div>
                <footer
                  role="contentinfo"
                  aria-label="데이터 출처"
                  className="mt-4"
                >
                  <Footer manifest={bundle.manifest} />
                </footer>
              </>
            )}
          </div>
        </aside>
        <main className="relative min-h-0 min-w-0 flex-1 overflow-hidden">
          <MapShell
            indicatorId={indicatorId}
            selectedCode={regionCode}
            onSelect={setRegion}
            highlightedSchoolId={highlightedSchoolId}
            onHighlightSchool={selectSchool}
            schools={filteredSchools}
            schoolFocusNonce={schoolFocusNonce}
            issueModel={issueModel}
            schoolFacts={issueState.status === "ready" ? issueState.data : null}
            statisticsVisible={tab === "statistics"}
            interactionBlocked={panelOpen}
          />
          <button
            ref={panelButtonRef}
            type="button"
            onClick={(event) => {
              panelReturnFocusRef.current = event.currentTarget;
              setPanelOpen(window.matchMedia("(max-width: 1023px)").matches);
              setCollapsed(false);
            }}
            className={`${collapsed ? "" : "lg:hidden"} absolute left-3 top-3 z-10 min-h-11 rounded-lg border border-line bg-surface px-3 text-sm font-medium shadow-sm`}
          >
            학교·통계
          </button>
          {selectedSchool && (
            <button
              type="button"
              aria-label={`${selectedSchool.name} 학교 정보 보기`}
              onClick={(event) => {
                panelReturnFocusRef.current = event.currentTarget;
                setPanelOpen(window.matchMedia("(max-width: 1023px)").matches);
                if (tab !== "issues") setTab("schools");
                requestAnimationFrame(() => panelRef.current?.querySelector('[aria-label="선택한 학교"]')?.scrollIntoView({ block: "nearest" }));
              }}
              className={`${panelOpen ? "hidden" : ""} absolute bottom-20 left-16 right-3 z-10 rounded-xl border border-accent/30 bg-surface p-3 text-left text-sm shadow-lg lg:hidden`}
            >
              <span className="font-semibold">{selectedSchool.name}</span>
              <span className="ml-2 text-xs text-ink-muted">
                학교 정보 보기
              </span>
            </button>
          )}
          <div className="pointer-events-none absolute bottom-3 right-3 z-10 rounded-lg border border-line bg-surface/95 px-3 py-2 text-ink-muted shadow-sm">
            {issueModel && <div className="mb-2 border-b border-line pb-2"><IssueLegend model={issueModel} /></div>}
            <SchoolLegend />
          </div>
        </main>
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
    <div className="grid h-full grid-rows-[56px_1fr] bg-paper text-ink">
      <TopBar indicatorId={indicatorId} bundle={bundle} />
      {state.status === "loading" && (
        <CenteredMessage>데이터 불러오는 중…</CenteredMessage>
      )}
      {state.status === "error" && <DataErrorMessage error={state.error} />}
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
