import type { Metadata } from "next";
import Link from "next/link";
import incheonManifest from "../../../public/data/incheon/manifest.json";
import incheonSchools from "../../../public/data/incheon/schools.json";
import { incheonProfile } from "@/lib/profiles/incheon";
import styles from "./page.module.css";

type IncheonManifest = typeof incheonManifest & {
  statisticsDate: string;
  geographyDate: string;
};

const manifest = incheonManifest as IncheonManifest;
const schoolRecordCount = incheonSchools.schools.length;
const indicatorLabels = [
  "학생수",
  "본교수",
  "학급수",
  "학급당 학생수",
  "교원수",
  "교원 1인당 학생수",
  "소규모학교 수",
  "소규모학교 비율",
];

export const metadata: Metadata = {
  title: "제작자·자료 안내 | 인천 교육지도",
  description: "인천 교육지도의 제작자, 자료 출처, 통계 기준과 확인 범위를 안내합니다.",
};

export default function AboutPage() {
  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <nav className={styles.topNav} aria-label="페이지 이동">
          <Link className={styles.backLink} href="/">← 인천 교육지도</Link>
          <span>제작자 · 자료 안내</span>
        </nav>

        <header className={styles.hero}>
          <p className={styles.eyebrow}>INCHEON EDUCATION ATLAS</p>
          <h1>제작자와 자료 안내</h1>
          <p>지도에 담긴 자료의 범위와 집계 기준, 출처와 확인이 필요한 내용을 안내합니다.</p>
        </header>

        <aside className={styles.disclaimer} aria-labelledby="disclaimer-title">
          <div>
            <span className={styles.noticeLabel}>공식 배포 여부</span>
            <h2 id="disclaimer-title">이 지도는 인천광역시교육청에서 공식 배포한 지도가 아닙니다.</h2>
          </div>
          <p><strong>제작:</strong> 인천광역시교육청 교육전문직원 홍주형</p>
        </aside>

        <dl className={styles.stats} aria-label="지도 수록 범위">
          <div><dt>학교·분교 기록</dt><dd>{schoolRecordCount.toLocaleString("ko-KR")}</dd><span>지도 위치 표시 기준</span></div>
          <div><dt>교육 지표</dt><dd>{indicatorLabels.length}</dd><span>학생·학교·학급·교원 등</span></div>
          <div><dt>추세 수록 연도</dt><dd>2022–2026</dd><span>인천 전체·당시 군구·학교별</span></div>
        </dl>

        <section className={styles.section} aria-labelledby="included-title">
          <div className={styles.sectionHeading}>
            <p className={styles.sectionEyebrow}>WHAT THIS MAP INCLUDES</p>
            <h2 id="included-title">자료 제작에 반영한 내용</h2>
          </div>
          <div className={styles.methodGrid}>
            <article className={styles.card}>
              <span className={styles.cardNumber}>01</span>
              <h3>교육통계와 지표</h3>
              <p><strong>{manifest.statisticsDate}</strong> 기준 KESS 학교별 주요통계를 바탕으로 다음 지표를 구성했습니다.</p>
              <ul className={styles.indicatorList}>
                {indicatorLabels.map((label) => <li key={label}>{label}</li>)}
              </ul>
              <p className={styles.smallNote}>소규모학교는 이 지도의 자체 기준인 학생수 60명 이하로 집계합니다. 본교 수에는 분교장과 폐교를 포함하지 않습니다.</p>
            </article>

            <article className={styles.card}>
              <span className={styles.cardNumber}>02</span>
              <h3>학교 위치와 행정구역</h3>
              <p>학교 위치 표준데이터와 학교알리미 보완 좌표를 사용하고, <strong>{manifest.geographyDate}</strong> 버전의 행정구역 경계로 현재 지도를 표시합니다.</p>
              <p className={styles.smallNote}>현재 경계는 {incheonProfile.regions.length}개 군·구입니다. 좌표 보완자료의 원 좌표 기준일은 확인되지 않은 항목이 있습니다.</p>
            </article>

            <article className={styles.card}>
              <span className={styles.cardNumber}>03</span>
              <h3>연도별 추세</h3>
              <p>2022~2026년 자료를 인천 전체, 자료가 작성된 당시의 군·구, 학교별로 나누어 비교합니다.</p>
              <p className={styles.smallNote}>과거 수치를 현재의 11개 군·구 경계에 맞춰 다시 나누지 않습니다. 연도별 구역 기준이 달라질 수 있으므로 현재 지도 경계와 구분해 읽어 주세요.</p>
            </article>
          </div>
          <div className={styles.indicatorStrip}>
            <strong>수록 지표</strong>
            <p>{indicatorLabels.join(" · ")}</p>
          </div>
        </section>

        <section className={styles.section} aria-labelledby="sources-title">
          <div className={styles.sectionHeading}>
            <p className={styles.sectionEyebrow}>SOURCES & DATES</p>
            <h2 id="sources-title">자료 출처와 기록된 기준일</h2>
            <p>아래 출처 목록과 날짜는 지도 데이터 manifest에 기록된 값을 표시합니다.</p>
          </div>
          <ul className={styles.sourceList}>
            {manifest.sources.map((source) => (
              <li key={source.url}>
                <a href={source.url} target="_blank" rel="noreferrer">{source.name}<span aria-hidden="true"> ↗</span></a>
                <span className={styles.sourceDate}>{source.referenceDate}</span>
              </li>
            ))}
          </ul>
          <p className={styles.smallNote}>학교알리미 보완 좌표의 날짜는 열람일이며, 좌표 자체의 기준일은 확인되지 않았습니다.</p>
        </section>

        <section className={`${styles.section} ${styles.qualitySection}`} aria-labelledby="quality-title">
          <div className={styles.sectionHeading}>
            <p className={styles.sectionEyebrow}>CHECKS & LIMITS</p>
            <h2 id="quality-title">확인 범위와 남은 한계</h2>
          </div>
          <ul className={styles.qualityList}>
            <li><strong>학생수:</strong> KESS 기준을 사용합니다. 교육청 학교현황과 차이가 있던 91개 기록을 학교알리미·KESS·앱 값과 대조해 모두 일치하는 것을 확인했습니다. 교육청 자료와 차이가 발생한 행정적 원인은 아직 확인되지 않았습니다.</li>
            <li><strong>교원수:</strong> 562개 학교·분교 기록 중 숫자 공시가 있는 560개를 대조했습니다. 휴교 분교 2개는 기준일 숫자 공시를 확인하지 못했습니다.</li>
            <li><strong>결측값:</strong> 확인되지 않은 수치를 0으로 바꾸지 않습니다. 지표의 정의와 자료 한계는 화면의 자료 안내 및 공개 검증 기록을 함께 확인해 주세요.</li>
          </ul>
          <a className={styles.documentLink} href="https://github.com/newskool4d-sketch/ice-eduinfo-map/blob/main/docs/INCHEON_VERIFICATION.md" target="_blank" rel="noreferrer">인천 자료 검증 기록 보기 <span aria-hidden="true">↗</span></a>
        </section>

        <section className={styles.githubCard} aria-labelledby="github-title">
          <div>
            <p className={styles.sectionEyebrow}>OPEN SOURCE</p>
            <h2 id="github-title">소스코드와 제작 기록</h2>
            <p>코드, 지역별 데이터 구성 안내와 공개 검증 기록은 GitHub 저장소에서 확인할 수 있습니다.</p>
          </div>
          <a className={styles.githubButton} href="https://github.com/newskool4d-sketch/ice-eduinfo-map" target="_blank" rel="noreferrer">GitHub 저장소 <span aria-hidden="true">↗</span></a>
        </section>

        <footer className={styles.pageFooter}>
          <span>제작: 인천광역시교육청 교육전문직원 홍주형</span>
          <Link href="/">지도 화면으로 돌아가기</Link>
        </footer>
      </div>
    </main>
  );
}
