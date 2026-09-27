import { expect, test, openMapSettings } from "./fixtures";

test.use({ hasTouch: true, isMobile: true });

for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }]) {
  test(`Incheon mobile layout and controls fit ${viewport.width}×${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/?scene=flat");
    if (!(await page.locator(".ice-header").count())) test.skip(true, "Incheon profile only");
    await expect(page.locator('[data-map-ready="true"]')).toBeAttached({ timeout: 20000 });
    await expect(page.getByTestId("map-fallback-reason")).toHaveCount(0);

    const layout = await page.evaluate(() => {
      const header = document.querySelector(".ice-header")!.getBoundingClientRect();
      const map = document.querySelector("#school-map")!.getBoundingClientRect();
      const indicator = document.querySelector(".ice-indicator-label")!;
      const legend = document.querySelector(".ice-map-legend")!.getBoundingClientRect();
      return {
        headerHeight: header.height,
        mapHeight: map.height,
        legendBelowMap: legend.top >= map.bottom,
        pageWidth: document.documentElement.scrollWidth,
        indicatorOverflow: getComputedStyle(indicator).textOverflow,
        documentHeight: document.documentElement.scrollHeight,
        viewportHeight: window.innerHeight,
      };
    });
    console.log(`${viewport.width}×${viewport.height}: ${JSON.stringify(layout)}`);
    expect(layout.headerHeight).toBeLessThanOrEqual(220);
    expect(layout.mapHeight).toBeGreaterThanOrEqual(500);
    expect(layout.legendBelowMap).toBe(true);
    expect(layout.documentHeight).toBeGreaterThan(layout.viewportHeight);
    expect(layout.pageWidth).toBeLessThanOrEqual(viewport.width + 1);
    expect(layout.indicatorOverflow).not.toBe("ellipsis");
    expect(layout.mapHeight).toBeGreaterThanOrEqual(500);
    const overlapping = await page.evaluate(() => {
      const shortcut = document.querySelector(".ice-map-shortcuts")!.getBoundingClientRect();
      const touchToggle = document.querySelector(".ice-map-touch-toggle")!.getBoundingClientRect();
      const settings = [...document.querySelectorAll("summary")].find((el) => el.textContent?.includes("지도 설정"))!.getBoundingClientRect();
      const legend = document.querySelector(".ice-map-legend")!.getBoundingClientRect();
      const intersects = (a: DOMRect, b: DOMRect) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
      return [shortcut, settings, legend].some((rect) => intersects(touchToggle, rect)) || intersects(shortcut, settings) || intersects(shortcut, legend) || intersects(settings, legend);
    });
    expect(overlapping).toBe(false);
    await page.screenshot({ path: `test-results/mobile-${viewport.width}-overview.png` });

    await page.getByRole("button", { name: /^전체 지표/ }).click();
    const menu = page.getByRole("dialog", { name: "전체 지표 선택" });
    await expect(menu).toBeVisible();
    await expect(menu.getByText("현재 선택: 학생수")).toBeVisible();
    const bounds = await menu.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width);
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: /^전체 지표/ }).click();
    await page.getByRole("radio", { name: "교원수" }).click();
    await expect(page.locator(".ice-current-view")).toContainText("교원수");
    await expect(page.getByTestId("legend-indicator-label")).toHaveText("교원수");

    await openMapSettings(page);
    const settings = page.locator(".map-settings-content");
    await expect(settings).toBeVisible();
    expect(await page.locator(".map-overlay details").evaluate((element) =>
      element.scrollWidth <= element.clientWidth + 1)).toBe(true);
    expect(await page.locator(".ice-map-legend").evaluate((legend) => legend.getBoundingClientRect().top >= document.querySelector("#school-map")!.getBoundingClientRect().bottom)).toBe(true);
    await expect(page.getByRole("button", { name: "지도 이동" })).toBeHidden();
    await page.screenshot({ path: `test-results/mobile-${viewport.width}-settings.png` });
    await settings.evaluate((element) => { element.scrollTop = element.scrollHeight; });
    const basemap = page.getByRole("combobox", { name: "배경지도" });
    await expect(basemap).toBeVisible();
    await basemap.selectOption("off");
    await expect(basemap).toHaveValue("off");
    await expect(page.getByRole("radiogroup", { name: "학교 표현" })).toBeVisible();
    const boundaries = page.getByRole("button", { name: "읍면동 경계" });
    await boundaries.click();
    await expect(boundaries).toHaveAttribute("aria-pressed", "false");

    await page.getByRole("button", { name: "학교 찾기", exact: true }).click();
    const panel = page.getByRole("dialog", { name: "학교 탐색 및 시군 통계" });
    await expect(panel).toBeVisible();
    const search = panel.getByRole("searchbox", { name: "학교명 검색" });
    await expect(search).toBeVisible();
    const clippedNames = await panel.locator('button[data-testid^="school-row-"] span.text-sm').evaluateAll((names) =>
      names.filter((name) => name.scrollWidth > name.clientWidth + 1).map((name) => name.textContent));
    expect(clippedNames).toEqual([]);
    await page.screenshot({ path: `test-results/mobile-${viewport.width}-panel.png` });
    await search.fill("인천");
    await page.locator('button[data-testid^="school-row-"]').first().click();
    await expect(panel).toHaveCount(0);
    await expect(page.getByRole("button", { name: /학교 정보 보기$/ })).toBeVisible();
    await expect(page.locator(".ice-current-view")).toContainText("선택 학교:");
    await page.getByRole("button", { name: "선택 해제", exact: true }).click();
    await expect(page.locator(".ice-current-view")).not.toContainText("선택 학교:");

    await page.getByRole("button", { name: "큰 글씨" }).click();
    await page.getByRole("button", { name: "어두운 화면" }).click();
    await expect(page.locator(".ice-app")).toHaveAttribute("data-text-size", "large");
    await expect(page.locator(".ice-app")).toHaveAttribute("data-color", "dark");
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width + 1);
    expect(await page.locator(".ice-metrics dd").evaluateAll((elements) =>
      elements.every((element) => element.scrollWidth <= element.clientWidth + 1))).toBe(true);
  });
}

for (const viewport of [{ width: 700, height: 900 }, { width: 820, height: 780 }, { width: 844, height: 390 }, { width: 1024, height: 600 }]) {
  test(`unfolded and landscape viewport remains scrollable ${viewport.width}×${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/?scene=flat");
    if (!(await page.locator(".ice-header").count())) test.skip(true, "Incheon profile only");
    await expect(page.locator('[data-map-ready="true"]')).toBeAttached({ timeout: 20000 });
    const layout = await page.evaluate(() => ({
      pageHeight: document.documentElement.scrollHeight,
      pageWidth: document.documentElement.scrollWidth,
      mapHeight: document.querySelector("#school-map")!.getBoundingClientRect().height,
      scrollableMap: document.querySelector("#school-map")!.getAttribute("data-scrollable-map"),
    }));
    expect(layout.pageHeight).toBeGreaterThan(viewport.height);
    expect(layout.pageWidth).toBeLessThanOrEqual(viewport.width + 1);
    expect(layout.mapHeight).toBeGreaterThanOrEqual(500);
    expect(layout.scrollableMap).toBe("true");
    await openMapSettings(page);
    await expect(page.locator(".map-settings-content")).toBeVisible();
    expect(await page.locator(".map-settings-content").evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
    const boundaries = page.getByRole("button", { name: "읍면동 경계" });
    await boundaries.click();
    await expect(boundaries).toHaveAttribute("aria-pressed", "false");
    if (viewport.width < 1024) {
      await page.getByRole("button", { name: "학교 찾기", exact: true }).click();
      await expect(page.getByRole("dialog", { name: "학교 탐색 및 시군 통계" })).toBeVisible();
    }
  });
}

test("very narrow mobile viewport never turns a camera fit into an error fallback", async ({ page }) => {
  await page.setViewportSize({ width: 260, height: 562 });
  await page.goto("/?scene=flat");
  if (!(await page.locator(".ice-header").count())) test.skip(true, "Incheon profile only");
  await expect(page.locator('[data-map-ready="true"]')).toBeAttached({ timeout: 20000 });
  await expect(page.getByTestId("map-fallback-reason")).toHaveCount(0);
  await expect(page.locator(".ice-header")).toBeVisible();
  await page.screenshot({ path: "test-results/mobile-260-overview.png" });
  await page.setViewportSize({ width: 260, height: 340 });
  await expect(page.locator("#deckgl-overlay")).toBeVisible();
  expect(await page.locator("#school-map").evaluate((map) => map.getBoundingClientRect().height)).toBeGreaterThanOrEqual(500);
  expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeGreaterThan(340);
  await expect(page.getByTestId("map-fallback-reason")).toHaveCount(0);
  await page.setViewportSize({ width: 260, height: 562 });
  await expect(page.locator("#deckgl-overlay")).toBeVisible();
  await expect(page.getByTestId("map-fallback-reason")).toHaveCount(0);
});

test("one-finger swipe starting on the mobile map scrolls to its lower controls", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto("/?scene=flat");
  if (!(await page.locator(".ice-header").count())) test.skip(true, "Incheon profile only");
  await expect(page.locator('[data-map-ready="true"]')).toBeAttached({ timeout: 20000 });
  const session = await page.context().newCDPSession(page);
  const point = (y: number) => [{ x: 160, y, id: 1 }];
  await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: point(530) });
  for (const y of [500, 465, 430, 395, 360, 325, 280, 245]) {
    await session.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: point(y) });
  }
  await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(50);
  const controls = await page.evaluate(() => {
    const map = document.querySelector("#school-map")!.getBoundingClientRect();
    const info = document.querySelector(".ice-mobile-info")!.getBoundingClientRect();
    return { mapBottom: map.bottom, infoTop: info.top, viewportHeight: innerHeight };
  });
  expect(controls.mapBottom).toBeLessThanOrEqual(controls.viewportHeight + 1);
  expect(controls.infoTop).toBeLessThanOrEqual(controls.viewportHeight);
  await page.getByRole("link", { name: /교육현황 더 보기/ }).click();
  await expect(page.locator(".ice-mobile-info")).toBeInViewport();
  await page.screenshot({ path: "test-results/mobile-scroll-after-swipe.png" });
  await page.getByText("색상 범례").click();
  await expect(page.locator(".ice-legend-details")).toHaveAttribute("open", "");
  await page.getByText("색상 범례").click();
  await expect(page.locator(".ice-legend-details")).not.toHaveAttribute("open", "");
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.getByRole("button", { name: "지도 이동" }).click();
  await expect(page.getByRole("button", { name: /화면 내리기/ })).toHaveAttribute("aria-pressed", "true");
  const beforeLatitude = await page.evaluate(() => (window.__jbmap!.deck.getViewports()[0] as unknown as { latitude: number }).latitude);
  await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: point(530) });
  for (const y of [500, 465, 430, 395, 360]) {
    await session.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: point(y) });
  }
  await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await expect.poll(() => page.evaluate((latitude) => Math.abs((window.__jbmap!.deck.getViewports()[0] as unknown as { latitude: number }).latitude - latitude), beforeLatitude)).toBeGreaterThan(0.001);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  await page.getByRole("button", { name: /화면 내리기/ }).click();
  await expect(page.getByRole("button", { name: "지도 이동" })).toHaveAttribute("aria-pressed", "false");
  await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: point(530) });
  for (const y of [480, 430, 380, 330, 280]) {
    await session.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: point(y) });
  }
  await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(50);
});

test("all Incheon designs survive large text, dark mode, and landscape resize", async ({ page }) => {
  await page.setViewportSize({ width: 430, height: 932 });
  await page.goto("/?scene=flat");
  if (!(await page.locator(".ice-header").count())) test.skip(true, "Incheon profile only");
  await expect(page.locator('[data-map-ready="true"]')).toBeAttached({ timeout: 20000 });
  await page.getByRole("button", { name: "큰 글씨" }).click();
  await page.getByRole("button", { name: "어두운 화면" }).click();
  for (const design of ["atlas", "night", "desk"]) {
    await page.getByRole("combobox", { name: "화면 버전" }).selectOption(design);
    await expect(page.locator(".ice-app")).toHaveAttribute("data-design", design);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(431);
    expect(await page.locator(".ice-metrics dd").evaluateAll((elements) =>
      elements.every((element) => element.scrollWidth <= element.clientWidth + 1))).toBe(true);
    await expect(page.locator("#deckgl-overlay")).toBeVisible();
  }
  await page.setViewportSize({ width: 844, height: 390 });
  await expect(page.locator("#deckgl-overlay")).toBeVisible();
  await expect(page.getByTestId("map-fallback-reason")).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(845);
  const closePanel = page.getByRole("button", { name: "패널 닫기" });
  if (await closePanel.isVisible()) await closePanel.click();
  expect(await page.locator("#school-map").evaluate((map) => map.getBoundingClientRect().height)).toBeGreaterThanOrEqual(500);
  await page.screenshot({ path: "test-results/mobile-landscape.png" });
});

test("basemap retry remains reachable on a short mobile screen", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  let failing = true;
  await page.route("**/api.vworld.kr/**", (route) =>
    failing ? route.fulfill({ status: 503, body: "offline" }) : route.fallback());
  await page.goto("/?scene=flat");
  if (!(await page.locator(".ice-header").count())) test.skip(true, "Incheon profile only");
  const status = page.locator(".basemap-status");
  await expect(status).toBeVisible({ timeout: 20000 });
  failing = false;
  await status.getByRole("button", { name: "배경지도 다시 불러오기" }).click();
  await expect(status).toHaveCount(0, { timeout: 20000 });
  await expect(page.getByTestId("map-fallback-reason")).toHaveCount(0);
});
