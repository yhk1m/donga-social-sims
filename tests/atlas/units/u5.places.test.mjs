// © 2026 김용현
// tests/atlas/units/u5.places.test.mjs — Ⅴ 아메리카 일반도(40쪽 본 지도·40쪽 삽입 중앙아메리카·42·43쪽) 지명 생성물
//   (sims/atlas-u5-americas/data/places.json) 검사 (U5-5)
//   만드는 법: python -I scripts/atlas/places.py --unit u5 → node scripts/atlas/build_places.mjs --unit u5 --verify
import test from 'node:test'; import assert from 'node:assert/strict'; import { readFileSync, statSync, existsSync } from 'node:fs';
import { key } from '../../../scripts/atlas/geo_util.mjs';

process.env.ATLAS_UNIT = 'u5';                                     // build_places 의 설정(neBox 아메리카·neAlias·snapAlways)을 u5 로
const { neCheck } = await import('../../../scripts/atlas/build_places.mjs');

const FILE = 'sims/atlas-u5-americas/data/places.json';
const places = JSON.parse(readFileSync(FILE, 'utf8'));
const cfg = JSON.parse(readFileSync('scripts/atlas/config/u5.json', 'utf8')).places;
const WORK = (process.env.ATLAS_WORK || 'C:/Users/Public/atlas-work').replace(/\\/g, '/');
const near = (p, lon, lat, tol) => Math.abs(p.lon - lon) < tol && Math.abs(p.lat - lat) < tol;
const one = (name, kind) => { const f = places.filter((x) => x.name === name && (!kind || x.kind === kind)); assert.equal(f.length, 1, `${name} ${f.length}개`); return f[0]; };
const R = 6371, rad = Math.PI / 180;
const km = (a, b) => 2 * R * Math.asin(Math.sqrt(Math.sin((b[1] - a[1]) * rad / 2) ** 2 + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin((b[0] - a[0]) * rad / 2) ** 2));

test('대표 지명 위치가 실제와 1° 안', () => {
  const want = { 워싱턴: [-77.04, 38.91], 오타와: [-75.70, 45.42], 멕시코시티: [-99.13, 19.43], 브라질리아: [-47.88, -15.79], 부에노스아이레스: [-58.38, -34.60], 리마: [-77.04, -12.05], 아바나: [-82.38, 23.13] };
  for (const [name, [lon, lat]] of Object.entries(want)) { const p = places.find((x) => x.name === name); assert.ok(p, name); assert.ok(near(p, lon, lat, 1), `${name} ${p.lon},${p.lat}`); }
});

test('동명 도시: 산호세는 코스타리카 수도(캘리포니아 산호세가 있으면 따로)', () => {
  const sj = places.filter((p) => p.name === '산호세'); assert.ok(sj.some((p) => near(p, -84.09, 9.93, 1)));
  assert.equal(one('산호세').kind, 'capital');                     // 일반도 세 장에 캘리포니아 산호세 글자는 없음
  const kg = places.filter((p) => p.name === '킹스턴'); assert.equal(kg.length, 1); assert.ok(near(kg[0], -76.79, 17.99, 0.5) && kg[0].kind === 'capital');
  const sg = places.filter((p) => p.name === '산티아고'); assert.equal(sg.length, 1); assert.ok(near(sg[0], -70.65, -33.44, 0.5));
  const va = places.filter((p) => p.name === '발렌시아').sort((a, b) => a.lon - b.lon);   // 베네수엘라(43쪽)·에스파냐(40쪽 동쪽 끝)
  assert.equal(va.length, 2); assert.ok(near(va[0], -68.0, 10.2, 0.4) && near(va[1], -0.38, 39.47, 0.4), JSON.stringify(va.map((p) => [p.lon, p.lat])));
  const ro = places.filter((p) => p.name === '로사리오').sort((a, b) => a.lon - b.lon);   // 멕시코 바하칼리포르니아(42쪽)·아르헨티나
  assert.equal(ro.length, 2); assert.ok(near(ro[1], -60.65, -32.95, 0.3));
});

test('세 일반도 합치기: 같은 이름·같은 종류는 하나(큰 축척 자리)', () => {
  const ny = places.filter((p) => p.name === '뉴욕' && p.kind !== 'sea'); assert.equal(ny.length, 1);
  assert.deepEqual(ny[0].from?.[0], 'p42-north');
  // 40쪽(1:77,000,000)에서 옮겨 그렸거나 가려진 이웃 기호를 단 출현도 42·43쪽 자리로 합쳐짐(mergeKmMaps)
  for (const [n, front] of [['매캘런', 'p42-north'], ['엘패소', 'p42-north'], ['페레이라', 'p43-south'], ['산타크루스', 'p43-south'], ['보고타', 'p42-north'], ['아바나', 'p42-north']]) {
    const p = one(n); assert.equal(p.from[0], front, n); assert.ok(p.from.length >= 2, `${n} ${p.from}`);
  }
  // 같은 이름 다른 지물은 따로(areaKmByName·거리)
  assert.equal(places.filter((p) => p.name === '콜로라도강').length, 2);
  assert.equal(places.filter((p) => p.name === '프린스오브웨일스섬').length, 2);
  // 같은 이름 여러 개는 정당한 것만(나라 ↔ 수도, 다른 도시·지물)
  const by = {}; for (const p of places) (by[p.name] ||= []).push(p);
  const dup = Object.entries(by).filter(([, v]) => v.length > 1).map(([n]) => n).sort();
  assert.deepEqual(dup, ['과테말라', '라파스', '로사리오', '메리다', '바르셀로나', '발렌시아', '산후안', '세인트존스', '찰스턴', '캄푸스', '콘셉시온', '콜로라도강', '파나마', '포틀랜드', '프린스오브웨일스섬'].sort());
  for (const [n, v] of Object.entries(by)) if (v.length === 2 && v[0].kind === v[1].kind) assert.ok(km([v[0].lon, v[0].lat], [v[1].lon, v[1].lat]) > 300, n);
});

test('나라·수도 영문 병기(en)', () => {
  for (const n of ['캐나다', '브라질', '자메이카', '킹스턴']) assert.ok(places.find((p) => p.name === n)?.en, n);
  assert.equal(one('브라질리아').en, 'Brasilia');
  assert.equal(one('워싱턴').en, 'WashingtonD.C.');
});

test('국립 공원·유적 글자는 지명이 아님', () => {
  assert.ok(!places.some((p) => /국립 공원|유적|역사 지구|보호 지역/.test(p.name)));
});

test('기아나 = region', () => assert.equal(places.find((p) => p.name === '기아나')?.kind, 'region'));

test('rank 1~6, kind 목록 안', () => { for (const p of places) { assert.ok(p.rank >= 1 && p.rank <= 6); assert.match(p.kind, /^(country|capital|city|mountain|river|sea|region|island|desert|plain|other)$/); } });

test('수도: 아메리카 독립국 35 + 40쪽 동쪽 끝 유럽·아프리카 수도, 워싱턴 = 수도 기호(42쪽 짝 고정)', () => {
  const am = ['나소', '과테말라', '라파스', '리마', '마나과', '멕시코시티', '몬테비데오', '벨모판', '보고타', '부에노스아이레스', '브라질리아', '브리지타운',
    '산살바도르', '산토도밍고', '산티아고', '산호세', '세인트조지스', '아바나', '아순시온', '오타와', '워싱턴', '조지타운', '카라카스', '키토', '킹스턴',
    '테구시갈파', '파나마', '파라마리보', '포르토프랭스', '포트오브스페인', '로조', '바스테르', '세인트존스', '캐스트리스', '킹스타운'];
  assert.equal(am.length, 35);
  for (const n of am) { const p = places.find((x) => x.name === n && x.kind === 'capital'); assert.ok(p, n); assert.ok(p.en, `${n} 영문`); }
  assert.equal(places.filter((p) => p.kind === 'capital').length, 47);
  const w = one('워싱턴'); assert.equal(w.kind, 'capital'); assert.ok(near(w, -77.03, 38.9, 0.25), `${w.lon},${w.lat}`);
  const b = one('볼티모어'); assert.equal(b.kind, 'city'); assert.ok(near(b, -76.61, 39.29, 0.25), `${b.lon},${b.lat}`);
  assert.ok(near(one('관타나모'), -75.21, 20.14, 0.2) && near(one('산티아고데쿠바'), -75.82, 20.02, 0.2));
  assert.ok(near(places.find((p) => p.name === '바르키시메토'), -69.3, 10.07, 0.3));
});

test('종류별 수(40·40 삽입·42·43쪽 합친 한 벌)', () => {
  const n = (k) => places.filter((p) => p.kind === k).length;
  assert.equal(places.length, 742);
  assert.deepEqual({ country: n('country'), capital: n('capital'), city: n('city'), sea: n('sea'), river: n('river'), mountain: n('mountain'), island: n('island'), region: n('region'), plain: n('plain'), desert: n('desert'), other: n('other') },
    { country: 48, capital: 47, city: 397, sea: 63, river: 38, mountain: 47, island: 60, region: 21, plain: 9, desert: 2, other: 10 });
  const from = (m) => places.filter((p) => p.from.includes(m)).length;
  assert.deepEqual([from('p42-north'), from('p43-south'), from('p40-central'), from('p40-americas')], [407, 295, 54, 280]);
  assert.deepEqual([1, 2, 3].map((k) => places.filter((p) => Math.min(p.from.length, 3) === k).length), [501, 197, 44]);
  assert.equal(places.filter((p) => p.from.length === 1 && p.from[0] === 'p40-americas').length, 45);   // 40쪽에만(유럽·아프리카 끝·알류샨 등)
});

test('고친 글자: 가려진 글자 빼기·상자 글자 잇기·선 이름·낱말 나누기·표기 합치기', () => {
  // 40쪽 래스터 밑에 깔린 도시 이름(hidden — 인쇄면에 안 보임)은 40쪽 출현이 없음
  for (const n of ['클리블랜드', '마라카이보', '콜럼버스', '수크레']) { const p = places.find((x) => x.name === n); assert.ok(!p || !p.from.includes('p40-americas'), n); }
  assert.equal(one('야노스').kind, 'region'); assert.equal(one('안데스산맥').kind, 'mountain'); assert.equal(one('로키산맥').kind, 'mountain');
  assert.ok(one('안데스산맥').from.includes('p43-south') && one('로키산맥').from.includes('p42-north'));
  for (const n of ['슈피리어호', '무스강', '올버니강', '산마티아스만', '매켄지산맥']) one(n);
  assert.deepEqual(one('매켄지산맥').from, ['p42-north', 'p40-americas']);   // 40쪽 지면 「맥켄지산맥」 → spellAs
  one('포르토프랭스', 'capital'); one('상조제두히우프레투');
  assert.equal(one('카트마이산').elev, 2047);
  for (const bad of ['북극권', '북회귀선', '남회귀선', '적도', '중앙아메리카', '야노', '스', '로키', '산맥', '맥켄지산맥', '슈피리어호무스강강니버올', '(프)', '(미)']) assert.ok(!places.some((p) => p.name === bad), bad);
});

test('찾아보기 40~43쪽 지명이 모두 places 에 있음(뺀 것은 indexExclude 에 까닭)', () => {
  const idx = `${WORK}/${cfg.index.out}`;
  if (!existsSync(idx)) return;                                    // 작업 폴더 없음(다른 PC) — 건너뜀
  const rows = JSON.parse(readFileSync(idx, 'utf8')).filter((r) => r.page >= 40 && r.page <= 43);
  assert.ok(rows.length >= 469, `${rows.length}`);
  const have = new Set(places.map((p) => key(p.name)));
  assert.deepEqual(rows.filter((r) => !cfg.indexExclude[r.name] && !have.has(key(r.name))).map((r) => r.name), []);
  assert.deepEqual(cfg.indexExclude, {});
  // 쪽까지: 찾아보기 쪽이 그 지명을 합친 지도의 쪽에 있음
  const pageOf = { 'p40-americas': 40, 'p40-central': 40, 'p42-north': 42, 'p43-south': 43 };
  const pages = new Map(); for (const p of places) { const k = key(p.name); if (!pages.has(k)) pages.set(k, new Set()); for (const m of p.from) pages.get(k).add(pageOf[m]); }
  assert.deepEqual(rows.filter((r) => !pages.get(key(r.name))?.has(r.page)).map((r) => `${r.name} ${r.page}`), []);
  assert.ok(places.filter((p) => p.inIndex).length >= 320);
});

// 찾아보기 격자 칸(예: 42E3): 격자 글자는 경위선 칸 가운데에 찍혀 있다(글자 자리를 fit 으로 되돌려 확인 — U5-5).
//   40쪽 본 지도 A~H × 1~7 = 경선 20°(A = 180°~160°W) × 위선 20°(1 = 80°~60°N) / 40쪽 삽입 I~L × 1~3 = 10°(I = 90°~80°W) × 10°(1 = 30°~20°N)
//   42쪽 A~N × 1~8 = 10°(A = 170°~160°W) × 10°(1 = 80°~70°N) / 43쪽 A~G × 1~8 = 10°(A = 100°~90°W) × 10°(1 = 20°~10°N)
// 지명의 자리(점 = 교과서 기호 자리 — 옮겼으면 snapped.from, 면 = 글자 줄 path·가운데)나 그 쪽 교과서 글자 자리(작업 폴더 text/places-<지도>.json 을
// fit 으로 되돌림) 중 하나가 그 칸이면 맞음. 아는 차이는 「실행 중 결정」 U5-5.
const GRID = {
  'p40-americas': ([lon, lat]) => String.fromCharCode(65 + Math.floor((lon + 180) / 20)) + (Math.floor((80 - lat) / 20) + 1),
  'p40-central': ([lon, lat]) => String.fromCharCode(73 + Math.floor((lon + 90) / 10)) + (Math.floor((30 - lat) / 10) + 1),
  'p42-north': ([lon, lat]) => String.fromCharCode(65 + Math.floor((lon + 170) / 10)) + (Math.floor((80 - lat) / 10) + 1),
  'p43-south': ([lon, lat]) => String.fromCharCode(65 + Math.floor((lon + 100) / 10)) + (Math.floor((20 - lat) / 10) + 1),
};
const GRID_KNOWN = {               // 모두 위선 바로 옆(0.25° 안) — 찾아보기는 위 칸
  '인디애나폴리스 40E2': '기호 39.79°N(40°N 위선 아래 0.21°) — 찾아보기 E2(40~60°N)',
  '캄페체 42H6': '기호 19.88°N(20°N 아래 0.12°) — 찾아보기 H6(20~30°N)',
  '포르투알레그리 43F5': '기호 51.16°W·30.04°S(30°S 아래 0.04° — E6), 글자는 동쪽 F 열 — 찾아보기 F5(20~30°S)',
  '필라델피아 42J4': '기호 39.95°N(40°N 아래 0.05°) — 찾아보기 J4(40~50°N)',
};
test('찾아보기 격자 칸 대조(40쪽 본 지도·삽입, 42·43쪽 — 경위선 칸)', async () => {
  const idx = `${WORK}/${cfg.index.out}`;
  if (!existsSync(idx) || !Object.keys(GRID).every((id) => existsSync(`${WORK}/text/places-${id}.json`) && existsSync(`${WORK}/geo/${id}.fit.json`))) return;
  const { makeConverter } = await import('../../../scripts/atlas/georef.mjs');
  const { loadFit } = await import('../../../scripts/atlas/geo_util.mjs');
  const src = Object.fromEntries(Object.keys(GRID).map((id) => [id, { cv: makeConverter(loadFit(id)), labels: JSON.parse(readFileSync(`${WORK}/text/places-${id}.json`, 'utf8')).labels }]));
  const rows = JSON.parse(readFileSync(idx, 'utf8')).filter((r) => r.page >= 40 && r.page <= 43);
  const bad = [];
  for (const r of rows) {
    const ids = r.page === 42 ? ['p42-north'] : r.page === 43 ? ['p43-south'] : /^[I-L]/.test(r.grid) ? ['p40-central'] : ['p40-americas'];
    const id = ids[0], cell = GRID[id], k = key(r.name);
    const pts = places.filter((p) => key(p.name) === k).flatMap((p) => [p.snapped ? p.snapped.from : [p.lon, p.lat], ...(p.path || [])]);
    for (const L of src[id].labels.filter((x) => key(x.name) === k || (r.name === '매켄지산맥' && x.name === '맥켄지산맥')))
      for (const xy of [L.xy, ...(L.path || []), ...(L.symbol ? [L.symbol.xy] : [])]) { const ll = src[id].cv.invert(xy); if (ll) pts.push(ll); }
    if (!pts.map(cell).includes(r.grid)) bad.push(`${r.name} ${r.page}${r.grid}`);
  }
  assert.deepEqual(bad.sort(), Object.keys(GRID_KNOWN).sort());
  assert.equal(GRID['p40-americas']([-165, 73.5]), 'A1'); assert.equal(GRID['p40-central']([-84.9, 25]), 'I1');
  assert.equal(GRID['p42-north']([-74, 40.8]), 'J4'); assert.equal(GRID['p43-south']([-58.4, -34.6]), 'E6');
});

test('neAlias: 아메리카 범위에 같은 NAME_KO 가 둘 이상인 도시 이름은 nearest(동명 도시), 로사리오는 maxKm', () => {
  for (const n of ['산호세', '킹스턴', '산티아고', '런던', '해밀턴', '코르도바', '발렌시아', '빅토리아']) assert.ok(cfg.neAlias[n]?.nearest, n);
  assert.equal(cfg.neAlias.로사리오.maxKm, 150);
  assert.equal(cfg.neAlias.워싱턴.name, '워싱턴D.C.');
});

test('snapAlways: 카리브 작은 섬 수도·국경·해안 수도는 snapKm 안이어도 Natural Earth 자리로(snapped 기록)', () => {
  const want = ['바스테르', '캐스트리스', '킹스타운', '세인트조지스', '아순시온', '다카르'];
  assert.deepEqual(Object.keys(cfg.snapAlways).sort(), [...want].sort());
  for (const n of want) { const p = one(n, 'capital'); assert.ok(p.snapped && p.snapped.km >= 5 && p.snapped.km <= 30, `${n} ${JSON.stringify(p.snapped)}`); assert.ok(cfg.snapAlways[n], n); }
});

test('Natural Earth 대조: 도시·수도 중앙값 ≤ 3km · 90% ≤ 12km · 최대 ≤ 30km, 40쪽만 나눠 봐도 90% ≤ 20km', () => {
  const NE = `${WORK}/${cfg.neFile}`;
  if (!existsSync(NE)) return;
  const r = neCheck(places, NE);
  assert.ok(r.n >= 400, `${r.n}`);
  assert.ok(r.median <= 3 && r.p90 <= 12 && r.max <= 30.5, JSON.stringify(r));
  const r40 = neCheck(places.filter((p) => p.from[0] === 'p40-americas' || p.from[0] === 'p40-central'), NE);
  assert.ok(r40.p90 <= 20 && r40.max <= 30.5, JSON.stringify(r40));
});

test('옮긴 기호는 snapped 기록(snapAlways 밖은 snapKm 넘음), 용량 ≤ 200KB', () => {
  const moved = places.filter((x) => x.snapped);
  assert.equal(moved.length, 18);
  for (const p of moved) assert.ok((cfg.snapAlways[p.name] || p.snapped.km > cfg.snapKm) && p.snapped.km < 120, `${p.name} ${p.snapped.km}`);
  assert.ok(statSync(FILE).size <= 200 * 1024, `${statSync(FILE).size}`);
});
