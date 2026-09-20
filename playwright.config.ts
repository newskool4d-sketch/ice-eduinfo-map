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
