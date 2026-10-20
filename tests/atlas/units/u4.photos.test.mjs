// tests/atlas/units/u4.photos.test.mjs — Ⅳ 아프리카 사진·원본 쪽·핀 생성물(content/atlas/u4/photos.json, docs/assets/atlas/u4) 검사 (U4-6)
//   만드는 법: python -I scripts/atlas/extract_images.py --unit u4 --candidates --photos --pages --sheets
import test from 'node:test'; import assert from 'node:assert/strict'; import { readFileSync, statSync, existsSync } from 'node:fs';

const cfg = JSON.parse(readFileSync('scripts/atlas/config/u4.json', 'utf8')).photos;
const photos = JSON.parse(readFileSync(cfg.outJson, 'utf8'));
const by = Object.fromEntries(photos.map((p) => [p.id, p]));
const km = ([l1, p1], [l2, p2]) => {
  const r = Math.PI / 180, h = Math.sin((p2 - p1) * r / 2) ** 2 + Math.cos(p1 * r) * Math.cos(p2 * r) * Math.sin((l2 - l1) * r / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
};

test('사진 수(실측): 지형 7·기후 4·문화 6·잠재력 5·협력 2·지속가능 11 = 35, 차례 = 설정', () => {
  const n = {}; for (const p of photos) n[p.topic] = (n[p.topic] || 0) + 1;
  assert.deepEqual(cfg.expect, { relief: 7, climate: 4, culture: 6, potential: 5, cooperation: 2, sustainable: 11 });
  assert.deepEqual(n, cfg.expect);
  assert.equal(photos.length, 35);
  assert.deepEqual(photos.map((p) => p.id), cfg.items.map((it) => it.id));   // 설정을 고치고 다시 안 뽑으면 실패
  const per = {}; for (const p of photos) per[p.page] = (per[p.page] || 0) + 1;
  assert.deepEqual(per, { 36: 7, 37: 4, 38: 11, 39: 13 });                   // 34·35쪽에는 사진이 없다
});

test('교사 Q7: 38쪽 「아프리카의 면적 비교」는 사진 카드(벡터 렌더, 잠재력 주제)', () => {
  const p = by['p38-11'];
  assert.equal(p.topic, 'potential'); assert.equal(p.title, '아프리카의 면적 비교');
  assert.match(p.caption, /135배/);
  assert.equal(p.dpi, cfg.vectorDpi);
  assert.ok(!('pin' in p));
});

test('핀 11: 36쪽 7·37쪽 4(번호 숨김 — 모두 지명 짝), 모두 경위도', () => {
  const pinned = photos.filter((p) => 'pin' in p);
  const per = {}; for (const p of pinned) per[p.page] = (per[p.page] || 0) + 1;
  assert.deepEqual(per, { 36: 7, 37: 4 });
  for (const p of pinned) {
    assert.ok(Array.isArray(p.lonlat) && p.lonlat.length === 2, p.id);
    assert.equal(p.map, p.page === 36 ? 'p36-relief' : 'p37-climate');
  }
  for (const it of cfg.items.filter((x) => 'pin' in x)) assert.ok(it.pinNear, it.id);
  assert.deepEqual(pinned.map((p) => p.pin), [1, 2, 3, 4, 5, 6, 7, 1, 2, 3, 4]);
});

test('핀이 모두 아프리카 안(경위도 상자 + 핀끼리 겹치지 않음)', () => {
  const pts = photos.filter((x) => x.lonlat);
  for (const p of pts) {
    const [lon, lat] = p.lonlat;
    assert.ok(lon >= -18 && lon <= 52 && lat >= -35 && lat <= 38, `${p.id} ${p.lonlat}`);
  }
  // 같은 지도 핀끼리 서로 다른 자리
  for (const a of pts) for (const b of pts) if (a.id < b.id && a.map === b.map) assert.ok(km(a.lonlat, b.lonlat) > 100, `${a.id}·${b.id}`);
});

test('대표 핀 위치(실제와 가까움 — 킬리만자로산·케이프타운 1° 안)', () => {
  const near1 = (p, lon, lat) => Math.abs(p.lonlat[0] - lon) < 1 && Math.abs(p.lonlat[1] - lat) < 1;
  assert.ok(near1(by['p36-2'], 37.35, -3.07), `킬리만자로 ${by['p36-2'].lonlat}`);
  assert.ok(near1(by['p36-5'], 18.42, -33.92), `테이블 마운틴 ${by['p36-5'].lonlat}`);
  assert.ok(near1(by['p37-4'], 18.42, -33.92), `오렌지 농장 ${by['p37-4'].lonlat}`);
  const want = { 'p36-1': [[32.9, 24.09], 60], 'p36-6': [[25.86, -17.92], 60], 'p36-7': [[44.7, -18.7], 80],
    'p37-1': [[31.24, 30.04], 80], 'p37-2': [[25.19, 0.52], 80] };
  for (const [id, [ll, tol]] of Object.entries(want)) assert.ok(km(by[id].lonlat, ll) < tol, `${id} ${by[id].lonlat} → ${km(by[id].lonlat, ll).toFixed(0)}km`);
});

test('글: 설명이 비지 않고 깨진 글자(�·烋·?한글)·겹 공백 없음, 따옴표는 ‘ ’ 짝, 바로잡은 글은 설정 그대로', () => {
  for (const p of photos) {
    assert.ok(p.caption.trim(), p.id);
    for (const k of ['caption', 'title', 'credit']) {
      const s = p[k] || '';
      assert.ok(!/[�烋]|  |\?[가-힣]/.test(s), `${p.id}.${k}: ${s}`);
      assert.equal((s.match(/‘/g) || []).length, (s.match(/’/g) || []).length, `${p.id}.${k}: ${s}`);
    }
  }
  assert.match(by['p36-2'].caption, /‘빛나는 산’, ‘하얀 산’/);
  assert.equal(by['p37-4'].title, '남아프리카 공화국의 오렌지 농장');                         // titleOverride(번호 원 아래 둘째 줄)
  for (const it of cfg.items) {
    if (it.captionOverride) assert.equal(by[it.id].caption, it.captionOverride);
    if (it.titleOverride) { assert.equal(by[it.id].title, it.titleOverride); assert.ok(it._why, it.id); }
    if (it.imagesOnly) assert.ok(it._bbox, `${it.id}: imagesOnly 까닭`);
  }
  // 한 설명을 두 카드가 함께 씀(유럽 U3-6 규칙)
  for (const [a, b] of [['p38-1', 'p38-2'], ['p38-5', 'p38-6'], ['p39-1', 'p39-2']]) assert.equal(by[a].caption, by[b].caption, `${a}·${b}`);
  assert.equal(by['p39-2'].credit, '(AU, 2023)');
});

test('사진 파일·크기: jpg+webp 있음, 합계 ≤ 4MB, 원본 쪽 34~39 각 ≤ 200KiB', () => {
  let total = 0;
  for (const p of photos) for (const ext of ['jpg', 'webp']) {
    const f = `${cfg.assetDir}/photo/${p.id}.${ext}`; assert.ok(existsSync(f), f); total += statSync(f).size;
  }
  assert.ok(total <= cfg.maxTotalBytes, `${total}`);
  assert.deepEqual(cfg.pages, [34, 39]);
  for (let pno = 34; pno <= 39; pno++) {
    const f = `${cfg.assetDir}/page/p${String(pno).padStart(3, '0')}.jpg`;
    assert.ok(existsSync(f), f); assert.ok(statSync(f).size <= cfg.pageImage.maxBytes, `${f} ${statSync(f).size}`);
  }
  assert.equal(cfg.pageImage.dpi, 110);
  assert.equal(cfg.jpegQuality, 82); assert.equal(cfg.webpQuality, 80);
});
