/**
 * Validates the built public/data files:
 *  1. every indicator file has all 14 시군 + 52000 (base, non-byLevel rows)
 *  2. schools_total's per-level 52000 values match the official 학교수 exactly
 *  3. students_total / teachers_total per-level 52000 values are within
 *     ±0.5% of the official figures
 *  4. manifest.json years match each series file's years
 *  5. every registry indicator has an indicators/<id>.json (and, unless it's
 *     an 'external' aggregate, a series/<id>.json)
 *  6. schools.json (Task 4B):
 *     (a) every school has a finite lat/lng inside a broad Korea bounding box
 *     (b) point-in-polygon: the school's (lng,lat) falls inside its claimed
 *         regionCode's polygon in regions.geojson (ray casting, MultiPolygon
 *         support) — a failure inside the region's own bbox ±0.05° is
 *         rescued (서해 도서/simplification), but still flagged as a concern
 *         when the point actually lands inside a DIFFERENT region's polygon
 *     (c) data/interim/schools-match-report.json's matchRate >= 99%
 *     (d) per (regionCode, level) 본교 counts in schools.json match
 *         indicators/schools_total.json's byLevel rows exactly (분교 제외)
 * Exits 1 and prints a table of every mismatch if any check fails.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";
import { INDICATOR_IDS, INDICATORS, indicatorById } from "../../src/lib/indicators/registry";
import type { IndicatorFile, Manifest, SchoolLevel, SeriesFile } from "../../src/lib/indicators/types";
import type { RegionFeature } from "../../src/lib/geo/geo";
import { pointInPolygon } from "./lib/point-in-polygon";
import type { School } from "./lib/schools";
import type { SchoolsMatchReport } from "./lib/schools";
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
const SCHOOLS_JSON_PATH = path.join(PUBLIC_DATA_DIR, "schools.json");
const REGIONS_GEOJSON_PATH = path.join(PUBLIC_DATA_DIR, "regions.geojson");
const MATCH_REPORT_PATH = path.resolve(import.meta.dirname, "../../data/interim/schools-match-report.json");

/** The bbox rescue margin (서해 도서 등 지도 단순화로 좌표가 폴리곤 밖에 살짝 나가는 경우 허용). */
const PIP_RESCUE_MARGIN_DEG = 0.05;
const MATCH_RATE_TARGET = 0.99;

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

/** Non-fatal, worth-a-human-look notes — printed even when every check passes. Currently only populated by the PIP "rescued but lands in a different region's polygon" case (see check 6b). */
const concerns: string[] = [];

type RegionsFeatureCollection = FeatureCollection<Polygon | MultiPolygon, RegionFeature["properties"]>;

/** Korea's rough bounding box (a sanity check, not a precise 전북 boundary — the PIP check below is what actually confirms the region). */
const KOREA_BBOX = { minLat: 33, maxLat: 39, minLng: 124, maxLng: 132 };

function withinBbox(
  lng: number,
  lat: number,
  bbox: readonly [number, number, number, number],
  margin: number,
): boolean {
  const [minLng, minLat, maxLng, maxLat] = bbox;
  return lng >= minLng - margin && lng <= maxLng + margin && lat >= minLat - margin && lat <= maxLat + margin;
}

/** Check 6: schools.json (Task 4B). Requires public/data/schools.json, public/data/regions.geojson, and data/interim/schools-match-report.json to exist — fails loudly (with the exact command to run) rather than crashing on `undefined` when schools.json hasn't been built yet. */
function checkSchools(): void {
  const schoolsFile = loadJSON<{ schools: School[] }>(SCHOOLS_JSON_PATH);
  if (!schoolsFile) {
    fail("6:file-exists", `missing public/data/schools.json — run: npm run data:schools`);
    return;
  }
  const regions = loadJSON<RegionsFeatureCollection>(REGIONS_GEOJSON_PATH);
  if (!regions) {
    fail("6:file-exists", `missing public/data/regions.geojson — run: npm run data:regions`);
    return;
  }
  const report = loadJSON<SchoolsMatchReport>(MATCH_REPORT_PATH);
  if (!report) {
    fail("6:file-exists", `missing data/interim/schools-match-report.json — run: npm run data:schools`);
    return;
  }
  const schoolsTotal = loadJSON<IndicatorFile>(path.join(INDICATORS_DIR, "schools_total.json"));
  if (!schoolsTotal) {
    fail("6:file-exists", `missing public/data/indicators/schools_total.json — run: npm run data:indicators`);
    return;
  }

  const { schools } = schoolsFile;
  const regionByCode = new Map(regions.features.map((f) => [f.properties.code, f]));

  // (a) every school has a finite lat/lng inside a broad Korea bbox.
  for (const school of schools) {
    const { lat, lng } = school;
    const finite = Number.isFinite(lat) && Number.isFinite(lng);
    const inKorea =
      finite &&
      lat >= KOREA_BBOX.minLat &&
      lat <= KOREA_BBOX.maxLat &&
      lng >= KOREA_BBOX.minLng &&
      lng <= KOREA_BBOX.maxLng;
    if (!inKorea) {
      fail("6a:coordinates", `${school.name}(${school.id}): 유효하지 않은 좌표 lat=${lat}, lng=${lng}`);
    }
  }

  // (b) point-in-polygon against the school's claimed regionCode, with a
  // bbox ±0.05° rescue for boundary-simplification misses (서해 도서 등).
  for (const school of schools) {
    if (!Number.isFinite(school.lat) || !Number.isFinite(school.lng)) continue; // already flagged by (a)
    const feature = regionByCode.get(school.regionCode);
    if (!feature) {
      fail("6b:pip", `${school.name}(${school.id}): regions.geojson 에 regionCode ${school.regionCode} 폴리곤이 없음`);
      continue;
    }
    const point: [number, number] = [school.lng, school.lat];
    if (pointInPolygon(point, feature.geometry)) continue; // clean pass

    const rescued = withinBbox(school.lng, school.lat, feature.properties.bbox, PIP_RESCUE_MARGIN_DEG);
    if (!rescued) {
      fail(
        "6b:pip",
        `${school.name}(${school.id}): (${school.lng}, ${school.lat}) 가 ${school.regionCode} 폴리곤 밖이고 bbox±${PIP_RESCUE_MARGIN_DEG}° 밖 (rescue 실패)`,
      );
      continue;
    }

    // Rescued — but distinguish "inside no polygon at all" (expected:
    // coastline/simplification gap) from "inside a genuinely DIFFERENT
    // region's polygon" (a real address-vs-coordinate discrepancy worth a
    // human look, even though the check still passes via the bbox rescue).
    const actualFeature = regions.features.find((f) => pointInPolygon(point, f.geometry));
    if (actualFeature && actualFeature.properties.code !== school.regionCode) {
      concerns.push(
        `6b:pip rescued-but-different-region — ${school.name}(${school.id}): regionCode=${school.regionCode} ` +
          `이지만 좌표는 ${actualFeature.properties.code}(${actualFeature.properties.name}) 폴리곤 안에 있음`,
      );
    }
  }

  // (c) match rate target.
  if (report.matchRate < MATCH_RATE_TARGET) {
    fail(
      "6c:match-rate",
      `${(report.matchRate * 100).toFixed(2)}% (${report.matchedCount}/${report.totalKessIncluded}) < 목표 ${(MATCH_RATE_TARGET * 100).toFixed(0)}% ` +
        `— 미매칭 ${report.unmatchedKess.length}건은 근거 없는 추정 매칭을 하지 않고 data/interim/schools-match-report.json 에 남김`,
    );
  }

  // (d) per (regionCode, level) 본교 counts vs schools_total's byLevel rows,
  // 분교 제외 (분교 rows never counted here or in schools_total's own
  // isMain-gated aggregate). Deliberately per-LEVEL (not one combined
  // per-region total): this is strictly more precise than the brief's literal
  // "시군별 학교수 합" — every discrepancy the combined total would catch is
  // still caught here, plus each failure is attributed to the exact level
  // responsible instead of one opaque per-region number.
  const LEVELS: SchoolLevel[] = ["elem", "mid", "high", "special"];
  const mainSchools = schools.filter((s) => !s.branch);
  for (const region of REGION_TABLE) {
    for (const level of LEVELS) {
      const builtCount = mainSchools.filter((s) => s.regionCode === region.code && s.level === level).length;
      const officialRow = schoolsTotal.rows.find((r) => r.regionCode === region.code && r.level === level);
      const officialCount = officialRow?.value ?? null;
      if (officialCount === null) {
        fail(`6d:schools-count[${region.code}/${level}]`, `schools_total.json 에 (${region.code}, ${level}) 행이 없음`);
        continue;
      }
      if (builtCount !== officialCount) {
        const cause =
          level === "special"
            ? " — 알려진 원인: 위치 CSV(한국교육시설안전원_초중등학교위치)에 특수학교 행이 전국적으로 0건이라 schools.json 에 특수학교를 실을 수 없음(추정 좌표 없이는 해결 불가, task-4B-report.md 참고)"
            : "";
        fail(
          `6d:schools-count[${region.code}/${level}]`,
          `schools.json 본교 ${builtCount}개 vs schools_total.json ${officialCount}개${cause}`,
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

  // (6) schools.json — see checkSchools's own doc comment for (a)-(d).
  checkSchools();

  const matchReport = loadJSON<SchoolsMatchReport>(MATCH_REPORT_PATH);
  if (matchReport) {
    console.log(
      `[validate] 학교 매칭 리포트: ${matchReport.matchedCount}/${matchReport.totalKessIncluded} = ` +
        `${(matchReport.matchRate * 100).toFixed(2)}% (exact ${matchReport.byStage.exact}, suffix ${matchReport.byStage.suffix}, alias ${matchReport.byStage.alias}) — ` +
        `미매칭 ${matchReport.unmatchedKess.length}, 위치 전용 ${matchReport.locationOnly.length}, 시군 배정 실패 ${matchReport.regionParseFailures.length}\n`,
    );
  }

  if (concerns.length > 0) {
    console.warn(`[validate] ${concerns.length}개 참고 사항 (통과했지만 사람이 확인할 가치가 있음):`);
    for (const c of concerns) console.warn(`  - ${c}`);
    console.warn("");
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
