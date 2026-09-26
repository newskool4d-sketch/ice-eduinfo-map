import fs from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PROFILES } from "@/lib/profiles";
import { buildingCoverage, validBuildingTile } from "@/lib/buildings/tiles";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.resetModules(); });
const tileAt = (lng: number, lat: number) => ({
  x: Math.floor((lng + 180) / 360 * 65536),
  y: Math.floor((1 - Math.asinh(Math.tan(lat * Math.PI / 180)) / Math.PI) / 2 * 65536),
});
const songdo = tileAt(126.6467361, 37.4031674673);
const jeonju = tileAt(127.148, 35.824);

describe("Incheon building geography", () => {
  it("uses the actual Incheon boundary including islands and covers every school position", () => {
    const boundary = JSON.parse(fs.readFileSync("public/data/incheon/regions.geojson", "utf8"));
    const extent = [180, 90, -180, -90];
    function visit(coordinates: number[] | number[][]): void {
      if (typeof coordinates[0] === "number") {
        const [lng, lat] = coordinates as number[];
        extent[0] = Math.min(extent[0], lng); extent[1] = Math.min(extent[1], lat);
        extent[2] = Math.max(extent[2], lng); extent[3] = Math.max(extent[3], lat);
      } else (coordinates as number[][]).forEach(visit);
    }
    boundary.features.forEach((f: { geometry: { coordinates: number[][] } }) => visit(f.geometry.coordinates));
    expect(PROFILES.incheon.buildings?.bounds).toEqual(extent);
    const schools = JSON.parse(fs.readFileSync("public/data/incheon/schools.json", "utf8")).schools;
    expect(schools).toHaveLength(562);
    for (const school of schools) {
      const { x, y } = tileAt(school.lng, school.lat);
      expect(validBuildingTile(16, x, y, PROFILES.incheon), school.name).toBe(true);
    }
    const { range, extent: tilesExtent } = buildingCoverage(PROFILES.incheon)!;
    expect(tilesExtent[0]).toBeLessThan(extent[0]);
    expect(tilesExtent[1]).toBeLessThan(extent[1]);
    expect(tilesExtent[2]).toBeGreaterThan(extent[2]);
    expect(tilesExtent[3]).toBeGreaterThan(extent[3]);
    expect(validBuildingTile(16, range.minX - 1, range.minY, PROFILES.incheon)).toBe(false);
    expect(validBuildingTile(16, range.maxX + 1, range.maxY, PROFILES.incheon)).toBe(false);
  });

  it("keeps the two provinces isolated and refuses unsupported profiles", () => {
    expect(validBuildingTile(16, songdo.x, songdo.y, PROFILES.incheon)).toBe(true);
    expect(validBuildingTile(16, songdo.x, songdo.y, PROFILES.jeonbuk)).toBe(false);
    expect(validBuildingTile(16, jeonju.x, jeonju.y, PROFILES.jeonbuk)).toBe(true);
    expect(validBuildingTile(16, jeonju.x, jeonju.y, PROFILES.incheon)).toBe(false);
    expect(buildingCoverage({})).toBeNull();
    expect(validBuildingTile(16, songdo.x, songdo.y, {})).toBe(false);
    expect(validBuildingTile(15, songdo.x, songdo.y, PROFILES.incheon)).toBe(false);
    expect(validBuildingTile(16, songdo.x + 0.5, songdo.y, PROFILES.incheon)).toBe(false);
  });
});

async function incheonApi() {
  vi.stubEnv("NEXT_PUBLIC_EDU_MAP_PROFILE", "incheon");
  vi.stubEnv("VWORLD_BUILDING_KEY", "test-server-key");
  vi.resetModules();
  const transport = await import("@/lib/buildings/transport");
  const upstream = vi.spyOn(transport, "fetchVworldPage").mockResolvedValue(Response.json({ response: { status: "NOT_FOUND" } }));
  const { GET } = await import("@/app/api/buildings/v1/[z]/[x]/[y]/route");
  const get = (tile = songdo) => GET(new Request("http://localhost/api"), { params: Promise.resolve({ z: "16", x: String(tile.x), y: String(tile.y) }) });
  return { get, upstream };
}

describe("Incheon building API", () => {
  it("serves complete empty tiles but never calls the source for Jeonbuk coordinates", async () => {
    const { get, upstream } = await incheonApi();
    const empty = await get();
    expect(empty.status).toBe(200);
    expect(await empty.json()).toMatchObject({ features: [], metadata: { complete: true } });
    expect(empty.headers.get("cache-control")).toContain("max-age=86400");
    const rejected = await get(jeonju);
    expect(rejected.status).toBe(400);
    expect(rejected.headers.get("cache-control")).toBe("no-store");
    expect(upstream).toHaveBeenCalledTimes(1);
  });

  it.each([["VWORLD_BUILDING_KEY", ""], ["BUILDINGS_ENABLED", "false"], ["NEXT_PUBLIC_BUILDINGS_ENABLED", "false"]])("keeps %s failures uncached and avoids upstream requests", async (name, value) => {
    const { get, upstream } = await incheonApi();
    vi.stubEnv(name, value);
    const response = await get();
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(upstream).not.toHaveBeenCalled();
  });
});
