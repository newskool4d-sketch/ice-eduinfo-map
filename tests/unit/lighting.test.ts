import { afterEach, describe, expect, it, vi } from "vitest";
import { Vector3 } from "@math.gl/core";
import { LightingEffect } from "@deck.gl/core";
import type { AmbientLight, DirectionalLight, Effect, PointLight } from "@deck.gl/core";

import { lightingEffect, lightingEffectNoShadow, REGION_MATERIAL } from "@/components/map/lighting";

// PointLight is part of LightingEffect#props' real union even though this
// app never constructs one — needed so `lightingEffect`/`lightingEffectNoShadow`
// (real `LightingEffect` instances) are assignable to this helper's parameter type.
type NamedLight = DirectionalLight | AmbientLight | PointLight;

function directionalLights(effect: { props: Record<string, NamedLight> }): DirectionalLight[] {
  return Object.values(effect.props).filter((l): l is DirectionalLight => l.type === "directional");
}

function ambientLight(effect: { props: Record<string, NamedLight> }): AmbientLight {
  const ambient = Object.values(effect.props).find((l): l is AmbientLight => l.type === "ambient");
  if (!ambient) throw new Error("no ambient light configured");
  return ambient;
}

// 밝은 디오라마 (2026-09-21 spec §3, Task 2 fix round 1 ruling) — the light
// SET is identical on both variants (shadows are off everywhere now, so the
// only historical difference — the key light's `_shadow` flag — is gone
// too); these assertions run once per variant so a drift between the two
// can't slip through.
function expectDaylightRig(effect: typeof lightingEffect) {
  const directional = directionalLights(effect);
  expect(directional).toHaveLength(1);
  const [key] = directional;

  // deck.gl's `direction` is the light's TRAVEL vector: [-0.5,-1,-2.5]
  // travels west/south/down, so the light arrives from the upper-right
  // (north-east) at a high angle.
  const expected = new Vector3([-0.5, -1, -2.5]).normalize().toArray();
  expect(key.direction[0]).toBeCloseTo(expected[0], 10);
  expect(key.direction[1]).toBeCloseTo(expected[1], 10);
  expect(key.direction[2]).toBeCloseTo(expected[2], 10);

  // Key 0.9 (low end of the 0.9~1.1 tuning range — Task 2 fix round 1
  // screenshot tuning) with the phong-matched material below: top ≈ 0.7×0.95
  // + 0.3×0.9×cosθ ≈ 0.91, which (plus specular and the post-process lift)
  // lands the lit top at ≈ the raw palette stop on screen — no clipping.
  expect(key.color).toEqual([255, 245, 225]);
  expect(key.intensity).toBe(0.9);

  // Ambient 0.95 (tuning range 0.9~1.05): the ambient-only walls sit at
  // ≈0.72× the top face — the intended miniature side-shading, never black.
  expect(ambientLight(effect).color).toEqual([255, 250, 240]);
  expect(ambientLight(effect).intensity).toBe(0.95);
}

describe("lightingEffect", () => {
  // Fix round 1, finding 4 — the fill light is gone (not just non-shadow-
  // casting): LightingEffect creates one ShadowPass PER directional light
  // unconditionally (lighting-effect.js's `_createShadowPasses`/
  // `_calculateMatrices` both loop over `this.directionalLights` with no
  // per-light `.shadow` filter), so a second light was silently doubling
  // the shadow-pass cost for a light that was never meant to cast one. See
  // lighting.ts's own comment for the full mechanism and the ambient/
  // material compensation.
  // Task 2 fix round 1 ruling — and now NO light casts a shadow at all: deck
  // 9.4's shadow module judged the whole top face of a tall block as
  // self-shadowed (a global tint), while real cast shadows were invisible
  // at the overview zoom. Depth now comes from wall shading + vignette.
  it("has exactly one directional light (the key light), and it casts NO shadow", () => {
    const directional = directionalLights(lightingEffect);
    expect(directional).toHaveLength(1);
    expect(directional.filter((l) => l.shadow === true)).toHaveLength(0);
  });

  it("uses the daylight rig (key [255,245,225] @ 0.9 from the upper-right, ambient [255,250,240] @ 0.95)", () => {
    expectDaylightRig(lightingEffect);
  });

  // With `_shadow:false` `shadowColor` is never sampled; it is deliberately
  // NOT assigned in lighting.ts, so it stays at LightingEffect's own
  // DEFAULT_SHADOW_COLOR (lighting-effect.js: `[0, 0, 0, 200 / 255]`).
  it("leaves shadowColor at deck.gl's default (not configured — shadows are off)", () => {
    expect(lightingEffect.shadowColor).toEqual([0, 0, 0, 200 / 255]);
  });
});

// Fix round 1, finding 1 — REWRITTEN: Task A's original comment here (and
// its "corrupts gl_Position" theory) was wrong. Re-traced against the
// installed deck.gl/luma.gl sources; the real mechanism never touches
// `gl_Position`. `@deck.gl/core`'s picking pass does `effects:
// effects?.filter(e => e.useInPicking)` (pick-layers-pass.js:48), and
// `LightingEffect` never sets `useInPicking` itself, so its
// `getShaderModuleProps` (the only source of a real `dummyShadowMap`) never
// runs for picking. `LayersPass._getShaderModuleProps`'s "ensure every
// default shader module has an entry" fallback (layers-pass.js:310-318)
// still inserts an EMPTY `shadow: {}`, so `createShadowUniforms({})`
// (shadow.js:147-156) hits its early-return branch: `drawShadowMap:false,
// useShadowMap:false` (so the vertex shader's `shadow_setVertexPosition`
// falls through both branches and returns `gl_Position` UNCHANGED — no
// corruption), but ALSO `shadow_uShadowMap0/1: undefined`. Those are real
// texture bindings every layer's compiled program now declares (shadow is a
// deck-wide default shader module once `_shadow:true` registers it — see
// lighting.ts's own comment). `WEBGLRenderPipeline._areTexturesRenderable`
// (webgl-render-pipeline.js:143-152) finds the missing binding, logs the
// exact observed warning, and returns false; `WEBGLRenderPass.draw()`
// (webgl-render-pass.js:166-169) then ABORTS the draw call before any
// `gl.drawArrays`/`gl.drawElements` — for every layer, in every picking
// draw. That's why the picking buffer came back completely empty (0/86 hits
// on a full canvas grid scan, not corrupted/glitched hits) rather than
// merely wrong. Verified both by reading the installed sources end to end
// and empirically (temporarily disabling the fix below reproduced 0/10
// `deck.pickObject()` hits plus the exact predicted
// `shadow_uShadowMap0/1 not found` warnings with a matching stack trace —
// see lighting.ts's own comment and task-A-report.md's "Fix round 1"
// section for the full methodology).
describe("useInPicking (Task A fix, retired 2026-09-22 — shadows are off, so it is no longer needed)", () => {
  it("is NOT set on either variant (lighting stays out of the picking pass)", () => {
    expect((lightingEffect as Effect).useInPicking).toBeFalsy();
    expect((lightingEffectNoShadow as Effect).useInPicking).toBeFalsy();
  });
});

// Task B — CollisionFilterExtension compatibility fix: see lighting.ts's own
// (extensive) comment for the full traced mechanism. Regression guard for
// the underlying cause, confirmed directly (not just by reading source): the
// INSTALLED, unpatched `@deck.gl/core` LightingEffect.preRender() returns
// `undefined` even with a real shadow-casting light configured (verified via
// `node -e`, see task-B-report.md) — which made `CollisionFilterEffect`
// (installed @deck.gl/extensions) permanently exclude lighting from the
// collision-filter pass's shader-module props (`allEffects.filter(e =>
// e.useInPicking && preRenderStats[e.id])` — `preRenderStats[e.id]` is that
// same `undefined` return value, always falsy), silently fading every
// collision-enabled label (region-labels, always; school-labels, once
// selected+zoomed) to alpha 0 whenever ANY shadow-casting light was
// configured. `CollisionAwareLightingEffect` (lighting.ts) fixes this by
// returning a truthy value once its real `preRender` has run — safe to call
// directly here: `_calculateMatrices()` (the only work `preRender` does
// before its shadow-passes loop) is pure `Matrix4`/`Vector3` math over
// `this.directionalLights` (populated by the constructor, not `setup()`),
// and `this.shadowPasses` is empty until a real `<DeckGL>` mount calls
// `setup()` (never invoked by this module-level singleton in a unit test),
// so the loop body — the only part that would need a real GPU device —
// never executes.
describe("preRender return value (Task B — CollisionFilterExtension compatibility fix)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns a truthy value on both variants, unlike the installed (unpatched) LightingEffect.preRender()", () => {
    const opts = { layers: [], viewports: [] } as unknown as Parameters<(typeof lightingEffect)["preRender"]>[0];
    expect(lightingEffect.preRender(opts)).toBeTruthy();
    expect(lightingEffectNoShadow.preRender(opts)).toBeTruthy();
  });

  // I-2 — the truthy assertion above would keep passing even if
  // `CollisionAwareLightingEffect.preRender`'s own `super.preRender(opts)`
  // call were deleted outright (only the `return true` kept) — it never
  // verifies the override still DELEGATES to the real base-class
  // implementation. Spy directly on `LightingEffect.prototype.preRender`
  // (what `super.preRender` resolves to) to close that gap: it must still be
  // called exactly once per `preRender` call, with the IDENTICAL `opts`
  // reference the override itself received (not a copy) — the base method
  // reads directly off `opts`/`this`, so a real delegation (not a stand-in)
  // depends on that being the same object, not merely an equal-looking one.
  it("delegates to LightingEffect.prototype.preRender exactly once, with the identical opts reference", () => {
    const opts = { layers: [], viewports: [] } as unknown as Parameters<(typeof lightingEffect)["preRender"]>[0];
    const preRenderSpy = vi.spyOn(LightingEffect.prototype, "preRender");

    lightingEffect.preRender(opts);
    expect(preRenderSpy).toHaveBeenCalledTimes(1);
    expect(preRenderSpy.mock.calls[0][0]).toBe(opts);

    preRenderSpy.mockClear();

    lightingEffectNoShadow.preRender(opts);
    expect(preRenderSpy).toHaveBeenCalledTimes(1);
    expect(preRenderSpy.mock.calls[0][0]).toBe(opts);
  });
});

describe("lightingEffectNoShadow (Task A — NEXT_PUBLIC_MAP_FX=off emergency switch)", () => {
  it("has the same 1 directional light (fill removed, fix round 1 finding 4) with shadow casting off", () => {
    const directional = directionalLights(lightingEffectNoShadow);
    expect(directional).toHaveLength(1);
    expect(directional.filter((l) => l.shadow === true)).toHaveLength(0);
  });

  it("uses the identical daylight rig as lightingEffect (same key/ambient color, intensity, direction)", () => {
    expectDaylightRig(lightingEffectNoShadow);
  });

  it("is a distinct instance from lightingEffect (the fx-off swap path stays structurally intact)", () => {
    expect(lightingEffectNoShadow).not.toBe(lightingEffect);
  });
});

describe("REGION_MATERIAL", () => {
  // 밝은 디오라마 (spec §3, Task 2 fix round 1 ruling + screenshot tuning) —
  // exposure re-set for luma's phong model with shadows off: ambient-heavy
  // (0.7, low end of the 0.7~0.8 range) so the ambient-only walls land at
  // ≈0.72× the lit top, a light diffuse (0.3) so the top face doesn't clip,
  // low shininess. `specularColor` is on luma.gl 9.4's 0..255 BYTE scale
  // (the phong module normalizes it with `floatColors_normalize` = /255),
  // so [20,20,20] ≈ 0.08 — matte paper.
  it("matches the light-theme (daylight) material", () => {
    expect(REGION_MATERIAL).toEqual({
      ambient: 0.7,
      diffuse: 0.3,
      shininess: 8,
      specularColor: [20, 20, 20],
    });
  });
});
