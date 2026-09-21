import { TextLayer } from "@deck.gl/layers";
import { CollisionFilterExtension, type CollisionFilterExtensionProps } from "@deck.gl/extensions";

// Task B — module-scope constant (same pattern as regionLayers.ts's
// `REGION_MATERIAL`/lighting.ts's `lightingEffect`): a fresh
// `new CollisionFilterExtension()` on every render would be equally safe —
// `LayerExtension.equals()` (installed @deck.gl/core's layer-extension.js)
// compares `this.constructor === extension.constructor && deepEqual(opts)`,
// and this extension is always constructed with no `opts` — but a single
// shared instance avoids the pointless per-render allocation.
const COLLISION_FILTER_EXTENSION = new CollisionFilterExtension();

export interface RegionLabel {
  code: string;
  name: string;
  position: [number, number];
  /** Task 6, Section C.2 — manual per-region pixel nudge (regions.geojson's `properties.labelOffset`, sourced from data/manual/label-offsets.json), applied via `getPixelOffset` below. `[0, 0]` for a region with no configured nudge. */
  labelOffset: [number, number];
}

export interface RegionLabelLayerOptions {
  /** Same injection point as `makeRegionsLayer`'s `elevationOf`, so labels float just above their region's top face. */
  elevationOf: (code: string) => number;
  textOf: (code: string) => string;
  triggerKey: string | number;
  /** Must be a family `document.fonts.check()` has confirmed is ready — see DeckMap's font-gating (`fontReady`). */
  fontFamily: string;
  /** Static charset from public/data/charset.json — keeps the SDF atlas stable across selection changes. */
  characterSet: string[];
  /**
   * Task B — the currently-selected 시군 code, or null/omitted. The selected
   * region's label always wins a collision (priority 1000 — see
   * `getCollisionPriority` below), and it's included in
   * `updateTriggers.getCollisionPriority` (alongside `triggerKey`) so a
   * selection change re-evaluates priority right away, the same
   * optional-defaults-to-null pattern as `RegionsLayerOptions.selectedCode`
   * (regionLayers.ts).
   */
  selectedCode?: string | null;
  /**
   * Task B — collision priority for a NON-selected region's label (bigger
   * indicator value -> higher priority; a region with no data -> the lowest
   * priority of all) — see CollisionFilterExtension's own docs (installed
   * @deck.gl/extensions' collision-filter-extension.d.ts): "Must return a
   * number in the range -1000 -> 1000. Features with higher values are
   * shown preferentially." DeckMap.tsx computes this from `rank()`
   * (src/lib/stats.ts). Defaults to a constant 0 (every non-selected label
   * ties) when omitted, for callers that don't care about ranked priority.
   */
  priorityOf?: (code: string) => number;
  /** deck.gl `transitions` duration (ms) for getPosition. Defaults to 600. Task 6, Section A.4 — pass 0 when `prefers-reduced-motion: reduce`. */
  transitionDuration?: number;
}

/** Billboarded 시군-name labels, floating above each region's top face. */
export function makeRegionLabelLayer(labels: RegionLabel[], opts: RegionLabelLayerOptions) {
  const transitionDuration = opts.transitionDuration ?? 600;
  const selectedCode = opts.selectedCode ?? null;
  const priorityOf = opts.priorityOf ?? (() => 0);

  return new TextLayer<RegionLabel, CollisionFilterExtensionProps<RegionLabel>>({
    id: "region-labels",
    data: labels,
    getPosition: (d): [number, number, number] => [
      d.position[0],
      d.position[1],
      opts.elevationOf(d.code) + 200,
    ],
    getText: (d) => opts.textOf(d.code),
    // Task 6, Section C.2 — 라벨 겹침 완화 (전주·익산·완주·김제): a fixed
    // per-region pixel nudge, independent of zoom/rotation (deck.gl applies
    // `getPixelOffset` in screen space, after projection) — exactly what's
    // needed to pull 4 label anchors that sit close together on screen
    // apart from each other without moving their actual ground position.
    getPixelOffset: (d) => d.labelOffset,
    sizeUnits: "pixels",
    getSize: 14,
    billboard: true,
    getAlignmentBaseline: "bottom",
    fontFamily: opts.fontFamily,
    fontWeight: 600,
    characterSet: opts.characterSet,
    // Task B — 라벨 칩: `buffer: 8` (up from the SDF default) gives each
    // glyph enough padding in the atlas for the wider 0.25 outline (up from
    // 0.15) plus the background chip below to not clip a glyph's edge.
    fontSettings: { sdf: true, fontSize: 48, buffer: 8 },
    outlineWidth: 0.25,
    outlineColor: [10, 14, 25, 255],
    getColor: [236, 239, 245, 255],
    // Task B — 라벨 칩: a dark, translucent background chip behind each
    // label so it stays readable over the VWorld basemap tiles (Task C) and
    // busy top-face colors alike, not just its outline. Renders via
    // TextLayer's own `background` sub-layer (TextBackgroundLayer) —
    // `_subLayerProps.background` below still excludes it from shadow
    // casting.
    background: true,
    getBackgroundColor: [12, 14, 20, 170],
    backgroundPadding: [6, 3],
    backgroundBorderRadius: 6,
    // Task B — CollisionFilterExtension: hides an overlapping label instead
    // of letting two region names stack illegibly. `sizeScale: 1.3` tests
    // collision against a slightly larger-than-drawn hitbox (a bit of
    // breathing room between adjacent labels, not just literal pixel
    // overlap). `getCollisionPriority` — installed
    // @deck.gl/extensions' collision-filter-extension.d.ts: "Features with
    // higher values are shown preferentially" (range -1000 -> 1000) — the
    // SELECTED region's label always wins outright (1000, the extension's
    // own documented max); every other label falls back to `priorityOf`
    // (DeckMap.tsx: reversed value rank, null -> lowest).
    extensions: [COLLISION_FILTER_EXTENSION],
    collisionEnabled: true,
    collisionGroup: "labels",
    collisionTestProps: { sizeScale: 1.3 },
    getCollisionPriority: (d: RegionLabel) => (d.code === selectedCode ? 1000 : priorityOf(d.code)),
    // 추가 요구 #2: labels must always draw on top of a taller neighboring
    // region's already-rendered top face, never get depth-tested away behind
    // it. `depthCompare: 'always'` makes every fragment pass the depth test
    // unconditionally (`depthWriteEnabled: false` alone only stops the label
    // from *writing* depth — it would still be *tested* against and hidden).
    // CompositeLayer.getSubLayerProps forwards `parameters` verbatim to
    // every sub-layer TextLayer renders, so setting it here once is enough.
    // Task B — this `depthCompare: 'always'` does NOT leak into the
    // collision pass and invalidate `getCollisionPriority` above: confirmed
    // against the installed @deck.gl/extensions'
    // collision-filter-pass.js — its `getLayerParameters` unconditionally
    // returns `{...layer.props.parameters, depthWriteEnabled: true,
    // depthCompare: 'less-equal'}`, i.e. it OVERWRITES depthCompare with
    // 'less-equal' for every layer it renders into the collision FBO,
    // regardless of what the layer's own `parameters` says (same pattern as
    // shadow-pass.js). No `collisionTestProps.parameters` override needed —
    // see task-B-report.md.
    parameters: { depthCompare: "always", depthWriteEnabled: false },
    // Task A — 그림자 캐스팅 제외: `shadowEnabled` on the OUTER TextLayer never
    // reaches its leaf sub-layers (MultiIconLayer for `characters`,
    // TextBackgroundLayer for `background`) — deck.gl's shadow pass reads
    // `layer.props.shadowEnabled` off whichever leaf actually draws, and a
    // CompositeLayer only forwards a fixed prop allowlist (parameters,
    // opacity, ...) to `getSubLayerProps`, not arbitrary props. `_subLayerProps`
    // is the documented per-sublayer override hook for exactly this.
    _subLayerProps: {
      characters: { shadowEnabled: false },
      background: { shadowEnabled: false },
    },
    updateTriggers: {
      getPosition: [opts.triggerKey],
      getText: [opts.triggerKey],
      getCollisionPriority: [opts.triggerKey, selectedCode],
    },
    transitions: {
      getPosition: transitionDuration,
    },
  });
}
