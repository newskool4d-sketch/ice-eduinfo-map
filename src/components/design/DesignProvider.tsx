"use client";
import { createContext, useContext, useSyncExternalStore, type ReactNode } from "react";

export type ColorMode = "light" | "dark";
/** What the viewer picked; "system" follows the device setting. */
export type ColorPreference = ColorMode | "system";
export type TextSize = "normal" | "large";
const MODE_KEY = "ice-map-color-v1";
const TEXT_KEY = "ice-map-text-v1";
let fallbackPreference: ColorPreference = "light";
let fallbackText: TextSize = "normal";
function readText(): TextSize { try { return localStorage.getItem(TEXT_KEY) === "large" ? "large" : "normal"; } catch { return fallbackText; } }
const DARK_QUERY = "(prefers-color-scheme: dark)";
function readPreference(): ColorPreference {
  try { const value = localStorage.getItem(MODE_KEY); return value === "dark" || value === "system" ? value : "light"; }
  catch { return fallbackPreference; }
}
function readMode(): ColorMode {
  const preference = readPreference();
  if (preference !== "system") return preference;
  return typeof window.matchMedia === "function" && window.matchMedia(DARK_QUERY).matches ? "dark" : "light";
}

/**
 * The retired "화면 버전" picker (01 학교 탐색 / 02 넓은 지도 / 03 통계 중심)
 * stored its choice here. It is read once, so a returning visitor starts where
 * that layout used to put them, and then removed (redesign plan §4.3).
 */
const LEGACY_DESIGN_KEY = "ice-map-design-v1";
export type LegacyDesign = "atlas" | "night" | "desk";
let legacyDesign: LegacyDesign | null | undefined;
/** Same answer for every call in this page load (StrictMode runs initialisers twice). */
export function takeLegacyDesign(): LegacyDesign | null {
  if (typeof window === "undefined") return null;
  if (legacyDesign === undefined) {
    try {
      const value = localStorage.getItem(LEGACY_DESIGN_KEY);
      legacyDesign = value === "atlas" || value === "night" || value === "desk" ? value : null;
      if (value !== null) localStorage.removeItem(LEGACY_DESIGN_KEY);
    } catch { legacyDesign = null; }
  }
  return legacyDesign;
}
/** Tests only: forget the value read in this module instance. */
export function resetLegacyDesignForTests() { legacyDesign = undefined; }

function subscribe(notify: () => void) {
  window.addEventListener("ice-design", notify); window.addEventListener("storage", notify);
  const device = typeof window.matchMedia === "function" ? window.matchMedia(DARK_QUERY) : null;
  device?.addEventListener("change", notify);
  return () => { window.removeEventListener("ice-design", notify); window.removeEventListener("storage", notify); device?.removeEventListener("change", notify); };
}
const Context = createContext<{ colorMode: ColorMode; colorPreference: ColorPreference; setColorPreference: (preference: ColorPreference) => void; textSize: TextSize; setTextSize: (size: TextSize) => void }>({ colorMode: "light", colorPreference: "light", setColorPreference: () => {}, textSize: "normal", setTextSize: () => {} });
export function DesignProvider({ children }: { children: ReactNode }) {
  const colorMode = useSyncExternalStore(subscribe, readMode, () => "light" as const);
  const colorPreference = useSyncExternalStore(subscribe, readPreference, () => "light" as const);
  const textSize = useSyncExternalStore(subscribe, readText, () => "normal" as const);
  const setTextSize = (size: TextSize) => { fallbackText = size; try { localStorage.setItem(TEXT_KEY, size); } catch {} window.dispatchEvent(new Event("ice-design")); };
  const setColorPreference = (preference: ColorPreference) => { fallbackPreference = preference; try { localStorage.setItem(MODE_KEY, preference); } catch {} window.dispatchEvent(new Event("ice-design")); };
  return <Context.Provider value={{ colorMode, colorPreference, setColorPreference, textSize, setTextSize }}>{children}</Context.Provider>;
}
export const useDesign = () => useContext(Context);
