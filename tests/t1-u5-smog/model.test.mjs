// tests/t1-u5-smog/model.test.mjs — 스모그 뚜껑 모형: 기온 단면, 역전층 판정, 연기 덩어리 걸음, 1952년 재생
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  profile, findInversions, lidHeight, stepParcel, riseHeight, dailyRun, runReplay, visibility,
  stateAt, depthFor, sunAt, DZ, Z_TOP, LAPSE_ENV, REPLAY_HOURS,
} from '../../sims/t1-u5-smog/model.js';
import { LONDON_1952 } from '../../sims/t1-u5-smog/data/london1952.js';

const prof = (S, wind = 'none', sub) => profile({ base: 6, S, D: depthFor(S, wind), sub });

test('편차가 없으면 위로 갈수록 고르게 낮아지고 역전층이 없다', () => {
  const T = prof(0);
  assert.equal(T.length, Z_TOP / DZ + 1);
  assert.ok(Math.abs(T[0] - 6) < 1e-9);
  assert.ok(Math.abs(T[10] - (6 - LAPSE_ENV * 100)) < 1e-9);
  assert.deepEqual(findInversions(T), []);
});

test('땅이 식으면 땅에 붙은 역전층이 생기고, 더 식을수록 두껍고 세다', () => {
  const a = findInversions(prof(-3));
  const b = findInversions(prof(-8));
  assert.equal(a.length, 1);
  assert.equal(a[0].bottom, 0);
  assert.ok(b[0].top > a[0].top, '더 차가우면 더 두껍다');
  assert.ok(b[0].dT > a[0].dT, '더 차가우면 더 세다');
  // 해석해: dT/dz=0 인 높이 = D ln(-S/(D Γ))
  const D = depthFor(-8, 'none');
  const zTheory = D * Math.log(8 / (D * LAPSE_ENV));
  assert.ok(Math.abs(b[0].top - zTheory) <= DZ, `${b[0].top} ≈ ${zTheory}`);
});

test('낮에 땅이 데워지면 역전층이 없다', () => {
  assert.deepEqual(findInversions(prof(2.5)), []);
  assert.equal(lidHeight(findInversions(prof(2.5))), null);
});

test('고기압 하강 기류로 위쪽이 데워지면 떠 있는 역전층이 생긴다', () => {
  const inv = findInversions(prof(0, 'none', { dT: 4.5, zb: 90, w: 120 }));
  assert.equal(inv.length, 1);
  assert.ok(inv[0].bottom >= 80 && inv[0].top <= 220, JSON.stringify(inv));
});

test('역전층 판정: 손으로 만든 단면', () => {
  const T = [10, 9, 9.5, 10, 9, 8, 8.05, 7];
  const inv = findInversions(T, 100, 0.15);
  assert.deepEqual(inv.map((l) => [l.bottom, l.top]), [[100, 300]], '0.05 °C 짜리 약한 구간은 버린다');
  assert.deepEqual(findInversions([1, 2, 3], 10).map((l) => [l.bottom, l.top]), [[0, 20]], '꼭대기까지 오르는 구간');
});

test('연기 덩어리: 둘레보다 따뜻하면 오르고, 오르며 식는다', () => {
  const T = prof(0);
  const p1 = stepParcel({ z: 20, T: T[2] + 5, w: 0 }, T, 2);
  assert.ok(p1.w > 0 && p1.z > 20);
  const p2 = stepParcel({ z: 20, T: T[2] - 3, w: 0 }, T, 2);
  assert.ok(p2.w < 0, '둘레보다 차가우면 가라앉는다');
  const p3 = stepParcel({ z: 0, T: T[0] - 3, w: 0 }, T, 2);
  assert.equal(p3.z, 0, '땅 아래로는 안 간다');
});

test('맑고 바람 없는 밤에는 집 연기가 역전층 꼭대기 아래에 갇히고, 낮에는 더 높이 오른다', () => {
  const night = prof(-7);
  const lid = lidHeight(findInversions(night));
  const hNight = riseHeight(night, 15, 3);
  assert.ok(lid > 150);
  assert.ok(hNight < lid, `${hNight} < ${lid}`);
  const hDay = riseHeight(prof(2), 15, 3);
  assert.ok(hDay > lid && hDay > hNight * 2, `낮 ${hDay}, 밤 ${hNight}`);
});

test('하루 실험: 맑은 밤이 흐린 밤보다 더 식고, 바람이 세면 역전층이 사라진다', () => {
  const clear = dailyRun({ wind: 'none', cloudy: false, coal: 'mid' });
  const cloudy = dailyRun({ wind: 'none', cloudy: true, coal: 'mid' });
  const strong = dailyRun({ wind: 'strong', cloudy: false, coal: 'mid' });
  assert.equal(clear.S.length, 241);
  assert.ok(clear.S[60] < cloudy.S[60] - 2, '새벽 6시');
  assert.ok(clear.S[140] > 0, '오후 2시에는 땅이 데워진다');
  assert.ok(clear.lid[60] > 150 && clear.lid[140] === null);
  assert.equal(strong.lid[60], null);
  assert.ok(visibility(clear.C[60], clear.fog[60]) < visibility(strong.C[60], strong.fog[60]) / 10);
});

test('석탄을 많이 때면 연기가 더 짙다', () => {
  const lo = dailyRun({ wind: 'none', cloudy: false, coal: 'low' });
  const hi = dailyRun({ wind: 'none', cloudy: false, coal: 'high' });
  assert.ok(hi.C[60] > lo.C[60] * 2);
});

test('시정: 연기와 안개가 짙을수록 짧다', () => {
  assert.ok(visibility(0, 0) > 15000);
  assert.ok(visibility(1, 0) < visibility(0.2, 0));
  assert.ok(visibility(1, 0.9) < visibility(1, 0));
  assert.ok(visibility(3.5, 0.95) < 60);
});

test('1952년 재생: 닷새 동안 짙어지고 10일 바람에 걷힌다', () => {
  const r = runReplay();
  assert.equal(r.C.length, REPLAY_HOURS * 10 + 1);
  const at = (day, hour) => (day - 4) * 240 + hour * 10;
  const c4 = r.C[at(4, 12)], c5 = r.C[at(5, 12)], c7 = r.C[at(7, 12)], c8 = r.C[at(8, 12)], c10 = r.C[at(10, 15)];
  assert.ok(c5 > c4 * 3 && c7 > c5 && c8 >= c7 * 0.95, `${c4} ${c5} ${c7} ${c8}`);
  assert.ok(c10 < c8 / 10, '10일 오후에는 걷힘');
  // 6~8일은 낮에도 뚜껑이 있다(안개가 햇빛을 막음)
  for (const d of [6, 7, 8]) assert.ok(r.lid[at(d, 13)] != null, `${d}일 낮`);
  assert.equal(r.lid[at(4, 13)], null, '4일 낮에는 뚜껑 없음');
  // 모형의 짙은 날 순서가 관측 사망자 순서와 대체로 맞는다: 7~8일이 4일보다 훨씬 짙다
  const obs = Object.fromEntries(LONDON_1952.map((d) => [d.day, d.deaths]));
  assert.ok(obs[8] > obs[4] * 4);
});

test('1952년 자료: 열흘, 정수, 7~8일이 가장 많다', () => {
  assert.equal(LONDON_1952.length, 10);
  const max = Math.max(...LONDON_1952.map((d) => d.deaths));
  assert.equal(max, 518);
  assert.equal(LONDON_1952.find((d) => d.deaths === max).day, 8);
});

test('햇빛: 밤 0, 정오 근처 최대', () => {
  assert.equal(sunAt(2), 0);
  assert.equal(sunAt(20), 0);
  assert.ok(sunAt(12) > 0.99);
  void stateAt;
});
