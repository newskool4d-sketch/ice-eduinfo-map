import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// NOTE: vitest 5 removed `test.environmentMatchGlobs` (deprecated since v3).
// The per-directory environment routing it used to provide is reproduced
// below with `test.projects`, which is the supported replacement: each
// project sets its own `environment` and `include` glob, and inherits the
// shared plugin/alias/setupFiles config from this root file via
// `extends: true`.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    setupFiles: ["tests/setup.ts"],
    passWithNoTests: true,
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          environment: "node",
          include: ["tests/unit/**/*.test.{ts,tsx}"],
        },
      },
      {
        extends: true,
        test: {
          name: "components",
          environment: "jsdom",
          include: ["tests/components/**/*.test.{ts,tsx}"],
        },
      },
    ],
  },
});
