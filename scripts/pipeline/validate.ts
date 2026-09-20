/**
 * Validates the built public/data files:
 *  1. every indicator file has all 14 시군 + 52000 (base, non-byLevel rows)
 *  2. schools_total's per-level 52000 values match the official 학교수 exactly
 *  3. students_total / teachers_total per-level 52000 values are within
 *     ±0.5% of the official figures
 *  4. manifest.json years match each series file's years
 *  5. every registry indicator has an indicators/<id>.json (and, unless it's
 *     an 'external' aggregate, a series/<id>.json)
 * Exits 1 and prints a table of every mismatch if any check fails.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { INDICATOR_IDS, INDICATORS, indicatorById } from "../../src/lib/indicators/registry";
import type { IndicatorFile, Manifest, SchoolLevel, SeriesFile } from "../../src/lib/indicators/types";
import {
  OFFICIAL_SCHOOLS_BY_LEVEL,
  OFFICIAL_STUDENTS_BY_LEVEL,
  OFFICIAL_TEACHERS_BY_LEVEL,
  PROVINCE_CODE,
  REGION_TABLE,
  VALIDATE_TOLERANCE_RATIO,
} from "./sources";

const PUBLIC_DATA_DIR = path.resolve(import.meta.dirname, "../../public/data");
const INDICATORS_DIR = path.join(PUBLIC_DATA_DIR, "indicators");
const SERIES_DIR = path.join(PUBLIC_DATA_DIR, "series");

interface Failure {
  check: string;
  detail: string;
}
const failures: Failure[] = [];
const fail = (check: string, detail: string): void => {
  failures.push({ check, detail });
};

function loadJSON<T>(filePath: string): T | null {
  if (!existsSync(filePath)) return null;
  return JSON.parse(readFileSync(filePath, "utf-8")) as T;
}

function checkLevel(
  indicatorFiles: Map<string, IndicatorFile>,
  id: string,
  official: Record<SchoolLevel, number>,
  exact: boolean,
): void {
  const file = indicatorFiles.get(id);
  if (!file) return; // already flagged by the file-existence check

  for (const level of Object.keys(official) as SchoolLevel[]) {
    const officialValue = official[level];
    const row = file.rows.find((r) => r.regionCode === PROVINCE_CODE && r.level === level);
    if (!row || row.value == null) {
      fail(`${id}[${level}]`, `no value for 52000/${level} (official ${officialValue})`);
      continue;
    }
    const diff = row.value - officialValue;
    if (exact) {
      if (diff !== 0) {
        fail(`${id}[${level}]`, `got ${row.value}, official ${officialValue}, diff ${diff > 0 ? "+" : ""}${diff}`);
      }
    } else {
      const ratio = Math.abs(diff) / officialValue;
      if (ratio > VALIDATE_TOLERANCE_RATIO) {
        fail(
          `${id}[${level}]`,
          `got ${row.value}, official ${officialValue}, diff ${diff > 0 ? "+" : ""}${diff} (${(ratio * 100).toFixed(3)}%, tolerance ${(VALIDATE_TOLERANCE_RATIO * 100).toFixed(1)}%)`,
        );
      }
    }
  }
}

function main(): void {
  const expectedRegionCodes = new Set([...REGION_TABLE.map((r) => r.code), PROVINCE_CODE]);
  const indicatorFiles = new Map<string, IndicatorFile>();

  // (5) file existence
  for (const id of INDICATOR_IDS) {
    const def = indicatorById(id);
    const indicatorPath = path.join(INDICATORS_DIR, `${id}.json`);
    const file = loadJSON<IndicatorFile>(indicatorPath);
    if (!file) {
      fail("5:file-exists", `missing public/data/indicators/${id}.json`);
    } else {
      indicatorFiles.set(id, file);
    }

    if (def && def.aggregate.kind !== "external") {
      const seriesPath = path.join(SERIES_DIR, `${id}.json`);
      if (!existsSync(seriesPath)) {
        fail("5:file-exists", `missing public/data/series/${id}.json`);
      }
    }
  }

  // (1) 14 시군 + 52000 present (base rows, level undefined) in every indicator file
  for (const [id, file] of indicatorFiles) {
    const baseCodes = new Set(file.rows.filter((r) => r.level === undefined).map((r) => r.regionCode));
    const missing = [...expectedRegionCodes].filter((code) => !baseCodes.has(code));
    if (missing.length > 0) {
      fail("1:region-coverage", `${id}: missing base rows for ${missing.join(", ")}`);
    }
  }

  // (2) schools_total exact match, (3) students_total / teachers_total within tolerance
  checkLevel(indicatorFiles, "schools_total", OFFICIAL_SCHOOLS_BY_LEVEL, true);
  checkLevel(indicatorFiles, "students_total", OFFICIAL_STUDENTS_BY_LEVEL, false);
  checkLevel(indicatorFiles, "teachers_total", OFFICIAL_TEACHERS_BY_LEVEL, false);

  // (4) manifest years == series years, for every non-external indicator
  const manifest = loadJSON<Manifest>(path.join(PUBLIC_DATA_DIR, "manifest.json"));
  if (!manifest) {
    fail("4:manifest", "public/data/manifest.json missing");
  } else {
    for (const id of INDICATOR_IDS) {
      const def = indicatorById(id);
      if (!def || def.aggregate.kind === "external") continue;
      const series = loadJSON<SeriesFile>(path.join(SERIES_DIR, `${id}.json`));
      if (!series) continue; // already flagged by (5)
      const seriesYears = [...new Set(series.rows.map((r) => r.year))].sort((a, b) => a - b);
      const manifestYears = [...(manifest.indicators[id]?.years ?? [])].sort((a, b) => a - b);
      if (JSON.stringify(seriesYears) !== JSON.stringify(manifestYears)) {
        fail("4:years-match", `${id}: series years [${seriesYears.join(",")}] != manifest years [${manifestYears.join(",")}]`);
      }
    }
  }

  if (failures.length === 0) {
    console.log("[validate] ALL CHECKS PASSED\n");
    console.log("학교급별 검증 (52000 전북 전체, 공식치 대비):");
    const summary = (Object.keys(OFFICIAL_SCHOOLS_BY_LEVEL) as SchoolLevel[]).map((level) => {
      const schools = indicatorFiles.get("schools_total")?.rows.find((r) => r.regionCode === PROVINCE_CODE && r.level === level)?.value;
      const students = indicatorFiles.get("students_total")?.rows.find((r) => r.regionCode === PROVINCE_CODE && r.level === level)?.value;
      const teachers = indicatorFiles.get("teachers_total")?.rows.find((r) => r.regionCode === PROVINCE_CODE && r.level === level)?.value;
      return {
        level,
        schools: `${schools} (official ${OFFICIAL_SCHOOLS_BY_LEVEL[level]})`,
        students: `${students} (official ${OFFICIAL_STUDENTS_BY_LEVEL[level]})`,
        teachers: `${teachers} (official ${OFFICIAL_TEACHERS_BY_LEVEL[level]})`,
      };
    });
    console.table(summary);
    console.log(`\n[validate] ${INDICATOR_IDS.length}/${INDICATORS.length} registry indicators have data files.`);
    return;
  }

  console.error(`[validate] FAILED — ${failures.length} issue(s):\n`);
  console.table(failures);
  process.exitCode = 1;
}

main();
