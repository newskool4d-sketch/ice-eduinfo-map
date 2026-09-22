import type { School } from "../../../src/lib/schools/types";
import { regionCodeFromAddress } from "./schools";

export interface VerifiedSchoolLocation {
  kediCode: string;
  name: string;
  regionCode: string;
  lat: number;
  lng: number;
  locationSource: NonNullable<School["locationSource"]>;
}

/** Supplements only missing coordinates; identity/source drift must be reviewed. */
export function supplementSchoolLocations(
  schools: School[],
  locations: VerifiedSchoolLocation[],
): School[] {
  const result = schools.map((school) => ({ ...school }));
  const seen = new Set<string>();
  for (const location of locations) {
    const { kediCode, name, regionCode, lat, lng, locationSource } = location;
    const matches = result.filter((school) => school.kediCode === kediCode);
    if (seen.has(kediCode) || matches.length !== 1) throw new Error(`위치 보완 식별자 오류: ${kediCode}`);
    seen.add(kediCode);
    const school = matches[0];
    if (school.name !== name || school.regionCode !== regionCode || school.level !== "special" ||
        regionCodeFromAddress(locationSource.address) !== regionCode) {
      throw new Error(`위치 보완 학교/주소 불일치: ${name}`);
    }
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < 35 || lat > 36.3 || lng < 125.5 || lng > 128) {
      throw new Error(`위치 보완 좌표 오류: ${name}`);
    }
    if (!locationSource.url.startsWith("https://school.jbedu.kr/") ||
        !/^\d{4}-\d{2}-\d{2}$/.test(locationSource.verifiedAt) || !locationSource.method) {
      throw new Error(`위치 보완 출처 오류: ${name}`);
    }
    if (school.lat !== null || school.lng !== null) throw new Error(`기존 위치와 보완 자료 재검토 필요: ${name}`);
    school.lat = lat;
    school.lng = lng;
    school.locationSource = locationSource;
    delete school.locationMissingReason;
  }
  return result;
}
