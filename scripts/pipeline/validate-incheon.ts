/**
 * Consistency gate for the committed Incheon data package (public/data/incheon).
 * validate.ts carries Jeonbuk official figures and cannot run for this profile, so
 * CI runs this script with NEXT_PUBLIC_EDU_MAP_PROFILE=incheon instead.
 * Checks the files against the profile, the indicator registry and the shapes
 * load.ts/assertBundle/IncheonTrends actually dereference. No network access.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";
import { ACTIVE_PROFILE } from "../../src/lib/profiles";
import { INDICATORS } from "../../src/lib/indicators/registry";
import { HISTORY_YEARS, type IncheonHistory } from "../../src/lib/data/incheonHistory";
import type { IndicatorFile, Manifest } from "../../src/lib/indicators/types";
import type { SchoolsFile } from "../../src/lib/schools/types";

if (ACTIVE_PROFILE.id !== "incheon") throw new Error("Run with --profile=incheon (or NEXT_PUBLIC_EDU_MAP_PROFILE=incheon)");
const root = path.resolve(import.meta.dirname, "../..");
const dir = path.join(root, ACTIVE_PROFILE.files.publicDataDir);
const read = async <T>(name: string): Promise<T> => JSON.parse(await readFile(path.join(dir, name), "utf8")) as T;
const problems: string[] = [];
const fail = (message: string) => problems.push(message);

const codes = ACTIVE_PROFILE.regions.map((region) => region.code);
const province = ACTIVE_PROFILE.province.aggregateCode;

// (1) regions.geojson: one feature per profile region, same codes and names.
const regions = await read<FeatureCollection<Polygon | MultiPolygon, { code: string; name: string }>>("regions.geojson");
const featureByCode = new Map(regions.features.map((feature) => [feature.properties.code, feature.properties.name]));
if (regions.features.length !== codes.length) fail(`regions.geojson has ${regions.features.length} features, expected ${codes.length}`);
for (const region of ACTIVE_PROFILE.regions) {
  if (featureByCode.get(region.code) !== region.name) fail(`regions.geojson ${region.code}: name ${featureByCode.get(region.code) ?? "(missing)"} != profile ${region.name}`);
}

// (2) manifest.json: indicators and capabilities must match the registry/profile the app was built with.
const manifest = await read<Manifest & { profileId?: string; capabilities?: Record<string, boolean>; history?: { years: number[]; file: string } }>("manifest.json");
if (manifest.profileId !== "incheon") fail(`manifest.profileId is ${manifest.profileId}`);
const registryIds = INDICATORS.map((definition) => definition.id);
for (const id of registryIds) if (!(id in manifest.indicators)) fail(`manifest.indicators is missing registry id ${id}`);
for (const id of Object.keys(manifest.indicators)) if (!registryIds.includes(id)) fail(`manifest.indicators has ${id}, which is not in the incheon registry`);
for (const [name, enabled] of Object.entries(ACTIVE_PROFILE.capabilities)) {
  if (manifest.capabilities?.[name] !== enabled) fail(`manifest.capabilities.${name} = ${manifest.capabilities?.[name]} != profile ${enabled}`);
}

// (3) indicators/<id>.json: every file load.ts fetches exists, has base rows for all regions + aggregate,
//     and count aggregates equal the sum of the regions.
const schools = await read<SchoolsFile>("schools.json");
for (const definition of INDICATORS) {
  let file: IndicatorFile;
  try { file = await read<IndicatorFile>(`indicators/${definition.id}.json`); } catch { fail(`indicators/${definition.id}.json is missing or invalid JSON`); continue; }
  if (file.id !== definition.id) fail(`indicators/${definition.id}.json has id ${file.id}`);
  const base = new Map(file.rows.filter((row) => row.level === undefined).map((row) => [row.regionCode, row.value]));
  for (const code of [...codes, province]) if (!base.has(code)) fail(`indicators/${definition.id}.json has no base row for ${code}`);
  for (const row of file.rows) {
    if (row.regionCode !== province && !codes.includes(row.regionCode)) fail(`indicators/${definition.id}.json row for unknown region ${row.regionCode}`);
    if (row.value !== null && (!Number.isFinite(row.value) || row.value < 0)) fail(`indicators/${definition.id}.json ${row.regionCode}/${row.level ?? "base"} value ${row.value}`);
  }
  if (definition.kind === "count") {
    const sum = codes.reduce((total, code) => total + (base.get(code) ?? 0), 0);
    if (base.get(province) !== sum) fail(`indicators/${definition.id}.json ${province} = ${base.get(province)} != sum of regions ${sum}`);
  }
}

// (4) schools.json: ids unique, regions valid, coordinates inside the profile bounds.
const [west, south, east, north] = ACTIVE_PROFILE.buildings?.bounds ?? [-180, -90, 180, 90];
const ids = new Set<string>();
for (const school of schools.schools) {
  if (ids.has(school.id)) fail(`schools.json duplicate id ${school.id}`);
  ids.add(school.id);
  if (!codes.includes(school.regionCode)) fail(`schools.json ${school.name} has regionCode ${school.regionCode}`);
  if (school.lat == null || school.lng == null) fail(`schools.json ${school.name} has no coordinates`);
  else if (school.lat < south || school.lat > north || school.lng < west || school.lng > east) fail(`schools.json ${school.name} is outside the profile bounds (${school.lng}, ${school.lat})`);
}
if (schools.schools.length === 0) fail("schools.json has 0 schools");
const studentsFile = await read<IndicatorFile>("indicators/students_total.json").catch(() => null);
const studentSum = schools.schools.reduce((total, school) => total + (school.students ?? 0), 0);
const studentAggregate = studentsFile?.rows.find((row) => row.regionCode === province && row.level === undefined)?.value;
if (studentsFile && studentAggregate !== studentSum) fail(`students_total ${province} = ${studentAggregate} != sum over schools.json ${studentSum}`);

// (5) history.json: the years IncheonTrends renders, province points for every year, region keys present.
const history = await read<IncheonHistory>("history.json");
if (JSON.stringify(history.years) !== JSON.stringify(HISTORY_YEARS)) fail(`history.years ${JSON.stringify(history.years)} != ${JSON.stringify(HISTORY_YEARS)}`);
if (history.province.map((point) => point.year).join() !== history.years.join()) fail("history.province does not cover every year");
if (Object.keys(history.regions).length === 0) fail("history.regions is empty");
for (const [name, points] of Object.entries(history.regions)) {
  if (points.map((point) => point.year).join() !== history.years.join()) fail(`history.regions[${name}] does not cover every year`);
}
if (manifest.history?.file !== "history.json" || manifest.history.years.join() !== history.years.join()) fail("manifest.history does not describe history.json");

// (6) charset.json must contain every character the map draws as region or school labels.
const charset = new Set(Array.from(await read<string>("charset.json")));
const labelText = [...ACTIVE_PROFILE.regions.map((region) => region.name), ...schools.schools.map((school) => school.name)].join("");
const missing = [...new Set(Array.from(labelText))].filter((char) => !charset.has(char));
if (missing.length > 0) fail(`charset.json is missing ${missing.length} label character(s): ${missing.slice(0, 20).join("")}`);

if (problems.length > 0) {
  console.error(`validate-incheon: ${problems.length} problem(s)\n- ${problems.join("\n- ")}`);
  process.exit(1);
}
console.log(`validate-incheon: PASS (${regions.features.length} regions, ${registryIds.length} indicators, ${schools.schools.length} schools, history ${history.years[0]}–${history.years.at(-1)})`);
