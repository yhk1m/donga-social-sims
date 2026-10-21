// © 2026 김용현
// src/atlas/layers.js — 주제 레이어 종류. 모두 렌더러(renderer.js) 레이어 계약 {id, z, draw?, drawSvg?, hit?, destroy?} 을 돌려준다.
//
//   areaLayer(id, geojson, { legend, map, colorOf, dimAlpha = 0.15, fillOpacity = 0.85 })   캔버스 면(+ 같은 자료의 선: 등온선·국경 주장선·정전 라인, 빗금 면)
//   symbolLayer(id, points, { legend, map, iconOf, sizeOf, onPick })                         SVG 기호(선 모양·원·네모·마름모·세모, 인구 막대)
//   flowLayer(id, lines, { legend, map, widthOf, colorOf })                                   SVG 흐름선(이차 베지어 곡선 + 경로 화살촉)
//   markerLayer(id, markers, { map, onPick, numberOf })                                       SVG 번호 핀. layer.select(id | null)
//   imageLayer·loadImageData 는 imageLayer.js(여기서 다시 내보냄), combineLayers·layerFromRef 는 layerRef.js.
//
// 지도와의 연결(옵션 map): 레이어가 스스로 구독한다 — legend.onChange → map.refreshLayer(layerId), map.on('hover') → 자기 도형이면 강조.
//   map 을 안 주면 구독하지 않는다(부르는 쪽이 refreshLayer 를 부름). destroy() 가 구독을 모두 푼다(렌더러가 removeLayer·clearLayers 때 부름).
//   layerId = 렌더러에 올린 id(기본 = id). combineLayers 의 부분 레이어는 부모 id 로 다시 그리고 hover 를 받는다.
// 강조(hover): 렌더러 hover 이벤트의 feature 가 자기 것이면 SVG 로 테두리를 굵게(면 = 그 분류 전체 윤곽, 선·기호 = 굵은 테두리). 움직이는 동안은 숨김.
// 범례(legendState): 고르지 않은 분류는 흐리게(면 dimAlpha, 기호·선 dimAlpha 조금 더 짙게). hit 은 흐린 분류를 맞히지 않는다.
//   면 레이어는 분류를 고르면 고른 면의 바깥 윤곽을 검은 선(SELECT_OUTLINE, 화면 1.8px)으로 긋는다.
// layer.meta = 자료 맨 위 properties(+ layerFromRef 가 주제 항목 값), layer.meta.approx = 「위치 근사」 표시 여부. layer.legendItems = 화면 범례 항목.
//
// 규칙(EMBED_RULES.md): DOM 은 h()/s() 로만, 빗금은 오프스크린 캔버스 createPattern(data: 주소 없음).
// 문서 전역 id(id=·url(#…))를 쓰지 않는다 — 화살촉도 marker 가 아니라 같은 <g> 안 경로(같은 조각을 한 쪽에 여러 번 붙여도 겹치지 않게).
import { geoPath, geoContains, geoBounds } from 'd3-geo';
import { h, s } from '../shared/dom.js';
import { indexGeometry, clipIndexed } from './geoClip.js';
import {
  alphaOf, symbolPx, classSymbolPx, flowWidthPx, lineWidthPx, barMetrics, quadPath, arrowSize, endTangent, arrowHead, trimRunEnd, joinParts, unwrapLine,
  splitJumps, distToPolyline, lineLabelAt, shapePath, legendItems, valueBoxSize, placeValueBoxes, valueIconPath,
} from './layerStyle.js';
import { LAYER_Z, round1, round2, featuresOf, isPoly, isLine, metaOf, setAttr, connect, hoverClass } from './layerCommon.js';

export { LAYER_Z } from './layerCommon.js';
export { imageLayer, loadImageData } from './imageLayer.js';

const HALO = 'rgba(255,255,255,.9)';
/**
 * 범례에서 고른 분류의 윤곽(교사 요청 2026-10-20 — 「고른 지역을 검은 약간 두꺼운 줄로」): 색·화면 굵기(px, 확대와 상관없이 일정).
 * 고른 면들을 합친 바깥 경계만 긋는다 — 화면 사각형 + 고른 면을 evenodd 로 잘라(고른 면 바깥만 남김) 2배 굵기로 그으면 바깥 절반만 보이고,
 * 같은 분류·같은 묶음의 이웃 면 사이 경계는 양쪽 다 안쪽이라 지워진다(합치기 계산 없이 그릴 때 한 번).
 */
export const SELECT_OUTLINE = Object.freeze({ color: '#111111', px: 1.8 });
/**
 * 윤곽만 분류(범례 항목 style 'outline' — 32쪽 유로 사용국 노란 테두리): 면을 칠하지 않고 교과서 색 테두리만(화면 px, 확대와 상관없이 일정).
 * 범례에서 그 분류를 고르면 굵게(selected). 채움 분류·선택 윤곽 다음에 그어 다른 면에 가리지 않는다.
 */
export const OUTLINE_STYLE = Object.freeze({ px: 1.6, selectedPx: 2.4 });
const LINE_PT = { isotherm: 0.8, line: 1.2 }; // 주제도 선 기본 굵기(pt) — lineWidthPx 로 화면 px
const LABEL_FONT = '700 10px "Pretendard", "Malgun Gothic", sans-serif';
/** 면 레이어 지명 글자 크기(px): 교과서 pt × 역할 배율 — 나라(분홍 6.7pt)·「카 슈 미 르」는 크게, 관할 이름(4.8pt)은 작게 */
export const labelPx = (p) => Math.round(Math.min(22, Math.max(10, (p.size || 6) * ({ name: 2.7, country: 2.2, region: 2.4 }[p.role] ?? 2.2))));

// ---------- 빗금(고산 기후) ----------
/** 빗금 고리(U5-3h): 단원 등록(americasExtra)이 make(ctx, f) → 무늬|null 을 걸면 그것 먼저 — 없거나 null 이면 아래 45° 타일 */
export const hatchHook = { make: () => null };
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

/** 무늬 타일(오프스크린 캔버스, 색별 캐시) — 줄무늬·점무늬(U4-3a·b). draw(c, size) 로 한 번 그린다. */
const tiles = new Map();
function tilePattern(ctx, key, size, draw) {
  let tile = tiles.get(key);
  if (!tile) { tile = h('canvas'); tile.width = tile.height = size; draw(tile.getContext('2d'), size); tiles.set(key, tile); }
  return ctx.createPattern(tile, 'repeat');
}
/** 사선(45°) 줄무늬 — 색 차례대로 줄 폭 화면 약 4px(타일 6px × 색 수, x + y 방향 띠) */
const stripePattern = (ctx, colors) => tilePattern(ctx, `s:${colors.join(',')}`, 6 * colors.length, (c, T) => {
  for (let k = 0; k < 2 * colors.length; k++) {
    const x = k * 6;
    c.fillStyle = colors[k % colors.length];
    c.beginPath(); c.moveTo(x, 0); c.lineTo(x + 6, 0); c.lineTo(x + 6 - T, T); c.lineTo(x - T, T); c.closePath(); c.fill();
  }
});
/** 점무늬(사하라 사막) — 간격 6px, 지름 1.6px, 교과서 색 */
const dotPattern = (ctx, color) => tilePattern(ctx, `d:${color}`, 6, (c) => { c.fillStyle = color; c.beginPath(); c.arc(3, 3, 0.8, 0, 2 * Math.PI); c.fill(); });

// ---------- 면 ----------
/**
 * 면 레이어(캔버스). 같은 자료의 선(등온선 type 'isotherm' — 값 글자 포함, 카슈미르 주장 국경·정전 라인 type 'line', dashed)은 흰 테두리 선으로,
 * pattern 'hatch' 면은 빗금으로 그린다. geometry:false 범례 항목은 그릴 것이 없다(범례에만).
 * pattern 'stripes'(줄무늬 나라 — colors·clsList)·'dots'(점무늬 면) 는 채움 다음·빗금 앞에 무늬로(U4-3a·b — 그런 면이 없으면 그리는 길 그대로).
 * 범례 style 'outline' 분류의 면은 채우지 않고 테두리만(OUTLINE_STYLE) — 다른 분류 면과 겹쳐도 된다(유로 사용국 = 가입국 위 테두리).
 *   맞히기는 테두리 근처(화면 거리)만, 검은 선택 윤곽에는 넣지 않는다(고르면 자기 테두리가 굵어짐).
 */
export function areaLayer(id, geojson, { legend = null, map = null, layerId = id, legendRefresh = true, colorOf = (f) => f.properties.color, dimAlpha = 0.15, fillOpacity = 0.85, z = LAYER_Z.area } = {}) {
  const feats = featuresOf(geojson);
  const legendList = legendItems(geojson);
  const dashed = new Set(legendList.filter((e) => e.dashed).map((e) => e.cls));
  const outlineCls = new Set(legendList.filter((e) => e.style === 'outline').map((e) => e.cls));
  // type 'locator' 면(카슈미르 위치도 강조)은 큰 지도에 그리지 않는다 — topic.js 위치도가 쓴다(layer.locator)
  const areas = feats.filter((f) => isPoly(f) && !f.properties.pattern && f.properties.type !== 'locator' && !outlineCls.has(f.properties.cls));
  const outlines = feats.filter((f) => isPoly(f) && outlineCls.has(f.properties.cls));
  const hatches = feats.filter((f) => isPoly(f) && f.properties.pattern === 'hatch');
  // 줄무늬 나라(pattern 'stripes', properties.colors·clsList — countryClass multiFill)·점무늬 면(pattern 'dots'): 채움 다음, 빗금 앞
  const stripes = feats.filter((f) => isPoly(f) && f.properties.pattern === 'stripes');
  const dots = feats.filter((f) => isPoly(f) && f.properties.pattern === 'dots');
  /** 범례 투명도 — 줄무늬 나라는 분류 중 하나라도 고르면 그대로(clsList) */
  const aOf = (f, dim) => (f.properties.clsList ? Math.max(...f.properties.clsList.map((c) => alphaOf(legend, c, dim))) : alphaOf(legend, f.properties.cls, dim));
  const lines = feats.filter(isLine);
  // 지명(Point {type:'label', text, lines?, size(pt), color, role}) — 카슈미르 「카 슈 미 르」·관할 이름·나라 이름(교과서 글자 자리를 옮긴 것)
  const labels = feats.filter((f) => f.geometry?.type === 'Point' && f.properties.type === 'label');
  let labelBoxes = []; // 마지막 그림의 지명 상자(화면 px) — 바탕 지명이 피함
  const polys = [...areas, ...stripes, ...dots, ...hatches]; // 맞히기 순서(위에 그린 것부터 거꾸로)
  const own = new Set(feats);
  const cache = new Map(); // f → {idx, bounds}
  const info = (f) => { let c = cache.get(f); if (!c) { c = { idx: indexGeometry(f.geometry), bounds: null }; cache.set(f, c); } return c; };
  const clip = (f, rect) => clipIndexed(info(f).idx, rect);
  let lastView = null; // 마지막 캔버스 그림의 view(맞히기·강조용)
  const lineRuns = new Map(); // 선 f → 화면 조각들(마지막 그림) — 윤곽만 분류의 테두리도 여기(맞히기)
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

  /** 지명 글자: 흰 테두리 굵은 글자, 크기 = 교과서 pt × 역할 배율(나라·이름은 크게), 여러 줄이면 가운데 맞춰 쌓음. 범례와 상관없이 그대로. */
  function drawPointLabels(ctx, view) {
    labelBoxes = [];
    if (!labels.length) return;
    const proj = view.projection;
    ctx.setLineDash([]); ctx.globalAlpha = 1; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    for (const f of labels) {
      const q = proj(f.geometry.coordinates);
      if (!q || !Number.isFinite(q[0])) continue;
      const p = f.properties;
      const px = labelPx(p);
      const lines = p.lines?.length ? p.lines : [p.text];
      ctx.font = `${p.role === 'region' ? 600 : 800} ${px}px "Pretendard", "Malgun Gothic", sans-serif`;
      const lh = px * 1.15, top = q[1] - ((lines.length - 1) * lh) / 2;
      let wMax = 0;
      lines.forEach((t, i) => {
        const y = top + i * lh;
        ctx.strokeStyle = HALO; ctx.lineWidth = Math.max(2.5, px * 0.28); ctx.strokeText(t, q[0], y);
        ctx.fillStyle = p.color || '#231f20'; ctx.fillText(t, q[0], y);
        wMax = Math.max(wMax, ctx.measureText ? ctx.measureText(t).width || t.length * px : t.length * px);
      });
      labelBoxes.push([q[0] - wMax / 2 - 2, top - lh / 2, q[0] + wMax / 2 + 2, top + (lines.length - 0.5) * lh]);
    }
  }

  /** 윤곽만 분류: 교과서 색 테두리(고르면 굵게), 흐린 분류는 투명도. 맞히기용 화면 조각을 lineRuns 에 둔다. */
  function drawOutlines(ctx, path, view) {
    if (!outlines.length) return;
    const picked = legend?.selected?.() != null;
    const proj = view.projection;
    const toScreen = (ll) => { const q = proj(ll); return q && Number.isFinite(q[0]) ? q : null; };
    ctx.setLineDash([]); ctx.lineJoin = 'round';
    for (const f of outlines) {
      const a = alphaOf(legend, f.properties.cls, dimAlpha);
      const w = picked && a === 1 ? OUTLINE_STYLE.selectedPx : OUTLINE_STYLE.px;
      const g = clip(f, view.geoRect);
      ctx.globalAlpha = a;
      ctx.beginPath(); path(g);
      ctx.strokeStyle = colorOf(f); ctx.lineWidth = w; ctx.stroke();
      const polys = g?.type === 'Polygon' ? [g.coordinates] : g?.type === 'MultiPolygon' ? g.coordinates : [];
      const runs = [];
      for (const P of polys) for (const R of P) runs.push(...splitJumps(unwrapLine(R), toScreen));
      lineRuns.set(f, { runs, w });
    }
  }

  /** 범례에서 고른 분류(한 분류 또는 묶음)가 있으면 그 면들의 바깥 윤곽(SELECT_OUTLINE). 전체 보기·선 분류만 고름이면 그리지 않는다. */
  function drawSelection(ctx, path, view) {
    if (!legend || legend.selected?.() == null) return;
    const sel = polys.filter((f) => aOf(f, 0) === 1);
    if (!sel.length) return;
    const geoms = sel.map((f) => clip(f, view.geoRect));
    ctx.save();
    ctx.globalAlpha = 1; ctx.setLineDash([]);
    ctx.beginPath();
    ctx.rect(-SELECT_OUTLINE.px * 4, -SELECT_OUTLINE.px * 4, view.width + SELECT_OUTLINE.px * 8, view.height + SELECT_OUTLINE.px * 8);
    for (const g of geoms) path(g);
    ctx.clip('evenodd');
    ctx.beginPath();
    for (const g of geoms) path(g);
    ctx.strokeStyle = SELECT_OUTLINE.color; ctx.lineWidth = SELECT_OUTLINE.px * 2; ctx.lineJoin = 'round';
    ctx.stroke();
    ctx.restore();
  }

  const layer = {
    id, z, meta: metaOf(geojson), legendItems: legendList, features: feats,
    /** 위치도 강조 면(type 'locator', 카슈미르) — 없으면 null */
    locator: feats.find((f) => isPoly(f) && f.properties.type === 'locator') || null,
    /** 지명 자리 피하기: 그린 지명 글자 상자 */
    labelObstacles: () => labelBoxes.map((b) => [...b]),
    draw(ctx, path, view) {
      lastView = view;
      const rect = view.geoRect;
      for (const f of areas) {
        ctx.globalAlpha = fillOpacity * alphaOf(legend, f.properties.cls, dimAlpha);
        ctx.fillStyle = colorOf(f);
        ctx.beginPath(); path(clip(f, rect)); ctx.fill();
      }
      for (const f of stripes) {
        ctx.globalAlpha = fillOpacity * aOf(f, dimAlpha);
        ctx.fillStyle = stripePattern(ctx, f.properties.colors) || colorOf(f);
        ctx.beginPath(); path(clip(f, rect)); ctx.fill();
      }
      for (const f of dots) {
        ctx.globalAlpha = alphaOf(legend, f.properties.cls, dimAlpha);
        ctx.fillStyle = dotPattern(ctx, colorOf(f)) || colorOf(f);
        ctx.beginPath(); path(clip(f, rect)); ctx.fill();
      }
      for (const f of hatches) {
        const g = clip(f, rect);
        ctx.globalAlpha = alphaOf(legend, f.properties.cls, dimAlpha);
        ctx.fillStyle = hatchHook.make(ctx, f) || hatchPattern(ctx, colorOf(f)) || colorOf(f);
        ctx.beginPath(); path(g); ctx.fill();
        ctx.strokeStyle = colorOf(f); ctx.lineWidth = 0.6; ctx.globalAlpha *= 0.7; ctx.stroke();
      }
      drawSelection(ctx, path, view);
      lineRuns.clear();
      drawOutlines(ctx, path, view);
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      for (const f of lines) drawLine(ctx, path, f, view, alphaOf(legend, f.properties.cls, dimAlpha));
      drawIsoLabels(ctx, view);
      drawPointLabels(ctx, view);
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
      for (let i = outlines.length - 1; i >= 0; i--) { // 윤곽만 분류는 테두리 근처만
        const f = outlines[i];
        if (alphaOf(legend, f.properties.cls, 0) === 0) continue;
        const lr = lineRuns.get(f);
        if (lr && lr.runs.some((r) => distToPolyline(xy, r) <= Math.max(4, lr.w / 2 + 3))) return f;
      }
      for (let i = polys.length - 1; i >= 0; i--) {
        const f = polys[i];
        if (aOf(f, 0) === 0) continue;
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
    // 흐린 분류(범례에서 다른 분류를 고름)는 강조하지 않는다
    if (!hovered || !view || view.moving || !view.projection || aOf(hovered, 0) === 0) { setAttr(hoverEl, 'd', null); return; }
    const geom = clip(hovered, view.geoRect);
    hoverEl.setAttribute('class', `at-hover ${isLine(hovered) ? 'at-hover-line' : 'at-hover-area'}`);
    setAttr(hoverEl, 'd', geoPath(view.projection)(geom) || null);
  }
  const offs = connect({
    map, legend, layerId, legendRefresh,
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
 * 누르면 onPick(feature). 크기 = symbolPx(properties.size pt, k) — 크기 단계 기호(properties.sizeBy 'class')는 classSymbolPx(단계 비 유지).
 * 같은 레이어 객체를 다른 <g> 에 다시 그리면(렌더러에 다시 올림) 요소와 캐시(칸 크기 등)를 모두 새로 만든다.
 * 값 붙은 기호(properties.values [{icon, text}] — 31쪽 리스본 「충전소 아이콘 5.47 / 사람 아이콘 39.8」): 기호 옆 흰 상자에 줄마다 아이콘 + 값.
 *   상자 자리는 placeValueBoxes(기호 원·앞 상자를 피해 오른쪽 → 왼쪽 → 대각선 → 위·아래), 상자도 맞히기·지명 피하기(labelObstacles)에 든다.
 */
export function symbolLayer(id, points, { legend = null, map = null, layerId = id, legendRefresh = true, iconOf = null, sizeOf = (f) => f.properties.size, onPick = null, dimAlpha = 0.2, z = LAYER_Z.symbol } = {}) {
  const feats = featuresOf(points).filter((f) => f.geometry?.type === 'Point');
  const legendList = legendItems(points);
  const shapeOf = iconOf || defaultIconOf(legendList);
  // 레이어별 크기(자료 properties.symbolStyle {pxPerPt, minPx, maxPx} — 24쪽 자원처럼 작은 기호를 키울 때)·분류별 테두리(범례 항목 stroke)
  const symStyle = metaOf(points).symbolStyle || {};
  const sizeOpts = { ...(symStyle.pxPerPt ? { pxPerPt: symStyle.pxPerPt } : {}), ...(symStyle.minPx ? { min: symStyle.minPx } : {}), ...(symStyle.maxPx ? { max: symStyle.maxPx } : {}) };
  const strokeOf = new Map(legendList.filter((e) => e.stroke).map((e) => [e.cls, e.stroke]));
  // 크기 단계 기호(자료 properties.sizeBy 'class' — 범례 항목 size pt): 단계 전체에 배율 하나(classSymbolPx)라 확대해도 지름 비가 그대로
  const classSizes = metaOf(points).sizeBy === 'class' ? legendList.map((e) => e.size).filter((v) => v > 0) : null;
  const diameter = (f, k) => (classSizes?.length ? classSymbolPx(sizeOf(f) || classSizes[0], k, classSizes, sizeOpts) : symbolPx(sizeOf(f) || 3, k, sizeOpts));
  const items = feats.map((f) => ({ f, shape: shapeOf(f) }));
  const byF = new Map(items.map((it) => [it.f, it]));
  const VALUE_FS = 10;
  // 이름 줄(자료 properties.nameInBox — 31쪽 리스본·녹색 수도): 상자 맨 위에 기호 이름(값이 없으면 이름만 든 상자). 없으면 1단계 그대로
  const nameInBox = !!metaOf(points).nameInBox;
  for (const it of items) {
    const p = it.f.properties, title = nameInBox ? (p.name ?? null) : null;
    if (p.values?.length || title != null) it.vsize = valueBoxSize(p.values, { fs: VALUE_FS, ...(title != null ? { title } : {}) });
  }
  let root = null;

  /** 값 상자 요소(흰 바탕 + 줄마다 아이콘·값) — 자리는 drawSvg 가 translate 로 */
  function valueBox(it) {
    const { w, h: hh, rows, title } = it.vsize, pad = 3, sc = VALUE_FS / 10;
    const kids = [s('rect', { class: 'at-sym-vbox', x: 0, y: 0, width: round1(w), height: round1(hh), rx: 1.5 })];
    const top = title != null ? 1 : 0;
    if (top) kids.push(s('text', { class: 'at-sym-vname', x: pad, y: round1(pad + VALUE_FS * 0.85) }, title));
    rows.forEach((r, i0) => {
      const i = i0 + top, y = pad + i * (VALUE_FS + 1);
      kids.push(s('path', { class: `at-sym-vicon at-sym-vicon-${r.icon || 'x'}`, d: valueIconPath(r.icon), transform: `translate(${pad},${round1(y)}) scale(${sc})` }));
      kids.push(s('text', { class: 'at-sym-vtext', x: round1(pad + VALUE_FS + 2), y: round1(y + VALUE_FS * 0.85) }, r.text));
    });
    return s('g', { class: 'at-sym-values', on: { click: (e) => { e.stopPropagation(); onPick?.(it.f, e); } } }, kids);
  }

  function build(g) {
    root = s('g', { class: 'at-symbols' });
    for (const it of items) {
      // 캐시 초기화(새 요소에 맞춰 다시 계산)
      Object.assign(it, { el: null, xy: null, box: null, base: null, labelY: 0, r: 0, key: '', h: 0, w: 0, leader: null, dot: null, cells: null, label: null });
      const p = it.f.properties;
      const el = s('g', { class: `at-sym-item at-sym-${it.shape}`, on: { click: (e) => { e.stopPropagation(); onPick?.(it.f, e); } } });
      if (it.shape === 'bar') {
        it.leader = s('path', { class: 'at-bar-leader' });
        it.dot = s('circle', { class: 'at-bar-dot', r: 2.2, fill: p.color });
        it.cells = s('g', { class: 'at-bar-cells', fill: p.color });
        it.label = p.name ? s('text', { class: 'at-bar-label' }, p.name) : null;
        el.append(it.leader, it.dot, it.cells, ...(it.label ? [it.label] : []));
      } else {
        const shape = s('path', { class: `at-sym-shape${strokeOf.has(p.cls) ? ' has-stroke' : ''}`, d: shapePath(it.shape), fill: p.color, 'vector-effect': 'non-scaling-stroke' });
        if (strokeOf.has(p.cls)) shape.style?.setProperty?.('--at-sym-stroke', strokeOf.get(p.cls)); // CSS 변수 — 강조(hover) 테두리는 CSS 가 그대로 이김
        el.append(shape);
      }
      it.el = el;
      root.append(el);
    }
    // 값 상자는 모든 기호 위에(기호 원에 가리지 않게)
    for (const it of items) if (it.vsize) { it.vel = valueBox(it); it.vbox = null; root.append(it.vel); }
    g.append(root);
  }
  function drawBar(it, view, base, anchor) {
    const m = barMetrics(it.f.properties.value, view.k);
    const key = `${round1(m.cell)}`;
    if (key !== it.key) { // 확대가 바뀌어 칸 크기가 바뀌었을 때만 다시 만든다
      it.key = key;
      const kids = [];
      const w = m.width;
      for (let i = 0; i < m.cells; i++) {
        const y = -(i + 1) * m.cell - i * m.gap;
        kids.push(s('rect', { class: 'at-bar-cell', x: round1(-w / 2), y: round1(y), width: round1(w), height: round1(m.cell) }));
      }
      // 사람 아이콘(머리 + 몸) — 막대 위
      const top = -m.height - m.gap, hr = m.cell * 0.42, sh = m.cell * 0.55, hw = w * 0.55;
      kids.push(s('path', { class: 'at-bar-person', d: `M${round1(-hw)},${round1(top)}v${round1(-sh)}q0,${round1(-sh)} ${round1(hw)},${round1(-sh)}q${round1(hw)},0 ${round1(hw)},${round1(sh)}v${round1(sh)}Z` }));
      kids.push(s('circle', { class: 'at-bar-person', cx: 0, cy: round1(top - m.cell * 1.1 - hr), r: round1(hr) }));
      it.cells.replaceChildren(...kids);
      it.h = m.height + m.gap + m.cell * 1.1 + 2 * hr;
      it.w = w;
      it.labelY = m.cell * 1.1 + 4;
      if (it.label) setAttr(it.label, 'y', round1(it.labelY));
    }
    setAttr(it.cells, 'transform', `translate(${round1(base[0])},${round1(base[1])})`);
    if (it.label) { setAttr(it.label, 'x', round1(base[0])); setAttr(it.label, 'transform', `translate(0,${round1(base[1])})`); }
    // 막대 상자(맞히기·지시선)
    it.box = [base[0] - it.w / 2, base[1] - it.h, base[0] + it.w / 2, base[1] + (it.label ? 16 : 0)];
    it.base = base;
    if (anchor) {
      const bx = Math.max(it.box[0], Math.min(anchor[0], it.box[2])), by = Math.max(base[1] - it.h, Math.min(anchor[1], base[1]));
      setAttr(it.leader, 'd', `M${round1(anchor[0])},${round1(anchor[1])}L${round1(bx)},${round1(by)}`);
      setAttr(it.dot, 'cx', round1(anchor[0])); setAttr(it.dot, 'cy', round1(anchor[1]));
      setAttr(it.dot, 'display', null); setAttr(it.leader, 'display', null);
    } else {
      setAttr(it.dot, 'display', 'none'); setAttr(it.leader, 'display', 'none');
    }
  }
  const onHover = hoverClass((f) => byF.get(f));
  /** 값 상자 자리: 보이는 값 붙은 기호마다(자료 차례 = 우선순위) — 다른 기호 원도 피함 */
  function placeValues() {
    const withV = items.filter((it) => it.vel);
    if (!withV.length) return;
    const shown = withV.filter((it) => it.xy);
    const others = items.filter((it) => it.xy && !it.vel && it.shape !== 'bar').map((it) => { const r = it.r || 3; return [it.xy[0] - r, it.xy[1] - r, it.xy[0] + r, it.xy[1] + r]; });
    const boxes = placeValueBoxes(shown.map((it) => ({ xy: it.xy, r: it.r || 3, w: it.vsize.w, h: it.vsize.h })), { obstacles: others });
    for (const it of withV) {
      const k = shown.indexOf(it);
      it.vbox = k >= 0 ? boxes[k] : null;
      setAttr(it.vel, 'display', it.vbox ? null : 'none');
      if (it.vbox) setAttr(it.vel, 'transform', `translate(${round1(it.vbox[0])},${round1(it.vbox[1])})`);
      const a = alphaOf(legend, it.f.properties.cls, dimAlpha);
      setAttr(it.vel, 'opacity', a === 1 ? null : a);
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
          if (shown) drawBar(it, view, base, p.barAt ? q : null);
        } else {
          shown = shown && q[0] > -20 && q[0] < W + 20 && q[1] > -20 && q[1] < H + 20;
          if (shown) {
            it.r = diameter(it.f, view.k) / 2;
            setAttr(it.el, 'transform', `translate(${round1(q[0])},${round1(q[1])}) scale(${round2(it.r)})`);
          }
        }
        it.xy = shown ? q : null;
        setAttr(it.el, 'display', shown ? null : 'none');
        const a = alphaOf(legend, p.cls, dimAlpha);
        setAttr(it.el, 'opacity', a === 1 ? null : a);
        it.el.classList.toggle('is-hover', it.f === onHover.current());
      }
      placeValues();
    },
    hit(xy) {
      for (let i = items.length - 1; i >= 0; i--) { // 값 상자(기호 위에 그림)
        const b = items[i].vbox;
        if (b && alphaOf(legend, items[i].f.properties.cls, 0) !== 0 && xy[0] >= b[0] && xy[0] <= b[2] && xy[1] >= b[1] && xy[1] <= b[3]) return items[i].f;
      }
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
    /** 지명 자리 피하기(E1): 지금 그린 기호 상자(화면 px) — 막대는 막대·사람·나라 이름까지, 그 밖은 기호 원. 흐린 분류는 뺀다. */
    labelObstacles() {
      const out = [];
      for (const it of items) {
        if (!it.xy || alphaOf(legend, it.f.properties.cls, 0) === 0) continue;
        if (it.shape === 'bar') {
          if (!it.box) continue;
          out.push([it.box[0], it.box[1], it.box[2], it.base[1]]);
          if (it.label) { // 나라 이름(12px 굵은 글자, 한글 한 자 ≈ 12px — 어림)
            const tw = String(it.f.properties.name).length * 12 + 4, y = it.base[1] + it.labelY;
            out.push([it.base[0] - tw / 2, y, it.base[0] + tw / 2, y + 15]);
          }
          if (it.f.properties.barAt) out.push([it.xy[0] - 3, it.xy[1] - 3, it.xy[0] + 3, it.xy[1] + 3]); // 지시선 끝 점
        }
        else { const r = (it.r || 3) + 1; out.push([it.xy[0] - r, it.xy[1] - r, it.xy[0] + r, it.xy[1] + r]); }
        if (it.vbox) out.push([...it.vbox]);
      }
      return out;
    },
    destroy() { offs.forEach((off) => off()); offs.length = 0; },
  };
  const offs = connect({ map, legend, layerId, legendRefresh, onHover });
  return layer;
}

// ---------- 흐름선 ----------
/**
 * 흐름선 레이어(SVG). 선 하나 = <g class="at-flow"> 안에 흰 테두리 경로 + 색 경로 + 화살촉 경로(세모, 곡선 끝 접선 방향).
 * 자료 좌표 순서 = 꼬리 → 화살 끝(수입 = 상대국 → 우리나라, 수출 = 우리나라 → 상대국). 날짜변경선에서 나뉜 조각(MultiLineString)은 경도를 이어
 * 하나로 만든 뒤 화면 이음매에서만 끊는다. 경로는 마디를 지나는 이차 베지어 곡선(quadPath, 두 점뿐이면 휘어진 베지어 하나), 선 끝은 화살촉 밑변 쪽으로
 * 조금 당겨(trimRunEnd) 화살 끝으로 삐져나오지 않게. 굵기 = flowWidthPx(widthOf(f) pt, k). marker·id 를 쓰지 않는다(문서 전역 id 없음).
 */
export function flowLayer(id, lines, { legend = null, map = null, layerId = id, legendRefresh = true, widthOf = (f) => f.properties.width ?? 1, colorOf = (f) => f.properties.color, onPick = null, dimAlpha = 0.2, z = LAYER_Z.flow, bend = 0.18 } = {}) {
  const feats = featuresOf(lines).filter(isLine);
  // 굵은 선을 먼저(아래), 가는 선이 위에 오게
  const items = feats.map((f) => ({
    f, geo: f.geometry.type === 'MultiLineString' ? joinParts(f.geometry.coordinates) : unwrapLine(f.geometry.coordinates),
  })).sort((a, b) => widthOf(b.f) - widthOf(a.f));
  const byF = new Map(items.map((it) => [it.f, it]));
  let root = null;

  function build(g) {
    root = s('g', { class: 'at-flows' });
    for (const it of items) {
      const color = colorOf(it.f);
      Object.assign(it, { runs: [], w: 0 }); // 캐시 초기화(새 요소에 굵기를 다시 씀)
      it.halo = s('path', { class: 'at-flow-halo' });
      it.line = s('path', { class: 'at-flow-line', stroke: color });
      it.head = s('path', { class: 'at-flow-head', fill: color });
      it.el = s('g', { class: 'at-flow', on: { click: (e) => { e.stopPropagation(); onPick?.(it.f, e); } } }, it.halo, it.line, it.head);
    }
    root.append(...items.map((it) => it.el));
    g.append(root);
  }
  const onHover = hoverClass((f) => byF.get(f));
  const layer = {
    id, z, meta: metaOf(lines), legendItems: legendItems(lines), features: feats,
    drawSvg(g, project, view) {
      if (!root || root.parentNode !== g) build(g);
      for (const it of items) {
        const w = flowWidthPx(widthOf(it.f), view.k);
        if (w !== it.w) {
          it.w = w;
          setAttr(it.line, 'stroke-width', round1(w)); setAttr(it.halo, 'stroke-width', round1(w + 2.4));
        }
        it.runs = splitJumps(it.geo, project);
        const last = it.runs.length ? it.runs[it.runs.length - 1] : null;
        // 화살촉은 마지막 조각이 자료의 끝점까지 닿을 때만 — 이음매(날짜변경선·구드 틈)에서 끝이 잘렸으면 잘린 자리에 달지 않는다
        const endS = last && project(it.geo[it.geo.length - 1]);
        const lastPt = last && last[last.length - 1];
        const reaches = !!(endS && Math.hypot(lastPt[0] - endS[0], lastPt[1] - endS[1]) < 0.5);
        const tan = reaches && endTangent(last, { bend });
        const drawn = tan ? [...it.runs.slice(0, -1), trimRunEnd(last, arrowSize(w).len * 0.6)] : it.runs;
        const d = drawn.map((r) => quadPath(r, { bend })).join('') || null;
        setAttr(it.line, 'd', d); setAttr(it.halo, 'd', d);
        setAttr(it.head, 'd', tan ? arrowHead(tan.tip, tan.dir, w).path : null);
        const a = alphaOf(legend, it.f.properties.cls, dimAlpha);
        setAttr(it.el, 'opacity', a === 1 ? null : a);
        it.el.classList.toggle('is-hover', it.f === onHover.current());
      }
    },
    hit(xy) {
      for (let i = items.length - 1; i >= 0; i--) {
        const it = items[i];
        if (!it.runs || alphaOf(legend, it.f.properties.cls, 0) === 0) continue;
        const tol = Math.max(4, it.w / 2 + 3);
        if (it.runs.some((r) => distToPolyline(xy, r) <= tol)) return it.f;
      }
      return null;
    },
    destroy() { offs.forEach((off) => off()); offs.length = 0; },
  };
  const offs = connect({ map, legend, layerId, legendRefresh, onHover });
  return layer;
}

// ---------- 핀 ----------
const PIN_D = 'M0,0C-2.2,-5.2 -8,-8.8 -8,-15A8,8 0 1,1 8,-15C8,-8.8 2.2,-5.2 0,0Z'; // 물방울 핀, 끝 = (0,0), 머리 가운데 = (0,-15)
/**
 * 번호 핀 레이어(SVG). markers = [{id, lonlat, title, photo?, approx?, number?}] (topics.json markers). 번호 = numberOf(m, i)(기본 m.number ?? m.photo.pin ?? i + 1, null 이면 숨김).
 * 누르면 그 핀을 고르고(강조, 맨 위로) onPick(marker). layer.select(id | null), layer.selected().
 * hit 은 Feature 모양 {type:'Feature', properties:{label: title, id, approx}, geometry, marker} 를 돌려준다(말풍선은 properties.label).
 * 핀 id 는 data-id 속성에만 둔다(문서 전역 id 아님).
 */
export function markerLayer(id, markers, {
  map = null, layerId = id, onPick = null, numberOf = (m, i) => m.number ?? m.photo?.pin ?? i + 1, z = LAYER_Z.marker, hideNumbers = false, onReveal = null,
} = {}) {
  // hideNumbers(교과서 20쪽 활동하기 1 — 학생이 사진 번호를 빈 핀에 씀): 처음엔 번호 없는 빈 핀, 말풍선(hover)에도 이름 없음.
  // 누른 핀은 번호·이름이 보이고(reveal), revealAll(true/false)로 모두 보이기·다시 숨기기. 바뀔 때마다 onReveal(드러난 수, 전체 수).
  const items = (markers || []).filter((m) => Array.isArray(m.lonlat)).map((m, i) => ({
    m, n: numberOf(m, i), xy: null, el: null, num: null, shown: !hideNumbers,
    feature: { type: 'Feature', properties: { label: hideNumbers ? '' : m.title ?? '', id: m.id, approx: !!m.approx }, geometry: { type: 'Point', coordinates: m.lonlat }, marker: m },
  }));
  // 숨긴 핀: 번호 글자 숨김 + is-blank(옅은 보라 — 아직 답하지 않은 빈칸), 말풍선 이름·읽기 이름도 「핀」만(답 = 사진 번호 ↔ 자리)
  const paint = (it) => {
    it.feature.properties.label = it.shown ? it.m.title ?? '' : '';
    if (it.num) setAttr(it.num, 'display', it.shown ? null : 'none');
    if (it.el) {
      it.el.classList.toggle('is-blank', !it.shown);
      setAttr(it.el, 'aria-label', it.shown ? it.m.title || (it.n != null ? `핀 ${it.n}` : '핀') : '핀');
    }
  };
  const revealedCount = () => items.filter((it) => it.shown).length;
  const notify = () => onReveal?.(revealedCount(), items.length);
  const changed = () => { if (map && !map.destroyed) map.refreshLayer(layerId); notify(); };
  // 누르기·Enter·Space 가 같은 길: 숨긴 핀이면 드러내고(다시 그리기는 select 가 한 번만), 고르고, onPick
  const press = (it, e) => {
    e.stopPropagation?.();
    if (!it.shown) { it.shown = true; paint(it); notify(); }
    layer.select(it.m.id);
    onPick?.(it.m, e);
  };
  const byFeature = new Map(items.map((it) => [it.feature, it]));
  let root = null, sel = null;
  function build(g) {
    root = s('g', { class: 'at-pins' });
    for (const it of items) {
      it.xy = null;
      it.num = it.n != null ? s('text', { class: 'at-pin-num', x: 0, y: -15 }, String(it.n)) : null;
      // 키보드: 핀마다 Tab 으로 닿는 단추(role button) — Enter·Space 는 누르기와 같은 길. 무대 키(방향키·+−)는 무대 자체에 초점일 때만이라 겹치지 않음
      it.el = s('g', {
        class: 'at-pin', 'data-id': it.m.id, role: 'button', tabindex: '0',
        on: {
          click: (e) => press(it, e),
          keydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault?.(); press(it, e); } },
        },
      },
        s('path', { class: 'at-pin-body', d: PIN_D }),
        s('circle', { class: 'at-pin-hole', cx: 0, cy: -15, r: 5.6 }),
        it.num,
      );
      paint(it);
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
  const onHover = hoverClass((f) => byFeature.get(f));
  const layer = {
    id, z, markers: items.map((it) => it.m),
    drawSvg(g, project, view) {
      if (!root || root.parentNode !== g) { build(g); select(sel); }
      for (const it of items) {
        const q = project(it.m.lonlat);
        const shown = !!q && q[0] > -20 && q[0] < view.width + 20 && q[1] > -10 && q[1] < view.height + 40;
        it.xy = shown ? q : null;
        setAttr(it.el, 'display', shown ? null : 'none');
        if (shown) setAttr(it.el, 'transform', `translate(${round1(q[0])},${round1(q[1])})${it.m.id === sel ? ' scale(1.25)' : ''}`);
        it.el.classList.toggle('is-hover', it.feature === onHover.current());
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
    /** 지명 자리 피하기(E1): 핀 머리·꼬리 상자(화면 px) */
    labelObstacles() {
      return items.filter((it) => it.xy).map((it) => { const sc = it.m.id === sel ? 1.25 : 1; return [it.xy[0] - 8 * sc, it.xy[1] - 24 * sc, it.xy[0] + 8 * sc, it.xy[1]]; });
    },
    select(mid) { select(mid); if (map && !map.destroyed) map.refreshLayer(layerId); },
    selected: () => sel,
    /** 핀 하나의 번호·이름 보이기(hideNumbers) */
    reveal(mid) { const it = items.find((x) => x.m.id === mid); if (!it || it.shown) return; it.shown = true; paint(it); changed(); },
    /** 모두 보이기(true) · 다시 숨기기(false) */
    // 다시 숨기기(false)는 하나씩 누른 핀까지 모두 숨긴다 — 활동을 처음부터 다시 하는 것이라 몇 개만 남기면 답이 드러남
    revealAll(on = true) { for (const it of items) { it.shown = !!on; paint(it); } changed(); },
    isRevealed: (mid) => !!items.find((x) => x.m.id === mid)?.shown,
    get revealed() { return revealedCount(); },
    destroy() { offs.forEach((off) => off()); offs.length = 0; },
  };
  const offs = connect({ map, layerId, onHover });
  return layer;
}
