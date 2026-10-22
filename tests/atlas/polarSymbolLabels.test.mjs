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

// ---------- U6-9: 겹치는 지면 글자 무리 숨김 · 「(…)」 글자 붙임 ----------
const lab = (text, lon, lat, color = '#231f20') => ({ type: 'Feature', properties: { type: 'label', text, size: 5.5, color, role: 'region' }, geometry: { type: 'Point', coordinates: [lon, lat] } });
test('labelGroups: 「(대한민국)」은 가장 가까운 이름 글자(5° 안)와 한 무리, 붉은 글자 무리가 먼저, 나머지는 자료 차례', () => {
  const a = lab('파머(미)', -64, -64.8), b = lab('세종 과학 기지', -58.8, -62.2), c = lab('(대한민국)', -58.8, -62.8, '#d71920'), d = lab('(영)', 0, -70);
  const g = PX.labelGroups([a, b, c, d]);
  assert.deepEqual(g.map((x) => x.map((f) => f.properties.text)), [['세종 과학 기지', '(대한민국)'], ['파머(미)'], ['(영)']]);
});
test('culledLabels: 앞 무리 상자와 겹치는 무리는 숨김(같은 자리 사본도), 「(…)」는 이름 글자 아래(또는 옆)에 붙임, 겹치지 않으면 그대로', () => {
  const measure = (t) => t.length * 10;
  const proj = ([x, y]) => [x * 10, y * 10];   // 화면 = 좌표 × 10
  const n1 = lab('세종 과학 기지', 10, 10), n2 = lab('(대한민국)', 10.2, 10.4, '#d71920'), o = lab('파머(미)', 11, 10.2), far = lab('로데라(영)', 40, 40), dup = lab('로데라(영)', 40.1, 40);
  const { drop, moved } = PX.culledLabels(PX.labelGroups([n1, n2, o, far, dup]), proj, measure);
  assert.ok(drop.has(o.geometry.coordinates) && drop.has(dup.geometry.coordinates));
  assert.ok(!drop.has(n1.geometry.coordinates) && !drop.has(far.geometry.coordinates));
  const px = Math.round(5.5 * 2.4), lh = px * 1.15;   // labelPx(region 5.5pt) = 13px
  assert.deepEqual(moved.get(n2.geometry.coordinates), [102, 100 + lh / 2 + 3 + lh / 2], '아래로 붙임(이름 상자 밑 + 흰 테두리 몫 3px + 반 줄)');
  const side = PX.culledLabels(PX.labelGroups([lab('다산 과학 기지', 0, 0), lab('(대한민국)', 3, 0.1, '#d71920')]), proj, measure);
  assert.deepEqual([...side.moved.values()][0], [40 + 3 + 3 + 30, 1], '옆이면 오른쪽에 붙임(이름 상자 오른쪽 + 테두리 몫 + 3px)');
  // 기호 점(자기 기지 점 포함)에 닿으면 무리째 가장 짧게 비킴(최대 24px), 못 비키면 숨김
  const nm = lab('장보고 과학 기지', 10, 10);   // 화면 (100, 100), 상자 [60, 92.5, 140, 107.5]
  const r1 = PX.culledLabels(PX.labelGroups([nm]), proj, measure, [{ ll: [10.5, 10.9], r: 5 }]);   // 점 (105, 109) — 상자 아래쪽에 닿음
  const got = r1.moved.get(nm.geometry.coordinates);
  assert.ok(got && got[0] === 100 && got[1] < 100, `위로 비킴 ${got}`);
  assert.ok(100 - got[1] <= 24);
  const r2 = PX.culledLabels(PX.labelGroups([nm]), proj, measure, [{ ll: [10, 10], r: 40 }]);   // 큰 점이 글자를 다 덮음 → 못 비킴
  assert.ok(r2.drop.has(nm.geometry.coordinates));
});
test('installPolarExtras 뒤 symbolLabels: 겹치는 글자는 그리지 않음 — 확대하면 다시', () => {
  PX.installPolarExtras();
  const D2 = { type: 'FeatureCollection', properties: { layerType: 'symbol', legend: [] }, features: [lab('가나다라(영)', 0, -70), lab('마바사아(미)', 0.5, -70.2), lab('자차카(러)', 90, -70)] };
  const layer = layerFromRef({ ref: 'm', type: 'symbolLabels' }, D2);
  const draw = (k) => { const p = makeProjection('polarS', { width: W, height: H }); const q = (ll) => { const r = p(ll); return r && [W / 2 + (r[0] - W / 2) * k, H / 2 + (r[1] - H / 2) * k]; }; q.hidden = p.hidden; const ctx = recCtx(); layer.draw(ctx, () => {}, { k, projection: q, width: W, height: H, geoRect: null, moving: false }); return ctx.texts; };
  assert.deepEqual(draw(1), ['가나다라(영)', '자차카(러)']);
  assert.deepEqual(draw(60), ['가나다라(영)', '마바사아(미)', '자차카(러)'], '확대하면 떨어져 다시 보임');
});
