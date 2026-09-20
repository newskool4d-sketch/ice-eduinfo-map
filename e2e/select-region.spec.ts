import fs from "node:fs";
import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

async function waitForMapReady(page: Page) {
  await expect(page.locator("canvas")).toBeVisible({ timeout: 15000 });
  await expect(page.locator('[data-map-ready="true"]')).toBeAttached({ timeout: 20000 });
}

const MAP_WRAPPER_LABEL = "전북 시군 3D 지도";

/** 전주시's labelPoint, read directly from the built regions.geojson (no browser round-trip needed). */
function jeonjuLabelPoint(): [number, number] {
  const regionsPath = path.join(process.cwd(), "public/data/regions.geojson");
  const fc = JSON.parse(fs.readFileSync(regionsPath, "utf-8")) as {
    features: { properties: { code: string; labelPoint: [number, number] } }[];
  };
  const feature = fc.features.find((f) => f.properties.code === "52110");
  if (!feature) throw new Error("52110 (전주시) not found in public/data/regions.geojson");
  return feature.properties.labelPoint;
}

/**
 * Reads the live camera's pitch/zoom via the NEXT_PUBLIC_E2E-only
 * window.__jbmap bridge (see DeckMap.tsx). `deck.getViewports()[0]` is
 * typed as the base (non-geospatial) deck.gl `Viewport`, which doesn't
 * declare pitch/longitude/latitude (`WebMercatorViewport`-specific fields)
 * — this app's only view is a MapView/WebMercatorViewport, so the widened
 * structural cast below is safe without importing deck.gl into this e2e
 * spec (deck.gl imports are scoped to src/components/map/** per the task
 * brief).
 */
function readCamera(page: Page) {
  return page.evaluate(() => {
    const deck = window.__jbmap?.deck;
    if (!deck) throw new Error("window.__jbmap not exposed — is NEXT_PUBLIC_E2E=1 set for the dev server?");
    const viewport = deck.getViewports()[0] as unknown as {
      pitch: number;
      zoom: number;
      longitude: number;
      latitude: number;
    };
    return { pitch: viewport.pitch, zoom: viewport.zoom, longitude: viewport.longitude, latitude: viewport.latitude };
  });
}

test.describe("시군 선택", () => {
  test("RegionList 클릭 → URL/패널/카메라 갱신 → Esc 해제 → 뒤로가기로 재선택 복원", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => consoleErrors.push(error.message));

    await page.goto("/");
    await waitForMapReady(page);

    // Unselected: RegionList is showing, with the leading prompt.
    await expect(page.getByText("시군을 클릭하거나 목록에서 선택하세요")).toBeVisible();
    const overviewCamera = await readCamera(page);

    await page.screenshot({ path: "test-results/select-region-before.png" });

    await page.getByRole("button", { name: /전주시/ }).click();

    await expect(page).toHaveURL(/[?&]region=52110(&|$)/);
    await expect(page.getByRole("heading", { name: "전주시" })).toBeVisible();
    // RegionList is gone, replaced by the panel.
    await expect(page.getByText("시군을 클릭하거나 목록에서 선택하세요")).not.toBeVisible();

    // Let the fly-to transition (FlyToInterpolator, transitionDuration:
    // 'auto') settle before asserting the camera / taking the "after" shot.
    await page.waitForTimeout(2000);

    const selectedCamera = await readCamera(page);
    expect(selectedCamera.pitch).toBe(55);
    expect(selectedCamera.zoom).toBeGreaterThan(overviewCamera.zoom);

    await page.screenshot({ path: "test-results/select-region-after.png" });

    // Esc deselects WITHOUT ever focusing the map wrapper first (fix round
    // 1, review finding #1): the just-clicked RegionList <button> unmounts
    // once the panel swaps to RegionPanel, which leaves focus on <body> —
    // confirmed below — not on the wrapper. A document-level listener (see
    // DeckMap.tsx) is what actually catches this Escape, not the wrapper's
    // own onKeyDown.
    await expect(page.getByLabel(MAP_WRAPPER_LABEL)).not.toBeFocused();
    await page.keyboard.press("Escape");

    await expect(page).not.toHaveURL(/[?&]region=/);
    await expect(page.getByText("시군을 클릭하거나 목록에서 선택하세요")).toBeVisible();

    // A transition to/from "nothing selected" always pushes a history entry
    // (see urlState.ts's setRegion) — the stack is [no region] ->
    // [region=52110] -> [no region], so going back ONE step restores the
    // selection.
    await page.goBack();
    await expect(page).toHaveURL(/[?&]region=52110(&|$)/);
    await expect(page.getByRole("heading", { name: "전주시" })).toBeVisible();

    expect(consoleErrors).toEqual([]);
  });

  test("화살표로 시군을 두 번 이동해도 뒤로가기 한 번이면 선택이 사라진다", async ({ page }) => {
    // Fix round 1, review finding #2: code -> a different code REPLACES the
    // history entry (doesn't push), so cycling ←/→ through several regions
    // still leaves only ONE pushed entry (from the initial list-click
    // selection) — a single Back undoes the whole cycle at once, landing on
    // "nothing selected," not one arrow-step back.
    await page.goto("/");
    await waitForMapReady(page);

    await page.getByRole("button", { name: /전주시/ }).click();
    await expect(page).toHaveURL(/[?&]region=52110(&|$)/);

    // ←/→ cycling is scoped to the map wrapper (handleWrapperKeyDown).
    await page.getByLabel(MAP_WRAPPER_LABEL).focus();

    const afterSelect = page.url();
    await page.keyboard.press("ArrowRight");
    await expect(page).toHaveURL(/[?&]region=\d{5}(&|$)/);
    await expect(page).not.toHaveURL(afterSelect);
    const afterFirstArrow = page.url();

    await page.keyboard.press("ArrowRight");
    await expect(page).toHaveURL(/[?&]region=\d{5}(&|$)/);
    await expect(page).not.toHaveURL(afterFirstArrow);

    await page.goBack();
    await expect(page).not.toHaveURL(/[?&]region=/);
  });

  test("캔버스에서 전주시를 직접 클릭해도 선택된다", async ({ page }) => {
    await page.goto("/");
    await waitForMapReady(page);

    const labelPoint = jeonjuLabelPoint();
    const pixel = await page.evaluate((point) => {
      const deck = window.__jbmap?.deck;
      if (!deck) throw new Error("window.__jbmap not exposed — is NEXT_PUBLIC_E2E=1 set for the dev server?");
      return deck.getViewports()[0].project(point);
    }, labelPoint);
    const canvas = page.locator("canvas").first();
    const box = await canvas.boundingBox();
    if (!box) throw new Error("canvas has no bounding box");
    const x = box.x + pixel[0];
    const y = box.y + pixel[1];

    // A plain `.click()` is occasionally missed by deck.gl's own gesture
    // recognizer (mjolnir.js) under CPU contention from parallel e2e
    // workers — confirmed empirically: 100% reliable (10/10, then 16/16
    // more with the fix below) with `--workers=1`, intermittently missed
    // with the suite's default parallelism, even though `getTooltip`'s
    // hover-pick (a *different* code path) reliably detects 전주시 at the
    // very same pixel every time. Hovering first (so the picking system is
    // already "warmed up" on this target before the click) and spacing out
    // mouse.down()/up() by a real interval — instead of Playwright's single
    // synthetic `.click()`, which can dispatch the whole down/up pair
    // within the same frame — gives mjolnir.js's gesture timing enough
    // breathing room even when the page is contended.
    await page.mouse.move(x, y);
    await page.waitForTimeout(150);
    await page.mouse.down();
    await page.waitForTimeout(80);
    await page.mouse.up();

    await expect(page).toHaveURL(/[?&]region=52110(&|$)/);
    await expect(page.getByRole("heading", { name: "전주시" })).toBeVisible();

    // Esc deselects here too, without ever focusing the wrapper (fix round
    // 1, review finding #1) — after a canvas click, deck.gl/mjolnir.js
    // doesn't move focus onto the wrapper div either.
    await expect(page.getByLabel(MAP_WRAPPER_LABEL)).not.toBeFocused();
    await page.keyboard.press("Escape");
    await expect(page).not.toHaveURL(/[?&]region=/);
  });

  // Fix round 2, finding 5 — cross-component Escape contract, previously
  // untested end to end: IndicatorMenu's own Escape handler calls
  // preventDefault() specifically so DeckMap's document-level
  // Escape-to-deselect listener (registered in the bubble phase — see
  // DeckMap.tsx's own comment, and useRegionKeyboardNav.ts) can tell "the
  // menu already handled this Escape" apart from "nothing did" and skip
  // deselecting the region. A single Escape with the menu open must close
  // ONLY the menu — the region selection (and its URL param) must survive.
  test("지표 메뉴가 열린 상태에서 Esc → 메뉴만 닫히고 시군 선택(URL의 region)은 유지된다", async ({ page }) => {
    await page.goto("/?region=52110");
    await waitForMapReady(page);
    await expect(page).toHaveURL(/[?&]region=52110(&|$)/);
    await expect(page.getByRole("heading", { name: "전주시" })).toBeVisible();

    await page.getByRole("button", { name: /^조건별 맵/ }).click();
    const dialog = page.getByRole("dialog", { name: "조건별 맵 선택" });
    await expect(dialog).toBeVisible();

    await page.keyboard.press("Escape");

    await expect(dialog).not.toBeVisible();
    await expect(page).toHaveURL(/[?&]region=52110(&|$)/);
    await expect(page.getByRole("heading", { name: "전주시" })).toBeVisible();
  });
});
