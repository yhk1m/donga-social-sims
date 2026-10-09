// tests/atlas/geoClip.test.mjs — 바탕 지도 경위도 도형: 화면에 보이는 경위도 상자(viewRect)와
// 바탕 지도 도형을 그 상자로 미리 자르기(clipPolygon·clipLine·indexGeometry·clipIndexed), 상자 테두리 호 빼기·상자 면.
// 구드는 단속 자르기(preclip)가 점마다 무거워, 화면 밖 도형까지 투영하면 10a 확대에서 다시 그리기가 200ms 를 넘는다.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { geoPath, geoArea, geoContains } from 'd3-geo';
import { feature, mesh } from 'topojson-client';
import { REPO, readJson } from '../../scripts/atlas/geo_util.mjs';
import { makeProjection, fitBoundsTransform } from '../../src/atlas/projections.js';
import { viewProjection } from '../../src/atlas/mapView.js';
import { viewRect, clipPolygon, clipLine, indexGeometry, clipIndexed, dropBoxEdges, boxPolygon } from '../../src/atlas/geoClip.js';

const KEYS = ['miller', 'mercator', 'robinson', 'goode', 'equalEarth'];
const W = 1024, H = 768;
const signedArea = (r) => { let a = 0; for (let i = 1; i < r.length; i++) a += r[i - 1][0] * r[i][1] - r[i][0] * r[i - 1][1]; return a / 2; };
const inRect = ([x, y], [w, s, e, n], eps = 1e-9) => x >= w - eps && x <= e + eps && y >= s - eps && y <= n + eps;

// 경위도 고리는 d3 관례대로 시계 방향(북쪽 위 지도에서) = 바깥 고리. 평면(x 경도, y 위도) 부호 넓이로는 음수.
const CW = (ring) => signedArea(ring) < 0;
const area = (polys) => polys.reduce((a, p) => a + Math.abs(signedArea(p[0])) - p.slice(1).reduce((b, h) => b + Math.abs(signedArea(h)), 0), 0);

test('clipPolygon: 안이면 그대로, 밖이면 없음, 걸치면 상자 안 조각(바깥 고리 방향 유지, 닫힘)', () => {
  const sq = [[0, 0], [0, 10], [10, 10], [10, 0], [0, 0]];
  assert.ok(CW(sq));
  assert.deepEqual(clipPolygon([sq], [-5, -5, 15, 15]), [[sq]]);
  assert.deepEqual(clipPolygon([sq], [20, 20, 30, 30]), []);
  const c = clipPolygon([sq], [5, -5, 15, 5]);
  assert.equal(c.length, 1);
  const r = c[0][0];
  assert.ok(r.every((p) => inRect(p, [5, -5, 15, 5], 1e-9)));
  assert.deepEqual(r[0], r[r.length - 1], '닫힌 고리');
  assert.ok(Math.abs(area(c) - 25) < 1e-6);
  assert.ok(CW(r));
});

test('clipPolygon: 상자를 감싸는 면 → 상자(시계 방향), 위선 변은 1° 간격으로 촘촘히(대원으로 휘지 않게)', () => {
  const big = [[-50, -50], [-50, 50], [50, 50], [50, -50], [-50, -50]];
  const c = clipPolygon([big], [0, 0, 10, 4]);
  assert.equal(c.length, 1);
  assert.ok(Math.abs(area(c) - 40) < 1e-6);
  assert.ok(CW(c[0][0]));
  const r = c[0][0];
  for (let i = 1; i < r.length; i++) {
    const [a, b] = [r[i - 1], r[i]];
    if (Math.abs(a[1] - b[1]) < 1e-9) assert.ok(Math.abs(b[0] - a[0]) <= 1 + 1e-9, `위선 변 ${a}→${b}`);
  }
});

test('clipPolygon: U 자 면을 두 팔만 남게 자르면 따로 떨어진 두 면(상자 변을 따라 잇는 0 폭 다리 없음 — 구드 preclip 이 뒤집힘)', () => {
  // U: 아래가 막힌 모양. 상자는 위쪽 팔 두 개만 담는다.
  const u = [[0, 0], [0, 10], [3, 10], [3, 3], [7, 3], [7, 10], [10, 10], [10, 0], [0, 0]];
  assert.ok(CW(u));
  const c = clipPolygon([u], [-1, 5, 11, 11]);
  assert.equal(c.length, 2);
  for (const p of c) { assert.ok(CW(p[0])); assert.ok(Math.abs(Math.abs(signedArea(p[0])) - 15) < 1e-6); }
});

test('clipPolygon: 구멍은 담긴 바깥 고리에 붙고, 상자 밖 구멍은 버림', () => {
  const ext = [[0, 0], [0, 10], [10, 10], [10, 0], [0, 0]];
  const hole = [[2, 2], [4, 2], [4, 4], [2, 4], [2, 2]]; // 반시계
  const far = [[7, 7], [9, 7], [9, 9], [7, 9], [7, 7]];
  assert.ok(!CW(hole));
  const c = clipPolygon([ext, hole, far], [1, 1, 6, 12]);
  assert.equal(c.length, 1);
  assert.equal(c[0].length, 2);
  assert.ok(!CW(c[0][1]));
  assert.ok(Math.abs(area(c) - (5 * 9 - 4)) < 1e-6);
});

test('clipLine: 상자를 드나드는 줄 → 들어온 마디마다 한 줄(밖 끝점 하나씩 포함), 밖이면 없음', () => {
  const line = [[-10, 0], [-5, 0], [5, 0], [15, 0], [25, 0], [35, 0], [45, 0]];
  const runs = clipLine(line, [0, -1, 10, 1].concat([]));
  assert.deepEqual(runs, [[[-5, 0], [5, 0], [15, 0]]]);
  const two = clipLine([[-5, 0], [5, 0], [15, 0], [15, 10], [5, 10], [5, 0.5], [-5, 0.5]], [0, -1, 10, 1]);
  assert.equal(two.length, 2);
  assert.deepEqual(clipLine([[20, 20], [30, 30]], [0, 0, 10, 10]), []);
  // 마디가 상자를 가로지르기만 해도(두 끝점 다 밖) 남긴다
  assert.deepEqual(clipLine([[-5, 5], [15, 5]], [0, 0, 10, 10]), [[[-5, 5], [15, 5]]]);
});

test('indexGeometry·clipIndexed: 상자 없으면 원래 도형, 날짜변경선을 넘는 상자(170~200°)는 −180~−160° 조각도 남김', () => {
  const mp = { type: 'MultiPolygon', coordinates: [
    [[[172, 50], [172, 60], [178, 60], [178, 50], [172, 50]]],
    [[[-178, 50], [-178, 60], [-172, 60], [-172, 50], [-178, 50]]],
    [[[0, 0], [0, 5], [5, 5], [5, 0], [0, 0]]],
  ] };
  const idx = indexGeometry(mp);
  assert.deepEqual(clipIndexed(idx, null), mp);
  const g = clipIndexed(idx, [170, 40, 200, 70]);
  assert.equal(g.type, 'MultiPolygon');
  assert.equal(g.coordinates.length, 2);
  assert.ok(g.coordinates.some((p) => p[0].every(([x]) => x < 0)));
  const ml = indexGeometry({ type: 'MultiLineString', coordinates: [[[-179, 55], [-170, 55]], [[0, 0], [5, 5]]] });
  assert.deepEqual(clipIndexed(ml, [-200, 40, -150, 70]).coordinates, [[[-179, 55], [-170, 55]]]);
  // Feature·FeatureCollection·GeometryCollection 도 받는다
  const fc = { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: mp.coordinates.length && { type: 'Polygon', coordinates: mp.coordinates[2] } }] };
  assert.equal(clipIndexed(indexGeometry(fc), [-1, -1, 2, 2]).coordinates.length, 1);
});

test('viewRect: 세계 전체(k=1)는 null(자르지 않음), 확대하면 화면 가운데를 품은 좁은 상자', () => {
  for (const key of KEYS) {
    for (const c of [0, 150]) {
      const base = makeProjection(key, { centerLon: c, width: W, height: H });
      assert.equal(viewRect(viewProjection(base, { k: 1, x: 0, y: 0 }, { width: W, height: H }), W, H), null, `${key} ${c} 세계`);
      const t = fitBoundsTransform(base, [[124, 33], [131.5, 43]], W, H, 24);
      const r = viewRect(viewProjection(base, t, { width: W, height: H }), W, H);
      assert.ok(r, `${key} ${c} 한반도 상자`);
      assert.ok(inRect([127.5, 38], r) || inRect([127.5 - 360, 38], r) || inRect([127.5 + 360, 38], r), `${key} ${c}: ${r}`);
      assert.ok(r[2] - r[0] < 60 && r[3] - r[1] < 40, `${key} ${c} 좁음: ${r}`); // 구드는 엽 중앙 경선(30°E)에서 멀어 경선이 기울어 넓다
    }
  }
});

test('viewRect: 극이 화면에 보이면 경도는 한 바퀴 다(중심 경도 ±180), 위도는 그 극까지 — 세계 전체만 null', () => {
  for (const [key, c, ll, k, pole] of [['goode', 150, [180, 62], 6, 90], ['goode', 0, [120, -66], 5, -90], ['goode', 0, [-40, 80], 4, 90]]) {
    const base = makeProjection(key, { centerLon: c, width: W, height: H });
    const p0 = base(ll);
    const r = viewRect(viewProjection(base, { k, x: W / 2 - k * p0[0], y: H / 2 - k * p0[1] }, { width: W, height: H }), W, H);
    assert.ok(r, `${key} ${c} ${ll}`);
    assert.equal(r[0], c - 180); assert.equal(r[2], c + 180);
    assert.equal(pole > 0 ? r[3] : r[1], pole);
    assert.ok(r[3] - r[1] < 150, `${key} 위도 좁음: ${r}`);
  }
});

// 끝에서 끝까지: 잘라 그린 면적·선 길이 = 자르지 않고 그린 것(화면 자르기 뒤)
const BM = readJson(path.join(REPO, 'sims/atlas-u2-asia/data/basemap.json'));
const VIEWS = [
  ['한반도', [[124, 33], [131.5, 43]]], ['동아시아', [[95.6, 17], [143.3, 51.6]]], ['남아시아', [[60, 0], [100, 40]]],
  ['날짜변경선', [[165, 55], [-165, 72]]], ['남극 가장자리', [[100, -70], [140, -55]]], ['아시아 전체', [[3.083, -11.664], [173.142, 73.913]]], ['적도 넓게', [[-60, -40], [80, 40]]],
  ['북극', [[150, 70], [210, 89.9]]], ['남극', [[90, -89.9], [150, -65]]], ['구드 북쪽 단속선', [[-75, 25], [-5, 80]]],
];
for (const lvl of ['50', '10a']) {
  const land = feature(BM, BM.objects[`land${lvl}`]);
  const coast = mesh(BM, BM.objects[`land${lvl}`]);
  const li = indexGeometry(land), ci = indexGeometry(coast);
  test(`clipIndexed(${lvl}): 화면에 보이는 육지 면적·해안선 길이가 자르기 전과 같다(5개 도법 × 중심 0·150)`, () => {
    let checked = 0;
    for (const key of KEYS) {
      for (const c of [0, 150]) {
        const base = makeProjection(key, { centerLon: c, width: W, height: H });
        for (const [name, b] of VIEWS) {
          const vp = viewProjection(base, fitBoundsTransform(base, b, W, H, 24), { width: W, height: H });
          const r = viewRect(vp, W, H);
          if (!r) continue; // 이음매가 화면에 걸치면(중심 0 에서 날짜변경선 보기) 자르지 않음
          checked++;
          const p = geoPath(vp);
          const a0 = p.area(land), a1 = p.area(clipIndexed(li, r));
          // 메르카토르 남극 보기: d3 가 극을 품은 남극 고리를 ±85° 틀에서 0.9% 덜 칠한다(화면 점 표본 geoContains 로는 자른 쪽이 맞음)
          const tol = key === 'mercator' && name === '남극' ? 0.015 : 0.002;
          assert.ok(Math.abs(a0 - a1) <= Math.max(2, a0 * tol), `${lvl} ${key} ${c} ${name}: 면적 ${a0} ≠ ${a1}`);
          const l0 = p.measure(coast), l1 = p.measure(clipIndexed(ci, r));
          assert.ok(l1 >= l0 - Math.max(2, l0 * 0.002), `${lvl} ${key} ${c} ${name}: 해안선 ${l0} > ${l1}`);
        }
      }
    }
    assert.ok(checked >= 40, `자른 보기 수 ${checked}`);
  });
}

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

