import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
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
});
