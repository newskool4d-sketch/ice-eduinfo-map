"use client";
import { createContext, useContext, useSyncExternalStore, type ReactNode } from "react";

export const DESIGNS = [
  { id: "atlas", label: "01 학교 탐색", short: "Coastal Atlas", description: "학교를 찾고, 지역을 살펴보세요." },
  { id: "night", label: "02 넓은 지도", short: "Wide Observatory", description: "인천의 교육을 더 넓게 바라보세요." },
  { id: "desk", label: "03 통계 중심", short: "Regional Desk", description: "지역의 차이를 데이터로 읽어보세요." },
] as const;
export type DesignId = typeof DESIGNS[number]["id"];
export type ColorMode = "light" | "dark";
export type TextSize = "normal" | "large";
const MODE_KEY = "ice-map-color-v1";
const TEXT_KEY = "ice-map-text-v1";
let fallbackDesign: DesignId = "atlas";
let fallbackMode: ColorMode = "light";
let fallbackText: TextSize = "normal";
function readText(): TextSize { try { return localStorage.getItem(TEXT_KEY) === "large" ? "large" : "normal"; } catch { return fallbackText; } }
function readMode(): ColorMode { try { return localStorage.getItem(MODE_KEY) === "dark" ? "dark" : "light"; } catch { return fallbackMode; } }
const KEY = "ice-map-design-v1";
function read(): DesignId {
  try { const value = localStorage.getItem(KEY); return DESIGNS.find(d => d.id === value)?.id ?? "atlas"; }
  catch { return fallbackDesign; }
}
function subscribe(notify: () => void) {
  window.addEventListener("ice-design", notify); window.addEventListener("storage", notify);
  return () => { window.removeEventListener("ice-design", notify); window.removeEventListener("storage", notify); };
}
const Context = createContext<{ design: DesignId; setDesign: (id: DesignId) => void; colorMode: ColorMode; setColorMode: (mode: ColorMode) => void; textSize: TextSize; setTextSize: (size: TextSize) => void }>({ design: "atlas", setDesign: () => {}, colorMode: "light", setColorMode: () => {}, textSize: "normal", setTextSize: () => {} });
export function DesignProvider({ children }: { children: ReactNode }) {
  const design = useSyncExternalStore(subscribe, read, () => "atlas" as const);
  const colorMode = useSyncExternalStore(subscribe, readMode, () => "light" as const);
  const textSize = useSyncExternalStore(subscribe, readText, () => "normal" as const);
  const setTextSize = (size: TextSize) => { fallbackText = size; try { localStorage.setItem(TEXT_KEY, size); } catch {} window.dispatchEvent(new Event("ice-design")); };
  const setColorMode = (mode: ColorMode) => { fallbackMode = mode; try { localStorage.setItem(MODE_KEY, mode); } catch {} window.dispatchEvent(new Event("ice-design")); };
  const setDesign = (id: DesignId) => {
    fallbackDesign = id;
    try { localStorage.setItem(KEY, id); } catch { /* Storage can be disabled. */ }
    window.dispatchEvent(new Event("ice-design"));
  };
  return <Context.Provider value={{ design, setDesign, colorMode, setColorMode, textSize, setTextSize }}>{children}</Context.Provider>;
}
export const useDesign = () => useContext(Context);
