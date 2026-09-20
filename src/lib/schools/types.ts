/**
 * The shape of public/data/schools.json (Task 4B), and the `School` row
 * type used throughout src/**. Pure data types, no React import — mirrors
 * src/lib/indicators/types.ts (IndicatorFile/SeriesFile/Manifest), and is
 * imported by both client components and scripts/pipeline/lib/schools.ts
 * (which produces the JSON this type describes), same direction every other
 * pipeline/frontend type sharing in this repo already goes.
 */
import type { SchoolLevel } from "../indicators/types";

export interface School {
  id: string;
  name: string;
  level: SchoolLevel;
  /** 운영상태 — the location source's own value (e.g. "운영"), NOT a KESS 상태 code. */
  status: string;
  /** true for 분교장. */
  branch: boolean;
  lat: number;
  lng: number;
  regionCode: string;
  students: number | null;
  classes: number | null;
  teachers: number | null;
  studentsPerClass: number | null;
  small: boolean;
  kediCode?: string;
}

export interface SchoolSourceInfo {
  name: string;
  url: string;
  referenceDate: string;
}

/** public/data/schools.json's top-level shape. */
export interface SchoolsFile {
  referenceDate: {
    location: string;
    stats: string;
  };
  source: {
    location: SchoolSourceInfo;
    stats: SchoolSourceInfo;
  };
  schools: School[];
}
