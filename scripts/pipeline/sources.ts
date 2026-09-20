/**
 * Data source configuration for the KESS 교육통계 pipeline: download URLs,
 * per-year file IDs, the 전북 14 시군 code table, and the header/value
 * normalization rules that scripts/pipeline/lib/kess-xlsx.ts uses to turn
 * raw xlsx rows into normalized SchoolRow objects.
 *
 * Every constant here was verified against the real downloaded files
 * (see the 검증 section of task-1B-report.md for the full derivation).
 */
import type { SchoolLevel } from "../../src/lib/indicators/types";

// ---------------------------------------------------------------------------
// Download source
// ---------------------------------------------------------------------------

/**
 * KESS 교육기본통계 「학교별 데이터셋」(학교별 주요통계, 상반기) download IDs,
 * read directly off https://kess.kedi.re.kr/contents/dataset ("학교별(상반기)"
 * section, `onclick="downLoad(ID, FILE_PATH, FILE_NAME, GROUP_A)"`), where
 * FILE_PATH is the `fileNm` query param. All 5 years 2022-2026 were found on
 * that page (no need for the jbe.go.kr board fallback in the task brief).
 */
export const KESS_FILE_IDS: Record<number, string> = {
  2026: "2026835615251.xlsx",
  2025: "2026162291710.xlsx",
  2024: "202511821729896.xlsx",
  2023: "202511821715160.xlsx",
  2022: "20247303352490.xlsx",
};

export const KESS_DOWNLOAD_BASE = "https://kess.kedi.re.kr/contents/dataSet/downLoad.do";

export function kessDownloadUrl(fileId: string): string {
  return `${KESS_DOWNLOAD_BASE}?fileNm=${fileId}&userfileNm=x.xlsx`;
}

export const KESS_SHEET_NAME = "학교별 주요통계";

// ---------------------------------------------------------------------------
// 시군 (region) table
// ---------------------------------------------------------------------------

export interface RegionEntry {
  code: string;
  name: string;
}

/** 전북 14 시군. `행정구` column values match these names exactly (whitespace-stripped). */
export const REGION_TABLE: RegionEntry[] = [
  { code: "52110", name: "전주시" },
  { code: "52130", name: "군산시" },
  { code: "52140", name: "익산시" },
  { code: "52180", name: "정읍시" },
  { code: "52190", name: "남원시" },
  { code: "52210", name: "김제시" },
  { code: "52710", name: "완주군" },
  { code: "52720", name: "진안군" },
  { code: "52730", name: "무주군" },
  { code: "52740", name: "장수군" },
  { code: "52750", name: "임실군" },
  { code: "52770", name: "순창군" },
  { code: "52790", name: "고창군" },
  { code: "52800", name: "부안군" },
];

/** Code used for the province-wide (전북 전체) aggregate row. */
export const PROVINCE_CODE = "52000";

const normalizeRegionName = (s: string): string => s.replace(/\s+/g, "");

const REGION_NAME_TO_CODE = new Map(
  REGION_TABLE.map((r) => [normalizeRegionName(r.name), r.code]),
);

/**
 * Resolves a raw `행정구` cell value to its 시군 code. Throws immediately on
 * an unmapped value — per the task brief, silent data loss on region
 * assignment is not acceptable.
 */
export function regionCodeForName(rawName: string): string {
  const code = REGION_NAME_TO_CODE.get(normalizeRegionName(rawName));
  if (!code) {
    throw new Error(
      `Unmapped 행정구 value: ${JSON.stringify(rawName)}. Add it to REGION_TABLE in sources.ts or investigate the source row.`,
    );
  }
  return code;
}

// ---------------------------------------------------------------------------
// 학교급 (school level) mapping
// ---------------------------------------------------------------------------

/**
 * Only these four 학교급 values become SchoolRow.level. Everything else
 * (유치원, 방송통신고등학교, 방송통신중학교, 고등공민학교, 각종학교, ...) is
 * dropped and tallied under `level:<raw value>` in readSchoolSheet's
 * `dropped` report — confirmed against the 2026 file: dropping those leaves
 * exactly 761 전북 rows across the 4 core levels (402+208+133+11 raw, before
 * the school-count status/branch filter below).
 */
export const LEVEL_MAP: Record<string, SchoolLevel> = {
  초등학교: "elem",
  중학교: "mid",
  고등학교: "high",
  특수학교: "special",
};

// ---------------------------------------------------------------------------
// 상태 (status) normalization + the school-count filter
// ---------------------------------------------------------------------------

export type SchoolStatus = "기존" | "신설" | "휴교" | "폐교";

/**
 * Raw `상태` cell values, as they actually appear in the xlsx (confirmed
 * identical across all 5 downloaded years, 2022-2026):
 * '기존(원)교' | '신설(원)교' | '휴(원)교' | '폐(원)교'.
 * Normalized to short codes so INCLUDED_STATUSES below reads cleanly.
 * Throws on an unrecognized value (same fail-loud policy as region codes).
 */
const STATUS_MAP: Record<string, SchoolStatus> = {
  "기존(원)교": "기존",
  "신설(원)교": "신설",
  "휴(원)교": "휴교",
  "폐(원)교": "폐교",
};

export function normalizeStatus(raw: string): SchoolStatus {
  const status = STATUS_MAP[raw];
  if (!status) {
    throw new Error(`Unmapped 상태 value: ${JSON.stringify(raw)}. Add it to STATUS_MAP in sources.ts.`);
  }
  return status;
}

/**
 * ## 학교수 정의 확정 절차 — result
 *
 * The 2026 xlsx's own note row (row index 4, column A) states the official
 * rule verbatim: "학교수 세는 방법 : 본분교칼럼에서 분교장 제외, 상태칼럼에서
 * 폐교제외" (school count = exclude 분교장 from 본분교, exclude 폐교 from
 * 상태). That note is present, word for word, in all 5 downloaded years.
 * The sheet even ships a native `학교수` column (1|0) that is already exactly
 * `(본분교==='본교') && (상태!=='폐(원)교') ? 1 : 0` for all 1227 전북 2026
 * rows — independent corroboration of the same rule from the source file
 * itself, not just its footnote.
 *
 * We verified this by brute-force, computing schools/students/teachers for
 * the 4 core levels under several candidate filters against the official
 * 전북교육청 전북통계 2026.4.1 figures (초402·중206·고132·특11 /
 * 70,524·46,907·47,206·1,321 students / 8,116·4,935·5,377·482 teachers):
 *
 * | filter (row status kept)                          | 초  | 중  | 고  | 특 | students match | teachers match |
 * |----------------------------------------------------|-----|-----|-----|----|-----------------|-----------------|
 * | 기존,신설 only (brief's suggested starting point)   | 402 | 206 | 131 | 11 | n/a (branch excluded from sum) | n/a |
 * | 기존,신설,휴교 (= exclude only 폐교)                 | 402 | 206 | 132 | 11 | exact (0 diff, all 4 levels) | exact (0 diff, all 4 levels) |
 *
 * 고등학교 needs 휴교 included: 위도고등학교 (부안군, 특수지역, 0 students,
 * 휴(원)교) is the one 휴교 고등학교 in 전북, and the official 132 count
 * requires it. There are 0 휴교 rows among 초/중/특, so INCLUDED_STATUSES
 * only visibly changes the 고 total, but it is the officially documented
 * rule for every level.
 *
 * Row-level filtering is intentionally *only* by `status` (branch is not
 * used to drop rows) — aggregate.ts applies this same `status ∈
 * INCLUDED_STATUSES` filter uniformly to every aggregate kind (sum / ratio /
 * count / share). 분교장 rows stay in the row set (so they contribute to
 * `sum` aggregates like students/teachers) but have `isMain = 0` (so they
 * are excluded from `count`/`share` aggregates keyed on the `isMain`
 * predicate — i.e. excluded from 학교수). This combination is what
 * reproduces the official totals exactly: summing students/teachers with
 * branch rows *included* (via the 상태-only filter) and 분교장 excluded only
 * from the 본교 count gives an EXACT match (0 diff) on all twelve official
 * figures (4 levels × schools/students/teachers) — see task-1B-report.md for
 * the full table.
 */
export const INCLUDED_STATUSES: readonly SchoolStatus[] = ["기존", "신설", "휴교"];

// ---------------------------------------------------------------------------
// 지역규모 (area type) normalization
// ---------------------------------------------------------------------------

export type AreaType = "시" | "읍" | "면" | "특수";

/** Raw values seen: '시' | '읍지역' | '면지역' | '특수지역'. */
const AREA_TYPE_MAP: Record<string, AreaType> = {
  시: "시",
  읍지역: "읍",
  면지역: "면",
  특수지역: "특수",
};

export function normalizeAreaType(raw: string): AreaType {
  const areaType = AREA_TYPE_MAP[raw];
  if (!areaType) {
    throw new Error(`Unmapped 지역규모 value: ${JSON.stringify(raw)}. Add it to AREA_TYPE_MAP in sources.ts.`);
  }
  return areaType;
}

// ---------------------------------------------------------------------------
// Small-school threshold
// ---------------------------------------------------------------------------

/** 소규모학교 = 학생수 <= 60 (registry constant; official 교육부 지역규모별 기준은 후속 과제). */
export const SMALL_SCHOOL_MAX_STUDENTS = 60;

// ---------------------------------------------------------------------------
// Official validation figures (전북교육청 전북통계 주요지표, 기준일 2026-04-01)
// ---------------------------------------------------------------------------

export const OFFICIAL_REFERENCE_DATE = "2026-04-01";

export const OFFICIAL_SCHOOLS_BY_LEVEL: Record<SchoolLevel, number> = {
  elem: 402,
  mid: 206,
  high: 132,
  special: 11,
};

export const OFFICIAL_STUDENTS_BY_LEVEL: Record<SchoolLevel, number> = {
  elem: 70524,
  mid: 46907,
  high: 47206,
  special: 1321,
};

export const OFFICIAL_TEACHERS_BY_LEVEL: Record<SchoolLevel, number> = {
  elem: 8116,
  mid: 4935,
  high: 5377,
  special: 482,
};

/** validate.ts tolerance for students/teachers (schools must match exactly). */
export const VALIDATE_TOLERANCE_RATIO = 0.005;

// ---------------------------------------------------------------------------
// Header mapping
// ---------------------------------------------------------------------------

/**
 * Keys readSchoolSheet needs to locate by column header label. `kediCode` is
 * the only one that actually differs by year (see HEADER_MAP below); every
 * other field resolves to the identical label in all 5 downloaded years even
 * though its column *index* shifts (162/148/149/149/149 columns in
 * 2022-2026, extra/missing columns like 학교운영상특례, 학제, KEDI 학교코드
 * shift everything after them). We therefore look columns up by name, never
 * by fixed index.
 *
 * NOTE on header flattening: the task brief describes flattening the
 * multi-row header by joining non-empty cells top-to-bottom per column with
 * '>'. We deliberately do NOT do that generic join. Rows 14-15 (the group /
 * sub-group header rows above the leaf row) are Excel *merged cells*: when
 * read via `sheet_to_json`, only the anchor (top-left) cell of each merged
 * range holds the label — every other column covered by that merge reads as
 * null. A naive top-to-bottom join would therefore attach the group label to
 * only the first column of its span and leave every other column in that
 * span unprefixed, which is both inconsistent and unnecessary: the leaf row
 * alone (row 16 in 2024-2026, row 14 in 2022-2023 — detected dynamically,
 * see kess-xlsx.ts) already has a fully unique, descriptive label for every
 * one of the 148-162 columns in every year we downloaded (e.g. grade-level
 * student counts are already "1학년_학생수_계", not just "계"). We match
 * against that leaf row directly, after stripping all whitespace (the xlsx
 * embeds literal \r\n inside several header cells, e.g. "학교코드\r\n(KEDI)").
 */
export interface HeaderLabels {
  sido: string;
  regionName: string;
  level: string;
  name: string;
  kediCode?: string;
  branch: string;
  status: string;
  areaType: string;
  address: string;
  students: string;
  classes: string;
  teachers: string;
  staff: string;
  entrants: string;
  graduates: string;
  specialClasses: string;
  specialStudents: string;
  classroomGeneral: string;
  classroomSubject: string;
  classroomSpecial: string;
  classroomLeveled: string;
  classroomOther: string;
  siteArea: string;
}

const COMMON_HEADER_LABELS: Omit<HeaderLabels, "kediCode"> = {
  sido: "시도",
  regionName: "행정구",
  level: "학교급",
  name: "학교명",
  branch: "본분교",
  status: "상태",
  areaType: "지역규모",
  address: "주소",
  students: "학생수_총계_계",
  classes: "편성학급수_계", // == 일반학급_학급수 + 특수학급_학급수, verified on real 2026 rows
  teachers: "교원수_총계_계",
  staff: "전체직원_계",
  entrants: "입학자_계",
  graduates: "졸업자_계",
  specialClasses: "특수학급_학급수",
  specialStudents: "특수학급_학생수_계",
  classroomGeneral: "일반교실",
  classroomSubject: "교과교실",
  classroomSpecial: "특별교실",
  classroomLeveled: "수준별교실",
  classroomOther: "기타교실",
  siteArea: "교지면적",
};

/**
 * 학교코드(KEDI) column presence/label by year (empirically confirmed):
 *  - 2022, 2023: column does not exist (SchoolRow.kediCode stays undefined).
 *  - 2024: labeled "KEDI학교코드".
 *  - 2025, 2026: labeled "학교코드\r\n(KEDI)" (normalizes to "학교코드(KEDI)").
 * The task brief guessed "KEDI 코드, 2026부터" — the real files show it
 * starting a year earlier, in 2024.
 */
export const HEADER_MAP: Record<number, HeaderLabels> = {
  2022: { ...COMMON_HEADER_LABELS },
  2023: { ...COMMON_HEADER_LABELS },
  2024: { ...COMMON_HEADER_LABELS, kediCode: "KEDI학교코드" },
  2025: { ...COMMON_HEADER_LABELS, kediCode: "학교코드(KEDI)" },
  2026: { ...COMMON_HEADER_LABELS, kediCode: "학교코드(KEDI)" },
};
