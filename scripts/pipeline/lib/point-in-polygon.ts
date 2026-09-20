/**
 * Self-contained point-in-polygon test (ray casting / PNPOLY), used by
 * validate.ts to confirm every school's (lng, lat) actually falls inside the
 * 시군 polygon its `regionCode` claims, per `public/data/regions.geojson`.
 * No turf/geojson library dependency — the task brief asks for our own
 * implementation.
 */
import type { MultiPolygon, Polygon, Position } from "geojson";

type Ring = Position[];

/**
 * Classic even-odd ray-casting test for a single closed ring (PNPOLY, W.
 * Randolph Franklin). Works regardless of winding order. A point exactly on
 * the boundary may resolve either way (standard ray-casting caveat) — not a
 * concern here since school points are never expected to sit exactly on a
 * 시군 border.
 */
function insideRing(point: readonly [number, number], ring: Ring): boolean {
  const [x, y] = point;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersects = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

/**
 * True if `point` is inside the given ring set under the even-odd rule
 * (exterior ring + holes): a point inside an odd number of the polygon's own
 * rings is inside the filled area (inside the exterior only -> 1 -> inside;
 * inside the exterior AND a hole -> 2 -> outside).
 */
function insidePolygonRings(point: readonly [number, number], rings: Ring[]): boolean {
  let count = 0;
  for (const ring of rings) {
    if (insideRing(point, ring)) count++;
  }
  return count % 2 === 1;
}

/**
 * Point-in-polygon for a GeoJSON `Polygon` or `MultiPolygon` geometry.
 * `MultiPolygon`: true if the point is inside ANY of its constituent
 * polygons (each tested independently via its own exterior+holes ring set —
 * NOT by flattening every ring across every constituent polygon into one
 * list, which would give the wrong answer for two disjoint parts).
 */
export function pointInPolygon(point: readonly [number, number], geometry: Polygon | MultiPolygon): boolean {
  if (geometry.type === "Polygon") {
    return insidePolygonRings(point, geometry.coordinates);
  }
  return geometry.coordinates.some((polygonRings) => insidePolygonRings(point, polygonRings));
}
