// © 2026 김용현
// src/atlas/geoClip.js — 바탕 지도 경위도 도형 다루기(순수 함수, DOM 없음). 테스트: tests/atlas/geoClip.test.mjs
//   화면 밖 도형 미리 자르기(viewRect·indexGeometry·clipIndexed·clipPolygon·clipLine), 단원 상자 테두리 호 빼기(dropBoxEdges), 상자 면(boxPolygon).
import { geoClipRectangle } from 'd3-geo';
import { invertChecked } from './mapView.js';

const finite2 = (p) => !!p && Number.isFinite(p[0]) && Number.isFinite(p[1]);

// 구드는 단속 자르기(preclip, 구면 다각형 자르기)가 점마다 무거워, 화면 밖 도형까지 넘기면 10a 확대에서 전체 그리기가 250ms 를 넘는다.
// 그래서 바탕 지도 도형을 화면에 보이는 경위도 상자(+여백)로 평면 자르기(경위도 평면) 한 뒤 투영에 넘긴다. 모든 도법에 쓴다.
//  - 면(육지·호수)은 d3 의 평면 사각 자르기(geoClipRectangle, clipExtent 와 같은 것)로 면 단위로 자른다. Sutherland–Hodgman 은
//    U 자 면을 상자 변 위 0 폭 다리로 잇는데, 그 다리가 구드 단속선을 지나면 preclip 이 면을 뒤집어 화면 전체를 칠한다(오스트레일리아 남부).
//    상자 위선 변은 1° 간격으로 촘촘히 둔다(d3 는 변을 대원으로 그리므로). 잘린 변은 여백 덕에 화면 밖에 있다.
//    면은 채우기만 한다(테두리는 해안선 mesh 를 따로 그림).
//  - 줄(해안선·국경·하천·경위선)은 상자에 걸치는 마디가 이어진 묶음만 남긴다(마디는 자르지 않음).

/** 화면(0~width, 0~height)에 보이는 경위도 상자 [w, s, e, n](경도는 중심 경도 기준으로 펴서 −180 미만·180 초과일 수 있음).
 *  화면을 (n+1)² 격자로 되돌려 모으고 폭·높이의 marginFrac(최소 minMargin°)만큼 넓힌다. 극이 화면에 있거나 경도 폭 ≥ maxLonSpan 이면
 *  경도는 [중심−180, 중심+180] 전부, 위도 폭 ≥ maxLatSpan 이면 위도는 ±90 전부. 둘 다 전부(세계 보기)거나 되돌릴 점이 없으면 null = 자르지 않음. */
export function viewRect(proj, width, height, { n = 16, marginFrac = 0.15, minMargin = 1, maxLonSpan = 300, maxLatSpan = 150 } = {}) {
  const c = proj.centerLon ?? 0;
  let w = Infinity, e = -Infinity, s = Infinity, nn = -Infinity;
  for (let i = 0; i <= n; i++) {
    for (let j = 0; j <= n; j++) {
      const ll = invertChecked(proj, [(width * i) / n, (height * j) / n]);
      if (!ll) continue;
      const x = ((((ll[0] - c + 540) % 360) + 360) % 360) - 180;
      if (x < w) w = x; if (x > e) e = x;
      if (ll[1] < s) s = ll[1]; if (ll[1] > nn) nn = ll[1];
    }
  }
  if (!Number.isFinite(w)) return null;
  // 극이 화면에 있으면 경도는 한 바퀴 다, 위도는 그 극까지(극 둘레는 경도가 빠르게 바뀌어 격자로 못 잡는다)
  let fullLon = false, north = false, south = false;
  for (const lat of [89.999, -89.999]) {
    for (let lon = -180; lon < 180; lon += 15) {
      const q = proj([lon, lat]);
      if (finite2(q) && q[0] >= 0 && q[0] <= width && q[1] >= 0 && q[1] <= height) { fullLon = true; if (lat > 0) north = true; else south = true; break; }
    }
  }
  const mx = Math.max(minMargin, (e - w) * marginFrac), my = Math.max(minMargin, (nn - s) * marginFrac);
  w -= mx; e += mx; s = south ? -90 : s - my; nn = north ? 90 : nn + my;
  const fullLat = nn - s >= maxLatSpan;
  if (fullLon || e - w >= maxLonSpan) { if (fullLat) return null; w = -180; e = 180; }
  if (fullLat) { s = -90; nn = 90; }
  return [w + c, Math.max(-90, s), e + c, Math.min(90, nn)];
}

const bboxOf = (pts) => {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  for (const [x, y] of pts) { if (x < w) w = x; if (x > e) e = x; if (y < s) s = y; if (y > n) n = y; }
  return [w, s, e, n];
};
const bboxInside = (b, r) => b[0] >= r[0] && b[2] <= r[2] && b[1] >= r[1] && b[3] <= r[3];
const bboxApart = (b, r) => b[2] < r[0] || b[0] > r[2] || b[3] < r[1] || b[1] > r[3];

const ringArea = (r) => { let a = 0; for (let i = 1; i < r.length; i++) a += r[i - 1][0] * r[i][1] - r[i][0] * r[i - 1][1]; return a / 2; };
const ringContains = (r, [x, y]) => {
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i], [xj, yj] = r[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};

/**
 * 면(고리들 [바깥, 구멍…], 경위도, d3 관례: 바깥 고리는 시계 방향)을 상자 [w, s, e, n]로 평면 자르기 → 면들 [[바깥, 구멍…], …].
 * 상자 안이면 [rings] 그대로, 밖이면 []. 자를 때는 (경도, −위도) 평면에서 geoClipRectangle 로 자르고(화면 좌표와 같은 방향),
 * 시계 방향 고리를 바깥, 반시계를 구멍으로 보고 구멍은 담고 있는 바깥 고리에 붙인다. 고리는 닫는다.
 */
export function clipPolygon(rings, rect, { step = 1, bbox } = {}) {
  const b = bbox || bboxOf(rings[0]);
  if (bboxInside(b, rect)) return [rings];
  if (bboxApart(b, rect)) return [];
  const [w, s, e, n] = rect;
  const out = [];
  let cur = null;
  const sink = {
    point(x, y) { cur.push([x, -y]); }, lineStart() { cur = []; }, lineEnd() { if (cur.length > 2) out.push(cur); cur = null; },
    polygonStart() {}, polygonEnd() {}, sphere() {},
  };
  const st = geoClipRectangle(w, -n, e, -s)(sink);
  st.polygonStart();
  for (const r of rings) {
    st.lineStart();
    const m = r.length > 1 && r[0][0] === r[r.length - 1][0] && r[0][1] === r[r.length - 1][1] ? r.length - 1 : r.length;
    for (let i = 0; i < m; i++) st.point(r[i][0], -r[i][1]);
    st.lineEnd();
  }
  st.polygonEnd();
  const onLat = (p, q) => (Math.abs(p[1] - s) < 1e-9 && Math.abs(q[1] - s) < 1e-9) || (Math.abs(p[1] - n) < 1e-9 && Math.abs(q[1] - n) < 1e-9);
  const exts = [], holes = [];
  for (const r of out) {
    const d = [];
    for (let i = 0; i < r.length; i++) {
      const p = r[i], q = r[(i + 1) % r.length];
      d.push(p);
      if (onLat(p, q)) {
        const k = Math.ceil(Math.abs(q[0] - p[0]) / step);
        for (let j = 1; j < k; j++) d.push([p[0] + ((q[0] - p[0]) * j) / k, p[1]]);
      }
    }
    if (d[0][0] !== d[d.length - 1][0] || d[0][1] !== d[d.length - 1][1]) d.push(d[0]);
    const a = ringArea(d);
    if (a < 0) exts.push([d]); else if (a > 0) holes.push(d);
  }
  for (const hr of holes) {
    const poly = exts.find((p) => ringContains(p[0], hr[0]));
    if (poly) poly.push(hr);
  }
  return exts;
}

/** 줄을 상자로: 상자에 걸치는(마디 상자가 겹치는) 마디가 이어진 묶음들. 마디는 자르지 않는다(밖 끝점 포함). */
export function clipLine(line, rect, bbox) {
  const b = bbox || bboxOf(line);
  if (bboxInside(b, rect)) return [line];
  if (bboxApart(b, rect)) return [];
  const [w, s, e, n] = rect;
  const runs = [];
  let cur = null;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1], q = line[i];
    const hit = !(Math.max(a[0], q[0]) < w || Math.min(a[0], q[0]) > e || Math.max(a[1], q[1]) < s || Math.min(a[1], q[1]) > n);
    if (hit) { if (!cur) cur = [a]; cur.push(q); } else if (cur) { runs.push(cur); cur = null; }
  }
  if (cur) runs.push(cur);
  return runs;
}

/** GeoJSON(면 또는 줄; Feature·FeatureCollection·GeometryCollection 가능)을 자르기용 색인으로: 면·고리·줄마다 상자를 미리 잰다. */
export function indexGeometry(obj) {
  const polys = [], lines = [];
  const walk = (g) => {
    if (!g) return;
    if (g.type === 'FeatureCollection') g.features.forEach((f) => walk(f.geometry));
    else if (g.type === 'Feature') walk(g.geometry);
    else if (g.type === 'GeometryCollection') g.geometries.forEach(walk);
    else if (g.type === 'Polygon') polys.push(g.coordinates);
    else if (g.type === 'MultiPolygon') polys.push(...g.coordinates);
    else if (g.type === 'LineString') lines.push(g.coordinates);
    else if (g.type === 'MultiLineString') lines.push(...g.coordinates);
  };
  walk(obj);
  if (polys.length && lines.length) throw new Error('indexGeometry: 면과 줄을 섞을 수 없음');
  if (polys.length) {
    const items = polys.map((rings) => ({ rings, b: bboxOf(rings[0]) }));
    return { kind: 'polygon', items, full: { type: 'MultiPolygon', coordinates: polys } };
  }
  return { kind: 'line', items: lines.map((line) => ({ line, b: bboxOf(line) })), full: { type: 'MultiLineString', coordinates: lines } };
}

/** 색인 idx 를 상자 rect([w, s, e, n], viewRect 결과; null 이면 원래 도형)로 잘라 MultiPolygon | MultiLineString. 날짜변경선을 넘는 상자는 둘로 나눠 자른다. */
export function clipIndexed(idx, rect) {
  if (!rect) return idx.full;
  const [w, s, e, n] = rect;
  const wins = w < -180 ? [[w + 360, s, 180, n], [-180, s, e, n]] : e > 180 ? [[w, s, 180, n], [-180, s, e - 360, n]] : [rect];
  const out = [];
  for (const win of wins) {
    if (win[2] < win[0]) continue;
    for (const it of idx.items) {
      if (bboxApart(it.b, win)) continue;
      if (idx.kind === 'line') { out.push(...clipLine(it.line, win, it.b)); continue; }
      out.push(...clipPolygon(it.rings, win, { bbox: it.b }));
    }
  }
  return { type: idx.kind === 'polygon' ? 'MultiPolygon' : 'MultiLineString', coordinates: out };
}

/**
 * 해안선(육지 mesh)에서 상자 테두리 위에 놓인 마디를 빼고 줄을 나눈다.
 * 10a 는 단원 상자로 잘려 상자 테두리가 호가 되고, 모든 상세도에서 ±180° 자른 자리도 호가 된다 — 해안선이 아니다.
 * boxes: [[w, s, e, n], …], eps: 도(양자화 오차보다 크게).
 */
export function dropBoxEdges(mls, boxes, eps = 1e-3) {
  const near = (a, b) => Math.abs(a - b) <= eps;
  const onEdge = (p, q) => boxes.some(([w, s, e, n]) =>
    (near(p[0], w) && near(q[0], w)) || (near(p[0], e) && near(q[0], e)) || (near(p[1], s) && near(q[1], s)) || (near(p[1], n) && near(q[1], n)));
  const out = [];
  for (const line of mls.coordinates) {
    let cur = [line[0]];
    for (let i = 1; i < line.length; i++) {
      if (onEdge(line[i - 1], line[i])) {
        if (cur.length > 1) out.push(cur);
        cur = [line[i]];
      } else cur.push(line[i]);
    }
    if (cur.length > 1) out.push(cur);
  }
  return { type: 'MultiLineString', coordinates: out };
}

/** 경위선을 따르는 상자 면(시계 방향 고리, 변을 step° 마다 나눠 위선이 대원으로 휘지 않게). */
export function boxPolygon([w, s, e, n], step = 1) {
  const ring = [];
  const seg = (a, b) => {
    const m = Math.max(1, Math.ceil(Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1])) / step));
    for (let i = 0; i < m; i++) ring.push([a[0] + ((b[0] - a[0]) * i) / m, a[1] + ((b[1] - a[1]) * i) / m]);
  };
  seg([w, s], [w, n]); seg([w, n], [e, n]); seg([e, n], [e, s]); seg([e, s], [w, s]);
  ring.push([w, s]);
  return { type: 'Polygon', coordinates: [ring] };
}

