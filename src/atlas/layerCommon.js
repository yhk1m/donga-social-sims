// © 2026 김용현
// src/atlas/layerCommon.js — 주제 레이어(layers.js·imageLayer.js·layerRef.js)가 함께 쓰는 작은 도우미.
//   LAYER_Z(레이어 종류별 z), round1·round2(숫자 반올림), featuresOf·isPoly·isLine·metaOf(자료), setAttr(바뀔 때만 속성 쓰기),
//   connect(지도·범례 구독 → 해제 함수 목록), hoverClass(기호·흐름선·핀의 is-hover 토글).

export const LAYER_Z = Object.freeze({ image: 5, area: 10, symbol: 60, flow: 70, marker: 80 });

/** 소수 한 자리(좌표·크기 속성) */
export const round1 = (v) => Math.round(v * 10) / 10;
/** 소수 두 자리(scale 배율) */
export const round2 = (v) => Math.round(v * 100) / 100;

export const featuresOf = (x) => (Array.isArray(x) ? x : x?.features || []);
export const isPoly = (f) => /Polygon$/.test(f.geometry?.type || '');
export const isLine = (f) => /LineString$/.test(f.geometry?.type || '');
/** 자료 맨 위 properties(범례 뺌) + approx 는 늘 참/거짓 */
export const metaOf = (gj) => { const { legend, ...p } = gj?.properties || {}; return { ...p, approx: !!p.approx }; };

/** 값이 바뀔 때만 속성을 쓴다(null = 지움) — 프레임마다 부르는 SVG 갱신이 DOM 을 덜 건드리게. */
export function setAttr(el, k, v) {
  const sv = v == null ? null : String(v);
  if (el.getAttribute(k) === sv) return;
  if (sv == null) el.removeAttribute(k); else el.setAttribute(k, sv);
}

/**
 * 지도·범례 구독. legend 가 있고 legendRefresh 면 legend.onChange → onLegend() + map.refreshLayer(layerId),
 * map 과 onHover 가 있으면 map.on('hover') → onHover(자기 layerId 의 feature | null). 해제 함수 목록을 돌려준다(destroy 에서 모두 부름).
 * combineLayers 의 부분 레이어는 legendRefresh=false — 범례 구독은 묶음이 한 번만 한다.
 */
export function connect({ map, legend, layerId, onLegend, onHover, legendRefresh = true }) {
  const offs = [];
  if (legend && legendRefresh) offs.push(legend.onChange(() => { onLegend?.(); if (map && !map.destroyed) map.refreshLayer(layerId); }));
  if (map && onHover) offs.push(map.on('hover', (e) => onHover(e && e.layerId === layerId ? e.feature : null)));
  return offs;
}

/**
 * hover 강조 토글(기호·흐름선·핀 공통): itemOf(feature) → {el} | undefined. 돌려주는 함수 onHover(f) 가 자기 것이면 그 요소에 is-hover 를 붙이고
 * 앞의 것에서 뗀다. current() = 지금 강조된 feature(다시 만든 요소에도 drawSvg 가 같은 클래스를 다시 붙일 수 있게).
 */
export function hoverClass(itemOf) {
  let hovered = null;
  const onHover = (f) => {
    const nf = f && itemOf(f) ? f : null;
    if (nf === hovered) return;
    if (hovered) itemOf(hovered)?.el?.classList.remove('is-hover');
    hovered = nf;
    if (hovered) itemOf(hovered)?.el?.classList.add('is-hover');
  };
  onHover.current = () => hovered;
  return onHover;
}
