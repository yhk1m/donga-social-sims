// scripts/atlas/hub_world.mjs — 「사회과부도 모음」 통합 세계 지도 자료 src/atlas/hubWorld.json 을 만든다(손으로 한 번, 결과 커밋).
//   설계: notes/specs/2026-11-02-atlas-world-index-design.md
//   world-atlas countries-110m → 나라마다 단원(scripts/atlas/hub_world_units.json, 나눔 나라 = {split: 경도, west, east} — 러시아 60°E · 프랑스 −30°)
//   → 단원별 합침(topojson merge) → 로빈슨 중심 150°E 폭 1000 투영 → 소수 1자리 SVG 경로.
//   바다 전체 = u1(구 둘레 경로), 북극해 = 66.5°N 위 원(u6, 육지 밑에 그림), 나라 경계 = 옅은 선 하나(mesh).
//   단원표에 없는 나라가 있으면 실패한다.
//   쓰기: node scripts/atlas/hub_world.mjs        시험: tests/atlas/hubWorld.test.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { geoPath, geoCircle } from 'd3-geo';
import { geoRobinson } from 'd3-geo-projection';
import { feature, merge, mesh } from 'topojson-client';

const ROOT = resolve(import.meta.dirname, '..', '..');
export const HUB_WORLD = join(ROOT, 'src', 'atlas', 'hubWorld.json');
export const URAL_LON = 60;
export const WIDTH = 1000;
/** 단원 이름표 자리 [경도, 위도] */
export const LABELS = {
  u1: [-170, 8], u2: [95, 48], u3: [22, 50], u4: [20, 4], u5: [-100, 42], u6: [134, -25],
};
const UNITS = ['u2', 'u3', 'u4', 'u5', 'u6'];

/** 다각형 고리 하나를 경도 반평면으로 자름(Sutherland–Hodgman, 경위도 평면 — 자르는 변은 자오선이라 구면에서도 그대로) */
export function clipRing(ring, lon, keepWest) {
  const inside = (p) => (keepWest ? p[0] < lon : p[0] >= lon);
  const cross = (a, b) => { const t = (lon - a[0]) / (b[0] - a[0]); return [lon, a[1] + t * (b[1] - a[1])]; };
  const pts = ring.slice(0, -1);
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const cur = pts[i], prev = pts[(i + pts.length - 1) % pts.length];
    if (inside(cur)) { if (!inside(prev)) out.push(cross(prev, cur)); out.push(cur); }
    else if (inside(prev)) out.push(cross(prev, cur));
  }
  if (out.length < 3) return null;
  out.push(out[0]);
  return out;
}

/** 정수 경로 다듬기: 같은 점 되풀이(L) 지우고, 점 2개 이하로 줄어든 닫힌 조각(크기 1px 미만 섬)은 버림 */
export function compactPath(d) {
  if (!d) return '';
  const out = [];
  for (const sub of d.split(/(?=M)/)) {
    const closed = sub.endsWith('Z');
    const pts = sub.replace(/Z$/, '').split(/[ML]/).filter(Boolean);
    const kept = pts.filter((p, i) => i === 0 || p !== pts[i - 1]);
    if (closed && kept.length < 3) continue;
    out.push(`M${kept.join('L')}${closed ? 'Z' : ''}`);
  }
  return out.join('');
}

/** (Multi)Polygon 지오메트리 → 서/동 반쪽 MultiPolygon */
export function splitAtLon(geom, lon) {
  // 날짜 변경선을 넘는 점(러시아 추코트카 −170°대)은 +360 으로 펴서 평면 자르기가 한 줄로 되게 함(d3 는 경도를 감아 그림)
  const unwrap = (r) => r.map(([x, y]) => [x < lon - 180 ? x + 360 : x, y]);
  const polys = (geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates).map((poly) => poly.map(unwrap));
  const half = (keepWest) => ({
    type: 'MultiPolygon',
    coordinates: polys.map((poly) => poly.map((r) => clipRing(r, lon, keepWest)).filter(Boolean)).filter((p) => p.length),
  });
  return { west: half(true), east: half(false) };
}

export function buildHubWorld() {
  const topo = JSON.parse(readFileSync(join(ROOT, 'node_modules', 'world-atlas', 'countries-110m.json'), 'utf8'));
  const table = JSON.parse(readFileSync(join(ROOT, 'scripts', 'atlas', 'hub_world_units.json'), 'utf8'));
  const geoms = topo.objects.countries.geometries;
  const keyOf = (g) => g.id || g.properties.name;
  const missing = geoms.filter((g) => !table[keyOf(g)]).map((g) => `${keyOf(g)} ${g.properties.name}`);
  if (missing.length) throw new Error(`단원표에 없는 나라: ${missing.join(', ')}`);

  const projection = geoRobinson().rotate([-150, 0]).fitWidth(WIDTH, { type: 'Sphere' });
  const raw = geoPath(projection).digits(0);
  const path = (o) => compactPath(raw(o));
  path.bounds = (o) => raw.bounds(o);
  const [[, y0], [, y1]] = path.bounds({ type: 'Sphere' });
  const height = Math.ceil(y1 - y0);

  // 나눔 나라 {split: 경도, west, east}: 러시아 = 우랄 60°E(서 u3 · 동 u2), 프랑스 = −30°(서 = 프랑스령 기아나 u5 · 동 u3)
  const split = geoms.filter((g) => typeof table[keyOf(g)] === 'object');
  const halves = split.map((g) => ({ rule: table[keyOf(g)], ...splitAtLon(feature(topo, g).geometry, table[keyOf(g)].split) }));
  const units = {};
  for (const u of UNITS) {
    const parts = [merge(topo, geoms.filter((g) => table[keyOf(g)] === u))];
    for (const h of halves) parts.push(h.rule.west === u ? h.west : h.rule.east === u ? h.east : null);
    const d = parts.filter(Boolean).map((p) => path(p) || '').join('');
    units[u] = { d, label: projection(LABELS[u]).map((v) => Math.round(v)) };
  }
  return {
    w: WIDTH,
    h: height,
    sphere: path({ type: 'Sphere' }),
    arctic: path(geoCircle().center([0, 90]).radius(90 - 66.5).precision(2)()),
    borders: path(mesh(topo, topo.objects.countries, (a, b) => a !== b)),
    labelU1: projection(LABELS.u1).map((v) => Math.round(v)),
    units,
    splitCount: split.length,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const w = buildHubWorld();
  const { splitCount, ...out } = w;
  const s = JSON.stringify(out);
  writeFileSync(HUB_WORLD, s + '\n');
  console.log(`src/atlas/hubWorld.json ${s.length} B · ${w.w}×${w.h} · 나눈 나라 ${splitCount}`);
}
