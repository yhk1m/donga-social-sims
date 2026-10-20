// tests/atlas/atlasLayers.test.mjs — 주제 레이어 종류(src/atlas/layers.js): 가짜 DOM(helpers/fakeDom.mjs) + 그리기 기록 캔버스로
// 면(분류 색·흐리게·빗금·선 테두리·등온선 글자·맞히기·강조), 기호(제자리 고침·숨김·누르기·막대·지시선), 흐름선(곡선·화살촉·이음매), 핀(번호·고르기),
// 이미지(역투영·흐리게·실패), 묶음, topics 항목 → 레이어, 지도 구독(refreshLayer·hover·destroy)을 본다. 픽셀은 헤드리스 Chrome 캡처로 본다.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { geoEquirectangular } from 'd3-geo';
import { REPO, readJson } from '../../scripts/atlas/geo_util.mjs';
import { installFakeDom } from './helpers/fakeDom.mjs';
import { createLegendState } from '../../src/atlas/legendState.js';

const dom = installFakeDom();
// 오프스크린 캔버스(이미지 레이어)에 createImageData·putImageData 를 붙이고 넣은 그림을 모은다
const puts = [];
{
  const make = document.createElement;
  document.createElement = (tag) => {
    const el = make(tag);
    if (tag === 'canvas') {
      const get = el.getContext.bind(el);
      el.getContext = () => {
        const c = get();
        c.createImageData = (w, hh) => ({ width: w, height: hh, data: new Uint8ClampedArray(w * hh * 4) });
        c.putImageData = (d) => puts.push(d);
        return c;
      };
    }
    return el;
  };
}
const { areaLayer, symbolLayer, flowLayer, markerLayer, imageLayer, SELECT_OUTLINE } = await import('../../src/atlas/layers.js');
const { combineLayers, layerFromRef } = await import('../../src/atlas/layerRef.js');
test.after(() => dom.restore());
const DATA = path.join(REPO, 'sims/atlas-u2-asia/data');
const load = (f) => readJson(path.join(DATA, f));

// 화면 투영: 등장방형, 경도 1° = 4px, 가운데 (lon0, 0) = 화면 (400, 300)
function viewOf({ lon0 = 0, k = 2.2, W = 800, H = 600, moving = false } = {}) {
  const projection = geoEquirectangular().rotate([-lon0, 0]).scale(4 * 180 / Math.PI).translate([W / 2, H / 2]);
  const project = (ll) => { const q = projection(ll); return q && Number.isFinite(q[0]) ? q : null; };
  return { view: { k, width: W, height: H, projection, geoRect: null, moving }, project };
}
/** 그리기 기록 캔버스: fill·stroke 때의 상태(fillStyle·strokeStyle·globalAlpha·lineWidth·dash)를 남긴다. */
function recCtx() {
  const ops = [];
  let dash = [];
  const st = { fillStyle: null, strokeStyle: null, globalAlpha: 1, lineWidth: 1, font: '', textAlign: '', textBaseline: '', lineJoin: '', lineCap: '', imageSmoothingEnabled: true };
  const stack = [];
  const ctx = {
    ...st,
    ops,
    save() { stack.push({ ...this, dash }); }, restore() { const p = stack.pop(); if (p) { for (const k of Object.keys(st)) this[k] = p[k]; dash = p.dash; } },
    beginPath() { ops.push({ op: 'beginPath' }); }, moveTo() {}, lineTo() {}, closePath() {}, arc() {},
    rect(...a) { ops.push({ op: 'rect', a }); }, clip(rule) { ops.push({ op: 'clip', rule }); },
    fill() { ops.push({ op: 'fill', fillStyle: this.fillStyle, alpha: this.globalAlpha }); },
    stroke() { ops.push({ op: 'stroke', strokeStyle: this.strokeStyle, alpha: this.globalAlpha, width: this.lineWidth, dash: [...dash] }); },
    setLineDash(d) { dash = d; }, translate() {}, rotate() {},
    strokeText(t) { ops.push({ op: 'strokeText', t }); }, fillText(t) { ops.push({ op: 'fillText', t, fillStyle: this.fillStyle }); },
    createPattern() { return { pattern: true }; },
    putImageData(d) { ops.push({ op: 'putImageData', d }); }, drawImage() { ops.push({ op: 'drawImage', alpha: this.globalAlpha }); },
  };
  return ctx;
}
function fakeMap() {
  const handlers = { hover: new Set() };
  const refreshed = [];
  return {
    refreshed, destroyed: false, view: null,
    refreshLayer(id) { refreshed.push(id); return true; },
    on(type, fn) { handlers[type] ??= new Set(); handlers[type].add(fn); return () => handlers[type].delete(fn); },
    emit(type, e) { for (const fn of handlers[type] || []) fn(e); },
    get handlerCount() { return Object.values(handlers).reduce((a, set) => a + set.size, 0); },
  };
}
/** 요소 트리 안의 id 속성·url(#…) 참조 모음(문서 전역 id 를 쓰지 않는지) */
function idsIn(el, out = []) {
  if (el.getAttribute) {
    if (el.getAttribute('id') != null) out.push(el.getAttribute('id'));
    for (const [k, v] of el.attrs || []) if (/url\(#/.test(v)) out.push(`${k}=${v}`);
  }
  for (const c of el.childNodes || []) idsIn(c, out);
  return out;
}
/** 범례 흉내(구독 수를 센다) */
function fakeLegend(classes) {
  const real = createLegendState(classes);
  let subs = 0;
  return { ...real, onChange(fn) { subs++; const off = real.onChange(fn); return () => { subs--; off(); }; }, get subs() { return subs; } };
}
const sq = (lon, lat, d = 2) => [[[lon, lat], [lon, lat + d], [lon + d, lat + d], [lon + d, lat], [lon, lat]]]; // 시계 방향(d3)
const fc = (features, legend) => ({ type: 'FeatureCollection', properties: { id: 't', title: '시험', approx: false, legend }, features });
const areaFC = () => fc([
  { type: 'Feature', properties: { type: 'area', cls: 'a', label: 'A', color: '#ff0000' }, geometry: { type: 'MultiPolygon', coordinates: [sq(10, 10)] } },
  { type: 'Feature', properties: { type: 'area', cls: 'b', label: 'B', color: '#00ff00' }, geometry: { type: 'MultiPolygon', coordinates: [sq(20, 10)] } },
  { type: 'Feature', properties: { type: 'area', cls: 'h', label: '빗금', color: '#ba703d', pattern: 'hatch' }, geometry: { type: 'MultiPolygon', coordinates: [sq(30, 10)] } },
  { type: 'Feature', properties: { type: 'isotherm', cls: 'iso', kind: 'isotherm', color: '#ed1064', value: 20, label: '20℃' }, geometry: { type: 'LineString', coordinates: [[0, 30], [40, 30]] } },
  { type: 'Feature', properties: { type: 'line', cls: 'loc', label: '정전 라인', color: '#ef5ba1' }, geometry: { type: 'LineString', coordinates: [[0, -20], [40, -20]] } },
], [
  { cls: 'a', color: '#ff0000', kind: 'fill', label: 'A' }, { cls: 'b', color: '#00ff00', kind: 'fill', label: 'B' },
  { cls: 'h', color: '#ba703d', kind: 'fill', pattern: 'hatch', label: '빗금' }, { cls: 'iso', color: '#ed1064', kind: 'line', label: '기온' },
  { cls: 'loc', color: '#ef5ba1', kind: 'line', dashed: true, label: '정전 라인' }, { cls: 'x', color: '#000000', kind: 'fill', label: '범례만', geometry: false },
]);
const drawn = (layer, v = viewOf()) => { const ctx = recCtx(); layer.draw(ctx, (g) => g && ctx.ops.push({ op: 'path', g }), v.view); return ctx.ops; };

test('areaLayer: 분류마다 색으로 채우고, 고르지 않은 분류는 fillOpacity × dimAlpha', () => {
  const legend = createLegendState(['a', 'b', 'h', 'iso', 'loc', 'x']);
  const L = areaLayer('t', areaFC(), { legend, fillOpacity: 0.8, dimAlpha: 0.15 });
  let fills = drawn(L).filter((o) => o.op === 'fill');
  assert.deepEqual(fills.slice(0, 2).map((o) => [o.fillStyle, o.alpha]), [['#ff0000', 0.8], ['#00ff00', 0.8]]);
  legend.toggle('b');
  fills = drawn(L).filter((o) => o.op === 'fill');
  assert.ok(Math.abs(fills[0].alpha - 0.8 * 0.15) < 1e-9);
  assert.equal(fills[1].alpha, 0.8);
});

test('areaLayer: 범례에서 고른 분류(묶음)는 검은 윤곽 — 고른 면 바깥만(evenodd 자르기), 화면 굵기 일정, 고르지 않으면·선 분류면 없음', () => {
  const legend = createLegendState(['a', 'b', 'h', 'iso', 'loc', 'x']);
  const L = areaLayer('t', areaFC(), { legend });
  const outline = (ops) => ops.filter((o) => o.op === 'stroke' && o.strokeStyle === SELECT_OUTLINE.color);
  assert.equal(outline(drawn(L)).length, 0, '전체 보기면 윤곽 없음');
  legend.toggle('b');
  let ops = drawn(L);
  let out = outline(ops);
  assert.equal(out.length, 1);
  assert.equal(out[0].alpha, 1);
  assert.equal(out[0].width, SELECT_OUTLINE.px * 2, '자르기로 안쪽 절반을 지우므로 2배 굵기로 긋는다');
  assert.ok(SELECT_OUTLINE.px >= 1.5 && SELECT_OUTLINE.px <= 2);
  const ci = ops.findIndex((o) => o.op === 'clip');
  assert.equal(ops[ci].rule, 'evenodd');
  // 자르기 경로 = 화면 사각형 + 고른 면(b 만), 그다음 윤곽 경로도 b 만
  const pathsBetween = (i0, i1) => ops.slice(i0, i1).filter((o) => o.op === 'path').map((o) => o.g);
  const bi = ops.lastIndexOf(ops.slice(0, ci).reverse().find((o) => o.op === 'beginPath'));
  assert.equal(ops[bi + 1].op, 'rect');
  assert.equal(pathsBetween(bi, ci).length, 1);
  const si = ops.indexOf(out[0]);
  assert.equal(pathsBetween(ci, si).length, 1);
  // 윤곽은 면 채움 뒤, 등온선·지명 앞
  const lastAreaFill = ops.map((o, i) => (o.op === 'fill' ? i : -1)).filter((i) => i >= 0 && i < si).pop();
  assert.ok(lastAreaFill < ci);
  assert.ok(ops.findIndex((o) => o.op === 'stroke' && o.strokeStyle === '#ed1064') > si, '등온선은 윤곽 위');
  // 묶음(두 분류) = 한 번에 바깥 윤곽(분류 사이 경계는 자르기 안쪽이라 안 보임)
  legend.toggleGroup('ab', ['a', 'b']);
  ops = drawn(L); out = outline(ops);
  assert.equal(out.length, 1);
  assert.equal(pathsBetween(ops.findIndex((o) => o.op === 'clip'), ops.indexOf(out[0])).length, 2);
  // 빗금 분류도
  legend.toggle('h');
  assert.equal(outline(drawn(L)).length, 1);
  // 선 분류(등온선)만 고르면 면이 없으니 윤곽 없음
  legend.toggle('iso');
  assert.equal(outline(drawn(L)).length, 0);
  legend.reset();
  assert.equal(outline(drawn(L)).length, 0, '다시 전체 보기면 없어짐');
  // 범례 없는 레이어는 윤곽 없음
  assert.equal(outline(drawn(areaLayer('t', areaFC()))).length, 0);
});

test('areaLayer: 빗금 면은 무늬로, 선은 흰 테두리 뒤 색 선(정전 라인은 점선), 등온선은 값 글자', () => {
  const ops = drawn(areaLayer('t', areaFC()));
  assert.ok(ops.some((o) => o.op === 'fill' && o.fillStyle?.pattern), '빗금 무늬 채움');
  const strokes = ops.filter((o) => o.op === 'stroke' && o.dash !== undefined);
  const iso = strokes.findIndex((o) => o.strokeStyle === '#ed1064');
  assert.ok(iso > 0 && /255,255,255/.test(strokes[iso - 1].strokeStyle) && strokes[iso - 1].width > strokes[iso].width, '흰 테두리가 먼저, 더 굵게');
  const loc = strokes.find((o) => o.strokeStyle === '#ef5ba1');
  assert.ok(loc.dash.length === 2, '정전 라인 점선');
  assert.equal(strokes[iso].dash.length, 0);
  assert.ok(ops.some((o) => o.op === 'fillText' && o.t === '20' && o.fillStyle === '#ed1064'));
});

test('areaLayer.hit: 면 안이면 그 Feature, 흐린 분류는 맞히지 않음, 선은 화면 거리로', () => {
  const legend = createLegendState(['a', 'b', 'h', 'iso', 'loc', 'x']);
  const L = areaLayer('t', areaFC(), { legend });
  const v = viewOf();
  assert.equal(L.hit([0, 0], [11, 11]), null, '그리기 전에는 맞히지 않음');
  drawn(L, v);
  assert.equal(L.hit(v.project([11, 11]), [11, 11]).properties.cls, 'a');
  assert.equal(L.hit(v.project([31, 11]), [31, 11]).properties.cls, 'h');
  assert.equal(L.hit(v.project([15, 15]), [15, 15]), null);
  const onLine = v.project([20, 30]);
  assert.equal(L.hit([onLine[0], onLine[1] + 2], [20, 29.5]).properties.cls, 'iso');
  legend.toggle('b');
  drawn(L, v);
  assert.equal(L.hit(v.project([11, 11]), [11, 11]), null);
  assert.equal(L.hit(v.project([21, 11]), [21, 11]).properties.cls, 'b');
});

test('areaLayer + 지도: 범례가 바뀌면 refreshLayer(layerId), hover 면 강조 윤곽, 다른 레이어 hover 면 지움, destroy 는 구독 해제', () => {
  const legend = createLegendState(['a', 'b', 'h', 'iso', 'loc', 'x']);
  const map = fakeMap();
  const v = viewOf();
  map.view = v.view;
  const L = areaLayer('t', areaFC(), { legend, map });
  const g = document.createElementNS('svg', 'g');
  L.drawSvg(g, v.project, v.view);
  const hover = g.childNodes[0];
  assert.equal(hover.getAttribute('d'), null);
  map.emit('hover', { layerId: 't', feature: L.features[0] });
  assert.match(hover.getAttribute('d'), /^M/);
  assert.match(hover.getAttribute('class'), /at-hover-area/);
  map.emit('hover', { layerId: 'other', feature: {} });
  assert.equal(hover.getAttribute('d'), null);
  // 움직이는 동안은 숨김
  map.emit('hover', { layerId: 't', feature: L.features[0] });
  L.drawSvg(g, v.project, { ...v.view, moving: true });
  assert.equal(hover.getAttribute('d'), null);
  L.drawSvg(g, v.project, v.view);
  assert.equal(g.childNodes.length, 1, '강조 경로는 하나를 제자리에서 고침');
  legend.toggle('a');
  assert.deepEqual(map.refreshed, ['t']);
  assert.ok(map.handlerCount > 0);
  L.destroy();
  assert.equal(map.handlerCount, 0);
  legend.toggle('a');
  assert.deepEqual(map.refreshed, ['t'], 'destroy 뒤에는 다시 그리지 않음');
});

const symFC = () => fc([
  { type: 'Feature', properties: { type: 'symbol', cls: 'c1', kind: '석유', label: '석유', color: '#ed1c24', size: 2.2 }, geometry: { type: 'Point', coordinates: [10, 10] } },
  { type: 'Feature', properties: { type: 'symbol', cls: 'c2', kind: '석탄', label: '석탄', color: '#bcbec0', size: 2.4 }, geometry: { type: 'Point', coordinates: [20, 10] } },
  { type: 'Feature', properties: { type: 'symbol', cls: 'c2', kind: '석탄', label: '석탄', color: '#bcbec0', size: 2.4 }, geometry: { type: 'Point', coordinates: [170, 10] } },
], [{ cls: 'c1', color: '#ed1c24', kind: 'fill', label: '석유', shape: 'circle' }, { cls: 'c2', color: '#bcbec0', kind: 'fill', label: '석탄', shape: 'square' }]);

test('symbolLayer: 기호를 한 번 만들고 제자리에서 옮김, 화면 밖은 숨김, 모양은 범례 shape, 흐린 분류는 투명도', () => {
  const legend = createLegendState(['c1', 'c2']);
  const L = symbolLayer('s', symFC(), { legend });
  const g = document.createElementNS('svg', 'g');
  const v = viewOf();
  L.drawSvg(g, v.project, v.view);
  const root = g.childNodes[0];
  const els = [...root.childNodes];
  assert.equal(els.length, 3);
  assert.ok(els[0].classList.contains('at-sym-circle') && els[1].classList.contains('at-sym-square'));
  assert.match(els[0].getAttribute('transform'), /^translate\(440,260\) scale\(/);
  assert.equal(els[2].getAttribute('display'), 'none', '170°E 는 화면 밖(800px)');
  const v2 = viewOf({ lon0: 5 });
  L.drawSvg(g, v2.project, v2.view);
  assert.equal(root.childNodes[0], els[0], '같은 요소');
  assert.match(els[0].getAttribute('transform'), /^translate\(420,260\)/);
  legend.toggle('c1');
  L.drawSvg(g, v2.project, v2.view);
  assert.equal(els[1].getAttribute('opacity'), '0.2');
  assert.equal(els[0].getAttribute('opacity'), null);
});

test('symbolLayer: 누르면 onPick(feature) + stopPropagation, hit 은 화면 거리, hover 는 is-hover', () => {
  const picked = [];
  const map = fakeMap();
  const L = symbolLayer('s', symFC(), { map, onPick: (f) => picked.push(f) });
  const g = document.createElementNS('svg', 'g');
  const v = viewOf();
  L.drawSvg(g, v.project, v.view);
  const el = g.childNodes[0].childNodes[1];
  let stopped = false;
  el._listeners.find((l) => l.type === 'click').fn({ stopPropagation() { stopped = true; } }); // 가짜 DOM dispatch 는 stopPropagation 을 덮어써서 직접 부름
  assert.equal(stopped, true);
  assert.equal(picked[0].properties.kind, '석탄');
  assert.equal(L.hit([481, 261]).properties.kind, '석탄');
  assert.equal(L.hit([600, 100]), null);
  map.emit('hover', { layerId: 's', feature: L.features[0] });
  assert.ok(g.childNodes[0].childNodes[0].classList.contains('is-hover'));
  map.emit('hover', { layerId: 's', feature: null });
  assert.ok(!g.childNodes[0].childNodes[0].classList.contains('is-hover'));
});

test('symbolLayer 인구 막대: 값만큼 칸 + 사람 아이콘 + 나라 이름, 지시선 막대는 barAt 에 세우고 나라 자리까지 점선', () => {
  const gj = load('layer-p23-density-cities.json');
  const L = symbolLayer('p', gj);
  const g = document.createElementNS('svg', 'g');
  const v = viewOf({ lon0: 100, W: 1000, H: 800 });
  L.drawSvg(g, v.project, v.view);
  const items = [...g.childNodes[0].childNodes];
  assert.equal(items.length, 7);
  const china = items[L.features.findIndex((f) => f.properties.name === '중국')];
  const cells = china.childNodes.find((c) => c.classList.contains('at-bar-cells'));
  assert.equal(cells.childNodes.filter((c) => c.classList.contains('at-bar-cell')).length, 14);
  assert.equal(china.childNodes.find((c) => c.classList.contains('at-bar-label')).textContent, '중국');
  assert.equal(china.childNodes.find((c) => c.classList.contains('at-bar-leader')).getAttribute('display'), 'none');
  const pak = items[L.features.findIndex((f) => f.properties.name === '파키스탄')];
  const leader = pak.childNodes.find((c) => c.classList.contains('at-bar-leader'));
  assert.equal(leader.getAttribute('display'), null);
  const country = v.project(L.features.find((f) => f.properties.name === '파키스탄').geometry.coordinates);
  assert.ok(leader.getAttribute('d').startsWith(`M${Math.round(country[0] * 10) / 10},${Math.round(country[1] * 10) / 10}L`));
  // 막대 상자 안을 누르면 맞음
  const base = v.project(L.features.find((f) => f.properties.name === '중국').geometry.coordinates);
  assert.equal(L.hit([base[0], base[1] - 20]).properties.name, '중국');
  // 지명 피하기(E1): 막대 상자 + 나라 이름 상자(+ 지시선 끝 점) — 이름 상자는 이름 글자 수만큼 넓다
  const obs = L.labelObstacles();
  const shown = items.filter((e) => e.getAttribute('display') == null).length;
  const leaders = L.features.filter((f) => f.properties.barAt).length;
  assert.equal(obs.length, shown * 2 + leaders);
  const nameBox = obs.find((b) => b[0] < base[0] && b[2] > base[0] && b[1] > base[1]);
  assert.ok(nameBox && nameBox[2] - nameBox[0] >= 2 * 12, '「중국」 이름 상자');
});

test('symbolLayer·markerLayer.labelObstacles: 그린 기호·핀 자리(화면 px), 화면 밖·흐린 분류는 뺌', () => {
  const legend = createLegendState(['c1', 'c2']);
  const L = symbolLayer('s', symFC(), { legend });
  const g = document.createElementNS('svg', 'g');
  const v = viewOf();
  L.drawSvg(g, v.project, v.view);
  const o = L.labelObstacles();
  assert.equal(o.length, 2, '170°E 는 화면 밖');
  assert.ok(o[0][0] < 440 && o[0][2] > 440 && o[0][1] < 260 && o[0][3] > 260);
  legend.toggle('c1');
  assert.equal(L.labelObstacles().length, 1, '고른 분류(c1)만');
  const P = markerLayer('m', [{ id: 'a', lonlat: [10, 10] }, { id: 'b', lonlat: [170, 10] }]);
  const pg = document.createElementNS('svg', 'g');
  P.drawSvg(pg, v.project, v.view);
  const po = P.labelObstacles();
  assert.equal(po.length, 1);
  assert.deepEqual(po[0], [432, 236, 448, 260], '핀 머리·꼬리(끝 = 경위도 점)');
});

const flowFC = () => fc([
  { type: 'Feature', properties: { type: 'flow', cls: 'import', color: '#0066b3', width: 2, label: '미국' }, geometry: { type: 'MultiLineString', coordinates: [[[-100, 40], [-150, 45], [-180, 46]], [[180, 46], [150, 42], [128, 37]]] } },
  { type: 'Feature', properties: { type: 'flow', cls: 'export', color: '#ed0c6e', width: 0.6, label: '일본' }, geometry: { type: 'LineString', coordinates: [[128, 37], [134, 36], [138, 36]] } },
], [{ cls: 'import', color: '#0066b3', kind: 'flow', label: '수입' }, { cls: 'export', color: '#ed0c6e', kind: 'flow', label: '수출' }]);

test('flowLayer: 이차 곡선 경로 + 선마다 화살촉 경로(같은 <g> 안, id 없음), 굵기 순서, 날짜변경선은 이음매에서만 끊음', () => {
  const L = flowLayer('f', flowFC());
  const g = document.createElementNS('svg', 'g');
  const pac = viewOf({ lon0: 150, W: 1600 });
  L.drawSvg(g, pac.project, pac.view);
  const flows = g.childNodes[0].childNodes;
  assert.equal(flows.length, 2);
  const part = (el, c) => el.childNodes.find((x) => x.classList.contains(c));
  // 굵은 선(미국, 2pt)이 먼저(아래)
  assert.equal(part(flows[0], 'at-flow-line').getAttribute('stroke'), '#0066b3');
  assert.ok(+part(flows[0], 'at-flow-line').getAttribute('stroke-width') > +part(flows[1], 'at-flow-line').getAttribute('stroke-width'));
  assert.equal(part(flows[0], 'at-flow-head').getAttribute('fill'), '#0066b3');
  assert.equal(part(flows[0], 'at-flow-line').getAttribute('marker-end'), null);
  const dPac = part(flows[0], 'at-flow-line').getAttribute('d');
  assert.equal((dPac.match(/M/g) || []).length, 1, '태평양 중심에서는 한 줄');
  assert.match(dPac, /Q/);
  // 화살촉 끝 = 자료 마지막 점(수입 미국 → 우리나라 128,37), 선 끝은 화살촉 밑변 쪽으로 당겨짐
  const tip = pac.project([128, 37]);
  const head = part(flows[0], 'at-flow-head').getAttribute('d');
  assert.ok(head.startsWith(`M${Math.round(tip[0] * 10) / 10},${Math.round(tip[1] * 10) / 10}L`), head);
  const lineEnd = dPac.match(/(-?[\d.]+),(-?[\d.]+)$/).slice(1).map(Number);
  assert.ok(Math.hypot(lineEnd[0] - tip[0], lineEnd[1] - tip[1]) > 2, '선 끝이 화살 끝보다 앞');
  const atl = viewOf({ lon0: 0, W: 1600 });
  L.drawSvg(g, atl.project, atl.view);
  assert.equal((part(flows[0], 'at-flow-line').getAttribute('d').match(/M/g) || []).length, 2, '대서양 중심에서는 날짜변경선에서 두 조각');
  assert.equal(L.hit(atl.project([134, 36])).properties.label, '일본');
  assert.deepEqual(idsIn(g), [], '문서 전역 id 없음');
});

test('flowLayer: 선 끝이 이음매(날짜변경선·구드 틈) 너머로 잘리면 잘린 자리에 화살촉을 달지 않는다', () => {
  // 마지막 마디(170 → −170)가 대서양 중심의 날짜변경선을 건너 끝점 하나만 남은 조각은 버려진다 → 마지막 조각 끝 ≠ 자료 끝점
  const L = flowLayer('f', fc([
    { type: 'Feature', properties: { type: 'flow', cls: 'export', color: '#ed0c6e', width: 1, label: '미국' }, geometry: { type: 'LineString', coordinates: [[150, 40], [170, 42], [-170, 44]] } },
  ], [{ cls: 'export', color: '#ed0c6e', kind: 'flow', label: '수출' }]));
  const g = document.createElementNS('svg', 'g');
  const head = () => g.childNodes[0].childNodes[0].childNodes.find((x) => x.classList.contains('at-flow-head')).getAttribute('d');
  const atl = viewOf({ lon0: 0, W: 1600 });
  L.drawSvg(g, atl.project, atl.view);
  assert.ok(g.childNodes[0].childNodes[0].childNodes.find((x) => x.classList.contains('at-flow-line')).getAttribute('d'), '선은 그린다');
  assert.equal(head(), null, '잘린 끝에는 화살촉 없음');
  const pac = viewOf({ lon0: 150, W: 1600 });
  L.drawSvg(g, pac.project, pac.view);
  assert.match(head(), /^M.*Z$/, '태평양 중심에서는 끝까지 이어져 화살촉 있음');
});

test('markerLayer: 번호 = photo.pin, 누르면 고르고 onPick, select(null) 로 풀기, hit 은 label 있는 Feature', () => {
  const picked = [];
  const markers = [{ id: 'm1', lonlat: [10, 10], title: '하나', photo: { pin: 3 } }, { id: 'm2', lonlat: [20, 10], title: '둘' }];
  const L = markerLayer('mk', markers, { onPick: (m) => picked.push(m.id) });
  const g = document.createElementNS('svg', 'g');
  const v = viewOf();
  L.drawSvg(g, v.project, v.view);
  const root = g.childNodes[0];
  const [a, b] = root.childNodes;
  assert.equal(a.childNodes.find((c) => c.classList.contains('at-pin-num')).textContent, '3');
  assert.equal(b.childNodes.find((c) => c.classList.contains('at-pin-num')).textContent, '2');
  a.dispatch('click');
  assert.deepEqual(picked, ['m1']);
  assert.ok(a.classList.contains('is-selected'));
  assert.equal(root.childNodes.at(-1), a, '고른 핀은 맨 위로');
  L.drawSvg(g, v.project, v.view);
  assert.match(a.getAttribute('transform'), /scale\(1\.25\)/);
  const f = L.hit([v.project([20, 10])[0], v.project([20, 10])[1] - 15]);
  assert.equal(f.properties.label, '둘');
  L.select(null);
  assert.ok(!a.classList.contains('is-selected'));
});

test('imageLayer: 화면 화소 → 경위도 → 교과서 지면 → 이미지 화소, 단계 하나를 고르면 다른 단계는 흐리게, hit 은 범례 단계', async () => {
  // 교과서 지도 = 등장방형(경도 0~40, 위도 0~20 을 지면 0~400 × 200~0 pt 로), 이미지 4×2 화소: 왼쪽 절반 = 짙은 색, 오른쪽 = 옅은 색
  const fit = { family: 'equirectangular', params: [20, 0], sim: { a: 10 * 180 / Math.PI, b: 0, tx: 200, ty: 100 } };
  // 투영식 y 는 북쪽이 음수 → 지면 y = 100 − 10·위도°
  const px = (r, g, b) => [r, g, b, 255];
  const data = new Uint8ClampedArray([...px(155, 46, 51), ...px(155, 46, 51), ...px(255, 244, 227), ...px(255, 244, 227), ...px(155, 46, 51), ...px(155, 46, 51), ...px(255, 244, 227), ...px(255, 244, 227)]);
  const legendSpec = [{ color: '#9b2e33', label: '200 이상' }, { color: '#fff4e3', label: '5 미만' }];
  const legend = createLegendState(['d1', 'd2']);
  const map = fakeMap();
  const L = imageLayer('img', { url: 'https://example.invalid/x.png', fit, bbox: [0, -100, 400, 100], width: 4, height: 2, legend: legendSpec }, { legend, map, load: async () => ({ width: 4, height: 2, data }) });
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(L.loaded, true);
  assert.deepEqual(map.refreshed, ['img'], '불러오면 다시 그림');
  const v = viewOf({ W: 400, H: 200 });
  const ops = drawn(L, v);
  assert.ok(ops.some((o) => o.op === 'drawImage' && o.alpha === 0.85));
  const put = puts.at(-1);
  const at = (x, y) => { const i = (Math.floor(y / 2) * put.width + Math.floor(x / 2)) * 4; return [...put.data.slice(i, i + 4)]; };
  // 교과서 지면 x = 200 + 10·(경도 − 20), y = 100 − 10·위도 → 경도 5 = 이미지 왼쪽 열(짙은 색), 35 = 오른쪽 열(옅은 색), −20 = 이미지 밖
  const left = v.project([5, 5]), right = v.project([35, 5]);
  assert.deepEqual(at(left[0], left[1]), [155, 46, 51, 255]);
  assert.deepEqual(at(right[0], right[1]).slice(0, 3), [255, 244, 227]);
  assert.equal(at(v.project([-20, 5])[0], v.project([-20, 5])[1])[3], 0, '이미지 밖은 투명');
  assert.equal(L.hit(right, [35, 5]).properties.label, '5 미만');
  legend.toggle('d1');
  drawn(L, v);
  const put2 = puts.at(-1);
  const i2 = (Math.floor(right[1] / 2) * put2.width + Math.floor(right[0] / 2)) * 4;
  assert.ok(put2.data[i2 + 3] < 60, '고르지 않은 단계는 흐리게');
  assert.equal(L.hit(right, [35, 5]), null);
  assert.deepEqual(map.refreshed, ['img', 'img']);
});

test('imageLayer: 불러오기 실패면 failed, 그리지 않고 오류도 없음', async () => {
  const fit = { family: 'equirectangular', params: [0, 0], sim: { a: 1, b: 0, tx: 0, ty: 0 } };
  const L = imageLayer('img', { url: 'u', fit, bbox: [0, 0, 1, 1], width: 1, height: 1 }, { load: async () => null });
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(L.failed, true);
  assert.equal(drawn(L).length, 0);
  assert.equal(L.hit([0, 0], [0, 0]), null);
});

test('combineLayers: 그리기는 부분마다, SVG 는 부분마다 <g>, hit 은 위 부분부터', () => {
  const calls = [];
  const a = { id: 'a', z: 10, draw: () => calls.push('a.draw'), hit: () => 'A' };
  const b = { id: 'b', z: 70, drawSvg: (g) => calls.push(`b.svg:${g.getAttribute('class')}`), hit: () => 'B', destroy: () => calls.push('b.destroy') };
  const L = combineLayers('ab', [a, b]);
  assert.equal(L.z, 10);
  L.draw(recCtx(), () => {}, {});
  const g = document.createElementNS('svg', 'g');
  L.drawSvg(g, () => null, {});
  L.drawSvg(g, () => null, {});
  assert.equal(g.childNodes.length, 1);
  assert.equal(L.hit([0, 0], [0, 0]), 'B');
  L.destroy();
  assert.deepEqual(calls, ['a.draw', 'b.svg:at-part', 'b.svg:at-part', 'b.destroy']);
});

test('layerFromRef: topics.json 의 모든 레이어 항목 → 맞는 종류의 레이어(id = ref, 범례·meta·위치 근사)', async () => {
  const topics = load('topics.json');
  const data = Object.fromEntries(topics.flatMap((t) => t.layers || []).map((l) => [l.ref, load(`${l.ref}.json`)]));
  const map = fakeMap();
  let n = 0;
  for (const t of topics) {
    for (const ref of t.layers || []) {
      const L = layerFromRef(ref, data, { map, load: async () => null });
      n++;
      assert.equal(L.id, ref.ref);
      assert.equal(L.meta.type, ref.type);
      assert.equal(L.meta.title, ref.label);
      if (ref.type === 'area') assert.equal(typeof L.draw, 'function');
      if (ref.type === 'symbol') assert.equal(typeof L.drawSvg, 'function');
      if (ref.type === 'flow') { assert.equal(typeof L.draw, 'function'); assert.equal(typeof L.drawSvg, 'function'); }
      if (ref.type === 'image') assert.equal(typeof L.draw, 'function');
      assert.ok(L.legend, `${ref.ref} 범례 상태`);
      assert.deepEqual(L.legend.classes, L.legendItems.map((e) => e.cls));
      assert.equal(L.meta.approx, ref.ref === 'layer-p22-singapore' || ref.ref === 'layer-p22-kashmir', ref.ref);
      if (L.meta.approx) assert.equal(L.meta.approxNote, '위치 근사');
      L.destroy?.();
    }
  }
  assert.equal(n, 12);
  assert.equal(map.handlerCount, 0, 'destroy 로 구독이 모두 풀림');
  // 교역: 면 범례 7 + 흐름선 2 를 하나의 범례로, 흐름선 범례를 고르면 지도는 그 레이어 id 로 다시 그림
  const trade = layerFromRef(topics.find((t) => t.id === 'industry').layers.find((l) => l.type === 'flow'), data, { map });
  assert.equal(trade.legendItems.length, 9);
  trade.legend.toggle('import');
  assert.deepEqual(map.refreshed.at(-1), 'layer-p24-trade');
  assert.throws(() => layerFromRef({ ref: 'layer-p21-climate', type: 'nope' }, data), /모르는 레이어 종류/);
});

test('같은 레이어 객체를 다른 <g> 에 다시 그려도(렌더러에 다시 올림) 모두 새로 만든다 — 인구 막대 칸·흐름선 굵기·화살촉', () => {
  const v = viewOf({ lon0: 100, W: 1000, H: 800 });
  const bars = symbolLayer('p', load('layer-p23-density-cities.json'));
  const flows = flowLayer('f', flowFC());
  const pins = markerLayer('m', [{ id: 'a', lonlat: [100, 30], title: '가' }]);
  for (const L of [bars, flows, pins]) {
    const g1 = document.createElementNS('svg', 'g'), g2 = document.createElementNS('svg', 'g');
    L.drawSvg(g1, v.project, v.view);
    L.drawSvg(g2, v.project, v.view);
    assert.equal(g2.childNodes.length, 1, L.id);
    const root = g2.childNodes[0];
    if (L === bars) {
      const china = root.childNodes[bars.features.findIndex((f) => f.properties.name === '중국')];
      const cells = china.childNodes.find((c) => c.classList.contains('at-bar-cells'));
      assert.equal(cells.childNodes.filter((c) => c.classList.contains('at-bar-cell')).length, 14, '칸 다시 만듦');
      assert.match(cells.getAttribute('transform'), /^translate\(/);
      const base = v.project([105.234, 28.942]);
      assert.ok(bars.hit([base[0], base[1] - 20]));
    }
    if (L === flows) {
      for (const el of root.childNodes) {
        const line = el.childNodes.find((c) => c.classList.contains('at-flow-line'));
        assert.ok(+line.getAttribute('stroke-width') > 0, '굵기 다시 씀');
        assert.match(el.childNodes.find((c) => c.classList.contains('at-flow-head')).getAttribute('d'), /^M.*Z$/);
      }
    }
    if (L === pins) assert.match(root.childNodes[0].getAttribute('transform'), /^translate\(/);
  }
});

test('add/remove(=만들기·destroy) 10번 해도 지도·범례 구독 수가 그대로', () => {
  const topics = load('topics.json');
  const refs = topics.flatMap((t) => t.layers || []);
  const data = Object.fromEntries(refs.map((l) => [l.ref, load(`${l.ref}.json`)]));
  const map = fakeMap();
  for (const ref of refs) {
    const lg = fakeLegend(layerFromRef(ref, data, { legend: null, load: async () => null }).legendItems.map((e) => e.cls));
    for (let i = 0; i < 10; i++) {
      const L = layerFromRef(ref, data, { map, legend: lg, load: async () => null });
      assert.equal(lg.subs, 1, `${ref.ref}: 범례 구독은 한 번(묶음 포함)`);
      L.destroy();
      assert.equal(lg.subs, 0, ref.ref);
      assert.equal(map.handlerCount, 0, ref.ref);
    }
  }
  const mk = topics.find((t) => t.markers?.length).markers;
  for (let i = 0; i < 10; i++) { const L = markerLayer('m', mk, { map }); assert.equal(map.handlerCount, 1); L.destroy(); }
  assert.equal(map.handlerCount, 0);
});

test('레이어별 destroy: 흐름선·기호·핀은 hover·범례 구독을 풀고, 그 뒤 범례가 바뀌어도 다시 그리지 않는다', () => {
  for (const make of [
    (o) => flowLayer('f', flowFC(), o),
    (o) => symbolLayer('s', symFC(), o),
    (o) => markerLayer('m', [{ id: 'a', lonlat: [10, 10], title: '가' }], o),
  ]) {
    const map = fakeMap();
    const lg = fakeLegend(['import', 'export', 'c1', 'c2']);
    const L = make({ map, legend: lg });
    const g = document.createElementNS('svg', 'g');
    const v = viewOf();
    L.drawSvg(g, v.project, v.view);
    assert.equal(map.handlerCount, 1, L.id);
    L.destroy();
    assert.equal(map.handlerCount, 0, L.id);
    assert.equal(lg.subs, 0, L.id);
    lg.toggle('c1');
    assert.deepEqual(map.refreshed, [], L.id);
  }
});

test('imageLayer: 범례만 바뀐 다시 그리기는 역투영 격자를 다시 계산하지 않음, ready 는 성공 여부', async () => {
  const fit = { family: 'equirectangular', params: [20, 0], sim: { a: 10 * 180 / Math.PI, b: 0, tx: 200, ty: 100 } };
  const data = new Uint8ClampedArray(4 * 2 * 4).fill(200);
  const legend = createLegendState(['d1', 'd2']);
  const L = imageLayer('img', { url: 'u', fit, bbox: [0, -100, 400, 100], legend: [{ color: '#c8c8c8', label: 'A' }, { color: '#000000', label: 'B' }] }, { legend, load: async () => ({ width: 4, height: 2, data }) });
  assert.equal(await L.ready, true);
  const v = viewOf({ W: 400, H: 200 });
  let inv = 0;
  const p0 = v.view.projection, proj = Object.assign((ll) => p0(ll), { invert: (q) => { inv++; return p0.invert(q); } });
  const view = { ...v.view, key: 'miller', centerLon: 0, x: 0, y: 0, projection: proj };
  drawn(L, { view });
  const first = inv;
  assert.ok(first > 0);
  legend.toggle('d2');
  drawn(L, { view: { ...view } }); // 렌더러는 그릴 때마다 새 view 객체 — 값이 같으면 다시 쓴다
  assert.equal(inv, first, '역투영 다시 안 함');
  drawn(L, { view: { ...view, k: 3 } });
  assert.ok(inv > first, '보기가 바뀌면 다시');
  const warn = console.warn; console.warn = () => {};
  try {
    const bad = imageLayer('x', { url: 'u', fit, bbox: [0, 0, 1, 1] }, { load: async () => { throw new Error('막힘'); } });
    assert.equal(await bad.ready, false);
    assert.equal(bad.failed, true);
  } finally { console.warn = warn; }
});

test('layerFromRef: layer.meta 는 레이어 자체 meta 위에 덧씌운다(자료 properties 의 source 등이 남음)', () => {
  const d = load('layer-p21-climate.json');
  const L = layerFromRef({ ref: 'layer-p21-climate', type: 'area', label: '기후' }, d);
  assert.equal(L.meta.source, d.properties.source);
  assert.equal(L.meta.title, '기후');
  assert.equal(L.meta.legend, undefined);
});

test('symbolLayer 레이어별 크기(properties.symbolStyle)·범례 stroke 테두리 — 24쪽 자원은 아시아 보기에서도 지름 8.5px 이상, 석탄은 짙은 테두리', () => {
  const style = (fcx, st) => ({ ...fcx, properties: { ...fcx.properties, symbolStyle: st } });
  const base = symFC();
  base.properties.legend[1].stroke = '#58595b';
  const v = viewOf({ k: 1.2 });
  const radius = (L) => { const g = document.createElementNS('svg', 'g'); L.drawSvg(g, v.project, v.view); return [...g.childNodes[0].childNodes].map((e) => Number(/scale\(([\d.]+)\)/.exec(e.getAttribute('transform') || '')?.[1] ?? NaN)); };
  const [r0] = radius(symbolLayer('s', base));
  assert.ok(Math.abs(r0 * 2 - 4) < 0.01, `기본은 최소 4px (${r0 * 2})`);
  const L = symbolLayer('s', style(base, { pxPerPt: 3.4, minPx: 8.5, maxPx: 20 }));
  const [r1, r2] = radius(L);
  assert.ok(r1 * 2 >= 8.5 && r2 * 2 >= 8.5, `${r1 * 2}, ${r2 * 2}`);
  const g = document.createElementNS('svg', 'g');
  L.drawSvg(g, v.project, v.view);
  const shapes = [...g.childNodes[0].childNodes].map((e) => e.childNodes[0]);
  assert.ok(!shapes[0].classList.contains('has-stroke'));
  assert.ok(shapes[1].classList.contains('has-stroke'), '석탄은 범례 stroke 테두리');
  const res = load('layer-p24-resources.json');
  assert.deepEqual(res.properties.symbolStyle, { pxPerPt: 3.4, minPx: 8.5, maxPx: 20 });
  assert.equal(res.properties.legend.find((e) => e.label === '석탄').stroke, '#58595b');
});

// ── 나라 단위 단계구분도(countryClass, U3-3a) ─────────────────────────────
const { countryClassFeatures, countryClassLayer, countryLevel } = await import('../../src/atlas/countryClass.js');
const ccData = () => ({
  type: 'countryClass', properties: { id: 'cc', title: '도시화율', approx: false, source: '시험' },
  legend: [{ cls: 'c1', color: '#e8562a', label: '80~100', kind: 'fill', present: true }, { cls: 'c2', color: '#f6b26b', label: '70~80', kind: 'fill', present: true }],
  classes: { AAA: 'c1', BBB: 'c2' }, overrides: [],
});
const country = (iso, ko, lon, d = 2) => ({ type: 'Feature', properties: { iso, ko }, geometry: { type: 'MultiPolygon', coordinates: [sq(lon, 10, d)] } });
// 상세도별 나라 도형: 10a 는 같은 나라를 더 자세히(여기서는 크기만 다르게)
const ccCountries = () => ({ 50: [country('AAA', '가나라', 10), country('BBB', '나나라', 20), country('CCC', '다나라', 30)],
  '10a': [country('AAA', '가나라', 10, 2.5), country('BBB', '나나라', 20, 2.5), country('CCC', '다나라', 30, 2.5)] });

test('countryClassFeatures: 분류 없는 나라는 칠하지 않고, 나라마다 범례 색·「이름 · 분류」 말풍선', () => {
  const fc1 = countryClassFeatures(ccData(), ccCountries()['50']);
  assert.deepEqual(fc1.features.map((f) => [f.properties.iso, f.properties.cls, f.properties.color, f.properties.label]),
    [['AAA', 'c1', '#e8562a', '가나라 · 80~100'], ['BBB', 'c2', '#f6b26b', '나나라 · 70~80']]);
  assert.deepEqual(fc1.properties.legend.map((e) => e.cls), ['c1', 'c2']);
  assert.equal(countryClassFeatures({ ...ccData(), classes: {} }, ccCountries()['50']).features.length, 0);
});

test('countryClassLayer: 상세도가 바뀌어도 같은 iso 는 같은 색, 분류 없는 나라는 안 칠함, 맞히기·범례 고름·선택 윤곽은 면 레이어 그대로', () => {
  const legend = createLegendState(['c1', 'c2']);
  const map = fakeMap();
  const L = countryClassLayer('cc', ccData(), { countryFeatures: ccCountries(), legend, map });
  const fills = (detail) => { const v = viewOf(); v.view.detail = detail; return drawn(L, v).filter((o) => o.op === 'fill').map((o) => o.fillStyle); };
  assert.deepEqual(fills('50'), ['#e8562a', '#f6b26b']);
  assert.equal(L.level, '50');
  assert.deepEqual(fills('10a'), ['#e8562a', '#f6b26b']);
  assert.equal(L.level, '10a');
  assert.equal(countryLevel({ detail: '110' }, ccCountries()), '50');
  // 맞히기: 지금 상세도(10a)의 나라 — 10a 도형은 10~12.5° 라 12.2° 도 맞음
  const f = L.hit([0, 0], [12.2, 11]);
  assert.equal(f?.properties.iso, 'AAA');
  assert.equal(L.hit([0, 0], [31, 11]), null, '분류 없는 나라(CCC)는 맞히지 않음');
  fills('50');
  assert.equal(L.hit([0, 0], [12.2, 11]), null, '50 도형(10~12°) 밖');
  // 범례 고름 → 다른 분류 흐림 + 검은 윤곽, 지도 다시 그리기는 이 레이어 id 로 한 번
  legend.toggle('c2');
  assert.deepEqual(map.refreshed, ['cc']);
  const v = viewOf(); v.view.detail = '50';
  const ops = drawn(L, v);
  assert.ok(ops.find((o) => o.op === 'fill' && o.fillStyle === '#e8562a').alpha < 0.5);
  assert.equal(ops.filter((o) => o.op === 'stroke' && o.strokeStyle === SELECT_OUTLINE.color).length, 1);
  // SVG 강조: 상세도마다 <g>, 지금 것만 보임
  const g = document.createElementNS('svg', 'g');
  const v2 = viewOf(); v2.view.detail = '10a';
  L.drawSvg(g, v.project, v.view); L.drawSvg(g, v2.project, v2.view);
  assert.deepEqual(g.childNodes.map((c) => c.getAttribute('display')), ['none', null]);
  L.destroy();
  assert.equal(map.handlerCount, 0);
});

test('layerFromRef: type countryClass → 나라 칠하기 레이어(범례 항목·meta), 나라 도형이 없으면 오류', () => {
  const L = layerFromRef({ ref: 'cc', type: 'countryClass', label: '도시화율' }, { cc: ccData() }, { countryFeatures: ccCountries() });
  assert.deepEqual(L.legendItems.map((e) => e.cls), ['c1', 'c2']);
  assert.equal(L.legendItems[0].present, undefined);
  assert.equal(L.meta.title, '도시화율');
  assert.equal(L.meta.source, '시험');
  assert.ok(L.legend);
  assert.throws(() => layerFromRef({ ref: 'cc', type: 'countryClass' }, ccData()), /countryFeatures/);
});
