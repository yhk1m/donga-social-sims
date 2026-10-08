// © 2026 김용현
// src/atlas/projections.js — 5개 도법, 중심 경도, 화면 맞춤, 전환 보간, 경위도 범위 → 확대 변환. 순수 함수(DOM 없음).
//   makeProjection(key, { centerLon, width, height, pad })  지구 전체(메르카토르는 ±85°)를 무대에 맞춘 d3 투영
//   interpolateProjection(a, b)(t)                           두 투영의 화면 좌표를 점마다 선형 보간한 d3 투영(geoPath 그대로 사용 가능)
//   fitBoundsTransform(projection, bounds, width, height, pad, { minK, maxK })  경위도 범위를 화면에 맞추는 d3-zoom 변환 {k, x, y}
import { geoMercator, geoEqualEarth, geoProjection, geoGraticule10 } from 'd3-geo';
import { geoMiller, geoRobinson } from 'd3-geo-projection';
// 구드: d3-geo-projection 의 단속 호몰로사인은 단속선에서 도형을 자르지 않아(틈을 가로지르는 선이 생김)
// d3-geo-polygon 의 다시 자른(reclip) 판을 쓴다 — 단속선을 따라 preclip(geoClipPolygon)이 걸려 있다.
import { geoInterruptedHomolosine } from 'd3-geo-polygon';

export const PROJECTIONS = {
  miller: { label: '밀러', make: () => geoMiller() },
  mercator: { label: '메르카토르', make: () => geoMercator() },
  robinson: { label: '로빈슨', make: () => geoRobinson() },
  goode: { label: '구드', make: () => geoInterruptedHomolosine() },
  equalEarth: { label: '이퀄어스', make: () => geoEqualEarth() },
};

export const MERCATOR_MAX_LAT = 85;
const SPHERE = { type: 'Sphere' };
const DEG = 180 / Math.PI;
const clampLat = (lat) => Math.max(-MERCATOR_MAX_LAT, Math.min(MERCATOR_MAX_LAT, lat));

/** 메르카토르 맞춤용 점 묶음: 중심 경도 ±180°, 위도 ±85° 테두리. (폴리곤은 변이 대원이라 쓰지 않는다) */
function mercatorFrame(c) {
  const pts = [];
  for (let i = 0; i <= 8; i++) {
    const lon = c - 179.999 + (359.998 * i) / 8;
    pts.push([lon, MERCATOR_MAX_LAT], [lon, -MERCATOR_MAX_LAT]);
  }
  return { type: 'MultiPoint', coordinates: pts };
}

/**
 * 도법 하나를 만든다.
 * key: PROJECTIONS 키, centerLon: 화면 가운데 경도(0 = 대서양 중심, 150 = 태평양 중심), width/height: 무대 크기(px), pad: 여백(px)
 * 반환: d3 투영 + p.key, p.centerLon. 메르카토르는 clipExtent 로 ±85°·경도 360° 상자 밖을 자른다.
 */
export function makeProjection(key, { centerLon = 0, width, height, pad = 12 }) {
  const def = PROJECTIONS[key];
  if (!def) throw new Error(`모르는 도법: ${key}`);
  const p = def.make().rotate([-centerLon, 0]).precision(0.2);
  const ext = [[pad, pad], [width - pad, height - pad]];
  if (key === 'mercator') {
    p.fitExtent(ext, mercatorFrame(centerLon));
    const [x0, y0] = p([centerLon - 180, MERCATOR_MAX_LAT]), [x1, y1] = p([centerLon + 180, -MERCATOR_MAX_LAT]);
    p.clipExtent([[Math.min(x0, x1), y0], [Math.max(x0, x1), y1]]);
  } else {
    p.fitExtent(ext, SPHERE);
  }
  p.key = key;
  p.centerLon = centerLon;
  return p;
}

/**
 * 두 투영 사이 전환(애니메이션)용 투영. 반환 함수 (t ∈ [0,1]) → d3 투영.
 * 점 하나의 화면 좌표 = a(점)·(1−t) + b(점)·t. 결과는 진짜 d3 투영(geoProjection)이라 geoPath·stream·invert 를 그대로 쓴다.
 *  - 회전(중심 경도)은 a 를 따른다(전환 중 중심 경도는 바뀌지 않는다는 전제). 날짜변경선 자르기도 그 회전 기준.
 *  - 한쪽이 구드면 구드의 단속 자르기(preclip)를 쓴다. 한쪽이 메르카토르면 위도를 ±85°로 눌러 무한대를 막는다.
 *  - geoProjection 은 raw 의 y 를 뒤집고 center 점(회전 좌표 0,0)을 translate 로 옮기므로,
 *    raw 는 [x, −y] 를 돌려주고 translate 를 중심 경도·적도 점의 보간 화면 좌표로 둔다 → 출력 = 보간 화면 좌표 그대로.
 */
export function interpolateProjection(a, b) {
  const c = a.centerLon ?? 0;
  const merc = a.key === 'mercator' || b.key === 'mercator';
  const goode = a.key === 'goode' ? a : b.key === 'goode' ? b : null;
  return (t) => {
    const s = 1 - t;
    const at = (lon, lat) => {
      if (merc) lat = clampLat(lat);
      const pa = a([lon, lat]), pb = b([lon, lat]);
      if (!pa || !pb) return null;
      return [pa[0] * s + pb[0] * t, pa[1] * s + pb[1] * t];
    };
    const raw = (lambda, phi) => {
      const r = at(lambda * DEG + c, phi * DEG);
      return r ? [r[0], -r[1]] : [NaN, NaN];
    };
    // 역변환: 양 끝 도법의 invert 로 첫 값을 잡고 뉴턴법(수치 야코비안)으로 다듬는다.
    raw.invert = (x, y) => {
      const target = [x, -y];
      const guessFrom = t < 0.5 ? a : b;
      const g = guessFrom.invert ? guessFrom.invert(target) : null;
      let lon = g ? g[0] : c, lat = g ? g[1] : 0;
      for (let i = 0; i < 20; i++) {
        const f = at(lon, lat);
        if (!f) break;
        const ex = f[0] - target[0], ey = f[1] - target[1];
        if (Math.abs(ex) < 1e-7 && Math.abs(ey) < 1e-7) break;
        const h = 1e-5, fx = at(lon + h, lat), fy = at(lon, lat + h);
        if (!fx || !fy) break;
        const j11 = (fx[0] - f[0]) / h, j12 = (fy[0] - f[0]) / h, j21 = (fx[1] - f[1]) / h, j22 = (fy[1] - f[1]) / h;
        const det = j11 * j22 - j12 * j21;
        if (!det) break;
        lon -= (j22 * ex - j12 * ey) / det;
        lat -= (-j21 * ex + j11 * ey) / det;
        lat = Math.max(-90, Math.min(90, lat));
      }
      return [((lon - c) / DEG), lat / DEG];
    };
    const origin = at(c, 0);
    const p = geoProjection(raw).rotate([-c, 0]).scale(1).translate(origin).precision(a.precision());
    if (goode) p.preclip(goode.preclip());
    p.key = `${a.key}>${b.key}`;
    p.centerLon = c;
    p.t = t;
    return p;
  };
}

/**
 * 경위도 범위를 화면에 맞추는 d3-zoom 변환 {k, x, y}(화면 = k·투영 + [x, y]).
 * bounds: [[lon0, lat0], [lon1, lat1]] — lon1 < lon0 이면 날짜변경선을 넘는 범위(lon1 + 360 으로 편다).
 * 범위 안을 격자로 촘촘히 찍어 화면 상자를 잡는다(구드 단속·날짜변경선으로 갈라진 조각도 모두 담김).
 * k 는 [minK, maxK](기본 1~40)로 자른다.
 */
export function fitBoundsTransform(projection, bounds, width, height, pad = 0, { minK = 1, maxK = 40 } = {}) {
  let [[lon0, lat0], [lon1, lat1]] = bounds;
  if (lon1 < lon0) lon1 += 360;
  if (lat1 < lat0) [lat0, lat1] = [lat1, lat0];
  if (projection.key === 'mercator') { lat0 = clampLat(lat0); lat1 = clampLat(lat1); }
  const n = 24;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i <= n; i++) {
    for (let j = 0; j <= n; j++) {
      const q = projection([lon0 + ((lon1 - lon0) * i) / n, lat0 + ((lat1 - lat0) * j) / n]);
      if (!q || !Number.isFinite(q[0]) || !Number.isFinite(q[1])) continue;
      if (q[0] < x0) x0 = q[0]; if (q[0] > x1) x1 = q[0];
      if (q[1] < y0) y0 = q[1]; if (q[1] > y1) y1 = q[1];
    }
  }
  if (!Number.isFinite(x0)) return { k: minK, x: 0, y: 0 };
  const w = x1 - x0, h = y1 - y0, aw = Math.max(1, width - 2 * pad), ah = Math.max(1, height - 2 * pad);
  let k = Math.min(w > 0 ? aw / w : Infinity, h > 0 ? ah / h : Infinity);
  k = Math.max(minK, Math.min(maxK, k));
  return { k, x: width / 2 - (k * (x0 + x1)) / 2, y: height / 2 - (k * (y0 + y1)) / 2 };
}

export const graticule = geoGraticule10;
