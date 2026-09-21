import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import IndicatorPicker from "@/components/panels/IndicatorPicker";
import { GROUP_LABELS } from "@/lib/indicators/groups";
import { DEFAULT_INDICATOR_ID, indicatorById } from "@/lib/indicators/registry";
import { displayLabel } from "@/lib/stats";
import { contrastRatio, THEME } from "@/lib/theme";
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

  it("renders the group legend text with at least WCAG AA (4.5:1) contrast against the popover surface (Task 1 — THEME tokens)", () => {
    render(<IndicatorPicker value={DEFAULT_INDICATOR_ID} onChange={() => {}} />);
    const legend = screen.getByText(GROUP_LABELS.scale);

    // Task 1 replaced the old `text-[#e6e9f0]/<alpha>` alpha-blended literal
    // with the flat `text-ink-muted` theme token (THEME.inkMuted, full
    // opacity — no more alpha blending to reconstruct here). IndicatorMenu's
    // popover background is `bg-surface` (THEME.surface) post-refactor.
    // Reuse theme.ts's own contrastRatio (the single source of truth
    // tests/unit/theme.test.ts already pins) instead of duplicating the
    // WCAG luminance formula here.
    expect(legend.className).toContain("text-ink-muted");
    expect(contrastRatio(THEME.inkMuted, THEME.surface)).toBeGreaterThanOrEqual(4.5);
  });
});
