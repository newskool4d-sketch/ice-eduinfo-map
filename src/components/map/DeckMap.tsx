"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import DeckGL from "@deck.gl/react";
import { MapView } from "@deck.gl/core";
import type { LayersList } from "@deck.gl/core";
import { interpolateBlues } from "d3-scale-chromatic";

import { isRegionCode, regionName } from "@/lib/geo/regions";
import { unionBbox, type Bbox } from "@/lib/geo/geo";
import { lightingEffect } from "@/components/map/lighting";
import { CONTROLLER, fitOverview, PANEL_WIDTH } from "@/components/map/camera";
import {
  makeFootprintLayer,
  makeNeighborsLayer,
  makeRegionsLayer,
  makeSelectedRingLayer,
} from "@/components/map/layers/regionLayers";
import { makeRegionLabelLayer } from "@/components/map/layers/labelLayer";
import { makeTooltip } from "@/components/map/tooltip";
import { loadGeo, type LoadedGeo } from "@/components/map/loadGeo";

// Fallback used when next/font's generated CSS variable can't be resolved
// (see the font-gating effect below) — a generic family, so
// `document.fonts.check()` still resolves true via the browser's own
// system-fallback glyph substitution for Hangul.
const FALLBACK_FONT_FAMILY = "'Noto Sans KR', sans-serif";

// No real indicator data yet (that lands in a later task) — every region's
// height/color is a deterministic hash of its own code, so the scene is
// visually stable across reloads without depending on any indicator.
function dummyValue(code: string): number {
  const n = parseInt(code, 10);
  return ((n * 2654435761) % 1000) / 1000;
}

const MIN_ELEVATION = 800;
const MAX_ELEVATION = 50000;

function elevationOf(code: string): number {
  return MIN_ELEVATION + (MAX_ELEVATION - MIN_ELEVATION) * dummyValue(code);
}

const FILL_COLOR_STEPS: number = 5;
const FILL_COLOR_DOMAIN: [number, number] = [0.25, 0.95];
const RGB_PATTERN = /^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/;

function fillColorOf(code: string): [number, number, number, number] {
  const t = dummyValue(code);
  // Quantize into FILL_COLOR_STEPS buckets so the dummy scene reads as a
  // discrete legend (matching how a real indicator's choropleth will look)
  // rather than a continuous gradient.
  const bucket = Math.min(FILL_COLOR_STEPS - 1, Math.floor(t * FILL_COLOR_STEPS));
  const q = FILL_COLOR_STEPS === 1 ? 0 : bucket / (FILL_COLOR_STEPS - 1);
  const [lo, hi] = FILL_COLOR_DOMAIN;
  const rgbString = interpolateBlues(lo + (hi - lo) * q);
  const match = RGB_PATTERN.exec(rgbString);
  if (!match) return [8, 48, 107, 255];
  return [Number(match[1]), Number(match[2]), Number(match[3]), 255];
}

// Static for this task (no selectable indicator yet) — updateTriggers still
// need a key so the layer factories' `opts.triggerKey` contract is exercised
// the same way a real indicator id will drive it in a later task.
const DUMMY_TRIGGER_KEY = "dummy-v1";

function valueTextOf(code: string): string {
  return `더미 값 ${dummyValue(code).toFixed(2)}`;
}

function nameOf(code: string): string {
  return isRegionCode(code) ? regionName(code) : code;
}

type ViewState = ReturnType<typeof fitOverview>;

export default function DeckMap() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapReadyRef = useRef(false);

  const [geo, setGeo] = useState<LoadedGeo | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [fontReady, setFontReady] = useState(false);
  const [fontFamily, setFontFamily] = useState(FALLBACK_FONT_FAMILY);
  const [initialViewState, setInitialViewState] = useState<ViewState | null>(null);

  // Load regions/neighbors/charset once on mount.
  useEffect(() => {
    let cancelled = false;
    loadGeo()
      .then((data) => {
        if (!cancelled) setGeo(data);
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Font gating: TextLayer caches one SDF atlas per fontFamily, so we must
  // not create it until next/font's family is actually ready to rasterize.
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
        // instead (verified empirically; see task-1A-report.md), silently
        // bypassing the fallback below since that value is non-empty too.
        const cssVar = getComputedStyle(document.body).getPropertyValue("--font-sans").trim();
        if (cssVar) family = cssVar;
      } catch {
        // getComputedStyle can throw outside a browser; keep the fallback.
      }
      try {
        await document.fonts.load(`600 16px ${family}`);
        if (!document.fonts.check(`600 16px ${family}`)) {
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
  }, []);

  // Uncontrolled camera: compute the initial view once, from the container's
  // measured size and the loaded regions' combined bbox.
  useEffect(() => {
    if (!geo || !containerRef.current) return;
    const { width, height } = containerRef.current.getBoundingClientRect();
    if (width <= 0 || height <= 0) return;
    const bbox: Bbox = unionBbox(geo.regions.features);
    setInitialViewState(fitOverview(bbox, { width, height }));
  }, [geo]);

  const views = useMemo(() => new MapView({ padding: { right: PANEL_WIDTH } }), []);

  const getTooltip = useMemo(() => makeTooltip(nameOf, valueTextOf), []);

  const getCursor = useCallback(
    ({ isDragging, isHovering }: { isDragging: boolean; isHovering: boolean }) =>
      isDragging ? "grabbing" : isHovering ? "pointer" : "grab",
    [],
  );

  const layers = useMemo<LayersList>(() => {
    if (!geo) return [];
    const layerList: LayersList = [
      makeNeighborsLayer(geo.neighbors),
      makeFootprintLayer(geo.regions),
      makeRegionsLayer(geo.regions, {
        elevationOf,
        fillColorOf,
        triggerKey: DUMMY_TRIGGER_KEY,
      }),
      makeSelectedRingLayer(null, 0),
    ];
    if (fontReady) {
      const labels = geo.regions.features.map((f) => ({
        code: f.properties.code,
        name: f.properties.name,
        position: f.properties.labelPoint,
      }));
      layerList.push(
        makeRegionLabelLayer(labels, {
          elevationOf,
          textOf: nameOf,
          triggerKey: DUMMY_TRIGGER_KEY,
          fontFamily,
          characterSet: geo.charset,
        }),
      );
    }
    return layerList;
  }, [geo, fontReady, fontFamily]);

  // Fires every frame; only the first frame after regions have loaded flips
  // the wrapper's data-map-ready flag (e2e/smoke.spec.ts waits on it).
  const handleAfterRender = useCallback(() => {
    if (mapReadyRef.current) return;
    if (!geo || !containerRef.current) return;
    mapReadyRef.current = true;
    containerRef.current.setAttribute("data-map-ready", "true");
  }, [geo]);

  return (
    <div ref={containerRef} className="relative h-full w-full bg-[#0b0f19]">
      {loadError && (
        <div className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-red-300">
          지도를 불러오지 못했습니다: {loadError}
        </div>
      )}
      {!geo && !loadError && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-[#e6e9f0]/50">
          지도 데이터를 불러오는 중
        </div>
      )}
      {geo && initialViewState && (
        <DeckGL
          initialViewState={initialViewState}
          views={views}
          controller={CONTROLLER}
          effects={[lightingEffect]}
          layers={layers}
          getTooltip={getTooltip}
          getCursor={getCursor}
          onAfterRender={handleAfterRender}
        />
      )}
    </div>
  );
}
