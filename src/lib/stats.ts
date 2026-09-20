/**
 * Pure derived-stat helpers over indicator data. No React import — usable
 * from both client components (via useMemo) and plain unit tests.
 *
 * "52000" (전북 전체) is always read directly from the data, never
 * recomputed here: the pipeline's ratio rows for 52000 are already Σ/Σ, not
 * an average of the 14 시군 averages, so client-side recomputation would be
 * both redundant and wrong for ratio-kind indicators.
 */
import { PROVINCE_CODE } from "./geo/regions";
import type { IndicatorDef, IndicatorFile, Manifest, SeriesFile } from "./indicators/types";

/**
 * Extracts a region-code -> value map from an indicator file, keeping only
 * the rows WITHOUT a `level` (the map is never used for the 지도, which must
 * not read byLevel breakdown rows). Null values are preserved (not dropped)
 * so callers can distinguish "no data" from "region absent".
 */
export function valueMap(file: IndicatorFile): Map<string, number | null> {
  const map = new Map<string, number | null>();
  for (const row of file.rows) {
    if (row.level !== undefined) continue;
    map.set(row.regionCode, row.value);
  }
  return map;
}

export interface RegionValue {
  code: string;
  value: number | null;
}

/** The 14 시군 entries of `map`, excluding the 52000 (전북 전체) aggregate row. */
export function regionValues(map: Map<string, number | null>): RegionValue[] {
  const values: RegionValue[] = [];
  for (const [code, value] of map) {
    if (code === PROVINCE_CODE) continue;
    values.push({ code, value });
  }
  return values;
}

/**
 * Ranks the 14 시군 by descending raw value. 1위 = 가장 큰 값; polarity 와
 * 무관 — every polarity (higherWorse/higherBetter/neutral) ranks in the
 * same direction (the brief's spec states "큰 값이 1위" identically for all
 * three). Regions with a null value are omitted entirely (never assigned a
 * rank). Ties share the same rank, competition-style (e.g. values
 * [10, 10, 8] -> ranks [1, 1, 3], not [1, 1, 2]).
 *
 * Fix round 1 (review finding #3): this function used to also accept a
 * `polarity` parameter that had no effect on the result. Removed entirely
 * per the controller's ruling, rather than keeping an unused parameter
 * around — see task-2-report.md's "Fix round 1" section.
 */
export function rank(map: Map<string, number | null>): Map<string, number> {
  const values = regionValues(map).filter(
    (r): r is { code: string; value: number } => r.value !== null,
  );
  values.sort((a, b) => b.value - a.value);

  const result = new Map<string, number>();
  let lastValue: number | null = null;
  let lastRank = 0;
  values.forEach((r, i) => {
    if (r.value !== lastValue) {
      lastRank = i + 1;
      lastValue = r.value;
    }
    result.set(r.code, lastRank);
  });
  return result;
}

/** `value(code) - value(52000)`, or null if either side is null/missing. */
export function vsProvince(map: Map<string, number | null>, code: string): number | null {
  const value = map.get(code);
  const province = map.get(PROVINCE_CODE);
  if (value === null || value === undefined || province === null || province === undefined) {
    return null;
  }
  return value - province;
}

/**
 * `value(code) / value(52000) * 100` — a 시군's share of the 전북 province
 * total, on a 0-100 scale (Task 5, Section D — "전북 대비" 표기 수정). Only
 * meaningful for count-kind indicators (where 52000 really is Σ of the 14
 * 시군), unlike `vsProvince`'s subtraction, which is used for ratio-kind
 * indicators instead. Returns null when either side is null/missing, or
 * when the province total itself is 0 (share is undefined, not Infinity/NaN).
 */
export function shareOfProvince(map: Map<string, number | null>, code: string): number | null {
  const value = map.get(code);
  const province = map.get(PROVINCE_CODE);
  if (value === null || value === undefined || province === null || province === undefined || province === 0) {
    return null;
  }
  return (value / province) * 100;
}

/** A region's {year, value} rows from a series file, sorted by ascending year. */
export function trend(series: SeriesFile, code: string): { year: number; value: number | null }[] {
  return series.rows
    .filter((r) => r.regionCode === code)
    .map((r) => ({ year: r.year, value: r.value }))
    .sort((a, b) => a.year - b.year);
}

/**
 * `value(latestYear) - value(immediately preceding available year)` for a
 * region, or null when there's no preceding year, the latest year itself is
 * absent, or either value is null.
 */
export function deltaPrevYear(series: SeriesFile, code: string, latestYear: number): number | null {
  const rows = trend(series, code);
  const idx = rows.findIndex((r) => r.year === latestYear);
  if (idx <= 0) return null;
  const latest = rows[idx].value;
  const prev = rows[idx - 1].value;
  if (latest === null || prev === null) return null;
  return latest - prev;
}

/**
 * [minYear, maxYear] across a series' rows, or null when the series is
 * unavailable (e.g. an `aggregate.kind === 'external'` indicator like
 * students_change_5y has no series/<id>.json of its own — see load.ts) or
 * empty. Used by displayLabel() below for the 추가 요구 #5 dynamic-year
 * caption.
 */
export function changeYearRange(series: SeriesFile | undefined): [number, number] | null {
  if (!series || series.rows.length === 0) return null;
  let min = Infinity;
  let max = -Infinity;
  for (const row of series.rows) {
    if (row.year < min) min = row.year;
    if (row.year > max) max = row.year;
  }
  return [min, max];
}

/**
 * The indicator label to display to the user. Identical to `def.label` for
 * every indicator except students_change_5y (추가 요구 #5): its registry
 * label hardcodes "5년" (5-year), but the actual comparison span is
 * whatever [minYear, maxYear] the students_total series covers (currently
 * 2022→2026, a 4-year span — see build-indicators.ts's computeChange5y,
 * which falls back to the oldest available year when latestYear-5 doesn't
 * exist). Replaces the "5년" substring with the real "{min}→{max}" span so
 * the label never claims a span the data doesn't have; falls back to the
 * static label if the students_total series isn't in `series` (e.g. bundle
 * not fully loaded yet).
 */
export function displayLabel(def: IndicatorDef, series: Record<string, SeriesFile>): string {
  if (def.id === "students_change_5y") {
    const range = changeYearRange(series.students_total);
    if (range) return def.label.replace("5년", `${range[0]}→${range[1]}`);
  }
  return def.label;
}

/**
 * The top bar's "기준 YYYY.M.D" caption (TopBar). The year comes from
 * `manifest.latestYear` — the dataset's single authoritative "as of" year —
 * while month/day come from the given indicator file's own `referenceDate`
 * (e.g. "2026-04-01"). Every indicator file currently shares the same
 * referenceDate, but this keeps the caption tied to whichever file the
 * caller is actually displaying rather than assuming that will always hold.
 * No zero-padding (2026.4.1, not 2026.04.01), per the task brief's literal
 * example.
 */
export function referenceDateLabel(manifest: Manifest, file: IndicatorFile): string {
  const [, month, day] = file.referenceDate.split("-").map(Number);
  return `기준 ${manifest.latestYear}.${month}.${day}`;
}
