import { docShot, expect, test } from "./fixtures";
import type { Page } from "@playwright/test";

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

/**
 * Task D, fix round 1 — reads the live `deck.props.layers` array's INDEX of
 * both label layer ids, reusing the exact same `window.__jbmap` bridge as
 * `readSchoolsLayerDataLength` above (no new harness). Locks in the review
 * fix: `school-labels` must be pushed BEFORE `region-labels` in DeckMap.tsx
 * so a region's own name chip (e.g. "전주시 70,444") always paints on top of
 * ordinary school-name chips, not the other way around — see
 * DeckMap.tsx's `layerList.push(makeSchoolLabelsLayer(...), makeRegionLabelLayer(...))`
 * comment for the full reasoning (paint order + a shared-collision-FBO
 * same-picking-color-index edge case, now that both layers share
 * `collisionGroup: 'labels'` — schoolLayers.ts).
 */
function readLabelLayerIndices(page: Page) {
  return page.evaluate(() => {
    const deck = window.__jbmap?.deck;
    if (!deck) throw new Error("window.__jbmap not exposed — is NEXT_PUBLIC_E2E=1 set for the dev server?");
    const layers = deck.props.layers as unknown as ({ id: string } | null)[];
    return {
      schoolLabels: layers.findIndex((l) => l?.id === "school-labels"),
      regionLabels: layers.findIndex((l) => l?.id === "region-labels"),
    };
  });
}

test.describe("학교 점", () => {
  test("무주군(?region=52730) 진입 → 전체 학교 점 표시 → 첫 행 클릭 시 강조", async ({
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
    const positionedSchoolCount = await page.evaluate(async () => {
      const data = await fetch("/data/schools.json").then((response) => response.json());
      return data.schools.filter((school: { lat: number | null; lng: number | null }) => school.lat !== null && school.lng !== null).length;
    });
    expect(layerDataLength).toBe(positionedSchoolCount);
    expect(layerDataLength).toBeGreaterThan(rowCount);

    // 학교급 4색 legend key appears once a 시군 is selected.
    await expect(page.getByTestId("legend-school-swatch").first()).toBeVisible();

    await docShot(page, "schools-before-highlight");

    await rows.first().click();
    await expect(rows.first()).toHaveAttribute("aria-current", "true");

    // The school layer's highlight (highlightedObjectIndex/highlightColor)
    // is an instant picking-based recolor, not an animated transition — this
    // pause is just a generous margin for the frame to actually paint
    // before the screenshot, not a wait on any particular duration.
    await page.waitForTimeout(300);
    await docShot(page, "schools-after-highlight");

    expect(consoleErrors).toEqual([]);
  });

  test("학교 이름은 지도를 확대해도 11px로 유지된다", async ({ page }) => {
    await page.goto("/?region=52110");
    await waitForMapReady(page);
    await expect(page.locator('[data-labels-ready="true"]')).toBeAttached({ timeout: 20000 });

    const labelStyle = () => page.evaluate(() => {
      const layers = window.__jbmap?.deck.props.layers as unknown as
        ({ id: string; props: { sizeUnits: string; getSize: number } } | null)[];
      const layer = layers.find((item) => item?.id === "school-labels");
      if (!layer) throw new Error("school-labels layer missing");
      return { units: layer.props.sizeUnits, size: layer.props.getSize };
    });

    expect(await labelStyle()).toEqual({ units: "pixels", size: 11 });
    await page.getByRole("button", { name: "확대" }).click();
    expect(await labelStyle()).toEqual({ units: "pixels", size: 11 });
  });

  // Task D, fix round 1 — regression test for the review finding: a region's
  // own chip (e.g. "전주시 70,444") was being painted over by ordinary
  // school-name chips. `region-labels` must be pushed strictly after
  // `school-labels` in DeckMap.tsx's layers array.
  test("school-labels is pushed before region-labels (전주시 chip must paint on top of school chips)", async ({
    page,
  }) => {
    await page.goto("/?region=52110");
    await waitForMapReady(page);
    // Both label layers only enter DeckMap's layers array once the font gate
    // opens (`fontReady`), which is decoupled from `data-map-ready` — same
    // wait as e2e/select-region.spec.ts / smoke.spec.ts use before reading
    // font-gated layers.
    await expect(page.locator('[data-labels-ready="true"]')).toBeAttached({ timeout: 20000 });
    await expect(page.getByRole("heading", { name: "전주시" })).toBeVisible();

    const { schoolLabels, regionLabels } = await readLabelLayerIndices(page);
    expect(schoolLabels).toBeGreaterThanOrEqual(0);
    expect(regionLabels).toBeGreaterThanOrEqual(0);
    expect(regionLabels).toBeGreaterThan(schoolLabels);
  });
});
