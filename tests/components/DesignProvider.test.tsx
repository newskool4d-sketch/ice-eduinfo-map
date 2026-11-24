import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, fireEvent, cleanup } from "@testing-library/react";
import { DesignProvider, resetLegacyDesignForTests, takeLegacyDesign, useDesign } from "@/components/design/DesignProvider";

function Controls() {
  const { colorMode, colorPreference, setColorPreference, textSize, setTextSize } = useDesign();
  return <><output>{colorMode}/{textSize}/{colorPreference}</output><button onClick={() => setColorPreference("dark")}>다크</button><button onClick={() => setColorPreference("system")}>시스템</button><button onClick={() => setTextSize("large")}>큰 글씨</button></>;
}
afterEach(() => { cleanup(); vi.restoreAllMocks(); localStorage.clear(); resetLegacyDesignForTests(); });
describe("display preferences", () => {
  it("changes text size and colour independently, then restores both on remount", () => {
    const view = render(<DesignProvider><Controls /></DesignProvider>);
    fireEvent.click(screen.getByText("큰 글씨"));
    fireEvent.click(screen.getByText("다크"));
    expect(screen.getByRole("status")).toHaveTextContent("dark/large/dark");
    view.unmount();
    render(<DesignProvider><Controls /></DesignProvider>);
    expect(screen.getByRole("status")).toHaveTextContent("dark/large/dark");
  });
  it("ignores invalid stored preferences", () => {
    localStorage.setItem("ice-map-color-v1", "unknown");
    localStorage.setItem("ice-map-text-v1", "unknown");
    render(<DesignProvider><Controls /></DesignProvider>);
    expect(screen.getByRole("status")).toHaveTextContent("light/normal/light");
  });
  it("keeps controls usable when browser storage is blocked", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    render(<DesignProvider><Controls /></DesignProvider>);
    fireEvent.click(screen.getByText("다크"));
    fireEvent.click(screen.getByText("큰 글씨"));
    expect(screen.getByRole("status")).toHaveTextContent("dark/large/dark");
  });
  it("follows the device setting when set to system", () => {
    const listeners: Array<() => void> = [];
    let dark = true;
    vi.stubGlobal("matchMedia", (query: string) => ({ media: query, get matches() { return dark; },
      addEventListener: (_: string, fn: () => void) => listeners.push(fn), removeEventListener: () => {} }));
    render(<DesignProvider><Controls /></DesignProvider>);
    fireEvent.click(screen.getByText("시스템"));
    expect(screen.getByRole("status")).toHaveTextContent("dark/normal/system");
    dark = false;
    act(() => listeners.forEach((fn) => fn()));
    expect(screen.getByRole("status")).toHaveTextContent("light/normal/system");
    vi.unstubAllGlobals();
  });
});
describe("retired screen-version choice", () => {
  it("is read once, removed from storage, and answers the same afterwards", () => {
    localStorage.setItem("ice-map-design-v1", "desk");
    expect(takeLegacyDesign()).toBe("desk");
    expect(localStorage.getItem("ice-map-design-v1")).toBeNull();
    expect(takeLegacyDesign()).toBe("desk");
  });
  it("drops an unknown stored value without acting on it", () => {
    localStorage.setItem("ice-map-design-v1", "unknown");
    expect(takeLegacyDesign()).toBeNull();
    expect(localStorage.getItem("ice-map-design-v1")).toBeNull();
  });
  it("returns nothing when storage is blocked", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    expect(takeLegacyDesign()).toBeNull();
  });
});
