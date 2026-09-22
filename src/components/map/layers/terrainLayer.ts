import { TerrainLayer } from "@deck.gl/geo-layers";
import { _TerrainExtension as TerrainExtension } from "@deck.gl/extensions";
import { SolidPolygonLayer } from "@deck.gl/layers";

import { BASEMAP_COVERAGE, vworldTileUrl } from "./basemapLayer";

// Mapzen Terrarium: elevation = R * 256 + G + B / 256 - 32768 (metres).
const TERRARIUM_DECODER = { rScaler: 256, gScaler: 1, bScaler: 1 / 256, offset: -32768 };
export const terrainExtension = new TerrainExtension();
const WASH_POLYGON: [number, number][] = [
  [BASEMAP_COVERAGE.west, BASEMAP_COVERAGE.south],
  [BASEMAP_COVERAGE.east, BASEMAP_COVERAGE.south],
  [BASEMAP_COVERAGE.east, BASEMAP_COVERAGE.north],
  [BASEMAP_COVERAGE.west, BASEMAP_COVERAGE.north],
];
const WASH_DATA = [{ polygon: WASH_POLYGON }];

/** Real terrain relief with the same VWorld satellite image used by the flat map. */
export function makeTerrainLayer(vworldKey: string) {
  return new TerrainLayer({
    id: "terrain",
    elevationData: "/api/terrain/{z}/{x}/{y}.png",
    elevationDecoder: TERRARIUM_DECODER,
    texture: vworldTileUrl(vworldKey, "Satellite", "jpeg"),
    operation: "terrain+draw",
    strategy: "no-overlap",
    tileSize: 256,
    minZoom: 6,
    maxZoom: 14,
    zoomOffset: 0,
    maxRequests: 6,
    maxCacheSize: 32,
    meshMaxError: 4,
    material: { ambient: 0.8, diffuse: 0.55, shininess: 16 },
    pickable: false,
    onTileError: () => {},
  });
}

/** Lightens the satellite texture while following the real terrain surface. */
export function makeTerrainWashLayer() {
  return new SolidPolygonLayer({
    id: "terrain-wash",
    data: WASH_DATA,
    getPolygon: (datum) => datum.polygon,
    getFillColor: [255, 255, 255, 48],
    pickable: false,
    extensions: [terrainExtension],
  });
}
