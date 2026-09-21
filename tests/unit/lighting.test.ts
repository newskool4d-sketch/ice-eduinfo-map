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

describe("lightingEffect", () => {
  // Fix round 1, finding 4 — the fill light is gone (not just non-shadow-
  // casting): LightingEffect creates one ShadowPass PER directional light
  // unconditionally (lighting-effect.js's `_createShadowPasses`/
  // `_calculateMatrices` both loop over `this.directionalLights` with no
  // per-light `.shadow` filter), so a second light was silently doubling
  // the shadow-pass cost for a light that was never meant to cast one. See
  // lighting.ts's own comment for the full mechanism and the ambient/
  // material compensation.
  it("has exactly one directional light (the key light), and it casts a shadow", () => {
    const directional = directionalLights(lightingEffect);
    expect(directional).toHaveLength(1);
    expect(directional.filter((l) => l.shadow === true)).toHaveLength(1);
  });

  // 밝은 디오라마 (2026-09-21 spec §3) — [-0.5, -1, -2.5]: daylight from the
  // upper-left at a high angle, so shadows stay short and soft.
  it("the shadow-casting key light points in the normalized [-0.5,-1,-2.5] direction", () => {
    const [key] = directionalLights(lightingEffect).filter((l) => l.shadow === true);
    const expected = new Vector3([-0.5, -1, -2.5]).normalize().toArray();
    expect(key.direction[0]).toBeCloseTo(expected[0], 10);
    expect(key.direction[1]).toBeCloseTo(expected[1], 10);
    expect(key.direction[2]).toBeCloseTo(expected[2], 10);
  });

  // 밝은 디오라마 (spec §3) — 0.95 (tuning range 0.9~1.05): daylight ambient so
  // side walls read as "slightly darker than the top", not black.
  it("ambient light intensity is 0.95 (daylight)", () => {
    expect(ambientLight(lightingEffect).intensity).toBe(0.95);
  });

  it("uses warm daylight colors (ambient [255,250,240], key [255,245,225] @ 1.15)", () => {
    expect(ambientLight(lightingEffect).color).toEqual([255, 250, 240]);
    const key = directionalLights(lightingEffect)[0];
    expect(key.color).toEqual([255, 245, 225]);
    expect(key.intensity).toBe(1.15);
  });

  // 밝은 디오라마 (spec §3) — a warm gray-brown tint at alpha 0.18 (tuning
  // range 0.15~0.25): soft daylight shadows. `LightingEffect#shadowColor`
  // must match lighting-effect.js's own DEFAULT_SHADOW_COLOR format —
  // confirmed from source (node_modules/@deck.gl/core/dist/effects/lighting/
  // lighting-effect.js: `[0, 0, 0, 200 / 255]`) and the shadow shader module
  // (shadow.js: `mix(color.rgb, shadow.color.rgb, ...)` against already-0..1
  // fragment colors) to be 0..1 FLOAT per channel, not the 0..255 scale every
  // layer's getFillColor/getColor accessor uses elsewhere in this app. So
  // [60,50,40] must be divided by 255; passing it unconverted would push
  // R/G/B past 1.0 and clamp to a blown-out near-white shadow.
  it("shadowColor is [60,50,40,0.18] converted to 0..1 float (not raw 0..255)", () => {
    expect(lightingEffect.shadowColor).toEqual([60 / 255, 50 / 255, 40 / 255, 0.18]);
  });

  it("every shadowColor channel is within the valid 0..1 uniform range", () => {
    for (const channel of lightingEffect.shadowColor) {
      expect(channel).toBeGreaterThanOrEqual(0);
      expect(channel).toBeLessThanOrEqual(1);
    }
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
describe("useInPicking (Task A — picking-pass regression fix)", () => {
  it("is true on both lightingEffect and lightingEffectNoShadow", () => {
    expect((lightingEffect as Effect).useInPicking).toBe(true);
    expect((lightingEffectNoShadow as Effect).useInPicking).toBe(true);
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

  it("keeps the same ambient intensity as the shadowed variant", () => {
    expect(ambientLight(lightingEffectNoShadow).intensity).toBe(0.95);
  });
});

describe("REGION_MATERIAL", () => {
  // 밝은 디오라마 (spec §3) — higher ambient, lower shininess/specular: matte
  // paper-like blocks rather than glossy plastic.
  it("matches the light-theme (daylight) material", () => {
    expect(REGION_MATERIAL).toEqual({
      ambient: 0.55,
      diffuse: 0.65,
      shininess: 8,
      specularColor: [0.08, 0.08, 0.08],
    });
  });
});
