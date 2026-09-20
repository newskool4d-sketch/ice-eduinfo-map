import { expect, test } from "@playwright/test";

test("home page renders the dark map shell with no console errors", async ({ page }) => {
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

  expect(consoleErrors).toEqual([]);
});
