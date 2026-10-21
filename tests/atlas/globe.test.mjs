// tests/atlas/globe.test.mjs — U5-3c 지구본 보기(registerProjection 'globe')·경로 화살표(registerLayerType 'pathFlow').
// 따로 된 프로세스(node --test)라 등록 전(옛 동작 — 모르는 도법·모르는 레이어 종류)을 본 뒤 installAmericasExtras() 로 등록한다.
// 렌더러는 가짜 DOM(helpers/fakeDom.mjs)으로 상태·이벤트만 본다(그림은 헤드리스 Chrome 확인 그림).
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { register } from 'node:module';
import { geoEquirectangular, geoPath, geoDistance } from 'd3-geo';
import { REPO, readJson } from '../../scripts/atlas/geo_util.mjs';
import { installFakeDom } from './helpers/fakeDom.mjs';

register('./helpers/cssHooks.mjs', import.meta.url);
const dom = installFakeDom();
const { PROJECTIONS, makeProjection } = await import('../../src/atlas/projections.js');
const { viewProjection } = await import('../../src/atlas/mapView.js');
const { layerFromRef } = await import('../../src/atlas/layerRef.js');
const { createZoomer } = await import('../../src/atlas/zoomer.js');
const { invertGrid } = await import('../../src/atlas/relief.js');
const { createMap } = await import('../../src/atlas/renderer.js');
const AX = await import('../../src/atlas/americasExtra.js');
const basemap = readJson(path.join(REPO, 'sims/atlas-u2-asia/data/basemap.json'));
test.after(() => dom.restore());

const DEG = 180 / Math.PI;
const near = (a, b, eps, msg) => assert.ok(Math.abs(a - b) <= eps, `${msg ?? ''} ${a} ≠ ${b}`);
const flowData = (extra = {}) => ({
  type: 'FeatureCollection',
  properties: {
    id: 'mf', title: '인구 이동', layerType: 'pathFlow',
    legend: [{ cls: 'es', label: '에스파냐인의 이동', color: '#e0457b', kind: 'flow' }, { cls: 'sl', label: '아프리카계 노예들의 이동', color: '#231f20', kind: 'flow', dashed: true }],
    ...extra,
  },
  features: [
    { type: 'Feature', properties: { id: 'a', cls: 'es', width: 1.2 }, geometry: { type: 'LineString', coordinates: [[-6, 37], [-20, 30], [-40, 22], [-60, 18], [-75, 15]] } },
    { type: 'Feature', properties: { id: 'b', cls: 'sl', dashed: true }, geometry: { type: 'LineString', coordinates: [[5, 5], [-10, 0], [-25, -5], [-38, -10]] } },
  ],
});

test('등록 전: 지구본은 모르는 도법, pathFlow 는 모르는 레이어 종류, 도법 단추 5개', () => {
  assert.deepEqual(Object.keys(PROJECTIONS), ['miller', 'mercator', 'robinson', 'goode', 'equalEarth']);
  assert.throws(() => makeProjection('globe', { width: 800, height: 600 }), /모르는 도법/);
  assert.throws(() => layerFromRef({ ref: 'layer-x', type: 'pathFlow' }, flowData()), /모르는 레이어 종류/);
});

test('zoomer pan 등록 자리: pan 이 참이면 옮기지 않고 걸음(px)만 넘김, 없거나 거짓이면 옛 끌기', () => {
  for (const [pan, moved] of [[(dx, dy) => { steps.push([dx, dy]); return true; }, false], [() => false, true], [undefined, true]]) {
    var steps = [];
    const el = document.createElement('div');
    el._rect = { left: 0, top: 0, width: 400, height: 300 };
    const zb = createZoomer(el, { pan }).extent([[0, 0], [400, 300]]);
    const p = (type, x, y, extra = {}) => el.dispatch(type, { pointerId: 1, pointerType: 'mouse', button: 0, buttons: 1, clientX: x, clientY: y, ...extra });
    p('pointerdown', 100, 100); p('pointermove', 110, 104); p('pointermove', 130, 110); p('pointerup', 130, 110, { buttons: 0 });
    const t = zb.get();
    if (moved) assert.deepEqual([t.x, t.y], [30, 10]);
    else { assert.deepEqual([t.x, t.y], [0, 0]); assert.deepEqual(steps, [[10, 4], [20, 6]]); }
    zb.destroy();
  }
});

test('등록 뒤: 지구본 = 정사 clipAngle 90, 원판 지름 = 짧은 변 × 0.9, 회전 [30, −20] 이면 (−30°, 20°) 이 원판 가운데, 뒷면은 hidden·geoPath 없음', () => {
  AX.installAmericasExtras();
  AX.installAmericasExtras(); // 두 번 불러도 같음
  assert.deepEqual(Object.keys(PROJECTIONS), ['miller', 'mercator', 'robinson', 'goode', 'equalEarth', 'globe']);
  const def = PROJECTIONS.globe;
  assert.equal(def.label, '지구본');
  def.rot = [30, -20];
  const p = makeProjection('globe', { width: 1000, height: 800 });
  assert.equal(p.key, 'globe');
  near(p.scale(), 360, 1e-9, '반지름 = 800 × 0.9 / 2');
  assert.equal(p.clipAngle(), 90);
  const c = p([-30, 20]);
  near(c[0], 500, 1e-9, 'x'); near(c[1], 400, 1e-9, 'y');
  assert.equal(p.hidden([-30, 20]), false);
  assert.equal(p.hidden([150, -20]), true, '대척점 = 뒷면');
  assert.equal(p.hidden([70, 0]), true, '가운데에서 90° 넘음');
  assert.equal(p.hidden([50, 0]), false, '90° 안');
  assert.equal(geoPath(p)({ type: 'Point', coordinates: [150, -20] }), null, '뒷면 점은 그려지지 않음');
  assert.ok(geoPath(p)({ type: 'Point', coordinates: [-30, 20] }), '앞면 점은 그려짐');
  assert.equal(p.step(1), 15); assert.equal(p.step(3), 10); assert.equal(p.step(10), 5);
  // 확대 변환을 품은 화면 투영도 회전·자르기·hidden 그대로
  const v = viewProjection(p, { k: 2, x: -500, y: -400 }, { width: 1000, height: 800 });
  const cv = v([-30, 20]);
  near(cv[0], 500, 1e-9); near(cv[1], 400, 1e-9);
  assert.equal(v.clipAngle(), 90);
  assert.equal(v.hidden([150, -20]), true);
  // 원판 밖 화소: 역투영 격자(음영·고도 색·자연색이 나눠 씀)는 원판 밖 표본이 NaN — 모서리 칸은 그리지 않음
  const pv = makeProjection('globe', { width: 400, height: 300 });
  const g = invertGrid((xy) => pv.invert(xy), 400, 300, { step: 2, forward: (ll) => pv(ll) });
  const at = (x, y) => g.lon[Math.floor(y / 2) * g.cols + Math.floor(x / 2)];
  assert.ok(Number.isNaN(at(1, 1)) && Number.isNaN(at(398, 298)) && Number.isNaN(at(10, 150)), '원판 밖(모서리·왼쪽 끝) NaN');
  assert.ok(Number.isFinite(at(200, 150)), '원판 가운데는 값');
  assert.ok(g.skipped > 0, '원판 밖 칸은 건너뜀');
});

test('rotateBy: 끌기 100px → Δλ = 100 / R 라디안(원판 반지름 비), 아래로 끌면 북쪽이 가운데로, φ 는 ±85°', () => {
  const R = 300;
  const r = AX.rotateBy([10, -5], 100, 0, R);
  near(r[0] - 10, (100 / R) * DEG, 1e-9, 'Δλ'); near(r[1], -5, 1e-12);
  const d = AX.rotateBy([10, -5], 0, 50, R);
  near(d[1], -5 - (50 / R) * DEG, 1e-9, 'Δφ');
  assert.ok(AX.globeCenter(d)[1] > AX.globeCenter([10, -5])[1], '아래로 끌면 가운데 위도가 북쪽으로');
  assert.equal(AX.rotateBy([0, -80], 0, 2000, R)[1], -85);
  assert.equal(AX.rotateBy([0, 80], 0, -2000, R)[1], 85);
  const rf = AX.rotateFor([-30.3, 9.2]), gc = AX.globeCenter([30.3, -9.2]);
  near(rf[0], 30.3, 1e-9); near(rf[1], -9.2, 1e-12); near(gc[0], -30.3, 1e-9); near(gc[1], 9.2, 1e-12);
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
const tick = () => new Promise((r) => setTimeout(r, 0));

test('렌더러: 평면 → 지구본(보간 없음 · 뒷면 project null · 끌기 = 회전, Δλ = 100/R) → globeView 되돌리기 = 앞 도법·가운데·확대·중심 경도 그대로', async () => {
  const { map, svg } = setupMap();
  map.flyTo({ center: [-60, 10], zoom: 3 }, 0);
  const before = map.view;
  const c0 = before.center;
  const restore = AX.globeView(map, { rotate: [30, -20] });
  let v = map.view;
  assert.equal(v.key, 'globe');
  assert.equal(v.moving, false, '보간(morph) 없이 바로');
  near(v.k, 1, 1e-9, '처음 보기 확대 1');
  const cg = map.project([-30, 20]);
  near(cg[0], 500, 0.5, '원판 가운데 x'); near(cg[1], 400, 0.5, '원판 가운데 y');
  assert.equal(map.project([150, -20]), null, '뒷면 = null');
  assert.deepEqual(map.invert([5, 5]), null, '원판 밖 = null');
  // 끌기 100px → λ 가 100/R(R = 800 × 0.45 × k) 라디안만큼
  const def = PROJECTIONS.globe, rot0 = def.rot.slice(), base0 = map.view.baseId;
  const p = (type, x, extra = {}) => svg.dispatch(type, { pointerId: 1, pointerType: 'mouse', button: 0, buttons: 1, clientX: x, clientY: 400, ...extra });
  p('pointerdown', 400); p('pointermove', 450); p('pointermove', 500); p('pointerup', 500, { buttons: 0 });
  near(def.rot[0] - rot0[0], (100 / 360) * DEG, 1e-9, 'Δλ');
  near(def.rot[1], rot0[1], 1e-12, 'φ 그대로');
  v = map.view;
  assert.deepEqual([v.x, v.y, v.k], [0, 0, 1], '끌어도 변환(옮기기)은 그대로');
  assert.ok(v.baseId > base0, '회전 = 기준 투영 다시 만듦(음영 격자 나눠 쓰기 서명이 바뀜)');
  const cc = map.view.projection.invert([500, 400]);
  near(cc[0], AX.globeCenter(def.rot)[0], 1e-6, '화면 가운데 경도 = 새 회전 가운데');
  // 되돌리기
  restore();
  v = map.view;
  assert.equal(v.key, before.key);
  assert.equal(v.centerLon, before.centerLon);
  near(v.k, 3, 1e-9, 'k');
  near(v.center[0], c0[0], 1e-6, '가운데 경도'); near(v.center[1], c0[1], 1e-6, '가운데 위도');
  // 지구본에서 사용자가 다른 도법으로 바꿨으면 되돌리기는 아무것도 안 함
  const r2 = AX.globeView(map, {});
  map.setProjection('robinson');
  r2();
  assert.equal(map.view.key, 'robinson');
  map.destroy();
  await tick();
});

test('globeTools: 지구본이면 중심 경도 단추 숨김, 평면 → 지구본(도구) = 앞 화면 가운데를 원판 가운데로, 지구본 → 평면 = 앞 평면 가운데·확대, 세계 전체 보기 = 처음 회전', async () => {
  const { stage, map } = setupMap();
  const centerSeg = document.createElement('div'); centerSeg.setAttribute('aria-label', '중심 경도');
  const wholeBtn = document.createElement('button'); wholeBtn.setAttribute('aria-label', '세계 전체 보기');
  const toolsEl = document.createElement('div');
  toolsEl.append(centerSeg, wholeBtn); stage.append(toolsEl);
  // 가짜 DOM 에 없는 것: querySelector(속성 일치) · closest
  toolsEl.querySelector = (sel) => (sel.includes('중심 경도') ? centerSeg : null);
  stage.querySelector = () => null;
  wholeBtn.closest = (sel) => (sel.includes('세계 전체 보기') ? wholeBtn : null);
  const off = AX.globeTools(map, toolsEl);
  map.flyTo({ center: [100, 30], zoom: 4 }, 0);
  map.setProjection('globe');
  assert.equal(centerSeg.hidden, true, '지구본 → 중심 경도 단추 숨김');
  await tick();
  const def = PROJECTIONS.globe;
  assert.deepEqual(AX.globeCenter(def.rot).map((x) => Math.round(x * 1e6) / 1e6), [100, 30], '앞 화면 가운데 = 원판 가운데');
  near(map.view.k, 1, 1e-9);
  const home = def.rot.slice();
  def.rot = [0, 0]; map.rebase();
  const ev = toolsEl.dispatch('click', { target: wholeBtn }); // 도구 칸 캡처 리스너가 단추보다 먼저
  assert.equal(ev._stop && ev.defaultPrevented, true, '지구본에서는 도구의 세계 전체 보기 대신');
  assert.deepEqual(def.rot, home, '처음 회전으로');
  const evKey = stage.dispatch('keydown', { key: '0', target: stage });
  assert.equal(evKey._stop, true, '0 키도');
  map.setProjection('miller');
  assert.equal(centerSeg.hidden, false);
  await tick();
  const v = map.view;
  near(v.k, 4, 1e-9, '앞 평면 확대'); near(v.center[0], 100, 1e-6); near(v.center[1], 30, 1e-6);
  assert.equal(toolsEl.dispatch('click', { target: wholeBtn })._stop, false, '평면에서는 도구 그대로');
  off();
  map.destroy();
  await tick();
});

// 등장방형 화면 투영(경도 1° = 4px, (0,0) = (400,300))
function flatView(k = 2) {
  const projection = geoEquirectangular().scale(4 * DEG).translate([400, 300]);
  const project = (ll) => { const q = projection(ll); return q && Number.isFinite(q[0]) ? q : null; };
  return { view: { k, width: 800, height: 600, projection, moving: false }, project };
}

test('pathFlow: 선 = geoPath, 화살촉 각 = 마지막 두 점 방향, 점선 키, 지명 장애물 0, 범례 = 흐름선 견본(점선), 맞히기', () => {
  const L = layerFromRef({ ref: 'layer-p46-migration-flows', type: 'pathFlow', label: '인구 이동' }, flowData());
  assert.deepEqual(L.legendItems.map((e) => [e.kind, !!e.dashed]), [['flow', false], ['flow', true]]);
  const g = document.createElementNS('svg', 'g');
  const { view, project } = flatView();
  L.drawSvg(g, project, view);
  const flows = g.childNodes[0].childNodes;
  assert.equal(flows.length, 2);
  const parts = (el) => Object.fromEntries(el.childNodes.filter((c) => c.getAttribute?.('class')).map((c) => [c.getAttribute('class'), c]));
  const a = flows.map(parts).find((x) => x['at-flow-line'].getAttribute('stroke') === '#e0457b');
  const b = flows.map(parts).find((x) => x['at-flow-line'].getAttribute('stroke') === '#231f20');
  assert.ok(a['at-flow-line'].getAttribute('d').startsWith('M'));
  assert.equal(a['at-flow-line'].getAttribute('stroke-dasharray'), null);
  assert.ok(b['at-flow-line'].getAttribute('stroke-dasharray'), '노예 이동 = 점선');
  // 화살촉: 끝 = 마지막 점, 방향 = 마지막 두 점
  const tip = project([-75, 15]), prev = project([-60, 18]);
  const head = a['at-flow-head'].getAttribute('d');
  const [hx, hy] = head.slice(1).split('L')[0].split(',').map(Number);
  near(hx, tip[0], 0.06); near(hy, tip[1], 0.06);
  const t = AX.pathTip([[-6, 37], [-20, 30], [-40, 22], [-60, 18], [-75, 15]], project);
  near(Math.atan2(t.dir[1], t.dir[0]), Math.atan2(tip[1] - prev[1], tip[0] - prev[0]), 1e-9, '화살촉 각');
  assert.equal(L.labelObstacles().length, 0, '선만 — 지명 장애물 0');
  assert.equal(L.hit(project([-40, 22]))?.properties.id, 'a');
  assert.equal(L.hit([5, 5]), null);
  L.destroy();
  assert.equal(g.childNodes.length, 0);
});

test('pathFlow 지구본: 뒷면으로 들어간 끝은 화살촉 없음·선은 앞면만, trimLineEnd 는 화면 거리만큼 당김', () => {
  const def = PROJECTIONS.globe;
  def.rot = [0, 0];
  const base = makeProjection('globe', { width: 800, height: 600 });
  const projection = viewProjection(base, { k: 1, x: 0, y: 0 }, { width: 800, height: 600 });
  const project = (ll) => { const q = projection(ll); return q && Number.isFinite(q[0]) && !projection.hidden(ll) ? q : null; };
  const data = flowData();
  data.features = [{ type: 'Feature', properties: { id: 'c', cls: 'es' }, geometry: { type: 'LineString', coordinates: [[0, 0], [40, 0], [80, 0], [100, 0], [120, 0]] } }];
  const L = layerFromRef({ ref: 'x', type: 'pathFlow' }, data);
  const g = document.createElementNS('svg', 'g');
  L.drawSvg(g, project, { k: 1, width: 800, height: 600, projection, moving: false });
  const el = g.childNodes[0].childNodes[0];
  const by = (c) => el.childNodes.find((x) => x.getAttribute?.('class') === c);
  assert.equal(by('at-flow-head').getAttribute('d'), null, '끝(120°E)이 뒷면 → 화살촉 없음');
  const d = by('at-flow-line').getAttribute('d');
  assert.ok(d, '앞면 부분은 그림');
  const xs = d.match(/-?\d+(\.\d+)?/g).map(Number).filter((_, i) => i % 2 === 0);
  assert.ok(Math.max(...xs) <= 400 + 270 + 0.5, '원판 가장자리(반지름 270)에서 잘림');
  // trimLineEnd: 평면에서 끝 4px 당김
  const fv = flatView();
  const line = [[0, 0], [1, 0], [2, 0], [3, 0]];
  const tr = AX.trimLineEnd(line, fv.project, 4); // 1° = 4px → 끝 1° 당김
  near(tr.at(-1)[0], 2, 1e-9);
  assert.equal(geoDistance(tr[0], line[0]), 0);
});

test('pathFlow 자료 view = 지구본: 만들 때 지구본(회전 그대로), destroy 때 앞 도법·가운데로', async () => {
  const { map } = setupMap();
  map.setProjection('robinson', { animate: false });
  map.flyTo({ center: [-80, 0], zoom: 2 }, 0);
  const L = layerFromRef({ ref: 'flows', type: 'pathFlow' }, flowData({ view: { projection: 'globe', rotate: [30.3, -9.2] } }), { map });
  assert.equal(map.view.key, 'globe');
  map.addLayer(L);
  map.fitBounds([-120, -40, -30, 40], { ms: 0 }); // 주제가 묶음 범위로 맞춰도
  await tick();
  near(map.view.k, 1, 1e-9, '처음 보기로 다시');
  const c = map.project([-30.3, 9.2]);
  near(c[0], 500, 0.5); near(c[1], 400, 0.5);
  map.removeLayer('flows');
  assert.equal(map.view.key, 'robinson');
  near(map.view.k, 2, 1e-9); near(map.view.center[0], -80, 1e-6);
  map.destroy();
  await tick();
});
