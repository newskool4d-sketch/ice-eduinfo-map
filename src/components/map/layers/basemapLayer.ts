import { TileLayer } from "@deck.gl/geo-layers";
import { BitmapLayer, SolidPolygonLayer } from "@deck.gl/layers";
import type { BitmapLayerProps } from "@deck.gl/layers";

import type { BasemapMode } from "@/components/map/basemapPref";
import { CONTROLLER } from "@/components/map/camera";

/** The two modes that actually draw tiles — `off` never reaches these factories (DeckMap keeps the layer slots `null`). */
export type BasemapTiles = Exclude<BasemapMode, "off">;

/**
 * VWorld WMTS tile URL template. Row/col order is `{z}/{y}/{x}` (row=y,
 * col=x — confirmed against the live API, not the more common `{z}/{x}/{y}`
 * some other tile services use). The rule is the same for every layer name;
 * only the file extension differs — `Satellite` is jpeg, `Base`/`Hybrid`/
 * `midnight` are png (spec "검증된 사실"). `layer` still defaults to
 * "midnight" (the 2차 개선 dark style) so the URL rule itself is pinned by
 * the original test; the app's own callers go through `TILE_SOURCE` below.
 */
export function vworldTileUrl(key: string, layer: string = "midnight", ext: string = "png"): string {
  return `https://api.vworld.kr/req/wmts/1.0.0/${key}/${layer}/{z}/{y}/{x}.${ext}`;
}

/**
 * Per-mode tile source (spec §2). `Base` is VWorld's yellow-highway routing
 * map — busy under the pastel blocks — so it's desaturated to half; the
 * satellite photo keeps its color (the bright look comes from the wash
 * layer on top, see `makeBasemapWashLayer`).
 */
const TILE_SOURCE: Record<BasemapTiles, { layer: string; ext: string; desaturate: number }> = {
  satellite: { layer: "Satellite", ext: "jpeg", desaturate: 0 },
  base: { layer: "Base", ext: "png", desaturate: 0.5 },
};

/**
 * `[west, south, east, north]` — MUST match `CONTROLLER.maxBounds`
 * (camera.ts) flattened, so the basemap never fetches tiles for anywhere
 * outside where the user can ever pan/zoom. Derived from CONTROLLER here
 * (not re-typed as a literal) so the two can never silently drift apart —
 * `tests/unit/basemapLayer.test.ts` pins both the derived value AND the
 * literal `[125.6, 34.7, 128.7, 36.7]` it currently resolves to.
 */
const [[WEST, SOUTH], [EAST, NORTH]] = CONTROLLER.maxBounds;
const BASEMAP_EXTENT: [number, number, number, number] = [WEST, SOUTH, EAST, NORTH];

/**
 * Lowest tile zoom the TileLayer will ever request (far tiles in the
 * pitched view get lower z than the viewport's own zoom, floored here).
 */
const TILE_MIN_ZOOM = 6;

/**
 * VWorld WMTS basemap (Satellite or Base, per `tiles`), called directly from
 * the browser — no proxy Route Handler needed (`access-control-allow-origin:
 * *` confirmed by curl against the live endpoint; see task-C-brief.md's
 * "검증된 사실"). There is no availability probe: a missing/bad key doesn't
 * 404, it returns 200 + an XML ExceptionReport body (VWorld's own error
 * format), which fails image decode and lands in `onTileError` below —
 * silently, by design (an operator eyeballing the map is how a bad key gets
 * noticed; see README's VWorld setup section). The caller (DeckMap) is what
 * decides WHETHER to call this factory at all (gated on
 * `NEXT_PUBLIC_VWORLD_KEY` being set and the mode not being `off`); this
 * function itself does no key validation.
 */
export function makeBasemapLayer(key: string, tiles: BasemapTiles) {
  const source = TILE_SOURCE[tiles];
  return new TileLayer<ImageBitmap, { shadowEnabled: boolean }>({
    id: "basemap",
    data: vworldTileUrl(key, source.layer, source.ext),
    tileSize: 256,
    minZoom: TILE_MIN_ZOOM,
    maxZoom: 18,
    extent: BASEMAP_EXTENT,
    maxRequests: 6,
    // REQUIRED: TileLayer's own default onTileError is console.error — 8 of
    // this suite's e2e specs assert zero console errors (see
    // e2e/fixtures.ts, which stubs the VWorld route for exactly this
    // reason), and this is the second line of defense for any tile request
    // that fails anyway (network hiccup, bad key XML response, ...).
    onTileError: () => {},
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
        bounds: [boundingBox[0][0], boundingBox[0][1], boundingBox[1][0], boundingBox[1][1]],
        desaturate: source.desaturate,
      });
    },
  });
}

/**
 * Wash alpha per tile source (spec §2: satellite 110, base 60; screenshot
 * tuning may move either by ±30). The satellite photo needs the heavier
 * wash to read as a bright printed map; the already-light `Base` map only
 * needs a touch so its remaining color doesn't compete with the blocks.
 */
const WASH_ALPHA: Record<BasemapTiles, number> = { satellite: 110, base: 60 };

/** One datum: a single closed ring (deck.gl `Position[]`, i.e. `[lng, lat]` tuples). */
type WashDatum = { polygon: [number, number][] };

/**
 * The wash geometry: ONE fixed rectangle, deliberately much larger than
 * `BASEMAP_EXTENT` and NOT derived from it (Task 3 review ruling).
 *
 * Why not the extent itself: TileLayer's `extent` only decides WHICH tiles
 * load — a tile that straddles the extent edge is still drawn whole, so at
 * low zoom a band of tiles spills past the rectangle. A wash cut at the
 * extent left that band unwashed (dark satellite framing a visibly lighter
 * rectangle — Task 3 screenshot round 1), and padding the extent by a tile
 * width still leaves an edge that some zoom/pitch can bring on screen, plus
 * a brightness step where washed paper meets bare paper (≈10 levels).
 *
 * Why this size: it is bigger than any area the camera can show. At the
 * nominal zoom floor (VIEW_LIMITS.minZoom 7.5, pitch 56) a 1600px viewport
 * spans ≈12.3° of longitude corner to corner, and `CONTROLLER.maxBounds`
 * (125.6–128.7 / 34.7–36.7) keeps the camera center within ≈2° of this
 * ring's middle (127.5°E, 35.5°N) — so the ring always covers the whole
 * screen and none of its edges can ever be seen. In practice the margin is
 * larger still: deck.gl's MapController keeps the whole (pitch-0) viewport
 * inside `maxBounds`, which raises the effective zoom floor (≈8.5 at 1600px
 * wide); measured with WebMercatorViewport at pitch 56, settled camera
 * states see at most lng 124.1–130.2 / lat 34.5–39.2 for every viewport
 * ≥768px, and a drag's `rubberBand` overshoot at most 122.5–131.8 /
 * 33.5–40.1 (wheel/widget zoom is hard-clamped, no overshoot). Where the
 * ring lies past the tiles it just tints the paper background (#f5f2eb →
 * ≈#f9f8f4 at alpha 110) — uniform across the viewport, so invisible.
 */
const WASH_RING: [number, number][] = [
  [120, 30],
  [135, 30],
  [135, 41],
  [120, 41],
  [120, 30],
];

/** One datum holding the ring — module constant so the layer's `data` reference is stable across renders. */
const WASH_DATA: WashDatum[] = [{ polygon: WASH_RING }];

/**
 * The translucent white wash drawn right on top of the tiles — what turns
 * the satellite photo into something like a bright printed map (spec §2).
 * It's a polygon, not a `tintColor` on the BitmapLayer, because `tintColor`
 * is multiplicative and can only darken (spec "검증된 사실"). Flat (not
 * extruded → no lighting applied, so the color is exactly the literal
 * below), never picked, never in the shadow map, and — like the tiles — it
 * doesn't write depth, so the flat neighbors/footprint drawn after it at
 * z=0 overpaint it cleanly instead of z-fighting.
 */
export function makeBasemapWashLayer(tiles: BasemapTiles) {
  return new SolidPolygonLayer<WashDatum, { shadowEnabled: boolean }>({
    id: "basemap-wash",
    data: WASH_DATA,
    getPolygon: (d) => d.polygon,
    getFillColor: [255, 255, 255, WASH_ALPHA[tiles]],
    filled: true,
    extruded: false,
    pickable: false,
    shadowEnabled: false,
    parameters: { depthWriteEnabled: false },
  });
}
