/**
 * Task C — persists whether the VWorld basemap toggle (DeckMap's "배경 지도"
 * MapOverlay item) is on, across page loads. `localStorage` access is
 * wrapped in try/catch because it can throw synchronously in some private-
 * browsing modes (notably older Safari) even just on `getItem`/`setItem` —
 * this module treats that exactly like "nothing stored yet": default ON,
 * write silently no-ops. `typeof window === "undefined"` guards SSR/non-DOM
 * callers (DeckMap itself is client-only — see MapShell.tsx's `ssr:false` —
 * but this module makes no assumption about who calls it).
 */
const STORAGE_KEY = "jbmap.basemap";

/** No stored value yet -> ON by default (matches the task brief: "없으면 기본 ON"). */
export function readBasemapPref(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return true;
    return raw === "1";
  } catch {
    return true;
  }
}

export function writeBasemapPref(enabled: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, enabled ? "1" : "0");
  } catch {
    // Private mode / storage disabled / quota exceeded — the toggle still
    // works for the rest of this session, it just won't be remembered next
    // time. Not worth surfacing to the user.
  }
}
