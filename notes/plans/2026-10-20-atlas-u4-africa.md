# 사회과부도 아틀라스 2단계 — Ⅳ 아프리카 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 사회과부도 Ⅳ 아프리카(34~39쪽)를 조각 `atlas-u4-africa`로 만들어 교사 대조표 승인 뒤 공개한다. 공개된 아시아(u2)·유럽(u3) 조각은 화소 하나 바뀌지 않게 지킨다 — 먼저 회귀 도구를 단원 일반형(`regress_unit.mjs`)으로 넓혀 u3 기준선을 찍고(U4-G0), 엔진·공유 파이프라인을 바꿀 때마다 u2·u3 둘 다 확인한다.

**Architecture:** 유럽과 같다. Python(PyMuPDF)으로 PDF 글자·도형·이미지를 뽑아 `C:\Users\Public\atlas-work\`에 두고 → Node 가 앱과 같은 d3 투영(`src/atlas/fitCore.js`)으로 경위도를 맞춰 GeoJSON·지명·내용 JSON 을 만들고 → 공유 엔진(`src/atlas/`)과 공유 조립(`src/atlas/mountAtlas.js`)이 단원 조각을 그린다. 새 단원은 `scripts/atlas/units.json`에 `u4`를 더하고, 모든 명령에 `--unit u4`를 붙인다.

**Tech Stack:** 유럽과 같음 — Vite 6, d3-geo(+projection·polygon), csat-chart.js 2.2.2 저수준 API, PyMuPDF·numpy·shapely(≥2.1)·Pillow·rasterio, mapshaper@0.6.102, `node:test`, Python `unittest`.

**Spec:** `notes/specs/2026-10-20-atlas-phase2-design.md`(§5.2 아프리카, §6 새 기능, §8 교사 답 — 반드시 먼저 읽기), 유럽 계획 `notes/plans/2026-10-20-atlas-u3-europe.md`(특히 「실행 중 결정」 — 이 계획의 「유럽에서 이어받는 요령」이 그 요약), 1단계 계획의 「실행 중 결정」(`notes/plans/2026-10-09-atlas-asia.md` 784줄부터). 규칙: `EMBED_RULES.md`.

---

## 교사에게 물을 것 (쪽 렌더에서 미리 보이는 것 — 답이 오기 전에는 아래 「기본값」으로 만들되 공개하지 않음 ⓣ)

- **Q1 서사하라**: 34쪽은 서사하라를 나라 색(자홍 #ed1064)이 아닌 갈보라 글자(#7e576b)로 쓰고 모로코와의 경계를 **점선**으로 그렸다. 35쪽 색칠하기도 서사하라에 따로 띠를 두르고 이름을 써 두었다(초성 아님). 기본값: Natural Earth 의 따로 된 면(`SAH`)을 그대로 쓰고, 색칠하기에서는 「이름이 쓰인 지역」으로 칠할 수 있게 두되 수도 칸 「—」(`noCapital`), 나라 수(54)에는 넣지 않음. 괜찮을까?
- **Q2 미확정 국경 점선**: 34쪽은 서사하라–모로코, 할라이브 삼각지대(이집트–수단), 일레미 삼각지대(케냐–남수단) 경계를 붉은 점선으로 그렸다. 지금 바탕 지도는 모든 국경을 같은 선으로 그린다. 기본값: 일반도·색칠하기 주제에만 Natural Earth 경계선 중 분쟁 구간을 점선 레이어로 덧그린다(새 레이어 `ne-disputed`, 범례 「미확정 국경」). 아니면 「알려진 차이」로 둘까?
- **Q3 소말릴란드**: Natural Earth 는 소말릴란드(`SOL`)를 나라로 따로 둔다. 교과서는 34·35·38·39쪽 모두 소말리아 한 나라(35쪽 초성 ㅅㅁㄹㅇ 한 면). 기본값: u4 바탕 지도에서 `SOL`을 `SOM`에 합친다(`basemap.mergeIsos`) — 경계선이 사라지고 색칠하기·나라 분류·말풍선이 한 나라로 맞는다. 괜찮을까?
- **Q4 남수단·아비에이·비르 타윌**: 교과서는 남수단을 나라로 그린다(Natural Earth 와 같음). 아비에이는 교과서에 따로 표시가 없고 Natural Earth 나라 면에서도 수단 쪽이다(그대로 둠). 비르 타윌은 Natural Earth 10m(10a 상세도)에만 따로 된 면이다. 기본값: 나라 분류 지도에서는 「분류 없음」(유럽 10a 전용 면 키프로스 기지와 같은 처리), 색칠하기에서는 칠할 수 없는 땅. 괜찮을까?
- **Q5 아프리카 밖 나라의 속령**: 레위니옹·마요트(프랑스), 카나리아 제도·세우타·멜리야(에스파냐), 마데이라(포르투갈), 세인트헬레나(영국), 소코트라(예멘)는 나라 단위 분류(`countryClass`)가 나라 전체를 칠하므로, 표본을 섬에서 찍으면 유럽 본토까지 그 색으로 칠해진다. 기본값: 그 나라들은 「분류 없음」(`countryOverrides`, 섬도 안 칠함 — 대조표 「알려진 차이」). 괜찮을까?
- **Q6 자원 고리 그래프**: 38쪽 「주요 자원의 생산량 비중」은 고리(가운데 빈 원) 7개다. 지도 위 기호는 엔진이 직접 고리로 그린다. 사이드바 「크게 보기」는 csat-chart.js 원그래프에 안쪽 반지름이 없어 유럽 31쪽 코펜하겐처럼 원그래프가 된다 — 기본값은 시험지 양식 SVG 고리(`ring`, u4 자료에만 켜짐)로 그린다. 유럽 코펜하겐 고리도 같은 길로 바꿀까(유럽 v2 공개가 필요)?
- **Q7 「아프리카의 면적 비교」(38쪽 주제도 활동)**: 아프리카 위에 미국·중국·인도·유럽 나라·일본 등 12개 나라를 겹친 삽화다. 기본값: 사진 카드 + 원본 쪽 보기(부분). 나중에 Ⅴ 단원에서 만드는 「끌어 옮기는 실제 크기 윤곽」(`compareOutline`, 설계 Q3 답)을 여기에도 붙일까?
- **Q8 국립 공원·유적 붉은 글자(34쪽)**: 유럽 26쪽 세계 유산 붉은 글자처럼 지명에서 뺀다(찾아보기에도 없음 — 확인함). 일반도에 「국립 공원·유적」 기호 레이어로 따로 보이게 할까?

**교사 답(2026-10-20):**
- Q1·Q2: 기본값대로. 서사하라는 따로 된 면, 미확정 국경은 점선 레이어 `ne-disputed`(U4-3f 진행). 색칠하기에서는 「지역」이고 수도 「—」, 54개국 밖.
- Q3: 기본값대로. 소말릴란드는 u4 바탕에서 소말리아에 합침.
- Q5: 기본값대로. 속령은 「분류 없음」으로 두고 「알려진 차이」에 올림.
- Q6: 고리로 그린다. **유럽 코펜하겐도 SVG 고리로 바꿔 유럽 v2 를 낸다.** 유럽 v2 공개 전에 교사에게 다시 묻는다.
- Q4·Q7·Q8: 따로 묻지 않음. 기본값대로(비르 타윌은 「분류 없음」, 면적 비교는 사진 카드, 붉은 글자는 지명에서 뺌).

---

## 공통 사항 (모든 작업자 필독)

- 저장소 루트: `C:\Users\김용현\Desktop\동아출판 사회과 바이브코딩\app`(아래 경로는 모두 여기 기준). 가지 **`atlas-u4`**(main cc67098 에서 만듦, 워크트리 없음). PDF: `..\22개정_중학_사회과 부도_교과서_본문.pdf`(인쇄 쪽 = PDF 쪽). 쪽 렌더: `C:\Users\Public\atlas-work\phase2\pages\p034.png`~`p039.png`(100dpi).
- **ASCII 작업 폴더** `C:\Users\Public\atlas-work\`(env `ATLAS_WORK`), 단원 작업 파일은 `units/u4/…`. 한글 경로에 대량 출력 금지(0xC0000409). Node `cpSync`/`rmSync({recursive})` 금지 — 손 순회.
- Python 은 항상 `python -I`, 한글 출력은 `sys.stdout.reconfigure(encoding='utf-8')`. **파일을 쓸 때는 `newline='\n'`**(유럽 U3-4 — 텍스트 모드 CRLF 가 도장 바이트 해시를 바꿨다).
- git: **`git add -A` 금지**. 자기 파일만 경로로 add. 커밋 메시지 한국어, 끝에 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`(+ 세션 줄). author 는 저장소 로컬 설정(noreply).
- 전역 훅: Write 할 때 파일 머리 `© 2026 김용현` 줄 — 지우지 않는다. Bash 할 때 build-check 가 돈다.
- 헤드리스 Chrome: `--headless=new --disable-gpu --use-angle=swiftshader --enable-unsafe-swiftshader`, 매번 새 `--user-data-dir`, `--disk-cache-size=0`, 출력은 `C:/Users/Public/...` 슬래시 경로. 캡처는 `Date.now` 고정(`fixedNow`).
- UI 문구 한국어, 이모지 금지(`src/shared/dom.js icon()` 선 아이콘). 그래프는 csat-chart.js 저수준 렌더러만(`CsatChart` 클래스 import 금지), csat 에 없는 형식만 시험지 양식 SVG.
- 테스트: `npm test`(Python + Node). u3 끝 기준 **Python 279 · Node 459** — U4-G0 에서 지금 수를 다시 적는다.
- 조각: `npm run embed -- atlas-u4-africa` → `npm run check:embed`. 공개: `npm run release -- atlas-u4-africa --note "…"`.
- **회귀 관문(이 단원의 핵심 규칙)**: 엔진(`src/atlas/*`)·공유 파이프라인(`scripts/atlas/*.py|mjs`)을 고친 커밋마다 `node scripts/atlas/regress_unit.mjs --unit u2 --check`와 `--unit u3 --check`를 모두 통과해야 한다(조건: 저장소·작업 산출물 해시 같음 — 도장 inputsHash 만 다른 것은 정당, 대조표 캡처 u2 41장·u3 31장 화소 차 0, 대조표 수 u2 0/9/134/24 · u3 0/26/118/42, 조각 크기 ±1%). 새 동작은 **설정 키나 자료 키가 있을 때만** 켜지게 만든다(유럽에서 쓴 방식 그대로) — 키가 없으면 옛 길.
- **공개본은 다시 만들지 않는다**: u2·u3 의 `sims/*/data`·`content/atlas/u2|u3`·`docs/atlas-u2-asia|u3-europe/<판>/`은 이 단원에서 다시 생성하지 않는다. 도장 입력 스크립트(`build_basemap.mjs`·`coloring_quiz.mjs`·`georef.mjs`·`geo_util.mjs`·`extract_text.py`·`pdfkit.py`·`atlas_common.py` 등 — 각 단원 설정 `content.stamps`)를 고치면 그 단원 생성물의 도장이 낡았다고 나올 뿐 파일은 그대로다. 그래서 도장 입력 스크립트는 **꼭 필요할 때만** 고치고, 고치면 「실행 중 결정」에 적는다.
- 리뷰 관문: 작업마다 코드 리뷰(서브에이전트 `superpowers:requesting-code-review`) → 고침 → 커밋. **교사 관문 ⓣ**: 위 Q1~Q8 답, U4-10 대조표 승인, U4-11 공개.
- 단원 고르기: 모든 파이프라인 명령에 `--unit u4`(또는 env `ATLAS_UNIT=u4`). 안 붙이면 u2.

## 유럽에서 이어받는 요령 (다시 찾지 않도록 — 유럽 계획 「실행 중 결정」 요약)

| 요령 | 유럽에서 생긴 곳 | 아프리카에서 쓸 곳 |
|---|---|---|
| 기준점 자동화 `land_shapes.py` + `shape_controls.py`(섬·호수 중심 `centroid`, 해안·국경 꺾인 점 `tips`, `target: countries` + `insetPt`) | U3-2 | 눈금 없는 지도 전부(35·36·38·39쪽), 색칠하기는 나라 띠라 `target: countries` |
| `projectionFrom`(본 지도 도법·매개변수 고정, 닮음 변환만) — 짝 되풀이가 수렴하지 않을 때 | U3-4 아이슬란드 | 37쪽 1월·7월 작은 지도, 38·39쪽 작은 아프리카 지도들(같은 바탕 지도면), 39쪽 사막화(잘린 틀) |
| `countryClass`(나라 ∩ 지도 틀 되돌린 면에서 표본, 10a 전용 면 `levels` 보고, 작은 나라 경고, `countryOverrides` cls/label·배열) | U3-3a·U3-4 | 38쪽 언어·자원, 39쪽 AfCFTA |
| 래스터 분류 덧규칙 `rasterMask`·`rasterIgnoreImages`(핀 그림)·`rasterCoastPx`·`rasterAliases`(견본색 ≠ 지도색)·`rasterForeignImages`·`rasterEdgePt`·작은 섬 살리기 `rescue_islands` + `deblend` | U3-4 29쪽 | 37쪽 기후 구분·1월·7월, 38쪽 태양광(세계) — 카보베르데·코모로·모리셔스·세이셸·상투메·카나리아 같은 작은 섬 |
| **인라인 래스터 기호**: PDF 벡터가 아니라 작은 그림(xref 0)이면 symbols.py 로 안 잡힘 → 400dpi 렌더 화소 가면 | U3-3c·U3-4 30쪽 원 | **38쪽 인구 피라미드 막대**(쪽 안 xref 0 그림 1,119개 — 피라미드 자리 두 덩어리 [642,161,730,238]·[642,260,730,338]) |
| 지명 `glue`(다른 글꼴 낱자·㏇ 코드 잇기), `extraNames`, `neAlias`(같은 이름 다른 도시), `snapKm 30`, 찾아보기 누락 0 | U3-5 | 영문 수도 Yaoundé·N'Djamena·Lomé·São Tomé 등 악센트 낱자, **트리폴리**(리비아 ↔ 레바논 — `neBox`에 둘 다 듦) |
| 색칠하기 `ignoreLabels`·`joinLabels`·`isoByLabel`·`capitalByNe`·`noCapital` | U3-8 | 35쪽 「ㅋㄱ ㅁㅈ / ㄱㅎㄱ」·「ㄴㅇㅍㄹㅋ / ㄱㅎㄱ」 두 줄, 손글씨 수도 조각 「로」, 서사하라 |
| 작은 나라 고리 `coloring.smallPx`(나라 전체 geoBounds 로 잼) | U3-9 + 리뷰 후속 | **35쪽에 작은 나라가 많다** — 켠다. 단 감비아(가늘고 김)·세이셸·카보베르데·코모로(흩어진 섬)는 **상자가 커서 고리가 안 생김** → U4-3e |
| 값·이름 상자 `nameInBox`, 지명 장애물(`labelObstacles`) | U3-9 | 38쪽 자원 지도 위 나라 이름 + 고리 기호가 지명과 겹치지 않게 |
| 대조표 `checks.known`(tb/web/webIncludes)·`checks.teacher`, countryClass 범례·분류 확인 | U3-10 | **known 에 퍼센트 고정 `pct`를 더한다**(유럽에서 남은 것 — 92% 가 80% 로 떨어져도 「알려진 차이」로 남던 구멍) → U4-10 |
| 성능 측정 꼴(`perf_u3.mjs`), 구드 예외(단속 자르기·극이 보이면 경도 전체 viewRect) | U3-11 | 일반도 고도 색·지형 자연색 구드 — 넘으면 고치지 않고 기록(유럽 공개 때 판단을 따름) |
| 회귀 도구 범위: 작업 파일 목록을 그 단원 쪽으로 한정(`places-p16~p25`만), `docs/assets/atlas/<단원>`·`common`만 | U3-2·U3-6 후속 | `regress_unit.mjs`가 단원 표 `pages`로 자동 한정(U4-G0) |
| 도장(inputsHash)은 입력 **스크립트** 내용도 해시 — 스크립트를 고치면 다른 단원 도장도 정당하게 바뀜 | G1·G2 | 위 「공개본은 다시 만들지 않는다」 |
| 「烋」(’) 글꼴 코드 문제 — pdfkit 은 u2 도장 입력이라 고치지 않고 `captionOverride`·`titleOverride`·overrides | U3-6·U3-8 | 같은 글자가 나오면 같은 길 |

## 쪽 목록 (쪽 렌더 6장과 PyMuPDF 조사로 셈 — 수는 추출 때 다시 센다)

| 쪽 | 내용 | 그리기 방식(조사) |
|---|---|---|
| 34 | 일반도 「아프리카」 정거 방위 1:36,000,000(서아시아·남유럽 일부 포함). 고도 색 + 음영 래스터, 한글 지명 + 나라·수도 영문(나라 영문은 자홍 Helvetica), 수도 ■·도시 ○, 산 높이(DINPro), 지형 상자 글자(사하라 사막·칼라하리 사막 등), **국립 공원·유적 붉은 글자 75조각**(#d71920 4.9pt), 소속 표시 (프)(영)(포)(에)(이)(앙골라), 서사하라 갈보라 글자, 미확정 국경 붉은 점선(서사하라·할라이브·일레미), 높이·깊이 범례, 경위선 눈금(아래 30°W~60°E, 양옆 30°N~30°S), 찾아보기 격자 글자 A~I·1~7. | 큰 래스터 1장 + **아주 작은 그림 12,000여 개**(<10pt² — 사막 점무늬 조각으로 보임) + 회색 작은 채움 18,800여 개(36쪽에도 같은 수 — 쪽 바탕 무늬). 그림·채움 후보 찾기에서 크기 하한으로 거른다. |
| 35 | 색칠하기 「아프리카의 국가와 주요 도시」 정거 방위 1:36,000,000. 초성 나라 36(12.8pt 30 + 8.8pt 6), 이름이 쓰인 나라·지역 21(작은 나라 + 서사하라), 손글씨 수도 32, 범례 수도 ★·대도시 ○, 개관 글 상자, 「각 나라에 색칠하여…」, 활동 자료(붙임 딱지). 나라 경계는 두꺼운 색 띠. | 벡터 + 쪽 바탕 래스터 조각 |
| 36 | 지형: 자연색 래스터(naturalearthdata.com, 2023) + 지형 이름 상자, 빈 핀 7(#7251a1) + 사진 7(나일강·킬리만자로산·사하라 사막·나미브 사막·테이블 마운틴·빅토리아 폭포·칭기), 활동하기 1(빈 핀 — 번호 숨김). | 래스터 1장 + 벡터 글자 |
| 37 | 기후: 「아프리카의 기후 구분」 래스터(gloh2o.org 1991~2020) 범례 10(열대 3 — 열대 우림·열대 계절풍·사바나 / 건조 2 — 사막·스텝 / 온대 4 — 온난 습윤·서안 해양성·온대 겨울 건조·지중해성 / 고산 빗금), 경위선 글자 약 12. 「1월·7월 평균 기온과 강수량」(worldclim 1970~2010) 강수 7단계 + 등온선(10·20·30). 기후 그래프 4(카이로 사막·키상가니 열대 우림·도도마 사바나·케이프타운 지중해성), 사진 4, 핀 4, 활동하기 2. | 기후 구분 래스터 조각 5 + 흰 국경 벡터, 1월·7월 래스터 각 1 + 등온선 벡터 |
| 38 | ① 「주요 언어 분포」(wikimedia.org, 2023) 나라 단위 8분류(아프리칸스어·아랍어·영어·프랑스어·포르투갈어·에스파냐어·스와힐리어·기타) — 공용어 둘 이상인 나라는 **사선 줄무늬**(남아공은 셋으로 보임), 「주요 종교 분포」(『필립스 세계 지도』, 2021) 지역 면 4분류(이슬람교·크리스트교·토속 종교·비거주지). ② 다양한 문화 사진 6(가면·피카소 그림·에이시·타진·카사바·푸푸 — 설명 4). ③ 「주요 자원의 생산량 비중」(『자원 데이터 파일』, 2023): 작은 아프리카 지도(생산국 10 나라별 색 + 나라 이름) 둘레 고리 7(보크사이트·우라늄·다이아몬드·크롬·코발트·백금·망간 — 가운데 총량·해), 「아프리카의 인구 구성」 피라미드 2(세계·아프리카 2021, UN 『세계 인구 전망』 2022, 18구간 0~4…85 이상), 「아프리카의 태양광 에너지 잠재력」(globalsolaratlas.info, 2023) **세계 래스터 6단계, 태평양 중심**(동해·독도·이어도 종합 해양 과학 기지 글자). 주제도 활동 「아프리카에 대해 우리가 지니고 있는 인식 알아보기」: 문항 ①②, 도시 사진 4(요하네스버그·나이로비·카사블랑카·라고스), 「아프리카의 면적 비교」 삽화(벡터 — 나라 12 겹침). | 언어·종교·자원 벡터, 피라미드 막대는 **인라인 그림**, 태양광 래스터 조각 수십 장 |
| 39 | ① AU 본부 사진 + 「의제 2063」 그림(일곱 열망 — 벡터 삽화). ② 「아프리카 대륙 자유 무역 지대(AfCFTA)」 나라 3분류(비준 완료·협정 서명·협정 서명 전, AfCFTA 2023) + 수치 그림(2021: 47개국·13억 명·3.4조 달러 / 2030 목표: 무역 2배·17억 명·6.7조 달러). ③ 사막화: 지도(사막화 위험 5단계 매우 높음~매우 낮음(미국 농무부, 2016) + 건조 지역 + **사하라 사막 점무늬** + **사헬 지역 파란 빗금** + 사헬 경계 파란 굵은 선 2줄, 흰 점선 국경) + 「그레이트 그린 월 프로젝트로 복원된 녹지 면적」 원 크기 11개국(UNCCD 2019, 십 km²) + 사진 2. ④ 변화를 이끈 사람들 사진 3(넬슨 만델라·이태석·왕가리 마타이). ⑤ 적정 기술 사진 4(머니 메이커 펌프·항아리 냉장고·큐 드럼·솔라 카우 — 설계 「5」는 어림). 주제도 활동 「생활 속 공정 무역 조사해 보기」: 문항 ①②, 사진 2(WFTO·FLO), 참고 사이트(https://t25.kr/83sz) + QR. | 모두 벡터(사진 13 제외) |

**합계**: 지도 12 · 레이어 11(+ Q2 점선 1) · 사진 약 35(지형 7·기후 4·문화 6·잠재력 활동 5·협력 2·지속가능 13 — 실측으로 고침) · 그래프 15(기후 4·고리 7·피라미드 2·원 크기 1·수치 표 1) · 핀 11(지형 7·기후 4) · 지도 위 고리 기호 7 · 주제 8.

설계 §5.2 와 다른 점(실측): 지도 13 → 12(설계는 면적 비교 삽화를 지도로 셈 — 지도가 아니라 삽화), 적정 기술 사진 5 → 4, 원 크기 그래프 10 → 11개국. 주제 짜기도 바꾼다(아래 — 「문화」만 따로 두면 지도가 없는 주제가 생겨서).

## 주제 (사이드바 목차 8개 — id · 쪽 · 묶음)

| id | 제목(목차) | 쪽 | 지도 묶음(views) | 사이드바 |
|---|---|---|---|---|
| `general` | 일반도 | 34 | `africa`(p34-africa) | 제목·도법 글, 원본 쪽 |
| `coloring` | 색칠하기 | 35 | — | 목표·개관·활동, 색칠하기 퀴즈(54 + 서사하라 Q1) |
| `relief` | 지형 | 36 | — | 핀 7(번호 숨김), 활동하기 1, 출처 |
| `climate` | 기후 | 37 | `climate`·`jan`·`jul` | 그래프 마커 4(번호 숨김), 활동하기 2 |
| `culture` | 언어·종교와 문화 | 38 ①② | `language`·`religion` | 본문, 사진 6(설명 4), 원본 쪽(부분) |
| `potential` | 자원과 지역 잠재력 | 38 ③ + 주제도 활동 | `resources`(나라 칠함 + 고리 7)·`solar`(세계, **중심 경도 150**) | 그래프 블록 피라미드 2, 본문, **주제도 활동 = 문항 카드 2 + 도시 사진 4 + 면적 비교 카드 + 원본 쪽 보기(부분)** |
| `cooperation` | 지역 협력 | 39 ①② | `afcfta` | AU 사진·의제 2063 카드, AfCFTA 표 카드 |
| `sustainable` | 지속가능한 발전 | 39 ③④⑤ + 주제도 활동 | `desert` | 원 크기 그래프, 사진 2 + 3 + 4, **주제도 활동 = 문항 카드 2 + 사진 2 + 참고 사이트 + 원본 쪽 보기(부분)** |

- 바탕 기본값: 일반도 `tint`, 지형 `natural`, 나머지 없음(`baseColor`).
- 핀 번호 숨김(`pinNumbers: "hidden"`): 지형(활동하기 1)·기후(활동하기 2 「위치를 지도에 표시」).
- **주제도 활동(교사 Q4 답 — 문항 카드 + 원본 쪽 보기, 색칠 도구 없음)**: 지금 내용 모델이 이미 받는다 — 아시아 24쪽과 같은 `{type:'activity', role:'theme', titleSrc, src}` 블록(첫 문항에 활동 제목) + `{type:'page', page, bbox}` 부분 보기 + 사진 블록. `buildTopic`(src/atlas/topic.js)은 `activity` 블록을 글 카드로, `page` 블록을 「원본 쪽 보기 — 부분」 단추로 그린다. **엔진 작업 없음.** 문항 번호 ①②는 PDF 에서 원 안 숫자가 따로 그린 글자라 1단계처럼 블록 차례로만 둔다(번호 글자를 붙이지 않음). 문항 카드 꼴(테두리 등)을 바꾸면 u2 24쪽 화면이 바뀌므로 바꾸지 않는다.

## 파일 구조 (이 계획이 만들거나 바꾸는 것)

```
scripts/atlas/
  regress_unit.mjs        단원 일반 회귀 도구 --unit uN --baseline|--check                 (U4-G0 새로)
  regress_u2.mjs          regress_unit --unit u2 를 부르는 얇은 껍데기(명령 그대로)            (U4-G0 고침)
  units.json              u4 더함                                                          (U4-1 고침)
  config/u4.json          아프리카 단원 설정                                                 (U4-1 새로)
  config/u4.compare.json  대조표 장면·확인 목록                                              (U4-10 새로)
  maps_u4.json            아프리카 지도 목록 12                                              (U4-1 새로)
  country_class.py        다중 채움(줄무늬) 분류                                            (U4-3a 고침)
  zones.py                점무늬 면 dots_zone                                               (U4-3b 고침)
  charts_read.py          pyramidRaster · bubbleRow 읽개                                   (U4-7 고침)
  build_layers.mjs        chartSymbols 레이어 · multiFill · dots                            (U4-3 고침)
  build_basemap.mjs       mergeIsos(설정 있을 때만)                                         (U4-9 고침 — 도장 입력, 기록)
  compare.mjs             checks.known 의 pct                                               (U4-10 고침)
src/atlas/
  countryClass.js·layers.js·layerStyle.js   줄무늬·점무늬 채움                                (U4-3a·b)
  layers.js(또는 chartSymbols.js 새로)       지도 위 고리 기호                                 (U4-3c)
  chartCore.js·charts.js                    ring(고리) SVG, bubbleRow                        (U4-3c·d)
  quiz.js                                   작은 나라 넓이 기준 smallMetric                   (U4-3e)
sims/atlas-u4-africa/        index.html · main.js · data/*(생성물)                          (U4-9 새로)
content/atlas/u4/            topics.json · overrides.json · photos.json · coloring.json · issues.md
docs/assets/atlas/u4/        photo/ · page/
tests/atlas/regressUnit.test.mjs                                                              (U4-G0 새로)
tests/atlas/units/u4.{layers,places,photos,content}.test.mjs                                   (U4-4~8)
scripts/atlas/tests/test_maps_u4.py · test_text_u4.py                                          (U4-1·U4-8)
```

---

## U4-G0. 회귀 도구 일반화 + u3 기준선 (엔진·공유 스크립트를 바꾸기 전에)

### Task U4-G0: `regress_unit.mjs --unit uN --baseline|--check`

**Files:** Create `scripts/atlas/regress_unit.mjs`, `tests/atlas/regressUnit.test.mjs`; Modify `scripts/atlas/regress_u2.mjs`(껍데기로); Output `$ATLAS_WORK/units/u3/baseline/`(저장소 밖)

까닭: u3 이 공개되었고, 이 단원은 엔진(줄무늬·점무늬·고리 기호·고리 그래프·작은 나라)과 공유 파이프라인(country_class·zones·charts_read·build_layers·build_basemap·compare)을 고친다. 지금 회귀 도구는 u2 뿐이라 u3 을 지킬 수단이 없다.

- [x] **Step 1: 실패하는 테스트** (`tests/atlas/regressUnit.test.mjs`)
```js
import test from 'node:test'; import assert from 'node:assert/strict';
import { unitSpec, pagePrefixes } from '../../scripts/atlas/regress_unit.mjs';
const W = { ATLAS_WORK: 'C:/W' };
test('쪽 접두: 단원 표 pages 범위', () => {
  assert.deepEqual(pagePrefixes([16, 25]), ['p16', 'p17', 'p18', 'p19', 'p20', 'p21', 'p22', 'p23', 'p24', 'p25']);
  assert.deepEqual(pagePrefixes([34, 39]), ['p34', 'p35', 'p36', 'p37', 'p38', 'p39']);
});
test('u2 명세는 regress_u2 옛 목록·자리 그대로(기준선을 다시 찍지 않아도 맞게)', () => {
  const s = unitSpec('u2', W);
  assert.deepEqual(s.repoDirs, ['sims/atlas-u2-asia/data', 'content/atlas/u2', 'docs/assets/atlas/u2', 'docs/assets/atlas/common']);
  assert.equal(s.embed, 'embed/atlas-u2-asia.html');
  assert.equal(s.base, 'C:/W/units/u2/baseline'); assert.equal(s.shots, 'C:/W/shots/e2'); assert.equal(s.compare, 'C:/W/compare-u2.html');
  assert.deepEqual(s.workExtra, ['text/p17-labels.json', 'tables/charts-u2.json', 'tables/climate-world.json', 'tables/index.json']);
});
test('u3 명세: 단원 작업 폴더·공개본·26~33쪽만', () => {
  const s = unitSpec('u3', W);
  assert.ok(s.repoDirs.includes('docs/atlas-u3-europe'));            // 공개본(판 폴더)도 지킴
  assert.ok(!s.repoDirs.includes('docs/assets/atlas/u2'));
  assert.equal(s.shots, 'C:/W/units/u3/shots/compare'); assert.equal(s.compare, 'C:/W/units/u3/compare.html');
  assert.deepEqual(s.prefixes, pagePrefixes([26, 33]));
  assert.ok(s.workExtra.includes('units/u3/tables/charts-u3.json') && s.workExtra.includes('units/u3/text/p27-labels.json'));
});
test('모르는 단원·쪽 없는 단원은 오류', () => assert.throws(() => unitSpec('u9', W), /u9/));
```
- [x] **Step 2:** `npm test`로 실패 확인.
- [x] **Step 3: 구현** — `regress_u2.mjs` 본문을 `regress_unit.mjs`로 옮기고 단원 의존 값만 `unitSpec(id, env)`로 뺀다: `repoDirs`(`sims/<sim>/data`·`content/atlas/<id>`·`docs/assets/atlas/<id>` + u2 는 `docs/assets/atlas/common`, 공개된 단원은 `docs/<sim>`), `embed`, `prefixes`(units.json `pages` → `vec/<접두>-*.json`·`geo/<접두>*.fit.json`·`text/places-<접두>-*.json`), `workExtra`(u2 = 옛 목록 그대로, 새 단원 = `units/<id>/text/*-labels.json`·`units/<id>/tables/charts-<id>.json`·`units/<id>/geo/city-holdout.json`), `base`(`units/<id>/baseline`), `shots`·`compare`(u2 = `shots/e2`·`compare-u2.html`, 그 밖 = `UNIT.workFile('shots/compare')`·`UNIT.workFile('compare.html')`). 한 단원 값이 설정에 없으면 오류(조용히 넘어가지 않음). `import.meta` 가 진입점일 때만 명령줄을 돈다(테스트에서 import 가능). `regress_u2.mjs` = `regress_unit.mjs --unit u2 …`를 그대로 부르는 껍데기(머리 주석에 옮긴 까닭).
- [x] **Step 4: u2 동작 그대로 확인** — `node scripts/atlas/regress_u2.mjs --check` → 지금과 같은 출력(도장만 다름 2 = coloring.json·basemap.json, 캡처 41장 화소 차 0, 대조표 0/9/134/24). 기준선 파일은 건드리지 않는다.
- [x] **Step 5: u3 기준선** — `node scripts/atlas/compare_shots.mjs --unit u3` → `node scripts/atlas/compare.mjs --unit u3`(결과 0/26/118/42 확인) → `npm run embed -- atlas-u3-europe`(크기 1,461,440 B 근처 — 다르면 멈추고 까닭) → `node scripts/atlas/regress_unit.mjs --unit u3 --baseline` → 곧바로 `--check`로 「다른 파일 0, 화소 차 0」(도구 자체 검사). 해시 항목 수·캡처 31장·대조표 수·조각 크기를 「실행 중 결정」에.
- [x] **Step 6:** `npm test` 수를 적고 커밋(`scripts/atlas/regress_unit.mjs scripts/atlas/regress_u2.mjs tests/atlas/regressUnit.test.mjs`).

---

## U4. Ⅳ 아프리카 (34~39쪽) — 조각 `atlas-u4-africa`

### Task U4-1: 단원 설정 뼈대와 지도 목록 `config/u4.json` · `maps_u4.json`

**Files:** Create `scripts/atlas/config/u4.json`, `scripts/atlas/maps_u4.json`, `scripts/atlas/tests/test_maps_u4.py`; Modify `scripts/atlas/units.json`

- [x] **Step 1:** `units.json`에 `"u4": { "sim": "atlas-u4-africa", "title": "Ⅳ. 아프리카", "pages": [34, 39], "config": "config/u4.json" }`.
- [x] **Step 2:** `config/u4.json`은 **u3 설정의 키 구조를 복사**해 만든다(값은 비우거나 아프리카 값): `maps: "../maps_u4.json"`, `out: "sims/atlas-u4-africa/data"`, `photos.outJson: content/atlas/u4/photos.json`, `photos.assetDir: docs/assets/atlas/u4`, `photos.assetPrefix: "u4/"`, 작업 파일 키(places.index.out·charts.out·content.labels·content.charts·photos.sheetDir)는 `units/u4/…`(유럽 U3-1 결정 — `@unit/`을 풀지 않는 키), 도장은 `@unit/…`. `tint`·`natural` 절 없음. `georef.families`: 1단계 8개(정거 방위 `azimuthalEquidistant` 포함 — 새 후보 불필요). `basemap.unitBoxes`: 34쪽 틀 어림 `[[-30, -40, 65, 42]]`(U4-2 뒤 fit 으로 다시). `basemap.levels` 10a 의 `simplifyByIso`는 **두지 않음**(아프리카 상자에 한반도 없음 — 유럽 U3-9 `checkByIso` 결정).
- [x] **Step 3:** `python -I scripts/atlas/find_maps.py 34 39`(34쪽은 작은 그림 12,000여 개가 후보를 덮으면 크기 하한 옵션으로) + 쪽 렌더를 보며 `maps_u4.json`. kind 는 1단계·유럽 목록 + `language|religion|resources|solar|afcfta|desertification`.
  - 지도 12개:

    | id | kind | 지면 | 기준점 길 |
    |---|---|---|---|
    | `p34-africa` | general | 정거 방위 1:36,000,000, 쪽 전체, 경위선 눈금 글자(어림 24 — 실측), 범례·제목 상자(`legendBbox`·`cartoucheBbox`) | 교차점 + 도시 기호(`city_controls`) |
    | `p35-coloring` | coloring | 정거 방위 1:36,000,000, 쪽 전체, 개관 글 상자 [60,535,315,705] 어림 | `shapes.target: countries` + `insetPt`(나라 띠) |
    | `p36-relief` | relief | 자연색 래스터, 활동하기 상자 [45,505,275,535] 어림 | 섬·호수 중심(빅토리아·탕가니카·말라위호, 마다가스카르·카나리아·카보베르데·비오코) |
    | `p37-climate` | climate | 래스터, 경위선 곡선 + 글자 약 12, 범례 [55,330,165,425] 어림 | 교차점 + 섬·호수 |
    | `p37-jan` · `p37-jul` | temp-precip | 작은 지도 2(강수 래스터 + 등온선) | 섬·꺾인 점, 안 되면 `projectionFrom: p37-climate` |
    | `p38-language` · `p38-religion` | language · religion | 작은 아프리카 두 장(500km 축척) | 섬·호수·꺾인 점, 안 되면 `projectionFrom: p34-africa` |
    | `p38-resources` | resources | 작은 아프리카(1,000km) + 둘레 고리 7 | 같음 |
    | `p38-solar` | solar | **세계, 태평양 중심**, 적도선만 | 세계 섬·호수(Natural Earth 10m 육지 조각) |
    | `p39-afcfta` | afcfta | 작은 아프리카(500km) | 섬·꺾인 점, 안 되면 `projectionFrom` |
    | `p39-desert` | desertification | 잘린 틀(서아프리카~아프리카의 뿔, 500km) | 해안 꺾인 점(베르데곶·본곶·하푼곶)·차드호, 안 되면 `projectionFrom: p34-africa` + 닮음 |

  - 지도로 넣지 않는 것: 38쪽 「아프리카의 면적 비교」 삽화, 39쪽 「의제 2063」 그림 → 사진 카드(벡터 삽화를 렌더해 자름). 39쪽 AfCFTA 수치 그림 → 표 카드. 37·38·39쪽 사진 위 말풍선·활동 상자는 활동 블록.
- [x] **Step 4: 개수 대조** — `python -I -c "import json;print(len(json.load(open('scripts/atlas/maps_u4.json',encoding='utf-8'))))"` = 12. 설계 §5.2 표(13)와 다른 까닭을 「실행 중 결정」에(면적 비교는 삽화).
- [x] **Step 5: 테스트** `scripts/atlas/tests/test_maps_u4.py`(test_maps_u3.py 꼴): id 유일·쪽 34~39·bbox 가 쪽 안·kind 가 정해진 목록·`georef:false` 아닌 지도는 `graticuleLabels` 또는 `shapes`/`controls`·`projectionFrom`이 가리키는 지도가 목록에 있음.
- [x] **Step 6:** 커밋(`scripts/atlas/units.json scripts/atlas/config/u4.json scripts/atlas/maps_u4.json scripts/atlas/tests/test_maps_u4.py`).

### Task U4-2: 기준점과 경위도 맞추기

**Files:** Modify `scripts/atlas/maps_u4.json`, `scripts/atlas/config/u4.json`(`cityControls`·`shapeControls`·`unitBoxes`); Test `scripts/atlas/tests/test_controls.py`·`tests/atlas/georef.test.mjs`에 u4 경우

- [x] **Step 1:** `python -I scripts/atlas/extract_vectors.py --unit u4 --controls all`. 34쪽 경위선 글자(DINPro, `°`·`˚` 둘 다)와 교차점, 찾아보기 격자 글자(A~I 파랑 #0095da·1~7 초록 #00a650)는 기준점이 아님(무시 규칙). 37쪽 곡선 경위선 교차점.
- [x] **Step 2:** 34쪽 도시 기호 기준점: `node scripts/atlas/city_controls.mjs --unit u4 --write`(설정 `cityControls` = u3 값 복사 + `neBox` 아프리카 `[-30, -40, 65, 42]`, `note` 아프리카용). 먼저 34쪽 지명 원료가 있어야 하므로 `python -I scripts/atlas/places.py --unit u4`를 한 번 돌린다(유럽 U3-2 와 같음). 동명 다른 도시(트리폴리 — 리비아·레바논)는 MAD 거르기로 빠지는지 확인.
- [x] **Step 3:** 눈금 없는 지도는 `python -I scripts/atlas/land_shapes.py --unit u4 <id>` → `python -I scripts/atlas/shape_controls.py --unit u4 <id>`. 36쪽 래스터는 유럽 28쪽처럼 섬·호수 중심만(tips 는 화소 경계가 거칠어 나빠짐 — U3-2). 38·39쪽 작은 지도는 섬이 적다(마다가스카르·카나리아·카보베르데·비오코·잔지바르·코모로) → 해안 꺾인 점 + 큰 호수, 짝 되풀이가 5번 안에 수렴하지 않거나 매개변수가 오가면 **`projectionFrom`**(유럽 아이슬란드 결정 — 「같은 바탕 지도를 줄인 것」이면 배율·회전만 맞음).
- [x] **Step 4:** `node scripts/atlas/georef-cli.mjs --unit u4 --all` → 표(`id family rmsPt rmsMm`). 기대: 34·35쪽 `azimuthalEquidistant`(지면 「정거 방위」), 38쪽 태양광은 원통 도법(밀러·등장방형 중 — 중심 경도 약 150°E). 합격: **평균 잔차 ≤ 0.5mm**, 넘으면 기준점 보강 → `projectionFrom` → 그래도 넘으면 `approx: true`.
- [x] **Step 5:** `node scripts/atlas/georef-cli.mjs --unit u4 --verify all` → `units/u4/geo/<id>.verify.png` 눈으로(해안선이 교과서 해안·국경 위). 「실행 중 결정」에 유럽 U3-2 꼴 표(도법·기준점 수·rms·겹 나누기 km·해안 어긋남).
- [x] **Step 6:** 테스트 — `test_controls.py`에 `p34-africa` 기준점 ≥ 12·모두 경위도 범위 안, `georef.test.mjs`에 u4 fit 파일이 있으면 rmsMm ≤ 0.5(approx 제외)·`p38-solar` 중심 경도 120~180.
- [x] **Step 7:** `unitBoxes` = 34쪽 틀 41×41 격자를 fit 으로 되돌린 범위의 정수 넓힘. 커밋. **u2·u3 회귀**: 공유 스크립트를 고쳤으면 `regress_unit --unit u2|u3 --check`.

### Task U4-3: 엔진·파이프라인 아프리카 기능 (설계 §6 — 아프리카에서 처음 쓰는 것)

**Files:** Modify `scripts/atlas/country_class.py`·`zones.py`·`features.py`·`legend.py`(필요한 곳), `scripts/atlas/build_layers.mjs`, `src/atlas/countryClass.js`·`layers.js`·`layerStyle.js`·`ui.js`(범례 견본)·`chartCore.js`·`charts.js`·`quiz.js`(작은 나라)·`topic.js`(고리 기호 → 카드); Test `tests/atlas/layerStyle.test.mjs`·`layers.test.mjs`·`chartCore.test.mjs`·`ui.test.mjs`·`scripts/atlas/tests/test_country_class.py`·`test_zones.py`

각 하위 기능 = 실패하는 테스트 → 구현 → 통과 → **u2·u3 회귀(`regress_unit --check` 둘 다, 캡처 다시 찍음)** → 커밋. 새 동작은 모두 **자료·설정 키가 있을 때만** 켜진다.

- [x] **3a 다중 채움 줄무늬 `multiFill: 'stripes'`** (설계 §6.2-10, 38쪽 언어): 
  - 파이프라인: `country_class.py`에 레이어 설정 `multi: {samples: 7, minShare: 0.25}`가 있으면 표본을 7×7(나라 ∩ 틀 안)로 늘리고, 채움(윤곽 아닌) 분류가 둘 이상 각각 `minShare` 넘게 나오면 `classes[iso] = [가장 많은 것, 다음 …]`(최대 3). 줄무늬는 PDF 에서 나라 안을 자른 가는 띠 도형들이라 표본 9개 다수결은 우연에 맡겨짐 — 그래서 표본을 늘림. 출력에 `multiFill: 'stripes'`. 키가 없으면 지금 다수결 그대로(유럽 EU 의 윤곽 분류 배열과 섞이지 않게: 윤곽 분류는 줄무늬 색에 넣지 않음).
  - 앱: `countryClass` 레이어가 `multiFill: 'stripes'`이고 그 나라 채움 분류가 둘 이상이면 사선 줄무늬 패턴(색 차례 = 분류 차례, 45°, 줄 폭 화면 4px — `hatchPattern` 타일 캐시 꼴). 범례 고름: 나라 분류 중 하나라도 골랐으면 남김(설계 §6.2-10), 흐림이면 줄무늬 전체 흐림. 말풍선 「나라 · 분류1 · 분류2」.
  - 테스트(Python): 합성 쪽 — 두 색 가는 띠를 번갈아 깐 나라 → `[A, B]`, 한 색 나라 → `A`, `multi` 없으면 지금 결과와 같음. 테스트(Node):
```js
test('countryClass 줄무늬: 채움 분류 둘이면 두 색 줄무늬, 하나만 골라도 남음', () => {
  const L = { type: 'countryClass', multiFill: 'stripes',
    legend: [{ cls: 'c2', label: '아랍어', color: '#3a9a48' }, { cls: 'c8', label: '기타', color: '#a7a9ac' }],
    classes: { MAR: ['c2', 'c8'], EGY: 'c2' } };
  assert.deepEqual(countryFill(L, 'MAR'), { pattern: 'stripes', colors: ['#3a9a48', '#a7a9ac'] });
  assert.deepEqual(countryFill(L, 'EGY'), { color: '#3a9a48' });
  assert.equal(countryVisible(L, 'MAR', new Set(['c8'])), true);
  assert.equal(countryVisible(L, 'EGY', new Set(['c8'])), false);
});
test('multiFill 없으면 배열은 유럽 꼴(채움 + 윤곽) 그대로 — 줄무늬 아님', () => {
  const EU = { type: 'countryClass', legend: [{ cls: 'a', label: '가입 국가', color: '#8dc63f' }, { cls: 'e', label: '유로 사용 국가', color: '#ffde17', style: 'outline' }], classes: { DEU: ['a', 'e'] } };
  assert.deepEqual(countryFill(EU, 'DEU'), { color: '#8dc63f' });
});
```
  (함수 이름은 구현 때 `src/atlas/countryClass.js`의 지금 꼴에 맞춘다.)
- [x] **3b 점무늬 면 `pattern: 'dots'` + 빗금 겹침** (39쪽 사하라 사막·사헬 지역):
  - 파이프라인: `zones.dots_zone(m, dcfg)` — 점(작은 원 채움, 색 `dcfg.color`)들의 중심을 `dcfg.spacingPt`×0.75 로 넓혀 합치고 닫기·구멍 메우기 → 면(교과서에 경계선이 없어 점 무리의 겉모양이 경계). 레이어 설정 `dots: {color, swatch, spacingPt}` → 범례 항목 `pattern: 'dots'`. 사헬 빗금은 1단계 `hatch`(윤곽 선 색 → 면) 그대로 — 사헬 경계 파란 굵은 선 2줄이 윤곽(위·아래 선 + 틀 가장자리로 닫음). 빗금·점무늬는 위험 단계·건조 지역 면 **위에** 겹친다(그리는 차례: 채움 → 점무늬 → 빗금, 1단계 빗금은 이미 채움 뒤).
  - 앱: `layers.js` 면 그리기에 `pattern === 'dots'`(점 타일 패턴, 화면 지름 1.6px·간격 6px, 교과서 색). 범례 견본 = 점 무늬 상자. 키가 없으면 그리는 길 그대로.
  - 테스트: Python — 합성 쪽 점 격자(간격 4pt, 원 반지름 0.6pt)가 덮은 사각형 → 면 넓이가 사각형의 90~110%, 점 하나 떨어진 것은 면에 안 듦. Node — `dots` 면은 채움 면 다음·빗금 앞에 그림(그리기 기록 순서), 범례 견본 종류 `dots`.
- [x] **3c 지도 위 고리 기호 `chartSymbols` + 고리 그래프 `ring`** (설계 §6.2-11, 38쪽 자원 7):
  - 레이어 자료: `{type: 'chartSymbols', items: [{id, chart, lonlat, title, center: ['39,100', '(만 톤)', '2020년']}]}` — `lonlat`은 교과서 고리 가운데를 그 지도 fit 으로 되돌린 자리(`pt2lonlat.mjs` — 고리는 지도 둘레 바다 위에 놓였으므로 웹에서도 같은 자리). build_layers 가 설정 `chartSymbols.items[{chart, centerPt}]`로 만든다.
  - 앱: 새 레이어(`layers.js` 안 또는 `chartSymbols.js`) — 캔버스에 고리(바깥 반지름 = 기호 레이어 `symbolPx` 규칙, 안쪽 = 0.6배, 조각 색·차례 = 그래프 자료), 가운데 글자 3줄, `labelObstacles`로 고리 상자를 지명 피하기에 넣음, `hit` → `topic.js`가 카드 `card.show({title, chart})`(climate 마커 카드와 같은 길). 범례 없음.
  - 사이드바 그래프: `chartPlan`에 `pie` + `spec.ring`(0~1)이 있으면 시험지 양식 SVG 고리(`ringSvg` — 검은 선 #231f20, 조각 값 글자, 가운데 총량). **`ring` 키는 u4 자료에만** — 유럽 코펜하겐 자료의 `donut: 0.595`는 그대로 csat 원그래프 길(u3 화소 그대로, 교사 Q6).
  - 테스트(Node): 고리 기호 hit(가운데·고리 안 → 그 항목, 고리 밖 → null), 확대 단계별 지름 비 그대로, labelObstacles 상자 수 = 항목 수; `chartPlan({type:'pie', ring:0.6})`은 `{via:'svg'}`, `chartPlan({type:'pie', donut:0.595})`은 지금과 같은 `{via:'csat', renderer:'stacked'}`; ringSvg 조각 각 합 360°.
- [x] **3d 원 크기 줄 그래프 `bubbleRow`** (39쪽 복원 녹지 면적 11):
  - `chartPlan` `bubbleRow` → 시험지 양식 SVG: 원 넓이 ∝ 값(지름 = maxD·√(v/max)), 원 아래 가운데 맞춤, 나라 이름·값 글자 2줄, 교과서 색(보라), 단위 글자.
  - 테스트(`chartCore.test.mjs`): 지름 비 = √(값 비)(에티오피아 2,006 ↔ 니제르 809 → 1.575±0.01), 아주 작은 값(지부티 0.13)도 최소 지름 2px 로 보임, 범주 차례 = 자료 차례.
- [x] **3e 작은 나라 고리 — 넓이 기준 `smallMetric: 'area'`** (35쪽):
  - 문제: 유럽 U3-9 후속은 나라 전체 geoBounds 투영 크기로 「작은 나라」를 정한다. 감비아(경도 약 4.5° × 위도 0.4° — 화면에서 길이 45px·폭 4px)와 흩어진 섬나라(세이셸 46~56°E, 카보베르데, 코모로, 모리셔스 — 섬마다 1~3px)는 상자가 커서 고리가 안 생기지만 손으로 칠할 수 없다.
  - 구현: 단원 선택값 `coloring.smallMetric`이 `'area'`면 「가장 큰 조각의 투영 넓이의 제곱근」(상세도·나라마다 한 번 경위도 넓이·중심 계산해 두고, 축척 k² 로 화면 넓이 어림)으로 `smallPx`와 견준다. 고리 자리 = 가장 큰 조각 중심. 없으면 지금 상자 기준 그대로(u3 화소 그대로).
  - 테스트(Node, 실제 d3 투영): 가늘고 긴 나라(4.5°×0.4°)가 `'area'`면 작음·상자 기준이면 작지 않음, 흩어진 섬나라(10° 넓이에 0.1° 섬 셋)도 같음, 확대해 넓이가 커지면 고리 없어짐, `smallMetric` 없으면 유럽 테스트(EDGE·FAR) 결과 그대로.
- [x] **3f (교사 Q2 답이 「점선」이면) 미확정 국경 레이어 `ne-disputed`**: 파이프라인이 Natural Earth `ne_10m_admin_0_boundary_lines_land`에서 분쟁 구간(FEATURECLA 분쟁 계열 — 실제 값을 원본에서 확인해 설정 `disputed.featurecla`에 적음)을 단원 상자로 잘라 선 레이어(`type:'line'`, 점선 `dashed: true`, 교과서 붉은색, 범례 「미확정 국경」) — 1단계 선 레이어 그대로라 엔진 작업 없음. 일반도·색칠하기 주제의 `layers`에만.
- [x] 끝나면 **리뷰 관문**(엔진 바뀐 것 코드 리뷰) + u2·u3 회귀(조각 다시 → 캡처 41·31장 → compare → `regress_unit --check` 둘 다): data 해시 같음, 캡처 화소 차 0, 조각 크기 +1% 안(새 엔진 코드).

### Task U4-4: 주제 레이어

**Files:** Modify `scripts/atlas/config/u4.json`(`layers`); Output `sims/atlas-u4-africa/data/layer-*.json`; Test `tests/atlas/units/u4.layers.test.mjs`

- [x] **Step 1:** `python -I scripts/atlas/extract_vectors.py --unit u4 --features all`, 래스터는 `--unit u4` 래스터 분류. 레이어 설정과 기대 범례 수(`expectLegend`):

  | 레이어 id | 지도 | 종류 | 기대 범례 | 메모 |
  |---|---|---|---|---|
  | `p37-climate` | p37-climate | 래스터 면 + 빗금 | 10(열대 3·건조 2·온대 4·고산 1) | `legendGroups` 열대·건조·온대 + 고산 따로(1단계 A4), 고산 빗금 = u2 `hatch` 꼴. 흰 국경선·사진 핀 그림 → `rasterIgnoreImages`, 해안 섞인 색 → `rasterCoastPx 1`, 작은 섬(카보베르데·코모로·모리셔스·상투메) → `rescue_islands`·`deblend`. 지도에 화소 0 인 분류(온대 겨울 건조 등)는 「범례만」(`geometry:false`)으로 남김 |
  | `p37-jan` · `p37-jul` | p37-jan · p37-jul | 래스터 면 + 등온선 | 강수 7 + 등온선 | 등온선 글자(1월 약 11·7월 약 9 — 실측)에서 값 붙은 선. 바다 흰 덮개·왼쪽 틀 밖 그림 → `rasterForeignImages`·`rasterEdgePt` 필요하면 |
  | `p38-language` | p38-language | `countryClass` + `multi`(3a) | 8 | 나라 약 50, 줄무늬 나라 약 12(모로코·서사하라·모리타니·수단·차드·카메룬·소말리아·탄자니아·짐바브웨·남아공·마다가스카르 등 — 실측). 남아공이 세 색이면 배열 3 |
  | `p38-religion` | p38-religion | 벡터 면 | 4 | 지역 면(교과서 채움 되돌림). 「비거주지」 옅은 회색은 웹 육지 #f2efe9 와 색 차를 재서 묻히면 `legendColors` + `printColor`(1단계 토속 종교 결정) |
  | `p38-resources` | p38-resources | `countryClass` | 10(생산국마다 한 분류 — 교과서 범례 없음) | 분류 이름 = 지도 위 나라 이름 글자(기니·가나·니제르·콩고 민주 공화국·앙골라·짐바브웨·나미비아·보츠와나·레소토·남아프리카 공화국), 화면 범례 제목 「주요 생산국」(교과서에 없는 제목 — 대조표 알려진 차이). 나라 이름 글자는 점 지명(Point label) |
  | `p38-resource-charts` | p38-resources | `chartSymbols`(3c) | — | 고리 7, `chart` = U4-7 의 `p38-bauxite` … `p38-manganese` |
  | `p38-solar` | p38-solar | 래스터 면(세계) | 6 | 1단계 21쪽 래스터 분류를 세계 범위로(설계 §6.2-16). 용량 상한 안에서 `tol`·`minArea` 조정. **동해·독도·이어도 종합 해양 과학 기지** 글자는 점 지명으로 반드시 넣음. 묶음 중심 경도 150(U4-9 `centerLonOf`) |
  | `p39-afcfta` | p39-afcfta | `countryClass` | 3 | 서사하라·에리트레아·소말릴란드(합친 뒤 소말리아) 분류를 1,600dpi 확대로 하나씩 확인 |
  | `p39-desert` | p39-desert | 벡터 면 + 점무늬 + 빗금(3b) | 8(위험 5·건조 지역·사하라 사막·사헬 지역) | 흰 점선 국경은 무시 색. 사헬 경계 파란 굵은 선은 빗금 윤곽(따로 선 레이어 아님) |
  | `ne-disputed` | — | 선(3f, Q2 답 뒤) | 1 | |

- [x] **Step 2: countryClass 확인 (유럽 U3-4 방식)** — 레이어마다 `country_class.py` 보고서 `levels`(only10a·only50·neither — 비르 타윌 `BRT`는 only10a 로 나와야 정상), 작은 나라 경고(감비아·카보베르데·상투메·코모로·세이셸·모리셔스·지부티·에스와티니·레소토·르완다·부룬디·적도 기니 비오코섬)를 600~1600dpi 확대로 하나씩 보고 `countryOverrides`(같은 값이어도 까닭). Q4·Q5 기본값: `BRT`·`FRA`·`ESP`·`PRT`·`GBR`·`YEM`·`SHN` = `{cls: null, why}`(교과서가 칠한 속령이 있으면 알려진 차이로 대조표에). 소말릴란드는 U4-9 바탕 지도 합치기 전이면 `SOL` = 소말리아와 같은 값.
- [x] **Step 3:** `node scripts/atlas/build_layers.mjs --unit u4` → `layer-*.json`. 용량 예산: 레이어 합계 ≤ 650KB(태양광 세계 래스터가 가장 큼 — 넘으면 `tol` 키움), countryClass 는 수 KB.
- [x] **Step 4: 실패하는 테스트 → 통과** (`tests/atlas/units/u4.layers.test.mjs`)
```js
import test from 'node:test'; import assert from 'node:assert/strict'; import { readFileSync } from 'node:fs';
const D = 'sims/atlas-u4-africa/data';
const read = (id) => JSON.parse(readFileSync(`${D}/layer-${id}.json`, 'utf8'));
const cls = (L, iso) => [].concat(L.classes[iso] ?? []).map((c) => L.legend.find((x) => x.cls === c)?.label);
test('p37 기후 구분: 범례 10, 면 경위도가 아프리카', () => {
  const gj = read('p37-climate');
  assert.equal(gj.legend.length, 10);
  for (const f of gj.features) { const [lon, lat] = f.properties.centroid; assert.ok(lon > -26 && lon < 60 && lat > -36 && lat < 38, f.properties.cls); }
});
test('p38 언어: 줄무늬 나라 있음, 이집트 = 아랍어 하나, 모로코 = 아랍어 + 다른 것', () => {
  const L = read('p38-language'); assert.equal(L.multiFill, 'stripes');
  assert.deepEqual(cls(L, 'EGY'), ['아랍어']);
  assert.ok(cls(L, 'MAR').includes('아랍어') && cls(L, 'MAR').length >= 2);
  assert.ok(Object.values(L.classes).filter(Array.isArray).length >= 8);
});
test('p38 자원: 생산국 10, 고리 7 은 아프리카 둘레', () => {
  const L = read('p38-resources'); assert.equal(Object.keys(L.classes).length, 10);
  assert.deepEqual(cls(L, 'COD'), ['콩고 민주 공화국']);
  const C = read('p38-resource-charts'); assert.equal(C.items.length, 7);
  for (const it of C.items) { const [lon, lat] = it.lonlat; assert.ok(lon > -40 && lon < 75 && lat > -50 && lat < 45, it.id); }
});
test('p38 태양광: 범례 6, 동해·독도 글자', () => {
  const gj = read('p38-solar'); assert.equal(gj.legend.length, 6);
  const names = gj.features.filter((f) => f.geometry.type === 'Point').map((f) => f.properties.label);
  for (const n of ['동해', '독도']) assert.ok(names.includes(n), n);
});
test('p39 사막화: 점무늬·빗금 분류가 하나씩, 범례 8', () => {
  const gj = read('p39-desert'); assert.equal(gj.legend.length, 8);
  assert.equal(gj.legend.filter((x) => x.pattern === 'dots').length, 1);
  assert.equal(gj.legend.filter((x) => x.pattern === 'hatch').length, 1);
});
test('p39 AfCFTA: 3분류, 소말릴란드는 따로 분류되지 않음', () => {
  const L = read('p39-afcfta'); assert.equal(L.legend.length, 3); assert.equal(L.classes.SOL ?? null, null);
});
```
  (분류 이름은 범례 글자 그대로 — 정규식·이름은 지면 글자를 보고 맞춘다. SOL 시험은 Q3 답이 「합치지 않음」이면 「소말리아와 같은 값」으로 바꾼다.)
- [x] **Step 5:** 지도마다 「교과서 범례 수 ↔ 뽑은 분류 수」 표를 「실행 중 결정」에(유럽 U3-4 표 꼴), 화면용 색 보정 결정도. 커밋. 공유 파이프라인을 고쳤으면 u2·u3 회귀(`build_layers` u2·u3 다시 → 바이트 같음 확인 후 되돌림 없이 버림, `regress_unit --check` 둘 다).

### Task U4-5: 지명

**Files:** Modify `scripts/atlas/config/u4.json`(`places`); Output `sims/atlas-u4-africa/data/places.json`; Test `tests/atlas/units/u4.places.test.mjs`

- [x] **Step 1:** 34쪽 렌더와 글꼴 조사를 보며 `places.styles`(u3 표 복사 → 수정): 나라 = InterGTOTFB 자홍 #ed1064(6.8·7.8·9.7·12.7pt) + **영문 Helvetica 자홍**(5·6pt) `en`, 수도·도시 영문 = Helvetica 5pt 검정 `cityEn`, 산 = 고딕 5.8pt + 높이(DINPro 6pt — 기울여 한 글자씩이면 `glue`), 바다·호수 = 파란 명조(#0072bc, 대양 9.8pt 자간 벌림 `joinEm`), 지형 상자 글자 = 굵은 명조(NanumMyeongjoOTFBold 5.4~9.9pt — 「사 하 라 사 막」 낱자 상자), 섬·곶 = 명조 5.9pt, 서사하라 = 갈보라 #7e576b → `region`, 대양 영문 Times. **무시**: 국립 공원·유적 붉은 글자 #d71920 4.9pt(Q8 — 찾아보기에 없음 확인), 소속 표시 (프)(영)(포)(에)(이)(앙골라), 찾아보기 격자 글자 A~I·1~7, 경위선 글자, 범례 글자.
- [x] **Step 2:** `python -I scripts/atlas/places.py --unit u4` → `node scripts/atlas/build_places.mjs --unit u4 --verify`. 악센트 낱자가 다른 글꼴로 끼면 `glue`(`require` = 바꿀 낱자가 낀 묶음만), 찾아보기에 없어 나뉘거나 붙은 상자 글자는 `extraNames`.
- [x] **Step 3: 찾아보기 대조** — 105~111쪽 중 34쪽 참조 줄이 모두 places 에 있음(누락 0 목표, 뺀 것은 `indexExclude`에 까닭). **격자 칸 대조(새 검사, 시험에만)**: 찾아보기 `grid`(예: `D6`)와 34쪽 격자 글자 자리(A~I 열·1~7 행 경계)로 places 의 지면 자리가 그 칸 안인지 — 다르면 목록을 「실행 중 결정」에.
- [x] **Step 4: Natural Earth 대조**(`neBox` 아프리카, `snapKm 30`) — 옮긴 기호와 거리, 동명 다른 도시는 `neAlias`(트리폴리 = 리비아 쪽인지 확인). 결과(중앙값·90%·최대 km)를 「실행 중 결정」에.
- [x] **Step 5: 테스트**
```js
const places = JSON.parse(readFileSync('sims/atlas-u4-africa/data/places.json', 'utf8'));
const near = (p, lon, lat, tol) => Math.abs(p.lon - lon) < tol && Math.abs(p.lat - lat) < tol;
test('대표 지명 위치가 실제와 1° 안', () => {
  const want = { 카이로: [31.24, 30.04], 나이로비: [36.82, -1.29], 킨샤사: [15.31, -4.32], 라고스: [3.39, 6.45], 케이프타운: [18.42, -33.92], 아디스아바바: [38.75, 9.03], 트리폴리: [13.19, 32.89] };
  for (const [name, [lon, lat]] of Object.entries(want)) { const p = places.find((x) => x.name === name); assert.ok(p, name); assert.ok(near(p, lon, lat, 1), `${name} ${p.lon},${p.lat}`); }
});
test('나라·수도 영문 병기(en)', () => { for (const n of ['이집트', '케냐', '카이로']) assert.ok(places.find((p) => p.name === n)?.en, n); });
test('국립 공원·유적 글자는 지명이 아님', () => { assert.ok(!places.some((p) => /국립 공원|유적/.test(p.name))); });
test('서사하라 = region', () => assert.equal(places.find((p) => p.name === '서사하라')?.kind, 'region'));
test('rank 1~6, kind 목록 안', () => { for (const p of places) { assert.ok(p.rank >= 1 && p.rank <= 6); assert.match(p.kind, /^(country|capital|city|mountain|river|sea|region|island|desert|plain|other)$/); } });
```
- [x] **Step 6:** 용량 ≤ 150KB. 커밋. places.py·build_places 를 고쳤으면 u2·u3 places.json 다시 만들어 바이트 같음 확인(파일은 되돌림) + `regress_unit --check` 둘 다.

### Task U4-6: 사진·원본 쪽·핀

**Files:** Modify `scripts/atlas/config/u4.json`(`photos`); Output `content/atlas/u4/photos.json`, `docs/assets/atlas/u4/photo/*`, `docs/assets/atlas/u4/page/p034~p039.jpg`

- [x] **Step 1:** `python -I scripts/atlas/extract_images.py --unit u4 --candidates`(34쪽 작은 그림 12,000여 개는 후보 크기 하한으로 거름) → 쪽 렌더를 보며 `photos.items`(bbox·topic·mask)·`exclude`:
  - 36쪽 7(나일강·킬리만자로산·사하라 사막·나미브 사막·테이블 마운틴·빅토리아 폭포·칭기), 37쪽 4(흙벽돌집·콩고 분지 열대 우림·야생 동물 대이동·오렌지 농장 — 기후 그래프는 사진 카드 아래 따로).
  - 38쪽: 문화 6(가면·피카소 그림 — 설명 하나, 에이시, 타진, 카사바·푸푸 — 설명 하나; 겹친 그림은 `mask`), 주제도 활동 도시 4(요하네스버그·나이로비·카사블랑카·라고스), 「아프리카의 면적 비교」 삽화 1(**벡터 삽화를 렌더해 자름** — `render: true` 항목, 나라 이름 글자 포함).
  - 39쪽: AU 본부 1(로고가 사진 안이면 한 장), 의제 2063 그림 1(벡터 렌더), 사막화 사진 2(니제르·에티오피아), 사람들 3, 적정 기술 4, 공정 무역 2(사진 위 로고 그림까지 한 장). QR 은 사진이 아님(제외 — 참고 사이트는 글).
- [x] **Step 2:** 핀(`photos.pins`): 36쪽 물방울 7(#7251a1 아래 끝)·37쪽 4 → `pt2lonlat.mjs`. 번호 없는 핀은 `pinNearMaxKm`로 사진 설명 지명과 짝 — 지명이 places 에 없는 것(칭기 = 베마라하, 테이블 마운틴, 야생 동물 대이동 = 세렝게티)은 핀 자리 그대로 + 짝 거리 기록.
- [x] **Step 3:** `--photos --pages` → JPEG q82·WebP q80, 원본 쪽 110dpi 각 200KB(약 195KiB) 이하. 사진 합계 ≤ 4MB.
- [x] **Step 4: 개수 대조** — 설정 `photos.expect`: 지형 7·기후 4·문화 6·잠재력 5·협력 2·지속가능 11(사막화 2 + 사람 3 + 기술 4 + 공정 무역 2) = 35(어림 — 실측으로 고쳐 기록). 대조표 `units/u4/shots/c3/photos-<쪽>.jpg` 눈으로. 기운 사진·두 그림 한 설명·제목만/본문만 있는 사진은 유럽 U3-6 규칙(`_bbox` 까닭, 같은 설명 두 카드, `titleOverride`·`captionOverride`).
- [x] **Step 5:** 시험 `tests/atlas/units/u4.photos.test.mjs`(주제별 수, 핀 36쪽 7·37쪽 4, 핀이 아프리카 안, 대표 핀 위치(킬리만자로산 1° 안·케이프타운 1° 안), 파일 크기). 커밋(`content/atlas/u4/photos.json docs/assets/atlas/u4 scripts/atlas/config/u4.json tests/atlas/units/u4.photos.test.mjs`).

### Task U4-7: 그래프 숫자

**Files:** Modify `scripts/atlas/config/u4.json`(`charts`), `scripts/atlas/charts_read.py`(새 읽개 — 설정 키가 있을 때만); Output `$ATLAS_WORK/units/u4/tables/charts-u4.json`; Test `scripts/atlas/tests/test_tables.py`에 `ChartsU4`

그래프 15개(id · 형식 · 출처 · 값):

| id | 형식 | 값 출처 | 메모 |
|---|---|---|---|
| `p37-cairo` | climograph | **97쪽 표**(`카이로`) printed | 지면 출처 『이과연표』, climate 「사막」 |
| `p37-capetown` | climograph | **97쪽 표**(`케이프타운`) printed | 「지중해성」 |
| `p37-kisangani` | climograph | 도형 측정 measured(+precision) | 97쪽 표에 없음(킨샤사로 바꾸지 않음), 출처 climate-data.org |
| `p37-dodoma` | climograph | 도형 측정 measured | 표에 없음(다르에스살람으로 바꾸지 않음), 출처 『이과연표』 |
| `p38-bauxite` … `p38-manganese`(7) | pie + `ring` | 인쇄 % printed | 보크사이트 22.0/78.0(39,100 만 톤·2020) · 우라늄 13.2/6.5/80.3(40,795 톤·2021) · 다이아몬드 17.2/9.8/6.6/5.2/1.5/0.8/58.9(13,800 만 캐럿·2019) · 크롬 35.8/64.2(3,700 만 톤·2020) · 코발트 69.4/30.6(144 천 톤·2019) · 백금 54.0/46.0(826 톤·2020) · 망간 34.4/3.4/62.2(1,890 만 톤·2019). 조각 이름 = 조각 색 ↔ `p38-resources` 범례 나라 색(Lab ΔE) — 설정 `namesFrom: {layer: 'p38-resources'}`, 회색 조각 = 「기타」 |
| `p38-pyramid-world` · `p38-pyramid-africa` | pyramid | **래스터 측정**(막대가 인라인 그림) | 18구간(0~4 … 85 이상), 축 눈금 글자는 벡터(8·6·4·2·0·2·4·6·8 %) |
| `p39-greenwall` | bubbleRow | 인쇄 값 printed | 에티오피아 2,006·니제르 809·에리트레아 501·세네갈 119·수단 88·부르키나파소 53·차드 16·말리 6·모리타니 3.4·나이지리아 3·지부티 0.13(십 km², UNCCD 2019) |
| `p39-afcfta` | table | 인쇄 글자 | 2021년: 국가 47개국·인구 13억 명·구매력 3.4조 달러 / 2030년 목표: 아프리카 내 무역 2배 성장·인구 17억 명·구매력 6.7조 달러 |

- [x] **Step 1:** 기후 4 — `climateTable` 그대로(u3 꼴: 제목 둘째 줄 「(사막 기후)」 → climate, 97쪽 표 zone 과 다르면 경고, 표에 없는 도시는 `notInTable`). 97쪽 표 u4 사본은 u2 표와 바이트 같아야 함.
- [x] **Step 2:** 고리 7 — 유럽 `donut` 읽개(색마다 가장 큰 채움 = 조각, 가운데 = 안쪽 호 중심 중앙값)로 각·인쇄 % 짝(헝가리안), 출력에 `ring`(안쪽/바깥 반지름 비)·`center`(총량·단위·해 글자). 인쇄 「13.800」·「40.795」(쉼표 자리에 마침표)는 **원문 그대로 두고** `content/atlas/u4/issues.md`에 적는다.
- [x] **Step 3:** 피라미드 2 — 새 읽개 `pyramidRaster`(설정 `reader: 'pyramidRaster'`일 때만): 그래프 상자를 400dpi 로 렌더 → 막대 색 가면(남·여 색은 범례 「남」「여」 글자 색 근처 화소에서 견본) → 나이 줄마다(나이 글자 세로 가운데 ± 줄 높이/2) 가운데 축에서 왼쪽·오른쪽 끝 화소 → 축 눈금 글자(벡터)로 % 환산. `measured` + `precision`(화소 1개 = 몇 %). 유럽 U3-4 30쪽 원 기호(인라인 그림 → 렌더 화소)와 같은 길.
- [x] **Step 4:** 원 크기 — `bubbleRow` 읽개: 보라 원 채움(벡터)마다 지름, 아래 이름·값 글자 짝. 값은 인쇄 글자(printed), 지름 비가 √값 비와 맞는지 경고만(교과서 그림 확인).
- [x] **Step 5: 테스트** (`test_tables.py` `ChartsU4` — u3 꼴로 u4 설정을 모의)
```python
class ChartsU4(unittest.TestCase):
    def test_count_and_warnings(self):
        out, warns = run_charts('u4'); self.assertEqual(len(out), 15); self.assertEqual(warns, [])
    def test_climate(self):
        out, _ = run_charts('u4')
        for cid in ('p37-cairo', 'p37-capetown', 'p37-kisangani', 'p37-dodoma'):
            c = out[cid]; self.assertEqual(len(c['temp']), 12); self.assertEqual(len(c['precip']), 12)
        self.assertEqual(out['p37-cairo']['source'], 'printed'); self.assertEqual(out['p37-kisangani']['source'], 'measured')
        self.assertIn('precision', out['p37-dodoma'])
    def test_rings_sum_100(self):
        out, _ = run_charts('u4')
        for cid in ('p38-bauxite', 'p38-uranium', 'p38-diamond', 'p38-chromium', 'p38-cobalt', 'p38-platinum', 'p38-manganese'):
            self.assertAlmostEqual(sum(s['value'] for s in out[cid]['slices']), 100, delta=0.5); self.assertIn('ring', out[cid])
        self.assertEqual([s['value'] for s in out['p38-diamond']['slices']][:3], [17.2, 9.8, 6.6])
    def test_pyramids(self):
        out, _ = run_charts('u4')
        for cid in ('p38-pyramid-world', 'p38-pyramid-africa'):
            p = out[cid]; self.assertEqual(len(p['ages']), 18)
            self.assertAlmostEqual(sum(p['male']) + sum(p['female']), 100, delta=2.0); self.assertIn('precision', p)
        # 아프리카가 세계보다 0~4세 비중이 큼(그림에서 보이는 것 — 값을 넣지 않고 크기만)
        self.assertGreater(out['p38-pyramid-africa']['male'][0], out['p38-pyramid-world']['male'][0])
    def test_greenwall(self):
        out, _ = run_charts('u4'); g = out['p39-greenwall']
        self.assertEqual(len(g['categories']), 11); self.assertEqual(g['values'][0], 2006); self.assertEqual(g['values'][-1], 0.13)
```
  (`run_charts`·출력 키 이름은 지금 `test_tables.py` 도우미와 chartCore 가 받는 꼴에 맞춘다 — 피라미드는 u2 `pyramid` 출력 꼴 그대로.)
- [x] **Step 6:** 경고 0으로 `charts-u4.json` + 도장. 대조표 `units/u4/shots/c4/charts-37~39.png` 눈으로. `charts_read.py`를 고쳤으므로 u2·u3 `extract_tables` 다시 → `charts-u2.json`·`charts-u3.json` 바이트 같음(도장 파일만 정당하게 새 값) + `regress_unit --check` 둘 다. 커밋.

### Task U4-8: 주제 내용

**Files:** Create `content/atlas/u4/topics.json`, `content/atlas/u4/overrides.json`, `content/atlas/u4/issues.md`, `scripts/atlas/tests/test_text_u4.py`, `tests/atlas/units/u4.content.test.mjs`; Output `content/atlas/u4/coloring.json`, `sims/atlas-u4-africa/data/{topics,charts}.json`, `layers.js`

- [x] **Step 1:** `topics.json` — 주제 8개(위 「주제」 표), 글은 출처 상자(`src`·`titleSrc`·`creditSrc`·`legendTitleSrc`·`labelSrc`)만 적고 `extract_text.py --unit u4 --fill`로 채움. 손으로 두는 것은 1단계처럼 목차 제목과 「학습 목표」뿐.
  - 주제도 활동(38·39쪽): `{id:'theme-1', type:'activity', role:'theme', titleSrc(활동 제목), src(문항 ①)}` · `{id:'theme-2', type:'activity', role:'theme', src(문항 ②)}` · 사진 블록 · `{type:'page', page, bbox(활동 상자)}` + 쪽 전체 `{type:'page', page}`. 39쪽 「참고 사이트」는 글 블록(주소 글자 그대로, 링크 아님 — EMBED_RULES).
  - 문화 주제는 사진 블록 6 + 본문, 지도 묶음은 언어·종교(바로가기 `labelSrc` = 지도 제목).
  - 잠재력 주제: 그래프 블록 피라미드 2(`barPicker` 아님 — 한 장씩), 자원 묶음을 고르면 고리 기호 레이어도 같이(같은 label 로 묶음 — 유럽 30쪽 도시화율 + 도시 원 결정).
  - 협력 주제: 의제 2063 카드(사진 + 지면 설명), AfCFTA 표 카드(`card` + `chart: 'p39-afcfta'`).
- [x] **Step 2: 색칠하기** — `python -I scripts/atlas/extract_text.py --unit u4 --labels`(35쪽 나라 글자·초성·손글씨 수도) → `node scripts/atlas/coloring_quiz.mjs --unit u4 --write`. 설정(유럽 키 그대로): `joinLabels [["ㅋㄱ  ㅁㅈ","ㄱㅎㄱ"],["ㄴㅇㅍㄹㅋ","ㄱㅎㄱ"]]`(두 줄 한 나라 — 「ㄱㅎㄱ」 짝은 자리로), 손글씨 조각 「로」 → `ignoreLabels` 또는 잇기(어느 수도의 조각인지 확인), `isoByLabel`(초성이 Natural Earth NAME_KO 초성과 다른 것 — 「ㅋㄱ」 = 콩고 공화국 `COG`, 「ㅈㅇㅇㅍㄹㅋㄱㅎㄱ」 = 중앙아프리카 공화국, 「서사하라」 = `SAH`), `capitalByNe`(손글씨 수도 자리가 이웃 나라 면에 떨어진 것), `noCapital {SAH}`(Q1). 같은 초성 「ㄱㄴ」(기니 12.8pt·가나 8.8pt)는 글자 자리 나라 면으로 갈림 — 시험으로 고정. 나라 수 = 54(+ 서사하라 지역 1 — Q1).
- [x] **Step 3:** `python -I scripts/atlas/extract_text.py --unit u4 --fill --check` → `node scripts/atlas/build_content.mjs --unit u4`.
- [x] **Step 4: 테스트** (`tests/atlas/units/u4.content.test.mjs` + G5 계약 테스트)
```js
const T = JSON.parse(readFileSync('sims/atlas-u4-africa/data/topics.json', 'utf8'));
const by = Object.fromEntries(T.map((t) => [t.id, t]));
test('주제 8개, 34~39쪽 모두 덮음', () => {
  assert.deepEqual(T.map((t) => t.id), ['general', 'coloring', 'relief', 'climate', 'culture', 'potential', 'cooperation', 'sustainable']);
  const pages = new Set(T.flatMap((t) => t.pages)); for (let p = 34; p <= 39; p++) assert.ok(pages.has(p), `${p}쪽`);
});
test('개수: 지형 핀 7(번호 숨김), 기후 그래프 마커 4(번호 숨김)', () => {
  assert.equal(by.relief.markers.length, 7); assert.equal(by.relief.pinNumbers, 'hidden');
  assert.equal(by.climate.markers.filter((m) => m.chart).length, 4); assert.equal(by.climate.pinNumbers, 'hidden');
});
test('주제도 활동(교사 Q4): 38·39쪽 문항 카드 2씩 + 원본 쪽 부분 보기, 색칠 도구 없음', () => {
  for (const [id, page] of [['potential', 38], ['sustainable', 39]]) {
    const b = by[id].blocks;
    assert.equal(b.filter((x) => x.type === 'activity' && x.role === 'theme').length, 2, id);
    assert.ok(b.some((x) => x.type === 'page' && x.page === page && x.bbox), id);
    assert.notEqual(by[id].quiz?.type, 'coloring');
  }
});
test('색칠하기: 나라 54(+ 서사하라), 작은 나라가 50m 에 있음', () => {
  const isos = by.coloring.quiz.countries.map((c) => c.iso);
  assert.ok(isos.length === 54 || isos.length === 55);
  for (const iso of ['GMB', 'CPV', 'STP', 'COM', 'SYC', 'MUS', 'SWZ', 'LSO', 'DJI']) assert.ok(isos.includes(iso), iso);
  assert.ok(!isos.includes('SOL'));
});
test('태양광 묶음은 태평양 중심 지도', () => assert.ok(by.potential.views.some((v) => v.map === 'p38-solar')));
```
  (U4-6·U4-7 실측이 다르면 시험을 실측에 맞추고 까닭을 「실행 중 결정」에.) `test_text_u4.py`: 원문 대조 `--unit u4 --check`·출처 지면 대조·35쪽 글자 수·손글 없음(u3 꼴).
- [x] **Step 5:** 검토 덤프 `units/u4/shots/c5/topics.md`를 쪽 렌더와 대조(빠진 글·깨진 글 — `pdfkit.dec` 알려진 오류 `·`→`h`, `℃`, `㎢`, 『』, 「烋」). 고침은 `overrides.json`(from 필수, 까닭). 교과서 원문 문제는 `issues.md`(「13.800」·「40.795」 마침표, 피라미드 값 없음(잰 값) 등). 커밋. `coloring_quiz.mjs`·`extract_text.py`를 고쳤으면 u2·u3 도장만 바뀌는지 `regress_unit --check` 둘 다.

### Task U4-9: 바탕 지도와 조각 조립

**Files:** Create `sims/atlas-u4-africa/index.html`(u3 복사), `sims/atlas-u4-africa/main.js`; Output `sims/atlas-u4-africa/data/basemap.json`; Modify `src/registry.js`, `scripts/atlas/build_basemap.mjs`(Q3 — `mergeIsos`)

- [x] **Step 1: 소말릴란드 합치기(Q3 기본값)** — `build_basemap.mjs`에 설정 `basemap.mergeIsos {SOM: ["SOL"]}`이 있을 때만 각 상세도 나라 층에서 mapshaper `-dissolve2`(iso 를 바꾼 뒤 그 나라만)로 합침. 테스트(`basemap.test.mjs`): u4 basemap 에 `SOL` 없음·`SOM` 하나, 설정이 없으면 명령 목록이 지금과 같음(u2·u3 명령 문자열 비교). **이 스크립트는 u2·u3 도장 입력**이라 u2·u3 basemap.json 의 `meta.inputsHash`가 낡았다고 나오게 된다 — 공개본은 다시 만들지 않고(공통 사항), `regress_unit --check`는 파일을 그대로 재므로 같음. 「실행 중 결정」에 적는다.
- [x] **Step 2:** `node scripts/atlas/build_basemap.mjs --unit u4` → 110m·50m 전 지구 + 10a 아프리카 상자, ≤ 1,024,000 B(`maxBytes`). 10a 에만 있는 나라(비르 타윌 등) 목록을 기록.
- [x] **Step 3:** registry `SIMS`에 `{ id: 'atlas-u4-africa', book: 'atlas', unit: 'Ⅳ. 아프리카', page: 34, title: '사회과부도 아프리카', kind: '지도' }`.
- [x] **Step 4:** `main.js` = 자료 정적 import(basemap·places·topics·charts·layers.js) + 선택값 + `mountAtlas`:
  - `baseColor: { general: 'tint', relief: 'natural' }`
  - `coloring: { smallPx: 8, smallMetric: 'area' }`(U4-3e — 감비아·세이셸 등)
  - `centerLonOf: { 'layer-p38-solar': 150 }`(키 = 레이어 ref — u2 `{ 'layer-p24-trade': 150 }`와 같은 꼴, topic.js 가 그 레이어가 든 묶음을 고를 때만 중심을 옮기고 떠나면 되돌림)
  - 확대 창(`insets`)은 두지 않는 것이 기본(작은 나라는 고리, 섬나라 사진·지명은 50m/10a 로 확인) — 캡처로 보고 결정.
- [x] **Step 5:** `npm run embed -- atlas-u4-africa` → `check:embed` 통과, 크기 ≤ 3MB(목표 1~2MB), 금지 패턴 0. G5 계약 시험의 u4 조각 크기가 이제 돈다.
- [x] **Step 6: 미리보기 캡처** (`$ATLAS_WORK/units/u4/shots/e1/`, 장면 스크립트 `units/u4/e1shots.mjs` — 유럽 e1shots 꼴, vite + swiftshader, 새 user-data-dir, Date.now 고정): 1440×900·1024×768 × 8주제 × 묶음 + 사이드바 스크롤 + **색칠하기 작은 나라**(감비아·카보베르데·상투메·코모로·세이셸·모리셔스·에스와티니·레소토·지부티 — 처음·±3°·±1° 확대 + 누르기 기록 `report.json`, 칠한 수가 바뀌는지) + 핀 카드 11 + **고리 기호 7 누르기 → 카드 그래프** + 언어 범례 한 분류 고름(줄무늬 나라 남음) + 태양광 중심 경도 150 + 조각(embed) 8주제(공개 Pages 주소 가로채기). **페이지 콘솔 오류·경고 0**, 깨진 사진 0.
- [x] **Step 7:** u2·u3 회귀(엔진·build_basemap 을 고쳤으므로 조각 다시 + 캡처 41·31장 + compare + `regress_unit --check` 둘 다). 커밋.

### Task U4-10: 교과서 대조표 ⓣ

**Files:** Create `scripts/atlas/config/u4.compare.json`; Modify `scripts/atlas/compare.mjs`(`pct`), `scripts/atlas/config/u3.compare.json`(known 에 pct 채움 — 결과 같아야 함); Output `$ATLAS_WORK/units/u4/compare.html`

- [ ] **Step 1: `checks.known`에 퍼센트 고정 (유럽에서 남은 일)** — 실패하는 테스트 먼저: compare 의 known 맞춤 함수(순수 함수로 빼냄)가 `{topic, item, webIncludes, pct: 92}`를 받으면 그 행의 글 일치율이 92 일 때만 「알려진 차이」, 91·80 이면 「다름」으로 남고 「(알림) pct 다름: 지금 80」을 출력. `pct`가 없으면 지금 동작 그대로. 구현 뒤 `u3.compare.json`의 31쪽 녹색 수도 항목에 `pct: 92`를 넣고 `compare.mjs --unit u3` → **0/26/118/42 그대로**(HTML 은 알림 줄 밖 같음), u2 0/9/134/24 그대로.
- [ ] **Step 2:** `u4.compare.json`: `mainMap`{general:'p34-africa', coloring:'p35-coloring', relief:'p36-relief'}, `coloringLabels` `units/u4/text/p35-labels.json`, `centerChecks`(태양광 묶음 = 중심 경도 150 — u2 p24-trade 확인 꼴), 둘째 도법 = 일반도 이퀄어스, `fixedNow`(u2·u3 와 같음), `extraScenes` — 일반도 고도 색 끔/켬(+ Q2 점선 레이어), 색칠하기 활동 + 작은 나라 고리 확대(감비아·세이셸·코모로·상투메), 지형 바탕 3종 + 핀 숨김/하나/모두, 기후 그래프 핀 모두 보기, 언어 범례 「아랍어」 고름(줄무늬 나라 남음), 종교 범례 「비거주지」 고름, 자원 고리 하나 누름 → 카드 + 크게 보기(고리 SVG), 피라미드 크게 보기, 태양광 묶음(태평양 중심), 사막화 범례 「사하라 사막」(점무늬)·「사헬 지역」(빗금) 고름, 녹지 원 크기 크게 보기, 주제도 활동 원본 쪽 보기(부분) 38·39.
- [ ] **Step 3:** `node scripts/atlas/compare_shots.mjs --unit u4` → `node scripts/atlas/compare.mjs --unit u4`. **다름 0** 목표 — 다름은 고치거나 까닭이 결정 기록에 있는 것만 `checks.known`(tb/web/webIncludes/pct)으로. 결과 수를 「실행 중 결정」에.
- [ ] **Step 4: 교사 확인 목록(`checks.teacher`, 쪽별)** — U4-2~U4-9 기록의 교사 확인 항목 전부 + Q1~Q8 답 반영 상태: 서사하라·소말릴란드·비르 타윌·속령 처리, 미확정 국경 점선, 나라 분류를 고친 나라(`countryOverrides`), 줄무늬 나라 목록(남아공 세 색 여부), 비거주지 화면용 색 보정, 자원 범례 제목 「주요 생산국」(교과서에 없음), 고리 SVG(사이드바)·지도 위 고리 자리, 피라미드 잰 값, 키상가니·도도마 잰 값, 「13.800」·「40.795」 원문 그대로, 면적 비교 삽화 사진 카드, 작은 나라 고리(넓이 기준), approx·`projectionFrom` 지도, 옮긴 핀·기호(snapped), 찾아보기 격자 칸 다름.
- [ ] **Step 5:** 교사에게 대조표 경로(`C:\Users\Public\atlas-work\units\u4\compare.html`)와 확인 요청 목록을 알리고 **승인을 기다린다**(공개하지 않음). 교사 요청 고침은 「실행 중 결정」에 기록 → 다시 대조. compare.mjs 를 고쳤으므로 u2·u3 `regress_unit --check`(대조표 HTML·수 같음).

### Task U4-11: 성능·이미지 경로·공개 ⓣ

- [ ] **Step 1:** 1024×768 swiftshader 성능(`units/u4/perf/perf_u4.mjs` — 유럽 perf_u3 꼴: 도법 5개 × 전환·settle 9번 중 뒤 7번 중앙값/최대). 장면: 일반도 고도 색 켬, 지형 자연색, 기후 구분·1월·7월, 언어(줄무늬 — 패턴 채움 비용), 자원(고리 7), 태양광(세계 래스터, 태평양 중심), 사막화(점무늬·빗금). 기준 200ms 안. 구드가 넘으면 유럽처럼 까닭(프로파일)만 기록하고 고치지 않음(유럽 공개 때의 판단을 따름). 결과를 「실행 중 결정」에.
- [ ] **Step 2:** 이미지 먼저 공개: `git add docs/assets/atlas/u4 && git commit && git push`(push 는 코디네이터·사용자 승인 뒤) → 모든 사진·쪽 주소 200(`curl -sI`).
- [ ] **Step 3:** 교사 승인 뒤 `npm run release -- atlas-u4-africa --note "사회과부도 아프리카 첫 공개"` → 커밋·푸시 → `https://yhk1m.github.io/donga-social-sims/atlas-u4-africa/1/` 200, 공개 페이지에서 음영·고도 색·자연색 화상이 그려지는지(교차 출처) 확인.
- [ ] **Step 4:** 마지막 회귀 — `regress_unit --unit u2 --check`·`--unit u3 --check`. 엔진이 바뀌어 아시아·유럽 조각을 다시 만들면 달라지는 부분(새 엔진 코드 — 크기만)이 있으므로 교사에게 묻는다: 「엔진 개선(작은 나라 넓이 기준·고리 SVG 등)이 생겼으나 u2·u3 공개본은 그대로 둠, 새 판(아시아 v4·유럽 v2)을 낼까?」(Q6 코펜하겐 고리와 함께).

---

## 실행 순서와 병렬화

- **U4-G0 맨 먼저**(u3 기준선을 엔진·공유 스크립트 변경 전에 찍어야 함).
- U4-1 → U4-2 → (U4-3 은 U4-2 와 병렬 가능 — 엔진·파이프라인 코드만, 합성 시험으로) → U4-4 → U4-5·U4-6·U4-7(병렬 — 서로 다른 파일, 단 공유 스크립트를 고치는 하위 작업은 차례대로 회귀) → U4-8 → U4-9 → U4-10 ⓣ → U4-11 ⓣ.
- 교사 질문 Q1~Q8 은 U4-1 커밋 직후 코디네이터가 묻는다. 답이 오기 전에는 기본값으로 만들고(Q1·Q3·Q4·Q5 는 U4-4·U4-8·U4-9, Q2 는 U4-3f, Q6 은 U4-3c, Q7·Q8 은 U4-6·U4-5), 답이 다르면 그 작업만 다시.
- U4-10 승인 대기 동안 다음 단원(Ⅴ 아메리카)의 U5-1·U5-2 를 시작해도 된다(파일이 겹치지 않음). 엔진을 바꾸면 앞 단원들(u2·u3·u4)의 `regress_unit --check`로 화소 비교 — u4 도 공개 뒤에는 `--unit u4 --baseline`을 찍어 둔다(U4-11 끝).

## 실행 중 결정

- (U4-G0, 2026-10-20) 회귀 도구 단원 일반화 + u3 기준선 — `scripts/atlas/regress_unit.mjs --unit uN --baseline|--check`, `regress_u2.mjs` 는 `main(['--unit','u2',…])` 를 부르는 껍데기(옛 명령·출력 그대로)
  - 단원 의존 값은 `unitSpec(id, env)` 한 곳: 저장소 `sims/<sim>/data`·`content/atlas/<id>`·`docs/assets/atlas/<id>`·`docs/assets/atlas/common` + 공개된 단원(`docs/versions.json` 에 sim 이 있음)은 공개본 `docs/<sim>`, 조각 `embed/<sim>.html`; 작업 폴더 = 단원 표 `pages` → 쪽 접두(`vec/<접두>-*.json`·`geo/<접두>*.fit.json`·`text/places-<접두>-*.json`) + 단원 설정 `content.labels`·`content.charts`·`charts.out.climate`·`places.index.out`(작업 폴더 기준 — 하나라도 없으면 오류) + u2 밖 단원은 단원 작업 폴더 `geo/city-holdout.json`; 캡처·대조표 자리는 대조표 설정 `<id>.compare.json` 의 `shotsDir`·`out`(없으면 `shots/compare`·`compare.html`, 단원 작업 폴더 기준 — compare_shots·compare.mjs 와 같은 규칙); 기준선 `$ATLAS_WORK/units/<id>/baseline/`. 비교 규칙(도장만 다름은 정당·조각 크기 ±1%·화면 지명 수 흔들림은 참고)은 옛 그대로.
  - **판단 — u2 는 옛 목록 그대로**: u2 는 공개본 `docs/atlas-u2-asia`·`geo/city-holdout.json` 을 넣지 않는다(G0 기준선에 없는 키라 넣으면 「새로 생김」 실패 — 기준선을 다시 찍지 않는다는 계획을 따름). u2 설정에서 끌어낸 작업 산출물 4개가 옛 손 목록(p17-labels·charts-u2·climate-world·index)과 차례까지 같아 u2 만의 따로 된 목록은 두지 않았다. 쪽 무늬도 옛 정규식과 같은 파일을 고름(시험).
  - **판단 — u3 도 common 을 지킴**: 계획 글은 「u2 는 common」이었으나 common(엔진 공유 래스터 natural·relief·tint-4096 3개 — src/atlas/natural·relief·tint.js 가 모든 단원에서 씀)은 u3 조각도 쓰므로 u3 에도 넣었다(공유 자산이 바뀌면 두 단원 모두 잡힘).
  - u2 확인: 옮기기 전 `regress_u2.mjs --check` 출력과 옮긴 뒤 `regress_u2.mjs --check`·`regress_unit.mjs --unit u2 --check` 출력이 글자까지 같음(diff 0) — 해시 163개 중 도장만 다름 2(coloring.json·basemap.json), 캡처 41장 화소 차 0(화면 지명 수만 heritage 3장면 100→101, 참고), 대조표 0/9/134/24 수·HTML 같음, 조각 2,058.1 KB(+0.790%) — 회귀 없음. u2 기준선 파일은 건드리지 않음.
  - u3 기준선: `compare_shots --unit u3`(31장) → `compare --unit u3`(다름 0 · 알려진 차이 26 · 같음 118 · 참고 42) → `npm run embed -- atlas-u3-europe`(1,461,440 B = 1,427.2 KB, 유럽 공개 때와 바이트 수 같음) → `--unit u3 --baseline`: 해시 194개(저장소 134 = sims/atlas-u3-europe/data 16 · content/atlas/u3 5 · docs/assets/atlas/u3 106 · common 3 · docs/atlas-u3-europe 3 · 조각 1; 작업 폴더 60 = vec 39 · fit 15 · places-p26 1 · units/u3 의 p27-labels·charts-u3·climate-world·index·city-holdout 5). 곧바로 `--check` 다름 0·화소 차 0. **캡처를 한 번 더 찍고 compare 다시 → `--check`도 다름 0·화소 차 0·화면 값 같음**(u3 캡처가 결정적임 — fixedNow 덕, u2 heritage 지명 수 흔들림 같은 것도 없음).
  - 시험 `tests/atlas/regressUnit.test.mjs` 5개(쪽 접두·u2 명세 옛 값·u2 쪽 무늬 = 옛 정규식·u3 명세·모르는 단원/쪽 없음/설정 없음 오류). npm test: **Python 279 · Node 464**(459 + 5).
- (U4-1, 2026-10-20) 아프리카 설정 뼈대·지도 목록 — `units.json` u4, `config/u4.json`, `maps_u4.json`(12장), `test_maps_u4.py`
  - **지도 12장**(설계 §5.2 표의 13 과 다름): 38쪽 「아프리카의 면적 비교」는 아프리카 위에 나라 12개 윤곽을 겹친 삽화라 지도로 세지 않고 사진 카드(U4-6), 39쪽 「의제 2063」도 삽화. 쪽 목록 표의 12장 그대로 — `p34-africa`(general, 경위선 눈금) · `p35-coloring` · `p36-relief` · `p37-climate`(눈금 12개 + 섬) · `p37-jan`·`p37-jul` · `p38-language`·`p38-religion`·`p38-resources`·`p38-solar` · `p39-afcfta`·`p39-desert`.
  - `config/u4.json` = 유럽 U3-1 뼈대(git 88e6dd0 의 u3.json)의 키 구조 + 그 뒤 u3 에 생긴 공용 절(`shapeControls` 수치, `places` 양식 표·glue — U4-5 에서 34쪽을 보고 고침). 단원 고유 값은 비움(layers·photos.items·charts.items·insets·neAlias·extraNames). 작업 파일 키는 `units/u4/…`, 도장은 `@unit/…`, 색칠하기 라벨은 `units/u4/text/p35-labels.json`. `basemap.levels` 10a 에 `simplifyByIso` 없음(유럽 U3-9 와 같은 까닭), `unitBoxes`·`places.neBox` 어림 `[-30, -40, 65, 42]`(U4-2 에서 fit 으로 다시). `regress_unit` 의 `unitSpec('u4')`가 설정에서 경로를 끝까지 푸는 것 확인.
  - 틀·덮개 상자는 쪽 그리기·글자에서 잼(`find_maps.py 34 39`: 34쪽 눈금 글자 32 · 37쪽 16(기후 구분 12 + 1·7월 적도 「0˚」 4) · 나머지 쪽 0, 클립 사각은 참고만). 계획의 덮개 어림(예: 36쪽 활동하기 [45,505,275,535])은 화소 값이 섞여 있어 글자 상자로 다시 잼 — 36쪽 [33,503,196,537], 37쪽 기후 구분 「활동하기 2」 [42,430,255,456](틀 안이라 cartoucheBbox), 35쪽 개관 글 상자 [52,527,321,690].
  - 38쪽 자원 지도 틀은 둘레 고리 그래프 7개를 피해 작은 아프리카만([438,168,557,304]) — 고리의 회색 조각이 땅 색 #ede9e4 와 거의 같다. 39쪽 사막화 틀 아래 끝은 지도 그림 끝(583.4)까지 — 위험 단계 범례와 원 크기 그래프는 틀 밖(U4-4 에서 범례를 읽을 때 넓힐지 정함).
  - 처음 식(`shapes.init`)은 섬 씨앗(`seeds`, 교과서 자리 = land_shapes 도형 넓이 중심). 섬이 없는 39쪽 사막화는 새 꼴 `{"fromMap": "p34-africa", "pts": [베르데곶, 과르다푸이곶]}`(U4-2 에서 shape_controls 에 더함). 작은 지도 7장은 `tips: true`(대륙 해안 꺾인 점 — 대륙은 Natural Earth 10m 육지에서 유라시아와 한 조각이라 넓이 중심 짝이 없다).
- (U4-2, 2026-10-20) 아프리카 기준점과 경위도 맞추기 — 12장 모두 평균 잔차 ≤ 0.36mm(`approx` 없음), 7장 `projectionFrom`
  - 34쪽: 경위선 교차점 54(눈금 글자 32 → 경선 10 × 위선 6, `extract_vectors --controls`) + 도시 기호 기준점 94(`city_controls.mjs --unit u4`, 설정 u3 값 그대로 — 기호 지명 283, 이름 짝 256(동명 5 — 트리폴리 등은 짝에서 빠짐), MAD 로 뺌 18, 간격으로 뺌 144). **적도는 가는 사각 채움(PDF 're' 항목 하나)이라 extract_vectors 의 경위선 후보(선·얇은 채움의 이어진 마디)가 아니다** → 적도 「0˚」 글자 2개는 「far」로 버려지고 적도 교차점 10개가 빠짐. 공유 스크립트를 고치지 않음(u2·u3 교차점이 바뀔 수 있고, 54 + 도시 94 로 충분). MAD 로 빠진 도시에 **수도가 많다**(킨샤사 3.6pt·브라자빌 2.4·마세루 2.3·지부티 2.2·방기 2.1·로메 2.0 — 교과서가 이름·이웃 수도와 겹치지 않게 기호를 옮겨 그린 것으로 봄, 부라이다 7.8pt·호데이다 3.9 등 서아시아도) → U4-5 `snapKm` 대조에서 다시 봄. 겹 나누기 빠진 도시 오차 중앙 7.1km·90% 17.7·최대 28.0(교차점만 10.9/19.5/37.0), 기준점 아닌 도시 6.8/15.7/29.7km(`units/u4/geo/city-holdout.json`). 34쪽 1pt = 약 12.7km 라 유럽 26쪽(2.2/5.6/11.3km, 1pt ≈ 7km)보다 km 로는 크다.
  - 눈금 없는 11장(37쪽 기후 구분은 교차점 9 + 섬): `land_shapes.py` + `shape_controls.py`. 새로 더한 것(키가 있을 때만 — u2·u3 지도는 키가 없어 그대로, u3 `vec/*.shapes.json` 15개 다시 뽑아 바이트 같음):
    - `land_shapes` 래스터 규칙 `seaWhite`(세 값 모두 이 값 이상인 흰 화소만 바다): 38쪽 태양광 세계 지도는 「0–3.0」 분류가 파랑이라 파랑 − 빨강 규칙이 땅을 바다로 봄. 37쪽 기후 구분·1월·7월도 바다가 래스터의 흰 바탕이다 — 유럽 29쪽 같은 흰 바다 덮개가 없고, 쪽 전체 흰 채움 둘은 아프리카 고리가 바깥 사각과 같은 방향이라(0 아닌 감김) 땅까지 덮는 모양이라 sea 모드를 못 씀. 태양광은 래스터 번짐이 섬을 대륙에 잇지 않게 `seaWhite 200`(240 이면 오스트레일리아·일본이 아시아와 한 덩어리) + `openPt 0.5`(래스터에 그려진 적도선 끊기).
    - `land_shapes` `render: "all"`(쪽 전체 렌더): 38쪽 언어 지도는 공용어 둘 이상인 나라를 땅 채움 없이 나라 모양으로 클립한 굵은 선(1.6pt) 줄무늬로 칠해, 채움 색 합으로는 대륙이 두 조각으로 끊기고 마다가스카르가 빠졌다.
    - `shape_controls` 처음 식 `{"fromMap", "pts"}`: 참조 지도(34쪽) 식의 도법을 두고, 두 곳 이상(섬 중심·곶 끝 어림)을 그 식으로 투영한 지면 자리 → 이 지도 자리 닮음 변환을 sim 에 겹침(`page_similarity`·`compose_sim`, 합성 시험). 섬 씨앗(`seeds`)으로 바로 맞추면 씨앗 4~5개에 도법 매개변수까지 맞춰 엉뚱한 식에서 출발했다(36쪽: 중심 31.8°E·19.9°N, 짝 9~13 · rms 2pt · 수렴 안 함 → fromMap 으로 짝 46 · rms 0.35pt). 36쪽·작은 지도 6장(1·7월, 언어·종교·자원, AfCFTA)은 씨앗 목록을 그대로 `pts` 로, 섬이 없는 39쪽 사막화는 베르데곶·과르다푸이곶 두 점. 35쪽(나라 6)·37쪽 기후(교차점 + 섬 4)·38쪽 태양광(세계 — 참조 없음)은 `seeds` 그대로.
  - 도법: 34~37쪽 큰 지도 넷이 따로 맞춰 모두 **정거 방위, 중심 약 20°E·0°**(34쪽 19.9/−0.4, 35쪽 20.4/−0.2, 36쪽 20.1/0.0, 37쪽 20.0/0.1) — 지면 「정거 방위 도법」과 같고 같은 바탕 지도를 줄여 쓴 것. 작은 지도 7장은 자유 맞춤 중심이 9.8~24.1°E·−8.7~5.4° 로 흔들리고(대륙이 Natural Earth 에서 유라시아와 한 조각이라 넓이 중심 짝이 섬 몇 개뿐, 나머지는 해안 꺾인 점) 5장은 짝 되풀이가 수렴하지 않아 → 유럽 아이슬란드 결정대로 **`projectionFrom`**: 1월·7월은 `p37-climate`, 언어·종교·자원·AfCFTA·사막화는 `p34-africa`(까닭과 자유/고정 rms·겹 나누기는 지도 목록 `_projectionFrom`). 고정해도 1·7월·언어·AfCFTA·사막화는 **짝 되풀이가 5번 안에 같아지지 않는다** — 꺾인 점 짝이 거리 문(tipTolPt 2pt) 경계에서 1~5개씩 드나드는 것이고 rms 는 ±0.05pt 안이라 마지막 짝으로 둠(경고 그대로). 38쪽 태양광은 후보를 원통·의원통 4개(`families`)로 좁혀 **밀러**(rms 1.09pt — 메르카토르 2.22·등장방형 3.15·로빈슨 7.58), 중심 경도 144.9°E(원통 도법 중심은 닮음 변환과 구별되지 않아 georef `seamCentred` 가 이음선을 기준점 경도 빈틈 — 아프리카 서쪽 끝과 브라질 끝 사이 — 가운데로 정함. 틀 가운데를 되돌리면 약 152°E). 태양광은 섬 중심만이면 짝 8개 · 겹 나누기 평균 2.5pt·최대 8.2pt 라 `tips` 를 켬(짝 75 · 1.27/4.26pt, 수렴 경고는 위와 같은 까닭).
  - 경위도 맞추기 결과(`georef-cli --unit u4 --all`, 겹 나누기 = shape 기준점 5겹을 빼고 georef-cli 와 같이 맞춘 오차 `units/u4/geo/shape-holdout.json`, 해안 어긋남 = 교과서 육지 바깥 고리(틀에서 3pt 안 제외)를 0.5pt 마다 → 투영한 Natural Earth 10m 육지 경계 거리 중앙값):

    | 지도 | 도법(중심) | 기준점 | rms pt / mm | 평균 mm | 겹 나누기 평균 pt · km 중앙/90%/최대 | 해안 어긋남 pt |
    |---|---|---|---|---|---|---|
    | p34-africa | 정거 방위 19.9°E, −0.4 (+TPS) | 교차 54 + 도시 94 | 1.16 / 0.41 | 0.35 (LOO 0.28) | 도시 7.1/17.7/28.0 km | — |
    | p35-coloring | 정거 방위 20.4°E, −0.2 (+TPS) | 나라·섬 40 | 0.66 / 0.23 | 0.21 (LOO 0.18) | 0.55 · 5.5/12.7/28.9 | 2.40(띠 근사 포함) |
    | p36-relief | 정거 방위 20.1°E, 0.0 | 섬·호수 46 | 0.35 / 0.12 | 0.09 | 0.28 · 4.1/8.9/26.8 | 0.31 |
    | p37-climate | 정거 방위 20.0°E, 0.1 | 교차 9 + 섬 11 | 0.17 / 0.06 | 0.05 | 0.13 · 3.0/5.5/5.8 | 0.14 |
    | p37-jan | ← p37-climate (+TPS) | 섬 1 + 꺾인 점 26 | 0.84 / 0.30 | 0.27 (LOO 0.28) | 0.80 · 26.0/72.6/104 | 0.25 |
    | p37-jul | ← p37-climate (+TPS) | 섬 1 + 꺾인 점 27 | 0.88 / 0.31 | 0.27 (LOO 0.41) | 1.22 · 43.9/141/194 | 0.29 |
    | p38-language | ← p34-africa (+TPS) | 섬 6 + 꺾인 점 23 | 1.19 / 0.42 | 0.39 (LOO 0.43) | 1.26 · 64.8/95.2/128 | 0.79 |
    | p38-religion | ← p34-africa (+TPS) | 섬·호수 6 + 꺾인 점 17 | 0.84 / 0.30 | 0.26 (LOO 0.23) | 0.68 · 25.3/75.8/122 | 0.65 |
    | p38-resources | ← p34-africa (+TPS) | 섬 1 + 꺾인 점 16 | 0.78 / 0.28 | 0.23 (LOO 0.24) | 0.68 · 42.5/87.5/122 | 0.38 |
    | p38-solar | 밀러 144.9°E (+TPS) | 섬 8 + 꺾인 점 67 | 1.09 / 0.38 | 0.34 (LOO 0.44) | 1.27 · 117/201/309 | 0.43 |
    | p39-afcfta | ← p34-africa (+TPS) | 섬·호수 6 + 꺾인 점 21 | 1.04 / 0.37 | 0.33 (LOO 0.29) | 0.85 · 32.5/96.1/120 | 0.45 |
    | p39-desert | ← p34-africa (+TPS) | 꺾인 점 15 | 1.12 / 0.39 | 0.36 (LOO 0.54) | 1.31 · 58.7/73.3/81.0 | 1.73 |

    모두 합격(평균 잔차 ≤ 0.5mm)이라 `approx` 없음. 작은 지도의 km 오차가 큰 것은 축척 탓(1pt ≈ 30~50km, 태양광 ≈ 117km) — pt 로는 유럽 작은 지도(0.07~0.43pt)보다 크다(래스터·줄무늬 경계·꺾인 점 위주). 가장 빠듯한 것은 38쪽 언어(0.39mm). 35쪽은 탄자니아·우간다·카메룬 면 중심이 잔차로 빠짐(띠 너비가 고르지 않음 — 유럽 27쪽 우크라이나·이탈리아와 같은 현상), 36쪽은 래스터 위쪽 흐린 띠의 에게해 섬 4개·파라산 제도가 잔차로 빠짐.
  - 눈으로 확인: `units/u4/geo/<id>.verify.png`(Natural Earth 해안선 자홍 + 기준점, 35쪽은 국경선도) · 도형 `units/u4/shapes/<id>.png`. 12장 모두 해안선이 교과서 해안 위. 주의해서 볼 곳: 39쪽 사막화 지중해 해안은 틀 위 끝에 잘려 기준점이 서해안·홍해·아덴만에만 있다(해안 어긋남 1.73pt), 38쪽 태양광은 래스터 해안이 번져 섬 넓이가 Natural Earth 투영보다 1.2~1.5배.
  - `unitBoxes` = 34쪽 틀(쪽 전체) 41×41 격자를 p34-africa fit 으로 되돌린 범위(−36.3, −38.7, 66.9, 41.9) → `[-37, -39, 67, 42]`. `places.neBox` 도 같게 바꿈 — city_controls 를 다시 돌려 기준점 94개가 글자 하나 다르지 않음(넓어진 띠에 짝지을 도시가 없음).
  - 공유 스크립트: `land_shapes.py`(seaWhite·render), `shape_controls.py`(init fromMap+pts) — 도장 입력 아님. u2·u3 회귀: 아래 「U4-2 회귀」 줄.
  - **U4-2 회귀**(공유 스크립트 land_shapes·shape_controls 를 고침): u3 `land_shapes --unit u3 all` 다시 → `regress_unit --unit u2 --check`: 해시 다름은 도장만 2(G0 과 같음), 캡처 41장 화소 차 0, 대조표 0/9/134/24, 조각 +0.790% — 회귀 없음. `--unit u3 --check`: 해시 194개 중 다른 파일 0(u3 `vec/*.shapes.json` 포함), 캡처 31장 화소 차 0, 대조표 0/26/118/42, 조각 +0.000% — 회귀 없음. u3 `shape_controls` 아이슬란드(fromMap + land)·벨기에(country) 다시 돌려 고른 기준점이 maps_u3 와 같음.
- (U4-3, 2026-10-21) 엔진·파이프라인 아프리카 기능 3a~3f + Step 0 회귀 도구 후속 — 모두 자료·설정 키(또는 등록)가 있을 때만 켜짐, u2·u3 회귀 없음
  - **Step 0(따로 커밋 946689c)** `regress_unit.mjs`: (a) 캡처 manifest·조각이 입력(src/** · sims/<sim>/** · 대조표 설정)보다, 대조표 HTML 이 캡처보다 오래되면 `[경고]`(실패로 세지 않음 — git checkout·merge 도 수정 시각을 바꾸므로 경고면 다시 찍기). 처음 돌렸을 때 main 병합(f00c144)이 src 시각을 바꿔 두 단원 모두 경고가 떴고, 다시 찍은 뒤 사라짐. (b) 기준선 hashes·기준선 캡처 manifest·캡처 manifest·대조표·조각 중 없는 것을 무엇을 먼저 돌릴지와 함께 알리고 종료 코드 2(ENOENT 대신). (c) 해시에서 `*.md` 뺌 — **기준선은 다시 찍지 않음**: check 가 옛 기준선 키에도 같은 규칙(`hashable`)을 적용해 `content/atlas/u2|u3/issues.md` 키만 비교에서 빠지고 「(참고) 기준선의 .md 키 1개는 비교에서 뺌」으로 알림(u2 해시 163 → 162, u3 194 → 193, 이미지·자료 키는 그대로). (d) `need()` 내보내 키 이름 오류 시험. (e) u2 옛 목록(legacy) 까닭 주석. 시험 +4.
  - **3a 줄무늬** — 파이프라인 키 `layers[id].multi {samples: 7, minShare: 0.25, max: 3}`(country_class.py: 표본 격자 7×7, 채움 분류가 둘 이상 각각 표의 25% 넘으면 `[많은 차례 …]`, 보고서 `multi`, 출력 `multiFill: 'stripes'` → build_layers 가 키 있을 때만 넘김). 앱 키 `data.multiFill === 'stripes'`: countryClassFeatures 가 줄무늬 나라를 면 하나(`pattern 'stripes'`, `colors`·`clsList`, 말풍선 「나라 · 분류1 · 분류2」)로, 윤곽만 분류는 줄무늬 색에서 빼고 따로 면. areaLayer 는 채움 다음에 45° 줄무늬(타일 6px × 색 수, 줄 폭 약 4.2px), 범례 고름·검은 선택 윤곽·맞히기·강조는 `clsList` 중 하나라도 고르면 남음. 순수 함수 `countryFill`·`countryVisible`(계획 시험 그대로). 검증 그림(verify)은 둘째 채움부터 빗금으로 덧그림. 줄무늬 범례 견본은 없음(범례는 분류마다 단색).
  - **3b 점무늬** — 파이프라인 키 `layers[id].dots {color, swatch, spacingPt, maxPt2?, minPt2?}`: `zones.dots_area`(점 중심 → spacing×0.75 넓혀 합치고 ×0.25 되줄임 = 바깥 점에서 반 칸 밖이 경계, 구멍 메움, (3·spacing)² 보다 작은 조각 버림) · `dots_zone`(작은 원 채움 색·넓이로 점 찾기) · 범례는 `hatch_legend(m, cfg, 'dots')`(같은 견본 상자 + 오른쪽 글자 길), features.py 에서 빗금 **앞** 범례 항목(빗금은 leg 끝이어야 하는 옛 규칙 유지). 앱: `pattern 'dots'` 면은 채움 → 줄무늬 → **점무늬** → 빗금 차례(타일 6px, 지름 1.6px), 범례 견본 `radial-gradient` 점. 사헬 빗금은 1단계 `hatch` 그대로.
  - **3c 고리** — 사이드바: `chartPlan` 이 `pie` + **`ring`**(수 0~1 = 안쪽 비, `true` = `donut` 값, 없으면 0.6)만 SVG 로, `donut` 만 있는 유럽 코펜하겐은 그대로 csat 원그래프(u3 화소 그대로). **유럽 v2 재사용 길**: 유럽 main 에서 `installExtraCharts()` 를 부르고 코펜하겐 자료에 `ring: true` 만 더하면 `donut 0.595` 가 안쪽 비인 같은 SVG 고리가 됨(이 작업에서는 u3 자료·main 안 바꿈). `ringSvg`(barSvg 꼴 시험지 양식: 조각 사이 검은 선 #231f20, 22° 넘는 조각에 값, 가운데 `spec.center` 줄, 아래 「견본 이름 값」 2열). 지도: 레이어 종류 `chartSymbols`(chartSymbols.js — SVG, 누르기·Enter 로 `onPick` → topic.js 가 카드에 그 그래프; 지름 `classSymbolPx(sizePt, k, 모든 sizePt, {pxPerPt 2, min 52, max 96})` 라 확대해도 고리끼리 비 그대로, 안쪽 = ring 비, 가운데 글자는 줄 수·가장 긴 줄 폭에 맞춘 크기, `labelObstacles` = 고리 상자, 모양은 CSS 대신 SVG 속성). build_layers `type 'chartSymbols'` 설정 `items [{chart, centerPt, sizePt?, title?, center?}]` → 고리 가운데를 fit 으로 되돌린 lonlat + 그래프 자료(`content.charts` 작업 파일)의 series·ring 을 옮김(앱 레이어가 그래프 자료 없이 그림).
  - **3d 원 크기 줄** `bubbleRow` — `bubbleLayout`(지름 = maxD·√(v/max), 최소 2px, 자료 차례) · `bubbleSvg`(원 아래 끝 맞춤, 이름·값 두 줄, 칸 62px, 색 = 계열 색, 없으면 #8b6bb1).
  - **판단 — 조각 크기 때문에 「등록」 길**: 처음엔 고리·원 크기 줄·고리 기호를 charts.js·layerRef.js 에 바로 넣었더니 u2 조각이 +1.18%(2,115,612 B — 기준선 2,090,906 B 대비, G0 뒤 이미 +0.790%)로 ±1% 를 넘었다(minify 뒤 늘어난 양 약 8.4KB: chartSymbols 2.3 · charts 1.8 · chartCore 0.9 · layers 0.9 · quiz 0.8 · countryClass 0.8 · CSS 0.6). 기준선을 다시 찍지 않고 아프리카 전용 코드를 `src/atlas/chartsExtra.js` 로 빼 `installExtraCharts()` 가 `registerSvgChart('pie'|'bubbleRow')`·`registerLayerType('chartSymbols')` 로 등록하게 바꿈 — 부르지 않는 u2·u3 조각에서는 rollup 이 털어 냄. 고리 CSS 도 SVG 속성으로 옮김(공유 atlas.css 는 안 바꿈). **U4-9 에서 `sims/atlas-u4-africa/main.js` 가 mountAtlas 전에 `installExtraCharts()` 를 꼭 불러야 함**(안 부르면 고리 그래프는 「그래프를 그리지 못했습니다」, chartSymbols 레이어는 「모르는 레이어 종류」 오류 — 시험으로 고정). 남은 공유 증가(줄무늬·점무늬·넓이 기준·등록 자리)는 u2 +3.2KB.
  - **3e 넓이 기준** — 단원 선택값 `coloring.smallMetric: 'area'`(topic.js → coloringLayer, 없으면 `'box'` = 유럽 그대로): 나라마다 한 번 가장 큰 조각의 구면 넓이·중심(`largestPart`), 화면 넓이는 그 중심에서 경위도 0.1° 칸의 투영 넓이로 국소 배율을 재 어림(`areaPx` — 도법과 상관없음), `√넓이 < smallPx` 면 동그라미, 자리 = 가장 큰 조각 중심. 1° ≈ 10px 에서 감비아 꼴(4.5°×0.4°)은 √(45×4) ≈ 13.4px 라 **smallPx 8(유럽 값)로는 여전히 「작지 않음」** — U4-9 에서 u4 `smallPx` 를 정할 때(16 안팎 어림) 35쪽 기본 보기 배율로 감비아·르완다·부룬디·에스와티니가 어떻게 되는지 보고 정할 것. 상자 기준 그리기 코드는 `drawMark` 로 뺐을 뿐 같은 차례·같은 값(u3 캡처 화소 차 0).
  - **3f 미확정 국경** — build_layers `source: 'ne-disputed'` + 설정 `disputed {featurecla, pairs}`(u4.json `layers.ne-disputed`): 원본 FEATURECLA 값 = `Disputed (please verify)` 39 · `Line of control (please verify)` 10 · `Indefinite (please verify)` 13 · `Overlay limit` 6 · `Indeterminant frontier` 4 · `Lease limit` 3 · `Unrecognized` 1. 단원 상자 안 분쟁 계열 선이 34개라(팔레스타인·레바논·소말리아–에티오피아·탄자니아–말라위·모로코–알제리·올리벤사·키프로스 …) 교과서 세 곳만 **나라 짝**으로 고름: 서사하라–모로코(NE 값 Line of control)·이집트–수단(Disputed — 22°N 선 34.08~36.88°E)·남수단–케냐(Disputed — 일레미). 짝에 선이 없으면 멈춤. 출력 `sims/atlas-u4-africa/data/layer-ne-disputed.json`(3.6KB, 선 19조각, 범례 「미확정 국경」 붉은 #ed1c24 점선). 주제 항목은 `type: 'area'`(areaLayer 가 선을 그림 — 엔진 작업 없음), 일반도·색칠하기 topics 연결은 U4-8.
  - **발견 — 서사하라(Q1 재확인 필요)**: Natural Earth 50m·10m 의 `SAH` 면은 서사하라 전체가 아니라 **모로코 방벽(berm) 동쪽 띠**(경위도 넓이 8.06 — 서쪽은 `MAR` 에 들어 있음, MAR 남쪽 끝 21.42°N). 그래서 NE 의 서사하라–모로코 「Line of control」은 방벽 선이고, 교과서의 27.66°N 경계 점선(서사하라 전체를 따로 그림)과 다르다. 교사 Q1 답(「NE 따로 된 면 그대로」)은 이 사실을 모르고 한 답일 수 있어 교사 대조표 항목으로 올림 — 바꾸려면 U4-9 바탕 지도에서 NE `disputed_areas` 의 서사하라 면으로 MAR 을 자르는 따로 된 작업이 필요.
  - 공유 파이프라인 확인: `build_layers --unit u3 all`·`--unit u2 all` 다시 → `sims/atlas-u2-asia|u3-europe/data` 바이트 같음(git 차이 없음). 고친 Python(country_class·zones·legend·features)은 도장 입력 아님.
  - 시험(Python 297 → 304, Node 475 → 497): test_country_class `MultiFill` 4(두 색 띠 → 배열·한 색 → 문자열·multi 없으면 그대로·minShare/max·merge), test_zones 3(점 격자 → 사각형 90~110%·동떨어진 점 버림·틀 자르기), atlasLayers 7(countryFill/Visible·multiFill 없음 = 유럽 꼴·줄무늬 그리기/고름/맞히기·점무늬 차례·고리 기호 hit/지름 비/장애물/누르기·layerFromRef 등록 전 오류), chartCore 3(chartPlan ring/donut·ringSlices 360°·bubbleLayout 1.575), ui 4(고리 SVG — 등록 전 실패 글·원 크기 줄·점무늬 견본·smallMetric area), layers 3(multiFill 넘김/없음·chartSymbolsLayerJson·disputedLayerJson), regressUnit 4.
  - 눈 확인: 임시 페이지(지운 뒤)를 헤드리스 Chrome(swiftshader)으로 찍어 고리 그래프·원 크기 줄·2·3색 줄무늬·점무늬 위 빗금·지도 고리 기호 확인 — 고리 기호 가운데 글자가 처음엔 구멍을 넘어 지름·글자 맞춤을 고침.
  - 리뷰(서브에이전트, 읽기만) 반영: features.py `pdf_layer_ids` 와 test_features 설정 검사가 `chartSymbols`·`ne-disputed` 를 PDF 뽑기 대상에서 뺌(u4 에서 extract_vectors all 이 잘못 돌 뻔함) · `chartSymbolsLayerJson` 이 안쪽 비를 수로 풀고(ring true → donut) 색은 color → colors[0] · country_class 가 줄무늬가 된 나라마다 countryOverrides 가 없으면 경고(경계 어긋남으로 작은·가는 나라가 줄무늬 되는 것 잡기) · chartSymbols 가 lonlat·series 없는 항목을 건너뜀. 남긴 것(작음): 검증 그림의 셋째 채움도 같은 빗금, 점무늬 구멍 메우기는 교과서가 일부러 비운 곳도 메움(39쪽 실측 때 확인), ne-disputed properties 에 page 없음(원본 쪽 단추 없음 — Natural Earth 자료라 정상), 범례 점 견본 4px ↔ 지도 6px.
  - **U4-3 회귀**(조각 다시 → 캡처 41·31장 → compare → check): `--unit u2 --check` 해시 162개 중 도장만 다름 2(G0 과 같음), 캡처 41장 화소 차 0(heritage 지명 수 100→101 참고), 대조표 0/9/134/24, 조각 2,110,700 B(+0.945%) — 회귀 없음. `--unit u3 --check` 해시 193개 중 다른 파일 0, 캡처 31장 화소 차 0, 대조표 0/26/118/42, 조각 1,464,681 B(+0.222%) — 회귀 없음. **u2 조각 남은 여유 약 1.1KB** — 다음 단원 공유 엔진 코드는 등록 길로 빼거나, 교사·코디네이터 판단으로 u2 기준선 조각 크기를 다시 정해야 함.
- (U4-4, 2026-10-21) 주제 레이어 10 + 미확정 국경 — Step 0(U4-3 리뷰 후속, 따로 커밋 2e1ca19) + 레이어 설정 `config/u4.json layers`, 검증 그림 `$ATLAS_WORK/units/u4/layers/`(레이어 `<id>.png`, 나라 단위 `<id>-50.png`·`-10a.png`, 확대 `lang-*.png`·`afcfta.png`·`resources.png`·`clim-*.png`·`hatch-ea.png`·`desert-dots.png`·`solar-*.png`)
  - **Step 0**: ① `quiz.js` 날짜변경선(`e < w`) 건너뛰기를 상자 기준 길 안으로 — 넓이 기준(`smallMetric 'area'`)은 날짜변경선을 넘는 흩어진 섬나라도 잼(시험: 179.5°E·−179.8° 섬 → 넓이 기준 동그라미 하나, 상자 기준은 그대로 건너뜀). ② `disputedLayerJson` 은 상자 밖으로 걸친 선을 통째로 버리지 않고 `clipLineToBox`(Liang–Barsky, 마디마다 — 들락거리면 조각 여럿)로 잘라 안쪽만, 짝에 선이 없으면 멈춤은 그대로(시험). u4 `layer-ne-disputed.json` 바이트 같음(세 곳 모두 상자 안). ③ `chartSymbols` `destroy()` 가 뿌리 `<g>` 를 지우고(다시 그리면 새로), 고리마다 `focus`·`blur` 때 바깥 지름 + 3px 파란 테두리 원(`at-ring-focus`, #1a73e8 2.5px — CSS 없이 SVG 속성, 크기가 바뀌어 다시 그려도 초점 유지). u2·u3 회귀 없음(아래 「U4-4 회귀」).
  - 레이어 표(교과서 ↔ 뽑은 것):

    | 레이어 | 종류 | 교과서 | 뽑은 것 | KB |
    |---|---|---|---|---|
    | p37-climate | 래스터 면 + 빗금 | 범례 10(열대 3·건조 2·온대 4 + 고산 빗금) | 분류 10 모두 면(온난 습윤 = 남아공 동해안·마다가스카르 동쪽 띠), 고산 빗금 6조각(아틀라스·에티오피아 = 윤곽 선, 동아프리카 두 곳 = 잘라 그리기 경로) | 109.2 |
    | p37-jan | 래스터 면 + 등온선 | 강수 7 + 등온선 글자 12(계획 어림 11) | 면 7, 등온선 6줄(10 하나·20 넷·30 하나 — 30 선은 세네갈~마다가스카르 한 줄에 글자 둘) | 57.6 |
    | p37-jul | 래스터 면 + 등온선 | 강수 7 + 등온선 글자 10(어림 9) | 면 7, 등온선 6줄(10·20 셋·30 둘) | 60.8 |
    | p38-language | countryClass + 줄무늬 | 8분류 | 나라 55(줄무늬 24 — 세 색 5: 남아공·적도 기니·코모로·에리트레아·르완다), 고침 57 | 12.5 |
    | p38-religion | 벡터 면 | 4분류 | 4(비거주지 화면 색 보정) | 41.1 |
    | p38-resources | countryClass | 생산국 10(범례 없음) | 10, 고침 30 | 7.2 |
    | p38-resource-charts | chartSymbols | 고리 7 | 설정 7(가운데 자리·지름·가운데 글자) — **그래프 자료(U4-7) 전이라 건너뜀**(아래) | — |
    | p38-solar | 래스터 면(세계) | 6단계 + 동해·독도·이어도 | 6 + 지명 3 | 101.1 |
    | p39-afcfta | countryClass | 3분류 | 나라 56(비준 완료 46 — 서사하라 포함 · 협정 서명 9 — 소말릴란드 포함 · 협정 서명 전 1 에리트레아), 고침 32 | 7.3 |
    | p39-desert | 벡터 면 + 점무늬 + 빗금 | 8(위험 5·건조 지역·사하라 사막·사헬 지역) | 8 | 116.5 |
    | ne-disputed | 선(U4-3f) | 1 | 선 19조각 | 3.6 |

    합계 516.9 KB(예산 650). 태양광은 처음 221KB(tol 0.15) → tol 0.3°·minArea 0.5(지면 1pt ≈ 117km ≈ 1° 라 0.3° 단순화는 화면에서 안 보임), 사막화는 166 → tol 0.06 으로 줄임.
  - **38쪽 언어 — 줄무늬는 채움이 아니라 나라 모양에 자른 굵은 선(1.6pt)**: U4-3a 의 채움 표본 다수결로는 줄무늬 나라를 못 봄(벡터 채움에 줄이 없음). 새 키 두 개(있을 때만 — u2·u3 설정에 없음):
    - zones `rasterRender: 'all'`: 래스터 분류를 「이미지만 렌더」 대신 벡터까지 렌더한 화소로(`pdfkit.render_clip images_only=False` — pdfkit 은 고치지 않음). 언어 레이어 = `mode raster, dpi 300`.
    - country_class `multi.areaInsetPt`: **표본 격자는 45° 줄 주기와 맞물려 한 색만 줍는다**(처음 7×7 표본: 수단 분홍 29·초록 5, 모로코 초록 12·회색 1 — 교과서는 둘 다 반반 줄무늬). 그래서 나라 지면 면을 1pt 안으로 줄여(경계 어긋남으로 섞이는 이웃 색 줄임, 줄이면 없어지는 작은 나라는 면 그대로) 분류 면과 겹친 **넓이 몫**으로 판정(`area_classes`, 보고서 `shares`). 수단 0.55/0.45, 모로코 0.50/0.50, 남아공 0.36/0.34/0.31.
    - 틀 위 끝에 걸친 본문 글자 줄(「…종교도 매우 다양하게 나타난다.」)이 화소로 남유럽·서아시아 표본에 잡혀 → 지도 목록 `p38-language.cartoucheBbox [26,118,203,129]`(덮개).
    - 그래도 서아프리카는 경계 어긋남이 약 1.5pt(토고 면이 통째로 가나 분홍 위) — 가나·토고·베냉·감비아·기니비사우는 고침. 고침은 줄무늬 나라 모두(같은 값이라도 확인 까닭, 고침의 분류 차례 = 범례 차례).
  - **38쪽 자원**: 범례 상자가 없고 나라 이름 글자는 글꼴 코드가 깨져(YDVYGOStd33 — pdfkit 으로도 안 풀림) PDF 에서 못 읽음 → 새 키 `legendItems [{color, label}]`(country_class·features 공통, `legend.manual_legend` — 채움 색 ↔ 이름 글자 자리를 짝지어 손으로, 계획 표 차례). 알제리가 니제르 색 표본 하나로 잡혀 고침(분류 없음). 나라 이름은 범례 이름이라 따로 점 지명은 두지 않음 — 화면 범례 제목 「주요 생산국」은 U4-8 topics 에서(교과서에 없는 제목 — 대조표 알려진 차이).
  - **38쪽 자원 고리 7(chartSymbols — 계획 열린 질문)**: 설정 `layers.p38-resource-charts.items` = 7개 `{chart, title, centerPt, sizePt 52.5, center}`. centerPt = 가운데 흰 원(#ffffff, r 12.57pt) 중심, 바깥 지름 약 52.5pt(7개 같음, 안쪽 비 약 0.48), 가운데 글자는 지면 그대로(우라늄 「40.795」·다이아몬드 「13.800」 — 천 단위 쉼표 대신 마침표, 원문 그대로). chart id = `p38-bauxite·p38-uranium·p38-diamond·p38-chromium·p38-cobalt·p38-platinum·p38-manganese` — **U4-7 이 같은 id 로 그래프 자료를 만들어야 함**. 고리 조각 값은 조각 **밖**에 인쇄돼 있어 지금 `read_donut`(조각 안 인쇄 수)으로는 못 읽음 — U4-7 에서 읽개를 넓혀야 함. 그래프 자료가 아직 없으므로 `build_layers` 는 이 레이어만 경고와 함께 건너뜀(파일이 있는데 그래프가 빠졌으면 지금처럼 멈춤). 가운데를 되돌린 경위도: 위 줄 셋은 지도 틀 밖이라 유럽·서아시아 위(보크사이트 −21.8°, 50.0° · 우라늄 31.9°, 52.8° · 다이아몬드 81.3°, 44.7°), 옆 넷은 대서양·인도양(크롬 −36.0°, 14.1° · 코발트 68.4°, 8.9° · 백금 −39.2°, −22.6° · 망간 69.1°, −25.7°) → 계획 시험 범위(lat < 45, lon < 75)를 lat < 55, lon < 85 로(시험은 레이어 파일이 생길 때까지 skip).
  - **38쪽 태양광 — 범례·글자까지 모두 작은 그림 조각(계획 열린 질문)**: 쪽 안 그림 2,457장, 글자 층은 보이지 않는 글자 → `legendItems`(견본색 = 600dpi 렌더 화소 중앙값 #ee3131·#f47b45·#fdc95f·#d1e187·#89b5a4·#3496c5, 「4.5 - 5.0」 붙임표는 다른 지도처럼 물결표) + 새 키 `labelPoints [{text, xy, size, color}]`(features — 동해 파랑·독도·이어도 종합 해양 과학 기지, 1200dpi 렌더를 보고 글자 가운데 자리; 레이어 Point `type 'label'`, 계획 시험의 `properties.label` 은 실제 꼴 `properties.text` 로). 분류율 74.5%(국경·해안선도 그림이라 미분류 화소 → 이웃 분류로 채움, 경고 그대로 둠). 래스터 해안 번짐은 clip_land 가 Natural Earth 육지로 자름. 묶음 중심 경도 150 은 U4-9.
  - **37쪽 기후 구분**: 기후 래스터가 조각 그림 5장이라 `rasterIgnoreImages`(가장 큰 그림만 지도로 봄)를 켜면 나머지 4장(남부 아프리카 대부분)이 핀 자리로 지워졌다(온대 겨울 건조 7.8pt² · 온난 습윤 0) → 끔(사진 핀은 벡터 #7251a1 이라 이미지만 렌더에 없음). 고산 빗금: 에티오피아·아틀라스는 윤곽 선(#ba703d)인데 **동아프리카 두 곳은 윤곽 선 없이 잘라 그리기(clip) 경로 안 그림** → 새 키 `hatch.clips [[상자]…]`(zones `clip_areas` — `get_drawings(extended=True)` 의 clip 중 scissor 가 상자와 0.6pt 안으로 같은 경로를 면으로, 없으면 멈춤).
  - **37쪽 1월·7월**: 범례 「기온(℃)」 견본 선(#ed1064, y 245·439)이 legendBbox 밖이라 등온선 조각으로 뽑혀 대서양에 선이 그려짐 → 지도 목록 legendBbox 아래 끝 243 → 248, 437 → 442.
  - **39쪽 사막화 — 틀은 넓히지 않음(계획 열린 질문)**: 위험성 5단계 범례(틀 밖 아래 y 594)는 `legendItems`(견본 도형 색 그대로)로 — 틀을 넓히면 「그레이트 그린 월」 원 크기 그래프·제목 글자가 지도 안에 들어 덮개가 더 필요하고, 원 크기 그래프는 U4-7 그래프. 지도의 「매우 높음」 면은 #c22b4a, 견본은 #ee2929 → `aliases`. 범례 묶음 「사막화의 위험성」(legendGroups). 사하라 점무늬(#9e7eb9)는 무늬 채움(pattern)이라 낱낱의 원 도형이 없고, 사헬 빗금(#3989c9 0.21pt)도 잘라 그리기 안 그림 → `dots.clips`(U4-3b `dots_zone` 에 clips 길 — 있으면 그 경로 면을 틀로 자름)·`hatch.clips`, 사헬 위·아래 굵은 파란 선(1.2pt)은 열린 선이라 `hatch.stroke: null`(윤곽 규칙 끔). 그리는 차례 채움 → 점무늬 → 빗금 그대로.
  - **38쪽 종교**: 비거주지 #dcddde(L* 88.1)가 웹 육지 #f2efe9 와 색 차 7.5 → `legendColors` #c3c5c7(L* 79.4, 색 차 15.8 — 1단계 토속 종교와 같은 방식, `printColor` 로 교과서 색이 남음). 다른 분류·레이어는 보정 없음(AfCFTA 협정 서명 전 #bcbec0 18.2, 언어 기타 #a7a9ac 25.9).
  - **39쪽 AfCFTA**: 베냉은 범례에 없는 아주 옅은 연두(#e5f1d4) → 가장 가까운 협정 서명(#e8eeae)으로(`aliases` + 고침). 작은 섬나라 5곳은 교과서가 비준 완료 초록 **동그라미 기호**로 표시 → 나라 분류 비준 완료로. 지부티는 초록 작은 면(14pt²) 확인.
  - **남아공 줄무늬 색 수(계획 열린 질문)**: 세 색(주황 아프리칸스어·분홍 영어·회색 기타 — 넓이 몫 0.31/0.36/0.34, 800dpi 확대 확인).
  - **고침 — 나라 단위 레이어 공통**(`countryOverrides`, 모두 까닭): Q4 `BRT` 분류 없음 · Q5 `FRA`·`ESP`·`PRT`·`SHN`·`YEM` 분류 없음(GBR 은 계획 목록에 있었으나 u4 상자 밖이라 넣으면 「50m 에만 있음」 경고만 생겨 뺌 — 시험은 GBR 도 분류 없음 확인) · Q3 `SOL` = 소말리아와 같은 값(계획 시험은 「SOL 없음」이었으나 Step 2 문구대로 같은 값 — U4-9 합치기 전에도 화면이 맞고, 합친 뒤엔 바탕 지도에 SOL 이 없어 쓰이지 않음) · Q1 `SAH` = 교과서 칠한 대로(언어: 모로코와 같은 아랍어·기타 줄무늬, AfCFTA: 비준 완료 — 모로코도 같은 값이라 U4-9 에서 서사하라 전체를 MAR 에서 잘라도 어긋나지 않음) · 아프리카만 그린 지도에서 틀을 되돌린 면 안에 드는 지중해·서아시아 작은 나라(안도라·몰타·키프로스 등)는 「지면에 없음」 분류 없음, 이스라엘·요르단은 표본이 시나이 쪽에 잡혀 분류 없음.
  - **작은 나라 고침 표**(600~2400dpi 확대):

    | 나라 | 언어 | 자원 | AfCFTA |
    |---|---|---|---|
    | 감비아 | 영어(둘레 세네갈 파랑이 섞임) | 없음 | 비준 완료(확인) |
    | 기니비사우 | 포르투갈어 | 없음 | (다수결 그대로) |
    | 에스와티니 | 영어·기타 줄무늬(넓이 몫은 회색 82%) | 없음(교과서 땅 색) | (다수결 그대로) |
    | 레소토 | 영어·기타 줄무늬(회색 81%) | 레소토(짙은 빨강 확인) | (다수결 그대로) |
    | 지부티 | 아랍어·프랑스어 | 없음 | 비준 완료(초록 작은 면) |
    | 적도 기니 | 프랑스어·포르투갈어·에스파냐어(획 색 #3677bc·#8dc63f·#ccb93f) | 없음 | (다수결 그대로) |
    | 르완다 | 영어·프랑스어·기타(세 색) | 없음 | (다수결 그대로) |
    | 부룬디 | 프랑스어·기타 | 없음 | (다수결 그대로) |
    | 카보베르데 | 포르투갈어(#8dc63f) | — | 비준 완료(동그라미) |
    | 상투메 프린시페 | **포르투갈어**(교과서는 카나리아와 같은 올리브 #aaa037 = 에스파냐어 — 교과서 잘못으로 보고 실제 공용어로, 교사 확인) | 없음 | 비준 완료(동그라미) |
    | 코모로 | 아랍어·프랑스어·기타(짙은 획 #3d8245·#485793·#a7a9ac) | 없음 | 비준 완료(동그라미) |
    | 모리셔스 | 기타(회색) | — | 비준 완료(동그라미) |
    | 세이셸 | 분류 없음(언어 지도에 안 그려짐) | — | 비준 완료(동그라미) |

  - 공유 파이프라인(모두 키가 있을 때만): zones(`rasterRender`·`clip_areas`·`hatch.clips`·`dots.clips`), country_class(`multi.areaInsetPt` → `area_classes`, `legendItems`, 「50m 에만」 경고는 분류 없음 고침이면 안 냄 — 경고 글자만, 보고서·출력 같음), legend(`manual_legend`), features(`legendItems`·`labelPoints`), build_layers(chartSymbols 그래프 자료가 없으면 건너뜀). 도장 입력 아님(pdfkit·atlas_common 안 고침). 지도 목록: `p38-language.cartoucheBbox`, `p37-jan`·`p37-jul` legendBbox(fit 은 그대로).
  - 시험: Python +4(AreaShares 2 — 격자 맞물림 ↔ 넓이 몫·안으로 줄이기, ManualLegend, ClipAreas — 합성 PDF 잘라 그리기 경로 → 면·없는 상자 멈춤) + LabelPoints 1. test_country_class·test_zones 의 `unittest.main()` 줄을 파일 끝으로 옮김(앞에 있어 직접 실행 때 그 뒤 클래스가 안 돌았음 — run-tests 는 원래 모두 돎). Node: `tests/atlas/units/u4.layers.test.mjs` 11(고리 기호 1은 그래프 자료 전 skip) + Step 0 3.
  - 교사 대조표에 올릴 것(U4-10): Q5 속령(레위니옹·마요트 — 언어 프랑스어, 카나리아 — 언어 에스파냐어 #aaa037, 마데이라·세우타·멜리야·세인트헬레나·소코트라)을 칠하지 않음 · 상투메 프린시페 언어 색(교과서 에스파냐어 ↔ 웹 포르투갈어) · 베냉 AfCFTA 색(#e5f1d4 → 협정 서명) · 작은 섬나라 5곳 AfCFTA 동그라미 → 나라 칠하기 · 자원 지도 화면 범례 제목 「주요 생산국」(교과서에 없음) · 우라늄·다이아몬드 고리 가운데 「40.795」「13.800」(마침표) · 종교 비거주지 화면 색 보정 · 사막화 「매우 높음」 지도 색 #c22b4a ↔ 견본 #ee2929(화면은 견본색) · 태양광 범례 「-」 → 「~」 · 줄무늬 색 차례(넓이 몫 차례 ↔ 고침은 범례 차례).
  - **U4-4 회귀**: (Step 0 — src 고침) 조각 u2·u3 다시 → 캡처 41·31장 → compare → `--check`: u2 해시 162개 중 도장만 다름 2(G0 과 같음), 캡처 41장 화소 차 0(heritage 지명 수 100→101 참고), 대조표 0/9/134/24, 조각 2,061.2 KB(+0.945% — Step 0 의 quiz.js 이동은 크기 변화 없음, chartSymbols 는 등록 길이라 u2·u3 조각 밖) — 회귀 없음; u3 다른 파일 0, 캡처 31장 화소 차 0, 대조표 0/26/118/42, 조각 +0.222% — 회귀 없음. (레이어 — 공유 파이프라인 고침) `build_layers --unit u3 all --extract`·`--unit u2 all --extract`(features·country_class 다시) → `sims/atlas-u2-asia|u3-europe/data` git 차이 없음, `--check` u2·u3 모두 「회귀 없음」(u3 vec 39개 해시 같음; u3 은 sims 파일 수정 시각이 바뀌어 「캡처·조각이 입력보다 오래됨」 경고만 — 바이트 같음).
- (U4-4 리뷰 후속, 2026-10-21) 코디네이터 리뷰(중요 1 · 작은 것 3) 반영
  - **중요 — 고리 자리(코디네이터 결정)**: 교과서 지면 둘레 자리를 되돌리면 위 줄 셋이 에스파냐 북쪽 대서양·벨라루스/우크라이나·카자흐스탄 위라 어느 도법·이동에서도 틀림 → 규칙: 고리는 아프리카 둘레 바다(서 대서양·동 인도양·남 기니만/남대서양, 지중해는 37°N 남쪽·유럽 땅에서 떨어질 때만), 교과서 배치(열·차례)와 생산국 해안을 되도록 따름, 기본 보기에서 원판이 아프리카 밖 땅에 닿지 않음. 설정 `items[].lonlat` + `_why`(build_layers `chartSymbolsLayerJson` 은 lonlat 이 있으면 그것, `_why` 없으면 멈춤 — 시험), centerPt 는 교과서 기록으로 남김.
    - 자리: 보크사이트 −21°, 10°(기니 앞바다) · 크롬 −23°, −3°(대서양, 어센션섬에서 1,097km) · 우라늄 6°, −21°(나미비아 앞 — 지중해는 원판이 몰타·크레타에 닿아 못 씀, 최대 생산국 나미비아 13.2%) · 백금 10°, −37°(남아공 서남쪽) · 다이아몬드 62°, 11°(아덴만 동쪽 — 예멘(소코트라)에서 833km) · 코발트 61°, −5°(세이셸 동쪽 — 차고스에서 1,280km) · 망간 52°, −34°(남아공·마다가스카르 남쪽 — 프랑스 남방 영토에서 1,371km). 왼쪽 열(보크사이트·크롬·우라늄·백금)·오른쪽 열(다이아몬드·코발트·망간) 위→아래 차례.
    - 렌더 확인: 단원 상자 [−37, −39, 67, 42] 를 1060×860 지도 칸에 맞춘 정거 방위(중심 20°E) — 약 12.4km/px, 기본 보기 원판 지름 96px(classSymbolPx 상한) ≈ 1,190km → `units/u4/layers/rings-default.png`(Natural Earth 50m, 아프리카 밖 땅은 갈색): 원판이 아프리카 밖 땅에 닿지 않음(보크사이트 원판이 기니·세네갈 해안에 닿음 — 아프리카 땅이라 허용). U4-9 의 실제 기본 보기에서 다시 볼 것.
    - 시험(지금 돎, skip 아님): 설정 자리마다 lonlat·_why, 둘레 상자 lon −30~70 · lat −42~38 안, 가운데가 Natural Earth 50m 나라 면 밖, 아프리카 밖 땅(CONTINENT ≠ Africa, 아프리카 섬나라 5곳은 아프리카로) 꼭짓점에서 700km 넘게, 열·차례. 레이어 시험은 `charts-u4.json`(U4-7)이 없을 때만 skip — 그래프 자료가 생기면 레이어 파일이 없을 때 실패, 레이어 자리 = 설정 자리.
  - 작은 것: ① 위 skip 규칙. ② 종교 4분류 시험(범례 이름·면 분류 넷). ③ **사막화 사하라 점무늬 위 끝 계단 모양은 교과서 그대로** — 잘라 그리기 경로 자체가 계단(곡선 211마디로 그린 계단, `units/u4/layers/desert-clip.png` 에 경로를 겹쳐 확인)이라 매끄럽게 하지 않음(대조표 「같음」으로 볼 것, 필요하면 알려진 차이 메모).
  - 회귀(리뷰 요청 — Step 0 src 고침 뒤 낡음 경고 없애기): `npm run embed` u2·u3 다시 → `compare_shots --unit u2|u3` → `compare` → `--check`: **[경고] 없음**. u2 해시 162개 중 도장만 다름 2, 캡처 41장 화소 차 0(heritage 지명 수 100→101 참고), 대조표 0/9/134/24, 조각 2,061.2KB(+0.945%) — 회귀 없음. u3 다른 파일 0, 캡처 31장 화소 차 0, 대조표 0/26/118/42, 조각 1,430.4KB(+0.222%) — 회귀 없음. npm test: Python 309 · Node 514(통과 513, skip 1 — 고리 레이어, 그래프 자료 전).
- (U4-5, 2026-10-21) 34쪽 지명 — `places.py --unit u4` → `build_places --unit u4 --verify`, 검증 그림 `$ATLAS_WORK/shots/c2/p34-africa.png`
  - **464개**: 나라 76(아프리카 54 — 모두 영문 대문자, 교과서대로 MAURITANIE·ALGERIE·TUNISIE·CÔTE D´IVOIRE·REP. OF SOUTH SUDAN 같은 표기 / 남유럽·서아시아 22 — 영문 없음) · 수도 71(영문 55 = 아프리카 54 + 아테네 Athina; Yaoundé·Lomé·N'Djamena·São Tomé 악센트 낱자는 glue 없이 바로 읽힘) · 도시 212 · 바다·호수 35 · 하천 18 · 섬 17 · 산 13(봉우리 9 모두 높이) · 사막 9 · 평원·고원 5 · 반도·지역 3(아라비아반도·소말리아반도·서사하라) · 곶 5(희망봉 포함). 대양 영문 2(ATLANTIC·INDIAN OCEAN), 다른 이름(alt) 1(통북투 ↔ 팀북투). 경고 0, 안 쓴 기호 1(크레타섬 이름 없는 산 삼각형). 소말릴란드 글자 없음(교과서는 소말리아만 — 하르게이사는 도시).
  - 유럽 표에서 고친 것(설정 `places`, 모두 u4 만): ① 서사하라 갈보라 글자(InterGTOTFB 7.6pt #7e576b) → 새 역할 `region`(kinds.region) — 교사 Q1 답대로 나라 수 밖 「지역」. ② 큰 상자 글자 「사 하 라 사 막」(9.8pt)은 「라」–「사」 사이가 4.66em 이라 landform 9.5~12pt 규칙 joinEm 5.5 → 「사하라 사막」(찾아보기는 8쪽에만 있는 표기). ③ 남회귀선(굵은 고딕 5.7pt, 기호 없는 점 지명으로 잡혔음) → 선 이름 무시 목록에. ④ 희망봉 → land 종류 규칙 `봉$` = other(곶). ⑤ 붉은 글자 #d71920 무시의 까닭을 「국립 공원·유적(Q8)」으로(74조각 — 계획 어림 75). 나라 크기 표(6.8·7.8·9.7·12.7pt)·영문 Helvetica 자홍·Times 대양 영문·소속 표시 (프)(영)(포)(에)(이)(예멘)(앙골라)·DINPro 격자·눈금은 유럽 규칙 그대로 맞음. 폭포(제1~제6폭포·빅토리아 폭포)·수에즈 운하·「○○ 해안」 5개(파란 명조)는 u2 「대운하」와 같이 sea 그대로.
  - **places.py 새 설정 `chain.minDirCos`**(있을 때만 — u2·u3 설정에 없음): 두 조각의 글자 방향 cos 가 이보다 작으면 잇지 않음. 34쪽 하르툼에서 백나일강(아래→위)·청나일강(위→아래)의 끝 「강」 둘이 맞닿아 「백나일강강일나청」 한 지명이 됐음 → u4 = 0 으로 두 하천(둘 다 찾아보기에 없음 — inIndex false). 시험 test_places `test_opposite_glyph_directions_break_chain_only_with_min_dir_cos`(키 없으면 옛 동작 그대로 한 지명).
  - **build_places 새 설정 둘**(있을 때만): `neAlias[이름].nearest`(같은 NAME_KO 가 여럿이면 교과서 자리에서 가장 가까운 하나 — `neCands`, snapToNe·neCheck 공통), `snapAlways {이름: 까닭}`(snapKm 안이어도 옮김). **트리폴리**: Natural Earth NAME_KO 「트리폴리」가 리비아(Admin-0 capital)·레바논(Ṭarābulus)·그리스 셋이라 「이름이 하나뿐」 조건으로 옮기기에서 빠지고, 대조는 최솟값이라 이미 리비아 12km 였다 → `nearest` 로 리비아 하나로 짝(옮기지 않음 — 12km < 30, 찾아보기 34E1 Tripoli). city_controls 의 동명 제외(U4-2)는 그대로.
  - **NE 대조**(neBox [−37, −39, 67, 42], snapKm 30): 옮김 11곳 — snapKm 넘음 6(부라이다 100km·킨샤사 48·호데이다 43·가트 38·가다메스 37·마타디 37) + `snapAlways` 수도 5(지부티 29·방기 29·브라자빌 28·마세루 24·로메 22 — U4-2 도시 기준점 MAD 로 빠진 수도, 교과서가 이웃 수도·좁은 나라 때문에 옮겨 그린 것; 킨샤사도 같은 까닭으로 snapAlways 에 적어 둠). 결과 도시·수도 261곳 **중앙값 2.2km · 90% 14.4km · 최대 30km(수에즈 29.9)** · 40km 넘음 0(옮기기 전 2.7/15.9/30). 유럽(0.8/8.3/26)보다 큰 것은 축척 탓(34쪽 1pt ≈ 12.7km, 26쪽 ≈ 7km — 90% 14.4km ≈ 1.1pt). NE 짝 없음 24(나미브(나미베)·엘아이운·통북투·잔지바르·키스마유·쿠웨이트 등 NAME_KO 표기가 다름 — 위치는 교과서 기호 그대로).
  - **찾아보기 대조**: 105~111쪽 3,346줄 중 34쪽 참조 190줄 — **없음 0 · 다른 쪽에만 0 · 제외 0**(indexExclude·extraNames 비어 있음), inIndex 190/464. 찾아보기로 나눔 2(로메+라고스, 다마스쿠스+바그다드)·이음 1(빅토리아 + 폭포).
  - **격자 칸 대조(새 검사, 시험에만)**: 34쪽 격자 글자 A~I·1~7 은 경위선 10° 칸 가운데에 찍혀 있다(A = 30°W~20°W, 1 = 40°N~30°N, 아래 끝 30~40°S 는 글자 없는 8행 — 희망봉 34E8). 지면 글자 자리 사이 가운데로 칸을 나누면 148/190 만 맞고(위·아래 끝 글자 x 가 경선을 따라 비스듬함) 경위도 칸이 171/190. 지명의 기호 자리만이 아니라 **교과서 글자 자리**(글자 가운데·글자 줄 — 작업 파일 text/places-p34-africa.json 을 fit 으로 되돌림)까지 보면 188/190(17곳은 글자만 칸 안 — 카이로 F1·아스마라 H3·리브르빌 E4 처럼 이름이 기호 옆 칸에 걸침). 남은 2: **가다메스**(교과서 기호 9.86°E·30.01°N = D1, 칸 모서리에서 0.14° — 찾아보기 E1), **코모로**(나라 이름 글자가 섬 북쪽 10°S 위 H5 — 찾아보기는 섬 자리 H6). 둘 다 지명 오류 아님.
  - **작은 나라 이름 자리**(유럽 U3-10 ④ 와 같이 교과서 글자 자리를 그대로 두고 기록 — relocate 안 함): 나라 이름 가운데가 Natural Earth 10m 그 나라 면 밖인 것(면까지 거리) — 상투메 프린시페 570km(섬 서쪽 바다)·적도 기니 415·지부티 348·감비아 310·모리셔스 241·에스와티니 236·코모로 162·기니비사우 146·시에라리온 138·부룬디 93·카보베르데 89·르완다 78·에리트레아 75·세이셸 64·레소토 64·모로코 58, 아프리카 밖 이스라엘 378·몰타 338·바레인 164·쿠웨이트 136·키프로스 123·카타르 93·레바논 78. 크게 확대하면 이름이 나라에서 떨어져 보임.
  - places.json 65.7KiB(67,325 B, 상한 150KB). 시험 `tests/atlas/units/u4.places.test.mjs` 13개(계획 다섯 + 종류별 수·고친 글자·찾아보기 누락 0·격자 칸(아는 차이 2)·neAlias nearest·snapAlways·NE 통계·옮김/용량). npm test: **Python 310 · Node 527**(통과 526, skip 1 — 고리 레이어).
  - georef-cli `--unit u4 --all` 다시(p34 fit 이 U4-4 의 maps_u4.json 고침보다 오래됐다고 build_places 가 멈춤) — fit 12장 모두 바이트 같음.
  - **U4-5 회귀**(places.py·build_places 고침): u2 `build_places --unit u2 --extract`·u3 `--unit u3 --extract`(u3 는 fit 이 maps_u3.json 보다 오래됐다고 멈춰 `georef-cli --unit u3 --all` 먼저 — fit 15장 바이트 같음) → `sims/atlas-u2-asia|u3-europe/data/places.json`·작업 text/places-p16·p18·p19·p26 모두 바이트 같음. `--unit u2 --check`: 해시 162개 중 도장만 다름 2, 캡처 41장 화소 차 0(heritage 지명 수 100→101 참고), 대조표 0/9/134/24, 조각 +0.945% — 회귀 없음. `--unit u3 --check`: places.json 다시 쓰기로 sims 시각이 바뀌어 낡음 경고 → embed·compare_shots·compare 다시 → **[경고] 없음**, 다른 파일 0, 캡처 31장 화소 차 0, 대조표 0/26/118/42, 조각 +0.222% — 회귀 없음. src 는 안 고침.
  - 교사 대조표에 올릴 것(U4-10): ① 수도 기호 6곳을 Natural Earth 자리로 옮김(킨샤사 48km·지부티·방기·브라자빌·마세루·로메 22~29km — 교과서는 이웃 수도·좁은 나라 때문에 옮겨 그림; 킨샤사·브라자빌은 실제로 약 8km 라 확대하면 기호가 거의 겹침) + 도시 5곳(부라이다 100km·호데이다·가트·가다메스·마타디). ② 작은 나라 이름이 교과서 자리(바다 위) 그대로 — 위 표. ③ 서사하라 = 지역 이름(나라 아님). ④ 아프리카 밖 나라·수도는 영문 없음(교과서대로), 나라 영문은 교과서 표기(프랑스어 MAURITANIE·ALGERIE·TUNISIE). ⑤ 백나일강·청나일강·사하라 사막은 찾아보기 34쪽에 없음(지도에는 있음). ⑥ 찾아보기 격자 칸 차이 2(가다메스·코모로 — 위).
- (U4-6, 2026-10-21) 사진·원본 쪽·핀 — Step 0(U4-5 리뷰 후속, 따로 커밋 f24298c) + `config/u4.json photos`, 대조표 `$ATLAS_WORK/units/u4/shots/c3/photos-36~39.jpg`(눈으로 봄)
  - **Step 0**: 파란 명조라도 물이 아닌 이름 — u4 설정 `places.kinds.water` 에 `폭포$|운하$` → other, `해안$` → region(sea 앞). 제1~6폭포·빅토리아 폭포·수에즈 운하 = other, 곡물·노예·상아·황금·후추 해안 = region(sea 35 → 22, region 3 → 8, other 5 → 13). places.json 은 kind 13개만 바뀜(다른 값 같음), 설정만이라 u2·u3 그대로. 앱 꼴: other = 회갈색 #6b5d52 · 글자 벌림 1.6, region = 지형 갈색 #7d5b34 · 벌림 3(atlas.css·renderer SPREAD — 엔진 안 고침). U4-5 기록의 「sea 그대로」는 이것으로 바뀜. 시험 +1.
  - **사진 35장(실측 = 계획 어림)**: 지형 7·기후 4·문화 6·잠재력 5·협력 2·지속가능 11. 쪽별 36쪽 7 · 37쪽 4 · 38쪽 11(문화 6 + 주제도 활동 도시 4 + 면적 비교 1) · 39쪽 13(협력 2 + 지속가능 11), 34·35쪽 0. 설계 「지속가능 13」(적정 기술 5 어림 포함)과 다름은 쪽 목록 표대로.
  - 후보: 34쪽 그림 배치 13,273개(4pt² 미만 10,996 · 4~10pt² 931) → u4 `candidate.minAreaEachPt2 10`. 후보 34쪽 6 · 35쪽 22 · 36쪽 13 · 37쪽 7 · 38쪽 12 · 39쪽 18, 안 덮임 0(4 일 때는 3·17·11·7·12·18 — 작은 조각이 덩어리를 덜 이어 조금 늘었을 뿐). 제외: 34·35쪽 전체(지도 바탕·색칠 장식), 36쪽 지형 바탕·쪽 머리 조각, 37쪽 기후 래스터 3장, 38쪽 피라미드 인라인 그림 2(U4-7)·태양광 래스터.
  - **교사 Q7 면적 비교** = `p38-11`(잠재력) 벡터 삽화를 200dpi 로 렌더해 자름. 삽화 왼쪽 아래에 제목·설명 글이 들어앉아 있어 글이 잘리지 않게 왼쪽을 x 553 까지 → 그림 안에 그 글이 그대로 보이고, 왼쪽 위에 주제도 활동 제목 띠(연보라) 끝이 조금 낀다(대조표 항목).
  - **새 키 `imagesOnly`**(extract_images `render_item` — 있을 때만 `pdfkit.render_clip(images_only=True)`, 없으면 옛 호출 그대로; pdfkit 은 안 고침): 38쪽 오려 낸 그림(가면·피카소·에이시·타진·카사바·푸푸)은 설명 글이 그림 위·옆에 겹치고, 39쪽 머니 메이커 펌프·큐 드럼은 사진의 흰 바탕 자리에 제목·설명이 인쇄돼 있어 래스터만 렌더(바탕은 흰색). 왕가리 마타이도 imagesOnly 지만 소제목 틀 파란 선이 인쇄 평탄화로 사진 띠 조각에 구워져 있어 남음(나뭇잎을 살리려 위를 자르지 않음, 오른쪽 둥근 모서리만 x 744.3). 이태석은 위를 틀 아래 y 90.6, 펌프는 y 258 부터(틀 조각 구움). 의제 2063 은 오른쪽을 x 387.2(옆 소제목 틀 선·점 빼기 — 「굿 거버넌스」 원 1.8pt 잘림). 시험 test_images `RenderItem` 1.
  - 카사바·푸푸는 한 그림 덩어리(평탄화 띠 3) → 두 카드로 나눔: 카사바 [213.5, 421.5, 313, 500](뿌리 끝까지 — 오른쪽에 접시 테두리 조금), 푸푸 [289, 421.5, 376, 506](왼쪽 아래 뿌리 끝 조금). 겹쳐 자른 까닭은 `_bbox`.
  - 같은 설명 두 카드(유럽 U3-6 규칙): 가면·피카소, 카사바·푸푸, AU 본부·의제 2063(의제 2063 그림만 creditBox (AU, 2023) — 그림 안에도 보임). 제목만 있는 사진(도시 4·사막화 2·공정 무역 2)은 그 글을 caption 으로. 37쪽 오렌지 농장 두 줄 제목은 둘째 줄이 번호 원 아래에서 시작 → `titleOverride`「남아프리카 공화국의 오렌지 농장」(유럽 29쪽과 같음). 37쪽 사진 카드의 출처 「(『이과연표』, 2023)」·「(climate-data.org, 2023)」는 기후 그래프 출처라 사진 credit 에 넣지 않음(U4-7·U4-8 그래프 쪽). 「烋」·깨진 글자 0, ‘ ’ 짝 맞음(36쪽 킬리만자로·나미브·빅토리아, 39쪽 의제 2063·그레이트 그린 월).
  - **핀 11**(36쪽 물방울 7 = 17×19.5pt, 37쪽 4 = 15.5×17.7pt — 37쪽 `w [14,17] h [16.5,19]`, 사진 번호 원 9.4×10.7 은 크기로 빠짐), 모두 번호 숨김이라 pinNear 짝, 짝 못 지은 핀 0·경고 0:

    | 사진 | 짝 지명(places) | 짝 거리 km(상한) | 핀 경위도 | 실제 자리와 |
    |---|---|---|---|---|
    | p36-1 나일강 | 나일강(하천 글자) | 341 (450) | 33.05, 24.11 | 아스완 약 15km |
    | p36-2 킬리만자로산 | 킬리만자로산 | 82 (110) | 37.59, −2.36 | 봉우리 약 83km |
    | p36-3 사하라 사막 | 사하라 사막(지형 글자) | 1,127 (1,300) | 12.48, 24.78 | — (다른 핀은 2,000km 넘게) |
    | p36-4 나미브 사막 | 나미브 사막 | 561 (730) | 14.62, −20.05 | 나미비아 북부 해안 |
    | p36-5 테이블 마운틴 | 케이프타운(places 에 없음) | 51 (70) | 18.79, −33.57 | 약 50km |
    | p36-6 빅토리아 폭포 | 빅토리아 폭포 | 148 (200) | 26.07, −17.83 | 폭포 약 25km |
    | p36-7 그랑칭기 | 마다가스카르(나라 글자, 칭기 없음) | 304 (400) | 44.99, −18.63 | 베마라하(44.7, −18.7) 약 30km |
    | p37-1 흙벽돌집 | 카이로 | 46 (60) | 30.87, 29.66 | — |
    | p37-2 열대 우림 | 키상가니 | 55 (75) | 25.31, 0.09 | — |
    | p37-3 야생 동물 대이동 | 도도마(그래프 도시, 세렝게티 없음) | 261 (340) | 33.39, −6.25 | 도도마 서쪽 타보라 쪽 — 세렝게티와도 다름 |
    | p37-4 오렌지 농장 | 케이프타운 | 98 (130) | 18.65, −33.06 | 케이프타운 북쪽 |

    넓은 지형 글자(나일강·사하라 사막·나미브 사막)는 글자 가운데와 짝짓느라 거리가 크다 — 헝가리안 전체 짝이고 상한 안 다른 핀이 없어 모호하지 않음(까닭은 항목 `_pinNear`).
  - 크기: 사진 jpg 462KiB + webp 308KiB = 0.75MB(상한 4MB), 모두 150dpi(벡터 그림 2장 — 면적 비교·의제 2063 — 200dpi). 원본 쪽 p034~p039 110dpi 각 168~188KiB(171,623~192,643 B, 품질 55~80 — 34쪽 55), 합계 1.07MiB. photos.json 11.2KiB.
  - **U4-8 에 넘김(원본 쪽 부분 보기 bbox)**: 38쪽 주제도 활동 상자 [30, 524, 750, 692](제목 띠 [34, 542.4, 734.9, 558.5] · 문항 ①② y 565~588 · 도시 사진 · 면적 비교 삽화 위 끝 524.6), 39쪽 주제도 활동 상자 [402, 499, 750, 692](연노랑 바탕 [402.5, 499.5, 788, 731.3] 은 쪽 끝까지라 오른쪽·아래를 지면 글 끝에서 자름 — QR [~674, 535, 742, 590] 포함). 쪽 이미지는 34~39 모두 있음.
  - 회귀(extract_images 를 고침): u2·u3 `--photos --pages` 다시 → content/atlas/u2|u3/photos.json·docs/assets/atlas/u2|u3 git 차이 없음(render_item 으로 옮긴 뒤 한 번 더 — 같음, u4 도 해시 같음). `--unit u2 --check`: 처음에 낡음 경고(조각·캡처가 U4-5 places 다시 쓰기보다 오래됨) → embed·compare_shots·compare 다시 → [경고] 없음, 해시 162개 중 도장만 다름 2, 캡처 41장 화소 차 0(heritage 지명 수 100→101 참고), 대조표 0/9/134/24, 조각 +0.945% — 회귀 없음. `--unit u3 --check`: [경고] 없음, 다른 파일 0, 캡처 31장 화소 차 0, 대조표 0/26/118/42, 조각 +0.222% — 회귀 없음.
  - 시험: `tests/atlas/units/u4.photos.test.mjs` 7(주제·쪽별 수, Q7 카드, 핀 11·번호 숨김 짝, 핀이 아프리카 안·서로 떨어짐, 대표 핀(킬리만자로·케이프타운 1° 안 등), 글 — 烋·깨진 글자·따옴표 짝·titleOverride·같은 설명 카드, 파일 크기) + test_images 1. npm test: **Python 311 · Node 535**(통과 534, skip 1 — 고리 레이어).
  - 교사 대조표에 올릴 것(U4-10): ① 면적 비교 카드에 제목·설명 글과 제목 띠 끝이 그림 안에 보임. ② 오려 낸 그림 8장은 그림만(흰 바탕) — 교과서의 겹친 글 없음, 마타이 사진 위 파란 선은 남음. ③ 카사바·푸푸를 두 카드로(겹친 가장자리), 가면·피카소·AU·의제 2063 은 같은 설명 두 카드. ④ 37쪽 야생 동물 대이동 핀이 도도마 서쪽(교과서대로 — 세렝게티 아님). ⑤ 사진 카드에 기후 그래프 출처를 넣지 않음. ⑥ 39쪽 그래프 제목 「그레이트 그린 **윌** 프로젝트」(본문·사진은 「월」) — 교과서 오타로 보임(U4-7·U4-8 issues.md 후보).
- (U4-7, 2026-10-21) 그래프 숫자 15개 — `config/u4.json charts.items`, 경고 0, `units/u4/tables/charts-u4.json`(19,741 B) + 도장, 대조표 `units/u4/shots/c4/charts-37~39.png`(눈으로 봄 — 교과서 그림과 다시 그린 그림이 맞음)
  - 그래프 표:

    | id | 형식(출력 type) | 값 출처 | 정밀도 |
    |---|---|---|---|
    | p37-cairo · p37-capetown | climograph | 97쪽 표 printed(잰 값과 차 기온 0.19·0.16℃, 강수 1.3·0.7mm) | 인쇄값 |
    | p37-kisangani · p37-dodoma | climograph | 도형 측정 measured(notInTable) | 기온 ±0.218℃ · 강수 ±1.088mm |
    | p38-bauxite·uranium·diamond·chromium·cobalt·platinum·manganese | pie + ring 0.51 | 조각 밖 인쇄 % printed(잰 각과 차 ≤ 0.01%p, 각 합 100.0) | 0.05(인쇄 소수 한 자리) |
    | p38-pyramid-world · p38-pyramid-africa | pyramid(읽개 pyramidRaster) | 400dpi 렌더 화소 measured(합 99.99 · 99.66) | ±0.033%(화소 0.179pt) |
    | p39-afcfta | table(읽개 figure) | 인쇄 글자 6칸 | — |
    | p39-greenwall | bubbleRow | 인쇄 값 printed(지름 √값 비 확인 — 최대 0.40pt, 지부티) | — |

  - **기후 4**: 37쪽 그래프 4개는 유럽 29쪽과 같은 틀·같은 자리라 u3 상자를 그대로(도시·기후·출처 글자 실측으로 확인). climate = 제목 둘째 줄(사막·열대 우림·사바나·지중해성) — 97쪽 표 zone 과 같음. 새 키 `barsByMonth`(있을 때만): 카이로 강수 막대 8개·도도마 10개(비가 거의 없는 달은 막대가 없음)라 옛 길은 「12개여야 함」 경고와 달이 밀린 비교(카이로 7.9mm 어긋남)를 냈다 → 막대를 가로 위치가 가장 가까운 기온 점(달)에 붙이고 빈 달은 잰 값 0, 출력 `noBarMonths`(카이로 5~8 = 표 0.0mm, 도도마 7·8). 97쪽 표 u4 사본 = u2 표와 바이트 같음.
  - **고리 7 — `read_donut` 에 `valuesOutside` 길**(키가 있을 때만 `read_donut_outside` 로, 없으면 유럽 코펜하겐 옛 길 그대로): 38쪽 고리는 조각마다 가운데에서 뻗은 **부채꼴 채움** 위에 흰 원(r 12.57pt)을 덮어 구멍을 낸 그림이다(안쪽 호가 없음 — 유럽 코펜하겐은 조각마다 안쪽 호). 그래서 가운데·안쪽 반지름 = `holeColor` 원, 조각 = 색마다 가장 큰 채움(넓이 5pt² 미만 — 지도 땅 부스러기 #ede9e4 — 은 뺌), 각 = 바깥 호가 쓸어 간 각, 차례 = 12시에서 시계 방향 시작 각. 인쇄된 % 는 조각 밖이라 구멍 밖 수 글자를 (글자 시계 각 ↔ 조각 가운데 각)/10° + |값 − 잰 %| 헝가리안 짝(다이아몬드 1.5·0.8 처럼 좁은 조각 둘의 글자도 바르게 갈림). 조각 이름 = `namesFrom {layer: 'p38-resources', otherColor '#ede9e4', otherName '기타'}` — 그 레이어 설정 `legendItems` 색과 조각 색이 똑같음(ΔE 0). 이 때문에 extract_tables ctx 에 `layers`(단원 설정 layers)를 더함(다른 읽개는 안 씀). 가운데 글자 = 구멍 안 줄(cell_text — 「2020」+「년」을 붙여 읽음), `center` 로 인쇄 그대로(우라늄 「40.795」·다이아몬드 「13.800」 → issues.md 1). ring = 구멍/바깥 반지름 0.51(U4-4 어림 0.48 은 지름 52.5pt 상자 기준이었음). bbox 는 가운데 ± 30pt(부채꼴 rect 가 곡선 조절점까지라 ± 27 이면 다이아몬드 「기타」 조각이 상자 밖으로 빠졌음), labelBox ± 36pt(망간만 아래 출처 「2023」 피해 305).
  - **피라미드 2 — 새 읽개 `pyramidRaster`**(유럽 30쪽 래스터 원 검출과 같은 꼴 — 설정 type 이 있을 때만): 막대는 인라인 그림이라 벡터 채움이 없다(images_only 렌더에서도 사라짐 — 그림 지우개가 xref 0 그림까지 지움). plotBox 를 400dpi 로 작업 폴더 임시 PNG 에 렌더 → 막대 색(설정 = 범례 「남」「여」 글자 색 #fcbb76·#f4858e, 렌더 화소 #fcbc77·#f3868f — ΔE ≤ 12) 가면 → 나이 글자 줄마다(세로 가운데 ± 0.8pt) 가운데 0 선 열에서 바깥으로 이어진 막대 화소(틈 4화소까지 — 「남」「여」 글자도 막대 색이라 이어진 것만, 0 선 회색 눈금선이 막대 위에 겹쳐 시작 허용 6화소) 끝 + 가장자리 화소의 덮인 몫(막대 색 ↔ 두 칸 바깥 배경 사이 투영)의 중앙값 → 가로축. 가로축은 세로 눈금선 벡터 7개(653.1~718.7)에 붙은 눈금 글자만(`xRequireSnap`): 양끝 「8」은 눈금선이 없고 오른쪽 8 은 「(%)」에 밀려 3pt 왼쪽(issues.md 7). 출력은 u2 pyramid 꼴 그대로(type 'pyramid', 18구간, series 남·여 measured + precision 0.033). 제목 = 소제목 「아프리카의 인구 구성」, `subtitle` = 「세계(2021년)」·「아프리카(2021년)」(흰 글자 띠). 아프리카 85세 이상 남자는 막대가 약 0.03%p 라 0.0(1200dpi 로 확인).
  - **원 크기 줄 — 새 읽개 `bubbleRow`**: 보라 원(#9e7eb9) 채움 11, 이름 줄·값 줄을 가운데 x 로 짝, 값은 인쇄 글자. 지름 비 확인은 `check.circles`(지름·기대 지름·지름에서 되돌린 값) + `warnDiamPt 0.5` 넘으면 경고 — 작은 값 넷(말리·모리타니·나이지리아·지부티)이 최소 크기로 그려져 0.12~0.40pt 큼(경고 아님, issues.md 6). 단위는 위첨자 「2」 때문에 설정 `unit` 「십 km²」. 제목은 인쇄 그대로 「‘그레이트 그린 윌 프로젝트’…」 — 1,200dpi 렌더로도 「윌」이라 교과서 오타(본문·사진 「월」, U4-6 발견 → issues.md 2).
  - **AfCFTA 표** — 유럽 `figure` 읽개 + 칸 키 `groupBox`(있을 때만 — 칸 머리 글자 「2021년」「2030년 목표」를 이름 앞에)·칸별 `nameLine`(없으면 그래프 값 — 옛 동작 그대로). 「무역」+「2」(12.4pt)는 틈이 0.15em 안이라 붙어 replace. 범주 「2021년 국가·인구·구매력 / 2030년 목표 아프리카 내·인구·구매력」, 값 「47개국·13억 명·3.4조 달러 / 무역 2배 성장·17억 명·6.7조 달러」. 그림 자체 제목·출처가 없어 소제목·지도 출처(AfCFTA, 2023)를 씀.
  - 피라미드 출처 글자는 「(UN, 「세계 인구 전망」, 2022)」로 읽힘(쪽 렌더도 홑낫표 꼴 — 37쪽 『이과연표』는 겹낫표로 바르게 읽힘). 손대지 않음.
  - 대조표(chart_sheets.py, 키가 있을 때만): 고리(ring)는 구멍 + 가운데 글자, 조각 색 = 자료 color; bubbleRow 그림 길 새로. u2·u3 그래프에는 ring·bubbleRow 가 없어 그대로.
  - **고리 레이어**: `build_layers --unit u4 p38-resource-charts` → `sims/atlas-u4-africa/data/layer-p38-resource-charts.json`(2.6KB, 고리 7 — series·ring 0.51·center 는 그래프 자료에서, 자리는 U4-4 리뷰 lonlat). u4.layers 시험의 skip 이 없어지고 13개 모두 통과.
  - 시험: test_tables `ChartsU4` 8(15개·경고 0·validate, 기후 4 × 12·12 + 표 값·noBarMonths, 고리 합 100·ring·기타·다이아몬드 차례·가운데 글자 원문, 피라미드 18구간·합 100±2·precision·아프리카 0~4세 > 세계, 원 크기 줄 2,006…0.13·지름 비·「윌」, AfCFTA 표, 잰 값 precision, 결정성). npm test: **Python 319 · Node 535(skip 0)**.
  - **회귀**(charts_read·extract_tables·chart_sheets 고침 — 도장 입력이 아닌 단원 그래프 스크립트, 단 charts 도장은 코드 해시라 u2·u3 `charts-*.stamp.json` 은 정당하게 새 값): `extract_tables --unit u2|u3 --climate --charts` → `charts-u2.json`·`charts-u3.json`·`tables/climate-world.json`·`units/u3/tables/climate-world.json` md5 같음. `regress_unit --unit u2 --check`: [경고] 없음, 해시 162개 중 도장만 다름 2(G0 과 같음), 캡처 41장 화소 차 0(heritage 지명 수 100→101 참고), 대조표 0/9/134/24, 조각 +0.945% — 회귀 없음. `--unit u3 --check`: [경고] 없음, 다른 파일 0, 캡처 31장 화소 차 0, 대조표 0/26/118/42, 조각 +0.222% — 회귀 없음. src 는 안 고침.
  - 교사 대조표에 올릴 것(U4-10): ① 우라늄·다이아몬드 고리 가운데 「40.795」「13.800」 원문 그대로. ② 피라미드 2 = 잰 값(값이 인쇄되어 있지 않음, ±0.03%p). ③ 키상가니·도도마 = 잰 값(97쪽 표에 없음). ④ 카이로·도도마 막대 없는 달 = 0mm. ⑤ 「그레이트 그린 윌」 그래프 제목 오타 그대로. ⑥ 원 크기 그래프 작은 원 4개가 실제 비보다 큼(웹 bubbleSvg 는 지름 ∝ √값·최소 2px — 교과서와 같은 모양은 아님). ⑦ AfCFTA 표 카드 범주 이름 「2030년 목표 아프리카 내」 / 값 「무역 2배 성장」(그림 두 줄을 칸 첫 줄·나머지로 나눔). ⑧ 고리 조각 이름(생산국)은 지도 범례 색으로 붙임 — 교과서 고리에는 나라 이름이 없음.
- (U4-8, 2026-10-21) 주제 내용 — Step 0(U4-7 리뷰 후속, 따로 커밋 2420f93) + `content/atlas/u4/topics.json`·`overrides.json`·`coloring.json`, 생성물 `sims/atlas-u4-africa/data/{topics,charts}.json`·`layers.js`, 검토 덤프 `$ATLAS_WORK/units/u4/shots/c5/topics.md`(쪽 렌더 34~39 와 대조)
  - **Step 0**: `charts_read.py` 기후 그래프 강수 막대 바닥 검사를 `_warn_bar_base` 하나로(barsByMonth 길·옛 길 공통 — 경고 차례 그대로: 수 → 겹친 달 → 바닥). 피라미드 화소 길을 순수 함수 `_color_mask`(Lab ΔE 가면)·`_row_edges_px`(행마다 막대 끝 + 가장자리 섞인 몫)로 빼고 만든 배열 시험 4(`test_tables.PyramidRasterSynthetic`: 색 허용치 안/밖·반 섞인 화소, `_bar_run` 틈·시작 허용, 가장자리 59.5 화소 → 4.05%, 읽개 끝까지 모의 — 틈 3화소 건넘·틈 6화소에서 끊김·회색 0 선 건넘·막대 없는 줄 경고). `charts-u2.json`·`charts-u3.json`·`charts-u4.json`·`climate-world.json`(u2·u3 사본) md5 전후 같음.
  - **주제 8개**(글 67칸 모두 출처 상자 → `extract_text --fill`, 손으로 둔 것은 목차 제목·「학습 목표」뿐 — `test_text_u4` 가 막음):
    - 일반도(34) — 제목·도법 글, 미확정 국경 레이어. 색칠하기(35) — 목표·개관(제목+본문)·활동·퀴즈, 미확정 국경 레이어. 질문(36·38·39쪽 머리)·학습 목표(35·37·38·39쪽)는 유럽처럼 펼친 면 주제마다 되풀이.
    - 지형(36) — 핀 7(번호 숨김), 활동하기 1, 출처 「(naturalearthdata.com, 2023)」(소제목 블록 credit). 기후(37) — 레이어 3(범례 제목·선 범례·출처 지면 그대로), 그래프 마커 4(번호 숨김), 활동하기 2.
    - 언어·종교와 문화(38 ①②) — 바로가기 언어·종교(지도 제목 labelSrc), 종교 범례 제목 「지역별 종교 분포 비중」(언어 지도는 범례 제목 없음 — 교과서대로), 본문, 사진 6, 원본 쪽 부분 [30,75,386,530] + 쪽 전체.
    - 자원과 지역 잠재력(38 ③ + 주제도 활동) — 바로가기 자원·태양광, 자원 = countryClass + 고리 기호(chartSymbols) **같은 label 이라 한 묶음**, 피라미드 그래프 블록 2(한 장씩, 설명 글은 첫 블록), 자원·태양광 본문(view), 주제도 활동 = 문항 카드 2(첫 문항에 활동 제목) + 도시 사진 4 + 면적 비교 카드(p38-11, 교사 Q7) + 원본 쪽 부분 [30,524,750,692](U4-6) + 쪽 전체.
    - 지역 협력(39 ①②) — AfCFTA 레이어, 사진 2(AU 본부·의제 2063 — 같은 설명 두 카드), AfCFTA 표는 **그래프 블록**(`chart` + src 본문, 아래 판단). 지속가능한 발전(39 ③④⑤ + 주제도 활동) — 사막화 레이어(범례 제목 「사막화의 위험성」), 원 크기 그래프 블록(본문을 src), 사진 2+3+4, 주제도 활동 = 문항 카드 2 + 공정 무역 사진 2 + 참고 사이트(글 블록 role link, 주소 글자 그대로) + 원본 쪽 부분 [402,499,750,692] + 쪽 전체.
  - **마커 위치**(1단계 C5 · 유럽 06 교훈 — 점 지명으로만, 넓이 글자로는 옮기지 않음): 기후 그래프 마커 4곳 모두 그래프 도시로(카이로 46km · 키상가니 55 · 도도마 261 · 케이프타운 98 — 유럽처럼 그래프 도시는 늘 옮김), 지형 킬리만자로산 82km → 34쪽 산 위치(실제 봉우리와 거의 같음, 베수비오산 56km 꼴), 테이블 마운틴 51km → 케이프타운(places 에 테이블 마운틴이 없고 산이 케이프타운 시가지 뒤 — 유럽 특집 04 → 브뤼셀 꼴). 옮기지 않은 것: 나일강(하천)·사하라·나미브 사막·그랑칭기(마다가스카르 — 넓이 지명), **빅토리아 폭포**(places 「빅토리아 폭포」는 기호 없는 글자 자리 [25.1, −18.79] 로 실제 폭포에서 약 100km — 교과서 핀이 실제와 약 25km 라 핀 그대로). 테이블 마운틴(지형)과 케이프타운(기후)은 다른 주제라 같은 자리여도 겹치지 않음.
  - **색칠하기**(`extract_text --labels` → `coloring_quiz --unit u4 --write`): 35쪽 나라 글자 57(KCCChassam 12.8pt 30 · 8.8pt 27)·수도 손글씨 27(KyoboHandwriting 7.5pt) — u2 글꼴 값 그대로 맞음. **계획 어림의 손글씨 수도 32·조각 「로」는 실측에 없다**(27개 모두 한 덩어리 이름, 같은 글꼴 활동 글 9pt·글머리 ● 5pt 는 크기로 빠짐 — 시험). 결과 **55 = 나라 54 + 서사하라 「지역」 1**, 경고 0. 수도 출처 printed 27 · places 26 · places+ne 1(모로코).
    - 설정(u4 만): `joinLabels`(「ㅋㄱ ㅁㅈ / ㄱㅎㄱ」 콩고 민주 공화국, 「ㄴㅇㅍㄹㅋ / ㄱㅎㄱ」 남아프리카 공화국 — 둘째 줄이 같은 글자라 쪽 흐름 바로 뒤와 잇고, 지면에서 위아래로 맞닿은 두 줄인지 시험), `capitalByNe`, **새 키 둘(coloring_quiz, 있을 때만)**: `regions {SAH}` → 출력 `region: true`·이름은 places `regionKinds`(기본 region) 지명에서도 찾음(34쪽 서사하라는 U4-5 에서 region), 지면 글자에 없으면 경고 / `capitalByNe` 이고 면 안 places 수도가 없으면 그 나라 Natural Earth 「Admin-0 capital」에서 nearKm 안 가장 가까운 places 수도(`places+ne`) — **라바트**가 Natural Earth 10m 모로코 면 밖(해안선에서 바다 쪽 2km, NE 자체 라바트 점도 면 밖)이라 「면 안 places 수도 없음」 경고였음. `noCapital {SAH}`(교사 Q1, 수도 「—」).
    - **계획과 다른 것 — `isoByLabel` 안 씀**: 계획은 COG·CAF·SAH 를 적으라 했으나 Natural Earth NAME_KO 가 「콩고」(ㅋㄱ)·「중앙아프리카 공화국」(ㅈㅇㅇㅍㄹㅋㄱㅎㄱ)·「서사하라」라 초성이 글자와 같아 그대로 짝지어짐 — 필요 없는 키를 두지 않고 시험으로 COG·CAF·SAH 짝을 고정. 「가 봉」(글자 사이 공백)도 key 가 공백을 지워 가봉.
    - **같은 초성 「ㄱㄴ」**: 기니(8.8pt, 코나크리 옆 x 141)·가나(12.8pt, x 223 — 계획 메모의 크기는 거꾸로였음)는 글자 자리에서 가장 가까운 초성 같은 나라 면으로 갈림. 시험 둘: 실제 결과(기니 서쪽·가나 동쪽, 수도 코나크리·아크라) + `buildColoring` 합성(실제 35쪽 fit·두 글자 자리에 가짜 면 — 면을 맞바꾸면 짝도 바뀌고 글자 차례를 뒤집어도 같음).
    - **작은 나라**: 54 + 서사하라 모두 Natural Earth 50m·10m 에 있고 10m 면이 u4 단원 상자(10a) 안(시험). 110m 에는 섬나라 5(코모로·카보베르데·모리셔스·상투메 프린시페·세이셸)가 없다 — 세계 보기에서는 안 보이고 50m 로 넘어가야 보임(U4-9 smallMetric area 동그라미·확대 창 판단 거리). 감비아·에스와티니·레소토·지부티는 110m 에도 있음. 글자가 다른 나라 면 위(labelIso): 부룬디·르완다(COD 위)·레소토·에스와티니(ZAF 위)·서사하라(MAR 위 — NE SAH 는 방벽 동쪽 띠라서, U4-3f 발견).
  - **판단 — AfCFTA 표는 카드가 아니라 그래프 블록**: 계획은 「AfCFTA 표 카드(card + chart)」였으나 카드는 title 이 필수라 소제목 「아프리카 대륙 자유 무역 지대(AfCFTA)」를 또 쓰게 된다. 유럽 30·31쪽처럼 `{type:'chart', ref, src(본문)}` — 표 제목은 그래프 자료(지면 소제목)에서, 글은 본문. 의제 2063 도 카드 대신 사진 블록 둘(U4-6 같은 설명 두 카드 그대로).
  - **판단 — 고리 그래프 7 의 참조**: 고리는 지도 위 기호(누르면 카드)로만 보이고 사이드바 블록이 없어 build_content 의 「어느 주제도 참조하지 않음」 경고·G5 계약 시험 「쓰지 않는 그래프」에 걸렸다. 사이드바에 고리 7개를 늘어놓지 않고, **chartSymbols 레이어 항목의 chart 를 참조로 셈**(build_content `resolveLayers` — 없는 그래프는 경고, `unitContract.test.mjs` chartRefs 도 같게). u2·u3 에는 chartSymbols 레이어가 없어 그대로(옛 coloring_quiz 로 돌린 u2·u3 build_content 「같음, 그대로」 확인).
  - **판단 — 미확정 국경 레이어 종류 `area`**: U4-3f 의 `disputedLayerJson` 은 `layerType: 'line'` 이었으나 앱에 'line' 레이어 종류가 없고(layerRef — 'line' 이면 「모르는 레이어 종류」) 주제 type ≠ layerType 이면 build_content 가 경고 → `layerType: 'area'`(면 레이어가 선 Feature type 'line'·dashed 를 그림 — 1단계 카슈미르 주장 국경과 같음, U4-3 기록의 「주제 항목은 type 'area'」를 자료에 맞춤). u4 레이어 한 파일만 바뀜, 시험 한 줄.
  - **고침(overrides) 2 — 둘 다 칸이 없던 것(from null)**: ① 자원 범례 제목 「주요 생산국」(U4-4 결정 — 교과서에 범례 상자가 없음, 대조표 「알려진 차이」). ② 태양광 범례 제목 「1일당 태양광 잠재력 (kWh/kWp)」 — 범례·글자가 모두 그림 조각이라(U4-4) 출처 상자로 못 뽑음, 600dpi 렌더(`units/u4/text/dump/solar-legend.png`)로 읽어 두 줄을 한 줄로. 없으면 범례 제목이 지도 제목이 되어 값 단위가 빠짐. 깨진 글을 고친 것은 0(34쪽 제목 「아프리카」는 글자 사이 공백 없음, 「烋」·?글리프·h·LN 0, ‘ ’ 짝 맞음).
  - 출처 대조(`content.expectCredits` 14개): 36쪽 1 · 37쪽 4 · 38쪽 5 · 39쪽 4. 38쪽 태양광 「(globalsolaratlas.info/map, 2023)」은 여는 괄호와 주소 글자의 세로 가운데가 반올림으로 다른 줄(511·512)이라 `printed_credits` 가 못 이음 → `notPrinted`(유럽 28쪽 꼴). 39쪽 「(AU, 2023)」은 의제 2063 그림 출처(사진 creditBox). 그래프 출처 글자가 계획 표의 『자원 데이터 파일』이 아니라 지면은 『지리 데이터 파일』(그래프 자료 그대로).
  - 태양광 바로가기 범위는 [−5.8, −47.0, 293.7, 60.1](frameView 가 틀 가운데 경도 기준으로 이어 붙여 동쪽 끝이 180 을 넘음) — 묶음을 고르면 topic.js 가 중심 경도를 먼저 옮긴 뒤 맞추므로 U4-9 `centerLonOf {'layer-p38-solar': 150}` 와 함께 봐야 함(u2 p24-trade 는 main.js `BOUNDS_OF` 로 따로 줌 — U4-9 캡처로 정할 것).
  - 생성물: topics.json 39,145 B · charts.json 12,411 B(15개 모두 참조) · layers.js(레이어 11). issues.md 8번(39쪽 AfCFTA 본문 「약 3조 달러」 ↔ 수치 그림 「3.4조 달러」).
  - 공유 스크립트: `coloring_quiz.mjs`(regions·면 밖 수도 — 도장 입력), `build_content.mjs`(chartSymbols 참조), `build_layers.mjs`(disputed layerType). **coloring_quiz 는 u2·u3 coloring 도장 입력**이라 u2 content 시험(`content.test.mjs` 가 loadInputs 로 도장 확인)이 멈췄다 → 유럽 U3-8 과 같이 `coloring_quiz --unit u2|u3 --write` 로 **inputsHash 한 줄만** 새 값(나머지 바이트 같음 — git diff 2줄), u2·u3 build_content 「같음, 그대로」. 계획 공통 사항 「공개본은 다시 만들지 않는다」는 도장 줄만 바꾸는 것까지 막지는 않는다고 봄(과제 규칙 「u2/u3 content must stay identical, apart from stamps」).
  - 시험: `tests/atlas/units/u4.content.test.mjs` 17(계획 다섯 + 묶음·바로가기·미확정 국경·그래프 참조·레이어 글·마커 위치·색칠하기 54+1/수도·「ㄱㄴ」 실제·합성·새 키 합성·두 줄 이름·50m/10m/110m·출처 14·깨진 글자·고침 둘), `scripts/atlas/tests/test_text_u4.py` 6(dumps 형식·손글 없음·주제도 활동 블록·원문 대조 `--check`·출처 지면 대조·35쪽 글자 수), G5 계약 시험 u4 7(조각 크기는 U4-9 까지 skip — chartRefs 에 chartSymbols 항목), layers 1줄. npm test: **Python 329 · Node 559(통과 558, skip 1 — u4 조각)**.
  - **회귀**: `regress_unit --unit u2 --check` [경고] 없음, 해시 162개 중 도장만 다름 2(coloring.json·basemap.json — G0 과 같은 두 파일), 캡처 41장 화소 차 0(heritage 지명 수 100→101 참고), 대조표 0/9/134/24, 조각 +0.945% — 회귀 없음. `--unit u3 --check` [경고] 없음, 해시 193개 중 다른 파일 1 = `content/atlas/u3/coloring.json` 도장만, 캡처 31장 화소 차 0, 대조표 0/26/118/42, 조각 +0.222% — 회귀 없음. src 는 안 고침.
  - 교사 대조표에 올릴 것(U4-10): ① 서사하라 = 색칠하기 「지역」(나라 54 밖, 수도 「—」 — 「칠한 나라 n / 55」 표시는 U4-9 에서 region 을 따로 셀지 정함), ② 지도 위치를 옮긴 마커 6(기후 4·킬리만자로산·테이블 마운틴 → 케이프타운), 빅토리아 폭포는 교과서 핀 그대로, ③ 자원 범례 제목 「주요 생산국」·태양광 범례 제목(그림 글자를 읽어 넣음), ④ AfCFTA 표는 그래프 블록(본문 글 + 표), 의제 2063 은 사진 두 장, ⑤ 고리 7 은 사이드바에 없고 지도 위 고리를 눌러 봄, ⑥ 110m 세계 보기에 섬나라 5 가 없음(확대해야 칠할 수 있음), ⑦ 39쪽 AfCFTA 「약 3조」↔「3.4조」(issues.md 8).
- (U4-9, 2026-10-21) 바탕 지도·조각 조립 — `build_basemap --unit u4`, registry, `sims/atlas-u4-africa/{index.html,main.js}`, 조각 `embed/atlas-u4-africa.html`, 미리보기 캡처 `$ATLAS_WORK/units/u4/shots/e1/`(장면 `units/u4/e1shots.mjs`)
  - **바탕 지도**: 110m·50m 전 지구 + 10a(아프리카 상자 [−37, −39, 67, 42], 나라 101) = **630,855 B(616.1 KiB)**, 상한 1,024,000 안. 10a 에만 있는 나라 5: 비르 타윌(BRT — Q4 분류 없음)·지브롤터·데켈리아·아크로티리·유엔 키프로스 완충 지대. 110m 에 없는 섬나라 5(COM·CPV·MUS·STP·SYC)는 50m·10a 에 있음 — 색칠하기 칠·동그라미는 50m/10a 나라(coloringLayer), 지도 누르기(바탕 지도 맞히기)는 늘 50m(renderer countryAt)라 110m 에 없는 것은 칠·누르기와 상관없음(세계 보기에서 바탕 윤곽만 안 보임).
  - **Q3 소말릴란드(코디네이터 결정 1)**: 설정 `basemap.mergeIsos {SOM: ['SOL']}`(u4 만) → `build_basemap` 새 순수 함수 `editArgs`/`countryArgs`: 고치는 나라만 따로 된 층(edits)으로 떼어 iso 를 바꾸고 `-dissolve2 iso copy-fields=ko` 로 녹인 뒤 나라 층에 다시 합침(다른 나라 도형은 dissolve2 의 틈 메우기를 거치지 않음), ko 는 원본 NAME_KO 로 다시 씀(소말리아). 상세도 셋 모두 SOL 없음·SOM 하나(`checkEdits` — 만든 뒤 검사, 시험).
  - **Q1 서사하라 「교과서대로 점선·따로」(코디네이터 결정 2)**: Natural Earth 10m `disputed_areas` 의 서사하라 면은 SAH 띠와 같은 모양(경위도 넓이 8.05 — 방벽 동쪽만)이라 쓸 수 없어 **위도 경계로 자름** — 설정 `basemap.cutIsos [{from: 'MAR', to: 'SAH', box: [−18, 20, −8, 27.6667]}]`(북위 27°40′ = 실제 경계선, 교과서 점선 27.66°N). MAR 은 상세도 셋 모두 27°40′ 남쪽·−8.6 동쪽에 면이 없음을 확인(그 상자 안 MAR = 서사하라 땅만). mapshaper: MAR 사본 둘 → 하나는 `-clip bbox`(→ iso SAH), 하나는 `-erase bbox`(→ 남은 MAR) → 기존 SAH 띠와 함께 dissolve. 결과(50m): SAH 경위도 넓이 8.06 → 21.81, MAR 남쪽 끝 21.42°N → 27.6666°N, MAR–SAH 공유 경계 = 27.6666°N 한 줄(해안 −13.16 ~ 알제리 국경 −8.69, 방벽 선은 SAH 안쪽이 되어 없어짐). 경계가 두 꼭짓점 직선이라 화면에서는 대원 호로 그려져 가운데가 약 0.018° 북쪽으로 휨(약 2km — 처음 보기 1px ≈ 11km 라 안 보임, 단순화가 같은 위도 꼭짓점을 지우므로 촘촘히 넣어도 남지 않음).
    - 미확정 국경 레이어: Natural Earth 에 27°40′ 선이 없어 `disputedLayerJson` 새 설정 `disputed.basemapPairs [['MAR', 'SAH']]`(있을 때만 — 바탕 지도 countries10a 의 두 나라 공유 경계를 topojson mesh 로, 없으면 멈춤), NE 짝에서 서사하라–모로코(Line of control = 방벽)를 빼고 featurecla 도 Disputed 하나로. `layer-ne-disputed.json` 선 19 → 7조각(할라이브·일레미 NE 선 + 27°40′ 한 줄), 3.6 → 1.4KB, 출처 글 「… + 바탕 지도 나라 경계(MAR–SAH)」.
    - 나라 분류(countryClass) 확인: 언어 SAH = MAR = 아랍어·기타 줄무늬, AfCFTA SAH = MAR = 비준 완료, 자원은 둘 다 분류 없음 — 자른 뒤에도 어긋남 없음(캡처 `legend-language-arabic.png`: 서사하라 전체가 모로코와 같은 줄무늬). 색칠하기 coloring.json 의 SAH `labelIso: 'MAR'` 는 coloring_quiz 가 Natural Earth 원본(띠 SAH)으로 잰 기록이라 그대로 둠(앱이 쓰지 않음 — 이제 글자 자리는 바탕 지도 SAH 안).
    - 교사 대조표(U4-10): 「서사하라 = 27°40′ 남쪽 전체를 따로(교과서대로, Natural Earth 띠와 다름) — 교사 뜻 풀이」.
  - **도장**: `build_basemap.mjs` 는 u2·u3 basemap 도장 입력 → `build_basemap --unit u2`·`--unit u3` 를 다시 돌려 **도장 줄만** 새 값(나머지 바이트가 고치기 전 파일과 같음을 JSON 비교로 확인 — 922,222 B·703,946 B 그대로, 설정에 고치기 키가 없으면 mapshaper 인자가 옛 글자 그대로라는 시험도). basemap 시험(u2 도장 확인)이 다시 통과. `coloring_quiz.mjs` 고침(아래 6)으로 u2·u3·u4 coloring.json 도 도장 줄만(u4 는 설정 content 를 고쳐 labels 도장이 낡아 `extract_text --labels --unit u4` 먼저 — p35-labels 내용 같음).
  - **결정 3 그래프 등록**: main.js 가 import 직후 `installExtraCharts()`(mountAtlas 전). 캡처: 고리 7 카드 그래프 모두 그림(실패 글 0), 피라미드·원 크기 줄 그래프 블록 정상.
  - **결정 4 작은 나라 고리** `coloring {smallPx: 16, smallMetric: 'area'}`: 처음 보기 동그라미 1440 = 감비아·카보베르데·상투메·코모로·세이셸·모리셔스·지부티·에스와티니·적도 기니(본토 리오무니) 9 + (1024 에서는 기니비사우·르완다·부룬디·레소토도). 레소토는 1440 에서 √넓이 ≥ 16px 라 동그라미 없이 면으로 칠함. 누르기 기록(`report.json` coloring 84줄 = 2크기 × 14곳(과제 9 + 르완다·부룬디·기니비사우·적도 기니·서사하라) × 처음·±3°·±1°) **모두 칠한 수가 바뀜**(누른 자리 = 가장 큰 조각 중심 — 동그라미 자리와 같음). 1024 처음 보기에서 감비아–기니비사우·르완다–부룬디 동그라미가 겹치나 누르기는 가장 가까운 중심이라 둘 다 맞음. 확대 창 없음(유럽과 같은 판단).
  - **결정 5 칠한 수**: `quiz.js` `updatePainted` — 문제 목록에 `region: true` 가 있을 때만 「칠한 나라 n / 54 · 지역 n / 1」, 없으면 옛 글 그대로(시험 ui 1). u2 조각 2,110,935 B(**+0.956%**, 이 고침 +235 B), u3 1,464,916 B(+0.238%).
  - **결정 6**: `coloring_quiz.mjs` 면 밖 해안 수도 길(라바트)을 `capitalByNe` 에서 새 키 `capitalByNeNear` 로 옮김, u4 설정에만 켬(u3 coloring.json 은 도장 줄만 — u4 모로코 수도 라바트 places+ne 그대로). 합성 시험: capitalByNe 만이면 옛 경고 그대로.
  - **결정 7 태양광**: `centerLonOf {'layer-p38-solar': 150}` + **`BOUNDS_OF`** — 바로가기 범위 [−5.8, −47.0, 293.7, 60.1] 그대로면 서쪽 끝이 세네갈·모리타니를 잘랐다(교과서 지도는 서아프리카 끝 ~ 브라질 동쪽 끝까지) → `[−20, −47, −34, 62]`(날짜변경선 건넘). 캡처 중심 경도 150, 묶음을 떠나면 0 으로 되돌아옴, 세계가 화면에 다 듦(k 1.02, 1440).
  - **결정 8 자원 고리**: 기본 보기에서 1024 는 오른쪽 고리 둘(다이아몬드·코발트)이 화면 밖이었다(묶음 범위 = 지도 틀의 작은 아프리카) → `BOUNDS_OF['layer-p38-resource-charts'] = [−30, −42, 68, 38]`(고리 원판까지). 원판(지름 96px)이 아프리카 밖 땅에 닿는지: 화면 1px = 1440 11.0km · 1024 16.6km → 반지름 530·797km, 가장 가까운 아프리카 밖 땅(다이아몬드–소코트라 833km, 그 밖은 1,097km 넘음 — U4-4 리뷰)보다 작아 **닿지 않음**(1024 는 여유 약 40km — 그림에서도 소코트라와 떨어짐). 보크사이트 원판은 기니·세네갈 해안(아프리카 땅)에 닿음(허용).
    - **남은 결함(코디네이터·교사 판단)**: 범례 칸(오른쪽 아래, 반투명·접기·끌기 가능 — u2·u3 와 같은 공유 UI)이 **망간 고리를 두 크기 모두 완전히 덮는다**(1440 중심 (893, 783) · 1024 (573, 605)), 1024 는 코발트 아래 절반도. 마우스로는 못 누르고 키보드(Tab·Enter)나 범례 접기로만 — 캡처 스크립트는 초점 + Enter 로 망간 카드 확인. 코디네이터가 정한 자리(오른쪽 열 위→아래)를 지키면 1440 범례 영역(경도 > 44°·위도 < −9°)을 피할 오른쪽 자리가 없어 자리를 바꾸지 않음. 대안: 망간을 남아공 남쪽(약 30°E, −42°)으로 옮겨 아래 줄 둘(백금·망간) + 범위 남쪽 −48 — 결정 필요.
  - **캡처에서 고친 것**: ① 태양광·자원 묶음 범위(위 7·8). ② 고리를 누르면 브라우저 기본 초점 윤곽(검은 사각)이 파란 초점 원과 겹쳐 그려짐 → `chartSymbols.js` 고리 `<g>` 에 `style {outline: none}`(핀 `.at-pin:focus` 와 같은 처리, 등록 길 코드라 u2·u3 조각 바이트 같음).
  - 조각 `embed/atlas-u4-africa.html` **1,593,565 B(1,556 KB)**, check:embed 통과·금지 패턴 0, u4 조각 크기 계약 시험이 이제 돎(skip 0).
  - 미리보기 캡처 119장(1440·1024 × 8주제 × 묶음 13 + 1440 사이드바 스크롤 + 색칠하기 작은 나라 처음·±3°·±1° + 이름 맞히기 + 핀 카드 11(사진 11·기후 그래프 4 모두 뜸) + 고리 7 누르기 + 언어 범례 아랍어·영어 고름 + 태양광 중심 + 조각 8주제), 사진 등 가로채기 27(없음 0), **페이지 콘솔 오류·경고 0**, 깨진 사진 0. 주제별로 본 것: 일반도(고도 색·27°40′ 점선·서사하라 이름이 SAH 안, 소말릴란드 국경 없음), 색칠하기(위 4·5, 미확정 국경 레이어), 지형(자연색·핀 7), 기후(구분 10 범례·1월/7월 등온선·그래프 핀 4), 언어·종교(줄무늬 24 나라 — 아랍어 고르면 줄무늬 나라 남음, 종교 비거주지 색), 잠재력(자원 칠함 + 고리 7·피라미드 2·태양광 세계 지도 태평양 중심), 협력(AfCFTA 3분류·표 블록), 지속가능(사막화 점무늬·빗금·원 크기 줄·사진 11).
  - 모음 썸네일 `docs/assets/atlas/hub/atlas-u4-africa.webp`(`hub_thumbs.mjs atlas-u4-africa --local`, 41 KB) — 공개 전이라 docs/atlas/index.html 카드는 아직 없음(hub 시험은 공개 단원만 썸네일 요구 — 통과).
  - 시험: basemap +3(옛 인자 그대로·editArgs·u4 바탕 지도 Q1/Q3), layers +1(basemapPairs), u4.layers 미확정 국경 27°40′, u4.content capitalByNeNear, ui +1(칠한 수). npm test: **Python 329 · Node 564(skip 0)**.
  - **U4-9 회귀**(src quiz.js·chartSymbols.js, build_basemap·coloring_quiz·build_layers 고침): u2·u3 조각 다시 → 캡처 41·31장 → compare → `--check` 아래 줄.
    - `regress_unit --unit u2 --check`: [경고] 없음, 해시 162개 중 다른 파일 2 = coloring.json·basemap.json **도장만**, 캡처 41장 화소 차 0(heritage 지명 수 100→101 참고), 대조표 0/9/134/24, 조각 2,061.5 KB(+0.956%) — 회귀 없음. `--unit u3 --check`: [경고] 없음, 해시 193개 중 다른 파일 2 = coloring.json·basemap.json 도장만, 캡처 31장 화소 차 0, 대조표 0/26/118/42, 조각 1,430.6 KB(+0.238%) — 회귀 없음. chartSymbols.js 고침 뒤 u2·u3 조각은 바이트 같음(등록 길 — 털어 냄), 낡음 경고를 없애려 캡처·대조표를 다시 찍고 확인.
  - 교사 대조표에 올릴 것(U4-10): ① 서사하라 = 북위 27°40′ 남쪽 전체를 따로 된 면(교과서대로 — Natural Earth 는 방벽 동쪽 띠, 교사 뜻 풀이), 점선도 27°40′(방벽 선 없음). ② 소말릴란드를 소말리아에 합침(국경선 없음). ③ 색칠하기 작은 나라 동그라미(넓이 기준 16px — 교과서에 없는 표시, 1024 에서는 르완다·부룬디·레소토·기니비사우도, 감비아–기니비사우 등 겹침), 칠한 수 「나라 n / 54 · 지역 n / 1」. ④ 110m 세계 보기에서 섬나라 5 바탕 윤곽 없음(칠·누르기는 50m 라 됨). ⑤ 자원 고리 망간이 범례 칸에 가림(위 결함 — 자리 결정 필요). ⑥ 태양광 묶음 범위 = 교과서 틀(서아프리카 ~ 브라질), 태평양 중심 150. ⑦ 범례 칸이 1024 에서 남부 아프리카를 가림(u2·u3 와 같은 공유 UI).
- (U4-9 후속, 2026-10-21) 망간 고리 자리 — 코디네이터 결정(범례 칸이 망간 원판을 두 크기 모두 덮던 결함)
  - **망간 52°E, −34° → 24°E, −48°**(남아프리카 공화국 남쪽, 「동쪽 열의 맨 아래」): 코디네이터 어림 30°E, −42° 는 1024 에서 범례 칸(화면 x 444~694 · y 390~758) 안이라 더 서·남쪽으로. 아프리카 밖 땅까지(Natural Earth 50m 꼭짓점 대원 거리): 프린스에드워드 제도(남아공 — 코디네이터 규칙대로 아프리카 밖으로 셈) **1,028km**, 프랑스 남방 영토(크로제) 2,087km, 남극 2,355km. 백금 고리와 1,672km(1024 원판 지름 1,563km 보다 멀어 안 겹침).
  - **코발트 61°E, −5° → −4°**: 묶음 범위를 남쪽으로 넓히자 1024 에서 범례 칸과 1px 차이로 비켜 났음 → 1° 북쪽으로 여유 8px(초점 원 +3px 보다 큼). 차고스 1,307km, 다이아몬드 고리와 1,672km.
  - `BOUNDS_OF['layer-p38-resource-charts']` 남쪽 −42 → **−56**(망간 원판까지 화면 안 — 1440 원판 아래 끝 y 835/900, 1024 704/768).
  - 범례 칸까지 여백(원판 가장자리 → 칸, `units/u4/shots/e1/report-rings.json` legendGap): 1440 망간 210px · 코발트 86px, 1024 망간 10px · 코발트 8px, 그 밖 모두 100px 넘음 — 7개 모두 가리지 않음. 고리 7 모두 마우스로 눌러 카드 그래프(망간도 이제 키보드 없이). 원판 반지름: 1440 13.1km/px → 631km, 1024 16.3km/px → 782km — 가장 가까운 아프리카 밖 땅(다이아몬드–소코트라 833km)보다 작음.
  - 시험 `u4.layers`: 둘레 상자 남쪽 −42 → −50, 아프리카 나라라도 남위 44° 남쪽 조각(프린스에드워드 제도)은 아프리카 밖 땅으로 거리 셈, 배치 규칙 = 왼쪽 열 4 서쪽·오른쪽 열(다이아몬드·코발트) 동쪽·열마다 위→아래 + 망간은 백금 동쪽·가장 남쪽. `layer-p38-resource-charts.json` 다시(자리 둘만), 조각 다시(1,556 KB).
