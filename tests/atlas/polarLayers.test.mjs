// © 2026 김용현
// scripts/atlas/polar_layers.mjs(U6-4 — 주제 보기·남극 영유권 경계선·위선·빙붕 자료) 순수 함수 시험
import test from 'node:test';
import assert from 'node:assert/strict';
import { topicViewLayerJson, latLine, latLineFeatures, eastArc, sectorLinesLayerJson, shelvesRaw, shelfOutlineFeature } from '../../scripts/atlas/polar_layers.mjs';

const m = { page: 55, title: '지도', kind: 'thematic' };
test('topicView: view 그대로·그리지 않음, 모르는 키·도법은 멈춤', () => {
  const L = topicViewLayerJson({ id: 'v', map: 'x', view: { projection: 'polarN', up: 180 } }, m);
  assert.equal(L.properties.layerType, 'topicView'); assert.deepEqual(L.properties.view, { projection: 'polarN', up: 180 }); assert.equal(L.features.length, 0);
  assert.throws(() => topicViewLayerJson({ id: 'v', view: { zoom: 3 } }, m), /모르는 키/);
  assert.throws(() => topicViewLayerJson({ id: 'v', view: { projection: 'miller' } }, m), /projection/);
});
test('latLine: −180 → 180 한 줄(날짜변경선에서 끊기지 않음), 위도 그대로 · latLineFeatures 범례 g1', () => {
  const L = latLine(-66.5626, 2);
  assert.deepEqual(L[0], [-180, -66.5626]); assert.deepEqual(L[L.length - 1], [180, -66.5626]); assert.equal(L.length, 181);
  const { legend, features } = latLineFeatures({ id: 'x', latLines: [{ lat: 66.5, label: '북극권', color: '#000000', dashed: true }] });
  assert.equal(legend[0].cls, 'g1'); assert.equal(features[0].properties.type, 'line'); assert.equal(features[0].properties.dashed, true);
});
test('eastArc: 동쪽으로 — 160 → −150 은 이어 붙인 경도 160 … 210', () => {
  const a = eastArc(160, -150, -60);
  assert.equal(a[0][0], 160); assert.equal(a[a.length - 1][0], 210); assert.ok(a.every((q, i) => !i || q[0] > a[i - 1][0]));
});
test('sectorLines: 나라마다 경선 둘(바깥 → 극) + 호, offsetPx, pathPt 는 서 → 동', () => {
  const cv = { invert: ([x, y]) => [x, y] };   // 시험: 지면 = 경위도
  const out = sectorLinesLayerJson({ id: 's', map: 'p', view: { projection: 'polarS', up: -90 }, sectors: [
    { cls: 'a', label: '가', color: '#ff0000', meridians: [-80, -20], offsets: { arc: 2.5 } },
    { cls: 'n', label: '나', color: '#0000ff', pathPt: [[40, -66], [10, -66], [-20, -66]] }] }, cv, m, { family: 'azimuthalEquidistant' });
  assert.equal(out.properties.layerType, 'sectorLines'); assert.equal(out.properties.legend.length, 2); assert.equal(out.properties.view.projection, 'polarS');
  const w = out.features.find((f) => f.properties.part === 'w').geometry.coordinates;
  assert.deepEqual(w[0], [-80, -60]); assert.deepEqual(w[w.length - 1], [-80, -90]);
  assert.equal(out.features.find((f) => f.properties.part === 'arc').properties.offsetPx, 2.5);
  const p = out.features.find((f) => f.properties.part === 'path').geometry.coordinates;
  assert.equal(p[0][0], -20); assert.equal(p[p.length - 1][0], 40);
  assert.throws(() => sectorLinesLayerJson({ id: 's', sectors: [{ cls: 'x', label: 'x', color: '#000000' }] }, cv, m), /meridians 또는 pathPt/);
});
test('빙붕: raw 는 분류 하나, 테두리는 ±180 변을 뺀 선', () => {
  const gj = { features: [{ geometry: { type: 'Polygon', coordinates: [[[170, -80], [170, -78], [180, -78], [180, -80], [170, -80]]] } }] };   // 시계 방향(d3 안쪽)
  const ccw = { features: [{ geometry: { type: 'Polygon', coordinates: [[[170, -80], [180, -80], [180, -78], [170, -78], [170, -80]]] } }] };
  assert.throws(() => shelvesRaw({ id: 'x', legendItems: [{ color: '#eeeeee', label: '빙붕' }] }, ccw), /감김/);
  assert.throws(() => shelvesRaw({ id: 'x' }, gj), /legendItems/);
  const raw = shelvesRaw({ id: 'x', legendItems: [{ color: '#eeeeee', label: '빙붕' }] }, gj);
  assert.equal(raw.legend[0].label, '빙붕');
  const f = shelfOutlineFeature({ properties: { cls: 'c1', label: '빙붕' }, geometry: { type: 'MultiPolygon', coordinates: [gj.features[0].geometry.coordinates] } }, '#9cc3dd');
  for (const L of f.geometry.coordinates) for (let i = 1; i < L.length; i++) assert.ok(!(Math.abs(L[i][0]) === 180 && Math.abs(L[i - 1][0]) === 180));
  assert.equal(f.properties.type, 'line'); assert.equal(f.properties.cls, 'c1');
});
