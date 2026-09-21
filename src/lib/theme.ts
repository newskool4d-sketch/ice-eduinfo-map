/**
 * 라이트 테마 토큰의 단일 원천. globals.css 의 @theme 블록은 이 값을 그대로
 * 복제한다(테스트가 두 곳의 일치를 검사). 지도 레이어는 이 파일을 직접
 * import 하지 않고 스펙의 RGB 리터럴을 쓴다(레이어 테스트가 리터럴을 고정).
 */
export const THEME = {
  paper: "#f5f2eb",
  surface: "#ffffff",
  ink: "#1c2331",
  inkMuted: "#5b6472",
  line: "#e1dbd0",
  accent: "#d9572b",
  accentSoft: "#fbe9df",
  positive: "#2f8f7a",
  // Task 1 fix round 1 — darker variants for SMALL text (10-12px: KPI
  // deltas, 소규모 badge, RegionPanel's vs-province line). `accent`/`positive`
  // only clear 3:1 on surface (fine for fills, rings, borders, the sparkline
  // stroke and large text) but fall short of AA 4.5:1 for body-size text;
  // these reach ≥ 4.5 on paper/surface and ≥ 4.2 on the KPI tile fill
  // (ink 5% over paper) and on accent-soft (tests/unit/theme.test.ts).
  accentText: "#b8431a",
  positiveText: "#236d5f",
} as const;

export type ThemeToken = keyof typeof THEME;

function hexToRgb(hex: string): [number, number, number] {
  const m = /^#([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})$/.exec(hex);
  if (!m) throw new Error(`theme: not a #rrggbb color: ${hex}`);
  return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
}

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

/** WCAG 2.1 relative luminance of a #rrggbb color (0 = black, 1 = white). */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG 2.1 contrast ratio (1..21) between two #rrggbb colors, order-independent. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}
