// tests/atlas/worldGlobe.test.mjs — U1-3f 대륙·대양 지구본 단추(worldGlobe.withGlobeButtons · registerLayerType('continentGlobes') + continentQuiz 의 대양 단추, 교사 Q4 A).
// 따로 된 프로세스(node --test)라 등록 전(모르는 레이어 종류)을 본 뒤 installAmericasExtras() → installPolarExtras() → installWorldExtras() 로 등록한다.
// 가짜 DOM(뿌리 → 무대 .at-stage → svg → 레이어 <g>) + 가짜 지도(도법·회전·바탕 옵션·viewchange). 회전 보간은 가짜 rAF·시계로 한 프레임씩.
import test from 'node:test';
import assert from 'node:assert/strict';
import { installFakeDom } from './helpers/fakeDom.mjs';
import { register } from 'node:module';

register('./helpers/cssHooks.mjs', import.meta.url);

const dom = installFakeDom();
const { layerFromRef } = await import('../../src/atlas/layerRef.js');
const { PROJECTIONS } = await import('../../src/atlas/projections.js');
const AX = await import('../../src/atlas/americasExtra.js');
const PX = await import('../../src/atlas/polarExtra.js');
const WX = await import('../../src/atlas/worldExtra.js');
const GB = await import('../../src/atlas/worldGlobe.js');
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
/** 도법·가운데·확대·바탕 옵션을 가진 가짜 지도. setProjection·flyTo 는 즉시(viewchange 를 냄), rebase 는 센다. */
function fakeMap({ key = 'robinson', center = [150, 20], k = 2 } = {}) {
  const handlers = {}; const log = [];
  let opts = { tint: false, natural: false };
  const map = {
    log, destroyed: false, rebases: 0,
    view: { key, center, centerLon: 150, k, moving: false },
    get options() { return { ...opts }; },
    setOptions(o) { opts = { ...opts, ...o }; log.push(['options', { ...o }]); },
    setProjection(nk) { log.push(['projection', nk]); map.view = { ...map.view, key: nk }; map.emit('viewchange', map.view); },
    flyTo(t, ms) { log.push(['fly', t, ms]); map.view = { ...map.view, center: t.center ?? map.view.center, k: t.zoom ?? map.view.k }; map.emit('viewchange', map.view); },
    fitBounds() {},
    rebase() { map.rebases++; },
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
const btns = (stage) => byClass(stage, 'at-wg-btn');
const btnOf = (stage, id) => btns(stage).find((b) => b.getAttribute('data-id') === id);
const discCenter = () => AX.globeCenter(PROJECTIONS.globe.rot);
const near = (a, b, tol = 1) => Math.abs(((a[0] - b[0] + 540) % 360) - 180) <= tol && Math.abs(a[1] - b[1]) <= tol;

const CENTERS = { asia: [91.1, 43.2], europe: [25.5, 55.7], africa: [18.7, 6.5], northAmerica: [-101.1, 48.8], southAmerica: [-60.4, -14.2], oceania: [136.5, -25.2],
  antarctica: [19.6, -80.7], pacific: [-158.8, -3.1], atlantic: [-28.7, 3.7], indian: [78.9, -27.5], arctic: [0, 80.2], southern: [-25.4, -68] };
/** 대륙 면 레이어 흉내(select·onSelect·selected·centers + draw·hit 몰래 보기) */
function fakeLayer() {
  const subs = new Set(); let sel = null; const drawn = [];
  const layer = {
    id: 'cg', z: 10, centers: { ...CENTERS }, drawn,
    draw(...a) { drawn.push(a); },
    hit: () => ({ properties: { cls: 'asia' } }),
    labelObstacles: () => [],
    select(c) { const v = Array.isArray(c) ? `group:${c.join('+')}` : c; if (v === sel) return; sel = v; for (const f of [...subs]) f(sel); },
    onSelect(cb) { subs.add(cb); return () => subs.delete(cb); },
    destroy() { layer.destroyed = true; },
  };
  Object.defineProperty(layer, 'selected', { get: () => sel });
  return layer;
}
/** 가짜 시계·rAF(프레임마다 dt ms) */
function clock(dt = 50) {
  let t = 0; const q = [];
  return {
    now: () => t,
    raf: (fn) => { q.push(fn); return q.length; },
    caf: () => { q.length = 0; },
    step(n = 1) { for (let i = 0; i < n && q.length; i++) { t += dt; const fns = q.splice(0); for (const f of fns) f(t); } },
    get pending() { return q.length; },
  };
}
function make({ set = 'continents', idleHidden = false, ms = 0, map = fakeMap(), layer = fakeLayer(), ck = clock() } = {}) {
  const sh = shell();
  const L = GB.withGlobeButtons(layer, set, { map, idleHidden, ms, raf: ck.raf, caf: ck.caf, now: ck.now });
  L.drawSvg(sh.g, (ll) => ll, { k: 1 });
  return { ...sh, map, L, ck };
}

test('등록 전: continentGlobes 는 모르는 레이어 종류 → 등록 뒤 대륙 단추 5, continentQuiz 는 맞히기 + 대양 단추 5', () => {
  const sq = (lon, lat, d = 2) => [[[lon, lat], [lon, lat + d], [lon + d, lat + d], [lon + d, lat], [lon, lat]]];
  const data = () => ({ type: 'FeatureCollection', properties: { layerType: 'continents', legend: [{ cls: 'asia', label: '아시아', color: '#f2bc97' },
    { cls: 'northAmerica', label: '북아메리카', color: '#ecadc9' }, { cls: 'southAmerica', label: '남아메리카', color: '#f4e480' }],
  classes: { AAA: 'asia' }, centers: CENTERS, names: {}, oceans: [{ cls: 'pacific', label: '태평양', color: '#3d8fd1' }], tags: [] },
  features: [{ type: 'Feature', properties: { cls: 'pacific', ocean: true }, geometry: { type: 'MultiPolygon', coordinates: [sq(-170, -10, 5)] } }] });
  const cf = { 50: [{ type: 'Feature', properties: { iso: 'AAA', ko: '가나라' }, geometry: { type: 'MultiPolygon', coordinates: [sq(100, 30)] } }] };
  assert.throws(() => layerFromRef({ ref: 'cg', type: 'continentGlobes' }, data(), { countryFeatures: cf }), /모르는 레이어 종류/);
  AX.installAmericasExtras(); PX.installPolarExtras(); WX.installWorldExtras();
  const map = fakeMap();
  const L = layerFromRef({ ref: 'cg', type: 'continentGlobes' }, data(), { countryFeatures: cf, map });
  const sh = shell();
  L.drawSvg(sh.g, (ll) => ll, { k: 1 });
  assert.deepEqual(btns(sh.stage).map((b) => b.getAttribute('data-id')), ['asia', 'europe', 'africa', 'america', 'oceania']);
  // 실제 대륙 레이어 + 아메리카 = 북·남아메리카 묶음 고름
  click(btnOf(sh.stage, 'america'));
  assert.equal(L.selected, 'group:northAmerica+southAmerica');
  assert.ok(L.legend.isActive('northAmerica') && L.legend.isActive('southAmerica') && !L.legend.isActive('asia'), '묶음만 진하게');
  assert.throws(() => L.select(['northAmerica', 'nope']), /모르는 대륙 묶음/);
  L.select('pacific'); L.select(['northAmerica', 'southAmerica']);
  assert.equal(L.selected, 'group:northAmerica+southAmerica', '대양 고름에서 묶음으로');
  L.destroy();
  assert.equal(one(sh.stage, 'at-wg'), null);
  const Q = layerFromRef({ ref: 'cq', type: 'continentQuiz' }, data(), { countryFeatures: cf, map: fakeMap() });
  const sq2 = shell();
  Q.drawSvg(sq2.g, (ll) => ll, { k: 1 });
  assert.deepEqual(btns(sq2.stage).map((b) => b.getAttribute('data-id')), ['pacific', 'indian', 'atlantic', 'arctic', 'southern']);
  assert.ok(Q.quiz && typeof Q.quiz.open === 'function', '맞히기 그대로');
  assert.ok(one(sq2.stage, 'at-wq'), '맞히기 칸도 무대에');
  Q.destroy();
});

test('단추: 교과서 차례 이름·그림 주소(u1/globe/<id>-160.webp, 2x 320)·aria-label, 「평면 지도로」는 처음엔 꺼짐', () => {
  const a = make();
  const list = btns(a.stage);
  assert.deepEqual(list.map((b) => one(b, 'at-wg-name').textContent), ['아시아', '유럽', '아프리카', '아메리카', '오세아니아']);
  const img = one(list[0], 'at-wg-img');
  assert.match(img.getAttribute('src'), /u1\/globe\/asia-160\.webp$/);
  assert.match(img.getAttribute('srcset'), /asia-320\.webp 2x/);
  assert.equal(img.getAttribute('alt'), '');
  assert.equal(list[0].getAttribute('aria-label'), '아시아 — 지구본으로 돌려 보기');
  assert.equal(list[0].getAttribute('aria-pressed'), 'false');
  const flat = one(a.stage, 'at-wg-flat');
  assert.equal(flat.disabled, true); assert.ok(flat.classList.contains('is-off'));
  // 그림을 못 불러오면 선 아이콘 지구본으로
  img.dispatch('error');
  assert.equal(one(list[0], 'at-wg-img'), null);
  assert.ok(one(list[0], 'ds-icon'), '선 아이콘');
  const b = make({ set: 'oceans' });
  assert.deepEqual(btns(b.stage).map((x) => one(x, 'at-wg-name').textContent), ['태평양', '인도양', '대서양', '북극해', '남극해']);
  assert.throws(() => GB.withGlobeButtons(fakeLayer(), 'nope', { map: fakeMap() }), /단추 묶음/);
  a.L.destroy(); b.L.destroy();
});

test('누르기 → 지구본 + 회전 가운데 = 그 대륙 중심(1° 안) + 바탕 자연색 + select, 「평면 지도로」 켜짐', () => {
  const { stage, map, L } = make();
  click(btnOf(stage, 'asia'));
  assert.equal(map.view.key, 'globe');
  assert.ok(near(discCenter(), CENTERS.asia), `가운데 ${discCenter()}`);
  assert.equal(L.selected, 'asia');
  assert.equal(map.options.natural, true);
  assert.equal(btnOf(stage, 'asia').getAttribute('aria-pressed'), 'true');
  assert.ok(btnOf(stage, 'asia').classList.contains('is-active'));
  assert.equal(one(stage, 'at-wg-flat').disabled, false);
  // 아메리카 = 북·남 묶음, 가운데 = 두 중심의 구면 평균
  click(btnOf(stage, 'america'));
  assert.equal(L.selected, 'group:northAmerica+southAmerica');
  assert.ok(near(discCenter(), GB.globeTarget(GB.GLOBE_SETS.continents[3], CENTERS)), `아메리카 ${discCenter()}`);
  assert.ok(discCenter()[0] < -70 && discCenter()[0] > -95 && discCenter()[1] > 5 && discCenter()[1] < 30, `아메리카 가운데 ${discCenter()}`);
  assert.equal(btnOf(stage, 'asia').getAttribute('aria-pressed'), 'false');
  L.destroy();
});

test('대양 단추: 인도양은 손 중심(교과서 11쪽 그림 — 인도가 위 가운데), 나머지는 자료 centers', () => {
  const { stage, L } = make({ set: 'oceans' });
  click(btnOf(stage, 'indian'));
  assert.equal(L.selected, 'indian');
  assert.ok(near(discCenter(), [75, -10]), `인도양 ${discCenter()}`);
  click(btnOf(stage, 'pacific'));
  assert.ok(near(discCenter(), CENTERS.pacific), `태평양 ${discCenter()}`);
  click(btnOf(stage, 'arctic'));
  assert.ok(near(discCenter(), CENTERS.arctic), `북극해 ${discCenter()}`);
  L.destroy();
});

test('다른 단추 차례로 → 지구본으로 바꾸기·되돌리기 한 번씩, 「평면 지도로」 = 앞 평면 보기(도법·가운데·확대) 그대로 + select 없음 + 바탕 되돌림', () => {
  const { stage, map, L } = make();
  click(btnOf(stage, 'asia')); click(btnOf(stage, 'europe')); click(btnOf(stage, 'oceania'));
  assert.equal(map.log.filter(([t, v]) => t === 'projection' && v === 'globe').length, 1, '지구본으로는 한 번');
  assert.equal(L.selected, 'oceania');
  click(one(stage, 'at-wg-flat'));
  assert.equal(map.view.key, 'robinson');
  assert.deepEqual(map.view.center, [150, 20]); assert.equal(map.view.k, 2);
  assert.equal(L.selected, null);
  assert.equal(map.options.natural, false);
  assert.equal(map.log.filter(([t]) => t === 'projection').length, 2, '바꾸기 1 + 되돌리기 1');
  assert.equal(one(stage, 'at-wg-flat').disabled, true);
  assert.ok(btns(stage).every((b) => b.getAttribute('aria-pressed') === 'false'));
  click(one(stage, 'at-wg-flat'));
  assert.equal(map.log.filter(([t]) => t === 'projection').length, 2, '꺼진 단추는 아무것도 안 함');
  L.destroy();
});

test('이미 지구본(사용자가 고름)에서 누르면 도법은 그대로 돌리기만, 「평면 지도로」 = 그 전에 본 마지막 평면 보기', () => {
  const map = fakeMap();
  const { stage, L } = make({ map });
  map.view = { ...map.view, center: [120, 30], k: 3 }; map.emit('viewchange', map.view); // 멈춘 평면 보기 기억
  map.setProjection('globe');
  click(btnOf(stage, 'africa'));
  assert.equal(map.log.filter(([t]) => t === 'projection').length, 1, '단추는 도법을 안 바꿈');
  assert.ok(near(discCenter(), CENTERS.africa));
  click(one(stage, 'at-wg-flat'));
  assert.equal(map.view.key, 'robinson');
  assert.deepEqual(map.view.center, [120, 30]); assert.equal(map.view.k, 3);
  L.destroy();
});

test('사용자가 도법 상자로 바꾸면 단추 상태 풀림(select·바탕 되돌림, 보기는 건드리지 않음), 범례로 다른 것을 고르면 단추 눌림만 풂', () => {
  const { stage, map, L } = make();
  click(btnOf(stage, 'asia'));
  L.select('europe'); // 범례·맞히기 등 다른 길로 고름
  assert.equal(btnOf(stage, 'asia').getAttribute('aria-pressed'), 'false');
  assert.equal(one(stage, 'at-wg-flat').disabled, false, '지구본 보기는 그대로 — 평면 단추 켜짐');
  const n = map.log.length;
  map.setProjection('miller'); // 도법 상자
  assert.equal(L.selected, null);
  assert.equal(map.options.natural, false);
  assert.equal(one(stage, 'at-wg-flat').disabled, true);
  assert.deepEqual(map.log.slice(n).filter(([t]) => t === 'projection' || t === 'fly'), [['projection', 'miller']], '단추가 보기를 따로 안 움직임');
  L.destroy();
});

test('회전은 프레임마다 조금씩(부드럽게) — 날짜변경선을 건너는 짧은 쪽으로, 끝은 목표 1° 안, 끌면(회전이 바뀌면) 멈춤', () => {
  const ck = clock(50);
  const { stage, map, L } = make({ set: 'oceans', ms: 600, ck });
  map.view = { ...map.view, center: [170, 0] }; map.emit('viewchange', map.view);
  click(btnOf(stage, 'pacific')); // 170°E → 158.8°W: 날짜변경선 건넘
  assert.equal(map.view.key, 'globe');
  assert.ok(near(discCenter(), [170, 0], 0.5), `처음 = 앞 평면 가운데 ${discCenter()}`);
  const lons = [];
  for (let i = 0; i < 20 && ck.pending; i++) { ck.step(); lons.push(discCenter()[0]); }
  assert.ok(lons.length >= 5, `프레임 ${lons.length}`);
  assert.ok(lons.every((x) => x >= 170 || x <= -158.8 + 1e-6), `짧은 쪽(180° 건넘) ${lons.map((x) => x.toFixed(1))}`);
  assert.ok(near(discCenter(), CENTERS.pacific), `끝 ${discCenter()}`);
  assert.ok(map.rebases >= lons.length);
  assert.deepEqual(PROJECTIONS.globe.home, PROJECTIONS.globe.rot, '「세계 전체 보기」 = 그 대양');
  // 돌리는 중 사용자가 끌면 멈춤
  click(btnOf(stage, 'atlantic'));
  ck.step(2);
  PROJECTIONS.globe.rot = [10, -20];
  ck.step(3);
  assert.deepEqual(PROJECTIONS.globe.rot, [10, -20], '끈 회전을 덮어쓰지 않음');
  assert.equal(ck.pending, 0);
  L.destroy();
});

test('idleHidden(일반도 continentGlobes): 단추를 누르기 전에는 면을 안 그리고 맞히기도 없음 → 누르면 그림, 평면으로 돌아오면 다시 숨김', () => {
  const layer = fakeLayer();
  const { stage, map, L } = make({ idleHidden: true, layer });
  L.draw('ctx', 'path', {});
  assert.equal(layer.drawn.length, 0);
  assert.equal(L.hit([0, 0], [0, 0]), null);
  click(btnOf(stage, 'asia'));
  assert.ok(map.log.some(([t, id]) => t === 'refresh' && id === 'cg'));
  L.draw('ctx', 'path', {});
  assert.equal(layer.drawn.length, 1);
  assert.ok(L.hit([0, 0], [0, 0]));
  click(one(stage, 'at-wg-flat'));
  L.draw('ctx', 'path', {});
  assert.equal(layer.drawn.length, 1);
  L.destroy();
  // idleHidden 이 아니면 늘 그림
  const l2 = fakeLayer(); const b = make({ layer: l2 });
  b.L.draw('ctx', 'path', {}); assert.equal(l2.drawn.length, 1);
  b.L.destroy();
});

test('destroy(주제·묶음 바꿈): 지구본이면 앞 평면 보기로·바탕 되돌림, 무대 DOM·viewchange 구독 없음, 늦은 drawSvg 는 아무것도 안 함', () => {
  const { stage, g, map, L } = make();
  const subs = map.count('viewchange');
  click(btnOf(stage, 'asia'));
  L.destroy();
  assert.equal(map.view.key, 'robinson');
  assert.equal(map.options.natural, false);
  assert.equal(one(stage, 'at-wg'), null);
  assert.equal(map.count('viewchange'), subs - 1);
  L.drawSvg(g, (ll) => ll, { k: 1 });
  assert.equal(one(stage, 'at-wg'), null);
});

test('placeGlobes: 오른쪽 열(확대 단추 아래) → 작은 오른쪽 열 → 왼쪽 위 열 → 가로 줄 차례로 안 겹치는 첫 자리, 다 겹치면 겹친 넓이 × 무게가 가장 작은 곳', () => {
  const sizes = { l: [64, 340], s: [56, 300], row: [300, 60] };
  // 데스크톱 무대 1120×900: 지도 도구(오른쪽 위)·확대 단추(아래 끝 230)·범례 칸(625~)
  const tools = [840, 10, 1110, 118, 100], zoom = [1078, 125, 1110, 230, 100], legend = [862, 625, 1110, 890, 10];
  const p = GB.placeGlobes(1120, 900, sizes, [tools, zoom, legend], { anchorTop: 238 });
  assert.deepEqual([p.mode, p.side, p.left, p.top, p.overlap], ['l', 'right', 1046, 238, 0]);
  // 오른쪽 열이 꼬리표를 덮으면 왼쪽 위
  const q = GB.placeGlobes(1120, 900, sizes, [tools, zoom, legend, [1018, 375, 1068, 397, 5]], { anchorTop: 238 });
  assert.deepEqual([q.mode, q.side, q.left, q.top], ['l', 'left', 10, 10]);
  // 휴대폰 390×400: 오른쪽은 범례 칸이 덮고, 왼쪽 큰 열은 축척까지 닿음 → 작은 왼쪽 열
  const ph = GB.placeGlobes(390, 400, sizes, [[105, 10, 380, 120, 100], [348, 125, 380, 230, 100], [130, 235, 378, 390, 10], [10, 340, 110, 390, 100]], { anchorTop: 238 });
  assert.deepEqual([ph.mode, ph.side], ['s', 'left']);
  assert.ok(ph.top + 300 <= 340 - 4, '축척과 안 겹침');
  // 다 겹치면 가장 덜 겹치는 곳
  const all = GB.placeGlobes(200, 200, sizes, [[0, 0, 200, 200, 1]], { anchorTop: 10 });
  assert.ok(all.overlap > 0 && ['l', 's', 'row'].includes(all.mode));
});

test('무대 자리: 멈춘 그림마다 지도 도구·확대 단추·범례 칸·꼬리표(레이어 장애물)를 피함, 움직이는 동안은 안 봄 · 맞히기 칸은 단추 열을 피함', () => {
  const { stage, g, L } = make();
  stage._rect = { left: 0, top: 0, width: 1120, height: 900 };
  const wg = one(stage, 'at-wg');
  wg._rect = { left: 0, top: 0, width: 64, height: 340 };
  const tools = h('div', { class: 'at-tools-card' }); tools._rect = { left: 840, top: 10, width: 270, height: 108 };
  const zoom = h('div', { class: 'at-tools-zoom' }); zoom._rect = { left: 1078, top: 125, width: 32, height: 105 };
  stage.append(tools, zoom);
  L.drawSvg(g, (ll) => ll, { k: 1, moving: true });
  assert.equal(wg.getAttribute('data-place'), null, '움직이는 동안 안 봄');
  L.drawSvg(g, (ll) => ll, { k: 1, moving: false });
  assert.equal(wg.getAttribute('data-place'), 'right');
  assert.equal(wg.style.left, '1046px'); assert.equal(wg.style.top, '238px');
  L.destroy();
});

test('맞히기 칸(worldQuiz.placePanel)은 단추 열(.at-wg)을 무대 부품처럼 피함', async () => {
  const QZ = await import('../../src/atlas/worldQuiz.js');
  const data = { type: 'FeatureCollection', properties: { layerType: 'continents', legend: [{ cls: 'asia', label: '아시아', color: '#f2bc97' }], classes: {}, centers: CENTERS,
    names: {}, oceans: [], tags: [{ cls: 'asia', text: 'ㅇㅅㅇ 대륙', at: [500, 100] }] }, features: [] };
  const cf = { 50: [] };
  const sh = shell(); const map = fakeMap();
  const Q = QZ.withContinentQuiz(WX.continentsLayer('cq', data, { countryFeatures: { 50: [{ type: 'Feature', properties: { iso: 'X' }, geometry: null }] }, map }), data, { map, countryFeatures: cf });
  sh.stage._rect = { left: 0, top: 0, width: 800, height: 600 };
  const wg = h('section', { class: 'at-wg' }); wg._rect = { left: 10, top: 300, width: 64, height: 290 }; sh.stage.append(wg); // 왼쪽 아래를 차지
  Q.drawSvg(sh.g, (ll) => ll, { k: 1 });
  const panel = one(sh.stage, 'at-wq');
  panel._rect = { left: 0, top: 0, width: 252, height: 200 };
  Q.drawSvg(sh.g, (ll) => ll, { k: 1, moving: false });
  assert.equal(panel.getAttribute('data-corner'), 'tl');
  Q.destroy();
});
