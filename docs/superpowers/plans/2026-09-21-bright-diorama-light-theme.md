# 밝은 디오라마 + 라이트 테마 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 전북교육지도의 지도와 UI 전체를 "밝은 미니어처 모형(낮 조명)" 라이트 테마로 바꾸고, 블록 아래 배경을 위성(밝은 워시)·일반·끄기 3단으로 제공한다.

**Architecture:** (1) Tailwind v4 `@theme` 토큰 + `src/lib/theme.ts` 단일 원천으로 18개 파일의 다크 유틸리티 클래스를 치환하고 deck.gl 위젯을 `LightGlassTheme` 로 바꾼다. (2) 조명·후처리·팔레트·레이어 색 상수를 낮 조명용 값으로 교체한다(구조·메모화·우회책·카메라는 그대로). (3) `basemapPref` 를 3단 모드로 확장하고 위성/일반 타일 + 흰 워시 폴리곤 레이어와 세그먼트 컨트롤을 배선한다.

**Tech Stack:** Next.js 16 (App Router) · React 19 · TypeScript · Tailwind v4 · deck.gl 9.4 (`@deck.gl/core|layers|geo-layers|widgets`) · vitest 5 (jsdom for `tests/components`) · Playwright.

**Spec:** `docs/superpowers/specs/2026-09-21-bright-diorama-light-theme-design.md`

## Global Constraints

- 새 의존성 금지. `d3-scale-chromatic` import 는 제거하되 `package.json` 은 건드리지 않는다.
- 카메라·컨트롤러(`camera.ts`)·`useCamera` 는 변경하지 않는다(북쪽 고정·회전 없음은 `03b2bdb` 에 이미 반영).
- 레이어 규칙 유지: 조건부 레이어는 `null`(평면 배열), `data` 참조 안정, `updateTriggers`/600ms 전환, `schools` 의 `props.data.length` 계약, `window.__jbmap` 브리지 불변, 두 라벨 레이어 push 순서(school-labels → region-labels) 불변.
- e2e: 8개 spec 의 콘솔 error 0 단언, `data-testid="footer-source"` 개수(4)·"기준일" 문구, `e2e/fixtures.ts` 의 `**/api.vworld.kr/**` 스텁은 그대로 둔다.
- `NEXT_PUBLIC_VWORLD_KEY` 값은 env 에만 존재. `NEXT_PUBLIC_MAP_FX=off` 경로(`lightingEffectNoShadow`, 후처리 없음)는 유지.
- 색 값은 스펙의 리터럴을 그대로 쓴다(스크린샷 튜닝 범위가 명시된 값만 그 범위 안에서 조정 가능).
- 각 태스크 종료 시 `npm run typecheck && npm run lint && npm test && npm run build && npm run e2e` 통과. 커밋 메시지 끝: `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

---

### Task 1: 라이트 UI 토큰과 컴포넌트 치환

**Files:**
- Create: `src/lib/theme.ts`
- Create: `tests/unit/theme.test.ts`
- Modify: `src/app/globals.css` (html/body 규칙 + `@theme` 블록)
- Modify(클래스 치환): `src/components/Dashboard.tsx`, `src/components/DashboardSkeleton.tsx`, `src/components/panels/TopBar.tsx`, `src/components/panels/KpiTiles.tsx`, `src/components/panels/IndicatorMenu.tsx`, `src/components/panels/IndicatorPicker.tsx`, `src/components/panels/RegionList.tsx`, `src/components/panels/RegionPanel.tsx`, `src/components/panels/Legend.tsx`, `src/components/panels/Footer.tsx`, `src/components/ui/Sparkline.tsx`, `src/components/map/MapShell.tsx`, `src/components/map/MapFallback.tsx`, `src/components/map/MapOverlay.tsx`, `src/components/map/DeckMap.tsx` (`DarkGlassTheme`→`LightGlassTheme`, 컨테이너·폴백 오버레이 클래스), `src/components/map/tooltip.ts`
- Test(기존 유지·통과 확인): `tests/components/*.test.tsx`

**Interfaces:**
- Produces: `THEME` 상수(`src/lib/theme.ts`) — `{ paper, surface, ink, inkMuted, line, accent, accentSoft, positive }` (hex 문자열), `contrastRatio(a: string, b: string): number`, `relativeLuminance(hex: string): number`. Task 2·3 은 Tailwind 토큰 클래스(`bg-paper`, `text-ink`, `text-ink-muted`, `border-line`, `bg-surface`, `bg-accent-soft`, `text-accent`)를 사용한다.
- Consumes: 없음.

- [ ] **Step 1: 대비·일치 테스트 작성(실패 확인용)**

`tests/unit/theme.test.ts`:

```ts
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
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run tests/unit/theme.test.ts`
Expected: FAIL — `Cannot find module '@/lib/theme'`.

- [ ] **Step 3: `src/lib/theme.ts` 작성**

```ts
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
```

- [ ] **Step 4: `globals.css` 에 토큰 추가**

`src/app/globals.css` 전체를 다음으로 교체(폰트 규칙은 유지):

```css
@import "tailwindcss";

/* 라이트 테마 토큰 — src/lib/theme.ts 의 THEME 와 값이 같아야 한다
   (tests/unit/theme.test.ts 가 검사). Tailwind v4 는 이 변수들로
   bg-paper / text-ink / text-ink-muted / border-line / bg-surface /
   bg-accent-soft / text-accent / text-positive 유틸리티를 만든다. */
@theme {
  --color-paper: #f5f2eb;
  --color-surface: #ffffff;
  --color-ink: #1c2331;
  --color-ink-muted: #5b6472;
  --color-line: #e1dbd0;
  --color-accent: #d9572b;
  --color-accent-soft: #fbe9df;
  --color-positive: #2f8f7a;
}

html,
body {
  height: 100%;
  overflow: hidden;
  /* 트랙패드 두 손가락 가로 스와이프가 브라우저 뒤로/앞으로 가기로 새지 않게
     (지도 위 제스처 보호, 2026-09-21). 모바일 pull-to-refresh 도 함께 꺼진다. */
  overscroll-behavior: none;
  background: var(--color-paper);
  color: var(--color-ink);
}

body {
  font-family: var(--font-sans), system-ui, sans-serif;
}
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `npx vitest run tests/unit/theme.test.ts`
Expected: PASS (11 tests). 대비 실제값 참고: ink/paper ≈ 13.2, inkMuted/paper ≈ 5.6, accent/surface ≈ 4.0, positive/surface ≈ 4.1.

- [ ] **Step 6: 클래스 치환 코드모드 실행**

프로젝트 루트에 임시 스크립트 `scripts/tmp-light-theme-codemod.mjs` 를 만들어 실행한 뒤 **삭제**한다(커밋 금지):

```js
import { readFileSync, writeFileSync } from "node:fs";

const FILES = [
  "src/components/Dashboard.tsx",
  "src/components/DashboardSkeleton.tsx",
  "src/components/panels/TopBar.tsx",
  "src/components/panels/KpiTiles.tsx",
  "src/components/panels/IndicatorMenu.tsx",
  "src/components/panels/IndicatorPicker.tsx",
  "src/components/panels/RegionList.tsx",
  "src/components/panels/RegionPanel.tsx",
  "src/components/panels/Legend.tsx",
  "src/components/panels/Footer.tsx",
  "src/components/ui/Sparkline.tsx",
  "src/components/map/MapShell.tsx",
  "src/components/map/MapFallback.tsx",
  "src/components/map/MapOverlay.tsx",
  "src/components/map/DeckMap.tsx",
];

// 순서 중요: 긴(구체적) 패턴을 먼저.
const RULES = [
  [/bg-\[#0b0f19\]\/90/g, "bg-paper/90"],
  [/bg-\[#0b0f19\]/g, "bg-paper"],
  [/bg-\[#121826\]/g, "bg-surface"],
  [/text-\[#e6e9f0\]\/80/g, "text-ink/80"],
  [/text-\[#e6e9f0\]\/(50|60|70)/g, "text-ink-muted"],
  [/text-\[#e6e9f0\]/g, "text-ink"],
  [/hover:bg-white\/20/g, "hover:bg-ink/15"],
  [/hover:bg-white\/10/g, "hover:bg-ink/10"],
  [/bg-white\/(15|20)/g, "bg-ink/10"],
  [/bg-white\/(5|10)/g, "bg-ink/5"],
  [/border-white\/(5|10)/g, "border-line"],
  [/bg-black\/30/g, "bg-surface/85"],
  [/ring-white\/70/g, "ring-accent"],
  [/text-orange-400/g, "text-accent"],
];

for (const file of FILES) {
  let src = readFileSync(file, "utf8");
  const before = src;
  for (const [re, to] of RULES) src = src.replace(re, to);
  if (src !== before) writeFileSync(file, src);
  console.log(file, src === before ? "(unchanged)" : "updated");
}
```

Run: `node scripts/tmp-light-theme-codemod.mjs && rm scripts/tmp-light-theme-codemod.mjs`

- [ ] **Step 7: 남은 다크 리터럴 점검(0건이어야 함)**

Run: `grep -rnE "#e6e9f0|#0b0f19|#121826|white/(5|10|15|20)|black/30|ring-white" src --include='*.tsx' --include='*.ts' --include='*.css' | grep -v "src/lib/theme.ts"`
Expected: 출력 없음. 남는 줄이 있으면 같은 매핑 규칙으로 손으로 고친다.

- [ ] **Step 8: 손 편집 — 위젯 테마·툴팁·스파크라인·선택 강조**

`src/components/map/DeckMap.tsx`:
- import: `import { LightGlassTheme, ResetViewWidget, ZoomWidget } from "@deck.gl/widgets";`
- `const WIDGET_THEME_STYLE: CSSProperties = { ...LightGlassTheme, "--widget-margin": "16px" } as CSSProperties;` (주석의 "DarkGlassTheme" 문구도 LightGlassTheme 로 고친다)

`src/components/map/tooltip.ts`:

```ts
import { THEME } from "@/lib/theme";

const TOOLTIP_STYLE: Partial<CSSStyleDeclaration> = {
  background: THEME.surface,
  color: THEME.ink,
  border: `1px solid ${THEME.line}`,
  borderRadius: "8px",
  // 나머지 기존 항목(padding, fontSize 등)은 그대로
};
```

`src/components/ui/Sparkline.tsx`:
- `const LINE_COLOR = THEME.accent;` (`import { THEME } from "@/lib/theme";` 추가) 와 두 `<text … fill="#e6e9f0" fillOpacity={0.5}>` 를 `fill={THEME.inkMuted}` (fillOpacity 제거) 로. 주석의 "#121826-ish" 문구는 "paper (#f5f2eb)" 로.

선택 강조(코랄): `IndicatorMenu.tsx`·`RegionList.tsx`·`RegionPanel.tsx` 에서 선택/현재 항목을 표시하는 클래스(`aria-current`/`aria-selected`/`isSelected` 분기)를 찾아 배경은 `bg-accent-soft`, 글자는 `text-ink`, 선택 표시선(있다면)은 `border-accent` 로 바꾼다. 찾는 명령: `grep -n -E "aria-current|aria-selected|selected|isActive|active" src/components/panels/IndicatorMenu.tsx src/components/panels/RegionList.tsx src/components/panels/RegionPanel.tsx`.

KPI 증감(`KpiTiles.tsx:69-90`): 감소(▼)는 `text-accent`, 증가(▲)는 `text-positive`, 변화 없음은 `text-ink-muted` — 현재 `isWarn` 분기를 부호 분기로 바꾼다:

```tsx
const deltaClass = delta === null || delta === 0 ? "text-ink-muted" : delta > 0 ? "text-positive" : "text-accent";
```

(`isWarn` 변수가 다른 곳에서 안 쓰이면 제거.)

- [ ] **Step 9: 타입·린트·단위·컴포넌트 테스트**

Run: `npm run typecheck && npm run lint && npm test`
Expected: 모두 통과(644 + 11). `tests/components/*` 는 클래스명을 단언하지 않으므로 그대로 통과해야 한다. 통과하지 않는 테스트가 있으면 단언이 다크 클래스명을 참조하는 것이니 새 클래스명으로 갱신한다.

- [ ] **Step 10: 시각 확인**

Run: `npm run dev -- -p 3105` 를 백그라운드로 띄우고 아래 스크립트로 캡처 후 종료:

```js
// scripts/tmp-shot.mjs (실행 후 삭제)
import { chromium } from "@playwright/test";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
await page.goto("http://localhost:3105/?region=52110", { waitUntil: "domcontentloaded" });
await page.waitForSelector('[data-map-ready="true"]', { timeout: 60000 });
await page.waitForTimeout(4000);
await page.screenshot({ path: "test-results/light-ui-jeonju.png" });
await browser.close();
```

Read 로 `test-results/light-ui-jeonju.png` 를 열어 상단바·KPI·패널·범례·푸터·오버레이 버튼이 모두 밝은 표면에 잉크색 글자로 읽히는지, 글자가 사라진 곳(흰 글자 on 흰 배경)이 없는지 확인한다. 지도 자체는 아직 다크(Task 2 에서 바뀜)여도 정상.

- [ ] **Step 11: 커밋**

```bash
git add src/lib/theme.ts tests/unit/theme.test.ts src/app/globals.css src/components src/lib
git commit -m "feat(ui): light theme tokens and component restyle

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: 지도 낮 조명·파스텔 팔레트·블록·라벨·학교 색

**Files:**
- Modify: `src/lib/colors.ts` (팔레트·NULL_COLOR·`mix` 추가, d3-scale-chromatic 제거)
- Modify: `src/components/map/lighting.ts` (`KEY_DIRECTION`, `AMBIENT_INTENSITY`, 라이트 색, `shadowColor`, `REGION_MATERIAL`)
- Modify: `src/components/map/effects.ts` (후처리 값)
- Modify: `src/components/map/layers/regionLayers.ts` (neighbors/footprint/highlight/top-rings 색, 비선택 페이드)
- Modify: `src/components/map/layers/labelLayer.ts:104-113` (칩 색)
- Modify: `src/components/map/layers/schoolLayers.ts:75,256-262` (`HIGHLIGHT_COLOR`, 학교 칩 색)
- Modify: `src/lib/schoolVisuals.ts:6-11` (`SCHOOL_LEVEL_COLORS`)
- Modify: `src/components/map/layers/emdLayer.ts:98` (경계선 색)
- Test: `tests/unit/colors.test.ts`, `tests/unit/lighting.test.ts`, `tests/unit/effects.test.ts`, `tests/unit/regionLayers.test.ts`, `tests/unit/labelLayer.test.ts`, `tests/unit/schoolLayers.test.ts`, `tests/unit/emdLayer.test.ts`

**Interfaces:**
- Produces: `paletteFor(polarity)` 는 스펙의 5개 정지점을 그대로 반환(샘플링 없음), `NULL_COLOR = [205, 200, 192]`, 새 `mix(rgb: RGB, target: RGB, t: number): RGB`(t=0 → rgb, t=1 → target), 새 `luminance(rgb: RGB): number`(0..1). `SCHOOL_LEVEL_COLORS` 새 값. 조명 상수 새 값.
- Consumes: 없음(Task 1 과 독립).

- [ ] **Step 1: 팔레트 테스트 갱신·추가(실패 확인용)**

`tests/unit/colors.test.ts` 에서 (a) `NULL_COLOR` 단언을 `[205, 200, 192]` 로, (b) `interpolateViridis` 를 언급하는 테스트 이름 두 곳을 "hex stops" 로 바꾸고, (c) 다음 describe 를 추가:

```ts
import { luminance, mix, NULL_COLOR, paletteFor } from "@/lib/colors";

describe("paletteFor — pastel ramps (light theme)", () => {
  it("higherWorse is cream → coral, exactly the spec stops", () => {
    expect(paletteFor("higherWorse")).toEqual([
      [253, 243, 225],
      [249, 217, 176],
      [243, 178, 127],
      [232, 134, 90],
      [217, 87, 43],
    ]);
  });

  it("higherBetter is mint → teal, neutral is lilac (first/last stop)", () => {
    expect(paletteFor("higherBetter")[0]).toEqual([233, 246, 239]);
    expect(paletteFor("higherBetter")[4]).toEqual([47, 143, 122]);
    expect(paletteFor("neutral")[0]).toEqual([242, 238, 247]);
    expect(paletteFor("neutral")[4]).toEqual([109, 91, 163]);
  });

  it.each(["higherWorse", "higherBetter", "neutral"] as const)("%s luminance strictly decreases (colorblind-safe)", (polarity) => {
    const lums = paletteFor(polarity).map(luminance);
    for (let i = 1; i < lums.length; i++) expect(lums[i]).toBeLessThan(lums[i - 1]);
  });
});

describe("mix", () => {
  it("t=0 returns the color, t=1 returns the target, t=0.5 the midpoint", () => {
    expect(mix([0, 0, 0], [255, 255, 255], 0)).toEqual([0, 0, 0]);
    expect(mix([0, 0, 0], [255, 255, 255], 1)).toEqual([255, 255, 255]);
    expect(mix([0, 0, 0], [255, 255, 255], 0.5)).toEqual([128, 128, 128]);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run tests/unit/colors.test.ts`
Expected: FAIL — `mix`/`luminance` 없음, 팔레트 값 불일치, NULL_COLOR 불일치.

- [ ] **Step 3: `colors.ts` 구현**

- import 에서 `interpolateBlues, interpolateOrRd, interpolateViridis` 줄을 삭제한다.
- `NULL_COLOR` 를 `[205, 200, 192]` 로.
- `PALETTE_SAMPLE_T`, `interpolatorFor` 를 삭제하고 아래로 교체:

```ts
/**
 * 라이트 테마 파스텔 램프(스펙 4절). 정지점 5개가 곧 5단계라 보간·샘플링이
 * 필요 없다. 밝기(luminance)는 단조 감소 — tests/unit/colors.test.ts 가 검사.
 */
const PALETTE_STOPS: Record<Polarity, readonly string[]> = {
  higherWorse: ["#fdf3e1", "#f9d9b0", "#f3b27f", "#e8865a", "#d9572b"],
  higherBetter: ["#e9f6ef", "#bfe6d2", "#8fd1b6", "#5cb59a", "#2f8f7a"],
  neutral: ["#f2eef7", "#d8cfe9", "#b8a9d6", "#9282bf", "#6d5ba3"],
};

/** 5-step palette for a polarity: the ramp's stops, lightest first. */
export function paletteFor(polarity: Polarity): RGB[] {
  return PALETTE_STOPS[polarity].map(parseColor);
}

/** Rec. 709 luma in 0..1 — enough to assert palette monotonicity; not WCAG (see src/lib/theme.ts for that). */
export function luminance([r, g, b]: RGB): number {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

/** Linear blend toward `target` by `t` in [0,1] (t=0 → rgb, t=1 → target). */
export function mix(rgb: RGB, target: RGB, t: number): RGB {
  return [
    clampByte(rgb[0] + (target[0] - rgb[0]) * t),
    clampByte(rgb[1] + (target[1] - rgb[1]) * t),
    clampByte(rgb[2] + (target[2] - rgb[2]) * t),
  ];
}
```

(`clampByte` 는 파일 아래쪽에 이미 있다 — 함수 선언이라 호이스팅되므로 위치는 무관. `parseColor` 와 `dim` 은 그대로 둔다.)

- [ ] **Step 4: 팔레트 테스트 통과**

Run: `npx vitest run tests/unit/colors.test.ts`
Expected: PASS.

- [ ] **Step 5: 조명·후처리 테스트 갱신(실패 확인용)**

`tests/unit/lighting.test.ts`: 방향 기대값 `[-0.5, -1, -2.5]`, ambient intensity `0.95`(두 곳: :49, :176), `shadowColor` `[60 / 255, 50 / 255, 40 / 255, 0.18]`, `REGION_MATERIAL` 단언이 있으면 `{ ambient: 0.55, diffuse: 0.65, shininess: 8, specularColor: [0.08, 0.08, 0.08] }`. 라이트 색 단언 추가:

```ts
it("uses warm daylight colors (ambient [255,250,240], key [255,245,225] @ 1.15)", () => {
  expect(ambientLight(lightingEffect).color).toEqual([255, 250, 240]);
  const key = directionalLights(lightingEffect)[0];
  expect(key.color).toEqual([255, 245, 225]);
  expect(key.intensity).toBe(1.15);
});
```

(`ambientLight`/`directionalLights` 헬퍼는 이 테스트 파일에 이미 있다 — 이름이 다르면 파일의 기존 헬퍼를 쓴다.)

`tests/unit/effects.test.ts`: 후처리 값 단언을 `vibrance { amount: 0.15 }`, `brightnessContrast { brightness: 0.02, contrast: 0.05 }`, `vignette { radius: 0.9, amount: 0.15 }` 로. 순서(fxaa 마지막, tiltShift 발표 모드만, fxOff → `[]`) 단언은 그대로.

Run: `npx vitest run tests/unit/lighting.test.ts tests/unit/effects.test.ts`
Expected: FAIL(값 불일치).

- [ ] **Step 6: `lighting.ts`·`effects.ts` 구현**

`lighting.ts` 상수를 다음으로:

```ts
const KEY_DIRECTION: [number, number, number] = [-0.5, -1, -2.5];
const AMBIENT_INTENSITY = 0.95;
const AMBIENT_COLOR: [number, number, number] = [255, 250, 240];
const KEY_COLOR: [number, number, number] = [255, 245, 225];
const KEY_INTENSITY = 1.15;

export const lightingEffect = new CollisionAwareLightingEffect({
  ambient: new AmbientLight({ color: AMBIENT_COLOR, intensity: AMBIENT_INTENSITY }),
  key: new DirectionalLight({ color: KEY_COLOR, intensity: KEY_INTENSITY, direction: KEY_DIRECTION, _shadow: true }),
});

lightingEffect.shadowColor = [60 / 255, 50 / 255, 40 / 255, 0.18];

export const lightingEffectNoShadow = new CollisionAwareLightingEffect({
  ambient: new AmbientLight({ color: AMBIENT_COLOR, intensity: AMBIENT_INTENSITY }),
  key: new DirectionalLight({ color: KEY_COLOR, intensity: KEY_INTENSITY, direction: KEY_DIRECTION, _shadow: false }),
});

export const REGION_MATERIAL: Material = {
  ambient: 0.55,
  diffuse: 0.65,
  shininess: 8,
  specularColor: [0.08, 0.08, 0.08],
};
```

(`useInPicking`, `CollisionAwareLightingEffect` 는 그대로. 주석 중 "dark navy shadow tint" 등 다크 전제 문장은 낮 조명 설명으로 고친다.)

`effects.ts`:

```ts
  const effects: Effect[] = [
    new PostProcessEffect(vibrance, { amount: 0.15 }),
    new PostProcessEffect(brightnessContrast, { brightness: 0.02, contrast: 0.05 }),
    new PostProcessEffect(vignette, { radius: 0.9, amount: 0.15 }),
  ];
```

Run: `npx vitest run tests/unit/lighting.test.ts tests/unit/effects.test.ts`
Expected: PASS.

- [ ] **Step 7: 레이어 색 테스트 갱신(실패 확인용)**

`tests/unit/regionLayers.test.ts`:
- `:87` `highlightColor` → `[0, 0, 0, 25]` (islands 쪽 동일 단언도).
- `:396-408` 상단 링: 선택 `[28, 35, 49, 230]`, 비선택 `[60, 60, 70, 120]`.
- `:451-464` neighbors: 비마스크 `getFillColor [232, 228, 220]`, `getLineColor [190, 182, 170]`; 마스크 `getFillColor [255, 255, 255, 90]`, `getLineColor [120, 110, 100, 120]`.
- `:488` footprint `getLineColor [200, 192, 180, 200]`; footprint `getFillColor [255, 252, 246]` 단언 추가.
- `:216` 선택 강조: `SELECTED_BRIGHTEN` 기대를 "선택 시군은 원색 그대로"로 — `expect(color).toEqual([10, 20, 30, 255])`.
- `:223-235` 비선택: `dim(rgb, 0.55)` 대신 `mix(rgb, [255, 252, 246], 0.45)` 로 기대값 계산(`import { mix } from "@/lib/colors"`); 테스트 이름 "fades a non-selected region 45% toward paper".

`tests/unit/labelLayer.test.ts:50` `getBackgroundColor [255, 255, 255, 225]`; `getColor [28, 35, 49, 255]`, `outlineColor [255, 255, 255, 255]` 단언 추가.

`tests/unit/schoolLayers.test.ts:108` `highlightColor [0, 0, 0, 70]`; 학교 칩 `getBackgroundColor [255, 255, 255, 225]`, `getColor [28, 35, 49, 255]`, `outlineColor [255, 255, 255, 255]` 단언(기존에 칩 색 단언이 있으면 값만 교체). `SCHOOL_LEVEL_COLORS` 값 단언 추가:

```ts
it("SCHOOL_LEVEL_COLORS are the light-theme values", () => {
  expect(SCHOOL_LEVEL_COLORS.elem).toEqual([29, 155, 209, 255]);
  expect(SCHOOL_LEVEL_COLORS.mid).toEqual([224, 169, 43, 255]);
  expect(SCHOOL_LEVEL_COLORS.high).toEqual([224, 89, 42, 255]);
  expect(SCHOOL_LEVEL_COLORS.special).toEqual([90, 166, 74, 255]);
});
```

`tests/unit/emdLayer.test.ts:85` 부근 `getColor [60, 60, 70, 110]`.

Run: `npx vitest run tests/unit/regionLayers.test.ts tests/unit/labelLayer.test.ts tests/unit/schoolLayers.test.ts tests/unit/emdLayer.test.ts`
Expected: FAIL(값 불일치).

- [ ] **Step 8: 레이어 색 구현**

`src/components/map/layers/regionLayers.ts`:
- `:58-59` → `getFillColor: masked ? [255, 255, 255, 90] : [232, 228, 220]`, `getLineColor: masked ? [120, 110, 100, 120] : [190, 182, 170]`.
- footprint(`:80-90` 부근): `getFillColor: [255, 252, 246]`(없으면 추가, `filled: true`), `getLineColor: [200, 192, 180, 200]`.
- `:154`, `:205` `highlightColor: [0, 0, 0, 25]`.
- `:276` `getColor: (d): RGBA => (d.code === selectedCode ? [28, 35, 49, 230] : [60, 60, 70, 120])`.
- 선택/비선택 채움(`:11`, `:100-110` `selectionAwareFillColor`): `import { mix } from "@/lib/colors"` 로 바꾸고

```ts
/** 시군 바닥판/종이 색 — 비선택 시군은 이 색 쪽으로 45% 페이드(라이트 테마: 어둡게 하면 탁해진다). */
const PAPER: RGB = [255, 252, 246];
const UNSELECTED_FADE = 0.45;

function selectionAwareFillColor(code: string, fillColorOf: (code: string) => RGBA, selectedCode: string | null): RGBA {
  const [r, g, b, a] = fillColorOf(code);
  if (!selectedCode || code === selectedCode) return [r, g, b, a];
  const [fr, fg, fb] = mix([r, g, b], PAPER, UNSELECTED_FADE);
  return [fr, fg, fb, a];
}
```

(기존 `SELECTED_BRIGHTEN`/`UNSELECTED_DIM` 상수와 `dim` import 는 삭제. 함수 이름·시그니처는 기존 것을 유지해 호출부는 그대로.)

`src/components/map/layers/labelLayer.ts:105-113`: `outlineColor: [255, 255, 255, 255]`, `getColor: [28, 35, 49, 255]`, `getBackgroundColor: [255, 255, 255, 225]`.

`src/components/map/layers/schoolLayers.ts`: `:75` `HIGHLIGHT_COLOR = [0, 0, 0, 70]`; `:256-262` `outlineColor: [255, 255, 255, 255]`, `getColor: [28, 35, 49, 255]`, `getBackgroundColor: [255, 255, 255, 225]`.

`src/lib/schoolVisuals.ts:6-11`:

```ts
export const SCHOOL_LEVEL_COLORS: Record<SchoolLevel, RGBA> = {
  elem: [29, 155, 209, 255], // #1d9bd1 — blue
  mid: [224, 169, 43, 255], // #e0a92b — amber
  high: [224, 89, 42, 255], // #e0592a — orange-red
  special: [90, 166, 74, 255], // #5aa64a — green
};
```

`src/components/map/layers/emdLayer.ts:98`: `getColor: [60, 60, 70, 110] as RGBA`.

Run: `npx vitest run tests/unit/regionLayers.test.ts tests/unit/labelLayer.test.ts tests/unit/schoolLayers.test.ts tests/unit/emdLayer.test.ts`
Expected: PASS.

- [ ] **Step 9: 전체 검증**

Run: `npm run typecheck && npm run lint && npm test && npm run build && npm run e2e`
Expected: 모두 통과(e2e 25). e2e 는 색을 단언하지 않는다.

- [ ] **Step 10: 스크린샷 튜닝**

Task 1 Step 10 의 캡처 스크립트로 `/`(overview), `/?region=52110`, `/?region=52730` 을 `test-results/light-map-{overview,jeonju,muju}.png` 로 찍어 Read 로 확인한다. 체크: 블록 옆면이 검지 않고 위 면보다 약간 어두운 정도인가, 그림자가 연한가, 파스텔 5단이 구분되는가, 흰 칩 글자가 읽히는가, 학교 기둥 색이 배경과 구분되는가. 어긋나면 스펙 3절 괄호 범위 안에서 `AMBIENT_INTENSITY`(0.9~1.05), `KEY_INTENSITY`(1.0~1.3), `shadowColor` alpha(0.15~0.25) 만 조정하고 테스트 기대값을 같이 고친다.

- [ ] **Step 11: 커밋**

```bash
git add src/lib/colors.ts src/lib/schoolVisuals.ts src/components/map/lighting.ts src/components/map/effects.ts src/components/map/layers tests/unit
git commit -m "feat(map): daylight lighting, pastel palettes, light block/label/school colors

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: 배경 지도 3단(끄기 · 위성 + 워시 · 일반)

**Files:**
- Modify: `src/components/map/basemapPref.ts` (3단 모드 + 마이그레이션)
- Modify: `src/components/map/layers/basemapLayer.ts` (`vworldTileUrl` 확장자, 타일 종류, `desaturate`, 워시 레이어)
- Modify: `src/components/map/MapOverlay.tsx` (세그먼트 항목)
- Modify: `src/components/map/DeckMap.tsx` (상태·오버레이 항목·레이어 배선)
- Modify: `e2e/basemap.spec.ts`, `README.md`
- Test: `tests/unit/basemapPref.test.ts`, `tests/unit/basemapLayer.test.ts`, `tests/components/MapOverlay.test.tsx`

**Interfaces:**
- Produces: `type BasemapMode = "off" | "satellite" | "base"`, `readBasemapPref(): BasemapMode`, `writeBasemapPref(mode: BasemapMode)`, `type BasemapTiles = Exclude<BasemapMode, "off">`, `vworldTileUrl(key, layer = "midnight", ext = "png")`, `makeBasemapLayer(key: string, tiles: BasemapTiles)`, `makeBasemapWashLayer(tiles: BasemapTiles)`(id `basemap-wash`), `MapOverlayItem = MapOverlayToggleItem | MapOverlaySegmentedItem`.
- Consumes: Task 1 의 토큰 클래스.

- [ ] **Step 1: `basemapPref` 테스트 갱신(실패 확인용)**

`tests/unit/basemapPref.test.ts` 의 기대값을 다음 표로 바꾼다(파일의 localStorage 모킹 헬퍼는 유지):

```ts
it("defaults to 'satellite' when nothing is stored yet", () => {
  expect(readBasemapPref()).toBe("satellite");
});
it("migrates the old boolean values: '1' → satellite, '0' → off", () => {
  storage.getItem.mockReturnValue("1");
  expect(readBasemapPref()).toBe("satellite");
  storage.getItem.mockReturnValue("0");
  expect(readBasemapPref()).toBe("off");
});
it("reads the three modes back verbatim and falls back to satellite on garbage", () => {
  for (const mode of ["off", "satellite", "base"] as const) {
    storage.getItem.mockReturnValue(mode);
    expect(readBasemapPref()).toBe(mode);
  }
  storage.getItem.mockReturnValue("midnight");
  expect(readBasemapPref()).toBe("satellite");
});
it("write stores the mode string under 'jbmap.basemap'", () => {
  writeBasemapPref("base");
  expect(storage.setItem).toHaveBeenCalledWith("jbmap.basemap", "base");
});
it("defaults to 'satellite' when localStorage.getItem throws", () => { /* 기존 throw 모킹 그대로, 기대값만 'satellite' */ });
```

Run: `npx vitest run tests/unit/basemapPref.test.ts`
Expected: FAIL.

- [ ] **Step 2: `basemapPref.ts` 구현**

```ts
export type BasemapMode = "off" | "satellite" | "base";

const STORAGE_KEY = "jbmap.basemap";
const DEFAULT_MODE: BasemapMode = "satellite";

function parse(raw: string | null): BasemapMode {
  if (raw === null) return DEFAULT_MODE;
  if (raw === "1") return "satellite"; // 2차 개선(Task C) 시절의 boolean 저장값
  if (raw === "0") return "off";
  if (raw === "off" || raw === "satellite" || raw === "base") return raw;
  return DEFAULT_MODE;
}

export function readBasemapPref(): BasemapMode {
  if (typeof window === "undefined") return DEFAULT_MODE;
  try {
    return parse(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return DEFAULT_MODE;
  }
}

export function writeBasemapPref(mode: BasemapMode): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // private mode etc. — the in-memory state still applies for this session
  }
}
```

Run: `npx vitest run tests/unit/basemapPref.test.ts` → PASS.

- [ ] **Step 3: 타일/워시 레이어 테스트(실패 확인용)**

`tests/unit/basemapLayer.test.ts` 에 추가/변경:

```ts
import { BitmapLayer, SolidPolygonLayer } from "@deck.gl/layers";
import { makeBasemapLayer, makeBasemapWashLayer, vworldTileUrl } from "@/components/map/layers/basemapLayer";

it("vworldTileUrl takes an extension: Satellite tiles are jpeg", () => {
  expect(vworldTileUrl("k", "Satellite", "jpeg")).toBe("https://api.vworld.kr/req/wmts/1.0.0/k/Satellite/{z}/{y}/{x}.jpeg");
  expect(vworldTileUrl("k", "Base")).toBe("https://api.vworld.kr/req/wmts/1.0.0/k/Base/{z}/{y}/{x}.png");
});

it("satellite mode requests Satellite jpeg tiles; base mode requests Base png tiles", () => {
  expect(makeBasemapLayer("k", "satellite").props.data).toBe(vworldTileUrl("k", "Satellite", "jpeg"));
  expect(makeBasemapLayer("k", "base").props.data).toBe(vworldTileUrl("k", "Base", "png"));
});

it("renderSubLayers desaturates only the base (road map) tiles", () => {
  const fakeTile = { tile: { boundingBox: [[126, 35], [127, 36]] }, data: {} as ImageBitmap, id: "t" };
  const sat = makeBasemapLayer("k", "satellite").props.renderSubLayers(fakeTile as never) as BitmapLayer;
  const base = makeBasemapLayer("k", "base").props.renderSubLayers(fakeTile as never) as BitmapLayer;
  expect(sat.props.desaturate).toBe(0);
  expect(base.props.desaturate).toBe(0.5);
});

describe("makeBasemapWashLayer", () => {
  it("is a non-pickable, non-shadow-casting white SolidPolygonLayer over the basemap extent", () => {
    const layer = makeBasemapWashLayer("satellite");
    expect(layer).toBeInstanceOf(SolidPolygonLayer);
    expect(layer.props.id).toBe("basemap-wash");
    expect(layer.props.pickable).toBe(false);
    expect(layer.props.shadowEnabled).toBe(false);
    expect(layer.props.parameters).toMatchObject({ depthWriteEnabled: false });
    expect(layer.props.getFillColor).toEqual([255, 255, 255, 110]);
  });
  it("uses a lighter wash for the base map", () => {
    expect(makeBasemapWashLayer("base").props.getFillColor).toEqual([255, 255, 255, 60]);
  });
  it("covers the CONTROLLER.maxBounds rectangle (one polygon, 5 closed ring points)", () => {
    const [d] = makeBasemapWashLayer("satellite").props.data as { polygon: number[][] }[];
    expect(d.polygon).toEqual([[125.6, 34.7], [128.7, 34.7], [128.7, 36.7], [125.6, 36.7], [125.6, 34.7]]);
  });
});
```

기존 "builds the VWorld WMTS midnight URL template" 테스트는 그대로(기본값 유지). 기존 `makeBasemapLayer("mykey")` 호출 두 곳은 `makeBasemapLayer("mykey", "satellite")` 로 바꾸고 `data` 기대값은 `vworldTileUrl("mykey", "Satellite", "jpeg")`.

Run: `npx vitest run tests/unit/basemapLayer.test.ts` → FAIL.

- [ ] **Step 4: `basemapLayer.ts` 구현**

```ts
import { TileLayer } from "@deck.gl/geo-layers";
import { BitmapLayer, SolidPolygonLayer } from "@deck.gl/layers";
import type { BitmapLayerProps } from "@deck.gl/layers";

import type { BasemapMode } from "@/components/map/basemapPref";
import { CONTROLLER } from "@/components/map/camera";

export type BasemapTiles = Exclude<BasemapMode, "off">;

/** VWorld WMTS: row = y, column = x. Satellite tiles are jpeg, the others png. */
export function vworldTileUrl(key: string, layer: string = "midnight", ext: string = "png"): string {
  return `https://api.vworld.kr/req/wmts/1.0.0/${key}/${layer}/{z}/{y}/{x}.${ext}`;
}

const TILE_SOURCE: Record<BasemapTiles, { layer: string; ext: string; desaturate: number }> = {
  satellite: { layer: "Satellite", ext: "jpeg", desaturate: 0 },
  base: { layer: "Base", ext: "png", desaturate: 0.5 },
};

const [[WEST, SOUTH], [EAST, NORTH]] = CONTROLLER.maxBounds;
const BASEMAP_EXTENT: [number, number, number, number] = [WEST, SOUTH, EAST, NORTH];

export function makeBasemapLayer(key: string, tiles: BasemapTiles) {
  const source = TILE_SOURCE[tiles];
  return new TileLayer<ImageBitmap, { shadowEnabled: boolean }>({
    id: "basemap",
    data: vworldTileUrl(key, source.layer, source.ext),
    tileSize: 256,
    minZoom: 6,
    maxZoom: 18,
    extent: BASEMAP_EXTENT,
    maxRequests: 6,
    onTileError: () => {},
    shadowEnabled: false,
    pickable: false,
    parameters: { depthWriteEnabled: false },
    renderSubLayers: (props) => {
      const { boundingBox } = props.tile;
      return new BitmapLayer(props as unknown as BitmapLayerProps, {
        data: undefined,
        image: props.data,
        bounds: [boundingBox[0][0], boundingBox[0][1], boundingBox[1][0], boundingBox[1][1]],
        desaturate: source.desaturate,
      });
    },
  });
}

const WASH_ALPHA: Record<BasemapTiles, number> = { satellite: 110, base: 60 };
const WASH_DATA = [
  { polygon: [[WEST, SOUTH], [EAST, SOUTH], [EAST, NORTH], [WEST, NORTH], [WEST, SOUTH]] },
];

/** 타일 위에 얹는 반투명 흰 워시 — 위성 사진을 밝은 인쇄물처럼 만든다(스펙 2절). */
export function makeBasemapWashLayer(tiles: BasemapTiles) {
  return new SolidPolygonLayer<{ polygon: number[][] }, { shadowEnabled: boolean }>({
    id: "basemap-wash",
    data: WASH_DATA,
    getPolygon: (d) => d.polygon,
    getFillColor: [255, 255, 255, WASH_ALPHA[tiles]],
    filled: true,
    extruded: false,
    pickable: false,
    shadowEnabled: false,
    parameters: { depthWriteEnabled: false },
  });
}
```

(기존 주석 중 midnight 전제 문장은 위성/일반 설명으로 고친다. `renderSubLayers` 테스트에서 `props.tile.boundingBox` 만 쓰므로 위 형태를 유지한다.)

Run: `npx vitest run tests/unit/basemapLayer.test.ts` → PASS.

- [ ] **Step 5: `MapOverlay` 세그먼트 테스트(실패 확인용)**

`tests/components/MapOverlay.test.tsx` 에 추가:

```tsx
it("renders a segmented item as a radiogroup with one checked radio, and reports changes", async () => {
  const onChange = vi.fn();
  render(
    <MapOverlay
      items={[
        {
          kind: "segmented",
          id: "basemap",
          label: "배경 지도",
          value: "satellite",
          options: [
            { value: "off", label: "끄기" },
            { value: "satellite", label: "위성" },
            { value: "base", label: "일반" },
          ],
          onChange,
        },
      ]}
    />,
  );
  const group = screen.getByRole("radiogroup", { name: "배경 지도" });
  const radios = within(group).getAllByRole("radio");
  expect(radios.map((r) => r.textContent)).toEqual(["끄기", "위성", "일반"]);
  expect(radios[1]).toHaveAttribute("aria-checked", "true");
  expect(radios[0]).toHaveAttribute("aria-checked", "false");
  await userEvent.setup().click(radios[2]);
  expect(onChange).toHaveBeenCalledWith("base");
});
```

(`within` 은 `@testing-library/react` 에서 import. 기존 토글 테스트의 items 는 `kind` 없이 그대로 두어 하위호환을 검사한다.)

Run: `npx vitest run tests/components/MapOverlay.test.tsx` → FAIL.

- [ ] **Step 6: `MapOverlay.tsx` 구현**

```tsx
"use client";

export interface MapOverlayToggleItem {
  kind?: "toggle";
  id: string;
  label: string;
  pressed: boolean;
  onToggle: () => void;
  title?: string;
}

export interface MapOverlaySegmentedItem<V extends string = string> {
  kind: "segmented";
  id: string;
  /** radiogroup 의 접근 가능한 이름(예: "배경 지도"). */
  label: string;
  value: V;
  options: { value: V; label: string }[];
  onChange: (value: V) => void;
  title?: string;
}

export type MapOverlayItem = MapOverlayToggleItem | MapOverlaySegmentedItem;

export interface MapOverlayProps {
  items: MapOverlayItem[];
  attribution?: string;
}

const BUTTON = "pointer-events-auto rounded px-2.5 py-1 text-xs backdrop-blur-sm transition-colors";
const ON = "bg-surface font-semibold text-ink shadow-sm";
const OFF = "bg-surface/70 text-ink-muted hover:bg-surface";

export default function MapOverlay({ items, attribution }: MapOverlayProps) {
  if (items.length === 0 && !attribution) return null;

  return (
    <div className="pointer-events-none absolute right-3 top-3 z-10 flex flex-col items-end gap-1.5">
      {items.length > 0 && (
        <div className="flex gap-1.5">
          {items.map((item) =>
            item.kind === "segmented" ? (
              <div
                key={item.id}
                role="radiogroup"
                aria-label={item.label}
                title={item.title}
                className="pointer-events-auto flex overflow-hidden rounded border border-line bg-surface/70 backdrop-blur-sm"
              >
                {item.options.map((opt) => {
                  const checked = opt.value === item.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      role="radio"
                      aria-checked={checked}
                      onClick={() => item.onChange(opt.value)}
                      className={`px-2.5 py-1 text-xs transition-colors ${checked ? "bg-surface font-semibold text-ink" : "text-ink-muted hover:bg-surface"}`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            ) : (
              <button
                key={item.id}
                type="button"
                aria-pressed={item.pressed}
                title={item.title}
                onClick={item.onToggle}
                className={`${BUTTON} ${item.pressed ? ON : OFF}`}
              >
                {item.label}
              </button>
            ),
          )}
        </div>
      )}
      {attribution && (
        <div data-testid="basemap-attribution" className="rounded bg-surface/70 px-2 py-0.5 text-[10px] text-ink-muted backdrop-blur-sm">
          {attribution}
        </div>
      )}
    </div>
  );
}
```

Run: `npx vitest run tests/components/MapOverlay.test.tsx` → PASS.

- [ ] **Step 7: `DeckMap.tsx` 배선**

- import: `import { readBasemapPref, writeBasemapPref, type BasemapMode } from "@/components/map/basemapPref";` 와 `import { makeBasemapLayer, makeBasemapWashLayer } from "@/components/map/layers/basemapLayer";`
- 상태(`:520-527` 대체):

```ts
  const [basemapMode, setBasemapMode] = useState<BasemapMode>(() => readBasemapPref());
  const handleBasemapChange = useCallback((mode: BasemapMode) => {
    writeBasemapPref(mode);
    setBasemapMode(mode);
  }, []);
```

- 오버레이 항목(`:581-586` 대체):

```ts
    if (VWORLD_KEY) {
      items.push({
        kind: "segmented",
        id: "basemap",
        label: "배경 지도",
        value: basemapMode,
        options: [
          { value: "off", label: "끄기" },
          { value: "satellite", label: "위성" },
          { value: "base", label: "일반" },
        ],
        onChange: handleBasemapChange,
        title: "브이월드 배경 타일: 끄기 / 위성 / 일반",
      });
    }
```

  의존성 배열의 `basemapEnabled, handleBasemapToggle` → `basemapMode, handleBasemapChange`.
- 게이트·레이어(`:611-624` 대체):

```ts
  const basemapOn = !!VWORLD_KEY && basemapMode !== "off";

  const basemapLayer = useMemo(
    () => (VWORLD_KEY && basemapMode !== "off" ? makeBasemapLayer(VWORLD_KEY, basemapMode) : null),
    [basemapMode],
  );
  const basemapWashLayer = useMemo(
    () => (basemapMode !== "off" && VWORLD_KEY ? makeBasemapWashLayer(basemapMode) : null),
    [basemapMode],
  );
```

- `layerList` 에서 `basemapLayer` 바로 다음(neighbors 앞)에 `basemapWashLayer` 를 넣고, `layers` useMemo 의존성 배열에 `basemapWashLayer` 를 추가한다. `masked: basemapOn`, `attribution={basemapOn ? …}` 은 그대로.
- 주석의 "boolean toggle"·"jbmap.basemap 에 '1'/'0'" 문구를 3단 설명으로 고친다.

Run: `npm run typecheck && npm run lint && npm test`
Expected: 통과.

- [ ] **Step 8: e2e 재작성**

`e2e/basemap.spec.ts` 의 테스트 본문을 다음 흐름으로 바꾼다(헬퍼 `waitForMapReady`, `basemapLayerId`, `retries` 설정, 콘솔 error 수집은 유지):

```ts
    const group = page.getByRole("radiogroup", { name: "배경 지도" });
    const radio = (name: string) => group.getByRole("radio", { name });
    await expect(radio("위성")).toHaveAttribute("aria-checked", "true");
    await expect.poll(() => basemapLayerId(page)).toBe("basemap");
    await expect(page.getByTestId("basemap-attribution")).toBeVisible();

    await radio("끄기").click();
    await expect(radio("끄기")).toHaveAttribute("aria-checked", "true");
    await expect.poll(() => basemapLayerId(page)).toBeNull();
    await expect(page.getByTestId("basemap-attribution")).toHaveCount(0);

    await radio("일반").click();
    await expect.poll(() => basemapLayerId(page)).toBe("basemap");
    await expect
      .poll(() => page.evaluate(() => {
        const layers = window.__jbmap!.deck.props.layers as ({ id: string; props: { data: string } } | null)[];
        return layers.find((l) => l?.id === "basemap")?.props.data ?? null;
      }))
      .toContain("/Base/");

    await page.reload();
    await waitForMapReady(page);
    await expect(radio("일반")).toHaveAttribute("aria-checked", "true");
    await expect.poll(() => basemapLayerId(page)).toBe("basemap");
```

(위성 타일 요청은 fixtures 의 `**/api.vworld.kr/**` 스텁이 1×1 PNG 로 응답하므로 jpeg 확장자여도 콘솔 error 가 나지 않는다 — 나면 `onTileError` no-op 이 깨진 것이니 확인.)

Run: `npx playwright test e2e/basemap.spec.ts e2e/a11y.spec.ts e2e/smoke.spec.ts`
Expected: 통과.

- [ ] **Step 9: README 갱신**

README 의 배경 지도 설명 문단에 한 줄 추가: "배경 지도는 끄기 · 위성(기본, 밝은 워시) · 일반(채도 낮춤) 3단이며 선택은 브라우저에 저장됩니다(`jbmap.basemap`). 화면 전체는 라이트 테마입니다."

- [ ] **Step 10: 전체 검증·스크린샷·커밋**

Run: `npm run typecheck && npm run lint && npm test && npm run build && npm run e2e`
Expected: 모두 통과. Task 1 Step 10 스크립트로 `/`(위성 기본), 그리고 브라우저에서 라디오를 눌러 `일반`·`끄기` 상태를 각각 `test-results/basemap-{satellite,base,off}.png` 로 캡처해 Read 로 확인(위성이 밝은 인쇄물처럼 보이고 블록·칩이 또렷한가, 일반은 종이 느낌인가). 워시 alpha 는 스펙 허용 범위(±30) 안에서만 조정하고 테스트 기대값을 같이 고친다.

```bash
git add src/components/map/basemapPref.ts src/components/map/layers/basemapLayer.ts src/components/map/MapOverlay.tsx src/components/map/DeckMap.tsx e2e/basemap.spec.ts README.md tests/unit/basemapPref.test.ts tests/unit/basemapLayer.test.ts tests/components/MapOverlay.test.tsx
git commit -m "feat(map): basemap modes off/satellite(+wash)/base with segmented control

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## 실행 후

최종 전체 브랜치 리뷰(Opus) → 단일 fix wave → `CI=1 npm run e2e` → 푸시 → CI·Vercel 확인 → 오케스트레이터 스크린샷 확인은 subagent-driven-development 절차가 담당한다.
