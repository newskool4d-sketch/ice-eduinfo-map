import { ACTIVE_PROFILE } from "../profiles";
import type { EducationIssue } from "./types";

/** Policy questions belong to the selected regional profile. */
export const POLICY_SOURCE = ACTIVE_PROFILE.policy.source;
export const EDUCATION_ISSUES = ACTIVE_PROFILE.policy.issues;
export const PUBLISHED_ISSUES = EDUCATION_ISSUES.filter((issue) => issue.status === "published");
export const ISSUE_IDS = PUBLISHED_ISSUES.map((issue) => issue.id);
export const ISSUE_METRICS = PUBLISHED_ISSUES.flatMap((issue) => issue.metrics);
export function issueById(id: string | null) {
  return PUBLISHED_ISSUES.find((issue) => issue.id === id) ?? null;
}
export function resolveIssueMetric(issue: EducationIssue, metric: string | null) {
  return metric && issue.metrics.includes(metric) ? metric : issue.metrics[0];
}
export const METRIC_LABELS: Record<string, string> = {
  "school-size": "학교 규모 구간",
  designation: "인구감소지역 지정",
  "student-change": "학생수 증감률",
  "small-share": "소규모학교 비율",
  "zero-entrants": "신입생 0명 학교 수",
  "special-classes": "일반학교 특수학급 수",
  "special-students": "일반학교 특수학급 학생수",
  "special-schools": "특수학교 수",
  "unused-count": "미활용 폐교 수",
  "unused-share": "미활용 폐교 비율",
};
