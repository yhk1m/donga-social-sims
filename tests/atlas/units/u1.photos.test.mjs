// © 2026 김용현
// tests/atlas/units/u1.photos.test.mjs — Ⅰ 세계화 사진·지구본 그림·원본 쪽·핀 생성물(content/atlas/u1/photos.json·globes.json, docs/assets/atlas/u1) 검사 (U1-6)
//   만드는 법: python -I scripts/atlas/extract_images.py --unit u1 --candidates --photos --pages --sheets
//              python -I $ATLAS_WORK/units/u1/u1-6/globes.py scripts/atlas   (지구본 단추 그림 — u1 전용 작업 스크립트)
import test from 'node:test'; import assert from 'node:assert/strict'; import { readFileSync, statSync, existsSync } from 'node:fs';
import { register } from 'node:module';
register('../helpers/cssHooks.mjs', import.meta.url);   // worldGlobe.js 가 css 를 import
const { GLOBE_SETS, GLOBE_UI } = await import('../../../src/atlas/worldGlobe.js');

const cfg = JSON.parse(readFileSync('scripts/atlas/config/u1.json', 'utf8')).photos;
const photos = JSON.parse(readFileSync(cfg.outJson, 'utf8'));
const globes = JSON.parse(readFileSync('content/atlas/u1/globes.json', 'utf8'));
const by = Object.fromEntries(photos.map((p) => [p.id, p]));
const km = ([l1, p1], [l2, p2]) => {
  const r = Math.PI / 180, h = Math.sin((p2 - p1) * r / 2) ** 2 + Math.cos(p1 * r) * Math.cos(p2 * r) * Math.sin((l2 - l1) * r / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
};

test('사진 수(실측): 지형 8·기후 8·세계의 연결 3·세계화와 지역화 10 = 29, 차례 = 설정', () => {
  const n = {}; for (const p of photos) n[p.topic] = (n[p.topic] || 0) + 1;
  assert.deepEqual(cfg.expect, { relief: 8, climate: 8, connection: 3, glocal: 10 });
  assert.deepEqual(n, cfg.expect);
  assert.equal(photos.length, 29);
  assert.deepEqual(photos.map((p) => p.id), cfg.items.map((it) => it.id));   // 설정을 고치고 다시 안 뽑으면 실패
  const per = {}; for (const p of photos) per[p.page] = (per[p.page] || 0) + 1;
  assert.deepEqual(per, { 12: 8, 13: 8, 14: 3, 15: 10 });                      // 8~11쪽에는 사진이 없다
  for (const p of photos) assert.ok(cfg.topics.includes(p.topic), p.id);
});

test('핀 20: 12쪽 8·13쪽 8(지도 번호 핀 ①~⑧ — 한 번씩, 짝 까닭) + 15쪽 햄버거 4(1~4)', () => {
  const pinned = photos.filter((p) => 'pin' in p);
  const per = {}; for (const p of pinned) per[p.map] = (per[p.map] || 0) + 1;
  assert.deepEqual(per, { 'p12-relief': 8, 'p13-climate': 8, 'p15-burger': 4 });
  for (const p of pinned) assert.ok(Array.isArray(p.lonlat) && p.lonlat.length === 2 && p.lonlat.every(Number.isFinite), p.id);
  for (const m of ['p12-relief', 'p13-climate']) {
    assert.deepEqual(pinned.filter((p) => p.map === m).map((p) => p.pin).sort(), [1, 2, 3, 4, 5, 6, 7, 8], m);
    assert.equal(cfg.pins[m].by, 'text'); assert.equal(cfg.pins[m].anchor, 'bottom'); assert.equal(cfg.pins[m].circleFill, '#7251a1');
  }
  for (const it of cfg.items.filter((x) => 'pin' in x)) {
    assert.ok(!it.pinNear, `${it.id}: 번호 핀이라 지명 짝(places.json) 없이`);
    assert.ok(it._pinNear && it._pinNear.length > 20, `${it.id}: 짝 까닭`);
  }
  assert.deepEqual(['p12-1', 'p12-2', 'p12-3', 'p12-4', 'p12-5', 'p12-6', 'p12-7', 'p12-8'].map((id) => by[id].pin), [5, 8, 2, 6, 1, 3, 7, 4]);
  assert.deepEqual(['p13-1', 'p13-2', 'p13-3', 'p13-4', 'p13-5', 'p13-6', 'p13-7', 'p13-8'].map((id) => by[id].pin), [4, 6, 5, 7, 1, 3, 2, 8]);
  assert.deepEqual(['p15-1', 'p15-2', 'p15-3', 'p15-4'].map((id) => by[id].pin), [1, 2, 3, 4]);
  for (const p of photos.filter((x) => x.page === 15 && x.id !== 'p15-1' && x.id !== 'p15-2' && x.id !== 'p15-3' && x.id !== 'p15-4')) assert.ok(!('pin' in p), p.id);
  for (const p of photos.filter((x) => x.page === 14)) assert.ok(!('pin' in p), p.id);
  // 같은 지도 핀끼리는 떨어져 있음(알프스 ②·③ 이 가장 가까움)
  for (const a of pinned) for (const b of pinned) if (a.id < b.id && a.map === b.map) assert.ok(km(a.lonlat, b.lonlat) > 500, `${a.id}·${b.id}`);
});

test('대표 핀 위치(지면 핀 끝 → 12쪽 밀러·13·15쪽 로빈슨 fit)', () => {
  const inBox = (p, w, s, e, n) => p.lonlat[0] >= w && p.lonlat[0] <= e && p.lonlat[1] >= s && p.lonlat[1] <= n;
  // 필라투스산(8.25°E, 46.98°N): 교과서 핀 ② 는 몽블랑산 ▲ 바로 동쪽 — 밀러 fit 이 이 둘레에서 +1.1° 동쪽이라 3° 안(계획 초안의 1° 는 지면 자리로 못 맞춤 — 「실행 중 결정」)
  assert.ok(Math.abs(by['p12-3'].lonlat[0] - 8.25) < 3 && Math.abs(by['p12-3'].lonlat[1] - 46.98) < 2, `필라투스산 ${by['p12-3'].lonlat}`);
  assert.ok(by['p12-6'].lonlat[0] > by['p12-3'].lonlat[0], '알파인 스키 ③ 은 필라투스산 ② 보다 동쪽');
  assert.ok(inBox(by['p12-2'], -62, -18, -50, -7), `마투그로수 ${by['p12-2'].lonlat}`);           // 주 범위 안(서쪽 끝)
  assert.ok(inBox(by['p12-8'], -10, 26, 0, 34), `사하라 모로코 ${by['p12-8'].lonlat}`);
  assert.ok(km(by['p12-4'].lonlat, [120.62, 31.30]) < 100, `쑤저우 ${by['p12-4'].lonlat}`);
  assert.ok(inBox(by['p12-5'], 5, 58, 30, 71), `스칸디나비아 ${by['p12-5'].lonlat}`);
  assert.ok(inBox(by['p12-7'], 172, -42, 179, -34), `뉴질랜드 북섬 ${by['p12-7'].lonlat}`);
  assert.ok(inBox(by['p12-1'], 100, 15, 110, 24), `베트남 북부 ${by['p12-1'].lonlat}`);
  const c13 = { 'p13-1': [87, 120, 41, 52], 'p13-2': [88, 93, 20.5, 26.7], 'p13-3': [129, 146, 30, 42], 'p13-4': [118, 126, 3, -6],
    'p13-5': [-8, 2, 50, 59], 'p13-6': [-12, 4, 10, 25], 'p13-7': [20, 32, 59, 70], 'p13-8': [140, 154, -39, -28] };
  for (const [id, [w, e, a, b]] of Object.entries(c13)) assert.ok(inBox(by[id], w, Math.min(a, b), e, Math.max(a, b)), `${id} ${by[id].lonlat}`);
  // 햄버거: 대한민국(넓이 중심)·일본·독일·아랍 에미리트(지시선 끝 점)
  const burger = { 'p15-1': [127.8, 36.4], 'p15-2': [138.5, 36.0], 'p15-3': [10.5, 51.0], 'p15-4': [54.0, 23.5] };
  for (const [id, ll] of Object.entries(burger)) assert.ok(km(by[id].lonlat, ll) < 150, `${id} ${by[id].lonlat}`);
  assert.equal(cfg.pins['p15-burger'].by, 'points');
  assert.deepEqual(cfg.pins['p15-burger'].points.map((p) => p.label), [1, 2, 3, 4]);
  for (const p of cfg.pins['p15-burger'].points) assert.ok(p._why, `${p.label}: 까닭`);
});

test('글: 설명이 비지 않고 깨진 글자(�·烋·?한글)·겹 공백 없음, 나라 이름이 설명에', () => {
  for (const p of photos) {
    assert.ok(p.caption.trim(), p.id);
    for (const k of ['caption', 'title', 'credit']) {
      const s = p[k] || '';
      assert.ok(!/[�烋]|  |\?[가-힣]/.test(s), `${p.id}.${k}: ${s}`);
    }
    assert.ok(!('credit' in p), `${p.id}: 사진 카드에 지도·그림 출처를 넣지 않음`);
  }
  const has = { 'p12-1': '베트남 북부', 'p12-2': '브라질 마투그로수주', 'p12-3': '필라투스산', 'p12-4': '쑤저우', 'p12-5': '노르딕 스키', 'p12-6': '알파인 스키',
    'p12-7': '뉴질랜드 북섬', 'p12-8': '모로코', 'p13-1': '몽골', 'p13-2': '방글라데시', 'p13-3': '기후현', 'p13-4': '인도네시아', 'p13-5': '영국',
    'p13-6': '말리', 'p13-7': '핀란드', 'p13-8': '오스트레일리아', 'p14-1': '콜럼버스', 'p14-2': '린드버그', 'p14-3': '글렌',
    'p15-1': '라이스버거(대한민국)', 'p15-2': '스시버거(일본)', 'p15-3': '소시지버거', 'p15-4': '아랍 에미리트', 'p15-5': '커피 전문점', 'p15-6': '녹차라테',
    'p15-7': '리투아니아', 'p15-8': '하와이 주립 대학교', 'p15-9': '딱지치기', 'p15-10': '케이 팝' };
  for (const [id, s] of Object.entries(has)) assert.ok(by[id].caption.includes(s), `${id}: ${by[id].caption}`);
  for (const it of cfg.items) {
    if (it.captionOverride) { assert.equal(by[it.id].caption, it.captionOverride); assert.ok(it._why, it.id); }
    if (it.imagesOnly) assert.ok(it._bbox || it._imagesOnly, `${it.id}: imagesOnly 까닭`);
  }
  // U1-10t 교사 답 9: 12·13쪽 사진 16 은 왼쪽 위 보라 빈 핀(벡터)을 지우려고 imagesOnly(래스터만) · 답 13: 라이스버거 mask subject(둘레 지도선 지움)
  const pins1213 = [12, 13].flatMap((pg) => [1, 2, 3, 4, 5, 6, 7, 8].map((i) => `p${pg}-${i}`));
  assert.deepEqual(cfg.items.filter((it) => it.imagesOnly).map((it) => it.id), [...pins1213, 'p15-1', 'p15-2', 'p15-3', 'p15-4', 'p15-6']);
  for (const id of pins1213) assert.match(cfg.items.find((it) => it.id === id)._imagesOnly, /교사 답 9/);
  assert.deepEqual(cfg.items.filter((it) => it.mask).map((it) => [it.id, it.mask]), [['p15-1', 'subject']]);
  assert.ok(cfg.items.find((it) => it.id === 'p15-1')._mask);
  assert.equal(by['p15-1'].mask, 'subject');
});

test('지구본 단추 그림 10: 앱 GLOBE_SETS 의 id·차례·cls 그대로, 160·320px WebP(알파), 설정 globes 와 같음', () => {
  const app = [...GLOBE_SETS.continents, ...GLOBE_SETS.oceans];
  assert.equal(globes.length, 10);
  assert.deepEqual(globes.map((g) => g.id), app.map((s) => s.id));
  assert.deepEqual(globes.map((g) => g.cls), app.map((s) => s.cls));
  assert.deepEqual(globes.map((g) => g.label), app.map((s) => s.label));
  assert.deepEqual(globes.map((g) => g.page), [9, 9, 9, 9, 9, 11, 11, 11, 11, 11]);
  assert.deepEqual(globes.map((g) => g.id), cfg.globes.map((g) => g.id));
  for (const g of globes) {
    assert.ok(Math.abs((g.bbox[2] - g.bbox[0]) - (g.bbox[3] - g.bbox[1])) < 0.05, `${g.id}: 정사각`);
    for (const px of [160, 320]) {
      const rel = GLOBE_UI.img(g.id, px);
      assert.equal(g.files[px].url, rel);
      const f = `${cfg.assetDir.replace(/u1$/, '')}${rel}`;
      assert.ok(existsSync(f), f);
      const b = readFileSync(f);
      assert.equal(b.toString('ascii', 0, 4), 'RIFF'); assert.equal(b.toString('ascii', 8, 12), 'WEBP');
      assert.equal(b.toString('ascii', 12, 16), 'VP8X', `${f}: 알파가 있는 확장 WebP`);
      assert.ok(b[20] & 0x10, `${f}: 알파 표지`);
      const w = 1 + b.readUIntLE(24, 3), h = 1 + b.readUIntLE(27, 3);
      assert.deepEqual([w, h], [px, px], f);
      assert.equal(statSync(f).size, g.files[px].bytes, f);
    }
  }
});

test('파일·크기: 사진 jpg+webp + 지구본 합계 ≤ 4MB, 원본 쪽 8~15 각 ≤ 200,000 B', () => {
  let total = 0;
  for (const p of photos) for (const ext of ['jpg', 'webp']) {
    const f = `${cfg.assetDir}/photo/${p.id}.${ext}`; assert.ok(existsSync(f), f); total += statSync(f).size;
  }
  for (const g of globes) for (const px of [160, 320]) total += g.files[px].bytes;
  assert.ok(total <= cfg.maxTotalBytes, `${total}`);
  assert.deepEqual(cfg.pages, [8, 15]);
  for (let pno = 8; pno <= 15; pno++) {
    const f = `${cfg.assetDir}/page/p${String(pno).padStart(3, '0')}.jpg`;
    assert.ok(existsSync(f), f); assert.ok(statSync(f).size <= cfg.pageImage.maxBytes, `${f} ${statSync(f).size}`);
  }
  assert.equal(cfg.pageImage.dpi, 110); assert.equal(cfg.pageImage.maxBytes, 200000);
  assert.equal(cfg.jpegQuality, 82); assert.equal(cfg.webpQuality, 80);
  assert.equal(cfg.assetPrefix, 'u1/');
});
