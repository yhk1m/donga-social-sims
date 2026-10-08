// tests/atlas/mapView.test.mjs — 렌더러의 순수 계산: 확대 변환을 품은 화면 투영, 중심 유지 변환, 스냅숏 상대 변환,
// 범위 형식, 축척(km/px), 레이어 순서·맞히기, 상자 테두리 호 빼기, 줄 끊김(구드 틈·날짜변경선), 선 굵기·표시 규칙
import test from 'node:test';
import assert from 'node:assert/strict';
import { geoArea, geoContains, geoDistance } from 'd3-geo';
import { makeProjection } from '../../src/atlas/projections.js';
import {
  viewProjection, transformForCenter, relativeTransform, normalizeBounds, kmPerPx, sortLayers, hitTest,
  dropBoxEdges, boxPolygon, pathBroken, riverStyle, lakeVisible, graticuleStep, fontPx, centerOf, trimPath, glyphLayout,
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

test('kmPerPx: 밀러 적도 k=1 ≈ 지구 둘레 / 지도 폭, 위도 60° 는 그 절반쯤', () => {
  const base = makeProjection('miller', { centerLon: 0, width: W, height: H, pad: 0 });
  const mapW = base([179.999, 0])[0] - base([-179.999, 0])[0];
  const eq = kmPerPx(base, [base([0, 0])[0], base([0, 0])[1]]);
  close(eq, 40030 / mapW, 40030 / mapW * 0.01);
  const p60 = base([0, 60]);
  const r = kmPerPx(base, p60) / eq;
  assert.ok(r > 0.45 && r < 0.55, `60° 비 ${r}`);
  assert.equal(kmPerPx(base, [-5000, 0]), null);
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

test('dropBoxEdges: 단원 상자 테두리 위 마디는 빼고 줄을 나눔(해안선 강조용)', () => {
  const boxes = [[20, -15, 180, 82]];
  const mls = { type: 'MultiLineString', coordinates: [
    [[30, 10], [20, 10], [20, 20], [30, 20]], // 가운데 마디가 서쪽 테두리 위 → 두 줄
    [[100, 82], [110, 82]], // 북쪽 테두리 위 → 없어짐
    [[50, 50], [60, 55]], // 그대로
  ] };
  const out = dropBoxEdges(mls, boxes, 1e-3);
  assert.deepEqual(out.coordinates, [[[30, 10], [20, 10]], [[20, 20], [30, 20]], [[50, 50], [60, 55]]]);
});

test('boxPolygon: 경위선을 따르는 상자(작은 면, 안·밖 판정)', () => {
  const poly = boxPolygon([20, -15, 180, 82]);
  assert.ok(geoArea(poly) < 2 * Math.PI, '반구보다 작아야(시계 방향 고리)');
  assert.equal(geoContains(poly, [100, 40]), true);
  assert.equal(geoContains(poly, [100, 81.5]), true); // 위선을 따라야 함(대원이면 빠짐)
  assert.equal(geoContains(poly, [0, 40]), false);
  assert.equal(geoContains(boxPolygon([-180, 60, -168, 72]), [-175, 65]), true);
});

test('pathBroken: 투영한 줄이 틈·이음매를 건너뛰면 true(적도 근처 구드 틈은 1px 남짓이라 이어진 것으로 봄)', () => {
  const g = makeProjection('goode', { centerLon: 0, width: W, height: H });
  const m = makeProjection('miller', { centerLon: 0, width: W, height: H });
  const south = [[75, -30], [85, -30]]; // 구드 남반구 80°E 단속선을 건넘
  assert.equal(pathBroken(south, g), true);
  assert.equal(pathBroken(south, m), false);
  assert.equal(pathBroken([[76.77, -4.26], [83.08, -4.27]], g), false);
  const pac = [[170, 10], [-170, 10]]; // 중심 0° 에서는 날짜변경선 이음매
  assert.equal(pathBroken(pac, m), true);
  const m150 = makeProjection('miller', { centerLon: 150, width: W, height: H });
  assert.equal(pathBroken(pac, m150), false);
  assert.equal(pathBroken([[56.13, 53.13], [56.64, 56.43], [54.88, 60.44], [54.53, 64.02]], m), false);
});

test('하천: 등급(s)이 작을수록·확대할수록 굵게, 작은 하천은 확대해야 보임', () => {
  const big = riverStyle(1, 2), small = riverStyle(6, 3);
  assert.ok(big.width > small.width);
  assert.ok(riverStyle(1, 10).width > riverStyle(1, 2).width);
  assert.equal(riverStyle(6, 2).visible, false);
  assert.equal(riverStyle(6, 3).visible, true);
  assert.ok(riverStyle(1, 40).width <= 2.4);
  assert.ok(riverStyle(6, 3).width >= 0.5);
});

test('호수: 작은 호수(s 큰 값)는 더 확대해야 보임', () => {
  assert.equal(lakeVisible(0, 2), true);
  assert.equal(lakeVisible(9, 4), false);
  assert.equal(lakeVisible(9, 12), true);
});

test('경위선 간격: 세계 30°, 확대 10°, 크게 확대 5°', () => {
  assert.equal(graticuleStep(1), 30);
  assert.equal(graticuleStep(2.5), 10);
  assert.equal(graticuleStep(12), 5);
});

test('글자 크기: 교과서 pt → 화면 px, 작은 글자도 10.5px 이상', () => {
  assert.equal(fontPx(5.4), 10.5);
  assert.ok(fontPx(12.4) > 14 && fontPx(12.4) < 17);
  assert.ok(fontPx(4) >= 10.5);
});

test('geoDistance 기반 kmPerPx 는 위도 방향이 아니라 가로 방향(같은 위도)', () => {
  const base = makeProjection('mercator', { centerLon: 0, width: W, height: H });
  const xy = base([0, 45]);
  const k = kmPerPx(base, xy);
  const a = base.invert([xy[0] - 5, xy[1]]), b = base.invert([xy[0] + 5, xy[1]]);
  close(k, (geoDistance(a, b) * 6371.0088) / 10, 1e-6);
});

test('trimPath: 줄이 길면 가운데 len 만큼만(자간 상한), 짧으면 그대로', () => {
  const pts = [[0, 0], [100, 0], [100, 100]]; // 길이 200, 가운데 = (100, 0)
  const t = trimPath(pts, 50);
  assert.deepEqual(t, [[75, 0], [100, 0], [100, 25]]);
  assert.deepEqual(trimPath(pts, 500), pts);
  assert.deepEqual(trimPath([[0, 0], [10, 0]], 4), [[3, 0], [7, 0]]);
});

test('glyphLayout: 완만한 곧은 지명은 한 덩어리(null), 가파르면 글자를 세워 위→아래로', () => {
  const measure = () => 10;
  assert.equal(glyphLayout({ name: '가나', at: [0, 0], angle: 20, spacing: 0, span: 20, size: 10 }, measure), null);
  // 아래로 내려가는 줄(+80°): 첫 글자가 위
  const down = glyphLayout({ name: '가나다', at: [0, 0], angle: 80, spacing: 5, span: 40, size: 10 }, measure);
  assert.equal(down.upright, true);
  assert.deepEqual(down.glyphs.map((g) => g.ch), ['가', '나', '다']);
  assert.ok(down.glyphs[0].at[1] < down.glyphs[2].at[1]);
  assert.ok(down.glyphs.every((g) => g.angle === 0));
  close(down.glyphs[1].at[0], 0, 1e-9); close(down.glyphs[1].at[1], 0, 1e-9);
  // 올라가는 줄(−80°): 글자 순서를 뒤집어 여전히 위→아래로 읽힘
  const up = glyphLayout({ name: '가나다', at: [0, 0], angle: -80, spacing: 5, span: 40, size: 10 }, measure);
  assert.deepEqual(up.glyphs.map((g) => g.ch), ['가', '나', '다']);
  assert.ok(up.glyphs[0].at[1] < up.glyphs[2].at[1]);
  // 굽은 줄(glyphs)이 가파르면 세움, 완만하면 그대로(회전 유지)
  const curved = { name: '가나다', glyphs: [{ ch: '가', at: [0, 30], angle: -70 }, { ch: '나', at: [5, 15], angle: -75 }, { ch: '다', at: [8, 0], angle: -80 }], angle: -75, size: 10 };
  const c = glyphLayout(curved, measure);
  assert.equal(c.upright, true);
  assert.deepEqual(c.glyphs.map((g) => [g.ch, g.at]), [['가', [8, 0]], ['나', [5, 15]], ['다', [0, 30]]]);
  const gentle = { name: '가나', glyphs: [{ ch: '가', at: [0, 0], angle: 10 }, { ch: '나', at: [10, 3], angle: 25 }], angle: 18, size: 10 };
  assert.deepEqual(glyphLayout(gentle, measure), { upright: false, glyphs: gentle.glyphs });
});
