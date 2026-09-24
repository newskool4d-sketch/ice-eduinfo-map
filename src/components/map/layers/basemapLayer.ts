import { TileLayer } from "@deck.gl/geo-layers";
import { BitmapLayer, SolidPolygonLayer } from "@deck.gl/layers";
import type { BitmapLayerProps } from "@deck.gl/layers";

import type { BasemapTiles } from "@/components/map/basemapPref";

/** Only resolved styles reach these factories; auto and off are handled by DeckMap. */
export type { BasemapTiles } from "@/components/map/basemapPref";

/**
 * VWorld WMTS tile URL template. Row/col order is `{z}/{y}/{x}` (row=y,
 * col=x — confirmed against the live API, not the more common `{z}/{x}/{y}`
 * some other tile services use). The rule is the same for every layer name;
 * only the file extension differs — `Satellite` is jpeg, `Base`/`Hybrid`/
 * `midnight` are png (spec "검증된 사실"). `layer` still defaults to
 * "midnight" (the 2차 개선 dark style) so the URL rule itself is pinned by
 * the original test; the app's own callers go through `TILE_SOURCE` below.
 */
export function vworldTileUrl(
  key: string,
  layer: string = "midnight",
  ext: string = "png",
): string {
  return `https://api.vworld.kr/req/wmts/1.0.0/${key}/${layer}/{z}/{y}/{x}.${ext}`;
}

/**
 * Per-mode tile source. Road imagery retains its original colors and resolution.
 */
const TILE_SOURCE: Record<
  BasemapTiles,
  { layer: string; ext: string; maxZoom: number }
> = {
  satellite: { layer: "Satellite", ext: "jpeg", maxZoom: 19 },
  base: { layer: "Base", ext: "png", maxZoom: 19 },
  white: { layer: "white", ext: "png", maxZoom: 18 },
  midnight: { layer: "midnight", ext: "png", maxZoom: 18 },
};

interface BasemapOptions {
  onLoad?: () => void;
  onError?: () => void;
  retry?: number;
}

/**
 * One coverage rectangle for BOTH the tile extent and the wash polygon
 * (final review ruling, 2026-09-21). It is deliberately much larger than
 * `CONTROLLER.maxBounds` (camera.ts): TileLayer's `extent` only decides which
 * tiles may load — a tile straddling the edge is drawn whole — and tiles
 * outside the old maxBounds-sized extent left a hard "map sheet" edge on the
 * paper floor at the overview. TileLayer still only requests tiles inside the
 * viewport ∩ extent, so widening the extent does not add requests beyond what
 * is visible. MapController keeps the camera inside maxBounds (measured worst
 * settled view at pitch 56: lng 124.1–130.2 / lat 34.5–39.2), so this
 * rectangle always covers the whole screen.
 */
export const BASEMAP_COVERAGE = {
  west: 120,
  south: 30,
  east: 135,
  north: 41,
} as const;
const BASEMAP_EXTENT: [number, number, number, number] = [
  BASEMAP_COVERAGE.west,
  BASEMAP_COVERAGE.south,
  BASEMAP_COVERAGE.east,
  BASEMAP_COVERAGE.north,
];

/**
 * Lowest tile zoom the TileLayer will ever request (far tiles in the
 * pitched view get lower z than the viewport's own zoom, floored here).
 */
const TILE_MIN_ZOOM = 6;

/**
 * WMTS tiles load directly in the browser. VWorld can return HTTP 200 with
 * an XML error body, so image decoding failures also reach onTileError.
 * Report status to the UI without logging URLs containing the API key.
 */
export function makeBasemapLayer(key: string, tiles: BasemapTiles, options: BasemapOptions = {}) {
  return makeTileLayer(key, "basemap", TILE_SOURCE[tiles], options);
}

/** VWorld's transparent Hybrid tiles add roads and place names to imagery. */
export function makeBasemapLabelsLayer(key: string, options: BasemapOptions = {}) {
  return makeTileLayer(key, "basemap-labels", { layer: "Hybrid", ext: "png", maxZoom: 19 }, options);
}

function makeTileLayer(key: string, id: string, source: { layer: string; ext: string; maxZoom: number }, options: BasemapOptions) {
  return new TileLayer<ImageBitmap, { shadowEnabled: boolean }>({
    id,
    data: vworldTileUrl(key, source.layer, source.ext),
    tileSize: 256,
    minZoom: TILE_MIN_ZOOM,
    maxZoom: source.maxZoom,
    extent: BASEMAP_EXTENT,
    maxRequests: 6,
    // Native-resolution tiles keep road labels sharp; the cache stays bounded.
    zoomOffset: 0,
    maxCacheSize: 64,
    onTileLoad: () => options.onLoad?.(),
    onTileError: () => options.onError?.(),
    updateTriggers: { getTileData: options.retry ?? 0 },
    shadowEnabled: false,
    pickable: false,
    parameters: { depthWriteEnabled: false },
    renderSubLayers: (props) => {
      const { boundingBox } = props.tile;
      // Cast needed: TileLayer's own `renderSubLayers` callback type merges
      // `_TileLayerProps<DataT>.data: URLTemplate` (the OUTER tile-url-
      // template prop) with this callback's own `data: DataT` (the loaded
      // tile's resolved data) via intersection, which TypeScript reduces to
      // `URLTemplate & DataT` for `props.data` — while `BitmapLayerProps`
      // declares `data: never` (it draws from `image`, not `data`). Both
      // sides are real, individually-correct deck.gl declarations that just
      // don't compose; this is deck.gl's own canonical
      // `renderSubLayers: props => new BitmapLayer(props, {...})` idiom
      // (confirmed against @deck.gl/geo-layers' own TileLayer usage
      // patterns), spreading the outer tile props (visible/opacity/
      // shadowEnabled/...) into the leaf BitmapLayer — not a workaround for
      // a mistake in this file. `data: undefined` (not a literal `null`)
      // for the same underlying reason — `null` isn't assignable to
      // `BitmapLayerProps`'s own `data: never`, but `undefined` is
      // (`Partial<T>` makes every field `T[K] | undefined`) — and this MUST
      // be an explicit override (not simply omitted), since `props` (arg 1)
      // already carries the tile's own `data` (the same value handed to
      // `image` below); without overriding it here, that value would leak
      // into the leaf BitmapLayer's `data` prop instead of deck.gl's own
      // empty-array default. deck.gl's base Layer class treats an explicit
      // `null` or `undefined` identically (its `data` prop-type substitutes
      // `EMPTY_ARRAY` for either — confirmed empirically in
      // tests/unit/basemapLayer.test.ts, which passes a non-empty `data` in
      // arg 1 specifically to catch this leak).
      return new BitmapLayer(props as unknown as BitmapLayerProps, {
        data: undefined,
        image: props.data,
        bounds: [
          boundingBox[0][0],
          boundingBox[0][1],
          boundingBox[1][0],
          boundingBox[1][1],
        ],
        desaturate: 0,
      });
    },
  });
}

/** Keep roads readable; only imagery needs a small contrast adjustment. */
const WASH_ALPHA: Record<BasemapTiles, number> = { satellite: 24, base: 8, white: 0, midnight: 0 };

/** One datum: a single closed ring (deck.gl `Position[]`, i.e. `[lng, lat]` tuples). */
type WashDatum = { polygon: [number, number][] };

/**
 * The wash covers the same fixed rectangle as the tile extent
 * (`BASEMAP_COVERAGE`), so there is never a visible wash edge or brightness
 * band inside the viewport. Coverage rests on MapController keeping the
 * pitch-0 viewport inside `CONTROLLER.maxBounds` (effective zoom floor ≈8.5 at
 * 1600px) with pitch fixed at 56/58 by camera.ts; VIEW_LIMITS.maxPitch (72)
 * would break it only if tilt input were ever re-enabled.
 */
const WASH_RING: [number, number][] = [
  [BASEMAP_COVERAGE.west, BASEMAP_COVERAGE.south],
  [BASEMAP_COVERAGE.east, BASEMAP_COVERAGE.south],
  [BASEMAP_COVERAGE.east, BASEMAP_COVERAGE.north],
  [BASEMAP_COVERAGE.west, BASEMAP_COVERAGE.north],
  [BASEMAP_COVERAGE.west, BASEMAP_COVERAGE.south],
];

/** One datum holding the ring — module constant so the layer's `data` reference is stable across renders. */
const WASH_DATA: WashDatum[] = [{ polygon: WASH_RING }];

/**
 * A small theme-aware wash above imagery, below Hybrid road/place labels.
 * It's a polygon, not a `tintColor` on the BitmapLayer, because `tintColor`
 * is multiplicative and can only darken (spec "검증된 사실"). Flat (not
 * extruded → no lighting applied, so the color is exactly the literal
 * below), never picked, never in the shadow map, and — like the tiles — it
 * doesn't write depth, so the flat neighbors/footprint drawn after it at
 * z=0 overpaint it cleanly instead of z-fighting.
 */
export function makeBasemapWashLayer(tiles: BasemapTiles, dark = false) {
  return new SolidPolygonLayer<WashDatum, { shadowEnabled: boolean }>({
    id: "basemap-wash",
    data: WASH_DATA,
    getPolygon: (d) => d.polygon,
    getFillColor: tiles === "satellite" && dark
      ? [12, 29, 44, 40]
      : [255, 255, 255, WASH_ALPHA[tiles]],
    filled: true,
    extruded: false,
    pickable: false,
    shadowEnabled: false,
    parameters: { depthWriteEnabled: false },
  });
}
