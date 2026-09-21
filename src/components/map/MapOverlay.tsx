"use client";

export interface MapOverlayItem {
  id: string;
  label: string;
  pressed: boolean;
  onToggle: () => void;
  /** Native `title` attribute — used as a plain tooltip. */
  title?: string;
}

export interface MapOverlayProps {
  /**
   * One toggle button per item, rendered left-to-right in the given order.
   * Deliberately an array of generic `{id, label, pressed, onToggle, title}`
   * items (not fixed named props for "발표 모드" specifically) — Task A only
   * ever passes one item, but a later task (C) appends a "배경 지도" button
   * and source-attribution text to this same component without needing to
   * change this shape.
   */
  items: MapOverlayItem[];
}

/**
 * Task A — a small toggle-button cluster pinned to the map's top-right
 * corner. Rendered by DeckMap just after `<DeckGL>` (see DeckMap.tsx), so it
 * sits visually on top of the canvas; `pointer-events-none` on the
 * wrapper (with `pointer-events-auto` on each button) keeps the gaps
 * between buttons from swallowing deck.gl's own drag/click gestures.
 *
 * Purely controlled — no state of its own. The caller (DeckMap) owns
 * `pressed`/`onToggle` per item (e.g. its local, session-only `presentation`
 * `useState`). DeckMap itself is only ever mounted client-side (`ssr:false`
 * — see MapShell.tsx) and this is only ever rendered as ITS child, so in
 * fallback mode (DeckMap not rendered at all) this is automatically absent
 * too — no separate fallback-mode check needed here.
 */
export default function MapOverlay({ items }: MapOverlayProps) {
  if (items.length === 0) return null;

  return (
    <div className="pointer-events-none absolute right-3 top-3 z-10 flex gap-1.5">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          aria-pressed={item.pressed}
          title={item.title}
          onClick={item.onToggle}
          className={`pointer-events-auto rounded px-2.5 py-1 text-xs backdrop-blur-sm transition-colors ${
            item.pressed
              ? "bg-white/20 font-semibold text-[#e6e9f0]"
              : "bg-black/30 text-[#e6e9f0]/70 hover:bg-white/10"
          }`}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
