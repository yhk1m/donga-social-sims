// © 2026 김용현
// 항로 자료와 운항 일수·운송비 계산.
// 좌표는 [경도, 위도]. 경유점은 교과서 113쪽 지도 「북동 항로와 기존 항로 비교」를 따라 바다 위로 잡은 설명용 경로다.
import { geoDistance } from 'd3-geo';

const R = 6371; // 지구 반지름(km)
export const KM_PER_KNOT_DAY = 1.852 * 24; // 1노트로 하루 가는 거리(km)

// 기존 항로: 부산 → 남중국해 → 말라카 해협 → 인도양 → 홍해 → 수에즈 운하 → 지중해 → 지브롤터 해협 → 로테르담
const SUEZ = [
  [129.04, 35.08], [128.6, 34.4], [126.5, 32.6], [123.5, 29.5], [121.2, 26.2], [119.8, 24.3], [117.5, 22.0], [114.5, 18.5], [111.5, 14.0], [109.6, 10.0], [106.8, 6.0], [104.5, 1.9], [104.0, 1.15], [103.4, 1.1],
  [102.6, 1.6], [101.4, 2.7], [99.6, 3.9], [98.2, 5.2], [96.5, 6.0], [94.0, 6.3], [88.0, 5.9], [82.0, 5.5], [79.5, 5.6], [74.0, 8.2], [66.0, 11.0], [58.0, 12.8], [51.5, 12.6], [47.0, 12.1], [43.4, 12.6],
  [42.0, 14.5], [40.0, 17.5], [38.3, 20.5], [36.6, 23.6], [35.0, 26.0], [33.9, 27.6], [32.9, 29.1], [32.56, 29.93], [32.35, 30.6], [32.32, 31.3],
  [30.5, 32.4], [26.0, 33.3], [22.5, 34.2], [18.5, 35.2], [15.2, 36.2], [12.0, 37.3], [8.5, 37.6], [4.0, 37.4], [0.0, 36.4], [-3.5, 36.0], [-5.6, 35.95], [-7.5, 36.3],
  [-9.5, 37.0], [-10.0, 38.8], [-9.8, 41.0], [-9.7, 43.3], [-7.0, 46.2], [-5.5, 48.3], [-3.5, 49.6], [-1.0, 50.2], [1.4, 50.9], [2.4, 51.4], [3.6, 51.85], [4.1, 51.95],
];

// 북동 항로: 부산 → 동해 → 쓰가루 해협 → 쿠릴 열도·캄차카반도 앞바다 → 베링 해협 → 러시아 북극해 연안 → 카라 해협 → 바렌츠해 → 노르웨이 앞바다 → 북해 → 로테르담
const NSR = [
  [129.04, 35.08], [129.6, 35.3], [130.1, 36.5], [131.0, 38.6], [134.0, 40.6], [138.5, 41.6], [140.2, 41.55], [141.6, 41.4], [143.5, 41.4], [145.5, 42.4], [148.5, 44.6], [152.0, 46.6], [156.5, 49.5], [160.5, 52.2], [163.5, 55.0],
  [167.0, 57.6], [171.0, 60.0], [176.0, 61.0], [-179.5, 62.0], [-175.5, 63.0], [-172.0, 64.0], [-170.6, 64.9], [-169.0, 65.9], [-169.5, 67.4], [-172.5, 68.6], [-177.0, 69.6], [178.0, 70.0], [172.0, 70.1],
  [165.0, 70.6], [158.0, 71.4], [150.0, 72.4], [143.5, 72.8], [141.0, 73.0], [138.5, 73.5], [137.0, 73.9], [130.0, 74.6], [122.0, 76.0], [113.0, 77.1], [106.5, 77.9], [104.0, 77.95], [101.0, 77.8],
  [96.0, 77.0], [89.0, 76.2], [82.0, 75.0], [75.0, 74.2], [69.0, 73.9], [64.5, 71.8], [60.5, 70.6], [58.6, 70.4], [55.0, 70.2], [50.0, 70.6], [44.0, 71.0], [36.0, 71.2], [28.0, 71.6], [22.0, 71.0],
  [17.0, 70.2], [13.0, 68.9], [10.0, 67.2], [7.5, 65.0], [5.0, 63.0], [3.8, 61.0], [3.7, 58.5], [3.4, 56.0], [3.6, 53.6], [3.9, 52.3], [4.1, 51.95],
];
// 북극해 얼음 구간(북극 항로 구간): 베링 해협 ~ 카라 해협
const ICE_FROM = [-169.0, 65.9], ICE_TO = [58.6, 70.4];

function table(pts, km) {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + geoDistance(pts[i - 1], pts[i]) * R);
  const drawn = cum[cum.length - 1];
  // 그린 경로 길이를 교과서 거리(약 22,000km / 15,000km)에 맞춰 늘이거나 줄인다
  const k = km / drawn;
  return { pts, cum: cum.map((c) => c * k), km, drawnKm: drawn };
}
const idx = (pts, p) => pts.findIndex((q) => q[0] === p[0] && q[1] === p[1]);

// 교과서 113쪽 자료1: 기존 항로 약 22,000km, 북동 항로 약 15,000km (『한국무역신문』, 2022. 8. 12.)
export const ROUTES = {
  suez: { id: 'suez', name: '기존 항로', via: '수에즈 운하 경유', color: '#1f63c6', ...table(SUEZ, 22000) },
  nsr: { id: 'nsr', name: '북동 항로', via: '북극해 경유', color: '#d6247a', ...table(NSR, 15000) },
};
ROUTES.nsr.iceFrom = ROUTES.nsr.cum[idx(NSR, ICE_FROM)];
ROUTES.nsr.iceTo = ROUTES.nsr.cum[idx(NSR, ICE_TO)];

/** 경로 위 d km 지점의 [경도, 위도]와 다음 점 */
export function pointAt(route, d) {
  const { pts, cum } = route;
  const dd = Math.max(0, Math.min(route.km, d));
  let i = 1;
  while (i < cum.length - 1 && cum[i] < dd) i++;
  const f = (dd - cum[i - 1]) / (cum[i] - cum[i - 1] || 1);
  const a = pts[i - 1], b = pts[i];
  let dl = b[0] - a[0];
  if (dl > 180) dl -= 360; else if (dl < -180) dl += 360;
  return [a[0] + dl * f, a[1] + (b[1] - a[1]) * f];
}
/** 출발부터 d km 까지의 경유점(지나온 길 그리기용) */
export function pathUpTo(route, d) {
  const out = [];
  for (let i = 0; i < route.pts.length && route.cum[i] < d; i++) out.push(route.pts[i]);
  out.push(pointAt(route, d));
  return out;
}

// ---------------- 가정(교과서에 없는 값, 설명용) ----------------
// 대형 컨테이너선 한 척이 한 번 편도 운항한다고 가정한 대략적인 값이다. 실제 비용은 배 크기·연료값·환율·계약에 따라 크게 달라진다.
export const ASSUME = {
  baseFuel: 50,        // 12노트로 달릴 때 하루 연료 사용량(톤). 속도의 세제곱에 비례한다고 가정
  baseKnot: 12,
  fuelPrice: 90,       // 연료 1톤 값(만 원) — 사용자가 바꿀 수 있음
  opsPerDay: 3000,     // 하루 선박 운영비(선원 인건비·배 빌리는 값 등, 만 원)
  suezToll: 70000,     // 수에즈 운하 통행료(만 원) ≈ 7억 원
  icebreaker: 50000,   // 북동 항로 쇄빙선 안내·도선료(만 원) ≈ 5억 원
  insurance: 10000,    // 얼음 바다 추가 보험료(만 원) ≈ 1억 원
  iceKnot: 9,          // 얼음 구간(베링 해협~카라 해협) 최고 속도(노트)
};

/** 운항 계획: 구간별 [시작 km, 끝 km, 노트] */
function legs(route, knot) {
  if (route.id === 'suez') return [[0, route.km, knot]];
  const ik = Math.min(knot, ASSUME.iceKnot);
  return [[0, route.iceFrom, knot], [route.iceFrom, route.iceTo, ik], [route.iceTo, route.km, knot]];
}

/** 운항 일수·비용 계산 (돈 단위: 만 원) */
export function plan(route, knot, fuelPrice) {
  const L = legs(route, knot).map(([a, b, v]) => {
    const days = (b - a) / (v * KM_PER_KNOT_DAY);
    const fuelPerDay = ASSUME.baseFuel * (v / ASSUME.baseKnot) ** 3;
    return { a, b, v, days, fuel: days * fuelPerDay };
  });
  const days = L.reduce((s, l) => s + l.days, 0);
  const fuelTon = L.reduce((s, l) => s + l.fuel, 0);
  const fuelCost = fuelTon * fuelPrice;
  const opsCost = days * ASSUME.opsPerDay;
  const extra = route.id === 'suez'
    ? [{ k: '수에즈 운하 통행료', v: ASSUME.suezToll }]
    : [{ k: '쇄빙선 안내·도선료', v: ASSUME.icebreaker }, { k: '얼음 바다 추가 보험료', v: ASSUME.insurance }];
  const extraCost = extra.reduce((s, e) => s + e.v, 0);
  // 출발 후 t일에 간 거리(km)
  const distAt = (t) => {
    let tt = t;
    for (const l of L) {
      if (tt <= l.days) return l.a + tt * l.v * KM_PER_KNOT_DAY;
      tt -= l.days;
    }
    return route.km;
  };
  return { legs: L, days, fuelTon, fuelCost, opsCost, extra, extraCost, total: fuelCost + opsCost + extraCost, distAt };
}
