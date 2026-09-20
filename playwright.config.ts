import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  // Task 6, Section D.1 — CI's own "실패 시 playwright-report/ 아티팩트
  // 업로드" step needs an actual playwright-report/ directory to exist,
  // which neither of Playwright's own DEFAULT reporters ('list' locally,
  // 'dot' on CI — chosen automatically from process.env.CI when `reporter`
  // isn't set at all) ever write to disk; `html`/`github` are both built
  // into @playwright/test itself (no new dependency). `open: "never"` stops
  // the html reporter from trying to launch a browser tab after a headless
  // CI run. Locally, keep the plain interactive `list` reporter.
  reporter: process.env.CI ? [["html", { open: "never" }], ["github"]] : "list",
  // Fix round 1/5, finding 2 — Playwright's own default `retries` is 0
  // everywhere (local AND CI; there is no built-in CI-aware default, despite
  // task-6-report.md's "우려 사항" section claiming otherwise — corrected
  // here rather than repeated). 2 retries on CI absorbs known-flaky e2e
  // timing (e.g. select-region.spec.ts's canvas-click test — see its own
  // in-file comment for the documented cause: mjolnir.js gesture recognition
  // occasionally missed under CPU contention from parallel workers, not a
  // real regression). 0 locally: a real local failure should surface
  // immediately, not be silently retried away. `workers` similarly caps CI
  // parallelism (shared-runner CPUs make that same contention worse at full
  // parallelism) while leaving local runs at Playwright's own default (all
  // available cores).
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  use: {
    baseURL: "http://localhost:3000",
  },
  webServer: {
    // CI runs the production build (matches what actually ships; also
    // avoids a cold Turbopack dev-server compile racing the test timeout —
    // see `timeout` below) via `npm run build && npm run start`; local runs
    // keep using `next dev` for fast iteration. Task 6, Section E
    // (orchestrator ruling): this supersedes Section D.1's literal
    // "`npm run build && npm run start &` then `CI=1 npm run e2e`" — using
    // Playwright's own `webServer` for both local and CI keeps exactly one
    // server-lifecycle mechanism instead of two.
    command: process.env.CI ? "npm run build && npm run start" : "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    // 120s (up from Playwright's 60s default): `next dev`'s first Turbopack
    // compile of this page (deck.gl + widgets + the whole indicator
    // registry) can exceed 60s cold, especially under CI/shared-runner CPU
    // contention — see task-6-brief.md, Section E.
    timeout: 120_000,
    // NEXT_PUBLIC_* vars are inlined into the client bundle at compile time,
    // so this only takes effect for a server Next itself starts/compiles —
    // see DeckMap.tsx's window.__jbmap bridge (e2e/select-region.spec.ts's
    // canvas-click coverage). package.json must not be modified (task
    // brief), so this is set here rather than via an npm script.
    env: { NEXT_PUBLIC_E2E: "1" },
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1600, height: 900 },
        deviceScaleFactor: 1,
        ...(process.env.CI
          ? {
              launchOptions: {
                args: ["--use-gl=angle", "--use-angle=swiftshader", "--ignore-gpu-blocklist"],
              },
            }
          : {}),
      },
    },
  ],
});
