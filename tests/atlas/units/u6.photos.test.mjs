// tests/atlas/units/u6.photos.test.mjs — Ⅵ 오세아니아와 극지방 사진·원본 쪽·핀 생성물(content/atlas/u6/photos.json, docs/assets/atlas/u6) 검사 (U6-6)
//   만드는 법: python -I scripts/atlas/extract_images.py --unit u6 --candidates --photos --pages --sheets
import test from 'node:test'; import assert from 'node:assert/strict'; import { readFileSync, statSync, existsSync } from 'node:fs';

const cfg = JSON.parse(readFileSync('scripts/atlas/config/u6.json', 'utf8')).photos;
const photos = JSON.parse(readFileSync(cfg.outJson, 'utf8'));
const by = Object.fromEntries(photos.map((p) => [p.id, p]));
const km = ([l1, p1], [l2, p2]) => {
  const r = Math.PI / 180, h = Math.sin((p2 - p1) * r / 2) ** 2 + Math.cos(p1 * r) * Math.cos(p2 * r) * Math.sin((l2 - l1) * r / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
};

test('사진 수(실측): 지형 7·기후 4·환경 문제 5·극지 7 = 23, 차례 = 설정', () => {
  const n = {}; for (const p of photos) n[p.topic] = (n[p.topic] || 0) + 1;
  assert.deepEqual(cfg.expect, { relief: 7, climate: 4, environment: 5, antarcticResearch: 7 });
  assert.deepEqual(n, cfg.expect);
  assert.equal(photos.length, 23);
  assert.deepEqual(photos.map((p) => p.id), cfg.items.map((it) => it.id));   // 설정을 고치고 다시 안 뽑으면 실패
  const per = {}; for (const p of photos) per[p.page] = (per[p.page] || 0) + 1;
  assert.deepEqual(per, { 52: 7, 53: 4, 54: 5, 55: 7 });                     // 48~51쪽에는 사진이 없다
  for (const p of photos) assert.ok(cfg.topics.includes(p.topic), p.id);
});

test('핀 11: 52쪽 7·53쪽 4(번호 숨김 — 모두 지명 짝), 모두 경위도', () => {
  const pinned = photos.filter((p) => 'pin' in p);
  const per = {}; for (const p of pinned) per[p.page] = (per[p.page] || 0) + 1;
  assert.deepEqual(per, { 52: 7, 53: 4 });
  for (const p of pinned) {
    assert.ok(Array.isArray(p.lonlat) && p.lonlat.length === 2, p.id);
    assert.equal(p.map, p.page === 52 ? 'p52-relief' : 'p53-climate');
  }
  for (const it of cfg.items.filter((x) => 'pin' in x)) {
    assert.ok(it.pinNear, it.id);
    assert.ok(it.pinNearMaxKm <= 800, `${it.id}: 상한 ${it.pinNearMaxKm}`);
    if (it.pinNearMaxKm > 100) assert.ok(it._pinNear, `${it.id}: 짝 거리가 크면 까닭`);
  }
  assert.deepEqual(pinned.map((p) => p.pin), [1, 2, 3, 4, 5, 6, 7, 1, 2, 3, 4]);
});

test('핀이 모두 오세아니아 안(경위도 상자 + 같은 지도 핀끼리 떨어짐)', () => {
  const pts = photos.filter((x) => x.lonlat);
  for (const p of pts) {
    const [lon, lat] = p.lonlat;
    assert.ok(lon >= 110 && lon <= 180 && lat >= -48 && lat <= -10, `${p.id} ${p.lonlat}`);
  }
  for (const a of pts) for (const b of pts) if (a.id < b.id && a.map === b.map) assert.ok(km(a.lonlat, b.lonlat) > 500, `${a.id}·${b.id}`);
});

test('대표 핀 위치(울루루·다윈 1° 안, 밀퍼드 사운드 120km 안, 기후 핀은 도시 가까이)', () => {
  const near1 = (p, lon, lat) => Math.abs(p.lonlat[0] - lon) < 1 && Math.abs(p.lonlat[1] - lat) < 1;
  assert.ok(near1(by['p52-4'], 131.04, -25.34), `울루루 ${by['p52-4'].lonlat}`);
  assert.ok(near1(by['p53-1'], 130.84, -12.46), `다윈 ${by['p53-1'].lonlat}`);
  // 밀퍼드 사운드 핀은 피오르랜드 앞바다(교과서 핀 끝) — 경도로는 1.05° 서쪽이라 거리로
  assert.ok(km(by['p52-7'].lonlat, [167.93, -44.67]) < 120, `밀퍼드 사운드 ${by['p52-7'].lonlat}`);
  const want = { 'p53-2': [[133.88, -23.7], 40], 'p53-3': [[115.86, -31.95], 40], 'p53-4': [[172.64, -43.53], 40],
    'p52-1': [[146.0, -17.0], 120] };
  for (const [id, [ll, tol]] of Object.entries(want)) assert.ok(km(by[id].lonlat, ll) < tol, `${id} ${by[id].lonlat} → ${km(by[id].lonlat, ll).toFixed(0)}km`);
  // 와이오타푸 핀은 북섬, 밀퍼드 사운드 핀은 남섬 쪽(서로 바뀌지 않음)
  assert.ok(by['p52-3'].lonlat[1] > -41 && by['p52-7'].lonlat[1] < -44);
});

test('글: 설명이 비지 않고 깨진 글자(�·烋·?한글)·겹 공백 없음, 바로잡은 글은 설정 그대로', () => {
  for (const p of photos) {
    assert.ok(p.caption.trim(), p.id);
    for (const k of ['caption', 'title', 'credit']) {
      const s = p[k] || '';
      assert.ok(!/[�烋]|  |\?[가-힣]/.test(s), `${p.id}.${k}: ${s}`);
      assert.equal((s.match(/‘/g) || []).length, (s.match(/’/g) || []).length, `${p.id}.${k}: ${s}`);
    }
  }
  const titles = { 'p52-1': '그레이트배리어리프(대보초)', 'p52-6': '그레이트 오션 로드', 'p52-7': '밀퍼드 사운드', 'p53-2': '오스트레일리아의 아웃백',
    'p53-4': '뉴질랜드의 목축업', 'p54-1': '태평양의 거대 쓰레기 섬', 'p55-1': '북극 다산 과학 기지', 'p55-3': '남극 장보고 과학 기지' };
  for (const [id, t] of Object.entries(titles)) assert.equal(by[id].title, t, id);
  assert.match(by['p52-6'].caption, /12사도 바위/);
  assert.match(by['p54-1'].caption, /약 160만km²\)나/);
  assert.match(by['p54-2'].caption, /보얀 슬랫/); assert.match(by['p54-3'].caption, /멜라티 위즌/); assert.match(by['p54-4'].caption, /그레타 툰베리/);
  // 기지 사진 셋은 같은 설명(오른쪽 글 하나), 주제도 활동 화면 셋은 굵은 글을 설명으로
  assert.equal(by['p55-1'].caption, by['p55-2'].caption); assert.equal(by['p55-2'].caption, by['p55-3'].caption);
  assert.match(by['p55-1'].caption, /^우리나라는 1986년 남극 조약 가입 후, .*극지 연구를 하고 있다\.$/);
  assert.deepEqual(['p55-5', 'p55-6', 'p55-7'].map((id) => by[id].caption), ['쇄빙 연구선 체험(VR)', '남극 세종 과학 기지 체험(VR)', '극지 연구소 메타버스']);
  assert.match(by['p55-4'].caption, /^쇄빙 연구선 아라온호는/);
  for (const it of cfg.items) {
    if (it.captionOverride) { assert.equal(by[it.id].caption, it.captionOverride); assert.ok(it._why, it.id); }
    if (it.titleOverride) { assert.equal(by[it.id].title, it.titleOverride); assert.ok(it._why, it.id); }
    if (it.imagesOnly) assert.ok(it._bbox, `${it.id}: imagesOnly 까닭`);
  }
  for (const p of photos) assert.ok(!('credit' in p), `${p.id}: 사진 카드에 그래프·지도 출처를 넣지 않음`);
});

test('사진 파일·크기: jpg+webp 있음, 합계 ≤ 4MB, 원본 쪽 48~55 각 ≤ 200KiB', () => {
  let total = 0;
  for (const p of photos) for (const ext of ['jpg', 'webp']) {
    const f = `${cfg.assetDir}/photo/${p.id}.${ext}`; assert.ok(existsSync(f), f); total += statSync(f).size;
  }
  assert.ok(total <= cfg.maxTotalBytes, `${total}`);
  assert.deepEqual(cfg.pages, [48, 55]);
  for (let pno = 48; pno <= 55; pno++) {
    const f = `${cfg.assetDir}/page/p${String(pno).padStart(3, '0')}.jpg`;
    assert.ok(existsSync(f), f); assert.ok(statSync(f).size <= cfg.pageImage.maxBytes, `${f} ${statSync(f).size}`);
  }
  assert.equal(cfg.pageImage.dpi, 110);
  assert.equal(cfg.jpegQuality, 82); assert.equal(cfg.webpQuality, 80);
  assert.equal(cfg.assetPrefix, 'u6/');
});
