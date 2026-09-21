"use client";

/**
 * Task E — 읍면동 경계: fetches `/data/emd/<code>.geojson` (built by
 * scripts/pipeline/build-emd.ts) for the currently-selected 시군, so DeckMap
 * can draw its sub-시군 boundary lines. Split out of DeckMap.tsx as its own
 * file (same reasoning as useCamera/useFontGate/useRegionKeyboardNav — see
 * DeckMap.tsx's own "현재 코드 상태" comment: new hooks live outside the
 * ~700-line file, which only gets minimal wiring).
 */
import { useEffect, useState } from "react";
import type { FeatureCollection } from "geojson";

import { isRegionCode } from "@/lib/geo/regions";

// Module-scope cache, same idiom as basemapPref.ts's localStorage read (one
// source of truth outside React state) — keyed by 시군 code, never evicted
// (public/data/emd/*.geojson only ever changes via a fresh deploy, which
// reloads the page anyway). Re-selecting an already-fetched 시군 is a pure
// cache hit: no second network request.
const cache = new Map<string, FeatureCollection>();

function cachedOrNull(activeCode: string | null): FeatureCollection | null {
  return activeCode ? (cache.get(activeCode) ?? null) : null;
}

/**
 * Returns the currently-selected 시군's 읍면동 boundaries, or `null` while
 * disabled / not yet loaded / failed.
 *
 * Only ever fetches for a KNOWN `REGION_CODE` (the `isRegionCode` guard) —
 * every other `code` (including `null`) short-circuits straight to "no
 * fetch, null" without touching the network at all. This isn't just an
 * optimization: `public/data/emd/<code>.geojson` only exists for the 14
 * REGION_CODES (see build-emd.ts), and a fetch() for a URL that can never
 * resolve logs an UNSUPPRESSABLE "Failed to load resource" console entry —
 * a browser-level log for the failed resource load itself, not something
 * app code produces via `console.error()`, so no try/catch here can catch
 * it. 8 e2e specs assert zero console errors on every page load; DeckMap
 * only ever passes a `RegionCode | null` in practice, but this guard makes
 * that a guarantee of the hook itself, not just of its one caller.
 *
 * Failure for a REAL code (network error / non-2xx / malformed JSON) also
 * resolves to `null`, quietly — this module never calls `console.error`.
 *
 * Stale-response guard: if `code` changes while a fetch for the PREVIOUS
 * code is still in flight, that previous fetch's eventual result (success
 * or failure) is discarded — `cancelled` is captured per-effect-run, and
 * React runs the previous run's cleanup (setting it) before starting the
 * next one.
 *
 * "disabled/no code/unknown code" and "already cached" are both handled
 * SYNCHRONOUSLY during render (React's documented "adjust state when a prop
 * changes" pattern — see https://react.dev/learn/you-might-not-need-an-effect
 * — a pair of `useState`s comparing this render's `activeCode` against the
 * previous one), not via `useEffect` + `setState`: calling `setState`
 * synchronously at the top of an effect body trips
 * eslint-plugin-react-hooks' set-state-in-effect rule, and there is no
 * actual async work to wait for in either of those two cases anyway — only
 * a genuine cache MISS needs the effect below, to await the fetch.
 */
export function useEmdBoundaries(code: string | null, enabled: boolean): FeatureCollection | null {
  const activeCode = enabled && code && isRegionCode(code) ? code : null;

  const [fc, setFc] = useState<FeatureCollection | null>(() => cachedOrNull(activeCode));
  const [prevActiveCode, setPrevActiveCode] = useState(activeCode);
  if (activeCode !== prevActiveCode) {
    setPrevActiveCode(activeCode);
    setFc(cachedOrNull(activeCode));
  }

  useEffect(() => {
    // Nothing to await: inactive, or already resolved synchronously above.
    if (!activeCode || cache.has(activeCode)) return;

    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/data/emd/${activeCode}.geojson`);
        if (!res.ok) {
          if (!cancelled) setFc(null);
          return;
        }
        const json = (await res.json()) as FeatureCollection;
        if (cancelled) return;
        cache.set(activeCode, json);
        setFc(json);
      } catch {
        // Network failure / aborted / malformed JSON — deliberately no
        // console.error (see this function's own doc comment).
        if (!cancelled) setFc(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeCode]);

  return fc;
}
