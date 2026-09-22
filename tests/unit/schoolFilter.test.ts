import { describe, expect, it } from "vitest";
import { filterSchools } from "@/lib/schools/filter";
import type { School } from "@/lib/schools/types";
const school = (
  id: string,
  name: string,
  regionCode: string,
  level: School["level"],
  lat: number | null = 35,
): School => ({
  id,
  name,
  regionCode,
  level,
  lat,
  lng: lat === null ? null : 127,
  students: null,
  classes: null,
  teachers: null,
  studentsPerClass: null,
  small: false,
  branch: false,
  status: "운영",
});
const schools = [
  school("b", "나초등학교", "52110", "elem"),
  school("a", "가초등학교", "52110", "elem"),
  school("c", "가중학교", "52130", "mid"),
  school("d", "특수학교", "52110", "special", null),
];
describe("학교 탐색 필터", () => {
  it("combines name, region and school level without changing the source order", () => {
    expect(
      filterSchools(schools, {
        name: " 초등 ",
        regionCode: "52110",
        level: "elem",
      }).map((s) => s.id),
    ).toEqual(["a", "b"]);
    expect(schools[0].id).toBe("b");
    expect(
      filterSchools(schools, { name: "가", regionCode: "52110", level: "mid" }),
    ).toEqual([]);
  });
  it("keeps schools without coordinates searchable", () => {
    expect(
      filterSchools(schools, {
        name: "특수",
        regionCode: null,
        level: "all",
      }).map((s) => s.id),
    ).toEqual(["d"]);
  });
});
