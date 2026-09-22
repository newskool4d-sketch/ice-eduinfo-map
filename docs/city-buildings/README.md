# 반투명 건물 현황판

기본 화면은 `scene=city`, 평면은 `scene=flat`이다. 유효한 URL → `jb-edu-map:scene:v1` 저장값 → 입체 기본값 순서로 적용한다. 기존 위성·지형 설정은 읽지 않는다. 학교 선택은 `school` URL 매개변수로 보존한다.

## 운영 설정

- `vercel.json`의 `regions: ["icn1"]`: 건물 API를 서울에서 실행한다. 미국 iad1에서는 원천 연결 종료/HTTP 오류가 재현됐고 서울에서 정상 반환됐다. Next.js의 폐기된 `preferredRegion` 설정은 사용하지 않는다.
- `VWORLD_BUILDING_KEY`: 서버 전용 VWorld 데이터 API 키. 기존 공개 배경지도 키 설정과 별개다.
- `VWORLD_BUILDING_DOMAIN`: VWorld 키에 등록한 도메인.
- `BUILDINGS_ENABLED=false`: 서버 API 긴급 중단(503, no-store).
- `NEXT_PUBLIC_BUILDINGS_ENABLED=false`: 빌드 시 건물 기능 및 전환 UI를 끄고 평면으로 고정. 변경 후 재배포한다.

API는 `/api/buildings/v1/16/{x}/{y}`이며 전북 도서 포함 bbox의 한 타일 여백까지만 허용한다. 전체 페이지 수/건수/중복 ID를 검사하며 8페이지 또는 전체 10초를 넘으면 실패한다. 성공만 하루 CDN/브라우저 캐시와 7일 stale-while-revalidate를 제공한다. 원천 URL이나 키는 응답 및 오류 로그에 남기지 않는다.

높이는 `height > 0` → `grnd_flr > 0 × 3m` → 높이 0의 윤곽 순서다. 원천값은 별도로 보존한다. 조회 시각은 원천 갱신일이나 교육통계 기준일을 의미하지 않는다.

## 구현 근거

- [공공데이터포털 GIS건물통합정보](https://www.data.go.kr/data/15123970/openapi.do)
- [deck.gl TileLayer](https://deck.gl/docs/api-reference/geo-layers/tile-layer): 줌 16 고정 타일과 캐시 관리
- [deck.gl ClipExtension](https://deck.gl/docs/api-reference/extensions/clip-extension): 원본 도형을 자르지 않고 fragment를 타일 경계로 제한
- [Vercel 캐시 헤더](https://vercel.com/docs/headers/cache-control-headers): 성공 응답 캐시

건물 기능은 교육문제 집계와 독립적이다. 학교 점은 5px billboard, 이름은 11px billboard이며 depth 비교를 항상 통과한다. 건물은 pickable=false이다. 타일 데이터 크기는 JSON 문자열 길이 × 4로 보수적으로 예산을 잡으며 실제 JS 힙/GPU 사용량과는 다르다.

## 재현

```sh
npm run typecheck
npm run lint
npm test
npm run build
npx playwright test --headed --workers=2
npx tsx scripts/verify-building-samples.ts
# 실제 데이터 시각/성능 검증: 셸에 NEXT_PUBLIC_VWORLD_KEY를 안전하게 제공한 뒤 실행
LIVE_BUILDINGS=1 npx playwright test e2e/city-buildings-live.spec.ts --headed --workers=1
```

실제 데이터 테스트는 기본 회귀 실행에서는 건너뛰며, 실제 키를 설정한 별도 실행에서 확인한다. `source-samples.jsonl`에 14개 시군과 선유도의 실제 응답 요약을 기록했다. 김제 표본 1,211동은 두 페이지를 거쳐 처리됐다. 이는 표본이며 전북 전체의 높이 충실도를 나타내지 않는다.

## 시각·성능 증거 (2026-09-22)

`live-*.png`: 전북 전체, 전주, 군산, 진안, 선유도, 모바일 크기 화면. `live-building-metrics.json`: 10회 이동의 타일 수, 데이터 추정 크기, deck.gl GPU 메모리 집계와 프레임 표본.

Apple M4 / ANGLE Metal / Chromium 창 모드에서 2초 연속 이동 rAF 표본은 PC 60.44fps, 모바일 크기 60.42fps였다. 10회 지역 이동 후 캐시는 61타일, 약 38.1MiB였고 GPU 집계는 약 45.1MiB였다. 초기 headless 측정은 약 5fps였으며 실제 GPU 창 모드와 차이가 컸다. 모바일 크기는 같은 Mac의 에뮬레이션이며 실제 휴대전화 성능 인증은 아니다. GPU 메모리는 deck.gl 집계로 브라우저 전체 메모리를 뜻하지 않으며 장시간 누수 부재까지 증명하지 않는다.


## 검증 및 배포 기록

- 전체 단위/컴포넌트/데이터 회귀 737개, 브라우저 회귀 32개. 실제 데이터 테스트 2개는 별도 실행하여 통과했다.
- 학교 선택 줌 16, 최대 줌 18, 5px/11px 고정, 실제 건물 위 학교 picking, 두 교육문제의 alpha 38(약 15%), URL/저장 설정/뒤로가기, 요청 취소 및 타일 재사용을 검증했다.
- 서울 미리보기 API `/api/buildings/v1/16/55914/25774`: 680동, complete=true, 첫 요청 MISS → 다음 요청 HIT(age 33), 동일 조회 시각/내용. 실패 응답은 502 + no-store + MISS였다.
- 운영 smoke 테스트는 `DEPLOYMENT_URL=https://jb-edu-map.vercel.app npx playwright test e2e/deployed-city.spec.ts --headed --workers=1`로 재현한다.
