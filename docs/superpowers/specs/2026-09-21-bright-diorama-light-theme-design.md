# 전북교육지도 — 밝은 디오라마 + 라이트 테마 설계 (2026-09-21)

## 배경과 목표

2차 개선(미니어처 디오라마, main `03b2bdb` 기준)으로 그림자·후처리·브이월드 midnight 배경·라벨 칩·학교 기둥·읍면동 경계가 들어갔지만, 사용자는 결과 그래픽을 "평면적이고 디테일이 부족하며, 색감·조명 톤과 블록 질감, 배경 타일 모두 별로"라고 평가했다. 목표 분위기는 **밝은 미니어처 모형(낮 조명)** 이다. 사용자가 확정한 결정:

- 접근: **A(밝은 디오라마, 지형 없음)를 먼저** 완성하고, 주변 지형(C, TerrainLayer)은 다음 계획으로.
- UI: **전체 라이트 테마**(지도와 패널·상단바·범례·푸터 모두). 다크 테마 토글 없음.
- 블록 아래 배경 기본값: **위성 타일 + 밝은 흰색 워시**. 일반 지도(`Base`)는 토글로 전환 가능. 배경 없음(단색 바닥)도 선택 가능.
- 시군 팔레트: **따뜻한 파스텔**(크림→살구→코랄). 역방향 지표는 민트→틸, 중립은 연보라.
- 라벨: **흰색 칩 + 진한 글자**(구조 유지, 색만 반전).
- 조작(이미 반영됨, `03b2bdb`): 북쪽 고정·회전 없음, 좌클릭 드래그 이동, 스크롤 줌. 이 설계는 카메라를 바꾸지 않는다.

이 문서는 2차 설계(`~/.claude/plans/twinkling-floating-wombat.md`)의 렌더 파이프라인을 전제로 하고, 1차 설계 문서(`2026-09-20-jb-edu-map-design.md`)의 데이터·상태 계약은 그대로 둔다.

## 검증된 사실

- 브이월드 WMTS는 현재 키로 `Base`(밝은 일반 지도, png), `Satellite`(jpeg), `Hybrid`(png, 지명 오버레이), `midnight`(png)를 반환하고 CORS `*` 를 준다. `gray` 는 XML(미지원). URL 규칙은 `{z}/{y}/{x}` 로 동일하며 확장자만 레이어별로 다르다(`Satellite` 는 `.jpeg`).
- `Base` 타일은 노란 고속도로·도로 번호·시 지명이 있는 길찾기 지도 스타일이라 블록 아래에서 번잡하고 우리 라벨과 지명이 겹친다. `Satellite` 는 지명이 없고 산줄기·시가지가 드러나 DEM 없이도 지형감을 준다.
- deck.gl `BitmapLayer` 는 `desaturate`(0~1), `tintColor`, `transparentColor` 를 지원한다(설치된 9.4.0의 `bitmap-layer.d.ts`). `tintColor` 는 곱셈이라 **밝게 만들 수는 없으므로** 밝은 워시는 타일 위에 반투명 흰 폴리곤 한 장으로 얹는다.
- `@deck.gl/widgets` 는 `LightTheme`/`LightGlassTheme` 를 export 한다.
- 현재 다크 색은 18개 파일에 유틸리티 클래스로 흩어져 있다(`text-[#e6e9f0]/50` 31회, `text-[#e6e9f0]` 19회, `bg-white/10` 12회, `bg-[#0b0f19]` 8회 등). `globals.css` 에는 `@theme` 토큰이 없다.
- 색 리터럴을 고정한 테스트: `tests/unit/{colors,lighting,regionLayers,labelLayer,schoolLayers,emdLayer}.test.ts`, `tests/components/Legend.test.tsx`. e2e 에는 axe 가 없다(1차 설계 Section B 결정).

## 설계

### 1. 라이트 테마 토큰과 UI

`src/app/globals.css` 에 Tailwind v4 `@theme` 토큰을 정의한다.

| 토큰 | 값 | 용도 |
|---|---|---|
| `--color-paper` | `#f5f2eb` | 페이지·지도 컨테이너 배경(따뜻한 미색) |
| `--color-surface` | `#ffffff` | 패널·타일·팝오버 표면 |
| `--color-ink` | `#1c2331` | 본문 글자, 강조 선 |
| `--color-ink-muted` | `#5b6472` | 보조 글자(대비 ≥ 4.5:1 on paper/surface) |
| `--color-line` | `#e1dbd0` | 테두리·구분선 |
| `--color-accent` | `#d9572b` | 선택·강조(코랄) |
| `--color-accent-soft` | `#fbe9df` | 선택 행 배경 |

- 다크 유틸리티 클래스는 토큰 클래스로 치환한다: `bg-[#0b0f19]`→`bg-paper`, `text-[#e6e9f0]`→`text-ink`, `text-[#e6e9f0]/NN`→`text-ink-muted`(50~70) 또는 `text-ink/NN`, `bg-white/5|10`→`bg-ink/5`, `bg-white/15|20`→`bg-ink/10`, `border-white/10`→`border-line`, `bg-black/30`→`bg-surface/80`, `ring-white/70`→`ring-accent`. `#121826` 등 단발 리터럴도 같은 규칙.
- 대상 파일: `Dashboard.tsx`, `DashboardSkeleton.tsx`, `TopBar.tsx`, `KpiTiles.tsx`, `IndicatorMenu.tsx`, `IndicatorPicker.tsx`, `RegionList.tsx`, `RegionPanel.tsx`, `Legend.tsx`, `Footer.tsx`, `Sparkline.tsx`, `MapShell.tsx`, `MapFallback.tsx`, `MapOverlay.tsx`, `DeckMap.tsx`(컨테이너·`WIDGET_THEME_STYLE`), `globals.css`, `colors.ts`(`dim` 등 UI 색 유틸), `schoolVisuals.ts`(범례 스와치 색).
- deck.gl 위젯 테마는 `DarkGlassTheme`→`LightGlassTheme`. 스파크라인 선은 `--color-accent`, 축·격자는 `--color-line`.
- KPI 타일의 증감 표시는 **극성 기준**으로 칠한다: 지표에 좋은 변화(higherBetter 의 증가, higherWorse 의 감소)는 틸 `#2f8f7a`(`positive`), 나쁜 변화는 코랄(`accent`), 변화 없음·중립 지표는 `ink-muted`. 기존 `data-tone`(warn/ok) 과 같은 규칙을 색에도 적용한다(부호 기준이 아님 — Task 1 리뷰 룰링). 상단 지표 메뉴의 선택 항목은 `accent-soft` 배경.
- 대비: `tests/unit/theme.test.ts` 가 WCAG 상대 휘도 공식으로 (ink, paper), (ink, surface), (ink-muted, paper), (ink-muted, surface), (accent, surface) 쌍의 대비를 계산해 본문 쌍 ≥ 4.5, 강조 쌍 ≥ 3.0 을 단언한다(토큰 값은 CSS 에서 읽지 않고 `src/lib/theme.ts` 의 상수 객체를 단일 원천으로 두고 CSS 는 그 값을 복제 — 테스트가 `globals.css` 를 파싱해 두 곳이 일치하는지도 확인한다).
- 폴백 화면(좁은 뷰포트·WebGL 불가)과 스켈레톤도 같은 토큰을 쓴다. `data-testid`·aria·문구는 바꾸지 않는다.

### 2. 배경 지도 3단(끄기 · 위성 · 일반)

- 상태: `basemapPref.ts` 의 값을 `boolean` 에서 `BasemapMode = "off" | "satellite" | "base"` 로 확장한다. 저장 키 `jbmap.basemap` 유지, 기존 저장값 `"1"`→`satellite`, `"0"`→`off` 로 읽어 호환. 기본값 `satellite`(키가 있을 때). 키가 없으면 항상 `off` 이고 컨트롤을 표시하지 않는다.
- UI: `MapOverlay` 의 "배경 지도" 토글 버튼을 **세그먼트 컨트롤**(`role="radiogroup"`, 항목 `role="radio"` + `aria-checked`, 라벨 "배경 지도: 끄기 / 위성 / 일반")로 바꾼다. `MapOverlayItem` 에 `kind: "toggle" | "segmented"` 를 추가해 발표 모드·읍면동 경계는 토글 그대로 둔다. 출처 표기는 `off` 가 아닐 때 표시.
- 레이어: `makeBasemapLayer(key, mode)` — `satellite` 는 `Satellite/{z}/{y}/{x}.jpeg`, `base` 는 `Base/{z}/{y}/{x}.png` (`vworldTileUrl(key, layer, ext)`). `base` 의 BitmapLayer 는 `desaturate: 0.5`. 그 외 옵션(extent·zoom 범위·`onTileError` no-op·`depthWriteEnabled:false`)은 동일.
- 워시: 타일 바로 위에 `SolidPolygonLayer` id `basemap-wash`(extent 사각형 1개, `getFillColor` 위성 `[255,255,255,110]`, 일반 `[255,255,255,60]`, `pickable:false`, `shadowEnabled:false`, `parameters:{depthWriteEnabled:false}`). `off` 면 `null`. 스크린샷 튜닝으로 알파 ±30 조정 허용.
- 주변 시도(`neighbors`): 배경이 켜지면 `[255,255,255,90]`(워시 위 살짝 더 밝은 실루엣, 윤곽 `[120,110,100,120]`), 꺼지면 불투명 `[232,228,220]`(윤곽 `[190,182,170]`).
- e2e `basemap.spec.ts`: 라디오 3개 존재, 기본 `위성` checked + 레이어 id `basemap` + 출처 표기 → `끄기` 선택 시 레이어 null·출처 사라짐 → `일반` 선택 시 레이어 존재(URL 에 `/Base/`) → 새로고침 후 유지. 기존 fixture 의 `api.vworld.kr` 스텁은 jpeg 요청도 같은 1×1 PNG 로 응답해도 무방(BitmapLayer 는 content-type 이 아니라 디코드 결과만 본다 — 실패 시 `onTileError` no-op).

### 3. 낮 조명·후처리

`lighting.ts` / `effects.ts` 상수를 다음으로 바꾼다(스크린샷 튜닝 범위를 괄호에 표기).

- AmbientLight color `[255, 250, 240]`, intensity `0.95` (0.9~1.05).
- 키 DirectionalLight color `[255, 245, 225]`, intensity `1.15` (1.0~1.3), direction `[-0.5, -1, -2.5]`(좌상단 높은 각도, 그림자 짧게), `_shadow: true`. fx-off 변형도 같은 값.
- `shadowColor` `[60/255, 50/255, 40/255, 0.18]` (0.15~0.25).
- `REGION_MATERIAL` `{ ambient: 0.55, diffuse: 0.65, shininess: 8, specularColor: [0.08, 0.08, 0.08] }`.
- 후처리: `vibrance 0.15`, `brightnessContrast { brightness: 0.02, contrast: 0.05 }`, `vignette { radius: 0.9, amount: 0.15 }`, 발표 모드 `tiltShift` 유지, `fxaa` 마지막. 구조·메모화·비상 스위치(`NEXT_PUBLIC_MAP_FX=off`)는 그대로.
- `useInPicking`·`CollisionAwareLightingEffect` 등 우회책은 변경하지 않는다.

### 4. 팔레트·블록·바닥·주변

- `colors.ts`: d3 `interpolateOrRd/Blues/Viridis` 를 자체 램프(`interpolateRgbBasis`, d3-interpolate 는 이미 의존성)로 교체한다.
  - `higherWorse`(높을수록 진함, 따뜻한 파스텔): `["#fdf3e1", "#f9d9b0", "#f3b27f", "#e8865a", "#d9572b"]`
  - `higherBetter`(민트→틸): `["#e9f6ef", "#bfe6d2", "#8fd1b6", "#5cb59a", "#2f8f7a"]`
  - `neutral`(연보라): `["#f2eef7", "#d8cfe9", "#b8a9d6", "#9282bf", "#6d5ba3"]`
  - `PALETTE_SAMPLE_T` 는 `[0, 0.25, 0.5, 0.75, 1]` 로(램프 자체가 5개 정지점이라 극단값 회피가 필요 없다). `NULL_COLOR` `[205, 200, 192]`.
  - 밝기 단조성(colorblind-safe) 유지: 테스트가 각 램프의 5단계 상대 휘도가 단조 감소임을 단언.
- 시군 블록(`regions`/`region-islands`): 채움은 팔레트 그대로, `highlightColor [0, 0, 0, 25]`. 바닥판 `footprint` 채움 `[255, 252, 246]`, 윤곽 `[200, 192, 180, 200]`. 상단 링 비선택 `[60, 60, 70, 120]` 1px, 선택 `[28, 35, 49, 230]` 2px. 읍면동 경계선 `[60, 60, 70, 110]`.
- 색 구간·높이 스케일·전환(600ms)·updateTriggers·`data` 참조 규칙은 변경 없음.

### 5. 라벨·학교

- 시군 칩: `getColor [28, 35, 49, 255]`, `outlineColor [255, 255, 255, 255]`, `getBackgroundColor [255, 255, 255, 225]`, 패딩·반경·SDF·충돌 설정 유지. 학교 칩도 같은 색, 크기·패딩은 기존 값.
- `SCHOOL_LEVEL_COLORS`(밝은 배경용): 초 `#1d9bd1`, 중 `#e0a92b`, 고 `#e0592a`, 특수 `#5aa64a`. 기둥 `highlightColor [0, 0, 0, 70]`. 범례 스와치·패널 점 색은 같은 상수를 쓴다.
- 툴팁(`tooltip.ts`)은 흰 표면·잉크 글자·`line` 테두리.

### 6. 범위 밖(다음 계획)

주변 지형(C: TerrainLayer + Terrarium DEM, `@loaders.gl/terrain` 추가), 시군 경계 해상도 향상, 다크 테마 토글, 카메라 변경.

### 7. 검증

- 단위: 위 리터럴을 고정한 7개 테스트 파일 갱신 + `theme.test.ts`(대비·CSS 일치) + `basemapPref` 3단 마이그레이션 테스트 + 팔레트 단조성 테스트.
- e2e: 기존 25개 유지(`basemap.spec` 은 3단으로 재작성, `a11y.spec` 의 Tab 순서 테스트에 세그먼트 라디오 포함). 콘솔 error 0 단언 유지.
- 시각: 오케스트레이터가 overview·전주 선택·무주 선택·배경 3단 스크린샷을 직접 확인하고 조명·워시·팔레트를 튜닝 범위 안에서 조정한다. 프로덕션 배포 후 `prod-check.mjs` 로 콘솔 error 0 확인.

### 8. 작업 순서

1. **T1 라이트 UI** — 토큰·`theme.ts`·18개 파일 치환·위젯 테마·폴백/스켈레톤·툴팁·대비 테스트. (지도 레이어 색은 건드리지 않음)
2. **T2 지도 낮 조명·팔레트·블록·라벨·학교** — 3·4·5절. 스크린샷 튜닝 포함.
3. **T3 배경 3단** — 2절(상태 마이그레이션·세그먼트 UI·위성/일반 레이어·워시·e2e).
4. **최종 리뷰·튜닝** — 전체 브랜치 리뷰, fix wave, CI·배포 확인.

각 태스크는 이전과 같은 SDD 절차(Sonnet 구현자·리뷰어, 오케스트레이터 검증·커밋·푸시)로 main 에서 순차 진행한다.
