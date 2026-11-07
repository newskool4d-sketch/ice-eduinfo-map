import { ACTIVE_PROFILE } from "../profiles";

/** Administrative areas for the selected provincial profile. */
export const PROVINCE_CODE = ACTIVE_PROFILE.province.aggregateCode;
export const REGIONS = ACTIVE_PROFILE.regions;
/** UI word for one map region ("시군" for Jeonbuk, "군·구" for Incheon). */
export const REGION_UNIT = ACTIVE_PROFILE.regionUnit ?? "시군";
/** REGION_UNIT with its object particle: "시군을" / "군·구를". */
export const REGION_UNIT_OBJECT = `${REGION_UNIT}${/[가-힣]$/.test(REGION_UNIT) && (REGION_UNIT.charCodeAt(REGION_UNIT.length - 1) - 0xac00) % 28 !== 0 ? "을" : "를"}`;
export type RegionCode = string;
export const REGION_CODES: RegionCode[] = REGIONS.map((region) => region.code);
const NAME_BY_CODE = new Map(REGIONS.map((region) => [region.code, region.name]));

export function isRegionCode(code: string): code is RegionCode {
  return NAME_BY_CODE.has(code);
}

export function regionName(code: RegionCode): string {
  const name = NAME_BY_CODE.get(code);
  if (!name) throw new Error(`Unknown region code: ${code}`);
  return name;
}
