// © 2026 김용현
// 공급망 끊기: 부품 하나가 멈추면
// 교과서: 동아출판 중등 사회1 14쪽 사회 탐탐 「내 자동차는 도대체 언제 출고되지?」
// 세계 지도 위에 부품 생산지 → 조립 공장(대한민국) 흐름. 사건 카드를 나라에 놓으면 그 부품 공급이 멈추고,
// 재고가 바닥나면 공장이 멈춰 출고 대기가 늘어난다. 2단계에서 대비 방법을 고르고 같은 사건을 다시 해 본다.
// 계산은 model.js(순수 함수, Node 시험). 규칙(EMBED_RULES.md): DOM 은 h()/s() 로만, 탐색은 root 안에서만.
import { geoNaturalEarth1, geoPath, geoGraticule, geoContains } from 'd3-geo';
import { feature } from 'topojson-client';
import topo from 'world-atlas/countries-110m.json';
import { createShell, addBlock } from '../../src/shared/shell.js';
import { h, s, icon } from '../../src/shared/dom.js';
import './style.css';
import {
  WEEKS, DEMAND, CAPACITY, PARTS, FACTORY, EVENTS, STRATEGIES,
  createState, step, applyEvent, isStopped, stopLeft, factoryStatus, summarize, simulate, eventById,
} from './model.js';

const WEEK_SEC = 1.1; // 재생 때 한 주에 걸리는 시간(초)
const N_SAMPLE = 40;
const ID = 's1-u1-supply-chain';

// 이 자료만 쓰는 선 아이콘(24x24)
const MY_ICONS = {
  factory: [['path', { d: 'M3 21V10l6 4V10l6 4V6h6v15z' }], ['line', { x1: 3, y1: 21, x2: 21, y2: 21 }]],
  grip: [['circle', { cx: 9, cy: 6, r: 1 }], ['circle', { cx: 15, cy: 6, r: 1 }], ['circle', { cx: 9, cy: 12, r: 1 }], ['circle', { cx: 15, cy: 12, r: 1 }], ['circle', { cx: 9, cy: 18, r: 1 }], ['circle', { cx: 15, cy: 18, r: 1 }]],
  pin: [['path', { d: 'M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z' }], ['circle', { cx: 12, cy: 9.5, r: 2.5 }]],
  end: [['polyline', { points: '5 5 12 12 5 19' }], ['polyline', { points: '12 5 19 12 12 19' }]],
  step: [['polygon', { points: '5 5 14 12 5 19 5 5' }], ['line', { x1: 18, y1: 5, x2: 18, y2: 19 }]],
  replay: [['polyline', { points: '1 4 1 10 7 10' }], ['path', { d: 'M3.5 15a9 9 0 1 0 2.1-9.4L1 10' }], ['polygon', { points: '10 9 15 12 10 15 10 9' }]],
};
const ico = (name, cls = 'ds-icon') => s('svg', { class: cls, viewBox: '0 0 24 24', 'aria-hidden': 'true' }, MY_ICONS[name].map(([t, a]) => s(t, a)));

// 지도 이름표 놓는 쪽(r 오른쪽, l 왼쪽, t 위, b 아래)과 흐름선 휘는 정도
const LAYOUT = {
  glass: { lp: 'l', bend: 0.10 }, mirror: { lp: 'b', bend: 0.04 }, airbag: { lp: 'r', bend: -0.02 }, audio: { lp: 't', bend: 0.15 },
  aircon: { lp: 'r', bend: 0.25 }, wheel: { lp: 't', bend: 0.12 }, chip: { lp: 'b', bend: 0.06 },
  wire: { lp: 'l', bend: 0.15 }, bumper: { lp: 'l', bend: 0.12 }, tire: { lp: 't', bend: 0.4 },
};
const BACKUP_LP = { chip: 'r', wire: 'b', glass: 'l' };
const STATUS = {
  run: { text: '공장 가동 중', cls: 'sc-run' },
  slow: { text: '공장 덜 가동', cls: 'sc-slow' },
  stop: { text: '공장 멈춤', cls: 'sc-stop' },
};
const fmtW = (v) => (Math.round(v * 10) / 10).toFixed(Number.isInteger(Math.round(v * 10) / 10) ? 0 : 1);

export default function mount(root, opts = {}) {
  const { stage, panel } = createShell(root, ID);
  stage.classList.add('sc-stage');

  // ---------- 지도 투영 (태평양 중심) ----------
  const proj = geoNaturalEarth1().rotate([-150, 0]).scale(100).translate([0, 0]);
  const path = geoPath(proj);
  const countries = feature(topo, topo.objects.countries).features;
  const box = (() => {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (let lo = -26; lo <= 286; lo += 2) for (const la of [-4, 10, 30, 50, 68]) {
      const [x, y] = proj([lo, la]);
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    }
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  })();
  const involved = new Set([...PARTS.map((p) => p.iso), ...Object.values(STRATEGIES.multi.backups).map((b) => b.iso)]);

  // ---------- 무대: 지도 ----------
  const gCountries = s('g', { class: 'sc-countries' });
  const countryEls = new Map();
  for (const f of countries) {
    const d = path(f);
    if (!d) continue;
    const el = s('path', { class: `sc-country${involved.has(f.id) ? ' sc-inv' : ''}${f.id === FACTORY.iso ? ' sc-home' : ''}`, d });
    gCountries.append(el);
    countryEls.set(f.id, el);
  }
  const gFlows = s('g', { class: 'sc-flows' });
  const gDots = s('g', { class: 'sc-dots' });
  const svg = s('svg', { class: 'sc-svg', viewBox: `${box.x} ${box.y} ${box.w} ${box.h}`, preserveAspectRatio: 'xMidYMid meet', role: 'img', 'aria-label': '부품 생산지에서 대한민국 조립 공장으로 부품이 오는 길을 나타낸 세계 지도' },
    s('path', { class: 'sc-ocean', d: path({ type: 'Sphere' }) }),
    s('path', { class: 'sc-grat', d: path(geoGraticule().step([30, 30])()) }),
    gCountries, gFlows, gDots);
  const overlay = h('div', { class: 'sc-ov' });

  const hudWeek = h('b', { class: 'sc-hud-week' });
  const hudStatus = h('span', { class: 'sc-pill' });
  const hudWait = h('span', { class: 'sc-hud-wait' });
  const hudMode = h('span', { class: 'sc-hud-mode' });
  const hud = h('div', { class: 'sc-hud' }, hudWeek, hudStatus, hudWait, hudMode);

  const legBackup = h('li', { class: 'sc-leg' }, legLine('sc-l-backup'), '추가 공급처에서 오는 길');
  const legend = h('ul', { class: 'sc-legend' },
    h('li', { class: 'sc-leg' }, h('span', { class: 'sc-fac sc-fac-sm' }, ico('factory', 'sc-fac-ico')), `${FACTORY.name}(${FACTORY.country})`),
    h('li', { class: 'sc-leg' }, legLine('sc-l-on'), '부품이 오는 길'),
    h('li', { class: 'sc-leg' }, legLine('sc-l-stop'), '공급 멈춤'),
    legBackup);
  const toast = h('div', { class: 'sc-toast', role: 'status' });
  toast.hidden = true;
  const mapBox = h('div', { class: 'sc-map', style: { aspectRatio: `${box.w.toFixed(1)} / ${box.h.toFixed(1)}` } }, svg, overlay, legend, toast);

  // ---------- 무대: 사건 카드와 그래프 ----------
  const cards = new Map();
  const cardCol = h('div', { class: 'sc-cards' },
    h('div', { class: 'sc-cards-head' }, h('b', {}, '사건 카드'), h('span', { class: 'sc-cards-tip' }, '나라에 끌어다 놓거나 눌러요')));
  for (const ev of EVENTS) {
    const part = PARTS.find((p) => p.id === ev.part);
    const state = h('span', { class: 'sc-card-state' });
    const el = h('div', { class: 'sc-card', role: 'button', tabindex: 0, 'aria-label': `${ev.country} ${ev.title} 사건 일으키기` },
      h('div', { class: 'sc-card-top' }, ico('grip', 'sc-grip'),
        h('span', { class: 'sc-card-where' }, ico('pin', 'sc-mini'), ev.country),
        h('b', { class: 'sc-card-title' }, ev.title)),
      h('p', { class: 'sc-card-text' }, ev.text),
      h('div', { class: 'sc-card-foot' }, h('span', { class: 'sc-card-eff' }, `${part.name} 공급 ${ev.weeks}주 멈춤`, h('small', { class: 'sc-mod' }, ' (모형 수치)')), state));
    cardCol.append(el);
    cards.set(ev.id, { ev, el, state });
    bindCard(ev, el);
  }

  const chartSvg = s('svg', { class: 'sc-chart', role: 'img', 'aria-label': '주마다 만든 차 대수와 출고 대기 주 수 그래프' });
  const chartBox = h('div', { class: 'sc-chartbox' }, chartSvg);
  const bottom = h('div', { class: 'sc-bottom' }, cardCol, chartBox);
  stage.append(hud, mapBox, bottom);

  // ---------- 지도 위 표시: 부품 생산지, 추가 공급처, 조립 공장 ----------
  const fac = proj([FACTORY.lon, FACTORY.lat]);
  // 조립 공장 이름은 범례에 둔다(동아시아에 이름표가 몰려 겹치므로)
  const factoryMk = h('div', { class: 'sc-mk sc-mk-factory', title: `${FACTORY.name} (${FACTORY.country})` }, h('span', { class: 'sc-fac' }, ico('factory', 'sc-fac-ico')));

  function makeFlow(from, bend, cls) {
    const a = from, b = fac;
    const dx = b[0] - a[0], dy = b[1] - a[1], d = Math.hypot(dx, dy) || 1;
    let nx = dy / d, ny = -dx / d;
    if (ny > 0) { nx = -nx; ny = -ny; }
    const cx = (a[0] + b[0]) / 2 + nx * bend * d, cy = (a[1] + b[1]) / 2 + ny * bend * d;
    const pts = [];
    let len = 0;
    for (let i = 0; i <= N_SAMPLE; i++) {
      const t = i / N_SAMPLE, u = 1 - t;
      const p = [u * u * a[0] + 2 * u * t * cx + t * t * b[0], u * u * a[1] + 2 * u * t * cy + t * t * b[1]];
      if (i) len += Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]);
      pts.push(p);
    }
    const line = s('polyline', { class: `sc-flow ${cls}`, points: pts.map((p) => `${p[0].toFixed(2)},${p[1].toFixed(2)}`).join(' '), 'vector-effect': 'non-scaling-stroke' });
    gFlows.append(line);
    const n = Math.max(1, Math.round(len / 14));
    const dots = Array.from({ length: n }, () => { const c = s('circle', { class: `sc-dot ${cls}`, r: 1.3 }); gDots.append(c); return c; });
    return { pts, len, line, dots, phase: Math.random() };
  }
  const at = (pts, t) => {
    const u = Math.min(0.9999, Math.max(0, t)) * N_SAMPLE, i = Math.floor(u), f = u - i;
    return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * f, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * f];
  };

  const marks = [];
  const parts = new Map();
  for (const p of PARTS) {
    const L = LAYOUT[p.id];
    const xy = proj([p.lon, p.lat]);
    const flow = makeFlow(xy, L.bend, 'sc-f-main');
    const left = h('span', { class: 'sc-lab-left' });
    const lab = h('span', { class: `sc-lab sc-lab-${L.lp}`, style: L.dx ? { marginLeft: `${L.dx}px` } : null }, h('b', { class: 'sc-lab-n' }, p.name), h('span', { class: 'sc-lab-c' }, p.country), left);
    const el = h('div', { class: 'sc-mk' }, h('span', { class: 'sc-pt' }), h('span', { class: 'sc-ring' }), lab);
    overlay.append(el);
    marks.push({ el, xy });
    parts.set(p.id, { p, el, flow, left, xy });
  }
  const backups = new Map();
  for (const [pid, b] of Object.entries(STRATEGIES.multi.backups)) {
    const p = PARTS.find((x) => x.id === pid);
    const xy = proj([b.lon, b.lat]);
    const flow = makeFlow(xy, 0.08, 'sc-f-backup');
    const el = h('div', { class: 'sc-mk sc-mk-backup' }, h('span', { class: 'sc-pt' }),
      h('span', { class: `sc-lab sc-lab-${BACKUP_LP[pid]}` }, h('b', { class: 'sc-lab-n' }, p.name), h('span', { class: 'sc-lab-c' }, `${b.country} (추가)`)));
    overlay.append(el);
    marks.push({ el, xy });
    backups.set(pid, { el, flow });
  }
  overlay.append(factoryMk);
  marks.push({ el: factoryMk, xy: fac });

  // ---------- 사이드바 ----------
  const playBtn = h('button', { class: 'ds-btn ds-primary sc-play', type: 'button', on: { click: togglePlay } });
  const stepBtn = h('button', { class: 'ds-btn', type: 'button', on: { click: () => { pause(); advance(); } } }, ico('step'), '한 주');
  const endBtn = h('button', { class: 'ds-btn', type: 'button', on: { click: () => { pause(); while (sim.week < WEEKS) advance(true); render(); } } }, ico('end'), '끝까지');
  const resetBtn = h('button', { class: 'ds-btn', type: 'button', on: { click: () => startFree() } }, icon('reset'), '처음부터');
  const progFill = h('span', { class: 'sc-prog-fill' });
  const progText = h('span', { class: 'sc-prog-t' });
  addBlock(panel, h('div', { class: 'ds-ctl' },
    h('div', { class: 'ds-row' }, playBtn, stepBtn),
    h('div', { class: 'ds-row' }, endBtn, resetBtn),
    h('div', { class: 'sc-prog' }, h('span', { class: 'sc-prog-bar' }, progFill), progText)));

  const stockRows = new Map();
  const STOCK_MAX = Math.max(...Object.values(STRATEGIES).map((x) => x.stockWeeks)) * DEMAND;
  const stockTarget = h('span', { class: 'sc-stock-target' });
  addBlock(panel, h('section', { class: 'sc-stockbox' },
    h('div', { class: 'sc-sec-head' }, h('h2', { class: 'ds-h2' }, '부품 재고'), h('span', { class: 'sc-model' }, '모형 수치')),
    h('p', { class: 'sc-help' }, '막대 1칸 = 차 100대를 만들 부품(1주치). 하나라도 0이 되면 공장이 멈춰요.'),
    h('ul', { class: 'sc-stock' }, PARTS.map((p) => {
      const fill = h('span', { class: 'sc-bar-fill' });
      const val = h('span', { class: 'sc-stock-v' });
      const row = h('li', { class: 'sc-stock-row' },
        h('span', { class: 'sc-stock-name' }, h('b', { class: 'sc-sn' }, p.name), ' ', h('small', { class: 'sc-sc' }, p.country)),
        h('span', { class: 'sc-bar' }, fill, h('span', { class: 'sc-bar-ticks' })),
        val);
      stockRows.set(p.id, { row, fill, val });
      return row;
    })),
    stockTarget));

  const segBtns = new Map();
  const recText = h('p', { class: 'sc-rec' });
  const replayBtn = h('button', { class: 'ds-btn ds-primary sc-replay', type: 'button', on: { click: startReplay } }, ico('replay'), '같은 사건으로 다시 해 보기');
  const stratBox = addBlock(panel, h('section', { class: 'sc-strat' },
    h('div', { class: 'sc-sec-head' }, h('span', { class: 'sc-stepno' }, '2단계'), h('h2', { class: 'ds-h2' }, '대비해 보기')),
    h('div', { class: 'sc-choices', role: 'radiogroup', 'aria-label': '대비 방법' },
      [['multi', '같은 부품을 다른 나라에서도 받아요. 평소 비용이 조금 올라요.'], ['stock', '부품을 창고에 5주치 쌓아 둬요. 창고비가 들어요.']].map(([k, desc]) => {
        const b = h('button', { class: 'sc-choice', type: 'button', role: 'radio', on: { click: () => { chosen = k; renderStrat(); } } },
          h('b', { class: 'sc-choice-n' }, STRATEGIES[k].name), h('span', { class: 'sc-choice-d' }, desc));
        segBtns.set(k, b);
        return b;
      })),
    recText, replayBtn));

  const cmpBody = h('tbody', {});
  const cmpBox = addBlock(panel, h('section', { class: 'sc-cmp' },
    h('div', { class: 'sc-sec-head' }, h('h2', { class: 'ds-h2' }, '결과 비교'), h('span', { class: 'sc-model' }, '모형 수치')),
    h('table', { class: 'sc-table' },
      h('thead', {}, h('tr', {}, h('th', { class: 'sc-th sc-th-k' }, '대비'), h('th', { class: 'sc-th' }, '공장 멈춘 주'), h('th', { class: 'sc-th' }, '가장 긴 출고 대기'), h('th', { class: 'sc-th' }, '비용 지수'))),
      cmpBody),
    h('p', { class: 'sc-help' }, '비용 지수: 대비 없이 평소 한 주에 드는 비용을 100으로 볼 때의 값')));
  cmpBox.hidden = true;

  addBlock(panel, h('div', { class: 'ds-note sc-note' },
    h('b', { class: 'sc-note-b' }, '모형 수치로 움직여요. '),
    `주문은 한 주에 ${DEMAND}대, 공장은 밀린 주문이 있으면 한 주에 ${CAPACITY}대까지 만들어요. `,
    '공급이 다시 시작돼도 부품이 오는 데 한 주가 걸려요. 실제 회사의 숫자가 아니에요.'));
  addBlock(panel, h('div', { class: 'ds-note sc-src' },
    h('b', { class: 'sc-note-b' }, '자료 출처 '),
    '부품과 생산지, 사건: 중학교 사회1 14쪽 「내 자동차는 도대체 언제 출고되지?」. 지도: Natural Earth(world-atlas). 추가 공급처와 모든 수치는 가정한 모형 수치예요.'));

  // ---------- 상태 ----------
  let sim = createState('none');
  let mode = 'free'; // 'free' 1단계 | 'replay' 2단계 다시 해 보기
  let sched = []; // 1단계에서 일으킨 사건 기록
  let baseHist = null; // 다시 해 보기 때 견줄 「대비 없음」 결과
  let chosen = 'multi';
  const results = new Map(); // 대비 → summarize 결과 (sched 기준)
  let playing = false, acc = 0;
  let toastTimer = 0;
  let reveal = false; // 다시 해 보기가 끝나면 비교 표가 보이게 사이드바를 내린다

  function startFree() {
    pause();
    sim = createState('none');
    mode = 'free';
    baseHist = null;
    render();
  }
  function startReplay() {
    if (!sched.length) return;
    sim = createState(chosen, sched);
    mode = 'replay';
    baseHist = simulate('none', sched).history;
    acc = 0;
    playing = true;
    render();
  }

  function advance(quiet) {
    if (sim.week >= WEEKS) return;
    step(sim);
    if (sim.week >= WEEKS) {
      pause();
      if (mode === 'replay') {
        results.set('none', summarize(simulate('none', sched)));
        results.set(sim.strategy, summarize(sim));
        reveal = true;
      } else if (sim.applied.length) {
        results.set('none', summarize(sim));
        flash(stratBox);
      }
    }
    if (!quiet) render();
  }

  function trigger(eventId) {
    const ev = eventById(eventId);
    if (mode === 'replay') { say('다시 해 보기에서는 기록한 사건이 같은 주에 저절로 일어나요.'); return; }
    if (sim.week >= WEEKS) { say('기간이 끝났어요. 「처음부터」를 눌러 다시 시작해요.'); return; }
    if (!applyEvent(sim, eventId)) { say('이 사건은 이미 일어났어요.'); return; }
    sched = sim.applied.map((x) => ({ ...x }));
    results.clear();
    const pr = parts.get(ev.part);
    pr.el.classList.remove('sc-burst'); void pr.el.offsetWidth; pr.el.classList.add('sc-burst');
    say(`${ev.country} ${ev.title}: 다음 주부터 ${pr.p.name} 공급이 ${ev.weeks}주 동안 멈춰요.`);
    render();
  }

  // ---------- 카드 끌기 ----------
  let hoverIso = null;
  function bindCard(ev, el) {
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); trigger(ev.id); } });
    el.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || el.classList.contains('sc-used')) return;
      e.preventDefault();
      const sx = e.clientX, sy = e.clientY;
      let ghost = null;
      const move = (m) => {
        if (!ghost && Math.hypot(m.clientX - sx, m.clientY - sy) < 6) return;
        if (!ghost) {
          ghost = h('div', { class: 'sc-ghost' }, ico('pin', 'sc-mini'), `${ev.country} ${ev.title}`);
          stage.append(ghost);
          el.classList.add('sc-dragging');
        }
        const r = stage.getBoundingClientRect();
        // 오른쪽 끝에서는 이름표를 손가락 왼쪽에 둔다
        const gx = m.clientX - r.left + 12 + ghost.offsetWidth > r.width - 4 ? m.clientX - r.left - 12 - ghost.offsetWidth : m.clientX - r.left + 12;
        ghost.style.transform = `translate(${gx}px, ${m.clientY - r.top + 12}px)`;
        setHover(countryAt(m.clientX, m.clientY));
      };
      const up = (u) => {
        el.removeEventListener('pointermove', move);
        el.removeEventListener('pointerup', up);
        el.removeEventListener('pointercancel', up);
        el.classList.remove('sc-dragging');
        if (!ghost) { trigger(ev.id); return; }
        ghost.remove();
        const iso = countryAt(u.clientX, u.clientY);
        setHover(null);
        if (iso === ev.iso) trigger(ev.id);
        else if (iso !== undefined) say(`이 사건은 ${ev.country}에서 일어났어요. ${ev.country}에 놓아 보세요.`);
      };
      // 포인터를 카드에 붙잡아 두고 카드에서만 듣는다(문서 전체에 손대지 않음)
      el.setPointerCapture(e.pointerId);
      el.addEventListener('pointermove', move);
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
    });
  }
  /** 화면 좌표 → 나라 번호. 지도 밖이면 undefined, 바다면 null */
  function countryAt(cx, cy) {
    const r = mapBox.getBoundingClientRect();
    if (cx < r.left || cx > r.right || cy < r.top || cy > r.bottom) return undefined;
    const m = svg.getScreenCTM();
    if (!m) return null;
    const inv = m.inverse();
    const x = inv.a * cx + inv.c * cy + inv.e, y = inv.b * cx + inv.d * cy + inv.f;
    // 생산지 점 가까이에 놓아도 그 나라로 친다
    for (const pr of parts.values()) if (Math.hypot(pr.xy[0] - x, pr.xy[1] - y) * m.a < 22) return pr.p.iso;
    const ll = proj.invert([x, y]);
    if (!ll) return null;
    for (const f of countries) if (involved.has(f.id) && geoContains(f, ll)) return f.id;
    for (const f of countries) if (geoContains(f, ll)) return f.id;
    return null;
  }
  function setHover(iso) {
    if (iso === hoverIso) return;
    if (hoverIso) countryEls.get(hoverIso)?.classList.remove('sc-hover');
    hoverIso = iso || null;
    if (hoverIso) countryEls.get(hoverIso)?.classList.add('sc-hover');
  }

  function say(text) {
    toast.textContent = text;
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.hidden = true; }, 3200);
  }
  function flash(el) { el.classList.remove('sc-flash'); void el.offsetWidth; el.classList.add('sc-flash'); }

  // ---------- 재생 ----------
  function togglePlay() {
    if (playing) { pause(); return; }
    if (sim.week >= WEEKS) { if (mode === 'replay') startReplay(); else startFree(); }
    playing = true;
    acc = 0;
    renderPlay();
  }
  function pause() { playing = false; renderPlay(); }
  function renderPlay() {
    playBtn.replaceChildren(icon(playing ? 'pause' : 'play'), playing ? '일시 정지' : '재생');
    playBtn.setAttribute('aria-pressed', String(playing));
  }

  // ---------- 그리기 ----------
  function render() {
    const last = sim.history[sim.history.length - 1];
    const stat = STATUS[factoryStatus(last)];
    hudWeek.textContent = sim.week ? `${sim.week}주 차` : '시작 전';
    hudStatus.className = `sc-pill ${stat.cls}`;
    hudStatus.replaceChildren(ico('factory', 'sc-mini'), stat.text, last ? ` ${last.produced}대` : '');
    hudWait.replaceChildren('출고 대기 ', h('b', {}, `${fmtW(sim.backlog / DEMAND)}주`));
    hudWait.classList.toggle('sc-bad', sim.backlog > 0);
    hudMode.textContent = mode === 'replay' ? `다시 해 보기: ${STRATEGIES[sim.strategy].name}` : '1단계: 사건 일으키기';
    hudMode.classList.toggle('sc-hud-replay', mode === 'replay');
    factoryMk.className = `sc-mk sc-mk-factory ${stat.cls}`;

    progFill.style.width = `${(sim.week / WEEKS) * 100}%`;
    progText.textContent = `${sim.week} / ${WEEKS}주`;
    stepBtn.disabled = endBtn.disabled = sim.week >= WEEKS;
    renderPlay();

    // 부품 재고와 지도 표시
    const multi = sim.strategy === 'multi';
    for (const [id, pr] of parts) {
      const stopped = isStopped(sim, id);
      const left = stopLeft(sim, id);
      pr.el.classList.toggle('sc-stopped', stopped);
      pr.flow.line.classList.toggle('sc-f-stop', stopped);
      pr.flow.dots.forEach((c) => c.classList.toggle('sc-f-stop', stopped));
      pr.left.textContent = stopped ? `공급 멈춤 ${left}주 남음` : '';
      pr.left.hidden = !stopped;
      const r = stockRows.get(id);
      const v = sim.stock[id];
      r.fill.style.width = `${(v / STOCK_MAX) * 100}%`;
      r.val.textContent = `${fmtW(v / DEMAND)}주치`;
      r.row.classList.toggle('sc-low', v < DEMAND);
      r.row.classList.toggle('sc-empty', v <= 0);
      r.row.classList.toggle('sc-cut', stopped);
    }
    for (const [, b] of backups) {
      b.el.hidden = !multi;
      b.flow.line.style.display = multi ? '' : 'none';
      b.flow.dots.forEach((c) => { c.style.display = multi ? '' : 'none'; });
    }
    legBackup.hidden = !multi;
    stockTarget.textContent = `지금 창고 목표: 부품마다 ${STRATEGIES[sim.strategy].stockWeeks}주치 (${STRATEGIES[sim.strategy].name})`;

    // 사건 카드
    for (const { ev, el, state } of cards.values()) {
      const done = sim.applied.find((a) => a.event === ev.id);
      const planned = mode === 'replay' && sched.find((a) => a.event === ev.id);
      el.classList.toggle('sc-used', !!done || mode === 'replay' || sim.week >= WEEKS);
      el.classList.toggle('sc-on', !!done);
      el.classList.toggle('sc-plan', !!planned && !done);
      state.textContent = done ? `${done.at + 1}주 차부터 멈춤` : planned ? `${planned.at + 1}주 차부터 다시 멈춰요` : mode === 'replay' ? '이번에는 없음' : '';
    }

    renderStrat();
    renderCompare();
    drawChart();
    if (reveal) { reveal = false; panel.scrollTop = Math.max(0, cmpBox.offsetTop - panel.offsetTop - 40); flash(cmpBox); }
  }

  function renderStrat() {
    for (const [k, b] of segBtns) b.setAttribute('aria-checked', String(k === chosen));
    stratBox.classList.toggle('sc-off', !sched.length);
    replayBtn.disabled = !sched.length;
    recText.textContent = sched.length
      ? `기록한 사건: ${sched.map((x) => `${x.at + 1}주 차부터 ${eventById(x.event).title}`).join(', ')}`
      : '먼저 1단계에서 사건 카드를 하나 이상 써 보세요.';
  }

  function renderCompare() {
    const rows = ['none', 'multi', 'stock'].filter((k) => results.has(k));
    cmpBox.hidden = rows.length < 2;
    cmpBody.replaceChildren(...rows.map((k) => {
      const r = results.get(k);
      return h('tr', { class: k === sim.strategy && mode === 'replay' ? 'sc-tr-cur' : null },
        h('th', { class: 'sc-td sc-td-k' }, STRATEGIES[k].name),
        h('td', { class: 'sc-td' }, `${r.stoppedWeeks}주`),
        h('td', { class: 'sc-td' }, `${fmtW(r.maxWait)}주`),
        h('td', { class: 'sc-td' }, String(r.cost)));
    }));
  }

  // 그래프: 넓고 낮은 실시간 그래프라 csat-chart.js(시험지 양식, 500×400 이상)로는 맞지 않아 SVG 로 직접 그린다.
  function drawChart() {
    const W = chartBox.clientWidth || 600, H = chartBox.clientHeight || 220;
    chartSvg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    const L = 44, R = 12, T = 6;
    const gap = 26;
    const ph = (H - T - gap - 22) / 2; // 두 칸 높이
    const xw = (W - L - R) / WEEKS;
    const xOf = (w) => L + (w - 1) * xw;
    const out = [];
    const txt = (x, y, str, cls, anchor = 'start') => s('text', { x, y, class: cls, 'text-anchor': anchor }, str);

    // 위: 주마다 만든 차
    const y1 = (v) => T + 16 + (ph - 16) * (1 - v / CAPACITY);
    out.push(txt(L, T + 10, '주마다 만든 차(대)', 'sc-ch-title'), txt(W - R, T + 10, '모형 수치', 'sc-ch-note', 'end'));
    for (const v of [0, 100, 150]) {
      out.push(s('line', { x1: L, x2: W - R, y1: y1(v), y2: y1(v), class: v === 100 ? 'sc-ch-ref' : 'sc-ch-grid' }), txt(L - 6, y1(v) + 4, String(v), 'sc-ch-ax', 'end'));
    }
    out.push(txt(W - R - 2, y1(100) - 4, '주문 100대', 'sc-ch-reflab', 'end'));
    for (const r of sim.history) {
      const st = factoryStatus(r);
      const hgt = Math.max(0, y1(0) - y1(r.produced));
      out.push(s('rect', { x: xOf(r.week) + 1.5, y: y1(r.produced), width: Math.max(1, xw - 3), height: hgt, class: `sc-ch-bar sc-cb-${st}` }));
      if (r.produced === 0) out.push(txt(xOf(r.week) + xw / 2, y1(0) - 3, '0', 'sc-ch-zero', 'middle'));
    }

    // 아래: 출고 대기(주)
    const top2 = T + ph + gap;
    const maxWait = Math.max(3, ...sim.history.map((r) => r.wait), ...(baseHist || []).map((r) => r.wait));
    const yMax = Math.ceil(maxWait);
    const y2 = (v) => top2 + 16 + (ph - 16) * (1 - v / yMax);
    out.push(txt(L, top2 + 10, '출고 대기(주)', 'sc-ch-title'));
    for (const v of [0, Math.round(yMax / 2), yMax]) {
      out.push(s('line', { x1: L, x2: W - R, y1: y2(v), y2: y2(v), class: 'sc-ch-grid' }), txt(L - 6, y2(v) + 4, String(v), 'sc-ch-ax', 'end'));
    }
    const linePts = (hist) => [[xOf(1), y2(0)], ...hist.map((r) => [xOf(r.week) + xw, y2(r.wait)])];
    if (baseHist) {
      const pts = linePts(baseHist);
      out.push(s('polyline', { class: 'sc-ch-base', points: pts.map((p) => p.join(',')).join(' ') }));
      const peak = baseHist.reduce((m, r) => (r.wait > m.wait ? r : m), baseHist[0]);
      if (peak.wait > 0) out.push(txt(xOf(peak.week) + xw + 4, y2(peak.wait) + 4, '대비 없음', 'sc-ch-baselab'));
    }
    if (sim.history.length) {
      const pts = linePts(sim.history);
      out.push(s('polygon', { class: 'sc-ch-area', points: [...pts, [pts[pts.length - 1][0], y2(0)]].map((p) => p.join(',')).join(' ') }));
      out.push(s('polyline', { class: 'sc-ch-line', points: pts.map((p) => p.join(',')).join(' ') }));
    }
    // 주 눈금
    for (let w = 1; w <= WEEKS; w++) if (w === 1 || w % 4 === 0) out.push(txt(xOf(w) + xw / 2, H - 6, `${w}`, 'sc-ch-ax', 'middle'));
    out.push(txt(L - 6, H - 6, '주', 'sc-ch-ax', 'end'));
    if (sim.week < WEEKS && sim.week > 0) out.push(s('line', { x1: xOf(sim.week) + xw, x2: xOf(sim.week) + xw, y1: T, y2: H - 18, class: 'sc-ch-now' }));
    chartSvg.replaceChildren(...out);
  }

  // 지도 위 HTML 표시 자리 맞추기
  function place() {
    const m = svg.getScreenCTM();
    const r = mapBox.getBoundingClientRect();
    if (!m) return;
    for (const { el, xy } of marks) {
      const x = m.a * xy[0] + m.e - r.left, y = m.d * xy[1] + m.f - r.top;
      el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
    }
  }
  const ro = new ResizeObserver(() => { place(); drawChart(); });
  ro.observe(mapBox);
  ro.observe(chartBox);

  // ---------- 움직임 ----------
  let lastTs = 0;
  function frame(ts) {
    if (!root.isConnected) return;
    const dt = Math.min(0.1, (ts - (lastTs || ts)) / 1000);
    lastTs = ts;
    if (playing) {
      acc += dt;
      if (acc >= WEEK_SEC) { acc -= WEEK_SEC; advance(); }
    }
    const moving = playing;
    const multi = sim.strategy === 'multi';
    const flows = [...[...parts.values()].map((pr) => [pr.flow, !isStopped(sim, pr.p.id)]), ...(multi ? [...backups.values()].map((b) => [b.flow, true]) : [])];
    for (const [fl, live] of flows) {
      if (moving && live) fl.phase = (fl.phase + dt * 22 / fl.len) % 1;
      const n = fl.dots.length;
      for (let i = 0; i < n; i++) {
        const [x, y] = at(fl.pts, (fl.phase + i / n) % 1);
        fl.dots[i].setAttribute('cx', x.toFixed(2));
        fl.dots[i].setAttribute('cy', y.toFixed(2));
      }
    }
    requestAnimationFrame(frame);
  }

  // ---------- 확인용 장면 ----------
  if (opts.scene === 'normal') { for (let i = 0; i < 4; i++) step(sim); }
  if (opts.scene === 'chip') {
    for (let i = 0; i < 2; i++) step(sim);
    applyEvent(sim, 'texas'); sched = sim.applied.map((x) => ({ ...x }));
    for (let i = 0; i < 4; i++) step(sim);
  }
  if (opts.scene === 'compare') {
    sched = [{ event: 'texas', at: 2 }];
    results.set('none', summarize(simulate('none', sched)));
    results.set('stock', summarize(simulate('stock', sched)));
    chosen = 'multi';
    sim = simulate('multi', sched);
    mode = 'replay';
    baseHist = simulate('none', sched).history;
    results.set('multi', summarize(sim));
    reveal = true;
  }

  render();
  requestAnimationFrame(() => { place(); drawChart(); });
  requestAnimationFrame(frame);
}

function legLine(cls) {
  return s('svg', { class: 'sc-leg-line', viewBox: '0 0 30 10', 'aria-hidden': 'true' },
    s('line', { x1: 2, y1: 5, x2: 28, y2: 5, class: `sc-ll ${cls}` }), s('circle', { cx: 15, cy: 5, r: 2.6, class: `sc-lc ${cls}` }));
}
