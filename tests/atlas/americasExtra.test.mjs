// tests/atlas/americasExtra.test.mjs — 아메리카(U5-3) 등록 길: 등록 전에는 옛 동작(모르는 도법), 등록 뒤에만 새 도법.
// 이 파일은 따로 된 프로세스(node --test)라 등록 전 상태를 본 뒤 등록한다 — georef.mjs 는 불러올 때 도법을 등록하므로 등록 전 시험 뒤에 동적 import.
import test from 'node:test';
import assert from 'node:assert/strict';
import { geoStereographic, geoOrthographic } from 'd3-geo';
import { familyOf, FAMILIES } from '../../src/atlas/fitCore.js';
import { makeFitForward } from '../../src/atlas/fitProject.js';
import { installAmericasFamilies, installAmericasExtras } from '../../src/atlas/americasExtra.js';

const SIM = { a: 1, b: 0, tx: 0, ty: 0 };

/** 합성 기준점: 투영(배율 2000, 지면 pt) 위 격자 점 + 결정적 잡음(±0.1pt) */
function synth(proj, lons, lats) {
  const cps = []; let k = 0;
  for (const lon of lons) for (const lat of lats) {
    const q = proj([lon, lat]); k++;
    cps.push({ xy: [q[0] + 0.1 * Math.sin(k * 1.7), q[1] + 0.1 * Math.cos(k * 2.3)], lon, lat });
  }
  return cps;
}
const lons = [-120, -100, -80, -60, -40], lats = [-40, -20, 0, 20, 40, 55, 65, 70];

test('등록 전: familyOf 는 undefined, makeFitForward 는 「모르는 교과서 도법」, 고정 8개는 그대로', () => {
  assert.equal(familyOf('stereographic'), undefined);
  assert.equal(familyOf('orthographic'), undefined);
  assert.throws(() => makeFitForward({ family: 'stereographic', params: [0, 0], sim: SIM }), /모르는 교과서 도법/);
  assert.equal(Object.keys(FAMILIES).length, 8);
  assert.ok(Object.isFrozen(FAMILIES));
  assert.equal(familyOf('miller'), FAMILIES.miller);
});

test('등록 뒤: 평사·정사 = d3 평사·정사(중심 회전), 고정 8개는 늘지 않음', () => {
  installAmericasExtras(); // = installAmericasFamilies + (뒤 하위 기능의 등록)
  installAmericasFamilies(); // 두 번 불러도 같음
  assert.equal(Object.keys(FAMILIES).length, 8);
  assert.equal(FAMILIES.stereographic, undefined);
  const st = familyOf('stereographic')([-75, 10]).scale(1).translate([0, 0]);
  const ref = geoStereographic().rotate([75, -10]).scale(1).translate([0, 0]);
  assert.deepEqual(st([-60, 30]), ref([-60, 30]));
  assert.deepEqual(st([-75, 10]).map((v) => Math.abs(v) < 1e-12 ? 0 : v), [0, 0]);
  const or = familyOf('orthographic')([-30, 20]);
  assert.equal(or.clipAngle(), 90);
  assert.deepEqual(or.scale(1).translate([0, 0])([0, 40]), geoOrthographic().rotate([30, -20]).scale(1).translate([0, 0])([0, 40]));
  const fwd = makeFitForward({ family: 'stereographic', params: [-75, 10], sim: { a: 2, b: 0, tx: 5, ty: 7 } });
  const q = ref([-60, 30]);
  assert.deepEqual(fwd([-60, 30]), [2 * q[0] + 5, 2 * q[1] + 7]);
});

test('georef: 합성 평사 기준점(40점 + 잡음 0.1pt)에서 평사를 고르고 중심 ±0.5°, 정사도 같음', async () => {
  const { fitControls } = await import('../../scripts/atlas/georef.mjs');
  const stP = geoStereographic().rotate([80, -15]).scale(2000).translate([400, 300]);
  const st = fitControls(synth(stP, lons, lats), ['stereographic', 'azimuthalEquidistant']);
  assert.equal(st.family, 'stereographic');
  assert.ok(Math.abs(st.params[0] - -80) <= 0.5 && Math.abs(st.params[1] - 15) <= 0.5, `${st.params}`);
  assert.ok(st.rmsPt < 0.2, `${st.rmsPt}`);
  // 정사: 반구 안쪽 점만(원판 가장자리는 피함)
  const orP = geoOrthographic().rotate([40, -30]).scale(2000).translate([400, 300]);
  const or = fitControls(synth(orP, [-90, -70, -50, -30, -10, 10], [0, 15, 30, 45, 60]), ['orthographic', 'azimuthalEquidistant']);
  assert.equal(or.family, 'orthographic');
  assert.ok(Math.abs(or.params[0] - -40) <= 0.5 && Math.abs(or.params[1] - 30) <= 0.5, `${or.params}`);
});

test('georef: 1단계 8개 후보 고정 — 새 이름은 기본 후보에 없음, 지도·단원이 적으면 풀림', async () => {
  const { FAMILY_NAMES, PHASE1_FAMILIES, familiesFor } = await import('../../scripts/atlas/georef.mjs');
  const OLD = ['azimuthalEqualArea', 'azimuthalEquidistant', 'conicEqualArea', 'conicConformal', 'miller', 'robinson', 'equirectangular', 'mercator'];
  assert.deepEqual([...PHASE1_FAMILIES], OLD);
  assert.deepEqual([...FAMILY_NAMES], OLD);
  assert.deepEqual(familiesFor({ id: 'p16-asia' }, { georef: {} }), OLD);
  assert.deepEqual(familiesFor({ id: 'p40-americas', families: ['stereographic'] }, {}), ['stereographic']);
  assert.deepEqual(familiesFor({ id: 'p46-migration', families: ['orthographic'] }, {}), ['orthographic']);
  assert.throws(() => familiesFor({ id: 'x', families: ['gnomonic'] }, {}), /gnomonic/);
});
