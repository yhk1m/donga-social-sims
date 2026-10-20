// © 2026 김용현
// tests/atlas/units/u3.layers.test.mjs — Ⅲ 유럽 주제 레이어 생성물(sims/atlas-u3-europe/data/layer-*.json) 검사 (U3-4)
//   분류 이름은 교과서 범례 글자 그대로. 나라 단위 단계구분도(countryClass)는 {iso: cls | [cls…]}.
import test from 'node:test'; import assert from 'node:assert/strict'; import { readFileSync, readdirSync, statSync } from 'node:fs';

const D = 'sims/atlas-u3-europe/data';
const read = (id) => JSON.parse(readFileSync(`${D}/layer-${id}.json`, 'utf8'));
/** countryClass: iso → 범례 이름 목록 */
const labelsOf = (L, iso) => { const by = Object.fromEntries(L.legend.map((e) => [e.cls, e.label])); return [].concat(L.classes[iso] ?? []).map((c) => by[c]); };

test('p32 EU: 영국 = 탈퇴, 튀르키예 = 가입 희망, 독일 = 가입 + 유로', () => {
  const L = read('p32-eu');
  assert.deepEqual(labelsOf(L, 'GBR'), ['유럽 연합 탈퇴 국가']);
  assert.deepEqual(labelsOf(L, 'TUR'), ['유럽 연합 가입 희망 국가']);
  assert.deepEqual(labelsOf(L, 'DEU'), ['유럽 연합 가입 국가', '유로 사용 국가']);
  assert.equal(L.legend.find((e) => e.label === '유로 사용 국가').style, 'outline');
});

test('p32 EU 작은 나라 고침(U3-3 리뷰): 리히텐슈타인 없음, 룩셈부르크·몰타 가입 + 유로, 모나코 유로만, 스위스·노르웨이 없음', () => {
  const L = read('p32-eu');
  for (const iso of ['LIE', 'CHE', 'NOR', 'GGY', 'JEY']) assert.deepEqual(labelsOf(L, iso), [], iso);
  for (const iso of ['LUX', 'MLT', 'CYP', 'CYN']) assert.deepEqual(labelsOf(L, iso), ['유럽 연합 가입 국가', '유로 사용 국가'], iso);
  for (const iso of ['MCO', 'SMR', 'VAT', 'AND']) assert.deepEqual(labelsOf(L, iso), ['유로 사용 국가'], iso);
  // 10a 에만 있는 나라(Natural Earth 10m)도 분류 — 키프로스의 영국 기지·완충 지대는 섬 전체와 같게, 지브롤터는 영국과 같게
  for (const iso of ['ESB', 'WSB', 'CNM']) assert.deepEqual(labelsOf(L, iso), labelsOf(L, 'CYP'), iso);
  assert.deepEqual(labelsOf(L, 'GIB'), ['유럽 연합 탈퇴 국가']);
  for (const o of L.overrides) assert.ok(o.why, o.iso);
});

test('p30 도시화율: 나라 분류 수 ≥ 35, 범례 5단계 모두 있음, 러시아 70~80, 바티칸 고침 80~100', () => {
  const L = read('p30-urban');
  assert.ok(Object.keys(L.classes).length >= 35, `${Object.keys(L.classes).length}`);
  assert.equal(L.legend.length, 5); assert.ok(L.legend.every((e) => e.present));
  assert.deepEqual(labelsOf(L, 'RUS'), ['70~80']);
  assert.deepEqual(labelsOf(L, 'VAT'), ['80~100']);
  assert.deepEqual(labelsOf(L, 'LIE'), ['50 이하']);   // 교과서가 따로 칠함(도시화율 약 14%)
  for (const iso of ['TUR', 'MAR', 'KAZ']) assert.deepEqual(labelsOf(L, iso), [], iso);   // 교과서 회색(유럽 밖)
});
