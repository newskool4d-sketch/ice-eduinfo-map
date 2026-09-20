import { describe, expect, it } from "vitest";

import { primaryFamily } from "@/components/map/useFontGate";

describe("primaryFamily", () => {
  it("returns the first family from a next/font-style two-family var, quotes preserved", () => {
    expect(primaryFamily('"Noto Sans KR", "Noto Sans KR Fallback"')).toBe('"Noto Sans KR"');
  });

  it("trims surrounding whitespace", () => {
    expect(primaryFamily('  "Noto Sans KR" ,  "Noto Sans KR Fallback"  ')).toBe('"Noto Sans KR"');
  });

  it("returns the whole value unchanged when there is only one family", () => {
    expect(primaryFamily("'Noto Sans KR'")).toBe("'Noto Sans KR'");
    expect(primaryFamily("Noto Sans KR")).toBe("Noto Sans KR");
  });

  it("returns an empty string for an empty value", () => {
    expect(primaryFamily("")).toBe("");
  });
});
