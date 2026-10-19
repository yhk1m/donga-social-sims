// © 2026 김용현
// 북태평양 표층 해류 "모형" — 실제 관측 자료가 아니라 교과서 지도(미국 해양 대기청, 2023)의
// 해류 모양을 흉내 낸 단순한 속도장이다.
//   1) 아열대 환류(시계 방향): 스토멜(Stommel) 형 흐름 함수 — 서쪽 가장자리(쿠로시오)는 빠르고, 가운데·동쪽은 느리다.
//   2) 아한대 환류(시계 반대 방향): 오야시오·알래스카 해류 쪽 작은 순환.
//   3) 적도 반류: 북위 4~8° 부근의 동쪽 흐름 띠.
//   4) 에크만 수렴: 바람(편서풍·무역풍) 때문에 표층 물이 환류 가운데로 아주 천천히 모이는 성분.
// 속도 단위는 m/s, 경위도는 경도 0~360(동경 기준, 서경 150° = 210).
// 빠르기 크기: 쿠로시오 최대 약 1.1 m/s(실제 1~2 m/s), 쓰레기 지대 가운데 0.05 m/s 안팎이 되도록 맞췄다.

const DEG = Math.PI / 180;
const KM_PER_DEG = 111.2;

// 아열대 환류 서쪽 가장자리(쿠로시오가 흐르는 선) — 필리핀 동쪽 → 타이완 동쪽 → 동중국해 대륙붕 끝 → 일본 남쪽
const WEST = [[8, 127.5], [14, 124.5], [19, 123], [23, 122.6], [26, 124.5], [29, 128.5], [31.5, 132.5], [34, 138.5], [36, 141.5], [42, 145]];
const lerpTable = (tab, v) => {
  if (v <= tab[0][0]) return tab[0][1];
  for (let i = 1; i < tab.length; i++) {
    if (v <= tab[i][0]) { const [a, b] = [tab[i - 1], tab[i]]; return a[1] + (b[1] - a[1]) * (v - a[0]) / (b[0] - a[0]); }
  }
  return tab[tab.length - 1][1];
};

// 아열대 환류 범위
const ST = { s: 9, n: 44, e: 241, delta: 0.045 };
// 아한대 환류 범위(서쪽 = 쿠릴 열도·캄차카, 동쪽 = 알래스카 남동 해안)
const SP = { s: 43, n: 60, e: 228, delta: 0.06 };
// 아한대 환류 서쪽 가장자리: 홋카이도 동쪽 → 쿠릴 열도 → 캄차카반도 동쪽 해안
const SP_WEST = [[43, 146.5], [47, 152.5], [51, 157.8], [55, 162.3], [60, 166]];

// 스토멜 형 동서 모양: x=0(서) 에서 0, 서쪽 가까이서 최대, x=1(동) 에서 0
const shapeX = (x, d) => (x <= 0 ? 0 : x >= 1 ? 0 : (1 - x) * (1 - Math.exp(-x / d)));

function psiSub(lon, lat) {
  if (lat <= ST.s || lat >= ST.n) return 0;
  const w = lerpTable(WEST, lat);
  const x = (lon - w) / (ST.e - w);
  const y = (lat - ST.s) / (ST.n - ST.s);
  // y^1.25 : 흐름이 바뀌는 중심선을 북위 30° 부근으로 올림
  return Math.sin(Math.PI * Math.pow(y, 1.25)) * shapeX(x, ST.delta);
}
function psiPolar(lon, lat) {
  if (lat <= SP.s || lat >= SP.n) return 0;
  const e = SP.e + (lat - SP.s) * 0.4; // 알래스카 해안은 북쪽으로 갈수록 서쪽이 아니라 대략 남북 방향
  const w = lerpTable(SP_WEST, lat);
  const x = (lon - w) / (e - w);
  const y = (lat - SP.s) / (SP.n - SP.s);
  return -0.45 * Math.sin(Math.PI * y) * shapeX(x, SP.delta);
}
const psi = (lon, lat) => psiSub(lon, lat) + psiPolar(lon, lat);

// 수렴 중심: 동쪽 쓰레기 지대(하와이와 캘리포니아 사이), 서쪽 쓰레기 지대(일본 동쪽)
export const PATCH_E = { lon: 213, lat: 30.5, pullLat: 33.5, pullLon: 217, rx: 12, ry: 6, kv: 1.3, name: '동쪽 쓰레기 지대' }; // 그리는 범위: 대략 서경 159~135°, 북위 25~36°
export const PATCH_W = { lon: 148, lat: 30, pullLat: 30.5, pullLon: 148, rx: 9, ry: 5, kv: 0.8, name: '서쪽 쓰레기 지대' };

let SCALE = 1; // 흐름 함수 → m/s 환산(아래 calibrate 에서 정함)

function rawVel(lon, lat) {
  // 흐름 함수의 수치 미분: u = -dψ/dy, v = dψ/dx (km 단위)
  const h = 0.05;
  const kx = KM_PER_DEG * Math.cos(lat * DEG);
  const dpdy = (psi(lon, lat + h) - psi(lon, lat - h)) / (2 * h * KM_PER_DEG);
  const dpdx = (psi(lon + h, lat) - psi(lon - h, lat)) / (2 * h * kx);
  return [-dpdy, dpdx];
}

// 해석식 그대로의 속도(경계에서 끊기는 곳이 있음 — 아래에서 격자에 담아 부드럽게 만든 뒤 쓴다)
function currentRaw(lon, lat) {
  let [u, v] = rawVel(lon, lat);
  u *= SCALE; v *= SCALE;
  // 서쪽 가장자리보다 더 서쪽(동중국해 등): 쿠로시오 쪽으로 빨려 들어가는 북동쪽 흐름을 약하게 이어 줌
  if (lat > 12 && lat < 37) {
    const w = lerpTable(WEST, lat);
    if (lon < w + 0.6) {
      const [ub, vb] = rawVel(w + 0.6, lat);
      const k = Math.exp((lon - w - 0.6) / 2.5) * smoothBox(lat, 12, 37, 3);
      u = ub * SCALE * k + 0.08 * k; v = vb * SCALE * k;
    }
  }
  // 캘리포니아 해류: 해안에서 조금 떨어져 남쪽으로 흐르다 북위 25° 아래에서 서쪽으로 꺾여 북적도 해류와 만남
  {
    const c = 234.5 + (46 - lat) * 0.33;
    const g = Math.exp(-(((lon - c) / 3.8) ** 2)) * smoothBox(lat, 17, 49, 7);
    const turn = Math.min(1, Math.max(0, (30 - lat) / 10)); // 남쪽으로 갈수록 서쪽 성분
    v -= 0.15 * g * (1 - turn * 0.7);
    u -= 0.12 * g * turn;
  }
  // 적도 반류(동쪽 흐름 띠, 북위 4~8°)
  const ecc = Math.exp(-(((lat - 6) / 2) ** 2)) * smoothBox(lon, 128, 255, 6);
  u += 0.32 * ecc;
  // 적도 반류 남쪽의 남적도 해류 일부(서쪽 흐름) — 지도 아래 가장자리
  u -= 0.25 * Math.exp(-(((lat - 0) / 2.5) ** 2)) * smoothBox(lon, 130, 265, 8);
  // 북적도 해류를 적도 반류 쪽 가장자리까지 이어 줌(환류 남쪽 끝이 0 이 되지 않게)
  u -= 0.18 * Math.exp(-(((lat - 11.5) / 2.2) ** 2)) * smoothBox(lon, 125, 248, 8);
  return [u, v];
}

/** 쓰레기(떠 있는 물체)가 실제로 움직이는 속도 = 해류 + 에크만 수렴(아주 약함) */
export function drift(lon, lat) {
  const [u, v] = current(lon, lat);
  const [cu, cv] = convergence(lon, lat);
  return [u + cu, v + cv];
}

/** 바람에 의한 수렴: 아열대 환류 안쪽에서 중심 쪽으로 몇 cm/s */
export function convergence(lon, lat) {
  const inGyre = smoothBox(lat, 14, 44, 4) * smoothBox(lon, 128, 240, 6);
  if (inGyre <= 0) return [0, 0];
  // 남북: 편서풍(북쪽)은 남쪽으로, 무역풍(남쪽)은 북쪽으로 표층 물을 민다 → 북위 32° 부근으로 모임
  let cv = -0.024 * Math.tanh((lat - 32) / 6) * smoothBox(lon, 158, 300, 18);
  // 동서: 두 쓰레기 지대 중심 쪽으로 끌림(동쪽이 더 넓고 강함)
  let cu = 0;
  for (const [p, a] of [[PATCH_E, 0.07], [PATCH_W, 0.03]]) {
    const dx = (lon - p.pullLon) / (p.rx * 1.6), dy = (lat - p.pullLat) / (p.ry * 1.8);
    const g = Math.exp(-(dx * dx + dy * dy));
    cu -= a * Math.tanh(dx * 1.4) * g;
    cv -= a * p.kv * Math.tanh(dy * 1.4) * g;
  }
  return [cu * inGyre, cv * inGyre];
}

function smoothBox(v, a, b, w) {
  const s1 = Math.min(1, Math.max(0, (v - a) / w));
  const s2 = Math.min(1, Math.max(0, (b - v) / w));
  return Math.min(s1, s2);
}

// 쿠로시오(서쪽 가장자리) 빠르기가 실제(1~2 m/s)와 비슷해지도록 환산값을 정한다
(function calibrate() {
  let mx = 0;
  for (let lat = 20; lat <= 35; lat += 0.5) {
    const w = lerpTable(WEST, lat);
    for (let lon = w; lon < w + 8; lon += 0.1) {
      const [u, v] = rawVel(lon, lat);
      mx = Math.max(mx, Math.hypot(u, v));
    }
  }
  SCALE = 1.8 / mx; // 격자에 담아 흐리게 하면 최대값이 줄어 실제 표시는 약 1.1 m/s
})();

// ---------- 해류 격자(0.5°) — 해석식 값을 담고 살짝 흐리게(상자 평균 3번) 해서 경계의 끊김을 없앤다 ----------
export const GRID = { lon0: 105, lon1: 262, lat0: -8, lat1: 66, res: 0.5 };
const NX = Math.round((GRID.lon1 - GRID.lon0) / GRID.res) + 1, NY = Math.round((GRID.lat1 - GRID.lat0) / GRID.res) + 1;
const CU = new Float32Array(NX * NY), CV = new Float32Array(NX * NY);
(function buildCurrentGrid() {
  for (let j = 0; j < NY; j++) {
    const lat = GRID.lat0 + j * GRID.res;
    const fade = smoothBox(lat, -8, 64, 3);
    for (let i = 0; i < NX; i++) {
      const [u, v] = currentRaw(GRID.lon0 + i * GRID.res, lat);
      CU[j * NX + i] = u * fade; CV[j * NX + i] = v * fade;
    }
  }
  const tmp = new Float32Array(NX * NY);
  const blur = (A) => {
    for (let pass = 0; pass < 3; pass++) {
      for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
        const a = A[j * NX + Math.max(0, i - 1)], b = A[j * NX + i], c = A[j * NX + Math.min(NX - 1, i + 1)];
        tmp[j * NX + i] = (a + b + c) / 3;
      }
      for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
        const a = tmp[Math.max(0, j - 1) * NX + i], b = tmp[j * NX + i], c = tmp[Math.min(NY - 1, j + 1) * NX + i];
        A[j * NX + i] = (a + b + c) / 3;
      }
    }
  };
  blur(CU); blur(CV);
})();

/** (lon, lat) 에서 표층 해류 속도 [u(동쪽+), v(북쪽+)] m/s — 해류 그림·빠르기 표시용(수렴 성분 빼고) */
export function current(lon, lat) {
  let x = (lon - GRID.lon0) / GRID.res, y = (lat - GRID.lat0) / GRID.res;
  if (x < 0 || y < 0 || x > NX - 1 || y > NY - 1) return [0, 0];
  x = Math.min(NX - 1.001, x); y = Math.min(NY - 1.001, y);
  const i = x | 0, j = y | 0, fx = x - i, fy = y - j, k = j * NX + i;
  return [
    (CU[k] * (1 - fx) + CU[k + 1] * fx) * (1 - fy) + (CU[k + NX] * (1 - fx) + CU[k + NX + 1] * fx) * fy,
    (CV[k] * (1 - fx) + CV[k + 1] * fx) * (1 - fy) + (CV[k + NX] * (1 - fx) + CV[k + NX + 1] * fx) * fy,
  ];
}

export const speed = (lon, lat) => { const [u, v] = current(lon, lat); return Math.hypot(u, v); };

/** m/s → 하루에 움직이는 경위도(도/일) */
export function toDegPerDay(u, v, lat) {
  const kmDay = 86.4; // 1 m/s = 86.4 km/일
  return [(u * kmDay) / (KM_PER_DEG * Math.cos(lat * DEG)), (v * kmDay) / KM_PER_DEG];
}

// ---------- 이동 속도도 격자로 미리 계산(입자 수천 개를 빠르게 움직이기 위해) ----------
/** 이동 속도(경도/일, 위도/일)를 격자에 미리 계산해 두고 쌍선형 보간으로 꺼내 쓰는 함수 */
export function makeSampler(fn = drift) {
  const { lon0, lat0, res } = GRID;
  const nx = Math.round((GRID.lon1 - lon0) / res) + 1, ny = Math.round((GRID.lat1 - lat0) / res) + 1;
  const U = new Float32Array(nx * ny), V = new Float32Array(nx * ny);
  for (let j = 0; j < ny; j++) {
    const lat = lat0 + j * res;
    for (let i = 0; i < nx; i++) {
      const [u, v] = fn(lon0 + i * res, lat);
      const [a, b] = toDegPerDay(u, v, lat);
      U[j * nx + i] = a; V[j * nx + i] = b;
    }
  }
  return (lon, lat) => {
    let x = (lon - lon0) / res, y = (lat - lat0) / res;
    x = Math.min(nx - 1.001, Math.max(0, x)); y = Math.min(ny - 1.001, Math.max(0, y));
    const i = x | 0, j = y | 0, fx = x - i, fy = y - j, k = j * nx + i;
    const u = (U[k] * (1 - fx) + U[k + 1] * fx) * (1 - fy) + (U[k + nx] * (1 - fx) + U[k + nx + 1] * fx) * fy;
    const v = (V[k] * (1 - fx) + V[k + 1] * fx) * (1 - fy) + (V[k + nx] * (1 - fx) + V[k + nx + 1] * fx) * fy;
    return [u, v];
  };
}

// ---------- 육지 판정(경위도 격자) ----------
// 다각형을 행마다 가로로 잘라 채우는(scanline, 짝홀 규칙) 방식 — 캔버스 없이도 돈다
export function buildLandMask(rings, { lon0 = 95, lon1 = 275, lat0 = -20, lat1 = 72, res = 0.25 } = {}) {
  const nx = Math.round((lon1 - lon0) / res), ny = Math.round((lat1 - lat0) / res);
  const cells = new Uint8Array(nx * ny);
  for (let j = 0; j < ny; j++) {
    const lat = lat0 + (j + 0.5) * res;
    const xs = [];
    for (const r of rings) {
      for (let i = 0, k = r.length - 1; i < r.length; k = i++) {
        const [xa, ya] = r[k], [xb, yb] = r[i];
        if ((ya > lat) !== (yb > lat)) xs.push(xa + ((lat - ya) / (yb - ya)) * (xb - xa));
      }
    }
    xs.sort((a, b) => a - b);
    for (let q = 0; q + 1 < xs.length; q += 2) {
      const i0 = Math.max(0, Math.ceil((xs[q] - lon0) / res - 0.5));
      const i1 = Math.min(nx - 1, Math.floor((xs[q + 1] - lon0) / res - 0.5));
      for (let i = i0; i <= i1; i++) cells[j * nx + i] = 1;
    }
  }
  const isLand = (lon, lat) => {
    const i = Math.floor((lon - lon0) / res), j = Math.floor((lat - lat0) / res);
    if (i < 0 || j < 0 || i >= nx || j >= ny) return false;
    return cells[j * nx + i] === 1;
  };
  return { isLand, nx, ny, lon0, lat0, res, cells };
}
