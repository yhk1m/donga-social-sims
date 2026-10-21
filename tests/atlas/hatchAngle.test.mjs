// © 2026 김용현
// tests/atlas/hatchAngle.test.mjs — U5-3h 빗금 각도·색(46쪽 중남미 「혼혈」 가로 분홍 줄 angle 0 · 「아프리카계」 사선 검은 빗금).
// 공유 layers.js 는 빗금 고리 hatchHook 자리만 — 등록(installAmericasExtras) 전·angle 없는 면은 옛 45° 8px 타일 그대로(u2 고산·u4 사헬 화소 그대로),
// 등록 뒤 angle 이 있는 면은 americasExtra 의 타일(가로 줄 / 다른 각은 무늬 회전). 범례 견본은 CSS 각도(공유 ui.js — angle 있을 때만 바뀜).
// 따로 된 프로세스라 등록 전을 먼저 본다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { geoEquirectangular } from 'd3-geo';
import { installFakeDom } from './helpers/fakeDom.mjs';

register('./helpers/cssHooks.mjs', import.meta.url);
const dom = installFakeDom();
// 오프스크린 타일 캔버스: 선 그리기(moveTo·lineTo·stroke 때 색·굵기)를 기록
const tiles = [];
{
  const make = document.createElement;
  document.createElement = (tag) => {
    const el = make(tag);
    if (tag === 'canvas') {
      const rec = { el, segs: [], strokes: [], cur: null };
      tiles.push(rec);
      const c = { strokeStyle: null, lineWidth: 1, lineCap: '', fillStyle: null,
        beginPath() {}, moveTo(x, y) { rec.cur = [x, y]; }, lineTo(x, y) { rec.segs.push([...rec.cur, x, y]); rec.cur = [x, y]; },
        stroke() { rec.strokes.push({ color: this.strokeStyle, w: this.lineWidth }); }, fillRect() {}, arc() {}, fill() {}, closePath() {} };
      el.getContext = () => c;
    }
    return el;
  };
}
class FakeMatrix { constructor() { this.deg = 0; } rotateSelf(d) { this.deg += d; return this; } }
globalThis.DOMMatrix = FakeMatrix;
const { areaLayer, hatchHook } = await import('../../src/atlas/layers.js');
const { legendBlock } = await import('../../src/atlas/ui.js');
const { createLegendState } = await import('../../src/atlas/legendState.js');
const AX = await import('../../src/atlas/americasExtra.js');
test.after(() => { delete globalThis.DOMMatrix; dom.restore(); });

const findAll = (el, pred, out = []) => { if (pred(el)) out.push(el); for (const c of el.childNodes || []) findAll(c, pred, out); return out; };
const byClass = (c) => (n) => n.classList?.contains(c);
const sq = (x, y, s = 4) => [[[x, y], [x, y + s], [x + s, y + s], [x + s, y], [x, y]]];
const fc = (feats) => ({ type: 'FeatureCollection', properties: { id: 'e', legend: [] }, features: feats });
const hatchF = (cls, color, angle, x) => ({ type: 'Feature', properties: { type: 'area', cls, label: cls, color, pattern: 'hatch', ...(angle != null ? { angle } : {}) }, geometry: { type: 'MultiPolygon', coordinates: [sq(x, 10)] } });
function draw(L) {
  const projection = geoEquirectangular().scale(229).translate([400, 300]);
  const ops = [];
  const ctx = {
    globalAlpha: 1, fillStyle: null, strokeStyle: null, lineWidth: 1, lineJoin: '', lineCap: '', font: '', textAlign: '', textBaseline: '',
    beginPath() {}, moveTo() {}, lineTo() {}, closePath() {}, setLineDash() {}, save() {}, restore() {}, rect() {}, clip() {},
    fill() { ops.push({ op: 'fill', fillStyle: this.fillStyle }); }, stroke() { ops.push({ op: 'stroke', strokeStyle: this.strokeStyle }); },
    createPattern(tile) { return { pattern: true, tile, setTransform(m) { this.m = m; } }; },
    strokeText() {}, fillText() {}, measureText: (t) => ({ width: t.length * 6 }),
  };
  L.draw(ctx, () => {}, { k: 2.2, width: 800, height: 600, projection, geoRect: null });
  return ops.filter((o) => o.op === 'fill');
}
const tileOf = (p) => tiles.find((t) => t.el === p.tile);
const isDiag45 = (t) => t.segs.length === 3 && t.segs.every(([x0, y0, x1, y1]) => x1 - x0 === 8 && y0 - y1 === 8);

test('등록 전: angle 이 있어도 옛 45° 8px 타일(무늬 회전 없음), hatchHook 은 빈 자리', () => {
  assert.equal(hatchHook.make({}, { properties: { angle: 0 } }), null, '빈 고리 = null');
  const [f] = draw(areaLayer('a', fc([hatchF('mix', '#ef5ba1', 0, 10)])));
  assert.ok(f.fillStyle.pattern && !f.fillStyle.m);
  assert.ok(isDiag45(tileOf(f.fillStyle)), JSON.stringify(tileOf(f.fillStyle).segs));
  assert.equal(tileOf(f.fillStyle).strokes[0].color, '#ef5ba1');
});

test('등록 뒤: angle 0 = 가로 줄 타일(줄 색 = 면 색), 45·135 등 다른 각 = 가로 줄 무늬를 돌림, angle 없는 면은 옛 타일 그대로', () => {
  AX.installAmericasExtras();
  assert.equal(typeof hatchHook.make, 'function');
  const fills = draw(areaLayer('b', fc([hatchF('mix', '#ef5ba1', 0, 10), hatchF('afr', '#231f20', 45, 20), hatchF('alp', '#ba703d', null, 30), hatchF('v', '#123456', 90, 40)])));
  const [mix, afr, alp, v] = fills.map((o) => o.fillStyle);
  const tm = tileOf(mix);
  assert.ok(tm.segs.length >= 1 && tm.segs.every(([, y0, , y1]) => y0 === y1), `가로 줄 ${JSON.stringify(tm.segs)}`);
  assert.equal(tm.strokes[0].color, '#ef5ba1');
  assert.ok(!mix.m, '가로 줄은 회전 없음');
  assert.equal(tileOf(afr).strokes[0].color, '#231f20');
  assert.equal(afr.m.deg, -45, '45° = 가로 줄을 화면에서 반시계로 45°(캔버스 y 아래 — rotate −45)');
  assert.equal(v.m.deg, -90);
  assert.ok(!alp.m && isDiag45(tileOf(alp)), 'angle 없는 면 = 옛 타일');
  // 같은 색·각은 타일을 나눠 씀
  const before = tiles.length;
  draw(areaLayer('c', fc([hatchF('mix', '#ef5ba1', 0, 10)])));
  assert.equal(tiles.length, before);
});

test('범례 견본: angle 있으면 CSS 각도 180 − angle(0 → 180deg 가로 줄), 없으면 옛 45deg 그대로', () => {
  const items = [{ cls: 'mix', label: '혼혈', color: '#ef5ba1', kind: 'fill', pattern: 'hatch', angle: 0 },
    { cls: 'afr', label: '아프리카계', color: '#231f20', kind: 'fill', pattern: 'hatch', angle: 45 },
    { cls: 'alp', label: '고산 기후', color: '#ba703d', kind: 'fill', pattern: 'hatch' }];
  const b = legendBlock(null, createLegendState(['mix', 'afr', 'alp']), items, { title: '민족' });
  const sw = findAll(b.el, byClass('at-swatch-fill')).map((e) => e.style.background);
  assert.match(sw[0], /repeating-linear-gradient\(180deg, #ef5ba1/);
  assert.match(sw[1], /repeating-linear-gradient\(135deg, #231f20/);
  assert.match(sw[2], /repeating-linear-gradient\(45deg, #ba703d/);
});
