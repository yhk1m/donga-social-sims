# 사회과부도 통합 세계 지도 (모음 v5) — 설계

2026-11-02 · 교사 승인(대화) · 가지 `atlas-world`(app-main)

## 목적

사회과부도 모음(조각 `atlas-hub` · Pages `/atlas/`) 맨 위에 세계 지도를 두고, 대륙(단원 영역)을 누르면 그 단원이 열리게 한다. 아래 카드 6개는 그대로 둔다.

## 교사 결정

| 질문 | 답 |
|---|---|
| 자리 | 카드 위에 지도, 카드는 그대로 |
| 누르면 | 카드와 같은 동작 — 조각은 새 탭, `/atlas/` 는 그 자리 iframe + `#id`. 올리면(초점) 단원 영역 강조 + 단원 이름·쪽 + 아래 카드 강조 |
| 나누기 | 나라 단위. 러시아는 우랄(60°E 경도선)에서 둘(서 = Ⅲ 유럽, 동 = Ⅱ 아시아), 그린란드 = Ⅴ, 남극·북극해 = Ⅵ, 바다 = Ⅰ |
| 모양 | 로빈슨, 중심 150°E(교과서 8·9쪽 · u1 첫 화면과 같음), 고정 평면(확대·이동 없음) |

## 방식 — 빌드 때 미리 그린 SVG

1. **`scripts/atlas/hub_world.mjs`** (손으로 한 번, 결과 커밋): `world-atlas/countries-110m.json`(node_modules, ISO 숫자 id) → 나라마다 단원 붙임(표 `scripts/atlas/hub_world_units.json` — ISO 숫자 → u2~u6, 걸친 나라는 교과서 단원 구성대로: 튀르키예·키프로스·조지아·아르메니아·아제르바이잔·카자흐스탄 = Ⅱ, 이집트 = Ⅳ, 파나마 등 중앙아메리카·카리브 = Ⅴ, 파푸아뉴기니·뉴질랜드 = Ⅵ) → 러시아는 60°E 서·동을 d3-geo clipExtent 대신 다각형 교차로 자름 → 단원별로 `topojson-client.merge` → 로빈슨(`d3-geo-projection geoRobinson().rotate([-150,0])`) 고정 크기(폭 1000) 투영 → 소수 1자리 경로 문자열. 북극해 = 66.5°N 위 바다(구 둘레 안 다각형에서 육지 빼지 않음 — 육지 경로를 그 위에 그림). 출력 `src/atlas/hubWorld.json` `{ w, h, sphere, units: { u2: {d, label:[x,y]}, … u6 }, arctic: d }`. 단원표에 없는 나라가 하나라도 있으면 실패.
2. **`hubData.js` `worldTree(units, world, { newTab })`**: `cardTree` 와 같은 마디 트리 → 조각(`h()`)·정적 페이지(`html()`) 둘 다 그림. 구조: `svg.ah-world` > 바다 `a`(Ⅰ — 구 둘레 경로) > 북극해·단원 `a`(Ⅱ~Ⅵ, `data-unit=id`) > `path` + `text` 라벨(로마 숫자 + 이름). 공개 전 단원은 `a` 대신 `g.is-planned`(흐림, 누를 수 없음). 링크 주소·target 은 `cardTree` 와 같은 값.
3. **동작**: 조각 `main.js` 와 페이지 스크립트가 `pointerenter`/`focus` 로 `data-unit` 같은 카드에 `is-hot`, 지도 영역에 `is-hot`. 누르기는 `<a>` 기본 동작(페이지는 기존 카드 누르기 처리기를 지도 `a` 에도 붙임).
4. **모양**: 단원마다 연한 색 하나(색 견본은 구현 때 대비 확인), 바다 연한 파랑, 테두리 흰 0.6. 라벨은 글자만(이모지 금지). 지도 폭 = 머리말 폭(최대 1240), 휴대폰은 줄어들기만.

## 규칙

EMBED_RULES 그대로(h()·icon(), innerHTML·fetch·import() 금지, 선택자 `.ds-sim` 범위). 조각 예산 100KB(지금 14KB). 키보드: 단원 `a` 는 탭 순서(Ⅰ→Ⅵ), `aria-label` 「Ⅱ. 아시아 16~25쪽 열기」.

## 시험

- `hub_world.mjs`: 빠진 나라 0, 러시아 둘로 나뉨(두 조각 모두 존재), 단원 다섯 경로 비어 있지 않음, 출력 크기 ≤ 60KB.
- `worldTree`: 공개/준비 중 갈래, 링크 주소가 `cardTree` 와 같음, 라벨 6.
- `hub.test`: `/atlas/` 페이지 최신 확인 그대로 통과(지도 포함).
- 헤드리스: 조각 미리보기·`/atlas/` 에서 지도 그려짐, 올리면 카드 강조, 콘솔 0.

## 공개

u1 공개(main) 뒤 이 가지를 main 에 합쳐 `release atlas-hub`(v5) → `/atlas/` 페이지 다시 만듦.
