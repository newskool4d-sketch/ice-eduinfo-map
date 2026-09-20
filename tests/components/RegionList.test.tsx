import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { withNuqsTestingAdapter } from "nuqs/adapters/testing";

import RegionList from "@/components/panels/RegionList";
import { REGIONS } from "@/lib/geo/regions";
import type { IndicatorFile, SeriesFile } from "@/lib/indicators/types";

/** students_total values chosen so the rank order is deliberately NOT REGIONS' declaration order — exercises real sorting, not incidental list order. */
const VALUES: Record<string, number> = {
  "52110": 70851, // 전주시 — rank 1
  "52130": 50000, // 군산시 — rank 2
  "52140": 40000, // 익산시 — rank 3
  "52180": 20000,
  "52190": 19000,
  "52210": 18000,
  "52710": 17000,
  "52720": 6000,
  "52730": 5000,
  "52740": 4000,
  "52750": 3000,
  "52770": 2000,
  "52790": 1500,
  "52800": 1000, // rank 14 (smallest)
};

function studentsTotalFile(): IndicatorFile {
  return {
    id: "students_total",
    year: 2026,
    referenceDate: "2026-04-01",
    source: { name: "KESS 테스트", url: "https://example.com", year: 2026 },
    rows: [
      ...Object.entries(VALUES).map(([regionCode, value]) => ({ regionCode, value })),
      { regionCode: "52000", value: Object.values(VALUES).reduce((a, b) => a + b, 0) },
    ],
  };
}

function bundleFixture() {
  return {
    indicators: { students_total: studentsTotalFile() },
    series: {} as Record<string, SeriesFile>,
  };
}

describe("RegionList", () => {
  it("renders exactly 14 region buttons", () => {
    render(<RegionList bundle={bundleFixture()} />, { wrapper: withNuqsTestingAdapter() });
    expect(screen.getAllByRole("button")).toHaveLength(REGIONS.length);
  });

  it("orders the buttons by rank (전주시 first, 부안군 last, for these fixture values)", () => {
    render(<RegionList bundle={bundleFixture()} />, { wrapper: withNuqsTestingAdapter() });
    const buttons = screen.getAllByRole("button");
    expect(within(buttons[0]).getByText("전주시")).toBeInTheDocument();
    expect(within(buttons[buttons.length - 1]).getByText("부안군")).toBeInTheDocument();
  });

  it("shows each region's name, formatted value, and rank badge", () => {
    render(<RegionList bundle={bundleFixture()} />, { wrapper: withNuqsTestingAdapter() });
    const first = screen.getAllByRole("button")[0];
    expect(within(first).getByText("전주시")).toBeInTheDocument();
    expect(within(first).getByText("70,851")).toBeInTheDocument();
    expect(within(first).getByText("1위")).toBeInTheDocument();
  });

  it("shows a leading prompt to click a region or pick from the list", () => {
    render(<RegionList bundle={bundleFixture()} />, { wrapper: withNuqsTestingAdapter() });
    expect(screen.getByText("시군을 클릭하거나 목록에서 선택하세요")).toBeInTheDocument();
  });

  it("clicking a region button pushes its code onto the region URL param", async () => {
    const user = userEvent.setup();
    const onUrlUpdate = vi.fn();
    render(<RegionList bundle={bundleFixture()} />, {
      wrapper: withNuqsTestingAdapter({ onUrlUpdate, hasMemory: true }),
    });

    await user.click(screen.getByRole("button", { name: /전주시/ }));

    const lastCall = onUrlUpdate.mock.calls.at(-1)?.[0];
    expect(lastCall?.searchParams.get("region")).toBe("52110");
    // setRegion pushes a new history entry (back/forward toggles selection).
    expect(lastCall?.options.history).toBe("push");
  });
});
