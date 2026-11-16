// © 2026 김용현
// 인구 피라미드 비교: 압축 풀기, 비율 바꾸기, 두 해 차이 계산 시험
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  encodeInts, decodeInts, yearSlice, total, toShares, valuesFor, diffBands, niceMax, tickStep, fmtDelta, structure, NA, PER_YEAR,
} from '../../sims/s1-u2-pyramid/core.js';
import data from '../../sims/s1-u2-pyramid/data/pyramid-data.js';

test('압축했다 풀면 그대로 (0, 큰 수, 없음 -1 포함)', () => {
  const arr = [0, 1, 31, 32, 33, 1023, 1024, 65535, 123456789, -1, 7, -1];
  assert.deepEqual([...decodeInts(encodeInts(arr))], arr);
});

test('음수(-1 아래)나 소수는 압축하지 않는다', () => {
  assert.throws(() => encodeInts([-2]));
  assert.throws(() => encodeInts([1.5]));
});

test('yearSlice: 해 하나를 남녀 21칸으로, 단위 곱하기, 없는 해는 null', () => {
  const ints = new Int32Array(PER_YEAR * 2).fill(-1);
  for (let i = 0; i < PER_YEAR; i++) ints[PER_YEAR + i] = i + 1;
  assert.equal(yearSlice(ints, 0, 100), null);
  const p = yearSlice(ints, 1, 100);
  assert.equal(p.male.length, NA);
  assert.equal(p.male[0], 100);
  assert.equal(p.female[0], (NA + 1) * 100);
  assert.equal(yearSlice(ints, 5), null);
});

test('toShares: 남녀 모든 칸을 더하면 100%', () => {
  const p = { male: Array.from({ length: NA }, (_, i) => 100 - i), female: Array.from({ length: NA }, (_, i) => 90 + i) };
  const s = toShares(p);
  const sum = s.male.reduce((a, b) => a + b, 0) + s.female.reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum - 100) < 1e-9);
  assert.ok(Math.abs(s.male[0] - (100 / total(p)) * 100) < 1e-12);
  assert.deepEqual(valuesFor(p, 'count').male, p.male);
});

test('diffBands: 늘어난 길이, 줄어든 길이, 공통 길이', () => {
  const a = { male: [5, 3, 0], female: [2, 2, 2] };
  const b = { male: [4, 6, 1], female: [2, 1, 5] };
  const d = diffBands(a, b);
  assert.deepEqual(d.male[0], { a: 5, b: 4, delta: -1, common: 4, more: 0, less: 1 });
  assert.deepEqual(d.male[1], { a: 3, b: 6, delta: 3, common: 3, more: 3, less: 0 });
  assert.equal(d.female[0].delta, 0);
  assert.equal(d.female[2].more, 3);
  // 공통 + 늘어남 = B, 공통 + 줄어듦 = A
  for (const x of [...d.male, ...d.female]) { assert.equal(x.common + x.more, x.b); assert.equal(x.common + x.less, x.a); }
});

test('niceMax / tickStep: 끝값은 최댓값보다 크고 눈금은 6칸 이하', () => {
  for (const v of [0.37, 4.2, 5, 9.9, 12, 380000, 6.1e7]) {
    const m = niceMax(v);
    assert.ok(m >= v, `${v} → ${m}`);
    assert.ok(m / tickStep(m) <= 6);
  }
});

test('fmtDelta: %p 한 자리, 사람 수는 만 단위', () => {
  assert.equal(fmtDelta(1.234, 'share'), '+1.2%p');
  assert.equal(fmtDelta(-0.05, 'share'), '-0.1%p');
  assert.equal(fmtDelta(25000, 'count'), '+2.5만');
});

test('구운 자료: UN 1950~2100, 일본 2021 인구 약 1억 2천만, 65세 이상 25% 넘음', () => {
  const s = data.un;
  assert.equal(s.years[0], 1950);
  assert.equal(s.years.at(-1), 2100);
  const jp = s.regions.find((r) => r.name === '일본');
  const p = yearSlice(decodeInts(jp.d), s.years.indexOf(2021), s.unit);
  assert.ok(total(p) > 1.2e8 && total(p) < 1.3e8);
  assert.ok(structure(p).old > 25);
  // 모든 지역, 모든 해가 차 있어야 한다
  for (const r of s.regions) assert.equal(decodeInts(r.d).length, s.years.length * PER_YEAR, r.name);
});

test('구운 자료: 주민등록 묶음은 해마다 맨 위 칸 정보(top)가 있다', () => {
  const k = data.kr;
  if (!k) return;
  assert.equal(k.top.length, k.years.length);
  const kr = k.regions.find((r) => r.id === 'kr00');
  assert.ok(kr, '전국 자료');
  for (const r of k.regions) assert.equal(decodeInts(r.d).length, k.years.length * PER_YEAR, r.name);
});

test('collapseTop: 85세 이상을 한 칸으로 합치면 총합은 그대로', async () => {
  const { collapseTop, ageLabels } = await import('../../sims/s1-u2-pyramid/core.js');
  const p = { male: Array.from({ length: NA }, (_, i) => i + 1), female: Array.from({ length: NA }, () => 2) };
  const c = collapseTop(p, 17);
  assert.equal(c.male.length, 18);
  assert.equal(c.male[17], 18 + 19 + 20 + 21);
  assert.equal(total({ male: [...c.male, 0, 0, 0], female: [...c.female, 0, 0, 0] }), total(p));
  assert.equal(collapseTop(p, 20).male.length, NA);
  assert.deepEqual(ageLabels(18).slice(-2), ['80-84', '85+']);
});

test('합친 칸(18칸) 자료도 비율 합이 100%, 구조 합도 100%', async () => {
  const { collapseTop } = await import('../../sims/s1-u2-pyramid/core.js');
  const p = { male: Array.from({ length: NA }, () => 3), female: Array.from({ length: NA }, () => 5) };
  const c = collapseTop(p, 17);
  const sh = toShares(c);
  const sum = [...sh.male, ...sh.female].reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum - 100) < 1e-9);
  const st = structure(c);
  assert.ok(Math.abs(st.young + st.work + st.old - 100) < 1e-9);
});
