"use client";
import { useEffect, useRef, type Ref } from "react";
import Image from "next/image";
import Link from "next/link";
import type { DataBundle } from "@/lib/data/types";
import { regionName } from "@/lib/geo/regions";
import { ACTIVE_PROFILE } from "@/lib/profiles";
import { valueMap } from "@/lib/stats";
import { useMapQuery } from "@/lib/state/urlState";
import { useDesign, type ColorPreference } from "./DesignProvider";
import MapTopicMenu from "../panels/MapTopicMenu";

const metrics = [["students_total", "학생", "명"], ["schools_total", "본교", "교"], ["teachers_total", "교원", "명"], ["small_schools", "소규모학교", "교"]];

/** The four headline figures for the selected district, or all of Incheon (decision 2). */
function EducationMetrics({ bundle, code }: { bundle: DataBundle | null; code: string }) {
  return <dl className="ice-metrics">{metrics.map(([id, label, unit]) => <div key={id}><dt>{label}</dt><dd>{bundle ? valueMap(bundle.indicators[id]).get(code)?.toLocaleString("ko-KR") ?? "—" : "—"}<small>{unit}</small></dd></div>)}</dl>;
}

function useScope() {
  const { regionCode } = useMapQuery();
  return regionCode
    ? { code: regionCode, place: regionName(regionCode) }
    : { code: ACTIVE_PROFILE.province.aggregateCode, place: `${ACTIVE_PROFILE.province.shortName} 전체` };
}

type ProvenanceManifest = { statisticsDate?: string; geographyDate?: string; latestYear?: number;
  quality?: { status?: string; studentDifferentSchoolRecords?: number } };

/** Facts come from manifest.json/schools.json (same source as /about), not literals,
 *  so the next data refresh cannot leave this note out of date (code review 2026-11-07). */
function DataProvenance({ bundle, mobile = false }: { bundle: DataBundle | null; mobile?: boolean }) {
  const manifest = bundle?.manifest as (DataBundle["manifest"] & ProvenanceManifest) | undefined;
  const schools = bundle?.schools.schools ?? [];
  const stats = manifest?.statisticsDate ?? "—";
  const differences = manifest?.quality?.studentDifferentSchoolRecords;
  return <details className="ice-provenance"><summary>자료 일부 확인 필요 <span>· {stats.replaceAll("-", ".")}</span></summary><div role="note" data-testid={mobile ? undefined : "data-quality-note"}><strong>자료 기준과 확인 범위</strong><p>통계 {stats} · 경계 {manifest?.geographyDate ?? "—"} · 검증 {manifest?.quality?.status ?? "—"}</p><p>학생수는 KESS 기준입니다.{differences ? ` 교육청 자료와 ${differences}개 학교에서 차이가 있습니다.` : ""} 교원은 정규·기간제 합계(휴직 포함, 강사 제외)이며 독립 총계는 미확보 상태입니다.</p><p>좌표는 기준일이 서로 다른 자료를 연결했습니다. {bundle?.incheonHistory ? `${bundle.incheonHistory.years[0]}~${bundle.incheonHistory.years.at(-1)} 추세는 패널의 추세 탭에서 볼 수 있으며, 군·구는 각 연도 4월의 ${Object.keys(bundle.incheonHistory.regions).length}개 구역 기준입니다.` : ""}{ACTIVE_PROFILE.capabilities.closedSchools ? "" : " 폐교 현황은 제공 준비 중입니다."}{schools.length ? ` 지도에는 분교를 포함한 ${schools.length}개 학교가 표시되며, 본교 집계는 ${schools.filter((school) => !school.branch).length}교입니다.` : ""}</p><Image src="/brand/ice-wordmark.jpg" width={270} height={71} alt="인천광역시교육청 IN CHEON METROPOLITAN CITY OFFICE OF EDUCATION" unoptimized /></div></details>;
}

export function IncheonMobileInfo({ bundle, legendRef }: { bundle: DataBundle; legendRef: Ref<HTMLDivElement> }) {
  const { code, place } = useScope();
  return <section className="ice-mobile-info" id="education-info" aria-label="지도 범례와 인천 교육현황">
    <div id="ice-below-map-legend" ref={legendRef} />
    <div className="ice-mobile-metrics"><h2>{place} 교육현황</h2><EducationMetrics bundle={bundle} code={code} /></div>
    <div className="ice-mobile-source"><p><strong>제작</strong> 인천광역시교육청 교육전문직원 홍주형</p><Link href="/about">자료 기준·출처·GitHub <span aria-hidden="true">↗</span></Link><DataProvenance bundle={bundle} mobile /></div>
  </section>;
}

const COLOR_OPTIONS: [ColorPreference, string][] = [["light", "라이트"], ["dark", "다크"], ["system", "기기 설정"]];

/** Text size and colour live behind one button: they are set once, not used while reading the map (plan §4.5). */
function ViewSettings() {
  const { colorPreference, setColorPreference, textSize, setTextSize } = useDesign();
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const details = ref.current!;
    const closeOutside = (event: PointerEvent) => { if (details.open && !details.contains(event.target as Node)) details.open = false; };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !details.open) return;
      details.open = false;
      details.querySelector("summary")?.focus();
    };
    document.addEventListener("pointerdown", closeOutside);
    details.addEventListener("keydown", closeOnEscape);
    return () => { document.removeEventListener("pointerdown", closeOutside); details.removeEventListener("keydown", closeOnEscape); };
  }, []);
  return <details ref={ref} className="ice-view-settings">
    <summary><span aria-hidden="true">⚙</span> 보기 설정</summary>
    <div className="ice-view-settings-panel">
      <button className="ice-text-toggle" type="button" aria-pressed={textSize === "large"} onClick={() => setTextSize(textSize === "large" ? "normal" : "large")}>큰 글씨</button>
      <fieldset className="ice-color-options"><legend>화면 밝기</legend>
        {COLOR_OPTIONS.map(([value, label]) => <label key={value}><input type="radio" name="ice-color" value={value} checked={colorPreference === value} onChange={() => setColorPreference(value)} />{label}</label>)}
      </fieldset>
    </div>
  </details>;
}

export default function IncheonHeader({ bundle }: { bundle: DataBundle | null }) {
  const { code, place } = useScope();
  return <div className="ice-header">
    <header className="ice-masthead">
      <div className="ice-brand"><Image src="/brand/ice-symbol.jpg" width={30} height={45} alt="인천광역시교육청 심벌" unoptimized /><div><span className="ice-eyebrow">INCHEON EDUCATION ATLAS</span><h1>인천 교육지도</h1></div></div>
      <section className="ice-disclosure" aria-label="지도 제작 및 배포 안내">
        <div className="ice-disclosure-copy"><span className="ice-disclosure-badge">비공식 안내</span><p>이 지도는 인천광역시교육청에서 공식 배포한 지도가 아닙니다.</p></div>
        <p className="ice-disclosure-author"><span>제작</span> 인천광역시교육청 교육전문직원 홍주형</p>
        <Link className="ice-disclosure-link" href="/about">자료 기준·출처·GitHub <span aria-hidden="true">↗</span></Link>
      </section>
      <ViewSettings />
    </header>
    <div className="ice-toolbar">
      {bundle ? <MapTopicMenu series={bundle.series} /> : <span>교육정보를 불러오고 있습니다…</span>}
      <div className="ice-toolbar-status"><strong>{place}</strong><EducationMetrics bundle={bundle} code={code} /></div>
      <DataProvenance bundle={bundle} />
    </div>
  </div>;
}
