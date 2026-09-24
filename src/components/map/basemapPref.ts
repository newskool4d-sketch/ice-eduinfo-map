/** Persist explicit choices; new visitors follow the screen theme by default.
 * Keep the storage key and boolean-era values for returning users. Storage
 * failures fall back safely without disabling the session's map controls.
 */
export type BasemapMode = "auto" | "off" | "satellite" | "base" | "white" | "midnight";
export type BasemapTiles = Exclude<BasemapMode, "auto" | "off">;

export const BASEMAP_OPTIONS: { value: BasemapMode; label: string }[] = [
  { value: "auto", label: "자동 · 화면 테마에 맞춤" },
  { value: "base", label: "일반지도" },
  { value: "white", label: "백지도" },
  { value: "midnight", label: "야간지도" },
  { value: "satellite", label: "위성지도 · 지명 포함" },
  { value: "off", label: "끄기 · 학교·통계만" },
];

/** An explicit choice survives theme changes; only auto follows the theme. */
export function resolveBasemap(mode: BasemapMode, dark: boolean): BasemapTiles | null {
  if (mode === "off") return null;
  return mode === "auto" ? (dark ? "midnight" : "white") : mode;
}

const STORAGE_KEY = "jbmap.basemap";
const DEFAULT_MODE: BasemapMode = "auto";

function parse(raw: string | null): BasemapMode {
  if (raw === null) return DEFAULT_MODE;
  if (raw === "1") return "satellite"; // 2차 개선(Task C) boolean-era value: ON
  if (raw === "0") return "off"; // …and OFF
  return BASEMAP_OPTIONS.find((option) => option.value === raw)?.value ?? DEFAULT_MODE;
}

/** No saved choice or unavailable storage -> automatic theme matching. */
export function readBasemapPref(): BasemapMode {
  if (typeof window === "undefined") return DEFAULT_MODE;
  try {
    return parse(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return DEFAULT_MODE;
  }
}

export function writeBasemapPref(mode: BasemapMode): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // Private mode / storage disabled / quota exceeded — the control still
    // works for the rest of this session, it just won't be remembered next
    // time. Not worth surfacing to the user.
  }
}
