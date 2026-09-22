# 전북교육지도

전북 14개 시군의 교육통계(학교수·학생수·교원수 등)를 위성지도 위에 학교 위치 점과 시군별 통계로 보여주는 Next.js 대시보드입니다.

위성 모드에서는 실제 지형 높낮이를 적용한 입체 지형이 기본으로 켜집니다. 지도 상단의 `입체 지형` 버튼으로 평면 위성지도와 전환할 수 있습니다. 확대 상한은 14이며 학교 위치 점과 이름은 화면 픽셀 크기를 유지합니다. 지형 고도는 Mapzen Terrain Tiles(AWS Open Data)의 Terrarium 타일을 서버에서 캐시해 제공하고, 위성 사진은 기존 브이월드 타일을 지형 표면에 입힙니다. 브이월드 키가 없거나 일반 지도/끄기 모드에서는 평면 지도로 표시됩니다.

## 요구 버전

| 항목 | 버전 |
| --- | --- |
| Node.js | 22.x (`.nvmrc` 참고 — `nvm use`) |
| npm | 10.x 이상 |
| Next.js | 16.3.x |
| React | 19.3.x |
| deck.gl (`@deck.gl/*`) | 9.4.0 |
| deck.gl `geo-layers`·`extensions`·`mesh-layers` | 9.4.0 |
| `@luma.gl/effects` | 9.4.2 |

## 명령어

| 명령어 | 설명 |
| --- | --- |
| `npm run dev` | 개발 서버 실행 (http://localhost:3000) |
| `npm run build` | 프로덕션 빌드 |
| `npm start` | 빌드 결과 실행 |
| `npm run lint` | ESLint 검사 |
| `npm run typecheck` | `tsc --noEmit` 타입 검사 |
| `npm test` | 단위 테스트 (vitest, 1회 실행) |
| `npm run test:watch` | 단위 테스트 (watch 모드) |
| `npm run e2e` | E2E 테스트 (Playwright) |
| `npm run data:regions` | 시군 경계/행정구역 데이터 생성 |
| `npm run data:emd` | 시군별 읍면동 경계 데이터 생성 (`public/data/emd/<시군코드>.geojson`) |
| `npm run data:kess` | KESS 교육통계 원본 수집·파싱 |
| `npm run data:schools` | 학교 목록/위치 데이터 생성 |
| `npm run data:indicators` | 지표 집계 데이터 생성 |
| `npm run data:charset` | 폰트/문자셋 서브셋 생성 |
| `npm run data:validate` | 생성된 데이터 검증 |
| `npm run data:build` | `regions → emd → kess → schools → indicators → charset → validate` 순으로 데이터 파이프라인 전체 실행 (학교 점 레이어 포함) |

## CI

GitHub Actions(`.github/workflows/ci.yml`)가 push/PR마다 데이터 검증(`data:validate`)·typecheck·lint·단위 테스트·build를 `build` 잡에서, e2e(Playwright)를 이어지는 `e2e` 잡에서 실행합니다. 첫 푸시 시 GitHub Actions 로그를 확인하세요 (원격 저장소 연결 후 첫 실행).

## 배포 (Vercel)

1. Vercel 대시보드에서 "Add New Project" → 이 저장소(GitHub)를 import 합니다.
2. 빌드 설정은 기본값을 그대로 씁니다 — Framework Preset이 자동으로 "Next.js"로 인식되고, Build Command(`next build` = `npm run build`)·Output Directory·Install Command(`npm ci`) 모두 손댈 필요가 없습니다. Node.js 버전은 Vercel이 `package.json`의 `engines.node`(프로젝트 설정에서도 지정 가능)를 기준으로 선택합니다 — `.nvmrc`는 로컬 `nvm use` 전용이며 Vercel은 이를 읽지 않습니다.
3. 환경변수는 `NEXT_PUBLIC_VWORLD_KEY`(선택)와 `NEXT_PUBLIC_MAP_FX`(선택, 아래 참고) 2개입니다 — 지표·경계·학교 데이터는 `public/data/*.json`/`*.geojson`(정적 파일, 빌드 시점에 이미 저장소에 커밋되어 있음)만 읽고 런타임에 외부 API 키나 서버 비밀값을 쓰지 않지만, 배경 지도(브이월드 타일)를 켜려면 이 키가 필요합니다. 없어도 앱은 정상 동작합니다 — "배경 지도" 컨트롤이 아예 표시되지 않고 나머지 기능은 그대로입니다. 배경 지도는 끄기 · 위성(기본, 밝은 워시) · 일반(채도 낮춤) 3단이며 선택은 브라우저에 저장됩니다(`jbmap.basemap`). 화면 전체는 라이트 테마입니다.
   - 발급: [브이월드 오픈API](https://www.vworld.kr/dev/v4dv_openapireferrer_s001.do)에서 무료로 키를 발급받고, 사용할 배포 도메인(예: `xxx.vercel.app`, 커스텀 도메인)을 인증키 관리에 등록합니다.
   - Vercel 프로젝트 설정 → Environment Variables 에 `NEXT_PUBLIC_VWORLD_KEY`를 추가합니다(Production/Preview 모두 필요하면 각각 등록). `vercel env add NEXT_PUBLIC_VWORLD_KEY production` 로도 등록할 수 있습니다.
   - 로컬 개발은 `.env.local`(`.gitignore`됨 — 커밋되지 않음)에 같은 키를 넣으면 됩니다.
   - 잘못되었거나 도메인이 등록되지 않은 키는 지도에서 조용히 실패합니다(타일이 안 보일 뿐, 에러가 뜨지 않음) — 브이월드는 잘못된 키에도 200 응답(XML 에러 본문)을 주기 때문입니다. 화면을 직접 확인해 키가 유효한지 판단하세요.
   - (`NEXT_PUBLIC_E2E` 는 Playwright e2e 전용으로 `playwright.config.ts` 가 테스트 실행 시에만 주입하며, 배포본에는 전혀 관여하지 않습니다.)
   - `NEXT_PUBLIC_MAP_FX=off`: 발표 모드의 후처리 체인(틸트시프트·FXAA)을 끄는 비상 스위치(기본 미설정). 기본 모드는 후처리 없이 캔버스 MSAA 로 그리고, 비네팅은 CSS 오버레이라 이 설정과 무관합니다. 그림자는 항상 꺼져 있습니다.
4. Deploy를 누르면 끝입니다. 이후 `main`(또는 배포 대상 브랜치)에 푸시할 때마다 Vercel이 자동으로 재배포합니다.
5. 데이터를 갱신했다면(아래 "데이터 갱신 절차" 참고) 재빌드된 `public/data/**` 를 포함한 커밋을 푸시하는 것만으로 배포본에도 반영됩니다 — 별도의 배포 시점 데이터 빌드 단계는 없습니다(파이프라인은 로컬/CI에서 미리 실행해 결과 JSON을 커밋하는 방식).

## 데이터 갱신 절차

1. **원천 파일을 `data/raw/` 에 새로 받습니다.** 이 저장소의 파이프라인은 소스 파일의 **기준일자를 파일명에서 직접 읽습니다** — 임의로 "오늘 날짜"를 쓰지 않습니다(`scripts/pipeline/sources.ts`의 `referenceDateFromFilename` 참고):
   - 학교 위치: `한국교육시설안전원_초중등학교위치_YYYYMMDD.csv` (예: `..._20260320.csv` → 기준일 2026-03-20). 파일이 없거나 이 규칙에 맞지 않으면 `data:schools` 가 예상 파일명을 알려주며 실패합니다.
   - 폐교재산 현황: `전북특별자치도교육청_폐교재산 현황_YYYYMMDD.csv` — 마찬가지로 파일명 끝의 날짜가 기준일자입니다.
   - 행정구역 경계: `data/raw/admdongkor-ver20260701.geojson` — 파일명의 `verYYYYMMDD` 가 기준일자입니다. 새 버전을 받으면 `scripts/pipeline/sources.ts`의 `BOUNDARY_SOURCE.url`(vuski/admdongkor의 새 `verYYYYMMDD` 태그)도 함께 갱신해야 합니다.
   - KESS 교육기본통계: `kess-<연도>.xlsx` (예: `kess-2026.xlsx`) — 파일명이 아니라 파일 내용에서 기준일자를 읽습니다(`npm run data:kess` 실행 로그의 `referenceDate=...` 로 확인 가능). `data:kess`가 `data/raw/`에 없는 연도 파일을 자동으로 내려받으려 시도합니다.
2. **`npm run data:build` 를 실행합니다.** `regions → emd → kess → schools → indicators → charset → validate` 순으로 전체 파이프라인이 돌고, 마지막 `data:validate` 단계가 실패하면(학교수/학생수/교원수 공식치 대비 오차, 좌표-시군 정합성, 매칭률 100% 등) 0이 아닌 종료 코드와 함께 무엇이 틀렸는지 표로 보여줍니다 — 이 단계를 통과하지 못한 데이터는 커밋하지 않습니다.
3. **`git status`/`git diff public/data/` 로 실제 변경 내용을 확인합니다.** `public/data/manifest.json`의 `builtAt` 필드는 실행할 때마다 항상 바뀌므로, 그 외 내용이 정말 달라졌는지(지표 값, 연도, 학교 수 등) 확인한 뒤 커밋하세요. `builtAt`만 바뀌고 나머지가 동일하다면(원천 데이터가 그대로인 재실행 등) 그 변경은 커밋하지 않아도 됩니다.
4. `public/data/**`(그리고 필요 시 `data/interim/**`, `data/manual/label-offsets.json` 처럼 수동으로 조정한 파일)를 커밋합니다. `data/raw/**` 는 원천 파일이라 `.gitignore` 로 제외되어 있으니 커밋하지 않습니다.

`data:schools`(및 전체 `data:build`)는 `data/raw/`에서 `한국교육시설안전원_초중등학교위치_` 로 시작하는 CSV 파일을 찾습니다. 수동 매칭 보정은 `data/manual/school-aliases.json`(`"KESS 학교명|시군코드": "위치 CSV 학교ID"`)에 근거(주소 일치 등)가 있는 경우에만 추가합니다. 시군 라벨이 겹쳐 보이는 경우의 픽셀 보정값은 `data/manual/label-offsets.json`(`{ "지역코드": [dx, dy] }`)에 있으며, `data:regions` 가 이를 읽어(1px ≈ 250m, `build-regions.ts`의 `LABEL_OFFSET_METERS_PER_PX`) `regions.geojson`의 `properties.labelPoint` 자체를 지리적으로 옮깁니다 — CollisionFilterExtension의 충돌 가시성 판정이 라벨의 원래(오프셋 미반영) 앵커 좌표를 쓰기 때문에, 렌더 타임 픽셀 오프셋 대신 빌드 타임에 앵커를 옮겨야 라벨이 항상 보입니다(Task B fix round 1).

## 데이터 출처 및 라이선스

- **KESS 교육기본통계 학교별 데이터셋** (한국교육개발원 교육통계서비스) — 지표(학생수/학교수/교원수 등)의 원천. 기준일은 화면 하단 범례와 Footer에 표기됩니다.
- **한국교육시설안전원 초중등학교위치 표준데이터** (data.go.kr) — 학교 점 위치(위도/경도). 시군 선택 시 지도 우측 패널과 화면 하단에 "위치 기준 YYYY-MM-DD" 로 기준일을 표기합니다. 전국 데이터셋 특성상 초·중·고등학교만 포함되어 있고 특수학교 위치는 제공되지 않습니다(자세한 내용은 `data/interim/schools-match-report.json` 참고). 이는 매칭 실패가 아니라 원천 데이터 자체의 구조적 공백이므로, 특수학교도 `public/data/schools.json` 에 좌표 없이(`lat`/`lng: null`, `locationMissingReason` 설명 포함) 실리며 매칭률·검증 대상에서는 제외됩니다 — 지도에는 점으로 그리지 않고, 우측 패널 학교 목록에는 "위치 없음" 배지로 표시됩니다.
- **전북특별자치도교육청 폐교재산 현황** (공공데이터포털) — 폐교 지표(폐교 수/미활용 폐교 수/최근 10년 폐교 수)와 RegionPanel의 폐교 목록의 원천. 원천 파일의 게시(갱신)일이 데이터 기준일과 다른 경우 Footer에 "기준일 …(게시 …)" 형식으로 둘 다 표기합니다.
- **통계청 SGIS 기반 행정동 경계** (vuski/admdongkor, `HangJeongDong_ver20260701.geojson`) — 시군 경계·라벨 위치의 원천. [vuski/admdongkor](https://github.com/vuski/admdongkor) 저장소는 **CC BY 4.0** 라이선스로 배포되며, 이 프로젝트는 그 경계 데이터를 단순화·가공해 `public/data/regions.geojson`/`neighbors.geojson`(`npm run data:regions`)과, 선택한 시군의 하위 읍면동 경계선용 `public/data/emd/<시군코드>.geojson` 14개(`npm run data:emd`)로 다시 배포합니다 — 출처 표기(CC BY 4.0이 요구하는 저작자 표시)는 화면 하단 Footer와 이 문서에 명시합니다.
- **배경지도: 국토교통부 브이월드(VWorld) 오픈API** (`Satellite` 위성 · `Base` 일반 WMTS 타일) — 지도 화면 우측 상단 "배경 지도" 컨트롤(끄기 · 위성 · 일반)에서 위성/일반을 고르면 표시되는 배경 타일의 원천. 브이월드 오픈API 이용약관에 따라 출처를 표기합니다(지도 오버레이 안의 "배경지도 © 국토교통부 브이월드(VWorld)" 문구). 브라우저에서 브이월드 WMTS 엔드포인트를 직접 호출하며(CORS `access-control-allow-origin: *` 확인됨), 별도의 서버 프록시는 두지 않습니다.
- **입체 지형: Mapzen Terrain Tiles** ([AWS Open Data](https://registry.opendata.aws/terrain-tiles/)) — Terrarium 고도 타일에 브이월드 위성 사진을 입힙니다. 한국 지역의 고도 자료에는 SRTM/GMTED 자료가 포함되며, 지도 오버레이에 `지형 Mapzen · SRTM/GMTED 자료 USGS` 출처를 표시합니다. 고도 타일은 CORS 제약 때문에 `/api/terrain/`을 통해 서버에서 캐시해 전달합니다.

`xlsx` 패키지(devDependency)는 KESS `.xlsx` 원본을 읽는 데이터 파이프라인 전용(`scripts/pipeline/parse-kess.ts` 등)이며, 브라우저로 번들되지 않습니다 — 알려진 보안 권고(advisory)가 있으나 런타임 노출 범위 밖이라 별도 조치 없이 유지합니다.

이 프로젝트 자체의 소스 코드 라이선스는 별도로 명시되어 있지 않습니다(저장소 소유자에게 문의).

## 1차 범위에서 제외된 항목

- **다문화(이주배경) 학생 지표** — KESS 통계표(`[주제별] 이주배경(유형별) 학생수`)는 존재하지만, 공개 출처에서 시군 단위로 분해된 데이터를 확보하지 못해 1차 범위에서 제외했습니다.
- **연도 슬라이더** — 특정 연도를 직접 골라보는 UI는 1차 범위에 포함되지 않았습니다. 연도별 추이는 시군 선택 시 RegionPanel의 스파크라인으로 확인할 수 있습니다.
- **배경 타일 지도** — 1차 범위에서는 제외했으나(deck.gl 레이어만으로 화면 구성), 2차(2026-09-21)에서 브이월드(VWorld) midnight WMTS 타일을 배경으로 도입했고, 이어진 밝은 디오라마 개편에서 위성(`Satellite` + 밝은 흰색 워시, 기본) · 일반(`Base`, 채도 낮춤) · 끄기 3단으로 바꿨습니다(우측 상단 "배경 지도" 컨트롤, `NEXT_PUBLIC_VWORLD_KEY` 필요 — 위 "배포 (Vercel)" 3번 항목 참고).
