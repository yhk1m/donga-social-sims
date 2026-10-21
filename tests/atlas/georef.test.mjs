// © 2026 김용현
// tests/atlas/georef.test.mjs — 기준점 → 투영식 맞추기(georef) 검사
import test from 'node:test';
import assert from 'node:assert/strict';
import { geoAzimuthalEqualArea } from 'd3-geo';
import { geoMiller } from 'd3-geo-projection';
import { fitControls, applyFit, invertFit, fitWithTps } from '../../scripts/atlas/georef.mjs';

const truth = geoAzimuthalEqualArea().rotate([-100, -40]).scale(520).translate([390, 360]);
const grid = (proj, lons, lats) => {
  const cps = [];
  for (const lon of lons) for (const lat of lats) { const [x, y] = proj([lon, lat]); cps.push({ xy: [x, y], lon, lat }); }
  return cps;
};
const range = (a, b, s) => { const r = []; for (let v = a; v <= b; v += s) r.push(v); return r; };

test('알려진 방위 정적 투영의 기준점에서 식을 되찾는다', () => {
  const cps = grid(truth, range(40, 160, 20), range(-10, 70, 20));
  const fit = fitControls(cps);
  assert.ok(fit.rmsPt < 0.3, `rms ${fit.rmsPt}`);
  const [x, y] = applyFit(fit, [120, 30]);
  const [tx, ty] = truth([120, 30]);
  assert.ok(Math.hypot(x - tx, y - ty) < 0.5);
});

test('회전된 지면(닮음 변환)과 태평양 중심 밀러 도법도 되찾는다', () => {
  const base = geoMiller().rotate([-148, 0]).scale(60).translate([300, 600]);
  const th = 0.02, c = Math.cos(th), s = Math.sin(th);
  const proj = (ll) => { const [x, y] = base(ll); return [c * x - s * y + 5, s * x + c * y - 3]; };
  const cps = grid(proj, [-80, -18, 30, 47, 80, 120, 146, 170], [-42, -20, 8, 22, 65]);
  const fit = fitControls(cps);
  assert.equal(fit.family, 'miller');
  assert.ok(fit.rmsPt < 0.1, `rms ${fit.rmsPt}`);
  // 원통 도법의 중심 경도는 이음선이 기준점 사이 같은 빈틈(-80°~-18°)에 있는 한 정해지지 않는다 → 빈틈 한가운데(-49°)
  assert.ok(Math.abs(fit.params[0] - 131) < 0.5, `lon0 ${fit.params[0]}`);
  for (const ll of [[100, 40], [-60, 10], [175, -30]]) {
    const [x, y] = applyFit(fit, ll), [tx, ty] = proj(ll);
    assert.ok(Math.hypot(x - tx, y - ty) < 0.1, `${ll} 오차 ${Math.hypot(x - tx, y - ty)}`);
  }
});

test('invertFit 은 applyFit 의 역', () => {
  const fit = fitControls(grid(truth, range(40, 160, 20), range(-10, 70, 20)));
  const [lon, lat] = invertFit(fit, applyFit(fit, [95.5, 33.25]));
  assert.ok(Math.abs(lon - 95.5) < 1e-6 && Math.abs(lat - 33.25) < 1e-6, `${lon},${lat}`);
});

test('TPS 보정은 매끈한 왜곡을 흡수하고 applyFit/invertFit 에 투명하게 들어간다', () => {
  // 참값 + 매끈한 휨(최대 약 3pt)
  const warp = ([x, y]) => [x + 3 * Math.sin(y / 200), y + 2 * Math.cos(x / 250)];
  const cps = grid((ll) => warp(truth(ll)), range(40, 160, 10), range(-10, 70, 10));
  const plain = fitControls(cps);
  assert.ok(plain.rmsPt > 0.5, `기본 맞춤 rms ${plain.rmsPt}`);
  const fit = fitWithTps(cps);
  assert.ok(fit.tps, 'tps 있음');
  assert.ok(fit.rmsTpsPt < 0.2, `TPS rms ${fit.rmsTpsPt}`);
  // 기준점 사이 점도 맞는다
  const p = [113, 27], [x, y] = applyFit(fit, p), [tx, ty] = warp(truth(p));
  assert.ok(Math.hypot(x - tx, y - ty) < 0.3, `사이 점 오차 ${Math.hypot(x - tx, y - ty)}`);
  const [lon, lat] = invertFit(fit, [x, y]);
  assert.ok(Math.abs(lon - 113) < 1e-4 && Math.abs(lat - 27) < 1e-4, `${lon},${lat}`);
});

test('잔차가 작으면 TPS 를 붙이지 않는다', () => {
  const fit = fitWithTps(grid(truth, range(40, 160, 20), range(-10, 70, 20)));
  assert.equal(fit.tps, undefined);
});

test('작은 지역(도시 규모) 기준점은 기준점 중심의 정거 원통 + 닮음 변환으로 맞춘다', () => {
  const city = geoAzimuthalEqualArea().rotate([-103.82, -1.35]).scale(60000).translate([140, 540]);
  const cps = grid(city, [103.65, 103.75, 103.85, 103.95], [1.25, 1.33, 1.41]);
  const fit = fitControls(cps);
  assert.equal(fit.family, 'equirectangular');
  assert.ok(Math.abs(fit.params[0] - 103.8) < 1e-6 && Math.abs(fit.params[1] - 1.33) < 1e-6, `${fit.params}`);
  assert.ok(fit.rmsPt < 0.2, `rms ${fit.rmsPt}`);
  const [x, y] = applyFit(fit, [103.8, 1.3]), [tx, ty] = city([103.8, 1.3]);
  assert.ok(Math.hypot(x - tx, y - ty) < 0.2);
  const [lon, lat] = invertFit(fit, [x, y]);
  assert.ok(Math.abs(lon - 103.8) < 1e-6 && Math.abs(lat - 1.3) < 1e-6);
});

// ── 검토 반영(B2 품질) ────────────────────────────────────────────────
import { geoConicEqualArea, geoPath } from 'd3-geo';
import { nelderMead, makeConverter, inControlHull, fitProjection, robustFit } from '../../scripts/atlas/georef.mjs';

test('nelderMead: NaN 을 내는 영역을 피하고, 수렴하면 일찍 멈춘다', () => {
  const r = nelderMead((p) => (p[0] < 0 ? NaN : (p[0] - 3) ** 2 + (p[1] + 1) ** 2), [1, 1], 2, 2000);
  assert.ok(Math.abs(r.x[0] - 3) < 1e-4 && Math.abs(r.x[1] + 1) < 1e-4, `${r.x}`);
  assert.ok(r.iters < 2000, `iters ${r.iters}`);
  const s = nelderMead(() => NaN, [0, 0], 1, 50);
  assert.ok(Array.isArray(s.x) && s.x.every(Number.isFinite));
});

test('원뿔 정적 도법(표준위선 25/50)을 되찾는다', () => {
  const conic = geoConicEqualArea().parallels([25, 50]).rotate([-105, 0]).scale(700).translate([400, 300]);
  const cps = grid(conic, range(70, 140, 10), range(15, 55, 10));
  const fit = fitControls(cps);
  assert.ok(fit.rmsPt < 0.3, `rms ${fit.rmsPt} (${fit.family})`);
  const [x, y] = applyFit(fit, [118, 33]), [tx, ty] = conic([118, 33]);
  assert.ok(Math.hypot(x - tx, y - ty) < 0.3);
});

test('날짜 변경선을 걸친 지도에서 invertFit', () => {
  const base = geoMiller().rotate([-180, 0]).scale(80).translate([300, 300]);
  const cps = grid(base, [150, 165, 175, -175, -165, -150], [-30, 0, 30, 50]);
  const fit = fitControls(cps);
  const ll = invertFit(fit, base([-170, 20]));
  assert.ok(ll, 'null 아님');
  assert.ok(Math.abs(((ll[0] + 170 + 540) % 360) - 180) < 1e-6 && Math.abs(ll[1] - 20) < 1e-6, `${ll}`);
});

test('invertFit: 엉뚱한 입력·투영 밖 점은 null', () => {
  const fit = fitControls(grid(truth, range(40, 160, 20), range(-10, 70, 20)));
  assert.equal(invertFit(fit, [NaN, 0]), null);
  assert.equal(invertFit(fit, [1e9, -1e9]), null);
  const warp = ([x, y]) => [x + 3 * Math.sin(y / 200), y + 2 * Math.cos(x / 250)];
  const tf = fitWithTps(grid((ll) => warp(truth(ll)), range(40, 160, 10), range(-10, 70, 10)));
  assert.ok(tf.tps);
  assert.equal(invertFit(tf, [1e9, 1e9]), null);
  assert.equal(applyFit(tf, [NaN, 3]), null);
});

test('TPS 는 기준점 범위 밖에서 0 으로 줄어든다 — 30° 바깥 점의 오차가 유한하다', () => {
  const warp = ([x, y]) => [x + 3 * Math.sin(y / 200), y + 2 * Math.cos(x / 250)];
  const cps = grid((ll) => warp(truth(ll)), range(40, 160, 10), range(-10, 70, 10));
  const fit = fitWithTps(cps);
  const inside = applyFit(fit, [100, 30]);
  assert.equal(inControlHull(fit, inside), true);
  const far = [100, -40];                              // 남쪽 끝 기준점(-10°)에서 30° 바깥
  const p = applyFit(fit, far), plain = fitControls(cps);
  assert.equal(inControlHull(fit, p), false);
  assert.deepEqual(p, applyFit(plain, far));           // 여백 너머에서는 보정 0 → 기본 식과 같다
  const [tx, ty] = warp(truth(far));
  assert.ok(Math.hypot(p[0] - tx, p[1] - ty) < 6, `오차 ${Math.hypot(p[0] - tx, p[1] - ty)}`);
  const back = invertFit(fit, p);
  assert.ok(Math.abs(back[0] - 100) < 1e-6 && Math.abs(back[1] + 40) < 1e-6);
});

test('TPS: 0.01pt 안에 겹친 기준점이 있어도 풀린다', () => {
  const warp = ([x, y]) => [x + 3 * Math.sin(y / 200), y + 2 * Math.cos(x / 250)];
  const cps = grid((ll) => warp(truth(ll)), range(40, 160, 10), range(-10, 70, 10));
  cps.push({ ...cps[5], xy: [cps[5].xy[0] + 0.001, cps[5].xy[1]] });
  const fit = fitWithTps(cps);
  assert.ok(fit.tps && fit.rmsTpsPt < 0.2, `${fit.rmsTpsPt}`);
});

test('makeConverter: 한 번 만든 변환기를 재사용하고 applyFit/invertFit 과 같은 값', () => {
  const fit = fitControls(grid(truth, range(40, 160, 20), range(-10, 70, 20)));
  const cv = makeConverter(fit);
  assert.equal(makeConverter(fit), cv);
  assert.deepEqual(cv.apply([120, 30]), applyFit(fit, [120, 30]));
  assert.deepEqual(cv.invert([400, 300]), invertFit(fit, [400, 300]));
});

test('fitProjection: geoPath 로 그린 도형이 applyFit 과 맞는다', () => {
  const fit = fitControls(grid(truth, range(40, 160, 20), range(-10, 70, 20)));
  const pts = []; const ctx = { moveTo: (x, y) => pts.push([x, y]), lineTo: (x, y) => pts.push([x, y]), closePath() {}, arc() {}, rect() {} };
  geoPath(fitProjection(fit), ctx)({ type: 'LineString', coordinates: [[100, 30], [101, 30]] });
  assert.ok(pts.length >= 2);
  const a = applyFit(fit, [100, 30]), b = applyFit(fit, [101, 30]);
  assert.ok(Math.hypot(pts[0][0] - a[0], pts[0][1] - a[1]) < 1e-6);
  assert.ok(Math.hypot(pts.at(-1)[0] - b[0], pts.at(-1)[1] - b[1]) < 1e-6);
});

test('robustFit: 짝짓기 실수로 튄 경위선 교차점을 뺀다', () => {
  const cps = grid(truth, range(40, 160, 10), range(-10, 70, 10)).map((c) => ({ ...c, src: 'grid' }));
  cps[7] = { ...cps[7], xy: [cps[7].xy[0] + 30, cps[7].xy[1]] };
  const { cps: kept, dropped, fit } = robustFit(cps);
  assert.equal(dropped.length, 1);
  assert.equal(kept.length, cps.length - 1);
  assert.ok(fit.rmsPt < 0.1, `rms ${fit.rmsPt}`);
});

test('작은 지역의 중심 경도는 원형 평균(날짜 변경선 걸침)', () => {
  const p = geoAzimuthalEqualArea().rotate([180, -10]).scale(60000).translate([0, 0]);
  const cps = grid(p, [179.7, 179.9, -179.9, -179.7], [9.9, 10.1]);
  const fit = fitControls(cps);
  assert.equal(fit.family, 'equirectangular');
  assert.ok(Math.abs(Math.abs(fit.params[0]) - 180) < 1e-6, `${fit.params}`);
});

// ── 도법 후보 고정(2단계 G2): fitCore.FAMILIES 에 후보를 더해도 아시아 fit 이 바뀌지 않게 ─────────────
import { FAMILY_NAMES, familiesFor, PHASE1_FAMILIES } from '../../scripts/atlas/georef.mjs';
test('u2 지도의 도법 후보는 1단계 8개 그대로(후보를 더해도 아시아 fit 이 바뀌지 않게)', () => {
  const OLD = ['azimuthalEqualArea', 'azimuthalEquidistant', 'conicEqualArea', 'conicConformal', 'miller', 'robinson', 'equirectangular', 'mercator'];
  assert.deepEqual(familiesFor({ id: 'p16-asia' }, { georef: {} }), OLD);
  assert.deepEqual(familiesFor({ id: 'x', families: ['miller'] }, { georef: { families: OLD } }), ['miller']);
  assert.deepEqual(familiesFor({ id: 'x' }, { georef: { families: ['robinson', 'miller'] } }), ['robinson', 'miller']);
  assert.deepEqual([...PHASE1_FAMILIES], OLD);
  for (const f of OLD) assert.ok(FAMILY_NAMES.includes(f), f);
  assert.throws(() => familiesFor({ id: 'x', families: ['nope'] }, {}), /nope/);
});

// ── Ⅲ 유럽(u3) fit: 작업 폴더에 fit 파일이 있으면 1단계 합격 기준(평균 잔차 ≤ 0.5mm, approx 제외)과 도법 ─────────────
import { existsSync, readFileSync } from 'node:fs';
const U3_MAPS = JSON.parse(readFileSync(new URL('../../scripts/atlas/maps_u3.json', import.meta.url), 'utf8'));
const WORK_DIR = (process.env.ATLAS_WORK || 'C:/Users/Public/atlas-work').replace(/\\/g, '/');
const u3Fits = U3_MAPS.map((m) => [m.id, `${WORK_DIR}/geo/${m.id}.fit.json`]).filter(([, f]) => existsSync(f));
test('u3 fit: 지도마다 rmsMm·meanMm ≤ 0.5(approx 제외), 26·27쪽은 람베르트 정각 원뿔', { skip: u3Fits.length ? false : '작업 폴더에 u3 fit 없음' }, () => {
  // fit 파일이 하나라도 있으면 지도 목록 15장 모두 있어야 한다(일부만 맞춘 채 남은 작업 폴더를 놓치지 않게)
  assert.deepEqual(u3Fits.map(([id]) => id), U3_MAPS.map((m) => m.id), 'u3 fit 파일이 지도 목록과 다름');
  assert.equal(U3_MAPS.length, 15);
  for (const [id, f] of u3Fits) {
    const fit = JSON.parse(readFileSync(f, 'utf8'));
    if (fit.approx) continue;
    assert.ok(fit.rmsMm <= 0.5 && fit.meanMm <= 0.5, `${id} rms ${fit.rmsMm} mean ${fit.meanMm}`);
    if (id === 'p26-europe' || id === 'p27-coloring') assert.equal(fit.family, 'conicConformal', id);
  }
});

// ── Ⅳ 아프리카(u4) fit: 같은 합격 기준 + 34·35쪽 정거 방위, projectionFrom 지도는 본 지도 도법 그대로, 38쪽 태양광은 태평양 중심 ─────
const U4_MAPS = JSON.parse(readFileSync(new URL('../../scripts/atlas/maps_u4.json', import.meta.url), 'utf8'));
const u4Fits = U4_MAPS.map((m) => [m.id, `${WORK_DIR}/geo/${m.id}.fit.json`]).filter(([, f]) => existsSync(f));
test('u4 fit: 지도마다 rmsMm·meanMm ≤ 0.5(approx 제외), 34·35쪽 정거 방위, p38-solar 중심 경도 120~180', { skip: u4Fits.length ? false : '작업 폴더에 u4 fit 없음' }, () => {
  assert.deepEqual(u4Fits.map(([id]) => id), U4_MAPS.map((m) => m.id), 'u4 fit 파일이 지도 목록과 다름');
  assert.equal(U4_MAPS.length, 12);
  const fits = Object.fromEntries(u4Fits.map(([id, f]) => [id, JSON.parse(readFileSync(f, 'utf8'))]));
  for (const [id, fit] of Object.entries(fits)) {
    if (fit.approx) continue;
    assert.ok(fit.rmsMm <= 0.5 && fit.meanMm <= 0.5, `${id} rms ${fit.rmsMm} mean ${fit.meanMm}`);
  }
  for (const id of ['p34-africa', 'p35-coloring']) assert.equal(fits[id].family, 'azimuthalEquidistant', id);
  const solar = fits['p38-solar'];
  assert.ok(['miller', 'equirectangular', 'mercator', 'robinson'].includes(solar.family), solar.family);
  const lon0 = ((solar.params[0] % 360) + 360) % 360;
  assert.ok(lon0 >= 120 && lon0 <= 180, `p38-solar 중심 경도 ${solar.params[0]}`);
  for (const m of U4_MAPS.filter((x) => x.projectionFrom)) {
    const f = fits[m.id], parent = fits[m.projectionFrom];
    assert.equal(f.fixed, true, m.id);
    assert.equal(f.family, parent.family, m.id);
    assert.deepEqual(f.params, parent.params, m.id);
  }
});

test('고정 도법 후보 {family, params}: 매개변수는 그대로, 닮음 변환만 맞춤(29쪽 아이슬란드 삽입 = 본 지도 도법)', async () => {
  const { geoConicConformal } = await import('d3-geo');
  const P = geoConicConformal().rotate([-15, 0]).parallels([52.6, 52.6]).scale(540).translate([300, 800]);
  const cps = [[-22, 64], [-14, 65], [-18, 66.3], [-24, 65.6], [-16, 63.5], [-19, 64.8]].map(([lon, lat]) => ({ xy: P([lon, lat]), lon, lat }));
  const fixed = { family: 'conicConformal', params: [15, 52.6, 52.6] };
  const fit = fitControls(cps, [fixed]);
  assert.equal(fit.family, 'conicConformal');
  assert.deepEqual(fit.params, [15, 52.6, 52.6]);
  assert.ok(fit.rmsPt < 1e-6, `${fit.rmsPt}`);
  assert.equal(fit.fixed, true);
  // 이름 후보와 섞으면 매개변수가 적은(고정 = 0) 쪽이 비슷한 잔차에서 이긴다
  assert.equal(fitControls(cps, ['conicConformal', fixed]).fixed, true);
});

test('projectionFromStale: 본 지도 도법·매개변수가 바뀌었으면 낡음(내용 기준만)', async () => {
  const { projectionFromStale, projectionFromOlder } = await import('../../scripts/atlas/projection_from.mjs');
  const parent = { id: 'p29-climate', family: 'conicConformal', params: [14.971362, 52.605727, 52.605727] };
  const inset = { id: 'p29-climate-iceland', fixed: true, family: 'conicConformal', params: [14.971362, 52.605727, 52.605727] };
  assert.equal(projectionFromStale(inset, parent), null);
  assert.match(projectionFromStale(inset, { ...parent, params: [15, 52.7, 52.7] }), /매개변수/);
  assert.match(projectionFromStale(inset, { ...parent, family: 'mercator' }), /도법/);
  assert.match(projectionFromStale({ ...inset, fixed: undefined }, parent), /fixed/);
  // 파일 시각은 내용 낡음이 아니다(새로 clone 하면 시각이 뒤섞임) — 따로 경고만
  assert.equal(projectionFromStale(inset, parent, { insetMtime: 1, parentMtime: 2 }), null);
  assert.equal(projectionFromOlder(inset, parent, { insetMtime: 2, parentMtime: 1 }), null);
  assert.match(projectionFromOlder(inset, parent, { insetMtime: 1, parentMtime: 2 }), /더 새것/);
  assert.equal(projectionFromOlder(inset, parent, {}), null);
});

// ── Ⅴ 아메리카(u5) fit: 같은 합격 기준 + 40쪽 평사·46쪽 지구본 정사·47쪽 세계 태평양 중심, fitFrom 지도 = 빌린 지도 + 쪽 이동량 ─────
const U5_MAPS = JSON.parse(readFileSync(new URL('../../scripts/atlas/maps_u5.json', import.meta.url), 'utf8'));
const u5Fits = U5_MAPS.map((m) => [m.id, `${WORK_DIR}/geo/${m.id}.fit.json`]).filter(([, f]) => existsSync(f));
test('u5 fit: rmsMm·meanMm ≤ 0.5(approx 제외), p40 평사·p46 지구본 정사, p47-hq 중심 경도 120~180, fitFrom = sim 이동 dx·dy', { skip: u5Fits.length ? false : '작업 폴더에 u5 fit 없음' }, () => {
  assert.deepEqual(u5Fits.map(([id]) => id), U5_MAPS.map((m) => m.id), 'u5 fit 파일이 지도 목록과 다름');
  assert.equal(U5_MAPS.length, 28);
  const fits = Object.fromEntries(u5Fits.map(([id, f]) => [id, JSON.parse(readFileSync(f, 'utf8'))]));
  for (const [id, fit] of Object.entries(fits)) {
    if (fit.approx) continue;
    assert.ok(fit.rmsMm <= 0.5 && fit.meanMm <= 0.5, `${id} rms ${fit.rmsMm} mean ${fit.meanMm}`);
  }
  assert.equal(fits['p40-americas'].family, 'stereographic');
  assert.equal(fits['p41-coloring'].family, 'stereographic');
  assert.equal(fits['p46-migration'].family, 'orthographic');
  assert.equal(fits['p42-north'].family, 'conicConformal');
  assert.equal(fits['p43-south'].family, 'azimuthalEqualArea');
  assert.equal(fits['p40-central'].family, 'miller');
  const hq = fits['p47-hq'];
  assert.ok(['miller', 'equirectangular', 'mercator', 'robinson'].includes(hq.family), hq.family);
  const lon0 = ((hq.params[0] % 360) + 360) % 360;
  assert.ok(lon0 >= 120 && lon0 <= 180, `p47-hq 중심 경도 ${hq.params[0]}`);
  for (const m of U5_MAPS.filter((x) => x.projectionFrom)) {
    const f = fits[m.id], parent = fits[m.projectionFrom];
    assert.equal(f.fixed, true, m.id);
    assert.equal(f.family, parent.family, m.id);
    assert.deepEqual(f.params, parent.params, m.id);
  }
  const fromMaps = U5_MAPS.filter((x) => x.fitFrom);
  assert.equal(fromMaps.length, 9);
  for (const m of fromMaps) {
    const f = fits[m.id], src = fits[m.fitFrom.map];
    assert.deepEqual(f.fitFrom, m.fitFrom, m.id);
    assert.equal(f.family, src.family, m.id);
    assert.deepEqual(f.params, src.params, m.id);
    assert.ok(Math.abs(f.sim.tx - src.sim.tx - m.fitFrom.dx) < 1e-6 && Math.abs(f.sim.ty - src.sim.ty - m.fitFrom.dy) < 1e-6, m.id);
    assert.equal(f.sim.a, src.sim.a); assert.equal(f.sim.b, src.sim.b);
    const ll = [-98, 39];   // 같은 경위도가 정확히 dx·dy 만큼 옮겨짐(TPS 포함)
    const p = applyFit(src, ll), q = applyFit(f, ll);
    if (p) assert.ok(Math.abs(q[0] - p[0] - m.fitFrom.dx) < 1e-6 && Math.abs(q[1] - p[1] - m.fitFrom.dy) < 1e-6, m.id);
  }
});

test('shiftFit(fitFrom): 합성 fit(TPS 포함)에 쪽 이동량을 주면 모든 경위도가 정확히 dx·dy 만큼 옮겨지고 되돌리기도 같음', async () => {
  const { shiftFit } = await import('../../scripts/atlas/projection_from.mjs');
  const P = geoConicEqualArea().rotate([96, 0]).parallels([29.5, 45.5]).scale(700).translate([400, 300]);
  // 결정적 잡음(±1.5pt)을 넣어 TPS 가 생기게
  let s = 11; const rnd = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648 - 0.5) * 3;
  const cps = [];
  for (let lon = -124; lon <= -68; lon += 7) for (let lat = 26; lat <= 48; lat += 5) { const [x, y] = P([lon, lat]); cps.push({ xy: [x + rnd(), y + rnd()], lon, lat }); }
  const src = fitWithTps(cps, { families: ['conicEqualArea'] });
  assert.ok(src.tps, 'TPS 가 있는 합성 fit');
  const dx = 237.99, dy = -0.04;
  const out = shiftFit(src, { map: 'p46-us-european', dx, dy }, 'p46-us-african');
  assert.equal(out.id, 'p46-us-african');
  assert.deepEqual(out.fitFrom, { map: 'p46-us-european', dx, dy });
  const tx0 = src.sim.tx;
  for (const ll of [[-100, 40], [-120, 30], [-70, 45], [-150, 60], [-80, 25]]) {   // 껍질 안·밖(TPS 가 줄어드는 곳) 모두
    const p = applyFit(src, ll), q = applyFit(out, ll);
    assert.ok(Math.abs(q[0] - p[0] - dx) < 1e-6 && Math.abs(q[1] - p[1] - dy) < 1e-6, `${ll}: ${p} → ${q}`);
    const back = invertFit(out, q);
    assert.ok(Math.abs(back[0] - ll[0]) < 1e-6 && Math.abs(back[1] - ll[1]) < 1e-6, `${ll} 되돌림 ${back}`);
  }
  assert.equal(src.sim.tx, tx0, '빌린 fit 은 그대로');
  const noTps = shiftFit({ ...src, tps: undefined }, { map: 'a', dx: 1, dy: 2 }, 'b');
  assert.equal(noTps.tps, undefined);
});

test('fitFromStale(U5-3d): fitFrom fit 이 빌린 지도 fit + 쪽 이동량과 다르면 낡음', async () => {
  const { fitFromStale, shiftFit } = await import('../../scripts/atlas/projection_from.mjs');
  const parent = { id: 'p46-us-european', family: 'conicEqualArea', params: [-96.1, 19, 58.1], sim: { a: 1.2, b: 0.1, tx: 400, ty: 150 },
    tps: { cx: 400, cy: 150, hull: [[320, 100], [490, 210]], pts: [[0, 0]], w: [1] } };
  const spec = { map: 'p46-us-european', dx: 237.99, dy: -0.04 };
  const child = shiftFit(parent, spec, 'p46-us-african');
  assert.equal(fitFromStale(child, parent, spec), null);
  assert.match(fitFromStale(child, { ...parent, params: [-96, 19, 58] }, spec), /매개변수|낡음/);
  assert.match(fitFromStale(child, { ...parent, sim: { ...parent.sim, tx: 401 } }, spec), /닮음 변환|낡음/);
  assert.match(fitFromStale(child, parent, { ...spec, dx: 230 }), /이동량|낡음/);
  assert.match(fitFromStale({ ...child, fitFrom: undefined }, parent, spec), /fitFrom/);
});
