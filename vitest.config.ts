import path from "node:path";
import react from "@vitejs/plugin-react";
import { configDefaults, defineConfig } from "vitest/config";

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
    // Task 6, Section C.3 — removed: a project whose `include` glob
    // (accidentally, e.g. after a rename) matches zero files used to still
    // exit 0 ("빈 프로젝트가 조용히 통과하지 않도록" — silently passing is
    // worse than failing loudly here, since `npm test` gates CI).
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          environment: "node",
          include: ["tests/**/*.test.{ts,tsx}"],
          exclude: [...configDefaults.exclude, "tests/components/**"],
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
