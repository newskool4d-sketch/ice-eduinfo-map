import { PROVINCE_CODE, REGION_CODES } from "../geo/regions";
import type { SchoolsFile } from "../schools/types";
import type { EducationIssuesFile } from "./types";

/** Validate cached/network data before exposing it to a map. */
export function assertIssueData(
  value: unknown,
  schools: SchoolsFile,
): asserts value is EducationIssuesFile {
  const fail = () => {
    throw new Error(
      "교육문제 자료가 갱신 중이거나 올바르지 않습니다. 다시 시도해 주세요.",
    );
  };
  if (!value || typeof value !== "object") return fail();
  const data = value as EducationIssuesFile;
  if (
    data.version !== 1 ||
    data.statsReferenceDate !== schools.referenceDate.stats ||
    !data.designations ||
    !data.schools ||
    !Array.isArray(data.sources) ||
    data.sources.length < 2
  )
    return fail();
  for (const source of data.sources) {
    if (
      !source ||
      typeof source !== "object" ||
      typeof source.name !== "string" ||
      !source.name ||
      !/^https:\/\//.test(source.url) ||
      !(source.referenceDate || source.checkedAt)
    )
      return fail();
  }
  if (Object.keys(data.designations).length !== REGION_CODES.length)
    return fail();
  for (const code of REGION_CODES) {
    if (
      !["decline", "attention", "none", null].includes(data.designations[code])
    )
      return fail();
  }
  if (Object.keys(data.schools).length !== schools.schools.length)
    return fail();
  const seen = new Set<string>();
  for (const school of schools.schools) {
    const facts = data.schools[school.id];
    if (
      !facts ||
      typeof facts.kediCode !== "string" ||
      !facts.kediCode ||
      facts.kediCode !== school.kediCode ||
      seen.has(facts.kediCode) ||
      typeof facts.isMain !== "boolean" ||
      !["기존", "신설", "휴교"].includes(facts.status)
    )
      return fail();
    if (facts.isMain === school.branch) return fail();
    seen.add(facts.kediCode);
    for (const n of [
      facts.entrants,
      facts.specialClasses,
      facts.specialStudents,
    ]) {
      if (n !== null && (!Number.isInteger(n) || n < 0)) return fail();
    }
  }
  if (data.specialTrends !== undefined) {
    if (!Array.isArray(data.specialTrends)) return fail();
    const keys = new Set<string>();
    for (const row of data.specialTrends) {
      if (!row || ![PROVINCE_CODE, ...REGION_CODES].includes(row.regionCode) ||
        !Number.isInteger(row.year) || row.year < 1900 || row.year > Number(data.statsReferenceDate.slice(0, 4))) return fail();
      const key = `${row.regionCode}:${row.year}`;
      if (keys.has(key)) return fail();
      keys.add(key);
      for (const n of [row.regularStudents, row.regularClasses, row.specialStudents, row.specialClasses])
        if (n !== null && (!Number.isInteger(n) || n < 0)) return fail();
    }
    for (const year of new Set(data.specialTrends.map(r => r.year)))
      for (const code of [PROVINCE_CODE, ...REGION_CODES])
        if (!keys.has(`${code}:${year}`)) return fail();
  }

}
