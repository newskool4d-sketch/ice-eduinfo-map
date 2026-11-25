import { describe, expect, it } from "vitest";
import { unstable_getResponseFromNextConfig } from "next/experimental/testing/server";

import nextConfig, { contentSecurityPolicy } from "../../next.config";

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
    expect(response.headers.get("Cache-Control")).toBe("public, max-age=600, stale-while-revalidate=3600");
  });

  it.each(["/", "/about", "/api/buildings/v1/16/55850/25390", "/data/incheon/manifest.json"])("sends the policy and forbids framing on %s", async (pathname) => {
    const response = await unstable_getResponseFromNextConfig({ url: `https://example.test${pathname}`, nextConfig });
    const policy = response.headers.get("Content-Security-Policy") ?? "";
    expect(policy.split("; ")).toEqual(expect.arrayContaining(["default-src 'self'", "object-src 'none'", "base-uri 'self'", "frame-ancestors 'none'"]));
    expect(response.headers.get("X-Frame-Options")).toBe("DENY");
  });
});

describe("contentSecurityPolicy()", () => {
  const directive = (policy: string, name: string) => policy.split("; ").find((part) => part.startsWith(`${name} `));

  it("allows eval only for the dev server", () => {
    expect(directive(contentSecurityPolicy(false), "script-src")).toBe("script-src 'self' 'unsafe-inline'");
    expect(directive(contentSecurityPolicy(true), "script-src")).toBe("script-src 'self' 'unsafe-inline' 'unsafe-eval'");
  });

  it("names VWorld as the only outside origin", () => {
    const origins = contentSecurityPolicy(false).match(/https?:\/\/[^\s;]+/g) ?? [];
    expect([...new Set(origins)]).toEqual(["https://api.vworld.kr"]);
  });
});
