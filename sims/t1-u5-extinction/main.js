// © 2026 김용현
// 지방 소멸 위험 카토그램: 시군구별 지방소멸위험지수(20~39세 여성 ÷ 65세 이상)를
// 행정구역 카토그램(제자리 축소)과 육각 돌링 카토그램(육각형 재배치)으로 보여 준다.
// 투영·경로·육각형 위치는 scripts/t1-u5-extinction/build_map.mjs 가 미리 계산한 값을 그대로 쓴다.
// 규칙(EMBED_RULES.md): DOM 은 h() 로만 만들고, 검색은 root 안에서만, fetch 없이 자료는 정적 import.
import { createShell, addBlock } from '../../src/shared/shell.js';
import { h, icon, clear } from '../../src/shared/dom.js';
import './style.css';
import data from './data/extinction.json';

const CLASSES = [
  { name: '소멸 고위험', range: '0.2 미만', color: '#a3141c', ink: '#fff' },
  { name: '소멸위험 진입', range: '0.2 ~ 0.5', color: '#e0603b', ink: '#fff' },
  { name: '소멸 주의', range: '0.5 ~ 1.0', color: '#f4bd8c', ink: '#1d2126' },
  { name: '보통', range: '1.0 ~ 1.5', color: '#8fc0de', ink: '#1d2126' },
  { name: '소멸 저위험', range: '1.5 이상', color: '#2f74b5', ink: '#fff' },
];
const N = 48;
const fmt = (n) => n.toLocaleString('ko-KR');
const fullName = (r) => (r.sido === r.name ? r.name : `${r.sido} ${r.name}`);
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const badge = (c) => h('span', { class: 'ext-badge', style: { background: c.color, color: c.ink } }, c.name);

function hexRing(x, y, rad) {
  const per = N / 6, pts = [];
  const v = (k) => { const a = -Math.PI / 2 + (k * Math.PI) / 3; return [x + rad * Math.cos(a), y + rad * Math.sin(a)]; };
  for (let k = 0; k < 6; k++) {
    const a = v(k), b = v(k + 1);
    for (let j = 0; j < per; j++) { const t = j / per; pts.push(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t); }
  }
  return pts;
}
function ringD(a, b, t) {
  let d = '';
  for (let k = 0; k < a.length; k += 2) {
    const x = a[k] + (b[k] - a[k]) * t, y = a[k + 1] + (b[k + 1] - a[k + 1]) * t;
    d += (k ? 'L' : 'M') + x.toFixed(1) + ',' + y.toFixed(1);
  }
  return d + 'Z';
}

export default function mount(root) {
  const { stage, panel } = createShell(root, 't1-u5-extinction');
  // 같은 자료를 여러 번 띄워도 서로 섞이지 않게 지역 객체를 새로 만든다
  const R = data.regions.map((r, i) => ({ ...r, i }));

  // ---------- 무대: SVG 지도 ----------
  const gGhost = h('g', { class: 'ext-ghost' });
  const gReg = h('g', { class: 'ext-reg' });
  const gHex = h('g', { class: 'ext-hexes' });
  const gLabel = h('g', { class: 'ext-labels' });
  const sidoPath = h('path', { class: 'ext-sido', d: data.sidoMesh });
  const hl = h('path', { class: 'ext-hl', d: '' });
  for (const r of R) {
    r.ghost = h('path', { class: 'ext-ghost-p', d: r.d });
    r.reg = h('path', { class: 'ext-reg-p', d: r.d, fill: CLASSES[r.cls].color, dataset: { i: r.i } });
    r.morph = h('path', { class: 'ext-hex-p', fill: CLASSES[r.cls].color, dataset: { i: r.i } });
    r.s = Math.sqrt(r.factor); // 면적 비율 → 길이 비율
    const [hx, hy, hr] = r.hex;
    r.hexPts = hexRing(hx, hy, hr);
    r.hr = hr;
    const short = r.sido === r.name ? '세종' : r.name;
    r.label = h('text', { class: 'ext-label', x: hx, y: hy, fill: CLASSES[r.cls].ink, 'font-size': (hr * (short.length > 3 ? 0.42 : 0.52)).toFixed(2) }, short);
    gGhost.append(r.ghost); gReg.append(r.reg); gHex.append(r.morph); gLabel.append(r.label);
  }
  const svg = h('svg', { class: 'ext-map', role: 'img', 'aria-label': '시군구별 지방소멸위험지수 지도' },
    h('g', {}, gGhost, h('path', { class: 'ext-outline', d: data.outline }), gReg, gHex, sidoPath, gLabel, hl));

  const zoomBtn = (name, label, fn) => h('button', { class: 'ext-zbtn', type: 'button', 'aria-label': label, title: label, on: { click: fn } }, icon(name));
  const caption = h('div', { class: 'ext-caption' });
  const tip = h('div', { class: 'ext-tip', hidden: true });
  stage.classList.add('ext-stage');
  stage.append(svg,
    h('div', { class: 'ext-zoom' },
      zoomBtn('plus', '확대', () => zoomAt(1.6)),
      zoomBtn('minus', '축소', () => zoomAt(1 / 1.6)),
      zoomBtn('expand', '전체 보기', () => { Object.assign(vb, home); applyVB(); })),
    caption, tip);

  // ---------- 사이드바 ----------
  const state = { mode: 'area', t: 0, playing: false, picked: null };
  const segBtns = [['area', '행정구역 카토그램'], ['hex', '육각 돌링 카토그램']].map(([mode, label]) =>
    h('button', { class: 'ds-seg-btn', type: 'button', dataset: { mode }, 'aria-pressed': String(mode === 'area'), on: { click: () => setMode(mode, true) } }, label));
  addBlock(panel, h('div', { class: 'ds-seg', role: 'group', 'aria-label': '카토그램 종류' }, segBtns));

  const morphOut = h('output', { class: 'ds-out' }, '0%');
  const morph = h('input', { class: 'ds-range', type: 'range', min: 0, max: 100, step: 1, value: 0, 'aria-label': '실제 지도에서 카토그램으로 바뀌는 정도',
    on: { input: (ev) => { stopAnim(); state.t = ev.target.value / 100; render(); } } });
  const playBtn = h('button', { class: 'ds-btn ds-primary', type: 'button', on: { click: () => {
    if (state.playing) return stopAnim();
    if (state.t >= 0.999) { state.t = 0; render(); }
    animateTo(1);
  } } });
  const backBtn = h('button', { class: 'ds-btn', type: 'button', on: { click: () => animateTo(0) } }, icon('reset'), '실제 지도');
  const sidoCheck = h('input', { class: 'ext-checkbox', type: 'checkbox', checked: true, on: { change: (ev) => { sidoPath.style.display = ev.target.checked ? '' : 'none'; } } });
  addBlock(panel, h('div', { class: 'ds-ctl' },
    h('label', { class: 'ds-label' }, '실제 지도 → 카토그램', morphOut),
    morph,
    h('div', { class: 'ds-row' }, playBtn, backBtn),
    h('label', { class: 'ds-check' }, sidoCheck, '시도 경계 보기')));

  const listId = `ext-sgg-${Math.random().toString(36).slice(2, 8)}`;
  const sorted = [...R].sort((a, b) => fullName(a).localeCompare(fullName(b), 'ko'));
  const search = h('input', { class: 'ext-search-input', type: 'search', list: listId, placeholder: '예: 의성군, 영도구', autocomplete: 'off', 'aria-label': '시군구 찾기',
    on: {
      change: (ev) => { const r = findRegion(ev.target.value); pick(r ? r.i : null); },
      keydown: (ev) => { if (ev.key === 'Enter') { const r = findRegion(ev.target.value); pick(r ? r.i : null); } },
      input: (ev) => { if (!ev.target.value) pick(null); },
    } });
  const picked = h('div', { class: 'ext-picked', hidden: true });
  addBlock(panel, h('div', { class: 'ds-ctl' },
    h('span', { class: 'ds-label' }, '시군구 찾기'),
    h('div', { class: 'ext-searchbox' }, icon('search'), search),
    h('datalist', { id: listId }, sorted.map((r) => h('option', { value: fullName(r) }))),
    picked));

  const counts = CLASSES.map((_, k) => R.filter((r) => r.cls === k).length);
  const maxCount = Math.max(...counts);
  const riskN = counts[0] + counts[1];
  const [yy, mm] = data.month.split('-');
  addBlock(panel, h('section', { class: 'ext-block' },
    h('h2', { class: 'ds-h2' }, '소멸위험 등급별 시군구 수'),
    h('ul', { class: 'ext-legend' }, CLASSES.map((c, k) => h('li', { class: 'ext-legend-row' },
      h('span', { class: 'ext-sw', style: { background: c.color } }),
      h('span', { class: 'ext-lb' }, h('b', { class: 'ext-lb-name' }, c.name), h('span', { class: 'ext-lb-range' }, c.range)),
      h('span', { class: 'ext-ct' }, `${counts[k]}곳`),
      h('span', { class: 'ext-bar' }, h('i', { class: 'ext-bar-fill', style: { width: `${(counts[k] / maxCount) * 100}%`, background: c.color } }))))),
    h('p', { class: 'ext-sub' }, `전국 ${R.length}개 시군구 중 `, h('b', { class: 'ext-strong' }, `소멸위험지역(0.5 미만) ${riskN}곳`),
      `, ${Math.round((riskN / R.length) * 1000) / 10}% (${yy}년 ${+mm}월 말)`)));

  const sortedAsc = [...R].sort((a, b) => a.index - b.index);
  const lowestBtns = sortedAsc.slice(0, 10).map((r, k) => h('button', { class: 'ext-low-btn', type: 'button', dataset: { i: r.i },
    on: { click: () => { search.value = fullName(r); pick(r.i); } } },
    h('span', { class: 'ext-low-rank' }, String(k + 1)),
    h('span', { class: 'ext-low-name' }, r.name, h('span', { class: 'ext-low-sido' }, r.sido.replace(/(특별자치도|특별자치시|통합특별시|광역시|특별시|도)$/, ''))),
    h('span', { class: 'ext-low-v' }, r.index.toFixed(3))));
  addBlock(panel, h('section', { class: 'ext-block' },
    h('h2', { class: 'ds-h2' }, '지수가 가장 낮은 10곳'),
    h('ol', { class: 'ext-lowest' }, lowestBtns.map((b) => h('li', { class: 'ext-low-li' }, b)))));

  const P = (...c) => h('p', { class: 'ext-p' }, ...c);
  const B = (t) => h('b', { class: 'ext-strong' }, t);
  addBlock(panel, h('div', { class: 'ds-note' },
    P(B('지방소멸위험지수'), ' = 20~39세 여성 인구 ÷ 65세 이상 인구. 값이 작을수록 아이를 낳을 수 있는 젊은 여성에 비해 고령 인구가 많아 인구가 줄어들 위험이 크다는 뜻이다.'),
    P(B('크기 규칙'), ' 지수 1.5 이상이면 원래 크기, 그보다 낮으면 넓이 = 원래 넓이 × (지수 ÷ 1.5). 예를 들어 지수 0.3인 군은 넓이가 5분의 1로 줄어든다. 육각 돌링에서는 모든 시군구가 같은 크기의 육각형에서 출발해 같은 규칙으로 넓이가 정해지며, 서로 겹치지 않도록 원래 위치 가까이에 놓였다.'),
    P(`${yy}년 ${+mm}월 기준으로 지수 1.5 이상인 시군구는 ${counts[4]}곳이어서 모든 시군구가 조금씩이라도 줄어든다.`)));
  addBlock(panel, h('div', { class: 'ds-note ext-small' },
    P(B('인구'), ` 행정안전부 주민등록 인구통계 「연령별 인구현황」(시군구, 5세 단위, 성별), ${yy}년 ${+mm}월 말. `,
      h('a', { class: 'ext-link', href: 'https://jumin.mois.go.kr/ageStatMonth.do', target: '_blank', rel: 'noopener' }, 'jumin.mois.go.kr')),
    P(B('지수·등급'), ' 이상호(한국고용정보원)의 지방소멸위험지수와 5단계 구분(0.2·0.5·1.0·1.5).'),
    P(B('경계'), ' 통계청 SGIS 행정동 경계(공공누리 제1유형)를 가공한 vuski/admdongkor 2026-07-01판(CC BY 4.0)을 시군구로 합침. 자치구가 아닌 구(예: 수원시 장안구)는 시로 합쳤고, 2026년 7월 인천 행정체제 개편(제물포구·영종구·서해구·검단구)과 전남광주통합특별시 출범을 반영했다.')));

  // ---------- 그리기 ----------
  function render() {
    const e = ease(state.t);
    const hexMode = state.mode === 'hex';
    gHex.style.display = hexMode ? '' : 'none';
    gLabel.style.display = hexMode && state.t > 0.97 ? '' : 'none';
    if (!hexMode) {
      gReg.style.opacity = 1;
      gReg.style.pointerEvents = '';
      for (const r of R) {
        const s = 1 - e * (1 - r.s);
        if (s === 1) r.reg.removeAttribute('transform');
        else r.reg.setAttribute('transform', `translate(${r.cx} ${r.cy}) scale(${s.toFixed(4)}) translate(${-r.cx} ${-r.cy})`);
      }
      gGhost.style.opacity = 1;
    } else {
      // 실제 경계(섬 포함)는 처음 25% 구간에서 사라지고, 가장 큰 조각의 외곽선이 육각형으로 바뀐다
      const fade = clamp01(state.t / 0.25);
      gReg.style.opacity = 1 - fade;
      gReg.style.pointerEvents = fade > 0.5 ? 'none' : '';
      for (const r of R) {
        r.reg.removeAttribute('transform');
        r.morph.setAttribute('d', state.t === 0 ? '' : ringD(r.ring, r.hexPts, e));
      }
      gGhost.style.opacity = 1 - 0.55 * e;
      updateLabelVisibility();
    }
    sidoPath.style.opacity = hexMode ? 1 - 0.6 * e : 1;
    morph.value = Math.round(state.t * 100);
    morphOut.textContent = `${Math.round(state.t * 100)}%`;
    updateCaption();
    drawHighlight();
  }
  function updateCaption() {
    const pct = Math.round(state.t * 100);
    const b = (t) => h('b', { class: 'ext-strong' }, t);
    if (pct === 0) caption.replaceChildren(b('실제 지도'), ' · 시군구 색 = 소멸위험 등급');
    else if (state.mode === 'area') caption.replaceChildren(b('행정구역 카토그램'), ` ${pct}% · 회색은 원래 면적, 색칠한 부분은 지수에 비례한 면적`);
    else caption.replaceChildren(b('육각 돌링 카토그램'), ` ${pct}% · 육각형 하나 = 시군구 하나, 넓이 ∝ 지수`);
  }

  // ---------- 재생 ----------
  let raf = 0;
  function animateTo(target) {
    cancelAnimationFrame(raf);
    const from = state.t, dist = Math.abs(target - from);
    if (dist < 1e-6) { state.playing = false; syncPlay(); return; }
    const dur = 2600 * dist, t0 = performance.now();
    state.playing = true; syncPlay();
    const step = (now) => {
      const k = Math.min(1, (now - t0) / dur);
      state.t = from + (target - from) * k;
      render();
      if (k < 1) raf = requestAnimationFrame(step);
      else { state.playing = false; syncPlay(); }
    };
    raf = requestAnimationFrame(step);
  }
  function stopAnim() { cancelAnimationFrame(raf); state.playing = false; syncPlay(); }
  function syncPlay() {
    if (state.playing) playBtn.replaceChildren(icon('pause'), '멈춤');
    else playBtn.replaceChildren(icon('play'), state.t >= 0.999 ? '다시 보기' : '카토그램으로');
  }
  function setMode(mode, play) {
    if (mode === state.mode) return;
    for (const b of segBtns) b.setAttribute('aria-pressed', String(b.dataset.mode === mode));
    stopAnim();
    state.mode = mode;
    state.t = 0;
    render();
    if (play) animateTo(1);
  }

  // ---------- 확대·이동 (viewBox) ----------
  const [ex0, ey0, ex1, ey1] = data.extent;
  const PAD = 14;
  const home = { x: ex0 - PAD, y: ey0 - PAD, w: ex1 - ex0 + 2 * PAD, h: ey1 - ey0 + 2 * PAD };
  const baseH = home.h;
  const narrowQ = matchMedia('(max-width: 820px)');
  // 사이드바가 아래로 쌓인 화면(820px 이하)에서는 아래쪽 안내 띠가 지도를 가리지 않게 아래 여백을 더 둔다
  function fitHome() {
    const r = stage.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const upp = Math.max(home.w / r.width, baseH / r.height);
    home.h = baseH + (narrowQ.matches ? 56 * upp : 0);
  }
  const vb = { ...home };
  function applyVB() { svg.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`); if (state.mode === 'hex') updateLabelVisibility(); }
  function pxPerUnit() { const r = svg.getBoundingClientRect(); return Math.min(r.width / vb.w, r.height / vb.h) || 1; }
  function clientToSvg(cx, cy) {
    const p = svg.createSVGPoint(); p.x = cx; p.y = cy;
    return p.matrixTransform(svg.getScreenCTM().inverse());
  }
  function zoomAt(k, cx, cy) {
    const nw = Math.max(home.w / 12, Math.min(home.w * 1.2, vb.w / k));
    const kk = vb.w / nw;
    const p = cx == null ? { x: vb.x + vb.w / 2, y: vb.y + vb.h / 2 } : clientToSvg(cx, cy);
    vb.x = p.x - (p.x - vb.x) / kk; vb.y = p.y - (p.y - vb.y) / kk;
    vb.w = nw; vb.h = vb.h / kk;
    applyVB();
  }
  function updateLabelVisibility() {
    const ppu = pxPerUnit();
    for (const r of R) r.label.style.display = r.hr * ppu * 0.42 >= 8.5 ? '' : 'none';
  }
  svg.addEventListener('wheel', (ev) => { ev.preventDefault(); zoomAt(Math.exp(-ev.deltaY * 0.0015), ev.clientX, ev.clientY); }, { passive: false });

  const pointers = new Map();
  let drag = null, moved = false, pinch = null;
  svg.addEventListener('pointerdown', (ev) => {
    pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    svg.setPointerCapture(ev.pointerId);
    moved = false;
    if (pointers.size === 1) drag = { x: ev.clientX, y: ev.clientY, vx: vb.x, vy: vb.y, target: ev.target };
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), w: vb.w };
      drag = null;
    }
  });
  svg.addEventListener('pointermove', (ev) => {
    if (pointers.has(ev.pointerId)) pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    if (pinch && pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      zoomAt(vb.w / (pinch.w * (pinch.d / d)), (a.x + b.x) / 2, (a.y + b.y) / 2);
      moved = true;
      return;
    }
    if (drag) {
      const dx = ev.clientX - drag.x, dy = ev.clientY - drag.y;
      if (!moved && Math.hypot(dx, dy) < 4) return;
      moved = true; hideTip(); svg.classList.add('ext-dragging');
      const ppu = pxPerUnit();
      vb.x = drag.vx - dx / ppu; vb.y = drag.vy - dy / ppu;
      applyVB();
      return;
    }
    if (ev.pointerType === 'mouse') hoverAt(ev);
  });
  function endPointer(ev) {
    pointers.delete(ev.pointerId);
    if (pointers.size < 2) pinch = null;
    if (pointers.size === 0) {
      svg.classList.remove('ext-dragging');
      if (drag && !moved && ev.type === 'pointerup') {
        // 포인터 캡처 중이라 ev.target 은 svg — 누른 순간의 대상을 쓴다
        const i = regionIndexFrom(drag.target);
        if (i == null) { hideTip(); if (ev.pointerType !== 'mouse') setHover(null); }
        else if (ev.pointerType !== 'mouse') { setHover(i); showTip(i, ev.clientX, ev.clientY); }
        else pick(i, false);
      }
      drag = null;
    }
  }
  svg.addEventListener('pointerup', endPointer);
  svg.addEventListener('pointercancel', endPointer);
  svg.addEventListener('pointerleave', (ev) => { if (ev.pointerType === 'mouse' && !drag) { hideTip(); setHover(null); } });

  // ---------- 툴팁 (무대 안에 절대 위치) ----------
  function regionIndexFrom(target) {
    const v = target?.dataset?.i;
    return v == null ? null : +v;
  }
  let hoverI = null;
  function setHover(i) {
    if (hoverI != null) { R[hoverI].reg.classList.remove('ext-hover'); R[hoverI].morph.classList.remove('ext-hover'); }
    hoverI = i;
    if (i != null) {
      const r = R[i];
      (state.mode === 'hex' && state.t > 0.12 ? r.morph : r.reg).classList.add('ext-hover');
      gReg.append(r.reg); gHex.append(r.morph); // 맨 위로 올려 테두리가 가려지지 않게
    }
  }
  function hoverAt(ev) {
    const i = regionIndexFrom(ev.target);
    if (i == null) { hideTip(); setHover(null); return; }
    if (i !== hoverI) setHover(i);
    showTip(i, ev.clientX, ev.clientY);
  }
  function showTip(i, cx, cy) {
    const r = R[i], c = CLASSES[r.cls];
    const row = (k, v) => [h('dt', { class: 'ext-tip-k' }, k), h('dd', { class: 'ext-tip-v' }, v)];
    tip.replaceChildren(
      h('h3', { class: 'ext-tip-title' }, fullName(r)),
      h('dl', { class: 'ext-tip-dl' },
        row('20~39세 여성', `${fmt(r.f2039)}명`),
        row('65세 이상', `${fmt(r.o65)}명`),
        row('소멸위험지수', r.index.toFixed(3)),
        row('등급', badge(c))));
    tip.hidden = false;
    const sr = stage.getBoundingClientRect();
    const tw = tip.offsetWidth, th = tip.offsetHeight;
    let x = cx - sr.left + 14, y = cy - sr.top + 14;
    if (x + tw > sr.width - 8) x = cx - sr.left - tw - 14;
    if (y + th > sr.height - 8) y = cy - sr.top - th - 14;
    tip.style.left = `${Math.max(8, x)}px`;
    tip.style.top = `${Math.max(8, y)}px`;
  }
  function hideTip() { tip.hidden = true; }

  // ---------- 강조(검색·목록) ----------
  function drawHighlight() {
    const i = state.picked;
    if (i == null) { hl.setAttribute('d', ''); hl.removeAttribute('transform'); return; }
    const r = R[i];
    if (state.mode === 'hex' && state.t > 0) {
      hl.removeAttribute('transform');
      hl.setAttribute('d', state.t >= 0.25 ? ringD(r.ring, r.hexPts, ease(state.t)) : r.d);
    } else {
      hl.setAttribute('d', r.d);
      const s = 1 - ease(state.t) * (1 - r.s);
      hl.setAttribute('transform', `translate(${r.cx} ${r.cy}) scale(${s}) translate(${-r.cx} ${-r.cy})`);
    }
  }
  function pick(i, focus = true) {
    state.picked = i;
    drawHighlight();
    for (const b of lowestBtns) b.setAttribute('aria-current', String(+b.dataset.i === i));
    if (i == null) { picked.hidden = true; clear(picked); return; }
    const r = R[i], c = CLASSES[r.cls];
    const kv = (k, v) => h('span', { class: 'ext-kv' }, k, v);
    const bv = (t) => h('b', { class: 'ext-strong' }, t);
    picked.hidden = false;
    picked.replaceChildren(
      h('span', { class: 'ext-picked-name' }, fullName(r)),
      kv('소멸위험지수', bv(r.index.toFixed(3))),
      kv('등급', badge(c)),
      kv('20~39세 여성', bv(`${fmt(r.f2039)}명`)),
      kv('65세 이상', bv(`${fmt(r.o65)}명`)),
      kv('총인구', bv(`${fmt(r.pop)}명`)),
      kv(`전국 ${R.length}곳 중 낮은 순서`, bv(`${sortedAsc.indexOf(r) + 1}위`)));
    if (focus) focusOn(r);
  }
  function focusOn(r) {
    const hexMode = state.mode === 'hex' && state.t > 0.5;
    const x = hexMode ? r.hex[0] : r.cx, y = hexMode ? r.hex[1] : r.cy;
    const w = Math.min(vb.w, home.w / 2.5);
    const hh = w * (home.h / home.w);
    Object.assign(vb, { x: x - w / 2, y: y - hh / 2, w, h: hh });
    applyVB();
  }
  function findRegion(q) {
    q = q.trim().replace(/\s+/g, ' ');
    if (!q) return null;
    const flat = q.replace(/\s/g, '');
    return R.find((r) => fullName(r) === q) ?? R.find((r) => r.name === q)
      ?? R.find((r) => fullName(r).replace(/\s/g, '').includes(flat));
  }

  // ---------- 시작 ----------
  // 주소 #mode=hex&t=100&pick=의성군 처럼 시작 상태를 정할 수 있다(수업 자료 링크용, 읽기만 한다)
  const hash = new URLSearchParams(location.hash.slice(1));
  if (hash.get('mode') === 'hex') setMode('hex', false);
  if (hash.has('t')) state.t = clamp01(+hash.get('t') / 100 || 0);
  syncPlay();
  applyVB();
  render();
  // 붙여 넣은 뒤 크기가 정해지면 시작 화면을 다시 맞춘다
  requestAnimationFrame(() => { fitHome(); Object.assign(vb, home); applyVB(); });
  narrowQ.addEventListener('change', () => { fitHome(); Object.assign(vb, home); applyVB(); });
  const startPick = hash.get('pick');
  if (startPick) { const r = findRegion(startPick); if (r) { search.value = fullName(r); pick(r.i, false); } }
}
