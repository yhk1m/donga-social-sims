// © 2026 김용현
// tests/atlas/worldPaint.test.mjs — U1-3h 세계 색칠하기 도구(worldPaint.paintToolLayer · registerLayerType('paintTool'), 교사 Q15 A — 팔레트 6색 + 지우개 + 모두 지우기).
// 따로 된 프로세스(node --test)라 등록 전(모르는 레이어 종류)을 본 뒤 installAmericasExtras() → installPolarExtras() → installWorldExtras() 로 등록한다.
// 가짜 DOM(뿌리 → 무대 .at-stage → svg → 레이어 <g>) + 가짜 지도(click 구독·refreshLayer·중심 경도).
import test from 'node:test';
import assert from 'node:assert/strict';
import { installFakeDom } from './helpers/fakeDom.mjs';
import { register } from 'node:module';
import { geoPath, geoEquirectangular } from 'd3-geo';

register('./helpers/cssHooks.mjs', import.meta.url);

const dom = installFakeDom();
const { layerFromRef } = await import('../../src/atlas/layerRef.js');
const AX = await import('../../src/atlas/americasExtra.js');
const PX = await import('../../src/atlas/polarExtra.js');
const WX = await import('../../src/atlas/worldExtra.js');
const WP = await import('../../src/atlas/worldPaint.js');
const { PALETTE } = await import('../../src/atlas/quiz.js');
const { h, s } = await import('../../src/shared/dom.js');
test.after(() => dom.restore());

// ── 가짜 셸·지도 ───────────────────────────────────────────────────────────
function shell() {
  const root = h('div', { class: 'ds-sim' });
  const stage = h('div', { class: 'ds-stage at-stage' });
  const svg = s('svg', { class: 'at-overlay' });
  const g = s('g', { class: 'at-layer' });
  svg.append(g); stage.append(svg); root.append(stage);
  return { root, stage, g };
}
function fakeMap({ centerLon = 0 } = {}) {
  const handlers = {}; const log = [];
  const map = {
    log, destroyed: false,
    view: { key: 'robinson', center: [0, 0], centerLon, k: 1, moving: false },
    get options() { return { tint: false, natural: false }; },
    setOptions(o) { log.push(['options', o]); },
    setCenterLon(c) { log.push(['centerLon', c]); map.view = { ...map.view, centerLon: c }; },
    refreshLayer(id) { log.push(['refresh', id]); return true; },
    on(t, fn) { (handlers[t] ??= new Set()).add(fn); return () => handlers[t].delete(fn); },
    emit(t, e) { for (const fn of [...(handlers[t] || [])]) fn(e); },
    count(t) { return handlers[t]?.size || 0; },
  };
  return map;
}
function all(el, pred, out = []) {
  for (const c of el.children || []) { if (pred(c)) out.push(c); all(c, pred, out); }
  return out;
}
const byClass = (el, c) => all(el, (x) => x.classList?.contains(c));
const one = (el, c) => byClass(el, c)[0] || null;
const click = (el) => el.dispatch('click', { stopPropagation() {}, preventDefault() {} });

const sq = (lon, lat, d = 2) => [[[lon, lat], [lon, lat + d], [lon + d, lat + d], [lon + d, lat], [lon, lat]]];
const country = (iso, ko, poly) => ({ type: 'Feature', properties: { iso, ko }, geometry: { type: 'MultiPolygon', coordinates: poly } });
const CF = () => ({
  50: [
    country('KOR', '대한민국', [sq(124, 32, 8)]),
    country('BRA', '브라질', [sq(-70, -30, 30)]),
    country('TUV', '투발루', [sq(179, -8.6, 0.05)]),
    // 키리바시: 가장 큰 조각 = 키리티마티(157°W), 수도 타라와(173°E) 는 작은 조각 — markAt 으로 동그라미가 타라와에
    country('KIR', '키리바시', [sq(-157.5, 1.8, 0.4), sq(172.9, 1.3, 0.05)]),
  ],
  '10a': [],
});
const VIEW_DATA = () => ({ type: 'FeatureCollection', properties: { layerType: 'topicView', view: { centerLon: 150 }, legend: [] }, features: [] });
const basemapClick = (map, iso) => map.emit('click', { layerId: 'basemap', feature: { properties: { iso } }, lonlat: [0, 0], xy: [0, 0] });

// 등록 전 확인은 첫 시험에서(이 프로세스의 등록부는 하나)
test('등록 전: paintTool 은 모르는 레이어 종류 → installWorldExtras 뒤 팔레트 6색 + 지우개 + 모두 지우기(무대 위 칸)', () => {
  assert.throws(() => layerFromRef({ ref: 'p15-paint', type: 'paintTool' }, VIEW_DATA(), { countryFeatures: CF() }), /모르는 레이어 종류/);
  AX.installAmericasExtras(); PX.installPolarExtras(); WX.installWorldExtras();
  const map = fakeMap();
  const L = layerFromRef({ ref: 'p15-paint', type: 'paintTool' }, VIEW_DATA(), { countryFeatures: CF(), map });
  assert.equal(L.id, 'p15-paint');
  assert.equal(typeof L.draw, 'function', '캔버스 레이어(육지 위·국경 아래)');
  assert.ok(L.z < 50, `z ${L.z} < 50(국경 아래)`);
  assert.deepEqual(L.legendItems, [], '범례 없음');
  const sh = shell();
  L.drawSvg(sh.g, (ll) => ll, { k: 1 });
  const panel = one(sh.stage, 'at-wp');
  assert.ok(panel, '무대에 팔레트 칸');
  assert.equal(panel.getAttribute('aria-label'), '세계 색칠하기 도구');
  const sw = byClass(panel, 'at-wp-color');
  assert.equal(sw.length, 6);
  assert.deepEqual(sw.map((b) => b.style.background), PALETTE, 'quiz.js PALETTE 6색 그대로');
  assert.deepEqual(sw.map((b) => b.getAttribute('aria-pressed')), ['true', 'false', 'false', 'false', 'false', 'false'], '처음 = 첫 색');
  assert.ok(sw.every((b) => /^색 \d — /.test(b.getAttribute('aria-label'))), sw.map((b) => b.getAttribute('aria-label')).join());
  const er = one(panel, 'at-wp-erase');
  assert.ok(er && er.getAttribute('aria-label') === '지우개' && er.getAttribute('aria-pressed') === 'false');
  assert.ok(one(er, 'ds-icon'), '지우개 = 선 아이콘 SVG');
  const clr = one(panel, 'at-wp-clear');
  assert.equal(clr?.getAttribute('aria-label'), '모두 지우기');
  assert.equal(one(clr, 'at-wp-clear-text').textContent, '모두 지우기', '넓은 칸에서는 글자도');
  assert.equal(one(panel, 'at-wp-count').textContent, '칠한 나라 0');
  // 같은 <g> 로 다시 그려도 칸은 하나
  L.drawSvg(sh.g, (ll) => ll, { k: 1 });
  assert.equal(byClass(sh.stage, 'at-wp').length, 1);
  L.destroy();
});

function make({ map = fakeMap(), data = VIEW_DATA() } = {}) {
  const sh = shell();
  const L = layerFromRef({ ref: 'p15-paint', type: 'paintTool' }, data, { countryFeatures: CF(), map });
  L.drawSvg(sh.g, (ll) => ll, { k: 1 });
  const panel = one(sh.stage, 'at-wp');
  return { ...sh, map, L, panel, sw: byClass(panel, 'at-wp-color'), er: one(panel, 'at-wp-erase'), clr: one(panel, 'at-wp-clear'), count: one(panel, 'at-wp-count') };
}

test('나라 누르기: 고른 색으로 칠함 → 같은 색 다시 = 지움 → 다른 색 = 바꿔 칠함 → 지우개 = 지움(coloringQuiz 와 같은 규칙), 칠할 때마다 그 레이어만 다시 그림', () => {
  const a = make();
  basemapClick(a.map, 'KOR');
  assert.equal(a.L.colorOf('KOR'), PALETTE[0]);
  assert.equal(a.count.textContent, '칠한 나라 1');
  assert.ok(a.map.log.some((x) => x[0] === 'refresh' && x[1] === 'p15-paint'));
  basemapClick(a.map, 'KOR');
  assert.equal(a.L.colorOf('KOR'), null, '같은 색 다시 = 지움');
  click(a.sw[3]);
  assert.equal(a.sw[3].getAttribute('aria-pressed'), 'true'); assert.equal(a.sw[0].getAttribute('aria-pressed'), 'false');
  assert.equal(a.L.paintTool.color, PALETTE[3]);
  basemapClick(a.map, 'KOR'); basemapClick(a.map, 'BRA');
  click(a.sw[5]); basemapClick(a.map, 'BRA');
  assert.equal(a.L.colorOf('KOR'), PALETTE[3]); assert.equal(a.L.colorOf('BRA'), PALETTE[5], '다른 색 = 바꿔 칠함');
  assert.equal(a.count.textContent, '칠한 나라 2');
  click(a.er);
  assert.equal(a.er.getAttribute('aria-pressed'), 'true'); assert.ok(a.sw.every((b) => b.getAttribute('aria-pressed') === 'false'));
  assert.equal(a.L.paintTool.color, null);
  basemapClick(a.map, 'KOR'); basemapClick(a.map, 'KOR');
  assert.equal(a.L.colorOf('KOR'), null, '지우개는 몇 번 눌러도 지움(칠하지 않음)');
  assert.equal(a.L.colorOf('BRA'), PALETTE[5]);
  assert.equal(a.count.textContent, '칠한 나라 1');
  a.L.destroy();
});

test('모르는 나라·다른 레이어가 맞힌 누르기·나라 없는 누르기는 칠하지 않음', () => {
  const a = make();
  basemapClick(a.map, 'ZZZ');
  a.map.emit('click', { layerId: 'other-layer', feature: { properties: { iso: 'KOR', cls: 'x' } } });
  a.map.emit('click', { lonlat: [0, 0], xy: [1, 1] });
  a.map.emit('click', { lonlat: null, xy: [1, 1] });
  assert.equal(a.L.painted.size, 0);
  assert.equal(a.count.textContent, '칠한 나라 0');
  a.L.destroy();
});

test('모두 지우기: 칠한 나라 모두 지움·글자 0·다시 그림', () => {
  const a = make();
  basemapClick(a.map, 'KOR'); click(a.sw[2]); basemapClick(a.map, 'BRA');
  assert.equal(a.L.painted.size, 2);
  const n = a.map.log.length;
  click(a.clr);
  assert.equal(a.L.painted.size, 0);
  assert.equal(a.count.textContent, '칠한 나라 0');
  assert.ok(a.map.log.slice(n).some((x) => x[0] === 'refresh'));
  assert.equal(a.L.paintTool.color, PALETTE[2], '고른 색은 그대로');
  a.L.destroy();
});

/** 캔버스 2D 흉내(호 그리기 자리만 기록) */
function fakeCtx() {
  const arcs = [];
  const noop = () => {};
  return {
    arcs, globalAlpha: 1, fillStyle: '', strokeStyle: '', lineWidth: 1,
    beginPath: noop, moveTo: noop, lineTo: noop, closePath: noop, fill: noop, stroke: noop, rect: noop,
    arc(x, y, r) { arcs.push([x, y, r]); },
  };
}

test('작은 나라: 화면에서 작은 나라(넓이 기준 smallPx 16)는 동그라미 — 누르면(레이어 hit) 칠함, 키리바시는 markAt 타라와 자리', () => {
  const a = make();
  const proj = geoEquirectangular().scale(1440 / (2 * Math.PI)).translate([720, 360]).center([0, 0]);
  const ctx = fakeCtx();
  const view = { width: 1440, height: 720, detail: '50', geoRect: null, k: 1 };
  a.L.draw(ctx, geoPath(proj, ctx), view);
  const tuv = proj([179.025, -8.575]), kir = proj([173.0, 1.42]);
  const near = (p) => ctx.arcs.find(([x, y]) => Math.hypot(x - p[0], y - p[1]) < 2);
  assert.ok(near(tuv), '투발루 동그라미');
  assert.ok(near(kir), '키리바시 동그라미 = 타라와(markAt 173.0, 1.42)');
  assert.ok(!near(proj([128, 36])), '대한민국(큰 나라)은 동그라미 없음');
  assert.equal(ctx.arcs[0][2], WP.PAINT.smallPx / 2 + 3, '반지름 = smallPx/2 + 3');
  // 동그라미 누르기: renderer 는 레이어 hit → {layerId: 레이어, feature}
  const f = a.L.hit(tuv, [179, -8.6]);
  assert.equal(f?.properties?.iso, 'TUV');
  a.map.emit('click', { layerId: 'p15-paint', feature: f });
  assert.equal(a.L.colorOf('TUV'), PALETTE[0]);
  assert.equal(a.L.hit([5, 5], [0, 0]), null, '동그라미 밖 = 맞히지 않음(바탕 지도 나라로)');
  a.L.destroy();
});

test('작은 나라 동그라미: 지구본 뒷면(proj.hidden)은 안 그림 · 겹치는 동그라미는 칠한 나라 → 화면에서 큰 나라 차례로 하나만(누르기도 보이는 것만)', () => {
  const tiny = (iso, lon, lat, d) => country(iso, iso, [sq(lon, lat, d)]);
  const cf = { 50: [tiny('AAA', 10, 10, 0.3), tiny('BBB', 10.5, 10, 0.1), tiny('CCC', 40, 10, 0.1), tiny('DDD', -150, 10, 0.1)], '10a': [] };
  const map = fakeMap();
  const L = layerFromRef({ ref: 'p15-paint', type: 'paintTool' }, VIEW_DATA(), { countryFeatures: cf, map });
  const base = geoEquirectangular().scale(1440 / (2 * Math.PI)).translate([720, 360]);
  const proj = (ll) => base(ll);
  proj.hidden = (ll) => ll[0] < -90 || ll[0] > 90; // 가짜 뒷면: 서경 90° 너머
  const view = { width: 1440, height: 720, detail: '50', k: 1 };
  const draw = () => { const ctx = fakeCtx(); L.draw(ctx, Object.assign(geoPath(base, ctx), { projection: () => proj }), view); return L.marks.map((m) => m.iso).sort(); };
  // AAA(0.3°)·BBB(0.1°) 는 화면에서 2px 거리 — 겹침 → 큰 AAA 만, DDD 는 뒷면
  assert.deepEqual(draw(), ['AAA', 'CCC']);
  L.paint('BBB', PALETTE[2]);
  assert.deepEqual(draw(), ['BBB', 'CCC'], '칠한 나라가 먼저(칠한 작은 나라 색이 보이게)');
  assert.equal(L.hit(proj([-150.05, 10.05]), null), null, '뒷면 나라는 누를 수 없음');
  L.destroy();
});

test('두 번 누르기(확대): 두 번째 click(detail 2)은 칠하기에 안 씀 — 칠 → 지움이 되지 않음', () => {
  const a = make();
  a.map.emit('click', { layerId: 'basemap', feature: { properties: { iso: 'KOR' } }, detail: 1 });
  a.map.emit('click', { layerId: 'basemap', feature: { properties: { iso: 'KOR' } }, detail: 2 });
  assert.equal(a.L.colorOf('KOR'), PALETTE[0], '칠한 채 그대로');
  a.map.emit('click', { layerId: 'basemap', feature: { properties: { iso: 'KOR' } }, detail: 1 });
  assert.equal(a.L.colorOf('KOR'), null, '따로 한 번 더 누르면 지움');
  a.L.destroy();
});

test('동그라미: 조금 옮겨도(끌기) 보이는 동그라미 묶음이 그대로 — 겹침 거름을 화면 자르기보다 먼저 · 움직이는 동안 hit 끔 · destroy 뒤 marks 없음', () => {
  // 화면 왼쪽 끝 밖 AAA(큰) 와 화면 안 BBB(작은)가 겹침: 자르기를 먼저 하면 AAA 가 화면 밖일 때 BBB 가 튀어나왔다 사라짐
  const tiny = (iso, lon, lat, d) => country(iso, iso, [sq(lon, lat, d)]);
  const cf = { 50: [tiny('AAA', -179.9, 0, 0.3), tiny('BBB', -177.2, 0, 0.1), tiny('CCC', 0, 0, 0.1)], '10a': [] };
  const map = fakeMap();
  const L = layerFromRef({ ref: 'p15-paint', type: 'paintTool' }, VIEW_DATA(), { countryFeatures: cf, map });
  const sh = shell();
  const view = { width: 1440, height: 720, detail: '50', k: 1 };
  const drawAt = (dx) => {
    const p = geoEquirectangular().scale(1440 / (2 * Math.PI)).translate([720 + dx, 360]);
    const ctx = fakeCtx(); L.draw(ctx, geoPath(p, ctx), view);
    return L.marks.map((m) => m.iso).sort();
  };
  const sets = [-30, -20, -12, -4, 0, 6].map(drawAt);
  // AAA 는 dx 에 따라 화면 안팎을 오가지만 BBB 는 늘 AAA 에 가려 안 나옴(묶음은 CCC 와 AAA 의 보임 여부로만 달라짐)
  for (const s0 of sets) assert.ok(!s0.includes('BBB'), `BBB 가 튀어나옴: ${sets.map((x) => x.join('+')).join(' | ')}`);
  assert.ok(sets.every((s0) => s0.includes('CCC')));
  // 움직이는 동안 hit 끔
  drawAt(0);
  const c = L.marks.find((m) => m.iso === 'CCC');
  L.drawSvg(sh.g, (ll) => ll, { k: 1, moving: true });
  assert.equal(L.hit([c.x, c.y]), null, '움직이는 동안 동그라미 안 맞힘');
  L.drawSvg(sh.g, (ll) => ll, { k: 1, moving: false });
  assert.equal(L.hit([c.x, c.y])?.properties?.iso, 'CCC');
  L.destroy();
  assert.equal(L.marks.length, 0, 'destroy 뒤 동그라미 자리 없음');
  assert.equal(L.hit([c.x, c.y]), null);
});

test('보기: topicView 자료(centerLon 150)면 만들 때 태평양 중심 → destroy 때 되돌림, view 없는 자료도 됨', () => {
  const map = fakeMap({ centerLon: 0 });
  const a = make({ map });
  assert.equal(map.view.centerLon, 150);
  a.L.destroy();
  assert.equal(map.view.centerLon, 0, '되돌림');
  const m2 = fakeMap({ centerLon: 0 });
  const b = make({ map: m2, data: { type: 'FeatureCollection', properties: { legend: [] }, features: [] } });
  assert.equal(m2.view.centerLon, 0, 'view 없음 = 보기 그대로');
  basemapClick(m2, 'KOR');
  assert.equal(b.L.colorOf('KOR'), PALETTE[0]);
  b.L.destroy();
});

test('destroy: 칠 없음 · 무대 칸 없음 · click 구독 풂 · 늦은 drawSvg 가 칸을 다시 붙이지 않음', () => {
  const a = make();
  basemapClick(a.map, 'KOR');
  const subs = a.map.count('click');
  a.L.destroy();
  assert.equal(a.L.painted.size, 0, '칠 지움(메모리만 — 다시 열면 빈 지도)');
  assert.equal(one(a.stage, 'at-wp'), null);
  assert.equal(a.map.count('click'), subs - 1);
  a.L.drawSvg(a.g, (ll) => ll, { k: 1 });
  assert.equal(one(a.stage, 'at-wp'), null);
  basemapClick(a.map, 'BRA');
  assert.equal(a.L.colorOf('BRA'), null);
  // 바탕 나라 도형이 없으면 멈춤
  assert.throws(() => layerFromRef({ ref: 'x', type: 'paintTool' }, VIEW_DATA(), { countryFeatures: null, map: fakeMap() }), /countryFeatures/);
});

test('placePalette: 넓은 무대 = 아래 가운데 가로 줄, 아래가 막히면 왼쪽 위 가로 줄, 휴대폰(390) = 왼쪽 위 세로 열, 지금 자리가 비었으면 그대로', () => {
  const sizes = { row: [470, 44], col: [44, 300] };
  // 1440×900 셸의 무대(1120×900): 지도 도구 칸 오른쪽 위, 확대 단추, 축척 왼쪽 아래
  const desk = [[835, 10, 1110, 120, 100], [1078, 126, 1110, 230, 100], [10, 860, 78, 890, 100]];
  let p = WP.placePalette(1120, 900, sizes, desk);
  assert.equal(p.mode, 'row'); assert.equal(p.place, 'bottom');
  assert.equal(p.left, Math.round((1120 - 470) / 2)); assert.equal(p.top, 900 - 10 - 44); assert.equal(p.overlap, 0);
  // 아래 가운데에 범례 칸(무게 10) → 왼쪽 위 가로 줄
  p = WP.placePalette(1120, 900, sizes, [...desk, [300, 600, 900, 890, 10]]);
  assert.equal(p.place, 'top-left'); assert.equal(p.mode, 'row'); assert.equal(p.overlap, 0);
  // 휴대폰 무대 390×464: 지도 도구 칸이 오른쪽 위를 거의 다, 축척 왼쪽 아래 — 가로 줄(470)은 무대보다 넓음
  const phone = [[105, 10, 385, 120, 100], [345, 128, 385, 230, 100], [10, 425, 110, 455, 100]];
  p = WP.placePalette(390, 464, sizes, phone);
  assert.equal(p.mode, 'col'); assert.equal(p.place, 'left'); assert.equal(p.left, 10); assert.equal(p.top, 10); assert.equal(p.overlap, 0);
  // 지금 자리(prefer)가 비었으면 앞 차례가 비어도 그대로
  p = WP.placePalette(1120, 900, sizes, desk, { prefer: 'top-left' });
  assert.equal(p.place, 'top-left');
  // 다 겹치면 겹친 넓이 × 무게가 가장 작은 곳
  p = WP.placePalette(200, 200, sizes, [[0, 0, 200, 200, 1]]);
  assert.ok(p.overlap > 0 && ['row', 'col'].includes(p.mode));
});

test('무대 자리: 지도 도구·확대 단추·축척·맞히기 칸·지구본 단추 열을 피함(멈춘 그림에서만 다시 봄)', () => {
  const map = fakeMap();
  const sh = shell();
  sh.stage._rect = { left: 0, top: 0, width: 1120, height: 900 };
  const tools = h('div', { class: 'at-tools-card' }); tools._rect = { left: 835, top: 10, width: 275, height: 110 };
  const scale = h('div', { class: 'at-scale' }); scale._rect = { left: 10, top: 860, width: 68, height: 30 };
  const wq = h('section', { class: 'at-wq' }); wq._rect = { left: 300, top: 840, width: 500, height: 60 }; // 아래 가운데를 막는 맞히기 칸(다른 무대에서 함께 뜬다면)
  sh.stage.append(tools, scale, wq);
  const L = layerFromRef({ ref: 'p15-paint', type: 'paintTool' }, VIEW_DATA(), { countryFeatures: CF(), map });
  // 칸 크기: data-mode 에 따라
  const realAppend = sh.stage.append.bind(sh.stage);
  sh.stage.append = (...n) => {
    for (const x of n) if (x.classList?.contains('at-wp')) x.getBoundingClientRect = () => (x.getAttribute('data-mode') === 'col' ? { left: 0, top: 0, width: 44, height: 300, right: 44, bottom: 300 } : { left: 0, top: 0, width: 470, height: 44, right: 470, bottom: 44 });
    return realAppend(...n);
  };
  L.drawSvg(sh.g, (ll) => ll, { k: 1, moving: false });
  const panel = one(sh.stage, 'at-wp');
  assert.equal(panel.getAttribute('data-place'), 'top-left', '아래 가운데가 맞히기 칸에 막혀 왼쪽 위');
  assert.equal(panel.style.left, '10px'); assert.equal(panel.style.top, '10px');
  wq.remove();
  L.drawSvg(sh.g, (ll) => ll, { k: 1, moving: true });
  assert.equal(panel.getAttribute('data-place'), 'top-left', '움직이는 동안은 안 봄');
  L.drawSvg(sh.g, (ll) => ll, { k: 1, moving: false });
  assert.equal(panel.getAttribute('data-place'), 'top-left', '지금 자리가 비었으면 그대로(뛰지 않음)');
  L.destroy();
});
