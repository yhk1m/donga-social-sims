// tests/atlas/units/u5.photos.test.mjs — Ⅴ 아메리카 사진·원본 쪽·핀 생성물(content/atlas/u5/photos.json, docs/assets/atlas/u5) 검사 (U5-6)
//   만드는 법: python -I scripts/atlas/extract_images.py --unit u5 --candidates --photos --pages --sheets
import test from 'node:test'; import assert from 'node:assert/strict'; import { readFileSync, statSync, existsSync } from 'node:fs';

const cfg = JSON.parse(readFileSync('scripts/atlas/config/u5.json', 'utf8')).photos;
const photos = JSON.parse(readFileSync(cfg.outJson, 'utf8'));
const by = Object.fromEntries(photos.map((p) => [p.id, p]));
const km = ([l1, p1], [l2, p2]) => {
  const r = Math.PI / 180, h = Math.sin((p2 - p1) * r / 2) ** 2 + Math.cos(p1 * r) * Math.cos(p2 * r) * Math.sin((l2 - l1) * r / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
};

test('사진 수(실측): 지형 7·기후 4·민족 6·초국적 기업 2·지역 변화 1 = 20, 차례 = 설정', () => {
  const n = {}; for (const p of photos) n[p.topic] = (n[p.topic] || 0) + 1;
  assert.deepEqual(cfg.expect, { relief: 7, climate: 4, ethnicity: 6, tnc: 2, change: 1 });
  assert.deepEqual(n, cfg.expect);
  assert.equal(photos.length, 20);
  assert.deepEqual(photos.map((p) => p.id), cfg.items.map((it) => it.id));   // 설정을 고치고 다시 안 뽑으면 실패
  const per = {}; for (const p of photos) per[p.page] = (per[p.page] || 0) + 1;
  assert.deepEqual(per, { 44: 7, 45: 4, 46: 6, 47: 3 });                     // 40~43쪽에는 사진이 없다
  for (const p of photos) assert.ok(cfg.topics.includes(p.topic), p.id);
});

test('47쪽: 만화(쪽째 렌더 — 말풍선 벡터 글자)·A사 벡터 삽화(vectorDpi, 출처)·폐허 공장', () => {
  const comic = by['p47-1'];
  assert.equal(comic.topic, 'tnc'); assert.equal(comic.caption, '초국적 기업의 공간적 분업');
  assert.ok(comic.width >= 700, `${comic.width}`);
  const a = by['p47-2'];
  assert.equal(a.topic, 'tnc'); assert.equal(a.title, '미국에 본사를 둔 정보 통신 기업');
  assert.match(a.caption, /50개 이상의 국가/);
  assert.equal(a.dpi, cfg.vectorDpi); assert.equal(a.credit, '(A사 누리집, 2023)');
  assert.equal(by['p47-3'].topic, 'change'); assert.equal(by['p47-3'].title, '폐허가 된 옛 공장 건물');
  assert.match(by['p47-3'].caption, /^미국 자동차 산업의 중심지였던 디트로이트는 1960년대 .*도시 파산을 선언하기도 하였다\.$/);
  for (const p of photos) if (p.id !== 'p47-2') assert.ok(!('credit' in p), `${p.id}: 사진 카드에 그래프·지도 출처를 넣지 않음`);
});

test('핀 11: 44쪽 7·45쪽 4(번호 숨김 — 모두 지명 짝), 모두 경위도', () => {
  const pinned = photos.filter((p) => 'pin' in p);
  const per = {}; for (const p of pinned) per[p.page] = (per[p.page] || 0) + 1;
  assert.deepEqual(per, { 44: 7, 45: 4 });
  for (const p of pinned) {
    assert.ok(Array.isArray(p.lonlat) && p.lonlat.length === 2, p.id);
    assert.equal(p.map, p.page === 44 ? 'p44-relief' : 'p45-climate');
  }
  for (const it of cfg.items.filter((x) => 'pin' in x)) {
    assert.ok(it.pinNear, it.id);
    assert.ok(it.pinNearMaxKm <= 800, `${it.id}: 상한 ${it.pinNearMaxKm}`);
  }
  assert.deepEqual(pinned.map((p) => p.pin), [1, 2, 3, 4, 5, 6, 7, 1, 2, 3, 4]);
});

test('핀이 모두 아메리카 안(경위도 상자 + 같은 지도 핀끼리 떨어짐)', () => {
  const pts = photos.filter((x) => x.lonlat);
  for (const p of pts) {
    const [lon, lat] = p.lonlat;
    assert.ok(lon >= -170 && lon <= -30 && lat >= -56 && lat <= 84, `${p.id} ${p.lonlat}`);
  }
  for (const a of pts) for (const b of pts) if (a.id < b.id && a.map === b.map) assert.ok(km(a.lonlat, b.lonlat) > 500, `${a.id}·${b.id}`);
});

test('대표 핀 위치(실제와 가까움 — 나이아가라 폭포·뉴욕·보고타 1° 안)', () => {
  const near1 = (p, lon, lat) => Math.abs(p.lonlat[0] - lon) < 1 && Math.abs(p.lonlat[1] - lat) < 1;
  assert.ok(near1(by['p44-5'], -79.07, 43.08), `나이아가라 폭포 ${by['p44-5'].lonlat}`);
  assert.ok(near1(by['p45-2'], -74.0, 40.71), `뉴욕 ${by['p45-2'].lonlat}`);
  assert.ok(near1(by['p45-3'], -74.07, 4.71), `보고타 ${by['p45-3'].lonlat}`);
  const want = { 'p44-1': [[-67.5, -20.2], 80], 'p44-3': [[-62.54, 5.97], 40], 'p45-1': [[-156.79, 71.29], 40],
    'p45-4': [[-73.25, -3.75], 80], 'p44-2': [[-90.5, -0.6], 200] };
  for (const [id, [ll, tol]] of Object.entries(want)) assert.ok(km(by[id].lonlat, ll) < tol, `${id} ${by[id].lonlat} → ${km(by[id].lonlat, ll).toFixed(0)}km`);
  // 아마존강 핀은 강 하류(산타렝 가까이) — 강 글자 자리(마나우스 서쪽)가 아님
  assert.ok(km(by['p44-7'].lonlat, [-54.7, -2.44]) < 250, `아마존강 ${by['p44-7'].lonlat}`);
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
  const titles = { 'p44-3': '아우얀테푸이', 'p45-1': '툰드라 지역의 순록 유목', 'p46-1': '재즈(미국)', 'p46-4': '멕시코의 과달루페 성모',
    'p46-5': '퀘벡의 프랑스어·영어 공존' };
  for (const [id, t] of Object.entries(titles)) assert.equal(by[id].title, t, id);
  assert.match(by['p44-3'].caption, /앙헬 폭포/);
  assert.match(by['p45-3'].caption, /15°C/);
  for (const it of cfg.items) {
    if (it.captionOverride) { assert.equal(by[it.id].caption, it.captionOverride); assert.ok(it._why, it.id); }
    if (it.titleOverride) { assert.equal(by[it.id].title, it.titleOverride); assert.ok(it._why, it.id); }
    if (it.imagesOnly) assert.ok(it._bbox, `${it.id}: imagesOnly 까닭`);
  }
  assert.equal(by['p46-6'].caption, '미국 남부에서 볼 수 있는 영어와 에스파냐어로 함께 표시한 광고물이다.');   // 활동하기 3 사진
});

test('사진 파일·크기: jpg+webp 있음, 합계 ≤ 4MB, 원본 쪽 40~47 각 ≤ 200KiB', () => {
  let total = 0;
  for (const p of photos) for (const ext of ['jpg', 'webp']) {
    const f = `${cfg.assetDir}/photo/${p.id}.${ext}`; assert.ok(existsSync(f), f); total += statSync(f).size;
  }
  assert.ok(total <= cfg.maxTotalBytes, `${total}`);
  assert.deepEqual(cfg.pages, [40, 47]);
  for (let pno = 40; pno <= 47; pno++) {
    const f = `${cfg.assetDir}/page/p${String(pno).padStart(3, '0')}.jpg`;
    assert.ok(existsSync(f), f); assert.ok(statSync(f).size <= cfg.pageImage.maxBytes, `${f} ${statSync(f).size}`);
  }
  assert.equal(cfg.pageImage.dpi, 110);
  assert.equal(cfg.jpegQuality, 82); assert.equal(cfg.webpQuality, 80);
  assert.equal(cfg.assetPrefix, 'u5/');
});
