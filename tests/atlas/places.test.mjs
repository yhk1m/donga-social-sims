// © 2026 김용현
// tests/atlas/places.test.mjs — 일반도 지명(build_places.mjs 생성물 places.json) 검사
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync, existsSync } from 'node:fs';
import { neCheck, neIndex } from '../../scripts/atlas/build_places.mjs';

const FILE = 'sims/atlas-u2-asia/data/places.json';
const places = JSON.parse(readFileSync(FILE, 'utf8'));
const cfg = JSON.parse(readFileSync('scripts/atlas/config/u2.json', 'utf8')).places;
const WORK = (process.env.ATLAS_WORK || 'C:/Users/Public/atlas-work').replace(/\\/g, '/');
const near = (p, lon, lat, tol) => Math.abs(p.lon - lon) < tol && Math.abs(p.lat - lat) < tol;
const key = (s) => s.replace(/\s+/g, '');
const KINDS = /^(country|capital|city|mountain|river|sea|region|island|desert|plain|other)$/;
const km = (a, b) => {
  const R = 6371, r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

test('대표 지명 위치가 실제와 1.5° 안', () => {
  const want = { 베이징: [116.4, 39.9], 도쿄: [139.7, 35.7], 뉴델리: [77.2, 28.6], 자카르타: [106.8, -6.2], 서울: [127.0, 37.6] };
  for (const [name, [lon, lat]] of Object.entries(want)) {
    const p = places.find((x) => x.name === name);
    assert.ok(p, name); assert.ok(near(p, lon, lat, 1.5), `${name} ${p.lon},${p.lat}`);
  }
});

test('등급(rank)은 1~6, 종류가 정해져 있음', () => {
  for (const p of places) { assert.ok(p.rank >= 1 && p.rank <= 6); assert.match(p.kind, KINDS); }
});

test('필드 형식: 경위도·쪽·크기·inIndex, 기호가 있으면 lon/lat = 기호', () => {
  for (const p of places) {
    const s = JSON.stringify(p);
    assert.ok(p.name && typeof p.name === 'string', s);
    assert.ok(p.lon >= -180 && p.lon <= 180 && p.lat >= -60 && p.lat <= 90, s);
    assert.ok([16, 18, 19].includes(p.page), s);
    assert.ok(p.size > 3 && p.size < 14, s);
    assert.equal(typeof p.inIndex, 'boolean', s);
    if (p.symbol) { assert.deepEqual(p.symbol, [p.lon, p.lat], s); }
    if (p.path) { assert.ok(p.path.length >= 2 && p.path.every((q) => q.length === 2), s); }
    if (p.angle !== undefined) assert.ok(Math.abs(p.angle) <= 180, s);
  }
});

test('수도·도시·산은 기호 위치를 쓴다(대부분)', () => {
  const pts = places.filter((p) => ['capital', 'city'].includes(p.kind) || (p.kind === 'mountain' && !p.path));   // 산맥(path)은 면·선 지명
  const withSym = pts.filter((p) => p.symbol).length;
  assert.ok(withSym / pts.length > 0.97, `${withSym}/${pts.length}`);
  for (const n of ['베이징', '도쿄', '서울', '자카르타', '뉴델리']) assert.equal(places.find((p) => p.name === n).kind, 'capital', n);
});

test('같은 이름이 50km 안에 두 번 없다', () => {
  const by = new Map();
  for (const p of places) { const k = key(p.name); if (!by.has(k)) by.set(k, []); by.get(k).push(p); }
  for (const [k, ps] of by) {
    for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) {
      assert.ok(km(ps[i], ps[j]) >= 50, `${k} ${ps[i].kind}/${ps[j].kind} ${km(ps[i], ps[j]).toFixed(0)}km`);
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

const NE = `${WORK}/raw/ne/ne_10m_populated_places.geojson`;
test('도시·수도 위치가 Natural Earth 같은 이름 도시와 가깝다(기호 짝·경위도 맞추기 검사)', { skip: !existsSync(NE) && 'Natural Earth 인구 지점 파일 없음' }, () => {
  const r = neCheck(places, NE);
  assert.ok(r && r.n > 200, `대조 ${r && r.n}곳`);
  assert.ok(r.median < 8, `중앙값 ${r.median}km`);
  assert.ok(r.p90 < 25, `90% ${r.p90}km`);
});

test('Natural Earth 짝이 하나뿐인 도시·수도는 30km 안(아니면 keepTextbookPosition 에 까닭)', { skip: !existsSync(NE) && 'Natural Earth 인구 지점 파일 없음' }, () => {
  const ne = neIndex(NE), keep = cfg.keepTextbookPosition || {};
  const count = new Map();
  for (const p of places) if (p.symbol || ['city', 'capital'].includes(p.kind)) count.set(key(p.name), (count.get(key(p.name)) || 0) + 1);
  const far = [];
  for (const p of places) {
    if (!['city', 'capital'].includes(p.kind)) continue;
    const m = ne.get(key(p.name));
    if (!m || m.length !== 1 || count.get(key(p.name)) !== 1) continue;
    const d = km(p, { lon: m[0][0], lat: m[0][1] });
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

test('places.json 은 150KB 이하', () => {
  const size = statSync(FILE).size;
  assert.ok(size <= 150 * 1024, `${size} B`);
});
