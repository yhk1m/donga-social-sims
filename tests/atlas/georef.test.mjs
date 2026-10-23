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

// ── Ⅵ 극 지도(U6-3a): 극 중심 정거 방위 고정 후보 {family: 'azimuthalEquidistant', params: [0, ±90]} ─────────────
// 중심 경도는 지면에서 극을 도는 회전일 뿐이라 닮음 변환이 흡수한다 → 매개변수를 맞추지 않는 고정 후보로 충분하다.
import { geoAzimuthalEquidistant } from 'd3-geo';
const POLAR_ROT = 37;   // 지면 회전(°) — 교과서 위쪽 경선
/** 합성 극 기준점: 정거 방위(극 중심 rotate [-λ0, ∓90]) → 무대 가운데 둘레로 POLAR_ROT 회전 → 결정적 잡음 ±noise pt, 40점. */
function polarCps(pole, { lon0 = 0, noise = 0.1 } = {}) {
  const P = geoAzimuthalEquidistant().rotate([-lon0, pole === 'N' ? -90 : 90]).scale(400).translate([390, 360]);
  const t = POLAR_ROT * Math.PI / 180, cs = Math.cos(t), sn = Math.sin(t), cps = [];
  const lats = pole === 'N' ? [60, 65, 70, 75, 80] : [-60, -65, -70, -75, -80];
  let i = 0;
  for (const lon of [-180, -135, -90, -45, 0, 45, 90, 135]) for (const lat of lats) {
    const [x, y] = P([lon, lat]), u = x - 390, v = y - 360; i++;
    cps.push({ xy: [390 + cs * u - sn * v + noise * Math.sin(i * 12.9898), 360 + sn * u + cs * v + noise * Math.sin(i * 78.233)], lon, lat, src: 'grid' });
  }
  return cps;
}
const simDeg = (sim) => Math.atan2(sim.b, sim.a) * 180 / Math.PI;

test('U6-3a 고정 후보 객체: familiesFor 가 받고(새 객체), 모르는 도법·잘못된 params 는 막는다', () => {
  const N = { family: 'azimuthalEquidistant', params: [0, 90] };
  const got = familiesFor({ id: 'p50-arctic', families: [N, 'miller'] }, {});
  assert.deepEqual(got, [N, 'miller']);
  assert.notEqual(got[0], N, '고정 후보는 복사');
  assert.notEqual(got[0].params, N.params);
  assert.deepEqual(familiesFor({ id: 'x' }, { georef: { families: [{ family: 'azimuthalEquidistant', params: [0, -90] }] } }), [{ family: 'azimuthalEquidistant', params: [0, -90] }]);
  assert.throws(() => familiesFor({ id: 'x', families: [{ family: 'nope', params: [0, 90] }] }, {}), /nope/);
  assert.throws(() => familiesFor({ id: 'x', families: [{ family: 'azimuthalEquidistant', params: [0] }] }, {}), /params/);
  assert.throws(() => familiesFor({ id: 'x', families: [{ family: 'azimuthalEquidistant', params: [0, NaN] }] }, {}), /params/);
  assert.throws(() => familiesFor({ id: 'x', families: [{ family: 'azimuthalEquidistant' }] }, {}), /params/);
  assert.throws(() => familiesFor({ id: 'x', families: [null] }, {}), /모르는 도법/);
});

test('U6-3a familiesFor: u2~u5 지도 목록·설정의 이름 후보는 예전과 같은 배열', () => {
  for (const u of ['u2', 'u3', 'u4', 'u5']) {
    const cfg = JSON.parse(readFileSync(new URL(`../../scripts/atlas/config/${u}.json`, import.meta.url), 'utf8'));
    const maps = JSON.parse(readFileSync(new URL(`../../scripts/atlas/maps_${u}.json`, import.meta.url), 'utf8'));
    for (const m of maps) {
      const old = [...(m.families ?? cfg.georef?.families ?? PHASE1_FAMILIES)];
      assert.ok(old.every((f) => typeof f === 'string'), `${u} ${m.id}`);
      assert.deepEqual(familiesFor(m, cfg), old, `${u} ${m.id}`);
    }
  }
});

for (const pole of ['N', 'S']) {
  const sign = pole === 'N' ? 90 : -90;
  test(`U6-3a 합성 ${pole === 'N' ? '북' : '남'}극 지도: 고정 후보 [0, ${sign}] rms ≤ 0.15pt · 지면 회전 ${POLAR_ROT}° · 자유 후보 중심 |φ| ≥ 89.5`, () => {
    const cps = polarCps(pole), fixed = { family: 'azimuthalEquidistant', params: [0, sign] };
    const fit = fitControls(cps, familiesFor({ id: 'syn', families: [fixed] }, {}));
    assert.equal(fit.fixed, true);
    assert.equal(fit.family, 'azimuthalEquidistant');
    assert.deepEqual(fit.params, [0, sign], '고정 매개변수 그대로');
    assert.ok(fit.rmsPt <= 0.15, `rms ${fit.rmsPt}`);
    assert.ok(Math.abs(simDeg(fit.sim) - POLAR_ROT) <= 0.2, `회전 ${simDeg(fit.sim)}`);
    assert.ok(Math.abs(Math.hypot(fit.sim.a, fit.sim.b) - 400) < 1, `배율 ${Math.hypot(fit.sim.a, fit.sim.b)}`);
    // 되돌리기: 맞춘 식으로 기준점을 투영하면 지면 자리에, 지면 자리를 되돌리면 경위도에
    for (const c of cps) {
      const p = applyFit(fit, [c.lon, c.lat]);
      assert.ok(Math.hypot(p[0] - c.xy[0], p[1] - c.xy[1]) < 0.3, `${c.lon},${c.lat}`);
      const ll = invertFit(fit, p);
      assert.ok(Math.abs(ll[1] - c.lat) < 1e-6 && Math.abs(((ll[0] - c.lon + 540) % 360) - 180) < 1e-6, `${ll} ≠ ${c.lon},${c.lat}`);
    }
    // georef-cli 와 같은 길(robustFit → fitWithTps, 후보 = 지도 항목 families)도 고정 후보 그대로
    const { cps: kept, dropped } = robustFit(cps, { families: [fixed] });
    assert.equal(dropped.length, 0);
    const full = fitWithTps(kept, { families: [fixed] });
    assert.equal(full.fixed, true); assert.deepEqual(full.params, [0, sign]); assert.equal(full.tps, undefined);
    // 자유 후보(매개변수 2)도 극 중심을 찾고, 이름 후보와 섞으면 비슷한 잔차에서 고정(매개변수 0) 쪽이 이긴다
    const free = fitControls(cps, ['azimuthalEquidistant']);
    assert.ok(Math.abs(free.params[1]) >= 89.5 && Math.sign(free.params[1]) === Math.sign(sign), `자유 후보 중심 ${free.params}`);
    assert.ok(Math.abs(free.rmsPt - fit.rmsPt) < 0.05, `자유 ${free.rmsPt} · 고정 ${fit.rmsPt}`);
    assert.equal(fitControls(cps, ['azimuthalEquidistant', fixed]).fixed, true);
  });
}

test('U6-3a 극 중심 경도는 지면 회전일 뿐: 중심 경도 100° 로 그린 극 지도도 고정 후보 [0, ±90] 로 맞는다', () => {
  for (const [pole, sign] of [['N', 90], ['S', -90]]) {
    const fit = fitControls(polarCps(pole, { lon0: 100, noise: 0 }), [{ family: 'azimuthalEquidistant', params: [0, sign] }]);
    assert.ok(fit.rmsPt < 1e-6, `${pole} rms ${fit.rmsPt}`);
    const d = ((simDeg(fit.sim) - POLAR_ROT + 540) % 360) - 180;
    assert.ok(Math.abs(Math.abs(d) - 100) < 1e-6, `${pole} 회전 차 ${d}`);
  }
});

test('U6-3a maps_u6 극 지도 4장: families 고정 후보가 familiesFor 를 지나고 극 부호가 맞다', () => {
  const U6 = JSON.parse(readFileSync(new URL('../../scripts/atlas/maps_u6.json', import.meta.url), 'utf8'));
  const want = { 'p50-arctic': 90, 'p55-claims': 90, 'p51-antarctic': -90, 'p55-bases': -90 };
  for (const [id, sign] of Object.entries(want)) {
    const m = U6.find((x) => x.id === id);
    const fams = familiesFor(m, {});
    assert.deepEqual(fams, [{ family: 'azimuthalEquidistant', params: [0, sign] }], id);
    const fit = fitControls(polarCps(sign > 0 ? 'N' : 'S'), fams);
    assert.equal(fit.fixed, true, id); assert.deepEqual(fit.params, [0, sign], id);
  }
});

// ── Ⅵ 오세아니아·극지방(u6) fit(U6-2): 합격 기준 + 48·49쪽 람베르트 정적 방위 · 극 4장 정거 방위 극 중심(위쪽 경선) · 지구본 정사 · 54쪽 태평양 중심 ─────
const U6_MAPS = JSON.parse(readFileSync(new URL('../../scripts/atlas/maps_u6.json', import.meta.url), 'utf8'));
const u6Fits = U6_MAPS.map((m) => [m.id, `${WORK_DIR}/geo/${m.id}.fit.json`]).filter(([, f]) => existsSync(f));
test('u6 fit: rmsMm·meanMm ≤ 0.5(approx 제외), p48 람베르트 정적 방위, 극 4장 극 중심·위쪽 경선, p55-route 정사, p54-fta 중심 120~180, projectionFrom 고정', { skip: u6Fits.length ? false : '작업 폴더에 u6 fit 없음' }, () => {
  assert.deepEqual(u6Fits.map(([id]) => id), U6_MAPS.map((m) => m.id), 'u6 fit 파일이 지도 목록과 다름');
  assert.equal(U6_MAPS.length, 19);
  const fits = Object.fromEntries(u6Fits.map(([id, f]) => [id, JSON.parse(readFileSync(f, 'utf8'))]));
  for (const [id, fit] of Object.entries(fits)) {
    if (fit.approx) continue;
    assert.ok(fit.rmsMm <= 0.5 && fit.meanMm <= 0.5, `${id} rms ${fit.rmsMm} mean ${fit.meanMm}`);
  }
  // approx 는 아라온 10~4월 지구본 하나(손 기준점만 — 결정 기록)
  assert.deepEqual(Object.keys(fits).filter((id) => fits[id].approx), ['p55-araon-s']);
  for (const id of ['p48-oceania', 'p49-coloring', 'p53-climate']) assert.equal(fits[id].family, 'azimuthalEqualArea', id);
  for (const id of ['p55-route', 'p55-araon-s', 'p55-araon-n']) assert.equal(fits[id].family, 'orthographic', id);
  // 48쪽: 날짜변경선 넘는 지도 — 중심 경도 150°E 어림, 기준점이 날짜변경선 양쪽(동경 170° 와 서경 170° 교차점)
  assert.ok(Math.abs(fits['p48-oceania'].params[0] - 150) < 2, `p48 중심 ${fits['p48-oceania'].params}`);
  const p48 = fits['p48-oceania'].resid.map((r) => r.name);
  assert.ok(p48.includes('-170,-10') && p48.includes('170,-10'), '48쪽 날짜변경선 양쪽 교차점');
  // 극 4장: 고정 후보(정거 방위 극 중심), 위쪽 경선(U6-3b 보기 회전 입력) — 50·51쪽·남극 기지 90°W, 북극해 영유권 180°
  const UP = { 'p50-arctic': [90, -90], 'p51-antarctic': [-90, -90], 'p55-claims': [90, 180], 'p55-bases': [-90, -90] };
  for (const [id, [lat, up]] of Object.entries(UP)) {
    const f = fits[id];
    assert.equal(f.family, 'azimuthalEquidistant', id); assert.equal(f.fixed, true, id); assert.equal(f.projectionFrom, undefined, id);
    assert.ok(Math.abs(f.params[1]) >= 89 && Math.sign(f.params[1]) === Math.sign(lat), `${id} 중심 ${f.params}`);
    const noTps = { ...f, tps: undefined };
    const P = applyFit(noTps, [0, lat]), Q = applyFit(noTps, [up, lat - Math.sign(lat) * 10]);
    assert.ok(Math.abs(Q[0] - P[0]) < 0.5 && Q[1] < P[1], `${id} 위쪽 경선 ${up}: 극 ${P} → ${Q}`);
  }
  const fta = fits['p54-fta'];
  assert.ok(['miller', 'equirectangular', 'mercator', 'robinson'].includes(fta.family), fta.family);
  const lon0 = ((fta.params[0] % 360) + 360) % 360;
  assert.ok(lon0 >= 120 && lon0 <= 180, `p54-fta 중심 경도 ${fta.params[0]}`);
  const pf = U6_MAPS.filter((x) => x.projectionFrom);
  assert.deepEqual(pf.map((m) => m.id), ['p49-coloring', 'p52-relief', 'p53-jan', 'p53-jul', 'p54-sealevel']);
  for (const m of pf) {
    const f = fits[m.id], parent = fits[m.projectionFrom];
    assert.equal(f.fixed, true, m.id);
    assert.equal(f.family, parent.family, m.id);
    assert.deepEqual(f.params, parent.params, m.id);
  }
});

// ── U1-3a 두 쪽에 걸친 한 지도(spreadOf + offsetPt): 두 쪽 기준점을 왼쪽 좌표계로 모아 한 번 맞추고, 오른쪽 fit = 왼쪽의 풀린 fit − offsetPt ──
test('U1-3a planSpread: 키가 없으면 빈 표(u2~u6 지도 목록), u1 은 9쪽 ← 8쪽 · 11쪽 ← 10쪽, 틀린 꼴은 멈춤', async () => {
  const { planSpread } = await import('../../scripts/atlas/projection_from.mjs');
  for (const u of ['u2', 'u3', 'u4', 'u5', 'u6']) {
    const ms = JSON.parse(readFileSync(new URL(`../../scripts/atlas/maps_${u}.json`, import.meta.url), 'utf8'));
    const p = planSpread(ms);
    assert.equal(p.left.size + p.right.size, 0, u);
  }
  const u1 = JSON.parse(readFileSync(new URL('../../scripts/atlas/maps_u1.json', import.meta.url), 'utf8'));
  const p = planSpread(u1);
  assert.deepEqual(Object.fromEntries(p.right), { 'p09-world': { map: 'p08-world', dx: 767.055, dy: 0 }, 'p11-continents': { map: 'p10-continents', dx: 765.354, dy: -0.001 } });
  assert.deepEqual(Object.fromEntries(p.left), { 'p08-world': [{ id: 'p09-world', dx: 767.055, dy: 0 }], 'p10-continents': [{ id: 'p11-continents', dx: 765.354, dy: -0.001 }] });
  const L = { id: 'a' }, R = (o) => ({ id: 'b', spreadOf: 'a', offsetPt: [767, 0], ...o });
  assert.throws(() => planSpread([L, R({ offsetPt: undefined })]), /offsetPt/);
  assert.throws(() => planSpread([L, R({ offsetPt: [767] })]), /offsetPt/);
  assert.throws(() => planSpread([L, { id: 'b', offsetPt: [1, 2] }]), /spreadOf/);
  assert.throws(() => planSpread([L, R({ spreadOf: 'zz' })]), /목록에 없음/);
  assert.throws(() => planSpread([L, R({ spreadOf: 'b' })]), /자기 자신/);
  assert.throws(() => planSpread([R(), L]), /뒤/);
  assert.throws(() => planSpread([L, R({ fitFrom: { map: 'a', dx: 0, dy: 0 } })]), /fitFrom/);
  assert.throws(() => planSpread([L, R({ projectionFrom: 'a' })]), /projectionFrom/);
  assert.throws(() => planSpread([L, R(), { id: 'c', spreadOf: 'b', offsetPt: [1, 0] }]), /사슬/);
  assert.throws(() => planSpread([{ id: 'a', georef: false }, R()]), /georef:false/);
});

test('U1-3a 합성 로빈슨 두 쪽(겹침 12pt, 잡음): 묶어 맞추면 두 쪽 fit 매개변수 같음·가름선 어긋남 0, 따로 맞춘 것보다 좋음', async () => {
  const { geoRobinson } = await import('d3-geo-projection');
  const { spreadControls, spreadFit } = await import('../../scripts/atlas/projection_from.mjs');
  const truth = geoRobinson().rotate([-150, 0]).scale(210).translate([719, 361]);
  const OFF = 767.055, W = 779.5;
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed / 2147483647 - 0.5) * 0.3; };   // ±0.15pt 잡음(결정적)
  const left = [], right = [];
  for (let lon = -180; lon < 180; lon += 10) for (let lat = -70; lat <= 70; lat += 10) {
    const [x, y] = truth([lon, lat]);
    if (x >= 20 && x <= W - 6) left.push({ xy: [x + rnd(), y + rnd()], lon, lat });
    if (x - OFF >= 6 && x - OFF <= 620) right.push({ xy: [x - OFF + rnd(), y + rnd()], lon, lat });
  }
  assert.ok(left.length > 40 && right.length > 40);
  const fams = { families: ['robinson'] };
  const all = spreadControls(left, [{ id: 'R', dx: OFF, dy: 0, cps: right }]);
  assert.equal(all.filter((c) => c.name?.startsWith('R:')).length, right.length);
  assert.equal(all.length, left.length + right.length);
  const pooled = fitWithTps(all, fams);
  const L = { id: 'L', family: pooled.family, params: pooled.params, sim: pooled.sim, ...(pooled.tps ? { tps: pooled.tps } : {}) };
  const Rf = spreadFit(L, { map: 'L', dx: OFF, dy: 0 }, 'R');
  assert.deepEqual(Rf.params, L.params);
  assert.deepEqual(Rf.spreadOf, { map: 'L', offsetPt: [OFF, 0] });
  assert.equal(Rf.fitFrom, undefined);
  assert.ok(Math.abs(L.params[0] - 150) < 0.5, `중심 ${L.params[0]}`);
  const sepL = fitWithTps(left, fams), sepR = fitWithTps(right, fams);
  const seam = (fl, fr) => {   // 가름선 띠(왼쪽 쪽 x 755~773)에서 같은 경위도의 두 쪽 자리 차(오른쪽 + OFF)
    let m = 0;
    for (let y = 80; y <= 640; y += 20) for (let x = 755; x <= 773; x += 3) {
      const ll = invertFit(fl, [x, y]); if (!ll) continue;
      const q = applyFit(fr, ll); if (!q) continue;
      m = Math.max(m, Math.hypot(q[0] + OFF - x, q[1] - y));
    }
    return m;
  };
  const mPooled = seam(L, Rf), mSep = seam({ ...sepL }, { ...sepR });
  assert.ok(mPooled < 0.05, `묶어 맞춘 가름선 어긋남 ${mPooled}`);
  assert.ok(mSep > mPooled, `따로 ${mSep} vs 묶음 ${mPooled}`);
  assert.notDeepEqual(sepL.params, sepR.params);   // 따로 맞추면 매개변수가 갈림(잡음)
});

test('U1-3a spreadOf 대상이 fitFrom 지도(11쪽 ← 10쪽 ← 8쪽): 오른쪽 fit = 10쪽의 풀린 fit − offsetPt, via 에 출처 · 낡음 검사', async () => {
  const { shiftFit, spreadFit, spreadFitStale, fitFromStale } = await import('../../scripts/atlas/projection_from.mjs');
  const p08 = { id: 'p08-world', family: 'robinson', params: [150.07], sim: { a: 210.39, b: 0, tx: 719.0, ty: 361.6 } };
  const p10 = shiftFit(p08, { map: 'p08-world', dx: 0.9, dy: 1.28 }, 'p10-continents');
  const spec = { map: 'p10-continents', dx: 765.354, dy: -0.001 };
  const p11 = spreadFit(p10, spec, 'p11-continents');
  assert.equal(p11.fitFrom, undefined);
  assert.deepEqual(p11.spreadOf, { map: 'p10-continents', offsetPt: [765.354, -0.001] });
  assert.deepEqual(p11.via, { fitFrom: { map: 'p08-world', dx: 0.9, dy: 1.28 } });
  for (const ll of [[150, 0], [-100, 40], [-60, -30]]) {
    const a = applyFit(p08, ll), b = applyFit(p11, ll);
    assert.ok(Math.abs(b[0] - (a[0] + 0.9 - 765.354)) < 1e-6 && Math.abs(b[1] - (a[1] + 1.28 + 0.001)) < 1e-6, String(ll));
  }
  assert.equal(spreadFitStale(p11, p10, spec), null);
  assert.equal(fitFromStale(p10, p08, { map: 'p08-world', dx: 0.9, dy: 1.28 }), null);
  assert.match(spreadFitStale(p11, { ...p10, params: [151] }, spec), /매개변수/);
  assert.match(spreadFitStale(p11, { ...p10, sim: { ...p10.sim, tx: 1 } }, spec), /닮음 변환/);
  assert.match(spreadFitStale(p11, p10, { ...spec, dx: 767 }), /이동량/);
  assert.match(spreadFitStale({ ...p11, spreadOf: undefined }, p10, spec), /spreadOf/);
});

test('U1-3a 두 쪽 왼쪽이 fitFrom 지도면 오른쪽 기준점은 쓸 곳이 없다 — 버리지 않고 멈춤(기준점 0개면 지나감)', async () => {
  const { assertNoSpreadControlsOnFitFrom } = await import('../../scripts/atlas/projection_from.mjs');
  const cps = { 'p11-continents': [], 'p11b': [{ xy: [10, 10], lon: 160, lat: 0 }, { xy: [20, 10], lon: 170, lat: 0 }] };
  const cpsOf = (id) => cps[id];
  assert.doesNotThrow(() => assertNoSpreadControlsOnFitFrom('p10-continents', [{ id: 'p11-continents', dx: 765.354, dy: -0.001 }], cpsOf));
  assert.doesNotThrow(() => assertNoSpreadControlsOnFitFrom('p10-continents', undefined, cpsOf));
  assert.throws(() => assertNoSpreadControlsOnFitFrom('p10-continents', [{ id: 'p11-continents', dx: 1, dy: 0 }, { id: 'p11b', dx: 1, dy: 0 }], cpsOf),
    /p11b: 두 쪽 왼쪽 p10-continents 가 fitFrom 지도라 오른쪽 기준점 2개/);
  // georef-cli 가 알림 한 줄 대신 이 검사를 부름(옛 「잔차만」 알림이 남아 있지 않음)
  const cli = readFileSync(new URL('../../scripts/atlas/georef-cli.mjs', import.meta.url), 'utf8');
  assert.match(cli, /assertNoSpreadControlsOnFitFrom\(m\.id, spread\.left\.get\(m\.id\), loadCps\)/);
  assert.doesNotMatch(cli, /기준점은 맞춤에 안 씀\(잔차만\)/);
});

// ── Ⅰ 세계화(u1) fit: 합격 기준 + 8~11·13쪽 로빈슨 중심 140~160, 유럽 삽입 람베르트 정각 원뿔, 두 쪽 짝 = 왼쪽 fit − offsetPt, 12쪽 밀러 ─────
const U1_MAPS = JSON.parse(readFileSync(new URL('../../scripts/atlas/maps_u1.json', import.meta.url), 'utf8'));
const u1Fits = U1_MAPS.map((m) => [m.id, `${WORK_DIR}/geo/${m.id}.fit.json`]).filter(([, f]) => existsSync(f));
test('u1 fit: rmsMm·meanMm ≤ 0.5, 8~11·13쪽 로빈슨 중심 140~160, p08-europe 원뿔, 두 쪽 지도 = 왼쪽 fit − offsetPt, 12쪽 밀러', { skip: u1Fits.length ? false : '작업 폴더에 u1 fit 없음' }, () => {
  assert.deepEqual(u1Fits.map(([id]) => id), U1_MAPS.map((m) => m.id), 'u1 fit 파일이 지도 목록과 다름');
  const fits = Object.fromEntries(u1Fits.map(([id, f]) => [id, JSON.parse(readFileSync(f, 'utf8'))]));
  for (const [id, fit] of Object.entries(fits)) {
    assert.ok(!fit.approx, `${id} approx`);
    assert.ok(fit.rmsMm <= 0.5 && fit.meanMm <= 0.5, `${id} rms ${fit.rmsMm} mean ${fit.meanMm}`);
  }
  for (const id of ['p08-world', 'p09-world', 'p10-continents', 'p11-continents', 'p13-climate']) {
    assert.equal(fits[id].family, 'robinson', id);
    assert.ok(fits[id].params[0] >= 140 && fits[id].params[0] <= 160, `${id} 중심 ${fits[id].params[0]}`);
  }
  assert.equal(fits['p08-europe'].family, 'conicConformal');
  assert.equal(fits['p12-relief'].family, 'miller');
  assert.deepEqual(fits['p08-world'].spread.maps.map((r) => r.id), ['p09-world']);
  assert.ok(fits['p08-world'].spread.maps[0].n >= 12, '9쪽 기준점이 묶음 맞춤에 들어감');
  for (const m of U1_MAPS.filter((x) => x.spreadOf)) {
    const f = fits[m.id], src = fits[m.spreadOf];
    assert.deepEqual(f.spreadOf, { map: m.spreadOf, offsetPt: m.offsetPt }, m.id);
    assert.equal(f.family, src.family, m.id);
    assert.deepEqual(f.params, src.params, m.id);
    const ll = [-150, 20];
    const p = applyFit(src, ll), q = applyFit(f, ll);
    assert.ok(Math.abs(q[0] - p[0] + m.offsetPt[0]) < 1e-6 && Math.abs(q[1] - p[1] + m.offsetPt[1]) < 1e-6, m.id);
  }
  assert.deepEqual(fits['p11-continents'].via, { fitFrom: U1_MAPS.find((m) => m.id === 'p10-continents').fitFrom });
});
