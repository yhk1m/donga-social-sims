// © 2026 김용현
// src/atlas/renderer.js — 지도 렌더러: 캔버스 바탕층(바다·육지·하천·국경·경위선·해안선 + 캔버스 레이어) + SVG 상호작용층(지명·SVG 레이어).
// 웹 타일 지도 없이 d3 로 웹지도 느낌을 낸다: 끌기·휠·두 손가락 확대(zoomer.js — d3-zoom 과 같은 변환, 1~40배), 움직이는 동안은 마지막 그림(스냅숏)을
// 옮기고 키우기만 하고, 멈추면(120ms) 전체를 다시 그린 뒤 지명을 다시 놓아 서서히 보인다.
//
//   const map = createMap(stage, { basemap, places, unitBoxes });   // unitBoxes 없으면 unitBounds 또는 basemap.meta.unitBoxes
//   map.setProjection('robinson', { animate: true })   // 0.6초 보간(110m 육지만), 화면 가운데 경위도·k 유지
//   map.setCenterLon(150)                              // 대서양(0)·태평양(150) — 애니메이션 없이, 가운데 경위도·k 유지
//   map.flyTo({ center: [lon, lat], zoom } | { bounds }, ms = 700)   // bounds = [w,s,e,n] 또는 [[w,s],[e,n]]
//   map.fitBounds(bounds, { ms = 700, pad = 24 })
//   map.addLayer({ id, z, draw?(ctx, path, view), drawSvg?(g, project, view), hit?(xy, lonlat) }) / removeLayer(id) / clearLayers()
//   map.on('click' | 'hover' | 'viewchange', fn) → 해제 함수.  click·hover: fn({ lonlat, xy, feature?, layerId? }), viewchange: fn(view)
//   map.project(lonlat) → [x, y] | null,  map.invert(xy) → lonlat | null
//   map.view → { key, centerLon, k, x, y, width, height, center, kmPerPx, detail, moving, projection, geoRect }
//   map.setOptions({ graticule, labels, relief }), map.setReliefDrawer(fn), map.redraw(), map.destroy(), map.stats(시간 측정)
//
// 레이어 규칙
//   - 캔버스 레이어 draw(ctx, path, view): ctx 단위 = 화면 CSS px(devicePixelRatio 는 렌더러가 처리), path = geoPath(화면 투영, ctx).
//     z < 50 은 육지(+음영) 바로 위·호수/하천 아래(면 레이어), z ≥ 50 은 해안선 위. 각 호출은 save/restore 로 감싼다.
//   - SVG 레이어 drawSvg(g, project, view): 레이어마다 자기 <g>(z 순서). 멈출 때와 움직이는 동안 프레임마다 불리므로
//     요소를 제자리에서 고치게(빠르게) 만든다. 도법 전환 중에는 숨긴다. 자기 요소의 클릭은 스스로 처리하고 stopPropagation.
//   - hit(xy, lonlat) → feature | null: 캔버스 레이어 맞히기(z 큰 것부터). 아무 레이어도 안 맞으면 바탕 지도 나라(layerId 'basemap').
//   - 지형 음영 setReliefDrawer(fn): fn(ctx, projection, view, { land, under, path }) — 육지를 칠한 뒤(레이어 아래) 멈출 때만 불린다.
//     land = 지금 상세도 육지(화면 상자로 자른 것), under = 10a 일 때 단원 상자 밖을 메우는 50m 육지(아니면 null).
//   - view.geoRect = 마지막 전체 그림 때 화면에 보이는 경위도 상자 [w, s, e, n](+여백, 경도는 중심 경도 기준으로 펴서 ±180 을 넘을 수 있음)
//     | null(세계 보기). 바탕 지도는 이 상자로 미리 잘라 투영한다(mapView.js clipIndexed — 구드 preclip 이 무거워서). 레이어도 써도 된다.
import { geoPath, geoContains, geoBounds, geoGraticule } from 'd3-geo';
import { feature, mesh } from 'topojson-client';
import { h, s } from '../shared/dom.js';
import { makeProjection, interpolateProjection, fitBoundsTransform, PROJECTIONS } from './projections.js';
import { pickDetail, inUnit, detailObjects } from './lod.js';
import { placeLabels, createMeasureCache, MIN_K, DEFAULT_RANK } from './labels.js';
import {
  viewProjection, transformForCenter, centerOf, invertChecked, relativeTransform, normalizeBounds, kmPerPx,
  sortLayers, hitTest, dropBoxEdges, boxPolygon, pathBroken, riverStyle, lakeVisible, graticuleStep, fontPx, trimPath, glyphLayout,
  viewRect, indexGeometry, clipIndexed, nearCenter,
} from './mapView.js';
import { createZoomer } from './zoomer.js';
import './atlas.css';

export const STYLE = {
  outside: '#e8e6e1', // 지구 밖(무대 바탕)
  ocean: '#aad3df',
  land: '#f2efe9',
  lake: '#aad3df',
  river: '#7fb3d5',
  border: '#9a8f7f',
  graticule: 'rgba(30,42,74,.18)',
  coast: '#8fb5c2',
  sphere: 'rgba(70,110,130,.45)',
};
const K_MIN = 1, K_MAX = 40;
const SETTLE_MS = 120;
const MORPH_MS = 600;
const PAD = 12; // 세계 전체 맞춤 여백(px)
const FIT_PAD = 24; // 범위 맞춤 여백(px)
const SLACK = 0.3; // 확대했을 때 지도 밖이 화면에 들어와도 되는 비율
const LAYER_TOP_Z = 50;
const WORLD_BOX = [-180, -90, 180, 90];
const EDGE_EPS = 2e-3; // 상자 테두리 판정(도) — basemap 양자화(0.0036°×0.0017°)보다 조금 크게
const SPHERE = { type: 'Sphere' };
// 선·면 지명 자간 상한(글자 폭의 배수): 바다·지형은 교과서처럼 넓게, 나라·섬·하천은 덜
const SPREAD = { sea: 3, mountain: 3, region: 3, desert: 3, plain: 3, country: 1.8, river: 2.2, island: 2, other: 1.6 };
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const now = () => performance.now();

export function createMap(stage, { basemap, places = [], unitBoxes, unitBounds, projection = 'miller', centerLon = 0 } = {}) {
  if (!basemap?.objects) throw new Error('createMap: basemap(TopoJSON) 필요');
  if (!PROJECTIONS[projection]) throw new Error(`모르는 도법: ${projection}`);
  const boxes = unitBoxes || (unitBounds ? [normalizeBounds(unitBounds).flat()] : basemap.meta?.unitBoxes) || [];
  const boxPolys = boxes.map((b) => boxPolygon(b));

  // ---------- DOM ----------
  stage.classList.add('at-stage');
  const canvas = h('canvas', { class: 'ds-canvas at-base' });
  const ctx = canvas.getContext('2d');
  const gLabels = s('g', { class: 'at-labels' });
  const gLayers = s('g', { class: 'at-layers' });
  const svg = s('svg', { class: 'at-overlay' }, gLabels, gLayers);
  stage.append(canvas, svg);
  const snap = h('canvas'); // 마지막 전체 그림(장치 px)
  const sctx = snap.getContext('2d');
  const measureCtx = h('canvas').getContext('2d');

  // ---------- 상태 ----------
  let W = 0, H = 0, dpr = 1;
  let key = projection, cLon = centerLon;
  let base = null; // 무대에 지구 전체를 맞춘 기준 투영
  let T = { k: 1, x: 0, y: 0 }; // 확대 변환(화면 = k·기준 투영 + [x, y])
  let vp = null; // 화면 투영 = viewProjection(base, T)
  let snapT = null; // 스냅숏을 찍은 때의 T
  let labelT = null; // 지명을 놓은 때의 T
  let detail = '110';
  let rect = null; // 마지막 전체 그림의 화면 경위도 상자 [w, s, e, n] | null(자르지 않음)
  let mode = 'idle'; // idle | moving | morph
  let destroyed = false;
  let morph = null; // {raf, finish}
  let settleTimer = 0, frameRaf = 0, hoverRaf = 0, pendingHover = null;
  let pendingView = null; // 크기를 모를 때 받은 flyTo/fitBounds
  let reliefDrawer = null;
  const opts = { graticule: true, labels: true, relief: true };
  const layers = []; // {layer, g}
  const handlers = { click: new Set(), hover: new Set(), viewchange: new Set() };
  const stats = { render: [], labels: [], labelCount: 0, morphFrames: [], interactiveFrames: [] };
  const push = (arr, v) => { arr.push(v); if (arr.length > 60) arr.shift(); };

  // ---------- 바탕 지도 자료(상세도별 GeoJSON, 처음 쓸 때 만든다) ----------
  const geo = {};
  function level(l) {
    if (geo[l]) return geo[l];
    const o = detailObjects(l), ob = basemap.objects;
    const land = feature(basemap, ob[o.land]);
    const countries = feature(basemap, ob[o.countries]).features;
    const borders = mesh(basemap, ob[o.countries], (a, b) => a !== b);
    // 해안선 강조: 육지 경계에서 ±180° 자른 자리와(10a 는) 단원 상자 테두리를 뺀다
    const coast = dropBoxEdges(mesh(basemap, ob[o.land]), l === '10a' ? [WORLD_BOX, ...boxes] : [WORLD_BOX], EDGE_EPS);
    const bySize = (name, kind) => {
      if (!name) return null;
      const m = new Map();
      for (const f of feature(basemap, ob[name]).features) {
        const sr = f.properties?.s ?? 6, g = f.geometry;
        if (!g) continue;
        if (!m.has(sr)) m.set(sr, []);
        const parts = m.get(sr);
        if (g.type === kind) parts.push(g.coordinates);
        else if (g.type === `Multi${kind}`) parts.push(...g.coordinates);
      }
      return [...m.entries()].sort((a, b) => a[0] - b[0]).map(([sr, coords]) => ({ s: sr, idx: indexGeometry({ type: `Multi${kind}`, coordinates: coords }) }));
    };
    // 그리기용은 화면 경위도 상자로 미리 자르는 색인(mapView.js clipIndexed — 구드 preclip 이 무거워서)
    geo[l] = {
      land, countries, landIdx: indexGeometry(land), bordersIdx: indexGeometry(borders), coastIdx: indexGeometry(coast),
      rivers: bySize(o.rivers, 'LineString'), lakes: bySize(o.lakes, 'Polygon'),
    };
    return geo[l];
  }
  const graticules = new Map();
  const graticuleOf = (step) => {
    if (!graticules.has(step)) graticules.set(step, indexGeometry(geoGraticule().step([step, step]).extentMinor([[-180, -80 - 1e-6], [180, 80 + 1e-6]])()));
    return graticules.get(step);
  };
  // 나라 맞히기(바탕 지도): 50m 나라 + 경위도 상자 미리 거르기
  let countryIndex = null;
  function countryAt(ll) {
    if (!countryIndex) countryIndex = level('50').countries.map((f) => ({ f, b: geoBounds(f) }));
    for (const { f, b } of countryIndex) {
      const [[w, s0], [e, n]] = b;
      if (ll[1] < s0 || ll[1] > n) continue;
      if (w <= e ? ll[0] < w || ll[0] > e : ll[0] < w && ll[0] > e) continue;
      if (geoContains(f, ll)) return f;
    }
    return null;
  }

  // ---------- 지명 준비(정적 부분) ----------
  const fontFamily = (getComputedStyle(stage).fontFamily || 'sans-serif');
  const measure = createMeasureCache((text, size) => { measureCtx.font = `700 ${size}px ${fontFamily}`; return measureCtx.measureText(text).width; });
  const placeItems = places.filter((p) => p && p.name && Number.isFinite(p.lon) && Number.isFinite(p.lat)).map((p, i) => ({
    i, p, rank: p.rank ?? DEFAULT_RANK, minK: p.minK ?? MIN_K[p.rank ?? DEFAULT_RANK] ?? 9, px: fontPx(p.size ?? 6),
    kind: p.kind || 'other', symbol: !!p.symbol, path: Array.isArray(p.path) && p.path.length >= 2 ? p.path : null,
  }));

  // ---------- 확대·이동 ----------
  // 확대하면(k ≥ 2) 화면의 30% 까지 지도 밖 빈 곳 허용 — 구드·로빈슨에서 아시아를 가운데에 둘 수 있게. k=1 은 세계 전체 고정.
  const slack = (k) => { const f = Math.min(1, Math.max(0, k - 1)) * SLACK; return [f * W, f * H]; };
  const zb = createZoomer(svg, { scaleExtent: [K_MIN, K_MAX], slack, onStart: onZoomStart, onZoom, onEnd: onZoomEnd });
  const local = (e) => { const r = svg.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  svg.addEventListener('click', onClick);
  svg.addEventListener('pointermove', onPointerMove);
  svg.addEventListener('pointerleave', onPointerLeave);

  function translateExtentOf(b) {
    let x0, y0, x1, y1;
    if (b.key === 'mercator') [[x0, y0], [x1, y1]] = b.clipExtent();
    else [[x0, y0], [x1, y1]] = geoPath(b).bounds(SPHERE);
    return [[x0 - PAD, y0 - PAD], [x1 + PAD, y1 + PAD]];
  }
  const constrain = (t) => zb.constrain(t);
  function setBase(b) {
    base = b;
    zb.extent([[0, 0], [W, H]]).translateExtent(translateExtentOf(b));
  }
  function updateVP() {
    vp = viewProjection(base, T, { width: W, height: H });
  }
  /** 변환을 t 로(이벤트 없이, 범위 제한) */
  function setTransform(t) {
    T = zb.set(t);
    updateVP();
  }

  function onZoomStart(src) {
    if (morph && src !== 'fly') morph.finish();
    clearTimeout(settleTimer);
    if (src === 'fly' || src === 'dblclick') gLabels.classList.add('is-hidden');
  }
  function onZoom(t) {
    T = t;
    if (!base) return;
    updateVP();
    if (morph) return;
    mode = 'moving';
    if (!frameRaf) frameRaf = requestAnimationFrame(frame);
    clearTimeout(settleTimer);
    settleTimer = setTimeout(settle, SETTLE_MS);
  }
  function onZoomEnd() {
    if (morph) return;
    clearTimeout(settleTimer);
    settleTimer = setTimeout(settle, SETTLE_MS);
  }

  // ---------- 그리기 ----------
  function sphere(path, proj) {
    ctx.beginPath();
    if (proj.frame) { const [[x0, y0], [x1, y1]] = proj.frame; ctx.rect(x0, y0, x1 - x0, y1 - y0); } else path(SPHERE);
  }
  function fillGeo(path, g, color) { ctx.beginPath(); path(g); ctx.fillStyle = color; ctx.fill(); }
  function strokeGeo(path, g, color, width) { ctx.beginPath(); path(g); ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke(); }
  /** 단원 상자 밖만 칠하도록 자르기(10a 를 쓸 때 50m 를 상자 밖에만) */
  function clipOutsideUnit(path) {
    ctx.beginPath();
    ctx.rect(-10, -10, W + 20, H + 20);
    for (const bp of boxPolys) path(bp);
    ctx.clip('evenodd');
  }
  function begin() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  }
  /** 빠른 그림: 바다 + 110m 육지(도법 전환 프레임, 움직이는 동안 스냅숏 바깥) */
  function drawFast(proj, { clear = true } = {}) {
    if (clear) begin(); else ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const path = geoPath(proj, ctx);
    sphere(path, proj); ctx.fillStyle = STYLE.ocean; ctx.fill();
    fillGeo(path, level('110').land, STYLE.land);
  }
  function canvasLayers(path, view, top) {
    for (const layer of sortLayers(layers.map((x) => x.layer))) {
      if (typeof layer.draw !== 'function' || ((layer.z ?? 0) >= LAYER_TOP_Z) !== top) continue;
      ctx.save();
      try { layer.draw(ctx, path, view); } catch (err) { console.error(`레이어 ${layer.id} 그리기 실패`, err); }
      ctx.restore();
    }
  }
  function currentDetail() {
    const c = nearCenter(vp, W, H); // 가운데가 구드 틈이면 가까운 지도 위 점
    return pickDetail(T.k, !!c && inUnit(c, boxes));
  }
  /** 전체 그림(멈췄을 때) */
  function render() {
    if (!W || !H || !base) return;
    const t0 = now();
    const parts = {};
    let tp = t0;
    const mark = (name) => { const t = now(); parts[name] = Math.round((t - tp) * 10) / 10; tp = t; };
    updateVP();
    detail = currentDetail();
    rect = viewRect(vp, W, H); // 화면에 보이는 경위도 상자(+여백), 세계 보기면 null
    mark('rect');
    const view = viewState();
    begin();
    const path = geoPath(vp, ctx);
    const k = T.k;
    sphere(path, vp); ctx.fillStyle = STYLE.ocean; ctx.fill();
    mark('sea');
    const C = (idx) => clipIndexed(idx, rect);
    const L = level(detail);
    const under = detail === '10a' ? level('50') : null; // 단원 상자 밖은 50m
    const outside = (fn) => { if (!under) return; ctx.save(); clipOutsideUnit(path); fn(under); ctx.restore(); };
    // 육지
    const landL = C(L.landIdx), landU = under ? C(under.landIdx) : null;
    outside(() => fillGeo(path, landU, STYLE.land));
    fillGeo(path, landL, STYLE.land);
    mark('land');
    // 지형 음영(D5)
    if (opts.relief && reliefDrawer) {
      ctx.save();
      try { reliefDrawer(ctx, vp, view, { land: landL, under: landU, path }); } catch (err) { console.error('지형 음영 실패', err); }
      ctx.restore();
      mark('relief');
    }
    canvasLayers(path, view, false);
    mark('areaLayers');
    // 호수·하천
    const lakes = (G) => {
      if (!G.lakes) return;
      ctx.beginPath();
      for (const { s: sr, idx } of G.lakes) if (lakeVisible(sr, k)) path(C(idx));
      ctx.fillStyle = STYLE.lake; ctx.fill();
    };
    const rivers = (G) => {
      if (!G.rivers) return;
      ctx.strokeStyle = STYLE.river;
      for (const { s: sr, idx } of G.rivers) {
        const st = riverStyle(sr, k);
        if (!st.visible) continue;
        ctx.beginPath(); path(C(idx)); ctx.lineWidth = st.width; ctx.stroke();
      }
    };
    outside((U) => { lakes(U); rivers(U); });
    lakes(L); rivers(L);
    mark('water');
    // 국경
    const bw = k < 2 ? 0.6 : k < 4 ? 0.75 : 0.9;
    outside((U) => strokeGeo(path, C(U.bordersIdx), STYLE.border, bw));
    strokeGeo(path, C(L.bordersIdx), STYLE.border, bw);
    mark('borders');
    // 경위선
    if (opts.graticule) strokeGeo(path, C(graticuleOf(graticuleStep(k))), STYLE.graticule, 0.5);
    mark('graticule');
    // 해안선 강조
    const cw = k < 2 ? 0.6 : 0.8;
    outside((U) => strokeGeo(path, C(U.coastIdx), STYLE.coast, cw));
    strokeGeo(path, C(L.coastIdx), STYLE.coast, cw);
    mark('coast');
    canvasLayers(path, view, true);
    mark('topLayers');
    // 지구 테두리
    sphere(path, vp); ctx.strokeStyle = STYLE.sphere; ctx.lineWidth = 0.8; ctx.stroke();
    takeSnapshot();
    mark('frame');
    push(stats.render, { ms: now() - t0, detail, k, key, parts });
  }
  function takeSnapshot() {
    if (snap.width !== canvas.width || snap.height !== canvas.height) { snap.width = canvas.width; snap.height = canvas.height; }
    sctx.setTransform(1, 0, 0, 1, 0, 0);
    sctx.clearRect(0, 0, snap.width, snap.height);
    sctx.drawImage(canvas, 0, 0);
    snapT = { ...T };
  }
  /** 움직이는 동안 한 프레임: 스냅숏을 옮기고 키움. 스냅숏이 화면을 다 덮지 못하면 빠른 그림을 밑에 깐다. */
  function drawInteractive() {
    const t0 = now();
    if (!snapT) { drawFast(vp); return; }
    const { r, dx, dy } = relativeTransform(snapT, T);
    const covers = dx <= 0.5 && dy <= 0.5 && r * W + dx >= W - 0.5 && r * H + dy >= H - 0.5;
    if (covers) begin(); else drawFast(vp);
    ctx.setTransform(r, 0, 0, r, dx * dpr, dy * dpr);
    ctx.drawImage(snap, 0, 0);
    push(stats.interactiveFrames, now() - t0);
  }
  function frame() {
    frameRaf = 0;
    if (destroyed || mode !== 'moving') return;
    drawInteractive();
    drawSvgLayers();
    // 지명: 이동만이면 따라 옮기고, 확대가 바뀌면 숨김(멈추면 다시 놓는다)
    if (labelT && Math.abs(labelT.k - T.k) < 1e-9) gLabels.setAttribute('transform', `translate(${T.x - labelT.x},${T.y - labelT.y})`);
    else gLabels.classList.add('is-hidden');
    emit('viewchange', viewState());
  }
  function settle() {
    clearTimeout(settleTimer);
    if (destroyed || !W || morph) return;
    mode = 'idle';
    render();
    gLayers.classList.remove('is-hidden');
    drawSvgLayers();
    updateLabels();
    emit('viewchange', viewState());
  }
  function drawSvgLayers() {
    const view = viewState();
    for (const { layer, g } of layers) {
      if (!g) continue;
      try { layer.drawSvg(g, project, view); } catch (err) { console.error(`레이어 ${layer.id} SVG 실패`, err); }
    }
  }

  // ---------- 지명 ----------
  function updateLabels() {
    const t0 = now();
    gLabels.removeAttribute('transform');
    labelT = { ...T };
    if (!opts.labels) { gLabels.replaceChildren(); gLabels.classList.add('is-hidden'); return; }
    const k = T.k, items = [];
    const m = Math.max(W, H);
    const onScreenish = (q) => q && q[0] > -m && q[0] < W + m && q[1] > -m && q[1] < H + m;
    for (const it of placeItems) {
      if (k < it.minK) continue;
      const xy = project([it.p.lon, it.p.lat]);
      let pathXY = null;
      if (it.path) {
        const pts = it.path.map(project);
        if (pts.every(Boolean) && pts.some(onScreenish) && !pathBroken(it.path, vp)) pathXY = trimPath(pts, measure(it.p.name, it.px) * (SPREAD[it.kind] ?? 2));
      }
      if (!pathXY && !onScreenish(xy)) continue;
      items.push({ name: it.p.name, rank: it.rank, minK: it.minK, size: it.px, xy: xy || undefined, pathXY: pathXY || undefined, symbol: it.symbol, kind: it.kind, src: it });
    }
    const placed = placeLabels(items, { width: W, height: H, measure, k, pad: 2, symbolR: 3 });
    const t1 = now();
    const nodes = placed.map(labelNode);
    gLabels.replaceChildren(...nodes);
    gLabels.classList.add('is-hidden');
    // 다음 프레임에 보이게(투명도 전환으로 서서히)
    requestAnimationFrame(() => { if (!destroyed && mode === 'idle') gLabels.classList.remove('is-hidden'); });
    stats.labelCount = placed.length;
    push(stats.labels, { place: t1 - t0, dom: now() - t1, n: placed.length, k });
  }
  const r1 = (v) => Math.round(v * 10) / 10;
  function labelNode(L) {
    const cls = `at-label at-label-${L.kind}`;
    const g = s('g', { class: 'at-label-group' });
    if (L.symbol && L.xy) {
      const [x, y] = L.xy;
      if (L.kind === 'capital') g.append(s('rect', { class: 'at-sym at-sym-capital', x: r1(x - 3), y: r1(y - 3), width: 6, height: 6 }));
      else if (L.kind === 'mountain') g.append(s('path', { class: 'at-sym at-sym-peak', d: `M${r1(x)},${r1(y - 3.5)}L${r1(x + 3.5)},${r1(y + 2.5)}L${r1(x - 3.5)},${r1(y + 2.5)}Z` }));
      else g.append(s('circle', { class: 'at-sym at-sym-city', cx: r1(x), cy: r1(y), r: 2.4 }));
    }
    const fs = `${L.size}px`;
    const gly = glyphLayout(L, measure); // 굽은 줄·가파른 줄은 글자별(가파르면 세움)
    if (gly) {
      for (const gl of gly.glyphs) {
        g.append(s('text', { class: cls, 'font-size': fs, transform: `translate(${r1(gl.at[0])},${r1(gl.at[1])})${gl.angle ? ` rotate(${r1(gl.angle)})` : ''}` }, gl.ch));
      }
    } else {
      const sp = L.spacing || 0;
      g.append(s('text', {
        class: cls, 'font-size': fs, 'letter-spacing': sp ? r1(sp) : null, dx: sp ? r1(sp / 2) : null,
        transform: `translate(${r1(L.at[0])},${r1(L.at[1])})${L.angle ? ` rotate(${r1(L.angle)})` : ''}`,
      }, L.name));
    }
    return g;
  }

  // ---------- 도법·중심 경도·이동 ----------
  function viewState() {
    return {
      key, centerLon: cLon, k: T.k, x: T.x, y: T.y, width: W, height: H,
      center: vp ? centerOf(vp, W, H) : null, kmPerPx: vp ? kmPerPx(vp, [W / 2, H / 2]) : null,
      detail, moving: mode !== 'idle', projection: vp, geoRect: rect,
    };
  }
  function project(ll) {
    if (!vp || !ll) return null;
    const q = vp(ll);
    return q && Number.isFinite(q[0]) && Number.isFinite(q[1]) ? q : null;
  }
  function invert(xy) { return vp ? invertChecked(vp, xy) : null; }

  /** 새 기준 투영 nb 로 바꾸며 가운데 경위도·k 를 지킨 변환 */
  function keepView(nb, center, k) {
    const t = (center && transformForCenter(nb, center, k, W, H)) || { k: 1, x: 0, y: 0 };
    return constrain(t);
  }
  function setProjection(newKey, { animate = true } = {}) {
    if (!PROJECTIONS[newKey]) throw new Error(`모르는 도법: ${newKey}`);
    if (morph) morph.finish();
    if (newKey === key) return;
    if (!W) { key = newKey; return; }
    const center = nearCenter(vp, W, H) || [cLon, 0];
    const from = vp;
    key = newKey;
    const nb = makeProjection(key, { centerLon: cLon, width: W, height: H, pad: PAD });
    setBase(nb);
    const nt = keepView(nb, center, T.k);
    const to = viewProjection(nb, nt, { width: W, height: H });
    if (!animate) { setTransform(nt); settle(); return; }
    // 보간: 110m 육지만 프레임마다
    const interp = interpolateProjection(from, to);
    mode = 'morph';
    gLabels.classList.add('is-hidden'); gLayers.classList.add('is-hidden');
    clearTimeout(settleTimer);
    const t0 = now();
    let last = t0;
    morph = {
      raf: 0,
      finish() {
        if (!morph) return;
        cancelAnimationFrame(morph.raf);
        morph = null;
        mode = 'idle';
        snapT = null;
        setTransform(nt);
        settle();
      },
    };
    const step = () => {
      if (!morph || destroyed) return;
      const tn = now();
      const u = Math.min(1, (tn - t0) / MORPH_MS);
      if (u >= 1) { morph.finish(); return; }
      const f0 = now();
      drawFast(interp(ease(u)));
      push(stats.morphFrames, { frame: now() - f0, interval: tn - last });
      last = tn;
      morph.raf = requestAnimationFrame(step);
    };
    morph.raf = requestAnimationFrame(step);
  }
  function setCenterLon(lon) {
    if (!Number.isFinite(lon)) throw new Error('setCenterLon: 숫자 필요');
    if (morph) morph.finish();
    if (lon === cLon) return;
    const center = vp ? nearCenter(vp, W, H) : null;
    cLon = lon;
    if (!W) return;
    const nb = makeProjection(key, { centerLon: cLon, width: W, height: H, pad: PAD });
    setBase(nb);
    snapT = null;
    setTransform(keepView(nb, center, T.k));
    settle();
  }
  function targetTransform(target) {
    if (target.bounds) return constrain(fitBoundsTransform(base, normalizeBounds(target.bounds), W, H, target.pad ?? FIT_PAD, { minK: K_MIN, maxK: K_MAX }));
    const center = target.center || (vp && nearCenter(vp, W, H)) || [cLon, 0];
    return keepView(base, center, target.zoom ?? T.k);
  }
  function flyTo(target, ms = 700) {
    if (morph) morph.finish();
    if (!W) { pendingView = { target, ms: 0 }; return; }
    const t = targetTransform(target);
    if (!ms) { zb.interrupt(); setTransform(t); settle(); return; }
    zb.flyTo(t, ms);
  }
  function fitBounds(bounds, { ms = 700, pad = FIT_PAD } = {}) { flyTo({ bounds, pad }, ms); }

  // ---------- 크기 ----------
  function resize() {
    const r = stage.getBoundingClientRect();
    const nw = Math.round(r.width), nh = Math.round(r.height);
    const nd = Math.min(3, window.devicePixelRatio || 1);
    if (!nw || !nh || (nw === W && nh === H && nd === dpr)) return;
    const center = vp ? nearCenter(vp, W, H) : null, k = T.k, first = !W;
    W = nw; H = nh; dpr = nd;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    const nb = makeProjection(key, { centerLon: cLon, width: W, height: H, pad: PAD });
    setBase(nb);
    snapT = null;
    setTransform(first || !center ? { k: 1, x: 0, y: 0 } : keepView(nb, center, k));
    if (pendingView) { const p = pendingView; pendingView = null; setTransform(targetTransform(p.target)); }
    settle();
  }
  const ro = new ResizeObserver(() => { requestAnimationFrame(() => { if (!destroyed) resize(); }); });
  ro.observe(stage);

  // ---------- 클릭·호버 ----------
  function hitAt(xy) {
    const lonlat = invert(xy);
    const out = { lonlat, xy };
    if (!lonlat) return out;
    const r = hitTest(layers.map((x) => x.layer), xy, lonlat);
    if (r) return { ...out, ...r };
    const c = countryAt(lonlat);
    return c ? { ...out, feature: c, layerId: 'basemap' } : out;
  }
  function onClick(e) {
    // 끌기 직후(100ms) click 은 zoomer 가 먹는다. 휠·끌기가 끝나고 다시 그리기(120ms) 전에도 화면 투영은 지금 변환과 같아 맞히기가 맞으므로 받는다.
    // 도법 전환 보간 중에는 화면 그림과 투영이 달라 무시한다.
    if (e.target !== svg || morph) return;
    emit('click', hitAt(local(e)));
  }
  function onPointerMove(e) {
    if (!handlers.hover.size || e.buttons) return;
    pendingHover = local(e);
    if (hoverRaf) return;
    hoverRaf = requestAnimationFrame(() => {
      hoverRaf = 0;
      if (destroyed || mode !== 'idle' || !pendingHover) return;
      emit('hover', hitAt(pendingHover));
    });
  }
  function onPointerLeave() { pendingHover = null; if (handlers.hover.size) emit('hover', { lonlat: null, xy: null }); }
  function emit(type, payload) {
    for (const fn of handlers[type]) { try { fn(payload); } catch (err) { console.error(`지도 ${type} 처리 실패`, err); } }
  }

  // ---------- 레이어 ----------
  function addLayer(layer) {
    if (!layer?.id) throw new Error('addLayer: id 필요');
    removeLayer(layer.id, { quiet: true });
    const g = typeof layer.drawSvg === 'function' ? s('g', { class: 'at-layer', 'data-layer': layer.id }) : null;
    layers.push({ layer, g });
    if (g) {
      const order = sortLayers(layers.map((x) => x.layer));
      const after = order.slice(order.indexOf(layer) + 1).map((l) => layers.find((x) => x.layer === l).g).find(Boolean);
      gLayers.insertBefore(g, after || null);
    }
    requestSettle();
    return layer;
  }
  function removeLayer(id, { quiet = false } = {}) {
    const i = layers.findIndex((x) => x.layer.id === id);
    if (i < 0) return false;
    const [{ g, layer }] = layers.splice(i, 1);
    g?.remove();
    try { layer.destroy?.(); } catch (err) { console.error(err); }
    if (!quiet) requestSettle();
    return true;
  }
  function clearLayers() {
    for (const { layer } of [...layers]) removeLayer(layer.id, { quiet: true });
    requestSettle();
  }
  let settleRaf = 0;
  function requestSettle() {
    if (settleRaf) return;
    settleRaf = requestAnimationFrame(() => { settleRaf = 0; if (mode === 'idle') settle(); });
  }

  // ---------- 처음 ----------
  resize();

  return {
    setProjection, setCenterLon, flyTo, fitBounds, addLayer, removeLayer, clearLayers, project, invert,
    get view() { return viewState(); },
    get layers() { return sortLayers(layers.map((x) => x.layer)); },
    get stats() { return stats; },
    on(type, fn) {
      if (!handlers[type]) throw new Error(`모르는 이벤트: ${type}`);
      handlers[type].add(fn);
      return () => handlers[type].delete(fn);
    },
    setOptions(o = {}) {
      for (const k of ['graticule', 'labels', 'relief']) if (k in o) opts[k] = !!o[k];
      requestSettle();
    },
    setReliefDrawer(fn) { reliefDrawer = typeof fn === 'function' ? fn : null; requestSettle(); },
    redraw() { if (morph) morph.finish(); settle(); },
    destroy() {
      destroyed = true;
      ro.disconnect();
      clearTimeout(settleTimer);
      cancelAnimationFrame(frameRaf); cancelAnimationFrame(hoverRaf); cancelAnimationFrame(settleRaf);
      if (morph) cancelAnimationFrame(morph.raf);
      morph = null;
      zb.destroy();
      svg.removeEventListener('click', onClick);
      svg.removeEventListener('pointermove', onPointerMove);
      svg.removeEventListener('pointerleave', onPointerLeave);
      for (const { layer } of [...layers]) removeLayer(layer.id, { quiet: true });
      for (const set of Object.values(handlers)) set.clear();
      canvas.remove(); svg.remove();
      stage.classList.remove('at-stage');
    },
  };
}
