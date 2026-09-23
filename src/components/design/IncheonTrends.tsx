"use client";
import { useEffect, useId, useRef, useState } from "react";
import { HISTORY_METRICS, HISTORY_LEVELS, historyChange, type HistoryLevel, type HistoryMetric, type IncheonHistory } from "@/lib/data/incheonHistory";
import type { School } from "@/lib/schools/types";
import TimeSeriesChart from "../ui/TimeSeriesChart";

const number = (n: number | null) => n === null ? "—" : n.toLocaleString("ko-KR", { maximumFractionDigits: 2 });
const signed = (n: number | null) => n === null ? "산출 불가" : `${n > 0 ? "+" : ""}${number(n)}`;

/** Historical administrative names intentionally do not mutate the current-boundary map filter. */
export default function IncheonTrends({ data, school, currentRegionName }: { data: IncheonHistory; school: School | null; currentRegionName?: string }) {
  const [scope, setScope] = useState<"province" | "region" | "school">(school ? "school" : currentRegionName && data.regions[currentRegionName] ? "region" : "province");
  const [region, setRegion] = useState(currentRegionName && data.regions[currentRegionName] ? currentRegionName : "중구");
  const [metric, setMetric] = useState<HistoryMetric>("students");
  const [level, setLevel] = useState<HistoryLevel>("all");
  const [expanded, setExpanded] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const expandRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const wasExpanded = useRef(false);
  const dialogTitle = useId();
  useEffect(() => {
    if (!expanded) {
      if (wasExpanded.current) expandRef.current?.focus();
      wasExpanded.current = false;
      return;
    }
    wasExpanded.current = true;
    const dialog = dialogRef.current!;
    dialog.showModal();
    closeRef.current?.focus();
    return () => dialog.close();
  }, [expanded]);
  const schoolHistory = school ? data.schools[school.id] : undefined;
  const beforeOpening = Object.values(schoolHistory?.reviews ?? {}).find(r=>r.status === "before_opening");
  const aggregate = level === "all" ? data : data.byLevel?.[level];
  const points = scope === "school" ? schoolHistory?.points ?? [] : scope === "region" ? aggregate?.regions[region] ?? [] : aggregate?.province ?? [];
  const area = scope === "region" ? `${region} · 4월 원자료` : "인천 전체";
  const place = scope === "school" ? school?.name ?? "학교 미선택" : `${area}${level === "all" ? "" : ` · ${HISTORY_LEVELS[level]}`}`;
  const definition = HISTORY_METRICS[metric];
  const last = points.find(p => p.year === 2026)?.[metric] ?? null;
  const base = points.find(p => p.year === 2022)?.[metric] ?? null;
  const change = historyChange(last, base);
  const previous = historyChange(last, points.find(p => p.year === 2025)?.[metric] ?? null);
  const content = <section aria-label="인천 연도별 추세" className="ice-trend-content">
      <div className="ice-trend-heading"><p>2022–2026 · {definition.label}</p>{!expanded && <button ref={expandRef} type="button" className="ice-expand-button" aria-haspopup="dialog" onClick={() => setExpanded(true)}>크게 보기</button>}</div>
      <div className="ice-trend-scopes" aria-label="추세 범위">{([["province", "인천 전체"], ["region", "군·구별"], ["school", "학교별"]] as const).map(([id,label]) => <button type="button" key={id} aria-pressed={scope===id} disabled={id==="school" && !school} onClick={()=>{setScope(id); if(id==="school" && metric==="schools") setMetric("students");}}>{label}</button>)}</div>
      <div className="ice-trend-filters">
      {scope === "region" && <label className="ice-trend-field">비교할 군·구 (4월 기준)<select aria-label="추세 군구" value={region} onChange={e=>setRegion(e.target.value)}>{Object.keys(data.regions).map(name=><option key={name}>{name}</option>)}</select></label>}
      {scope !== "school" && data.byLevel && <label className="ice-trend-field">학교급<select aria-label="추세 학교급" value={level} onChange={e=>setLevel(e.target.value as HistoryLevel)}>{Object.entries(HISTORY_LEVELS).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>}
      <label className="ice-trend-field">추세 지표<select aria-label="추세 지표" value={metric} onChange={e=>setMetric(e.target.value as HistoryMetric)}>{Object.entries(HISTORY_METRICS).filter(([id])=>scope!=="school" || id!=="schools").map(([id,def])=><option value={id} key={id}>{def.label}</option>)}</select></label>
      </div>
      <p className="ice-trend-note">{scope === "school" && school ? `${HISTORY_LEVELS[school.level]} · 선택한 학교 기준` : "추세의 학교급·지표는 지도와 별도로 선택합니다."}</p>
      {scope === "school" && beforeOpening && <p className="ice-trend-note ice-trend-status" role="note">{beforeOpening.note}. 해당 공백은 현재 미개교 상태나 학생 0명을 뜻하지 않습니다.</p>}
      {scope === "region" && <p className="ice-trend-note ice-trend-status">당시 4월의 10개 군·구 기준입니다. 현재 지도와 행정구역 기준이 다릅니다.</p>}
      <dl className="ice-trend-metrics" aria-label="추세 핵심 수치">
        <div className="ice-trend-current"><dt>2026년 {definition.label}</dt><dd>{last === null ? "자료 없음" : <>{number(last)}<small>{definition.unit}</small></>}</dd></div>
        {([{label:"전년 대비", period:"2025 → 2026", value:previous}, {label:"2022년 대비", period:"2022 → 2026 · 4년", value:change}] as const).map(({label,period,value})=><div key={label}><dt>{label}</dt><dd>{signed(value.percent)}{value.percent !== null && <small>%</small>}</dd><p>{value.difference === null ? "비교 자료 없음" : `${signed(value.difference)}${definition.unit} · ${value.difference > 0 ? "증가" : value.difference < 0 ? "감소" : "변화 없음"}`}</p><span>{period}</span></div>)}
      </dl>
      <div className="ice-trend-visuals">
      <TimeSeriesChart readable data={points.map(p=>({year:p.year,value:p[metric]}))} label={definition.label} place={place} unit={definition.unit} format={number} />
      <section className="ice-trend-table-section" aria-label="연도별 상세 수치"><h3>연도별 상세 수치 <small>단위: {definition.unit}</small></h3><div className="ice-trend-table" tabIndex={0} role="region" aria-label="연도별 수치 표 · 가로 스크롤 가능"><table aria-label={`${place} 연도별 증감률`}><thead><tr><th scope="col">연도</th><th scope="col">{definition.label}</th><th scope="col">전년 증감<br/>({definition.unit})</th><th scope="col">전년비<br/>(%)</th></tr></thead><tbody>{points.map((p,i)=>{
        const previous = points[i-1];
        const delta=historyChange(p[metric],previous?.year===p.year-1 ? previous[metric] : null);
        const review=scope === "school" ? schoolHistory?.reviews?.[p.year] : undefined;
        return <tr key={p.year}><th scope="row">{p.year}</th><td>{number(p[metric])}{p[metric]===null && review && <small className="block" title={review.note}>{review.status==="before_opening" ? "조사일 당시 개교 전" : "연결 확인 중"}</small>}</td><td>{delta.difference===null ? "—" : signed(delta.difference)}</td><td>{delta.percent===null ? "—" : signed(delta.percent)}</td></tr>;
      })}</tbody></table></div></section></div>
      <details className="ice-trend-note"><summary>집계·증감률 기준</summary><p>{scope === "school" ? "선택한 학교 기준." : `${level === "all" ? "초·중·고·특수학교 합계" : HISTORY_LEVELS[level]+" 합계"} · 학생·교원·학급에는 분교 포함, 학교 수는 본교만 포함.`} 학교가 없는 학교급의 인원·학교 수는 0이며, 학급·교원이 0이면 비율을 산출하지 않습니다. — 는 비교 자료 없음 또는 기준값 0으로 증감률 산출 불가를 뜻합니다.</p>{!school && <p>지도나 목록에서 학교를 선택하면 학교별 추세도 볼 수 있습니다.</p>}{scope === "region" && <p>중구·동구·서구 등 당시 10개 군·구 기준입니다. 제물포구·영종구·서해구·검단구의 과거 추세로 해석할 수 없습니다. 이 선택은 지도 구역을 변경하지 않습니다.</p>}</details>
      {scope === "school" && <details className="ice-trend-note"><summary>학교 연결 기준·누락 연도 확인</summary><ul>{data.years.map(year=>{
        const review=schoolHistory?.reviews?.[year];
        return <li key={year}>{year}: {review?.note ?? schoolHistory?.methods[year] ?? "연결 근거 확인 필요"}{review?.evidenceUrl && <> · <a href={review.evidenceUrl} target="_blank" rel="noreferrer">교육청 교명변경 근거</a></>}</li>;
      })}</ul><p>2022~2023년에는 KEDI 코드가 없어 이름·학교급·본분교·주소를 대조합니다. 주소 부가표기는 도로명·건물번호와 우편번호 또는 전화·개교일을 교차 확인하고, 교명 변경은 교육청 근거를 확인합니다. ‘조사일 당시 개교 전’은 현재 미개교라는 뜻이 아닙니다. 9월 개교 학교는 다음 해 4월 1일 조사부터 포함됩니다. 빈 값은 학생 0명을 뜻하지 않습니다.</p></details>}
      <details className="ice-trend-note"><summary>출처와 비교 기준</summary><p>{data.quality.note}</p><p>교원 수는 휴직 포함, 강사 제외입니다. 그래프 세로축은 값 범위에 맞춰 확대되어 있습니다.</p><a href={data.source.url} target="_blank" rel="noreferrer">{data.source.name}</a></details>
    </section>;
  return <>
    <details className="ice-trends" open={!!school || undefined}>
      <summary>2022–2026 추세·증감률 <span>{place}</span></summary>
      {!expanded && content}
    </details>
    <dialog ref={dialogRef} className="ice-trend-dialog" aria-labelledby={dialogTitle} onCancel={event=>{event.preventDefault();setExpanded(false);}} onKeyDown={event=>{
      event.stopPropagation();
      if (event.key !== "Tab") return;
      const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled]), select, input, a[href], summary, [tabindex="0"]')).filter(el=>el.checkVisibility() && el.tabIndex >= 0);
      const first=controls[0], last=controls[controls.length-1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }} onClick={event=>{
      if(event.target !== event.currentTarget) return;
      const bounds=event.currentTarget.getBoundingClientRect();
      if(event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) setExpanded(false);
    }}>
      {expanded && <><header className="ice-trend-dialog-header"><div><h2 id={dialogTitle}>2022–2026 추세·증감률</h2><p>{place}</p></div><button ref={closeRef} type="button" className="ice-expand-button" onClick={()=>setExpanded(false)}>닫기</button></header>{content}</>}
    </dialog>
  </>;
}
