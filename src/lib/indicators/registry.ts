/**
 * The indicator registry: the single place that defines every KPI shown on
 * the map / dashboard, and — via `aggregate` — the exact rule the data
 * pipeline uses to turn normalized KESS school rows into 14 시군 + 전북
 * (52000) values. Adding a new "조건별 맵" indicator means adding one entry
 * here plus (if needed) one predicate in scripts/pipeline/lib/predicates.ts.
 *
 * Pure TS, no React import: this file is imported both by client components
 * and by scripts/pipeline/build-indicators.ts under tsx.
 */
import { formatArea, formatDecimal, formatInt, formatPercent } from "../format";
import type { IndicatorDef, IndicatorSource } from "./types";

const KESS_SOURCE: IndicatorSource = {
  name: "한국교육개발원 교육통계서비스(KESS) 교육기본통계 학교별 데이터셋",
  url: "https://kess.kedi.re.kr/contents/dataset",
  year: 2026,
};

export const INDICATORS: IndicatorDef[] = [
  {
    id: "students_total",
    group: "scale",
    label: "학생수",
    unit: "명",
    polarity: "neutral",
    kind: "count",
    byLevel: true,
    format: formatInt,
    source: KESS_SOURCE,
    aggregate: { kind: "sum", field: "students" },
  },
  {
    id: "schools_total",
    group: "scale",
    label: "학교수",
    unit: "교",
    polarity: "neutral",
    kind: "count",
    byLevel: true,
    format: formatInt,
    source: KESS_SOURCE,
    aggregate: { kind: "count", predicate: "isMain" },
  },
  {
    id: "classes_total",
    group: "scale",
    label: "학급수",
    unit: "학급",
    polarity: "neutral",
    kind: "count",
    format: formatInt,
    source: KESS_SOURCE,
    aggregate: { kind: "sum", field: "classes" },
  },
  {
    id: "students_per_class",
    group: "scale",
    label: "학급당 학생수",
    unit: "명/학급",
    polarity: "higherWorse",
    kind: "ratio",
    format: (v) => formatDecimal(v, 1),
    source: KESS_SOURCE,
    aggregate: { kind: "ratio", numerator: "students", denominator: "classes" },
  },
  {
    id: "teachers_total",
    group: "teacherInfra",
    label: "교원수",
    unit: "명",
    polarity: "neutral",
    kind: "count",
    // byLevel is required (not just an optional nicety): validate.ts's check
    // (3) compares 52000/<level> teacher values against the official
    // per-level figures (8,116/4,935/5,377/482), which only exist if this
    // indicator produces level-tagged rows.
    byLevel: true,
    format: formatInt,
    source: KESS_SOURCE,
    aggregate: { kind: "sum", field: "teachers" },
  },
  {
    id: "students_per_teacher",
    group: "teacherInfra",
    label: "교원 1인당 학생수",
    unit: "명",
    polarity: "higherWorse",
    kind: "ratio",
    format: (v) => formatDecimal(v, 1),
    source: KESS_SOURCE,
    aggregate: { kind: "ratio", numerator: "students", denominator: "teachers" },
  },
  {
    id: "site_area_per_student",
    group: "teacherInfra",
    label: "학생 1인당 교지면적",
    unit: "㎡",
    polarity: "higherBetter",
    kind: "ratio",
    format: formatArea,
    source: KESS_SOURCE,
    aggregate: { kind: "ratio", numerator: "siteArea", denominator: "students" },
  },
  {
    id: "classrooms_per_school",
    group: "teacherInfra",
    label: "학교당 교실수",
    unit: "실",
    polarity: "neutral",
    kind: "ratio",
    format: (v) => formatDecimal(v, 1),
    source: KESS_SOURCE,
    aggregate: { kind: "ratio", numerator: "classrooms", denominator: "isMain" },
  },
  {
    id: "small_schools",
    group: "smallSchool",
    label: "소규모학교 수",
    unit: "교",
    polarity: "higherWorse",
    kind: "count",
    format: formatInt,
    source: KESS_SOURCE,
    aggregate: { kind: "count", predicate: "small" },
  },
  {
    id: "small_school_share",
    group: "smallSchool",
    label: "소규모학교 비율",
    unit: "%",
    polarity: "higherWorse",
    kind: "ratio",
    format: (v) => formatPercent(v, 1),
    source: KESS_SOURCE,
    aggregate: { kind: "share", predicate: "small" },
  },
  {
    id: "zero_entrant_schools",
    group: "smallSchool",
    label: "신입생 0명 학교 수",
    unit: "교",
    polarity: "higherWorse",
    kind: "count",
    format: formatInt,
    source: KESS_SOURCE,
    aggregate: { kind: "count", predicate: "zeroEntrants" },
  },
  {
    id: "rural_school_share",
    group: "smallSchool",
    label: "면지역 학교 비율",
    unit: "%",
    polarity: "neutral",
    kind: "ratio",
    format: (v) => formatPercent(v, 1),
    source: KESS_SOURCE,
    aggregate: { kind: "share", predicate: "ruralArea" },
  },
  {
    id: "special_classes",
    group: "vulnerable",
    label: "특수학급 수",
    unit: "학급",
    polarity: "neutral",
    kind: "count",
    format: formatInt,
    source: KESS_SOURCE,
    aggregate: { kind: "sum", field: "specialClasses" },
  },
  {
    id: "special_students",
    group: "vulnerable",
    label: "특수학급 학생수",
    unit: "명",
    polarity: "neutral",
    kind: "count",
    format: formatInt,
    source: KESS_SOURCE,
    aggregate: { kind: "sum", field: "specialStudents" },
  },
  {
    id: "students_change_5y",
    group: "scale",
    label: "학생수 5년 증감률",
    unit: "%",
    polarity: "higherBetter",
    kind: "ratio",
    format: (v) => formatPercent(v, 1),
    source: KESS_SOURCE,
    aggregate: { kind: "external", file: "series/students_total.json", field: "change5y" },
  },
];

export const INDICATOR_IDS: string[] = INDICATORS.map((d) => d.id);

export const DEFAULT_INDICATOR_ID = "students_total";

export function indicatorById(id: string): IndicatorDef | undefined {
  return INDICATORS.find((d) => d.id === id);
}
