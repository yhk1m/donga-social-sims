// tests/atlas/compareOutline.test.mjs — U5-3i 같은 축척의 우리나라 윤곽(registerLayerType 'compareOutline' — 42쪽 sameLat · 43쪽 antipode, 교사 §8 Q3 답).
// 끌기 = 구면 회전(넓이 중심 c → 놓은 자리 p — 도착지에서 북쪽이 위), 키보드 화살표 1°, 「교과서 자리로」(지도 도구 확대·축소 단추 묶음에 단추 하나).
// 따로 된 프로세스라 등록 전(모르는 레이어 종류)을 먼저 본다. 렌더러는 가짜 DOM(helpers/fakeDom.mjs — 이벤트는 대상 요소에서만, 버블 없음).
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { register } from 'node:module';
import { geoDistance, geoCentroid, geoArea } from 'd3-geo';
import { REPO, readJson } from '../../scripts/atlas/geo_util.mjs';
import { installFakeDom } from './helpers/fakeDom.mjs';

register('./helpers/cssHooks.mjs', import.meta.url);
const dom = installFakeDom();
const { layerFromRef } = await import('../../src/atlas/layerRef.js');
const { createMap } = await import('../../src/atlas/renderer.js');
const { mapTools } = await import('../../src/atlas/ui.js');
const AX = await import('../../src/atlas/americasExtra.js');
const basemap = readJson(path.join(REPO, 'sims/atlas-u2-asia/data/basemap.json'));
test.after(() => dom.restore());

const near = (a, b, eps, msg) => assert.ok(Math.abs(a - b) <= eps, `${msg ?? ''} ${a} ≠ ${b}`);
const walk = (n, ok, out = []) => { if (ok(n)) out.push(n); for (const c of n.childNodes || []) walk(c, ok, out); return out; };
// 우리나라 어림 윤곽(본토 + 제주 + 독도 — 시험용 작은 다각형, 바깥 고리 시계 방향)
const KOREA = { type: 'MultiPolygon', coordinates: [
  [[[124.6, 40.0], [129.0, 42.9], [130.6, 42.4], [129.4, 36.0], [128.6, 35.0], [126.4, 34.4], [126.1, 36.7], [126.0, 37.7], [124.6, 40.0]]],
  [[[126.2, 33.4], [126.6, 33.6], [126.9, 33.4], [126.5, 33.2], [126.2, 33.4]]],
  [[[131.85, 37.24], [131.87, 37.25], [131.87, 37.23], [131.85, 37.24]]],
] };
const outline = (mode, home, extra = {}) => ({
  type: 'FeatureCollection',
  properties: { id: `p4x-korea-${mode}`, title: '우리나라', layerType: 'compareOutline', mode, home, label: '같은 축척의 우리나라', legend: [], ...extra },
  features: [{ type: 'Feature', properties: { name: '우리나라' }, geometry: KOREA }],
});
const verts = (g) => g.coordinates.flat(2);
const centerOf = (L) => geoCentroid(L.geometry());

test('등록 전: compareOutline 은 모르는 레이어 종류', () => {
  assert.throws(() => layerFromRef({ ref: 'k', type: 'compareOutline' }, { k: outline('sameLat', [-133, 38]) }), /모르는 레이어 종류 compareOutline/);
});

test('moveTo(c → p): 모든 꼭짓점 쌍 대권 거리 그대로(1e-9), c 가 p 로, 도착지에서 북쪽이 위 · 같은 위도 동서 이동은 위도 그대로', () => {
  const c = geoCentroid(KOREA), p = [-133.3, 37.8];
  const f = AX.moveTo(c, p);
  const vs = verts(KOREA), ws = vs.map(f);
  for (let i = 0; i < vs.length; i++) for (let j = i + 1; j < vs.length; j++) near(geoDistance(ws[i], ws[j]), geoDistance(vs[i], vs[j]), 1e-9, `${i}-${j}`);
  const q = f(c); near(q[0], p[0], 1e-9); near(q[1], p[1], 1e-9);
  const n = f([c[0], c[1] + 2]); near(n[0], p[0], 1e-9, '북쪽 점은 같은 경도'); assert.ok(n[1] > p[1]);
  const g = AX.moveTo([127, 38], [-130, 38]);   // 같은 위도로만 옮기면 모든 점의 위도 그대로(극축 회전)
  for (const v of vs) near(g(v)[1], v[1], 1e-9);
  const z = AX.moveTo([10, 20], [10, 20]); near(z([30, 40])[0], 30, 1e-9);
});

test('outlineBase: antipode 는 꼭짓점마다 (λ+180, −φ)(거울상 — 경도 [-180, 180]), sameLat 은 그대로 · 넓이 중심', () => {
  const a = AX.outlineBase(outline('antipode'));
  const vs = verts(KOREA), ws = a.geom.coordinates.flatMap((pg) => pg.flatMap((r) => [...r].reverse()));   // 고리 차례는 뒤집힘(구면 방향 — 작은 면 그대로)
  ws.forEach((w, i) => { near(w[0], vs[i][0] - 180, 1e-12); near(w[1], -vs[i][1], 1e-12); });
  near(geoArea(a.geom), geoArea(KOREA), 1e-12, '넓이 그대로(바깥 면 4π − 아님)');
  const c = geoCentroid(KOREA);
  near(a.c0[0], c[0] - 180, 1e-9); near(a.c0[1], -c[1], 1e-9);
  const s = AX.outlineBase(outline('sameLat', [-133, 38]));
  assert.deepEqual(verts(s.geom), vs);
});

test('등록 뒤: 레이어 처음 자리 = home(sameLat 은 교과서 자리, antipode 는 home 이 없으면 실제 대척점), 범례 없음·장애물 없음', () => {
  AX.installAmericasExtras();
  const L = layerFromRef({ ref: 'k', type: 'compareOutline', legend: false }, { k: outline('sameLat', [-133.3, 37.8]) });
  const c = centerOf(L); near(c[0], -133.3, 1e-6); near(c[1], 37.8, 1e-6);
  assert.deepEqual(L.legendItems, []); assert.deepEqual(L.labelObstacles(), []);
  const vs = verts(KOREA), ws = verts(L.geometry());     // 실제 크기(대권 거리 그대로)
  near(geoDistance(ws[0], ws[3]), geoDistance(vs[0], vs[3]), 1e-9);
  const A = layerFromRef({ ref: 'a', type: 'compareOutline', legend: false }, { a: outline('antipode') });
  const k = geoCentroid(KOREA), ca = centerOf(A);
  near(ca[0], k[0] - 180, 1e-6); near(ca[1], -k[1], 1e-6);
  assert.deepEqual(A.home().map((x) => Math.round(x * 1e6) / 1e6), [Math.round((k[0] - 180) * 1e6) / 1e6, Math.round(-k[1] * 1e6) / 1e6]);
});

function setupMap({ w = 1000, h = 800 } = {}) {
  const stage = document.createElement('div');
  stage._rect = { left: 0, top: 0, width: w, height: h };
  const map = createMap(stage, { basemap, places: [] });
  const svg = stage.childNodes.find((n) => n.classList.contains('at-overlay'));
  svg._rect = stage._rect;
  dom.flushRaf();
  return { stage, map, svg };
}

test('렌더러: 윤곽 위 끌기 = 윤곽만(지도 안 옮김 · 이벤트 멈춤) · 지도 끌기 = 지도만 · 화살표 1° · 「교과서 자리로」 = home · destroy 는 단추를 지움', () => {
  const { stage, map, svg } = setupMap();
  const tools = mapTools(stage, map);
  map.flyTo({ center: [-130, 35], zoom: 3 }, 0);
  const L = layerFromRef({ ref: 'layer-p42-korea', type: 'compareOutline', legend: false }, { 'layer-p42-korea': outline('sameLat', [-133.3, 37.8]) }, { map });
  map.addLayer(L); dom.flushRaf();
  const pathEl = walk(svg, (n) => n.getAttribute?.('class') === 'at-outline-shape')[0];
  assert.ok(pathEl && pathEl.getAttribute('d'), '윤곽 경로가 그려짐');
  const gEl = walk(svg, (n) => n.getAttribute?.('class') === 'at-outline')[0];
  assert.equal(gEl.getAttribute('tabindex'), '0');
  assert.ok(walk(svg, (n) => n.tagName === 'text').some((t) => t.textContent === '같은 축척의 우리나라'), '지면 글자');
  // 윤곽 위 끌기: 가운데 화면 점에서 오른쪽 100px
  const v0 = map.view, c0 = map.project([-133.3, 37.8]);
  // 윤곽 처리기는 stopPropagation + preventDefault 를 함께 부름(가짜 DOM 은 버블이 없어 preventDefault 로 확인 — 실제 브라우저에서는 svg 의 zoomer 까지 안 감)
  const ev = (el, type, x, y, extra = {}) => el.dispatch(type, { pointerId: 7, pointerType: 'mouse', button: 0, buttons: 1, clientX: x, clientY: y, ...extra });
  const handled = [ev(pathEl, 'pointerdown', c0[0], c0[1]), ev(pathEl, 'pointermove', c0[0] + 50, c0[1]), ev(pathEl, 'pointermove', c0[0] + 100, c0[1]), ev(pathEl, 'pointerup', c0[0] + 100, c0[1], { buttons: 0 })];
  dom.flushRaf();
  assert.ok(handled.every((e) => e.defaultPrevented), '윤곽이 끌기 이벤트를 멈춤(zoomer 가 받지 않음)');
  assert.ok(ev(pathEl, 'click', 0, 0).defaultPrevented, '누르기도 멈춤(밑 나라를 고르지 않음)');
  const v1 = map.view;
  assert.deepEqual([v1.x, v1.y, v1.k], [v0.x, v0.y, v0.k], '지도는 그대로');
  const c1 = centerOf(L), want = map.invert([c0[0] + 100, c0[1]]);
  near(c1[1], 37.8, 1e-6, '밀러에서 가로로 끌면 위도 그대로');
  near(c1[0], want[0], 1e-6, '가운데가 손가락을 따라감');
  // 지도 끌기(무대 svg): 지도가 옮겨지고 윤곽 경위도는 그대로
  ev(svg, 'pointerdown', 300, 300); ev(svg, 'pointermove', 340, 320); ev(svg, 'pointermove', 380, 340); ev(svg, 'pointerup', 380, 340, { buttons: 0 });
  dom.flushRaf();
  assert.notEqual(map.view.x, v1.x, '지도 옮김');
  const c2 = centerOf(L); near(c2[0], c1[0], 1e-9); near(c2[1], c1[1], 1e-9);
  // 키보드: 화살표 1°(기본 동작·무대 화살표 옮기기 막음)
  const key = (k) => gEl.dispatch('keydown', { key: k });
  const e1 = key('ArrowRight'); assert.ok(e1.defaultPrevented);
  key('ArrowUp'); key('ArrowUp');
  const c3 = centerOf(L); near(c3[0], c2[0] + 1, 1e-6); near(c3[1], c2[1] + 2, 1e-6);
  assert.equal(key('a').defaultPrevented, false, '다른 키는 그대로');
  // 「교과서 자리로」: 지도 도구 확대·축소 묶음의 단추
  const btn = walk(tools.el, (n) => n.getAttribute?.('aria-label') === '교과서 자리로')[0];
  assert.ok(btn, '단추가 있음');
  assert.ok(walk(btn, (n) => n.tagName === 'svg').length, '선 아이콘');
  btn.dispatch('click'); dom.flushRaf();
  const c4 = centerOf(L); near(c4[0], -133.3, 1e-6); near(c4[1], 37.8, 1e-6);
  map.removeLayer('layer-p42-korea');
  assert.equal(walk(tools.el, (n) => n.getAttribute?.('aria-label') === '교과서 자리로').length, 0, '레이어를 내리면 단추도 없어짐');
  map.destroy();
});

test('지구본: 뒷면이면 경로가 비고, 윤곽 끌기도 지구본에서 같은 규칙(놓은 자리 = 손가락 경위도)', () => {
  const { map, svg } = setupMap();
  AX.globeView(map, { rotate: [-47, 38] });   // 원판 가운데 (47°, −38°) = 윤곽 자리의 대척점 근처
  const L = layerFromRef({ ref: 'k2', type: 'compareOutline', legend: false }, { k2: outline('sameLat', [-133.3, 37.8]) }, { map });
  map.addLayer(L); dom.flushRaf();
  const pathEl = walk(svg, (n) => n.getAttribute?.('class') === 'at-outline-shape')[0];
  assert.ok(!pathEl.getAttribute('d'), '원판 뒤면 그리지 않음');
  AX.globeView(map, { rotate: [133, -38] }); dom.flushRaf();
  assert.ok(pathEl.getAttribute('d'), '앞면이면 그림');
  const c0 = map.project([-133.3, 37.8]);
  const ev = (type, x, y) => pathEl.dispatch(type, { pointerId: 3, pointerType: 'mouse', button: 0, buttons: 1, clientX: x, clientY: y });
  ev('pointerdown', c0[0], c0[1]); ev('pointermove', c0[0] - 60, c0[1] + 40); ev('pointerup', c0[0] - 60, c0[1] + 40);
  const want = map.invert([c0[0] - 60, c0[1] + 40]), c1 = centerOf(L);
  near(c1[0], want[0], 1e-6); near(c1[1], want[1], 1e-6);
  map.destroy();
});
