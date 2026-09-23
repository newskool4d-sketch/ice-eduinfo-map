# 지역 profile 추가하기

이 프로젝트는 한 번에 한 시도 데이터를 정적 지도에 빌드합니다. 지역마다 배포본을 따로 만드는 방식이라, 데이터가 섞이지 않고 교육청별 갱신 주기도 독립적으로 관리할 수 있습니다.

## 인천 프로필: 현재 구현 범위

`incheon` 프로필은 2026-04-01 통계와 2026-07-01 인천 11개 군·구를 구분하며, 특수학교를 포함한 학교·학생·교원·위치 기능을 제공한다. 2022~2026년 추세는 `history.json`에서 인천 전체 → 조사 당시 10개 군·구 → 학교 순으로 제공하며 학교급별로 비교할 수 있다. 현행 11개 군·구 경계로 과거 수치를 재배분하지 않는다. 폐교·교육정책·인접 시도와 기존 공통 시계열 로더는 비활성이다.

```powershell
npm run profile:inspect -- --profile=incheon
```

인천의 raw/interim/manual 경로는 각 기존 경로 아래 `incheon/`을 사용하며, 생성 자료 경로는 `public/data/incheon`, 웹 자료 경로는 `/data/incheon`이다. 전북의 기존 경로는 그대로 유지한다. CLI와 웹은 같은 프로필을 지정해야 한다. `--profile`은 파이프라인용이고 웹은 `NEXT_PUBLIC_EDU_MAP_PROFILE`을 사용한다.

현재 `pipelineReady=true`이며 인천 앱 로더·8개 지표·학교 검색·군구 선택을 연결했다. 인천 자료 품질은 PARTIAL을 유지한다. `pipelineReady`는 화면 사용 가능 상태이며 원자료 검증 완료를 뜻하지 않는다.

```powershell
npm run data:incheon
npm run data:activate:incheon
$env:NEXT_PUBLIC_EDU_MAP_PROFILE = 'incheon'
npm run dev
```

`data:incheon`은 검증 대기 패키지를 생성하고, `data:activate:incheon`은 전체 패키지 해시 확인 후 추세를 포함한 앱 자산 24개만 로컬 `public/data/incheon`에 복사한다. 원자료·학교별 대조표·입력 증거는 복사하지 않는다. 전북의 기존 `data:build`는 인천에서 명시적으로 차단하며, 위 전용 명령으로 재생성한다. 원자료는 저장소에 포함하지 않으므로 재생성 시 `data/manual/incheon/input-manifest.json`과 `history-inputs.json`에 지정된 파일·해시가 필요하다. 일반 웹 빌드와 테스트는 커밋된 정적 자료만 사용한다.

인천에서는 폐교·전북 시계열·정책 자료를 요청하지 않는다. 미확보 폐교 자료는 null로 표현하고 메뉴와 상세 목록을 숨긴다. 학교 위치·군구·읍면동·추세는 인천 전용 경로를 사용한다. 인천의 외부 건물 데이터는 연결하지 않아 평면 모드를 사용하며 학교 원통 표시는 별도로 사용할 수 있다. 지도 이동 범위는 서해 도서를 포함한다. 화면 버전·밝은/어두운 테마·글자 크기를 선택할 수 있다.

학교알리미 대조 범위와 휴교 분교·과거 주소의 남은 확인 사항은 [인천 자료 검증 결과](INCHEON_VERIFICATION.md)를 참고한다. 수치 공시가 없는 자료를 0으로 채우거나 미확정 과거 주소를 자동 연결하지 않는다.

## 빠른 시작

1. `src/lib/profiles/jeonbuk.ts`를 복사해 `src/lib/profiles/<지역ID>.ts`를 만듭니다. `id`, 시도명, 전체 집계 코드, 시군구 코드와 이름을 채웁니다.
2. `src/lib/profiles/index.ts`의 `PROFILES`에 새 profile을 등록합니다.
3. 해당 지역의 `sidoCode`, 인접 시도 코드, KESS 시도명, 교육청 코드, 주소 접두어를 입력합니다. 시군구를 하나로 합쳐 표시해야 하면 `sggPrefixOverrides` 또는 `sggCodeOverrides`를 사용합니다.
4. `data/manual/`을 지역 전용 경로로 복사하고 profile의 `files.manualDir`을 바꿉니다. 필요한 파일은 `label-offsets.json`, `school-aliases.json`, `special-school-locations.json`, `population-designations.json`입니다. 기관형 질문을 공개한다면 `issue-resources.json`도 해당 지역 자료로 교체합니다. 자료가 없는 교육문제는 정책 질문에서 `planned` 상태로 둡니다.
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
| 교육 자원 명단 (`issue-resources.json`) | 기관·학교 사업의 시군별 수와 상세 목록 | 기관형 질문을 공개할 때 |

## 데이터와 코드의 라이선스

코드는 [MIT](../LICENSE) 라이선스입니다. 원자료에는 각 제공기관의 이용 조건이 적용됩니다. `data/raw/`는 저장소에 포함하지 않으며, 지역 profile을 추가하는 사람은 원자료의 재배포 가능 여부를 확인해야 합니다. 생성한 경계 파일은 원 출처인 `vuski/admdongkor`의 CC BY 4.0 저작자 표시를 유지합니다. 출처, 확인일, 수동 보정의 근거는 profile과 README에 기록하세요.
