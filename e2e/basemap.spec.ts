import { docShot, expect, test } from "./fixtures";
import type { Page } from "@playwright/test";

// Flake mitigation: local 5-worker runs can hit CDP "session closed" on page.reload() here.
// A retry uses a fresh browser context — no localStorage carries over from the failed attempt.
test.describe.configure({ retries: process.env.CI ? 2 : 1 });

async function waitForMapReady(page: Page) {
  await expect(page.locator("canvas")).toBeVisible({ timeout: 15000 });
  await expect(page.locator('[data-map-ready="true"]')).toBeAttached({ timeout: 20000 });
}

/**
 * Reads `deck.props.layers[0]`'s id via the NEXT_PUBLIC_E2E-only
 * window.__jbmap bridge (same pattern as e2e/schools.spec.ts's
 * readSchoolsLayerDataLength / e2e/select-region.spec.ts's readCamera) —
 * `null`/`undefined` when the basemap layer slot is empty (DeckMap.tsx
 * always keeps slot 0 for it, `null` when off — see its `layers` useMemo).
 */
function basemapLayerId(page: Page) {
  return page.evaluate(() => {
    const deck = window.__jbmap?.deck;
    if (!deck) throw new Error("window.__jbmap not exposed — is NEXT_PUBLIC_E2E=1 set for the dev server?");
    const layers = deck.props.layers as unknown as ({ id: string } | null)[];
    return layers[0]?.id ?? null;
  });
}

/** The basemap TileLayer's URL template (its `data` prop), or `null` when the layer is absent — tells the two tile sources apart. */
function basemapTileUrl(page: Page) {
  return page.evaluate(() => {
    const deck = window.__jbmap?.deck;
    if (!deck) throw new Error("window.__jbmap not exposed — is NEXT_PUBLIC_E2E=1 set for the dev server?");
    const layers = deck.props.layers as unknown as ({ id: string; props: { data: unknown } } | null)[];
    const basemap = layers.find((l) => l?.id === "basemap");
    return typeof basemap?.props.data === "string" ? basemap.props.data : null;
  });
}

/** The wash layer (Task 3) sits right behind the tiles and must appear/disappear with them. */
function washLayerPresent(page: Page) {
  return page.evaluate(() => {
    const layers = window.__jbmap!.deck.props.layers as unknown as ({ id: string } | null)[];
    return layers.some((l) => l?.id === "basemap-wash");
  });
}

test.describe("배경 지도 (VWorld 3단: 끄기 · 위성 · 일반)", () => {
  test("기본 위성(맨 앞) → 끄기 → 일반(/Base/) → 새로고침 후에도 일반 유지, 콘솔 error 0", async ({ page }) => {
    // Same precedent as e2e/emd.spec.ts: a load → 3 mode switches → reload
    // cycle runs ~25 s alone and ~35 s under the local 5-worker full suite
    // (the 2-mode version already brushed the 30 s budget in earlier task
    // runs), so 3x the per-test timeout. Only the budget grows, not what's
    // asserted.
    test.slow();
    const consoleErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => consoleErrors.push(error.message));

    await page.goto("/");
    await waitForMapReady(page);

    // NEXT_PUBLIC_VWORLD_KEY is set for the whole e2e webServer (see
    // playwright.config.ts) → the segmented control renders and the layer
    // exists, fronting `deck.props.layers`, with no stored preference yet
    // (default satellite per spec §2). The Satellite jpeg requests hit the
    // fixture's `**/api.vworld.kr/**` stub (a 1×1 PNG regardless of
    // extension) — no network, no console error.
    const group = page.getByRole("radiogroup", { name: "배경 지도" });
    const radio = (name: string) => group.getByRole("radio", { name });
    await expect(group).toBeVisible();
    await expect(group.getByRole("radio")).toHaveCount(3);
    await expect(radio("위성")).toHaveAttribute("aria-checked", "true");
    await expect(radio("끄기")).toHaveAttribute("aria-checked", "false");
    await expect(radio("일반")).toHaveAttribute("aria-checked", "false");
    await expect.poll(() => basemapLayerId(page)).toBe("basemap");
    await expect.poll(() => basemapTileUrl(page)).toContain("/Satellite/");
    await expect.poll(() => washLayerPresent(page)).toBe(true);
    await expect(page.getByTestId("basemap-attribution")).toBeVisible();

    await docShot(page, "basemap-satellite");

    // 끄기: both layers disappear (null slots, not just invisible), attribution hides.
    await radio("끄기").click();
    await expect(radio("끄기")).toHaveAttribute("aria-checked", "true");
    await expect(radio("위성")).toHaveAttribute("aria-checked", "false");
    await expect.poll(() => basemapLayerId(page)).toBeNull();
    await expect.poll(() => washLayerPresent(page)).toBe(false);
    await expect(page.getByTestId("basemap-attribution")).toHaveCount(0);

    await docShot(page, "basemap-off");

    // 일반: the layer is back, now pointing at the Base (png) tile source.
    await radio("일반").click();
    await expect(radio("일반")).toHaveAttribute("aria-checked", "true");
    await expect.poll(() => basemapLayerId(page)).toBe("basemap");
    await expect.poll(() => basemapTileUrl(page)).toContain("/Base/");
    await expect.poll(() => washLayerPresent(page)).toBe(true);
    await expect(page.getByTestId("basemap-attribution")).toBeVisible();

    await docShot(page, "basemap-base");

    // Persisted: a fresh page load still reads 일반 back from localStorage.
    await page.reload();
    await waitForMapReady(page);
    await expect(radio("일반")).toHaveAttribute("aria-checked", "true");
    await expect.poll(() => basemapLayerId(page)).toBe("basemap");
    await expect.poll(() => basemapTileUrl(page)).toContain("/Base/");

    expect(consoleErrors).toEqual([]);
  });
});
