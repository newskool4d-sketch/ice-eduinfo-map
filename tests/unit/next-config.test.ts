import { describe, expect, it } from "vitest";

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
  it("serves /data/manifest.json with Cache-Control: no-cache, must-revalidate", async () => {
    const entries = await nextConfig.headers!();
    const manifestEntry = entries.find((e) => e.source === "/data/manifest.json");
    expect(manifestEntry).toBeTruthy();
    const cacheControl = manifestEntry!.headers.find((h) => h.key === "Cache-Control")?.value;
    expect(cacheControl).toBe("no-cache, must-revalidate");
  });

  it("keeps the 1h stale-while-revalidate policy for the rest of /data/*, with the more specific manifest.json entry ordered AFTER the wildcard (Next.js resolves same-key header collisions last-entry-wins)", async () => {
    const entries = await nextConfig.headers!();

    const wildcardEntry = entries.find((e) => e.source === "/data/:path*");
    expect(wildcardEntry).toBeTruthy();
    const wildcardCacheControl = wildcardEntry!.headers.find((h) => h.key === "Cache-Control")?.value;
    expect(wildcardCacheControl).toBe("public, max-age=3600, stale-while-revalidate=86400");

    const wildcardIndex = entries.findIndex((e) => e.source === "/data/:path*");
    const manifestIndex = entries.findIndex((e) => e.source === "/data/manifest.json");
    expect(manifestIndex).toBeGreaterThan(wildcardIndex);
  });
});
