import type { School } from "../../../src/lib/schools/types";
import type { IndicatorFile, IndicatorRow, SchoolLevel } from "../../../src/lib/indicators/types";
import { incheonProfile } from "../../../src/lib/profiles/incheon";

export interface Observation {
  schoolId: string; name: string; level: string; sourceRegion: string; address: string;
  campus: string; status: string; schoolCountFlag: number; students: number;
  teachers: number; classes: number; sourceRow: number; studentCell: string;
}
export interface LocationLink {
  schoolId: string; name: string; level: string; campus: string; locationId: string;
  latitude: number; longitude: number; uniqueCurrentSgg: string;
  identityVerified: boolean; finiteRangeVerified: boolean; regionResolutionVerified: boolean;
  pointStatus: string; method: string; historicalCoordinateStatus: string;
  source: { id: string; url?: string; sha256?: string; coordinateReferenceDate: string | null };
  evidence: { kessRow: number; kessAddress: string; officialAddress?: string; currentRegionResolution?: unknown };
}
export interface IncheonSchool extends School {
  sourceRegionName: string; sourceAddress: string; sourceCampusType: string;
  sourceAreaType: string; areaType: "metropolitan" | "special" | "myeon";
  schoolCountFlag: number; statisticsDate: string; geographyDate: string;
  provenance: { kessRow: number; studentCell: string; locationId: string; locationSourceId: string;
    locationMethod: string; regionAssignmentMethod: "verified_coordinate_point_in_polygon";
    locationReferenceDate: string | null; historicalCoordinateStatus: string; regionResolution?: unknown };
}
const LEVELS: Record<string, SchoolLevel> = { 초등학교: "elem", 중학교: "mid", 고등학교: "high", 특수학교: "special" };
const AREAS: Record<string, IncheonSchool["areaType"]> = { "특별/광역시": "metropolitan", 특수지역: "special", 면지역: "myeon" };
export const INCHEON_INDICATORS = ["students_total", "schools_total", "classes_total", "students_per_class",
  "teachers_total", "students_per_teacher", "small_schools", "small_school_share"] as const;

/** Original worksheet values are checked before any published evidence is adopted. */
export function canonicalSchools(observations: Observation[], links: LocationLink[], cell: (address: string) => unknown): IncheonSchool[] {
  if (observations.length !== 562 || links.length !== observations.length) throw new Error("Expected 562 school observations and location links");
  const byId = new Map(links.map((row) => [row.schoolId, row]));
  if (byId.size !== links.length || new Set(links.map((row) => row.locationId)).size !== links.length) throw new Error("Duplicate location identity");
  const ids = new Set<string>();
  const regions = new Set(incheonProfile.regions.map((row) => row.code));
  return observations.map((row): IncheonSchool => {
    if (ids.has(row.schoolId)) throw new Error(`Duplicate school: ${row.schoolId}`);
    ids.add(row.schoolId);
    const location = byId.get(row.schoolId);
    if (!location || row.name !== location.name || row.level !== location.level || row.campus !== location.campus ||
        location.evidence.kessRow !== row.sourceRow || location.evidence.kessAddress !== row.address ||
        !location.identityVerified || !location.finiteRangeVerified || !location.regionResolutionVerified || location.pointStatus !== "PASS") {
      throw new Error(`Unverified school identity: ${row.name}`);
    }
    if (!regions.has(location.uniqueCurrentSgg) || !Number.isFinite(location.latitude) || !Number.isFinite(location.longitude) ||
        Math.abs(location.latitude) > 90 || Math.abs(location.longitude) > 180) throw new Error(`Invalid location: ${row.name}`);
    for (const [column, expected] of Object.entries({ I: row.name, E: row.level, C: row.sourceRegion, T: row.address,
      L: row.campus, P: row.status, X: row.schoolCountFlag, AN: row.students, BJ: row.teachers, AG: row.classes })) {
      if (cell(`${column}${row.sourceRow}`) !== expected) throw new Error(`Original KESS mismatch: ${row.name} ${column}${row.sourceRow}`);
    }
    if (`kedi:${cell(`K${row.sourceRow}`)}` !== row.schoolId || cell(`B${row.sourceRow}`) !== "인천") throw new Error(`KESS identity mismatch: ${row.name}`);
    const sourceAreaType = String(cell(`Q${row.sourceRow}`));
    const areaType = AREAS[sourceAreaType];
    const level = LEVELS[row.level];
    if (!areaType || !level || !["본교", "분교장"].includes(row.campus)) throw new Error(`Unknown classification: ${row.name}`);
    for (const value of [row.students, row.teachers, row.classes, row.schoolCountFlag]) {
      if (!Number.isInteger(value) || value < 0) throw new Error(`Missing or invalid count: ${row.name}`);
    }
    const branch = row.campus === "분교장";
    if (row.schoolCountFlag !== (branch ? 0 : 1)) throw new Error(`School count policy mismatch: ${row.name}`);
    return {
      id: row.schoolId, kediCode: row.schoolId.slice(5), name: row.name, level, status: row.status, branch,
      lat: location.latitude, lng: location.longitude, regionCode: location.uniqueCurrentSgg,
      students: row.students, teachers: row.teachers, classes: row.classes,
      studentsPerClass: row.classes === 0 ? null : row.students / row.classes,
      small: !branch && row.students <= 60, schoolCountFlag: row.schoolCountFlag,
      sourceRegionName: row.sourceRegion, sourceAddress: row.address, sourceCampusType: row.campus,
      sourceAreaType, areaType, statisticsDate: "2026-04-01", geographyDate: "2026-07-01",
      ...(location.source.url ? { locationSource: { address: location.evidence.officialAddress ?? row.address,
        url: location.source.url, mapUrl: location.source.url, verifiedAt: "2026-09-23", method: location.method } } : {}),
      provenance: { kessRow: row.sourceRow, studentCell: row.studentCell, locationId: location.locationId,
        locationMethod: location.method, regionAssignmentMethod: "verified_coordinate_point_in_polygon",
        locationSourceId: location.source.id, locationReferenceDate: location.source.coordinateReferenceDate,
        historicalCoordinateStatus: location.historicalCoordinateStatus, regionResolution: location.evidence.currentRegionResolution },
    };
  }).sort((a, b) => a.id.localeCompare(b.id));
}

/** Ratios use sums, not the mean of school ratios. Branch pupils/teachers remain included. */
export function incheonIndicators(schools: IncheonSchool[]): IndicatorFile[] {
  const regionCodes = [...incheonProfile.regions.map((row) => row.code), "28000"];
  const levels: (SchoolLevel | undefined)[] = [undefined, "elem", "mid", "high", "special"];
  return INCHEON_INDICATORS.map((id) => {
    const rows: IndicatorRow[] = [];
    for (const regionCode of regionCodes) for (const level of levels) {
      const selected = schools.filter((row) => (regionCode === "28000" || row.regionCode === regionCode) && (!level || row.level === level));
      const sum = (field: "students" | "classes" | "teachers" | "schoolCountFlag") => selected.reduce((total, row) => {
        const value = row[field];
        if (value === null || !Number.isFinite(value)) throw new Error(`Cannot aggregate missing ${field}`);
        return total + value;
      }, 0);
      const students = sum("students"), teachers = sum("teachers"), classes = sum("classes"), main = sum("schoolCountFlag");
      const small = selected.filter((row) => row.small).length;
      const values: Record<typeof INCHEON_INDICATORS[number], number | null> = {
        students_total: students, teachers_total: teachers, classes_total: classes, schools_total: main,
        students_per_teacher: teachers === 0 ? null : students / teachers,
        students_per_class: classes === 0 ? null : students / classes,
        small_schools: small, small_school_share: main === 0 ? null : small / main * 100,
      };
      rows.push({ regionCode, ...(level ? { level } : {}), value: values[id] });
    }
    return { id, year: 2026, referenceDate: "2026-04-01", source: {
      name: "한국교육개발원 KESS 2026 학교별 주요통계", url: "https://kess.kedi.re.kr/contents/dataset", year: 2026,
    }, rows };
  });
}
