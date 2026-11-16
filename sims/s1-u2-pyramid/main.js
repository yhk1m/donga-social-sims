// © 2026 김용현
// 인구 피라미드 비교 (사회1 36~37쪽, 통합사회1 142쪽)
//   보기 세 가지
//   - 겹쳐 보기: 두 해를 한 축에 겹쳐 그린다. 이전 해 = 흐린 막대(옅은 채움 + 테두리), 이후 해 = 진한 막대.
//     두 해 막대를 각각 켜고 끌 수 있고(둘 다 켜졌을 때만 늘어남/줄어듦 표시), 막대 끝에 차이 숫자(%p 또는 사람 수).
//   - 나란히 비교하기: 같은 가로 눈금으로 두 해 피라미드를 왼쪽(이전 해), 오른쪽(이후 해)에 따로 그린다.
//   - 「일본, 인도, 카타르」 세 나라 나란히 보기는 csat-chart.js 의 renderPyramidGraph(저수준 렌더러)로 그린다.
//   겹쳐 그리기는 라이브러리로 되지 않아 SVG 로 직접 그린다: renderPyramidGraph 는 부를 때마다 캔버스를 흰색으로 지우고(clearCanvas)
//   자료 한 벌만 받으며 막대 좌표를 돌려주지 않아, 두 해를 겹치거나 늘어남/줄어듦 칸과 차이 숫자를 막대에 맞춰 얹을 수 없다.
//   SVG 는 실제 표시 크기로 viewBox 를 잡아(ResizeObserver) 넓은 화면에서 글자가 같이 커지거나 좁은 화면에서 작아지지 않게 한다.
//   겉모양은 동아 디자인(동아출판 CI 색, 라이트/다크) 토큰을 따른다: style.css.
// 규칙(EMBED_RULES.md): DOM 은 h()/s() 로만, 검색은 root 안에서만, 자료는 정적 import.
import { createShell, addBlock } from '../../src/shared/shell.js';
import { h, s, icon, clear } from '../../src/shared/dom.js';
import { dongaLogo } from '../../src/shared/dongaLogo.js';
import { renderPyramidGraph, createDefaultGraphOptions, installRoundRectPolyfill } from 'csat-chart.js';
import {
  decodeInts, yearSlice, valuesFor, diffBands, niceMax, tickStep, fmtDelta, fmtCount, structure, collapseTop, ageLabels, total, NA,
} from './core.js';
import DATA from './data/pyramid-data.js';
import './style.css';

const GROUPS = [
  ['world', '세계와 대륙'], ['continent', '세계와 대륙'], ['asia', '아시아 나라'], ['other', '다른 대륙 나라'],
];
const PLAY_MS = { un: 110, kr: 800 };
let uid = 0;

/** 지역 목록 만들기: key → { key, set, name, sido, ints } */
function buildRegions() {
  const list = [];
  for (const r of DATA.un.regions) list.push({ key: r.id, set: 'un', name: r.name, group: r.group, d: r.d });
  if (DATA.kr) for (const r of DATA.kr.regions) list.push({ key: r.id, set: 'kr', name: r.name, sido: r.sido, d: r.d });
  const byKey = new Map(list.map((r) => [r.key, r]));
  for (const r of list) {
    r.ints = null;
    r.children = list.filter((c) => c.sido === r.key);
  }
  return { list, byKey };
}

export default function mount(root) {
  const { stage, panel } = createShell(root, 's1-u2-pyramid');
  root.classList.add('pyr-root');
  const pid = `pyr${++uid}`;
  const { list: REG, byKey } = buildRegions();
  const huaseong = REG.find((r) => r.set === 'kr' && r.name === '화성시');

  // view: 'overlay'(겹쳐 보기) | 'side'(나란히 비교하기) | 'trio'(세 나라)
  const st = { key: 'un935', a: 1990, b: 2021, mode: 'share', view: 'overlay', showA: true, showB: true, diff: true, trioYear: 2021, timer: 0 };

  const setOf = (r) => DATA[r.set];
  const intsOf = (r) => (r.ints ??= decodeInts(r.d));
  /** 그 지역에 자료가 있는 해 */
  const yearsOf = (r) => setOf(r).years.filter((y, k) => yearSlice(intsOf(r), k) !== null);
  const popOf = (r, y) => {
    const set = setOf(r);
    const k = set.years.indexOf(y);
    return k < 0 ? null : yearSlice(intsOf(r), k, set.unit);
  };
  const topBand = (r, y) => {
    const set = setOf(r);
    if (!set.top) return NA - 1;
    const t = set.top[set.years.indexOf(y)] ?? 100;
    return Math.min(NA - 1, t / 5);
  };
  const isProj = (r, y) => setOf(r).projFrom != null && y >= setOf(r).projFrom;
  const yearText = (r, y) => `${y}년${isProj(r, y) ? '(추계)' : ''}`;
  const fullName = (r) => {
    if (r.set === 'un') return r.name;
    const p = r.sido ? byKey.get(r.sido) : null;
    return p ? `${p.name} ${r.name}` : r.name === '전국' ? '우리나라 전국(주민등록)' : r.name;
  };

  // ---------- 무대 ----------
  stage.classList.add('pyr-stage');
  const titleEl = h('div', { class: 'pyr-title' });
  const subEl = h('div', { class: 'pyr-sub' });
  const legend = h('div', { class: 'pyr-legend' });
  const head = h('div', { class: 'pyr-head' }, h('div', { class: 'pyr-head-text' }, titleEl, subEl), legend);
  // 실제 표시 크기(px). ResizeObserver 가 고친다
  let W = 960, H = 640;
  const svg = h('svg', { class: 'pyr-svg', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': '인구 피라미드' });
  const tip = h('div', { class: 'pyr-tip', hidden: true });
  const chartBox = h('div', { class: 'pyr-chart' }, svg, tip);
  const trioBox = h('div', { class: 'pyr-trio', hidden: true });
  stage.append(head, chartBox, trioBox);

  // 처음 열 때 한 번: 그래프 자리 가운데서 동아출판 CI 가 열리고 사라진다(약 1.8초).
  // 누르기를 막지 않고(pointer-events: none) 사이드바는 처음부터 쓸 수 있다. 되풀이하지 않는다.
  const intro = h('div', { class: 'pyr-intro', 'aria-hidden': 'true' }, dongaLogo(true));
  chartBox.append(intro);
  const endIntro = () => { if (!intro.isConnected) return; intro.classList.add('is-done'); setTimeout(() => intro.remove(), 350); };
  setTimeout(endIntro, 1700);

  // 빗금 무늬(줄어듦)
  const hatchId = `${pid}-hatch`;
  const defs = h('defs', {},
    s('pattern', { id: hatchId, width: 6, height: 6, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' },
      h('rect', { width: 6, height: 6, class: 'pyr-hatch-bg' }),
      h('line', { x1: 0, y1: 0, x2: 0, y2: 6, class: 'pyr-hatch-line' })));
  const gPlot = h('g', {});
  svg.append(defs, gPlot);

  const sw = (cls, text) => h('span', { class: 'pyr-key' }, h('span', { class: `pyr-sw ${cls}` }), text);
  function drawLegend() {
    clear(legend);
    if (st.view === 'trio') return;
    legend.append(sw('pyr-sw-m', '남자'), sw('pyr-sw-f', '여자'));
    if (st.view !== 'overlay') return;
    if (st.showA) legend.append(sw('pyr-sw-a', `${st.a}년 (흐린 막대)`));
    if (st.showB) legend.append(sw('pyr-sw-b', `${st.b}년 (진한 막대)`));
    if (diffOn()) {
      const hatch = h('svg', { class: 'pyr-sw-svg', viewBox: '0 0 14 14', 'aria-hidden': 'true' }, h('rect', { width: 14, height: 14, fill: `url(#${hatchId})` }));
      legend.append(sw('pyr-sw-more', '늘어남'), h('span', { class: 'pyr-key' }, hatch, '줄어듦'));
    }
  }
  const diffOn = () => st.diff && st.showA && st.showB;

  /** 두 해 자료를 같은 칸 수로 맞춰 꺼내기 */
  function pair(r) {
    let pa = popOf(r, st.a), pb = popOf(r, st.b);
    if (!pa || !pb) return null;
    // 옛 자료가 '85세 이상' 한 칸뿐이면 두 해 모두 그 칸으로 합친다
    const band = Math.min(topBand(r, st.a), topBand(r, st.b));
    pa = collapseTop(pa, band); pb = collapseTop(pb, band);
    const n = band + 1;
    const va = valuesFor(pa, st.mode), vb = valuesFor(pb, st.mode);
    const vmax = niceMax(Math.max(...va.male, ...va.female, ...vb.male, ...vb.female));
    return { pa, pb, n, labels: ageLabels(n), va, vb, vmax, step: tickStep(vmax) };
  }

  /**
   * 축 하나(남자 왼쪽, 여자 오른쪽) 그리기. [x0, x1] 가로 범위 안에.
   * 돌려줌: { mx0, fx0, sx, rowY(i), barH, rowH, cx }
   */
  function axes(g, x0, x1, top, plotH, vmax, step, n, opts = {}) {
    const gap = opts.gap ?? 56;
    const cx = (x0 + x1) / 2, mx0 = cx - gap / 2, fx0 = cx + gap / 2;
    const half = (x1 - x0 - gap) / 2;
    const sx = (v) => (v / vmax) * half;
    const rowH = plotH / n, barH = rowH * 0.78;
    const grid = h('g', { class: 'pyr-grid' });
    const minGap = 40; // 눈금 글자끼리 최소 간격(px)
    let every = 1;
    while (sx(step * every) < minGap && every < 10) every++;
    let k = 0;
    for (let v = 0; v <= vmax + 1e-9; v += step, k++) {
      for (const x of v === 0 ? [mx0, fx0] : [mx0 - sx(v), fx0 + sx(v)]) {
        grid.append(h('line', { x1: x, x2: x, y1: top, y2: top + plotH, class: v === 0 ? 'pyr-axis' : 'pyr-gridline' }));
        if (k % every === 0) grid.append(h('text', { x, y: top + plotH + 20, class: 'pyr-tick' }, st.mode === 'share' ? (Math.round(v * 100) / 100).toString() : fmtCount(v)));
      }
    }
    grid.append(h('text', { x: cx, y: top + plotH + 20, class: 'pyr-unit pyr-unit-c' }, '(세)'));
    grid.append(h('text', { x: mx0 - 6, y: top - 12, class: 'pyr-sex pyr-sex-m' }, '남자'));
    grid.append(h('text', { x: fx0 + 6, y: top - 12, class: 'pyr-sex pyr-sex-f' }, '여자'));
    if (opts.caption) grid.append(h('text', { x: cx, y: top - 36, class: 'pyr-cap-year' }, opts.caption));
    g.append(grid);
    const rowY = (i) => top + (n - 1 - i) * rowH;
    return { mx0, fx0, sx, rowY, barH, rowH, cx };
  }

  /** 막대 하나 [v0, v1] (남자는 왼쪽으로 뻗음) */
  function bar(ax, left, y, v0, v1, cls, extra) {
    const w = ax.sx(v1) - ax.sx(v0);
    if (w <= 0.01) return null;
    const xx = left ? ax.mx0 - ax.sx(v1) : ax.fx0 + ax.sx(v0);
    return h('rect', { x: xx, y, width: w, height: ax.barH, class: cls, ...extra });
  }

  function rowHit(ax, x0, x1, i, row, onShow) {
    const hit = h('rect', { x: x0, y: ax.rowY(i), width: x1 - x0, height: ax.rowH, class: 'pyr-hit' });
    const show = (e) => { row.classList.add('pyr-row-on'); onShow(); moveTip(e); };
    hit.addEventListener('pointerenter', show);
    hit.addEventListener('pointerdown', show); // 태블릿: 눌러서 보기
    hit.addEventListener('pointerleave', () => { row.classList.remove('pyr-row-on'); tip.hidden = true; });
    hit.addEventListener('pointermove', (e) => moveTip(e));
    row.append(hit);
  }

  function setHeader(r) {
    titleEl.textContent = fullName(r);
    const unit = st.mode === 'share' ? '전체 인구에서 차지하는 비율(%)' : '사람 수';
    subEl.textContent = st.view === 'side'
      ? `${yearText(r, st.a)}(왼쪽)과 ${yearText(r, st.b)}(오른쪽) 나란히, ${unit}`
      : `${yearText(r, st.a)}과 ${yearText(r, st.b)} 겹쳐 보기, ${unit}`;
    drawLegend();
  }

  function emptyMsg(text) {
    gPlot.append(h('text', { x: W / 2, y: H / 2, class: 'pyr-empty' }, text));
  }

  // ---------- 겹쳐 보기(SVG) ----------
  function drawOverlay() {
    const r = byKey.get(st.key);
    clear(gPlot);
    setHeader(r);
    const P = pair(r);
    if (!P) { emptyMsg('이 해에는 자료가 없어요'); return; }
    updateSummary(P.pa, P.pb);
    if (!st.showA && !st.showB) { emptyMsg('보기에서 이전 해나 이후 해 막대를 켜 주세요'); return; }
    const top = 40, bottom = 40, side = Math.max(48, Math.min(78, W * 0.07));
    const plotH = H - top - bottom;
    const ax = axes(gPlot, side, W - side, top, plotH, P.vmax, P.step, P.n, { gap: 60 });
    gPlot.append(h('text', { x: W - side + 8, y: top + plotH + 20, class: 'pyr-unit' }, st.mode === 'share' ? '(%)' : '(명)'));
    const d = diffBands(P.va, P.vb);
    const showDiff = diffOn();
    const minLabel = st.mode === 'share' ? 0.05 : P.vmax * 0.004;
    const bars = h('g', {});
    for (let i = 0; i < P.n; i++) {
      const y = ax.rowY(i) + (ax.rowH - ax.barH) / 2;
      const row = h('g', { class: 'pyr-row' });
      for (const sex of ['male', 'female']) {
        const x = d[sex][i];
        const left = sex === 'male';
        const sc = left ? 'm' : 'f';
        row.append(...[
          st.showA ? bar(ax, left, y, 0, x.a, `pyr-a pyr-a-${sc}`) : null,
          st.showB ? bar(ax, left, y, 0, showDiff ? x.common : x.b, `pyr-b pyr-b-${sc}`) : null,
          showDiff ? bar(ax, left, y, x.common, x.b, 'pyr-more') : null,
          showDiff ? bar(ax, left, y, x.b, x.a, 'pyr-less', { fill: `url(#${hatchId})` }) : null,
          showDiff ? bar(ax, left, y, 0, x.a, `pyr-a-edge pyr-a-${sc}-edge`) : null,
        ].filter(Boolean));
        if (showDiff && Math.abs(x.delta) >= minLabel) {
          const end = ax.sx(Math.max(x.a, x.b)) + 4;
          row.append(h('text', {
            x: left ? ax.mx0 - end : ax.fx0 + end, y: y + ax.barH / 2,
            class: `pyr-dlabel ${x.delta > 0 ? 'pyr-dl-more' : 'pyr-dl-less'}`, 'text-anchor': left ? 'end' : 'start',
          }, fmtDelta(x.delta, st.mode)));
        }
      }
      row.append(h('text', { x: ax.cx, y: ax.rowY(i) + ax.rowH / 2, class: 'pyr-age' }, P.labels[i]));
      rowHit(ax, 0, W, i, row, () => showTip(P.labels[i], [[`${st.a}년`, d.male[i].a, d.female[i].a], [`${st.b}년`, d.male[i].b, d.female[i].b]], d, i));
      bars.append(row);
    }
    gPlot.append(bars);
  }

  // ---------- 나란히 비교하기(SVG) ----------
  function drawSide() {
    const r = byKey.get(st.key);
    clear(gPlot);
    setHeader(r);
    const P = pair(r);
    if (!P) { emptyMsg('이 해에는 자료가 없어요'); return; }
    updateSummary(P.pa, P.pb);
    const top = 64, bottom = 40, between = Math.max(24, W * 0.04);
    const plotH = H - top - bottom;
    const colW = (W - between) / 2;
    const d = diffBands(P.va, P.vb);
    for (const [k, which] of [[0, 'a'], [1, 'b']]) {
      const x0 = k * (colW + between) + 8, x1 = x0 + colW - 16;
      const g = h('g', { class: `pyr-col pyr-col-${which}` });
      const ax = axes(g, x0, x1, top, plotH, P.vmax, P.step, P.n, { gap: 48, caption: yearText(r, st[which]) });
      const v = which === 'a' ? P.va : P.vb;
      for (let i = 0; i < P.n; i++) {
        const y = ax.rowY(i) + (ax.rowH - ax.barH) / 2;
        const row = h('g', { class: 'pyr-row' });
        row.append(...[bar(ax, true, y, 0, v.male[i], 'pyr-b pyr-b-m'), bar(ax, false, y, 0, v.female[i], 'pyr-b pyr-b-f')].filter(Boolean));
        row.append(h('text', { x: ax.cx, y: ax.rowY(i) + ax.rowH / 2, class: 'pyr-age' }, P.labels[i]));
        rowHit(ax, x0, x1, i, row, () => showTip(P.labels[i], [[`${st.a}년`, d.male[i].a, d.female[i].a], [`${st.b}년`, d.male[i].b, d.female[i].b]], d, i));
        g.append(row);
      }
      gPlot.append(g);
    }
    gPlot.append(h('text', { x: W - 8, y: top + plotH + 20, class: 'pyr-unit pyr-unit-r' }, st.mode === 'share' ? '(%)' : '(명)'));
  }

  const fv = (v) => (st.mode === 'share' ? `${v.toFixed(1)}%` : `${Math.round(v).toLocaleString('ko-KR')}명`);
  function showTip(label, rows, d, i) {
    clear(tip);
    tip.append(h('div', { class: 'pyr-tip-t' }, `${label.endsWith('+') ? label.replace('+', '세 이상') : `${label}세`}`));
    for (const [sex, name] of [['male', '남자'], ['female', '여자']]) {
      const x = d[sex][i];
      tip.append(h('div', { class: 'pyr-tip-r' },
        h('span', { class: 'pyr-tip-k' }, name),
        h('span', {}, `${fv(x.a)} → ${fv(x.b)}`),
        h('b', { class: x.delta >= 0 ? 'pyr-dl-more' : 'pyr-dl-less' }, fmtDelta(x.delta, st.mode))));
    }
    tip.append(h('div', { class: 'pyr-tip-n' }, `${rows[0][0]} → ${rows[1][0]}`));
    tip.hidden = false;
  }
  function moveTip(e) {
    const b = chartBox.getBoundingClientRect();
    const x = e.clientX - b.left, y = e.clientY - b.top;
    tip.style.left = `${Math.max(8, Math.min(x + 16, b.width - 240))}px`;
    tip.style.top = `${Math.max(8, y - 80)}px`;
  }

  // ---------- 세 나라 나란히 (csat-chart.js) ----------
  const TRIO = [['un392', '일본'], ['un356', '인도'], ['un634', '카타르']];
  installRoundRectPolyfill();
  const trioCards = TRIO.map(([key, name]) => {
    const canvas = h('canvas', { class: 'pyr-trio-canvas', width: 560, height: 740, role: 'img', 'aria-label': `${name} 인구 피라미드` });
    const cap = h('div', { class: 'pyr-trio-cap' });
    const card = h('div', { class: 'pyr-trio-card' }, canvas, cap);
    trioBox.append(card);
    return { key, name, canvas, cap };
  });
  trioBox.append(h('p', { class: 'pyr-trio-note' }, '세 나라 모두 같은 가로 눈금으로 그렸어요. 막대 길이를 그대로 견주어 보세요.'));
  // 캔버스는 CSS 변수를 못 읽으므로 지금 테마의 자료 색을 읽어 넘긴다(라이트 값: 흰 캔버스 위)
  const cssVar = (name, fb) => getComputedStyle(root).getPropertyValue(name).trim() || fb;
  function drawTrio() {
    titleEl.textContent = '일본, 인도, 카타르';
    subEl.textContent = `${yearText(byKey.get('un392'), st.trioYear)}, 전체 인구에서 차지하는 비율(%)`;
    drawLegend();
    const pops = trioCards.map((c) => popOf(byKey.get(c.key), st.trioYear));
    const shares = pops.map((p) => valuesFor(p, 'share'));
    const max = Math.ceil((Math.max(...shares.flatMap((v) => [...v.male, ...v.female])) * 1.08) / 2) * 2;
    const fills = [cssVar('--pyr-canvas-m', '#2563c9'), cssVar('--pyr-canvas-f', '#0f7f86')];
    trioCards.forEach((c, k) => {
      const v = shares[k];
      const ctx = c.canvas.getContext('2d');
      const options = createDefaultGraphOptions();
      Object.assign(options, { title: c.name, source: '', footnotes: [''], showLegend: true, legendPosition: 'bottom' });
      renderPyramidGraph(ctx, c.canvas.width, c.canvas.height, {
        ages: v.male.map((m, i) => ({ male: m, female: v.female[i] })),
        unit: 'percent', maleLabel: '남자', femaleLabel: '여자', axisLabel: '(%)',
        range: { max, auto: false }, ageLabelSide: 'left', numericAgeAxis: true, ageUnit: '(세)', axisLabelInline: true,
        sexFills: fills,
      }, options);
      const sct = structure(pops[k]);
      clear(c.cap);
      c.cap.append(
        h('span', {}, '0~14세 ', h('span', { class: 'pyr-cap-v' }, `${sct.young.toFixed(1)}%`)),
        h('span', {}, '15~64세 ', h('span', { class: 'pyr-cap-v' }, `${sct.work.toFixed(1)}%`)),
        h('span', {}, '65세 이상 ', h('span', { class: 'pyr-cap-v' }, `${sct.old.toFixed(1)}%`)),
      );
    });
    updateTrioSummary(pops);
  }

  // ---------- 사이드바 ----------
  const seg = (items, get, set, label) => {
    const box = h('div', { class: 'ds-seg', role: 'group', 'aria-label': label });
    const btns = items.map(([v, text]) => h('button', { class: 'ds-seg-btn', type: 'button', on: { click: () => { set(v); render(); } } }, text));
    box.append(...btns);
    box.sync = () => btns.forEach((b, k) => b.setAttribute('aria-pressed', String(get() === items[k][0])));
    return box;
  };
  /** 켜고 끄는 스위치 한 줄 (줄 전체가 눌림) */
  const toggle = (text, get, set) => {
    const knob = h('span', { class: 'pyr-switch', 'aria-hidden': 'true' }, h('span', { class: 'pyr-switch-dot' }));
    const btn = h('button', { class: 'pyr-toggle', type: 'button', role: 'switch', on: { click: () => { set(!get()); render(); } } },
      h('span', { class: 'pyr-toggle-t' }, text), knob);
    btn.sync = (disabled) => { btn.setAttribute('aria-checked', String(get())); btn.disabled = !!disabled; };
    return btn;
  };

  const shortcut = (label, fn, opts = {}) => h('button', { class: 'ds-btn pyr-short', type: 'button', disabled: !!opts.disabled, title: opts.title, on: { click: fn } }, icon('page'), label);
  const shortBtns = [
    shortcut('아시아 1990 → 2021', () => go({ view: 'overlay', key: 'un935', a: 1990, b: 2021, mode: 'share', showA: true, showB: true })),
    shortcut('일본, 인도, 카타르', () => go({ view: 'trio', trioYear: 2021 })),
    shortcut('화성시 1996 → 2022', () => huaseong && go({ view: 'overlay', key: huaseong.key, a: 1996, b: 2022, mode: 'share', showA: true, showB: true }),
      { disabled: !huaseong, title: huaseong ? '' : '화성시 주민등록 자료가 아직 들어 있지 않아요' }),
  ];
  addBlock(panel, h('div', { class: 'ds-ctl' }, h('h2', { class: 'ds-h2' }, '교과서 자료 바로 보기'), h('div', { class: 'pyr-shorts' }, ...shortBtns)));

  // 지역 고르기: 1단계(나라, 대륙, 우리나라 시도), 2단계(시군구)
  const sel1 = h('select', { class: 'pyr-select', 'aria-label': '지역', on: { change: () => { st.key = sel1.value; fixYears(); stop(); render(); } } });
  const og = new Map();
  for (const [, label] of GROUPS) if (!og.has(label)) og.set(label, h('optgroup', { label }));
  for (const r of REG.filter((x) => x.set === 'un')) og.get(GROUPS.find(([g]) => g === r.group)[1]).append(h('option', { value: r.key }, r.name));
  for (const g of og.values()) sel1.append(g);
  if (DATA.kr) {
    const k = h('optgroup', { label: '우리나라 (주민등록)' });
    for (const r of REG.filter((x) => x.set === 'kr' && !x.sido)) k.append(h('option', { value: r.key }, r.name));
    sel1.append(k);
  }
  const sel2 = h('select', { class: 'pyr-select', 'aria-label': '시군구', on: { change: () => { st.key = sel2.value; fixYears(); stop(); render(); } } });
  const sel2Wrap = h('label', { class: 'pyr-field', hidden: true }, h('span', { class: 'pyr-field-k' }, '시군구'), sel2);
  const regionBlock = addBlock(panel, h('div', { class: 'ds-ctl' }, h('h2', { class: 'ds-h2' }, '지역'),
    h('label', { class: 'pyr-field' }, h('span', { class: 'pyr-field-k' }, '나라, 지역'), sel1), sel2Wrap));

  // 연도
  const outA = h('output', { class: 'ds-out' }), outB = h('output', { class: 'ds-out' });
  const labA = h('span', {}), labB = h('span', {});
  const rangeA = h('input', { class: 'ds-range pyr-range-a', type: 'range', min: 0, max: 1, value: 0, 'aria-label': '이전 해', on: { input: () => onRange('a') } });
  const rangeB = h('input', { class: 'ds-range', type: 'range', min: 0, max: 1, value: 1, 'aria-label': '이후 해', on: { input: () => onRange('b') } });
  const playBtn = h('button', { class: 'ds-btn ds-primary', type: 'button', on: { click: () => (st.timer ? stop() : play()) } });
  const projNote = h('p', { class: 'pyr-small' }, '2024년부터는 앞으로를 내다본 추계 값이에요.');
  const yearBlock = addBlock(panel, h('div', { class: 'ds-ctl' }, h('h2', { class: 'ds-h2' }, '두 해 고르기'),
    h('label', { class: 'ds-label' }, labA, outA), rangeA,
    h('label', { class: 'ds-label' }, labB, outB), rangeB,
    playBtn, projNote));
  const outT = h('output', { class: 'ds-out' });
  const rangeT = h('input', { class: 'ds-range', type: 'range', min: 1950, max: 2100, value: 2021, 'aria-label': '해', on: { input: () => { st.trioYear = +rangeT.value; render(); } } });
  const trioBlock = addBlock(panel, h('div', { class: 'ds-ctl', hidden: true }, h('h2', { class: 'ds-h2' }, '해'),
    h('label', { class: 'ds-label' }, '보는 해', outT), rangeT,
    h('button', { class: 'ds-btn', type: 'button', on: { click: () => go({ view: 'overlay', key: 'un392', a: 1990, b: st.trioYear }) } }, icon('eye'), '한 나라씩 두 해 겹쳐 보기')));

  // 보기: 겹쳐 보기 / 나란히 비교하기, 막대 켜고 끄기
  const segView = seg([['overlay', '겹쳐 보기'], ['side', '나란히 비교하기']], () => st.view, (v) => { st.view = v; tip.hidden = true; }, '그래프 보기');
  const segMode = seg([['share', '비율(%)'], ['count', '사람 수']], () => st.mode, (v) => { st.mode = v; }, '단위');
  const tA = toggle('이전 해 막대 (흐린 막대)', () => st.showA, (v) => { st.showA = v; });
  const tB = toggle('이후 해 막대 (진한 막대)', () => st.showB, (v) => { st.showB = v; });
  const tD = toggle('늘어남, 줄어듦 표시', () => st.diff, (v) => { st.diff = v; });
  const overlayOpts = h('div', { class: 'pyr-toggles' }, tA, tB, tD);
  const viewBlock = addBlock(panel, h('div', { class: 'ds-ctl' }, h('h2', { class: 'ds-h2' }, '보기'), segView, segMode, overlayOpts));

  // 요약
  const sumBox = h('div', { class: 'pyr-sum' });
  addBlock(panel, h('div', { class: 'ds-ctl' }, h('h2', { class: 'ds-h2' }, '인구 구조 한눈에'), sumBox));
  function updateSummary(pa, pb) {
    const A = structure(pa), B = structure(pb);
    clear(sumBox);
    const row = (k, x, y, isPct = true) => {
      const dv = y - x;
      return [h('span', { class: 'pyr-sum-k' }, k), h('span', { class: 'pyr-sum-v' }, isPct ? `${x.toFixed(1)}%` : fmtCount(x)),
        h('span', { class: 'pyr-sum-v' }, isPct ? `${y.toFixed(1)}%` : fmtCount(y)),
        h('span', { class: `pyr-sum-v ${dv >= 0 ? 'pyr-dl-more' : 'pyr-dl-less'}` }, isPct ? fmtDelta(dv, 'share') : fmtDelta(dv, 'count'))];
    };
    sumBox.append(h('div', { class: 'pyr-sum-grid' },
      h('span', {}), h('span', { class: 'pyr-sum-h' }, `${st.a}`), h('span', { class: 'pyr-sum-h' }, `${st.b}`), h('span', { class: 'pyr-sum-h' }, '차이'),
      ...row('0~14세', A.young, B.young), ...row('15~64세', A.work, B.work), ...row('65세 이상', A.old, B.old),
      ...row('총인구', total(pa), total(pb), false)));
  }
  function updateTrioSummary(pops) {
    clear(sumBox);
    const g = h('div', { class: 'pyr-sum-grid pyr-sum-grid-3' }, h('span', {}), ...trioCards.map((c) => h('span', { class: 'pyr-sum-h' }, c.name)));
    const sts = pops.map(structure);
    for (const [k, f] of [['0~14세', 'young'], ['15~64세', 'work'], ['65세 이상', 'old']]) {
      g.append(h('span', { class: 'pyr-sum-k' }, k), ...sts.map((x) => h('span', { class: 'pyr-sum-v' }, `${x[f].toFixed(1)}%`)));
    }
    g.append(h('span', { class: 'pyr-sum-k' }, '총인구'), ...pops.map((p) => h('span', { class: 'pyr-sum-v' }, fmtCount(total(p)))));
    sumBox.append(g);
  }

  // 화면 밝기: 저장하지 않고 지금 화면에서만 바꾼다
  let theme = 'auto';
  const segTheme = seg([['auto', '자동'], ['light', '밝게'], ['dark', '어둡게']], () => theme, (v) => {
    theme = v;
    if (v === 'auto') root.removeAttribute('data-theme'); else root.setAttribute('data-theme', v);
  }, '화면 밝기');
  addBlock(panel, h('div', { class: 'ds-ctl' }, h('h2', { class: 'ds-h2' }, '화면 밝기'), segTheme));

  addBlock(panel, h('div', { class: 'ds-note pyr-small' },
    h('b', {}, '자료 출처'), h('br'),
    '나라와 대륙: 국제 연합(UN) 세계 인구 전망 2024 (중위 추계, 1950~2100년). 2024년부터는 추계.', h('br'),
    '우리나라 시도, 시군구: 국가데이터처 KOSIS 주민등록연앙인구(시군구, 성, 5세별). 옛 해는 85세 이상을 한 칸으로 묶어 비교.'));

  // 「보기」(겹쳐 보기, 나란히 비교하기, 막대 켜고 끄기)는 가장 자주 누르므로 사이드바 맨 위(제목 바로 아래)로 올린다
  panel.insertBefore(viewBlock, panel.children[1]);

  // ---------- 상태 바꾸기 ----------
  function fixYears() {
    const r = byKey.get(st.key);
    const ys = yearsOf(r);
    const near = (y) => ys.reduce((best, v) => (Math.abs(v - y) < Math.abs(best - y) ? v : best), ys[0]);
    st.a = near(st.a); st.b = near(st.b);
    if (st.a === st.b) { const k = ys.indexOf(st.a); if (k > 0) st.a = ys[k - 1]; else if (ys.length > 1) st.b = ys[1]; }
  }
  function onRange(which) {
    const ys = yearsOf(byKey.get(st.key));
    stop();
    st[which] = ys[+(which === 'a' ? rangeA : rangeB).value];
    render();
  }
  function go(next) { stop(); Object.assign(st, next); if (st.view !== 'trio') fixYears(); render(); }
  function play() {
    const r = byKey.get(st.key);
    const ys = yearsOf(r).filter((y) => y > st.a);
    if (!ys.length) return;
    let k = 0;
    st.b = ys[0];
    render();
    st.timer = setInterval(() => {
      k++;
      if (k >= ys.length || !root.isConnected) { stop(); return; }
      st.b = ys[k];
      render();
    }, PLAY_MS[r.set]);
    syncPlay();
  }
  function stop() { if (st.timer) clearInterval(st.timer); st.timer = 0; syncPlay(); }
  function syncPlay() { clear(playBtn); playBtn.append(icon(st.timer ? 'pause' : 'play'), st.timer ? '멈추기' : '이후 해 넘겨 보기'); }

  function syncControls() {
    const trio = st.view === 'trio';
    chartBox.hidden = trio; trioBox.hidden = !trio;
    regionBlock.hidden = trio; yearBlock.hidden = trio; trioBlock.hidden = !trio; viewBlock.hidden = trio;
    shortBtns[1].setAttribute('aria-pressed', String(trio));
    segTheme.sync();
    if (trio) { rangeT.value = st.trioYear; outT.textContent = yearText(byKey.get('un392'), st.trioYear); return; }
    const r = byKey.get(st.key);
    const top = r.set === 'kr' && r.sido ? byKey.get(r.sido) : r;
    sel1.value = top.key;
    sel2Wrap.hidden = !(top.set === 'kr' && top.children.length);
    if (!sel2Wrap.hidden) {
      clear(sel2);
      sel2.append(h('option', { value: top.key }, `${top.name} 전체`), ...top.children.map((c) => h('option', { value: c.key }, c.name)));
      sel2.value = r.key;
    }
    const ys = yearsOf(r);
    rangeA.max = rangeB.max = ys.length - 1;
    rangeA.value = ys.indexOf(st.a); rangeB.value = ys.indexOf(st.b);
    outA.textContent = yearText(r, st.a); outB.textContent = yearText(r, st.b);
    const side = st.view === 'side';
    labA.textContent = side ? '이전 해 (왼쪽)' : '이전 해 (흐린 막대)';
    labB.textContent = side ? '이후 해 (오른쪽)' : '이후 해 (진한 막대)';
    projNote.hidden = r.set !== 'un';
    segView.sync(); segMode.sync();
    overlayOpts.hidden = side;
    tA.sync(); tB.sync(); tD.sync(!(st.showA && st.showB));
  }
  function render() {
    syncControls();
    if (st.view === 'trio') drawTrio();
    else {
      svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
      if (st.view === 'side') drawSide(); else drawOverlay();
    }
  }

  // 무대 크기가 바뀌면(창 크기, 태블릿 방향) 실제 픽셀 크기로 다시 그린다. 고른 값은 그대로
  if (typeof ResizeObserver === 'function') {
    new ResizeObserver((entries) => {
      const b = entries[0].contentRect;
      const w = Math.round(b.width), hh = Math.round(b.height);
      if (w > 0 && hh > 0 && (w !== W || hh !== H)) { W = w; H = hh; if (st.view !== 'trio') render(); }
    }).observe(chartBox);
  }
  syncPlay();
  render();
}
