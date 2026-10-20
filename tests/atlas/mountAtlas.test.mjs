// tests/atlas/mountAtlas.test.mjs — 단원 조각 조립(src/atlas/mountAtlas.js, 2단계 G4)을 가짜 DOM 으로: 아시아 자료로 조립해
// 8개 주제를 모두 펼치고, destroy 뒤 무대·사이드바가 비고 예약 rAF 가 남지 않는지, 단원 선택값(insets·boundsOf·locators …) 없이도 도는지 본다.
// 픽셀은 헤드리스 Chrome 대조표 캡처(compare_shots.mjs → regress_u2.mjs)로 본다.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { register } from 'node:module';
import { REPO, readJson } from '../../scripts/atlas/geo_util.mjs';
import { installFakeDom } from './helpers/fakeDom.mjs';

register('./helpers/cssHooks.mjs', import.meta.url);
const dom = installFakeDom();
class FakeImage { addEventListener() {} set src(v) { this._src = v; } } // 음영·고도 색·밀도 이미지: 불러오지도 실패하지도 않음
globalThis.Image = FakeImage;
const { mountAtlas } = await import('../../src/atlas/mountAtlas.js');
test.after(() => { delete globalThis.Image; dom.restore(); });

const DATA = path.join(REPO, 'sims/atlas-u2-asia/data');
const basemap = readJson(path.join(DATA, 'basemap.json'));
const places = readJson(path.join(DATA, 'places.json'));
const topics = readJson(path.join(DATA, 'topics.json'));
const charts = readJson(path.join(DATA, 'charts.json'));
const singapore = readJson(path.join(DATA, 'inset-p22-singapore.json'));
const layers = {};
for (const t of topics) for (const r of t.layers || []) layers[r.ref] = readJson(path.join(DATA, `${r.ref}.json`));
const ASIA = {
  insets: { 'layer-p22-singapore': singapore }, boundsOf: { 'layer-p24-trade': [55, -45, -60, 72] }, centerLonOf: { 'layer-p24-trade': 150 },
  baseColor: { general: 'tint', relief: 'natural' },
  locators: { 'layer-p22-kashmir': { bounds: [60, 5, 99, 38], names: { PAK: '파키스탄', IND: '인도' }, title: '인도 위치 — 분홍이 카슈미르' } },
};
const root = () => { const r = document.createElement('div'); r.ownerDocument = { defaultView: { location: { search: '' } } }; return r; };

function mountAndWalk(opts) {
  const r = root();
  const handle = mountAtlas(r, { simId: 'atlas-u2-asia', basemap, places, topics, charts, layers, ...opts });
  assert.equal(typeof handle.destroy, 'function');
  assert.equal(r.atlasTopic.topic.id, topics[0].id, '처음 주제');
  for (const t of topics) {
    const cur = r.atlasShowTopic(t.id);
    assert.equal(cur.topic.id, t.id);
    for (let i = 0; i < cur.groups.length; i++) cur.showGroup(i);   // 지도 고르기마다(확대 창·위치도·태평양 중심 묶음 포함)
    dom.flushRaf();
  }
  return { r, handle };
}

test('아시아 자료로 조립: 8개 주제를 모두 펼치고 묶음마다 고를 수 있다, 확인용 root.atlas* 노출', () => {
  const { r, handle } = mountAndWalk(ASIA);
  assert.equal(topics.length, 8);
  for (const k of ['atlasMap', 'atlasUi', 'atlasShowTopic', 'atlasCharts', 'atlasDestroy']) assert.ok(r[k], k);
  assert.equal(r.childNodes.length, 2, '무대 + 사이드바');
  handle.destroy();
});

test('주제별 바탕 색 기본값(baseColor): 일반도 = 고도 색, 지형 = 자연색, 나머지 = 없음', () => {
  const { r, handle } = mountAndWalk(ASIA);
  r.atlasShowTopic('general'); assert.equal(r.atlasMap.options.tint, true);
  r.atlasShowTopic('climate'); assert.equal(r.atlasMap.options.tint, false); assert.equal(!!r.atlasMap.options.natural, false);
  handle.destroy();
});

test('destroy: 지도가 부서지고 무대·사이드바 부품이 떨어지며 예약 rAF 가 남지 않는다', () => {
  const { r, handle } = mountAndWalk(ASIA);
  const map = r.atlasMap;
  const stage = r.childNodes[0];
  handle.destroy();
  assert.equal(map.destroyed, true);
  dom.flushRaf();
  assert.equal(dom.rafPending, 0);
  assert.equal(stage.childNodes.length, 0, '무대 부품(캔버스·SVG·도구·범례 칸·말풍선·원본 쪽 보기)이 모두 떨어짐');
  const body = r.childNodes[1].childNodes.find((c) => c.getAttribute?.('class')?.includes('at-topic'));
  assert.equal(body.childNodes.length, 0, '주제 칸이 빔');
});

test('단원 선택값 없이도(insets·boundsOf·centerLonOf·baseColor·locators 빠짐) 모든 주제가 펼쳐진다', () => {
  const { r, handle } = mountAndWalk({});
  r.atlasShowTopic('general'); assert.equal(r.atlasMap.options.tint, false, 'baseColor 없으면 바탕 없음');
  handle.destroy();
});
