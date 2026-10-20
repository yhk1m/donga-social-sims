// © 2026 김용현
// compare.mjs checks.known 맞춤(scripts/atlas/compare_known.mjs) — U4-10: 퍼센트 고정 pct
import test from 'node:test';
import assert from 'node:assert/strict';
import { knownMatch, pctAfter } from '../../scripts/atlas/compare_known.mjs';

const row = (pct) => ({ item: '글 일치(본문·제목·설명, 펼침면)', tb: '12개', web: `지면과 다름 1: 블록 p31-6「녹색 수도 …」 ${pct}%`, status: 'diff' });
const K = { topic: 'sustainable', item: '글 일치(본문·제목·설명, 펼침면)', webIncludes: '지면과 다름 1: 블록 p31-6「' };

test('pct 가 같을 때만 맞음, 다르면 지금 값을 알림', () => {
  assert.deepEqual(knownMatch(row(92), { ...K, pct: 92 }), { hit: true, pctNow: 92 });
  assert.deepEqual(knownMatch(row(91), { ...K, pct: 92 }), { hit: false, pctNow: 91, pctMismatch: true });
  assert.deepEqual(knownMatch(row(80), { ...K, pct: 92 }), { hit: false, pctNow: 80, pctMismatch: true });
});

test('pct 가 없으면 옛 동작(글 조각만)', () => {
  assert.equal(knownMatch(row(80), K).hit, true);
  assert.equal(knownMatch(row(92), K).hit, true);
});

test('항목·상태·tb·web·webIncludes 가 안 맞으면 pct 를 보지 않음', () => {
  assert.equal(knownMatch({ ...row(92), status: 'ok' }, { ...K, pct: 92 }).hit, false);
  assert.equal(knownMatch({ ...row(92), status: 'ok' }, { ...K, pct: 92 }).pctMismatch, undefined);
  assert.equal(knownMatch(row(92), { ...K, item: '다른 항목', pct: 92 }).hit, false);
  assert.equal(knownMatch(row(92), { ...K, webIncludes: '블록 p31-7', pct: 92 }).hit, false);
  const n = { item: '색칠하기 나라 수', tb: 48, web: 46, status: 'diff' };
  assert.equal(knownMatch(n, { item: '색칠하기 나라 수', tb: 48, web: 46 }).hit, true);
  assert.equal(knownMatch(n, { item: '색칠하기 나라 수', tb: 48, web: 45 }).hit, false);
});

test('pctAfter: 글 조각 바로 뒤의 첫 퍼센트(여러 항목이 이어져도 그 항목 값)', () => {
  const web = '지면과 다름 2: 블록 a「가나」 97%, 블록 b「다라」 80%';
  assert.equal(pctAfter(web, '블록 b「'), 80);
  assert.equal(pctAfter(web, '블록 a「'), 97);
  assert.equal(pctAfter(web, null), 97);
  assert.equal(pctAfter('퍼센트 없음', null), null);
  assert.equal(pctAfter(web, '없는 조각'), null);
});

test('pct 가 있는데 글에 퍼센트가 없으면 맞지 않음', () => {
  const r = knownMatch({ item: 'x', tb: 1, web: '값', status: 'diff' }, { item: 'x', pct: 50 });
  assert.equal(r.hit, false); assert.equal(r.pctNow, null);
});
