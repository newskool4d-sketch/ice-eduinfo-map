"use client";

import type { DataBundle } from "@/lib/data/types";
import { regionName, type RegionCode } from "@/lib/geo/regions";
import {
  buildIssueModel,
  formatIssueValue,
  issueValue,
} from "@/lib/issues/model";
import {
  METRIC_LABELS,
  POLICY_SOURCE,
  PUBLISHED_ISSUES,
  issueById,
} from "@/lib/issues/registry";
import type { EducationIssuesFile, IssueMapModel } from "@/lib/issues/types";
import type { School } from "@/lib/schools/types";
import { SCHOOL_LEVEL_LABELS } from "@/lib/schoolVisuals";
import Sparkline from "@/components/ui/Sparkline";
import { SchoolDetail } from "./SchoolExplorer";

const button =
  "min-h-11 rounded-lg border border-line px-3 py-2 text-xs hover:bg-paper";
export function IssueLegend({ model }: { model: IssueMapModel }) {
  const unit =
    model.metric === "small-share"
      ? "%"
      : model.metric === "special-classes"
        ? "학급"
        : model.metric === "special-students"
          ? "명"
          : "개교";
  return (
    <section
      aria-label="교육문제 지도 범례"
      className="max-w-[240px] space-y-1.5 text-xs"
    >
      <p className="font-semibold text-ink">{model.title}</p>
      <div className="flex flex-wrap gap-x-2 gap-y-1">
        {model.legend.map((item) => (
          <span key={item.label} className="flex items-center gap-1">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-sm border border-ink/10"
              style={{
                backgroundColor: `rgb(${item.color.slice(0, 3).join(",")})`,
              }}
            />
            {item.label}
          </span>
        ))}
      </div>
      <p>
        {model.metric === "designation" || model.metric === "student-change"
          ? ""
          : `단위 ${unit} · `}
        {model.date}
      </p>
    </section>
  );
}

export default function IssueExplorer({
  bundle,
  data,
  model,
  issueId,
  region,
  schools,
  selectedSchool,
  onIssue,
  onMetric,
  onRegion,
  onSchool,
  onSearch,
  onStatistics,
}: {
  bundle: DataBundle;
  data: EducationIssuesFile;
  model: IssueMapModel | null;
  issueId: string | null;
  region: RegionCode | null;
  schools: School[];
  selectedSchool: School | null;
  onIssue: (id: string | null) => void;
  onMetric: (id: string) => void;
  onRegion: (code: RegionCode | null) => void;
  onSchool: (id: string | null) => void;
  onSearch: (code: RegionCode) => void;
  onStatistics: (code: RegionCode) => void;
}) {
  const definition = issueById(issueId);
  if (!definition || !model)
    return (
      <div className="space-y-4">
        <div>
          <p className="text-xs font-semibold text-accent-text">
            정책에서 질문으로
          </p>
          <h2 className="mt-2 text-xl font-semibold">
            우리 지역 교육, 어디부터 살펴볼까요?
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-muted">
            교육정책과 연결된 질문을 고르고, 지역의 현황과 관련 학교를 지도에서
            확인하세요.
          </p>
        </div>
        {PUBLISHED_ISSUES.map((issue, index) => (
          <button
            key={issue.id}
            onClick={() => onIssue(issue.id)}
            className="block w-full rounded-xl border border-line bg-paper p-4 text-left hover:border-accent/50 focus-visible:outline-accent"
          >
            <span className="text-xs font-semibold text-accent-text">
              0{index + 1} · {issue.title}
            </span>
            <span className="mt-2 block text-base font-semibold leading-relaxed">
              {issue.question}
            </span>
            <span className="mt-2 block text-xs leading-relaxed text-ink-muted">
              {issue.description}
            </span>
            <span className="mt-3 block text-xs text-ink-muted">
              정책 연계 · {issue.policy}
            </span>
            <span className="mt-1 block text-xs text-ink-muted">
              교육통계 {data.statsReferenceDate}
              {index === 0
                ? ` · 지정 현황 확인 ${data.sources[0].checkedAt}`
                : ""}
            </span>
            <span className="mt-3 block text-xs font-semibold text-accent-text">
              지도에서 살펴보기 →
            </span>
          </button>
        ))}
        <p className="text-xs leading-relaxed text-ink-muted">
          질문과 지표의 연결은 이 앱의 탐색 설계입니다. 수치만으로 지역의
          위험이나 정책의 성과를 평가하지 않습니다.
        </p>
        <a
          className="block text-xs underline"
          href={POLICY_SOURCE.url}
          target="_blank"
          rel="noreferrer"
        >
          정책 근거 · 인수위원회 활동 백서
        </a>
      </div>
    );
  const current = region ? model.regions.find((r) => r.code === region) : null;
  const scope = region ?? "52000";
  const scopeSchools = bundle.schools.schools.filter(
    (s) => !region || s.regionCode === region,
  );
  const trend =
    bundle.series.students_total?.rows
      .filter((r) => r.regionCode === scope)
      .sort((a, b) => a.year - b.year) ?? [];
  const relatedModels = definition.metrics.map((metric) =>
    buildIssueModel(bundle, data, definition, metric),
  );
  const located = schools.filter(
    (s) => s.lat !== null && s.lng !== null,
  ).length;
  const special = scopeSchools.filter((s) => s.level === "special");
  return (
    <div className="space-y-4">
      <button
        className="min-h-10 text-xs font-medium text-accent-text"
        onClick={() => onIssue(null)}
      >
        ← 질문 목록으로
      </button>
      <div>
        <p className="text-xs font-semibold text-accent-text">
          {definition.title}
        </p>
        <h2 className="mt-1 text-lg font-semibold leading-relaxed">
          {definition.question}
        </h2>
      </div>
      <fieldset>
        <legend className="mb-2 text-xs font-medium">지도에 표시할 지표</legend>
        <div className="flex flex-wrap gap-1.5">
          {definition.metrics.map((metric) => (
            <button
              key={metric}
              className={`${button} ${model.metric === metric ? "border-accent/40 bg-accent-soft font-semibold text-accent-text" : ""}`}
              aria-pressed={model.metric === metric}
              onClick={() => onMetric(metric)}
            >
              {METRIC_LABELS[metric]}
            </button>
          ))}
        </div>
      </fieldset>
      <div
        className="rounded-xl border border-line bg-paper p-3"
        aria-live="polite"
      >
        <p className="text-xs text-ink-muted">{model.title}</p>
        <p className="mt-1 text-lg font-semibold">
          {current
            ? `${regionName(current.code)} · ${current.text}`
            : model.provinceText}
        </p>
        <p className="mt-2 text-xs text-ink-muted">{model.date}</p>
      </div>
      <p className="text-xs leading-relaxed text-ink-muted">{model.note}</p>
      <section aria-label="교육문제 시군 비교">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold">14개 시군 비교</h3>
          {region && (
            <button
              className="min-h-9 text-xs underline"
              onClick={() => onRegion(null)}
            >
              지역 선택 해제
            </button>
          )}
        </div>
        <ul className="space-y-1">
          {model.regions.map((row) => (
            <li key={row.code}>
              <button
                className={`flex min-h-10 w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm ${row.code === region ? "bg-accent-soft font-semibold" : "hover:bg-paper"}`}
                aria-pressed={row.code === region}
                onClick={() => onRegion(row.code)}
              >
                <span className="flex items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 rounded-sm border border-ink/10"
                    style={{
                      backgroundColor: `rgb(${row.color.slice(0, 3).join(",")})`,
                    }}
                  />
                  {regionName(row.code)}
                </span>
                <span className="text-xs tabular-nums">{row.text}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>
      <section
        className="space-y-3 border-t border-line pt-4"
        aria-label="교육문제 지역 상세"
      >
        <h3 className="font-semibold">
          {region ? regionName(region) : "전북 전체"} 함께 살펴보기
        </h3>
        <dl className="space-y-2 text-xs">
          {relatedModels.map((related) => (
            <div key={related.metric} className="flex justify-between gap-3">
              <dt className="text-ink-muted">{related.title}</dt>
              <dd className="shrink-0 font-medium">
                {related.metric === "designation" && !region
                  ? related.provinceText
                  : formatIssueValue(
                      related.metric,
                      issueValue(bundle, data, related.metric, scope),
                    )}
              </dd>
            </div>
          ))}
        </dl>
        {definition.id === "regional-sustainability" ? (
          <>
            <p className="text-xs text-ink-muted">
              소규모학교{" "}
              {
                scopeSchools.filter(
                  (s) =>
                    data.schools[s.id].isMain &&
                    s.students !== null &&
                    s.students <= 60,
                ).length
              }
              개교 · 본교 기준
            </p>
            <h4 className="text-xs font-semibold">학생수 추이</h4>
            <Sparkline data={trend} />
            <dl className="flex flex-wrap gap-3 text-xs">
              {trend.map((r) => (
                <div key={r.year}>
                  <dt className="text-ink-muted">{r.year}</dt>
                  <dd>
                    {r.value === null
                      ? "자료 없음"
                      : `${r.value.toLocaleString("ko-KR")}명`}
                  </dd>
                </div>
              ))}
            </dl>
          </>
        ) : (
          <div className="rounded-lg bg-paper p-3 text-xs leading-relaxed">
            <p className="font-semibold">특수학교 별도 현황</p>
            <p className="mt-1">
              {special.length}개교 · 학생{" "}
              {special.some((s) => s.students === null)
                ? "자료 없음"
                : `${special.reduce((sum, s) => sum + (s.students ?? 0), 0).toLocaleString("ko-KR")}명`}{" "}
              · 학급{" "}
              {special.some((s) => s.classes === null)
                ? "자료 없음"
                : `${special.reduce((sum, s) => sum + (s.classes ?? 0), 0)}학급`}
            </p>
            <p className="mt-1 text-ink-muted">
              일반학교 특수학급과 구분한 수치입니다. 특수학교는 현재 위치 자료가
              없어 목록과 시군별 집계로 확인합니다.
            </p>
          </div>
        )}
        {region && (
          <button className={button} onClick={() => onSearch(region)}>
            이 지역 학교 검색 →
          </button>
        )}
      </section>
      {selectedSchool && (
        <SchoolDetail
          school={selectedSchool}
          onClose={() => onSchool(null)}
          onStatistics={onStatistics}
        />
      )}
      <section
        aria-label="교육문제 관련 학교"
        className="border-t border-line pt-4"
      >
        <h3 className="text-sm font-semibold">현재 주제 관련 학교</h3>
        <p
          className="my-2 text-xs text-ink-muted"
          data-testid="issue-school-count"
        >
          목록 {schools.length}개 · 지도 표시 가능 {located}개
        </p>
        {!schools.length && (
          <p className="py-4 text-sm text-ink-muted">
            해당 조건의 학교가 없습니다.
          </p>
        )}
        <ul className="space-y-1">
          {schools.map((school) => {
            const facts = data.schools[school.id];
            return (
              <li key={school.id}>
                <button
                  data-testid={`issue-school-${school.id}`}
                  aria-current={
                    school.id === selectedSchool?.id ? "true" : undefined
                  }
                  className={`w-full rounded-lg border p-3 text-left ${school.id === selectedSchool?.id ? "border-accent/40 bg-accent-soft" : "border-transparent hover:bg-paper"}`}
                  onClick={() => onSchool(school.id)}
                >
                  <span className="block text-sm font-medium">
                    {school.name}
                  </span>
                  <span className="mt-1 block text-xs text-ink-muted">
                    {regionName(school.regionCode as RegionCode)} ·{" "}
                    {SCHOOL_LEVEL_LABELS[school.level]}
                    {school.branch ? " · 분교장" : ""}
                    {facts.status === "휴교" ? " · 휴교" : ""}
                  </span>
                  <span className="mt-1 block text-xs text-ink-muted">
                    학생{" "}
                    {school.students === null
                      ? "자료 없음"
                      : `${school.students.toLocaleString("ko-KR")}명`}
                    {model.metric === "zero-entrants" ? " · 신입생 0명" : ""}
                    {definition.id === "special-education" &&
                    school.level !== "special"
                      ? ` · 특수학급 ${facts.specialClasses ?? "자료 없음"}`
                      : ""}
                    {school.lat === null || school.lng === null
                      ? " · 위치 자료 없음"
                      : ""}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>
      <details className="border-t border-line pt-3 text-xs leading-relaxed">
        <summary className="min-h-10 cursor-pointer font-semibold">
          정책 근거 · 지표 정의 · 출처
        </summary>
        <div className="space-y-3 pb-3">
          <p>
            정책 연계: {definition.policy} · 과제 {definition.policyTask}
          </p>
          <a
            className="block underline"
            href={POLICY_SOURCE.url}
            target="_blank"
            rel="noreferrer"
          >
            {POLICY_SOURCE.name} {definition.policyPage}쪽 · 발행{" "}
            {POLICY_SOURCE.referenceDate}
          </a>
          <p>
            질문과 지표의 연결은 앱의 탐색 설계이며 공식 진단이나 정책 성과
            평가가 아닙니다.
          </p>
          <p>{model.note}</p>
          {data.sources.map((source) => (
            <p key={source.url}>
              <a
                className="underline"
                href={source.url}
                target="_blank"
                rel="noreferrer"
              >
                {source.name}
              </a>
              <br />
              {source.referenceDate
                ? `자료 기준 ${source.referenceDate}`
                : `공식 페이지 확인 ${source.checkedAt}`}
            </p>
          ))}
          <p>
            학생·학교 통계와 정책 문서의 날짜는 서로 다릅니다. 자료 없음은 0으로
            계산하지 않습니다.
          </p>
        </div>
      </details>
    </div>
  );
}
