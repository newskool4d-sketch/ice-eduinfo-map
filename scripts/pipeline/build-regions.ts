// Builds public/data/regions.geojson (14 전북 시군 polygons) and
// public/data/neighbors.geojson (flat silhouettes of the 4 bordering 시도)
// from vuski/admdongkor's 읍면동 (eupmyeondong)-level national boundary file.
//
// IO and the pure geometry transforms are deliberately split (per the task
// brief): `transformRegions`/`transformNeighbors` take GeoJSON text in and
// return a FeatureCollection, with no filesystem/network access, so tests
// can exercise them directly against small fixtures. `main()` is the only
// function that touches disk or the network.
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import type { Feature, FeatureCollection, MultiPolygon, Polygon } from "geojson";
import mapshaper from "mapshaper";

import { isRegionCode, REGION_CODES, regionName } from "../../src/lib/geo/regions";
import type { Bbox, RegionFeature } from "../../src/lib/geo/geo";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");

export const SOURCE_URL =
  "https://raw.githubusercontent.com/vuski/admdongkor/master/ver20260701/HangJeongDong_ver20260701.geojson";
const RAW_PATH = path.join(ROOT, "data/raw/admdongkor-ver20260701.geojson");
const REGIONS_OUTPUT_PATH = path.join(ROOT, "public/data/regions.geojson");
const NEIGHBORS_OUTPUT_PATH = path.join(ROOT, "public/data/neighbors.geojson");
// Task 6, Section C.2 — 라벨 겹침 완화: manual per-region pixel nudges,
// hand-tuned by screenshot comparison (see task-6-report.md). Optional —
// missing entirely, or missing a given code, both just mean "[0, 0]" (see
// transformRegions's own default).
const LABEL_OFFSETS_PATH = path.join(ROOT, "data/manual/label-offsets.json");

const REGIONS_MAX_BYTES = 300 * 1024;
const NEIGHBORS_MAX_BYTES = 200 * 1024;

// admdongkor's 2-digit `sido` code for 전북특별자치도. Not to be confused
// with `PROVINCE_CODE` ('52000') in src/lib/geo/regions.ts, which is the
// 5-digit "전북 전체" aggregate row code used by the indicators pipeline.
const JB_SIDO = "52";

// Confirmed by inspecting the real source file's distinct `sido`/`sidonm`
// pairs (see task-1A-report.md): the 2026-07-01 광주+전남 통합 entity is
// sido '12' ("전남광주통합특별시"), sitting alongside 충남(44)/경북(47)/경남(48).
const NEIGHBOR_SIDO_CODES = ["44", "12", "47", "48"];

type RawRegionProps = {
  sgg_cd: string;
  bbox: Bbox;
  labelPoint: [number, number];
};

type RawNeighborProps = {
  sido: string;
  sidonm: string;
};

export type NeighborFeatureCollection = FeatureCollection<
  Polygon | MultiPolygon,
  { code: string; name: string }
>;

function round5(nums: readonly number[]): number[] {
  return nums.map((n) => Math.round(n * 1e5) / 1e5);
}

async function runMapshaper(
  commands: string[],
  inputGeojsonText: string,
): Promise<string> {
  const output = await mapshaper.applyCommands(commands.join(" "), {
    "input.geojson": inputGeojsonText,
  });
  const text = output["output.geojson"];
  if (text === undefined) {
    throw new Error("mapshaper did not produce output.geojson");
  }
  return text;
}

/** `{ [regionCode]: [dx, dy] }` pixel nudge — see data/manual/label-offsets.json. */
export type LabelOffsets = Record<string, [number, number]>;

/**
 * sido === '52' (전북) 필터 → sgg_cd(=sgg, 5211*는 52110으로 통합) 로 dissolve
 * → simplify → 미세 섬 제거 → bbox/labelPoint 계산. 14개 시군 코드표에 없는
 * 결과가 나오면(파이프라인 버그 또는 원본 데이터 변경) 즉시 실패한다.
 */
export async function transformRegions(
  inputGeojsonText: string,
  opts: { simplifyPercent?: number; minIslandAreaKm2?: number; labelOffsets?: LabelOffsets } = {},
): Promise<FeatureCollection<Polygon | MultiPolygon, RegionFeature["properties"]>> {
  const simplifyPercent = opts.simplifyPercent ?? 5;
  const minIslandAreaKm2 = opts.minIslandAreaKm2 ?? 1;
  // Task 6, Section C.2 — 라벨 겹침 완화: IO (reading the manual JSON file)
  // stays in main() below, matching this module's existing pure/IO split —
  // this function only ever reads the ALREADY-PARSED map handed to it, so
  // it stays testable against a small in-memory fixture (see
  // tests/pipeline/build-regions.test.ts).
  const labelOffsets = opts.labelOffsets ?? {};
  const outputText = await runMapshaper(
    [
      "-i input.geojson",
      `-filter "sido === '${JB_SIDO}'"`,
      // sgg (5자리 시군구 표준코드) is authoritative here — confirmed against
      // the real source that sgg === adm_cd2.slice(0,5), NOT adm_cd.slice(0,5)
      // (adm_cd, the 8-digit 통계청 code, uses an unrelated internal sequence
      // for its middle digits; see task-1A-report.md for the verification).
      '-each "sgg_cd = sgg"',
      // 전주시 완산구(52111)/덕진구(52113) → 52110 (single 전주시 region).
      `-each "sgg_cd = sgg_cd.slice(0,4) === '5211' ? '52110' : sgg_cd"`,
      "-dissolve sgg_cd",
      `-simplify ${simplifyPercent}% keep-shapes`,
      // 추가 요구 #3: drop sub-`minIslandAreaKm2` detached polygon rings (군산
      // 고군산군도/부안 미세 섬 that would otherwise render as thin spike
      // columns at any real ELEVATION_FLOOR). Placed AFTER -simplify, not
      // between -dissolve and -simplify as the task brief's plan excerpt
      // describes: empirically (see task-2-report.md), running
      // -filter-islands before -simplify has NO effect on the final output
      // here — `-simplify ... keep-shapes` independently prunes/shrinks
      // small rings via its own sub-tolerance-area sliver drop, and the
      // pre-simplify-filtered and unfiltered outputs came out byte-identical
      // when compared directly (confirmed with mapshaper@0.7.62's own
      // `-info`/message logging). Filtering AFTER simplify operates on the
      // actual shipped geometry, so `minIslandAreaKm2` means what it says
      // about the file real users load. 위도(부안, ~11.65km²) and the 5
      // largest 고군산군도 islands (1.6-6.6km², 군산) survive this threshold;
      // only sub-1km² fragments are dropped.
      `-filter-islands min-area=${minIslandAreaKm2}km2`,
      '-each "bbox=this.bounds, labelPoint=[this.innerX, this.innerY]"',
      "-o output.geojson precision=0.00001",
    ],
    inputGeojsonText,
  );

  const dissolved = JSON.parse(outputText) as FeatureCollection<
    Polygon | MultiPolygon,
    RawRegionProps
  >;

  const features: RegionFeature[] = dissolved.features.map((f) => {
    const code = String(f.properties.sgg_cd);
    if (!isRegionCode(code)) {
      throw new Error(
        `transformRegions: dissolved feature has unknown sgg_cd "${code}" ` +
          `(not one of the 14 known REGION_CODES: ${REGION_CODES.join(", ")})`,
      );
    }
    const bbox = round5(f.properties.bbox) as Bbox;
    const [lng, lat] = round5(f.properties.labelPoint);
    return {
      type: "Feature",
      geometry: f.geometry,
      properties: {
        code,
        name: regionName(code),
        bbox,
        labelPoint: [lng, lat],
        labelOffset: labelOffsets[code] ?? [0, 0],
      },
    } satisfies RegionFeature;
  });

  return { type: "FeatureCollection", features };
}

/**
 * Dissolves the 4 시도 bordering 전북 (충남/전남광주통합특별시/경북/경남) into flat
 * silhouettes, for backdrop context only (전북 itself is excluded).
 */
export async function transformNeighbors(
  inputGeojsonText: string,
  opts: { simplifyPercent?: number } = {},
): Promise<NeighborFeatureCollection> {
  const simplifyPercent = opts.simplifyPercent ?? 2;
  const filterList = NEIGHBOR_SIDO_CODES.map((c) => `'${c}'`).join(",");
  const outputText = await runMapshaper(
    [
      "-i input.geojson",
      `-filter "[${filterList}].includes(sido)"`,
      "-dissolve sido copy-fields=sidonm",
      `-simplify ${simplifyPercent}% keep-shapes`,
      "-o output.geojson precision=0.00001",
    ],
    inputGeojsonText,
  );

  const dissolved = JSON.parse(outputText) as FeatureCollection<
    Polygon | MultiPolygon,
    RawNeighborProps
  >;

  const features: Feature<Polygon | MultiPolygon, { code: string; name: string }>[] =
    dissolved.features.map((f) => ({
      type: "Feature",
      geometry: f.geometry,
      properties: { code: String(f.properties.sido), name: String(f.properties.sidonm) },
    }));

  return { type: "FeatureCollection", features };
}

async function ensureSourceDownloaded(): Promise<void> {
  if (existsSync(RAW_PATH)) {
    console.log(`[build-regions] using cached ${path.relative(ROOT, RAW_PATH)}`);
    return;
  }
  console.log(`[build-regions] downloading ${SOURCE_URL}`);
  const res = await fetch(SOURCE_URL);
  if (!res.ok) {
    throw new Error(`Failed to download admdongkor source: HTTP ${res.status} ${res.statusText}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  await mkdir(path.dirname(RAW_PATH), { recursive: true });
  await writeFile(RAW_PATH, buf);
  console.log(`[build-regions] downloaded ${buf.byteLength} bytes -> ${path.relative(ROOT, RAW_PATH)}`);
}

async function loadLabelOffsets(): Promise<LabelOffsets> {
  if (!existsSync(LABEL_OFFSETS_PATH)) return {};
  const text = await readFile(LABEL_OFFSETS_PATH, "utf8");
  return JSON.parse(text) as LabelOffsets;
}

async function main() {
  await ensureSourceDownloaded();
  const inputText = await readFile(RAW_PATH, "utf8");
  const labelOffsets = await loadLabelOffsets();
  console.log(
    `[build-regions] label-offsets.json: ${Object.keys(labelOffsets).length} region(s) configured` +
      (Object.keys(labelOffsets).length > 0 ? ` (${Object.keys(labelOffsets).join(", ")})` : ""),
  );

  const distinctSido = new Map<string, string>();
  for (const f of JSON.parse(inputText).features as Feature<
    Polygon | MultiPolygon,
    { sido: string; sidonm: string }
  >[]) {
    distinctSido.set(f.properties.sido, f.properties.sidonm);
  }
  console.log(
    `[build-regions] distinct sido in source: ${[...distinctSido.entries()]
      .map(([code, name]) => `${code}=${name}`)
      .join(", ")}`,
  );

  let regions = await transformRegions(inputText, { simplifyPercent: 5, labelOffsets });
  let regionsText = JSON.stringify(regions);
  if (Buffer.byteLength(regionsText) > REGIONS_MAX_BYTES) {
    console.log(
      `[build-regions] regions.geojson at 5% simplify is ${Buffer.byteLength(regionsText)} bytes ` +
        `(> ${REGIONS_MAX_BYTES}), retrying at 3%`,
    );
    regions = await transformRegions(inputText, { simplifyPercent: 3, labelOffsets });
    regionsText = JSON.stringify(regions);
  }
  if (regions.features.length !== REGION_CODES.length) {
    throw new Error(
      `[build-regions] expected ${REGION_CODES.length} region features, got ${regions.features.length}: ` +
        regions.features.map((f) => f.properties.code).join(", "),
    );
  }
  const regionsBytes = Buffer.byteLength(regionsText);
  if (regionsBytes > REGIONS_MAX_BYTES) {
    throw new Error(
      `[build-regions] regions.geojson is ${regionsBytes} bytes, exceeding the ${REGIONS_MAX_BYTES}-byte limit even at 3% simplify`,
    );
  }
  await mkdir(path.dirname(REGIONS_OUTPUT_PATH), { recursive: true });
  await writeFile(REGIONS_OUTPUT_PATH, regionsText);
  console.log(
    `[build-regions] wrote ${path.relative(ROOT, REGIONS_OUTPUT_PATH)}: ` +
      `${regions.features.length} features, ${regionsBytes} bytes`,
  );
  for (const f of regions.features) {
    console.log(
      `  ${f.properties.code} ${f.properties.name} bbox=[${f.properties.bbox.join(", ")}]`,
    );
  }

  const neighbors = await transformNeighbors(inputText, { simplifyPercent: 2 });
  const neighborsText = JSON.stringify(neighbors);
  const neighborsBytes = Buffer.byteLength(neighborsText);
  if (neighborsBytes > NEIGHBORS_MAX_BYTES) {
    throw new Error(
      `[build-regions] neighbors.geojson is ${neighborsBytes} bytes, exceeding the ${NEIGHBORS_MAX_BYTES}-byte limit`,
    );
  }
  await writeFile(NEIGHBORS_OUTPUT_PATH, neighborsText);
  console.log(
    `[build-regions] wrote ${path.relative(ROOT, NEIGHBORS_OUTPUT_PATH)}: ` +
      `${neighbors.features.length} features, ${neighborsBytes} bytes`,
  );
  for (const f of neighbors.features) {
    console.log(`  ${f.properties.code} ${f.properties.name}`);
  }
}

const isMainModule =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMainModule) {
  main().catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  });
}
