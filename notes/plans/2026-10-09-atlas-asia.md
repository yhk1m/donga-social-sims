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
test('개수: 지형 핀 8, 기후 그래프 마커 5, 세계유산 11', () => {
  const by = Object.fromEntries(T.map((t) => [t.id, t]));
  assert.equal(by.relief.markers.length, 8); assert.equal(by.climate.markers.filter((m) => m.chart).length, 5); assert.equal(by.heritage.markers.length, 11);
});
test('빈 글 없음, 참조한 레이어·사진·그래프가 모두 있음', () => {
  for (const t of T) {
    for (const l of t.layers) assert.ok(existsSync(`sims/atlas-u2-asia/data/${l.ref}.json`), l.ref);
    for (const m of t.markers) { assert.ok(m.title && m.text, m.id); if (m.photo) assert.ok(existsSync(`docs/assets/atlas/u2/photo/${m.photo}.jpg`), m.photo); }
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
