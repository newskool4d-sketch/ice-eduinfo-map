import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

async function load(profile: string) {
  vi.stubEnv("NEXT_PUBLIC_EDU_MAP_PROFILE", profile);
  vi.resetModules();
  const groups = await import("@/lib/indicators/groups");
  const registry = await import("@/lib/indicators/registry");
  return { ...groups, ...registry };
}

describe("indicator groups per profile (redesign plan §4.2)", () => {
  it("gives Incheon three named groups, in order, matching the quick-topic chips", async () => {
    const { GROUP_LABELS, GROUP_ORDER, QUICK_TOPICS, QUICK_TOPIC_LABELS, INDICATORS } = await load("incheon");
    const used = GROUP_ORDER.filter((group) => INDICATORS.some((def) => def.group === group));
    expect(used.map((group) => GROUP_LABELS[group])).toEqual(["학생·학교", "교육여건", "소규모학교"]);
    const members = (group: string) => INDICATORS.filter((def) => def.group === group).map((def) => def.id);
    expect(members("scale")).toEqual(["students_total", "schools_total", "classes_total"]);
    expect(members("teacherInfra")).toEqual(["students_per_class", "teachers_total", "students_per_teacher"]);
    expect(members("smallSchool")).toEqual(["small_schools", "small_school_share"]);
    expect(QUICK_TOPICS.map(([label]) => label)).toEqual(["학생·학교", "교육여건", "소규모학교"]);
    expect(QUICK_TOPIC_LABELS.students_per_class).toBe("교육여건");
  });

  it("leaves the Jeonbuk groups and chips unchanged", async () => {
    const { GROUP_LABELS, GROUP_ORDER, QUICK_TOPICS, indicatorById } = await load("jeonbuk");
    expect(GROUP_ORDER).toEqual(["scale", "smallSchool", "teacherInfra", "vulnerable"]);
    expect(GROUP_LABELS.scale).toBe("규모");
    expect(indicatorById("students_per_class")?.group).toBe("scale");
    expect(QUICK_TOPICS.map(([label]) => label)).toEqual(["학생 분포", "교육여건", "작은학교", "특수교육", "지역 변화"]);
  });
});
