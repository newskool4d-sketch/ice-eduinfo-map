import { TileLayer } from "@deck.gl/geo-layers";
import { BitmapLayer } from "@deck.gl/layers";
import type { BitmapLayerProps } from "@deck.gl/layers";

import { CONTROLLER } from "@/components/map/camera";

/**
 * VWorld WMTS tile URL template. Row/col order is `{z}/{y}/{x}` (row=y,
 * col=x — confirmed against the live API, not the more common `{z}/{x}/{y}`
 * some other tile services use). `layer` defaults to "midnight", the dark
 * basemap style used throughout this app; `white` is VWorld's other no-key-
 * registration-required style, kept as an optional override for callers
 * that might want it later (e.g. a light-mode variant).
 */
export function vworldTileUrl(key: string, layer: string = "midnight"): string {
  return `https://api.vworld.kr/req/wmts/1.0.0/${key}/${layer}/{z}/{y}/{x}.png`;
}

/**
 * `[west, south, east, north]` — MUST match `CONTROLLER.maxBounds`
 * (camera.ts) flattened, so the basemap never fetches tiles for anywhere
 * outside where the user can ever pan/zoom. Derived from CONTROLLER here
 * (not re-typed as a literal) so the two can never silently drift apart —
 * `tests/unit/basemapLayer.test.ts` pins both the derived value AND the
 * literal `[125.6, 34.7, 128.7, 36.7]` it currently resolves to.
 */
const BASEMAP_EXTENT: [number, number, number, number] = [
  CONTROLLER.maxBounds[0][0],
  CONTROLLER.maxBounds[0][1],
  CONTROLLER.maxBounds[1][0],
  CONTROLLER.maxBounds[1][1],
];

/**
 * VWorld midnight WMTS basemap, called directly from the browser — no proxy
 * Route Handler needed (`access-control-allow-origin: *` confirmed by curl
 * against the live endpoint; see task-C-brief.md's "검증된 사실"). There is no
 * availability probe: a missing/bad key doesn't 404, it returns 200 + an XML
 * ExceptionReport body (VWorld's own error format), which fails PNG decode
 * and lands in `onTileError` below — silently, by design (an operator
 * eyeballing the map is how a bad key gets noticed; see README's VWorld
 * setup section). The caller (DeckMap) is what decides WHETHER to call this
 * factory at all (gated on `NEXT_PUBLIC_VWORLD_KEY` being set); this
 * function itself does no key validation.
 */
export function makeBasemapLayer(key: string) {
  return new TileLayer<ImageBitmap, { shadowEnabled: boolean }>({
    id: "basemap",
    data: vworldTileUrl(key),
    tileSize: 256,
    minZoom: 6,
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
      // a mistake in this file. `data: undefined` (not the brief's literal
      // `data: null`) for the same underlying reason — `null` isn't
      // assignable to `BitmapLayerProps`'s own `data: never`, but `undefined`
      // is (`Partial<T>` makes every field `T[K] | undefined`) — and this
      // MUST be an explicit override (not simply omitted), since `props`
      // (arg 1) already carries the tile's own `data` (the same value handed
      // to `image` below); without overriding it here, that value would leak
      // into the leaf BitmapLayer's `data` prop instead of deck.gl's own
      // empty-array default. deck.gl's base Layer class treats an explicit
      // `null` or `undefined` identically (its `data` prop-type substitutes
      // `EMPTY_ARRAY` for either — confirmed empirically in
      // tests/unit/basemapLayer.test.ts, which passes a non-empty `data` in
      // arg 1 specifically to catch this leak), so this is behaviorally
      // identical to the brief's `data: null`, not a functional change.
      return new BitmapLayer(props as unknown as BitmapLayerProps, {
        data: undefined,
        image: props.data,
        bounds: [boundingBox[0][0], boundingBox[0][1], boundingBox[1][0], boundingBox[1][1]],
      });
    },
  });
}
