import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { WebMercatorViewport } from "@deck.gl/core";
import { clusterSchools } from "@/components/map/schoolClusters";
import { containsRegionLabel, incheonUrbanBounds } from "@/components/map/incheonViews";
import { hasCoordinates, type PositionedSchool } from "@/components/map/layers/schoolLayers";
import type { SchoolsFile } from "@/lib/schools/types";
import type { RegionsFeatureCollection } from "@/lib/geo/geo";

const school = (id: string, x: number, y = 0) => ({ id, lng: x, lat: y } as PositionedSchool);
const identity = (point: number[]) => point;

describe("school point grouping", () => {
  it("keeps isolated and selected schools individually, without losing or duplicating any school", () => {
    const schools = [school("a", 0), school("b", 1), school("selected", 1), school("far", 200)];
    const result = clusterSchools(schools, identity, "selected");
    expect(result.individuals.map(s => s.id)).toEqual(["selected", "far"]);
    expect(result.clusters[0].schools.map(s => s.id)).toEqual(["a", "b"]);
    expect(result.clusters[0].bounds).toEqual([0, 0, 1, 0]);
    expect(schools.map(s => s.lng)).toEqual([0, 1, 1, 200]);
  });
  it("does not chain close neighbours into a city-wide group", () => {
    const result = clusterSchools([school("a", 0), school("b", 30), school("c", 60), school("d", 90)], identity, null);
    expect(result.clusters.map(c => c.schools.map(s => s.id))).toEqual([["a", "b"], ["c", "d"]]);
    expect(result.clusters[1].position[0] - result.clusters[0].position[0]).toBeGreaterThanOrEqual(44);
  });
  it("is independent of list ordering and map panning, and separates schools on zoom", () => {
    const schools = [school("a", 0), school("b", 30), school("c", 80)];
    const grouped = clusterSchools(schools, identity, null);
    expect(clusterSchools([...schools].reverse(), ([x, y]) => [x + 100, y - 70], null)).toEqual(grouped);
    expect(clusterSchools(schools, ([x, y]) => [x * 10, y * 10], null).clusters).toHaveLength(0);
  });
  it("keeps co-located campuses accessible as a group, including when one is selected", () => {
    const schools = [school("a", 0), school("b", 0), school("c", 0)];
    const grouped = clusterSchools(schools, identity, "a");
    expect(grouped.individuals.map(s => s.id)).toEqual(["a"]);
    expect(grouped.clusters[0].schools.map(s => s.id)).toEqual(["b", "c"]);
    expect(grouped.clusters[0].bounds).toEqual([0, 0, 0, 0]);
    expect(clusterSchools([], identity, null)).toEqual({ individuals: [], clusters: [] });
  });
  it("preserves all 562 actual Incheon locations at overview and neighbourhood scales", () => {
    const source: SchoolsFile = JSON.parse(readFileSync("public/data/incheon/schools.json", "utf8"));
    const schools = source.schools.filter(hasCoordinates);
    expect(schools).toHaveLength(562);
    for (const zoom of [7, 11, 16, 18]) {
      const viewport = new WebMercatorViewport({ width: 1000, height: 700, longitude: 126.65, latitude: 37.5, zoom });
      const result = clusterSchools(schools, (point) => viewport.project(point), schools[0].id);
      const ids = [...result.individuals, ...result.clusters.flatMap(c => c.schools)].map(s => s.id);
      expect(ids).toHaveLength(schools.length);
      expect(new Set(ids).size).toBe(schools.length);
      expect(result.individuals.some(s => s.id === schools[0].id)).toBe(true);
    }
  });
});

describe("Incheon view shortcuts", () => {
  it("keeps alternative labels inside the correct district, excluding holes", () => {
    const feature = { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [
      [[0,0],[10,0],[10,10],[0,10],[0,0]], [[4,4],[6,4],[6,6],[4,6],[4,4]],
    ] } } as unknown as RegionsFeatureCollection["features"][number];
    expect(containsRegionLabel(feature, [2,2])).toBe(true);
    expect(containsRegionLabel(feature, [5,5])).toBe(false);
    expect(containsRegionLabel(feature, [12,2])).toBe(false);
  });
  it("fits the eight current mainland districts without including the distant island bounds", () => {
    const regions: RegionsFeatureCollection = JSON.parse(readFileSync("public/data/incheon/regions.geojson", "utf8"));
    const bounds = incheonUrbanBounds(regions)!;
    expect(bounds).toEqual([126.57258, 37.34285, 126.7937, 37.63958]);
    for (const feature of regions.features.filter(f => !["28155", "28710", "28720"].includes(f.properties.code))) {
      const [w, s, e, n] = feature.properties.bbox;
      expect(w).toBeGreaterThanOrEqual(bounds[0]); expect(s).toBeGreaterThanOrEqual(bounds[1]);
      expect(e).toBeLessThanOrEqual(bounds[2]); expect(n).toBeLessThanOrEqual(bounds[3]);
    }
    expect(incheonUrbanBounds({ type: "FeatureCollection", features: [] })).toBeNull();
  });
});
