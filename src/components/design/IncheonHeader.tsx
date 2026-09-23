"use client";
import Image from "next/image";
import type { DataBundle } from "@/lib/data/types";
import { valueMap } from "@/lib/stats";
import { useMapQuery } from "@/lib/state/urlState";
import { DESIGNS, useDesign, type DesignId } from "./DesignProvider";
import MapTopicMenu from "../panels/MapTopicMenu";

export default function IncheonHeader({ bundle, onExplore }: { bundle: DataBundle | null; onExplore: () => void }) {
  const { design, setDesign, colorMode, setColorMode, textSize, setTextSize } = useDesign();
  const { setView } = useMapQuery();
  const current = DESIGNS.find(d => d.id === design)!;
  const metrics = [["students_total", "학생", "명"], ["schools_total", "본교", "교"], ["teachers_total", "교원", "명"], ["small_schools", "소규모학교", "교"]];
  return <div className="ice-header">
    <header className="ice-masthead">
      <div className="ice-brand"><Image src="/brand/ice-symbol.jpg" width={30} height={45} alt="인천광역시교육청 심벌" unoptimized /><div><span className="ice-eyebrow">INCHEON EDUCATION ATLAS</span><h1>인천 교육지도</h1></div></div>
      <Image className="ice-vision" src="/brand/ice-vision.png" width={320} height={33} alt="읽걷쓰AI로 학생성공시대 완성" unoptimized />
      <div className="ice-display-controls"><label className="ice-design-picker"><span>화면 버전</span><select aria-label="화면 버전" value={design} onChange={e => { const id = e.target.value as DesignId; setDesign(id); setView(id === "desk" ? "statistics" : "schools"); onExplore(); }}>{DESIGNS.map(d => <option value={d.id} key={d.id}>{d.label}</option>)}</select></label>
      <button className="ice-text-toggle" type="button" aria-pressed={textSize === "large"} onClick={() => setTextSize(textSize === "large" ? "normal" : "large")}>큰 글씨</button>
      <button className="ice-theme-toggle" type="button" aria-label="어두운 화면" aria-pressed={colorMode === "dark"} onClick={() => setColorMode(colorMode === "dark" ? "light" : "dark")}>{colorMode === "dark" ? "다크" : "라이트"}<span aria-hidden className="ice-toggle-track"><span /></span></button>
      </div>
    </header>
    <div className="ice-workbar"><div><h2>{current.description}</h2><p>2026년 인천 교육현황</p></div>
      <dl className="ice-metrics">{metrics.map(([id, label, unit]) => <div key={id}><dt>{label}</dt><dd>{bundle ? valueMap(bundle.indicators[id]).get("28000")?.toLocaleString("ko-KR") ?? "—" : "—"}<small>{unit}</small></dd></div>)}</dl>
    </div>
    <div className="ice-toolbar">{bundle ? <MapTopicMenu series={bundle.series} /> : <span>교육정보를 불러오고 있습니다…</span>}<details className="ice-provenance"><summary>자료 일부 확인 필요 <span>· 2026.04.01</span></summary><div role="note" data-testid="data-quality-note"><strong>자료 기준과 확인 범위</strong><p>통계 2026-04-01 · 경계 2026-07-01 · 검증 PARTIAL</p><p>학생수는 KESS 기준입니다. 교육청 자료와 91개 학교에서 차이가 있습니다. 교원은 정규·기간제 합계(휴직 포함, 강사 제외)이며 독립 총계는 미확보 상태입니다.</p><p>좌표는 기준일이 서로 다른 자료를 연결했습니다. 2022~2026 추세는 패널에서 볼 수 있으며, 군·구는 각 연도 4월의 10개 구역 기준입니다. 폐교 현황은 제공 준비 중입니다. 지도에는 분교를 포함한 562개 학교가 표시되며, 본교 집계는 555교입니다.</p><Image src="/brand/ice-wordmark.jpg" width={270} height={71} alt="인천광역시교육청 IN CHEON METROPOLITAN CITY OFFICE OF EDUCATION" unoptimized /></div></details></div>
  </div>;
}
