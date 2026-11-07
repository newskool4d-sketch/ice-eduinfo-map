import path from "node:path";
import { readFile } from "node:fs/promises";
import { afterEach, describe, expect, it, vi } from "vitest";

// ACTIVE_PROFILE is fixed at module load, so the whole suite cannot simply run
// under Incheon (it carries Jeonbuk fixtures). Each test here stubs the env,
// resets the module graph and imports fresh — same pattern as profiles.test.ts,
// which already covers the happy-path loadBundle on the real package.
// Code review round 3: failure paths and Incheon wording.
afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); vi.restoreAllMocks(); });

async function incheon() {
  vi.stubEnv("NEXT_PUBLIC_EDU_MAP_PROFILE", "incheon");
  vi.resetModules();
}
const fromDisk = (override?: (url: string) => Response | undefined) => vi.fn(async (url: string) =>
  override?.(url) ?? new Response(await readFile(path.join(process.cwd(), "public", url), "utf8")));

describe("Incheon profile failure paths and wording", () => {
  it("hides only the trends panel when history.json fails", async () => {
    await incheon();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { loadBundle, assertBundle } = await import("../../src/lib/data/load");
    const bundle = await loadBundle(fromDisk((url) => url.endsWith("/history.json") ? new Response("", { status: 404 }) : undefined));
    assertBundle(bundle);
    expect(bundle.incheonHistory).toBeUndefined();
    expect(bundle.schools.schools.length).toBeGreaterThan(0);
  });

  it("shows the temporary message, not developer detail, for a stale manifest", async () => {
    await incheon();
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { loadBundle } = await import("../../src/lib/data/load");
    const stale = fromDisk((url) => {
      if (!url.endsWith("/manifest.json")) return undefined;
      return new Response(JSON.stringify({ indicators: { students_total: {} } }));
    });
    await expect(loadBundle(stale)).rejects.toThrow("데이터가 갱신 중입니다. 잠시 후 새로고침해 주세요.");
    expect(String(error.mock.calls[0]?.[0])).toContain("manifest.json 에 없는 지표");
  });

  it("uses 군·구 in the selection announcement and region-metric note", async () => {
    await incheon();
    const { REGION_UNIT, REGION_CODES } = await import("../../src/lib/geo/regions");
    const { selectionAnnouncement } = await import("../../src/lib/selection");
    expect(REGION_UNIT).toBe("군·구");
    expect(selectionAnnouncement({ name: "연수구", label: "학생수", valueText: "1명", rank: 1, total: REGION_CODES.length }))
      .toBe("연수구 선택됨, 학생수 1명, 11개 군·구 중 1위");

    const { loadBundle } = await import("../../src/lib/data/load");
    const { buildMapMetric } = await import("../../src/lib/mapMetrics");
    const bundle = await loadBundle(fromDisk());
    // small_school_share has no per-school chart metric, so it renders as a region metric.
    const metric = buildMapMetric(bundle, "small_school_share", null, null);
    expect(metric.kind).toBe("region");
    expect(metric.note).toContain("군·구 전체 집계");
    expect(metric.note).not.toContain("시군");
  });
});
