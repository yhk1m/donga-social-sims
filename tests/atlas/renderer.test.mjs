// tests/atlas/renderer.test.mjs — createMap DOM 동작(가짜 DOM, helpers/fakeDom.mjs): 정리(destroy), 보간 중 크기 바뀜, viewchange 는 보기가
// 바뀔 때만, invalidate·refreshLayer, 같은 레이어 다시 넣기, setPlaces, click detail·끌기 뒤 click 막기, 투영 못 하는 flyTo, 건너뛴 hover 다시,
// 나라 색인 미리 만들기, view 객체 캐시. 그리기 결과(픽셀)는 헤드리스 Chrome 캡처로 본다(이 테스트는 상태·이벤트만).
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { register } from 'node:module';
import { REPO, readJson } from '../../scripts/atlas/geo_util.mjs';
import { installFakeDom } from './helpers/fakeDom.mjs';

register('./helpers/cssHooks.mjs', import.meta.url);
const dom = installFakeDom();
const { createMap } = await import('../../src/atlas/renderer.js');
const basemap = readJson(path.join(REPO, 'sims/atlas-u2-asia/data/basemap.json'));
const places = readJson(path.join(REPO, 'sims/atlas-u2-asia/data/places.json'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
test.after(() => dom.restore());

function setup({ w = 1024, h = 768, withPlaces = false } = {}) {
  const stage = document.createElement('div');
  stage._rect = { left: 0, top: 0, width: w, height: h };
  const map = createMap(stage, { basemap, places: withPlaces ? places : [] });
  const svg = stage.childNodes.find((n) => n.classList.contains('at-overlay'));
  svg._rect = stage._rect;
  const ro = dom.observers.at(-1);
  dom.flushRaf();
  return { stage, map, svg, ro };
}
const near = (a, b, eps, msg) => assert.ok(Math.abs(a - b) <= eps, `${msg ?? ''} ${a} ≠ ${b}`);

test('destroy: 무대에서 캔버스·SVG 를 떼고, SVG 리스너 0개, ResizeObserver.disconnect, 예약한 rAF·타이머 정리', async () => {
  const { stage, map, svg, ro } = setup();
  assert.ok(svg.listenerCount > 0);
  map.invalidate();
  map.destroy();
  assert.equal(svg.listenerCount, 0);
  assert.equal(ro.disconnected, true);
  assert.equal(stage.childNodes.length, 0);
  assert.equal(stage.classList.contains('at-stage'), false);
  dom.flushRaf(); // destroy 뒤 남은 rAF 가 있어도 아무것도 하지 않아야
  await sleep(400); // 나라 색인 예약도 취소됨
  assert.equal(map.stats.countryIndexMs, null);
});

test('보간 중 크기가 바뀌면 보간을 먼저 끝내고 새 크기에서 화면 가운데 경위도·k 를 지킨다', () => {
  const { stage, map, ro } = setup();
  map.flyTo({ center: [105, 35], zoom: 3 }, 0);
  const c0 = map.view.center;
  map.setProjection('robinson'); // 보간 시작(rAF 대기)
  assert.equal(map.view.moving, true);
  stage._rect = { left: 0, top: 0, width: 800, height: 600 };
  ro.trigger();
  dom.flushRaf(1); // ResizeObserver → rAF → resize (보간 프레임보다 먼저 끝냄)
  const v = map.view;
  assert.equal(v.key, 'robinson');
  assert.equal(v.width, 800); assert.equal(v.height, 600);
  assert.equal(v.moving, false);
  near(v.k, 3, 1e-9, 'k');
  const q = map.project(c0);
  near(q[0], 400, 0.5, 'x'); near(q[1], 300, 0.5, 'y');
  map.destroy();
});

test('viewchange 는 보기가 실제로 바뀔 때만(레이어·옵션·invalidate 로는 나지 않음)', () => {
  const { map } = setup();
  let n = 0;
  map.on('viewchange', () => n++);
  map.addLayer({ id: 'a', z: 1, draw() {} });
  map.setOptions({ graticule: false });
  map.invalidate();
  map.removeLayer('a');
  dom.flushRaf();
  map.redraw(); // 보기 그대로
  assert.equal(n, 0);
  map.flyTo({ center: [127, 37], zoom: 4 }, 0);
  assert.equal(n, 1);
  map.flyTo({ center: [127, 37], zoom: 4 }, 0);
  assert.equal(n, 1, '같은 보기로 다시');
  map.destroy();
});

test('invalidate: 한 rAF 로 모음, svgOnly 는 SVG 레이어만, 지명은 다시 놓지 않음 / refreshLayer 는 그 레이어만', () => {
  const { map } = setup({ withPlaces: true });
  const cnt = { draw: 0, a: 0, b: 0 };
  map.addLayer({ id: 'cv', z: 10, draw() { cnt.draw++; } });
  map.addLayer({ id: 'a', z: 60, drawSvg() { cnt.a++; } });
  map.addLayer({ id: 'b', z: 70, drawSvg() { cnt.b++; } });
  dom.flushRaf();
  const labels0 = map.stats.labels.length, renders0 = map.stats.render.length;
  Object.assign(cnt, { draw: 0, a: 0, b: 0 });
  map.invalidate({ svgOnly: true }); map.invalidate({ svgOnly: true });
  dom.flushRaf();
  assert.deepEqual(cnt, { draw: 0, a: 1, b: 1 });
  assert.equal(map.stats.render.length, renders0, '캔버스 안 그림');
  map.invalidate(); map.invalidate({ svgOnly: true });
  dom.flushRaf();
  assert.deepEqual(cnt, { draw: 1, a: 2, b: 2 });
  assert.equal(map.stats.render.length, renders0 + 1);
  assert.equal(map.refreshLayer('a'), true);
  dom.flushRaf();
  assert.deepEqual(cnt, { draw: 1, a: 3, b: 2 });
  map.refreshLayer('cv');
  dom.flushRaf();
  assert.equal(cnt.draw, 2);
  assert.equal(map.refreshLayer('없음'), false);
  assert.equal(map.stats.labels.length, labels0, '지명은 다시 놓지 않음');
  map.destroy();
});

test('addLayer: 같은 객체를 다시 넣으면 destroy 하지 않고, 같은 id 의 다른 객체면 옛것을 destroy', () => {
  const { map } = setup();
  let d1 = 0, d2 = 0;
  const l1 = { id: 'x', z: 1, draw() {}, destroy() { d1++; } };
  map.addLayer(l1);
  l1.z = 5;
  map.addLayer(l1);
  assert.equal(d1, 0);
  assert.deepEqual(map.layers.map((l) => l.id), ['x']);
  map.addLayer({ id: 'x', z: 1, draw() {}, destroy() { d2++; } });
  assert.equal(d1, 1);
  map.removeLayer('x');
  assert.equal(d2, 1);
  map.destroy();
});

test('setPlaces: 바탕 지도는 그대로 두고 지명만 다시 놓음', () => {
  const { map, stage } = setup({ withPlaces: true });
  map.flyTo({ bounds: [95.587, 16.983, 143.304, 51.551] }, 0);
  const svg = stage.childNodes.find((n) => n.classList.contains('at-overlay'));
  const gLabels = svg.childNodes.find((n) => n.classList.contains('at-labels'));
  assert.ok(map.stats.labelCount > 20);
  const renders = map.stats.render.length;
  map.setPlaces([]);
  dom.flushRaf();
  assert.equal(map.stats.labelCount, 0);
  assert.equal(gLabels.childNodes.length, 0);
  map.setPlaces(places.slice(0, 50));
  dom.flushRaf();
  assert.ok(map.stats.labelCount > 0 && map.stats.labelCount <= 50);
  assert.equal(map.stats.render.length, renders, '바탕 지도는 다시 그리지 않음');
  map.destroy();
});

test('click: detail(누른 횟수)을 넘기고, 끌기 직후 100ms 안 click 은 막고 그 뒤는 받는다', async () => {
  const { map, svg } = setup();
  const got = [];
  map.on('click', (e) => got.push(e));
  svg.dispatch('click', { clientX: 512, clientY: 384, detail: 2 });
  assert.equal(got.length, 1);
  assert.equal(got[0].detail, 2);
  assert.ok(got[0].lonlat);
  const p = (type, x, extra = {}) => svg.dispatch(type, { pointerId: 1, pointerType: 'mouse', button: 0, buttons: 1, clientX: x, clientY: 300, ...extra });
  p('pointerdown', 300); p('pointermove', 320); p('pointermove', 360); p('pointerup', 360, { buttons: 0 });
  svg.dispatch('click', { clientX: 360, clientY: 300, detail: 1 });
  assert.equal(got.length, 1, '끌기 직후 click 은 막힘');
  await sleep(130);
  dom.flushRaf();
  svg.dispatch('click', { clientX: 360, clientY: 300, detail: 1 });
  assert.equal(got.length, 2);
  map.destroy();
});

test('flyTo/fitBounds: 투영할 수 없는 가운데·범위면 console.warn 한 번, 보기는 그대로', () => {
  const { map } = setup();
  map.flyTo({ center: [127, 37], zoom: 4 }, 0);
  const before = { ...map.view };
  const warns = [];
  const orig = console.warn;
  console.warn = (m) => warns.push(m);
  try {
    map.flyTo({ center: [NaN, 10], zoom: 6 }, 0);
    map.flyTo({ center: [NaN, 10], zoom: 6 }, 0); // 같은 경고는 한 번만
  } finally { console.warn = orig; }
  assert.equal(warns.length, 1, warns.join('\n'));
  const after = map.view;
  assert.deepEqual([after.k, after.x, after.y], [before.k, before.x, before.y]);
  // (fitBounds 범위는 다섯 도법이 모든 경위도를 유한하게 투영해서 실제로는 걸리지 않는다 — 같은 경로로 막아만 둠)
  map.destroy();
});

test('움직이는 동안 건너뛴 hover 는 멈춘 뒤 마지막 포인터 자리로 한 번 다시', async () => {
  const { map, svg } = setup();
  const got = [];
  map.on('hover', (e) => got.push(e));
  svg.dispatch('pointermove', { pointerId: 2, buttons: 1, clientX: 500, clientY: 380 }); // 누른 채 움직임 → 건너뜀
  dom.flushRaf();
  assert.equal(got.length, 0);
  map.flyTo({ center: [10, 10], zoom: 2 }, 0); // 멈춤(settle)
  assert.equal(got.length, 1);
  assert.deepEqual(got[0].xy, [500, 380]);
  map.redraw();
  assert.equal(got.length, 1, '한 번만');
  map.destroy();
});

test('나라 색인(50m)은 첫 settle 뒤 쉬는 틈에 미리 만든다(첫 hover 가 끊기지 않게)', async () => {
  const { map } = setup();
  assert.equal(map.stats.countryIndexMs, null);
  await sleep(400);
  assert.equal(typeof map.stats.countryIndexMs, 'number');
  map.destroy();
});

test('map.view: 보기가 그대로면 같은 객체, 바뀌면 새 객체, center 는 처음 읽을 때 한 번만 되돌려 계산', () => {
  const { map } = setup();
  const v = map.view;
  assert.equal(map.view, v);
  let n = 0;
  const inv = v.projection.invert;
  v.projection.invert = (xy) => { n++; return inv(xy); };
  const c1 = v.center, c2 = v.center;
  assert.equal(n, 1);
  assert.equal(c1, c2);
  v.projection.invert = inv;
  map.flyTo({ center: [127, 37], zoom: 4 }, 0);
  assert.notEqual(map.view, v);
  map.destroy();
});

test('크기를 모를 때(W=0) setProjection·setCenterLon 도 view 캐시를 비운다', () => {
  const { map } = setup({ w: 0, h: 0 });
  assert.equal(map.view.key, 'miller');
  map.setProjection('robinson');
  assert.equal(map.view.key, 'robinson');
  map.setCenterLon(150);
  assert.equal(map.view.centerLon, 150);
  map.destroy();
});

test('지형 음영 훅: 멈출 때 육지·path 를 받고, 10a 면 under 와 단원 상자 밖 자르기(clipOutside)도, relief:false 면 안 부름', () => {
  const { map } = setup();
  const calls = [];
  map.setReliefDrawer((ctx, projection, view, o) => calls.push({ projection, view, o }));
  dom.flushRaf();
  assert.equal(calls.length, 1);
  assert.ok(calls[0].o.land && typeof calls[0].o.path === 'function');
  assert.equal(calls[0].o.under, null);
  assert.equal(calls[0].o.clipOutside, null);
  assert.equal(calls[0].projection, calls[0].view.projection);
  map.fitBounds([124, 33, 131.5, 43], { ms: 0 });
  const last = calls.at(-1);
  assert.equal(last.view.detail, '10a');
  assert.ok(last.o.under, '10a 면 단원 상자 밖 50m 육지');
  assert.equal(typeof last.o.clipOutside, 'function');
  last.o.clipOutside(); // 가짜 캔버스에서 오류 없이
  const n = calls.length;
  map.setOptions({ relief: false });
  dom.flushRaf();
  map.redraw();
  assert.equal(calls.length, n, 'relief:false 면 훅을 부르지 않음');
  map.destroy();
});

test('destroy 뒤: map.destroyed 는 true, setReliefDrawer·invalidate·refreshLayer·setPlaces·setOptions 는 아무것도 안 함(rAF 없음, 오류 없음)', () => {
  const { map } = setup();
  map.addLayer({ id: 'a', z: 1, draw() {} });
  dom.flushRaf();
  assert.equal(map.destroyed, false);
  map.destroy();
  assert.equal(map.destroyed, true);
  const before = dom.rafPending;
  let called = 0;
  map.setReliefDrawer(() => { called++; });
  map.invalidate();
  map.invalidate({ svgOnly: true });
  assert.equal(map.refreshLayer('a'), false);
  map.setPlaces(places);
  map.setOptions({ relief: false, labels: false, graticule: false });
  assert.equal(dom.rafPending, before, 'destroy 뒤에는 rAF 를 걸지 않음');
  dom.flushRaf();
  assert.equal(called, 0);
});

test('고도 색 훅: tint 일 때만 sea → land 차례, 음영과 같은 공유 격자(그림마다 invertGrid 한 번 — miss 1 · hit 2), options 알림, destroy 로 격자 놓아줌', () => {
  const { map } = setup();
  const seq = [];
  const seen = [];
  map.setReliefDrawer((ctx, projection, view, o) => { seq.push('relief'); seen.push(o.grid()); });
  map.setTintDrawer((ctx, projection, view, o) => { seq.push(o.phase); seen.push(o.grid()); });
  const opts = [];
  const off = map.on('options', (o) => opts.push(o.tint));
  dom.flushRaf();
  assert.deepEqual(seq, ['relief'], 'tint 끔이면 고도 색 훅 안 부름');
  assert.equal(map.tintReady, true);
  seq.length = 0; seen.length = 0;
  map.setOptions({ tint: true });
  dom.flushRaf();
  assert.deepEqual(seq, ['sea', 'land', 'relief']);
  assert.ok(seen[0] === seen[1] && seen[1] === seen[2], '같은 격자 객체');
  const last = map.gridStats.renders.at(-1);
  assert.deepEqual([last.misses, last.hits], [1, 2]);
  assert.deepEqual(opts, [true]);
  map.redraw();
  assert.notEqual(seen.at(-1), seen[0], '다음 그림은 새 격자');
  off();
  map.destroy();
});

test('자연색 훅: natural 이 켜져 있고 붙었으면 고도 색 대신 같은 자리(sea → land, 같은 공유 격자), 음영 훅에 natural: true, 안 붙었으면 고도 색 그대로', () => {
  const { map } = setup();
  const seq = [];
  map.setReliefDrawer((ctx, projection, view, o) => { seq.push(`relief:${!!o.natural}`); o.grid(); });
  map.setTintDrawer((ctx, projection, view, o) => { seq.push(`tint:${o.phase}`); });
  map.setOptions({ tint: true, natural: true });
  dom.flushRaf();
  assert.deepEqual(seq, ['tint:sea', 'tint:land', 'relief:false'], '자연색이 아직 안 붙었으면 고도 색');
  assert.equal(map.naturalReady, false);
  const opts = [];
  const off = map.on('options', (o) => opts.push(o.natural));
  seq.length = 0;
  map.setNaturalDrawer((ctx, projection, view, o) => { seq.push(`natural:${o.phase}`); assert.equal(typeof o.grid, 'function'); o.grid(); });
  dom.flushRaf();
  assert.equal(map.naturalReady, true);
  assert.deepEqual(opts, [true], '붙으면 options 알림');
  assert.deepEqual(seq, ['natural:sea', 'natural:land', 'relief:true']);
  const last = map.gridStats.renders.at(-1);
  assert.deepEqual([last.misses, last.hits], [1, 2], '자연색 두 단계 + 음영이 격자 하나');
  seq.length = 0;
  map.setOptions({ natural: false });
  dom.flushRaf();
  assert.deepEqual(seq, ['tint:sea', 'tint:land', 'relief:false'], '끄면 다시 고도 색');
  assert.equal(map.options.natural, false);
  off();
  map.destroy();
});
