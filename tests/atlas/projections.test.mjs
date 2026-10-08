// tests/atlas/projections.test.mjs — 5개 도법·중심 경도·화면 맞춤·전환 보간·범위 맞춤(fitBoundsTransform)
import test from 'node:test';
import assert from 'node:assert/strict';
import { geoPath } from 'd3-geo';
import { PROJECTIONS, makeProjection, interpolateProjection, fitBoundsTransform } from '../../src/atlas/projections.js';

const KEYS = ['miller', 'mercator', 'robinson', 'goode', 'equalEarth'];
const nums = (s) => (s.match(/-?\d+(\.\d+)?(e-?\d+)?/g) || []).map(Number);

test('5개 도법(순서·한국어 이름)', () => {
  assert.deepEqual(Object.keys(PROJECTIONS), KEYS);
  for (const k of KEYS) assert.equal(typeof PROJECTIONS[k].label, 'string');
});

test('중심 경도 150°E면 150°E가 화면 가운데', () => {
  for (const k of KEYS) {
    const p = makeProjection(k, { centerLon: 150, width: 1000, height: 600 });
    const [x] = p([150, 0]);
    assert.ok(Math.abs(x - 500) < 2, `${k} ${x}`);
    assert.equal(p.key, k); assert.equal(p.centerLon, 150);
  }
});

test('지구 전체가 화면(여백 안)에 들어감', () => {
  for (const k of KEYS) {
    for (const c of [0, 150]) {
      const p = makeProjection(k, { centerLon: c, width: 1000, height: 600, pad: 12 });
      const lat = k === 'mercator' ? 85 : 89.9;
      for (const ll of [[c - 179.9, lat], [c + 179.9, -lat], [c, lat], [c, -lat], [c - 179.9, 0], [c + 179.9, 0]]) {
        const [x, y] = p(ll);
        assert.ok(x >= 11 && x <= 989 && y >= 11 && y <= 589, `${k} c=${c} ${ll} → ${x},${y}`);
      }
    }
  }
});

test('메르카토르는 ±85° 상자로 잘라냄(clipExtent = ±85°·경도 전체)', () => {
  for (const c of [0, 150]) {
    const p = makeProjection('mercator', { centerLon: c, width: 1000, height: 600 });
    const ext = p.clipExtent();
    assert.ok(ext, 'clipExtent 있음');
    const [[x0, y0], [x1, y1]] = ext;
    assert.ok(Math.abs(y0 - p([c, 85])[1]) < 0.5 && Math.abs(y1 - p([c, -85])[1]) < 0.5, `c=${c} y ${y0},${y1}`);
    assert.ok(x0 < p([c - 179, 0])[0] && x1 > p([c + 179, 0])[0], `c=${c} x ${x0},${x1}`);
    // 85° 보다 높은 극 지방 면은 경로에 남지 않는다
    const polar = { type: 'Polygon', coordinates: [[[c - 10, 87], [c + 10, 87], [c + 10, 89], [c - 10, 89], [c - 10, 87]].reverse()] };
    const d = geoPath(p)(polar);
    assert.ok(!d || nums(d).every((v, i) => i % 2 === 0 || v >= y0 - 0.01), `c=${c} ${d}`);
  }
});

test('보간 t=0은 시작 도법, t=1은 끝 도법과 같은 좌표', () => {
  for (const c of [0, 150]) {
    const a = makeProjection('miller', { centerLon: c, width: 800, height: 500 });
    for (const k of ['robinson', 'goode', 'mercator', 'equalEarth']) {
      const b = makeProjection(k, { centerLon: c, width: 800, height: 500 });
      const f = interpolateProjection(a, b);
      for (const ll of [[30, 40], [c + 20, -30], [127, 37.5]]) {
        assert.deepEqual(f(0)(ll).map(Math.round), a(ll).map(Math.round), `${k} c=${c} t0 ${ll}`);
        assert.deepEqual(f(1)(ll).map(Math.round), b(ll).map(Math.round), `${k} c=${c} t1 ${ll}`);
        const m = f(0.5)(ll), pa = a(ll), pb = b(ll);
        assert.ok(Math.abs(m[0] - (pa[0] + pb[0]) / 2) < 0.01 && Math.abs(m[1] - (pa[1] + pb[1]) / 2) < 0.01, `${k} t.5 ${ll}`);
      }
    }
  }
});

test('보간 투영의 stream(geoPath)이 t=0·t=1 에서 양 끝 도법 경로와 같음 — y 부호·위치 바름', () => {
  const poly = { type: 'Polygon', coordinates: [[[100, 10], [100, 40], [140, 40], [140, 10], [100, 10]]] };
  const close = (d1, d2, what) => {
    const n1 = nums(d1), n2 = nums(d2);
    assert.equal(n1.length, n2.length, `${what}: 점 수 ${n1.length} ≠ ${n2.length}`);
    n1.forEach((v, i) => assert.ok(Math.abs(v - n2[i]) < 0.05, `${what}: ${i} ${v} ≠ ${n2[i]}`));
  };
  for (const c of [0, 150]) {
    const a = makeProjection('miller', { centerLon: c, width: 800, height: 500 });
    const b = makeProjection('robinson', { centerLon: c, width: 800, height: 500 });
    const f = interpolateProjection(a, b);
    close(geoPath(f(0))(poly), geoPath(a)(poly), `c=${c} t=0`);
    close(geoPath(f(1))(poly), geoPath(b)(poly), `c=${c} t=1`);
    // 중간 경로의 첫 점 = 두 도법 첫 점의 가운데
    const [x, y] = nums(geoPath(f(0.5))(poly)), [xa, ya] = nums(geoPath(a)(poly)), [xb, yb] = nums(geoPath(b)(poly));
    assert.ok(Math.abs(x - (xa + xb) / 2) < 0.5 && Math.abs(y - (ya + yb) / 2) < 0.5, `c=${c} t=.5 ${x},${y}`);
  }
});

test('보간 투영: 메르카토르가 끼면 85° 넘는 점도 유한한 화면 좌표', () => {
  const a = makeProjection('mercator', { centerLon: 0, width: 800, height: 500 });
  const b = makeProjection('equalEarth', { centerLon: 0, width: 800, height: 500 });
  const m = interpolateProjection(a, b)(0.3)([10, 90]);
  assert.ok(m.every(Number.isFinite) && m[1] > -50, `${m}`);
});

test('보간 투영: 구드가 끼면 구드의 단속(preclip)을 씀', () => {
  const a = makeProjection('goode', { centerLon: 0, width: 800, height: 500 });
  const b = makeProjection('robinson', { centerLon: 0, width: 800, height: 500 });
  assert.equal(interpolateProjection(a, b)(0.5).preclip(), a.preclip());
  assert.equal(interpolateProjection(b, a)(0.5).preclip(), a.preclip());
});

test('보간 투영: invert 는 t=0 에서 시작 도법 invert 와 같음', () => {
  const a = makeProjection('robinson', { centerLon: 150, width: 800, height: 500 });
  const b = makeProjection('equalEarth', { centerLon: 150, width: 800, height: 500 });
  const f = interpolateProjection(a, b)(0);
  const ll = f.invert(a([127, 37.5]));
  assert.ok(Math.abs(ll[0] - 127) < 0.01 && Math.abs(ll[1] - 37.5) < 0.01, `${ll}`);
});

test('fitBoundsTransform: 범위를 화면(여백 안)에 꽉 맞추고 가운데에 둠', () => {
  const W = 1000, H = 600, pad = 20;
  const bounds = [[100, 20], [140, 50]];
  for (const k of KEYS) {
    const p = makeProjection(k, { centerLon: 0, width: W, height: H });
    const t = fitBoundsTransform(p, bounds, W, H, pad);
    assert.ok(t.k > 1, `${k} k=${t.k}`);
    const xs = [], ys = [];
    for (let lon = 100; lon <= 140; lon += 2) for (let lat = 20; lat <= 50; lat += 2) {
      const [x, y] = p([lon, lat]); xs.push(t.k * x + t.x); ys.push(t.k * y + t.y);
    }
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    assert.ok(x0 >= pad - 1 && x1 <= W - pad + 1 && y0 >= pad - 1 && y1 <= H - pad + 1, `${k} ${x0},${y0},${x1},${y1}`);
    // 한 축은 여백까지 꽉 참
    assert.ok(Math.abs(x1 - x0 - (W - 2 * pad)) < 2 || Math.abs(y1 - y0 - (H - 2 * pad)) < 2, `${k} 꽉 차지 않음`);
    assert.ok(Math.abs((x0 + x1) / 2 - W / 2) < 2 && Math.abs((y0 + y1) / 2 - H / 2) < 2, `${k} 가운데 아님`);
  }
});

test('fitBoundsTransform: 날짜변경선을 넘는 범위(170°E~170°W)는 좁게 맞춤', () => {
  const W = 1000, H = 600;
  const p = makeProjection('miller', { centerLon: 150, width: W, height: H });
  const t = fitBoundsTransform(p, [[170, 50], [-170, 70]], W, H, 10);
  const [xa] = p([170, 60]), [xb] = p([-170, 60]);
  const sa = t.k * xa + t.x, sb = t.k * xb + t.x;
  assert.ok(t.k > 5, `k=${t.k}`);
  assert.ok(sa > 0 && sa < W && sb > 0 && sb < W && sb > sa, `${sa} ${sb}`);
});

test('fitBoundsTransform: 구드 단속을 걸치는 범위도 화면 안', () => {
  const W = 1000, H = 600;
  const p = makeProjection('goode', { centerLon: 0, width: W, height: H });
  const t = fitBoundsTransform(p, [[-60, -30], [-20, 10]], W, H, 10); // 남반구 단속 −20°W 부근
  for (const ll of [[-60, -30], [-20, -30], [-60, 10], [-20, 10]]) {
    const [x, y] = p(ll), sx = t.k * x + t.x, sy = t.k * y + t.y;
    assert.ok(sx >= 9 && sx <= W - 9 && sy >= 9 && sy <= H - 9, `${ll} → ${sx},${sy}`);
  }
});

test('fitBoundsTransform: k 는 [minK, maxK] 로 제한(기본 1~40)', () => {
  const p = makeProjection('robinson', { centerLon: 0, width: 800, height: 500 });
  assert.equal(fitBoundsTransform(p, [[-180, -90], [180, 90]], 800, 500, 100).k, 1);
  assert.equal(fitBoundsTransform(p, [[127, 37], [127.001, 37.001]], 800, 500, 0).k, 40);
  assert.equal(fitBoundsTransform(p, [[127, 37], [127.001, 37.001]], 800, 500, 0, { maxK: 60 }).k, 60);
});
