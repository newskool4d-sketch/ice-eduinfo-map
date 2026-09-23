import type { RegionProfile } from "./types";
import { EDUCATION_ISSUES, POLICY_SOURCE } from "./jeonbuk/issues";

/** The reference profile. Copy this file to start a new provincial map. */
export const jeonbukProfile: RegionProfile = {
  id: "jeonbuk",
  pipelineReady: true,
  capabilities: {
    coreStatistics: true, schoolLocations: true, closedSchools: true,
    educationIssues: true, neighborSilhouettes: true, historicalTrends: true,
  },
  province: { name: "전북특별자치도", shortName: "전북", aggregateCode: "52000" },
  regions: [
    { code: "52110", name: "전주시" }, { code: "52130", name: "군산시" },
    { code: "52140", name: "익산시" }, { code: "52180", name: "정읍시" },
    { code: "52190", name: "남원시" }, { code: "52210", name: "김제시" },
    { code: "52710", name: "완주군" }, { code: "52720", name: "진안군" },
    { code: "52730", name: "무주군" }, { code: "52740", name: "장수군" },
    { code: "52750", name: "임실군" }, { code: "52770", name: "순창군" },
    { code: "52790", name: "고창군" }, { code: "52800", name: "부안군" },
  ],
  boundary: {
    sidoCode: "52", neighborSidoCodes: ["44", "12", "47", "48"],
    sggPrefixOverrides: { "5211": "52110" },
  },
  schoolData: {
    kessSidoNames: ["전북"], educationOfficeCodes: ["8321000"],
    addressPrefixes: ["전북특별자치도", "전라북도"],
  },
  files: {
    manualDir: "data/manual", rawDir: "data/raw", interimDir: "data/interim",
    publicDataDir: "public/data", publicDataUrl: "/data",
    closedSchoolsCsvPrefix: "전북특별자치도교육청_폐교재산 현황_",
  },
  policy: { source: POLICY_SOURCE, issues: EDUCATION_ISSUES },
};
