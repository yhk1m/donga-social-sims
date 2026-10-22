// tests/atlas/units/u6.dateline.test.mjs — U6-3d 날짜변경선 단원 상자(설계 §6.1-4)·삽입 지명 합치기(Q3).
//   새 엔진 코드 없음 — 이미 있는 lod.inUnit(±360 감김)·build_basemap(상자 여러 개 자르기)·simplifyByIso 로 되는지 확인.
//   바탕 지도 시험은 u6 바탕 지도(U6-9 의 sims/atlas-u6-oceania-polar/data/basemap.json)가 있으면 그것, 없으면 작업 폴더의 시험 바탕 지도
//   ($ATLAS_WORK/units/u6/u6-3dj/basemap-test.json — 지금 u6 설정 그대로 out 만 바꿔 만든 것)로, 둘 다 없으면 건너뜀.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { feature } from 'topojson-client';
import { REPO, WORK, readJson } from '../../../scripts/atlas/geo_util.mjs';
import { inUnit, pickDetail } from '../../../src/atlas/lod.js';

const CFG = readJson(path.join(REPO, 'scripts/atlas/config/u6.json'));
const BOXES = CFG.basemap.unitBoxes;
const BM = [path.join(REPO, CFG.basemap.out), path.join(WORK, 'units/u6/u6-3dj/basemap-test.json')].find((f) => existsSync(f));

test('단원 상자 둘(날짜변경선 건넘): 섬나라 수도는 어느 쪽이든 10a, ±360 으로 편 경도도 같음, 하와이·시드니는 밖', () => {
  const inside = {
    타라와: [172.98, 1.33], 푸나푸티: [179.19, -8.52], 수바: [178.44, -18.14], '피지 라우 제도': [-178.8, -17.9], 키리티마티: [-157.4, 1.87],
    아피아: [-171.76, -13.83], 누쿠알로파: [-175.2, -21.14], 응게룰무드: [134.62, 7.5], 마주로: [171.38, 7.1], 팔리키르: [158.16, 6.92], 야렌: [166.92, -0.55],
    파페에테: [-149.57, -17.54],
  };
  for (const [n, ll] of Object.entries(inside)) {
    assert.ok(inUnit(ll, BOXES), n);
    assert.ok(inUnit([ll[0] + 360, ll[1]], BOXES) && inUnit([ll[0] - 360, ll[1]], BOXES), `${n} ±360`);
    assert.equal(pickDetail(4, inUnit(ll, BOXES)), '10a', n);
  }
  // 태평양 중심(중심 경도 150) 화면 가운데가 180° 를 넘어 편 경도(190° = −170°)여도 상자 안
  assert.ok(inUnit([190, -14], BOXES));
  for (const [n, ll] of Object.entries({ 호놀룰루: [-157.86, 21.31], 시드니: [151.21, -33.87], 오클랜드: [174.76, -36.85] })) assert.equal(inUnit(ll, BOXES), false, n);
});

test('삽입 지명 합치기 차례(Q3): 하와이·타히티 삽입 → 48쪽 본 지도 → 극 일반도 둘', () => {
  assert.deepEqual(CFG.places.mergePriority, ['p48-hawaii', 'p48-tahiti', 'p48-oceania', 'p50-arctic', 'p51-antarctic']);
  assert.deepEqual([...CFG.places.mergePriority].sort(), [...CFG.places.maps].sort());
});

test('바탕 지도 10a: 날짜변경선 양쪽 피지·키리바시 조각, 산호초 섬나라 조각이 단순화로 사라지지 않음, 조각은 단원 상자 안', { skip: !BM && 'u6 바탕 지도 없음' }, () => {
  const topo = readJson(BM);
  assert.deepEqual(topo.meta.unitBoxes, BOXES);
  const f10 = feature(topo, topo.objects.countries10a).features;
  const polys = (iso) => f10.filter((f) => f.properties.iso === iso).flatMap((f) => (f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates));
  const lons = (iso) => polys(iso).flatMap((p) => p[0].map((c) => c[0]));
  // 피지(180° 를 지남)·키리바시(길버트 제도 동경 · 피닉스·라인 제도 서경)는 두 상자에 걸쳐 양쪽 조각이 다 있음
  for (const iso of ['FJI', 'KIR']) {
    assert.ok(lons(iso).some((x) => x > 170), `${iso} 동경 쪽`);
    assert.ok(lons(iso).some((x) => x < -170), `${iso} 서경 쪽`);
  }
  // simplifyByIso 100% 없이 만들면 키리바시 1·투발루 1·마셜 1·미크로네시아 1(나라마다 가장 큰 고리만) — 원본 Natural Earth 10m 조각 수
  const min = { KIR: 35, TUV: 9, MHL: 22, FSM: 20, PLW: 9, TON: 10, COK: 13, ASM: 5, FJI: 44, MNP: 12 };   // U6-9: 피지 100%(라우 제도) · 북마리아나 상자 북쪽 21(20.56°N 까지)
  if (BM.endsWith('basemap.json')) {
    assert.ok(polys('MNP').some((p) => p[0].some(([, y]) => y > 20.5)), '북마리아나 파라욘데파하로스섬(20.56°N)');
    assert.ok(polys('FJI').some((p) => p[0].some(([x]) => x > -179 && x < -178)), '피지 라우 제도');
  }
  for (const [iso, n] of Object.entries(min)) assert.ok(polys(iso).length >= n, `${iso} 조각 ${polys(iso).length} < ${n}`);
  // 타라와(길버트 제도 — 수도) 둘레 섬이 있음
  assert.ok(polys('KIR').some((p) => p[0].some(([x, y]) => Math.abs(x - 173) < 0.3 && Math.abs(y - 1.4) < 0.4)), '타라와');
  // 모든 10a 꼭짓점이 단원 상자 안(자르기) — 양자화 여유 0.01°
  const eps = 0.01;
  const inBox = ([x, y]) => BOXES.some(([w, s, e, n]) => x >= w - eps && x <= e + eps && y >= s - eps && y <= n + eps);
  for (const f of f10) for (const p of (f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates)) for (const c of p[0]) assert.ok(inBox(c), `${f.properties.iso} ${c}`);
});
