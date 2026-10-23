// © 2026 김용현
// src/atlas/worldPaint.js — Ⅰ 세계화 U1-3h 세계 색칠하기 도구(15쪽 주제도 활동 「생활 속의 세계화 지도 만들기」 백지도, 교사 Q15 A).
//   installWorldExtras() 가 installWorldPaint() 로 registerLayerType('paintTool') 을 건다(부르지 않는 u2~u6 조각에는 코드가 없음).
//   topics.json 레이어 항목 {ref: 'p15-paint', type: 'paintTool'} — 자료는 build_layers 의 topicView 자료 그대로(설정 {type:'topicView', map:'p15-blank',
//   view:{centerLon:150}} — 파이프라인 고침 없음, 3e 의 continents → continentQuiz 처럼 앱 쪽 type 만 다름). view 가 있으면 polarExtra.topicViewLayer 로
//   보기(태평양 중심 — Q2)를 열고 destroy 때 되돌린다.
//   - 칠하기 = quiz.js coloringLayer(바탕 지도 나라 전부)를 그대로 쓴 캔버스 레이어(z 12: 육지 위·국경 아래). 나라 누르기(map.on('click') — 바탕 지도 나라
//     또는 이 레이어 동그라미) = 고른 색으로 칠함, 같은 색 다시 = 지움, 지우개 = 지움(coloringQuiz 와 같은 규칙 — 이름 맞히기 없음).
//   - 작은 나라 동그라미(넓이 기준 smallPx 16 — quiz.js largestPart·areaPx, 키리바시는 타라와 markAt)는 이 모듈이 그린다: coloringLayer 의 동그라미는
//     ① 나라 전부(242)에 쓰면 세계 보기에서 약 170개가 유럽·카리브를 덮고 ② 지구본·극 중심에서 뒷면 나라 동그라미도 그려서(투영 hidden 을 안 봄 —
//     임시 틀 캡처로 확인). 여기서는 뒷면(proj.hidden)은 빼고, 서로 겹치는 동그라미는 칠한 나라 → 화면에서 큰 나라 차례로 하나만(확대하면 풀림).
//   - 팔레트 칸(무대 위 DOM, 레이어가 처음 drawSvg 때 자기 <g> 에서 무대 .at-stage 를 찾아 붙임 — EMBED_RULES 「뿌리 안에서만」): quiz.js PALETTE 6색 +
//     지우개(선 아이콘 — dom.js icon() 에 없어 이 모듈 안 SVG) + 「모두 지우기」 + 「칠한 나라 n」. 자리 = placePalette(지도 도구·확대 단추·축척·범례 칸·
//     맞히기 칸·지구본 단추 열을 피함 — 넓은 무대 아래 가운데 가로 줄 → 왼쪽 위 가로 줄 → 왼쪽 세로 열(휴대폰)).
//   - 상태(칠한 색·고른 색)는 메모리만 — 저장 없음, destroy(주제 바꿈) 때 지움.
import { h, s, icon } from '../shared/dom.js';
import { registerLayerType } from './layerRef.js';
import { coloringLayer, largestPart, areaPx, PALETTE } from './quiz.js';
import { countryLevel } from './countryClass.js';
import { topicViewLayer } from './polarExtra.js';
import './worldPaint.css';

/** 칠하기 설정: 작은 나라 동그라미(넓이 기준 — 아프리카 U4-3e 꼴), 키리바시 = 타라와(오세아니아 U6-9 와 같은 값), 칠 불투명도 */
export const PAINT = Object.freeze({ smallPx: 16, smallMetric: 'area', markAt: Object.freeze({ KIR: [173.0, 1.42] }), alpha: 0.85 });
const COLOR_NAMES = ['분홍', '주황', '노랑', '초록', '하늘', '보라']; // PALETTE 차례(quiz.js)

/** 팔레트 칸이 피할 무대 위 부품과 무게(지도 도구·확대 단추·축척·맞히기 칸·지구본 단추 열은 꼭 피함, 범례 칸은 접을 수 있어 덜) */
const STAGE_UI = { 'at-tools-card': 100, 'at-tools-zoom': 100, 'at-scale': 100, 'at-wq': 100, 'at-wg': 100, 'at-legend-panel': 10, 'at-locator': 1, 'at-inset': 1 };
const GAP = 10, PAD = 4, SCALE_GAP = 44;
const overlapArea = (a, b) => Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0])) * Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));

/**
 * 팔레트 칸 자리: 무대 W×H, sizes = {row:[w, h](가로 줄), col:[w, h](세로 열)}, 장애물 [x0, y0, x1, y1, 무게?(기본 1)](무대 좌표 — 4px 넓힘).
 * 차례: 아래 가운데 가로 줄 → 왼쪽 위 가로 줄 → 왼쪽 위 세로 열 → 왼쪽 가운데 세로 열 → 왼쪽 아래(축척 위) 세로 열. 지금 자리(prefer)가 안 겹치면 그대로
 * (움직일 때마다 뛰지 않게), 아니면 안 겹치는 첫 자리, 다 겹치면 겹친 넓이 × 무게가 가장 작은 곳. 무대 밖으로 나가는 자리는 꼭 피함.
 * → {mode:'row'|'col', place:'bottom'|'top-left'|'left'|'mid-left'|'bottom-left', left, top, overlap}
 */
export function placePalette(W, H, sizes, obstacles = [], { prefer = null } = {}) {
  const cands = [
    ['row', 'bottom', (W - sizes.row[0]) / 2, H - GAP - sizes.row[1]],
    ['row', 'top-left', GAP, GAP],
    ['col', 'left', GAP, GAP],
    ['col', 'mid-left', GAP, (H - sizes.col[1]) / 2],
    ['col', 'bottom-left', GAP, H - SCALE_GAP - sizes.col[1]],
  ].map(([mode, place, left, top]) => {
    const [w, hh] = sizes[mode];
    const r = [left, top, left + w, top + hh];
    let overlap = obstacles.reduce((a, o) => a + overlapArea(r, [o[0] - PAD, o[1] - PAD, o[2] + PAD, o[3] + PAD]) * (o[4] ?? 1), 0);
    overlap += (Math.max(0, r[2] - W) + Math.max(0, -r[0])) * hh * 100 + (Math.max(0, r[3] - H) + Math.max(0, -r[1])) * w * 100; // 무대 밖
    return { mode, place, left: Math.round(left), top: Math.round(top), overlap };
  });
  return cands.find((c) => c.place === prefer && c.overlap === 0) || cands.find((c) => c.overlap === 0) || cands.reduce((a, c) => (c.overlap < a.overlap ? c : a));
}

/** 요소 위로 올라가며 클래스 c 를 가진 것(가짜 DOM 에도 되도록 closest 없이) */
function upTo(el, c) { for (let x = el; x; x = x.parentNode) if (x.classList?.contains(c)) return x; return null; }
/** 요소 아래에서 클래스가 cs 가운데 하나인 요소 모두(skip 의 속은 건너뜀) */
function allIn(el, cs, skip, out = []) {
  for (const x of el?.children || []) {
    if (x === skip) continue;
    if (cs.some((c) => x.classList?.contains(c))) out.push(x); else allIn(x, cs, skip, out);
  }
  return out;
}
/** 지우개 선 아이콘(dom.js icon() 과 같은 꼴 — 24 격자, 획만) */
const eraserIcon = () => s('svg', { class: 'ds-icon', viewBox: '0 0 24 24', 'aria-hidden': 'true' },
  s('path', { d: 'M8 20l-4.6-4.6a2 2 0 0 1 0-2.8L13.2 2.8a2 2 0 0 1 2.8 0l4.2 4.2a2 2 0 0 1 0 2.8L10 20' }),
  s('line', { x1: 8, y1: 20, x2: 21, y2: 20 }),
  s('line', { x1: 6.5, y1: 9.5, x2: 14.5, y2: 17.5 }));

/**
 * 색칠하기 도구 레이어. data = topicView 자료(properties.view — 없으면 보기는 그대로), opts: map(click 구독·다시 그리기·보기), countryFeatures
 * (바탕 지도 나라 도형 {'50': [...], '10a': [...]}). coloringLayer 객체에 팔레트·누르기를 덧붙여 돌려준다(paint·colorOf·painted·clear 그대로).
 * layer.paintTool = { pick(color|null), paint(iso), clear(), color, count }.
 */
export function paintToolLayer(id, data, { map = null, countryFeatures = null, layerId = id } = {}) {
  if (!countryFeatures || !Object.keys(countryFeatures).length) throw new Error(`paintTool ${id}: 바탕 지도 나라 도형(countryFeatures)이 없음`);
  const layer = coloringLayer(countryFeatures, { id, alpha: PAINT.alpha }); // 동그라미는 아래 drawMarks
  const countries = countryFeatures[countryLevel(null, countryFeatures)] || [];
  const markR = PAINT.smallPx / 2 + 3;
  const parts = new Map(); // iso → 가장 큰 조각 {a, c}(markAt 이면 넓이 0 — 늘 동그라미) | null, 처음 한 번
  let marks = [];          // 마지막 그림의 동그라미 [{iso, x, y}]
  const view = data?.properties?.view ? topicViewLayer(id, data, { map }) : null;
  let color = PALETTE[0], dead = false, stageEl = null, placed = null;
  const refresh = () => { if (map && !map.destroyed) map.refreshLayer?.(layer.id); };

  // ── 팔레트 칸 ──
  const swatches = PALETTE.map((c, i) => h('button', {
    class: 'at-wp-color', type: 'button', style: { background: c }, 'aria-pressed': 'false',
    'aria-label': `색 ${i + 1} — ${COLOR_NAMES[i] ?? c}`, title: `${COLOR_NAMES[i] ?? c}으로 칠하기`,
    on: { click: (e) => { e.stopPropagation?.(); pick(c); } },
  }));
  const eraser = h('button', {
    class: 'at-wp-erase', type: 'button', 'aria-pressed': 'false', 'aria-label': '지우개', title: '지우개 — 누른 나라의 색을 지움',
    on: { click: (e) => { e.stopPropagation?.(); pick(null); } },
  }, eraserIcon());
  const clearBtn = h('button', {
    class: 'ds-btn at-wp-clear', type: 'button', 'aria-label': '모두 지우기', title: '칠한 나라를 모두 지우기',
    on: { click: (e) => { e.stopPropagation?.(); clear(); } },
  }, icon('reset'), h('span', { class: 'at-wp-clear-text' }, '모두 지우기'));
  const countOut = h('span', { class: 'at-wp-count', role: 'status', 'aria-live': 'polite' });
  const panel = h('section', { class: 'at-wp', 'aria-label': '세계 색칠하기 도구', 'data-mode': 'row' },
    h('span', { class: 'at-wp-title', title: '색을 고르고 지도에서 나라를 눌러 칠해 보자.' }, icon('brush'), h('span', { class: 'at-wp-title-text' }, '색칠하기')),
    h('div', { class: 'at-wp-palette', role: 'group', 'aria-label': '팔레트' }, ...swatches, eraser),
    clearBtn, countOut);

  function updateCount() { countOut.textContent = `칠한 나라 ${layer.painted.size}`; }
  function pick(c) {
    color = c;
    swatches.forEach((b, i) => b.setAttribute('aria-pressed', String(PALETTE[i] === c)));
    eraser.setAttribute('aria-pressed', String(c === null));
  }
  function paintIso(iso) {
    if (dead || !iso || !layer.feature(iso)) return;
    layer.paint(iso, color && layer.colorOf(iso) !== color ? color : null);
    updateCount();
    refresh();
  }
  function clear() {
    if (dead) return;
    layer.clear();
    updateCount();
    refresh();
  }
  pick(PALETTE[0]);
  updateCount();

  /** 팔레트 칸 자리(무대 크기·칸 크기는 지금 값 — 멈춘 그림마다) */
  function place() {
    if (dead || !stageEl || !panel.parentNode) return;
    const sr = stageEl.getBoundingClientRect?.();
    if (!sr || !(sr.width > 0)) return;
    const cls = Object.keys(STAGE_UI);
    const ui = allIn(stageEl, cls, panel).filter((x) => !x.hidden).map((x) => [x.getBoundingClientRect(), x])
      .filter(([r]) => r.width > 0 && r.height > 0)
      .map(([r, x]) => [r.left - sr.left, r.top - sr.top, r.right - sr.left, r.bottom - sr.top, STAGE_UI[cls.find((c) => x.classList.contains(c))]]);
    const sizes = {};
    for (const m of ['row', 'col']) {
      panel.setAttribute('data-mode', m);
      const r = panel.getBoundingClientRect();
      sizes[m] = [r.width, r.height];
    }
    if (!(sizes.row[0] > 0)) { panel.setAttribute('data-mode', placed?.mode || 'row'); return; }
    const p = placePalette(sr.width, sr.height, sizes, ui, { prefer: placed?.place });
    placed = p;
    panel.setAttribute('data-mode', p.mode);
    panel.setAttribute('data-place', p.place);
    panel.style.left = `${p.left}px`; panel.style.top = `${p.top}px`;
  }

  // 나라 누르기: 바탕 지도 나라(layerId 'basemap') 또는 이 레이어의 작은 나라 동그라미(hit)
  const offClick = map?.on ? map.on('click', (e) => {
    if (e?.layerId !== 'basemap' && e?.layerId !== layerId) return;
    paintIso(e.feature?.properties?.iso);
  }) : () => {};

  /** 작은 나라 동그라미: 보이는 쪽·화면 안·화면 넓이 < smallPx 인 나라를 칠한 나라 → 큰 나라 차례로, 이미 놓인 동그라미와 겹치지 않을 때만 */
  function drawMarks(ctx, path, view) {
    marks = [];
    const proj = path.projection?.();
    if (!proj) return;
    const W = view?.width ?? Infinity, H = view?.height ?? Infinity, cands = [];
    for (const f of countries) {
      const iso = f?.properties?.iso;
      if (!iso) continue;
      if (!parts.has(iso)) parts.set(iso, Object.hasOwn(PAINT.markAt, iso) ? { a: 0, c: PAINT.markAt[iso] } : largestPart(f.geometry));
      const big = parts.get(iso);
      if (!big || proj.hidden?.(big.c)) continue;
      const px = areaPx(proj, big);
      if (px == null || px >= PAINT.smallPx) continue;
      const q = proj(big.c);
      if (!q || !Number.isFinite(q[0]) || !Number.isFinite(q[1]) || q[0] < -markR || q[1] < -markR || q[0] > W + markR || q[1] > H + markR) continue;
      cands.push({ iso, x: q[0], y: q[1], px, c: layer.colorOf(iso) });
    }
    cands.sort((a, b) => (!!b.c - !!a.c) || b.px - a.px);
    const min2 = (2 * markR + 1) ** 2;
    for (const m of cands) if (marks.every((k) => (k.x - m.x) ** 2 + (k.y - m.y) ** 2 >= min2)) marks.push(m);
    ctx.globalAlpha = 1; ctx.lineWidth = 2; ctx.strokeStyle = '#4d4d4d';
    for (const m of marks) {
      ctx.beginPath(); ctx.arc(m.x, m.y, markR, 0, 2 * Math.PI);
      ctx.fillStyle = m.c || 'rgba(255,255,255,0.85)'; ctx.fill(); ctx.stroke();
    }
  }

  const baseClear = layer.clear, baseDraw = layer.draw;
  Object.assign(layer, {
    meta: { title: '세계 색칠하기 도구' },
    draw(ctx, path, view) { baseDraw(ctx, path, view); drawMarks(ctx, path, view); },
    /** 동그라미 누르기(반지름 + 3px, 가장 가까운 것) → 그 나라 Feature(renderer 가 layerId = 이 레이어로 click 을 냄) */
    hit(xy) {
      let best = null, bd = markR + 3;
      for (const m of marks) { const d = Math.hypot(xy[0] - m.x, xy[1] - m.y); if (d <= bd) { bd = d; best = m; } }
      return best ? layer.feature(best.iso) : null;
    },
    drawSvg(group, project, v) {
      if (dead) return; // destroy 뒤 늦게 온 다시 그리기가 칸을 다시 붙이지 않게
      if (!stageEl) {
        stageEl = upTo(group, 'at-stage');
        if (stageEl) stageEl.append(panel);
      }
      if (!v?.moving) place(); // 멈췄을 때만 자리 다시 봄
    },
    labelObstacles: () => [],
    paintTool: {
      pick, paint: paintIso, clear,
      get color() { return color; },
      get count() { return layer.painted.size; },
    },
    destroy() {
      if (dead) return;
      dead = true;
      offClick();
      panel.remove();
      baseClear.call(layer);
      view?.destroy();
    },
  });
  /** 마지막 그림의 동그라미 자리(확인용 — Object.assign 은 getter 를 값으로 굳히므로 따로) */
  Object.defineProperty(layer, 'marks', { get: () => marks.map((m) => ({ iso: m.iso, x: m.x, y: m.y })) });
  return layer;
}

/** 등록(installWorldExtras 가 부름): 'paintTool' = 보기(topicView 자료) + 세계 색칠하기 도구 */
export function installWorldPaint() {
  registerLayerType('paintTool', (id, d, ctx) => paintToolLayer(id, d, ctx));
}
