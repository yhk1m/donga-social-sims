// © 2026 김용현
// src/atlas/polarExtra.js — 오세아니아·극지방(U6-3)에서 처음 쓰는 엔진 기능. installPolarExtras() 를 부른 단원 조각에만 들어간다
//   (americasExtra.js·chartsExtra.js 와 같은 등록 길 — 부르지 않는 u2~u5 조각은 코드도 크기도 그대로).
//   - 3b 극 중심 보기(registerProjection('polarN'|'polarS') — 지도 도구 「도법」 고르기 상자에 「북극 중심」·「남극 중심」 옵션이 생김.
//     상자는 mapTools 때 PROJECTIONS 로 한 번 만들므로 mountAtlas 전에, 지구본(installAmericasExtras) 뒤에 등록 → 옵션 8: 평면 5 + 지구본 + 극 둘)
//     = geoAzimuthalEquidistant().clipAngle(90) 을 극으로 돌린 것. 상태 up = 화면 위로 가는 경선(°, 교과서 방향 — 50·51쪽 −90 = 서경 90°,
//     55쪽 영유권 180). 반구 원판 반지름 = 무대 짧은 변 × POLAR.fill, 무대 가운데. 렌더러 등록 자리(U5-3c — 공유 코드 0 B): hidden(반대 반구 —
//     지명·기호가 원판 밖에 비치지 않게), invert 는 반구 밖이면 null(음영·고도 색·자연색 역투영 격자가 원판 밖을 건너뜀 — 정거 방위 역투영은 180° 까지
//     값을 내므로), step(k)(처음 경위선 10°). pan 은 두지 않음 — 끌기 = 옮기기, 회전 고정(교사 Q6).
//     주제가 극 중심으로 여는 길: polarView(map, {projection:'polarN', up}) — 3c 보기 레이어(topicView)가 부른다. 되돌리기 = 앞 도법·가운데·확대 + 앞 up
//     (그사이 사용자가 도법을 바꿨으면 도법은 그대로).
//   - 3b 보기 도구 viewTools(map, toolsEl) — u6 main 이 americasExtra.globeTools 대신 부름(지구본과 극 중심이 함께 있어서, americasExtra 는 고치지 않음):
//     특별 보기(지구본·극 둘) ↔ 평면·특별 ↔ 특별 전환 때 바탕 캔버스 페이드 · 특별 보기면 「중심 경도」 단추 숨김 · 「세계 전체 보기」·0 키 = 지구본은
//     처음 회전, 극은 그 반구 전체 · 사용자가 도법 상자로 고를 때만: 평면 → 지구본 = 앞 평면 화면 가운데를 원판 가운데로, → 극 = 반구 전체,
//     특별 → 평면 = 마지막 평면 보기(가운데·확대) 그대로(지구본 ↔ 극 직접 전환에도 잃지 않음). 코드가 바꾼 것(globeView·polarView·되돌리기)에는
//     페이드·단추만(되돌리기가 두 번 일어나지 않게).
//   - 3c 주제 보기 레이어(registerLayerType('topicView')): 그리는 레이어가 없는 주제(색칠하기·지형·일반도 처음 보기 — 태평양 중심 Q2)나
//     그리는 레이어가 공유 종류(면·기호 — properties.view 를 안 읽음)인 극·지구본 묶음이 보기를 정하는 길(topic.js 를 고치지 않으려고 — 주제 layers 에 넣음).
//     자료 = {type:'FeatureCollection', properties:{layerType:'topicView', view:{centerLon?, projection?:'polarN'|'polarS'|'globe', up?(극), rotate?(지구본),
//     base?:'none'|'tint'|'natural'}, legend:[]}, features:[]}. 그리지 않음(draw 없음 · 맞히기 null · 지명 장애물 [] · 범례 항목 0 → 범례 블록 없음,
//     묶음 하나라 「지도 고르기」 없음). 만들 때 보기를 바꾸고 destroy 때 되돌림(각각 그사이 사용자가 바꿨으면 그대로 — centerLonOf 꼴).
//   - 3f 영유권 경계선(registerLayerType('sectorLines') — 55쪽 남극, 교사 Q8 기본값): 나라마다 색·점선 무늬가 다른 경계선만(면 없음).
//     자료 = {type:'FeatureCollection', properties:{layerType:'sectorLines', legend:[{cls, label(나라), color, kind:'line', dashed?(견본), dash?:[칠, 빔](선 굵기 배수),
//     width?(pt, 기본 1.2)}]}, features:[{properties:{cls, offsetPx?, name?}, geometry: LineString|MultiLineString(경계 경선 + 바깥 호 — 노르웨이는 바깥만)}]}.
//     SVG 선(경위도 변을 1° 마다 대원으로 나눠 화면에 옮긴 줄) + 화면 비킴 offsetPx(진행 방향 오른쪽 + — 같은 경선을 쓰는 영국·칠레·아르헨티나를 교과서처럼
//     나란히), 범례 고름 = 그 나라 선만 굵게(나머지 흐리게), 맞히기 = 선과의 화면 거리 → 「○○ 영유권 주장 경계」(자료 label·name 이 있으면 그것), 장애물 [].
//   - 3g 그래프(registerSvgChart — 54쪽, chartCore.chartPlan 이 svg 길로 보냄): csat-chart.js 2.2.2 에 두 y축 선·반원이 없어 시험지 양식 SVG
//     (chartsExtra 의 pie·bubbleRow 꼴 — 검은 틀·점선 격자·명조, h()/s()).
//     dualLine = {x:[해…], left:{label, unit, range:[lo, hi], step, values, color, note?, labelAt?}, right:{같은 꼴}, xTicks, source}
//       왼쪽 축 = left, 오른쪽 축 = right(눈금 수가 같으면 같은 높이), 선 이름 = 선 곁 글자 상자 + 짧은 지시선(labelAt {x: 해, dy: px} — 없으면 어림 자리).
//     halfPie = {items:[{label:'1965년', total:'27(억 달러)', rRel(가장 큰 반원 대비 반지름 — 교과서 잰 값, 교사 Q13 기본값), slices:[{name, value(%), color}]}]}
//       위쪽 반원(9시 → 3시 시계 방향)을 가운데 아래 끝을 맞춰 나란히, 조각 글자는 넓으면 안, 좁으면 바깥 + 지시선.
//   단원 main.js: installAmericasExtras(); installPolarExtras();  (mountAtlas 전에) — mountAtlas 뒤 viewTools(root.atlasMap, root.atlasUi.tools.el)(풀기 함수)
import { geoAzimuthalEquidistant, geoDistance, geoInterpolate } from 'd3-geo';
import { s } from '../shared/dom.js';
import { PROJECTIONS } from './projections.js';
import { graticuleStep } from './lineStyle.js';
import { registerLayerType } from './layerRef.js';
import { metaOf, featuresOf, isLine, setAttr, connect, hoverClass, round1, LAYER_Z } from './layerCommon.js';
import { alphaOf, lineWidthPx, unwrapLine, splitJumps, distToPolyline } from './layerStyle.js';
import { INK, txt, registerSvgChart } from './charts.js';
import { linearScale, sectorPath } from './chartCore.js';
import { baseOptions, baseModeOf } from './natural.js';
import { registerProjection, globeCenter, rotateFor, globeView } from './americasExtra.js';

/** 극 중심 규칙: 반구 원판 반지름 = 무대 짧은 변 × fill, 처음(k < 2) 경위선 간격(°), 처음 위쪽 경선(°, 50·51쪽 일반도 = 서경 90°) */
export const POLAR = Object.freeze({ fill: 0.48, step: 10, up: -90 });
const wrapLon = (v) => ((((v + 180) % 360) + 360) % 360) - 180;
const poleOf = (def) => [0, def.pole === 'N' ? 90 : -90];

/** 위쪽 경선 up(°) → d3 rotate [λ, ∓90]. 북극: λ = −up − 180(위에서 내려다봄 — 동쪽이 반시계), 남극: λ = −up(동쪽이 시계 방향). */
export function polarRotate(pole, up) {
  return pole === 'N' ? [wrapLon(-up - 180), -90] : [wrapLon(-up), 90];
}

/** 극 중심 도법 정의(PROJECTIONS 항목 꼴 + 렌더러 등록 자리 setup). pole 'N'|'S', up = 지금 위쪽 경선. */
export function polarProjection({ pole = 'N', label = pole === 'N' ? '북극 중심' : '남극 중심', up = POLAR.up } = {}) {
  const sgn = pole === 'N' ? 1 : -1;
  const def = {
    label, pole, up,
    make() {
      const p = geoAzimuthalEquidistant().clipAngle(90);
      p.hidden = (ll) => sgn * ll[1] < -1e-9; // 반대 반구(적도는 원판 가장자리라 보임)
      const inv = p.invert;
      p.invert = (xy) => { const ll = inv(xy); return ll && Number.isFinite(ll[0]) && Number.isFinite(ll[1]) && !p.hidden(ll) ? ll : null; };
      p.step = (k) => (k < 2 ? POLAR.step : graticuleStep(k));
      return p;
    },
    setup(p, w, h) {
      p.rotate(polarRotate(pole, def.up)).scale((POLAR.fill * Math.min(w, h)) / (Math.PI / 2)).translate([w / 2, h / 2]);
    },
  };
  return def;
}

/** 극 중심 처음 보기: 극점 = 무대 가운데, 확대 1(반구 원판 전체). */
export const polarHome = (map, def, ms = 0) => map.flyTo({ center: poleOf(def), zoom: 1 }, ms);
const globeHome = (map, ms = 0) => map.flyTo({ center: globeCenter(PROJECTIONS.globe.rot), zoom: 1 }, ms);

/**
 * 극 중심으로 열기(view = {projection:'polarN'|'polarS', up?}) → 되돌리는 함수. 보간 없이 바꾸고 반구 전체(묶음 범위 맞추기는 주제가 뒤이어).
 * 되돌리기 = 앞 up + 앞 도법·화면 가운데·확대(그사이 사용자가 다른 도법으로 바꿨으면 도법은 그대로). 이미 그 극 중심이었으면 up 만 바꾸고 되돌림.
 */
export function polarView(map, { projection, up = null } = {}) {
  const def = PROJECTIONS[projection];
  if (!def?.pole || !map?.view) return () => {};
  const v = map.view, prev = { key: v.key, center: v.center, k: v.k }, prevUp = def.up;
  if (up != null) def.up = up;
  const myUp = def.up;
  if (v.key === projection) map.rebase(); else map.setProjection(projection, { animate: false });
  polarHome(map, def);
  let done = false;
  return () => {
    if (done || map.destroyed) return;
    done = true;
    // 묶음을 바꿀 때 topic.js 는 앞 레이어 destroy → 새 레이어 만들기 차례라 보통은 늘 내 값이지만, 차례가 바뀌어 다른 polarView 가 이미 up 을
    // 바꿨으면 그 값을 지우지 않는다(내가 둔 값일 때만 되돌림)
    if (def.up === myUp) def.up = prevUp;
    if (map.view?.key !== projection) return;
    if (prev.key === projection) { map.rebase(); return; }
    map.setProjection(prev.key, { animate: false });
    if (prev.center) map.flyTo({ center: prev.center, zoom: prev.k }, 0);
  };
}

/** 특별 보기(평면이 아닌 것): 지구본·극 중심. */
export const specialView = (key) => key === 'globe' || !!PROJECTIONS[key]?.pole;

/** 지도 도구에 지구본·극 중심 몫을 잇는다(단원 main 이 mountAtlas 뒤에 — globeTools 대신): toolsEl = mapTools(…).el(무대 안). → 풀기 함수. */
// TODO(americasExtra 를 고쳐도 될 때 — u5 관문을 함께 볼 수 있을 때): viewTools 를 globeTools 로 합치기(entering 표지를 내보내거나 특별 보기 일반화).
export function viewTools(map, toolsEl) {
  const stage = toolsEl?.parentNode;
  const canvas = stage?.querySelector?.('.at-base');
  const centerSeg = toolsEl?.querySelector?.('[aria-label="중심 경도"]');
  const sel = toolsEl?.querySelector?.('[aria-label="도법"]');
  let last = map.view?.key, flat = null, picked = false; // flat = 마지막 멈춘 평면 보기 {key, center, k}, picked = 사용자가 도법 상자로 고름
  const later = (fn) => Promise.resolve().then(() => { if (!map.destroyed) fn(); }); // viewchange 안에서 다시 그리지 않게
  const sync = (v) => { if (centerSeg) centerSeg.hidden = specialView(v.key); };
  // 도법 상자의 change(상자 자신의 setProjection 보다 먼저 — 대상 요소의 캡처 리스너): 그 setProjection 이 낸 viewchange 만 「사용자가 고름」
  const onPick = () => { picked = true; Promise.resolve().then(() => { picked = false; }); };
  const off = map.on('viewchange', (v) => {
    const was = last;
    last = v.key;
    sync(v);
    if (!specialView(v.key) && !v.moving && was === v.key) flat = { key: v.key, center: v.center, k: v.k };
    if (was === v.key || (!specialView(was) && !specialView(v.key))) return;
    canvas?.animate?.([{ opacity: 0.35 }, { opacity: 1 }], { duration: 260, easing: 'ease-out' });
    if (!picked) return;
    picked = false;
    const def = PROJECTIONS[v.key];
    if (v.key === 'globe') {
      if (flat?.center) def.rot = rotateFor(flat.center);
      def.home = def.rot.slice();
      later(() => { map.rebase(); globeHome(map); });
    } else if (def?.pole) later(() => polarHome(map, def));
    else if (flat?.center) { const f = flat; later(() => map.flyTo({ center: f.center, zoom: f.k }, 0)); }
  });
  const home = (e) => {
    const key = map.view?.key, def = PROJECTIONS[key];
    if (!specialView(key)) return;
    e.stopImmediatePropagation(); e.preventDefault();
    if (def.pole) { polarHome(map, def, 500); return; }
    if (def.home) def.rot = def.home.slice();
    map.rebase();
    globeHome(map, 500);
  };
  const onClick = (e) => { if (e.target?.closest?.('[aria-label="세계 전체 보기"]')) home(e); };
  const onKey = (e) => { if (e.key === '0' && e.target === stage && !e.altKey && !e.ctrlKey && !e.metaKey) home(e); };
  sel?.addEventListener('change', onPick, true);
  toolsEl?.addEventListener('click', onClick, true);
  stage?.addEventListener('keydown', onKey, true);
  if (map.view) sync(map.view);
  return () => { off(); sel?.removeEventListener('change', onPick, true); toolsEl?.removeEventListener('click', onClick, true); stage?.removeEventListener('keydown', onKey, true); };
}

/**
 * 주제 보기 레이어(type 'topicView' — 그리지 않음). 만들 때(map 이 있을 때만) 차례대로: 바탕 색 base → 중심 경도 centerLon → 극 중심(polarView)·지구본
 * (globeView + 묶음 맞추기 뒤 처음 보기 한 번 더 — pathFlow 와 같은 꼴). destroy = 거꾸로 되돌림(바탕·중심 경도는 지금 값이 이 레이어가 둔 값일 때만).
 */
export function topicViewLayer(id, data, { map = null } = {}) {
  const view = data?.properties?.view || {};
  const undo = [];
  let alive = true;
  if (map?.view) {
    if (view.base) {
      const from = baseModeOf(map.options);
      if (from !== view.base) { map.setOptions(baseOptions(view.base)); undo.push(() => { if (baseModeOf(map.options) === view.base) map.setOptions(baseOptions(from)); }); }
    }
    if (view.centerLon != null && map.view.centerLon !== view.centerLon) {
      const from = map.view.centerLon;
      map.setCenterLon(view.centerLon);
      undo.push(() => { if (map.view?.centerLon === view.centerLon) map.setCenterLon(from); });
    }
    if (PROJECTIONS[view.projection]?.pole) undo.push(polarView(map, view));
    else if (view.projection === 'globe' && PROJECTIONS.globe) {
      undo.push(globeView(map, view));
      Promise.resolve().then(() => { if (alive && !map.destroyed && map.view?.key === 'globe') globeHome(map); });
    }
  }
  return {
    id, z: 0, meta: metaOf(data), features: [],
    labelObstacles: () => [],
    hit: () => null,
    destroy() { if (!alive) return; alive = false; if (!map?.destroyed) for (let i = undo.length - 1; i >= 0; i--) undo[i](); undo.length = 0; },
  };
}

// ---------- 3f 영유권 경계선 ----------
const DEG1 = Math.PI / 180;
/** 경위도 줄의 변을 1° 마다 대원 점으로 나눔(경선은 대원이라 그대로 곧고, 바깥 호는 자료가 촘촘 — 성긴 자료도 화면에서 휘지 않게) */
function densify(line) {
  const out = [line[0]];
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1], b = line[i], n = Math.ceil(geoDistance(a, b) / DEG1);
    if (n > 1) { const f = geoInterpolate(a, b); for (let j = 1; j < n; j++) out.push(f(j / n)); }
    out.push(b);
  }
  return out;
}
/** 화면 줄을 d px 비킴(진행 방향 오른쪽 + — 화면 y 아래 기준 법선 (−dy, dx)), 꺾인 곳은 마이터(최대 2배). 같은 점이 이어지면 하나로. */
export function offsetRun(run, d) {
  const r = run.filter((q, i) => !i || q[0] !== run[i - 1][0] || q[1] !== run[i - 1][1]);
  if (!d || r.length < 2) return r;
  const nrm = (a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy); return [-dy / L, dx / L]; };
  return r.map((q, i) => {
    const n0 = i > 0 ? nrm(r[i - 1], q) : null, n1 = i < r.length - 1 ? nrm(q, r[i + 1]) : null;
    let m = n0 && n1 ? [n0[0] + n1[0], n0[1] + n1[1]] : n0 || n1;
    const L = Math.hypot(m[0], m[1]);
    m = L < 1e-9 ? n1 : [m[0] / L, m[1] / L];
    const c = n0 && n1 ? Math.max(0.5, m[0] * n1[0] + m[1] * n1[1]) : 1;
    return [q[0] + (m[0] * d) / c, q[1] + (m[1] * d) / c];
  });
}
const pathD = (runs) => runs.map((r) => `M${r.map((q) => `${round1(q[0])},${round1(q[1])}`).join('L')}`).join('') || null;

/** 영유권 경계선 레이어(SVG, type 'sectorLines'). 나라(선) 하나 = <g class="at-sector"> 안 <title> + <path class="at-sector-line">. */
export function sectorLinesLayer(id, data, { legend = null, map = null, layerId = id, dimAlpha = 0.2, z = LAYER_Z.symbol - 5 } = {}) {
  const leg = new Map((data?.properties?.legend || []).map((e) => [e.cls, e]));
  const items = featuresOf(data).filter(isLine).map((f) => {
    const p = f.properties || {}, e = leg.get(p.cls) || {};
    const ff = p.label ? f : { ...f, properties: { ...p, label: p.name || `${e.label ?? p.cls} 영유권 주장 경계` } };
    const lines = (f.geometry.type === 'MultiLineString' ? f.geometry.coordinates : [f.geometry.coordinates]).map(densify);
    return { f: ff, e, lines, off: p.offsetPx || 0, runs: [], w: 0 };
  });
  const byF = new Map(items.map((it) => [it.f, it]));
  let root = null;
  function build(g) {
    root = s('g', { class: 'at-sectors' });
    for (const it of items) {
      it.line = s('path', { class: 'at-sector-line', fill: 'none', stroke: it.e.color || '#231f20', 'data-cls': it.f.properties.cls, 'stroke-linejoin': 'round' });
      it.el = s('g', { class: 'at-sector' }, s('title', {}, it.f.properties.label), it.line);
      it.w = 0;
    }
    root.append(...items.map((it) => it.el));
    g.append(root);
  }
  const onHover = hoverClass((f) => byF.get(f));
  const layer = {
    id, z, meta: metaOf(data), features: items.map((it) => it.f),
    labelObstacles: () => [],
    drawSvg(g, project, view) {
      if (!root || root.parentNode !== g) build(g);
      const sel = legend?.selected?.() != null;
      for (const it of items) {
        const a = alphaOf(legend, it.f.properties.cls, dimAlpha);
        const base = lineWidthPx(it.e.width ?? 1.2, view.k);
        const w = sel && a === 1 ? base * 2 : base;
        if (w !== it.w) {
          it.w = w;
          setAttr(it.line, 'stroke-width', round1(w));
          setAttr(it.line, 'stroke-dasharray', it.e.dash ? it.e.dash.map((v) => round1(v * w)).join(' ') : null);
        }
        it.runs = it.lines.flatMap((L) => splitJumps(unwrapLine(L), project)).map((r) => offsetRun(r, it.off));
        setAttr(it.line, 'd', pathD(it.runs));
        setAttr(it.el, 'opacity', a === 1 ? null : a);
        it.el.classList.toggle('is-hover', it.f === onHover.current());
      }
    },
    hit(xy) {
      for (let i = items.length - 1; i >= 0; i--) {
        const it = items[i];
        if (!it.runs.length || alphaOf(legend, it.f.properties.cls, 0) === 0) continue;
        if (it.runs.some((r) => distToPolyline(xy, r) <= Math.max(4, it.w / 2 + 3))) return it.f;
      }
      return null;
    },
    destroy() { offs.forEach((off) => off()); offs.length = 0; root?.remove(); root = null; },
  };
  const offs = connect({ map, legend, layerId, onHover });
  return layer;
}

// ---------- 3g 그래프 ----------
const f2 = (v) => v.toFixed(2);
const num = (v) => String(Number(v.toFixed(6)));
/** 축 눈금 값 목록: lo 부터 step 마다 hi 까지 */
const ticksOf = ({ range: [lo, hi], step }) => Array.from({ length: Math.round((hi - lo) / step) + 1 }, (_, i) => lo + i * step);

/** 두 축 선 그래프(54쪽 기온 편차·이산화 탄소 농도) — 왼쪽 축 = left, 오른쪽 축 = right. */
function dualLineSvg(spec, label) {
  const W = 520, x0 = 50, x1 = W - 58, top = 36, bottom = top + 220, Hh = bottom + (spec.left.note ? 46 : 30);
  const xs = spec.x, X = linearScale([xs[0], xs[xs.length - 1]], [x0, x1]);
  const side = (k) => {
    const d = spec[k], Y = linearScale(d.range, [bottom, top]);
    const ticks = ticksOf(d).map((v) => txt(k === 'left' ? x0 - 5 : x1 + 5, f2(Y(v) + 4), num(v), { 'text-anchor': k === 'left' ? 'end' : 'start', class: `at-ct at-ct-tick at-ct-${k[0]}tick` }));
    let path = '', pen = false;
    xs.forEach((x, i) => { const v = d.values[i]; if (!Number.isFinite(v)) { pen = false; return; } path += `${pen ? 'L' : 'M'}${f2(X(x))},${f2(Y(v))}`; pen = true; });
    const line = s('path', { class: `at-ct-dual-${k}`, d: path, fill: 'none', stroke: d.color, 'stroke-width': k === 'left' ? 1.2 : 2, 'stroke-linejoin': 'round' });
    // 선 이름 상자 + 지시선(교과서처럼 선 곁) — labelAt {x: 해, dy} 없으면 왼쪽 선은 30%, 오른쪽 선은 60% 자리 위
    const at = d.labelAt || {}, i = Math.max(0, Math.min(xs.length - 1, at.x != null ? xs.indexOf(at.x) : Math.round(xs.length * (k === 'left' ? 0.3 : 0.6))));
    const px = X(xs[i]), py = Y(d.values[i] ?? d.range[0]), dy = at.dy ?? -34, bw = [...d.label].length * 12 + 12, by = py + dy;
    const name = s('g', {},
      s('path', { class: 'at-ct-leader', d: `M${f2(px)},${f2(by + (dy < 0 ? 9 : -9))}L${f2(px)},${f2(py)}` }),
      s('rect', { x: f2(px - bw / 2), y: f2(by - 9), width: bw, height: 18, fill: '#fff', stroke: d.color, 'stroke-width': 0.8 }),
      txt(f2(px), f2(by + 4.5), d.label, { 'text-anchor': 'middle', class: 'at-ct at-ct-dual-name', style: { fill: d.color } }));
    return { ticks, line, name, Y, unit: txt(k === 'left' ? x0 : x1, top - 14, `(${d.unit})`, { 'text-anchor': 'middle', class: 'at-ct at-ct-tick' }) };
  };
  const L = side('left'), R = side('right');
  const grid = ticksOf(spec.left).slice(1, -1).map((v) => s('line', { class: 'at-ct-grid', x1: x0, x2: x1, y1: f2(L.Y(v)), y2: f2(L.Y(v)) }));
  const xt = (spec.xTicks || []).map((x) => s('g', {},
    s('line', { class: 'at-ct-axis', x1: f2(X(x)), x2: f2(X(x)), y1: bottom, y2: bottom + 4 }),
    txt(f2(X(x)), bottom + 17, String(x), { 'text-anchor': 'middle', class: 'at-ct at-ct-tick at-ct-xtick' })));
  const frame = s('path', { class: 'at-ct-axis', d: `M${x0},${top}V${bottom}H${x1}V${top}`, 'data-box': `${x0},${top},${x1},${bottom}` });
  return s('svg', { class: 'at-chart-svg', viewBox: `0 0 ${W} ${Hh}`, role: 'img', 'aria-label': label },
    grid, s('g', {}, s('title', {}, `${spec.left.label}(${spec.left.unit})`), L.line), s('g', {}, s('title', {}, `${spec.right.label}(${spec.right.unit})`), R.line),
    frame, L.ticks, R.ticks, xt, L.unit, R.unit, L.name, R.name,
    spec.left.note ? txt(x0, Hh - 6, spec.left.note, { class: 'at-ct at-ct-sub' }) : null);
}

/** 반원 조각: 9시(−90°)에서 3시(90°)까지 시계 방향, 각 = 값 / 합 × 180 → [{name, value, color, a0, a1}](도, 12시 0) */
export function halfPieSlices(item) {
  const vals = item.slices.map((q) => Math.max(0, q.value || 0)), sum = vals.reduce((a, v) => a + v, 0) || 1;
  let a = -90;
  return item.slices.map((q, i) => { const a0 = a; a += (vals[i] / sum) * 180; return { name: q.name, value: q.value, color: q.color || '#ccc', a0, a1: a }; });
}

/** 반원 그래프(54쪽 무역 상대국 1965·2022) — 반지름 = 가장 큰 반원 × rRel(교과서 잰 비), 아래 끝(가운데)을 한 줄에. */
function halfPieSvg(spec, label) {
  const W = 520, R = 118, cy = 40 + R, Hh = cy + 46, n = spec.items.length;
  const groups = spec.items.map((it, k) => {
    const cx = (W * (k + 0.5)) / n, r = R * (it.rRel ?? 1);
    const sl = halfPieSlices(it).map((q) => {
      const mid = (((q.a0 + q.a1) / 2) * Math.PI) / 180;
      return { ...q, sin: Math.sin(mid), cos: Math.cos(mid), inside: q.a1 - q.a0 >= 20 && r >= 80 };
    });
    // 바깥 글자: 왼쪽(sin < 0)·오른쪽 묶음마다 위에서부터 줄 간격 13 이상으로 내려 겹치지 않게, x 는 그 높이의 반원 바깥 + 4, 꺾인 지시선
    const R1 = r + 11;
    for (const left of [true, false]) {
      let prev = -Infinity;
      for (const q of sl.filter((x) => !x.inside && x.sin < 0 === left).sort((a, b) => b.cos - a.cos)) {
        q.ly = Math.max(cy - R1 * q.cos, prev + 13);
        prev = q.ly;
        q.lx = cx + (left ? -1 : 1) * (Math.sqrt(Math.max(0, R1 * R1 - (cy - q.ly) ** 2)) + 4);
      }
    }
    const cells = sl.map((q) => {
      const lab = q.inside
        ? [txt(f2(cx + r * 0.62 * q.sin), f2(cy - r * 0.62 * q.cos - 2), q.name, { 'text-anchor': 'middle', class: 'at-ct at-ct-cell-name' }),
          txt(f2(cx + r * 0.62 * q.sin), f2(cy - r * 0.62 * q.cos + 11), String(q.value), { 'text-anchor': 'middle', class: 'at-ct at-ct-cell-val' })]
        : [s('path', { class: 'at-ct-leader', d: `M${f2(cx + r * 0.85 * q.sin)},${f2(cy - r * 0.85 * q.cos)}L${f2(cx + (r + 5) * q.sin)},${f2(cy - (r + 5) * q.cos)}L${f2(q.lx - (q.sin < 0 ? -2 : 2))},${f2(q.ly - 4)}` }),
          txt(f2(q.lx), f2(q.ly), `${q.name} ${q.value}`, { 'text-anchor': q.sin < 0 ? 'end' : 'start', class: 'at-ct at-ct-out-text' })];
      return s('g', { class: 'at-ct-cell' }, s('title', {}, `${it.label} ${q.name} ${q.value}%`),
        s('path', { d: sectorPath(cx, cy, 0, r, q.a0, q.a1), fill: q.color, stroke: INK, 'stroke-width': 0.8 }), lab);
    });
    return s('g', { class: 'at-ct-half', 'data-r': r, 'data-cy': cy }, cells,
      txt(cx, cy + 18, it.label, { 'text-anchor': 'middle', class: 'at-ct at-ct-cat' }),
      it.total ? txt(cx, cy + 34, it.total, { 'text-anchor': 'middle', class: 'at-ct at-ct-sub' }) : null);
  });
  return s('svg', { class: 'at-chart-svg', viewBox: `0 0 ${W} ${Hh}`, role: 'img', 'aria-label': label }, groups,
    txt(W - 8, 16, '(%)', { 'text-anchor': 'end', class: 'at-ct at-ct-tick' }));
}

/** 등록(단원 main 이 mountAtlas 전에, installAmericasExtras 뒤에 — 상자 옵션 차례 지구본 → 북극 중심 → 남극 중심). 두 번 불러도 같음. */
export function installPolarExtras() {
  // 옵션 차례(지구본 → 극 둘)와 viewTools 의 지구본 몫이 지구본 등록을 전제로 함 — 늦게 등록하면 상자 차례가 틀어지므로 멈춤
  if (!PROJECTIONS.globe) throw new Error('installPolarExtras: installAmericasExtras() 를 먼저');
  if (!PROJECTIONS.polarN) registerProjection('polarN', polarProjection({ pole: 'N' }));
  if (!PROJECTIONS.polarS) registerProjection('polarS', polarProjection({ pole: 'S' }));
  registerLayerType('topicView', topicViewLayer);
  registerLayerType('sectorLines', (id, d, ctx) => sectorLinesLayer(id, d, ctx));
  registerSvgChart('dualLine', dualLineSvg);
  registerSvgChart('halfPie', halfPieSvg);
}
