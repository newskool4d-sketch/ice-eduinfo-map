import { DeckRenderer } from "@deck.gl/core";

/**
 * The subset of `DeckRenderer`'s runtime shape that `_resizeRenderBuffers`
 * touches. `renderBuffers` and `_resizeRenderBuffers` are `private` in
 * deck-renderer.d.ts, so this is typed structurally (not via the class).
 */
type CanvasContextLike = { getDrawingBufferSize(): [number, number] };
type FramebufferLike = { resize(size: [number, number]): void };
type RendererLike = {
  device: {
    canvasContext: CanvasContextLike;
    createTexture(props: object): unknown;
    createFramebuffer(props: object): FramebufferLike;
  };
  renderBuffers: FramebufferLike[];
};
type PatchableProto = { _resizeRenderBuffers?: (canvasContext?: CanvasContextLike) => void };

let applied = false;

/**
 * Task 2 fix round 1 (spec §3 "깊이 버퍼 패치") — deck.gl 9.4.0 renders the
 * layers pass into depth-less offscreen buffers whenever any
 * PostProcessEffect is active: `DeckRenderer._resizeRenderBuffers`
 * (deck-renderer.js:101-121) builds the two ping-pong framebuffers with
 * `createFramebuffer({ colorAttachments: [texture] })` only, and luma.gl 9
 * never auto-creates a depth attachment. With no depth buffer the depth
 * test is a no-op, so later-drawn 시군 overpaint earlier, taller ones (전주시's
 * top face vanished under 완주군's fill; its school columns floated on the
 * wrong color). deck's own shadow pass (shadow-pass.js:22-29) shows the
 * intended recipe — `device.createTexture({ format: 'depth16unorm', width,
 * height })` passed as `depthStencilAttachment` — so this replaces the method
 * with the same body plus that attachment on both buffers.
 *
 * No extra resize handling is needed: luma's `Framebuffer.resizeAttachments`
 * (framebuffer.js) clones the depth attachment alongside the color ones, so
 * the per-frame `buffer.resize(size)` keeps both in step. The post-process
 * ScreenPass draws with `depthCompare: 'always'` and `clearDepth: 1`
 * (screen-pass.js), so the added attachment doesn't affect the effect chain.
 *
 * Idempotent (one wrap per page), returns `false` without warning if the
 * installed deck.gl no longer exposes the private method (the patch is then
 * simply inert). Safe to call in jsdom/node — it only touches a prototype.
 */
export function applyDeckDepthPatch(): boolean {
  const proto = DeckRenderer.prototype as unknown as PatchableProto;
  if (applied) return typeof proto._resizeRenderBuffers === "function";
  if (typeof proto._resizeRenderBuffers !== "function") return false;

  proto._resizeRenderBuffers = function patchedResizeRenderBuffers(this: RendererLike, canvasContext?: CanvasContextLike) {
    const ctx = canvasContext ?? this.device.canvasContext;
    const size = ctx.getDrawingBufferSize();
    const [width, height] = size;
    if (this.renderBuffers.length === 0) {
      for (const i of [0, 1]) {
        const color = this.device.createTexture({ sampler: { minFilter: "linear", magFilter: "linear" }, width, height });
        const depth = this.device.createTexture({ format: "depth16unorm", width, height });
        this.renderBuffers.push(
          this.device.createFramebuffer({
            id: `deck-renderbuffer-${i}`,
            colorAttachments: [color],
            depthStencilAttachment: depth,
          }),
        );
      }
    }
    for (const buffer of this.renderBuffers) buffer.resize(size);
  };
  applied = true;
  return true;
}
