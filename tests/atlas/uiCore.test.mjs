// tests/atlas/uiCore.test.mjs — 사이드바·지도 도구·퀴즈의 순수 함수(src/atlas/uiCore.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  scaleBarSpec, hoverLabel, mulberry32, shuffle, quizOptions, pickNext, pageCrop, pagesLabel, assetUrl, ASSET_BASE, panTarget,
} from '../../src/atlas/uiCore.js';

test('scaleBarSpec: 1·2·5 단위 중 막대 최대 길이 안에서 가장 긴 것, 글자는 km(천 단위 쉼표) 또는 m', () => {
  assert.deepEqual(scaleBarSpec(10, { maxPx: 120 }), { km: 1000, px: 100, label: '1,000 km' });
  assert.deepEqual(scaleBarSpec(3, { maxPx: 120 }), { km: 200, px: 200 / 3, label: '200 km' });
  assert.deepEqual(scaleBarSpec(0.004, { maxPx: 120 }), { km: 0.2, px: 50, label: '200 m' });
  const s = scaleBarSpec(41.7, { maxPx: 120 });
  assert.equal(s.km, 5000); assert.ok(s.px <= 120 && s.px > 100);
  assert.equal(scaleBarSpec(null), null);
  assert.equal(scaleBarSpec(0), null);
  assert.equal(scaleBarSpec(NaN), null);
  assert.equal(scaleBarSpec(-3), null);
});

test('hoverLabel: 레이어 label → name → 바탕 지도 ko, 없으면 null', () => {
  assert.equal(hoverLabel({ feature: { properties: { label: '석탄', name: '무시' } }, layerId: 'x' }), '석탄');
  assert.equal(hoverLabel({ feature: { properties: { name: '싱가포르' } } }), '싱가포르');
  assert.equal(hoverLabel({ feature: { properties: { ko: '몽골', iso: 'MNG' } }, layerId: 'basemap' }), '몽골');
  assert.equal(hoverLabel({ feature: { properties: {} } }), null);
  assert.equal(hoverLabel({ lonlat: null, xy: null }), null);
  assert.equal(hoverLabel(null), null);
});

test('mulberry32·shuffle: 같은 씨앗이면 같은 순서, 원본은 그대로', () => {
  const a = mulberry32(7), b = mulberry32(7);
  for (let i = 0; i < 5; i++) { const x = a(); assert.equal(x, b()); assert.ok(x >= 0 && x < 1); }
  const src = [1, 2, 3, 4, 5, 6];
  const s1 = shuffle(src, mulberry32(3)), s2 = shuffle(src, mulberry32(3));
  assert.deepEqual(s1, s2);
  assert.deepEqual([...s1].sort(), src);
  assert.deepEqual(src, [1, 2, 3, 4, 5, 6]);
});

test('quizOptions: 정답 포함 n개, 서로 다름, 씨앗 고정이면 같음, 보기 풀이 적으면 있는 만큼', () => {
  const pool = ['중국', '인도', '일본', '몽골', '이란', '튀르키예', '중국', '인도'];
  const o = quizOptions('몽골', pool, { n: 4, rand: mulberry32(11) });
  assert.equal(o.length, 4);
  assert.ok(o.includes('몽골'));
  assert.equal(new Set(o).size, 4);
  assert.deepEqual(o, quizOptions('몽골', pool, { n: 4, rand: mulberry32(11) }));
  assert.deepEqual(quizOptions('A', ['A', 'B'], { n: 4, rand: mulberry32(1) }).sort(), ['A', 'B']);
  // 정답이 풀에 없어도 들어간다
  assert.ok(quizOptions('카타르', pool, { n: 4, rand: mulberry32(2) }).includes('카타르'));
});

test('pickNext: 바로 앞 문제는 다시 내지 않는다(문제가 둘 이상일 때)', () => {
  const items = ['a', 'b', 'c'];
  const rand = mulberry32(5);
  let prev = null;
  for (let i = 0; i < 30; i++) { const x = pickNext(items, rand, prev); assert.notEqual(x, prev); prev = x; }
  assert.equal(pickNext(['only'], rand, 'only'), 'only');
  assert.equal(pickNext([], rand, null), null);
});

test('pageCrop: 쪽 이미지(110dpi)에서 bbox(pt) 부분만 보이게 하는 백분율', () => {
  // 쪽 1191×1104px @110dpi = 779.5×722.6pt. bbox 가로 100pt, 세로 50pt
  const c = pageCrop([100, 200, 200, 250], { pageW: 1191, pageH: 1104, dpi: 110 });
  assert.ok(Math.abs(c.aspect - 0.5) < 1e-9);
  const pw = 1191 * 72 / 110;
  assert.ok(Math.abs(c.width - (pw / 100) * 100) < 1e-6);
  assert.ok(Math.abs(c.left + 100) < 1e-9); // −x0/bw × 100
  assert.ok(Math.abs(c.top + 400) < 1e-9);  // −y0/bh × 100
  assert.ok(Math.abs(c.nativeW - 100 * 110 / 72) < 1e-9); // 그 부분의 이미지 화소 너비(키움 상한용)
  assert.equal(pageCrop(null), null);
});

test('pagesLabel·assetUrl', () => {
  assert.equal(pagesLabel([16, 18, 19]), '16·18·19쪽');
  assert.equal(pagesLabel([21]), '21쪽');
  assert.equal(pagesLabel([]), '');
  assert.equal(assetUrl('u2/photo/p20-1.jpg'), `${ASSET_BASE}u2/photo/p20-1.jpg`);
  assert.equal(assetUrl('/u2/page/p016.jpg'), `${ASSET_BASE}u2/page/p016.jpg`);
  assert.equal(assetUrl('https://example.org/a.jpg'), 'https://example.org/a.jpg');
  assert.equal(assetUrl(''), null);
  assert.equal(ASSET_BASE, 'https://yhk1m.github.io/donga-social-sims/assets/atlas/');
});

test('panTarget: 방향키 → 화면 가운데에서 비켜 놓을 화면 좌표', () => {
  assert.deepEqual(panTarget('ArrowLeft', 800, 600), [400 - 160, 300]);
  assert.deepEqual(panTarget('ArrowRight', 800, 600), [400 + 160, 300]);
  assert.deepEqual(panTarget('ArrowUp', 800, 600), [400, 300 - 120]);
  assert.deepEqual(panTarget('ArrowDown', 800, 600), [400, 300 + 120]);
  assert.equal(panTarget('a', 800, 600), null);
});
