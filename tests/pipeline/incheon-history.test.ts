import { describe, expect, it } from "vitest";
import { aggregateHistory, uniqueHistoryMatch, reviewedHistoryMatch, missingHistoryReview, historicalRoadAddress, type HistoricalRow } from "../../scripts/pipeline/lib/incheon-history";
import { historyChange } from "../../src/lib/data/incheonHistory";
import { readFileSync } from "node:fs";
import type { IncheonHistory } from "../../src/lib/data/incheonHistory";

const row: HistoricalRow={year:2022,row:20,code:"",name:"인천학교",level:"elem",branch:false,address:"인천광역시 학교로 1",region:"중구",values:{students:100,teachers:10,classes:5,schools:1,studentsPerClass:20,studentsPerTeacher:10}};
describe("Incheon historical comparison rules",()=>{
  it("normalizes only supplemental address text and preserves building numbers",()=>{
    expect(historicalRoadAddress("인천광역시 서구 영종대로277번길 117(동명.학교)" )).toBe("인천광역시서구영종대로277번길|117");
    expect(historicalRoadAddress("인천광역시 부평구 산청로127번길 12-5(청천동)")).not.toBe(historicalRoadAddress("인천광역시 부평구 산청로127번길 10(청천동)"));
    expect(historicalRoadAddress("주소 미상")).toBeNull();
  });
  it("requires supplemental identity evidence and refuses duplicate candidates",()=>{
    const anchor={...row,code:"123",postalCode:"12345",address:"인천광역시 학교로 1(동명)",year:2024};
    const old={...row,postalCode:"12345"};
    expect(reviewedHistoryMatch(anchor,[old],2022,[])?.status).toBe("address_normalized");
    expect(reviewedHistoryMatch(anchor,[{...old,postalCode:""}],2022,[])).toBeUndefined();
    expect(reviewedHistoryMatch(anchor,[old,old],2022,[])).toBeUndefined();
    expect(reviewedHistoryMatch(anchor,[{...old,address:"인천광역시 학교로 2"}],2022,[])).toBeUndefined();
    expect(reviewedHistoryMatch(anchor,[old],2024,[])).toBeUndefined();
  });
  it("uses only source-backed aliases before their effective date",()=>{
    const anchor={...row,code:"123",postalCode:"12345",name:"새학교",year:2024};
    const old={...row,name:"옛학교",postalCode:"12345"};
    const alias={code:"123",oldName:"옛학교",newName:"새학교",effectiveDate:"20240301"};
    expect(reviewedHistoryMatch(anchor,[old],2022,[alias])?.status).toBe("renamed");
    expect(reviewedHistoryMatch(anchor,[old],2022,[])).toBeUndefined();
    expect(reviewedHistoryMatch(anchor,[old],2023,[{...alias,effectiveDate:"20220301"}])).toBeUndefined();
  });
  it("classifies dates relative to April 1, not just the calendar year",()=>{
    expect(missingHistoryReview({...row,openingDate:"20230901"},[],2023).note).toContain("조사일 당시 개교 전 · 개교일 2023-09-01");
    expect(missingHistoryReview({...row,openingDate:"20230901"},[],2023).status).toBe("before_opening");
    expect(missingHistoryReview({...row,openingDate:"20230301"},[],2023).status).toBe("unresolved");
    expect(missingHistoryReview({...row,openingDate:"20230901"},[row],2023).status).toBe("unresolved");
    expect(missingHistoryReview(row,[],2023).status).toBe("unresolved");
  });
  it("keeps missing and zero denominator distinct from zero growth",()=>{
    expect(historyChange(0,100)).toEqual({difference:-100,percent:-100});
    expect(historyChange(100,0)).toEqual({difference:100,percent:null});
    expect(historyChange(null,100)).toEqual({difference:null,percent:null});
    expect(historyChange(100,100)).toEqual({difference:0,percent:0});
  });
  it("rejects ambiguous names, changed addresses and branch mismatches before codes",()=>{
    expect(uniqueHistoryMatch(row,[row,row])).toBeUndefined();
    expect(uniqueHistoryMatch(row,[{...row,address:"인천광역시 학교로 2"}])).toBeUndefined();
    expect(uniqueHistoryMatch(row,[{...row,branch:true}])).toBeUndefined();
    expect(uniqueHistoryMatch(row,[{...row,address:"인천광역시  학교로 1"}])).toBeDefined();
  });
  it("uses KEDI identities across a rename without accepting a different school level",()=>{
    const coded={...row,code:"123"};
    expect(uniqueHistoryMatch(coded,[{...coded,name:"바뀐이름"}])).toBeDefined();
    expect(uniqueHistoryMatch(coded,[{...coded,level:"mid"}])).toBeUndefined();
  });
  it("aggregates ratios from counts and includes branch pupils but not branch school count",()=>{
    const result=aggregateHistory([row,{...row,branch:true,values:{...row.values,students:20,teachers:2,classes:1,schools:0}}],2022);
    expect(result).toMatchObject({students:120,schools:1,teachers:12,classes:6,studentsPerClass:20,studentsPerTeacher:10});
  });
  it("reconciles every year and metric from the ten source districts to the province",()=>{
    const data=JSON.parse(readFileSync("public/data/incheon/history.json","utf8")) as IncheonHistory;
    expect(Object.keys(data.regions)).toHaveLength(10);
    expect(Object.keys(data.schools)).toHaveLength(562);
    for(const p of data.province) for(const key of ["students","teachers","classes","schools"] as const){
      expect(Object.values(data.regions).reduce((n,rows)=>n+rows.find(r=>r.year===p.year)![key]!,0)).toBe(p[key]);
    }
    expect(data.province.at(-1)).toMatchObject({year:2026,students:297660,teachers:24920,schools:555});
    for(const school of Object.values(data.schools)) expect(school.points.map(p=>p.year)).toEqual(data.years);
  });
  it("reconciles four school levels across all years and districts and uses weighted ratios",()=>{
    const data=JSON.parse(readFileSync("public/data/incheon/history.json","utf8")) as IncheonHistory;
    const levels=Object.values(data.byLevel!);
    expect(levels).toHaveLength(4);
    for(const year of data.years) for(const region of [null,...Object.keys(data.regions)]){
      const total=(region ? data.regions[region] : data.province).find(p=>p.year===year)!;
      const parts=levels.map(l=>(region ? l.regions[region] : l.province).find(p=>p.year===year)!);
      for(const k of ["students","teachers","classes","schools"] as const) expect(parts.reduce((n,p)=>n+p[k]!,0)).toBe(total[k]);
      for(const p of parts){
        expect(p.studentsPerClass).toBe(p.classes ? p.students!/p.classes : null);
        expect(p.studentsPerTeacher).toBe(p.teachers ? p.students!/p.teachers : null);
      }
    }
    const published=JSON.parse(readFileSync("data/manual/incheon/numeric-review.json","utf8"));
    for(const r of published.historicalTeacherControls) expect(data.byLevel![r.level as "elem"|"mid"|"high"].province.find(p=>p.year===r.year)!.teachers).toBe(r.icePublished);
  });
});
