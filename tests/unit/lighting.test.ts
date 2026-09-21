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
  it("has exactly one shadow-casting DirectionalLight (the key light) among 2 directional lights", () => {
    const directional = directionalLights(lightingEffect);
    expect(directional).toHaveLength(2); // key + fill
    expect(directional.filter((l) => l.shadow === true)).toHaveLength(1);
  });

  it("the shadow-casting key light points in the normalized [0.6,-1,-3] direction", () => {
    const [key] = directionalLights(lightingEffect).filter((l) => l.shadow === true);
    const expected = new Vector3([0.6, -1, -3]).normalize().toArray();
    expect(key.direction[0]).toBeCloseTo(expected[0], 10);
    expect(key.direction[1]).toBeCloseTo(expected[1], 10);
    expect(key.direction[2]).toBeCloseTo(expected[2], 10);
  });

  it("ambient light intensity is 0.7 (down from the pre-Task-A 0.8)", () => {
    expect(ambientLight(lightingEffect).intensity).toBe(0.7);
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

// Task A — CRITICAL picking regression, found empirically (not documented by
// deck.gl): `@deck.gl/core`'s picking pass does
// `effects: effects?.filter(e => e.useInPicking)` (pick-layers-pass.js), and
// `LightingEffect` never sets `useInPicking` itself. With `_shadow: true`,
// the shadow module's vertex-shader injection (`shadow_setVertexPosition`,
// which can overwrite `gl_Position`) still applies during picking (it's a
// DECK-WIDE default shader module once shadow is on), but WITHOUT
// `useInPicking: true`, LightingEffect's own (safe) `getShaderModuleProps`
// never runs for that pass — leaving the shader's `shadow` uniform block
// uninitialized and silently corrupting picking-pass geometry. Verified
// directly: with this unset, `deck.pickObject()` returned null for EVERY
// layer at EVERY canvas pixel (a 1240x733 grid scan went from 86 hits on
// the pre-Task-A baseline to 0) — every region click on the map silently
// failed. See lighting.ts's own doc comment for the full mechanism.
describe("useInPicking (Task A — picking-pass regression fix)", () => {
  it("is true on both lightingEffect and lightingEffectNoShadow", () => {
    expect((lightingEffect as Effect).useInPicking).toBe(true);
    expect((lightingEffectNoShadow as Effect).useInPicking).toBe(true);
  });
});

describe("lightingEffectNoShadow (Task A — NEXT_PUBLIC_MAP_FX=off emergency switch)", () => {
  it("has the same 2 directional lights but zero shadow casters", () => {
    const directional = directionalLights(lightingEffectNoShadow);
    expect(directional).toHaveLength(2);
    expect(directional.filter((l) => l.shadow === true)).toHaveLength(0);
  });

  it("keeps the same ambient intensity as the shadowed variant", () => {
    expect(ambientLight(lightingEffectNoShadow).intensity).toBe(0.7);
  });
});

describe("REGION_MATERIAL", () => {
  it("matches Task A's re-tuned values", () => {
    expect(REGION_MATERIAL).toEqual({
      ambient: 0.35,
      diffuse: 0.7,
      shininess: 14,
      specularColor: [0.1, 0.1, 0.12],
    });
  });
});
