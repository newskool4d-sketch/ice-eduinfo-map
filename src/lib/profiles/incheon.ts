import type { RegionProfile } from "./types";

/** Evidence: workspace docs/planning/incheon-v1/07-followup-results.md.
 * This registers the profile; it does not certify a deployable data package.
 */
export const incheonProfile: RegionProfile = {
  id: "incheon",
  pipelineReady: true,
  indicatorIds: ["students_total", "schools_total", "classes_total", "students_per_class", "teachers_total", "students_per_teacher", "small_schools", "small_school_share"],
  capabilities: {
    coreStatistics: true, schoolLocations: true, closedSchools: false,
    // Current-boundary series remain unavailable; history.json uses source-era regions.
    educationIssues: false, neighborSilhouettes: false, historicalTrends: false,
  },
  province: { name: "인천광역시", shortName: "인천", aggregateCode: "28000" },
  regions: [
    { code: "28125", name: "제물포구" }, { code: "28155", name: "영종구" },
    { code: "28177", name: "미추홀구" }, { code: "28185", name: "연수구" },
    { code: "28200", name: "남동구" }, { code: "28237", name: "부평구" },
    { code: "28245", name: "계양구" }, { code: "28275", name: "서해구" },
    { code: "28290", name: "검단구" }, { code: "28710", name: "강화군" },
    { code: "28720", name: "옹진군" },
  ],
  boundary: { sidoCode: "28", neighborSidoCodes: [], geographyVersion: "incheon-2026-07-01" },
  schoolData: {
    kessSidoNames: ["인천"], educationOfficeCodes: ["7310000"],
    addressPrefixes: ["인천광역시"], statisticsYear: 2026,
  },
  files: {
    manualDir: "data/manual/incheon", rawDir: "data/raw/incheon",
    interimDir: "data/interim/incheon", publicDataDir: "public/data/incheon",
    publicDataUrl: "/data/incheon",
  },
  policy: { source: null, issues: [] },
  validation: {
    referenceDate: "2026-04-01", status: "PARTIAL",
    studentDifferencesKessMinusIce: { elem: 1, mid: 69, high: 0, special: 0 },
    teacherIndependentControl: "not_acquired",
    locationCoverage: { total: 562, verified: 562, missing: 0 },
  },
};
