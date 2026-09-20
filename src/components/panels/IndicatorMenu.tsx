"use client";

import { useEffect, useRef, useState } from "react";

import { indicatorById } from "@/lib/indicators/registry";
import type { SeriesFile } from "@/lib/indicators/types";
import { displayLabel } from "@/lib/stats";
import { useMapQuery } from "@/lib/state/urlState";

import IndicatorPicker from "./IndicatorPicker";

export interface IndicatorMenuProps {
  /**
   * bundle.series, used only to compute students_change_5y's dynamic
   * "{minYear}→{maxYear}" label span via displayLabel() — matching what
   * Legend shows for the same indicator (see Dashboard.tsx's legendDef).
   * Optional and defaults to {} (displayLabel() falls back to the static
   * registry label when a series is unavailable), so this component stays
   * mountable/testable without a loaded data bundle, per the task brief's
   * test setup (only a nuqs testing adapter wrapper, no DataProvider).
   */
  series?: Record<string, SeriesFile>;
}

/**
 * Top-bar "조건별 맵" button + popover. Self-contained: reads/writes the
 * `indicator` URL param itself via useMapQuery(), so callers (TopBar) don't
 * need to prop-drill indicatorId/setIndicator through it.
 */
export default function IndicatorMenu({ series = {} }: IndicatorMenuProps) {
  const { indicatorId, setIndicator } = useMapQuery();
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Bridges an arrow-key move's synthetic click (see handlePopoverKeyDown /
  // handlePopoverClick below) so it isn't mistaken for a commit gesture.
  // Declared here (not next to the handlers that use it) so the lifecycle
  // effect below can reset it in its close/cleanup path: a stray keydown
  // can arm this flag without its paired click ever arriving before the
  // popover closes by some other route (Escape, outside click) — resetting
  // on every close is a safety net so that stale `true` can never survive
  // into the next open and swallow an unrelated later real click.
  const suppressNextClickRef = useRef(false);

  const def = indicatorById(indicatorId);
  const label = def ? displayLabel(def, series) : indicatorId;

  // Single effect, gated on `open`: the effect body runs the "just opened"
  // work (focus the first radio, attach ESC/outside-click listeners); its
  // cleanup — which React runs exactly when `open` flips back to false, or
  // on unmount — tears the listeners down and returns focus to the button.
  // Listeners are registered with `capture: true` so the deck.gl canvas's
  // own event manager (mjolnir.js), which can stop propagation on pointer
  // events, never prevents an outside click from reaching this handler.
  useEffect(() => {
    if (!open) return;

    // Captured once, up front — read fresh at cleanup time (weeks/renders
    // later, in general) a ref's `.current` might no longer point at the
    // node it did when the effect ran; snapshotting here keeps the
    // outside-click check and the close-time focus-restore pinned to the
    // exact button/popover this effect instance opened for.
    const popover = popoverRef.current;
    const button = buttonRef.current;

    const firstRadio = popover?.querySelector<HTMLInputElement>('input[type="radio"]');
    firstRadio?.focus();

    function onKeyDown(event: KeyboardEvent) {
      // Fix round 1 (review finding #1): preventDefault() so DeckMap's
      // document-level Escape-to-deselect listener (registered in the
      // BUBBLE phase specifically so it always runs after THIS capture-phase
      // listener, regardless of which effect happened to attach first — see
      // DeckMap.tsx's own comment) can tell "the menu already handled this
      // Escape" apart from "nothing did," and skip deselecting the region.
      // A single Escape with the menu open must close only the menu.
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
      }
    }
    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (popover?.contains(target) || button?.contains(target)) return;
      setOpen(false);
    }

    document.addEventListener("keydown", onKeyDown, { capture: true });
    document.addEventListener("mousedown", onPointerDown, { capture: true });
    return () => {
      document.removeEventListener("keydown", onKeyDown, { capture: true });
      document.removeEventListener("mousedown", onPointerDown, { capture: true });
      suppressNextClickRef.current = false;
      button?.focus();
    };
  }, [open]);

  // Applies live as the user arrows through the radios — closing is handled
  // separately, only on an explicit "commit" gesture (see below), per the
  // fix-round-1 ruling: arrowing must preview, not close.
  function handleChange(id: string) {
    setIndicator(id);
  }

  function isRadioInput(target: EventTarget | null): target is HTMLInputElement {
    return target instanceof HTMLInputElement && target.type === "radio";
  }

  // Native same-`name` radio-group arrow-key navigation moves focus to the
  // next/previous radio AND fires a `click` on it as part of activating the
  // new selection (confirmed empirically against this repo's installed
  // @testing-library/user-event, which mirrors real browser activation
  // behavior here — NOT the `change`-without-`click` behavior a first read
  // of the spec might suggest). That means a plain "close on any click
  // hitting a radio" handler cannot tell an arrow-key move apart from an
  // explicit click: both are `click` events on the target radio. The
  // suppressNextClickRef declared above bridges the two: the keydown
  // handler below sets it for exactly the one click an arrow key is about
  // to synthesize, and the click handler consumes it (clears it, does not
  // close) instead of treating it as a commit gesture.

  // A real mouse click on a radio (or on its wrapping <label> — the browser
  // re-dispatches a second click with target = the input via native
  // label-activation) closes the popover, unless it's the synthetic click
  // that just followed an arrow key (suppressed above).
  function handlePopoverClick(event: React.MouseEvent<HTMLDivElement>) {
    if (!isRadioInput(event.target)) return;
    if (suppressNextClickRef.current) {
      suppressNextClickRef.current = false;
      return;
    }
    setOpen(false);
  }

  function handlePopoverKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (isRadioInput(event.target) && event.key.startsWith("Arrow")) {
      suppressNextClickRef.current = true;
    }
  }

  // Enter/Space close on keyUP, not keydown — found empirically while
  // writing this fix (see IndicatorMenu.test.tsx): closing moves focus back
  // to the button (the lifecycle effect's cleanup below), and if that
  // happens on keydown, the SAME physical key press's still-pending keyup
  // can land on the now-focused <button> instead of the radio — native
  // buttons treat both Enter and Space as activation keys too, so that
  // stray keyup silently re-opens the menu (confirmed via a temporary
  // console.log trace: open flips false→true within the same interaction).
  // Closing on keyup instead lets the radio's own full keydown+keyup pair
  // finish targeting the radio before focus ever moves. Enter never
  // dispatches a click on a bare radio (no <form> ancestor here for it to
  // submit), so it needs this explicit handler regardless; Space also
  // dispatches a native click, but relying on keyup here rather than that
  // click keeps both keys on the same safe, race-free path.
  function handlePopoverKeyUp(event: React.KeyboardEvent<HTMLDivElement>) {
    if (isRadioInput(event.target) && (event.key === "Enter" || event.key === " ")) {
      setOpen(false);
    }
  }

  return (
    <div className="relative shrink-0">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls="indicator-menu-popover"
        onClick={() => setOpen((v) => !v)}
        className="flex shrink-0 items-center gap-1 whitespace-nowrap rounded px-2 py-1.5 text-sm text-[#e6e9f0] hover:bg-white/10"
      >
        {`조건별 맵 · ${label} ▾`}
      </button>

      {open && (
        <div
          ref={popoverRef}
          id="indicator-menu-popover"
          role="dialog"
          aria-label="조건별 맵 선택"
          onClick={handlePopoverClick}
          onKeyDown={handlePopoverKeyDown}
          onKeyUp={handlePopoverKeyUp}
          className="absolute left-0 top-full z-50 mt-2 max-h-[70vh] w-[640px] overflow-y-auto rounded-lg border border-white/10 bg-[#121826] p-3 shadow-xl"
        >
          <IndicatorPicker value={indicatorId} onChange={handleChange} />
        </div>
      )}
    </div>
  );
}
