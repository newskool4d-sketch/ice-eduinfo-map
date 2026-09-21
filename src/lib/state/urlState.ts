/**
 * URL-synchronized state for the map's selected indicator and region, via
 * nuqs (v2). The URL is the single source of truth for both — share,
 * refresh, and back/forward all just re-derive state from it; no React
 * state duplicates these values anywhere else in the app (see the task
 * brief's "상태·데이터 흐름" excerpt).
 *
 * `region` (시군 selection) is parsed/typed here the same way. useMapQuery()
 * exposes both as regionCode/setRegion, consumed by Dashboard/DeckMap for
 * the map's click/keyboard/RegionList selection.
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
  /**
   * A transition to/from "nothing selected" (null <-> code) pushes a new
   * history entry — Back after Esc/✕ restores the prior selection, and Back
   * after the first selection returns to the unselected list, per the task
   * brief. A transition BETWEEN two selected regions (arrow-key cycling, a
   * canvas click on a different region, …) instead REPLACES the current
   * entry, so cycling doesn't push one history entry per step (fix round 1,
   * review finding #2) — see the history-mode branch inside useMapQuery.
   */
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
      // History semantics (fix round 1, review finding #2): only a
      // transition to/from "nothing selected" pushes — a transition between
      // two selected regions (any path: arrow keys, a list click while
      // already selected, a canvas click on a different region, ...)
      // replaces instead, so e.g. cycling ←/→ through several regions
      // doesn't push one history entry per step (which would make a single
      // Back only undo the last step, instead of leaving the map). `region`
      // here is the CURRENT value from this render's useQueryStates()
      // destructure above, so this always compares against the selection
      // being replaced, not a stale snapshot.
      const history = code === null || region === null ? "push" : "replace";
      void setQuery({ region: code }, { history });
    },
  };
}
