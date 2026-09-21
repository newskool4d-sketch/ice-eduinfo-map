import { docShot, expect, test } from "./fixtures";

// Task 6, Section A.1 — MapShell shows MapFallback's table instead of the 3D
// map when the viewport is narrower than 768px (and returns to the map once
// it widens again). See e2e/fallback-webgl.spec.ts for the WebGL2-failure
// case — kept in a separate file since that one needs file-scoped
// `launchOptions`, which this `viewport` override doesn't.
test.use({ viewport: { width: 600, height: 800 } });

test("뷰포트가 768px 미만이면 지도 대신 표를 보여준다", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));

  await page.goto("/");

  await expect(page.getByTestId("map-fallback-reason")).toHaveText("화면이 좁아 표로 표시합니다");
  await expect(page.getByRole("table")).toBeVisible();
  await expect(page.locator("canvas")).toHaveCount(0);

  // Fix round 2, finding 12 — this spec had no screenshot coverage at all;
  // captures the 600px fallback-table state alongside the other specs'
  // overview/select-region/schools screenshots.
  await docShot(page, "fallback-viewport-600");

  expect(consoleErrors).toEqual([]);
});

test("표 폴백의 행을 클릭하면 해당 시군이 선택된다", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("map-fallback-reason")).toBeVisible();

  // Scoped to the fallback table specifically — at this narrow viewport,
  // RegionList (the right-hand panel, unrelated to whether the MAP area
  // itself renders 3D vs. table) also has its OWN "전주시" button, so an
  // unscoped getByRole would match both.
  await page.getByRole("table").getByRole("button", { name: "전주시" }).click();

  await expect(page).toHaveURL(/[?&]region=52110(&|$)/);
  await expect(page.getByRole("heading", { name: "전주시" })).toBeVisible();
});

test("뷰포트가 다시 넓어지면 지도로 복귀한다", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("map-fallback-reason")).toBeVisible();

  await page.setViewportSize({ width: 1600, height: 900 });

  await expect(page.locator("canvas")).toBeVisible({ timeout: 15000 });
  await expect(page.locator('[data-map-ready="true"]')).toBeAttached({ timeout: 20000 });
  await expect(page.getByTestId("map-fallback-reason")).not.toBeVisible();
});
