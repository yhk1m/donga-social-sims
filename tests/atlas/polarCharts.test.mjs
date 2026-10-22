// tests/atlas/polarCharts.test.mjs — U6-3g 그래프 registerSvgChart('dualLine'|'halfPie')(54쪽 — 교사 Q13 기본값).
//   csat-chart.js 2.2.2 에 두 축 선·반원이 없어(확인 — renderLineGraph 는 y축 하나, 원그래프는 한 바퀴) 시험지 양식 SVG(chartsExtra 의 pie·bubbleRow 꼴).
//   따로 된 프로세스: 등록 전(「그래프를 그리지 못했습니다」) → installAmericasExtras → installPolarExtras. 가짜 DOM 의 SVG 요소를 본다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { installFakeDom } from './helpers/fakeDom.mjs';

register('./helpers/cssHooks.mjs', import.meta.url);
const dom = installFakeDom();
const { renderChart } = await import('../../src/atlas/charts.js');
const { chartPlan } = await import('../../src/atlas/chartCore.js');
const { h } = await import('../../src/shared/dom.js');
const AX = await import('../../src/atlas/americasExtra.js');
const PX = await import('../../src/atlas/polarExtra.js');
test.after(() => dom.restore());

const years = Array.from({ length: 141 }, (_, i) => 1880 + i);
const DUAL = {
  id: 'p54-climate', type: 'dualLine', title: '지구의 기온 변화와 이산화 탄소 농도', source: 'climatecentral.org, 2021',
  x: years,
  left: { label: '기온', unit: '℃', range: [-0.3, 1.1], step: 0.2, color: '#ef4136', note: '*1951~1980년 평균 온도 대비 변화',
    values: years.map((y) => Math.round((-0.2 + ((y - 1880) / 140) ** 3 * 1.2) * 100) / 100) },
  right: { label: '이산화 탄소 농도', unit: 'PPM', range: [270, 410], step: 20, color: '#0066b2',
    values: years.map((y, i) => (i === 140 ? 410 : i === 0 ? 290 : Math.round(290 + ((y - 1880) / 140) ** 2.5 * 120))) },
  xTicks: [1880, 1900, 1920, 1940, 1960, 1980, 2000, 2020],
};
const HALF = {
  id: 'p54-partners', type: 'halfPie', title: '오스트레일리아의 무역 상대국 변화', source: '오스트레일리아 외교 통상부, 2022',
  items: [
    { label: '1965년', total: '27(억 달러)', rRel: 0.5, slices: [['영국', 19.2, '#f7941d'], ['일본', 16.4, '#ed1c24'], ['미국', 9.9, '#0072bc'], ['뉴질랜드', 5.9, '#39b54a'], ['중국', 5.1, '#fff200'], ['기타', 43.5, '#d1d3d4']].map(([name, value, color]) => ({ name, value, color })) },
    { label: '2022년', total: '6,706(억 달러)', rRel: 1, slices: [['중국', 27.6, '#fff200'], ['일본', 17.9, '#ed1c24'], ['대한민국', 8.1, '#92278f'], ['인도', 5.2, '#f06eaa'], ['미국', 4.6, '#0072bc'], ['기타', 36.6, '#d1d3d4']].map(([name, value, color]) => ({ name, value, color })) },
  ],
};
const walk = (n, f) => { f(n); for (const c of n.childNodes || []) walk(c, f); };
const all = (el, pred) => { const out = []; walk(el, (n) => { if (pred(n)) out.push(n); }); return out; };
const byClass = (el, c) => all(el, (n) => n.getAttribute?.('class')?.split(' ').includes(c));
const textOf = (n) => { let t = ''; walk(n, (x) => { if (x.textContent != null && !x.childNodes?.length) t += x.textContent; }); return t; };
const pts = (d) => d.replace(/^M/, '').split(/[ML]/).map((t) => t.split(',').map(Number));

test('등록 전: 두 축 선·반원은 svg 길(chartPlan)이지만 그리는 함수가 없어 「그래프를 그리지 못했습니다」', () => {
  assert.equal(chartPlan(DUAL).via, 'svg');
  assert.equal(chartPlan(HALF).via, 'svg');
  const err = console.error; console.error = () => {};
  try {
    for (const spec of [DUAL, HALF]) {
      const box = h('div', {});
      renderChart(box, spec);
      assert.match(textOf(box), /그래프를 그리지 못했습니다/);
    }
  } finally { console.error = err; }
});

test('두 축 선(dualLine): 왼쪽 눈금 −0.3~1.1 여덟 개(축 왼쪽) · 오른쪽 270~410 여덟 개(축 오른쪽), 같은 줄 높이, 오른쪽 값은 오른쪽 축으로(410 → 위 끝)', () => {
  AX.installAmericasExtras();
  PX.installPolarExtras();
  const box = h('div', {});
  renderChart(box, DUAL);
  const svg = all(box, (n) => n.tagName === 'svg')[0];
  assert.ok(svg, 'svg');
  const L = byClass(svg, 'at-ct-ltick'), R = byClass(svg, 'at-ct-rtick');
  assert.deepEqual(L.map(textOf), ['-0.3', '-0.1', '0.1', '0.3', '0.5', '0.7', '0.9', '1.1']);
  assert.deepEqual(R.map(textOf), ['270', '290', '310', '330', '350', '370', '390', '410']);
  const axis = byClass(svg, 'at-ct-axis')[0];
  const [, , x1] = (axis.getAttribute('data-box') || '').split(',').map(Number);
  const [x0, top, , bottom] = axis.getAttribute('data-box').split(',').map(Number);
  for (const t of L) assert.ok(+t.getAttribute('x') < x0);
  for (const t of R) assert.ok(+t.getAttribute('x') > x1);
  for (let i = 0; i < 8; i++) assert.equal(L[i].getAttribute('y'), R[i].getAttribute('y'), `눈금 ${i} 같은 높이`);
  const lineR = byClass(svg, 'at-ct-dual-right')[0], lineL = byClass(svg, 'at-ct-dual-left')[0];
  assert.equal(lineR.getAttribute('stroke'), '#0066b2');
  assert.equal(lineL.getAttribute('stroke'), '#ef4136');
  const pr = pts(lineR.getAttribute('d')), pl = pts(lineL.getAttribute('d'));
  assert.equal(pr.length, 141); assert.equal(pl.length, 141);
  assert.ok(Math.abs(pr[140][1] - top) < 0.2, '410 → 위 끝');
  assert.ok(Math.abs(pr[140][0] - x1) < 0.2 && Math.abs(pr[0][0] - x0) < 0.2, '1880 → 왼쪽 끝 · 2020 → 오른쪽 끝');
  // 290 PPM = 아래에서 1칸(270 → 290 = 1/7)
  assert.ok(Math.abs(pr[0][1] - (bottom - (bottom - top) / 7)) < 0.2);
  // 왼쪽 값 −0.2 = 아래에서 0.5칸
  assert.ok(Math.abs(pl[0][1] - (bottom - ((bottom - top) * 0.1) / 1.4)) < 0.2);
  // 선 이름 상자 둘(교과서처럼 선 곁 글자 + 지시선)·단위 둘·주석·x 눈금 8
  assert.deepEqual(byClass(svg, 'at-ct-dual-name').map(textOf), ['기온', '이산화 탄소 농도']);
  assert.equal(byClass(svg, 'at-ct-leader').length, 2);
  const all_t = textOf(svg);
  for (const s of ['(℃)', '(PPM)', '*1951~1980년 평균 온도 대비 변화', '1880', '2020']) assert.ok(all_t.includes(s), s);
  assert.equal(byClass(svg, 'at-ct-xtick').length, 8);
});

test('반원(halfPie): 조각 각 합 = 180°, 반지름 비 = 자료 rRel(교과서 잰 값 1 : 2), 위쪽 반원(9시 → 3시), 해 이름·금액 글자, 조각마다 말풍선', () => {
  for (const it of HALF.items) {
    const sl = PX.halfPieSlices(it);
    assert.ok(Math.abs(sl.reduce((a, q) => a + (q.a1 - q.a0), 0) - 180) < 1e-9);
    assert.equal(sl[0].a0, -90); assert.ok(Math.abs(sl[sl.length - 1].a1 - 90) < 1e-9);
  }
  const box = h('div', {});
  renderChart(box, HALF);
  const svg = all(box, (n) => n.tagName === 'svg')[0];
  const groups = byClass(svg, 'at-ct-half');
  assert.equal(groups.length, 2);
  const radii = groups.map((g) => +g.getAttribute('data-r'));
  assert.ok(Math.abs(radii[0] / radii[1] - 0.5) < 1e-9, `반지름 비 ${radii}`);
  const cells = groups.map((g) => byClass(g, 'at-ct-cell'));
  assert.deepEqual(cells.map((c) => c.length), [6, 6]);
  // 반원 아래 끝(가운데 y)이 같은 줄
  assert.equal(groups[0].getAttribute('data-cy'), groups[1].getAttribute('data-cy'));
  // 모든 조각 경로 점이 가운데 높이 위(위쪽 반원)
  for (const g of groups) {
    const cy = +g.getAttribute('data-cy');
    for (const p of all(g, (n) => n.tagName === 'path' && n.getAttribute('fill') && n.getAttribute('class') !== 'at-ct-leader')) {
      const nums = p.getAttribute('d').match(/-?\d+(\.\d+)?,-?\d+(\.\d+)?/g).map((t) => +t.split(',')[1]);
      for (const y of nums) assert.ok(y <= cy + 0.05, `${y} > ${cy}`);
    }
  }
  const t = textOf(svg);
  for (const s of ['1965년', '27(억 달러)', '2022년', '6,706(억 달러)', '대한민국', '27.6']) assert.ok(t.includes(s), s);
  assert.ok(all(svg, (n) => n.tagName === 'title').some((n) => textOf(n) === '1965년 영국 19.2%'));
});

test('반원 orient(U6-7 — 교과서 꼴): 1965 위 반원 · 2022 아래 반원이 한 가운데 점에 지름을 맞대, 아래 반원은 9시 → 6시 → 3시(조각 차례 왼쪽부터)', () => {
  const spec = { ...HALF, items: [{ ...HALF.items[0], rRel: 0.587, orient: 'up' }, { ...HALF.items[1], orient: 'down' }] };
  const box = h('div', {});
  renderChart(box, spec);
  const svg = all(box, (n) => n.tagName === 'svg')[0];
  const groups = byClass(svg, 'at-ct-half');
  assert.deepEqual(groups.map((g) => g.getAttribute('data-orient')), ['up', 'down']);
  assert.equal(groups[0].getAttribute('data-cy'), groups[1].getAttribute('data-cy'));
  const radii = groups.map((g) => +g.getAttribute('data-r'));
  assert.ok(Math.abs(radii[0] / radii[1] - 0.587) < 1e-9);
  const cy = +groups[0].getAttribute('data-cy');
  const sectors = (g) => all(g, (n) => n.tagName === 'path' && n.getAttribute('fill') && n.getAttribute('class') !== 'at-ct-leader');
  // 경로 점: M·L 은 그 점, A 는 끝점(마지막 두 수 — 큰 호·방향 플래그를 점으로 읽지 않게)
  const ys = (p) => (p.getAttribute('d').match(/[MLA][^MLAZ]*/g) || []).map((c) => { const v = c.slice(1).split(/[ ,]+/).map(Number); return v.slice(-2); });
  for (const p of sectors(groups[0])) for (const [, y] of ys(p)) assert.ok(y <= cy + 0.05, `위 반원 ${y} > ${cy}`);
  for (const p of sectors(groups[1])) for (const [, y] of ys(p)) assert.ok(y >= cy - 0.05, `아래 반원 ${y} < ${cy}`);
  // 같은 가운데 x(지름 맞댐), 아래 반원 첫 조각(중국)은 왼쪽(9시 쪽), 마지막(기타)은 오른쪽
  const xsOf = (p) => ys(p).map(([x]) => x);
  const down = sectors(groups[1]), cxs = groups.map((g) => Math.max(...sectors(g).flatMap(xsOf)) - Math.min(...sectors(g).flatMap(xsOf)));
  assert.ok(cxs[0] < cxs[1]);
  assert.ok(Math.min(...xsOf(down[0])) < Math.min(...xsOf(down[down.length - 1])));
  const vb = svg.getAttribute('viewBox').split(' ').map(Number);
  assert.ok(vb[3] >= cy + radii[1], `높이 ${vb[3]} — 아래 반원이 들어감`);
});
