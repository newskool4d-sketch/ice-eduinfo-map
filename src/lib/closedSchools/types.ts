/**
 * The shape of public/data/closed-schools.json (Task 5 — 폐교 지표), and the
 * `ClosedSchoolRow` row type used throughout src/**. Pure data types, no
 * React import — mirrors src/lib/schools/types.ts's SchoolsFile/School split,
 * and is imported by both client components (RegionPanel's 폐교 목록 section)
 * and scripts/pipeline/lib/closed-schools.ts (which produces the JSON this
 * type describes), same direction every other pipeline/frontend type sharing
 * in this repo already goes.
 */
import type { IndicatorSource, SchoolLevel } from "../indicators/types";

/**
 * One 폐교 row from 전북특별자치도교육청_폐교재산 현황. Personal-identifying
 * columns (담당자 부서명/전화번호) are intentionally never carried this far —
 * see scripts/pipeline/lib/closed-schools.ts's parseClosedSchoolsCsv.
 */
export interface ClosedSchoolRow {
  regionCode: string;
  name: string;
  year: number;
  level: SchoolLevel;
  /** Raw 활용현황구분명 cell (e.g. "미활용" | "자체활용") — kept verbatim, not normalized to a closed union, since the source's real value set isn't guaranteed stable across future refreshes. */
  usage: string;
  /** 건물연면적, ㎡. */
  buildingArea: number;
  /** 대지, ㎡. */
  siteArea: number;
  /** 소재지도로명주소, falling back to 소재지지번주소 when the road address is blank — same convention as scripts/pipeline/lib/schools.ts's LocationRow.address. */
  address: string;
}

/**
 * public/data/closed-schools.json's top-level shape (also mirrored,
 * unmodified, into data/interim/closed-schools-<YYYYMMDD>.json — see
 * build-closed-schools.ts). `referenceDate` is the source filename's own
 * date (날짜기준 규칙); `publishedAt` is the공공데이터포털 게시(갱신)일, which
 * can differ from `referenceDate` — see sources.ts's CLOSED_SCHOOLS_PUBLISHED_AT.
 */
export interface ClosedSchoolsFile {
  referenceDate: string;
  publishedAt: string;
  source: IndicatorSource;
  rows: ClosedSchoolRow[];
}
