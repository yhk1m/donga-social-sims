// © 2026 김용현
// 시군구 경계(TopoJSON) + 소멸위험지수(JSON) → 화면용 자료 하나(sims/t1-u5-extinction/data/extinction.json)
// 투영·경로 문자열·중심점·모핑용 외곽 고리·육각 돌링 위치를 모두 미리 계산해 둔다(브라우저는 d3 없이 그리기만).
// 사용: node build_map.mjs out/korea.topo.json pop_202609.json ../../sims/t1-u5-extinction/data/extinction.json
import { readFileSync, writeFileSync } from 'node:fs';
import { geoTransverseMercator, geoPath } from 'd3-geo';
import { feature, mesh } from 'topojson-client';
import { forceSimulation, forceX, forceY, forceCollide } from 'd3-force';

const [topoPath, popPath, outPath] = process.argv.slice(2);
const topo = JSON.parse(readFileSync(topoPath, 'utf8'));
const pop = JSON.parse(readFileSync(popPath, 'utf8'));

const W = 1000;
const REF = 1.5;            // 이 지수 이상이면 원래 크기
const N = 48;               // 모핑 고리 점 개수(육각형 한 변에 8점)
const r1 = (v) => Math.round(v * 10) / 10;

const sgg = feature(topo, topo.objects.sgg);
const projection = geoTransverseMercator().rotate([-127.5, -36]).fitWidth(W, sgg);
const path = geoPath(projection);
const [[x0, y0], [x1, y1]] = path.bounds(sgg);
const H = Math.ceil(y1 + y0);   // fitWidth 는 위쪽 여백 y0 를 둔다 → 아래도 같은 여백

const byCode = new Map(pop.items.map((d) => [d.code, d]));
if (byCode.size !== sgg.features.length) throw new Error(`count mismatch ${byCode.size} vs ${sgg.features.length}`);

// 경로 문자열의 소수 자리 줄이기
const shortD = (d) => d.replace(/-?\d+\.\d+/g, (m) => String(r1(+m)));

function ringArea(r) { let a = 0; for (let i = 0, n = r.length; i < n; i++) { const [xa, ya] = r[i], [xb, yb] = r[(i + 1) % n]; a += xa * yb - xb * ya; } return a / 2; }

// 가장 큰 조각의 바깥 고리(투영 좌표), 화면 기준 시계 방향
function mainRing(f) {
  const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
  let best = null, bestA = -1;
  for (const p of polys) {
    const ring = p[0].map((c) => projection(c));
    const a = Math.abs(ringArea(ring));
    if (a > bestA) { bestA = a; best = ring; }
  }
  if (ringArea(best) < 0) best.reverse();          // 화면 좌표(y 아래)에서 양수 = 시계 방향
  if (best.length > 1 && best[0][0] === best.at(-1)[0] && best[0][1] === best.at(-1)[1]) best.pop();
  return best;
}

// 둘레 길이로 N 등분 재표본, 중심에서 위쪽(-90°)에 가장 가까운 점부터 시작
function resample(ring, cx, cy) {
  const n = ring.length, seg = [];
  let L = 0;
  for (let i = 0; i < n; i++) { const a = ring[i], b = ring[(i + 1) % n]; const l = Math.hypot(b[0] - a[0], b[1] - a[1]); seg.push(l); L += l; }
  const pts = [];
  let i = 0, acc = 0;
  for (let k = 0; k < N; k++) {
    const target = (k / N) * L;
    while (acc + seg[i] < target && i < n - 1) { acc += seg[i]; i++; }
    const a = ring[i], b = ring[(i + 1) % n], t = seg[i] ? (target - acc) / seg[i] : 0;
    pts.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
  }
  let s = 0, bestScore = Infinity;
  pts.forEach(([x, y], k) => {
    const ang = Math.atan2(y - cy, x - cx);
    const d = Math.abs(Math.atan2(Math.sin(ang + Math.PI / 2), Math.cos(ang + Math.PI / 2)));
    if (d < bestScore) { bestScore = d; s = k; }
  });
  return pts.slice(s).concat(pts.slice(0, s));
}

const items = sgg.features.map((f) => {
  const d = byCode.get(f.properties.code);
  const [cx, cy] = path.centroid(f);
  const area = path.area(f);
  const factor = Math.min(d.index / REF, 1);
  const ring = resample(mainRing(f), cx, cy);
  return { ...d, factor, cx, cy, area, ring, d: shortD(path(f)) };
});

// 육각 돌링: 면적 = factor × (지수 1.5 이상일 때의 최대 육각형 면적). R 은 외접원 반지름.
// 최대 육각형 크기는 전체 육각형 면적 합이 국토 면적의 일정 비율이 되도록 정한다.
const landArea = items.reduce((s, d) => s + d.area, 0);
const hexUnit = (3 * Math.sqrt(3)) / 2;   // R=1 정육각형 면적
const sumF = items.reduce((s, d) => s + d.factor, 0);
const RMAX = Math.sqrt((0.55 * landArea) / (hexUnit * sumF));
const nodes = items.map((d, i) => ({ i, x: d.cx, y: d.cy, tx: d.cx, ty: d.cy, R: RMAX * Math.sqrt(d.factor) }));
const sim = forceSimulation(nodes)
  .randomSource(() => 0.5)
  .force('x', forceX((n) => n.tx).strength(0.08))
  .force('y', forceY((n) => n.ty).strength(0.08))
  .force('collide', forceCollide((n) => n.R + 0.8).strength(1).iterations(6))
  .stop();
for (let k = 0; k < 600; k++) sim.tick();
// 마지막으로 겹침 확인(원 기준) 후 남은 겹침은 밀어 내기
for (let pass = 0; pass < 200; pass++) {
  let moved = false;
  for (let a = 0; a < nodes.length; a++) for (let b = a + 1; b < nodes.length; b++) {
    const A = nodes[a], B = nodes[b];
    const dx = B.x - A.x, dy = B.y - A.y, dist = Math.hypot(dx, dy) || 1e-6, need = A.R + B.R + 0.8;
    if (dist < need) { const push = (need - dist) / 2 + 0.01; A.x -= (dx / dist) * push; A.y -= (dy / dist) * push; B.x += (dx / dist) * push; B.y += (dy / dist) * push; moved = true; }
  }
  if (!moved) break;
}

// 정육각형(꼭짓점 위) 고리, 위 꼭짓점부터 시계 방향, 한 변에 N/6 점
function hexRing(x, y, R) {
  const per = N / 6, pts = [];
  const v = (k) => { const a = -Math.PI / 2 + (k * Math.PI) / 3; return [x + R * Math.cos(a), y + R * Math.sin(a)]; };
  for (let k = 0; k < 6; k++) { const a = v(k), b = v(k + 1); for (let j = 0; j < per; j++) { const t = j / per; pts.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); } }
  return pts;
}

let bx0 = 0, by0 = 0, bx1 = W, by1 = H;
nodes.forEach((n) => { bx0 = Math.min(bx0, n.x - n.R); by0 = Math.min(by0, n.y - n.R); bx1 = Math.max(bx1, n.x + n.R); by1 = Math.max(by1, n.y + n.R); });

const flat = (pts) => pts.flatMap(([x, y]) => [r1(x), r1(y)]);
const regions = items.map((d, i) => ({
  code: d.code, sido: d.sido, name: d.name, pop: d.pop, f2039: d.f2039, o65: d.o65,
  index: d.index, cls: d.cls, factor: Math.round(d.factor * 10000) / 10000,
  cx: r1(d.cx), cy: r1(d.cy), d: d.d,
  ring: flat(d.ring),
  hex: [r1(nodes[i].x), r1(nodes[i].y), Math.round(nodes[i].R * 100) / 100],
}));
// 육각형 고리는 브라우저에서 hex[x,y,R] 로 다시 만든다(같은 규칙). 확인용으로 함수 내보내기 없이 규칙만 맞춘다.
void hexRing;

const sidoMesh = shortD(path(mesh(topo, topo.objects.sido, (a, b) => a !== b)));
const outline = shortD(path(mesh(topo, topo.objects.sido, (a, b) => a === b)));

const out = {
  month: pop.month,
  ref: REF,
  size: [W, H],
  extent: [r1(bx0), r1(by0), r1(bx1), r1(by1)],
  sidoIndex: pop.sido,
  sidoMesh, outline,
  regions,
};
writeFileSync(outPath, JSON.stringify(out));
console.log('regions', regions.length, 'H', H, 'RMAX', RMAX.toFixed(2), 'extent', out.extent, 'bytes', JSON.stringify(out).length);
