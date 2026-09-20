import { AmbientLight, DirectionalLight, LightingEffect } from "@deck.gl/core";
import type { Material } from "@deck.gl/core";

// Created once at module scope (not per-render): deck.gl effects/materials are
// plain config objects, and re-creating them on every DeckMap render would
// needlessly invalidate the layers that reference them.
export const lightingEffect = new LightingEffect({
  ambient: new AmbientLight({ color: [255, 255, 255], intensity: 0.8 }),
  key: new DirectionalLight({ color: [255, 255, 255], intensity: 1.0, direction: [1, -1.5, -3] }),
  fill: new DirectionalLight({ color: [200, 215, 255], intensity: 0.4, direction: [-1, 1, -0.5] }),
});

export const REGION_MATERIAL: Material = {
  ambient: 0.45,
  diffuse: 0.6,
  shininess: 24,
  specularColor: [0.15, 0.15, 0.15],
};
