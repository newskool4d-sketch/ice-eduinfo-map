import { expect, test } from "./fixtures";

test("입체 지형은 위성지도 위에 표시되고 끌 수 있으며 확대 상한은 14다", async ({ page }) => {
  test.slow();
  await page.goto("/?region=52110");
  await expect(page.locator('[data-map-ready="true"]')).toBeAttached({ timeout: 20000 });

  const toggle = page.getByRole("button", { name: "입체 지형" });
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  const mapState = () => page.evaluate(() => {
    const deck = window.__jbmap?.deck;
    if (!deck) throw new Error("E2E deck bridge unavailable");
    const layers = deck.props.layers as unknown as ({ id: string } | null)[];
    return {
      terrain: layers.some((layer) => layer?.id === "terrain"),
      schoolDots: layers.some((layer) => layer?.id === "schools"),
      maxZoom: (deck.props.initialViewState as { maxZoom: number }).maxZoom,
    };
  });
  await expect.poll(async () => (await mapState()).terrain).toBe(true);
  expect(await mapState()).toMatchObject({ schoolDots: true, maxZoom: 14 });

  const tile = await page.request.get("/api/terrain/8/217/100.png");
  expect(tile.ok()).toBe(true);
  expect(tile.headers()["content-type"]).toContain("image/png");

  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await expect.poll(async () => (await mapState()).terrain).toBe(false);

  for (let index = 0; index < 5; index++) {
    await page.getByRole("button", { name: "확대" }).click();
  }
  await expect.poll(() => page.evaluate(() => window.__jbmap?.deck.getViewports()[0].zoom ?? 0)).toBeGreaterThan(12);
});
