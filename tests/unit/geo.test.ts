import { describe, expect, it } from "vitest";
import type { Feature, MultiPolygon } from "geojson";

import {
  isRegionCode,
  PROVINCE_CODE,
  REGION_CODES,
  regionName,
  REGIONS,
} from "@/lib/geo/regions";
import { bboxOf, ringsOf, unionBbox, type RegionFeature } from "@/lib/geo/geo";

describe("REGIONS", () => {
  it("has exactly 14 entries", () => {
    expect(REGIONS).toHaveLength(14);
  });

  it("has unique codes", () => {
    const codes = REGIONS.map((r) => r.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("REGION_CODES mirrors REGIONS codes in order", () => {
    expect(REGION_CODES).toEqual(REGIONS.map((r) => r.code));
  });

  it("PROVINCE_CODE is 52000", () => {
    expect(PROVINCE_CODE).toBe("52000");
  });

  it("isRegionCode narrows known codes and rejects unknown ones", () => {
    expect(isRegionCode("52110")).toBe(true);
    expect(isRegionCode("52800")).toBe(true);
    expect(isRegionCode("99999")).toBe(false);
    expect(isRegionCode("52000")).toBe(false); // province code is not a region code
  });

  it("regionName returns the Korean name for a known code", () => {
    expect(regionName("52110")).toBe("전주시");
    expect(regionName("52130")).toBe("군산시");
    expect(regionName("52800")).toBe("부안군");
  });
});

function rectFeature(
  code: string,
  [minLng, minLat, maxLng, maxLat]: [number, number, number, number],
): RegionFeature {
  return {
    type: "Feature",
    properties: {
      code,
      name: code,
      bbox: [minLng, minLat, maxLng, maxLat],
      labelPoint: [(minLng + maxLng) / 2, (minLat + maxLat) / 2],
    },
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [minLng, minLat],
          [maxLng, minLat],
          [maxLng, maxLat],
          [minLng, maxLat],
          [minLng, minLat],
        ],
      ],
    },
  };
}

describe("ringsOf", () => {
  it("returns the single ring of a Polygon feature", () => {
    const feature = rectFeature("A", [0, 0, 1, 1]);
    const rings = ringsOf(feature);
    expect(rings).toHaveLength(1);
    expect(rings[0]).toEqual([
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
      [0, 0],
    ]);
  });

  it("returns one ring per part of a MultiPolygon feature", () => {
    const feature: Feature<MultiPolygon, RegionFeature["properties"]> = {
      type: "Feature",
      properties: {
        code: "B",
        name: "B",
        bbox: [0, 0, 3, 1],
        labelPoint: [0.5, 0.5],
      },
      geometry: {
        type: "MultiPolygon",
        coordinates: [
          [
            [
              [0, 0],
              [1, 0],
              [1, 1],
              [0, 1],
              [0, 0],
            ],
          ],
          [
            [
              [2, 0],
              [3, 0],
              [3, 1],
              [2, 1],
              [2, 0],
            ],
          ],
        ],
      },
    };
    const rings = ringsOf(feature);
    expect(rings).toHaveLength(2);
    expect(rings[0][0]).toEqual([0, 0]);
    expect(rings[1][0]).toEqual([2, 0]);
  });
});

describe("bboxOf", () => {
  it("computes the bounding box from geometry, ignoring properties.bbox", () => {
    const feature = rectFeature("A", [1, 2, 3, 4]);
    // Deliberately wrong properties.bbox: bboxOf must derive from geometry.
    (feature.properties as unknown as { bbox: unknown }).bbox = [0, 0, 0, 0];
    expect(bboxOf(feature)).toEqual([1, 2, 3, 4]);
  });
});

describe("unionBbox", () => {
  it("unions the bbox of multiple region features", () => {
    const a = rectFeature("A", [0, 0, 1, 1]);
    const b = rectFeature("B", [2, 2, 3, 3]);
    expect(unionBbox([a, b])).toEqual([0, 0, 3, 3]);
  });

  it("throws on an empty feature list", () => {
    expect(() => unionBbox([])).toThrow();
  });
});
