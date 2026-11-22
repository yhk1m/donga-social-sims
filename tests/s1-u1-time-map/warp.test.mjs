// © 2026 김용현
// 시간 지도 변형 계산 시험: node --test tests/s1-u1-time-map
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeControls, scaleAt, warpPoint, warpFlat, lerpFlat, easeInOut, bounds, formatMinutes } from '../../sims/s1-u1-time-map/warp.js';

const O = [0, 0];
const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

test('도시는 시간×k 만큼 떨어진 곳으로, 방향은 그대로', () => {
  const ctl = makeControls(O, [{ x: 30, y: 40, t: 100 }, { x: -60, y: 0, t: 20 }], 1);
  const [x, y] = warpPoint(30, 40, O, ctl);
  near(Math.hypot(x, y), 100);
  near(Math.atan2(y, x), Math.atan2(40, 30));
  const [x2, y2] = warpPoint(-60, 0, O, ctl);
  near(x2, -20); near(y2, 0);
});

test('시간이 없는(갈 수 없는) 도시와 원점은 조절점에서 빠진다', () => {
  const ctl = makeControls(O, [{ x: 0, y: 0, t: 0 }, { x: 10, y: 0, t: null }, { x: 0, y: 10, t: 5 }], 2);
  assert.equal(ctl.length, 1);
  near(ctl[0].s, 1);
});

test('조절점 사이 점은 배율이 두 값 사이(가중 평균)', () => {
  const ctl = [{ x: 10, y: 0, s: 1 }, { x: -10, y: 0, s: 3 }];
  near(scaleAt(0, 5, ctl), 2);
  const s = scaleAt(5, 0, ctl);
  assert.ok(s > 1 && s < 2, `가까운 쪽(1)에 더 가까워야: ${s}`);
});

test('조절점이 없으면 실제 지도(배율 1)', () => {
  near(scaleAt(3, 4, []), 1);
  assert.deepEqual([...warpFlat([3, 4, 5, 6], [1, 1], [])], [3, 4, 5, 6]);
});

test('모든 배율이 같으면 원점 중심 확대·축소와 같다', () => {
  const ctl = [{ x: 10, y: 0, s: 0.5 }, { x: 0, y: 10, s: 0.5 }];
  const out = warpFlat([4, 2, -8, 6], [2, 2], ctl);
  assert.deepEqual([...out], [3, 2, -3, 4]);
});

test('보간과 부드러운 곡선', () => {
  assert.deepEqual([...lerpFlat([0, 10], [10, 20], 0.25)], [2.5, 12.5]);
  near(easeInOut(0), 0); near(easeInOut(1), 1); near(easeInOut(0.5), 0.5);
  assert.ok(easeInOut(0.1) < 0.1 && easeInOut(0.9) > 0.9);
  near(easeInOut(-1), 0); near(easeInOut(2), 1);
});

test('테두리 상자', () => {
  assert.deepEqual(bounds([[1, 5, 3, -2], [0, 0]]), [0, -2, 3, 5]);
});

test('시간 글', () => {
  assert.equal(formatMinutes(150), '2시간 30분');
  assert.equal(formatMinutes(60), '1시간');
  assert.equal(formatMinutes(54), '54분');
  assert.equal(formatMinutes(30 * 1440, { days: true }), '약 30일');
  assert.equal(formatMinutes(2.46 * 1440, { days: true }), '약 2.5일');
});

// 2026-11-22: 역, 공항이 없는 도시도 갈아타기로 시간을 가진다(지도에 빈 도시가 없게)
import { timesFor, carBetween, TRANSFER_MIN } from '../../sims/s1-u1-time-map/data/times.js';
test('KTX, 비행기 지도에서 뭍의 모든 도시가 시간을 가진다', () => {
  for (const mode of ['ktx', 'air']) {
    const t = timesFor(mode);
    for (const [id, v] of Object.entries(t)) {
      if (mode === 'ktx' && (id === 'jeju' || id === 'seogwipo')) { assert.equal(v.min, null); continue; }
      assert.ok(v.min > 0, `${mode} ${id}`);
      assert.ok(v.min <= timesFor('car')[id]?.min || timesFor('car')[id]?.min == null, `${mode} ${id} 는 자동차보다 늦지 않다`);
    }
  }
});
test('갈아타기 시간 = 역까지 + 갈아타기 + 자동차, 섬과 뭍 사이는 차로 못 감', () => {
  const t = timesFor('air');
  const v = t.seogwipo;
  assert.equal(v.via, 'jeju');
  near(v.min, t.jeju.min + TRANSFER_MIN + carBetween('jeju', 'seogwipo'), 1e-9);
  assert.equal(carBetween('jeju', 'busan'), null);
});
