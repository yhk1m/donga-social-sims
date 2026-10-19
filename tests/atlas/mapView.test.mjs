// tests/atlas/mapView.test.mjs — 렌더러의 투영 계산: 확대 변환을 품은 화면 투영, 중심 유지 변환, 지도 위 되돌리기(invertChecked·nearCenter),
// 스냅숏 상대 변환, 범위 형식, 축척(km/px), 레이어 순서·맞히기
import test from 'node:test';
import assert from 'node:assert/strict';
import { geoDistance } from 'd3-geo';
import { makeProjection, fitBoundsTransform } from '../../src/atlas/projections.js';
import {
  viewProjection, transformForCenter, relativeTransform, normalizeBounds, kmPerPx, sortLayers, hitTest, centerOf, invertChecked, nearCenter,
} from '../../src/atlas/mapView.js';

const KEYS = ['miller', 'mercator', 'robinson', 'goode', 'equalEarth'];
const W = 1024, H = 768;
const close = (a, b, eps, msg) => assert.ok(Math.abs(a - b) <= eps, `${msg ?? ''} ${a} ≠ ${b}`);

test('viewProjection = 확대 변환(k, x, y)을 적용한 투영(화면 = k·기준 + [x, y])', () => {
  for (const key of KEYS) {
    for (const c of [0, 150]) {
      const base = makeProjection(key, { centerLon: c, width: W, height: H });
      const t = { k: 3.5, x: -900, y: -400 };
      const v = viewProjection(base, t, { width: W, height: H });
      assert.equal(v.key, key); assert.equal(v.centerLon, c);
      for (const ll of [[127, 37], [100, 20], [c + 10, -5]]) {
        const b = base(ll), q = v(ll);
        close(q[0], t.k * b[0] + t.x, 1e-6, key); close(q[1], t.k * b[1] + t.y, 1e-6, key);
      }
      const back = v.invert(v([127, 37]));
      close(back[0], 127, 1e-6); close(back[1], 37, 1e-6);
    }
  }
});

test('메르카토르 화면 투영의 자르기 상자 = 기준 상자(±85°) 변환 ∩ 화면(+여백)', () => {
  const base = makeProjection('mercator', { centerLon: 0, width: W, height: H });
  const v = viewProjection(base, { k: 1, x: 0, y: 0 }, { width: W, height: H, margin: 2 });
  const [[x0, y0], [x1, y1]] = v.clipExtent();
  const [[bx0, by0], [bx1, by1]] = base.clipExtent();
  close(x0, Math.max(-2, bx0), 1e-6); close(y0, Math.max(-2, by0), 1e-6); close(x1, Math.min(W + 2, bx1), 1e-6); close(y1, Math.min(H + 2, by1), 1e-6);
  const z = viewProjection(base, { k: 10, x: -4000, y: -3000 }, { width: W, height: H, margin: 2 });
  assert.deepEqual(z.clipExtent(), [[-2, -2], [W + 2, H + 2]]);
  assert.deepEqual(z.frame, [[bx0 * 10 - 4000, by0 * 10 - 3000], [bx1 * 10 - 4000, by1 * 10 - 3000]]);
});

test('transformForCenter: 그 경위도가 화면 가운데, k 유지', () => {
  for (const key of KEYS) {
    const base = makeProjection(key, { centerLon: 0, width: W, height: H });
    const t = transformForCenter(base, [105, 35], 4, W, H);
    assert.equal(t.k, 4);
    const v = viewProjection(base, t, { width: W, height: H });
    const [x, y] = v([105, 35]);
    close(x, W / 2, 1e-6, key); close(y, H / 2, 1e-6, key);
  }
  const g = makeProjection('goode', { centerLon: 0, width: W, height: H });
  assert.equal(transformForCenter(g, [NaN, 0], 2, W, H), null);
});

test('centerOf: 화면 가운데 경위도(투영 밖이면 null)', () => {
  const base = makeProjection('miller', { centerLon: 150, width: W, height: H });
  const t = transformForCenter(base, [127, 37], 6, W, H);
  const v = viewProjection(base, t, { width: W, height: H });
  const c = centerOf(v, W, H);
  close(c[0], 127, 1e-6); close(c[1], 37, 1e-6);
  const r = makeProjection('robinson', { centerLon: 0, width: W, height: H });
  const far = viewProjection(r, { k: 1, x: 5000, y: 0 }, { width: W, height: H });
  assert.equal(centerOf(far, W, H), null);
});

test('relativeTransform: 스냅숏(t0) → 지금(t) 화면 변환', () => {
  const t0 = { k: 2, x: -100, y: -50 }, t = { k: 3, x: -400, y: -200 };
  const { r, dx, dy } = relativeTransform(t0, t);
  const p = [123, 45];
  const s0 = [t0.k * p[0] + t0.x, t0.k * p[1] + t0.y], s = [t.k * p[0] + t.x, t.k * p[1] + t.y];
  close(r * s0[0] + dx, s[0], 1e-9); close(r * s0[1] + dy, s[1], 1e-9);
});

test('normalizeBounds: [w,s,e,n] 와 [[w,s],[e,n]] 둘 다', () => {
  assert.deepEqual(normalizeBounds([3, -11, 173, 74]), [[3, -11], [173, 74]]);
  assert.deepEqual(normalizeBounds([[3, -11], [173, 74]]), [[3, -11], [173, 74]]);
  assert.throws(() => normalizeBounds([1, 2, 3]));
});

test('kmPerPx: 절댓값 — 적도에서 경도 1° = 111.19km(지구 반지름 6371.0088km), 위도 60° 는 그 절반(가로 방향)', () => {
  for (const key of KEYS) {
    const base = makeProjection(key, { centerLon: 0, width: W, height: H });
    const v = viewProjection(base, transformForCenter(base, [0, 0], 8, W, H), { width: W, height: H });
    const pxPerDeg = v([0.5, 0])[0] - v([-0.5, 0])[0];
    close(kmPerPx(v, v([0, 0])) * pxPerDeg, 111.19, 0.05, `${key} 적도`);
  }
  const m = makeProjection('mercator', { centerLon: 0, width: W, height: H });
  const p60 = m([0, 60]);
  const pxPerDeg60 = m([0.5, 60])[0] - m([-0.5, 60])[0];
  close(kmPerPx(m, p60) * pxPerDeg60, 111.19 * Math.cos(Math.PI / 3), 0.05, '메르카토르 60°');
  assert.equal(kmPerPx(m, [-5000, 0]), null);
});

test('invertChecked: 지도 위면 경위도, 지도 밖·구드 틈·되돌림이 0.5px 넘게 어긋나면 null', () => {
  const m = makeProjection('miller', { centerLon: 0, width: W, height: H });
  const ll = invertChecked(m, m([127, 37]));
  close(ll[0], 127, 1e-6); close(ll[1], 37, 1e-6);
  assert.equal(invertChecked(m, [-5000, 300]), null, '지도 밖');
  const g = makeProjection('goode', { centerLon: 0, width: W, height: H });
  const a = g([-40.5, 60]), b = g([-39.5, 60]); // 북반구 −40° 단속선 양쪽 → 가운데는 틈
  assert.equal(invertChecked(g, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]), null, '구드 틈');
  const bad = Object.assign((p) => [p[0] + 1, p[1]], { invert: (xy) => [xy[0], xy[1]] });
  assert.equal(invertChecked(bad, [10, 10]), null, '되돌림 1px 어긋남');
  assert.equal(invertChecked({ invert: () => [0, 95] }, [0, 0]), null, '위도 90° 넘음');
});

test('nearCenter: 가운데가 지도 위면 centerOf 와 같고, 구드 틈이면 가까운 지도 위 점, 화면 전체가 밖이면 null', () => {
  const m = makeProjection('miller', { centerLon: 0, width: W, height: H });
  assert.deepEqual(nearCenter(m, W, H), centerOf(m, W, H));
  const base = makeProjection('goode', { centerLon: 150, width: W, height: H });
  const vp = viewProjection(base, fitBoundsTransform(base, [[95.587, 16.983], [143.304, 51.551]], W, H, 24), { width: W, height: H });
  assert.equal(centerOf(vp, W, H), null, '가운데가 틈(110°E 단속선)');
  const ll = nearCenter(vp, W, H);
  assert.ok(ll && ll[0] > 90 && ll[0] < 130 && ll[1] > 10 && ll[1] < 60, `${ll}`);
  const q = vp(ll);
  assert.ok(Math.hypot(q[0] - W / 2, q[1] - H / 2) <= Math.hypot(W, H) / 16 * 2 + 1, '가운데에서 두 고리 안');
  assert.equal(nearCenter(viewProjection(m, { k: 1, x: 5000, y: 0 }, { width: W, height: H }), W, H), null);
});

test('sortLayers: z 오름차순, 같은 z 는 넣은 순서', () => {
  const ls = [{ id: 'a', z: 5 }, { id: 'b', z: 1 }, { id: 'c', z: 5 }, { id: 'd' }];
  assert.deepEqual(sortLayers(ls).map((l) => l.id), ['d', 'b', 'a', 'c']);
});

test('hitTest: z 큰 레이어부터, hit 없는 레이어는 건너뜀, 처음 맞은 것', () => {
  const calls = [];
  const mk = (id, z, res) => ({ id, z, hit: (xy, ll) => { calls.push(id); assert.deepEqual(xy, [1, 2]); assert.deepEqual(ll, [3, 4]); return res; } });
  const ls = [mk('low', 1, { name: 'L' }), { id: 'nohit', z: 9 }, mk('top', 10, null), mk('mid', 5, { name: 'M' })];
  assert.deepEqual(hitTest(ls, [1, 2], [3, 4]), { layerId: 'mid', feature: { name: 'M' } });
  assert.deepEqual(calls, ['top', 'mid']);
  assert.equal(hitTest([mk('x', 1, null)], [1, 2], [3, 4]), null);
});

test('geoDistance 기반 kmPerPx 는 위도 방향이 아니라 가로 방향(같은 위도)', () => {
  const base = makeProjection('mercator', { centerLon: 0, width: W, height: H });
  const xy = base([0, 45]);
  const k = kmPerPx(base, xy);
  const a = base.invert([xy[0] - 5, xy[1]]), b = base.invert([xy[0] + 5, xy[1]]);
  close(k, (geoDistance(a, b) * 6371.0088) / 10, 1e-6);
});

