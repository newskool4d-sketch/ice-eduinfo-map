import { beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { loadBundle } from "@/lib/data/load";
import type { DataBundle } from "@/lib/data/types";
import type { EducationIssuesFile } from "@/lib/issues/types";
import { assertIssueData } from "@/lib/issues/validate";
import { buildIssueModel, issueValue, studentChange } from "@/lib/issues/model";
import {
  EDUCATION_ISSUES,
  issueById,
  PUBLISHED_ISSUES,
} from "@/lib/issues/registry";
import { createLoader } from "nuqs/server";
import { mapQueryParsers } from "@/lib/state/urlState";

let bundle: DataBundle;
let data: EducationIssuesFile;
beforeAll(async () => {
  bundle = await loadBundle(
    async (url) => new Response(readFileSync(`public${url}`, "utf8")),
  );
  data = JSON.parse(readFileSync("public/data/education-issues.json", "utf8"));
});
const regional = () => issueById("regional-sustainability")!;
const special = () => issueById("special-education")!;

describe("policy-linked education issues", () => {
  it("registers eight sourced themes, publishing only the two supported themes", () => {
    expect(EDUCATION_ISSUES).toHaveLength(8);
    expect(PUBLISHED_ISSUES).toHaveLength(2);
    expect(issueById("reading")).toBeNull();
    expect(EDUCATION_ISSUES.every((i) => i.policyPage && i.policyTask)).toBe(
      true,
    );
  });
  it("validates exact identity and date alignment for every school", () => {
    expect(() => assertIssueData(data, bundle.schools)).not.toThrow();
    for (const change of [
      (d: EducationIssuesFile) => {
        d.statsReferenceDate = "2025-04-01";
      },
      (d: EducationIssuesFile) => {
        d.schools[bundle.schools.schools[0].id].kediCode = "wrong";
      },
      (d: EducationIssuesFile) => {
        delete d.schools[bundle.schools.schools[0].id];
      },
      (d: EducationIssuesFile) => {
        d.schools[bundle.schools.schools[0].id].entrants = -1;
      },
    ]) {
      const copy = structuredClone(data);
      change(copy);
      expect(() => assertIssueData(copy, bundle.schools)).toThrow();
    }
  });
  it("retains the official three categories without calling undesignated regions safe", () => {
    const model = buildIssueModel(bundle, data, regional(), "designation");
    expect(model.regions.filter((r) => r.value === "decline")).toHaveLength(10);
    expect(model.regions.find((r) => r.code === "52140")?.text).toBe(
      "관심지역",
    );
    expect(model.regions.filter((r) => r.value === "none")).toHaveLength(3);
  });
  it("separates general-school special classes from special schools", () => {
    expect(issueValue(bundle, data, "special-classes", "52000")).toBe(559);
    expect(issueValue(bundle, data, "special-students", "52000")).toBe(2483);
    expect(issueValue(bundle, data, "special-schools", "52000")).toBe(11);
    const general = buildIssueModel(bundle, data, special(), "special-classes");
    expect(general.schools).toHaveLength(452);
    expect(general.schools.every((s) => s.level !== "special")).toBe(true);
    const specialized = buildIssueModel(
      bundle,
      data,
      special(),
      "special-schools",
    );
    expect(specialized.schools).toHaveLength(11);
    expect(specialized.schools.every((s) => s.lat !== null && s.lng !== null)).toBe(true);
  });
  it("matches existing main-school counts including suspended schools but excluding branches", () => {
    const small = buildIssueModel(bundle, data, regional(), "small-share");
    expect(small.schools).toHaveLength(310);
    expect(small.schools.every((s) => !s.branch)).toBe(true);
    expect(
      buildIssueModel(bundle, data, regional(), "zero-entrants").schools,
    ).toHaveLength(27);
    expect(
      small.schools.some((s) => data.schools[s.id].status === "휴교"),
    ).toBe(true);
  });
  it("includes 60 students and excludes 61 regardless of stale small flag", () => {
    const copy = structuredClone(bundle);
    const school = copy.schools.schools.find((s) => !s.branch)!;
    school.students = 60;
    school.small = false;
    expect(
      buildIssueModel(copy, data, regional(), "small-share").schools.some(
        (s) => s.id === school.id,
      ),
    ).toBe(true);
    school.students = 61;
    school.small = true;
    expect(
      buildIssueModel(copy, data, regional(), "small-share").schools.some(
        (s) => s.id === school.id,
      ),
    ).toBe(false);
  });
  it("distinguishes missing data from zero and refuses partial sums", () => {
    const copy = structuredClone(data);
    const school = bundle.schools.schools.find((s) => s.level !== "special")!;
    copy.schools[school.id].specialClasses = null;
    expect(
      issueValue(bundle, copy, "special-classes", school.regionCode),
    ).toBeNull();
    copy.schools[school.id].specialClasses = 0;
    expect(
      issueValue(bundle, copy, "special-classes", school.regionCode),
    ).not.toBeNull();
    copy.designations["52110"] = null;
    const model = buildIssueModel(bundle, copy, regional(), "designation");
    expect(model.regions.find((r) => r.code === "52110")?.text).toBe(
      "자료 없음",
    );
    expect(model.legend.some((l) => l.label === "자료 없음")).toBe(true);
  });
  it("shows the true year span and uses signed colors, with missing/zero baselines not calculable", () => {
    const copy = structuredClone(bundle);
    const model = buildIssueModel(bundle, data, regional(), "student-change");
    expect(model.title).toContain("2022→2026");
    expect(
      new Set(model.regions.map((r) => r.color.join(","))).size,
    ).toBeGreaterThan(1);
    copy.series.students_total.rows.find(
      (r) => r.regionCode === "52110" && r.year === 2022,
    )!.value = 0;
    expect(studentChange(copy, "52110")).toBeNull();
    copy.series.students_total.rows.find(
      (r) => r.regionCode === "52110" && r.year === 2022,
    )!.value = null;
    expect(studentChange(copy, "52110")).toBeNull();
  });
  it("resolves unsupported metric URLs to the issue default and keeps legacy URLs", () => {
    expect(
      buildIssueModel(bundle, data, regional(), "special-classes").metric,
    ).toBe("designation");
    const load = createLoader(mapQueryParsers);
    expect(load("?indicator=students_total&region=52720").view).toBe("schools");
    const q = load(
      "?view=issues&issue=regional-sustainability&issueMetric=designation&region=52720",
    );
    expect(q.issue).toBe("regional-sustainability");
    expect(q.region).toBe("52720");
    expect(load("?view=issues&issue=reading").issue).toBeNull();
  });
});
