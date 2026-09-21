import { beforeAll, describe, expect, it, vi } from "vitest";
import { DeckRenderer } from "@deck.gl/core";

import { applyDeckDepthPatch } from "@/components/map/deckDepthPatch";

// Task 2 fix round 1 — deck.gl 9.4.0 renders the layers pass into
// `DeckRenderer.renderBuffers` (two ping-pong offscreen framebuffers) whenever
// any PostProcessEffect is active, and `_resizeRenderBuffers`
// (deck-renderer.js:101-121) creates those with `colorAttachments` ONLY —
// luma.gl 9 does not auto-create a depth attachment, so depth testing is
// silently off for the whole scene and later-drawn 시군 overpaint earlier,
// taller ones (전주시's top face vanished under 완주군). The patch attaches a
// `depth16unorm` texture (the same format deck's own ShadowPass uses,
// shadow-pass.js:22-29) to both buffers.

type Proto = { _resizeRenderBuffers?: (ctx?: unknown) => void };
const proto = DeckRenderer.prototype as unknown as Proto;

/** A fake `this` mirroring the fields the patched method touches (device + renderBuffers). */
function fakeRenderer(size: [number, number] = [800, 600]) {
  const createTexture = vi.fn((props: object) => ({ kind: "texture", ...props }));
  const createFramebuffer = vi.fn((props: object) => ({ kind: "framebuffer", ...props, resize: vi.fn() }));
  return {
    device: {
      createTexture,
      createFramebuffer,
      canvasContext: { getDrawingBufferSize: () => size },
    },
    renderBuffers: [] as { resize: ReturnType<typeof vi.fn> }[],
  };
}

describe("applyDeckDepthPatch", () => {
  let original: Proto["_resizeRenderBuffers"];
  let patched: Proto["_resizeRenderBuffers"];

  beforeAll(() => {
    original = proto._resizeRenderBuffers;
    expect(typeof original).toBe("function"); // the installed 9.4.0 still has the private method we wrap
    expect(applyDeckDepthPatch()).toBe(true);
    patched = proto._resizeRenderBuffers;
  });

  it("(a) replaces DeckRenderer.prototype._resizeRenderBuffers", () => {
    expect(typeof patched).toBe("function");
    expect(patched).not.toBe(original);
  });

  it("(b) first call creates 2 framebuffers, each with a depth16unorm depthStencilAttachment sized to the drawing buffer", () => {
    const self = fakeRenderer([800, 600]);
    patched!.call(self);

    expect(self.device.createFramebuffer).toHaveBeenCalledTimes(2);
    for (const [props] of self.device.createFramebuffer.mock.calls as [Record<string, unknown>][]) {
      expect(props).toHaveProperty("depthStencilAttachment");
      expect(props.depthStencilAttachment).toMatchObject({ format: "depth16unorm", width: 800, height: 600 });
      expect(Array.isArray(props.colorAttachments)).toBe(true);
      expect((props.colorAttachments as unknown[]).length).toBe(1);
    }
    expect(self.device.createFramebuffer.mock.calls[0][0]).toMatchObject({ id: "deck-renderbuffer-0" });
    expect(self.device.createFramebuffer.mock.calls[1][0]).toMatchObject({ id: "deck-renderbuffer-1" });

    // 4 textures in total: 2 color (deck's original) + 2 depth (the patch).
    const textureCalls = self.device.createTexture.mock.calls as [Record<string, unknown>][];
    expect(textureCalls).toHaveLength(4);
    const depthCalls = textureCalls.filter(([p]) => p.format === "depth16unorm");
    expect(depthCalls).toHaveLength(2);
    for (const [p] of depthCalls) expect(p).toEqual({ format: "depth16unorm", width: 800, height: 600 });
    const colorCalls = textureCalls.filter(([p]) => p.format !== "depth16unorm");
    expect(colorCalls).toHaveLength(2);
    for (const [p] of colorCalls) {
      expect(p).toEqual({ sampler: { minFilter: "linear", magFilter: "linear" }, width: 800, height: 600 });
    }

    // Both buffers are pushed and resized once (deck's original behavior).
    expect(self.renderBuffers).toHaveLength(2);
    for (const b of self.renderBuffers) expect(b.resize).toHaveBeenCalledWith([800, 600]);
  });

  it("(c) a second call only resizes the existing buffers — no new framebuffers or textures", () => {
    const self = fakeRenderer([800, 600]);
    patched!.call(self);
    self.device.createFramebuffer.mockClear();
    self.device.createTexture.mockClear();
    for (const b of self.renderBuffers) b.resize.mockClear();

    self.device.canvasContext.getDrawingBufferSize = () => [1024, 768];
    patched!.call(self);

    expect(self.device.createFramebuffer).not.toHaveBeenCalled();
    expect(self.device.createTexture).not.toHaveBeenCalled();
    expect(self.renderBuffers).toHaveLength(2);
    for (const b of self.renderBuffers) {
      expect(b.resize).toHaveBeenCalledTimes(1);
      expect(b.resize).toHaveBeenCalledWith([1024, 768]);
    }
  });

  it("uses an explicitly passed canvasContext over this.device.canvasContext", () => {
    const self = fakeRenderer([800, 600]);
    patched!.call(self, { getDrawingBufferSize: () => [320, 240] });
    expect(self.device.createTexture.mock.calls[0][0]).toMatchObject({ width: 320, height: 240 });
    for (const b of self.renderBuffers) expect(b.resize).toHaveBeenCalledWith([320, 240]);
  });

  it("(d) applying twice wraps only once (idempotent; returns true both times)", () => {
    expect(applyDeckDepthPatch()).toBe(true);
    expect(proto._resizeRenderBuffers).toBe(patched);
  });
});
