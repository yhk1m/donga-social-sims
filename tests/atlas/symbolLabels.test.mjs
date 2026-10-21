// © 2026 김용현
// tests/atlas/symbolLabels.test.mjs — U5-4 기호 + 지면 글자(registerLayerType 'symbolLabels', 47쪽 세계 지도 동해·독도·이어도):
// 따로 된 프로세스라 등록 전(모르는 레이어 종류)을 본 뒤 installAmericasExtras() 로 등록한다. 가짜 DOM 으로 기호 수·글자를 본다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { geoEquirectangular, geoPath } from 'd3-geo';
import { installFakeDom } from './helpers/fakeDom.mjs';

const dom = installFakeDom();
const { layerFromRef } = await import('../../src/atlas/layerRef.js');
const AX = await import('../../src/atlas/americasExtra.js');
test.after(() => dom.restore());

const findAll = (el, pred, out = []) => { if (pred(el)) out.push(el); for (const c of el.childNodes || []) findAll(c, pred, out); return out; };
const LEGEND = [
  { cls: 'c1', label: '200', color: '#f27292d9', kind: 'symbol', shape: 'circle', size: 8.55 },
  { cls: 'c2', label: '100', color: '#f27292d9', kind: 'symbol', shape: 'circle', size: 6.1 },
];
const data = () => ({
  type: 'FeatureCollection',
  properties: { id: 'p47-hq', title: '본사', layerType: 'symbol', sizeBy: 'class', legend: LEGEND },
  features: [
    { type: 'Feature', properties: { type: 'symbol', cls: 'c1', size: 8.7, label: '애플' }, geometry: { type: 'Point', coordinates: [-122, 37.3] } },
    { type: 'Feature', properties: { type: 'symbol', cls: 'c2', size: 5, label: '도쿄' }, geometry: { type: 'Point', coordinates: [139.7, 35.7] } },
    { type: 'Feature', properties: { type: 'label', text: '동해', size: 3.5, color: '#0072bc', role: 'region' }, geometry: { type: 'Point', coordinates: [134, 39] } },
    { type: 'Feature', properties: { type: 'label', text: '독도', size: 2, color: '#231f20', role: 'region' }, geometry: { type: 'Point', coordinates: [131.9, 37.2] } },
  ],
});

test('등록 전: symbolLabels 는 모르는 레이어 종류', () => {
  assert.throws(() => layerFromRef({ ref: 'layer-p47-hq', type: 'symbolLabels' }, data()), /모르는 레이어 종류/);
});

test('등록 뒤: 기호는 글자 Feature 를 빼고 그림, 글자는 지명 글자 길(캔버스), 범례 = 기호 범례', () => {
  AX.installAmericasExtras();
  const L = layerFromRef({ ref: 'layer-p47-hq', type: 'symbolLabels', label: '본사' }, data());
  assert.deepEqual(L.legendItems.map((e) => e.cls), ['c1', 'c2']);
  assert.ok(L.legend, '범례 상태');
  assert.equal(L.parts.length, 2);
  const projection = geoEquirectangular().rotate([-150, 0]).scale(160).translate([400, 300]);
  const view = { k: 1, width: 800, height: 600, projection };
  const g = document.createElementNS('svg', 'g');
  L.drawSvg(g, (ll) => projection(ll), view);
  const syms = findAll(g, (n) => n.classList?.contains('at-sym-item'));
  assert.equal(syms.length, 2, '기호 2(글자 Feature 는 기호가 아님)');
  // 글자: 캔버스 fillText 를 받아 적음
  const texts = [];
  const ctx = new Proxy({}, { get: (t, k) => (k === 'fillText' ? (s) => texts.push(s) : k === 'measureText' ? (s) => ({ width: s.length * 5 }) : t[k] ?? (() => {})), set: (t, k, v) => { t[k] = v; return true; } });
  L.draw(ctx, geoPath(projection, ctx), view);
  assert.ok(texts.includes('동해') && texts.includes('독도'), texts.join(','));
  // 기호 범례 고름이 묶음 하나를 다시 그림(구독은 묶음이 한 번) · destroy
  L.destroy();
});
