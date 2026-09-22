import { expect, test } from "./fixtures";

// Task 6, Section A.1 — MapShell shows MapFallback's table instead of the 3D
// map when `document.createElement('canvas').getContext('webgl2')` fails.
//
// `--disable-webgl`/`--disable-webgl2` are real Chromium launch flags that
// make every `getContext('webgl'|'webgl2')` call return null. `launchOptions`
// can only be set via `test.use()` at a spec FILE's top level (Playwright:
// "Cannot use({ launchOptions }) in a describe group, because it forces a
// new worker. Make it top-level in the test file or put in the configuration
// file.") — confirmed empirically while writing this spec — hence this is
// its own file rather than a `describe` block inside e2e/fallback-viewport.spec.ts.
// This REPLACES (not merges with) the CI-only swiftshader args
// playwright.config.ts's `chromium` project otherwise sets, which is exactly
// what's wanted here: WebGL genuinely unavailable, not software-rendered.
test.use({ launchOptions: { args: ["--disable-webgl", "--disable-webgl2"] } });

test("WebGL2 컨텍스트를 생성할 수 없으면 지도 대신 표를 보여준다", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));

  await page.goto("/");

  // Confirms the launch flag actually took effect, independent of this
  // app's own MapShell logic — if this assertion ever fails, the flag
  // stopped working in a newer Chromium and the test below would otherwise
  // fail for a confusing, unrelated reason.
  const webgl2Available = await page.evaluate(() => !!document.createElement("canvas").getContext("webgl2"));
  expect(webgl2Available).toBe(false);

  await expect(page.getByTestId("map-fallback-reason")).toHaveText(
    "이 환경에서는 지도를 표시할 수 없어 표로 보여드립니다",
  );
  await expect(page.getByRole("table")).toBeVisible();
  // The deck.gl canvas is never even attempted.
  await expect(page.locator("canvas")).toHaveCount(0);

  expect(consoleErrors).toEqual([]);
});
