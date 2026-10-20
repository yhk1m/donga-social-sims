// © 2026 김용현
// tests/atlas/units/u3.places.test.mjs — Ⅲ 유럽 일반도(26쪽) 지명 생성물(sims/atlas-u3-europe/data/places.json) 검사 (U3-5)
//   만드는 법: python -I scripts/atlas/places.py --unit u3 → node scripts/atlas/build_places.mjs --unit u3 --verify
import test from 'node:test'; import assert from 'node:assert/strict'; import { readFileSync, statSync, existsSync } from 'node:fs';
import { key } from '../../../scripts/atlas/geo_util.mjs';

process.env.ATLAS_UNIT = 'u3';                                     // build_places 의 설정(neBox 유럽·neAlias)을 u3 로 — 시험 파일마다 따로 도는 프로세스
const { snapToNe, neCheck } = await import('../../../scripts/atlas/build_places.mjs');

const FILE = 'sims/atlas-u3-europe/data/places.json';
const places = JSON.parse(readFileSync(FILE, 'utf8'));
const cfg = JSON.parse(readFileSync('scripts/atlas/config/u3.json', 'utf8')).places;
const WORK = (process.env.ATLAS_WORK || 'C:/Users/Public/atlas-work').replace(/\\/g, '/');
const near = (p, lon, lat, tol) => Math.abs(p.lon - lon) < tol && Math.abs(p.lat - lat) < tol;
const one = (name) => { const f = places.filter((x) => x.name === name); assert.equal(f.length, 1, `${name} ${f.length}개`); return f[0]; };

test('대표 지명 위치가 실제와 1° 안', () => {
  const want = { 파리: [2.35, 48.86], 런던: [-0.13, 51.51], 베를린: [13.4, 52.52], 로마: [12.5, 41.9], 모스크바: [37.6, 55.75], 마드리드: [-3.7, 40.42] };
  for (const [name, [lon, lat]] of Object.entries(want)) { const p = places.find((x) => x.name === name); assert.ok(p, name); assert.ok(near(p, lon, lat, 1), `${name} ${p.lon},${p.lat}`); }
});

test('나라·수도에 영문 병기(en)가 있음', () => {
  for (const n of ['프랑스', '독일', '파리']) assert.ok(places.find((p) => p.name === n)?.en, n);
  // 나라 영문은 대문자(교과서 그대로 — ESPAÑA·BELGIË 처럼 그 나라 말도), 수도 영문은 첫 글자만 대문자
  for (const p of places.filter((x) => x.kind === 'country' && x.en)) assert.equal(p.en, p.en.toUpperCase(), p.name);
  for (const p of places.filter((x) => x.kind === 'capital' && x.en)) assert.match(p.en, /^[A-Z][a-zà-žăşț]/, p.name);
});

test('rank 1~6, kind 목록 안', () => { for (const p of places) { assert.ok(p.rank >= 1 && p.rank <= 6); assert.match(p.kind, /^(country|capital|city|mountain|river|sea|region|island|desert|plain|other)$/); } });

test('종류별 수(26쪽 실측): 나라 59 · 수도 56 · 도시 ≥ 340 · 바다 41 · 하천 22 · 산 17 · 섬 25', () => {
  const n = (k) => places.filter((p) => p.kind === k).length;
  assert.equal(n('country'), 59); assert.equal(n('capital'), 56); assert.ok(n('city') >= 340, `${n('city')}`);
  assert.equal(n('sea'), 41); assert.equal(n('river'), 22); assert.equal(n('mountain'), 17); assert.equal(n('island'), 25);
});

test('찾아보기 26쪽 지명이 모두 places 에 있음(뺀 것은 indexExclude 에 까닭)', () => {
  const idx = `${WORK}/${cfg.index.out}`;
  if (!existsSync(idx)) return;                                    // 작업 폴더 없음(다른 PC) — 건너뜀
  const rows = JSON.parse(readFileSync(idx, 'utf8')).filter((r) => r.page === 26);
  assert.ok(rows.length >= 350, `${rows.length}`);
  const have = new Set(places.map((p) => key(p.name)));
  const missing = rows.filter((r) => !cfg.indexExclude[r.name] && !have.has(key(r.name))).map((r) => r.name);
  assert.deepEqual(missing, []);
  for (const [n, why] of Object.entries(cfg.indexExclude)) assert.ok(why, n);
  assert.ok(places.filter((p) => p.inIndex).length >= 350);
});

test('26쪽에서 고친 글자: 지중해(자간)·엘베강(세로)·키시너우 Chişinău(낱자 글꼴)·나로드나야산 1895(기울인 숫자)', () => {
  assert.equal(one('지중해').kind, 'sea');
  assert.equal(one('엘베강').kind, 'river');
  assert.equal(one('키시너우').en, 'Chişinău');
  assert.equal(one('부쿠레슈티').en, 'Bucureşti');
  assert.equal(one('레이캬비크').en, 'Reykjavik');
  assert.equal(one('나로드나야산').elev, 1895);
  assert.equal(one('헤클라산').kind, 'mountain');
  for (const n of ['브라티슬라바', '프리슈티나']) assert.equal(one(n).kind, 'capital', n);   // 5.6pt 작은 수도
  for (const n of ['카토비체', '키엘체']) one(n);                                           // 맞닿은 두 도시가 나뉨
  assert.equal(one('이베리아고원').kind, 'plain');
  for (const n of ['카닌반도', '브르타뉴반도']) assert.equal(one(n).kind, 'region', n);
  for (const bad of ['지', '중', '해', '고원', '이베리아', '북극권', '유빙 한계']) assert.ok(!places.some((p) => p.name === bad), bad);
});

test('세계 유산 이름·철도 이름은 지명이 아님', () => {
  for (const n of ['카르타고', '스톤헨지와', '크렘린 궁전과 붉은 광장', '시베리아 횡단 철도']) assert.ok(!places.some((p) => p.name === n), n);
});

test('neAlias: Natural Earth NAME_KO 가 다른 도시인 이름은 별칭으로 짝짓는다(로스토프 = 로스토프나도누)', () => {
  const ne = new Map([['로스토프', [{ lon: 39.40, lat: 57.19 }]], ['로스토프나도누', [{ lon: 39.71, lat: 47.24 }]]]);
  const mk = () => [{ name: '로스토프', kind: 'city', lon: 39.71, lat: 47.23, symbol: [39.71, 47.23] }];
  const a = mk(); assert.equal(snapToNe(a, ne, { snapKm: 30, keep: {}, alias: {} }).length, 1);            // 별칭 없으면 1,100km 옮겨 버림
  const b = mk(); assert.equal(snapToNe(b, ne, { snapKm: 30, keep: {}, alias: { 로스토프: { name: '로스토프나도누' } } }).length, 0);
  assert.equal(b[0].lat, 47.23);
  assert.ok(cfg.neAlias?.로스토프?.why);
  assert.ok(!one('로스토프').snapped && near(one('로스토프'), 39.71, 47.24, 0.3));
});

test('Natural Earth 대조: 도시·수도 중앙값 ≤ 2km · 90% ≤ 12km · 최대 ≤ 30km', () => {
  const NE = `${WORK}/${cfg.neFile}`;
  if (!existsSync(NE)) return;
  const r = neCheck(places, NE);
  assert.ok(r.n >= 350, `${r.n}`);
  assert.ok(r.median <= 2 && r.p90 <= 12 && r.max <= 30, JSON.stringify(r));
});

test('옮긴 기호는 snapped 기록, 용량 ≤ 150KB', () => {
  for (const p of places.filter((x) => x.snapped)) assert.ok(p.snapped.km > cfg.snapKm && p.snapped.km < 200, `${p.name} ${p.snapped.km}`);
  assert.ok(statSync(FILE).size <= 150 * 1024, `${statSync(FILE).size}`);
});
