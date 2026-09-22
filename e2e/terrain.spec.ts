import { expect, test } from "./fixtures";

test("선택 학교와 검색 조건은 입체 전환 후에도 유지되고 지형을 제거할 수 있다", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("searchbox", { name: "학교명 검색" })
    .fill("전주초등학교");
  const row = page.locator('[data-testid^="school-row-"]').first();
  await row.click();
  await expect
    .poll(() =>
      page.evaluate(() => window.__jbmap?.deck.getViewports()[0].zoom),
    )
    .toBeCloseTo(15, 2);
  await page.getByRole("radio", { name: "입체 위성" }).click();
  await expect
    .poll(() =>
      page.evaluate(() => window.__jbmap?.deck.getViewports()[0].zoom),
    )
    .toBeCloseTo(14, 2);
  await expect(row).toHaveAttribute("aria-current", "true");
  const hasTerrain = () =>
    page.evaluate(() =>
      (window.__jbmap!.deck.props.layers as ({ id: string } | null)[]).some(
        (l) => l?.id === "terrain",
      ),
    );
  await expect.poll(hasTerrain).toBe(true);
  await page.getByRole("radio", { name: "평면 지도" }).click();
  await expect.poll(hasTerrain).toBe(false);
  await page.getByRole("button", { name: "확대", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(() => window.__jbmap?.deck.getViewports()[0].zoom),
    )
    .toBeCloseTo(15, 2);
  await expect(
    page.getByRole("searchbox", { name: "학교명 검색" }),
  ).toHaveValue("전주초등학교");
});
