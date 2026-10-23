// tests/atlas/worldExtra.test.mjs — U1-3c·3d 대륙·대양 면 레이어(worldExtra.continentsLayer · registerLayerType('continents')).
// 따로 된 프로세스(node --test)라 등록 전(모르는 레이어 종류)을 본 뒤 installAmericasExtras() → installPolarExtras() → installWorldExtras() 로 등록한다.
// 그리기는 기록 캔버스(fill 때 색·투명도), 실제 자료(작업 폴더 continents.json + u6 바탕 지도 나라)는 있으면 본다.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import { geoEquirectangular, geoPath, geoContains } from 'd3-geo';
import { geoRobinson } from 'd3-geo-projection';
import { feature } from 'topojson-client';
import { REPO, readJson, WORK } from '../../scripts/atlas/geo_util.mjs';
import { installFakeDom } from './helpers/fakeDom.mjs';
import { createLegendState } from '../../src/atlas/legendState.js';
import { register } from 'node:module';

register('./helpers/cssHooks.mjs', import.meta.url);

const dom = installFakeDom();
const { layerFromRef } = await import('../../src/atlas/layerRef.js');
const AX = await import('../../src/atlas/americasExtra.js');
const PX = await import('../../src/atlas/polarExtra.js');
const WX = await import('../../src/atlas/worldExtra.js');
test.after(() => dom.restore());

function viewOf({ lon0 = 0, W = 800, H = 600 } = {}) {
  const projection = geoEquirectangular().rotate([-lon0, 0]).scale(2 * 180 / Math.PI).translate([W / 2, H / 2]);
  return { k: 1, width: W, height: H, projection, geoRect: null, moving: false };
}
function recCtx() {
  const ops = []; const stack = [];
  const ctx = {
    fillStyle: null, strokeStyle: null, globalAlpha: 1, lineWidth: 1, ops,
    save() { stack.push({ a: this.globalAlpha, f: this.fillStyle }); }, restore() { const p = stack.pop(); if (p) { this.globalAlpha = p.a; this.fillStyle = p.f; } },
    beginPath() {}, moveTo() {}, lineTo() {}, closePath() {}, arc() {}, rect() {}, clip() {},
    fill() { ops.push({ op: 'fill', fillStyle: this.fillStyle, alpha: +this.globalAlpha.toFixed(4), g: this._g }); },
    stroke() { ops.push({ op: 'stroke' }); }, setLineDash() {}, translate() {}, rotate() {}, strokeText() {}, fillText() {}, measureText: () => ({ width: 10 }),
    createPattern() { return { pattern: true }; },
  };
  return ctx;
}
/** 그린 채움 [{cls, iso, alpha}] (경로마다 그 Feature 를 기억) */
function fills(layer, view = viewOf()) {
  const ctx = recCtx();
  layer.draw(ctx, (g) => { ctx._g = g; }, view);
  return ctx.ops.filter((o) => o.op === 'fill');
}
function fakeMap() {
  const handlers = {}; const refreshed = [];
  return { refreshed, destroyed: false, view: null, refreshLayer(id) { refreshed.push(id); return true; },
    on(t, fn) { (handlers[t] ??= new Set()).add(fn); return () => handlers[t].delete(fn); } };
}
function fakeLegend(classes) {
  const real = createLegendState(classes); let subs = 0;
  return { ...real, onChange(fn) { subs++; const off = real.onChange(fn); return () => { subs--; off(); }; }, get subs() { return subs; } };
}
const sq = (lon, lat, d = 2) => [[[lon, lat], [lon, lat + d], [lon + d, lat + d], [lon + d, lat], [lon, lat]]]; // 시계 방향(d3)
const country = (iso, ko, ...polys) => ({ type: 'Feature', properties: { iso, ko }, geometry: { type: 'MultiPolygon', coordinates: polys } });
const LEGEND = [{ cls: 'asia', label: '아시아', color: '#f0a580' }, { cls: 'europe', label: '유럽', color: '#b6cedd' },
  { cls: 'northAmerica', label: '북아메리카', color: '#ecadc9' }, { cls: 'oceania', label: '오세아니아', color: '#cbdb90' }];
const COUNTRIES = () => ({ 50: [
  country('AAA', '가나라', sq(100, 30)), country('BBB', '나나라', sq(10, 50)),
  country('USA', '미국', sq(-100, 40, 10), sq(-156, 19, 1)),                 // 본토 + 하와이(섬 단위로 갈린 나라)
  country('RUS', '러시아', sq(40, 55, 10)),                                 // 바탕 지도 러시아는 그리지 않음(classes 에 없음 — 조각 면)
  country('GRL', '그린란드', sq(-50, 65, 10)),                              // 분류 없음
] });
const DATA = () => ({ type: 'FeatureCollection', properties: {
  layerType: 'continents', legend: LEGEND, classes: { AAA: 'asia', BBB: 'europe', USA: 'northAmerica' },
  centers: { asia: [91, 43], europe: [25, 55] }, names: { asia: ['가나라', '러시아'], europe: ['나나라', '러시아'] },
  oceans: [{ cls: 'pacific', label: '태평양' }] }, features: [
  { type: 'Feature', properties: { cls: 'oceania', iso: 'USA', mode: 'parts' }, geometry: { type: 'MultiPolygon', coordinates: [sq(-156.5, 18.5, 2)] } },
  { type: 'Feature', properties: { cls: 'asia', iso: 'RUS', mode: 'geom' }, geometry: { type: 'MultiPolygon', coordinates: [[[[60, 60], [60, 70], [190, 70], [190, 60], [60, 60]]]] } },
  { type: 'Feature', properties: { cls: 'europe', iso: 'RUS', mode: 'geom' }, geometry: { type: 'MultiPolygon', coordinates: [sq(40, 55, 10)] } },
  { type: 'Feature', properties: { cls: 'pacific', ocean: true }, geometry: { type: 'MultiPolygon', coordinates: [sq(-170, -10, 20)] } },
] });

test('등록 전: continents 는 모르는 레이어 종류, 극 중심 등록 전에는 installWorldExtras 가 멈춤', () => {
  assert.throws(() => layerFromRef({ ref: 'c', type: 'continents' }, DATA(), { countryFeatures: COUNTRIES() }), /모르는 레이어 종류/);
  assert.throws(() => WX.installWorldExtras(), /installPolarExtras\(\) 를 먼저/);
  AX.installAmericasExtras(); PX.installPolarExtras(); WX.installWorldExtras(); WX.installWorldExtras();
});

test('나라 Feature: classes 나라는 대륙색, 섬 단위 조각(하와이)은 그 섬만 오세아니아, 쪼갠 나라(러시아)는 조각 면, 분류 없는 그린란드는 없음', () => {
  const fs_ = WX.continentFeatures(DATA(), COUNTRIES()[50]);
  const rows = fs_.map((f) => `${f.properties.iso}:${f.properties.cls}:${f.geometry.coordinates.length}`).sort();
  assert.deepEqual(rows, ['AAA:asia:1', 'BBB:europe:1', 'RUS:asia:1', 'RUS:europe:1', 'USA:northAmerica:1', 'USA:oceania:1']);
  const haw = fs_.find((f) => f.properties.iso === 'USA' && f.properties.cls === 'oceania');
  assert.deepEqual(haw.geometry.coordinates, [sq(-156, 19, 1)], '바탕 지도의 하와이 섬 면을 씀(조각 면이 아님)');
  assert.equal(fs_.find((f) => f.properties.iso === 'AAA').properties.label, '가나라(아시아)');
  assert.equal(fs_.find((f) => f.properties.iso === 'RUS' && f.properties.cls === 'europe').properties.label, '러시아(유럽)');
  assert.equal(WX.oceanFeatures(DATA())[0].properties.label, '태평양');
});

test('layerFromRef: countryFeatures 없으면 멈춤, 범례 대륙 4(자료 범례), 처음 그림 = 대륙 모두 0.85 · 대양 0(안 보임)', () => {
  assert.throws(() => layerFromRef({ ref: 'c', type: 'continents' }, DATA()), /countryFeatures/);
  const L = layerFromRef({ ref: 'c', type: 'continents', label: '대륙과 대양' }, DATA(), { countryFeatures: COUNTRIES() });
  assert.deepEqual(L.legendItems.map((e) => e.cls), ['asia', 'europe', 'northAmerica', 'oceania']);
  assert.equal(L.meta.title, '대륙과 대양');
  const f = fills(L);
  const land = f.filter((o) => o.fillStyle !== WX.CONTINENTS.oceanColor);
  assert.equal(land.length, 6);
  assert.ok(land.every((o) => o.alpha === 0.85));
  assert.deepEqual(f.filter((o) => o.fillStyle === WX.CONTINENTS.oceanColor).map((o) => o.alpha), [0]);
});

test('select: 대륙 = 그 대륙만 진하게(나머지 0.25), 대양 = 대양 면 0.45 + 대륙 모두 흐림, 범례 고름이 대양을 풂, null = 전체', () => {
  const legend = fakeLegend(LEGEND.map((e) => e.cls)); const map = fakeMap();
  const L = WX.continentsLayer('c', DATA(), { countryFeatures: COUNTRIES(), legend, map });
  const alphaBy = () => Object.fromEntries(fills(L).map((o) => [`${o.fillStyle}`, o.alpha]));
  L.select('asia');
  assert.equal(L.selected, 'asia'); assert.equal(legend.selected(), 'asia');
  let a = alphaBy();
  assert.equal(a['#f0a580'], 0.85); assert.equal(a['#b6cedd'], +(0.85 * 0.25).toFixed(4)); assert.equal(a[WX.CONTINENTS.oceanColor], 0);
  assert.ok(map.refreshed.includes('c'));
  L.select('pacific');
  assert.equal(L.selected, 'pacific'); assert.equal(legend.selected(), null);
  a = alphaBy();
  assert.equal(a['#f0a580'], +(0.85 * 0.25).toFixed(4)); assert.equal(a[WX.CONTINENTS.oceanColor], 0.45);
  assert.ok(L.hit([0, 0], [-160, 0]), '고른 대양은 맞힘');
  legend.toggle('europe');
  assert.equal(L.selected, 'europe', '사용자가 범례를 고르면 대양 고름이 풀림');
  L.select(null);
  assert.equal(L.selected, null);
  assert.ok(fills(L).filter((o) => o.fillStyle !== WX.CONTINENTS.oceanColor).every((o) => o.alpha === 0.85));
  assert.throws(() => L.select('mars'), /모르는 대륙·대양/);
});

test('맞히기·질의: 나라 → 「이름(대륙)」, 안 고른 대양은 맞히지 않음, classOf·centers·names, destroy 는 구독을 모두 풂', () => {
  const legend = fakeLegend(LEGEND.map((e) => e.cls)); const map = fakeMap();
  const L = WX.continentsLayer('c', DATA(), { countryFeatures: COUNTRIES(), legend, map });
  fills(L);
  assert.equal(L.hit([0, 0], [101, 31]).properties.label, '가나라(아시아)');
  assert.equal(L.hit([0, 0], [-155.5, 19.5]).properties.label, '미국(오세아니아)');
  assert.equal(L.hit([0, 0], [-160, 0]), null);
  assert.equal(L.hit([0, 0], [-45, 70]), null, '그린란드는 칠하지 않음');
  assert.equal(L.classOf('AAA'), 'asia'); assert.deepEqual(L.classOf('RUS'), ['asia', 'europe']); assert.equal(L.classOf('GRL'), null);
  assert.deepEqual(L.centers.asia, [91, 43]); assert.deepEqual(L.names.europe, ['나나라', '러시아']); assert.deepEqual(L.oceans, ['pacific']);
  assert.ok(legend.subs > 0);
  L.destroy();
  assert.equal(legend.subs, 0);
});

test('날짜변경선: 경도 190 까지 이은 러시아 아시아 조각은 태평양 중심(150)에서 한 덩어리, 대서양 중심(0)에서는 가장자리에서 둘로', () => {
  const piece = DATA().features[1];
  const subpaths = (lon0) => (geoPath(geoRobinson().rotate([-lon0, 0]))(piece).match(/M/g) || []).length;
  assert.equal(subpaths(150), 1);
  assert.equal(subpaths(0), 2);
});

// ── 실제 자료(작업 폴더 — 있을 때만) ─────────────────────────────────────
const REAL = `${WORK}/geo/p10-continents.continents.json`;
const BASE = path.join(REPO, 'sims/atlas-u6-oceania-polar/data/basemap.json');
test('실제 10·11쪽 대륙 자료: 대륙 7 모두 나라가 있음, 러시아 = 조각 면 둘, 하와이 = 오세아니아, 그린란드 없음, 자료 ≤ 100KB', { skip: fs.existsSync(REAL) && fs.existsSync(BASE) ? false : '작업 폴더 자료 없음' }, () => {
  const data = readJson(REAL);
  assert.ok(fs.statSync(REAL).size <= 100 * 1024, `${fs.statSync(REAL).size} B`);
  const bm = readJson(BASE);
  const cs = feature(bm, bm.objects.countries50).features;
  const fs_ = WX.continentFeatures(data, cs);
  const by = {}; for (const f of fs_) by[f.properties.cls] = (by[f.properties.cls] || 0) + 1;
  assert.deepEqual(Object.keys(by).sort(), ['africa', 'antarctica', 'asia', 'europe', 'northAmerica', 'oceania', 'southAmerica']);
  assert.deepEqual(fs_.filter((f) => f.properties.iso === 'RUS').map((f) => f.properties.cls).sort(), ['asia', 'europe']);
  const rus = (c) => fs_.find((f) => f.properties.iso === 'RUS' && f.properties.cls === c);
  for (const [c, ll, name] of [['europe', [37.6, 55.75], '모스크바'], ['europe', [44.5, 46.3], '칼미크(카스피해 북서 — 우랄 선 서쪽)'], ['asia', [82.9, 55.0], '노보시비르스크'],
    ['asia', [-175, 66], '축치(날짜변경선 동쪽)']]) assert.ok(geoContains(rus(c), ll), `${name} → ${c}`);
  assert.ok(!geoContains(rus('asia'), [50.0, 51.0]), '러시아–카자흐스탄 국경 곁(오렌부르크 서쪽)은 아시아 조각이 아님 — 국경 띠 없음');
  assert.ok(fs_.some((f) => f.properties.iso === 'USA' && f.properties.cls === 'oceania'));
  assert.ok(!fs_.some((f) => f.properties.iso === 'GRL'));
  for (const k of Object.keys(by)) assert.ok(data.properties.centers[k], k);
});
