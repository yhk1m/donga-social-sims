// tests/atlas/polarGeom.test.mjs — U6-3e 극점을 품은 면(55쪽 북극해 영유권 — 극점이 꼭짓점)·날짜변경선을 넘는 부채꼴·빙붕 테두리 이음매.
//   파이프라인 순수 함수 scripts/atlas/polar_geom.mjs(U6-4 build_layers 가 부름 — u6 전용, 공유 엔진·조각 고침 없음) +
//   앱이 그 자료를 그리는 길(렌더러와 같은 화면 밖 미리 자르기 geoClip.clipIndexed → d3 geoPath)을 밀러·로빈슨·구드·극 중심·지구본에서.
//   극 중심·지구본은 등록 길이라 따로 된 프로세스에서 installAmericasExtras → installPolarExtras.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { register } from 'node:module';
import { geoArea, geoContains, geoPath } from 'd3-geo';
import { feature } from 'topojson-client';
import { REPO, WORK, readJson } from '../../scripts/atlas/geo_util.mjs';
import { installFakeDom } from './helpers/fakeDom.mjs';

register('./helpers/cssHooks.mjs', import.meta.url);
const dom = installFakeDom();
const G = await import('../../scripts/atlas/polar_geom.mjs');
const { PROJECTIONS, makeProjection } = await import('../../src/atlas/projections.js');
const { indexGeometry, clipIndexed, viewRect, boxPolygon } = await import('../../src/atlas/geoClip.js');
const AX = await import('../../src/atlas/americasExtra.js');
const PX = await import('../../src/atlas/polarExtra.js');
AX.installAmericasExtras();
PX.installPolarExtras();
test.after(() => dom.restore());

const W = 1000, H = 800;
const SECTOR_SR = (60 / 360) * 2 * Math.PI * (1 - Math.cos((10 * Math.PI) / 180)); // 0~60°E · 80~90°N 부채꼴 넓이(sr)
const near = (a, b, rel, msg) => assert.ok(Math.abs(a - b) <= Math.abs(b) * rel, `${msg ?? ''} ${a} ≠ ${b}`);
const mp = (polys) => ({ type: 'MultiPolygon', coordinates: polys });
/** 위선 lat 위 경도 a → b 를 1° 마다(교과서 면을 되돌린 꼭짓점처럼 촘촘히 — d3 는 변을 대원으로 그으므로 성기면 위선보다 극 쪽으로 휨) */
const arc = (a, b, lat) => { const n = Math.ceil(Math.abs(b - a)); return Array.from({ length: n + 1 }, (_, i) => [a + ((b - a) * i) / n, lat]); };
// 교과서 면을 fit 으로 되돌린 꼴: 극 「+」 꼭짓점이 극에서 1.3° 떨어진 한 점(55쪽 영유권 — U6-2 88.7°N), 고리 차례는 아무렇게나
const TEXTBOOK = [...arc(0, 60, 80), [3.1, 88.7]];
const CROSS = [...arc(150, 210, 80).map(([x, y]) => [x > 180 ? x - 360 : x, y]), [179, 89.2]]; // 150°E~150°W(경도 ±180 으로 감긴 채)

test('snapPole·expandPole: 극에서 maxDeg 안 꼭짓점 → 극, 극 꼭짓점 하나 → 앞뒤 경도 두 점 [λ, ±90]', () => {
  const s = G.snapPole(TEXTBOOK, 1.5);
  assert.deepEqual(s[61], [3.1, 90]);
  assert.deepEqual(G.snapPole(TEXTBOOK, 1)[61], [3.1, 88.7], '1° 밖이면 그대로');
  const e = G.expandPole(s);
  assert.deepEqual(e.slice(60), [[60, 80], [60, 90], [0, 90]]);
  // 이미 두 점이면(바탕 지도 남극 대륙 꼴) 그대로 — 극 위 변을 늘리지 않음
  assert.deepEqual(G.expandPole([[0, 80], [60, 80], [60, 90], [0, 90]]), [[0, 80], [60, 80], [60, 90], [0, 90]]);
  // 남극
  assert.deepEqual(G.expandPole([[10, -70], [-20, -70], [5, -90]]), [[10, -70], [-20, -70], [-20, -90], [10, -90]]);
});

test('polarPolygon: 부채꼴 0~60°E·80~90°N — 넓이 = 부채꼴(뒤집히지 않음 — 「지구 − 면」 아님), 극 둘레 점 안·바깥 점 밖, 어느 감김으로 와도 같음', () => {
  for (const ring of [TEXTBOOK, [...TEXTBOOK].reverse()]) {
    const polys = G.polarPolygon(ring, { pole: 'N', snapDeg: 1.5 });
    assert.equal(polys.length, 1);
    const g = mp(polys);
    near(geoArea(g), SECTOR_SR, 0.01, '넓이');
    assert.ok(geoArea(g) < 2 * Math.PI);
    for (const p of [[30, 85], [30, 89.99], [1, 80.5], [59, 89]]) assert.ok(geoContains(g, p), `안 ${p}`);
    for (const p of [[90, 85], [-30, 89], [30, 79], [180, 89.5]]) assert.equal(geoContains(g, p), false, `밖 ${p}`);
    const r = polys[0][0];
    assert.deepEqual(r[0], r[r.length - 1], '고리 닫힘');
  }
});

test('polarPolygon: 날짜변경선을 넘는 부채꼴(150°E~150°W — 러시아 영유권 꼴)은 ±180 에서 둘로, 넓이 합 = 부채꼴, 조각마다 [−180, 180] 안', () => {
  const polys = G.polarPolygon(CROSS, { pole: 'N', snapDeg: 1.5 });
  assert.equal(polys.length, 2);
  for (const P of polys) for (const R of P) for (const [x, y] of R) assert.ok(x >= -180 && x <= 180 && y >= -90 && y <= 90, `${x},${y}`);
  near(geoArea(mp(polys)), SECTOR_SR, 0.01);
  for (const p of [[175, 85], [-175, 85], [180, 89.9], [-155, 81]]) assert.ok(geoContains(mp(polys), p), `안 ${p}`);
  assert.equal(geoContains(mp(polys), [0, 85]), false);
  // 남극 — 날짜변경선 건넘 + 극 꼭짓점
  const s = G.polarPolygon([...arc(160, 200, -75).map(([x, y]) => [x > 180 ? x - 360 : x, y]), [178, -89.5]], { pole: 'S', snapDeg: 1 });
  near(geoArea(mp(s)), (40 / 360) * 2 * Math.PI * (1 - Math.cos((15 * Math.PI) / 180)), 0.01);
  assert.ok(geoContains(mp(s), [180, -80]));
});

test('극 꼭짓점을 한 점으로 두면 화면 밖 미리 자르기(경위도 평면)가 면을 세모로 자른다 — 두 점이면 자른 뒤에도 부채꼴 그대로(밀러)', () => {
  const p = makeProjection('miller', { width: W, height: H });
  const rect = [-30, 60, 90, 85]; // 극이 화면 밖인 확대 — 위도 85° 에서 잘림
  const area = (g) => geoPath(p).area(clipIndexed(indexGeometry(g), rect));
  const want = geoPath(p).area(boxPolygon([0, 80, 60, 85], 0.5));
  const good = mp(G.polarPolygon(TEXTBOOK, { pole: 'N', snapDeg: 1.5 }));
  near(area(good), want, 0.02, '두 점');
  const tri = mp([[[...G.snapPole(TEXTBOOK, 1.5), TEXTBOOK[0]].reverse()]]);
  assert.ok(area(tri) < want * 0.9 && area(tri) > want * 0.4, `한 점(세모) ${area(tri)} vs ${want}`);
});

test('그리기: 밀러(0·150)·로빈슨·구드·북극 중심·지구본 어디서나 geoPath 가 비지 않고 화면 넓이가 같은 차수(기준 = 같은 투영의 부채꼴 둘레 위도 띠)', () => {
  const sector = mp(G.polarPolygon(TEXTBOOK, { pole: 'N', snapDeg: 1.5 }));
  const cross = mp(G.polarPolygon(CROSS, { pole: 'N', snapDeg: 1.5 }));
  const cases = [['miller', 0], ['miller', 150], ['robinson', 0], ['goode', 0], ['polarN', 0], ['globe', 0]];
  PROJECTIONS.globe.rot = [-30, -60];
  for (const [key, c] of cases) {
    const p = makeProjection(key, { width: W, height: H, centerLon: c });
    const rect = viewRect(p, W, H);
    for (const [name, g] of [['0~60°E', sector], ['150°E~150°W', cross]]) {
      const d = geoPath(p)(clipIndexed(indexGeometry(g), rect));
      const a = geoPath(p).area(clipIndexed(indexGeometry(g), rect));
      if (key === 'globe' && name !== '0~60°E') continue; // 지구본은 30°E·60°N 가운데 — 날짜변경선 부채꼴은 뒷면 가장자리
      assert.ok(d && d.length > 10, `${key}${c} ${name} 빈 경로`);
      // 같은 투영에서 같은 경도 폭·위도 75~80° 띠와 견줌 — 화면 넓이가 0 이거나 화면 전체(뒤집힘)가 아님
      const band = geoPath(p).area(boxPolygon(name === '0~60°E' ? [0, 75, 60, 80] : [150, 75, 210, 80], 0.5));
      assert.ok(a > band * 0.05 && a < band * 20, `${key}${c} ${name} 넓이 ${a} · 띠 ${band}`);
      assert.ok(a < W * H * 0.5, `${key}${c} ${name} 화면 절반 넘음(뒤집힘)`);
    }
  }
});

test('극 중심 보기: 극점 꼭짓점 면 다섯(영유권 꼴 — 경도 72° 씩)이 극에서 만나 원판 가운데를 빈틈없이 덮음', () => {
  const p = makeProjection('polarN', { width: W, height: H });
  const polys = [];
  for (let i = 0; i < 5; i++) {
    const a = -180 + i * 72, b = a + 72;
    polys.push(...G.polarPolygon([...arc(a, b, 82), [(a + b) / 2, 89]], { pole: 'N', snapDeg: 1.5 }));
  }
  near(geoArea(mp(polys)), 2 * Math.PI * (1 - Math.cos((8 * Math.PI) / 180)), 0.01, '넓이 합 = 82° 북쪽 모자');
  for (const lon of [-179, -100, -36, 0, 36, 108, 179]) assert.ok(polys.some((P) => geoContains(mp([P]), [lon, 89.9])), `극 옆 ${lon}`);
  const c = p([0, 90]);
  assert.ok(Math.abs(c[0] - W / 2) < 1e-6 && Math.abs(c[1] - H / 2) < 1e-6);
  const total = polys.reduce((s, P) => s + geoPath(p).area(mp([P])), 0);
  const cap = geoPath(p).area(boxPolygon([-180, 82, 180, 90], 0.5));
  near(total, cap, 0.02, '화면 넓이 합 = 모자');
});

test('seamFreeOutline: ±180 위 변(Natural Earth 가 쪼갠 자리)과 극 위 변은 빼고 나머지 변만 — 테두리를 그어도 180° 이음매 없음', () => {
  const west = [[[170, -80], [180, -80], [180, -84], [170, -84], [170, -80]]];
  const east = [[[-179.999989, -80], [-170, -80], [-170, -84], [-179.999989, -84], [-179.999989, -80]]];
  const out = G.seamFreeOutline(mp([west, east]));
  assert.equal(out.type, 'MultiLineString');
  const on180 = (q) => Math.abs(Math.abs(q[0]) - 180) < 1e-4;
  for (const L of out.coordinates) for (let i = 1; i < L.length; i++) assert.ok(!(on180(L[i - 1]) && on180(L[i])), `이음매 변 ${L[i - 1]}–${L[i]}`);
  const len = out.coordinates.reduce((s, L) => s + L.length - 1, 0);
  assert.equal(len, 6, '두 조각 × (4변 − 이음매 1) = 6');
  const pole = G.seamFreeOutline(mp(G.polarPolygon(TEXTBOOK, { pole: 'N', snapDeg: 1.5 })));
  for (const L of pole.coordinates) for (let i = 1; i < L.length; i++) assert.ok(!(Math.abs(L[i - 1][1]) === 90 && Math.abs(L[i][1]) === 90), '극 위 변');
});

const SHELVES = path.join(WORK, 'raw/ne-antarctic/ne_10m_antarctic_ice_shelves_polys.geojson');
test('Natural Earth 빙붕(U6-D): 로스 빙붕 두 조각의 180° 변이 테두리에서 빠지고 채움 면은 그대로, 넓이 합이 남극 대륙보다 훨씬 작음', { skip: !existsSync(SHELVES) && '빙붕 자료 없음' }, () => {
  const gj = readJson(SHELVES);
  const ross = gj.features.filter((f) => f.properties.name === 'Ross Ice Shelf');
  const polys = ross.flatMap((f) => (f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates));
  const raw180 = polys.flatMap((P) => P[0]).filter((q) => Math.abs(Math.abs(q[0]) - 180) < 1e-4).length;
  assert.ok(raw180 > 10, '원본은 180° 위 꼭짓점이 있음');
  const out = G.seamFreeOutline(mp(polys));
  const on180 = (q) => Math.abs(Math.abs(q[0]) - 180) < 1e-4;
  for (const L of out.coordinates) for (let i = 1; i < L.length; i++) assert.ok(!(on180(L[i - 1]) && on180(L[i])));
  const a = geoArea(mp(polys));
  assert.ok(a > 0 && a < 0.02, `로스 빙붕 넓이 ${a} sr(약 48만 km² ≈ 0.012)`);
  assert.ok(geoContains(mp(polys), [-175, -81]), '로스 빙붕 (−175°, −81°) 안 — 바탕 지도 육지 밖(계획 Q7)');
});

test('바탕 지도 남극 대륙(극점 포함 면)이 남극 중심에서 원판 가운데를 채움 — 미리 자르기 뒤에도', () => {
  const bmFile = path.join(REPO, 'sims/atlas-u5-americas/data/basemap.json');
  const topo = readJson(bmFile);
  const ata = feature(topo, topo.objects.countries50).features.find((f) => f.properties.iso === 'ATA');
  const p = makeProjection('polarS', { width: W, height: H });
  const g = clipIndexed(indexGeometry(ata.geometry), viewRect(p, W, H));
  assert.ok(geoContains(g, [0, -90]) && geoContains(g, [123, -89.9]));
  const disc = Math.PI * (0.48 * Math.min(W, H)) ** 2; // 반구 원판(POLAR.fill)
  const a = geoPath(p).area(g);
  assert.ok(a > disc * 0.02 && a < disc * 0.1, `남극 대륙 화면 넓이 ${a} — 원판 ${disc}`);
});
