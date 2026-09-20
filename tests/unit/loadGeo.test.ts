import { afterEach, describe, expect, it, vi } from "vitest";

import { loadGeo } from "@/components/map/loadGeo";

const REGIONS_FC = { type: "FeatureCollection", features: [{ type: "Feature", properties: { code: "52110" } }] };
const NEIGHBORS_FC = { type: "FeatureCollection", features: [] };
const CHARSET = "ab가나";

function jsonResponse(body: unknown, ok = true) {
  return {
    ok,
    status: ok ? 200 : 404,
    json: async () => body,
  } as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("loadGeo", () => {
  it("fetches regions/neighbors/charset in parallel and splits charset into characters", async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        calls.push(url);
        if (url === "/data/regions.geojson") return jsonResponse(REGIONS_FC);
        if (url === "/data/neighbors.geojson") return jsonResponse(NEIGHBORS_FC);
        if (url === "/data/charset.json") return jsonResponse(CHARSET);
        throw new Error(`unexpected url ${url}`);
      }),
    );

    const result = await loadGeo();

    expect(result.regions).toEqual(REGIONS_FC);
    expect(result.neighbors).toEqual(NEIGHBORS_FC);
    expect(result.charset).toEqual(["a", "b", "가", "나"]);
    expect(new Set(calls)).toEqual(
      new Set(["/data/regions.geojson", "/data/neighbors.geojson", "/data/charset.json"]),
    );
  });

  it("throws when any request fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url === "/data/regions.geojson") return jsonResponse(null, false);
        if (url === "/data/neighbors.geojson") return jsonResponse(NEIGHBORS_FC);
        return jsonResponse(CHARSET);
      }),
    );

    await expect(loadGeo()).rejects.toThrow();
  });
});
