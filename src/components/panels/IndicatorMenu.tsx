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
      if (event.key === "Escape") setOpen(false);
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
      button?.focus();
    };
  }, [open]);

  function handleSelect(id: string) {
    setIndicator(id);
    setOpen(false);
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
          className="absolute left-0 top-full z-50 mt-2 max-h-[70vh] w-[640px] overflow-y-auto rounded-lg border border-white/10 bg-[#121826] p-3 shadow-xl"
        >
          <IndicatorPicker value={indicatorId} onChange={handleSelect} />
        </div>
      )}
    </div>
  );
}
