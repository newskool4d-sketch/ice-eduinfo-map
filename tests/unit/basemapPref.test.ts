import { afterEach, describe, expect, it, vi } from "vitest";

import { readBasemapPref, writeBasemapPref, resolveBasemap } from "@/components/map/basemapPref";

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

  it("defaults to automatic theme matching when nothing is stored yet", () => {
    vi.stubGlobal("window", { localStorage: fakeStorage() });
    expect(readBasemapPref()).toBe("auto");
  });

  // Task 3 (bright diorama) — the pref used to be a boolean stored as "1"/"0"
  // (2차 개선 Task C). Those values must keep reading back as something
  // sensible for returning users, under the SAME storage key.
  it("migrates the old boolean values: '1' → satellite, '0' → off", () => {
    vi.stubGlobal("window", { localStorage: fakeStorage({ "jbmap.basemap": "1" }) });
    expect(readBasemapPref()).toBe("satellite");
    vi.unstubAllGlobals();
    vi.stubGlobal("window", { localStorage: fakeStorage({ "jbmap.basemap": "0" }) });
    expect(readBasemapPref()).toBe("off");
  });

  it("reads all modes verbatim and falls back to auto on invalid values", () => {
    for (const mode of ["auto", "off", "satellite", "base", "white", "midnight"] as const) {
      vi.stubGlobal("window", { localStorage: fakeStorage({ "jbmap.basemap": mode }) });
      expect(readBasemapPref()).toBe(mode);
      vi.unstubAllGlobals();
    }
    vi.stubGlobal("window", { localStorage: fakeStorage({ "jbmap.basemap": "invalid" }) });
    expect(readBasemapPref()).toBe("auto");
  });

  it("write stores the mode string under 'jbmap.basemap' and reads back round-trip", () => {
    const storage = fakeStorage();
    vi.stubGlobal("window", { localStorage: storage });
    writeBasemapPref("base");
    expect(storage.setItem).toHaveBeenCalledWith("jbmap.basemap", "base");
    expect(readBasemapPref()).toBe("base");

    writeBasemapPref("off");
    expect(storage.setItem).toHaveBeenCalledWith("jbmap.basemap", "off");
    expect(readBasemapPref()).toBe("off");
  });

  it("defaults to auto when localStorage.getItem throws", () => {
    vi.stubGlobal("window", {
      localStorage: {
        getItem: () => {
          throw new Error("blocked");
        },
      },
    });
    expect(readBasemapPref()).toBe("auto");
  });

  it("writeBasemapPref silently no-ops when localStorage.setItem throws", () => {
    vi.stubGlobal("window", {
      localStorage: {
        setItem: () => {
          throw new Error("blocked");
        },
      },
    });
    expect(() => writeBasemapPref("off")).not.toThrow();
  });

  it("defaults to auto when window/localStorage is unavailable (SSR-safety)", () => {
    vi.stubGlobal("window", undefined);
    expect(readBasemapPref()).toBe("auto");
    expect(() => writeBasemapPref("off")).not.toThrow();
  });
});

describe("theme-aware basemap selection", () => {
  it("follows the theme only in automatic mode", () => {
    expect(resolveBasemap("auto", false)).toBe("white");
    expect(resolveBasemap("auto", true)).toBe("midnight");
    for (const mode of ["base", "white", "midnight", "satellite"] as const) {
      expect(resolveBasemap(mode, false)).toBe(mode);
      expect(resolveBasemap(mode, true)).toBe(mode);
    }
  });
  it("keeps the basemap off in either theme", () => {
    expect(resolveBasemap("off", false)).toBeNull();
    expect(resolveBasemap("off", true)).toBeNull();
  });
});
