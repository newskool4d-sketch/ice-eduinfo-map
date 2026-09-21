import { afterEach, describe, expect, it, vi } from "vitest";

import { readBasemapPref, writeBasemapPref } from "@/components/map/basemapPref";

/** Minimal Storage-shaped stub — good enough for `getItem`/`setItem`, which is all this module ever calls. */
function fakeStorage(initial: Record<string, string> = {}) {
  const store: Record<string, string> = { ...initial };
  return {
    getItem: vi.fn((k: string) => (k in store ? store[k] : null)),
    setItem: vi.fn((k: string, v: string) => {
      store[k] = v;
    }),
    _store: store,
  };
}

describe("readBasemapPref/writeBasemapPref", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("defaults to true (ON) when nothing is stored yet", () => {
    vi.stubGlobal("window", { localStorage: fakeStorage() });
    expect(readBasemapPref()).toBe(true);
  });

  it("reads a stored '0' as false (OFF)", () => {
    vi.stubGlobal("window", { localStorage: fakeStorage({ "jbmap.basemap": "0" }) });
    expect(readBasemapPref()).toBe(false);
  });

  it("reads a stored '1' as true (ON)", () => {
    vi.stubGlobal("window", { localStorage: fakeStorage({ "jbmap.basemap": "1" }) });
    expect(readBasemapPref()).toBe(true);
  });

  it("write then read round-trips through the same 'jbmap.basemap' key", () => {
    const storage = fakeStorage();
    vi.stubGlobal("window", { localStorage: storage });
    writeBasemapPref(false);
    expect(storage.setItem).toHaveBeenCalledWith("jbmap.basemap", "0");
    expect(readBasemapPref()).toBe(false);

    writeBasemapPref(true);
    expect(storage.setItem).toHaveBeenCalledWith("jbmap.basemap", "1");
    expect(readBasemapPref()).toBe(true);
  });

  it("defaults to true (ON) when localStorage.getItem throws (private-mode Safari etc.)", () => {
    vi.stubGlobal("window", {
      localStorage: {
        getItem: () => {
          throw new Error("blocked");
        },
      },
    });
    expect(readBasemapPref()).toBe(true);
  });

  it("writeBasemapPref silently no-ops when localStorage.setItem throws", () => {
    vi.stubGlobal("window", {
      localStorage: {
        setItem: () => {
          throw new Error("blocked");
        },
      },
    });
    expect(() => writeBasemapPref(false)).not.toThrow();
  });

  it("defaults to true (ON) when window/localStorage is unavailable entirely (SSR-safety)", () => {
    vi.stubGlobal("window", undefined);
    expect(readBasemapPref()).toBe(true);
    expect(() => writeBasemapPref(false)).not.toThrow();
  });
});
