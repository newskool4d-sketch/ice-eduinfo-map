/**
 * Display labels/order for the 4 IndicatorGroup values, used by
 * IndicatorPicker (and any future KPI grouping). Pure TS, no React import.
 */
import { ACTIVE_PROFILE } from "../profiles";
import type { IndicatorGroup } from "./types";

const BASE_GROUP_LABELS: Record<IndicatorGroup, string> = {
  scale: "규모",
  smallSchool: "소규모·통폐합",
  teacherInfra: "교원·인프라",
  vulnerable: "취약·특수",
};

/** Incheon has no consolidation indicator in this group, only school size. */
export const GROUP_LABELS: Record<IndicatorGroup, string> = ACTIVE_PROFILE.id === "incheon"
  ? { ...BASE_GROUP_LABELS, smallSchool: "소규모학교" }
  : BASE_GROUP_LABELS;

export const GROUP_ORDER: IndicatorGroup[] = ["scale", "smallSchool", "teacherInfra", "vulnerable"];

/**
 * Toolbar quick-topic shortcuts, [label, indicator or issue id]. Also names the
 * topic in the "current view" line, so both read from this one list.
 */
export const QUICK_TOPICS = [
  ["학생 분포", "students_total"],
  ["교육여건", "students_per_class"],
  ["작은학교", "small_schools"],
  ["특수교육", "special-education"],
  ["지역 변화", "students_change_5y"],
] as const;

export const QUICK_TOPIC_LABELS: Readonly<Record<string, string>> = Object.fromEntries(
  QUICK_TOPICS.map(([label, id]) => [id, label]),
);
