"use client";
import { createContext, useContext, useSyncExternalStore, type ReactNode } from "react";

export type ColorMode = "light" | "dark";
export type TextSize = "normal" | "large";
const MODE_KEY = "ice-map-color-v1";
const TEXT_KEY = "ice-map-text-v1";
let fallbackMode: ColorMode = "light";
let fallbackText: TextSize = "normal";
function readText(): TextSize { try { return localStorage.getItem(TEXT_KEY) === "large" ? "large" : "normal"; } catch { return fallbackText; } }
function readMode(): ColorMode { try { return localStorage.getItem(MODE_KEY) === "dark" ? "dark" : "light"; } catch { return fallbackMode; } }

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
  return () => { window.removeEventListener("ice-design", notify); window.removeEventListener("storage", notify); };
}
const Context = createContext<{ colorMode: ColorMode; setColorMode: (mode: ColorMode) => void; textSize: TextSize; setTextSize: (size: TextSize) => void }>({ colorMode: "light", setColorMode: () => {}, textSize: "normal", setTextSize: () => {} });
export function DesignProvider({ children }: { children: ReactNode }) {
  const colorMode = useSyncExternalStore(subscribe, readMode, () => "light" as const);
  const textSize = useSyncExternalStore(subscribe, readText, () => "normal" as const);
  const setTextSize = (size: TextSize) => { fallbackText = size; try { localStorage.setItem(TEXT_KEY, size); } catch {} window.dispatchEvent(new Event("ice-design")); };
  const setColorMode = (mode: ColorMode) => { fallbackMode = mode; try { localStorage.setItem(MODE_KEY, mode); } catch {} window.dispatchEvent(new Event("ice-design")); };
  return <Context.Provider value={{ colorMode, setColorMode, textSize, setTextSize }}>{children}</Context.Provider>;
}
export const useDesign = () => useContext(Context);
