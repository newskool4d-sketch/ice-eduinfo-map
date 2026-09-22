import type { School } from "./types";
import type { SchoolLevel } from "../indicators/types";

export interface SchoolFilters {
  name: string;
  regionCode: string | null;
  level: SchoolLevel | "all";
}

export function filterSchools(
  schools: School[],
  filters: SchoolFilters,
): School[] {
  const query = filters.name.trim().normalize("NFC").toLocaleLowerCase("ko-KR");
  return schools
    .filter(
      (school) =>
        (!filters.regionCode || school.regionCode === filters.regionCode) &&
        (filters.level === "all" || school.level === filters.level) &&
        school.name.normalize("NFC").toLocaleLowerCase("ko-KR").includes(query),
    )
    .sort(
      (a, b) =>
        a.name.localeCompare(b.name, "ko-KR") || a.id.localeCompare(b.id),
    );
}
