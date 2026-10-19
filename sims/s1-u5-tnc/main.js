// © 2026 김용현
// 초국적 기업의 발달 과정 — 세계 지도 위에 가상의 Z 기업이 단계별로 시설을 늘려 가는 모습.
// 교과서: 동아출판 중등 사회1 94~96쪽(초국적 기업의 성장 과정 → 공간적 분업 → 지역 변화).
// 규칙(EMBED_RULES.md): DOM 은 h()/s() 로만, 탐색은 root 안에서만.
import { geoNaturalEarth1, geoPath, geoArea, geoGraticule } from 'd3-geo';
import { createShell, addBlock } from '../../src/shared/shell.js';
import { h, s, icon } from '../../src/shared/dom.js';
import './style.css';
import world from './land-110m.json';
import { TYPES, KINDS, FACILITIES, FLOWS, GROUPS, STEPS, DEFINITION } from './data.js';

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const DWELL = 8; // 자동 재생 때 한 단계에 머무는 시간(초)
const N_SAMPLE = 48;

function typeIcon(type, cls = 'tnc-ti') {
  return s('svg', { class: cls, viewBox: '0 0 24 24', 'aria-hidden': 'true' }, TYPES[type].icon.map(([t, a]) => s(t, a)));
}
const infoIcon = () => s('svg', { class: 'tnc-ti', viewBox: '0 0 24 24', 'aria-hidden': 'true' },
  s('circle', { cx: 12, cy: 12, r: 9 }), s('path', { d: 'M12 11v6' }), s('path', { d: 'M12 7.5v.01' }));
const facName = (f) => f.name ?? TYPES[f.type].short ?? TYPES[f.type].name;

export default function mount(root) {
  const { stage, panel } = createShell(root, 's1-u5-tnc');

  // ---------- 지도 투영 (태평양 중심, 우리 교과서 세계 지도처럼) ----------
  const proj = geoNaturalEarth1().rotate([-150, 0]).scale(100).translate([0, 0]);
  const path = geoPath(proj);
  const landFeatures = world.land.map((poly) => {
    let g = { type: 'Polygon', coordinates: poly };
    // 고리 방향이 거꾸로면(넓이가 반구보다 크면) 뒤집는다
    if (geoArea(g) > 2 * Math.PI) g = { type: 'Polygon', coordinates: poly.map((r) => r.slice().reverse()) };
    return g;
  });
  const landD = landFeatures.map((g) => path(g)).join('');
  const sphereD = path({ type: 'Sphere' });
  const gratD = path(geoGraticule().step([30, 30])());
  const [[sx0], [sx1]] = path.bounds({ type: 'Sphere' });

  const boxOf = (lon0, lon1, lat0, lat1, pad = 0) => {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (let lo = lon0; lo <= lon1; lo += 2.5) for (let la = lat0; la <= lat1; la += 2.5) {
      const [x, y] = proj([lo, la]);
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    }
    return { x: x0 - pad, y: y0 - pad, w: x1 - x0 + 2 * pad, h: y1 - y0 + 2 * pad };
  };
  const VIEWS = {
    world: (() => { const top = proj([150, 74])[1], bot = proj([150, -50])[1]; return { x: sx0 - 4, y: top, w: sx1 - sx0 + 8, h: bot - top }; })(),
    na: boxOf(-128, -62, 14, 54, 2),
  };

  // ---------- 무대 ----------
  const hudN = h('span', { class: 'tnc-hud-n' });
  const hudG = h('span', { class: 'tnc-hud-g' });
  const hudT = h('h2', { class: 'tnc-hud-t' });
  const hud = h('div', { class: 'tnc-hud' }, h('div', { class: 'tnc-hud-top' }, hudN, hudG), hudT);

  const gFlows = s('g', { class: 'tnc-flows' });
  const gArrows = s('g', { class: 'tnc-arrows' });
  const gDots = s('g', { class: 'tnc-dots' });
  const svg = s('svg', { class: 'tnc-svg', preserveAspectRatio: 'xMidYMid meet', role: 'img', 'aria-label': '가상의 Z 기업 시설과 흐름을 나타낸 세계 지도' },
    s('path', { class: 'tnc-ocean', d: sphereD }),
    s('path', { class: 'tnc-grat', d: gratD }),
    s('path', { class: 'tnc-land', d: landD }),
    gFlows, gArrows, gDots);
  const overlay = h('div', { class: 'tnc-ov' });
  const company = h('div', { class: 'tnc-company' }, h('b', { class: 'tnc-company-name' }, '가상의 Z 기업'), ' 스마트 기기를 만드는 회사');
  const mapBox = h('div', { class: 'tnc-map' }, svg, overlay, company);

  const cardQuote = h('p', { class: 'tnc-quote' });
  const cardSrc = h('span', { class: 'tnc-quote-src' });
  const cardPoints = h('div', { class: 'tnc-points' });
  const card = h('section', { class: 'tnc-card', 'aria-live': 'polite' },
    h('div', { class: 'tnc-quote-box' }, cardQuote, cardSrc), cardPoints);
  stage.classList.add('tnc-stage');
  stage.append(hud, mapBox, card);

  // ---------- 시설 표시 ----------
  const fac = new Map();
  for (const f of FACILITIES) {
    const [x, y] = proj([f.lon, f.lat]);
    const T = TYPES[f.type];
    const why = h('span', { class: 'tnc-lab-why' }, f.why ?? '');
    const lab = h('span', { class: `tnc-lab tnc-lab-${f.lp || 'r'}` },
      h('b', { class: 'tnc-lab-name' }, facName(f)), h('span', { class: 'tnc-lab-place' }, f.place), why);
    const el = h('div', { class: 'tnc-mk', style: `--c:${T.color}`, title: `${facName(f)} · ${f.place}` },
      h('span', { class: 'tnc-badge' }, typeIcon(f.type)),
      s('svg', { class: 'tnc-xmark', viewBox: '0 0 24 24', 'aria-hidden': 'true' }, s('path', { d: 'M5 5l14 14M19 5L5 19' })),
      lab);
    overlay.append(el);
    fac.set(f.id, { f, x, y, el, why, lab, lw: 0, lh: 0 });
  }

  // ---------- 흐름 ----------
  const flows = FLOWS.map((F) => {
    const a = fac.get(F.from), b = fac.get(F.to);
    const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1;
    let nx = dy / d, ny = -dx / d;
    if (ny > 0) { nx = -nx; ny = -ny; }
    const cx = (a.x + b.x) / 2 + nx * F.bend * d, cy = (a.y + b.y) / 2 + ny * F.bend * d;
    const pts = [];
    let len = 0;
    for (let i = 0; i <= N_SAMPLE; i++) {
      const t = i / N_SAMPLE, u = 1 - t;
      const p = [u * u * a.x + 2 * u * t * cx + t * t * b.x, u * u * a.y + 2 * u * t * cy + t * t * b.y];
      if (i) len += Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]);
      pts.push(p);
    }
    const K = KINDS[F.kind];
    const line = s('polyline', { class: 'tnc-flow', fill: 'none', stroke: K.color, 'stroke-dasharray': K.dash || null, 'vector-effect': 'non-scaling-stroke' });
    const arrA = s('polygon', { class: 'tnc-arrow', fill: K.color });
    const arrB = s('polygon', { class: 'tnc-arrow', fill: K.color });
    gFlows.append(line);
    gArrows.append(arrA, arrB);
    const nDots = Math.max(2, Math.round(len / 55));
    const dots = Array.from({ length: nDots * 2 }, () => { const c = s('circle', { class: 'tnc-dot', fill: K.color }); gDots.append(c); return c; });
    const note = F.note ? h('span', { class: 'tnc-note', style: `--c:${K.color}` }, F.note) : null;
    if (note) overlay.append(note);
    return { F, pts, len, line, arrA, arrB, dots, nDots, note, prog: -1, state: null };
  });

  // ---------- 말풍선 ----------
  const callouts = STEPS.map((st) => (st.callouts || []).map((c) => {
    const el = h('div', { class: `tnc-call tnc-call-${c.dir}${c.tone ? ` tnc-call-${c.tone}` : ''}` },
      h('b', { class: 'tnc-call-head' }, c.head), h('span', { class: 'tnc-call-text' }, c.text));
    el.hidden = true;
    overlay.append(el);
    return { c, el };
  }));

  // ---------- 사이드바 ----------
  const prevBtn = h('button', { class: 'ds-btn', type: 'button', 'aria-label': '이전 단계', on: { click: () => { stop(); go(cur - 1); } } }, icon('prev'), '이전');
  const nextBtn = h('button', { class: 'ds-btn', type: 'button', 'aria-label': '다음 단계', on: { click: () => { stop(); go(cur + 1); } } }, '다음', icon('next'));
  const playBtn = h('button', { class: 'ds-btn ds-primary', type: 'button', on: { click: togglePlay } });
  const progFill = h('span', { class: 'tnc-prog-fill' });
  addBlock(panel, h('div', { class: 'ds-ctl' },
    h('div', { class: 'tnc-ctlrow' }, prevBtn, playBtn, nextBtn),
    h('div', { class: 'tnc-prog', 'aria-hidden': 'true' }, progFill)));

  const stepBtns = new Map();
  addBlock(panel, h('nav', { class: 'tnc-steps', 'aria-label': '단계 목록' },
    GROUPS.map((g) => h('div', { class: 'tnc-group' },
      h('div', { class: 'tnc-group-name' }, g.name, h('span', { class: 'tnc-group-page' }, `${g.page}쪽`)),
      g.steps.map((n) => {
        const st = STEPS[n - 1];
        const b = h('button', { class: 'tnc-step', type: 'button', on: { click: () => { stop(); go(n); } } },
          h('span', { class: 'tnc-step-n' }, String(n)), h('span', { class: 'tnc-step-t' }, st.short));
        stepBtns.set(n, b);
        return b;
      })))));

  const allLabels = h('input', { type: 'checkbox', class: 'tnc-chk', on: { change: () => overlay.classList.toggle('tnc-all', allLabels.checked) } });
  addBlock(panel, h('div', { class: 'tnc-legend-box' },
    h('h3', { class: 'ds-h2' }, '범례'),
    h('ul', { class: 'tnc-legend' }, Object.entries(TYPES).map(([k, T]) =>
      h('li', { class: 'tnc-leg', style: `--c:${T.color}` }, h('span', { class: 'tnc-badge tnc-badge-sm' }, typeIcon(k)), T.name))),
    h('ul', { class: 'tnc-legend tnc-legend-flow' }, Object.values(KINDS).map((K) =>
      h('li', { class: 'tnc-leg' },
        s('svg', { class: 'tnc-leg-line', viewBox: '0 0 34 10', 'aria-hidden': 'true' },
          s('line', { x1: 2, y1: 5, x2: 26, y2: 5, stroke: K.color, 'stroke-width': 2.5, 'stroke-dasharray': K.dash || null }),
          s('polygon', { points: '25,1 33,5 25,9', fill: K.color })),
        K.name))),
    h('label', { class: 'ds-check tnc-all-chk' }, allLabels, '모든 시설 이름 보기')));

  addBlock(panel, h('div', { class: 'ds-note tnc-def' },
    h('b', {}, '초국적 기업이란? '), DEFINITION, '을 말해요.', h('span', { class: 'tnc-def-src' }, ' (교과서 94쪽)')));

  // ---------- 상태 ----------
  let cur = 1, t0 = 0, playing = false, playT = 0;
  const vb = { ...VIEWS.na };
  let goal = VIEWS.na;
  let now = 0;

  function go(n) {
    n = Math.min(STEPS.length, Math.max(1, n));
    cur = n;
    t0 = now;
    playT = 0;
    const st = STEPS[n - 1];
    goal = VIEWS[st.view];
    hudN.textContent = `${n} / ${STEPS.length}`;
    const g = GROUPS.find((x) => x.steps.includes(n));
    hudG.textContent = `${g.name} · 교과서 ${g.page}쪽`;
    hudT.textContent = st.title;
    cardQuote.textContent = `“${st.quote}”`;
    cardSrc.textContent = `교과서 ${st.page}쪽`;
    cardPoints.replaceChildren(...st.points.map(([type, head, text]) =>
      h('div', { class: 'tnc-point', style: type ? `--c:${TYPES[type].color}` : null },
        h('span', { class: `tnc-badge tnc-badge-sm${type ? '' : ' tnc-badge-info'}` }, type ? typeIcon(type) : infoIcon()),
        h('div', { class: 'tnc-point-body' }, h('b', { class: 'tnc-point-head' }, head), h('span', { class: 'tnc-point-text' }, text)))));
    for (const [k, b] of stepBtns) { b.setAttribute('aria-current', k === n ? 'step' : 'false'); b.classList.toggle('tnc-done', k < n); }
    prevBtn.disabled = n === 1;
    nextBtn.disabled = n === STEPS.length;

    // 시설 상태
    let order = 0;
    for (const { f, el, why } of fac.values()) {
      const vis = f.step <= n;
      const isNew = f.step === n;
      const closed = f.closed != null && f.closed <= n;
      el.hidden = !vis;
      el.classList.toggle('tnc-new', isNew);
      el.classList.toggle('tnc-closed', closed);
      el.classList.toggle('tnc-hascall', !!(st.callouts || []).find((c) => c.at === f.id));
      why.hidden = !(isNew && f.why);
      el.style.setProperty('--d', isNew ? `${(order++) * 0.12}s` : '0s');
      if (isNew) { el.classList.remove('tnc-pop'); void el.offsetWidth; el.classList.add('tnc-pop'); } else el.classList.remove('tnc-pop');
    }
    // 흐름 상태
    let fi = 0;
    for (const fl of flows) {
      const F = fl.F;
      const dead = [F.from, F.to].some((id) => { const c = fac.get(id).f.closed; return c != null && c <= n; });
      const vis = F.step <= n && !dead;
      const bright = vis && (F.step === n || (st.active || []).includes(F.id) || F.both === n);
      fl.state = vis ? (bright ? 'on' : 'off') : null;
      fl.two = F.both != null && F.both <= n;
      fl.delay = F.step === n ? 0.35 + (fi++) * 0.1 : -10;
      fl.line.classList.toggle('tnc-off', fl.state === 'off');
      fl.prog = -1;
    }
    // 말풍선
    callouts.forEach((list, i) => list.forEach(({ el }) => {
      el.hidden = i !== n - 1;
      if (i === n - 1) { el.classList.remove('tnc-pop'); void el.offsetWidth; el.classList.add('tnc-pop'); el.style.setProperty('--d', `${0.5 + fi * 0.1}s`); }
    }));
    drawPlay();
  }

  function drawPlay() {
    playBtn.replaceChildren(icon(playing ? 'pause' : 'play'), playing ? '멈춤' : '자동 재생');
    playBtn.setAttribute('aria-pressed', String(playing));
  }
  function stop() { playing = false; drawPlay(); }
  function togglePlay() {
    if (!playing && cur === STEPS.length) go(1);
    playing = !playing;
    playT = 0;
    drawPlay();
  }

  // ---------- 그리기 ----------
  function fit() {
    const cw = mapBox.clientWidth || 1, ch = mapBox.clientHeight || 1;
    const k = Math.min(cw / vb.w, ch / vb.h);
    return { cw, ch, k, ox: (cw - vb.w * k) / 2 - vb.x * k, oy: (ch - vb.h * k) / 2 - vb.y * k };
  }
  const at = (pts, t) => {
    const u = clamp01(t) * N_SAMPLE, i = Math.min(N_SAMPLE - 1, Math.floor(u)), f = u - i;
    return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * f, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * f];
  };

  function arrow(poly, pts, fromEnd, k, show) {
    if (!show) { poly.setAttribute('points', ''); return; }
    const n = pts.length - 1;
    const tip = fromEnd ? pts[n] : pts[0];
    let j = fromEnd ? n - 1 : 1;
    // 시설 표시(반지름 약 13px)에 가리지 않을 만큼 물러선 곳에 화살촉을 둔다
    while (j > 0 && j < n && Math.hypot(pts[j][0] - tip[0], pts[j][1] - tip[1]) * k < 17) j += fromEnd ? -1 : 1;
    const p = pts[j], q = pts[fromEnd ? j - 1 : j + 1] || p;
    let dx = p[0] - q[0], dy = p[1] - q[1];
    const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d;
    const L = 8 / k, W = 4.2 / k;
    poly.setAttribute('points', `${p[0] + dx * L * 0.4},${p[1] + dy * L * 0.4} ${p[0] - dx * L * 0.6 - dy * W},${p[1] - dy * L * 0.6 + dx * W} ${p[0] - dx * L * 0.6 + dy * W},${p[1] - dy * L * 0.6 - dx * W}`);
  }

  function frame(ts) {
    const dt = Math.min(0.1, (ts - (frame.last || ts)) / 1000);
    frame.last = ts;
    now = ts / 1000;
    if (playing) {
      playT += dt;
      if (playT >= DWELL) { if (cur < STEPS.length) go(cur + 1); else stop(); }
    }
    progFill.style.width = `${playing ? (playT / DWELL) * 100 : 0}%`;

    // 시점 이동
    const e = 1 - Math.exp(-dt * 3.2);
    for (const key of ['x', 'y', 'w', 'h']) vb[key] += (goal[key] - vb[key]) * e;
    svg.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
    const { cw, ch, k, ox, oy } = fit();
    const scr = (x, y) => [x * k + ox, y * k + oy];

    const allOn = allLabels.checked;
    for (const m of fac.values()) {
      if (m.el.hidden) continue;
      const [px, py] = scr(m.x, m.y);
      m.el.style.transform = `translate(${px.toFixed(1)}px, ${py.toFixed(1)}px)`;
      // 보이는 이름표가 지도 밖으로 나가면 안쪽으로 민다
      const shown = allOn || (m.el.classList.contains('tnc-new') && !m.el.classList.contains('tnc-hascall'));
      if (!shown) continue;
      const w = m.lab.offsetWidth, hh = m.lab.offsetHeight;
      const lp = m.f.lp || 'r';
      let left = px - w / 2, top = py - hh / 2;
      if (lp === 'r') left = px + 17;
      if (lp === 'l') left = px - 17 - w;
      if (lp === 't') top = py - 17 - hh;
      if (lp === 'b') top = py + 17;
      const sx = left < 4 ? 4 - left : left + w > cw - 4 ? cw - 4 - left - w : 0;
      const sy = top < 4 ? 4 - top : top + hh > ch - 4 ? ch - 4 - top - hh : 0;
      if (sx !== m.sx) { m.lab.style.setProperty('--sx', `${sx.toFixed(1)}px`); m.sx = sx; }
      if (sy !== m.sy) { m.lab.style.setProperty('--sy', `${sy.toFixed(1)}px`); m.sy = sy; }
    }

    const el = now - t0;
    for (const fl of flows) {
      if (!fl.state) {
        if (fl.prog !== -2) { fl.line.setAttribute('points', ''); arrow(fl.arrA, fl.pts, true, k, false); arrow(fl.arrB, fl.pts, false, k, false); fl.dots.forEach((c) => c.setAttribute('r', 0)); if (fl.note) fl.note.hidden = true; fl.prog = -2; }
        continue;
      }
      const p = clamp01((el - fl.delay) / 0.8);
      if (p !== fl.prog) {
        const m = Math.ceil(p * N_SAMPLE);
        const seg = fl.pts.slice(0, m);
        if (p > 0) seg.push(at(fl.pts, p));
        fl.line.setAttribute('points', seg.map((q) => `${q[0].toFixed(2)},${q[1].toFixed(2)}`).join(' '));
        fl.prog = p;
      }
      const done = p >= 1;
      const op = fl.state === 'on' ? 1 : 0.3;
      fl.arrA.style.opacity = op; fl.arrB.style.opacity = op;
      arrow(fl.arrA, fl.pts, true, k, done);
      arrow(fl.arrB, fl.pts, false, k, done && fl.two);
      // 움직이는 점: 밝은 흐름에서만
      const live = done && fl.state === 'on';
      for (let i = 0; i < fl.dots.length; i++) {
        const c = fl.dots[i];
        const back = i >= fl.nDots;
        if (!live || (back && !fl.two)) { c.setAttribute('r', 0); continue; }
        let t = ((now * 42) / fl.len + (i % fl.nDots) / fl.nDots) % 1;
        if (back) t = 1 - ((t + 0.5 / fl.nDots) % 1);
        const [x, y] = at(fl.pts, t);
        c.setAttribute('cx', x.toFixed(2)); c.setAttribute('cy', y.toFixed(2)); c.setAttribute('r', (3 / k).toFixed(3));
      }
      if (fl.note) {
        fl.note.hidden = !live;
        if (live) { const [x, y] = scr(...at(fl.pts, 0.5)); fl.note.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`; }
      }
    }

    // 말풍선 (지도 밖으로 나가지 않게)
    for (const { c, el: box } of callouts[cur - 1]) {
      const a = fac.get(c.at);
      const [px, py] = scr(a.x, a.y);
      const bw = box.offsetWidth, bh = box.offsetHeight, g = 20;
      let left = px - bw / 2, top = py - g - bh;
      if (c.dir === 'b') top = py + g;
      if (c.dir === 'r') { left = px + g; top = py - bh / 2; }
      if (c.dir === 'l') { left = px - g - bw; top = py - bh / 2; }
      left = Math.min(cw - bw - 6, Math.max(6, left));
      top = Math.min(ch - bh - 6, Math.max(6, top));
      box.style.transform = `translate(${left.toFixed(1)}px, ${top.toFixed(1)}px)`;
    }
    requestAnimationFrame(frame);
  }

  drawPlay();
  go(1);
  Object.assign(vb, VIEWS.na);
  requestAnimationFrame(frame);
}
