import { describe, expect, it } from "vitest";
import { Vector3 } from "@math.gl/core";
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

  it("the shadow-casting key light points in the normalized [0.6,-1,-3] direction", () => {
    const [key] = directionalLights(lightingEffect).filter((l) => l.shadow === true);
    const expected = new Vector3([0.6, -1, -3]).normalize().toArray();
    expect(key.direction[0]).toBeCloseTo(expected[0], 10);
    expect(key.direction[1]).toBeCloseTo(expected[1], 10);
    expect(key.direction[2]).toBeCloseTo(expected[2], 10);
  });

  // Fix round 1, finding 4 — 0.85 (up from Task A's 0.7): raised to
  // compensate for removing the fill light, above.
  it("ambient light intensity is 0.85 (compensating for the removed fill light)", () => {
    expect(ambientLight(lightingEffect).intensity).toBe(0.85);
  });

  // The brief specifies shadowColor = [4, 6, 14, 0.3] (a dark-navy-at-alpha-0.3
  // intent) but ALSO requires matching lighting-effect.js's own
  // DEFAULT_SHADOW_COLOR format — confirmed from source
  // (node_modules/@deck.gl/core/dist/effects/lighting/lighting-effect.js:
  // `[0, 0, 0, 200 / 255]`) and the shadow shader module (shadow.js:
  // `mix(color.rgb, shadow.color.rgb, ...)` against already-0..1 fragment
  // colors) to be 0..1 FLOAT per channel, not the 0..255 scale every layer's
  // getFillColor/getColor accessor uses elsewhere in this app. So [4,6,14]
  // must be divided by 255; passing it unconverted would push R/G/B past 1.0
  // and clamp to a blown-out near-white shadow instead of a dark tint.
  it("shadowColor is [4,6,14,0.3] converted to 0..1 float (not raw 0..255)", () => {
    expect(lightingEffect.shadowColor).toEqual([4 / 255, 6 / 255, 14 / 255, 0.3]);
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
  it("returns a truthy value on both variants, unlike the installed (unpatched) LightingEffect.preRender()", () => {
    const opts = { layers: [], viewports: [] } as unknown as Parameters<(typeof lightingEffect)["preRender"]>[0];
    expect(lightingEffect.preRender(opts)).toBeTruthy();
    expect(lightingEffectNoShadow.preRender(opts)).toBeTruthy();
  });
});

describe("lightingEffectNoShadow (Task A — NEXT_PUBLIC_MAP_FX=off emergency switch)", () => {
  it("has the same 1 directional light (fill removed, fix round 1 finding 4) with shadow casting off", () => {
    const directional = directionalLights(lightingEffectNoShadow);
    expect(directional).toHaveLength(1);
    expect(directional.filter((l) => l.shadow === true)).toHaveLength(0);
  });

  it("keeps the same ambient intensity as the shadowed variant", () => {
    expect(ambientLight(lightingEffectNoShadow).intensity).toBe(0.85);
  });
});

describe("REGION_MATERIAL", () => {
  // Fix round 1, finding 4 — ambient 0.35 -> 0.45, same compensation as
  // AMBIENT_INTENSITY above.
  it("matches fix round 1's re-tuned values", () => {
    expect(REGION_MATERIAL).toEqual({
      ambient: 0.45,
      diffuse: 0.7,
      shininess: 14,
      specularColor: [0.1, 0.1, 0.12],
    });
  });
});
