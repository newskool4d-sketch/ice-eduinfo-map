import { describe, expect, it } from "vitest";
import type { MultiPolygon, Polygon } from "geojson";

import { pointInPolygon } from "../../scripts/pipeline/lib/point-in-polygon";

const SQUARE: Polygon = {
  type: "Polygon",
  coordinates: [
    [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
      [0, 0],
    ],
  ],
};

describe("pointInPolygon — simple rectangle", () => {
  it("returns true for a point well inside the square", () => {
    expect(pointInPolygon([5, 5], SQUARE)).toBe(true);
  });

  it("returns false for a point well outside the square", () => {
    expect(pointInPolygon([20, 20], SQUARE)).toBe(false);
    expect(pointInPolygon([-5, 5], SQUARE)).toBe(false);
  });

  it("returns false for a point just outside an edge", () => {
    expect(pointInPolygon([10.5, 5], SQUARE)).toBe(false);
  });
});

const SQUARE_WITH_HOLE: Polygon = {
  type: "Polygon",
  coordinates: [
    // exterior: 0..10 square
    [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
      [0, 0],
    ],
    // hole: 4..6 square in the middle
    [
      [4, 4],
      [6, 4],
      [6, 6],
      [4, 6],
      [4, 4],
    ],
  ],
};

describe("pointInPolygon — polygon with a hole", () => {
  it("returns true for a point in the solid area (outside the hole)", () => {
    expect(pointInPolygon([1, 1], SQUARE_WITH_HOLE)).toBe(true);
    expect(pointInPolygon([9, 9], SQUARE_WITH_HOLE)).toBe(true);
  });

  it("returns false for a point inside the hole", () => {
    expect(pointInPolygon([5, 5], SQUARE_WITH_HOLE)).toBe(false);
  });

  it("returns false for a point outside the exterior entirely", () => {
    expect(pointInPolygon([50, 50], SQUARE_WITH_HOLE)).toBe(false);
  });
});

const TWO_DISJOINT_SQUARES: MultiPolygon = {
  type: "MultiPolygon",
  coordinates: [
    [
      [
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 10],
        [0, 0],
      ],
    ],
    [
      [
        [100, 100],
        [110, 100],
        [110, 110],
        [100, 110],
        [100, 100],
      ],
    ],
  ],
};

describe("pointInPolygon — MultiPolygon (disjoint parts)", () => {
  it("returns true for a point inside the first part", () => {
    expect(pointInPolygon([5, 5], TWO_DISJOINT_SQUARES)).toBe(true);
  });

  it("returns true for a point inside the second part", () => {
    expect(pointInPolygon([105, 105], TWO_DISJOINT_SQUARES)).toBe(true);
  });

  it("returns false for a point between the two parts", () => {
    expect(pointInPolygon([50, 50], TWO_DISJOINT_SQUARES)).toBe(false);
  });
});

const MULTIPOLYGON_WITH_HOLE: MultiPolygon = {
  type: "MultiPolygon",
  coordinates: [
    [
      [
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 10],
        [0, 0],
      ],
      [
        [4, 4],
        [6, 4],
        [6, 6],
        [4, 6],
        [4, 4],
      ],
    ],
    [
      [
        [100, 100],
        [110, 100],
        [110, 110],
        [100, 110],
        [100, 100],
      ],
    ],
  ],
};

describe("pointInPolygon — MultiPolygon with a hole in one part", () => {
  it("a point in the first part's hole is outside, even though the second part exists", () => {
    expect(pointInPolygon([5, 5], MULTIPOLYGON_WITH_HOLE)).toBe(false);
  });

  it("a point in the first part's solid area is inside", () => {
    expect(pointInPolygon([1, 1], MULTIPOLYGON_WITH_HOLE)).toBe(true);
  });

  it("a point in the second part is inside (holes in one polygon don't affect another)", () => {
    expect(pointInPolygon([105, 105], MULTIPOLYGON_WITH_HOLE)).toBe(true);
  });
});
