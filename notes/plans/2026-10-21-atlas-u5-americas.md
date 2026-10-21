# 사회과부도 아틀라스 2단계 — Ⅴ 아메리카 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 사회과부도 Ⅴ 아메리카(40~47쪽)를 조각 `atlas-u5-americas`로 만들어 교사 대조표 승인 뒤 공개한다. 공개된 아시아(u2 v3)·유럽(u3 v2)·아프리카(u4 v1) 조각은 화소 하나 바뀌지 않게 지킨다 — 먼저 u4 기준선을 찍고(U5-G0), 엔진·공유 파이프라인을 바꿀 때마다 u2·u3·u4 셋 다 확인한다.

**Architecture:** 아프리카와 같다. Python(PyMuPDF)으로 PDF 글자·도형·이미지를 뽑아 `C:\Users\Public\atlas-work\`에 두고 → Node 가 앱과 같은 d3 투영(`src/atlas/fitCore.js`)으로 경위도를 맞춰 GeoJSON·지명·내용 JSON 을 만들고 → 공유 엔진(`src/atlas/`)과 공유 조립(`src/atlas/mountAtlas.js`)이 단원 조각을 그린다. 새 단원은 `scripts/atlas/units.json`에 `u5`를 더하고, 모든 명령에 `--unit u5`를 붙인다. 아메리카에서 처음 쓰는 엔진 코드는 **모두 등록 길**(`src/atlas/americasExtra.js`의 `installAmericasExtras()` → `registerSvgChart`·`registerLayerType`·새 `registerFamily`·`registerProjection`)로 두어 u2·u3·u4 조각에서 털어 낸다.

**Tech Stack:** 아프리카와 같음 — Vite 6, d3-geo(+projection·polygon), csat-chart.js 2.2.2 저수준 API, PyMuPDF·numpy·shapely(≥2.1)·Pillow·rasterio, mapshaper@0.6.102, `node:test`, Python `unittest`. 새 자료: Natural Earth 10m 1단계 행정 구역(미국 주·멕시코 주 — U5-D 에서 내려받음).

**Spec:** `notes/specs/2026-10-20-atlas-phase2-design.md`(§5.3 아메리카, §6 새 기능 — 특히 §6.1-2·3·6·7, §6.2-11·12, §6.4-22, §8 교사 답 — 반드시 먼저 읽기), 아프리카 계획 `notes/plans/2026-10-20-atlas-u4-africa.md`(특히 「실행 중 결정」 — 이 계획의 「아프리카에서 이어받는 요령」이 그 요약), 유럽 계획 `notes/plans/2026-10-20-atlas-u3-europe.md`「실행 중 결정」(이탈리아·벨기에 하위 행정 구역 = 교과서 채움 되돌림, 아이슬란드 삽입 = 여러 지도 한 레이어, 30쪽 크기 단계 원·겹친 원 범례, 31쪽 리스본 값 붙은 기호), 1단계 계획의 「실행 중 결정」(`notes/plans/2026-10-09-atlas-asia.md` 784줄부터 — 싱가포르 확대 창 `symbolInset`, 100% 띠 `barPicker`). 규칙: `EMBED_RULES.md`.

---

## 교사에게 물을 것 (쪽 렌더에서 미리 보이는 것 — 답이 오기 전에는 아래 「기본값」으로 만들되 공개하지 않음 ⓣ)

설계 §8 에서 이미 답한 것(Q2 46쪽 = 끌어 돌리는 지구본, Q3 42·43쪽 = 끌어 옮기는 실제 크기 우리나라 윤곽 `compareOutline`, Q4 주제도 활동 = 문항 카드 + 원본 쪽 보기)은 다시 묻지 않는다. 아래는 그 답을 실제 지면에 옮길 때 생긴 구체적인 갈림길만.

- **Q1 일반도 세 장**: 40쪽 「아메리카」(입체 투영 1:77,000,000)·42쪽 「북아메리카」(람베르트 정각 원뿔 1:25,000,000)·43쪽 「남아메리카」(람베르트 정적 방위 1:28,000,000)가 모두 일반도다(지명·고도 색·영문 병기). 기본값: **주제 셋**(`general` 「일반도」 = 40쪽, `north` 「북아메리카」 = 42쪽, `south` 「남아메리카」 = 43쪽 — 목차 10개)으로 나누고, 지명은 세 지도를 합친 한 벌(같은 이름·30km 안이면 큰 축척 지도 자리 우선)을 모든 주제가 함께 쓴다. 아니면 「일반도」 한 주제의 바로가기 3개로 둘까?
- **Q2 40쪽 「중앙아메리카」 삽입 지도**(밀러 1:43,000,000 — 카리브 섬나라 이름·수도 영문): 웹 지도는 확대하면 되므로 따로 창을 띄우지 않는다. 기본값: 삽입 지도의 지명(카리브 섬나라·수도·영문)을 일반도 지명에 합치고(Q1 의 큰 축척 우선 규칙), 일반도 주제에 바로가기 「중앙아메리카」(삽입 지도 범위로 날아감)를 둔다. 괜찮을까?
- **Q3 같은 축척의 우리나라 — 두 쪽이 뜻이 다름**: 42쪽은 「같은 축척과 **같은 위도**의 우리나라」(태평양 위 약 130°W, 실제 위도 33~43°N 에 놓음), 43쪽은 「같은 축척의 우리나라와 **대척점**」(우리나라의 대척점 — 남위 약 37°·서경 약 53°, 우루과이 앞바다 — 에 남북이 뒤집힌 모양으로 놓음). 기본값: 둘 다 `compareOutline`(구면 회전으로 끌어도 실제 크기 유지, 「교과서 자리로」 단추). 42쪽은 처음 자리 = 교과서 자리, 끌면 **위도도 바뀜**(자유 이동). 43쪽은 대척점 모양(위도 부호를 바꾸고 경도 +180° — 거울상)을 실제 대척점에 두고 끌 수 있게. 42쪽 윤곽을 「같은 위도」 뜻대로 **동서로만** 끌리게 할까?
- **Q4 41쪽 색칠하기 나라·지역 수**: 지면 글자를 세면 초성 나라 14(ㅋㄴㄷ·ㅁㄱ·ㅁㅅㅋ·ㅍㄴㅁ·ㅋㄹㅂㅇ·ㅂㄴㅅㅇㄹ ㅂㄹㅂㄹ(두 줄)·ㅇㅋㄷㄹ·ㅍㄹ·ㅂㄹㅈ·ㅂㄹㅂㅇ·ㅍㄹㄱㅇ·ㅊㄹ·ㅇㄹㅎㅌㄴ·ㅇㄹㄱㅇ) + 이름이 쓰인 나라 20(카리브·중앙아메리카 작은 나라와 가이아나·수리남) = 34 이고, 아메리카 독립국 35 중 **앤티가 바부다만 이름이 없다**(40쪽 일반도에는 있음). 그 밖에 「그린란드(덴)」·「기아나(프)」(지역)·「알래스카(미)」(미국 일부) 글자가 있다. 기본값: 퀴즈 나라 **35**(앤티가 바부다는 이름 칸이 빈 문제로 넣고 대조표 「알려진 차이」), 그린란드·기아나 = 「지역」(나라 수 밖, 수도 「—」 — 아프리카 서사하라와 같은 `regions`·`noCapital`), 「알래스카(미)」는 글자 무시(`ignoreLabels`). 앤티가 바부다를 교과서대로 빼고 34 로 할까?
- **Q5 프랑스령 기아나**: Natural Earth 50m·10m 나라 면에서 기아나는 프랑스(`FRA`)의 일부라, 바탕 지도에서 기아나를 누르면 「프랑스」, 나라 단위 분류(47쪽 D사 원료 공급 국가)에서 프랑스를 칠하면 기아나도 칠해진다. 교과서는 40·41·43쪽 모두 「기아나(프)」를 따로 쓴다. 기본값: u5 바탕 지도에서 기아나를 프랑스에서 잘라 따로 된 면 `GUF`(아프리카 서사하라 `cutIsos`와 같은 길 — 상자 [-55, 2, -51, 6]), 색칠하기는 「지역」(Q4), 나라 분류는 지면에 칠한 대로 따로. 괜찮을까?
- **Q6 46쪽 지구본(인구 이동) 묶음의 도법**: 기본값: 처음 보기는 끌어 돌리는 지구본(교과서 회전 — 대서양 가운데)이고, 지도 도구의 도법 5개(밀러·메르카토르·로빈슨·구드·이퀄어스)로도 바꿀 수 있다(식민지 면·이동 화살표가 경위도 자료라 어느 도법에서도 그려짐). 화살표는 교과서 곡선을 되돌린 경로 그대로(대권으로 바꾸지 않음). 이 묶음은 지구본만 쓰게 막을까?
- **Q7 47쪽 「세계 100대 초국적 기업의 본사 위치」**: 교과서는 겹치는 원(뉴욕·도쿄·유럽)을 옆으로 비켜 그리고 검은 지시선으로 본사 자리를 가리켰고, 실리콘 밸리는 확대 삽입 지도로 따로 그렸다. 기본값: 웹은 원을 **실제 본사 자리**(지시선 끝)에 큰 원부터 반투명으로 겹쳐 그리고(확대하면 풀림), 실리콘 밸리는 1단계 싱가포르와 같은 확대 창(`symbolInset`). 교과서처럼 비켜 그린 자리 + 지시선을 지킬까?

**교사 답(2026-10-21):**
- Q1: 기본값대로. 일반도 세 장은 주제 3개(`general`·`north`·`south`, 목차 10개), 지명은 한 벌로 합침.
- Q3: 기본값대로. 42쪽 우리나라 윤곽은 어디로든 자유롭게 끎(동서 고정 아님), 43쪽은 대척점 거울상.
- Q4: 기본값대로. 퀴즈 나라 35(앤티가 바부다 포함 — 「알려진 차이」), 그린란드·기아나는 「지역」(수도 「—」).
- Q7: 기본값대로. 본사 원은 실제 자리에 큰 원부터 반투명으로 겹침, 실리콘 밸리 확대 창.
- Q2·Q5·Q6: 따로 묻지 않음. 기본값대로(중앙아메리카 = 일반도 바로가기, 기아나 `GUF` 잘라 냄, 46쪽 지구본 처음 + 평면 도법 5개도 됨).
- (답이 오면 여기에 Q 번호별로 적고, 기본값과 다르면 바뀌는 작업을 함께 적는다.)

---

## 공통 사항 (모든 작업자 필독)

- 저장소 루트: `C:\Users\김용현\Desktop\동아출판 사회과 바이브코딩\app`(아래 경로는 모두 여기 기준). 가지 **`atlas-u5`**(main 15b696a 에서 만듦, 워크트리 없음 — 가지를 바꾸지 않는다). PDF: `..\22개정_중학_사회과 부도_교과서_본문.pdf`(인쇄 쪽 = PDF 쪽, 쪽 크기 779.5×722.8pt). 쪽 렌더: `C:\Users\Public\atlas-work\phase2\pages\p040.png`~`p047.png`(100dpi).
- **ASCII 작업 폴더** `C:\Users\Public\atlas-work\`(env `ATLAS_WORK`), 단원 작업 파일은 `units/u5/…`. 한글 경로에 대량 출력 금지(0xC0000409). Node `cpSync`/`rmSync({recursive})` 금지 — 손 순회.
- Python 은 항상 `python -I`, 한글 출력은 `sys.stdout.reconfigure(encoding='utf-8')`. **파일을 쓸 때는 `newline='\n'`**(유럽 U3-4 — 텍스트 모드 CRLF 가 도장 바이트 해시를 바꿨다).
- git: **`git add -A` 금지**. 자기 파일만 경로로 add. 커밋 메시지 한국어, 끝에 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`(+ 세션 줄). author 는 저장소 로컬 설정(noreply). push 는 코디네이터·사용자 승인 뒤.
- 전역 훅: Write 할 때 파일 머리 `© 2026 김용현` 줄 — 지우지 않는다. Bash 할 때 build-check 가 돈다.
- 헤드리스 Chrome: `--headless=new --disable-gpu --use-angle=swiftshader --enable-unsafe-swiftshader`, 매번 새 `--user-data-dir`, `--disk-cache-size=0`, 출력은 `C:/Users/Public/...` 슬래시 경로. 캡처는 `Date.now` 고정(`fixedNow`). GPU 절대 금지(블루스크린 0x10E).
- UI 문구 한국어, 이모지 금지(`src/shared/dom.js icon()` 선 아이콘). 그래프는 csat-chart.js 저수준 렌더러만(`CsatChart` 클래스 import 금지), csat 에 없는 형식만 시험지 양식 SVG.
- 내려받은 자료(U5-D)는 저마다 새 빈 폴더(`raw/ne-admin1/`·`raw/statcan-cd2016/`)에 두고, 스크립트는 다른 폴더, 경로는 인자로 넘기고 `python -I`로 읽는다(받은 폴더 안에서 인터프리터·빌드 도구를 돌리지 않음).
- 테스트: `npm test`(Python + Node). 2026-10-21 main 15b696a 기준 **Python 329 · Node 570(통과 569, 실패 1)** — 실패 1은 `tests/atlas/hub.test.mjs:48` 「공개 전 registry 단원도 준비 중」이 아프리카를 「아직 공개 안 됨」의 예로 쓰는데 u4 가 공개되어 낡은 것(U5-G0 Step 1 에서 u5 로 바꿈). U5-G0 에서 지금 수를 다시 적는다.
- 조각: `npm run embed -- atlas-u5-americas` → `npm run check:embed`. 공개: `npm run release -- atlas-u5-americas --note "…"`.
- **회귀 관문(이 단원의 핵심 규칙)**: 엔진(`src/atlas/*`)·공유 파이프라인(`scripts/atlas/*.py|mjs`)을 고친 커밋마다 `node scripts/atlas/regress_unit.mjs --unit u2 --check`·`--unit u3 --check`·`--unit u4 --check`를 **모두** 통과해야 한다(조건: 저장소·작업 산출물 해시 같음 — 도장 inputsHash 만 다른 것은 정당, 대조표 캡처 u2 41장·u3 31장·u4 42장 화소 차 0, 대조표 수 u2 0/9/134/24 · u3 0/26/118/42 · u4 0/34/104/41, 조각 크기 ±1%). `[경고]`(캡처·조각이 입력보다 오래됨)가 뜨면 그 단원 embed → compare_shots → compare 를 다시 돌린 뒤 check(U4-3 Step 0). 새 동작은 **설정 키나 자료 키가 있을 때만** 켜지게 만든다 — 키가 없으면 옛 길.
- **조각 크기 예산(가장 빠듯한 곳)**: u2 조각은 이미 기준선 대비 **+0.956%**(2,110,935 B)라 남은 여유가 **약 0.9KB** 다. 그래서 아메리카에서 새로 쓰는 엔진 코드(평사·정사 도법, 지구본 보기·끌어 돌리기, 경로 화살표, 우리나라 윤곽, 네모 단위 기호, 지시선 등)는 **반드시 `src/atlas/chartsExtra.js`와 같은 등록 길**로 둔다: 새 모듈 `src/atlas/americasExtra.js`의 `installAmericasExtras()`가 `registerSvgChart`·`registerLayerType`(이미 있음)과 이 단원에서 만드는 `registerFamily`(fitCore)·`registerProjection`(projections/mapView)을 부르고, `sims/atlas-u5-americas/main.js`만 `installExtraCharts()`(46쪽 고리 — 아프리카 것 재사용)와 `installAmericasExtras()`를 mountAtlas 전에 부른다. 공유 파일에 남는 것은 등록 자리(수십~수백 B)뿐이어야 하고, **u2 조각 +1% 를 넘으면 멈추고** 코디네이터·교사 판단(u2 기준선 크기를 다시 정함)을 받는다. `chartsExtra.js`에 아메리카 코드를 더하면 u4 조각이 커지므로(±1% 관문) 아메리카 전용은 새 모듈에, 고리 기호에 지시선을 더하는 것(U5-3g)처럼 u4 와 함께 쓰는 고침만 chartsExtra·chartSymbols 에.
- **공개본은 다시 만들지 않는다**: u2·u3·u4 의 `sims/*/data`·`content/atlas/u2|u3|u4`·`docs/atlas-u2-asia|u3-europe|u4-africa/<판>/`은 이 단원에서 다시 생성하지 않는다. 도장 입력 스크립트(`build_basemap.mjs`·`coloring_quiz.mjs`·`georef.mjs`·`geo_util.mjs`·`extract_text.py`·`pdfkit.py`·`atlas_common.py` 등 — 각 단원 설정 `content.stamps`)를 고치면 그 단원 생성물의 도장이 낡았다고 나올 뿐 파일은 그대로다. 도장 줄만 새 값으로 바꾸는 것은 허용(U4-8·U4-9 판단 — 나머지 바이트 같음을 JSON 비교로 확인). 그래서 도장 입력 스크립트는 **꼭 필요할 때만** 고치고, 고치면 「실행 중 결정」에 적는다.
- 리뷰 관문: 작업마다 코드 리뷰(서브에이전트 `superpowers:requesting-code-review`) → 고침 → 커밋. **교사 관문 ⓣ**: 위 Q1~Q7 답, U5-10 대조표 승인, U5-11 공개.
- 단원 고르기: 모든 파이프라인 명령에 `--unit u5`(또는 env `ATLAS_UNIT=u5`). 안 붙이면 u2.

## 아프리카에서 이어받는 요령 (다시 찾지 않도록 — 아프리카 계획 「실행 중 결정」 요약)

| 요령 | 아프리카에서 생긴 곳 | 아메리카에서 쓸 곳 |
|---|---|---|
| 회귀 도구 `regress_unit.mjs --unit uN --baseline\|--check`(단원 표 `pages`로 작업 파일 한정, 공개 단원은 `docs/<sim>`도, `*.md` 뺌, 낡음 `[경고]`·없는 파일 종료 코드 2) | U4-G0·U4-3 Step 0 | U5-G0 에서 u4 기준선, 이후 모든 엔진·공유 스크립트 고침에 u2·u3·u4 `--check` |
| **등록 길** `chartsExtra.js installExtraCharts()` → `registerSvgChart('pie'\|'bubbleRow')`·`registerLayerType('chartSymbols')` — 부르지 않는 조각에서 털림(u2 +1.18% → +0.945%) | U4-3 판단 | 아메리카 새 엔진 코드 전부 → `americasExtra.js installAmericasExtras()`, 46쪽 고리는 `installExtraCharts()` 그대로 |
| `land_shapes` 래스터 규칙 `seaWhite`·`openPt`·`render: 'all'`, `shape_controls` 처음 식 `{fromMap, pts}`(참조 지도 도법 + 닮음 변환으로 출발) | U4-2 | 눈금 없는 작은 지도 전부(45쪽 1월·7월, 46쪽 캐나다·미국 4·중남미, 47쪽 세계 2·멕시코), 46쪽 지구본(래스터 바탕 — 인라인 그림 175장) |
| `projectionFrom`(같은 바탕 지도를 줄인 것 — 닮음 변환만) — 꺾인 점 짝이 5번 안에 수렴 안 해도 rms ±0.05pt 면 마지막 짝 | U4-2 | 45쪽 1월·7월 ← `p45-climate`, 46쪽 미국 3장·삽입 틀 → 새 `fitFrom`(쪽 이동량, U5-2) |
| `countryClass` 줄무늬 `multi`·`areaInsetPt`(넓이 몫), `legendItems`(범례가 그림·깨진 글자일 때 손 견본), `countryOverrides` 모두 까닭 | U4-3a·U4-4 | 47쪽 D사 원료 공급 국가(1분류), **하위 행정 구역판 `regionClass`**(U5-3d — 미국 주 4장) |
| 래스터 분류: 조각 그림 여럿이면 `rasterIgnoreImages` 끔, `hatch.clips`(잘라 그리기 경로 빗금), `rasterRender: 'all'` | U4-4 37쪽 | 45쪽 기후 구분(14분류 — 고산 빗금)·1월·7월 |
| 무늬 채움 면: `pattern 'dots'`·`hatch`(채움 → 줄무늬 → 점무늬 → 빗금 차례), `hatch.stroke: null`(열린 선) | U4-3b·U4-4 39쪽 | 46쪽 중남미 민족 「혼혈」(**가로** 분홍 줄)·「아프리카계」(검은 사선 빗금) → 빗금 각도·색 키(U5-3h) |
| 지도 위 고리 `chartSymbols`(지름 `classSymbolPx`, 안쪽 = ring 비, 가운데 글자, `labelObstacles`, 초점 원·`outline: none`), 사이드바 `ringSvg` | U4-3c·U4-4 후속·U4-9 | **46쪽 민족 고리 5**(멕시코·아이티·브라질·페루·아르헨티나 — 가운데 나라 이름·(인구)), 점선 지시선을 더함(U5-3g) |
| 고리 자리 규칙: 설정 `items[].lonlat` + `_why` 필수, 원판이 다른 땅에 닿지 않음, 범례 칸이 가리지 않음(`report-rings.json legendGap`) | U4-4 리뷰·U4-9 후속 | 46쪽 고리 5(교과서도 바다 위 + 지시선) |
| 고리 읽개 `read_donut`(조각 안 수 — 유럽 코펜하겐) / `valuesOutside` → `read_donut_outside`(부채꼴 + 흰 구멍 원, 헝가리안 글자 짝), `namesFrom` | U4-7 | 46쪽 고리 5 — 수가 고리 띠 **안**에 인쇄(멕시코 18·3·15·64)라 `read_donut` 길부터 시험, 구멍이 흰 원이면 `holeColor`만 빌림 |
| 그래프 키 `barsByMonth`(막대 없는 달 = 0, `noBarMonths`) | U4-7 | 45쪽 배로(겨울 강수 막대가 아주 작음)·보고타 |
| 바탕 지도 `mergeIsos`·`cutIsos`(상자로 잘라 따로 된 면, `checkEdits`), 미확정 국경 `disputed.basemapPairs` | U4-9 | **Q5 기아나 `GUF` = FRA 에서 자름**. 미확정 국경 점선은 40·42·43쪽에 없어 안 씀(U5-1 에서 확인) |
| 색칠하기 `regions`(지역 — 나라 수 밖)·`noCapital`·`joinLabels`(두 줄 한 나라)·`capitalByNe`·`capitalByNeNear`(면 밖 해안 수도), 칠한 수 「나라 n / N · 지역 n / M」 | U4-8·U4-9 | 41쪽 그린란드·기아나(지역), 「ㅂㄴㅅㅇㄹ / ㅂㄹㅂㄹ」·「세인트빈센트 / 그레나딘」 두 줄, 카리브 섬 수도(바다 쪽 해안 수도) |
| 작은 나라 동그라미 `coloring.smallMetric: 'area'` + `smallPx 16`(가장 큰 조각 넓이 제곱근, 날짜변경선 넘는 섬나라도) | U4-3e·U4-9 | **41쪽 카리브 섬나라 13개**(바하마·자메이카·도미니카·세인트키츠 네비스·앤티가 바부다·세인트루시아·세인트빈센트 그레나딘·바베이도스·그레나다·트리니다드 토바고 등) + 엘살바도르·벨리즈 — 1024 에서 동그라미 겹침이 아프리카보다 심할 것(U5-9 캡처로 확대 창 판단) |
| 지명: `chain.minDirCos`(방향 반대 글자 잇지 않음), `neAlias[이름].nearest`(같은 NAME_KO 여럿), `snapAlways`(이웃 때문에 옮겨 그린 수도), `kinds.water` 폭포·운하 → other, 붉은 국립 공원·유적 글자 무시(교사 답 Q8), 소속 표시 (프)(영) 무시 | U4-5·U4-6 Step 0 | 동명: **산호세**(코스타리카 ↔ 미국 캘리포니아)·**킹스턴**(자메이카 ↔ 캐나다)·**산티아고**(칠레 ↔ 도미니카 공화국)·런던·해밀턴·코르도바·발렌시아. 나이아가라 폭포·이과수 폭포·파나마 운하. 붉은 글자 40쪽 100·42쪽 42·43쪽 45조각, 소속 (미)(영)(프)(네)(덴)(에콰)(칠)(콜)(멕)(에) |
| 찾아보기 격자 칸 대조(교과서 글자 자리까지), NE 대조 통계(중앙·90%·최대 km), 작은 나라 이름 자리 기록 | U4-5 | 40·42·43쪽(격자 글자: 40쪽 위 A~H 파랑·양옆 1~7 **빨강**, 삽입 I~L·1~3 / 42·43쪽 파랑 열·초록 행) |
| 사진: `candidate.minAreaEachPt2`(작은 그림 거르기), `imagesOnly`(글이 겹친 오려 낸 그림), `render: true`(벡터 삽화 렌더), 같은 설명 두 카드, `titleOverride` | U4-6 | 40·42·43쪽 작은 그림 3,220·5,475·1,283개, 47쪽 A사 기기 그림(벡터 삽화)·만화(래스터 1장) |
| 내용: 고리 7 의 참조를 chartSymbols 항목으로 셈(build_content·계약 시험), 표 그림은 그래프 블록, 미확정 국경 레이어 종류 `area` | U4-8 | 46쪽 고리 5, 미국 4장(바로가기 4) |
| 태평양 중심 `centerLonOf {'layer-…': 150}` + 묶음 범위 `BOUNDS_OF`(날짜변경선 건넘 `[w, s, e, n]` e < w) | U4-9 결정 7·8 | **47쪽 세계 지도 둘**(본사·D사 — 동해·독도·이어도 글자가 있는 태평양 중심), 46쪽 고리 묶음 범위 |
| 대조표 `checks.known` 퍼센트 고정 `pct`(`compare_known.mjs`), 쪽 지도 없는 레이어 묶음 = 대표 지도 행, 같은 쪽 나눠 쓰는 주제 몫, chartSymbols 참조 | U4-10 | 46쪽(인구 이동·민족 두 주제가 한 쪽)·47쪽(초국적 기업·지역 변화), 우리나라 윤곽 레이어(쪽 지도 있음) |
| 「烋」(’) 글꼴 코드 문제 — pdfkit 은 u2 도장 입력이라 고치지 않고 `captionOverride`·`titleOverride`·overrides | U3-6·U4-8 | 같은 글자가 나오면 같은 길 |

## 쪽 목록 (쪽 렌더 8장과 PyMuPDF 조사로 셈 — 수는 추출 때 다시 센다)

조사 방법(2026-10-21, `C:\Users\Public\atlas-work\u5survey*.py` — 결과 `u5survey.txt`·`u5survey2.txt`, 확대 렌더 `tmp-u5/*.png`): 쪽마다 글자 조각(글꼴·크기·색), 경위선 글자(`°`·`˚`), 그림 배치(400pt² 이상 / 10pt² 미만 / xref 0 인라인), 도형 채움·선 색, 점선 무늬, 쪽 안 구역별(46·47쪽) 도형·그림·낱말 수.

| 쪽 | 내용 | 그리기 방식(조사) |
|---|---|---|
| 40 | 일반도 「아메리카」 **입체 투영(평사) 도법** 1:77,000,000(그린란드·서유럽·서아프리카 끝 포함). 고도 색 + 음영 래스터, 한글 지명 + 나라 영문(자홍 Helvetica 5pt 56·6pt 4)·수도 영문(검정 Helvetica 5pt 37), 수도 ■·도시 ○, 산 높이(DINPro), 지형 상자 글자, **붉은 국립 공원·유적 글자 100조각**(YDVYGOStd33 4.9pt #d71920), 소속 표시 (미)(영)(프)(에)(에콰) 등 자홍 명조 5.9pt 15, 「기아나」 갈보라 #7e576b(지역 — 아프리카 서사하라와 같은 색), 높이·깊이 범례, 경위선 글자 33(아래 160°W~20°W, 양옆 60°N~40°S), 찾아보기 격자(위 A~H 파랑 #0074bc, **양옆 1~7 빨강 DINPro-Bold #d71920** — 붉은 글자 무시 규칙과 섞이지 않게). 삽입 「중앙아메리카」 **밀러 1:43,000,000**(틀 약 [52,458,393,648], 자체 경위선 90°W~50°W·10°N~20°N, 격자 I~L·1~3, 카리브 섬나라 이름·수도 영문). 날짜변경선 자홍 점선(#ec008b 1.5pt). | 큰 래스터 조각 261장(≥400pt²) + 아주 작은 그림 3,220개(<10pt²) + xref 0 29, 도형 10,262(국경 붉은 선 #ed1c24 1,542, 검은 점선 0.25pt [2 1] 119 — 주·섬 소속 경계로 보임, 주 경계 아님(42쪽 확대 확인)). |
| 41 | 색칠하기 「아메리카의 국가와 주요 도시」 입체 투영 1:77,000,000. 초성 나라 14(KCCChassam 12.8pt 10 + 8pt — 「ㅂㄴㅅㅇㄹ / ㅂㄹㅂㄹ」 두 줄), 이름이 쓰인 나라 20(8pt — 카리브·중앙아메리카·가이아나·수리남, 「세인트빈센트 / 그레나딘」 두 줄), 지역 「그린란드(덴)」·「기아나(프)」, 「알래스카(미)」, **앤티가 바부다 이름 없음**(Q4), 손글씨 수도 17(KyoboHandwriting 7.5pt — 벨모판·킹스턴·산호세·마나과·과테말라시티·산살바도르·파나마시티·몬테비데오·키토·카라카스·테구시갈파·아바나·나소·포르토프랭스·산토도밍고·조지타운·파라마리보, 나머지는 조각), 범례 수도 ★·대도시 ○, 개관 글 상자, 「각 나라에 색칠하여…」, 활동 자료(붙임 딱지). 나라 경계는 두꺼운 색 띠. | 벡터 + 쪽 바탕 래스터 조각 255장(종이 무늬) |
| 42 | 일반도 「북아메리카」 **람베르트 정각 원뿔** 1:25,000,000. 지명(검정 고딕 5.8pt 220·파란 명조 102), 나라 영문 자홍 Helvetica 6pt 42, 붉은 국립 공원·유적 42조각, 소속 (프)(멕)(콜)(영) 8, 산 높이, 지형 상자 글자(NanumMyeongjoOTFBold), 경위선 글자 34, 격자 열 파랑 #0095da 21·행 초록 #00a650 15, 날짜변경선(0.5pt [5 1.5]). **「같은 축척과 같은 위도의 우리나라」** 회색 실루엣(약 [130,330,215,415], 태평양 약 130°W·33~43°N — 글자 5.5pt #1e5c79·#33647c, 동해·황해·남해 4.0pt). | 래스터 조각 388장 + 작은 그림 5,475개, 도형 8,158 |
| 43 | 일반도 「남아메리카」 **람베르트 정적 방위** 1:28,000,000. 지명(고딕 5.8pt 172·파란 명조 123), 붉은 국립 공원·유적 45조각, 소속 (칠)(영)(에콰)(네) 6, 「기아나」 갈보라 1, 경위선 글자 31, 격자 파랑 14·초록 14. **「같은 축척의 우리나라와 대척점」** 회색 실루엣(약 [490,485,590,600] — 남북이 뒤집힌 거울상, 남해가 위·황해 왼쪽·동해 오른쪽, 독도 3.5pt). | 래스터 조각 105장 + 작은 그림 1,283개, 도형 6,111(국경 #d71820 1,762) |
| 44 | 지형 「아메리카의 지형」: 자연색 래스터(naturalearthdata.com, 2023 — 쪽 전체 1장) + 지형 이름 상자(낱자), 빈 핀 7(#7250a1) + 사진 7(우유니 소금 사막·갈라파고스 제도·**아우얀테푸이**(설계 「앙헬 폭포」는 어림 — 지면 제목은 아우얀테푸이)·로키산맥·나이아가라 폭포·그레이트플레인스·아마존강), 활동하기 1(「40쪽의 아메리카 지도와 인터넷을 참고하여 사진의 위치를 지도의 빈칸에 표시해 보자」 — 번호 숨김), 산 높이 2(디날리산 6190·아콩카과산 6961). | 큰 래스터 1장(1957×1934) + 작은 그림 4,643개 + 사진, 도형 196 |
| 45 | 기후: 「아메리카의 기후 구분」(gloh2o.org 1991~2020) 래스터 **범례 14**(열대 3 — 열대 우림·열대 계절풍·사바나 / 건조 2 — 사막·스텝 / 온대 4 — 온난 습윤·서안 해양성·온대 겨울 건조·지중해성 / 냉대 2 — 냉대 습윤·냉대 겨울 건조 / 한대 2 — 툰드라·빙설 / 고산 빗금 #b9703d 704조각), 곡선 경위선 + 글자(쪽 전체 26 — 기후 구분 대부분). 「1월·7월 평균 기온과 강수량」(worldclim 1970~2010) 강수 7단계 + 등온선(−30~30, 글자 자홍 DINPro 6pt 33). 기후 그래프 4(배로 툰드라·뉴욕 온난 습윤·보고타 고산 = 97쪽 표 / **이키토스 열대 우림 = 표에 없음 → 측정**), 사진 4(순록 유목·센트럴파크·안데스 원주민·아마존 열대 우림), **핀 4**(설계 「5」는 어림 — #7250a1 채움 4: 배로·뉴욕·보고타·이키토스), 활동하기 2. | 기후 구분 래스터 조각 + 1월·7월 래스터 각 1, 인라인 그림 xref 0 62, 등온선 벡터 #ed1064 |
| 46 | ① 「아메리카 인구 이동」 **지구본**(『세계의 여러 지역 NOW』, 2023): 바탕은 인라인 래스터 조각 175장(xref 0), 17세기 식민지 3색 면(에스파냐 #faa519 21·포르투갈 #0cab68 11·프랑스 #ee3f60 14 — 벡터), 이동 화살표 3종(에스파냐인·포르투갈인·프랑스인 — 색 곡선 + 화살촉), 아프리카계 노예 이동 검은 점선 화살표(1471~1870), 본문 글. ② 「캐나다의 언어 분포」(캐나다 통계청, 2016) **센서스 구역 8분류**(영어 75% 이상·50~75·50% 이하 / 프랑스어 75% 이상·50~75·50% 이하 / 원주민 언어 / 기타 — 채움 약 158), 500km 축척. ③ 「미국의 민족(인종) 분포 및 구성」(미국 통계청, 2020) **주별 단계구분도 4장**(유럽계 5·아프리카계 5·히스패닉계 5·아시아계 5단계, 각각 알래스카·하와이 삽입 틀 2, 500km·1,000km 축척) + **100% 띠 2줄**(1990: 75.6·11.7·9.0·2.8·0.9 / 2020: 57.8·18.7·12.1·6.1·5.3, 5분류). ④ 「중앙 및 남아메리카의 민족(인종) 다양성」(『신상 지리 자료』, 2023) 지역 면 **범례 7**(에스파냐계·포르투갈계·프랑스계·혼혈(가로 분홍 줄)·아프리카계(사선 빗금)·원주민·기타) + **지도 위 고리 5**(멕시코 12,657·아이티 1,157·브라질 21,014·페루 3,213·아르헨티나 4,493 만 명 — 같은 크기, 띠 안 값, 점선 지시선, 범례 「민족(인종)의 비율(%)」 기타·유럽계·혼혈·원주민·아프리카계). ⑤ 「아메리카의 문화 혼종성」 사진 6(재즈·리우 카니발·산토도밍고 교회·과달루페 성모·퀘벡 STOP 표지판·스팽글리시 광고판(활동하기 3 사진)), 활동하기 3. | 지구본 = 래스터 + 벡터, ②③④ 모두 벡터(구역 경계 #6c6e70·#939597 0.1~0.2pt), 사진 |
| 47 | ① 「초국적 기업의 공간적 분업」 **만화 6칸**(래스터 1장 [44,95,389,305] + 말풍선 글 벡터). ② 「세계 100대 초국적 기업의 본사 위치」(LANDGEIST 누리집, 2021) **세계 지도(태평양 중심 — 동해·독도·이어도 종합 해양 과학 기지 글자)** + 분홍 원 약 99(#f17191, 지름 = 시가 총액 — 범례 겹친 원 200·100·10 백억 달러) + 검은 지시선 25 + **실리콘 밸리 확대 삽입**(약 [548,258,745,433]). ③ 「초국적 기업의 글로벌 생산 체제」 A사 제품 생산 국가 그림(기기 화면 속 작은 지도 6 — **벡터 삽화**, 붉은 점 #f05a4e·#ce4d43), D사 농업 회사 **세계 지도(태평양 중심)**: 원료 공급 국가 분홍 칠(#f9bfc6) + 기호 5종(본사 건물·해외 농장 주황 원 #f7931d 25·숙성 창고 빨강 네모 #ed1c24 6·샐러드 공장 초록 네모 #71bf43 6·판매 지사 지게차) + 지역별 판매 지사 수(유럽 112개·북아메리카 34개·중앙 및 남아메리카 7개·기타 지역 9개). ④ 「초국적 기업의 이전에 따른 지역 변화」: 디트로이트 인구 변화 **선 그래프**(1920~2020 11점, 값 글자 없음 → 측정), 폐허 공장 사진 1, **멕시코 마킬라도라** 지도(주 경계 + **주별 네모 단위 기호 2종** — 파랑 1칸 = 50개 공장 99칸·주황 1칸 = 2만 명 근로자 130칸, 『하크 세계 지도』 2023), 필리핀 BPO **매출 막대**(2006~2021 16개, 2021 강조) + **고용 인원 선**(16점) — 값 글자 없음 → 측정. | 만화·폐허 사진 래스터, 나머지 벡터(세계 지도 2장은 바다·육지 벡터 + 작은 그림 4,800여 개 — 글자 그림일 수 있음, U5-4 에서 확인), 그래프 아이콘은 인라인 그림(xref 0 89) |

**합계**: 지도 **20**(+ 미국 알래스카·하와이 삽입 틀 8 — `fitFrom` 공유) · 레이어 **18** · 사진 **20**(지형 7·기후 4·문화 6·초국적 기업 2(만화·A사 그림 렌더)·지역 변화 1 — 실측으로 고침) · 그래프 **13**(기후 4·100% 띠 1·고리 5·선 2(디트로이트·BPO 고용)·막대 1(BPO 매출)) · 핀 **11**(지형 7·기후 4) · 지도 위 고리 기호 5 · 주제 **10**(Q1 기본값).

설계 §5.3 과 다른 점(실측): 지도 약 22 → 20 + 삽입 틀 8(설계는 삽입 fit 을 지도 수에 반쯤 섞어 셈), 기후 핀 5 → 4(핀 합 12 → 11), 사진 약 19 → 20, 지형 사진 「앙헬 폭포」 → 지면 「아우얀테푸이」, 중남미 민족 「6분류 + 혼혈 빗금」 → 범례 7(혼혈은 가로 줄 무늬, 아프리카계는 사선 빗금 — 둘 다 면 위에 겹침), 기후 「14분류」 = 13 + 고산 빗금(맞음), 42·43쪽 「우리나라 실루엣」은 쪽마다 뜻이 다름(같은 위도 / 대척점 — Q3), 주제 8 → 10(일반도 셋을 나눔 — Q1, 「문화 혼종성」만 따로 두면 지도가 없는 주제가 생겨 민족 주제에 합침).

## 주제 (사이드바 목차 10개 — id · 쪽 · 묶음)

| id | 제목(목차) | 쪽 | 지도 묶음(views) | 사이드바 |
|---|---|---|---|---|
| `general` | 일반도 | 40 | `americas`(p40-americas)·`central`(p40-central 범위 — Q2) | 제목·도법 글(본 지도 + 삽입), 원본 쪽 |
| `coloring` | 색칠하기 | 41 | — | 목표·개관·활동, 색칠하기 퀴즈(35 + 지역 2 — Q4) |
| `north` | 북아메리카 | 42 | `north`(p42-north) + 우리나라 윤곽(같은 위도) | 제목·도법 글, 윤곽 안내 글(지면 글자), 원본 쪽 |
| `south` | 남아메리카 | 43 | `south`(p43-south) + 우리나라 윤곽(대척점) | 같음 |
| `relief` | 지형 | 44 | — | 핀 7(번호 숨김), 활동하기 1, 출처 |
| `climate` | 기후 | 45 | `climate`·`jan`·`jul` | 그래프 마커 4(번호 숨김), 활동하기 2 |
| `migration` | 인구 이동과 언어 | 46 ①② | `migration`(지구본 — 식민지 면 + 이동 화살표)·`canada` | 본문(지구본 옆 글·캐나다 설명), 원본 쪽(부분) |
| `ethnicity` | 민족 구성과 문화 혼종성 | 46 ③④⑤ | `us-european`·`us-african`·`us-hispanic`·`us-asian`·`ethnic`(면 + 고리 5) | 100% 띠 그래프 블록(`barPicker` — 1990·2020), 본문, 사진 6, 활동하기 3, 원본 쪽(부분) |
| `tnc` | 초국적 기업 | 47 ①②③ | `hq`(세계 — 태평양 중심 + 실리콘 밸리 확대 창)·`agri`(세계 — 태평양 중심) | 만화 사진 카드 + 원본 쪽 보기(부분), 본문, A사 그림 카드(렌더) |
| `change` | 지역 변화 | 47 ④ | `maquila`(멕시코) | 디트로이트 선 그래프 + 사진, BPO 막대·선 그래프 블록 2, 본문 |

- 바탕 기본값: 일반도 3주제(`general`·`north`·`south`) `tint`, 지형 `natural`, 나머지 없음(`baseColor`).
- 핀 번호 숨김(`pinNumbers: "hidden"`): 지형(활동하기 1)·기후(활동하기 2 「기후 그래프와 사진 설명을 읽고 해당 지역의 위치를 지도에 표시」).
- 태평양 중심(`centerLonOf`): `hq`·`agri` 묶음 150(U4-9 꼴 — 키 = 레이어 ref). 지구본 묶음은 중심 경도 대신 회전(U5-3c).
- 주제도 활동은 이 단원에 없다(46·47쪽은 활동하기 블록만). 「원본 쪽 보기(부분)」는 46쪽 지구본·47쪽 만화·A사 그림에 둔다(1단계 「편집 디자인」 기본값).

## 파일 구조 (이 계획이 만들거나 바꾸는 것)

```
scripts/atlas/
  units.json              u5 더함                                                          (U5-1 고침)
  config/u5.json          아메리카 단원 설정                                                 (U5-1 새로)
  config/u5.compare.json  대조표 장면·확인 목록                                              (U5-10 새로)
  maps_u5.json            아메리카 지도 목록 20 + 미국 삽입 틀 8                             (U5-1 새로)
  georef.mjs·georef-cli.mjs   families 에 stereographic·orthographic, fitFrom(쪽 이동량)       (U5-2·3a 고침 — georef 는 도장 입력, 기록)
  country_class.py        units: admin1(하위 행정 구역판 regionClass)                        (U5-3d 고침)
  zones.py                빗금 각도·색(hatch.angle·color)                                  (U5-3h 고침)
  build_layers.mjs        regionClass·pathFlow·unitSymbols·compareOutline 레이어 자료       (U5-3·U5-4 고침)
  build_places.mjs·places.py  여러 일반도 지명 합치기(큰 축척 우선)                          (U5-3b·U5-5 고침)
  build_basemap.mjs       cutIsos 로 GUF(설정만 — 코드는 U4-9 그대로일 것)                  (U5-9)
  charts_read.py          (필요하면) 지시선 있는 고리·측정 선/막대                            (U5-7)
src/atlas/
  fitCore.js              registerFamily(등록 자리만)                                       (U5-3a)
  projections.js·mapView.js·zoomer.js  registerProjection·지구본 끌어 돌리기 자리            (U5-3c)
  americasExtra.js        installAmericasExtras(): 평사·정사·지구본·pathFlow·compareOutline·unitSymbols (U5-3 새로)
  chartSymbols.js         지시선(leader) — 키가 있을 때만                                    (U5-3g — u4 조각 크기 관문)
  layers.js·layerStyle.js 빗금 각도·색 키                                                   (U5-3h — 공유, 크기 확인)
sims/atlas-u5-americas/      index.html · main.js · data/*(생성물)                          (U5-9 새로)
content/atlas/u5/            topics.json · overrides.json · photos.json · coloring.json · issues.md
docs/assets/atlas/u5/        photo/ · page/
tests/atlas/units/u5.{layers,places,photos,content}.test.mjs                                   (U5-4~8)
tests/atlas/americasExtra.test.mjs                                                            (U5-3)
scripts/atlas/tests/test_maps_u5.py · test_text_u5.py                                          (U5-1·U5-8)
$ATLAS_WORK/raw/ne-admin1/ · raw/statcan-cd2016/(선택)                                         (U5-D 내려받음 — 저장소 밖)
```

---

## U5-G0. u4 기준선 + 낡은 시험 (엔진·공유 스크립트를 바꾸기 전에)

### Task U5-G0: `regress_unit --unit u4 --baseline` · hub 시험 고침

**Files:** Modify `tests/atlas/hub.test.mjs`; Output `$ATLAS_WORK/units/u4/baseline/`(저장소 밖)

까닭: u4 가 공개되었고(15b696a), 이 단원은 엔진(도법 등록·지구본·지시선·빗금 각도)과 공유 파이프라인(georef·country_class·zones·build_layers·places)을 고친다. 아프리카 계획 U4-11 끝에 찍기로 한 u4 기준선이 아직 없다(`units/u4/baseline` 없음 — 2026-10-21 확인).

- [x] **Step 1: 낡은 시험** — `tests/atlas/hub.test.mjs:48` 「공개 전 registry 단원도 준비 중」은 `atlas-u4-africa`를 공개 전 예로 쓴다. u4 가 `docs/versions.json`에 들어가 `published`가 되었으므로 예를 **`atlas-u5-americas`(order 5, page 40)**로 바꾼다(검사 뜻 그대로 — 계획 쪽수 `ATLAS_PLAN`의 u5 항목). `npm test` → Node 실패 0.
- [x] **Step 2: u2·u3 지금 상태 확인** — `node scripts/atlas/regress_unit.mjs --unit u2 --check`·`--unit u3 --check`(낡음 경고면 embed·compare_shots·compare 다시). 기대: u2 도장만 다름 2(coloring.json·basemap.json), 캡처 41장 화소 차 0, 0/9/134/24, 조각 +0.956% / u3 도장만 다름 2, 캡처 31장, 0/26/118/42, +0.238%.
- [x] **Step 3: u4 기준선** — `node scripts/atlas/compare_shots.mjs --unit u4`(42장) → `node scripts/atlas/compare.mjs --unit u4`(결과 **0/34/104/41** 확인) → `npm run embed -- atlas-u4-africa`(**1,593,565 B** 근처 — 다르면 멈추고 까닭) → `node scripts/atlas/regress_unit.mjs --unit u4 --baseline` → 곧바로 `--check`로 「다른 파일 0, 화소 차 0」(도구 자체 검사). 캡처를 한 번 더 찍고 compare 다시 → `--check`도 같음(결정성 — u3 처럼). 해시 항목 수(저장소·작업 폴더 나눠)·캡처 42장·대조표 수·조각 크기를 「실행 중 결정」에.
- [x] **Step 4:** `npm test` 수를 적고 커밋(`tests/atlas/hub.test.mjs`).

---

## U5-D. 자료 내려받기 (Natural Earth 밖 — U5-3d·U5-4 전에)

### Task U5-D: 하위 행정 구역 자료

**Files:** Output `$ATLAS_WORK/raw/ne-admin1/`, (선택) `$ATLAS_WORK/raw/statcan-cd2016/`, 각 폴더 `SOURCE.txt`(주소·판·받은 날·사용 조건 — `raw/ne-raster/SOURCE.txt` 꼴)

로컬 조사(2026-10-21): `raw/ne/`에는 0단계(나라)·경계선·분쟁 면·육지·호수·하천·빙하·도시만 있고 **1단계 행정 구역(주·도)이 없다**. 저장소 node_modules 는 `world-atlas`(나라만)·`topojson-client`뿐 — 미국 주 자료(`us-atlas`) 없음. 작업 폴더·저장소에 캐나다 센서스 구역·멕시코 주 자료 없음.

| 자료 | 쓰는 곳 | 출처 · 사용 조건 | 기본값 |
|---|---|---|---|
| Natural Earth `ne_10m_admin_1_states_provinces`(GeoJSON 또는 shp → mapshaper 로 GeoJSON) | 46쪽 미국 주 4장(`regionClass` 면), 47쪽 멕시코 주 경계선(마킬라도라 바탕) | naturalearthdata.com / github `nvkelso/natural-earth-vector`(raw/ne 다른 파일과 **같은 판** — 파일 머리 판 번호 확인), **퍼블릭 도메인** | **받음** |
| 캐나다 통계청 2016 센서스 구역 지도 경계 파일(`lcd_000b16a_e.zip`, 293구역) | 46쪽 캐나다 언어(교과서 출처 = 캐나다 통계청 2016) | statcan.gc.ca, **Open Government Licence – Canada**(출처 표기 「Statistics Canada」) | **받지 않음** — 유럽 이탈리아·벨기에처럼 교과서 채움 도형을 되돌린다(U5-4). 해안 어긋남(중앙값)이 1pt 를 넘거나 구역 경계가 바탕 지도 국경과 크게 어긋나면 그때 받아 `regionClass`로(「실행 중 결정」에 까닭) |
| 미국 통계청 지도 경계 파일 `cb_2020_us_state_20m` | (Natural Earth 주 면이 거칠면 대안) | census.gov, 퍼블릭 도메인 | 받지 않음(대안) |
| 멕시코 INEGI Marco Geoestadístico | (대안) | INEGI 이용 조건 | 받지 않음 — NE 1단계로 충분 |

- [ ] **Step 1:** 새 빈 폴더 `raw/ne-admin1/`에 Natural Earth 10m 1단계 행정 구역(states_provinces)을 받는다(내려받기 도구·주소는 실행 때 확인 — 웹 접근이 필요하면 코디네이터에게 승인). zip 이면 그 폴더 안에 풀고, 스크립트는 그 폴더 밖에서 경로를 인자로 받아 `python -I`·mapshaper 로 읽는다.
- [ ] **Step 2:** 필요한 나라만 뽑아 작업 파일로: `raw/ne-admin1/usa.geojson`(`adm0_a3 == 'USA'` — 50주 + DC, 이름 `name`·`postal`), `raw/ne-admin1/mex.geojson`(32개 주). 개수·경위도 범위·속성 이름을 `SOURCE.txt`와 「실행 중 결정」에(실제 속성 키 이름은 파일에서 확인 — 대소문자 판마다 다름).
- [ ] **Step 3:** 확인 그림 — 미국 주·멕시코 주를 46·47쪽 지면 크기로 그려(`units/u5/admin1-check.png`) 교과서와 주 수·모양이 같은지 눈으로(교과서 미국 지도에 DC 가 따로 칠해졌는지 확인 — 없으면 DC 는 메릴랜드 값으로 고침).
- [ ] **Step 4:** 저장소에 넣는 파일은 없음(작업 폴더). 커밋 없음 — 「실행 중 결정」에 받은 판·크기·주소·조건.

---

## U5. Ⅴ 아메리카 (40~47쪽) — 조각 `atlas-u5-americas`

### Task U5-1: 단원 설정 뼈대와 지도 목록 `config/u5.json` · `maps_u5.json`

**Files:** Create `scripts/atlas/config/u5.json`, `scripts/atlas/maps_u5.json`, `scripts/atlas/tests/test_maps_u5.py`; Modify `scripts/atlas/units.json`

- [x] **Step 1:** `units.json`에 `"u5": { "sim": "atlas-u5-americas", "title": "Ⅴ. 아메리카", "pages": [40, 47], "config": "config/u5.json" }`.
- [x] **Step 2:** `config/u5.json`은 **u4 설정의 키 구조를 복사**해 만든다(값은 비우거나 아메리카 값): `maps: "../maps_u5.json"`, `out: "sims/atlas-u5-americas/data"`, `photos.outJson: content/atlas/u5/photos.json`, `photos.assetDir: docs/assets/atlas/u5`, `photos.assetPrefix: "u5/"`, 작업 파일 키는 `units/u5/…`, 도장은 `@unit/…`, 색칠하기 라벨 `units/u5/text/p41-labels.json`. `tint`·`natural` 절 없음. **`georef.families`**: 1단계 8개 + `stereographic`·`orthographic`(U5-3a 등록 뒤에만 이름이 풀림 — u2·u3·u4 설정은 지금 목록 그대로라 영향 없음), 지도 항목 `families`로 좁힘(40·41쪽 = 평사, 46쪽 지구본 = 정사, 47쪽 세계 = 원통·의원통). `basemap.unitBoxes` 어림 **`[[-93, 7, -59, 28]]`(카리브·중앙아메리카만)** — 아메리카 전체를 10a 로 넣으면 캐나다 북극 제도·칠레 해안 때문에 바탕 지도 상한(1,024,000 B)을 넘을 것(U5-9 에서 실측), 작은 섬나라가 모인 곳만 10a. `places.neBox` 어림 `[-170, -57, -20, 84]`(40쪽 틀 — U5-2 뒤 fit 으로 다시). `basemap.levels` 10a 에 `simplifyByIso` 없음(한반도 밖).
- [x] **Step 3:** `python -I scripts/atlas/find_maps.py 40 47`(40·42·43쪽 작은 그림 수천 개는 크기 하한 옵션으로) + 쪽 렌더를 보며 `maps_u5.json`. kind 는 앞 단원 목록 + `general-inset|globe-migration|canada-language|us-ethnic|us-inset|ethnic|tnc-hq|tnc-hq-inset|tnc-agri|maquila`.
  - 지도 20 + 삽입 틀 8:

    | id | kind | 지면 | 기준점 길 |
    |---|---|---|---|
    | `p40-americas` | general | 평사 1:77,000,000, 쪽 전체(삽입 틀·제목 상자·범례 덮개), 경위선 글자 33 | 교차점 + 도시 기호(`city_controls`) |
    | `p40-central` | general-inset | 밀러 1:43,000,000, 틀 약 [52,458,393,648], 자체 경위선 글자(90°W~50°W·10°N·20°N) | 교차점 + 도시 기호(삽입 지명) |
    | `p41-coloring` | coloring | 평사 1:77,000,000, 쪽 전체, 개관 글 상자 약 [62,530,330,660] | `shapes.target: countries` + `insetPt`(나라 띠) |
    | `p42-north` | general | 람베르트 정각 원뿔 1:25,000,000, 경위선 글자 34, 우리나라 실루엣 덮개 | 교차점 + 도시 기호 |
    | `p43-south` | general | 람베르트 정적 방위 1:28,000,000, 경위선 글자 31, 실루엣 덮개 | 교차점 + 도시 기호 |
    | `p44-relief` | relief | 자연색 래스터, 활동하기 상자·사진 덮개 | 섬·호수 중심(오대호·그레이트솔트호·위니펙호·티티카카호·니카라과호, 쿠바·히스파니올라·자메이카·푸에르토리코·갈라파고스·뉴펀들랜드) |
    | `p45-climate` | climate | 래스터, 곡선 경위선 + 글자, 범례 약 [55,355,165,480] | 교차점 + 섬·호수 |
    | `p45-jan` · `p45-jul` | temp-precip | 작은 지도 2(강수 래스터 + 등온선) | 섬·꺾인 점, 안 되면 `projectionFrom: p45-climate` |
    | `p46-migration` | globe-migration | **정사(지구본)**, 원판 약 [80,99,198,216] | 래스터 대륙 꺾인 점(`land_shapes` 래스터 + `tips`), `families: ['orthographic']` |
    | `p46-canada` | canada-language | 작은 캐나다(500km) | 해안 꺾인 점 + 호수(위니펙·그레이트베어·그레이트슬레이브), 허드슨만 |
    | `p46-us-european` | us-ethnic | 미국 본토(500km) | 꺾인 점 + 오대호 |
    | `p46-us-african` · `-hispanic` · `-asian` | us-ethnic | 같은 바탕 3장 | **`fitFrom: {map: 'p46-us-european', dx, dy}`**(쪽 이동량 — U5-2), 짝 검사만 |
    | `p46-us-<4>-ak` · `-hi` (8) | us-inset | 알래스카·하와이 삽입 틀(1,000km) | 유럽계 두 틀만 shapes(하와이 섬 중심·알래스카 꺾인 점), 나머지 6 = `fitFrom` 이동량. 맞지 않으면 `approx: true`(설계 §7) |
    | `p46-ethnic` | ethnic | 중앙·남아메리카(1,000km), 고리 5·범례 덮개 | 섬 중심(쿠바·히스파니올라·자메이카·푸에르토리코·트리니다드) + 꺾인 점 |
    | `p47-hq` | tnc-hq | **세계, 태평양 중심**, 적도 「0°」 | 세계 섬 중심 + 꺾인 점, `families` 원통·의원통 |
    | `p47-hq-sv` | tnc-hq-inset | 실리콘 밸리 확대 삽입 약 [548,258,745,433] | 샌프란시스코만 해안 꺾인 점, 안 되면 `approx: true` |
    | `p47-agri` | tnc-agri | 세계, 태평양 중심 | 같음, 같은 바탕이면 `projectionFrom: p47-hq` |
    | `p47-maquila` | maquila | 멕시코(300km) | 해안 꺾인 점(바하칼리포르니아·유카탄) |

  - 지도로 넣지 않는 것: 47쪽 만화 6칸(래스터 사진 카드 + 원본 쪽 부분), 47쪽 A사 기기 그림(벡터 삽화 → 렌더 사진 카드 — 「작은 지도 6」이지만 기기 화면 장식이라 경위도로 맞추지 않음), 42·43쪽 우리나라 실루엣(지도가 아니라 U5-3i 윤곽 레이어의 교과서 자리 기록 — 덮개).
- [x] **Step 4: 개수 대조** — `python -I -c "import json;print(len(json.load(open('scripts/atlas/maps_u5.json',encoding='utf-8'))))"` = 28(지도 20 + 삽입 틀 8). 설계 §5.3(약 22)과 다른 까닭을 「실행 중 결정」에.
- [x] **Step 5: 테스트** `scripts/atlas/tests/test_maps_u5.py`(test_maps_u4.py 꼴): id 유일·쪽 40~47·bbox 가 쪽 안·kind 가 정해진 목록·`georef:false` 아닌 지도는 `graticuleLabels` 또는 `shapes`/`controls`·`projectionFrom`/`fitFrom`이 가리키는 지도가 목록에 있음·`fitFrom` 이동량이 쪽 안·`families` 이름이 알려진 도법(등록 도법 포함).
- [x] **Step 6:** 커밋(`scripts/atlas/units.json scripts/atlas/config/u5.json scripts/atlas/maps_u5.json scripts/atlas/tests/test_maps_u5.py`).

### Task U5-2: 기준점과 경위도 맞추기

**Files:** Modify `scripts/atlas/maps_u5.json`, `scripts/atlas/config/u5.json`(`cityControls`·`shapeControls`·`unitBoxes`), `scripts/atlas/georef-cli.mjs`(`fitFrom`); Test `scripts/atlas/tests/test_controls.py`·`tests/atlas/georef.test.mjs`에 u5 경우

**선행:** U5-3a(평사·정사 등록)가 먼저 커밋되어야 40·41·46쪽 맞추기가 돈다(U5-3a 는 작고 엔진 쪽이라 U5-1 직후 바로).

- [x] **Step 1:** `python -I scripts/atlas/extract_vectors.py --unit u5 --controls all`. 40쪽 경위선 글자(DINPro, `˚`)와 교차점 — **적도처럼 가는 사각 채움(PDF `re`) 경위선은 후보가 아님**(U4-2 — 적도 교차점이 빠져도 공유 스크립트를 고치지 않음). 찾아보기 격자 글자(40쪽 파랑 A~H·**빨강 1~7**·삽입 I~L/1~3, 42·43쪽 파랑·초록)는 기준점이 아님. 40쪽 삽입 틀 안 교차점은 `p40-central`로(본 지도 `excludeBoxes` — 유럽 29쪽 아이슬란드 꼴).
- [x] **Step 2:** 40·42·43쪽 도시 기호 기준점: 먼저 `python -I scripts/atlas/places.py --unit u5`(지명 원료) → `node scripts/atlas/city_controls.mjs --unit u5 --write`(설정 `cityControls` = u4 값 복사 + `neBox`). 동명 다른 도시(산호세·킹스턴·산티아고·런던·해밀턴·코르도바·발렌시아)는 짝에서 빠지는지 확인. 카리브 수도(옮겨 그린 기호)는 MAD 로 빠질 것 — U5-5 `snapAlways` 후보로 기록.
- [x] **Step 3: `fitFrom`(새 키, georef-cli — 있을 때만)** — 같은 바탕 지도를 쪽 안 다른 자리에 되풀이한 지도(46쪽 미국 4장 × 본토·알래스카·하와이): `fitFrom: {map, dx, dy}`이면 그 지도 fit 의 닮음 변환 `sim.tx += dx; sim.ty += dy`(TPS 도 같은 이동 — 기준점째 옮김)로 fit 파일을 만들고, 그 지도 자체 기준점(있으면)과의 잔차만 보고한다. dx·dy 는 두 지도 틀(쪽 글자 「(미국 통계청, 2020)」·축척 막대 자리)의 차로 잼 — 시험: 합성 fit 에 이동량을 주면 같은 경위도가 정확히 dx·dy 만큼 옮겨짐, `fitFrom` 없으면 georef-cli 출력 바이트 그대로(u2·u3·u4 fit 다시 → 같음). `georef.mjs`를 고치면 u2 도장 입력이라 「공개본」 규칙대로 기록(가능하면 georef-cli 쪽에서만).
- [x] **Step 4:** 눈금 없는 지도는 `python -I scripts/atlas/land_shapes.py --unit u5 <id>` → `python -I scripts/atlas/shape_controls.py --unit u5 <id>`. 44쪽 래스터는 섬·호수 중심만(유럽 28쪽 결정). 46쪽 지구본은 래스터 대륙 + 벡터 식민지 면 → `render: 'all'` + `seaWhite`(바다가 파랑 래스터면 `seaBlue` 규칙이 맞는지 먼저 확인)·`tips`, 처음 식은 교과서 회전 어림(중심 약 30°W·20°N — `seeds` 두세 곳). 작은 지도가 5번 안에 수렴하지 않으면 **`projectionFrom`**(U4-2), 처음 식은 `{fromMap, pts}`.
- [x] **Step 5:** `node scripts/atlas/georef-cli.mjs --unit u5 --all` → 표(`id family rmsPt rmsMm`). 기대: 40·41쪽 `stereographic`(지면 「입체 투영 도법」 — 중심 어림 80°W·15°N), 40쪽 삽입 `miller`, 42쪽 `conicConformal`, 43쪽 `azimuthalEqualArea`, 46쪽 지구본 `orthographic`, 47쪽 세계 원통(밀러·등장방형 중 — 중심 약 150°E). 합격: **평균 잔차 ≤ 0.5mm**, 넘으면 기준점 보강 → `projectionFrom`/`fitFrom` → 그래도 넘으면 `approx: true`(미국 삽입 틀·실리콘 밸리는 처음부터 approx 후보).
- [x] **Step 6:** `node scripts/atlas/georef-cli.mjs --unit u5 --verify all` → `units/u5/geo/<id>.verify.png` 눈으로(해안선이 교과서 해안·국경 위). 「실행 중 결정」에 U4-2 꼴 표(도법(중심)·기준점·rms pt/mm·평균 mm(LOO)·겹 나누기 pt·km·해안 어긋남).
- [x] **Step 7:** 테스트 — `test_controls.py`에 `p40-americas`·`p42-north`·`p43-south` 기준점 ≥ 12·모두 경위도 범위 안, `georef.test.mjs`에 u5 fit 파일이 있으면 rmsMm ≤ 0.5(approx 제외)·`p40-americas.family === 'stereographic'`·`p46-migration.family === 'orthographic'`·`p47-hq` 중심 경도 120~180·`fitFrom` 지도의 sim 이동 = dx·dy.
- [x] **Step 8:** `unitBoxes`는 카리브·중앙아메리카 상자를 `p40-central` 틀 되돌린 범위로 다시. `places.neBox` = 40쪽 틀 41×41 격자를 fit 으로 되돌린 범위(알래스카 알류샨이 날짜변경선을 넘으면 상자 둘 — 추코트카 꼴). 커밋. **u2·u3·u4 회귀**: 공유 스크립트를 고쳤으면 `regress_unit --unit u2|u3|u4 --check`.

### Task U5-3: 엔진·파이프라인 아메리카 기능 (설계 §6 — 아메리카에서 처음 쓰는 것)

**Files:** Create `src/atlas/americasExtra.js`, `tests/atlas/americasExtra.test.mjs`; Modify `src/atlas/fitCore.js`(등록 자리)·`projections.js`·`mapView.js`·`zoomer.js`(지구본 자리)·`chartSymbols.js`(지시선)·`layers.js`·`layerStyle.js`(빗금 각도·색), `scripts/atlas/georef.mjs`(families 이름 풀기)·`country_class.py`·`zones.py`·`build_layers.mjs`·`build_places.mjs`; Test `tests/atlas/fitProject.test.mjs`·`layers.test.mjs`·`atlasLayers.test.mjs`·`ui.test.mjs`·`scripts/atlas/tests/test_country_class.py`·`test_zones.py`

각 하위 기능 = 실패하는 테스트 → 구현 → 통과 → **u2·u3·u4 회귀(`regress_unit --check` 셋 다, 캡처 다시 찍음)** → 커밋. 새 동작은 모두 **자료·설정 키(또는 등록)가 있을 때만** 켜진다. 하위 기능마다 u2 조각 크기를 재서 「실행 중 결정」에(남은 여유 약 0.9KB — 넘으면 멈춤).

- [x] **3a 평사·정사 도법 등록 `registerFamily`** (설계 §6.1-3, 40·41쪽 입체 투영·46쪽 지구본):
  - `fitCore.js`: `FAMILIES`(고정 8개, Object.freeze 그대로) 옆에 등록부 `EXTRA_FAMILIES` + `registerFamily(name, fn)` + `familyOf(name)`(고정 → 등록 → 없으면 undefined). `fitProject.makeFitForward`·georef 가 `FAMILIES[name]` 대신 `familyOf(name)`(u2 이미지 레이어 overlay fit 은 밀러·로빈슨 등 고정 8개라 그대로). 늘어나는 공유 코드는 수십 B.
  - `americasExtra.js`: `registerFamily('stereographic', (p) => geoStereographic().rotate([-p[0], -p[1]]))`, `registerFamily('orthographic', (p) => geoOrthographic().rotate([-p[0], -p[1]]).clipAngle(90))`. 파이프라인(georef.mjs·georef-cli·pt2lonlat)은 Node 라 크기 상관없음 — georef 가 시작할 때 `installAmericasFamilies()`(americasExtra 의 도법만 부분)를 늘 부른다(u2 지도 fit 은 `families` 고정이라 후보에 안 들어감 — 설계 §6.1-3 주의).
  - 시험: 등록 전 `familyOf('stereographic') === undefined`·`makeFitForward({family:'stereographic'})` 오류(「모르는 교과서 도법」), 등록 뒤 합성 기준점(평사로 만든 40점 + 잡음 0.1pt)에서 `fitControls(cps, ['stereographic', 'azimuthalEquidistant'])`가 평사를 고르고 중심이 ±0.5°, 정사도 같음, **u2 지도 항목 families 기본값에 새 이름이 없음**(PHASE1_FAMILIES 8개 고정 시험), u2·u3·u4 `georef-cli --all` 다시 → fit 바이트 같음.
- [x] **3b 여러 일반도 지명 합치기 + 삽입 지명** (설계 §6.1-7, 40쪽 중앙아메리카 삽입·Q1·Q2):
  - 지금 u2 는 16·18·19쪽 지명(`text/places-p16|p18|p19-*.json`)을 places.json 한 벌로 합친다 — 그 합치기 규칙(같은 이름 판정·rank)을 먼저 읽고 기록. 새 설정 키 `places.mergePriority: ['p42-north', 'p43-south', 'p40-central', 'p40-americas']`(있을 때만): 같은 이름(alt 포함)·같은 종류이고 서로 `mergeKm`(기본 30) 안이면 **앞 지도의 자리·글꼴 rank** 하나만 남기고 `from: [지도 id…]` 기록, 영문(`en`)은 어느 지도에 있든 붙임. 다른 자리의 같은 이름(산호세 둘 등)은 그대로 둘. rank 는 지도마다 축척이 달라 글자 크기 표(places.styles)를 지도 kind 별로 둘 수 있게(`styles` 안 `maps` 조건 — 없으면 공통).
  - 일반도 묶음 바로가기 「중앙아메리카」 = `p40-central` 틀 되돌린 범위(Q2 — 주제 view 하나 더, 엔진 작업 없음).
  - 시험(Node, build_places 순수 함수): 두 지도에 같은 이름 10km 차 → 하나(앞 지도 자리), 50km 차 → 둘, 다른 종류(산 ↔ 도시) → 둘, `mergePriority` 없으면 지금 합치기 결과 그대로(u2 places.json 다시 → 바이트 같음).
- [x] **3c 지구본 보기 + 경로 화살표** (설계 §6.1-2, 교사 §8 Q2 답 — 46쪽 인구 이동):
  - 보기: `registerProjection('globe', …)` — `projections.js`의 `PROJECTIONS`·`makeProjection`이 등록부도 보게(자리만 공유). 지구본 = `geoOrthographic().clipAngle(90)`, 상태 `rotate [λ, φ]`, 화면 원판 지름 = 지도 칸 짧은 변의 약 90%. **끌기 = 회전**(`zoomer` 끌기 콜백을 보기 종류가 바꿀 수 있게 — 지구본이면 dx·dy → λ·φ 변화, φ 는 ±85° 로 자름), 휠·단추 = 확대(scale), 「세계 전체 보기」 = 처음 회전·크기. 대서양/태평양 단추 숨김, 평면 도법 ↔ 지구본 전환은 짧은 페이드(보간 안 함 — 설계 §6.1-1 극 보기와 같은 규칙). 바다 원판 채움·가장자리 선, 경위선 15°. 음영·고도 색·자연색 역투영 격자는 투영 독립 — 원판 밖 화소는 그리지 않는지 시험. 주제 view 자료 `projection: 'globe', rotate: [λ, φ]`(키가 있을 때만 — 없으면 지금 보기), 묶음을 떠나면 앞 도법·중심으로 되돌림(`centerLonOf` 꼴).
  - 경로 화살표 `pathFlow`(registerLayerType): 자료 `{type:'pathFlow', items:[{id, cls, path:[[lon,lat]…], dashed?}], legend}` — 교과서 곡선(벡터 경로)을 0.5pt 간격으로 나눠 fit 으로 되돌린 경위도 줄(build_layers 가 만듦). 그리기 = geoPath 선(지구본 뒷면은 자동으로 잘림) + 끝 접선 방향 화살촉(`arrowHead` 재사용), 선 굵기 `flowWidthPx`, 점선(노예 이동). 범례 = 선 견본(색·점선).
  - 시험: 등록 전 `layerFromRef({type:'pathFlow'})` 「모르는 레이어 종류」, 등록 뒤 지구본 회전 [30, −20] 에서 (−30°, 20°) 점이 원판 가운데, 뒷면 점은 그려지지 않음(`proj.clipAngle` 결과 null), 끌기 100px → λ 변화가 원판 반지름 비에 맞음, 평면 → 지구본 → 평면 전환 뒤 앞 도법·중심 경도 그대로, pathFlow 화살촉 각 = 마지막 두 점 방향, 점선 키, `labelObstacles` 0(선만). 성능은 U5-11.
- [x] **3d 하위 행정 구역 단계구분 `regionClass`** (설계 §6.1-6·§7, 46쪽 미국 주 4장):
  - 파이프라인: `country_class.py`에 레이어 설정 `units: {source: 'raw/ne-admin1/usa.geojson', key: 'postal', name: 'name'}`가 있으면 나라 대신 그 면들로 표본(안쪽 표본점 → **그 면이 든 지도 fit**: 본토는 `p46-us-*`, 알래스카·하와이는 `insets: {AK: 'p46-us-european-ak', HI: '…-hi'}`로 고른 삽입 fit) → 범례색 Lab ΔE 다수결. 출력은 바탕 지도에 없는 면이라 **면 GeoJSON**(`type: 'area'`, feature 마다 `cls`·`name`, mapshaper 단순화 — 레이어당 목표 ≤ 30KB). 엔진 작업 없음(면 레이어 그대로). 키가 없으면 지금 동작 그대로.
  - 네 장이 같은 주 도형을 쓰므로 도형을 한 파일로 나누는 레이어 종류(`regionClass` + `geometryRef`)는 **U5-4 에서 레이어 합계가 예산(750KB)을 넘을 때만** 만든다(등록 길) — 기본은 면 GeoJSON 4개.
  - 시험(Python): 합성 쪽 — 두 색으로 칠한 사각 「주」 셋(삽입 틀 하나 포함) → 주마다 맞는 분류, 삽입 fit 을 안 주면 그 주는 「분류 없음」 경고, `units` 없으면 countryClass 결과 그대로(u4 country_class 다시 → 같음).
- [ ] **3e 크기 비례 원 + 실리콘 밸리 확대 창** (설계 §6.2-12, 47쪽 본사):
  - 이미 있는 것: 점 기호 지름 `symbolPx(properties.size pt)`, 크기 단계 `sizeBy 'class'`(유럽 30쪽), 겹친 원 범례 `legendStyle: 'nested-circles'`(`nestedCircles`), 확대 창 `symbolInset`(1단계 싱가포르 — `src/atlas/inset.js`). **먼저 이것들로 되는지 확인하고 새 코드는 모자란 것만.**
  - 파이프라인: 분홍 원(#f17191) 채움마다 지름(pt) → 값 = 범례 겹친 원(200·100·10 백억 달러 — 지름 ∝ √값인지 범례 세 원으로 확인)으로 환산, 자리 = **지시선이 있으면 그 끝**(검은 0.15pt 선의 원 반대쪽 끝), 없으면 원 가운데 → fit 으로 되돌림(Q7 기본값). 실리콘 밸리 삽입 안의 원은 `p47-hq-sv` fit 으로. 출력 `properties.size`(교과서 지름), `value`, `sizeBy: 'sqrt'`(새 값 — 확대해도 지름 비 그대로: 모든 size 에 배율 하나, `classSymbolPx` 꼴), 큰 원부터 그림(작은 원이 위), 반투명.
  - 앱: `sizeBy 'sqrt'`가 `classSymbolPx` 길을 타게(공유 코드 한 줄 — 크기 확인, 넘으면 등록 길). 확대 창 설정 `insets`(main.js) = 실리콘 밸리 상자(샌프란시스코만 [-122.6, 37.2, -121.7, 37.9] 어림 — 삽입 틀 되돌림).
  - 시험: 지름 비 = √(값 비)(범례 200 ↔ 10 → 4.47±0.05), 지시선 끝 자리 사용, 큰 원 먼저 그림, `sizeBy 'class'`(유럽) 결과 그대로.
- [ ] **3f 네모 단위 기호 `unitSymbols`** (설계 §6.2-12, 47쪽 마킬라도라):
  - 자료: `{type:'unitSymbols', items:[{id, state, lonlat, series:[{cls, count}]}], legend:[{cls, label:'1칸당 50개 공장', color:'#0066b2', unit:50}, {cls, label:'1칸당 2만 명 근로자', color:'#f5811f', unit:20000}]}` — build_layers 가 교과서 네모(파랑·주황 작은 사각 채움)를 열(같은 x·연속 y)로 묶고, 열 묶음을 그 아래 끝 가운데 자리의 주(NE 1단계 MEX 면 — 자리를 fit 으로 되돌려 포함 판정)에 붙임. 칸 수는 센 값 그대로(측정 아님 — 정확), 값 = 칸 수 × 단위(「약」 표시 없이 칸 수만 보이게 — 교과서도 칸만).
  - 앱(registerLayerType): 주 자리에 칸을 교과서처럼 세로 열로 쌓음(한 열 최대 n 칸 — 교과서 최대 열 길이), 두 계열은 나란히, 칸 크기 = 화면 4px 안팎(확대 단계 `barMetrics` 꼴), 누르면 「○○주 · 공장 n칸(×50) · 근로자 n칸(×2만 명)」 말풍선, `labelObstacles` = 칸 묶음 상자, 범례 = 네모 견본 + 글.
  - 바탕: 멕시코 주 경계선(NE 1단계 MEX — 회색 가는 선, 같은 레이어의 선 feature 또는 따로 `area` 선 레이어).
  - 시험: 합성 쪽 열 3개(5·3·2 칸, 두 색) → 계열별 칸 수, 열이 주 경계 밖이면 가장 가까운 주 + 경고, 앱 칸 수 = 자료 칸 수, 확대해도 칸 비 그대로, 등록 전 「모르는 레이어 종류」.
- [ ] **3g 고리 기호 지시선 `leader`** (46쪽 민족 고리 5 — chartSymbols 재사용):
  - `chartSymbols` 항목에 `leader: [lon, lat]`(있을 때만)이면 고리 가장자리 → 그 점까지 점선(교과서 검은 점선 0.3pt 꼴, 화면 1px [3 2]), 끝에 작은 점. 키가 없으면 지금 그리기 그대로(**u4 조각·화소 그대로** — chartSymbols.js 는 u4 도 쓰는 등록 길 코드라 u4 조각 크기 ±1% 안인지 확인).
  - build_layers `chartSymbols` 설정 `items[].leaderPt`(교과서 지시선 끝 — 나라 안쪽 점) → fit 으로 되돌림, `lonlat`은 U4-4 규칙대로 설정 + `_why`.
  - 시험: leader 있으면 선 1개(끝 = 투영한 leader), 없으면 SVG 요소 수 지금과 같음, 고리를 옮겨 다시 그려도 지시선 끝 고정.
- [ ] **3h 빗금 각도·색 `hatch.angle`·`hatch.color`** (46쪽 중남미 「혼혈」 가로 분홍 줄, 「아프리카계」 사선 검은 빗금):
  - 파이프라인: 빗금 범례 항목에 `angle`(도, 0 = 가로)·`color`(교과서 줄 색 — #ef5aa0 0.36pt 등)를 레이어 설정에서 넘김(zones `hatch`·features). 줄 면은 1단계 `hatch`(윤곽 선 → 면) 또는 U4-4 `hatch.clips`(잘라 그리기 경로) 중 지면에 맞는 길.
  - 앱: `layers.js` 빗금 패턴이 범례 항목 `angle`·`color`를 보고 타일을 만듦(없으면 지금 45°·지금 색 — u2 고산 기후·u4 사헬 빗금 화소 그대로). 범례 견본도 같은 각도·색.
  - 시험: angle 0 → 가로 줄 타일, 없으면 지금 타일 바이트 같음, 견본 CSS 각도.
- [ ] **3i 같은 축척의 우리나라 윤곽 `compareOutline`** (설계 §6.4-22, 교사 §8 Q3 답, Q3 모드):
  - 자료(build_layers `source: 'korea-outline'`): Natural Earth 10m `KOR`+`PRK` 면(+ 독도·울릉도 — 10m 에 있는지 확인)을 mapshaper 로 단순화(≤ 15KB), 교과서 자리 = 42·43쪽 실루엣 넓이 중심을 그 지도 fit 으로 되돌린 경위도(`home`), 모드 `sameLat`(42쪽) / `antipode`(43쪽 — 꼭짓점마다 (−φ, λ+180) 로 바꾼 거울상, `home` = 실제 대척점과 교과서 자리 차를 기록), 지면 글자(「같은 축척과 같은 위도의 우리나라」·「같은 축척의 우리나라와 대척점」)를 `label`로.
  - 앱(registerLayerType): 윤곽 = 회색 반투명 면 + 테두리, 글자. **끌기 = 구면 회전**: 윤곽 넓이 중심 c 를 끌어 놓은 경위도 p 로 보내는 회전(c → p 대권 축 회전 — d3 `geoRotation`)을 모든 꼭짓점에 적용(그래서 어느 도법에서든 실제 크기 — 메르카토르에서 북쪽으로 끌면 커져 보임). Q3 답이 「동서로만」이면 `sameLat` 은 경도만 바꿈. 「교과서 자리로」 단추(사이드바), 키보드 화살표 1°씩(접근성), 지도 이동(pan)과 구별되게 윤곽 위에서만 끌기 잡음(zoomer 의 끌기 캡처 규칙 — 핀 끌기 없음이라 새 자리, 등록 길 안에서 처리).
  - 시험: 회전 뒤 모든 꼭짓점 쌍의 대권 거리 그대로(1e-9), 넓이 중심이 p 로, antipode 모드 꼭짓점 = (−φ, λ+180), sameLat 동서 끌기에서 위도 그대로, 「교과서 자리로」 = home, 등록 전 오류, 지도 끌기와 윤곽 끌기가 섞이지 않음(가짜 DOM).
- [ ] **3j 값 붙은 기호 재사용 확인** (47쪽 D사 — 기호 5종 + 지역별 판매 지사 수):
  - 유럽 31쪽 리스본 「값 붙은 기호」(`valueIconPath` 등)와 1단계 기호 레이어 `legendShapes`(원·네모)로 해외 농장(주황 원)·숙성 창고(빨강 네모)·샐러드 공장(초록 네모)·본사(건물 — 선 아이콘이 없으면 네모 + 「본사」 글자)·판매 지사(지게차 — 값 글자 「112개」 등)를 그리는지 확인. 모자란 모양만 등록 길로. 엔진 고침이 없으면 이 칸은 「확인만」으로 닫음.
- [ ] 끝나면 **리뷰 관문**(엔진 바뀐 것 코드 리뷰) + u2·u3·u4 회귀(조각 다시 → 캡처 41·31·42장 → compare → `regress_unit --check` 셋 다): data 해시 같음, 캡처 화소 차 0, 조각 크기 +1% 안(u2 는 남은 여유 약 0.9KB 안 — 하위 기능마다 잰 값 표를 「실행 중 결정」에).

### Task U5-4: 주제 레이어

**Files:** Modify `scripts/atlas/config/u5.json`(`layers`); Output `sims/atlas-u5-americas/data/layer-*.json`; Test `tests/atlas/units/u5.layers.test.mjs`

- [ ] **Step 1:** `python -I scripts/atlas/extract_vectors.py --unit u5 --features all`, 래스터는 `--unit u5` 래스터 분류. 레이어 설정과 기대 범례 수(`expectLegend`):

  | 레이어 id | 지도 | 종류 | 기대 범례 | 메모 |
  |---|---|---|---|---|
  | `p45-climate` | p45-climate | 래스터 면 + 빗금 | 14(열대 3·건조 2·온대 4·냉대 2·한대 2 + 고산 1) | `legendGroups` 열대·건조·온대·냉대·한대 + 고산 따로(1단계 A4), 고산 빗금 #b9703d(704조각 — 윤곽인지 잘라 그리기인지 확인, U4-4 37쪽 `hatch.clips`). 조각 그림이 여럿이면 `rasterIgnoreImages` 끔(U4-4), 핀 그림·흰 국경선 → 무시 색, 해안 섞인 색 → `rasterCoastPx 1`, 카리브 작은 섬 → `rescue_islands`·`deblend`. 지도에 화소 0 인 분류는 「범례만」 |
  | `p45-jan` · `p45-jul` | p45-jan · p45-jul | 래스터 면 + 등온선 | 강수 7 + 등온선 | 등온선 글자(−30~30, 자홍 DINPro 6pt — 1월·7월 나눠 실측)에서 값 붙은 선. 범례 견본 선이 legendBbox 밖이면 넓힘(U4-4 37쪽) |
  | `p46-colonies` | p46-migration | 벡터 면(지구본) | 3(에스파냐·포르투갈·프랑스) | 지구본 뒷면에 걸친 면 없음 확인. 이동 화살표의 색과 같은 색이라 화살표 선(stroke)은 면에서 뺌 |
  | `p46-migration-flows` | p46-migration | `pathFlow`(3c) | 4(에스파냐인·포르투갈인·프랑스인의 이동·아프리카계 노예들의 이동(점선)) | 색 곡선 + 화살촉 도형 → 경로·끝. 노예 이동 = 검은 점선 |
  | `p46-canada` | p46-canada | 벡터 면(교과서 채움 되돌림 — 유럽 이탈리아 꼴, U5-D 결정) | 8(영어 3·프랑스어 3·원주민 언어·기타) | 구역 경계(#6c6e70 0.1pt)는 그리지 않고 면 사이 경계로. 해안 어긋남을 재서 U5-D 「받지 않음」을 다시 판단 |
  | `p46-us-european` · `-african` · `-hispanic` · `-asian` | p46-us-* (+ 삽입) | `regionClass`(3d — NE 1단계 주 면) | 5씩 | 알래스카·하와이는 삽입 fit 으로 표본, 웹 그림은 실제 자리(설계 §6.1-6 — 대조표 알려진 차이). 범례 제목 「유럽계 인구 비율(%)」 등 지면 그대로. 연한 단계(「50 미만」 #fef1e2·「5 미만」 #e6ecf7 등)는 웹 육지 #f2efe9 와 색 차를 재서 묻히면 `legendColors` + `printColor` |
  | `p46-ethnic` | p46-ethnic | 벡터 면 + 줄·빗금(3h) | 7(에스파냐계·포르투갈계·프랑스계·혼혈·아프리카계·원주민·기타) | 혼혈 = 가로 분홍 줄(#ef5aa0 0.36pt, `angle 0`), 아프리카계 = 사선 검은 빗금 — 둘 다 바탕 분류 면 **위에** 겹침(채움 → 빗금 차례). 「기타」 연한 색 보정 확인 |
  | `p46-ethnic-rings` | p46-ethnic | `chartSymbols` + `leader`(3g) | — | 고리 5, `chart` = U5-7 의 `p46-mexico` … `p46-argentina`, 자리 `lonlat` + `_why`(교과서 바다 위 자리 되돌림이 바다·다른 나라 땅 밖이면 그대로), `leaderPt` = 지시선 끝 |
  | `p47-hq` | p47-hq (+ `p47-hq-sv`) | 점 기호 `sizeBy 'sqrt'`(3e) | 겹친 원 3(200·100·10) | 원 약 99(실측 — 교과서 「100대」와 다르면 가려진 원을 찾아 기록), 동해·독도·이어도 글자는 `labelPoints`(U4-4 태양광 꼴)로 반드시 |
  | `p47-agri-supply` | p47-agri | `countryClass` | 1(원료 공급 국가) | 교과서 칠한 나라(분홍 #f9bfc6) — 미국·캐나다·멕시코·중남미·유럽·인도·남아공 등, 기아나는 Q5 |
  | `p47-agri-sites` | p47-agri | 점 기호(3j) + 값 글자 | 5(본사·해외 농장·숙성 창고·샐러드 공장·판매 지사) | 판매 지사 지역 수 4(유럽 112개·북아메리카 34개·중앙 및 남아메리카 7개·기타 지역 9개) = 값 붙은 기호(교과서 자리) |
  | `p47-maquila` | p47-maquila | `unitSymbols`(3f) + 주 경계 | 2 | 파랑 99칸·주황 130칸(조사 수 — 실측), 범례 「1칸당 50개 공장」·「1칸당 2만 명 근로자」 |
  | `p42-korea` · `p43-korea` | p42-north · p43-south | `compareOutline`(3i) | — | 모드 sameLat · antipode, 지면 글자 |

- [ ] **Step 2: 나라·주 분류 확인(U4-4 방식)** — `p47-agri-supply` 보고서 `levels`·작은 나라 경고를 600~1600dpi 확대로 보고 `countryOverrides`(같은 값이어도 까닭), Q5 기아나(`GUF` — 바탕 지도에서 잘라 내기 전이면 FRA 값), 그린란드(교과서 칠 여부). 미국 주 4장은 주마다 표본 다수결이 갈린 주(작은 주 — 로드아일랜드·델라웨어·DC·코네티컷)를 확대로 보고 `regionOverrides`.
- [ ] **Step 3:** `node scripts/atlas/build_layers.mjs --unit u5` → `layer-*.json`. 용량 예산: 레이어 합계 **≤ 750KB**(미국 주 4 × ≤ 30KB, 캐나다 면, 중남미 면이 클 것 — 넘으면 `tol` 키움, 그래도 넘으면 3d 의 `geometryRef` 길), 기후 래스터 셋 ≤ 300KB.
- [ ] **Step 4: 실패하는 테스트 → 통과** (`tests/atlas/units/u5.layers.test.mjs`)
```js
import test from 'node:test'; import assert from 'node:assert/strict'; import { readFileSync } from 'node:fs';
const D = 'sims/atlas-u5-americas/data';
const read = (id) => JSON.parse(readFileSync(`${D}/layer-${id}.json`, 'utf8'));
const clsOf = (gj, name) => gj.features.find((f) => f.properties.name === name)?.properties.cls;
const label = (gj, cls) => gj.legend.find((x) => x.cls === cls)?.label;
test('p45 기후 구분: 범례 14, 면 경위도가 아메리카', () => {
  const gj = read('p45-climate'); assert.equal(gj.legend.length, 14);
  for (const f of gj.features) { const [lon, lat] = f.properties.centroid; assert.ok(lon > -170 && lon < -30 && lat > -56 && lat < 84, f.properties.cls); }
});
test('p46 미국 주: 4장 모두 범례 5, 주 50 + DC, 알래스카·하와이 분류 있음', () => {
  for (const id of ['p46-us-european', 'p46-us-african', 'p46-us-hispanic', 'p46-us-asian']) {
    const gj = read(id); assert.equal(gj.legend.length, 5, id);
    assert.ok(gj.features.length >= 50, id);
    for (const s of ['Alaska', 'Hawaii']) assert.ok(clsOf(gj, s), `${id} ${s}`);
  }
  // 그림에서 보이는 것(값을 넣지 않고 단계만): 아프리카계는 미시시피가 가장 높은 단계, 히스패닉계는 뉴멕시코가 가장 높은 단계
  const af = read('p46-us-african'), hi = read('p46-us-hispanic');
  assert.match(label(af, clsOf(af, 'Mississippi')), /35/);
  assert.match(label(hi, clsOf(hi, 'New Mexico')), /40/);
});
test('p46 캐나다: 범례 8, 퀘벡 남부는 프랑스어 75% 이상', () => {
  const gj = read('p46-canada'); assert.equal(gj.legend.length, 8);
  assert.ok(gj.features.some((f) => /프랑스어/.test(label(gj, f.properties.cls))));
});
test('p46 중남미 민족: 범례 7, 혼혈은 가로 줄(angle 0)·아프리카계는 빗금', () => {
  const gj = read('p46-ethnic'); assert.equal(gj.legend.length, 7);
  assert.equal(gj.legend.find((x) => x.label === '혼혈').angle, 0);
  assert.equal(gj.legend.find((x) => x.label === '아프리카계').pattern, 'hatch');
});
test('p46 고리 5: 지시선 끝이 그 나라 안, 고리 자리는 설정 그대로', () => {
  const C = read('p46-ethnic-rings'); assert.equal(C.items.length, 5);
  for (const it of C.items) { assert.ok(it.leader, it.id); assert.ok(it.lonlat[0] > -130 && it.lonlat[0] < -20, it.id); }
});
test('p46 지구본: 식민지 3 · 이동 4(노예 이동 점선)', () => {
  assert.equal(read('p46-colonies').legend.length, 3);
  const F = read('p46-migration-flows'); assert.equal(F.properties.legend.length, 4); // pathFlow = FeatureCollection(U5-3c 결정)
  assert.ok(F.features.some((f) => f.properties.dashed));
  assert.deepEqual(F.properties.view, { projection: 'globe', rotate: [30.3, -9.2] }); // 지구본으로 여는 길(p46-migration 정사 중심 −30.3°, 9.2°)
});
test('p47 본사: 원 90개 넘음, 동해·독도 글자, 지름 ∝ √값', () => {
  const gj = read('p47-hq'); const pts = gj.features.filter((f) => f.properties.value);
  assert.ok(pts.length >= 90);
  const names = gj.features.filter((f) => f.properties.type === 'label').map((f) => f.properties.text);
  for (const n of ['동해', '독도']) assert.ok(names.includes(n), n);
});
test('p47 마킬라도라: 두 계열, 칸 수가 조사 수 근처', () => {
  const L = read('p47-maquila'); const sum = (c) => L.items.flatMap((i) => i.series).filter((s) => s.cls === c).reduce((a, s) => a + s.count, 0);
  assert.equal(L.legend.length, 2);
  assert.ok(Math.abs(sum(L.legend[0].cls) - 99) <= 3 && Math.abs(sum(L.legend[1].cls) - 130) <= 3);
});
```
  (분류 이름·주 이름 키는 지면 글자·U5-D 속성 키를 보고 맞춘다. 칸 수·원 수는 실측으로 고치고 까닭을 「실행 중 결정」에.)
- [ ] **Step 5:** 지도마다 「교과서 범례 수 ↔ 뽑은 분류 수」 표를 「실행 중 결정」에(U4-4 표 꼴, KB 칸), 화면용 색 보정 결정도. 커밋. 공유 파이프라인을 고쳤으면 u2·u3·u4 회귀(`build_layers --unit u2|u3|u4 all --extract` → 바이트 같음, `regress_unit --check` 셋 다).

### Task U5-5: 지명

**Files:** Modify `scripts/atlas/config/u5.json`(`places`); Output `sims/atlas-u5-americas/data/places.json`; Test `tests/atlas/units/u5.places.test.mjs`

- [ ] **Step 1:** 40·42·43쪽 렌더와 글꼴 조사를 보며 `places.styles`(u4 표 복사 → 수정): 나라 = InterGTOTFB 자홍 #ed1064(6.3·6.8·7.3·7.8·9.7·12.7pt) + **영문 Helvetica 자홍**(5·6pt) `en`, 수도·도시 영문 = Helvetica 5pt 검정 `cityEn`(40쪽 37조각), 도시 = YDVYGOStd32 5.8pt, 수도 = YDVYGOStd33 7.3pt, 바다·호수 = 파란 명조 #0072bc(6.4·7.9·11.8pt 대양 자간 벌림 `joinEm`), 지형 상자 글자 = NanumMyeongjoOTFBold(4.9~8.9pt 낱자 상자 — 「로 키 산 맥」), 산 = 고딕 + 높이 DINPro, 섬·곶 = 명조 5.9pt, **「기아나」 갈보라 #7e576b → `region`**(40·43쪽), 대양 영문 Times. **무시**: 붉은 국립 공원·유적 글자 #d71920 4.9pt(40쪽 100·42쪽 42·43쪽 45 — 아프리카 Q8 교사 답과 같은 처리, 찾아보기에 없는지 확인), 소속 표시 자홍 명조 5.9pt (미)(영)(프)(네)(덴)(에)(에콰)(칠)(콜)(멕), 찾아보기 격자 글자(40쪽 **빨강 DINPro-Bold 1~7** — 붉은 글자 규칙과 따로 적음), 경위선 글자, 범례 글자, 42·43쪽 우리나라 실루엣 글자(「같은 축척…」·동해·황해·남해·독도 — 윤곽 레이어 글자로 감).
- [ ] **Step 2:** `python -I scripts/atlas/places.py --unit u5` → `node scripts/atlas/build_places.mjs --unit u5 --verify`(3b `mergePriority` = 42·43 → 40 삽입 → 40). 악센트 낱자(São Paulo·Bogotá·Asunción·Brasília·Montréal·Québec·Ciudad de México)가 다른 글꼴로 끼면 `glue`, 찾아보기에 없어 나뉘거나 붙은 상자 글자는 `extraNames`, 방향 반대 글자 잇기는 `chain.minDirCos`(U4-5).
- [ ] **Step 3: 찾아보기 대조** — 105~111쪽 중 40·42·43쪽 참조 줄이 모두 places 에 있음(누락 0 목표, 뺀 것은 `indexExclude`에 까닭). 격자 칸 대조(시험에만, U4-5 꼴 — 교과서 글자 자리까지): 40쪽 본 지도·삽입(I~L·1~3)·42·43쪽 각각, 다른 칸 목록을 「실행 중 결정」에.
- [ ] **Step 4: Natural Earth 대조**(`neBox`, `snapKm 30`) — 동명 다른 도시는 `neAlias[이름].nearest`(산호세·킹스턴·산티아고·런던·해밀턴·코르도바·발렌시아·빅토리아), 이웃 수도 때문에 옮겨 그린 카리브 수도는 `snapAlways`(U5-2 MAD 로 빠진 수도 목록). 결과(중앙값·90%·최대 km)를 「실행 중 결정」에 — 40쪽은 1pt ≈ 27km(1:77M)라 km 오차가 아프리카보다 클 것, 42·43쪽(1pt ≈ 9~10km)과 나눠 적는다.
- [ ] **Step 5: 테스트**
```js
const places = JSON.parse(readFileSync('sims/atlas-u5-americas/data/places.json', 'utf8'));
const near = (p, lon, lat, tol) => Math.abs(p.lon - lon) < tol && Math.abs(p.lat - lat) < tol;
test('대표 지명 위치가 실제와 1° 안', () => {
  const want = { 워싱턴: [-77.04, 38.91], 오타와: [-75.70, 45.42], 멕시코시티: [-99.13, 19.43], 브라질리아: [-47.88, -15.79], 부에노스아이레스: [-58.38, -34.60], 리마: [-77.04, -12.05], 아바나: [-82.38, 23.13] };
  for (const [name, [lon, lat]] of Object.entries(want)) { const p = places.find((x) => x.name === name); assert.ok(p, name); assert.ok(near(p, lon, lat, 1), `${name} ${p.lon},${p.lat}`); }
});
test('동명 도시: 산호세는 코스타리카 수도(캘리포니아 산호세가 있으면 따로)', () => {
  const sj = places.filter((p) => p.name === '산호세'); assert.ok(sj.some((p) => near(p, -84.09, 9.93, 1)));
});
test('세 일반도 합치기: 같은 이름·같은 종류는 하나(큰 축척 자리)', () => {
  const ny = places.filter((p) => p.name === '뉴욕' && p.kind !== 'sea'); assert.equal(ny.length, 1);
  assert.deepEqual(ny[0].from?.[0], 'p42-north');
});
test('나라·수도 영문 병기(en)', () => { for (const n of ['캐나다', '브라질', '자메이카', '킹스턴']) assert.ok(places.find((p) => p.name === n)?.en, n); });
test('국립 공원·유적 글자는 지명이 아님', () => { assert.ok(!places.some((p) => /국립 공원|유적|역사 지구/.test(p.name))); });
test('기아나 = region', () => assert.equal(places.find((p) => p.name === '기아나')?.kind, 'region'));
test('rank 1~6, kind 목록 안', () => { for (const p of places) { assert.ok(p.rank >= 1 && p.rank <= 6); assert.match(p.kind, /^(country|capital|city|mountain|river|sea|region|island|desert|plain|other)$/); } });
```
- [ ] **Step 6:** 용량 ≤ 200KB(일반도 세 장이라 아프리카 150KB 보다 크게 잡음 — 넘으면 rank 하한). 커밋. places.py·build_places 를 고쳤으면 u2·u3·u4 places.json 다시 만들어 바이트 같음 확인(파일은 되돌림) + `regress_unit --check` 셋 다.

### Task U5-6: 사진·원본 쪽·핀

**Files:** Modify `scripts/atlas/config/u5.json`(`photos`); Output `content/atlas/u5/photos.json`, `docs/assets/atlas/u5/photo/*`, `docs/assets/atlas/u5/page/p040~p047.jpg`

- [ ] **Step 1:** `python -I scripts/atlas/extract_images.py --unit u5 --candidates`(40·42·43쪽 작은 그림은 `candidate.minAreaEachPt2`로 거름 — U4-6) → 쪽 렌더를 보며 `photos.items`(bbox·topic·mask)·`exclude`:
  - 44쪽 7(우유니 소금 사막·갈라파고스 제도·아우얀테푸이·로키산맥·나이아가라 폭포·그레이트플레인스·아마존강), 45쪽 4(툰드라 순록 유목·뉴욕 센트럴파크·안데스 원주민·아마존 열대 우림 — 기후 그래프는 사진 카드 아래 따로).
  - 46쪽 문화 6(재즈·리우 카니발·산토도밍고 교회·과달루페 성모·퀘벡 STOP 표지판·스팽글리시 광고판(활동하기 3 사진)), 글이 겹친 오려 낸 그림은 `imagesOnly`.
  - 47쪽: 만화 1(래스터 [44,95,389,305] — 말풍선 글은 벡터라 **렌더**해야 보임 → `render: true`, 원본 쪽 부분 보기도), A사 기기 그림 1(벡터 삽화 `render: true` — 제목 「미국에 본사를 둔 정보 통신 기업」·설명 글 포함 여부는 대조표 항목), 폐허 공장 1. 그래프 아이콘(xref 0 인라인 — 디트로이트 공장·BPO 사람·톱니)은 사진이 아님(제외).
- [ ] **Step 2:** 핀(`photos.pins`): 44쪽 물방울 7(#7250a1)·45쪽 4 → `pt2lonlat.mjs`. 모두 번호 숨김이라 `pinNear` 짝(U4-6 — 넓은 지형 글자는 짝 거리 큼, 까닭 `_pinNear`). 지명이 places 에 없는 것(우유니 소금 사막·아우얀테푸이·그레이트플레인스)은 핀 자리 그대로 + 짝 거리 기록.
- [ ] **Step 3:** `--photos --pages` → JPEG q82·WebP q80, 원본 쪽 110dpi 각 200KB(약 195KiB) 이하(40·42·43쪽은 품질을 낮춰야 할 것 — U4-6 34쪽 55). 사진 합계 ≤ 4MB.
- [ ] **Step 4: 개수 대조** — 설정 `photos.expect`: 지형 7·기후 4·민족 6·초국적 기업 2·지역 변화 1 = 20(실측으로 고쳐 기록). 대조표 `units/u5/shots/c3/photos-<쪽>.jpg` 눈으로. 같은 설명 두 카드·제목만/본문만 사진은 유럽 U3-6 규칙, 두 줄 제목은 `titleOverride`.
- [ ] **Step 5:** 시험 `tests/atlas/units/u5.photos.test.mjs`(주제별 수, 핀 44쪽 7·45쪽 4·번호 숨김, 핀이 아메리카 안·서로 떨어짐, 대표 핀 위치(나이아가라 폭포 1° 안·뉴욕 1° 안·보고타 1° 안), 烋·깨진 글자 0, 파일 크기). 커밋(`content/atlas/u5/photos.json docs/assets/atlas/u5 scripts/atlas/config/u5.json tests/atlas/units/u5.photos.test.mjs`). extract_images 를 고쳤으면 u2·u3·u4 `--photos --pages` 다시 → git 차이 없음 + `regress_unit --check` 셋 다.

### Task U5-7: 그래프 숫자

**Files:** Modify `scripts/atlas/config/u5.json`(`charts`), `scripts/atlas/charts_read.py`(새 읽개는 설정 키가 있을 때만); Output `$ATLAS_WORK/units/u5/tables/charts-u5.json`; Test `scripts/atlas/tests/test_tables.py`에 `ChartsU5`

그래프 13개(id · 형식 · 출처 · 값):

| id | 형식 | 값 출처 | 메모 |
|---|---|---|---|
| `p45-barrow` | climograph | **97쪽 표**(`배로`) printed | 「툰드라 기후」, 겨울 강수 막대가 아주 작으면 `barsByMonth`(U4-7) |
| `p45-newyork` | climograph | **97쪽 표**(`뉴욕`) printed | 「온난 습윤 기후」 |
| `p45-bogota` | climograph | **97쪽 표**(`보고타`) printed | 「고산 기후」 |
| `p45-iquitos` | climograph | 도형 측정 measured(+precision) | 97쪽 표에 없음(확인함 — `tables/climate-world.json`에 이키토스 없음), `notInTable`, 출처 『이과연표』 |
| `p46-us-ethnic` | stackedBar(100% 띠 2줄) | 인쇄 % printed | 1990: 75.6·11.7·9.0·2.8·0.9 / 2020: 57.8·18.7·12.1·6.1·5.3, 범주 유럽계·히스패닉·아프리카계·아시아계·기타, 사이드바 `barPicker`(1단계 결정 4) + 크게 보기 |
| `p46-mexico` · `p46-haiti` · `p46-brazil` · `p46-peru` · `p46-argentina` | pie + `ring` | 인쇄 % printed(띠 안) | 멕시코 18·3·15·64(합 100) · 아이티 1·5·94 · 브라질 8·1·48·43 · 페루 4·12·32·52 · 아르헨티나 7·3·4·86 — 조각 이름 = 범례 「민족(인종)의 비율」 색(기타·유럽계·혼혈·원주민·아프리카계), 가운데 = 나라 이름·(인구 만 명) 인쇄 그대로 `center`. 조각 차례·색 짝은 읽개가 정함(위 값 차례는 렌더 어림) |
| `p47-detroit` | line | 도형 측정 measured(+precision) | 1920~2020 11점(만 명), 값 글자 없음 — 축 눈금 글자(0~200)로 환산, 출처 (미국 통계청, 2020) |
| `p47-bpo-revenue` | bar | 도형 측정 measured | 2006~2021 16개(십억 달러), 2021 강조 색(#00a9ac — `highlight`), 출처 (한국 콘텐츠 진흥원, 2021) |
| `p47-bpo-jobs` | line | 도형 측정 measured | 2006~2021 16점(백만 명) |

- [ ] **Step 1:** 기후 4 — `climateTable` 그대로(u4 꼴: 제목 둘째 줄 「(툰드라 기후)」 → climate, 97쪽 표 zone 과 다르면 경고). 45쪽 그래프 틀이 37쪽·29쪽과 같은 자리·꼴인지 먼저 보고 상자 재사용. 97쪽 표 u5 사본 = u2 표와 바이트 같아야 함.
- [ ] **Step 2:** 100% 띠 — 1단계 자원·수출 비율 `stackedBar`(여러 막대 → svg `barSvg`) 읽개, 칸 값은 인쇄 글자(작은 칸 「0.9」 「2.8」은 띠 밖 위에 인쇄 — 짝은 가로 위치), 합 100±0.1.
- [ ] **Step 3:** 고리 5 — 먼저 유럽 `read_donut`(조각 안 인쇄 수)으로, 구멍이 흰 원 덮개 + 부채꼴이면 U4-7 `holeColor` 규칙만 빌림. 조각 이름 = 범례 견본색 짝(`namesFrom: {legend: …}` — 범례가 지도 레이어 범례가 아니라 그래프 범례 「민족(인종)의 비율」이면 새 키 대신 설정 `sliceNames [{color, name}]`), 출력에 `ring`·`center`. 점선 지시선 끝(`leaderPt`)은 U5-4 레이어 설정으로 넘김.
- [ ] **Step 4:** 측정 그래프 3 — 1단계 선·막대 도형 측정(축 눈금 글자 → 값, `measured` + `precision`). BPO 막대의 강조 막대 색은 출력 `highlight: [15]`(유럽 30쪽 강조 막대 꼴).
- [ ] **Step 5: 테스트** (`test_tables.py` `ChartsU5` — u4 꼴로 u5 설정을 모의)
```python
class ChartsU5(unittest.TestCase):
    def test_count_and_warnings(self):
        out, warns = run_charts('u5'); self.assertEqual(len(out), 13); self.assertEqual(warns, [])
    def test_climate(self):
        out, _ = run_charts('u5')
        for cid in ('p45-barrow', 'p45-newyork', 'p45-bogota', 'p45-iquitos'):
            c = out[cid]; self.assertEqual(len(c['temp']), 12); self.assertEqual(len(c['precip']), 12)
        self.assertEqual(out['p45-newyork']['source'], 'printed'); self.assertEqual(out['p45-iquitos']['source'], 'measured')
        self.assertIn('precision', out['p45-iquitos'])
    def test_rings_sum_100(self):
        out, _ = run_charts('u5')
        for cid in ('p46-mexico', 'p46-haiti', 'p46-brazil', 'p46-peru', 'p46-argentina'):
            self.assertAlmostEqual(sum(s['value'] for s in out[cid]['slices']), 100, delta=0.5); self.assertIn('ring', out[cid])
        self.assertEqual(sorted(s['value'] for s in out['p46-mexico']['slices']), [3, 15, 18, 64])
    def test_stacked_100(self):
        out, _ = run_charts('u5'); b = out['p46-us-ethnic']
        self.assertEqual(len(b['categories']), 2)
        for row in b['series_by_row']: self.assertAlmostEqual(sum(row), 100, delta=0.1)
    def test_measured_lines(self):
        out, _ = run_charts('u5')
        self.assertEqual(len(out['p47-detroit']['values']), 11); self.assertIn('precision', out['p47-detroit'])
        self.assertEqual(len(out['p47-bpo-revenue']['values']), 16); self.assertEqual(len(out['p47-bpo-jobs']['values']), 16)
        # 그림에서 보이는 것(값을 넣지 않고 모양만): 디트로이트 1950 이 가장 큼, BPO 매출은 늘어남
        d = out['p47-detroit']['values']; self.assertEqual(d.index(max(d)), 3)
        r = out['p47-bpo-revenue']['values']; self.assertGreater(r[-1], r[0])
```
  (`run_charts`·출력 키 이름은 지금 `test_tables.py` 도우미와 chartCore 가 받는 꼴에 맞춘다 — 100% 띠는 1단계 stackedBar 출력 꼴 그대로.)
- [ ] **Step 6:** 경고 0으로 `charts-u5.json` + 도장. 대조표 `units/u5/shots/c4/charts-45~47.png` 눈으로. `charts_read.py`를 고쳤으면 u2·u3·u4 `extract_tables` 다시 → `charts-u2|u3|u4.json` 바이트 같음(도장 파일만 정당하게 새 값) + `regress_unit --check` 셋 다. 커밋.

### Task U5-8: 주제 내용

**Files:** Create `content/atlas/u5/topics.json`, `content/atlas/u5/overrides.json`, `content/atlas/u5/issues.md`, `scripts/atlas/tests/test_text_u5.py`, `tests/atlas/units/u5.content.test.mjs`; Output `content/atlas/u5/coloring.json`, `sims/atlas-u5-americas/data/{topics,charts}.json`, `layers.js`

- [ ] **Step 1:** `topics.json` — 주제 10개(위 「주제」 표, Q1 답에 따라), 글은 출처 상자(`src`·`titleSrc`·`creditSrc`·`legendTitleSrc`·`labelSrc`)만 적고 `extract_text.py --unit u5 --fill`로 채움. 손으로 두는 것은 1단계처럼 목차 제목과 「학습 목표」뿐.
  - 일반도: 바로가기 「아메리카」·「중앙아메리카」(Q2), 도법 글은 본 지도(입체 투영 1:77,000,000) + 삽입(밀러 1:43,000,000) 둘 다 지면 그대로.
  - 북·남아메리카: 우리나라 윤곽 레이어(같은 label 로 묶음), 윤곽 안내 글 = 지면 글자.
  - 인구 이동과 언어: 지구본 묶음(`projection: 'globe'`, `rotate` = U5-2 fit 의 회전), 지구본 옆 본문 글(46쪽 왼쪽 위 — 「원주민이 거주하던 아메리카에…」), 캐나다 설명 글(「캐나다는 영어와 프랑스어를…」), 원본 쪽 부분(지구본).
  - 민족 구성과 문화 혼종성: 바로가기 미국 4(지도 범례 제목 labelSrc)·중남미, 100% 띠 그래프 블록 + 설명 글(「미국은 시간이 지남에 따라…」), 고리 5 는 지도 위 기호(사이드바 블록 없음 — U4-8 판단처럼 chartSymbols 항목을 참조로 셈), 사진 6, 활동하기 3.
  - 초국적 기업: 만화 사진 카드 + 원본 쪽 부분, 본사 지도 아래 글, 글로벌 생산 체제 본문, A사 그림 카드, D사 지도 + 아래 글.
  - 지역 변화: 디트로이트 그래프 블록 + 폐허 사진 + 글, 마킬라도라 묶음 + 글(「*주로 미국 수출을 목적으로…」 각주 포함), BPO 그래프 블록 2 + 글.
- [ ] **Step 2: 색칠하기** — `python -I scripts/atlas/extract_text.py --unit u5 --labels`(41쪽 나라 글자·초성·손글씨 수도) → `node scripts/atlas/coloring_quiz.mjs --unit u5 --write`. 설정(아프리카 키 그대로): `joinLabels [["ㅂㄴㅅㅇㄹ","ㅂㄹㅂㄹ"],["세인트빈센트","그레나딘"]]`(지면에서 위아래로 맞닿은 두 줄인지 시험 — 「ㅂㄹㅂㄹ」는 글자 덩어리에 「가이아나」와 붙어 읽혔으니 먼저 나눔), `ignoreLabels ["알래스카(미)"]`, `regions {GRL, GUF}` + `noCapital {GRL, GUF}`(Q4·Q5), Q4 기본값이면 앤티가 바부다 = 이름 칸 없는 문제(새 키가 필요하면 `extraCountries {ATG: {why}}` — 있을 때만), 카리브 수도가 면 밖 해안이면 `capitalByNe`·`capitalByNeNear`. `isoByLabel`은 Natural Earth NAME_KO 초성이 글자와 다를 때만(U4-8 — 필요 없는 키를 두지 않음, 짝은 시험으로 고정): 「ㅁㄱ」(미국)·「ㅂㄴㅅㅇㄹ ㅂㄹㅂㄹ」(NE 「베네수엘라」 초성 ㅂㄴㅅㅇㄹ — 둘째 줄 처리 확인)·「도미니카 공화국」↔「도미니카」(이름이 겹침 — 글자 자리 나라 면으로 갈리는지 시험). 나라 수 = 35(Q4) + 지역 2.
- [ ] **Step 3:** `python -I scripts/atlas/extract_text.py --unit u5 --fill --check` → `node scripts/atlas/build_content.mjs --unit u5`.
- [ ] **Step 4: 테스트** (`tests/atlas/units/u5.content.test.mjs` + G5 계약 테스트)
```js
const T = JSON.parse(readFileSync('sims/atlas-u5-americas/data/topics.json', 'utf8'));
const by = Object.fromEntries(T.map((t) => [t.id, t]));
test('주제 10개, 40~47쪽 모두 덮음', () => {
  assert.deepEqual(T.map((t) => t.id), ['general', 'coloring', 'north', 'south', 'relief', 'climate', 'migration', 'ethnicity', 'tnc', 'change']);
  const pages = new Set(T.flatMap((t) => t.pages)); for (let p = 40; p <= 47; p++) assert.ok(pages.has(p), `${p}쪽`);
});
test('개수: 지형 핀 7(번호 숨김), 기후 그래프 마커 4(번호 숨김)', () => {
  assert.equal(by.relief.markers.length, 7); assert.equal(by.relief.pinNumbers, 'hidden');
  assert.equal(by.climate.markers.filter((m) => m.chart).length, 4); assert.equal(by.climate.pinNumbers, 'hidden');
});
test('지구본 묶음(교사 §8 Q2): 인구 이동 묶음은 globe 보기', () => {
  assert.ok(by.migration.views.some((v) => v.projection === 'globe' && Array.isArray(v.rotate)));
});
test('우리나라 윤곽(교사 §8 Q3): 42쪽 sameLat · 43쪽 antipode', () => {
  const refs = (t) => t.views.flatMap((v) => v.layers ?? []);
  assert.ok(refs(by.north).includes('layer-p42-korea')); assert.ok(refs(by.south).includes('layer-p43-korea'));
});
test('색칠하기: 나라 35 + 지역 2, 카리브 작은 나라가 50m 에 있음', () => {
  const qs = by.coloring.quiz.countries; const isos = qs.map((c) => c.iso);
  assert.equal(qs.filter((c) => !c.region).length, 35); assert.equal(qs.filter((c) => c.region).length, 2);
  for (const iso of ['ATG', 'KNA', 'DMA', 'LCA', 'VCT', 'BRB', 'GRD', 'TTO', 'BHS', 'JAM']) assert.ok(isos.includes(iso), iso);
});
test('태평양 중심 묶음: 본사·D사 세계 지도', () => assert.ok(by.tnc.views.some((v) => v.map === 'p47-hq')));
```
  (U5-6·U5-7 실측과 Q 답이 다르면 시험을 맞추고 까닭을 「실행 중 결정」에.) `test_text_u5.py`: 원문 대조 `--unit u5 --check`·출처 지면 대조·41쪽 글자 수·손글 없음(u4 꼴).
- [ ] **Step 5:** 검토 덤프 `units/u5/shots/c5/topics.md`를 쪽 렌더와 대조(빠진 글·깨진 글 — `pdfkit.dec` 알려진 오류 `·`→`h`(46쪽 「퀘벡의 프랑스어h영어 공존」으로 이미 보임), `℃`, `㎢`, 『』, 「烋」). 고침은 `overrides.json`(from 필수, 까닭). 교과서 원문 문제는 `issues.md`. 커밋. `coloring_quiz.mjs`·`extract_text.py`를 고쳤으면 u2·u3·u4 도장 줄만 바뀌는지 `regress_unit --check` 셋 다.

### Task U5-9: 바탕 지도와 조각 조립

**Files:** Create `sims/atlas-u5-americas/index.html`(u4 복사), `sims/atlas-u5-americas/main.js`; Output `sims/atlas-u5-americas/data/basemap.json`; Modify `src/registry.js`, `scripts/atlas/config/u5.json`(`basemap.cutIsos`)

- [ ] **Step 1: 기아나 잘라 내기(Q5 기본값)** — 설정 `basemap.cutIsos [{from: 'FRA', to: 'GUF', box: [-55, 2, -51, 6]}]`(U4-9 코드 그대로 — 상자 안 FRA = 기아나 땅만인지 상세도 셋에서 확인, `checkEdits`). NE 에 `GUF` iso 가 없으니 `ko` = 「기아나」(설정 `names {GUF: '기아나'}` — 키가 없으면 새로 더하고 기록). 테스트(`basemap.test.mjs`): u5 basemap 에 `GUF` 하나·FRA 남쪽 끝이 유럽, 설정이 없으면 명령 목록이 지금과 같음.
- [ ] **Step 2:** `node scripts/atlas/build_basemap.mjs --unit u5` → 110m·50m 전 지구 + 10a 카리브·중앙아메리카 상자, ≤ 1,024,000 B(`maxBytes`). 넘으면 상자를 줄이고, 아메리카 전체 10a 가 필요한 곳(작은 섬 칠하기)이 있는지 U5-9 캡처로. 10a 에만 있는 나라·지역 목록 기록.
- [ ] **Step 3:** registry `SIMS`에 `{ id: 'atlas-u5-americas', book: 'atlas', unit: 'Ⅴ. 아메리카', page: 40, title: '사회과부도 아메리카', kind: '지도' }`.
- [ ] **Step 4:** `main.js` = 자료 정적 import(basemap·places·topics·charts·layers.js) + 선택값 + **`installExtraCharts()`·`installAmericasExtras()`**(mountAtlas 전 — 안 부르면 고리·지구본·윤곽·네모 기호가 「모르는 레이어 종류」·「그래프를 그리지 못했습니다」, 시험으로 고정) + `mountAtlas`:
  - `baseColor: { general: 'tint', north: 'tint', south: 'tint', relief: 'natural' }`
  - `coloring: { smallPx: 16, smallMetric: 'area' }`(카리브 섬나라 — 1440·1024 에서 동그라미 겹침을 보고 smallPx·확대 창 판단)
  - `centerLonOf: { 'layer-p47-hq': 150, 'layer-p47-agri-supply': 150 }`, `BOUNDS_OF`(세계 두 장 = 교과서 틀, 민족 고리 5 원판까지 — U4-9 결정 8 꼴)
  - `insets`: 실리콘 밸리(3e — 본사 묶음에서만), 카리브 확대 창은 캡처로 판단(기본 없음)
- [ ] **Step 5:** `npm run embed -- atlas-u5-americas` → `check:embed` 통과, 크기 ≤ 3MB(목표 1~2MB — 바탕 지도 + 레이어 750KB + 지명 200KB 라 2MB 를 넘을 수 있음, 넘으면 「실행 중 결정」에 까닭), 금지 패턴 0. G5 계약 시험의 u5 조각 크기가 이제 돈다.
- [ ] **Step 6: 미리보기 캡처** (`$ATLAS_WORK/units/u5/shots/e1/`, 장면 스크립트 `units/u5/e1shots.mjs` — 아프리카 e1shots 꼴, vite + swiftshader, 새 user-data-dir, Date.now 고정): 1440×900·1024×768 × 10주제 × 묶음 + 사이드바 스크롤 + **색칠하기 카리브 작은 나라**(바하마·자메이카·세인트키츠 네비스·앤티가 바부다·도미니카·세인트루시아·세인트빈센트 그레나딘·바베이도스·그레나다·트리니다드 토바고·엘살바도르·벨리즈 — 처음·±3°·±1° 확대 + 누르기 기록 `report.json`) + 핀 카드 11 + **지구본 끌어 돌리기**(끌기 전·후, 평면 도법 전환·되돌림) + **우리나라 윤곽 끌기**(42·43 — 끌기 전·후·「교과서 자리로」, 메르카토르에서 북쪽으로 끌면 커짐) + 고리 5 누르기 → 카드 + 미국 4장 범례 고름 + 혼혈·아프리카계 범례 고름 + 본사 실리콘 밸리 확대 창 + 마킬라도라 칸 말풍선 + 태평양 중심 150 + 조각(embed) 10주제(공개 Pages 주소 가로채기). **페이지 콘솔 오류·경고 0**, 깨진 사진 0. 범례 칸이 고리·확대 창·윤곽을 가리는지(`report-rings.json legendGap` 꼴).
- [ ] **Step 7:** u2·u3·u4 회귀(엔진·build_basemap 을 고쳤으면 조각 다시 + 캡처 41·31·42장 + compare + `regress_unit --check` 셋 다). 모음 썸네일 `node scripts/atlas/hub_thumbs.mjs atlas-u5-americas --local`. 커밋.

### Task U5-10: 교과서 대조표 ⓣ

**Files:** Create `scripts/atlas/config/u5.compare.json`; Modify `scripts/atlas/compare.mjs`(필요할 때만 — 지구본·윤곽·네모 기호 레이어 확인 줄); Output `$ATLAS_WORK/units/u5/compare.html`

- [ ] **Step 1:** `u5.compare.json`: `mainMap`{general:'p40-americas', coloring:'p41-coloring', north:'p42-north', south:'p43-south', relief:'p44-relief'}, `coloringLabels` `units/u5/text/p41-labels.json`, `centerChecks`(본사·D사 묶음 = 중심 경도 150), 둘째 도법 = 일반도 이퀄어스, `fixedNow`(u2·u3·u4 와 같음), `extraScenes` — 일반도 고도 색 끔/켬, 「중앙아메리카」 바로가기, 북·남아메리카 윤곽 처음 자리 + 끈 뒤 + 「교과서 자리로」, 색칠하기 활동 + 카리브 작은 나라 확대 3묶음, 지형 바탕 3종 + 핀 숨김/하나/모두, 기후 그래프 핀 모두 보기(`groupIndex`·`refs` — U4-10 처럼 기후 구분 행에 붙임), 지구본 처음·돌린 뒤·평면 전환, 캐나다 범례 「프랑스어 75% 이상」 고름, 미국 4장, 100% 띠 크게 보기, 중남미 범례 「혼혈」·「아프리카계」 고름, 고리 하나 누름 → 카드 + 크게 보기, 본사 태평양 중심 + 실리콘 밸리 확대 창, D사 기호, 마킬라도라 칸 말풍선, 디트로이트·BPO 크게 보기, 만화·A사 원본 쪽 보기(부분).
- [ ] **Step 2:** compare.mjs 가 새 레이어 종류(`pathFlow`·`compareOutline`·`unitSymbols`·`regionClass` 면)를 확인 줄 없이 넘기면 확인 줄을 더한다(레이어 항목 수 = 설정 수, 윤곽 home ↔ 교과서 자리, 칸 수 합 = 교과서 칸 수). **u2·u3·u4 대조표 HTML 은 만든 때 줄 밖 같아야** 함(새 줄은 그 레이어 종류가 있을 때만).
- [ ] **Step 3:** `node scripts/atlas/compare_shots.mjs --unit u5` → `node scripts/atlas/compare.mjs --unit u5`. **다름 0** 목표 — 다름은 고치거나 까닭이 결정 기록에 있는 것만 `checks.known`(tb/web/webIncludes/pct). 결과 수를 「실행 중 결정」에.
- [ ] **Step 4: 교사 확인 목록(`checks.teacher`, 쪽별)** — U5-2~U5-9 기록의 교사 확인 항목 전부 + Q1~Q7 답 반영 상태: 일반도 세 주제·지명 합치기, 중앙아메리카 바로가기, 우리나라 윤곽 두 모드, 색칠하기 35 + 지역 2(앤티가 바부다), 기아나 분리, 지구본·평면 전환, 본사 원 실제 자리 + 확대 창, 미국 알래스카·하와이 실제 자리(삽입 아님), 캐나다 교과서 도형 되돌림, 혼혈·아프리카계 무늬, 고리 지시선, 마킬라도라 칸, 측정 그래프(이키토스·디트로이트·BPO), 고친 나라·주(`countryOverrides`·`regionOverrides`), 화면용 색 보정, approx·`projectionFrom`·`fitFrom` 지도, 옮긴 핀·기호(snapped), 찾아보기 격자 칸 다름, 붉은 국립 공원 글자 뺌.
- [ ] **Step 5:** 교사에게 대조표 경로(`C:\Users\Public\atlas-work\units\u5\compare.html`)와 확인 요청 목록을 알리고 **승인을 기다린다**(공개하지 않음). 교사 요청 고침은 「실행 중 결정」에 기록 → 다시 대조. compare.mjs 를 고쳤으면 u2·u3·u4 `regress_unit --check`(대조표 HTML·수 같음).

### Task U5-11: 성능·이미지 경로·공개 ⓣ

- [ ] **Step 1:** 1024×768 swiftshader 성능(`units/u5/perf/perf_u5.mjs` — 아프리카 perf_u4 꼴: 도법 5개 × 전환·settle 9번 중 뒤 7번 중앙값/최대). 장면: 일반도 3장 고도 색 켬, 지형 자연색, 기후 구분·1월·7월, **지구본 끌어 돌리기 30프레임(프레임 시간 중앙값/최대 — 음영·고도 색 역투영이 켜진 경우 포함)**, 미국 주 4장, 캐나다(면 많음), 중남미(빗금 두 겹), 본사(원 약 100 + 확대 창), 마킬라도라(칸 약 230). 기준 200ms 안(지구본 프레임은 50ms 안 목표). 구드가 넘으면 유럽·아프리카처럼 까닭(프로파일)만 기록하고 고치지 않음. 결과를 「실행 중 결정」에.
- [ ] **Step 2:** 이미지 먼저 공개: `git add docs/assets/atlas/u5 && git commit && git push`(push 는 코디네이터·사용자 승인 뒤) → 모든 사진·쪽 주소 200(`curl -sI`).
- [ ] **Step 3:** 교사 승인 뒤 `npm run release -- atlas-u5-americas --note "사회과부도 아메리카 첫 공개"` → 커밋·푸시 → `https://yhk1m.github.io/donga-social-sims/atlas-u5-americas/1/` 200, 공개 페이지에서 음영·고도 색·자연색 화상이 그려지는지(교차 출처) 확인. 모음 페이지 `/atlas/` 카드(공개 단원 썸네일 시험).
- [ ] **Step 4:** 마지막 회귀 — `regress_unit --unit u2|u3|u4 --check`. 그리고 **`--unit u5 --baseline`**(다음 단원 Ⅵ 이 엔진을 바꾸기 전에 — 아프리카 때 빠뜨린 것). 엔진이 바뀌어 앞 단원 조각을 다시 만들면 달라지는 부분(등록 자리 — 크기만)이 있으면 교사에게 묻는다: 「엔진 개선(지구본·도법 등록 등)이 생겼으나 u2·u3·u4 공개본은 그대로 둠, 새 판을 낼까?」.

---

## 실행 순서와 병렬화

- **U5-G0 맨 먼저**(u4 기준선을 엔진·공유 스크립트 변경 전에 찍어야 함). U5-D(내려받기)는 U5-G0 과 병렬 가능(저장소 밖).
- U5-1 → **U5-3a**(평사·정사 등록 — U5-2 의 40·41·46쪽 맞추기에 필요, 작음) → U5-2 → (U5-3b~3j 는 U5-2 와 병렬 가능 — 엔진·파이프라인 코드만, 합성 시험으로. 단 3d 는 U5-D 뒤) → U5-4 → U5-5·U5-6·U5-7(병렬 — 서로 다른 파일, 단 공유 스크립트를 고치는 하위 작업은 차례대로 회귀) → U5-8 → U5-9 → U5-10 ⓣ → U5-11 ⓣ.
- U5-3 하위 기능은 **서로 다른 공유 파일**을 고치는 것끼리만 병렬(3c 지구본은 projections·mapView·zoomer, 3h 빗금은 layers·layerStyle — 둘 다 u2 조각 크기에 걸리므로 크기 재기는 차례대로). 회귀는 하위 기능 커밋마다.
- 교사 질문 Q1~Q7 은 U5-1 커밋 직후 코디네이터가 묻는다. 답이 오기 전에는 기본값으로 만들고(Q1·Q2 는 U5-3b·U5-8, Q3 은 U5-3i, Q4 는 U5-8, Q5 는 U5-4·U5-9, Q6 은 U5-3c·U5-8, Q7 은 U5-3e·U5-4), 답이 다르면 그 작업만 다시.
- U5-10 승인 대기 동안 다음 단원(Ⅵ 오세아니아·극지방)의 U6-1·U6-2 를 시작해도 된다(파일이 겹치지 않음). 엔진을 바꾸면 앞 단원들(u2·u3·u4·u5)의 `regress_unit --check`로 화소 비교 — u5 도 공개 뒤에는 `--unit u5 --baseline`을 찍어 둔다(U5-11 Step 4). Ⅵ 의 극 중심 보기는 U5-3c 지구본의 `registerProjection`·페이드 전환·끌기 콜백 자리를 그대로 쓴다.

## 실행 중 결정

- (U5-G0, 2026-10-21) u4 기준선 + 낡은 hub 시험 — 가지 atlas-u5(b851ccf 위)
  - **hub 시험**: `tests/atlas/hub.test.mjs` 「공개 전 registry 단원도 준비 중」의 예를 `atlas-u4-africa`(order 4, page 34) → `atlas-u5-americas`(order 5, page 40, 계획 쪽수 = ATLAS_PLAN u5 [40, 47])로. 검사 뜻 그대로(registry 에 있어도 versions 없으면 planned, 판이 생기면 published + topics 없으면 계획 쪽수).
  - **u2**: 처음 `--check` 는 캡처·조각이 입력(15b696a 의 src 시각)보다 오래됨 `[경고]` → `npm run embed -- atlas-u2-asia`(2,110,935 B) → `compare_shots --unit u2`(41장) → `compare --unit u2` → `--check`: 해시 162개 중 도장만 다름 2(coloring.json·basemap.json), 캡처 41장 화소 차 0(heritage 지명 수 100→101 참고), 대조표 0/9/134/24, 조각 +0.956% — 회귀 없음.
  - **u3 — 판단: 기준선 다시 찍음**: `--check` 해시 195개 중 「새로 생김」 `docs/atlas-u3-europe/2/fragment.html`·`2/index.html`, 「다름」 `docs/atlas-u3-europe/index.html` — u3 기준선(a1cf7ac)을 찍은 뒤 15b696a 에서 유럽 v2 를 공개해 생긴 것뿐(2/fragment.html = 지금 `embed/atlas-u3-europe.html` 바이트 같음, 최신판 index 가 v2 를 가리킴). 캡처 31장 화소 차 0·대조표 0/26/118/42·조각 해시 같음이라 공개본을 넣어 `--unit u3 --baseline` 다시(캡처 경고 → compare_shots·compare 먼저): 해시 195개(저장소 135 · 작업 폴더 60), 캡처 31장, 0/26/118/42, 조각 1,470,531 B(1,436.1 KB) → `--check` 다름 0·화소 차 0. 계획 Step 2 의 「u3 도장만 다름 2 · +0.238%」는 a1cf7ac 의 기준선 다시 찍기 전 수 — 이제 u3 기준은 다름 0 · +0.000%.
  - **u4 기준선**: `compare_shots --unit u4`(42장) → `compare --unit u4`(다름 0 · 알려진 차이 34 · 같음 104 · 참고 41) → `npm run embed -- atlas-u4-africa` **1,593,684 B**(1,556.3 KB — 계획의 1,593,565 B 와 +119 B 이지만 공개본 `docs/atlas-u4-africa/1/fragment.html` 과 바이트 같음, 계획 수는 공개 전 어림) → `--unit u4 --baseline`: 해시 **150개(저장소 103 = sims/atlas-u4-africa/data 16 · content/atlas/u4 4 · docs/assets/atlas/u4 76 · common 3 · docs/atlas-u4-africa 3 · 조각 1; 작업 폴더 47 = vec 29 · fit 12 · places-p34 1 · units/u4 의 city-holdout·charts-u4·climate-world·index·p35-labels 5)** → 곧바로 `--check` 다름 0·화소 차 0.
  - **결정성**: 캡처를 한 번 더 찍고(42장) compare 다시 → `--check` 다름 0 · 화소 다른 장면 0 · 화면 값 다른 장면 0 · 대조표 수·HTML 같음 · 조각 해시 같음 — u4 캡처도 결정적(u2 heritage 같은 지명 수 흔들림 없음).
  - **시험**: `npm test` Python 329(OK) · Node 570(통과 570, 실패 0) — hub 시험 고침으로 실패 1 → 0.
- **U5-D(2026-10-21, 저장소 밖·커밋 없음):** Natural Earth `ne_10m_admin_1_states_provinces.geojson`을 `raw/ne/`와 **같은 판** — nvkelso/natural-earth-vector 커밋 `ca96624a`(2022-06-02 master, VERSION `5.2.0-pre`; `ne_110m_admin_0_countries.geojson` sha256 같음으로 확인) — 에서 받아 `$ATLAS_WORK/raw/ne-admin1/`에 둠(40,726,851 B, sha256 22d0e3ad…, 퍼블릭 도메인, 주소·해시는 `SOURCE.txt`). 속성 키는 **모두 소문자**(`adm0_a3`·`name`·`name_ko`·`postal`·`iso_3166_2`·`adm1_code`·`type_en`). `scripts-u5d/extract_admin1.py`(`python -I`, 도형 그대로, 8개 속성만, `adm1_code` 순)로 뽑음: `usa.geojson` **51**(50주 + DC `type_en` Federal District, 경도 −179.14..179.78 — 알류샨이 180° 를 넘음, 위도 18.91..71.41), `mex.geojson` **32**(31주 + `Distrito Federal` DF, 경도 −118.37..−86.70, 위도 14.55..32.71 — 이름 없는 작은 섬 `MEX+99?` 1개는 뺌). 캐나다 통계청 구역은 받지 않음(기본값). Step 3 확인 그림(DC 따로 칠했는지)은 U5-4 로 넘김.
- **U5-1(2026-10-21) 단원 설정 뼈대 · 지도 목록 28장** — 가지 atlas-u5(ede8518 위)
  - **개수**: `maps_u5.json` **28** = 지도 20 + 미국 알래스카·하와이 삽입 틀 8(계획 표 그대로). 설계 §5.3 어림 22 와 다른 까닭: 설계는 46쪽 미국 4장의 삽입 틀을 지도 수에 반쯤 섞어 셌고, 지도로 넣지 않는 것(47쪽 만화 6칸·A사 기기 그림 — 사진 카드, 42·43쪽 우리나라 실루엣 — U5-3i 윤곽 레이어의 교과서 자리 = 덮개)을 뺐다.
  - **`config/u5.json`**: U4-1 뼈대가 아니라 **지금 u4 설정**(공개본 — 글자 양식 표 places.ignore·styles·kinds·chain, photos.candidate, charts.climateTable 이 아프리카 작업으로 다듬어진 판)의 키 구조·공용 값을 복사하고, 경로를 u5 로(units/u5/…·@unit/…·content/atlas/u5·docs/assets/atlas/u5·charts-u5·p41-labels·p41-coloring·assetPrefix u5/) 바꾸고, 단원 고유 값은 비움: layers {}·photos.items/pins/exclude/expect·charts.items·climateTable.notInTable·places.neAlias/snapAlways/keepTextbookPosition/relocate/indexExclude/extraNames·content.expect(topics 10 만)·expectCredits·insets []. 색칠하기는 41쪽 값(글꼴은 u4 복사)만 두고 regions·noCapital·joinLabels·capitalByNe 는 U5-8 로. **basemap.mergeIsos·cutIsos 는 뺌** — 기아나 GUF 자르기(Q5)는 U5-9 에서 설정만 더함(그 전에 build_basemap 을 돌리면 아프리카 서사하라 자르기가 딸려 오지 않게). `georef.families` = 1단계 8개 + stereographic·orthographic(U5-3a 등록 뒤 풀림), `places.maps`·`cityControls.maps` = 일반도 넷(p40-americas·p40-central·p42-north·p43-south — Q1 한 벌 지명), `places.index.checkPages` [40, 43], neBox·unitBoxes 계획 어림 그대로, 10a `simplifyByIso` 없음(_ 설명만). 글자 양식 표 안 설명(why)에 남은 34쪽 예시는 U5-5 에서 고침.
  - **지도 항목 families**: p40-americas·p41-coloring = ['stereographic'], p46-migration = ['orthographic'], p47-hq·p47-agri = ['miller', 'equirectangular', 'mercator', 'robinson'], 나머지는 단원 목록.
  - **틀·덮개 실측(계획 어림과 다른 것)**: 47쪽 실리콘 밸리 삽입 틀 = 쪽 클립 **[579.3, 179.5, 644.4, 237.0]**(계획 [548,258,745,433]은 100dpi 렌더 화소 자리였음). 42쪽 우리나라 실루엣 덮개 **[130, 345, 197, 442]**(도형 + 「같은 축척과 같은 위도의 우리나라」·동해·황해·남해·독도 글자 — 계획 [130,330,215,415]), 43쪽 대척점 덮개 **[494, 485, 568, 585]**(계획 [490,485,590,600]). 46쪽 지구본 원판 [80.9, 99.0, 197.9, 216.1](계획 [80,99,198,216] 맞음), 47쪽 만화 래스터 [44,95,389,305](지도 아님). 45쪽 1월·7월 틀은 쪽 클립이 서로 겹쳐(1월 클립 오른쪽 581 > 7월 시작 557.8) 1월 [378.4, 99, 578.5, 338.8]·7월 [574, 99, 760.5, 338.6]으로 자름. 46쪽 미국 본토 틀 [321, 98, 494, 216](채움 도형 실측), 덮개 키가 둘뿐이라 **알래스카 틀 = cartoucheBbox, 하와이 틀 = insetBbox**(알래스카 틀은 캘리포니아를 비켜 오른쪽 위가 비스듬히 잘린 5변형 — 네모 덮개가 남캘리포니아 해안 끝 약 5pt 삼각형을 함께 덮음). 46쪽 민족 지도 위 고리 5 는 덮개 키가 모자라 색으로 거름(땅 색에서 고리 색 뺌).
  - **fitFrom 이동량**(46쪽 미국, 같은 모양 도형 짝 — 항목 수·크기 같음 — 의 자리 차 최빈값): 본토 아프리카계 (237.99, −0.04)·히스패닉계 (0.18, 140.31)·아시아계 (237.99, 140.31), 알래스카 (237.9, −0.02)·(0.09, 140.33)·(237.9, 140.33), 하와이 (237.99, −0.04)·(0.18, 140.31)·(238.02, 140.35). 글자(「500km」 x 차 235.9, 「1,000km」 236.9)는 도형과 달리 놓여 쓰지 않음. 틀(bbox·덮개)은 유럽계 틀 + 이동량. fitFrom 지도는 shapes 없음(U5-2 georef-cli `fitFrom` 이 만듦).
  - **처음 식(shapes.init) — U4-1 꼴로 미리 적음**(U5-2 에서 land_shapes·shape_controls 로 확인): 섬·나라 씨앗(c = 교과서 도형 안 한 점, at = Natural Earth 도형 안 한 점)을 3배 이상 확대 렌더에서 잼 — 41쪽 나라 6, 44쪽 섬 6(뉴펀들랜드·쿠바·히스파니올라·자메이카·푸에르토리코·포클랜드), 45쪽 1월·7월 섬 5, 46쪽 지구본 섬 5(그린란드·아이슬란드·그레이트브리튼·쿠바·히스파니올라 — 대륙은 원판 가장자리에서 잘림), 캐나다 4(target countries — 본토·배핀·뉴펀들랜드·하이다과이), 하와이 4, 민족 6, 47쪽 본사 5(아이슬란드·그린란드·오스트레일리아·뉴질랜드 둘)·농업 4(오스트레일리아·뉴질랜드가 그려지지 않은 판이라 대륙 둘 — 아프리카·유라시아, 아메리카). 섬 없는 지도: 미국 본토·알래스카 = `init.land`(target countries — USA 조각), 실리콘 밸리 = `{fromMap: p47-hq, pts: 포인트레이스·알비소}`, 마킬라도라 = `{fromMap: p42-north, pts: 카보산루카스·카토체곶}`. 씨앗 자리는 렌더 위 표시로 눈 확인(`units/u5/u5-1/mk*.png`). 지구본 래스터 규칙은 미정 — 포르투갈 초록 면(B−R 92)·옅은 바다(B−R 40)가 seaBMinusR 하나로 갈리지 않아 U5-2 에서 정함(_why 에 적음).
  - **경위선 글자 수(find_maps)**: 40쪽 28(계획 어림 33 — 삽입 틀 글자 포함 여부, U5-2 Step 1 에서 다시 셈)·42쪽 25(어림 34)·43쪽 31·45쪽 26·47쪽 2(적도 「0°」 — 두 세계 지도에 하나씩, 교차점 없음 → graticuleLabels false).
  - **시험**: `test_maps_u5.py` 14개(u4 꼴 + fitFrom 이동량이 틀과 맞음·빌린 지도는 또 빌리지 않음·미국 12장 공유 구조·도법 이름 = 1단계 8 + 평사·정사·단원 설정 경로가 u5). 작업 스크립트는 저장소 밖 `$ATLAS_WORK/units/u5/u5-1/`(gen_u5.py·clips.py·crop.py·fills.py·marks.py 등). `npm test` 종료 코드 0(Python 329 + 14 = 343 예상 — Python 줄은 출력 꼬리에서 잘려 수를 보지 못함, 실패 없음 · Node 570 통과 570, 실패 0).
- **U5-3a(2026-10-21) 평사·정사 도법 등록 `registerFamily`** — 가지 atlas-u5(1810516 위)
  - **엔진(공유 자리만)**: `fitCore.js` 에 `EXTRA_FAMILIES`(모듈 안 객체) + `registerFamily(name, fn)` + `familyOf(name)`(고정 `FAMILIES` → 등록 차례, 없으면 undefined). `FAMILIES` 는 8개·Object.freeze 그대로. `fitProject.makeFitForward` 가 `familyOf` 를 씀(모르는 이름은 옛 오류 「모르는 교과서 도법」 그대로).
  - **`src/atlas/americasExtra.js`(새로)**: `installAmericasFamilies()` = `registerFamily('stereographic', p → geoStereographic().rotate([-p0, -p1]))`·`('orthographic', … geoOrthographic().rotate(…).clipAngle(90))`, `installAmericasExtras()` = 지금은 그것만(3b~3j 가 더함). u5 main.js 는 U5-9 에서 만든다.
  - **파이프라인 `georef.mjs`(도장 입력)**: 불러올 때 `installAmericasFamilies()` 를 늘 부름. `FAMILIES[name]` 세 곳(familiesFor 검사·rawProjection·evaluate) → `familyOf`, `INIT`(출발 [100, 40])·`PARAMS`(2)에 두 이름, 방위 정리(`normAzimuthal`)는 `fam.startsWith('azimuthal')` → `AZIMUTHAL` 집합(정적·정거 + 평사·정사). 기본 후보 `FAMILY_NAMES`(= Object.keys(FAMILIES))·`PHASE1_FAMILIES` 는 8개 그대로라 u2~u4 지도 후보에 새 이름이 안 들어감.
  - **도장**: `georef.mjs`·`fitCore.js` 는 u2·u3·u4 coloring 도장 입력 → u2 content 시험(loadInputs 도장 확인)이 멈춤 → U4-8 과 같이 `coloring_quiz --unit u2|u3|u4 --write` 로 **inputsHash 한 줄만** 새 값(git diff 파일마다 1줄, 나머지 바이트 같음 — regress 「도장만 다름」으로 확인). u5 설정 coloring 도장 files 에 `src/atlas/americasExtra.js` 를 더함(41쪽 색칠하기 = 평사 fit 이라 도법 정의가 입력).
  - **시험** `tests/atlas/americasExtra.test.mjs` 4개: 등록 전 `familyOf('stereographic'|'orthographic')` undefined·`makeFitForward` 「모르는 교과서 도법」·FAMILIES 8개 얼림, 등록 뒤 d3 평사·정사와 같은 값(정사 clipAngle 90, 두 번 등록해도 같음), 합성 기준점(평사 40점·정사 30점 + 결정적 잡음 ±0.1pt) `fitControls(cps, ['stereographic'|'orthographic', 'azimuthalEquidistant'])` 가 새 도법을 고르고 중심 ±0.5°, `FAMILY_NAMES`·`PHASE1_FAMILIES`·`familiesFor(u2 지도)` = 1단계 8개, 지도 항목 families 로만 풀림. georef 는 등록 전 시험 뒤 동적 import(불러올 때 등록하므로). `npm test` Python 343 OK · Node 574(통과 574, 실패 0).
  - **fit 바이트**: `georef-cli --unit u2|u3|u4 --all` 다시 → `$ATLAS_WORK/geo/*.fit.json` 43개 모두 md5 같음.
  - **회귀**(src 고침 — 차례대로 embed → compare_shots → compare → check): u2 해시 162개 중 도장만 다름 2(coloring.json·basemap.json — G0 과 같은 두 파일), 캡처 41장 화소 차 0(heritage 지명 수 100→101 참고), 0/9/134/24, 조각 **2,110,960 B(+0.957%, 기준선 2,090,947 B — U5-G0 2,110,935 B 에서 +25 B, +1% 까지 남은 여유 896 B)** — 회귀 없음. u3 해시 195개 중 도장만 다름 1(coloring.json), 캡처 31장 화소 차 0, 0/26/118/42, 조각 1,470,556 B(+0.002%) — 회귀 없음. u4 해시 150개 중 도장만 다름 1(coloring.json), 캡처 42장 화소 차 0, 0/34/104/41, 조각 1,593,709 B(+0.002%) — 회귀 없음. 세 조각 모두 +25 B = fitCore 등록 자리(fitProject 는 세 조각 모두 이미지 레이어로 씀).
- **U5-2(2026-10-21) 기준점과 경위도 맞추기 — 28장 모두 평균 잔차 ≤ 0.37mm(`approx` 없음), `projectionFrom` 3 · `fitFrom` 9** — 가지 atlas-u5(0e12a9c 위)
  - **40쪽 삽입 교차점 — 공유 스크립트 `extract_vectors.py` 에 지도 항목 `excludeBoxes`(있을 때만)**: 처음 뽑기에서 p40-americas 교차점 47 중 상당수가 삽입 「중앙아메리카」 경위선(밀러 — 쪽 클립보다 길게 그려진 2점 직선)·눈금 글자(90°W~50°W·10°N·20°N)와 본 지도 선이 엉킨 틀린 교차점이었고 흩어진 교차 16 이 버려졌다(본 지도 20°N 교차점이 거의 다 빠짐). 상자 안 눈금 글자·교차점을 버리는 키를 더하고 p40-americas 에 `excludeBoxes [[50, 469, 393, 645]]`(insetBbox + 2pt) → 교차점 34(경선 7 × 위선 6, 20° 격자, 흩어진 교차 0). 삽입은 p40-central 이 따로 뽑음(교차점 10). 42쪽은 눈금 글자가 10~30°N 위선·경선뿐(40°N 위는 글자 없음)이라 교차점 21 — 북쪽은 도시 기준점이 붙잡음. 도장 입력 아님.
  - **도시 기준점**(`places.py --unit u5` → `city_controls --unit u5 --write`, 설정 u4 값 그대로): 40쪽 기호 지명 242 · 이름 짝 191(동명 38 — 산호세·킹스턴·산티아고·런던 등 짝에서 빠짐) · MAD 로 뺌 16(더블린 342pt = 다른 나라 동명, 마라카이보·카라카스·칼리 등 10~16pt = 삽입 쪽 기호와 섞인 것, 디트로이트·클리블랜드 등) → 고름 46(껍질 밖 18 — 리스본·파리·다카르·레이캬비크 등 지도 동쪽 끝), 삽입 5, 42쪽 78(MAD 15 — 산티아고데쿠바·관타나모·볼티모어·보고타 등), 43쪽 47(MAD 8 — 발렌시아(동명)·바르키시메토·훌리아카·리마 3.5pt 등). 카리브 수도는 이름 짝 단계에서 대부분 동명·삽입 겹침으로 빠짐 → U5-5 `snapAlways` 후보는 대조 때 다시. 겹 나누기 빠진 도시 오차(km 중앙/90%/최대): 40쪽 2.9/7.5/12.8(교차점만 4.3/9.3/15.6) · 삽입 8.0/26.2/26.2 · 42쪽 4.7/15.0/27.1 · 43쪽 4.8/13.6/21.3(`units/u5/geo/city-holdout.json`).
  - **`places.neBox` = [−180, −65, 8, 83]**: 40쪽 틀 41×41 격자를 p40-americas fit 으로 되돌린 범위(경도 −179.7..7.9 · 위도 −64.6..83.0). 날짜변경선 건너편(157°E~180°, 추코트카 끝·빈 바다)은 neBox 가 상자 하나라 버림. 넓힌 뒤 city_controls 를 다시 돌려 40쪽 도시 33 → 46(유럽·서아프리카 13 더함), 42·43쪽 몇 개 바뀜 → 다시 맞춤(아래 표는 넓힌 뒤 값). **`basemap.unitBoxes` = [[−95, 3, −48, 28]]**: p40-central 틀을 되돌린 범위(−94.7, 3.0, −48.3, 26.0)의 정수 넓힘, 북쪽만 28°N(바하마 북쪽 섬이 삽입 틀 위로 잘려도 한 나라를 10a 로 온전히 — 바탕 지도 크기는 U5-9 에서 실측).
  - **눈금 없는 지도**(`land_shapes --unit u5 all` → `shape_controls`): 처음 식을 고친 것 — 44쪽 지형(뉴펀들랜드가 래스터 번짐으로 래브라도와 한 덩어리 → 씨앗 목록을 `{fromMap: p40-americas, pts}`로), 45쪽 1월·7월(그린란드가 틀에 잘림 → `{fromMap: p45-climate, pts}`), 46쪽 미국 본토(`init.land` 메르카토르 출발 → 짝 0 → `{fromMap: p42-north, pts: 플래터리곶·퀴디헤드·세이블곶·리오그란데강 어귀}`), 알래스카(아래), 민족(포클랜드 씨앗 빼기 — 고리 범례에 가림). 41쪽 색칠하기·46쪽 지구본·캐나다·47쪽 세계 2장·실리콘 밸리·마킬라도라는 U5-1 처음 식 그대로 됨. **u5 `shapeControls.iterations` 5 → 10**(단원 설정만, `_iterations`): 캐나다·미국·47쪽 세계 2장이 5번째에도 rms 가 줄고 있었다(본사 1.42 → 10번째 0.46pt). 그래도 짝 목록이 끝까지 같아지지 않는 지도(1·7월·지구본·캐나다·미국·본사·실리콘 밸리·마킬라도라)는 U4-2 와 같은 까닭(꺾인 점 짝이 거리 문 경계에서 드나듦, rms ±0.05pt)이라 마지막 짝.
  - **45쪽 기후 구분 — 섬 기준점 뺌**(`shapes` 키를 지움): 교차점 47 + 섬 4 로 맞추면 섬 넷이 모두 2.8~3.6pt 잔차(겹 나누기 중앙 3.4pt — 래스터 덩어리 잘못 짝)라 TPS 가 그 자리를 비틀었다 → 교차점만 rms 0.27pt, TPS 없음.
  - **`projectionFrom` 3**: ① **알래스카 삽입 ← p46-us-european** — 자유 맞춤이 꺾인 점 잘못 짝(기준점 8)으로 정거 방위 중심 99°E 라는 엉뚱한 식이 되어 해안이 크게 어긋남(확인 그림). 16배 렌더에서 끝점·섬 여섯(프린스오브웨일스곶·141°W 국경 두 끝·세인트로렌스·누니박·코디액)을 찍어 견주니 본토 식 고정 rms 0.37pt(회전 1° — 141°W 경선이 26° 기운 것 = 본토 원뿔 수렴각) · 평사 0.66 · 람베르트 정각 0.76 · 알래스카 중심 정적 원뿔 0.80 → 본토 식 고정 + 그 여섯을 처음 식 pts 로(맨 위 「배로곶」으로 본 점은 어느 식에서도 6~8pt 라 뺌). ② **하와이 삽입 ← p46-us-european** — 섬 4 = 기준점 4 라 도법을 열면 과적합(원뿔 0.02pt, 정적 방위 중심 −138.6°·31°), 본토 식 고정 0.03pt(회전 −34° = 북쪽 위로 앉힘)·메르카토르 0.08pt 로 4점으로는 못 가림 — 알래스카와 같이 본토 식. ③ **47쪽 농업 ← p47-hq** — 자유 맞춤도 밀러 0.40pt 로 고정과 같음(원통 중심 경도는 닮음 변환과 구별 안 됨) → 두 세계 지도를 같은 식으로. 45쪽 7월은 고정(p45-climate)하면 1.49pt 로 나빠져 자유(평사 −97.9°, 3.3°), 캐나다·민족·마킬라도라도 자유가 고정보다 2~5배 좋아 그대로.
  - **`fitFrom`(새 키 — `georef-cli.mjs` + 순수 함수 `projection_from.mjs shiftFit`, 있을 때만)**: 빌린 지도 fit(이번 실행에서 먼저 맞춘 것)을 복사해 `sim.tx += dx`·`sim.ty += dy`, TPS 는 기준점째(`cx·cy·hull += dx·dy` — 정규화 좌표 `pts`·`taper` 그대로), `fitFrom {map, dx, dy}` 기록, `resid`·`dropped` 는 지움(품질 수치는 빌린 식 것), 그 지도 자체 기준점이 있으면 `own {n, rmsPt, maxPt, resid}`(지금 9장 모두 0). 빌린 지도가 이번에 맞춰지지 않았거나 fitFrom 지도면 멈춤. `georef.mjs`(도장 입력)는 손대지 않음. 46쪽 미국 9장(아프리카계·히스패닉계·아시아계 × 본토·알래스카·하와이 — U5-1 이동량) 확인 그림에서 해안·주 경계가 교과서 위. 시험: 합성 TPS fit(잡음 ±1.5pt) 이동 → 껍질 안·밖 다섯 점이 정확히 dx·dy(1e-6)·되돌리기 같음·원본 그대로, u5 fit 시험에서 9장 sim 차 = dx·dy · a·b 같음 · (−98°, 39°) 가 dx·dy 만큼 옮겨짐. **`fitFrom` 없는 u2·u3·u4**: `georef-cli --unit u2|u3|u4 --all` 다시(extract_vectors 가 바뀌어 controls 도 다시 뽑힘) → `geo/*.fit.json` 43개 + `vec/*.controls.json` 43개 **md5 모두 같음**.
  - 경위도 맞추기 결과(`georef-cli --unit u5 --all`; 겹 나누기 = shape 기준점 5겹 `units/u5/geo/shape-holdout.json` — 그 파일의 45쪽 기후 구분 줄은 섬을 빼기 전 값이라 낡음; 일반도는 도시 겹 나누기 km):

    | 지도 | 도법(중심) | 기준점 | rms pt / mm | 평균 mm (LOO) | 잔차 중앙/최대 pt | 겹 나누기 평균 pt · km 중앙/90%/최대 |
    |---|---|---|---|---|---|---|
    | p40-americas | 평사 −100.0°, 0.0 | 교차 34 + 도시 46 | 0.28 / 0.10 | 0.08 | 0.18 / 0.72 | 도시 2.9/7.5/12.8 km |
    | p40-central | 밀러 −70.0° (+TPS) | 교차 10 + 도시 5 | 0.53 / 0.19 | 0.15 (0.18) | 0.34 / 1.45 | 도시 8.0/26.2/26.2 km |
    | p41-coloring | 평사 −100.0°, 0.0 | 나라 18 | 0.28 / 0.10 | 0.08 | 0.23 / 0.78 | 0.28 · 6.5/9.4/22.3 |
    | p42-north | 람베르트 정각 원뿔 −107.7°, 41.0/41.0 (+TPS) | 교차 21 + 도시 78 | 0.65 / 0.23 | 0.20 (0.18) | 0.48 / 1.77 | 도시 4.7/15.0/27.1 km |
    | p43-south | 람베르트 정적 방위 −60.2°, 0.5 (+TPS) | 교차 58 + 도시 47 | 0.72 / 0.25 | 0.23 (0.16) | 0.58 / 1.94 | 도시 4.8/13.6/21.3 km |
    | p44-relief | 평사 −99.9°, 0.1 (+TPS) | 섬·호수 85 | 0.55 / 0.19 | 0.14 (0.18) | 0.24 / 1.82 | 0.54 · 8.3/26.5/86.3 |
    | p45-climate | 평사 −100.0°, 0.0 | 교차 47 | 0.27 / 0.10 | 0.09 | — | — |
    | p45-jan | 평사 −100.0°, −0.4 (+TPS) | 섬 2 + 꺾인 점 58 | 0.91 / 0.32 | 0.29 (0.35) | 0.81 / 2.01 | 0.93 · 48.6/111/137 |
    | p45-jul | 평사 −97.9°, 3.3 (+TPS) | 섬 1 + 꺾인 점 46 | 1.08 / 0.38 | 0.35 (0.51) | 0.98 / 2.03 | 1.47 · 83.8/167/257 |
    | p46-migration | **정사 −30.3°, 9.2** (+TPS) | 섬 3 + 꺾인 점 52 | 0.67 / 0.24 | 0.20 (0.24) | 0.45 / 1.66 | 0.68 · 89.5/287/—(원판 가장자리 1점 되돌림 안 됨) |
    | p46-canada | 평사 −76.9°, −5.5 (+TPS) | 섬 13 + 꺾인 점 69 | 1.18 / 0.42 | 0.37 (0.49) | 0.96 / 2.54 | 1.33 · 33.2/73.6/141 |
    | p46-us-european | 정적 원뿔 −96.1°, 19.0/58.1 (+TPS) | 섬 1 + 꺾인 점 38 | 0.53 / 0.19 | 0.15 (0.23) | 0.34 / 1.66 | 0.63 · 14.4/25.5/56.8 |
    | p46-us-european-ak | ← p46-us-european | 섬 7 + 꺾인 점 8 | 0.44 / 0.15 | 0.12 | 0.31 / 1.00 | 0.40 · 16.5/42.0/61.9 |
    | p46-us-european-hi | ← p46-us-european | 섬 4 | 0.03 / 0.01 | 0.01 | 0.02 / 0.03 | 0.05 · 1.4/1.6/1.6 |
    | p46-us-{african, hispanic, asian}(-ak, -hi) 9장 | fitFrom(유럽계 셋 + 쪽 이동량) | — | 빌린 식 그대로 | | | |
    | p46-ethnic | 평사 −70.5°, −0.2 (+TPS) | 섬 12 + 꺾인 점 35 | 0.94 / 0.33 | 0.30 (0.34) | 0.85 / 2.23 | 0.87 · 29.8/66.7/109 |
    | p47-hq | 밀러 146.8°E | 섬 70 + 꺾인 점 174 | 0.39 / 0.14 | 0.10 | 0.17 / 1.47 | 0.27 · 12.9/58.3/161 |
    | p47-hq-sv | 정거 원통(작은 지역) −122.2°, 37.8 | 꺾인 점 17 | 0.35 / 0.12 | 0.10 | 0.22 / 0.73 | 0.35 · 0.8/1.6/2.0 |
    | p47-agri | ← p47-hq | 섬 69 + 꺾인 점 182 | 0.40 / 0.14 | 0.10 | 0.17 / 1.45 | 0.29 · 13.1/60.1/184 |
    | p47-maquila | 평사 −112.6°, 25.7 | 섬 4 + 꺾인 점 43 | 0.33 / 0.12 | 0.10 | 0.22 / 0.79 | 0.31 · 4.9/10.7/16.8 |

    40·41·44·45쪽 큰 지도 넷이 따로 맞춰 모두 **평사, 중심 약 100°W·0°** — 지면 「입체 투영 도법」과 같은 바탕 지도. 가장 빠듯한 것은 46쪽 캐나다(0.37mm, LOO 0.49 — 센서스 구역 채움 경계가 해안을 거칠게 따름). 해안 어긋남(U4-2 꼴 수치)은 재지 않고 확인 그림으로 봄: `units/u5/geo/<id>.verify.png`(150dpi) 28장 + 작은 틀은 큰 그림 `units/u5/u5-2/bv_<id>.png`(300~600dpi — 알래스카·미국·지구본·실리콘 밸리·캐나다). 28장 모두 해안선이 교과서 해안 위(알래스카는 projectionFrom 뒤).
  - 작업 스크립트(저장소 밖) `$ATLAS_WORK/units/u5/u5-2/`: mapsio.py(지도 목록 고치기 — json indent 1)·rend.py(쪽 클립 + pt 격자 렌더)·crop.py·alt*.mjs(고정 도법 비교)·frame.mjs(틀 되돌림 범위)·bigv.mjs(큰 확인 그림)·sc*.log·holdout.log.
  - **시험**: `test_controls.py` ControlsU5 2(40·42·43쪽 기준점 ≥ 12 · grid+city · neBox 안, 40쪽 교차점이 삽입 틀 밖 · 20° 격자 ≥ 30), `test_maps_u5.py` 2곳 고침(unitBoxes·neBox 새 값, 기준점 경위도에 알류샨 날짜변경선 건너편 허용 — 44쪽 래트 제도 179.6°E), `georef.test.mjs` 2(u5 fit 28장 — rms·평균 ≤ 0.5mm · 40/41쪽 평사 · 지구본 정사 · 42/43/삽입 도법 · p47-hq 중심 120~180 · projectionFrom 고정 · fitFrom 9장 sim 이동 = dx·dy / shiftFit 합성). `npm test` Python 345 OK · Node 576(통과 576, 실패 0).
  - **U5-2 회귀**(공유 스크립트 `extract_vectors.py`·`georef-cli.mjs`·`projection_from.mjs` — 도장 입력 아님, src 고침 없음): `regress_unit --unit u2 --check` 해시 162개 중 도장만 다름 2(coloring·basemap — U5-3a 와 같음), 캡처 41장 화소 차 0, 0/9/134/24, 조각 +0.957% — 회귀 없음. u3 도장만 1, 31장 화소 차 0, 0/26/118/42, +0.002% — 회귀 없음. u4 도장만 1, 42장 화소 차 0, 0/34/104/41, +0.002% — 회귀 없음. 낡음 `[경고]` 없음.
  - **이어서 볼 것**: build_layers 의 projectionFrom 낡음 검사는 fitFrom 지도에 아직 없음(fitFrom fit 은 빌린 지도 바로 뒤에 같은 georef-cli --all 에서 쓰이므로 함께 새로 됨 — U5-3d·U5-4 에서 미국 주 레이어를 만들 때 필요하면 fitFrom 낡음 검사를 더함). 카리브 수도 기호 자리(MAD·동명으로 빠짐)는 U5-5 대조에서.
- **U5-3b(2026-10-21) 여러 일반도 지명 합치기 `places.mergePriority`** — 가지 atlas-u5(83904dd 위)
  - **옛 합치기 규칙(읽고 기록 — u2 16·18·19쪽 · u3 · u4 그대로)**: `build_places.merge` 는 출현을 차례대로 돌며 같은 열쇠(`key` = 공백 뺀 이름, alt 는 안 봄)·같은 묶음(`mergeFamily` — 수도 = 도시, + 점/면)이고 묶음 안 어느 출현과 `dedupKm`(점 기호끼리 60 · 기호 없는 점 150 · 면·선 20000km — 사실상 이름만) 안이면 한 묶음. 위치 = 기호 있는 것 → 큰 축척(분모 작은 것) → 큰 글자, 단 나라(`overviewKinds`)와 개관도 글자 ≥ `overviewMinSize`(9pt)인 큰 지물은 개관도 글자 먼저. rank = 개관도 출현 글자 크기 단계 최소(없으면 지역도 단계 + `regionalRankPenalty` 1) + `rankAdjust`, size = 개관도 가장 큰 글자. en·alt·elev 는 개관도 출현 먼저.
  - **새 길 `mergeByPriority`(설정 `places.mergePriority` 가 있을 때만 — u5 `["p42-north", "p43-south", "p40-central", "p40-americas"]`, `mergeKm` 30)**: 출현을 우선 차례로 돌며 같은 이름(**alt 포함** — 한쪽 이름이 다른 쪽 alt 여도)·같은 묶음이고 점 지명은 묶음 안 어느 출현과 `mergeKm` 안, 면·선 지명은 `dedupKm.area` 안이면 한 묶음(계획의 「30km」는 점 지명 몫 — 면 지명은 지도마다 글자 자리가 수백 km 달라 30km 로는 「멕시코」가 셋이 됨). 위치·size·page·rank = **우선 차례 앞 지도** 출현(같은 지도 안에서는 기호 → 큰 축척 → 큰 글자; 앞 지도가 축척이 작아도 앞 지도), rank = 그 글자 크기 단계(지도별 표 `rankBySizeMaps[지도]` — 없으면 `rankBySize`) + `rankAdjust`(지역도 벌점 없음), en·alt·elev 는 앞 지도부터 처음 있는 것(alt 가 이름과 같으면 뺌), **`from: [지도 id…]`**(우선 차례, 출현 하나여도 적음 — u5 places.json 에만). 지도별 글자 양식은 `places.py` 양식 표(`ignore`·`styles`) 항목의 `maps: [지도 id…]`(없으면 모든 지도 — 옛 동작). 지도별 rank 표·양식 값은 U5-5 에서 채움.
  - **u5 시험 돌림**(`build_places --unit u5` — 산출 `sims/atlas-u5-americas/data/places.json` 은 U5-9 몫이라 지우고 사본만 `units/u5/u5-3b-places.json`·로그 `u5-3b-build_places.log`): 출현 1,139(40쪽 375 · 삽입 54 · 42쪽 409 · 43쪽 301) → 지명 **808**(from 지도 수: 하나 536 · 둘 228 · 셋 이상 44, 삽입 지명 54 중 53 이 다른 지도와 합쳐짐), 같은 이름 여러 개 42(나라·수도 같은 이름 과테말라·파나마 등 정당 + **40쪽 도시 기호 짝 오류로 30km 넘게 떨어져 남은 것** — 디트로이트 258km·카라카스 267km·라파스 410km·밴쿠버 267km 등, 모두 40쪽 출현 → places.py 40쪽 기호 짝(작은 기호 3,220개 사이 — 안 쓴 기호 106) 문제라 U5-5 에서). 찾아보기 40~43쪽 469줄: 없음 1 · 다른 쪽에만 6. 동명 산호세·산티아고·발렌시아는 따로 남음. 면 지명 동명(콜로라도강 미국·아르헨티나)은 `dedupKm.area` 20000 이면 합쳐지므로 U5-5 에서 줄이거나 neAlias 꼴로.
  - **「중앙아메리카」 바로가기**(Q2): 엔진 작업 없음 — 범위 = p40-central 틀 되돌린 범위 (−94.7, 3.0, −48.3, 26.0)(U5-2 `unitBoxes` 근거와 같음), 주제 view 는 U5-8 topics.json 에서.
  - **시험**: Node `tests/atlas/places.test.mjs` 4(10km → 하나 · 앞 지도 자리·from · 축척보다 우선 차례 · 50km → 둘 · 산호세 둘 · 산 ↔ 도시 둘 · alt 로 합침 · 영문은 뒤 지도 것도 · 지도별 rank 표·수도 −1 · 면 지명 · 키 없으면 옛 결과 from 없음), Python `test_places.py` 1(양식 `maps` 조건). **u2·u3·u4 places.json 다시**(`build_places --unit u2|u3|u4` — places.py 가 바뀌어 places-<지도>.json 도 다시 뽑힘) → git 차이 0(바이트 같음). `npm test` Python 346 OK · Node 580(통과 580, 실패 0).
  - **회귀**(공유 스크립트 `places.py`·`build_places.mjs` — 도장 입력 아님, src 고침 없음): 다시 쓴 places.json(바이트 같음)의 시각 때문에 셋 다 낡음 `[경고]` → embed → compare_shots → compare → check. u2 해시 162개 중 도장만 다름 2(coloring·basemap — 앞과 같음), 캡처 41장 화소 차 0, 0/9/134/24, 조각 2,110,960 B(+0.957% — 그대로) · u3 도장만 1, 31장 화소 차 0, 0/26/118/42, +0.002% · u4 도장만 1, 42장 화소 차 0, 0/34/104/41, +0.002% — 셋 다 회귀 없음.
- **U5-D Step 3 남은 것(2026-10-21, U5-3d 중) — 확인 그림 `units/u5/admin1-check.png`(위: 46쪽 미국 4장 위에 주 경계 — 본토는 각 지도, 알래스카·하와이는 각 삽입 fit · 가운데: DC 자리 1600dpi 확대 · 아래: 47쪽 마킬라도라 위에 멕시코 32주, 작업 스크립트 `units/u5/u5-3d/admin1_check.py`)**: 주 수·모양이 교과서 채움 경계와 맞음(51 = 50주 + DC, 알류샨이 알래스카 틀 안에 이어짐, 멕시코 32주 경계가 47쪽 주 경계선 위). **교과서는 DC 를 따로 칠하지 않았다**: 네 지도 모두 DC 자리(유럽계 (469.42, 148.93)pt)에서 1.5pt 안 채움 도형은 메릴랜드(14.8×7.8pt 상자)·버지니아 두 개뿐이고 DC 크기 도형이 없음, DC 표본 2개가 네 장 모두 메릴랜드 분류(아프리카계 지도는 25~35 = 메릴랜드 값 — 실제 DC 41% 이면 35 이상이었을 것). → 기본값대로 **DC 는 메릴랜드 값**(설정 `units.sameAs {DC: MD}` — 지금도 표본이 메릴랜드 면에 들지만 경계 어긋남에 기대지 않게 명시, U5-4 레이어 설정에서).
- **U5-3d(2026-10-21) 하위 행정 구역 단계구분 `regionClass`** — 가지 atlas-u5(6ba7cc1 위)
  - **파이프라인 `country_class.py`(도장 입력 아님)**: 레이어 설정 `units`(있을 때만 — `build` 첫 줄에서 `build_units` 로 갈라짐, 없으면 나라 길 바이트 그대로)= `{source: 'raw/ne-admin1/usa.geojson', key: 'postal', name: 'name', insets?: {AK: 'p46-us-<계>-ak', HI: '…-hi'}, sameAs?: {DC: 'MD'}, simplifyDeg?(기본 0.2), minAreaDeg2?(기본 0.05)}`. 구역마다 그 면이 든 지도(insets 아니면 본 지도) fit 으로 안쪽 표본(나라와 같은 `sample_points` 3×3 + 대표점) → 그 지도 틀(`frame` — 본토는 알래스카·하와이 덮개를 뺀 면)·**그 지도의** 범례색 채움 면(`vector_zones(삽입 지도, 본 지도 범례)`)으로 다수결(`classify_units`), 분류 못 한 구역은 경고 「분류 없음 — 지도 틀 밖(삽입 지도 insets 를 줬는지)」(`unit_warnings`), `sameAs`(교과서가 따로 칠하지 않은 작은 구역 = 이웃 분류, 로그 `sameAs [{key, from, cls, was}]`), 고침은 `countryOverrides`(열쇠 = 구역 key — 모르는 key 는 오류). 출력 cc.json 에 `features`(구역 면 — 작은 섬 조각 버림(구역마다 가장 큰 조각은 남김) → `shapely.coverage_simplify`(이웃 경계를 함께 — 틈·겹침 없음) → 0.001° 격자 → 바깥 고리 시계 방향 → MultiPolygon, `{key, name, cls}`). 레이어 종류는 설정 `type: 'regionClass'`(build_layers 가 countryClass 와 함께 country_class.py 로 보냄). **계획의 mapshaper 대신 shapely coverage_simplify**: 같은 일(공유 경계 함께 단순화)을 프로세스·도구 설치 없이 — clip_land.py 와 같은 길.
  - **`build_layers.mjs`**: `regionClassLayerJson` → 면 레이어 GeoJSON `{type:'FeatureCollection', properties:{id, map, page, title, kind, layerType:'regionClass', approx, source(「하위 행정 구역별 분류 — Natural Earth 1단계 행정 구역 표본점」), winding:'cw', legend[present]}, features:[{properties:{type:'area', cls, label, color(범례 꾸밈 뒤), name, key}}]}` — 앱은 topics 레이어 type `'area'`(areaLayer)로 그대로, **엔진 고침 없음**. 범례 분류에 구역이 없거나 expectLegend 가 다르면 멈춤. **fitFrom 낡음 검사(U5-2 이어서 볼 것)**: `loadFit` 이 지도 항목 `fitFrom` 이 있으면 `fitFromStale(fit, 빌린 지도 fit, fitFrom)`(새 순수 함수 — `projection_from.mjs`: fit 의 fitFrom 기록·이동량이 지도 목록과 같은지, 도법·매개변수·닮음 변환·TPS 가 `shiftFit(빌린 fit)` 과 같은지 — 파일 시각은 안 봄)로 멈춤. 하위 행정 구역판은 country_class.py 가 fit 을 바로 읽으므로 그 전에 본 지도·삽입 fit 을 `loadFit` 으로 검사(units 있을 때만). 지금 u5 fitFrom 9장 모두 낡음 없음(null).
  - **u5 시험 돌림(레이어 설정은 U5-4 몫이라 단원 설정에 안 넣음 — 작업 스크립트 `units/u5/u5-3d/trial.py` 가 범례 견본(왼쪽 x 272~318 · 4~200pt² 채움 5개, 「80 이상」 등 글자)으로 `legendItems`·units 설정을 만들어 `build_units` 를 바로 부름)**: 네 장 모두 **51/51 구역 분류**(지도 밖·분류 없음·갈림 0 — 알래스카·하와이는 삽입 fit), DC = MD(유럽계 50 미만 · 아프리카계 25~35 · 히스패닉계 10~20 · 아시아계 5~10). 확인 그림 `units/u5/u5-3d/regionclass-verify.png`(왼쪽 교과서 · 오른쪽 단순화 면을 분류 색으로 되돌림)에서 네 장 모두 주별 색이 교과서와 같음(미시시피 아프리카계 35 이상, 하와이 아시아계 20 이상, 뉴멕시코 히스패닉계 40 이상 등). 결과 사본 `units/u5/u5-3d/p46-us-*.cc.json`·`trial-classes.json`.
  - **면 크기(레이어당 목표 ≤ 30KB)** — usa.geojson 51구역(조각 404) 단순화·작은 조각 버림 표(JSON 압축 없음, `units/u5/u5-3d/simp.py`): 0.02°/0 → 278.9KB(점 16,035) · 0.05°/0.01°² → 107.9KB · 0.1°/0.05 → 51.4KB · 0.15°/0.05 → 36.0KB · **0.2°/0.05 → 30.0KB(점 1,401 · 조각 88)** · 0.25°/0.1 → 25.3KB. 기본값을 0.2°/0.05°² 로(0.2° ≈ 46쪽 지도 0.8pt — 교과서 축척에서는 눈에 안 띄고, 확대하면 해안이 거칠어짐). 네 장 합 120KB — 레이어 합계 예산 750KB 를 넘지 않으면 `geometryRef`(도형 한 파일) 없이 면 GeoJSON 4개(계획 기본값). 확대 품질이 문제면 U5-4·U5-9 캡처에서 simplifyDeg 를 줄이고 `geometryRef` 를 판단.
  - **시험**: Python `test_country_class.py` Units 5(합성 쪽 — 주 셋 중 하나는 삽입 「쪽」: 주마다 제 지도에서 맞는 분류 · 지도 기록, 삽입 insets 를 안 주면 그 주는 지도 밖 + 「분류 없음」 경고, sameAs 복사·모르는 구역 오류, 면 feature 시계 방향·MultiPolygon·{key,name,cls}, units 없는 나라 길 그대로), Node `layers.test.mjs` 1(regionClassLayerJson — area feature 속성·범례 꾸밈 색·present·구역 없는 범례 멈춤), `georef.test.mjs` 1(fitFromStale — 같으면 null, 매개변수·닮음 변환·이동량·fitFrom 기록 다르면 까닭). **u3·u4 countryClass 다시**(`build_layers --unit u3 p30-urban p32-eu` · `--unit u4 p38-language p38-resources p39-afcfta`) → 레이어 파일 git 차이 0(바이트 같음). `npm test` Python 351 OK · Node 582(통과 582, 실패 0).
  - **회귀**(공유 스크립트 `country_class.py`·`build_layers.mjs`·`projection_from.mjs` — 도장 입력 아님, src 고침 없음): u2 낡음 없음 → check 해시 162개 중 도장만 다름 2, 캡처 41장 화소 차 0, 0/9/134/24, 조각 2,110,960 B(+0.957% — 그대로). u3·u4 는 다시 쓴 countryClass 레이어(바이트 같음) 시각 때문에 `[경고]` → embed → compare_shots → compare → check: u3 도장만 1, 31장 화소 차 0, 0/26/118/42, +0.002% · u4 도장만 1, 42장 화소 차 0, 0/34/104/41, +0.002% — 셋 다 회귀 없음.
- **U5-3c(2026-10-21) 지구본 보기 `registerProjection('globe')` + 경로 화살표 `pathFlow`** — 가지 atlas-u5(d663a19 위)
  - **공유 파일 등록 자리(u2 조각 +326 B — 모두 키·등록이 있을 때만 켜짐)**: `projections.js makeProjection` — 도법 정의에 `setup(p, w, h)` 이 있으면 회전·맞춤을 그것이(없으면 옛 메르카토르·fitExtent 그대로). `zoomer.js createZoomer` 옵션 `pan(dx, dy)` — 한 손가락·마우스 끌기 한 걸음을 먼저 받아 참이면 옮기지 않음(없으면 옛 끌기). `renderer.js` — ① zoomer `pan` = `PROJECTIONS[key].pan?.(dx, dy, k) && !rebase()`, ② 새 `map.rebase()`(같은 도법·중심 경도로 기준 투영을 다시 만들고 변환 그대로 움직이는 프레임 → 멈추면 다시 그림; 스냅숏·지명 따라 옮기기는 회전을 못 나타내 비움), ③ `project` 는 화면 투영의 `hidden(ll)` 이 참이면 null(지구본 뒷면 — 지명·기호·핀·화살촉이 앞면에 비치지 않게), ④ 경위선 간격 `(vp.step || graticuleStep)(k)`, ⑤ `setProjection` 은 두 끝 중 하나에 `hidden` 이 있으면 보간 없이(지구본 ↔ 평면), ⑥ viewchange 서명에 `baseId`(회전도 보기 바뀜 — 음영·고도 색 격자 나눠 쓰기 `relief.sameView` 도 baseId 로 견줌). `mapView.viewProjection`·`geoClip.viewRect`·`relief.invertGrid`·`ui.js`·`topic.js` 는 **고치지 않음**(지구본 `make()` 가 clipAngle 90 · hidden · step 을 붙인 정사라 viewProjection 이 `def.make().rotate(base.rotate())` 로 그대로 품음, viewRect 는 극 검사가 뒷면 극도 잡아 넓게 자를 뿐).
  - **`src/atlas/americasExtra.js`(u5 조각에만)**: `GLOBE {fill 0.9, maxLat 85, step 15}`, `globeProjection()`(label 「지구본」, 상태 `rot` = d3 rotate [λ, φ] — 화면 가운데 (−λ, −φ), `setup` = 반지름 짧은 변 × 0.45 · 무대 가운데, `pan` = `rotateBy`: Δλ = dx / R, Δφ = −dy / R(R = 반지름 × k), φ ±85°), `registerProjection(name, def)` = `PROJECTIONS[name] = def`(공유 코드 0 B — 지도 도구 「도법」에 6번째 단추 「지구본」이 저절로 생김, 평면 도법 5개로도 바꿀 수 있음 = Q6 기본값). `globeView(map, {rotate})` = 지구본으로 열고 처음 보기(확대 1, 원판 가운데 = 회전 가운데) → 되돌리는 함수(앞 도법 + 앞 화면 가운데·확대, 그사이 사용자가 다른 도법으로 바꿨으면 그대로 — centerLonOf 꼴). `globeTools(map, toolsEl)`(단원 main 이 mountAtlas 뒤에 `root.atlasUi.tools.el` 로 부름 — ui.js 를 고치지 않으려고): 지구본 ↔ 평면 전환 때 바탕 캔버스 260ms 페이드(Web Animations), 지구본이면 「중심 경도」 단추 숨김, 「세계 전체 보기」 단추·0 키 = 처음 회전·확대 1(도구 칸·무대 캡처 리스너가 먼저 받음), 도구로 평면 → 지구본 = 앞 화면 가운데를 원판 가운데로, 지구본 → 평면 = 앞 평면 보기(가운데·확대)로.
  - **주제 view 키 — 계획과 다르게 레이어 자료에**: 계획의 「주제 view 자료 `projection: 'globe', rotate`」를 topic.js 에 넣으면 u2 조각이 커지므로 **pathFlow 자료 `properties.view = {projection:'globe', rotate:[λ, φ]}`** 로 둠 — 레이어가 만들어질 때 globeView, 묶음을 떠나 레이어가 destroy 될 때 되돌림(키가 없으면 지금 보기). 주제가 레이어를 올린 뒤 묶음 범위로 맞추면(fitBounds) 원판이 비켜나므로 같은 작업 끝(마이크로태스크)에 처음 보기를 한 번 더(날아가기를 끊음) — 그래서 지구본 묶음에 boundsOf 를 줄 필요 없음. 46쪽 rotate = p46-migration fit 정사 중심(−30.3°, 9.2°) → `[30.3, -9.2]`(U5-4 레이어 설정에서).
  - **pathFlow 자료 꼴 — 계획의 `{type:'pathFlow', items, legend}` 대신 FeatureCollection**: `{type:'FeatureCollection', properties:{id, title, layerType:'pathFlow', view?, legend:[{cls, label, color, kind:'flow', dashed?}]}, features:[{properties:{id, cls, dashed?, width?(pt), label?}, geometry: LineString|MultiLineString(꼬리 → 화살 끝)}]}` — 공유 `legendItems` 가 FeatureCollection 의 `properties.legend` 를 kind 그대로 넘겨 **기존 흐름선 견본(색 선 + 화살촉, dashed 면 점선)이 범례를 그림**(계획 꼴이면 legendItems 가 kind 'fill'·cls d1… 로 바꿔 공유 코드를 고쳐야 했음). U5-4 시험 조각(`p46 지구본`)을 이 꼴로 고침. 그리기: geoPath(view.projection) MultiLineString(지구본 뒷면·날짜변경선·구드 틈은 투영이 자름), 화살촉 = `pathTip`(끝점이 안 보이면 없음, 앞 점 = 끝에서 1px 이상 떨어진 마지막 점) → `arrowHead`, 선 끝은 화살촉 길이 × 0.6 당김(`trimLineEnd` — 화면 거리 비로 경위도 보간), 굵기 `flowWidthPx`, 점선 = `stroke-dasharray` 3w 2w(흰 테두리도 같이), 맞히기 = 보이는 화면 조각과의 거리, `labelObstacles` [], CSS 는 기존 at-flow 클래스(공유 CSS 늘지 않음), destroy 는 뿌리 <g> 지움.
  - **시험** `tests/atlas/globe.test.mjs` 9(따로 된 프로세스 — 등록 전 모르는 도법·모르는 레이어 종류·도법 5개 → zoomer pan 자리(참이면 안 옮김·걸음 넘김, 거짓·없으면 옛 끌기) → 등록 뒤 반지름 360 = 800 × 0.45 · clipAngle 90 · 회전 [30, −20] 에서 (−30°, 20°) 가 원판 가운데 · 뒷면 hidden·geoPath null · step 15/10/5 · viewProjection 이 회전·hidden 품음 · 역투영 격자 원판 밖 NaN·건너뜀 → rotateBy(100px = 100/R 라디안 · 아래로 끌면 북쪽 · ±85°) → 가짜 DOM 렌더러: globeView 보간 없음 · 뒷면 project null · 원판 밖 invert null · 실제 끌기 100px → Δλ = 100/360 라디안 · 변환 그대로 · baseId 늘어남 · 되돌리기 = 앞 도법·중심 경도·k·가운데 · 사용자가 바꿨으면 안 되돌림 → globeTools(중심 경도 숨김 · 도구 평면 → 지구본 앞 가운데 · 세계 전체 보기·0 키 가로채기 = 처음 회전 · 지구본 → 평면 앞 가운데·k · 평면에서는 가로채지 않음) → pathFlow(범례 흐름선·점선 · 화살촉 끝·각 = 마지막 두 점 · 점선 키 · 장애물 0 · 맞히기 · destroy) → 지구본에서 끝이 뒷면이면 화살촉 없음·선은 원판 안 · trimLineEnd → 자료 view 로 열고 fitBounds 뒤에도 처음 보기 · removeLayer 로 되돌림). `npm test` Python 351 OK · Node 591(통과 591, 실패 0 — 582 + 9).
  - **확인 그림**(합성 틀 — u4 자료 + installAmericasExtras + globeTools + 합성 경로 5개(에스파냐·포르투갈·프랑스·노예 점선 2), 헤드리스 Chrome swiftshader 1280×800, 임시 틀은 지움): `$ATLAS_WORK/units/u5/u5-3c/` g0 평면 밀러 → g1 지구본(경로 view, 대서양 가운데 · 고도 색·음영이 원판 안만 · 중심 경도 단추 숨김) → g2 오른쪽 220px 끌기(가운데 경도 −30.3 → −65.3 = 220/360 라디안 · 유럽 쪽 꼬리가 가장자리에서 잘림) → g3 아래 160px(가운데 위도 9.2 → 34.7, 북극·그린란드가 앞면) → g4 휠 확대 1.63 → g5 「세계 전체 보기」 = 처음 회전·k 1 → g6 레이어 내림 = 평면 밀러로 되돌림(**g0 와 화소 차 0**) → g7 도구 「지구본」 = 앞 가운데(−40°, 15°)가 원판 가운데 → g8 도구 「밀러」 = 앞 보기(**g0 와 화소 차 0**). 콘솔 오류 0. `log.json` 에 장면마다 view.
  - **회귀**(src 고침 — 차례대로 embed → compare_shots → compare → check): u2 해시 162개 중 도장만 다름 2(coloring·basemap — 앞과 같음), 캡처 41장 화소 차 0(heritage 지명 수 100→101 참고), 0/9/134/24, 조각 **2,111,286 B(+0.973% — U5-3d 2,110,960 B 에서 +326 B, +1% 까지 남은 여유 570 B)** · u3 도장만 1, 31장 화소 차 0, 0/26/118/42, 조각 1,470,880 B(+0.024%, +324 B) · u4 도장만 1, 42장 화소 차 0, 0/34/104/41, 조각 1,594,037 B(+0.022%, +328 B) — 셋 다 회귀 없음. 세 조각 모두 약 +326 B = 위 공유 자리(americasExtra 지구본·pathFlow 는 털림).
  - **3d 리뷰 후속(따로 커밋 c91968c)**: `country_class.py unit_features` 에 clip_land.py 와 같은 shapely ≥ 2.1 assert, `test_country_class.py` Units 클래스를 `unittest.main()` 위로.
  - **남은 것·이어서 볼 것**: 지구본에서 방향키 이동·두 손가락·휠은 옛 옮기기·확대(원판이 무대에서 비켜날 수 있음 — 「세계 전체 보기」로 돌아옴), 지구본 확대 때 viewRect 가 뒷면 극 때문에 넓게 잘라 그리기가 무거울 수 있음(성능은 U5-11 실측). 46쪽 경로 자료 뽑기(교과서 곡선 0.5pt 간격 → fit 되돌림, 화살촉 도형 → 끝)는 build_layers 몫으로 U5-4 에서. u5 main.js(U5-9)는 `installAmericasExtras()` 를 mountAtlas 전에, `globeTools(root.atlasMap, root.atlasUi.tools.el)` 을 뒤에 부르고 destroy 때 풀기. 남은 U5-3 하위 기능(3e·3h 등)의 공유 자리 예산은 **570 B**.
