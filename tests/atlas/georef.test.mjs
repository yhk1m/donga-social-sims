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
