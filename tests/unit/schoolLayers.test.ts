import { describe, expect, it, vi } from "vitest";
import type { Color, Position } from "@deck.gl/core";

import { hasCoordinates, makeSchoolLabelsLayer, makeSchoolsLayer } from "@/components/map/layers/schoolLayers";
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

  // Task 6, Section C-추가 #4 — 학교 점 가독성: a dark, opaque stroke (not
  // translucent white) so a point stays legible even on a bright top face
  // (e.g. Viridis's near-yellow high end almost swallowing an amber 중학교
  // dot with the OLD translucent-white-at-alpha-120 stroke — verified via a
  // WCAG contrast check: dark stroke vs bright yellow bg = ~15:1, the old
  // white-alpha-120 blend vs the same bg was nowhere close). Highlighted
  // stays opaque WHITE (unchanged) — a different, deliberately
  // higher-attention cue, distinguished from normal by hue, not alpha, now
  // that both are fully opaque.
  it("getLineColor is a dark, opaque stroke normally; opaque white when highlighted", () => {
    const d = school({ id: "target", regionCode: "52110" });
    const notHighlighted = makeSchoolsLayer([], { elevationOf, radiusOf, visible: true, triggerKey: "v1", highlightedId: null });
    const highlighted = makeSchoolsLayer([], { elevationOf, radiusOf, visible: true, triggerKey: "v1", highlightedId: "target" });
    const getLineColorPlain = notHighlighted.props.getLineColor as (d: School, ctx: Ctx) => Color;
    const getLineColorHighlighted = highlighted.props.getLineColor as (d: School, ctx: Ctx) => Color;
    expect(getLineColorPlain(d, ctxFor([d]))).toEqual([11, 15, 25, 255]);
    expect(getLineColorHighlighted(d, ctxFor([d]))).toEqual([255, 255, 255, 255]);
  });

  it("getLineWidth is 1.5px normally, 2px when highlighted", () => {
    const d = school({ id: "target", regionCode: "52110" });
    const notHighlighted = makeSchoolsLayer([], { elevationOf, radiusOf, visible: true, triggerKey: "v1", highlightedId: null });
    const highlighted = makeSchoolsLayer([], { elevationOf, radiusOf, visible: true, triggerKey: "v1", highlightedId: "target" });
    const getLineWidthPlain = notHighlighted.props.getLineWidth as (d: School, ctx: Ctx) => number;
    const getLineWidthHighlighted = highlighted.props.getLineWidth as (d: School, ctx: Ctx) => number;
    expect(getLineWidthPlain(d, ctxFor([d]))).toBe(1.5);
    expect(getLineWidthHighlighted(d, ctxFor([d]))).toBe(2);
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

  it("zeroes the getPosition transition when transitionDuration: 0 (Task 6, Section A.4 — reduced motion)", () => {
    const layer = makeSchoolsLayer([], { elevationOf, radiusOf, visible: true, triggerKey: "v1", transitionDuration: 0 });
    expect(layer.props.transitions).toMatchObject({ getPosition: 0 });
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

  // Task A — same reasoning/mechanism as labelLayer.test.ts's own
  // _subLayerProps assertion: school-labels is also a TextLayer, so its
  // shadow-casting exclusion must go through _subLayerProps (an outer
  // `shadowEnabled` prop never reaches the characters/background leaf
  // sub-layers deck.gl's shadow pass actually checks).
  it("excludes both sub-layers (characters, background) from shadow casting via _subLayerProps", () => {
    const layer = makeSchoolLabelsLayer([], {
      elevationOf,
      visible: true,
      fontFamily: "Test Font",
      characterSet: ["a"],
      triggerKey: "v1",
    });
    expect(layer.props._subLayerProps).toEqual({
      characters: { shadowEnabled: false },
      background: { shadowEnabled: false },
    });
  });

  it("zeroes the getPosition transition when transitionDuration: 0 (Task 6, Section A.4 — reduced motion)", () => {
    const layer = makeSchoolLabelsLayer([], {
      elevationOf,
      visible: true,
      fontFamily: "Test Font",
      characterSet: ["a"],
      triggerKey: "v1",
      transitionDuration: 0,
    });
    expect(layer.props.transitions).toMatchObject({ getPosition: 0 });
  });
});

// fix-round-2 (review finding #1): a 특수학교 row has lat/lng: null (no
// location-source coordinate — see School.locationMissingReason). Neither
// layer has anywhere to plot such a school. Dropping it is no longer the
// FACTORY's job (see below) — it's now a type-guard the caller (DeckMap.tsx)
// applies once, so this just verifies the predicate itself.
describe("hasCoordinates (fix-round-2, review finding #1)", () => {
  it("is true for a school with both lat and lng set", () => {
    const s = school({ id: "a", regionCode: "52110", lat: 35.8, lng: 127.1 });
    expect(hasCoordinates(s)).toBe(true);
  });

  it("is false for a school with lat/lng null (특수학교 — see locationMissingReason)", () => {
    const s = school({
      id: "b",
      regionCode: "52110",
      level: "special",
      lat: null,
      lng: null,
      locationMissingReason: "특수학교는 위치 표준데이터(2026-03-20)에 없음",
    });
    expect(hasCoordinates(s)).toBe(false);
  });
});

// fix-round-2 (review finding #1): makeSchoolsLayer/makeSchoolLabelsLayer
// used to call an internal `withCoordinates()` filter on EVERY invocation,
// which allocated a brand-new `data` array each time — reference-unequal to
// the previous one even with byte-for-byte identical contents. Since both
// factories are called inside DeckMap's `layers` useMemo (whose deps include
// highlightedSchoolId/handleSchoolClick), every highlight click handed
// deck.gl a new `data` identity, which deck.gl treats as "the whole dataset
// changed" (`invalidateAll()`) — defeating the layers' own scoped
// `updateTriggers` (getLineColor/getLineWidth only). The fix moves filtering
// to DeckMap.tsx's own `useMemo(() => regionSchools.filter(hasCoordinates), [regionSchools])`,
// computed once and handed to both factories; the factories below now just
// assign `data: schools` — no filtering, no new allocation, no matter how
// many times or how often they're called with the SAME input array.
describe("makeSchoolsLayer / makeSchoolLabelsLayer — data reference stability (fix-round-2, review finding #1)", () => {
  const positioned = [school({ id: "a", regionCode: "52110", lat: 35.8, lng: 127.1 })].filter(hasCoordinates);

  it("makeSchoolsLayer's data is the exact same array reference it was given, not a re-filtered copy", () => {
    const layer = makeSchoolsLayer(positioned, { elevationOf: () => 1000, radiusOf: () => 5, visible: true, triggerKey: "v1" });
    expect(layer.props.data).toBe(positioned);
  });

  it("makeSchoolLabelsLayer's data is the exact same array reference it was given, not a re-filtered copy", () => {
    const layer = makeSchoolLabelsLayer(positioned, {
      elevationOf: () => 1000,
      visible: true,
      fontFamily: "Test Font",
      characterSet: ["a"],
      triggerKey: "v1",
    });
    expect(layer.props.data).toBe(positioned);
  });

  it("calling makeSchoolsLayer twice with the SAME input array yields the SAME data reference both times", () => {
    const opts = { elevationOf: () => 1000, radiusOf: () => 5, visible: true, triggerKey: "v1" };
    const layer1 = makeSchoolsLayer(positioned, opts);
    const layer2 = makeSchoolsLayer(positioned, opts);
    expect(layer1.props.data).toBe(layer2.props.data);
  });

  it("changing only highlightedId does not change data identity (the bug this fix addresses)", () => {
    const opts = { elevationOf: () => 1000, radiusOf: () => 5, visible: true, triggerKey: "v1" };
    const notHighlighted = makeSchoolsLayer(positioned, { ...opts, highlightedId: null });
    const highlighted = makeSchoolsLayer(positioned, { ...opts, highlightedId: "a" });
    expect(notHighlighted.props.data).toBe(highlighted.props.data);
    expect(notHighlighted.props.data).toBe(positioned);
  });
});
