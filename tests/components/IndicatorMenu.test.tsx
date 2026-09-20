import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { withNuqsTestingAdapter } from "nuqs/adapters/testing";

import IndicatorMenu from "@/components/panels/IndicatorMenu";
import { DEFAULT_INDICATOR_ID, indicatorById } from "@/lib/indicators/registry";

const MENU_BUTTON_NAME = /^조건별 맵/;

describe("IndicatorMenu", () => {
  it("renders a closed menu button labeled with the current indicator", () => {
    render(<IndicatorMenu />, { wrapper: withNuqsTestingAdapter() });

    const button = screen.getByRole("button", { name: MENU_BUTTON_NAME });
    expect(button).toHaveTextContent(indicatorById(DEFAULT_INDICATOR_ID)!.label);
    expect(button).toHaveAttribute("aria-haspopup", "dialog");
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("opens the popover on click: a labeled dialog containing the IndicatorPicker radios, first radio focused", async () => {
    const user = userEvent.setup();
    render(<IndicatorMenu />, { wrapper: withNuqsTestingAdapter() });

    await user.click(screen.getByRole("button", { name: MENU_BUTTON_NAME }));

    const dialog = screen.getByRole("dialog", { name: "조건별 맵 선택" });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByRole("button", { name: MENU_BUTTON_NAME })).toHaveAttribute("aria-expanded", "true");

    const radios = screen.getAllByRole("radio");
    expect(radios.length).toBeGreaterThan(1);
    expect(radios[0]).toHaveFocus();
  });

  it("selecting an indicator updates the URL (indicator search param) and closes the popover, returning focus to the button", async () => {
    const user = userEvent.setup();
    const onUrlUpdate = vi.fn();
    render(<IndicatorMenu />, { wrapper: withNuqsTestingAdapter({ onUrlUpdate, hasMemory: true }) });

    await user.click(screen.getByRole("button", { name: MENU_BUTTON_NAME }));
    await user.click(screen.getByRole("radio", { name: indicatorById("schools_total")!.label }));

    await waitFor(() => {
      const lastCall = onUrlUpdate.mock.calls.at(-1)?.[0];
      expect(lastCall?.searchParams.get("indicator")).toBe("schools_total");
    });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: MENU_BUTTON_NAME })).toHaveFocus();
    });
  });

  it("closes on Escape and returns focus to the button", async () => {
    const user = userEvent.setup();
    render(<IndicatorMenu />, { wrapper: withNuqsTestingAdapter() });

    await user.click(screen.getByRole("button", { name: MENU_BUTTON_NAME }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: MENU_BUTTON_NAME })).toHaveFocus();
  });

  it("closes on an outside click", async () => {
    const user = userEvent.setup();
    render(
      <div>
        <IndicatorMenu />
        <button type="button">밖</button>
      </div>,
      { wrapper: withNuqsTestingAdapter() },
    );

    await user.click(screen.getByRole("button", { name: MENU_BUTTON_NAME }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "밖" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("does not close when clicking inside the popover but outside a radio (e.g. a group legend)", async () => {
    const user = userEvent.setup();
    render(<IndicatorMenu />, { wrapper: withNuqsTestingAdapter() });

    await user.click(screen.getByRole("button", { name: MENU_BUTTON_NAME }));
    const dialog = screen.getByRole("dialog");
    await user.click(dialog);

    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
