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

데이터 파이프라인 스크립트(`scripts/pipeline/*.ts`)는 이후 태스크에서 구현됩니다.

## 데이터 출처

- 출처·기준일은 추후 이 섹션과 화면 하단 범례에 표기 예정입니다 (예: KESS 교육통계, 기준일 2026.4.1).
