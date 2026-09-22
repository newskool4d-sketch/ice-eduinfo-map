import type { DataBundle } from "../data/types";
import { REGION_CODES, regionName, type RegionCode } from "../geo/regions";
import type { School } from "../schools/types";
import { changeYearRange } from "../stats";
import { METRIC_LABELS, resolveIssueMetric } from "./registry";
import type {
  Designation,
  EducationIssue,
  EducationIssuesFile,
  IssueColor,
  IssueMapModel,
} from "./types";

export const DESIGNATION_LABELS: Record<Designation, string> = {
  decline: "인구감소지역",
  attention: "관심지역",
  none: "해당 지정 없음",
};
const MISSING: IssueColor = [170, 170, 170, 85];
const CATEGORY: Record<Designation, IssueColor> = {
  decline: [109, 91, 163, 85],
  attention: [232, 134, 90, 85],
  none: [220, 220, 220, 45],
};
const PURPLE = [
  [230, 223, 240],
  [216, 207, 233],
  [184, 169, 214],
  [146, 130, 191],
  [109, 91, 163],
];
const count = (v: number) => v.toLocaleString("ko-KR");
const strictSum = (values: (number | null)[]) =>
  values.some((v) => v === null)
    ? null
    : values.reduce<number>((sum, v) => sum + v!, 0);

export function studentChange(bundle: DataBundle, code: string): number | null {
  const series = bundle.series.students_total;
  const range = changeYearRange(series);
  if (!range || range[0] === range[1]) return null;
  const start = series.rows.find(
    (r) => r.regionCode === code && r.year === range[0],
  )?.value;
  const end = series.rows.find(
    (r) => r.regionCode === code && r.year === range[1],
  )?.value;
  return start == null || end == null || start === 0
    ? null
    : ((end - start) / start) * 100;
}

export function issueValue(
  bundle: DataBundle,
  data: EducationIssuesFile,
  metric: string,
  code: string,
): number | Designation | null {
  if (metric === "designation")
    return data.designations[code as RegionCode] ?? null;
  if (metric === "student-change") return studentChange(bundle, code);
  const rows = bundle.schools.schools.filter(
    (s) => code === "52000" || s.regionCode === code,
  );
  const main = rows.filter((s) => data.schools[s.id].isMain);
  const regular = rows.filter((s) => s.level !== "special");
  switch (metric) {
    case "small-share":
      return !main.length || main.some((s) => s.students === null)
        ? null
        : (main.filter((s) => s.students! <= 60).length / main.length) * 100;
    case "zero-entrants":
      return main.some((s) => data.schools[s.id].entrants === null)
        ? null
        : main.filter((s) => data.schools[s.id].entrants === 0).length;
    case "special-classes":
      return strictSum(regular.map((s) => data.schools[s.id].specialClasses));
    case "special-students":
      return strictSum(regular.map((s) => data.schools[s.id].specialStudents));
    case "special-schools":
      return main.filter((s) => s.level === "special").length;
    default:
      return null;
  }
}

export function formatIssueValue(
  metric: string,
  value: number | Designation | null,
): string {
  if (value === null)
    return metric === "student-change" ? "계산 불가" : "자료 없음";
  if (typeof value === "string") return DESIGNATION_LABELS[value];
  if (metric === "student-change")
    return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
  if (metric === "small-share") return `${value.toFixed(1)}%`;
  return `${count(value)}${metric === "special-classes" ? "학급" : metric === "special-students" ? "명" : "개교"}`;
}

function relatedSchool(
  school: School,
  data: EducationIssuesFile,
  metric: string,
): boolean {
  const facts = data.schools[school.id];
  if (metric === "small-share")
    return facts.isMain && school.students !== null && school.students <= 60;
  if (metric === "zero-entrants") return facts.isMain && facts.entrants === 0;
  if (metric === "special-schools")
    return facts.isMain && school.level === "special";
  if (metric === "special-classes" || metric === "special-students")
    return school.level !== "special" && (facts.specialClasses ?? 0) > 0;
  return true;
}

export function buildIssueModel(
  bundle: DataBundle,
  data: EducationIssuesFile,
  issue: EducationIssue,
  requestedMetric: string | null,
): IssueMapModel {
  const metric = resolveIssueMetric(issue, requestedMetric);
  const raw = REGION_CODES.map((code) => ({
    code,
    value: issueValue(bundle, data, metric, code),
  }));
  const numbers = raw.flatMap((r) =>
    typeof r.value === "number" ? [r.value] : [],
  );
  const max =
    metric === "small-share" ? 100 : Math.max(1, ...numbers.map(Math.abs));
  const colorOf = (value: number | Designation | null): IssueColor => {
    if (value === null) return MISSING;
    if (typeof value === "string") return CATEGORY[value];
    if (metric === "student-change") {
      const strength = Math.min(1, Math.abs(value) / max);
      const end = value < 0 ? [200, 105, 45] : [47, 143, 122];
      return [
        ...end.map((v) => Math.round(245 + (v - 245) * strength)),
        100,
      ] as IssueColor;
    }
    return [
      ...PURPLE[Math.min(4, Math.floor((value / max) * 5))],
      100,
    ] as IssueColor;
  };
  const regions = raw.map((r) => ({
    ...r,
    text: formatIssueValue(metric, r.value),
    color: colorOf(r.value),
  }));
  regions.sort((a, b) => {
    if (a.value === null)
      return b.value === null
        ? regionName(a.code).localeCompare(regionName(b.code), "ko")
        : 1;
    if (b.value === null) return -1;
    if (typeof a.value === "string" && typeof b.value === "string") {
      const order = { decline: 0, attention: 1, none: 2 };
      return (
        order[a.value] - order[b.value] ||
        regionName(a.code).localeCompare(regionName(b.code), "ko")
      );
    }
    return (
      (metric === "student-change"
        ? Number(a.value) - Number(b.value)
        : Number(b.value) - Number(a.value)) ||
      regionName(a.code).localeCompare(regionName(b.code), "ko")
    );
  });
  const range = changeYearRange(bundle.series.students_total);
  const title =
    metric === "student-change" && range
      ? `학생수 ${range[0]}→${range[1]} 증감률`
      : METRIC_LABELS[metric];
  let legend: IssueMapModel["legend"];
  if (metric === "designation") {
    legend = (["decline", "attention", "none"] as const).map((value) => ({
      label: DESIGNATION_LABELS[value],
      color: colorOf(value),
    }));
  } else if (metric === "student-change") {
    legend = [-max, 0, max].map((value) => ({
      label: formatIssueValue(metric, value),
      color: colorOf(value),
    }));
  } else {
    legend = Array.from({ length: 5 }, (_, i) => ({
      label: `${((max * i) / 5).toFixed(1)}–${((max * (i + 1)) / 5).toFixed(1)}`,
      color: [...PURPLE[i], 100] as IssueColor,
    }));
  }
  if (raw.some((r) => r.value === null))
    legend.push({ label: "자료 없음", color: MISSING });
  const note =
    metric === "designation"
      ? "공식 지정 현황입니다. 지정 없음은 안전을 뜻하지 않으며, 지역 소멸을 예측하는 지수가 아닙니다."
      : metric === "student-change"
        ? "같은 기간의 재학생 수 변화입니다. 미래 인구 예측이나 정책 효과를 뜻하지 않습니다."
        : metric === "small-share"
          ? "학생수 60명 이하 본교 ÷ 전체 본교. 앱 자체 기준이며 분교장은 제외합니다. 휴교는 교육통계 기준에 따라 포함합니다."
          : metric === "zero-entrants"
            ? "해당 연도 신입생 0명인 본교 수입니다. 분교장은 제외하고 휴교는 포함합니다. 통폐합 예정 여부를 뜻하지 않습니다."
            : metric === "special-schools"
              ? "특수학교 본교 수입니다. 현재 위치 자료가 없는 학교도 지역 집계와 목록에 포함합니다."
              : "일반학교(초·중·고, 분교 포함)의 특수학급만 집계하며 특수학교는 제외합니다. 수치만으로 지원의 충분·부족을 판단할 수 없습니다.";
  const source = data.sources[metric === "designation" ? 0 : 1];
  return {
    issue,
    metric,
    title,
    note,
    regions,
    legend,
    date: source.referenceDate
      ? `기준 ${source.referenceDate}`
      : `공식 자료 확인 ${source.checkedAt}`,
    provinceText:
      metric === "designation"
        ? `인구감소지역 ${raw.filter((r) => r.value === "decline").length}곳 · 관심지역 ${raw.filter((r) => r.value === "attention").length}곳`
        : `전북 전체 ${formatIssueValue(metric, issueValue(bundle, data, metric, "52000"))}`,
    schools: bundle.schools.schools
      .filter((s) => relatedSchool(s, data, metric))
      .sort((a, b) => a.name.localeCompare(b.name, "ko")),
    sources: metric === "designation" ? data.sources : [data.sources[1]],
  };
}
