// © 2026 김용현
// src/atlas/worldGlobe.js — Ⅰ 세계화 U1-3f 대륙·대양 지구본 단추(교사 Q4 A — 누르면 지구본으로 바꿔 그곳을 가운데로 돌리고 강조, Q2 태평양 중심 150 은 평면 보기 몫).
//   installWorldExtras() 가 installWorldGlobe(continentsLayer) 로 건다(부르지 않는 u2~u6 조각에는 코드가 없음):
//   - registerLayerType('continentGlobes') = 대륙·대양 면 레이어(worldExtra.continentsLayer — 같은 자료 p10-continents) + 대륙 단추 5(9쪽 — 아시아·유럽·
//     아프리카·아메리카·오세아니아). 일반도(8~9쪽)용이라 단추를 누르기 전에는 면을 그리지 않음(idleHidden — 일반도 지면은 대륙색이 아님).
//   - registerLayerType('continentQuiz') 다시 등록 = 맞히기(worldQuiz.withContinentQuiz) + 대양 단추 5(11쪽 — 태평양·인도양·대서양·북극해·남극해).
//   단추 열 = 무대 위 DOM(<section class="at-wg">, 처음 drawSvg 때 레이어 <g> 에서 무대(.at-stage)를 찾아 붙이고 destroy 때 뗌): 맨 위 「평면 지도로」 + 단추 5
//   (둥근 그림 = 교과서 지구본 그림을 자른 것 docs/assets/atlas/u1/globe/<id>-160.webp(2x 320) — U1-6, 못 불러오면 선 아이콘 지구본 + 이름).
//   자리 = placeGlobes(멈춘 그림마다): 오른쪽 열(확대 단추 아래 — 교과서 9·11쪽 배치) → 작은 오른쪽 열 → 왼쪽 위 열 → 가로 줄 중 지도 도구·확대 단추·축척·
//   범례 칸·꼬리표(레이어 장애물)와 안 겹치는 첫 자리. 맞히기 칸(worldQuiz.placePanel)은 이 열을 무대 부품으로 피한다.
//   누르기: 바탕 자연색(polarExtra topicView 와 같은 되돌리기 규칙) → 평면이면 americasExtra.globeView 로 지구본(처음 회전 = 앞 평면 화면 가운데 — viewTools 와 같은
//   그림이 이어짐) → layer.select(cls)(아메리카 = 북·남 묶음 [northAmerica, southAmerica]) → 회전을 프레임마다 보간해 그곳 중심(centers — 인도양만 손 값)으로.
//   「평면 지도로」 = 앞 평면 보기(globeView 되돌리기 — 단추를 여럿 눌러도 한 번) + select(null) + 바탕 되돌림. 사용자가 도법 상자로 바꾸면 단추 상태만 풂(보기는
//   viewTools 몫), 범례·맞히기로 다른 것을 고르면 눌림만 풂. destroy(주제·묶음 바꿈) = 지구본이면 앞 평면 보기로(topicView 꼴).
import { geoCentroid } from 'd3-geo';
import { h, icon } from '../shared/dom.js';
import { PROJECTIONS } from './projections.js';
import { registerLayerType } from './layerRef.js';
import { globeView, globeCenter, rotateFor } from './americasExtra.js';
import { specialView } from './polarExtra.js';
import { baseOptions, baseModeOf } from './natural.js';
import { imageUrl } from './ui.js';
import { withContinentQuiz } from './worldQuiz.js';
import './worldGlobe.css';

/** 교과서 차례 단추 묶음. cls 가 배열이면 그 대륙들을 함께 고름(legendState.toggleGroup), center 가 있으면 자료 centers 대신(까닭은 GLOBE_WHY). */
export const GLOBE_SETS = Object.freeze({
  continents: [
    { id: 'asia', label: '아시아', cls: 'asia' },
    { id: 'europe', label: '유럽', cls: 'europe' },
    { id: 'africa', label: '아프리카', cls: 'africa' },
    { id: 'america', label: '아메리카', cls: ['northAmerica', 'southAmerica'] },
    { id: 'oceania', label: '오세아니아', cls: 'oceania' },
  ],
  oceans: [
    { id: 'pacific', label: '태평양', cls: 'pacific' },
    { id: 'indian', label: '인도양', cls: 'indian', center: [75, -10] },
    { id: 'atlantic', label: '대서양', cls: 'atlantic' },
    { id: 'arctic', label: '북극해', cls: 'arctic' },
    { id: 'southern', label: '남극해', cls: 'southern' },
  ],
});
/** 손 중심의 까닭(교과서 11쪽 지구본 그림과 비교) */
export const GLOBE_WHY = Object.freeze({
  indian: '자료 넓이 중심 [78.9, −27.5] 은 남쪽으로 치우쳐 인도가 원판 위 끝에 걸림 — 11쪽 그림은 인도 반도가 위 가운데, 오스트레일리아가 오른쪽 아래',
});
/** 회전 보간(ms = 기본 + 도 × perDeg, 최대 max), 단추 그림 주소(ASSET_BASE 기준) */
export const GLOBE_UI = Object.freeze({ ms: 380, perDeg: 4.5, max: 1100, img: (id, px) => `u1/globe/${id}-${px}.webp` });

/** 단추의 회전 중심: 손 center → cls 배열이면 그 중심들의 구면 평균 → 자료 centers[cls] */
export function globeTarget(spec, centers = {}) {
  if (spec.center) return spec.center.slice();
  if (Array.isArray(spec.cls)) {
    const pts = spec.cls.map((c) => centers[c]).filter(Boolean);
    return pts.length ? geoCentroid({ type: 'MultiPoint', coordinates: pts }) : null;
  }
  return centers[spec.cls]?.slice() || null;
}
/** 좁은 무대(px — 이보다 좁으면 둥근 「지구본」 단추 하나로 접고 누르면 펼침, worldQuiz 휴대폰 문턱과 같음) */
export const GLOBE_NARROW = 560;

// 그림 있는지 한 번만 확인(U1-6 전에는 그림이 없어 단추마다 404 가 10개씩 났음): 첫 단추 그림 하나를 Image() 로 불러 보고, 실패면 모든 단추가 <img> 없이
// 선 아이콘. Image 가 없는 곳(Node 시험)은 있다고 봄. resetGlobeImageProbe = 시험용.
let probe = null;
export function resetGlobeImageProbe() { probe = null; }
function imageProbe(cb) {
  if (typeof globalThis.Image !== 'function') { cb(true); return () => {}; }
  if (!probe) {
    probe = { state: 'pending', subs: new Set() };
    const p0 = probe, im = new globalThis.Image();
    const settle = (ok) => { if (p0.state !== 'pending') return; p0.state = ok ? 'ok' : 'fail'; for (const f of [...p0.subs]) f(ok); p0.subs.clear(); };
    im.onload = () => settle(true); im.onerror = () => settle(false);
    im.src = imageUrl(GLOBE_UI.img(GLOBE_SETS.continents[0].id, 160));
  }
  if (probe.state !== 'pending') { cb(probe.state === 'ok'); return () => {}; }
  const p0 = probe;
  p0.subs.add(cb);
  return () => p0.subs.delete(cb);
}

/** 단추가 고른 값이 layer.selected 에서 보이는 꼴(묶음 = 'group:a+b' — worldExtra.continentsLayer.select) */
const selKey = (spec) => (Array.isArray(spec.cls) ? `group:${spec.cls.join('+')}` : spec.cls);

/** 단추 열이 피할 무대 부품과 무게(지도 도구·확대 단추·축척은 꼭 피함, 범례 칸은 접을 수 있어 덜) */
const STAGE_UI = { 'at-tools-card': 100, 'at-tools-zoom': 100, 'at-scale': 100, 'at-legend-panel': 10, 'at-locator': 1, 'at-inset': 1 };
const GAP = 10, PAD = 4, TAG_WEIGHT = 5, SCALE_GAP = 44;
const overlapArea = (a, b) => Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0])) * Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));

/**
 * 단추 열 자리: 무대 W×H, sizes = {l:[w, h](큰 열), s:[w, h](작은 열), row:[w, h](가로 줄)}, 장애물 [x0, y0, x1, y1, 무게?(기본 1)](무대 좌표 — 4px 넓힘),
 * anchorTop = 오른쪽 열 위 끝(확대 단추 묶음 아래). 차례: 큰 오른쪽 열 → 작은 오른쪽 열 → 큰 왼쪽 위 열 → 작은 왼쪽 위 열 → 왼쪽 위 가로 줄 → 왼쪽 아래(축척 위)
 * 가로 줄 중 안 겹치는 첫 자리, 다 겹치면 겹친 넓이 × 무게가 가장 작은 곳. → {mode:'l'|'s'|'row', side:'right'|'left'|'bottom', left, top, overlap}
 */
export function placeGlobes(W, H, sizes, obstacles = [], { anchorTop = GAP } = {}) {
  const cands = [
    ['l', 'right', W - GAP - sizes.l[0], anchorTop], ['s', 'right', W - GAP - sizes.s[0], anchorTop],
    ['l', 'left', GAP, GAP], ['s', 'left', GAP, GAP],
    ['row', 'left', GAP, GAP], ['row', 'bottom', GAP, H - SCALE_GAP - sizes.row[1]],
  ].map(([mode, side, left, top]) => {
    const [w, hh] = sizes[mode];
    const r = [left, top, left + w, top + hh];
    let overlap = obstacles.reduce((a, o) => a + overlapArea(r, [o[0] - PAD, o[1] - PAD, o[2] + PAD, o[3] + PAD]) * (o[4] ?? 1), 0);
    overlap += (Math.max(0, r[3] - H) + Math.max(0, -r[1])) * w * 100; // 무대 밖으로 나가면 꼭 피함
    return { mode, side, left: Math.round(left), top: Math.round(top), overlap };
  });
  return cands.find((c) => c.overlap === 0) || cands.reduce((a, c) => (c.overlap < a.overlap ? c : a));
}

/** 요소 위로 올라가며 클래스 c 를 가진 것 */
function upTo(el, c) { for (let x = el; x; x = x.parentNode) if (x.classList?.contains(c)) return x; return null; }
/** 요소 아래에서 클래스가 cs 가운데 하나인 요소 모두(skip 의 속은 건너뜀) */
function allIn(el, cs, skip, out = []) {
  for (const x of el?.children || []) {
    if (x === skip) continue;
    if (cs.some((c) => x.classList?.contains(c))) out.push(x); else allIn(x, cs, skip, out);
  }
  return out;
}
const wrap = (v) => ((((v + 180) % 360) + 360) % 360) - 180;
const ease = (u) => (u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2);
const reducedMotion = () => { try { return !!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };

/** 바탕 색 base 를 두고 되돌리기 함수(바꾼 게 없으면 null) — 되돌리기는 지금 바탕이 이 함수가 둔 값일 때만(polarExtra.setBase 와 같은 규칙) */
function setBase(map, base) {
  const from = baseModeOf(map.options);
  if (!base || from === base) return null;
  map.setOptions(baseOptions(base));
  return () => { if (!map.destroyed && baseModeOf(map.options) === base) map.setOptions(baseOptions(from)); };
}

/**
 * 대륙·대양 면 레이어(select·onSelect·selected·centers 를 가진 것 — continentsLayer 또는 withContinentQuiz 결과)에 지구본 단추를 덧붙여 돌려준다(같은 객체).
 * set = 'continents' | 'oceans'. opts: map, idleHidden(단추를 누르기 전에는 면·맞히기 없음), ms(회전 보간 길이 — 없으면 회전 각에 따라, 0 = 바로),
 * raf·caf·now(시험용 시계). layer.globes = { press(id), flat(), active, pressed }.
 */
export function withGlobeButtons(layer, set, { map = null, idleHidden = false, ms = null, raf = null, caf = null, now = null } = {}) {
  const specs = GLOBE_SETS[set];
  if (!specs) throw new Error(`withGlobeButtons: 모르는 단추 묶음 ${set}`);
  const frame = raf || ((f) => globalThis.requestAnimationFrame(f));
  const cancel = caf || ((id) => globalThis.cancelAnimationFrame?.(id));
  const clock = now || (() => globalThis.performance?.now?.() ?? Date.now());
  const def = () => PROJECTIONS.globe;

  let session = null;  // 단추로 연 지구본 {undoView, undoBase} — 「평면 지도로」·destroy 가 되돌림
  let pressed = null;  // 눌린 단추 spec
  let lastFlat = null; // 마지막 멈춘 평면 보기 {key, center, k}(이미 지구본에서 눌렀을 때 「평면 지도로」가 갈 곳)
  let mine = 0;        // 이 모듈이 보기를 바꾸는 중(viewchange 를 사용자 것으로 보지 않음)
  let anim = null, dead = false, stageEl = null, place0 = null, lastPressed = null;
  const isFlat = (v) => v && !specialView(v.key);
  if (isFlat(map?.view)) lastFlat = { key: map.view.key, center: map.view.center, k: map.view.k };

  // ── DOM ──
  const kb = (e) => e?.detail === 0; // 키보드(Enter·Space)로 누른 click
  const flatBtn = h('button', {
    class: 'ds-btn at-wg-flat is-off', type: 'button', title: '앞에 보던 평면 지도로 돌아가기',
    on: { click: (e) => { e.stopPropagation?.(); flat({ focus: kb(e) || globalThis.document?.activeElement === flatBtn }); } },
  }, icon('back'), h('span', { class: 'at-wg-flat-text' }, '평면 지도로'));
  flatBtn.disabled = true;
  const iconPic = (pic) => { pic.replaceChildren(icon('globe')); pic.classList.add('is-icon'); };
  const els = specs.map((spec) => {
    const pic = h('span', { class: 'at-wg-pic' });
    iconPic(pic); // 그림 확인 전·실패면 선 아이콘
    const el = h('button', {
      class: 'at-wg-btn', type: 'button', 'data-id': spec.id, 'aria-pressed': 'false',
      'aria-label': `${spec.label} — 지구본으로 돌려 보기`, title: `${spec.label} — 지구본으로 돌려 보기`,
      on: { click: (e) => { e.stopPropagation?.(); press(spec.id, { focus: kb(e) }); } },
    }, pic, h('span', { class: 'at-wg-name' }, spec.label));
    return { spec, el, pic };
  });
  const offProbe = imageProbe((ok) => {
    if (!ok || dead) return;
    for (const { spec, pic } of els) {
      const img = h('img', {
        class: 'at-wg-img', alt: '', loading: 'lazy', decoding: 'async', draggable: 'false',
        src: imageUrl(GLOBE_UI.img(spec.id, 160)), srcset: `${imageUrl(GLOBE_UI.img(spec.id, 320))} 2x`,
        on: { error: () => iconPic(pic) },
      });
      pic.classList.remove('is-icon');
      pic.replaceChildren(img);
    }
  });
  const toggle = h('button', {
    class: 'at-wg-toggle', type: 'button', 'aria-expanded': 'false', hidden: '',
    'aria-label': set === 'oceans' ? '대양 지구본 단추 펴기' : '대륙 지구본 단추 펴기', title: '지구본 단추',
    on: { click: (e) => { e.stopPropagation?.(); open(!opened, { focus: kb(e) }); } },
  }, icon('globe'), h('span', { class: 'at-wg-toggle-text' }, '지구본'));
  toggle.hidden = true;
  const pop = h('div', { class: 'at-wg-pop' }, flatBtn, h('div', { class: 'at-wg-list', role: 'group' }, ...els.map((x) => x.el)));
  const box = h('section', { class: 'at-wg', tabindex: '-1', 'aria-label': set === 'oceans' ? '대양 지구본 단추' : '대륙 지구본 단추' }, toggle, pop);
  let narrow = false, opened = false;
  /** 좁은 무대: 접힘(둥근 단추만) ↔ 펼침(묶음 칸이 단추 아래로) */
  function open(on, { focus = false } = {}) {
    opened = !!on && narrow;
    box.classList.toggle('is-open', opened);
    toggle.setAttribute('aria-expanded', String(opened));
    const t = `${set === 'oceans' ? '대양' : '대륙'} 지구본 단추 ${opened ? '접기' : '펴기'}`;
    toggle.setAttribute('aria-label', t);
    if (focus && opened) (els[0]?.el)?.focus?.();
  }
  function setNarrow(on) {
    if (on === narrow) return;
    narrow = on;
    box.classList.toggle('is-narrow', narrow);
    toggle.hidden = !narrow;
    open(false);
  }

  function paint() {
    for (const { spec, el } of els) {
      const on = pressed === spec;
      el.classList.toggle('is-active', on);
      el.setAttribute('aria-pressed', String(on));
    }
    const off = !session;
    flatBtn.disabled = off;
    flatBtn.classList.toggle('is-off', off);
  }
  const refresh = () => { if (idleHidden && map && !map.destroyed) map.refreshLayer(layer.id); };

  /** 단추 열 자리(무대 크기·열 크기는 지금 값 — 멈춘 그림마다) */
  function place() {
    if (dead || !stageEl || !box.parentNode) return;
    const sr = stageEl.getBoundingClientRect?.();
    if (!sr || !(sr.width > 0)) return;
    const cls = Object.keys(STAGE_UI);
    const ui = allIn(stageEl, cls, box).filter((x) => !x.hidden).map((x) => [x.getBoundingClientRect(), x])
      .filter(([r]) => r.width > 0 && r.height > 0)
      .map(([r, x]) => [r.left - sr.left, r.top - sr.top, r.right - sr.left, r.bottom - sr.top, STAGE_UI[cls.find((c) => x.classList.contains(c))], x]);
    const zoom = ui.find((o) => o[5].classList.contains('at-tools-zoom')) || ui.find((o) => o[5].classList.contains('at-tools-card'));
    const anchorTop = zoom ? Math.round(zoom[3] + 8) : GAP;
    const tags = (layer.labelObstacles?.() || []).map((b) => [b[0], b[1], b[2], b[3], TAG_WEIGHT]);
    setNarrow(sr.width < GLOBE_NARROW);
    const sizes = {};
    if (narrow) { // 접기 단추만 자리를 차지(펼친 칸은 그 아래로 떠 있음)
      box.setAttribute('data-mode', 's');
      const r = box.getBoundingClientRect();
      sizes.l = sizes.s = sizes.row = [r.width, r.height];
    } else {
      for (const m of ['l', 's', 'row']) {
        box.setAttribute('data-mode', m);
        const r = box.getBoundingClientRect();
        sizes[m] = [r.width, r.height];
      }
    }
    if (!(sizes.l[0] > 0)) { box.setAttribute('data-mode', place0?.mode || 'l'); return; }
    const p = placeGlobes(sr.width, sr.height, sizes, [...ui.map((o) => o.slice(0, 5)), ...tags], { anchorTop });
    if (narrow) p.mode = 's';
    place0 = p;
    box.setAttribute('data-mode', p.mode);
    box.setAttribute('data-place', p.side);
    box.style.left = `${p.left}px`; box.style.top = `${p.top}px`;
  }

  // ── 회전 ──
  function stopSpin() { if (anim) { cancel(anim.id); anim = null; } }
  /** 지금 회전 → 그곳 가운데로(경도는 짧은 쪽 — 날짜변경선을 건너도), 북쪽 위 그대로. 끝나면 「세계 전체 보기」 회전 = 그곳 */
  function spin(center) {
    stopSpin();
    const d = def();
    if (!d || !map) return;
    const from = d.rot.slice(), to = rotateFor(center);
    const dl = wrap(to[0] - from[0]), dp = to[1] - from[1];
    const len = ms != null ? ms : reducedMotion() ? 0 : Math.min(GLOBE_UI.max, GLOBE_UI.ms + Math.hypot(dl, dp) * GLOBE_UI.perDeg);
    const v = map.view;
    if (v && (v.k !== 1 || v.x || v.y)) map.flyTo({ center: globeCenter(from), zoom: 1 }, len); // 확대해 있었으면 원판 전체로(회전과 함께)
    const finish = () => { d.rot = to.slice(); d.home = to.slice(); anim = null; map.rebase(); };
    if (!(len > 0)) { finish(); return; }
    const t0 = clock();
    let last = from;
    const step = (t) => {
      if (dead || map.destroyed || !anim) return;
      if (Math.abs(wrap(d.rot[0] - last[0])) > 1e-6 || Math.abs(d.rot[1] - last[1]) > 1e-6) { anim = null; d.home = d.rot.slice(); return; } // 사용자가 끌어 돌림
      const u = Math.max(0, Math.min(1, ((t ?? clock()) - t0) / len)); // rAF 시각이 t0 보다 앞설 수 있음
      if (u >= 1) { finish(); return; }
      const e = ease(u);
      last = [wrap(from[0] + dl * e), from[1] + dp * e];
      d.rot = last.slice();
      map.rebase();
      anim.id = frame(step);
    };
    anim = { id: frame(step) };
  }

  // ── 누르기·되돌리기 ──
  function press(id, { focus = false } = {}) {
    const spec = specs.find((x) => x.id === id);
    if (!spec || dead || !map?.view || !def()) return;
    const target = globeTarget(spec, layer.centers);
    if (!target) return;
    mine++;
    try {
      layer.select(spec.cls); lastPressed = spec; // 먼저 — 모르는 cls 로 멈추면 보기·바탕은 그대로(세션 없음)
      pressed = spec;
      if (!session) {
        const v = map.view, s1 = { undoBase: null, undoView: null };
        session = s1;
        s1.undoBase = setBase(map, 'natural');
        if (v.key !== 'globe') {
          const c = v.center && Number.isFinite(v.center[0]) ? v.center : [v.centerLon ?? 0, 0];
          s1.undoView = globeView(map, { rotate: rotateFor(c) }); // 처음 회전 = 앞 평면 화면 가운데(원판 가운데로 — 거기서 돌아감)
        }
        refresh();
      }
    } finally { mine--; }
    if (narrow && opened) { open(false); if (focus) toggle.focus?.(); } // 좁은 무대: 누르면 다시 접음
    paint();
    spin(target);
  }
  /** 「평면 지도로」: 앞 평면 보기 + 고름 풂 + 바탕 되돌림 */
  function flat({ restoreView = true, focus = false } = {}) {
    if (!session) return;
    if (focus) { // 끄기 전에 초점을 마지막으로 누른 단추(좁으면 접기 단추)·열로 — 꺼진 단추에 초점이 남지 않게
      const last = els.find((x) => x.spec === (pressed || lastPressed))?.el;
      (narrow ? toggle : last || box).focus?.();
    }
    if (narrow && opened) open(false);
    stopSpin();
    const s0 = session, back = lastFlat; // 되돌리는 동안 viewchange 가 lastFlat 을 덮으므로 먼저
    session = null; pressed = null;
    mine++;
    try {
      try { layer.select(null); } catch { /* 이미 풀린 레이어 */ }
      if (restoreView && map && !map.destroyed && map.view?.key === 'globe') {
        if (s0.undoView) s0.undoView();
        else if (back) { map.setProjection(back.key, { animate: false }); if (back.center) map.flyTo({ center: back.center, zoom: back.k }, 0); }
        else { const k = Object.keys(PROJECTIONS).find((x) => !specialView(x)); if (k) map.setProjection(k, { animate: false }); }
      }
      s0.undoBase?.();
    } finally { mine--; }
    refresh();
    paint();
  }

  const offView = map?.on ? map.on('viewchange', (v) => {
    if (isFlat(v) && !v.moving) lastFlat = { key: v.key, center: v.center, k: v.k };
    if (session && !mine && v.key !== 'globe') flat({ restoreView: false }); // 사용자가 도법 상자로 바꿈 — 보기는 viewTools 몫
  }) : () => {};
  const offSel = layer.onSelect((v) => {
    if (mine || !pressed || v === selKey(pressed)) return;
    pressed = null; // 범례·맞히기로 다른 것을 고름 — 지구본 보기는 그대로
    paint();
  });

  const baseDraw = layer.draw, baseHit = layer.hit, baseSvg = layer.drawSvg, baseDestroy = layer.destroy;
  Object.assign(layer, {
    drawSvg(group, project, view) {
      if (dead) return;
      if (!stageEl) {
        stageEl = upTo(group, 'at-stage');
        if (stageEl) stageEl.append(box);
      }
      if (!view?.moving) place(); // 멈췄을 때만(끄는 동안 열이 뛰지 않게)
      baseSvg?.call(layer, group, project, view);
    },
    globes: {
      press, flat: () => flat(), open: (on = true) => open(on),
      get narrow() { return narrow; },
      get opened() { return opened; },
      get active() { return !!session; },
      get pressed() { return pressed?.id ?? null; },
    },
    destroy() {
      if (dead) return;
      flat();
      dead = true;
      stopSpin();
      offView(); offSel(); offProbe();
      box.remove();
      baseDestroy?.call(layer);
    },
  });
  if (idleHidden) {
    if (baseDraw) layer.draw = (...a) => { if (session) baseDraw.apply(layer, a); };
    layer.hit = (...a) => (session && baseHit ? baseHit.apply(layer, a) : null);
  }
  paint();
  return layer;
}

/**
 * 범례 블록 없음(U1-8 — 주제 레이어 항목 legend:false 를 지킴): topic.js 는 layer.legendItems 가 있으면 범례 블록을 만들고, layerFromRef 는 make 가 끝난 뒤
 * layer.legendItems = 자료 범례 를 덮어씀 → 읽으면 늘 빈 목록·쓰기는 무시하는 접근자로 막는다(공유 topic.js·layerRef.js 를 고치지 않음 — u1 전용).
 * 레이어 안의 고름·흐림은 자기 범례 상태(continentsLayer 의 lg)를 쓰므로 그대로.
 */
export function withoutLegendBlock(layer) {
  Object.defineProperty(layer, 'legendItems', { get: () => [], set: () => {}, configurable: true, enumerable: true });
  return layer;
}

/** 등록(installWorldExtras 가 installWorldQuiz 뒤에 부름 — 뒤 등록이 이김): 일반도 대륙 단추 · 10~11쪽 맞히기 + 대양 단추.
 *  일반도는 단추를 누르기 전에 면이 없어(idleHidden) 범례 블록(대륙 7)이 뜨면 안 맞음 — 항목이 legend:false(layerFromRef 가 ctx.legend 를 null 로 줌)면 블록 없음. */
export function installWorldGlobe(makeContinents) {
  registerLayerType('continentGlobes', (id, d, ctx) => {
    const layer = withGlobeButtons(makeContinents(id, d, ctx), 'continents', { map: ctx?.map, idleHidden: true });
    return ctx?.legend === null ? withoutLegendBlock(layer) : layer;
  });
  registerLayerType('continentQuiz', (id, d, ctx) => withGlobeButtons(withContinentQuiz(makeContinents(id, d, ctx), d, ctx), 'oceans', { map: ctx?.map }));
}
