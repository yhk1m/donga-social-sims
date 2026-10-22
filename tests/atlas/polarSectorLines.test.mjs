// tests/atlas/polarSectorLines.test.mjs — U6-3f 영유권 경계선 레이어(registerLayerType('sectorLines') — 55쪽 남극, 교사 Q8 기본값).
//   따로 된 프로세스: 등록 전(모르는 레이어 종류) → installAmericasExtras → installPolarExtras. SVG 는 가짜 DOM 에 drawSvg 를 직접 불러 본다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { installFakeDom } from './helpers/fakeDom.mjs';

register('./helpers/cssHooks.mjs', import.meta.url);
const dom = installFakeDom();
const { makeProjection } = await import('../../src/atlas/projections.js');
const { layerFromRef } = await import('../../src/atlas/layerRef.js');
const { s } = await import('../../src/shared/dom.js');
const { distToPolyline } = await import('../../src/atlas/layerStyle.js');
const AX = await import('../../src/atlas/americasExtra.js');
const PX = await import('../../src/atlas/polarExtra.js');
test.after(() => dom.restore());

const W = 1000, H = 800;
const meridian = (lon, s0 = -60) => Array.from({ length: 31 }, (_, i) => [lon, s0 - ((90 + s0) * i) / 30]);
const arc = (a, b, lat) => Array.from({ length: Math.abs(b - a) + 1 }, (_, i) => [a + Math.sign(b - a) * i, lat]);
// 교과서 꼴(값은 시험용): 영국 주황 실선 20°W~80°W, 칠레 빨강 점선 53°W~90°W, 아르헨티나 보라 파선 25°W~74°W — 셋이 74°W~53°W 에서 겹침,
// 노르웨이 파랑 실선 바깥 경계만(극까지 가지 않음)
const DATA = {
  type: 'FeatureCollection',
  properties: {
    layerType: 'sectorLines', title: '세계 각국의 남극 연구 기지와 영유권 분쟁',
    legend: [
      { cls: 'uk', label: '영국', color: '#f7941d', kind: 'line', dash: null, width: 1.2 },
      { cls: 'cl', label: '칠레', color: '#ed1c24', kind: 'line', dashed: true, dash: [1, 1.5], width: 1.2 },
      { cls: 'ar', label: '아르헨티나', color: '#92278f', kind: 'line', dashed: true, dash: [4, 2], width: 1.2 },
      { cls: 'no', label: '노르웨이', color: '#0072bc', kind: 'line', dash: null, width: 1.2 },
    ],
  },
  features: [
    { type: 'Feature', properties: { cls: 'uk', offsetPx: 0 }, geometry: { type: 'MultiLineString', coordinates: [meridian(-20), meridian(-80), arc(-20, -80, -60)] } },
    { type: 'Feature', properties: { cls: 'cl', offsetPx: 3 }, geometry: { type: 'MultiLineString', coordinates: [meridian(-53), meridian(-90)] } },
    { type: 'Feature', properties: { cls: 'ar', offsetPx: -3 }, geometry: { type: 'MultiLineString', coordinates: [meridian(-25), meridian(-74), meridian(-53, -60)] } },
    { type: 'Feature', properties: { cls: 'no', name: '노르웨이 영유권 주장 경계(바깥)' }, geometry: { type: 'LineString', coordinates: arc(-20, 44, -60) } },
  ],
};
const ref = { ref: 'layer-p55-claims-s', type: 'sectorLines' };

/** 가짜 SVG g 에 그리고 나라(cls)마다 경로 요소 */
function draw(layer, key, { k = 2, g = s('g', {}) } = {}) {
  const p = makeProjection(key, { width: W, height: H });
  const project = (ll) => { const q = p(ll); return q && Number.isFinite(q[0]) && !p.hidden?.(ll) ? q : null; };
  layer.drawSvg(g, project, { k, projection: p, width: W, height: H, moving: false });
  return { g, p, project };
}
const paths = (g) => { const out = []; const walk = (n) => { for (const c of n.childNodes || []) { if (c.tagName === 'path' && c.getAttribute('class')?.includes('at-sector-line')) out.push(c); walk(c); } }; walk(g); return out; };
/** d 속성("M x,y L x,y …" 꼴 여러 조각) → 조각마다 점 목록 */
const runsOf = (d) => (d || '').split('M').filter(Boolean).map((seg) => seg.split('L').map((t) => t.trim().split(',').map(Number)));

test('등록 전: sectorLines 는 모르는 레이어 종류', () => {
  assert.throws(() => layerFromRef(ref, DATA), /모르는 레이어 종류 sectorLines/);
});

test('등록 뒤: 선 수 = 자료 수, 나라 색·점선 무늬(선 굵기 배수), 범례 = 선 견본(kind line), 남극 중심·밀러 둘 다 그려짐', () => {
  AX.installAmericasExtras();
  PX.installPolarExtras();
  const layer = layerFromRef(ref, DATA);
  assert.deepEqual(layer.legendItems.map((e) => [e.cls, e.kind]), [['uk', 'line'], ['cl', 'line'], ['ar', 'line'], ['no', 'line']]);
  assert.deepEqual(layer.labelObstacles(), []);
  for (const key of ['polarS', 'miller']) {
    const { g } = draw(layer, key);
    const ps = paths(g);
    assert.equal(ps.length, 4, key);
    for (const el of ps) assert.ok(runsOf(el.getAttribute('d')).flat().length > 10, `${key} 빈 선`);
    const by = Object.fromEntries(ps.map((el) => [el.getAttribute('data-cls'), el]));
    assert.equal(by.uk.getAttribute('stroke'), '#f7941d');
    assert.equal(by.uk.getAttribute('stroke-dasharray'), null);
    const w = +by.cl.getAttribute('stroke-width');
    assert.deepEqual(by.cl.getAttribute('stroke-dasharray').split(' ').map(Number), [w * 1, w * 1.5].map((v) => Math.round(v * 10) / 10));
    assert.ok(by.ar.getAttribute('stroke-dasharray'));
  }
});

test('offsetPx: 같은 경선(74°W~53°W 겹침)의 영국·칠레·아르헨티나 선이 화면에서 법선 방향으로 떨어짐(≥ 2px), offsetPx 0 이면 경선 위 그대로', () => {
  const layer = layerFromRef(ref, DATA);
  const { g, project } = draw(layer, 'polarS', { k: 3 });
  const by = Object.fromEntries(paths(g).map((el) => [el.getAttribute('data-cls'), runsOf(el.getAttribute('d'))]));
  // 칠레 53°W 경선(오프셋 +3)과 아르헨티나 53°W 경선(오프셋 −3): 같은 경선이 6px 떨어짐 — 칠레 53°W 조각은 첫 조각
  const truth = meridian(-53).map(project).filter(Boolean);
  const cl53 = by.cl[0], ar53 = by.ar[2];
  const mid = (run) => run[Math.floor(run.length / 2)];
  const dC = distToPolyline(mid(cl53), truth), dA = distToPolyline(mid(ar53), truth);
  assert.ok(Math.abs(dC - 3) < 0.3, `칠레 비킴 ${dC}`);
  assert.ok(Math.abs(dA - 3) < 0.3, `아르헨티나 비킴 ${dA}`);
  assert.ok(distToPolyline(mid(cl53), ar53) >= 2, '서로 2px 이상');
  // 양쪽으로(법선 반대) — 칠레·아르헨티나가 경선 양옆
  const side = (q) => { const a = truth[0], b = truth[truth.length - 1]; return Math.sign((b[0] - a[0]) * (q[1] - a[1]) - (b[1] - a[1]) * (q[0] - a[0])); };
  assert.notEqual(side(mid(cl53)), side(mid(ar53)));
  // 영국(오프셋 0)은 경선 위
  assert.ok(distToPolyline(mid(by.uk[0]), meridian(-20).map(project).filter(Boolean)) < 0.2);
});

test('범례 고름 → 그 나라 선만 굵게(나머지는 굵기 그대로 흐리게), 다시 누르면 처음', () => {
  const layer = layerFromRef(ref, DATA);
  const { g } = draw(layer, 'polarS');
  const width = () => Object.fromEntries(paths(g).map((el) => [el.getAttribute('data-cls'), +el.getAttribute('stroke-width')]));
  const op = () => Object.fromEntries(paths(g).map((el) => [el.getAttribute('data-cls'), el.parentNode.getAttribute('opacity')]));
  const before = width();
  layer.legend.toggle('cl');
  draw(layer, 'polarS', { g }); // 같은 g 에 다시 그림(지도라면 범례 구독이 refreshLayer)
  const after = width();
  assert.ok(after.cl > before.cl * 1.5, `칠레 굵게 ${before.cl} → ${after.cl}`);
  for (const c of ['uk', 'ar', 'no']) assert.equal(after[c], before[c], c);
  assert.equal(op().cl, null); assert.ok(+op().uk < 1);
  layer.legend.toggle('cl');
  draw(layer, 'polarS', { g });
  assert.deepEqual(width(), before);
});

test('맞히기: 선과의 화면 거리 → 「○○ 영유권 주장 경계」(자료 name 이 있으면 그것), 먼 곳 null, 흐린 나라는 맞히지 않음', () => {
  const layer = layerFromRef(ref, DATA);
  const { project } = draw(layer, 'polarS', { k: 3 });
  const onUk = project([-80, -61]); // 둘레(위도 61°S)는 경선 사이가 넓음 — 아르헨티나 74°W 와 10px 넘게 떨어짐
  const f = layer.hit([onUk[0] + 1, onUk[1]]);
  assert.equal(f?.properties.label, '영국 영유권 주장 경계');
  const onNo = project([10, -60]);
  assert.equal(layer.hit(onNo)?.properties.label, '노르웨이 영유권 주장 경계(바깥)');
  assert.equal(layer.hit([5, 5]), null);
  layer.legend.toggle('cl');
  assert.equal(layer.hit([onUk[0] + 1, onUk[1]]), null, '흐린 영국');
  layer.legend.toggle('cl');
  layer.destroy();
});

test('강조(hover): 지도 hover 가 그 선이면 굵기 +1px(공유 CSS 없이 drawSvg 굵기에 더함), 벗어나면 처음 굵기, 다시 그려도 유지', () => {
  AX.installAmericasExtras();
  PX.installPolarExtras();
  const on = {};
  const map = { destroyed: false, on: (t, fn) => { on[t] = fn; return () => { delete on[t]; }; }, refreshLayer() {} };
  const layer = PX.sectorLinesLayer('sl', DATA, { map, layerId: 'sl' });
  const { g } = draw(layer, 'polarS');
  const width = (cls) => +paths(g).find((el) => el.getAttribute('data-cls') === cls).getAttribute('stroke-width');
  const w0 = width('uk');
  const uk = layer.features.find((f) => f.properties.cls === 'uk');
  on.hover({ layerId: 'sl', feature: uk });
  assert.ok(Math.abs(width('uk') - (w0 + 1)) < 0.11, `${width('uk')} vs ${w0 + 1}`);
  assert.equal(width('cl'), w0);
  draw(layer, 'polarS', { g });
  assert.ok(Math.abs(width('uk') - (w0 + 1)) < 0.11, '다시 그려도 강조');
  on.hover({ layerId: 'sl', feature: null });
  assert.equal(width('uk'), w0);
  layer.destroy();
  assert.equal(on.hover, undefined, '구독 풂');
});
