// © 2026 김용현
// tests/atlas/places.test.mjs — 일반도 지명(build_places.mjs 생성물 places.json) 검사
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync, existsSync } from 'node:fs';
import { neCheck, neIndex, relocate, merge } from '../../scripts/atlas/build_places.mjs';
import { key, km } from '../../scripts/atlas/geo_util.mjs';
import { resolveUnit } from '../../scripts/atlas/unit.mjs';

const FILE = 'sims/atlas-u2-asia/data/places.json';
const places = JSON.parse(readFileSync(FILE, 'utf8'));
const unit = JSON.parse(readFileSync('scripts/atlas/config/u2.json', 'utf8'));
const cfg = unit.places;
const mapsU2 = Object.fromEntries(JSON.parse(readFileSync('scripts/atlas/maps_u2.json', 'utf8')).map((m) => [m.id, m]));
const PAGES = cfg.maps.map((id) => mapsU2[id].page);                       // 지명을 뽑는 쪽(16·18·19)
const RANKS = cfg.rankBySize.map((r) => r[1]);
const WORK = (process.env.ATLAS_WORK || 'C:/Users/Public/atlas-work').replace(/\\/g, '/');
const near = (p, lon, lat, tol) => Math.abs(p.lon - lon) < tol && Math.abs(p.lat - lat) < tol;
const KINDS = new Set(cfg.kindList);
const ll = (p) => [p.lon, p.lat];

test('대표 지명 위치가 실제와 1.5° 안', () => {
  const want = { 베이징: [116.4, 39.9], 도쿄: [139.7, 35.7], 뉴델리: [77.2, 28.6], 자카르타: [106.8, -6.2], 서울: [127.0, 37.6] };
  for (const [name, [lon, lat]] of Object.entries(want)) {
    const p = places.find((x) => x.name === name);
    assert.ok(p, name); assert.ok(near(p, lon, lat, 1.5), `${name} ${p.lon},${p.lat}`);
  }
});

test('등급(rank)은 1~6, 종류가 정해져 있음', () => {
  for (const p of places) { assert.ok(p.rank >= Math.min(...RANKS) && p.rank <= Math.max(...RANKS)); assert.ok(KINDS.has(p.kind), p.kind); }
  assert.equal(Math.min(...RANKS), 1); assert.equal(Math.max(...RANKS), 6);
});

test('필드 형식: 경위도·쪽·크기·inIndex, 기호가 있으면 lon/lat = 기호', () => {
  for (const p of places) {
    const s = JSON.stringify(p);
    assert.ok(p.name && typeof p.name === 'string', s);
    assert.ok(p.lon >= -180 && p.lon <= 180 && p.lat >= -60 && p.lat <= 90, s);
    assert.ok(PAGES.includes(p.page), s);
    assert.ok(p.size > 3 && p.size < 14, s);
    assert.equal(typeof p.inIndex, 'boolean', s);
    if (p.symbol) { assert.deepEqual(p.symbol, [p.lon, p.lat], s); }
    if (p.path) { assert.ok(p.path.length >= 2 && p.path.every((q) => q.length === 2), s); }
    if (p.angle !== undefined) assert.ok(Math.abs(p.angle) <= 180, s);
  }
});

test('수도·도시·산은 기호 위치를 쓴다(대부분)', () => {
  const pts = places.filter((p) => cfg.cityKinds.includes(p.kind) || (p.kind === 'mountain' && !p.path));   // 산맥(path)은 면·선 지명
  const withSym = pts.filter((p) => p.symbol).length;
  assert.ok(withSym / pts.length > 0.97, `${withSym}/${pts.length}`);
  for (const n of ['베이징', '도쿄', '서울', '자카르타', '뉴델리']) assert.equal(places.find((p) => p.name === n).kind, 'capital', n);
});

test('같은 이름이 50km 안에 두 번 없다', () => {
  const by = new Map();
  for (const p of places) { const k = key(p.name); if (!by.has(k)) by.set(k, []); by.get(k).push(p); }
  for (const [k, ps] of by) {
    for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) {
      assert.ok(km(ll(ps[i]), ll(ps[j])) >= 50, `${k} ${ps[i].kind}/${ps[j].kind} ${km(ll(ps[i]), ll(ps[j])).toFixed(0)}km`);
    }
  }
});

test('종류별 개수가 교과서 일반도 규모와 맞다', () => {
  const n = {};
  for (const p of places) n[p.kind] = (n[p.kind] || 0) + 1;
  const MIN = { country: 45, capital: 45, city: 350, mountain: 40, river: 30, sea: 70, island: 100, region: 8, desert: 5, plain: 15, other: 3 };
  for (const [k, v] of Object.entries(MIN)) assert.ok((n[k] || 0) >= v, `${k} ${n[k] || 0} < ${v} (${JSON.stringify(n)})`);
  assert.ok(places.length < 1600, `지명 ${places.length}`);
});

test('경위선 눈금·범례·제목 글자가 지명에 섞이지 않음', () => {
  const leak = new RegExp(cfg.leakRe);
  for (const p of places) assert.doesNotMatch(p.name, leak, p.name);
  for (const t of ['아시아', '동아시아', '동남아시아', '육지 높이', '바다 깊이', '빙하']) assert.ok(!places.some((p) => p.name === t), t);
});

test('찾아보기의 16~19쪽 지명은 모두 있거나, 설정에 이유와 함께 제외', { skip: !existsSync(`${WORK}/${cfg.index.out}`) && '찾아보기 표 없음(places.py --index)' }, () => {
  const index = JSON.parse(readFileSync(`${WORK}/${cfg.index.out}`, 'utf8'));
  const [p0, p1] = cfg.index.checkPages;
  const rows = index.filter((r) => r.page >= p0 && r.page <= p1);
  assert.ok(rows.length > 600, `찾아보기 ${rows.length}줄`);
  const have = new Set(places.map((p) => key(p.name)));
  const missing = rows.filter((r) => !have.has(key(r.name)) && !cfg.indexExclude[r.name]);
  assert.deepEqual(missing.map((r) => `${r.name} ${r.page}${r.grid}`), []);
  for (const [name, why] of Object.entries(cfg.indexExclude)) assert.ok(typeof why === 'string' && why.length > 3, name);
  const inIdx = new Set(rows.map((r) => key(r.name)));
  for (const p of places) assert.equal(p.inIndex, inIdx.has(key(p.name)), p.name);
});

// 주의(순환): 16·18·19쪽 경위도 맞추기의 도시 기준점(src:'city')이 바로 이 Natural Earth 짝이고, 30km 넘는 것은 Natural Earth 로 옮겼다
// (snapped). 그래서 아래 두 대조는 표본 안 값이라 너무 좋게 나온다. 독립 검사는 그 아래 겹 나누기(city_controls --holdout) 시험.
const NE = `${WORK}/${cfg.neFile}`;
test('도시·수도 위치가 Natural Earth 같은 이름 도시와 가깝다(기호 짝·경위도 맞추기 검사, 표본 안)', { skip: !existsSync(NE) && 'Natural Earth 인구 지점 파일 없음' }, () => {
  const r = neCheck(places, NE);
  assert.ok(r && r.n > 200, `대조 ${r && r.n}곳`);
  assert.ok(r.median < 8, `중앙값 ${r.median}km`);
  assert.ok(r.p90 < 25, `90% ${r.p90}km`);
});

test('Natural Earth 짝이 하나뿐인 도시·수도는 30km 안(아니면 keepTextbookPosition 에 까닭)', { skip: !existsSync(NE) && 'Natural Earth 인구 지점 파일 없음' }, () => {
  const ne = neIndex(NE), keep = cfg.keepTextbookPosition || {};
  const count = new Map();
  for (const p of places) if (p.symbol || cfg.cityKinds.includes(p.kind)) count.set(key(p.name), (count.get(key(p.name)) || 0) + 1);
  const far = [];
  for (const p of places) {
    if (!cfg.cityKinds.includes(p.kind)) continue;
    const m = ne.get(key(p.name));
    if (!m || m.length !== 1 || count.get(key(p.name)) !== 1) continue;
    const d = km(ll(p), [m[0].lon, m[0].lat]);
    if (d > cfg.snapKm && !keep[p.name]) far.push(`${p.name} ${d.toFixed(0)}km`);
  }
  assert.deepEqual(far, []);
  for (const [n, why] of Object.entries(keep)) assert.ok(typeof why === 'string' && why.length > 3, n);
  for (const p of places.filter((q) => q.snapped)) {
    assert.ok(p.snapped.km > cfg.snapKm && p.snapped.from.length === 2, p.name);
    if (p.symbol) assert.deepEqual(p.symbol, [p.lon, p.lat], p.name);
  }
  assert.ok(!places.some((p) => p.snapped && p.path), '면·선 지명은 옮기지 않음');
});

const HOLD = resolveUnit([], process.env).workFile('geo/city-holdout.json');   // 단원 작업 파일(u2 = $ATLAS_WORK/geo/)
test('겹 나누기(독립 검사): 빠진 도시를 도시 기준점 fit 이 교차점만의 fit 보다 나쁘지 않게 맞힌다', { skip: !existsSync(HOLD) && 'city_controls.mjs --holdout 결과 없음' }, () => {
  const h = JSON.parse(readFileSync(HOLD, 'utf8'));
  assert.deepEqual(Object.keys(h.maps).sort(), [...unit.cityControls.maps].sort());
  for (const [id, r] of Object.entries(h.maps)) {
    assert.ok(r.holdout.n >= 10, `${id} n ${r.holdout.n}`);
    assert.ok(r.holdout.median <= r.gridOnlySame.median + 0.5, `${id} 중앙값 ${r.holdout.median} > 교차점만 ${r.gridOnlySame.median}`);
    assert.ok(r.holdout.p90 < 20, `${id} 90% ${r.holdout.p90}km`);
  }
});

test('places.json 은 150KB 이하', () => {
  const size = statSync(FILE).size;
  assert.ok(size <= 150 * 1024, `${size} B`);
});

test('옮긴 나라 이름(relocate, E1): 「미국」은 본토, 「대한민국」은 한반도 남쪽 땅 위 — moved.from 에 교과서 자리', () => {
  const us = places.find((p) => p.name === '미국');
  assert.ok(us.lon > -125 && us.lon < -67 && us.lat > 25 && us.lat < 49, `미국 ${us.lon},${us.lat}`);
  const kr = places.find((p) => p.name === '대한민국');
  assert.ok(kr.lon > 126.5 && kr.lon < 129.3 && kr.lat > 34.8 && kr.lat < 38.3, `대한민국 ${kr.lon},${kr.lat}`);
  for (const p of [us, kr]) { assert.equal(p.angle, undefined); assert.ok(Array.isArray(p.moved?.from)); }
  for (const name of Object.keys(cfg.relocate || {}).filter((n) => !n.startsWith('_'))) assert.ok(places.find((p) => p.name === name)?.moved, name);
});

test('relocate: 없는 이름·같은 이름 면 지명 둘 이상은 오류, 밑줄 열쇠는 건너뜀, 점 지명(기호)은 옮기지 않음', () => {
  const mk = () => [{ name: 'A', lon: 1, lat: 2, angle: 5 }, { name: 'B', lon: 0, lat: 0 }, { name: 'B', lon: 9, lat: 9 }, { name: 'C', lon: 3, lat: 3, symbol: [3, 3] }];
  const ps = mk();
  const out = relocate(ps, { _doc: 'x', A: { path: [[10, 20], [12, 20]], why: 'w' } });
  assert.equal(out.length, 1);
  assert.deepEqual([ps[0].lon, ps[0].lat, ps[0].angle, ps[0].moved.from], [11, 20, undefined, [1, 2]]);
  assert.throws(() => relocate(mk(), { Z: { path: [[0, 0], [1, 0]], why: 'w' } }), /없음/);
  assert.throws(() => relocate(mk(), { B: { path: [[0, 0], [1, 0]], why: 'w' } }), /2개/);
  assert.throws(() => relocate(mk(), { C: { path: [[0, 0], [1, 0]], why: 'w' } }), /없음/, '점 지명은 대상 아님');
  assert.throws(() => relocate(mk(), { A: { path: [[0, 0]], why: 'w' } }), /path/);
});

// U5-3b 여러 일반도 지명 합치기(places.mergePriority — 있을 때만): 앞 지도 자리·rank 하나, from 기록, 영문은 어느 지도든
const occ = (map, name, ll, extra = {}) => ({ name, kind: 'city', point: true, ll, size: 5.8, page: { a: 42, b: 40, c: 43 }[map], map,
  scale: { a: 25e6, b: 77e6, c: 28e6 }[map], overview: map === 'b', symbol: true, ...extra });
const PRI = { priority: ['a', 'c', 'b'], mergeKm: 30 };
test('mergePriority: 같은 이름 10km 차 → 하나(앞 지도 자리·from), 50km 차 → 둘', () => {
  const near1 = merge([occ('b', '덴버', [-105.0, 39.7]), occ('a', '덴버', [-105.1, 39.75])], PRI);
  assert.equal(near1.length, 1);
  assert.deepEqual([near1[0].lon, near1[0].lat, near1[0].page], [-105.1, 39.75, 42]);
  assert.deepEqual(near1[0].from, ['a', 'b']);
  // 앞 지도가 축척이 더 작아도(분모 큼) 앞 지도 자리
  const pri2 = merge([occ('a', '덴버', [-105.0, 39.7], { scale: 9e7 }), occ('b', '덴버', [-105.1, 39.75], { scale: 1e6 })], PRI);
  assert.deepEqual([pri2[0].lon, pri2[0].lat], [-105.0, 39.7]);
  const far = merge([occ('b', '산호세', [-121.9, 37.3]), occ('a', '산호세', [-121.9, 37.75])], PRI);
  assert.equal(far.length, 2, '50km 차는 다른 곳');
  const sj = merge([occ('a', '산호세', [-121.9, 37.3]), occ('b', '산호세', [-84.1, 9.9])], PRI);
  assert.equal(sj.length, 2, '산호세 둘(미국·코스타리카)은 그대로');
});
test('mergePriority: 다른 종류(산 ↔ 도시)는 둘, alt 로도 같은 이름, 영문은 어느 지도든', () => {
  const two = merge([occ('a', '샤스타', [-122.2, 41.4]), occ('b', '샤스타', [-122.2, 41.41], { kind: 'mountain', elev: 4322 })], PRI);
  assert.equal(two.length, 2);
  const alt = merge([occ('a', '멕시코시티', [-99.13, 19.43]), occ('b', '멕시코 시티', [-99.1, 19.4], { name: '시우다드데멕시코', alt: '멕시코시티', en: 'Mexico City' })], PRI);
  assert.equal(alt.length, 1);
  assert.equal(alt[0].name, '멕시코시티');
  assert.equal(alt[0].en, 'Mexico City', '영문은 뒤 지도에만 있어도 붙음');
  assert.deepEqual(alt[0].from, ['a', 'b']);
});
test('mergePriority: rank = 앞 지도 글자 크기 단계(지도별 표 rankBySizeMaps 가 있으면 그 표) + rankAdjust', () => {
  const opt = { ...PRI, rankAdjust: { capital: -1 }, rankBySize: [[9, 2], [5.8, 5], [0, 6]], rankBySizeMaps: { a: [[5.5, 3], [0, 6]] } };
  const [p] = merge([occ('b', '덴버', [-105, 39.7], { size: 9 }), occ('a', '덴버', [-105, 39.7], { size: 5.8 })], opt);
  assert.equal(p.rank, 3, '앞 지도 a 의 지도별 표');
  const [q] = merge([occ('c', '리마', [-77, -12], { size: 5.8, kind: 'capital' })], opt);
  assert.equal(q.rank, 4, '공통 표 5 + 수도 −1');
  const [r] = merge([occ('a', '아마존강', [-60, -3], { point: false, kind: 'river', symbol: undefined }),
    occ('c', '아마존강', [-55, -2], { point: false, kind: 'river', symbol: undefined })], opt);
  assert.deepEqual(r.from, ['a', 'c'], '면·선 지명은 dedupKm.area 안이면 하나');
});
test('mergePriority 가 없으면 옛 합치기(축척 큰 지도 자리, from 없음)', () => {
  const [p] = merge([occ('b', '덴버', [-105.0, 39.7]), occ('a', '덴버', [-105.1, 39.75], { scale: 1e6 })], { priority: undefined });
  assert.deepEqual([p.lon, p.lat], [-105.1, 39.75]);
  assert.equal(p.from, undefined);
});
