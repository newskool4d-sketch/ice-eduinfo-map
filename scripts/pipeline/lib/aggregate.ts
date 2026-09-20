/**
 * Turns a set of normalized SchoolRow objects into the 14 시군 + 52000
 * IndicatorRow[] that public/data/indicators|series/<id>.json are built
 * from, using nothing but the indicator's declarative `aggregate` rule.
 *
 * Row filtering is *only* by `status ∈ options.statuses` (applied uniformly
 * to every aggregate kind). Branch (분교장) rows are never dropped from the
 * row set — they contribute to `sum`/`ratio` aggregates, and are excluded
 * from `count`/`share` only because `isMain === 0` fails the `isMain`
 * predicate (and every "school-ness" predicate in predicates.ts requires
 * isMain). See sources.ts for why this reproduces the official 학교수 /
 * 학생수 / 교원수 figures exactly.
 */
import type {
  Aggregate,
  IndicatorDef,
  IndicatorRow,
  SchoolField,
  SchoolLevel,
} from "../../../src/lib/indicators/types";
import { PROVINCE_CODE, REGION_TABLE, type SchoolStatus } from "../sources";
import type { SchoolRow } from "./kess-xlsx";
import { PREDICATES } from "./predicates";

const LEVELS: SchoolLevel[] = ["elem", "mid", "high", "special"];

function fieldValue(row: SchoolRow, field: SchoolField): number | null {
  switch (field) {
    case "students":
      return row.students;
    case "classes":
      return row.classes;
    case "teachers":
      return row.teachers;
    case "staff":
      return row.staff;
    case "entrants":
      return row.entrants;
    case "graduates":
      return row.graduates;
    case "specialClasses":
      return row.specialClasses;
    case "specialStudents":
      return row.specialStudents;
    case "classrooms":
      return row.classrooms;
    case "siteArea":
      return row.siteArea;
    case "isMain":
      return row.isMain;
    default: {
      const exhaustive: never = field;
      throw new Error(`Unhandled SchoolField: ${JSON.stringify(exhaustive)}`);
    }
  }
}

/** Σfield over the given rows, treating null (blank/'-') as 0 — never NaN. */
function sumField(rows: SchoolRow[], field: SchoolField): number {
  return rows.reduce((total, row) => total + (fieldValue(row, field) ?? 0), 0);
}

function computeValue(aggregate: Aggregate, rows: SchoolRow[]): number | null {
  switch (aggregate.kind) {
    case "sum":
      return sumField(rows, aggregate.field);
    case "ratio": {
      const denominator = sumField(rows, aggregate.denominator);
      if (denominator === 0) return null;
      return sumField(rows, aggregate.numerator) / denominator;
    }
    case "count":
      return rows.filter(PREDICATES[aggregate.predicate]).length;
    case "share": {
      const totalMain = rows.filter(PREDICATES.isMain).length;
      if (totalMain === 0) return null;
      const matching = rows.filter(PREDICATES[aggregate.predicate]).length;
      return (matching / totalMain) * 100;
    }
    case "external":
      throw new Error(
        "aggregateIndicator cannot compute an 'external' aggregate — build-indicators.ts must handle it separately (e.g. students_change_5y from the students_total series).",
      );
    default: {
      const exhaustive: never = aggregate;
      throw new Error(`Unhandled Aggregate kind: ${JSON.stringify(exhaustive)}`);
    }
  }
}

export interface AggregateOptions {
  statuses: readonly SchoolStatus[];
}

/**
 * Returns 14 시군 rows + 1 province (52000) row, and — when
 * `def.byLevel` is set — the same 15 rows repeated per SchoolLevel with
 * `level` set. Every one of the 14 REGION_TABLE codes is always present in
 * the output, even when zero rows match (sum -> 0, ratio -> null, count -> 0).
 */
export function aggregateIndicator(
  def: IndicatorDef,
  rows: SchoolRow[],
  options: AggregateOptions,
): IndicatorRow[] {
  const filtered = rows.filter((row) => options.statuses.includes(row.status));

  const aggregateRegion = (regionRows: SchoolRow[], regionCode: string, level?: SchoolLevel): IndicatorRow => ({
    regionCode,
    value: computeValue(def.aggregate, regionRows),
    ...(level ? { level } : {}),
  });

  const result: IndicatorRow[] = [];

  for (const region of REGION_TABLE) {
    const regionRows = filtered.filter((row) => row.regionCode === region.code);
    result.push(aggregateRegion(regionRows, region.code));
  }
  result.push(aggregateRegion(filtered, PROVINCE_CODE));

  if (def.byLevel) {
    for (const level of LEVELS) {
      const levelRows = filtered.filter((row) => row.level === level);
      for (const region of REGION_TABLE) {
        const regionRows = levelRows.filter((row) => row.regionCode === region.code);
        result.push(aggregateRegion(regionRows, region.code, level));
      }
      result.push(aggregateRegion(levelRows, PROVINCE_CODE, level));
    }
  }

  return result;
}
