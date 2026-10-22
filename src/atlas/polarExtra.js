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
//   - 3i 기호 + 글자(symbolLabels) 다시 등록: 아메리카 symbolLabelsLayer 의 글자 몫(areaLayer 지명 글자 — 캔버스)은 view.projection 을 그대로 써서
//     지구본 뒷면·극 중심 반대 반구 글자까지 그림(기호 몫은 렌더러 project 가 hidden 이면 null 이라 숨음) → 그 레이어의 draw 에 hidden 을 지키는 투영
//     (hidden 이면 null)을 넘기는 감싸개로 다시 등록(americasExtra·layers.js 고침 없음 — 글자 몫은 지명 Point 뿐이라 draw 가 투영을 점에만 씀).
//   - U6-9 경로 화살표 다시 등록(pathFlow): 자료 view.base 가 있으면 묶음 바탕을 그것으로(55쪽 지구본 셋 = 자연색, 교사 Q16) — 아메리카 것을 감쌈.
//   단원 main.js: installAmericasExtras(); installPolarExtras();  (mountAtlas 전에) — mountAtlas 뒤 viewTools(root.atlasMap, root.atlasUi.tools.el)(풀기 함수)
import { geoAzimuthalEquidistant, geoDistance, geoInterpolate } from 'd3-geo';
import { s } from '../shared/dom.js';
import { PROJECTIONS } from './projections.js';
import { graticuleStep } from './lineStyle.js';
import { registerLayerType } from './layerRef.js';
import { metaOf, featuresOf, isLine, setAttr, connect, hoverClass, round1, LAYER_Z } from './layerCommon.js';
import { alphaOf, lineWidthPx, unwrapLine, splitJumps, distToPolyline, symbolPx } from './layerStyle.js';
import { INK, txt, registerSvgChart } from './charts.js';
import { labelPx } from './layers.js';
import { linearScale, sectorPath } from './chartCore.js';
import { baseOptions, baseModeOf } from './natural.js';
import { registerProjection, globeCenter, rotateFor, globeView, symbolLabelsLayer, pathFlowLayer } from './americasExtra.js';

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

/** 극 중심 → 평면(사용자가 도법 상자로 고를 때, U6-9 리뷰): 마지막 평면 보기 가운데가 그 반구 띠 안이면 그 보기, 아니면(없거나 다른 반구 —
 *  다른 주제의 보기) 그 반구 위도 띠로 맞춤 — 극 묶음으로 바로 연 뒤 밀러를 고르면 극 보기의 변환이 남아 첫 화면의 약 30% 가 빈 회색
 *  (북위 35° 띠 k 1.93)이었음. 지구본 → 평면은 그대로 마지막 평면 보기. */
const POLAR_FLAT_N = [-180, 20, 180, 85], POLAR_FLAT_S = [-180, -85, 180, -20];
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
    else {
      const b = PROJECTIONS[was]?.pole === 'N' ? POLAR_FLAT_N : PROJECTIONS[was]?.pole === 'S' ? POLAR_FLAT_S : null, f = flat;
      if (b && !(f?.center && f.center[1] >= b[1] && f.center[1] <= b[3])) later(() => map.fitBounds(b, { ms: 0 }));
      else if (f?.center) later(() => map.flyTo({ center: f.center, zoom: f.k }, 0));
    }
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

/** 바탕 색 base 를 두고 되돌리기 함수(바꾼 게 없으면 null) — 되돌리기는 지금 바탕이 이 함수가 둔 값일 때만(사용자가 바꿨으면 그대로) */
function setBase(map, base) {
  const from = baseModeOf(map.options);
  if (!base || from === base) return null;
  map.setOptions(baseOptions(base));
  return () => { if (baseModeOf(map.options) === base) map.setOptions(baseOptions(from)); };
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
    const b = setBase(map, view.base);
    if (b) undo.push(b);
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
  const hover = hoverClass((f) => byF.get(f));
  // 강조(hover): 공유 CSS 에 .at-sector 꾸밈이 없으므로 굵기 +1px 을 직접(is-hover 클래스도 그대로 붙임)
  const strokeOf = (it) => round1(it.w + (it.f === hover.current() ? 1 : 0));
  const onHover = (f) => { hover(f); for (const it of items) if (it.line) setAttr(it.line, 'stroke-width', strokeOf(it)); };
  onHover.current = hover.current;
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
          setAttr(it.line, 'stroke-dasharray', it.e.dash ? it.e.dash.map((v) => round1(v * w)).join(' ') : null);
        }
        setAttr(it.line, 'stroke-width', strokeOf(it));
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

/** 반원 그래프(54쪽 무역 상대국 1965·2022) — 반지름 = 가장 큰 반원 × rRel(교과서 잰 비).
 *  orient 가 없으면(옛 꼴) 위쪽 반원을 나란히, 아래 끝(가운데)을 한 줄에 — 배치(폭 520·반지름 118·가운데 = 폭 × (k + 0.5) / n)는 n ≤ 2 에 맞춘 값.
 *  자료에 orient 'down' 이 있으면(U6-7 — 교과서 꼴) 모든 반원을 한 가운데 점에 지름을 맞대 쌓음: 'up' = 9시 → 12시 → 3시(위),
 *  'down' = 9시 → 6시 → 3시(아래, 조각 차례는 둘 다 왼쪽부터), 해·금액 글자는 왼쪽(위 반원은 위쪽 · 아래 반원은 아래쪽 — 교과서 자리). */
function halfPieSvg(spec, label) {
  const W = 520, R = 118, n = spec.items.length;
  const stacked = spec.items.some((it) => it.orient === 'down');
  const rUp = stacked ? Math.max(0, ...spec.items.filter((it) => it.orient !== 'down').map((it) => R * (it.rRel ?? 1))) : R;
  const cy = 40 + rUp, Hh = stacked ? cy + Math.max(0, ...spec.items.filter((it) => it.orient === 'down').map((it) => R * (it.rRel ?? 1))) + 46 : cy + 46;
  const groups = spec.items.map((it, k) => {
    const down = it.orient === 'down';
    const cx = stacked ? W / 2 : (W * (k + 0.5)) / n, r = R * (it.rRel ?? 1);
    // 아래 반원: 위 반원 각(9시 −90 → 3시 90)을 가로축에 거울 — a' = 180 − a(9시 270 → 6시 180 → 3시 90), 시작·끝 바꿈
    const sl = halfPieSlices(it).map((q) => {
      const a0 = down ? 180 - q.a1 : q.a0, a1 = down ? 180 - q.a0 : q.a1;
      const mid = (((a0 + a1) / 2) * Math.PI) / 180;
      return { ...q, a0, a1, sin: Math.sin(mid), cos: Math.cos(mid), inside: a1 - a0 >= 20 && r >= 80 };
    });
    // 바깥 글자: 왼쪽(sin < 0)·오른쪽 묶음마다 반원 바깥쪽(위 반원은 위에서, 아래 반원은 아래에서)부터 줄 간격 13 이상으로 가운데 쪽으로,
    // x 는 그 높이의 반원 바깥 + 4, 꺾인 지시선
    const R1 = r + 11, dir = down ? -1 : 1;
    for (const left of [true, false]) {
      let prev = -Infinity;
      for (const q of sl.filter((x) => !x.inside && x.sin < 0 === left).sort((a, b) => dir * (b.cos - a.cos))) {
        const y = cy - R1 * q.cos;
        q.ly = down ? Math.min(y, -prev - 13) : Math.max(y, prev + 13);
        prev = down ? -q.ly : q.ly;
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
    // 해·금액 글자: 옛 꼴 = 반원 아래 가운데, 쌓은 꼴 = 왼쪽 끝(위 반원은 지름 위 · 아래 반원은 반원 아래쪽)
    const ly = stacked ? (down ? cy + r - 18 : cy - Math.max(r, 36)) : cy + 18;
    const lx = stacked ? 12 : cx, anchor = stacked ? 'start' : 'middle';
    return s('g', { class: 'at-ct-half', 'data-r': r, 'data-cy': cy, 'data-orient': down ? 'down' : 'up' }, cells,
      txt(lx, ly, it.label, { 'text-anchor': anchor, class: 'at-ct at-ct-cat' }),
      it.total ? txt(lx, ly + 16, it.total, { 'text-anchor': anchor, class: 'at-ct at-ct-sub' }) : null);
  });
  return s('svg', { class: 'at-chart-svg', viewBox: `0 0 ${W} ${f2(Hh)}`, role: 'img', 'aria-label': label }, groups,
    txt(W - 8, 16, '(%)', { 'text-anchor': 'end', class: 'at-ct at-ct-tick' }));
}

// ---------- 3i 기호 + 글자: 뒷면 글자 숨김 ----------
/** view 의 투영에 hidden 이 있으면(지구본·극 중심) hidden 인 점은 null 을 내는 투영으로 바꾼 view(없으면 그대로) */
export function hiddenAwareView(view) {
  const p = view?.projection;
  if (!p?.hidden) return view;
  const q = (ll) => (p.hidden(ll) ? null : p(ll));
  q.hidden = p.hidden;
  return { ...view, projection: q };
}
/** 지면 글자 무리(U6-9): 「(」로 시작하는 글자(「(대한민국)」)는 가장 가까운 이름 글자(GAP° 안)와 한 무리 — 무리째 보이거나 숨음 */
const GAP = 5;
export function labelGroups(labels) {
  const lead = labels.filter((f) => !/^\(/.test(f.properties.text || '')), groups = lead.map((f) => [f]);
  for (const f of labels) {
    if (lead.includes(f)) continue;
    let bi = -1, bd = GAP * DEG1;
    lead.forEach((g, i) => { const dd = geoDistance(g.geometry.coordinates, f.geometry.coordinates); if (dd < bd) { bd = dd; bi = i; } });
    if (bi >= 0) groups[bi].push(f); else groups.push([f]);
  }
  // 차례: 붉은 글자(우리나라 기지)가 든 무리 먼저, 그다음 자료 차례
  const red = (g) => g.some((f) => /^#d7/i.test(f.properties.color || ''));
  return [...groups.filter(red), ...groups.filter((g) => !red(g))];
}
/** 화면에서 앞 무리 글자 상자·기호 점과 겹치는 무리를 고름 → {drop(숨길 좌표 배열 Set), moved(좌표 배열 → 화면 자리)} — 같은 자리 겹쳐 그린 사본도
 *  여기서 빠짐. 무리 안 「(…)」 글자는 화면 글자가 교과서보다 커서 이름 글자와 겹치므로 이름 글자 상자에 붙임(교과서 배치 방향 — 아래면 아래, 옆이면 옆,
 *  흰 테두리 몫 LGAP 띄움). 기호 점(dots [{ll, r}] — 자기 기지 점 포함)에 닿으면 무리째 점을 비켜 가장 짧게 옮김(최대 LMOVE px), 못 비키면 숨김.
 *  글자 크기·굵기는 layers.js 지명 글자와 같음. */
const LGAP = 3, LMOVE = 24;
export function culledLabels(groups, proj, measure, dots = []) {
  const kept = [], drop = new Set(), moved = new Map(), leaders = [];
  const over = (b, o) => b[0] < o[2] && b[2] > o[0] && b[1] < o[3] && b[3] > o[1];
  const pad = (b, d) => [b[0] - d, b[1] - d, b[2] + d, b[3] + d];
  const blocks = [];
  for (const { ll, r } of dots) { const q = proj(ll); if (q && Number.isFinite(q[0])) blocks.push([q[0] - r - LGAP, q[1] - r - LGAP, q[0] + r + LGAP, q[1] + r + LGAP]); }
  const free = (bs) => bs.every((b) => !kept.some((o) => over(b, o)) && !blocks.some((o) => over(b, o)));
  for (const g of groups) {
    const items = [];
    let lead = null;
    for (const f of g) {
      const q = proj(f.geometry.coordinates);
      if (!q || !Number.isFinite(q[0])) continue;
      const p = f.properties, px = labelPx(p), lines = p.lines?.length ? p.lines : [p.text], lh = px * 1.15;
      const w = Math.max(...lines.map((t) => measure(t, `${p.role === 'region' ? 600 : 800} ${px}px "Pretendard", "Malgun Gothic", sans-serif`))), hh = lines.length * lh;
      let [x, y] = q, mv = false;
      if (lead && f !== g[0]) {
        if (Math.abs(y - lead.y) > Math.abs(x - lead.x)) y = lead.b[3] + LGAP + hh / 2; else x = lead.b[2] + LGAP + 3 + w / 2;
        mv = true;
      }
      const b = [x - w / 2, y - hh / 2, x + w / 2, y + hh / 2];
      if (f === g[0]) lead = { x, y, b };
      items.push({ f, x, y, b, mv });
    }
    if (!items.length) continue;
    const boxes = items.map((it) => pad(it.b, LGAP / 2));
    // 옮김 후보: 그대로 → 닿은 점마다 위·아래·왼쪽·오른쪽으로 비키는 가장 짧은 거리(짧은 것부터)
    const shifts = [[0, 0]];
    const u = [Math.min(...boxes.map((b) => b[0])), Math.min(...boxes.map((b) => b[1])), Math.max(...boxes.map((b) => b[2])), Math.max(...boxes.map((b) => b[3]))];
    for (const o of blocks) if (over(u, o)) shifts.push([0, o[1] - u[3]], [0, o[3] - u[1]], [o[0] - u[2], 0], [o[2] - u[0], 0]);
    // 두 점 이상에 닿으면 하나 비킨 자리가 다른 점에 닿을 수 있음 — 비킨 자리들을 한 번 더 비킴
    for (const [sx, sy] of shifts.slice(1)) {
      const v = [u[0] + sx, u[1] + sy, u[2] + sx, u[3] + sy];
      for (const o of blocks) if (over(v, o)) shifts.push([sx, sy + o[1] - v[3]], [sx, sy + o[3] - v[1]], [sx + o[0] - v[2], sy], [sx + o[2] - v[0], sy]);
    }
    // 우리나라 기지(붉은 글자 무리)는 숨기지 않게 더 멀리(LMOVE × 2.5)까지 — 자기 큰 점(흰 테두리)을 비키려면 두 줄 높이만큼 옮겨야 함
    const red = g.some((f) => /^#d7/i.test(f.properties.color || ''));
    const lim = red ? LMOVE * 2.5 : LMOVE;
    const cand = shifts.filter(([dx, dy]) => Math.abs(dx) + Math.abs(dy) <= lim).sort((a, b) => Math.abs(a[0]) + Math.abs(a[1]) - Math.abs(b[0]) - Math.abs(b[1]));
    // U6-10: 붉은 무리는 자기 기지 점(무리 둘레 LDOT px 안 가장 큰 점) 곁에 붙여 두는 자리(교과서 쪽 먼저 — 왼·오른쪽이면 가운데 높이,
    // 위·아래면 가운데 줄)를 앞에 — 점을 비키다 멀어져(60px) 글자와 점이 이어져 보이지 않던 것. 그래도 멀면 지시선(leaders).
    const own = red ? ownDot(u, dots, proj) : null;
    if (own) {
      const [ox, oy, orr] = own, cx = (u[0] + u[2]) / 2, cy = (u[1] + u[3]) / 2, d = orr + LGAP + 0.5;
      const sides = [[ox - d - u[2], oy - cy], [ox + d - u[0], oy - cy], [ox - cx, oy - d - u[3]], [ox - cx, oy + d - u[1]]];
      const tb = Math.abs(cx - ox) > Math.abs(cy - oy) ? (cx < ox ? 0 : 1) : (cy < oy ? 2 : 3);
      const near = cand.length && cand[0][0] === 0 && cand[0][1] === 0 && gapTo(u, ox, oy) - orr <= LLEAD ? [[0, 0]] : [];
      cand.unshift(...near, sides[tb], ...sides.filter((_, i) => i !== tb));
    }
    const ok = cand.find(([dx, dy]) => free(boxes.map((b) => [b[0] + dx, b[1] + dy, b[2] + dx, b[3] + dy])));
    if (!ok) { g.forEach((f) => drop.add(f.geometry.coordinates)); continue; }
    const [dx, dy] = ok;
    kept.push(...boxes.map((b) => [b[0] + dx, b[1] + dy, b[2] + dx, b[3] + dy]));
    for (const it of items) if (it.mv || dx || dy) moved.set(it.f.geometry.coordinates, [it.x + dx, it.y + dy]);
    if (own) {
      const v = [u[0] + dx + LGAP / 2, u[1] + dy + LGAP / 2, u[2] + dx - LGAP / 2, u[3] + dy - LGAP / 2], [ox, oy, orr] = own;
      const gap = gapTo(v, ox, oy);
      if (gap - orr > LLEAD) {
        const px = Math.min(Math.max(ox, v[0]), v[2]), py = Math.min(Math.max(oy, v[1]), v[3]);
        leaders.push([px, py, ox + ((px - ox) / gap) * orr, oy + ((py - oy) / gap) * orr]);
      }
    }
  }
  return { drop, moved, leaders };
}
const LDOT = 90, LLEAD = 10;
/** 상자 b 에서 점 (x, y) 까지 화면 거리(안이면 0) */
const gapTo = (b, x, y) => Math.hypot(Math.max(b[0] - x, 0, x - b[2]), Math.max(b[1] - y, 0, y - b[3]));
/** 붉은 글자 무리의 자기 기지 점: 상자 u 둘레 LDOT px 안 점 중 가장 큰 것(같으면 가까운 것) → [x, y, r] 또는 null */
function ownDot(u, dots, proj) {
  let best = null;
  for (const { ll, r } of dots) {
    const q = proj(ll);
    if (!q || !Number.isFinite(q[0])) continue;
    const g = gapTo(u, q[0], q[1]);
    if (g <= LDOT && (!best || r > best[2] + 1e-9 || (Math.abs(r - best[2]) <= 1e-9 && g < best[3]))) best = [q[0], q[1], r, g];
  }
  return best && best.slice(0, 3);
}
/** symbolLabels(아메리카 것) + 글자 몫 뒷면 숨김 + 겹치는 글자 무리 숨김·점 비킴(U6-9 — 51쪽 기지 글자 33 이 처음 보기에서 서로 겹쳤음, 확대하면 다시 보임).
 *  거르기 결과는 화면 투영이 같으면(글자 둘레 점 둘의 화면 자리·k) 다시 쓰고, 글자 폭은 (글자, 글꼴)로 기억. */
export function polarSymbolLabelsLayer(id, d, ctx) {
  const layer = symbolLabelsLayer(id, d, ctx), draw = layer.draw;
  const feats = featuresOf(d).filter((f) => f.geometry?.type === 'Point');
  const labels = feats.filter((f) => f.properties?.type === 'label'), syms = feats.filter((f) => f.properties?.type !== 'label');
  const groups = labelGroups(labels), widths = new Map();
  let memo = null;
  if (draw) layer.draw = (c, path, view) => {
    const v = hiddenAwareView(view), p = v.projection;
    if (!labels.length) return draw(c, path, v);
    const a = p(labels[0].geometry.coordinates), z = p(labels[labels.length - 1].geometry.coordinates);
    const key = `${view.k}|${a}|${z}|${view.width}x${view.height}`;
    if (memo?.key !== key) {
      const measure = (t, font) => { const k2 = `${font}|${t}`; let w = widths.get(k2); if (w == null) { c.font = font; widths.set(k2, (w = c.measureText(t).width)); } return w; };
      const dots = syms.map((f) => ({ ll: f.geometry.coordinates, r: symbolPx(f.properties.size || 3, view.k ?? 1) / 2 }));
      memo = { key, ...culledLabels(groups, p, measure, dots) };
    }
    const { drop, moved, leaders } = memo;
    if (!drop.size && !moved.size && !leaders.length) return draw(c, path, v);
    const q = (ll) => (drop.has(ll) ? null : moved.get(ll) || p(ll));
    q.hidden = p.hidden;
    const r = draw(c, path, { ...v, projection: q });
    // 우리나라 기지 글자가 점에서 멀어졌을 때 가는 지시선(흰 테두리 + 붉은 선 — U6-10)
    if (leaders.length) {
      c.save();
      c.lineCap = 'round';
      for (const [x1, y1, x2, y2] of leaders) {
        c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2);
        c.strokeStyle = 'rgba(255,255,255,0.9)'; c.lineWidth = 3; c.stroke();
        c.strokeStyle = '#d71920'; c.lineWidth = 1; c.stroke();
      }
      c.restore();
    }
    return r;
  };
  layer.hiddenAware = true; // 등록 확인용(시험 — installAmericasExtras 를 뒤에 다시 부르면 아메리카 것으로 덮여 이 표시가 없음)
  return layer;
}

// ---------- U6-9 경로 화살표: 묶음 바탕 ----------
/** pathFlow(아메리카 것) + 자료 view.base(55쪽 지구본 묶음 바탕 자연색 — 교사 Q16): 레이어보다 먼저 바탕을 두고, destroy 때 지구본을 되돌린 뒤
 *  바탕을 되돌림(topicView 와 같은 규칙 — 그사이 사용자가 바탕을 바꿨으면 그대로). base 가 없으면 아메리카 것 그대로. */
export function polarPathFlowLayer(id, d, ctx = {}) {
  const map = ctx.map, undo = map?.view ? setBase(map, d?.properties?.view?.base) : null;
  const layer = pathFlowLayer(id, d, ctx);
  if (undo) {
    const des = layer.destroy;
    let done = false;
    layer.destroy = () => { des.call(layer); if (!done) { done = true; if (!map.destroyed) undo(); } };
  }
  return layer;
}

/** 등록(단원 main 이 mountAtlas 전에, installAmericasExtras 뒤에 — 상자 옵션 차례 지구본 → 북극 중심 → 남극 중심). 두 번 불러도 같음. */
export function installPolarExtras() {
  // 옵션 차례(지구본 → 극 둘)와 viewTools 의 지구본 몫이 지구본 등록을 전제로 함 — 늦게 등록하면 상자 차례가 틀어지므로 멈춤
  if (!PROJECTIONS.globe) throw new Error('installPolarExtras: installAmericasExtras() 를 먼저');
  if (!PROJECTIONS.polarN) registerProjection('polarN', polarProjection({ pole: 'N' }));
  if (!PROJECTIONS.polarS) registerProjection('polarS', polarProjection({ pole: 'S' }));
  registerLayerType('topicView', topicViewLayer);
  registerLayerType('sectorLines', (id, d, ctx) => sectorLinesLayer(id, d, ctx));
  // 아메리카 등록을 덮음(뒷면 글자 숨김 — 위 3i). 차례에 기댐: installPolarExtras 뒤에 installAmericasExtras 를 다시 부르면 아메리카 것으로
  // 되돌아가므로 단원 main 은 늘 installAmericasExtras → installPolarExtras 한 번씩(위 지구본 검사가 앞 차례를, 시험이 덮인 상태를 지킴).
  registerLayerType('symbolLabels', polarSymbolLabelsLayer);
  registerLayerType('pathFlow', polarPathFlowLayer); // 아메리카 등록을 덮음(view.base — 위 U6-9, 없으면 같은 동작)
  registerSvgChart('dualLine', dualLineSvg);
  registerSvgChart('halfPie', halfPieSvg);
}
