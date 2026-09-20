import { describe, expect, it } from "vitest";
import { formatArea, formatDecimal, formatInt, formatPercent } from "../../src/lib/format";

describe("formatInt", () => {
  it("formats an integer with ko-KR thousands separators", () => {
    expect(formatInt(70524)).toBe("70,524");
  });

  it("formats small numbers without separators", () => {
    expect(formatInt(11)).toBe("11");
  });

  it("formats zero", () => {
    expect(formatInt(0)).toBe("0");
  });

  it("rounds non-integer input to the nearest whole number", () => {
    expect(formatInt(70524.6)).toBe("70,525");
  });
});

describe("formatDecimal", () => {
  it("formats with the requested number of fraction digits", () => {
    expect(formatDecimal(23.456, 1)).toBe("23.5");
  });

  it("pads with trailing zeros to reach the requested digits", () => {
    expect(formatDecimal(18, 1)).toBe("18.0");
  });

  it("supports zero fraction digits", () => {
    expect(formatDecimal(18.6, 0)).toBe("19");
  });

  it("applies thousands separators for large values", () => {
    expect(formatDecimal(1234.5, 1)).toBe("1,234.5");
  });
});

describe("formatPercent", () => {
  it("formats a 0-100 percentage value with a trailing % sign", () => {
    expect(formatPercent(12.34, 1)).toBe("12.3%");
  });

  it("formats zero percent", () => {
    expect(formatPercent(0, 1)).toBe("0.0%");
  });

  it("defaults to one fraction digit when digits is omitted", () => {
    expect(formatPercent(5)).toBe("5.0%");
  });
});

describe("formatArea", () => {
  it("formats square meters with thousands separators and a ㎡ suffix", () => {
    expect(formatArea(32640)).toBe("32,640㎡");
  });

  it("rounds non-integer area values", () => {
    expect(formatArea(100.4)).toBe("100㎡");
  });

  it("formats zero area", () => {
    expect(formatArea(0)).toBe("0㎡");
  });
});
