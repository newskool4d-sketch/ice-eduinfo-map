"use client";

/** A press/unpress chip (`aria-pressed`). `kind` is optional so the original item shape (Task A/C/E callers and tests) keeps working unchanged. */
export interface MapOverlayToggleItem {
  kind?: "toggle";
  id: string;
  label: string;
  pressed: boolean;
  onToggle: () => void;
  /** Native `title` attribute — used as a plain tooltip. */
  title?: string;
}

/**
 * Task 3 (bright diorama) — a segmented control: one `role="radiogroup"`
 * named by `label`, one `role="radio"` per option, exactly one checked
 * (`value`). Used for the 3-way "배경 지도" (끄기 / 위성 / 일반) selector.
 */
export interface MapOverlaySegmentedItem<V extends string = string> {
  kind: "segmented";
  id: string;
  /** The radiogroup's accessible name (e.g. "배경 지도") — not rendered as visible text. */
  label: string;
  value: V;
  options: { value: V; label: string }[];
  /**
   * Method-style on purpose (not `onChange: (value: V) => void`): under
   * `strictFunctionTypes` a property-typed callback is checked
   * contravariantly, so DeckMap's `(mode: BasemapMode) => void` couldn't be
   * assigned once the item sits in a `MapOverlayItem[]` (V widens to
   * `string`). Method parameters are bivariant, which is the intended
   * escape hatch here — the values passed back always come from `options`.
   */
  onChange(value: V): void;
  /** Native `title` attribute on the group — used as a plain tooltip. */
  title?: string;
}

export type MapOverlayItem = MapOverlayToggleItem | MapOverlaySegmentedItem;

export interface MapOverlayProps {
  /**
   * One control per item, rendered left-to-right in the given order.
   * Deliberately an array of generic items (not fixed named props for "발표
   * 모드" specifically) — Task A only ever passed one item, Task C appended
   * a "배경 지도" button and source-attribution text, Task E a "읍면동 경계"
   * button, and Task 3 (bright diorama) turned the basemap entry into a
   * segmented radiogroup, all without changing this shape.
   */
  items: MapOverlayItem[];
  /**
   * Task C — an optional small caption rendered below the button row (the
   * VWorld basemap tile source attribution, shown only while the basemap is
   * on). Purely presentational: this component doesn't know or care what
   * the text is for, or which `items` entry (if any) it's paired with —
   * DeckMap owns that pairing.
   */
  attribution?: string;
}

/**
 * Task A — a small toggle-button cluster pinned to the map's top-right
 * corner. Rendered by DeckMap just after `<DeckGL>` (see DeckMap.tsx), so it
 * sits visually on top of the canvas; `pointer-events-none` on the
 * wrapper (with `pointer-events-auto` on each button/group) keeps the gaps
 * between controls from swallowing deck.gl's own drag/click gestures.
 *
 * Purely controlled — no state of its own. The caller (DeckMap) owns
 * `pressed`/`onToggle` per toggle item and `value`/`onChange` per segmented
 * item (e.g. its local, session-only `presentation` `useState`, or the
 * persisted basemap mode). DeckMap itself is only ever mounted client-side
 * (`ssr:false` — see MapShell.tsx) and this is only ever rendered as ITS
 * child, so in fallback mode (DeckMap not rendered at all) this is
 * automatically absent too — no separate fallback-mode check needed here.
 */
export default function MapOverlay({ items, attribution }: MapOverlayProps) {
  if (items.length === 0 && !attribution) return null;

  return (
    <div className="pointer-events-none absolute right-3 top-3 z-10 flex flex-col items-end gap-1.5">
      {items.length > 0 && (
        <div className="flex gap-1.5">
          {items.map((item) =>
            item.kind === "segmented" ? (
              // Same surface language as the chips (line border, translucent
              // surface, shadow); the checked segment reuses the pressed-chip
              // fill so "selected" reads the same across both control kinds.
              // Each radio is a real <button> (Enter/Space activate it) and a
              // Tab stop — no roving tabindex, matching the spec's markup.
              <div
                key={item.id}
                role="radiogroup"
                aria-label={item.label}
                title={item.title}
                className="pointer-events-auto flex overflow-hidden rounded border border-line bg-surface/85 shadow-sm backdrop-blur-sm"
              >
                {item.options.map((opt) => {
                  const checked = opt.value === item.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      role="radio"
                      aria-checked={checked}
                      onClick={() => item.onChange(opt.value)}
                      className={`px-2.5 py-1 text-xs transition-colors ${
                        checked ? "bg-accent-soft font-semibold text-ink" : "text-ink-muted hover:bg-surface"
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            ) : (
              <button
                key={item.id}
                type="button"
                aria-pressed={item.pressed}
                title={item.title}
                onClick={item.onToggle}
                className={`pointer-events-auto rounded px-2.5 py-1 text-xs backdrop-blur-sm transition-colors ${
                  item.pressed
                    ? "border border-accent/40 bg-accent-soft font-semibold text-ink shadow-sm"
                    : "border border-line bg-surface/85 text-ink-muted shadow-sm hover:bg-surface"
                }`}
              >
                {item.label}
              </button>
            ),
          )}
        </div>
      )}
      {attribution && (
        <div
          data-testid="basemap-attribution"
          className="rounded border border-line bg-surface/85 px-2 py-0.5 text-[10px] text-ink-muted shadow-sm backdrop-blur-sm"
        >
          {attribution}
        </div>
      )}
    </div>
  );
}
