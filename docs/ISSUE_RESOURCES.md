# 교육 자원 자료와 갱신

`data/manual/issue-resources.json`은 기관·사업 명단의 원본입니다. `sources`에는 URL, 기준일 또는 확인일, 수록 범위, 일부 지역만 제공될 때 `coveredRegions`를 기록합니다. `resources`의 각 항목은 질문 ID, 지표 ID(`metric`), 이름, 시군 코드, 주소·연락처, 필요한 경우 좌표·정원·현원을 가집니다. `npm run data:issues`가 학교 통계와 합쳐 `public/data/education-issues.json`을 만듭니다.

| 지표 | 현재 수록 자료 | 출처 |
| --- | --- | --- |
| 기초학력지원센터 | 14개 지역 센터 | [전북교육청](https://www.jbe.go.kr/education/index.jbe?menuCd=DOM_000002501004000000) |
| 교육청 도서관 | 18개관 | [교육청 통합도서관](https://lib.jbe.go.kr/jbe/html.do?menu_idx=27) |
| 거점형 유아 돌봄 | 7곳, 시군 확인 6곳 | [전북교육청](https://www.jbe.go.kr/board/view.jbe?boardId=BBS_0000002&dataSid=1089397) |
| 지역아동센터 | 154곳, 7개 시군만 등록 | [공공데이터포털](https://www.data.go.kr/data/15129438/standard.do) |
| Wee센터 | 16곳 | [전북교육청](https://www.jbe.go.kr/board/view.jbe?boardId=BBS_0000083&dataSid=1003671) |
| 진로진학 상담 | 14개 시군의 신청 목록 | [진로진학센터](https://www.jbe.go.kr/jinro/index.jbe) |
| AI 중점학교 | 81개교 | [전북교육청](https://www.jbe.go.kr/board/view.jbe?boardId=BBS_0000002&dataSid=1087867) |
| 정규 사서·전문상담교사 배치 | 2026 학교별 배치 인원에서 1명 이상 본교 수 | KESS 학교별 주요통계 |

지역아동센터 표준데이터에 없는 7개 시군은 **자료 없음**입니다. 한 기관의 시군이 공식 명단만으로 확정되지 않으면 `regionCode: null`로 두고 도 전체 목록에는 포함하되 시군 집계에는 넣지 않습니다. 좌표가 있는 자원만 지도 점으로 표시하고, 나머지는 시군 색과 목록으로 확인합니다. 명단 수와 교사 배치는 실제 서비스 접근성·대기 인원·운영 시간이나 지원의 충분성을 뜻하지 않습니다.

다른 지역으로 바꿀 때는 [지역 profile 안내](REGION_PROFILE.md)에 따라 profile의 `files.manualDir`에 지역별 파일을 두고, 질문·지표·정책 근거를 해당 지역의 `issues.ts`에 맞춥니다. 출처의 수록 지역을 확인하고 `coveredRegions`를 갱신한 뒤 `npm run data:build -- --profile=<지역ID>`와 `npm test`를 실행합니다. 원자료는 각 제공기관의 이용 조건을 확인해 별도로 내려받습니다.
