// © 2026 김용현
// scripts/atlas/polar_layers.mjs — 오세아니아·극지방(U6-4) 레이어 자료 만들기(순수 함수 — build_layers.mjs 가 설정 키·레이어 종류가 있을 때만 부름,
//   u2~u5 설정에는 그 키·종류가 없어 옛 길 그대로).
//   - topicView(U6-3c 앱 레이어 — 그리지 않고 보기만 정함): 설정 {type:'topicView', map, view:{centerLon?, projection?, up?, rotate?, base?}}
//   - sectorLines(U6-3f 앱 레이어 — 55쪽 남극 영유권 경계선): 설정 sectors [{cls, label, color, dash?, dashed?, width?,
//     meridians?:[서, 동](교과서 선을 되돌린 경도), outerLat?(기본 −60), offsets?:{w?, e?, arc?}(화면 비킴 px), pathPt?(지면 pt 꺾은선 — 노르웨이처럼
//     바깥 경계만인 나라)}]. 방향 규칙(U6-3f 리뷰): 경선 = 바깥 호 끝 → 극(−60 → −90), 바깥 호 = 서 → 동(경도가 커지는 쪽, ±180 건너면 이어 붙인 채).
//   - latLines(위선 — 북극권·남극권처럼 교과서가 정확한 위도에 그린 선을 지리로 만듦): [{lat, label, color, dashed?, stepDeg?}] → 선 Feature + 범례
//   - shelves(source 'ne-shelves' — 남극 빙붕, U6-D Natural Earth 면): 면은 채움만(clip_land 가 단순화), 테두리는 seamFreeOutline 선(같은 분류)
import { geoArea } from 'd3-geo';
import { seamFreeOutline } from './polar_geom.mjs';

const r3 = (v) => Math.round(v * 1000) / 1000;
const pt = ([x, y]) => [r3(x), r3(y)];

/** 주제 보기 레이어 자료(앱 polarExtra.topicViewLayer). view 키는 그대로(모르는 키는 멈춤). */
export function topicViewLayerJson(layer, m) {
  const v = layer.view;
  if (!v || typeof v !== 'object') throw new Error(`${layer.id}: topicView 에 view 가 없음`);
  const known = new Set(['centerLon', 'projection', 'up', 'rotate', 'base']);
  const bad = Object.keys(v).filter((k) => !known.has(k));
  if (bad.length) throw new Error(`${layer.id}: topicView view 모르는 키 ${bad.join(', ')}`);
  if (v.projection && !['polarN', 'polarS', 'globe'].includes(v.projection)) throw new Error(`${layer.id}: topicView projection ${v.projection}`);
  return {
    type: 'FeatureCollection',
    properties: { id: layer.id, map: layer.map, page: m.page, title: layer.title || m.title, kind: m.kind, layerType: 'topicView', view: v, legend: [] },
    features: [],
  };
}

/** 위선 하나(경도 −180 → 180, stepDeg 간격 — 날짜변경선에서 끊기지 않는 한 줄) */
export function latLine(lat, stepDeg = 2) {
  const out = [];
  for (let lon = -180; lon < 180; lon += stepDeg) out.push([lon, lat]);
  out.push([180, lat]);
  return out;
}

/** 설정 latLines → {features(경위도 LineString, type 'line'), legend} — cls g1, g2 … */
export function latLineFeatures(layer) {
  const legend = [], features = [];
  (layer.latLines || []).forEach((l, i) => {
    if (!(Math.abs(l.lat) < 90) || !l.label || !l.color) throw new Error(`${layer.id}: latLines ${i} 에 lat·label·color 가 있어야 함`);
    const cls = `g${i + 1}`;
    legend.push({ cls, color: l.color, kind: 'line', label: l.label, ...(l.dashed ? { dashed: true } : {}) });
    features.push({ type: 'Feature', properties: { type: 'line', cls, kind: 'line', color: l.color, label: l.label, ...(l.dashed ? { dashed: true } : {}) },
      geometry: { type: 'LineString', coordinates: latLine(l.lat, l.stepDeg || 2) } });
  });
  return { legend, features };
}

/** 경도 a → b 를 동쪽(경도가 커지는 쪽)으로, 이어 붙인 경도(b < a 면 +360) 1° 간격 위선 점 */
export function eastArc(a, b, lat) {
  const e = b <= a ? b + 360 : b, out = [];
  for (let x = a; x < e; x += 1) out.push([x, lat]);
  out.push([e, lat]);
  return out;
}
const meridian = (lon, outer) => {
  const out = [];
  for (let y = outer; y > -90; y -= 1) out.push([lon, y]);
  out.push([lon, -90]);
  return out;
};

/**
 * 남극 영유권 경계선 자료(앱 polarExtra.sectorLinesLayer): 나라마다 경선 둘(바깥 → 극) + 바깥 호(서 → 동), 또는 pathPt(지면 pt → fit 되돌림).
 * 조각마다 Feature 하나(offsetPx 가 조각마다 다를 수 있어서) — properties {cls, part:'w'|'e'|'arc'|'path', offsetPx?}.
 */
export function sectorLinesLayerJson(layer, cv, m, fit = {}) {
  if (!layer.sectors?.length) throw new Error(`${layer.id}: sectorLines 에 sectors 가 없음`);
  const legend = [], features = [];
  for (const s of layer.sectors) {
    if (!s.cls || !s.label || !s.color) throw new Error(`${layer.id}: sectors 항목에 cls·label·color 가 있어야 함`);
    legend.push({ cls: s.cls, label: s.label, color: s.color, kind: 'line', ...(s.dashed ? { dashed: true } : {}), ...(s.dash ? { dash: s.dash } : {}), ...(s.width ? { width: s.width } : {}) });
    const off = s.offsets || {};
    const push = (part, coords) => features.push({ type: 'Feature', properties: { cls: s.cls, part, ...(off[part] ? { offsetPx: off[part] } : {}) }, geometry: { type: 'LineString', coordinates: coords.map(pt) } });
    if (s.meridians) {
      const [w, e] = s.meridians, outer = s.outerLat ?? -60;
      push('w', meridian(w, outer)); push('e', meridian(e, outer)); push('arc', eastArc(w, e, outer));
    } else if (s.pathPt) {
      const ll = [];
      for (const q of s.pathPt) {
        const p = cv.invert(q);
        if (!p) throw new Error(`${layer.id}: ${s.label} 꺾은선 점 ${q} 를 경위도로 되돌릴 수 없음`);
        let [x, y] = p;
        if (ll.length) { const px = ll[ll.length - 1][0]; while (x - px > 180) x -= 360; while (x - px < -180) x += 360; }
        ll.push([x, y]);
      }
      if (ll[0][0] > ll[ll.length - 1][0]) ll.reverse();   // 바깥 경계도 서 → 동
      push('path', ll);
    } else throw new Error(`${layer.id}: ${s.label} 에 meridians 또는 pathPt 가 없음`);
  }
  return {
    type: 'FeatureCollection',
    properties: {
      id: layer.id, map: layer.map, page: m.page, title: layer.title || m.title, kind: m.kind, layerType: 'sectorLines', approx: !!fit.approx,
      source: `교과서 22개정 중학 사회과 부도 ${m.page}쪽 (나라별 경계선 — 교과서 선을 되돌린 경도, 경위도 맞추기: ${fit.family})`,
      ...(layer.view ? { view: layer.view } : {}),   // 기록·시험용(극 중심으로 여는 것은 같은 묶음 topicView)
      ...(layer._sectors ? { _sectors: layer._sectors } : {}),
      legend: legend.map((e) => ({ ...e, present: true })),
    },
    features,
  };
}

/** 빙붕 raw 자료(경위도 그대로 — clip_land 로 넘김): Natural Earth 면들 → 분류 하나(legendItems[0]) MultiPolygon Feature 하나 */
export function shelvesRaw(layer, gj) {
  const e = layer.legendItems?.[0];
  if (!e?.label || !e?.color) throw new Error(`${layer.id}: 빙붕 legendItems[0] 에 label·color 가 있어야 함`);
  const polys = [];
  for (const f of gj.features) {
    const g = f.geometry;
    for (const P of g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : []) {
      if (geoArea({ type: 'Polygon', coordinates: P }) > 2 * Math.PI) throw new Error(`${layer.id}: 감김이 거꾸로인 빙붕 면`);
      polys.push(P);
    }
  }
  if (!polys.length) throw new Error(`${layer.id}: 빙붕 면이 없음`);
  return {
    legend: [{ cls: 'c1', color: e.color, kind: 'fill', label: e.label }],
    features: [{ type: 'Feature', properties: { type: 'area', cls: 'c1', label: e.label, color: e.color }, geometry: { type: 'MultiPolygon', coordinates: polys } }],
  };
}

/** 빙붕 테두리(clip_land 뒤 면 → ±180·극 위 변을 뺀 선, 같은 분류 — 앱 면 레이어가 선 type 'line' 으로 그림) */
export function shelfOutlineFeature(areaFeature, color) {
  const g = seamFreeOutline(areaFeature.geometry);
  return { type: 'Feature', properties: { type: 'line', cls: areaFeature.properties.cls, kind: 'line', color, label: areaFeature.properties.label },
    geometry: { type: 'MultiLineString', coordinates: g.coordinates.map((L) => L.map(pt)) } };
}
