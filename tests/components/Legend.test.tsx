import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import Legend from "@/components/panels/Legend";
import { paletteFor } from "@/lib/colors";
import { formatInt, formatPercent } from "@/lib/format";
import type { IndicatorDef } from "@/lib/indicators/types";

function baseDef(overrides: Partial<IndicatorDef> = {}): IndicatorDef {
  return {
    id: "students_total",
    group: "scale",
    label: "학생수",
    unit: "명",
    polarity: "neutral",
    kind: "count",
    format: formatInt,
    source: { name: "KESS 테스트 출처", url: "https://example.com/kess", year: 2026 },
    aggregate: { kind: "sum", field: "students" },
    ...overrides,
  };
}

const TICKS = [0, 20, 40, 60, 80, 100];

describe("Legend", () => {
  it("shows the indicator's label", () => {
    render(
      <Legend def={baseDef()} ticks={TICKS} palette={paletteFor("neutral")} hasNull={false} referenceDate="2026-04-01" />,
    );
    expect(screen.getByTestId("legend-indicator-label")).toHaveTextContent("학생수");
  });

  it("renders 5 color swatches", () => {
    const { container } = render(
      <Legend
        def={baseDef()}
        ticks={TICKS}
        palette={paletteFor("neutral")}
        hasNull={false}
        referenceDate="2026-04-01"
      />,
    );
    expect(container.querySelectorAll("[data-testid='legend-swatch']")).toHaveLength(5);
  });

  it("renders each tick boundary formatted via def.format", () => {
    render(
      <Legend def={baseDef()} ticks={TICKS} palette={paletteFor("neutral")} hasNull={false} referenceDate="2026-04-01" />,
    );
    for (const t of TICKS) {
      expect(screen.getByText(formatInt(t))).toBeInTheDocument();
    }
  });

  it("shows a missing-data swatch labeled 자료 없음 when hasNull is true", () => {
    render(
      <Legend def={baseDef()} ticks={TICKS} palette={paletteFor("neutral")} hasNull referenceDate="2026-04-01" />,
    );
    expect(screen.getByText("자료 없음")).toBeInTheDocument();
  });

  it("omits the missing-data swatch when hasNull is false", () => {
    render(
      <Legend def={baseDef()} ticks={TICKS} palette={paletteFor("neutral")} hasNull={false} referenceDate="2026-04-01" />,
    );
    expect(screen.queryByText("자료 없음")).not.toBeInTheDocument();
  });

  it("always shows the base proportionality note", () => {
    render(
      <Legend def={baseDef()} ticks={TICKS} palette={paletteFor("neutral")} hasNull={false} referenceDate="2026-04-01" />,
    );
    expect(screen.getByText(/높이·색 모두 값에 비례/)).toBeInTheDocument();
  });

  it("adds a sqrt-scale note only when def.scale is 'sqrt'", () => {
    const { rerender } = render(
      <Legend def={baseDef()} ticks={TICKS} palette={paletteFor("neutral")} hasNull={false} referenceDate="2026-04-01" />,
    );
    expect(screen.queryByText(/제곱근 스케일/)).not.toBeInTheDocument();

    rerender(
      <Legend
        def={baseDef({ scale: "sqrt" })}
        ticks={TICKS}
        palette={paletteFor("neutral")}
        hasNull={false}
        referenceDate="2026-04-01"
      />,
    );
    expect(screen.getByText(/제곱근 스케일/)).toBeInTheDocument();
  });

  it("adds a non-zero-baseline note only when the first tick isn't 0", () => {
    const { rerender } = render(
      <Legend def={baseDef()} ticks={TICKS} palette={paletteFor("neutral")} hasNull={false} referenceDate="2026-04-01" />,
    );
    expect(screen.queryByText(/기준선/)).not.toBeInTheDocument();

    rerender(
      <Legend
        def={baseDef({ kind: "ratio", format: (v) => formatPercent(v, 1) })}
        ticks={[10, 20, 30, 40, 50, 60]}
        palette={paletteFor("neutral")}
        hasNull={false}
        referenceDate="2026-04-01"
      />,
    );
    expect(screen.getByText(/기준선/)).toBeInTheDocument();
  });

  it("links to def.source.name at def.source.url", () => {
    render(
      <Legend def={baseDef()} ticks={TICKS} palette={paletteFor("neutral")} hasNull={false} referenceDate="2026-04-01" />,
    );
    const link = screen.getByRole("link", { name: "KESS 테스트 출처" });
    expect(link).toHaveAttribute("href", "https://example.com/kess");
  });

  it("shows the given referenceDate", () => {
    render(
      <Legend def={baseDef()} ticks={TICKS} palette={paletteFor("neutral")} hasNull={false} referenceDate="2026-04-01" />,
    );
    expect(screen.getByText(/2026-04-01/)).toBeInTheDocument();
  });

  it("omits the 4 학교급 swatches when schoolLevelsVisible is false/unset (no 시군 selected)", () => {
    const { container } = render(
      <Legend def={baseDef()} ticks={TICKS} palette={paletteFor("neutral")} hasNull={false} referenceDate="2026-04-01" />,
    );
    expect(container.querySelectorAll("[data-testid='legend-school-swatch']")).toHaveLength(0);
  });

  it("shows exactly 4 학교급 color swatches (초/중/고/특수) when schoolLevelsVisible", () => {
    render(
      <Legend
        def={baseDef()}
        ticks={TICKS}
        palette={paletteFor("neutral")}
        hasNull={false}
        referenceDate="2026-04-01"
        schoolLevelsVisible
      />,
    );
    expect(screen.getAllByTestId("legend-school-swatch")).toHaveLength(4);
    expect(screen.getByText("초")).toBeInTheDocument();
    expect(screen.getByText("중")).toBeInTheDocument();
    expect(screen.getByText("고")).toBeInTheDocument();
    expect(screen.getByText("특수")).toBeInTheDocument();
  });

  // fix round, review finding #4: the "(특수학교는 위치 자료 없음)" caveat used
  // to render for EVERY selected region whenever schoolLevelsVisible was
  // true, even one where every school actually has a coordinate — false
  // information about that specific region. It must only show when the
  // selected region itself has at least one school with no coordinate.
  it("shows the 특수학교 위치 자료 없음 caveat when hasSchoolsWithoutLocation is true (review finding #4)", () => {
    render(
      <Legend
        def={baseDef()}
        ticks={TICKS}
        palette={paletteFor("neutral")}
        hasNull={false}
        referenceDate="2026-04-01"
        schoolLevelsVisible
        hasSchoolsWithoutLocation
      />,
    );
    expect(screen.getByText("(특수학교는 위치 자료 없음)")).toBeInTheDocument();
  });

  it("omits the 특수학교 위치 자료 없음 caveat when the selected region's schools all have coordinates (review finding #4)", () => {
    render(
      <Legend
        def={baseDef()}
        ticks={TICKS}
        palette={paletteFor("neutral")}
        hasNull={false}
        referenceDate="2026-04-01"
        schoolLevelsVisible
        hasSchoolsWithoutLocation={false}
      />,
    );
    expect(screen.queryByText("(특수학교는 위치 자료 없음)")).not.toBeInTheDocument();
  });
});
