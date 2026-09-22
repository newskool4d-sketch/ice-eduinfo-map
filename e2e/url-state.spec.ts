import { openPanel, docShot, expect, test } from "./fixtures";

async function waitForMapReady(page: import("@playwright/test").Page) {
  await expect(page.locator("canvas")).toBeVisible({ timeout: 15000 });
  await expect(page.locator('[data-map-ready="true"]')).toBeAttached({ timeout: 20000 });
}

test("selecting an indicator from the menu updates the URL and survives a refresh", async ({ page }) => {
  await page.goto("/");
  await openPanel(page);
  await page.getByRole("tab", { name: "시군 통계" }).click();
  await waitForMapReady(page);

  const legendLabel = page.getByTestId("legend-indicator-label");
  await expect(legendLabel).toHaveText("학생수");

  await page.getByRole("button", { name: /^전체 지표/ }).click();
  const dialog = page.getByRole("dialog", { name: "전체 지표 선택" });
  await expect(dialog).toBeVisible();

  // Confirms the popover renders above the map canvas, not behind it (the
  // task instructions specifically ask for this to be visually verified).
  await docShot(page, "indicator-menu-open");

  await page.getByRole("radio", { name: "학급당 학생수" }).click();
  await expect(dialog).not.toBeVisible();
  await expect(legendLabel).toHaveText("학급당 학생수");
  await expect(page).toHaveURL(/[?&]indicator=students_per_class(&|$)/);

  await page.reload();
  await openPanel(page);
  await page.getByRole("tab", { name: "시군 통계" }).click();
  await waitForMapReady(page);
  await expect(legendLabel).toHaveText("학급당 학생수");
  await expect(page).toHaveURL(/[?&]indicator=students_per_class(&|$)/);
});

test("navigating directly to ?indicator=teachers_total starts on that indicator", async ({ page }) => {
  await page.goto("/?indicator=teachers_total");
  await openPanel(page);
  await page.getByRole("tab", { name: "시군 통계" }).click();
  await waitForMapReady(page);

  await expect(page.getByTestId("legend-indicator-label")).toHaveText("교원수");
  await expect(page.getByRole("button", { name: /^전체 지표/ })).toHaveText(/교원수/);
});

// Fix round 2, finding 9 (controller ruling) — the quantile-vs-linear
// boundary moved from `distinctValues.length > palette.length` to `>=`
// (tests/unit/colors.test.ts covers the boundary directly), so
// closed_schools_unused (real data: exactly 5 distinct values — the same
// dataset that exposed the original tie-bucketing bug fix round 1 fixed)
// now ALSO uses quantile bucketing end to end, not the linear fallback it
// got before. Both count-kind indicators checked here render the same
// quantile Legend state in a real browser.
test("legend distinguishes student density from regional quantile counts", async ({
  page,
}) => {
  await page.goto("/");
  await openPanel(page);
  await page.getByRole("tab", { name: "시군 통계" }).click();
  await waitForMapReady(page);
  await expect(page.getByTestId("legend-indicator-label")).toHaveText("학생수");
  await expect(page.getByTestId("metric-legend")).toContainText("상대 집중도");

  await expect(page.getByText("높이·색 모두 값에 비례")).toHaveCount(0);

  await page.goto("/?indicator=closed_schools_unused");
  await openPanel(page);
  await page.getByRole("tab", { name: "시군 통계" }).click();
  await waitForMapReady(page);
  await expect(page.getByTestId("legend-indicator-label")).toHaveText("미활용 폐교 수");
  await expect(page.getByTestId("metric-legend")).toContainText("색 구간: 고유값 5분위");
  await expect(page.getByTestId("metric-legend")).toContainText("시군 단위");
  await expect(page.getByText("높이·색 모두 값에 비례")).toHaveCount(0);
});

test("an invalid ?indicator value falls back to the default indicator", async ({ page }) => {
  await page.goto("/?indicator=not_a_real_indicator");
  await openPanel(page);
  await page.getByRole("tab", { name: "시군 통계" }).click();
  await waitForMapReady(page);

  await expect(page.getByTestId("legend-indicator-label")).toHaveText("학생수");
  await expect(page.getByRole("button", { name: /^전체 지표/ })).toHaveText(/학생수/);
});

test("arrow-key navigation in the indicator menu previews live (URL updates, popover stays open); Enter commits and returns focus; Escape cancels", async ({
  page,
}) => {
  await page.goto("/");
  await openPanel(page);
  await page.getByRole("tab", { name: "시군 통계" }).click();
  await waitForMapReady(page);

  const menuButton = page.getByRole("button", { name: /^전체 지표/ });
  await menuButton.click();
  const dialog = page.getByRole("dialog", { name: "전체 지표 선택" });
  await expect(dialog).toBeVisible();

  // Read the actual rendered radio order/ids from the DOM rather than
  // hardcoding indicator ids, so this test tracks IndicatorPicker's real
  // group/registry order instead of duplicating it. Scoped to the popover:
  // the map overlay's "배경 지도" segmented control (Task 3) is a radiogroup
  // too, and a page-wide `getByRole("radio")` would pick up its three
  // radios (as empty `value`s) after the indicator ones.
  const radios = dialog.getByRole("radio");
  const radioIds = await radios.evaluateAll((els) => els.map((el) => (el as HTMLInputElement).value));
  expect(radioIds.length).toBeGreaterThan(2);

  // The menu focuses the first radio on open (no Tab needed to reach it).
  await expect(radios.nth(0)).toBeFocused();

  await page.keyboard.press("ArrowDown");
  await expect(dialog).toBeVisible();
  await expect(radios.nth(1)).toBeFocused();
  await expect(page).toHaveURL(new RegExp(`[?&]indicator=${radioIds[1]}(&|$)`));

  await page.keyboard.press("ArrowDown");
  await expect(dialog).toBeVisible();
  await expect(radios.nth(2)).toBeFocused();
  await expect(page).toHaveURL(new RegExp(`[?&]indicator=${radioIds[2]}(&|$)`));

  await page.keyboard.press("Enter");
  await expect(dialog).not.toBeVisible();
  await expect(menuButton).toBeFocused();
  // Enter commits the already-previewed value; no further URL change.
  await expect(page).toHaveURL(new RegExp(`[?&]indicator=${radioIds[2]}(&|$)`));

  await menuButton.click();
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(menuButton).toBeFocused();
});
