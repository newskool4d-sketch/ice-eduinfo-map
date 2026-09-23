import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { DesignProvider, useDesign } from "@/components/design/DesignProvider";

function Controls() {
  const { design, setDesign, colorMode, setColorMode, textSize, setTextSize } = useDesign();
  return <><output>{design}/{colorMode}/{textSize}</output><button onClick={() => setDesign("desk")}>통계</button><button onClick={() => setColorMode("dark")}>다크</button><button onClick={() => setTextSize("large")}>큰 글씨</button></>;
}
afterEach(() => { cleanup(); vi.restoreAllMocks(); localStorage.clear(); });
describe("independent layout and colour preferences", () => {
  it("changes layout without resetting colour, then restores both on remount", () => {
    const view = render(<DesignProvider><Controls /></DesignProvider>);
    fireEvent.click(screen.getByText("큰 글씨"));
    fireEvent.click(screen.getByText("다크"));
    fireEvent.click(screen.getByText("통계"));
    expect(screen.getByRole("status")).toHaveTextContent("desk/dark/large");
    view.unmount();
    render(<DesignProvider><Controls /></DesignProvider>);
    expect(screen.getByRole("status")).toHaveTextContent("desk/dark/large");
  });
  it("ignores invalid stored preferences", () => {
    localStorage.setItem("ice-map-design-v1", "unknown");
    localStorage.setItem("ice-map-color-v1", "unknown");
    localStorage.setItem("ice-map-text-v1", "unknown");
    render(<DesignProvider><Controls /></DesignProvider>);
    expect(screen.getByRole("status")).toHaveTextContent("atlas/light/normal");
  });
  it("keeps controls usable when browser storage is blocked", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    render(<DesignProvider><Controls /></DesignProvider>);
    fireEvent.click(screen.getByText("다크")); fireEvent.click(screen.getByText("통계"));
    fireEvent.click(screen.getByText("큰 글씨"));
    expect(screen.getByRole("status")).toHaveTextContent("desk/dark/large");
  });
});
