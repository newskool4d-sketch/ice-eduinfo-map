import type { EducationIssue } from "../../issues/types";

export const POLICY_SOURCE = {
  name: "제20대 전북특별자치도교육감직인수위원회 활동 백서",
  url: "https://www.jbe.go.kr/board/view.jbe?boardId=BBS_0000002&dataSid=1160997",
  referenceDate: "2026-08-05",
};

/** Questions are our interpretation of the cited policy, not official diagnoses. */
export const EDUCATION_ISSUES: EducationIssue[] = [
  {
    id: "school-size", title: "학교 규모 차이",
    question: "같은 지역의 학교 규모는 얼마나 다른가?",
    description: "학교급별 학생 분포와 작은학교·큰 학교의 공존을 살펴봅니다.",
    policy: "기초학력 맞춤형 지원 · 성장지향 수업·평가", policyPage: 52,
    policyTask: "2-1, 3-2", status: "published", metrics: ["school-size"],
    nextQuestion: "통학구역과 주거 변화가 학교 규모 차이에 어떤 영향을 주는지 추가 확인이 필요합니다.",
  },
  {
    id: "regional-sustainability",
    title: "지역소멸과 작은학교",
    question: "학생이 줄어드는 지역의 학교는 어떤 상황인가?",
    description:
      "인구감소지역과 학생수 변화, 작은학교의 분포를 함께 살펴봅니다.",
    policy: "전북유학 확대와 지역 소멸 위기 대응",
    policyPage: 53,
    policyTask: "7-1",
    status: "published",
    metrics: ["decline-small", "designation", "student-change", "small-share", "zero-entrants"],
    nextQuestion: "공동교육과정 운영 여부와 실제 이동시간을 확인하면 작은학교의 교육 기회를 더 살펴볼 수 있습니다.",
  },
  {
    id: "special-education",
    title: "특수교육 현황",
    question: "특수학급과 특수학교는 어디에 분포하는가?",
    description:
      "일반학교의 특수학급과 특수학교를 구분해 교육 현황을 살펴봅니다.",
    policy: "질 높은 특수교육 실현",
    policyPage: 53,
    policyTask: "5-2-3",
    status: "published",
    metrics: ["special-classes", "special-students", "special-schools"],
    nextQuestion: "지원인력·치료·통학 자료를 함께 확인해야 지원이 충분한지 판단할 수 있습니다.",
  },
  {
    id: "closed-assets", title: "폐교 활용 현황",
    question: "미활용 폐교재산은 어느 지역에 있는가?",
    description: "수록된 폐교재산의 활용상태와 주소를 지역별로 확인합니다.",
    policy: "온동네 돌봄 · 지역 교육거버넌스", policyPage: 53,
    policyTask: "5-1-1, 7-2", status: "published", metrics: ["unused-count", "unused-share"],
    nextQuestion: "돌봄·독서·체험 수요와 건물 상태·접근성을 추가 확인해야 활용 방안을 검토할 수 있습니다.",
  },
  {
    id: "basic-learning",
    title: "기초학력 지원",
    question: "14개 지역 기초학력지원센터는 어디에 있는가?",
    description: "지역 교육지원청의 기초학력지원센터 분포를 살펴봅니다. 선도학교 명단과 지원 인력은 별도 확인이 필요합니다.",
    policy: "기초학력 맞춤형 통합 지원",
    policyPage: 52,
    policyTask: "2-1",
    status: "published",
    metrics: ["basic-centers"],
    nextQuestion: "센터가 있다는 사실만으로 실제 학생 접근성이나 지원 규모를 알 수 없습니다.",
  },
  {
    id: "reading",
    title: "독서 환경",
    question: "학교와 지역의 독서 자원은 어떻게 분포하는가?",
    description: "교육청 도서관 18개관과 학교별 정규 사서교사 배치를 구분해 살펴봅니다.",
    policy: "인문학 및 독서 교육 활성화",
    policyPage: 52,
    policyTask: "2-2-1",
    status: "published",
    metrics: ["libraries", "librarian-schools"],
    nextQuestion: "학교도서관 사서·장서와 지자체 공공도서관을 연결하면 독서 접근성을 더 살펴볼 수 있습니다.",
  },
  {
    id: "care",
    title: "돌봄",
    question: "학교와 지역의 돌봄 자원은 어디에 있는가?",
    description: "거점형 유아 돌봄 시범기관과 공공데이터포털에 등록된 지역아동센터를 구분해 살펴봅니다.",
    policy: "지자체 협력 돌봄",
    policyPage: 53,
    policyTask: "5-1-1",
    status: "published",
    metrics: ["care-pilots", "care-centers"],
    nextQuestion: "초등 늘봄·지역아동센터의 운영시간·정원·이용 대상을 함께 확인해야 합니다.",
  },
  {
    id: "wellbeing",
    title: "마음건강",
    question: "학생이 이용할 수 있는 상담·지원기관은 어디인가?",
    description: "지역 Wee센터와 학교별 정규 전문상담교사 배치를 구분해 살펴봅니다.",
    policy: "학생 마음건강 지원 확대",
    policyPage: 53,
    policyTask: "6-2-1",
    status: "published",
    metrics: ["wee-centers", "counselor-schools"],
    nextQuestion: "학교 Wee클래스·병원형 센터와 상담인력·이용 조건을 연결해야 합니다.",
  },
  {
    id: "career",
    title: "진로교육",
    question: "진로진학 상담을 신청할 수 있는 지역은 어디인가?",
    description: "교육청 예약 사이트의 지역별 상담 신청 범위를 살펴봅니다. 실제 상담 일정·장소는 예약 화면에서 확인해야 합니다.",
    policy: "진로교육 및 진학·진로상담 강화",
    policyPage: 54,
    policyTask: "8-1, 8-2",
    status: "published",
    metrics: ["career-regions"],
    nextQuestion: "진로체험처·프로그램별 운영 시간과 실제 이용 가능 인원을 확인해야 합니다.",
  },
  {
    id: "ai-education",
    title: "AI 교육환경",
    question: "AI 중점학교는 어디에 분포하는가?",
    description: "교육청이 발표한 2026년 AI 중점학교 81개교를 기존 학교 위치와 연결합니다.",
    policy: "AI 교육 기반 및 활용 강화",
    policyPage: 54,
    policyTask: "9-1",
    status: "published",
    metrics: ["ai-focus-schools"],
    nextQuestion: "AI 체험센터·교구·수업 참여 현황을 연결하면 학교 밖 기회도 살펴볼 수 있습니다.",
  },
];
export const PUBLISHED_ISSUES = EDUCATION_ISSUES.filter(
  (issue) => issue.status === "published",
);
export const ISSUE_IDS = PUBLISHED_ISSUES.map((issue) => issue.id);
export const ISSUE_METRICS = PUBLISHED_ISSUES.flatMap((issue) => issue.metrics);
export function issueById(id: string | null) {
  return PUBLISHED_ISSUES.find((issue) => issue.id === id) ?? null;
}
export function resolveIssueMetric(
  issue: EducationIssue,
  metric: string | null,
) {
  return metric && issue.metrics.includes(metric) ? metric : issue.metrics[0];
}
export const METRIC_LABELS: Record<string, string> = {
  "school-size": "학교 규모 분포",
  "decline-small": "학생 감소와 작은학교",
  "unused-count": "미활용 폐교재산 수",
  "unused-share": "미활용 폐교재산 비율",
  designation: "인구감소지역 지정",
  "student-change": "학생수 증감률",
  "small-share": "소규모학교 비율",
  "zero-entrants": "신입생 0명 학교 수",
  "special-classes": "일반학교 특수학급 수",
  "special-students": "일반학교 특수학급 학생수",
  "special-schools": "특수학교 수",
};
