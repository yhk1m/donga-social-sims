// © 2026 김용현
// 오두막 창으로 드는 햇빛 계산(순수 함수 — Node 시험 가능).
// 오두막 자기 좌표(m): x = 창이 난 앞벽을 따라, y = 위, z = 앞(창 바깥쪽). 바닥 y = 0, 방 가운데가 원점.
// 창 방향(방위각 A, 북 0 시계 방향)으로 돌리면 자기 +z 가 방위각 A, 자기 +x 가 방위각 A - 90 을 향한다
// (three.js 에서 오두막 묶음의 rotation.y = PI - A 와 같다).
import { sunPosition, sunVector, localToUtc } from './solar.js';

export const HUT = {
  outerW: 4.0, outerD: 3.4, wall: 0.3, wallH: 2.1, ridgeH: 3.1,
  win: { halfW: 0.4, sill: 0.7, top: 1.6 },
};
const IN_X = HUT.outerW / 2 - HUT.wall; // 방 안 반너비 1.7 m
const IN_Z = HUT.outerD / 2 - HUT.wall; // 방 안 반깊이 1.4 m
const Z_OUT = HUT.outerD / 2;           // 앞벽 바깥면
const Z_IN = Z_OUT - HUT.wall;          // 앞벽 안쪽면

/** 해 방향(동, 북, 위 단위 벡터)을 오두막 자기 좌표로 */
export function toLocal(v, facingAz) {
  const a = (facingAz * Math.PI) / 180;
  const c = Math.cos(a), s = Math.sin(a);
  return { x: -v.e * c + v.n * s, y: v.u, z: v.e * s + v.n * c };
}

/**
 * 창틀 두께(벽 두께)까지 생각해 햇빛이 실제로 지나가는 창 구멍(앞벽 바깥면 위 직사각형).
 * 해가 창 앞쪽 위에 없으면 null.
 */
export function apertureRect(s) {
  if (s.y <= 0 || s.z <= 1e-6) return null;
  const { halfW, sill, top } = HUT.win;
  const dx = (s.x * HUT.wall) / s.z, dy = (s.y * HUT.wall) / s.z; // 안쪽 구멍이 바깥면에 비친 만큼 어긋남
  const x0 = Math.max(-halfW, -halfW + dx), x1 = Math.min(halfW, halfW + dx);
  const y0 = Math.max(sill, sill + dy), y1 = Math.min(top, top + dy);
  if (x1 - x0 <= 1e-4 || y1 - y0 <= 1e-4) return null;
  return { x0, x1, y0, y1 };
}

/** 볼록 다각형([[u, v], ...])을 축 나란한 직사각형으로 자르기(서덜랜드-호지먼) */
export function clipRect(poly, umin, umax, vmin, vmax) {
  const edges = [
    (p) => p[0] - umin, (p) => umax - p[0], (p) => p[1] - vmin, (p) => vmax - p[1],
  ];
  let out = poly;
  for (const f of edges) {
    const inp = out;
    out = [];
    for (let i = 0; i < inp.length; i++) {
      const a = inp[i], b = inp[(i + 1) % inp.length];
      const fa = f(a), fb = f(b);
      if (fa >= 0) out.push(a);
      if ((fa >= 0) !== (fb >= 0)) {
        const t = fa / (fa - fb);
        out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
      }
    }
    if (!out.length) return out;
  }
  return out;
}

export function polyArea(poly) {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i], [x2, y2] = poly[(i + 1) % poly.length];
    a += x1 * y2 - x2 * y1;
  }
  return Math.abs(a) / 2;
}

/**
 * 방 안에 생기는 햇빛 자국.
 * @returns {{floor: number[][], back: number[][]}} floor: 바닥 위 [x, z] 꼭짓점, back: 뒷벽 위 [x, y] 꼭짓점 (없으면 빈 배열)
 */
export function sunPatch(s) {
  const r = apertureRect(s);
  if (!r) return { floor: [], back: [] };
  const corners = [[r.x0, r.y0], [r.x1, r.y0], [r.x1, r.y1], [r.x0, r.y1]];
  // 바닥(y = 0)에 비침: 바깥면 점 (x, y, Z_OUT) 에서 -s 방향으로 y/s.y 만큼
  const floor = clipRect(corners.map(([x, y]) => {
    const k = y / s.y;
    return [x - k * s.x, Z_OUT - k * s.z];
  }), -IN_X, IN_X, -IN_Z, Z_IN);
  // 뒷벽(z = -IN_Z)에 비침
  const kb = (Z_OUT + IN_Z) / s.z;
  const back = clipRect(corners.map(([x, y]) => [x - kb * s.x, y - kb * s.y]), -IN_X, IN_X, 0, HUT.wallH);
  return { floor: floor.length >= 3 ? floor : [], back: back.length >= 3 ? back : [] };
}

/** 0.5도 간격 지평선 고도각 배열에서 방위각 az(도)의 값(선형 보간) */
export function horizonAt(arr, az) {
  const n = arr.length;
  const f = ((((az % 360) + 360) % 360) / 360) * n;
  const i = Math.floor(f) % n, t = f - Math.floor(f);
  return arr[i] * (1 - t) + arr[(i + 1) % n] * t;
}

/**
 * 어느 순간 창으로 해가 드는가.
 * @param {{alt:number, az:number}} sun
 * @param {number} facingAz 창 방향 방위각
 * @param {number[]|null} horizon 지평선 고도각 배열(없으면 지형 가림 무시)
 */
export function windowState(sun, facingAz, horizon) {
  if (sun.alt <= 0) return 'night';
  if (horizon && sun.alt <= horizonAt(horizon, sun.az)) return 'terrain';
  const s = toLocal(sunVector(sun.alt, sun.az), facingAz);
  return apertureRect(s) ? 'lit' : 'wall';
}

/**
 * 그날 하루(현지 시각 0시~24시) 1분 간격으로 창에 해가 드는 시간을 센다.
 * @param {{year:number, day:number, tz:number, lat:number, lon:number, facingAz:number, horizon?:number[]|null, step?:number}} p
 * @returns {{minutes:number, spans:Array<[number, number]>, daylight:number}} 해 드는 분, 해 드는 구간(현지 분), 해가 지평선 위에 있는 분(지형 무시)
 */
export function sunHours({ year, day, tz, lat, lon, facingAz, horizon = null, step = 1 }) {
  let minutes = 0, daylight = 0, start = null;
  const spans = [];
  for (let m = 0; m < 1440; m += step) {
    const sun = sunPosition(localToUtc(year, day, m + step / 2, tz), lat, lon);
    if (sun.alt > 0) daylight += step;
    const lit = windowState(sun, facingAz, horizon) === 'lit';
    if (lit) {
      minutes += step;
      if (start == null) start = m;
    } else if (start != null) {
      spans.push([start, m]);
      start = null;
    }
  }
  if (start != null) spans.push([start, 1440]);
  return { minutes, spans, daylight };
}
