/**
 * URL-synchronized state for the map's selected indicator and region, via
 * nuqs (v2). The URL is the single source of truth for both — share,
 * refresh, and back/forward all just re-derive state from it; no React
 * state duplicates these values anywhere else in the app (see the task
 * brief's "상태·데이터 흐름" excerpt).
 *
 * `region` is parsed/typed here but not wired to any UI yet — a later task
 * adds 시군 selection. useMapQuery() already exposes regionCode/setRegion so
 * that task won't need to touch this file.
 */
"use client";

import { parseAsStringLiteral, useQueryStates } from "nuqs";

import { REGION_CODES, type RegionCode } from "../geo/regions";
import { DEFAULT_INDICATOR_ID, INDICATOR_IDS } from "../indicators/registry";

/**
 * Invalid or missing -> DEFAULT_INDICATOR_ID. The map always has an
 * indicator selected, so this parser never surfaces null to callers.
 */
export const indicatorParser = parseAsStringLiteral(INDICATOR_IDS).withDefault(DEFAULT_INDICATOR_ID);

/**
 * Invalid or missing -> null (no 시군 selected). REGION_CODES deliberately
 * excludes '52000' (전북 전체, the province aggregate row) — it is not a
 * selectable 시군, so `?region=52000` parses to null same as any other
 * unrecognized value.
 */
export const regionParser = parseAsStringLiteral(REGION_CODES);

/** Shared by useMapQuery() and tests/unit/urlState.test.ts's createLoader() check. */
export const mapQueryParsers = {
  indicator: indicatorParser,
  region: regionParser,
};

export interface MapQuery {
  indicatorId: string;
  regionCode: RegionCode | null;
  /** Replaces the current history entry — switching indicators doesn't clutter back/forward. */
  setIndicator: (id: string) => void;
  /** Pushes a new history entry — back/forward toggles the 시군 selection, per the task brief. */
  setRegion: (code: RegionCode | null) => void;
}

/**
 * The single hook every component reads/writes {indicator, region} through.
 * Multiple components may call this independently (e.g. both Dashboard and
 * IndicatorMenu do) — nuqs keeps them in sync via the URL, so no prop
 * drilling of the setters is needed.
 */
export function useMapQuery(): MapQuery {
  const [{ indicator, region }, setQuery] = useQueryStates(mapQueryParsers, {
    history: "replace",
    shallow: true,
  });

  return {
    indicatorId: indicator,
    regionCode: region,
    setIndicator(id) {
      void setQuery({ indicator: id });
    },
    setRegion(code) {
      void setQuery({ region: code }, { history: "push" });
    },
  };
}
