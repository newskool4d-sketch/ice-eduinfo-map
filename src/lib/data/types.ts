/**
 * The shape of everything DataProvider loads once at startup. No React
 * import — plain data types shared by load.ts, DataProvider.tsx, and every
 * component that reads from useBundle().
 */
import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";

import type { ClosedSchoolsFile } from "../closedSchools/types";
import type { RegionFeature } from "../geo/geo";
import type { IndicatorFile, Manifest, SeriesFile } from "../indicators/types";
import type { SchoolsFile } from "../schools/types";

export type RegionsFeatureCollection = FeatureCollection<
  Polygon | MultiPolygon,
  RegionFeature["properties"]
>;

export type NeighborsFeatureCollection = FeatureCollection<
  Polygon | MultiPolygon,
  { code: string; name: string }
>;

export interface DataBundle {
  regions: RegionsFeatureCollection;
  neighbors: NeighborsFeatureCollection;
  /**
   * The raw charset string (not yet split into characters) — this is what
   * 추가 요구 #6's font gate loads/checks directly (`document.fonts.load(...,
   * bundle.charset)`). Callers that need deck.gl TextLayer's `characterSet:
   * string[]` prop (labelLayer.ts) derive it via `Array.from(bundle.charset)`
   * at the point of use (see DeckMap.tsx) rather than storing both shapes
   * here.
   */
  charset: string;
  manifest: Manifest;
  /** Task 4B — 전북 학교 점 위치 + KESS 통계 (school-level layer/panel data). */
  schools: SchoolsFile;
  /** Task 5 — 전북 폐교재산 현황 row list, backing RegionPanel's 폐교 목록 section (the closed_schools* indicator files only carry aggregated counts, not row-level 폐교명/연도/급/활용현황). */
  closedSchools: ClosedSchoolsFile;
  indicators: Record<string, IndicatorFile>;
  /**
   * Keyed by indicator id, but NOT guaranteed to have an entry for every
   * registry id: indicators with `aggregate.kind === 'external'` (currently
   * only students_change_5y) have no series/<id>.json file at all — see
   * build-indicators.ts, which explicitly skips writing one — so load.ts
   * doesn't fetch one either. Code that needs a specific series (e.g.
   * stats.ts's changeYearRange over series.students_total) must handle a
   * missing entry.
   */
  series: Record<string, SeriesFile>;
}
