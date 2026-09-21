/**
 * Task A — 비상 스위치: `NEXT_PUBLIC_MAP_FX=off` turns off both post-processing
 * (effects.ts's `createPostProcessEffects`) and shadow casting (lighting.ts's
 * `lightingEffectNoShadow`), for use only if CI flakiness or a real device's
 * GPU can't tolerate the shadow pass / post-process FBO chain. Deliberately
 * NOT tied to `NEXT_PUBLIC_E2E` (DeckMap.tsx's own `E2E` constant) — e2e runs
 * with visual fx ON by default; this is a separate, manually-set escape
 * hatch.
 */
export function isMapFxOff(): boolean {
  return process.env.NEXT_PUBLIC_MAP_FX === "off";
}
