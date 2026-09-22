import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { supplementSchoolLocations, type VerifiedSchoolLocation } from "../../scripts/pipeline/lib/school-locations";
import type { SchoolsFile } from "../../src/lib/schools/types";

const locations: VerifiedSchoolLocation[] = JSON.parse(readFileSync("data/manual/special-school-locations.json", "utf8"));
const published: SchoolsFile = JSON.parse(readFileSync("public/data/schools.json", "utf8"));
const originals = published.schools.filter((s) => s.level === "special").map((school) => ({
  ...school, lat: null, lng: null, locationSource: undefined, locationMissingReason: "표준자료에 없음",
}));

describe("verified special-school locations", () => {
  it("locates all 11 schools while preserving stable IDs and statistics", () => {
    const enriched = supplementSchoolLocations(originals, locations);
    expect(enriched).toHaveLength(11);
    for (const [index, school] of enriched.entries()) {
      expect(school).toEqual(published.schools.find((s) => s.id === school.id));
      expect(school.locationMissingReason).toBeUndefined();
      const { lat, lng, locationSource, locationMissingReason, ...stats } = originals[index];
      expect(school).toMatchObject(stats);
      expect(lat).toBeNull();
      expect(lng).toBeNull();
      expect(locationSource).toBeUndefined();
      expect(locationMissingReason).toBeTruthy();
    }
  });
  it("preserves the coordinates and school name from each official embedded map", () => {
    for (const location of locations) {
      const url = new URL(location.locationSource.mapUrl);
      expect(url.origin).toBe("https://school.jbedu.kr");
      expect(Number(url.searchParams.get("lat"))).toBe(location.lat);
      expect(Number(url.searchParams.get("lng"))).toBe(location.lng);
      expect(url.searchParams.get("name")).toBe(location.name);
    }
  });
  it("leaves unverified schools missing instead of guessing", () => {
    expect(supplementSchoolLocations(originals, [])[0].lat).toBeNull();
  });
  it.each([
    { kediCode: "unknown" }, { name: "동명이교" }, { regionCode: "52130" },
    { lat: 0 }, { lng: NaN },
    { locationSource: { ...locations[0].locationSource, address: "서울특별시 종로구" } },
    { locationSource: { ...locations[0].locationSource, url: "https://example.com" } },
  ])("rejects invalid coordinates or identity/source drift: %j", (change) => {
    expect(() => supplementSchoolLocations(originals, [{ ...locations[0], ...change }])).toThrow();
  });
  it("rejects duplicates and refuses to overwrite future standard-source coordinates", () => {
    expect(() => supplementSchoolLocations(originals, [locations[0], locations[0]])).toThrow();
    expect(() => supplementSchoolLocations(published.schools, locations)).toThrow();
  });
});
