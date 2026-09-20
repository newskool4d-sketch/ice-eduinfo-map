import { expect, test, type Page } from "@playwright/test";

async function waitForMapReady(page: Page) {
  await expect(page.locator("canvas")).toBeVisible({ timeout: 15000 });
  await expect(page.locator('[data-map-ready="true"]')).toBeAttached({ timeout: 20000 });
}

/** Reads the live `schools` ScatterplotLayer's `data.length` off the NEXT_PUBLIC_E2E-only window.__jbmap bridge (see DeckMap.tsx / e2e/select-region.spec.ts's readCamera for the same pattern). */
function readSchoolsLayerDataLength(page: Page) {
  return page.evaluate(() => {
    const deck = window.__jbmap?.deck;
    if (!deck) throw new Error("window.__jbmap not exposed — is NEXT_PUBLIC_E2E=1 set for the dev server?");
    const layers = deck.props.layers as unknown as ({ id: string; props: { data: unknown[] } } | null)[];
    const schoolsLayer = layers.find((l) => l?.id === "schools");
    if (!schoolsLayer) throw new Error('no layer with id "schools" found in deck.props.layers');
    return schoolsLayer.props.data.length;
  });
}

test.describe("학교 점", () => {
  test("무주군(?region=52730) 진입 → 패널 학교 목록과 schools 레이어 data 길이 일치 → 첫 행 클릭 시 강조", async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => consoleErrors.push(error.message));

    await page.goto("/?region=52730");
    await waitForMapReady(page);

    await expect(page.getByRole("heading", { name: "무주군" })).toBeVisible();

    const rows = page.locator('[data-testid^="school-row-"]');
    await expect(rows.first()).toBeVisible();
    const rowCount = await rows.count();
    expect(rowCount).toBeGreaterThan(10);

    const layerDataLength = await readSchoolsLayerDataLength(page);
    expect(layerDataLength).toBe(rowCount);

    // 학교급 4색 legend key appears once a 시군 is selected.
    await expect(page.getByTestId("legend-school-swatch").first()).toBeVisible();

    await page.screenshot({ path: "test-results/schools-before-highlight.png" });

    await rows.first().click();
    await expect(rows.first()).toHaveAttribute("aria-current", "true");

    // Give the school layer's 600ms getLineColor/point-highlight update a
    // moment to actually paint before the screenshot.
    await page.waitForTimeout(300);
    await page.screenshot({ path: "test-results/schools-after-highlight.png" });

    expect(consoleErrors).toEqual([]);
  });
});
