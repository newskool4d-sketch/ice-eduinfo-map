import { expect, test } from "@playwright/test";

test("폐교 지표: /?indicator=closed_schools 진입 → 범례 라벨 → 시군 선택 → 폐교 목록 섹션 표시", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));

  // 군산시(52130) has 14 폐교 rows (per the raw CSV — see task-5-report.md's
  // per-region table), so the 목록 is guaranteed non-empty here.
  await page.goto("/?indicator=closed_schools&region=52130");
  await expect(page.locator("canvas")).toBeVisible({ timeout: 15000 });
  await expect(page.locator('[data-map-ready="true"]')).toBeAttached({ timeout: 20000 });

  await expect(page.getByTestId("legend-indicator-label")).toHaveText("폐교 수(누적)");
  await expect(page.getByTestId("legend-description")).not.toBeEmpty();

  await expect(page.getByRole("heading", { name: "군산시" })).toBeVisible();

  const section = page.getByTestId("closed-schools-section");
  await expect(section).toBeVisible();
  await expect(section.locator("summary")).toHaveText("폐교 목록 (14개)");

  // <details> starts closed — rows exist in the DOM but are not visible
  // (native <details> collapse) until opened.
  const rows = page.locator('[data-testid^="closed-school-row-"]');
  await expect(rows).toHaveCount(14);
  await expect(rows.first()).not.toBeVisible();
  await section.locator("summary").click();
  await expect(rows.first()).toBeVisible();

  // Footer (Task 5, Section C) — every named source with its own 기준일.
  await expect(page.getByTestId("footer-source")).toHaveCount(4);
  const closedSchoolsSource = page.getByTestId("footer-source").filter({ hasText: "폐교재산" });
  await expect(closedSchoolsSource).toContainText("기준일 2026-07-16");
  await expect(closedSchoolsSource).toContainText("게시 2026-07-20");
  await expect(page.getByTestId("footer-school-count-definition")).toBeVisible();
  await expect(page.getByTestId("footer-small-school-definition")).toBeVisible();

  await page.screenshot({ path: "test-results/closed-schools-panel.png", fullPage: false });

  expect(consoleErrors).toEqual([]);
});
