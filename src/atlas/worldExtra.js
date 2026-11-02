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
//     맞히기 = 나라 → 「나라 이름(대륙 이름)」, 대양 → 대양 이름(고른 대양만). layer.onSelect·centers·bounds·names·oceans·classOf 는 3e 맞히기·3f 지구본 단추가 쓴다.
//     면 좌표는 모두 −180~180(180° 를 넘는 러시아 아시아 조각·태평양은 180° 에서 두 면 — geoClip 자르기가 경도 > 180 을 옮기지 않으므로).
//   단원 main.js: installAmericasExtras(); installPolarExtras(); installWorldExtras();  (이 차례, mountAtlas 전에 — 뒤 등록이 이김)
import { geoContains, geoCentroid } from 'd3-geo';
import { PROJECTIONS } from './projections.js';
import { registerLayerType, combineLayers } from './layerRef.js';
import { areaLayer, symbolLayer } from './layers.js';
import { legendItems } from './layerStyle.js';
import { countryLevel } from './countryClass.js';
import { createLegendState } from './legendState.js';
import { metaOf, LAYER_Z } from './layerCommon.js';
import { installWorldRoutes } from './worldRoutes.js';   // 3g 대권 노선 routeFan(따로 된 모듈)
import { installWorldQuiz } from './worldQuiz.js';     // 3e 대륙·대양 맞히기 continentQuiz(따로 된 모듈)
import { installWorldGlobe } from './worldGlobe.js';   // 3f 지구본 단추 continentGlobes + continentQuiz 대양 단추(따로 된 모듈)
import { installWorldPaint } from './worldPaint.js';   // 3h 세계 색칠하기 도구 paintTool(따로 된 모듈)

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
 * 대륙·대양 면 레이어. legend = 대륙 7 범례 상태(layerFromRef 가 만듦 — 없으면 이 레이어가 자기 범례 상태를 만듦), countryFeatures = 바탕 지도 나라
 * 도형 {'50': [...], …}. 지금은 기본 상세도(countryLevel — 세계 단원은 10a 없음) 나라로 한 번 만든다.
 * 3e·3f 가 쓰는 것: select(cls|null) · selected · onSelect(cb) → 풀기(select·범례 누르기·풀기 모두 — 값이 바뀔 때만 cb(cls|null)) ·
 * centers {cls: [lon, lat]} · bounds {cls: [w, s, e, n]}(날짜변경선을 넘으면 e > 180 — fitBounds 대안) · names {cls: [나라…]} ·
 * oceans [{cls, label, color}] · classOf(iso).
 */
export function continentsLayer(id, data, { countryFeatures = null, legend = null, map = null, layerId = id } = {}) {
  if (!countryFeatures || !Object.keys(countryFeatures).length) throw new Error(`continentsLayer ${id}: 바탕 지도 나라 도형(countryFeatures)이 없음`);
  const lv = countryLevel(null, countryFeatures);
  const oceans = oceanFeatures(data).map((f) => ({ cls: f.properties.cls, label: f.properties.label, color: f.properties.color }));
  const oceanCls = new Set(oceans.map((o) => o.cls));
  const lg = legend || createLegendState(legendItems(data).map((e) => e.cls)); // 범례 없이 만들어도 select 가 됨
  let ocean = null; // 고른 대양
  // 대륙 면이 보는 범례: 대양을 고르면 모두 흐림, 아니면 범례 그대로
  const landLegend = {
    isActive: (c) => (ocean ? false : lg.isActive(c)),
    selected: () => (ocean ? `ocean:${ocean}` : lg.selected()),
    onChange: () => () => {},
  };
  const seaLegend = { isActive: (c) => c === ocean, selected: () => ocean, onChange: () => () => {} };
  const part = { map, layerId, legendRefresh: false, z: LAYER_Z.area };
  const land = areaLayer(`${id}:land`, { type: 'FeatureCollection', properties: { legend: data?.properties?.legend || [] }, features: continentFeatures(data, countryFeatures[lv]) },
    { ...part, legend: landLegend, dimAlpha: CONTINENTS.dimAlpha });
  const sea = areaLayer(`${id}:sea`, { type: 'FeatureCollection', properties: { legend: [] }, features: oceanFeatures(data) },
    { ...part, legend: seaLegend, dimAlpha: 0, fillOpacity: CONTINENTS.oceanOpacity });
  const layer = combineLayers(id, [land, sea], { legend: lg, map });
  const refresh = () => { if (map && !map.destroyed) map.refreshLayer(id); };
  const current = () => ocean || lg.selected();
  const subs = new Set();
  let last = current();
  const notify = () => {
    const v = current();
    if (v === last) return;
    last = v;
    for (const cb of [...subs]) { try { cb(v); } catch (e) { console.error('continents onSelect 구독자 오류', e); } }
  };
  // 사용자가 범례에서 대륙을 고르면 대양 고름은 풀림
  const off = lg.onChange(() => { if (ocean && lg.selected() != null) { ocean = null; refresh(); } notify(); });
  const destroy = layer.destroy;
  Object.assign(layer, {
    meta: metaOf(data),
    classes: { ...(data?.properties?.classes || {}) },
    centers: { ...(data?.properties?.centers || {}) },
    bounds: { ...(data?.properties?.bounds || {}) },
    names: { ...(data?.properties?.names || {}) },
    oceans,
    /** 나라 iso → 대륙 cls(쪼갠 나라는 조각 대륙들 배열), 없으면 null */
    classOf(iso) {
      if (this.classes[iso]) return this.classes[iso];
      const ks = [...new Set((data?.features || []).filter((f) => f.properties?.iso === iso && f.properties.mode === 'geom').map((f) => f.properties.cls))];
      return ks.length ? ks : null;
    },
    /** cls = 대륙(범례 고름)·대양(그 면 강조)·null(전체 보기)·대륙 배열(묶음 고름 — 3f 「아메리카」 = 북·남, selected 'group:a+b') */
    select(cls) {
      if (Array.isArray(cls)) {
        const bad = cls.filter((c) => !lg.classes.includes(c));
        if (bad.length || !cls.length) throw new Error(`continentsLayer ${id}: 모르는 대륙 묶음 ${cls}`);
        const had = ocean, name = cls.join('+');
        ocean = null;
        if (lg.selected() !== `group:${name}`) lg.toggleGroup(name, cls);
        if (had) refresh();
        notify();
        return;
      }
      if (cls != null && !oceanCls.has(cls) && !lg.classes.includes(cls)) throw new Error(`continentsLayer ${id}: 모르는 대륙·대양 ${cls}`);
      const had = ocean;
      if (cls != null && oceanCls.has(cls)) { ocean = cls; lg.reset(); if (had !== cls) refresh(); }
      else {
        ocean = null;
        if (cls == null) lg.reset();
        else if (lg.selected() !== cls) lg.toggle(cls);
        if (had) refresh();
      }
      notify();
    },
    /** 고른 것이 바뀔 때마다 cb(cls|null) — 풀기 함수를 돌려줌 */
    onSelect(cb) { subs.add(cb); return () => subs.delete(cb); },
    destroy() { off(); subs.clear(); destroy(); },
  });
  /** 지금 고른 대륙·대양 cls(없으면 null) — Object.assign 은 getter 를 값으로 굳히므로 따로 */
  Object.defineProperty(layer, 'selected', { get: current });
  return layer;
}

/**
 * 주제 핀을 내리는 기호 레이어(U1-10 — 15쪽 「세계를 잇는 한국어」, 앱 type 'symbolHidePins', 자료는 symbol 그대로): 핀은 주제 단위(topic.js)라
 * 「음식 문화의 세계화」 햄버거 사진 핀 4 가 한국어 묶음에서도 보였음. 이 레이어가 지도에 있는 동안 주제 핀 레이어(id 'markers-…')를 지도에서
 * 내리고(removeLayer keep — destroy 하지 않아 핀·카드 상태 그대로) 묶음을 떠나면(destroy) 다시 올린다. 주제를 바꿀 때 topic.js 는 묶음을 먼저 풀고
 * (여기서 다시 올림) 그 뒤 clearLayers 로 핀을 지우므로 남는 레이어가 없다. 핀이 묶음보다 늦게 붙는 경우(처음 묶음)는 마이크로태스크로 한 번 더 본다.
 */
export function symbolHidePinsLayer(id, data, ctx = {}) {
  const layer = symbolLayer(id, data, ctx);
  const map = ctx.map;
  let held = [], dead = false;
  const hide = () => {
    if (dead || !map || map.destroyed || !Array.isArray(map.layers)) return;
    for (const p of map.layers.filter((x) => String(x.id).startsWith('markers-'))) if (map.removeLayer(p.id, { keep: true })) held.push(p);
  };
  hide();
  Promise.resolve().then(hide);
  const destroy = layer.destroy;
  layer.destroy = () => {
    dead = true;
    destroy?.call(layer);
    if (map && !map.destroyed) for (const p of held) if (!map.layers.includes(p)) map.addLayer(p);
    held = [];
  };
  return layer;
}

/** 세계화 단원 등록 — installAmericasExtras → installPolarExtras 다음(뒤 등록이 이김) */
export function installWorldExtras() {
  if (!PROJECTIONS.polarN) throw new Error('installWorldExtras: installAmericasExtras() → installPolarExtras() 를 먼저');
  registerLayerType('continents', (id, d, ctx) => continentsLayer(id, d, ctx));
  installWorldRoutes();
  installWorldQuiz(continentsLayer);
  installWorldGlobe(continentsLayer); // installWorldQuiz 뒤(continentQuiz 를 대양 단추와 함께 다시 등록)
  installWorldPaint();
  registerLayerType('symbolHidePins', (id, d, ctx) => symbolHidePinsLayer(id, d, ctx));
}
