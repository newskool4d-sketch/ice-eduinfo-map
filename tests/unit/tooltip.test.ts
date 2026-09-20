import { describe, expect, it } from "vitest";
import type { PickingInfo } from "@deck.gl/core";

import { makeTooltip } from "@/components/map/tooltip";

function infoFor(code: string | undefined): PickingInfo {
  return {
    object: code === undefined ? undefined : { properties: { code } },
  } as unknown as PickingInfo;
}

describe("makeTooltip", () => {
  it("returns null when nothing is hovered", () => {
    const getTooltip = makeTooltip(
      () => "전주시",
      () => "더미 값 0.42",
    );
    expect(getTooltip(infoFor(undefined))).toBeNull();
  });

  it("renders the region name and value text as HTML when a feature is hovered", () => {
    const getTooltip = makeTooltip(
      (code) => `이름:${code}`,
      (code) => `값:${code}`,
    );
    const result = getTooltip(infoFor("52110"));
    expect(result).not.toBeNull();
    expect(result?.html).toContain("이름:52110");
    expect(result?.html).toContain("값:52110");
  });

  it("HTML-escapes name/value text", () => {
    const getTooltip = makeTooltip(
      () => "<script>alert(1)</script>",
      () => "a & b",
    );
    const result = getTooltip(infoFor("52110"));
    expect(result?.html).not.toContain("<script>");
    expect(result?.html).toContain("&lt;script&gt;");
    expect(result?.html).toContain("a &amp; b");
  });

  it("uses a dark tooltip card style", () => {
    const getTooltip = makeTooltip(
      () => "전주시",
      () => "값",
    );
    const result = getTooltip(infoFor("52110"));
    expect(result?.style).toMatchObject({
      background: "#141a2a",
      color: "#e6e9f0",
      border: "1px solid #2a3450",
      borderRadius: "8px",
      padding: "8px 10px",
      fontSize: "13px",
    });
  });
});
