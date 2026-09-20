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

  await page.screenshot({ path: "test-results/overview.png" });

  expect(consoleErrors).toEqual([]);
});
