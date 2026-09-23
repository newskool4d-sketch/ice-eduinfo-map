import { readFile, writeFile, mkdir } from "node:fs/promises";
import { parseHistory, type HistoricalRow } from "./lib/incheon-history";
const annual: Record<number,HistoricalRow[]>={};
await mkdir("data/interim/incheon/history-review",{recursive:true});
for(const year of [2022,2023,2024,2025,2026]){
  const file=year===2026 ? "data/raw/incheon/verified-20260923/kess-2026.download" : `data/raw/incheon/history/kess-${year}.xlsx`;
  annual[year]=parseHistory(await readFile(file),year);
  await writeFile(`data/interim/incheon/history-review/${year}.json`,JSON.stringify(annual[year],null,2));
  console.log(`${year}: ${annual[year].length} rows`);
}
const latest=JSON.parse(await readFile("data/output/incheon/latest.json","utf8"));
const audit=JSON.parse(await readFile(`data/output/incheon/${latest.path}/history-verification.json`,"utf8"));
const results=audit.unmatched.map((u:{schoolId:string;year:number})=>{
 const current=annual[2026].find(r=>`kedi:${r.code}`===u.schoolId)!;
 const anchor=annual[2024].find(r=>r.code===current.code)??current;
 const candidates=annual[u.year].filter(r=>r.level===anchor.level && r.branch===anchor.branch && (r.name===anchor.name || r.address===anchor.address || (r.telephone && r.telephone===anchor.telephone)));
 return {...u,current,anchor,candidates};
});
await writeFile("data/interim/incheon/history-review/candidates.json",JSON.stringify(results,null,2));
console.log(JSON.stringify({reviewRecords:results.length,output:"data/interim/incheon/history-review/candidates.json"}));
