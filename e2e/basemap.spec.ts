import { expect, test } from "./fixtures";

test("이전 입체 설정이 있어도 평면 지도만 표시하고 지형을 요청하지 않는다", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("jbmap.mapMode.v1", "terrain");
    localStorage.setItem("jbmap.basemap", "satellite");
  });
  let terrainRequests = 0;
  page.on("request", (request) => {
    if (request.url().includes("/api/terrain/")) terrainRequests++;
  });
  await page.goto("/");
  for (let visit = 0; visit < 2; visit++) {
    await expect(page.locator('[data-map-ready="true"]')).toBeAttached({ timeout: 20000 });
    await expect(page.getByRole("radiogroup", { name: "지도 모드" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "발표 모드" })).toHaveCount(0);
    expect(await page.evaluate(() => (window.__jbmap!.deck.getViewports()[0] as import("@deck.gl/core").WebMercatorViewport).pitch)).toBe(0);
    await page.getByRole("searchbox", { name: "학교명 검색" }).fill("전주초등학교");
    await page.locator('[data-testid^="school-row-"]').first().click();
    await expect(page.getByRole("heading", { name: "전주초등학교" })).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.__jbmap!.deck.getViewports()[0].zoom)).toBeCloseTo(15, 2);
    expect(terrainRequests).toBe(0);
    if (visit === 0) await page.reload();
  }
});
