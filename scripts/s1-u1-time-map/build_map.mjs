// 시·도 경계(TopoJSON) + 도시 좌표 + OSRM 결과 → 화면용 자료(sims/s1-u1-time-map/data/map.js, roads.js)
// 경계 원본: scripts/t1-u5-extinction/out/korea.topo.json (vuski/admdongkor 행정동 → 시·도로 합친 단순화본, SGIS 기반)
// 투영(횡메르카토르)·단순화(더글러스-포이커)·작은 섬 걸러내기를 여기서 끝내고, 브라우저는 좌표 배열만 받는다.
// 사용: node scripts/s1-u1-time-map/build_map.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { geoTransverseMercator, geoDistance } from 'd3-geo';
import { feature, mesh } from 'topojson-client';
import { CITIES } from './cities.mjs';

const TOPO = 'scripts/t1-u5-extinction/out/korea.topo.json';
const OSRM = 'C:/Users/Public/sims-work/s1-u1-time-map/osrm_table.json';
const OUT_MAP = 'sims/s1-u1-time-map/data/map.js';
const OUT_ROADS = 'sims/s1-u1-time-map/data/roads.js';
const W = 1000;
const TOL = 0.6;          // 단순화 허용 오차(px)
const MIN_AREA = 6;       // 이보다 작은 섬(px²)은 버림

const topo = JSON.parse(readFileSync(TOPO, 'utf8'));
// 양자화 해제 + 호마다 단순화한 위상 자료를 새로 만든다(이웃 경계가 같은 점을 쓰도록 호 단위로)
const [sx, sy] = topo.transform.scale, [tx, ty] = topo.transform.translate;
const sido = feature(topo, topo.objects.sido);
const projection = geoTransverseMercator().rotate([-127.5, -36]).fitWidth(W, sido);

function dp(pts, tol) {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ax, ay] = pts[a], [bx, by] = pts[b];
    const dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy) || 1e-9;
    let best = -1, bi = -1;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs((pts[i][0] - ax) * dy - (pts[i][1] - ay) * dx) / L;
      if (d > best) { best = d; bi = i; }
    }
    if (best > tol) { keep[bi] = 1; stack.push([a, bi], [bi, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}
const arcs = topo.arcs.map((arc) => {
  let x = 0, y = 0;
  const pts = arc.map(([qx, qy]) => { x += qx; y += qy; return projection([x * sx + tx, y * sy + ty]); });
  return dp(pts, TOL);
});
const ptopo = { ...topo, arcs, transform: undefined };
delete ptopo.transform;

const r1 = (v) => Math.round(v * 10) / 10;
const flat = (pts) => pts.flatMap(([x, y]) => [r1(x), r1(y)]);
const area = (r) => { let a = 0; for (let i = 0; i < r.length; i++) { const [x0, y0] = r[i], [x1, y1] = r[(i + 1) % r.length]; a += x0 * y1 - x1 * y0; } return Math.abs(a / 2); };

// 땅(시·도마다 고리 목록), 해안선, 시·도 경계
const land = [];
let nPts = 0;
for (const f of feature(ptopo, ptopo.objects.sido).features) {
  const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
  const rings = [];
  for (const p of polys) {
    if (area(p[0]) < MIN_AREA) continue;
    for (const ring of p) if (area(ring) >= MIN_AREA) { rings.push(flat(ring)); nPts += ring.length; }
  }
  land.push({ code: f.properties.sido, rings });
}
const lines = (m) => m.coordinates.filter((l) => {
  const xs = l.map((p) => p[0]), ys = l.map((p) => p[1]);
  return Math.max(...xs) - Math.min(...xs) + Math.max(...ys) - Math.min(...ys) > 3; // 작은 섬 둘레는 버림
}).map(flat);
const coast = lines(mesh(ptopo, ptopo.objects.sido, (a, b) => a === b));
const borders = lines(mesh(ptopo, ptopo.objects.sido, (a, b) => a !== b));

const cities = CITIES.map((c) => { const [x, y] = projection([c.lon, c.lat]); return { id: c.id, name: c.name, x: r1(x), y: r1(y), km: Math.round(geoDistance([CITIES[0].lon, CITIES[0].lat], [c.lon, c.lat]) * 6371) }; });
const [xs, ys] = [land.flatMap((l) => l.rings.flatMap((r) => r.filter((_, i) => i % 2 === 0))), land.flatMap((l) => l.rings.flatMap((r) => r.filter((_, i) => i % 2 === 1)))];
const size = [W, Math.ceil(Math.max(...ys) + Math.min(...ys))];
// 1px 이 몇 km 인지(서울~부산 직선 거리로 잼)
const sb = cities.find((c) => c.id === 'busan'), se = cities[0];
const kmPerPx = sb.km / Math.hypot(sb.x - se.x, sb.y - se.y);

const head = '// © 2026 김용현\n// 자동 생성: scripts/s1-u1-time-map/build_map.mjs (손으로 고치지 말 것)\n';
const mapOut = { size, kmPerPx: Math.round(kmPerPx * 10000) / 10000, land, coast, borders, cities };
writeFileSync(OUT_MAP, head + '// 경계: vuski/admdongkor(통계청 SGIS 행정동 경계 기반) 시·도 단순화본, 횡메르카토르 투영 좌표(px)\nexport default ' + JSON.stringify(mapOut) + ';\n');
console.log('land pts', nPts, 'coast', coast.length, 'borders', borders.length, 'size', size, 'kmPerPx', kmPerPx.toFixed(3), 'bytes', JSON.stringify(mapOut).length, 'x range', Math.min(...xs), Math.max(...xs));

const osrm = JSON.parse(readFileSync(OSRM, 'utf8'));
const roads = Object.fromEntries(osrm.rows.filter((r) => r.id !== 'seoul').map((r) => [r.id, { min: Math.round(r.durationS / 60), km: Math.round(r.distanceM / 1000) }]));
writeFileSync(OUT_ROADS, head + `// 서울시청 → 각 도시 자동차 경로(OSRM 공개 시험 서버, OpenStreetMap 도로망, 막힘 없는 상태). 받은 날: ${osrm.fetched.slice(0, 10)}\n// min = 경로 시간(분), km = 도로 거리. 제주·서귀포 값은 배(카페리) 구간이 섞인 값이라 화면에서 쓰지 않는다.\nexport default ${JSON.stringify(roads)};\n`);
console.log('roads', roads);
