// © 2026 김용현
// scripts/atlas/georef.mjs — 교과서 지도 기준점에 투영식을 맞추는 순수 라이브러리. 앱과 같은 d3 투영을 쓴다.
// (CLI 는 georef-cli.mjs)
//
//   fitControls(cps)          기준점 [{xy:[x,y] (지면 pt), lon, lat, src?}] → {family, params, sim, rmsPt, meanPt, resid, candidates}
//   fitWithTps(cps)           fitControls + 잔차가 크면 thin-plate spline 보정(fit.tps)
//   robustFit(cps)            경위선 교차점(src:'grid') 중 튀는 점을 빼고 fitControls
//   makeConverter(fit)        {apply([lon,lat]) → [x,y] | null, invert([x,y]) → [lon,lat] | null} — 투영을 한 번만 만든다
//   applyFit / invertFit      makeConverter 의 캐시(WeakMap)를 쓰는 짧은 이름
//   inControlHull(fit, xy)    TPS 보정이 온전히 걸리는 기준점 볼록 껍질 안인가
//   fitProjection(fit)        d3 geoPath 용 투영 객체(잘라내기·재표본 포함)
//
// fit 객체는 만든 뒤 바꾸지 않는다(변환기를 객체별로 캐시하므로). 바꾸려면 새 객체를 만든다.
import * as g from 'd3-geo';
import { FAMILIES, applySim, invertSim, tpsKernel as U, inHull, nearestOnHull, tpsRaw, tpsDelta } from '../../src/atlas/fitCore.js';

// 후보 도법(FAMILIES)·닮음 변환·TPS 계산은 앱과 같은 공통 모듈(src/atlas/fitCore.js)에서 — 앱(fitProject.js)과 구성상 같은 값.
const INIT = { azimuthalEqualArea: [100, 40], azimuthalEquidistant: [100, 40], conicEqualArea: [100, 25, 50], conicConformal: [100, 25, 50], miller: [100], robinson: [100], equirectangular: [100], mercator: [100] };
export const FAMILY_NAMES = Object.keys(FAMILIES);
export const PT_MM = 0.3528;
// 모양을 정하는 실제 매개변수 수(중심 경도처럼 닮음 변환이 흡수하는 것은 빼고) — 비슷하면 적은 쪽을 고른다
const PARAMS = { azimuthalEqualArea: 2, azimuthalEquidistant: 2, conicEqualArea: 2, conicConformal: 1, miller: 0, robinson: 1, equirectangular: 0, mercator: 0 };

const norm180 = (v) => ((v + 540) % 360) - 180;
const finite2 = (p) => !!p && Number.isFinite(p[0]) && Number.isFinite(p[1]);

/** 경도의 원형 평균(날짜 변경선을 걸쳐도 맞다) */
function lonMean(lons) {
  let s = 0, c = 0; for (const l of lons) { s += Math.sin(l * Math.PI / 180); c += Math.cos(l * Math.PI / 180); }
  return Math.atan2(s, c) * 180 / Math.PI;
}

/** 맞춘 식의 d3 투영(배율 1, 이동 0). 지면 좌표 = sim(이 투영). 부를 때마다 새로 만든다 — 반복 변환에는 makeConverter. */
export function rawProjection(fit) { return FAMILIES[fit.family](fit.params).scale(1).translate([0, 0]); }

// 투영 단위 좌표 → 지면 pt: 닮음 변환(배율·회전·이동)을 최소제곱으로 닫힌 해로 구한다
function similarity(src, dst) {
  const n = src.length; let sx = 0, sy = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) { sx += src[i][0]; sy += src[i][1]; dx += dst[i][0]; dy += dst[i][1]; }
  sx /= n; sy /= n; dx /= n; dy /= n;
  let a = 0, b = 0, d = 0;
  for (let i = 0; i < n; i++) {
    const u = src[i][0] - sx, v = src[i][1] - sy, X = dst[i][0] - dx, Y = dst[i][1] - dy;
    a += u * X + v * Y; b += u * Y - v * X; d += u * u + v * v;
  }
  a /= d; b /= d;
  return { a, b, tx: dx - (a * sx - b * sy), ty: dy - (b * sx + a * sy) };
}
function evaluate(family, params, cps) {
  if (!params.every(Number.isFinite)) return { rms: Infinity };
  if (family.startsWith('conic') && Math.abs(params[1] + params[2]) < 1e-3) return { rms: Infinity };
  const proj = FAMILIES[family](params).scale(1).translate([0, 0]);
  const src = cps.map((c) => proj([c.lon, c.lat]));
  if (!src.every(finite2)) return { rms: Infinity };
  const sim = similarity(src, cps.map((c) => c.xy));
  if (!Number.isFinite(sim.a) || !Number.isFinite(sim.b)) return { rms: Infinity };
  let e = 0; const resid = [];
  for (let i = 0; i < cps.length; i++) {
    const [x, y] = applySim(sim, src[i]); const r = Math.hypot(x - cps[i].xy[0], y - cps[i].xy[1]);
    resid.push(r); e += r * r;
  }
  return { rms: Math.sqrt(e / cps.length), sim, resid };
}

/** Nelder–Mead 최소화(작은 차원용). 유한하지 않은 값(NaN·Infinity)은 아주 큰 벌점으로 바꿔 순서를 일관되게 한다.
 *  함숫값 폭 ≤ ftol 이고 단체 지름 ≤ xtol 이면 일찍 멈춘다. 반환 {x, fx, iters}. */
export function nelderMead(f0, x0, step = 5, maxIter = 400, { ftol = 1e-12, xtol = 1e-9 } = {}) {
  const BIG = 1e300;
  const f = (x) => { const v = f0(x); return Number.isFinite(v) ? v : BIG; };
  const n = x0.length; let s = [x0.slice()];
  for (let i = 0; i < n; i++) { const x = x0.slice(); x[i] += step; s.push(x); }
  let fs = s.map(f), k = 0;
  const sortS = () => { const idx = fs.map((v, i) => i).sort((i, j) => fs[i] - fs[j] || i - j); s = idx.map((i) => s[i]); fs = idx.map((i) => fs[i]); };
  for (; k < maxIter; k++) {
    sortS();
    let diam = 0; for (let i = 1; i <= n; i++) for (let j = 0; j < n; j++) diam = Math.max(diam, Math.abs(s[i][j] - s[0][j]));
    if (fs[n] - fs[0] <= ftol * (1 + Math.abs(fs[0])) && diam <= xtol * (1 + Math.max(...s[0].map(Math.abs)))) break;
    const c = Array(n).fill(0); for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) c[j] += s[i][j] / n;
    const xr = c.map((v, j) => v + (v - s[n][j])); const fr = f(xr);
    if (fr < fs[0]) { const xe = c.map((v, j) => v + 2 * (v - s[n][j])); const fe = f(xe); [s[n], fs[n]] = fe < fr ? [xe, fe] : [xr, fr]; }
    else if (fr < fs[n - 1]) { s[n] = xr; fs[n] = fr; }
    else {
      const xc = c.map((v, j) => v + 0.5 * (s[n][j] - v)); const fc = f(xc);
      if (fc < fs[n]) { s[n] = xc; fs[n] = fc; } else { for (let i = 1; i <= n; i++) { s[i] = s[i].map((v, j) => s[0][j] + 0.5 * (v - s[0][j])); fs[i] = f(s[i]); } }
    }
  }
  sortS();
  return { x: s[0], fx: fs[0] >= 1e300 ? Infinity : fs[0], iters: k };
}

// 원통 도법에서 중심 경도를 바꾸는 것은 이음선(중심 경도 ± 180°)이 기준점 경도 사이 같은 빈틈에 있는 한
// 지면에서 평행 이동일 뿐이라 기준점으로 정해지지 않는다. 이음선을 그 빈틈의 한가운데로 옮겨 하나로 정한다.
const CYLINDRICAL = new Set(['miller', 'equirectangular', 'mercator']);
function seamCentred(lon0, cps) {
  const seam = norm180(lon0 + 180);
  const lons = [...new Set(cps.map((c) => norm180(c.lon)))].sort((a, b) => a - b);
  for (let i = 0; i < lons.length; i++) {
    const a = lons[i], b = i + 1 < lons.length ? lons[i + 1] : lons[0] + 360;
    const sx = seam < a ? seam + 360 : seam;
    if (sx > a && sx < b) return norm180((a + b) / 2 + 180);
  }
  return lon0;
}

// 원뿔 도법에서 중심 경도를 바꾸는 것은 지면에서 꼭짓점을 중심으로 한 회전일 뿐이라(닮음 변환이 흡수) 정해지지 않고,
// 정각 원뿔은 두 표준위선이 원뿔 상수 n 으로만 모양을 정한다. 그래서 원뿔은 중심 경도를 고정하고
// 정각은 표준위선 하나(φ0, n = sin φ0), 정적은 둘을 맞춘 뒤, 중심 경선이 지면에서 세로가 되도록 중심 경도를 고른다.
function shapeSpace(fam, lon0) {
  if (fam === 'conicConformal') return { x0: [INIT[fam][1]], toParams: (q) => [lon0, q[0], q[0]] };
  if (fam === 'conicEqualArea') return { x0: INIT[fam].slice(1), toParams: (q) => [lon0, q[0], q[1]] };
  return null;
}

function uprightConic(fam, params, cps) {
  const theta = (p) => { const e = evaluate(fam, p, cps); return e.sim ? Math.atan2(e.sim.b, e.sim.a) : NaN; };
  const p = params.slice();
  for (let k = 0; k < 4; k++) {
    const t0 = theta(p), t1 = theta([p[0] + 1, p[1], p[2]]);
    let dt = t1 - t0; if (dt > Math.PI) dt -= 2 * Math.PI; if (dt < -Math.PI) dt += 2 * Math.PI;
    if (!Number.isFinite(t0) || Math.abs(dt) < 1e-9) break;
    p[0] = norm180(p[0] - t0 / dt);
    if (Math.abs(t0) < 1e-10) break;
  }
  return p;
}

// 방위 도법 회전 [λ, φ] 와 [λ+180, 180-φ] 는 같은 중심(지면 180° 회전 차이) → 중심 위도를 -90~90 으로
function normAzimuthal(p) {
  let [lon, lat] = [norm180(p[0]), norm180(p[1])];
  if (lat > 90) { lat = 180 - lat; lon = norm180(lon + 180); }
  if (lat < -90) { lat = -180 - lat; lon = norm180(lon + 180); }
  return [lon, lat];
}

function polish(f, x0, steps = [10, 1, 0.1]) {
  let r = { x: x0, fx: f(x0) };
  for (const st of steps) r = nelderMead(f, r.x, st, 300);
  return r;
}

function fitFamily(fam, cps) {
  const mlon = lonMean(cps.map((c) => c.lon));
  const sp = shapeSpace(fam, mlon);
  let params;
  if (sp) {
    const r = polish((q) => evaluate(fam, sp.toParams(q), cps).rms, sp.x0);
    params = uprightConic(fam, sp.toParams(r.x), cps);
  } else {
    const f = (p) => evaluate(fam, p, cps).rms;
    // 여러 출발점: 기본값 + 기준점 평균 경도와 그 반대편(태평양 중심 지도 등) + 150°E
    const starts = [INIT[fam], [mlon, ...INIT[fam].slice(1)], [norm180(mlon + 180), ...INIT[fam].slice(1)], [150, ...INIT[fam].slice(1)]];
    let best = null;
    for (const x0 of starts) { const r = polish(f, x0); if (!best || r.fx < best.fx) best = r; }
    params = best.x.slice(); params[0] = norm180(params[0]);
    if (fam.startsWith('azimuthal')) params = normAzimuthal(params);
    if (CYLINDRICAL.has(fam)) params[0] = seamCentred(params[0], cps);
  }
  return { params, ...evaluate(fam, params, cps) };
}

/** 작은 지역 기준(°): 기준점의 경도·위도 폭이 둘 다 이보다 작으면 도법 차이가 잔차에 드러나지 않아
 *  도법·중심을 고를 수 없다 → 기준점 평균 경위도 중심의 사각 정거 원통(그 자리에서 거의 정각)에 닮음 변환만 맞춘다. */
export const SMALL_AREA_DEG = 2;

/** 기준점 → 가장 잘 맞는 투영식. 반환: {family, params, sim, rmsPt, meanPt, resid, candidates, smallArea?}.
 *  rms 가 최소인 식을 고르되, 매개변수가 더 적은 식의 rms 가 최소의 1.05배 + 0.02pt 안이면 그것을 고른다(과적합 방지). */
export function fitControls(cps, families = FAMILY_NAMES) {
  const mlon = lonMean(cps.map((c) => c.lon));
  const dl = cps.map((c) => norm180(c.lon - mlon)), lats = cps.map((c) => c.lat);
  if (Math.max(...dl) - Math.min(...dl) < SMALL_AREA_DEG && Math.max(...lats) - Math.min(...lats) < SMALL_AREA_DEG) {
    const params = [mlon, lats.reduce((a, b) => a + b, 0) / lats.length], e = evaluate('equirectangular', params, cps);
    return { family: 'equirectangular', params, sim: e.sim, rmsPt: e.rms, meanPt: e.resid.reduce((a, b) => a + b, 0) / e.resid.length,
      resid: e.resid, smallArea: true, candidates: [{ family: 'equirectangular', rmsPt: e.rms }] };
  }
  const all = families.map((fam) => ({ family: fam, ...fitFamily(fam, cps) })).filter((r) => Number.isFinite(r.rms));
  if (!all.length) throw new Error('어느 도법으로도 기준점을 투영할 수 없음');
  all.sort((a, b) => a.rms - b.rms);
  const top = all[0];
  const best = all.filter((r) => r.rms <= top.rms * 1.05 + 0.02).sort((a, b) => PARAMS[a.family] - PARAMS[b.family] || a.rms - b.rms)[0];
  return {
    family: best.family, params: best.params, sim: best.sim, rmsPt: best.rms,
    meanPt: best.resid.reduce((a, b) => a + b, 0) / best.resid.length, resid: best.resid,
    candidates: all.map((r) => ({ family: r.family, rmsPt: r.rms })),
  };
}

/** 경위선 교차점(src:'grid')은 글자 짝짓기 실수가 섞일 수 있다. 잔차 최대인 점이 max(minPt, k×중앙값)을 넘고
 *  src 가 'grid' 이면 빼고 다시 맞춘다(기준점 minN 개 이상일 때만, 최대 maxFrac 비율까지).
 *  반환 {cps: 남은 기준점, dropped: [{name, xy, residPt}], fit: 남은 기준점의 fitControls 결과}. */
export function robustFit(cps, { minPt = 2.5, k = 4, minN = 12, maxFrac = 0.1, families } = {}) {
  let cur = cps.slice(); const dropped = [];
  for (;;) {
    const fit = fitControls(cur, families);
    const sorted = [...fit.resid].sort((a, b) => a - b), med = sorted[Math.floor(sorted.length / 2)];
    const w = fit.resid.indexOf(Math.max(...fit.resid));
    if (cur.length < minN || fit.resid[w] <= Math.max(minPt, k * med) || dropped.length >= Math.floor(cps.length * maxFrac) || cur[w].src !== 'grid')
      return { cps: cur, dropped, fit };
    dropped.push({ name: cur[w].name || `${cur[w].lon},${cur[w].lat}`, xy: cur[w].xy, residPt: +fit.resid[w].toFixed(2) });
    cur = cur.filter((_, i) => i !== w);
  }
}

// ── thin-plate spline: 기본 식의 지면 좌표 p → 보정량 d(p) ────────────────
// 좌표는 중심(cx, cy)을 빼고 범위 s(가로·세로 폭 중 큰 값)로 나눠 [-0.5, 0.5] 근처로 정규화해서 푼다.
// λ 는 이 정규화 좌표에서의 정규화 값(상대값): 1e-6 ≈ 보간(기준점을 거의 그대로 지남), 키울수록 매끈해진다.
// 기준점 볼록 껍질 바깥에서는 껍질 위 가장 가까운 점의 보정량을 쓰고, 껍질에서 멀어질수록 TPS_TAPER × s 거리에 걸쳐 0 으로 줄인다.
export const TPS_LAMBDA = 1e-6;
export const TPS_TAPER = 0.1;
const TPS_DEDUPE_PT = 0.01;

function luFactor(A) { // 부분 피벗 LU (제자리)
  const n = A.length, piv = [...Array(n).keys()];
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    if (Math.abs(A[p][c]) < 1e-14) throw new Error('TPS 선형계가 특이함');
    if (p !== c) { [A[c], A[p]] = [A[p], A[c]]; [piv[c], piv[p]] = [piv[p], piv[c]]; }
    for (let r = c + 1; r < n; r++) { const k = (A[r][c] /= A[c][c]); if (k) for (let j = c + 1; j < n; j++) A[r][j] -= k * A[c][j]; }
  }
  return { LU: A, piv };
}
function luSolve({ LU, piv }, b) {
  const n = LU.length, x = piv.map((i) => b[i]);
  for (let i = 0; i < n; i++) for (let j = 0; j < i; j++) x[i] -= LU[i][j] * x[j];
  for (let i = n - 1; i >= 0; i--) { for (let j = i + 1; j < n; j++) x[i] -= LU[i][j] * x[j]; x[i] /= LU[i][i]; }
  return x;
}

function convexHull(pts) { // monotone chain, 반시계(화면 좌표에서는 시계) 순서
  const P = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (P.length < 3) return P;
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const p of P) { while (lo.length >= 2 && cross(lo.at(-2), lo.at(-1), p) <= 0) lo.pop(); lo.push(p); }
  for (const p of P.reverse()) { while (up.length >= 2 && cross(up.at(-2), up.at(-1), p) <= 0) up.pop(); up.push(p); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}
/** TPS 맞추기: 기본 식 지면 좌표 pts → 보정량 vals. 0.01pt 안에 겹친 점은 평균해 하나로 합친다. */
export function tpsFit(pts0, vals0, lambda = TPS_LAMBDA) {
  const pts = [], vals = [], cnt = [];
  for (let i = 0; i < pts0.length; i++) {
    const j = pts.findIndex((p) => Math.hypot(p[0] - pts0[i][0], p[1] - pts0[i][1]) < TPS_DEDUPE_PT);
    if (j < 0) { pts.push(pts0[i].slice()); vals.push(vals0[i].slice()); cnt.push(1); }
    else { const c = ++cnt[j]; vals[j] = vals[j].map((v, k) => v + (vals0[i][k] - v) / c); }
  }
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const cx = (Math.max(...xs) + Math.min(...xs)) / 2, cy = (Math.max(...ys) + Math.min(...ys)) / 2;
  const s = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) || 1;
  const q = pts.map(([x, y]) => [(x - cx) / s, (y - cy) / s]);
  const n = q.length, N = n + 3;
  const A = Array.from({ length: N }, () => Array(N).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) A[i][j] = U((q[i][0] - q[j][0]) ** 2 + (q[i][1] - q[j][1]) ** 2);
    A[i][i] += lambda;
    A[i][n] = A[n][i] = 1; A[i][n + 1] = A[n + 1][i] = q[i][0]; A[i][n + 2] = A[n + 2][i] = q[i][1];
  }
  const lu = luFactor(A); // 한 번 분해해 x·y 두 오른쪽 변에 쓴다
  const sx = luSolve(lu, [...vals.map((v) => v[0]), 0, 0, 0]);
  const sy = luSolve(lu, [...vals.map((v) => v[1]), 0, 0, 0]);
  return { cx, cy, s, pts: q, wx: sx.slice(0, n), wy: sy.slice(0, n), ax: sx.slice(n), ay: sy.slice(n), lambda,
    hull: convexHull(pts), taper: TPS_TAPER * s };
}

export { tpsDelta }; // 예전 이름 그대로(공통 모듈 fitCore.js)

/** 지면 pt 가 TPS 기준점 볼록 껍질 안인가. TPS 가 없는 fit 은 보정 범위 개념이 없어 true. */
export function inControlHull(fit, xy) {
  return fit.tps ? inHull(fit.tps.hull, xy) : true;
}

// ── 변환기 ───────────────────────────────────────────────────────────────
const converters = new WeakMap();
const INVERT_TOL_PT = 0.01;

/** fit → {apply, invert}. d3 투영을 한 번만 만들어 둔다(같은 fit 객체에는 같은 변환기를 돌려준다).
 *  apply([lon,lat]) → [x,y] 지면 pt, 투영할 수 없거나(잘린 반구 등) 유한하지 않으면 null.
 *  invert([x,y]) → [lon,lat]: 보정 없는 역함수로 시작해 (TPS 가 있으면) 뉴턴 반복으로 다듬는다.
 *    수렴하지 않거나, 유한하지 않거나, apply(결과)가 입력에서 0.01pt 넘게 떨어지면 null. */
export function makeConverter(fit) {
  let cv = converters.get(fit);
  if (cv) return cv;
  const proj = rawProjection(fit), sim = fit.sim, tps = fit.tps;
  const base = (ll) => { if (!finite2(ll)) return null; const p = proj(ll); return finite2(p) ? applySim(sim, p) : null; };
  const apply = (ll) => {
    const p = base(ll); if (!p) return null;
    if (!tps) return p;
    const d = tpsDelta(tps, p), r = [p[0] + d[0], p[1] + d[1]];
    return finite2(r) ? r : null;
  };
  const err = (ll, xy) => { const p = apply(ll); return p ? [p[0] - xy[0], p[1] - xy[1]] : null; };
  const invert = (xy) => {
    if (!finite2(xy)) return null;
    let ll = proj.invert(invertSim(sim, xy));
    if (!finite2(ll)) return null;
    let e = err(ll, xy); if (!e) return null;
    if (tps) {
      const h = 1e-6;
      for (let k = 0; k < 30 && Math.hypot(e[0], e[1]) > 1e-9; k++) {
        const ex = err([ll[0] + h, ll[1]], xy), ey = err([ll[0], ll[1] + h], xy);
        if (!ex || !ey) return null;
        const J = [(ex[0] - e[0]) / h, (ey[0] - e[0]) / h, (ex[1] - e[1]) / h, (ey[1] - e[1]) / h];
        const det = J[0] * J[3] - J[1] * J[2];
        if (!Number.isFinite(det) || Math.abs(det) < 1e-300) return null;
        let dl = [-(J[3] * e[0] - J[1] * e[1]) / det, -(-J[2] * e[0] + J[0] * e[1]) / det];
        // 줄어들 때까지 걸음을 반으로(되돌이 탐색)
        let next = null, ne = null;
        for (let half = 0; half < 20; half++) {
          next = [ll[0] + dl[0], ll[1] + dl[1]]; ne = err(next, xy);
          if (ne && Math.hypot(ne[0], ne[1]) < Math.hypot(e[0], e[1])) break;
          dl = [dl[0] / 2, dl[1] / 2]; ne = null;
        }
        if (!ne) break;
        ll = next; e = ne;
      }
    }
    if (!finite2(ll) || Math.hypot(e[0], e[1]) > INVERT_TOL_PT) return null;
    return [norm180(ll[0]), ll[1]];
  };
  cv = { apply, invert, projection: proj };
  converters.set(fit, cv);
  return cv;
}

/** 경위도 → 지면 pt (fit.tps 가 있으면 보정 포함). 투영할 수 없으면 null. */
export function applyFit(fit, lonlat) { return makeConverter(fit).apply(lonlat); }

/** 지면 pt → 경위도. 역변환이 확실하지 않으면 null(makeConverter 참고). */
export function invertFit(fit, xy) { return makeConverter(fit).invert(xy); }

/** 기준점 → 투영식 + (필요하면) TPS 보정. 반환: fitControls 결과에 {tps?, rmsTpsPt?, meanTpsPt?, looMeanPt?} 를 더한 새 객체.
 *  TPS 는 기본 식 rms > threshold 이고 기준점이 minPoints 개 이상일 때만 붙인다(적은 점은 보간이 곧 과적합). */
export function fitWithTps(cps, { threshold = 0.5, lambda = TPS_LAMBDA, minPoints = 12, families } = {}) {
  const fit = fitControls(cps, families);
  if (!(fit.rmsPt > threshold) || cps.length < minPoints) return fit;
  const base = cps.map((c) => applyFit(fit, [c.lon, c.lat]));
  const vals = cps.map((c, i) => [c.xy[0] - base[i][0], c.xy[1] - base[i][1]]);
  const out = { ...fit, tps: tpsFit(base, vals, lambda) };
  const r = cps.map((c) => { const p = applyFit(out, [c.lon, c.lat]); return Math.hypot(p[0] - c.xy[0], p[1] - c.xy[1]); });
  out.rmsTpsPt = Math.sqrt(r.reduce((a, b) => a + b * b, 0) / r.length);
  out.meanTpsPt = r.reduce((a, b) => a + b, 0) / r.length;
  // 한 점 빼고 맞추기(leave-one-out): 기준점 사이에서 기대되는 오차
  let loo = 0;
  for (let k = 0; k < cps.length; k++) {
    const idx = cps.map((_, i) => i).filter((i) => i !== k);
    const t = tpsFit(idx.map((i) => base[i]), idx.map((i) => vals[i]), lambda);
    const d = tpsDelta(t, base[k]);
    loo += Math.hypot(base[k][0] + d[0] - cps[k].xy[0], base[k][1] + d[1] - cps[k].xy[1]);
  }
  out.looMeanPt = loo / cps.length;
  return out;
}

/** d3 stream 용 투영 객체: geoPath(fitProjection(fit), ctx) 로 경위도 도형을 지면 pt 로 그린다(투영 잘라내기·재표본 포함). */
export function fitProjection(fit) {
  const s = Math.hypot(fit.sim.a, fit.sim.b);
  const proj = rawProjection(fit).precision(0.3 / s);
  return {
    stream(out) {
      const tf = {
        point(x, y) { const p = applySim(fit.sim, [x, y]); const d = fit.tps ? tpsDelta(fit.tps, p) : [0, 0]; out.point(p[0] + d[0], p[1] + d[1]); },
        lineStart() { out.lineStart(); }, lineEnd() { out.lineEnd(); }, polygonStart() { out.polygonStart(); }, polygonEnd() { out.polygonEnd(); },
        sphere() { if (out.sphere) out.sphere(); },
      };
      return proj.stream(tf);
    },
  };
}
