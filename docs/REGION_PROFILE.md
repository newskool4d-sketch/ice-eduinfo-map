# 지역 profile 추가하기

이 프로젝트는 한 번에 한 시도 데이터를 정적 지도에 빌드합니다. 지역마다 배포본을 따로 만드는 방식이라, 데이터가 섞이지 않고 교육청별 갱신 주기도 독립적으로 관리할 수 있습니다.

## 빠른 시작

1. `src/lib/profiles/jeonbuk.ts`를 복사해 `src/lib/profiles/<지역ID>.ts`를 만듭니다. `id`, 시도명, 전체 집계 코드, 시군구 코드와 이름을 채웁니다.
2. `src/lib/profiles/index.ts`의 `PROFILES`에 새 profile을 등록합니다.
3. 해당 지역의 `sidoCode`, 인접 시도 코드, KESS 시도명, 교육청 코드, 주소 접두어를 입력합니다. 시군구를 하나로 합쳐 표시해야 하면 `sggPrefixOverrides` 또는 `sggCodeOverrides`를 사용합니다.
4. `data/manual/`을 지역 전용 경로로 복사하고 profile의 `files.manualDir`을 바꿉니다. 필요한 파일은 `label-offsets.json`, `school-aliases.json`, `special-school-locations.json`, `population-designations.json`입니다. 자료가 없는 교육문제는 정책 질문에서 `planned` 상태로 둡니다.
5. 해당 지역의 정책 문서와 출처를 `src/lib/profiles/<지역ID>/issues.ts`에 작성합니다. 질문은 공약·백서의 과제 번호와 쪽수, 공개 데이터의 기준일을 근거로 해야 합니다.
6. 원천 파일을 `data/raw/`에 놓고 `npm run data:build -- --profile=<지역ID>`를 실행합니다. 이 명령은 경계, 읍면동, KESS, 학교 위치, 지표, 교육문제, 문자셋을 차례로 생성하고 검증합니다.

`NEXT_PUBLIC_EDU_MAP_PROFILE=<지역ID> npm run dev`로 개발 화면도 같은 profile 이름을 표시할 수 있습니다. 배포 환경에도 같은 환경변수를 설정하세요.

## 지역별로 준비할 자료

| 자료 | 용도 | 필수 여부 |
| --- | --- | --- |
| KESS 학교별 주요통계 | 학교·학생·교원·학급 지표 | 필수 |
| 시군구 경계 | 시군 면과 읍면동 경계 | 필수 |
| 학교 위치 표준데이터 | 지도 위 학교 점 | 필수 |
| 교육청 폐교재산 자료 | 폐교 활용 질문 | 선택 |
| 교육감 공약·인수위 백서 | 교육문제 질문의 정책 근거 | 필수 |
| 지역별 수동 보정과 출처 | 별칭·특수학교 위치·인구감소 지정 | 필요할 때 |

## 데이터와 코드의 라이선스

코드는 [MIT](../LICENSE) 라이선스입니다. 원자료에는 각 제공기관의 이용 조건이 적용됩니다. `data/raw/`는 저장소에 포함하지 않으며, 지역 profile을 추가하는 사람은 원자료의 재배포 가능 여부를 확인해야 합니다. 생성한 경계 파일은 원 출처인 `vuski/admdongkor`의 CC BY 4.0 저작자 표시를 유지합니다. 출처, 확인일, 수동 보정의 근거는 profile과 README에 기록하세요.
