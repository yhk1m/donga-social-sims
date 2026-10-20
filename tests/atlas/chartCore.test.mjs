// tests/atlas/chartCore.test.mjs — 그래프 자료(charts.json, C4 형식) → csat-chart.js 자료·직접 그리는 그래프의 눈금·칸 계산(src/atlas/chartCore.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { REPO, readJson } from '../../scripts/atlas/geo_util.mjs';
import {
  chartPlan, climoRanges, toClimateData, tickLabels, valueRange, toLineData, taperNulls, annualSeries, toStackedAreaData, shareFormatter, totalText, fmtThousands, stackLegend, toPyramidData,
  toPieData, toStackedBarData, toAbsBarData, stackCells, linearScale, arcPath, ringRows, laneLabels,
} from '../../src/atlas/chartCore.js';

const charts = readJson(path.join(REPO, 'sims/atlas-u2-asia/data/charts.json'));

test('chartPlan: 종류마다 그리는 길 — csat-chart.js 로 되는 것은 라이브러리, 없는 것만 직접(SVG)·표(HTML)', () => {
  const plan = Object.fromEntries(Object.entries(charts).map(([id, c]) => [id, chartPlan(c)]));
  assert.equal(plan['p21-clim-bangkok'].via, 'csat'); assert.equal(plan['p21-clim-bangkok'].renderer, 'climate');
  assert.equal(plan['p23-china-india-pop'].renderer, 'line');
  assert.equal(plan['p23-world-pop'].renderer, 'line');
  assert.equal(plan['p23-japan-pyramid'].renderer, 'pyramid');
  assert.equal(plan['p23-qatar-pie'].renderer, 'stacked');
  assert.equal(plan['p23-qatar-foreigners'].renderer, 'stacked');
  assert.equal(plan['p24-vietnam-2010'].renderer, 'absbar');
  assert.equal(plan['p24-resources'].via, 'svg');
  assert.equal(plan['p24-exports'].via, 'svg');
  assert.equal(plan['p23-age-ratio'].via, 'svg');
  assert.equal(plan['p24-neom'].via, 'table');
  assert.equal(Object.keys(plan).length, 17);
});

test('climoRanges: 강수 0mm 높이에서 기온 아래 끝을 읽고 눈금 수로 위 끝 — 기온 −40~40(10), 강수 0~400(50)', () => {
  for (const id of ['p21-clim-bangkok', 'p21-clim-irkutsk', 'p21-clim-tehran', 'p21-clim-wuhan']) {
    assert.deepEqual(climoRanges(charts[id]), { temp: { min: -40, max: 40, step: 10 }, prec: { min: 0, max: 400, step: 50 } }, id);
  }
});

test('toClimateData: 열두 달 {temp, precip}, 범위 고정', () => {
  const d = toClimateData(charts['p21-clim-bangkok']);
  assert.equal(d.months.length, 12);
  assert.deepEqual(d.months[0], { temp: 27.6, precip: 24.2 });
  assert.equal(d.monthInterval, 12);
  assert.deepEqual(d.tempRange, { min: -40, max: 40, auto: false, step: 10 });
  assert.deepEqual(d.precipRange, { min: 0, max: 400, auto: false, step: 50 });
});

test('tickLabels: 눈금 간격의 배수 + 첫 해, 첫 해와 너무 가까운 배수는 비움', () => {
  const cats = [1950, 1955, 1960, 1965, 1970, 1975, 1980, 1985, 1990];
  assert.deepEqual(tickLabels(cats, 20), ['1950', '', '', '', '', '', '1980', '', '']);
  const japan = Array.from({ length: 71 }, (_, i) => 1950 + i);
  const lab = tickLabels(japan, 10);
  assert.deepEqual(lab.filter(Boolean), ['1950', '1960', '1970', '1980', '1990', '2000', '2010', '2020']);
});

test('valueRange: 0 부터 간격 배수로 올림(값이 눈금에 딱 닿으면 그대로)', () => {
  assert.deepEqual(valueRange([5.5, 17, 14.2], 2), { min: 0, max: 18, step: 2 });
  assert.deepEqual(valueRange([35.4, 4.9], 5), { min: 0, max: 40, step: 5 });
  assert.deepEqual(valueRange([10, 20], 10), { min: 0, max: 20, step: 10 });
  assert.deepEqual(valueRange([-3, 8], 5), { min: -5, max: 10, step: 5 });
});

test('toLineData: 계열 색 = 교과서 선 색, 눈금 이름, 단위', () => {
  const d = toLineData(charts['p23-china-india-pop']);
  assert.deepEqual(d.series.map((s) => [s.label, s.stroke]), [['중국', '#ed1c24'], ['인도', '#1f84c6']]);
  assert.equal(d.xLabels.length, 31);
  assert.equal(d.xLabels[0], '1950'); assert.equal(d.xLabels[1], ''); assert.equal(d.xLabels[6], '1980');
  assert.deepEqual(d.yRange, { min: 0, max: 18, auto: false, step: 2 });
  assert.equal(d.yUnit, '(억 명)');
  assert.equal(d.labelPlacement, 'legend');
});

test('taperNulls: 값 있는 칸 바로 옆 빈 칸은 0(띠가 끊기지 않고 가늘어지게)', () => {
  assert.deepEqual(taperNulls([null, null, 3, 4, null, null]), [null, 0, 3, 4, 0, null]);
  assert.deepEqual(taperNulls([1, 2]), [1, 2]);
  assert.deepEqual(taperNulls([null, null]), [null, null]);
});

test('annualSeries: 1년 칸 보간, 1950 넘겨주기는 1년 안에(끝나는 계열은 시작 계열 합을 향해, 시작 계열은 그 전까지 0)', () => {
  const r = annualSeries([1930, 1940, 1950, 1960], [
    { name: 'pre', values: [10, 12, null, null] },
    { name: 'a', values: [null, null, 5, 6] },
    { name: 'b', values: [null, null, 9, 10] },
    { name: 'eu', values: [1, 2, 3, 4] },
  ]);
  assert.equal(r.years.length, 31);
  assert.equal(r.values.eu[5], 1.5);
  assert.equal(r.values.pre[10], 12);
  assert.equal(r.values.pre[19], 12 + (14 - 12) * 0.9, '1949: 시작 계열 합(5 + 9)을 향해');
  assert.equal(r.values.pre[20], 0, '1950 에 0');
  assert.equal(r.values.pre[21], 0, '0 옆 칸도 0(taperNulls)'); assert.equal(r.values.pre[22], null);
  assert.equal(r.values.a[19], 0); assert.equal(r.values.a[10], 0); assert.equal(r.values.a[8], null);
  assert.equal(r.values.a[20], 5); assert.equal(r.values.b[25], 9.5);
});

test('toStackedAreaData: 쌓는 순서(stackOrder, 아래 → 위), 1년 칸(2021 도 제자리), 1950 에서 곧게 넘겨주기, 면 색', () => {
  const src = charts['p23-world-pop'];
  const d = toStackedAreaData(src);
  assert.equal(d.stacked, true);
  assert.deepEqual(d.series.map((s) => s.label), src.stackOrder);
  assert.equal(d.series[0].label, '오세아니아');
  assert.equal(d.series[0].areaFill, '#ed1c24');
  assert.equal(d.xLabels.length, 2100 - 1800 + 1);
  assert.equal(d.xLabels[0], '1800'); assert.equal(d.xLabels[50], '1850'); assert.equal(d.xLabels[221], '');
  const i1950 = 150;
  const pre = d.series.find((s) => s.label === '아시아(1950년 전)');
  const china = d.series.find((s) => s.label === '중국');
  assert.equal(pre.values[i1950 - 10], 12.92);
  assert.equal(pre.values[i1950], 0, '1950년에 0');
  assert.equal(pre.values[i1950 + 2], null);
  assert.equal(china.values[i1950 - 1], 0, '1949년까지 0 — 넘겨주기 폭 1년');
  assert.equal(china.values[i1950], 5.44);
  const sum1950 = ['중국', '인도', '아시아(중국·인도 제외)'].reduce((a, n) => a + d.series.find((s) => s.label === n).values[i1950], 0);
  assert.ok(Math.abs(pre.values[i1950 - 1] - (12.92 + (sum1950 - 12.92) * 0.9)) < 1e-9, '1949 아시아 띠 = 1950 아시아 합을 향해');
  const vi2021 = d.series.find((s) => s.label === '인도').values[221];
  assert.equal(vi2021, 14.1, '2021 은 인쇄값 그대로');
});

test('stackLegend: 쌓은 면 범례는 위 띠부터(쌓는 순서의 거꾸로) — 범례와 띠의 위아래가 같게, 색 = 면 색', () => {
  const src = charts['p23-world-pop'];
  const L = stackLegend(src);
  assert.deepEqual(L.map((e) => e.name), [...src.stackOrder].reverse());
  assert.equal(L[0].name, '아시아(중국·인도 제외)');
  assert.equal(L.at(-1).name, '오세아니아');
  assert.equal(L.at(-1).color, '#ed1c24');
  assert.deepEqual(stackLegend({ series: [{ name: 'a', color: '#111' }, { name: 'b' }] }).map((e) => e.name), ['a', 'b'], 'stackOrder 없으면 계열 차례(= 위부터)');
});

test('toPyramidData: 18구간(85 이상) → 나이 수치 눈금, 남·여 색, 가로 범위', () => {
  const d = toPyramidData(charts['p23-japan-pyramid']);
  assert.equal(d.ages.length, 18);
  assert.deepEqual(d.ages[0], { male: 1.8, female: 1.7 });
  assert.equal(d.numericAgeAxis, true);
  assert.deepEqual(d.sexFills, ['#fcbb76', '#f4858e']);
  assert.deepEqual(d.range, { max: 6, auto: false });
  assert.equal(toPyramidData(charts['p23-qatar-pyramid']).range.max, 14);
});

test('toPieData·toStackedBarData(한 막대): 계열 색, 칸 안 이름 + 값', () => {
  const p = toPieData(charts['p23-qatar-pie']);
  assert.equal(p.displayMode, 'pie');
  assert.deepEqual(p.categories[0].values, [19.4, 80.6]);
  assert.deepEqual(p.seriesFills, ['#7da7d9', '#fbbd97']);
  assert.deepEqual(p.seriesLabels, ['카타르 국적자 19.4', '외국인 80.6']);
  const b = toStackedBarData(charts['p23-qatar-foreigners']);
  assert.equal(b.displayMode, 'bar'); assert.equal(b.barDirection, 'vertical');
  assert.equal(b.labelInSegment, false, "칸이 좁아 이름·값은 범례로");
  assert.equal(b.seriesLabels[0], '인도 25.4');
  assert.equal(b.seriesFills[0], '#f69896');
  assert.deepEqual(b.categories[0].values.slice(0, 2), [25.4, 9.5]);
});

test('toAbsBarData: 가로 막대, 범위 = 눈금 간격 × (눈금 수 − 1)', () => {
  const d = toAbsBarData(charts['p24-vietnam-2021']);
  assert.equal(d.barDirection, 'horizontal');
  assert.deepEqual(d.categories.map((c) => c.values[0]), [510.5, 254.5, 181.8, 118.5, 99.6]);
  assert.deepEqual(d.yRange, { min: 0, max: 600, auto: false, step: 100 });
  assert.deepEqual(d.seriesFills, ['#0e90c1']);
  assert.equal(d.unit, '(억 달러)');
});

test('stackCells: 막대마다 칠한 순서(stackOrder) 대로 칸 [x0, x1], 칸 색, 합 100', () => {
  const rows = stackCells(charts['p24-resources']);
  assert.equal(rows.length, 5);
  const coal = rows[0];
  assert.equal(coal.category, '석탄');
  assert.deepEqual(coal.cells.map((c) => c.name), charts['p24-resources'].stackOrder['석탄']);
  assert.equal(coal.cells[0].name, '중국'); assert.equal(coal.cells[0].x0, 0); assert.equal(coal.cells[0].x1, 50.5);
  assert.equal(coal.cells[0].color, '#7bafde');
  assert.ok(Math.abs(coal.cells.at(-1).x1 - 100) < 0.6, '합 ≈ 100');
  assert.equal(coal.total.value, 5438);
  // 희토류는 9칸
  assert.equal(rows[4].cells.length, 9);
});

test('linearScale·arcPath·ringRows', () => {
  const sc = linearScale([0, 100], [10, 210]);
  assert.equal(sc(0), 10); assert.equal(sc(50), 110); assert.equal(sc(100), 210);
  // 12시에서 시계 방향 25% = 3시까지, 고리(안 반지름 5)
  const d = arcPath(0, 0, 5, 10, 25);
  assert.match(d, /^M0,-10A10,10 0 0,1 10,0L5,0A5,5 0 0,0 0,-5Z$/);
  assert.match(arcPath(0, 0, 0, 10, 75), /A10,10 0 1,1/, '반 바퀴 넘으면 큰 호');
  const full = arcPath(0, 0, 5, 10, 100);
  assert.ok(!/NaN/.test(full));
  assert.equal((full.match(/M/g) || []).length, 2, '한 바퀴 = 바깥 원 + 안 원');
  assert.match(full, /^M0,-10A10,10 0 1,1 0,10A10,10 0 1,1 0,-10ZM0,-5A5,5 0 1,0 0,5/);
  const rr = ringRows(charts['p23-age-ratio']);
  assert.deepEqual(rr.map((r) => r.category), ['중국', '인도']);
  assert.deepEqual(rr[0].rings.map((g) => [g.name, g.value, g.color]), [['65세 이상', 13.1, '#f3859b'], ['0~14세', 17.7, '#9fd18a'], ['15~64세', 69.2, '#659ad2']]);
});

test('laneLabels: 칸에 안 들어가는 글자를 막대 위·아래 두 줄에 겹치지 않게(위 먼저, 많이 밀리면 아래), 왼쪽 → 오른쪽', () => {
  const out = laneLabels([{ cx: 100, w: 40 }, { cx: 110, w: 40 }, { cx: 115, w: 40 }, { cx: 300, w: 20 }], { gap: 4, maxShift: 30 });
  assert.deepEqual(out.map((o) => o.lane), ['above', 'below', 'above', 'above']);
  assert.equal(out[0].x, 100);
  assert.equal(out[1].x, 110);
  assert.equal(out[2].x, 100 + 20 + 4 + 20); // 위 줄 첫 글자 오른쪽 끝 + 틈 + 반폭
  assert.equal(out[3].x, 300);
  // 두 줄 모두 꽉 차면 덜 밀리는 줄
  const many = laneLabels(Array.from({ length: 6 }, (_, i) => ({ cx: 100 + i, w: 30 })), { gap: 2, maxShift: 10 });
  for (const lane of ['above', 'below']) {
    const xs = many.filter((o) => o.lane === lane).map((o) => o.x);
    for (let i = 1; i < xs.length; i++) assert.ok(xs[i] - xs[i - 1] >= 32 - 1e-9, '같은 줄에서는 겹치지 않음');
  }
});

test('shareFormatter·totalText·fmtThousands: 100% 띠 비율 소수 자리(인쇄값 최대, 2 넘지 않음)·합계 글자', () => {
  assert.equal(shareFormatter({ series: [{ values: [50.5, 9, null] }, { values: [1.25] }] })(7), '7.00');
  assert.equal(shareFormatter({ series: [{ values: [1.2345] }] })(3.14159), '3.14');
  assert.equal(shareFormatter({ series: [{ values: [3, 4] }] })(3.6), '4');
  assert.equal(shareFormatter(charts['p24-resources'])(50.5), '50.5');
  assert.equal(totalText({ value: 146339, unit: '백만 달러', year: 2021 }), '146,339 (백만 달러, 2021년)');
  assert.equal(totalText(null), '');
  assert.equal(fmtThousands(1234567.5), '1,234,567.5');
});

// ── 유럽 그래프 형식(U3-3f): 묶음 막대·강조 막대·축 생략 ──────────────────
import { toGroupedBarData, barFills, breakScale, barAxis } from '../../src/atlas/chartCore.js';

const tallinn = {
  id: 'p31-tallinn', type: 'groupedBar', title: '탈린의 교통수단 분담률 변화', unit: '%', categories: ['대중교통', '승용차', '도보', '자전거', '기타'],
  series: [{ name: '도입 전(2012년)', values: [55, 31, 12, 1, 1], color: '#e60012' }, { name: '도입 후(2013년)', values: [63, 28, 7, 1, 1], color: '#0e90c1' }],
  axes: { y: { step: 10, n: 8 } },
};
const finance = {
  id: 'p30-gfci', type: 'bar', title: '국제 금융 센터 지수 상위 10개 도시', unit: '지수', categories: ['뉴욕', '런던', '싱가포르', '홍콩', '샌프란시스코', '로스앤젤레스', '상하이', '시카고', '보스턴', '서울'],
  series: [{ name: '지수', values: [763, 744, 742, 741, 732, 731, 730, 729, 728, 727], color: '#0e90c1' }],
  colors: { 런던: '#e60012' }, axisBreak: [0, 680], axes: { y: { step: 20, n: 6 } },
};

test('chartPlan: groupedBar 는 csat absbar(세로 다계열), 강조 색·축 생략 막대는 시험지 양식 SVG, 그냥 막대는 그대로 csat', () => {
  assert.deepEqual(chartPlan(tallinn), { via: 'csat', renderer: 'absbar', size: [1300, 700] });
  assert.equal(chartPlan(finance).via, 'svg');
  assert.equal(chartPlan({ ...finance, colors: undefined }).via, 'svg', '축 생략만 있어도');
  assert.equal(chartPlan({ ...finance, axisBreak: undefined }).via, 'svg', '강조 색만 있어도');
  assert.equal(chartPlan({ ...finance, colors: undefined, axisBreak: undefined }).renderer, 'absbar');
});

test('toGroupedBarData: 범주마다 계열 차례로 값, 색·범례 = 계열(교과서 색), 세로·쌓지 않음, 축 = 간격 × (눈금 수 − 1)', () => {
  const d = toGroupedBarData(tallinn);
  assert.equal(d.barDirection, 'vertical');
  assert.equal(d.stacked, false);
  assert.deepEqual(d.categories.map((c) => [c.label, ...c.values]), [['대중교통', 55, 63], ['승용차', 31, 28], ['도보', 12, 7], ['자전거', 1, 1], ['기타', 1, 1]]);
  assert.deepEqual(d.seriesLabels, ['도입 전(2012년)', '도입 후(2013년)']);
  assert.deepEqual(d.seriesFills, ['#e60012', '#0e90c1']);
  assert.deepEqual(d.yRange, { min: 0, max: 70, auto: false, step: 10 });
  assert.equal(d.unit, '(%)');
  // 3계열(코펜하겐) — 계열 차례 그대로, 빈 값은 0
  const cph = toGroupedBarData({ ...tallinn, categories: [2012, 2014], series: [{ name: '자동차', values: [11, 10] }, { name: '인구', values: [55, null] }, { name: '자전거', values: [65, 60] }], axes: undefined });
  assert.deepEqual(cph.categories.map((c) => c.values), [[11, 55, 65], [10, 0, 60]]);
  assert.equal(cph.seriesFills.length, 3);
  assert.deepEqual(cph.yRange, { min: 0, max: 70, auto: false, step: 10 });
});

test('barFills: 강조 색은 그 막대에만(범주 이름 또는 차례 배열), 나머지는 계열 색', () => {
  const f = barFills(finance);
  assert.equal(f[1], '#e60012');
  assert.ok(f.every((c, i) => (i === 1 ? c === '#e60012' : c === '#0e90c1')));
  assert.deepEqual(barFills({ ...finance, colors: [null, null, null, null, null, null, null, null, null, '#e60012'] }).filter((c) => c === '#e60012').length, 1);
  assert.ok(barFills({ ...finance, colors: undefined }).every((c) => c === '#0e90c1'));
});

test('breakScale·barAxis: 축 생략 [0, 680] — 0 은 바닥, 680~780 은 위 칸에 선형, 생략 구간은 물결 틈, 눈금 0 · 680 · 700 … 780', () => {
  const ax = barAxis(finance);
  assert.deepEqual(ax, { min: 0, max: 780, step: 20, axisBreak: [0, 680] });
  const sc = breakScale(ax, [300, 50], { gapPx: 14, belowPx: 10 });
  assert.equal(sc.y(0), 300);
  assert.equal(sc.y(680), 300 - 10 - 14);
  assert.ok(Math.abs(sc.y(780) - 50) < 1e-9);
  assert.ok(Math.abs(sc.y(730) - (276 + 50) / 2) < 1e-9, '위 칸 안은 선형');
  assert.deepEqual(sc.ticks.map((t) => t.v), [0, 680, 700, 720, 740, 760, 780]);
  assert.equal(sc.breakAt, 300 - 10 - 7);
  // 런던(744)이 뉴욕(763)보다 낮고 서울(727)보다 높게 — 생략 없는 0~780 축이면 차이가 거의 안 보임
  assert.ok(sc.y(763) < sc.y(744) && sc.y(744) < sc.y(727));
  assert.ok(sc.y(727) - sc.y(763) > 80, `화면 높이 차 ${sc.y(727) - sc.y(763)}px`);
  // 축 생략 없음: 0~max 한 칸
  const plain = breakScale({ max: 50, step: 10 }, [300, 50]);
  assert.equal(plain.breakAt, null);
  assert.deepEqual(plain.ticks.map((t) => t.v), [0, 10, 20, 30, 40, 50]);
  assert.equal(plain.y(25), 175);
  assert.throws(() => barAxis({ ...finance, axisBreak: [700, 680] }), /axisBreak/);
  assert.throws(() => barAxis({ ...finance, axisBreak: [0, 800], axes: undefined }), /axisBreak/, '값(최대 763)보다 높은 생략');
});
