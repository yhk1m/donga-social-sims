// © 2026 김용현
// tests/atlas/pt2lonlat.test.mjs — 지면 pt → 경위도 도우미 검사
import test from 'node:test';
import assert from 'node:assert/strict';
import { geoAzimuthalEqualArea } from 'd3-geo';
import { fitControls, applyFit } from '../../scripts/atlas/georef.mjs';
import { toLonLat, centerLon } from '../../scripts/atlas/pt2lonlat.mjs';
import { loadFit } from '../../scripts/atlas/geo_util.mjs';

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

test('되돌릴 수 없는 점은 null, 길이는 입력과 같다', () => {
  // 방위 정적 투영의 반대쪽(원 밖) 아주 먼 점
  const out = toLonLat({ m: fit }, { m: [[1e9, 1e9], applyFit(fit, [100, 40])] });
  assert.equal(out.m.length, 2);
  assert.equal(out.m[0], null);
  assert.ok(out.m[1]);
});

test('centerLon: params[0], 없으면 오류', () => {
  assert.equal(centerLon({ params: [99.5, 1] }), 99.5);
  assert.throws(() => centerLon({ id: 'x', params: [] }), /중심 경도/);
});

test('loadFit: 파일이 없으면 무엇을 먼저 돌릴지 알려 준다', () => {
  assert.throws(() => loadFit('no-such-map-id'), /fit 파일 없음.*georef-cli/);
});
