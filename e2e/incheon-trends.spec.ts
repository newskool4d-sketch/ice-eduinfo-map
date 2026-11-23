import { expect, test, requireIncheon } from "./fixtures";

// Code review 2026-11-07 #5: history.json uses the April source-era districts,
// so the four districts created on 2026-07-01 have no trend history. The panel
// falls back to province-wide figures and must say so.
test("trends tab explains the fallback for a district created on 2026-07-01", async ({ page }) => {
  await page.goto("/?scene=flat&view=trends&region=28125");
  await requireIncheon(page);
  await expect(page.locator('[data-map-ready="true"]')).toBeAttached({ timeout: 20000 });
  await expect(page.getByRole("tab", { name: "추세" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("note").filter({ hasText: "제물포구은(는) 2026년 7월 신설 구역" })).toBeVisible();
  await expect(page.locator(".ice-trends-place")).toContainText("인천 전체");
});

test("trends tab shows no fallback note for a district with history", async ({ page }) => {
  await page.goto("/?scene=flat&view=trends&region=28185");
  await requireIncheon(page);
  await expect(page.locator('[data-map-ready="true"]')).toBeAttached({ timeout: 20000 });
  await expect(page.locator(".ice-trends-place")).toContainText("연수구");
  await expect(page.getByText("신설 구역으로 과거 추세 자료가 없어")).toHaveCount(0);
});
