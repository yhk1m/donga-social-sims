// tests/atlas/units/u6.charts.test.mjs — U6-7 오세아니아·극지방 그래프 11(작업 폴더 units/u6/tables/charts-u6.json)이 앱 그래프 길로 그려지는지:
//   기후 4·해수면 점 = csat-chart.js 저수준(climate·line), 원 2 = csat 원그래프(stacked pie — ring 없음), 반원·두 축 선 = polarExtra 등록 SVG
//   (가짜 DOM 에 실제 자료를 그려 봄), 표 2 = 글 표. 자료가 없으면(작업 폴더 밖) 건너뜀. 따로 된 프로세스(등록 길).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { register } from 'node:module';
import { installFakeDom } from '../helpers/fakeDom.mjs';
import { WORK } from '../../../scripts/atlas/geo_util.mjs';

register('../helpers/cssHooks.mjs', import.meta.url);
const dom = installFakeDom();
const { renderChart } = await import('../../../src/atlas/charts.js');
const { chartPlan, climoRanges, toClimateData, toLineData, toPieData } = await import('../../../src/atlas/chartCore.js');
const { h } = await import('../../../src/shared/dom.js');
const AX = await import('../../../src/atlas/americasExtra.js');
const PX = await import('../../../src/atlas/polarExtra.js');
test.after(() => dom.restore());

const F = `${WORK}/units/u6/tables/charts-u6.json`;
const skip = !existsSync(F) && 'U6-7 그래프 자료 없음(작업 폴더)';
const C = () => JSON.parse(readFileSync(F, 'utf8'));
const CLIM = ['p53-darwin', 'p53-alice', 'p53-perth', 'p53-christchurch'];
const walk = (n, f) => { f(n); for (const c of n.childNodes || []) walk(c, f); };
const all = (el, pred) => { const out = []; walk(el, (n) => { if (pred(n)) out.push(n); }); return out; };
const byClass = (el, c) => all(el, (n) => n.getAttribute?.('class')?.split(' ').includes(c));
const textOf = (n) => { let t = ''; walk(n, (x) => { if (x.textContent != null && !x.childNodes?.length) t += x.textContent; }); return t; };

test('u6 그래프 11: 그리는 길 — 기후·점은 csat, 원은 csat 원그래프, 반원·두 축 선은 SVG, 표 2', { skip }, () => {
  const c = C();
  assert.equal(Object.keys(c).length, 11);
  for (const id of CLIM) assert.equal(chartPlan(c[id]).renderer, 'climate', id);
  assert.equal(chartPlan(c['p54-sealevel']).renderer, 'line');
  for (const id of ['p54-aus-exports', 'p54-nz-exports']) assert.equal(chartPlan(c[id]).renderer, 'stacked', id);
  for (const id of ['p54-partners', 'p54-temp-co2']) assert.equal(chartPlan(c[id]).via, 'svg', id);
  for (const id of ['p54-plastic', 'p55-route-stats']) assert.equal(chartPlan(c[id]).via, 'table', id);
});

test('u6 기후 4: 기온 −50~50 · 강수 0~500 축(교과서 53쪽 틀 그대로 — 45쪽 −40~40 · 0~400 과 다름), 열두 달 값', { skip }, () => {
  const c = C();
  for (const id of CLIM) {
    const r = climoRanges(c[id]);
    assert.deepEqual([r.temp.min, r.temp.max, r.prec.min, r.prec.max], [-50, 50, 0, 500], id);
    const d = toClimateData(c[id]);
    assert.equal(d.months.length, 12);
    assert.ok(d.months.every((m) => Number.isFinite(m.temp) && Number.isFinite(m.precip)), id);
  }
});

test('u6 원 2: 조각 6 · 이름 「이름 값」 · 교과서 색', { skip }, () => {
  const d = toPieData(C()['p54-aus-exports']);
  assert.equal(d.seriesLabels.length, 6);
  assert.ok(d.seriesLabels.some((s) => s.includes('교육 관련 여행')));
  assert.equal(d.seriesFills[0], '#5ac4bf');
});

test('u6 해수면 점: 해 5 · 값이 늘어남', { skip }, () => {
  const d = toLineData(C()['p54-sealevel']);
  assert.ok(d.yRange.max >= 72, `${d.yRange.max}`);
});

test('u6 반원·두 축 선: 실제 자료로 그림 — 조각 6·6, 반지름 비 = rRel, 두 선 141점(빨간 선은 1882 부터)', { skip }, () => {
  AX.installAmericasExtras();
  PX.installPolarExtras();
  const c = C();
  const box = h('div', {});
  renderChart(box, { id: 'p54-partners', ...c['p54-partners'] });
  const groups = byClass(box, 'at-ct-half');
  assert.equal(groups.length, 2);
  assert.deepEqual(groups.map((g) => byClass(g, 'at-ct-cell').length), [6, 6]);
  const radii = groups.map((g) => +g.getAttribute('data-r'));
  assert.ok(Math.abs(radii[0] / radii[1] - c['p54-partners'].items[0].rRel) < 1e-9);
  const t = textOf(box);
  for (const s of ['1965년', '27(억 달러)', '2022년', '6,706(억 달러)', '대한민국', '27.6']) assert.ok(t.includes(s), s);
  const box2 = h('div', {});
  renderChart(box2, { id: 'p54-temp-co2', ...c['p54-temp-co2'] });
  const svg = all(box2, (n) => n.tagName === 'svg')[0];
  assert.ok(svg, '두 축 선 svg');
  const L = byClass(svg, 'at-ct-dual-left')[0].getAttribute('d'), R = byClass(svg, 'at-ct-dual-right')[0].getAttribute('d');
  assert.equal((L.match(/[ML]/g) || []).length, 139);
  assert.equal((R.match(/[ML]/g) || []).length, 141);
  assert.deepEqual(byClass(svg, 'at-ct-dual-name').map(textOf), ['기온', '이산화 탄소 농도']);
  for (const s of ['(°C)', '(PPM)', '*1951~1980년 평균 온도 대비 변화']) assert.ok(textOf(svg).includes(s), s);
});
