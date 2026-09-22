import { afterEach, describe, expect, it, vi } from "vitest";
import { readMapMode, writeMapMode } from "@/components/map/mapModePref";
describe("map display preference", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("starts on road even when the old satellite preference exists; remembers the new choice", () => {
    const stored = new Map([["jbmap.basemap", "satellite"]]);
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => stored.get(key) ?? null,
        setItem: (key: string, value: string) => stored.set(key, value),
      },
    });
    expect(readMapMode()).toBe("road");
    writeMapMode("terrain");
    expect(readMapMode()).toBe("terrain");
    writeMapMode("road");
    expect(readMapMode()).toBe("road");
  });
  it("uses road when storage is blocked", () => {
    vi.stubGlobal("window", {
      get localStorage() {
        throw new Error("blocked");
      },
    });
    expect(readMapMode()).toBe("road");
    expect(() => writeMapMode("terrain")).not.toThrow();
  });
});
