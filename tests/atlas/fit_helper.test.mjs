// © 2026 김용현
// tests/atlas/fit_helper.test.mjs — Python 단계용 맞추기·투영 도우미(fit_helper.mjs) 검사
import test from 'node:test';
import assert from 'node:assert/strict';
import { geoConicConformal } from 'd3-geo';
import { runOps } from '../../scripts/atlas/fit_helper.mjs';

const truth = geoConicConformal().rotate([-15, 0]).parallels([52.7, 52.7]).scale(2000).translate([400, 900]);
const cps = [];
for (let lon = -20; lon <= 50; lon += 10) for (let lat = 35; lat <= 70; lat += 5) { const [x, y] = truth([lon, lat]); cps.push({ xy: [x, y], lon, lat, src: 'grid' }); }
const FAM = ['conicConformal', 'miller'];

test('fit → apply·invert 가 원래 식과 맞고 서로 되돌린다', () => {
  const [fit] = runOps([{ op: 'fit', cps, families: FAM }]);
  assert.equal(fit.family, 'conicConformal');
  assert.ok(fit.rmsPt < 0.01, `${fit.rmsPt}`);
  const [[[p]]] = runOps([{ op: 'apply', fit, rings: [[[10, 50]]] }]);
  const t = truth([10, 50]);
  assert.ok(Math.hypot(p[0] - t[0], p[1] - t[1]) < 0.01);
  const [[ll]] = runOps([{ op: 'invert', fit, pts: [p] }]);
  assert.ok(Math.abs(ll[0] - 10) < 1e-6 && Math.abs(ll[1] - 50) < 1e-6, `${ll}`);
});

test('투영할 수 없는 점은 null, 길이는 그대로', () => {
  const [fit] = runOps([{ op: 'fit', cps, families: FAM }]);
  const [[[a, b]]] = runOps([{ op: 'apply', fit, rings: [[[10, 50], [NaN, 50]]] }]);
  assert.ok(a && b === null);
});

test('cli: georef-cli 와 같이 튄 경위선 교차점을 빼고 남은 번호를 알려 준다', () => {
  const bad = cps.map((c, i) => (i === 5 ? { ...c, xy: [c.xy[0] + 30, c.xy[1]] } : c));
  const [fit] = runOps([{ op: 'fit', cps: bad, families: FAM, cli: true }]);
  assert.equal(fit.dropped.length, 1);
  assert.ok(!fit.keep.includes(5) && fit.keep.length === bad.length - 1);
  assert.ok(fit.rmsPt < 0.01);
});
