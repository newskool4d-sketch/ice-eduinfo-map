import { describe, expect, it } from "vitest";
import { unstable_getResponseFromNextConfig } from "next/experimental/testing/server";

import nextConfig from "../../next.config";

/**
 * Fix round 2, finding 3 — public/data/** is cached for 1h
 * (stale-while-revalidate 86400) at the CDN/browser level, but load.ts
 * hard-throws when a registry indicator id is missing from manifest.json.
 * After a data-refresh deploy, a returning visitor can get a fresh JS
 * bundle (new registry ids) paired with a stale cached manifest.json for up
 * to an hour, hitting that error needlessly. manifest.json itself must be
 * revalidated on every load instead.
 */
describe("next.config headers()", () => {
  it.each(["/data/manifest.json", "/data/incheon/manifest.json"])("revalidates %s after applying all matching header rules", async (pathname) => {
    const response = await unstable_getResponseFromNextConfig({
      url: `https://example.test${pathname}`,
      nextConfig,
    });
    expect(response.headers.get("Cache-Control")).toBe("no-cache, must-revalidate");
  });

  it.each(["/data/regions.geojson", "/data/incheon/regions.geojson", "/data/incheon/indicators/students_total.json"])("preserves the data cache policy for %s", async (pathname) => {
    const response = await unstable_getResponseFromNextConfig({
      url: `https://example.test${pathname}`,
      nextConfig,
    });
    expect(response.headers.get("Cache-Control")).toBe("public, max-age=3600, stale-while-revalidate=86400");
  });
});
