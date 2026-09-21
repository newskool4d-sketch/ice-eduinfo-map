import { PostProcessEffect } from "@deck.gl/core";
import type { Effect } from "@deck.gl/core";
import { fxaa, tiltShift } from "@luma.gl/effects";

/**
 * Post-processing chain — PRESENTATION MODE ONLY (2026-09-22 성능 조정):
 * 틸트시프트 → FXAA. In the default mode the array is empty, so deck renders
 * straight to the canvas and gets the browser's own MSAA for free (luma.gl
 * creates the WebGL context with the default `antialias: true`); that removes
 * four full-screen passes per frame and the three offscreen buffers. The
 * old vibrance 0.05 / brightness 0.02 / contrast 0.05 passes were visually
 * negligible; the faint vignette is now a CSS radial gradient overlay in
 * DeckMap (zero GPU cost).
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

// Presentation mode's tilt-shift (blurRadius 4, gradientRadius 320) is the
// only "look" pass left; fxaa follows it because the offscreen route loses
// MSAA (see the header comment).
export function createPostProcessEffects({ presentation, fxOff }: CreatePostProcessEffectsOptions): Effect[] {
  if (fxOff || !presentation) return [];
  const effects: Effect[] = [
    new PostProcessEffect(tiltShift, { blurRadius: 4, gradientRadius: 320 }),
    new PostProcessEffect(fxaa, {}),
  ];
  return effects;
}
