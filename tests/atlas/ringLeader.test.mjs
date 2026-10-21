// tests/atlas/ringLeader.test.mjs — U5-3g 고리 기호 지시선(46쪽 민족 고리 5): chartSymbols 항목 leader [lon, lat] → 고리 가장자리에서 그 점까지 점선 + 끝 점.
// 공유 chartSymbols.js 는 고리 자리 ringHook 만(u3·u4 조각엔 그리는 코드 없음) — 그리기는 americasExtra.ringLeader(installAmericasExtras 가 검).
// 따로 된 프로세스라 등록 전(아무것도 안 그림)을 먼저 본다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { geoEquirectangular } from 'd3-geo';
import { installFakeDom } from './helpers/fakeDom.mjs';

register('./helpers/cssHooks.mjs', import.meta.url);
const dom = installFakeDom();
const { chartSymbolLayer, ringHook } = await import('../../src/atlas/chartSymbols.js');
const AX = await import('../../src/atlas/americasExtra.js');
test.after(() => dom.restore());

function viewOf({ lon0 = 0, k = 2.2, W = 800, H = 600 } = {}) {
  const projection = geoEquirectangular().rotate([-lon0, 0]).scale(4 * 180 / Math.PI).translate([W / 2, H / 2]);
  const project = (ll) => { const q = projection(ll); return q && Number.isFinite(q[0]) ? q : null; };
  return { view: { k, width: W, height: H, projection, geoRect: null, moving: false }, project };
}
const ringData = () => ({
  type: 'chartSymbols', properties: { id: 'rc', title: '민족' },
  items: [
    { id: 'mx', chart: 'p46-mexico', lonlat: [-20, 10], title: '멕시코', center: ['멕시코'], sizePt: 30, ring: 0.6,
      series: [{ name: '혼혈', values: [64], color: '#f9c' }, { name: '기타', values: [36], color: '#ddd' }] },
    { id: 'pe', chart: 'p46-peru', lonlat: [0, -20], title: '페루', center: ['페루'], sizePt: 20, ring: 0.6,
      series: [{ name: '원주민', values: [45], color: '#c96' }, { name: '기타', values: [55], color: '#ddd' }] },
  ],
});
const countEls = (el) => (el.childNodes || []).reduce((a, c) => a + 1 + countEls(c), 0);
const lines = (el) => (el.childNodes || []).flatMap((c) => (c.tagName === 'line' ? [c] : lines(c)));

test('등록 전: 고리 자리는 빈 함수 — leader 가 있어도 아무것도 안 그림', () => {
  const g0 = document.createElementNS('svg', 'g'), g = document.createElementNS('svg', 'g'); const v = viewOf();
  chartSymbolLayer('rc', ringData()).drawSvg(g0, v.project, v.view);
  const d = ringData(); d.items[0].leader = [-10, 14];
  chartSymbolLayer('rc', d).drawSvg(g, v.project, v.view);
  assert.equal(countEls(g), countEls(g0));
  assert.equal(lines(g).length, 0);
});

test('등록 뒤: leader 있으면 점선 하나(끝 = 투영한 leader, 시작 = 고리 가장자리) + 끝 점, 확대·중심을 바꿔 다시 그려도 끝 고정, 없으면 요소 수 그대로', () => {
  AX.installAmericasExtras();
  assert.equal(ringHook.leader, AX.ringLeader);
  const v = viewOf();
  const g0 = document.createElementNS('svg', 'g');
  chartSymbolLayer('rc', ringData()).drawSvg(g0, v.project, v.view);
  const d = ringData(); d.items[0].leader = [-10, 14];
  const L = chartSymbolLayer('rc', d);
  const g = document.createElementNS('svg', 'g');
  L.drawSvg(g, v.project, v.view);
  const root = g.childNodes[0];
  assert.equal(lines(g0).length, 0, 'leader 없으면 선 없음');
  assert.equal(countEls(g), countEls(g0) + 3, '지시선 묶음 g + 선 + 점만 더함');
  assert.equal(root.childNodes[0].getAttribute('class'), 'at-ring-leader', '지시선은 고리 아래(앞 자리)');
  for (const vv of [v, viewOf({ k: 4 }), viewOf({ lon0: 20, k: 1.3 })]) {
    L.drawSvg(g, vv.project, vv.view);
    const ls = lines(root);
    assert.equal(ls.length, 1, '선 하나');
    const ln = ls[0], e = vv.project([-10, 14]), c = vv.project([-20, 10]);
    const at = (k) => Number(ln.getAttribute(k));
    assert.ok(Math.abs(at('x2') - e[0]) <= 0.06 && Math.abs(at('y2') - e[1]) <= 0.06, '끝 = 투영한 leader');
    const r = (L.labelObstacles()[0][2] - L.labelObstacles()[0][0]) / 2;
    assert.ok(Math.abs(Math.hypot(at('x1') - c[0], at('y1') - c[1]) - r) <= 0.15, '시작 = 고리 가장자리');
    assert.equal(ln.getAttribute('stroke-dasharray'), '3 2');
    const dot = ln.parentNode.childNodes.find((n) => n.tagName === 'circle');
    assert.ok(Math.abs(Number(dot.getAttribute('cx')) - e[0]) <= 0.06 && Math.abs(Number(dot.getAttribute('cy')) - e[1]) <= 0.06, '끝 점');
  }
  assert.equal(L.labelObstacles().length, 2, '장애물은 고리만');
  const far = viewOf({ lon0: 150 }); L.drawSvg(g, far.project, far.view);       // 고리가 화면 밖이면 지시선도 숨김
  assert.equal(lines(root)[0].parentNode.getAttribute('display'), 'none');
  const dn = ringData(); dn.items[0].leader = [-20.01, 10];                       // 끝이 고리 안이면 숨김
  const g2 = document.createElementNS('svg', 'g'); chartSymbolLayer('rc', dn).drawSvg(g2, v.project, v.view);
  assert.equal(g2.childNodes[0].childNodes[0].getAttribute('display'), 'none');
  L.destroy(); L.drawSvg(g, v.project, v.view);                                  // 뿌리를 새로 만들어도 지시선 하나
  assert.equal(lines(g).length, 1);
});
