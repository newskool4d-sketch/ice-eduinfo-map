import { DeckRenderer } from "@deck.gl/core";

/**
 * The subset of `DeckRenderer`'s runtime shape that `_resizeRenderBuffers`
 * touches. `renderBuffers` and `_resizeRenderBuffers` are `private` in
 * deck-renderer.d.ts, so this is typed structurally (not via the class).
 */
type CanvasContextLike = { getDrawingBufferSize(): [number, number] };
/** luma `Texture` — only what the release path needs. */
type TextureLike = { destroy?: () => void };
/**
 * luma `Framebuffer` (framebuffer.d.ts): `depthStencilAttachment` is a
 * `TextureView` whose `.texture` is the backing `Texture`; `_attachedResources`
 * is `Resource`'s private auto-destroy `Set`. Both are optional here so a
 * future luma shape change degrades to "no release" instead of a throw.
 */
type FramebufferLike = {
  resize(size: [number, number]): void;
  depthStencilAttachment?: { texture?: TextureLike } | null;
  _attachedResources?: Set<unknown>;
};
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

/** Canvas-equivalent depth precision — see the comment at the createTexture call. */
export const DEPTH_FORMAT = "depth24plus";

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
 * intended recipe — `device.createTexture({ format: 'depth24plus', width,
 * height })` passed as `depthStencilAttachment` — so this replaces the method
 * with the same body plus that attachment on both buffers.
 *
 *  * Resizing: luma's `Framebuffer.resizeAttachments` clones the depth attachment on every
 * size change but leaks the replaced texture (view-vs-texture mismatch, framebuffer.js:122-130);
 * `releaseReplacedDepthTexture` below detaches and destroys it.
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
        // Only renderBuffers[0] ever receives the layers pass (deck-renderer.js
        // `outputBuffer`); [1] is a ping-pong target for screen-space passes
        // that run with depthCompare 'always', so it needs no depth.
        // `depth24plus` (WebGL2 DEPTH_COMPONENT24) matches the canvas' own
        // precision: deck's per-layer polygonOffset (`getPolygonOffset`
        // default `-layerIndex * 100` units) is expressed in depth-buffer
        // resolution units, so a 16-bit buffer would amplify every layer's
        // offset ~256× and let later layers (rings, emd lines, columns)
        // bleed through nearer geometry.
        const depth = i === 0 ? this.device.createTexture({ format: DEPTH_FORMAT, width, height }) : undefined;
        this.renderBuffers.push(
          this.device.createFramebuffer({
            id: `deck-renderbuffer-${i}`,
            width,
            height,
            colorAttachments: [color],
            ...(depth ? { depthStencilAttachment: depth } : {}),
          }),
        );
      }
    }
    for (const buffer of this.renderBuffers) {
      const prev = buffer.depthStencilAttachment?.texture;
      buffer.resize(size);
      releaseReplacedDepthTexture(buffer, prev);
    }
  };
  applied = true;
  return true;
}

/**
 * Fix round 2 — luma.gl 9.4.2 leaks the depth texture on every size change.
 * `Framebuffer.resizeAttachments` (@luma.gl/core framebuffer.js:122-130)
 * does, for the depth attachment:
 *
 *     const resizedTexture = this.depthStencilAttachment.texture.clone(size);
 *     this.destroyAttachedResource(this.depthStencilAttachment); // the old TextureVIEW
 *     this.depthStencilAttachment = resizedTexture.view;
 *     this.attachResource(resizedTexture);                       // the new TEXTURE
 *
 * `destroyAttachedResource` is `if (this._attachedResources.delete(r)) r.destroy()`
 * (resource.js:155-158) — it is handed the view, but what was registered on
 * the previous resize is the texture, so the delete never matches, nothing is
 * destroyed, and each distinct drawing-buffer size leaves one more full-size
 * depth24plus texture (≈2.9 MB at 1600×900) strongly held in the set until
 * `DeckRenderer.finalize()`. (Our very first texture is never registered at
 * all — `autoCreateAttachmentTextures` only attaches string-created ones —
 * so it only leaks its GL handle, not a JS reference.) The color branch
 * (:112-120) attaches the VIEW both times and is symmetric, so it is left
 * alone. Passing the string 'depth24plus' instead of a texture accumulates
 * identically (verified by the reviewer), hence this explicit release: once
 * `resize` has swapped the attachment, drop the replaced texture from the
 * ownership set (so `finalize()` doesn't double-destroy) and destroy it.
 * Same-size `resize` calls are a no-op in luma, so the attachment object is
 * unchanged and nothing is released.
 */
function releaseReplacedDepthTexture(buffer: FramebufferLike, prev: TextureLike | undefined): void {
  if (!prev) return;
  if (buffer.depthStencilAttachment?.texture === prev) return; // size unchanged — still attached
  const owned = buffer._attachedResources;
  if (owned instanceof Set && owned.has(prev)) owned.delete(prev);
  if (typeof prev.destroy === "function") prev.destroy();
}
