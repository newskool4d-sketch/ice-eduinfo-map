export const HISTORY_YEARS = [2022, 2023, 2024, 2025, 2026] as const;
export const HISTORY_LEVELS = { all: "전체 학교급", elem: "초등학교", mid: "중학교", high: "고등학교", special: "특수학교" } as const;
export type HistoryLevel = keyof typeof HISTORY_LEVELS;
export type HistorySchoolLevel = Exclude<HistoryLevel, "all">;
export const HISTORY_METRICS = {
  students: { label: "학생 수", unit: "명" },
  teachers: { label: "교원 수", unit: "명" },
  classes: { label: "학급 수", unit: "개" },
  schools: { label: "본교 수", unit: "교" },
  studentsPerClass: { label: "학급당 학생 수", unit: "명" },
  studentsPerTeacher: { label: "교원 1인당 학생 수", unit: "명" },
} as const;
export type HistoryMetric = keyof typeof HISTORY_METRICS;
export type HistoryValues = Record<HistoryMetric, number | null>;
export type HistoryPoint = HistoryValues & { year: number };
export interface HistoryReview {
  status: "matched" | "address_normalized" | "renamed" | "before_opening" | "unresolved";
  note: string;
  sourceRow?: number;
  sourceName?: string;
  evidenceUrl?: string;
}
export interface IncheonHistory {
  years: number[];
  source: { url: string; name: string };
  province: HistoryPoint[];
  regions: Record<string, HistoryPoint[]>;
  byLevel?: Record<HistorySchoolLevel, { province: HistoryPoint[]; regions: Record<string, HistoryPoint[]> }>;
  schools: Record<string, { points: HistoryPoint[]; methods: Record<string, string>; reviews?: Record<string, HistoryReview> }>;
  quality: { status: "PARTIAL"; note: string };
}
/** Missing/zero denominators are not evidence of zero growth. */
export function historyChange(current: number | null, previous: number | null) {
  const difference = current === null || previous === null ? null : current - previous;
  return { difference, percent: difference === null || previous === 0 || previous === null ? null : difference / previous * 100 };
}
