import { ScatterplotLayer, TextLayer } from "@deck.gl/layers";
import type { PickingInfo } from "@deck.gl/core";
import { CollisionFilterExtension, type CollisionFilterExtensionProps } from "@deck.gl/extensions";

import { SCHOOL_LEVEL_COLORS } from "@/lib/schoolVisuals";
import type { School } from "@/lib/schools/types";

// Task B — module-scope constant, same reasoning as labelLayer.ts's own
// COLLISION_FILTER_EXTENSION (a fresh instance every render would be
// equally correct — LayerExtension.equals() treats any two no-opts
// instances as equal — this just skips the pointless per-render alloc). A
// SEPARATE instance from labelLayer.ts's, deliberately: nothing shares
// state through it (CollisionFilterExtension carries none — collisionGroup/
// collisionTestProps/getCollisionPriority all live on the LAYER, not the
// extension), so a second instance costs nothing and keeps this module
// independent of labelLayer.ts.
const COLLISION_FILTER_EXTENSION = new CollisionFilterExtension();

/**
 * Task B — clamps a school's raw student count into
 * CollisionFilterExtension's documented safe range for `getCollisionPriority`
 * ("Must return a number in the range -1000 -> 1000" — installed
 * @deck.gl/extensions' collision-filter-extension.d.ts). The installed
 * collision shader (shader-module.js) enforces this literally:
 * `position.z = -0.001 * collisionPriority * position.w` is a CLIP-SPACE z,
 * so an unclamped priority above 1000 pushes a label's entire quad past the
 * near clip plane during the collision pass — the GPU then discards it
 * outright, making that label invisible FOREVER (not merely de-prioritized).
 * Real data has schools above 1000 학생 (max 1607, 군산금빛초등학교) — clamping
 * keeps "more students -> higher priority" for the realistic range while
 * never crossing into that failure mode. See task-B-report.md.
 */
const MAX_COLLISION_PRIORITY = 1000;
function schoolCollisionPriority(students: number | null): number {
  return Math.min(students ?? 0, MAX_COLLISION_PRIORITY);
}

// Task 6, Section C-추가 #4 — 학교 점 가독성: a dark, OPAQUE stroke (was
// translucent white, alpha 120) so a point stays legible against a bright
// top face (e.g. Viridis's near-yellow high end almost swallowed an amber
// 중학교 dot at the old alpha). `#0b0f19` matches this app's own map/page
// background — a stroke that dark reads as a crisp separating edge against
// ANY fill color behind it (verified: ~15:1 WCAG contrast vs a bright
// yellow top face, vs ~1.25:1 for the bare amber fill with no stroke at
// all). Highlighted stays opaque white (unchanged) — a deliberately
// higher-attention cue, now distinguished from normal by hue rather than
// alpha, since both are fully opaque.
const LINE_COLOR_NORMAL: [number, number, number, number] = [11, 15, 25, 255];
const LINE_COLOR_HIGHLIGHTED: [number, number, number, number] = [255, 255, 255, 255];
const LINE_WIDTH_NORMAL = 1.5;
const LINE_WIDTH_HIGHLIGHTED = 2;
/** Default deck.gl `transitions` duration (ms) — see each factory's `transitionDuration` option. */
const DEFAULT_TRANSITION_DURATION = 600;

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
  /** deck.gl `transitions` duration (ms) for getPosition. Defaults to 600. Task 6, Section A.4 — pass 0 when `prefers-reduced-motion: reduce`. */
  transitionDuration?: number;
}

/** The 학교 point layer — only ever fed the selected 시군's schools by the caller (DeckMap); `visible` additionally gates the whole layer (e.g. off entirely when nothing is selected). `schools` must already be pre-filtered to real coordinates (see `hasCoordinates`) — this factory does NOT filter or reallocate `data` itself (fix-round-2, review finding #1: that used to happen here, defeating `data` reference stability across re-renders); the `PositionedSchool[]` parameter type enforces this at compile time, not just by convention. See `tests/unit/schoolLayers.test.ts`. */
export function makeSchoolsLayer(schools: PositionedSchool[], opts: SchoolsLayerOptions) {
  const highlightedId = opts.highlightedId ?? null;
  const transitionDuration = opts.transitionDuration ?? DEFAULT_TRANSITION_DURATION;

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
      getPosition: transitionDuration,
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
  /** Computed by the caller as `!!selectedCode && zoom >= 10` (see DeckMap.tsx's SCHOOL_LABEL_MIN_ZOOM, Task B: 11 -> 10) — this layer has no zoom/selection awareness of its own. */
  visible: boolean;
  fontFamily: string;
  characterSet: string[];
  triggerKey: string | number;
  /** deck.gl `transitions` duration (ms) for getPosition. Defaults to 600. Task 6, Section A.4 — pass 0 when `prefers-reduced-motion: reduce`. */
  transitionDuration?: number;
}

/** 학교명 라벨 — billboarded text just above each school's point marker. Only meaningful once zoomed in (see `visible`'s doc comment); the data given is always already scoped to the selected 시군 by the caller. `schools` must already be pre-filtered to real coordinates, same as makeSchoolsLayer — see its doc comment (fix-round-2, review finding #1). */
export function makeSchoolLabelsLayer(schools: PositionedSchool[], opts: SchoolLabelsLayerOptions) {
  const transitionDuration = opts.transitionDuration ?? DEFAULT_TRANSITION_DURATION;

  return new TextLayer<PositionedSchool, CollisionFilterExtensionProps<PositionedSchool>>({
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
    // Task B — 칩 배경은 더 작게: same dark/translucent palette as
    // region-labels (labelLayer.ts), tighter padding/radius for the smaller
    // (11px) school-name text.
    background: true,
    getBackgroundColor: [12, 14, 20, 170],
    backgroundPadding: [4, 2],
    backgroundBorderRadius: 4,
    // Task B — CollisionFilterExtension: own collisionGroup
    // ('school-labels', separate from region-labels' 'labels') so the two
    // never compete for the same collision budget; `sizeScale: 1.6` (a
    // bigger collision-test hitbox multiplier than region-labels' 1.3 —
    // school names sit much closer together on screen once zoomed in).
    // getCollisionPriority = 학생수 (schoolCollisionPriority, clamped — see
    // its own doc comment above for why the clamp is necessary, not just
    // defensive). No `updateTriggers.getCollisionPriority` entry: unlike
    // region-labels' priority (which closes over `selectedCode`, state
    // EXTERNAL to any one datum), this reads only `d.students` — deck.gl
    // already re-evaluates every accessor whenever `data`'s reference
    // changes (a new selected region), which is the only way a school's own
    // student count could ever change here.
    extensions: [COLLISION_FILTER_EXTENSION],
    collisionEnabled: true,
    collisionGroup: "school-labels",
    collisionTestProps: { sizeScale: 1.6 },
    getCollisionPriority: (d: PositionedSchool) => schoolCollisionPriority(d.students),
    parameters: { depthCompare: "always", depthWriteEnabled: false },
    // Task A — 그림자 캐스팅 제외: same reasoning as labelLayer.ts's
    // region-labels — an outer `shadowEnabled` prop never reaches TextLayer's
    // leaf sub-layers (MultiIconLayer `characters`, TextBackgroundLayer
    // `background`), which is what deck.gl's shadow pass actually checks.
    _subLayerProps: {
      characters: { shadowEnabled: false },
      background: { shadowEnabled: false },
    },
    updateTriggers: {
      getPosition: [opts.triggerKey],
      getText: [opts.triggerKey],
    },
    transitions: {
      getPosition: transitionDuration,
    },
  });
}
