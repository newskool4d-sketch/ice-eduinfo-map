import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { deployedProfile } from "./deployed-profile";

// Production (ice-eduinfo-map.vercel.app) ships the Incheon profile; the other
// deployed-*.spec.ts files describe the Jeonbuk site. Expected figures come from
// the committed public/data/incheon package, not literals, so a data refresh
// does not silently break this check (code review round 3).
// Run: DEPLOYMENT_URL=https://ice-eduinfo-map.vercel.app npx playwright test e2e/deployed-incheon.spec.ts
// The city scene calls the building API (VWorld key quota): run it once per deploy.
const data = (name: string) => JSON.parse(readFileSync(`public/data/incheon/${name}`, "utf8"));
const SCHOOL_ID = "kedi:233021302"; // 인천신정초등학교, Songdo (inside building coverage)

test("deployed Incheon map: figures, building tiles, school selection, mobile and /about", async ({ page, request }) => {
  const site = process.env.DEPLOYMENT_URL;
  test.skip(!site, "Requires a deployed site URL");
  test.skip((await deployedProfile(request, site!)) !== "incheon", "Deployed site is not the Incheon profile");
  test.setTimeout(90_000);

  const schools: { id: string; name: string }[] = data("schools.json").schools;
  const school = schools.find((s) => s.id === SCHOOL_ID);
  expect(school, `${SCHOOL_ID} in public/data/incheon/schools.json`).toBeDefined();
  const students = data("indicators/students_total.json").rows
    .find((row: { regionCode: string; level?: string }) => row.regionCode === "28000" && row.level === undefined).value as number;

  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("response", (response) => {
    if (response.url().includes("/api/buildings/") && response.status() >= 400) errors.push(`Building API ${response.status()}`);
  });

  // Province figures match the committed package.
  await page.goto(`${site}/?scene=flat`);
  await expect(page.locator("#school-map")).toHaveAttribute("data-map-ready", "true", { timeout: 30_000 });
  await expect(page.locator(".ice-metrics").first()).toContainText(students.toLocaleString("ko-KR"));

  // A selected school in the city scene zooms in far enough to load building tiles.
  await page.goto(`${site}/?scene=city&school=${encodeURIComponent(SCHOOL_ID)}`);
  await expect(page.getByLabel("선택한 학교").getByRole("heading", { name: school!.name })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/건물 조회:/)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/일부 건물 정보를 불러오지 못했습니다/)).toHaveCount(0);

  // Mobile: same selection, no horizontal scroll.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${site}/?scene=flat&school=${encodeURIComponent(SCHOOL_ID)}`);
  await expect(page.getByRole("button", { name: `${school!.name} 학교 정보 보기` })).toBeVisible({ timeout: 30_000 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);

  // /about has its own canonical and og:url (code review round 2 #8).
  const about = await (await request.get(`${site}/about`)).text();
  expect(about).toMatch(/<link rel="canonical" href="[^"]*\/about"/);
  expect(about).toMatch(/<meta property="og:url" content="[^"]*\/about"/);

  // Building API accepts only one canonical URL per tile.
  expect((await request.get(`${site}/api/buildings/v1/16/055823/25419`)).status()).toBe(400);

  expect(errors).toEqual([]);
});
