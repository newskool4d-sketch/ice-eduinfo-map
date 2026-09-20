"use client";

/**
 * Reactive `prefers-reduced-motion: reduce` (Task 6, Section A.4). Used by
 * DeckMap to zero out camera `transitionDuration` (useCamera) and every
 * layer's own `transitions` (regionLayers/labelLayer/schoolLayers'
 * `transitionDuration` option) when the OS setting is on.
 */
import { useEffect, useState } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

/** SSR/older-browser-safe: false when there's no `window`/`matchMedia` at all (DeckMap itself is loaded `ssr:false`, so in practice this only matters for a browser lacking `matchMedia`). */
function getInitialMatch(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia(QUERY).matches;
}

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(getInitialMatch);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mql = window.matchMedia(QUERY);

    function onChange(event: MediaQueryListEvent) {
      setReduced(event.matches);
    }
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return reduced;
}
