import { beforeAll, describe, expect, it, vi } from "vitest";
import { DeckRenderer, VERSION } from "@deck.gl/core";

import { applyDeckDepthPatch, DEPTH_FORMAT } from "@/components/map/deckDepthPatch";

// Task 2 fix round 1 — deck.gl 9.4.0 renders the layers pass into
// `DeckRenderer.renderBuffers` (two ping-pong offscreen framebuffers) whenever
// any PostProcessEffect is active, and `_resizeRenderBuffers`
// (deck-renderer.js:101-121) creates those with `colorAttachments` ONLY —
// luma.gl 9 does not auto-create a depth attachment, so depth testing is
// silently off for the whole scene and later-drawn 시군 overpaint earlier,
// taller ones (전주시's top face vanished under 완주군). The patch attaches a
// `depth24plus` texture (the same format deck's own ShadowPass uses,
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

  it("(b) first call creates 2 framebuffers; only renderBuffers[0] gets a depth24plus depthStencilAttachment sized to the drawing buffer", () => {
    const self = fakeRenderer([800, 600]);
    patched!.call(self);

    expect(self.device.createFramebuffer).toHaveBeenCalledTimes(2);
    const fbCalls = self.device.createFramebuffer.mock.calls as [Record<string, unknown>][];
    expect(fbCalls[0][0]).toMatchObject({ width: 800, height: 600 });
    expect(fbCalls[1][0]).not.toHaveProperty("depthStencilAttachment");
    for (const [props] of fbCalls.slice(0, 1)) {
      expect(props).toHaveProperty("depthStencilAttachment");
      expect(props.depthStencilAttachment).toMatchObject({ format: "depth24plus", width: 800, height: 600 });
      expect(Array.isArray(props.colorAttachments)).toBe(true);
      expect((props.colorAttachments as unknown[]).length).toBe(1);
    }
    expect(self.device.createFramebuffer.mock.calls[0][0]).toMatchObject({ id: "deck-renderbuffer-0" });
    expect(self.device.createFramebuffer.mock.calls[1][0]).toMatchObject({ id: "deck-renderbuffer-1" });

    // 3 textures in total: 2 color (deck's original) + 1 depth (the patch, buffer 0 only).
    const textureCalls = self.device.createTexture.mock.calls as [Record<string, unknown>][];
    expect(textureCalls).toHaveLength(3);
    const depthCalls = textureCalls.filter(([p]) => p.format === "depth24plus");
    expect(depthCalls).toHaveLength(1);
    for (const [p] of depthCalls) expect(p).toEqual({ format: "depth24plus", width: 800, height: 600 });
    const colorCalls = textureCalls.filter(([p]) => p.format !== "depth24plus");
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

  // Fix round 2 — luma.gl 9.4.2 `Framebuffer.resizeAttachments`
  // (framebuffer.js:122-130) clones the depth texture, then calls
  // `destroyAttachedResource(this.depthStencilAttachment)` with the old
  // TextureVIEW but `attachResource(resizedTexture)` with the new TEXTURE,
  // so the `Set.delete(view)` never matches: every distinct drawing-buffer
  // size left one more full-size depth24plus texture strongly held in the
  // framebuffer's `_attachedResources` (≈2.9 MB each at 1600×900) until
  // `DeckRenderer.finalize()`. The patch releases the replaced texture
  // itself. This fake mirrors luma's shape: `depthStencilAttachment` is a
  // view-like `{ texture }`, and a size change swaps it for a new one and
  // adds the new TEXTURE to `_attachedResources` (exactly what luma does).
  describe("replaced depth textures are released on resize (fix round 2)", () => {
    type FakeTexture = { destroy: ReturnType<typeof vi.fn> };
    function lumaLikeFramebuffer(width: number, height: number) {
      const first: FakeTexture = { destroy: vi.fn() };
      const fb = {
        width,
        height,
        depthStencilAttachment: { texture: first } as { texture: FakeTexture },
        _attachedResources: new Set<unknown>(),
        resize(size: [number, number]) {
          if (size[0] === fb.width && size[1] === fb.height) return; // luma: no-op when the size is unchanged
          fb.width = size[0];
          fb.height = size[1];
          const next: FakeTexture = { destroy: vi.fn() };
          fb.depthStencilAttachment = { texture: next };
          fb._attachedResources.add(next);
        },
      };
      return fb;
    }
    function rendererWith(fb: ReturnType<typeof lumaLikeFramebuffer>, size: [number, number]) {
      return {
        device: { createTexture: vi.fn(), createFramebuffer: vi.fn(), canvasContext: { getDrawingBufferSize: () => size } },
        renderBuffers: [fb],
      };
    }

    it("destroys the previous depth texture exactly once per size change and drops it from _attachedResources", () => {
      const fb = lumaLikeFramebuffer(800, 600);
      const t0 = fb.depthStencilAttachment.texture;

      patched!.call(rendererWith(fb, [1024, 768]));
      const t1 = fb.depthStencilAttachment.texture;
      expect(t1).not.toBe(t0);
      expect(t0.destroy).toHaveBeenCalledTimes(1);
      expect(t1.destroy).not.toHaveBeenCalled();
      expect(fb._attachedResources.has(t0)).toBe(false);
      expect(fb._attachedResources.has(t1)).toBe(true); // the live one stays owned by the framebuffer

      patched!.call(rendererWith(fb, [1280, 720]));
      const t2 = fb.depthStencilAttachment.texture;
      expect(t0.destroy).toHaveBeenCalledTimes(1); // never re-destroyed
      expect(t1.destroy).toHaveBeenCalledTimes(1);
      expect(t2.destroy).not.toHaveBeenCalled();
      expect(fb._attachedResources.has(t1)).toBe(false);
      expect(Array.from(fb._attachedResources)).toEqual([t2]); // no accumulation across sizes
    });

    it("destroys nothing when the size is unchanged (same attachment object after resize)", () => {
      const fb = lumaLikeFramebuffer(800, 600);
      const t0 = fb.depthStencilAttachment.texture;
      patched!.call(rendererWith(fb, [800, 600]));
      patched!.call(rendererWith(fb, [800, 600]));
      expect(fb.depthStencilAttachment.texture).toBe(t0);
      expect(t0.destroy).not.toHaveBeenCalled();
    });

    it("tolerates a framebuffer without a depth attachment or resource set (no throw)", () => {
      const fb = { width: 1, height: 1, resize: vi.fn() } as unknown as ReturnType<typeof lumaLikeFramebuffer>;
      expect(() => patched!.call(rendererWith(fb, [640, 480]))).not.toThrow();
      expect(fb.resize).toHaveBeenCalledWith([640, 480]);
    });
  });
});

// Loud guard for a deck.gl bump: the patch reproduces deck-renderer.js's
// private `_resizeRenderBuffers` body for exactly this version. When deck.gl
// changes (or ships its own depth attachment), re-verify against
// node_modules/@deck.gl/core/dist/lib/deck-renderer.js and update both.
describe("deck.gl version guard", () => {
  it("is the version the patch was written against (9.4.0) and uses the canvas-equivalent depth format", () => {
    expect(VERSION).toBe("9.4.0");
    expect(DEPTH_FORMAT).toBe("depth24plus");
  });
});
