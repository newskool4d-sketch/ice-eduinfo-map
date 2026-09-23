import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import * as XLSX from "xlsx";
import { HEADER_MAP, LEVEL_MAP } from "../sources";
import { HISTORY_YEARS, type HistoryPoint, type HistoryValues, type IncheonHistory, type HistoryReview, type HistorySchoolLevel } from "../../../src/lib/data/incheonHistory";
import type { IncheonSchool } from "./incheon";

export interface HistoricalRow {
  year: number; row: number; code: string; name: string; level: string;
  branch: boolean; address: string; region: string; values: HistoryValues;
  openingDate?: string; telephone?: string; postalCode?: string;
}
const norm = (v: unknown) => String(v ?? "").replace(/\s+/g, "");
export const identityKey = (r: Pick<HistoricalRow, "name" | "level" | "branch" | "address">) =>
  [norm(r.name), r.level, r.branch, norm(r.address)].join("|");

export function parseHistory(bytes: Buffer, year: number): HistoricalRow[] {
  const book = XLSX.read(bytes, { type: "buffer", sheets: ["학교별 주요통계"] });
  const sheet = book.Sheets["학교별 주요통계"];
  if (!sheet) throw new Error(`Missing historical sheet: ${year}`);
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null });
  if (!rows.slice(0, 20).some(r => new RegExp(`조사\\s*기준일\\s*:\\s*${year}\\.\\s*4\\.\\s*1\\.`).test(String(r[0])))) throw new Error(`Wrong reference date: ${year}`);
  const h = rows.findIndex(r => norm(r[1]) === "시도" && norm(r[4]) === "학교급");
  if (h < 0) throw new Error(`Missing header: ${year}`);
  const header = rows[h].map(norm);
  const col = (name: string) => { const i = header.indexOf(norm(name)); if (i < 0) throw new Error(`Missing ${name}: ${year}`); return i; };
  const labels = HEADER_MAP[year];
  const columns = Object.fromEntries(["sido", "regionName", "level", "name", "branch", "status", "address", "students", "teachers", "classes"].map(k => [k, col(labels[k as keyof typeof labels]!)]));
  const codeCol = labels.kediCode ? col(labels.kediCode) : -1;
  const schoolCountCol = col("학교수");
  const openingCol = col("개교일"), phoneCol = col("전화번호"), postalCol = col("우편번호");
  return rows.flatMap((r, i) => {
    if (i <= h || norm(r[columns.sido]) !== "인천" || !LEVEL_MAP[String(r[columns.level])]) return [];
    const status = norm(r[columns.status]);
    if (!["기존(원)교", "신설(원)교", "휴(원)교", "폐(원)교"].includes(status)) throw new Error(`Unknown status ${year}:${i+1}`);
    if (status === "폐(원)교") return [];
    const branchValue = norm(r[columns.branch]);
    if (!["본교", "분교장"].includes(branchValue)) throw new Error(`Unknown campus ${year}:${i+1}`);
    const numeric = (c: number): number => {
      const value = r[c];
      if (typeof value !== "number" || !Number.isInteger(value) || value < 0) throw new Error(`Missing count ${year}:${i+1}:${c}`);
      return value;
    };
    const students = numeric(columns.students), teachers = numeric(columns.teachers), classes = numeric(columns.classes), schools = numeric(schoolCountCol);
    if (schools !== (branchValue === "본교" ? 1 : 0)) throw new Error(`School count mismatch ${year}:${i+1}`);
    return [{year, row: i+1, code: codeCol < 0 ? "" : norm(r[codeCol]), name: String(r[columns.name]), level: LEVEL_MAP[String(r[columns.level])], branch: branchValue === "분교장", address: String(r[columns.address]), region: norm(r[columns.regionName]),
      openingDate: norm(r[openingCol]), telephone: norm(r[phoneCol]), postalCode: norm(r[postalCol]),
      values: {students, teachers, classes, schools, studentsPerClass: classes ? students/classes : null, studentsPerTeacher: teachers ? students/teachers : null}}];
  });
}
export function aggregateHistory(rows: HistoricalRow[], year: number): HistoryPoint {
  const sum = (k: "students" | "teachers" | "classes" | "schools") => rows.reduce((n,r) => { if (r.values[k] === null) throw new Error(`Missing ${k}`); return n+r.values[k]; }, 0);
  const students=sum("students"), teachers=sum("teachers"), classes=sum("classes");
  return {year, students, teachers, classes, schools:sum("schools"), studentsPerClass:classes ? students/classes : null, studentsPerTeacher:teachers ? students/teachers : null};
}
export function uniqueHistoryMatch(row: HistoricalRow, candidates: HistoricalRow[]): HistoricalRow | undefined {
  const matches = candidates.filter(candidate => row.code ? candidate.code === row.code && candidate.level === row.level && candidate.branch === row.branch : identityKey(candidate) === identityKey(row));
  return matches.length === 1 ? matches[0] : undefined;
}
export interface HistoricalRename { code: string; oldName: string; newName: string; effectiveDate: string }
/** Only extract a complete road name AND building number; never discard a building-number difference. */
export function historicalRoadAddress(address: string): string | null {
  const match = /^(.+(?:대로|로|길))\s+(\d+(?:-\d+)?)/.exec(address);
  return match ? `${norm(match[1])}|${match[2]}` : null;
}
export function reviewedHistoryMatch(reference: HistoricalRow, candidates: HistoricalRow[], year: number, renames: HistoricalRename[]) {
  const lookup = {...reference, code: year < 2024 ? "" : reference.code};
  const exact = uniqueHistoryMatch(lookup, candidates);
  if (exact) return {row:exact, status:"matched" as const};
  if (year >= 2024) return undefined; // A different KEDI code is never repaired by a name/address guess.
  const aliases = renames.filter(r=>r.code===reference.code && r.newName===reference.name && `${year}0401` < r.effectiveDate).map(r=>r.oldName);
  const road = historicalRoadAddress(reference.address);
  if (!road) return undefined;
  const matches = candidates.filter(r => r.level===reference.level && r.branch===reference.branch && r.region===reference.region &&
    (norm(r.name)===norm(reference.name) || aliases.includes(r.name)) && historicalRoadAddress(r.address)===road &&
    ((/^\d{5}$/.test(reference.postalCode ?? "") && r.postalCode===reference.postalCode) ||
    (/^\d{8}$/.test(reference.openingDate ?? "") && r.openingDate===reference.openingDate &&
      /^0[\d-]{8,}$/.test(reference.telephone ?? "") && r.telephone===reference.telephone)));
  if (matches.length !== 1) return undefined;
  return {row:matches[0],status:matches[0].name===reference.name ? "address_normalized" as const : "renamed" as const};
}
export function missingHistoryReview(anchor: HistoricalRow, candidates: HistoricalRow[], year: number): HistoryReview {
  const sameName = candidates.filter(r=>norm(r.name)===norm(anchor.name) && r.level===anchor.level && r.branch===anchor.branch);
  const opening=anchor.openingDate ?? "";
  if (/^\d{8}$/.test(opening) && opening > `${year}0401` && sameName.length===0) return {
    status:"before_opening", note:`조사일 당시 개교 전 · 개교일 ${opening.slice(0,4)}-${opening.slice(4,6)}-${opening.slice(6,8)} (KESS 기준). 개교 후 4월 1일 조사부터 추세에 포함`,
  };
  return {status:"unresolved",note:sameName.length ? "동명 학교 원자료 있음 · 주소/식별정보 차이로 연결 보류 (이전·주소 정정 여부 미확정)" : "연결 근거 부족 · 원자료 미존재 또는 식별정보 변경 여부 추가 확인 필요"};
}
export async function buildIncheonHistory(root: string, current: IncheonSchool[], currentBytes: Buffer) {
  const manifestBytes = await readFile(path.join(root,"data/manual/incheon/history-inputs.json"));
  const inputs = JSON.parse(manifestBytes.toString()) as { files: {year: number; path: string; sha256: string; url: string}[] };
  const renameBytes=await readFile(path.join(root,"data/manual/incheon/history-renames.json"));
  const renameInput=JSON.parse(renameBytes.toString()) as {source:{path:string;sha256:string;url:string};renames:HistoricalRename[]};
  if (path.isAbsolute(renameInput.source.path) || renameInput.source.path.includes("..")) throw new Error("Invalid rename source path");
  const renameSource=await readFile(path.join(root,renameInput.source.path));
  if (createHash("sha256").update(renameSource).digest("hex")!==renameInput.source.sha256) throw new Error("Rename source hash mismatch");
  const sourceRows=(renameSource.toString().match(/<tr[\s\S]*?<\/tr>/g)??[]).map(r=>r.replace(/<[^>]+>/g," ").replace(/\s+/g," "));
  for(const rename of renameInput.renames) if (!sourceRows.some(r=>r.includes(rename.oldName)&&r.includes(rename.newName)&&r.includes(rename.effectiveDate))) throw new Error(`Rename not supported by official source: ${rename.oldName}`);
  const annual: Record<number, HistoricalRow[]> = {2026: parseHistory(currentBytes,2026)};
  for (const year of HISTORY_YEARS.filter(y => y !== 2026)) {
    const input=inputs.files.find(f=>f.year===year);
    if (!input || path.isAbsolute(input.path) || input.path.includes("..")) throw new Error(`Invalid history input: ${year}`);
    const bytes=await readFile(path.join(root,input.path));
    if (createHash("sha256").update(bytes).digest("hex")!==input.sha256) throw new Error(`History hash mismatch: ${year}`);
    annual[year]=parseHistory(bytes,year);
  }
  const regionNames=["강화군","계양구","남동구","동구","미추홀구","부평구","서구","연수구","옹진군","중구"];
  for (const year of HISTORY_YEARS) {
    if (new Set(annual[year].map(r=>r.region)).size !== 10 || annual[year].some(r=>!regionNames.includes(r.region))) throw new Error(`Unexpected source regions ${year}`);
    const codes=annual[year].map(r=>r.code).filter(Boolean);
    if (new Set(codes).size !== codes.length) throw new Error(`Duplicate school codes ${year}`);
  }
  if (annual[2026].length!==current.length || current.some(s=> {const r=annual[2026].find(r=>r.code===s.kediCode);return !r || r.values.students!==s.students || r.values.teachers!==s.teachers || r.values.classes!==s.classes || r.values.schools!==s.schoolCountFlag;})) throw new Error("History/current 2026 mismatch");
  const data: IncheonHistory = { years:[...HISTORY_YEARS], source:{url:"https://kess.kedi.re.kr/contents/dataset",name:"KESS 학교별 주요통계 · 매년 4월 1일"}, province:HISTORY_YEARS.map(y=>aggregateHistory(annual[y],y)), regions:{}, schools:{}, quality:{status:"PARTIAL",note:"군·구는 각 연도 원자료의 4월 기준 10개 구역입니다. 지도(2026년 7월, 11개 구역)와 다릅니다. 학교의 과거 좌표는 검증하지 않았습니다. 교원은 정규·기간제 합계이며 별도 독립 총계 검증은 미완료입니다."} };
  for (const name of regionNames) data.regions[name]=HISTORY_YEARS.map(y=>aggregateHistory(annual[y].filter(r=>r.region===name),y));
  const levels: HistorySchoolLevel[] = ["elem", "mid", "high", "special"];
  data.byLevel = Object.fromEntries(levels.map(level => [level, {
    province: HISTORY_YEARS.map(y=>aggregateHistory(annual[y].filter(r=>r.level===level),y)),
    regions: Object.fromEntries(regionNames.map(region=>[region,HISTORY_YEARS.map(y=>aggregateHistory(annual[y].filter(r=>r.level===level && r.region===region),y))])),
  }])) as NonNullable<IncheonHistory["byLevel"]>;
  for (const year of HISTORY_YEARS) for (const field of ["students","teachers","classes","schools"] as const) {
    const total=levels.reduce((n,level)=>n+data.byLevel![level].province.find(p=>p.year===year)![field]!,0);
    if (total!==data.province.find(p=>p.year===year)![field]) throw new Error(`Level aggregate mismatch: ${year}/${field}`);
  }
  const unmatched: {schoolId:string;name:string;year:number;reason:string;status:string;openingDate?:string}[]=[];
  const repaired: {schoolId:string;year:number;status:string;reference:HistoricalRow;matched:HistoricalRow}[]=[];
  const used = new Set<string>();
  for (const school of current) {
    const anchor=annual[2026].find(r=>r.code===school.kediCode)!;
    const history={points:[] as HistoryPoint[],methods:{} as Record<string,string>,reviews:{} as Record<string,HistoryReview>};
    for (const year of HISTORY_YEARS) {
      // For pre-code years, match to this school's 2024 record only; never fuzzy-match a renamed/moved campus.
      const reference=year < 2024 ? uniqueHistoryMatch(anchor,annual[2024]) : anchor;
      const resolved=reference ? reviewedHistoryMatch(reference,annual[year],year,renameInput.renames) : undefined;
      if (resolved) {
        const {row:match,status}=resolved;
        const key=`${year}:${match.row}`;
        if (used.has(key)) throw new Error(`Historical row assigned to multiple current schools: ${key}`);
        used.add(key);
        history.points.push({year,...match.values});
        const note=status==="renamed" ? `교명 변경 확인: ${match.name} → ${reference!.name} · 동일 도로명·건물번호 및 보조 식별정보 확인` :
          status==="address_normalized" ? "주소 부가표기 차이 보완 · 학교명·학교급·본분교·도로명·건물번호 및 보조 식별정보 일치" :
          year<2024 ? "학교명·학교급·본분교·주소 일치 (2024 원자료 연결)" : "KEDI 코드·학교급·본분교 일치";
        history.methods[year]=note;
        history.reviews[year]={status,note,sourceRow:match.row,sourceName:match.name,...(status==="renamed" ? {evidenceUrl:renameInput.source.url} : {})};
        if(status!=="matched") repaired.push({schoolId:school.id,year,status,reference:reference!,matched:match});
      } else {
        const review=missingHistoryReview(anchor,annual[year],year);
        history.reviews[year]=review;
        history.points.push({year,students:null,teachers:null,classes:null,schools:null,studentsPerClass:null,studentsPerTeacher:null});
        unmatched.push({schoolId:school.id,name:school.name,year,reason:review.note,status:review.status,openingDate:anchor.openingDate});
      }
    }
    data.schools[school.id]=history;
  }
  const audit={ inputManifestHash:createHash("sha256").update(manifestBytes).update(renameBytes).digest("hex"), inputs, renameInput, repaired, annual:HISTORY_YEARS.map(year=>({year,records:annual[year].length,matchedCurrentSchools:current.filter(s=>data.schools[s.id].methods[year]).length,beforeOpening:unmatched.filter(r=>r.year===year&&r.status==="before_opening").length,unresolved:unmatched.filter(r=>r.year===year&&r.status==="unresolved").length,total:data.province.find(p=>p.year===year)})), unmatched,
    note:"전체·군구 집계는 당해 원자료 전체를 사용하며 현재 학교와 연결되지 않는 과거 학교도 포함합니다. 학교별 연결 공백은 0이 아닙니다." };
  return {data,audit};
}
