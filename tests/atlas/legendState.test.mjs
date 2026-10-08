// tests/atlas/legendState.test.mjs — 범례 = 필터 상태(D6)
import test from 'node:test';
import assert from 'node:assert/strict';
import { createLegendState } from '../../src/atlas/legendState.js';

test('분류를 누르면 그것만 활성, 다시 누르면 해제', () => {
  const s = createLegendState(['A', 'B', 'C']);
  assert.equal(s.isActive('B'), true); s.toggle('B');
  assert.equal(s.isActive('A'), false); assert.equal(s.isActive('B'), true);
  s.toggle('B'); assert.equal(s.isActive('A'), true);
});

test('다른 분류를 누르면 그쪽으로 옮겨감', () => {
  const s = createLegendState(['A', 'B']); s.toggle('A'); s.toggle('B');
  assert.equal(s.isActive('A'), false); assert.equal(s.isActive('B'), true);
});

test('selected·reset·onChange(구독 해제 포함)', () => {
  const s = createLegendState(['A', 'B']);
  const seen = [];
  const off = s.onChange((v) => seen.push(v));
  assert.equal(s.selected(), null);
  s.toggle('A'); assert.equal(s.selected(), 'A');
  s.reset(); assert.equal(s.selected(), null);
  off(); s.toggle('B');
  assert.deepEqual(seen, ['A', null]);
  assert.deepEqual(s.classes, ['A', 'B']);
});
