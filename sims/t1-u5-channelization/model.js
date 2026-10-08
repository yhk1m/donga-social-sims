// © 2026 김용현
// 하천 직강화 전후 홍수 추적 모형 (화면과 무관한 순수 계산)
//
// 같은 골짜기(직선 거리 LV), 같은 낙차(DROP), 같은 상류 유입 수문곡선을 두 하도에 흘려 보낸다.
// - 직강화 전: 굽이치는 하도(굴곡도 약 1.8) → 길이 길고 경사 완만, 자연 하상(n 큼),
//              둑을 넘으면 습지·범람원이 물을 담아 두었다가 천천히 돌려보냄
// - 직강화 후: 곧게 편 하도 → 길이 짧고 경사 급함, 콘크리트 호안(n 작음), 제방으로 범람원 차단
// 각 하도는 칸(약 400 m)으로 나눈 저류 칸의 사슬(운동파 추적)이고, 칸의 유출량은 매닝 공식
//   Q = (1/n) · A · R^(2/3) · S^(1/2)
// 로 구한다(S 는 칸 사이 수면 경사, 확산파). 하류 끝의 출구 유량이 같은 단면의 마을 구간(공통)으로 들어가 마을 수위를 정한다.

export const LV = 8000; // 골짜기 직선 거리 (m)
export const DROP = 16; // 상류 끝 → 마을 입구 낙차 (m)
export const T_END = 16 * 3600; // 모의 시간 (s)
export const SAMPLE = 300; // 기록 간격 (s)
const DT = 5; // 계산 시간 간격 (s)
const DX_TARGET = 400; // 칸 길이 목표 (m)
export const QBASE = 30; // 평수 유량 (m3/s)

export const CASES = {
  before: {
    key: 'before',
    name: '직강화 전',
    sinuosity: 1.8,
    // 하도: 바닥 폭 B, 옆 비탈 z(수평/수직), 둑 높이 Hb
    B: 45, z: 2.5, Hb: 3.0, nC: 0.038,
    // 둑 위로 넘친 물을 담아 두는 습지·범람원 폭 (m)
    Wfp: 150, nFp: 0.05,
  },
  after: {
    key: 'after',
    name: '직강화 후',
    sinuosity: 1.0,
    // 콘크리트 사다리꼴 하도 + 제방 (지표 위 3 m) → 하도 깊이 6 m
    B: 30, z: 1.5, Hb: 6.0, nC: 0.022,
    // 제방을 넘을 때만 쓰는 제방 밖 땅 (보통은 쓰이지 않음)
    Wfp: 300, nFp: 0.06,
  },
};

// 마을 구간 (두 경우 공통): 자연 하도 + 낮은 마을 터
export const VILLAGE = { B: 50, z: 2, Hb: 3.5, nC: 0.035, Wfp: 260, nFp: 0.07, S: 0.0012 };

// ── 단면 관계 ─────────────────────────────────────────────
function geom(sec, h) {
  const { B, z, Hb, Wfp } = sec;
  const side = Math.sqrt(1 + z * z);
  if (h <= Hb) {
    const Ac = (B + z * h) * h;
    const Pc = B + 2 * h * side;
    return { Ac, Pc, Afp: 0, dfp: 0, T: B + 2 * z * h };
  }
  const Tb = B + 2 * z * Hb;
  const Ac = (B + z * Hb) * Hb + Tb * (h - Hb);
  const Pc = B + 2 * Hb * side;
  const dfp = h - Hb;
  return { Ac, Pc, Afp: Wfp * dfp, dfp, T: Tb + Wfp };
}

export function area(sec, h) {
  const g = geom(sec, h);
  return g.Ac + g.Afp;
}

// 유량과 하도(본류) 유속
export function flow(sec, h, S) {
  if (h <= 0) return { Q: 0, Vc: 0 };
  const g = geom(sec, h);
  const sq = Math.sqrt(S);
  const Qc = (1 / sec.nC) * g.Ac * Math.pow(g.Ac / g.Pc, 2 / 3) * sq;
  const Qf = g.Afp > 0 ? (1 / sec.nFp) * g.Afp * Math.pow(g.dfp, 2 / 3) * sq : 0;
  return { Q: Qc + Qf, Vc: Qc / g.Ac, Vf: g.Afp > 0 ? Qf / g.Afp : 0 };
}

// 등류 수심 (유량 → 수위), 이분법
export function normalDepth(sec, Q, S) {
  let lo = 0, hi = 30;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (flow(sec, mid, S).Q < Q) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

// 저류 면적 → 수심, 이분법
function depthFromArea(sec, A) {
  let lo = 0, hi = 30;
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    if (area(sec, mid) < A) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

// 상류 유입 수문곡선 (감마형): 첨두 유량 qPeak, 첨두 시각 tPeak
export function inflow(t, qPeak, tPeak = 2 * 3600, m = 5) {
  const r = t / tPeak;
  if (r <= 0) return QBASE;
  return QBASE + (qPeak - QBASE) * Math.pow(r, m) * Math.exp(m * (1 - r));
}

export function reachInfo(c) {
  const L = LV * c.sinuosity;
  const N = Math.max(4, Math.round(L / DX_TARGET));
  return { L, N, dx: L / N, S: DROP / L };
}

// 둑을 넘친 물이 범람원·습지로 퍼지는 시간과, 다시 하도로 빠지는 시간 (s)
const TAU_FILL = 900;
const TAU_DRAIN = 3600;

// 한 경우를 처음부터 끝까지 계산해 SAMPLE 간격 기록을 돌려준다.
// 하도는 물을 흘려 보내고(매닝, 확산파), 범람원은 칸마다 옆에 붙은 저류지로 둔다:
// 하도 수위가 둑보다 높으면 범람원으로 넘쳐 들어가고, 낮아지면 천천히 하도로 되돌아온다.
export function simulate(c, qPeak) {
  const { L, N, dx, S } = reachInfo(c);
  const sec = { ...c, Wfp: 0 }; // 하도만의 단면 (둑 위는 수직 벽)
  const h0 = normalDepth(sec, QBASE, S);
  const A = new Float64Array(N).fill(area(sec, h0));
  const h = new Float64Array(N).fill(h0);
  const f = new Float64Array(N); // 범람원 물 깊이 (m)
  const Q = new Float64Array(N);
  const rec = { t: [], qin: [], h: [], f: [], v: [], qout: [], village: [], villageV: [] };
  const steps = Math.round(T_END / DT);
  const every = Math.round(SAMPLE / DT);
  for (let k = 0; k <= steps; k++) {
    const t = k * DT;
    const qin = inflow(t, qPeak);
    // 확산파: 칸 사이 수면 경사로 마찰 경사를 정한다 (끝 칸은 하상 경사)
    for (let i = 0; i < N; i++) {
      const Sf = i < N - 1 ? Math.max(S * 0.05, S + (h[i] - h[i + 1]) / dx) : S;
      Q[i] = flow(sec, h[i], Sf).Q;
    }
    if (k % every === 0) {
      const qout = Q[N - 1];
      const hv = normalDepth(VILLAGE, qout, VILLAGE.S);
      rec.t.push(t);
      rec.qin.push(qin);
      rec.h.push(Float32Array.from(h));
      rec.f.push(Float32Array.from(f));
      rec.v.push(Float32Array.from(h, (hh) => flow(sec, hh, S).Vc));
      rec.qout.push(qout);
      rec.village.push(hv);
      rec.villageV.push(flow(VILLAGE, hv, VILLAGE.S).Vc);
    }
    for (let i = 0; i < N; i++) {
      const qi = i === 0 ? qin : Q[i - 1];
      // 하도 ↔ 범람원 교환 (m3/s, 칸 하나 전체)
      let x = 0;
      const over = h[i] - c.Hb;
      if (over > f[i]) x = (c.Wfp * dx * (over - f[i])) / TAU_FILL;
      else if (f[i] > 0) x = -(c.Wfp * dx * Math.min(f[i], f[i] - Math.max(0, over))) / TAU_DRAIN;
      A[i] = Math.max(1e-3, A[i] + (DT / dx) * (qi - Q[i] - x));
      f[i] = Math.max(0, f[i] + (DT * x) / (c.Wfp * dx));
      h[i] = depthFromArea(sec, A[i]);
    }
  }
  // 요약
  let pk = 0;
  for (let i = 1; i < rec.village.length; i++) if (rec.village[i] > rec.village[pk]) pk = i;
  return { info: { L, N, dx, S }, rec, peakIdx: pk, peakTime: rec.t[pk], peakStage: rec.village[pk], peakQ: rec.qout[pk] };
}
