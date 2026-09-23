import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PROFILES, resolveProfileId } from "../../src/lib/profiles";
import { pipelinePaths } from "../../scripts/pipeline/paths";

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

describe("profile selection and isolation", () => {
  it("keeps the default and selects CLI over environment explicitly", () => {
    expect(resolveProfileId([])).toBe("jeonbuk");
    expect(resolveProfileId([], "incheon", "jeonbuk")).toBe("incheon");
    expect(resolveProfileId(["--profile=incheon"], "jeonbuk")).toBe("incheon");
    for (const id of ["", "missing", "../jeonbuk", "toString"]) {
      expect(() => resolveProfileId([`--profile=${id}`])).toThrow();
    }
    expect(() => resolveProfileId(["--profile=incheon", "--profile=jeonbuk"])).toThrow();
  });

  it("isolates every Incheon data directory while preserving legacy paths", () => {
    const root = path.resolve("profile-test-root");
    const legacy = pipelinePaths(root, PROFILES.jeonbuk);
    const incheon = pipelinePaths(root, PROFILES.incheon);
    expect(legacy.publicData).toBe(path.join(root, "public/data"));
    for (const key of ["raw", "interim", "manual", "publicData"] as const) {
      expect(incheon[key]).toBe(path.join(legacy[key], "incheon"));
    }
    expect(() => pipelinePaths(root, {
      ...PROFILES.incheon, files: { ...PROFILES.incheon.files, rawDir: "../outside" },
    })).toThrow("inside the repository");
  });

  it("exposes current geography without claiming independent statistics validation", () => {
    const profile = PROFILES.incheon;
    expect(new Set(profile.regions.map((row) => row.code)).size).toBe(11);
    expect(profile.regions.some((row) => row.code === "28110")).toBe(false);
    expect(profile.boundary.geographyVersion).toBe("incheon-2026-07-01");
    expect(profile.schoolData.statisticsYear).toBe(2026);
    expect(profile.validation?.status).toBe("PARTIAL");
    expect(profile.validation?.teacherIndependentControl).toBe("not_acquired");
    expect(profile.policy.source).toBeNull();
    expect(profile.capabilities.educationIssues).toBe(false);
    expect(profile.pipelineReady).toBe(true);
  });

  it("loads only the verified Incheon assets and skips unavailable datasets", async () => {
    vi.stubEnv("NEXT_PUBLIC_EDU_MAP_PROFILE", "incheon");
    vi.resetModules();
    const { readFile } = await import("node:fs/promises");
    const { loadBundle, assertBundle } = await import("../../src/lib/data/load");
    const fetchImpl = vi.fn(async (url: string) => {
      expect(url.startsWith("/data/incheon/")).toBe(true);
      return new Response(await readFile(path.join(process.cwd(), "public", url), "utf8"));
    });
    const bundle = await loadBundle(fetchImpl);
    assertBundle(bundle);
    expect(bundle.schools.schools).toHaveLength(562);
    expect(Object.keys(bundle.indicators)).toHaveLength(8);
    expect(bundle.closedSchools).toBeNull();
    expect(bundle.series).toEqual({});
    expect(bundle.neighbors.features).toEqual([]);
    expect(fetchImpl).toHaveBeenCalledTimes(13);
    expect(bundle.incheonHistory?.years).toEqual([2022, 2023, 2024, 2025, 2026]);
    expect(fetchImpl).toHaveBeenCalledWith("/data/incheon/history.json", { cache: "no-store" });
    const { fitOverview } = await import("../../src/components/map/camera");
    const { unionBbox } = await import("../../src/lib/geo/geo");
    const { WebMercatorViewport } = await import("@deck.gl/core");
    const bbox = unionBbox(bundle.regions.features);
    for (const size of [{ width: 1080, height: 912 }, { width: 390, height: 708 }]) {
      const view = fitOverview(bbox, bundle.regions.features.map(f => f.properties.labelPoint), size, "road");
      const viewport = new WebMercatorViewport({ ...size, ...view });
      for (const point of [[bbox[0], bbox[1]], [bbox[2], bbox[3]]]) {
        const [x, y] = viewport.project(point);
        expect(x).toBeGreaterThanOrEqual(59);
        expect(x).toBeLessThanOrEqual(size.width - 59);
        expect(y).toBeGreaterThanOrEqual(59);
        expect(y).toBeLessThanOrEqual(size.height - 59);
      }
    }

    const { mapQueryParsers, MAP_VIEWS } = await import("../../src/lib/state/urlState");
    expect(MAP_VIEWS).toEqual(["schools", "statistics"]);
    expect(mapQueryParsers.indicator.parse("closed_schools")).toBeNull();
    expect(mapQueryParsers.view.parse("issues")).toBeNull();
    expect(mapQueryParsers.region.parse("28125")).toBe("28125");
  // This integration check loads the published dataset and deck.gl after a
  // module reset; cold imports can exceed 5 seconds during the full suite.
  }, 15_000);
});
