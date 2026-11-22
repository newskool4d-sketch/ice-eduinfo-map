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
