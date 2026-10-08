// © 2026 김용현
// 시간대별 도로 통행 속도 — 서울 TOPIS 링크별 시간대 평균 속도(2026년 9월)를 표준노드링크 도형 위에 칠한다.
// 결과물 규칙(EMBED_RULES.md): 자료는 정적 import 로 묶고, DOM 은 감싸개(root) 안에서만 찾고, 글은 textContent 로만 쓴다.
import { createShell, addBlock } from '../../src/shared/shell.js';
import { h, icon } from '../../src/shared/dom.js';
import { renderLineGraph, createDefaultLineData, createDefaultGraphOptions } from 'csat-chart.js';
import './style.css';
import DATA from './data/traffic.json';

export default function mount(root) {
  const { stage, panel } = createShell(root, 't1-u5-traffic');
  const R = {}; // 이름 붙은 요소들
  const ref = (name, el) => (R[name] = el);
  const $ = (name) => R[name];

  // ── 무대 ──────────────────────────────────────────────────
  stage.classList.add('tr-stage');
  stage.append(
    ref('map', h('canvas', { class: 'tr-canvas', 'aria-label': '서울 도로 통행 속도 지도', role: 'img' })),
    ref('cars', h('canvas', { class: 'tr-canvas tr-cars', 'aria-hidden': 'true' })),
    h('div', { class: 'tr-clock', 'aria-live': 'polite' },
      ref('clock', h('span', { class: 'tr-clock-time' }, '08:00')),
      ref('clockTag', h('span', { class: 'tr-clock-tag' }))),
    h('div', { class: 'tr-tools' },
      ref('zoomIn', h('button', { type: 'button', class: 'tr-tool', title: '확대', 'aria-label': '확대' }, icon('plus'))),
      ref('zoomOut', h('button', { type: 'button', class: 'tr-tool', title: '축소', 'aria-label': '축소' }, icon('minus'))),
      ref('zoomFit', h('button', { type: 'button', class: 'tr-tool', title: '서울 전체 보기', 'aria-label': '서울 전체 보기' }, icon('expand')))),
    h('div', { class: 'tr-legend' },
      h('div', { class: 'tr-lg-title' }, '통행 속도 (km/h)'),
      ref('legendBar', h('div', { class: 'tr-lg-bar' })),
      h('div', { class: 'tr-lg-ticks' }, ['0', '15', '30', '45', '60+'].map((t) => h('span', {}, t))),
      h('div', { class: 'tr-lg-words' }, ['정체', '서행', '원활'].map((t) => h('span', {}, t)))),
  );

  // ── 사이드바 ──────────────────────────────────────────────
  addBlock(panel, h('div', { class: 'ds-ctl' },
    h('label', { class: 'ds-label' }, '시각', ref('hourOut', h('output', { class: 'ds-out' }, '08시~09시'))),
    h('div', { class: 'tr-time-row' },
      ref('play', h('button', { type: 'button', class: 'ds-btn ds-primary tr-play', 'aria-label': '하루 재생' })),
      ref('hour', h('input', { type: 'range', class: 'ds-range tr-range', min: 0, max: 23, step: 1, value: 8, 'aria-label': '시각' }))),
    h('div', { class: 'ds-seg', role: 'group', 'aria-label': '요일 구분' },
      ref('dayWd', h('button', { type: 'button', class: 'ds-seg-btn', 'aria-pressed': 'true' }, '평일')),
      ref('dayWe', h('button', { type: 'button', class: 'ds-seg-btn', 'aria-pressed': 'false' }, '주말·공휴일'))),
  ));
  const stat = (k, name) => [h('dt', { class: 'ds-stat-k' }, k), ref(name, h('dd', { class: 'ds-stat-v' }, '–'))];
  addBlock(panel, h('dl', { class: 'ds-stat' },
    stat('서울 평균 속도', 'avgAll'),
    stat('도심(종로·중구 일대) 평균', 'avgUrban'),
    stat('정체 구간(15 km/h 미만) 비율', 'jamShare')));
  addBlock(panel, h('section', { class: 'tr-box' },
    h('h2', { class: 'ds-h2' }, '하루 동안의 평균 속도'),
    ref('dayChart', h('canvas', { class: 'tr-chart', width: 640, height: 520, role: 'img', 'aria-label': '시간대별 서울 평균 속도 꺾은선 그래프' })),
    h('p', { class: 'tr-hint' }, '파란 굵은 토막이 지금 시각입니다. 값은 그 시각부터 1시간 동안의 평균입니다. 평일은 출근(7~9시)·퇴근(18~19시) 무렵 속도가 낮아집니다.')));
  addBlock(panel, h('section', { class: 'tr-box' },
    h('h2', { class: 'ds-h2' }, '도로 구간'),
    ref('linkHint', h('p', { class: 'tr-hint' }, '지도에서 도로를 누르면 그 구간의 하루 속도 변화를 볼 수 있습니다.')),
    ref('linkInfo', h('div', { class: 'tr-box', hidden: true },
      ref('linkName', h('div', { class: 'tr-link-name' })),
      ref('linkSub', h('div', { class: 'tr-link-sub' })),
      h('dl', { class: 'ds-stat' }, stat('지금 속도', 'linkNow')),
      ref('linkChart', h('canvas', { class: 'tr-chart', width: 640, height: 520, role: 'img', 'aria-label': '선택한 구간의 시간대별 속도 꺾은선 그래프' })))),
  ));
  addBlock(panel, h('label', { class: 'ds-check' },
    ref('showCars', h('input', { type: 'checkbox', class: 'tr-checkbox', checked: true })), '차량 점 움직임 보기'));
  ref('note', addBlock(panel, h('div', { class: 'ds-note tr-note' })));

  // ── 색: 느림(빨강) → 빠름(초록), 5 km/h 칸 ────────────────
  const STOPS = [[0, '#8e0b25'], [12, '#d7301f'], [22, '#f4892f'], [32, '#e2b93b'], [45, '#7fbf4d'], [60, '#1a7f45']];
  const BIN = 5, NBIN = 13; // 0–5 … 60+
  const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  function colorAt(v) {
    for (let i = 1; i < STOPS.length; i++) {
      if (v <= STOPS[i][0]) {
        const [v0, c0] = STOPS[i - 1], [v1, c1] = STOPS[i];
        const f = (v - v0) / (v1 - v0), a = hex(c0), b = hex(c1);
        return `rgb(${a.map((x, k) => Math.round(x + (b[k] - x) * f)).join(',')})`;
      }
    }
    return STOPS[STOPS.length - 1][1];
  }
  const BIN_COLOR = Array.from({ length: NBIN }, (_, i) => colorAt(Math.min(60, i * BIN + BIN / 2)));
  const NODATA = '#b9bcb6';
  const binOf = (v) => (v == null ? -1 : Math.min(NBIN - 1, Math.floor(v / BIN)));
  $('legendBar').style.background =
    `linear-gradient(90deg, ${STOPS.map(([v, c]) => `${c} ${(v / 60) * 100}%`).join(', ')})`;

  // 도로 위계(0 기타도로 … 3 도시고속도로)별 굵기(px). 낮은 위계부터 그린다.
  const WIDTH = [1.3, 1.8, 2.4, 3.2];

  // ── 자료 풀기 ─────────────────────────────────────────────
  const STR = DATA.strings;
  const decodeSpeeds = (s, from) => Array.from({ length: 24 }, (_, h) => {
    const c = s.charCodeAt(from + h);
    return c === 32 ? null : c - 35;
  });
  const links = DATA.links.map(([road, from, to, func, gu, urban, lanes, len, sp, geom]) => {
    const n = geom.length / 2, x = new Float64Array(n), y = new Float64Array(n);
    let px = 0, py = 0;
    for (let i = 0; i < n; i++) { px += geom[2 * i]; py += geom[2 * i + 1]; x[i] = px; y[i] = py; }
    const nx = new Float32Array(n), ny = new Float32Array(n), cum = new Float64Array(n);
    for (let i = 0; i < n - 1; i++) {
      const dx = x[i + 1] - x[i], dy = y[i + 1] - y[i], d = Math.hypot(dx, dy) || 1;
      nx[i] = dy / d; ny[i] = -dx / d; // 진행 방향 오른쪽(우측 통행)
      cum[i + 1] = cum[i] + d;
    }
    nx[n - 1] = nx[Math.max(0, n - 2)]; ny[n - 1] = ny[Math.max(0, n - 2)];
    return {
      road: STR[road], from: STR[from], to: STR[to], func: DATA.funcs[func], gu: STR[gu], urban, lanes, len,
      cls: func, x, y, nx, ny, cum, L: cum[n - 1], wd: decodeSpeeds(sp, 0), we: decodeSpeeds(sp, 24),
    };
  });
  const unpackRings = (rings) => rings.map((r) => {
    const out = new Float64Array(r.length);
    let px = 0, py = 0;
    for (let i = 0; i < r.length; i += 2) { px += r[i]; py += r[i + 1]; out[i] = px; out[i + 1] = py; }
    return out;
  });
  const units = DATA.units.map(([name, seoul, polys]) => ({ name, seoul, polys: polys.map(unpackRings) }));
  const water = DATA.water.map(unpackRings);

  // ── 상태 ───────────────────────────────────────────────
  const state = { t: 8.5, day: 'wd', playing: false, cars: true, sel: null };
  if (import.meta.env.DEV) {
    // 개발 확인용(배포본에는 빠짐): ?h=3 (0~23시) ?day=we ?link=<도로명>
    const q = new URLSearchParams(window.location.search);
    const h = parseInt(q.get('h'), 10);
    if (h >= 0 && h <= 23) state.t = h + 0.5;
    if (q.get('day') === 'we') state.day = 'we';
    const want = q.get('link');
    if (want) state.sel = links.find((l) => l.road === want) ?? null;
  }
  const view = { s: 1, ox: 0, oy: 0, w: 0, h: 0, dpr: 1 }; // 화면 = (x*s + ox, -y*s + oy)

  const cvMap = $('map'), cvCars = $('cars');
  const gMap = cvMap.getContext('2d'), gCars = cvCars.getContext('2d');

  // ── 시간 보간: 배열 h 칸은 h시~h+1시 평균 → 그 가운데(h+0.5)에 둔다 ─
  function speedAt(arr, t) {
    const u = t - 0.5, f0 = Math.floor(u), f = u - f0;
    const a = arr[(f0 + 24) % 24], b = arr[(f0 + 25) % 24];
    if (a == null) return b;
    if (b == null) return a;
    return a + (b - a) * f;
  }
  const prof = (l) => (state.day === 'wd' ? l.wd : l.we);

  function tagFor(t, day) {
    if (day === 'wd') {
      if (t >= 7 && t < 9.5) return '출근 시간대';
      if (t >= 17.5 && t < 20) return '퇴근 시간대';
    }
    if (t < 5) return '새벽';
    if (t >= 22) return '밤';
    return '';
  }
  const pad = (n) => String(n).padStart(2, '0');

  // ── 평균(구간 길이 가중) ──────────────────────────────────
  function avgAt(day, t, urbanOnly) {
    let s = 0, w = 0;
    for (const l of links) {
      if (urbanOnly && !l.urban) continue;
      const v = speedAt(day === 'wd' ? l.wd : l.we, t);
      if (v == null) continue;
      s += v * l.L; w += l.L;
    }
    return w ? s / w : null;
  }
  function jamShareAt(day, t) {
    let s = 0, w = 0;
    for (const l of links) {
      const v = speedAt(day === 'wd' ? l.wd : l.we, t);
      if (v == null) continue;
      if (v < 15) s += l.L;
      w += l.L;
    }
    return w ? s / w : 0;
  }
  const curves = { wd: [], we: [] };
  for (const day of ['wd', 'we']) for (let h = 0; h < 24; h++) curves[day].push(avgAt(day, h + 0.5, false));

  // ── 화면 맞춤·변환 ────────────────────────────────────────
  function resize() {
    const r = stage.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const first = !view.w;
    view.dpr = Math.min(2, window.devicePixelRatio || 1);
    // 크기가 바뀌어도 가운데를 지킨다
    if (!first) { view.ox += (r.width - view.w) / 2; view.oy += (r.height - view.h) / 2; }
    view.w = r.width; view.h = r.height;
    for (const c of [cvMap, cvCars]) {
      c.width = Math.round(r.width * view.dpr); c.height = Math.round(r.height * view.dpr);
      c.style.width = r.width + 'px'; c.style.height = r.height + 'px';
    }
    if (first) fit(); else drawMap();
  }
  function fit() {
    const [ex, ey] = DATA.extent;
    const m = view.w < 600 ? 12 : 40;
    view.s = Math.min((view.w - 2 * m) / ex, (view.h - 2 * m) / ey);
    view.ox = (view.w - ex * view.s) / 2;
    view.oy = (view.h + ey * view.s) / 2;
    drawMap();
  }
  const sx = (x) => x * view.s + view.ox;
  const sy = (y) => -y * view.s + view.oy;
  function zoomAt(px, py, k) {
    const s2 = Math.max(0.002, Math.min(0.5, view.s * k));
    k = s2 / view.s;
    view.ox = px - (px - view.ox) * k;
    view.oy = py - (py - view.oy) * k;
    view.s = s2;
    drawMap();
  }
  // 확대할수록 조금씩 굵게
  const zoomFactor = () => Math.max(0.8, Math.min(3, Math.sqrt(view.s / 0.025)));
  const offsetOf = (l, zf) => WIDTH[l.cls] * zf * 0.55 + 0.4;

  // ── 지도 그리기 ───────────────────────────────────────────
  function traceRings(g, rings) {
    for (const ring of rings) {
      for (let i = 0; i < ring.length; i += 2) {
        const X = sx(ring[i]), Y = sy(ring[i + 1]);
        i === 0 ? g.moveTo(X, Y) : g.lineTo(X, Y);
      }
      g.closePath();
    }
  }
  // 양방향 도로가 겹치지 않도록 진행 방향 오른쪽으로 비켜 긋는다
  function traceLink(g, l, off) {
    const n = l.x.length;
    for (let i = 0; i < n; i++) {
      let nx = l.nx[i], ny = l.ny[i];
      if (i > 0 && i < n - 1) { nx = (l.nx[i - 1] + l.nx[i]) / 2; ny = (l.ny[i - 1] + l.ny[i]) / 2; }
      const X = sx(l.x[i]) + nx * off, Y = sy(l.y[i]) - ny * off;
      i === 0 ? g.moveTo(X, Y) : g.lineTo(X, Y);
    }
  }
  const colorOf = (v) => (v == null ? NODATA : BIN_COLOR[binOf(v)]);
  function drawMap() {
    if (!view.w) return;
    const g = gMap;
    g.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    g.clearRect(0, 0, view.w, view.h);
    // 바탕: 시군구(서울 밖은 회색) → 하천
    g.lineWidth = 1;
    for (const u of units) {
      g.beginPath();
      for (const p of u.polys) traceRings(g, p);
      g.fillStyle = u.seoul ? '#fbfaf6' : '#e6e8e2';
      g.fill('evenodd');
      g.strokeStyle = u.seoul ? '#c9c6bb' : '#d3d5ce';
      g.stroke();
    }
    g.beginPath();
    for (const p of water) traceRings(g, p);
    g.fillStyle = '#cfe0ea';
    g.fill('evenodd');

    // 도로: 위계 × 속도 칸으로 묶어 한 번씩 긋는다
    const zf = zoomFactor();
    const groups = new Map();
    for (const l of links) {
      const key = l.cls * 100 + binOf(speedAt(prof(l), state.t)) + 1;
      let arr = groups.get(key);
      if (!arr) groups.set(key, (arr = []));
      arr.push(l);
    }
    g.lineCap = 'round'; g.lineJoin = 'round';
    const sel = state.sel;
    if (sel) {
      g.beginPath(); traceLink(g, sel, offsetOf(sel, zf));
      g.strokeStyle = '#1d2126'; g.lineWidth = WIDTH[sel.cls] * zf + 5; g.stroke();
    }
    for (const key of [...groups.keys()].sort((a, b) => a - b)) {
      const cls = Math.floor(key / 100), b = (key % 100) - 1;
      g.beginPath();
      for (const l of groups.get(key)) traceLink(g, l, offsetOf(l, zf));
      g.strokeStyle = b < 0 ? NODATA : BIN_COLOR[b];
      g.lineWidth = WIDTH[cls] * zf;
      g.stroke();
    }
    if (sel) {
      g.beginPath(); traceLink(g, sel, offsetOf(sel, zf));
      g.strokeStyle = colorOf(speedAt(prof(sel), state.t)); g.lineWidth = WIDTH[sel.cls] * zf + 1; g.stroke();
    }
  }

  // ── 차량 점: 구간 평균 속도로 달리는 가상의 차(30배속) ─────────
  const cars = [];
  {
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (const l of links) {
      const n = Math.max(1, Math.round(l.L / (l.cls >= 2 ? 260 : 380)));
      for (let k = 0; k < n; k++) cars.push({ l, d: rnd() * l.L, i: 0 });
    }
  }
  const SIM = 30;
  function stepCars(dt) {
    for (const c of cars) {
      const v = speedAt(prof(c.l), state.t);
      c.d += ((v ?? 20) / 3.6) * SIM * dt;
      if (c.d >= c.l.L) { c.d %= c.l.L; c.i = 0; }
    }
  }
  function drawCars() {
    const g = gCars;
    g.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    g.clearRect(0, 0, view.w, view.h);
    if (!state.cars) return;
    const zf = zoomFactor();
    const r = Math.max(1.1, Math.min(2.6, 1.1 * zf));
    g.beginPath();
    for (const c of cars) {
      const l = c.l, cum = l.cum;
      let i = c.i;
      while (i < cum.length - 2 && cum[i + 1] < c.d) i++;
      c.i = i;
      const f = (c.d - cum[i]) / (cum[i + 1] - cum[i] || 1);
      const off = offsetOf(l, zf);
      const X = sx(l.x[i] + (l.x[i + 1] - l.x[i]) * f) + l.nx[i] * off;
      const Y = sy(l.y[i] + (l.y[i + 1] - l.y[i]) * f) - l.ny[i] * off;
      if (X < -4 || Y < -4 || X > view.w + 4 || Y > view.h + 4) continue;
      g.rect(X - r, Y - r, 2 * r, 2 * r); // 원보다 훨씬 싸다(점이 작아 모양 차이는 거의 안 보임)
    }
    g.fillStyle = 'rgba(20,24,28,.82)';
    g.fill();
  }

  // ── 프레임 ────────────────────────────────────────────────
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let last = performance.now();
  const HOURS_PER_SEC = 1 / 1.6; // 재생: 하루 ≈ 38초
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (state.playing) {
      state.t = (state.t + dt * HOURS_PER_SEC) % 24;
      update();
    }
    if (state.cars && !reduceMotion) stepCars(dt);
    drawCars();
    requestAnimationFrame(frame);
  }

  // ── 사이드바 ──────────────────────────────────────────────
  const fmt = (v) => (v == null ? '–' : `${v.toFixed(1)} km/h`);
  let lastHour = -1, lastDay = '';
  function update() {
    const h = Math.floor(state.t);
    const mm = Math.floor(((state.t - h) * 60) / 10) * 10;
    $('clock').textContent = state.playing ? `${pad(h)}:${pad(mm)}` : `${pad(h)}:00`;
    $('clockTag').textContent = `${state.day === 'we' ? '주말·공휴일' : '평일'} ${tagFor(state.t, state.day)}`;
    $('hourOut').textContent = `${pad(h)}시~${pad((h + 1) % 24)}시`;
    if (+$('hour').value !== h) $('hour').value = h;
    $('avgAll').textContent = fmt(avgAt(state.day, state.t, false));
    $('avgUrban').textContent = fmt(avgAt(state.day, state.t, true));
    $('jamShare').textContent = `${(jamShareAt(state.day, state.t) * 100).toFixed(1)} %`;
    drawMap();
    if (h !== lastHour || state.day !== lastDay) {
      lastHour = h; lastDay = state.day;
      drawDayChart();
      drawLinkChart();
    }
    if (state.sel) $('linkNow').textContent = fmt(speedAt(prof(state.sel), state.t));
  }

  // ── 그래프(csat-chart.js 꺾은선, 저수준 렌더러) ────────────────
  const X_LABELS = Array.from({ length: 24 }, (_, h) => (h % 3 === 0 ? String(h) : ''));
  // 웹폰트를 따로 받지 않고(외부 CDN 금지) 페이지 글꼴로 그린다
  const FONT = "'Pretendard Variable', Pretendard, 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif";
  const BASE_OPTS = createDefaultGraphOptions();
  const chartOpts = {
    ...BASE_OPTS,
    title: '', source: '', footnotes: [''], fontFamily: 'sans',
    fontStack: { serif: FONT, sans: FONT, numeral: FONT },
    fontSize: { ...BASE_OPTS.fontSize, title: 30, axisLabel: 30, tick: 28, dataLabel: 28 },
  };
  // 지금 시각: 그 시간 칸과 다음 칸을 잇는 굵은 파란 토막
  function markerSeries(arr, h) {
    const a = h === 23 ? 22 : h;
    return {
      label: '지금', values: arr.map((v, i) => (i === a || i === a + 1 ? (v == null ? null : Math.round(v * 10) / 10) : null)),
      stroke: '#1f6feb', lineWidth: 12, lineStyle: 'solid',
    };
  }
  const r1 = (a) => a.map((v) => (v == null ? null : Math.round(v * 10) / 10));
  function drawLine(canvas, wd, we, max, step) {
    const d = createDefaultLineData();
    const h = Math.floor(state.t);
    d.series = [
      { label: '평일', lineStyle: 'solid', values: r1(wd), stroke: state.day === 'wd' ? '#1d2126' : '#999', lineWidth: state.day === 'wd' ? 3 : 2 },
      { label: '주말·공휴일', lineStyle: 'dashed', values: r1(we), stroke: state.day === 'we' ? '#1d2126' : '#999', lineWidth: state.day === 'we' ? 3 : 2 },
      markerSeries(state.day === 'wd' ? wd : we, h),
    ];
    d.xLabels = X_LABELS;
    d.xUnit = '(시)';
    d.yUnit = '(km/h)';
    d.yRange = { min: 0, max, auto: false, step };
    d.labelPlacement = 'legend';
    d.showMarkers = false;
    renderLineGraph(canvas.getContext('2d'), canvas.width, canvas.height, d, chartOpts);
  }
  const drawDayChart = () => drawLine($('dayChart'), curves.wd, curves.we, 40, 10);
  function drawLinkChart() {
    const l = state.sel;
    if (!l) return;
    const max = Math.max(20, ...l.wd.filter((v) => v != null), ...l.we.filter((v) => v != null));
    drawLine($('linkChart'), l.wd, l.we, Math.ceil(max / 10) * 10, max > 60 ? 20 : 10);
  }
  function selectLink(l) {
    state.sel = l;
    $('linkInfo').hidden = !l;
    $('linkHint').hidden = !!l;
    if (l) {
      $('linkName').textContent = `${l.road} (${l.from} → ${l.to})`;
      $('linkSub').textContent = `${l.gu} · ${l.func} · ${l.lanes}차로 · ${(l.len / 1000).toFixed(2)} km`;
      $('linkNow').textContent = fmt(speedAt(prof(l), state.t));
      drawLinkChart();
    }
    drawMap();
  }

  // 가장 가까운 도로 찾기(화면 거리 10px 안)
  function pick(px, py) {
    let best = null, bd = 10;
    const zf = zoomFactor();
    for (const l of links) {
      const off = offsetOf(l, zf);
      for (let i = 0; i < l.x.length - 1; i++) {
        const ax = sx(l.x[i]) + l.nx[i] * off, ay = sy(l.y[i]) - l.ny[i] * off;
        const bx = sx(l.x[i + 1]) + l.nx[i] * off, by = sy(l.y[i + 1]) - l.ny[i] * off;
        const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy || 1;
        const f = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
        const d = Math.hypot(ax + dx * f - px, ay + dy * f - py);
        if (d < bd) { bd = d; best = l; }
      }
    }
    return best;
  }

  // 자료 설명(글은 textContent 로)
  const para = (label, text) => h('p', { class: 'tr-note-p' }, label ? [h('strong', { class: 'tr-strong' }, label), ' '] : null, text);
  $('note').append(
    para('자료', `서울시 교통정보센터(TOPIS) 「서울시 차량통행속도」 2026년 9월 — 도로 구간(링크)별 시간대 평균 속도(실측). 평일 ${DATA.daysWeekday}일, 주말·공휴일 ${DATA.daysWeekend}일(추석 연휴 9월 24~26일 포함)을 각각 평균했습니다.`),
    para('도로망', `국토교통부 표준노드링크(2026-09-14 판). 속도 자료 ${DATA.nSource.toLocaleString('ko-KR')}개 구간 중 도로 도형과 이어 붙인 ${links.length.toLocaleString('ko-KR')}개 구간을 그렸습니다. 서울 시내 주요 도로만 들어 있고, 서울 밖은 속도 자료가 없어 비어 있습니다.`),
    para('읽는 법', '한 도로의 두 방향은 진행 방향 오른쪽에 나란히 그렸습니다. 움직이는 점은 그 구간 평균 속도로 달리는 가상의 차량(30배속)입니다. 평균 속도는 구간 길이를 가중치로 한 값이고, 도심은 TOPIS의 ‘도심권’ 구간입니다.'),
    para('', '바탕: 행정동 경계 통계청 SGIS(vuski/admdongkor 가공, CC BY 4.0), 하천 © OpenStreetMap contributors(ODbL)'),
  );

  // ── 조작 ──────────────────────────────────────────────────
  const playBtn = $('play');
  function setPlayIcon() {
    playBtn.replaceChildren(icon(state.playing ? 'pause' : 'play'));
    playBtn.setAttribute('aria-label', state.playing ? '멈춤' : '하루 재생');
  }
  setPlayIcon();
  playBtn.addEventListener('click', () => {
    state.playing = !state.playing;
    if (!state.playing) state.t = Math.floor(state.t) + 0.5;
    setPlayIcon();
    update();
  });
  $('hour').addEventListener('input', (e) => {
    state.playing = false; setPlayIcon();
    state.t = +e.target.value + 0.5;
    update();
  });
  function setDay(day) {
    state.day = day;
    $('dayWd').setAttribute('aria-pressed', String(day === 'wd'));
    $('dayWe').setAttribute('aria-pressed', String(day === 'we'));
    update();
  }
  $('dayWd').addEventListener('click', () => setDay('wd'));
  $('dayWe').addEventListener('click', () => setDay('we'));
  $('showCars').addEventListener('change', (e) => { state.cars = e.target.checked; });
  $('zoomIn').addEventListener('click', () => zoomAt(view.w / 2, view.h / 2, 1.5));
  $('zoomOut').addEventListener('click', () => zoomAt(view.w / 2, view.h / 2, 1 / 1.5));
  $('zoomFit').addEventListener('click', fit);

  // 끌기·휠·두 손가락 확대, 짧게 누르면 도로 선택
  const ptrs = new Map();
  let moved = 0, pinchD = 0;
  stage.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.tr-tools')) return;
    stage.setPointerCapture(e.pointerId);
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    moved = 0;
    if (ptrs.size === 2) {
      const [a, b] = [...ptrs.values()];
      pinchD = Math.hypot(a.x - b.x, a.y - b.y);
    }
    stage.classList.add('tr-dragging');
  });
  stage.addEventListener('pointermove', (e) => {
    const p = ptrs.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    moved += Math.abs(dx) + Math.abs(dy);
    if (ptrs.size === 2 && pinchD) {
      const [a, b] = [...ptrs.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const r = stage.getBoundingClientRect();
      zoomAt((a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top, d / pinchD);
      pinchD = d;
    } else if (ptrs.size === 1) {
      view.ox += dx; view.oy += dy;
      drawMap();
    }
  });
  function endPtr(e) {
    if (!ptrs.has(e.pointerId)) return;
    ptrs.delete(e.pointerId);
    if (ptrs.size < 2) pinchD = 0;
    if (!ptrs.size) stage.classList.remove('tr-dragging');
    if (e.type === 'pointerup' && moved < 6 && !ptrs.size) {
      const r = stage.getBoundingClientRect();
      selectLink(pick(e.clientX - r.left, e.clientY - r.top));
    }
  }
  stage.addEventListener('pointerup', endPtr);
  stage.addEventListener('pointercancel', endPtr);
  stage.addEventListener('wheel', (e) => {
    e.preventDefault();
    const r = stage.getBoundingClientRect();
    zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.0015));
  }, { passive: false });
  new ResizeObserver(resize).observe(stage);

  // ── 시작 ──────────────────────────────────────────────────
  $('dayWd').setAttribute('aria-pressed', String(state.day === 'wd'));
  $('dayWe').setAttribute('aria-pressed', String(state.day === 'we'));
  resize();
  if (state.sel) selectLink(state.sel);
  update();
  // 글꼴이 늦게 오면 그래프만 다시 그린다
  document.fonts?.ready.then(() => { lastHour = -1; update(); });
  requestAnimationFrame(frame);
}
