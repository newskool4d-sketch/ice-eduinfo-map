import { expect, test } from "./fixtures";

// Code review 2026-11-07 #5: history.json uses the April source-era districts,
// so the four districts created on 2026-07-01 have no trend history. The panel
// falls back to province-wide figures and must say so.
test("trends panel explains the fallback for a district created on 2026-07-01", async ({ page }) => {
  await page.goto("/?scene=flat&view=statistics&region=28125");
  if (!(await page.locator(".ice-header").count())) test.skip(true, "Incheon profile only");
  await expect(page.locator('[data-map-ready="true"]')).toBeAttached({ timeout: 20000 });
  const summary = page.locator("details.ice-trends > summary");
  await summary.scrollIntoViewIfNeeded();
  if (!(await page.locator("details.ice-trends").evaluate((element) => element.hasAttribute("open")))) await summary.click();
  await expect(page.getByRole("note").filter({ hasText: "제물포구은(는) 2026년 7월 신설 구역" })).toBeVisible();
  await expect(summary).toContainText("인천 전체");
});

test("trends panel shows no fallback note for a district with history", async ({ page }) => {
  await page.goto("/?scene=flat&view=statistics&region=28185");
  if (!(await page.locator(".ice-header").count())) test.skip(true, "Incheon profile only");
  await expect(page.locator('[data-map-ready="true"]')).toBeAttached({ timeout: 20000 });
  const summary = page.locator("details.ice-trends > summary");
  await summary.scrollIntoViewIfNeeded();
  if (!(await page.locator("details.ice-trends").evaluate((element) => element.hasAttribute("open")))) await summary.click();
  await expect(summary).toContainText("연수구");
  await expect(page.getByText("신설 구역으로 과거 추세 자료가 없어")).toHaveCount(0);
});
