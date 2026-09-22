import { expect, test } from "./fixtures";

test("평면 지도가 기본이고 모드 전환은 중심을 유지하며 선택을 기억한다", async ({
  page,
}) => {
  let terrainRequests = 0;
  page.on("request", (req) => {
    if (req.url().includes("/api/terrain/")) terrainRequests++;
  });
  await page.goto("/");
  await expect(page.locator('[data-map-ready="true"]')).toBeAttached({
    timeout: 20000,
  });
  const road = page.getByRole("radio", { name: "평면 지도" });
  const terrain = page.getByRole("radio", { name: "입체 위성" });
  await expect(road).toHaveAttribute("aria-checked", "true");
  const view = () =>
    page.evaluate(() => {
      const v =
        window.__jbmap!.deck.getViewports()[0] as import("@deck.gl/core").WebMercatorViewport;
      return {
        pitch: v.pitch,
        zoom: v.zoom,
        longitude: v.longitude,
        latitude: v.latitude,
      };
    });
  const before = await view();
  expect(before.pitch).toBe(0);
  expect(terrainRequests).toBe(0);
  await terrain.click();
  await expect.poll(async () => (await view()).pitch).toBe(56);
  const after = await view();
  expect(after.longitude).toBeCloseTo(before.longitude, 4);
  expect(after.latitude).toBeCloseTo(before.latitude, 4);
  await page.reload();
  await expect(page.locator('[data-map-ready="true"]')).toBeAttached({
    timeout: 20000,
  });
  await expect(terrain).toHaveAttribute("aria-checked", "true");
  await road.click();
  await expect.poll(async () => (await view()).pitch).toBe(0);
  await page.reload();
  await expect(page.locator('[data-map-ready="true"]')).toBeAttached({
    timeout: 20000,
  });
  await expect(road).toHaveAttribute("aria-checked", "true");
});
