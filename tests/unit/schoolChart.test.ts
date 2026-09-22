import { describe, expect, it } from "vitest";
import { chartHeight, chartMaximum, schoolChartMetric } from "@/lib/schools/chart";
import { makeSchoolChartLayer } from "@/components/map/layers/schoolChartLayer";
import type { PositionedSchool } from "@/components/map/layers/schoolLayers";
import { readFileSync } from "node:fs";
const schools: PositionedSchool[] = JSON.parse(readFileSync("public/data/schools.json", "utf8")).schools;

describe("school cylinders", () => {
  it("uses a zero-based proportional scale, including missing and invalid values", () => {
    expect(chartHeight(200, 1000, 12)).toBe(2 * chartHeight(100, 1000, 12));
    for (const value of [null, 0, -1, NaN]) expect(chartHeight(value, 1000, 12)).toBe(0);
    expect(chartHeight(0, 0, 12)).toBe(0);
    expect(chartHeight(100, 1000, 13)).toBe(chartHeight(100, 1000, 12) / 2);
  });
  it("maps the selected metric and keeps the province-wide scale across filters", () => {
    const metric = schoolChartMetric("students_total")!;
    const max = chartMaximum(schools, metric);
    expect(max).toBe(1607);
    const school = schools.find(s => s.students === 200)!;
    expect(chartHeight(metric.value(school), max, 12)).toBe(chartHeight(200, max, 12));
    expect(schoolChartMetric("teachers_total")!.value(schools[0])).toBe(schools[0].teachers);
    expect(schoolChartMetric("students_per_teacher")!.value({ ...schools[0], teachers: 0 })).toBeNull();
    expect(schoolChartMetric("students_total", "designation")).toBeNull();
    expect(schoolChartMetric("students_change_5y")).toBeNull();
    expect(schoolChartMetric("small_school_share")).toBeNull();
  });
  it("uses special-class values, never whole-school students for that metric", () => {
    const facts = JSON.parse(readFileSync("public/data/education-issues.json", "utf8"));
    const metric = schoolChartMetric("students_total", "special-students", facts)!;
    const school = schools.find(s => s.level !== "special" && facts.schools[s.id].specialStudents > 0)!;
    expect(metric.value(school)).toBe(facts.schools[school.id].specialStudents);
    expect(metric.value(schools.find(s => s.level === "special")!)).toBeNull();
  });
  it("draws constant-width pickable cylinders using only the filtered records", () => {
    const subset = schools.slice(0, 2);
    const height = () => 123;
    let selected = "";
    const layer = makeSchoolChartLayer(subset, height, subset[0].id, id => { selected = id; });
    expect(layer.props.data).toBe(subset);
    expect(layer.props.getElevation).toBe(height);
    expect(layer.props.radius).toBe(5);
    expect(layer.props.radiusUnits).toBe("pixels");
    expect(layer.props.pickable).toBe(true);
    layer.props.onClick!({ object: subset[1] } as never, {} as never);
    expect(selected).toBe(subset[1].id);
  });
});
