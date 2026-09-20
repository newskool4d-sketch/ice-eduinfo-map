import { describe, expect, it } from "vitest";
import {
  DEFAULT_INDICATOR_ID,
  INDICATOR_IDS,
  INDICATORS,
  indicatorById,
} from "../../src/lib/indicators/registry";
import type { IndicatorGroup } from "../../src/lib/indicators/types";

describe("INDICATORS registry", () => {
  it("defines exactly 15 indicators", () => {
    expect(INDICATORS).toHaveLength(15);
  });

  it("has unique ids", () => {
    const ids = INDICATORS.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("exposes INDICATOR_IDS matching the registry ids", () => {
    expect(INDICATOR_IDS).toEqual(INDICATORS.map((d) => d.id));
  });

  it("covers all 4 indicator groups", () => {
    const groups = new Set(INDICATORS.map((d) => d.group));
    const expected: IndicatorGroup[] = ["scale", "smallSchool", "teacherInfra", "vulnerable"];
    for (const g of expected) {
      expect(groups.has(g)).toBe(true);
    }
  });

  it("gives every def a format function, source, and aggregate rule", () => {
    for (const def of INDICATORS) {
      expect(typeof def.format).toBe("function");
      expect(def.source).toBeTruthy();
      expect(def.source.name).toContain("KESS");
      expect(def.aggregate).toBeTruthy();
    }
  });

  it("formats a representative value for every indicator without throwing", () => {
    for (const def of INDICATORS) {
      expect(() => def.format(42.5)).not.toThrow();
      expect(typeof def.format(42.5)).toBe("string");
    }
  });

  it("sets DEFAULT_INDICATOR_ID to students_total, and it exists in the registry", () => {
    expect(DEFAULT_INDICATOR_ID).toBe("students_total");
    expect(INDICATOR_IDS).toContain(DEFAULT_INDICATOR_ID);
  });

  it("marks students_total, schools_total, and teachers_total as byLevel", () => {
    // teachers_total needs byLevel even though the brief's registry table only
    // annotates students_total/schools_total explicitly: validate.ts's own
    // check (3) requires 52000/<level> teacher values to compare against the
    // official per-level figures (8,116/4,935/5,377/482), which only exist if
    // this indicator produces level-tagged rows.
    expect(indicatorById("students_total")?.byLevel).toBe(true);
    expect(indicatorById("schools_total")?.byLevel).toBe(true);
    expect(indicatorById("teachers_total")?.byLevel).toBe(true);
  });

  it("indicatorById returns undefined for an unknown id", () => {
    expect(indicatorById("does_not_exist")).toBeUndefined();
  });

  it("gives students_change_5y an external aggregate pointing at the students_total series", () => {
    const def = indicatorById("students_change_5y");
    expect(def?.aggregate).toEqual({
      kind: "external",
      file: "series/students_total.json",
      field: "change5y",
    });
  });

  it("gives schools_total a count aggregate over the isMain predicate", () => {
    expect(indicatorById("schools_total")?.aggregate).toEqual({
      kind: "count",
      predicate: "isMain",
    });
  });

  it("gives students_per_class a ratio aggregate of students over classes", () => {
    expect(indicatorById("students_per_class")?.aggregate).toEqual({
      kind: "ratio",
      numerator: "students",
      denominator: "classes",
    });
  });
});
