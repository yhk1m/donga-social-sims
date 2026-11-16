// © 2026 김용현
// 인구 피라미드 비교 (사회1 36~37쪽, 통합사회1 142쪽)
//   두 해를 한 축에 겹쳐 그린다: 이전 해 = 흐린 막대(옅은 채움 + 테두리), 이후 해 = 진한 막대.
//   이후 해가 더 많은 부분은 「늘어남」 색, 모자란 부분은 「줄어듦」 빗금, 막대 끝에 차이 숫자(%p 또는 사람 수).
//   「일본, 인도, 카타르」 세 나라 나란히 보기는 csat-chart.js 의 renderPyramidGraph(저수준 렌더러)로 그린다.
//   겹쳐 그리기는 라이브러리로 되지 않아 SVG 로 직접 그린다: renderPyramidGraph 는 부를 때마다 캔버스를 흰색으로 지우고(clearCanvas)
//   자료 한 벌만 받으며 막대 좌표를 돌려주지 않아, 두 해를 겹치거나 늘어남/줄어듦 칸과 차이 숫자를 막대에 맞춰 얹을 수 없다.
// 규칙(EMBED_RULES.md): DOM 은 h()/s() 로만, 검색은 root 안에서만, 자료는 정적 import.
import { createShell, addBlock } from '../../src/shared/shell.js';
import { h, s, icon, clear } from '../../src/shared/dom.js';
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
  const pid = `pyr${++uid}`;
  const { list: REG, byKey } = buildRegions();
  const huaseong = REG.find((r) => r.set === 'kr' && r.name === '화성시');

  const st = { key: 'un935', a: 1990, b: 2021, mode: 'share', view: 'compare', diff: true, trioYear: 2021, timer: 0 };

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
  const W = 960, H = 640;
  const svg = h('svg', { class: 'pyr-svg', viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'xMidYMid meet', role: 'img', 'aria-label': '두 해 인구 피라미드 겹쳐 보기' });
  const tip = h('div', { class: 'pyr-tip', hidden: true });
  const chartBox = h('div', { class: 'pyr-chart' }, svg, tip);
  const trioBox = h('div', { class: 'pyr-trio', hidden: true });
  stage.append(head, chartBox, trioBox);

  // 빗금 무늬(줄어듦)
  const hatchId = `${pid}-hatch`;
  const defs = h('defs', {},
    s('pattern', { id: hatchId, width: 6, height: 6, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' },
      h('rect', { width: 6, height: 6, class: 'pyr-hatch-bg' }),
      h('line', { x1: 0, y1: 0, x2: 0, y2: 6, class: 'pyr-hatch-line' })));
  const gPlot = h('g', {});
  svg.append(defs, gPlot);

  const sw = (cls, text, extra) => h('span', { class: 'pyr-key' }, h('span', { class: `pyr-sw ${cls}`, ...extra }), text);
  function drawLegend(r) {
    clear(legend);
    if (st.view === 'trio') return;
    legend.append(
      sw('pyr-sw-a', `${st.a}년 (흐린 막대)`),
      sw('pyr-sw-b', `${st.b}년 (진한 막대)`),
    );
    if (st.diff) {
      const hatch = h('svg', { class: 'pyr-sw-svg', viewBox: '0 0 14 14' }, h('rect', { width: 14, height: 14, fill: `url(#${hatchId})`, class: 'pyr-sw-hatch' }));
      legend.append(sw('pyr-sw-more', '늘어남'), h('span', { class: 'pyr-key' }, hatch, '줄어듦'));
    }
  }

  // ---------- 겹친 피라미드(SVG) ----------
  function drawCompare() {
    const r = byKey.get(st.key);
    let pa = popOf(r, st.a), pb = popOf(r, st.b);
    clear(gPlot);
    titleEl.textContent = fullName(r);
    subEl.textContent = `${yearText(r, st.a)}과 ${yearText(r, st.b)} 비교, ${st.mode === 'share' ? '전체 인구에서 차지하는 비율(%)' : '사람 수'}`;
    drawLegend(r);
    if (!pa || !pb) { gPlot.append(h('text', { x: W / 2, y: H / 2, class: 'pyr-empty' }, '이 해에는 자료가 없어요')); return; }
    // 옛 자료가 '85세 이상' 한 칸뿐이면 두 해 모두 그 칸으로 합친다
    const band = Math.min(topBand(r, st.a), topBand(r, st.b));
    pa = collapseTop(pa, band); pb = collapseTop(pb, band);
    const n = band + 1;
    const labels = ageLabels(n);
    const va = valuesFor(pa, st.mode), vb = valuesFor(pb, st.mode);
    const d = diffBands(va, vb);
    const vmax = niceMax(Math.max(...va.male, ...va.female, ...vb.male, ...vb.female));
    const step = tickStep(vmax);
    const top = 34, bottom = 46, side = 78, gap = 64;
    const plotH = H - top - bottom;
    const half = (W - 2 * side - gap) / 2;
    const cx = W / 2, mx0 = cx - gap / 2, fx0 = cx + gap / 2;
    const rowH = plotH / n, barH = rowH * 0.78;
    const sx = (v) => (v / vmax) * half;
    const minLabel = st.mode === 'share' ? 0.05 : vmax * 0.004;

    // 눈금
    const grid = h('g', { class: 'pyr-grid' });
    for (let v = 0; v <= vmax + 1e-9; v += step) {
      for (const x of v === 0 ? [mx0, fx0] : [mx0 - sx(v), fx0 + sx(v)]) {
        grid.append(h('line', { x1: x, x2: x, y1: top, y2: top + plotH, class: v === 0 ? 'pyr-axis' : 'pyr-gridline' }));
        grid.append(h('text', { x, y: top + plotH + 18, class: 'pyr-tick' }, st.mode === 'share' ? (Math.round(v * 100) / 100).toString() : fmtCount(v)));
      }
    }
    grid.append(h('text', { x: W - side + 50, y: top + plotH + 18, class: 'pyr-unit' }, st.mode === 'share' ? '(%)' : '(명)'));
    grid.append(h('text', { x: cx, y: top + plotH + 18, class: 'pyr-unit pyr-unit-c' }, '(세)'));
    grid.append(h('text', { x: mx0 - 6, y: top - 12, class: 'pyr-sex pyr-sex-m' }, '남자'));
    grid.append(h('text', { x: fx0 + 6, y: top - 12, class: 'pyr-sex pyr-sex-f' }, '여자'));
    gPlot.append(grid);

    const bars = h('g', {});
    for (let i = 0; i < n; i++) {
      const y = top + (n - 1 - i) * rowH + (rowH - barH) / 2;
      const row = h('g', { class: 'pyr-row' });
      for (const sex of ['male', 'female']) {
        const x = d[sex][i];
        const left = sex === 'male';
        // 막대 하나를 [시작, 끝] 길이로 그리기 (남자는 왼쪽으로 뻗음)
        const rect = (v0, v1, cls, extra) => {
          const w = sx(v1) - sx(v0);
          if (w <= 0.01) return null;
          const xx = left ? mx0 - sx(v1) : fx0 + sx(v0);
          return h('rect', { x: xx, y, width: w, height: barH, class: cls, ...extra });
        };
        const sc = left ? 'm' : 'f';
        row.append(...[
          rect(0, x.a, `pyr-a pyr-a-${sc}`),
          rect(0, st.diff ? x.common : x.b, `pyr-b pyr-b-${sc}`),
          st.diff ? rect(x.common, x.b, 'pyr-more') : null,
          st.diff ? rect(x.b, x.a, 'pyr-less', { fill: `url(#${hatchId})` }) : null,
          st.diff ? rect(0, x.a, `pyr-a-edge pyr-a-${sc}-edge`) : null,
        ].filter(Boolean));
        if (st.diff && Math.abs(x.delta) >= minLabel) {
          const end = sx(Math.max(x.a, x.b)) + 4;
          row.append(h('text', {
            x: left ? mx0 - end : fx0 + end, y: y + barH / 2,
            class: `pyr-dlabel ${x.delta > 0 ? 'pyr-dl-more' : 'pyr-dl-less'}`, 'text-anchor': left ? 'end' : 'start',
          }, fmtDelta(x.delta, st.mode)));
        }
      }
      row.append(h('text', { x: cx, y: top + (n - 1 - i) * rowH + rowH / 2, class: 'pyr-age' }, labels[i]));
      const hit = h('rect', { x: side - 70, y: top + (n - 1 - i) * rowH, width: W - 2 * side + 140, height: rowH, class: 'pyr-hit' });
      hit.addEventListener('pointerenter', () => { row.classList.add('pyr-row-on'); showTip(r, i, labels[i], d); });
      hit.addEventListener('pointerleave', () => { row.classList.remove('pyr-row-on'); tip.hidden = true; });
      hit.addEventListener('pointermove', (e) => moveTip(e));
      row.append(hit);
      bars.append(row);
    }
    gPlot.append(bars);
    updateSummary(r, pa, pb);
  }

  const fv = (v) => (st.mode === 'share' ? `${v.toFixed(1)}%` : `${Math.round(v).toLocaleString('ko-KR')}명`);
  function showTip(r, i, label, d) {
    clear(tip);
    tip.append(h('div', { class: 'pyr-tip-t' }, `${label.endsWith('+') ? label.replace('+', '세 이상') : `${label}세`}`));
    for (const [sex, name] of [['male', '남자'], ['female', '여자']]) {
      const x = d[sex][i];
      tip.append(h('div', { class: 'pyr-tip-r' },
        h('span', { class: 'pyr-tip-k' }, name),
        h('span', {}, `${fv(x.a)} → ${fv(x.b)}`),
        h('b', { class: x.delta >= 0 ? 'pyr-dl-more' : 'pyr-dl-less' }, fmtDelta(x.delta, st.mode))));
    }
    tip.hidden = false;
  }
  function moveTip(e) {
    const b = chartBox.getBoundingClientRect();
    const x = e.clientX - b.left, y = e.clientY - b.top;
    tip.style.left = `${Math.min(x + 16, b.width - 230)}px`;
    tip.style.top = `${Math.max(8, y - 70)}px`;
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
  function drawTrio() {
    titleEl.textContent = '일본, 인도, 카타르';
    subEl.textContent = `${yearText(byKey.get('un392'), st.trioYear)}, 전체 인구에서 차지하는 비율(%)`;
    drawLegend();
    const pops = trioCards.map((c) => popOf(byKey.get(c.key), st.trioYear));
    const shares = pops.map((p) => valuesFor(p, 'share'));
    const max = Math.ceil((Math.max(...shares.flatMap((v) => [...v.male, ...v.female])) * 1.08) / 2) * 2;
    trioCards.forEach((c, k) => {
      const v = shares[k];
      const ctx = c.canvas.getContext('2d');
      const options = createDefaultGraphOptions();
      Object.assign(options, { title: c.name, source: '', footnotes: [''], showLegend: true, legendPosition: 'bottom' });
      renderPyramidGraph(ctx, c.canvas.width, c.canvas.height, {
        ages: v.male.map((m, i) => ({ male: m, female: v.female[i] })),
        unit: 'percent', maleLabel: '남자', femaleLabel: '여자', axisLabel: '(%)',
        range: { max, auto: false }, ageLabelSide: 'left', numericAgeAxis: true, ageUnit: '(세)', axisLabelInline: true,
        sexFills: ['#7fa6d9', '#e59aa8'],
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
  const shortcut = (label, fn, opts = {}) => h('button', { class: 'ds-btn pyr-short', type: 'button', disabled: !!opts.disabled, title: opts.title, on: { click: fn } }, icon('page'), label);
  const shortBtns = [
    shortcut('아시아 1990 → 2021', () => go({ view: 'compare', key: 'un935', a: 1990, b: 2021, mode: 'share' })),
    shortcut('일본, 인도, 카타르', () => go({ view: 'trio', trioYear: 2021 })),
    shortcut('화성시 1996 → 2022', () => huaseong && go({ view: 'compare', key: huaseong.key, a: 1996, b: 2022, mode: 'share' }),
      { disabled: !huaseong, title: huaseong ? '' : '화성시 주민등록 자료가 아직 들어 있지 않아요' }),
  ];
  addBlock(panel, h('div', { class: 'ds-ctl' }, h('h2', { class: 'ds-h2' }, '교과서 자료 바로 보기'), h('div', { class: 'pyr-shorts' }, ...shortBtns)));

  // 지역 고르기: 1단계(나라, 대륙, 우리나라 시도), 2단계(시군구)
  const sel1 = h('select', { class: 'pyr-select', 'aria-label': '지역', on: { change: () => { st.key = sel1.value; fixYears(); stop(); render(); } } });
  const og = new Map();
  for (const [g, label] of GROUPS) if (!og.has(label)) og.set(label, h('optgroup', { label }));
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
  const rangeA = h('input', { class: 'ds-range pyr-range-a', type: 'range', min: 0, max: 1, value: 0, 'aria-label': '이전 해', on: { input: () => onRange('a') } });
  const rangeB = h('input', { class: 'ds-range', type: 'range', min: 0, max: 1, value: 1, 'aria-label': '이후 해', on: { input: () => onRange('b') } });
  const playBtn = h('button', { class: 'ds-btn ds-primary', type: 'button', on: { click: () => (st.timer ? stop() : play()) } });
  const projNote = h('p', { class: 'pyr-small' }, '2024년부터는 앞으로를 내다본 추계 값이에요.');
  const yearBlock = addBlock(panel, h('div', { class: 'ds-ctl' }, h('h2', { class: 'ds-h2' }, '두 해 고르기'),
    h('label', { class: 'ds-label' }, '이전 해 (흐린 막대)', outA), rangeA,
    h('label', { class: 'ds-label' }, '이후 해 (진한 막대)', outB), rangeB,
    playBtn, projNote));
  const outT = h('output', { class: 'ds-out' });
  const rangeT = h('input', { class: 'ds-range', type: 'range', min: 1950, max: 2100, value: 2021, 'aria-label': '해', on: { input: () => { st.trioYear = +rangeT.value; render(); } } });
  const trioBlock = addBlock(panel, h('div', { class: 'ds-ctl', hidden: true }, h('h2', { class: 'ds-h2' }, '해'),
    h('label', { class: 'ds-label' }, '보는 해', outT), rangeT,
    h('button', { class: 'ds-btn', type: 'button', on: { click: () => go({ view: 'compare', key: 'un392', a: 1990, b: st.trioYear }) } }, icon('eye'), '한 나라씩 두 해 겹쳐 보기')));

  // 보기
  const seg = (items, get, set) => {
    const box = h('div', { class: 'ds-seg' });
    const btns = items.map(([v, label]) => h('button', { class: 'ds-seg-btn', type: 'button', on: { click: () => { set(v); render(); } } }, label));
    box.append(...btns);
    box.sync = () => btns.forEach((b, k) => b.setAttribute('aria-pressed', String(get() === items[k][0])));
    return box;
  };
  const segMode = seg([['share', '비율(%)로 보기'], ['count', '사람 수로 보기']], () => st.mode, (v) => { st.mode = v; });
  const diffChk = h('input', { type: 'checkbox', class: 'pyr-check', checked: true, on: { change: () => { st.diff = diffChk.checked; render(); } } });
  const viewBlock = addBlock(panel, h('div', { class: 'ds-ctl' }, h('h2', { class: 'ds-h2' }, '보기'), segMode,
    h('label', { class: 'ds-check' }, diffChk, '늘어남, 줄어듦 표시')));

  // 요약
  const sumBox = h('div', { class: 'pyr-sum' });
  addBlock(panel, h('div', { class: 'ds-ctl' }, h('h2', { class: 'ds-h2' }, '인구 구조 한눈에'), sumBox));
  function updateSummary(r, pa, pb) {
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
    const g = h('div', { class: 'pyr-sum-grid' }, h('span', {}), ...trioCards.map((c) => h('span', { class: 'pyr-sum-h' }, c.name)));
    const sts = pops.map(structure);
    for (const [k, f] of [['0~14세', 'young'], ['15~64세', 'work'], ['65세 이상', 'old']]) {
      g.append(h('span', { class: 'pyr-sum-k' }, k), ...sts.map((x) => h('span', { class: 'pyr-sum-v' }, `${x[f].toFixed(1)}%`)));
    }
    g.append(h('span', { class: 'pyr-sum-k' }, '총인구'), ...pops.map((p) => h('span', { class: 'pyr-sum-v' }, fmtCount(total(p)))));
    sumBox.append(g);
  }

  addBlock(panel, h('div', { class: 'ds-note pyr-small' },
    h('b', {}, '자료 출처'), h('br'),
    '나라와 대륙: 국제 연합(UN) 세계 인구 전망 2024 (중위 추계, 1950~2100년). 2024년부터는 추계.', h('br'),
    '우리나라 시도, 시군구: 국가데이터처 KOSIS 주민등록연앙인구(시군구, 성, 5세별). 옛 해는 85세 이상을 한 칸으로 묶어 비교.'));

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
  function go(next) { stop(); Object.assign(st, next); if (st.view === 'compare') fixYears(); render(); }
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
  function syncPlay() { clear(playBtn); playBtn.append(icon(st.timer ? 'pause' : 'play'), st.timer ? '멈춤' : '재생 (이후 해 넘기기)'); }

  function syncControls() {
    const trio = st.view === 'trio';
    chartBox.hidden = trio; trioBox.hidden = !trio;
    regionBlock.hidden = trio; yearBlock.hidden = trio; trioBlock.hidden = !trio; viewBlock.hidden = trio;
    shortBtns[1].setAttribute('aria-pressed', String(trio));
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
    projNote.hidden = r.set !== 'un';
    segMode.sync();
  }
  function render() {
    syncControls();
    if (st.view === 'trio') drawTrio(); else drawCompare();
  }
  syncPlay();
  render();
}
