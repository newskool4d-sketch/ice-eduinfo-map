"use client";

import { useCallback, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import DeckGL from "@deck.gl/react";
import type { DeckGLRef } from "@deck.gl/react";
import { Deck, MapView } from "@deck.gl/core";
import type { LayersList, PickingInfo } from "@deck.gl/core";
import { CompassWidget, DarkTheme, ResetViewWidget } from "@deck.gl/widgets";
import "@deck.gl/widgets/stylesheet.css";

import { isRegionCode, regionName, REGION_CODES, type RegionCode } from "@/lib/geo/regions";
import { lightingEffect } from "@/components/map/lighting";
import { CONTROLLER, VIEW_LIMITS } from "@/components/map/camera";
import {
  makeFootprintLayer,
  makeIslandsLayer,
  makeNeighborsLayer,
  makeRegionsLayer,
  makeSelectedRingLayer,
} from "@/components/map/layers/regionLayers";
import { makeRegionLabelLayer } from "@/components/map/layers/labelLayer";
import { hasCoordinates, makeSchoolLabelsLayer, makeSchoolsLayer } from "@/components/map/layers/schoolLayers";
import { makeSchoolTooltip, makeTooltip } from "@/components/map/tooltip";
import { useCamera } from "@/components/map/useCamera";
import { useFontGate } from "@/components/map/useFontGate";
import { useRegionKeyboardNav } from "@/components/map/useRegionKeyboardNav";
import { useBundle } from "@/lib/data/DataProvider";
import { indicatorById } from "@/lib/indicators/registry";
import { displayLabel, rank, valueMap } from "@/lib/stats";
import { makeColorScale } from "@/lib/colors";
import { makeElevationScale } from "@/lib/scales";
import { makeSchoolRadiusScale } from "@/lib/schoolVisuals";
import { makeLinesOf, formatWithUnit, schoolTooltipLines } from "@/lib/tooltipText";
import { regionRankList, selectionAnnouncement } from "@/lib/selection";
import { useReducedMotion } from "@/lib/useReducedMotion";
import type { RegionFeature } from "@/lib/geo/geo";

/** zoom≥11 이 되어야 학교명 라벨을 그린다 (브리프 고정값 — DeckMap.tsx 의 onViewStateChange 스로틀 zoom 으로 판단). */
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
declare global {
  interface Window {
    __jbmap?: { deck: Deck; events?: JbmapEvent[] };
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

function nameOf(code: string): string {
  return isRegionCode(code) ? regionName(code) : code;
}

const VIEW = new MapView();

// 추가 요구 #4: 16px margin (deck.gl/widgets' own default is 12px);
// DarkTheme keeps the compass/전체보기 buttons legible against the varied 3D
// scene behind them (the default LightTheme assumes a light page
// background). A MODULE constant, not an inline object literal inside the
// component — Task 6, Section C.3 ("widgetThemeStyle 등 매 렌더 새 객체를 모듈
// 상수로"): an inline literal would be a NEW object reference every render,
// pointlessly changing the wrapper div's `style` prop identity every time.
const WIDGET_THEME_STYLE: CSSProperties = { ...DarkTheme, "--widget-margin": "16px" } as CSSProperties;

export interface DeckMapProps {
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
}: DeckMapProps) {
  const bundle = useBundle();
  const containerRef = useRef<HTMLDivElement>(null);
  const deckRef = useRef<DeckGLRef | null>(null);
  const mapReadyRef = useRef(false);
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
  const { overview, cameraViewState, reselect } = useCamera(containerRef, bundle.regions, selectedCode, reduceMotion);

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

  const { fontReady, fontFamily } = useFontGate(bundle.charset);
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
  const handleViewStateChange = useCallback(({ viewState }: { viewState: Record<string, unknown> }) => {
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
  }, []);

  const def = indicatorById(indicatorId);
  if (!def) {
    throw new Error(`DeckMap: unknown indicatorId "${indicatorId}"`);
  }

  const file = bundle.indicators[indicatorId];
  const map = useMemo(() => valueMap(file), [file]);
  const elevationOf = useMemo(() => makeElevationScale(def, map), [def, map]);
  const { colorOf } = useMemo(() => makeColorScale(def, map), [def, map]);
  const label = useMemo(() => displayLabel(def, bundle.series), [def, bundle.series]);

  // Rank order for keyboard ←/→ cycling ("현재 순위 순") and, indirectly (via
  // the same pure function), RegionList's render order.
  const orderedCodes = useMemo(() => regionRankList(map), [map]);

  // Task 6, Section C.1 — the ring traces the MAINLAND part only
  // (bundle.regionsMain), never an island: islands aren't extruded, so a
  // ring floating at `elevation + 10` over a flat island would look
  // detached from anything actually rising off the ground.
  const selectedFeature = useMemo<RegionFeature | null>(() => {
    if (!selectedCode) return null;
    return bundle.regionsMain.features.find((f) => f.properties.code === selectedCode) ?? null;
  }, [bundle.regionsMain, selectedCode]);
  const ringElevation = useMemo(
    () => (selectedCode ? elevationOf(selectedCode) : 0),
    [elevationOf, selectedCode],
  );

  const announcement = useMemo(() => {
    if (!selectedCode) return "선택 해제됨, 전체 보기";
    const value = map.get(selectedCode);
    const r = rank(map).get(selectedCode) ?? null;
    const valueText = value === null || value === undefined ? "자료 없음" : formatWithUnit(def, value);
    return selectionAnnouncement({
      name: nameOf(selectedCode),
      label,
      valueText,
      rank: r,
      total: REGION_CODES.length,
    });
  }, [selectedCode, map, def, label]);

  const labelTextOf = useCallback(
    (code: string): string => {
      const name = nameOf(code);
      const value = map.get(code);
      if (value === null || value === undefined) return `${name}\n자료 없음`;
      return `${name}\n${def.format(value)}`;
    },
    [map, def],
  );

  // Tooltip line assembly (name / value / rank / vsProvince delta) lives in
  // src/lib/tooltipText.ts (Fix round 1, review finding #1) — pure and unit
  // tested there (tests/unit/tooltipText.test.ts), with zero deck.gl/React
  // dependency. makeLinesOf computes rank(map) once per def/label/map
  // change (not per hover) and returns the (code) => string[] tooltip fn.
  const linesOf = useMemo(() => makeLinesOf({ def, label, map }), [def, label, map]);

  // Static across indicator switches — regenerating this array on every
  // indicatorId change would give the label TextLayer a new `data` reference
  // each time, defeating deck.gl's diffing (the constraint the task brief
  // calls out explicitly: "매 렌더 새 배열을 만들지 않는다"). Sourced from
  // regionsMain (Task 6, Section C.2): same properties (code/name/labelPoint/
  // labelOffset) as bundle.regions, one feature per region either way.
  const labels = useMemo(
    () =>
      bundle.regionsMain.features.map((f) => ({
        code: f.properties.code,
        name: f.properties.name,
        position: f.properties.labelPoint,
        labelOffset: f.properties.labelOffset,
      })),
    [bundle.regionsMain],
  );

  const characterSet = useMemo(() => Array.from(bundle.charset), [bundle.charset]);

  const views = useMemo(() => VIEW, []);

  // Task 4B — 학교 점. radiusOf is scaled over the FULL schools.json list
  // (bundle.schools, stable across a selection change) so dot sizes never
  // silently mean something different when the user picks a different 시군
  // — see makeSchoolRadiusScale's doc comment.
  const radiusOf = useMemo(() => makeSchoolRadiusScale(bundle.schools.schools), [bundle.schools]);

  // Only the selected 시군's schools are ever handed to the layers/data —
  // per the task brief, both the point layer and the label layer only ever
  // render the selected region's schools (`visible` below additionally
  // gates the whole layer off when nothing is selected at all).
  const regionSchools = useMemo(
    () => (selectedCode ? bundle.schools.schools.filter((s) => s.regionCode === selectedCode) : []),
    [bundle.schools, selectedCode],
  );
  // fix-round-2 (review finding #1): coordinate-filtering used to happen
  // INSIDE makeSchoolsLayer/makeSchoolLabelsLayer themselves, on every call —
  // which allocated a brand-new array identity every time `layers` below
  // recomputed, including for reasons unrelated to which schools are
  // selected (e.g. a highlight click; `highlightedSchoolId` is one of
  // `layers`' own deps). deck.gl treats a new `data` array as "everything
  // changed" and rebuilds every attribute buffer (`invalidateAll()`),
  // defeating the layers' own scoped `updateTriggers` (getLineColor/
  // getLineWidth only). Filtering HERE instead, keyed only on
  // `regionSchools`, keeps this array's identity — and therefore both
  // layers' `data` identity, since they're both handed this SAME array —
  // stable across a highlight-only re-render; it only changes when the
  // selected region's school set itself actually changes. See
  // tests/unit/schoolLayers.test.ts's "data reference stability" block.
  const positionedRegionSchools = useMemo(() => regionSchools.filter(hasCoordinates), [regionSchools]);
  const schoolsVisible = !!selectedCode;
  const schoolLabelsVisible = !!selectedCode && zoom >= SCHOOL_LABEL_MIN_ZOOM;

  // A school point (or its RegionPanel row counterpart) was clicked: toggle
  // the highlight off if it's already the highlighted one, otherwise select
  // it. Mirrors handleRegionClick's own "reselect == toggle" shape.
  const handleSchoolClick = useCallback(
    (id: string) => {
      onHighlightSchool(id === highlightedSchoolId ? null : id);
    },
    [highlightedSchoolId, onHighlightSchool],
  );

  const getRegionTooltip = useMemo(() => makeTooltip(linesOf), [linesOf]);
  const getSchoolTooltip = useMemo(() => makeSchoolTooltip(schoolTooltipLines), []);
  // Dispatches by which layer was actually hovered — schools (a
  // ScatterplotLayer, `info.object` is a plain School row) vs every other
  // (GeoJsonLayer-backed — regions, region-islands, footprint, neighbors —
  // `info.object.properties.code`) layer. `region-islands` needs no special
  // case here: every feature it hands the picker still carries
  // `properties.code` (see splitRegionIslands), so the same generic
  // getRegionTooltip branch already covers it.
  const getTooltip = useCallback(
    (info: Parameters<typeof getRegionTooltip>[0]) =>
      info.layer?.id === "schools" ? getSchoolTooltip(info) : getRegionTooltip(info),
    [getRegionTooltip, getSchoolTooltip],
  );

  const getCursor = useCallback(
    ({ isDragging, isHovering }: { isDragging: boolean; isHovering: boolean }) =>
      isDragging ? "grabbing" : isHovering ? "pointer" : "grab",
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
      recordE2eEvent({ type: "region-click", code, picked: true, t: performance.now() });
      if (code === selectedCode) {
        reselect();
      } else {
        onSelect(code);
      }
    },
    [selectedCode, onSelect, reselect],
  );

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
        code: (info.object as { properties?: { code?: string } } | undefined)?.properties?.code,
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
    orderedCodes,
    selectedCode,
    onSelect,
    reselect,
    highlightedSchoolId,
    onHighlightSchool,
  });

  // 추가 요구 #4: 나침반(bearing/pitch reset) + 전체보기(fit-to-overview)
  // buttons, bottom-left inside the canvas. Both are official deck.gl
  // widgets (already a direct dependency) rather than hand-rolled buttons.
  // ResetViewWidget defaults to `deck.props.initialViewState` when its own
  // `initialViewState` prop is unset — which, once a region is selected,
  // would be the REGION's fit (`cameraViewState`), not the true overview.
  // Passing `overview` explicitly keeps "전체보기" always meaning the
  // overview, regardless of what's currently selected (see task-4A-report.md).
  const widgets = useMemo(
    () => [
      new CompassWidget({ id: "compass", placement: "bottom-left", label: "나침반" }),
      new ResetViewWidget({
        id: "reset-view",
        placement: "bottom-left",
        label: "전체보기",
        initialViewState: overview ?? undefined,
      }),
    ],
    [overview],
  );

  // Fix round 1/5, finding 5 — its own useMemo (not inlined in `layers`
  // below): makes "data는 선택이 바뀔 때만 새로" true by construction — `layers`
  // also rebuilds on indicator/font/label/etc. changes that have nothing to
  // do with selection, and inlining this call there would rebuild the ring's
  // `data` array every one of those times too (harmless — deck.gl still
  // diffs by id — but not what the brief asks for; this is exactly how it
  // read before the Task 6 hook-extraction refactor dropped the separate
  // memo, per `git show cda5f83^:src/components/map/DeckMap.tsx`). Deps are
  // only `[selectedFeature, ringElevation]` — `makeSelectedRingLayer` itself
  // takes no transitionDuration/motion option (it's an instant PathLayer,
  // not one of the 4 elevation-transitioning layer factories), so adding
  // `reduceMotion` here would just be a no-op dependency.
  const selectedRingLayer = useMemo(
    () => makeSelectedRingLayer(selectedFeature, ringElevation),
    [selectedFeature, ringElevation],
  );

  const layers = useMemo<LayersList>(() => {
    const transitionDuration = reduceMotion ? 0 : undefined; // undefined -> each factory's own 600ms default
    const layerList: LayersList = [
      makeNeighborsLayer(bundle.neighbors),
      makeFootprintLayer(bundle.regions),
      makeRegionsLayer(bundle.regionsMain, {
        elevationOf,
        fillColorOf: colorOf,
        triggerKey: indicatorId,
        selectedCode,
        onClick: handleRegionClick,
        transitionDuration,
      }),
      makeIslandsLayer(bundle.regionsIslands, {
        fillColorOf: colorOf,
        triggerKey: indicatorId,
        selectedCode,
        onClick: handleRegionClick,
        transitionDuration,
      }),
      selectedRingLayer,
      makeSchoolsLayer(positionedRegionSchools, {
        elevationOf,
        radiusOf,
        highlightedId: highlightedSchoolId,
        visible: schoolsVisible,
        onClick: handleSchoolClick,
        triggerKey: indicatorId,
        transitionDuration,
      }),
    ];
    if (fontReady) {
      layerList.push(
        makeRegionLabelLayer(labels, {
          elevationOf,
          textOf: labelTextOf,
          triggerKey: indicatorId,
          fontFamily,
          characterSet,
          transitionDuration,
        }),
        makeSchoolLabelsLayer(positionedRegionSchools, {
          elevationOf,
          visible: schoolLabelsVisible,
          fontFamily,
          characterSet,
          triggerKey: indicatorId,
          transitionDuration,
        }),
      );
    }
    return layerList;
  }, [
    bundle.regions,
    bundle.regionsMain,
    bundle.regionsIslands,
    bundle.neighbors,
    elevationOf,
    colorOf,
    indicatorId,
    selectedCode,
    handleRegionClick,
    selectedRingLayer,
    positionedRegionSchools,
    radiusOf,
    highlightedSchoolId,
    schoolsVisible,
    schoolLabelsVisible,
    handleSchoolClick,
    fontReady,
    labels,
    labelTextOf,
    fontFamily,
    characterSet,
    reduceMotion,
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
    if (!mapReadyRef.current) {
      mapReadyRef.current = true;
      containerRef.current.setAttribute("data-map-ready", "true");
      if (process.env.NEXT_PUBLIC_E2E === "1" && deckRef.current?.deck) {
        window.__jbmap = { deck: deckRef.current.deck, events: [] };
      }
    }
    if (fontReadyRef.current && !labelsReadyRef.current) {
      labelsReadyRef.current = true;
      containerRef.current.setAttribute("data-labels-ready", "true");
    }
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full bg-[#0b0f19] outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/70"
      style={WIDGET_THEME_STYLE}
      tabIndex={0}
      aria-label="전북 시군 3D 지도"
      onKeyDown={handleWrapperKeyDown}
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
          controller={CONTROLLER}
          effects={[lightingEffect]}
          layers={layers}
          widgets={widgets}
          getTooltip={getTooltip}
          getCursor={getCursor}
          onAfterRender={handleAfterRender}
          onClick={handleDeckClick}
          onViewStateChange={handleViewStateChange}
          onError={handleDeckError}
        />
      )}
      {contextLost && (
        <div
          role="alert"
          className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-[#0b0f19]/90 text-center text-sm text-[#e6e9f0]"
        >
          <p>그래픽 컨텍스트가 끊겼습니다</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded bg-white/10 px-3 py-1.5 hover:bg-white/20"
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
