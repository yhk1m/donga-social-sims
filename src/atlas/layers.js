// © 2026 김용현
// src/atlas/layers.js — 주제 레이어 종류. 모두 렌더러(renderer.js) 레이어 계약 {id, z, draw?, drawSvg?, hit?, destroy?} 을 돌려준다.
//
//   areaLayer(id, geojson, { legend, map, colorOf, dimAlpha = 0.15, fillOpacity = 0.85 })   캔버스 면(+ 같은 자료의 선: 등온선·국경 주장선·정전 라인, 빗금 면)
//   symbolLayer(id, points, { legend, map, iconOf, sizeOf, onPick })                         SVG 기호(선 모양·원·네모·마름모·세모, 인구 막대)
//   flowLayer(id, lines, { legend, map, widthOf, colorOf })                                   SVG 흐름선(이차 베지어 곡선 + marker 화살촉)
//   markerLayer(id, markers, { map, onPick, numberOf })                                       SVG 번호 핀. layer.select(id | null)
//   imageLayer(id, { url, fit, bbox, width, height, bounds, opacity, legend, map })           교과서 투영 이미지를 화면 투영으로 역투영(캔버스)
//   combineLayers(id, parts)                                                                  여러 레이어를 한 id 로(교역 = 면 + 흐름선)
//   layerFromRef(refEntry, data, { legend, map, onPick })                                     topics.json 레이어 항목 → 레이어(type 으로 고름)
//
// 지도와의 연결(옵션 map): 레이어가 스스로 구독한다 — legend.onChange → map.refreshLayer(layerId), map.on('hover') → 자기 도형이면 강조.
//   map 을 안 주면 구독하지 않는다(부르는 쪽이 refreshLayer 를 부름). destroy() 가 구독을 모두 푼다(렌더러가 removeLayer·clearLayers 때 부름).
//   layerId = 렌더러에 올린 id(기본 = id). combineLayers 의 부분 레이어는 부모 id 로 다시 그리고 hover 를 받는다.
// 강조(hover): 렌더러 hover 이벤트의 feature 가 자기 것이면 SVG 로 테두리를 굵게(면 = 그 분류 전체 윤곽, 선·기호 = 굵은 테두리). 움직이는 동안은 숨김.
// 범례(legendState): 고르지 않은 분류는 흐리게(면 dimAlpha, 기호·선 dimAlpha 조금 더 짙게). hit 은 흐린 분류를 맞히지 않는다.
// layer.meta = 자료 맨 위 properties(+ layerFromRef 가 주제 항목 값), layer.meta.approx = 「위치 근사」 표시 여부. layer.legendItems = 화면 범례 항목.
//
// 규칙(EMBED_RULES.md): DOM 은 h()/s() 로만, 이미지는 new Image() + crossOrigin(같은 GitHub Pages 공개 주소), 빗금은 오프스크린 캔버스 createPattern(data: 주소 없음).
import { geoPath, geoContains, geoBounds } from 'd3-geo';
import { h, s } from '../shared/dom.js';
import { indexGeometry, clipIndexed } from './geoClip.js';
import { invertGrid } from './relief.js';
import { makeFitForward } from './fitProject.js';
import { createLegendState } from './legendState.js';
import {
  alphaOf, symbolPx, flowWidthPx, lineWidthPx, barMetrics, quadPath, arrowMarker, joinParts, unwrapLine, splitJumps, distToPolyline,
  lineLabelAt, imageIndex, parseHex, nearestColor, shapePath, legendItems, mapGridBlocks,
} from './layerStyle.js';

export const LAYER_Z = Object.freeze({ image: 5, area: 10, symbol: 60, flow: 70, marker: 80 });
const HALO = 'rgba(255,255,255,.9)';
const LINE_PT = { isotherm: 0.8, line: 1.2 }; // 주제도 선 기본 굵기(pt) — lineWidthPx 로 화면 px
const LABEL_FONT = '700 10px "Pretendard", "Malgun Gothic", sans-serif';
const r1 = (v) => Math.round(v * 10) / 10;
const featuresOf = (x) => (Array.isArray(x) ? x : x?.features || []);
const isPoly = (f) => /Polygon$/.test(f.geometry?.type || '');
const isLine = (f) => /LineString$/.test(f.geometry?.type || '');
const metaOf = (gj) => { const { legend, ...p } = gj?.properties || {}; return { ...p, approx: !!p.approx }; };
let seq = 0; // marker id 를 문서 안에서 겹치지 않게

/** 부분 레이어 공통: 지도 구독(범례 → 다시 그리기, hover → 강조). 해제 함수 목록을 돌려준다. */
function connect({ map, legend, layerId, onLegend, onHover }) {
  const offs = [];
  if (legend) offs.push(legend.onChange(() => { onLegend?.(); if (map && !map.destroyed) map.refreshLayer(layerId); }));
  if (map && onHover) offs.push(map.on('hover', (e) => onHover(e && e.layerId === layerId ? e.feature : null)));
  return offs;
}
const setAttr = (el, k, v) => { const sv = v == null ? null : String(v); if (el.getAttribute(k) !== sv) { if (sv == null) el.removeAttribute(k); else el.setAttribute(k, sv); } };

// ---------- 빗금(고산 기후) ----------
const hatchTiles = new Map();
/** 빗금 무늬(오프스크린 캔버스 8px 타일 → createPattern). data: 주소를 쓰지 않는다. */
function hatchPattern(ctx, color) {
  let tile = hatchTiles.get(color);
  if (!tile) {
    tile = h('canvas'); tile.width = tile.height = 8;
    const c = tile.getContext('2d');
    c.strokeStyle = color; c.lineWidth = 1.1; c.lineCap = 'square';
    c.beginPath();
    for (const o of [-8, 0, 8]) { c.moveTo(o, 8); c.lineTo(o + 8, 0); }
    c.stroke();
    hatchTiles.set(color, tile);
  }
  return ctx.createPattern(tile, 'repeat');
}

// ---------- 면 ----------
/**
 * 면 레이어(캔버스). 같은 자료의 선(등온선 type 'isotherm' — 값 글자 포함, 카슈미르 주장 국경·정전 라인 type 'line', dashed)은 흰 테두리 선으로,
 * pattern 'hatch' 면은 빗금으로 그린다. geometry:false 범례 항목은 그릴 것이 없다(범례에만).
 */
export function areaLayer(id, geojson, { legend = null, map = null, layerId = id, colorOf = (f) => f.properties.color, dimAlpha = 0.15, fillOpacity = 0.85, z = LAYER_Z.area } = {}) {
  const feats = featuresOf(geojson);
  const legendList = legendItems(geojson);
  const dashed = new Set(legendList.filter((e) => e.dashed).map((e) => e.cls));
  const areas = feats.filter((f) => isPoly(f) && !f.properties.pattern);
  const hatches = feats.filter((f) => isPoly(f) && f.properties.pattern === 'hatch');
  const lines = feats.filter(isLine);
  const own = new Set(feats);
  const cache = new Map(); // f → {idx, bounds}
  const info = (f) => { let c = cache.get(f); if (!c) { c = { idx: indexGeometry(f.geometry), bounds: null }; cache.set(f, c); } return c; };
  const clip = (f, rect) => clipIndexed(info(f).idx, rect);
  let lastView = null; // 마지막 캔버스 그림의 view(맞히기·강조용)
  const lineRuns = new Map(); // 선 f → 화면 조각들(마지막 그림)
  let hovered = null, hoverEl = null;

  function drawLine(ctx, path, f, view, alpha) {
    const p = f.properties, w = lineWidthPx(LINE_PT[p.type] ?? 1, view.k);
    const g = clip(f, view.geoRect);
    ctx.globalAlpha = alpha;
    ctx.setLineDash(p.dashed || dashed.has(p.cls) ? [w * 4, w * 2.5] : []);
    ctx.beginPath(); path(g);
    ctx.strokeStyle = HALO; ctx.lineWidth = w + 2; ctx.stroke();
    ctx.strokeStyle = colorOf(f); ctx.lineWidth = w; ctx.stroke();
    // 맞히기·글자용 화면 조각
    const proj = view.projection;
    const runs = [];
    for (const L of g.coordinates) runs.push(...splitJumps(unwrapLine(L), (ll) => { const q = proj(ll); return q && Number.isFinite(q[0]) ? q : null; }));
    lineRuns.set(f, { runs, w });
  }
  function drawIsoLabels(ctx, view) {
    ctx.setLineDash([]);
    ctx.font = LABEL_FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    for (const f of lines) {
      const p = f.properties;
      if (p.type !== 'isotherm' || p.value == null) continue;
      const lr = lineRuns.get(f);
      const at = lr && lineLabelAt(lr.runs, view.width, view.height, { margin: 12 });
      if (!at) continue;
      ctx.globalAlpha = alphaOf(legend, p.cls, dimAlpha);
      ctx.save();
      ctx.translate(at.at[0], at.at[1]); ctx.rotate((at.angle * Math.PI) / 180);
      const t = String(p.value);
      ctx.strokeStyle = HALO; ctx.lineWidth = 3; ctx.strokeText(t, 0, 0);
      ctx.fillStyle = colorOf(f); ctx.fillText(t, 0, 0);
      ctx.restore();
    }
  }

  const layer = {
    id, z, meta: metaOf(geojson), legendItems: legendList, features: feats,
    draw(ctx, path, view) {
      lastView = view;
      const rect = view.geoRect;
      for (const f of areas) {
        ctx.globalAlpha = fillOpacity * alphaOf(legend, f.properties.cls, dimAlpha);
        ctx.fillStyle = colorOf(f);
        ctx.beginPath(); path(clip(f, rect)); ctx.fill();
      }
      for (const f of hatches) {
        const g = clip(f, rect);
        ctx.globalAlpha = alphaOf(legend, f.properties.cls, dimAlpha);
        ctx.fillStyle = hatchPattern(ctx, colorOf(f)) || colorOf(f);
        ctx.beginPath(); path(g); ctx.fill();
        ctx.strokeStyle = colorOf(f); ctx.lineWidth = 0.6; ctx.globalAlpha *= 0.7; ctx.stroke();
      }
      lineRuns.clear();
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      for (const f of lines) drawLine(ctx, path, f, view, alphaOf(legend, f.properties.cls, dimAlpha));
      drawIsoLabels(ctx, view);
    },
    drawSvg(g, project, view) { // 강조 윤곽 하나(제자리에서 고침)
      if (!hoverEl || hoverEl.parentNode !== g) { hoverEl = s('path', { class: 'at-hover' }); g.append(hoverEl); }
      paintHover(view);
    },
    hit(xy, lonlat) {
      if (!lastView) return null;
      for (let i = lines.length - 1; i >= 0; i--) {
        const f = lines[i];
        if (alphaOf(legend, f.properties.cls, 0) === 0) continue;
        const lr = lineRuns.get(f);
        if (!lr) continue;
        const tol = Math.max(4, lr.w / 2 + 3);
        if (lr.runs.some((r) => distToPolyline(xy, r) <= tol)) return f;
      }
      const polys = [...areas, ...hatches];
      for (let i = polys.length - 1; i >= 0; i--) {
        const f = polys[i];
        if (alphaOf(legend, f.properties.cls, 0) === 0) continue;
        const c = info(f);
        if (!c.bounds) c.bounds = geoBounds(f);
        const [[w, s0], [e, n]] = c.bounds;
        if (lonlat[1] < s0 || lonlat[1] > n) continue;
        if (w <= e ? lonlat[0] < w || lonlat[0] > e : lonlat[0] < w && lonlat[0] > e) continue;
        if (geoContains(f, lonlat)) return f;
      }
      return null;
    },
    destroy() { offs.forEach((off) => off()); offs.length = 0; },
  };
  function paintHover(view) {
    if (!hoverEl) return;
    if (!hovered || !view || view.moving || !view.projection) { setAttr(hoverEl, 'd', null); return; }
    const geom = clip(hovered, view.geoRect);
    hoverEl.setAttribute('class', `at-hover ${isLine(hovered) ? 'at-hover-line' : 'at-hover-area'}`);
    setAttr(hoverEl, 'd', geoPath(view.projection)(geom) || null);
  }
  const offs = connect({
    map, legend, layerId,
    onLegend: () => { if (hovered && alphaOf(legend, hovered.properties.cls, 0) === 0) hovered = null; },
    onHover: (f) => { const nf = f && own.has(f) ? f : null; if (nf !== hovered) { hovered = nf; paintHover(map.view); } },
  });
  return layer;
}

// ---------- 기호 ----------
/** 기호 모양: 범례 항목의 shape(생성물, 설정 legendShapes) → 없으면 원. 'bar' = 인구 막대. */
function defaultIconOf(legendList) {
  const by = new Map(legendList.map((e) => [e.cls, e.shape]));
  return (f) => by.get(f.properties.cls) || 'circle';
}

/**
 * 기호 레이어(SVG). 기호 하나 = <g class="at-sym-item">. 모양 기호는 반지름 1 경로를 translate·scale 로 옮기고(테두리는 non-scaling-stroke),
 * 인구 막대(shape 'bar')는 1억 명 칸을 쌓고 사람 아이콘·나라 이름을 얹는다(지시선 막대는 barAt 에 세우고 나라 자리까지 점선).
 * 누르면 onPick(feature). 크기 = symbolPx(properties.size pt, k).
 */
export function symbolLayer(id, points, { legend = null, map = null, layerId = id, iconOf = null, sizeOf = (f) => f.properties.size, onPick = null, dimAlpha = 0.2, z = LAYER_Z.symbol } = {}) {
  const feats = featuresOf(points).filter((f) => f.geometry?.type === 'Point');
  const legendList = legendItems(points);
  const shapeOf = iconOf || defaultIconOf(legendList);
  const items = feats.map((f) => ({ f, shape: shapeOf(f), el: null, xy: null, box: null, key: '' }));
  const byF = new Map(items.map((it) => [it.f, it]));
  let root = null, hovered = null;

  function build(g) {
    root = s('g', { class: 'at-symbols' });
    for (const it of items) {
      const p = it.f.properties;
      const el = s('g', { class: `at-sym-item at-sym-${it.shape}`, on: { click: (e) => { e.stopPropagation(); onPick?.(it.f, e); } } });
      if (it.shape === 'bar') {
        it.leader = s('path', { class: 'at-bar-leader' });
        it.dot = s('circle', { class: 'at-bar-dot', r: 2.2, fill: p.color });
        it.cells = s('g', { class: 'at-bar-cells', fill: p.color });
        it.label = p.name ? s('text', { class: 'at-bar-label' }, p.name) : null;
        el.append(it.leader, it.dot, it.cells, ...(it.label ? [it.label] : []));
      } else {
        el.append(s('path', { class: 'at-sym-shape', d: shapePath(it.shape), fill: p.color, 'vector-effect': 'non-scaling-stroke' }));
      }
      it.el = el;
      root.append(el);
    }
    g.append(root);
  }
  function drawBar(it, project, view, base, anchor) {
    const m = barMetrics(it.f.properties.value, view.k);
    const key = `${r1(m.cell)}`;
    if (key !== it.key) { // 확대가 바뀌어 칸 크기가 바뀌었을 때만 다시 만든다
      it.key = key;
      const kids = [];
      const w = m.width;
      for (let i = 0; i < m.cells; i++) {
        const y = -(i + 1) * m.cell - i * m.gap;
        kids.push(s('rect', { class: 'at-bar-cell', x: r1(-w / 2), y: r1(y), width: r1(w), height: r1(m.cell) }));
      }
      // 사람 아이콘(머리 + 몸) — 막대 위
      const top = -m.height - m.gap, hr = m.cell * 0.42;
      kids.push(s('path', { class: 'at-bar-person', d: `M${r1(-w * 0.55)},${r1(top)}v${r1(-m.cell * 0.55)}q0,${r1(-m.cell * 0.55)} ${r1(w * 0.55)},${r1(-m.cell * 0.55)}q${r1(w * 0.55)},0 ${r1(w * 0.55)},${r1(m.cell * 0.55)}v${r1(m.cell * 0.55)}Z` }));
      kids.push(s('circle', { class: 'at-bar-person', cx: 0, cy: r1(top - m.cell * 1.1 - hr), r: r1(hr) }));
      it.cells.replaceChildren(...kids);
      it.h = m.height + m.gap + m.cell * 1.1 + 2 * hr;
      it.w = w;
      if (it.label) { setAttr(it.label, 'y', r1(m.cell * 1.1 + 4)); }
    }
    setAttr(it.cells, 'transform', `translate(${r1(base[0])},${r1(base[1])})`);
    if (it.label) { setAttr(it.label, 'x', r1(base[0])); setAttr(it.label, 'transform', `translate(0,${r1(base[1])})`); }
    // 막대 상자(맞히기·지시선)
    it.box = [base[0] - it.w / 2, base[1] - it.h, base[0] + it.w / 2, base[1] + (it.label ? 16 : 0)];
    if (anchor) {
      const bx = Math.max(it.box[0], Math.min(anchor[0], it.box[2])), by = Math.max(base[1] - it.h, Math.min(anchor[1], base[1]));
      setAttr(it.leader, 'd', `M${r1(anchor[0])},${r1(anchor[1])}L${r1(bx)},${r1(by)}`);
      setAttr(it.dot, 'cx', r1(anchor[0])); setAttr(it.dot, 'cy', r1(anchor[1]));
      setAttr(it.dot, 'display', null); setAttr(it.leader, 'display', null);
    } else {
      setAttr(it.dot, 'display', 'none'); setAttr(it.leader, 'display', 'none');
    }
  }

  const layer = {
    id, z, meta: metaOf(points), legendItems: legendList, features: feats,
    drawSvg(g, project, view) {
      if (!root || root.parentNode !== g) build(g);
      const W = view.width, H = view.height;
      for (const it of items) {
        const p = it.f.properties;
        const q = project(it.f.geometry.coordinates);
        let shown = !!q;
        if (it.shape === 'bar') {
          const base = p.barAt ? project(p.barAt) : q;
          shown = shown && !!base && base[0] > -80 && base[0] < W + 80 && base[1] > -40 && base[1] < H + 400;
          if (shown) drawBar(it, project, view, base, p.barAt ? q : null);
          it.xy = q;
        } else {
          shown = shown && q[0] > -20 && q[0] < W + 20 && q[1] > -20 && q[1] < H + 20;
          if (shown) {
            const r = symbolPx(sizeOf(it.f) || 3, view.k) / 2;
            it.r = r; it.xy = q;
            setAttr(it.el, 'transform', `translate(${r1(q[0])},${r1(q[1])}) scale(${r1(r * 10) / 10})`);
          }
        }
        if (!shown) it.xy = null;
        setAttr(it.el, 'display', shown ? null : 'none');
        const a = alphaOf(legend, p.cls, dimAlpha);
        setAttr(it.el, 'opacity', a === 1 ? null : a);
        it.el.classList.toggle('is-hover', it.f === hovered);
      }
    },
    hit(xy) {
      for (let i = items.length - 1; i >= 0; i--) {
        const it = items[i];
        if (!it.xy || alphaOf(legend, it.f.properties.cls, 0) === 0) continue;
        if (it.shape === 'bar') {
          const b = it.box;
          if (b && xy[0] >= b[0] - 2 && xy[0] <= b[2] + 2 && xy[1] >= b[1] - 2 && xy[1] <= b[3] + 2) return it.f;
          if (Math.hypot(xy[0] - it.xy[0], xy[1] - it.xy[1]) <= 5) return it.f;
        } else if (Math.hypot(xy[0] - it.xy[0], xy[1] - it.xy[1]) <= (it.r || 3) + 3) return it.f;
      }
      return null;
    },
    destroy() { offs.forEach((off) => off()); offs.length = 0; },
  };
  const offs = connect({
    map, legend, layerId,
    onHover: (f) => {
      const nf = f && byF.has(f) ? f : null;
      if (nf === hovered) return;
      if (hovered) byF.get(hovered).el?.classList.remove('is-hover');
      hovered = nf;
      if (hovered) byF.get(hovered).el?.classList.add('is-hover');
    },
  });
  return layer;
}

// ---------- 흐름선 ----------
/**
 * 흐름선 레이어(SVG). 선 하나 = <g class="at-flow"> 안에 흰 테두리 경로 + 색 경로(marker-end 화살촉). 자료 좌표 순서 = 꼬리 → 화살 끝
 * (수입 = 상대국 → 우리나라, 수출 = 우리나라 → 상대국). 날짜변경선에서 나뉜 조각(MultiLineString)은 경도를 이어 하나로 만든 뒤 화면 이음매에서만 끊는다.
 * 경로는 마디를 지나는 이차 베지어 곡선(quadPath, 두 점뿐이면 휘어진 베지어 하나). 굵기 = flowWidthPx(widthOf(f) pt, k).
 */
export function flowLayer(id, lines, { legend = null, map = null, layerId = id, widthOf = (f) => f.properties.width ?? 1, colorOf = (f) => f.properties.color, onPick = null, dimAlpha = 0.2, z = LAYER_Z.flow } = {}) {
  const feats = featuresOf(lines).filter(isLine);
  // 굵은 선을 먼저(아래), 가는 선이 위에 오게
  const items = feats.map((f) => ({
    f, geo: f.geometry.type === 'MultiLineString' ? joinParts(f.geometry.coordinates) : unwrapLine(f.geometry.coordinates),
    mid: `at-arrow-${++seq}`, runs: [], w: 0,
  })).sort((a, b) => widthOf(b.f) - widthOf(a.f));
  const byF = new Map(items.map((it) => [it.f, it]));
  let root = null, hovered = null;

  function build(g) {
    root = s('g', { class: 'at-flows' });
    const defs = s('defs');
    for (const it of items) {
      const color = colorOf(it.f);
      it.markerPath = s('path', { fill: color, class: 'at-flow-head' });
      it.marker = s('marker', { id: it.mid, markerUnits: 'userSpaceOnUse', orient: 'auto', refY: 0 }, it.markerPath);
      defs.append(it.marker);
      it.halo = s('path', { class: 'at-flow-halo' });
      it.line = s('path', { class: 'at-flow-line', stroke: color, 'marker-end': `url(#${it.mid})` });
      it.el = s('g', { class: 'at-flow', on: { click: (e) => { e.stopPropagation(); onPick?.(it.f, e); } } }, it.halo, it.line);
    }
    root.append(defs, ...items.map((it) => it.el));
    g.append(root);
  }
  const layer = {
    id, z, meta: metaOf(lines), legendItems: legendItems(lines), features: feats,
    drawSvg(g, project, view) {
      if (!root || root.parentNode !== g) build(g);
      for (const it of items) {
        const w = flowWidthPx(widthOf(it.f), view.k);
        if (w !== it.w) {
          it.w = w;
          const m = arrowMarker(w);
          setAttr(it.marker, 'markerWidth', m.len); setAttr(it.marker, 'markerHeight', 2 * m.half);
          setAttr(it.marker, 'viewBox', `0 ${-m.half} ${m.len} ${2 * m.half}`); setAttr(it.marker, 'refX', m.len);
          setAttr(it.markerPath, 'd', m.path);
          setAttr(it.line, 'stroke-width', r1(w)); setAttr(it.halo, 'stroke-width', r1(w + 2.4));
        }
        it.runs = splitJumps(it.geo, project);
        const d = it.runs.map((r) => quadPath(r)).join('') || null;
        setAttr(it.line, 'd', d); setAttr(it.halo, 'd', d);
        const a = alphaOf(legend, it.f.properties.cls, dimAlpha);
        setAttr(it.el, 'opacity', a === 1 ? null : a);
        it.el.classList.toggle('is-hover', it.f === hovered);
      }
    },
    hit(xy) {
      for (let i = items.length - 1; i >= 0; i--) {
        const it = items[i];
        if (alphaOf(legend, it.f.properties.cls, 0) === 0) continue;
        const tol = Math.max(4, it.w / 2 + 3);
        if (it.runs.some((r) => distToPolyline(xy, r) <= tol)) return it.f;
      }
      return null;
    },
    destroy() { offs.forEach((off) => off()); offs.length = 0; },
  };
  const offs = connect({
    map, legend, layerId,
    onHover: (f) => {
      const nf = f && byF.has(f) ? f : null;
      if (nf === hovered) return;
      if (hovered) byF.get(hovered).el?.classList.remove('is-hover');
      hovered = nf;
      if (hovered) byF.get(hovered).el?.classList.add('is-hover');
    },
  });
  return layer;
}

// ---------- 핀 ----------
const PIN_D = 'M0,0C-2.2,-5.2 -8,-8.8 -8,-15A8,8 0 1,1 8,-15C8,-8.8 2.2,-5.2 0,0Z'; // 물방울 핀, 끝 = (0,0), 머리 가운데 = (0,-15)
/**
 * 번호 핀 레이어(SVG). markers = [{id, lonlat, title, photo?, approx?, number?}] (topics.json markers). 번호 = numberOf(m, i)(기본 m.number ?? m.photo.pin ?? i + 1, null 이면 숨김).
 * 누르면 그 핀을 고르고(강조, 맨 위로) onPick(marker). layer.select(id | null), layer.selected().
 * hit 은 Feature 모양 {type:'Feature', properties:{label: title, id, approx}, geometry, marker} 를 돌려준다(말풍선은 properties.label).
 */
export function markerLayer(id, markers, { map = null, layerId = id, onPick = null, numberOf = (m, i) => m.number ?? m.photo?.pin ?? i + 1, z = LAYER_Z.marker } = {}) {
  const items = (markers || []).filter((m) => Array.isArray(m.lonlat)).map((m, i) => ({
    m, n: numberOf(m, i), xy: null, el: null,
    feature: { type: 'Feature', properties: { label: m.title ?? '', id: m.id, approx: !!m.approx }, geometry: { type: 'Point', coordinates: m.lonlat }, marker: m },
  }));
  const byFeature = new Map(items.map((it) => [it.feature, it]));
  let root = null, sel = null, hovered = null;
  function build(g) {
    root = s('g', { class: 'at-pins' });
    for (const it of items) {
      it.el = s('g', { class: 'at-pin', 'data-id': it.m.id, on: { click: (e) => { e.stopPropagation(); layer.select(it.m.id); onPick?.(it.m, e); } } },
        s('path', { class: 'at-pin-body', d: PIN_D }),
        s('circle', { class: 'at-pin-hole', cx: 0, cy: -15, r: 5.6 }),
        it.n != null ? s('text', { class: 'at-pin-num', x: 0, y: -15 }, String(it.n)) : null,
      );
      root.append(it.el);
    }
    g.append(root);
  }
  function select(mid) {
    sel = mid ?? null;
    for (const it of items) {
      const on = it.m.id === sel;
      it.el?.classList.toggle('is-selected', on);
      if (on && it.el && root) root.append(it.el); // 맨 위로
    }
  }
  const layer = {
    id, z, markers: items.map((it) => it.m),
    drawSvg(g, project, view) {
      if (!root || root.parentNode !== g) { build(g); select(sel); }
      for (const it of items) {
        const q = project(it.m.lonlat);
        const shown = !!q && q[0] > -20 && q[0] < view.width + 20 && q[1] > -10 && q[1] < view.height + 40;
        it.xy = shown ? q : null;
        setAttr(it.el, 'display', shown ? null : 'none');
        if (shown) setAttr(it.el, 'transform', `translate(${r1(q[0])},${r1(q[1])})${it.m.id === sel ? ' scale(1.25)' : ''}`);
        it.el.classList.toggle('is-hover', it.feature === hovered);
      }
    },
    hit(xy) {
      for (let i = items.length - 1; i >= 0; i--) {
        const it = items[i];
        if (!it.xy) continue;
        const sc = it.m.id === sel ? 1.25 : 1;
        if (Math.hypot(xy[0] - it.xy[0], xy[1] - (it.xy[1] - 15 * sc)) <= 9 * sc || (Math.abs(xy[0] - it.xy[0]) <= 4 && xy[1] <= it.xy[1] && xy[1] >= it.xy[1] - 15 * sc)) return it.feature;
      }
      return null;
    },
    select(mid) { select(mid); if (map && !map.destroyed) map.refreshLayer(layerId); },
    selected: () => sel,
    destroy() { offs.forEach((off) => off()); offs.length = 0; },
  };
  const offs = connect({
    map, layerId,
    onHover: (f) => {
      const nf = f && byFeature.has(f) ? f : null;
      if (nf === hovered) return;
      if (hovered) byFeature.get(hovered).el?.classList.remove('is-hover');
      hovered = nf;
      if (hovered) byFeature.get(hovered).el?.classList.add('is-hover');
    },
  });
  return layer;
}

// ---------- 이미지(교과서 투영 → 화면 투영) ----------
const images = new Map();
/**
 * 이미지 RGBA 불러오기(같은 주소는 한 번). 실패(주소·교차 출처로 픽셀을 못 읽음)면 null + 콘솔 경고 한 줄(다음 호출에서 다시 시도).
 * relief.js loadRelief 와 같은 방식(new Image + crossOrigin), 색 채널을 모두 남긴다.
 */
export function loadImageData(url) {
  if (images.has(url)) return images.get(url);
  const p = new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    const fail = (why) => { images.delete(url); console.warn(`이미지 레이어 생략(${why}): ${url}`); resolve(null); };
    img.addEventListener('error', () => fail('불러오기 실패 — 주소 또는 교차 출처 허용(CORS) 헤더 확인'), { once: true });
    img.addEventListener('load', () => {
      try {
        const w = img.naturalWidth, hh = img.naturalHeight;
        if (!w || !hh) throw new Error('빈 이미지');
        const c = h('canvas'); c.width = w; c.height = hh;
        const cx = c.getContext('2d', { willReadFrequently: true });
        cx.drawImage(img, 0, 0);
        const data = cx.getImageData(0, 0, w, hh).data; // 교차 출처로 막히면 SecurityError
        c.width = c.height = 0;
        resolve({ width: w, height: hh, data });
      } catch (err) {
        fail(err?.name === 'SecurityError' ? '교차 출처로 픽셀을 읽을 수 없음' : err?.message || String(err));
      }
    }, { once: true });
    img.src = url;
  });
  images.set(url, p);
  return p;
}

/**
 * 이미지 레이어(캔버스). 교과서 지도 투영으로 그려진 래스터(밀도 음영 PNG, overlay-*.json)를 화면에 맞춰 다시 그린다:
 * 화면 step px 격자 → invertGrid(relief.js, 화면 투영 invert·되돌림 검사) → 경위도 → makeFitForward(fit) → 지면 pt → 이미지 화소(가까운 화소)
 * (투영식은 4표본 마디만 정확히, 칸 안은 보간 — mapGridBlocks).
 * 1/step 크기 ImageData 를 오프스크린 캔버스에 넣고 drawImage 로 키워(부드럽게) opacity 로 얹는다. 범례 legend(분류 'd1'… = 범례 순서)가 한 단계만
 * 고르면 다른 단계 화소는 dimAlpha 로 흐리게(불러올 때 화소마다 가장 가까운 범례 색을 미리 정함). 불러오기 실패면 아무것도 안 그린다(layer.failed).
 * 불러오면 map.refreshLayer(layerId)(map 이 없으면 onLoad()).
 */
export function imageLayer(id, { url, fit, bbox, width, height, bounds = null, legend: legendSpec = null, opacity = 0.85, step = 2 } = {},
  { legend = null, map = null, layerId = id, dimAlpha = 0.15, onLoad = null, z = LAYER_Z.image, load = loadImageData } = {}) {
  if (!url || !fit || !bbox) throw new Error(`imageLayer ${id}: url·fit·bbox 필요`);
  const fwd = makeFitForward(fit);
  const palette = (legendSpec || []).map((e) => parseHex(e.color));
  const items = legendItems({ legend: legendSpec || [] });
  let img = null, cls = null, off = null, offCtx = null;
  const stats = [];
  const layer = {
    id, z, meta: { url, approx: false }, legendItems: items, stats, failed: false, loaded: false,
    draw(ctx, path, view) {
      if (!img || !view?.width || !view?.height) return;
      const rect = view.geoRect; // 화면 경위도 상자가 이미지 위도 범위와 안 겹치면 건너뜀
      if (rect && bounds && (rect[1] > bounds[3] || rect[3] < bounds[1])) return;
      const t0 = performance.now();
      const proj = view.projection;
      const grid = invertGrid((p) => proj.invert(p), view.width, view.height, { step, forward: (ll) => proj(ll) });
      if (!off) { off = h('canvas'); offCtx = off.getContext('2d'); }
      if (off.width !== grid.cols || off.height !== grid.rows) { off.width = grid.cols; off.height = grid.rows; }
      const out = offCtx.createImageData(grid.cols, grid.rows);
      const o = out.data, { data, width: iw, height: ih } = img;
      const sel = legend?.selected?.() ?? null;
      const selIdx = sel ? items.findIndex((e) => e.cls === sel) : -1;
      // 표본마다 이미지 화소 좌표: 교과서 투영식은 매끄러우므로 4표본 마디만 정확히, 칸 안은 보간(mapGridBlocks)
      const bw = bbox[2] - bbox[0], bh = bbox[3] - bbox[1];
      const toIdx = (ll) => { const pt = fwd(ll); return pt ? [((pt[0] - bbox[0]) / bw) * iw - 0.5, ((pt[1] - bbox[1]) / bh) * ih - 0.5] : null; };
      const ix = mapGridBlocks(grid, toIdx, { block: 4, tol: 0.3 });
      for (let k = 0, q = 0; k < grid.lon.length; k++, q += 4) {
        const fx = ix.x[k];
        if (Number.isNaN(fx)) continue;
        const x = Math.round(fx), y = Math.round(ix.y[k]);
        if (x < 0 || y < 0 || x >= iw || y >= ih) continue;
        const pi = y * iw + x, s4 = pi * 4;
        const a = data[s4 + 3];
        if (!a) continue;
        o[q] = data[s4]; o[q + 1] = data[s4 + 1]; o[q + 2] = data[s4 + 2];
        o[q + 3] = selIdx >= 0 && cls && cls[pi] !== selIdx ? a * dimAlpha : a;
      }
      offCtx.putImageData(out, 0, 0);
      ctx.globalAlpha = opacity;
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(off, 0, 0, grid.cols * step, grid.rows * step);
      stats.push(performance.now() - t0); if (stats.length > 60) stats.shift();
    },
    /** 화면 자리의 단계(범례 항목) → Feature 모양 {properties:{label, cls}} | null */
    hit(xy, lonlat) {
      if (!img || !lonlat) return null;
      const pt = fwd(lonlat), ix = pt && imageIndex(pt, bbox, img.width, img.height);
      if (!ix) return null;
      const x = Math.round(ix[0]), y = Math.round(ix[1]);
      if (x < 0 || y < 0 || x >= img.width || y >= img.height) return null;
      const pi = y * img.width + x;
      if (img.data[pi * 4 + 3] < 128 || !cls) return null;
      const e = items[cls[pi]];
      if (!e || alphaOf(legend, e.cls, 0) === 0) return null;
      return { type: 'Feature', properties: { label: e.label, cls: e.cls, color: e.color }, geometry: null };
    },
    destroy() { destroyed = true; offs.forEach((f) => f()); offs.length = 0; },
  };
  let destroyed = false;
  const offs = connect({ map, legend, layerId });
  Promise.resolve().then(() => load(url)).catch((err) => { console.warn(`이미지 레이어 생략(${err?.message || err}): ${url}`); return null; }).then((r) => {
    if (destroyed) return;
    if (!r) { layer.failed = true; return; }
    img = r;
    if (palette.length) { // 화소마다 가장 가까운 범례 단계(흐리게·맞히기용)
      cls = new Uint8Array(r.width * r.height);
      for (let i = 0, j = 0; i < cls.length; i++, j += 4) cls[i] = r.data[j + 3] ? nearestColor([r.data[j], r.data[j + 1], r.data[j + 2]], palette) : 0;
    }
    layer.loaded = true;
    if (map && !map.destroyed) map.refreshLayer(layerId); else onLoad?.();
  });
  return layer;
}

// ---------- 묶음 ----------
/**
 * 여러 레이어를 한 id 로 묶는다(렌더러에는 하나): draw 는 부분마다 save/restore, drawSvg 는 부분마다 자기 <g class="at-part">,
 * hit 은 뒤(위) 부분부터, destroy 는 모두. z = 가장 작은 부분 z(캔버스 부분이 면이면 z < 50 규칙을 따름).
 */
export function combineLayers(id, parts, { z = Math.min(...parts.map((p) => p.z ?? 0)) } = {}) {
  const drawParts = parts.filter((p) => typeof p.draw === 'function');
  const svgParts = parts.filter((p) => typeof p.drawSvg === 'function');
  const subs = new Map();
  const layer = {
    id, z, parts,
    hit(xy, lonlat) { for (let i = parts.length - 1; i >= 0; i--) { const f = parts[i].hit?.(xy, lonlat); if (f) return f; } return null; },
    destroy() { parts.forEach((p) => p.destroy?.()); },
  };
  if (drawParts.length) layer.draw = (ctx, path, view) => { for (const p of drawParts) { ctx.save(); try { p.draw(ctx, path, view); } finally { ctx.restore(); } } };
  if (svgParts.length) {
    layer.drawSvg = (g, project, view) => {
      for (const p of svgParts) {
        let sg = subs.get(p);
        if (!sg || sg.parentNode !== g) { sg = s('g', { class: 'at-part' }); g.append(sg); subs.set(p, sg); }
        p.drawSvg(sg, project, view);
      }
    };
  }
  return layer;
}

// ---------- topics.json 항목 → 레이어 ----------
/**
 * topics.json 레이어 항목 {ref, type, legend?, label, legendTitle?, lineLegendTitle?, credit?, note?, approx?, approxNote?, group?} → 레이어 하나(id = ref).
 *   data = 그 레이어 자료(JSON) 또는 layers.js 묶음({ref: 자료}).
 *   type: 'area' → areaLayer, 'symbol' → symbolLayer, 'flow' → combineLayers(면 areaLayer + 흐름선 flowLayer), 'image' → imageLayer.
 *   legend 를 안 주면 범례 항목이 있을 때 새 legendState 를 만든다(layer.legend). layer.legendItems = 화면 범례 항목,
 *   layer.meta = {ref, type, title, legendTitle, lineLegendTitle, credit, note, group, page, approx, approxNote, approxReason}.
 *   그 밖의 옵션(extra)은 이미지 레이어 옵션으로 넘긴다(dimAlpha·onLoad·load).
 */
export function layerFromRef(ref, data, { legend = undefined, map = null, onPick = null, ...extra } = {}) {
  const d = data && data[ref.ref] ? data[ref.ref] : data;
  if (!d) throw new Error(`layerFromRef: 자료 없음 ${ref.ref}`);
  const items = legendItems(d);
  const lg = legend !== undefined ? legend : (ref.legend !== false && items.length ? createLegendState(items.map((e) => e.cls)) : null);
  const common = { legend: lg, map, layerId: ref.ref };
  let layer;
  switch (ref.type) {
    case 'area': layer = areaLayer(ref.ref, d, common); break;
    case 'symbol': layer = symbolLayer(ref.ref, d, { ...common, onPick }); break;
    case 'flow': {
      const area = { ...d, features: d.features.filter((f) => f.properties.type !== 'flow') };
      const flow = { ...d, features: d.features.filter((f) => f.properties.type === 'flow') };
      layer = combineLayers(ref.ref, [areaLayer(`${ref.ref}:area`, area, common), flowLayer(`${ref.ref}:flow`, flow, { ...common, onPick })]);
      break;
    }
    case 'image': layer = imageLayer(ref.ref, d, { ...extra, ...common }); break;
    default: throw new Error(`layerFromRef: 모르는 레이어 종류 ${ref.type} (${ref.ref})`);
  }
  const props = d.properties || {};
  const approx = !!(ref.approx ?? props.approx);
  layer.legend = lg;
  layer.legendItems = items;
  layer.meta = {
    ref: ref.ref, type: ref.type, title: ref.label ?? props.title, legendTitle: ref.legendTitle, lineLegendTitle: ref.lineLegendTitle,
    credit: ref.credit, note: ref.note ?? props.note, group: ref.group, page: props.page ?? d.page,
    approx, approxNote: approx ? (ref.approxNote ?? '위치 근사') : undefined, approxReason: approx ? (ref.approxReason ?? props.approxReason) : undefined,
  };
  return layer;
}
