/**
 * Display labels/order for the 4 IndicatorGroup values, used by
 * IndicatorPicker (and any future KPI grouping). Pure TS, no React import.
 */
import type { IndicatorGroup } from "./types";

export const GROUP_LABELS: Record<IndicatorGroup, string> = {
  scale: "규모",
  smallSchool: "소규모·통폐합",
  teacherInfra: "교원·인프라",
  vulnerable: "취약·특수",
};

export const GROUP_ORDER: IndicatorGroup[] = ["scale", "smallSchool", "teacherInfra", "vulnerable"];
