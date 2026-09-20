/**
 * SchoolPredicate implementations — boolean conditions over a normalized
 * SchoolRow that `count` / `share` aggregates evaluate. All predicates that
 * describe "a school" (as opposed to a row) require isMain === 1, matching
 * the "분교장은 학교수에서 제외" rule: a branch campus never counts as a
 * small/zero-entrant/rural *school* on its own.
 */
import type { SchoolPredicate } from "../../../src/lib/indicators/types";
import { SMALL_SCHOOL_MAX_STUDENTS } from "../sources";
import type { SchoolRow } from "./kess-xlsx";

export const PREDICATES: Record<SchoolPredicate, (row: SchoolRow) => boolean> = {
  small: (row) => row.isMain === 1 && row.students != null && row.students <= SMALL_SCHOOL_MAX_STUDENTS,
  zeroEntrants: (row) => row.isMain === 1 && row.entrants === 0,
  ruralArea: (row) => row.isMain === 1 && row.areaType === "면",
  isMain: (row) => row.isMain === 1,
};
