import { describe, expect, it } from "vitest";

import {
  changeYearRange,
  deltaPrevYear,
  displayLabel,
  rank,
  regionValues,
  trend,
  valueMap,
  vsProvince,
} from "@/lib/stats";
import type { IndicatorDef, IndicatorFile, SeriesFile } from "@/lib/indicators/types";
import { formatInt } from "@/lib/format";

function fileFixture(): IndicatorFile {
  return {
    id: "students_total",
    year: 2026,
    referenceDate: "2026-04-01",
    source: { name: "KESS", url: "https://example.com", year: 2026 },
    rows: [
      { regionCode: "52110", value: 100 },
      { regionCode: "52130", value: 50 },
      { regionCode: "52000", value: 150 },
      // byLevel breakdown rows (level set) — must be excluded by valueMap.
      { regionCode: "52110", value: 60, level: "elem" },
      { regionCode: "52130", value: 30, level: "elem" },
      { regionCode: "52000", value: 90, level: "elem" },
    ],
  };
}

describe("valueMap", () => {
  it("keeps only rows without a level, keyed by regionCode", () => {
    const map = valueMap(fileFixture());
    expect(map.size).toBe(3);
    expect(map.get("52110")).toBe(100);
    expect(map.get("52130")).toBe(50);
    expect(map.get("52000")).toBe(150);
  });

  it("preserves null values (not dropped)", () => {
    const file: IndicatorFile = {
      ...fileFixture(),
      rows: [{ regionCode: "52110", value: null }],
    };
    const map = valueMap(file);
    expect(map.get("52110")).toBeNull();
  });
});

describe("regionValues", () => {
  it("excludes 52000 and returns the remaining {code, value} pairs", () => {
    const map = valueMap(fileFixture());
    const values = regionValues(map);
    expect(values).toHaveLength(2);
    expect(values.map((v) => v.code).sort()).toEqual(["52110", "52130"]);
    expect(values.find((v) => v.code === "52000")).toBeUndefined();
  });
});

describe("rank", () => {
  // Fix round 1 (review finding #3): `rank` no longer takes a `polarity`
  // parameter at all — ranking is always by descending raw value (1위 =
  // 가장 큰 값), for every polarity, per the controller's ruling. The three
  // near-duplicate per-polarity tests that used to pin this down (when
  // `polarity` was still an accepted-but-unused argument) are collapsed
  // into one, since there is no longer a parameter to vary.
  it("ranks the 14 시군 by descending raw value (largest = rank 1), excluding 52000", () => {
    const map = new Map([
      ["52110", 30],
      ["52130", 10],
      ["52140", 20],
      ["52000", 999],
    ]);
    const ranks = rank(map);
    expect(ranks.get("52110")).toBe(1);
    expect(ranks.get("52140")).toBe(2);
    expect(ranks.get("52130")).toBe(3);
    expect(ranks.has("52000")).toBe(false);
  });

  it("gives ties the same (competition-style) rank and skips the next", () => {
    const map = new Map([
      ["52110", 10],
      ["52130", 10],
      ["52140", 8],
    ]);
    const ranks = rank(map);
    expect(ranks.get("52110")).toBe(1);
    expect(ranks.get("52130")).toBe(1);
    expect(ranks.get("52140")).toBe(3); // skips rank 2
  });

  it("omits regions with a null value entirely", () => {
    const map = new Map<string, number | null>([
      ["52110", 10],
      ["52130", null],
    ]);
    const ranks = rank(map);
    expect(ranks.has("52130")).toBe(false);
    expect(ranks.get("52110")).toBe(1);
  });
});

describe("vsProvince", () => {
  it("returns value minus the 52000 row", () => {
    const map = valueMap(fileFixture());
    expect(vsProvince(map, "52110")).toBe(100 - 150);
  });

  it("returns null when the region's own value is null", () => {
    const map = new Map<string, number | null>([
      ["52110", null],
      ["52000", 150],
    ]);
    expect(vsProvince(map, "52110")).toBeNull();
  });

  it("returns null when the province value is null", () => {
    const map = new Map<string, number | null>([
      ["52110", 100],
      ["52000", null],
    ]);
    expect(vsProvince(map, "52110")).toBeNull();
  });
});

function seriesFixture(): SeriesFile {
  return {
    id: "students_total",
    rows: [
      { regionCode: "52110", year: 2024, value: 100 },
      { regionCode: "52110", year: 2022, value: 80 },
      { regionCode: "52110", year: 2023, value: 90 },
      { regionCode: "52130", year: 2023, value: 40 },
    ],
  };
}

describe("trend", () => {
  it("returns a region's rows sorted by ascending year", () => {
    const rows = trend(seriesFixture(), "52110");
    expect(rows).toEqual([
      { year: 2022, value: 80 },
      { year: 2023, value: 90 },
      { year: 2024, value: 100 },
    ]);
  });

  it("returns an empty array for an unknown region", () => {
    expect(trend(seriesFixture(), "99999")).toEqual([]);
  });
});

describe("deltaPrevYear", () => {
  it("returns latest minus the immediately preceding year", () => {
    expect(deltaPrevYear(seriesFixture(), "52110", 2024)).toBe(100 - 90);
  });

  it("returns null when there is no preceding year", () => {
    const series: SeriesFile = { id: "x", rows: [{ regionCode: "52110", year: 2022, value: 80 }] };
    expect(deltaPrevYear(series, "52110", 2022)).toBeNull();
  });

  it("returns null when the latest year itself is missing", () => {
    expect(deltaPrevYear(seriesFixture(), "52110", 2099)).toBeNull();
  });

  it("returns null when either value is null", () => {
    const series: SeriesFile = {
      id: "x",
      rows: [
        { regionCode: "52110", year: 2022, value: null },
        { regionCode: "52110", year: 2023, value: 90 },
      ],
    };
    expect(deltaPrevYear(series, "52110", 2023)).toBeNull();
  });
});

describe("changeYearRange", () => {
  it("returns [minYear, maxYear] across a series' rows", () => {
    expect(changeYearRange(seriesFixture())).toEqual([2022, 2024]);
  });

  it("returns null for an undefined series (e.g. an external-kind indicator with no series file)", () => {
    expect(changeYearRange(undefined)).toBeNull();
  });

  it("returns null for a series with no rows", () => {
    expect(changeYearRange({ id: "x", rows: [] })).toBeNull();
  });
});

describe("displayLabel", () => {
  const baseDef: IndicatorDef = {
    id: "students_total",
    group: "scale",
    label: "학생수",
    unit: "명",
    polarity: "neutral",
    kind: "count",
    format: formatInt,
    source: { name: "KESS", url: "https://example.com", year: 2026 },
    aggregate: { kind: "sum", field: "students" },
  };

  it("returns def.label unchanged for a normal indicator", () => {
    expect(displayLabel(baseDef, {})).toBe("학생수");
  });

  it("replaces the static '5년' span with the real series year range for students_change_5y", () => {
    const def: IndicatorDef = { ...baseDef, id: "students_change_5y", label: "학생수 5년 증감률" };
    const series = { students_total: seriesFixture() };
    expect(displayLabel(def, series)).toBe("학생수 2022→2024 증감률");
  });

  it("falls back to the static label when the students_total series is unavailable", () => {
    const def: IndicatorDef = { ...baseDef, id: "students_change_5y", label: "학생수 5년 증감률" };
    expect(displayLabel(def, {})).toBe("학생수 5년 증감률");
  });
});
