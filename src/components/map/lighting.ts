import { AmbientLight, DirectionalLight, LightingEffect } from "@deck.gl/core";
import type { Effect, Material } from "@deck.gl/core";

// Task A — 키라이트 그림자: steeper than the original [1,-1.5,-3]. Shadow
// RECEIVING can't be turned off per layer (only casting — see
// `shadowEnabled:false` on region-labels/school-labels/region-top-rings in
// labelLayer.ts/schoolLayers.ts/regionLayers.ts), so a steeper key light
// keeps a shorter shadow footprint, reducing how much a tall region's shadow
// spills across a neighboring region's labels/school points (see
// task-A-brief.md's "검증된 사실").
const KEY_DIRECTION: [number, number, number] = [0.6, -1, -3];
const AMBIENT_INTENSITY = 0.7; // down from 0.8 — the post-process brightness/contrast pass (effects.ts) adds punch of its own.

// Created once at module scope (not per-render): deck.gl effects/materials are
// plain config objects, and re-creating them on every DeckMap render would
// needlessly invalidate the layers that reference them.
export const lightingEffect = new LightingEffect({
  ambient: new AmbientLight({ color: [255, 255, 255], intensity: AMBIENT_INTENSITY }),
  key: new DirectionalLight({ color: [255, 255, 255], intensity: 1.0, direction: KEY_DIRECTION, _shadow: true }),
  fill: new DirectionalLight({ color: [200, 215, 255], intensity: 0.4, direction: [-1, 1, -0.5] }),
});

// Task A — dark navy shadow tint, alpha 0.3. `LightingEffect#shadowColor` is
// consumed directly as a WebGL `vec4` uniform mixed against already-0..1
// fragment colors (confirmed against the installed source:
// `@deck.gl/core`'s shadow shader module does
// `mix(color.rgb, shadow.color.rgb, shadowAlpha / blendedAlpha)`, and
// lighting-effect.js's own `DEFAULT_SHADOW_COLOR` is `[0, 0, 0, 200 / 255]` —
// note the `/ 255` on alpha) — i.e. this property is 0..1 FLOAT per channel,
// NOT the 0..255 scale every layer's `getFillColor`/`getColor` accessor uses
// elsewhere in this app. [4, 6, 14] (a 0..255-style dark navy) is divided by
// 255 here to match that format; assigning it unconverted would push R/G/B
// past 1.0 and clamp to a blown-out near-white shadow instead of a dark tint.
lightingEffect.shadowColor = [4 / 255, 6 / 255, 14 / 255, 0.3];

// Task A — 비상 스위치 (`mapFx.ts`'s `isMapFxOff`): the SAME lights, but the key
// light's `_shadow` is off, so DeckMap can swap to a shadow-free effect
// (`NEXT_PUBLIC_MAP_FX=off`) without constructing a new LightingEffect on
// every render — see DeckMap.tsx's `effects` useMemo.
export const lightingEffectNoShadow = new LightingEffect({
  ambient: new AmbientLight({ color: [255, 255, 255], intensity: AMBIENT_INTENSITY }),
  key: new DirectionalLight({ color: [255, 255, 255], intensity: 1.0, direction: KEY_DIRECTION, _shadow: false }),
  fill: new DirectionalLight({ color: [200, 215, 255], intensity: 0.4, direction: [-1, 1, -0.5] }),
});

// Task A — CRITICAL picking fix, found empirically (not in any deck.gl doc):
// with `_shadow: true`, `LightingEffect.setup()` registers `shadow` as a
// DECK-WIDE DEFAULT shader module (`deck._addDefaultShaderModule(shadow)`,
// confirmed in the installed lighting-effect.js), which unconditionally
// injects `shadow_setVertexPosition()` into EVERY layer's vertex shader —
// including the picking pass's. That injected function OVERWRITES
// `gl_Position` whenever the `shadow` uniform block's `drawShadowMap`/
// `useShadowMap` flags are set. `@deck.gl/core`'s picking pass
// (pick-layers-pass.js's `_drawPickingBuffer`) does
// `effects: effects?.filter(e => e.useInPicking)` — and `LightingEffect`
// NEVER sets `useInPicking` (confirmed: absent from the installed
// lighting-effect.js entirely) — so during picking, `LightingEffect`'s own
// `getShaderModuleProps` (which supplies a SAFE `shadow` uniform value,
// falling back to `drawShadowMap:false`/`useShadowMap:false` plus a 1x1
// dummy shadow map when there's nothing real to bind — see shadow.js's
// `createShadowUniforms`) never runs at all, leaving that shader's `shadow`
// uniform block at whatever UNINITIALIZED/stale state the GPU/driver has —
// which can silently corrupt `gl_Position` during the picking draw.
// Symptom verified directly against this app (not a hypothesis): with
// `_shadow: true` and no fix, `deck.pickObject()` returns null for EVERY
// layer at EVERY canvas pixel — clicking any region silently does nothing.
// Setting `useInPicking = true` here makes the picking pass include this
// effect (and therefore its real, SAFE `getShaderModuleProps` output) in its
// own draw, which fixes it completely (verified: a 1240x733 canvas
// pick-grid scan went from 0 hits to the same 86 hits as the pre-Task-A,
// no-shadow baseline). `Effect.useInPicking` is a plain, optional interface
// field (`@deck.gl/core`'s effect.d.ts) — LightingEffect's own concrete
// class just never declares/sets it, hence the cast below. Applied to BOTH
// variants for symmetry, though it's a no-op for `lightingEffectNoShadow`
// (shadow's default shader module is never registered at all when
// `this.shadow` is false, so nothing depends on this flag there).
(lightingEffect as Effect).useInPicking = true;
(lightingEffectNoShadow as Effect).useInPicking = true;

export const REGION_MATERIAL: Material = {
  ambient: 0.35,
  diffuse: 0.7,
  shininess: 14,
  specularColor: [0.1, 0.1, 0.12],
};
