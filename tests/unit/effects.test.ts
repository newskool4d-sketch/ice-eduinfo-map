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

  it("normal mode (presentation: false): vibrance, brightnessContrast, vignette, fxaa — no tiltShift", () => {
    const effects = createPostProcessEffects({ presentation: false, fxOff: false });
    expect(ids(effects)).toEqual(["vibrance-pass", "brightnessContrast-pass", "vignette-pass", "fxaa-pass"]);
  });

  it("presentation mode: tiltShift is included, immediately before fxaa", () => {
    const effects = createPostProcessEffects({ presentation: true, fxOff: false });
    expect(ids(effects)).toEqual([
      "vibrance-pass",
      "brightnessContrast-pass",
      "vignette-pass",
      "tiltShift-pass",
      "fxaa-pass",
    ]);
  });

  it("fxaa is always the last effect when fx is on", () => {
    expect(ids(createPostProcessEffects({ presentation: false, fxOff: false })).at(-1)).toBe("fxaa-pass");
    expect(ids(createPostProcessEffects({ presentation: true, fxOff: false })).at(-1)).toBe("fxaa-pass");
  });

  // Fix round 1, finding 5 — controller visual-tuning pass: Task A's
  // original values (vignette radius 0.72/amount 0.55, contrast 0.12,
  // tiltShift blurRadius 6/gradientRadius 260) read too dark/murky in
  // screenshots, and the presentation-mode blur was too strong. Re-tuned
  // values below; see task-A-report.md's "Fix round 1" section for the
  // before/after screenshots this was checked against.
  it("uses fix round 1's re-tuned values for each pass", () => {
    const effects = createPostProcessEffects({ presentation: true, fxOff: false }) as {
      id: string;
      props: Record<string, unknown>;
    }[];
    const byId = Object.fromEntries(effects.map((e) => [e.id, e.props]));
    expect(byId["vibrance-pass"]).toEqual({ amount: 0.35 });
    expect(byId["brightnessContrast-pass"]).toEqual({ brightness: 0.02, contrast: 0.06 });
    expect(byId["vignette-pass"]).toEqual({ radius: 0.85, amount: 0.35 });
    expect(byId["tiltShift-pass"]).toEqual({ blurRadius: 4, gradientRadius: 320 });
  });
});
