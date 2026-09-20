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
 * useCamera/useRegionKeyboardNav; `primaryFamily` below is the one pure
 * piece, and IS unit tested — see tests/unit/useFontGate.test.ts).
 */
import { useEffect, useState } from "react";

// Fallback used when next/font's generated CSS variable can't be resolved —
// a generic family, so `document.fonts.check()` still resolves true via the
// browser's own system-fallback glyph substitution for Hangul.
const FALLBACK_FONT_FAMILY = "'Noto Sans KR', sans-serif";

// CI Linux fix (ci-linux-fixes branch, see ci-fix-report.md) — bounded so a
// stalled/broken network fetch can never keep the label layers off forever;
// the gate still opens (with FALLBACK_FONT_FAMILY) once this elapses.
const FONT_LOAD_TIMEOUT_MS = 8000;

/**
 * The first font-family in a CSS font-family list / custom-property value,
 * quotes preserved (e.g. `"Noto Sans KR", "Noto Sans KR Fallback"` ->
 * `"Noto Sans KR"`). Pure — no DOM — so it's unit tested directly.
 *
 * Why this exists: next/font's `--font-sans` variable always lists TWO
 * families — the real webfont ("Noto Sans KR") plus an auto-generated
 * metrics-only fallback face ("Noto Sans KR Fallback") that sources itself
 * via `src: local("Arial")`, purely to reduce layout shift before the real
 * font finishes downloading. `document.fonts.check()`/`load()` given a
 * font-family LIST fail for the WHOLE list the instant any one family in it
 * resolves to a FontFace with status "error" — even for characters the
 * FIRST family alone already fully covers. A bare Linux CI runner has no
 * "Arial" installed, so that local() source can never resolve: checking the
 * full two-family var is false 100% of the time there, regardless of
 * whether Noto Sans KR itself is loaded and covers every character (it
 * does — verified by parsing the built CSS's unicode-range data against
 * public/data/charset.json; every one of its 316 characters, including
 * "㎡"/"·", sits inside a declared "Noto Sans KR" range, so the fallback
 * face is never actually needed to render a label). Gating on the primary
 * family alone sidesteps that local()-availability dependency entirely.
 */
export function primaryFamily(cssVarValue: string): string {
  const [first] = cssVarValue.split(",");
  return (first ?? "").trim();
}

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
      // Load/check the PRIMARY family only (see primaryFamily's doc comment)
      // — `family` itself (kept as the full cssVar, primary + next/font's
      // metric fallback) is still what's returned/handed to TextLayer below,
      // since that richer stack is harmless and desirable for actual
      // rendering; only the readiness CHECK narrows to primary.
      const primary = primaryFamily(family);
      try {
        await Promise.race([
          document.fonts.load(`600 16px ${primary}`, charset),
          new Promise<void>((resolve) => setTimeout(resolve, FONT_LOAD_TIMEOUT_MS)),
        ]);
        if (!document.fonts.check(`600 16px ${primary}`, charset)) {
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
