// © 2026 김용현
// tests/atlas/units/u4.places.test.mjs — Ⅳ 아프리카 일반도(34쪽) 지명 생성물(sims/atlas-u4-africa/data/places.json) 검사 (U4-5)
//   만드는 법: python -I scripts/atlas/places.py --unit u4 → node scripts/atlas/build_places.mjs --unit u4 --verify
import test from 'node:test'; import assert from 'node:assert/strict'; import { readFileSync, statSync, existsSync } from 'node:fs';
import { key } from '../../../scripts/atlas/geo_util.mjs';

process.env.ATLAS_UNIT = 'u4';                                     // build_places 의 설정(neBox 아프리카·neAlias·snapAlways)을 u4 로
const { snapToNe, neCheck, neCands } = await import('../../../scripts/atlas/build_places.mjs');

const FILE = 'sims/atlas-u4-africa/data/places.json';
const places = JSON.parse(readFileSync(FILE, 'utf8'));
const cfg = JSON.parse(readFileSync('scripts/atlas/config/u4.json', 'utf8')).places;
const WORK = (process.env.ATLAS_WORK || 'C:/Users/Public/atlas-work').replace(/\\/g, '/');
const near = (p, lon, lat, tol) => Math.abs(p.lon - lon) < tol && Math.abs(p.lat - lat) < tol;
const one = (name) => { const f = places.filter((x) => x.name === name); assert.equal(f.length, 1, `${name} ${f.length}개`); return f[0]; };

test('대표 지명 위치가 실제와 1° 안', () => {
  const want = { 카이로: [31.24, 30.04], 나이로비: [36.82, -1.29], 킨샤사: [15.31, -4.32], 라고스: [3.39, 6.45], 케이프타운: [18.42, -33.92], 아디스아바바: [38.75, 9.03], 트리폴리: [13.19, 32.89] };
  for (const [name, [lon, lat]] of Object.entries(want)) { const p = places.find((x) => x.name === name); assert.ok(p, name); assert.ok(near(p, lon, lat, 1), `${name} ${p.lon},${p.lat}`); }
});

test('나라·수도 영문 병기(en)', () => {
  for (const n of ['이집트', '케냐', '카이로']) assert.ok(places.find((p) => p.name === n)?.en, n);
  for (const p of places.filter((x) => x.kind === 'country' && x.en)) assert.equal(p.en, p.en.toUpperCase(), p.name);
  assert.equal(one('야운데').en, 'Yaoundé'); assert.equal(one('로메').en, 'Lomé');
  assert.equal(one('은자메나').en, "N'Djamena"); assert.equal(one('상투메').en, 'São Tomé');
  assert.equal(one('코트디부아르').en, 'CÔTE D´IVOIRE');
});

test('국립 공원·유적 붉은 글자는 지명이 아님(교사 Q8)', () => {
  assert.ok(!places.some((p) => /국립 공원|유적|보호 구역|보호 지역/.test(p.name)));
  for (const n of ['카르타고', '악숨', '랄리벨라', '반디아가라 절벽', '아샨티', '투르카나 호수']) assert.ok(!places.some((p) => p.name === n), n);
});

test('서사하라 = region(갈보라 글자), 소말릴란드 없음', () => {
  assert.equal(one('서사하라').kind, 'region');
  assert.equal(one('소말리아').kind, 'country');
  assert.ok(!places.some((p) => /소말릴란드/.test(p.name)));
});

test('rank 1~6, kind 목록 안', () => { for (const p of places) { assert.ok(p.rank >= 1 && p.rank <= 6); assert.match(p.kind, /^(country|capital|city|mountain|river|sea|region|island|desert|plain|other)$/); } });

test('종류별 수(34쪽 실측): 나라 76(아프리카 54 + 남유럽·서아시아 22) · 수도 71 · 도시 ≥ 200 · 하천 18 · 사막 9 · 산 13', () => {
  const n = (k) => places.filter((p) => p.kind === k).length;
  assert.equal(n('country'), 76); assert.equal(n('capital'), 71); assert.ok(n('city') >= 200, `${n('city')}`);
  assert.equal(n('river'), 18); assert.equal(n('desert'), 9); assert.equal(n('mountain'), 13); assert.equal(n('region'), 8);   // 반도·지역 3 + 「○○ 해안」 5
  assert.equal(places.filter((p) => p.kind === 'country' && p.en).length, 54);   // 아프리카 나라만 영문(교과서대로)
});

test('파란 명조라도 물이 아닌 이름(U4-5 리뷰): 폭포·운하 = other, 「○○ 해안」 = region', () => {
  for (const n of ['제1폭포', '제2폭포', '제3폭포', '제4폭포', '제5폭포', '제6폭포', '빅토리아 폭포', '수에즈 운하']) assert.equal(one(n).kind, 'other', n);
  for (const n of ['곡물 해안', '노예 해안', '상아 해안', '황금 해안', '후추 해안']) assert.equal(one(n).kind, 'region', n);
  assert.ok(!places.some((p) => p.kind === 'sea' && /폭포$|운하$|해안$/.test(p.name)));
  assert.equal(places.filter((p) => p.kind === 'sea').length, 22);
});

test('34쪽에서 고친 글자: 사하라 사막(자간)·백나일강/청나일강(거꾸로 맞선 글자)·희망봉 = 곶·남회귀선 아님', () => {
  assert.equal(one('사하라 사막').kind, 'desert');
  assert.equal(one('백나일강').kind, 'river'); assert.equal(one('청나일강').kind, 'river');
  assert.equal(one('희망봉').kind, 'other');
  assert.equal(one('킬리만자로산').elev, 5895);
  assert.equal(one('통북투').alt, '팀북투');
  for (const n of ['로메', '라고스', '다마스쿠스', '바그다드']) one(n);                       // 찾아보기로 나뉨
  one('빅토리아 폭포');                                                                       // 찾아보기로 이음
  for (const bad of ['사하라', '사막', '남회귀선', '북회귀선', '적도', '백나일강강일나청', '(프)', '(앙골라)']) assert.ok(!places.some((p) => p.name === bad), bad);
});

test('찾아보기 34쪽 지명이 모두 places 에 있음(뺀 것은 indexExclude 에 까닭)', () => {
  const idx = `${WORK}/${cfg.index.out}`;
  if (!existsSync(idx)) return;                                    // 작업 폴더 없음(다른 PC) — 건너뜀
  const rows = JSON.parse(readFileSync(idx, 'utf8')).filter((r) => r.page === 34);
  assert.ok(rows.length >= 190, `${rows.length}`);
  const have = new Set(places.map((p) => key(p.name)));
  assert.deepEqual(rows.filter((r) => !cfg.indexExclude[r.name] && !have.has(key(r.name))).map((r) => r.name), []);
  assert.ok(places.filter((p) => p.inIndex).length >= 190);
});

// 찾아보기 격자 칸(예: 34E1): 34쪽 격자 글자 A~I·1~7(+ 아래 끝 8)은 경위선 10° 칸 가운데에 찍혀 있다(A = 30°W~20°W, 1 = 40°N~30°N —
// 34쪽 렌더로 확인). 지명의 자리(점 = 교과서 기호 자리 — 옮겼으면 snapped.from, 면 = 글자 줄 path·가운데)나 교과서 글자 자리
// (작업 폴더 text/places-p34-africa.json 을 fit 으로 되돌림) 중 하나가 그 칸이면 맞음. 아는 차이 2(「실행 중 결정」 U4-5).
const cell = ([lon, lat]) => String.fromCharCode(65 + Math.floor((lon + 30) / 10)) + (Math.floor((40 - lat) / 10) + 1);
const GRID_KNOWN = { 가다메스: '교과서 기호가 9.86°E·30.01°N(D1, 칸 모서리 0.14° 안) — 찾아보기는 E1', 코모로: '나라 이름 글자가 섬 북쪽 10°S 위(H5) — 찾아보기는 섬 자리 H6' };
test('찾아보기 격자 칸 대조(34쪽 A~I × 1~8, 경위선 10° 칸)', async () => {
  const idx = `${WORK}/${cfg.index.out}`, txt = `${WORK}/text/places-p34-africa.json`;
  if (!existsSync(idx) || !existsSync(txt) || !existsSync(`${WORK}/geo/p34-africa.fit.json`)) return;
  const { makeConverter } = await import('../../../scripts/atlas/georef.mjs');
  const { loadFit } = await import('../../../scripts/atlas/geo_util.mjs');
  const cv = makeConverter(loadFit('p34-africa'));
  const labels = JSON.parse(readFileSync(txt, 'utf8')).labels;
  const rows = JSON.parse(readFileSync(idx, 'utf8')).filter((r) => r.page === 34);
  const bad = [];
  for (const r of rows) {
    const k = key(r.name);
    const pts = places.filter((p) => key(p.name) === k).flatMap((p) => [p.snapped ? p.snapped.from : [p.lon, p.lat], ...(p.path || [])]);
    for (const L of labels.filter((x) => key(x.name) === k)) for (const xy of [L.xy, ...(L.path || [])]) { const ll = cv.invert(xy); if (ll) pts.push(ll); }
    if (!pts.map(cell).includes(r.grid)) bad.push(r.name);
  }
  assert.deepEqual(bad.sort(), Object.keys(GRID_KNOWN).sort());
  assert.ok(cell([31.24, 30.04]) === 'G1' && cell([-25, 35]) === 'A1' && cell([18.47, -34.36]) === 'E8');
});

test('neAlias nearest: 같은 NAME_KO 가 여럿이면 교과서 자리에서 가장 가까운 하나(트리폴리 = 리비아)', () => {
  const ne = new Map([['트리폴리', [{ lon: 22.38, lat: 37.51 }, { lon: 35.83, lat: 34.44 }, { lon: 13.18, lat: 32.89 }]]]);
  const p = { name: '트리폴리', kind: 'capital', lon: 13.3, lat: 32.8, symbol: [13.3, 32.8] };
  assert.equal(neCands(p, ne, {}).length, 3);                                  // 별칭 없으면 셋 — 옮기기에서 빠짐
  assert.deepEqual(neCands(p, ne, { 트리폴리: { nearest: true } }), [{ lon: 13.18, lat: 32.89 }]);
  const far = [{ ...p, lon: 14.0, lat: 33.4 }];                                 // 85km 어긋남 → 별칭이 있어야 리비아 쪽으로 옮김
  assert.equal(snapToNe(far, ne, { snapKm: 30, keep: {}, alias: {}, always: {} }).length, 0);
  assert.equal(snapToNe(far, ne, { snapKm: 30, keep: {}, alias: { 트리폴리: { nearest: true } }, always: {} })[0].lon, 13.18);
  assert.ok(cfg.neAlias?.트리폴리?.nearest && cfg.neAlias.트리폴리.why);
  const t = one('트리폴리'); assert.equal(t.kind, 'capital'); assert.ok(!t.snapped && near(t, 13.18, 32.89, 0.3), `${t.lon},${t.lat}`);
});

test('snapAlways: 교과서가 옮겨 그린 수도 6곳은 snapKm 안이어도 Natural Earth 자리로(snapped 기록)', () => {
  const ne = new Map([['로메', [{ lon: 1.22, lat: 6.13 }]]]);
  const mk = () => [{ name: '로메', kind: 'capital', lon: 1.39, lat: 6.23, symbol: [1.39, 6.23] }];
  assert.equal(snapToNe(mk(), ne, { snapKm: 30, keep: {}, alias: {}, always: {} }).length, 0);       // 22km — 옛 규칙은 그대로
  const b = mk(); assert.equal(snapToNe(b, ne, { snapKm: 30, keep: {}, alias: {}, always: { 로메: '까닭' } }).length, 1);
  assert.deepEqual(b[0].symbol, [1.22, 6.13]); assert.equal(b[0].snapped.km, 22);
  // 지부티는 나라 이름도 있어 수도(kind capital)로 찾음
  const want = ['킨샤사', '브라자빌', '마세루', '지부티', '방기', '로메'];
  assert.deepEqual(Object.keys(cfg.snapAlways).sort(), [...want].sort());
  for (const n of want) { const p = places.find((x) => x.name === n && x.kind === 'capital'); assert.ok(p, n); assert.ok(p.snapped && p.snapped.km >= 20 && p.snapped.km <= 50, `${n} ${JSON.stringify(p.snapped)}`); assert.ok(cfg.snapAlways[n], n); }
});

test('Natural Earth 대조: 도시·수도 중앙값 ≤ 3km · 90% ≤ 16km · 최대 ≤ 30km', () => {
  const NE = `${WORK}/${cfg.neFile}`;
  if (!existsSync(NE)) return;
  const r = neCheck(places, NE);
  assert.ok(r.n >= 255, `${r.n}`);
  assert.ok(r.median <= 3 && r.p90 <= 16 && r.max <= 30, JSON.stringify(r));
});

test('옮긴 기호는 snapped 기록(snapAlways 밖은 snapKm 넘음), 용량 ≤ 150KB', () => {
  const moved = places.filter((x) => x.snapped);
  assert.equal(moved.length, 11);
  for (const p of moved) assert.ok((cfg.snapAlways[p.name] || p.snapped.km > cfg.snapKm) && p.snapped.km < 120, `${p.name} ${p.snapped.km}`);
  assert.ok(statSync(FILE).size <= 150 * 1024, `${statSync(FILE).size}`);
});
