import { afterEach, describe, expect, it, vi } from "vitest";

import { isMapFxOff } from "@/components/map/mapFx";

// Task A — 비상 스위치: NEXT_PUBLIC_MAP_FX=off turns off post-processing and
// shadows (see effects.ts/DeckMap.tsx), independent of NEXT_PUBLIC_E2E. Pure
// function — reads process.env at CALL time (not module-load time), so it's
// testable via vi.stubEnv without needing to re-import the module per case.
describe("isMapFxOff", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('is true when NEXT_PUBLIC_MAP_FX is exactly "off"', () => {
    vi.stubEnv("NEXT_PUBLIC_MAP_FX", "off");
    expect(isMapFxOff()).toBe(true);
  });

  it("is false when the env var is unset", () => {
    vi.stubEnv("NEXT_PUBLIC_MAP_FX", undefined);
    expect(isMapFxOff()).toBe(false);
  });

  it("is false for any other value (not a fuzzy truthy check)", () => {
    vi.stubEnv("NEXT_PUBLIC_MAP_FX", "true");
    expect(isMapFxOff()).toBe(false);
    vi.stubEnv("NEXT_PUBLIC_MAP_FX", "1");
    expect(isMapFxOff()).toBe(false);
    vi.stubEnv("NEXT_PUBLIC_MAP_FX", "OFF");
    expect(isMapFxOff()).toBe(false);
  });
});
