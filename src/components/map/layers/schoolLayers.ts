import { ColumnLayer, TextLayer } from "@deck.gl/layers";
import type { PickingInfo } from "@deck.gl/core";
import { CollisionFilterExtension, type CollisionFilterExtensionProps } from "@deck.gl/extensions";

import { SCHOOL_LEVEL_COLORS } from "@/lib/schoolVisuals";
import { REGION_MATERIAL } from "@/components/map/lighting";
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

/** Default deck.gl `transitions` duration (ms) — see each factory's `transitionDuration` option. */
const DEFAULT_TRANSITION_DURATION = 600;

// Task D — 학교 기둥: fixed visual constants for EVERY school column,
// regardless of student count (only height — makeSchoolHeightScale in
// schoolVisuals.ts — encodes the count; radius/resolution/highlight color
// are the same for every column, the same way makeRegionsLayer's
// highlightColor is a single constant, not per-feature).
const COLUMN_RADIUS_PX = 4;
const COLUMN_DISK_RESOLUTION = 10;
const HIGHLIGHT_COLOR: [number, number, number, number] = [255, 255, 255, 120];

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
  /** students -> column height(m), pre-scaled over the FULL schools.json list (see makeSchoolHeightScale) so column heights don't rescale when the selected 시군 changes. */
  heightOf: (students: number | null) => number;
  /** Stable identity for `heightOf`'s domain (e.g. `bundle.schools.referenceDate.stats`) — included in `updateTriggers.getElevation` so a dataset refresh re-evaluates height. In practice `heightOf` only changes when `bundle.schools` itself changes, which also changes `data`'s own reference (deck.gl already regenerates every attribute from scratch on a new `data` reference) — this trigger is a defensive belt-and-suspenders measure, not something that fires in normal use. */
  heightKey: string | number;
  /** The currently-highlighted school's id (RegionPanel row click / map click), or null/undefined. */
  highlightedId?: string | null;
  visible: boolean;
  onClick?: (id: string) => void;
  /** Included in updateTriggers.getPosition — elevationOf's output depends on the selected indicator, so a school's z coordinate must re-evaluate when it changes (same pattern as makeRegionsLayer's triggerKey). */
  triggerKey: string | number;
  /** deck.gl `transitions` duration (ms) for getPosition/getElevation. Defaults to 600. Task 6, Section A.4 — pass 0 when `prefers-reduced-motion: reduce`. */
  transitionDuration?: number;
}

/**
 * Task D — the 학교 layer: an extruded `ColumnLayer`, one 기둥 (column) per
 * school standing on its region's top face, replacing the old flat
 * `ScatterplotLayer` dot. Only ever fed the selected 시군's schools by the
 * caller (DeckMap); `visible` additionally gates the whole layer (e.g. off
 * entirely when nothing is selected). `schools` must already be
 * pre-filtered to real coordinates (see `hasCoordinates`) — this factory
 * does NOT filter or reallocate `data` itself (fix-round-2, review finding
 * #1: that used to happen here, defeating `data` reference stability across
 * re-renders); the `PositionedSchool[]` parameter type enforces this at
 * compile time, not just by convention. See `tests/unit/schoolLayers.test.ts`.
 *
 * `getPosition`'s z is exactly `elevationOf(regionCode)` — the column's
 * BASE, not its center: verified directly against the installed
 * `@deck.gl/layers`' column-geometry.ts (the static template mesh spans
 * local z [-1, +1]) and column-layer-vertex.glsl.ts
 * (`elevation = instanceElevations * (positions.z + 1.0) / 2.0 * ...`,
 * ADDED to `instancePositions.z`) — local z=-1 (the column's un-capped
 * bottom edge) contributes 0 elevation, so the rendered base sits exactly
 * at `getPosition`'s z, and local z=+1 (the capped top) contributes the
 * full `getElevation(d)` value. No bottom cap is ever tessellated (only a
 * side wall + a top cap — see column-geometry.ts), so there's no coincident
 * filled surface at the base to z-fight the region's own top face.
 *
 * Highlight is `highlightedObjectIndex` + `highlightColor` (deck.gl's own
 * picking-based recolor), not a custom stroke: an extruded column's
 * `stroked` prop only affects ColumnLayer's FLAT/non-extruded disk mode
 * (confirmed against the installed shader: the stroke branch is
 * `else if (column.stroked)`, mutually exclusive with the `extruded`
 * branch), so the old getLineColor/getLineWidth toggle has no extruded
 * equivalent to move to.
 */
export function makeSchoolsLayer(schools: PositionedSchool[], opts: SchoolsLayerOptions) {
  const highlightedId = opts.highlightedId ?? null;
  const transitionDuration = opts.transitionDuration ?? DEFAULT_TRANSITION_DURATION;
  // `null`, not -1, when nothing is highlighted (or the highlighted id
  // isn't in `data` at all): deck.gl's own `updateAutoHighlight` (installed
  // @deck.gl/core's layer.ts:1306) only runs the hover-highlight path
  // `if (autoHighlight && !Number.isInteger(highlightedObjectIndex))` —
  // since `Number.isInteger(-1) === true`, passing
  // `Array.prototype.findIndex`'s raw not-found sentinel (-1) would
  // permanently defeat `autoHighlight: true` below (hover would never
  // highlight anything, for the life of the layer) even though both
  // `autoHighlight` and a non-default `highlightColor` are explicitly
  // configured. `null` is deck.gl's own documented "nothing explicitly
  // highlighted" default and keeps hover working; verified directly
  // against the installed source.
  const foundIndex = schools.findIndex((s) => s.id === highlightedId);
  const highlightedObjectIndex = foundIndex >= 0 ? foundIndex : null;

  return new ColumnLayer<PositionedSchool>({
    id: "schools",
    data: schools,
    visible: opts.visible,
    pickable: true,
    autoHighlight: true,
    highlightColor: HIGHLIGHT_COLOR,
    highlightedObjectIndex,
    radiusUnits: "pixels",
    radius: COLUMN_RADIUS_PX,
    diskResolution: COLUMN_DISK_RESOLUTION,
    extruded: true,
    flatShading: true,
    material: REGION_MATERIAL,
    getPosition: (d): [number, number, number] => [d.lng, d.lat, opts.elevationOf(d.regionCode)],
    getElevation: (d) => opts.heightOf(d.students),
    getFillColor: (d) => SCHOOL_LEVEL_COLORS[d.level],
    // Task D — NO `parameters` override (the old ScatterplotLayer's
    // `depthCompare: 'always'` is REMOVED here): a flat point marker needed
    // to always draw on top regardless of what's behind it, but a real,
    // extruded 3D column is the opposite — it must be depth-tested normally
    // against every other column/region so nearer geometry correctly
    // occludes farther geometry. Leaving `parameters` unset keeps deck.gl's
    // own default (depth test+write both on), same as makeRegionsLayer's
    // extruded body. Shadow casting is also left at its default (ON) —
    // unlike the labels (school-labels/region-labels/region-top-rings),
    // this layer has no `shadowEnabled: false` — a column casts a shadow
    // onto its region's top face, same as the region body itself.
    updateTriggers: {
      getPosition: [opts.triggerKey],
      getElevation: [opts.heightKey],
    },
    transitions: {
      getPosition: transitionDuration,
      getElevation: transitionDuration,
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
  /** students -> column height(m) — the SAME accessor DeckMap hands makeSchoolsLayer (see its own doc comment), so a label always floats exactly 30m above ITS OWN school's actual column top, not a fixed/average offset. */
  heightOf: (students: number | null) => number;
  /** Same as makeSchoolsLayer's heightKey — included in updateTriggers.getPosition since z now depends on heightOf too. */
  heightKey: string | number;
  /** Computed by the caller as `!!selectedCode && zoom >= 10` (see DeckMap.tsx's SCHOOL_LABEL_MIN_ZOOM, Task B: 11 -> 10) — this layer has no zoom/selection awareness of its own. */
  visible: boolean;
  fontFamily: string;
  characterSet: string[];
  triggerKey: string | number;
  /** deck.gl `transitions` duration (ms) for getPosition. Defaults to 600. Task 6, Section A.4 — pass 0 when `prefers-reduced-motion: reduce`. */
  transitionDuration?: number;
}

/** 학교명 라벨 — billboarded text just above each school's own column top. Only meaningful once zoomed in (see `visible`'s doc comment); the data given is always already scoped to the selected 시군 by the caller. `schools` must already be pre-filtered to real coordinates, same as makeSchoolsLayer — see its doc comment (fix-round-2, review finding #1). */
export function makeSchoolLabelsLayer(schools: PositionedSchool[], opts: SchoolLabelsLayerOptions) {
  const transitionDuration = opts.transitionDuration ?? DEFAULT_TRANSITION_DURATION;

  return new TextLayer<PositionedSchool, CollisionFilterExtensionProps<PositionedSchool>>({
    id: "school-labels",
    data: schools,
    visible: opts.visible,
    // Task D — z now tracks each school's OWN column top (elevationOf +
    // heightOf(students)) + a fixed 30m clearance, replacing the old
    // constant +80 offset (which assumed every school sat at the SAME flat
    // point-marker height, elevationOf+50 — meaningless now that height
    // varies per school via makeSchoolHeightScale).
    getPosition: (d): [number, number, number] => [
      d.lng,
      d.lat,
      opts.elevationOf(d.regionCode) + opts.heightOf(d.students) + 30,
    ],
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
      getPosition: [opts.triggerKey, opts.heightKey],
      getText: [opts.triggerKey],
    },
    transitions: {
      getPosition: transitionDuration,
    },
  });
}
