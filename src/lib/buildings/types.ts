import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";

export interface BuildingProperties {
  sourceId: string;
  rawHeight: unknown;
  rawFloors: unknown;
  providedHeight: number | null;
  floors: number | null;
  displayHeight: number;
  heightSource: "provided" | "floors" | "missing";
}
export type BuildingTile = FeatureCollection<Polygon | MultiPolygon, BuildingProperties> & {
  metadata: { source: string; fetchedAt: string; complete: true };
  byteLength?: number;
};
export function positiveNumber(value: unknown): number | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}
export function buildingProperties(id: string, properties: Record<string, unknown>): BuildingProperties {
  const providedHeight = positiveNumber(properties.height);
  const floors = positiveNumber(properties.grnd_flr);
  return {
    sourceId: id, rawHeight: properties.height ?? null, rawFloors: properties.grnd_flr ?? null,
    providedHeight, floors, displayHeight: providedHeight ?? (floors === null ? 0 : floors * 3),
    heightSource: providedHeight !== null ? "provided" : floors !== null ? "floors" : "missing",
  };
}
