export type MapDisplayMode = "road" | "terrain";
const STORAGE_KEY = "jbmap.mapMode.v1";

export function readMapMode(): MapDisplayMode {
  try {
    return typeof window !== "undefined" &&
      window.localStorage.getItem(STORAGE_KEY) === "terrain"
      ? "terrain"
      : "road";
  } catch {
    return "road";
  }
}

export function writeMapMode(mode: MapDisplayMode): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    /* Storage can be unavailable. */
  }
}
