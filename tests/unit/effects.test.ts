import { describe, expect, it } from "vitest";

import { createPostProcessEffects } from "@/components/map/effects";

// Task A — post-processing chain. PostProcessEffect#id is `${module.name}-pass`
// (see @deck.gl/core's post-process-effect.js) — a convenient, public way to
// assert WHICH shader module ended up at which position without reaching
// into private state.
function ids(effects: { id: string }[]): string[] {
  return effects.map((e) => e.id);
}

describe("createPostProcessEffects", () => {
  it("fxOff: true returns an empty array regardless of presentation", () => {
    expect(createPostProcessEffects({ presentation: false, fxOff: true })).toEqual([]);
    expect(createPostProcessEffects({ presentation: true, fxOff: true })).toEqual([]);
  });

  it("normal mode (presentation: false): NO post-processing at all (canvas MSAA instead)", () => {
    const effects = createPostProcessEffects({ presentation: false, fxOff: false });
    expect(effects).toEqual([]);
  });

  it("presentation mode: tiltShift is included, immediately before fxaa", () => {
    const effects = createPostProcessEffects({ presentation: true, fxOff: false });
    expect(ids(effects)).toEqual(["tiltShift-pass", "fxaa-pass"]);
  });

  it("fxaa is always the last effect when a post-processing chain exists (presentation mode)", () => {
    expect(ids(createPostProcessEffects({ presentation: true, fxOff: false })).at(-1)).toBe("fxaa-pass");
  });

  // 2026-09-22 성능 조정: 기본 모드는 후처리 없음(캔버스 MSAA), 발표 모드만
  // 틸트시프트 + FXAA. The values below are presentation mode's only look pass.
  it("uses the tilt-shift values for presentation mode", () => {
    const effects = createPostProcessEffects({ presentation: true, fxOff: false }) as {
      id: string;
      props: Record<string, unknown>;
    }[];
    const byId = Object.fromEntries(effects.map((e) => [e.id, e.props]));
    expect(byId["tiltShift-pass"]).toEqual({ blurRadius: 4, gradientRadius: 320 });
  });
});
