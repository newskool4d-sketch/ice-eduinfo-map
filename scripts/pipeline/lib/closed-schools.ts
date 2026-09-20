/**
 * Pure CSV parsing + 시군구코드/시군구명 region-code merge/validation + count
 * aggregation for data/raw/전북특별자치도교육청_폐교재산 현황_YYYYMMDD.csv
 * (폐교 지표, Task 5). No fs/path — tests/pipeline/closed-schools.test.ts
 * exercises every stage against small fixtures without touching disk,
 * mirroring lib/schools.ts's split between pure logic here and the CLI IO
 * wrapper in build-closed-schools.ts.
 */
import type { ClosedSchoolRow } from "../../../src/lib/closedSchools/types";
import type { IndicatorRow } from "../../../src/lib/indicators/types";
import { parseCsv } from "./csv";
import { LEVEL_MAP, PROVINCE_CODE, REGION_TABLE } from "../sources";

const CLOSED_SCHOOLS_CSV_COLUMNS = [
  "시도교육청코드",
  "시도교육청명",
  "교육지원청코드",
  "교육지원청명",
  "시도코드",
  "시도명",
  "시군구코드",
  "시군구명",
  "폐교명",
  "폐교연도",
  "학교급구분명",
  "활용현황구분명",
  "건물연면적",
  "대지",
  "담당자 부서명",
  "담당자 전화번호",
  "소재지도로명주소",
  "소재지지번주소",
  "데이터기준일자",
] as const;

/** `52` + 시군구코드(3자리) is the "raw" 5-digit candidate — matches REGION_TABLE's codes exactly for every 시군 except 전주시's 하위 구, which the source splits into 완산구(111)/덕진구(113) (any future 5211X sub-district code merges the same way). */
const JEONJU_SUB_DISTRICT_RE = /^5211\d$/;

/**
 * Resolves a 폐교 CSV row's 시군구코드(3자리)+시군구명 to one of the 14 시군
 * regionCodes, then cross-checks the result against REGION_TABLE: the
 * resolved region's official name must be a prefix of (or equal to) the raw
 * 시군구명 cell — e.g. "전주시 덕진구".startsWith("전주시"), "군산시" ===
 * "군산시". Throws immediately on a mismatch (per the task brief: a
 * 시군구코드/시군구명 disagreement is a data error, not a gap to silently
 * paper over), and on a 시군구코드 with no REGION_TABLE entry at all.
 */
export function regionCodeForClosedSchool(rawCode: string, rawName: string): string {
  const code3 = rawCode.trim().padStart(3, "0");
  const candidate = `52${code3}`;
  const regionCode = JEONJU_SUB_DISTRICT_RE.test(candidate) ? "52110" : candidate;

  const entry = REGION_TABLE.find((r) => r.code === regionCode);
  const name = rawName.trim();
  if (!entry || !name.startsWith(entry.name)) {
    throw new Error(
      `폐교 CSV 시군구코드/시군구명 불일치: 시군구코드=${JSON.stringify(rawCode)}(-> ${regionCode}), ` +
        `시군구명=${JSON.stringify(rawName)} — REGION_TABLE 의 ${regionCode} 항목${entry ? `(${entry.name})` : ""}과 맞지 않습니다.`,
    );
  }
  return regionCode;
}

export interface ParseClosedSchoolsCsvResult {
  rows: ClosedSchoolRow[];
}

/**
 * Parses the full 폐교재산 현황 CSV text (BOM handled by `parseCsv`) into
 * ClosedSchoolRow[]. Columns are looked up by header name (not fixed index),
 * same robustness convention as parseLocationCsv in lib/schools.ts. 담당자
 * 부서명/전화번호 are read by no code path here at all — excluded by
 * construction, not filtered after the fact.
 */
export function parseClosedSchoolsCsv(csvText: string): ParseClosedSchoolsCsvResult {
  const table = parseCsv(csvText);
  if (table.length === 0) return { rows: [] };

  const header = table[0].map((h) => h.trim());
  const col = Object.fromEntries(
    CLOSED_SCHOOLS_CSV_COLUMNS.map((name) => [name, header.indexOf(name)]),
  ) as Record<(typeof CLOSED_SCHOOLS_CSV_COLUMNS)[number], number>;
  for (const name of CLOSED_SCHOOLS_CSV_COLUMNS) {
    if (col[name] === -1) {
      throw new Error(`폐교 CSV 헤더에서 "${name}" 컬럼을 찾을 수 없습니다`);
    }
  }

  const rows: ClosedSchoolRow[] = [];

  for (let i = 1; i < table.length; i++) {
    const raw = table[i];
    if (raw.length === 1 && raw[0] === "") continue; // trailing blank line

    const rawCode = raw[col["시군구코드"]] ?? "";
    const rawName = raw[col["시군구명"]] ?? "";
    const regionCode = regionCodeForClosedSchool(rawCode, rawName);

    const name = raw[col["폐교명"]] ?? "";

    const levelRaw = raw[col["학교급구분명"]] ?? "";
    const level = LEVEL_MAP[levelRaw];
    if (!level) {
      throw new Error(`폐교 CSV ${JSON.stringify(name)}: 알 수 없는 학교급구분명 ${JSON.stringify(levelRaw)}`);
    }

    const yearRaw = raw[col["폐교연도"]] ?? "";
    const year = Number(yearRaw);
    if (!Number.isFinite(year)) {
      throw new Error(`폐교 CSV ${JSON.stringify(name)}: 폐교연도 값이 숫자가 아닙니다 (${JSON.stringify(yearRaw)})`);
    }

    const usage = raw[col["활용현황구분명"]] ?? "";

    const buildingAreaRaw = raw[col["건물연면적"]] ?? "";
    const buildingArea = Number(buildingAreaRaw);
    if (!Number.isFinite(buildingArea)) {
      throw new Error(`폐교 CSV ${JSON.stringify(name)}: 건물연면적 값이 숫자가 아닙니다 (${JSON.stringify(buildingAreaRaw)})`);
    }

    const siteAreaRaw = raw[col["대지"]] ?? "";
    const siteArea = Number(siteAreaRaw);
    if (!Number.isFinite(siteArea)) {
      throw new Error(`폐교 CSV ${JSON.stringify(name)}: 대지 값이 숫자가 아닙니다 (${JSON.stringify(siteAreaRaw)})`);
    }

    const roadAddress = (raw[col["소재지도로명주소"]] ?? "").trim();
    const jibunAddress = (raw[col["소재지지번주소"]] ?? "").trim();
    const address = roadAddress || jibunAddress;

    rows.push({ regionCode, name, year, level, usage, buildingArea, siteArea, address });
  }

  return { rows };
}

export type ClosedSchoolsMetric = "count" | "unused" | "recent";

/**
 * 14 시군 + 52000 IndicatorRow[] for each of the 3 폐교 지표 metrics
 * (closed_schools / closed_schools_unused / closed_schools_recent), in one
 * pass over `rows`. Every REGION_TABLE code is always present (0, not
 * absent) — mirrors scripts/pipeline/lib/aggregate.ts's convention, since
 * 진안·장수·순창 등 폐교가 0건인 시군도 지도에 값이 있어야 한다.
 *
 * "최근 10년" = 폐교연도 >= (rows 안의 최신 폐교연도 - 9). This is computed
 * from the 폐교 데이터 자체의 최신 연도, independent of KESS's manifest
 * latestYear — the two happen to coincide at 2026 today, but this function
 * never assumes that.
 */
export function aggregateClosedSchools(rows: ClosedSchoolRow[]): Record<ClosedSchoolsMetric, IndicatorRow[]> {
  const maxYear = rows.reduce((max, r) => Math.max(max, r.year), -Infinity);
  const recentThreshold = maxYear - 9;

  const predicates: Record<ClosedSchoolsMetric, (r: ClosedSchoolRow) => boolean> = {
    count: () => true,
    unused: (r) => r.usage === "미활용",
    recent: (r) => r.year >= recentThreshold,
  };

  const result = {} as Record<ClosedSchoolsMetric, IndicatorRow[]>;
  for (const metric of Object.keys(predicates) as ClosedSchoolsMetric[]) {
    const predicate = predicates[metric];
    const regionRows: IndicatorRow[] = REGION_TABLE.map((region) => ({
      regionCode: region.code,
      value: rows.filter((r) => r.regionCode === region.code && predicate(r)).length,
    }));
    const total = rows.filter(predicate).length;
    result[metric] = [...regionRows, { regionCode: PROVINCE_CODE, value: total }];
  }
  return result;
}
