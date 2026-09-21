import { describe, expect, it, vi } from "vitest";
import type { BitmapLayer } from "@deck.gl/layers";

import { CONTROLLER } from "@/components/map/camera";
import { makeBasemapLayer, vworldTileUrl } from "@/components/map/layers/basemapLayer";

describe("vworldTileUrl", () => {
  it("builds the VWorld WMTS midnight URL template, row=y col=x", () => {
    expect(vworldTileUrl("mykey")).toBe(
      "https://api.vworld.kr/req/wmts/1.0.0/mykey/midnight/{z}/{y}/{x}.png",
    );
  });

  it("accepts a different layer name (defaults to 'midnight')", () => {
    expect(vworldTileUrl("mykey", "white")).toBe(
      "https://api.vworld.kr/req/wmts/1.0.0/mykey/white/{z}/{y}/{x}.png",
    );
  });

  it("is a pure function of its inputs — same key always yields the same URL", () => {
    expect(vworldTileUrl("abc")).toBe(vworldTileUrl("abc"));
  });
});

describe("makeBasemapLayer", () => {
  it("has id 'basemap' and data = vworldTileUrl(key)", () => {
    const layer = makeBasemapLayer("mykey");
    expect(layer.props.id).toBe("basemap");
    expect(layer.props.data).toBe(vworldTileUrl("mykey"));
  });

  it("tileSize 256, minZoom 6, maxZoom 18, maxRequests 6", () => {
    const layer = makeBasemapLayer("mykey");
    expect(layer.props.tileSize).toBe(256);
    expect(layer.props.minZoom).toBe(6);
    expect(layer.props.maxZoom).toBe(18);
    expect(layer.props.maxRequests).toBe(6);
  });

  // Task C brief: extent MUST equal CONTROLLER.maxBounds flattened — fixed by
  // this test both against the literal (catches an accidental typo in this
  // file) AND against CONTROLLER itself (catches the two ever drifting
  // apart if camera.ts's maxBounds is ever tuned later).
  it("extent equals CONTROLLER.maxBounds flattened to [west, south, east, north]", () => {
    const layer = makeBasemapLayer("mykey");
    expect(layer.props.extent).toEqual([125.6, 34.7, 128.7, 36.7]);
    expect(layer.props.extent).toEqual([
      CONTROLLER.maxBounds[0][0],
      CONTROLLER.maxBounds[0][1],
      CONTROLLER.maxBounds[1][0],
      CONTROLLER.maxBounds[1][1],
    ]);
  });

  // REQUIRED: TileLayer's own default onTileError is console.error — 8 of
  // this suite's e2e specs assert zero console errors, and VWorld returns
  // 200 + an XML ExceptionReport (not a 404) for a bad key, which fails PNG
  // decode and lands here. A no-op keeps that failure silent (operator
  // eyeballs the map instead — see README).
  it("onTileError is a no-op (not the TileLayer default console.error)", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const layer = makeBasemapLayer("mykey");
    expect(() => layer.props.onTileError(new Error("boom"))).not.toThrow();
    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("shadowEnabled false, pickable false, parameters.depthWriteEnabled false", () => {
    const layer = makeBasemapLayer("mykey");
    expect(layer.props.shadowEnabled).toBe(false);
    expect(layer.props.pickable).toBe(false);
    expect(layer.props.parameters).toEqual({ depthWriteEnabled: false });
  });

  describe("renderSubLayers", () => {
    it("returns a BitmapLayer built from the tile's boundingBox and image data", () => {
      const layer = makeBasemapLayer("mykey");
      const fakeImage = { width: 256, height: 256 };
      const subProps = {
        id: "basemap-tile-1-2-3",
        data: fakeImage,
        tile: {
          boundingBox: [
            [125.9, 35.7],
            [126.1, 35.9],
          ],
        },
      };
      // @ts-expect-error — minimal renderSubLayers props stub for this unit test.
      const sub = layer.props.renderSubLayers(subProps) as BitmapLayer;
      expect(sub).not.toBeNull();
      // We pass `data: null` (per the brief — BitmapLayer draws from `image`,
      // not `data`), but deck.gl's own Layer base class special-cases the
      // `data` prop (layer.js: `data: {type: 'data', value: EMPTY_ARRAY, ...}`)
      // and normalizes a null/undefined value to `[]` — confirmed against the
      // installed source, not a bug in this factory.
      expect(sub!.props.data).toEqual([]);
      expect(sub!.props.image).toBe(fakeImage);
      expect(sub!.props.bounds).toEqual([125.9, 35.7, 126.1, 35.9]);
    });
  });
});
