// Canonical 시군 code/name table for 전북특별자치도 (Jeonbuk).
//
// This is the single source of truth for the 14 시군 (city/county) codes and
// their display names. Both the boundary pipeline (scripts/pipeline/build-regions.ts,
// via a relative import) and the deck.gl scene (src/components/map/**) depend on
// this file so the two never drift apart.
//
// `PROVINCE_CODE` ('52000') is the aggregate "전북 전체" row code used by the
// indicators pipeline (Task 1B) — it is NOT one of the 14 시군 codes and is
// deliberately excluded from `REGIONS`/`REGION_CODES`/`isRegionCode`.
export const PROVINCE_CODE = "52000";

export const REGIONS = [
  { code: "52110", name: "전주시" },
  { code: "52130", name: "군산시" },
  { code: "52140", name: "익산시" },
  { code: "52180", name: "정읍시" },
  { code: "52190", name: "남원시" },
  { code: "52210", name: "김제시" },
  { code: "52710", name: "완주군" },
  { code: "52720", name: "진안군" },
  { code: "52730", name: "무주군" },
  { code: "52740", name: "장수군" },
  { code: "52750", name: "임실군" },
  { code: "52770", name: "순창군" },
  { code: "52790", name: "고창군" },
  { code: "52800", name: "부안군" },
] as const;

export type RegionCode = (typeof REGIONS)[number]["code"];

export const REGION_CODES: RegionCode[] = REGIONS.map((r) => r.code);

const NAME_BY_CODE: ReadonlyMap<string, string> = new Map(
  REGIONS.map((r) => [r.code, r.name]),
);

/** Type guard: narrows an arbitrary string (e.g. from parsed GeoJSON/JSON) to a known `RegionCode`. */
export function isRegionCode(code: string): code is RegionCode {
  return NAME_BY_CODE.has(code);
}

/** Looks up the Korean display name for a known region code. Throws on an unknown code. */
export function regionName(code: RegionCode): string {
  const name = NAME_BY_CODE.get(code);
  if (name === undefined) {
    throw new Error(`Unknown region code: ${code}`);
  }
  return name;
}
