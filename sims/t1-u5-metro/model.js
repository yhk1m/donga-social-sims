// © 2026 김용현
// 가상 도시 모형 — 시각(연도)만 넣으면 칸마다 토지 이용·높이·지가·인구가 정해진다.
// 난수는 모두 고정 씨앗에서 나오므로 어느 교실에서 열어도 같은 도시가 그려진다.

export const YEAR_MIN = 1960;
export const YEAR_MAX = 2020;
export const N = 60;             // 칸 수(가로·세로)
export const HALF = N / 2;

// 토지 이용 종류
export const USE = { FARM: 0, FOREST: 1, WATER: 2, ROAD: 3, RAIL: 4, COM: 5, RES: 6, IND: 7 };

// ---------- 고정 씨앗 난수 ----------
function hash(i, j, s) {
  let h = Math.imul(i * 374761393 + j * 668265263 + s * 2147483647, 1274126177) ^ 0x5bd1e995;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function smooth(t) { return t * t * (3 - 2 * t); }
export function smoothstep(a, b, x) { return x <= a ? 0 : x >= b ? 1 : smooth((x - a) / (b - a)); }
function valueNoise(x, z, scale, s) {
  const fx = x / scale, fz = z / scale;
  const x0 = Math.floor(fx), z0 = Math.floor(fz);
  const tx = smooth(fx - x0), tz = smooth(fz - z0);
  const a = hash(x0, z0, s), b = hash(x0 + 1, z0, s), c = hash(x0, z0 + 1, s), d = hash(x0 + 1, z0 + 1, s);
  return (a * (1 - tx) + b * tx) * (1 - tz) + (c * (1 - tx) + d * tx) * tz;
}
// 연도별 꺾은선 보간
function keyed(keys, t) {
  if (t <= keys[0][0]) return keys[0][1];
  for (let k = 1; k < keys.length; k++) {
    if (t <= keys[k][0]) {
      const [t0, v0] = keys[k - 1], [t1, v1] = keys[k];
      return v0 + (v1 - v0) * smooth((t - t0) / (t1 - t0));
    }
  }
  return keys[keys.length - 1][1];
}

// ---------- 시나리오 ----------
// text 의 **낱말** 은 교과서 핵심 용어 — 화면에서 굵게 표시한다
export const STAGES = [
  {
    key: 'form', from: 1960, to: 1972, name: '도시 형성', short: '형성',
    text: '**산업화**로 공장이 들어서자 농촌 사람들이 일자리를 찾아 도시로 모여든다. 전체 인구 중 도시 인구 비율이 높아지는 **도시화**가 시작되고, 아직 도심에는 상업·주거·공업 기능이 뒤섞여 있다.',
  },
  {
    key: 'grow', from: 1972, to: 1985, name: '도시 성장 — 도심 고밀화', short: '성장',
    text: '인구가 밀집하고 **지가가 상승**하면서 도심에 고층 건물이 들어서는 **토지의 집약적 이용**이 나타난다. 땅값을 감당할 수 있는 상업·업무 기능이 도심에 모이며 **기능 분화**가 이루어진다.',
  },
  {
    key: 'sub', from: 1985, to: 2000, name: '교외화', short: '교외화',
    text: '비싼 도심을 떠나 주거·공업 기능이 도시 주변 지역으로 분산된다. 이를 **교외화**라고 한다. 고속 국도와 전철을 따라 신도시와 공업 단지가 들어서고, 도심 거주 인구는 줄어든다.',
  },
  {
    key: 'metro', from: 2000, to: 2020, name: '대도시권 형성', short: '대도시권',
    text: '분산된 기능들이 교통망으로 중심 도시와 연계되면서 **통근**권이 넓어지고 **대도시권**이 형성된다. **위성 도시**는 대도시와 밀접한 관계를 가지며 그 기능의 일부를 분담한다.',
  },
];
export function stageAt(t) {
  for (let i = STAGES.length - 1; i >= 0; i--) if (t >= STAGES[i].from) return i;
  return 0;
}

// 주변 도시: 위치, 시작 연도, 최대 반지름, 성격
export const SATS = [
  { id: 'B', x: -21, z: -4, start: 1974, rmax: 3.4, kind: 'sat', label: '위성 도시' },
  { id: 'D', x: 20, z: 10, start: 1983, rmax: 3.4, kind: 'ind', label: '공업 단지' },
  { id: 'A', x: 15, z: -16, start: 1988, rmax: 3.6, kind: 'new', label: '신도시' },
  { id: 'C', x: 4, z: 21, start: 1994, rmax: 3.3, kind: 'new', label: '신도시' },
  { id: 'E', x: -15, z: 17, start: 2003, rmax: 3.0, kind: 'new', label: '신도시' },
];

// 교통로: 도심에서 바깥으로 뻗는 꺾은선. open 연도부터 4년에 걸쳐 바깥쪽으로 뚫린다.
export const LINES = [
  { type: 'road', open: 1970, pts: [[1.5, -0.3], [-21, -4], [-30, -5.5]], to: 'B' },
  { type: 'road', open: 1980, pts: [[1.4, 0.8], [20, 10], [30, 13.5]], to: 'D' },
  { type: 'road', open: 1985, pts: [[0.4, 1.6], [4, 21], [5.5, 30]], to: 'C' },
  { type: 'road', open: 1987, pts: [[0.9, -1.2], [15, -16], [22, -30]], to: 'A' },
  { type: 'rail', open: 1990, pts: [[3, -3.6], [13.2, -17.6], [17.5, -30]], to: 'A' },
  { type: 'rail', open: 1993, pts: [[-3.5, -1.9], [-20.5, -6.2], [-30, -8.2]], to: 'B' },
  { type: 'rail', open: 1996, pts: [[2.2, 3.4], [6, 21.5], [9.5, 30]], to: 'C' },
  { type: 'rail', open: 2004, pts: [[-2.4, 3.2], [-15, 17], [-21, 30]], to: 'E' },
];
for (const L of LINES) {
  L.segLen = [];
  L.len = 0;
  for (let k = 1; k < L.pts.length; k++) {
    const d = Math.hypot(L.pts[k][0] - L.pts[k - 1][0], L.pts[k][1] - L.pts[k - 1][1]);
    L.segLen.push(d);
    L.len += d;
  }
}
// 열린 길이 비율 0~1
export function lineOpen(L, t) { return smoothstep(L.open, L.open + 4, t); }

// 점에서 꺾은선까지 거리와, 시작점부터 따라간 거리
function distToLine(L, x, z) {
  let best = Infinity, along = 0, acc = 0;
  for (let k = 1; k < L.pts.length; k++) {
    const [ax, az] = L.pts[k - 1], [bx, bz] = L.pts[k];
    const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
    let u = ((x - ax) * dx + (z - az) * dz) / l2;
    u = Math.max(0, Math.min(1, u));
    const d = Math.hypot(x - (ax + u * dx), z - (az + u * dz));
    if (d < best) { best = d; along = acc + u * L.segLen[k - 1]; }
    acc += L.segLen[k - 1];
  }
  return { d: best, along };
}

// 강: 서쪽에서 동쪽으로 도심 남쪽을 휘감아 흐른다
export function riverZ(x) { return 4.2 + 2.6 * Math.sin(x / 8.5) + 0.8 * Math.sin(x / 3.7 + 1); }

// ---------- 시간 곡선 ----------
const R_CITY = [[1960, 3.4], [1970, 5.6], [1980, 8.6], [1990, 11], [2000, 12.4], [2020, 13.4]];
const R_COM = [[1960, 1.3], [1972, 2.1], [1985, 3.6], [2000, 4.4], [2020, 4.9]];
const H_COM = [[1960, 0.7], [1970, 1.8], [1980, 4.4], [1990, 6.8], [2005, 8.8], [2020, 10]];
const PRICE = [[1960, 0.06], [1970, 0.16], [1980, 0.38], [1990, 0.66], [2000, 0.82], [2020, 1]];

// ---------- 칸 고정 속성 (한 번만 계산) ----------
export const cells = [];
for (let j = 0; j < N; j++) {
  for (let i = 0; i < N; i++) {
    const x = i - HALF + 0.5, z = j - HALF + 0.5;
    const r = Math.hypot(x, z);
    const n1 = valueNoise(x, z, 5, 11);
    const c = {
      i, j, x, z, r,
      rr: r * (0.84 + 0.32 * n1),        // 테두리를 울퉁불퉁하게 만든 거리
      h1: hash(i, j, 1), h2: hash(i, j, 2), h3: hash(i, j, 3), h4: hash(i, j, 4), h5: hash(i, j, 5),
      water: Math.abs(z - riverZ(x)) < 0.95,
      forest: valueNoise(x, z, 7, 23) > 0.66 && r > 9,
      line: null,       // 이 칸을 지나는 교통로
      lineAlong: 0,
      sat: null, sd: 0, // 가장 가까운 주변 도시와 그 거리(울퉁불퉁)
      corridor: null, corrAlong: 0,
      riverside: false,
    };
    c.riverside = !c.water && Math.abs(z - riverZ(x)) < 3 && r > 2.6 && r < 9.5;
    for (const L of LINES) {
      const { d, along } = distToLine(L, x, z);
      if (d < 0.62 && !c.line && along > (L.type === 'rail' ? 1.5 : 0.5)) { c.line = L; c.lineAlong = along; }
      if (L.type === 'road' && d >= 0.62 && d < 2.6 && !c.corridor) { c.corridor = L; c.corrAlong = along; }
    }
    let bestS = Infinity;
    for (const S of SATS) {
      const d = Math.hypot(x - S.x, z - S.z) * (0.82 + 0.36 * n1);
      if (d < bestS) { bestS = d; c.sat = S; c.sd = d; }
    }
    if (c.water) { c.line = null; } // 다리는 리본으로만 그린다
    cells.push(c);
  }
}

// 주변 도시 반지름
export function satRadius(S, t) {
  return 1.1 + (S.rmax - 1.1) * smoothstep(S.start, S.start + 14, t);
}
export function satActive(S, t) { return smoothstep(S.start, S.start + 6, t); }

// 칸이 시가지가 되는 연도(없으면 Infinity)를 미리 구한다
const urbanYear = new Float32Array(cells.length).fill(Infinity);
for (let y = YEAR_MIN - 6; y <= YEAR_MAX; y += 0.25) {
  const rc = keyed(R_CITY, y);
  for (let k = 0; k < cells.length; k++) {
    if (urbanYear[k] !== Infinity) continue;
    const c = cells[k];
    if (c.water || c.line) continue;
    let urban = c.rr < rc;
    if (!urban && c.sd < satRadius(c.sat, y) && (y >= c.sat.start || c.sd < 1.25)) {
      // 옛 읍내(반지름 1.1)는 처음부터 있다
      urban = c.sat.start <= y || c.h2 < 0.55;
    }
    if (!urban && c.corridor) {
      // 고속 국도를 따라 띠 모양으로 시가지가 뻗는다
      const L = c.corridor;
      const reach = L.len * smoothstep(L.open + 5, L.open + 22, y);
      if (c.corrAlong < reach && c.h1 < 0.42) urban = true;
    }
    if (urban) urbanYear[k] = y;
  }
}
for (let k = 0; k < cells.length; k++) cells[k].urbanYear = urbanYear[k];

// ---------- 연도별 상태 ----------
// out: { use: Uint8Array, h: Float32Array, price: Float32Array, pop: Float32Array }
export function makeState() {
  const n = cells.length;
  return { use: new Uint8Array(n), h: new Float32Array(n), price: new Float32Array(n), pop: new Float32Array(n), grow: new Float32Array(n) };
}

export function computeState(t, st) {
  const rCom = keyed(R_COM, t);
  const hCom = keyed(H_COM, t);
  const pLevel = keyed(PRICE, t);
  for (let k = 0; k < cells.length; k++) {
    const c = cells[k];
    let use, h, pop = 0;
    const grow = smoothstep(c.urbanYear, c.urbanYear + 2.5, t);
    if (c.water) { use = USE.WATER; h = 0.02; }
    else if (c.line && t >= c.line.open && c.lineAlong <= c.line.len * lineOpen(c.line, t)) {
      use = c.line.type === 'road' ? USE.ROAD : USE.RAIL; h = 0.05;
    }
    else if (t < c.urbanYear) {
      use = c.forest ? USE.FOREST : USE.FARM;
      h = c.forest ? 0.32 + 0.25 * c.h3 : 0.06;
    }
    else {
      const inSat = c.sd < c.sat.rmax + 0.2 && c.rr >= keyed(R_CITY, c.urbanYear) - 0.01;
      if (inSat) {
        const S = c.sat;
        const age = t - S.start;
        if (c.sd < 1.25 && age > 6 && S.kind !== 'ind') { use = USE.COM; h = 0.6 + 2.4 * smoothstep(S.start + 6, S.start + 22, t) * (0.6 + 0.6 * c.h5); }
        else if (S.kind === 'ind') { use = c.h3 < 0.72 ? USE.IND : USE.RES; }
        else if (S.kind === 'sat') { use = c.h3 < 0.38 ? USE.IND : USE.RES; }
        else use = USE.RES;
        if (use === USE.IND) h = 0.45 + 0.2 * c.h5;
        if (use === USE.RES) {
          // 신도시는 고층 아파트 단지, 옛 읍내는 낮은 주택
          const apt = S.kind === 'new' || (S.kind === 'sat' && t > 1992 && c.h4 < 0.5);
          h = apt ? 0.4 + (1.4 + 1.3 * c.h5) * smoothstep(Math.max(S.start, 1990), Math.max(S.start, 1990) + 8, t) : 0.3 + 0.2 * c.h5;
          if (age < 0) h = 0.3 + 0.15 * c.h5;
          pop = h * 0.9;
        }
      }
      else if (c.r > keyed(R_CITY, YEAR_MAX) + 0.5 && c.corridor) {
        // 국도변 띠 시가지: 주택과 물류 창고·공장
        use = c.h4 < 0.35 ? USE.IND : USE.RES;
        h = use === USE.IND ? 0.4 + 0.2 * c.h5 : 0.3 + 0.25 * c.h5;
        if (use === USE.RES) pop = h * 0.8;
      }
      else {
        // 중심 도시
        const sortYear = 1966 + 16 * c.h2;   // 이때까지는 기능이 뒤섞여 있다
        const relocate = 1985 + 15 * c.h4;   // 도심 주변 공장이 교외로 옮겨 가는 해
        if (c.rr < rCom) { use = USE.COM; }
        else if (t < sortYear && c.r < 9) {
          use = c.h3 < 0.28 ? USE.COM : c.h3 < 0.5 ? USE.IND : USE.RES;
        }
        else if (c.riverside && t < relocate && c.urbanYear < 1980) use = USE.IND;
        else use = USE.RES;
        if (use === USE.COM) {
          const core = Math.exp(-c.rr / 2.1);
          h = c.rr < rCom ? 0.45 + hCom * core * (0.55 + 0.9 * c.h5) : 0.5 + 0.3 * c.h5;
          pop = c.rr < rCom ? 0.08 : 0.3;
        } else if (use === USE.IND) {
          h = 0.42 + 0.22 * c.h5;
        } else {
          // 1990년 이후 낡은 주택가·공장 터가 아파트로 재개발된다
          const redevelop = (c.h4 > 0.6 || (c.riverside && t >= relocate)) ? smoothstep(1988 + 12 * c.h1, 1996 + 12 * c.h1, t) : 0;
          h = 0.3 + 0.22 * c.h5 + redevelop * (0.6 + 0.7 * c.h5);
          // 도심 가까이는 1980년대까지 촘촘한 저층 주거지(인구 밀도 높음)
          pop = h * 0.9 + (c.r < 7 ? 0.35 : 0.1);
        }
      }
      h *= 0.25 + 0.75 * grow;
      pop *= grow;
    }
    // 지가: 도심에서 가장 높고, 주변 도시 중심과 교통로 주변이 함께 오른다
    let p = Math.exp(-c.r / 4.2);
    for (const S of SATS) {
      const a = satActive(S, t);
      if (a > 0) p += 0.28 * a * Math.exp(-Math.hypot(c.x - S.x, c.z - S.z) / 3);
    }
    if (c.corridor && t > c.corridor.open) p += 0.05;
    if (t >= c.urbanYear) p += 0.06;
    st.use[k] = use; st.h[k] = h; st.pop[k] = pop; st.grow[k] = grow;
    st.price[k] = c.water ? 0 : Math.min(1, p * pLevel);
  }
  return st;
}

// ---------- 통계 ----------
export const POP_SCALE = 1.6;     // 칸 인구 1 = 1.6만 명 (가상)
export const CBD_R = 4.5;          // 도심 범위
export const SUBURB_R = 10.5;      // 이보다 바깥 = 교외
export function stats(t, st) {
  let cbd = 0, sub = 0, all = 0, land = 0, built = 0, cbdPrice = 0, cbdN = 0;
  for (let k = 0; k < cells.length; k++) {
    const c = cells[k];
    const p = st.pop[k] * POP_SCALE;
    all += p;
    if (c.r < CBD_R) { cbd += p; cbdPrice += st.price[k]; cbdN++; }
    else if (c.r > SUBURB_R) sub += p;
    if (!c.water) { land++; if (t >= c.urbanYear || st.use[k] === USE.ROAD || st.use[k] === USE.RAIL) built++; }
  }
  return {
    cbd, sub, all,
    builtPct: (built / land) * 100,
    cbdPrice: cbdPrice / cbdN,
    commuters: flows(t, st).reduce((s, f) => s + f.v, 0),
  };
}

// 주변 도시 → 도심 통근량(만 명)
export function flows(t, st) {
  const out = [];
  for (const S of SATS) {
    let pop = 0;
    for (let k = 0; k < cells.length; k++) {
      const c = cells[k];
      if (c.sat === S && c.sd < S.rmax + 1.2) pop += st.pop[k];
    }
    let access = 0;
    for (const L of LINES) if (L.to === S.id) access += (L.type === 'rail' ? 0.55 : 0.45) * lineOpen(L, t);
    const share = 0.06 + 0.5 * Math.min(1, access);
    out.push({ S, v: pop * POP_SCALE * share * satActive(S, t + 3) });
  }
  return out;
}

// 대도시권(통근권) 경계: 각도별 반지름
export function metroBoundary(t, st, steps = 160) {
  const fl = flows(t, st);
  const base = keyed(R_CITY, t) + 1.8;
  const pts = [];
  for (let s = 0; s < steps; s++) {
    const th = (s / steps) * Math.PI * 2;
    let r = base;
    for (const f of fl) {
      const S = f.S;
      const ds = Math.hypot(S.x, S.z);
      const strength = smoothstep(2, 14, f.v);
      if (strength <= 0) continue;
      const reach = ds + satRadius(S, t) + 2.2;
      let dth = Math.abs(th - Math.atan2(S.z, S.x));
      if (dth > Math.PI) dth = 2 * Math.PI - dth;
      const w = Math.exp(-((dth / 0.42) ** 2));
      r = Math.max(r, base + (reach - base) * strength * w);
    }
    pts.push([Math.cos(th) * r, Math.sin(th) * r]);
  }
  return pts;
}
export function boundaryOpacity(t) { return smoothstep(1988, 1997, t); }
