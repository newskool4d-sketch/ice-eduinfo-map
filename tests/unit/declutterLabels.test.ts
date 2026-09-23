import { describe, expect, it } from "vitest";
import {
  declutterLabels,
  type LabelCandidate,
} from "@/components/map/declutterLabels";
const candidates: LabelCandidate<string>[] = [
  {
    value: "ordinary",
    position: [50, 50],
    text: "학교 이름",
    size: 11,
    priority: 10,
  },
  {
    value: "selected",
    position: [52, 50],
    text: "선택 학교",
    size: 11,
    priority: 1000,
  },
  {
    value: "far",
    position: [150, 50],
    text: "다른 학교",
    size: 11,
    priority: 10,
  },
  {
    value: "outside",
    position: [250, 50],
    text: "화면 밖",
    size: 11,
    priority: 10,
  },
];
const measure = (text: string, size: number) => text.length * size;
describe("screen-space school labels", () => {
  it("avoids school-count bubbles and chooses only one alternative location per region", () => {
    const alternatives: LabelCandidate<string>[] = [
      { key: "region", value: "blocked", position: [50, 50], text: "구", size: 14, priority: 800 },
      { key: "region", value: "moved", position: [150, 50], text: "구", size: 14, priority: 799 },
      { key: "region", value: "duplicate", position: [240, 50], text: "구", size: 14, priority: 798 },
    ];
    expect(declutterLabels(alternatives, { width: 300, height: 100, project: p => p }, measure,
      [{ left: 30, right: 70, top: 30, bottom: 70 }])).toEqual(["moved"]);
  });
  it("keeps the selected label, hides overlaps and excludes off-screen anchors", () => {
    expect(
      declutterLabels(
        candidates,
        { width: 200, height: 100, project: (p) => p },
        measure,
      ),
    ).toEqual(["selected", "far"]);
  });
  it("shows additional labels when zoom spreads nearby positions apart", () => {
    const close = candidates.slice(0, 2);
    const values = declutterLabels(
      close,
      { width: 300, height: 100, project: ([x, y]) => [(x - 49) * 90, y] },
      measure,
    );
    expect(values).toEqual(["selected", "ordinary"]);
  });
});
