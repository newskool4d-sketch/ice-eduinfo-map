import type { RegionCode } from "../geo/regions";
import type { School } from "../schools/types";

export type Designation = "decline" | "attention" | "none";
export interface IssueSource {
  name: string;
  url: string;
  referenceDate?: string;
  checkedAt?: string;
}
export interface SchoolIssueFacts {
  kediCode: string;
  isMain: boolean;
  status: string;
  entrants: number | null;
  specialClasses: number | null;
  specialStudents: number | null;
}
export type IssueLevel = "elem" | "mid" | "high";
export interface SpecialTrend {
  regionCode: string;
  year: number;
  regularStudents: number | null;
  regularClasses: number | null;
  specialStudents: number | null;
  specialClasses: number | null;
}
export interface EducationIssuesFile {
  version: 1;
  specialTrends?: SpecialTrend[];
  statsReferenceDate: string;
  sources: IssueSource[];
  designations: Record<RegionCode, Designation | null>;
  schools: Record<string, SchoolIssueFacts>;
}
export interface EducationIssue {
  id: string;
  title: string;
  question: string;
  description: string;
  policy: string;
  policyPage: number;
  policyTask: string;
  status: "published" | "planned";
  metrics: string[];
  dataNeeded?: string;
  nextQuestion?: string;
}
export type IssueColor = [number, number, number, number];
export interface IssueRegionValue {
  code: RegionCode;
  value: number | Designation | null;
  text: string;
  color: IssueColor;
}
export interface IssueMapModel {
  issue: EducationIssue;
  metric: string;
  title: string;
  date: string;
  note: string;
  regions: IssueRegionValue[];
  schools: School[];
  legend: { label: string; color: IssueColor }[];
  provinceText: string;
  level?: IssueLevel;
  readingGuide?: string;
  regionOverlay?: boolean;
  sources: IssueSource[];
}
