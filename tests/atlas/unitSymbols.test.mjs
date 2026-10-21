// © 2026 김용현
// tests/atlas/unitSymbols.test.mjs — U5-3f 네모 단위 기호(registerLayerType 'unitSymbols', 47쪽 마킬라도라: 1칸 = 50개 공장 · 2만 명 근로자).
// 따로 된 프로세스라 등록 전(모르는 레이어 종류)을 본 뒤 installAmericasExtras() 로 등록한다. 가짜 DOM 으로 SVG 요소·상자만 본다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { geoEquirectangular } from 'd3-geo';
import { installFakeDom } from './helpers/fakeDom.mjs';

const dom = installFakeDom();
const { layerFromRef } = await import('../../src/atlas/layerRef.js');
const AX = await import('../../src/atlas/americasExtra.js');
test.after(() => dom.restore());

const findAll = (el, pred, out = []) => { if (pred(el)) out.push(el); for (const c of el.childNodes || []) findAll(c, pred, out); return out; };
const byClass = (c) => (n) => n.classList?.contains(c);
const LEGEND = [
  { cls: 'plants', label: '1칸당 50개 공장', color: '#0066b3', kind: 'symbol', shape: 'square', unit: 50 },
  { cls: 'workers', label: '1칸당 2만 명 근로자', color: '#f5821f', kind: 'symbol', shape: 'square', unit: 20000 },
];
const data = () => ({
  type: 'FeatureCollection',
  properties: { id: 'p47-maquila', title: '마킬라도라 시설', layerType: 'unitSymbols', maxRun: 4, legend: LEGEND },
  features: [
    { type: 'Feature', properties: { id: 'BC', name: '바하칼리포르니아', label: '바하칼리포르니아 · 공장 5칸', series: [{ cls: 'plants', count: 5 }, { cls: 'workers', count: 3 }] }, geometry: { type: 'Point', coordinates: [-115, 31] } },
    { type: 'Feature', properties: { id: 'QT', name: '케레타로', label: '케레타로', series: [{ cls: 'plants', count: 2 }, { cls: 'workers', count: 2 }], leader: [-100, 20.6] }, geometry: { type: 'Point', coordinates: [-103, 18] } },
  ],
});
function viewOf(k = 2.2) {
  const projection = geoEquirectangular().rotate([100, 0]).scale(4 * 180 / Math.PI * 2.2).translate([400, 300]); // 칸 크기만 k 를 봄(화면 자리는 같게)
  return { project: (ll) => projection(ll), view: { k, width: 800, height: 600, projection } };
}
const draw = (L, k) => { const v = viewOf(k); const g = document.createElementNS('svg', 'g'); L.drawSvg(g, v.project, v.view); return { g, v }; };

test('등록 전: unitSymbols 는 모르는 레이어 종류', () => {
  assert.throws(() => layerFromRef({ ref: 'layer-p47-maquila', type: 'unitSymbols' }, data()), /모르는 레이어 종류/);
});

test('등록 뒤: 계열별 칸 수 = 자료 칸 수, 한 열 최대 maxRun, 계열은 나란히(공장 열 왼쪽), 밑 = 주 자리, 범례 = 네모 견본', () => {
  AX.installAmericasExtras();
  const L = layerFromRef({ ref: 'layer-p47-maquila', type: 'unitSymbols', label: '마킬라도라' }, data());
  assert.deepEqual(L.legendItems.map((e) => [e.shape, e.color]), [['square', '#0066b3'], ['square', '#f5821f']]);
  const { g, v } = draw(L, 2.2);
  const items = findAll(g, byClass('at-unit-item'));
  assert.equal(items.length, 2);
  const cells = (it, cls) => findAll(it, (n) => n.getAttribute?.('data-cls') === cls);
  assert.equal(cells(items[0], 'plants').length, 5);
  assert.equal(cells(items[0], 'workers').length, 3);
  // 공장 5칸·maxRun 4 → 두 열(4 + 1), 근로자 3칸 → 한 열. 공장 열이 왼쪽
  const xs = (cs) => [...new Set(cs.map((c) => Number(c.getAttribute('x'))))].sort((a, b) => a - b);
  const px = xs(cells(items[0], 'plants')), wx = xs(cells(items[0], 'workers'));
  assert.equal(px.length, 2); assert.equal(wx.length, 1);
  assert.ok(Math.max(...px) < Math.min(...wx), '공장 열 다음 근로자 열');
  const ys = cells(items[0], 'plants').map((c) => Number(c.getAttribute('y')));
  assert.equal(new Set(ys).size, 4, '한 열 최대 4칸');
  // 밑 = 주 자리(가장 아래 칸 아래 끝이 투영한 점 y, 가운데 x)
  const t = /translate\(([-\d.]+),([-\d.]+)\)/.exec(items[0].getAttribute('transform'));
  const q = v.project([-115, 31]);
  assert.ok(Math.abs(+t[1] - q[0]) < 0.11 && Math.abs(+t[2] - q[1]) < 0.11, `${t} ${q}`);
  const all = cells(items[0], 'plants').concat(cells(items[0], 'workers'));
  const bottom = Math.max(...all.map((c) => Number(c.getAttribute('y')) + Number(c.getAttribute('height'))));
  const left = Math.min(...all.map((c) => Number(c.getAttribute('x')))), right = Math.max(...all.map((c) => Number(c.getAttribute('x')) + Number(c.getAttribute('width'))));
  assert.ok(Math.abs(bottom) < 0.11 && Math.abs(left + right) < 0.21, `밑 가운데 ${bottom} ${left} ${right}`);
});

test('확대해도 칸 비 그대로(계열·열 수 같음), 칸 크기는 확대에 따라 자람(3~8px), 지명 장애물 = 칸 묶음 상자, 맞히기·누르기', () => {
  const picked = [];
  const L = layerFromRef({ ref: 'm', type: 'unitSymbols' }, data(), { onPick: (f) => picked.push(f.properties.id) });
  const size = (k) => { const { g } = draw(L, k); const c = findAll(g, (n) => n.getAttribute?.('data-cls') === 'plants')[0]; return Number(c.getAttribute('width')); };
  const s1 = size(1), s8 = size(8), s40 = size(40);
  assert.ok(s1 >= 3 && s40 <= 8 && s8 > s1, `${s1} ${s8} ${s40}`);
  const { g, v } = draw(L, 2.2);
  assert.equal(findAll(g, (n) => n.getAttribute?.('data-cls') === 'plants').length, 7);
  const obs = L.labelObstacles();
  assert.equal(obs.length, 2);
  const q = v.project([-115, 31]);
  assert.ok(obs[0][0] < q[0] && obs[0][2] > q[0] && Math.abs(obs[0][3] - q[1]) < 0.5 && obs[0][1] < q[1], `${obs[0]} ${q}`);
  assert.equal(L.hit([q[0], q[1] - 3]).properties.id, 'BC');
  assert.equal(L.hit([q[0] + 300, q[1]]), null);
  findAll(g, byClass('at-unit-item'))[1].dispatch('click');
  assert.deepEqual(picked, ['QT']);
});

test('지시선: leader 가 있으면 칸 묶음 상자의 가장 가까운 점 → leader 투영점 선 + 끝 점, 없으면 선 없음', () => {
  const L = layerFromRef({ ref: 'm', type: 'unitSymbols' }, data());
  const { g, v } = draw(L, 2.2);
  const leaders = findAll(g, byClass('at-unit-leader'));
  assert.equal(leaders.length, 1);
  const e = v.project([-100, 20.6]);
  const d = leaders[0].getAttribute('d');
  const nums = d.match(/-?[\d.]+/g).map(Number);
  assert.ok(Math.abs(nums[nums.length - 2] - e[0]) < 0.11 && Math.abs(nums[nums.length - 1] - e[1]) < 0.11, d);
  // 시작 = 칸 묶음 상자(둘째 기호) 위 점 — 끝 점(오른쪽 위)에 가장 가까운 모서리 쪽
  const b = L.labelObstacles()[1];
  assert.ok(nums[0] >= b[0] - 0.11 && nums[0] <= b[2] + 0.11 && nums[1] >= b[1] - 0.11 && nums[1] <= b[3] + 0.11, `${d} ${b}`);
  assert.ok(Math.abs(nums[0] - Math.min(e[0], b[2])) < 0.11 && Math.abs(nums[1] - Math.max(b[1], Math.min(e[1], b[3]))) < 0.11, `${d} ${b}`);
  assert.equal(findAll(g, byClass('at-unit-dot')).length, 1);
});

test('범례 고름: 고르지 않은 계열 칸은 흐리게(0.2), destroy 는 뿌리를 지움', () => {
  const L = layerFromRef({ ref: 'm', type: 'unitSymbols' }, data());
  L.legend.toggle('plants');
  const { g } = draw(L, 2.2);
  const w = findAll(g, (n) => n.getAttribute?.('data-cls') === 'workers');
  const p = findAll(g, (n) => n.getAttribute?.('data-cls') === 'plants');
  assert.ok(w.every((c) => c.parentNode.getAttribute('opacity') === '0.2'));
  assert.ok(p.every((c) => c.parentNode.getAttribute('opacity') == null));
  L.destroy();
  assert.equal(findAll(g, byClass('at-unit-item')).length, 0);
});

// ── 파이프라인(build_layers.unitSymbolsLayerJson): 교과서 칸 묶음(지면 pt) → 주 자리 경위도 + 주 이름·말풍선 ──────────────
const { unitSymbolsLayerJson } = await import('../../scripts/atlas/build_layers.mjs');
const sq = (id, name, [w, s0, e, n]) => ({ type: 'Feature', properties: { iso_3166_2: id, name_ko: name, name: id }, geometry: { type: 'Polygon', coordinates: [[[w, s0], [w, n], [e, n], [e, s0], [w, s0]]] } });
const STATES = [sq('MX-A', '가주', [-110, 20, -100, 30]), sq('MX-B', '나주', [-100, 20, -90, 30])];
const FEAT = {
  legend: LEGEND.map((e) => ({ ...e, short: e.cls === 'plants' ? '공장' : '근로자', unitText: e.cls === 'plants' ? '50개' : '2만 명' })),
  symbols: [
    { xy: [-105, -25], series: [{ cls: 'plants', count: 5 }, { cls: 'workers', count: 3 }], maxRun: 4, bbox: [] },
    { xy: [-95, -21], series: [{ cls: 'plants', count: 3 }, { cls: 'workers', count: 2 }], maxRun: 3, bbox: [] },
    { xy: [-120, -10], series: [{ cls: 'plants', count: 2 }], maxRun: 2, bbox: [], leaderPt: [-102, -22] },   // 묶음은 바다 위, 지시선 끝 = 가주
    { xy: [-80, -35], series: [{ cls: 'workers', count: 1 }], maxRun: 1, bbox: [] },                         // 주 밖 → 가장 가까운 주 + 경고
  ],
};
const CV = { invert: ([x, y]) => [x, -y] };   // 가짜 변환기: 지면 (x, y) = 경위도 (x, −y)
const LAYER = { id: 'p47-maquila', map: 'p47-maquila', states: { key: 'iso_3166_2', name: 'name_ko' } };

test('unitSymbolsLayerJson: 칸 수 그대로·주 = 밑 칸 자리(지시선이 있으면 그 끝)를 품은 주, 주 밖이면 가장 가까운 주 + 경고, 말풍선 글', () => {
  const { out, warnings } = unitSymbolsLayerJson(LAYER, FEAT, CV, { page: 47, title: '마킬라도라 시설(2021년)', kind: 'maquila' }, { family: 'stereographic' }, STATES);
  assert.equal(out.type, 'FeatureCollection');
  assert.equal(out.properties.layerType, 'unitSymbols');
  assert.equal(out.properties.maxRun, 4);
  assert.deepEqual(out.properties.legend.map((e) => [e.cls, e.present]), [['plants', true], ['workers', true]]);
  const f = out.features;
  assert.deepEqual(f.map((x) => x.properties.id), ['MX-A', 'MX-B', 'MX-A', 'MX-B']);
  assert.deepEqual(f[0].geometry.coordinates, [-105, 25]);
  assert.deepEqual(f[0].properties.series, [{ cls: 'plants', count: 5, value: 250 }, { cls: 'workers', count: 3, value: 60000 }]);
  assert.equal(f[0].properties.label, '가주 · 공장 5칸(×50개) · 근로자 3칸(×2만 명)');
  assert.deepEqual(f[2].properties.leader, [-102, 22]);
  assert.deepEqual(f[2].geometry.coordinates, [-120, 10], '칸 묶음은 교과서 자리 그대로');
  assert.ok(warnings.some((w) => /주 밖/.test(w) && /나주/.test(w)), warnings.join('\n'));
  assert.ok(warnings.some((w) => /같은 주/.test(w)), '두 묶음이 한 주');
  // 범례에 없는 계열은 멈춤, 되돌릴 수 없는 점도 멈춤
  assert.throws(() => unitSymbolsLayerJson(LAYER, { ...FEAT, symbols: [{ xy: [0, 0], series: [{ cls: 'x', count: 1 }], maxRun: 1 }] }, CV, {}, {}, STATES), /범례에 없는 계열/);
  assert.throws(() => unitSymbolsLayerJson(LAYER, FEAT, { invert: () => null }, {}, {}, STATES), /되돌릴 수 없음/);
});
