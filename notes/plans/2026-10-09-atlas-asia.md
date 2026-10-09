# 사회과부도 아틀라스 1단계 (지도 엔진 + Ⅱ 아시아) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 사회과부도 Ⅱ 아시아(16~25쪽)를 d3 기반 웹 아틀라스 조각 `atlas-u2-asia`로 만든다. 5개 도법 전환, 웹지도 느낌, 교과서 지도·주제도·사진·그래프·글을 모두 담고, EMBED_RULES 검사를 통과해야 한다.

**Architecture:** 단계가 셋이다. ① Python(PyMuPDF)으로 PDF에서 글자·도형·이미지를 뽑아 ASCII 작업 폴더에 JSON으로 둔다. ② Node가 앱과 같은 d3 투영 코드로 교과서 지도를 경위도에 맞추고, 주제 도형·지명을 GeoJSON으로 만든다. ③ 공유 엔진(`src/atlas/`)이 단원 조각을 캔버스 바탕층과 SVG 상호작용층으로 그린다. 사진은 Pages의 `docs/assets/atlas/u2/`에 두고 절대 주소로 연결한다.

**Tech Stack:** Vite 6, d3-geo, d3-geo-projection, d3-zoom/selection/interpolate, topojson-client, csat-chart.js(저수준 API), PyMuPDF·numpy·shapely·Pillow, Node 내장 `node:test`(JS 테스트), Python `unittest`(PDF 쪽 테스트).

**Spec:** `notes/specs/2026-10-09-atlas-asia-design.md` (반드시 먼저 읽기). 규칙: `EMBED_RULES.md`.

---

## 공통 사항 (모든 작업자 필독)

- 저장소 루트: `C:\Users\김용현\Desktop\동아출판 사회과 바이브코딩\app` (아래 경로는 모두 여기 기준). PDF: `..\22개정_중학_사회과 부도_교과서_본문.pdf` (인쇄 쪽 = PDF 쪽).
- **ASCII 작업 폴더** `C:\Users\Public\atlas-work\` 에 중간 산출물을 둔다. 이 PC에서는 한글 경로에 대량으로 출력하면 Node·Python 도구가 죽는다(0xC0000409). 최종 산출물만 저장소에 쓴다.
- 조사 산출물: `C:\Users\Public\atlas-survey\`(`dec.py` 복원기, `spans.json`, `r\p001.png`~ 쪽 렌더, `inventory.md`).
- Python은 항상 `python -I`로 실행한다. 내려받은 파일은 `C:\Users\Public\atlas-work\raw\` 아래 출처별 폴더에 둔다.
- git: `git add -A` 금지. 자기 작업 파일만 add한다. 커밋 author는 저장소 로컬 설정(noreply)을 쓴다. 커밋 메시지 끝에는 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`를 붙인다.
- 헤드리스 Chrome 캡처: `--disable-gpu --use-angle=swiftshader --enable-unsafe-swiftshader`, 매번 새 `--user-data-dir`, 출력은 `C:/Users/Public/...` 같은 슬래시 ASCII 경로로 한다.
- UI 문구는 한국어로 쓰고, 이모지는 쓰지 않는다(선 아이콘은 `src/shared/dom.js`의 `icon()`).
- 테스트 실행: JS는 `node --test tests/`, Python은 `python -I -m unittest discover -s scripts/atlas/tests -v`.

## 파일 구조

```
scripts/atlas/
  pdfkit.py            PDF 열기, 글자 복원(dec), 쪽 렌더, 영역 자르기 — 모든 Python 단계가 쓰는 공통 모듈
  extract_text.py      쪽별 글자(복원·병합) → work/text/pNNN.json
  extract_vectors.py   지도 영역의 채움 도형·경위선·눈금 → work/vec/pNNN-<map>.json
  extract_images.py    사진·그림 영역 잘라 내기, 원본 쪽 이미지 → docs/assets/atlas/u2/
  extract_tables.py    부록 표(97쪽 기후값 등) → work/tables/*.json
  maps_u2.json         단원 지도 목록(쪽, 지도 id, 지면 bbox, 종류, 범례 bbox) — 사람이 쓰는 설정
  tests/test_pdfkit.py
  georef.mjs           기준점 → 투영식 맞추기(Nelder–Mead) + TPS 보정 + 잔차 보고
  build_layers.mjs     work/vec → 경위도 GeoJSON(주제 면·기호·흐름선), 육지로 자르기, 단순화
  build_places.mjs     일반도 글자 → 지명(경위도·등급·종류), 찾아보기 대조
  build_basemap.mjs    Natural Earth 110m/50m/10m(아시아 범위) → TopoJSON
  build_content.mjs    content/atlas/u2/*.json + 생성물 → sims/atlas-u2-asia/data/*.json, 스키마 검사
  compare.mjs          교과서 쪽 | 웹 화면 대조표 HTML 생성
src/atlas/
  projections.js       5개 도법, 중심 경도, 전환 보간 (순수 함수)
  lod.js               확대 수준 → 상세도 선택 (순수 함수)
  labels.js            지명 배치: 우선순위 + 충돌 회피 (순수 함수)
  legendState.js       범례 = 필터 상태 (순수 함수)
  renderer.js          캔버스 바탕층 + SVG 상호작용층, d3-zoom, 다시 그리기
  relief.js            음영 이미지 역투영(실패 시 생략)
  layers.js            레이어 종류별 그리기: area, symbol, flow, marker, image
  ui.js                목차, 주제 전환, 카드, 원본 쪽 보기, 말풍선
  charts.js            csat-chart.js 래퍼
  quiz.js              색칠하기·이름 맞히기·세계유산 맞히기
  topic.js             주제 하나를 지도·범례·사이드바에 펼치기(buildTopic)
  atlas.css            .ds-sim .at-… 스타일
sims/atlas-u2-asia/
  index.html           개발 미리보기 틀(템플릿 복사)
  main.js              mount(root): 엔진 + 단원 자료 연결
  data/*.json          build_content.mjs 생성물 (직접 고치지 않음)
content/atlas/u2/      사람이 고치는 주제별 원본(JSON) + overrides
tests/atlas/*.test.mjs 엔진 순수 함수 테스트
docs/assets/atlas/u2/  공개 이미지
```

---

## A. 기반

### Task A1: 의존성과 작업 폴더

**Files:** Modify `package.json`; Create `C:\Users\Public\atlas-work\`(저장소 밖)

- [ ] **Step 1:** 패키지 설치
```bash
npm i d3-geo-projection@4 d3-zoom@3 d3-selection@3 d3-interpolate@3 world-atlas@2
```
- [ ] **Step 2:** 작업 폴더 만들기: `mkdir -p /c/Users/Public/atlas-work/{raw,text,vec,tables,geo,shots}`
- [ ] **Step 3:** `package.json` scripts에 `"test": "node --test tests/"`를 추가한다.
- [ ] **Step 4:** 커밋: `git add package.json package-lock.json && git commit -m "아틀라스: d3 투영·확대 의존성 추가"`

### Task A2: PDF 공통 모듈 `pdfkit.py` (글자 복원)

**Files:** Create `scripts/atlas/pdfkit.py`, `scripts/atlas/tests/test_pdfkit.py`

- [ ] **Step 1: 실패하는 테스트**
```python
# scripts/atlas/tests/test_pdfkit.py
import unittest, sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
import pdfkit

class T(unittest.TestCase):
    def test_decode_known_label(self):
        # 조사에서 확인: 깨진 '광주광역시' 와 같은 코드 → 복원
        self.assertEqual(pdfkit.dec(pdfkit.enc('광주광역시')), '광주광역시')
    def test_page16_has_asia_names(self):
        spans = pdfkit.page_spans(16)
        texts = {s['text'] for s in spans}
        for name in ['베이징', '도쿄', '뉴델리']:
            self.assertTrue(any(name in t for t in texts), name)
    def test_merge_split_label(self):
        parts = [{'text':'히','bbox':[0,0,10,10],'size':9},{'text':'말라야','bbox':[10.5,0,40,10],'size':9}]
        self.assertEqual(pdfkit.merge_spans(parts)[0]['text'], '히말라야')

if __name__ == '__main__': unittest.main()
```
- [ ] **Step 2:** `python -I -m unittest discover -s scripts/atlas/tests -v` → 실패(모듈 없음)를 확인한다.
- [ ] **Step 3: 구현** — `C:\Users\Public\atlas-survey\dec.py`의 표를 옮긴다.
```python
# scripts/atlas/pdfkit.py
import fitz, os
PDF = os.path.join(os.path.dirname(__file__), '..', '..', '..', '22개정_중학_사회과 부도_교과서_본문.pdf')
_doc = None
def doc():
    global _doc
    if _doc is None: _doc = fitz.open(os.path.abspath(PDF))
    return _doc

H = []
for a in range(0xB0, 0xC9):
    for b in range(0xA1, 0xFF):
        try: H.append(bytes([a, b]).decode('cp949'))
        except UnicodeDecodeError: pass
HIDX = {ch: i for i, ch in enumerate(H)}
LATIN_FONTS = ('DIN', 'Garamond', 'Helvetica', 'Myriad', 'Minion', 'Times', 'Arial')

def dec(s):
    o = []
    for ch in s:
        c = ord(ch)
        if c < 0x20: o.append(' ' if c == 1 else chr(c + 31) if 1 < c < 96 else '?')
        elif 1086 <= c < 1086 + len(H): o.append(H[c - 1086])
        elif 344 <= c < 344 + 51: o.append(chr(0x3131 + c - 344))
        elif 0x7f <= c < 0x1100: o.append('?')
        else: o.append(ch)
    return ''.join(o)

def enc(s):  # 테스트용 역변환
    return ''.join(chr(1086 + HIDX[ch]) if ch in HIDX else ch for ch in s)

def page_spans(pno):
    """인쇄 쪽 번호 → [{text,size,font,bbox}] (복원 적용)"""
    out = []
    for b in doc()[pno - 1].get_text('dict')['blocks']:
        for l in b.get('lines', []):
            for s in l['spans']:
                t = s['text'] if any(k in s['font'] for k in LATIN_FONTS) else dec(s['text'])
                t = t.strip()
                if t: out.append({'text': t, 'size': round(s['size'], 1), 'font': s['font'], 'bbox': [round(x, 1) for x in s['bbox']]})
    return out

def merge_spans(spans, gap=2.0):
    """같은 줄·같은 크기에서 gap pt 이내로 붙은 조각을 한 지명으로 합친다(자간 벌린 글자 포함)."""
    spans = sorted(spans, key=lambda s: (round(s['bbox'][1]), s['bbox'][0]))
    out = []
    for s in spans:
        p = out[-1] if out else None
        if p and abs(p['size'] - s['size']) < 0.2 and abs(p['bbox'][1] - s['bbox'][1]) < s['size'] * 0.4 and 0 <= s['bbox'][0] - p['bbox'][2] <= max(gap, s['size'] * 0.6):
            p['text'] += s['text']; p['bbox'][2] = s['bbox'][2]; p['bbox'][3] = max(p['bbox'][3], s['bbox'][3])
        else:
            out.append({**s, 'bbox': list(s['bbox'])})
    return out

def render_clip(pno, bbox, dpi, out_path, images_only=False):
    """지면 bbox(pt)를 dpi로 렌더링해 저장. images_only=True 면 벡터를 숨기고 래스터만."""
    page = doc()[pno - 1]
    pix = page.get_pixmap(dpi=dpi, clip=fitz.Rect(bbox))
    pix.save(out_path)
    return pix.width, pix.height
```
- [ ] **Step 4:** 테스트를 실행해 3개가 통과하는지 본다. `test_page16_has_asia_names`가 실패하면 지명이 쪼개져 있는지 `merge_spans`로 확인하고, 테스트 기대값이 아니라 병합 규칙을 고친다.
- [ ] **Step 5:** 커밋(`scripts/atlas/pdfkit.py scripts/atlas/tests/test_pdfkit.py`).

### Task A3: 단원 지도 목록 `maps_u2.json`

**Files:** Create `scripts/atlas/maps_u2.json`, `scripts/atlas/find_maps.py`

- [ ] **Step 1:** `find_maps.py`를 만든다. 쪽마다 경위선 눈금 글자(`°`, `E`, `N`를 포함한 span)와 큰 클립 영역(`page.get_drawings()`의 `rect` 중 지도 프레임)을 찾아 후보 bbox를 출력한다(`python -I scripts/atlas/find_maps.py 16 25`).
- [ ] **Step 2:** 쪽 렌더(`atlas-survey\r\p016.png` 등)를 보며 지도마다 항목을 쓴다. 형식은 아래와 같다. id는 `p<쪽>-<이름>`으로 한다. kind는 `general|relief|climate|temp-precip|religion|density|growth|resources|exports|trade|heritage|singapore|kashmir|coloring` 중 하나다.
```json
[
  {"id":"p16-asia","page":16,"kind":"general","bbox":[0,0,780,723],"legendBbox":null},
  {"id":"p21-climate","page":21,"kind":"climate","bbox":[20,60,470,420],"legendBbox":[25,330,180,415]}
]
```
- [ ] **Step 3:** 개수 대조 — 16~25쪽 지도는 일반도 3(16·18·19), 색칠하기 1(17), 지형 1(20), 기후 3(21: 구분·1월·7월), 종교 3(22: 분포·싱가포르·카슈미르), 인구 2(23), 산업 2(24) + 교역 활동 1, 세계유산 1(25)이다. `python -I -c "import json;print(len(json.load(open('scripts/atlas/maps_u2.json',encoding='utf-8'))))"`가 17이어야 한다(일반도 3 + 색칠하기 1 + 지형 1 + 기후 3 + 종교 3 + 인구 2 + 산업 3 + 세계유산 1).
- [ ] **Step 4:** 커밋.

---

## B. 경위도 맞추기

### Task B1: 기준점 추출 `extract_vectors.py --controls`

**Files:** Create `scripts/atlas/extract_vectors.py`; Test `scripts/atlas/tests/test_controls.py`

- [ ] **Step 1: 실패하는 테스트**
```python
import unittest, sys, os, json
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
import extract_vectors as ev
class T(unittest.TestCase):
    def test_p16_controls(self):
        cps = ev.controls('p16-asia')
        self.assertGreaterEqual(len(cps), 12)
        for c in cps:
            self.assertTrue(-180 <= c['lon'] <= 180 and -90 <= c['lat'] <= 90)
            self.assertEqual(len(c['xy']), 2)
if __name__ == '__main__': unittest.main()
```
- [ ] **Step 2:** 실패를 확인한다.
- [ ] **Step 3: 구현**
  - 지도 bbox 안 `get_drawings()`에서 경위선을 찾는다. 경위선은 가는 선(width ≤ 0.6), 채움 없음, 회색·청회색 계열이다. 경선·위선은 테두리 눈금 글자(`120°E`, `40°N` 형식, 라틴 글꼴)와 가장 가까운 선의 끝점으로 짝짓는다.
  - 경선 polyline과 위선 polyline의 교차점을 계산한다(선분 교차). 각 교차점에 짝지은 경도·위도를 붙여 기준점 `{xy:[x,y], lon, lat, src:'grid'}`를 만든다.
  - 눈금 글자가 없는 지도(작은 삽입 지도)는 `maps_u2.json`에 `"controls":[{"xy":[..],"lon":..,"lat":..}]`를 손으로 4개 이상 적어 쓴다. 기준은 해안선 특징점(반도 끝, 하구)이다.
  - CLI: `python -I scripts/atlas/extract_vectors.py --controls p16-asia > C:/Users/Public/atlas-work/vec/p16-asia.controls.json`
- [ ] **Step 4:** 테스트가 통과하는지 본다. 18개 지도 모두 기준점 파일을 만든다(`--controls all`).
- [ ] **Step 5:** 커밋.

### Task B2: 투영식 맞추기 `georef.mjs`

**Files:** Create `scripts/atlas/georef.mjs`, `tests/atlas/georef.test.mjs`

- [ ] **Step 1: 실패하는 테스트(합성 자료로 원래 식을 되찾는지)**
```js
// tests/atlas/georef.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { geoAzimuthalEqualArea } from 'd3-geo';
import { fitControls, applyFit } from '../../scripts/atlas/georef.mjs';

test('알려진 방위 정적 투영의 기준점에서 식을 되찾는다', () => {
  const truth = geoAzimuthalEqualArea().rotate([-100, -40]).scale(520).translate([390, 360]);
  const cps = [];
  for (let lon = 40; lon <= 160; lon += 20) for (let lat = -10; lat <= 70; lat += 20) {
    const [x, y] = truth([lon, lat]);
    cps.push({ xy: [x, y], lon, lat });
  }
  const fit = fitControls(cps);
  assert.ok(fit.rmsPt < 0.3, `rms ${fit.rmsPt}`);
  const [x, y] = applyFit(fit, [120, 30]);
  const [tx, ty] = truth([120, 30]);
  assert.ok(Math.hypot(x - tx, y - ty) < 0.5);
});
```
- [ ] **Step 2:** `node --test tests/atlas/georef.test.mjs` → 실패를 확인한다.
- [ ] **Step 3: 구현**
```js
// scripts/atlas/georef.mjs — 교과서 지도 기준점에 투영식을 맞춘다. 앱과 같은 d3 투영을 쓴다.
import * as g from 'd3-geo';
import * as gp from 'd3-geo-projection';

// 후보: [이름, 생성자, 매개변수 → 투영 설정]
const FAMILIES = {
  azimuthalEqualArea: (p) => g.geoAzimuthalEqualArea().rotate([-p[0], -p[1]]),
  azimuthalEquidistant: (p) => g.geoAzimuthalEquidistant().rotate([-p[0], -p[1]]),
  conicEqualArea: (p) => g.geoConicEqualArea().rotate([-p[0], 0]).parallels([p[1], p[2]]),
  conicConformal: (p) => g.geoConicConformal().rotate([-p[0], 0]).parallels([p[1], p[2]]),
  miller: (p) => gp.geoMiller().rotate([-p[0], 0]),
  robinson: (p) => gp.geoRobinson().rotate([-p[0], 0]),
  equirectangular: (p) => g.geoEquirectangular().rotate([-p[0], 0]),
  mercator: (p) => g.geoMercator().rotate([-p[0], 0]),
};
const INIT = { azimuthalEqualArea: [100, 40], azimuthalEquidistant: [100, 40], conicEqualArea: [100, 25, 50], conicConformal: [100, 25, 50], miller: [100], robinson: [100], equirectangular: [100], mercator: [100] };

// 투영 단위 좌표 → 지면 pt: 닮음 변환(배율·회전·이동)을 최소제곱으로 닫힌 해로 구한다
function similarity(src, dst) {
  const n = src.length; let sx = 0, sy = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) { sx += src[i][0]; sy += src[i][1]; dx += dst[i][0]; dy += dst[i][1]; }
  sx /= n; sy /= n; dx /= n; dy /= n;
  let a = 0, b = 0, d = 0;
  for (let i = 0; i < n; i++) {
    const u = src[i][0] - sx, v = src[i][1] - sy, X = dst[i][0] - dx, Y = dst[i][1] - dy;
    a += u * X + v * Y; b += u * Y - v * X; d += u * u + v * v;
  }
  a /= d; b /= d;
  return { a, b, tx: dx - (a * sx - b * sy), ty: dy - (b * sx + a * sy) };
}
const applySim = (s, [u, v]) => [s.a * u - s.b * v + s.tx, s.b * u + s.a * v + s.ty];

function evaluate(family, params, cps) {
  const proj = FAMILIES[family](params).scale(1).translate([0, 0]);
  const src = cps.map((c) => proj([c.lon, c.lat]));
  if (src.some((p) => !p || !isFinite(p[0]))) return { rms: Infinity };
  const sim = similarity(src, cps.map((c) => c.xy));
  let e = 0; const resid = [];
  for (let i = 0; i < cps.length; i++) {
    const [x, y] = applySim(sim, src[i]); const r = Math.hypot(x - cps[i].xy[0], y - cps[i].xy[1]);
    resid.push(r); e += r * r;
  }
  return { rms: Math.sqrt(e / cps.length), sim, resid };
}

// Nelder–Mead (작은 차원용)
function nelderMead(f, x0, step = 5, iters = 400) {
  const n = x0.length; let s = [x0];
  for (let i = 0; i < n; i++) { const x = x0.slice(); x[i] += step; s.push(x); }
  let fs = s.map(f);
  for (let k = 0; k < iters; k++) {
    const idx = fs.map((v, i) => i).sort((i, j) => fs[i] - fs[j]); s = idx.map((i) => s[i]); fs = idx.map((i) => fs[i]);
    const c = Array(n).fill(0); for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) c[j] += s[i][j] / n;
    const xr = c.map((v, j) => v + (v - s[n][j])); const fr = f(xr);
    if (fr < fs[0]) { const xe = c.map((v, j) => v + 2 * (v - s[n][j])); const fe = f(xe); [s[n], fs[n]] = fe < fr ? [xe, fe] : [xr, fr]; }
    else if (fr < fs[n - 1]) { s[n] = xr; fs[n] = fr; }
    else { const xc = c.map((v, j) => v + 0.5 * (s[n][j] - v)); const fc = f(xc);
      if (fc < fs[n]) { s[n] = xc; fs[n] = fc; } else { for (let i = 1; i <= n; i++) { s[i] = s[i].map((v, j) => s[0][j] + 0.5 * (v - s[0][j])); fs[i] = f(s[i]); } } }
  }
  return { x: s[0], fx: fs[0] };
}

/** 기준점 → 가장 잘 맞는 투영식. 반환: {family, params, sim, rmsPt, resid} */
export function fitControls(cps, families = Object.keys(FAMILIES)) {
  let best = null;
  for (const fam of families) {
    const r = nelderMead((p) => evaluate(fam, p, cps).rms, INIT[fam]);
    const ev = evaluate(fam, r.x, cps);
    if (!best || ev.rms < best.rmsPt) best = { family: fam, params: r.x, sim: ev.sim, rmsPt: ev.rms, resid: ev.resid };
  }
  return best;
}

/** 경위도 → 지면 pt */
export function applyFit(fit, lonlat) {
  const p = FAMILIES[fit.family](fit.params).scale(1).translate([0, 0])(lonlat);
  return applySim(fit.sim, p);
}

/** 지면 pt → 경위도 (투영 역함수 + 닮음 역변환) */
export function invertFit(fit, [x, y]) {
  const { a, b, tx, ty } = fit.sim; const det = a * a + b * b;
  const X = x - tx, Y = y - ty; const u = (a * X + b * Y) / det, v = (-b * X + a * Y) / det;
  return FAMILIES[fit.family](fit.params).scale(1).translate([0, 0]).invert([u, v]);
}
```
- [ ] **Step 4:** 테스트가 통과하는지 본다.
- [ ] **Step 5: TPS 보정 + 잔차 보고서** — 이어서 `georef.mjs`에 `export function fitWithTps(cps)`를 추가한다. `fitControls`의 잔차가 0.5pt를 넘으면 잔차 벡터에 thin-plate spline(정규화 λ=1e-3, 선형계는 가우스 소거)을 맞춰 `applyFit` 결과에 더한다. CLI `node scripts/atlas/georef.mjs --all`은 지도마다 `C:/Users/Public/atlas-work/geo/<id>.fit.json`({family, params, sim, tps?, rmsPt})을 쓰고, 표를 출력한다(`id  family  rmsPt  rmsMm`, 1pt = 0.3528mm).
- [ ] **Step 6: 해안선 검증** — `--verify <id>` 옵션을 만든다. Natural Earth 50m 해안선(`world-atlas/land-50m.json`)을 `applyFit`로 지면에 그린 SVG를 그 지도 영역 렌더(`pdfkit.render_clip`, 150dpi) 위에 겹쳐 `C:/Users/Public/atlas-work/geo/<id>.verify.png`로 저장한다(Python 합성 또는 헤드리스 Chrome). 18개 지도 모두 평균 잔차 ≤ 0.5mm여야 한다. 넘는 지도는 기준점을 보강하고, 그래도 넘으면 보고서에 `"approx": true`를 적는다.
- [ ] **Step 7:** 커밋(`scripts/atlas/georef.mjs tests/atlas/georef.test.mjs`).

---

## C. 내용 추출

### Task C1: 주제 면·기호·흐름선 `extract_vectors.py --features` + `build_layers.mjs`

**Files:** Modify `scripts/atlas/extract_vectors.py`; Create `scripts/atlas/build_layers.mjs`, `tests/atlas/layers.test.mjs`

- [ ] **Step 1:** `--features <id>`를 만든다. 지도 bbox 안의 채움 도형(`fill` 있음, 면적 > 4pt²)을 지면 좌표 링 목록과 채움색(hex)으로 내보낸다. `legendBbox`가 있으면 범례 견본 사각형의 색과 옆 글자(복원)를 짝지어 `legend:[{color,label}]`을 만든다. 같은 색은 한 분류로 묶는다. 출력: `work/vec/<id>.features.json` `{legend, polys:[{color, rings}], symbols:[{xy, kind, size, label?}], lines:[{points, width, color}]}`.
- [ ] **Step 2: 실패하는 테스트**
```js
// tests/atlas/layers.test.mjs
import test from 'node:test'; import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
test('p21 기후 구분 레이어: 범례 분류마다 도형이 있고 경위도 범위가 아시아', () => {
  const gj = JSON.parse(readFileSync('sims/atlas-u2-asia/data/layer-p21-climate.json', 'utf8'));
  const classes = new Set(gj.features.map((f) => f.properties.cls));
  assert.ok(classes.size >= 8, `분류 ${classes.size}`);
  for (const f of gj.features) {
    const [lon, lat] = f.properties.centroid;
    assert.ok(lon > 20 && lon < 160 && lat > -15 && lat < 80, f.properties.cls);
  }
});
```
- [ ] **Step 3:** `build_layers.mjs`를 구현한다. `.fit.json`의 `invertFit`(+TPS)로 링 점마다 경위도로 바꾼다. 링을 닫고 d3 감김 방향(바깥 시계 방향)으로 맞춘다. shapely 대신 Node에서 처리하는데, 면 → 육지 자르기는 Python shapely로 하는 편이 안정적이다. 그래서 중간 GeoJSON을 `work/geo/<id>.raw.geojson`으로 쓰고, `python -I scripts/atlas/clip_land.py <id>`(shapely: Natural Earth 10m land와 교차, `simplify(0.02)`)를 호출한 결과를 `sims/atlas-u2-asia/data/layer-<id>.json`에 쓴다. properties는 `{cls, label, color, centroid}`이고 좌표는 소수 3자리다.
- [ ] **Step 4:** 기호(자원·수출품)는 `symbols`를 경위도 점으로 바꿔 `{type:'symbol', kind, label}`로 쓴다. 흐름선(교역)은 `lines`를 경위도 선으로 바꾸고 굵기를 `value`로 남긴다.
- [ ] **Step 5:** 테스트를 통과시키고, 범례 분류 수가 교과서 범례 개수와 같은지 지도마다 출력해 확인한다.
- [ ] **Step 6:** 커밋.

### Task C2: 지명 `build_places.mjs`

**Files:** Create `scripts/atlas/build_places.mjs`, `tests/atlas/places.test.mjs`

- [ ] **Step 1: 실패하는 테스트**
```js
import test from 'node:test'; import assert from 'node:assert/strict'; import { readFileSync } from 'node:fs';
const places = JSON.parse(readFileSync('sims/atlas-u2-asia/data/places.json', 'utf8'));
const near = (p, lon, lat, tol) => Math.abs(p.lon - lon) < tol && Math.abs(p.lat - lat) < tol;
test('대표 지명 위치가 실제와 1.5° 안', () => {
  const want = { 베이징: [116.4, 39.9], 도쿄: [139.7, 35.7], 뉴델리: [77.2, 28.6], 자카르타: [106.8, -6.2], 서울: [127.0, 37.6] };
  for (const [name, [lon, lat]] of Object.entries(want)) {
    const p = places.find((x) => x.name === name);
    assert.ok(p, name); assert.ok(near(p, lon, lat, 1.5), `${name} ${p.lon},${p.lat}`);
  }
});
test('등급(rank)은 1~6, 종류가 정해져 있음', () => {
  for (const p of places) { assert.ok(p.rank >= 1 && p.rank <= 6); assert.match(p.kind, /^(country|capital|city|mountain|river|sea|region|island|desert|plain|other)$/); }
});
```
- [ ] **Step 2:** 구현한다. 16·18·19쪽의 `merge_spans` 결과에서 글자 bbox 중심(지명 기호가 있으면 기호 위치)을 `invertFit`로 경위도로 바꾼다. 종류는 글꼴·색·크기로 정한다(나라: 큰 굵은 글자, 수도: 붉은 사각 기호 옆, 바다: 파란 기울임 등). 판정 규칙은 쪽 렌더를 보며 표로 만들어 코드에 상수로 둔다. rank는 글자 크기 순위로 정한다(가장 큰 것이 1). 18·19쪽(확대 지역도)에만 있는 지명은 rank를 한 단계 낮춘다. 같은 이름이 겹치면 rank가 높은 쪽을 남긴다.
- [ ] **Step 3:** 찾아보기(105~111쪽)를 파싱해 `work/tables/index.json`({name, page, grid})으로 만든다. 지명마다 `inIndex` 표시를 남기고, 찾아보기에 있는 16~19쪽 지명이 places에서 빠졌으면 목록을 출력한다(누락 0개가 목표).
- [ ] **Step 4:** 테스트를 통과시킨다. 커밋.

### Task C3: 이미지 `extract_images.py`

**Files:** Create `scripts/atlas/extract_images.py`; Output `docs/assets/atlas/u2/`

- [ ] **Step 1:** 사진 영역 찾기: 쪽의 래스터 배치(`page.get_image_info(xrefs=True)`)를 위치로 묶어 겹치는 사각형을 합친다(조각난 타일 합치기). 면적 상위 영역을 사진 후보로 삼고, 렌더를 보며 `content/atlas/u2/photos.json`에 확정 목록을 쓴다(`{id, page, bbox, caption, topic}`). caption은 사진 아래·옆의 복원 글자다.
- [ ] **Step 2:** 각 사진을 `render_clip(page, bbox, 150)`으로 렌더링하고, 벡터 글자가 사진 위에 겹치면 그대로 둔다(교과서 모습 그대로). Pillow로 JPEG(q=82)와 WebP(q=80)를 만들어 `docs/assets/atlas/u2/photo/<id>.jpg|.webp`에 쓴다.
- [ ] **Step 3:** 원본 쪽 이미지: 16~25쪽을 110dpi로 렌더링해 `docs/assets/atlas/u2/page/p016.jpg`~에 쓴다(쪽당 200KB 이하).
- [ ] **Step 4:** 23쪽 인구 밀도 음영: 지도 영역을 래스터만 렌더링하고(`images_only`), `p23-density.fit.json`으로 경위도 경계상자를 계산해 `docs/assets/atlas/u2/overlay/p23-density.png`(투명 배경)와 `{bounds, fit}`를 쓴다. 웹에서 이 이미지를 교과서 투영 그대로 지면 좌표 → 경위도 → 화면 투영으로 역투영해 그리기 위해 fit을 함께 넘긴다.
- [ ] **Step 5:** 개수 대조: 지형 8, 기후 5, 종교·문화 약 16, 세계유산 11. 이 수가 `photos.json`과 일치하는지 출력한다.
- [ ] **Step 6:** 커밋(`docs/assets/atlas/u2 content/atlas/u2/photos.json scripts/atlas/extract_images.py`).

### Task C4: 그래프 숫자·표 `extract_tables.py`

**Files:** Create `scripts/atlas/extract_tables.py`, `scripts/atlas/tests/test_tables.py`

- [ ] **Step 1: 실패하는 테스트** — 97쪽 기후 표에서 21쪽 도시 5곳의 월별 기온 12개와 강수량 12개가 모두 숫자인지 확인한다. 도시 이름은 21쪽 그래프 제목에서 읽는다.
```python
import unittest, sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
import extract_tables as et
class T(unittest.TestCase):
    def test_p21_climographs(self):
        cities = et.p21_cities()
        self.assertEqual(len(cities), 5)
        rows = et.climate_table()  # 97쪽
        for c in cities:
            r = rows[c]
            self.assertEqual(len(r['temp']), 12); self.assertEqual(len(r['prec']), 12)
            self.assertTrue(all(isinstance(v, (int, float)) for v in r['temp'] + r['prec']))
if __name__ == '__main__': unittest.main()
```
- [ ] **Step 2:** 구현한다. 97쪽 표는 행·열 글자 위치로 격자를 복원한다. 23·24쪽 그래프는 축 눈금 글자로 값 ↔ 지면 y 변환을 만든 뒤, 막대 사각형 높이와 선 꼭짓점을 값으로 바꾼다. 그래프에 숫자가 인쇄돼 있으면 그 숫자를 우선한다. 출력: `work/tables/charts-u2.json` `{<chartId>: {type, title, unit, source, series:[{name, values}], categories}}`.
- [ ] **Step 3:** 그래프마다 인쇄된 합계·비율(예: 원그래프 합 100%)을 검증하고, 어긋나면 출력한다.
- [ ] **Step 4:** 테스트를 통과시킨다. 커밋.

### Task C5: 주제별 내용 원본 `content/atlas/u2/*.json`과 `build_content.mjs`

**Files:** Create `content/atlas/u2/topics.json`, `content/atlas/u2/overrides.json`, `scripts/atlas/build_content.mjs`, `tests/atlas/content.test.mjs`

- [ ] **Step 1:** 주제 스키마(`topics.json`의 한 항목)
```json
{
  "id": "climate", "title": "기후", "pages": [21],
  "view": {"center": [95, 30], "zoom": 1.6},
  "layers": [{"ref": "layer-p21-climate", "type": "area", "legend": true},
             {"ref": "layer-p21-jan", "type": "area", "group": "month", "label": "1월"},
             {"ref": "layer-p21-jul", "type": "area", "group": "month", "label": "7월"}],
  "markers": [{"id": "c-ulan", "lonlat": [106.9, 47.9], "title": "울란바토르", "photo": "p21-1", "text": "…교과서 문장 그대로…", "chart": "clim-울란바토르"}],
  "blocks": [{"type": "text", "title": "학습 목표", "text": "…"}, {"type": "chart", "ref": "…"}, {"type": "card", "title": "…", "text": "…", "photo": "…"}],
  "quiz": null
}
```
- [ ] **Step 2: 실패하는 테스트**
```js
import test from 'node:test'; import assert from 'node:assert/strict'; import { readFileSync, existsSync } from 'node:fs';
const T = JSON.parse(readFileSync('sims/atlas-u2-asia/data/topics.json', 'utf8'));
test('주제 8개, 쪽 16~25 모두 덮음', () => {
  assert.deepEqual(T.map((t) => t.id), ['general', 'coloring', 'relief', 'climate', 'religion', 'population', 'industry', 'heritage']);
  const pages = new Set(T.flatMap((t) => t.pages)); for (let p = 16; p <= 25; p++) assert.ok(pages.has(p), `${p}쪽`);
});
test('개수: 지형 핀 7, 기후 그래프 마커 4, 세계유산 11 (C3·C4 실측)', () => {
  const by = Object.fromEntries(T.map((t) => [t.id, t]));
  assert.equal(by.relief.markers.length, 7); assert.equal(by.climate.markers.filter((m) => m.chart).length, 4); assert.equal(by.heritage.markers.length, 11);
});
test('빈 글 없음, 참조한 레이어·사진·그래프가 모두 있음', () => {
  for (const t of T) {
    for (const l of t.layers) assert.ok(existsSync(`sims/atlas-u2-asia/data/${l.ref}.json`), l.ref);
    for (const m of t.markers) { assert.ok(m.title && m.text, m.id); if (m.photo) assert.ok(existsSync(`docs/assets/atlas/u2/photo/${m.photo.id}.jpg`), m.photo.id); }
  }
});
```
- [ ] **Step 3:** `build_content.mjs`를 구현한다. `topics.json`에 `overrides.json`(키: `topicId.markerId.field`)을 덮고, 그래프 숫자(`charts-u2.json`)를 붙여 `sims/atlas-u2-asia/data/topics.json`과 `charts.json`을 쓴다. 또 주제가 참조하는 레이어를 모두 정적 import하는 `sims/atlas-u2-asia/data/layers.js`(`import a from './layer-p21-climate.json'; … export default { 'layer-p21-climate': a, … }`)를 생성한다(fetch 금지라 정적 import로 묶는다). 지명은 `places.json`, 바탕 지도는 `basemap.json`(Task D2)을 참조만 한다.
- [ ] **Step 4:** 글 채우기 — 쪽마다 복원 글자(`work/text/pNNN.json`)에서 학습 목표·본문·사진 설명·활동 문항을 **교과서 문장 그대로** 옮겨 `topics.json`을 완성한다. 마커 경위도는 교과서 핀 위치(`invertFit`)로 정한다.
- [ ] **Step 5:** 테스트를 통과시킨다. 커밋.

---

## D. 지도 엔진

### Task D1: 도법 `projections.js`

**Files:** Create `src/atlas/projections.js`, `tests/atlas/projections.test.mjs`

- [ ] **Step 1: 실패하는 테스트**
```js
import test from 'node:test'; import assert from 'node:assert/strict';
import { PROJECTIONS, makeProjection, interpolateProjection } from '../../src/atlas/projections.js';
test('5개 도법', () => assert.deepEqual(Object.keys(PROJECTIONS), ['miller', 'mercator', 'robinson', 'goode', 'equalEarth']));
test('중심 경도 150°E면 150°E가 화면 가운데', () => {
  for (const k of Object.keys(PROJECTIONS)) {
    const p = makeProjection(k, { centerLon: 150, width: 1000, height: 600 });
    const [x] = p([150, 0]); assert.ok(Math.abs(x - 500) < 2, `${k} ${x}`);
  }
});
test('메르카토르는 85° 넘는 점을 잘라냄', () => {
  const p = makeProjection('mercator', { centerLon: 0, width: 1000, height: 600 });
  assert.ok(p.clipExtent() || p.preclip); // 클리핑 설정이 있어야 함
});
test('보간 t=0은 시작 도법, t=1은 끝 도법과 같은 좌표', () => {
  const a = makeProjection('miller', { centerLon: 0, width: 800, height: 500 }), b = makeProjection('robinson', { centerLon: 0, width: 800, height: 500 });
  const m0 = interpolateProjection(a, b)(0), m1 = interpolateProjection(a, b)(1);
  assert.deepEqual(m0([30, 40]).map(Math.round), a([30, 40]).map(Math.round));
  assert.deepEqual(m1([30, 40]).map(Math.round), b([30, 40]).map(Math.round));
});
```
- [ ] **Step 2:** 실패를 확인한다.
- [ ] **Step 3: 구현**
```js
// src/atlas/projections.js — 5개 도법과 전환 보간. 화면 크기에 지구 전체(메르카토르는 ±85°)를 맞춘다.
import { geoMercator, geoEqualEarth, geoProjection, geoGraticule10 } from 'd3-geo';
import { geoMiller, geoRobinson, geoInterruptedHomolosine } from 'd3-geo-projection';

export const PROJECTIONS = {
  miller: { label: '밀러', make: () => geoMiller() },
  mercator: { label: '메르카토르', make: () => geoMercator() },
  robinson: { label: '로빈슨', make: () => geoRobinson() },
  goode: { label: '구드', make: () => geoInterruptedHomolosine() },
  equalEarth: { label: '이퀄어스', make: () => geoEqualEarth() },
};
const SPHERE = { type: 'Sphere' };
const MERC_BOX = { type: 'Polygon', coordinates: [[[-179.99, -85], [179.99, -85], [179.99, 85], [-179.99, 85], [-179.99, -85]]] };

/** key: PROJECTIONS 키, centerLon: 화면 가운데 경도, width/height: 무대 크기, pad: 여백 px */
export function makeProjection(key, { centerLon = 0, width, height, pad = 12 }) {
  const p = PROJECTIONS[key].make().rotate([-centerLon, 0]).precision(0.2);
  const fitObj = key === 'mercator' ? MERC_BOX : SPHERE;
  p.fitExtent([[pad, pad], [width - pad, height - pad]], fitObj);
  if (key === 'mercator') {
    const [[x0, y0], [x1, y1]] = [p([centerLon - 179.99, 85]), p([centerLon + 179.99, -85])];
    p.clipExtent([[Math.min(x0, x1), y0], [Math.max(x0, x1), y1]]);
  }
  p.key = key; p.centerLon = centerLon;
  return p;
}

/** 두 투영 사이를 점마다 화면 좌표로 선형 보간하는 임시 투영(전환 애니메이션용) */
export function interpolateProjection(a, b) {
  return (t) => {
    const raw = (lambda, phi) => {
      const lon = (lambda * 180) / Math.PI, lat = (phi * 180) / Math.PI;
      const pa = a([lon, lat]), pb = b([lon, lat]);
      if (!pa || !pb) return [NaN, NaN];
      return [pa[0] * (1 - t) + pb[0] * t, -(pa[1] * (1 - t) + pb[1] * t)];
    };
    const p = geoProjection(raw).scale(1).translate([0, 0]).center([0, 0]);
    // geoProjection 은 raw 결과에 scale·translate 를 적용하므로 1·0 으로 두고, y 부호를 되돌린다
    const out = (ll) => { const r = p(ll); return r && [r[0], -r[1]]; };
    out.stream = p.stream; // 경로 그리기용(근사): 보간 중에는 성능상 단순화된 바탕만 그린다
    out.raw = raw;
    return out;
  };
}

export const graticule = geoGraticule10;
```
  > 주의: 테스트 3번째(`clipExtent`)는 위 구현에서 참이다. `interpolateProjection`의 `stream`은 d3-geo 경로에서 y 부호가 뒤집혀 보일 수 있다. 렌더러(Task D3)는 보간 중에 `d3.geoPath(out)`을 쓰지 말고, 바탕 도형의 미리 단순화한 점 배열을 `out()`으로 직접 찍어 그린다.
- [ ] **Step 4:** 테스트를 통과시킨다. 커밋.

### Task D2: 바탕 지도 자료 `build_basemap.mjs` + 상세도 `lod.js`

**Files:** Create `scripts/atlas/build_basemap.mjs`, `src/atlas/lod.js`, `tests/atlas/lod.test.mjs`

- [ ] **Step 1:** Natural Earth를 받는다(`C:/Users/Public/atlas-work/raw/ne/`). `ne_10m_land`, `ne_10m_admin_0_countries`(한국어 이름 `NAME_KO`), `ne_10m_rivers_lake_centerlines`, `ne_10m_lakes`, 50m 동일 세트, 그리고 `world-atlas`의 110m를 쓴다. `npx -y mapshaper@0.6.102`로 아시아 범위(`-clip bbox=20,-15,160,80`) 10m과 전 세계 50m·110m를 단순화해 TopoJSON 하나 `sims/atlas-u2-asia/data/basemap.json`(객체: `land110, countries110, land50, countries50, rivers50, lakes50, land10a, countries10a, rivers10a, lakes10a`)으로 합친다. 목표 크기는 900KB 이하다.
- [ ] **Step 2: 실패하는 테스트**
```js
import test from 'node:test'; import assert from 'node:assert/strict'; import { pickDetail } from '../../src/atlas/lod.js';
test('확대 수준별 상세도', () => {
  assert.equal(pickDetail(1), '110'); assert.equal(pickDetail(2.4), '50'); assert.equal(pickDetail(6, true), '10a'); assert.equal(pickDetail(6, false), '50');
});
```
- [ ] **Step 3: 구현**
```js
// src/atlas/lod.js — 확대 수준 k 와 화면이 단원 범위 안인지에 따라 쓸 상세도를 고른다
export function pickDetail(k, inUnit = false) {
  if (k < 2) return '110';
  if (k >= 4 && inUnit) return '10a';
  return '50';
}
```
- [ ] **Step 4:** 테스트를 통과시킨다. 커밋.

### Task D3: 렌더러 `renderer.js`

**Files:** Create `src/atlas/renderer.js`, `src/atlas/atlas.css`; Test: 개발 미리보기 + 캡처

인터페이스(다른 작업이 이 이름을 쓴다):
```js
// createMap(stage, { basemap, unitBounds }) → map
// map.setProjection(key, { animate = true })        // 'miller' | 'mercator' | 'robinson' | 'goode' | 'equalEarth'
// map.setCenterLon(0 | 150)
// map.flyTo({ center: [lon, lat], zoom }, ms = 700)
// map.fitBounds([[lon0, lat0], [lon1, lat1]])
// map.addLayer(layer) / map.removeLayer(id) / map.clearLayers()   // layer: layers.js 가 만든 객체 {id, z, draw(ctx, path, view), drawSvg?(g, project, view), hit?(xy)}
// map.on('click' | 'hover' | 'viewchange', fn)       // fn({ lonlat, xy, feature?, layerId? })
// map.project(lonlat) → [x, y] | null ; map.invert(xy) → lonlat
// map.view → { key, centerLon, k, x, y, width, height }
// map.setOptions({ graticule, labels, relief })
// map.redraw()
// map.destroy()
```
- [ ] **Step 1:** DOM은 `stage`에 `h('canvas', {class:'ds-canvas at-base'})`와 SVG `at-overlay`(absolute, 같은 크기)를 붙인다. `ResizeObserver`로 크기를 맞추고 devicePixelRatio를 반영한다.
- [ ] **Step 2:** 그리기 순서: 바다(`#aad3df`, Sphere 채움; 메르카토르는 클립 상자) → relief(Task D5) → 육지(`#f2efe9`) → area 레이어 → 호수(`#aad3df`)·하천(`#7fb3d5`, 0.6px) → 국경(`#9a8f7f`, 0.6px, 점선 아님) → 경위선(`rgba(30,42,74,.18)`, 0.5px) → 해안선 강조(`#8fb5c2`, 0.8px). 상세도는 `pickDetail(view.k, 화면 중심이 unitBounds 안)`으로 고른다.
- [ ] **Step 3:** 확대·이동: d3-zoom을 SVG에 걸고(scaleExtent [1, 40]), 진행 중에는 캔버스 `transform`으로만 움직인다(CSS transform 대신 ctx 재그리기 없이 drawImage 스냅샷). 끝나면(`end`, 120ms 디바운스) 전체를 다시 그린다.
- [ ] **Step 4:** 도법 전환: `interpolateProjection`으로 0.6초 동안 110m 육지 점 배열만 그린다. 끝나면 새 투영으로 전체를 그린다. 화면 중심 경위도와 k는 유지한다.
- [ ] **Step 5:** 클릭·호버: SVG 레이어 요소는 자기 이벤트로 처리한다. 캔버스 면은 `d3.geoContains`로 맞힌다(같은 위치 레이어 z 역순).
- [ ] **Step 6:** `atlas.css`: 모든 선택자는 `.ds-sim .at-…`로 쓰고, 오버레이는 `position:absolute; inset:0`, z-index ≤ 10으로 한다.
- [ ] **Step 7:** 검증: `sims/atlas-u2-asia/main.js`에 바탕 지도만 띄우는 임시 mount를 두고, `npm run embed -- atlas-u2-asia`로 통과와 크기를 출력한다. 미리보기를 1440×900·1024×768로 캡처해 5개 도법과 150°E 중심을 확인한다. 도법 전환 시간과 확대 후 다시 그리기 시간(console.time)이 1024×768 소프트웨어 렌더에서 200ms 이하여야 한다.
- [ ] **Step 8:** 커밋.

### Task D4: 지명 배치 `labels.js`

**Files:** Create `src/atlas/labels.js`, `tests/atlas/labels.test.mjs`

- [ ] **Step 1: 실패하는 테스트**
```js
import test from 'node:test'; import assert from 'node:assert/strict'; import { placeLabels } from '../../src/atlas/labels.js';
const measure = (t, size) => t.length * size * 0.9;
test('겹치면 rank 높은(숫자 작은) 지명만 남음', () => {
  const pts = [{ name: '베이징', rank: 1, xy: [100, 100], size: 13 }, { name: '톈진', rank: 3, xy: [104, 102], size: 11 }];
  const out = placeLabels(pts, { width: 800, height: 600, measure, k: 1 });
  assert.deepEqual(out.map((o) => o.name), ['베이징']);
});
test('확대하면 작은 지명도 나타남(minK)', () => {
  const pts = [{ name: '톈진', rank: 4, xy: [300, 300], size: 11 }];
  assert.equal(placeLabels(pts, { width: 800, height: 600, measure, k: 1 }).length, 0);
  assert.equal(placeLabels(pts, { width: 800, height: 600, measure, k: 4 }).length, 1);
});
test('화면 밖 지명은 제외', () => {
  assert.equal(placeLabels([{ name: 'A', rank: 1, xy: [-50, 10], size: 12 }], { width: 800, height: 600, measure, k: 1 }).length, 0);
});
```
- [ ] **Step 2: 구현**
```js
// src/atlas/labels.js — 우선순위(rank)와 확대 수준으로 지명을 골라 겹치지 않게 놓는다.
// rank 1(나라·대양) ~ 6(작은 지명). rank r 은 k ≥ MIN_K[r] 일 때부터 보인다.
const MIN_K = { 1: 1, 2: 1, 3: 1.8, 4: 3, 5: 5, 6: 9 };
const OFFSETS = [[0, -1], [1, 0], [-1, 0], [0, 1]]; // 위·오른쪽·왼쪽·아래 (기호 있는 지명)

export function placeLabels(points, { width, height, measure, k, pad = 2 }) {
  const placed = []; const boxes = [];
  const sorted = points.filter((p) => k >= (MIN_K[p.rank] ?? 9)).sort((a, b) => a.rank - b.rank || b.size - a.size);
  for (const p of sorted) {
    const w = measure(p.name, p.size), hgt = p.size * 1.2;
    const cands = p.symbol ? OFFSETS.map(([dx, dy]) => [p.xy[0] + dx * (w / 2 + 6), p.xy[1] + dy * (hgt / 2 + 4)]) : [p.xy];
    for (const [cx, cy] of cands) {
      const b = [cx - w / 2 - pad, cy - hgt / 2 - pad, cx + w / 2 + pad, cy + hgt / 2 + pad];
      if (b[0] < 0 || b[1] < 0 || b[2] > width || b[3] > height) continue;
      if (boxes.some((o) => b[0] < o[2] && b[2] > o[0] && b[1] < o[3] && b[3] > o[1])) continue;
      boxes.push(b); placed.push({ ...p, at: [cx, cy] }); break;
    }
  }
  return placed;
}
```
- [ ] **Step 3:** 테스트를 통과시킨다. 렌더러 연결: SVG `text`(class `at-label at-label-<kind>`, 흰 halo는 `paint-order:stroke`)로 그리고, `measure`는 오프스크린 캔버스 `measureText`로 한다. 커밋.

### Task D5: 지형 음영 `relief.js`

**Files:** Create `src/atlas/relief.js`; Asset `docs/assets/atlas/common/relief-4096.jpg`

- [ ] **Step 1:** Natural Earth `SR_50M`(등장방형)을 받아 4096×2048 JPEG(q=80)로 줄여 `docs/assets/atlas/common/relief-4096.jpg`에 둔다. 공개 주소 상수는 `RELIEF_URL = 'https://yhk1m.github.io/donga-social-sims/assets/atlas/common/relief-4096.jpg'`이다.
- [ ] **Step 2:** 구현: `loadRelief()`가 `new Image()`에 `crossOrigin='anonymous'`를 걸고 로드한다. 성공하면 오프스크린 캔버스에 그려 `getImageData`를 캐시한다. 예외(교차 출처)가 나면 `null`을 돌려주고 콘솔에 한 줄 남긴다. `drawRelief(ctx, projection, view, data)`는 화면 2px 격자마다 `projection.invert`로 경위도를 구해 이미지 픽셀을 표본으로 뽑고 `multiply` 합성(투명도 .45)한다. 육지 마스크 안에서만 그린다(육지 경로로 clip).
- [ ] **Step 3:** 확대·이동 중에는 다시 계산하지 않고, 끝났을 때만 계산한다. 1024×768에서 계산 시간 ≤ 150ms를 측정해 남긴다(넘으면 격자를 3px로).
- [ ] **Step 4:** 커밋.

### Task D6: 레이어 종류 `layers.js` + 범례 상태 `legendState.js`

**Files:** Create `src/atlas/layers.js`, `src/atlas/legendState.js`, `tests/atlas/legendState.test.mjs`

- [ ] **Step 1: 실패하는 테스트(범례 = 필터)**
```js
import test from 'node:test'; import assert from 'node:assert/strict'; import { createLegendState } from '../../src/atlas/legendState.js';
test('분류를 누르면 그것만 활성, 다시 누르면 해제', () => {
  const s = createLegendState(['A', 'B', 'C']);
  assert.equal(s.isActive('B'), true); s.toggle('B');
  assert.equal(s.isActive('A'), false); assert.equal(s.isActive('B'), true);
  s.toggle('B'); assert.equal(s.isActive('A'), true);
});
test('다른 분류를 누르면 그쪽으로 옮겨감', () => {
  const s = createLegendState(['A', 'B']); s.toggle('A'); s.toggle('B');
  assert.equal(s.isActive('A'), false); assert.equal(s.isActive('B'), true);
});
```
- [ ] **Step 2: 구현**
```js
// src/atlas/legendState.js — 범례 하나를 누르면 그 분류만 남기고 나머지는 흐리게. 다시 누르면 전체.
export function createLegendState(classes) {
  let only = null; const subs = new Set();
  return {
    classes,
    isActive: (c) => only === null || only === c,
    selected: () => only,
    toggle(c) { only = only === c ? null : c; subs.forEach((f) => f(only)); },
    reset() { only = null; subs.forEach((f) => f(only)); },
    onChange(f) { subs.add(f); return () => subs.delete(f); },
  };
}
```
- [ ] **Step 3:** `layers.js`: 레이어를 만드는 함수를 둔다(모두 Task D3 인터페이스 `{id, z, draw, drawSvg, hit}`를 반환).
  - `areaLayer(id, geojson, { legend: legendState, colorOf: f => f.properties.color, dimAlpha: 0.15 })`: 캔버스 채움. 비활성 분류는 투명도 0.15로 그린다.
  - `symbolLayer(id, points, { iconOf })`: SVG 기호(선 아이콘·원). 크기는 `size`를 따른다.
  - `flowLayer(id, lines, { widthOf })`: SVG 곡선(이차 베지어), 화살표는 `marker`.
  - `markerLayer(id, markers, { onPick })`: SVG 핀(번호 표시 가능). 누르면 `onPick(marker)`를 부르고, 선택 시 강조한다.
  - `imageLayer(id, { url, fit, bounds, opacity })`: 교과서 투영 이미지를 화면 투영으로 역투영해 그린다(relief와 같은 방식, 교차 출처 실패 시 생략).
- [ ] **Step 4:** 테스트를 통과시킨다. 커밋.

### Task D7: 사이드바 UI `ui.js` + 그래프 `charts.js` + 퀴즈 `quiz.js`

**Files:** Create `src/atlas/ui.js`, `src/atlas/charts.js`, `src/atlas/quiz.js`

- [ ] **Step 1:** `ui.js`(`createShell`의 `panel`, `addBlock`, `h()` 사용 — innerHTML 금지)
  - `topicNav(panel, topics, onSelect)`: 목차(세로 목록, 현재 주제 강조, 쪽 표시)
  - `mapTools(stage, map)`: 무대 오른쪽 위 도구 묶음. 도법 5개(`ds-seg`), 대서양/태평양, 경위선·지명·음영 체크, 확대·축소·전체 보기 버튼, 축척 막대(왼쪽 아래)
  - `legendBlock(panel, legend, items)`: 색 견본 + 이름, 누르면 `legend.toggle`
  - `detailCard(panel)`: `.show({title, photo, text, chart})`. 사진은 `h('img', {src: ASSET_BASE + path, loading:'lazy', alt})`이고, 실패하면 숨긴다.
  - `pageViewer(stage)`: 「원본 쪽 보기」 오버레이(absolute, z-index 20). 쪽 이미지와 닫기 버튼이 있다.
  - `tooltip(stage)`: 마우스 위치의 이름 말풍선(absolute)
  - `ASSET_BASE = 'https://yhk1m.github.io/donga-social-sims/assets/atlas/'`
- [ ] **Step 2:** `charts.js`: csat-chart.js의 `renderLineGraph`와 `createDefaultGraphOptions`만 import한다(`CsatChart` 클래스 import 금지 — 외부 글꼴 코드가 딸려 온다). 막대·누적 막대·원·피라미드가 저수준 API에 있는지 `node_modules/csat-chart.js/README.md`에서 확인한다. 없는 형식은 SVG를 `h()`로 직접 그리고, 시험지 양식(검은 선, 점선 격자, 명조 대체 글꼴 목록)을 맞춘다. 공개 함수는 `renderChart(container, spec)`이고, spec은 Task C4 형식이다.
- [ ] **Step 3:** `quiz.js`:
  - `coloringQuiz(map, countriesLayer, names)`: 나라를 누르면 색 팔레트 중 선택색으로 칠한다(상태는 메모리만). 「이름 맞히기」 모드는 무작위 나라를 강조하고 보기 4개를 준다.
  - `heritageQuiz(markers)`: 유산 사진을 보고 나라·종교를 고른다.
  - localStorage는 쓰지 않는다.
- [ ] **Step 4:** `npm run embed`로 통과를 확인한다. 커밋.

---

## E. 아시아 단원 조각

### Task E1: 조각 조립 `sims/atlas-u2-asia/`

**Files:** Create `sims/atlas-u2-asia/index.html`(템플릿 복사), `sims/atlas-u2-asia/main.js`; Modify `src/registry.js`

- [ ] **Step 1:** registry의 `SIMS`에 `{ id: 'atlas-u2-asia', book: 'atlas', unit: 'Ⅱ. 아시아', page: 16, title: '사회과부도 아시아', kind: '지도' }`를 추가한다.
- [ ] **Step 2:** `main.js`
```js
import { createShell } from '../../src/shared/shell.js';
import '../../src/atlas/atlas.css';
import { createMap } from '../../src/atlas/renderer.js';
import { topicNav, mapTools, legendBlock, detailCard, pageViewer, tooltip } from '../../src/atlas/ui.js';
import { buildTopic } from '../../src/atlas/topic.js';
import basemap from './data/basemap.json';
import places from './data/places.json';
import topics from './data/topics.json';
import charts from './data/charts.json';
import layerData from './data/layers.js'; // build_content 가 만드는 { 'layer-p21-climate': {...}, ... } 정적 import 모음

export default function mount(root) {
  const { stage, panel } = createShell(root, 'atlas-u2-asia');
  const map = createMap(stage, { basemap, places, unitBounds: [[20, -15], [160, 80]] });
  mapTools(stage, map);
  const card = detailCard(panel); const viewer = pageViewer(stage); tooltip(stage, map);
  const show = (t) => buildTopic({ map, panel, card, viewer, topic: t, charts, layers: layerData, legendBlock });
  topicNav(panel, topics, show);
  show(topics[0]);
}
```
- [ ] **Step 3:** `src/atlas/topic.js`의 `buildTopic`을 구현한다.
  1. `map.clearLayers()`
  2. 주제의 layers를 `layers.js` 함수로 추가한다(area는 legend 상태 생성 후 `legendBlock`).
  3. markers는 `markerLayer`로 추가하고, `onPick`이면 `card.show`를 부른다.
  4. `blocks`를 사이드바에 렌더한다(text·chart·card·「원본 쪽 보기」 버튼).
  5. `map.flyTo(topic.view)`
  6. quiz가 있으면 시작한다.
  - 주제를 바꿀 때 이전 블록은 지운다. 목차와 도구는 유지한다.
- [ ] **Step 4:** `npm run embed -- atlas-u2-asia` 통과와 크기(≤ 3MB, 목표 1~2MB)를 확인한다. 미리보기를 캡처해 8개 주제를 모두 확인한다. 커밋.

### Task E2: 교과서 대조표 `compare.mjs`

**Files:** Create `scripts/atlas/compare.mjs`

- [ ] **Step 1:** 주제마다 개발 미리보기를 `?topic=<id>&proj=robinson`(import.meta.env.DEV에서만 읽음)으로 열어 1440×900으로 캡처한다(`C:/Users/Public/atlas-work/shots/`).
- [ ] **Step 2:** `C:/Users/Public/atlas-work/compare-u2.html`을 만든다. 행마다 「교과서 쪽(page jpg) | 웹 캡처 | 확인 항목(분류 수·마커 수·사진 수·글 일치 체크 목록)」을 둔다. 확인 항목 수치는 생성물에서 자동으로 채운다.
- [ ] **Step 3:** 사용자에게 대조표 경로를 알리고 승인을 기다린다(이 단계에서 공개하지 않는다).

### Task E3: 성능·이미지 경로·공개

- [ ] **Step 1:** 1024×768 성능을 측정한다(도법 전환, 확대 후 다시 그리기, 음영 계산, 주제 전환). 결과를 `notes/perf-atlas-u2.md`에 쓴다.
- [ ] **Step 2:** 이미지를 먼저 공개한다: `git add docs/assets/atlas && git commit && git push` 뒤 모든 사진·쪽·음영 주소가 200인지 `curl`로 확인한다(조각은 절대 주소를 쓰므로 이미지가 먼저 올라가야 한다).
- [ ] **Step 3:** 다른 출처 페이지(로컬 `file://` 미리보기)에서 음영과 밀도 이미지가 그려지는지, 아니면 오류 없이 생략되는지 확인한다.
- [ ] **Step 4:** 사용자가 대조표를 승인하면 `npm run release -- atlas-u2-asia --note "사회과부도 아시아 첫 공개"`를 실행하고 커밋·푸시한 뒤, `https://yhk1m.github.io/donga-social-sims/atlas-u2-asia/1/`이 200인지 확인한다.

---

## 실행 순서와 병렬화

- A1 → A2 → A3 → B1 → B2 (경위도 맞추기가 C의 전제)
- D1, D2, D4, D6(legendState)는 A·B와 독립이라 병렬로 할 수 있다.
- C1~C4는 B2 이후 병렬로 할 수 있다. C5는 C1~C4가 끝난 뒤다.
- D3 → D5 → D6(layers) → D7 → E1 → E2 → E3

## 실행 중 결정 (2026-10-09)

- 아시아 지도는 17장이다(A3 Step 3의 목록 합계). NEOM은 카드로만 다룬다.
- `p22-kashmir`는 교과서 도형이 양식화돼 있어 경위도 맞추기가 불가능하다(오차 20pt 이상). 분쟁 지역 도형은 Natural Earth `ne_10m_admin_0_disputed_areas`·국경에서 가져오고, 교과서의 색·범례·이름만 쓴다. 지도에는 「위치: 실제 경계 자료」라고 표시한다.
- `pdfkit.dec()`의 알려진 복원 오류: `·`→`h`, `℃`→`?`, `㎢`→`LN`, `『』`→`|…}`. 글 추출(C5) 전에 고친다.
- 경위도 기호는 `°`와 `˚`(U+02DA)를 모두 인식한다.
- georef CLI는 `scripts/atlas/georef-cli.mjs`다(`--all`, `--verify <id|all>`). 라이브러리 `georef.mjs`는 `fitControls/applyFit/invertFit/fitWithTps/makeConverter/inControlHull/robustFit`을 내보낸다. 대량 변환에는 `makeConverter(fit)`를 쓰고, `null`(변환 실패·수렴 실패)을 처리한다. TPS 보정은 기준점 볼록 껍질 밖에서 0으로 줄어든다. 작업 폴더는 env `ATLAS_WORK`(기본 `C:/Users/Public/atlas-work`)이고, 경위도 맞추기 제외 지도는 maps_u2.json의 `"georef": false`로 표시한다.
- JS 테스트 명령은 `node --test "tests/**/*.test.mjs"`(`npm test`가 Python과 함께 실행한다).
- (C1) 주제 레이어 결정:
  - `p24-exports`는 기호가 아니라 **면 레이어**다(국가별 주요 수출품 5분류 단계구분도).
  - `p21-climate`의 기후 구분은 벡터가 아니라 **래스터 타일**이라, 이미지만 렌더해 화소를 범례색(Lab ΔE)으로 분류해 면으로 만든다. 고산 기후 빗금은 벡터 윤곽(#ba703d)이라 별도 분류(`pattern:'hatch'`)로 둔다.
  - `p21-jan`·`p21-jul` = 강수량 7단계 면(래스터 분류) + 등온선(값 붙은 선, `type:'isotherm'`). 기온은 면이 아니라 선이다.
  - `p24-trade`는 흐름선(수입·수출 각 상위 10개국, 굵기 4단계 = 범례 선 굵기 0.6/1.0/1.5/2.0pt) 외에 **우리나라와의 교역액 단계구분도(7단계 면)**도 담는다. 짙은 초록·짙은 빨강 화살표는 별도 범례가 아니라 초록 나라 위에 겹친 수입·수출이다. 상대국 끝점은 features.py CONFIG에 손으로 적었다.
  - `p23-growth`의 중국 면 색 #ffe4b9는 범례에 없는 색이라 '0~0.5'(#f5eeba)로 대응시킨다(중국 2021 증가율 약 0.1%).
  - `p22-kashmir` 면 = Natural Earth 분쟁 지역의 **관할국**(파키스탄 지배·인도 지배·중국–인도 분쟁 지역), 색은 교과서 각국 주장 국경 색을 옅게 한 것. 주장 국경은 NE 관점별(POV) 국가 경계, 정전 라인은 NE Line of control. 종교 비율 3분류는 대응 자료가 없어 **범례 항목만**(`geometry:false`) 둔다.
  - 용량 예산: 주제 레이어 11개 합계 약 624KiB(목표 ~600KB에서 조정), 테스트 상한 650KB. 맞추려고 지도마다 단순화 허용치·최소 조각 면적을 build_layers.mjs `LAYERS`에 둔다.
  - `p22-singapore`·`p20-relief`는 fit 파일이 `approx: true`라 레이어 맨 위 properties 에도 `approx: true`가 실린다 → UI에 「위치 근사」 표시.
  - 기호 레이어(자원·싱가포르 사원·인구 막대)의 모든 기호에 `label`(말풍선 글: 이름이 있으면 이름, 없으면 범례 항목)을 두고, 이름이 있는 것만 `name`도 둔다.
  - 아시아 범위(경도 20~160, 위도 −15~80) 밖 꼭짓점은 모두 실제 땅이다: 추코트카(180° 동쪽, 경도 −180~−164)·캄차카(160~180°E)·세베르나야제믈랴(80~81°N).
  - (C1 코드 정리) 레이어 설정은 `scripts/atlas/config/u2.json` 한 곳(`maps`가 maps_u2.json 을 가리킴): 지도·mode·tol·minArea·expectLegend·색 대응·교역 상대국 끝점·카슈미르 분류. 다음 단원은 config/uN.json 을 새로 쓴다(env `ATLAS_UNIT_CONFIG`). 흐름선 굵기 단계·단위는 범례에서 읽는다. Python 모듈: atlas_common(작업 폴더·설정·색·도형) / legend / zones / symbols / lines / features(진입점) / clip_land / kashmir.
  - 면 레이어는 분류들을 하나의 덮개로 다룬다: 육지 자르기 → 범례 순서 우선으로 겹침 제거 → `shapely.coverage_simplify`(shapely ≥ 2.1, 허용치 = tol × coverageTolFactor 1.8) → 0.001° 격자(set_precision) → 다른 분류와 안 겹치는 작은 구멍만 메움. 결과: 모든 면 유효, 분류 간 겹침 < 0.0001°². 선은 날짜변경선에서 MultiLineString 으로 나눈다. 원통 도법 지도(p24-trade)는 역변환 가능한 지면 범위(`<map>.domain.json`)로 먼저 잘라 꼭짓점을 잃지 않는다(실패 점 > 1% 또는 면 고리 점 손실이면 빌드 실패). 합계 약 615KB.
- (C2) 지명 결정:
  - 파이프라인: `python -I scripts/atlas/places.py`(지면 pt 지명·기호 → `$ATLAS_WORK/text/places-<map>.json`, 찾아보기 → `$ATLAS_WORK/tables/index.json`) → `node scripts/atlas/build_places.mjs [--extract] [--verify]`(경위도·합치기·등급 → `sims/atlas-u2-asia/data/places.json`, 검증 그림 `$ATLAS_WORK/shots/c2/<map>.png`). 규칙은 모두 `config/u2.json`의 `places`(역할별 글꼴·색·크기 표, 종류 접미 정규식, 기호 분류, 등급표, 합치기 거리).
  - `pdfkit.page_spans`가 글자 색(`color`, '#rrggbb')도 돌려준다. 역할: 나라 = 굵은 고딕 자홍(#ed1064), 바다·하천 = 파란 명조(#0072bc), 지형 = 굵은 명조, 섬·반도 = 검은 명조, 도시·산 봉우리 = 고딕(5.7/7.1pt), 영문 = Helvetica(나라 자홍·수도 검정)·Times(대양).
  - 곡선·자간 글자는 흐름 순서가 뒤섞여 있어(유프라테스강이 「강스테라프유」 순) 기하로 묶는다: 같은 양식 조각을 싼 연결부터 이웃 둘까지만 잇는 사슬(갈래·건너뛰기 금지), 읽는 방향은 글자 dir. 맞닿은 다른 지명(벨기에+독일)은 찾아보기로 나누고, 여러 줄 지명(고드윈/오스턴산, 보스니아/헤르체고비나)은 이은 이름이 찾아보기(또는 `extraNames`)에 있을 때만 잇는다.
  - 점 지명 ↔ 기호는 글자 줄 방향으로 돌린 글자 상자의 붙는 자리(변 가운데·모서리)까지 거리 + 산 높이 숫자 ↔ 삼각형 어긋남 벌점으로, 덩어리마다 비용 합 최소 짝(탐욕은 선전·홍콩, 탈린·헬싱키를 맞바꿔 짝지었다). 수도 = 붉은 사각·원 기호.
  - `places.json` 항목: `{name, lon, lat, rank, kind, size, page, symbol?, path?, angle?, en?, alt?, elev?, inIndex}`. 점 지명은 lon/lat = 기호 위치이고 `symbol`도 같은 값. 면·선 지명은 `path`(글자 줄 2~6점, 경위도)로 길이·방향·곡선을 주고, 지면 각도가 3° 이상이면 `angle`(지면 기준, 시계 방향 +). `alt` = 괄호 병기(양쯔강, K2), `elev` = 산 높이(m).
  - 합치기: 점 지명은 같은 이름이 60km(기호 없는 쪽이 끼면 150km) 안, 면·선 지명은 같은 이름이면 하나. 위치 = 가장 큰 축척 지도(점은 기호 있는 것), 단 나라와 16쪽 글자 9pt 이상(대양·큰 바다)은 16쪽 위치. rank = 16쪽 글자 크기 단계(+수도 −1), 18·19쪽에만 있으면 그 단계 + 1. 지역도 글자 크기는 축척이 달라 16쪽과 비교하지 않는다.
  - 찾아보기 16~19쪽 754줄은 모두 places 에 있다(누락 0, 제외 0). `inIndex` = 찾아보기에 16~19쪽 참조가 있는 지명. 세계 유산 이름·철도 이름·선 이름(북회귀선 등)·유빙 한계는 지명이 아니라 뺀다.
  - 검증: Natural Earth 10m 인구 지점(`$ATLAS_WORK/raw/ne/ne_10m_populated_places.geojson`, NAME_KO 일치 249곳)과 도시 위치를 견준다. 테스트가 중앙값·90%·최대를 지킨다(파일 없으면 건너뜀). 용량 약 127KB(상한 150KB).
- (C2 보강) 일반도 도시 기호 기준점:
  - 16·18·19쪽은 경위선 교차점(src:'grid')이 지도 안쪽에만 있어, 교과서 도시 기호 ↔ Natural Earth 인구 지점 짝을 기준점(src:'city')으로 더한다. `node scripts/atlas/city_controls.mjs --write`가 골라 `maps_u2.json` controls 에 적고(지도마다 `controlsNote`에 까닭), `extract_vectors.py --controls all` → `georef-cli.mjs --all`. 설정은 `config/u2.json`의 `cityControls`. 이 세 지도는 지명(places)에만 쓰여 다른 레이어는 바뀌지 않는다(다른 지도 fit 은 바이트까지 그대로).
  - 고르기: NAME_KO 완전 일치·아시아 범위에 하나뿐·그 지도에 하나뿐 → 투영식(TPS 없이) 잔차가 중앙값 + 3×1.4826×MAD 넘으면 뺌(반복) → 이웃 4점 잔차 벡터와 3pt 넘게 다르면 뺌 → 교차점 껍질 바깥부터 30pt 간격. 결과 16쪽 50(껍질 밖 16)·18쪽 13(11)·19쪽 54(14).
  - 겹 나누기 검증(5겹, 빠진 도시 오차 km, 중앙값/90%/최대): 16쪽 5.2/14.1/18.3(교차점만 6.1/12.7/18.4), 18쪽 3.4/5.2/6.6(3.4/5.8/8.1), 19쪽 1.7/4.5/9.1(3.8/9.4/12.6). 기준점으로 안 고른 도시(간격으로 뺀 것): 16쪽 3.8/10.1/31.1(4.8/10.5/28.1), 18쪽 5.3/12.9/12.9(6.9/8.6/8.6), 19쪽 2.0/4.8/8.7(3.9/7.1/8.3). 19쪽은 뚜렷이, 16쪽은 조금 좋아지고 18쪽은 거의 같다.
  - 잔차로 빠진 도시(에르데네트 15pt·만달고비·네르친스크(18쪽), 냐짱 10.7pt(19쪽), 델리·라호르(16쪽) 등)는 둘레 도시가 1pt 안으로 맞는데 혼자 어긋난다 → 교과서가 기호를 옮겨 그린 것(델리는 뉴델리와 나란히 놓으려고)이지 경위도 맞추기 오차가 아니다. places 는 교과서 기호 위치를 그대로 쓰므로 이 도시들은 실제와 40~110km 다르다.
  - (결정) 바탕 지도가 실제 지리(Natural Earth)라 옮겨 그린 기호는 실제 위치로 바로잡는다: 점 지명 중 Natural Earth 인구 지점에 이름이 똑같은 지점이 하나뿐이고 places 에도 하나뿐인데 30km(`places.snapKm`) 넘게 어긋나면 lon/lat·symbol 을 Natural Earth 경위도로 옮기고 `snapped: {from:[lon,lat], km}`를 남긴다(`build_places.mjs` snapToNe). 교과서 위치를 지킬 지명은 `places.keepTextbookPosition`{이름: 까닭}(지금은 없음). 면·선 지명은 옮기지 않는다. 옮긴 9곳: 에르데네트 109km·냐짱 76·만달고비 46·델리 45·네르친스크 42·라호르 38·케손시티 38·베르호얀스크 35·도하 31. 그 뒤 도시·수도 249곳 중앙값 0.6km, 90% 7.5km, 최대 29km.
- (C2 검토 반영) 공용 도구와 설정:
  - Node 공용 `scripts/atlas/geo_util.mjs`: `key`(공백 없는 이름 열쇠)·`km`·`median`·`cmp`(NaN·Infinity 안전 비교)·`neIndex(file, box)`·`stale(inputs, outputs)`. Python 색 바꾸개는 `pdfkit.hex_color` 하나(`atlas_common.hexc` 는 그 별명), 내용 아닌 상자는 `atlas_common.excluded_boxes`(제목 상자 cartoucheBbox 포함 — 이것이 있는 지도는 일반도 셋뿐이라 주제 레이어는 그대로).
  - 짝 맞추기(`places._pair`)는 덩어리마다 헝가리안 최소 비용 배정(행 = item, 열 = target + item 별 「짝 없음」 열 = miss 비용, 안 되는 쌍 = 1e9). 묶기 수치는 `places.chain`, 종류 목록·도시 종류·합치기 묶음·검증 색·Natural Earth 파일·범위는 모두 `places` 설정(`kindList`·`cityKinds`·`mergeFamily`·`verifyColors`·`neFile`·`neBox`, cityControls 도 같은 neFile·neBox). places.py 가 점 지명 여부(`point`)를 내보낸다.
  - 낡은 산출물: build_places 는 places.py 산출물이 설정·maps_u2.json·places.py·pdfkit.py·atlas_common.py 보다 오래되면 다시 뽑고, fit 이 기준점·maps_u2.json 보다 오래되면 멈춘다. georef-cli --all 은 controls.json 이 maps_u2.json·extract_vectors.py 보다 오래되면 먼저 다시 뽑는다.
  - Natural Earth 대조는 도시 기준점·바로잡기 때문에 표본 안 값이다. 독립 검사 = `city_controls.mjs --holdout` 이 쓰는 `$ATLAS_WORK/geo/city-holdout.json`(테스트가 읽음).
- (C3) 사진·원본 쪽·밀도 음영 결정:
  - 파이프라인: `python -I scripts/atlas/extract_images.py [--candidates] [--photos] [--pages] [--overlay] [--sheets]`(없으면 모두, 경고가 있으면 종료 코드 1). 설정은 `config/u2.json`의 `photos`(확정 사진 `items`·제외 `exclude`·핀 찾기 `pins`·주제별 기대 수 `expect`·품질·dpi·밀도 음영 `overlay`). 산출물: `content/atlas/u2/photos.json`, `docs/assets/atlas/u2/photo/<id>.jpg|.webp`, `page/p016~p025.jpg`, `overlay/p23-density.png`, `sims/atlas-u2-asia/data/overlay-p23-density.json`. 대조표 `$ATLAS_WORK/shots/c3/photos-<쪽>.jpg`.
  - 사진 수(실측): 지형 7·기후 4·종교 12(지도 원 사진 4 + 주민 생활 4 + 싱가포르 공휴일 4)·인구 2(몽골·방글라데시 1km² 그림)·산업 2(네옴시티·베트남 공장)·세계유산 11 = 38장. 계획의 「지형 8, 기후 5」는 조사 어림값이었다(20쪽 사진·#7251a1 핀 7개, 21쪽 4개 — 5번째는 마스코트). 16~19쪽에는 사진이 없다.
  - 후보 찾기: 래스터 배치를 **변으로 맞닿은 것끼리만** 묶는다(크게 겹친 것은 잇지 않음 — 바탕 위 사진과 바탕이 한 덩어리가 되지 않게). 후보가 items·exclude 상자와 (작은 쪽 넓이의) 50% 이상 겹치지 않으면 경고. 확정 bbox 는 사람이 렌더를 보고 적는다(둥근 상자로 잘린 네옴시티·베트남 사진은 보이는 영역, 원 사진은 사진 배치 + `mask: circle`(원 밖 흰색), 폴라로이드 아래 카드 글자·이웃 사진이 끼는 자리는 잘라 냄 — 까닭은 항목의 `_bbox`).
  - 해상도: bbox 를 덮는(겹침 ≥ 25%) 이미지 배치 중 **IoU 최대**의 dpi(변환 행렬 축 길이로, 회전 사진도), 상한 200, 벡터 그림은 200. 가장 높은 dpi(원 사진 옆 200dpi 그림자)나 가장 많이 겹침(폴라로이드 틀 그림자 72dpi)으로 고르면 틀린다. 결과 모두 150dpi(네옴시티 168). JPEG q82·WebP q80, 합계 약 1.0MB(목표 4MB).
  - 글: `pdfkit.text_runs`/`box_text`(새 공용 도구) — texttrace 글자 묶음을 원문 공백 그대로 잇는다. 묶음 사이: 한쪽 끝 공백이면 그대로, 같은 줄 0.15em 안이면 붙임(낱말 사이 공백 폭 ≈ 0.22em), 줄이 바뀌면 양끝 맞춤 줄바꿈(앞 줄 오른쪽 끝 0.5em 안 + 새 줄 왼쪽 끝 0.3em 안)일 때만 붙임(한국어 본문은 낱말 가운데서도 줄이 바뀐다 「이 / 르는」). 한 묶음 안 강제 줄바꿈은 두 줄 너비가 같으면 기하로 못 가른다 → 항목의 `captionOverride`(+`_why`, 지금은 싱가포르 「(라마단의 끝을 기념)」 하나). 교과서 원문 오탈자 「사우디아리비아 비전 2030」(24쪽)은 그대로 둔다.
  - photos.json 항목: `{id, page, bbox, topic, mask?, title?, caption, credit?, pin?, map?, lonlat?, dpi, width, height}`. title = 굵은 제목(있을 때), caption = 설명(세계유산은 이름, 싱가포르는 날짜·축일 이름), credit = 사진 위 출처(네옴시티). 그래프 출처(「이과연표」 등)는 사진 출처가 아니라 넣지 않는다.
  - 핀 → 경위도: 지도마다 핀 위치를 찾고(`pins`: 20·21쪽 = #7251a1 물방울 도형의 아래 끝, 22·25쪽 = 번호 글자를 담은 가장 작은 원의 가운데) `scripts/atlas/pt2lonlat.mjs`(fit 역변환, 공용 도우미)로 경위도. 번호 핀(22·25쪽)은 번호로, 번호 없는 핀(20·21쪽 — 사진 번호와 핀 사이 짝은 활동 과제라 지면에 없다)은 `pinNear` 지명(places.json)과의 거리 합 최소 짝(`places._pair` 헝가리안), 상한 600km. 짝 거리: 서시베리아 평원 496km(평원 글자 중심과 핀 차이), 몰디브 344, 타지키스탄(파미르) 263, 고비 179, 다카(갠지스 삼각주) 114, 구이린 109, 수라바야(브로모) 80, 기후 도시 27~98km. 25쪽 위치도는 축척이 작아 핀 원(지름 약 10pt ≈ 550km)이 실제 유산에서 200~400km 떨어진 것이 있다(예루살렘·야사위 영묘·러산·앙코르) — 교과서 핀 위치 그대로 둔다.
  - 원본 쪽: 110dpi(1191×1104), 200KB 안에 들 때까지 품질 80→50(16쪽 50, 나머지 65~75), 합계 1.84MB.
  - 밀도 음영: 지도 틀(maps_u2 bbox)을 `images_only`로 150dpi 렌더 → 흰 바탕(≥248) 투명 → 파란 사람 아이콘(B−R > 40, 2px 넓힘) 7개 지움, 둘레 절반 이상이 음영인 2개는 둘레 색으로 메움(나머지는 바다 위라 투명). 국경·글자·인구 막대는 벡터라 images_only 로 빠진다(눈으로 확인). JSON `{url(절대 주소), page, bbox, fitId, width, height, bounds}` — bounds 는 테두리를 되돌린 경위도 범위(중심 경도 기준으로 펴서 날짜변경선을 넘어도 뒤집히지 않음, 북쪽 테두리가 극 가까이라 경도 폭이 넓어 참고용). 앱은 fit 으로 화소를 역투영한다. 해안 둘레에 흰빛이 조금 섞인 화소가 남는다(가장 옅은 단계 #fef1e1 과 흰색이 가까워 가르지 않음).
- (C3 검토 반영) 구조·공용 도구:
  - 모듈 나눔: `extract_images.py`(후보·사진·원본 쪽·대조표·CLI, 모르는 옵션은 종료 코드 2, 단계 이름 `--candidates --photos --pages --overlays --sheets`), `pins.py`(핀 찾기·짝·node 호출), `density_overlay.py`(음영 PNG). 설정 `photos.overlay` → `photos.overlays` 목록(항목마다 `id`).
  - 헝가리안 짝은 공용 `scripts/atlas/assign.py`(`pair`·`hungarian`·`BIG`) — places.py 와 pins.py 가 함께 쓴다(places 모듈을 끌어오지 않음).
  - Node: 작업 폴더 `WORK`·`fitPath(id)`·`loadFit(id)`(없으면 「georef-cli.mjs --all 먼저」 오류)는 `geo_util.mjs` 한 곳 — build_layers·build_places·city_controls·georef-cli·pt2lonlat 이 쓴다(산출물은 바이트까지 그대로). `pt2lonlat.mjs --center <id>` = 투영 중심 경도(Python 이 fit 파일을 직접 읽지 않음), 되돌리기 실패는 null(길이 유지). Python 쪽 node 호출은 node 없음·시간 초과(120초)·종료 코드·점 수 불일치를 모두 RuntimeError 로 알린다.
  - 번호 없는 핀: 항목별 `pinNearMaxKm`(20·21쪽은 실측 거리의 약 1.3배: 고비 250·수라바야 120·구이린 150·몰디브 400·타지키스탄 320·다카 160·테헤란 150·방콕 60·이르쿠츠크 80·우한 100, 서시베리아 평원 600), 한 지명의 상한 안에 핀이 둘 이상이면 「모호」 경고. 지명 찾기 실패는 「없음」/「n개(종류…)」로 구분해 알린다.
  - 밀도 음영 테두리: 흰색과 맞닿은 `edgePx`(2) 띠에 부드러운 알파 α = d / d_ref (d = 255 − 최소 채널, d_ref = 띠 밖 음영 이웃(edgePx+1) 의 d 최댓값). 색은 α ≥ 0.5 면 흰색을 걷어 낸 값 255 − (255 − c)/α, 더 옅으면 이웃 음영 색(걷어 내기가 잡티의 푸른 기를 키워 아이콘 검사에 걸렸다). 둘레에 음영이 없는 띠 화소 중 d < `noiseD`(20) 는 바다 잡티라 투명. 아이콘 메움은 아이콘 상자 + 2px 창 안에서 배열 연산으로. 결과 275KB, 부드러운 화소 약 1.2만, 해안 흰 테두리 없음. 사진·원본 쪽·photos.json 은 다시 뽑아도 바이트까지 그대로.
- (C4) 그래프 숫자·부록 표 결정:
  - 파이프라인: `python -I scripts/atlas/extract_tables.py [--climate] [--charts] [--sheets]`(없으면 모두, 경고 있으면 종료 코드 1, 모르는 옵션 2). 설정은 `config/u2.json`의 `charts`(`climateTable` + `items` 그래프 17개). 모듈: `charts_axes.py`(낱말 단위 수 글자·축 직선 맞추기·눈금선 붙이기·정밀도), `charts_geom.py`(채움·선 도형, 띠 칸 경계, 세로선 위 보이는 색, 원호), `charts_read.py`(종류별 읽개), `climate_table.py`(97쪽 표), `chart_sheets.py`(대조표). 산출물: `$ATLAS_WORK/tables/climate-world.json`, `charts-u2.json`, 대조표 `$ATLAS_WORK/shots/c4/charts-21|23|24.png`. `--sheets`만 주면 charts-u2.json 이 설정·코드보다 오래됐을 때 다시 뽑는다.
  - 그래프 목록(실측 17개): 21쪽 기후 그래프 4(테헤란·방콕·이르쿠츠크·우한 — 계획의 「5」는 조사 어림값), 23쪽 세계 인구 성장(쌓은 면)·중국과 인도의 인구 성장(선)·연령대별 인구 비율(고리 막대, 중국·인도 한 그래프)·일본 피라미드·일본 유소년/노년 비율(선)·카타르 피라미드·카타르 원그래프·카타르 외국인 국적(세로 띠), 24쪽 자원 생산 비율·수출 비율(100% 띠 각 5줄)·베트남 수출품 2010·2021(막대 2)·네옴시티 표. 22쪽 「카슈미르 주민 구성」은 숫자 없는 모식도, 싱가포르 공휴일 달력은 C3 photos.json 설명글에 이미 있어 넣지 않는다. 24쪽 주제도 활동에는 막대그래프가 없다.
  - 원칙: 인쇄된 숫자가 있으면 그것(`method: printed`), 없으면 도형을 잰다(`measured` + `precision` = (축 잔차 + 0.1pt) × 단위/pt). 띠·원·고리는 인쇄값과 잰 값을 헝가리안으로 짝지어 `check.maxAbsDiff`를 남긴다. 기후 그래프는 97쪽 표 값(printed, printedAt 'p97 표')을 쓰고 잰 값은 `measured`, 최대 차는 `check`(기온 ≤ 0.48℃, 강수 ≤ 1.1mm).
  - 축: 눈금 글자는 `charts_axes.words`(texttrace 를 공백·빈칸·역방향에서 나눔 — 「0 100 200 …」 한 묶음, 오른쪽→왼쪽 순 「2100 2050 …」 묶음)로 읽고, 눈금선(가로·세로 곧은 마디·사각형 변, 띠그래프는 #a7a9ac 점선 채움 가운데)에 붙인다. 축 끝 글자가 단위 「(%)」에 밀려 비껴 있는 곳(피라미드 10·6, 띠 100, 베트남·일본 축 0)은 `xRequireSnap`/`yRequireSnap`으로 눈금선에 붙은 글자만 쓴다.
  - 띠그래프 짝: 이름(한글 조각) ↔ 수(오른쪽 같은 줄 또는 바로 아래) 짝 → 지시선은 막대 밖 끝에만 글자가 붙고 막대 안 끝(점)이 가리키는 곳, 막대 안에 든 글자는 지시선과 상관없이 제 자리(남의 지시선이 스쳐 빼앗던 러시아 3.6·오스트레일리아 8.3). 칸 경계 = 이웃 칸 겹침 가운데, 나중 칸에 90% 넘게 덮인 칸은 버림(희토류 끝 회색 2칸). 출력은 계열 = 나라 합집합(없는 칸 null) + `stackOrder`(막대마다 칠한 순서) + `totals`(막대 왼쪽 합계·단위·해).
  - 세계 인구(쌓은 면): 세로 눈금이 없어 해 위 인쇄 합계 8개로 높이 ↔ 값 비례(원점 지남)를 맞춘다. 합계는 **버림한 수**(띠 합 9.9 ↔ 9, 12.8 ↔ 12 — 반올림이면 어긋남, `totalsRounding: floor`)라 인쇄값 + 0.5 로 맞춘다. 띠 두께 = 세로선 위에서 칠한 순서대로 덮어 보이는 색 구간(조각 그림이 겹쳐 있음). 1950년 전 아시아는 한 띠(#9acf87)라 계열 「아시아(1950년 전)」로 따로 두고, 중국·인도·그 밖은 1950년부터. 2021·2100년 인쇄 몫과 잰 몫 차 ≤ 0.13%p(얇은 띠 남아메리카·오세아니아 글자는 세로 거리 + 값 차로 짝).
  - 원·고리: 바깥 호(이어진 곡선 마디)로 원을 맞춰 쓸어 간 각 = 값 %. 부채꼴은 짧은 호 하나로 맞춘 중심이 흔들려(19.8 ↔ 19.4) 곧은 변 꼭짓점을 중심으로 쓴다(19.44). 고리 막대 계열 = 고리 12시 띠 높이에 놓인 범례 글자.
  - 교과서 원문 문제(인쇄된 그대로 둠, 설정 notes): 24쪽 「특허 등록」 막대가 신발 수출 비율을 그대로 옮긴 것으로 보임(중국 36.9 = 35.3 + 홍콩 1.6, 나머지 칸 같음, 합계 146 ↔ 146,339). 「통신 기기 수출」 아랍 에미리트(4.3)·네덜란드(3.6) 칸 너비가 서로 바뀐 듯 0.7~0.8%p 어긋남(p24-exports warnDiff 1.0, `_warnDiff`). 카타르 외국인 국적 띠는 칸 높이가 값에 비례하지 않아(최대 5.6%p) 인쇄값만 쓴다(`toScale: false`, 합 80.6 = 원그래프 외국인 검증). 97쪽 표에 테헤란이 없어 테헤란 기후 그래프는 잰 값(기온 ±0.22℃, 강수 ±1.1mm)만.
  - 97쪽 표: 41곳(왼쪽 21 + 오른쪽 20), 열 = 머리줄 흰 「n월」 가운데, 수 줄 ↔ 도시 이름 줄(기온)·나라 줄(강수, 글자색으로 다시 확인). 강조 칸(최저·최고)은 쪽 흐름 뒤쪽에 따로 있어 위치로만 모은다. 연 강수량 = 월 합, 연평균 ≈ 월 평균(0.6℃) 모두 맞음. 경위도·고도는 표에 없어 넣지 않는다.
- (C4 검토 반영) 축·색·원호·띠·출력:
  - 축 잔차 문: `charts_axes.fit_axis_checked` — 눈금 글자 3개 미만이면 경고, 잔차가 `charts.defaults.axisResidTol`(0.6pt)을 넘으면 가장 어긋난 글자 하나를 빼고 다시 맞추고(`axes.*.dropped`), 그래도 넘으면 경고. 선형 축인데 로그로 맞추면 잔차가 4배 넘게 작으면 「axisScale log」를 알린다(값 축은 `axisScale` 'linear'·'log'). 위치 순으로 값이 오르내리거나 같은 자리에 다른 값·기울기 0 이면 ValueError. 지금 17개 그래프 모두 뺀 글자 없음.
  - 색: `atlas_common.color_match(c, targets, de)`(Lab ΔE) — 채움·선·글자 색 맞추기는 모두 이것을 거친다(`defaults.colorDE`, 기본 0 = 같은 색만). 도형 item 의 color = 맞춘 목표 색, rawColor = 실제 색.
  - 원호: 고리 막대는 고리마다 12시(`startTolDeg` 2°)에서 `direction`(기본 cw)으로 그렸는지 확인한다. 부채꼴은 각 합이 100 인지(check.measuredSum). 원호 없는 채움은 경고하고 잰 값 null.
  - 띠 칸: `bar_segments` → (칸, {dropped, gaps}). 덮여 버린 칸은 `check.droppedSegments`로 보고(희토류 끝 회색 2칸, 95%·100% 덮임), 칸 사이·축 끝과의 틈이 `maxGapPt`(0.5pt)를 넘으면 잇지 않고 `check.gaps` + 경고(지금 0). 축 끝 맞춤 거리는 `EDGE_SNAP_PT`.
  - 출력: 경로는 `charts.out`(climate·charts·sheets, 작업 폴더 기준), 읽개 기본값은 `charts.defaults`(colorDE·numberFont·axisResidTol·axisScale·maxGapPt·snapTol·startTolDeg·endTolPt). 경고가 하나라도 있으면 JSON 을 쓰지 않는다(`--force`로만 씀, 종료 코드는 1). 쓰기는 임시 파일 → os.replace. 경고는 중복 없이. 대조표는 뽑은 결과·chart_sheets.py·설정보다 오래됐을 때(또는 다시 뽑았을 때) 다시 그린다. 낡은 산출물 검사 입력에 chart_sheets.py·charts_labels.py 도 든다.
  - 잰 값의 소수 자리 = 정밀도의 한 자리 아래, 그 그래프에 인쇄된 수의 소수 자리 + 1 을 넘지 않는다(눈금이 정수인 선·피라미드는 소수 1, 띠·원은 2, 기후 그래프는 부록 표 자리 + 1 = 2). 피라미드 합은 반올림 전 값으로.
  - 모듈: 글자 도우미(상자 글·줄 묶기·이름 ↔ 수 짝·상자 거리)는 `charts_labels.py`로 나눔. 세계 인구 대조표의 쌓는 순서는 설정 `sheetStackOrder`. 같은 입력으로 두 번 뽑으면 charts-u2.json 이 바이트까지 같다(테스트).
- (C5) 주제 내용 결정:
  - 파이프라인: `python -I scripts/atlas/extract_text.py [--labels] [--fill] [--check]`(없으면 --labels --check) → `node scripts/atlas/coloring_quiz.mjs --write` → `node scripts/atlas/build_content.mjs [--force]`. 설정은 `config/u2.json`의 `content`(경로·기대 수 `expect`·보기 범위 `viewGrid`/`viewPercentile`/`markerMargin`·색칠하기 `coloring`). 경고가 있으면 쓰지 않고 종료 코드 1.
  - 사람이 고치는 원본 `content/atlas/u2/topics.json`: 글은 손으로 쓰지 않고 출처 상자만 적는다 — 어느 객체든 `src`{page,bbox[,skip]} → `text`, `<키>Src` → `<키>`(titleSrc·creditSrc·noteSrc·answerSrc·answerKeySrc). `--fill`이 `pdfkit.box_text`로 채우고, Python 테스트가 원문과 같은지 다시 본다(손으로 고치면 실패). `skip`은 같은 줄에 붙어 나오는 앞 글(「학습 목표 |」, 그래프 제목)을 정확히 떼어 낸다. 사람이 고친 값은 `overrides.json`의 `items`{키: {value, from, why}}(키 `topicId.markerId.field`·`topicId.blocks[i].field`·`topicId.layers[i].field`·`topicId.quiz.field`) — `from`이 지금 원문과 다르면 빌드가 「낡은 고침」으로 멈춘다. 지금 고침 3개: 16쪽 제목 「아 시 아」→「아시아」, 23쪽 「있으나,중국」 띄어쓰기(왼쪽 맞춤 글상자의 첫 줄이 가장 길어 box_text 가 양끝 맞춤 줄바꿈으로 봄), 112쪽 정답의 검은 동그라미 번호 ❶❼❽❾(글꼴 표에 없어 ?로 읽힘).
  - 주제 8개: 일반도(16·18·19, 바로가기 3 + 도법·축척 글) · 색칠하기(17) · 지형(20) · 기후(21) · 종교·문화(22, 바로가기 종교 분포·싱가포르·카슈미르) · 인구(23) · 산업(24) · 세계유산(25). 개수 실측: 지형 마커 7, 기후 그래프 마커 4, 세계유산 11(계획의 8·5는 조사 어림값 — 위 테스트 고침). 같은 지도 안 레이어 바꾸기는 `group: "map"`(기후 구분·1월·7월, 종교 분포·카슈미르, 인구 분포(밀도 음영 + 1억 명 막대)·증가율, 자원·수출품·교역).
  - 블록 종류: `text`(role question·goal·section·subtitle·link), `activity`(활동하기·주제도 활동), `card`, `chart`(ref, 교과서 제목·설명·주), `photo`(ref → 사진 제목·설명), `page`(원본 쪽 보기, `bbox`가 있으면 그 부분 — 카슈미르 주민 구성 모식도, 24쪽 신문 스크랩). 주제마다 쪽마다 `page` 블록 하나. `view`가 있는 블록은 그 바로가기에 딸린다.
  - 마커 위치(`lonlatFrom`): `pin` = 교과서 핀(C3 photos.json, 지도 fit 이 approx 면 `approx`), `place` = 교과서 일반도 지명(places.json) — 기후 그래프 도시 4곳, 22쪽 종교 경관 4곳(핀이 도시에서 87~240km 떨어진 위치도 핀), 20쪽 구이린(109km), `source` = 실제 좌표 + 출처 — 25쪽 세계유산 11곳은 UNESCO 세계유산 목록 좌표(whc.unesco.org 은 봇 차단이라 UNESCO 공개 자료 `data.unesco.org` whc001 의 `coordinates`, 받은 파일 `$ATLAS_WORK/raw/unesco/whc11.json`; 러산 대불은 구성 요소 779-002). 핀이 아닌 위치로 옮긴 마커는 `textbookLonlat`(교과서 핀)을 남긴다. 지형 핀은 지역(평원·사막·고원)이라 그대로(파미르 핀은 실제 고원 중심에서 200km 넘게 떨어져 있지만 「위치 근사」 표시로 둠).
  - 마커 글: 사진이 있으면 제목 = 사진 굵은 제목(없으면 설명), 글 = 사진 설명(C3 원문). 세계유산은 제목 = 유산 이름, 글 = 「국가: … / 관련 종교: …」(정답에서 만듦). 정답 = 25쪽 인쇄(02~06·10·11, `answerSrc`로 원문 대조) + 112쪽 정답(01·07·08·09, `quiz.answerKey` 원문에 들어 있는지 테스트).
  - 색칠하기 문제(`content/atlas/u2/coloring.json`, coloring_quiz.mjs 생성): 17쪽 나라 글자 46개(이름 14 + 초성 32) → Natural Earth 10m `ADM0_A3`. 나라 = Natural Earth 한국어 이름(NAME_KO) 초성이 글자 초성과 같은 나라 중 글자 가운데(17쪽 fit 으로 되돌림)에서 600km(`nameKm`) 안 가장 가까운 면, 없으면(터키 ↔ 튀르키예) 글자 자리의 면. 이름 = 교과서 나라 지명(places)에서 초성이 같은 것. 수도 = 17쪽 손글씨 수도 25곳, 나머지는 그 나라 면 안 places 수도 지명. 글자가 다른 나라 면 위에 있으면 `labelIso`(대한민국 글자는 PRK 위, 조지아는 RUS 위 등 7곳).
  - 보기 범위: `view`/`views` = `{map}`(지도 틀 안 21×21 격자를 fit 으로 되돌린 경위도의 5~95% 범위 — 방위 도법 틀 모서리는 극 가까이라 경도 폭이 300°를 넘어 쓰지 않음, 주제 view 는 마커를 모두 담도록 1° 넓힘) 또는 `{layer}`(카슈미르 = 레이어 도형 범위). 확대 수준(zoom)은 도법마다 달라 정하지 않고 `bounds`를 넘긴다(엔진 D 작업이 화면에 맞춤).
  - 생성물(`sims/atlas-u2-asia/data/`): `topics.json`(44.7KB, 원본 표기 src·…Src·why·_키는 뺌, 사진은 {id, url(jpg), webp, width, height, mask?, credit?, pin?}, 쪽 이미지 url), `charts.json`(charts-u2.json 17개를 id 열쇠로, 모두 어느 주제가 참조), `layers.js`(참조 레이어 12개 정적 import). 레이어 항목은 파일의 layerType 과 type 이 같아야 하고, label 기본값 = 레이어 제목, 레이어 approx → `approx`·`approxNote: 「위치 근사」`(p22-singapore), 카슈미르는 `note: 「위치: 실제 경계 자료(Natural Earth)」`, 지도 출처 글(「(UN, 「세계 인구 전망」, 2021)」 등)은 `credit`.
  - 교과서 원문 문제는 앱에 넣지 않고 `content/atlas/u2/issues.md`에 모았다(특허 등록 = 신발 수출, 통신 기기 칸 바뀜, 세계 인구 합계 버림, 카타르 띠 비례 아님, 테헤란 부록 표 없음, 「사우디아리비아」 오탈자, 112쪽 「24쪽 특집」, 위치도 핀 거리, 17쪽 한반도 글자).
  - 검토 덤프 `$ATLAS_WORK/shots/c5/topics.md`(주제별 글·마커·그래프·레이어·퀴즈)를 쪽 렌더와 대조함 — 빠진 글: 23쪽 「*1억 명 이상 국가만 표시」(인구 막대 레이어 `note`로 넣음), 깨진 글: 112쪽 동그라미 번호(고침). 21쪽 기후 그래프 출처 「『이과연표』, 2023」는 charts.json `source`에 있다.
  - (C5 검토 반영) 싱가포르 공휴일 달력 출처 「(Public Holidays Global, 2023)」를 그 블록(subtitle @singapore)의 `credit`으로. 레이어 항목에 교과서가 인쇄한 범례 제목: `legendTitle`(면·기호 범례) / `lineLegendTitle`(선 범례) — 21쪽 기후 구분·강수량(mm)·기온 (°C), 22쪽 지역별 종교 분포 비율, 23쪽 인구 밀도(명/km²)(위첨자 고침 overrides)·인구·인구 증가율(%), 24쪽 무역액·수출입액. 24쪽 자원·수출품, 싱가포르·카슈미르 범례에는 제목이 없다. 출처 검사: 설정 `content.expectCredits`(쪽별 출처 글 목록, `notCredits` 제외) — Python 테스트가 `extract_text.printed_credits`로 지면과 같은 목록인지, JS 테스트가 모두 topics·charts 생성물에 있는지 본다.
  - (C5 검토 반영 2) 인구 밀도 음영 JSON(`overlay-p23-density.json`)에 범례 단계 `legend: [{color, label}]`(읽는 순서, 200 이상 · 100~200 · 50~100 · 5~50 · 5 미만)를 넣는다 — `density_overlay.overlay_legend(oc)`가 지도 범례 상자(maps_u2 `legendBbox`)를 `legend.py`로 읽고, 같은 상자의 인구 막대 견본(#0072bc)은 설정 `photos.overlays[].legendSkip`으로 뺀다. 설정 `expectLegend`(5)와 수가 다르면 경고(종료 코드 1). PNG 는 바이트까지 그대로. 범례 제목은 주제 레이어 항목의 `legendTitle`(「인구 밀도(명/km²)」).
  - (C5 코드 검토 반영)
    - `extract_text.dumps`는 재귀 서식기다(숫자·글만 든 목록만 한 줄, 글자 값은 json.dumps 그대로). 예전 정규식은 JSON 글자 안의 「[ 1,  2 ]」도 고칠 수 있었다. 원본 파일 가운데 그런 글자는 없었고(overrides 설명의 `[i]`는 짝이 안 맞아 그대로였다), 새 서식기로 다시 써도 topics·overrides 가 바이트까지 같다. `--check`도 통과.
    - 고침(overrides) 키: `topic.field` · `topic.quiz.field` · `topic.markers.<id>.field` · `topic.blocks.<id>.field` · `topic.layers.<ref>.field` · `topic.views.<id>.field`(field 는 더 깊이 갈 수 있음). 번호(`[i]`)·`__proto__`·`constructor`·`prototype`은 거부한다. `from`은 필수이고, `null`이면 그 칸이 없어야 한다. 칸이 없는데 `from`이 null 이 아니면 오류. 블록마다 고정 `id`를 둔다(질문 `question`, 목표 `goal`, 그래프·사진은 ref, 원본 쪽은 `page-NN`·`page-NN-part`, 나머지는 `<role|type>-n`·`<view>-text`).
    - 낡은 산출물 검사는 수정 시각이 아니라 입력 내용 해시(도장)로 한다. 설정은 `content.stamps`, 해시 = `atlas_common.stamp_hash` = `geo_util.stampHash`(파일 바이트 + 설정 부분 정렬 JSON, `_` 설명 키 제외; Python·Node 같은 값인지 테스트로 확인).
      - labels: `p17-labels.json`의 `inputsHash`. coloring_quiz 가 확인한다.
      - coloring: `coloring.json`의 `inputsHash`. 입력은 글자·places·17쪽 fit·Natural Earth·코드·설정.
      - topics: `$ATLAS_WORK/text/topics-check.json`. extract_text 가 --fill/--check 를 경고 없이 마쳤을 때 남긴다.
      - charts: `$ATLAS_WORK/tables/charts-u2.stamp.json`. extract_tables 가 그래프 JSON 을 쓴 뒤 남기고, 입력은 추출 코드·설정 charts·결과다.
      - build_content 는 셋(topics·charts·coloring)을 확인하고, 다르면 무엇을 먼저 돌릴지 알리고 멈춘다. coloring_quiz 는 `--write` 말고는 옵션을 받지 않는다(그 밖은 종료 코드 2).
    - 단원 값은 코드 밖에 둔다(설정 `content`): 블록 종류별 필수·허용 키, 퀴즈 종류(`schema`), 쪽 이미지 이름(`pageFile`), 사진 확장자(`photoExts`), 사진·쪽 폴더(`photoDir`·`pageDir`), 기대 수(`expect.charts` 추가). 코드와 테스트에 쪽 번호 글자를 두지 않는다. 색칠하기 수도 출처는 `capitalFrom`: `printed`(지도에 적힌 수도)·`places`·`places+ne`.
    - 세계유산 마커의 만든 글(「국가: … / 관련 종교: …」)은 뺐다. 그 마커는 제목(유산 이름)만 두고, 정답은 퀴즈 화면이 `quiz`로 보여 준다. 글이 없어도 되는 마커는 `schema.markerTextOptionalWith`(quiz)가 있는 것뿐이다.
    - 생성 전 검사(`validateTopics`): 모르는 키·블록 종류·퀴즈 종류, 주제·마커·블록·레이어·보기 id 중복, 필수 칸을 경고로 막는다(조용히 버리지 않음). webp 파일이 있는지도 본다. `layersModule`은 `^[\w-]+$`가 아닌 ref 를 거부한다. 생성물은 내용이 같으면 쓰지 않고, layers.js 를 맨 나중에 쓴다. buildContent 는 resolveLayers·resolveMarkers·resolveBlocks·resolveQuiz·checkTotals 로 나눴다. readJson·round·writeIfChanged·inRing/contains/nearKm 은 geo_util 에 모았고, 한글 음절 상수에는 이름을 붙였다.
    - 생성물 변화(topics.json): 블록 `id` 추가, 세계유산 마커 `text` 제거, `capitalFrom` 「p17」→「printed」. 나머지는 같다(비교 확인). charts.json·layers.js·charts-u2.json·climate-world.json 은 바이트까지 그대로다.
- (D1·D2·D4·D6 절반) 지도 엔진 첫 묶음 결정:
  - 구드는 d3-geo-projection 의 `geoInterruptedHomolosine`이 아니라 **d3-geo-polygon 2.0.1**(새 의존성)의 같은 이름 함수를 쓴다. d3-geo-projection 4 판은 단속선에서 도형을 자르지 않아(preclip 이 날짜변경선뿐) 단속을 건너는 선·면이 틈 위로 다리처럼 그려진다. d3-geo-polygon 판은 단속 껍질로 `geoClipPolygon` preclip 을 건다.
  - `interpolateProjection(a, b)(t)`는 근사가 아니라 진짜 d3 투영이다(geoPath·stream·invert 그대로). geoProjection 이 raw 의 y 를 뒤집고 center 점을 translate 로 옮기므로 raw 는 [x, −y]를 돌려주고 translate = 중심 경도·적도 점의 보간 화면 좌표, 회전은 a 의 중심 경도. t=0·1 에서 geoPath 경로가 양 끝 도법과 같음을 테스트한다. 한쪽이 구드면 구드 preclip 을, 메르카토르면 위도를 ±85°로 누른다. invert 는 양 끝 도법 invert 로 시작하는 뉴턴법. → 렌더러(D3)는 전환 중에도 `geoPath(out)`을 써도 된다(성능 때문에 110m 만 그리는 것은 그대로).
  - 메르카토르 맞춤은 폴리곤이 아니라 점 묶음(MultiPoint, 중심 경도 ±179.999°·±85°)으로 한다 — d3 폴리곤 변은 대원이라 경도 360° 상자를 만들 수 없다. clipExtent = (중심−180, 85)~(중심+180, −85).
  - `fitBoundsTransform(projection, [[w,s],[e,n]], width, height, pad, {minK=1, maxK=40})` → `{k, x, y}`(화면 = k·투영 + [x, y], d3-zoom 변환). e < w 면 날짜변경선을 넘는 범위(e + 360). 범위 안 25×25 격자를 투영한 화면 상자로 맞춘다(구드 단속·날짜변경선으로 갈라진 조각도 담김). 메르카토르는 위도 ±85° 로 누름.
  - 바탕 지도 `basemap.json`: 설정 `basemap`(u2.json) + `content.stamps.basemap`(meta.inputsHash). 원본은 다른 단계와 같은 nvkelso/natural-earth-vector geojson(110m 도 world-atlas 대신 Natural Earth — 나라 속성 iso·ko 를 같은 모양으로 싣기 위해). **육지는 나라를 녹여(dissolve2) 만든다** — 해안 호를 나라와 나눠 써서 용량이 준다(ne_*_land 와 아주 조금 다를 수 있음). 10a 는 단원 상자 두 개 `[20,−15,180,82]`·추코트카 `[−180,60,−168,72]`로 자른다(세인트로렌스섬 일부 포함). 단순화: 50m 나라 20%·하천 20%·호수 25%, 10m 나라 10%·하천(scalerank ≤ 6) 15%·호수 12%, 110m 은 원본. 양자화 1e5. 결과 888,389 B(867.6 KiB, 상한 921,600 B = 900 KiB), 같은 입력이면 바이트까지 같다. 하천·호수 속성 `s`(scalerank), 나라 `iso`(ADM0_A3)·`ko`(NAME_KO). `meta.unitBoxes`를 lod.js `inUnit`이 쓴다.
  - 렌더러(D3) 주의: 10a 는 상자 가장자리에서 잘린 호가 생긴다 — 국경은 `mesh(countries, a !== b)`(바깥 테두리 빼기), 해안선을 `mesh(land)`로 그리면 상자 테두리가 선으로 보이니 해안 강조는 바깥 호 중 상자 위에 놓인 것을 빼거나 육지 채움만 쓴다. 10a 를 쓸 때 화면 일부가 상자 밖이면 그 부분은 50m 를 밑에 그려야 빈 곳이 없다.
  - `lod.js`: `pickDetail(k, inUnit)`(k<2 → 110, k≥4 이고 단원 안 → 10a, 나머지 50), `inUnit([lon,lat], boxes)`(경도 ±360 감김), `detailObjects(level)` → TopoJSON 객체 이름(110 은 rivers·lakes null).
  - 지명 배치 `placeLabels(points, {width, height, measure, k, pad=2, symbolR=3, maxSpread=3, straightDeg=8})`: 입력은 화면 좌표 `xy`·`pathXY`(렌더러가 places 의 path 를 투영), 반환 항목 = 입력 + `{at, angle, boxes, bbox}`(+ 선·면 지명 `spacing`·`span`, 굽은 줄 `glyphs:[{ch, at, angle}]`). 각도는 화면 기준 시계 방향 +(SVG rotate). 선·면 지명은 줄 가운데에 놓고 줄이 길면 자간을 벌림(글자 폭의 3배까지), 글자마다 접선이 줄 방향과 8° 넘게 다르면 굽은 줄로 글자별 배치. 읽는 방향이 ±90° 를 넘으면 줄을 뒤집는다. 충돌은 글자 줄을 따라 놓은 표본 상자(글자 높이 크기)로 회전 글자를 어림하고, 보일 수 있는 기호 자리도 장애물로 먼저 넣는다(자기 기호 제외). 항목별 `minK`가 등급표보다 앞선다. places.json 880곳 실측(밀러, 1024×768): 세계 k1 16곳·아시아 k2.2 72곳·동아시아 k7.8 68곳·한반도 k23 53곳, 각 3ms 안.
  - `legendState.js`는 계획 그대로.
- (D1·D2·D4·D6 코드 검토 반영)
  - `interpolateProjection(a, b, {precision = 0.7})`: 두 끝 중심 경도가 다르면 오류, t ≤ 0 → a 자체, t ≥ 1 → b 자체(끝 지도에 보간 흔적·구드 이음매 없음). invert = 감쇠 뉴턴(한 걸음 최대 10°, 잔차가 늘면 걸음 반), 잔차 > `INVERT_TOL`(1e-3 px)이면 null(지도 밖·구드 틈·수렴 실패). 전환 프레임 정밀도 기본 0.7px(끝 도법은 0.2).
  - `fitBoundsTransform`: 폭 360° 로 자름, 경도를 도법 이음매 창 [중심−180, 중심+180]에서 시작하도록 옮김, 구드는 단속선 양쪽(±1e-6°)·적도 표본을 더함, 아무 점도 투영 안 되면 화면 가운데 기준 minK 변환.
  - `labels.js`: 기호 장애물도 격자 색인(자기 것 건너뜀), 정수 칸 열쇠(쓰레기 없음), `createMeasureCache(measure)`(렌더러가 한 번 만들어 계속 넘김), 빈 이름·점 하나짜리 줄은 재기 전에 건너뜀, 굽은 줄 글자 각도도 (−90°, 90°]로(U·S 자 줄), rank 없으면 6, 기호 간격 = symbolR + pad + 1, 출력에서 pathXY 뺌. 900개 배치 시간 검사(30ms 안, 실측 약 3ms).
  - `legendState.js`: 모르는 분류 toggle 은 오류, 상태가 바뀔 때만 알림, 구독자 오류는 console.error 로 남기고 나머지에 계속 알림.
  - `build_basemap.mjs`: 원본 주소를 natural-earth-vector 커밋 `ca96624a`(2022-06-02 master, 받아 둔 파일과 같음)로 고정, 받기는 60초 시간 제한·3번 시도·GeoJSON 검사(FeatureCollection·도형 수·필수 속성) 뒤 저장, mapshaper 는 `$ATLAS_WORK/tools/mapshaper_0.6.102`에 한 번 설치해 `node bin/mapshaper`로 셸 없이 실행. basemap.json 도형은 바이트까지 그대로(meta.inputsHash 만 바뀜).
- (D3) 렌더러 결정:
  - 인터페이스는 계획 그대로이고, 아래는 호환되게 넓혔다. `createMap(stage, { basemap, places, unitBoxes | unitBounds, projection = 'miller', centerLon = 0 })`(unitBoxes 가 없으면 unitBounds, 그것도 없으면 `basemap.meta.unitBoxes`). `flyTo({center, zoom} | {bounds, pad}, ms = 700)`, `fitBounds(bounds, { ms = 700, pad = 24 })`에서 bounds 는 `[w,s,e,n]`(topics.json view.bounds)과 `[[w,s],[e,n]]` 둘 다 받는다. `on()`은 해제 함수를 돌려주고, viewchange 는 `fn(view)`를 받는다. `map.layers`(z 순서), `map.stats`(render[{ms, detail, k, key, parts}], labels, morphFrames, interactiveFrames), `map.setReliefDrawer(fn)`가 있다.
  - `map.view` = `{ key, centerLon, k, x, y, width, height, center, kmPerPx, detail, moving, projection, geoRect }`. projection 은 화면 투영(확대 변환을 품은 d3 투영, 화면 px 를 바로 냄)이다. kmPerPx 는 화면 가운데 가로 1px 의 km 로, 축척 막대(D7)에 쓴다. geoRect 는 마지막 전체 그림 때 화면에 보이는 경위도 상자다(아래).
  - 레이어 z 규칙: 캔버스 `draw(ctx, path, view)`에서 z < 50 은 육지·음영 위, 호수·하천·국경 아래(면 레이어)이고, z ≥ 50 은 해안선 위다. ctx 단위는 CSS px 이고(dpr 은 렌더러가 처리), 호출마다 save/restore 로 감싼다. `drawSvg(g, project, view)`는 레이어마다 자기 `<g class="at-layer">`(z 순서)를 받는다. 멈출 때와 움직이는 동안 프레임마다 불리므로 요소를 제자리에서 고친다. 도법 전환 중에는 숨긴다. 자기 요소의 click 은 스스로 처리하고 stopPropagation 한다(빈 곳 click 만 지도 click 이 됨). `hit(xy, lonlat)`는 z 큰 것부터 맞히고, 아무 레이어도 안 맞으면 바탕 지도 나라(`layerId: 'basemap'`, 50m 나라 Feature, properties.iso·ko)를 준다. 끌기 뒤 click 은 막는다.
  - 지형 음영 훅(D5): `setReliefDrawer(fn)`. 육지를 칠한 직후, 면 레이어 아래에서 멈출 때만 `fn(ctx, projection, view, { land, under, path })`를 부른다. land 는 지금 상세도 육지(화면 상자로 자른 것), under 는 10a 일 때 단원 상자 밖을 메우는 50m 육지(아니면 null)다. 훅이 없거나 예외를 던져도 나머지는 그대로 그린다(확인함). `setOptions({relief:false})`면 부르지 않는다.
  - 확대·이동은 d3-zoom 대신 자체 `zoomer.js`로 한다. 변환은 d3-zoom 과 같다({k,x,y}, 화면 = k·기준 투영 + [x,y], scaleExtent [1,40], 휠 배율·두 번 누르기·van Wijk 날아가기 같음). 까닭: d3-zoom 이 끌어오는 d3-selection 에 `selection.html()`(innerHTML)과 `document.documentElement`·`document.querySelector`(select(문자열))가 프로토타입 메서드로 들어 있어 번들에서 빠지지 않고, 조각 규칙 검사에 걸린다(node_modules/d3-selection/src 에서 확인). 이동 제한은 d3-zoom 기본(작으면 늘 가운데)과 달리, 확대하면(k ≥ 2) 화면의 30% 까지 지도 밖 빈 곳을 허용한다. 구드·로빈슨에서도 아시아를 가운데에 둘 수 있게 하려는 것이고, k=1 은 세계 전체로 고정된다.
  - 움직이는 동안에는 마지막 전체 그림(스냅숏)을 drawImage 로 옮기고 키우기만 한다. 스냅숏이 화면을 다 덮지 못하면 110m 빠른 그림을 밑에 깐다. 멈추면(120ms) 전체를 다시 그리고 지명을 다시 놓는다(투명도 전환). 이동만 했으면 지명은 따라 옮긴다.
  - 도법 전환은 0.6초 동안 `interpolateProjection`(정밀도 0.7)으로 바다와 110m 육지만 그린 뒤 전체를 그린다. 화면 가운데 경위도와 k 는 유지한다. 가운데가 구드 틈이면 `nearCenter`(가운데에서 가장 가까운 지도 위 점)를 쓴다. 중심 경도 전환은 애니메이션 없이 같은 규칙으로 한다(보간은 중심 경도가 같아야 해서).
  - 상세도는 `pickDetail(k, nearCenter 가 unitBoxes 안)`으로 고른다(태평양 중심 구드에서 아시아 가운데가 110°E 단속 틈에 떨어져도 10a 가 되게). 10a 일 때는 단원 상자 밖만 50m 로 먼저 그린다(evenodd 자르기). 국경은 `mesh(countries, a !== b)`이고, 해안선 강조는 육지 mesh 에서 ±180° 자리와(10a 는) 단원 상자 테두리 위 마디를 뺀 것(`dropBoxEdges`, 2e-3°)이다. 캡처에서 상자 테두리 선·빈 곳이 없음을 확인했다(20°E·82°N·추코트카 −168°·날짜변경선).
  - **화면 밖 도형 미리 자르기(새로 넣음)**: 구드 단속 preclip(d3-geo-polygon 구면 다각형 자르기)은 점마다 무거워서, WIP 대로면 1024×768 동아시아 10a 전체 그리기가 265ms, 한반도가 267ms 였다(200ms 초과). 그래서 그리기 전에 바탕 지도를 화면 경위도 상자로 평면 자른다. `viewRect(proj, w, h)`는 화면 17×17 격자를 invert 해 모으고 15%(최소 1°) 여백을 둔다. 극이 화면에 보이면 경도 한 바퀴·위도는 극까지로 하고, 세계 보기는 null(자르지 않음)이다. `indexGeometry`(면·고리·줄 상자 미리 잼, level 마다 한 번) → `clipIndexed(idx, rect)`. 날짜변경선을 넘는 상자는 둘로 나눠 자른다. 면은 d3 `geoClipRectangle`을 (경도, −위도) 평면에서 써서 면 단위로 자르고, 구멍은 담긴 바깥 고리에 붙이며, 상자 위선 변은 1° 간격으로 촘촘히 둔다. **Sutherland–Hodgman 은 쓰지 않는다**: U 자 면을 상자 변 위 0 폭 다리로 잇는데, 그 다리가 구드 단속선을 지나면 preclip 이 면을 뒤집어 화면 전체를 칠한다(태평양 중심 구드 오스트레일리아 남부에서 발견). 줄은 상자에 걸치는 마디 묶음만 남긴다. 테스트(tests/atlas/viewClip.test.mjs): 5개 도법 × 중심 0·150 × 보기 9개(극·날짜변경선·구드 단속선 포함)에서 화면 안 육지 면적과 해안선 길이가 자르기 전과 같다. 단, 메르카토르 남극 보기는 d3 가 원본 남극 고리를 0.9% 덜 칠하는데, 화면 점 표본으로 보면 자른 쪽이 맞다. 레이어도 `view.geoRect`로 같은 자르기를 쓸 수 있다.
  - 실측(1024×768, 헤드리스 Chrome `--disable-gpu` swiftshader, 조각 embed 파일): 전체 다시 그리기 중앙값은 세계(k1) 6~9ms(구드 22ms), 아시아(k2, 50m) 15~22ms(구드 61ms), 동아시아(10a) 12~23ms(구드 72ms), 한반도(k22~34, 10a) 3~5ms(구드 17ms)다. 지명 배치+DOM 은 1~4ms. 즉시 도법 전환(그리기+지명)은 17~25ms, 구드로는 62~67ms다. 0.6초 보간은 약 60fps(프레임 4~12ms)이고, 끝 그리기는 13~61ms 다. 움직이는 동안 프레임은 3~11ms, 휠 확대 뒤 다시 그리기는 밀러 15ms, 구드 98ms 다. 모두 200ms 이하다.
  - 지명은 SVG text(`at-label at-label-<kind>`, 흰 halo `paint-order: stroke fill`)이고, 오프스크린 캔버스 measureText 로 재며 `createMeasureCache`를 한 번 만들어 계속 쓴다. 선·면 지명은 places 의 path 를 투영하고, 끊기면(`pathBroken`: 구드 틈·이음매) 점 지명으로 내린다. 자간 상한은 종류별(`SPREAD`)로 둔다. 가파른 줄(|각| ≥ 55°)은 글자를 세운다(`glyphLayout`).
  - `sims/atlas-u2-asia/main.js`는 임시 mount(바탕 지도 + 도법·중심 경도·보기 버튼, `root.atlasMap` 노출)이고, E1 에서 바꾼다. 보기 버튼 이름은 topics.json views 의 `label`이다. 조각 크기는 1,123 KB 다(`npm run embed -- atlas-u2-asia` 통과).
  - 그리기 순서: 계획의 「바다 → relief → 육지」를 **「바다 → 육지 → relief(multiply)」로 바꿨다**. 음영은 multiply 합성이라 밑에 육지 색이 있어야 하고(바다 위에 그리면 육지 채움이 덮어 버림), 육지 경로로 clip 하기도 쉽다. 나머지는 계획 순서 그대로다: 면 레이어(z < 50) → 호수·하천 → 국경 → 경위선 → 해안선 강조 → z ≥ 50 레이어 → 지구 테두리(rgba(70,110,130,.45), 0.8px).
  - 선 굵기는 확대에 따라 굵어진다(웹지도처럼 확대하면 선이 같은 굵기로 남아 가늘어 보이지 않게, 세계 보기에선 촘촘한 선이 뭉치지 않게). 계획 값(하천 0.6px·국경 0.6px·해안선 0.8px)은 세계 보기 값이다. 실제 값: 국경 k < 2 → 0.6px, k < 4 → 0.75px, 그 위 0.9px(실선). 해안선 강조 k < 2 → 0.6px, 그 위 0.8px. 경위선 0.5px 고정(간격 30°·10°(k ≥ 2)·5°(k ≥ 8)). 하천 `riverStyle(s, k)`: 기본 1.5 − 0.17·(s − 1)px(s = scalerank 1~6)에 배율 clamp(1 + 0.35·log2(k/2), 0.85, 1.6)을 곱하고 0.5~2.4px 로 자른다. s ≤ 5 는 늘, s 6 은 k ≥ 3 부터 보인다. 호수 `lakeVisible`: s ≤ 6 늘, 7 은 k ≥ 6, 8 이상은 k ≥ 10.
  - 지도 click: 끌기 직후 100ms 안의 click 만 zoomer 가 먹는다(끌기를 click 으로 오인하지 않게). 휠·끌기가 끝나고 다시 그리기(120ms) 전의 click 은 받는다(그동안도 화면 투영 = 지금 변환이라 맞히기가 맞음). 도법 전환 보간(0.6초) 중 click 은 화면 그림과 투영이 달라 무시한다. hover 는 움직이는 동안 건너뛴다(성능).
  - 캡처 `1024x768-seam-chukotka.png`(태평양 중심 밀러 k6, 가운데 −172°, 65°N) 오른쪽 끝 x≈694~695 의 가는 세로선은 상자 테두리나 ±180° 호가 아니라 **미국–캐나다 국경(141°W 경선)**이다. 화면 가운데 x 352 + 31° × 11.07px/° ≈ 695 로 위치가 맞고, 육지 위에만 국경색(#9a8f7f 반투명)으로 그려진다. 바로 오른쪽 x 696 의 연회색 1px 은 사이드바 테두리다. 단원 상자 경계 −168°(x≈398)와 72°N 에는 선이 없다.
  - (D3 코드 검토 반영)
    - 모듈 나눔: `mapView.js`에는 투영·확대 변환·맞히기만 남겼다(viewProjection, transformForCenter, invertChecked, centerOf, nearCenter, relativeTransform, normalizeBounds, kmPerPx, sortLayers, hitTest). `geoClip.js`는 viewRect, indexGeometry, clipIndexed, clipPolygon, clipLine, dropBoxEdges, boxPolygon 을 맡는다. `lineStyle.js`는 riverStyle, lakeVisible, graticuleStep, borderWidth, coastWidth 를 맡는다. `labelLayout.js`(labels.js 는 검토 끝난 배치 모듈이라 따로 둠)는 fontPx, trimPath, glyphLayout, pathBroken 을 맡는다. 테스트도 같은 이름으로 나눴다(mapView·geoClip·lineStyle·labelLayout.test.mjs). invertChecked 의 늘 거짓인 경도 검사 줄은 지웠다(되돌림 0.5px 검사가 이음매·틈을 잡는다).
    - 가벼운 다시 그리기: `map.invalidate({ svgOnly } = {})`는 캔버스와 SVG 레이어를 다시 그리고, svgOnly 면 SVG 레이어만 그린다. `map.refreshLayer(id)`는 그 레이어만 다시 그린다. SVG 레이어면 그 `<g>`만, 캔버스 레이어면 캔버스 전체를 그리고, 없는 id 면 false 를 돌려준다. 여러 번 불러도 한 rAF 로 모은다. 지명은 다시 놓지 않고 viewchange 도 내지 않는다. 움직이는 동안이나 도법 보간 중이면 건너뛰고, 멈출 때 settle 이 다 그린다. addLayer·removeLayer·clearLayers·setOptions(graticule·relief)·setReliefDrawer 도 이 길을 쓴다. setOptions({labels})는 지명만 다시 놓는다.
    - `map.setPlaces(places)`: 바탕 지도 캐시는 그대로 두고 지명만 다시 놓는다(E1 이 주제별 지명에 쓴다).
    - 레이어 계약에 `destroy?()`를 넣었다. removeLayer·clearLayers·map.destroy 때, 그리고 같은 id 를 다른 객체로 바꿀 때 한 번 불린다. 같은 객체를 다시 addLayer 하면(z 바꾸기 등) 부르지 않는다. 레이어 자료만 바뀌면 addLayer 를 다시 하지 말고 refreshLayer 를 쓴다.
    - 이벤트: click 은 `{ lonlat, xy, feature?, layerId?, detail }`이고, detail 은 브라우저 click 의 누른 횟수다(두 번째 누름이면 2, 두 번 누르면 확대도 함께 일어남). viewchange 는 보기 서명(도법·중심 경도·k·x·y·크기·상세도·움직임 여부)이 바뀔 때만 낸다. hover 는 끌기·움직이는 동안 건너뛰고, 멈추면(settle) 마지막 포인터 자리로 한 번 다시 낸다.
    - `map.view`는 보기가 바뀔 때만 새로 만드는 읽기 전용 객체다(같으면 같은 객체). center·kmPerPx 는 처음 읽을 때 한 번만 계산하는 지연 getter 라 프레임마다 역투영을 여러 번 하지 않는다. `map.layers`·`map.stats`는 읽기 전용 getter 다. stats 에 `countryIndexMs`를 더했다.
    - 크기 바뀜(resize)이 도법 보간 중에 오면 보간을 먼저 끝낸다. 보간 목표 변환은 옛 크기 기준이라, 끝낸 뒤 새 크기에서 화면 가운데 경위도와 k 를 지킨다(테스트로 확인). flyTo·fitBounds 가 투영할 수 없는 가운데·범위를 받으면 console.warn 을 한 번 남기고 지금 보기를 그대로 둔다(세계 보기로 조용히 튀지 않음). 다섯 도법은 모든 경위도를 유한하게 투영하므로 범위 쪽은 실제로는 걸리지 않는다.
    - 나라 맞히기 색인(50m 나라 geoBounds — 세계 보기에서 처음 만들면 50m 자료 풀기까지 약 23ms)은 첫 settle 뒤 requestIdleCallback(없으면 300ms setTimeout)으로 미리 만든다. 첫 hover 가 끊기지 않게 하려는 것이고, destroy 하면 예약을 취소한다.
    - DOM 테스트: 의존성을 더하지 않고 작은 가짜 DOM(`tests/atlas/helpers/fakeDom.mjs`)과 CSS import 를 빈 모듈로 바꾸는 로더 훅(`helpers/cssHooks.mjs`, node:module register)을 쓴다. `renderer.test.mjs`(11개)는 destroy 정리(리스너 0·ResizeObserver.disconnect·rAF·예약 취소), 보간 중 크기 바뀜, viewchange 조건, invalidate·refreshLayer, 같은 레이어 다시 넣기, setPlaces, click detail, 끌기 직후 click 막기, 투영 못 하는 flyTo, 건너뛴 hover, 나라 색인, view 캐시를 본다. zoomer.test.mjs 는 끌기 직후 100ms click 막기와 destroy 뒤 리스너 0을 본다. 가짜 캔버스는 아무것도 그리지 않으므로 픽셀은 헤드리스 Chrome 캡처로 본다.
    - 성능(1024×768 swiftshader, 같은 시간대에 바꾸기 전 3067f2e 와 번갈아 측정): 전체 다시 그리기 중앙값은 세계 밀러 7.5→7.6ms, 아시아 밀러 20.5→21.8ms, 아시아 구드 66.3→63.9ms, 동아시아 밀러 16.4→14.6ms, 동아시아 구드 78.0→75.2ms 다. 즉시 도법 전환은 15~23ms(구드 64~71ms)로 같고, 휠 뒤 다시 그리기는 밀러 11~14ms, 구드 91~96ms 다. 나빠지지 않았다. 첫 번째 측정 묶음은 PC 부하 때문에 둘 다 2배쯤 느려 버렸다.
    - 고치지 않고 남긴 것: M5 devicePixelRatio 만 바뀔 때(창을 다른 모니터로 옮김) ResizeObserver 가 불리지 않아 흐릿할 수 있다. 다음 크기 바뀜 때 맞춰진다. M10 포인터마다 getBoundingClientRect 를 부른다(측정상 문제 없음). M11 접근성(키보드 이동·aria)은 D7 UI 에서 한다. M13 글꼴이 늦게 불러와지면 지명 폭 재기가 어긋날 수 있지만, 시스템 글꼴(Pretendard 없으면 맑은 고딕)만 써서 그대로 둔다. M15 임시 mount 는 E1 에서 바꾼다.
  - 남은 것: 10a 해안선은 한반도 확대(k 30 안팎)에서 단순화(10%)가 보인다(D2 자료 문제, 필요하면 10a 단순화 비율을 올린다). 태평양 중심 구드는 110°E 단속선이 아시아를 가른다(도법 성질). places.json 의 「미국」은 알래스카에, 「대한민국」은 동해 쪽 줄에 놓여 있다(교과서 지면 위치 그대로).
- (D5) 음영 결정:
  - 자산: Natural Earth 1:50m Shaded Relief `SR_50M` v2.0.0(`https://naciscdn.org/naturalearth/50m/raster/SR_50M.zip`, 2026-10-09 받음, zip 11,380,369 B, sha256 ff810f5f…). 원본 `SR_50M.tif`는 10800×5400 8비트 회색, WGS84 등장방형 1/30°/px(−180..180, 90..−90, tfw 확인)이다. 공공 저작물(public domain)이다. 원본과 출처 메모는 `C:\Users\Public\atlas-work\raw\ne-raster\`(SOURCE.txt)에 있다. PIL LANCZOS 로 4096×2048 회색 JPEG(q80, optimize)로 줄여 `docs/assets/atlas/common/relief-4096.jpg`(470,343 B)에 두었다. 회색 값은 평지·바다 206, 1% 164, 최소 39(히말라야 그늘)다.
  - 주소: `relief.js`에 `RELIEF_URL`(공개 Pages 주소)과 `RELIEF_DEV_URL = '/docs/assets/atlas/common/relief-4096.jpg'`(vite 개발 서버 root 가 저장소라 그대로 나옴)을 둔다. 고르는 곳은 mount(`import.meta.env.DEV ? RELIEF_DEV_URL : RELIEF_URL`)다. 조각 빌드에서는 DEV 가 false 로 접혀 개발 주소가 번들에 남지 않는다(확인함). **조각 미리보기 확인법**: 조각 코드는 건드리지 않고, 헤드리스 Chrome CDP `Fetch.enable`로 RELIEF_URL 요청을 가로채 저장소 파일을 `Access-Control-Allow-Origin: *`와 함께 돌려준다(GitHub Pages 흉내, `atlas-work/d5/cdp.mjs`의 `INTERCEPT_URL/FILE/MODE`). 조각에 미리보기 전용 주소 주입 장치를 넣지 않은 까닭은, 공개 조각과 다른 경로를 시험하게 되고 붙여 넣는 쪽에서 건드릴 수 있는 손잡이가 생기기 때문이다. 이 방법이면 file:// 조각(출처 null)에서 공개 주소 그대로 crossOrigin 이미지 → getImageData 까지 지나간다. 공개 뒤 실제 Pages 의 CORS 헤더 확인은 E3(이미지 먼저 공개) 몫이다(아직 못 함).
  - 실패: `loadRelief`는 오류 이벤트(404, 그리고 crossOrigin 인데 허용 헤더가 없을 때도 이 길)와 getImageData SecurityError 를 모두 null + `console.warn` 한 줄(「지형 음영 생략(…): 주소」)로 바꾼다. mount 는 null 이면 훅을 등록하지 않는다. CDP 로 `nocors`(헤더 없음)와 `404`를 흉내 내 보니 콘솔 한 줄만 남고 오류는 없었다. 지도는 음영 끔 캡처와 픽셀까지 같았다(세계·히말라야). 같은 주소는 한 번만 불러온다(실패하면 다음 호출에서 다시). 픽셀은 R 채널만 Uint8Array(8 MB)로 남긴다. 처음 한 번 디코드+getImageData 는 약 20~40ms 다.
  - 그리기(`drawRelief`): 화면 2px 격자(1024×768 → 512×384 표본)로 한다. `invertGrid`는 4표본(8px)마다 놓인 마디만 `projection.invert`로 구하고 칸 안은 양선형 보간한다. 칸 가운데 하나를 정확히 구해 보간 값과 비교하고, 허용 오차는 max(0.01°, 표본 간격의 1/4)이다. 어긋나거나 마디가 지도 밖이면 그 칸만 표본마다 정확히 구한다. 네 마디와 가운데가 모두 지도 밖이면 건너뛴다. 마디·가운데는 forward 로 되돌려 0.5px 안인지도 본다. 로빈슨 invert 는 지도 밖에서 위도 수백만, 이퀄어스는 ±90 에 붙은 엉뚱한 경도를 내서 null 검사로는 지도 밖을 못 가린다. 이 검사가 없을 때 로빈슨 세계는 86ms, 있으면 18ms 였다. |위도| > 90 도 지도 밖으로 본다. 경도는 감싸지 않은 채 보간하고(날짜변경선 마디는 첫 마디 기준으로 ±360 펴기), 표본을 뽑을 때 감싼다. 이미지 가로도 마지막 열 ↔ 첫 열로 감싸 양선형으로 뽑으므로 날짜변경선 이음매가 없다.
  - 합성: 표본 회색 → 밝기 곡선 `reliefLut`(v ≥ ref → 255, 아래는 (v/ref)^gamma) → 1/2 크기 ImageData → 오프스크린 캔버스 → `drawImage`로 2배(부드럽게) 키워 `multiply`·`globalAlpha`로 얹는다. 육지 경로로 clip 한다. 10a 일 때 단원 상자 밖 50m 육지(under)는 렌더러가 새로 넘기는 `clipOutside()`(단원 상자 밖 evenodd 자르기) 안에서 under 로 한 번 더 자르고 얹는다. 렌더러 훅 인자에 `clipOutside`를 더했다(under 가 없으면 null, renderer.test 로 확인).
  - 모양값 `RELIEF_STYLE = { opacity: .45, ref: 206, gamma: 1.25 }`. 원본을 그대로 곱하면 평지 회색 206 때문에 육지 전체가 약 8.5% 어두워진다(#f2efe9 → 약 #ddd9d4). 그래서 평지(206)를 흰색으로 올려 평지는 육지색 그대로, 그늘만 어둡게 했다. 그러면 해 드는 비탈(206 초과)은 흰색으로 잘려 그늘만 남는 웹지도식 음영이 된다. gamma 1 은 아시아 전체 보기에서 조금 흐려 1.25 로 그늘 대비만 올렸다(평지는 그대로). 캡처에서 잰 육지 픽셀 비율(켬/끔, gamma 1)은 평균 0.97~0.99, 중앙값 0.99~1.00, 가장 어두운 곳 0.68(히말라야)이다. 즉 육지가 어두워지지 않는다. 바다 픽셀은 캡처 18쌍 모두 0개 바뀌었다. 한반도 확대(k 33)에서는 이미지 한 픽셀(0.088°)이 화면 약 12px 이라 부드럽게 퍼진 음영이 된다(4096 해상도 한계, 필요하면 단원 범위만 10m 음영을 따로 둘 수 있음).
  - 격자 크기: `nextStep(step, ms)`. 지난 계산이 예산 150ms 를 넘으면 1px 키우고(최대 4), 예산의 35% 보다 빠르면 줄인다(최소 2). 아래 실측에서는 늘 2px 이다(느린 기기 안전장치).
  - 실측(1024×768 swiftshader, 조각 embed, 같은 보기 다시 그리기 7번 중 뒤 5번 중앙값): 음영 계산은 세계 밀러 9.9ms, 아시아 밀러 14.5ms, 동아시아 밀러 9.9ms, 세계 구드 13.5ms 다(넷의 중앙값 약 12ms). 가장 무거운 것은 동아시아 구드 32ms, 아시아 구드 27.7ms, 로빈슨 15~18ms 다. 전체 다시 그리기(음영 포함, 괄호는 음영 끔)는 세계 밀러 21(9), 아시아 밀러 40(21), 동아시아 밀러 25(13), 한반도 밀러 14(3), 세계 구드 36(23), 아시아 구드 93(65), 동아시아 구드 109(73)ms 다. settle(그리기+지명) 최대는 동아시아 구드 114ms 로 모두 200ms 이하다. 음영을 켜면 음영 시간보다 조금 더 늘어난다(합성 뒤 스냅숏 drawImage).
  - 확대·이동 중에는 계산하지 않는다(렌더러 훅이 settle·invalidate 에서만 부름, 움직이는 동안은 스냅숏에 음영이 같이 들어 있음).
  - 임시 mount: 「지형 음영」 체크 상자(`ds-check`) → `map.setOptions({ relief })`. `root.atlasRelief = drawer`(drawer.stats = 계산 기록)는 확인용이다. E1 에서 바꾼다.
  - D3 검토 남은 것: `setProjection`·`setCenterLon`이 크기를 모를 때(W = 0) 일찍 돌아가면서 view 캐시를 비우지 않던 것을 고쳤다(renderer.test 로 확인).
  - 캡처: `C:/Users/Public/atlas-work/shots/d5/`(세계 밀러·구드·로빈슨 중심 0/150, 이퀄어스·메르카토르, 아시아 밀러·구드, 동아시아, 한반도, 히말라야, 그린란드·남극 구드 확대, 날짜변경선 −180/180 밀러 — 각각 `-on`/`-off`). 실패 흉내 `d5-fail-nocors/`·`d5-fail-404/`, 개발 서버 `d5-dev/`. 날짜변경선(태평양 중심 밀러 k6, 180° = x 352)의 열 차이는 음영 켬·끔이 같은 자리(x 350·352 = 180° 경위선)에서만 튀어 음영 이음매가 없다. 구드 그린란드 −40° 단속선 가장자리까지 음영이 붙어 있다.
  - (D5 검토 반영)
    - 렌더러: destroy 뒤에는 `setReliefDrawer`·`invalidate`·`refreshLayer`(false)·`setPlaces`·`setOptions`가 아무것도 하지 않는다. 읽기 전용 `map.destroyed`를 더했다. 테스트는 destroy 뒤 rAF 0개와 훅이 불리지 않음을 본다.
    - `attachRelief(map, { url, ...drawer 옵션 } = {}) → Promise<drawer | null>`: 주소 고르기(`import.meta.env?.DEV ? RELIEF_DEV_URL : RELIEF_URL`) → loadRelief → createReliefDrawer → setReliefDrawer 를 한 번에 한다. 시작할 때나 불러온 뒤 `map.destroyed`면 붙이지 않고 null 을 돌려준다. 임시 mount 는 `attachRelief(map).then((d) => { root.atlasRelief = d; })` 한 줄이다. 조각 빌드에서 `import.meta.env?.DEV`는 false 로 접혀 개발 주소가 번들에 없다(확인함). 개발 서버에서는 저장소 파일로 나온다(확인함). 가짜 Image 테스트: 성공하면 붙임, 실패하면 null, 불러오는 사이 destroy 면 붙이지 않음, 이미 destroy 된 지도, 주소 기본값 = 공개 주소.
    - `createReliefDrawer`는 첫 계산(JIT 데우기·첫 할당) 시간을 격자 크기 고르기에 쓰지 않는다. 시간 재기는 `clock` 옵션으로 바꿀 수 있다(테스트용).
    - 가짜 캔버스 테스트: 그리기 순서는 save → 육지 path → clip → drawImage → restore, 그다음 save → clipOutside → under path → clip → drawImage → restore 다. 이미지·view 크기·육지가 없으면 null 을 돌려주고 아무것도 그리지 않는다. loadRelief 는 실패하면 경고 한 줄을 남기고 다음 호출에서 다시 시도하며, 성공한 주소는 다시 불러오지 않는다.
    - 투명 가장자리: 지도 밖 표본(NaN)은 투명이라 키울 때 지도 가장자리·구드 틈 언저리 반 칸이 반투명으로 섞인다. 육지 자르기 밖이라 보이지 않는다(코드 주석).
    - **상자 테두리 선(10a ↔ 50m)**: 음영과 상관없이 바탕 지도에 선이 있었다. 20°E 와 15°S(육지를 지나는 단원 상자 테두리)에서 육지색 (242,239,233)이 1px 열에서 약 (225,232,230)으로 떨어졌다. 10a 도형 끝과 50m evenodd 자르기가 둘 다 경계 픽셀을 반쯤만 칠해 바다색이 비친 것이다. D3 캡처 확인에서는 못 봤고, 4배 확대에서 보인다. 고친 방법: 10a 일 때 육지를 칠한 직후 50m 육지 안에서만 상자 테두리를 육지색 1.5px 로 긋는다(`sealUnitSeam`, 하천·국경보다 먼저). 고친 뒤 테두리 열 R 값은 240~242 로 이웃과 같다. 음영 켬에서도 테두리 열이 이웃보다 1 단계 이상 다르지 않다. 비용은 1~7ms 다(동아시아 구드 음영 끔 73→80ms, settle 최대 120ms). 82°N·72°N·−168° 테두리는 육지를 지나지 않는다(세베르나야제믈랴·프란츠요제프 제도는 81.8°N 아래, −168° 는 베링 해협). 180°(상자 1·2 모두 10a)에는 선이 없다. 캡처: `C:/Users/Public/atlas-work/shots/d5-edge/`(경위선 켬, 고치기 전), `d5-edge-nograt/`(경위선 끔, 고치기 전, `zoom-e20-libya-*.png`에 선이 보임), `d5-edge-sealed/`(고친 뒤, `zoom-e20-libya-on.png`).
- (D6) 레이어 결정:
  - 파일: `src/atlas/layers.js`(레이어 종류), `src/atlas/layerStyle.js`(순수 함수: 범례 투명도·확대별 크기·곡선·화살촉·선 잇기/나누기·거리·선 위 글자 자리·이미지 색인·색·기호 모양·화면 범례 항목·격자 보간), `src/atlas/fitProject.js`(교과서 투영식 경위도 → 지면 pt, 앱용). 테스트 `tests/atlas/layerStyle.test.mjs`·`fitProject.test.mjs`(georef makeConverter.apply 와 1e-6pt 안, TPS 있는 p16-asia 포함)·`atlasLayers.test.mjs`(가짜 DOM + 그리기 기록 캔버스).
  - 인터페이스: `areaLayer(id, geojson, opts)`, `symbolLayer(id, points, opts)`, `flowLayer(id, lines, opts)`, `markerLayer(id, markers, opts)`(+ `layer.select(id|null)`·`selected()`), `imageLayer(id, overlayJson, opts)`, `combineLayers(id, parts)`, `layerFromRef(refEntry, data, { legend, map, onPick })`. 공통 opts = `{ legend, map, layerId }`. 모두 렌더러 계약 `{id, z, draw?, drawSvg?, hit?, destroy?}`이고, `layer.meta`(자료 맨 위 properties, layerFromRef 는 주제 항목 값 — title·legendTitle·lineLegendTitle·credit·note·group·page·approx·approxNote·approxReason)·`layer.legendItems`(화면 범례 항목)·`layer.legend`(layerFromRef)를 둔다. z: 이미지 5, 면 10, 기호 60, 흐름선 70, 핀 80(`LAYER_Z`).
  - **지도와의 연결 = 레이어 공장에 `{ map }`을 넘긴다**(렌더러는 그대로). 레이어가 스스로 `legend.onChange → map.refreshLayer(layerId)`, `map.on('hover')`를 구독하고 `destroy()`(렌더러가 removeLayer·clearLayers 때 부름)에서 푼다. map 을 안 주면 구독하지 않는다(부르는 쪽이 refreshLayer). `layerId` = 렌더러에 올린 id(기본 id) — `combineLayers` 의 부분 레이어는 부모 id 로 다시 그리고 hover 를 받는다(부분 id 는 렌더러에 없어 refreshLayer 가 false 이므로).
  - **topics `type` → 레이어**: area → areaLayer, symbol → symbolLayer, image → imageLayer, **flow → combineLayers(면 areaLayer + 흐름선 flowLayer)** — 24쪽 교역 레이어는 교역액 7단계 면과 흐름선을 한 자료·한 범례(9항목)로 담고 있어 렌더러에는 id 하나(`layer-p24-trade`)로 올린다. legend 를 안 주면 범례 항목이 있을 때 새 legendState(분류 = legendItems 의 cls 전부, geometry:false 항목 포함 — 토글해도 오류 없게)를 만든다. 밀도 음영 범례는 cls 가 없어 `d1`…`d5`(읽는 순서)를 붙인다. 그 밖의 옵션은 이미지 레이어로 넘긴다(load·onLoad·dimAlpha).
  - 범례: 고르지 않은 분류는 면 = fillOpacity(0.85) × 0.15, 선·기호·흐름선 = 0.2(기호는 opacity 속성, 이미지는 화소 알파 × 0.15 — 불러올 때 화소마다 가장 가까운 범례 색을 미리 정함). **hit 은 흐린 분류를 맞히지 않는다**(바탕 나라가 맞음). 범례가 바뀌면 그 레이어만 refreshLayer — 캔버스 레이어(면·이미지)는 렌더러 규칙상 캔버스 전체를 다시 그린다(아시아 밀러 약 40~90ms).
  - 강조(hover): 렌더러 hover 의 feature 가 자기 것이면 — 면 = 그 분류 전체 윤곽(SVG path 하나, `geoPath(view.projection)`, 화면 경위도 상자로 자른 도형, 짙은 남색 1.8px), 선 = 굵은 반투명 띠, 기호·흐름선·핀 = `is-hover` 클래스(테두리 남색). 움직이는 동안은 숨기고 settle 뒤 렌더러가 다시 내는 hover 로 돌아온다. 말풍선 글은 `feature.properties.label`(핀·이미지 hit 도 Feature 모양으로 label 을 준다) — D7 이 쓴다.
  - 면: 분류마다 한 번 채움(`clipIndexed(indexGeometry(도형), view.geoRect)` — 렌더러와 같은 화면 상자 미리 자르기), 그다음 빗금 면, 그다음 선. 빗금(21쪽 고산 기후 `pattern:'hatch'`) = 8px 오프스크린 캔버스 타일 → `createPattern`(data: 없음) + 0.6px 윤곽. 고산 기후 면은 다른 기후 면 위에 겹쳐 그려 교과서처럼 아래 색이 비친다. 선(등온선 `type:'isotherm'`, 카슈미르 주장 국경·정전 라인 `type:'line'`) = 흰 테두리(굵기 + 2px) 뒤 색 선, 굵기 `lineWidthPx`(등온선 0.8pt·국경선 1.2pt 기준), 정전 라인은 범례 `dashed` 로 점선. 등온선 값 글자(「20」 등)는 화면 안 가장 긴 조각의 길이 가운데에 선 방향으로 흰 테두리 글자. 카슈미르 `geometry:false` 종교 3분류는 그릴 것이 없어 범례 항목만.
  - 기호: 한 번 만들고 프레임마다 transform 만 고친다(값이 같으면 속성을 건드리지 않음). 모양은 반지름 1 경로 + `vector-effect: non-scaling-stroke` 흰 테두리. 지름 = `symbolPx(size pt, k)` = size × 2.4 × clamp((k/2.2)^0.5, 0.75, 2), 4~18px. 화면 밖(20px 여유)은 display none. 누르면 `onPick(feature)` + stopPropagation.
  - **기호 모양은 생성물에 싣는다**: 설정 `layers[id].legendShapes`(범례 이름 → circle·square·diamond·triangle·triangle-down·bar) → build_layers 가 범례 항목 `shape` 로. 24쪽 자원 = 철광석·구리·주석 마름모, 석유 원, 천연가스 거꾸로 선 세모, 석탄 네모(지면에서 눈으로 확인). 23쪽 인구 = bar. 싱가포르 사원은 기본 원. 범례에 없는 이름이면 빌드 실패.
  - **인구 막대(shape bar)**: 1억 명 = 한 칸(`barMetrics`: 칸 7px × clamp((k/2.2)^0.5, 0.5, 1.8), 3~12px, 너비 1.2칸, 틈 0.18칸) + 사람 아이콘(머리·몸) + 나라 이름(흰 테두리 굵은 글자). 교과서에서 지시선으로 막대를 따로 놓은 3개국(파키스탄·방글라데시·필리핀)은 **막대 자리를 생성물에 더했다**: symbols.py `density_markers` 가 지시선이 있으면 `bar`(막대 밑 가운데, 지면 pt)도 남기고 build_layers 가 `barAt`(경위도)으로 바꾼다. 앱은 막대를 barAt 에 세우고 나라 자리(점)에서 막대 상자 가장 가까운 점까지 점선을 긋는다. 다시 뽑은 것: `build_layers.mjs p23-density-cities p24-resources --extract`(도형은 바이트까지 그대로, properties 만 늘어남).
  - 흐름선: 자료 좌표 순서 = 꼬리 → 화살 끝(수입 = 상대국 → 우리나라, 수출 = 우리나라 → 상대국, layers.test 가 확인). 날짜변경선에서 나뉜 조각(MultiLineString, 미국·멕시코)은 `joinParts`로 경도를 이어 하나로 만든 뒤 화면에서만 끊는다(`splitJumps`: 마디의 경위도 가운데점을 투영한 자리가 화면 가운데점에서 max(4px, 길이 × 0.3) 넘게 벗어나면 이음매 — 날짜변경선·구드 틈 모두). 경로는 **교과서 선 모양(지면에서 따라 그린 꺾은선)을 그대로 쓰고 마디를 조절점으로 이웃 가운데점끼리 이차 베지어로 잇는다**(`quadPath`, 끝점 정확히 지남). 두 점뿐인 선이면 베지어 하나(`bendControl`, 진행 방향 왼쪽으로 길이 × 0.18). 굵기 = `flowWidthPx`(범례 0.6/1/1.5/2pt × 2.2 × clamp((k/1.2)^0.35, 0.8, 1.8), 1.2~9px), 흰 테두리 = 굵기 + 2.4px. 굵은 선을 먼저(아래) 그린다. 화살촉 = 선마다 SVG `marker`(userSpaceOnUse, orient auto, 길이 max(6, 3w)·반폭 max(3, 1.6w), 흰 테두리, 문서 안 겹치지 않는 id `at-arrow-<n>`). 색은 생성물 그대로(수입 #0066b3 파랑, 수출 #ed0c6e 빨강 — 「짙은 초록·짙은 빨강」은 초록 나라 위에 겹쳐 보인 색이라는 C1 결정대로).
  - 핀: 교과서 보라 물방울(#7251a1, 흰 구멍에 번호 = `m.number ?? m.photo.pin ?? 순서`). 누르면 고르고(주황, 1.25배, 맨 위로) `onPick(marker)`. hit 은 머리 원과 꼬리 막대.
  - **이미지 레이어(23쪽 밀도 음영)**: 화면 2px 격자 → `invertGrid`(relief.js 그대로 — 화면 투영 invert·되돌림 검사) → 경위도 → `makeFitForward(fit)` → 지면 pt → 이미지 화소(가까운 화소, 투명은 건너뜀) → 1/2 크기 ImageData → drawImage 로 키움(부드럽게), 투명도 0.85. 투영식 계산은 4표본 마디만 정확히 하고 칸 안은 보간(`mapGridBlocks`, 칸 가운데 검사 0.3화소) — 이것으로 이미지 그리기가 22~41ms → 17~21ms. 화면 경위도 상자가 이미지 위도 범위와 안 겹치면 건너뜀. 불러오기는 `loadImageData`(new Image + crossOrigin, 같은 주소 한 번, 실패하면 null + 경고 한 줄 — relief 와 같음), 불러오면 refreshLayer. 실패하면 `layer.failed` 이고 아무것도 그리지 않는다. hit = 그 화소의 범례 단계(「100~200」 등).
  - **fit 을 생성물에 싣는다**: overlay JSON 에 `fit: {family, params, sim, tps?}`. `pt2lonlat.mjs --fit <지도>`(`browserFit` — 통계·기준점은 뺌) → `pins.node_fit` → `density_overlay.build_overlay`. 다시 뽑은 것: `extract_images.py --overlays`(PNG 바이트까지 그대로, JSON 에 fit 만 늘어남). 앱 쪽 `fitProject.js`는 georef.mjs 를 끌어오지 않고(맞추기 코드·d3-geo-projection 이름 공간 import 가 조각에 딸려 오지 않게) 도법 8개·닮음 변환·TPS 보정(껍질 밖 줄어듦 포함)만 같은 식으로 둔다.
  - 개발 서버에서 밀도 음영은 아직 공개 전이라 임시 mount 가 공개 주소를 `/docs/assets/…`로 바꿔 넘긴다(`import.meta.env.DEV` 에서만, 조각에는 접혀 없음). 조각 확인은 D5 처럼 CDP Fetch 로 Pages 주소(`…/assets/*`)를 저장소 파일 + ACAO:* 로 대답(`atlas-work/d6/cdp.mjs`).
  - 임시 mount(`sims/atlas-u2-asia/main.js`, E1 에서 바꿈): 「주제 레이어(임시)」 고르기(주제마다 레이어, 같은 주제에서 이름이 같은 레이어 = 인구 분포 음영 + 1억 명 막대는 함께, 핀 묶음 4개) + 범례 목록(누르면 그 분류만, 「전체 보기」) + 출처·위치 근사 글 + 「가리킨 것」(hover label). 고르면 그 주제 view(싱가포르·카슈미르는 그 바로가기, 교역은 날짜변경선을 건너는 [55, −45, −60, 72])로 맞춘다. 확인용 `root.atlasShowLayer(id)`·`root.atlasLayers`·`root.atlasLayerChoices`.
  - 조각 크기 1,131 → **1,775 KB**. 계획은 「레이어 자료가 이미 들어 있어 크게 늘지 않음」이었지만, 지금까지 main.js 가 layers.js(레이어 자료 12개)를 import 하지 않아 트리 셰이킹으로 빠져 있었다. 늘어난 644KB 중 약 615KB 가 레이어 자료(C1 예산 그대로), 나머지가 코드다. 목표(1~2MB) 안.
  - 성능(1024×768 swiftshader, 조각, **주제 레이어 12개 + 핀 4묶음을 한꺼번에** 올린 최악 조건, redraw 5번 중앙값/최대): settle 아시아 밀러 89/97ms, 동아시아 밀러 67/71, 메르카토르 61~78, 로빈슨 86~91, 이퀄어스 90~92, **구드 아시아 171/173, 동아시아 187/193ms**(모두 200ms 이하). 레이어 몫(면·이미지 캔버스 합계) 밀러 25~35ms, 구드 67~68ms(구드 단속 자르기). 끌기 중 rAF 간격 중앙값 16.5~16.9ms(최대 18~22), SVG 레이어 갱신 프레임당 0.6~1.0ms(최대 2.6), 캔버스 옮기기 3ms(구드 9ms). 한 주제만 띄우면 settle 은 바탕 지도 + 수 ms(기후 구분 면 4ms, 밀도 음영 17~20ms).
  - 캡처 `C:/Users/Public/atlas-work/shots/d6/`: `miller-c0-<레이어>.png`(14개 + 교역 c150), 상호작용 `ix-*.png`(기후 hover 윤곽·사막 기후만, 1월 로빈슨, 자원 석탄만, 교역 hover·수출만·로빈슨/구드/이퀄어스, 밀도 로빈슨/구드/200 이상, 구드 기후·종교·증가율·수출품, 세계유산 핀 고름, 끌기 중), 교과서 지도 자르기 `tb/<지도>.png`(200dpi). 교과서와 대조: 분류 색·범례 수 같음, 기후 구분·종교·증가율·수출품 면 모양 같음(고산 기후 빗금이 티베트·파미르 위), 1월·7월 등온선 10개와 강수 7단계, 카슈미르 세 지배 지역·주장 국경 3·정전 라인 점선, 자원 기호 107개(모양 4종), 싱가포르 76개, 인구 막대 7개(칸 수 = 값, 지시선 3개), 교역 흐름선 20개(수출 화살촉은 상대국, 수입 화살촉은 우리나라), 밀도 음영이 해안선·국경과 맞음.
  - 남은 것(E1·D7 몫): ① **싱가포르 사원 지도는 확대 상한(40배)으로는 섬이 화면 30px 남짓이라 기호 76개가 한 덩어리로 겹친다**(싱가포르 범위 0.4°를 화면에 맞추려면 약 900배, 바탕 지도 10m 해안선도 거칠다) → 싱가포르는 따로 띄우는 확대 상자(인셋)나 그 보기만 확대 상한을 올리는 방법을 E1 에서 정해야 한다. ② 지명은 레이어 기호를 피하지 않는다(인구 막대 이름 「중국」이 「하노이」와 겹침 등). ③ 카슈미르 주장 국경 셋이 겹치는 구간은 맨 위 선만 보인다(교과서는 나란히 비켜 그림). ④ 등온선 값 글자는 선 가운데 하나뿐이다(교과서는 선 끝). ⑤ 범례를 바꿀 때 캔버스 레이어는 캔버스 전체를 다시 그린다(렌더러 refreshLayer 규칙).
