"use client";

/**
 * Task 6, Section A.1/A.3 — decides whether to render the real 3D map or
 * MapFallback's table stand-in, and wraps whichever it picks in
 * MapErrorBoundary (so a render exception from deck.gl itself also falls
 * back to the table rather than crashing the whole page).
 *
 * `dynamic(..., { ssr: false })` is only allowed inside a 'use client' file,
 * which is why the deck.gl-importing DeckMap is loaded from here rather
 * than from a server component.
 */
import { useMemo, useSyncExternalStore, type ReactNode } from "react";
import dynamic from "next/dynamic";

import type { DeckMapProps } from "./DeckMap";
import MapErrorBoundary from "./MapErrorBoundary";
import MapFallback from "./MapFallback";
import { useBundle } from "@/lib/data/DataProvider";

const DeckMap = dynamic<DeckMapProps>(() => import("./DeckMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-[#0b0f19] text-sm text-[#e6e9f0]/50">
      지도 준비 중
    </div>
  ),
});

// "Wide enough for the 3D map" — NOT the narrow condition itself, so the
// boolean below (`isWide`) reads naturally at every call site.
const WIDE_QUERY = "(min-width: 768px)";

function subscribeToWidth(onChange: () => void): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => {};
  const mql = window.matchMedia(WIDE_QUERY);
  // Only fires when the QUERY'S BOOLEAN OUTCOME actually flips (crossing the
  // 768px line), not on every intermediate resize pixel — this alone is
  // what makes "폭이 다시 커지면 지도로 복귀" (Section A.1) work, with no
  // separate window-resize listener.
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}

function getWidthSnapshot(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return true;
  return window.matchMedia(WIDE_QUERY).matches;
}

// SSR-time assumption: "wide enough". Irrelevant to what actually ships
// (DeckMap itself is ssr:false, so the server only ever emits its "지도 준비
// 중" loading placeholder regardless of this value) — its only job is to be
// a STABLE value useSyncExternalStore can render on the client's first
// (pre-hydration-settled) paint without a mismatch; React re-renders with
// the real client snapshot immediately after.
function getWidthServerSnapshot(): boolean {
  return true;
}

/** Computed once and cached: WebGL2 support cannot change mid-session, so there's nothing to subscribe to. */
let cachedWebGL2Ok: boolean | null = null;
function hasWebGL2(): boolean {
  if (cachedWebGL2Ok !== null) return cachedWebGL2Ok;
  if (typeof document === "undefined") return true; // SSR: see getWidthServerSnapshot's doc comment — same reasoning.
  try {
    cachedWebGL2Ok = !!document.createElement("canvas").getContext("webgl2");
  } catch {
    cachedWebGL2Ok = false;
  }
  return cachedWebGL2Ok;
}
function subscribeNever(): () => void {
  return () => {};
}
function getWebGLServerSnapshot(): boolean {
  return true;
}

export default function MapShell(props: DeckMapProps) {
  const bundle = useBundle();

  // Task 6, Section A.1 — both checks go through useSyncExternalStore (not
  // a plain useState+useEffect) specifically for its built-in SSR-safe
  // hydration behavior: the server (and the client's very first paint)
  // render the `getXServerSnapshot()` value unconditionally, avoiding a
  // hydration mismatch; React swaps in the real `getXSnapshot()` value
  // right after, with no manual effect/flag needed. `isWide`'s subscription
  // also gives "폭이 다시 커지면 지도로 복귀" for free (matchMedia's own
  // `change` event, not a raw resize listener) — WebGL support has no such
  // concept (it can't change mid-session), hence `subscribeNever`.
  const isWide = useSyncExternalStore(subscribeToWidth, getWidthSnapshot, getWidthServerSnapshot);
  const webglOk = useSyncExternalStore(subscribeNever, hasWebGL2, getWebGLServerSnapshot);

  // Shared by every MapFallback variant (webgl/viewport/error) — not
  // DeckMapProps' full shape: MapFallback has no school-point rendering, so
  // highlightedSchoolId/onHighlightSchool are never relevant to it.
  const fallbackProps = useMemo(
    () => ({
      indicatorId: props.indicatorId,
      bundle,
      selectedCode: props.selectedCode,
      onSelect: props.onSelect,
    }),
    [props.indicatorId, bundle, props.selectedCode, props.onSelect],
  );

  let content: ReactNode;
  if (!webglOk) {
    content = <MapFallback {...fallbackProps} reason="webgl" />;
  } else if (!isWide) {
    content = <MapFallback {...fallbackProps} reason="viewport" />;
  } else {
    content = <DeckMap {...props} />;
  }

  return (
    <MapErrorBoundary fallback={<MapFallback {...fallbackProps} reason="error" />}>{content}</MapErrorBoundary>
  );
}
