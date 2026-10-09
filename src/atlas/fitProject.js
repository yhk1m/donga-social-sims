// © 2026 김용현
// src/atlas/fitProject.js — 교과서 지도의 투영식(fit: 도법·매개변수·닮음 변환 + TPS 보정)으로 경위도 → 지면 pt 를 앱에서 계산한다(순수 함수).
// 추출 파이프라인 scripts/atlas/georef.mjs 의 makeConverter(fit).apply 와 같은 값이다(tests/atlas/fitProject.test.mjs 가 견줌).
// 이미지 레이어(교과서 투영으로 그려진 밀도 음영)를 화면 투영으로 다시 그릴 때 쓴다: 화면 화소 → (화면 투영 invert) 경위도 → 이 함수 → 지면 pt → 이미지 화소.
// fit 은 scripts/atlas/pt2lonlat.mjs browserFit 이 만드는 {family, params, sim, tps?} — 생성물(overlay-*.json)의 fit 칸.
// georef.mjs 를 그대로 끌어오지 않는 까닭: 맞추기(최소제곱·LU)와 d3-geo-projection 전체 이름 공간 import 가 조각에 딸려 오지 않게.
import { geoAzimuthalEqualArea, geoAzimuthalEquidistant, geoConicEqualArea, geoConicConformal, geoEquirectangular, geoMercator } from 'd3-geo';
import { geoMiller, geoRobinson } from 'd3-geo-projection';

const FAMILIES = {
  azimuthalEqualArea: (p) => geoAzimuthalEqualArea().rotate([-p[0], -p[1]]),
  azimuthalEquidistant: (p) => geoAzimuthalEquidistant().rotate([-p[0], -p[1]]),
  conicEqualArea: (p) => geoConicEqualArea().rotate([-p[0], 0]).parallels([p[1], p[2]]),
  conicConformal: (p) => geoConicConformal().rotate([-p[0], 0]).parallels([p[1], p[2]]),
  miller: (p) => geoMiller().rotate([-p[0], 0]),
  robinson: (p) => geoRobinson().rotate([-p[0], 0]),
  equirectangular: (p) => geoEquirectangular().rotate([-p[0], -(p[1] || 0)]),
  mercator: (p) => geoMercator().rotate([-p[0], 0]),
};
const finite2 = (p) => !!p && Number.isFinite(p[0]) && Number.isFinite(p[1]);
const U = (r2) => (r2 > 0 ? 0.5 * r2 * Math.log(r2) : 0);

function inHull(H, [x, y]) {
  if (H.length < 3) return false;
  for (let i = 0; i < H.length; i++) {
    const a = H[i], b = H[(i + 1) % H.length];
    if ((b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]) < 0) return false;
  }
  return true;
}
function nearestOnHull(H, p) {
  let best = null, bd = Infinity;
  for (let i = 0; i < H.length; i++) {
    const a = H[i], b = H[(i + 1) % H.length], dx = b[0] - a[0], dy = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
    const q = [a[0] + t * dx, a[1] + t * dy], d = Math.hypot(p[0] - q[0], p[1] - q[1]);
    if (d < bd) { bd = d; best = q; }
  }
  return [best, bd];
}
function tpsRaw(t, [x, y]) {
  const u = (x - t.cx) / t.s, v = (y - t.cy) / t.s;
  let dx = t.ax[0] + t.ax[1] * u + t.ax[2] * v, dy = t.ay[0] + t.ay[1] * u + t.ay[2] * v;
  for (let i = 0; i < t.pts.length; i++) {
    const k = U((u - t.pts[i][0]) ** 2 + (v - t.pts[i][1]) ** 2); dx += t.wx[i] * k; dy += t.wy[i] * k;
  }
  return [dx, dy];
}
/** TPS 보정량(지면 pt): 기준점 껍질 안은 그대로, 밖은 껍질까지 거리에 따라 0 으로(georef.tpsDelta 와 같다). */
function tpsDelta(t, p) {
  if (inHull(t.hull, p)) return tpsRaw(t, p);
  const [q, d] = nearestOnHull(t.hull, p);
  const r = Math.min(1, d / t.taper), w = 1 - r * r * (3 - 2 * r);
  if (w <= 0) return [0, 0];
  const dq = tpsRaw(t, q);
  return [w * dq[0], w * dq[1]];
}

/** fit → (lonlat → [x, y] 지면 pt | null). 투영할 수 없으면 null. 모르는 도법 이름은 오류. */
export function makeFitForward(fit) {
  const mk = FAMILIES[fit?.family];
  if (!mk) throw new Error(`모르는 교과서 도법: ${fit?.family}`);
  const proj = mk(fit.params).scale(1).translate([0, 0]);
  const { a, b, tx, ty } = fit.sim, tps = fit.tps || null;
  return (ll) => {
    if (!finite2(ll)) return null;
    const q = proj(ll);
    if (!finite2(q)) return null;
    const p = [a * q[0] - b * q[1] + tx, b * q[0] + a * q[1] + ty];
    if (!tps) return p;
    const d = tpsDelta(tps, p), r = [p[0] + d[0], p[1] + d[1]];
    return finite2(r) ? r : null;
  };
}
