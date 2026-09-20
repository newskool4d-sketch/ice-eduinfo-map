/**
 * The shape of everything DataProvider loads once at startup. No React
 * import — plain data types shared by load.ts, DataProvider.tsx, and every
 * component that reads from useBundle().
 */
import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";

import type { RegionFeature } from "../geo/geo";
import type { IndicatorFile, Manifest, SeriesFile } from "../indicators/types";

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
