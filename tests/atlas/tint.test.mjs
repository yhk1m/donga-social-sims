// tests/atlas/tint.test.mjs — 고도 색(src/atlas/tint.js, E2 대조 반영): 분류 규칙·범례 단계(설정 tint·교과서 16쪽 범례와 같음)·색 표(해안 어긋남 메움)·
// 격자 칠하기·그리기 순서(바다 = 지구 안, 육지 = 육지 → 상자 밖 50m → 상자 테두리 메우기)·불러오기 실패면 지도는 고도 색 없이 그대로.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { REPO } from '../../scripts/atlas/geo_util.mjs';

const log = [];
function fakeCtx(name) {
  return {
    save: () => log.push(`${name}.save`), restore: () => log.push(`${name}.restore`), beginPath: () => {}, clip: () => log.push(`${name}.clip`),
    drawImage: (src) => log.push(`${name}.drawImage:${src.tag}`), putImageData: () => {},
    createImageData: (w, hh) => ({ width: w, height: hh, data: new Uint8ClampedArray(w * hh * 4) }),
    getImageData: (x, y, w, hh) => ({ data: new Uint8ClampedArray(w * hh * 4).fill(96) }),
    createPattern: () => ({ setTransform() {} }),
  };
}
let imageMode = 'load', made = 0;
globalThis.document = { createElement: () => { const ctx = fakeCtx('off'); return { tag: `off${made++}`, width: 0, height: 0, getContext: () => ctx }; } };
globalThis.Image = class {
  constructor() { this.l = {}; this.naturalWidth = 8; this.naturalHeight = 4; }
  addEventListener(type, fn) { this.l[type] = fn; }
  set src(v) { this._src = v; const mode = imageMode; setTimeout(() => (mode === 'load' ? this.l.load?.() : this.l.error?.()), 0); }
  get src() { return this._src; }
};
const quietWarn = async (fn) => { const w = console.warn, msgs = []; console.warn = (m) => msgs.push(m); try { return [await fn(), msgs]; } finally { console.warn = w; } };

const {
  TINT, TINT_URL, tintClasses, tintClassOf, decodeClass, tintLuts, tintLegend, tintGrid, createTintDrawer, loadTint, attachTint, BELOW, LAND0, GLACIER, CLASS_COUNT,
} = await import('../../src/atlas/tint.js');

const config = JSON.parse(readFileSync(path.join(REPO, 'scripts/atlas/config/u2.json'), 'utf8')).tint;
const EXPECT = JSON.parse(readFileSync(path.join(REPO, 'tests/atlas/fixtures/tint-cases.json'), 'utf8'));

test('분류 표 = 설정 tint(build_tint.py 가 쓰는 값) = 교과서 16쪽 범례(육지 0·100·200·500·1,000·2,000·3,000·4,000·5,000, 바다 200·1,000·2,000·4,000·6,000·8,000)', () => {
  for (const k of ['codeStep', 'landBreaks', 'landColors', 'glacierColor', 'seaBreaks', 'seaColors']) assert.deepEqual(TINT[k], config[k], k);
  assert.deepEqual(TINT.landBreaks, [0, 100, 200, 500, 1000, 2000, 3000, 4000, 5000]);
  assert.deepEqual(TINT.seaBreaks, [200, 1000, 2000, 4000, 6000, 8000]);
  const cls = tintClasses();
  assert.equal(cls.length, CLASS_COUNT);
  assert.equal(CLASS_COUNT, 18);
  assert.ok((CLASS_COUNT - 1) * TINT.codeStep <= 255, '회색 한 채널에 들어감');
  assert.equal(cls[BELOW].kind, 'below'); assert.equal(cls[LAND0].lo, 0); assert.equal(cls[GLACIER].kind, 'glacier');
});

test('tintClassOf: 경계값은 위 단계(lo ≤ 값 < hi), 육지 0 미만 = 해수면 아래 땅, 빙하는 높이와 상관없이, 바다인데 0 이상이면 가장 얕은 단계 — Python 과 같은 표(fixtures/tint-cases.json)', () => {
  for (const [elev, land, glacier, want] of EXPECT.cases) assert.equal(tintClassOf(elev, land, glacier), want, `${elev} ${land} ${glacier}`);
});

test('decodeClass: 회색 = 번호 × 12, 한두 단계 어긋나도 반올림으로 되찾고, 범위 밖은 자름', () => {
  for (let i = 0; i < CLASS_COUNT; i++) { assert.equal(decodeClass(i * 12), i); assert.equal(decodeClass(i * 12 + 2), i); assert.equal(decodeClass(Math.max(0, i * 12 - 3)), i); }
  assert.equal(decodeClass(255), CLASS_COUNT - 1);
});

test('tintLuts: 육지 표의 바다 번호 = 0~100 m 초록, 바다 표의 육지·빙하 번호 = 0~200 m 바다색(해안선은 벡터가 정함)', () => {
  const { land, sea } = tintLuts();
  const rgb = (lut, i) => [...lut.slice(i * 3, i * 3 + 3)];
  assert.deepEqual(rgb(land, 3), [0xc4, 0xdf, 0x9f]);
  assert.deepEqual(rgb(land, LAND0 + 3), [0xf7, 0xe1, 0xad], '500~1,000 m');
  assert.deepEqual(rgb(sea, LAND0 + 3), [0xd4, 0xef, 0xfc]);
  assert.deepEqual(rgb(sea, GLACIER), [0xd4, 0xef, 0xfc]);
  assert.deepEqual(rgb(sea, 6), [0x3b, 0xae, 0xe3]);
  assert.deepEqual(rgb(land, BELOW), [0x88, 0xb9, 0x86]);
});

test('tintLegend: 교과서 상자 차례(빙하 → 5,000 … 0 → 해수면 아래 → 바다 200 … 8,000), 경계 글자는 칸 윗선', () => {
  const rows = tintLegend();
  assert.deepEqual(rows.map((r) => r.top), [null, null, '5,000', '4,000', '3,000', '2,000', '1,000', '500', '200', '100', '0', null, '200', '1,000', '2,000', '4,000', '6,000', '8,000']);
  assert.deepEqual(rows.map((r) => r.kind), ['glacier', ...Array(9).fill('land'), 'below', ...Array(7).fill('sea')]);
  assert.equal(rows[0].label, '빙하');
  assert.equal(rows[1].title, '5,000 m 이상');
  assert.equal(rows.at(-1).title, '깊이 8,000 m 이상');
});

test('tintGrid: 표본 자리의 분류 색(양선형), 지도 밖은 투명, 날짜변경선 건너 감쌈', () => {
  // 4×2 화상: 왼쪽 절반 육지 1,000~2,000 m, 오른쪽 절반 바다 200~1,000 m
  const img = { width: 4, height: 2, data: new Uint8Array([LAND0 + 4, LAND0 + 4, 1, 1, LAND0 + 4, LAND0 + 4, 1, 1]) };
  const grid = { lon: Float64Array.from([-135, 135, NaN]), lat: Float64Array.from([45, -45, 0]) };
  const os = new Uint8ClampedArray(12), ol = new Uint8ClampedArray(12);
  tintGrid(grid, img, tintLuts(), os, ol);
  assert.deepEqual([...ol.slice(0, 4)], [0xef, 0xd2, 0xa1, 255], '육지 표 = 1,000~2,000 m');
  assert.deepEqual([...os.slice(4, 8)], [0xc9, 0xe7, 0xf9, 255], '바다 표 = 200~1,000 m');
  assert.equal(os[11], 0); assert.equal(ol[11], 0);
});

test('createTintDrawer: sea 는 지구 자르기 안에 바다 그림, land 는 육지 → (상자 밖) under → 테두리 메우기, 같은 view 면 한 번만 계산', () => {
  log.length = 0;
  const img = { width: 8, height: 4, data: new Uint8Array(32).fill(LAND0) };
  const proj = Object.assign(([lon, lat]) => [(lon + 180) * 2, (90 - lat) * 2], { invert: ([x, y]) => [x / 2 - 180, 90 - y / 2] });
  const fn = createTintDrawer(img);
  const ctx = fakeCtx('ctx');
  const view = { width: 64, height: 32 };
  const pathF = (g) => log.push(`path:${g.name}`);
  fn(ctx, proj, view, { phase: 'sea', path: pathF, clipSphere: () => log.push('clipSphere') });
  const seals = [];
  fn(ctx, proj, view, { phase: 'land', path: pathF, land: { name: 'land' }, under: { name: 'under' }, clipOutside: () => log.push('clipOutside'), seal: (p) => seals.push(p) });
  const seq = log.filter((x) => x.startsWith('ctx.') || x.startsWith('path:') || x.startsWith('clip'));
  const draws = seq.filter((x) => x.startsWith('ctx.drawImage')).map((x) => x.split(':')[1]);
  assert.deepEqual(seq.map((x) => (x.startsWith('ctx.drawImage') ? 'draw' : x)), [
    'ctx.save', 'clipSphere', 'draw', 'ctx.restore',
    'ctx.save', 'path:land', 'ctx.clip', 'draw', 'ctx.restore',
    'ctx.save', 'clipOutside', 'path:under', 'ctx.clip', 'draw', 'ctx.restore',
  ]);
  assert.notEqual(draws[0], draws[1], '바다 그림과 육지 그림은 다른 캔버스');
  assert.equal(draws[1], draws[2]);
  assert.equal(fn.stats.length, 1, '같은 view → 한 번 계산');
  assert.equal(seals.length, 1, '상자 테두리 메우기');
  fn(ctx, proj, { width: 64, height: 32 }, { phase: 'sea', path: pathF });
  assert.equal(fn.stats.length, 2, '새 view → 다시 계산');
});

test('loadTint·attachTint: 회색 ÷ 12 = 번호로 불러와 붙임 / 실패하면 경고 한 줄 + null 이고 지도에 붙이지 않음(지도는 고도 색 없이 그대로)', async () => {
  imageMode = 'load';
  const t = await loadTint('https://example.test/tint-a.png');
  assert.equal(t.width, 8); assert.equal(t.data[0], 8, '회색 96 = 번호 8');
  let set = 0;
  const m1 = { destroyed: false, setTintDrawer: (fn) => { set++; assert.equal(typeof fn, 'function'); } };
  assert.equal(typeof (await attachTint(m1, { url: 'https://example.test/tint-b.png' })), 'function');
  assert.equal(set, 1);
  imageMode = 'error';
  const m2 = { destroyed: false, setTintDrawer: () => { throw new Error('붙이면 안 됨'); } };
  const [d2, msgs] = await quietWarn(() => attachTint(m2, { url: 'https://example.test/tint-c.png' }));
  assert.equal(d2, null);
  assert.equal(msgs.length, 1); assert.match(msgs[0], /^고도 색 생략/);
  imageMode = 'load';
  const m3 = { destroyed: false, setTintDrawer: () => { throw new Error('destroy 뒤 붙이면 안 됨'); } };
  const p = attachTint(m3, { url: 'https://example.test/tint-d.png' });
  m3.destroyed = true;
  assert.equal(await p, null);
  assert.equal(TINT_URL, 'https://yhk1m.github.io/donga-social-sims/assets/atlas/common/tint-4096.png');
});
