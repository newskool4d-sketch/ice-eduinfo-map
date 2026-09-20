import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  use: {
    baseURL: "http://localhost:3000",
  },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
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
