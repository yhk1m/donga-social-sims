// © 2026 김용현
// src/atlas/americasExtra.js — 아메리카(U5-3)에서 처음 쓰는 엔진 기능. installAmericasExtras() 를 부른 단원 조각에만 들어간다
//   (fitCore.registerFamily 등 등록 자리에 등록 — 부르지 않는 u2·u3·u4 조각은 코드도 크기도 그대로. chartsExtra.js 와 같은 길).
//   - 3a 평사(stereographic — 40·41쪽 입체 투영)·정사(orthographic — 46쪽 지구본) 도법: installAmericasFamilies()
//     파이프라인(scripts/atlas/georef.mjs)은 불러올 때 이것만 늘 부른다(Node 라 크기 상관없음). u2 지도 후보는 PHASE1_FAMILIES 고정이라 안 들어감.
//   - 3c 지구본 보기(registerProjection('globe') — projections.PROJECTIONS 에 넣음, 지도 도구 「도법」에 「지구본」 단추가 생김)
//     = geoOrthographic().clipAngle(90), 상태 rot = d3 rotate [λ, φ](화면 가운데 = (−λ, −φ)), 원판 지름 = 무대 짧은 변 × GLOBE.fill.
//     렌더러 등록 자리(renderer.js): 끌기 → def.pan(회전, φ ±GLOBE.maxLat) → map.rebase(), project 는 뒷면(hidden)이면 null, 경위선 step(k)(처음 15°),
//     지구본 ↔ 평면은 보간하지 않음. globeTools(map, toolsEl) = 바꿀 때 짧은 페이드 · 대서양/태평양 단추 숨김 · 「세계 전체 보기」·0 = 처음 회전·크기 ·
//     평면 → 지구본은 앞 화면 가운데를 원판 가운데로 · 지구본 → 평면은 앞 평면 보기(가운데·확대)로 되돌림(단원 main 이 mountAtlas 뒤에 부름).
//     주제가 지구본으로 여는 길: 레이어 자료 properties.view = {projection:'globe', rotate:[λ, φ]}(pathFlow 가 받음 — globeView) — 묶음을 떠나면
//     앞 도법·가운데·확대로 되돌림(그사이 사용자가 도법을 바꿨으면 그대로, centerLonOf 꼴).
//   - 3c 경로 화살표 레이어(registerLayerType('pathFlow')): 자료 = FeatureCollection {properties:{layerType:'pathFlow', legend:[{cls, label, color,
//     kind:'flow', dashed?}], view?}, features:[{properties:{id, cls, dashed?, width?(pt)}, geometry: LineString|MultiLineString(경위도 — 교과서
//     곡선을 되돌린 줄, 꼬리 → 화살 끝)}]}. 선 = geoPath(view.projection)(지구본 뒷면·날짜변경선은 투영이 자름), 화살촉 = 마지막 두 점 방향(arrowHead),
//     굵기 flowWidthPx, 점선(dashed — 노예 이동). 범례는 기존 흐름선 견본(kind 'flow' + dashed)이 그대로 그림.
//   단원 main.js: import { installAmericasExtras, globeTools } from '../../src/atlas/americasExtra.js'; installAmericasExtras();  (mountAtlas 전에)
//                 mountAtlas(…) 뒤 globeTools(root.atlasMap, root.atlasUi.tools.el)(돌려준 함수 = 풀기)
import { geoStereographic, geoOrthographic, geoDistance, geoPath } from 'd3-geo';
import { h, s } from '../shared/dom.js';
import { hatchHook } from './layers.js';
import { registerFamily } from './fitCore.js';
import { PROJECTIONS } from './projections.js';
import { graticuleStep } from './lineStyle.js';
import { registerLayerType } from './layerRef.js';
import { flowWidthPx, arrowHead, arrowSize, alphaOf, distToPolyline, zoomScale } from './layerStyle.js';
import { LAYER_Z, round1, metaOf, setAttr, connect, hoverClass, featuresOf, isLine } from './layerCommon.js';

/** 3a: 평사·정사 도법 등록. 매개변수 p = [중심 경도, 중심 위도](방위 도법과 같은 꼴). */
export function installAmericasFamilies() {
  registerFamily('stereographic', (p) => geoStereographic().rotate([-p[0], -p[1]]));
  registerFamily('orthographic', (p) => geoOrthographic().rotate([-p[0], -p[1]]).clipAngle(90));
}

// ---------- 3c 지구본 보기 ----------
const DEG = 180 / Math.PI;
/** 지구본 규칙: 원판 지름 = 무대 짧은 변 × fill, 끌어 돌릴 때 φ 한계(°), 처음(k < 2) 경위선 간격(°) */
export const GLOBE = Object.freeze({ fill: 0.9, maxLat: 85, step: 15 });
const clampLat = (v) => Math.max(-GLOBE.maxLat, Math.min(GLOBE.maxLat, v));
const wrapLon = (v) => ((((v + 180) % 360) + 360) % 360) - 180;

/** 회전 [λ, φ] 일 때 원판 가운데 경위도 = (−λ, −φ). */
export const globeCenter = (rot) => [wrapLon(-rot[0]), -rot[1]];
/** 원판 가운데에 둘 경위도 → 회전(φ 는 ±maxLat 로 자름). */
export const rotateFor = (center) => [wrapLon(-center[0]), clampLat(-center[1])];

/**
 * 끌기 한 걸음(dx, dy px) → 새 회전: 원판 반지름 R(px) 에서 화면 가운데 표면이 손가락을 따라가게 Δλ = dx / R, Δφ = −dy / R(라디안 → 도).
 * 오른쪽으로 끌면 서쪽이 가운데로 오고(λ 늘어남), 아래로 끌면 북쪽이 가운데로(φ 줄어듦). φ 는 ±maxLat.
 */
export function rotateBy(rot, dx, dy, R) {
  return [wrapLon(rot[0] + (dx / R) * DEG), clampLat(rot[1] - (dy / R) * DEG)];
}

/** 지구본 도법 정의(PROJECTIONS 항목 꼴 + 렌더러 등록 자리 setup·pan). rot = 지금 회전, home = 「세계 전체 보기」가 돌아갈 회전. */
export function globeProjection({ rotate = [0, 0] } = {}) {
  const def = {
    label: '지구본',
    rot: rotateFor(globeCenter(rotate)), home: null, r: 1,
    make() {
      const p = geoOrthographic().clipAngle(90);
      // 뒷면: 원판 가운데에서 90° 넘게 떨어진 점(렌더러 project 가 null — 지명·기호·화살촉이 앞면에 비치지 않게)
      p.hidden = (ll) => { const r = p.rotate(); return geoDistance(ll, [-r[0], -r[1]]) > Math.PI / 2 - 1e-9; };
      p.step = (k) => (k < 2 ? GLOBE.step : graticuleStep(k));
      return p;
    },
    setup(p, w, h) {
      def.r = (GLOBE.fill / 2) * Math.min(w, h);
      p.rotate(def.rot).scale(def.r).translate([w / 2, h / 2]);
    },
    pan(dx, dy, k) { def.rot = rotateBy(def.rot, dx, dy, def.r * k); return true; },
  };
  return def;
}

/** 등록 도법: projections.PROJECTIONS 에 넣는다(makeProjection·viewProjection·지도 도구 단추가 함께 봄). */
export function registerProjection(name, def) { PROJECTIONS[name] = def; }

const globeDef = () => PROJECTIONS.globe;
/** 지구본 처음 보기: 원판 가운데 = 회전 가운데, 확대 1(변환 0 — 원판이 무대 가운데). */
function homeView(map, ms = 0) { map.flyTo({ center: globeCenter(globeDef().rot), zoom: 1 }, ms); }
let entering = false; // globeView 가 바꾸거나 되돌리는 중(globeTools 가 따로 회전·되돌리기 하지 않게)

/**
 * 지구본으로 열기(주제·레이어 자료 view = {projection:'globe', rotate}) → 되돌리는 함수. 되돌리기 = 앞 도법 + 앞 화면 가운데·확대
 * (그사이 사용자가 지구본에서 다른 도법으로 바꿨으면 그대로 둠). 회전이 없으면 지금 회전.
 */
export function globeView(map, { rotate = null } = {}) {
  const def = globeDef();
  if (!def || !map?.view) return () => {};
  const v = map.view, prev = { key: v.key, center: v.center, k: v.k };
  if (rotate) def.rot = rotateFor(globeCenter(rotate));
  def.home = def.rot.slice();
  entering = true;
  try {
    if (v.key === 'globe') map.rebase(); else map.setProjection('globe', { animate: false });
    homeView(map);
  } finally { entering = false; }
  return () => {
    if (map.destroyed || map.view?.key !== 'globe' || prev.key === 'globe') return;
    entering = true; // 되돌리기도 globeTools 가 따로 움직이지 않게(뒤따르는 묶음 맞추기 날아가기를 끊지 않게)
    try {
      map.setProjection(prev.key, { animate: false });
      if (prev.center) map.flyTo({ center: prev.center, zoom: prev.k }, 0);
    } finally { entering = false; }
  };
}

/**
 * 지도 도구에 지구본 몫을 잇는다(단원 main 이 mountAtlas 뒤에): toolsEl = mapTools(…).el(무대 안).
 *   - 도법이 지구본 ↔ 평면으로 바뀌면 바탕 캔버스 짧은 페이드(보간 대신 — 설계 §6.1-1 극 보기와 같은 규칙)
 *   - 지구본이면 「중심 경도」(대서양·태평양) 단추 숨김
 *   - 지구본에서 「세계 전체 보기」 단추·0 키 = 처음 회전(home)·확대 1(평면은 도구 그대로)
 *   - 평면 → 지구본(도구 단추): 앞 화면 가운데를 원판 가운데로, 확대 1 / 지구본 → 평면: 앞 평면 보기(가운데·확대)로 되돌림
 * → 풀기 함수.
 */
export function globeTools(map, toolsEl) {
  const stage = toolsEl?.parentNode;
  const canvas = stage?.querySelector?.('.at-base');
  const centerSeg = toolsEl?.querySelector?.('[aria-label="중심 경도"]');
  let last = map.view?.key, flat = null; // flat = 마지막 멈춘 평면 보기 {key, center, k}
  const later = (fn) => Promise.resolve().then(() => { if (!map.destroyed) fn(); }); // viewchange 안에서 다시 그리지 않게
  const sync = (v) => { if (centerSeg) centerSeg.hidden = v.key === 'globe'; };
  const off = map.on('viewchange', (v) => {
    const was = last;
    last = v.key;
    sync(v);
    if (v.key !== 'globe' && !v.moving && was === v.key) flat = { key: v.key, center: v.center, k: v.k };
    if (was === v.key || (was !== 'globe' && v.key !== 'globe')) return;
    canvas?.animate?.([{ opacity: 0.35 }, { opacity: 1 }], { duration: 260, easing: 'ease-out' });
    if (entering) return;
    const def = globeDef();
    if (v.key === 'globe') {
      const c = flat?.center;
      if (c) def.rot = rotateFor(c);
      def.home = def.rot.slice();
      later(() => { map.rebase(); homeView(map); });
    } else if (flat?.center && flat.key !== 'globe') {
      const f = flat;
      later(() => map.flyTo({ center: f.center, zoom: f.k }, 0));
    }
  });
  const home = (e) => {
    if (map.view?.key !== 'globe') return false;
    e.stopImmediatePropagation(); e.preventDefault();
    const def = globeDef();
    if (def.home) def.rot = def.home.slice();
    map.rebase();
    homeView(map, 500);
    return true;
  };
  const onClick = (e) => { if (e.target?.closest?.('[aria-label="세계 전체 보기"]')) home(e); };
  const onKey = (e) => { if (e.key === '0' && e.target === stage && !e.altKey && !e.ctrlKey && !e.metaKey) home(e); };
  toolsEl?.addEventListener('click', onClick, true);
  stage?.addEventListener('keydown', onKey, true);
  if (map.view) sync(map.view);
  return () => { off(); toolsEl?.removeEventListener('click', onClick, true); stage?.removeEventListener('keydown', onKey, true); };
}

// ---------- 3c 경로 화살표 ----------
/** 선(경위도 점 목록)의 화면 끝 접선 {tip, dir} — 끝점이 안 보이면(뒷면·투영 못 함) null. 앞 점은 끝에서 minPx 이상 떨어진 마지막 점(촘촘한 줄의 흔들림 막기). */
export function pathTip(line, project, minPx = 1) {
  const tip = line.length >= 2 ? project(line[line.length - 1]) : null;
  if (!tip) return null;
  for (let i = line.length - 2; i >= 0; i--) {
    const q = project(line[i]);
    if (!q) return null;
    const dx = tip[0] - q[0], dy = tip[1] - q[1], L = Math.hypot(dx, dy);
    if (L >= minPx) return { tip, dir: [dx / L, dy / L] };
  }
  return null;
}

/** 선 끝을 화면 by px 만큼 당긴 경위도 줄(선 끝이 화살촉 끝으로 삐져나오지 않게) — 끝에서 by 안의 점은 빼고, 경계는 화면 거리 비로 경위도 보간. */
export function trimLineEnd(line, project, by) {
  const tip = project(line[line.length - 1]);
  if (!tip || by <= 0) return line;
  for (let i = line.length - 2; i >= 0; i--) {
    const q = project(line[i]);
    if (!q) return line;
    const d = Math.hypot(q[0] - tip[0], q[1] - tip[1]);
    if (d >= by) {
      const a = line[i], b = line[i + 1], qb = project(b), db = qb ? Math.hypot(qb[0] - tip[0], qb[1] - tip[1]) : 0;
      const t = d - db > 1e-9 ? (d - by) / (d - db) : 0;
      return [...line.slice(0, i + 1), [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]];
    }
  }
  return line;
}

/** 화면 조각들(보이는 점끼리 이은 줄 — 맞히기용). */
function screenRuns(lines, project) {
  const runs = [];
  for (const line of lines) {
    let run = [];
    for (const ll of line) {
      const q = project(ll);
      if (q) run.push(q); else { if (run.length > 1) runs.push(run); run = []; }
    }
    if (run.length > 1) runs.push(run);
  }
  return runs;
}

/**
 * 경로 화살표 레이어(SVG, type 'pathFlow'). 선 하나 = <g class="at-flow"> 안에 흰 테두리 + 색 선 + 화살촉(기존 흐름선 CSS).
 * MultiLineString 은 마지막 줄 끝에만 화살촉. 굵은 선 먼저(아래). labelObstacles = [](선만 — 지명을 밀어내지 않음).
 * 자료 properties.view 가 있고 map 이 있으면 만들 때 globeView(지구본으로 열기) — destroy 때 되돌림. 처음 보기(home)는 묶음 맞추기(fitBounds) 뒤에 한 번 더.
 */
export function pathFlowLayer(id, data, { legend = null, map = null, layerId = id, onPick = null, dimAlpha = 0.2, z = LAYER_Z.flow } = {}) {
  const feats = featuresOf(data).filter(isLine);
  const widthOf = (f) => f.properties?.width ?? 1;
  const items = feats.map((f) => ({ f, lines: f.geometry.type === 'MultiLineString' ? f.geometry.coordinates : [f.geometry.coordinates], w: 0, runs: [] }))
    .sort((a, b) => widthOf(b.f) - widthOf(a.f));
  const byF = new Map(items.map((it) => [it.f, it]));
  let root = null, alive = true;

  function build(g) {
    root = s('g', { class: 'at-flows at-pathflows' });
    for (const it of items) {
      const color = it.f.properties?.color || data.properties?.legend?.find((e) => e.cls === it.f.properties?.cls)?.color || '#231f20';
      Object.assign(it, { w: 0 });
      it.halo = s('path', { class: 'at-flow-halo' });
      it.line = s('path', { class: 'at-flow-line', stroke: color });
      it.head = s('path', { class: 'at-flow-head', fill: color });
      it.el = s('g', { class: 'at-flow', on: { click: (e) => { e.stopPropagation(); onPick?.(it.f, e); } } }, s('title', {}, it.f.properties?.label || ''), it.halo, it.line, it.head);
    }
    root.append(...items.map((it) => it.el));
    g.append(root);
  }
  const onHover = hoverClass((f) => byF.get(f));
  const dashed = (it) => !!(it.f.properties?.dashed ?? data.properties?.legend?.find((e) => e.cls === it.f.properties?.cls)?.dashed);
  const layer = {
    id, z, meta: metaOf(data), features: feats,
    labelObstacles: () => [],
    drawSvg(g, project, view) {
      if (!root || root.parentNode !== g) build(g);
      const gp = geoPath(view.projection);
      for (const it of items) {
        const w = flowWidthPx(widthOf(it.f), view.k);
        if (w !== it.w) {
          it.w = w;
          setAttr(it.line, 'stroke-width', round1(w)); setAttr(it.halo, 'stroke-width', round1(w + 2.4));
          const dash = dashed(it) ? `${round1(w * 3)} ${round1(w * 2)}` : null;
          setAttr(it.line, 'stroke-dasharray', dash); setAttr(it.halo, 'stroke-dasharray', dash);
        }
        const lastLine = it.lines[it.lines.length - 1];
        const tan = pathTip(lastLine, project);
        const lines = tan ? [...it.lines.slice(0, -1), trimLineEnd(lastLine, project, arrowSize(w).len * 0.6)] : it.lines;
        const d = gp({ type: 'MultiLineString', coordinates: lines }) || null;
        setAttr(it.line, 'd', d); setAttr(it.halo, 'd', d);
        setAttr(it.head, 'd', tan ? arrowHead(tan.tip, tan.dir, w).path : null);
        it.runs = screenRuns(it.lines, project);
        const a = alphaOf(legend, it.f.properties?.cls, dimAlpha);
        setAttr(it.el, 'opacity', a === 1 ? null : a);
        it.el.classList.toggle('is-hover', it.f === onHover.current());
      }
    },
    hit(xy) {
      for (let i = items.length - 1; i >= 0; i--) {
        const it = items[i];
        if (!it.runs.length || alphaOf(legend, it.f.properties?.cls, 0) === 0) continue;
        const tol = Math.max(4, it.w / 2 + 3);
        if (it.runs.some((r) => distToPolyline(xy, r) <= tol)) return it.f;
      }
      return null;
    },
    destroy() { alive = false; offs.forEach((off) => off()); offs.length = 0; root?.remove(); root = null; restore(); },
  };
  const offs = connect({ map, legend, layerId, onHover });
  const view = data?.properties?.view;
  let restore = () => {};
  if (map && view?.projection === 'globe' && globeDef()) {
    const r = globeView(map, view);
    restore = () => { restore = () => {}; r(); };
    // 주제가 레이어를 올린 뒤 묶음 범위로 맞추면(fitBounds) 원판이 비켜나므로 처음 보기를 한 번 더(같은 작업 끝 — 날아가기를 끊음)
    Promise.resolve().then(() => { if (alive && !map.destroyed && map.view?.key === 'globe') homeView(map); });
  }
  return layer;
}

// ---------- 3f 네모 단위 기호(47쪽 마킬라도라) ----------
/** 칸 크기(px): 화면 약 4px(k 2.2)에서 확대에 따라 [3, 8]. 틈 = 칸 × 0.25(최소 1px). */
export function unitCellPx(k) {
  const c = Math.min(8, Math.max(3, 4 * zoomScale(k, { ref: 2.2, exp: 0.5, min: 0.75, max: 2 })));
  return { c, g: Math.max(1, c * 0.25) };
}

/**
 * 칸 배치(밑 가운데 = (0, 0), 위로 쌓음): series [{cls, count}] 를 범례 차례(order)로, 계열마다 maxRun 칸씩 열을 왼쪽부터 채우고 계열 열을 나란히.
 * → {cells:[{cls, x, y}], w, h}(칸 왼쪽 위 자리, 묶음 너비·높이 px)
 */
export function unitLayout(series, order, maxRun, c, g) {
  const p = c + g, cols = [];
  const by = new Map(series.map((s) => [s.cls, s.count]));
  for (const cls of order) for (let left = by.get(cls) || 0; left > 0; left -= maxRun) cols.push({ cls, n: Math.min(maxRun, left) });
  const w = cols.length * p - g, cells = [];
  cols.forEach((col, i) => { for (let r = 0; r < col.n; r++) cells.push({ cls: col.cls, x: -w / 2 + i * p, y: -c - r * p }); });
  return { cells, w: Math.max(0, w), h: Math.max(0, ...cols.map((col) => col.n * p - g)) };
}

/**
 * 네모 단위 기호 레이어(SVG, type 'unitSymbols'). 자료 = FeatureCollection {properties:{layerType:'unitSymbols', maxRun(한 열 최대 칸 — 교과서 가장 긴 열),
 * legend:[{cls, label, color, kind:'symbol', shape:'square', unit}]}, features:[{properties:{id, name, label(말풍선), series:[{cls, count}], leader?:[lon, lat]},
 * geometry: Point(칸 묶음 밑 가운데 — 교과서 자리를 되돌린 경위도)}]}. 칸 수는 센 값 그대로, 확대하면 칸 크기만 바뀜(unitCellPx — 칸 비 그대로).
 * leader 가 있으면(교과서가 칸 묶음을 비켜 그리고 지시선으로 주를 가리킨 것) 묶음 밑 가운데 → leader 점 선 + 끝 점. 누르면 onPick(feature),
 * 지명 장애물 = 칸 묶음 상자, 범례 고름 = 고르지 않은 계열 칸 흐리게. CSS 없이 속성으로 그린다(공유 atlas.css 를 늘리지 않음).
 */
export function unitSymbolsLayer(id, data, { legend = null, map = null, layerId = id, onPick = null, dimAlpha = 0.2, z = LAYER_Z.symbol } = {}) {
  const feats = featuresOf(data).filter((f) => f.geometry?.type === 'Point');
  const legendList = data.properties?.legend || [];
  const order = legendList.map((e) => e.cls), colorOf = new Map(legendList.map((e) => [e.cls, e.color]));
  const maxRun = data.properties?.maxRun || 10;
  const items = feats.map((f) => ({ f }));
  const byF = new Map(items.map((it) => [it.f, it]));
  let root = null;
  function build(g) {
    root = s('g', { class: 'at-units' });
    for (const it of items) {
      Object.assign(it, { key: '', box: null, groups: null });
      it.el = s('g', { class: 'at-unit-item', cursor: 'pointer', on: { click: (e) => { e.stopPropagation(); onPick?.(it.f, e); } } }, s('title', {}, it.f.properties.label || it.f.properties.name || ''));
      if (it.f.properties.leader) {
        it.leader = s('path', { class: 'at-unit-leader', fill: 'none', stroke: '#231f20', 'stroke-width': 0.8 });
        it.dot = s('circle', { class: 'at-unit-dot', r: 1.6, fill: '#231f20' });
        root.append(it.leader, it.dot);
      }
    }
    root.append(...items.map((it) => it.el));
    g.append(root);
  }
  const onHover = hoverClass((f) => byF.get(f));
  const layer = {
    id, z, meta: metaOf(data), features: feats,
    labelObstacles: () => items.filter((it) => it.box).map((it) => [...it.box]),
    drawSvg(g, project, view) {
      if (!root || root.parentNode !== g) build(g);
      const { c, g: gap } = unitCellPx(view.k);
      for (const it of items) {
        const q = project(it.f.geometry.coordinates);
        const shown = !!q && q[0] > -60 && q[0] < view.width + 60 && q[1] > -10 && q[1] < view.height + 200;
        setAttr(it.el, 'display', shown ? null : 'none');
        const e = shown && it.f.properties.leader ? project(it.f.properties.leader) : null;
        if (it.leader && !e) { setAttr(it.leader, 'd', null); setAttr(it.dot, 'display', 'none'); }
        if (!shown) { it.box = null; continue; }
        const key = `${round1(c)}`;
        if (key !== it.key) { // 칸 크기가 바뀌었을 때만 칸을 다시 만든다
          it.key = key;
          const lay = unitLayout(it.f.properties.series || [], order, maxRun, c, gap);
          it.groups = order.map((cls) => s('g', { class: 'at-unit-series', fill: colorOf.get(cls) },
            lay.cells.filter((x) => x.cls === cls).map((x) => s('rect', { class: 'at-unit-cell', 'data-cls': cls, x: round1(x.x), y: round1(x.y), width: round1(c), height: round1(c) }))));
          it.el.replaceChildren(it.el.childNodes[0], ...it.groups);
          it.w = lay.w; it.h = lay.h;
        }
        setAttr(it.el, 'transform', `translate(${round1(q[0])},${round1(q[1])})`);
        it.box = [q[0] - it.w / 2, q[1] - it.h, q[0] + it.w / 2, q[1]];
        if (e) { // 지시선: 칸 묶음 상자에서 끝 점에 가장 가까운 점 → 끝 점(교과서 꺾인 선 대신 곧은 선)
          const bx = Math.max(it.box[0], Math.min(e[0], it.box[2])), by = Math.max(it.box[1], Math.min(e[1], it.box[3]));
          setAttr(it.leader, 'd', `M${round1(bx)},${round1(by)}L${round1(e[0])},${round1(e[1])}`);
          setAttr(it.dot, 'display', null); setAttr(it.dot, 'cx', round1(e[0])); setAttr(it.dot, 'cy', round1(e[1]));
        }
        order.forEach((cls, i) => { const a = alphaOf(legend, cls, dimAlpha); setAttr(it.groups[i], 'opacity', a === 1 ? null : a); });
        const hot = it.f === onHover.current();
        it.el.classList.toggle('is-hover', hot);
        setAttr(it.el, 'stroke', hot ? '#1f2a44' : null);
      }
    },
    hit(xy) {
      for (let i = items.length - 1; i >= 0; i--) {
        const b = items[i].box;
        if (b && xy[0] >= b[0] - 2 && xy[0] <= b[2] + 2 && xy[1] >= b[1] - 2 && xy[1] <= b[3] + 2) return items[i].f;
      }
      return null;
    },
    destroy() { offs.forEach((off) => off()); offs.length = 0; root?.remove(); root = null; },
  };
  const offs = connect({ map, legend, layerId, onHover });
  return layer;
}

// ---------- 3h 빗금 각도·색(46쪽 중남미 「혼혈」 가로 분홍 줄 · 「아프리카계」 사선 검은 빗금) ----------
/** 빗금 줄 규칙: 타일 한 변(px — 줄 간격), 줄 굵기(px). */
export const HATCH_LINE = Object.freeze({ tile: 5, width: 1.2 });
const lineTiles = new Map();
/**
 * 빗금 고리(layers.hatchHook.make): 면 자료 properties.angle(°, 0 = 가로, 반시계)이 있으면 가로 줄 타일(색 = properties.color — 범례 줄 색)을 그 각만큼 돌린
 * 무늬, 없으면 null(옛 45° 타일 — u2 고산·u4 사헬 그대로). 돌림 = 무늬 setTransform(캔버스 y 아래라 rotate(−angle)), 0·180° 는 돌리지 않음.
 */
export function hatchTile(ctx, f) {
  const a = f.properties?.angle;
  if (a == null) return null;
  const color = f.properties.color || '#231f20';
  let tile = lineTiles.get(color);
  if (!tile) {
    tile = h('canvas'); tile.width = tile.height = HATCH_LINE.tile;
    const c = tile.getContext('2d');
    c.strokeStyle = color; c.lineWidth = HATCH_LINE.width;
    c.beginPath(); c.moveTo(0, HATCH_LINE.tile / 2); c.lineTo(HATCH_LINE.tile, HATCH_LINE.tile / 2); c.stroke();
    lineTiles.set(color, tile);
  }
  const pat = ctx.createPattern(tile, 'repeat');
  const r = ((a % 180) + 180) % 180;
  if (r && pat?.setTransform && typeof DOMMatrix !== 'undefined') pat.setTransform(new DOMMatrix().rotateSelf(-r));
  return pat;
}

/** 아메리카 단원 조각의 모든 등록(뒤 하위 기능이 여기에 더함). 여러 번 불러도 같음(지구본 회전 상태는 처음 등록 것을 이어 감). */
export function installAmericasExtras() {
  installAmericasFamilies();
  if (!PROJECTIONS.globe) registerProjection('globe', globeProjection());
  registerLayerType('pathFlow', (id, d, ctx) => pathFlowLayer(id, d, ctx));
  registerLayerType('unitSymbols', (id, d, ctx) => unitSymbolsLayer(id, d, ctx));
  hatchHook.make = hatchTile;
}
