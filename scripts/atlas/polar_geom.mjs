// © 2026 김용현
// scripts/atlas/polar_geom.mjs — 극지방 면 다듬기(U6-3e, 순수 함수 — u6 파이프라인 전용: U6-4 build_layers 가 극 면·빙붕 레이어를 만들 때 부름).
//   공유 엔진·조각은 그대로: 앱 렌더러는 면을 경위도 평면에서 화면 밖 미리 자르기(src/atlas/geoClip.clipIndexed — 경도 [−180, 180] 조각 가정) 한 뒤
//   d3 구면 투영으로 그리므로, 자료가 아래 꼴이면 밀러·로빈슨·구드·극 중심·지구본 어디서나 같은 면이 된다.
//   - 극점 꼭짓점(55쪽 북극해 영유권 — 면들이 북극점 「+」에서 만남)은 한 점 [λ, ±90] 이 아니라 앞뒤 꼭짓점 경도의 두 점 [λ앞, ±90]·[λ뒤, ±90] 으로
//     (expandPole): 한 점이면 경위도 평면에서 면이 세모가 되어 극이 화면 밖인 확대에서 미리 자르기가 부채꼴 끝을 잘라 먹는다(시험). 구면에서는 두 점이
//     같은 극이라 변 길이 0 — 바탕 지도 남극 대륙(Natural Earth)과 같은 꼴.
//   - 교과서 「+」 를 fit 으로 되돌린 자리는 극에서 조금 떨어진다(55쪽 영유권 88.7°N — U6-2) → snapPole(maxDeg 안이면 극으로).
//   - 날짜변경선을 넘는 면(러시아 영유권 부채꼴 등)은 경도를 이어 붙인 뒤(unwrap) ±180 에서 조각으로(splitAntimeridian — geoClip.clipPolygon 평면 자르기).
//   - 감김: d3 는 바깥 고리 시계 방향(경위도 평면, 북쪽 위)이 안쪽 — 평면 넓이로 맞추고, 그래도 구면 넓이가 2π sr 를 넘으면(「지구 − 면」) 뒤집음.
//   - 테두리(seamFreeOutline): Natural Earth 가 ±180 에서 쪼갠 면(로스 빙붕)·극 위 변은 테두리를 그으면 180° 경선·극에 선이 생기므로 그 변을 뺀 선 묶음.
//     빙붕 면은 채움만 하고 테두리는 이 선(같은 레이어의 선 type 'line')으로 — 렌더러 고침 없음.
import { geoArea } from 'd3-geo';
import { clipPolygon } from '../../src/atlas/geoClip.js';

const isPole = (q) => Math.abs(Math.abs(q[1]) - 90) < 1e-9;
const closed = (r) => r.length > 1 && r[0][0] === r[r.length - 1][0] && r[0][1] === r[r.length - 1][1];
const openRing = (r) => (closed(r) ? r.slice(0, -1) : r.slice());
const closeRing = (r) => (closed(r) ? r : [...r, [...r[0]]]);
const planarArea = (r) => { let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += r[j][0] * r[i][1] - r[i][0] * r[j][1]; return a / 2; };

/** 극에서 maxDeg(°) 안의 꼭짓점을 극 [λ, ±90] 으로(경도는 그대로). 고리 꼴(닫힘 여부) 그대로. */
export function snapPole(ring, maxDeg) {
  return ring.map((q) => (Math.abs(q[1]) >= 90 - maxDeg ? [q[0], Math.sign(q[1]) * 90] : [...q]));
}

/** 극 꼭짓점 하나(앞뒤가 극이 아닌 것)를 앞 꼭짓점 경도·뒤 꼭짓점 경도의 두 극 점으로. 이미 둘(이웃이 극)이면 그대로. 고리 꼴 그대로. */
export function expandPole(ring) {
  const wasClosed = closed(ring), r = openRing(ring), n = r.length, out = [];
  for (let i = 0; i < n; i++) {
    const q = r[i], a = r[(i - 1 + n) % n], b = r[(i + 1) % n];
    if (!isPole(q) || isPole(a) || isPole(b)) { out.push([...q]); continue; }
    const y = Math.sign(q[1]) * 90;
    out.push([a[0], y]);
    if (b[0] !== a[0]) out.push([b[0], y]);
  }
  return wasClosed ? closeRing(out) : out;
}

/** 고리 안에서 경도를 앞 점에 이어 붙임(±360) — 날짜변경선을 넘어도 경도가 이어지게. */
export function unwrapRing(ring) {
  const out = [];
  for (const q of ring) {
    let x = q[0];
    if (out.length) { const p = out[out.length - 1][0]; while (x - p > 180) x -= 360; while (x - p < -180) x += 360; }
    out.push([x, q[1]]);
  }
  return out;
}

/** 면(고리들)의 구면 넓이가 2π sr 를 넘으면(감김이 거꾸로라 「지구 − 면」) 고리 차례를 모두 뒤집는다. */
export function fixWinding(rings) {
  return geoArea({ type: 'Polygon', coordinates: rings }) > 2 * Math.PI ? rings.map((r) => [...r].reverse()) : rings;
}

/** 고리에서 연달아 같은 꼭짓점(날짜변경선 자른 자리에 clipPolygon 이 남기는 것 — 1e-9 안)을 하나로, 닫는 점은 다시 붙임 */
export function dedupRing(ring) {
  const same = (a, b) => Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9;
  const out = [];
  for (const q of openRing(ring)) if (!out.length || !same(out[out.length - 1], q)) out.push(q);
  while (out.length > 1 && same(out[0], out[out.length - 1])) out.pop();
  return out;
}

/** 경도를 이어 붙인 면(고리들, 바깥 시계 방향)을 [−180, 180] 조각들로 → 면 목록 [[바깥, 구멍…], …]. 한 창 안이면 옮기기만. */
export function splitAntimeridian(rings) {
  let lo = Infinity, hi = -Infinity;
  for (const r of rings) for (const [x] of r) { if (x < lo) lo = x; if (x > hi) hi = x; }
  const out = [];
  for (let k = Math.floor((lo + 180) / 360); k <= Math.floor((hi + 180 - 1e-9) / 360); k++) {
    const sh = 360 * k;
    for (const P of clipPolygon(rings, [-180 + sh, -90, 180 + sh, 90])) out.push(P.map((r) => r.map(([x, y]) => [x - sh, y])));
  }
  return out;
}

/**
 * 교과서 면 고리 하나(경위도 — fit 으로 되돌린 꼭짓점, 닫힘·감김 상관없음) → MultiPolygon 좌표 [[[λ, φ]…]…]:
 * 극 붙이기(snapDeg 안) → 극 꼭짓점 두 점으로 → 경도 이어 붙임 → 바깥 고리 시계 방향 → ±180 조각 → 조각마다 감김 확인.
 * pole 은 기록·검사용('N'|'S' — 극 꼭짓점이 그 극인지).
 */
export function polarPolygon(ring, { pole = 'N', snapDeg = 0 } = {}) {
  let r = openRing(ring);
  if (snapDeg > 0) r = snapPole(r, snapDeg);
  const sgn = pole === 'S' ? -1 : 1;
  if (r.some((q) => isPole(q) && Math.sign(q[1]) !== sgn)) throw new Error(`polarPolygon: 극 꼭짓점이 ${pole} 극이 아님`);
  r = unwrapRing(expandPole(r));
  if (planarArea(r) > 0) r.reverse();
  return splitAntimeridian([closeRing(r)]).map((P) => fixWinding(P.map((R) => closeRing(dedupRing(R)))));
}

/**
 * 면(Polygon·MultiPolygon)의 테두리 선 묶음(MultiLineString) — ±180 위 변(두 끝이 모두 경도 ±180, eps 안)과 극 위 변(두 끝이 모두 극)은 뺀다.
 * 고리의 끝 조각과 첫 조각은 이어 붙인다(테두리가 고리 시작점에서 끊기지 않게).
 */
export function seamFreeOutline(geom, { eps = 1e-4 } = {}) {
  const on180 = (q) => Math.abs(Math.abs(q[0]) - 180) <= eps;
  const atPole = (q) => Math.abs(Math.abs(q[1]) - 90) <= eps;
  const skip = (a, b) => (on180(a) && on180(b)) || (atPole(a) && atPole(b));
  const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.type === 'MultiPolygon' ? geom.coordinates : [];
  const lines = [];
  for (const P of polys) {
    for (const ring of P) {
      const r = closeRing(ring), runs = [];
      let cur = [r[0]];
      for (let i = 1; i < r.length; i++) {
        if (skip(r[i - 1], r[i])) { if (cur.length > 1) runs.push(cur); cur = [r[i]]; } else cur.push(r[i]);
      }
      if (cur.length > 1) runs.push(cur);
      if (runs.length > 1 && !skip(r[r.length - 2], r[r.length - 1]) && !skip(r[0], r[1])) {
        const last = runs.pop();
        runs[0] = [...last, ...runs[0].slice(1)];
      }
      lines.push(...runs);
    }
  }
  return { type: 'MultiLineString', coordinates: lines };
}
