# 사회과부도 아틀라스 2단계 — G 일반화 + Ⅲ 유럽 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ① 아시아 전용으로 굳은 추출 파이프라인·조립 코드·대조표·테스트를 단원 번호(`--unit uN`)로 돌게 일반화하고, 아시아 조각 결과가 바뀌지 않았음을 증명한다(G). ② 그 위에서 사회과부도 Ⅲ 유럽(26~33쪽)을 조각 `atlas-u3-europe`으로 만들어 교사 대조표 승인 뒤 공개한다.

**Architecture:** 1단계와 같다. Python(PyMuPDF)으로 PDF 글자·도형·이미지를 뽑아 `C:\Users\Public\atlas-work\`에 두고 → Node 가 앱과 같은 d3 투영(`src/atlas/fitCore.js`)으로 경위도를 맞춰 GeoJSON·지명·내용 JSON 을 만들고 → 공유 엔진(`src/atlas/`)이 단원 조각을 그린다. 새로 생기는 것: 단원 고르기 한 곳(`scripts/atlas/unit.mjs`·`atlas_common.unit()`), 조립 공유(`src/atlas/mountAtlas.js`), 단원 표(`scripts/atlas/units.json`).

**Tech Stack:** 1단계와 같음 — Vite 6, d3-geo(+projection·polygon), csat-chart.js 저수준 API, PyMuPDF·numpy·shapely(≥2.1)·Pillow·rasterio, mapshaper(버전 고정), `node:test`, Python `unittest`.

**Spec:** `notes/specs/2026-10-20-atlas-phase2-design.md`(반드시 먼저 읽기), 1단계 설계 `notes/specs/2026-10-09-atlas-asia-design.md`, 1단계 계획의 「실행 중 결정」(`notes/plans/2026-10-09-atlas-asia.md` 784줄부터 — 모든 교사 결정이 이 단원의 기본값). 규칙: `EMBED_RULES.md`.

---

## 공통 사항 (모든 작업자 필독)

- 저장소 루트: `C:\Users\김용현\Desktop\동아출판 사회과 바이브코딩\app`(아래 경로는 모두 여기 기준). 가지 `atlas-phase2`(main 에서 만듦, 워크트리 없음). PDF: `..\22개정_중학_사회과 부도_교과서_본문.pdf`(인쇄 쪽 = PDF 쪽).
- **ASCII 작업 폴더** `C:\Users\Public\atlas-work\`(env `ATLAS_WORK`). 이 PC 는 한글 경로에 대량 출력하면 도구가 죽는다(0xC0000409). Node 에서 `cpSync`/`rmSync({recursive})` 금지 — 손 순회(`compare_shots.mjs rmTree` 꼴). 2단계 쪽 렌더는 `C:\Users\Public\atlas-work\phase2\pages\pNNN.png`(100dpi, 8~15·26~55·97~104쪽)에 있다.
- Python 은 항상 `python -I`, 한글 출력은 `sys.stdout.reconfigure(encoding='utf-8')`. 내려받은 원본은 `atlas-work/raw/<출처>/`(SOURCE.txt 에 주소·날짜·용량·해시).
- git: **`git add -A` 금지**(서브에이전트의 미완성 파일이 딸려 들어감). 자기 파일만 경로로 add. 커밋 메시지는 한국어, 끝에 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. author 는 저장소 로컬 설정(noreply).
- 전역 훅: Write 할 때 파일 머리에 `© 2026 김용현` 줄이 들어간다 — **지우지 않는다**. Bash 할 때 build-check 가 돈다.
- 헤드리스 Chrome: `--headless=new --disable-gpu --use-angle=swiftshader --enable-unsafe-swiftshader`, 매번 새 `--user-data-dir`, `--disk-cache-size=0`, 출력은 `C:/Users/Public/...` 슬래시 경로. (GPU 쓰는 헤드리스는 이 PC 에서 블루스크린 0x10E.)
- UI 문구는 한국어, 이모지 금지(`src/shared/dom.js icon()` 선 아이콘). 그래프는 csat-chart.js 저수준 렌더러만(`CsatChart` 클래스 import 금지 — 외부 글꼴 코드).
- 테스트: `npm test`(Python `python -I -m unittest discover -s scripts/atlas/tests -v` + Node `node --test "tests/**/*.test.mjs"`). 지금 기준: Python 184 · Node 350 통과.
- 조각 검사: `npm run embed -- <id>` → `embed/<id>.html`, `npm run check:embed`. 공개: `npm run release -- <id> --note "…"`.
- 리뷰 관문: 작업마다 끝나면 코드 리뷰(서브에이전트 `superpowers:requesting-code-review`) → 고침 → 커밋. **교사 관문**은 ⓣ로 표시한 곳(대조표 승인, 교사 질문 Q1~Q4 답) — 답이 오기 전에 그 결정을 전제로 한 코드를 공개하지 않는다.
- 단원 고르기(G1 뒤): 모든 파이프라인 명령은 `--unit u3`(또는 env `ATLAS_UNIT=u3`)를 받는다. 이 계획의 유럽 명령은 모두 `--unit u3`를 붙여 쓴다. 안 붙이면 u2(아시아)다.

## 파일 구조 (이 계획이 만들거나 바꾸는 것)

```
scripts/atlas/
  units.json              단원 표 {u2: {sim, title, pages, config}, u3: …}            (G1 새로)
  unit.mjs                resolveUnit(argv, env) — Node 단원 고르기 한 곳              (G1 새로)
  atlas_common.py         unit() — Python 단원 고르기(같은 규칙)                         (G1 고침)
  georef-cli.mjs          maps 경로를 단원 설정에서                                       (G2 고침)
  compare.mjs             --unit, 아시아 전용 분기 → 설정 compare.checks                 (G3 고침)
  compare_shots.mjs       --unit, 장면 = 주제·묶음 + 설정 compare.extraScenes            (G3 고침)
  regress_u2.mjs          기준선 저장(--baseline)·비교(--check)                          (G0 새로)
  config/u3.json          유럽 단원 설정                                                  (U3-1 새로)
  maps_u3.json            유럽 지도 목록                                                  (U3-1 새로)
src/atlas/
  mountAtlas.js           단원 조각 조립(지금 sims/atlas-u2-asia/main.js 본문)           (G4 새로)
  (U3-D 에서) layers.js·layerStyle.js·charts.js·chartCore.js·ui.js 에 유럽용 기능 더함
sims/atlas-u2-asia/main.js   자료 import + mountAtlas 호출로 줄임                       (G4 고침)
sims/atlas-u3-europe/        index.html · main.js · data/*(생성물)                      (U3-E1 새로)
content/atlas/u3/            topics.json · overrides.json · photos.json · coloring.json · issues.md
docs/assets/atlas/u3/        photo/ · page/
tests/atlas/unitContract.test.mjs   units.json 단원마다 생성물 계약 검사                  (G5 새로)
scripts/atlas/tests/test_unit.py    Python 단원 고르기 테스트                             (G1 새로)
tests/atlas/unit.test.mjs           Node 단원 고르기 테스트                               (G1 새로)
```

---

## G. 파이프라인 일반화 (아시아 결과는 그대로)

### Task G0: 회귀 기준선 `regress_u2.mjs --baseline`

**Files:** Create `scripts/atlas/regress_u2.mjs`; Output `$ATLAS_WORK/units/u2/baseline/`(저장소 밖)

- [ ] **Step 1:** `regress_u2.mjs`를 만든다. `--baseline`이면 다음 파일의 sha256 을 `$ATLAS_WORK/units/u2/baseline/hashes.json`에 쓴다(경로 → 해시, 정렬). 디렉터리는 손 순회(`readdirSync` + `statSync`), 재귀 fs 옵션 금지.
  - 저장소: `sims/atlas-u2-asia/data/**`, `content/atlas/u2/**`, `docs/assets/atlas/**`, `embed/atlas-u2-asia.html`
  - 작업 폴더: `vec/p1[6-9]-*.json`·`vec/p2[0-5]-*.json`, `geo/p1[6-9]*.fit.json`·`geo/p2[0-5]*.fit.json`, `text/places-*.json`, `text/p17-labels.json`, `tables/charts-u2.json`, `tables/climate-world.json`, `tables/index.json`
- [ ] **Step 2:** 대조표 기준선: `node scripts/atlas/compare_shots.mjs` → `shots/e2/*.png` 41장과 `manifest.json`을 `units/u2/baseline/shots/`로 복사(손 순회), `node scripts/atlas/compare.mjs` 결과 줄(같음·알려진 차이·참고·다름 수)을 `baseline/compare.json`으로.
- [ ] **Step 3:** `--check`: 같은 목록을 다시 해시해 다른 파일을 출력하고(종료 코드 1), PNG 는 화소 비교(Python Pillow `ImageChops.difference().getbbox()` — 다른 화소 수와 상자), 대조표 수 비교, 조각 크기 차(%)를 표로 낸다. 화소 비교는 `scripts/atlas/regress_png.py`(작은 도우미)로.
- [ ] **Step 4:** `node scripts/atlas/regress_u2.mjs --baseline` 실행 → `hashes.json` 항목 수와 41장을 출력해 확인. `--check`를 바로 돌려 「다른 파일 0, 화소 차 0」을 확인(도구 자체 검사).
- [ ] **Step 5:** 커밋(`scripts/atlas/regress_u2.mjs scripts/atlas/regress_png.py`).

### Task G1: 단원 고르기 한 곳 `units.json` · `unit.mjs` · `atlas_common.unit()`

**Files:** Create `scripts/atlas/units.json`, `scripts/atlas/unit.mjs`, `tests/atlas/unit.test.mjs`, `scripts/atlas/tests/test_unit.py`; Modify `scripts/atlas/atlas_common.py`

- [ ] **Step 1:** `units.json`
```json
{
  "_doc": "단원 표: 파이프라인이 --unit uN(또는 env ATLAS_UNIT)으로 고르는 단원. config 는 scripts/atlas 기준. 2단계 설계 §4.2.",
  "u2": { "sim": "atlas-u2-asia", "title": "Ⅱ. 아시아", "pages": [16, 25], "config": "config/u2.json" },
  "u3": { "sim": "atlas-u3-europe", "title": "Ⅲ. 유럽", "pages": [26, 33], "config": "config/u3.json" }
}
```
- [ ] **Step 2: 실패하는 테스트 (Node)**
```js
// tests/atlas/unit.test.mjs
import test from 'node:test'; import assert from 'node:assert/strict';
import { resolveUnit } from '../../scripts/atlas/unit.mjs';
test('기본은 u2 — 지금 명령이 그대로', () => {
  const u = resolveUnit([], {});
  assert.equal(u.id, 'u2'); assert.equal(u.sim, 'atlas-u2-asia');
  assert.match(u.configPath.replace(/\\/g, '/'), /scripts\/atlas\/config\/u2\.json$/);
  assert.match(u.mapsPath.replace(/\\/g, '/'), /scripts\/atlas\/maps_u2\.json$/);
  assert.equal(u.dataDir.replace(/\\/g, '/').split('/').slice(-3).join('/'), 'sims/atlas-u2-asia/data');
});
test('--unit 이 env 보다 앞섬, ATLAS_UNIT_CONFIG(옛 방식)도 받음', () => {
  assert.equal(resolveUnit(['--unit', 'u3'], { ATLAS_UNIT: 'u2' }).id, 'u3');
  assert.equal(resolveUnit([], { ATLAS_UNIT: 'u3' }).id, 'u3');
  assert.equal(resolveUnit([], { ATLAS_UNIT_CONFIG: 'scripts/atlas/config/u2.json' }).id, 'u2');
});
test('모르는 단원은 오류', () => assert.throws(() => resolveUnit(['--unit', 'u9'], {}), /u9/));
test('단원 작업 폴더: u2 는 옛 경로 그대로(설정에 없으면), 새 단원은 units/uN', () => {
  const w = (id) => resolveUnit(['--unit', id], { ATLAS_WORK: 'C:/W' }).workFile('text/topics-check.json').replace(/\\/g, '/');
  assert.equal(w('u2'), 'C:/W/text/topics-check.json');
  assert.equal(w('u3'), 'C:/W/units/u3/text/topics-check.json');
});
```
  `u3` 테스트는 `config/u3.json`이 아직 없어도 돌아야 하므로 `resolveUnit`은 설정 파일을 늦게(`unit.config` getter) 읽는다.
- [ ] **Step 3: 실패하는 테스트 (Python)** — `scripts/atlas/tests/test_unit.py`: `atlas_common.unit()`이 env 없으면 u2, `ATLAS_UNIT=u3`이면 u3(서브프로세스로 env 바꿔 실행), `UNIT_CONFIG` 값이 지금과 같은 경로(`config/u2.json`)인지.
- [ ] **Step 4:** `npm test`로 실패 확인.
- [ ] **Step 5: 구현** — `unit.mjs`: `resolveUnit(argv = process.argv.slice(2), env = process.env)` → `{id, sim, title, pages, configPath, config(getter), mapsPath(설정 maps 기준, 없으면 maps_<id>.json), dataDir(설정 out 또는 sims/<sim>/data), contentDir(content/atlas/<id>), assetDir(docs/assets/atlas/<id>), work, workFile(rel)}`. `workFile`은 u2 면 `WORK/rel`, 그 밖은 `WORK/units/<id>/rel`(설정 `unitWork`가 있으면 그것). `atlas_common.py`: 맨 위 `UNIT_CONFIG` 결정을 `unit()`으로 바꾸되 **u2 일 때 값은 바이트까지 같은 문자열**(`os.path.join(HERE, 'config', 'u2.json')`). `ATLAS_UNIT_CONFIG`가 있으면 그것이 이긴다(옛 방식).
- [ ] **Step 6:** 기존 Node 스크립트 6개(`build_basemap`·`build_content`·`build_layers`·`build_places`·`city_controls`·`coloring_quiz`)의 `const CONFIG = process.env.ATLAS_UNIT_CONFIG || path.join(…, 'u2.json')`를 `resolveUnit().configPath`로 바꾼다. 명령줄 해석은 각 스크립트의 기존 옵션과 부딪치지 않게 `--unit <id>` 두 칸만 먼저 빼낸다(`unit.mjs stripUnitArgs`).
- [ ] **Step 7:** `npm test` 통과(Python 184+, Node 350+). 커밋(`scripts/atlas/units.json scripts/atlas/unit.mjs scripts/atlas/atlas_common.py scripts/atlas/build_basemap.mjs scripts/atlas/build_content.mjs scripts/atlas/build_layers.mjs scripts/atlas/build_places.mjs scripts/atlas/city_controls.mjs scripts/atlas/coloring_quiz.mjs tests/atlas/unit.test.mjs scripts/atlas/tests/test_unit.py`).

### Task G2: 박힌 경로 없애기 + 도법 후보 고정

**Files:** Modify `scripts/atlas/georef-cli.mjs`, `scripts/atlas/build_places.mjs`, `scripts/atlas/build_content.mjs`, `scripts/atlas/extract_text.py`, `scripts/atlas/extract_tables.py`, `scripts/atlas/city_controls.mjs`, `scripts/atlas/georef.mjs`; Test `tests/atlas/georef.test.mjs`

- [ ] **Step 1:** `georef-cli.mjs`: `maps_u2.json` 직접 읽기 → `resolveUnit().mapsPath`. 낡은 산출물 검사(`controls.json`이 maps·extract_vectors.py 보다 오래됨)도 같은 경로. 다시 뽑기 호출(`python -I extract_vectors.py --controls all`)에 env `ATLAS_UNIT` 전달.
- [ ] **Step 2:** 단원 작업 파일: `text/topics-check.json`(extract_text·build_content), `geo/city-holdout.json`(city_controls·places 테스트) → `unit.workFile(...)`/Python `unit_work(...)`. u2 는 옛 경로 그대로(G1 규칙)라 u2 산출물은 바뀌지 않는다. 설정 `content.stamps`의 `@work/…` 표기는 u2 설정 그대로 두고, 새 단원 설정은 `@unit/…`(= 단원 작업 폴더) 표기를 쓴다 — `atlas_common`·`geo_util`의 `@work` 풀이 옆에 `@unit`을 더한다.
- [ ] **Step 3:** `build_content.mjs`가 만드는 `layers.js` 머리 주석의 `sims/atlas-u2-asia` 글자를 `unit.dataDir` 상대 경로로 만든다(u2 결과 글자가 같아야 함 — 비교).
- [ ] **Step 4: 도법 후보 고정 (실패하는 테스트 먼저)**
```js
// tests/atlas/georef.test.mjs 에 더함
import { FAMILY_NAMES, familiesFor } from '../../scripts/atlas/georef.mjs';
test('u2 지도의 도법 후보는 1단계 8개 그대로(후보를 더해도 아시아 fit 이 바뀌지 않게)', () => {
  const OLD = ['azimuthalEqualArea', 'azimuthalEquidistant', 'conicEqualArea', 'conicConformal', 'miller', 'robinson', 'equirectangular', 'mercator'];
  assert.deepEqual(familiesFor({ id: 'p16-asia' }, { georef: {} }), OLD);
  assert.deepEqual(familiesFor({ id: 'x', families: ['miller'] }, { georef: { families: OLD } }), ['miller']);
});
```
  구현: `familiesFor(mapEntry, unitConfig)` = 지도 항목 `families` → 단원 설정 `georef.families` → 1단계 8개(상수 `PHASE1_FAMILIES`). `georef-cli --all`이 `fitWithTps(cps, { families: familiesFor(m, cfg) })`로 부른다. (새 후보 `stereographic`·`orthographic`은 Ⅴ 단원에서 `fitCore.FAMILIES`에 더한다 — 이 작업에서는 더하지 않는다.)
- [ ] **Step 5:** `npm test` 통과. `node scripts/atlas/georef-cli.mjs --all` 다시 돌려 `geo/*.fit.json`이 G0 기준선과 바이트까지 같은지 `regress_u2.mjs --check`(fit 항목만 봐도 됨)로 확인.
- [ ] **Step 6:** 커밋(바꾼 파일만).

### Task G3: 대조표 일반화 `compare_shots.mjs` · `compare.mjs`

**Files:** Modify `scripts/atlas/compare_shots.mjs`, `scripts/atlas/compare.mjs`, `scripts/atlas/config/u2.json`은 **바꾸지 않음** → 아시아 전용 값은 새 파일 `scripts/atlas/config/u2.compare.json`

- [ ] **Step 1:** `compare_shots.mjs --unit uN`: topics 경로 = `unit.dataDir/topics.json`, 개발 주소 = `/sims/<sim>/?topic=&proj=`, 출력 = `unit.workFile('shots/compare')`(u2 는 옛 `shots/e2` — 기준선과 같은 자리). 장면 = 주제마다 기본 도법 1장 + 묶음마다 1장 + `compare.extraScenes`(아시아의 싱가포르 확대 창·100% 막대·세계 인구·색칠하기 활동·세계유산 퀴즈·고도 색 켬/끔·지형 바탕 3종·핀 숨김 3장 → `u2.compare.json`으로 옮김). 장면 정의 꼴: `{name, topic, group?, proj?, actions:[{call:'showGroup', args:[i]} | {click:'<선택자>'} | {eval:'<root.atlas… 식>'}]}` — 지금 코드의 장면 함수를 이 자료로 옮긴다. `eval`은 이 캡처 스크립트(개발 도구) 안에서만, CDP `Runtime.evaluate`로.
- [ ] **Step 2:** `compare.mjs --unit uN`: 입력 경로를 `resolveUnit`에서. 아시아 전용 분기(`p17-labels`, `layer-p22-singapore` 확대 창 기호, `layer-p23-density-cities` 화면 기호 없음, `layer-p24-trade` 도법·중심, `MAIN_MAP`)를 설정 `compare.checks`(`coloringLabels`·`insetLayers`·`noScreenSymbols`·`centerChecks`·`mainMap`)로 바꾸고 아시아 값은 `u2.compare.json`. 출력 `unit.workFile('compare.html')`(u2 는 옛 `compare-u2.html`).
- [ ] **Step 3:** `regress_u2.mjs --check`의 대조표 부분: 장면 41장 이름·화소 같음, 대조표 수(다름 0 · 알려진 차이 9 · 같음 134 · 참고 24) 같음.
- [ ] **Step 4:** 커밋(`scripts/atlas/compare_shots.mjs scripts/atlas/compare.mjs scripts/atlas/config/u2.compare.json`).

### Task G4: 조립 공유 `src/atlas/mountAtlas.js`

**Files:** Create `src/atlas/mountAtlas.js`, `tests/atlas/mountAtlas.test.mjs`; Modify `sims/atlas-u2-asia/main.js`

- [ ] **Step 1: 실패하는 테스트** — 가짜 DOM(`tests/atlas/helpers/fakeDom.mjs`)·CSS 훅으로 `mountAtlas(root, {simId:'atlas-u2-asia', basemap, places, topics, charts, layers, …아시아 선택값})`를 불러 ① `root.atlasShowTopic`이 8개 주제를 모두 오류 없이 펼치고 ② `destroy()` 뒤 rAF·구독 0, ③ 선택값 없이(`insets`·`boundsOf`·`locators` 빠짐)도 동작하는지 본다.
- [ ] **Step 2: 구현** — 지금 `sims/atlas-u2-asia/main.js`의 `mount` 본문을 그대로 옮긴다(createShell → createMap → attachRelief·attachTint → mapTools → lazyNatural → legendPanel·tooltip·pageViewer·topicNav·주제 칸·creditBlock → show → 개발 매개변수 → `root.atlas*` → destroy). 아시아 상수는 인자로: `{ insets = {}, boundsOf = {}, centerLonOf = {}, baseColor = {}, locators = {}, unitBoxes = basemap.meta.unitBoxes }`.
- [ ] **Step 3:** `sims/atlas-u2-asia/main.js` = 정적 import(자료 7개) + 아시아 상수 + `export default (root) => mountAtlas(root, {...})`. 머리 주석은 유지·갱신.
- [ ] **Step 4:** `npm run embed -- atlas-u2-asia` → 크기가 기준선 ±1% 안, `check:embed` 통과. `npm test` 통과.
- [ ] **Step 5:** 커밋(`src/atlas/mountAtlas.js sims/atlas-u2-asia/main.js tests/atlas/mountAtlas.test.mjs`).

### Task G5: 단원 공통 계약 테스트 + 회귀 증명

**Files:** Create `tests/atlas/unitContract.test.mjs`

- [ ] **Step 1:** `unitContract.test.mjs`: `units.json`의 단원 중 `sims/<sim>/data/topics.json`이 있는 것마다 — 주제 쪽이 `pages` 범위를 모두 덮음, 레이어 ref → `data/<ref>.json` 존재, 사진 → `docs/assets/atlas/<id>/photo/<id>.jpg|webp` 존재, 그래프 ref → charts.json, 빈 글(마커·블록) 없음(설정 `schema.markerTextOptionalWith` 예외), 설정 `content.expect`의 수(핀·그래프·사진), 조각 크기(`embed/<sim>.html` 있으면 ≤ 3MB). 단원 고유 기대값은 설정에서만 읽는다.
- [ ] **Step 2:** u2 로 통과 확인(지금 u2 테스트와 겹치는 검사는 그대로 둠 — 회귀 보호).
- [ ] **Step 3: 회귀 증명** — u2 파이프라인을 처음부터 다시 돈다(아래 순서, 모두 `--unit` 없이 = u2): `python -I scripts/atlas/extract_vectors.py --controls all` → `node scripts/atlas/georef-cli.mjs --all` → `python -I scripts/atlas/extract_vectors.py --features all` → `node scripts/atlas/build_layers.mjs` → `python -I scripts/atlas/places.py` → `node scripts/atlas/build_places.mjs` → `python -I scripts/atlas/extract_images.py` → `python -I scripts/atlas/extract_tables.py` → `python -I scripts/atlas/extract_text.py --labels --check` → `node scripts/atlas/coloring_quiz.mjs --write` → `node scripts/atlas/build_basemap.mjs` → `node scripts/atlas/build_content.mjs` → `npm run embed -- atlas-u2-asia` → `node scripts/atlas/compare_shots.mjs` → `node scripts/atlas/compare.mjs` → `node scripts/atlas/regress_u2.mjs --check`.
  - 통과 조건: 저장소·작업 폴더 산출물 해시 **모두 같음**(embed 제외), 캡처 41장 화소 차 0, 대조표 수 같음, 조각 크기 ±1%, `npm test` 통과.
  - 다른 파일이 있으면 그 차이를 이 계획 「실행 중 결정」에 까닭과 함께 적고(정당한 차이만 허용 — 예: 머리 주석 글자), 고칠 수 있으면 고친다.
- [ ] **Step 4:** 커밋(`tests/atlas/unitContract.test.mjs`). 이 시점에 G 완료 — **리뷰 관문**: 전체 diff 코드 리뷰(서브에이전트) + 회귀 표를 「실행 중 결정」에 붙임.

---

## U3. Ⅲ 유럽 (26~33쪽) — 조각 `atlas-u3-europe`

유럽 주제 8개(사이드바 목차): 일반도(26) · 색칠하기(27) · 지형(28) · 기후(29) · 도시의 기능(30) · 지속가능한 도시(31) · 통합과 분리(32) · 특집: 주민 생활(33). 내용 목록은 설계 §5.1.

### Task U3-1: 단원 설정 뼈대와 지도 목록 `config/u3.json` · `maps_u3.json` (1단계 A3)

**Files:** Create `scripts/atlas/config/u3.json`, `scripts/atlas/maps_u3.json`; Modify `scripts/atlas/units.json`(u3 이미 있음 — 확인만)

- [ ] **Step 1:** `config/u3.json`을 u2 설정의 **키 구조만** 복사해 만든다(값은 비우거나 유럽 값): `maps: "../maps_u3.json"`, `out: "sims/atlas-u3-europe/data"`, `photos.outJson: content/atlas/u3/photos.json`, `photos.assetDir: docs/assets/atlas/u3`, `photos.assetPrefix: "u3/"`, `charts.out: @unit/tables/charts-u3.json`, `content.*` 경로 u3, `content.stamps` 경로 `@unit/…`. `tint`·`natural` 절은 **넣지 않는다**(공용 화상은 u2 설정으로 만듦). `basemap.unitBoxes`: 유럽 일반도 범위 + 여유 `[[-32, 27, 70, 82]]`(26쪽 틀을 fit 으로 되돌린 범위를 U3-2 뒤 다시 맞춤). `georef.families`: 1단계 8개.
- [ ] **Step 2:** `python -I scripts/atlas/find_maps.py 26 33`으로 후보 bbox 를 보고, 쪽 렌더(`atlas-work/phase2/pages/p026.png`~`p033.png`)를 보며 `maps_u3.json`을 쓴다. id 는 `p<쪽>-<이름>`, kind 는 1단계 목록 + 유럽용 `urban|green-capital|ev-chargers|eu|separatism|belgium|italy|locator`.
  - 지도 15개: `p26-europe`(general, 경위선 눈금), `p27-coloring`(coloring), `p28-relief`(relief), `p29-climate`(climate, 눈금), `p29-climate-iceland`(climate 삽입 — 자체 경위선 20°W), `p29-jan`, `p29-jul`(temp-precip), `p30-urban`(urban), `p31-green-capital`, `p31-lisbon`(ev-chargers, 손 기준점), `p32-eu`, `p32-separatism`, `p32-belgium`(손 기준점 — 벨기에 국경 꺾인 점), `p32-italy`(손 기준점), `p33-locator`(locator, 손 기준점).
  - 지도로 넣지 않는 것: 30쪽 소피아 앙티폴리스 위치도(프랑스 작은 그림)·베네치아 위성 사진 → 사진 카드. 32쪽 지도 위 「활동하기」 말풍선은 활동 블록.
- [ ] **Step 3: 개수 대조** — `python -I -c "import json;print(len(json.load(open('scripts/atlas/maps_u3.json',encoding='utf-8'))))"`가 Step 2 목록 수와 같아야 한다. 설계 §5.1 표와 다르면 표를 고친다.
- [ ] **Step 4:** 테스트 `scripts/atlas/tests/test_maps_u3.py`(test_maps_u2.py 꼴): id 유일·쪽 26~33·bbox 가 쪽 안·kind 가 정해진 목록·`georef:false` 아닌 지도는 `graticuleLabels` 또는 `controls` ≥ 4.
- [ ] **Step 5:** 커밋(`scripts/atlas/config/u3.json scripts/atlas/maps_u3.json scripts/atlas/tests/test_maps_u3.py`).

### Task U3-2: 기준점과 경위도 맞추기 (1단계 B1·B2)

**Files:** Modify `scripts/atlas/maps_u3.json`(손 기준점·city controls), `scripts/atlas/config/u3.json`(`cityControls`); Test `scripts/atlas/tests/test_controls.py`에 u3 경우 더함

- [ ] **Step 1:** `python -I scripts/atlas/extract_vectors.py --unit u3 --controls all`. 경위선 눈금이 있는 지도(26쪽 24개, 29쪽 13개)는 교차점, 나머지는 손 기준점(해안 특징점·섬 중심·반도 끝, 지도마다 ≥ 6, 넓게 흩어지게). 경위도 기호 `°`·`˚` 둘 다(1단계 결정).
- [ ] **Step 2:** 일반도 26쪽은 도시 기호 기준점(`city_controls.mjs --unit u3 --write`, 설정 `cityControls` = u2 값 복사 + `neBox` 유럽 `[-32, 27, 70, 82]`)으로 가장자리 보강.
- [ ] **Step 3:** `node scripts/atlas/georef-cli.mjs --unit u3 --all` → 표(`id family rmsPt rmsMm`). 기대: 26·27쪽 `conicConformal`(지면 「람베르트 정각 원뿔」), 그 밖 주제도는 가장 잘 맞는 것. 1단계 기준 **평균 잔차 ≤ 0.5mm**. 넘으면 기준점 보강 → 그래도 넘으면 `approx: true`.
- [ ] **Step 4:** `node scripts/atlas/georef-cli.mjs --unit u3 --verify all` → `atlas-work/geo/<id>.verify.png`(Natural Earth 50m 해안선 겹침)을 눈으로 확인. 모식도에 가까운 지도(벨기에·리스본 작은 지도·33쪽 위치도)는 `approx` 여부를 결정하고 「실행 중 결정」에 기록.
- [ ] **Step 5:** 테스트 — `test_controls.py`에 `p26-europe` 기준점 ≥ 12·모두 경위도 범위 안, Node `tests/atlas/georef.test.mjs`에 u3 fit 파일이 있으면 rmsMm ≤ 0.5(approx 제외) 검사.
- [ ] **Step 6:** `unitBoxes`를 26쪽 틀 범위로 맞추고 커밋.

### Task U3-3: 엔진·파이프라인 유럽 기능 (설계 §6 — 유럽에서 처음 쓰는 것)

**Files:** Modify `scripts/atlas/features.py`·`zones.py`·`legend.py`·`symbols.py`(필요한 곳), `scripts/atlas/build_layers.mjs`, `src/atlas/layers.js`, `src/atlas/layerStyle.js`, `src/atlas/ui.js`(범례 견본), `src/atlas/chartCore.js`, `src/atlas/charts.js`; Create `scripts/atlas/country_class.py`; Test `tests/atlas/layerStyle.test.mjs`·`layers.test.mjs`·`chartCore.test.mjs`·`scripts/atlas/tests/test_country_class.py`

각 하위 기능은 실패하는 테스트 → 구현 → 통과 → 커밋으로 따로 한다.

- [ ] **3a 나라 단위 단계구분도 `countryClass`** (설계 §6.2-8): `country_class.py <layer>` — 바탕 지도 50m 나라(`basemap.json`과 같은 Natural Earth 원본·같은 iso)마다 안쪽 표본점 9개(`representative_point` + 나라 상자 3×3 격자 중 나라 안)를 fit 정변환으로 지면에 찍고, 그 자리 채움 도형 색(벡터 `features.json` 면 — 점 포함 판정, 위에 그린 것 우선)을 범례색(Lab ΔE, `defaults.matchDE`)과 대조해 다수결. 표본이 지도 틀 밖이면 그 나라 없음. 출력 `layer-<id>.json` = `{type:'countryClass', legend:[…], classes:{iso: cls}, overrides:[…]}`. 설정 `countryOverrides`{iso: {cls, why}}.
  - 테스트(Python): 합성 쪽(사각형 두 나라 + 범례)에서 분류가 맞는지, 표본 반이 갈리면 경고, overrides 적용.
  - 앱: `layerFromRef`가 `countryClass`면 `areaLayer`에 바탕 지도 나라 도형(지금 상세도 — 50m/10a, 렌더러 `countryFeatures` 재사용)을 넘겨 칠함. 범례 고름·윤곽·hit·말풍선(나라 이름 + 분류)은 면 레이어 그대로. 테스트(Node): 분류 없는 나라는 안 칠함, 상세도가 바뀌어도 같은 iso 색.
- [ ] **3b 윤곽만 분류** (`style:'outline'`): 범례 항목 `style`(설정 `legendStyles`{범례 이름: 'outline'}) → areaLayer 가 그 분류는 채우지 않고 테두리(교과서 색, 1.6px)만. 32쪽 유로 사용국. 테스트: 그리기 순서(채움 분류 다음 윤곽), 범례 견본이 테두리 상자, 고르면 윤곽 굵게(2.4px).
- [ ] **3c 크기 단계 기호 + 겹친 원 범례**: 기호 레이어 `sizeBy:'class'`(설정 `symbolSizes`{범례 이름: pt}) — 30쪽 도시 인구 5단계(1,000만 이상 ~ 30~50만). 범례 견본 `legendStyle:'nested-circles'`(큰 원부터 아래를 맞춰 겹침, 값 글자 오른쪽). 테스트: 견본 원 반지름 순서, 확대 단계별 지름(`symbolPx`) 비율 유지.
- [ ] **3d 값 붙은 기호**: 31쪽 리스본 작은 지도(도시 9곳 × 「1km²당 충전소 / 인구 100명당 충전소」 두 수) — 기호 properties `values:[{icon, text}]`, 지명 배치기(`labelObstacles`·우선순위)로 기호 옆 상자 글자. 테스트: 값 상자가 기호와 안 겹침, 범례 = 아이콘 두 개와 설명.
- [ ] **3e 여러 지도 한 레이어**: 레이어 설정 `maps:[본 지도, 삽입]`(29쪽 기후 구분 + 아이슬란드 삽입) — 각자 fit 으로 되돌려 합치고 겹치면 삽입 우선, 출처 `src` 속성에 지도 id. 테스트(Python/Node): 합친 GeoJSON 의 아이슬란드(−25~−13°E, 63~67°N) 면 분류가 삽입 것.
- [ ] **3f 그래프 형식**: `chartPlan`에 `groupedBar`(31쪽 탈린 2계열·코펜하겐 3계열) — 먼저 `node_modules/csat-chart.js`의 `renderAbsBarGraph` 다계열 지원을 코드로 확인해 되면 csat, 안 되면 시험지 양식 SVG(검은 선 #231f20·점선 격자·명조 대체 글꼴 목록). `bar`에 막대별 색(`colors`, 30쪽 런던·로테르담 강조)과 축 생략 물결(`axisBreak:[0, 680]`). 테스트(`chartCore.test.mjs`): 묶음 막대 자료 변환(계열 순서·색·범례), 강조 색이 그 막대에만, 축 생략 값 → 화면 높이 변환.
- [ ] 각 하위 기능마다 커밋. 끝나면 **리뷰 관문**(엔진 바뀐 것 코드 리뷰) + 아시아 회귀: `regress_u2.mjs --check`(엔진만 바뀌었으므로 data 해시 같음, 캡처 41장 화소 차 0이어야 함 — 다르면 까닭 기록).

### Task U3-4: 주제 레이어 (1단계 C1)

**Files:** Modify `scripts/atlas/config/u3.json`(`layers`), Output `sims/atlas-u3-europe/data/layer-*.json`; Test `tests/atlas/units/u3.layers.test.mjs`

- [ ] **Step 1:** `python -I scripts/atlas/extract_vectors.py --unit u3 --features all` → `vec/<id>.features.json`. 레이어 설정(u2 꼴: map·mode·tol·minArea·expectLegend·색 대응):
  - `p29-climate`(+`p29-climate-iceland`, 3e): 래스터면 1단계 21쪽처럼 화소 Lab 분류(`mode:'raster'`), `legendGroups`(건조 2·온대 4·냉대 2·한대 2 — 지면 범례 묶음 그대로), 기대 범례 수 = 지면 범례 수.
  - `p29-jan`·`p29-jul`: 강수 5단계 면(래스터) + 등온선(`type:'isotherm'`, 값 붙은 선).
  - `p30-urban`: 도시화율 5단계 `countryClass`(3a) + 도시 인구 5단계 기호(3c) + 사례 도시 6곳 이름 기호. 러시아처럼 지도 틀에 일부만 든 나라는 표본 규칙으로 처리되는지 확인.
  - `p31-green-capital`: 도시 점 15 + 연도 글자(`label` = 「스톡홀름(2010)」 지면 그대로).
  - `p31-lisbon`: 값 붙은 기호 9(3d).
  - `p32-eu`: `countryClass` 4분류 중 「유로 사용 국가」는 `style:'outline'`(3b) — 유로 사용국은 가입국 채움 + 노란 윤곽이 겹침(두 분류를 함께 가짐 → `classes:{iso: ['가입', '유로']}` 다중 분류 허용, 테스트로 고정).
  - `p32-separatism`: 한 분류 면(지역 도형, 교과서 채움 되돌림) + 지역 이름 15.
  - `p32-belgium`(3분류)·`p32-italy`(5분류 + 「파다니아 지역」 글자): 하위 행정 구역 — 교과서 채움 도형 되돌림(바탕 지도에 admin-1 없음).
  - `p33-locator`: 레이어 없음(핀만, U3-6).
- [ ] **Step 2:** `node scripts/atlas/build_layers.mjs --unit u3` → `layer-*.json`. 용량 예산: 레이어 합계 ≤ 650KB(아시아 상한과 같음), `countryClass`는 수 KB.
- [ ] **Step 3: 실패하는 테스트 → 통과** (`tests/atlas/units/u3.layers.test.mjs`)
```js
import test from 'node:test'; import assert from 'node:assert/strict'; import { readFileSync } from 'node:fs';
const D = 'sims/atlas-u3-europe/data';
const read = (id) => JSON.parse(readFileSync(`${D}/layer-${id}.json`, 'utf8'));
test('p29 기후 구분: 범례 분류마다 도형, 경위도가 유럽', () => {
  const gj = read('p29-climate'); const cls = new Set(gj.features.map((f) => f.properties.cls));
  assert.ok(cls.size >= 10, `분류 ${cls.size}`);
  for (const f of gj.features) { const [lon, lat] = f.properties.centroid; assert.ok(lon > -30 && lon < 70 && lat > 30 && lat < 82, f.properties.cls); }
});
test('p32 EU: 영국 = 탈퇴, 튀르키예 = 가입 희망, 독일 = 가입 + 유로', () => {
  const L = read('p32-eu'); const c = (iso) => [].concat(L.classes[iso]);
  assert.ok(c('GBR').some((x) => /탈퇴/.test(x))); assert.ok(c('TUR').some((x) => /희망/.test(x)));
  assert.ok(c('DEU').some((x) => /가입 국가/.test(x)) && c('DEU').some((x) => /유로/.test(x)));
});
test('p30 도시화율: 나라 분류 수 ≥ 35, 도시 인구 기호 5단계 모두 있음', () => {
  const L = read('p30-urban');
  assert.ok(Object.keys(L.classes).length >= 35);
  assert.equal(new Set(L.symbols.features.map((f) => f.properties.cls)).size, 5);
});
```
  (나라 이름·분류 이름은 범례 글자 그대로 — 테스트의 정규식은 지면 글자를 보고 맞춘다.)
- [ ] **Step 4:** 지도마다 범례 분류 수 = 교과서 범례 수 출력, 화면용 색 보정이 필요한 분류(웹 육지 #f2efe9 위에서 묻히는 옅은 색)는 `legendColors` + `printColor`(1단계 토속 종교 결정)로 — 결정은 「실행 중 결정」에.
- [ ] **Step 5:** 커밋.

### Task U3-5: 지명 (1단계 C2)

**Files:** Modify `scripts/atlas/config/u3.json`(`places`); Output `sims/atlas-u3-europe/data/places.json`; Test `tests/atlas/units/u3.places.test.mjs`

- [ ] **Step 1:** 26쪽 렌더를 보며 `places.styles` 표를 만든다(u2 표 복사 → 수정): 나라 = 굵은 고딕 자홍 + **영문 대문자(Helvetica)** `en`, 수도 = 붉은 사각 + 영문 병기(검정 Helvetica 작은 글자) `en`, 바다·하천 = 파란 명조, 산맥·평원 = 상자 글자(자간 벌림), 세계유산 = 붉은 글자(지명 아님 → `exclude`), 대양 영문(ATLANTIC OCEAN — Times) `en`.
- [ ] **Step 2:** `python -I scripts/atlas/places.py --unit u3` → `node scripts/atlas/build_places.mjs --unit u3 --verify`. 찾아보기(105~111쪽) 중 26쪽 참조 지명이 모두 places 에 있는지(누락 0 목표, 뺀 것은 `indexExclude`에 까닭).
- [ ] **Step 3:** Natural Earth 인구 지점 대조(설정 `neBox` 유럽) — 옮겨 그린 기호 바로잡기(`snapKm` 30)와 결과(중앙값·90%·최대 km)를 「실행 중 결정」에.
- [ ] **Step 4: 테스트**
```js
const places = JSON.parse(readFileSync('sims/atlas-u3-europe/data/places.json', 'utf8'));
const near = (p, lon, lat, tol) => Math.abs(p.lon - lon) < tol && Math.abs(p.lat - lat) < tol;
test('대표 지명 위치가 실제와 1° 안', () => {
  const want = { 파리: [2.35, 48.86], 런던: [-0.13, 51.51], 베를린: [13.4, 52.52], 로마: [12.5, 41.9], 모스크바: [37.6, 55.75], 마드리드: [-3.7, 40.42] };
  for (const [name, [lon, lat]] of Object.entries(want)) { const p = places.find((x) => x.name === name); assert.ok(p, name); assert.ok(near(p, lon, lat, 1), `${name} ${p.lon},${p.lat}`); }
});
test('나라·수도에 영문 병기(en)가 있음', () => {
  for (const n of ['프랑스', '독일', '파리']) assert.ok(places.find((p) => p.name === n)?.en, n);
});
test('rank 1~6, kind 목록 안', () => { for (const p of places) { assert.ok(p.rank >= 1 && p.rank <= 6); assert.match(p.kind, /^(country|capital|city|mountain|river|sea|region|island|desert|plain|other)$/); } });
```
- [ ] **Step 5:** 용량 ≤ 150KB. 커밋.

### Task U3-6: 사진·원본 쪽·핀 (1단계 C3)

**Files:** Modify `scripts/atlas/config/u3.json`(`photos`); Output `content/atlas/u3/photos.json`, `docs/assets/atlas/u3/photo/*`, `docs/assets/atlas/u3/page/p026~p033.jpg`

- [ ] **Step 1:** `python -I scripts/atlas/extract_images.py --unit u3 --candidates` → 후보 목록. 쪽 렌더를 보며 `photos.items`(bbox·topic·mask)·`exclude`를 확정한다. 33쪽 폴라로이드는 사진 영역만(틀·핀 그림·이웃 카드 글자 잘라 냄 — 까닭은 `_bbox`), 07 동전 2장은 따로 항목.
- [ ] **Step 2:** 핀(`photos.pins`): 28쪽 빈 핀 7(보라 물방울 #7251a1 아래 끝)·29쪽 핀 4·33쪽 번호 원 01~11(번호 글자를 담은 가장 작은 원의 가운데) → `pt2lonlat.mjs`(fit 역변환)로 경위도. 번호 없는 핀은 `pinNearMaxKm`로 사진 설명 지명과 짝.
- [ ] **Step 3:** `--photos --pages` → JPEG q82·WebP q80, 원본 쪽 110dpi 200KB 이하. 사진 합계 목표 ≤ 4MB.
- [ ] **Step 4: 개수 대조** — `expect`: 지형 7·기후 4·도시 약 10·지속가능 약 9·통합 6·특집 12(어림 — 실측으로 고쳐 기록). `--sheets` 대조표 `units/u3/shots/c3/photos-<쪽>.jpg`를 눈으로 확인.
- [ ] **Step 5:** 커밋(`content/atlas/u3/photos.json docs/assets/atlas/u3 scripts/atlas/config/u3.json`).

### Task U3-7: 그래프 숫자 (1단계 C4)

**Files:** Modify `scripts/atlas/config/u3.json`(`charts`); Output `$ATLAS_WORK/units/u3/tables/charts-u3.json`; Test `scripts/atlas/tests/test_tables.py`에 u3 경우

- [ ] **Step 1:** 기후 그래프 4: 파리·리스본·모스크바 = 97쪽 표(`tables/climate-world.json` 공유), 그레니비크 = 표에 없음 → 그래프 도형 측정(`measured`, 축 a·b·눈금 수). 지면 그래프 제목의 기후 이름(서안 해양성·지중해성·냉대 습윤·툰드라)을 `climate`로.
- [ ] **Step 2:** 30쪽 막대 2(금융 센터 지수 10 — 인쇄 숫자 없으면 측정, 축 생략 0~680 / 컨테이너 물동량 10), 31쪽 탈린 묶음 막대(인쇄 숫자 55·63·31·28·12·7·1·1·1·1 우선), 코펜하겐 묶음 막대 3계열 6해 + 2021 고리(인쇄 %), 류블랴나 막대 10, 프라이부르크 수치 4(1992 100% · 2018 −37% · 2030 −60% · 2035 −100% → `table`), 소피아 앙티폴리스 수치 8(`table`).
- [ ] **Step 3: 테스트** — 기후 그래프 4개 × 기온 12·강수 12 숫자, 탈린 계열 2개 × 범주 5, 코펜하겐 고리 합 100(±0.5), 측정 그래프에 `precision` 있음.
- [ ] **Step 4:** 경고 0으로 `charts-u3.json` + 도장. 교과서 원문 문제는 `content/atlas/u3/issues.md`. 커밋.

### Task U3-8: 주제 내용 (1단계 C5)

**Files:** Create `content/atlas/u3/topics.json`, `content/atlas/u3/overrides.json`, `content/atlas/u3/issues.md`; Output `content/atlas/u3/coloring.json`, `sims/atlas-u3-europe/data/{topics,charts}.json`, `layers.js`

- [ ] **Step 1:** `topics.json` — 주제 8개(id: `general`·`coloring`·`relief`·`climate`·`cities`·`sustainable`·`integration`·`feature`), 글은 손으로 쓰지 않고 출처 상자(`src`{page,bbox}, `titleSrc` 등)만 적는다(1단계 C5 규칙). 묶음(지도 고르기): 기후 = 구분·1월·7월, 통합과 분리 = EU·분리 독립·벨기에·이탈리아, 도시 = 도시화율과 도시 분포, 지속가능 = 녹색 수도·리스본.
  - 지형 `pinNumbers:"hidden"`(활동하기 1), 기후 핀 4도 활동하기 2 가 「위치를 지도에 표시」라 `hidden`.
  - 특집 = 번호 핀 11 + 사진 카드(퀴즈 없음, 마커 제목 = 사진 굵은 제목).
  - 바탕 기본값: 일반도 `tint`, 지형 `natural`, 나머지 없음(main.js `BASE_COLOR`).
- [ ] **Step 2:** 색칠하기: `extract_text.py --unit u3 --labels`(27쪽 나라 글자·초성·수도 ★) → `node scripts/atlas/coloring_quiz.mjs --unit u3 --write` → `content/atlas/u3/coloring.json`(초성 → Natural Earth NAME_KO 초성 일치 나라). 나라 수 = 27쪽 나라 글자 수.
- [ ] **Step 3:** `python -I scripts/atlas/extract_text.py --unit u3 --fill --check` → `node scripts/atlas/build_content.mjs --unit u3`.
- [ ] **Step 4: 테스트** (`tests/atlas/units/u3.content.test.mjs` + G5 계약 테스트)
```js
const T = JSON.parse(readFileSync('sims/atlas-u3-europe/data/topics.json', 'utf8'));
test('주제 8개, 26~33쪽 모두 덮음', () => {
  assert.deepEqual(T.map((t) => t.id), ['general', 'coloring', 'relief', 'climate', 'cities', 'sustainable', 'integration', 'feature']);
  const pages = new Set(T.flatMap((t) => t.pages)); for (let p = 26; p <= 33; p++) assert.ok(pages.has(p), `${p}쪽`);
});
test('개수: 지형 핀 7(번호 숨김), 기후 그래프 마커 4, 특집 핀 11', () => {
  const by = Object.fromEntries(T.map((t) => [t.id, t]));
  assert.equal(by.relief.markers.length, 7); assert.equal(by.relief.pinNumbers, 'hidden');
  assert.equal(by.climate.markers.filter((m) => m.chart).length, 4); assert.equal(by.feature.markers.length, 11);
});
```
  (U3-6·U3-7 실측이 다르면 테스트를 실측에 맞추고 까닭을 「실행 중 결정」에.)
- [ ] **Step 5:** 검토 덤프 `units/u3/shots/c5/topics.md`를 쪽 렌더와 대조(빠진 글·깨진 글 — `pdfkit.dec` 알려진 오류 `·`→`h`, `℃`, `㎢`, 『』). 커밋.

### Task U3-9: 바탕 지도와 조각 조립 (1단계 D2·E1)

**Files:** Create `sims/atlas-u3-europe/index.html`(템플릿 복사), `sims/atlas-u3-europe/main.js`; Output `sims/atlas-u3-europe/data/basemap.json`; Modify `src/registry.js`

- [ ] **Step 1:** `node scripts/atlas/build_basemap.mjs --unit u3` → 110m·50m 전 지구 + 10a 유럽 상자, ≤ 900KB(`basemap.maxBytes`). `simplifyByIso`는 KOR·PRK 100%(공통 기본값 — 유럽 지도에는 안 보이지만 같은 규칙).
- [ ] **Step 2:** registry `SIMS`에 `{ id: 'atlas-u3-europe', book: 'atlas', unit: 'Ⅲ. 유럽', page: 26, title: '사회과부도 유럽', kind: '지도' }`.
- [ ] **Step 3:** `main.js` = 자료 정적 import(basemap·places·topics·charts·layers.js) + 선택값 + `mountAtlas`. 선택값: `baseColor: {general:'tint', relief:'natural'}`; 작은 지역 확대 창이 필요한지(소피아 앙티폴리스·베네치아는 사진 카드라 불필요, 룩셈부르크·몰타 등 색칠하기는 50m/10a 로 확인) 캡처로 보고 결정.
- [ ] **Step 4:** `npm run embed -- atlas-u3-europe` → `check:embed` 통과, 크기 ≤ 3MB(목표 1~2MB). 금지 패턴 0.
- [ ] **Step 5:** 미리보기 캡처(1440×900·1024×768, `--disable-gpu`)로 8개 주제 × 묶음을 모두 본다. 페이지 콘솔 오류 0. 커밋.

### Task U3-10: 교과서 대조표 (1단계 E2) ⓣ

**Files:** Create `scripts/atlas/config/u3.compare.json`; Output `$ATLAS_WORK/units/u3/compare.html`

- [ ] **Step 1:** `u3.compare.json`: `mainMap`{general:'p26-europe', coloring:'p27-coloring', relief:'p28-relief', feature:'p33-locator'}, `coloringLabels`(27쪽 글자 파일), `extraScenes`(고도 색 켬/끔, 지형 바탕 3종, 핀 숨김/하나/모두, 색칠하기 활동, 묶음 막대 크게 보기, EU 범례 「유로 사용 국가」 고름, 도시 인구 범례 고름), 둘째 도법(일반도 = 이퀄어스).
- [ ] **Step 2:** `node scripts/atlas/compare_shots.mjs --unit u3` → `node scripts/atlas/compare.mjs --unit u3`. 결과 수(같음·알려진 차이·참고·다름)를 「실행 중 결정」에. **다름 0**이 목표 — 다름은 고치거나 까닭을 「알려진 차이」로.
- [ ] **Step 3:** 교사에게 대조표 경로와 확인 요청 항목(화면용 색 보정, approx 지도, 나라 단위 분류가 교과서와 다른 나라, 하위 행정 구역 근사)을 알리고 **승인을 기다린다**(공개하지 않음). 교사 요청 고침은 「실행 중 결정」에 기록 → 다시 대조.

### Task U3-11: 성능·이미지 경로·공개 (1단계 E3) ⓣ

- [ ] **Step 1:** 1024×768 swiftshader 성능(도법 전환, settle 다시 그리기 — 일반도 고도 색 켬, 지형 자연색, 기후·EU 묶음; 1단계와 같은 측정 꼴 9번 중 뒤 7번 중앙값/최대). 기준: 200ms 안. 결과를 「실행 중 결정」에(따로 문서 만들지 않음).
- [ ] **Step 2:** 이미지 먼저 공개: `git add docs/assets/atlas/u3 && git commit && git push` 뒤 모든 사진·쪽 주소 200(`curl -sI`).
- [ ] **Step 3:** 교사 승인 뒤 `npm run release -- atlas-u3-europe --note "사회과부도 유럽 첫 공개"` → 커밋·푸시 → `https://yhk1m.github.io/donga-social-sims/atlas-u3-europe/1/` 200, 공개 페이지에서 음영·고도 색·자연색 화상이 그려지는지(교차 출처) 확인.
- [ ] **Step 4:** 아시아 회귀 마지막 확인(`regress_u2.mjs --check` — 엔진이 바뀌었으면 atlas-u2-asia 도 새 버전을 낼지 교사에게 물음: 「엔진 개선이 아시아에도 반영됨, 아시아 v4 공개할까?」).

---

## 실행 순서와 병렬화

- G0 → G1 → G2 → G3 → G4 → G5 (G 는 차례대로 — 모두 같은 파일을 만짐)
- U3-1 → U3-2 → (U3-3 은 U3-2 와 병렬 가능 — 엔진·파이프라인 코드만) → U3-4 → U3-5·U3-6·U3-7(병렬) → U3-8 → U3-9 → U3-10 ⓣ → U3-11 ⓣ
- U3-10 승인 대기 동안 다음 단원(Ⅳ)의 U4-1·U4-2 를 시작해도 된다(파일이 겹치지 않음). 엔진을 바꾸면 앞 단원들의 대조표 캡처를 다시 찍어 화소 비교.

## 다음 단원 개요 (같은 틀 — 단원마다 이 문서를 본떠 계획을 새로 쓴다)

각 단원 = `-1 설정·지도 목록` → `-2 기준점·fit` → `-3 새 엔진 기능` → `-4 레이어` → `-5 지명` → `-6 사진·핀` → `-7 그래프` → `-8 내용` → `-9 바탕 지도·조립` → `-10 대조표 ⓣ` → `-11 공개 ⓣ`.

- **U4 Ⅳ 아프리카(34~39, `atlas-u4-africa`, 11 작업 + 엔진 하위 약 4)**: 지도 13(일반도 정거 방위, 색칠, 지형, 기후 3, 언어·종교·자원·태양광, AfCFTA·사막화). 새 기능: 두 색 줄무늬·점무늬 채움(`pattern.stripes|dots` — 줄무늬 나라는 두 분류에 속함), 지도 위 고리 그래프 기호(`chartSymbolLayer` 7개 + 생산국 칠함), 원 크기 그래프(그레이트 그린 월), 세계 래스터 분류(태양광). 기후 그래프 측정 2(키상가니·도도마). 주제도 활동 = 교사 Q4 답대로.
- **U5 Ⅴ 아메리카(40~47, `atlas-u5-americas`, 11 작업 + 엔진 하위 약 6)**: 지도 약 22. 새 기능: `fitCore.FAMILIES`에 `stereographic`·`orthographic`(u2·u3 는 `families` 고정이라 영향 없음 — 회귀 확인), 중앙아메리카 삽입(여러 지도 한 레이어 재사용), 지구본 보기(46쪽 — 교사 Q2), 미국 주 4장 알래스카·하와이 삽입 `fitFrom` 공유(웹은 실제 위치), 캐나다 센서스 구역·멕시코 주 하위 행정 구역, 크기 비례 원(본사 100곳 + 실리콘 밸리 확대 창), 네모 단위 기호(마킬라도라), 지도 위 고리 5(재사용), 100% 띠 2줄. 같은 축척 우리나라 = 교사 Q3. 기후 그래프 측정 1(이키토스).
- **U6 Ⅵ 오세아니아·극지방(48~55, `atlas-u6-oceania-polar`, 11 작업 + 엔진 하위 약 6)**: 지도 약 19. 새 기능: 극 중심 보기 `polarN|polarS`(교사 Q1 — 렌더러·투영·축척 막대·역투영 격자 테스트 먼저), 날짜변경선 단원 상자 2개, 하와이·타히티·뉴질랜드 삽입, 극 부채꼴 영유권 면(극점 포함 면 감김·자르기 테스트), 지구본 항로(55쪽 — Q2), 두 축 선·반원 비교 그래프, 대권 흐름선. 50쪽 래스터 조각 10만 개 — 렌더 캐시. 기후 그래프 측정 1(앨리스스프링스).
- **U1 Ⅰ 세계화(8~15, `atlas-u1-world`, 11 작업 + 엔진 하위 약 5)**: 지도 약 14 + 지구본 10. 새 기능: 두 쪽 걸친 지도(8~9·10~11쪽 쪽마다 fit + 지명 합치기 `spreadOf`), 8쪽 유럽 삽입, 대륙·대양 맞히기 퀴즈(`continentOcean`), 지구본 바로가기 단추(Q2), 세계 단계구분도 다수(`countryClass` 재사용 — 인터넷·이동 전화·햄버거·코로나), 인천 항공망 흐름선 약 80+(대권, 성능 측정), 한국 문화 기관 점 약 200(3종). 바탕 지도는 10a 없이 110m·50m(세계 단원). 15쪽 주제도 활동 = Q4.

## 실행 중 결정

- (G0~G5, 2026-10-20) 파이프라인 단원 일반화 — 커밋 1bffdc3(G0) · 480e4f5(G1) · d38fdf6(G2) · 18652ec(G3) · 2b55a07(G4) · 5a98bc6(G5) · b504479(리뷰 반영)
  - 기준선(G0, `scripts/atlas/regress_u2.mjs --baseline` → `$ATLAS_WORK/units/u2/baseline/`): 해시 163개(저장소 114 = sims/atlas-u2-asia/data·content/atlas/u2·docs/assets/atlas·조각, 작업 폴더 49 = vec·fit·지명·표), 대조표 캡처 41장·manifest, 대조표 HTML(다름 0 · 알려진 차이 9 · 같음 134 · 참고 24), 조각 2,090,947 B(2,041.9 KB). JSON·JS 원본도 `baseline/files/`에 두어 다를 때 내용을 견줌.
  - 리팩터링 전에 HEAD 코드로 u2 파이프라인 15단계(G5 Step 3 순서, `$ATLAS_WORK/units/u2/pipeline.sh`)를 한 번 돌려 **파이프라인 자체가 바이트까지 재현됨**을 먼저 확인(해시 163개 다름 0, 대조표 같음, 조각 해시 같음) — 뒤의 차이를 리팩터링 탓으로만 읽을 수 있게.
  - **도장 값 차이(정당)**: `build_basemap.mjs`·`coloring_quiz.mjs`(G1)·`georef.mjs`·`geo_util.mjs`(G2)는 설정 `content.stamps`의 입력 파일이라, 계획대로 고치면 `sims/atlas-u2-asia/data/basemap.json` meta.inputsHash·`content/atlas/u2/coloring.json` inputsHash 가 바뀐다(설계는 u2 설정만 얼리면 된다고 봤으나 스크립트도 도장 입력). 다시 만들어 `regress_u2 --check`로 「inputsHash 값만 지우면 나머지 바이트 같음」을 확인하고 커밋에 함께 넣음. basemap 은 도장이 달라 mapshaper 로 다시 만들었는데 도형 바이트가 같았다. `atlas_common.py`(charts 도장)·`extract_text.py`(손대지 않음)의 도장은 작업 폴더 stamp 파일뿐이라 extract_tables 를 다시 돌려 맞춤. 조각은 basemap 도장 글자 + 코드 위치(mountAtlas 모듈)로 +274 B.
  - `extract_text.py`·`extract_tables.py`는 계획 목록에 있었으나 박힌 경로가 없어(topics-check 는 설정 stamps `@work/…`, 표 경로는 설정 charts.out) **고치지 않음** — 도장 입력이라 고치면 p17-labels.json·topics 도장이 바뀜. 새 단원은 설정에 `@unit/…`을 쓰면 된다(atlas_common.stamp_path·geo_util.stampPath 가 풂).
  - 단원 고르기: Python 은 atlas_common import 때 `sys.argv`에서 `--unit <id>`/`--unit=<id>`를 빼낸다(각 스크립트 옵션 해석 그대로). Node 는 `stripUnitArgs`. 자식 Python 에는 `UNIT.childEnv()`(ATLAS_UNIT)로 넘김(리뷰 지적 — 안 넘기면 `--unit u3`가 자식에서 u2). 설정에 maps·out 이 없으면 maps_<id>.json·sims/<sim>/data — 모든 스크립트가 UNIT.mapsPath·dataDir 로 같은 규칙.
  - 도법 후보 `familiesFor`(지도 → 단원 georef.families → 1단계 8개, 차례 그대로)는 georef-cli 와 city_controls(고르기 fitControls·겹 나누기)에 모두. fit 17개·city-holdout.json 바이트 같음.
  - `build_tint.py`·`build_natural.py`: tint·natural 절 없는 단원 설정이면 「공용 화상은 u2 설정으로」 알리고 멈춤(설계 §4.2 표).
  - 대조표(G3): 1단계 장면 함수를 `config/u2.compare.json extraScenes`(단계 목록)로 옮김 — 차례·기다림·`--only` 동작·manifest 정보 키 차례 그대로(장면 차례·정보도 회귀 비교). 아시아 분기·알려진 차이 설명은 `checks`·`notes`. u2 출력 자리는 1단계 그대로(`shots/e2`, `compare-u2.html`), 새 단원 기본은 단원 작업 폴더 `shots/compare`·`compare.html`.
  - **화소 비교 결함과 세계유산 캡처(리뷰 반영)**: 처음 `regress_png.py`는 RGBA 차이에 `getbbox()` 기본값(alpha_only=True, Pillow 12)을 써서 불투명 그림의 RGB 차이를 못 봤다(G0 커밋의 「다시 캡처해도 화소 차 0」도 이 결함 아래 값). 고친 뒤 보니 세계유산 3장면(heritage·-quiz·-quiz-answer)만 달랐고, 까닭은 1단계부터 퀴즈 seed 기본값이 `Date.now()`(캡처마다 문제가 다름). 그래서 compare_shots 가 설정 `fixedNow`(u2 = 1760918400000)면 쪽마다 `Date.now`를 고정(앱에서 Date.now 는 퀴즈 seed 에만 쓰임). 옛 main.js(4a97d5b)와 새 코드를 고정 시각으로 각각 41장 찍어 **41장 모두 화소 같음** → 기준선의 세계유산 3장을 옛 코드·고정 시각 캡처로 바꿈(옛 무작위 캡처 `baseline/shots-g0-random/`). 화면 지명 수(labels)는 캡처 뒤에 재는 값이라 heritage 에서 100↔101 로 흔들려 참고로만 봄(화소는 같음).
  - 회귀 표(마지막 — b504479 코드로 파이프라인 15단계 처음부터, `--unit` 없이):

    | 항목 | 기준선 | 지금 | 판정 |
    |---|---|---|---|
    | 해시 163개 | — | 다름 2 = coloring.json·basemap.json 도장 값만(나머지 바이트 같음) | 정당 |
    | 대조표 캡처 41장 | — | 화소 차 0(RGB 포함), 장면 차례·정보 같음, 화면 값 같음(지명 수 흔들림 3 참고) | 같음 |
    | 대조표 | 다름 0 · 알려진 차이 9 · 같음 134 · 참고 24 | 같음, HTML(만든 때 줄 뺌) 글자까지 같음 | 같음 |
    | 조각 | 2,090,947 B | 2,091,221 B(+0.013%), check:embed 통과 | ±1% 안 |
    | city-holdout.json | — | 바이트 같음 | 같음 |
    | npm test | Node 354 · Python 184 | Node 379 · Python 193 | 통과 |
  - 남은 것: ① `--unit u3`는 config/u3.json·maps_u3.json 이 생기는 U3-1 부터 돈다(지금은 설정 없음 오류). ② `unit.mjs`는 어느 도장 files 에도 없다 — 단원 풀이 규칙을 바꿔도 산출물이 낡았다고 나오지 않음(`@unit/`을 쓰는 설정이 생기면 생각). ③ compare_shots `--only`로 일부만 찍으면 manifest 차례가 바뀌어(1단계 동작) 회귀 비교는 전체 캡처로.
- (U3-1·U3-2, 2026-10-20) 유럽 설정·지도 목록·기준점 — 커밋 88e6dd0(U3-1) · 7aa0883(U3-2)
  - 지도 15장은 설계 §5.1 표와 같은 수(표 고칠 것 없음). 26쪽 눈금 글자는 실제 21개(70˚N 하나뿐 — 설계의 24는 어림). 29쪽 기후 구분은 눈금 글자 13개 중 2개가 아이슬란드 삽입 것이고 곡선 경위선이 성겨 교차점이 3개뿐 → 섬·호수 기준점이 맞추기를 맡음. 아이슬란드 삽입은 `p29-climate-iceland`(insetBbox 로 본 지도에서 뺌).
  - **작업 파일 단원 자리(G 리뷰 반영)**: 작업 폴더 상대 경로를 그대로 이어 붙이는 키(places.index.out·charts.out·content.labels·content.charts·photos.sheetDir)는 읽는 스크립트가 `@unit/`을 풀지 않아(stamp_path 만 풂) `units/u3/…`로 적었다 — 코드 수정 없이 u2 중간 산출물(tables/index.json·climate-world.json 등)을 덮어쓰지 않음. 도장은 `@unit/…`. 97쪽 기후 표도 u3 자리에 따로(같은 climateTable 이면 내용 같음). 지도 id 로 갈리는 vec/·geo/·text/places-<id> 는 공용 자리. build_basemap 의 mapshaper 작업 자리(`${WORK}/basemap`)는 이 작업에서 건드리지 않음(U3-9 에서).
  - 도법 후보는 u3 도 1단계 8개(`georef.families`) — 유럽 지도는 모두 그 안에서 맞아 평사·정사를 더할 일 없음.
  - **기준점 방식(새 도구)**: 눈금 없는 14장은 손으로 찍지 않고 1단계 「centroid 기준점」을 자동화했다. `land_shapes.py`가 교과서 육지·물 도형(섬·호수·닫힌 바다)을 뽑고(벡터 = 육지 색 합 또는 바다 덮개, 28쪽 자연색 래스터 = 파랑 − 빨강 > 3 이 아닌 화소), `shape_controls.py`가 Natural Earth 10m(육지 조각·육지 구멍·호수, 또는 나라 조각)을 지금 식으로 투영해 같은 종류·중심 거리 max(4pt, 0.15√넓이)·넓이 비 1.6 안에서 서로 가장 좋은 짝을 고른다. 기준점 = (교과서 넓이 중심, 투영한 Natural Earth 도형의 지면 넓이 중심을 되돌린 경위도) — 같은 지면 정의라 큰 섬도 구면 중심과의 차이가 없다. 짝 → 맞추기를 되풀이(2~5번에 수렴), 잔차 MAD(3·1.4826, 하한 1pt) 거르기, 4pt 간격. 처음 식은 지도 목록 `shapes.init`(섬 씨앗 — 교과서 자리 어림 + Natural Earth 안 한 점, 나라 하나 지도는 넓이·중심 닮음 변환, 삽입은 본 지도 식에 이동만). 기준점은 `src:'shape'`(type centroid·tip)로 maps_u3.json 에 적힌다. Python 쪽 맞추기·투영은 `fit_helper.mjs`(georef.mjs 그대로).
    - 27쪽 색칠하기: 나라 면이 굵은 색 띠 안쪽의 흰 면이라 섬이 작게 줄어 있다 → 나라 조각을 대상으로(`target: countries`) 투영한 Natural Earth 나라도 2pt 줄여 비교(`insetPt`). 회색 #dcddde 는 바다 밑까지 깐 바탕(위에 바다 채움)이라 육지로 쓰지 않음, 흰 경위선 채움은 열림 1pt 로 끊음. 우크라이나·이탈리아 중심은 잔차로 빠짐(띠 너비가 고르지 않은 탓으로 봄).
    - 벨기에·이탈리아·아이슬란드 삽입: 섬·나라가 하나뿐이라 해안·국경이 3pt 거리에서 50° 넘게 꺾이는 점(곶 끝·만 안쪽·세 나라 접점)을 양쪽에서 찾아 2pt 안 짝(`tips`). 교과서 벨기에 국경이 Natural Earth 10m 와 거의 같아(꺾인 점 차 0.1pt 안팎) 49개.
    - 28쪽 래스터에 tips 를 켜면 화소 경계가 거칠어 rms 0.51 → 0.97pt 로 나빠져 쓰지 않음(섬·호수 중심만).
  - 26쪽: 경위선 교차점 29 + 도시 기호 기준점 146(`city_controls.mjs --unit u3`, 설정 u2 값 그대로 — 이름 짝 373, MAD 로 뺌 32(로스토프는 동명 다른 도시, 니스·뉴캐슬어폰타인 등은 옮겨 그린 기호), 간격으로 뺌 195). 겹 나누기 빠진 도시 오차 중앙값 2.15km·90% 5.56·최대 11.3(교차점만 3.55/7.09/10.65), 기준점 아닌 도시 1.99/7.02/11.1km(`units/u3/geo/city-holdout.json`). 도시 기준점 설명(`cityControls.note`)은 유럽용으로 바꿈.
  - `unitBoxes` = 26쪽 틀(쪽 전체) 41×41 격자를 fit 으로 되돌린 범위(-39.4, 27.8, 74.4, 73.3) → `[-40, 27, 75, 74]`(원뿔이라 위 모서리가 경도 폭을 넓힘).
  - 경위도 맞추기 결과(`georef-cli --unit u3 --all`, 겹 나누기 = shape 기준점 5겹을 빼고 georef-cli 와 같이 맞춘 오차, 해안 어긋남 = 투영한 Natural Earth 경계 꼭짓점 → 교과서 육지 경계 거리 중앙값):

    | 지도 | 도법(중심, 표준위선) | 기준점 | rms pt / mm | 평균 mm | 겹 나누기 평균 pt · km 중앙/90%/최대 | 해안 어긋남 pt |
    |---|---|---|---|---|---|---|
    | p26-europe | 정각 원뿔 15°E, 52.8 (+TPS) | 교차 29 + 도시 146 | 0.55 / 0.19 | 0.16 (LOO 0.16) | 도시 2.15/5.56/11.3 km | — |
    | p27-coloring | 정각 원뿔 15°E, 52.8 (+TPS) | 나라·섬 40 | 0.61 / 0.21 | 0.16 (LOO 0.23) | 0.61 · 2.4/8.6/15.0 | 1.41(띠 근사 포함) |
    | p28-relief | 정각 원뿔 15°E, 52.6 (+TPS) | 섬·호수 76 | 0.51 / 0.18 | 0.15 (LOO 0.18) | 0.52 · 4.0/9.9/14.3 | 0.89(화소 경계) |
    | p29-climate | 정각 원뿔 15°E, 52.6 | 교차 3 + 섬 87 | 0.14 / 0.05 | 0.05 | 0.13 · 1.4/2.3/3.9 | 0.13 |
    | p29-climate-iceland | 정각 원뿔 20.6°E, 43.0 | 중심 1 + 꺾인 점 24 | 0.34 / 0.12 | 0.10 | 0.32 · 2.9/7.2/9.2 | 0.06 |
    | p29-jan · p29-jul | 정각 원뿔 15°E, 52.6 | 섬 28 · 28 | 0.07 / 0.02 | 0.02 | 0.07 · 1.6~1.7/2.3~2.4/3.5 | 0.10 · 0.09 |
    | p30-urban | 정각 원뿔 15°E, 52.7 | 섬 58 | 0.17 / 0.06 | 0.05 | 0.15 · 1.8/3.5/8.8 | 0.23 |
    | p31-green-capital | 정각 원뿔 15°E, 52.6 | 섬 58 | 0.17 / 0.06 | 0.05 | 0.15 · 1.9/3.5/8.9 | 0.24 |
    | p31-lisbon | 정각 원뿔 15°E, 52.5 | 섬 21 | 0.09 / 0.03 | 0.02 | 0.07 · 1.9/3.3/8.8 | 0.15 |
    | p32-eu · p32-separatism | 정각 원뿔 15°E, 52.7 | 섬 59 · 59 | 0.17 / 0.06 | 0.05 | 0.15 · 1.7~1.8/3.2~3.6/8.7 | 0.21 · 0.24 |
    | p32-belgium | 메르카토르 4.4°E | 중심 1 + 꺾인 점 48 | 0.34 / 0.12 | 0.08 | 0.25 · 0.25/1.4/2.2 | 0.06(국경) |
    | p32-italy | 메르카토르 12.6°E | 섬 5 + 꺾인 점 50 | 0.43 / 0.15 | 0.12 | 0.34 · 2.1/6.0/14.7 | 0.09(국경) |
    | p33-locator | 정각 원뿔 15°E, 52.5 | 섬 23 | 0.10 / 0.03 | 0.03 | 0.08 · 2.0/2.9/8.9 | 0.15 |

    모든 지도가 1단계 합격 기준(평균 잔차 ≤ 0.5mm)을 넉넉히 넘어 `approx` 없음. 26·27쪽 = 지면 「람베르트 정각 원뿔」과 같은 식이 골라짐(다른 유럽 지도도 모두 같은 바탕 지도 — 중심 15°E·표준위선 약 52.7°). 아이슬란드 삽입은 넓이가 작아 원뿔 매개변수가 본 지도와 다르게 나오지만(20.6°E, 43°) 섬 안 잔차는 0.34pt — 그 섬만 그리므로 문제없음. 벨기에·이탈리아는 축척이 커 메르카토르가 정각 원뿔과 구별되지 않는 것(더 적은 매개변수를 고르는 규칙).
  - 눈으로 확인: `units/u3/geo/<id>.verify.png`(Natural Earth 10m 해안선 자홍 + 기준점, 벨기에·이탈리아는 국경선도), 도형 확인 `units/u3/shapes/<id>.png`. 해안선이 15장 모두 교과서 해안·국경 위에 겹침. 주의해서 볼 곳: 28쪽은 기준점이 스칸디나비아·카렐리야 호수와 지중해 섬에 몰려 이베리아·프랑스·독일 안쪽에 기준점이 없다(겹 나누기 90% 9.9km — 해안 겹침은 맞음). 27쪽은 나라 면 띠 근사라 최대 15km.
  - georef-cli: `--verify` 그림을 단원 작업 폴더(`UNIT.workFile('geo/…')`, u2 는 옛 자리 그대로)로, 나라 기준 지도(`shapes.target: countries`)는 국경선도 겹침, 기준점이 4개 미만이면 알리고 멈춤(전에는 fitControls 안에서 TypeError).
  - **u2 회귀 도구 범위**: `regress_u2.mjs`의 작업 폴더 지명 파일 목록이 `text/places-*.json`이라 유럽 `places-p26-europe.json`(26쪽 도시 기준점용으로 places.py --unit u3 를 돌림)이 「새로 생김」 실패로 잡혔다 → u2 지도(p16~p25)로 한정. u2 georef-cli --all 다시 돌린 뒤 `regress_u2.mjs --check`: 해시 163개 중 도장만 다른 2(G 끝과 같음), 캡처 41장 화소 차 0, 대조표 수 같음, 조각 +0.013% — 회귀 없음.
  - npm test: Python 213 · Node 383 통과.
- (U3-3, 2026-10-20) 엔진·파이프라인 유럽 기능 — 커밋 205ec94(U3-2 리뷰 반영) · 7172e47(3a) · f0d07fe(3b) · 8f28d16(3c) · 65c4df6(3d) · 289769a(3e) · 561c1bf(3f)
  - U3-2 리뷰 반영: shape_controls 박힌 수치 → DEFAULTS(windowPadDeg·minProjectedFrac·seedMaxDistPt·tipMinAreaPt2·tipOverlapFrac), 틀 밖 꼭짓점을 뺀 점 줄은 closed=False, 수렴 경고·select 4개 하한, 합성 시험(가짜 fit_helper). 고친 뒤 도형 기준점 14장을 다시 돌려 기준점·rms 모두 같음(26쪽은 도시 기준점이라 이 도구 밖). **아이슬란드 삽입(p29-climate-iceland)은 되풀이 5번 안에 짝 목록이 수렴하지 않는다**(경고가 새로 보임 — 마지막 짝으로 계속, 결과는 U3-2 와 같음).
  - 3a countryClass: 표본은 나라 전체 상자가 아니라 「나라 ∩ 지도 틀을 되돌린 경위도 면」에서 찍는다(처음 방식은 러시아·노르웨이처럼 일부만 든 큰 나라의 representative_point 가 틀 밖이라 「지도 밖」이 됨). 생성물은 country_class.py → $WORK/geo/<id>.cc.json → build_layers 가 범례 꾸밈(decorateLegend, 면 레이어와 나눔)을 붙여 layer-<id>.json. 웹은 상세도마다 areaLayer 를 만들어 맡김(범례 고름·검은 윤곽·말풍선 「나라 · 분류」). 임시 설정으로 30쪽 도시화율(50개국 — 터키·마그레브는 교과서도 회색이라 분류 없음이 맞음)·32쪽 EU(43개국) 확인.
  - 3b 윤곽만 분류: 32쪽 유로 사용국은 가입국 위에 겹치는 분류라 나라 하나에 분류 둘 → countryClass classes[iso] 를 배열 허용. country_class 는 윤곽 분류를 다수결에서 빼고 「나라 안쪽 0.8pt 테두리 점의 반 이상이 그 색 띠 안」이면 더함. EU 확인: 유로 가입국 19 + 비가입 사용국(몬테네그로·코소보·안도라·모나코·산마리노·바티칸) 잡힘, **리히텐슈타인 잘못 잡힘·룩셈부르크 채움 빠짐·몰타 없음·북키프로스(CYN) 포함** → U3-4 에서 countryOverrides(배열 cls 가능). 윤곽 분류는 검은 선택 윤곽에서 빠지고 고르면 자기 테두리 2.4px, 맞히기는 테두리 근처만.
  - 3c: **30쪽 도시 인구 원 기호는 PDF 벡터가 아니라 작은 인라인 래스터 그림(xref 0, 화소에 맞춘 bbox 1~8pt, 범례 원도 그림)** — symbols.py(벡터 채움)로는 안 잡힌다. U3-4 에서 래스터 얼룩 찾기(초록 원)를 만들고 크기는 symbolSizes 로 단계 고정. 엔진 쪽은 symbolSizes → 범례 size·기호 size·sizeBy 'class', classSymbolPx(단계 전체 배율 하나 — 확대해도 지름 비 그대로, 최대 26px), 겹친 원 범례(maxR 24).
  - 3d 값 붙은 기호: 값은 설정 symbolValues {이름: [값…]} + valueIcons 로 넣는다(리스본 9곳 × 2 — 교과서 상자 글자를 뽑을지 손으로 적을지는 U3-4·U3-7). 아이콘은 선 없는 채움 경로 charger·person(이모지 아님). 상자 자리는 지명 배치기와 같은 후보·장애물 방식(placeValueBoxes), 상자도 labelObstacles.
  - 3e 여러 지도 한 레이어: 면 모드만(등온선·흐름선 없이). 삽입 우선은 「삽입 지도 틀을 되돌린 경위도 고리」를 본 지도 면에서 빼는 방식(clip_land.apply_covers). 임시 설정으로 29쪽 래스터 확인 — 아이슬란드 점 3곳 모두 삽입 툰드라, **삽입에 지중해성·냉대 작은 조각이 섞임**(체 거르기 조정 U3-4).
  - 3f: csat 2.2.2 renderAbsBarGraph 는 다계열(나란히 막대)을 지원 → groupedBar 는 csat(1300×700 — 1000 폭이면 범주 이름을 하나 걸러 씀). 막대별 색·축 생략은 csat 에 없어 colors·axisBreak 가 있는 bar 만 시험지 양식 SVG(barSvg). 축 생략 눈금 {step, n} 은 생략 위 칸 기준(680~780 = 6).
  - 확인: 임시 페이지 헤드리스 캡처로 묶음 막대·축 생략 막대·겹친 원·윤곽 견본·값 상자를 눈으로 봄. 레이어 생성기를 고칠 때마다 u2 build_layers all → sims/atlas-u2-asia/data 바이트 같음, u2 features.json 10개 다시 뽑아 바이트 같음.
  - u2 회귀(엔진 바꾼 뒤 조각 다시 만들고 캡처 41장 → compare → regress_u2 --check): 해시 다름 2 = 도장만(G 끝과 같음), 캡처 41장 화소 차 0·화면 값 같음, 대조표 수·HTML 같음, 조각 2,054.3 KB(+0.606%, 새 엔진 코드), check:embed 통과 — 회귀 없음.
  - npm test: Python 228 · Node 407 통과.
- (U3-4, 2026-10-20) 주제 레이어 11개 — 커밋 822bc71(a 나라 단위) · 399d350·68d9193(b 29쪽 기후 구분) · 94812b7(c 1월·7월) · 3519ce1(d 도시 인구 원) · 9e96ccf·1423a53(e 31쪽) · 697b388(f 32쪽 세 지도) · 5f5d653(g 작은 고침)
  - 레이어 표(교과서 ↔ 뽑은 것, 검증 그림 `$ATLAS_WORK/units/u3/layers/`):

    | 레이어 | 종류 | 교과서 | 뽑은 것 | KB |
    |---|---|---|---|---|
    | p29-climate(+아이슬란드 삽입) | 래스터 면, 여러 지도 | 범례 10(건조 2·온대 4·냉대 2·한대 2) | 면 분류 8 + 범례만 2(온대·냉대 겨울 건조 — 지도에 그 색 화소 0), 도형 12(본 8 + 삽입 4) | 58.4 |
    | p29-jan | 래스터 면 + 등온선 | 강수 5 + 등온선 글자 11 | 면 5, 등온선 5줄(−20·−10 둘·0·10) | 62.9 |
    | p29-jul | 래스터 면 + 등온선 | 강수 5 + 등온선 글자 9 | 면 4 + 범례만 1(200 이상 — 화소 0), 등온선 6줄(10 넷·20 둘) | 47.2 |
    | p30-urban | countryClass | 5단계 | 나라 51(80~100 22·70~80 9·60~70 8·50~60 9·50 이하 3), 고침 5 | 2.3 |
    | p30-cities | 래스터 원 기호 | 도시 인구 5단계 + 사례 도시 6 | 원 217(2·8·38·73·96) + 사례 6 | 40.4 |
    | p31-green-capital | 이름 붙은 점 | 15 | 15(「도시(연도)」 2010~2024 모두), 7곳 Natural Earth 로 옮김 | 4.1 |
    | p31-lisbon | 값 붙은 점 | 10(설계 9) × 값 2 | 10 × 2(지면 글자), 7곳 옮김 | 3.6 |
    | p32-eu | countryClass(윤곽 분류) | 4분류 | 나라 48(가입 32·탈퇴 2·유로 31·희망 10 — 10a 조각 포함), 고침 17 | 4.8 |
    | p32-separatism | 벡터 면 + 지명 | 1분류 + 이름 18(설계 15) | 면 1(조각 14) + 이름 18 | 34.0 |
    | p32-belgium | 벡터 면 + 지명 | 3분류 + 이름 3 | 3 + 3 | 13.4 |
    | p32-italy | 벡터 면 + 테두리 + 지명 | 5분류 + 파다니아 + 이름 1 | 5 + 파다니아(테두리만) + 1 | 19.7 |

    합계 291KB(상한 650KB). 30쪽은 계획의 「한 파일에 classes + symbols」 대신 두 레이어(p30-urban 나라 칠하기 + p30-cities 원 기호) — 아시아 23쪽(밀도 음영 + 1억 명 막대)처럼 주제 묶음에서 같은 label 로 합친다(U3-8). 계획 시험(p29 분류 ≥ 10, p30 L.symbols)은 실측에 맞춰 `tests/atlas/units/u3.layers.test.mjs` 로.
  - **U3-3 리뷰 중요 1(countryClass 상세도)**: country_class 가 50m 나라 + 10a 에만 있는 나라(10m 도형 — 지브롤터·키프로스 영국 기지 둘·유엔 완충 지대·바이코누르 등, 단원 상자 안)를 함께 분류하고, 분류·고침 iso 가 countries50·countries10a 어디에 있는지 보고서 `levels`(neither·only50 은 경고). 결과: 두 레이어 모두 only10a = CNM·ESB·GIB·WSB(정상), only50·neither 없음. 작은 나라(지면 < 8pt²)는 「분류 없음」이거나 표본점을 덮은 맨 위 채움 도형이 나라보다 훨씬 크면(교과서가 따로 칠하지 않아 이웃 면에 묻힘 — `zones.vector_items` 로 도형 하나씩 봄) 경고 → countryOverrides 로 확인(같은 값이어도 까닭을 적음). 검증 그림 `layers/<id>-50.png`·`-10a.png`.
    - 32쪽 고침 17(600~1600dpi 확대로 하나씩 봄): 리히텐슈타인 없음(오스트리아 띠에 묻혀 「유로」로 잡힘 — 비가입·스위스 프랑), 룩셈부르크 가입+유로(띠가 나라를 다 덮어 초록이 안 보임), 몰타 가입+유로(범례 상자 오른쪽 끝 덮개 안 — 교과서는 초록, 작아서 띠 없음), 북키프로스·완충 지대·영국 기지 둘 = 섬 전체를 키프로스(가입+유로)로 칠한 교과서대로, 올란드 가입+유로(교과서 회색), 건지섬 없음(교과서 초록 — 옆 저지섬은 회색, 왕실령), 지브롤터 탈퇴(영국과 같게), 저지·맨섬·페로 없음 확인, 안도라·모나코·산마리노·바티칸 유로만 확인.
    - 30쪽 고침 5: 바티칸 80~100(교과서는 따로 안 칠함 → 출처 값 100%), 지브롤터 80~100(10a 만), 키프로스 10a 조각 셋 없음(30쪽 키프로스는 범례 상자 밑이라 교과서에 없음). 교과서가 따로 칠한 작은 나라(안도라·모나코·산마리노·리히텐슈타인 50 이하·룩셈부르크·몰타·채널 제도·맨섬·페로·올란드)는 다수결 그대로.
  - **U3-3 리뷰 중요 2(apply_covers)**: 덮개 고리는 이미 `polygonal`(make_valid — buffer(0) 과 달리 꼬인 고리 두 쪽을 모두 남김)로 유효화되고 있었다 → 넓이 없는 고리는 오류, 꼬인 고리 시험 추가. 실제 29쪽: 아이슬란드 틀 고리(−29.9~−9.5°E, 60.9~70°N)가 본 지도 면에서 지운 넓이 0(본 지도는 삽입 자리를 처음부터 덮개 상자로 뺌 — 페로 제도 등 다른 땅에 구멍 없음).
  - **아이슬란드 삽입 기준점 수렴**: 12번 되풀이해 보니 원뿔 중심 경도·표준위선이 15.8~20.7°E·42.8~51°N 사이를 오가고 rms 는 0.36~0.46pt 로 거의 같다(작은 섬 하나라 원뿔 매개변수가 정해지지 않음 — 짝이 2pt 경계에서 1~3개씩 바뀜). 본 지도 식(정각 원뿔 15°E·52.6°)에 닮음 변환만 맞추면 rms 0.347pt(자유 맞춤 0.342), 배율 541(본 지도 542)·회전 0 — 같은 지도의 떼어 놓은 조각이다. → 지도 목록 `projectionFrom: "p29-climate"`(georef `fitControls` 의 고정 후보 {family, params} — 매개변수 수 0, georef-cli·shape_controls 가 같이 씀). 되풀이 2번에 수렴, rms 0.34→0.33pt, 겹 나누기 평균 0.32→0.27pt·km 중앙 2.73. 다른 u3 지도 fit 바이트 같음.
  - **29쪽 래스터**: 기후 래스터는 북아프리카·서아시아까지 그려져 있고 흰 채움 도형 하나(유럽 모양 구멍)가 가림 → `rasterMask`(이미지만 렌더에 덮개를 다시 씌움). 사진 핀 그림·그림자 → `rasterIgnoreImages`(그 자리 가장 가까운 분류). 아이슬란드 삽입의 지중해성·냉대 조각 = 바다 흰색과 섞인 해안 화소(초록 + 흰 → 연두) → `rasterCoastPx 1`(해안 1화소는 안쪽 분류로) — 삽입은 툰드라·빙설·서안 해양성·냉대 습윤만 남음. 지도 사막은 주황빛 #fed08f 인데 범례 견본은 옅은 노랑 #fff56d(지도에 ΔE<4 화소 0) → `rasterAliases`. 1월·7월 지도 왼쪽 0.6pt 에 기후 래스터가 걸쳐 → `rasterForeignImages`(대부분 틀 밖인 그림 자리는 바다). 모두 설정이 없으면 그대로(u2 바이트 같음). 체 크기(sievePx)는 그대로 — 원인이 해안 섞인 색이라 해안 띠로 해결.
  - **30쪽 도시 인구 원**: 원은 투명 겹침을 펼친 벡터 조각 + 인라인 그림(범례 원도 그림) → 400dpi 렌더 화소에서 초록 가면(G−R>22, G−B>3, R≤60) → 닫기·열기·구멍 메우기 → 거리 변환 최댓값으로 원을 하나씩 떼어 냄(가린 원은 처음 가면 거리로 반지름 되찾음). 범례 원도 같은 방법으로 재서(7.12·5.75·4.31·2.88·1.29pt) 로그 거리로 단계. 1,000만 이상 = 파리·모스크바(이스탄불은 교과서에 없음), 키이우는 교과서 원 지름 4.5pt = 100~300(교과서대로). 런던·라인강 하류·밀라노 같은 겹친 무리는 근사(원 수 ±). 사례 도시 6 = 흰 원 + 지면 이름(교과서 범례에 없어 화면 범례 「사례 도시」, 겹친 원 범례에는 같은 색·크기 단계만 넣고 사례 도시는 아래 줄).
  - **31쪽**: 녹색 수도 공은 인라인 그림이라 공 밑 그림자 타원(조각 묶음)을 도시 자리로, 이름은 「스톡홀름(2010)」(외곽선 효과로 여러 번 찍힌 글자 하나로, 괄호 조각이 섞인 연도). 교과서 공은 글자 자리 때문에 실제와 −6~+5pt(스톡홀름 87km·에센 104km) → 1단계 지명 규칙(snapKm 30)대로 이름이 Natural Earth 인구 지점과 하나로 맞으면 그 위치로(snapped 기록, 녹색 수도 7·리스본 7). 리스본은 도시 10(설계 9)이고 값은 지면 이름표 아래 글자를 그대로(U3-3d 의 손 값 symbolValues 대신 features → valueIcons).
  - **32쪽 세 지도**: 분리 독립 = 한 분류 + 지역 이름 18(Point label role region). 벨기에 면은 범례색을 옅게 한 색 → aliases, 브뤼셀 수도권은 초록 바탕 + 옅은 파랑 빗금(두 언어를 두 범례색 줄무늬로) → 줄은 프랑스어로(범례 3 그대로, 화면도 줄무늬). 이탈리아 범례 「5」+「만 이상」은 글자 크기가 달라 조각이 나뉨 → `legendJoin ''`, 파다니아 지역 보라 띠 → 띠가 둘러싼 면을 테두리만 분류(outlineFills, 덮개 밖 — 범례 6 = 5 + 파다니아).
  - 화면용 색 보정: 웹 육지 #f2efe9 와의 색 차가 가장 작은 면 분류가 빙설 21.5(1단계 토속 종교 보정 뒤 값 20.0 과 비슷) → **보정 없음**.
  - 작은 고침(U3-3 리뷰): countryOverrides 는 cls·label 중 꼭 하나, frame_window 는 날짜변경선 넘는 틀이면 멈춤(메모), 겹친 원 범례 범례 상태 없으면 단추 아님, barSvg 빈 값은 막대 없이 「자료 없음」.
  - **줄 끝 주의**: Python 으로 파일을 고쳐 쓰면(텍스트 모드) 작업 사본이 CRLF 가 된다 → 도장(inputsHash)이 바이트 해시라 커밋(LF)과 달라짐. 처음 399d350 의 u2 coloring 도장이 그 값이라 68d9193 에서 LF 로 맞추고 다시 계산. 이후 `newline='\n'`.
  - u2 회귀(공유 파이프라인·엔진을 고친 뒤 u2 extract_vectors --features all → georef-cli --all → build_layers → 조각 → 캡처 41장 → compare → regress_u2 --check): 해시 다름 2 = 도장만(G 끝과 같음), 캡처 41장 화소 차 0·화면 값 같음, 대조표 수·HTML 같음, 조각 2,054.5 KB(+0.614%), check:embed 통과 — 회귀 없음. u2 fit 17·features 10·레이어 12 바이트 같음.
  - npm test: Python 248 · Node 420 통과.
  - 교사 확인 항목(U3-10 대조표에 넣을 것): 32쪽 북키프로스(교과서대로 섬 전체 가입+유로 — 실제로는 EU 법 유보·리라), 올란드(교과서 회색 → 핀란드와 같게), 건지섬(교과서 초록 → 없음), 몰타 유로 띠 더함, 30쪽 채널 제도·맨섬 80~100(교과서 색 그대로 — 출처 값은 31%·53%), 30쪽 키프로스 없음(범례 밑), 31쪽 기호 14곳 Natural Earth 로 옮김, 30쪽 겹친 원 무리 근사, 벨기에 브뤼셀 빗금 처리.
  - **U3-4 리뷰 반영(1902323)**: ① 날짜변경선 검사 `check_lon_span` 순수 함수 + 시험. ② 29쪽 실제 자료 시험 — 아이슬란드 삽입 분류는 정확히 넷(서안 해양성·냉대 습윤·툰드라·빙설), 덮개 틀 밖 페로 제도·루이스섬이 본 지도 면에 덮임. 이를 쓰다가 **페로 제도가 빠져 있음**을 찾음: 섬이 작아 화소가 모두 흰 바다와 섞인 옅은 색(ΔE16 안 범례색 0)이고 해안 띠가 섬 전체를 덮었다 → 해안 띠는 안쪽 화소가 있는 덩어리에만, 분류 화소가 없는 작은 섬(4~2000화소, 틀 가장자리에 닿지 않음)은 가장 진한 화소를 「견본색 + 흰색」 섞임으로 풀어(deblend — 그냥 Lab 거리면 옅은 지중해성으로 끌림) 분류(29쪽 15덩어리, 페로 = 서안 해양성), minArea 0.1 → 0.03(페로 가장 큰 섬 약 0.07°²). minArea 를 낮추니 흰 덮개가 틀 끝까지 오지 않아 남던 1~2pt 래스터 띠(북아프리카·튀르키예·우랄 너머)가 보여 `rasterEdgePt 2.5`(우랄 쪽 진짜 땅도 약 50km 잘림). 레이어 58.4 → 74.4KB. ③ zones 래스터 규칙을 순수 함수(coast_band·force_boxes·fill_labels·rescue_islands·deblend_class)로 나눠 배열 시험, 핀 상자는 rasterMask 덮개 자리를 되살리지 않음(29쪽 결과 화소 몇 개 바뀜 — 1월·7월은 바이트 같음). ④ `projection_from.mjs`: 삽입 fit 이 본 지도 도법·매개변수와 다르거나 본 지도 fit 이 더 새것이면 낡음 — georef-cli 는 알리고 다시 맞춤, build_layers 는 멈춤. ⑤ 30쪽 원 217±10%·단계 2/8/38/73/96 정확히, 31쪽 옮김 각 7 정확히, SMALL_COMP 근거 주석, charts.js 빈 막대 주석을 실제(<title> 만)에 맞춤. u2 회귀(파이프라인 처음부터): 해시 다름 2 = 도장만, 캡처 41장 화소 차 0, 대조표 같음, 조각 2,054.5KB(+0.614%) — 회귀 없음. npm test: Python 255 · Node 421 통과.
- (U3-4 후속 · U3-5, 2026-10-20) 리뷰 작은 고침 3 + 26쪽 지명 — 커밋 167f9c9(낡음 검사) · 7cc9fae(edge_band) · 2ac5286(U3-5)
  - U3-4 후속: ① `projectionFromStale`은 내용(도법·매개변수)만 보고 멈춤, 파일 시각 비교는 `projectionFromOlder`로 나눠 build_layers 는 경고만(새로 clone 하면 시각이 뒤섞임), georef-cli 는 둘 중 하나면 다시 맞춤. ② zones `rasterEdgePt` 띠를 순수 함수 `edge_band`로, e ≤ 0 이면 그대로(`arr[-0:]` = 배열 전체). ③ 배열 시험: 띠 안 화소 → 바다, 채우기도 되살리지 않음. p29 세 레이어 다시 뽑아 바이트 같음.
  - 26쪽 지명(`places.py --unit u3` → `build_places --unit u3 --verify`): 582개 — 나라 59(영문 대문자 45 — 튀르키예·조지아·마그레브·서아시아 14개국은 교과서도 영문 없음), 수도 56(영문 44 — 앙카라·니코시아·예루살렘·마그레브·서아시아·캅카스 12 없음), 대양 영문 1(ATLANTIC OCEAN), 도시 347, 바다·호수 41, 하천 22, 섬 25, 산 17(봉우리 9 모두 높이, 산맥 8), 반도·지역 10, 평원·고원 5. 다른 이름(alt) 4: 리스본(리스보아)·스칸디나비아산맥(숄렌산맥)·도나우강(다뉴브강)·아조우해(아조프해). 경고 0, 안 쓴 기호 1(랭스·낭시 사이 작은 도시 원 — 이름 없음).
  - u2 양식 표에서 고친 것(설정 `places`, 까닭은 항목마다): 선 이름 규칙을 크기(5.6~5.8pt) 대신 글자(`북극권`…)로 — 같은 굵은 고딕 5.6pt 에 작은 나라 수도(브라티슬라바·프리슈티나)와 (리스보아)가 있었다, 큰 도시 굵은 고딕 5.6~7.3pt; 괄호 병기 명조 규칙 5.5 → 5.0pt(5.3pt 카닌반도·브르타뉴반도가 빠졌음); 소속 표시 고딕 (에)·(영) 무시, 유빙 한계 #005aaa 무시; 큰 바다 글자(9.5~12pt) joinEm 6(「지 중 해」 글자 사이 4.6em); 수도 영문이 굵은 고딕으로 찍힌 Reykjavik → cityEn; 산 삼각형 ops `^l{3,5}$`(26쪽은 닫는 선까지 l 5개 — 헤클라산). 세계 유산 붉은 글자(70조각)는 u2 규칙 그대로 뺌, 산맥·평원 상자 글자는 u2 landform(굵은 명조) 그대로.
  - **places.py 새 기능 `glue`(설정, u2 에는 없음)**: 흐름 순서로 맞닿은 조각을 묶기 전에 잇는다 — ① 영문 수도의 ş·ă 가 다른 글꼴(MicrosoftSansSerif) 낱자로 끼고 ă 는 ㏇ 코드로 나와 `Chi|ş|in|㏇|u`, `Bucure|ş|ti` → Chişinău·Bucureşti(찾아보기 영문과 같음, `require` = 바꿀 낱자가 낀 묶음만), ② 기울여 한 글자씩 놓은 산 높이 `1|8|9|5` → 나로드나야산 1895. 여러 줄 지명에 한 글자 줄이 끼면 공백 없이 잇는다(세로로 쌓인 「엘 / 베강」 → 엘베강; u2 지명에는 그런 것 없음).
  - `extraNames` 2: 이베리아고원(26쪽 상자 글자인데 찾아보기에 없어 「이베리아 + 고원」으로 나뉘었음), 키엘체(찾아보기에 없어 맞닿은 카토비체와 「카토비체키엘체」로 붙었음).
  - 찾아보기 대조: 105~111쪽 3,346줄 중 26쪽 참조 355줄(이름 352) — **없음 0, 다른 쪽에만 0, 제외 0**(`indexExclude` 비어 있음). inIndex 356/582.
  - Natural Earth 대조(neBox 유럽 [-32, 27, 70, 82], snapKm 30): 옮김 3 — 체복사리 111km(교과서가 니즈니노브고로드 옆에 그림)·니스 59·뉴캐슬어폰타인 50(U3-2 도시 기준점에서 잔차로 빠진 그 도시들). **로스토프**는 NAME_KO 「로스토프」가 야로슬라블 근처 소도시(57.2°N)라 처음엔 1,108km 옮겨졌다 → 새 설정 `neAlias {로스토프: 로스토프나도누}`(build_places `neKey` — snapToNe·neCheck 가 씀, u2 는 표 없음)로 돈강 하구 그대로. 결과 도시·수도 382곳 **중앙값 0.8km · 90% 8.3km · 최대 26km**(40km 넘음 0).
  - places.json 80.5KiB(상한 150KB). 시험 `tests/atlas/units/u3.places.test.mjs` 10개(계획 셋 + 종류별 수·찾아보기 누락 0·26쪽 고친 글자·유산/철도 아님·neAlias·NE 통계·옮김/용량). 검증 그림 `$ATLAS_WORK/shots/c2/p26-europe.png`.
  - georef-cli --unit u3 --all 을 다시 돌림(p26 fit 이 maps_u3.json 보다 오래됐다고 build_places 가 멈춤) — fit 15장 모두 바이트 같음.
  - u2 회귀(places.py·build_places 를 고쳐서): u2 places.py → build_places 다시 → sims/atlas-u2-asia/data/places.json 바이트 같음, `regress_u2 --check`: 해시 다름 2 = 도장만, 캡처 41장 화소 차 0, 대조표 0/9/134/24 같음 — 회귀 없음(그려지는 것이 바뀌지 않아 캡처는 다시 찍지 않음).
  - npm test: Python 262 · Node 431 통과.
  - 교사 확인 항목(U3-10 대조표): 기호 3곳 Natural Earth 로 옮김(체복사리 111km 가 큼), 로스토프 = 로스토프나도누, 유럽 밖 나라·수도 영문 없음(교과서대로), 리스본 다른 이름 「리스보아」(포르투갈어 표기).
- (U3-5 후속 · U3-6, 2026-10-20) 사진·원본 쪽·핀 — 커밋 d209664(U3-5 후속: 한 글자 줄 잇기 규칙 주석 + 「보스니아 헤르체고비나」 공백 회귀 시험, glue 가 ignore 보다 먼저 도는 순서 주석) · U3-6 은 이 기록과 같은 커밋
  - 사진 수(실측, 설정 `photos.expect`): 지형 7·기후 4·도시 10·지속가능 9·통합 6·특집 13 = 49장(설계 어림 약 48). 계획 어림과 다른 것은 특집(12 → 13): 폴라로이드 11 + 07 옆 폴라로이드의 동전 사진 2장을 따로 항목(p33-07a 독일·p33-07b 이탈리아). 도시 10 = 사진 8 + 베네치아 위성 사진(p30-9)·MOSE 방벽(p30-10) — 한 덩어리 후보로 자르면 MOSE 설명 글(y 671~689)이 끼어 둘로 나눔(잇는 화살표가 둘로 갈림, 설명은 같은 글). 26·27쪽 사진 없음. 후보 안 덮임 0, 경고 0.
  - 같은 설명을 두 카드가 함께 씀: 스톡홀름 사진·진공 파이프 그림(p31-1·2), 류블랴나·나무 도시 로고(p31-8·9), 베네치아 위성·MOSE(p30-9·10). 녹색 수도 로고(p31-6)는 옆 「유럽의 녹색 수도」 글상자. 제목만 있는 사진(조선소·M 박물관·코펜하겐)은 그 굵은 글을, 본문만 있는 사진(소피아 앙티폴리스·베네치아·리스본 전기 자동차·류블랴나)은 본문을 caption 으로.
  - 33쪽 폴라로이드 bbox: 기운 사진(1.25~3.75°, 동전 6.75°)의 **안쪽 사각형**(이미지 배치 변환 행렬로 계산 — 틀 귀퉁이 뺌) → 위는 압정 그림 아래부터, 사진 위 번호·제목 글이 안쪽 사각형 밖으로 나가면 그 글까지 넓힘(02·05·10·03·08·11, 설명 글 앞에서 멈춤). 05 는 위로 튀어나온 확대 원(침대 위 국경선)을 살리려 위를 y 344.5까지(원 둘레에 하늘색 쪽 바탕이 조금 낌), 08 은 압정이 원 오른쪽에 걸려 위를 압정 아래로 — 원 윗부분이 잘림. 까닭은 항목마다 `_bbox`. 그 밖: 리스본 전기 자동차(5° 기운 카드)는 왼쪽 아래가 지도 설명 글과 겹쳐 안쪽 사각형, 나무 도시 로고는 뒤 막대그래프 눈금선 조각을 뺀 로고 그림만, 탈린은 왼쪽으로 튀어나온 그린 카드까지.
  - 글 바로잡기: 29쪽 두 줄 제목은 둘째 줄이 번호 원(흰 글자) 아래에서 시작해 상자 하나로 못 가름 → 새 키 `titleOverride`(extract_images, captionOverride 와 같은 꼴, `_why`): 「에펠 탑 아래서 일광욕을 즐기는 사람들」·「리스본 교외의 올리브 농장」. 31쪽 녹색 수도 글의 닫는 따옴표 ’ 가 글꼴 코드 문제로 「烋」 → captionOverride(pdfkit 를 고치면 u2 도장 입력이 바뀌어 고치지 않음 — U3-8 본문 추출에서도 같은 글자가 나올 수 있음). 33쪽 06 설명 「…사용한다」 끝 마침표 없음은 교과서 원문 그대로.
  - 핀: 28쪽 물방울 7(#7251a1, 아래 끝)·29쪽 4·33쪽 번호 원 12(07 이 둘) → pt2lonlat, **짝 못 지은 핀 0**. 번호 없는 핀 짝(km, 상한 = 약 1.3배·최소 40): 올레순 10(게이랑에르피오르 — places 에 없음)·동유럽 평원 162·베수비오산 56·몽블랑산 24·헤클라산 27(간헐천)·벨파스트 64(자이언트 코즈웨이)·류블랴나 30(포스토이나)·파리 57·리스본 16·모스크바 294(사진은 코미 원시림이지만 핀·그래프는 냉대 습윤 모스크바 — 교과서 핀이 랴잔 근처)·아퀴레이리 14(그레니비크 — places 에 없음). 33쪽 07 둘은 번호 안에서 지명으로(베를린 165·로마 75).
  - pins.py 새 기능(u2 결과 바이트 같음): ① `excludeBoxes` — 29쪽 기후 지도 틀 안에 아이슬란드 삽입 지도가 들어 있어 그 핀을 본 지도 fit 으로 되돌리면 틀린다 → 본 지도에서 빼고 항목 `map: p29-climate-iceland`(삽입 fit). ② 같은 번호 핀이 여럿이면 pinNear 항목을 그 번호 핀들 안에서 지명과 헝가리안 짝(번호 글자가 없는 지도는 예전처럼). 07 큰 사진(p33-07, 독일·이탈리아 동전 디자인 전체)은 핀 없음.
  - extract_images: 출력을 파일로 돌리면 cp949 라 경고의 「—」에서 죽던 것 → `__main__` 에서 stdout utf-8.
  - 크기: 사진 jpg 720KB + webp 504KB = 1.20MB(상한 4MB), 대부분 150dpi(조선소 185·카탈루냐 167·녹색 수도 로고 200·탈린 114 — 원본 해상도). 원본 쪽 p026~p033 110dpi 합계 1.50MiB(각 179~199KiB — 183,581~203,591 B, 품질 50~80 — 26쪽 50). photos.json 17KB.
  - 시험: `tests/atlas/units/u3.photos.test.mjs` 6(주제별 수·핀 수 28쪽 7/29쪽 4/33쪽 12·핀이 유럽 안·대표 핀 위치·글/바로잡기·파일 크기), test_images.py 3(같은 번호 짝·번호 없는 지도 그대로·excludeBoxes). 대조표 `units/u3/shots/c3/photos-28~33.jpg` 눈으로 확인.
  - u2 회귀(pins.py·extract_images.py 를 고쳐서): u2 `--photos --pages` 다시 → content/atlas/u2/photos.json·docs/assets/atlas/u2 바이트 같음(git 변경 없음), `regress_u2 --check`: 다름은 도장 2(기존)와 u3 새 파일뿐, 캡처 화소 차 0, 대조표 0/9/134/24 같음.
  - npm test: Python 266 · Node 437 통과.
  - 교사 확인 항목(U3-10 대조표): 베네치아 위성·MOSE 두 카드로 나눔(같은 설명), 07 큰 사진은 핀 없음·동전 둘이 위치도 07 둘, 05 확대 원 둘레 쪽 바탕·08 확대 원 윗부분 잘림, 29쪽 코미 원시림 사진의 핀이 모스크바 남동쪽(교과서대로), 같은 설명을 쓰는 카드 셋(스톡홀름·류블랴나·베네치아).
- (U3-6 후속 · U3-7, 2026-10-20) 그래프 숫자 — 커밋 f9464dc(U3-6 후속) · U3-7 은 이 기록과 같은 커밋
  - U3-6 후속: `regress_u2.mjs` 해시 범위 `docs/assets/atlas` → `docs/assets/atlas/u2`·`docs/assets/atlas/common`(키는 그대로 `repo:docs/assets/atlas/…`). 기준선 hashes.json 의 docs/assets/atlas 키는 u2 87 + common 3 뿐이라 범위 밖 키가 없어 기준선은 그대로 둠. `--check`: 도장만 다름 2(기존)뿐, 회귀 없음. U3-6 기록의 쪽 크기를 KiB 로(179~199KiB — 최대 203,591 B 는 198.8KiB 라 「198」이 아니라 199).
  - 그래프 12개(`config/u3.json charts.items`, 경고 0, `units/u3/tables/charts-u3.json` + 도장, 대조표 `units/u3/shots/c4/charts-29~31.png` 눈으로 확인): 기후 4(파리·리스본·모스크바 = 97쪽 표 printed, 그레니비크 = 잰 값 measured — 기온 ±0.217℃·강수 ±1.087mm), 30쪽 금융 센터 지수(잰 값 ±0.348, 축 생략 [0, 680], 런던 강조)·컨테이너 물동량(±0.126, 로테르담 강조), 31쪽 탈린(묶음 2계열 × 5, 인쇄된 수 — 잰 값과 차 ≤ 0.31)·코펜하겐(묶음 3계열 × 6해, 잰 값 ±0.113)·코펜하겐 2021 고리(인쇄 % 22·11·35·32, 잰 각 합 100.0·차 ≤ 0.21)·류블랴나(±0.171, 류블랴나 강조), 수치 그림 2(프라이부르크 4·소피아 앙티폴리스 8 → table). 계획의 「약 11」은 고리를 따로 세어 12.
  - 새 읽개(charts_read.py, u2 설정은 안 씀): `vbar`(세로 막대 — 계열 하나 → bar(+colors·axisBreak), 둘 이상 → groupedBar; 범주 이름 diagonal(45° 한 글자씩 → cx + cy 로 무리)·row·config; 축 생략은 yAxisBox 를 생략 위 눈금만 담게, 점선 격자 채움 yTickFillColor; 인쇄된 수는 막대 위 글자와 헝가리안 짝), `donut`(색마다 가장 큰 채움 = 조각(같은 색 아이콘과 가름), 가운데 = 안쪽 호 중심 중앙값 — 짧은 바깥 호 하나로 맞추면 도보 11% 조각이 r 25.9 ↔ 27.5 로 흔들려 각 합이 100.98 이 됨, 출력 type pie + donut 비 0.595 — 화면은 원그래프 길), `figure`(칸 상자마다 낱말 줄 → 이름 줄·값 줄, 그림자 글자색 ignoreColors — 프라이부르크 구름은 옅은 파랑 #92c5eb 로 같은 글자를 한 번 더 찍어 box_text 가 「년톤1992년…」이 됨, 위첨자 km2 → km² replace). 출력 모양은 chartCore 가 이미 받는 꼴(U3-3f 시험 모의 자료와 같은 키: bar colors {범주: 색}·axisBreak·axes.y {step, n}, groupedBar series color).
  - climograph: `climateBox`(제목 둘째 줄 「(서안 해양성 기후)」 → climate 「서안 해양성」, 97쪽 표 zone 과 다르면 경고)·제목은 두 상자 글자로 「도시 (기후)」(box_text 로 이으면 「그레니비크(툰드라 기후)」처럼 공백이 빠짐), `climateTable.aliases {파리: 파리(오를리)}`(표가 관측소까지 적음 — 잰 값과 차 0.41℃·1.0mm 로 같은 자료 확인, 출력 tableName), 그레니비크 notInTable. 모두 설정 키가 있을 때만 — u2 charts-u2.json·climate-world.json 다시 뽑아 바이트 같음(도장 charts-u2.stamp 는 입력 스크립트가 바뀌어 정당하게 새 값, u2 build_content 「같음, 그대로」). 97쪽 표 u3 사본 = u2 표와 바이트 같음.
  - 대조표(chart_sheets.py): 세로 막대·묶음 막대 길을 더함(axes.y 가 있을 때만 — u2 가로 막대는 axes.x 라 그대로). 「烋」(’) 는 그래프 글자에 없음(pdfkit 손대지 않음).
  - 시험: test_tables.py `ChartsU3` 8개(u3 설정을 charts_config 모의로 — 부록 표 캐시를 비우고 다시): 12개·경고 0, 기후 4 × 기온 12·강수 12 + 기후 이름·aliases, 탈린 2 × 5 인쇄값, 코펜하겐 3계열 × 6해·고리 합 100(±0.5), 막대 잰 값·정밀도·강조·축 생략, 잰 값마다 precision, 수치 그림, 결정성. npm test: Python 274 · Node 437 통과. `regress_u2 --check` 회귀 없음(도장 2, 캡처 화소 차 0, 대조표 0/9/134/24).
  - 교과서 원문 문제는 `content/atlas/u3/issues.md`(새로): 코펜하겐 단위 「십 만」 ↔ 막대는 만 단위, 그레니비크 표 없음·출처 다름, 파리 = 파리(오를리), 값 없는 막대 4개(잰 값), 탈린 1% 막대 0.87%, 코펜하겐 해 글자 「20202022」.
  - 교사 확인 항목(U3-10 대조표): 코펜하겐 단위(그대로 「십 만 / 대, 명」), 금융 센터 지수·물동량·류블랴나·코펜하겐 잰 값(교과서 숫자 없음), 그레니비크 잰 값, 고리를 원그래프 길(csat stacked pie)로 그림(donut 비는 자료에만), 프라이부르크·소피아 앙티폴리스 표 카드(그림 대신), 프라이부르크 「-37%」의 붙임표는 인쇄 그대로, 소피아 앙티폴리스 표 제목 = 사례 제목.
- (U3-8, 2026-10-20) 주제 내용 — 이 기록과 같은 커밋
  - `content/atlas/u3/topics.json`: 주제 8개, 글은 모두 출처 상자(src·titleSrc·creditSrc·legendTitleSrc·lineLegendTitleSrc·labelSrc)에서 `extract_text.py --unit u3 --fill`로 채움(89칸). 손으로 둔 것은 1단계와 같이 주제 제목(목차)과 블록 제목 「학습 목표」뿐 — `test_text_u3.py`가 막음. 바로가기 이름(view label)도 지면 글(`labelSrc` — 지도 제목·사진 굵은 제목·쪽 소제목)에서.
  - 주제별: 일반도(26, 제목·도법 글) · 색칠하기(27, 목표·본문·활동, 퀴즈) · 지형(28, 핀 7 번호 숨김, 활동하기 1, 출처 「(naturalearthdata.com)」) · 기후(29, 레이어 3 묶음 구분·1월·7월 + 범례 제목·출처, 그래프 마커 4 번호 숨김, 활동하기 2) · 도시의 기능(30, 도시화율 countryClass + 도시 인구 원 = 한 묶음(같은 label), 소제목 6 + 사진 10 + 그래프 3) · 지속가능한 도시(31, 녹색 수도·리스본 두 묶음 + 바로가기, 소제목 6 + 사진 9 + 그래프 6, 활동하기 3) · 통합과 분리(32, EU·분리 독립·벨기에·이탈리아 네 묶음 + 바로가기, 사진 6, 활동하기 4·5) · 특집(33, 번호 핀 12 + 07 큰 사진 블록, 퀴즈 없음, 참고 사이트).
  - **특집 핀 12(계획 11)**: 계획의 11 은 번호 01~11 의 수. 위치도에 07 이 둘(독일·이탈리아 동전 p33-07a·07b, U3-6)이고 u2 마커 꼴은 「사진 하나 = 위치 하나」라 마커 12, 둘 다 번호 7(`photo.pin`). 07 동전 두 마커의 제목 = 07 폴라로이드 굵은 제목(`titleSrc` 「독일과 이탈리아 유로화 동전의 디자인」 — 동전 사진에는 굵은 제목이 없음), 글 = 동전 설명(`src`). 07 큰 사진(동전 디자인 전체, 핀 없음)은 사진 블록. 설정 `expect.markers.feature 12`·시험을 실측에 맞춤.
  - 마커 위치(1단계 C5 규칙 — 지명이 있는 점 대상이고 핀이 멀면 일반도 지명, 교과서 핀은 `textbookLonlat`): 기후 그래프 파리·리스본·모스크바(그래프 도시, 1단계와 같음 — 모스크바 핀은 코미 원시림 사진과 함께 294km 남동쪽), 그레니비크는 places 에 없어 아이슬란드 삽입 핀 그대로. 특집 04 브뤼셀 80km·07 베를린 165km·07 로마 75km·09 프라하 175km·06 스위스 여권은 위치도 번호가 이탈리아 롬바르디아 위라 26쪽 「스위스」 나라 이름 자리. 지형 베수비오산 핀 56km → 산 위치(1단계 구이린 109km 와 같은 꼴, 몽블랑 24km 등 나머지는 그대로). 교과서 원문 문제로 issues.md 7~9.
  - **색칠하기**(`coloring_quiz.mjs --unit u3`): 27쪽 나라 글자 48 → 나라 **46**. 새 설정 키(없으면 1단계 동작 그대로): `ignoreLabels ["(러)"]`(칼리닌그라드 소속 표시), `joinLabels [["보스니아","헤르체고비나"]]`(두 줄 한 나라), `isoByLabel {바티칸: VAT}`(Natural Earth 이름 「바티칸 시국」 초성이 달라 이탈리아로 잡혔음), `capitalByNe`(손글씨 수도의 나라 = 그 지명 150km 안 가장 가까운 Natural Earth 「Admin-0 capital」 나라 — 파두츠·모나코 기호가 오스트리아·프랑스 면에, 니코시아가 북키프로스 면에 떨어졌음), `noCapital {VAT}`(수도 이름 없음 — 문제 화면 「—」). 수도 출처 printed 32·places 12·places+ne 1(프랑스 — 면 안에 파리·모나코 기호)·없음 1(바티칸). 작은 나라 7(안도라·리히텐슈타인·모나코·몰타·산마리노·바티칸·룩셈부르크) 모두 50m·10m 나라에 있고, 110m 에는 6이 없다(세계 보기 k<2 에서는 안 보임 — U3-9 확대 창 판단 거리). 27쪽 글꼴은 u2 값(KCCChassam·KyoboHandwriting 7.5pt) 그대로 맞음.
  - coloring_quiz.mjs 를 고쳐 u2 `content/atlas/u2/coloring.json` 도장(inputsHash)만 새 값(G 끝부터 알려진 도장 차이 그 파일) — u2 coloring_quiz --write → build_content 「같음, 그대로」.
  - **「烋」(’)**: pdfkit·extract_text 는 u2 도장 입력이라 손대지 않음. 31쪽 녹색 수도 글(유일한 烋 자리)은 U3-6 사진 captionOverride 로 이미 바로잡혀 있어 그 글은 사진 블록(p31-6)으로만 쓰고 그 상자를 src 로 다시 뽑지 않음. 시험이 u3 생성물(topics·charts·coloring·layer-*)에 「烋」·「?한글」·「·→h」·「㎢→LN」·「『』→|…}」 없음을 막음. ℃·㎢(km²)·『』는 모두 바르게 나옴.
  - 고침(overrides) 2: 26쪽 제목 「유 럽」→「유럽」(1단계 「아 시 아」와 같음), 31쪽 리스본 글 「전기 자 동차」→「전기 자동차」(그림을 피해 줄 폭이 들쭉날쭉한 왼쪽 맞춤 글상자라 box_text 가 낱말 안 줄바꿈을 공백으로). 27쪽 본문 상자는 글상자 밑에 가려진 아이슬란드 지도 글자가 먼저 나와 `skip "레이캬비크 ㅇㅇㅅㄹㄷ"`.
  - 설정 `content.expect`(markers relief 7·feature 12, chartMarkers climate 4, coloringCountries 46, charts 12)·`expectCredits`(28~32쪽 19개; 28쪽 「(naturalearthdata.com)」은 해가 없어 printed_credits 꼴 밖 → `notPrinted`, 31쪽 녹색 수도 도시 연도 「(2010)」… 은 `notCredits`).
  - **고리(donut) — 하지 않음**: csat-chart.js 2.2.2 `renderPieChart`는 `ctx.moveTo(cx, cy); ctx.arc(cx, cy, maxR, …)` 부채꼴만 그리고 안쪽 반지름 옵션이 없다(StackedGraphData 에 pieScale·pieRotation 뿐). 저수준 렌더러만 쓰는 규칙이라 코펜하겐 2021 고리는 원그래프 길 그대로(donut 0.595 는 자료에만) — chartCore.js 는 바꾸지 않음(u2 원그래프 화소 그대로). 고리로 그리려면 csat 에 안쪽 반지름 옵션을 더하거나(라이브러리 새 판) 시험지 양식 SVG 길(radialBar 처럼)을 새로 만들어야 함 — 교사 대조표 항목.
  - 생성물 `sims/atlas-u3-europe/data/`: topics.json 45.0KB, charts.json 10.1KB(12개 모두 참조), layers.js(레이어 11). 검토 덤프 `$ATLAS_WORK/units/u3/shots/c5/topics.md`를 쪽 렌더(26~33)와 대조 — 빠진 글 없음(지도 안 글자·범례 견본 글은 레이어·그래프 몫), 깨진 글은 위 고침 2 뿐.
  - 시험: `tests/atlas/units/u3.content.test.mjs` 12(계획 둘 + 특집 제목·묶음·범례 제목/출처·마커 위치·색칠하기 수/수도·50m 작은 나라·countryLabels·출처·깨진 글자·고침), `scripts/atlas/tests/test_text_u3.py` 5(원문 대조 `--unit u3 --check`·출처 지면 대조·27쪽 글자 수·dumps 형식·손글 없음), G5 계약 시험 u3 7(조각 크기는 U3-9 에서). npm test: Python 279 · Node 456 통과(건너뜀 1 = u3 조각 없음).
  - u2 회귀(`regress_u2 --check`, src/ 안 바꿔 캡처는 다시 찍지 않음): 해시 다름 2 = 도장만(coloring.json·basemap.json), 캡처 41장 화소 차 0, 대조표 0/9/134/24 같음, 조각 +0.614% — 회귀 없음.
  - 교사 확인 항목(U3-10 대조표): 특집 핀 12(07 둘 다 번호 7, 같은 제목), 위치를 지명으로 옮긴 핀 9(특집 04·06·07·07·09, 지형 베수비오산, 기후 파리·리스본·모스크바 — 특히 06 스위스 여권을 「스위스」 글자 자리로), 바티칸 수도 칸 비움, 코펜하겐 2021 고리가 원그래프로 그려짐, 특집 핀 번호는 보임(지형·기후만 숨김), 리스본 「자동차」·26쪽 「유럽」 고침.
