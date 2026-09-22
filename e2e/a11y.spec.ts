import { expect, test } from "./fixtures";
import type { Locator, Page } from "@playwright/test";

// Task 6, Section B. `npx @axe-core/cli` can't be installed (no new
// dependencies — task brief), so this spec exercises the two checks it asks
// for directly via Playwright: keyboard focus order across the 지표 메뉴 →
// 라디오 → 시군 목록 → 패널 chain, and landmark presence.

async function waitForMapReady(page: Page) {
  await expect(page.locator("canvas")).toBeVisible({ timeout: 15000 });
  await expect(page.locator('[data-map-ready="true"]')).toBeAttached({ timeout: 20000 });
}

/** Presses Tab up to `maxTabs` times, stopping as soon as `locator` is the focused element. Bounded (not an exact Tab-count assertion) so this doesn't hard-code how many OTHER focusable siblings (KPI tiles, indicator radios, …) happen to sit in between — only that `locator` is reachable via Tab at all, in order. */
async function tabUntilFocused(page: Page, locator: Locator, maxTabs: number): Promise<boolean> {
  const isFocused = () => locator.evaluate((el) => el === document.activeElement).catch(() => false);
  if (await isFocused()) return true;
  for (let i = 0; i < maxTabs; i++) {
    await page.keyboard.press("Tab");
    if (await isFocused()) return true;
  }
  return false;
}

test.describe("접근성", () => {
  test("랜드마크: banner/main/complementary/contentinfo 가 모두 존재한다", async ({ page }) => {
    await page.goto("/");
    await waitForMapReady(page);

    await expect(page.getByRole("banner")).toBeVisible();
    await expect(page.getByRole("main")).toBeVisible();
    await expect(page.getByRole("complementary")).toBeVisible();
    await expect(page.getByRole("contentinfo")).toBeVisible();
  });

  test("포커스 순서: 지표 메뉴 → 라디오 → 시군 목록 → 패널까지 Tab 으로 도달 가능하다", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => consoleErrors.push(error.message));

    await page.goto("/");
    await waitForMapReady(page);

    // 1) 지표 메뉴 ("조건별 맵") 버튼 — a fresh page load starts with nothing
    // focused (document.activeElement === body), so tabbing from here
    // exercises the REAL top-of-page order, not a shortcut.
    const menuButton = page.getByRole("button", { name: /^조건별 맵/ });
    expect(await tabUntilFocused(page, menuButton, 10)).toBe(true);

    // 2) 라디오: opening the popover (Enter activates the focused native
    // <button>) auto-focuses its first radio (IndicatorMenu.tsx's own open
    // effect) — reachable with zero further Tabs.
    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog", { name: "조건별 맵 선택" })).toBeVisible();
    const firstRadio = page.locator('#indicator-menu-popover input[type="radio"]').first();
    await expect(firstRadio).toBeFocused();

    // Close the popover (Escape — doesn't deselect the map, since nothing is
    // selected yet) so it doesn't obscure/duplicate-focus-trap what follows.
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "조건별 맵 선택" })).not.toBeVisible();

    // 2b) 배경 지도 세그먼트 (Task 3, spec §7): the radiogroup uses a roving
    // tabindex, so its ONE Tab stop is the checked radio (위성 by default —
    // playwright.config.ts sets NEXT_PUBLIC_VWORLD_KEY for the e2e server,
    // so the control renders). Reachability only, not an exact position
    // (same bounded helper as the other steps). ArrowRight then moves the
    // selection to the next option (일반) and focuses it — the WAI-ARIA
    // radiogroup keyboard pattern.
    const basemapGroup = page.getByRole("radiogroup", { name: "배경 지도" });
    const satelliteRadio = basemapGroup.getByRole("radio", { name: "위성" });
    await expect(satelliteRadio).toHaveAttribute("aria-checked", "true");
    expect(await tabUntilFocused(page, satelliteRadio, 15)).toBe(true);
    await page.keyboard.press("ArrowRight");
    const baseRadio = basemapGroup.getByRole("radio", { name: "일반" });
    await expect(baseRadio).toHaveAttribute("aria-checked", "true");
    await expect(baseRadio).toBeFocused();

    // 3) 시군 목록: RegionList's buttons live in the complementary landmark
    // (<aside>) — first one reachable by continuing to Tab forward from
    // wherever focus is now (the 일반 radio in the map overlay, which sits
    // before the <aside> in DOM order).
    const firstRegionButton = page.getByRole("complementary").getByRole("button").first();
    expect(await tabUntilFocused(page, firstRegionButton, 15)).toBe(true);

    // 4) 패널: selecting a region (Enter activates the focused RegionList
    // button) swaps <aside> from RegionList to RegionPanel. The just-clicked
    // button unmounts with it, so focus reverts to <body> (same behavior
    // e2e/select-region.spec.ts already documents) — Tab again to confirm
    // the PANEL's own controls (its "선택 해제" close button) are reachable.
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { level: 2 })).toBeVisible();
    const closeButton = page.getByRole("complementary").getByLabel("선택 해제");
    expect(await tabUntilFocused(page, closeButton, 15)).toBe(true);

    expect(consoleErrors).toEqual([]);
  });

  test("전체보기/확대/축소 위젯 버튼이 Tab 으로 도달 가능하다 (대체 버튼 불필요 확인)", async ({ page }) => {
    // deck.gl's ResetViewWidget/ZoomWidget render real DOM <button
    // aria-label> elements as siblings of the canvas inside the map
    // wrapper — confirmed here they're genuinely Tab-reachable, so the task
    // brief's fallback clause ("대체 버튼... 위젯은 제거") doesn't apply; no
    // custom buttons were added.
    await page.goto("/");
    await waitForMapReady(page);

    await page.getByLabel("전북 학교 위치 지도").focus();
    const resetView = page.getByRole("button", { name: "전체보기" });
    expect(await tabUntilFocused(page, resetView, 3)).toBe(true);
  });

  test("지표 전환 시 aria-live 낭독 텍스트가 갱신된다", async ({ page }) => {
    await page.goto("/");
    await waitForMapReady(page);

    const announcement = page.getByTestId("indicator-announcement");
    await expect(announcement).toHaveText("지표 변경: 학생수"); // DEFAULT_INDICATOR_ID

    await page.getByRole("button", { name: /^조건별 맵/ }).click();
    await page.getByRole("radio", { name: "학급당 학생수" }).click();

    await expect(announcement).toHaveText("지표 변경: 학급당 학생수");
  });
});
