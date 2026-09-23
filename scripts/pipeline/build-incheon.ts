/** Build a verified staging package; never modify public/data or activate the UI. */
import { createHash, randomUUID } from "node:crypto";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import * as XLSX from "xlsx";
import type { FeatureCollection, Polygon, MultiPolygon } from "geojson";
import { ACTIVE_PROFILE } from "../../src/lib/profiles";
import type { SchoolsFile } from "../../src/lib/schools/types";
import { canonicalSchools, incheonIndicators, type Observation, type LocationLink } from "./lib/incheon";
import { transformRegions } from "./build-regions";
import { transformEmd } from "./build-emd";
import { pointInPolygon } from "./lib/point-in-polygon";
import { buildCharset } from "./build-charset";
import { buildIncheonHistory } from "./lib/incheon-history";

if (ACTIVE_PROFILE.id !== "incheon") throw new Error("Use --profile=incheon for this evidence adapter");
const root = path.resolve(import.meta.dirname, "../..");
const manifestPath = path.join(root, "data/manual/incheon/input-manifest.json");
const manifestBytes = await readFile(manifestPath);
const input = JSON.parse(manifestBytes.toString("utf8")) as {
  profileId: string; statisticsDate: string; geographyDate: string;
  files: Record<string, { path: string; sha256: string; bytes: number }>;
};
if (input.profileId !== "incheon" || input.statisticsDate !== "2026-04-01" || input.geographyDate !== "2026-07-01") throw new Error("Wrong input profile or dates");
const buffers: Record<string, Buffer> = {};
for (const [key, file] of Object.entries(input.files)) {
  const absolute = path.resolve(root, file.path);
  const relative = path.relative(root, absolute);
  if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("Input path outside repository");
  const bytes = await readFile(absolute);
  if (bytes.length !== file.bytes || createHash("sha256").update(bytes).digest("hex") !== file.sha256) throw new Error(`Input hash mismatch: ${key}`);
  buffers[key] = bytes;
}
const decode = <T>(key: string): T => JSON.parse(buffers[key].toString("utf8").replace(/^\uFEFF/, ""));
const observations = decode<Observation[]>("observations");
const links = decode<{ records: LocationLink[] }>("locations").records;
const workbook = XLSX.read(buffers.kess, { type: "buffer", sheets: ["학교별 주요통계"], cellDates: false });
const sheet = workbook.Sheets["학교별 주요통계"];
if (!sheet) throw new Error("KESS sheet missing");
const schools = canonicalSchools(observations, links, (address) => sheet[address]?.v);
const indicators = incheonIndicators(schools);
const history = await buildIncheonHistory(root, schools, buffers.kess);
const boundary = decode<FeatureCollection<Polygon | MultiPolygon, { sido: string; sgg: string }>>("boundary");
const rawRegions = boundary.features.filter((feature) => String(feature.properties.sido) === "28");
if (rawRegions.length !== 158) throw new Error("Expected 158 Incheon boundary features");
for (const school of schools) {
  const matches = new Set(rawRegions.filter((feature) => pointInPolygon([school.lng!, school.lat!], feature.geometry)).map((feature) => String(feature.properties.sgg)));
  if (matches.size !== 1 || !matches.has(school.regionCode)) throw new Error(`Original boundary mismatch: ${school.name}`);
}
console.log(`Validated original KESS cells, unique identities and raw geometry: ${schools.length} schools`);
const comparison = decode<{ status: string; records: { schoolId: string; kessStudents: number; iceStudents: number; differenceKessMinusIce: number }[] }>("studentComparison");
const schoolIndex = new Map(schools.map((school) => [school.id, school]));
if (comparison.records.length !== 562 || new Set(comparison.records.map((row) => row.schoolId)).size !== 562 || comparison.records.some((row) =>
  schoolIndex.get(row.schoolId)?.students !== row.kessStudents || row.kessStudents - row.iceStudents !== row.differenceKessMinusIce)) throw new Error("Student comparison no longer agrees with input");
const teachers = decode<{ incheonIndependentAggregateStatus: string; rows: { schoolId: string; total: number; regular: number; fixedTerm: number }[] }>("teacherComparison");
if (teachers.rows.length !== 562 || new Set(teachers.rows.map((row) => row.schoolId)).size !== 562 || teachers.rows.some((row) =>
  schoolIndex.get(row.schoolId)?.teachers !== row.total || row.total !== row.regular + row.fixedTerm)) throw new Error("Teacher comparison no longer agrees with input");
const totals: Record<string, number> = { elem: 138837, mid: 81567, high: 75229, special: 2027 };
for (const [level, total] of Object.entries(totals)) {
  if (indicators.find((file) => file.id === "students_total")!.rows.find((row) => row.regionCode === "28000" && row.level === level)?.value !== total) throw new Error(`Student total mismatch: ${level}`);
}
if (schools.filter((row) => !row.branch).length !== 555 || schools.reduce((sum, row) => sum + row.teachers!, 0) !== 24920) throw new Error("School or teacher internal total mismatch");

// Small islands must survive. Increase geometric detail only when point checks require it.
let regions;
let acceptedSimplification = 0;
const geometryAttempts: { percent: number; conflicts: string[] }[] = [];
for (const percent of [5, 20, 100]) {
  const candidate = await transformRegions(buffers.boundary.toString("utf8"), { simplifyPercent: percent, minIslandAreaKm2: 0 });
  const mismatches = schools.filter((school) => {
    const matches = candidate.features.filter((feature) => pointInPolygon([school.lng!, school.lat!], feature.geometry));
    return matches.length !== 1 || matches[0].properties.code !== school.regionCode;
  });
  console.log(`Map geometry ${percent}%: ${mismatches.length} school conflicts`);
  geometryAttempts.push({ percent, conflicts: mismatches.map((school) => school.id) });
  if (!mismatches.length) { regions = candidate; acceptedSimplification = percent; break; }
}
if (!regions || regions.features.length !== 11) throw new Error("Unable to preserve all schools in output geometry");
const emd = await transformEmd(buffers.boundary.toString("utf8"));
if (emd.size !== 11 || [...emd.values()].reduce((n, fc) => n + fc.features.length, 0) !== 158) throw new Error("Administrative boundary coverage mismatch");
const sourceFiles = ["build-incheon.ts", "lib/incheon.ts", "lib/incheon-history.ts", "sources.ts", "build-regions.ts", "build-emd.ts", "build-charset.ts", "lib/point-in-polygon.ts"];
const codeHashes = Object.fromEntries(await Promise.all(sourceFiles.map(async (file) => [file, createHash("sha256").update(await readFile(path.join(import.meta.dirname, file))).digest("hex")])));
const profileHash = createHash("sha256").update(JSON.stringify(ACTIVE_PROFILE)).digest("hex");
const dependencyLockHash = createHash("sha256").update(await readFile(path.join(root, "package-lock.json"))).digest("hex");
const buildHash = createHash("sha256").update(manifestBytes).update(history.audit.inputManifestHash).update(JSON.stringify(codeHashes)).update(profileHash).update(dependencyLockHash).digest("hex").slice(0, 12);
const buildId = `${buildHash}-${randomUUID().slice(0, 8)}`;
const parent = path.join(root, "data/output/incheon");
await mkdir(parent, { recursive: true });
const output = path.join(parent, buildId);
await mkdir(output);
const outputHashes: Record<string, string> = {};
async function save(name: string, value: unknown) {
  const text = JSON.stringify(value, null, 2) + "\n";
  const filename = path.join(output, name);
  await mkdir(path.dirname(filename), { recursive: true });
  await writeFile(filename, text);
  const readback = await readFile(filename);
  if (!readback.equals(Buffer.from(text))) throw new Error(`Output readback mismatch: ${name}`);
  outputHashes[name] = createHash("sha256").update(readback).digest("hex");
}
const sources = [
  { name: "KESS 2026 학교별 주요통계", url: "https://kess.kedi.re.kr/contents/dataset", referenceDate: "2026-04-01" },
  { name: "전국 학교 위치 표준데이터", url: "https://www.data.go.kr/data/15159184/fileData.do", referenceDate: "2026-03-20" },
  { name: "학교알리미 보완 좌표 (열람일, 좌표 기준일 미확인)", url: "https://www.schoolinfo.go.kr/", referenceDate: "2026-09-23" },
  { name: "vuski/admdongkor 행정동 경계", url: "https://github.com/vuski/admdongkor/tree/master/ver20260701", referenceDate: "2026-07-01" },
];
const schoolFile: SchoolsFile = { referenceDate: { location: "2026-03-20", stats: "2026-04-01" },
  source: { location: sources[1], stats: sources[0] }, schools };
await save("schools.json", schoolFile);
await save("history.json", history.data);
await save("history-verification.json", history.audit);
await save("regions.geojson", regions);
for (const [code, geometry] of emd) await save(`emd/${code}.geojson`, geometry);
for (const indicator of indicators) await save(`indicators/${indicator.id}.json`, indicator);
await save("charset.json", buildCharset([...schools.map((row) => row.name), ...ACTIVE_PROFILE.regions.map((row) => row.name), "인천광역시"]));
await save("manifest.json", { profileId: "incheon", buildId, latestYear: 2026, statisticsDate: input.statisticsDate,
  geographyDate: input.geographyDate, builtAt: new Date().toISOString(), sources,
  capabilities: ACTIVE_PROFILE.capabilities, indicators: Object.fromEntries(indicators.map((file) => [file.id, { years: [2026] }])),
  history: { years: history.data.years, levels: Object.keys(history.data.byLevel ?? {}), regionBasis: "source-april-10-regions", file: "history.json", qualityStatus: "PARTIAL" },
  quality: { status: "PARTIAL", independentTeacherControl: teachers.incheonIndependentAggregateStatus,
    studentDifferentSchoolRecords: comparison.records.filter((row) => row.differenceKessMinusIce !== 0).length,
    note: "4월 통계를 7월 행정구역으로 재집계. 원자료 차이 보존; 좌표의 과거 시점은 미확인." } });
await save("source-comparison.json", { students: comparison, teachers });
await save("input-manifest.json", input);
await save("verification.json", { packageIntegrity: "PASS", qualityStatus: "PARTIAL", profileId: "incheon", buildId,
  coverage: { N: 562, M: 562, K: 0, mainSchools: 555, branches: 7, specialSchools: 10 },
  regions: 11, administrativeUnits: 158, indicators: indicators.length, geometrySimplificationPercent: acceptedSimplification,
  codeHashes, profileHash, dependencyLockHash, geometryAttempts,
  inputHashes: Object.fromEntries(Object.entries(input.files).map(([key, file]) => [key, file.sha256])), outputHashes: { ...outputHashes },
  notRun: ["UI activation", "historical coordinate certification", "independent teacher aggregate verification", "deployment"] });
await writeFile(path.join(parent, "latest.json"), JSON.stringify({ buildId, path: buildId, qualityStatus: "PARTIAL" }, null, 2) + "\n");
console.log(JSON.stringify({ output, buildId, schools: schools.length, regions: 11, indicators: indicators.length, integrity: "PASS", quality: "PARTIAL" }));
