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

test('모르는 분류는 오류, 이미 전체일 때 reset 은 알리지 않음', () => {
  const s = createLegendState(['A', 'B']);
  assert.throws(() => s.toggle('Z'), /모르는 범례 분류/);
  let n = 0; s.onChange(() => n++);
  s.reset(); assert.equal(n, 0);
  s.toggle('A'); s.reset(); assert.equal(n, 2);
});

test('구독자 하나가 오류를 내도 나머지는 알림을 받고 상태는 바뀜', () => {
  const s = createLegendState(['A', 'B']);
  const seen = [], errors = [];
  s.onChange(() => { throw new Error('구독자 오류'); });
  s.onChange((v) => seen.push(v));
  const orig = console.error; console.error = (...a) => errors.push(a);
  try { s.toggle('A'); } finally { console.error = orig; }
  assert.deepEqual(seen, ['A']);
  assert.equal(s.selected(), 'A');
  assert.equal(errors.length, 1);
});
