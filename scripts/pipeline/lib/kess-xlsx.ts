/**
 * Reads the KESS "학교별 주요통계" sheet out of a downloaded xlsx buffer and
 * normalizes it into SchoolRow objects (전북 rows only, 4 core 학교급 only).
 *
 * See scripts/pipeline/sources.ts for why column lookup is name-based (via
 * the leaf header row only, not a generic multi-row flatten) and for the
 * INCLUDED_STATUSES / school-count derivation this module's output feeds.
 */
import * as XLSX from "xlsx";
import type { SchoolLevel } from "../../../src/lib/indicators/types";
import {
  type AreaType,
  type HeaderLabels,
  HEADER_MAP,
  KESS_SHEET_NAME,
  LEVEL_MAP,
  normalizeAreaType,
  normalizeStatus,
  regionCodeForName,
  type SchoolStatus,
} from "../sources";

export interface SchoolRow {
  regionCode: string;
  level: SchoolLevel;
  name: string;
  kediCode?: string;
  /** true for 분교장 rows. */
  branch: boolean;
  /** 1 for 본교, 0 for 분교장 — the flag schools_total's `isMain` predicate reads. */
  isMain: 0 | 1;
  status: SchoolStatus;
  areaType: AreaType;
  address: string;
  students: number | null;
  classes: number | null;
  teachers: number | null;
  staff: number | null;
  entrants: number | null;
  graduates: number | null;
  specialClasses: number | null;
  specialStudents: number | null;
  /** Sum of the 5 교실 columns (일반+교과+특별+수준별+기타). */
  classrooms: number | null;
  siteArea: number | null;
}

export interface ReadSchoolSheetResult {
  referenceDate: string;
  rows: SchoolRow[];
  dropped: Record<string, number>;
}

const norm = (value: unknown): string => (value == null ? "" : String(value).replace(/\s+/g, ""));

/** '-'/'－'/blank -> null (never 0); everything else parsed as a plain number. */
function parseNumeric(raw: unknown): number | null {
  if (raw == null) return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  const s = String(raw).trim();
  if (s === "" || s === "-" || s === "－") return null;
  const n = Number(s.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

/** Sums a set of nullable numbers, treating null as 0 — but returns null if every value was null. */
function sumNullable(values: (number | null)[]): number | null {
  const present = values.filter((v): v is number => v != null);
  if (present.length === 0) return null;
  return present.reduce((a, b) => a + b, 0);
}

const REFERENCE_DATE_RE = /조사\s*기준일\s*:\s*(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\./;

/** Scans the note rows above the header for "조사 기준일 : YYYY. M. D." and returns ISO YYYY-MM-DD. */
function findReferenceDate(rows: unknown[][]): string {
  const scanLimit = Math.min(rows.length, 20);
  for (let i = 0; i < scanLimit; i++) {
    const cell = rows[i]?.[0];
    if (typeof cell !== "string") continue;
    const match = REFERENCE_DATE_RE.exec(cell);
    if (match) {
      const [, y, mo, d] = match;
      return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
    }
  }
  throw new Error("조사 기준일 note not found in the first 20 rows of the sheet");
}

/** The leaf header row is detected dynamically: column 1 = '시도', column 4 = '학교급' in every year seen. */
function findHeaderRowIndex(rows: unknown[][]): number {
  const idx = rows.findIndex((r) => norm(r?.[1]) === "시도" && norm(r?.[4]) === "학교급");
  if (idx === -1) {
    throw new Error("Could not locate the header row (expected column 1='시도', column 4='학교급')");
  }
  return idx;
}

function buildColumnResolver(headerRow: unknown[]): (label: string) => number {
  const normalized = headerRow.map((h) => norm(h));
  return (label: string) => normalized.indexOf(norm(label));
}

export function readSchoolSheet(buffer: Buffer, year: number): ReadSchoolSheetResult {
  const labels = HEADER_MAP[year];
  if (!labels) {
    throw new Error(`No HEADER_MAP entry for year ${year}. Add one in scripts/pipeline/sources.ts.`);
  }

  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheet = workbook.Sheets[KESS_SHEET_NAME];
  if (!sheet) {
    throw new Error(`Sheet "${KESS_SHEET_NAME}" not found. Sheets present: ${workbook.SheetNames.join(", ")}`);
  }
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: true }) as unknown[][];

  const referenceDate = findReferenceDate(rows);
  const headerRowIdx = findHeaderRowIndex(rows);
  const resolve = buildColumnResolver(rows[headerRowIdx]);

  const col = {
    sido: resolve(labels.sido),
    regionName: resolve(labels.regionName),
    level: resolve(labels.level),
    name: resolve(labels.name),
    kediCode: labels.kediCode ? resolve(labels.kediCode) : -1,
    branch: resolve(labels.branch),
    status: resolve(labels.status),
    areaType: resolve(labels.areaType),
    address: resolve(labels.address),
    students: resolve(labels.students),
    classes: resolve(labels.classes),
    teachers: resolve(labels.teachers),
    staff: resolve(labels.staff),
    entrants: resolve(labels.entrants),
    graduates: resolve(labels.graduates),
    specialClasses: resolve(labels.specialClasses),
    specialStudents: resolve(labels.specialStudents),
    classroomGeneral: resolve(labels.classroomGeneral),
    classroomSubject: resolve(labels.classroomSubject),
    classroomSpecial: resolve(labels.classroomSpecial),
    classroomLeveled: resolve(labels.classroomLeveled),
    classroomOther: resolve(labels.classroomOther),
    siteArea: resolve(labels.siteArea),
  } as const;

  for (const [key, index] of Object.entries(col)) {
    if (key === "kediCode") {
      if (labels.kediCode !== undefined && index === -1) {
        throw new Error(`Column for "kediCode" (label ${JSON.stringify(labels.kediCode)}) not found in year ${year}`);
      }
      continue;
    }
    if (index === -1) {
      const label = labels[key as keyof HeaderLabels];
      throw new Error(`Column for "${key}" (label ${JSON.stringify(label)}) not found in year ${year} header row`);
    }
  }

  const dropped: Record<string, number> = {};
  const bump = (key: string): void => {
    dropped[key] = (dropped[key] ?? 0) + 1;
  };

  const schoolRows: SchoolRow[] = [];

  for (let i = headerRowIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row[col.sido] == null) continue; // trailing blank row

    const sido = String(row[col.sido]);
    if (sido !== "전북") {
      bump("region:non-jb");
      continue;
    }

    const levelRaw = String(row[col.level] ?? "");
    const level = LEVEL_MAP[levelRaw];
    if (!level) {
      bump(`level:${levelRaw}`);
      continue;
    }

    const regionCode = regionCodeForName(String(row[col.regionName] ?? ""));

    const branchRaw = String(row[col.branch] ?? "");
    if (branchRaw !== "본교" && branchRaw !== "분교장") {
      throw new Error(`Unmapped 본분교 value: ${JSON.stringify(branchRaw)} (school: ${row[col.name]})`);
    }
    const isMain: 0 | 1 = branchRaw === "본교" ? 1 : 0;
    const branch = branchRaw === "분교장";

    const status = normalizeStatus(String(row[col.status] ?? ""));
    const areaType = normalizeAreaType(String(row[col.areaType] ?? ""));

    const numeric = (index: number, field: string): number | null => {
      const value = parseNumeric(row[index]);
      if (value === null) bump(`null:${field}`);
      return value;
    };

    const kediCodeRaw = col.kediCode >= 0 ? row[col.kediCode] : null;
    const classrooms = sumNullable([
      parseNumeric(row[col.classroomGeneral]),
      parseNumeric(row[col.classroomSubject]),
      parseNumeric(row[col.classroomSpecial]),
      parseNumeric(row[col.classroomLeveled]),
      parseNumeric(row[col.classroomOther]),
    ]);
    if (classrooms === null) bump("null:classrooms");

    schoolRows.push({
      regionCode,
      level,
      name: String(row[col.name] ?? ""),
      kediCode: kediCodeRaw != null && kediCodeRaw !== "" ? String(kediCodeRaw) : undefined,
      branch,
      isMain,
      status,
      areaType,
      address: String(row[col.address] ?? ""),
      students: numeric(col.students, "students"),
      classes: numeric(col.classes, "classes"),
      teachers: numeric(col.teachers, "teachers"),
      staff: numeric(col.staff, "staff"),
      entrants: numeric(col.entrants, "entrants"),
      graduates: numeric(col.graduates, "graduates"),
      specialClasses: numeric(col.specialClasses, "specialClasses"),
      specialStudents: numeric(col.specialStudents, "specialStudents"),
      classrooms,
      siteArea: numeric(col.siteArea, "siteArea"),
    });
  }

  return { referenceDate, rows: schoolRows, dropped };
}
