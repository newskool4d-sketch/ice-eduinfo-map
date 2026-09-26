import { ACTIVE_PROFILE, type RegionProfile } from "../profiles";

export const BUILDING_ZOOM = 16;
const N = 2 ** BUILDING_ZOOM;
const xOf = (lng: number) => Math.floor((lng + 180) / 360 * N);
const yOf = (lat: number) => Math.floor((1 - Math.asinh(Math.tan(lat * Math.PI / 180)) / Math.PI) / 2 * N);
/** Both the API allowlist and the renderer derive from the same profile boundary. */
export function buildingCoverage(profile: Pick<RegionProfile, "buildings"> = ACTIVE_PROFILE) {
  if (!profile.buildings) return null;
  const [west, south, east, north] = profile.buildings.bounds;
  const range = { minX: xOf(west) - 1, maxX: xOf(east) + 1, minY: yOf(north) - 1, maxY: yOf(south) + 1 };
  const sw = tileBounds(range.minX, range.maxY);
  const ne = tileBounds(range.maxX, range.minY);
  const extent: [number, number, number, number] = [sw[0], sw[1], ne[2], ne[3]];
  return { range, extent };
}
export function validBuildingTile(z: number, x: number, y: number, profile: Pick<RegionProfile, "buildings"> = ACTIVE_PROFILE): boolean {
  const coverage = buildingCoverage(profile);
  if (!coverage) return false;
  const { range } = coverage;
  return z === BUILDING_ZOOM && Number.isInteger(x) && Number.isInteger(y) &&
    x >= range.minX && x <= range.maxX && y >= range.minY && y <= range.maxY;
}
export function tileBounds(x: number, y: number): [number, number, number, number] {
  const lat = (row: number) => Math.atan(Math.sinh(Math.PI * (1 - 2 * row / N))) * 180 / Math.PI;
  return [x / N * 360 - 180, lat(y + 1), (x + 1) / N * 360 - 180, lat(y)];
}
