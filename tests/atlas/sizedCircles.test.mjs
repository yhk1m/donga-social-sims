// © 2026 김용현
// tests/atlas/sizedCircles.test.mjs — 크기 비례 원(U5-3e, 47쪽 세계 100대 초국적 기업 본사): 파이프라인 build_layers(circleRadiusDeg·sortSizedCircles)와
//   앱 길 — 공유 코드 없이 sizeBy 'class'(classSymbolPx — 범례 단계 size 전체에 배율 하나)로 그리면 확대해도 지름 비 = 교과서 지름 비(√값 비),
//   큰 원부터 그린 차례 그대로, 실리콘 밸리 확대 창(symbolInset)은 rDeg × 창 px/° 반지름(없으면 옛 5.2).
import test from 'node:test';
import assert from 'node:assert/strict';
import { geoEquirectangular } from 'd3-geo';
import { installFakeDom } from './helpers/fakeDom.mjs';

const dom = installFakeDom();
const { symbolLayer } = await import('../../src/atlas/layers.js');
const { symbolInset, insetProjection, geoBox } = await import('../../src/atlas/inset.js');
const { circleRadiusDeg, sortSizedCircles } = await import('../../scripts/atlas/build_layers.mjs');
test.after(() => dom.restore());

const findAll = (el, pred, out = []) => { if (pred(el)) out.push(el); for (const c of el.childNodes || []) findAll(c, pred, out); return out; };
const byClass = (c) => (n) => n.classList?.contains(c);

// 47쪽 범례 √ 맞춤(k 0.6044 — symbols.sized_circles) 꼴: 범례 size = k·√값, 기호 size = 교과서 지름(범례 밖 큰 원·작은 원 포함)
const K = 0.6044;
const LEGEND = [200, 100, 10].map((v, i) => ({ cls: `c${i + 1}`, color: '#f27292d9', label: String(v), kind: 'symbol', shape: 'circle', size: +(K * Math.sqrt(v)).toFixed(2), value: v, stroke: '#231f20' }));
const SIZES = [8.73, 8.32, 5.45, 3.1, 2.4, 1.6];
const feats = SIZES.map((size, i) => ({ type: 'Feature', properties: { type: 'symbol', cls: size > 7 ? 'c1' : size > 3 ? 'c2' : 'c3', label: `원 ${i}`, color: '#f27292d9', size, value: +((size / K) ** 2).toFixed(1) }, geometry: { type: 'Point', coordinates: [i * 0.5, 0] } }));
const DATA = { type: 'FeatureCollection', properties: { id: 'p47-hq', sizeBy: 'class', sizeRule: 'sqrt', legendStyle: 'nested-circles', legend: LEGEND }, features: feats };

function viewOf(k) {
  const projection = geoEquirectangular().scale(400).translate([400, 300]);
  return { project: (ll) => projection(ll), view: { k, width: 800, height: 600, projection } };
}

test('크기 비례 원: sizeBy class 길로 확대 단계마다 지름 비 = 교과서 지름 비(범례 밖 큰 원도), 큰 원부터 그린 차례, 반투명 색 그대로', () => {
  const L = symbolLayer('p47-hq', DATA);
  for (const k of [1, 2.2, 8, 30]) {
    const v = viewOf(k);
    const g = document.createElementNS('svg', 'g');
    L.drawSvg(g, v.project, v.view);
    const items = [...g.childNodes[0].childNodes];
    const r = items.map((e) => Number(/scale\(([\d.]+)\)/.exec(e.getAttribute('transform'))[1]));
    for (let i = 1; i < r.length; i++) assert.ok(Math.abs(r[i] / r[0] - SIZES[i] / SIZES[0]) < 0.01, `k ${k}: ${r}`);
    assert.deepEqual(r, [...r].sort((a, b) => b - a), '큰 원이 먼저(아래)');
    assert.equal(items[0].childNodes[0].getAttribute('fill'), '#f27292d9');
    assert.ok(items[0].childNodes[0].classList.contains('has-stroke'), '범례 stroke → 원 테두리');
  }
  // 범례 √: 200 ↔ 10 지름 비 = √20
  assert.ok(Math.abs(LEGEND[0].size / LEGEND[2].size - Math.sqrt(20)) < 0.05);
});

test('파이프라인: circleRadiusDeg = 상하좌우 반지름 점 되돌린 대권 거리 평균, sortSizedCircles = 큰 원부터(같은 크기는 자료 차례)', () => {
  // 가짜 변환기: 지면 1pt = 경도 0.1°·위도 0.1°(적도 근처라 대권 거리 ≈ 0.1°/pt)
  const cv = { invert: ([x, y]) => [x * 0.1, -y * 0.1] };
  assert.ok(Math.abs(circleRadiusDeg(cv, [0, 0], 4) - 0.2) < 1e-3);
  // 되돌릴 수 없는 점은 뺌, 가운데를 못 되돌리면 멈춤
  const half = { invert: ([x, y]) => (x > 0 ? null : [x * 0.1, -y * 0.1]) };
  assert.ok(Math.abs(circleRadiusDeg(half, [0, 0], 4) - 0.2) < 1e-3);
  assert.throws(() => circleRadiusDeg({ invert: () => null }, [0, 0], 4), /되돌릴 수 없음/);
  const f = (size, id) => ({ properties: { size, id } });
  const got = sortSizedCircles([f(2, 'a'), f(5, 'b'), f(2, 'c'), f(8, 'd'), f(5, 'e')]).map((x) => x.properties.id);
  assert.deepEqual(got, ['d', 'b', 'e', 'a', 'c']);
});

test('실리콘 밸리 확대 창: rDeg 가 있으면 반지름 = rDeg × 창 px/°, 없으면 옛 5.2(싱가포르 그대로)', () => {
  const outline = { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[[-122.6, 37.2], [-121.7, 37.2], [-121.7, 37.9], [-122.6, 37.9], [-122.6, 37.2]]] } }] };
  const P = insetProjection(geoBox(outline, 0.004), { width: 640 });
  const pts = { type: 'FeatureCollection', properties: { legend: LEGEND }, features: [
    { type: 'Feature', properties: { cls: 'c1', color: '#f27292d9', label: 'A', rDeg: 0.05 }, geometry: { type: 'Point', coordinates: [-122.0, 37.4] } },
    { type: 'Feature', properties: { cls: 'c3', color: '#f27292d9', label: 'B', rDeg: 0.01 }, geometry: { type: 'Point', coordinates: [-122.1, 37.5] } },
    { type: 'Feature', properties: { cls: 'c3', color: '#f27292d9', label: 'C' }, geometry: { type: 'Point', coordinates: [-122.2, 37.6] } },
  ] };
  const stage = document.createElement('div');
  const ins = symbolInset(stage, { outline, points: pts, title: '실리콘 밸리' });
  const syms = findAll(stage, byClass('at-inset-sym'));
  assert.equal(syms.length, 3);
  const r = syms.map((c) => Number(c.getAttribute('r')));
  assert.ok(Math.abs(r[0] - 0.05 * P.k) < 1e-9 && Math.abs(r[1] - 0.01 * P.k) < 1e-9, `${r} k ${P.k}`);
  assert.ok(Math.abs(r[0] / r[1] - 5) < 1e-9, '반지름 비 = rDeg 비');
  assert.equal(r[2], 5.2);
  assert.equal(syms[0].getAttribute('fill'), '#f27292d9');
  ins.destroy();
});
