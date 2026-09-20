import { describe, expect, it, vi } from "vitest";
import type { Color, Position } from "@deck.gl/core";

import { makeSchoolLabelsLayer, makeSchoolsLayer } from "@/components/map/layers/schoolLayers";
import { makeSchoolRadiusScale, SCHOOL_LEVEL_COLORS, SCHOOL_LEVEL_ORDER } from "@/lib/schoolVisuals";
import type { School } from "@/lib/schools/types";

function school(overrides: Partial<School> & Pick<School, "id" | "regionCode">): School {
  return {
    name: `학교${overrides.id}`,
    level: "elem",
    status: "운영",
    branch: false,
    lat: 35.8,
    lng: 127.1,
    students: 100,
    classes: 5,
    teachers: 10,
    studentsPerClass: 20,
    small: false,
    ...overrides,
  };
}

type Ctx = { index: number; data: School[]; target: number[] };
const ctxFor = (data: School[]): Ctx => ({ index: 0, data, target: [] });

describe("makeSchoolRadiusScale — 반경 매핑 범위", () => {
  it("maps the smallest student count to the minimum radius and the largest to the maximum", () => {
    const schools = [school({ id: "a", regionCode: "52110", students: 10 }), school({ id: "b", regionCode: "52110", students: 1000 })];
    const radiusOf = makeSchoolRadiusScale(schools);
    expect(radiusOf(10)).toBeCloseTo(3, 5);
    expect(radiusOf(1000)).toBeCloseTo(9, 5);
  });

  it("maps null (no student count) to the minimum radius", () => {
    const schools = [school({ id: "a", regionCode: "52110", students: 10 }), school({ id: "b", regionCode: "52110", students: 1000 })];
    const radiusOf = makeSchoolRadiusScale(schools);
    expect(radiusOf(null)).toBe(3);
  });

  it("stays within [3, 9] for every value in between, monotonically increasing", () => {
    const schools = Array.from({ length: 20 }, (_, i) => school({ id: `s${i}`, regionCode: "52110", students: (i + 1) * 37 }));
    const radiusOf = makeSchoolRadiusScale(schools);
    let prev = -Infinity;
    for (const s of schools) {
      const r = radiusOf(s.students);
      expect(r).toBeGreaterThanOrEqual(3);
      expect(r).toBeLessThanOrEqual(9);
      expect(r).toBeGreaterThanOrEqual(prev);
      prev = r;
    }
  });

  it("does not rescale when computed from the full list, even if a filtered subset has a narrower range", () => {
    const all = [
      school({ id: "a", regionCode: "52110", students: 10 }),
      school({ id: "b", regionCode: "52130", students: 1000 }),
    ];
    const radiusOf = makeSchoolRadiusScale(all); // computed from the FULL list
    const onlyRegionA = [all[0]]; // as if region 52110 alone were selected
    // radiusOf itself is unaffected by which subset is later rendered.
    expect(radiusOf(onlyRegionA[0].students)).toBeCloseTo(3, 5);
    expect(radiusOf(1000)).toBeCloseTo(9, 5); // still resolvable even though not in the subset
  });
});

describe("SCHOOL_LEVEL_COLORS — 급별 색 alpha 255", () => {
  it("every school level has an explicit opaque (alpha 255) color", () => {
    for (const level of SCHOOL_LEVEL_ORDER) {
      const [, , , a] = SCHOOL_LEVEL_COLORS[level];
      expect(a).toBe(255);
    }
  });

  it("all 4 colors are distinct", () => {
    const values = SCHOOL_LEVEL_ORDER.map((l) => SCHOOL_LEVEL_COLORS[l].join(","));
    expect(new Set(values).size).toBe(4);
  });
});

describe("makeSchoolsLayer", () => {
  const radiusOf = vi.fn((students: number | null) => (students === 100 ? 5 : 3));
  const elevationOf = vi.fn((code: string) => (code === "52110" ? 1000 : 2000));

  it("is a pickable, auto-highlighting, billboarded ScatterplotLayer with id 'schools'", () => {
    const layer = makeSchoolsLayer([], { elevationOf, radiusOf, visible: true, triggerKey: "v1" });
    expect(layer.props.id).toBe("schools");
    expect(layer.props.pickable).toBe(true);
    expect(layer.props.autoHighlight).toBe(true);
    expect(layer.props.billboard).toBe(true);
    expect(layer.props.stroked).toBe(true);
    expect(layer.props.radiusUnits).toBe("pixels");
    expect(layer.props.radiusMinPixels).toBe(3);
  });

  it("visible 토글: reflects the given `visible` option", () => {
    const visibleLayer = makeSchoolsLayer([], { elevationOf, radiusOf, visible: true, triggerKey: "v1" });
    const hiddenLayer = makeSchoolsLayer([], { elevationOf, radiusOf, visible: false, triggerKey: "v1" });
    expect(visibleLayer.props.visible).toBe(true);
    expect(hiddenLayer.props.visible).toBe(false);
  });

  it("getPosition appends elevationOf(regionCode)+50 as the z coordinate", () => {
    const layer = makeSchoolsLayer([], { elevationOf, radiusOf, visible: true, triggerKey: "v1" });
    const d = school({ id: "a", regionCode: "52110", lat: 35.5, lng: 127.2 });
    const getPosition = layer.props.getPosition as (d: School, ctx: Ctx) => Position;
    expect(getPosition(d, ctxFor([d]))).toEqual([127.2, 35.5, 1050]);
    expect(elevationOf).toHaveBeenCalledWith("52110");
  });

  it("getRadius delegates to the injected radiusOf(students)", () => {
    const layer = makeSchoolsLayer([], { elevationOf, radiusOf, visible: true, triggerKey: "v1" });
    const d = school({ id: "a", regionCode: "52110", students: 100 });
    const getRadius = layer.props.getRadius as (d: School, ctx: Ctx) => number;
    expect(getRadius(d, ctxFor([d]))).toBe(5);
    expect(radiusOf).toHaveBeenCalledWith(100);
  });

  it("getFillColor uses the 학교급 color, alpha 255", () => {
    const layer = makeSchoolsLayer([], { elevationOf, radiusOf, visible: true, triggerKey: "v1" });
    const d = school({ id: "a", regionCode: "52110", level: "high" });
    const getFillColor = layer.props.getFillColor as (d: School, ctx: Ctx) => Color;
    expect(getFillColor(d, ctxFor([d]))).toEqual(SCHOOL_LEVEL_COLORS.high);
  });

  it("getLineColor is translucent white normally, opaque when the school is highlighted", () => {
    const d = school({ id: "target", regionCode: "52110" });
    const notHighlighted = makeSchoolsLayer([], { elevationOf, radiusOf, visible: true, triggerKey: "v1", highlightedId: null });
    const highlighted = makeSchoolsLayer([], { elevationOf, radiusOf, visible: true, triggerKey: "v1", highlightedId: "target" });
    const getLineColorPlain = notHighlighted.props.getLineColor as (d: School, ctx: Ctx) => Color;
    const getLineColorHighlighted = highlighted.props.getLineColor as (d: School, ctx: Ctx) => Color;
    const [, , , plainAlpha] = getLineColorPlain(d, ctxFor([d])) as [number, number, number, number];
    const [, , , highlightAlpha] = getLineColorHighlighted(d, ctxFor([d])) as [number, number, number, number];
    expect(plainAlpha).toBeLessThan(255);
    expect(highlightAlpha).toBe(255);
  });

  it("getLineWidth is 2px when highlighted", () => {
    const d = school({ id: "target", regionCode: "52110" });
    const highlighted = makeSchoolsLayer([], { elevationOf, radiusOf, visible: true, triggerKey: "v1", highlightedId: "target" });
    const getLineWidth = highlighted.props.getLineWidth as (d: School, ctx: Ctx) => number;
    expect(getLineWidth(d, ctxFor([d]))).toBe(2);
  });

  it("updateTriggers include triggerKey (via getPosition) and highlightedId (via getLineColor/getLineWidth)", () => {
    const layer = makeSchoolsLayer([], {
      elevationOf,
      radiusOf,
      visible: true,
      triggerKey: "students_total",
      highlightedId: "abc",
    });
    expect(layer.props.updateTriggers.getPosition).toContain("students_total");
    expect(layer.props.updateTriggers.getLineColor).toContain("abc");
    expect(layer.props.updateTriggers.getLineWidth).toContain("abc");
  });

  it("disables the depth test (same as the label layer)", () => {
    const layer = makeSchoolsLayer([], { elevationOf, radiusOf, visible: true, triggerKey: "v1" });
    expect(layer.props.parameters).toMatchObject({ depthCompare: "always", depthWriteEnabled: false });
  });

  it("forwards clicks with the clicked school's id", () => {
    const onClick = vi.fn();
    const layer = makeSchoolsLayer([], { elevationOf, radiusOf, visible: true, triggerKey: "v1", onClick });
    const d = school({ id: "clicked-id", regionCode: "52110" });
    // @ts-expect-error — minimal PickingInfo stub for this unit test.
    layer.props.onClick({ object: d }, {});
    expect(onClick).toHaveBeenCalledWith("clicked-id");
  });

  it("uses a 600ms transition on getPosition", () => {
    const layer = makeSchoolsLayer([], { elevationOf, radiusOf, visible: true, triggerKey: "v1" });
    expect(layer.props.transitions).toMatchObject({ getPosition: 600 });
  });
});

describe("makeSchoolLabelsLayer", () => {
  const elevationOf = vi.fn((code: string) => (code === "52110" ? 1000 : 2000));

  it("is a TextLayer with id 'school-labels', 11px size, billboarded", () => {
    const layer = makeSchoolLabelsLayer([], {
      elevationOf,
      visible: true,
      fontFamily: "Test Font",
      characterSet: ["a"],
      triggerKey: "v1",
    });
    expect(layer.props.id).toBe("school-labels");
    expect(layer.props.getSize).toBe(11);
    expect(layer.props.billboard).toBe(true);
    expect(layer.props.fontFamily).toBe("Test Font");
    expect(layer.props.characterSet).toEqual(["a"]);
  });

  it("getText returns the school's name", () => {
    const layer = makeSchoolLabelsLayer([], {
      elevationOf,
      visible: true,
      fontFamily: "Test Font",
      characterSet: ["a"],
      triggerKey: "v1",
    });
    const d = school({ id: "a", regionCode: "52110", name: "무주초등학교" });
    const getText = layer.props.getText as (d: School, ctx: Ctx) => string;
    expect(getText(d, ctxFor([d]))).toBe("무주초등학교");
  });

  it("visible 토글: reflects the given `visible` option (zoom>=11 && region selected, computed by the caller)", () => {
    const visibleLayer = makeSchoolLabelsLayer([], {
      elevationOf,
      visible: true,
      fontFamily: "Test Font",
      characterSet: ["a"],
      triggerKey: "v1",
    });
    const hiddenLayer = makeSchoolLabelsLayer([], {
      elevationOf,
      visible: false,
      fontFamily: "Test Font",
      characterSet: ["a"],
      triggerKey: "v1",
    });
    expect(visibleLayer.props.visible).toBe(true);
    expect(hiddenLayer.props.visible).toBe(false);
  });

  it("disables the depth test", () => {
    const layer = makeSchoolLabelsLayer([], {
      elevationOf,
      visible: true,
      fontFamily: "Test Font",
      characterSet: ["a"],
      triggerKey: "v1",
    });
    expect(layer.props.parameters).toMatchObject({ depthCompare: "always", depthWriteEnabled: false });
  });
});
