"use client";
import type { DataBundle } from "@/lib/data/types";
import { REGION_CODES, regionName } from "@/lib/geo/regions";
import { indicatorById } from "@/lib/indicators/registry";
import { valueMap } from "@/lib/stats";
import { useMapQuery } from "@/lib/state/urlState";

export default function RegionalComparison({ bundle }: { bundle: DataBundle }) {
  const { indicatorId, regionCode, setRegion, setView } = useMapQuery();
  const def = indicatorById(indicatorId)!;
  const values = valueMap(bundle.indicators[indicatorId]);
  const teachers = valueMap(bundle.indicators.teachers_total);
  const schools = valueMap(bundle.indicators.schools_total);
  const codes = [...REGION_CODES].sort((a,b) => (values.get(b) ?? -Infinity) - (values.get(a) ?? -Infinity));
  const maximum = Math.max(1, ...codes.map(c => values.get(c) ?? 0));
  return <section className="ice-comparison" aria-label="군구별 교육현황 비교"><div className="ice-section-heading"><div><span className="ice-eyebrow">REGIONAL OVERVIEW</span><h2>군·구별 현황</h2></div><span>11개 지역</span></div><p>{def.label} 순 · 지역을 선택하면 지도가 이동합니다.</p><div className="ice-table-scroll"><table><thead><tr><th scope="col">군·구</th><th scope="col">{def.label}</th><th scope="col">본교</th><th scope="col">교원</th></tr></thead><tbody>{codes.map(code => <tr key={code} data-selected={regionCode === code}><th scope="row"><button type="button" aria-pressed={regionCode === code} onClick={() => setRegion(regionCode === code ? null : code)}>{regionName(code)}</button></th><td><strong>{values.get(code) == null ? "자료 없음" : def.format(values.get(code)!)}</strong><span className="ice-value-track" aria-hidden><span style={{width:`${Math.max(0,(values.get(code) ?? 0) / maximum * 100)}%`}} /></span></td><td>{schools.get(code)?.toLocaleString("ko-KR") ?? "—"}</td><td>{teachers.get(code)?.toLocaleString("ko-KR") ?? "—"}</td></tr>)}</tbody></table></div><button className="ice-primary" type="button" onClick={() => setView("schools")}>{regionCode ? `${regionName(regionCode)} 학교 목록 보기` : "전체 학교 목록 보기"}</button></section>;
}
