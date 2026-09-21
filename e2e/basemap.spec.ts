import { expect, test } from "./fixtures";
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

test.describe("배경 지도 (VWorld midnight)", () => {
  test("기본 ON(맨 앞) → 토글 OFF → 새로고침 후에도 OFF 유지 → 다시 ON, 콘솔 error 0", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => consoleErrors.push(error.message));

    await page.goto("/");
    await waitForMapReady(page);

    // NEXT_PUBLIC_VWORLD_KEY is set for the whole e2e webServer (see
    // playwright.config.ts) → the toggle renders and the layer exists,
    // fronting `deck.props.layers`, with no stored preference yet (default
    // ON per the task brief).
    const toggle = page.getByRole("button", { name: "배경 지도" });
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAttribute("aria-pressed", "true");
    await expect.poll(() => basemapLayerId(page)).toBe("basemap");
    await expect(page.getByTestId("basemap-attribution")).toBeVisible();

    await page.screenshot({ path: "test-results/basemap-on.png" });

    // OFF: layer disappears (null, not just invisible), attribution hides.
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
    await expect.poll(() => basemapLayerId(page)).toBeNull();
    await expect(page.getByTestId("basemap-attribution")).toHaveCount(0);

    await page.screenshot({ path: "test-results/basemap-off.png" });

    // Persisted: a fresh page load still reads OFF back from localStorage.
    await page.reload();
    await waitForMapReady(page);
    await expect(page.getByRole("button", { name: "배경 지도" })).toHaveAttribute("aria-pressed", "false");
    await expect.poll(() => basemapLayerId(page)).toBeNull();

    // Back ON.
    await page.getByRole("button", { name: "배경 지도" }).click();
    await expect(page.getByRole("button", { name: "배경 지도" })).toHaveAttribute("aria-pressed", "true");
    await expect.poll(() => basemapLayerId(page)).toBe("basemap");

    expect(consoleErrors).toEqual([]);
  });
});
