// © 2026 김용현
// 시간 지도(방사 카토그램) 순수 계산부. DOM 없이 Node 시험(tests/s1-u1-time-map)에서도 쓴다.
// 생각: 서울(원점)에서 본 방향은 그대로 두고, 거리만 「걸리는 시간 × 축척」으로 바꾼다.
//   도시(조절점)마다 배율 s = (시간 × k) / 실제 거리. 그 밖의 점(해안선, 경계)은
//   가까운 도시들의 배율을 거리 가중 평균(IDW)해서 쓴다 → 원점에서 그 점까지의 거리에 s 를 곱한다.

/** 조절점 만들기: cities = [{x,y,t}] (t = 걸리는 시간, null 이면 빠짐), k = 시간 1 당 px */
export function makeControls(origin, cities, k) {
  const out = [];
  for (const c of cities) {
    if (c.t == null) continue;
    const r = Math.hypot(c.x - origin[0], c.y - origin[1]);
    if (r < 1e-6) continue;
    out.push({ x: c.x, y: c.y, s: (c.t * k) / r });
  }
  return out;
}

/** 점 (x,y) 의 배율: 조절점 배율의 역거리 제곱 가중 평균. 조절점 위면 그 배율 그대로 */
export function scaleAt(x, y, controls, power = 2) {
  if (!controls.length) return 1;
  let sw = 0, ss = 0;
  for (const c of controls) {
    const d2 = (x - c.x) ** 2 + (y - c.y) ** 2;
    if (d2 < 1e-9) return c.s;
    const w = power === 2 ? 1 / d2 : 1 / Math.pow(d2, power / 2);
    sw += w; ss += w * c.s;
  }
  return ss / sw;
}

/** 점 하나 옮기기: 원점에서 같은 방향, 거리만 배율만큼 */
export function warpPoint(x, y, origin, controls) {
  const s = scaleAt(x, y, controls);
  return [origin[0] + (x - origin[0]) * s, origin[1] + (y - origin[1]) * s];
}

/** [x0,y0,x1,y1,...] 평평한 좌표 배열 전체 옮기기 → Float64Array */
export function warpFlat(flat, origin, controls) {
  const out = new Float64Array(flat.length);
  for (let i = 0; i < flat.length; i += 2) {
    const [x, y] = warpPoint(flat[i], flat[i + 1], origin, controls);
    out[i] = x; out[i + 1] = y;
  }
  return out;
}

/** 두 좌표 배열 사이 보간(같은 길이) */
export function lerpFlat(a, b, t, out = new Float64Array(a.length)) {
  for (let i = 0; i < a.length; i++) out[i] = a[i] + (b[i] - a[i]) * t;
  return out;
}

/** 부드러운 시작과 끝(0~1 → 0~1) */
export const easeInOut = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/** 좌표 배열들의 테두리 상자 [x0,y0,x1,y1] */
export function bounds(arrays) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const a of arrays) for (let i = 0; i < a.length; i += 2) {
    if (a[i] < x0) x0 = a[i]; if (a[i] > x1) x1 = a[i];
    if (a[i + 1] < y0) y0 = a[i + 1]; if (a[i + 1] > y1) y1 = a[i + 1];
  }
  return [x0, y0, x1, y1];
}

/** 분 → 읽기 쉬운 글. 하루 넘게(도보)는 「n일」, 그 밖은 「n시간 m분」 */
export function formatMinutes(min, { days = false } = {}) {
  if (min == null) return '';
  if (days) {
    const d = min / 1440;
    return d >= 10 ? `약 ${Math.round(d)}일` : `약 ${Math.round(d * 10) / 10}일`;
  }
  const m = Math.round(min);
  const hh = Math.floor(m / 60), mm = m % 60;
  if (!hh) return `${mm}분`;
  return mm ? `${hh}시간 ${mm}분` : `${hh}시간`;
}
