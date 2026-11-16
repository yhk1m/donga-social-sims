// © 2026 김용현
// 스모그 뚜껑: 기온 역전과 런던 스모그 (통합사회1 128쪽 지식+)
// 템스강 분지 단면(캔버스) + 높이별 기온 그래프(무대 안). 계산은 model.js, 관측 기록은 data/london1952.js.
import { renderAbsBarGraph, createDefaultGraphOptions } from 'csat-chart.js';
import { createShell, addBlock } from '../../src/shared/shell.js';
import { h, icon } from '../../src/shared/dom.js';
import './style.css';
import {
  Z_TOP, SECTION_KM, WIND, COAL, REPLAY_HOURS, REPLAY_START_DAY,
  profile, findInversions, lidHeight, stepParcel, envAt, depthFor, dailyRun, runReplay, scenario1952,
  visibility, emissionAt, sunAt,
} from './model.js';
import { LONDON_1952, WEEKDAY, fToC } from './data/london1952.js';

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
function rng(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const R = rng(1952);
function gauss() {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
const mixRgb = (a, b, t) => a.map((v, i) => Math.round(lerp(v, b[i], t)));
const hexRgb = (a) => [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
const rgbStr = (c, al = 1) => `rgba(${c[0]},${c[1]},${c[2]},${al})`;

// ── 단면 지형 (간추린 그림: 북쪽 언덕, 템스강, 남쪽 언덕) ─────────
const RIVER_X = 6.2, RIVER_HALF = 0.25;
function groundAt(x) {
  const sm = (t) => { const u = clamp(t, 0, 1); return u * u * (3 - 2 * u); };
  let g = x < RIVER_X ? 6 + 114 * sm((RIVER_X - x) / 5.6) ** 1.3 : 6 + 94 * sm((x - RIVER_X) / 5.3) ** 1.3;
  if (Math.abs(x - RIVER_X) < RIVER_HALF) g = 6 - 6 * (1 - ((x - RIVER_X) / RIVER_HALF) ** 2);
  return g;
}

// 집·공장·발전소. 굴뚝 꼭대기 높이(m, 땅 기준), 연기 온도 차(°C)
const HOUSES = [], FACTORIES = [], STACKS = [];
(function buildCity() {
  for (let x = 0.5; x < SECTION_KM - 0.4; x += 0.16 + R() * 0.12) {
    if (Math.abs(x - RIVER_X) < RIVER_HALF + 0.25) continue;
    if ((x > 5.1 && x < 5.8) || (x > 6.75 && x < 7.75)) continue; // 공장 자리
    const hgt = 8 + R() * 5;
    HOUSES.push({ x, w: 0.1 + R() * 0.05, hgt, roof: R() < 0.5 });
    if (R() < 0.85) STACKS.push({ x: x + 0.02, z: hgt + 3, kind: 'house', excess: 3, weight: 1 });
  }
  const fac = [[5.2, 0.24, 18, 42], [5.5, 0.22, 15, 36], [7.55, 0.2, 16, 40]];
  for (const [x, w, hgt, st] of fac) {
    FACTORIES.push({ x, w, hgt, kind: 'factory', st });
    STACKS.push({ x: x + w * 0.7, z: st, kind: 'factory', excess: 4, weight: 6 });
  }
  // 강가 석탄 발전소(굴뚝 넷)
  FACTORIES.push({ x: 6.85, w: 0.55, hgt: 32, kind: 'power', st: 95 });
  for (const dx of [0.02, 0.18, 0.37, 0.53]) STACKS.push({ x: 6.85 + dx, z: 95, kind: 'power', excess: 5, weight: 5 });
})();
const STACK_W = STACKS.map((s) => s.weight);
const STACK_SUM = STACK_W.reduce((a, b) => a + b, 0);

// ── 하늘 색 (시각별 기준 색) ───────────────────────────────
const SKY = [
  [0, '#0b1430', '#1d2a4c'], [6.6, '#0e1736', '#253258'], [7.6, '#33406e', '#d58a62'], [8.8, '#5c8bc6', '#cfe0ee'],
  [12, '#4c84c6', '#d6e7f4'], [14.8, '#6a8fc0', '#e8d6bb'], [16, '#40477a', '#dc8457'], [17.2, '#141c3c', '#2b3559'], [24, '#0b1430', '#1d2a4c'],
];
function skyAt(hour) {
  let i = 0;
  while (i < SKY.length - 2 && SKY[i + 1][0] <= hour) i++;
  const [h0, t0, b0] = SKY[i], [h1, t1, b1] = SKY[i + 1];
  const f = clamp((hour - h0) / (h1 - h0), 0, 1);
  return [mixRgb(hexRgb(t0), hexRgb(t1), f), mixRgb(hexRgb(b0), hexRgb(b1), f)];
}

function fmtHour(hour) {
  const hh = Math.floor(hour + 1e-6) % 24;
  const mm = Math.floor((hour - Math.floor(hour + 1e-6)) * 60 + 1e-6);
  const ap = hh < 12 ? '오전' : '오후';
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  return `${ap} ${h12}시${mm ? ` ${String(mm).padStart(2, '0')}분` : ''}`;
}
function fmtDist(v) {
  if (v >= 1000) return `약 ${(v / 1000).toFixed(v >= 10000 ? 0 : 1)} km`;
  return `약 ${Math.round(v / 10) * 10 || 10} m`;
}
function visWord(v) {
  if (v < 50) return '바로 앞도 잘 안 보임';
  if (v < 200) return '차를 몰기 어려움';
  if (v < 1000) return '뿌옇게 흐림';
  if (v < 5000) return '조금 흐림';
  return '멀리까지 잘 보임';
}

const WIND_LABEL = { none: '바람 없음', weak: '약한 바람', strong: '강한 바람' };
const COAL_LABEL = { low: '석탄 적게', mid: '석탄 보통', high: '석탄 많이' };

// ── 사이드바 ─────────────────────────────────────────────
function buildPanel(panel) {
  const seg = (cls, attr, items, on) => h('div', { class: `ds-seg ${cls}`, role: 'group' },
    items.map(([v, t]) => h('button', { type: 'button', class: 'ds-seg-btn', dataset: { [attr]: v }, 'aria-pressed': v === on ? 'true' : 'false' }, t)));
  const ctl = (label, out, ...rest) => h('div', { class: 'ds-ctl' }, h('div', { class: 'ds-label' }, label, out || null), ...rest);

  addBlock(panel, ctl('보기', null, seg('sm-mode', 'm', [['day', '하루 실험'], ['1952', '1952년 12월 5~9일']], 'day')));
  addBlock(panel, h('div', { class: 'ds-row' },
    h('button', { type: 'button', class: 'ds-btn ds-primary sm-play' }),
    h('button', { type: 'button', class: 'ds-btn sm-reset' }, icon('reset'), '처음으로')));
  addBlock(panel, ctl(h('span', { class: 'sm-time-label' }, '시각'), h('output', { class: 'ds-out sm-time-out' }, ''),
    h('input', { class: 'ds-range sm-time', type: 'range', min: '0', max: '24', step: '0.05', value: '3', 'aria-label': '시각' })));
  addBlock(panel, ctl('재생 속도', null, seg('sm-speed', 's', [['0.5', '느리게'], ['1', '보통'], ['2.5', '빠르게']], '1')));
  addBlock(panel, h('div', { class: 'sm-conds' },
    ctl('바람', null, seg('sm-wind', 'w', [['none', '없음'], ['weak', '약함'], ['strong', '강함']], 'none')),
    ctl('석탄 사용량', null, seg('sm-coal', 'c', [['low', '적음'], ['mid', '보통'], ['high', '많음']], 'mid')),
    ctl('밤 하늘', null, seg('sm-sky', 'k', [['clear', '맑은 밤'], ['cloudy', '흐린 밤']], 'clear')),
    h('p', { class: 'sm-lock' }, '1952년 재생에서는 그때 날씨(고기압, 바람 없음, 안개, 추워서 석탄을 많이 땜)로 정해져 있습니다.')));

  const stat = (k, cls) => [h('dt', { class: 'ds-stat-k' }, k), h('dd', { class: `ds-stat-v ${cls}` }, '')];
  addBlock(panel, h('div', {},
    h('h2', { class: 'ds-h2 sm-h2' }, '지금 상태 ', h('span', { class: 'sm-model' }, '모형 수치')),
    h('dl', { class: 'ds-stat' },
      stat('땅 근처 기온', 'sm-s-t0'), stat('300 m 기온', 'sm-s-t300'), stat('역전층', 'sm-s-inv'),
      stat('연기 농도', 'sm-s-c'), stat('시정', 'sm-s-v'))));

  addBlock(panel, h('div', { class: 'sm-deaths' },
    h('h2', { class: 'ds-h2 sm-h2' }, '1952년 12월 런던 카운티의 하루 사망자'),
    h('div', { class: 'sm-chart-wrap' }, h('canvas', { class: 'sm-chart', width: '760', height: '470', 'aria-label': '1952년 12월 1일부터 10일까지 하루 사망자 막대그래프' })),
    h('p', { class: 'sm-cap' }, '모든 원인으로 숨진 사람 수(실제 기록). 짙은 막대는 재생 중인 날입니다. 스모그 전 보통 겨울날은 하루 110~140명 정도였습니다.'),
    h('p', { class: 'sm-cap sm-day-note' }, '')));

  const em = (t) => h('span', { class: 'sm-em' }, t);
  const li = (...c) => h('li', { class: 'sm-li' }, ...c);
  addBlock(panel, h('div', { class: 'ds-note' }, em('왜 연기가 갇힐까?'), h('ul', { class: 'sm-list' },
    li('보통은 위로 갈수록 기온이 낮아서, 굴뚝에서 나온 따뜻한 연기가 둘레 공기보다 가벼워 높이 올라가 흩어집니다.'),
    li('맑고 바람 없는 밤에는 땅이 열을 많이 내보내 ', em('땅 근처 공기가 위 공기보다 차가워집니다'), '. 이렇게 위가 더 따뜻한 층이 ', em('역전층'), '입니다.'),
    li('연기는 역전층에 들어가면 둘레 공기보다 차가워져 더 오르지 못하고, 뚜껑을 덮은 것처럼 그 아래에 쌓입니다.'),
    li('1952년 12월 런던은 고기압이 머물러 바람이 거의 없었고, 안개가 햇빛을 가려 낮에도 땅이 데워지지 않아 역전층이 닷새 동안 걷히지 않았습니다.'))));
  addBlock(panel, h('div', { class: 'ds-note' }, em('생각해 보기'), h('ul', { class: 'sm-list' },
    li('「하루 실험」에서 바람과 밤 하늘을 바꿔 보며, 연기가 가장 오래 갇히는 조건을 찾아보자.'),
    li('런던에서 스모그가 생긴 원인을 자연 조건과 사람의 활동으로 나누어 말해 보자.'))));
  addBlock(panel, h('div', { class: 'ds-note' }, em('모형과 단순화'), h('ul', { class: 'sm-list' },
    li('기온, 연기 농도, 시정은 모두 ', em('모형 수치'), '입니다. 실제로 잰 값은 아래 사망자 수와 연기 측정값뿐입니다.'),
    li('위층 공기는 100 m 오를 때마다 0.65 °C씩 낮아진다고 두고, 땅 근처만 낮에 데워지고 밤에 식게 했습니다(맑은 밤일수록, 바람이 약할수록 많이 식음).'),
    li('연기 알갱이는 둘레보다 따뜻하면 오르고, 오르며 식고(100 m에 약 1 °C), 둘레 공기와 섞입니다. 바람은 알갱이를 옆으로 실어 냅니다.'),
    li('높은 굴뚝에서 나온 뜨거운 연기는 얇은 역전층을 뚫고 나가기도 합니다. 그래도 연기 대부분은 낮은 집 굴뚝에서 나와 뚜껑 아래에 남습니다.'),
    li('연기 농도는 도시 위 공기를 상자 하나로 보고 「내뿜은 양 ÷ 섞이는 높이」에서 바람과 땅에 내려앉는 몫을 뺐습니다. 시정은 농도와 안개로 셉니다.'),
    li('단면은 런던 분지를 간추린 그림입니다. 가로 12 km, 높이는 크게 늘려 그렸고 건물은 실제보다 크게 그렸습니다.'))));
  addBlock(panel, h('div', { class: 'ds-note sm-src-note' }, em('자료 출처'), h('ul', { class: 'sm-list' },
    li('하루 사망자, 날씨, 연기 측정값: London County Council, Report of the Medical Officer of Health for the year 1952, 153~154쪽 (Wellcome Library 「London\'s Pulse」 공개본). 이 보고서의 하루 사망자 수는 Logan, W. P. D. (1953), The Lancet 1권 336~338쪽에서 옮긴 것입니다. 런던 카운티는 오늘날 런던의 가운데 부분입니다.'),
    li('사망자 모두 1만 2,000명, 2주 동안 4,000여 명, 이듬해 8,000여 명: 통합사회1 교과서 128쪽.'),
    li('1952년 12월 13일까지 한 주 동안 대런던 사망자 4,703명(전년 같은 주 1,852명): 영국 의회 기록(Hansard) 1952년 12월 18일 보건부 장관 답변.'))));
}

export default function mount(root) {
  const { stage, panel } = createShell(root, 't1-u5-smog');
  stage.classList.add('sm-stage');
  buildPanel(panel);
  const $ = (sel) => panel.querySelector(sel);

  const canvas = h('canvas', { class: 'ds-canvas', 'aria-label': '템스강 분지 단면과 높이별 기온 그래프' });
  stage.append(canvas);
  const ctx = canvas.getContext('2d');
  // 무대 위 글 상자
  const chipTime = h('span', { class: 'sm-chip-time' });
  const chipConds = h('span', { class: 'sm-chip-conds' });
  const chip = h('div', { class: 'sm-chip' }, chipTime, chipConds);
  const deathBig = h('b', { class: 'sm-death-num' });
  const deathChip = h('div', { class: 'sm-death' }, h('span', { class: 'sm-death-k' }, '이날 런던 카운티 사망자'), deathBig,
    h('span', { class: 'sm-death-sub' }, '실제 기록'));
  const visFill = h('span', { class: 'sm-vis-fill' });
  const visVal = h('b', { class: 'sm-vis-val' });
  const visWordEl = h('span', { class: 'sm-vis-word' });
  const visBox = h('div', { class: 'sm-vis' },
    h('div', { class: 'sm-vis-head' }, h('span', {}, '시정 (멀리 보이는 거리)'), h('span', { class: 'sm-model' }, '모형 수치')),
    h('div', { class: 'sm-vis-row' }, visVal, visWordEl),
    h('div', { class: 'sm-vis-bar' }, visFill),
    h('div', { class: 'sm-vis-ticks' }, h('span', {}, '10 m'), h('span', {}, '100 m'), h('span', {}, '1 km'), h('span', {}, '10 km')));
  stage.append(chip, deathChip, visBox);

  const state = {
    mode: 'day', hour: 3, t: 0, playing: false, speed: 1,
    wind: 'none', coal: 'mid', sky: 'clear',
    rec: null, replay: null,
    disp: null, // 화면에 보이는(부드럽게 따라가는) 값
  };
  function condDay() { return { wind: state.wind, cloudy: state.sky === 'cloudy', coal: state.coal }; }
  function recompute() { if (state.mode === 'day') state.rec = dailyRun(condDay()); }
  recompute();

  // 지금 시각의 목표 값
  function target() {
    if (state.mode === 'day') {
      const f = clamp(state.hour * 10, 0, 240);
      const i = Math.min(239, Math.floor(f)), w = f - i, r = state.rec;
      return { S: lerp(r.S[i], r.S[i + 1], w), fog: lerp(r.fog[i], r.fog[i + 1], w), C: lerp(r.C[i], r.C[i + 1], w),
        base: 6, sub: { dT: 0, zb: 90, w: 120 }, wind: state.wind, coal: state.coal, cloudy: state.sky === 'cloudy', hour: state.hour };
    }
    if (!state.replay) state.replay = runReplay();
    const r = state.replay;
    const f = clamp(state.t * 10, 0, REPLAY_HOURS * 10);
    const i = Math.min(REPLAY_HOURS * 10 - 1, Math.floor(f)), w = f - i;
    const sc = scenario1952(state.t);
    return { S: lerp(r.S[i], r.S[i + 1], w), fog: lerp(r.fog[i], r.fog[i + 1], w), C: lerp(r.C[i], r.C[i + 1], w),
      base: 4, sub: sc.sub, wind: sc.wind, coal: sc.coal, cloudy: false, hour: state.t % 24 };
  }
  state.disp = { ...target(), u: WIND[state.wind].u, sigma: WIND[state.wind].sigma };

  // ── 연기 알갱이 (고리 버퍼) ───────────────────────────────
  const MAXP = 2600;
  const P = { x: new Float32Array(MAXP), z: new Float32Array(MAXP), T: new Float32Array(MAXP), w: new Float32Array(MAXP),
    age: new Float32Array(MAXP), kind: new Uint8Array(MAXP), live: new Uint8Array(MAXP), jx: new Float32Array(MAXP) };
  let head = 0, emitAcc = 0;
  function pickStack() {
    let r = Math.random() * STACK_SUM;
    for (let i = 0; i < STACKS.length; i++) { r -= STACK_W[i]; if (r <= 0) return STACKS[i]; }
    return STACKS[0];
  }
  function emit(n, T) {
    const em = emissionAt(state.disp.hour);
    for (let k = 0; k < n; k++) {
      const s = pickStack();
      const share = s.kind === 'house' ? em.house : em.factory;
      if (Math.random() > share / 1.3) continue; // 시각별 땔감 양
      const z = groundAt(s.x) + s.z;
      const i = head; head = (head + 1) % MAXP;
      P.x[i] = s.x + (Math.random() - 0.5) * 0.02; P.z[i] = z; P.T[i] = envAt(T, z) + s.excess; P.w[i] = 0.5;
      P.age[i] = 0; P.kind[i] = s.kind === 'house' ? 0 : s.kind === 'factory' ? 1 : 2; P.live[i] = 1; P.jx[i] = Math.random();
    }
  }
  const PT = 80; // 화면 1초 = 연기 움직임 80초
  function stepParticles(dtReal, T) {
    const lidNow = lidHeight(findInversions(T));
    const d = state.disp;
    const coal = COAL[d.coal] ?? 1;
    emitAcc += dtReal * 95 * coal;
    const n = Math.floor(emitAcc); emitAcc -= n;
    emit(n, T);
    const sigma = d.sigma + Math.max(0, d.S) * 0.45;
    const sub = 2, steps = Math.max(1, Math.round((dtReal * PT) / sub));
    const dt = (dtReal * PT) / steps;
    for (let i = 0; i < MAXP; i++) {
      if (!P.live[i]) continue;
      let p = { z: P.z[i], T: P.T[i], w: P.w[i] };
      for (let s = 0; s < steps; s++) p = stepParcel(p, T, dt, { rnd: gauss, sigma });
      const g = groundAt(P.x[i]);
      if (p.z < g) { p.z = g + 1; p.w = Math.max(0, p.w); }
      P.z[i] = p.z; P.T[i] = p.T; P.w[i] = p.w;
      const u = d.u * (0.6 + 0.4 * Math.min(1, p.z / 300)) + (d.u < 0.5 ? (P.jx[i] - 0.5) * 0.25 : 0);
      // 바람은 화면에서 보이도록 3배 빠르게 옮긴다
      P.x[i] += (3 * u * dt * steps) / 1000 + (Math.random() - 0.5) * 0.0015 * (1 + sigma * 4);
      // 뚜껑이 없으면 위로 넓게 퍼져 옅어진다(빨리 사라짐), 뚜껑 아래에서는 오래 남는다
      P.age[i] += dtReal * (lidNow == null || p.z > lidNow ? 4 : 1);
      if (p.z > Z_TOP || P.x[i] > SECTION_KM + 0.2 || P.x[i] < -0.2 || P.age[i] > 160) P.live[i] = 0;
    }
  }

  // ── 그리기 ───────────────────────────────────────────────
  const view = { W: 0, H: 0, dpr: 1, secX0: 0, secW: 0, y0: 0, ppm: 0, cardX: 0, cardW: 0 };
  function resize() {
    const r = stage.getBoundingClientRect();
    view.W = Math.max(320, r.width); view.H = Math.max(300, r.height);
    view.dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(view.W * view.dpr); canvas.height = Math.round(view.H * view.dpr);
    view.cardW = clamp(view.W * 0.25, 210, 290);
    view.cardX = view.W - view.cardW - 14;
    view.secX0 = 0; view.secW = view.cardX - 14;
    view.y0 = view.H - 58;
    const yTop = 72;
    view.ppm = (view.y0 - yTop) / Z_TOP;
    draw();
  }
  const xOf = (xk) => view.secX0 + (xk / SECTION_KM) * view.secW;
  const yOf = (z) => view.y0 - z * view.ppm;
  const exaggeration = () => Math.round((view.ppm * 1000) / (view.secW / SECTION_KM));

  function curProfile() {
    const d = state.disp;
    return profile({ base: d.base, S: d.S, D: depthFor(d.S, d.wind), sub: d.sub });
  }

  function draw() {
    const { W, H, dpr } = view;
    const d = state.disp;
    const T = curProfile();
    const inv = findInversions(T);
    const lid = lidHeight(inv);
    const c = ctx;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, W, H);

    // 하늘
    const hour = d.hour;
    let [top, bot] = skyAt(hour);
    const cloudy = d.cloudy;
    if (cloudy) { top = mixRgb(top, [120, 128, 140], sunAt(hour) > 0 ? 0.55 : 0.35); bot = mixRgb(bot, [140, 146, 156], sunAt(hour) > 0 ? 0.55 : 0.35); }
    const smokeT = clamp(d.C / 3.5, 0, 1);
    const fogT = clamp(d.fog, 0, 1);
    const dayLight = clamp(sunAt(hour) * 1.6, 0, 1);
    const smogCol = mixRgb([58, 50, 34], [156, 132, 82], dayLight); // 누런 갈색(석탄 연기)
    bot = mixRgb(bot, smogCol, smokeT * 0.75);
    bot = mixRgb(bot, mixRgb([70, 74, 82], [200, 202, 204], dayLight), fogT * 0.5);
    top = mixRgb(top, smogCol, smokeT * 0.25);
    const sky = c.createLinearGradient(0, yOf(Z_TOP), 0, view.y0);
    sky.addColorStop(0, rgbStr(top)); sky.addColorStop(1, rgbStr(bot));
    c.fillStyle = sky;
    c.fillRect(0, 0, W, view.y0 + 2);

    // 별(맑고 연기 옅은 밤) / 해
    const night = sunAt(hour) === 0 && (hour < 7.3 || hour > 16.7);
    if (night && !cloudy) {
      const a = 0.8 * (1 - smokeT) * (1 - fogT * 0.7);
      const sr = rng(7);
      c.fillStyle = `rgba(255,255,240,${a})`;
      for (let k = 0; k < 70; k++) { const x = sr() * view.secW, y = yOf(Z_TOP) + sr() * (view.y0 - yOf(Z_TOP)) * 0.55; c.fillRect(x, y, 1.4, 1.4); }
    }
    const sa = sunAt(hour);
    if (sa > 0) {
      const sx = xOf(((hour - 8) / 8) * SECTION_KM * 0.9 + SECTION_KM * 0.05);
      const sy = yOf(Z_TOP * (0.35 + 0.45 * sa));
      const dim = 1 - Math.max(smokeT * 0.7, fogT * 0.8, cloudy ? 0.85 : 0);
      c.fillStyle = `rgba(${Math.round(lerp(255, 236, smokeT))},${Math.round(lerp(236, 150, smokeT))},${Math.round(lerp(170, 90, smokeT))},${0.15 + 0.85 * dim})`;
      c.beginPath(); c.arc(sx, sy, 15, 0, Math.PI * 2); c.fill();
    }

    // 높이 눈금
    c.font = '11px Pretendard, "Malgun Gothic", sans-serif';
    c.textBaseline = 'middle';
    for (let z = 200; z <= Z_TOP; z += 200) {
      const y = yOf(z);
      c.strokeStyle = 'rgba(255,255,255,0.13)'; c.lineWidth = 1;
      c.beginPath(); c.moveTo(0, y); c.lineTo(view.secW, y); c.stroke();
      c.fillStyle = 'rgba(255,255,255,0.75)'; c.textAlign = 'right';
      c.fillText(`${z} m`, view.secW - 8, y - 8); c.textAlign = 'left';
    }

    // 역전층 띠
    for (const l of inv) {
      const y1 = yOf(l.top), y2 = yOf(l.bottom);
      c.fillStyle = 'rgba(247,103,7,0.14)';
      c.fillRect(0, y1, view.secW, y2 - y1);
      c.strokeStyle = 'rgba(253,126,20,0.95)'; c.lineWidth = 2; c.setLineDash([8, 6]);
      c.beginPath(); c.moveTo(0, y1); c.lineTo(view.secW, y1); c.stroke(); c.setLineDash([]);
    }

    // 연기 알갱이
    for (let i = 0; i < MAXP; i++) {
      if (!P.live[i]) continue;
      const x = xOf(P.x[i]), y = yOf(P.z[i]);
      const age = P.age[i];
      const r = 2.2 + Math.min(6, age * 0.09) + P.kind[i] * 0.6;
      const a = clamp(0.5 - age * 0.0022, 0.14, 0.5) * (age < 0.4 ? age / 0.4 : 1);
      c.fillStyle = dayLight > 0.3 ? `rgba(70,64,54,${a})` : `rgba(168,158,140,${a})`;
      c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
    }

    // 땅과 건물
    const gTop = '#5f6f4a', gBot = '#3b3a2c';
    const gg = c.createLinearGradient(0, yOf(120), 0, H);
    gg.addColorStop(0, gTop); gg.addColorStop(1, gBot);
    c.fillStyle = gg;
    c.beginPath(); c.moveTo(0, H);
    for (let px = 0; px <= view.secW; px += 3) c.lineTo(px, yOf(groundAt((px / view.secW) * SECTION_KM)));
    c.lineTo(view.secW, H); c.closePath(); c.fill();
    // 강
    c.fillStyle = '#3d6f99';
    c.beginPath(); c.moveTo(xOf(RIVER_X - RIVER_HALF), yOf(5));
    for (let x = RIVER_X - RIVER_HALF; x <= RIVER_X + RIVER_HALF; x += 0.02) c.lineTo(xOf(x), Math.max(yOf(5), yOf(groundAt(x))));
    c.lineTo(xOf(RIVER_X + RIVER_HALF), yOf(5)); c.closePath(); c.fill();
    const lightOn = clamp(1 - dayLight * 1.4, 0, 1) * (1 - smokeT * 0.3);
    const minPx = (m, p) => Math.max(m * view.ppm * 2.2, p);
    for (const b of HOUSES) {
      const x = xOf(b.x), w = Math.max(5, (b.w / SECTION_KM) * view.secW), g = yOf(groundAt(b.x + b.w / 2));
      const hh = minPx(b.hgt, 8);
      c.fillStyle = '#6b5446'; c.fillRect(x, g - hh, w, hh + 2);
      c.fillStyle = '#4a3a33';
      if (b.roof) { c.beginPath(); c.moveTo(x - 1, g - hh); c.lineTo(x + w / 2, g - hh - 4); c.lineTo(x + w + 1, g - hh); c.fill(); }
      c.fillRect(x + w * 0.15, g - hh - 5, 2, 5);
      if (lightOn > 0.05) { c.fillStyle = `rgba(255,214,120,${0.75 * lightOn})`; c.fillRect(x + w * 0.35, g - hh * 0.6, 2, 2); }
    }
    for (const f of FACTORIES) {
      const x = xOf(f.x), w = (f.w / SECTION_KM) * view.secW, g = yOf(groundAt(f.x + f.w / 2));
      const hh = minPx(f.hgt, 14);
      c.fillStyle = f.kind === 'power' ? '#7a6a5e' : '#5c5552';
      c.fillRect(x, g - hh, w, hh + 3);
      if (f.kind !== 'power') {
        c.fillStyle = '#4a4442';
        for (let k = 0; k < 3; k++) { const sx = x + (w / 3) * k; c.beginPath(); c.moveTo(sx, g - hh); c.lineTo(sx + w / 3, g - hh - 5); c.lineTo(sx + w / 3, g - hh); c.fill(); }
      }
    }
    for (const s of STACKS) {
      if (s.kind === 'house') continue;
      const x = xOf(s.x), g = yOf(groundAt(s.x)), y = yOf(groundAt(s.x) + s.z);
      c.fillStyle = s.kind === 'power' ? '#e9e2d6' : '#857b74';
      const w = s.kind === 'power' ? 5 : 4;
      c.fillRect(x - w / 2, y, w, g - y);
    }

    // 연기와 안개가 쌓인 층(뚜껑 아래 탁한 공기)
    const hazeTop = lid != null ? lid : 700;
    const hazeA = clamp(d.C / 3.5, 0, 1) * (lid != null ? 0.8 : 0.3);
    if (hazeA > 0.01) {
      const hg = c.createLinearGradient(0, yOf(hazeTop * 1.05), 0, view.y0);
      hg.addColorStop(0, rgbStr(smogCol, 0));
      hg.addColorStop(0.3, rgbStr(smogCol, hazeA * 0.6));
      hg.addColorStop(1, rgbStr(smogCol, hazeA));
      c.fillStyle = hg; c.fillRect(0, yOf(hazeTop * 1.05), view.secW, view.y0 - yOf(hazeTop * 1.05) + 60);
    }
    if (fogT > 0.02) {
      const fogTop = Math.min(lid ?? 140, 160);
      const fc = mixRgb(mixRgb([120, 124, 130], [226, 226, 222], dayLight), smogCol, smokeT * 0.55); // 연기 섞인 안개는 누렇다
      const fg = c.createLinearGradient(0, yOf(fogTop * 1.3), 0, view.y0);
      fg.addColorStop(0, rgbStr(fc, 0)); fg.addColorStop(0.45, rgbStr(fc, fogT * 0.6)); fg.addColorStop(1, rgbStr(fc, fogT * 0.85));
      c.fillStyle = fg; c.fillRect(0, yOf(fogTop * 1.3), view.secW, view.y0 - yOf(fogTop * 1.3) + 60);
    }

    // 땅 아래 띠와 이름표
    c.fillStyle = '#2f2c24'; c.fillRect(0, view.y0 + 8, view.secW, H - view.y0);
    c.fillStyle = 'rgba(255,255,255,0.88)'; c.font = '600 12px Pretendard, "Malgun Gothic", sans-serif'; c.textAlign = 'center';
    const lbl = (t, xk, dy = 22) => c.fillText(t, xOf(xk), view.y0 + dy);
    lbl('북쪽 언덕', 0.9); lbl('주택가', 3.3); lbl('공장', 5.45); lbl('템스강', RIVER_X); lbl('석탄 발전소', 7.15, 38); lbl('주택가', 9.3); lbl('남쪽 언덕', 11.2);
    c.textAlign = 'left';
    c.font = '11px Pretendard, "Malgun Gothic", sans-serif'; c.fillStyle = 'rgba(255,255,255,0.6)';
    c.fillText(`가로 ${SECTION_KM} km, 높이는 약 ${exaggeration()}배 늘려 그림 (간추린 단면)`, 8, H - 12);

    // 역전층 이름표
    if (inv.length) {
      const l = inv[0];
      const y = yOf(l.top);
      const text = `역전층 (뚜껑): ${l.bottom} ~ ${l.top} m`;
      c.font = '700 13px Pretendard, "Malgun Gothic", sans-serif';
      const tw = c.measureText(text).width;
      const bx = view.secW * 0.42 - tw / 2, by = y - 30;
      c.fillStyle = 'rgba(253,126,20,0.95)'; c.fillRect(bx, by, tw + 16, 24);
      c.fillStyle = '#fff'; c.textBaseline = 'middle'; c.fillText(text, bx + 8, by + 12);
    }

    // 바람 화살표
    if (d.u > 0.5) {
      c.strokeStyle = 'rgba(255,255,255,0.75)'; c.lineWidth = 2;
      const n = d.u > 3 ? 3 : 2, ph = (performance.now() / 1000) * (d.u > 3 ? 1.6 : 0.8);
      for (let k = 0; k < n; k++) {
        const y = yOf(380 + k * 160);
        const x = ((ph * 60 + k * 170) % (view.secW + 80)) - 40;
        const len = d.u > 3 ? 46 : 30;
        c.beginPath(); c.moveTo(x, y); c.lineTo(x + len, y); c.lineTo(x + len - 7, y - 5); c.moveTo(x + len, y); c.lineTo(x + len - 7, y + 5); c.stroke();
      }
    }

    drawProfileCard(T, inv, lid);
  }

  // 높이별 기온 그래프 (무대 오른쪽, 단면과 같은 높이 축)
  function drawProfileCard(T, inv, lid) {
    const c = ctx;
    const x0 = view.cardX, w = view.cardW;
    const yT = 12, yB = view.y0 + 44;
    c.fillStyle = 'rgba(255,255,255,0.96)';
    roundRect(c, x0, yT, w, yB - yT, 10); c.fill();
    c.strokeStyle = '#e2e0d9'; c.lineWidth = 1; roundRect(c, x0, yT, w, yB - yT, 10); c.stroke();
    c.fillStyle = '#1d2126'; c.font = '700 13px Pretendard, "Malgun Gothic", sans-serif'; c.textBaseline = 'alphabetic'; c.textAlign = 'left';
    c.fillText('높이별 기온', x0 + 12, yT + 20);
    c.fillStyle = '#5b636d'; c.font = '11px Pretendard, "Malgun Gothic", sans-serif';
    c.fillText('모형 수치', x0 + w - 60, yT + 20);
    const px0 = x0 + 50, px1 = x0 + w - 14;
    const tMin = -8, tMax = 12;
    const xT = (t) => px0 + ((t - tMin) / (tMax - tMin)) * (px1 - px0);
    // 격자
    c.textBaseline = 'middle';
    for (let z = 0; z <= Z_TOP; z += 200) {
      const y = yOf(z);
      c.strokeStyle = '#eceae4'; c.beginPath(); c.moveTo(px0, y); c.lineTo(px1, y); c.stroke();
      c.fillStyle = '#5b636d'; c.textAlign = 'right'; c.fillText(String(z), px0 - 5, y);
    }
    c.textAlign = 'center';
    for (let t = tMin; t <= tMax; t += 4) {
      const x = xT(t);
      c.strokeStyle = t === 0 ? '#c9c6bd' : '#eceae4'; c.beginPath(); c.moveTo(x, yOf(Z_TOP)); c.lineTo(x, view.y0); c.stroke();
      c.fillStyle = '#5b636d'; c.fillText(String(t), x, view.y0 + 12);
    }
    c.fillText('기온 (°C)', (px0 + px1) / 2, view.y0 + 28);
    c.save(); c.translate(x0 + 12, yOf(Z_TOP / 2)); c.rotate(-Math.PI / 2); c.fillText('높이 (m)', 0, 0); c.restore();
    // 역전층 강조
    for (const l of inv) {
      c.fillStyle = 'rgba(247,103,7,0.16)';
      c.fillRect(px0, yOf(l.top), px1 - px0, yOf(l.bottom) - yOf(l.top));
      c.fillStyle = '#d9480f'; c.font = '700 11px Pretendard, "Malgun Gothic", sans-serif'; c.textAlign = 'right';
      c.fillText('역전층', px1 - 4, yOf(l.top) + 9);
      c.font = '11px Pretendard, "Malgun Gothic", sans-serif';
    }
    c.save();
    c.beginPath(); c.rect(px0, yOf(Z_TOP), px1 - px0, view.y0 - yOf(Z_TOP)); c.clip();
    // 굴뚝 연기 덩어리 길(집 굴뚝, 둘레보다 3 °C 따뜻하게 출발)
    const track = [];
    let p = { z: 20, T: envAt(T, 20) + 3, w: 0 };
    track.push([p.T, p.z]);
    for (let t = 0; t < 1500; t += 3) { p = stepParcel(p, T, 3); track.push([p.T, p.z]); if (p.z > Z_TOP || (t > 120 && Math.abs(p.w) < 0.02)) break; }
    c.strokeStyle = '#c92a2a'; c.lineWidth = 2; c.setLineDash([5, 4]);
    c.beginPath(); track.forEach(([tt, zz], k) => (k ? c.lineTo(xT(tt), yOf(zz)) : c.moveTo(xT(tt), yOf(zz)))); c.stroke(); c.setLineDash([]);
    const end = track[track.length - 1];
    if (end[1] < Z_TOP) { c.fillStyle = '#c92a2a'; c.beginPath(); c.arc(xT(end[0]), yOf(end[1]), 4, 0, Math.PI * 2); c.fill(); }
    // 공기 기온 선
    c.strokeStyle = '#1f6feb'; c.lineWidth = 3;
    c.beginPath();
    for (let k = 0; k < T.length; k++) { const x = xT(T[k]), y = yOf(k * 10); if (k) c.lineTo(x, y); else c.moveTo(x, y); }
    c.stroke();
    c.restore();
    // 범례
    const ly = yT + 36;
    c.textAlign = 'left'; c.font = '11px Pretendard, "Malgun Gothic", sans-serif'; c.fillStyle = '#1d2126';
    c.strokeStyle = '#1f6feb'; c.lineWidth = 3; c.beginPath(); c.moveTo(x0 + 12, ly); c.lineTo(x0 + 30, ly); c.stroke();
    c.fillText('둘레 공기', x0 + 34, ly);
    c.strokeStyle = '#c92a2a'; c.lineWidth = 2; c.setLineDash([5, 4]); c.beginPath(); c.moveTo(x0 + 96, ly); c.lineTo(x0 + 114, ly); c.stroke(); c.setLineDash([]);
    c.fillText(end[1] < Z_TOP ? '집 굴뚝 연기 (점: 멈춤)' : '집 굴뚝 연기', x0 + 118, ly);
    void lid;
  }
  function roundRect(c, x, y, w, hh, r) {
    c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + hh, r); c.arcTo(x + w, y + hh, x, y + hh, r);
    c.arcTo(x, y + hh, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
  }

  // ── 사망자 막대 (csat-chart.js) ───────────────────────────
  const FONT = "Pretendard, 'Pretendard Variable', 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif";
  const baseOpts = createDefaultGraphOptions();
  const CHART_OPTS = { ...baseOpts, fontFamily: 'sans', fontStack: { sans: FONT, serif: FONT, numeral: 'Arial' }, showLegend: false,
    fontSize: { ...baseOpts.fontSize, tick: 26, axisLabel: 28, dataLabel: 26 } };
  const chartCanvas = $('.sm-chart');
  let chartDay = -1;
  function refreshChart(curDay) {
    if (curDay === chartDay) return;
    chartDay = curDay;
    const data = {
      barDirection: 'vertical', stacked: true, unit: '(명)',
      seriesLabels: ['다른 날', '재생 중인 날'], seriesFills: ['#b8c4d6', '#d9480f'],
      categories: LONDON_1952.map((r) => ({ label: String(r.day), values: r.day === curDay ? [0, r.deaths] : [r.deaths, 0] })),
      yRange: { min: 0, max: 600, auto: false, step: 100 },
    };
    try {
      const cx = chartCanvas.getContext('2d');
      cx.setTransform(1, 0, 0, 1, 0, 0);
      cx.fillStyle = '#fff'; cx.fillRect(0, 0, chartCanvas.width, chartCanvas.height);
      renderAbsBarGraph(cx, chartCanvas.width, chartCanvas.height, data, CHART_OPTS);
    } catch (e) { console.warn(e); }
  }

  // ── 조작 ───────────────────────────────────────────────
  const playBtn = $('.sm-play'), timeIn = $('.sm-time'), timeOut = $('.sm-time-out'), timeLabel = $('.sm-time-label');
  function syncPlay() { playBtn.replaceChildren(icon(state.playing ? 'pause' : 'play'), document.createTextNode(state.playing ? '멈춤' : '재생')); }
  function bindSeg(sel, attr, fn) {
    const box = $(sel);
    box.addEventListener('click', (e) => {
      const b = e.target.closest('.ds-seg-btn');
      if (!b || b.disabled) return;
      for (const x of box.querySelectorAll('.ds-seg-btn')) x.setAttribute('aria-pressed', x === b ? 'true' : 'false');
      fn(b.dataset[attr]);
    });
  }
  bindSeg('.sm-wind', 'w', (v) => { state.wind = v; recompute(); refreshUI(); });
  bindSeg('.sm-coal', 'c', (v) => { state.coal = v; recompute(); refreshUI(); });
  bindSeg('.sm-sky', 'k', (v) => { state.sky = v; recompute(); refreshUI(); });
  bindSeg('.sm-speed', 's', (v) => { state.speed = Number(v); });
  bindSeg('.sm-mode', 'm', (v) => setMode(v));
  function setMode(v) {
    state.mode = v;
    state.playing = v === '1952';
    for (const x of $('.sm-mode').querySelectorAll('.ds-seg-btn')) x.setAttribute('aria-pressed', x.dataset.m === v ? 'true' : 'false');
    const locked = v === '1952';
    $('.sm-conds').classList.toggle('sm-locked', locked);
    for (const b of $('.sm-conds').querySelectorAll('.ds-seg-btn')) b.disabled = locked;
    if (locked) { timeIn.max = String(REPLAY_HOURS); timeIn.step = '0.1'; state.t = 0; timeLabel.textContent = '날짜와 시각'; }
    else { timeIn.max = '24'; timeIn.step = '0.05'; timeLabel.textContent = '시각'; recompute(); }
    for (let i = 0; i < MAXP; i++) P.live[i] = 0;
    const tg = target();
    Object.assign(state.disp, tg, { u: WIND[tg.wind].u, sigma: WIND[tg.wind].sigma });
    syncPlay(); refreshUI();
  }
  playBtn.addEventListener('click', () => {
    if (state.mode === '1952' && state.t >= REPLAY_HOURS) state.t = 0;
    state.playing = !state.playing; syncPlay();
  });
  $('.sm-reset').addEventListener('click', () => {
    if (state.mode === 'day') state.hour = 0; else state.t = 0;
    for (let i = 0; i < MAXP; i++) P.live[i] = 0;
    const tg = target();
    Object.assign(state.disp, tg, { u: WIND[tg.wind].u, sigma: WIND[tg.wind].sigma });
    refreshUI();
  });
  timeIn.addEventListener('input', () => {
    if (state.mode === 'day') state.hour = Number(timeIn.value); else state.t = Number(timeIn.value);
    refreshUI();
  });

  function replayDay() { return REPLAY_START_DAY + Math.floor(Math.min(REPLAY_HOURS - 0.01, state.t) / 24); }
  function refreshUI() {
    const d = state.disp;
    const T = curProfile();
    const inv = findInversions(T);
    if (state.mode === 'day') {
      timeOut.textContent = fmtHour(state.hour);
      timeIn.value = String(state.hour);
      chipTime.textContent = fmtHour(state.hour);
      chipConds.textContent = `${WIND_LABEL[state.wind]}, ${COAL_LABEL[state.coal]}, ${state.sky === 'clear' ? '맑은 날' : '흐린 날'}`;
      deathChip.classList.remove('sm-on');
      $('.sm-day-note').textContent = '';
      refreshChart(-1);
    } else {
      const day = replayDay();
      const hr = state.t % 24;
      const label = `1952년 12월 ${day}일 (${WEEKDAY[day]}) ${fmtHour(hr)}`;
      timeOut.textContent = `12월 ${day}일 ${fmtHour(hr)}`;
      timeIn.value = String(state.t);
      chipTime.textContent = label;
      chipConds.textContent = `${WIND_LABEL[d.wind]}${d.sub.dT > 1 ? ', 고기압' : ''}${d.fog > 0.4 ? ', 짙은 안개' : ''}`;
      const rec = LONDON_1952.find((r) => r.day === day);
      deathBig.textContent = `${rec.deaths.toLocaleString('ko-KR')}명`;
      deathChip.classList.add('sm-on');
      deathChip.classList.toggle('sm-hot', rec.deaths > 250);
      const meas = rec.smoke != null ? `이날 잰 연기 ${rec.smoke.toFixed(2)} mg/m³` : '이날은 연기를 재지 못함';
      $('.sm-day-note').textContent = `12월 ${day}일: 사망 ${rec.deaths}명, 하루 평균 기온 ${fToC(rec.tempF).toFixed(1)} °C(큐 관측), ${meas}.`;
      refreshChart(day);
    }
    const t0 = T[0], t300 = T[30];
    $('.sm-s-t0').textContent = `${t0.toFixed(1)} °C`;
    $('.sm-s-t300').textContent = `${t300.toFixed(1)} °C`;
    $('.sm-s-inv').textContent = inv.length ? `있음 (${inv[0].bottom}~${inv[0].top} m, ${inv[0].dT.toFixed(1)} °C 더 따뜻)` : '없음';
    $('.sm-s-inv').classList.toggle('sm-bad', inv.length > 0);
    $('.sm-s-c').textContent = `${d.C.toFixed(2)} mg/m³`;
    const v = visibility(d.C, d.fog);
    $('.sm-s-v').textContent = fmtDist(v);
    visVal.textContent = fmtDist(v);
    visWordEl.textContent = visWord(v);
    const pct = clamp((Math.log10(v) - 1) / (Math.log10(20000) - 1), 0, 1);
    visFill.style.width = `${(pct * 100).toFixed(1)}%`;
    visFill.style.background = v < 200 ? '#c92a2a' : v < 1000 ? '#e8590c' : v < 5000 ? '#f59f00' : '#2b8a3e';
  }

  // ── 루프 ───────────────────────────────────────────────
  let last = performance.now(), uiClock = 0;
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (state.playing) {
      if (state.mode === 'day') state.hour = (state.hour + dt * state.speed) % 24;
      else {
        state.t = Math.min(REPLAY_HOURS, state.t + dt * 2 * state.speed);
        if (state.t >= REPLAY_HOURS) { state.playing = false; syncPlay(); }
      }
    }
    // 보이는 값이 목표를 부드럽게 따라감
    const tg = target();
    const k = 1 - Math.exp(-dt * 5);
    const d = state.disp;
    d.S = lerp(d.S, tg.S, k); d.fog = lerp(d.fog, tg.fog, k); d.C = lerp(d.C, tg.C, k);
    d.base = tg.base; d.sub = { ...tg.sub, dT: lerp(d.sub.dT, tg.sub.dT, k) };
    d.wind = tg.wind; d.coal = tg.coal; d.cloudy = tg.cloudy; d.hour = tg.hour;
    d.u = lerp(d.u, WIND[tg.wind].u, k); d.sigma = lerp(d.sigma, WIND[tg.wind].sigma, k);
    stepParticles(dt, curProfile());
    draw();
    uiClock += dt;
    if (uiClock > 0.12) { uiClock = 0; refreshUI(); }
    requestAnimationFrame(frame);
  }
  new ResizeObserver(resize).observe(stage);
  resize();
  syncPlay();
  refreshUI();
  requestAnimationFrame(frame);
}
