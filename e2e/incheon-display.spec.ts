import { expect, test, requireIncheon, setViewSettings } from "./fixtures";
import type { Page } from "@playwright/test";

// Redesign phase 3 (docs/planning/incheon-v1/29 §6): a stored dark or large-text
// choice applies from the first paint. The dashboard renders client-side, so the
// first paint is the server shell; blocking the app's scripts freezes it there.
const DARK_PAPER = "rgb(12, 29, 44)";
const store = (page: Page, values: Record<string, string>) =>
  page.addInitScript((entries) => { for (const [key, value] of Object.entries(entries)) localStorage.setItem(key, value); }, values);
const freezeShell = async (page: Page) => {
  if (process.env.NEXT_PUBLIC_EDU_MAP_PROFILE !== "incheon") test.skip(true, "Incheon only");
  await page.route(/\/_next\/static\/chunks\/.*\.js(\?|$)/, (route) => route.abort());
  await page.goto("/?scene=flat");
  await expect(page.getByText("지도 준비 중")).toBeVisible();
};
const background = (page: Page, selector: string) =>
  page.locator(selector).first().evaluate((element) => getComputedStyle(element).backgroundColor);

test("a stored dark choice paints the loading shell dark", async ({ page }) => {
  await store(page, { "ice-map-color-v1": "dark" });
  await freezeShell(page);
  expect(await background(page, "body")).toBe(DARK_PAPER);
  expect(await page.locator("header").first().evaluate((element) => getComputedStyle(element).color)).toBe("rgb(232, 242, 247)");
});

test.describe("with a dark device setting", () => {
  test.use({ colorScheme: "dark" });
  test("기기 설정 follows it from the first paint", async ({ page }) => {
    await store(page, { "ice-map-color-v1": "system" });
    await freezeShell(page);
    expect(await background(page, "body")).toBe(DARK_PAPER);
  });
});

test("a stored large-text choice is in place before the app loads", async ({ page }) => {
  await store(page, { "ice-map-text-v1": "large" });
  await freezeShell(page);
  await expect(page.locator("html")).toHaveAttribute("data-ice-text", "large");
});

test("the loaded app keeps large text and dark, and switching back to light clears both", async ({ page }) => {
  await store(page, { "ice-map-color-v1": "dark", "ice-map-text-v1": "large" });
  await page.goto("/?scene=flat");
  await requireIncheon(page);
  await expect(page.locator('[data-map-ready="true"]')).toBeAttached({ timeout: 20000 });
  expect(await page.locator(".ice-app").evaluate((element) => getComputedStyle(element).fontSize)).toBe("18px");
  expect(await background(page, ".ice-header")).toBe("rgb(19, 43, 60)");
  await setViewSettings(page, { large: false, color: "라이트" });
  await expect(page.locator("html")).not.toHaveAttribute("data-ice-color");
  expect(await background(page, ".ice-header")).toBe("rgb(255, 255, 255)");
  expect(await page.locator(".ice-app").evaluate((element) => getComputedStyle(element).fontSize)).toBe("16px");
});
