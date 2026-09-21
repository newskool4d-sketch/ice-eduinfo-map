import { test as base, expect, type Page } from "@playwright/test";

// A minimal valid 1x1 PNG (68 bytes, signature-verified) — stands in for
// every real VWorld WMTS tile response below. Real VWorld tiles are
// publicly reachable with no key validation at the CORS layer (bad keys
// return 200 + an XML ExceptionReport, not a 4xx — see task-C-brief.md's
// "검증된 사실"), but e2e should never depend on the network OR on
// `.env.local`'s real key existing in whatever environment runs this suite.
const PNG_1X1_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
const PNG_1X1 = Buffer.from(PNG_1X1_BASE64, "base64");

/**
 * Shared Playwright fixture: EVERY spec must import `test`/`expect` from
 * here (not `@playwright/test` directly) so this VWorld tile stub applies
 * uniformly. It's not just for e2e/basemap.spec.ts — `playwright.config.ts`
 * sets `NEXT_PUBLIC_VWORLD_KEY: 'e2e-test'` for the whole webServer, so the
 * 3-way basemap control (끄기 · 위성 · 일반, default 위성) renders a real
 * TileLayer, and thus fires real tile requests, on EVERY page load across
 * the whole suite. A resource load
 * failure — a real network call to api.vworld.kr racing/timing out, or any
 * non-2xx response — surfaces as a Playwright console 'error' event even
 * though `makeBasemapLayer`'s `onTileError` itself is a no-op, which would
 * break the 8 other specs' `expect(consoleErrors).toEqual([])` assertions
 * (see task-C-brief.md). Routing here, once, keeps that stub applied
 * everywhere without every spec having to remember it individually.
 */
export const test = base.extend<object>({
  page: async ({ page }, use) => {
    await page.route("**/api.vworld.kr/**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "image/png",
        headers: { "access-control-allow-origin": "*" },
        body: PNG_1X1,
      }),
    );
    // Playwright's own fixture-callback convention — this `use` is the
    // fixture-teardown callback (Playwright's `TestFixture` param), not a
    // React hook; eslint-plugin-react-hooks flags it purely because of the
    // name.
    // eslint-disable-next-line react-hooks/rules-of-hooks
    await use(page);
  },
});

export { expect };

/**
 * Diagnostic screenshot for local runs only. On CI (headless Chromium on
 * swiftshader software GL) a full-page WebGL capture costs ~10 s each —
 * trace analysis of run 35578948946 showed two of them consuming 20–22 s of
 * a test's 30 s budget, which is what actually made select-region flake
 * (not the Escape assertion). CI already keeps `screenshot: "only-on-failure"`
 * and records a trace from the first retry onward (playwright.config.ts
 * `trace: "on-first-retry"`), so nothing is lost there.
 */
export async function docShot(page: Page, name: string): Promise<void> {
  if (process.env.CI) return;
  await page.screenshot({ path: `test-results/${name}.png` });
}
