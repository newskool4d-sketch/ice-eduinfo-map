import { describe, expect, it } from "vitest";
import { canonicalSchools, incheonIndicators, type Observation, type LocationLink } from "../../scripts/pipeline/lib/incheon";

function fixture() {
  const observations: Observation[] = Array.from({ length: 562 }, (_, i) => ({
    schoolId: `kedi:${100000 + i}`, name: `학교${i}`, level: "초등학교", sourceRegion: "중구",
    address: `인천광역시 학교로 ${i + 1}`, campus: i < 555 ? "본교" : "분교장", status: "기존(원)교",
    schoolCountFlag: i < 555 ? 1 : 0, students: i < 555 ? 10 : 3, teachers: i < 555 ? 2 : 1,
    classes: i < 555 ? 1 : 0, sourceRow: i + 18, studentCell: `학교별 주요통계!AN${i + 18}`,
  }));
  const links: LocationLink[] = observations.map((row) => ({
    schoolId: row.schoolId, name: row.name, level: row.level, campus: row.campus,
    locationId: `location:${row.schoolId}`, latitude: 37.5, longitude: 126.5, uniqueCurrentSgg: "28155",
    identityVerified: true, finiteRangeVerified: true, regionResolutionVerified: true, pointStatus: "PASS", method: "fixture",
    historicalCoordinateStatus: "unverified", source: { id: "fixture", coordinateReferenceDate: null },
    evidence: { kessRow: row.sourceRow, kessAddress: row.address },
  }));
  const cells: Record<string, unknown> = {};
  for (const row of observations) {
    for (const [column, value] of Object.entries({ I: row.name, E: row.level, C: row.sourceRegion, T: row.address,
      L: row.campus, P: row.status, X: row.schoolCountFlag, AN: row.students, BJ: row.teachers, AG: row.classes,
      K: Number(row.schoolId.slice(5)), B: "인천", Q: "특별/광역시" })) cells[`${column}${row.sourceRow}`] = value;
  }
  return { observations, links, cells, cell: (address: string) => cells[address] };
}

describe("Incheon evidence adapter", () => {
  it("preserves the old region while adopting verified current geography and metropolitan classification", () => {
    const f = fixture();
    const rows = canonicalSchools(f.observations, f.links, f.cell);
    expect(rows[0].sourceRegionName).toBe("중구");
    expect(rows[0].regionCode).toBe("28155");
    expect(rows[0].sourceAreaType).toBe("특별/광역시");
    expect(rows[0].areaType).toBe("metropolitan");
    expect(rows[561].studentsPerClass).toBeNull();
  });

  it("fails when published evidence no longer matches the original workbook", () => {
    const f = fixture();
    f.cells.AN18 = 11;
    expect(() => canonicalSchools(f.observations, f.links, f.cell)).toThrow("Original KESS mismatch");
  });

  it("rejects duplicate or unverified locations, missing counts, and invalid ranges", () => {
    for (const mutate of [
      (f: ReturnType<typeof fixture>) => { f.links[1].locationId = f.links[0].locationId; },
      (f: ReturnType<typeof fixture>) => { f.links[0].pointStatus = "미검증"; },
      (f: ReturnType<typeof fixture>) => { f.links[0].latitude = Infinity; },
      (f: ReturnType<typeof fixture>) => { f.links[0].uniqueCurrentSgg = "28110"; },
      (f: ReturnType<typeof fixture>) => { f.cells.BJ18 = null; },
    ]) {
      const f = fixture(); mutate(f);
      expect(() => canonicalSchools(f.observations, f.links, f.cell)).toThrow();
    }
  });

  it("includes branch pupils but excludes branches from school counts and uses weighted ratios", () => {
    const f = fixture();
    const indicators = incheonIndicators(canonicalSchools(f.observations, f.links, f.cell));
    const value = (id: string, code = "28000") => indicators.find((file) => file.id === id)!.rows.find((row) => row.regionCode === code && !row.level)!.value;
    expect(value("schools_total")).toBe(555);
    expect(value("students_total")).toBe(5571);
    expect(value("teachers_total")).toBe(1117);
    expect(value("students_per_teacher")).toBeCloseTo(5571 / 1117);
    expect(value("students_per_teacher", "28125")).toBeNull();
    expect(value("schools_total", "28125")).toBe(0);
    expect(value("small_schools")).toBe(555);
    expect(value("small_school_share")).toBe(100);
    expect(indicators.every((file) => file.rows.length === 60)).toBe(true);
    expect(indicators.some((file) => file.id.includes("closed") || file.id.includes("change"))).toBe(false);
  });
});
