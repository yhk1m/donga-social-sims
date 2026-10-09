// tests/atlas/lineStyle.test.mjs — 바탕 지도 선 굵기·표시 규칙(확대할수록 굵게, 작은 하천·호수는 확대해야 보임)
import test from 'node:test';
import assert from 'node:assert/strict';
import { riverStyle, lakeVisible, graticuleStep, borderWidth, coastWidth } from '../../src/atlas/lineStyle.js';

test('하천: 등급(s)이 작을수록·확대할수록 굵게, 작은 하천은 확대해야 보임', () => {
  const big = riverStyle(1, 2), small = riverStyle(6, 3);
  assert.ok(big.width > small.width);
  assert.ok(riverStyle(1, 10).width > riverStyle(1, 2).width);
  assert.equal(riverStyle(6, 2).visible, false);
  assert.equal(riverStyle(6, 3).visible, true);
  assert.ok(riverStyle(1, 40).width <= 2.4);
  assert.ok(riverStyle(6, 3).width >= 0.5);
});

test('호수: 작은 호수(s 큰 값)는 더 확대해야 보임', () => {
  assert.equal(lakeVisible(0, 2), true);
  assert.equal(lakeVisible(9, 4), false);
  assert.equal(lakeVisible(9, 12), true);
});

test('경위선 간격: 세계 30°, 확대 10°, 크게 확대 5°', () => {
  assert.equal(graticuleStep(1), 30);
  assert.equal(graticuleStep(2.5), 10);
  assert.equal(graticuleStep(12), 5);
});

test('국경·해안선 굵기: 국경 0.6/0.75/0.9px(k 2·4 경계), 해안선 0.6/0.8px(k 2 경계)', () => {
  assert.deepEqual([1, 1.99, 2, 3.99, 4, 40].map(borderWidth), [0.6, 0.6, 0.75, 0.75, 0.9, 0.9]);
  assert.deepEqual([1, 1.99, 2, 40].map(coastWidth), [0.6, 0.6, 0.8, 0.8]);
});
