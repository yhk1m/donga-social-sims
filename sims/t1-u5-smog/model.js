// © 2026 김용현
// 스모그 뚜껑: 기온 역전 모형 (DOM 없는 순수 계산부, Node 시험 대상)
// 모든 수치는 「모형 수치」다. 실제 관측값은 data/london1952.js 에만 있다.

export const Z_TOP = 1000; // 단면 꼭대기 (m)
export const DZ = 10; // 기온 격자 간격 (m)
export const LAPSE_ENV = 0.0065; // 위층 공기의 기온 감률 (°C/m, 보통 대기)
export const LAPSE_DRY = 0.0098; // 연기 덩어리가 오를 때 식는 비율 (건조 단열, °C/m)
export const SUNRISE = 8; // 12월 런던 해 뜨는 시각(대략)
export const SUNSET = 16;
export const SECTION_KM = 12; // 단면 가로 길이 (km)

export const WIND = {
  none: { u: 0, k: 0, sigma: 0.05, D: 110 },
  weak: { u: 2, k: 0.15, sigma: 0.35, D: 200 },
  strong: { u: 6, k: 0.55, sigma: 0.9, D: 380 },
};
export const COAL = { low: 0.5, mid: 1, high: 1.8 };

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const smooth = (x) => { const t = clamp(x, 0, 1); return t * t * (3 - 2 * t); };

/** 0~24시의 햇빛 세기 (0~1) */
export function sunAt(hour) {
  const h = ((hour % 24) + 24) % 24;
  if (h <= SUNRISE || h >= SUNSET) return 0;
  return Math.sin((Math.PI * (h - SUNRISE)) / (SUNSET - SUNRISE));
}

/**
 * 땅 근처 공기 온도 편차 S(°C)의 변화율 (°C/시간).
 * 낮에는 햇빛이 데우고, 늘 땅이 열을 내보내 식는다(맑은 밤일수록 많이). 바람은 위아래 공기를 섞어 편차를 줄인다.
 * c: { wind, cloudy, fog(0~1) }
 */
export function surfaceRate(S, hour, c) {
  const w = WIND[c.wind] ?? WIND.none;
  const sunBlock = (c.cloudy ? 0.55 : 0) + (c.fog ?? 0) * 0.85;
  const heat = 3.2 * sunAt(hour) * Math.max(0.05, 1 - sunBlock);
  const loss = c.cloudy ? 0.3 : 1.15;
  const relax = 0.12 + w.k;
  return heat - loss * (1 - 0.6 * (c.fog ?? 0)) - relax * S;
}

/** 같은 조건으로 며칠 지난 뒤의 하루 S 곡선 (0.1시간 간격, 241개) */
export function dailySurface(c) {
  const dt = 0.05;
  let S = 0;
  for (let t = 0; t < 72; t += dt) S += surfaceRate(S, t, c) * dt;
  const out = [];
  for (let i = 0; i <= 480; i++) {
    if (i % 2 === 0) out.push(S);
    S += surfaceRate(S, 72 + i * dt, c) * dt;
  }
  return out; // out[k] = k/10 시
}

/**
 * 높이별 기온 (°C). base = 땅 높이 기준 위층 공기(편차 없을 때)의 지면 기온.
 * S: 땅 근처 편차, D: 편차가 미치는 깊이(m), sub: 고기압 하강 기류로 데워진 층 { dT, zb, w }
 */
export function tempAt(z, p) {
  let T = p.base - LAPSE_ENV * z + p.S * Math.exp(-z / p.D);
  if (p.sub && p.sub.dT > 0) T += p.sub.dT * smooth((z - p.sub.zb) / p.sub.w);
  return T;
}

/** 0~Z_TOP 기온 단면 (DZ 간격 배열) */
export function profile(p) {
  const n = Math.round(Z_TOP / DZ) + 1;
  const T = new Float64Array(n);
  for (let i = 0; i < n; i++) T[i] = tempAt(i * DZ, p);
  return T;
}

/** 편차 깊이: 땅이 식을 때는 얕고(바람이 셀수록 깊게), 데워질 때는 깊다 */
export function depthFor(S, wind) {
  const w = WIND[wind] ?? WIND.none;
  return S < 0 ? w.D : 450;
}

/**
 * 역전층 찾기: 위로 갈수록 기온이 오르는 구간들.
 * 돌려줌: [{ bottom, top, dT }] (m, °C). 아주 약한 구간(minDT 미만)은 버린다.
 */
export function findInversions(T, dz = DZ, minDT = 0.15) {
  const out = [];
  let start = -1;
  for (let i = 0; i < T.length - 1; i++) {
    const up = T[i + 1] > T[i] + 1e-9;
    if (up && start < 0) start = i;
    if ((!up || i === T.length - 2) && start >= 0) {
      const end = up ? i + 1 : i;
      const dT = T[end] - T[start];
      if (dT >= minDT) out.push({ bottom: start * dz, top: end * dz, dT });
      start = -1;
    }
  }
  return out;
}

/** 연기가 갇히는 뚜껑 높이: 600 m 아래에서 처음 만나는 역전층의 꼭대기. 없으면 null */
export function lidHeight(inv) {
  const first = inv.find((l) => l.bottom < 600);
  return first ? first.top : null;
}

/** 격자 기온을 높이 z에서 보간 */
export function envAt(T, z, dz = DZ) {
  const f = clamp(z / dz, 0, T.length - 1);
  const i = Math.min(T.length - 2, Math.floor(f));
  return T[i] + (T[i + 1] - T[i]) * (f - i);
}

/** 높이 z에서 기온이 위로 오르는 중인지 (역전층 안) */
export function stableAt(T, z, dz = DZ) {
  const i = clamp(Math.floor(z / dz), 0, T.length - 2);
  return T[i + 1] > T[i];
}

/**
 * 연기 덩어리 한 걸음 (dt 초).
 * p: { z, T, w } 높이(m), 덩어리 온도(°C), 오르는 속도(m/s).
 * 오르면 건조 단열로 식고, 둘레 공기와 섞여 온도 차가 줄고, 둘레보다 따뜻하면 뜬다.
 * rnd: 표준 정규 난수 함수(없으면 흔들림 없음), sigma: 흔들림 세기(m/s)
 */
export function stepParcel(p, T, dt, opt = {}) {
  const te = envAt(T, p.z);
  const g = 9.81;
  const tauMix = opt.tauMix ?? 90;
  const tauDrag = opt.tauDrag ?? 25;
  const a = (g * (p.T - te)) / (te + 273.15);
  let w = p.w + (a - p.w / tauDrag) * dt;
  let z = p.z + w * dt;
  let Tp = p.T - LAPSE_DRY * (z - p.z);
  Tp += (envAt(T, Math.max(0, z)) - Tp) * (1 - Math.exp(-dt / tauMix));
  if (opt.rnd && opt.sigma) {
    const s = opt.sigma * (stableAt(T, Math.max(0, z)) ? 0.12 : 1);
    z += s * Math.sqrt(dt) * opt.rnd();
  }
  if (z < 0) { z = 0; w = Math.max(0, w); }
  return { z, T: Tp, w };
}

/** 덩어리를 멈출 때까지(또는 tMax초) 올려 보내 다다른 가장 높은 곳 (흔들림 없음) */
export function riseHeight(T, z0, excess, tMax = 1800, dt = 2) {
  let p = { z: z0, T: envAt(T, z0) + excess, w: 0 };
  let top = z0;
  for (let t = 0; t < tMax; t += dt) {
    p = stepParcel(p, T, dt);
    top = Math.max(top, p.z);
    if (p.z >= Z_TOP) return Z_TOP;
  }
  return top;
}

/** 석탄 연기 내뿜는 양의 하루 변화 (보통=1 평균 근처). 집은 아침·저녁 난방, 공장은 낮 */
export function emissionAt(hour) {
  const h = ((hour % 24) + 24) % 24;
  const bump = (c, s) => Math.exp(-(((h - c) / s) ** 2));
  const house = 0.35 + 0.9 * bump(8, 1.6) + 0.8 * bump(19, 2.6);
  const factory = h >= 7 && h <= 18 ? 0.9 : 0.25;
  return { house, factory, total: 0.6 * house + 0.4 * factory };
}

/**
 * 연기 농도 상자 모형 한 걸음 (dtH 시간). C: mg/m³
 * E: 내뿜는 양(mg/m²/시간), H: 섞이는 높이(m), u: 바람(m/s)
 * 바람은 단면 밖으로 실어 내고, 조금은 땅에 내려앉는다.
 */
export function stepBox(C, dtH, { E, H, u, open }) {
  // 바람이 도시(약 25 km) 밖으로 실어 내는 몫 + 땅에 내려앉는 몫 + 뚜껑이 없으면 위로 흩어지는 몫
  const out = (u * 3600) / 25000 + 0.06 + (u === 0 ? 0 : 0.05) + (open ? 0.25 : 0);
  return Math.max(0, C + (E / Math.max(40, H) - out * C) * dtH);
}
export const E0 = 40; // 보통 석탄 사용, 하루 평균 근처의 내뿜는 양 (mg/m²/시간, 모형 수치)

/** 섞이는 높이: 뚜껑이 있으면 그 높이, 없으면 낮 대류 높이 */
export function mixHeight(lid) {
  return lid == null ? 900 : Math.max(60, lid);
}

/**
 * 시정 (m): 코슈미더 식 V = 3.912 / 소산 계수.
 * 맑은 공기 + 연기(농도에 비례) + 안개(연기가 많으면 안개 방울이 더 잘 생겨 짙어짐)
 */
export function visibility(C, fog) {
  const beta = 0.0002 + 0.006 * C + (fog ?? 0) * 0.025 * (1 + 0.6 * C);
  return Math.min(20000, 3.912 / beta);
}

/** 안개 목표값: 바람 없고 땅이 많이 식을수록 */
export function fogTarget(S, wind) {
  const calm = wind === 'none' ? 1 : wind === 'weak' ? 0.35 : 0;
  return calm * smooth((-S - 4) / 4);
}

/** 한 시각의 상태 묶음 (하루 실험) */
export function stateAt(p) {
  const T = profile(p);
  const inv = findInversions(T);
  return { T, inv, lid: lidHeight(inv) };
}

/** 하루 실험 표: 0.1시간 간격의 S, 안개, 농도 (같은 조건으로 며칠 지난 상태) */
export function dailyRun(c) {
  const coal = COAL[c.coal] ?? 1;
  const w = WIND[c.wind] ?? WIND.none;
  const dt = 0.05;
  let S = 0, fog = 0, C = 0.1;
  const rec = { S: [], fog: [], C: [], lid: [] };
  for (let i = 0; i <= 96 / dt + 480; i++) {
    const t = i * dt;
    const hour = t % 24;
    S += surfaceRate(S, hour, { ...c, fog }) * dt;
    fog += (fogTarget(S, c.wind) - fog) * (1 - Math.exp(-dt / 1.2));
    const st = stateAt({ base: 6, S, D: depthFor(S, c.wind) });
    C = stepBox(C, dt, { E: E0 * coal * emissionAt(hour).total, H: mixHeight(st.lid), u: w.u, open: st.lid == null });
    const k = i - 96 / dt;
    if (k >= 0 && k % 2 === 0) { rec.S.push(S); rec.fog.push(fog); rec.C.push(C); rec.lid.push(st.lid); }
  }
  return rec; // [k] = k/10 시, 241개
}

// ── 1952년 12월 재생 ─────────────────────────────────────────
// t = 0 은 12월 4일 0시, 끝은 12월 10일 24시 (168시간)
export const REPLAY_START_DAY = 4;
export const REPLAY_HOURS = 168;

/** 시각별 날씨 조건 (관측 기록을 줄인 모형 입력) */
export function scenario1952(t) {
  const day = REPLAY_START_DAY + Math.floor(t / 24);
  // 바람: 4일은 약한 바람, 4일 저녁부터 9일까지 거의 없음, 10일 오전부터 남풍이 세짐
  let wind = 'none';
  if (t < 18) wind = 'weak';
  if (t >= 6 * 24 + 9) wind = 'strong';
  else if (t >= 5 * 24 + 18) wind = 'weak';
  // 고기압 하강 기류로 위쪽이 데워진 층: 4일 저녁부터 생겨 9일 밤까지, 10일에 사라짐
  const subOn = smooth((t - 14) / 12) * (1 - smooth((t - (5 * 24 + 16)) / 14));
  // 안개 강제값: 5일 새벽부터, 6~8일 가장 짙고, 9일 오후 옅어짐, 10일 걷힘
  const fogDays = smooth((t - 26) / 8) * (1 - smooth((t - (5 * 24 + 10)) / 10));
  return { day, wind, cloudy: false, sub: { dT: 4.5 * subOn, zb: 90, w: 120 }, fogForce: 0.95 * fogDays, coal: t >= 26 ? 'high' : 'mid' };
}

/** 재생 전체를 미리 계산 (0.1시간 간격, 1681개) */
export function runReplay() {
  const dt = 0.05;
  let S = -2, fog = 0, C = 0.25;
  const n = REPLAY_HOURS / dt;
  const rec = { S: [], fog: [], C: [], lid: [], wind: [], sub: [] };
  for (let i = 0; i <= n; i++) {
    const t = i * dt;
    const hour = t % 24;
    const sc = scenario1952(t);
    const fogT = Math.max(sc.fogForce, fogTarget(S, sc.wind));
    fog += (fogT - fog) * (1 - Math.exp(-dt / 1.5));
    S += surfaceRate(S, hour, { wind: sc.wind, cloudy: sc.cloudy, fog }) * dt;
    const st = stateAt({ base: 4, S, D: depthFor(S, sc.wind), sub: sc.sub });
    C = stepBox(C, dt, { E: E0 * COAL[sc.coal] * emissionAt(hour).total, H: mixHeight(st.lid), u: WIND[sc.wind].u, open: st.lid == null });
    if (i % 2 === 0) { rec.S.push(S); rec.fog.push(fog); rec.C.push(C); rec.lid.push(st.lid); rec.wind.push(sc.wind); rec.sub.push(sc.sub); }
  }
  return rec;
}
