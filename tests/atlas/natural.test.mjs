// tests/atlas/natural.test.mjs — 자연색 지형(src/atlas/natural.js, 교사 요청 「20쪽 지형은 교과서처럼」): 바탕 색 방식 ↔ 렌더러 옵션, 격자 RGB 양선형 뽑기(날짜변경선 감쌈·지도 밖 투명),
// 그리기 순서(바다 = 지구 안, 육지 = 육지 → 상자 밖 50m → 테두리 메우기, 같은 그림 한 장), 공유 격자, 불러오기 실패면 지도는 자연색 없이 그대로,
// 음영은 자연색 위에서 옅게(naturalOpacity), 자연색 화상 파일(크기·용량·색 몇 곳).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { REPO } from '../../scripts/atlas/geo_util.mjs';

const log = [];
function fakeCtx(name) {
  return {
    save: () => log.push(`${name}.save`), restore: () => log.push(`${name}.restore`), beginPath: () => {}, clip: () => log.push(`${name}.clip`),
    drawImage: (src) => log.push(`${name}.drawImage:${src.tag}`), putImageData: () => {},
    createImageData: (w, hh) => ({ width: w, height: hh, data: new Uint8ClampedArray(w * hh * 4) }),
    getImageData: (x, y, w, hh) => ({ data: new Uint8ClampedArray(w * hh * 4).fill(77) }),
    createPattern: () => ({ setTransform() {} }),
    set globalAlpha(v) { log.push(`${name}.alpha:${v}`); }, fillStyle: null, fillRect: () => log.push(`${name}.fillRect`),
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
  NATURAL_URL, NATURAL_CREDIT, NATURAL_STYLE, BASE_MODES, baseModeOf, baseOptions, naturalGrid, createNaturalDrawer, loadNatural, attachNatural,
} = await import('../../src/atlas/natural.js');
const { createGridShare, createReliefDrawer, RELIEF_STYLE } = await import('../../src/atlas/relief.js');
const config = JSON.parse(readFileSync(path.join(REPO, 'scripts/atlas/config/u2.json'), 'utf8')).natural;

test('바탕 색 방식: 없음·고도 색·자연색 ↔ 렌더러 옵션 { tint, natural }(자연색이 앞섬)', () => {
  assert.deepEqual(BASE_MODES.map((m) => m[0]), ['none', 'tint', 'natural']);
  assert.deepEqual(BASE_MODES.map((m) => m[1]), ['없음', '고도 색', '자연색']);
  assert.deepEqual(baseOptions('natural'), { tint: false, natural: true });
  assert.deepEqual(baseOptions('tint'), { tint: true, natural: false });
  assert.deepEqual(baseOptions('none'), { tint: false, natural: false });
  assert.deepEqual(baseOptions('엉뚱'), { tint: false, natural: false });
  assert.equal(baseModeOf({ tint: true, natural: true }), 'natural');
  assert.equal(baseModeOf({ tint: true }), 'tint');
  assert.equal(baseModeOf({}), 'none');
  for (const m of ['none', 'tint', 'natural']) assert.equal(baseModeOf(baseOptions(m)), m);
  assert.match(NATURAL_CREDIT, /Natural Earth II/);
});

test('naturalGrid: 표본 자리 RGB 를 양선형으로, 날짜변경선 건너 감쌈, 지도 밖은 투명', () => {
  // 2×1 화상: 왼쪽(−180..0) 빨강, 오른쪽(0..180) 파랑
  const img = { width: 2, height: 1, data: new Uint8ClampedArray([200, 0, 0, 255, 0, 0, 200, 255]) };
  const grid = { lon: Float64Array.from([-90, 90, 0, 180, NaN]), lat: Float64Array.from([0, 0, 0, 0, 0]) };
  const out = new Uint8ClampedArray(20);
  naturalGrid(grid, img, out);
  assert.deepEqual([...out.slice(0, 4)], [200, 0, 0, 255], '화소 가운데 = 그 색');
  assert.deepEqual([...out.slice(4, 8)], [0, 0, 200, 255]);
  assert.deepEqual([...out.slice(8, 12)], [100, 0, 100, 255], '경계 = 반반');
  assert.deepEqual([...out.slice(12, 16)], [100, 0, 100, 255], '날짜변경선 = 양쪽 끝 화소 반반(감쌈)');
  assert.equal(out[19], 0, '지도 밖 투명');
  // 채도 배수: 밝기(Rec. 601)는 그대로, 회색에서 멀어짐(0~255 로 자름)
  const g2 = { lon: Float64Array.from([0]), lat: Float64Array.from([0]) };
  const one = { width: 1, height: 1, data: new Uint8ClampedArray([150, 120, 90, 255]) };
  const o1 = naturalGrid(g2, one, new Uint8ClampedArray(4), { saturate: 1 });
  const o2 = naturalGrid(g2, one, new Uint8ClampedArray(4), { saturate: 1.5 });
  assert.deepEqual([...o1.slice(0, 3)], [150, 120, 90]);
  const y = 0.299 * 150 + 0.587 * 120 + 0.114 * 90;
  assert.deepEqual([...o2.slice(0, 3)], [150, 120, 90].map((c) => Math.round(y + (c - y) * 1.5)));
  assert.ok(NATURAL_STYLE.saturate >= 1 && NATURAL_STYLE.seaFade > 0 && NATURAL_STYLE.seaFade < 1);
  // 바다용 그림: 흰색을 seaFade 만큼 섞음(같은 표본), 지도 밖은 투명
  const g3 = { lon: Float64Array.from([0, NaN]), lat: Float64Array.from([0, 0]) };
  const land = new Uint8ClampedArray(8), sea = new Uint8ClampedArray(8);
  naturalGrid(g3, one, land, { seaFade: 0.5 }, sea);
  assert.deepEqual([...land.slice(0, 4)], [150, 120, 90, 255]);
  assert.deepEqual([...sea.slice(0, 4)], [202, 188, 172, 255], '반올림은 짝수 쪽(Uint8ClampedArray)');
  assert.equal(sea[7], 0);
});

test('createNaturalDrawer: sea = 지구 안, land = 육지 → 상자 밖 under → 테두리 메우기, 바다·육지가 같은 그림 한 장, 같은 view 면 한 번 계산, 공유 격자 크기', () => {
  log.length = 0;
  const img = { width: 8, height: 4, data: new Uint8ClampedArray(128).fill(120) };
  const proj = Object.assign(([lon, lat]) => [(lon + 180) * 2, (90 - lat) * 2], { invert: ([x, y]) => [x / 2 - 180, 90 - y / 2] });
  const fn = createNaturalDrawer(img);
  const ctx = fakeCtx('ctx');
  const view = { width: 64, height: 32 };
  const pathF = (g) => log.push(`path:${g.name}`);
  const share = createGridShare();
  share.begin();
  const grid = () => share.grid(proj, view);
  fn(ctx, proj, view, { phase: 'sea', path: pathF, grid, clipSphere: () => log.push('clipSphere') });
  const seals = [];
  fn(ctx, proj, view, { phase: 'land', path: pathF, grid, land: { name: 'land' }, under: { name: 'under' }, clipOutside: () => log.push('clipOutside'), seal: (p) => seals.push(p) });
  share.end();
  const seq = log.filter((x) => x.startsWith('ctx.') || x.startsWith('path:') || x.startsWith('clip'));
  const draws = seq.filter((x) => x.startsWith('ctx.drawImage')).map((x) => x.split(':')[1]);
  assert.deepEqual(seq.map((x) => (x.startsWith('ctx.drawImage') ? 'draw' : x)), [
    'ctx.save', 'clipSphere', 'draw', 'ctx.restore', // 바다용(흰색을 섞은 옅은 그림 — 교과서)
    'ctx.save', 'path:land', 'ctx.clip', 'draw', 'ctx.restore', // 육지용(그대로) → 경계 = 벡터 해안선
    'ctx.save', 'clipOutside', 'path:under', 'ctx.clip', 'draw', 'ctx.restore',
  ]);
  assert.notEqual(draws[0], draws[1], '바다용·육지용은 다른 그림');
  assert.equal(draws[1], draws[2]);
  assert.equal(fn.stats.length, 1);
  assert.equal(seals.length, 1);
  assert.deepEqual([share.stats.renders.at(-1).misses, share.stats.renders.at(-1).hits], [1, 0], '두 단계가 격자 하나');
  fn(ctx, proj, { width: 64, height: 32 }, { phase: 'sea', path: pathF });
  assert.equal(fn.stats.length, 2, '새 view → 다시 계산(혼자면 step 2)');
  assert.equal(fn.stats[1].step, 2);
});

test('loadNatural·attachNatural: RGBA 를 불러와 붙임 / 실패하면 경고 한 줄 + null(지도는 자연색 없이 그대로) / destroy 뒤엔 붙이지 않음', async () => {
  imageMode = 'load';
  const t = await loadNatural('https://example.test/nat-a.jpg');
  assert.equal(t.width, 8); assert.equal(t.data.length, 8 * 4 * 4); assert.equal(t.data[0], 77);
  let set = 0;
  const m1 = { destroyed: false, setNaturalDrawer: (fn) => { set++; assert.equal(typeof fn, 'function'); } };
  assert.equal(typeof (await attachNatural(m1, { url: 'https://example.test/nat-b.jpg' })), 'function');
  assert.equal(set, 1);
  imageMode = 'error';
  const m2 = { destroyed: false, setNaturalDrawer: () => { throw new Error('붙이면 안 됨'); } };
  const [d2, msgs] = await quietWarn(() => attachNatural(m2, { url: 'https://example.test/nat-c.jpg' }));
  assert.equal(d2, null);
  assert.equal(msgs.length, 1); assert.match(msgs[0], /^자연색 지형 생략/);
  imageMode = 'load';
  const m3 = { destroyed: false, setNaturalDrawer: () => { throw new Error('destroy 뒤 붙이면 안 됨'); } };
  const p = attachNatural(m3, { url: 'https://example.test/nat-d.jpg' });
  m3.destroyed = true;
  assert.equal(await p, null);
  assert.equal(NATURAL_URL, 'https://yhk1m.github.io/donga-social-sims/assets/atlas/common/natural-4096.jpg');
});

test('음영: 자연색 위(natural: true)에서는 naturalOpacity 로 옅게, 0 이면 그리지 않음', () => {
  assert.ok(RELIEF_STYLE.naturalOpacity >= 0 && RELIEF_STYLE.naturalOpacity < RELIEF_STYLE.opacity);
  const img = { width: 8, height: 4, data: new Uint8Array(32).fill(100) };
  const proj = Object.assign(([lon, lat]) => [(lon + 180) * 2, (90 - lat) * 2], { invert: ([x, y]) => [x / 2 - 180, 90 - y / 2] });
  const ctx = fakeCtx('ctx');
  const view = { width: 64, height: 32 };
  const extra = { path: () => {}, land: { name: 'land' } };
  log.length = 0;
  const fn = createReliefDrawer(img);
  fn(ctx, proj, view, extra);
  fn(ctx, proj, { width: 64, height: 32 }, { ...extra, natural: true });
  const alphas = log.filter((x) => x.startsWith('ctx.alpha:')).map((x) => Number(x.split(':')[1]));
  assert.deepEqual(alphas, RELIEF_STYLE.naturalOpacity > 0 ? [RELIEF_STYLE.opacity, RELIEF_STYLE.naturalOpacity] : [RELIEF_STYLE.opacity]);
  log.length = 0;
  const zero = createReliefDrawer(img, { style: { ...RELIEF_STYLE, naturalOpacity: 0 } });
  zero(ctx, proj, view, { ...extra, natural: true });
  assert.equal(zero.stats.length, 0, 'naturalOpacity 0 = 음영 생략');
});

test('자연색 화상 파일: 설정 크기(음영 화상과 같은 4096×2048 JPEG)·용량 상한 안', () => {
  const p = path.join(REPO, config.out);
  const buf = readFileSync(p);
  assert.ok(statSync(p).size <= config.maxBytes, `${statSync(p).size} ≤ ${config.maxBytes}`);
  assert.equal(buf[0], 0xff); assert.equal(buf[1], 0xd8, 'JPEG');
  // SOF0/SOF2 표시에서 크기 읽기
  let i = 2, size = null;
  while (i < buf.length) {
    if (buf[i] !== 0xff) { i++; continue; }
    const m = buf[i + 1];
    if (m >= 0xc0 && m <= 0xc2) { size = [buf.readUInt16BE(i + 7), buf.readUInt16BE(i + 5)]; break; }
    i += 2 + buf.readUInt16BE(i + 2);
  }
  assert.deepEqual(size, [config.width, config.height]);
  assert.deepEqual([config.width, config.height], [4096, 2048]);
});
