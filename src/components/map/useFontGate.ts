"use client";

/**
 * Font gating: TextLayer caches one SDF atlas per fontFamily, so DeckMap
 * must not create it until next/font's family is actually ready to
 * rasterize EVERY character the label layers' `characterSet` declares
 * (추가 요구 #6) — not just the 14 시군 names. `charset` is the full
 * charset.json string (129 chars: digits, units like 명/㎡/%, and domain
 * terms), because labels render formatted indicator values, not just
 * names — gating on a smaller subset (as Task 1A did, before any labels
 * carried numbers) would silently miss a missing font-family slice
 * covering e.g. only digits or only "㎡". Split out of DeckMap.tsx (Task
 * 6, "현재 코드 상태") with NO intended behavior change — still exercised
 * end to end by e2e/smoke.spec.ts's `document.fonts.check()` assertion
 * (deck.gl-dependent code in this repo isn't unit-tested in jsdom, same as
 * useCamera/useRegionKeyboardNav).
 */
import { useEffect, useState } from "react";

// Fallback used when next/font's generated CSS variable can't be resolved —
// a generic family, so `document.fonts.check()` still resolves true via the
// browser's own system-fallback glyph substitution for Hangul.
const FALLBACK_FONT_FAMILY = "'Noto Sans KR', sans-serif";

export interface UseFontGateResult {
  fontReady: boolean;
  fontFamily: string;
}

export function useFontGate(charset: string): UseFontGateResult {
  const [fontReady, setFontReady] = useState(false);
  const [fontFamily, setFontFamily] = useState(FALLBACK_FONT_FAMILY);

  useEffect(() => {
    let cancelled = false;
    async function gateFont() {
      let family = FALLBACK_FONT_FAMILY;
      try {
        // Read from <body>, not document.documentElement (<html>): layout.tsx
        // applies next/font's generated `--font-sans` variable class to
        // <body>, and Tailwind v4 separately defines its OWN default
        // `--font-sans` design token reaching <html> — querying
        // documentElement picks up Tailwind's unrelated system-font stack
        // instead (verified empirically; see task-1A-report.md).
        const cssVar = getComputedStyle(document.body).getPropertyValue("--font-sans").trim();
        if (cssVar) family = cssVar;
      } catch {
        // getComputedStyle can throw outside a browser; keep the fallback.
      }
      try {
        await document.fonts.load(`600 16px ${family}`, charset);
        if (!document.fonts.check(`600 16px ${family}`, charset)) {
          family = FALLBACK_FONT_FAMILY;
        }
      } catch {
        family = FALLBACK_FONT_FAMILY;
      }
      if (!cancelled) {
        setFontFamily(family);
        setFontReady(true);
      }
    }
    void gateFont();
    return () => {
      cancelled = true;
    };
  }, [charset]);

  return { fontReady, fontFamily };
}
