// tests/atlas/polarExtra.test.mjs — U6-3b 극 중심 보기(registerProjection 'polarN'·'polarS')·보기 도구 viewTools.
// 따로 된 프로세스(node --test)라 등록 전(모르는 도법)을 본 뒤 installAmericasExtras() → installPolarExtras() 로 등록한다.
// 렌더러는 가짜 DOM(helpers/fakeDom.mjs)으로 상태·이벤트만 본다(그림은 헤드리스 Chrome 확인 그림 — 계획 「실행 중 결정」 U6-3b).
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { register } from 'node:module';
import { geoPath, geoContains, geoDistance } from 'd3-geo';
import { feature } from 'topojson-client';
import { REPO, readJson } from '../../scripts/atlas/geo_util.mjs';
import { installFakeDom } from './helpers/fakeDom.mjs';

register('./helpers/cssHooks.mjs', import.meta.url);
const dom = installFakeDom();
const { PROJECTIONS, makeProjection, fitBoundsTransform } = await import('../../src/atlas/projections.js');
const { viewProjection, kmPerPx, EARTH_KM, invertChecked } = await import('../../src/atlas/mapView.js');
const { viewRect } = await import('../../src/atlas/geoClip.js');
const { invertGrid } = await import('../../src/atlas/relief.js');
const { scaleBarSpec } = await import('../../src/atlas/uiCore.js');
const { createMap } = await import('../../src/atlas/renderer.js');
const { mapTools } = await import('../../src/atlas/ui.js');
const AX = await import('../../src/atlas/americasExtra.js');
const PX = await import('../../src/atlas/polarExtra.js');
const basemap = readJson(path.join(REPO, 'sims/atlas-u5-americas/data/basemap.json'));
test.after(() => dom.restore());

const near = (a, b, eps, msg) => assert.ok(Math.abs(a - b) <= eps, `${msg ?? ''} ${a} ≠ ${b}`);
const tick = () => new Promise((r) => setTimeout(r, 0));
/** 화면 점 q 가 가운데 c 에서 본 방향(°, 0 = 위, 90 = 오른쪽) */
const bearing = (c, q) => (Math.atan2(q[0] - c[0], c[1] - q[1]) * 180) / Math.PI;

test('등록 전: 극 중심은 모르는 도법, 도법 5개', () => {
  assert.deepEqual(Object.keys(PROJECTIONS), ['miller', 'mercator', 'robinson', 'goode', 'equalEarth']);
  assert.throws(() => makeProjection('polarN', { width: 800, height: 600 }), /모르는 도법/);
  assert.throws(() => makeProjection('polarS', { width: 800, height: 600 }), /모르는 도법/);
});

test('등록 뒤: 옵션 차례 평면 5 + 지구본 + 극 둘, 라벨, 두 번 불러도 같음', () => {
  AX.installAmericasExtras();
  PX.installPolarExtras();
  PX.installPolarExtras();
  assert.deepEqual(Object.keys(PROJECTIONS), ['miller', 'mercator', 'robinson', 'goode', 'equalEarth', 'globe', 'polarN', 'polarS']);
  assert.equal(PROJECTIONS.polarN.label, '북극 중심');
  assert.equal(PROJECTIONS.polarS.label, '남극 중심');
  assert.equal(PROJECTIONS.polarN.pan, undefined, '끌기 = 옮기기(회전 고정)');
  assert.equal(PX.specialView('polarS'), true); assert.equal(PX.specialView('globe'), true); assert.equal(PX.specialView('miller'), false);
});

test('북극 중심: 극점 = 무대 가운데, 반구 원판 반지름 = 짧은 변 × 0.48, 위쪽 경선(서경 90° — 50쪽)·0° 왼쪽, 남반구 hidden·geoPath 없음', () => {
  const def = PROJECTIONS.polarN;
  def.up = -90;
  const p = makeProjection('polarN', { width: 1000, height: 800 });
  assert.equal(p.key, 'polarN');
  const c = p([0, 90]);
  near(c[0], 500, 1e-9); near(c[1], 400, 1e-9);
  const eq = p([-90, 0]);
  near(Math.hypot(eq[0] - 500, eq[1] - 400), 384, 1e-6, '적도 = 원판 가장자리(800 × 0.48)');
  near(bearing(c, p([-90, 60])), 0, 1e-6, '서경 90° = 위');
  near(Math.abs(bearing(c, p([0, 60]))), 90, 1e-6); assert.ok(p([0, 60])[0] < 500, '0° = 왼쪽');
  near(bearing(c, p([90, 60])), 180, 1e-6, '동경 90° = 아래(러시아 쪽)');
  assert.equal(p.hidden([10, -5]), true); assert.equal(p.hidden([10, 0]), false); assert.equal(p.hidden([10, 45]), false);
  assert.equal(geoPath(p)({ type: 'Point', coordinates: [10, -5] }), null, '남반구 점은 그려지지 않음');
  assert.equal(p.step(1), 10); assert.equal(p.step(3), 10); assert.equal(p.step(10), 5);
  // 55쪽 영유권 = 180° 위(알래스카·베링 쪽)
  def.up = 180;
  const q = makeProjection('polarN', { width: 1000, height: 800 });
  near(Math.abs(bearing([500, 400], q([180, 70]))), 0, 1e-6, '180° = 위');
  def.up = -90;
});

test('남극 중심: 서경 90° 위(51쪽·55쪽 기지 — 남극반도 위)·0° 오른쪽, 북반구 hidden, 극점 가운데', () => {
  const p = makeProjection('polarS', { width: 900, height: 700 });
  const c = p([0, -90]);
  near(c[0], 450, 1e-9); near(c[1], 350, 1e-9);
  near(bearing(c, p([-90, -60])), 0, 1e-6, '서경 90° = 위');
  near(bearing(c, p([0, -60])), 90, 1e-6, '0° = 오른쪽');
  assert.ok(p([180, -70])[0] < 450, '180° = 왼쪽');
  near(bearing(c, p([-58.8, -62.2])), 31.2, 0.01, '세종 기지(58.8°W) = 위에서 시계 방향 31°');
  assert.equal(p.hidden([0, 1]), true);
});

test('확대 화면 투영: 회전·자르기·hidden·invert(반구 밖 null) 그대로, 역투영 격자는 원판 밖 NaN', () => {
  const base = makeProjection('polarS', { width: 800, height: 600 });
  const v = viewProjection(base, { k: 2, x: -400, y: -300 }, { width: 800, height: 600 });
  const c = v([0, -90]);
  near(c[0], 400, 1e-9); near(c[1], 300, 1e-9);
  assert.equal(v.clipAngle(), 90);
  assert.equal(v.hidden([0, 10]), true);
  // 반구 밖(원판 밖) 화면 점: 정거 방위 역투영은 값을 내지만 invert 는 null → invertChecked null
  const pv = makeProjection('polarN', { width: 400, height: 300 });
  const raw = pv([0, -30]);
  assert.ok(raw && Number.isFinite(raw[0]), '투영식 자체는 반구 밖도 값');
  assert.equal(pv.invert(raw), null, 'invert = null');
  assert.equal(invertChecked(pv, raw), null);
  assert.ok(invertChecked(pv, [200, 150]), '가운데 = 극');
  near(invertChecked(pv, [200, 150])[1], 90, 1e-6);
  const g = invertGrid((xy) => pv.invert(xy), 400, 300, { step: 2, forward: (ll) => pv(ll) });
  const at = (x, y) => g.lon[Math.floor(y / 2) * g.cols + Math.floor(x / 2)];
  const atLat = (x, y) => g.lat[Math.floor(y / 2) * g.cols + Math.floor(x / 2)];
  assert.ok(Number.isNaN(at(1, 1)) && Number.isNaN(at(398, 298)) && Number.isNaN(at(10, 150)), '원판 밖(모서리·왼쪽 끝) NaN');
  assert.ok(atLat(200, 150) > 89, '원판 가운데 = 극 둘레');
  assert.ok(atLat(201, 151) > 89 && Number.isFinite(at(201, 151)), '극 바로 옆도 값(경도가 빠르게 바뀌는 곳)');
  assert.ok(g.skipped > 0);
});

test('극 범위 맞춤: fitBoundsTransform([−180, 60] ~ [180, 90]) = 위도 60° 원이 무대 안·극이 가운데, 날짜변경선 건넌 범위도', () => {
  const W = 1000, H = 800;
  const base = makeProjection('polarN', { width: W, height: H });
  const t = fitBoundsTransform(base, [[-180, 60], [180, 90]], W, H, 24);
  const v = viewProjection(base, t, { width: W, height: H });
  const c = v([0, 90]);
  near(c[0], W / 2, 0.5); near(c[1], H / 2, 0.5);
  let maxR = 0;
  for (let lon = -180; lon < 180; lon += 5) { const q = v([lon, 60]); maxR = Math.max(maxR, Math.hypot(q[0] - c[0], q[1] - c[1])); }
  near(maxR, H / 2 - 24, 1.5, '60° 원 = 짧은 변 − 여백');
  near(t.k, (H - 48) / (2 * (H * 0.48) / 3), 1e-6, '90° 원판 → 30° 원판(여백 뺀 짧은 변)');
  // 50쪽 틀 되돌린 범위 꼴(경도 한 바퀴 · 25°N 위)도 원판 안
  const t2 = fitBoundsTransform(base, [[-180, 25], [180, 90]], W, H, 24);
  assert.ok(t2.k > 1 && t2.k < 1.5);
});

test('축척 막대: 극(정거 방위) — 화면 가운데 가로 1px = EARTH_KM / 배율, 반지름 방향은 어디서나 실제, 막대 글자 생김', () => {
  const W = 1000, H = 800;
  const base = makeProjection('polarS', { width: W, height: H });
  const v = viewProjection(base, { k: 2, x: -W / 2, y: -H / 2 }, { width: W, height: H });
  const km = kmPerPx(v, [W / 2, H / 2]);
  near(km / (EARTH_KM / v.scale()), 1, 1e-3, '극에서 모든 방향 실제');
  // 극에서 오른쪽(0° 경선 방향 — 반지름 방향)으로 200px 떨어진 곳: 가로 = 반지름 방향 → 실제
  const km2 = kmPerPx(v, [W / 2 + 200, H / 2]);
  near(km2 / (EARTH_KM / v.scale()), 1, 2e-3);
  const sp = scaleBarSpec(km, { maxPx: 110 });
  assert.ok(sp && sp.px > 0 && /km/.test(sp.label));
});

test('화면 밖 미리 자르기(viewRect): 극이 화면에 있으면 경도 한 바퀴·위도는 극까지, 극이 화면 밖이면 좁은 상자', () => {
  const W = 1000, H = 800;
  const base = makeProjection('polarN', { width: W, height: H });
  const r = viewRect(viewProjection(base, { k: 4, x: -1.5 * W, y: -1.5 * H }, { width: W, height: H }), W, H);
  assert.equal(r[0] - (r[2] - 360), 0, '경도 한 바퀴'); // [w + c, …, e + c] — 폭 360
  assert.equal(r[3], 90, '북극까지');
  assert.ok(r[1] > 40 && r[1] < 70, `남쪽 한계 ${r[1]}`);
  // 극에서 먼 곳(서경 90°·50°N 근처 — 화면 위쪽 가장자리 쪽)을 가운데로 확대: 극이 화면 밖
  const q = base([-90, 45]);
  const k = 6, t = { k, x: W / 2 - k * q[0], y: H / 2 - k * q[1] };
  const r2 = viewRect(viewProjection(base, t, { width: W, height: H }), W, H);
  assert.ok(r2 && r2[3] < 90 && r2[2] - r2[0] < 120, `좁은 상자 ${r2}`);
});

test('극점을 품은 면: 바탕 지도 남극 대륙(ATA)이 남극 중심 원판 가운데를 채우고(뒤집히지 않음), 극점 꼭짓점 부채꼴도 작은 넓이', () => {
  const W = 800, H = 800;
  const base = makeProjection('polarS', { width: W, height: H });
  const ata = feature(basemap, basemap.objects.countries50).features.find((f) => f.properties?.iso === 'ATA' || f.id === 'ATA' || f.properties?.ko === '남극 대륙');
  assert.ok(ata, '남극 대륙 도형');
  assert.ok(geoContains(ata, [0, -90]), '극점 포함');
  const gp = geoPath(base);
  const R = W * 0.48;
  const a = gp.area(ata);
  assert.ok(a > 0.03 * Math.PI * R * R && a < 0.1 * Math.PI * R * R, `원판 안 작은 몫(지구 전체 − 면이 아님) ${a}`);
  const [[x0, y0], [x1, y1]] = gp.bounds(ata);
  assert.ok(x0 < W / 2 && x1 > W / 2 && y0 < H / 2 && y1 > H / 2, '원판 가운데를 감쌈');
  // 북극 중심에서는 남극 대륙이 보이지 않음(반구 자르기)
  assert.ok(!(geoPath(makeProjection('polarN', { width: W, height: H })).area(ata) > 1), '북극 중심 = 안 그림');
  // 극점 꼭짓점 부채꼴(55쪽 영유권 꼴 — 0~60°E · 80~90°N, d3 시계 방향)
  const sector = { type: 'Polygon', coordinates: [[[0, 80], [0, 90], [60, 90], [60, 80], [30, 80], [0, 80]]] };
  const bn = makeProjection('polarN', { width: W, height: H });
  const sa = geoPath(bn).area(sector);
  const r10 = (10 / 90) * R;
  near(sa / ((Math.PI * r10 * r10) / 6), 1, 0.05, '극 중심 = 60° 부채꼴 넓이');
  assert.ok(geoContains(sector, [30, 89.5]) && !geoContains(sector, [120, 89.5]));
});

function setupMap({ w = 1000, h = 800 } = {}) {
  const stage = document.createElement('div');
  stage._rect = { left: 0, top: 0, width: w, height: h };
  const map = createMap(stage, { basemap, places: [] });
  const svg = stage.childNodes.find((n) => n.classList.contains('at-overlay'));
  svg._rect = stage._rect;
  dom.flushRaf();
  return { stage, map, svg };
}

test('렌더러 polarView: 밀러 → 북극 중심(보간 없음·극 가운데·확대 1·남반구 null·원판 밖 invert null) · 끌기 = 옮기기(회전 고정) · 되돌리기 = 앞 보기·앞 up', async () => {
  const { map, svg } = setupMap();
  map.flyTo({ center: [150, -20], zoom: 3 }, 0);
  const before = map.view, c0 = before.center;
  const def = PROJECTIONS.polarN;
  def.up = -90;
  const restore = PX.polarView(map, { projection: 'polarN', up: 180 });
  let v = map.view;
  assert.equal(v.key, 'polarN');
  assert.equal(v.moving, false, '보간 없이');
  near(v.k, 1, 1e-9);
  const cp = map.project([0, 90]);
  near(cp[0], 500, 0.5); near(cp[1], 400, 0.5);
  near(Math.abs(bearing(cp, map.project([180, 70]))), 0, 1e-6, 'up 180 = 위');
  assert.equal(map.project([150, -20]), null, '남반구 = null');
  assert.equal(map.invert([2, 2]), null, '원판 밖 = null');
  near(map.view.kmPerPx, EARTH_KM / map.view.projection.scale(), 1e-3, '축척 = 실제');
  // 끌기 100px → 옮기기(x 변환이 바뀜), up 그대로
  const p = (type, x, extra = {}) => svg.dispatch(type, { pointerId: 1, pointerType: 'mouse', button: 0, buttons: 1, clientX: x, clientY: 400, ...extra });
  map.flyTo({ center: [0, 90], zoom: 2 }, 0);
  const x0 = map.view.x;
  p('pointerdown', 400); p('pointermove', 450); p('pointermove', 500); p('pointerup', 500, { buttons: 0 });
  near(map.view.x - x0, 100, 1e-6, '옮기기'); assert.equal(def.up, 180, '회전 고정');
  restore();
  v = map.view;
  assert.equal(v.key, 'miller'); assert.equal(def.up, -90, '앞 up');
  near(v.k, 3, 1e-9); near(v.center[0], c0[0], 1e-6); near(v.center[1], c0[1], 1e-6);
  restore(); // 두 번 불러도 한 번만
  assert.equal(map.view.key, 'miller');
  // 그사이 사용자가 바꿨으면 도법은 그대로(up 만 되돌림)
  const r2 = PX.polarView(map, { projection: 'polarS', up: 0 });
  assert.equal(map.view.key, 'polarS');
  map.setProjection('robinson');
  r2();
  assert.equal(map.view.key, 'robinson'); assert.equal(PROJECTIONS.polarS.up, -90);
  // 이미 그 극 중심이면 up 만 바꾸고(기준 투영 다시) 되돌림도 up 만
  map.setProjection('polarS', { animate: false });
  const id0 = map.view.baseId;
  const r3 = PX.polarView(map, { projection: 'polarS', up: 0 });
  assert.ok(map.view.baseId > id0);
  near(bearing(map.project([0, -90]), map.project([0, -60])), 0, 1e-6, '0° 위');
  r3();
  assert.equal(map.view.key, 'polarS');
  near(bearing(map.project([0, -90]), map.project([-90, -60])), 0, 1e-6, '되돌림 = 서경 90° 위');
  map.destroy();
  await tick();
});

const walk = (n, ok, out = []) => { if (ok(n)) out.push(n); for (const c of n.childNodes || []) walk(c, ok, out); return out; };
test('도법 고르기 상자 옵션 8 + viewTools: 밀러 → 북극 중심 → 지구본 → 밀러 = 앞 밀러 보기, 중심 경도 단추 숨김/보임, 세계 전체 보기 = 반구·처음 회전, 코드가 바꾼 것은 손대지 않음', async () => {
  const { stage, map } = setupMap();
  const tools = mapTools(stage, map);
  const sel = walk(tools.el, (n) => n.tagName === 'select')[0];
  const opts = walk(sel, (n) => n.tagName === 'option');
  assert.deepEqual(opts.map((o) => o.getAttribute('value')), ['miller', 'mercator', 'robinson', 'goode', 'equalEarth', 'globe', 'polarN', 'polarS']);
  assert.deepEqual(opts.slice(5).map((o) => o.textContent), ['지구본', '북극 중심', '남극 중심']);
  const centerSeg = walk(tools.el, (n) => n.getAttribute?.('aria-label') === '중심 경도')[0];
  const wholeBtn = walk(tools.el, (n) => n.getAttribute?.('aria-label') === '세계 전체 보기')[0];
  // 가짜 DOM 에 없는 것: querySelector(속성 일치)·closest
  tools.el.querySelector = (q) => (q.includes('중심 경도') ? centerSeg : q.includes('도법') ? sel : null);
  wholeBtn.closest = (q) => (q.includes('세계 전체 보기') ? wholeBtn : null);
  const off = PX.viewTools(map, tools.el);
  const pick = (k) => { sel.value = k; sel.dispatch('change'); };
  map.flyTo({ center: [100, 30], zoom: 4 }, 0);
  pick('polarN');
  assert.equal(map.view.key, 'polarN'); assert.equal(sel.value, 'polarN');
  assert.equal(centerSeg.hidden, true, '극 → 중심 경도 숨김');
  await tick();
  near(map.view.k, 1, 1e-9, '반구 전체');
  let cp = map.project([0, 90]); near(cp[0], 500, 0.5); near(cp[1], 400, 0.5);
  // 끌어 옮긴 뒤 세계 전체 보기 = 반구 전체
  map.flyTo({ center: [-90, 70], zoom: 3 }, 0);
  const ev = tools.el.dispatch('click', { target: wholeBtn });
  assert.equal(ev._stop && ev.defaultPrevented, true, '극에서는 도구의 세계 전체 보기 대신');
  map.flyTo({ center: [0, 90], zoom: 1 }, 0); // (500ms 날아가기 대신 끝 상태 확인은 위에서)
  // 극 → 지구본(직접): 원판 가운데 = 마지막 평면 보기 가운데(100°E, 30°N)
  pick('globe');
  assert.equal(map.view.key, 'globe'); assert.equal(centerSeg.hidden, true);
  await tick();
  assert.deepEqual(AX.globeCenter(PROJECTIONS.globe.rot).map((x) => Math.round(x * 1e6) / 1e6), [100, 30]);
  const home = PROJECTIONS.globe.rot.slice();
  PROJECTIONS.globe.rot = [0, 0]; map.rebase();
  assert.equal(stage.dispatch('keydown', { key: '0', target: stage })._stop, true, '0 키 = 지구본 처음 회전');
  assert.deepEqual(PROJECTIONS.globe.rot, home);
  // 지구본 → 밀러: 앞 밀러 보기 그대로(극·지구본을 거쳐도)
  pick('miller');
  assert.equal(centerSeg.hidden, false);
  await tick();
  near(map.view.k, 4, 1e-9); near(map.view.center[0], 100, 1e-6); near(map.view.center[1], 30, 1e-6);
  assert.equal(tools.el.dispatch('click', { target: wholeBtn })._stop, false, '평면에서는 도구 그대로');
  // 남극 중심 → 밀러
  pick('polarS'); await tick();
  cp = map.project([0, -90]); near(cp[0], 500, 0.5); near(cp[1], 400, 0.5);
  pick('miller'); await tick();
  near(map.view.k, 4, 1e-9); near(map.view.center[0], 100, 1e-6);
  // 코드가 바꾼 것(polarView·globeView): 상자·단추만 따라가고 viewTools 는 보기를 움직이지 않음 → 되돌리기 한 번
  map.flyTo({ center: [-60, 10], zoom: 2 }, 0);
  const r = PX.polarView(map, { projection: 'polarS', up: -90 });
  assert.equal(sel.value, 'polarS'); assert.equal(centerSeg.hidden, true);
  map.fitBounds([-180, -90, 180, -50], { ms: 0 }); // 주제가 묶음 범위로
  await tick();
  const kFit = map.view.k;
  assert.ok(kFit > 1.5, `묶음 범위 그대로 ${kFit}`);
  r();
  assert.equal(map.view.key, 'miller'); assert.equal(sel.value, 'miller'); assert.equal(centerSeg.hidden, false);
  await tick();
  near(map.view.k, 2, 1e-9); near(map.view.center[0], -60, 1e-6);
  const rg = AX.globeView(map, { rotate: [30, -20] });
  assert.equal(sel.value, 'globe');
  await tick();
  near(AX.globeCenter(PROJECTIONS.globe.rot)[0], -30, 1e-9, 'globeView 회전 그대로(viewTools 가 앞 평면 가운데로 바꾸지 않음)');
  rg();
  await tick();
  assert.equal(map.view.key, 'miller'); near(map.view.k, 2, 1e-9);
  off(); tools.destroy();
  assert.equal(sel.listenerCount, 1, '풀기 — 상자 자신의 change 만 남음');
  map.destroy();
  await tick();
});
