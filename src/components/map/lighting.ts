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
// Fix round 1, finding 4 — 0.85 (up from Task A's 0.7): compensates for
// removing the fill DirectionalLight just below (see its own comment) so
// unlit/back-facing surfaces don't read darker than Task A's screenshots
// showed. Still down from the pre-Task-A original of 0.8 — the post-process
// brightness/contrast pass (effects.ts) adds punch of its own on top.
const AMBIENT_INTENSITY = 0.85;

// Created once at module scope (not per-render): deck.gl effects/materials are
// plain config objects, and re-creating them on every DeckMap render would
// needlessly invalidate the layers that reference them.
//
// Fix round 1, finding 4 — the fill DirectionalLight Task A shipped here is
// REMOVED (not just left non-shadow-casting). `LightingEffect` creates one
// ShadowPass PER directional light UNCONDITIONALLY, regardless of that
// light's own `_shadow` flag: confirmed in the installed
// lighting-effect.js — `_createShadowPasses`/`_calculateMatrices` both loop
// over `this.directionalLights` with no per-light filter, and
// `this.shadow` (the effect-wide "is shadowing on at all" switch) is just
// `this.directionalLights.some(light => light.shadow)`. So keeping a
// second, non-shadow-casting fill light was silently paying for a SECOND
// full shadow-map render every frame — and, post-`useInPicking` below,
// every hover pick too (see that comment) — for a light that was never
// meant to cast one; the shadow fragment shader was also sampling
// `shadow_uShadowMap1` and blending its (irrelevant) weight in whenever
// `shadow.lightCount > 1.0` (shadow.js). One light now means one
// ShadowPass, `lightCount === 1`, and `shadow_uShadowMap1` is never
// consulted. The lost fill-light contribution is compensated by raising
// AMBIENT_INTENSITY (above, 0.7 -> 0.85) and REGION_MATERIAL.ambient
// (below, 0.35 -> 0.45) instead — tuned against the before/after
// screenshots in task-A-report.md's "Fix round 1" section.
export const lightingEffect = new LightingEffect({
  ambient: new AmbientLight({ color: [255, 255, 255], intensity: AMBIENT_INTENSITY }),
  key: new DirectionalLight({ color: [255, 255, 255], intensity: 1.0, direction: KEY_DIRECTION, _shadow: true }),
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
// Fix round 1, finding 4 — fill removed here too, though the shadow-pass
// cost argument above does NOT apply to this variant: `this.shadow` is
// false here (no light has `_shadow:true`), so `LightingEffect.setup()`'s
// `if (this.shadow && !this.dummyShadowMap)` guard (lighting-effect.js:41)
// never runs `_createShadowPasses` at all — zero ShadowPass instances exist
// either way, whether this had 1 light or 2. Removed purely so both
// variants share the exact same light SET (only `_shadow` differs), so the
// `NEXT_PUBLIC_MAP_FX=off` render stays visually consistent with the
// shadowed one minus shadows only — not lit by an extra light the other
// variant wouldn't also have.
export const lightingEffectNoShadow = new LightingEffect({
  ambient: new AmbientLight({ color: [255, 255, 255], intensity: AMBIENT_INTENSITY }),
  key: new DirectionalLight({ color: [255, 255, 255], intensity: 1.0, direction: KEY_DIRECTION, _shadow: false }),
});

// Fix round 1, finding 1 — REWRITTEN root-cause comment. Task A's original
// version here (and its regression test) theorized that the shadow
// module's vertex-shader injection was OVERWRITING `gl_Position` with
// uninitialized uniform state during picking. That theory is WRONG —
// re-traced end to end against the exact installed deck.gl/luma.gl sources
// (versions pinned in package.json: @deck.gl/core 9.4.0, @luma.gl/webgl
// 9.4.2) and confirmed empirically (see below). The real mechanism never
// touches `gl_Position` at all; it's a missing-texture-binding pre-flight
// check that silently ABORTS the picking draw call before any GPU
// rasterization happens:
//
// 1. Once `_shadow: true` makes `this.shadow` true, `LightingEffect.setup()`
//    calls `deck._addDefaultShaderModule(shadow)` (lighting-effect.js:
//    41-48). `Layer.getShaders()` unconditionally merges
//    `context.defaultShaderModules` into EVERY layer's shader (layer.js:
//    324-328) — so from this point on, every layer's compiled program, in
//    every pass (including its picking-pass variant), declares
//    `uniform sampler2D shadow_uShadowMap0/1` (shadow.js:56-57), whether or
//    not that layer actually uses lighting.
// 2. The picking pass filters effects to `effects?.filter(e =>
//    e.useInPicking)` (pick-layers-pass.js:48). `LightingEffect` never sets
//    `useInPicking` (absent from the whole installed lighting-effect.js) —
//    so `LightingEffect.getShaderModuleProps` (lighting-effect.js:100-122,
//    the ONLY source of a real `dummyShadowMap`/`shadowMaps`) never runs
//    for that pass, without the fix below.
// 3. `LayersPass._getShaderModuleProps`'s "ensure every default shader
//    module has an entry so its getUniforms is called" fallback
//    (layers-pass.js:310-318) still inserts an EMPTY `shadow: {}` (that
//    fallback exists for a different reason — terrain/mask passes, per its
//    own comment — and has no idea this module needed real values here).
//    `shadow.js`'s `createShadowUniforms({})` (shadow.js:147-156) hits its
//    early-return branch (`!projectProps`) and returns `{drawShadowMap:
//    false, useShadowMap: false, shadow_uShadowMap0: undefined,
//    shadow_uShadowMap1: undefined}`. Because `drawShadowMap`/
//    `useShadowMap` are BOTH false, the vertex shader's
//    `shadow_setVertexPosition` (shadow.js:28-48) falls through both `if`s
//    and returns `gl_Position` COMPLETELY UNCHANGED — no corruption. This
//    is exactly where the old theory breaks down.
// 4. What actually breaks: `shadow_uShadowMap0`/`shadow_uShadowMap1` are
//    real texture bindings the compiled picking-pass program now requires
//    (step 1), bound to `undefined` (step 3).
//    `WEBGLRenderPipeline._areTexturesRenderable` (webgl-render-pipeline.js:
//    143-152) checks every declared binding has a value before each draw;
//    a missing one logs exactly the observed console message (`Binding
//    shadow_uShadowMap0 not found in ...`, same file:147) and returns
//    false. `WEBGLRenderPass.draw()` (webgl-render-pass.js:166-169) then
//    does `if (!pipeline._areTexturesRenderable(...)) { ...; return false;
//    }` — the draw is ABORTED before `gl.drawArrays`/`gl.drawElements` is
//    ever called, for every layer, on every picking draw. That's why the
//    picking buffer came back completely EMPTY (0/86 hits on a full-canvas
//    grid scan — see task-A-report.md — not corrupted/glitched hits): no
//    geometry was ever rasterized into it at all.
//
// Verified two ways: (a) reading the installed sources end to end as above;
// (b) empirically, by temporarily commenting out the two `useInPicking =
// true` lines below and re-running a live pick + console-warning trace —
// reproduced (fix disabled) 0/10 `deck.pickObject()` hits (each aborted
// draw returning in ~1ms) plus the exact predicted `shadow_uShadowMap0/1 not found in
// regions-polygons-fill-{top,side}-cached` / `region-islands-polygons-
// {fill-top,stroke}-cached` warnings, with a stack trace through
// `WEBGLRenderPipeline._areTexturesRenderable` -> `WEBGLRenderPass.draw` ->
// `Model.draw` matching this trace exactly. Re-enabling the two lines
// restored 10/10 hits at ~25-30ms/pick (see the performance-cost comment
// just below) — full methodology in task-A-report.md's "Fix round 1"
// section. `Effect.useInPicking` is a plain, optional interface field
// (`@deck.gl/core`'s effect.d.ts) — `LightingEffect`'s own concrete class
// just never declares/sets it, hence the cast. Applied to BOTH variants for
// symmetry, though it's a no-op for `lightingEffectNoShadow` (shadow's
// default shader module is never registered at all when `this.shadow` is
// false, so nothing depends on this flag there).
(lightingEffect as Effect).useInPicking = true;
(lightingEffectNoShadow as Effect).useInPicking = true;

// Fix round 1, finding 3 — performance cost of the fix above, MEASURED (not
// just estimated). `DeckPicker._drawAndSample`/`_drawAndSampleAsync` — used
// by every `pickObject` call, including deck.gl's own hover picking —
// do `for (const effect of effects) if (effect.useInPicking)
// effect.preRender(opts)` before the actual picking draw
// (deck-picker.js:562-566 / 644-648). `useInPicking = true` means
// `LightingEffect.preRender` (lighting-effect.js:77-99) now runs on EVERY
// pick: a full re-render of the shadow pass — every shadow-casting layer
// (everything except region-labels/school-labels/region-top-rings, which
// opt out via `shadowEnabled: false`), i.e. up to 14 시군 region fill
// polygons plus up to 149 school ColumnLayer instances in the largest
// selected region (public/data/regions.geojson has 14 features;
// public/data/schools.json's largest region has 149 rows). Measured
// directly against this app (Chromium, `window.__jbmap.deck.pickObject()`
// x10, timed with `performance.now()`): ~23-33ms per pick with this fix
// active (shadow pass re-rendered) vs. ~1-2ms per pick with it disabled
// (draw aborted immediately per finding 1 above, and picking doesn't work
// at all) — so the fix costs on the order of 25ms of extra GPU/CPU work per
// pick. Accepted because: (a) there is no correct alternative — finding 1
// showed picking is completely broken without it; (b) hover picking is
// already throttled to at most once per animation frame by deck.gl itself,
// not once per raw `pointermove` event (`@deck.gl/core`'s deck.js:151-153:
// "the pointermove event may fire multiple times in between two animation
// frames... we save the last pick request and only do it once on the next
// animation frame"); (c) removing the fill light (finding 4, below/above)
// already halved this cost from Task A's original 2-shadow-pass setup to
// exactly 1.

// Fix round 1, finding 2 — the "luma.gl: Binding shadow_uShadowMap0/1 not
// found in ..." warning Task A's report said still appeared after the fix
// above: investigated with a temporary console.warn-wrapping Playwright
// script (not committed — full methodology and numbers in
// task-A-report.md's "Fix round 1" section). Verdict: WARM-UP ONLY, and in
// fact NOT REPRODUCIBLE AT ALL against this exact code in a clean session —
// across 2 fresh page loads (mount, 3s idle, a 24-point hover sweep, 10
// explicit `pickObject()` calls, a real region click, another 3s idle),
// zero such warnings fired and all 10 picks hit correctly. Two things make
// it structurally incapable of being a per-frame/growing cost even when it
// DOES fire: (a) it can only fire from the exact same
// `_areTexturesRenderable` abort path as finding 1 above — i.e. it would
// mean some OTHER pipeline is still hitting the finding-1 bug, not a
// separate mechanism; (b) `@probe.gl/log`'s `Log.warn()` de-duplicates with
// `once: true` (base-log.js:58-70), keyed on the fully formatted message
// string (which includes the pipeline id) via an in-memory `Set` scoped to
// the page's JS realm — so each distinct (binding, pipeline-id) pair can
// log to the console AT MOST ONCE per page load, never repeatedly.
// (Confirmed empirically: temporarily disabling `useInPicking` above and
// hover-sweeping produced exactly 8 warnings — 2 bindings x 4 pipelines —
// with zero further growth across 10 more explicit picks and a region
// click that re-exercised those same pipelines.) Best-supported reading of
// what the implementer actually saw (their own words, task-A-report.md's
// 검증 section: "여러 초 대기 + 카메라 nudge 후에도 지속되긴 하지만"/"persists even
// after waiting several seconds + a camera nudge"): that description is
// EXACTLY what a one-time, early-session occurrence looks like from the
// outside — logged once (if timing/driver happens to hit the narrow window
// before every pipeline/the dummy shadow texture is fully warm), then
// permanently stuck in the console SCROLLBACK afterward (nothing makes an
// already-printed line disappear); a recheck "several seconds later" can't
// tell that apart from an ongoing problem without specifically checking
// whether NEW lines keep appearing, which the once-cache above says they
// structurally can't. Not confirmed further (out of this finding's scope):
// a GPU/driver difference (their manual browser check vs. this
// investigation's Playwright/headless Chromium) or a Turbopack-HMR-stale
// pipeline from mid-edit dev iteration are both plausible secondary
// explanations for why it fired at all in their session but not in either
// of mine.

// Fix round 1, finding 4 — ambient 0.35 -> 0.45, same compensation as
// AMBIENT_INTENSITY above, for the removed fill light.
export const REGION_MATERIAL: Material = {
  ambient: 0.45,
  diffuse: 0.7,
  shininess: 14,
  specularColor: [0.1, 0.1, 0.12],
};
