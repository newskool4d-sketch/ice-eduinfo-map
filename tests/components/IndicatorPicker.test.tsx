import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import IndicatorPicker from "@/components/panels/IndicatorPicker";
import { GROUP_LABELS } from "@/lib/indicators/groups";
import { DEFAULT_INDICATOR_ID, indicatorById } from "@/lib/indicators/registry";

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
});
