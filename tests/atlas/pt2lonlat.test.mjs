// © 2026 김용현
// tests/atlas/pt2lonlat.test.mjs — 지면 pt → 경위도 도우미 검사
import test from 'node:test';
import assert from 'node:assert/strict';
import { geoAzimuthalEqualArea } from 'd3-geo';
import { fitControls, applyFit } from '../../scripts/atlas/georef.mjs';
import { toLonLat } from '../../scripts/atlas/pt2lonlat.mjs';

const truth = geoAzimuthalEqualArea().rotate([-100, -40]).scale(520).translate([390, 360]);
const cps = [];
for (let lon = 60; lon <= 140; lon += 10) for (let lat = 10; lat <= 60; lat += 10) { const [x, y] = truth([lon, lat]); cps.push({ xy: [x, y], lon, lat }); }
const fit = fitControls(cps);

test('지면 pt 를 경위도로 되돌린다(applyFit 의 역)', () => {
  const xy = applyFit(fit, [104.3, 52.3]);
  const out = toLonLat({ m: fit }, { m: [xy] });
  assert.ok(Math.abs(out.m[0][0] - 104.3) < 1e-3 && Math.abs(out.m[0][1] - 52.3) < 1e-3, JSON.stringify(out));
});

test('fit 이 없는 지도는 오류', () => {
  assert.throws(() => toLonLat({}, { nope: [[0, 0]] }), /fit 없음/);
});
