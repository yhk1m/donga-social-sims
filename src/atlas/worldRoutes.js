// © 2026 김용현
// src/atlas/worldRoutes.js — Ⅰ 세계화 3g 대권 노선 레이어(registerLayerType('routeFan') — 14쪽 「우리나라의 항공망」, 교사 Q10 A).
//   worldExtra.installWorldExtras() 가 installWorldRoutes() 를 부른다(세계화 단원 조각에만 — u2~u6 조각에는 코드가 들어가지 않음).
//   자료 = scripts/atlas/route_fan.py 출력 {type:'FeatureCollection', properties:{layerType:'routeFan', origin:[lon, lat], legend:[{cls, label, color, kind:'line'}],
//     width?(pt), arrow:false}, features:[{properties:{cls}, geometry: MultiPoint(도착 도시들 — 분류마다 하나, 용량) | Point}]}.
//   그림(SVG <g class="at-routes">): 출발 → 도착 대권을 1° 마다 나눈 줄(greatCircle — d3 geoInterpolate)을 분류마다 <path> 하나(MultiLineString, d3 geoPath)로.
//     d3 가 투영마다 날짜변경선(가장자리)·지구본 뒷면(clipAngle)에서 잘라 주므로 지도를 가로지르는 줄이 생기지 않는다. 도시 점 = 분류마다 <path> 하나(작은 원),
//     출발점 = 흰 테두리 원. 노선 수가 많아도(약 190) DOM 노드는 분류 수 × 2 + 2.
//   누르기: 요소는 pointer-events none(렌더러는 svg 바탕 누르기만 받음) → hit(xy) = 보이는 도시 점 ROUTES.hitPx 안 → 「인천 → 직항 도시」(교과서에 도시 이름 없음).
//   범례 = 분류(기본 하나 — 「인천 국제공항 직항 노선」), 고르지 않은 분류는 흐림(dimAlpha)·안 맞힘. 장애물 [] (선 — 지명을 밀어내지 않음).
import { geoInterpolate, geoDistance, geoPath } from 'd3-geo';
import { s } from '../shared/dom.js';
import { registerLayerType } from './layerRef.js';
import { legendItems, alphaOf, lineWidthPx, zoomScale } from './layerStyle.js';
import { metaOf, setAttr, connect, round1, LAYER_Z } from './layerCommon.js';

/** 대권 나눔(°)·도시 점 색·반지름(px, 확대 k 2.2 기준)·맞히기 거리(px)·흐림·출발 글 */
export const ROUTES = Object.freeze({ step: 1, dotColor: '#ed1c24', dotPx: 1.8, hitPx: 6, dimAlpha: 0.2, lineOpacity: 0.85, pick: '인천 → 직항 도시' });

/** 대척점 가드(°): 출발과 도착이 거의 대척점이면 대권이 하나로 정해지지 않아(geoInterpolate 가 아무 방향으로나 감) 자료 오류로 멈춘다.
 *  실제 14쪽 노선의 가장 먼 것은 인천 → 상파울루 약 164.7° — 179.5° 를 넘는 도착 점은 fit 되돌리기·좌표 실수뿐이다. */
export const ANTIPODE_DEG = 179.5;

/** a → b 대권을 stepDeg 마다 나눈 경위도 줄(양 끝 그대로, 같은 점이면 [a]). 거의 대척점(> ANTIPODE_DEG)이면 오류. */
export function greatCircle(a, b, stepDeg = ROUTES.step) {
  const deg = (geoDistance(a, b) * 180) / Math.PI;
  if (deg < 1e-9) return [a];
  if (deg > ANTIPODE_DEG) throw new Error(`greatCircle: 거의 대척점(${deg.toFixed(2)}°)이라 대권이 정해지지 않음 [${a}] → [${b}]`);
  const n = Math.ceil(deg / stepDeg), f = geoInterpolate(a, b);
  const out = [a];
  for (let i = 1; i < n; i++) out.push(f(i / n));
  out.push(b);
  return out;
}

const circleD = ([x, y], r) => `M${round1(x - r)},${round1(y)}a${r},${r} 0 1,0 ${round1(2 * r)},0a${r},${r} 0 1,0 ${round1(-2 * r)},0`;

/** 대권 노선 레이어(SVG). legend = 범례 상태(layerFromRef 가 만듦 — 없으면 흐림 없음). */
export function routeFanLayer(id, data, { legend = null, map = null, layerId = id, z = LAYER_Z.flow } = {}) {
  const P = data?.properties || {};
  const origin = P.origin;
  if (!Array.isArray(origin) || origin.length !== 2 || !origin.every(Number.isFinite)) throw new Error(`routeFanLayer ${id}: origin [lon, lat] 이 없음`);
  const feats = data.features || [];
  for (const f of feats) if (!/^(Multi)?Point$/.test(f.geometry?.type || '')) throw new Error(`routeFanLayer ${id}: 도착 도시는 Point·MultiPoint 여야 함(${f.geometry?.type})`);
  const destsOf = (f) => (f.geometry.type === 'Point' ? [f.geometry.coordinates] : f.geometry.coordinates);
  const items = legendItems(data);
  const colorOf = new Map(items.map((e) => [e.cls, e.color]));
  const order = [...new Set([...items.map((e) => e.cls), ...feats.map((f) => f.properties?.cls)])];
  const groups = order.map((cls) => {
    const dests = feats.filter((f) => f.properties?.cls === cls).flatMap(destsOf);
    return { cls, color: colorOf.get(cls) || '#f072ab', dests, lines: dests.map((ll) => greatCircle(origin, ll)) };
  }).filter((gr) => gr.dests.length);
  const pick = (cls, ll) => ({ type: 'Feature', properties: { cls, type: 'route', name: '직항 도시', label: ROUTES.pick }, geometry: { type: 'Point', coordinates: ll } });
  let root = null, originEl = null, shown = [], destroyed = false; // shown = [{xy, ll, gr}] 이번 그림에 보인 도시 점

  function build(g) {
    root = s('g', { class: 'at-routes', 'pointer-events': 'none' });
    for (const gr of groups) {
      gr.line = s('path', { class: 'at-routes-line', fill: 'none', stroke: gr.color, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-opacity': ROUTES.lineOpacity });
      gr.dots = s('path', { class: 'at-routes-dots', fill: ROUTES.dotColor, stroke: '#ffffff', 'stroke-width': 0.4 });
      gr.el = s('g', { class: 'at-routes-cls' }, gr.line);
    }
    originEl = s('path', { class: 'at-routes-origin', fill: ROUTES.dotColor, stroke: '#ffffff', 'stroke-width': 1.2 });
    // 선 모두 → 점 모두 → 출발점(점이 선 아래에 묻히지 않게)
    root.append(...groups.map((gr) => gr.el), ...groups.map((gr) => gr.dots), originEl);
    g.append(root);
  }

  const layer = {
    id, z, meta: metaOf(data), features: feats,
    /** 노선(도착 도시 [lon, lat]) 목록 — 시험·대조표용 */
    routes: groups.flatMap((gr) => gr.dests),
    origin,
    labelObstacles: () => [],
    drawSvg(g, project, view) {
      if (destroyed) return;   // destroy 뒤 늦게 온 다시 그리기가 <g> 를 다시 만들지 않게(de5a52e 맞히기 레이어와 같음)
      if (!root || root.parentNode !== g) build(g);
      const gp = geoPath(view.projection);
      const w = round1(lineWidthPx(P.width ?? 0.6, view.k));
      const r = round1(Math.max(1.2, ROUTES.dotPx * zoomScale(view.k)));
      shown = [];
      for (const gr of groups) {
        setAttr(gr.line, 'stroke-width', w);
        setAttr(gr.line, 'd', gp({ type: 'MultiLineString', coordinates: gr.lines }) || null);
        let d = '';
        for (const ll of gr.dests) {
          const xy = project(ll);
          if (!xy) continue;
          d += circleD(xy, r); shown.push({ xy, ll, gr });
        }
        setAttr(gr.dots, 'd', d || null);
        const a = alphaOf(legend, gr.cls, ROUTES.dimAlpha);
        setAttr(gr.el, 'opacity', a === 1 ? null : a);
        setAttr(gr.dots, 'opacity', a === 1 ? null : a);
      }
      const o = project(origin);
      setAttr(originEl, 'd', o ? circleD(o, round1(r * 1.6)) : null);
    },
    hit(xy) {
      let best = null, bd = ROUTES.hitPx;
      for (const it of shown) {
        if (alphaOf(legend, it.gr.cls, 0) === 0) continue;
        const d = Math.hypot(xy[0] - it.xy[0], xy[1] - it.xy[1]);
        if (d <= bd) { bd = d; best = it; }
      }
      return best ? pick(best.gr.cls, best.ll) : null;
    },
    destroy() { destroyed = true; offs.forEach((off) => off()); offs.length = 0; root?.remove(); root = null; shown = []; },
  };
  const offs = connect({ map, legend, layerId });
  return layer;
}

/** 세계화 단원 등록(worldExtra.installWorldExtras 가 부름) */
export function installWorldRoutes() {
  registerLayerType('routeFan', (id, d, ctx) => routeFanLayer(id, d, ctx));
}
