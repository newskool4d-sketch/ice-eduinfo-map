import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { contrastRatio, relativeLuminance, THEME } from "@/lib/theme";

describe("THEME contrast (WCAG 2.1)", () => {
  it("body text pairs reach 4.5:1", () => {
    expect(contrastRatio(THEME.ink, THEME.paper)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(THEME.ink, THEME.surface)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(THEME.inkMuted, THEME.paper)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(THEME.inkMuted, THEME.surface)).toBeGreaterThanOrEqual(4.5);
  });

  it("accent on surface reaches 3:1 (large text / UI component minimum)", () => {
    expect(contrastRatio(THEME.accent, THEME.surface)).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(THEME.positive, THEME.surface)).toBeGreaterThanOrEqual(3);
  });

  it("relativeLuminance: white 1, black 0", () => {
    expect(relativeLuminance("#ffffff")).toBeCloseTo(1, 6);
    expect(relativeLuminance("#000000")).toBeCloseTo(0, 6);
  });
});

describe("globals.css @theme tokens mirror THEME", () => {
  const css = readFileSync(path.join(process.cwd(), "src/app/globals.css"), "utf8");
  const cssToken = (name: string) => {
    const m = new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{6})`).exec(css);
    return m?.[1].toLowerCase();
  };
  it.each([
    ["paper", THEME.paper],
    ["surface", THEME.surface],
    ["ink", THEME.ink],
    ["ink-muted", THEME.inkMuted],
    ["line", THEME.line],
    ["accent", THEME.accent],
    ["accent-soft", THEME.accentSoft],
    ["positive", THEME.positive],
  ] as const)("--color-%s equals THEME", (name, hex) => {
    expect(cssToken(name)).toBe(hex);
  });
});
