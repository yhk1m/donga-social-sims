// © 2026 김용현
// tests/t1-u1-sun-window/solar.test.mjs — 태양 위치(sims/t1-u1-sun-window/solar.js)를 알려진 값과 대조.
// 기준값: PyEphem 4.2.1(기하학적 고도, 대기 굴절 0)로 구한 값 — NOAA 태양 계산기와 0.05도 안쪽으로 맞는 것이 정상.
import test from 'node:test';
import assert from 'node:assert/strict';
import { sunPosition, localToUtc, dayToMonthDay, monthDayToDay, declEot, julianDay } from '../../sims/t1-u1-sun-window/solar.js';

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a.toFixed(3)} vs ${b} (허용 ${tol})`);
const azNear = (a, b, tol, msg) => near(((a - b + 540) % 360) - 180, 0, tol, msg);

const CASES = [
  // [이름, 위도, 경도, UTC, 고도, 방위각, 적위]
  ['애로타운 6월 21일 정오(뉴질랜드 표준시)', -44.938, 168.8286, Date.UTC(2026, 5, 21, 0, 0), 20.807, 11.381, 23.44],
  ['애로타운 12월 22일 15시', -44.938, 168.8286, Date.UTC(2026, 11, 22, 3, 0), 54.872, 296.222, -23.436],
  ['애로타운 9월 24일 8시 30분', -44.938, 168.8286, Date.UTC(2026, 8, 23, 20, 30), 19.832, 69.436, -0.329],
  ['서울 3월 20일 정오(한국 표준시)', 37.5665, 126.978, Date.UTC(2026, 2, 20, 3, 0), 51.145, 164.079, -0.195],
  ['광저우 6월 21일 12시 30분(중국 표준시)', 23.1291, 113.2644, Date.UTC(2026, 5, 21, 4, 30), 89.569, 315.837, 23.438],
  ['그리니치 11월 3일 정오', 51.4779, -0.0015, Date.UTC(2026, 10, 3, 12, 0), 23.272, 184.319, -15.153],
];

for (const [name, lat, lon, ms, alt, az, decl] of CASES) {
  test(`sunPosition: ${name}`, () => {
    const p = sunPosition(ms, lat, lon);
    near(p.alt, alt, 0.05, '고도');
    near(p.decl, decl, 0.02, '적위');
    // 해가 천정 가까이 있으면 방위각이 크게 흔들리므로 허용 폭을 넓힌다
    azNear(p.az, az, alt > 85 ? 3 : 0.1, '방위각');
  });
}

test('균시차: 11월 초 약 +16.4분, 2월 중순 약 -14.2분', () => {
  const T = (ms) => (julianDay(ms) - 2451545) / 36525;
  near(declEot(T(Date.UTC(2026, 10, 3, 12))).eot, 16.4, 0.2, '11월 3일');
  near(declEot(T(Date.UTC(2026, 1, 11, 12))).eot, -14.2, 0.2, '2월 11일');
});

test('남반구 겨울(6월) 정오 무렵 해는 북쪽, 북반구 같은 날 해는 남쪽 높이', () => {
  const day = monthDayToDay(2026, 6, 21);
  let best = { alt: -99 };
  for (let m = 600; m < 900; m++) {
    const p = sunPosition(localToUtc(2026, day, m, 12), -44.938, 168.8286);
    if (p.alt > best.alt) best = { ...p, m };
  }
  near(best.alt, 90 - 44.938 - 23.44, 0.1, '남중 고도');
  azNear(best.az, 0, 1, '남중 때 방위(북)');
  near(best.m, 12 * 60 + 46, 3, '남중 시각(12시 45분 무렵)');
  const g = sunPosition(localToUtc(2026, day, 12 * 60 + 27, 8), 23, 113.2644);
  assert.ok(g.alt > 85, '광둥 6월 정오는 거의 머리 위');
});

test('날짜 바꾸기', () => {
  assert.equal(monthDayToDay(2026, 1, 1), 1);
  assert.equal(monthDayToDay(2026, 6, 21), 172);
  assert.deepEqual(dayToMonthDay(2026, 172), { month: 6, day: 21 });
  assert.deepEqual(dayToMonthDay(2026, 365), { month: 12, day: 31 });
});
