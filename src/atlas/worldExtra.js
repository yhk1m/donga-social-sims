// © 2026 김용현
// src/atlas/worldExtra.js — Ⅰ 세계화(U1-3)에서 처음 쓰는 엔진 기능. installWorldExtras() 를 부른 단원 조각에만 들어간다
//   (americasExtra.js·polarExtra.js 와 같은 등록 길 — 부르지 않는 u2~u6 조각은 코드도 크기도 그대로).
//   - 3c·3d 대륙·대양 면(registerLayerType('continents') — 10·11쪽, 교사 Q5 A·Q7 A): 자료 = scripts/atlas/continent_layers.py 출력
//     {type:'FeatureCollection', properties:{layerType:'continents', legend:[{cls, label, color}](대륙 7), classes:{iso: cls}, centers:{cls: [lon, lat]},
//      names:{cls: [나라 이름…]}, oceans?:[{cls, label, color?}]}, features:[조각 면 {cls, iso, mode:'geom'|'parts'} | 대양 면 {cls, ocean:true}]}.
//     그림 = 바탕 지도 나라 도형(countryFeatures — 지금 상세도)을 대륙색으로(countryClass 와 같은 길 — areaLayer), 선으로 쪼갠 나라(러시아)는 classes 에
//     없고 조각 면(mode 'geom')을 그림, 섬 단위로 갈린 나라(미국 하와이·프랑스 기아나 — classes 에 본토 대륙)는 바탕 지도 나라의 섬 면마다 그 섬이 든
//     조각(mode 'parts')의 대륙으로. 대양 면(3d)은 고를 때만 옅은 파랑(육지를 뺀 면이라 육지를 덮지 않음).
//     select(cls) = 대륙이면 범례 고름(그 대륙만 진하게, 나머지 흐림 0.25 — 9쪽 지구본 그림처럼), 대양이면 그 대양 면 + 대륙 모두 흐림, null = 전체.
//     맞히기 = 나라 → 「나라 이름(대륙 이름)」, 대양 → 대양 이름(고른 대양만). layer.centers·names·classOf(iso) 는 3e 맞히기·3f 지구본 단추가 쓴다.
//   단원 main.js: installAmericasExtras(); installPolarExtras(); installWorldExtras();  (이 차례, mountAtlas 전에 — 뒤 등록이 이김)
import { geoContains, geoCentroid } from 'd3-geo';
import { PROJECTIONS } from './projections.js';
import { registerLayerType, combineLayers } from './layerRef.js';
import { areaLayer } from './layers.js';
import { legendItems } from './layerStyle.js';
import { countryLevel } from './countryClass.js';
import { metaOf, LAYER_Z } from './layerCommon.js';

/** 대륙 면 흐림(고르지 않은 대륙 — 9쪽 지구본 그림의 「그 대륙만 초록」), 대양 강조 색·불투명도 */
export const CONTINENTS = Object.freeze({ dimAlpha: 0.25, oceanColor: '#3d8fd1', oceanOpacity: 0.45 });

const polysOf = (g) => (g?.type === 'Polygon' ? [g.coordinates] : g?.type === 'MultiPolygon' ? g.coordinates : []);

/** 대륙 자료 + 나라 도형 → 면 레이어 Feature 들(대양 빼고). 나라 Feature {type:'area', cls, iso, name, label, color}. */
export function continentFeatures(data, countries) {
  const legend = legendItems(data);
  const byCls = new Map(legend.map((e) => [e.cls, e]));
  const classes = data?.properties?.classes || {};
  const pieces = (data?.features || []).filter((f) => !f.properties?.ocean);
  const parts = new Map(); // iso → 섬 단위 조각(mode 'parts')
  for (const f of pieces) if (f.properties.mode === 'parts') (parts.get(f.properties.iso) || parts.set(f.properties.iso, []).get(f.properties.iso)).push(f);
  const nameOf = new Map((countries || []).map((c) => [c.properties?.iso, c.properties?.ko || c.properties?.iso]));
  const feat = (cls, iso, geometry) => {
    const e = byCls.get(cls); const name = nameOf.get(iso) || iso;
    return e ? { type: 'Feature', properties: { type: 'area', cls, iso, name, label: `${name}(${e.label})`, color: e.color }, geometry } : null;
  };
  const out = [];
  for (const c of countries || []) {
    const iso = c?.properties?.iso, main = classes[iso];
    if (!iso || !main || !c.geometry) continue;
    const ps = parts.get(iso);
    if (!ps) { out.push(feat(main, iso, c.geometry)); continue; }
    const groups = new Map(); // 대륙 → 섬 면들
    for (const poly of polysOf(c.geometry)) {
      const pt = geoCentroid({ type: 'Polygon', coordinates: poly });
      const hit = ps.find((f) => geoContains(f, pt));
      const k = hit ? hit.properties.cls : main;
      (groups.get(k) || groups.set(k, []).get(k)).push(poly);
    }
    for (const [k, list] of groups) out.push(feat(k, iso, { type: 'MultiPolygon', coordinates: list }));
  }
  for (const f of pieces) if (f.properties.mode !== 'parts') out.push(feat(f.properties.cls, f.properties.iso, f.geometry));
  return out.filter(Boolean);
}

/** 대양 면 Feature 들 {type:'area', cls, label, color} (자료 oceans 의 이름·색) */
export function oceanFeatures(data) {
  const info = new Map((data?.properties?.oceans || []).map((o) => [o.cls, o]));
  return (data?.features || []).filter((f) => f.properties?.ocean).map((f) => {
    const o = info.get(f.properties.cls) || {};
    return { type: 'Feature', properties: { type: 'area', cls: f.properties.cls, label: o.label || f.properties.cls, name: o.label, color: o.color || CONTINENTS.oceanColor }, geometry: f.geometry };
  });
}

/**
 * 대륙·대양 면 레이어. legend = 대륙 7 범례 상태(layerFromRef 가 만듦), countryFeatures = 바탕 지도 나라 도형 {'50': [...], …}.
 * 지금은 기본 상세도(countryLevel — 세계 단원은 10a 없음) 나라로 한 번 만든다.
 */
export function continentsLayer(id, data, { countryFeatures = null, legend = null, map = null, layerId = id } = {}) {
  if (!countryFeatures || !Object.keys(countryFeatures).length) throw new Error(`continentsLayer ${id}: 바탕 지도 나라 도형(countryFeatures)이 없음`);
  const lv = countryLevel(null, countryFeatures);
  const oceanCls = new Set((data?.properties?.oceans || []).map((o) => o.cls));
  let ocean = null; // 고른 대양
  // 대륙 면이 보는 범례: 대양을 고르면 모두 흐림, 아니면 범례 그대로
  const landLegend = {
    isActive: (c) => (ocean ? false : legend ? legend.isActive(c) : true),
    selected: () => (ocean ? `ocean:${ocean}` : legend?.selected?.() ?? null),
    onChange: () => () => {},
  };
  const seaLegend = { isActive: (c) => c === ocean, selected: () => ocean, onChange: () => () => {} };
  const part = { map, layerId, legendRefresh: false, z: LAYER_Z.area };
  const land = areaLayer(`${id}:land`, { type: 'FeatureCollection', properties: { legend: data?.properties?.legend || [] }, features: continentFeatures(data, countryFeatures[lv]) },
    { ...part, legend: landLegend, dimAlpha: CONTINENTS.dimAlpha });
  const sea = areaLayer(`${id}:sea`, { type: 'FeatureCollection', properties: { legend: [] }, features: oceanFeatures(data) },
    { ...part, legend: seaLegend, dimAlpha: 0, fillOpacity: CONTINENTS.oceanOpacity });
  const layer = combineLayers(id, [land, sea], { legend, map });
  const refresh = () => { if (map && !map.destroyed) map.refreshLayer(id); };
  // 사용자가 범례에서 대륙을 고르면 대양 고름은 풀림
  const off = legend?.onChange?.(() => { if (ocean && legend.selected() != null) { ocean = null; refresh(); } });
  const destroy = layer.destroy;
  Object.assign(layer, {
    meta: metaOf(data),
    classes: { ...(data?.properties?.classes || {}) },
    centers: { ...(data?.properties?.centers || {}) },
    names: { ...(data?.properties?.names || {}) },
    oceans: [...oceanCls],
    /** 나라 iso → 대륙 cls(쪼갠 나라는 조각 대륙들 배열), 없으면 null */
    classOf(iso) {
      if (this.classes[iso]) return this.classes[iso];
      const ks = [...new Set((data?.features || []).filter((f) => f.properties?.iso === iso && f.properties.mode === 'geom').map((f) => f.properties.cls))];
      return ks.length ? ks : null;
    },
    /** cls = 대륙(범례 고름)·대양(그 면 강조)·null(전체 보기) */
    select(cls) {
      if (cls != null && !oceanCls.has(cls) && !legend?.classes?.includes(cls)) throw new Error(`continentsLayer ${id}: 모르는 대륙·대양 ${cls}`);
      if (cls != null && oceanCls.has(cls)) { ocean = cls; legend?.reset?.(); refresh(); return; }
      const had = ocean; ocean = null;
      if (cls == null) { legend?.reset?.(); if (had) refresh(); return; }
      if (legend.selected() !== cls) legend.toggle(cls); else if (had) refresh();
    },
    destroy() { off?.(); destroy(); },
  });
  /** 지금 고른 대륙·대양 cls(없으면 null) — Object.assign 은 getter 를 값으로 굳히므로 따로 */
  Object.defineProperty(layer, 'selected', { get: () => ocean || (legend?.selected?.() ?? null) });
  return layer;
}

/** 세계화 단원 등록 — installAmericasExtras → installPolarExtras 다음(뒤 등록이 이김) */
export function installWorldExtras() {
  if (!PROJECTIONS.polarN) throw new Error('installWorldExtras: installAmericasExtras() → installPolarExtras() 를 먼저');
  registerLayerType('continents', (id, d, ctx) => continentsLayer(id, d, ctx));
}
