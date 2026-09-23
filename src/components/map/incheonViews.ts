import { unionBbox, type RegionsFeatureCollection, type RegionFeature } from "@/lib/geo/geo";
import type { Position } from "geojson";

// Current map boundaries. Historical statistics retain their source-era districts.
const MAINLAND_CODES = new Set(["28125", "28177", "28185", "28200", "28237", "28245", "28275", "28290"]);

export function incheonUrbanBounds(regions: RegionsFeatureCollection) {
  const mainland = regions.features.filter((feature) => MAINLAND_CODES.has(feature.properties.code));
  return mainland.length ? unionBbox(mainland) : null;
}

/** Keep displaced region captions inside their own polygon, including holes/islands. */
export function containsRegionLabel(region: RegionFeature, [x, y]: [number, number]) {
  const inRing = (ring: Position[]) => {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i], [xj, yj] = ring[j];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  };
  const polygons = region.geometry.type === "Polygon" ? [region.geometry.coordinates] : region.geometry.coordinates;
  return polygons.some(([outer, ...holes]) => inRing(outer) && !holes.some(inRing));
}
