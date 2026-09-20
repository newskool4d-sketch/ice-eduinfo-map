"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import DeckGL from "@deck.gl/react";
import { MapView } from "@deck.gl/core";
import type { LayersList } from "@deck.gl/core";
import { CompassWidget, DarkTheme, ResetViewWidget } from "@deck.gl/widgets";
import "@deck.gl/widgets/stylesheet.css";

import { isRegionCode, regionName } from "@/lib/geo/regions";
import { unionBbox, type Bbox } from "@/lib/geo/geo";
import { lightingEffect } from "@/components/map/lighting";
import { CONTROLLER, fitOverview } from "@/components/map/camera";
import {
  makeFootprintLayer,
  makeNeighborsLayer,
  makeRegionsLayer,
  makeSelectedRingLayer,
} from "@/components/map/layers/regionLayers";
import { makeRegionLabelLayer } from "@/components/map/layers/labelLayer";
import { makeTooltip } from "@/components/map/tooltip";
import { useBundle } from "@/lib/data/DataProvider";
import { indicatorById } from "@/lib/indicators/registry";
import type { IndicatorDef } from "@/lib/indicators/types";
import { displayLabel, rank, valueMap, vsProvince } from "@/lib/stats";
import { makeColorScale } from "@/lib/colors";
import { makeElevationScale } from "@/lib/scales";

// Fallback used when next/font's generated CSS variable can't be resolved
// (see the font-gating effect below) — a generic family, so
// `document.fonts.check()` still resolves true via the browser's own
// system-fallback glyph substitution for Hangul.
const FALLBACK_FONT_FAMILY = "'Noto Sans KR', sans-serif";

function nameOf(code: string): string {
  return isRegionCode(code) ? regionName(code) : code;
}

/**
 * `def.format(value)` already embeds the unit for some indicators
 * (formatPercent -> "%", formatArea -> "㎡") but not others (formatInt/
 * formatDecimal). Appending `def.unit` unconditionally would double up for
 * the first group ("12.3%%"); only appending when it isn't already there
 * handles both without a per-indicator special case.
 */
function formatWithUnit(def: IndicatorDef, value: number): string {
  const formatted = def.format(value);
  return formatted.endsWith(def.unit) ? formatted : `${formatted}${def.unit}`;
}

/** "+1,234명" / "-3.2%" — sign always shown, magnitude formatted (and unit-suffixed) the same way as the main value. */
function formatDelta(def: IndicatorDef, delta: number): string {
  const formatted = formatWithUnit(def, Math.abs(delta));
  return delta < 0 ? `-${formatted}` : `+${formatted}`;
}

const VIEW = new MapView();

type ViewState = ReturnType<typeof fitOverview>;

export interface DeckMapProps {
  indicatorId: string;
}

export default function DeckMap({ indicatorId }: DeckMapProps) {
  const bundle = useBundle();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapReadyRef = useRef(false);

  const [fontReady, setFontReady] = useState(false);
  const [fontFamily, setFontFamily] = useState(FALLBACK_FONT_FAMILY);
  const [initialViewState, setInitialViewState] = useState<ViewState | null>(null);

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

  // Uncontrolled camera: compute the initial view once, from the container's
  // measured size, the loaded regions' combined bbox, and every region's
  // label point (fitOverview needs both — see camera.ts's fitViewToPoints —
  // so a label doesn't end up clipped even when the polygon bbox itself
  // just barely fits).
  useEffect(() => {
    if (!containerRef.current) return;
    const { width, height } = containerRef.current.getBoundingClientRect();
    if (width <= 0 || height <= 0) return;
    const bbox: Bbox = unionBbox(bundle.regions.features);
    const labelPoints = bundle.regions.features.map((f) => f.properties.labelPoint);
    setInitialViewState(fitOverview(bbox, labelPoints, { width, height }));
    // bundle.regions is a stable reference for the provider's lifetime (set
    // once on load, never recreated) — this effect only re-runs if the
    // container itself is remeasured via a fresh mount.
  }, [bundle.regions]);

  const def = indicatorById(indicatorId);
  if (!def) {
    throw new Error(`DeckMap: unknown indicatorId "${indicatorId}"`);
  }

  const file = bundle.indicators[indicatorId];
  const map = useMemo(() => valueMap(file), [file]);
  const elevationOf = useMemo(() => makeElevationScale(def, map), [def, map]);
  const { colorOf } = useMemo(() => makeColorScale(def, map), [def, map]);
  const ranks = useMemo(() => rank(map, def.polarity), [map, def.polarity]);
  const label = useMemo(() => displayLabel(def, bundle.series), [def, bundle.series]);

  const labelTextOf = useCallback(
    (code: string): string => {
      const name = nameOf(code);
      const value = map.get(code);
      if (value === null || value === undefined) return `${name}\n자료 없음`;
      return `${name}\n${def.format(value)}`;
    },
    [map, def],
  );

  const linesOf = useCallback(
    (code: string): string[] => {
      const name = nameOf(code);
      const value = map.get(code);
      if (value === null || value === undefined) {
        return [name, `${label}: 자료 없음`];
      }
      const valueLine = `${label}: ${formatWithUnit(def, value)}`;
      const r = ranks.get(code);
      const rankLine = r !== undefined ? `14개 시군 중 ${r}위` : "순위 없음";
      const delta = vsProvince(map, code);
      // vsProvince is always `value - 52000행`, per stats.ts — but the 52000
      // row is only a true (Σ/Σ) *average* for ratio-kind indicators; for
      // count-kind indicators it's the province-wide *total* (Σ), so
      // labeling the comparison "평균 대비" there would misreport what the
      // number is (confirmed while manually checking the tooltip: 임실군's
      // students_total delta renders as -164,634, i.e. against the total,
      // not a ~11,854 provincial average — "총계 대비" is the honest label).
      const deltaNoun = def.kind === "ratio" ? "평균" : "총계";
      const deltaLine =
        delta === null
          ? `전북 ${deltaNoun} 대비: 자료 없음`
          : `전북 ${deltaNoun} 대비 ${formatDelta(def, delta)}`;
      return [name, valueLine, rankLine, deltaLine];
    },
    [map, def, label, ranks],
  );

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

  const getTooltip = useMemo(() => makeTooltip(linesOf), [linesOf]);

  const getCursor = useCallback(
    ({ isDragging, isHovering }: { isDragging: boolean; isHovering: boolean }) =>
      isDragging ? "grabbing" : isHovering ? "pointer" : "grab",
    [],
  );

  // 추가 요구 #4: 나침반(bearing/pitch reset) + 전체보기(fit-to-overview)
  // buttons, bottom-left inside the canvas. Both are official deck.gl
  // widgets (already a direct dependency) rather than hand-rolled buttons:
  // ResetViewWidget defaults to deck.props.initialViewState — exactly the
  // fitOverview() seed below — and both call the Widget base class's
  // setViewState(), which works correctly against this uncontrolled view
  // (no viewState/onViewStateChange loop needed here).
  const widgets = useMemo(
    () => [
      new CompassWidget({ id: "compass", placement: "bottom-left", label: "나침반" }),
      new ResetViewWidget({ id: "reset-view", placement: "bottom-left", label: "전체보기" }),
    ],
    [],
  );
  // 16px margin (추가 요구 #4) instead of the widget package's 12px default;
  // DarkTheme keeps the buttons legible against the varied 3D scene behind
  // them (the default LightTheme assumes a light page background).
  const widgetThemeStyle: CSSProperties = { ...DarkTheme, "--widget-margin": "16px" } as CSSProperties;

  const layers = useMemo<LayersList>(() => {
    const layerList: LayersList = [
      makeNeighborsLayer(bundle.neighbors),
      makeFootprintLayer(bundle.regions),
      makeRegionsLayer(bundle.regions, {
        elevationOf,
        fillColorOf: colorOf,
        triggerKey: indicatorId,
      }),
      makeSelectedRingLayer(null, 0),
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
      );
    }
    return layerList;
  }, [bundle.regions, bundle.neighbors, elevationOf, colorOf, indicatorId, fontReady, labels, labelTextOf, fontFamily, characterSet]);

  // Fires every frame; only the first frame after the initial view state is
  // ready flips the wrapper's data-map-ready flag (e2e/smoke.spec.ts waits
  // on it).
  const handleAfterRender = useCallback(() => {
    if (mapReadyRef.current) return;
    if (!containerRef.current) return;
    mapReadyRef.current = true;
    containerRef.current.setAttribute("data-map-ready", "true");
  }, []);

  return (
    <div ref={containerRef} className="relative h-full w-full bg-[#0b0f19]" style={widgetThemeStyle}>
      {initialViewState && (
        <DeckGL
          initialViewState={initialViewState}
          views={views}
          controller={CONTROLLER}
          effects={[lightingEffect]}
          layers={layers}
          widgets={widgets}
          getTooltip={getTooltip}
          getCursor={getCursor}
          onAfterRender={handleAfterRender}
        />
      )}
    </div>
  );
}
