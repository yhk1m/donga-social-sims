// © 2026 김용현
// scripts/atlas/georef.mjs — 교과서 지도 기준점에 투영식을 맞춘다. 앱과 같은 d3 투영을 쓴다.
//
//   fitControls(cps)        기준점 [{xy:[x,y] (지면 pt), lon, lat}] → {family, params, sim, rmsPt, meanPt, resid}
//   fitWithTps(cps)         fitControls + 잔차가 크면(rms > 0.5pt, 기준점 12개 이상) thin-plate spline 보정(fit.tps)
//   applyFit(fit, [lon,lat]) → 지면 pt      invertFit(fit, [x,y]) → [lon,lat]   (둘 다 fit.tps 가 있으면 함께 적용)
//
// CLI (기준점은 extract_vectors.py --controls all 이 쓴 C:/Users/Public/atlas-work/vec/<id>.controls.json)
//   node scripts/atlas/georef.mjs --all            지도마다 C:/Users/Public/atlas-work/geo/<id>.fit.json + 표
//   node scripts/atlas/georef.mjs --verify <id|all> Natural Earth 해안선을 지도 렌더(150dpi) 위에 겹친 <id>.verify.png
import * as g from 'd3-geo';
import * as gp from 'd3-geo-projection';

// 후보: 이름 → (매개변수 → 회전·표준위선까지 정한 d3 투영)
const FAMILIES = {
  azimuthalEqualArea: (p) => g.geoAzimuthalEqualArea().rotate([-p[0], -p[1]]),
  azimuthalEquidistant: (p) => g.geoAzimuthalEquidistant().rotate([-p[0], -p[1]]),
  conicEqualArea: (p) => g.geoConicEqualArea().rotate([-p[0], 0]).parallels([p[1], p[2]]),
  conicConformal: (p) => g.geoConicConformal().rotate([-p[0], 0]).parallels([p[1], p[2]]),
  miller: (p) => gp.geoMiller().rotate([-p[0], 0]),
  robinson: (p) => gp.geoRobinson().rotate([-p[0], 0]),
  equirectangular: (p) => g.geoEquirectangular().rotate([-p[0], -(p[1] || 0)]), // p[1]: 작은 지역 지도의 중심 위도(사각 회전)
  mercator: (p) => g.geoMercator().rotate([-p[0], 0]),
};
const INIT = { azimuthalEqualArea: [100, 40], azimuthalEquidistant: [100, 40], conicEqualArea: [100, 25, 50], conicConformal: [100, 25, 50], miller: [100], robinson: [100], equirectangular: [100], mercator: [100] };
export const FAMILY_NAMES = Object.keys(FAMILIES);
export const PT_MM = 0.3528;

/** 맞춘 식의 d3 투영(배율 1, 이동 0). 지면 좌표 = sim(이 투영). */
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
const applySim = (s, [u, v]) => [s.a * u - s.b * v + s.tx, s.b * u + s.a * v + s.ty];
const invertSim = ({ a, b, tx, ty }, [x, y]) => {
  const det = a * a + b * b, X = x - tx, Y = y - ty;
  return [(a * X + b * Y) / det, (-b * X + a * Y) / det];
};

function evaluate(family, params, cps) {
  if (family.startsWith('conic') && Math.abs(params[1] + params[2]) < 1e-3) return { rms: Infinity };
  const proj = FAMILIES[family](params).scale(1).translate([0, 0]);
  const src = cps.map((c) => proj([c.lon, c.lat]));
  if (src.some((p) => !p || !isFinite(p[0]) || !isFinite(p[1]))) return { rms: Infinity };
  const sim = similarity(src, cps.map((c) => c.xy));
  if (!isFinite(sim.a)) return { rms: Infinity };
  let e = 0; const resid = [];
  for (let i = 0; i < cps.length; i++) {
    const [x, y] = applySim(sim, src[i]); const r = Math.hypot(x - cps[i].xy[0], y - cps[i].xy[1]);
    resid.push(r); e += r * r;
  }
  return { rms: Math.sqrt(e / cps.length), sim, resid };
}

// Nelder–Mead (작은 차원용)
function nelderMead(f, x0, step = 5, iters = 400) {
  const n = x0.length; let s = [x0];
  for (let i = 0; i < n; i++) { const x = x0.slice(); x[i] += step; s.push(x); }
  let fs = s.map(f);
  for (let k = 0; k < iters; k++) {
    const idx = fs.map((v, i) => i).sort((i, j) => fs[i] - fs[j]); s = idx.map((i) => s[i]); fs = idx.map((i) => fs[i]);
    const c = Array(n).fill(0); for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) c[j] += s[i][j] / n;
    const xr = c.map((v, j) => v + (v - s[n][j])); const fr = f(xr);
    if (fr < fs[0]) { const xe = c.map((v, j) => v + 2 * (v - s[n][j])); const fe = f(xe); [s[n], fs[n]] = fe < fr ? [xe, fe] : [xr, fr]; }
    else if (fr < fs[n - 1]) { s[n] = xr; fs[n] = fr; }
    else {
      const xc = c.map((v, j) => v + 0.5 * (s[n][j] - v)); const fc = f(xc);
      if (fc < fs[n]) { s[n] = xc; fs[n] = fc; } else { for (let i = 1; i <= n; i++) { s[i] = s[i].map((v, j) => s[0][j] + 0.5 * (v - s[0][j])); fs[i] = f(s[i]); } }
    }
  }
  const i0 = fs.indexOf(Math.min(...fs));
  return { x: s[i0], fx: fs[i0] };
}

// 모양을 정하는 실제 매개변수 수(중심 경도처럼 닮음 변환이 흡수하는 것은 빼고) — 비슷하면 적은 쪽을 고른다
const PARAMS = { azimuthalEqualArea: 2, azimuthalEquidistant: 2, conicEqualArea: 2, conicConformal: 1, miller: 0, robinson: 1, equirectangular: 0, mercator: 0 };
const norm180 = (v) => ((v + 540) % 360) - 180;

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
    if (!isFinite(t0) || Math.abs(dt) < 1e-9) break;
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
  const lons = cps.map((c) => c.lon), mlon = lons.reduce((a, b) => a + b, 0) / lons.length;
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

/** 기준점 → 가장 잘 맞는 투영식. 반환: {family, params, sim, rmsPt, meanPt, resid}.
 *  rms 가 최소인 식을 고르되, 그보다 매개변수가 적은 식의 rms 가 최소의 1.05배 + 0.02pt 안이면 그것을 고른다(과적합 방지). */
export const SMALL_AREA_DEG = 2;
export function fitControls(cps, families = FAMILY_NAMES) {
  // 작은 지역(기준점 경위도 폭 < 2°): 도법 차이가 잔차에 드러나지 않아 도법·중심을 고를 수 없다.
  // 기준점 평균 경위도를 중심으로 회전한 정거 원통(그 자리에서 거의 정각)에 닮음 변환만 맞춘다.
  const span = (k) => Math.max(...cps.map((c) => c[k])) - Math.min(...cps.map((c) => c[k]));
  if (span('lon') < SMALL_AREA_DEG && span('lat') < SMALL_AREA_DEG) {
    const mean = (k) => cps.reduce((a, c) => a + c[k], 0) / cps.length;
    const params = [mean('lon'), mean('lat')], e = evaluate('equirectangular', params, cps);
    return { family: 'equirectangular', params, sim: e.sim, rmsPt: e.rms, meanPt: e.resid.reduce((a, b) => a + b, 0) / e.resid.length,
      resid: e.resid, smallArea: true, candidates: [{ family: 'equirectangular', rmsPt: e.rms }] };
  }
  const all = families.map((fam) => ({ family: fam, ...fitFamily(fam, cps) })).filter((r) => isFinite(r.rms));
  all.sort((a, b) => a.rms - b.rms);
  const top = all[0];
  const ok = all.filter((r) => r.rms <= top.rms * 1.05 + 0.02).sort((a, b) => PARAMS[a.family] - PARAMS[b.family] || a.rms - b.rms);
  const best = ok[0];
  return {
    family: best.family, params: best.params, sim: best.sim, rmsPt: best.rms,
    meanPt: best.resid.reduce((a, b) => a + b, 0) / best.resid.length, resid: best.resid,
    candidates: all.map((r) => ({ family: r.family, rmsPt: r.rms })),
  };
}

// ── thin-plate spline: 기본 식의 지면 좌표 p → 보정량 d(p) ────────────────
const U = (r2) => (r2 > 0 ? 0.5 * r2 * Math.log(r2) : 0); // r² log r

function solve(A, b) { // 가우스 소거(부분 피벗)
  const n = b.length; const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    const piv = M[c][c]; if (Math.abs(piv) < 1e-14) throw new Error('TPS 선형계가 특이함');
    for (let r = c + 1; r < n; r++) { const k = M[r][c] / piv; if (k) for (let j = c; j <= n; j++) M[r][j] -= k * M[c][j]; }
  }
  const x = Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) { let s = M[r][n]; for (let j = r + 1; j < n; j++) s -= M[r][j] * x[j]; x[r] = s / M[r][r]; }
  return x;
}

export function tpsFit(pts, vals, lambda = 1e-3) {
  const n = pts.length, N = n + 3;
  const A = Array.from({ length: N }, () => Array(N).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) A[i][j] = U((pts[i][0] - pts[j][0]) ** 2 + (pts[i][1] - pts[j][1]) ** 2);
    A[i][i] += lambda;
    A[i][n] = A[n][i] = 1; A[i][n + 1] = A[n + 1][i] = pts[i][0]; A[i][n + 2] = A[n + 2][i] = pts[i][1];
  }
  const sx = solve(A, [...vals.map((v) => v[0]), 0, 0, 0]);
  const sy = solve(A, [...vals.map((v) => v[1]), 0, 0, 0]);
  return { pts, wx: sx.slice(0, n), wy: sy.slice(0, n), ax: sx.slice(n), ay: sy.slice(n), lambda };
}

export function tpsDelta(t, [x, y]) {
  let dx = t.ax[0] + t.ax[1] * x + t.ax[2] * y, dy = t.ay[0] + t.ay[1] * x + t.ay[2] * y;
  for (let i = 0; i < t.pts.length; i++) {
    const u = U((x - t.pts[i][0]) ** 2 + (y - t.pts[i][1]) ** 2); dx += t.wx[i] * u; dy += t.wy[i] * u;
  }
  return [dx, dy];
}

const baseApply = (fit, lonlat) => { const p = rawProjection(fit)(lonlat); return p && applySim(fit.sim, p); };

/** 기준점 → 투영식 + (필요하면) TPS 보정. 반환: fitControls 결과 + {tps?, rmsTpsPt?, meanTpsPt?, looMeanPt?}.
 *  TPS 는 기본 식 rms > threshold 이고 기준점이 minPoints 개 이상일 때만 붙인다(적은 점은 보간이 곧 과적합). */
export function fitWithTps(cps, { threshold = 0.5, lambda = 1e-3, minPoints = 12, families } = {}) {
  const fit = fitControls(cps, families);
  if (!(fit.rmsPt > threshold) || cps.length < minPoints) return fit;
  const base = cps.map((c) => baseApply(fit, [c.lon, c.lat]));
  const vals = cps.map((c, i) => [c.xy[0] - base[i][0], c.xy[1] - base[i][1]]);
  fit.tps = tpsFit(base, vals, lambda);
  const r = cps.map((c) => { const p = applyFit(fit, [c.lon, c.lat]); return Math.hypot(p[0] - c.xy[0], p[1] - c.xy[1]); });
  fit.rmsTpsPt = Math.sqrt(r.reduce((a, b) => a + b * b, 0) / r.length);
  fit.meanTpsPt = r.reduce((a, b) => a + b, 0) / r.length;
  // 한 점 빼고 맞추기(leave-one-out): 기준점 사이에서 기대되는 오차
  let loo = 0;
  for (let k = 0; k < cps.length; k++) {
    const idx = cps.map((_, i) => i).filter((i) => i !== k);
    const t = tpsFit(idx.map((i) => base[i]), idx.map((i) => vals[i]), lambda);
    const d = tpsDelta(t, base[k]);
    loo += Math.hypot(base[k][0] + d[0] - cps[k].xy[0], base[k][1] + d[1] - cps[k].xy[1]);
  }
  fit.looMeanPt = loo / cps.length;
  return fit;
}

/** 경위도 → 지면 pt (fit.tps 가 있으면 보정 포함) */
export function applyFit(fit, lonlat) {
  const p = baseApply(fit, lonlat);
  if (!p || !fit.tps) return p;
  const d = tpsDelta(fit.tps, p);
  return [p[0] + d[0], p[1] + d[1]];
}

/** 지면 pt → 경위도 (TPS 역보정 반복 + 닮음 역변환 + 투영 역함수) */
export function invertFit(fit, [x, y]) {
  let p = [x, y];
  if (fit.tps) {
    for (let k = 0; k < 100; k++) {
      const d = tpsDelta(fit.tps, p), q = [x - d[0], y - d[1]];
      const ch = Math.hypot(q[0] - p[0], q[1] - p[1]); p = q;
      if (ch < 1e-10) break;
    }
  }
  return rawProjection(fit).invert(invertSim(fit.sim, p));
}

/** d3 stream 용 투영 객체: geoPath(fitProjection(fit), ctx) 로 경위도 도형을 지면 pt 로 그린다(투영 잘라내기·재표본 포함). */
export function fitProjection(fit) {
  const s = Math.hypot(fit.sim.a, fit.sim.b);
  const proj = rawProjection(fit).precision(0.3 / s);
  return {
    stream(out) {
      const tf = { point(x, y) { const p = applySim(fit.sim, [x, y]); const d = fit.tps ? tpsDelta(fit.tps, p) : [0, 0]; out.point(p[0] + d[0], p[1] + d[1]); },
        lineStart() { out.lineStart(); }, lineEnd() { out.lineEnd(); }, polygonStart() { out.polygonStart(); }, polygonEnd() { out.polygonEnd(); }, sphere() { out.sphere && out.sphere(); } };
      return proj.stream(tf);
    },
  };
}

// ── CLI ──────────────────────────────────────────────────────────────────
async function cli(argv) {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const { spawnSync } = await import('node:child_process');
  const here = path.dirname(fileURLToPath(import.meta.url));
  const WORK = 'C:/Users/Public/atlas-work';
  const maps = JSON.parse(fs.readFileSync(path.join(here, 'maps_u2.json'), 'utf8'));
  const SKIP = new Set(['p22-kashmir']);
  const ACCEPT_MM = 0.5;
  fs.mkdirSync(`${WORK}/geo`, { recursive: true });

  const loadCps = (id) => {
    const f = `${WORK}/vec/${id}.controls.json`;
    if (!fs.existsSync(f)) throw new Error(`${f} 없음 — 먼저 python -I scripts/atlas/extract_vectors.py --controls all`);
    return JSON.parse(fs.readFileSync(f, 'utf8'));
  };
  const cpName = (c) => c.name || `${c.lon},${c.lat}`;

  // 경위선 교차점(src:'grid')은 글자 짝짓기 실수가 섞일 수 있어 튀는 점을 빼고 다시 맞춘다
  function robustFit(cps) {
    let cur = cps.slice(); const dropped = [];
    for (;;) {
      const fit = fitControls(cur);
      const med = [...fit.resid].sort((a, b) => a - b)[Math.floor(fit.resid.length / 2)];
      const k = fit.resid.indexOf(Math.max(...fit.resid));
      const lim = Math.max(2.5, 4 * med);
      if (cur.length < 12 || fit.resid[k] <= lim || dropped.length >= Math.floor(cps.length * 0.1) || cur[k].src !== 'grid') return { cps: cur, dropped };
      dropped.push({ name: cpName(cur[k]), xy: cur[k].xy, residPt: +fit.resid[k].toFixed(2) });
      cur = cur.filter((_, i) => i !== k);
    }
  }

  const r2 = (v) => Math.round(v * 100) / 100;
  if (argv[0] === '--all') {
    const rows = [];
    for (const m of maps) {
      if (SKIP.has(m.id)) { rows.push([m.id, '(맞추기 없음 — Natural Earth 분쟁 지역 자료 사용)']); continue; }
      const { cps, dropped } = robustFit(loadCps(m.id));
      const fit = fitWithTps(cps);
      const meanMm = fit.meanPt * PT_MM;
      const out = {
        id: m.id, family: fit.family, params: fit.params.map((v) => +v.toFixed(4)), sim: fit.sim,
        rmsPt: r2(fit.rmsPt), rmsMm: r2(fit.rmsPt * PT_MM), meanPt: r2(fit.meanPt), meanMm: r2(meanMm), maxPt: r2(Math.max(...fit.resid)),
        n: cps.length, src: [...new Set(cps.map((c) => c.src))],
        ...(fit.tps ? { tps: fit.tps, rmsTpsPt: r2(fit.rmsTpsPt), meanTpsPt: r2(fit.meanTpsPt), meanTpsMm: r2(fit.meanTpsPt * PT_MM), looMeanPt: r2(fit.looMeanPt), looMeanMm: r2(fit.looMeanPt * PT_MM) } : {}),
        dropped, candidates: fit.candidates.map((c) => ({ family: c.family, rmsPt: r2(c.rmsPt) })),
        resid: cps.map((c, i) => ({ name: cpName(c), residPt: r2(fit.resid[i]), ...(c.approx ? { approx: true } : {}) })),
      };
      if (fit.smallArea) out.smallArea = true;
      const reasons = [];
      if (meanMm > ACCEPT_MM) reasons.push(`평균 잔차 ${meanMm.toFixed(2)}mm > ${ACCEPT_MM}mm`);
      if (cps.length && cps.every((c) => c.approx)) reasons.push('기준점을 눈으로 찍음(모든 기준점 approx)');
      if (reasons.length) { out.approx = true; out.approxReason = reasons.join('; '); }
      fs.writeFileSync(`${WORK}/geo/${m.id}.fit.json`, JSON.stringify(out, null, 1));
      rows.push([m.id, out.family, out.params.map((v) => v.toFixed(1)).join(','), out.rmsPt.toFixed(2), out.rmsMm.toFixed(2), out.meanMm.toFixed(2),
        fit.tps ? `${out.meanTpsMm.toFixed(2)} (LOO ${out.looMeanMm.toFixed(2)})` : '-', cps.length, dropped.length || '', out.approx ? `approx: ${out.approxReason}` : '']);
    }
    console.log(`합격 기준: TPS 전 평균 잔차 meanMm ≤ ${ACCEPT_MM}mm (tpsMeanMm 는 참고: TPS 후 기준점 위 평균, 괄호는 한 점 빼고 맞춘 평균)`);
    console.log(['id', 'family', 'params', 'rmsPt', 'rmsMm', 'meanMm', 'tpsMeanMm', 'n', 'drop', ''].join('\t'));
    for (const r of rows) console.log(r.join('\t'));
    return 0;
  }

  if (argv[0] === '--verify') {
    const { feature } = await import('topojson-client');
    const ids = argv[1] === 'all' ? maps.map((m) => m.id).filter((id) => !SKIP.has(id)) : [argv[1]];
    const land = {};
    const getLand = (res) => {
      if (!land[res]) {
        const topo = JSON.parse(fs.readFileSync(path.join(here, '..', '..', 'node_modules', 'world-atlas', `land-${res}.json`), 'utf8'));
        land[res] = feature(topo, topo.objects.land);
      }
      return land[res];
    };
    for (const id of ids) {
      const m = maps.find((x) => x.id === id);
      const fit = JSON.parse(fs.readFileSync(`${WORK}/geo/${id}.fit.json`, 'utf8'));
      // 1° 가 몇 pt 인가로 해안선 해상도를 고른다(세계 지도는 50m, 나머지는 10m)
      const a = applyFit(fit, [fit.params[0], 10]), b = applyFit(fit, [fit.params[0] + 1, 10]);
      const ptPerDeg = Math.hypot(a[0] - b[0], a[1] - b[1]);
      const res = ptPerDeg < 4 ? '50m' : '10m';
      const lines = []; let cur = null;
      const [x0, y0, x1, y1] = m.bbox, pad = 40;
      const ctx = {
        moveTo(x, y) { cur = [[x, y]]; lines.push(cur); }, lineTo(x, y) { cur.push([x, y]); },
        closePath() { if (cur && cur.length) cur.push(cur[0]); }, arc() {}, rect() {},
      };
      g.geoPath(fitProjection(fit), ctx)(getLand(res));
      const keep = lines.filter((L) => L.some(([x, y]) => x > x0 - pad && x < x1 + pad && y > y0 - pad && y < y1 + pad))
        .map((L) => L.map(([x, y]) => [r2(x), r2(y)]));
      const cps = loadCps(id).map((c) => ({ xy: c.xy, fit: applyFit(fit, [c.lon, c.lat]).map(r2) }));
      const ov = { page: m.page, bbox: m.bbox, dpi: 150, lines: keep, cps, res, out: `${WORK}/geo/${id}.verify.png`,
        title: `${id}  ${fit.family}  rms ${fit.rmsPt}pt  mean ${fit.meanMm}mm${fit.tps ? '  +TPS' : ''}  NE ${res}` };
      const ovPath = `${WORK}/geo/${id}.overlay.json`;
      fs.writeFileSync(ovPath, JSON.stringify(ov));
      const py = `
import sys, json
sys.path.insert(0, sys.argv[2])
import pdfkit
from PIL import Image, ImageDraw
ov = json.load(open(sys.argv[1], encoding='utf-8'))
x0, y0 = ov['bbox'][0], ov['bbox'][1]
w, h, dpi = pdfkit.render_clip(ov['page'], ov['bbox'], ov['dpi'], ov['out'], False)
s = dpi / 72
im = Image.open(ov['out']).convert('RGB'); d = ImageDraw.Draw(im)
P = lambda p: ((p[0] - x0) * s, (p[1] - y0) * s)
for L in ov['lines']:
    if len(L) > 1: d.line([P(p) for p in L], fill=(255, 0, 200), width=1)
for c in ov['cps']:
    (ax, ay), (bx, by) = P(c['xy']), P(c['fit'])
    d.ellipse([ax - 4, ay - 4, ax + 4, ay + 4], outline=(255, 0, 0), width=2)
    d.line([ax, ay, bx, by], fill=(0, 160, 0), width=2)
    d.line([bx - 3, by, bx + 3, by], fill=(0, 120, 0), width=1); d.line([bx, by - 3, bx, by + 3], fill=(0, 120, 0), width=1)
d.rectangle([0, 0, len(ov['title']) * 6 + 8, 14], fill=(255, 255, 255)); d.text((4, 2), ov['title'], fill=(0, 0, 0))
im.save(ov['out'])
print(ov['out'], im.size)
`;
      const r = spawnSync(process.env.PYTHON || 'python', ['-I', '-c', py, ovPath, here], { encoding: 'utf8' });
      if (r.status !== 0) { console.error(r.stderr); return 1; }
      process.stdout.write(r.stdout);
    }
    return 0;
  }
  console.log('사용법: node scripts/atlas/georef.mjs --all | --verify <id|all>');
  return 2;
}

import { pathToFileURL } from 'node:url';
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  cli(process.argv.slice(2)).then((code) => process.exit(code), (e) => { console.error(e); process.exit(1); });
}
