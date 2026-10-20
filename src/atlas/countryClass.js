// © 2026 김용현
// src/atlas/countryClass.js — 나라 단위 단계구분도(countryClass, 2단계 설계 §6.2-8). 생성물은 나라별 분류 {iso: cls}(수 KB)뿐이고,
//   그림은 바탕 지도 나라 도형(countryFeatures — 상세도별 {'50': [...], '10a': [...]}, properties {iso, ko})을 칠한다.
//   countryClassFeatures(data, countries)   분류 + 나라 도형 → 면 레이어 자료(FeatureCollection, 분류 없는 나라는 뺌)
//   countryClassLayer(id, data, { countryFeatures, legend, map, … })   지금 상세도(view.detail '10a' 면 10a, 아니면 50)의 나라로 만든
//     areaLayer 에 맡긴다 — 범례 고름·검은 선택 윤곽·윤곽만 분류·맞히기·말풍선(「나라 이름 · 분류」)은 면 레이어 그대로.
//   상세도마다 면 레이어 하나(처음 쓸 때 만듦), SVG(강조 윤곽)는 상세도마다 자기 <g>, 지금 상세도가 아닌 <g> 는 숨긴다.
// data = layer-<id>.json {type:'countryClass', properties:{id, map, page, title, source, approx…}, legend:[{cls, color, label, …}], classes:{iso: cls}, overrides, multiFill?}
// 다중 채움 줄무늬(data.multiFill 'stripes' — U4-3a, 38쪽 공용어 둘 이상인 나라): classes[iso] 배열의 채움 분류(윤곽만 분류 빼고)가 둘 이상이면
//   나라 하나 = 줄무늬 면 하나(pattern 'stripes', colors 차례 = 분류 차례, clsList) — 범례에서 그 분류 중 하나라도 고르면 남는다.
//   multiFill 이 없으면 배열은 유럽 꼴(채움 + 윤곽만 분류 — 분류마다 면) 그대로.
import { s } from '../shared/dom.js';
import { areaLayer } from './layers.js';
import { legendItems } from './layerStyle.js';
import { LAYER_Z, metaOf, setAttr, connect } from './layerCommon.js';

/**
 * 분류 + 나라 도형 → 면 레이어 자료. 나라 Feature 마다 {type:'area', cls, iso, name(ko), label(「이름 · 분류」), color(범례 화면 색)}.
 * classes[iso] 가 배열이면 분류마다 Feature 하나(채움 분류 + 윤곽만 분류 — 유로 사용 가입국 = 가입국 채움 + 노란 테두리).
 */
/** 나라 iso 의 채움 분류 범례 항목들(윤곽만 분류 빼고, 자료 차례) */
function fillEntries(data, iso) {
  const byCls = new Map(legendItems(data).map((e) => [e.cls, e]));
  return [].concat(data?.classes?.[iso] ?? []).map((c) => byCls.get(c)).filter((e) => e && e.style !== 'outline');
}
const striped = (data, fills) => data?.multiFill === 'stripes' && fills.length > 1;

/** 나라 칠하기: {color} | {pattern: 'stripes', colors}(줄무늬 나라) | null(분류 없음) */
export function countryFill(data, iso) {
  const fills = fillEntries(data, iso);
  if (!fills.length) return null;
  return striped(data, fills) ? { pattern: 'stripes', colors: fills.map((e) => e.color) } : { color: fills[0].color };
}

/** 범례에서 고른 분류 selected(Set — 비면 전체 보기) 아래 나라가 흐려지지 않는가: 그 나라 분류 중 하나라도 고름 */
export function countryVisible(data, iso, selected) {
  if (!selected || !selected.size) return true;
  return [].concat(data?.classes?.[iso] ?? []).some((c) => selected.has(c));
}

export function countryClassFeatures(data, countries) {
  const legend = legendItems(data);
  const byCls = new Map(legend.map((e) => [e.cls, e]));
  const classes = data?.classes || {};
  const features = [];
  for (const c of countries || []) {
    const iso = c?.properties?.iso;
    if (!iso || !c.geometry) continue;
    const name = c.properties.ko || iso;
    const fills = data?.multiFill ? fillEntries(data, iso) : [];
    let list = [].concat(classes[iso] ?? []);
    if (striped(data, fills)) { // 줄무늬 면 하나 + (있으면) 윤곽만 분류
      const f0 = fills[0];
      features.push({ type: 'Feature', properties: { type: 'area', cls: f0.cls, clsList: fills.map((e) => e.cls), pattern: 'stripes', colors: fills.map((e) => e.color), iso, name, label: [name, ...fills.map((e) => e.label)].join(' · '), color: f0.color }, geometry: c.geometry });
      list = list.filter((x) => !fills.some((e) => e.cls === x));
    }
    for (const cls of list) {
      const e = byCls.get(cls);
      if (e) features.push({ type: 'Feature', properties: { type: 'area', cls: e.cls, iso, name, label: `${name} · ${e.label}`, color: e.color }, geometry: c.geometry });
    }
  }
  return { type: 'FeatureCollection', properties: { ...(data?.properties || {}), legend: data?.legend || [] }, features };
}

/** 지금 그릴 상세도: '10a' 보기이고 10a 나라가 있으면 10a, 아니면 50(없으면 있는 첫 상세도) */
export function countryLevel(view, countryFeatures) {
  const have = Object.keys(countryFeatures || {});
  if (view?.detail === '10a' && countryFeatures['10a']) return '10a';
  return countryFeatures?.['50'] ? '50' : have[0] ?? null;
}

export function countryClassLayer(id, data, { countryFeatures = null, legend = null, map = null, layerId = id, legendRefresh = true, z = LAYER_Z.area, ...opts } = {}) {
  if (!countryFeatures || !Object.keys(countryFeatures).length) throw new Error(`countryClassLayer ${id}: 바탕 지도 나라 도형(countryFeatures)이 없음`);
  const subs = new Map(); // 상세도 → {layer, g}
  const sub = (lv) => {
    let it = subs.get(lv);
    if (!it) {
      // 범례 구독은 이 레이어가 한 번(legendRefresh:false), hover 는 부분마다 받아 자기 것만 강조
      it = { layer: areaLayer(`${id}:${lv}`, countryClassFeatures(data, countryFeatures[lv]), { ...opts, legend, map, layerId, legendRefresh: false, z }), g: null };
      subs.set(lv, it);
    }
    return it;
  };
  let cur = null; // 마지막 캔버스 그림의 상세도(맞히기·지명 피하기)
  const base = sub(countryLevel(null, countryFeatures)).layer;
  const layer = {
    id, z, meta: metaOf(data), legendItems: legendItems(data), classes: { ...(data?.classes || {}) },
    /** 기본 상세도(50)의 나라 Feature 들 */
    features: base.features,
    get level() { return cur; },
    draw(ctx, path, view) { cur = countryLevel(view, countryFeatures); sub(cur).layer.draw(ctx, path, view); },
    drawSvg(g, project, view) {
      const lv = countryLevel(view, countryFeatures);
      const it = sub(lv);
      if (!it.g || it.g.parentNode !== g) { it.g = s('g', { class: 'at-part' }); g.append(it.g); }
      for (const [k, o] of subs) if (o.g) setAttr(o.g, 'display', k === lv ? null : 'none');
      it.layer.drawSvg(it.g, project, view);
    },
    hit(xy, lonlat) { return cur ? sub(cur).layer.hit(xy, lonlat) : null; },
    labelObstacles: () => (cur ? sub(cur).layer.labelObstacles() : []),
    destroy() { offs.forEach((off) => off()); offs.length = 0; for (const o of subs.values()) o.layer.destroy(); },
  };
  const offs = connect({ map, legend, layerId, legendRefresh });
  return layer;
}
