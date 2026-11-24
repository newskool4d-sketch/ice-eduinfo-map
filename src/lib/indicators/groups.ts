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

const INCHEON = ACTIVE_PROFILE.id === "incheon";

/**
 * Incheon names the three groups after what they hold (redesign plan §4.2):
 * 학생·학교 (students, schools, classes), 교육여건 (per-class and per-teacher
 * figures, teachers), 소규모학교. students_per_class moves to teacherInfra in
 * registry.ts for Incheon only; Jeonbuk keeps its groups and names.
 */
export const GROUP_LABELS: Record<IndicatorGroup, string> = INCHEON
  ? { ...BASE_GROUP_LABELS, scale: "학생·학교", teacherInfra: "교육여건", smallSchool: "소규모학교" }
  : BASE_GROUP_LABELS;

export const GROUP_ORDER: IndicatorGroup[] = INCHEON
  ? ["scale", "teacherInfra", "smallSchool", "vulnerable"]
  : ["scale", "smallSchool", "teacherInfra", "vulnerable"];

/**
 * Toolbar quick-topic shortcuts, [label, indicator or issue id]. Also names the
 * topic in the "current view" line, so both read from this one list. Incheon's
 * chips pick a group (its first indicator) and carry the group names.
 */
export const QUICK_TOPICS: readonly (readonly [string, string])[] = INCHEON
  ? [
      [GROUP_LABELS.scale, "students_total"],
      [GROUP_LABELS.teacherInfra, "students_per_class"],
      [GROUP_LABELS.smallSchool, "small_schools"],
    ]
  : [
      ["학생 분포", "students_total"],
      ["교육여건", "students_per_class"],
      ["작은학교", "small_schools"],
      ["특수교육", "special-education"],
      ["지역 변화", "students_change_5y"],
    ];

export const QUICK_TOPIC_LABELS: Readonly<Record<string, string>> = Object.fromEntries(
  QUICK_TOPICS.map(([label, id]) => [id, label]),
);
