# 전북교육지도 (JB Edu Map) — 설계 및 구현 계획

## Context

전북특별자치도교육청 교육감의 정책 결정을 돕는 **웹 기반 상황실 대시보드**를 새로 만든다. 심시티의 "조건별 맵"처럼 전북 14개 시군을 3D로 세워, 선택한 교육 지표(학생수, 학급당 학생수, 소규모학교 비율, 교원 1인당 학생수 등)에 따라 높이·색이 바뀌는 지도가 핵심이다. 데이터는 전부 **공개 통계**에서 수집하고 출처를 화면에 명시해 "객관적 데이터 기반"이라는 신뢰를 확보한다. Vercel에 배포한다. 현재 디렉터리는 비어 있고 git 저장소도 아니다.

이 문서는 브레인스토밍 설계 문서를 겸한다. 승인 후 첫 구현 단계에서 `docs/superpowers/specs/2026-09-20-jb-edu-map-design.md`로 저장소에 커밋한다.

### 사용자 결정 사항
- 데이터: 공개 포털에서 수집
- 1차 지표 묶음: 학생·학교 규모 / 소규모·통폐합 위험 / 교원·인프라 / 취약·특수 집단 (4개 모두)
- 공간 단위: 14개 시군 면 + 학교 점
- 3D 스타일: 스타일화된 3D 데이터 지도 (배경 타일 없이 어두운 배경 위 입체 면)
- 학교급: 초·중·고 + 특수학교 (유치원은 후속)
- 시간축: 지도는 최신 연도(2026.4.1 기준) 스냅샷. 핵심 지표(학생수·학교수·학급수·교원수)만 시군별 5년치를 모아 상세 패널 추이와 전년 대비에 사용. 전 지표 연도 슬라이더는 후속.

### 가정
- 로그인 없는 공개 페이지. 모든 데이터가 공개 통계이므로 접근 제어 불필요.
- 정제된 JSON을 저장소에 커밋(정적). 갱신은 스크립트 재실행. 실시간 API 호출 없음.
- 상황실 대형 화면·데스크톱 우선. 768px 미만은 표 형태 폴백.
- UI 한국어. 패키지 매니저 npm. GitHub 원격·Vercel 연결은 사용자가 수행(로컬 `git init`과 커밋은 구현에 포함).

## 접근 방식

**Next.js 16(App Router) + TypeScript + deck.gl 9.4(배경지도 없음) + 정적 JSON + 지표 레지스트리.**

- 대안 비교: react-three-fiber 커스텀 씬은 디오라마 연출은 좋지만 투영·피킹·라벨·카메라를 전부 직접 구현해야 해 MVP에 부적합. MapLibre fill-extrusion 단독은 막대·애니메이션 표현이 제한적. 배경지도는 나중에 레이어 한 장으로 추가 가능하므로 1차에서 제외.
- 버전(2026-09-20 npm 확인): `next` 16.3.5, `react`/`react-dom` 19.3.0, `deck.gl` 9.4.0(umbrella로 설치. `@deck.gl/react` 단독 설치 시 `@deck.gl/widgets` peer 필수). 그 외 `d3-scale`, `d3-scale-chromatic`, `d3-format`, `nuqs`, `xlsx`, `tsx`, `mapshaper`(dev), `vitest`, `@testing-library/react`, `@playwright/test`. `maplibre-gl`·`three`는 설치하지 않음.
- Next.js 제약(공식 문서 확인): `dynamic(..., { ssr: false })`는 **'use client' 파일 안에서만** 허용. deck.gl을 import하는 파일은 `src/components/map/**`에만 둔다.

### 데이터 흐름
```
공개 출처(KESS xlsx, 위치 CSV, 폐교 CSV, admdongkor GeoJSON)
  → data/raw/ (gitignore)
  → scripts/pipeline/* (tsx)            정규화·매칭·집계·검증
  → data/interim/ (전북만, 커밋)
  → public/data/ (앱이 읽는 계약, 커밋)
  → DataProvider(클라이언트 fetch) → 순수 함수(scales/stats) → deck.gl 레이어 + 패널
URL(indicator, region) ↔ nuqs ↔ 화면 상태
```

## 데이터 계약 (`public/data/`)

파이프라인이 만들고 앱이 읽는 파일. 앱은 내부 시군 코드 `52xxx`와 전북 전체 행 `52000`만 안다.

| 파일 | 내용 |
|---|---|
| `regions.geojson` | 14개 시군 FeatureCollection. `properties: { code, name, bbox:[minLng,minLat,maxLng,maxLat], labelPoint:[lng,lat] }` |
| `neighbors.geojson` | 인접 시도(충남·전남·경남·경북) 실루엣, 맥락용 |
| `schools.json` | 학교 배열 `{ id, name, level:'elem'|'mid'|'high'|'special', status, branch, lat, lng, regionCode, students, classes, teachers, studentsPerClass, small }` |
| `indicators/<id>.json` | `{ id, year, referenceDate, source, rows:[{ regionCode, value:number|null, level? }] }` — **전북 전체 행(`52000`) 포함**(비율 지표는 Σ/Σ로 계산해 넣음) |
| `series/<id>.json` | 핵심 지표의 연도별 행 `{ regionCode, year, value }` (2022~2026, 14개 시군 + 52000) |
| `manifest.json` | `{ latestYear, indicators:{ id:{ years } }, builtAt }` |
| `charset.json` | TextLayer용 정적 문자 집합(시군명 + 전체 학교명 + 숫자·단위) |

### 지표 레지스트리 (`src/lib/indicators/`)
"조건별 맵" 하나를 추가하는 비용 = 파이프라인 집계 규칙 1개 + 레지스트리 항목 1개.

```ts
interface IndicatorDef {
  id: string;
  group: 'scale' | 'smallSchool' | 'teacherInfra' | 'vulnerable';
  label: string; shortLabel?: string; unit: string;
  polarity: 'higherBetter' | 'higherWorse' | 'neutral';
  kind: 'count' | 'ratio';
  scale?: 'linear' | 'sqrt';        // 기본 linear. sqrt는 범례에 명시
  domain?: [number, number];        // 기본: 14개 시군 min/max(52000 제외), 하한 0
  byLevel?: boolean;                // 학교급별 행 존재
  format: (v: number) => string;
  source: { name: string; url: string; year: number };
  aggregate: Aggregate;             // 파이프라인이 이것만으로 14개 시군 행 + 52000 행을 만든다
}
type Aggregate =
  | { kind: 'sum'; field: SchoolField }                                   // 학생수: Σ students
  | { kind: 'ratio'; numerator: SchoolField; denominator: SchoolField }   // 학급당 학생수: Σstudents / Σclasses
  | { kind: 'count'; predicate: (s: SchoolRow) => boolean }               // 소규모학교 수: students <= 60
  | { kind: 'share'; predicate: (s: SchoolRow) => boolean }               // 소규모학교 비율: count / 학교수
  | { kind: 'external'; file: string; field: string };                    // 폐교 수(폐교 CSV), 다문화(KESS 표) 등 학교행 밖 출처
interface IndicatorRow { regionCode: string; value: number | null; level?: string }
```
`SchoolRow`는 `parse-kess.ts`가 만드는 정규화 학교 행(`students, classes, teachers, entrants, specialClasses, specialStudents, siteArea, classrooms, areaType, branch, status, level …`). 비율의 전북 행은 Σ/Σ로, `share`는 조건 충족 수/학교수로 계산한다.
높이 상한은 지표별이 아니라 **전역 `ELEVATION_MAX` 하나** → 어떤 지표든 최대값 시군이 같은 높이가 되어 지표 간 비교가 일관된다.

## 지리 데이터 (리서치 검증 완료)

### 행정구역 코드 — 전북특별자치도 = 시도코드 `52`
2024-01-18 전환 이후 `45xxx` → `52xxx`. 경계 파일에서 직접 확인.

| 코드 | 시군 | 코드 | 시군 |
|---|---|---|---|
| 52111 / 52113 → **52110** | 전주시 완산구 / 덕진구 → 전주시로 병합 | 52720 | 진안군 |
| 52130 | 군산시 | 52730 | 무주군 |
| 52140 | 익산시 | 52740 | 장수군 |
| 52180 | 정읍시 | 52750 | 임실군 |
| 52190 | 남원시 | 52770 | 순창군 |
| 52210 | 김제시 | 52790 | 고창군 |
| 52710 | 완주군 | 52800 | 부안군 |

- 모든 경계 데이터는 전주시를 2개 구로 나눠 제공 → 15개를 14개로 병합. 조건 `sgg.startsWith('5211')`. `52110`은 내부 코드로만 사용.
- `src/lib/geo/regions.ts`에 `{ code, name }` 14행 상수 테이블. 모든 조인은 여기로 통과.

### 시군 경계 GeoJSON
- 출처: `vuski/admdongkor` `ver20260701/HangJeongDong_ver20260701.geojson`(33MB, 읍면동, WGS84, CC BY 4.0, 원자료 통계청 SGIS). 화면 하단에 `출처: 통계청 SGIS · vuski/admdongkor` 표기 필수.
- 전처리(`scripts/pipeline/build-regions.ts` + mapshaper): `sido === "52"` 필터 → `sgg_cd = adm_cd.substr(0,5)`, `5211*` → `52110` → `dissolve sgg_cd` → `-simplify 3~5% keep-shapes` → 좌표 소수점 5자리 → bbox·labelPoint 계산 → 목표 100~300KB. 인접 시도는 같은 파일에서 시도 단위 dissolve.
- 부적합 판정: `southkorea/southkorea-maps`(2018년 중단, 구 센서스 코드 35xxx), MapTiler 무료 티어(비상업 전용).

### 학교 좌표 — 지오코딩 불필요
- 출처: 공공데이터포털 **한국교육시설안전원_초중등학교위치** CSV(data.go.kr 15159184, 전국 12,011행, 반기 갱신, 이용제한 없음). 컬럼: 학교ID, 학교명, 학교급구분, 설립형태, 본교분교구분, 운영상태, 주소, 시도교육청명, 교육지원청명, **위도, 경도**. 포털 세션 때문에 자동 다운로드가 안 되므로 **브라우저에서 1회 수동 다운로드**해 `data/raw/`에 둔다.
- 전북 필터: `시도교육청명 ∈ {전북특별자치도교육청, 전라북도교육청}`.
- 결손 좌표 보정 순서: 학교알리미 `apiType=0`의 `LTTUD`/`LGTUD`(호출제한 없음, 출처표시, 소셜 로그인 즉시 발급) → 카카오 로컬 주소→좌표(무료 10만 건/일).
- 나이스 학교기본정보 API는 실호출로 **좌표 없음** 확인(무키 시 5행 제한). 학교 마스터로 쓰지 않는다.

### 배경지도 — 1차에서 사용하지 않음
deck.gl 단독 동작은 공식 문서 확인. 후속 필요 시 우선순위: 브이월드 `white`/`midnight` WMTS(한글 완벽, 도메인 바인딩) → OpenFreeMap(키 없음) → Protomaps 자체 호스팅.

## 교육통계 데이터 (리서치 검증 완료)

### 중심 출처: KESS 교육기본통계 「학교별 데이터셋」
- 인증 없이 직접 GET 성공: `https://kess.kedi.re.kr/contents/dataSet/downLoad.do?fileNm=<파일ID>.xlsx&userfileNm=x.xlsx`. 2026년 `2026835615251`(18MB, 기준일 2026-04-01), 2023년 `202511821715160`. 나머지 연도 ID는 `kess.kedi.re.kr/contents/dataset` 목록에서 확인.
- 시트 `학교별 주요통계`: 전국 20,660행 × 149컬럼, 전북 1,227행. 핵심 컬럼: 시도(`전북`), **행정구(14개 시군명 그대로, 전주시 단일)**, 학교급, 학교세부유형, 학교명, 학교코드(KEDI, 2026부터), 본분교, 설립, 상태(기존/신설/휴교/폐교), 지역규모(시/읍/면/특수), 주소, 일반·특수학급 학급수·학생수, 학년별 학급수·학생수, 학급당 학생수, 교원수(직위별·기간제), 교원1인당 학생수, 직원수, 입학자, 졸업자, 교실수, 교지면적, 학생1인당 교지면적.
- **없는 것**: 좌표, 다문화(이주배경) 학생수.
- 연도별 컬럼 스키마가 다름(2023=148열, 2026=149열) → 연도별 헤더 매핑 테이블. 대안: 전북교육청 게시판(`jbe.go.kr` BBS_0000534)의 연도별 전북 필터본 xlsx(2018~2025, 직접 다운로드 확인).
- 라이선스: 정식 조항 미확인(데이터셋 페이지는 산출물 작성 시 KEDI 송부 요청). 화면에 `출처: 한국교육개발원 교육통계서비스(KESS)` 표기.

### 보조 출처
| 용도 | 출처 | 상태 |
|---|---|---|
| 폐교 | 전북교육청_폐교재산 현황 CSV(data.go.kr 15021709, 2026-07-20, 시군구코드 포함) | 확인, 키 불필요 |
| 공식 총괄치(검증용) | 전북교육청 전북통계 주요지표 2026.4.1: 초402·중206·고132·특11·각종1 = **752교**, 학생 165,958(유치원 제외), 교원 18,928 | 확인 |
| 다문화(이주배경) | KESS 통계표 `[주제별] 이주배경(유형별) 학생수`(2026, cd=6819) | 표 존재 확인, **시군구 분해 미확인** |
| 2차 지표(급식·성별·직위별 교원·시설) | 학교알리미 Open API(34종, 호출제한 없음, 출처표시, 최근 3년) | 명세 확인, 키 필요 |

### 지표 ↔ 출처 매트릭스 (1차)
| 그룹 | 지표 | 출처·계산 | 확보 |
|---|---|---|---|
| 규모 | 학생수(전체·초/중/고/특), 학교수, 학급수 | KESS 학교행 → 시군 합계 | 확인 |
| 규모 | 학급당 학생수 | Σ학생수 / Σ학급수 (학교별 평균의 평균 금지) | 확인 |
| 규모 | 학생수 5년 증감률 | 2022~2026 series | 확인(헤더 매핑) |
| 소규모 | 소규모학교 수·비율 | 학생수 ≤ 60명(레지스트리 상수. 교육부 지역규모별 기준은 후속) | 확인 |
| 소규모 | 신입생 0명 학교 수 | KESS `입학자` = 0 | 컬럼 확인, 값 검증 필요 |
| 소규모 | 면지역 학교 비율 | KESS `지역규모` | 확인 |
| 소규모 | 폐교 수(등재) | 폐교재산 CSV | 확인 |
| 교원 | 교원수, 교원 1인당 학생수 | Σ학생수 / Σ교원수 | 확인 |
| 교원 | 학생 1인당 교지면적, 학교당 교실수 | KESS 컬럼(시설 노후도 대체) | 확인 |
| 취약 | 특수학급 학급수·학생수 | KESS 컬럼(통합교육 대상자 총원은 미제공) | 확인 |
| 취약 | 다문화(이주배경) 학생수·비율 | 시군 분해가 확인되면 포함, 아니면 **전북 전체 값만 KPI에 표기** | 미확인 |
| 취약 | 교육복지 대상 | 공개 출처 없음 → 1차 제외 | 불가 |

> Fix round 2, finding 7: 폐교 수는 폐교재산 현황 CSV의 특정 시점 **등재(스냅샷)** 기준이며, 전북 개교 이래 모든 폐교를 합산한 누적 통계가 아닙니다(매각 등으로 재산이 처분되면 그 시점부터 해당 CSV에서 빠질 수 있음).

### 조인 키 규칙
- 시군 배정: **KESS `행정구`**. 교육지원청 필드는 쓰지 않음(고교·특수 147교가 도교육청 직속으로 기록됨). 주소 파싱이 필요한 보조 출처는 `전라북도|전북특별자치도` 둘 다 허용하고 시군명 토큰으로 배정. 학교알리미 `sggCode` 52111/52113 → 52110.
- 학교 매칭(KESS ↔ 위치 CSV ↔ 폐교 CSV): 출처 간 공통 학교코드 미확인(NEIS 7자리, KEDI 9자리, 표준데이터 `schoolId` 미확인). **정규화 학교명 + 시군 + 학교급 복합 키**로 매칭, 미매칭 리포트 → `data/manual/school-aliases.json`으로 보정. 목표 매칭률 99%.
- 시도 식별자가 출처마다 다름(NEIS `P10`, 학교알리미 `14`/`52`, KESS `전북`, KEDI 코드 prefix `45`, KOSIS `35`). 출처별 필터 상수는 `scripts/pipeline/sources.ts` 한 곳에.
- 학교수 정의(화면에 명시): 학교급 ∈ {초·중·고·특수}(각종·방통 제외), 본교만 학교수에 산입. **분교장은 학교수에서 제외하되 학생·교원 합계에는 포함**(공식 통계의 "분교는 학교수에 미포함" 주석과 동일). 상태 필터(휴교 포함 여부 등)는 미리 정하지 않고, 학교급별 공식치(초 402·중 206·고 132·특 11)와 정확히 일치하는 조합을 2단계에서 찾아 `sources.ts`에 기록한다(KESS 원시 초등 409교 vs 공식 402교의 차이 원인 규명).
- KESS 표명 변경 주의(2025 `다문화` → 2026 `이주배경`). 지표명 하드코딩 금지.

## 데이터 파이프라인 (`scripts/pipeline/`, `npm run data:build`)

1. `sources.ts` — 출처 URL·파일ID·필터 상수·연도별 KESS 헤더 매핑.
2. `fetch-kess.ts` — 연도별 xlsx 다운로드(이미 있으면 건너뜀).
3. `parse-kess.ts` — `학교별 주요통계` 시트 → 전북 필터 → 정규화 → `data/interim/kess-<year>.json`.
4. `build-regions.ts` — admdongkor → `regions.geojson`(bbox·labelPoint 포함), `neighbors.geojson`.
5. `build-schools.ts` — KESS 2026 + 위치 CSV + 폐교 CSV 매칭 → `schools.json` + 미매칭 리포트.
6. `build-indicators.ts` — 레지스트리의 `aggregate` 규칙으로 시군·전북(`52000`) 행 생성 → `indicators/*.json`, `series/*.json`, `manifest.json`, `charset.json`.
7. `validate.ts` — 14개 시군 완비 / **학교급별 공식치 정확 일치**(학교수 초 402·중 206·고 132·특 11, 학교급별 학생수 70,524·46,907·47,206·1,321 및 교원수 8,116·4,935·5,377·482 도 정확 일치 — 사용자 지시로 허용오차 없음) / 좌표는 bbox 대신 **`regions.geojson` 폴리곤 포함 검사**로 학교가 들어간 시군 코드가 KESS `행정구` 코드와 같은지 확인(조인 자체를 검증). 단순화로 작은 섬이 사라질 수 있으므로 포함 실패 건은 시군 bbox + 0.05° 허용 범위로 재검사(부안 위도·군산 어청도 등 서해 도서 학교) / 매칭률 / 레지스트리 모든 지표에 파일 존재 / charset이 모든 이름 포함. 실패 시 비정상 종료.

`series/`는 핵심 4개뿐 아니라 KESS 학교행에서 나오는 모든 count 지표(소규모학교 수 포함)를 담는다. 2022~2025 파일을 어차피 파싱하므로 비용이 없고, KPI의 전년 대비가 전부 채워진다.

키가 필요한 출처(학교알리미, 카카오)는 `.env.local`. 1차 파이프라인은 키 없이 완주 가능해야 한다.

## deck.gl 씬 설계

### 레이어 (아래 → 위)
| id | 클래스 | 역할 | pickable |
|---|---|---|---|
| `neighbors` | `GeoJsonLayer` 평면 | 인접 시도 실루엣 | ✗ |
| `footprint` | `GeoJsonLayer` `extruded:false, filled:false, stroked:true` | 14개 시군 바닥 윤곽 | ✗ |
| `regions` | `GeoJsonLayer` `extruded:true` | 지표 높이·색 본체 | ✓ |
| `selected-ring` | `PathLayer` (z = 높이+10) | 선택 시군 상단 윤곽 | ✗ |
| `schools` | `ScatterplotLayer` (z = 시군 높이+50) | 선택 시군 학교 점, 학교급별 4색 | ✓ |
| `region-labels` | `TextLayer` billboard (z = 높이+200) | 시군명 + 값 | ✗ |
| `school-labels` | `TextLayer` | 학교명(zoom ≥ 11, 선택 시군만) | ✗ |

- `extruded: true`면 stroke 서브레이어가 생기지 않음(문서 확인) → 바닥 footprint + 선택 시군 상단 링으로 윤곽 표현. `wireframe`는 쓰지 않음.
- **`elevationOf(code)` 하나를 regions·ring·schools·labels가 공유**하고 동일한 `updateTriggers: [indicatorId]`·`transitions: 600ms`를 쓴다 → 지표 전환 시 면·점·라벨·링이 함께 움직인다.
- `regions` 핵심 props: `getElevation`(m), `elevationScale: 1`, `getFillColor`(선택 외 시군은 명도만 낮추고 alpha 255 유지 — 반투명 돌출면은 깊이 정렬 아티팩트), `material {ambient 0.45, diffuse 0.6, shininess 24}`, `autoHighlight + highlightColor [255,255,255,60]`, `transitions { getElevation: {duration 600, easing easeCubicOut}, getFillColor: 600 }`.
- `data` 참조는 로드 후 고정(참조가 바뀌면 버퍼 재생성 → 애니메이션 소실). 지표 값은 feature에 병합하지 않고 `Map<code, value>`를 접근자가 클로저로 참조. 학교/라벨 레이어는 조건부 생성 대신 `visible` 토글.
- `highlightedObjectIndex`는 지정 시 호버 강조를 무효화하므로(문서 확인) 선택 강조는 접근자 + ring으로만.

### Deck 설정
- 카메라는 **비제어**: `initialViewState`를 새 객체로 넘겨 리셋(`{target, nonce}` 컨텍스트로 같은 시군 재선택 지원). 프레임마다 React 리렌더 없음.
- 초기값: 중심 127.14E 35.72N, `pitch 50`, `bearing -15`, zoom은 마운트 시 `WebMercatorViewport.fitBounds(전북 bbox, {padding: 60})`. `minZoom 7.5, maxZoom 12, maxPitch 60`. "북쪽 맞춤"·"전체 보기" 버튼.
- `controller: { dragRotate: true, doubleClickZoom: false, keyboard: false, inertia: 300, maxBounds: [[125.6,34.7],[128.7,36.7]], rubberBand: true }` (`maxBounds` 9.3+, `rubberBand` 9.4 문서 확인).
- `views: new MapView({ padding: { right: PANEL_WIDTH } })` → 우측 패널만큼 소실점 이동.
- 시군 선택 시 `fitBounds(bbox, {padding: 80, maxZoom: 10.5})` + `pitch 55` + `FlyToInterpolator({speed: 1.5})`, `transitionDuration: 'auto'`. 해제 시 전체 보기로 복귀. `prefers-reduced-motion`이면 duration 0.
- `getTooltip`이 `{html, style}` 반환(deck 내부 DOM, React 상태 없음). 시군: 이름·값·순위·전북 평균 대비. 학교: 이름·급·학생수.
- `effects: [LightingEffect({ ambient 0.8, key DirectionalLight [1,-1.5,-3] 1.0, fill DirectionalLight 0.4 })]` 모듈 스코프에서 1회 생성. 그림자(`_shadow`)는 실험 기능이라 미사용.
- 배경: 래퍼 `div` `#0b0f19`. `useDevicePixels: true`(고DPR 4K에서 부족하면 숫자로 하향).

### 한글 라벨
- `next/font/google` Noto Sans KR(빌드 시 자체 호스팅). TextLayer는 fontFamily별 아틀라스를 캐시(3개)하므로 **`document.fonts.load()` 완료 후에만 TextLayer 생성**(`fontReady` 게이팅). `next/font` family명이 Canvas2D에서 해석되는지 1단계에서 `document.fonts.check()`로 검증.
- `characterSet`은 `'auto'` 대신 파이프라인이 만든 `charset.json`(정적) → 선택 시군이 바뀔 때 아틀라스 재생성 방지. `fontSettings { sdf: true, fontSize: 48 }`, `outlineWidth 0.15`.

### 폴백
- 마운트 전 `webgl2` 컨텍스트 검사 실패 또는 768px 미만 → `MapFallback`(같은 값을 DOM 표 + 가로 막대로).
- 컨텍스트 손실: deck의 `onError('WebGL context is lost')` → 오버레이 + 새로고침 안내(luma.gl 권고). `MapShell`을 ErrorBoundary로 감싼다.

## 스케일·색 (`src/lib/scales.ts`, `colors.ts`)

- 높이: `h = FLOOR + (ELEVATION_MAX − FLOOR) · norm(v)`, `norm = clamp((v−d0)/(d1−d0))`, `scale:'sqrt'`면 `√norm`. `FLOOR 800m`(0도 얇은 판), `ELEVATION_MAX 50,000m`(1단계에서 시각 튜닝). 도메인은 **전 연도 고정**. `null` → FLOOR + 회색 + "자료 없음".
- 색: 5단계 `scaleQuantize`. 팔레트는 polarity별 — higherWorse `OrRd`, higherBetter `Blues`, neutral `Viridis`(모두 명도 단조 → 색각 안전), `[0.25, 0.95]` 구간에서 샘플(최저 단계가 배경에 묻히지 않게). RdYlGn 계열 금지. 색은 항상 높이와 **중복 인코딩**하고 라벨에 수치 표기.
- 면적 착시(전주: 작고 높음 vs 완주: 넓고 낮음): 색 중복 인코딩 + 수치 라벨로 완화. count 지표를 `ColumnLayer`(고정 반경) 기둥으로 그리는 `geometry:'column'` 옵션은 후속(7단계).
- 범례: 5개 스와치 + 경계값 + 결측 스와치 + 스케일 설명("높이·색 모두 값에 비례, 기준선 0") + 출처. 구현 시 `dataviz` 스킬 팔레트 규칙 적용.

## 상태·데이터 흐름

- URL이 진실: `indicator`(`parseAsStringLiteral(INDICATOR_IDS).withDefault(DEFAULT_ID)`), `region`(시군 코드 또는 null). `nuqs`(`^2.10`, `shallow` replaceState, 50ms 스로틀, 테스트 어댑터 제공). `region`만 `history:'push'`(뒤로가기 = 해제). 연도 파라미터는 1차 UI에 없으므로 두지 않는다.
- nuqs가 `useSearchParams`를 쓰므로 `app/page.tsx`에서 `<Suspense fallback={<DashboardSkeleton/>}>`로 감싸야 정적 빌드가 통과(문서 확인). `NuqsAdapter`는 `app/layout.tsx`.
- `DataProvider`: 마운트 시 `regions.geojson` 먼저(첫 그림) → 나머지 전부 `Promise.all`(총 100~150KB gzip 추정, 지연 로딩 불필요). 로드 후 `assertBundle()`로 레지스트리·시군 코드·연도 일치 검증.
- 파생 통계는 `src/lib/stats.ts` 순수 함수(`valueMap`, `rank`, `deltaPrevYear`, `vsProvince`, `trend`) + `useMemo`. 전북 값은 데이터의 `52000` 행에서 읽고 프런트에서 집계하지 않는다.
- 상태 위치: URL(indicator, region) / 데이터·파생값(DataProvider) / 카메라(deck 내부 + 카메라 요청 컨텍스트) / zoom·fontReady·contextLost(DeckMap 로컬). 외부 상태 라이브러리 없음.

## 화면 구성과 파일 목록

```
┌────────────────────────────────────────────────────────────────┐
│ 전북교육지도  [조건별 맵: 그룹 › 지표 ▾]   KPI: 학교수 학생수 교원수 소규모 │
├─────────────────────────────────────────────┬──────────────────┤
│                                             │ 선택 시군 상세     │
│   3D 지도 (deck.gl, pitch 50°)               │  값·순위·평균 대비  │
│   시군 면 = 높이·색, 라벨 = 이름+값             │  5년 추이 스파크   │
│   클릭 → FlyTo + 학교 점                     │  학교 목록(정렬)   │
│   [북쪽 맞춤] [전체 보기]                     │ 미선택: 시군 순위 목록│
├─────────────────────────────────────────────┴──────────────────┤
│ 범례(색·높이·결측)   지표 설명   출처·기준일 2026.4.1                │
└────────────────────────────────────────────────────────────────┘
```

```
app/layout.tsx                      서버. lang=ko, next/font, NuqsAdapter
app/page.tsx                        서버. metadata + <Suspense><Dashboard/></Suspense>
src/components/Dashboard.tsx        'use client'. DataProvider + 그리드 배치
src/components/map/MapShell.tsx     'use client'. dynamic(DeckMap, ssr:false), WebGL2 검사, ErrorBoundary, 손실 오버레이
src/components/map/DeckMap.tsx      DeckGL 인스턴스, 레이어 조립, 카메라, 툴팁, 키보드, fontReady
src/components/map/layers/regionLayers.ts   neighbors/footprint/regions/selected-ring 팩토리
src/components/map/layers/schoolLayers.ts   schools/school-labels 팩토리
src/components/map/layers/labelLayer.ts     region-labels 팩토리
src/components/map/{lighting,camera,tooltip}.ts
src/components/map/MapFallback.tsx  DOM 표+막대 폴백
src/components/panels/{TopBar,IndicatorPicker,KpiTiles,RegionPanel,RegionList,Legend,Footer}.tsx
src/components/ui/Sparkline.tsx
src/lib/indicators/{types,registry}.ts
src/lib/data/{types,load,DataProvider}.ts(x)
src/lib/{scales,stats,colors,format}.ts
src/lib/geo/{regions,geo}.ts        14행 상수 테이블, ringsOf, bbox 폴백
src/lib/state/urlState.ts           nuqs 파서, useMapQuery()
scripts/pipeline/*.ts               위 파이프라인
data/raw/ (gitignore) · data/interim/ · data/manual/ · public/data/
tests/unit/*.test.ts · tests/components/*.test.tsx · e2e/*.spec.ts
docs/superpowers/specs/2026-09-20-jb-edu-map-design.md
```

## 테스트·검증

| 계층 | 도구 | 대상 |
|---|---|---|
| 파이프라인 | vitest + 픽스처(KESS 20행 xlsx, 위치 CSV 20행) | 헤더 매핑, 전북 필터, 전주 병합, 학교 매칭 규칙, 집계(Σ/Σ), validate 규칙 |
| 단위 | vitest | 레지스트리 무결성(id 유일, 그룹 4개, 모든 지표에 데이터·52000 행 존재, charset 포함), scales(도메인·0·null·sqrt·5단계 경계·alpha 255), stats(동률·전년 없음·결측), urlState 파서(잘못된 값 → 기본), format |
| 레이어 팩토리 | vitest(node) | 레이어 생성 후 `props.getElevation(feature)`·`updateTriggers` 검증(GPU 불필요) |
| 컴포넌트 | vitest + RTL + `withNuqsTestingAdapter` | IndicatorPicker 클릭 → URL, RegionList 키보드, RegionPanel 문구, MapFallback |
| E2E | Playwright(Chromium, swiftshader) | 로드 후 canvas 존재·콘솔 에러 0 / 지표 클릭 → URL·범례 갱신 / 시군 선택 → `?region=`·패널·ESC 해제 / 캔버스 클릭 1건(`NEXT_PUBLIC_E2E=1`에서 `window.__jbmap.deck`로 좌표 투영) / 스크린샷 2장 `maxDiffPixelRatio 0.02` |
| 수동 확인 | Chrome 도구 | 각 단계 확인 항목(아래) + Vercel 프리뷰에서 동일 시나리오 |

## 구현 순서

| 단계 | 내용 | 확인 |
|---|---|---|
| 0 초기화 | `git init`, `create-next-app`(TS, Tailwind, src/), 의존성 설치, 설계 문서 커밋, vitest/playwright 설정, GitHub Actions(`typecheck + vitest + next build`). `page → MapShell → DeckMap`이 빈 DeckGL을 어두운 배경으로 렌더 | `next build` 통과, SSR 에러 없음, map 청크에 maplibre 등 미포함, CI 워크플로 파일 존재(원격 연결은 사용자) |
| 1 지도 기반 | `build-regions.ts` → `regions/neighbors.geojson`. 더미 값으로 regions/footprint/neighbors, 조명, fitBounds, maxBounds, autoHighlight, 이름 툴팁, 한글 TextLayer(fontReady) | **14개 면이 서고 호버 시 시군명이 뜬다**, 지도 밖으로 못 나감, 한글 정상, Playwright 스모크 기준선 |
| 2 KESS + 규모 지표 | `fetch/parse-kess`, `build-indicators`(52000·manifest·charset), `validate` → 레지스트리·DataProvider·scales·stats·Legend, 임시 버튼으로 지표 전환 | **학교급별 학교수 초 402·중 206·고 132·특 11 정확 일치**(필터 조합을 `sources.ts`에 기록), 전환 시 600ms 애니메이션, 단위 테스트 통과 |
| 3 URL + 상단바 | nuqs, TopBar(IndicatorPicker·KpiTiles), Suspense | URL 갱신·새로고침 복원·뒤로가기, RTL 테스트, `next build` 통과 |
| 4 선택 + 학교 | 위치 CSV(수동 다운로드) → `build-schools.ts`; 클릭 → region, FlyTo, selected-ring, dim, ESC, RegionPanel(값·평균 대비·순위·학교 목록), 학교 점+툴팁 | **매칭률 99%**, 좌표 bbox 내, 학교 점이 상단면에 붙어 함께 움직임, E2E 선택 시나리오 |
| 5 나머지 지표 + 추이 | 소규모·통폐합(폐교 CSV), 교원·인프라, 취약·특수(다문화는 확인 결과에 따라), `series` 2022~2026, Sparkline·전년 대비, 라벨에 값, 학교명 라벨, Footer 출처 | 라벨 겹침 육안 확인, 추이 축 고정, 매트릭스의 "확인" 지표 전부 화면에 존재 |
| 6 견고성·배포 | WebGL 폴백, 손실 오버레이, ErrorBoundary, reduced-motion, 키보드 순환(RegionList), aria-live, 모바일 안내, Playwright E2E를 CI에 추가(스크린샷 기준선은 CI Linux에서만 생성·비교, 로컬은 스모크만), Vercel 프리뷰 → 프로덕션 | `--disable-webgl`로 폴백, Lighthouse 접근성, CI에서 E2E 전체 통과, 프리뷰 URL 시나리오 |
| 7 선택 | count 지표 `geometry:'column'`, "전북 평균 대비" 발산 색 모드, 연도 슬라이더 | 스크린샷 추가 |

각 단계는 TDD로 진행하고(`superpowers:test-driven-development`), 단계 종료 시 확인 항목을 실제로 실행한 뒤 커밋한다.

### 실행 방식 (사용자 지시: Sonnet 모델로 빠르게)
- 이 세션(오케스트레이터)은 설계·브리프 작성·검증·커밋만 맡고, **구현 작업은 `model: sonnet` 서브에이전트에 단계별로 위임**한다. 별도의 실행 계획 문서 라운드는 생략하고, 이 문서의 단계 + 데이터 계약 + 확인 항목을 그대로 브리프로 준다.
- 0단계에서 이 문서를 `docs/superpowers/specs/2026-09-20-jb-edu-map-design.md`로 커밋한다.
- 병렬화: 0단계 완료 후 1단계(지도 씬, `src/components/map/**`)와 2단계의 파이프라인(`scripts/pipeline/**`)은 디렉터리가 겹치지 않으므로 동시에 진행하고, 2단계의 프런트 결합부터는 순차.
- 각 단계 결과는 오케스트레이터가 `npm run typecheck && npm test && npm run build`와 Chrome 도구(실제 화면)로 검증한 뒤 커밋하고 다음 단계로 넘긴다. 실패하면 같은 서브에이전트에 피드백을 보내 고치게 한다.
- 서브에이전트는 TDD 원칙(테스트 먼저)과 이 문서의 파일 구조·명명을 따르고, 범위 밖 파일은 건드리지 않는다.

## 구현 중 사람이 직접 확인해야 하는 항목
리서치에서 자동 접근이 막혀 확인하지 못한 것. 해당 단계 시작 시 처리한다.
- (2단계) KESS 연도별 파일 ID 2022·2024·2025(2023·2026은 확인됨). 대안: 전북교육청 게시판 전북 필터본.
- (2단계) `ELEVATION_MAX`·pitch·조명 값의 시각 튜닝, `next/font` family명의 Canvas2D 호환.
- (4단계) 위치 CSV(data.go.kr 15159184) 브라우저 다운로드 → 전북 커버리지·좌표 채움률·`schoolId` 형식.
- (5단계) KESS `이주배경(유형별) 학생수` 표의 시군구 분해 여부(자동 접근 시 페이지 로딩이 끝나지 않음). 분해되면 XLS를 받아 파이프라인에 추가, 아니면 전북 전체 값만 표기.
- (6단계) KESS 데이터 이용조건(`service@kedi.re.kr` 또는 이용정책 페이지) → 출처 표기 문구 확정.
- (후속) 학교알리미·카카오 키 발급은 결손 보정이 필요할 때만.

## 위험·함정
1. **전환 애니메이션 소실**: `data` 참조 변경, `updateTriggers` 누락, 접근자에서 새 배열 생성. 2단계에서 `onEnd` 콜백으로 확인.
2. **폰트 아틀라스 캐시**: 폰트 로드 전 TextLayer 생성 시 폴백 글리프 고착. `fontReady` 게이팅 필수.
3. **SSR·빌드**: deck.gl은 `DeckMap` 이하에서만 import. Suspense 없으면 nuqs 사용 페이지 정적 빌드 실패. Turbopack + deck.gl ESM 해석 문제 가능성 → 0단계에서 확인.
4. **성능**: 학교 1,000개 점은 인스턴싱으로 사소함. 실제 위험은 호버를 React 상태로 올리는 것(→ autoHighlight/getTooltip), 고DPR, `characterSet:'auto'`.
5. **데이터 정의 흔들림**: 학교수가 정의에 따라 752~1,205 사이. 정의를 화면과 validate에 고정.
6. **출처 간 학교 매칭 실패**: 동명 학교·분교장. 미매칭 리포트 + 수동 별칭 테이블.
7. **접근성**: 캔버스는 키보드 접근 불가 → RegionList가 동등 경로, 색+높이+숫자 삼중 인코딩, 대비 4.5:1.
8. **nuqs × Next 16** 초기 어댑터 이슈 보고 있음 → 최신 버전 고정, 0단계에서 확인.

## 비범위 (후속)
배경 타일 토글, 읍면동 단위, 유치원, 실시간 API 갱신, 로그인·권한, 내부 파일 업로드, 예산·학업성취·교육복지 지표, 전 지표 연도 슬라이더, 학교 시설 노후도(학교알리미 시설 API 확인 후).
