/**
 * Location-CSV parsing + KESS<->location matching for build-schools.ts. Pure
 * functions only (no fs/path) so tests/pipeline/build-schools.test.ts can
 * exercise every stage of the matcher against small fixtures without
 * touching disk. See scripts/pipeline/build-schools.ts for the CLI entry
 * point that reads the real files and writes public/data/schools.json +
 * data/interim/schools-match-report.json.
 */
import type { SchoolLevel } from "../../../src/lib/indicators/types";
import type { School } from "../../../src/lib/schools/types";
import { parseCsv } from "./csv";
import type { SchoolRow } from "./kess-xlsx";
import {
  INCLUDED_STATUSES,
  LEVEL_MAP,
  LOCATION_SOURCE_LEVELS,
  REGION_TABLE,
  SMALL_SCHOOL_MAX_STUDENTS,
  type SchoolStatus,
} from "../sources";

// ---------------------------------------------------------------------------
// Location CSV parsing
// ---------------------------------------------------------------------------

export interface LocationRow {
  id: string;
  name: string;
  /** Raw 학교급구분 cell, kept for reporting even though `level` is what matching uses. */
  levelRaw: string;
  level: SchoolLevel;
  /** true for 본교분교구분 === '분교'. */
  branch: boolean;
  /** Raw 운영상태 cell, preserved verbatim (the real file only ever has '운영', but nothing here assumes that). */
  status: string;
  /** 소재지도로명주소, falling back to 소재지지번주소 when the road address is blank. */
  address: string;
  lat: number;
  lng: number;
  /** Always a known REGION_TABLE code — rows whose address didn't parse to one are reported separately (see RegionParseFailure) and never appear here. */
  regionCode: string;
}

export interface RegionParseFailure {
  id: string;
  name: string;
  address: string;
}

export interface ParseLocationCsvResult {
  rows: LocationRow[];
  regionParseFailures: RegionParseFailure[];
}

const REGION_NAME_TO_CODE = new Map(REGION_TABLE.map((r) => [r.name, r.code]));

/** `전북특별자치도 무주군 무주읍 ...` -> `52730` (the token right after the 시도 prefix). Matches both the current `전북특별자치도` spelling and the legacy `전라북도` one — see the brief: "전라북도교육청 표기는 0행이지만 필터는 둘 다 허용". Returns null when the address doesn't start with a 전북 시도 prefix or the following token isn't one of the 14 시군 names. */
export function regionCodeFromAddress(address: string): string | null {
  const match = /^(?:전북특별자치도|전라북도)\s+(\S+)/.exec(address.trim());
  if (!match) return null;
  return REGION_NAME_TO_CODE.get(match[1]) ?? null;
}

/** True for a `시도교육청코드`/`시도교육청명` pair that identifies a 전북 row — accepts both the current code (8321000) and either 시도교육청명 spelling, per the brief's note that both must be tolerated even though the real 2026 file only ever uses `전북특별자치도교육청`. */
function isJeonbukRow(sidoCode: string, sidoName: string): boolean {
  return sidoCode === "8321000" || sidoName.includes("전북") || sidoName.includes("전라북도");
}

const LOCATION_CSV_COLUMNS = [
  "학교ID",
  "학교명",
  "학교급구분",
  "설립일자",
  "설립형태",
  "본교분교구분",
  "운영상태",
  "소재지지번주소",
  "소재지도로명주소",
  "시도교육청코드",
  "시도교육청명",
  "교육지원청코드",
  "교육지원청명",
  "생성일자",
  "변경일자",
  "위도",
  "경도",
  "데이터기준일자",
] as const;

/**
 * Parses the full national location CSV text (BOM + quoting handled by
 * `parseCsv`), filters to 전북 rows in the 4 core 학교급 (via the shared
 * `LEVEL_MAP` from sources.ts — reused as-is rather than a redefined 3-entry
 * map, so a future refresh of this source that starts including 특수학교
 * rows is picked up automatically), and assigns each a 시군 `regionCode`
 * parsed from its address. Rows whose address doesn't resolve to one of the
 * 14 시군 are NOT included in `rows` — they're reported separately in
 * `regionParseFailures` (matchSchools never sees them: there's no key to
 * match on without a region).
 */
export function parseLocationCsv(csvText: string): ParseLocationCsvResult {
  const table = parseCsv(csvText);
  if (table.length === 0) return { rows: [], regionParseFailures: [] };

  const header = table[0].map((h) => h.trim());
  const col = Object.fromEntries(LOCATION_CSV_COLUMNS.map((name) => [name, header.indexOf(name)])) as Record<
    (typeof LOCATION_CSV_COLUMNS)[number],
    number
  >;
  for (const name of LOCATION_CSV_COLUMNS) {
    if (col[name] === -1) {
      throw new Error(`위치 CSV 헤더에서 "${name}" 컬럼을 찾을 수 없습니다`);
    }
  }

  const rows: LocationRow[] = [];
  const regionParseFailures: RegionParseFailure[] = [];

  for (let i = 1; i < table.length; i++) {
    const raw = table[i];
    if (raw.length === 1 && raw[0] === "") continue; // trailing blank line

    const sidoCode = raw[col["시도교육청코드"]] ?? "";
    const sidoName = raw[col["시도교육청명"]] ?? "";
    if (!isJeonbukRow(sidoCode, sidoName)) continue;

    const levelRaw = raw[col["학교급구분"]] ?? "";
    const level = LEVEL_MAP[levelRaw];
    if (!level) continue; // e.g. a future 특수학교 row this dataset doesn't carry today — see module doc comment

    const id = raw[col["학교ID"]] ?? "";
    const name = raw[col["학교명"]] ?? "";
    const roadAddress = (raw[col["소재지도로명주소"]] ?? "").trim();
    const jibunAddress = (raw[col["소재지지번주소"]] ?? "").trim();
    const address = roadAddress || jibunAddress;

    const regionCode = regionCodeFromAddress(address);
    if (!regionCode) {
      regionParseFailures.push({ id, name, address });
      continue;
    }

    rows.push({
      id,
      name,
      levelRaw,
      level,
      branch: (raw[col["본교분교구분"]] ?? "") === "분교",
      status: raw[col["운영상태"]] ?? "",
      address,
      lat: Number(raw[col["위도"]]),
      lng: Number(raw[col["경도"]]),
      regionCode,
    });
  }

  return { rows, regionParseFailures };
}

// ---------------------------------------------------------------------------
// Name normalization + matching
// ---------------------------------------------------------------------------

/** Strips whitespace, the middle dot(·), and parenthesis characters — the brief's "공백·`·`·괄호 제거" normalization. */
export function normalizeSchoolName(name: string): string {
  return name.replace(/[\s·()（）]/g, "");
}

const LEVEL_SUFFIXES = ["초등학교", "중학교", "고등학교"] as const;

/** Removes a trailing 학교급 suffix (초등학교/중학교/고등학교) from an already-normalized name, if present; returns the name unchanged otherwise. Used for the 2차 (suffix-stripped) match stage. */
export function stripLevelSuffix(normalizedName: string): string {
  for (const suffix of LEVEL_SUFFIXES) {
    if (normalizedName.endsWith(suffix)) return normalizedName.slice(0, -suffix.length);
  }
  return normalizedName;
}

function matchKey(name: string, regionCode: string, level: SchoolLevel, branch: boolean): string {
  return `${name}|${regionCode}|${level}|${branch}`;
}

export type MatchStage = "exact" | "suffix" | "alias";

export interface MatchedSchool {
  location: LocationRow;
  kess: SchoolRow;
  stage: MatchStage;
}

export interface AmbiguousMatch {
  kess: SchoolRow;
  stage: "exact" | "suffix";
  candidateIds: string[];
}

export interface MatchSchoolsResult {
  matched: MatchedSchool[];
  unmatchedKess: SchoolRow[];
  unmatchedLocation: LocationRow[];
  ambiguous: AmbiguousMatch[];
}

/**
 * Matches KESS rows to location rows: 1차 exact normalized-name+region+level+branch
 * key, 2차 the same key with the 학교급 suffix stripped from both sides, 3차
 * a manual `data/manual/school-aliases.json` lookup (`"kessName|regionCode": "학교ID"`).
 * `branch` is part of every key (not just level) so a KESS 분교장 row can
 * never match a location 본교 row of the same base name, or vice versa —
 * see the brief: "분교장은 KESS branch 와 위치 본교분교구분 을 함께 써서
 * 본교와 섞이지 않게".
 *
 * Every KESS row's candidate location row(s) are looked up against the FULL
 * location index (never excluding rows other KESS rows have already
 * claimed) specifically so that two KESS rows independently resolving to
 * the SAME location row is *detected*, not silently masked by whichever one
 * happened to be processed first exhausting the only candidate. Any such
 * double claim throws — "한 위치 행이 두 KESS 행에 매칭되면 오류" (the
 * brief's literal requirement) — since it always means either a genuine
 * KESS data duplicate or a matcher bug, never a legitimate 1:N mapping (a
 * school has exactly one location row). A key with 2+ location candidates
 * (ambiguous — no way to pick one without guessing) is reported separately
 * in `ambiguous` and treated as unmatched, rather than thrown: it's a
 * "we don't have enough information", not "we have contradictory
 * information", situation.
 */
export function matchSchools(
  locationRows: LocationRow[],
  kessRows: SchoolRow[],
  aliases: Record<string, string>,
): MatchSchoolsResult {
  const byExactKey = new Map<string, LocationRow[]>();
  const byStrippedKey = new Map<string, LocationRow[]>();
  const byId = new Map<string, LocationRow>();

  const bucket = (map: Map<string, LocationRow[]>, key: string, row: LocationRow): void => {
    const list = map.get(key);
    if (list) list.push(row);
    else map.set(key, [row]);
  };

  for (const loc of locationRows) {
    byId.set(loc.id, loc);
    const norm = normalizeSchoolName(loc.name);
    bucket(byExactKey, matchKey(norm, loc.regionCode, loc.level, loc.branch), loc);
    bucket(byStrippedKey, matchKey(stripLevelSuffix(norm), loc.regionCode, loc.level, loc.branch), loc);
  }

  const claims = new Map<string, { kess: SchoolRow; stage: MatchStage }[]>();
  const claim = (locationId: string, kess: SchoolRow, stage: MatchStage): void => {
    const list = claims.get(locationId);
    if (list) list.push({ kess, stage });
    else claims.set(locationId, [{ kess, stage }]);
  };

  const unmatchedKess: SchoolRow[] = [];
  const ambiguous: AmbiguousMatch[] = [];

  for (const kess of kessRows) {
    const norm = normalizeSchoolName(kess.name);

    const exactCandidates = byExactKey.get(matchKey(norm, kess.regionCode, kess.level, kess.branch)) ?? [];
    if (exactCandidates.length === 1) {
      claim(exactCandidates[0].id, kess, "exact");
      continue;
    }
    if (exactCandidates.length > 1) {
      ambiguous.push({ kess, stage: "exact", candidateIds: exactCandidates.map((c) => c.id) });
      continue;
    }

    const strippedKey = matchKey(stripLevelSuffix(norm), kess.regionCode, kess.level, kess.branch);
    const strippedCandidates = byStrippedKey.get(strippedKey) ?? [];
    if (strippedCandidates.length === 1) {
      claim(strippedCandidates[0].id, kess, "suffix");
      continue;
    }
    if (strippedCandidates.length > 1) {
      ambiguous.push({ kess, stage: "suffix", candidateIds: strippedCandidates.map((c) => c.id) });
      continue;
    }

    const aliasId = aliases[`${kess.name}|${kess.regionCode}`];
    if (aliasId !== undefined) {
      if (!byId.has(aliasId)) {
        throw new Error(
          `school-aliases.json: "${kess.name}|${kess.regionCode}" -> 학교ID ${JSON.stringify(aliasId)} 가 위치 CSV 전북 행에 없습니다`,
        );
      }
      claim(aliasId, kess, "alias");
      continue;
    }

    unmatchedKess.push(kess);
  }

  const doubleClaims = [...claims.entries()].filter(([, list]) => list.length > 1);
  if (doubleClaims.length > 0) {
    const detail = doubleClaims
      .map(([locationId, list]) => {
        const loc = byId.get(locationId);
        const kessDesc = list
          .map((l) => `${l.kess.name}(${l.kess.regionCode}/${l.kess.level}, ${l.stage}단계)`)
          .join(", ");
        return `위치 학교ID ${locationId}(${loc?.name ?? "?"}) <- KESS [${kessDesc}]`;
      })
      .join(" | ");
    throw new Error(`matchSchools: 한 위치 행이 여러 KESS 행에 매칭되었습니다 — ${detail}`);
  }

  const matched: MatchedSchool[] = [...claims.entries()].map(([locationId, list]) => ({
    location: byId.get(locationId)!,
    kess: list[0].kess,
    stage: list[0].stage,
  }));

  const matchedLocationIds = new Set(matched.map((m) => m.location.id));
  const unmatchedLocation = locationRows.filter((r) => !matchedLocationIds.has(r.id));

  return { matched, unmatchedKess, unmatchedLocation, ambiguous };
}

/** KESS rows the school layer/panel actually cares about: the 4 core 학교급, 본교+분교장, excluding only 폐교 — see sources.ts's INCLUDED_STATUSES doc comment for the derivation. */
export function includedKessRows(rows: SchoolRow[]): SchoolRow[] {
  const included: readonly SchoolStatus[] = INCLUDED_STATUSES;
  return rows.filter((r) => included.includes(r.status));
}

/**
 * Splits `matchSchools()`'s `unmatchedKess` into two structurally different
 * cases (fix-round-1 ruling — see task-4B-report.md):
 *  - `genuinelyUnmatched`: the row's 학교급 IS covered by the location
 *    source, so a location row could in principle have matched it — this
 *    really is a matching failure. Expected to be empty against the real
 *    2026-03-20 data (every 초/중/고 KESS row matches); validate.ts requires
 *    it to stay empty.
 *  - `noLocationSource`: the row's 학교급 isn't in `sourceLevels` at all
 *    (currently: 특수학교) — there is no location row it COULD have matched,
 *    so this isn't a matching failure. These still get a schools.json entry
 *    (via `buildNoLocationSchoolRecord`), just without coordinates.
 */
export function partitionUnmatched(
  unmatchedKess: SchoolRow[],
  sourceLevels: readonly SchoolLevel[] = LOCATION_SOURCE_LEVELS,
): { genuinelyUnmatched: SchoolRow[]; noLocationSource: SchoolRow[] } {
  const covered = new Set<SchoolLevel>(sourceLevels);
  const genuinelyUnmatched: SchoolRow[] = [];
  const noLocationSource: SchoolRow[] = [];
  for (const kess of unmatchedKess) {
    (covered.has(kess.level) ? genuinelyUnmatched : noLocationSource).push(kess);
  }
  return { genuinelyUnmatched, noLocationSource };
}

// ---------------------------------------------------------------------------
// schools.json row shape (School itself is defined in src/lib/schools/types.ts
// — this pipeline is a producer of that shape, not its owner; see that
// file's doc comment).
// ---------------------------------------------------------------------------

export type { School } from "../../../src/lib/schools/types";

const round5 = (n: number): number => Math.round(n * 1e5) / 1e5;
const round2 = (n: number): number => Math.round(n * 1e2) / 1e2;

/**
 * Builds one schools.json row from a matched (location, KESS) pair.
 * `name`/`level`/`branch`/stats all come from the KESS side (the
 * "official" educational-statistics identity the rest of this dashboard
 * already uses — every indicator is KESS-sourced); `id`/`lat`/`lng` come
 * from the location side (KESS carries no coordinates at all); `status`
 * (운영상태) also comes from the location side — it is NOT the same field as
 * KESS's own 상태 (기존/신설/휴교/폐교), see the brief's example schools.json
 * (`"status": "운영"`, the location CSV's literal value, never one of the
 * KESS short codes).
 */
export function buildSchoolRecord({ location, kess }: MatchedSchool): School {
  const studentsPerClass =
    kess.students != null && kess.classes != null && kess.classes > 0 ? round2(kess.students / kess.classes) : null;

  const record: School = {
    id: location.id,
    name: kess.name,
    level: kess.level,
    status: location.status,
    branch: kess.branch,
    lat: round5(location.lat),
    lng: round5(location.lng),
    regionCode: kess.regionCode,
    students: kess.students,
    classes: kess.classes,
    teachers: kess.teachers,
    studentsPerClass,
    // Per-row smallness (students <= threshold), independent of the
    // isMain-gated `PREDICATES.small` used by the small_schools/
    // small_school_share aggregate indicators — a 분교장 row can still be
    // individually "소규모" for display purposes even though it doesn't
    // count toward the aggregate's 학교수 denominator.
    small: kess.students != null && kess.students <= SMALL_SCHOOL_MAX_STUDENTS,
  };
  if (kess.kediCode) record.kediCode = kess.kediCode;
  return record;
}

/** `kedi:<kediCode>` when the KESS row has one (every current 특수학교 row does); otherwise a deterministic fallback derived from the row's own key fields — still stable across pipeline runs, just not as short/recognizable as a real KEDI code. */
function syntheticNoLocationId(kess: SchoolRow): string {
  return `no-loc:${kess.regionCode}:${normalizeSchoolName(kess.name)}:${kess.level}:${kess.branch}`;
}

/**
 * Builds a schools.json row for a KESS row whose 학교급 the location source
 * doesn't cover at all (fix-round-1 ruling — `partitionUnmatched`'s
 * `noLocationSource` bucket, currently only 특수학교). Carries every KESS
 * stat through exactly like `buildSchoolRecord`, but:
 *  - `lat`/`lng` are null (no location row exists to take coordinates from)
 *  - `status` falls back to the KESS row's own 상태 (기존/신설/휴교) instead
 *    of a location row's 운영상태 — it's the only status this row has
 *  - `id` prefers `kedi:<kediCode>` (stable, already unique) over the
 *    synthetic fallback, which only fires for the rare KESS row with no
 *    kediCode at all (2022/2023 rows never carried one — see kess-xlsx.ts)
 *  - `locationMissingReason` is set (and only ever set for a row like this)
 */
export function buildNoLocationSchoolRecord(kess: SchoolRow, reason: string): School {
  const studentsPerClass =
    kess.students != null && kess.classes != null && kess.classes > 0 ? round2(kess.students / kess.classes) : null;

  const record: School = {
    id: kess.kediCode ? `kedi:${kess.kediCode}` : syntheticNoLocationId(kess),
    name: kess.name,
    level: kess.level,
    status: kess.status,
    branch: kess.branch,
    lat: null,
    lng: null,
    regionCode: kess.regionCode,
    students: kess.students,
    classes: kess.classes,
    teachers: kess.teachers,
    studentsPerClass,
    small: kess.students != null && kess.students <= SMALL_SCHOOL_MAX_STUDENTS,
    locationMissingReason: reason,
  };
  if (kess.kediCode) record.kediCode = kess.kediCode;
  return record;
}

// ---------------------------------------------------------------------------
// Match report
// ---------------------------------------------------------------------------

export interface MatchReportKessRow {
  name: string;
  regionCode: string;
  level: SchoolLevel;
  branch: boolean;
  status: SchoolStatus;
}

export interface MatchReportLocationRow {
  id: string;
  name: string;
  levelRaw: string;
  regionCode: string;
  branch: boolean;
  status: string;
  /** The status of the KESS row with the same (name, region, level, branch) key, if one exists in the FULL (not status-filtered) KESS row set — e.g. "폐교" when this location row is still listed as 운영 but KESS already dropped it. null when no such KESS row exists at all. */
  kessStatus: SchoolStatus | null;
}

export interface SchoolsMatchReport {
  /** 학교급 the location source covers — mirrors sources.ts's LOCATION_SOURCE_LEVELS. */
  locationSourceLevels: SchoolLevel[];
  /** matched / totalKessIncluded, computed ONLY over locationSourceLevels — validate.ts requires this to be exactly 1 (100%; fix-round-1 ruling). */
  matchRate: number;
  /** KESS included rows whose 학교급 IS in locationSourceLevels — the only rows a location match was ever possible for. */
  totalKessIncluded: number;
  /** All KESS included rows, every 학교급 (= totalKessIncluded + noLocationSource.length) — kept for context/transparency. */
  totalKessAll: number;
  matchedCount: number;
  byStage: Record<MatchStage, number>;
  /** Genuine match failures within locationSourceLevels — expected empty against real data. */
  unmatchedKess: MatchReportKessRow[];
  /** KESS rows whose 학교급 the location source doesn't cover at all (currently 특수학교) — not a matching failure, see sources.ts's LOCATION_SOURCE_LEVELS doc comment. These still get a public/data/schools.json row (via buildNoLocationSchoolRecord), just without coordinates. */
  noLocationSource: MatchReportKessRow[];
  locationOnly: MatchReportLocationRow[];
  regionParseFailures: RegionParseFailure[];
  ambiguous: { kessName: string; regionCode: string; level: SchoolLevel; stage: string; candidateIds: string[] }[];
}

function findKessStatusFor(loc: LocationRow, allKessRows: SchoolRow[]): SchoolStatus | null {
  const key = matchKey(normalizeSchoolName(loc.name), loc.regionCode, loc.level, loc.branch);
  const hit = allKessRows.find((k) => matchKey(normalizeSchoolName(k.name), k.regionCode, k.level, k.branch) === key);
  return hit ? hit.status : null;
}

function toMatchReportKessRow(k: SchoolRow): MatchReportKessRow {
  return { name: k.name, regionCode: k.regionCode, level: k.level, branch: k.branch, status: k.status };
}
const byRegionThenName = <T extends { regionCode: string; name: string }>(a: T, b: T): number =>
  a.regionCode.localeCompare(b.regionCode) || a.name.localeCompare(b.name);

/**
 * Assembles data/interim/schools-match-report.json's contents from a
 * matchSchools() result. `allKessRows` (status-unfiltered) is only used to
 * annotate `locationOnly[].kessStatus`. `totalKessIncludedAll` is the FULL
 * (every 학교급) included-KESS-row count — this function subtracts the
 * partitioned `noLocationSource` count from it to get `totalKessIncluded`
 * (the covered-levels-only denominator `matchRate` uses).
 */
export function buildMatchReport(
  result: MatchSchoolsResult,
  allKessRows: SchoolRow[],
  totalKessIncludedAll: number,
  regionParseFailures: RegionParseFailure[],
): SchoolsMatchReport {
  const byStage: Record<MatchStage, number> = { exact: 0, suffix: 0, alias: 0 };
  for (const m of result.matched) byStage[m.stage]++;

  const { genuinelyUnmatched, noLocationSource } = partitionUnmatched(result.unmatchedKess);
  const totalKessIncluded = totalKessIncludedAll - noLocationSource.length;

  return {
    locationSourceLevels: [...LOCATION_SOURCE_LEVELS],
    matchRate: totalKessIncluded > 0 ? result.matched.length / totalKessIncluded : 1,
    totalKessIncluded,
    totalKessAll: totalKessIncludedAll,
    matchedCount: result.matched.length,
    byStage,
    unmatchedKess: genuinelyUnmatched.map(toMatchReportKessRow).sort(byRegionThenName),
    noLocationSource: noLocationSource.map(toMatchReportKessRow).sort(byRegionThenName),
    locationOnly: result.unmatchedLocation
      .map((r) => ({
        id: r.id,
        name: r.name,
        levelRaw: r.levelRaw,
        regionCode: r.regionCode,
        branch: r.branch,
        status: r.status,
        kessStatus: findKessStatusFor(r, allKessRows),
      }))
      .sort(byRegionThenName),
    regionParseFailures,
    ambiguous: result.ambiguous.map((a) => ({
      kessName: a.kess.name,
      regionCode: a.kess.regionCode,
      level: a.kess.level,
      stage: a.stage,
      candidateIds: a.candidateIds,
    })),
  };
}
