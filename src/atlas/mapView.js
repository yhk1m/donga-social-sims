// © 2026 김용현
// src/atlas/mapView.js — 렌더러(renderer.js)가 쓰는 순수 계산(DOM 없음). 테스트: tests/atlas/mapView.test.mjs
//   확대 변환 t = {k, x, y}(d3-zoom): 화면 = k·기준 투영 + [x, y]. 기준 투영 = makeProjection(…)(무대에 지구 전체를 맞춘 것).
//   viewProjection(base, t)  확대 변환을 품은 d3 투영(화면 px 를 바로 냄) — 재표본 정밀도·자르기가 화면 px 기준이라
//                            크게 확대해도 곡선이 매끄럽고, 화면 밖 도형은 자르기 상자에서 잘려 그리기가 가볍다.
import { geoDistance, geoInterpolate, geoClipRectangle } from 'd3-geo';
import { PROJECTIONS } from './projections.js';

export const EARTH_KM = 6371.0088;

const finite2 = (p) => !!p && Number.isFinite(p[0]) && Number.isFinite(p[1]);

/**
 * 기준 투영 base 에 확대 변환 t 를 적용한 새 d3 투영. 반환 투영에 key·centerLon(보간 전환에 필요)과
 * 메르카토르면 frame(±85°·경도 360° 상자의 화면 좌표, 바다 채움용)을 붙인다.
 * 자르기 상자 = 화면 + margin(메르카토르는 그 상자와 frame 의 교집합).
 */
export function viewProjection(base, t, { width, height, margin = 2, precision = 0.4 } = {}) {
  const def = PROJECTIONS[base.key];
  if (!def) throw new Error(`모르는 도법: ${base.key}`);
  const [tx, ty] = base.translate();
  const v = def.make().rotate(base.rotate()).scale(base.scale() * t.k).translate([tx * t.k + t.x, ty * t.k + t.y]).precision(precision);
  let ext = [[-margin, -margin], [width + margin, height + margin]];
  v.frame = null;
  if (base.key === 'mercator' && base.clipExtent()) {
    const [[bx0, by0], [bx1, by1]] = base.clipExtent();
    const f = [[bx0 * t.k + t.x, by0 * t.k + t.y], [bx1 * t.k + t.x, by1 * t.k + t.y]];
    v.frame = f;
    const x0 = Math.max(ext[0][0], f[0][0]), y0 = Math.max(ext[0][1], f[0][1]);
    let x1 = Math.min(ext[1][0], f[1][0]), y1 = Math.min(ext[1][1], f[1][1]);
    if (x1 <= x0) x1 = x0 + 1e-3; // 화면 밖: 빈 상자 대신 아주 작은 상자
    if (y1 <= y0) y1 = y0 + 1e-3;
    ext = [[x0, y0], [x1, y1]];
  }
  v.clipExtent(ext);
  v.key = base.key;
  v.centerLon = base.centerLon ?? 0;
  return v;
}

/** 투영 proj 에서 lonlat 이 화면 가운데(width/2, height/2)에 오는 확대 k 의 변환. 투영할 수 없으면 null. */
export function transformForCenter(base, center, k, width, height) {
  const p = center && finite2(center) ? base(center) : null;
  if (!finite2(p)) return null;
  return { k, x: width / 2 - k * p[0], y: height / 2 - k * p[1] };
}

/** proj.invert(xy) 가 지도 위 점이면 경위도, 아니면(지도 밖·구드 틈·이음매 너머) null. 되돌려 0.5px 안에 와야 함. */
export function invertChecked(proj, xy) {
  const ll = proj.invert ? proj.invert(xy) : null;
  if (!finite2(ll) || Math.abs(ll[1]) > 90) return null;
  const c = proj.centerLon ?? 0;
  if (Math.abs(((ll[0] - c + 540) % 360) - 180) > 180 + 1e-9) return null;
  const back = proj(ll);
  if (!finite2(back) || Math.hypot(back[0] - xy[0], back[1] - xy[1]) > 0.5) return null;
  return ll;
}

/** 화면 가운데의 경위도(지도 밖이면 null). */
export function centerOf(proj, width, height) {
  return invertChecked(proj, [width / 2, height / 2]);
}

/** 화면 가운데의 경위도, 가운데가 지도 밖(구드 틈 등)이면 가운데에서 가까운 지도 위 점(화면 폭·높이의 1/16 걸음, 고리 8개까지).
 *  상세도 고르기(10a 는 화면 가운데가 단원 안일 때)가 틈 때문에 50m 로 떨어지지 않게. 화면 전체가 지도 밖이면 null. */
export function nearCenter(proj, width, height, rings = 8) {
  const c = centerOf(proj, width, height);
  if (c) return c;
  const sx = width / 16, sy = height / 16;
  for (let r = 1; r <= rings; r++) {
    let best = null, bd = Infinity;
    for (let i = -r; i <= r; i++) {
      for (let j = -r; j <= r; j++) {
        if (Math.max(Math.abs(i), Math.abs(j)) !== r) continue;
        const d = Math.hypot(i * sx, j * sy);
        if (d >= bd) continue;
        const ll = invertChecked(proj, [width / 2 + i * sx, height / 2 + j * sy]);
        if (ll) { best = ll; bd = d; }
      }
    }
    if (best) return best;
  }
  return null;
}

/** 스냅숏을 찍은 변환 t0 → 지금 t 로 옮기는 화면 변환: 화면 = r·스냅숏 화면 + [dx, dy]. */
export function relativeTransform(t0, t) {
  const r = t.k / t0.k;
  return { r, dx: t.x - r * t0.x, dy: t.y - r * t0.y };
}

/** 경위도 범위 두 형식([w, s, e, n] — topics.json view.bounds, [[w, s], [e, n]] — 계획 인터페이스)을 [[w, s], [e, n]] 로. */
export function normalizeBounds(b) {
  if (Array.isArray(b) && b.length === 4 && b.every(Number.isFinite)) return [[b[0], b[1]], [b[2], b[3]]];
  if (Array.isArray(b) && b.length === 2 && b.every((p) => Array.isArray(p) && finite2(p))) return [[b[0][0], b[0][1]], [b[1][0], b[1][1]]];
  throw new Error(`경위도 범위 형식이 아님: ${JSON.stringify(b)}`);
}

/** 화면 점 xy 에서 가로 1px 의 지표 거리(km). 양옆 5px 를 되돌려 대원 거리 / 10. 지도 밖이면 null. 축척 막대(D7)용. */
export function kmPerPx(proj, xy, half = 5) {
  const a = invertChecked(proj, [xy[0] - half, xy[1]]), b = invertChecked(proj, [xy[0] + half, xy[1]]);
  if (!a || !b) return null;
  return (geoDistance(a, b) * EARTH_KM) / (2 * half);
}

/** 그리는 순서: z 오름차순(없으면 0), 같은 z 는 넣은 순서. */
export function sortLayers(layers) {
  return layers.map((l, i) => [l, i]).sort((a, b) => (a[0].z ?? 0) - (b[0].z ?? 0) || a[1] - b[1]).map((x) => x[0]);
}

/** 맞히기: 그리는 순서의 역순(위에 그린 것부터) hit(xy, lonlat) 을 불러 처음 값이 있는 것 → {layerId, feature}. 없으면 null. */
export function hitTest(layers, xy, lonlat) {
  const order = sortLayers(layers).reverse();
  for (const l of order) {
    if (typeof l.hit !== 'function') continue;
    const f = l.hit(xy, lonlat);
    if (f) return { layerId: l.id, feature: f };
  }
  return null;
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

/**
 * 경위도 줄 geoPts 를 proj 로 투영하면 끊기는가(구드 단속 틈·날짜변경선 이음매·투영 실패).
 * 마디마다 0.5° 간격으로 표본을 찍어, 한 걸음이 걸음 중앙값의 4배(그리고 3px)를 넘으면 끊김.
 * 적도 근처 구드 틈(1px 남짓)은 끊김으로 보지 않는다.
 */
export function pathBroken(geoPts, proj, stepDeg = 0.5) {
  const pts = [];
  for (let i = 1; i < geoPts.length; i++) {
    const a = geoPts[i - 1], b = geoPts[i];
    const n = Math.max(4, Math.ceil((geoDistance(a, b) * 180) / Math.PI / stepDeg));
    const f = geoInterpolate(a, b);
    for (let j = i === 1 ? 0 : 1; j <= n; j++) pts.push(proj(f(j / n)));
  }
  if (pts.some((p) => !finite2(p))) return true;
  const steps = [];
  for (let i = 1; i < pts.length; i++) steps.push(Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const sorted = [...steps].sort((x, y) => x - y);
  const med = sorted[Math.floor(sorted.length / 2)];
  return sorted[sorted.length - 1] > Math.max(3, 4 * med);
}

/** 하천 선: 등급 s(Natural Earth scalerank, 1 = 큰 강)와 확대 k → {visible, width(px)}. 작은 하천(s 6)은 k ≥ 3 부터. */
export function riverStyle(s, k) {
  const visible = k >= 3 || s <= 5;
  const base = 1.5 - 0.17 * (Math.max(1, Math.min(6, s)) - 1);
  const f = Math.max(0.85, Math.min(1.6, 1 + 0.35 * Math.log2(k / 2)));
  return { visible, width: Math.max(0.5, Math.min(2.4, base * f)) };
}

/** 호수: 등급 s 가 클수록 작은 호수 — s ≤ 6 은 늘, 7 은 k ≥ 6, 8 이상은 k ≥ 10. */
export function lakeVisible(s, k) {
  if (s <= 6) return true;
  if (s <= 7) return k >= 6;
  return k >= 10;
}

/** 경위선 간격(도): 세계 30°, k ≥ 2 는 10°, k ≥ 8 은 5°. */
export function graticuleStep(k) {
  return k < 2 ? 30 : k < 8 ? 10 : 5;
}

/** 교과서 글자 크기(pt, 5.4~12.4) → 화면 글자 크기(px). 가장 작은 글자도 10.5px. */
export function fontPx(size) {
  return Math.max(10.5, Math.round((10.5 + (size - 5.4) * 0.7) * 10) / 10);
}

/** 폴리라인 pts 의 가운데 len 만큼(길이가 len 이하면 그대로). 선·면 지명의 자간 상한을 종류별로 두려고 줄을 줄인다. */
export function trimPath(pts, len) {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const L = cum[cum.length - 1];
  if (L <= len) return pts;
  const s0 = (L - len) / 2, s1 = s0 + len;
  const at = (sv) => {
    let i = 1;
    while (i < pts.length - 1 && cum[i] < sv) i++;
    const a = pts[i - 1], b = pts[i], seg = cum[i] - cum[i - 1], t = seg ? (sv - cum[i - 1]) / seg : 0;
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  };
  const out = [at(s0)];
  for (let i = 1; i < pts.length - 1; i++) if (cum[i] > s0 && cum[i] < s1) out.push(pts[i]);
  out.push(at(s1));
  return out;
}

/**
 * 놓인 선·면 지명(placeLabels 결과 L)을 글자별로 그릴지 정한다.
 *  - 굽은 줄(L.glyphs)이 완만하면 {upright:false, glyphs: L.glyphs}(글자마다 줄 방향으로 회전).
 *  - 줄 방향이 가파르면(|angle| ≥ uprightDeg) 글자를 세우고(회전 0) 위 → 아래로 읽히게 글자 순서를 맞춘다(한글 세로쓰기).
 *    곧은 줄은 at·angle·span·spacing 과 글자 폭(measure)으로 글자 자리를 다시 만든다.
 *  - 완만한 곧은 줄은 null(글자 하나로 회전해 그린다).
 */
export function glyphLayout(L, measure, { uprightDeg = 55 } = {}) {
  const steep = Math.abs(L.angle || 0) >= uprightDeg;
  if (L.glyphs && !steep) return { upright: false, glyphs: L.glyphs };
  if (!steep) return null;
  let chars, pos;
  if (L.glyphs) {
    chars = L.glyphs.map((g) => g.ch);
    pos = L.glyphs.map((g) => g.at);
  } else {
    chars = [...L.name];
    const a = (L.angle * Math.PI) / 180, ux = Math.cos(a), uy = Math.sin(a);
    let cur = -(L.span ?? 0) / 2;
    pos = chars.map((ch) => {
      const w = measure(ch, L.size);
      const c = cur + w / 2;
      cur += w + (L.spacing || 0);
      return [L.at[0] + ux * c, L.at[1] + uy * c];
    });
  }
  if (pos.length > 1 && pos[0][1] > pos[pos.length - 1][1]) pos = [...pos].reverse();
  return { upright: true, glyphs: chars.map((ch, i) => ({ ch, at: pos[i], angle: 0 })) };
}

// ---------- 화면 밖 도형 미리 자르기 ----------
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
