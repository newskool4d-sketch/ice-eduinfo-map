import { expect, test } from "@playwright/test";

test("switching the indicator updates the legend, with no console errors", async ({ page }) => {
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
  await expect(page.locator("canvas")).toBeVisible({ timeout: 15000 });
  await expect(page.locator('[data-map-ready="true"]')).toBeAttached({ timeout: 20000 });

  // Default indicator (DEFAULT_INDICATOR_ID = students_total, label "학생수").
  const legendLabel = page.getByTestId("legend-indicator-label");
  await expect(legendLabel).toHaveText("학생수");

  await page.screenshot({ path: "test-results/indicator-before.png" });

  // Task 3: the radios now live behind TopBar's IndicatorMenu popover
  // (button + dialog), not inline in the header — open it first.
  await page.getByRole("button", { name: /^조건별 맵/ }).click();
  await expect(page.getByRole("dialog", { name: "조건별 맵 선택" })).toBeVisible();
  await page.getByRole("radio", { name: "학급당 학생수" }).click();
  await expect(legendLabel).toHaveText("학급당 학생수");

  // Let the 600ms height/color transition (regionLayers.ts's `transitions`)
  // settle before the second screenshot, purely for a cleaner capture — this
  // test makes no pixel-comparison assertion either way.
  await page.waitForTimeout(700);
  await page.screenshot({ path: "test-results/indicator-after.png" });

  expect(consoleErrors).toEqual([]);
});
