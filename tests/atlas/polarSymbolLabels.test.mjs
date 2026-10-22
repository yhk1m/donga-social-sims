// tests/atlas/polarSymbolLabels.test.mjs — U6-3i 번호 경로 표식·도시 점 재사용 확인(55쪽 아라온호 ①~⑦·북극 항로 붉은 점)에서 찾은 것:
//   아메리카 symbolLabels 의 글자 몫(areaLayer 지명 글자 — 캔버스)은 view.projection 을 그대로 써서 지구본 뒷면·극 중심 반대 반구의 글자도 그린다
//   (기호 몫은 렌더러 project 가 hidden 이면 null 이라 숨음). americasExtra·layers.js 는 고치지 않고 installPolarExtras 가 'symbolLabels' 를
//   다시 등록해 글자 몫에 hidden 을 지키는 투영을 넘긴다(u6 전용). 따로 된 프로세스.
import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { installFakeDom } from './helpers/fakeDom.mjs';

register('./helpers/cssHooks.mjs', import.meta.url);
const dom = installFakeDom();
const { PROJECTIONS, makeProjection } = await import('../../src/atlas/projections.js');
const { layerFromRef } = await import('../../src/atlas/layerRef.js');
const AX = await import('../../src/atlas/americasExtra.js');
const PX = await import('../../src/atlas/polarExtra.js');
test.after(() => dom.restore());

const W = 1000, H = 800;
const DATA = {
  type: 'FeatureCollection',
  properties: { layerType: 'symbol', legend: [{ cls: 'num', label: '번호', color: '#fff200', kind: 'symbol', shape: 'circle', size: 4 }] },
  features: [
    { type: 'Feature', properties: { type: 'symbol', cls: 'num', color: '#fff200', size: 4, label: '① 크라이스트처치' }, geometry: { type: 'Point', coordinates: [172.64, -43.53] } },
    { type: 'Feature', properties: { type: 'label', text: '크라이스트처치(뉴질랜드)', size: 2.6, color: '#231f20' }, geometry: { type: 'Point', coordinates: [176, -41] } },
    { type: 'Feature', properties: { type: 'label', text: '로테르담(네덜란드)', size: 2.6, color: '#231f20' }, geometry: { type: 'Point', coordinates: [4.48, 51.92] } },
  ],
};
/** 캔버스 2D 흉내: fillText 글자만 모음 */
function recCtx() {
  const texts = [];
  const ctx = new Proxy({}, {
    get(t, k) {
      if (k === 'texts') return texts;
      if (k === 'fillText') return (s) => texts.push(s);
      if (k === 'measureText') return (s) => ({ width: String(s).length * 8 });
      if (k in t) return t[k];
      return () => {};
    },
    set(t, k, v) { t[k] = v; return true; },
  });
  return ctx;
}
const drawn = (layer, key, setup) => {
  setup?.();
  const p = makeProjection(key, { width: W, height: H });
  const ctx = recCtx();
  layer.draw(ctx, () => {}, { k: 1, projection: p, width: W, height: H, geoRect: null, moving: false });
  return ctx.texts;
};

test('아메리카 등록만: 지구본 뒷면 글자도 그림(찾은 문제 — 기록)', () => {
  AX.installAmericasExtras();
  const layer = layerFromRef({ ref: 'm', type: 'symbolLabels' }, DATA);
  PROJECTIONS.globe.rot = AX.rotateFor([0, 45]); // 유럽 가운데 — 뉴질랜드는 뒷면
  assert.deepEqual(drawn(layer, 'globe'), ['크라이스트처치(뉴질랜드)', '로테르담(네덜란드)']);
});

test('installPolarExtras 뒤: 지구본 뒷면·극 중심 반대 반구 글자는 그리지 않음, 앞면·평면 도법은 그대로', () => {
  PX.installPolarExtras();
  const layer = layerFromRef({ ref: 'm', type: 'symbolLabels' }, DATA);
  PROJECTIONS.globe.rot = AX.rotateFor([0, 45]);
  assert.deepEqual(drawn(layer, 'globe'), ['로테르담(네덜란드)']);
  PROJECTIONS.globe.rot = AX.rotateFor([170, -45]);
  assert.deepEqual(drawn(layer, 'globe'), ['크라이스트처치(뉴질랜드)']);
  assert.deepEqual(drawn(layer, 'polarN'), ['로테르담(네덜란드)']);
  assert.deepEqual(drawn(layer, 'polarS'), ['크라이스트처치(뉴질랜드)']);
  assert.deepEqual(drawn(layer, 'miller'), ['크라이스트처치(뉴질랜드)', '로테르담(네덜란드)']);
  // 기호 몫·범례·맞히기는 아메리카 것 그대로(같은 combineLayers)
  assert.deepEqual(layer.legendItems.map((e) => e.cls), ['num']);
  assert.equal(typeof layer.drawSvg, 'function');
  assert.equal(typeof layer.hit, 'function');
});

test('등록 차례: installPolarExtras 뒤 symbolLabels 는 감싼 것(hiddenAware) — installAmericasExtras 를 뒤에 다시 부르면 아메리카 것으로 덮임(그래서 main 은 아메리카 → 극 한 번씩)', () => {
  PX.installPolarExtras();
  assert.equal(layerFromRef({ ref: 'm', type: 'symbolLabels' }, DATA).hiddenAware, true);
  AX.installAmericasExtras();
  assert.equal(layerFromRef({ ref: 'm', type: 'symbolLabels' }, DATA).hiddenAware, undefined, '덮임(기록)');
  PX.installPolarExtras();
  assert.equal(layerFromRef({ ref: 'm', type: 'symbolLabels' }, DATA).hiddenAware, true);
});
