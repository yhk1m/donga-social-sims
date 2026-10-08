// © 2026 김용현
// src/atlas/lod.js — 확대 수준 k 와 화면이 단원 범위 안인지에 따라 쓸 바탕 지도 상세도를 고른다(순수 함수).
//   세계 = Natural Earth 110m, 확대(k ≥ 2) = 50m, 단원 범위 안에서 더 확대(k ≥ 4) = 10m(단원 범위로 자른 '10a').

export const DETAIL_K50 = 2;
export const DETAIL_K10 = 4;

/** k: d3-zoom 확대 배율(1 = 전체), inUnit: 화면 중심이 단원 범위 안인가 → '110' | '50' | '10a' */
export function pickDetail(k, inUnit = false) {
  if (k < DETAIL_K50) return '110';
  if (k >= DETAIL_K10 && inUnit) return '10a';
  return '50';
}

/** lonlat 이 단원 범위 상자들([[west, south, east, north], …], basemap.json meta.unitBoxes) 중 하나에 드는가. 경도는 ±360 감김을 본다. */
export function inUnit([lon, lat], boxes) {
  for (const [w, s, e, n] of boxes || []) {
    if (lat < s || lat > n) continue;
    for (const L of [lon, lon - 360, lon + 360]) if (L >= w && L <= e) return true;
  }
  return false;
}

/** 상세도 → basemap.json(TopoJSON)의 객체 이름. 110m 은 하천·호수를 싣지 않는다(null). */
export function detailObjects(level) {
  if (level === '110') return { land: 'land110', countries: 'countries110', rivers: null, lakes: null };
  if (level === '50' || level === '10a') {
    return { land: `land${level}`, countries: `countries${level}`, rivers: `rivers${level}`, lakes: `lakes${level}` };
  }
  throw new Error(`모르는 상세도: ${level}`);
}
