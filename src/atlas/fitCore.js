// © 2026 김용현
// src/atlas/fitCore.js — 교과서 지도 투영식(fit)의 공통 핵심(순수 함수). 추출 파이프라인(scripts/atlas/georef.mjs)과 앱(src/atlas/fitProject.js)이
// 같은 이 모듈을 써서 둘의 값이 늘 같다(구성상 일치).
//   FAMILIES[family](params) → 회전·표준위선까지 정한 d3 투영(배율 1·이동 0 은 부르는 쪽이)
//   registerFamily(name, fn) / familyOf(name)  단원 전용 도법 등록(U5-3a) · 고정 → 등록 차례로 찾기(없으면 undefined)
//   applySim(sim, [u, v]) / invertSim(sim, [x, y])  투영 단위 ↔ 지면 pt 닮음 변환
//   tpsDelta(tps, p) → TPS 보정량(지면 pt): 기준점 볼록 껍질 안은 TPS 그대로, 밖은 껍질까지 거리에 따라 0 으로(3t²−2t³)
//   tpsKernel(r²) = r² log r, inHull(H, p), nearestOnHull(H, p)
// d3-geo-projection 은 이름으로만 가져온다(조각 번들에 필요한 도법만 들어가게).
import { geoAzimuthalEqualArea, geoAzimuthalEquidistant, geoConicEqualArea, geoConicConformal, geoEquirectangular, geoMercator } from 'd3-geo';
import { geoMiller, geoRobinson } from 'd3-geo-projection';

/** 후보 도법: 이름 → (매개변수 → 회전·표준위선까지 정한 d3 투영) */
export const FAMILIES = Object.freeze({
  azimuthalEqualArea: (p) => geoAzimuthalEqualArea().rotate([-p[0], -p[1]]),
  azimuthalEquidistant: (p) => geoAzimuthalEquidistant().rotate([-p[0], -p[1]]),
  conicEqualArea: (p) => geoConicEqualArea().rotate([-p[0], 0]).parallels([p[1], p[2]]),
  conicConformal: (p) => geoConicConformal().rotate([-p[0], 0]).parallels([p[1], p[2]]),
  miller: (p) => geoMiller().rotate([-p[0], 0]),
  robinson: (p) => geoRobinson().rotate([-p[0], 0]),
  equirectangular: (p) => geoEquirectangular().rotate([-p[0], -(p[1] || 0)]), // p[1]: 작은 지역 지도의 중심 위도(사각 회전)
  mercator: (p) => geoMercator().rotate([-p[0], 0]),
});
// 단원 전용 도법(평사·정사 — americasExtra.installAmericasFamilies 가 등록). 고정 8개는 그대로, familyOf 가 고정 → 등록 차례로 찾는다.
const EXTRA_FAMILIES = {};
export const registerFamily = (name, fn) => { EXTRA_FAMILIES[name] = fn; };
export const familyOf = (name) => FAMILIES[name] || EXTRA_FAMILIES[name];

export const applySim = (s, [u, v]) => [s.a * u - s.b * v + s.tx, s.b * u + s.a * v + s.ty];
export const invertSim = ({ a, b, tx, ty }, [x, y]) => {
  const det = a * a + b * b, X = x - tx, Y = y - ty;
  return [(a * X + b * Y) / det, (-b * X + a * Y) / det];
};

/** TPS 기저 함수 r² log r (r² 를 받음) */
export const tpsKernel = (r2) => (r2 > 0 ? 0.5 * r2 * Math.log(r2) : 0);

/** 점이 볼록 껍질 H(반시계 — 화면 좌표에서는 시계) 안인가 */
export function inHull(H, [x, y]) {
  if (H.length < 3) return false;
  for (let i = 0; i < H.length; i++) {
    const a = H[i], b = H[(i + 1) % H.length];
    if ((b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]) < 0) return false;
  }
  return true;
}
/** 껍질 위 가장 가까운 점과 거리 → [점, 거리] */
export function nearestOnHull(H, p) {
  let best = null, bd = Infinity;
  for (let i = 0; i < H.length; i++) {
    const a = H[i], b = H[(i + 1) % H.length], dx = b[0] - a[0], dy = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
    const q = [a[0] + t * dx, a[1] + t * dy], d = Math.hypot(p[0] - q[0], p[1] - q[1]);
    if (d < bd) { bd = d; best = q; }
  }
  return [best, bd];
}
/** TPS 보정량(껍질 안팎 구분 없이 식 그대로) */
export function tpsRaw(t, [x, y]) {
  const u = (x - t.cx) / t.s, v = (y - t.cy) / t.s;
  let dx = t.ax[0] + t.ax[1] * u + t.ax[2] * v, dy = t.ay[0] + t.ay[1] * u + t.ay[2] * v;
  for (let i = 0; i < t.pts.length; i++) {
    const k = tpsKernel((u - t.pts[i][0]) ** 2 + (v - t.pts[i][1]) ** 2); dx += t.wx[i] * k; dy += t.wy[i] * k;
  }
  return [dx, dy];
}
/** 보정량(지면 pt). 껍질 안은 TPS 그대로, 바깥은 껍질 위 가장 가까운 점의 값을 거리에 따라 0 으로(3t²-2t³ 곡선) 줄인다. */
export function tpsDelta(t, p) {
  if (inHull(t.hull, p)) return tpsRaw(t, p);
  const [q, d] = nearestOnHull(t.hull, p);
  const r = Math.min(1, d / t.taper), w = 1 - r * r * (3 - 2 * r);
  if (w <= 0) return [0, 0];
  const dq = tpsRaw(t, q);
  return [w * dq[0], w * dq[1]];
}
