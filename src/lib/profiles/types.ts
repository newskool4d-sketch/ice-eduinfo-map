import type { EducationIssue } from "../issues/types";

export type RegionEntry = { code: string; name: string };

export interface ProfileCapabilities {
  coreStatistics: boolean;
  schoolLocations: boolean;
  closedSchools: boolean;
  educationIssues: boolean;
  neighborSilhouettes: boolean;
  historicalTrends: boolean;
}

/**
 * Everything that changes when this map is reused for a different province.
 * The application and pipeline consume this object rather than province names
 * or administrative codes embedded in their own modules.
 */
export interface RegionProfile {
  id: string;
  capabilities: ProfileCapabilities;
  indicatorIds?: readonly string[];
  /** False until a deployable package and all application consumers are ready. */
  pipelineReady: boolean;
  province: { name: string; shortName: string; aggregateCode: string };
  regions: readonly RegionEntry[];
  boundary: {
    sidoCode: string;
    neighborSidoCodes: readonly string[];
    geographyVersion?: string;
    /** Source sgg codes that should be presented as one map region. */
    sggCodeOverrides?: Readonly<Record<string, string>>;
    sggPrefixOverrides?: Readonly<Record<string, string>>;
  };
  /** Omit to disable building requests and controls for an unsupported profile. */
  buildings?: {
    /** West, south, east, north; source boundary including offshore islands. */
    bounds: readonly [number, number, number, number];
    defaultScene: "city" | "flat";
  };
  schoolData: {
    kessSidoNames: readonly string[];
    educationOfficeCodes: readonly string[];
    addressPrefixes: readonly string[];
    statisticsYear?: number;
  };
  files: {
    manualDir: string;
    rawDir: string;
    interimDir: string;
    publicDataDir: string;
    publicDataUrl: string;
    closedSchoolsCsvPrefix?: string;
  };
  policy: { source: { name: string; url: string; referenceDate: string } | null; issues: EducationIssue[] };
  validation?: {
    referenceDate: string;
    status: "PARTIAL" | "PASS";
    studentDifferencesKessMinusIce: Readonly<Record<string, number>>;
    teacherIndependentControl: "not_acquired" | "verified";
    locationCoverage: { total: number; verified: number; missing: number };
  };
}
