import { expect, test, requireIncheon } from "./fixtures";
import type { Page } from "@playwright/test";

// Redesign phase 1 (docs/planning/incheon-v1/29 §4.3): the panel is organised by
// task, and the retired "화면 버전" choice is carried over once on the first visit.
async function ready(page: Page) {
  await requireIncheon(page);
  await expect(page.locator('[data-map-ready="true"]')).toBeAttached({ timeout: 20000 });
}
const storeDesign = (page: Page, value: string) =>
  page.addInitScript((design) => {
    if (sessionStorage.getItem("seeded")) return;
    sessionStorage.setItem("seeded", "1");
    localStorage.setItem("ice-map-design-v1", design);
  }, value);

test("the panel offers 학교 찾기, 지역 비교 and 추세", async ({ page }) => {
  await page.goto("/?scene=flat");
  await ready(page);
  await expect(page.getByRole("tablist", { name: "탐색 유형" }).getByRole("tab")).toHaveText(["학교 찾기", "지역 비교", "추세"]);
  await expect(page.getByRole("combobox", { name: "화면 버전" })).toHaveCount(0);
});

test("a stored 03 통계 중심 choice opens 지역 비교 once and is then removed", async ({ page }) => {
  await storeDesign(page, "desk");
  await page.goto("/?scene=flat");
  await ready(page);
  await expect(page).toHaveURL(/view=statistics/);
  await expect(page.getByRole("tab", { name: "지역 비교" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("region", { name: "군구별 교육현황 비교" })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("ice-map-design-v1"))).toBeNull();
});

test("a shared link's own view wins over the stored choice", async ({ page }) => {
  await storeDesign(page, "desk");
  await page.goto("/?scene=flat&view=schools");
  await ready(page);
  await expect(page.getByRole("tab", { name: "학교 찾기" })).toHaveAttribute("aria-selected", "true");
  expect(await page.evaluate(() => localStorage.getItem("ice-map-design-v1"))).toBeNull();
});

test("a stored 02 넓은 지도 choice opens with the panel closed", async ({ page }) => {
  await storeDesign(page, "night");
  await page.goto("/?scene=flat");
  await ready(page);
  await expect(page.locator(".ice-sidebar")).toBeHidden();
  await expect(page.getByRole("button", { name: "학교 찾기", exact: true })).toBeVisible();
});

test("지역 비교 keeps the comparison table and adds the selected district's detail", async ({ page }) => {
  await page.goto("/?scene=flat&view=statistics&region=28185");
  await ready(page);
  const panel = page.locator(".ice-sidebar");
  await expect(panel.getByRole("heading", { name: "연수구", level: 2 })).toBeVisible();
  await expect(panel.getByRole("region", { name: "군구별 교육현황 비교" })).toBeVisible();
});

test("a selected school's 이 학교 추세 opens the 추세 tab on that school", async ({ page }) => {
  await page.goto("/?scene=flat");
  await ready(page);
  await page.locator(".ice-sidebar .ice-school-list > li button").first().click();
  const detail = page.getByRole("region", { name: "선택한 학교" });
  const name = (await detail.getByRole("heading").textContent())!;
  await detail.getByRole("button", { name: "이 학교 추세" }).click();
  await expect(page.getByRole("tab", { name: "추세" })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".ice-trends-place")).toHaveText(name);
});

test("chips, 지표 menu and 현재 보기 use the same group names", async ({ page }) => {
  await page.goto("/?scene=flat&indicator=classes_total");
  await ready(page);
  await expect(page.locator("nav.ice-topic-chips > button")).toHaveText([/학생·학교/, /교육여건/, /소규모학교/]);
  await expect(page.locator("nav.ice-topic-chips > button[aria-pressed=true]")).toHaveText(/학생·학교/);
  // On desktop the row is visually hidden (its school line stays a live region).
  await expect(page.locator(".ice-current-view")).toContainText("학생·학교 · 학급수");
});

test("the toolbar figures follow the selected district, including the 2026-07-01 districts", async ({ page }) => {
  await page.goto("/?scene=flat&region=28185");
  await ready(page);
  const status = page.locator(".ice-toolbar-status");
  await expect(status).toContainText("연수구");
  await expect(status).toContainText("51,679");
  await page.goto("/?scene=flat&region=28125");
  await ready(page);
  await expect(status).toContainText("제물포구");
  await expect(status.locator("dd")).toHaveCount(4);
  await expect(status.locator("dd").filter({ hasText: "—" })).toHaveCount(0);
});
