/**
 * Builds public/data/schools.json (전북 학교 점 위치 + KESS 통계) and
 * data/interim/schools-match-report.json (매칭률/미매칭/시군 배정 실패 리포트)
 * from data/raw/한국교육시설안전원_초중등학교위치_YYYYMMDD.csv (전국 학교 위치
 * CSV) matched against data/interim/kess-2026.json (KESS 학교별 통계, already
 * normalized by parse-kess.ts). See scripts/pipeline/lib/schools.ts for the
 * pure parsing/matching logic this script wires up to real files.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import type { SchoolRow } from "./lib/kess-xlsx";
import {
  buildMatchReport,
  buildSchoolRecord,
  includedKessRows,
  matchSchools,
  parseLocationCsv,
  type School,
} from "./lib/schools";
import { KESS_STATS_SOURCE, LOCATION_CSV_PREFIX, LOCATION_SOURCE, referenceDateFromFilename } from "./sources";

const ROOT = path.resolve(import.meta.dirname, "../..");
const RAW_DIR = path.join(ROOT, "data/raw");
const INTERIM_DIR = path.join(ROOT, "data/interim");
const PUBLIC_DATA_DIR = path.join(ROOT, "public/data");
const ALIASES_PATH = path.join(ROOT, "data/manual/school-aliases.json");
const KESS_INTERIM_PATH = path.join(INTERIM_DIR, "kess-2026.json");

/** Scans data/raw/ for a file matching `LOCATION_CSV_PREFIX*.csv` — per the 날짜기준 규칙, the pipeline never hardcodes the date suffix, and fails loudly (naming the exact expected pattern) when no such file exists. */
function findLocationCsvFile(): string {
  const entries = existsSync(RAW_DIR) ? readdirSync(RAW_DIR) : [];
  const candidates = entries.filter((f) => f.startsWith(LOCATION_CSV_PREFIX) && f.endsWith(".csv")).sort();
  if (candidates.length === 0) {
    throw new Error(
      `${path.relative(ROOT, RAW_DIR)}/ 에 위치 CSV 파일이 없습니다. ` +
        `필요한 파일명: ${LOCATION_CSV_PREFIX}YYYYMMDD.csv (예: ${LOCATION_CSV_PREFIX}20260320.csv) — ` +
        `공공데이터포털(data.go.kr, 한국교육시설안전원 초중등학교위치 표준데이터)에서 내려받아 이 이름 그대로 data/raw/ 에 두세요.`,
    );
  }
  // If more than one date happens to be present, use the most recent (sorts
  // last as a YYYYMMDD-suffixed string) rather than silently picking
  // whichever readdir happened to list first.
  return candidates[candidates.length - 1];
}

function readAliases(): Record<string, string> {
  if (!existsSync(ALIASES_PATH)) return {};
  return JSON.parse(readFileSync(ALIASES_PATH, "utf8")) as Record<string, string>;
}

interface KessInterimFile {
  year: number;
  referenceDate: string;
  rows: SchoolRow[];
}

function readKessInterim(): KessInterimFile {
  if (!existsSync(KESS_INTERIM_PATH)) {
    throw new Error(
      `${path.relative(ROOT, KESS_INTERIM_PATH)} 가 없습니다 — 먼저 npm run data:kess 를 실행하세요.`,
    );
  }
  return JSON.parse(readFileSync(KESS_INTERIM_PATH, "utf8")) as KessInterimFile;
}

async function main(): Promise<void> {
  const filename = findLocationCsvFile();
  const locationReferenceDate = referenceDateFromFilename(filename);
  console.log(`[build-schools] reading ${path.relative(ROOT, path.join(RAW_DIR, filename))} (기준일 ${locationReferenceDate}) ...`);

  const csvText = readFileSync(path.join(RAW_DIR, filename), "utf8");
  const { rows: locationRows, regionParseFailures } = parseLocationCsv(csvText);
  console.log(
    `[build-schools] 위치 CSV: 전북 ${locationRows.length + regionParseFailures.length}행 ` +
      `(시군 배정 성공 ${locationRows.length}, 실패 ${regionParseFailures.length})`,
  );

  const kessInterim = readKessInterim();
  const kessIncluded = includedKessRows(kessInterim.rows);
  console.log(
    `[build-schools] KESS ${kessInterim.rows.length}행 중 매칭 대상(기존/신설/휴교) ${kessIncluded.length}행`,
  );

  const aliases = readAliases();
  const result = matchSchools(locationRows, kessIncluded, aliases);

  const schools: School[] = result.matched
    .map(buildSchoolRecord)
    .sort((a, b) => a.id.localeCompare(b.id));

  const schoolsFile = {
    referenceDate: { location: locationReferenceDate, stats: kessInterim.referenceDate },
    source: {
      location: { ...LOCATION_SOURCE, referenceDate: locationReferenceDate },
      stats: { ...KESS_STATS_SOURCE, referenceDate: kessInterim.referenceDate },
    },
    schools,
  };

  await mkdir(PUBLIC_DATA_DIR, { recursive: true });
  const schoolsPath = path.join(PUBLIC_DATA_DIR, "schools.json");
  await writeFile(schoolsPath, JSON.stringify(schoolsFile, null, 2));
  console.log(`[build-schools] wrote ${path.relative(ROOT, schoolsPath)}: ${schools.length} schools`);

  const report = buildMatchReport(result, kessInterim.rows, kessIncluded.length, regionParseFailures);
  await mkdir(INTERIM_DIR, { recursive: true });
  const reportPath = path.join(INTERIM_DIR, "schools-match-report.json");
  await writeFile(reportPath, JSON.stringify(report, null, 2));

  const pct = (report.matchRate * 100).toFixed(2);
  console.log(
    `[build-schools] 매칭률: ${report.matchedCount}/${report.totalKessIncluded} = ${pct}% ` +
      `(exact ${report.byStage.exact}, suffix ${report.byStage.suffix}, alias ${report.byStage.alias}); ` +
      `미매칭 KESS ${report.unmatchedKess.length}, 위치 전용 ${report.locationOnly.length}, ` +
      `시군 배정 실패 ${report.regionParseFailures.length}, 모호 ${report.ambiguous.length}`,
  );
  if (report.matchRate < 0.99) {
    console.warn(
      `[build-schools] 경고: 매칭률(${pct}%)이 목표(99%) 미달입니다 — 근거 없는 추정 매칭 없이 남은 미매칭은 ` +
        `${path.relative(ROOT, reportPath)} 에 표로 남겼습니다.`,
    );
  }
  console.log(`[build-schools] wrote ${path.relative(ROOT, reportPath)}`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
