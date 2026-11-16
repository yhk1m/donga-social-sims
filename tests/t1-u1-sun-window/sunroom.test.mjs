// © 2026 김용현
// tests/t1-u1-sun-window/sunroom.test.mjs — 창으로 드는 햇빛·하루 해 드는 시간(sims/t1-u1-sun-window/sunroom.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { toLocal, apertureRect, sunPatch, clipRect, polyArea, horizonAt, windowState, sunHours, HUT } from '../../sims/t1-u1-sun-window/sunroom.js';
import { sunVector, monthDayToDay } from '../../sims/t1-u1-sun-window/solar.js';
import { HORIZON, TERRAIN } from '../../sims/t1-u1-sun-window/data/terrain-meta.js';

const ARROW = { lat: TERRAIN.hut[0], lon: TERRAIN.hut[1], tz: 12 };
const CANTON = { lat: 23, lon: 113.2644, tz: 8 };
const day = (m, d) => monthDayToDay(2026, m, d);
const hours = (place, m, d, facingAz, horizon = null) => sunHours({ year: 2026, day: day(m, d), facingAz, horizon, ...place });

test('toLocal: 창이 북쪽을 보면 북쪽 해는 창 정면(+z), 동쪽 해는 -x 쪽', () => {
  const n = toLocal(sunVector(0, 0), 0);
  assert.ok(Math.abs(n.z - 1) < 1e-9 && Math.abs(n.x) < 1e-9);
  const e = toLocal(sunVector(0, 90), 0);
  assert.ok(Math.abs(e.x + 1) < 1e-9);
  const s = toLocal(sunVector(0, 180), 180);
  assert.ok(Math.abs(s.z - 1) < 1e-9);
});

test('apertureRect: 정면 해는 구멍이 열리고, 뒤나 옆에서 비스듬한 해(벽 두께에 막힘)는 닫힘', () => {
  assert.ok(apertureRect({ x: 0, y: 0.3, z: 0.95 }));
  assert.equal(apertureRect({ x: 0, y: 0.3, z: -0.95 }), null);
  assert.equal(apertureRect({ x: 0.95, y: 0.2, z: 0.2 }), null); // 77도 옆
  assert.equal(apertureRect({ x: 0, y: -0.1, z: 0.99 }), null);
});

test('sunPatch: 낮은 해는 뒷벽까지, 높은 해는 창 가까운 바닥에', () => {
  const low = sunPatch({ x: 0, y: Math.sin(0.2), z: Math.cos(0.2) });
  assert.ok(low.back.length >= 3, '낮은 해 → 뒷벽에 자국');
  const high = sunPatch({ x: 0, y: Math.sin(1.0), z: Math.cos(1.0) });
  assert.ok(high.floor.length >= 3 && high.back.length === 0);
  const zs = high.floor.map((p) => p[1]);
  assert.ok(Math.min(...zs) > 0, '높은 해 자국은 방 앞쪽 절반');
  assert.ok(polyArea(high.floor) > 0.02, `넓이 ${polyArea(high.floor)}`);
});

test('clipRect·polyArea', () => {
  const sq = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  assert.equal(polyArea(clipRect(sq, 0, 2, 0, 2)), 1);
  assert.equal(clipRect(sq, 2, 3, 2, 3).length, 0);
});

test('horizonAt: 배열 보간과 360도 둘레', () => {
  const arr = Array.from({ length: 720 }, (_, i) => i / 10);
  assert.equal(horizonAt(arr, 0), 0);
  assert.ok(Math.abs(horizonAt(arr, 0.25) - 0.05) < 1e-9);
  assert.ok(Math.abs(horizonAt(arr, 359.75) - (719 / 10) / 2) < 1e-9); // 마지막 칸과 0 사이
  assert.equal(HORIZON.length, 720);
});

test('애로타운 6월(남반구 겨울): 북향 창에 해가 들고 남향 창에는 하나도 안 든다', () => {
  const north = hours(ARROW, 6, 21, 0);
  const south = hours(ARROW, 6, 21, 180);
  assert.ok(north.minutes > 300, `북향 ${north.minutes}분`);
  assert.equal(south.minutes, 0);
  // 지형까지 넣어도 북향 창에는 해가 든다(남향은 여전히 0)
  const northT = hours(ARROW, 6, 21, 0, HORIZON);
  assert.ok(northT.minutes > 30 && northT.minutes < north.minutes, `지형 포함 북향 ${northT.minutes}분`);
  assert.equal(hours(ARROW, 6, 21, 180, HORIZON).minutes, 0);
  assert.ok(north.daylight > 8 * 60 && north.daylight < 9.5 * 60, `낮 길이 ${north.daylight}분`);
});

test('광둥(북위 23도) 12월: 남향 창에 해가 길게, 북향 창에는 안 든다', () => {
  assert.ok(hours(CANTON, 12, 22, 180).minutes > 6 * 60);
  assert.equal(hours(CANTON, 12, 22, 0).minutes, 0);
});

test('windowState: 밤, 지형 가림, 벽, 창', () => {
  assert.equal(windowState({ alt: -5, az: 0 }, 0, null), 'night');
  const hz = new Array(720).fill(30);
  assert.equal(windowState({ alt: 20, az: 0 }, 0, hz), 'terrain');
  assert.equal(windowState({ alt: 20, az: 0 }, 0, null), 'lit');
  assert.equal(windowState({ alt: 20, az: 0 }, 180, null), 'wall');
});

test('창 크기 상수', () => {
  assert.ok(HUT.win.top > HUT.win.sill && HUT.win.top < HUT.wallH);
});
