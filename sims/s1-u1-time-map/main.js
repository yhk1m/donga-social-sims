// © 2026 김용현
// 줄어드는 지도: 교통수단과 시간 거리 (사회1 13쪽 자료2)
// 서울에서 각 도시까지 걸리는 시간에 비례하도록 지도를 휘게 그린다(방향은 그대로, 거리만 시간으로) = 시간 카토그램.
// 계산부는 warp.js(Node 시험), 자료는 data/*.js. 규칙(EMBED_RULES.md): DOM 은 h() 로만, 검색은 root 안에서만.
import { createShell, addBlock } from '../../src/shared/shell.js';
import { h, s, icon, clear } from '../../src/shared/dom.js';
import './style.css';
import MAP from './data/map.js';
import { MODES, timesFor, SOURCES } from './data/times.js';
import { makeControls, warpFlat, lerpFlat, easeInOut, bounds, formatMinutes } from './warp.js';

const DURATION = 800;
// 이 자료에서만 쓰는 선 아이콘(24x24)
const LOCAL_ICONS = {
  map: [['polygon', { points: '1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6' }], ['line', { x1: 8, y1: 2, x2: 8, y2: 18 }], ['line', { x1: 16, y1: 6, x2: 16, y2: 22 }]],
  walk: [['circle', { cx: 13, cy: 4, r: 2 }], ['path', { d: 'M9 21l2.5-7 2.5 2.5V21' }], ['path', { d: 'M11.5 14l1-5.5L9 10l-1 3.5' }], ['path', { d: 'M12.5 8.5l2.5 3 3 1' }]],
  car: [['path', { d: 'M3 16v-4l2.2-5h13.6l2.2 5v4z' }], ['line', { x1: 3, y1: 12, x2: 21, y2: 12 }], ['circle', { cx: 7.5, cy: 17.5, r: 1.8 }], ['circle', { cx: 16.5, cy: 17.5, r: 1.8 }]],
  train: [['rect', { x: 6, y: 3, width: 12, height: 13, rx: 3 }], ['line', { x1: 6, y1: 10, x2: 18, y2: 10 }], ['line', { x1: 9, y1: 13, x2: 9.01, y2: 13 }], ['line', { x1: 15, y1: 13, x2: 15.01, y2: 13 }], ['line', { x1: 9, y1: 16, x2: 7, y2: 21 }], ['line', { x1: 15, y1: 16, x2: 17, y2: 21 }]],
  plane: [['path', { d: 'M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z' }]],
};
const licon = (name) => s('svg', { class: 'ds-icon', viewBox: '0 0 24 24', 'aria-hidden': 'true' }, LOCAL_ICONS[name].map(([t, a]) => s(t, a)));

const pathD = (arr, close) => {
  let d = '';
  for (let i = 0; i < arr.length; i += 2) d += (i ? 'L' : 'M') + arr[i].toFixed(1) + ',' + arr[i + 1].toFixed(1);
  return close ? d + 'Z' : d;
};

export default function mount(root) {
  const { stage, panel } = createShell(root, 's1-u1-time-map');
  stage.classList.add('tm-stage');

  const cities = MAP.cities;
  const seoul = cities.find((c) => c.id === 'seoul');
  const busan = cities.find((c) => c.id === 'busan');
  const O = [seoul.x, seoul.y];
  const rBusan = Math.hypot(busan.x - O[0], busan.y - O[1]);
  const cityFlat = cities.flatMap((c) => [c.x, c.y]);

  // 원래 좌표 묶음: 땅 고리들, 해안선, 경계선, 도시
  const base = {
    land: MAP.land.map((l) => l.rings.map((r) => Float64Array.from(r))),
    coast: MAP.coast.map((l) => Float64Array.from(l)),
    borders: MAP.borders.map((l) => Float64Array.from(l)),
    cities: Float64Array.from(cityFlat),
  };

  const state = { mode: 'real', ktxAfter: true, ghost: true, hover: null };
  const cache = new Map();

  // 수단(+강릉선 선택)에 맞는 변형 좌표 계산(한 번 계산하면 저장)
  function target(mode, ktxAfter) {
    const key = mode + (mode === 'ktx' ? (ktxAfter ? '+' : '-') : '');
    if (cache.has(key)) return cache.get(key);
    let out;
    if (mode === 'real') {
      out = { ...base, k: 1 / MAP.kmPerPx, times: null };
    } else {
      const times = timesFor(mode, { ktxAfter });
      const k = rBusan / times.busan.min; // 서울~부산 거리는 그대로 두는 축척(px / 분)
      const ctl = makeControls(O, cities.map((c) => ({ x: c.x, y: c.y, t: times[c.id]?.min ?? null })), k);
      const w = (a) => warpFlat(a, O, ctl);
      out = { land: base.land.map((rs) => rs.map(w)), coast: base.coast.map(w), borders: base.borders.map(w), cities: w(base.cities), k, times };
    }
    const b = bounds([...out.land.flat(), out.cities]);
    const pad = 28;
    out.vb = [b[0] - pad, b[1] - pad, b[2] - b[0] + pad * 2, b[3] - b[1] + pad * 2];
    cache.set(key, out);
    return out;
  }

  // ---------- 무대: SVG ----------
  const gGhost = h('g', { class: 'tm-ghost' }, MAP.coast.map((l) => h('path', { d: pathD(l) })));
  const landEls = MAP.land.map(() => h('path', { class: 'tm-land' }));
  const bordersEl = h('path', { class: 'tm-border' });
  const coastEl = h('path', { class: 'tm-coast' });
  const gRings = h('g', { class: 'tm-rings' });
  const cityEls = cities.map((c, i) => {
    const isSeoul = c.id === 'seoul';
    const dot = isSeoul ? h('rect', { class: 'tm-seoul', x: -6, y: -6, width: 12, height: 12 }) : h('circle', { class: 'tm-dot', r: 4.5 });
    const label = h('text', { class: 'tm-label', x: 8, y: -7 }, c.name);
    const g = h('g', { class: 'tm-city' + (isSeoul ? ' is-seoul' : ''), dataset: { i } }, h('g', { class: 'tm-cin' }, dot, label));
    g.addEventListener('pointerenter', () => showTip(i));
    g.addEventListener('pointerleave', () => hideTip(i));
    g.addEventListener('click', () => (state.hover === i ? hideTip(i) : showTip(i)));
    return g;
  });
  const svg = h('svg', { class: 'tm-map', role: 'img', 'aria-label': '서울에서 걸리는 시간에 따라 휘는 우리나라 지도', preserveAspectRatio: 'xMidYMid meet' },
    h('rect', { class: 'tm-sea', x: -5000, y: -5000, width: 10000, height: 10000 }),
    h('g', {}, landEls), gGhost, bordersEl, coastEl, gRings, h('g', {}, cityEls));

  const capTitle = h('div', { class: 'tm-cap-title' });
  const capSub = h('div', { class: 'tm-cap-sub' });
  const tip = h('div', { class: 'tm-tip', hidden: true });
  stage.append(svg, h('div', { class: 'tm-cap' }, capTitle, capSub), tip);

  // 현재 그려진 좌표(보간 중간값)
  let cur = target('real', true);
  let curVB = cur.vb.slice();
  // 화면 1px 이 viewBox 단위로 얼마인지(preserveAspectRatio meet)
  const unitFor = (vb) => Math.max(vb[2] / (svg.clientWidth || 900), vb[3] / (svg.clientHeight || 800));
  function draw(geo, vb) {
    geo.land.forEach((rings, i) => landEls[i].setAttribute('d', rings.map((r) => pathD(r, true)).join('')));
    bordersEl.setAttribute('d', geo.borders.map((l) => pathD(l)).join(''));
    coastEl.setAttribute('d', geo.coast.map((l) => pathD(l)).join(''));
    cityEls.forEach((g, i) => g.setAttribute('transform', `translate(${geo.cities[2 * i].toFixed(1)},${geo.cities[2 * i + 1].toFixed(1)})`));
    svg.setAttribute('viewBox', vb.map((v) => v.toFixed(1)).join(' '));
    // 글자와 선 굵기가 확대·축소에 끌려가지 않게 viewBox 크기에 맞춘 배율을 CSS 변수로
    const unit = unitFor(vb);
    svg.style.setProperty('--u', unit.toFixed(3));
  }

  // 동심원: 수단마다 눈금 단위가 다르다
  function drawRings(geo, mode, vb) {
    clear(gRings);
    const m = MODES[mode];
    const stepPx = mode === 'real' ? m.ringKm / MAP.kmPerPx : m.ringMin * geo.k;
    const corners = [[vb[0], vb[1]], [vb[0] + vb[2], vb[1]], [vb[0], vb[1] + vb[3]], [vb[0] + vb[2], vb[1] + vb[3]]];
    const maxR = Math.max(...corners.map(([x, y]) => Math.hypot(x - O[0], y - O[1])));
    const n = Math.min(40, Math.floor(maxR / stepPx));
    const fs = unitFor(vb);
    for (let j = 1; j <= n; j++) {
      const r = j * stepPx;
      gRings.append(h('circle', { class: 'tm-ring' + (j % m.major === 0 ? ' is-major' : ''), cx: O[0], cy: O[1], r: r.toFixed(1) }));
      if (j % m.labelEvery === 0 || n <= 6) {
        const lx = O[0] + r * Math.cos(-Math.PI / 5), ly = O[1] + r * Math.sin(-Math.PI / 5);
        gRings.append(h('text', { class: 'tm-ring-label', x: lx.toFixed(1), y: ly.toFixed(1), 'font-size': (13 * fs).toFixed(1) }, m.ringLabel(j)));
      }
    }
  }

  function updateCities(geo) {
    cityEls.forEach((g, i) => {
      const id = cities[i].id;
      const off = geo.times && id !== 'seoul' && geo.times[id]?.min == null;
      g.classList.toggle('is-off', !!off);
    });
  }

  function setCaption() {
    const m = MODES[state.mode];
    capTitle.textContent = m.title;
    capSub.textContent = m.sub + (state.mode === 'ktx' ? (state.ktxAfter ? ' (강릉선 개통 후)' : ' (강릉선 개통 전)') : '');
  }

  let anim = 0;
  let lastDrawn = cur;
  function go() {
    const to = target(state.mode, state.ktxAfter);
    const from = cur, fromVB = curVB.slice();
    cancelAnimationFrame(anim);
    gRings.classList.add('is-hidden');
    updateCities(to);
    setCaption();
    refreshTip();
    const t0 = performance.now();
    const mid = { land: from.land.map((rs) => rs.map((r) => new Float64Array(r.length))), coast: from.coast.map((l) => new Float64Array(l.length)), borders: from.borders.map((l) => new Float64Array(l.length)), cities: new Float64Array(from.cities.length) };
    const step = (now) => {
      const t = easeInOut(Math.min(1, (now - t0) / DURATION));
      from.land.forEach((rs, i) => rs.forEach((r, j) => lerpFlat(r, to.land[i][j], t, mid.land[i][j])));
      from.coast.forEach((l, i) => lerpFlat(l, to.coast[i], t, mid.coast[i]));
      from.borders.forEach((l, i) => lerpFlat(l, to.borders[i], t, mid.borders[i]));
      lerpFlat(from.cities, to.cities, t, mid.cities);
      const vb = fromVB.map((v, i) => v + (to.vb[i] - v) * t);
      draw(mid, vb);
      if (t < 1) { anim = requestAnimationFrame(step); return; }
      cur = to; curVB = to.vb.slice(); lastDrawn = to;
      draw(to, curVB);
      drawRings(to, state.mode, curVB);
      gRings.classList.remove('is-hidden');
      refreshTip();
    };
    anim = requestAnimationFrame(step);
  }

  // ---------- 말풍선: 실제 거리와 수단별 시간 ----------
  function tipTable(i) {
    const c = cities[i];
    const rows = ['walk', 'car', 'ktx', 'air'].map((mode) => {
      const t = timesFor(mode, { ktxAfter: state.ktxAfter })[c.id];
      const m = MODES[mode];
      const val = t?.min == null ? '바로 갈 수 없음' : formatMinutes(t.min, { days: mode === 'walk' }) + (t.est ? ' (추정)' : '');
      return h('tr', { class: 'tm-tip-row' + (mode === state.mode ? ' is-cur' : '') },
        h('th', { class: 'tm-tip-k' }, m.name), h('td', { class: 'tm-tip-v' + (t?.min == null ? ' is-none' : '') }, val));
    });
    const road = timesFor('car', {})[c.id];
    return [
      h('div', { class: 'tm-tip-name' }, c.name),
      h('div', { class: 'tm-tip-km' }, `서울에서 직선 거리 약 ${c.km}km`, road?.km ? `, 도로 거리 약 ${road.km}km` : ''),
      h('table', { class: 'tm-tip-table' }, h('tbody', {}, rows)),
      timesFor('ktx', { ktxAfter: state.ktxAfter })[c.id]?.note ? h('div', { class: 'tm-tip-note' }, timesFor('ktx', { ktxAfter: state.ktxAfter })[c.id].note) : null,
    ];
  }
  function showTip(i) {
    if (cities[i].id === 'seoul') { hideTip(); return; }
    state.hover = i;
    cityEls.forEach((g, j) => g.classList.toggle('is-hover', j === i));
    clear(tip).append(...tipTable(i).filter(Boolean));
    tip.hidden = false;
    placeTip();
  }
  function placeTip() {
    if (state.hover == null) return;
    const sr = stage.getBoundingClientRect();
    const cr = cityEls[state.hover].firstChild.firstChild.getBoundingClientRect();
    const x = cr.left + cr.width / 2 - sr.left, y = cr.top + cr.height / 2 - sr.top;
    const tw = tip.offsetWidth, th = tip.offsetHeight;
    let left = x + 16, top = y - th / 2;
    if (left + tw > sr.width - 8) left = x - tw - 16;
    top = Math.max(8, Math.min(sr.height - th - 8, top));
    tip.style.left = `${left}px`; tip.style.top = `${top}px`;
  }
  function hideTip(i) {
    if (i != null && state.hover !== i) return;
    state.hover = null;
    cityEls.forEach((g) => g.classList.remove('is-hover'));
    tip.hidden = true;
  }
  function refreshTip() { if (state.hover != null) showTip(state.hover); }

  // ---------- 사이드바 ----------
  const modeBtns = {};
  const modeList = h('div', { class: 'tm-modes', role: 'group', 'aria-label': '교통수단' },
    ['real', 'walk', 'car', 'ktx', 'air'].map((mode) => {
      const m = MODES[mode];
      const b = h('button', { class: 'tm-mode', type: 'button', 'aria-pressed': 'false', on: { click: () => { state.mode = mode; syncButtons(); go(); } } },
        licon(m.icon), h('span', { class: 'tm-mode-name' }, m.button), h('span', { class: 'tm-mode-time' }, m.busanText));
      modeBtns[mode] = b;
      return b;
    }));
  addBlock(panel, h('div', { class: 'tm-sec' }, h('h2', { class: 'ds-h2' }, '무엇을 타고 갈까?'), modeList,
    h('p', { class: 'tm-hint' }, '오른쪽 숫자는 서울에서 부산까지 걸리는 시간이에요(교과서 수치).')));

  const ktxBtns = {};
  const ktxSeg = h('div', { class: 'ds-seg' }, [['before', '개통 전'], ['after', '개통 후']].map(([k, label]) => {
    const b = h('button', { class: 'ds-seg-btn', type: 'button', 'aria-pressed': 'false', on: { click: () => {
      state.ktxAfter = k === 'after'; syncButtons();
      if (state.mode === 'ktx') go(); else refreshTip();
    } } }, label);
    ktxBtns[k] = b;
    return b;
  }));
  const gn = () => timesFor('ktx', { ktxAfter: state.ktxAfter }).gangneung;
  const ktxInfo = h('p', { class: 'tm-hint' });
  addBlock(panel, h('div', { class: 'tm-sec' }, h('h2', { class: 'ds-h2' }, '강릉선 KTX (2017년 12월 개통)'), ktxSeg, ktxInfo));

  // 서울~부산 시간 막대(교과서 수치)
  const maxMin = MODES.walk.busanMin;
  addBlock(panel, h('div', { class: 'tm-sec' }, h('h2', { class: 'ds-h2' }, '서울에서 부산까지'),
    h('div', { class: 'tm-bars' }, ['walk', 'car', 'ktx', 'air'].map((mode) => {
      const m = MODES[mode];
      return h('div', { class: 'tm-bar-row' }, h('span', { class: 'tm-bar-k' }, m.name),
        h('span', { class: 'tm-bar-track' }, h('span', { class: 'tm-bar tm-bar-' + mode, style: { width: `${Math.max(0.6, (m.busanMin / maxMin) * 100)}%` } })),
        h('span', { class: 'tm-bar-v' }, m.busanText));
    })),
    h('p', { class: 'tm-hint' }, `걸어서 부산에 한 번 가는 동안 KTX 로는 ${Math.round(maxMin / MODES.ktx.busanMin)}번 갈 수 있어요. 시간 지도에서는 이렇게 줄어든 거리를 도시마다 따로 그립니다.`)));

  const ghostChk = h('input', { type: 'checkbox', checked: true, on: { change: (e) => { state.ghost = e.target.checked; gGhost.classList.toggle('is-hidden', !state.ghost); } } });
  const ringLegend = h('span', {});
  addBlock(panel, h('div', { class: 'tm-sec' }, h('h2', { class: 'ds-h2' }, '지도 읽기'),
    h('label', { class: 'ds-check' }, ghostChk, '실제 해안선 함께 보기(점선)'),
    h('ul', { class: 'tm-legend' },
      h('li', {}, h('span', { class: 'tm-lg-seoul' }), '서울(출발)'),
      h('li', {}, h('span', { class: 'tm-lg-dot' }), '도시: 마우스를 올리면 시간 표'),
      h('li', {}, h('span', { class: 'tm-lg-off' }), '이 수단으로 바로 갈 수 없는 도시'),
      h('li', {}, h('span', { class: 'tm-lg-ring' }), ringLegend)),
    h('p', { class: 'ds-note' }, '서울에서 본 방향은 실제와 같고, 거리만 걸리는 시간에 맞춰 늘이거나 줄였어요. 도시 사이의 해안선과 경계는 가까운 도시들에 맞춰 함께 휘어요. 서울에서 부산까지 거리는 모든 지도에서 같게 맞췄습니다.')));

  addBlock(panel, h('details', { class: 'tm-src' }, h('summary', {}, '자료 출처'),
    h('ul', { class: 'tm-src-list' }, SOURCES.map((t) => h('li', {}, t)))));

  function syncButtons() {
    for (const [k, b] of Object.entries(modeBtns)) b.setAttribute('aria-pressed', String(k === state.mode));
    ktxBtns.before.setAttribute('aria-pressed', String(!state.ktxAfter));
    ktxBtns.after.setAttribute('aria-pressed', String(state.ktxAfter));
    ktxInfo.textContent = `서울에서 강릉까지 철도로 ${formatMinutes(gn().min)}${gn().est ? '(추정)' : ''}. ${state.ktxAfter ? 'KTX 가 생긴 뒤의 시간이에요.' : 'KTX 가 없던 때 무궁화호 시간이에요.'} KTX 지도에서 강릉이 어디로 가는지 보세요.`;
    ringLegend.textContent = MODES[state.mode].ringLegend;
  }

  new ResizeObserver(() => { if (cur === lastDrawn) { draw(cur, curVB); drawRings(cur, state.mode, curVB); } placeTip(); }).observe(stage);
  syncButtons();
  setCaption();
  updateCities(cur);
  draw(cur, curVB);
  drawRings(cur, 'real', curVB);
}
