# 전북교육지도

전북 14개 시군의 교육통계(학교수·학생수·교원수 등)를 3D 데이터 지도로 보여주는 Next.js 대시보드입니다.

## 요구 버전

| 항목 | 버전 |
| --- | --- |
| Node.js | 22.x |
| npm | 10.x 이상 |
| Next.js | 16.3.x |
| React | 19.3.x |
| deck.gl (`@deck.gl/*`) | 9.4.0 |

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
| `npm run data:kess` | KESS 교육통계 원본 수집·파싱 |
| `npm run data:schools` | 학교 목록/위치 데이터 생성 |
| `npm run data:indicators` | 지표 집계 데이터 생성 |
| `npm run data:charset` | 폰트/문자셋 서브셋 생성 |
| `npm run data:validate` | 생성된 데이터 검증 |
| `npm run data:build` | regions → kess → indicators → charset → validate 순으로 데이터 파이프라인 전체 실행 |

### 전체 데이터 파이프라인 실행 순서 (학교 점 포함)

`data:build` 는 `data:schools` 를 포함하지 않습니다(`package.json` 은 수정하지 않는다는 제약). 학교 점 레이어까지 최신으로 만들려면 아래 순서로 직접 실행하세요:

```
npm run data:regions
npm run data:kess
npm run data:schools     # data/raw/한국교육시설안전원_초중등학교위치_YYYYMMDD.csv 필요 — data:kess 다음, data:indicators/data:charset 이전
npm run data:indicators
npm run data:charset     # public/data/schools.json 이 있어야 학교명이 라벨 문자셋에 포함됨
npm run data:validate    # schools.json 의 좌표/매칭률/시군별 학교수 정합성까지 함께 검증
```

`data:schools` 는 `data/raw/` 에서 `한국교육시설안전원_초중등학교위치_` 로 시작하는 CSV 파일을 찾습니다(파일명 끝의 `_YYYYMMDD.csv` 가 위치 데이터의 기준일자입니다). 파일이 없으면 필요한 파일명을 알려주고 실패합니다. 수동 매칭 보정은 `data/manual/school-aliases.json` (`"KESS 학교명|시군코드": "위치 CSV 학교ID"`)에 근거(주소 일치 등)가 있는 경우에만 추가합니다.

## 데이터 출처

- KESS 교육기본통계 학교별 데이터셋(한국교육개발원 교육통계서비스) — 지표(학생수/학교수/교원수 등), 기준일은 화면 하단 범례에 표기.
- 한국교육시설안전원 초중등학교위치 표준데이터(data.go.kr) — 학교 점 위치(위도/경도). 시군 선택 시 지도 우측 패널과 화면 하단에 "학교 위치 기준 YYYY-MM-DD" 로 기준일을 표기합니다. 전국 데이터셋 특성상 초·중·고등학교만 포함되어 있고 특수학교 위치는 제공되지 않습니다(자세한 내용은 `data/interim/schools-match-report.json` 참고).
