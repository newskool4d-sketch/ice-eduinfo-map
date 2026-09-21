import { TextLayer } from "@deck.gl/layers";

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
  /** deck.gl `transitions` duration (ms) for getPosition. Defaults to 600. Task 6, Section A.4 — pass 0 when `prefers-reduced-motion: reduce`. */
  transitionDuration?: number;
}

/** Billboarded 시군-name labels, floating above each region's top face. */
export function makeRegionLabelLayer(labels: RegionLabel[], opts: RegionLabelLayerOptions) {
  const transitionDuration = opts.transitionDuration ?? 600;

  return new TextLayer<RegionLabel>({
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
    fontSettings: { sdf: true, fontSize: 48 },
    outlineWidth: 0.15,
    outlineColor: [10, 14, 25, 255],
    getColor: [236, 239, 245, 255],
    // 추가 요구 #2: labels must always draw on top of a taller neighboring
    // region's already-rendered top face, never get depth-tested away behind
    // it. `depthCompare: 'always'` makes every fragment pass the depth test
    // unconditionally (`depthWriteEnabled: false` alone only stops the label
    // from *writing* depth — it would still be *tested* against and hidden).
    // CompositeLayer.getSubLayerProps forwards `parameters` verbatim to
    // every sub-layer TextLayer renders, so setting it here once is enough.
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
    },
    transitions: {
      getPosition: transitionDuration,
    },
  });
}
