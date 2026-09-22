import { ACTIVE_PROFILE } from "../profiles";

/** Administrative areas for the selected provincial profile. */
export const PROVINCE_CODE = ACTIVE_PROFILE.province.aggregateCode;
export const REGIONS = ACTIVE_PROFILE.regions;
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
