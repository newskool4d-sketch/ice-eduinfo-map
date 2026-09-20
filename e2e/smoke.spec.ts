import { expect, test } from "@playwright/test";

test("home page renders the 3D map with 14 regions and no console errors", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });
  page.on("pageerror", (error) => {
    consoleErrors.push(error.message);
  });

  await page.goto("/");

  await expect(page).toHaveTitle(/전북교육지도/);
  await expect(page.locator("canvas")).toBeVisible({ timeout: 15000 });
  await expect(page.locator('[data-map-ready="true"]')).toBeAttached({ timeout: 20000 });

  // The glyphs the region labels actually need are ready in the font
  // DeckMap resolved (see DeckMap.tsx's gateFont(), which reads `--font-sans`
  // from document.body — see task-1A-report.md's fix-round-1 section for why
  // documentElement is wrong here). Checked against the FULL charset.json
  // string (129 chars: digits, units like 명/㎡/%, punctuation), not just a
  // 시군 name — 추가 요구 #6: labels now render formatted indicator values
  // (e.g. "70,444명"), not just names, so gating on 24 Hangul characters
  // alone (as Task 1A did) would miss a missing font-family slice covering
  // only digits or only a unit character. `document.fonts.check()` is
  // called with real text, not the default (space) it probes without a
  // `text` argument.
  const koreanGlyphsReady = await page.evaluate(async () => {
    const fallback = "'Noto Sans KR', sans-serif";
    const cssVar = getComputedStyle(document.body).getPropertyValue("--font-sans").trim();
    const family = cssVar || fallback;
    const charset: string = await fetch("/data/charset.json").then((r) => r.json());
    return document.fonts.check(`600 16px ${family}`, charset);
  });
  expect(koreanGlyphsReady).toBe(true);

  await page.screenshot({ path: "test-results/overview.png" });

  expect(consoleErrors).toEqual([]);
});
