// © 2026 김용현
// tests/atlas/geo_util.test.mjs — 아틀라스 Node 공용 도구 검사
import test from 'node:test';
import assert from 'node:assert/strict';
import { key, km, median, cmp } from '../../scripts/atlas/geo_util.mjs';
import { merge } from '../../scripts/atlas/build_places.mjs';

test('key·km·median', () => {
  assert.equal(key('고비 사막'), key('고비사막'));
  assert.ok(Math.abs(km([126.98, 37.57], [139.69, 35.69]) - 1153) < 10);   // 서울–도쿄
  assert.equal(median([3, 1, 2]), 2);
  assert.ok(Number.isNaN(median([])));
});

test('cmp 는 NaN·Infinity 에서도 일관된 순서', () => {
  assert.equal(cmp(Infinity, Infinity), 0);
  assert.equal(cmp(NaN, 1), 1); assert.equal(cmp(1, NaN), -1); assert.equal(cmp(NaN, NaN), 0);
  assert.deepEqual([3, NaN, 1, Infinity].sort(cmp), [1, 3, Infinity, NaN]);
});

test('merge: 축척을 모르는 지도(Infinity)가 섞여도 위치는 기호 있는 큰 축척 출현', () => {
  const o = (map, scale, symbol, ll) => ({ name: 'A', kind: 'city', point: true, ll, size: 5.7, page: 16, map, scale, overview: map === 'ov', ...(symbol ? { symbol } : {}) });
  const [p] = merge([o('x', Infinity, true, [100, 10]), o('y', Infinity, true, [100.01, 10]), o('ov', 4e7, true, [100.02, 10])]);
  assert.deepEqual([p.lon, p.lat], [100.02, 10]);
});
