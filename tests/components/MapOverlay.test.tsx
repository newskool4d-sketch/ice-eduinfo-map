import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import MapOverlay, { type MapOverlayItem } from "@/components/map/MapOverlay";

describe("MapOverlay", () => {
  it("renders nothing when items is empty (auto-hidden, e.g. fallback mode)", () => {
    const { container } = render(<MapOverlay items={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders one button per item, with its label/title and aria-pressed state", () => {
    const items: MapOverlayItem[] = [
      { id: "presentation", label: "발표 모드", pressed: false, onToggle: vi.fn(), title: "틸트시프트·미니어처 효과" },
    ];
    render(<MapOverlay items={items} />);
    const button = screen.getByRole("button", { name: "발표 모드" });
    expect(button).toHaveAttribute("aria-pressed", "false");
    expect(button).toHaveAttribute("title", "틸트시프트·미니어처 효과");
  });

  // Task 1 fix round 1 — the rest-state chip must keep a visible surface on
  // hover (the old `hover:bg-ink/10` swapped the translucent white surface
  // for a translucent ink wash and made the chip look like it vanished over
  // the light map). Pinned by class token, not substring: `hover:bg-surface`
  // is a whole utility that must be present, `hover:bg-ink/10` must be gone.
  it("rest-state (unpressed) chip hovers to bg-surface, not to an ink wash", () => {
    const items: MapOverlayItem[] = [
      { id: "presentation", label: "발표 모드", pressed: false, onToggle: vi.fn() },
    ];
    render(<MapOverlay items={items} />);
    const button = screen.getByRole("button", { name: "발표 모드" });
    expect(button.className).toMatch(/(^|\s)hover:bg-surface(\s|$)/);
    expect(button.className).not.toMatch(/(^|\s)hover:bg-ink\/10(\s|$)/);
  });

  it("calls the item's onToggle when clicked", async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    render(
      <MapOverlay
        items={[{ id: "presentation", label: "발표 모드", pressed: false, onToggle }]}
      />,
    );
    await user.click(screen.getByRole("button", { name: "발표 모드" }));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("renders multiple items in the given order (design point: a later task appends a '배경 지도' button)", () => {
    const items: MapOverlayItem[] = [
      { id: "presentation", label: "발표 모드", pressed: false, onToggle: vi.fn() },
      { id: "basemap", label: "배경 지도", pressed: true, onToggle: vi.fn() },
    ];
    render(<MapOverlay items={items} />);
    const buttons = screen.getAllByRole("button");
    expect(buttons.map((b) => b.textContent)).toEqual(["발표 모드", "배경 지도"]);
  });

  // Task A requirement: 발표 모드 button toggles aria-pressed — exercised here
  // through a tiny stateful wrapper (mirroring how DeckMap actually owns
  // `presentation` state and hands MapOverlay a controlled `items` array),
  // since MapOverlay itself holds no state of its own.
  it("aria-pressed flips when the controlling component's state toggles on click", async () => {
    const user = userEvent.setup();

    function Wrapper() {
      const [presentation, setPresentation] = useState(false);
      const items: MapOverlayItem[] = [
        {
          id: "presentation",
          label: "발표 모드",
          pressed: presentation,
          onToggle: () => setPresentation((p) => !p),
        },
      ];
      return <MapOverlay items={items} />;
    }

    render(<Wrapper />);
    const button = screen.getByRole("button", { name: "발표 모드" });
    expect(button).toHaveAttribute("aria-pressed", "false");

    await user.click(button);
    expect(button).toHaveAttribute("aria-pressed", "true");

    await user.click(button);
    expect(button).toHaveAttribute("aria-pressed", "false");
  });

  // Task C — optional `attribution` caption (basemap tile source), additive:
  // MapOverlay stays a purely controlled, generic component — it renders
  // whatever string it's given (or nothing) and doesn't know it's for the
  // VWorld basemap specifically.
  describe("attribution (Task C)", () => {
    it("renders nothing when both items and attribution are omitted/empty", () => {
      const { container } = render(<MapOverlay items={[]} />);
      expect(container).toBeEmptyDOMElement();
    });

    it("renders the attribution text with testid basemap-attribution when provided", () => {
      render(<MapOverlay items={[]} attribution="배경지도 © 국토교통부 브이월드(VWorld)" />);
      expect(screen.getByTestId("basemap-attribution")).toHaveTextContent(
        "배경지도 © 국토교통부 브이월드(VWorld)",
      );
    });

    it("does not render the attribution element when attribution is omitted", () => {
      const items: MapOverlayItem[] = [
        { id: "presentation", label: "발표 모드", pressed: false, onToggle: vi.fn() },
      ];
      render(<MapOverlay items={items} />);
      expect(screen.queryByTestId("basemap-attribution")).not.toBeInTheDocument();
    });

    it("renders both the button row and the attribution together", () => {
      const items: MapOverlayItem[] = [
        { id: "presentation", label: "발표 모드", pressed: false, onToggle: vi.fn() },
        { id: "basemap", label: "배경 지도", pressed: true, onToggle: vi.fn() },
      ];
      render(<MapOverlay items={items} attribution="배경지도 © 국토교통부 브이월드(VWorld)" />);
      expect(screen.getAllByRole("button")).toHaveLength(2);
      expect(screen.getByTestId("basemap-attribution")).toBeInTheDocument();
    });
  });

  // Task 3 (bright diorama) — `kind: "segmented"` renders a radiogroup
  // instead of a toggle button. The toggle tests above deliberately pass
  // items WITHOUT `kind` so the old shape stays accepted as-is.
  describe("segmented item (Task 3 — 배경 지도 3단)", () => {
    const options = [
      { value: "off", label: "끄기" },
      { value: "satellite", label: "위성" },
      { value: "base", label: "일반" },
    ];

    it("renders a segmented item as a radiogroup with one checked radio, and reports changes", async () => {
      const onChange = vi.fn();
      render(
        <MapOverlay
          items={[
            {
              kind: "segmented",
              id: "basemap",
              label: "배경 지도",
              value: "satellite",
              options,
              onChange,
            },
          ]}
        />,
      );
      const group = screen.getByRole("radiogroup", { name: "배경 지도" });
      const radios = within(group).getAllByRole("radio");
      expect(radios.map((r) => r.textContent)).toEqual(["끄기", "위성", "일반"]);
      expect(radios[1]).toHaveAttribute("aria-checked", "true");
      expect(radios[0]).toHaveAttribute("aria-checked", "false");
      expect(radios[2]).toHaveAttribute("aria-checked", "false");
      await userEvent.setup().click(radios[2]);
      expect(onChange).toHaveBeenCalledWith("base");
      expect(onChange).toHaveBeenCalledTimes(1);
    });

    it("passes `title` through to the group, and mixes with toggle items in the given order", () => {
      render(
        <MapOverlay
          items={[
            { id: "presentation", label: "발표 모드", pressed: false, onToggle: vi.fn() },
            {
              kind: "segmented",
              id: "basemap",
              label: "배경 지도",
              value: "off",
              options,
              onChange: vi.fn(),
              title: "브이월드 배경 타일: 끄기 / 위성 / 일반",
            },
            { kind: "toggle", id: "emd", label: "읍면동 경계", pressed: true, onToggle: vi.fn() },
          ]}
        />,
      );
      const group = screen.getByRole("radiogroup", { name: "배경 지도" });
      expect(group).toHaveAttribute("title", "브이월드 배경 타일: 끄기 / 위성 / 일반");
      // The three radios are NOT `button`s in the a11y tree — the toggle
      // buttons around them still are, in DOM order.
      expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual([
        "발표 모드",
        "읍면동 경계",
      ]);
      const row = group.parentElement!;
      expect(Array.from(row.children).map((c) => c.textContent)).toEqual([
        "발표 모드",
        "끄기위성일반",
        "읍면동 경계",
      ]);
    });

    it("styles the checked radio like a pressed chip and the rest like unpressed ones", () => {
      render(
        <MapOverlay
          items={[
            { kind: "segmented", id: "basemap", label: "배경 지도", value: "base", options, onChange: vi.fn() },
          ]}
        />,
      );
      const group = screen.getByRole("radiogroup", { name: "배경 지도" });
      expect(group.className).toMatch(/(^|\s)pointer-events-auto(\s|$)/);
      expect(group.className).toMatch(/(^|\s)border-line(\s|$)/);
      const [off, , base] = within(group).getAllByRole("radio");
      expect(base.className).toMatch(/(^|\s)bg-accent-soft(\s|$)/);
      expect(base.className).toMatch(/(^|\s)font-semibold(\s|$)/);
      expect(off.className).toMatch(/(^|\s)hover:bg-surface(\s|$)/);
      expect(off.className).not.toMatch(/(^|\s)bg-accent-soft(\s|$)/);
    });

    // Task 3 fix round 1 — WAI-ARIA radiogroup keyboard pattern: roving
    // tabindex (only the checked radio is a Tab stop) + arrow keys move the
    // selection (and focus) within the group, Home/End jump to the ends.
    describe("keyboard (roving tabindex + arrows/Home/End)", () => {
      function renderGroup(value: string, onChange = vi.fn()) {
        render(
          <MapOverlay
            items={[{ kind: "segmented", id: "basemap", label: "배경 지도", value, options, onChange }]}
          />,
        );
        const group = screen.getByRole("radiogroup", { name: "배경 지도" });
        return { group, radios: within(group).getAllByRole("radio"), onChange };
      }

      it("only the checked radio has tabIndex 0; the others are -1", () => {
        const { radios } = renderGroup("satellite");
        expect(radios.map((r) => r.tabIndex)).toEqual([-1, 0, -1]);
      });

      it("falls back to the first radio as the Tab stop when no option is checked", () => {
        const { radios } = renderGroup("nope");
        expect(radios.map((r) => r.tabIndex)).toEqual([0, -1, -1]);
        expect(radios.every((r) => r.getAttribute("aria-checked") === "false")).toBe(true);
      });

      it("ArrowRight/ArrowDown select the next option and move focus to it", async () => {
        const user = userEvent.setup();
        const { radios, onChange } = renderGroup("satellite");
        radios[1].focus();
        await user.keyboard("{ArrowRight}");
        expect(onChange).toHaveBeenCalledWith("base");
        expect(radios[2]).toHaveFocus();
        await user.keyboard("{ArrowDown}");
        // Movement is relative to the FOCUSED radio (WAI-ARIA), so from the
        // last option ArrowDown wraps to the first even though the controlled
        // `value` (vi.fn) is still "satellite".
        expect(onChange).toHaveBeenLastCalledWith("off");
        expect(radios[0]).toHaveFocus();
        expect(onChange).toHaveBeenCalledTimes(2);
      });

      it("ArrowLeft/ArrowUp select the previous option; both directions wrap around", async () => {
        const user = userEvent.setup();
        const last = renderGroup("base");
        last.radios[2].focus();
        await user.keyboard("{ArrowRight}");
        expect(last.onChange).toHaveBeenLastCalledWith("off");
        expect(last.radios[0]).toHaveFocus();
        await user.keyboard("{ArrowLeft}");
        // From the focused first option, ArrowLeft wraps to the last.
        expect(last.onChange).toHaveBeenLastCalledWith("base");
        expect(last.radios[2]).toHaveFocus();
        await user.keyboard("{ArrowUp}");
        // From the focused last option, ArrowUp moves to the middle one.
        expect(last.onChange).toHaveBeenLastCalledWith("satellite");
        expect(last.radios[1]).toHaveFocus();
        expect(last.onChange).toHaveBeenCalledTimes(3);
      });

      it("ignores Alt/Ctrl/Meta+Arrow chords (browser Back/Forward etc.)", async () => {
        const user = userEvent.setup();
        const { radios, onChange } = renderGroup("satellite");
        radios[1].focus();
        await user.keyboard("{Alt>}{ArrowRight}{/Alt}");
        await user.keyboard("{Meta>}{ArrowLeft}{/Meta}");
        await user.keyboard("{Control>}{ArrowDown}{/Control}");
        expect(onChange).not.toHaveBeenCalled();
        expect(radios[1]).toHaveFocus();
      });

      it("ArrowLeft from the first option wraps to the last", async () => {
        const user = userEvent.setup();
        const { radios, onChange } = renderGroup("off");
        radios[0].focus();
        await user.keyboard("{ArrowLeft}");
        expect(onChange).toHaveBeenCalledWith("base");
        expect(radios[2]).toHaveFocus();
      });

      it("Home/End select the first/last option", async () => {
        const user = userEvent.setup();
        const { radios, onChange } = renderGroup("satellite");
        radios[1].focus();
        await user.keyboard("{End}");
        expect(onChange).toHaveBeenLastCalledWith("base");
        expect(radios[2]).toHaveFocus();
        await user.keyboard("{Home}");
        expect(onChange).toHaveBeenLastCalledWith("off");
        expect(radios[0]).toHaveFocus();
        expect(onChange).toHaveBeenCalledTimes(2);
      });

      it("arrow keys drive a controlled parent: the selection and the Tab stop follow", async () => {
        const user = userEvent.setup();
        function Wrapper() {
          const [value, setValue] = useState("satellite");
          return (
            <MapOverlay
              items={[{ kind: "segmented", id: "basemap", label: "배경 지도", value, options, onChange: setValue }]}
            />
          );
        }
        render(<Wrapper />);
        const radios = within(screen.getByRole("radiogroup", { name: "배경 지도" })).getAllByRole("radio");
        radios[1].focus();
        await user.keyboard("{ArrowRight}");
        expect(radios[2]).toHaveAttribute("aria-checked", "true");
        expect(radios[2]).toHaveFocus();
        expect(radios.map((r) => r.tabIndex)).toEqual([-1, -1, 0]);
        await user.keyboard("{ArrowRight}");
        expect(radios[0]).toHaveAttribute("aria-checked", "true");
        expect(radios[0]).toHaveFocus();
        expect(radios.map((r) => r.tabIndex)).toEqual([0, -1, -1]);
      });

      it("Enter/Space keep the button's native activation (onChange for the focused option)", async () => {
        const user = userEvent.setup();
        const { radios, onChange } = renderGroup("satellite");
        radios[0].focus();
        await user.keyboard("{Enter}");
        expect(onChange).toHaveBeenLastCalledWith("off");
        await user.keyboard(" ");
        expect(onChange).toHaveBeenLastCalledWith("off");
        expect(onChange).toHaveBeenCalledTimes(2);
      });

      it("has an inset focus-visible ring so the container's overflow-hidden can't clip it", () => {
        const { radios } = renderGroup("satellite");
        for (const r of radios) {
          expect(r.className).toMatch(/(^|\s)focus-visible:outline-none(\s|$)/);
          expect(r.className).toMatch(/(^|\s)focus-visible:ring-2(\s|$)/);
          expect(r.className).toMatch(/(^|\s)focus-visible:ring-inset(\s|$)/);
          expect(r.className).toMatch(/(^|\s)focus-visible:ring-accent(\s|$)/);
        }
      });
    });
  });
});
