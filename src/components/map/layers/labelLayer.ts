import { TextLayer } from "@deck.gl/layers";

export interface RegionLabel {
  code: string;
  name: string;
  position: [number, number];
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
}

/** Billboarded 시군-name labels, floating above each region's top face. */
export function makeRegionLabelLayer(labels: RegionLabel[], opts: RegionLabelLayerOptions) {
  return new TextLayer<RegionLabel>({
    id: "region-labels",
    data: labels,
    getPosition: (d): [number, number, number] => [
      d.position[0],
      d.position[1],
      opts.elevationOf(d.code) + 200,
    ],
    getText: (d) => opts.textOf(d.code),
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
    updateTriggers: {
      getPosition: [opts.triggerKey],
      getText: [opts.triggerKey],
    },
    transitions: {
      getPosition: 600,
    },
  });
}
