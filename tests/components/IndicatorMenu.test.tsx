import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
    // Fix round 2, finding 8 — aria-controls used to be unconditionally set
    // to "indicator-menu-popover" even while closed, but the popover <div>
    // carrying that id is only rendered when open — a dangling IDREF while
    // closed (an id that resolves to nothing in the DOM at all).
    expect(button).not.toHaveAttribute("aria-controls");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("opens the popover on click: a labeled dialog containing the IndicatorPicker radios, first radio focused", async () => {
    const user = userEvent.setup();
    render(<IndicatorMenu />, { wrapper: withNuqsTestingAdapter() });

    await user.click(screen.getByRole("button", { name: MENU_BUTTON_NAME }));

    const dialog = screen.getByRole("dialog", { name: "조건별 맵 선택" });
    expect(dialog).toBeInTheDocument();
    const button = screen.getByRole("button", { name: MENU_BUTTON_NAME });
    expect(button).toHaveAttribute("aria-expanded", "true");
    // Fix round 2, finding 8 — while open, aria-controls correctly
    // references the now-rendered popover's real id (see the closed-state
    // assertion in the previous test for the other half of this contract).
    expect(button).toHaveAttribute("aria-controls", "indicator-menu-popover");

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

  it("ArrowDown navigates radios live (URL updates each time) without closing the popover", async () => {
    const user = userEvent.setup();
    const onUrlUpdate = vi.fn();
    render(<IndicatorMenu />, { wrapper: withNuqsTestingAdapter({ onUrlUpdate, hasMemory: true }) });

    await user.click(screen.getByRole("button", { name: MENU_BUTTON_NAME }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    // First radio (규모 그룹의 학생수, DEFAULT_INDICATOR_ID) is focused on open (see the
    // preceding test) — arrowing moves to the next radio in the same native
    // radio group (schools_total, then classes_total) and previews it live.
    await user.keyboard("{ArrowDown}");
    await waitFor(() => {
      expect(onUrlUpdate.mock.calls.at(-1)?.[0].searchParams.get("indicator")).toBe("schools_total");
    });
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    await user.keyboard("{ArrowDown}");
    await waitFor(() => {
      expect(onUrlUpdate.mock.calls.at(-1)?.[0].searchParams.get("indicator")).toBe("classes_total");
    });
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("Enter on the focused radio closes the popover", async () => {
    const user = userEvent.setup();
    render(<IndicatorMenu />, { wrapper: withNuqsTestingAdapter() });

    await user.click(screen.getByRole("button", { name: MENU_BUTTON_NAME }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    await user.keyboard("{Enter}");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("Space on the focused radio closes the popover", async () => {
    const user = userEvent.setup();
    render(<IndicatorMenu />, { wrapper: withNuqsTestingAdapter() });

    await user.click(screen.getByRole("button", { name: MENU_BUTTON_NAME }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    await user.keyboard(" ");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
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

  it("Escape calls preventDefault() when it closes the menu (fix round 1, review finding #1 — lets DeckMap's own document-level Escape-to-deselect listener tell this was already handled and skip deselecting the region)", async () => {
    const user = userEvent.setup();
    render(<IndicatorMenu />, { wrapper: withNuqsTestingAdapter() });

    await user.click(screen.getByRole("button", { name: MENU_BUTTON_NAME }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    // fireEvent's return value is dispatchEvent's own result: `false` exactly
    // when some listener called preventDefault() on this (cancelable) event.
    // Dispatched directly on `document` (rather than via user.keyboard,
    // which targets whatever's focused) since this listener is registered
    // on `document` itself, and "at target" listeners fire regardless of
    // capture/bubble.
    const notCanceled = fireEvent.keyDown(document, { key: "Escape" });

    expect(notCanceled).toBe(false);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
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

  it("resets the arrow-key click-suppression when the popover closes, so a later real click still closes it", async () => {
    const user = userEvent.setup();
    render(<IndicatorMenu />, { wrapper: withNuqsTestingAdapter() });

    await user.click(screen.getByRole("button", { name: MENU_BUTTON_NAME }));
    const firstRadio = screen.getAllByRole("radio")[0];

    // Dispatches only the keydown that arms suppressNextClickRef (see
    // handlePopoverKeyDown) WITHOUT the paired synthetic click a real
    // arrow-key press produces (that pairing is what the "ArrowDown
    // navigates..." test above exercises via full user-event interaction,
    // and it's what normally consumes/clears the ref). This isolates the
    // race the safety net guards against: the popover closing (here, via
    // Escape) before that paired click ever arrives to clear the flag
    // itself, leaving it stale for the next, unrelated open.
    fireEvent.keyDown(firstRadio, { key: "ArrowDown" });

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: MENU_BUTTON_NAME }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: indicatorById("schools_total")!.label }));

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
