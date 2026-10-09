// tests/atlas/zoomer.test.mjs — 확대·이동 계산(d3-zoom 대신 쓰는 순수 함수): 범위 제한, 점 기준 확대, 두 손가락, 휠, 날아가기 보간
import test from 'node:test';
import assert from 'node:assert/strict';
import { constrainTransform, zoomAround, pinchTransform, wheelFactor, flyInterpolator } from '../../src/atlas/zoomer.js';

const close = (a, b, eps = 1e-9, msg = '') => assert.ok(Math.abs(a - b) <= eps, `${msg} ${a} ≠ ${b}`);
const ext = [[0, 0], [1000, 600]];
const tex = [[0, 50], [1000, 550]]; // 지도가 화면보다 낮음(세로 가운데 맞춤)

test('constrainTransform: 지도가 화면보다 크면 화면이 지도 안, 작으면 지도가 화면 안(그 안에서는 움직일 수 있음)', () => {
  // 가로: 지도 폭 = 화면 폭 → 꼭 맞음. 세로: 지도(500) < 화면(600) → 지도가 화면 안(아래 끝 600 까지)
  assert.deepEqual(constrainTransform({ k: 1, x: 300, y: 80 }, ext, tex, [1, 40]), { k: 1, x: 0, y: 50 });
  assert.deepEqual(constrainTransform({ k: 1, x: 0, y: 20 }, ext, tex, [1, 40]), { k: 1, x: 0, y: 20 }); // 화면 안이면 그대로
  assert.deepEqual(constrainTransform({ k: 1, x: 0, y: -90 }, ext, tex, [1, 40]), { k: 1, x: 0, y: -50 });
  const z = constrainTransform({ k: 2, x: 100, y: 100 }, ext, tex, [1, 40]); // 왼쪽 위로 너무 끌어 옴
  close(z.x, 0); close(z.y, -100); // 지도 위 끝(50·2 = 100)이 화면 위 끝
  const z2 = constrainTransform({ k: 2, x: -5000, y: -5000 }, ext, tex, [1, 40]);
  close(z2.x, -1000); close(z2.y, 600 - 1100);
});

test('constrainTransform: slack[px] 만큼은 지도 밖(빈 곳)이 화면에 들어와도 됨', () => {
  // k=2: 지도 위 끝 = 50·2 + y. 위로 slack 80px 까지 빈 곳 허용
  const z = constrainTransform({ k: 2, x: 0, y: 100 }, ext, tex, [1, 40], [0, 80]);
  close(z.y, -100 + 80);
  const z2 = constrainTransform({ k: 2, x: 60, y: -150 }, ext, tex, [1, 40], [40, 80]);
  close(z2.x, 40); close(z2.y, -150);
});

test('constrainTransform: k 를 scaleExtent 로 자름', () => {
  assert.equal(constrainTransform({ k: 0.3, x: 0, y: 0 }, ext, tex, [1, 40]).k, 1);
  assert.equal(constrainTransform({ k: 99, x: 0, y: 0 }, ext, tex, [1, 40]).k, 40);
});

test('zoomAround: 화면 점 p 아래 지점이 그대로', () => {
  const t = { k: 2, x: -100, y: -40 }, p = [300, 200];
  const z = zoomAround(t, 5, p);
  const before = [(p[0] - t.x) / t.k, (p[1] - t.y) / t.k], after = [(p[0] - z.x) / z.k, (p[1] - z.y) / z.k];
  close(before[0], after[0]); close(before[1], after[1]); assert.equal(z.k, 5);
});

test('pinchTransform: 두 손가락 사이가 두 배 → k 두 배, 가운데 지점은 손가락 가운데를 따라감', () => {
  const t = { k: 1, x: 0, y: 0 };
  const z = pinchTransform(t, [[400, 300], [500, 300]], [[350, 320], [550, 320]]);
  close(z.k, 2);
  // 처음 가운데(450,300) 지점이 새 가운데(450,320)로
  close(450 * z.k + z.x, 450); close(300 * z.k + z.y, 320);
});

test('wheelFactor: 아래로 굴리면 축소, 줄 단위·트랙패드 확대(ctrl) 보정', () => {
  assert.ok(wheelFactor({ deltaY: 100, deltaMode: 0 }) < 1);
  assert.ok(wheelFactor({ deltaY: -100, deltaMode: 0 }) > 1);
  close(wheelFactor({ deltaY: -100, deltaMode: 0 }), Math.pow(2, 0.2));
  close(wheelFactor({ deltaY: -3, deltaMode: 1 }), wheelFactor({ deltaY: -75, deltaMode: 0 }), 1e-12);
  close(wheelFactor({ deltaY: -10, deltaMode: 0, ctrlKey: true }), Math.pow(2, 0.2));
});

test('flyInterpolator: 끝이 정확히 두 변환, 가운데에서 멀리 갈 땐 한 번 축소(van Wijk)', () => {
  const a = { k: 8, x: -3000, y: -2000 }, b = { k: 8, x: -6000, y: -1000 };
  const f = flyInterpolator(a, b, 1000, 600);
  assert.deepEqual(f(0), a); assert.deepEqual(f(1), b);
  assert.ok(f(0.5).k < 8, `가운데 k ${f(0.5).k}`);
  const g = flyInterpolator({ k: 1, x: 0, y: 0 }, { k: 1, x: 0, y: 0 }, 1000, 600);
  assert.deepEqual(g(0.5), { k: 1, x: 0, y: 0 });
});

test('createZoomer(가짜 DOM): 끌기 직후 100ms 안 click 은 캡처에서 막고 그 뒤 click 은 통과, destroy 하면 리스너 0개', async () => {
  const { installFakeDom } = await import('./helpers/fakeDom.mjs');
  const dom = installFakeDom();
  try {
    const { createZoomer } = await import('../../src/atlas/zoomer.js');
    const el = document.createElement('div');
    el._rect = { left: 0, top: 0, width: 1000, height: 600 };
    const seen = { start: [], zoom: 0, end: [] };
    const z = createZoomer(el, { onStart: (s) => seen.start.push(s), onZoom: () => seen.zoom++, onEnd: (s) => seen.end.push(s) });
    z.extent([[0, 0], [1000, 600]]).translateExtent([[-5000, -5000], [5000, 5000]]);
    let clicks = 0;
    el.addEventListener('click', () => clicks++);
    const p = (type, x, extra = {}) => el.dispatch(type, { pointerId: 1, pointerType: 'mouse', button: 0, clientX: x, clientY: 100, ...extra });
    p('pointerdown', 100); p('pointermove', 101); // 3px 안: 아직 click 후보
    p('pointerup', 101);
    el.dispatch('click', {});
    assert.equal(clicks, 1, '그냥 누르기는 click');
    assert.equal(seen.zoom, 0);
    p('pointerdown', 100); p('pointermove', 120); p('pointermove', 160); p('pointerup', 160);
    assert.deepEqual(z.get(), { k: 1, x: 60, y: 0 });
    assert.deepEqual([seen.start, seen.end], [['drag'], ['drag']]);
    el.dispatch('click', {});
    assert.equal(clicks, 1, '끌기 직후 click 은 막힘');
    await new Promise((r) => setTimeout(r, 120));
    el.dispatch('click', {});
    assert.equal(clicks, 2, '100ms 뒤 click 은 통과');
    z.destroy();
    assert.equal(el.listenerCount, 1, '내가 단 click 하나만 남음');
  } finally { dom.restore(); }
});
