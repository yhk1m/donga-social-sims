// © 2026 김용현
// src/atlas/mapView.js — 렌더러(renderer.js)가 쓰는 투영·확대 변환·맞히기 계산(DOM 없음). 테스트: tests/atlas/mapView.test.mjs
//   확대 변환 t = {k, x, y}(d3-zoom): 화면 = k·기준 투영 + [x, y]. 기준 투영 = makeProjection(…)(무대에 지구 전체를 맞춘 것).
//   viewProjection(base, t)  확대 변환을 품은 d3 투영(화면 px 를 바로 냄) — 재표본 정밀도·자르기가 화면 px 기준이라
//                            크게 확대해도 곡선이 매끄럽고, 화면 밖 도형은 자르기 상자에서 잘려 그리기가 가볍다.
//   같은 엔진의 다른 순수 모듈: geoClip.js(화면 경위도 상자·미리 자르기·상자 테두리), lineStyle.js(선 굵기·표시 규칙),
//   labelLayout.js(지명 글자 크기·줄 줄이기·글자별 배치·줄 끊김).
import { geoDistance } from 'd3-geo';
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

