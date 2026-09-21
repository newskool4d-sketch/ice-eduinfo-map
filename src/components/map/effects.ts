import { PostProcessEffect } from "@deck.gl/core";
import type { Effect } from "@deck.gl/core";
import { brightnessContrast, fxaa, tiltShift, vibrance, vignette } from "@luma.gl/effects";

/**
 * Task A — post-processing chain: 바이브런스 → 명암 → 비네팅 →
 * (발표 모드일 때만) 틸트시프트 → FXAA.
 *
 * `fxaa` MUST stay last: routing the scene through post-processing sends it
 * to an offscreen FBO first, which turns off MSAA (verified against the
 * installed `@deck.gl/core`/`@luma.gl/shadertools` — see task-A-brief.md's
 * "검증된 사실"), so FXAA on the FINAL composited frame is what restores edge
 * antialiasing that would otherwise be lost.
 *
 * Returned as `Effect[]` (not the brief's shorthand `PostProcessEffect[]`):
 * `PostProcessEffect<ShaderPassT extends ShaderPass>` is a generic class with
 * no default type parameter, so a bare `PostProcessEffect[]` return
 * annotation doesn't compile — each element here genuinely IS a
 * `PostProcessEffect` instance (one per luma.gl shader module below), just
 * parameterized differently per module. `Effect` is the same public,
 * non-generic interface `<DeckGL effects>` itself is typed to accept.
 */
export interface CreatePostProcessEffectsOptions {
  /** 발표 모드 — DeckMap's session-local (non-persisted) toggle state; adds a tilt-shift/미니어처 blur pass when true. */
  presentation: boolean;
  /** 비상 스위치 (`NEXT_PUBLIC_MAP_FX=off`, see mapFx.ts's `isMapFxOff`) — true means no post-processing at all (empty array). */
  fxOff: boolean;
}

// Fix round 1, finding 5 — controller visual-tuning pass: screenshots taken
// against Task A's original values (vignette radius 0.72/amount 0.55,
// brightnessContrast contrast 0.12, tiltShift blurRadius 6/gradientRadius
// 260) looked too dark/murky, and presentation mode's tilt-shift blur was
// too strong (obscured too much of the frame). Re-tuned here: a wider,
// gentler vignette (radius 0.85, amount 0.35 — starts closer to the edge
// and darkens less), less contrast punch (0.06, down from 0.12 — vibrance
// stays at 0.35, unchanged), and a narrower/milder tilt-shift blur
// (blurRadius 4, gradientRadius 320 — a wider sharp band, less blur
// strength) for presentation mode. See task-A-report.md's "Fix round 1"
// section for the before/after screenshots this was checked against.
export function createPostProcessEffects({ presentation, fxOff }: CreatePostProcessEffectsOptions): Effect[] {
  if (fxOff) return [];

  const effects: Effect[] = [
    new PostProcessEffect(vibrance, { amount: 0.35 }),
    new PostProcessEffect(brightnessContrast, { brightness: 0.02, contrast: 0.06 }),
    new PostProcessEffect(vignette, { radius: 0.85, amount: 0.35 }),
  ];
  if (presentation) {
    effects.push(new PostProcessEffect(tiltShift, { blurRadius: 4, gradientRadius: 320 }));
  }
  effects.push(new PostProcessEffect(fxaa, {}));
  return effects;
}
