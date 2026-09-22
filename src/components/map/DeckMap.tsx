"use client";

import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import DeckGL from "@deck.gl/react";
import type { DeckGLRef } from "@deck.gl/react";
import { Deck, MapView, WebMercatorViewport } from "@deck.gl/core";
import type { LayersList, PickingInfo } from "@deck.gl/core";
import { LightGlassTheme, ResetViewWidget, ZoomWidget } from "@deck.gl/widgets";
import "@deck.gl/widgets/stylesheet.css";

import {
  isRegionCode,
  regionName,
  REGION_CODES,
  type RegionCode,
} from "@/lib/geo/regions";
import { declutterLabels, type LabelCandidate } from "./declutterLabels";
import type { IssueMapModel } from "@/lib/issues/types";
import type { School } from "@/lib/schools/types";
import { readEmdPref, writeEmdPref } from "@/components/map/emdPref";
import { CONTROLLER, VIEW_LIMITS } from "@/components/map/camera";
import { makeBasemapLayer } from "@/components/map/layers/basemapLayer";
import { makeEmdBoundaryLayer } from "@/components/map/layers/emdLayer";
import { makeRegionLabelLayer } from "@/components/map/layers/labelLayer";
import {
  hasCoordinates,
  makeSchoolLabelsLayer,
} from "@/components/map/layers/schoolLayers";
import { makeSchoolTooltip, makeTooltip } from "@/components/map/tooltip";
import MapOverlay, { type MapOverlayItem } from "@/components/map/MapOverlay";
import { useCamera } from "@/components/map/useCamera";
import { useEmdBoundaries } from "@/components/map/useEmdBoundaries";
import { useFontGate } from "@/components/map/useFontGate";
import { useRegionKeyboardNav } from "@/components/map/useRegionKeyboardNav";
import { useBundle } from "@/lib/data/DataProvider";
import { indicatorById } from "@/lib/indicators/registry";
import {
  collisionPriorityFromRank,
  displayLabel,
  rank,
  valueMap,
} from "@/lib/stats";
import {
  makeLinesOf,
  formatWithUnit,
  schoolTooltipLines,
} from "@/lib/tooltipText";
import { regionRankList, selectionAnnouncement } from "@/lib/selection";
import { useReducedMotion } from "@/lib/useReducedMotion";
import {
  makeFlatRegionsLayer,
  makeFlatSchoolsLayer,
} from "@/components/map/layers/flatMapLayers";

/** School names appear at neighbourhood scale, independently of region selection. */
const SCHOOL_LABEL_MIN_ZOOM = 11;
/** onViewStateChange 스로틀 간격(ms). */
const ZOOM_THROTTLE_MS = 100;

// e2e-only bridge (see e2e/select-region.spec.ts): only ever written when
// NEXT_PUBLIC_E2E=1 (a build-time-inlined env var — see playwright.config.ts's
// webServer.env), never read/written in normal production use.
//
// `events` — CI Linux fix (ci-linux-fixes branch): a small ring of recent
// region-click/pick attempts (handleRegionClick/handleDeckClick below), so
// e2e/select-region.spec.ts's canvas-click test can dump *why* a click
// didn't select a region (never picked at all vs. picked-then-lost) instead
// of only ever seeing the URL's end state.
//
// `selectRegion` — CI Linux fix: exposes handleRegionClick directly. CI runs
// 35542371166 and 35544350592 showed `events` staying completely empty
// (not even a "miss" deck-click) across 6+ synthetic mouse down/up attempts
// spanning 2 separate page loads, even with every readiness gate already
// satisfied — i.e. mjolnir.js's tap gesture recognizer never fires deck.gl's
// onClick at all for the lifetime of some Linux+swiftshader page sessions.
// The canvas-click e2e test uses this to drive the SAME selection codepath
// on Linux CI, so the URL/panel/Esc assertions still exercise the real
// feature there — only the unreliable synthetic gesture is bypassed, never
// the coverage (see the test's own comment for the full reasoning).
declare global {
  interface Window {
    __jbmap?: {
      deck: Deck;
      events?: JbmapEvent[];
      selectRegion?: (code: string) => void;
    };
  }
}

interface JbmapEvent {
  /** "region-click": the regions/region-islands layer's own onClick fired (always a hit, some region code). "deck-click": DeckGL's top-level onClick fired (every click, hit or miss — `picked` distinguishes). */
  type: "region-click" | "deck-click";
  code?: string;
  picked: boolean;
  t: number;
}

const E2E = process.env.NEXT_PUBLIC_E2E === "1";
function recordE2eEvent(event: JbmapEvent) {
  if (!E2E || typeof window === "undefined" || !window.__jbmap) return;
  (window.__jbmap.events ??= []).push(event);
}

// NEXT_PUBLIC_* vars are inlined into the client bundle at build time, so
// this never changes at runtime — no point re-reading it per render. Empty
// string (Next.js's own behavior for an unset NEXT_PUBLIC_* var at runtime,
// vs. simply undefined at build time) is treated the same as "no key" by
// every `VWORLD_KEY &&` gate below.
const VWORLD_KEY = process.env.NEXT_PUBLIC_VWORLD_KEY;

/** Task C — shown under the "배경 지도" MapOverlay control while the basemap is not `off`. No "기준일" word, no date string — those two specifically break e2e/closed-schools.spec.ts's footer-source assertions and tests/components/Footer.test.tsx's 기준일 count (see task-C-brief.md). */
const BASEMAP_ATTRIBUTION = "배경지도 © 국토교통부 브이월드(VWorld)";

function nameOf(code: string): string {
  return isRegionCode(code) ? regionName(code) : code;
}

const VIEW = new MapView();

// 추가 요구 #4: 16px margin (deck.gl/widgets' own default is 12px);
// LightGlassTheme (Task 1 — swapped from DarkGlassTheme for the light UI
// theme) keeps the 전체보기/줌 buttons' chrome consistent with the app's own
// (now light) panels; its translucent, blurred buttons still match the
// glass-widget aesthetic (light theme — spec §1). A MODULE constant,
// not an inline object literal inside the component — Task 6, Section C.3
// ("widgetThemeStyle 등 매 렌더 새 객체를 모듈 상수로"): an inline literal would be
// a NEW object reference every render, pointlessly changing the wrapper
// div's `style` prop identity every time.
const WIDGET_THEME_STYLE: CSSProperties = {
  ...LightGlassTheme,
  "--widget-margin": "16px",
} as CSSProperties;

export interface DeckMapProps {
  issueModel?: IssueMapModel | null;
  schools?: School[];
  schoolFocusNonce?: number;
  statisticsVisible?: boolean;
  interactionBlocked?: boolean;
  indicatorId: string;
  /** Selection truth lives in the URL (useMapQuery().regionCode) — DeckMap only renders/reacts to it. */
  selectedCode: RegionCode | null;
  /** Called with a region code on click/keyboard selection, or null to deselect (Esc / empty-space click). */
  onSelect: (code: RegionCode | null) => void;
  /** The currently-highlighted school (map point click / RegionPanel row click), or null. Task 4B — owned by Dashboard (not the URL), mirrored by RegionPanel's row highlight. */
  highlightedSchoolId: string | null;
  /** Called with a school id to highlight it, or null to clear. DeckMap itself handles the "click the same point again -> clear" toggle before calling this. */
  onHighlightSchool: (id: string | null) => void;
}

export default function DeckMap({
  indicatorId,
  selectedCode,
  onSelect,
  highlightedSchoolId,
  onHighlightSchool,
  schools,
  schoolFocusNonce = 0,
  statisticsVisible = false,
  interactionBlocked = false,
  issueModel = null,
}: DeckMapProps) {
  const bundle = useBundle();
  const [showSchoolNames, setShowSchoolNames] = useState(true);
  const selectedSchool =
    bundle.schools.schools.find((s) => s.id === highlightedSchoolId) ?? null;
  const containerRef = useRef<HTMLDivElement>(null);
  const deckRef = useRef<DeckGLRef | null>(null);
  const mapReadyRef = useRef(false);
  const lastLabelViewportKey = useRef("");
  const [labelViewport, setLabelViewport] =
    useState<WebMercatorViewport | null>(null);
  const labelsReadyRef = useRef(false);

  // Task 6, Section A.4 — reduced-motion: zeroes both the camera's
  // transitionDuration (useCamera) and every layer's own `transitions`
  // (regionLayers/labelLayer/schoolLayers' `transitionDuration` option)
  // below, when `prefers-reduced-motion: reduce` is set.
  const reduceMotion = useReducedMotion();
  // Task 6, "현재 코드 상태" — camera state/effects/flyTo live in useCamera
  // now (split out of this file with no intended behavior change); `regions`
  // (not `regionsMain`) is deliberately what's handed in — `properties.bbox`
  // already spans a region's FULL original geometry (mainland + islands), so
  // the camera never clips an island out of frame.
  const { overview, cameraViewState, reselect, rememberViewState } = useCamera(
    containerRef,
    bundle.regions,
    selectedCode,
    reduceMotion,
    selectedSchool,
    schoolFocusNonce,
  );

  // Task 6, Section A.2 — WebGL context loss: deck.gl's own internal
  // handling (Deck#_onWebGLContextLost) calls onError(new Error('WebGL
  // context is lost')) — matching on "context" (case-insensitively, not an
  // exact string) also catches any OTHER error deck.gl/luma.gl ever phrases
  // slightly differently, while still leaving every unrelated error (a
  // picking bug, a bad accessor, ...) to just log and fall through with no
  // overlay, per the brief. deck.gl's default onError just does
  // `log.error(error.message)`; supplying our own REPLACES that default, so
  // the non-context branch below calls console.error itself to not lose
  // that reporting.
  const [contextLost, setContextLost] = useState(false);
  const handleDeckError = useCallback((error: Error) => {
    if (error.message.toLowerCase().includes("context")) {
      setContextLost(true);
    } else {
      console.error(error);
    }
  }, []);

  const mapCharset = useMemo(() => bundle.charset + (issueModel ? issueModel.regions.map((row) => row.text).join("") : ""), [bundle.charset, issueModel]);
  const { fontReady, fontFamily } = useFontGate(mapCharset);
  // Mirrored into a ref so handleAfterRender (a stable, []-deps callback —
  // see its own comment) can read the LATEST fontReady without itself
  // becoming a new function every time fontReady flips.
  //
  // CI Linux fix (ci-linux-fixes branch, see ci-fix-report.md) — MUST be
  // useLayoutEffect, not useEffect: @deck.gl/react's own <DeckGL> forwards
  // the `layers` prop (which depends on `fontReady`, below) to the
  // underlying Deck instance from ITS OWN layout effect (confirmed:
  // node_modules/@deck.gl/react/dist/deckgl.js uses
  // useIsomorphicLayoutEffect/useLayoutEffect). React flushes ALL layout
  // effects for a commit synchronously, in tree order, before the browser
  // can paint or run a requestAnimationFrame callback — so a layout effect
  // here is guaranteed to update fontReadyRef.current no later than
  // DeckGL's own layout effect pushes the labeled `layers` into deck.
  // A plain (passive) useEffect is NOT guaranteed that ordering: passive
  // effects are flushed via a separate, later (MessageChannel-scheduled)
  // pass, leaving a real window where deck.gl's next render frame could
  // fire — and handleAfterRender read fontReadyRef.current as still false
  // — before this ref updates, silently skipping data-labels-ready on the
  // first labeled frame (the same bug class the rest of this file's CI
  // fixes exist to close, just from the other direction).
  const fontReadyRef = useRef(fontReady);
  useLayoutEffect(() => {
    fontReadyRef.current = fontReady;
  }, [fontReady]);

  // Task 4B: current zoom, throttled to ZOOM_THROTTLE_MS via onViewStateChange
  // below — this is the ONLY thing zoom is tracked for (deciding whether
  // 학교명 라벨 should render, SCHOOL_LABEL_MIN_ZOOM). Not routed through
  // cameraViewState/`initialViewState` — DeckGL's view stays uncontrolled;
  // this is a passive read of whatever zoom the user's own pan/scroll
  // produced. Starts at the overview's minZoom (labels are never visible at
  // that zoom anyway) rather than undefined, so the very first render
  // already has a defined, safely-below-threshold value.
  const [zoom, setZoom] = useState<number>(VIEW_LIMITS.minZoom);
  const lastZoomUpdateRef = useRef(0);
  const handleViewStateChange = useCallback(
    ({ viewState }: { viewState: Record<string, unknown> }) => {
      rememberViewState(viewState);
      const now = Date.now();
      if (now - lastZoomUpdateRef.current < ZOOM_THROTTLE_MS) return;
      lastZoomUpdateRef.current = now;
      const nextZoom = viewState.zoom;
      if (typeof nextZoom !== "number") return;
      // deck.gl/react's <DeckGL> can invoke onViewStateChange synchronously
      // from within its OWN render/transition tick (e.g. mid-FlyTo, or a
      // canvas drag) — calling setState directly from here occasionally lands
      // while a *different* component (ForwardRef(DeckGLWithRef) itself) is
      // still rendering, which React flags: "Cannot update a component while
      // rendering a different component" (confirmed via a real e2e console-
      // error assertion, not just a lint rule — see e2e/select-region.spec.ts's
      // canvas-click test). Deferring one microtask moves the update outside
      // that synchronous call stack (microtasks run after the current script/
      // render finishes, before the next paint) without adding a
      // human-perceptible delay the way a setTimeout(0) macrotask would.
      queueMicrotask(() => setZoom(nextZoom));
    },
    [rememberViewState],
  );

  const def = indicatorById(indicatorId);
  if (!def) {
    throw new Error(`DeckMap: unknown indicatorId "${indicatorId}"`);
  }

  const file = bundle.indicators[indicatorId];
  const map = useMemo(() => valueMap(file), [file]);
  const label = useMemo(
    () => displayLabel(def, bundle.series),
    [def, bundle.series],
  );

  // Rank order for keyboard ←/→ cycling ("현재 순위 순") and, indirectly (via
  // the same pure function), RegionList's render order.
  const orderedCodes = useMemo(() => issueModel ? issueModel.regions.map((row) => row.code) : regionRankList(map), [map, issueModel]);

  // Task B — region-label collision priority (makeRegionLabelLayer's
  // getCollisionPriority/priorityOf — CollisionFilterExtension): reversed
  // value rank (stats.ts's `rank` — 1 = the single biggest value), so a
  // bigger indicator value wins a label collision over a smaller one; a
  // region with no data (absent from `rank`'s map, which omits nulls
  // entirely) gets the lowest priority of ALL, lower than every real rank.
  // Bounded well within CollisionFilterExtension's documented [-1000, 1000]
  // (at most REGION_CODES.length ranks). Independent of `selectedCode` — the
  // selected region's unconditional top priority (1000) is applied inside
  // makeRegionLabelLayer itself, not here.
  const priorityOf = useMemo(() => {
    const ranks = rank(map);
    // B(b) — the rank -> collision-priority mapping itself now lives in
    // stats.ts as a pure, unit-tested helper (collisionPriorityFromRank);
    // this closure only supplies what's specific to THIS render (the rank
    // lookup + REGION_CODES.length).
    return (code: string): number =>
      collisionPriorityFromRank(ranks.get(code), REGION_CODES.length);
  }, [map]);

  const announcement = useMemo(() => {
    if (!selectedCode) return "선택 해제됨, 전체 보기";
    if (issueModel) return `${nameOf(selectedCode)} · ${issueModel.title} · ${issueModel.regions.find((row) => row.code === selectedCode)?.text ?? "자료 없음"}`;
    const value = map.get(selectedCode);
    const r = rank(map).get(selectedCode) ?? null;
    const valueText =
      value === null || value === undefined
        ? "자료 없음"
        : formatWithUnit(def, value);
    return selectionAnnouncement({
      name: nameOf(selectedCode),
      label,
      valueText,
      rank: r,
      total: REGION_CODES.length,
    });
  }, [selectedCode, map, def, label, issueModel]);

  const labelTextOf = useCallback(
    (code: string): string => {
      const name = nameOf(code);
      if (issueModel) return `${name}\n${issueModel.regions.find((row) => row.code === code)?.text ?? "자료 없음"}`;
      if (!statisticsVisible) return name;
      const value = map.get(code);
      if (value === null || value === undefined) return `${name}\n자료 없음`;
      return `${name}\n${def.format(value)}`;
    },
    [map, def, statisticsVisible, issueModel],
  );

  // Tooltip line assembly (name / value / rank / vsProvince delta) lives in
  // src/lib/tooltipText.ts (Fix round 1, review finding #1) — pure and unit
  // tested there (tests/unit/tooltipText.test.ts), with zero deck.gl/React
  // dependency. makeLinesOf computes rank(map) once per def/label/map
  // change (not per hover) and returns the (code) => string[] tooltip fn.
  const linesOf = useMemo(
    () => issueModel ? (code: string) => [nameOf(code), issueModel.title, issueModel.regions.find((row) => row.code === code)?.text ?? "자료 없음", issueModel.date] : makeLinesOf({ def, label, map }),
    [def, label, map, issueModel],
  );

  // Static across indicator switches — regenerating this array on every
  // indicatorId change would give the label TextLayer a new `data` reference
  // each time, defeating deck.gl's diffing (the constraint the task brief
  // calls out explicitly: "매 렌더 새 배열을 만들지 않는다"). Sourced from
  // regionsMain (Task 6, Section C.2): same properties (code/name/labelPoint)
  // as bundle.regions, one feature per region either way. `labelPoint` is
  // already nudged for the 4 시군 that need it (Task B, fix round 1 —
  // build-regions.ts bakes data/manual/label-offsets.json's pixel nudge
  // into labelPoint itself now, not a separate render-time offset).
  const labels = useMemo(
    () =>
      bundle.regionsMain.features.map((f) => ({
        code: f.properties.code,
        name: f.properties.name,
        position: f.properties.labelPoint,
      })),
    [bundle.regionsMain],
  );

  const characterSet = useMemo(
    () => Array.from(new Set(mapCharset)),
    [mapCharset],
  );

  const views = useMemo(() => VIEW, []);

  const positionedSchools = useMemo(
    () => (schools ?? bundle.schools.schools).filter(hasCoordinates),
    [schools, bundle.schools],
  );
  const schoolLabelsVisible = showSchoolNames && zoom >= SCHOOL_LABEL_MIN_ZOOM;
  const handleSchoolClick = useCallback(
    (id: string) => onHighlightSchool(id),
    [onHighlightSchool],
  );

  const visibleLabels = useMemo(() => {
    if (!labelViewport || !fontReady)
      return { schools: positionedSchools, regions: labels };
    type Entry =
      | { kind: "school"; value: (typeof positionedSchools)[number] }
      | { kind: "region"; value: (typeof labels)[number] };
    const candidates: LabelCandidate<Entry>[] = labels.map((value) => ({
      value: { kind: "region", value },
      position: value.position,
      text: labelTextOf(value.code),
      size: 14,
      priority: value.code === selectedCode ? 900 : 800,
    }));
    if (schoolLabelsVisible)
      for (const value of positionedSchools)
        candidates.push({
          value: { kind: "school", value },
          position: [value.lng, value.lat],
          text: value.name,
          size: 11,
          priority:
            value.id === highlightedSchoolId
              ? 1000
              : Math.min(700, (value.students ?? 0) / 10),
        });
    const context = document.createElement("canvas").getContext("2d");
    const placed = declutterLabels(candidates, labelViewport, (text, size) => {
      if (!context) return text.length * size;
      context.font = `600 ${size}px ${fontFamily}`;
      return context.measureText(text).width;
    });
    return {
      schools: placed.flatMap((entry) =>
        entry.kind === "school" ? [entry.value] : [],
      ),
      regions: placed.flatMap((entry) =>
        entry.kind === "region" ? [entry.value] : [],
      ),
    };
  }, [
    labelViewport,
    fontReady,
    positionedSchools,
    labels,
    labelTextOf,
    fontFamily,
    selectedCode,
    highlightedSchoolId,
    schoolLabelsVisible,
  ]);

  const getRegionTooltip = useMemo(() => makeTooltip(linesOf), [linesOf]);
  const getSchoolTooltip = useMemo(
    () => makeSchoolTooltip(schoolTooltipLines),
    [],
  );
  // School dots have plain School objects; boundaries have GeoJSON properties.
  const getTooltip = useCallback(
    (info: Parameters<typeof getRegionTooltip>[0]) =>
      info.layer?.id === "schools"
        ? getSchoolTooltip(info)
        : getRegionTooltip(info),
    [getRegionTooltip, getSchoolTooltip],
  );

  const getCursor = useCallback(
    ({
      isDragging,
      isHovering,
    }: {
      isDragging: boolean;
      isHovering: boolean;
    }) => (isDragging ? "grabbing" : isHovering ? "pointer" : "grab"),
    [],
  );

  // A region was clicked on the canvas (the `regions`/`region-islands`
  // layers' own onClick — see below). Re-clicking the ALREADY-selected
  // region wouldn't change the URL (setRegion would push the same value
  // again), so re-fly the camera anyway via useCamera's `reselect` instead
  // of calling onSelect with a no-op value. Every other click is a genuine
  // selection change; onSelect -> the URL -> useCamera's effect drives the
  // camera instead, exactly like a RegionList click would.
  const handleRegionClick = useCallback(
    (code: string) => {
      // Defensive: makeRegionsLayer's onClick is typed generically (plain
      // string, from GeoJSON feature properties) — every feature in
      // bundle.regions is in fact one of the 14 시군, but this narrows the
      // type rather than assuming it.
      if (!isRegionCode(code)) return;
      recordE2eEvent({
        type: "region-click",
        code,
        picked: true,
        t: performance.now(),
      });
      if (code === selectedCode) {
        reselect();
      } else {
        onSelect(code);
      }
    },
    [selectedCode, onSelect, reselect],
  );

  // Mirrored into a ref (same reasoning/pattern as fontReadyRef above) so
  // window.__jbmap.selectRegion, assigned ONCE inside handleAfterRender's
  // one-time block below, can always dispatch to the LATEST
  // handleRegionClick despite being created before this file has any idea
  // what "latest" will eventually mean. Fixes a real bug caught by CI run
  // 35545008220: an EARLIER version of this fix assigned
  // window.__jbmap.selectRegion from its own separate effect, keyed only on
  // [handleRegionClick] — if that effect's FIRST run happened (as it always
  // does, on mount) before handleAfterRender had yet created window.__jbmap
  // at all, and handleRegionClick's identity never changed again
  // afterward, selectRegion was simply never attached — `?.()` on the
  // resulting `undefined` silently no-opped instead of throwing, which is
  // exactly what that run's log showed (the fallback click loop ran, and
  // failed, as if selectRegion had never been called).
  const handleRegionClickRef = useRef(handleRegionClick);
  useLayoutEffect(() => {
    handleRegionClickRef.current = handleRegionClick;
  }, [handleRegionClick]);

  // Top-level DeckGL click: only handles the "missed everything" case (per
  // the task brief: "DeckGL 의 onClick 에서 info.picked === false 면
  // onSelect(null)"). A click that DID pick a region is handled by the
  // `regions`/`region-islands` layers' own onClick (handleRegionClick)
  // instead — deck.gl fires both for the same click, so this only needs the
  // miss branch.
  const handleDeckClick = useCallback(
    (info: PickingInfo) => {
      recordE2eEvent({
        type: "deck-click",
        code: (info.object as { properties?: { code?: string } } | undefined)
          ?.properties?.code,
        picked: info.picked,
        t: performance.now(),
      });
      if (!info.picked && selectedCode !== null) {
        onSelect(null);
      }
    },
    [selectedCode, onSelect],
  );

  // Task 6, "현재 코드 상태" — ←/→/Enter cycling + document-level
  // Escape-to-deselect live in useRegionKeyboardNav now (split out of this
  // file with no intended behavior change).
  const { handleWrapperKeyDown } = useRegionKeyboardNav({
    disabled: interactionBlocked,
    orderedCodes,
    selectedCode,
    onSelect,
    reselect,
    highlightedSchoolId,
    onHighlightSchool,
  });

  // 추가 요구 #4: 전체보기(fit-to-overview) + (나침반은 2026-09-21 북쪽 고정·회전
  // 제거와 함께 삭제 — bearing 이 항상 0 이라 의미가 없다) +
  // (Task A) 줌 버튼, bottom-left inside the canvas. All official deck.gl
  // widgets (already a direct dependency) rather than hand-rolled buttons.
  // ResetViewWidget defaults to `deck.props.initialViewState` when its own
  // `initialViewState` prop is unset — which, once a region is selected,
  // would be the REGION's fit (`cameraViewState`), not the true overview.
  // Passing `overview` explicitly keeps "전체보기" always meaning the
  // overview, regardless of what's currently selected (see task-4A-report.md).
  // ZoomWidget is appended LAST (Task A requirement) — confirmed against
  // e2e/a11y.spec.ts's "전체보기/확대/축소 위젯 버튼이 Tab 으로 도달 가능하다" test
  // that Tab order is unaffected by a widget appended after reset-view in
  // this array.
  const widgets = useMemo(
    () => [
      new ResetViewWidget({
        id: "reset-view",
        placement: "bottom-left",
        label: "전체보기",
        initialViewState: overview ?? undefined,
      }),
      new ZoomWidget({
        id: "zoom",
        placement: "bottom-left",
        zoomInLabel: "확대",
        zoomOutLabel: "축소",
      }),
    ],
    [overview],
  );

  const [emdEnabled, setEmdEnabled] = useState(() => readEmdPref());
  const handleEmdToggle = useCallback(() => {
    setEmdEnabled((prev) => {
      const next = !prev;
      writeEmdPref(next);
      return next;
    });
  }, []);

  const overlayItems = useMemo<MapOverlayItem[]>(() => {
    const items: MapOverlayItem[] = [];
    items.push({
      id: "school-names",
      label: "학교명",
      pressed: showSchoolNames,
      onToggle: () => setShowSchoolNames((value) => !value),
    });
    items.push({
      id: "emd",
      label: "읍면동 경계",
      pressed: emdEnabled,
      onToggle: handleEmdToggle,
    });
    return items;
  }, [showSchoolNames, emdEnabled, handleEmdToggle]);

  const basemapOn = !!VWORLD_KEY;
  const basemapLayer = useMemo(
    () => (VWORLD_KEY ? makeBasemapLayer(VWORLD_KEY, "base") : null),
    [],
  );

  // Only ever fetches while emdEnabled AND a 시군 is selected (see
  // useEmdBoundaries' own doc comment for why it's also safe re: e2e's
  // zero-console-error assertions) — null the rest of the time.
  const emdFc = useEmdBoundaries(selectedCode, emdEnabled);

  const layers = useMemo<LayersList>(() => {
    const transitionDuration = 0;
    const layerList: LayersList = [
      basemapLayer,
      makeFlatRegionsLayer(
        bundle.regions,
        selectedCode,
        handleRegionClick,
        issueModel,
      ),
      emdEnabled && selectedCode && emdFc
        ? makeEmdBoundaryLayer(emdFc, {
            elevation: 1,
            triggerKey: indicatorId,
            transitionDuration,
          })
        : null,
      makeFlatSchoolsLayer(
        positionedSchools,
        highlightedSchoolId,
        handleSchoolClick,
      ),
    ];
    if (fontReady) {
      // Screen-space placement above resolves collisions before either text layer draws.
      layerList.push(
        makeSchoolLabelsLayer(visibleLabels.schools, {
          collisionEnabled: false,
          highlightedId: highlightedSchoolId,
          elevationOf: () => 0,
          heightOf: () => 0,
          heightKey: "flat",
          visible: schoolLabelsVisible,
          fontFamily,
          characterSet,
          triggerKey: indicatorId,
          transitionDuration,
        }),
        makeRegionLabelLayer(visibleLabels.regions, {
          collisionEnabled: false,
          elevationOf: () => 0,
          textOf: labelTextOf,
          triggerKey: indicatorId,
          fontFamily,
          characterSet,
          selectedCode,
          priorityOf,
          transitionDuration,
        }),
      );
    }
    return layerList;
  }, [
    basemapLayer,
    issueModel,
    bundle.regions,
    selectedCode,
    handleRegionClick,
    emdEnabled,
    emdFc,
    indicatorId,
    positionedSchools,
    highlightedSchoolId,
    handleSchoolClick,
    fontReady,
    schoolLabelsVisible,
    fontFamily,
    characterSet,
    visibleLabels,
    labelTextOf,
    priorityOf,
  ]);

  // Fires every frame. The first frame after the initial view state is
  // ready flips the wrapper's data-map-ready flag (e2e/smoke.spec.ts waits
  // on it) and, in the e2e build only, exposes the live Deck instance so
  // Playwright can project a region's ground point to a canvas pixel
  // (e2e/select-region.spec.ts's canvas-click coverage).
  //
  // CI Linux fix (ci-linux-fixes branch, see ci-fix-report.md) — SEPARATELY,
  // the first frame to occur once fontReadyRef.current is true flips
  // data-labels-ready. This is NOT the same moment as useFontGate's own
  // fontReady (exposed as data-font-ready): fontReady only means the FONT
  // ITSELF finished loading — `layers` below still has to recompute (a
  // normal React effect-driven re-render) and DeckGL still has to process
  // that new `layers` prop and actually draw a frame with the label
  // TextLayer in it, which is when deck.gl SYNCHRONOUSLY builds the
  // TextLayer's SDF atlas (rasterizing all ~316 charset.json glyphs via
  // tiny-sdf — CPU-heavy, main-thread, no `await` to hang a wait on). A
  // Playwright trace from a real CI failure (run 35542371166) showed a
  // single `mouse.move()` taking over 3 SECONDS to resolve — i.e. the main
  // thread was blocked, almost certainly by exactly this — despite the
  // click sequence already having waited for data-font-ready. Once THIS
  // frame has fired, that synchronous work is provably done; e2e waits on
  // data-labels-ready (not data-font-ready) before ever touching the
  // canvas.
  const handleAfterRender = useCallback(() => {
    if (!containerRef.current) return;
    const viewport = deckRef.current?.deck?.getViewports()[0] as
      | WebMercatorViewport
      | undefined;
    if (viewport) {
      const key = [
        viewport.width,
        viewport.height,
        viewport.longitude,
        viewport.latitude,
        viewport.zoom,
        viewport.pitch,
      ].join(",");
      if (key !== lastLabelViewportKey.current) {
        lastLabelViewportKey.current = key;
        queueMicrotask(() => {
          setLabelViewport(viewport);
          setZoom(viewport.zoom);
        });
      }
    }
    if (!mapReadyRef.current) {
      mapReadyRef.current = true;
      containerRef.current.setAttribute("data-map-ready", "true");
      if (process.env.NEXT_PUBLIC_E2E === "1" && deckRef.current?.deck) {
        window.__jbmap = {
          deck: deckRef.current.deck,
          events: [],
          // Deferred via queueMicrotask — same reasoning as
          // handleViewStateChange's own queueMicrotask(() => setZoom(...))
          // above: this runs from Playwright's page.evaluate(), a foreign
          // call stack outside React's own event handling, and
          // handleRegionClick ultimately calls onSelect -> setRegion ->
          // nuqs's router.push (a synchronous history/URL update). Calling
          // that update synchronously from within page.evaluate() risks
          // the same "update while a different context is mid-callback"
          // hazard that comment already documents, PLUS Playwright's CDP
          // Runtime.callFunctionOn is not guaranteed to tolerate a
          // synchronous navigation-triggering side effect happening on its
          // own call stack. queueMicrotask lets evaluate() return cleanly
          // first; the actual selection update runs a tick later.
          selectRegion: (code: string) => {
            queueMicrotask(() => handleRegionClickRef.current(code));
          },
        };
      }
    }
    if (fontReadyRef.current && !labelsReadyRef.current) {
      labelsReadyRef.current = true;
      containerRef.current.setAttribute("data-labels-ready", "true");
    }
  }, []);

  return (
    <div
      id="school-map"
      ref={containerRef}
      className="relative h-full w-full bg-paper outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
      style={WIDGET_THEME_STYLE}
      tabIndex={0}
      aria-label="전북 학교 위치 지도"
      onKeyDown={handleWrapperKeyDown}
      // 사용자 요구(2026-09-21): 지도 위 우클릭은 아무 조작도 아니므로(회전 제거)
      // 브라우저 컨텍스트 메뉴가 뜨지 않게 한다.
      onContextMenu={(event) => event.preventDefault()}
      // CI Linux fix — useFontGate's OWN gate: the font itself finished
      // loading. Decoupled from data-map-ready (deck.gl's first render
      // frame, unrelated to fonts). NOT what e2e waits on before touching
      // the canvas, though — see handleAfterRender's comment on
      // data-labels-ready (set imperatively below) for why this alone
      // isn't a safe "labels can actually render" signal.
      data-font-ready={fontReady ? "true" : undefined}
    >
      {cameraViewState && (
        <DeckGL
          ref={deckRef}
          initialViewState={cameraViewState}
          views={views}
          controller={{ ...CONTROLLER, maxBounds: undefined }}
          layers={layers}
          widgets={widgets}
          getTooltip={getTooltip}
          getCursor={getCursor}
          onAfterRender={handleAfterRender}
          onClick={handleDeckClick}
          onViewStateChange={handleViewStateChange}
          onError={handleDeckError}
          // Task A — DPR cap: `useDevicePixels` is an ABSOLUTE multiplier when
          // given a number (NOT relative to the device's own DPR) — passing
          // devicePixelRatio straight through supersamples on an already-high-DPR
          // screen. `Math.min(..., 1.5)` caps render resolution without ever
          // exceeding the device's native pixel ratio.
          useDevicePixels={Math.min(window.devicePixelRatio || 1, 1.5)}
        />
      )}
      <MapOverlay
        items={overlayItems}
        attribution={basemapOn ? BASEMAP_ATTRIBUTION : undefined}
      />
      {contextLost && (
        <div
          role="alert"
          className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-paper/90 text-center text-sm text-ink"
        >
          <p>그래픽 컨텍스트가 끊겼습니다</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded bg-ink/5 px-3 py-1.5 hover:bg-ink/15"
          >
            새로고침
          </button>
        </div>
      )}
      <div aria-live="polite" className="sr-only">
        {announcement}
      </div>
    </div>
  );
}
