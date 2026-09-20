import { ScatterplotLayer, TextLayer } from "@deck.gl/layers";
import type { PickingInfo } from "@deck.gl/core";

import { SCHOOL_LEVEL_COLORS } from "@/lib/schoolVisuals";
import type { School } from "@/lib/schools/types";

const LINE_COLOR_NORMAL: [number, number, number, number] = [255, 255, 255, 120];
const LINE_COLOR_HIGHLIGHTED: [number, number, number, number] = [255, 255, 255, 255];
const LINE_WIDTH_NORMAL = 1;
const LINE_WIDTH_HIGHLIGHTED = 2;

/** A school with a real location match (see fix-round-1: a 특수학교 row has `lat`/`lng: null` and can never be plotted). */
export type PositionedSchool = School & { lat: number; lng: number };

/**
 * Type guard for a school with a real coordinate. fix-round-2 (review
 * finding #1): this used to be a `withCoordinates()` HELPER that both layer
 * factories called on every invocation, re-filtering (and re-allocating a
 * brand-new array) each time — even when the input hadn't changed at all.
 * Since both factories are built inside DeckMap's `layers` useMemo (whose
 * deps include highlightedSchoolId/handleSchoolClick), that meant every
 * highlight click handed deck.gl a new `data` array identity, which deck.gl
 * treats as "the whole dataset changed" (`invalidateAll()`), defeating the
 * layers' own scoped `updateTriggers` (getLineColor/getLineWidth only).
 * DeckMap.tsx now calls this predicate itself, ONCE, inside its own
 * `useMemo(() => regionSchools.filter(hasCoordinates), [regionSchools])` —
 * that array's identity (and therefore both layers' `data` identity, since
 * they're both handed this SAME array) only changes when the selected
 * region's school set actually changes, never on a highlight-only
 * re-render. See `tests/unit/schoolLayers.test.ts`'s "data reference
 * stability" describe block.
 */
export function hasCoordinates(school: School): school is PositionedSchool {
  return school.lat !== null && school.lng !== null;
}

export interface SchoolsLayerOptions {
  /** Same injection point as makeRegionsLayer's elevationOf — schools sit on their region's top face. */
  elevationOf: (regionCode: string) => number;
  /** students -> radius(px), pre-scaled over the FULL schools.json list (see makeSchoolRadiusScale) so dot sizes don't rescale when the selected 시군 changes. */
  radiusOf: (students: number | null) => number;
  /** The currently-highlighted school's id (RegionPanel row click / map click), or null/undefined. */
  highlightedId?: string | null;
  visible: boolean;
  onClick?: (id: string) => void;
  /** Included in updateTriggers.getPosition — elevationOf's output depends on the selected indicator, so a school's z coordinate must re-evaluate when it changes (same pattern as makeRegionsLayer's triggerKey). */
  triggerKey: string | number;
}

/** The 학교 point layer — only ever fed the selected 시군's schools by the caller (DeckMap); `visible` additionally gates the whole layer (e.g. off entirely when nothing is selected). `schools` must already be pre-filtered to real coordinates (see `hasCoordinates`) — this factory does NOT filter or reallocate `data` itself (fix-round-2, review finding #1: that used to happen here, defeating `data` reference stability across re-renders); the `PositionedSchool[]` parameter type enforces this at compile time, not just by convention. See `tests/unit/schoolLayers.test.ts`. */
export function makeSchoolsLayer(schools: PositionedSchool[], opts: SchoolsLayerOptions) {
  const highlightedId = opts.highlightedId ?? null;

  return new ScatterplotLayer<PositionedSchool>({
    id: "schools",
    data: schools,
    visible: opts.visible,
    pickable: true,
    autoHighlight: true,
    stroked: true,
    filled: true,
    billboard: true,
    radiusUnits: "pixels",
    radiusMinPixels: 3,
    lineWidthUnits: "pixels",
    getPosition: (d): [number, number, number] => [d.lng, d.lat, opts.elevationOf(d.regionCode) + 50],
    getRadius: (d) => opts.radiusOf(d.students),
    getFillColor: (d) => SCHOOL_LEVEL_COLORS[d.level],
    getLineColor: (d) => (d.id === highlightedId ? LINE_COLOR_HIGHLIGHTED : LINE_COLOR_NORMAL),
    getLineWidth: (d) => (d.id === highlightedId ? LINE_WIDTH_HIGHLIGHTED : LINE_WIDTH_NORMAL),
    // Same reasoning as region-labels.ts: schools sit close to/inside a
    // region's extruded body and must never get depth-tested away behind a
    // taller neighboring face.
    parameters: { depthCompare: "always", depthWriteEnabled: false },
    updateTriggers: {
      getPosition: [opts.triggerKey],
      getLineColor: [highlightedId],
      getLineWidth: [highlightedId],
    },
    transitions: {
      getPosition: 600,
    },
    onClick: opts.onClick
      ? (info: PickingInfo<PositionedSchool>) => {
          if (info.object) opts.onClick?.(info.object.id);
        }
      : undefined,
  });
}

export interface SchoolLabelsLayerOptions {
  elevationOf: (regionCode: string) => number;
  /** Computed by the caller as `!!selectedCode && zoom >= 11` (see DeckMap.tsx) — this layer has no zoom/selection awareness of its own. */
  visible: boolean;
  fontFamily: string;
  characterSet: string[];
  triggerKey: string | number;
}

/** 학교명 라벨 — billboarded text just above each school's point marker. Only meaningful once zoomed in (see `visible`'s doc comment); the data given is always already scoped to the selected 시군 by the caller. `schools` must already be pre-filtered to real coordinates, same as makeSchoolsLayer — see its doc comment (fix-round-2, review finding #1). */
export function makeSchoolLabelsLayer(schools: PositionedSchool[], opts: SchoolLabelsLayerOptions) {
  return new TextLayer<PositionedSchool>({
    id: "school-labels",
    data: schools,
    visible: opts.visible,
    // +50 to sit level with the point marker (same offset makeSchoolsLayer
    // uses), +30 more so the label floats just above the dot instead of
    // overlapping it.
    getPosition: (d): [number, number, number] => [d.lng, d.lat, opts.elevationOf(d.regionCode) + 80],
    getText: (d) => d.name,
    sizeUnits: "pixels",
    getSize: 11,
    billboard: true,
    getAlignmentBaseline: "bottom",
    fontFamily: opts.fontFamily,
    fontWeight: 500,
    characterSet: opts.characterSet,
    fontSettings: { sdf: true, fontSize: 48 },
    outlineWidth: 0.15,
    outlineColor: [10, 14, 25, 255],
    getColor: [230, 233, 240, 255],
    parameters: { depthCompare: "always", depthWriteEnabled: false },
    updateTriggers: {
      getPosition: [opts.triggerKey],
      getText: [opts.triggerKey],
    },
    transitions: {
      getPosition: 600,
    },
  });
}
