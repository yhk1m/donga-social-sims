// tests/atlas/units/u3.photos.test.mjs — Ⅲ 유럽 사진·원본 쪽·핀 생성물(content/atlas/u3/photos.json, docs/assets/atlas/u3) 검사 (U3-6)
//   만드는 법: python -I scripts/atlas/extract_images.py --unit u3 --candidates --photos --pages --sheets
import test from 'node:test'; import assert from 'node:assert/strict'; import { readFileSync, statSync, existsSync } from 'node:fs';

const cfg = JSON.parse(readFileSync('scripts/atlas/config/u3.json', 'utf8')).photos;
const photos = JSON.parse(readFileSync(cfg.outJson, 'utf8'));
const by = Object.fromEntries(photos.map((p) => [p.id, p]));
const km = ([l1, p1], [l2, p2]) => {
  const r = Math.PI / 180, h = Math.sin((p2 - p1) * r / 2) ** 2 + Math.cos(p1 * r) * Math.cos(p2 * r) * Math.sin((l2 - l1) * r / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
};

test('사진 수 = 설정 expect(실측 지형 7·기후 4·도시 10·지속가능 9·통합 6·특집 13 = 49)', () => {
  const n = {}; for (const p of photos) n[p.topic] = (n[p.topic] || 0) + 1;
  assert.deepEqual(n, cfg.expect);
  assert.equal(photos.length, 49);
  assert.deepEqual(photos.map((p) => p.id), cfg.items.map((it) => it.id));   // 설정을 고치고 다시 안 뽑으면 실패
});

test('핀 수: 28쪽 7·29쪽 4(아이슬란드 삽입 1)·33쪽 12(07 은 동전 둘), 모두 경위도', () => {
  const pinned = photos.filter((p) => 'pin' in p);
  const per = {}; for (const p of pinned) per[p.page] = (per[p.page] || 0) + 1;
  assert.deepEqual(per, { 28: 7, 29: 4, 33: 12 });
  assert.equal(by['p29-4'].map, 'p29-climate-iceland');
  assert.ok(!('pin' in by['p33-07']));
  for (const p of pinned) assert.ok(Array.isArray(p.lonlat) && p.lonlat.length === 2, p.id);
});

test('핀이 모두 유럽 안(neBox -32~70°E, 27~82°N)', () => {
  for (const p of photos.filter((x) => x.lonlat)) {
    const [lon, lat] = p.lonlat;
    assert.ok(lon >= -32 && lon <= 70 && lat >= 27 && lat <= 82, `${p.id} ${p.lonlat}`);
  }
});

test('대표 핀 위치(실제와 가까움)', () => {
  const want = { 'p28-1': [[7.2, 62.1], 120], 'p28-4': [[6.86, 45.83], 60], 'p29-1': [[2.35, 48.86], 100], 'p29-2': [[-9.14, 38.72], 60],
    'p29-4': [[-18.18, 65.95], 60], 'p33-04': [[4.35, 50.85], 120], 'p33-07a': [[13.4, 52.52], 250], 'p33-07b': [[12.5, 41.9], 120],
    'p33-11': [[25.5, 54.6], 150] };
  for (const [id, [ll, tol]] of Object.entries(want)) assert.ok(km(by[id].lonlat, ll) < tol, `${id} ${by[id].lonlat} → ${km(by[id].lonlat, ll).toFixed(0)}km`);
});

test('글: 설명이 비지 않고 깨진 글자(�·烋)·겹 공백 없음, 바로잡은 글은 설정 그대로', () => {
  for (const p of photos) {
    assert.ok(p.caption.trim(), p.id);
    for (const k of ['caption', 'title']) { const s = p[k] || ''; assert.ok(!/[�烋]|  /.test(s), `${p.id}.${k}: ${s}`); }
  }
  for (const it of cfg.items) {
    if (it.captionOverride) assert.equal(by[it.id].caption, it.captionOverride);
    if (it.titleOverride) assert.equal(by[it.id].title, it.titleOverride);
  }
});

test('사진 파일·크기: jpg+webp 있음, 합계 ≤ 4MB, 원본 쪽 26~33 각 ≤ 200KB', () => {
  let total = 0;
  for (const p of photos) for (const ext of ['jpg', 'webp']) {
    const f = `${cfg.assetDir}/photo/${p.id}.${ext}`; assert.ok(existsSync(f), f); total += statSync(f).size;
  }
  assert.ok(total <= cfg.maxTotalBytes, `${total}`);
  for (let pno = cfg.pages[0]; pno <= cfg.pages[1]; pno++) {
    const f = `${cfg.assetDir}/page/p${String(pno).padStart(3, '0')}.jpg`;
    assert.ok(existsSync(f), f); assert.ok(statSync(f).size <= cfg.pageImage.maxBytes, f);
  }
});
