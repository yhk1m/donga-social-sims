// tests/atlas/lod.test.mjs — 확대 수준 → 바탕 지도 상세도, 단원 범위 안 판정, 상세도별 TopoJSON 객체 이름
import test from 'node:test';
import assert from 'node:assert/strict';
import { pickDetail, inUnit, detailObjects } from '../../src/atlas/lod.js';

test('확대 수준별 상세도', () => {
  assert.equal(pickDetail(1), '110');
  assert.equal(pickDetail(1.99, true), '110');
  assert.equal(pickDetail(2), '50');
  assert.equal(pickDetail(2.4), '50');
  assert.equal(pickDetail(3.99, true), '50');
  assert.equal(pickDetail(4, true), '10a');
  assert.equal(pickDetail(6, true), '10a');
  assert.equal(pickDetail(6, false), '50');
  assert.equal(pickDetail(40, false), '50');
});

test('단원 범위 안 판정(여러 상자, 경도 감기)', () => {
  const boxes = [[20, -15, 180, 82], [-180, 60, -165, 72]];
  assert.equal(inUnit([127, 37], boxes), true);
  assert.equal(inUnit([0, 50], boxes), false);
  assert.equal(inUnit([-170, 65], boxes), true); // 추코트카
  assert.equal(inUnit([190, 65], boxes), true); // 경도 360 감김 = −170
  assert.equal(inUnit([127, 85], boxes), false);
  assert.equal(inUnit([127, 37], []), false);
});

test('상세도별 객체 이름(110 은 하천·호수 없음)', () => {
  assert.deepEqual(detailObjects('110'), { land: 'land110', countries: 'countries110', rivers: null, lakes: null });
  assert.deepEqual(detailObjects('50'), { land: 'land50', countries: 'countries50', rivers: 'rivers50', lakes: 'lakes50' });
  assert.deepEqual(detailObjects('10a'), { land: 'land10a', countries: 'countries10a', rivers: 'rivers10a', lakes: 'lakes10a' });
  assert.throws(() => detailObjects('20'));
});
