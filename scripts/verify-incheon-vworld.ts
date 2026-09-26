/** Read-only Incheon source qualification. Credentials stay in the environment. */
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fetchBuildingTile } from "../src/lib/buildings/server";
import { fetchVworldPage } from "../src/lib/buildings/transport";
import type { School } from "../src/lib/schools/types";

try { process.loadEnvFile(".env.local"); } catch { /* Caller may supply the environment. */ }
const key = process.env.VWORLD_BUILDING_KEY;
if (!key) throw new Error("VWORLD_BUILDING_KEY is required; no credential was printed");
const domain = process.env.VWORLD_BUILDING_DOMAIN;
const schools: School[] = JSON.parse(fs.readFileSync("public/data/incheon/schools.json", "utf8")).schools;
const names = ["제물포고등학교", "인천운남고등학교", "인명여자고등학교", "인천연송고등학교", "인천논현고등학교", "인천상정고등학교", "서운고등학교", "인천청라고등학교", "인천아라고등학교", "강화고등학교", "대청고등학교", "백령초등학교", "연평초등학교", "덕적초등학교"];
const samples = names.map(name => {
  const school = schools.find(s => s.name === name);
  if (!school || school.lng === null || school.lat === null) throw new Error(`Sample position not present: ${name}`);
  return { name, schoolId: school.id, regionCode: school.regionCode, lng: school.lng, lat: school.lat };
});
const outputDir = "output/vworld-expansion";
fs.mkdirSync(outputDir, { recursive: true });

function coordinatesValid(value: unknown): boolean {
  if (!Array.isArray(value) || value.length === 0) return false;
  if (typeof value[0] === "number") return value.length >= 2 && Number.isFinite(value[0]) && Number.isFinite(value[1]) && Math.abs(value[0]) <= 180 && Math.abs(value[1]) <= 90;
  return value.every(coordinatesValid);
}
function errorCode(error: unknown): string {
  const message = error instanceof Error ? error.message : "unavailable";
  return /^(Building |Incomplete building|Invalid building|Repeated building|source:|geometry:)/.test(message)
    ? message.replaceAll(key!, "[redacted]").replace(/https?:\/\/\S+/g, "[upstream]").slice(0, 120)
    : error instanceof Error && error.name === "TimeoutError" ? "timeout" : "transport";
}

const rows: Record<string, unknown>[] = [];
for (const sample of samples) {
  const x = Math.floor((sample.lng + 180) / 360 * 65536);
  const y = Math.floor((1 - Math.asinh(Math.tan(sample.lat * Math.PI / 180)) / Math.PI) / 2 * 65536);
  const started = Date.now();
  try {
    const tile = await fetchBuildingTile(x, y, { key, domain });
    if (!tile.features.every(f => coordinatesValid(f.geometry.coordinates))) throw new Error("geometry:invalid coordinates");
    const heights = { provided: 0, floors: 0, missing: 0 };
    tile.features.forEach(f => heights[f.properties.heightSource]++);
    const result = { dataset: "LT_C_BLDGINFO", ...sample, x, y, count: tile.features.length, heights, complete: tile.metadata.complete, coordinatesValid: true, elapsedMs: Date.now() - started, status: "PASS" };
    rows.push(result);
    console.log(JSON.stringify(result));
  } catch (error) {
    const result = { dataset: "LT_C_BLDGINFO", ...sample, status: "BLOCKED", error: errorCode(error), elapsedMs: Date.now() - started };
    rows.push(result);
    console.log(JSON.stringify(result));
  }
}

// Names confirmed against the authenticated WMS capabilities, then checked on Data API.
const candidates = ["LT_C_UO101", "LT_C_LHBLPN", "LP_PA_CBND_BUBUN"];
for (const data of candidates) {
  for (const sample of samples) {
    const delta = 0.0008;
    const bounds = [sample.lng - delta, sample.lat - delta, sample.lng + delta, sample.lat + delta];
    const started = Date.now();
    const fields = new Set<string>();
    const classifications = new Set<string>();
    const ids = new Set<string>();
    let count = 0, total = -1, pages = 1;
    try {
      const signal = AbortSignal.timeout(10_000);
      for (let page = 1; page <= pages; page++) {
        const params = new URLSearchParams({ service: "data", request: "GetFeature", version: "2.0", data, format: "json", crs: "EPSG:4326", size: "1000", page: String(page), geometry: "true", attribute: "true", key, geomFilter: `BOX(${bounds.join(",")})` });
        if (domain) params.set("domain", domain);
        const response = await fetchVworldPage(`https://api.vworld.kr/req/data?${params}`, { signal, headers: domain ? { Referer: domain } : undefined });
        if (!response.ok) throw new Error(`source:HTTP ${response.status}`);
        const body = (await response.json()).response;
        if (body?.status === "NOT_FOUND" && page === 1) { total = 0; break; }
        if (body?.status !== "OK") throw new Error(`source:${body?.error?.code ?? "unavailable"}`);
        const features = body.result?.featureCollection?.features;
        const nextTotal = Number(body.record?.total), nextPages = Number(body.page?.total);
        if (!Number.isInteger(nextTotal) || nextTotal < 0 || !Number.isInteger(nextPages) || nextPages < 1 || nextPages > 8 || Number(body.page?.current) !== page || !Array.isArray(features) || Number(body.record?.current) !== features.length || (page > 1 && (total !== nextTotal || pages !== nextPages))) throw new Error("source:incomplete pages");
        total = nextTotal; pages = nextPages;
        for (const f of features) {
          if (!f.geometry || !["Polygon", "MultiPolygon"].includes(f.geometry.type) || !coordinatesValid(f.geometry.coordinates)) throw new Error("geometry:invalid");
          if (f.id == null || ids.has(String(f.id))) throw new Error("source:missing or duplicate ID");
          ids.add(String(f.id));
          Object.keys(f.properties ?? {}).forEach(k => fields.add(k));
          if (typeof f.properties?.uname === "string") classifications.add(f.properties.uname);
        }
        count += features.length;
      }
      if (count !== total) throw new Error("source:count mismatch");
      const result = { dataset: data, ...sample, bounds, count, fields: [...fields].sort(), classifications: [...classifications].sort(), complete: true, status: count > 0 ? "PASS" : "EMPTY", elapsedMs: Date.now() - started };
      rows.push(result);
      console.log(JSON.stringify({ dataset: data, name: sample.name, count, status: result.status }));
    } catch (error) {
      const result = { dataset: data, ...sample, bounds, status: "BLOCKED", error: errorCode(error), elapsedMs: Date.now() - started };
      rows.push(result);
      console.log(JSON.stringify(result));
      // Invalid credentials or unavailable layers are not solved by repeating other locations.
      if (/INVALID_KEY|INVALID_DOMAIN|INVALID_DATA|INVALID_PARAMETER/.test(result.error)) break;
    }
  }
}
const summary = {
  checkedAt: new Date().toISOString(), source: "https://api.vworld.kr/req/data", domain: domain ?? null,
  sourceReferenceDate: null, referenceDateNote: "Lookup time is not the upstream revision date.",
  sampleCount: samples.length, regionCount: new Set(samples.map(s => s.regionCode)).size,
  scope: "School-area samples, not full Incheon coverage certification.", rows,
};
fs.writeFileSync(path.join(outputDir, "qualification.json"), JSON.stringify(summary, null, 2) + "\n");
const hashes = fs.readdirSync("public/data/incheon", { recursive: true }).filter((p): p is string => typeof p === "string" && fs.statSync(path.join("public/data/incheon", p)).isFile()).map(file => ({ file: file.replaceAll("\\", "/"), sha256: createHash("sha256").update(fs.readFileSync(path.join("public/data/incheon", file))).digest("hex") }));
const baselinePath = path.join(outputDir, "school-data-before.json");
if (!fs.existsSync(baselinePath)) fs.writeFileSync(baselinePath, JSON.stringify(hashes, null, 2) + "\n", { flag: "wx" });
if (rows.length !== samples.length * (1 + candidates.length) || rows.some(row => row.status === "BLOCKED")) process.exitCode = 1;
