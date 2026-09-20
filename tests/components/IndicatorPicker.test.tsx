import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import IndicatorPicker from "@/components/panels/IndicatorPicker";
import { GROUP_LABELS } from "@/lib/indicators/groups";
import { DEFAULT_INDICATOR_ID, indicatorById } from "@/lib/indicators/registry";
import { displayLabel } from "@/lib/stats";
import type { SeriesFile } from "@/lib/indicators/types";

describe("IndicatorPicker", () => {
  it("renders all 4 group labels", () => {
    render(<IndicatorPicker value={DEFAULT_INDICATOR_ID} onChange={() => {}} />);
    for (const label of Object.values(GROUP_LABELS)) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it("renders a radio input for every registered indicator, labeled with its display label", () => {
    render(<IndicatorPicker value={DEFAULT_INDICATOR_ID} onChange={() => {}} />);
    const radio = screen.getByRole("radio", { name: indicatorById("students_per_class")!.label });
    expect(radio).toBeInTheDocument();
  });

  it("checks the radio matching the current value", () => {
    render(<IndicatorPicker value="schools_total" onChange={() => {}} />);
    expect(screen.getByRole("radio", { name: indicatorById("schools_total")!.label })).toBeChecked();
    expect(screen.getByRole("radio", { name: indicatorById("students_total")!.label })).not.toBeChecked();
  });

  it("renders each indicator's description small, without changing the radio's accessible name (Task 5, Section C)", () => {
    render(<IndicatorPicker value={DEFAULT_INDICATOR_ID} onChange={() => {}} />);
    const def = indicatorById("students_per_class")!;
    expect(screen.getByText(def.description)).toBeInTheDocument();
    // The radio's accessible name is still exactly def.label — description
    // text lives in a sibling <span> (aria-describedby), never inside the
    // <label> itself (see IndicatorPicker.tsx's own comment on this).
    const radio = screen.getByRole("radio", { name: def.label });
    expect(radio).toHaveAccessibleDescription(def.description);
  });

  it("calls onChange with the clicked indicator's id", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<IndicatorPicker value={DEFAULT_INDICATOR_ID} onChange={onChange} />);

    await user.click(screen.getByRole("radio", { name: indicatorById("schools_total")!.label }));

    expect(onChange).toHaveBeenCalledWith("schools_total");
  });

  it("is keyboard accessible: focusing and pressing a key on a radio works via native radio semantics", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<IndicatorPicker value={DEFAULT_INDICATOR_ID} onChange={onChange} />);

    const target = screen.getByRole("radio", { name: indicatorById("schools_total")!.label });
    target.focus();
    expect(target).toHaveFocus();
    await user.keyboard(" ");
    expect(onChange).toHaveBeenCalledWith("schools_total");
  });

  // Fix round 2, finding 4 — this component used to render raw `def.label`
  // for every indicator, including students_change_5y, whose registry label
  // hardcodes a static "5년" even though the real comparison span (currently
  // 2022→2026) is dynamic (see stats.ts's displayLabel doc comment). That
  // made this menu show "학생수 5년 증감률" while the menu BUTTON/Legend/panel
  // header (which already called displayLabel()) showed "학생수 2022→2026
  // 증감률" for the exact same indicator — a visible inconsistency.
  describe("dynamic label (students_change_5y, via displayLabel — fix round 2, finding 4)", () => {
    function seriesFixture(): Record<string, SeriesFile> {
      return {
        students_total: {
          id: "students_total",
          rows: [2022, 2023, 2024, 2025, 2026].map((year) => ({ regionCode: "52110", year, value: 100 })),
        },
      };
    }

    it("renders the dynamic label (matching displayLabel's output) when a series prop is passed, not the static registry label", () => {
      const series = seriesFixture();
      const def = indicatorById("students_change_5y")!;
      const expectedLabel = displayLabel(def, series);
      // Sanity check the fixture actually exercises the dynamic path (the
      // real regression this test guards against wouldn't be visible with a
      // static label that never differs from def.label).
      expect(expectedLabel).not.toBe(def.label);
      expect(expectedLabel).toBe("학생수 2022→2026 증감률");

      render(<IndicatorPicker value={DEFAULT_INDICATOR_ID} onChange={() => {}} series={series} />);

      expect(screen.getByRole("radio", { name: expectedLabel })).toBeInTheDocument();
      expect(screen.queryByRole("radio", { name: def.label })).not.toBeInTheDocument();
    });

    it("falls back to the static registry label when no series prop is passed (default {})", () => {
      const def = indicatorById("students_change_5y")!;
      render(<IndicatorPicker value={DEFAULT_INDICATOR_ID} onChange={() => {}} />);
      expect(screen.getByRole("radio", { name: def.label })).toBeInTheDocument();
    });
  });

  it("renders the group legend text with at least WCAG AA (4.5:1) contrast against the popover surface #121826", () => {
    render(<IndicatorPicker value={DEFAULT_INDICATOR_ID} onChange={() => {}} />);
    const legend = screen.getByText(GROUP_LABELS.scale);

    // The legend is styled as `text-[#e6e9f0]/<alpha>` — read the actual
    // opacity out of the rendered className (rather than hardcoding the
    // expected value) so this test fails again if the color or opacity ever
    // regresses, not just if a specific literal is reverted.
    const match = legend.className.match(/text-\[#e6e9f0\]\/(\d+)/);
    expect(match, `expected a text-[#e6e9f0]/<alpha> class, got "${legend.className}"`).not.toBeNull();
    const alpha = Number(match![1]) / 100;

    // WCAG 2.x relative-luminance contrast, computed for the legend's text
    // color (foreground alpha-blended over the popover's actual background)
    // against that same background — same formula/method used to verify
    // every other text color in this task (see task-3-report.md).
    const hexToRgb = (hex: string): [number, number, number] => {
      const n = parseInt(hex.replace("#", ""), 16);
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    };
    const relativeLuminance = ([r, g, b]: [number, number, number]) => {
      const linearize = (channel: number) => {
        const c = channel / 255;
        return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
      };
      return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
    };

    const fg = hexToRgb("#e6e9f0");
    const bg = hexToRgb("#121826"); // IndicatorMenu's popover background (bg-[#121826])
    const blended: [number, number, number] = [
      alpha * fg[0] + (1 - alpha) * bg[0],
      alpha * fg[1] + (1 - alpha) * bg[1],
      alpha * fg[2] + (1 - alpha) * bg[2],
    ];

    const textLum = relativeLuminance(blended);
    const bgLum = relativeLuminance(bg);
    const [lighter, darker] = textLum > bgLum ? [textLum, bgLum] : [bgLum, textLum];
    const ratio = (lighter + 0.05) / (darker + 0.05);

    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });
});
