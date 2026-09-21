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

// 밝은 디오라마 (2026-09-21 spec §3) — a lighter touch than the dark-theme
// values (vibrance 0.35, contrast 0.06, vignette radius 0.85/amount 0.35,
// themselves fix round 1's re-tune of Task A's originals): pastel top faces
// need far less saturation push (0.15) and only a hint of contrast (0.05),
// and the vignette drops to a faint edge (radius 0.9, amount 0.15) so the
// paper-colored corners don't turn gray. Presentation mode's tilt-shift
// (blurRadius 4, gradientRadius 320) is unchanged.
export function createPostProcessEffects({ presentation, fxOff }: CreatePostProcessEffectsOptions): Effect[] {
  if (fxOff) return [];

  const effects: Effect[] = [
    new PostProcessEffect(vibrance, { amount: 0.05 }),
    new PostProcessEffect(brightnessContrast, { brightness: 0.02, contrast: 0.05 }),
    new PostProcessEffect(vignette, { radius: 0.9, amount: 0.15 }),
  ];
  if (presentation) {
    effects.push(new PostProcessEffect(tiltShift, { blurRadius: 4, gradientRadius: 320 }));
  }
  effects.push(new PostProcessEffect(fxaa, {}));
  return effects;
}
