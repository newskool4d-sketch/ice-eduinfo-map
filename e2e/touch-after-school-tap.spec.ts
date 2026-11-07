import { expect, test, requireIncheon } from "./fixtures";
import type { CDPSession, Page } from "@playwright/test";

// Code review 2026-11-07 #3: DeckMap's onPointerUpCapture stopped the native
// pointerup after a school tap. deck.gl's gesture input (mjolnir.js) listens for
// pointerup on window in the bubble phase, so the tapped touch pointer stayed in
// its pointer store and the next one-finger drag was read as a two-pointer pinch.
test.use({ hasTouch: true, isMobile: true });

type View = { longitude: number; latitude: number; zoom: number };
const viewOf = (page: Page) => page.evaluate(() => {
  const view = window.__jbmap!.deck.getViewports()[0] as unknown as View;
  return { longitude: view.longitude, latitude: view.latitude, zoom: view.zoom };
});

async function waitStill(page: Page) {
  // Compare reads taken a real interval apart: two reads within one frame look
  // "still" even mid-flight, and a drag sent during the fly-to was the source of
  // an intermittent failure in serial runs.
  let settled = await viewOf(page);
  await expect.poll(async () => {
    await page.waitForTimeout(300);
    const now = await viewOf(page);
    const still = Math.abs(now.zoom - settled.zoom) < 1e-5 && Math.abs(now.latitude - settled.latitude) < 1e-7;
    settled = now;
    return still;
  }, { timeout: 15000, intervals: [250] }).toBe(true);
}

async function touch(session: CDPSession, path: [number, number][]) {
  const [first, ...rest] = path;
  await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: first[0], y: first[1], id: 1 }] });
  for (const [x, y] of rest) await session.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y, id: 1 }] });
  await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
}

test("one-finger drag still pans the map after tapping a school point", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?scene=flat&schoolChart=dots&view=schools&region=28185");
  await requireIncheon(page);
  await expect(page.locator('[data-map-ready="true"]')).toBeAttached({ timeout: 20000 });
  const mapMode = page.getByRole("button", { name: "지도 이동" });
  if (await mapMode.isVisible()) await mapMode.click();

  // Wait for the region fly-to to settle, then find a school dot inside the map.
  await waitStill(page);
  const bounds = (await page.locator("#school-map").boundingBox())!;
  const target = await page.evaluate(({ left, top, width, height }) => {
    // Scan the canvas for a pixel that picks a school dot or a school cluster
    // (at the Incheon district zoom most schools are grouped into clusters).
    const deck = window.__jbmap!.deck;
    for (const layerId of ["schools", "school-clusters"]) {
      for (let y = 140; y < height - 180; y += 6) {
        for (let x = 40; x < width - 40; x += 6) {
          // Skip spots covered by map controls (e.g. the "지도 이동" toggle).
          if ((document.elementFromPoint(left + x, top + y) as HTMLElement | null)?.id !== "deckgl-overlay") continue;
          if (deck.pickObject({ x, y, radius: 0, layerIds: [layerId] })?.object) return { x, y, layerId };
        }
      }
    }
    return null;
  }, { left: bounds.x, top: bounds.y, width: bounds.width, height: bounds.height });
  expect(target, "a school dot or cluster inside the map").not.toBeNull();

  const session = await page.context().newCDPSession(page);
  const tapped = await viewOf(page);
  await touch(session, [[bounds.x + target!.x, bounds.y + target!.y]]);
  if (target!.layerId === "school-clusters") {
    // A cluster tap zooms toward its schools (or lists them when they share one address).
    const dialog = page.locator("dialog.ice-cluster-dialog");
    await expect.poll(async () => (await dialog.count()) > 0 || (await viewOf(page)).zoom > tapped.zoom + 0.5, { timeout: 15000 }).toBe(true);
    if (await dialog.count()) await dialog.getByRole("button", { name: "닫기", exact: true }).click();
  } else {
    await expect(page).toHaveURL(/school=/);
  }
  await waitStill(page);
  await expect(page.locator("dialog[open]")).toHaveCount(0);

  const before = await viewOf(page);
  const startX = bounds.x + bounds.width / 2;
  const startY = bounds.y + 140;
  await touch(session, [[startX, startY], [startX + 20, startY + 10], [startX + 45, startY + 25], [startX + 70, startY + 40], [startX + 90, startY + 50]]);
  await expect.poll(async () => Math.abs((await viewOf(page)).longitude - before.longitude)).toBeGreaterThan(1e-5);
  const after = await viewOf(page);
  // A pan keeps the zoom; the stale-pointer bug turns the same drag into a pinch.
  expect(Math.abs(after.zoom - before.zoom)).toBeLessThan(0.01);
});
