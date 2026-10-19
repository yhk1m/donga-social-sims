// © 2026 김용현
// src/atlas/charts.js — 그래프 그리기. renderChart(container, spec, opts) → { el, destroy() }.
//   spec = charts.json 항목(Task C4 형식). 길은 chartCore.chartPlan 이 정한다:
//   - csat-chart.js 저수준 렌더러(renderClimateGraph·renderLineGraph·renderPyramidGraph·renderStackedGraph·renderAbsBarGraph)로 그릴 수 있는 종류는
//     라이브러리로(사용자 규칙: 그래프는 손으로 짜지 말고 csat-chart.js 먼저). CsatChart 클래스는 가져오지 않는다 — 글꼴 불러오기(<link> 를
//     document.head 에)·getElementById 가 딸려 온다. 저수준 렌더러는 변환 행렬·DOM 을 건드리지 않고(빗금 패턴용 오프스크린 캔버스만 만듦),
//     글꼴은 시험지 명조 순서(HY신명조 → Noto Serif KR → serif)를 시스템 글꼴로 쓴다.
//   - 라이브러리에 없는 것(여러 막대 100% 띠의 칸 안 글자, 고리 막대)만 시험지 양식(검은 선·점선 격자·명조)으로 SVG 를 h()/s() 로 만든다.
//   - 글 표(네옴시티)는 HTML 표.
// 캔버스는 csat 논리 크기(예 800×700, 글자 크기가 절대 px 라 500×400 아래로 줄이지 않음)로 그리고 CSS 로 칸 너비에 맞춘다(사이드바에서는 약 0.36배 —
// devicePixelRatio 2 에서도 장치 화소보다 크게 그려 흐리지 않다).
import {
  renderClimateGraph, renderLineGraph, renderPyramidGraph, renderStackedGraph, renderAbsBarGraph, createDefaultGraphOptions, installRoundRectPolyfill,
} from 'csat-chart.js';
import { h, s } from '../shared/dom.js';
import {
  chartPlan, toClimateData, toLineData, toStackedAreaData, toPyramidData, toPieData, toStackedBarData, toAbsBarData, stackLegend, stackCells, linearScale, arcPath, ringRows, laneLabels,
} from './chartCore.js';
import './ui.css';

const RENDERERS = { climate: renderClimateGraph, line: renderLineGraph, pyramid: renderPyramidGraph, stacked: renderStackedGraph, absbar: renderAbsBarGraph };
let polyfilled = false;

/** csat 자료 만들기(종류별) */
function csatData(spec) {
  switch (spec.type) {
    case 'climograph': return toClimateData(spec);
    case 'line': return toLineData(spec);
    case 'stackedArea': return toStackedAreaData(spec);
    case 'pyramid': return toPyramidData(spec);
    case 'pie': return toPieData(spec);
    case 'stackedBar': return toStackedBarData(spec);
    case 'bar': return toAbsBarData(spec);
    default: return null;
  }
}

function csatCanvas(spec, plan, label) {
  if (!polyfilled) { installRoundRectPolyfill(); polyfilled = true; } // 저수준 렌더러를 직접 부를 때는 스스로(옛 Safari 의 ctx.roundRect)
  const [w, hh] = plan.size;
  const canvas = h('canvas', { class: 'at-chart-canvas', width: w, height: hh, role: 'img', 'aria-label': label });
  const ctx = canvas.getContext('2d');
  const options = createDefaultGraphOptions();
  Object.assign(options, { title: '', source: '', footnotes: [''], showLegend: true, legendPosition: 'bottom' });
  if (spec.type === 'climograph') Object.assign(options, { legendLabel1: '강수량', legendLabel2: '기온' });
  if (spec.type === 'stackedArea') options.showLegend = false; // 범례는 HTML(stackLegendEl) — 띠와 같은 위 → 아래 차례
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, hh);
  RENDERERS[plan.renderer](ctx, w, hh, csatData(spec), options);
  return canvas;
}

// ---------- 직접 그리는 SVG(시험지 양식) ----------
const INK = '#231f20';
const txt = (x, y, str, attrs = {}) => s('text', { class: 'at-ct', x, y, ...attrs }, str);
/** 글자 폭 어림(viewBox 단위): 한글 1em, 그 밖 0.55em */
const textW = (str, fs) => [...String(str)].reduce((a, ch) => a + (/[ㄱ-힣]/.test(ch) ? 1 : 0.56), 0) * fs;
const fmtNum = (v) => String(v).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

/** 여러 막대 100% 띠(자원·수출 비율): 막대마다 칠한 순서대로 칸, 칸에 들어가면 칸 안에 「이름 / 비율」, 아니면 막대 위·아래 줄에
 *  「이름 비율」 + 지시선(교과서처럼). 칸마다 <title>(말풍선). */
function stackedBarsSvg(spec, label) {
  const rows = stackCells(spec);
  const total = spec.total ?? 100;
  const dec = Math.max(0, ...spec.series.flatMap((q) => q.values).filter((v) => v != null).map((v) => (String(v).split('.')[1] || '').length));
  const fmtV = (v) => v.toFixed(Math.min(dec, 2));
  const W = 760, left = 132, right = 30, top = 22, barH = 30, gap = 46, fs = 11.5, lfs = 10.5;
  const plotW = W - left - right;
  const Hh = top + rows.length * (barH + gap) + 14;
  const x = linearScale([0, total], [left, left + plotW]);
  const grid = [];
  for (let v = 0; v <= total; v += 10) {
    grid.push(s('line', { class: 'at-ct-grid', x1: x(v), x2: x(v), y1: top - 16, y2: Hh - 26 }));
    grid.push(txt(x(v), Hh - 10, String(v), { 'text-anchor': 'middle', class: 'at-ct at-ct-tick' }));
  }
  grid.push(txt(left + plotW + 6, Hh - 10, '(%)', { 'text-anchor': 'start', class: 'at-ct at-ct-tick' }));
  const bars = rows.map((r, k) => {
    const y = top + k * (barH + gap);
    const geo = r.cells.map((c) => {
      const x0 = x(c.x0), x1 = x(Math.min(c.x1, total)), w = Math.max(0, x1 - x0);
      const fits = w >= Math.max(textW(c.name, fs), textW(fmtV(c.value), fs)) + 4;
      return { c, x0, w, fits, text: `${c.name} ${fmtV(c.value)}` };
    });
    const out = geo.filter((g) => !g.fits);
    const lanes = laneLabels(out.map((g) => ({ cx: g.x0 + g.w / 2, w: textW(g.text, lfs) })), { gap: 6, maxShift: 70 });
    const cells = geo.map((g) => s('g', { class: 'at-ct-cell' },
      s('title', {}, `${g.c.name} ${fmtV(g.c.value)}%`),
      s('rect', { x: g.x0, y, width: g.w, height: barH, fill: g.c.color, stroke: '#fff', 'stroke-width': 0.8 }),
      g.fits ? txt(g.x0 + g.w / 2, y + barH / 2 - 2, g.c.name, { 'text-anchor': 'middle', class: 'at-ct at-ct-cell-name' }) : null,
      g.fits ? txt(g.x0 + g.w / 2, y + barH / 2 + fs - 1, fmtV(g.c.value), { 'text-anchor': 'middle', class: 'at-ct at-ct-cell-val' }) : null));
    const leaders = out.map((g, i) => {
      const { lane, x: lx } = lanes[i];
      const cx = g.x0 + g.w / 2, up = lane === 'above';
      const ty = up ? y - 9 : y + barH + 16, ly = up ? y - 7 : y + barH + 5;
      return s('g', { class: 'at-ct-out' },
        s('path', { class: 'at-ct-leader', d: `M${cx.toFixed(1)},${(y + barH / 2).toFixed(1)}V${ly}H${lx.toFixed(1)}` }),
        s('circle', { cx: cx.toFixed(1), cy: (y + barH / 2).toFixed(1), r: 1.6, class: 'at-ct-dot' }),
        txt(lx, ty, g.text, { 'text-anchor': 'middle', class: 'at-ct at-ct-out-text' }));
    });
    const tot = r.total ? `${fmtNum(r.total.value)} (${r.total.unit}, ${r.total.year}년)` : '';
    return s('g', {},
      cells, leaders,
      txt(left - 8, y + barH / 2 - 1, r.category, { 'text-anchor': 'end', class: 'at-ct at-ct-cat' }),
      tot ? txt(left - 8, y + barH / 2 + 12, tot, { 'text-anchor': 'end', class: 'at-ct at-ct-sub' }) : null);
  });
  return s('svg', { class: 'at-chart-svg', viewBox: `0 0 ${W} ${Hh}`, role: 'img', 'aria-label': label }, grid, bars);
}

/** 고리 막대(중국·인도 연령대 비율): 범주마다 고리 셋(바깥 = 첫 계열, 교과서처럼 맞붙임), 12시에서 시계 방향 값 %.
 *  계열 이름은 12시 띠 높이에 고리 왼쪽, 값은 호 끝 바깥(고리 색), 범주 이름은 가운데 — 교과서 배치. */
function radialSvg(spec, label) {
  const rows = ringRows(spec);
  const W = 720, Hh = 300, R = 118, ringW = 28, ringGap = 2, cy = 150;
  const groups = rows.map((r, k) => {
    const cx = 210 + k * 320;
    const rings = r.rings.map((g, i) => {
      const r1 = R - i * (ringW + ringGap), r0 = r1 - ringW;
      const deg = Math.min(100, g.value) * 3.6, end = (deg * Math.PI) / 180;
      // 값 글자: 자기 고리 바깥, 그 각에 바깥 고리가 있으면 그 고리 바깥으로
      let rl = r1 + 14;
      for (let j = 0; j < i; j++) if (r.rings[j].value * 3.6 >= deg - 6) { rl = R - j * (ringW + ringGap) + 14; break; }
      const lx = cx + rl * Math.sin(end), ly = cy - rl * Math.cos(end);
      return s('g', {},
        s('title', {}, `${r.category} ${g.name} ${g.value}%`),
        s('path', { d: arcPath(cx, cy, r0, r1, g.value), fill: g.color }),
        txt(lx, ly + 5, String(g.value), { class: 'at-ct at-ct-val', 'text-anchor': Math.sin(end) < -0.2 ? 'end' : Math.sin(end) > 0.2 ? 'start' : 'middle', style: { fill: g.color } }),
        txt(cx - 8, cy - (r0 + r1) / 2 + 5, g.name, { class: 'at-ct at-ct-legend', 'text-anchor': 'end' }));
    });
    return s('g', {}, rings, txt(cx, cy + 6, r.category, { 'text-anchor': 'middle', class: 'at-ct at-ct-cat' }));
  });
  return s('svg', { class: 'at-chart-svg', viewBox: `0 0 ${W} ${Hh}`, role: 'img', 'aria-label': label },
    groups, txt(W - 8, Hh - 8, '(%)', { 'text-anchor': 'end', class: 'at-ct at-ct-tick' }));
}

/** 쌓은 면 범례(시험지 양식: 검은 테두리 견본 + 명조), 위 띠부터 */
function stackLegendEl(spec) {
  return h('ul', { class: 'at-chart-legend', 'aria-label': '범례(위 띠부터)' }, stackLegend(spec).map((e) => h('li', { class: 'at-chart-legend-item' },
    h('span', { class: 'at-chart-legend-sw', style: { background: e.color }, 'aria-hidden': 'true' }), e.name)));
}

function tableEl(spec) {
  const vals = spec.series[0]?.values || [];
  return h('table', { class: 'at-chart-table' },
    h('tbody', {}, spec.categories.map((c, i) => h('tr', {}, h('th', { scope: 'row', class: 'at-chart-th' }, c), h('td', { class: 'at-chart-td' }, vals[i] ?? '')))));
}

/** 그래프 아래 덧붙임(세계 인구: 인쇄된 합계·2021/2100년 몫 — csat 꺾은선에는 해 위 글자 자리가 없어 글로) */
function extraNote(spec) {
  if (spec.type === 'stackedArea' && spec.printed?.totals) {
    const t = Object.entries(spec.printed.totals).map(([y, v]) => `${y}년 ${v}`).join(' · ');
    return `세계 인구 합계(억 명): ${t}`;
  }
  return null;
}

/**
 * 그래프 하나를 container 에 붙인다. opts: { title(기본 spec.title, false 면 생략), source(기본 true) }.
 * 반환 { el, destroy } — destroy 는 요소를 떼어 낸다(구독 없음).
 */
export function renderChart(container, spec, { title = undefined, source = true } = {}) {
  const plan = chartPlan(spec);
  const name = title === false ? null : (title ?? spec.title);
  const label = [spec.title, spec.subtitle].filter(Boolean).join(' — ') || spec.id;
  let body;
  try {
    if (plan.via === 'csat') body = csatCanvas(spec, plan, label);
    else if (plan.via === 'svg') body = spec.type === 'radialBar' ? radialSvg(spec, label) : stackedBarsSvg(spec, label);
    else if (plan.via === 'table') body = tableEl(spec);
    else body = h('p', { class: 'ds-note' }, `그릴 수 없는 그래프 종류: ${spec?.type}`);
  } catch (err) {
    console.error(`그래프 ${spec?.id} 그리기 실패`, err);
    body = h('p', { class: 'ds-note' }, '그래프를 그리지 못했습니다.');
  }
  const note = extraNote(spec);
  const el = h('figure', { class: `at-chart at-chart-${plan.via}`, 'data-chart': spec.id },
    name ? h('figcaption', { class: 'at-chart-title' }, name, spec.subtitle ? h('span', { class: 'at-chart-sub' }, ` ${spec.subtitle}`) : null) : null,
    body,
    plan.via === 'csat' && spec.type === 'stackedArea' ? stackLegendEl(spec) : null,
    note ? h('div', { class: 'at-chart-note' }, note) : null,
    source && spec.source ? h('div', { class: 'at-chart-src' }, spec.source) : null);
  container?.append(el);
  return { el, destroy() { el.remove(); } };
}
