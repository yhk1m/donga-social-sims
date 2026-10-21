// © 2026 김용현
// tests/atlas/units/u5.charts.test.mjs — U5-7 아메리카 그래프 13(작업 폴더 units/u5/tables/charts-u5.json)이 앱 그래프 길(chartCore)로 그려지는지:
//   기후 4·선 2 = csat-chart.js 저수준(climate·line), 100% 띠 2줄 = 시험지 양식 SVG(stackedBarsSvg — barPicker), 고리 5 = 등록 SVG 고리(pie + ring),
//   BPO 매출 = 강조 색 막대(barSvg). 자료가 없으면(작업 폴더 밖) 건너뜀.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { WORK } from '../../../scripts/atlas/geo_util.mjs';
import { chartPlan, toClimateData, climoRanges, toLineData, stackCells, ringSlices, ringRatio, barFills } from '../../../src/atlas/chartCore.js';

const F = `${WORK}/units/u5/tables/charts-u5.json`;
const skip = !existsSync(F) && 'U5-7 그래프 자료 없음(작업 폴더)';
const C = () => JSON.parse(readFileSync(F, 'utf8'));
const RINGS = ['p46-mexico', 'p46-haiti', 'p46-brazil', 'p46-peru', 'p46-argentina'];

test('u5 그래프 13: 그리는 길 — 기후·선은 csat, 띠·고리·강조 막대는 SVG', { skip }, () => {
  const c = C();
  assert.equal(Object.keys(c).length, 13);
  for (const id of ['p45-barrow', 'p45-newyork', 'p45-bogota', 'p45-iquitos']) assert.equal(chartPlan(c[id]).renderer, 'climate', id);
  for (const id of ['p47-detroit', 'p47-bpo-jobs']) assert.equal(chartPlan(c[id]).renderer, 'line', id);
  for (const id of ['p46-us-ethnic', 'p47-bpo-revenue', ...RINGS]) assert.equal(chartPlan(c[id]).via, 'svg', id);
});

test('u5 기후 4: 기온 −40~40 · 강수 0~400 축, 열두 달', { skip }, () => {
  const c = C();
  for (const id of ['p45-barrow', 'p45-newyork', 'p45-bogota', 'p45-iquitos']) {
    const r = climoRanges(c[id]);
    assert.deepEqual([r.temp.min, r.temp.max, r.prec.min, r.prec.max], [-40, 40, 0, 400], id);
    const d = toClimateData(c[id]);
    assert.equal(d.months.length, 12);
    assert.ok(d.months.every((m) => Number.isFinite(m.temp) && Number.isFinite(m.precip)), id);
  }
});

test('u5 선 2: 눈금 범위가 교과서 축(0~200 만 명 · 0~1.5 백만 명), 해 축', { skip }, () => {
  const c = C();
  assert.deepEqual([toLineData(c['p47-detroit']).yRange.min, toLineData(c['p47-detroit']).yRange.max], [0, 200]);
  assert.deepEqual([toLineData(c['p47-bpo-jobs']).yRange.min, toLineData(c['p47-bpo-jobs']).yRange.max], [0, 1.5]);
  assert.equal(toLineData(c['p47-detroit']).xUnit, '(년)');
});

test('u5 100% 띠: 막대 2(1990·2020) · 칸 5 · 칸 끝 = 100 · 칸 색 = 교과서 색', { skip }, () => {
  const rows = stackCells(C()['p46-us-ethnic']);
  assert.deepEqual(rows.map((r) => r.category), ['1990년', '2020년']);
  for (const r of rows) {
    assert.equal(r.cells.length, 5);
    assert.ok(Math.abs(r.cells.at(-1).x1 - 100) < 0.11, `${r.category} ${r.cells.at(-1).x1}`);
    assert.equal(r.cells[0].color, '#fdb514');
  }
});

test('u5 고리 5: 12시부터 조각 각 합 360°, 안쪽 비 약 0.48, 가운데 = 나라 이름·(인구)', { skip }, () => {
  const c = C();
  for (const id of RINGS) {
    const sl = ringSlices(c[id]);
    assert.equal(sl[0].a0, 0); assert.ok(Math.abs(sl.at(-1).a1 - 360) < 1e-9, id);
    assert.ok(Math.abs(ringRatio(c[id]) - 0.48) < 0.02, id);
    assert.equal(c[id].center.length, 2);
    assert.match(c[id].center[1], /^\([\d,]+\)$/);
  }
});

test('u5 BPO 매출: 막대 16, 2021 만 강조 색', { skip }, () => {
  const fills = barFills(C()['p47-bpo-revenue']);
  assert.equal(fills.length, 16);
  assert.equal(fills.at(-1), '#00aaad');
  assert.ok(fills.slice(0, -1).every((x) => x === '#74cee2'));
});
