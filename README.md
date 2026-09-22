# 전북교육지도

전북 학교를 평면 도로지도에서 검색하고, 14개 시군의 교육통계를 함께 살펴보는 Next.js 대시보드입니다.

북쪽이 위인 평면 도로지도를 사용하며 최대 18단계까지 확대할 수 있습니다. 학교 점은 반경 5px, 학교 이름은 11px로 고정하며 줌 11부터 화면에 보이는 학교 이름을 겹치지 않게 표시합니다.

왼쪽 `학교 탐색`에서 학교명·시군·학교급을 조합해 검색합니다. 목록과 지도는 같은 필터를 사용하며 위치 없는 학교도 상세정보를 볼 수 있습니다. `시군 통계` 탭에는 기존 지표·순위·추이·폐교 목록과 데이터 출처가 있습니다. 1024px 미만에서는 지도를 유지하고 패널을 하단에서 열며, WebGL 사용 불가·지도 오류일 때만 표로 대체합니다.

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
| `npm run data:build` | `regions → emd → kess → schools → indicators → issues → charset → validate` 순으로 데이터 파이프라인 전체 실행 (학교 점 레이어 포함) |

## CI

GitHub Actions(`.github/workflows/ci.yml`)가 push/PR마다 데이터 검증(`data:validate`)·typecheck·lint·단위 테스트·build를 `build` 잡에서, e2e(Playwright)를 이어지는 `e2e` 잡에서 실행합니다. 첫 푸시 시 GitHub Actions 로그를 확인하세요 (원격 저장소 연결 후 첫 실행).

## 배포 (Vercel)

1. Vercel 대시보드에서 "Add New Project" → 이 저장소(GitHub)를 import 합니다.
2. 빌드 설정은 기본값을 그대로 씁니다 — Framework Preset이 자동으로 "Next.js"로 인식되고, Build Command(`next build` = `npm run build`)·Output Directory·Install Command(`npm ci`) 모두 손댈 필요가 없습니다. Node.js 버전은 Vercel이 `package.json`의 `engines.node`(프로젝트 설정에서도 지정 가능)를 기준으로 선택합니다 — `.nvmrc`는 로컬 `nvm use` 전용이며 Vercel은 이를 읽지 않습니다.
3. 배경 도로지도를 표시하려면 `NEXT_PUBLIC_VWORLD_KEY`를 설정합니다. 키가 없어도 학교·경계·통계 기능은 동작합니다. 지표·경계·학교 데이터는 저장소의 `public/data/` 정적 파일을 사용합니다. 지도는 평면 도로지도 하나만 제공하며 이전 지도 모드 설정은 읽지 않습니다.
   - 발급: [브이월드 오픈API](https://www.vworld.kr/dev/v4dv_openapireferrer_s001.do)에서 무료로 키를 발급받고, 사용할 배포 도메인(예: `xxx.vercel.app`, 커스텀 도메인)을 인증키 관리에 등록합니다.
   - Vercel 프로젝트 설정 → Environment Variables 에 `NEXT_PUBLIC_VWORLD_KEY`를 추가합니다(Production/Preview 모두 필요하면 각각 등록). `vercel env add NEXT_PUBLIC_VWORLD_KEY production` 로도 등록할 수 있습니다.
   - 로컬 개발은 `.env.local`(`.gitignore`됨 — 커밋되지 않음)에 같은 키를 넣으면 됩니다.
   - 잘못되었거나 도메인이 등록되지 않은 키는 지도에서 조용히 실패합니다(타일이 안 보일 뿐, 에러가 뜨지 않음) — 브이월드는 잘못된 키에도 200 응답(XML 에러 본문)을 주기 때문입니다. 화면을 직접 확인해 키가 유효한지 판단하세요.
   - (`NEXT_PUBLIC_E2E` 는 Playwright e2e 전용으로 `playwright.config.ts` 가 테스트 실행 시에만 주입하며, 배포본에는 전혀 관여하지 않습니다.)
4. Deploy를 누르면 끝입니다. 이후 `main`(또는 배포 대상 브랜치)에 푸시할 때마다 Vercel이 자동으로 재배포합니다.
5. 데이터를 갱신했다면(아래 "데이터 갱신 절차" 참고) 재빌드된 `public/data/**` 를 포함한 커밋을 푸시하는 것만으로 배포본에도 반영됩니다 — 별도의 배포 시점 데이터 빌드 단계는 없습니다(파이프라인은 로컬/CI에서 미리 실행해 결과 JSON을 커밋하는 방식).

## 데이터 갱신 절차

1. **원천 파일을 `data/raw/` 에 새로 받습니다.** 이 저장소의 파이프라인은 소스 파일의 **기준일자를 파일명에서 직접 읽습니다** — 임의로 "오늘 날짜"를 쓰지 않습니다(`scripts/pipeline/sources.ts`의 `referenceDateFromFilename` 참고):
   - 학교 위치: `한국교육시설안전원_초중등학교위치_YYYYMMDD.csv` (예: `..._20260320.csv` → 기준일 2026-03-20). 파일이 없거나 이 규칙에 맞지 않으면 `data:schools` 가 예상 파일명을 알려주며 실패합니다.
   - 폐교재산 현황: `전북특별자치도교육청_폐교재산 현황_YYYYMMDD.csv` — 마찬가지로 파일명 끝의 날짜가 기준일자입니다.
   - 행정구역 경계: `data/raw/admdongkor-ver20260701.geojson` — 파일명의 `verYYYYMMDD` 가 기준일자입니다. 새 버전을 받으면 `scripts/pipeline/sources.ts`의 `BOUNDARY_SOURCE.url`(vuski/admdongkor의 새 `verYYYYMMDD` 태그)도 함께 갱신해야 합니다.
   - KESS 교육기본통계: `kess-<연도>.xlsx` (예: `kess-2026.xlsx`) — 파일명이 아니라 파일 내용에서 기준일자를 읽습니다(`npm run data:kess` 실행 로그의 `referenceDate=...` 로 확인 가능). `data:kess`가 `data/raw/`에 없는 연도 파일을 자동으로 내려받으려 시도합니다.
2. **`npm run data:build` 를 실행합니다.** `regions → emd → kess → schools → indicators → issues → charset → validate` 순으로 전체 파이프라인이 돌고, 마지막 `data:validate` 단계가 실패하면(학교수/학생수/교원수 공식치 대비 오차, 좌표-시군 정합성, 매칭률 100% 등) 0이 아닌 종료 코드와 함께 무엇이 틀렸는지 표로 보여줍니다 — 이 단계를 통과하지 못한 데이터는 커밋하지 않습니다.
3. **`git status`/`git diff public/data/` 로 실제 변경 내용을 확인합니다.** `public/data/manifest.json`의 `builtAt` 필드는 실행할 때마다 항상 바뀌므로, 그 외 내용이 정말 달라졌는지(지표 값, 연도, 학교 수 등) 확인한 뒤 커밋하세요. `builtAt`만 바뀌고 나머지가 동일하다면(원천 데이터가 그대로인 재실행 등) 그 변경은 커밋하지 않아도 됩니다.
4. `public/data/**`(그리고 필요 시 `data/interim/**`, `data/manual/label-offsets.json` 처럼 수동으로 조정한 파일)를 커밋합니다. `data/raw/**` 는 원천 파일이라 `.gitignore` 로 제외되어 있으니 커밋하지 않습니다.

`data:schools`(및 전체 `data:build`)는 `data/raw/`에서 `한국교육시설안전원_초중등학교위치_` 로 시작하는 CSV 파일을 찾습니다. 수동 매칭 보정은 `data/manual/school-aliases.json`(`"KESS 학교명|시군코드": "위치 CSV 학교ID"`)에 근거(주소 일치 등)가 있는 경우에만 추가합니다. 시군 라벨이 겹쳐 보이는 경우의 픽셀 보정값은 `data/manual/label-offsets.json`(`{ "지역코드": [dx, dy] }`)에 있으며, `data:regions` 가 이를 읽어(1px ≈ 250m, `build-regions.ts`의 `LABEL_OFFSET_METERS_PER_PX`) `regions.geojson`의 `properties.labelPoint` 자체를 지리적으로 옮깁니다 — CollisionFilterExtension의 충돌 가시성 판정이 라벨의 원래(오프셋 미반영) 앵커 좌표를 쓰기 때문에, 렌더 타임 픽셀 오프셋 대신 빌드 타임에 앵커를 옮겨야 라벨이 항상 보입니다(Task B fix round 1).

## 데이터 출처 및 라이선스

- **KESS 교육기본통계 학교별 데이터셋** (한국교육개발원 교육통계서비스) — 지표(학생수/학교수/교원수 등)의 원천. 기준일은 화면 하단 범례와 Footer에 표기됩니다.
- **한국교육시설안전원 초중등학교위치 표준데이터** (data.go.kr) — 학교 점 위치(위도/경도). 시군 선택 시 지도 우측 패널과 화면 하단에 "위치 기준 YYYY-MM-DD" 로 기준일을 표기합니다. 전국 데이터셋 특성상 초·중·고등학교만 포함되어 있고 특수학교 위치는 제공되지 않습니다(자세한 내용은 `data/interim/schools-match-report.json` 참고). 이는 매칭 실패가 아니라 원천 데이터 자체의 구조적 공백이므로, 특수학교도 `public/data/schools.json` 에 좌표 없이(`lat`/`lng: null`, `locationMissingReason` 설명 포함) 실리며 매칭률·검증 대상에서는 제외됩니다 — 지도에는 점으로 그리지 않고, 우측 패널 학교 목록에는 "위치 없음" 배지로 표시됩니다.
- **전북특별자치도교육청 폐교재산 현황** (공공데이터포털) — 폐교 지표(폐교 수/미활용 폐교 수/최근 10년 폐교 수)와 RegionPanel의 폐교 목록의 원천. 원천 파일의 게시(갱신)일이 데이터 기준일과 다른 경우 Footer에 "기준일 …(게시 …)" 형식으로 둘 다 표기합니다.
- **통계청 SGIS 기반 행정동 경계** (vuski/admdongkor, `HangJeongDong_ver20260701.geojson`) — 시군 경계·라벨 위치의 원천. [vuski/admdongkor](https://github.com/vuski/admdongkor) 저장소는 **CC BY 4.0** 라이선스로 배포되며, 이 프로젝트는 그 경계 데이터를 단순화·가공해 `public/data/regions.geojson`/`neighbors.geojson`(`npm run data:regions`)과, 선택한 시군의 하위 읍면동 경계선용 `public/data/emd/<시군코드>.geojson` 14개(`npm run data:emd`)로 다시 배포합니다 — 출처 표기(CC BY 4.0이 요구하는 저작자 표시)는 화면 하단 Footer와 이 문서에 명시합니다.
- **배경지도: 국토교통부 브이월드(VWorld) 오픈API** (`Base` 일반 WMTS 타일) — 브라우저에서 직접 호출하며 지도에 출처를 표시합니다.

`xlsx` 패키지(devDependency)는 KESS `.xlsx` 원본을 읽는 데이터 파이프라인 전용(`scripts/pipeline/parse-kess.ts` 등)이며, 브라우저로 번들되지 않습니다 — 알려진 보안 권고(advisory)가 있으나 런타임 노출 범위 밖이라 별도 조치 없이 유지합니다.

이 프로젝트 자체의 소스 코드 라이선스는 별도로 명시되어 있지 않습니다(저장소 소유자에게 문의).

## 1차 범위에서 제외된 항목

- **다문화(이주배경) 학생 지표** — KESS 통계표(`[주제별] 이주배경(유형별) 학생수`)는 존재하지만, 공개 출처에서 시군 단위로 분해된 데이터를 확보하지 못해 1차 범위에서 제외했습니다.
- **연도 슬라이더** — 특정 연도를 직접 골라보는 UI는 1차 범위에 포함되지 않았습니다. 연도별 추이는 시군 선택 시 RegionPanel의 스파크라인으로 확인할 수 있습니다.
- **배경 타일 지도** — 브이월드 일반지도(`Base`, 원래 색상과 해상도)를 제공합니다. `NEXT_PUBLIC_VWORLD_KEY`가 필요합니다.


## 교육문제 탐색

`교육문제` 탭에서 질문을 선택하면 일반지도 위에 시군별 현황을 반투명 색으로 표시하고 관련 학교를 점과 목록으로 보여줍니다. 지도·비교 목록·범례는 동일한 모델을 사용합니다. `view=issues&issue=regional-sustainability&issueMetric=designation&region=52720`처럼 질문·지표·지역을 URL로 공유할 수 있습니다. 기존 `indicator`·`region` 링크도 유지됩니다.

첫 공개 질문은 다음 두 가지입니다.

- **지역의 지속가능성과 학교**: 행정안전부 인구감소지역·관심지역 지정 현황, 2022→2026 학생수 증감률, 본교 중 학생 60명 이하 학교 비율, 신입생 0명 본교 수.
- **특수교육의 지역별 분포**: 일반학교 특수학급 수·특수교육 학생수와 특수학교 수를 구분합니다. 좌표가 없는 특수학교 11개교도 집계와 목록에 포함합니다.

공식 지정은 미래 소멸 예측이 아니며, 소규모학교 기준은 앱의 탐색 기준입니다. 결측값은 0으로 바꾸지 않습니다. 정책 문서 발행일, 교육통계 기준일, 지정 현황 확인일을 구분해 표시합니다.

### 출처와 갱신

- 정책 질문의 근거: [전북교육청 인수위원회 활동 백서](https://www.jbe.go.kr/board/view.jbe?boardId=BBS_0000002&dataSid=1160997), 2026-08-05 발행. 과제 번호와 쪽수는 `src/lib/issues/registry.ts`에 기록합니다.
- 지정 현황: [행정안전부 인구감소지역 지정](https://www.mois.go.kr/frt/sub/a06/b06/populationDecline/screen.do). `data/manual/population-designations.json`의 상태와 확인일을 공식 자료와 대조해 갱신합니다.
- 학교별 교육통계: 기존 KESS 원천의 KEDI 코드를 기준으로 학교명·시군·학교급·분교 여부까지 대조합니다. `npm run data:issues`가 `public/data/education-issues.json`을 생성하며 `npm run data:validate`가 14개 시군과 학교별 자료의 식별자·값을 검증합니다.

교육문제 자료는 해당 탭에서 별도로 불러오며 실패 시 다시 시도할 수 있습니다. 기존 학교 탐색에는 영향을 주지 않습니다. 갱신 시 학교 자료와 교육문제 자료를 함께 생성·검증·배포합니다.

### 후속 질문 공개 조건

기초학력, 독서, 돌봄, 마음건강, 진로, AI교육은 레지스트리에 준비 상태로 등록하고 화면에는 노출하지 않습니다. 각 질문의 `dataNeeded`에 맞는 공개 자료를 확보한 뒤 지역코드·연도·집계 단위·분모·결측값을 검증하고, 출처·지표 정의·지도 표현·검증 테스트를 추가한 경우에만 `published`로 전환합니다. 공개 자료가 없는 지표나 임의의 위험 점수는 생성하지 않습니다.
