import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { SchoolsFile } from "../../src/lib/schools/types";
import type { SchoolRow } from "./lib/kess-xlsx";
import type { EducationIssuesFile } from "../../src/lib/issues/types";
import { assertIssueData } from "../../src/lib/issues/validate";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const read = async (file: string) =>
  JSON.parse(await readFile(path.join(root, file), "utf8"));
const schools: SchoolsFile = await read("public/data/schools.json");
const year = Number(schools.referenceDate.stats.slice(0, 4));
const kess: { year: number; referenceDate: string; rows: SchoolRow[] } =
  await read(`data/interim/kess-${year}.json`);
const manifest = await read("public/data/manifest.json");
if (
  manifest.latestYear !== year ||
  kess.year !== year ||
  kess.referenceDate !== schools.referenceDate.stats
)
  throw new Error("학교·교육통계·지표 자료의 기준연도가 일치하지 않습니다.");
const population = await read("data/manual/population-designations.json");
const byCode = new Map<string, SchoolRow>();
for (const row of kess.rows) {
  if (!row.kediCode || byCode.has(row.kediCode))
    throw new Error(`중복 또는 누락 KEDI 코드: ${row.name}`);
  byCode.set(row.kediCode, row);
}
const facts: EducationIssuesFile["schools"] = {};
for (const school of schools.schools) {
  const row = byCode.get(school.kediCode ?? "");
  if (
    !row ||
    row.name !== school.name ||
    row.regionCode !== school.regionCode ||
    row.level !== school.level ||
    row.branch !== school.branch
  )
    throw new Error(`학교 연결 불일치: ${school.name}`);
  facts[school.id] = {
    kediCode: row.kediCode!,
    isMain: row.isMain === 1,
    status: row.status,
    entrants: row.entrants,
    specialClasses: row.specialClasses,
    specialStudents: row.specialStudents,
  };
}
const data: EducationIssuesFile = {
  version: 1,
  statsReferenceDate: schools.referenceDate.stats,
  sources: [population.source, schools.source.stats],
  designations: population.designations,
  schools: facts,
};
assertIssueData(data, schools);
await writeFile(
  path.join(root, "public/data/education-issues.json"),
  JSON.stringify(data, null, 2) + "\n",
);
console.log(
  `교육문제 자료 생성: ${schools.schools.length}개 학교 · 14개 시군 · ${data.statsReferenceDate}`,
);
