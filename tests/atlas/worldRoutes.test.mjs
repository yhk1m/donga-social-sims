// tests/atlas/worldRoutes.test.mjs — U1-3g 대권 노선 레이어(worldRoutes.routeFanLayer · registerLayerType('routeFan'), 교사 Q10 A).
// 따로 된 프로세스(node --test)라 등록 전(모르는 레이어 종류)을 본 뒤 installAmericasExtras() → installPolarExtras() → installWorldExtras() 로 등록한다.
// 그리기는 가짜 DOM 의 SVG <path d>(경로 묶음 하나·도시 점 묶음 하나)를 읽어 본다. 실제 자료(작업 폴더 p14-routes.routes.json)는 있으면 본다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { geoEquirectangular, geoOrthographic, geoMercator, geoDistance } from 'd3-geo';
import { geoRobinson } from 'd3-geo-projection';
import { geoInterruptedHomolosine } from 'd3-geo-polygon';   // 앱 구드와 같은 것(projections.js)
import { readJson, WORK } from '../../scripts/atlas/geo_util.mjs';
import { installFakeDom } from './helpers/fakeDom.mjs';
import { createLegendState } from '../../src/atlas/legendState.js';
import { register } from 'node:module';

register('./helpers/cssHooks.mjs', import.meta.url);

const dom = installFakeDom();
const { layerFromRef } = await import('../../src/atlas/layerRef.js');
const AX = await import('../../src/atlas/americasExtra.js');
const PX = await import('../../src/atlas/polarExtra.js');
const WX = await import('../../src/atlas/worldExtra.js');
const WR = await import('../../src/atlas/worldRoutes.js');
test.after(() => dom.restore());

const W = 800, H = 400;
const ICN = [126.44, 37.46], LHR = [-0.45, 51.47], LAX = [-118.41, 33.94], SYD = [151.18, -33.95], JFK = [-73.78, 40.64];
const LEGEND = [{ cls: 'route', label: '인천 국제공항 직항 노선', color: '#f072ab', kind: 'line' }];
const pt = (ll, cls = 'route') => ({ type: 'Feature', properties: { cls }, geometry: { type: 'Point', coordinates: ll } });
const DATA = (dests = [LHR, LAX, SYD], extra = {}) => ({ type: 'FeatureCollection',
  properties: { layerType: 'routeFan', origin: ICN, legend: LEGEND, width: 0.6, arrow: false, ...extra }, features: dests.map((d) => pt(d)) });

/** 렌더러와 같은 꼴의 view·project(지구본 뒷면 = null) */
function viewOf(projection) {
  const project = (ll) => {
    const q = projection(ll);
    if (!q || !Number.isFinite(q[0])) return null;
    if (projection.clipAngle?.() && geoDistance(ll, projection.invert([W / 2, H / 2])) > Math.PI / 2) return null;
    return q;
  };
  return { view: { k: 1, width: W, height: H, projection, geoRect: null, moving: false }, project };
}
const robinson = (lon0) => geoRobinson().rotate([-lon0, 0]).fitSize([W, H], { type: 'Sphere' }).precision(0.4);
const globe = (center) => geoOrthographic().rotate([-center[0], -center[1]]).clipAngle(90).fitSize([W, H], { type: 'Sphere' }).precision(0.4);

/** d 문자열 → 조각들 [[x, y]…] (M 으로 새 조각, L 이어짐 — d3 geoPath 꼴) */
function runsOf(d) {
  const runs = [];
  for (const m of (d || '').matchAll(/([ML])([-\d.e]+),([-\d.e]+)/g)) {
    const p = [+m[2], +m[3]];
    if (m[1] === 'M') runs.push([p]); else runs[runs.length - 1].push(p);
  }
  return runs;
}
const maxStep = (runs) => Math.max(0, ...runs.flatMap((r) => r.slice(1).map((p, i) => Math.hypot(p[0] - r[i][0], p[1] - r[i][1]))));
const dotsOf = (d) => [...(d || '').matchAll(/M([-\d.e]+),([-\d.e]+)a/g)].length;

function draw(layer, projection) {
  const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  const { view, project } = viewOf(projection);
  layer.drawSvg(g, project, view);
  return { g, view, project };
}
function parts(g) {
  const root = g.children[0];
  const all = [];
  const walk = (el) => { for (const c of el.children) { all.push(c); walk(c); } };
  walk(root);
  return { root, routes: all.filter((e) => e.getAttribute('class') === 'at-routes-line'), dots: all.filter((e) => e.getAttribute('class') === 'at-routes-dots'),
    origin: all.find((e) => e.getAttribute('class') === 'at-routes-origin') };
}

test('등록 전: routeFan 은 모르는 레이어 종류 → installWorldExtras 가 등록(continents 와 함께)', () => {
  assert.throws(() => layerFromRef({ ref: 'r', type: 'routeFan' }, DATA()), /모르는 레이어 종류/);
  AX.installAmericasExtras(); PX.installPolarExtras(); WX.installWorldExtras();
  const l = layerFromRef({ ref: 'r', type: 'routeFan' }, DATA());
  assert.equal(l.routes.length, 3);
  assert.equal(l.legendItems.length, 1);
  l.destroy();
});

test('자료 검사: origin 없음·도착 점이 아닌 Feature 는 멈춤', () => {
  assert.throws(() => WR.routeFanLayer('r', DATA([LHR], { origin: null })), /origin/);
  const bad = DATA([LHR]); bad.features.push({ type: 'Feature', properties: { cls: 'route' }, geometry: { type: 'LineString', coordinates: [ICN, LHR] } });
  assert.throws(() => WR.routeFanLayer('r', bad), /Point·MultiPoint/);
  // MultiPoint(자료 꼴 — 분류마다 하나)와 Point 섞임
  const mp = DATA([LHR]); mp.features.push({ type: 'Feature', properties: { cls: 'route' }, geometry: { type: 'MultiPoint', coordinates: [LAX, SYD] } });
  const l = WR.routeFanLayer('r', mp);
  assert.deepEqual(l.routes, [LHR, LAX, SYD]);
  const p = parts(draw(l, robinson(150)).g);
  assert.equal(dotsOf(p.dots[0].getAttribute('d')), 3);
  l.destroy();
});

test('대권: 인천 → 런던 중간 위도 > 60°N, 1° 마다 나눔(양 끝 그대로), 인천 → 시드니는 적도를 지남', () => {
  const line = WR.greatCircle(ICN, LHR);
  assert.deepEqual(line[0], ICN); assert.deepEqual(line[line.length - 1], LHR);
  const deg = geoDistance(ICN, LHR) * 180 / Math.PI;
  assert.equal(line.length, Math.ceil(deg) + 1);
  assert.ok(line[Math.floor(line.length / 2)][1] > 60, `중간 위도 ${line[Math.floor(line.length / 2)][1]}`);
  assert.ok(Math.max(...line.map((p) => p[1])) > 65);
  const s = WR.greatCircle(ICN, SYD, 2);
  assert.ok(s.some((p) => Math.abs(p[1]) < 1.5));
  assert.equal(WR.greatCircle(ICN, ICN).length, 1);
});

test('그리기: 경로 수 = 점 수, 분류마다 <path> 하나(DOM 노드 적음), 점 묶음 하나 + 출발점, 맞히기용 장애물 없음', () => {
  const dests = [LHR, LAX, SYD, JFK, [2.55, 49.01], [139.78, 35.55]];
  const l = WR.routeFanLayer('r', DATA(dests));
  assert.equal(l.routes.length, dests.length);
  const { g } = draw(l, robinson(150));
  const p = parts(g);
  assert.equal(p.routes.length, 1); assert.equal(p.dots.length, 1); assert.ok(p.origin);
  assert.equal(p.root.getAttribute('pointer-events'), 'none');   // 누르기는 hit() 로(렌더러가 svg 위 누르기만 받음)
  assert.equal(dotsOf(p.dots[0].getAttribute('d')), dests.length);
  assert.ok(runsOf(p.routes[0].getAttribute('d')).length >= dests.length);
  assert.equal(p.routes[0].getAttribute('stroke'), '#f072ab');
  assert.equal(p.dots[0].getAttribute('fill'), WR.ROUTES.dotColor);
  assert.deepEqual(l.labelObstacles(), []);
  // 다시 그려도 요소를 새로 만들지 않음
  const before = p.routes[0];
  l.drawSvg(g, viewOf(robinson(150)).project, viewOf(robinson(150)).view);
  assert.equal(parts(g).routes[0], before);
  l.destroy();
  assert.equal(g.children.length, 0);
});

test('날짜변경선: 인천 → 로스앤젤레스가 태평양 중심(150)에서 한 조각, 대서양 중심(0)에서는 가장자리에서 두 조각 — 어느 쪽도 지도를 가로지르는 줄 없음', () => {
  const l = WR.routeFanLayer('r', DATA([LAX]));
  const pac = runsOf(parts(draw(l, robinson(150)).g).routes[0].getAttribute('d'));
  assert.equal(pac.length, 1, '태평양 중심 한 조각');
  assert.ok(maxStep(pac) < W / 20, `태평양 중심 가장 긴 마디 ${maxStep(pac)}`);
  l.destroy();
  const l2 = WR.routeFanLayer('r', DATA([LAX]));
  const rob0 = robinson(0);
  const atl = runsOf(parts(draw(l2, rob0).g).routes[0].getAttribute('d'));
  assert.equal(atl.length, 2, '대서양 중심 두 조각');
  assert.ok(maxStep(atl) < W / 20, `대서양 중심 가장 긴 마디 ${maxStep(atl)}`);
  // 끊긴 자리는 지도 양 가장자리(180° 경선) — 두 조각의 안쪽 끝을 되돌린 경도가 ±180 가까이, 하나는 왼쪽·하나는 오른쪽
  const cut = atl.map((r) => [r[0], r[r.length - 1]].map((q) => rob0.invert(q)[0]).find((lon) => Math.abs(lon) > 178));
  assert.ok(cut.every((lon) => lon !== undefined), `가장자리 끝 ${cut}`);
  assert.ok(cut.some((lon) => lon > 0) && cut.some((lon) => lon < 0));
  l2.destroy();
  // 정거 원통 대서양 중심도 같음(투영이 달라도 d3 날짜변경선 자르기)
  const l3 = WR.routeFanLayer('r', DATA([LAX]));
  const eq = runsOf(parts(draw(l3, geoEquirectangular().fitSize([W, H], { type: 'Sphere' }).precision(0.4)).g).routes[0].getAttribute('d'));
  assert.equal(eq.length, 2); assert.ok(maxStep(eq) < W / 20);
  l3.destroy();
});

test('지구본: 뒷면 도시 점은 안 그림·안 맞힘, 경로는 원판 가장자리에서 잘림(앞면 조각만)', () => {
  const l = WR.routeFanLayer('r', DATA([LHR, SYD, LAX]));
  const proj = globe([-60, 20]);   // 대서양 쪽 — 인천·시드니는 뒷면, 런던·로스앤젤레스는 앞면
  const { g, project } = draw(l, proj);
  const p = parts(g);
  assert.equal(dotsOf(p.dots[0].getAttribute('d')), 2);
  assert.equal(p.origin.getAttribute('d'), null);   // 출발점(인천)도 뒷면
  const runs = runsOf(p.routes[0].getAttribute('d'));
  assert.ok(runs.length >= 2);
  const R = proj.scale(), [cx, cy] = proj.translate();
  for (const r of runs) for (const q of r) assert.ok(Math.hypot(q[0] - cx, q[1] - cy) <= R + 1, '원판 밖 점 없음');
  assert.ok(l.hit(project(LHR)));
  l.destroy();
  // 화면에서 맞닿은 앞면·뒷면 점(원판 오른쪽 가장자리 89°E 앞 · 91°E 뒤): 맞히기는 앞면 점만, 뒷면 점 자리를 눌러도 뒷면 점은 안 나옴
  const FRONT = [89, 0], BACK = [91, 0];
  const l2 = WR.routeFanLayer('r', DATA([BACK, FRONT]));
  const pg = globe([0, 0]);
  const d2 = draw(l2, pg);
  assert.equal(d2.project(BACK), null);
  const fb = pg(BACK), ff = d2.project(FRONT);
  assert.ok(Math.hypot(fb[0] - ff[0], fb[1] - ff[1]) < WR.ROUTES.hitPx, '두 점이 화면에서 맞닿음');
  assert.equal(dotsOf(parts(d2.g).dots[0].getAttribute('d')), 1);
  for (const at of [ff, fb]) {
    const f = l2.hit(at);
    assert.ok(f === null || (f.geometry.coordinates[0] === FRONT[0] && f.geometry.coordinates[1] === FRONT[1]), `뒷면 점이 맞음 ${JSON.stringify(f?.geometry)}`);
  }
  assert.deepEqual(l2.hit(ff).geometry.coordinates, FRONT);
  l2.destroy();
});

test('메르카토르(clipExtent ±85°·경도 360°)·구드(끊긴 도법): 날짜변경선·끊김 자리에서 지도를 가로지르는 줄 없음, 점은 모두 그림', () => {
  const dests = [LAX, LHR, SYD, JFK, [-46.47, -23.43]];   // 마지막 = 상파울루(가장 먼 노선 약 164.7°)
  for (const lon0 of [150, 0]) {
    const m = geoMercator().rotate([-lon0, 0]).fitSize([W, H], { type: 'Sphere' }).precision(0.4);
    const [[x0, y0], [x1, y1]] = [m([-180 + lon0 + 1e-6, 85]), m([180 + lon0 - 1e-6, -85])];
    m.clipExtent([[Math.min(x0, x1), y0], [Math.max(x0, x1), y1]]);
    const l = WR.routeFanLayer('r', DATA(dests));
    const p = parts(draw(l, m).g);
    const runs = runsOf(p.routes[0].getAttribute('d'));
    assert.ok(runs.length >= dests.length, `메르카토르 ${lon0} 조각 ${runs.length}`);
    assert.ok(maxStep(runs) < W / 20, `메르카토르 ${lon0} 가장 긴 마디 ${maxStep(runs)}`);
    const [[ex0, ey0], [ex1, ey1]] = m.clipExtent();
    for (const r of runs) for (const q of r) assert.ok(q[0] >= ex0 - 0.5 && q[0] <= ex1 + 0.5 && q[1] >= ey0 - 0.5 && q[1] <= ey1 + 0.5, '자르기 상자 밖 점 없음');
    assert.equal(dotsOf(p.dots[0].getAttribute('d')), dests.length);
    l.destroy();
  }
  const goode = geoInterruptedHomolosine().rotate([-150, 0]).fitSize([W, H], { type: 'Sphere' }).precision(0.4);
  const l = WR.routeFanLayer('r', DATA(dests));
  const p = parts(draw(l, goode).g);
  const runs = runsOf(p.routes[0].getAttribute('d'));
  assert.ok(runs.length >= dests.length);
  assert.ok(maxStep(runs) < W / 20, `구드 가장 긴 마디 ${maxStep(runs)}`);
  l.destroy();
});

test('destroy 뒤 늦은 drawSvg 는 아무것도 다시 만들지 않음 · 거의 대척점 도착 점은 자료 오류', () => {
  const l = WR.routeFanLayer('r', DATA([LHR]));
  const { g, view, project } = draw(l, robinson(150));
  l.destroy();
  assert.equal(g.children.length, 0);
  l.drawSvg(g, project, view);
  assert.equal(g.children.length, 0);
  assert.equal(l.hit(project(LHR)), null);
  assert.ok(WR.greatCircle(ICN, [-46.47, -23.43]).length > 160);                       // 상파울루 약 164.7° — 됨
  assert.throws(() => WR.greatCircle(ICN, [ICN[0] - 180, -ICN[1] + 0.2]), /대척점/);    // 0.2° 떨어진 대척점 둘레
  assert.throws(() => WR.routeFanLayer('r', DATA([[ICN[0] - 180, -ICN[1]]])), /대척점/);
});

test('맞히기: 도시 점 6px 안 → 「인천 → 직항 도시」(이름 없음), 밖 → null, 범례에서 흐린 분류는 안 맞힘', () => {
  const data = DATA([LHR, SYD]);
  data.properties.legend = [...LEGEND, { cls: 'other', label: '다른 노선', color: '#3366cc', kind: 'line' }];
  data.features[1].properties.cls = 'other';
  const lg = createLegendState(['route', 'other']);
  const l = WR.routeFanLayer('r', data, { legend: lg });
  const { g, project } = draw(l, robinson(150));
  const at = project(LHR);
  const f = l.hit([at[0] + 4, at[1] + 3]);
  assert.ok(f); assert.equal(f.properties.label, '인천 → 직항 도시'); assert.deepEqual(f.geometry, { type: 'Point', coordinates: LHR });
  assert.equal(l.hit([at[0] + 9, at[1]]), null);
  assert.equal(parts(g).routes.length, 2);
  lg.toggle('route');
  l.drawSvg(g, project, viewOf(robinson(150)).view);
  const op = parts(g).routes.map((e) => e.parentNode.getAttribute('opacity'));   // 분류 묶음 <g>
  assert.deepEqual(op, [null, String(WR.ROUTES.dimAlpha)]);
  assert.equal(l.hit(project(SYD)), null);
  assert.ok(l.hit(project(LHR)));
  l.destroy();
});

test('범례 구독: 범례가 바뀌면 그 레이어만 다시(refreshLayer), destroy 는 구독을 풂', () => {
  const refreshed = [];
  const map = { destroyed: false, refreshLayer: (id) => refreshed.push(id), on: () => () => {} };
  const data = DATA([LHR, SYD]);
  data.properties.legend = [...LEGEND, { cls: 'other', label: '다른 노선', color: '#3366cc', kind: 'line' }];
  const lg = createLegendState(['route', 'other']);
  const l = WR.routeFanLayer('r', data, { legend: lg, map });
  lg.toggle('other');
  assert.deepEqual(refreshed, ['r']);
  l.destroy(); lg.reset();
  assert.deepEqual(refreshed, ['r']);
});

const REAL = `${WORK}/geo/p14-routes.routes.json`;
test('실제 14쪽 항공망(Q10 A): 출발 인천, 노선 ≥ 150 = 도시 점 수(MultiPoint 하나), 모두 인천과 다른 점, 범례 1, 자료 ≤ 15KB', { skip: fs.existsSync(REAL) ? false : '작업 폴더 자료 없음' }, () => {
  const R = readJson(REAL);
  const [lon, lat] = R.properties.origin;
  assert.ok(Math.abs(lon - 126.45) < 1 && Math.abs(lat - 37.46) < 1);
  assert.equal(R.properties.layerType, 'routeFan');
  assert.equal(R.properties.legend.length, 1);
  assert.equal(R.features.length, 1); assert.equal(R.features[0].geometry.type, 'MultiPoint');
  const pts = R.features[0].geometry.coordinates;
  assert.ok(pts.length >= 150, `노선 ${pts.length}`);
  for (const q of pts) assert.ok(geoDistance(q, [lon, lat]) > 0.01);
  assert.ok(fs.statSync(REAL).size <= 15 * 1024, `${fs.statSync(REAL).size} B`);
  const l = WR.routeFanLayer('p14-routes', R);
  const { g } = draw(l, robinson(150));
  const p = parts(g);
  assert.equal(dotsOf(p.dots[0].getAttribute('d')), pts.length);
  assert.equal(l.routes.length, pts.length);
  assert.ok(maxStep(runsOf(p.routes[0].getAttribute('d'))) < W / 20);
  l.destroy();
});
