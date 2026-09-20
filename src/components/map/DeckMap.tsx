"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import DeckGL from "@deck.gl/react";
import type { DeckGLRef } from "@deck.gl/react";
import { Deck, FlyToInterpolator, MapView } from "@deck.gl/core";
import type { LayersList, PickingInfo } from "@deck.gl/core";
import { CompassWidget, DarkTheme, ResetViewWidget } from "@deck.gl/widgets";
import "@deck.gl/widgets/stylesheet.css";

import { isRegionCode, regionName, REGION_CODES, type RegionCode } from "@/lib/geo/regions";
import { unionBbox, type Bbox } from "@/lib/geo/geo";
import type { RegionFeature } from "@/lib/geo/geo";
import { lightingEffect } from "@/components/map/lighting";
import { CONTROLLER, fitOverview, fitRegion, VIEW_LIMITS } from "@/components/map/camera";
import {
  makeFootprintLayer,
  makeNeighborsLayer,
  makeRegionsLayer,
  makeSelectedRingLayer,
} from "@/components/map/layers/regionLayers";
import { makeRegionLabelLayer } from "@/components/map/layers/labelLayer";
import { makeSchoolLabelsLayer, makeSchoolsLayer } from "@/components/map/layers/schoolLayers";
import { makeSchoolTooltip, makeTooltip } from "@/components/map/tooltip";
import { useBundle } from "@/lib/data/DataProvider";
import { indicatorById } from "@/lib/indicators/registry";
import { displayLabel, rank, valueMap } from "@/lib/stats";
import { makeColorScale } from "@/lib/colors";
import { makeElevationScale } from "@/lib/scales";
import { makeSchoolRadiusScale } from "@/lib/schoolVisuals";
import { makeLinesOf, formatWithUnit, schoolTooltipLines } from "@/lib/tooltipText";
import { nextRegion, regionRankList, selectionAnnouncement } from "@/lib/selection";

/** zoom≥11 이 되어야 학교명 라벨을 그린다 (브리프 고정값 — DeckMap.tsx 의 onViewStateChange 스로틀 zoom 으로 판단). */
const SCHOOL_LABEL_MIN_ZOOM = 11;
/** onViewStateChange 스로틀 간격(ms). */
const ZOOM_THROTTLE_MS = 100;

// e2e-only bridge (see e2e/select-region.spec.ts): only ever written when
// NEXT_PUBLIC_E2E=1 (a build-time-inlined env var — see playwright.config.ts's
// webServer.env), never read/written in normal production use.
declare global {
  interface Window {
    __jbmap?: { deck: Deck };
  }
}

// Fallback used when next/font's generated CSS variable can't be resolved
// (see the font-gating effect below) — a generic family, so
// `document.fonts.check()` still resolves true via the browser's own
// system-fallback glyph substitution for Hangul.
const FALLBACK_FONT_FAMILY = "'Noto Sans KR', sans-serif";

function nameOf(code: string): string {
  return isRegionCode(code) ? regionName(code) : code;
}

const VIEW = new MapView();

type OverviewViewState = ReturnType<typeof fitOverview>;
/** What's actually fed to `<DeckGL initialViewState>` — the overview/region fit plus a monotonic `_nonce` so re-applying the SAME target (e.g. re-clicking the already-selected region) still forces deck.gl to reset its camera. See DeckMap's `flyTo` for why: `Deck.setProps` skips the reset when the new `initialViewState` is deep-equal (by content, depth 3) to the previous one — see task-4A-report.md. */
type CameraViewState = OverviewViewState & {
  transitionInterpolator?: FlyToInterpolator;
  transitionDuration?: number | "auto";
  _nonce: number;
};

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

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

  const [fontReady, setFontReady] = useState(false);
  const [fontFamily, setFontFamily] = useState(FALLBACK_FONT_FAMILY);
  // `overview` is the "전체 보기" seed: computed once on mount, never again
  // (kept STABLE and separate from `cameraViewState` below) so the
  // ResetViewWidget — which defaults to `deck.props.initialViewState`, i.e.
  // whatever `cameraViewState` currently is — can be told explicitly to
  // reset to the overview even while a region is selected.
  const [overview, setOverview] = useState<OverviewViewState | null>(null);
  // What's actually passed to `<DeckGL initialViewState>` right now.
  const [cameraViewState, setCameraViewState] = useState<CameraViewState | null>(null);

  const nonceRef = useRef(0);
  // Bumped (never read for its value, only its identity as a dependency) by
  // handleRegionClick/handleWrapperKeyDown when the user (re-)selects the
  // region that's ALREADY selected — selectedCode itself wouldn't change in
  // that case, so the camera-sync effect below wouldn't otherwise re-fire
  // (see CameraViewState's doc comment for why re-clicking the same region
  // still needs to reset the camera). Deliberately plain state, not a ref:
  // a ref read reachable from handleRegionClick — which is handed to
  // deck.gl as a layer-prop value during the `layers` useMemo below, a
  // render-phase computation — trips eslint-plugin-react-hooks' `refs` rule
  // ("a ref might be read during render"), even though deck.gl only
  // invokes onClick later, from a real click. Routing the "reselect" signal
  // through state instead means neither click/keyboard handler touches a
  // ref at all; only this effect (a safe place to read one) calls `flyTo`.
  const [reselectNonce, setReselectNonce] = useState(0);

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

  // Font gating: TextLayer caches one SDF atlas per fontFamily, so we must
  // not create it until next/font's family is actually ready to rasterize
  // EVERY character the label layer's `characterSet` declares (추가 요구
  // #6) — not just the 14 시군 names. `characterSet` is the full
  // charset.json string (129 chars: digits, units like 명/㎡/%, and domain
  // terms), because labels now render formatted indicator values, not just
  // names. Gating on a 24-character subset (as Task 1A did, before any
  // labels carried numbers) would silently miss a missing font-family slice
  // covering e.g. only digits or only "㎡".
  useEffect(() => {
    let cancelled = false;
    async function gateFont() {
      let family = FALLBACK_FONT_FAMILY;
      try {
        // Read from <body>, not document.documentElement (<html>): layout.tsx
        // applies next/font's generated `--font-sans` variable class to
        // <body>, and Tailwind v4 separately defines its OWN default
        // `--font-sans` design token reaching <html> — querying
        // documentElement picks up Tailwind's unrelated system-font stack
        // instead (verified empirically; see task-1A-report.md).
        const cssVar = getComputedStyle(document.body).getPropertyValue("--font-sans").trim();
        if (cssVar) family = cssVar;
      } catch {
        // getComputedStyle can throw outside a browser; keep the fallback.
      }
      try {
        await document.fonts.load(`600 16px ${family}`, bundle.charset);
        if (!document.fonts.check(`600 16px ${family}`, bundle.charset)) {
          family = FALLBACK_FONT_FAMILY;
        }
      } catch {
        family = FALLBACK_FONT_FAMILY;
      }
      if (!cancelled) {
        setFontFamily(family);
        setFontReady(true);
      }
    }
    void gateFont();
    return () => {
      cancelled = true;
    };
  }, [bundle.charset]);

  // Uncontrolled camera, initial mount only: compute the overview from the
  // container's measured size, the loaded regions' combined bbox, and every
  // region's label point (fitOverview needs both — see camera.ts's
  // fitViewToPoints — so a label doesn't end up clipped even when the
  // polygon bbox itself just barely fits). No transition here — nothing has
  // been rendered yet for a fly-from position to make sense against.
  useEffect(() => {
    if (overview) return; // once only
    if (!containerRef.current) return;
    const { width, height } = containerRef.current.getBoundingClientRect();
    if (width <= 0 || height <= 0) return;
    const bbox: Bbox = unionBbox(bundle.regions.features);
    const labelPoints = bundle.regions.features.map((f) => f.properties.labelPoint);
    const initial = fitOverview(bbox, labelPoints, { width, height });
    setOverview(initial);
    setCameraViewState({ ...initial, _nonce: 0 });
    // bundle.regions is a stable reference for the provider's lifetime (set
    // once on load, never recreated) — this effect only re-runs if the
    // container itself is remeasured via a fresh mount.
  }, [bundle.regions, overview]);

  // Imperatively (re-)applies the camera for `code` (a region, or null for
  // the overview), always stamping a fresh `_nonce` — see CameraViewState's
  // doc comment for why that's required even when the target is UNCHANGED
  // from what's currently applied (e.g. re-clicking the already-selected
  // region: deck.gl's own content-based deepEqual check on `initialViewState`
  // would otherwise silently no-op the reset). Only ever called from the
  // camera-sync effect below — never directly from a click/keydown handler
  // (see `reselectNonce`'s doc comment for why).
  const flyTo = useCallback(
    (code: string | null) => {
      if (!containerRef.current) return;
      const { width, height } = containerRef.current.getBoundingClientRect();
      if (width <= 0 || height <= 0) return;
      const size = { width, height };
      const reduceMotion = prefersReducedMotion();

      nonceRef.current += 1;
      const nonce = nonceRef.current;

      if (code) {
        const feature = bundle.regions.features.find((f) => f.properties.code === code);
        if (!feature) return;
        const view = fitRegion(feature.properties.bbox, size);
        setCameraViewState({
          ...view,
          transitionDuration: reduceMotion ? 0 : view.transitionDuration,
          _nonce: nonce,
        });
      } else {
        const bbox = unionBbox(bundle.regions.features);
        const labelPoints = bundle.regions.features.map((f) => f.properties.labelPoint);
        const view = fitOverview(bbox, labelPoints, size);
        setCameraViewState({
          ...view,
          transitionInterpolator: new FlyToInterpolator({ speed: 1.5 }),
          transitionDuration: reduceMotion ? 0 : "auto",
          _nonce: nonce,
        });
      }
    },
    [bundle.regions],
  );

  // The single place that actually moves the camera, for every trigger:
  // selectedCode changing (RegionList click, canvas click on a NEW region,
  // ←/→, Esc, browser back/forward, a `?region=` deep link — all flow
  // through onSelect -> the URL -> selectedCode) AND reselectNonce changing
  // (re-clicking/re-Entering the ALREADY-selected region, which doesn't
  // change selectedCode at all).
  useEffect(() => {
    if (!overview) return; // wait for the mount effect first (and re-fire once it's ready, e.g. a `?region=` deep link)
    flyTo(selectedCode);
  }, [selectedCode, overview, reselectNonce, flyTo]);

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

  const selectedFeature = useMemo<RegionFeature | null>(() => {
    if (!selectedCode) return null;
    return bundle.regions.features.find((f) => f.properties.code === selectedCode) ?? null;
  }, [bundle.regions, selectedCode]);
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
  // calls out explicitly: "매 렌더 새 배열을 만들지 않는다").
  const labels = useMemo(
    () =>
      bundle.regions.features.map((f) => ({
        code: f.properties.code,
        name: f.properties.name,
        position: f.properties.labelPoint,
      })),
    [bundle.regions],
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
  // (GeoJsonLayer-backed, `info.object.properties.code`) layer.
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

  // A region was clicked on the canvas (the `regions` layer's own onClick —
  // see below). Re-clicking the ALREADY-selected region wouldn't change the
  // URL (setRegion would push the same value again), so bump reselectNonce
  // to force the camera-sync effect to re-fly anyway, instead of calling
  // onSelect with a no-op value. Every other click is a genuine selection
  // change; onSelect -> the URL -> that effect drives the camera instead,
  // exactly like a RegionList click would.
  const handleRegionClick = useCallback(
    (code: string) => {
      // Defensive: makeRegionsLayer's onClick is typed generically (plain
      // string, from GeoJSON feature properties) — every feature in
      // bundle.regions is in fact one of the 14 시군, but this narrows the
      // type rather than assuming it.
      if (!isRegionCode(code)) return;
      if (code === selectedCode) {
        setReselectNonce((n) => n + 1);
      } else {
        onSelect(code);
      }
    },
    [selectedCode, onSelect],
  );

  // Top-level DeckGL click: only handles the "missed everything" case (per
  // the task brief: "DeckGL 의 onClick 에서 info.picked === false 면
  // onSelect(null)"). A click that DID pick a region is handled by the
  // `regions` layer's own onClick (handleRegionClick) instead — deck.gl
  // fires both for the same click, so this only needs the miss branch.
  const handleDeckClick = useCallback(
    (info: PickingInfo) => {
      if (!info.picked && selectedCode !== null) {
        onSelect(null);
      }
    },
    [selectedCode, onSelect],
  );

  // Keyboard path on the map wrapper (tabIndex=0): ←/→ cycle through
  // `orderedCodes` and commit immediately (selection IS the URL — no
  // separate "focused but not selected" state to keep in sync with it).
  // Enter with nothing selected picks rank 1; Enter on the already-selected
  // region re-flies (same "reselect" case as a canvas re-click). No "Escape"
  // case here (Fix round 1, review finding #1) — deselecting on Escape is
  // now owned entirely by the document-level listener below, which (unlike
  // this handler) still fires when a mouse-driven selection has left focus
  // off the wrapper.
  const handleWrapperKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      // The compass/전체보기 widget buttons deck.gl renders are DOM
      // descendants of this same wrapper div, so a keydown ON one of them
      // (e.g. Tab to "전체보기", press Enter to activate it) still bubbles
      // up to this handler. Without this guard, our own "Enter" case below
      // would preventDefault() and hijack that native button activation —
      // only handle keys that land on the wrapper itself, not on a
      // focused descendant.
      if (event.target !== event.currentTarget) return;
      switch (event.key) {
        case "ArrowRight": {
          event.preventDefault();
          const next = nextRegion(orderedCodes, selectedCode, 1);
          if (next) onSelect(next);
          break;
        }
        case "ArrowLeft": {
          event.preventDefault();
          const prev = nextRegion(orderedCodes, selectedCode, -1);
          if (prev) onSelect(prev);
          break;
        }
        case "Enter": {
          event.preventDefault();
          if (selectedCode === null) {
            const first = nextRegion(orderedCodes, null, 1);
            if (first) onSelect(first);
          } else {
            // Same "reselect" case as handleRegionClick above.
            setReselectNonce((n) => n + 1);
          }
          break;
        }
        default:
          break;
      }
    },
    [orderedCodes, selectedCode, onSelect],
  );

  // Escape-to-deselect via a document-level listener (Fix round 1, review
  // finding #1): a MOUSE-driven selection leaves focus off the wrapper — a
  // RegionList click's clicked <button> unmounts once the panel swaps to
  // RegionPanel (focus reverts to <body>), and a canvas click never moves
  // focus onto the wrapper div either (mjolnir.js doesn't request it) — so
  // a keydown in either case never reaches handleWrapperKeyDown above at
  // all (React's delegated listener only fires for events whose target is
  // the wrapper itself or one of ITS descendants; <body> is an ANCESTOR of
  // the wrapper, not a descendant, so the event bubbles straight past it to
  // document without ever visiting the wrapper). Listening on `document`
  // catches Escape regardless of focus.
  //
  // Deliberately BUBBLE phase, not capture: IndicatorMenu registers its own
  // Escape handler on `document` in the CAPTURE phase and now calls
  // preventDefault() when it closes the menu (see IndicatorMenu.tsx). Every
  // capture-phase listener on a node runs before ANY bubble-phase listener
  // on that SAME node, for every event dispatch — a DOM invariant, true
  // regardless of which effect happened to attach first. That's what makes
  // the `defaultPrevented` check below reliable even though registration
  // order between these two components' effects is otherwise
  // nondeterministic (`onSelect` is a new function identity every render,
  // so this effect can re-attach on renders unrelated to IndicatorMenu's
  // own open/close state). Net effect: a single Escape with the indicator
  // menu open closes only the menu, never both.
  //
  // Also ignores a target inside a text-editing control (typing Escape in
  // an <input>/<textarea>/contenteditable — e.g. IndicatorMenu's own radio
  // inputs while focused — must never deselect the map behind it), and is
  // only attached while something is actually selected (nothing to
  // deselect otherwise).
  //
  // Task 4B: a highlighted school (highlightedSchoolId) clears FIRST — a
  // second Escape (now nothing highlighted) deselects the region, same as
  // before 4B. highlightedSchoolId can only be non-null while a region is
  // already selected (Dashboard resets it whenever regionCode changes), so
  // the effect's existing `!selectedCode` guard already covers this case
  // too — no separate attach condition needed.
  useEffect(() => {
    if (!selectedCode) return;
    function onDocumentKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (event.defaultPrevented) return;
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)
      ) {
        return;
      }
      if (highlightedSchoolId !== null) {
        onHighlightSchool(null);
      } else {
        onSelect(null);
      }
    }
    document.addEventListener("keydown", onDocumentKeyDown);
    return () => document.removeEventListener("keydown", onDocumentKeyDown);
  }, [selectedCode, onSelect, highlightedSchoolId, onHighlightSchool]);

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
  // 16px margin (추가 요구 #4) instead of the widget package's 12px default;
  // DarkTheme keeps the buttons legible against the varied 3D scene behind
  // them (the default LightTheme assumes a light page background).
  const widgetThemeStyle: CSSProperties = { ...DarkTheme, "--widget-margin": "16px" } as CSSProperties;

  // Its own useMemo (not just inlined in `layers` below): makes "data는
  // 선택이 바뀔 때만 새로" true by construction — `layers` also rebuilds on
  // indicator/font/label changes that have nothing to do with selection,
  // and inlining the call there would rebuild this layer's `data` array
  // every one of those times too (harmless, since deck.gl still diffs by
  // id, but not what the brief asks for).
  const selectedRingLayer = useMemo(
    () => makeSelectedRingLayer(selectedFeature, ringElevation),
    [selectedFeature, ringElevation],
  );

  const layers = useMemo<LayersList>(() => {
    const layerList: LayersList = [
      makeNeighborsLayer(bundle.neighbors),
      makeFootprintLayer(bundle.regions),
      makeRegionsLayer(bundle.regions, {
        elevationOf,
        fillColorOf: colorOf,
        triggerKey: indicatorId,
        selectedCode,
        onClick: handleRegionClick,
      }),
      selectedRingLayer,
      makeSchoolsLayer(regionSchools, {
        elevationOf,
        radiusOf,
        highlightedId: highlightedSchoolId,
        visible: schoolsVisible,
        onClick: handleSchoolClick,
        triggerKey: indicatorId,
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
        }),
        makeSchoolLabelsLayer(regionSchools, {
          elevationOf,
          visible: schoolLabelsVisible,
          fontFamily,
          characterSet,
          triggerKey: indicatorId,
        }),
      );
    }
    return layerList;
  }, [
    bundle.regions,
    bundle.neighbors,
    elevationOf,
    colorOf,
    indicatorId,
    selectedCode,
    handleRegionClick,
    selectedRingLayer,
    regionSchools,
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
  ]);

  // Fires every frame; only the first frame after the initial view state is
  // ready flips the wrapper's data-map-ready flag (e2e/smoke.spec.ts waits
  // on it) and, in the e2e build only, exposes the live Deck instance so
  // Playwright can project a region's ground point to a canvas pixel
  // (e2e/select-region.spec.ts's canvas-click coverage).
  const handleAfterRender = useCallback(() => {
    if (mapReadyRef.current) return;
    if (!containerRef.current) return;
    mapReadyRef.current = true;
    containerRef.current.setAttribute("data-map-ready", "true");
    if (process.env.NEXT_PUBLIC_E2E === "1" && deckRef.current?.deck) {
      window.__jbmap = { deck: deckRef.current.deck };
    }
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full bg-[#0b0f19] outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/70"
      style={widgetThemeStyle}
      tabIndex={0}
      aria-label="전북 시군 3D 지도"
      onKeyDown={handleWrapperKeyDown}
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
        />
      )}
      <div aria-live="polite" className="sr-only">
        {announcement}
      </div>
    </div>
  );
}
