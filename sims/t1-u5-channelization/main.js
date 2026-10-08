// © 2026 김용현
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
// 클래스(CsatChart)는 외부 글꼴 내려받기 코드까지 끌고 오므로 저수준 렌더러만 쓴다
import { renderLineGraph, createDefaultGraphOptions } from 'csat-chart.js';
import { createShell, addBlock } from '../../src/shared/shell.js';
import { h, icon } from '../../src/shared/dom.js';
import './style.css';
import { CASES, VILLAGE, LV, DROP, T_END, SAMPLE, simulate, inflow, reachInfo } from './model.js';

function mk(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}
function setBtn(btn, iconName, text) {
  btn.replaceChildren(icon(iconName), document.createTextNode(text));
}

// ── 화면 좌표 ─────────────────────────────────────────────
// 가로 1 단위 = 100 m. 하도 구간 x 0~80, 마을 구간 x 80~96. 세로는 1 m = VS 단위(25배 과장).
const XR = LV / 100; // 80
const XE = 96;
const VS = 0.25;
const X0 = XE / 2; // 장면 가운데로 옮기는 양
const Z_HALF = 22;
const GRID = 0.3;
const COLORS = { before: '#2f9e44', after: '#e8590c' };
const HALF = { before: 0.95, after: 1.0, village: 1.15 }; // 하도 반폭(화면, 과장)
const LEVEE_W = 0.75;
const BED = { before: 3.0, after: 3.0, village: VILLAGE.Hb }; // 지표에서 하상까지 깊이 (m)

function rng(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
// 값 노이즈 (지면 미세 기복)
function noise2(x, z) {
  const s = Math.sin(x * 1.7 + z * 0.9) * 0.5 + Math.sin(x * 0.53 - z * 1.31) * 0.35 + Math.sin(x * 3.1 + z * 2.3) * 0.15;
  return s;
}
// 골짜기 기준 지표 고도 (m)
function base(x) {
  return x <= XR ? DROP * (1 - x / XR) : -VILLAGE.S * (x - XR) * 100;
}

// ── 물길 ──────────────────────────────────────────────────
// 직강화 전: 사인 생성 곡선 θ(s)=θ0·sin(2πs/λ), 굴곡도가 1.8이 되게 θ0를 고른다.
function besselJ0(a) {
  let sum = 0; const n = 400;
  for (let i = 0; i < n; i++) sum += Math.cos(a * Math.sin(((i + 0.5) / n) * Math.PI));
  return sum / n;
}
function buildPaths() {
  const target = CASES.before.sinuosity;
  let lo = 0.3, hi = 1.55;
  for (let i = 0; i < 50; i++) { const m = (lo + hi) / 2; if (1 / besselJ0(m) < target) lo = m; else hi = m; }
  const th0 = (lo + hi) / 2;
  const waves = 5;
  const arc = XR * target;
  const lam = arc / waves;
  const raw = [];
  const sub = 0.01, STEP = 0.1;
  let x = 0, y = 0;
  raw.push([0, 0]);
  const nSteps = Math.round(arc / sub);
  for (let k = 1; k <= nSteps; k++) {
    const s = (k - 0.5) * sub;
    const th = th0 * Math.sin((2 * Math.PI * s) / lam);
    x += Math.cos(th) * sub; y += Math.sin(th) * sub;
    if (k % Math.round(STEP / sub) === 0) raw.push([x, y]);
  }
  const sx = XR / x; // 끝을 정확히 x=80 에 맞춘다
  let ymin = Infinity, ymax = -Infinity;
  for (const p of raw) { ymin = Math.min(ymin, p[1]); ymax = Math.max(ymax, p[1]); }
  const zc = -(ymax + ymin) / 2;
  const make = (pts) => {
    const n = pts.length;
    const px = new Float32Array(n), pz = new Float32Array(n), ps = new Float32Array(n), tx = new Float32Array(n), tz = new Float32Array(n);
    for (let i = 0; i < n; i++) { px[i] = pts[i][0]; pz[i] = pts[i][1]; }
    for (let i = 1; i < n; i++) ps[i] = ps[i - 1] + Math.hypot(px[i] - px[i - 1], pz[i] - pz[i - 1]);
    for (let i = 0; i < n; i++) {
      const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1);
      const dx = px[b] - px[a], dz = pz[b] - pz[a], l = Math.hypot(dx, dz) || 1;
      tx[i] = dx / l; tz[i] = dz / l;
    }
    let reachEnd = n - 1;
    for (let i = 0; i < n; i++) if (px[i] >= XR - 1e-4) { reachEnd = i; break; }
    return { n, px, pz, ps, tx, tz, reachS: ps[reachEnd], total: ps[n - 1] };
  };
  const mPts = raw.map(([a, b]) => [a * sx, b + zc]);
  for (let xx = XR + STEP; xx <= XE + 1e-6; xx += STEP) mPts.push([xx, zc]);
  const sPts = [];
  for (let xx = 0; xx <= XE + 1e-6; xx += STEP) sPts.push([xx, zc]);
  return { before: make(mPts), after: make(sPts), zc, amp: (ymax - ymin) / 2, lam: lam * sx };
}
const PATHS = buildPaths();
const ZC = PATHS.zc;
// 모형 굴곡도를 실제 그린 물길 길이에 맞춘다
CASES.before.sinuosity = PATHS.before.reachS / XR;
CASES.after.sinuosity = PATHS.after.reachS / XR;

// x 가 단조 증가하므로 이분 탐색
function idxAtX(P, x) {
  let lo = 0, hi = P.n - 1;
  while (lo < hi) { const m = (lo + hi) >> 1; if (P.px[m] < x) lo = m + 1; else hi = m; }
  return lo;
}
function nearest(P, x, z, win = 3.2) {
  let i = idxAtX(P, x - win);
  let best = Infinity, bi = -1;
  for (; i < P.n && P.px[i] <= x + win; i++) {
    const d = (P.px[i] - x) ** 2 + (P.pz[i] - z) ** 2;
    if (d < best) { best = d; bi = i; }
  }
  return bi < 0 ? { d: Infinity, s: P.ps[idxAtX(P, x)] } : { d: Math.sqrt(best), s: P.ps[bi] };
}

// ── 계산 결과 ─────────────────────────────────────────────
const state = {
  qPeak: 550, t: 0, playing: false, speed: 1, view: 'split',
  res: { before: null, after: null },
};
const NREC = Math.round(T_END / SAMPLE) + 1;
function runModel() {
  state.res.before = simulate(CASES.before, state.qPeak);
  state.res.after = simulate(CASES.after, state.qPeak);
}
runModel();

// 시각 t 의 값 (기록 사이 선형 보간)
function sampleAt(res, t) {
  const f = Math.min(NREC - 1, Math.max(0, t / SAMPLE));
  const i = Math.min(NREC - 2, Math.floor(f)), w = f - i;
  const r = res.rec;
  return {
    h: (k) => lerp(r.h[i][k], r.h[i + 1][k], w),
    f: (k) => lerp(r.f[i][k], r.f[i + 1][k], w),
    v: (k) => lerp(r.v[i][k], r.v[i + 1][k], w),
    village: lerp(r.village[i], r.village[i + 1], w),
    villageV: lerp(r.villageV[i], r.villageV[i + 1], w),
    N: r.h[0].length,
  };
}
// 물길 위치 s(화면 단위)의 칸 값 보간
function cellValue(get, N, P, s) {
  const f = Math.min(N - 1, Math.max(0, (s / P.reachS) * N - 0.5));
  const i = Math.min(N - 2, Math.floor(f));
  return lerp(get(i), get(i + 1), f - i);
}


// 사이드바 조작 부품
function buildPanel(panel) {
  const segBtn = (attr, val, text, on) => h('button', { type: 'button', class: 'ds-seg-btn', dataset: { [attr]: val }, 'aria-pressed': on ? 'true' : 'false' }, text);
  const ctl = (label, out, ...rest) => h('div', { class: 'ds-ctl' }, h('div', { class: 'ds-label' }, label, out || null), ...rest);
  addBlock(panel, ctl('보기', null, h('div', { class: 'ds-seg ch-view' },
    segBtn('v', 'split', '나란히 비교', true), segBtn('v', 'before', '직강화 전', false), segBtn('v', 'after', '직강화 후', false))));
  addBlock(panel, h('div', { class: 'ds-row' },
    h('button', { type: 'button', class: 'ds-btn ds-primary ch-play' }),
    h('button', { type: 'button', class: 'ds-btn ch-reset' })));
  addBlock(panel, ctl('경과 시간', h('output', { class: 'ds-out ch-time-out' }, '0시간 00분'),
    h('input', { class: 'ds-range ch-time', type: 'range', min: '0', max: '16', step: '0.01', value: '0', 'aria-label': '경과 시간' })));
  addBlock(panel, ctl('재생 속도', null, h('div', { class: 'ds-seg ch-speed' },
    segBtn('s', '0.5', '느리게', false), segBtn('s', '1', '보통', true), segBtn('s', '2.5', '빠르게', false))));
  addBlock(panel, ctl('집중호우 규모 (상류 첨두 유량)', h('output', { class: 'ds-out ch-storm-out' }, '550 m³/s'),
    h('input', { class: 'ds-range ch-storm', type: 'range', min: '300', max: '800', step: '10', value: '550', 'aria-label': '집중호우 규모' })));
  const row = (label, k) => [h('span', { class: 'ch-k' }, label), h('span', { class: 'ch-v', dataset: { k: `${k}B` } }), h('span', { class: 'ch-v', dataset: { k: `${k}A` } })];
  addBlock(panel, h('div', {},
    h('h2', { class: 'ds-h2 ch-h2' }, '지금 상태'),
    h('div', { class: 'ch-cmp' },
      h('span', {}),
      h('span', { class: 'ch-colh' }, h('span', { class: 'ch-dot-s ch-dot-b' }), '직강화 전'),
      h('span', { class: 'ch-colh' }, h('span', { class: 'ch-dot-s ch-dot-a' }), '직강화 후'),
      row('하도 유속', 'v'), row('상류 구간 수위', 'u'), row('하류 마을 수위', 'h'),
      row('마을 최고 수위', 'm'), row('첨두 도달 시간', 'p'), row('마을 범람', 'f'))));
  addBlock(panel, h('div', {},
    h('h2', { class: 'ds-h2 ch-h2' }, '하류 마을 수위 변화'),
    h('div', { class: 'ch-chart-wrap' }, h('canvas', { class: 'ch-chart', width: '760', height: '600', 'aria-label': '하류 마을 수위 그래프' })),
    h('p', { class: 'ch-cap' }, '상류에 비가 가장 많이 들어오는 때는 두 경우 모두 비 시작 2시간 뒤입니다.')));
  const em = (t) => h('span', { class: 'ch-em' }, t);
  const li = (...c) => h('li', { class: 'ch-li' }, ...c);
  addBlock(panel, h('div', { class: 'ds-note' }, em('무엇이 달라질까?'), h('ul', { class: 'ch-list' },
    li('굽이치던 물길을 곧게 펴면 같은 낙차를 더 짧은 거리에서 내려가므로 ', em('경사가 급해지고'), ', 콘크리트 호안은 바닥이 매끄러워 ', em('유속이 빨라집니다'), '.'),
    li('그래서 상류 구간은 물이 빨리 빠지지만, 그 물이 ', em('한꺼번에, 더 일찍'), ' 하류 마을로 몰려 수위가 높고 뾰족하게 솟습니다.'),
    li('직강화 전에는 둑을 넘친 물이 습지·범람원에 머물렀다 천천히 빠져 마을의 첨두가 낮아지고 늦어집니다.'))));
  addBlock(panel, h('div', { class: 'ds-note' }, em('모형과 단순화'), h('ul', { class: 'ch-list' },
    li('골짜기 8 km, 낙차 16 m는 같고, 하도 길이만 14.4 km(굴곡도 1.8) → 8 km로 바뀝니다.'),
    li('하도를 약 400 m 칸으로 나누고 칸마다 매닝 공식 V = R', h('sup', {}, '2/3'), 'S', h('sup', {}, '1/2'), '/n으로 흘려 보내는 확산파 추적입니다. 거칠기 n은 자연 하도 0.038, 콘크리트 하도 0.022입니다.'),
    li('습지·범람원은 칸마다 하도 옆에 붙은 저류지로 보았습니다. 둑(3 m)을 넘친 물을 담았다가 수위가 내려가면 약 1시간에 걸쳐 하도로 돌려보냅니다. 직강화 후에는 제방(6 m)이 이 길을 막습니다.'),
    li('강우는 상류에서 들어오는 유량 곡선 하나로만 넣었고, 지류·침투·배수로·역류는 뺐습니다. 마을 수위는 마을 구간의 등류 수심으로 셉니다.'),
    li('3D 화면은 수직을 25배, 하도 폭을 약 2배 과장했고, 물 알갱이 속도는 실제 유속에 비례하게만 그렸습니다.'))));
}

export default function mount(root) {
  const { stage, panel } = createShell(root, 't1-u5-channelization');
  stage.classList.add('ch-stage');
  buildPanel(panel);
  const $ = (sel) => panel.querySelector(sel);
  const WETLANDS = wetlandsFor();

  // ── 3D ────────────────────────────────────────────────────
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true });
  } catch (e) {
    stage.appendChild(mk('div', 'ch-fallback', '이 브라우저에서는 3D 화면(WebGL)을 열 수 없습니다. 오른쪽 표와 그래프로 비교해 보세요.'));
  }
  const camera = new THREE.PerspectiveCamera(34, 1, 0.5, 900);
  camera.position.set(14, 58, 74);
  let userMoved = false;
  // 골짜기 전체(가로 약 100 단위)가 들어오게 거리를 맞춘다
  const VIEW_DIR = new THREE.Vector3(0.1, 0.72, 0.69).normalize();
  const VIEW_TARGET = new THREE.Vector3(1, 1.5, -1);
  function fitCamera() {
    const tv = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const dist = Math.max(53 / (tv * camera.aspect), 24 / tv);
    camera.position.copy(VIEW_TARGET).addScaledVector(VIEW_DIR, dist);
    if (controls) { controls.target.copy(VIEW_TARGET); controls.update(); }
  }
  let controls = null;
  const views = {};

  if (renderer) {
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.setScissorTest(true);
    renderer.domElement.classList.add('ds-canvas');
    stage.appendChild(renderer.domElement);
    controls = new OrbitControls(camera, renderer.domElement);
    controls.target.copy(VIEW_TARGET);
    controls.addEventListener('start', () => { userMoved = true; });
    controls.enableDamping = true;
    controls.maxPolarAngle = Math.PI * 0.47;
    controls.minDistance = 15;
    controls.maxDistance = 400;
    controls.update();
    for (const key of ['before', 'after']) views[key] = buildView(key);
  }

  function groundAt(key, x, z, near, nearOld) {
    // 반환: 지표 고도(m), 영역 코드, 부가 값
    const az = Math.abs(z);
    const floorHalf = x > XR ? 11 : 14;
    let g = base(x) + noise2(x * 0.6, z * 0.6) * 0.4 + 1.2 * smooth(6, floorHalf, Math.abs(z - (x > XR ? ZC : 0)));
    const hill = (z > 0 ? 9 : 30) * smooth(floorHalf, floorHalf + 7, az) + noise2(x * 0.25, z * 0.3) * 3 * smooth(floorHalf, floorHalf + 4, az);
    g += hill;
    let region = 'plain';
    if (x > XR) {
      // 마을 구간 (공통)
      const d = Math.abs(z - ZC), hw = HALF.village;
      if (d < hw) { g = base(x) - BED.village * (1 - smooth(hw * 0.5, hw, d)); region = 'chan'; }
      else if (d < hw + 0.5) { g = lerp(base(x) - 0.1, g, smooth(hw, hw + 0.5, d)); }
      return { g, region: region === 'chan' ? 'vchan' : 'village' };
    }
    if (key === 'before') {
      const hw = HALF.before, d = near.d;
      if (d < hw) { g = base(x) - BED.before * (1 - smooth(hw * 0.45, hw, d)); region = 'chan'; }
      else if (d < hw + 0.4) g = lerp(base(x), g, smooth(hw, hw + 0.4, d));
      return { g, region };
    }
    // 직강화 후: 콘크리트 하도 + 제방
    const hw = HALF.after, d = near.d;
    if (d < hw) { g = base(x) - BED.after * (1 - smooth(hw * 0.6, hw * 0.95, d)) + 3 * smooth(hw * 0.95, hw, d); region = 'chan'; }
    else if (d < hw + LEVEE_W) {
      const crest = base(x) + 3;
      g = d < hw + LEVEE_W * 0.35 ? crest : lerp(crest, base(x) + 0.1, smooth(hw + LEVEE_W * 0.35, hw + LEVEE_W, d));
      region = 'levee';
    } else region = 'behind';
    return { g, region, old: nearOld.d };
  }

  function wetlandsFor() {
    // 굽이 안쪽(곡류 고리 안)에 습지
    const P = PATHS.before, out = [];
    const lam = PATHS.lam;
    for (let k = 1; k < 10; k++) {
      const s = (k * lam) / 2; // 꼭짓점(옆으로 가장 멀리 나간 곳)
      const i = Math.min(P.n - 1, Math.round(s / 0.1));
      const x = P.px[i], z = P.pz[i];
      const inward = z > ZC ? -1 : 1;
      out.push({ x, z: z + inward * PATHS.amp * 0.5, rx: 1.6, rz: PATHS.amp * 0.32 });
    }
    return out;
  }

  function buildView(key) {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#dfe7ec');
    scene.fog = new THREE.Fog('#dfe7ec', 200, 460);
    scene.add(new THREE.HemisphereLight('#f4f8ff', '#6d6a55', 1.25));
    const sun = new THREE.DirectionalLight('#fff6e8', 1.6);
    sun.position.set(-30, 60, 25);
    scene.add(sun);

    const P = PATHS[key], PO = PATHS.before;
    const nx = Math.round(XE / GRID) + 1, nz = Math.round((2 * Z_HALF) / GRID) + 1;
    const nv = nx * nz;
    const pos = new Float32Array(nv * 3), col = new Float32Array(nv * 3);
    const wpos = new Float32Array(nv * 3), wcol = new Float32Array(nv * 3);
    const vx = new Float32Array(nv), ground = new Float32Array(nv), vs = new Float32Array(nv), vbase = new Float32Array(nv);
    const vregion = new Uint8Array(nv), pond = new Float32Array(nv).fill(-1e9);
    const REG = { chan: 0, plain: 1, behind: 2, levee: 3, vchan: 4, village: 5 };
    const c = new THREE.Color();
    const C = {
      grass: new THREE.Color('#8fb069'), grass2: new THREE.Color('#7fa35c'), wet: new THREE.Color('#5f8a52'),
      sand: new THREE.Color('#a48c69'), concrete: new THREE.Color('#b9b8b0'), levee: new THREE.Color('#9db574'),
      road: new THREE.Color('#9a988f'), hill: new THREE.Color('#6f9150'), hillTop: new THREE.Color('#a19a74'),
      field1: new THREE.Color('#c4c47e'), field2: new THREE.Color('#9fbb62'), scar: new THREE.Color('#728f52'),
      village: new THREE.Color('#b7c79a'),
    };
    for (let j = 0; j < nz; j++) {
      const z = -Z_HALF + j * GRID;
      for (let i = 0; i < nx; i++) {
        const x = i * GRID, k = j * nx + i;
        const near = x <= XR ? nearest(P, x, z) : { d: Math.abs(z - ZC), s: P.reachS + (x - XR) };
        const nearOld = key === 'after' && x <= XR ? nearest(PO, x, z, 1.5) : { d: Infinity };
        const r = groundAt(key, x, z, near, nearOld);
        let g = r.g;
        // 습지 (직강화 전)
        let inWet = false;
        if (key === 'before' && r.region === 'plain') {
          for (const w of WETLANDS) {
            const q = ((x - w.x) / w.rx) ** 2 + ((z - w.z) / w.rz) ** 2;
            if (q < 1.6) {
              const dep = 0.9 * (1 - smooth(0.6, 1.6, q));
              if (dep > 0.05) { g -= dep; if (q < 1) { inWet = true; pond[k] = base(x) - 0.45; } }
            }
          }
        }
        ground[k] = g; vx[k] = x; vbase[k] = base(x);
        // 수위를 읽어 올 물길 위치: 하도 근처는 가장 가까운 지점, 그 밖은 같은 x 지점
        vs[k] = near.d < 3 ? near.s : (x <= XR ? P.ps[idxAtX(P, x)] : P.reachS + (x - XR));
        vregion[k] = REG[r.region];
        pos[k * 3] = x - X0; pos[k * 3 + 1] = g * VS; pos[k * 3 + 2] = z;
        wpos[k * 3] = x - X0; wpos[k * 3 + 2] = z;
        // 색
        const hillT = smooth(1.5, 20, g - base(x));
        if (r.region === 'chan') c.copy(key === 'after' ? C.concrete : C.sand);
        else if (r.region === 'vchan') c.copy(C.sand);
        else if (r.region === 'levee') c.copy(C.levee).lerp(C.road, Math.abs(near.d - HALF.after - LEVEE_W * 0.17) < 0.12 ? 0.8 : 0);
        else {
          c.copy(C.grass).lerp(C.grass2, 0.5 + 0.5 * noise2(x * 0.8, z * 0.8));
          if (r.region === 'behind' && Math.abs(z) < 12) {
            const f = (Math.floor(x / 2.2) + Math.floor((z + 30) / 1.6)) % 2;
            c.copy(f ? C.field1 : C.field2);
            if (r.old < 0.9) c.lerp(C.scar, 0.65); // 옛 물길 자국
          }
          if (r.region === 'village') c.copy(C.village);
          if (inWet) c.copy(C.wet);
          if (x > XR && Math.abs(x - 87) < 0.35 && Math.abs(z - ZC) < 11) c.copy(C.road);
          c.lerp(C.hill, smooth(0.3, 0.6, hillT)).lerp(C.hillTop, smooth(0.6, 1, hillT));
        }
        col.set([c.r, c.g, c.b], k * 3);
      }
    }
    const idx = [];
    for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i, b = a + 1, d = a + nx, e = d + 1;
      idx.push(a, d, b, b, d, e);
    }
    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    tg.setAttribute('color', new THREE.BufferAttribute(col, 3));
    tg.setIndex(idx);
    tg.computeVertexNormals();
    scene.add(new THREE.Mesh(tg, new THREE.MeshLambertMaterial({ vertexColors: true })));

    // 물
    const wg = new THREE.BufferGeometry();
    wg.setAttribute('position', new THREE.BufferAttribute(wpos, 3));
    wg.setAttribute('color', new THREE.BufferAttribute(wcol, 3));
    const wn = new Float32Array(nv * 3);
    for (let k = 0; k < nv; k++) wn[k * 3 + 1] = 1;
    wg.setAttribute('normal', new THREE.BufferAttribute(wn, 3));
    wg.setIndex(idx);
    const water = new THREE.Mesh(wg, new THREE.MeshPhongMaterial({ vertexColors: true, transparent: true, opacity: 0.88, shininess: 60, specular: '#cfe3f0', depthWrite: false }));
    water.renderOrder = 2;
    scene.add(water);

    // 물 알갱이(유속 줄무늬)
    const M = 320, R = rng(key === 'before' ? 7 : 11);
    const parts = Array.from({ length: M }, () => ({ s: R() * P.total, u: R() * 2 - 1 }));
    const sp = new Float32Array(M * 6), sc = new Float32Array(M * 6);
    for (let m = 0; m < M; m++) { sc.set([0.55, 0.7, 0.8, 1, 1, 1], m * 6); }
    const sgeo = new THREE.BufferGeometry();
    sgeo.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    sgeo.setAttribute('color', new THREE.BufferAttribute(sc, 3));
    const streaks = new THREE.LineSegments(sgeo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9, depthTest: false }));
    streaks.renderOrder = 3;
    scene.add(streaks);

    decorate(scene, key, ground, nx);

    // 화면 위 글씨
    const ov = mk('div', 'ch-ov');
    const tag = mk('div', 'ch-tag');
    const tagSmall = mk('span', 'ch-tag-sub'), flood = mk('span', 'ch-flood', '마을 범람');
    tag.append(mk('span', `ch-dot ${key === 'before' ? 'ch-dot-b' : 'ch-dot-a'}`), document.createTextNode(CASES[key].name), tagSmall, flood);
    ov.appendChild(tag);
    stage.appendChild(ov);
    const wl = WETLANDS[4];
    const labels = [
      { text: '상류 (같은 유입량)', p: [1.5, base(1.5) + 1, ZC] },
      { text: '하류 마을', p: [90, base(90) + 4, ZC + 6] },
      key === 'before'
        ? { text: '습지·범람원', p: [wl.x, base(wl.x) + 1, wl.z] }
        : { text: '제방', p: [42, base(42) + 3.5, ZC + HALF.after + 0.3] },
      key === 'before' ? { text: '굽이치는 물길', p: [24, base(24) + 1, PATHS.before.pz[idxAtX(PATHS.before, 24)]] } : { text: '옛 물길 자리', p: [PO.px[idxAtX(PO, 30)], base(30) + 0.5, PO.pz[idxAtX(PO, 30)]] },
    ].map((l) => {
      const el = mk('div', 'ch-lbl', l.text);
      ov.appendChild(el);
      return { el, v: new THREE.Vector3(l.p[0] - X0, l.p[1] * VS, l.p[2]) };
    });

    return {
      key, scene, P, nv, ground, vx, vs, vbase, vregion, pond, wpos, wcol, wg, parts, sp, sc, sgeo, ov, labels,
      tagSmall, flood, rect: null,
    };
  }

  function decorate(scene, key, ground, nx) {
    const R = rng(key === 'before' ? 3 : 5);
    const hAt = (x, z) => {
      const i = Math.max(0, Math.min(nx - 1, Math.round(x / GRID)));
      const j = Math.max(0, Math.round((z + Z_HALF) / GRID));
      return ground[j * nx + i];
    };
    const P = PATHS[key];
    // 나무
    const trees = [];
    const nTrees = key === 'before' ? 520 : 170;
    for (let t = 0; trees.length < nTrees && t < 6000; t++) {
      const x = R() * XR, z = (R() * 2 - 1) * 17;
      const nr = nearest(P, x, z);
      const minD = key === 'before' ? 1.5 : 2.4;
      if (nr.d < minD) continue;
      if (key === 'before' && WETLANDS.some((w) => ((x - w.x) / w.rx) ** 2 + ((z - w.z) / w.rz) ** 2 < 1.3)) continue;
      if (key === 'after' && Math.abs(z) < 12 && R() < 0.85) continue; // 범람원은 농경지·시가지
      trees.push([x, z]);
    }
    for (let t = 0; t < 26; t++) trees.push([XR + 1 + R() * 15, ZC + (R() < 0.5 ? -1 : 1) * (9 + R() * 3)]);
    const tg = new THREE.ConeGeometry(0.35, 1.1, 6);
    tg.translate(0, 0.55, 0);
    const tm = new THREE.InstancedMesh(tg, new THREE.MeshLambertMaterial({ color: '#3f6b35' }), trees.length);
    const m4 = new THREE.Matrix4();
    trees.forEach(([x, z], i) => {
      const s = 0.7 + R() * 0.6;
      m4.makeScale(s, s, s).setPosition(x - X0, hAt(x, z) * VS, z);
      tm.setMatrixAt(i, m4);
    });
    scene.add(tm);

    // 갈대 (습지)
    if (key === 'before') {
      const reeds = [];
      for (const w of WETLANDS) for (let r = 0; r < 26; r++) {
        const a = R() * Math.PI * 2, q = 0.85 + R() * 0.4;
        reeds.push([w.x + Math.cos(a) * w.rx * q, w.z + Math.sin(a) * w.rz * q]);
      }
      const rg = new THREE.ConeGeometry(0.08, 0.5, 4);
      rg.translate(0, 0.25, 0);
      const rm = new THREE.InstancedMesh(rg, new THREE.MeshLambertMaterial({ color: '#b5b45c' }), reeds.length);
      reeds.forEach(([x, z], i) => { m4.makeTranslation(x - X0, hAt(x, z) * VS, z); rm.setMatrixAt(i, m4); });
      scene.add(rm);
    }

    // 집 (마을 + 직강화 후 범람원의 새 건물)
    const houses = [];
    for (let t = 0; houses.length < 26 && t < 800; t++) {
      const x = XR + 1.2 + R() * 14.4, side = R() < 0.5 ? -1 : 1, z = ZC + side * (2.2 + R() * 5.5);
      if (Math.abs(x - 87) < 0.9) continue;
      if (houses.some((h) => Math.hypot(h[0] - x, h[1] - z) < 1.5)) continue;
      houses.push([x, z, 0.85 + R() * 0.35]);
    }
    if (key === 'after') {
      for (let t = 0; t < 400 && houses.length < 60; t++) {
        const x = 50 + R() * 24, side = R() < 0.5 ? -1 : 1, z = ZC + side * (HALF.after + LEVEE_W + 0.8 + R() * 6);
        if (houses.some((h) => Math.hypot(h[0] - x, h[1] - z) < 1.2)) continue;
        houses.push([x, z, 0.9 + R() * 0.5]);
      }
    }
    const hb = new THREE.BoxGeometry(1, 1, 1); hb.translate(0, 0.5, 0);
    const hr = new THREE.ConeGeometry(0.75, 0.45, 4); hr.rotateY(Math.PI / 4); hr.translate(0, 0.22, 0);
    const bodies = new THREE.InstancedMesh(hb, new THREE.MeshLambertMaterial({ color: '#f1ece2' }), houses.length);
    const roofs = new THREE.InstancedMesh(hr, new THREE.MeshLambertMaterial({ color: '#b5523b' }), houses.length);
    houses.forEach(([x, z, s], i) => {
      const y = hAt(x, z) * VS;
      const tall = x < XR ? 1.6 : 1;
      m4.makeScale(s, 0.42 * s * tall * 1.4, s).setPosition(x - X0, y, z); bodies.setMatrixAt(i, m4);
      m4.makeScale(s, s, s).setPosition(x - X0, y + 0.42 * s * tall * 1.4, z); roofs.setMatrixAt(i, m4);
    });
    scene.add(bodies, roofs);

    // 다리
    const bx = 87, deckY = (base(bx) + 1.0) * VS;
    const deck = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.12, 2 * HALF.village + 1.6), new THREE.MeshLambertMaterial({ color: '#8d8a83' }));
    deck.position.set(bx - X0, deckY, ZC);
    scene.add(deck);
    for (const dz of [-0.5, 0.5]) {
      const pier = new THREE.Mesh(new THREE.BoxGeometry(0.22, 1.2, 0.22), new THREE.MeshLambertMaterial({ color: '#7a776f' }));
      pier.position.set(bx - X0, deckY - 0.6, ZC + dz);
      scene.add(pier);
    }
  }

  // 물 표면 갱신
  const CW = { deep: new THREE.Color('#3f6f8c'), shallow: new THREE.Color('#6f98ac'), mud: new THREE.Color('#8a6d42'), pond: new THREE.Color('#4f7b78') };
  const tmpC = new THREE.Color();
  let rippleT = 0;
  function updateWater(V, t) {
    const res = state.res[V.key];
    const S = sampleAt(res, t);
    const P = V.P, N = S.N;
    const hv = S.village;
    const { ground, vs, vbase, vregion, pond, wpos, wcol, vx } = V;
    for (let k = 0; k < V.nv; k++) {
      const reg = vregion[k], g = ground[k];
      let wse, wet;
      if (reg >= 4) { wse = vbase[k] - BED.village + hv; wet = wse > g; }
      else {
        if (reg === 0 || reg === 3) {
          wse = vbase[k] - BED[V.key] + cellValue(S.h, N, P, vs[k]); // 하도
        } else {
          const f = cellValue(S.f, N, P, vs[k]); // 범람원(저류지) 물 깊이
          wse = f > 0.02 ? vbase[k] + f : -1e9;
          if (pond[k] > wse) wse = pond[k];
        }
        wet = wse > g;
      }
      wpos[k * 3 + 1] = wet ? wse * VS + 0.015 : g * VS - 0.6;
      if (wet) {
        const depth = wse - g;
        const onPlain = reg === 1 || reg === 2 || reg === 5;
        if (onPlain && pond[k] > -1e8 && wse <= pond[k] + 1e-3) tmpC.copy(CW.pond);
        else if (onPlain) tmpC.copy(CW.mud).lerp(CW.shallow, 0.2 + Math.min(1, depth / 2) * 0.25);
        else tmpC.copy(CW.shallow).lerp(CW.deep, Math.min(1, depth / 4));
        // 잔물결 느낌의 밝기 얼룩
        const rip = 1 + 0.07 * Math.sin(vx[k] * 2.3 + wpos[k * 3 + 2] * 1.7 + rippleT * 2.2) * Math.sin(wpos[k * 3 + 2] * 2.9 - vx[k] * 0.8 - rippleT * 1.3);
        wcol[k * 3] = tmpC.r * rip; wcol[k * 3 + 1] = tmpC.g * rip; wcol[k * 3 + 2] = tmpC.b * rip;
      }
    }
    V.wg.attributes.position.needsUpdate = true;
    V.wg.attributes.color.needsUpdate = true;
  }

  // 물 알갱이: 화면 속도 = 실제 유속(m/s) × 0.9 단위/초
  function updateStreaks(V, t, dt) {
    const S = sampleAt(state.res[V.key], t);
    const P = V.P, N = S.N, hw = V.key === 'before' ? HALF.before : HALF.after;
    const { parts, sp, sc } = V;
    const pt = (s) => Math.min(P.n - 1, Math.max(0, Math.round(s / 0.1)));
    for (let m = 0; m < parts.length; m++) {
      const q = parts[m];
      const inReach = q.s < P.reachS;
      const vel = inReach ? cellValue(S.v, N, P, q.s) : S.villageV;
      q.s += vel * 0.9 * dt;
      if (q.s > P.total) { q.s = Math.random() * 3; q.u = Math.random() * 2 - 1; }
      const len = 0.15 + vel * 0.32;
      const i1 = pt(q.s), i0 = pt(q.s - len);
      const w = (inReach ? hw : HALF.village) * 0.55 * q.u;
      const reachH = (s) => (s < P.reachS ? base(P.px[pt(s)]) - BED[V.key] + cellValue(S.h, N, P, s) : base(P.px[pt(s)]) - BED.village + S.village);
      const y1 = reachH(q.s) * VS + 0.06, y0 = reachH(Math.max(0, q.s - len)) * VS + 0.06;
      sp[m * 6] = P.px[i0] - P.tz[i0] * w - X0; sp[m * 6 + 1] = y0; sp[m * 6 + 2] = P.pz[i0] + P.tx[i0] * w;
      sp[m * 6 + 3] = P.px[i1] - P.tz[i1] * w - X0; sp[m * 6 + 4] = y1; sp[m * 6 + 5] = P.pz[i1] + P.tx[i1] * w;
    }
    void sc;
    V.sgeo.attributes.position.needsUpdate = true;
  }

  // ── 화면 배치 ─────────────────────────────────────────────
  let divider = null;
  function layout() {
    if (!renderer) return;
    const W = stage.clientWidth, H = stage.clientHeight;
    renderer.setSize(W, H, false);
    const rects = {};
    if (state.view === 'split') {
      // 긴 골짜기라 화면 하나의 가로세로비가 2 쪽에 가까운 배치를 고른다
      const sideBySide = Math.abs(Math.log(W / 2 / H / 2)) < Math.abs(Math.log((2 * W) / H / 2));
      if (sideBySide) {
        const w = Math.floor(W / 2);
        rects.before = { x: 0, y: 0, w, h: H }; rects.after = { x: w, y: 0, w: W - w, h: H };
      } else {
        const h = Math.floor(H / 2);
        rects.before = { x: 0, y: 0, w: W, h }; rects.after = { x: 0, y: h, w: W, h: H - h };
      }
      if (!divider) { divider = mk('div', 'ch-divider'); stage.appendChild(divider); }
      Object.assign(divider.style, sideBySide
        ? { left: `${rects.after.x - 1}px`, top: '0', width: '2px', height: '100%', display: 'block' }
        : { left: '0', top: `${rects.after.y - 1}px`, width: '100%', height: '2px', display: 'block' });
    } else {
      rects[state.view] = { x: 0, y: 0, w: W, h: H };
      if (divider) divider.style.display = 'none';
    }
    for (const key of ['before', 'after']) {
      const V = views[key], r = rects[key];
      V.rect = r || null;
      V.ov.style.display = r ? 'block' : 'none';
      if (r) Object.assign(V.ov.style, { left: `${r.x}px`, top: `${r.y}px`, width: `${r.w}px`, height: `${r.h}px` });
    }
    const any = rects.before || rects.after;
    camera.aspect = any.w / any.h;
    // 좁은 화면에서는 조금 물러선다
    camera.fov = 34;
    camera.updateProjectionMatrix();
    if (!userMoved) fitCamera();
  }
  if (renderer) new ResizeObserver(layout).observe(stage);

  const vtmp = new THREE.Vector3();
  function placeLabels(V) {
    const r = V.rect;
    for (const l of V.labels) {
      vtmp.copy(l.v).project(camera);
      const vis = vtmp.z < 1 && Math.abs(vtmp.x) < 0.95 && Math.abs(vtmp.y) < 0.95;
      l.el.style.display = vis ? 'block' : 'none';
      if (vis) {
        l.el.style.left = `${((vtmp.x + 1) / 2) * r.w}px`;
        l.el.style.top = `${((1 - vtmp.y) / 2) * r.h}px`;
      }
    }
  }

  // ── 시계 표시 ─────────────────────────────────────────────
  const clock = mk('div', 'ch-clock');
  const clockT = mk('span'), clockQ = mk('span', 'ch-q'), clockBar = mk('span', 'ch-bar-fill');
  const rain = mk('span', 'ch-rain', '상류 유입 ');
  const barBox = mk('span', 'ch-bar');
  barBox.appendChild(clockBar);
  rain.append(barBox, clockQ);
  clock.append(clockT, rain);
  stage.appendChild(clock);

  const fmtHM = (t) => { const m = Math.round(t / 60); return `${Math.floor(m / 60)}시간 ${String(m % 60).padStart(2, '0')}분`; };

  // ── 사이드바 ──────────────────────────────────────────────
  const playBtn = $('.ch-play'), resetBtn = $('.ch-reset'), timeIn = $('.ch-time'), timeOut = $('.ch-time-out');
  setBtn(resetBtn, 'reset', '처음으로');
  function syncPlay() {
    const atStart = state.t <= 0 && !state.playing, ended = state.t >= T_END;
    if (state.playing) setBtn(playBtn, 'pause', '일시 정지');
    else if (atStart || ended) setBtn(playBtn, 'play', '집중호우 시작');
    else setBtn(playBtn, 'play', '계속');
  }
  playBtn.addEventListener('click', () => {
    if (state.playing) state.playing = false;
    else { if (state.t >= T_END) state.t = 0; state.playing = true; }
    syncPlay();
  });
  resetBtn.addEventListener('click', () => { state.playing = false; state.t = 0; syncPlay(); refresh(true); });
  timeIn.addEventListener('input', () => { state.t = Number(timeIn.value) * 3600; refresh(true); });
  function bindSeg(id, attr, fn) {
    const seg = $(id);
    seg.addEventListener('click', (e) => {
      const b = e.target.closest('.ds-seg-btn'); if (!b) return;
      seg.querySelectorAll('.ds-seg-btn').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      fn(b.dataset[attr]);
    });
  }
  bindSeg('.ch-view', 'v', (v) => { state.view = v; layout(); });
  bindSeg('.ch-speed', 's', (s) => { state.speed = Number(s); });
  const storm = $('.ch-storm'), stormOut = $('.ch-storm-out');
  let stormTimer = 0;
  storm.addEventListener('input', () => {
    stormOut.textContent = `${storm.value} m³/s`;
    clearTimeout(stormTimer);
    stormTimer = setTimeout(() => { state.qPeak = Number(storm.value); runModel(); refresh(true); }, 160);
  });

  // 표
  const UPK = { before: 0, after: 0 };
  for (const key of ['before', 'after']) UPK[key] = Math.floor(reachInfo(CASES[key]).N * 0.15);
  function setDD(id, text, cls = '') { const d = $(`[data-k="${id}"]`); d.textContent = text; d.className = cls ? `ch-v ${cls}` : 'ch-v'; }
  function refreshTable() {
    const t = state.t;
    for (const key of ['before', 'after']) {
      const K = key === 'before' ? 'B' : 'A';
      const res = state.res[key], S = sampleAt(res, t), N = S.N;
      let vSum = 0; for (let i = 0; i < N; i++) vSum += S.v(i);
      const vMean = vSum / N;
      setDD(`v${K}`, `${vMean.toFixed(1)} m/s`);
      setDD(`u${K}`, `${S.h(UPK[key]).toFixed(1)} m`);
      const hv = S.village, flooding = hv > VILLAGE.Hb;
      setDD(`h${K}`, `${hv.toFixed(2)} m`, flooding ? 'ch-bad' : '');
      const upto = Math.min(NREC - 1, Math.floor(t / SAMPLE));
      let mx = res.rec.village[0]; for (let i = 1; i <= upto; i++) mx = Math.max(mx, res.rec.village[i]);
      mx = Math.max(mx, hv);
      setDD(`m${K}`, `${mx.toFixed(2)} m`, mx > VILLAGE.Hb ? 'ch-bad' : '');
      const passed = t >= res.peakTime + 900 || t >= T_END;
      setDD(`p${K}`, passed ? fmtHM(res.peakTime).replace(' 00분', '') : t > 0 ? '물이 차는 중' : '—');
      setDD(`f${K}`, flooding ? '범람 중' : mx > VILLAGE.Hb ? '범람했음' : '안전', flooding || mx > VILLAGE.Hb ? 'ch-bad' : 'ch-ok');
      const V = views[key];
      if (V) {
        V.tagSmall.textContent = `유속 ${vMean.toFixed(1)} m/s · 마을 수위 ${hv.toFixed(1)} m`;
        V.flood.classList.toggle('ch-on', flooding);
      }
    }
    const q = inflow(t, state.qPeak);
    clockT.textContent = `비 시작 후 ${fmtHM(t)}`;
    clockQ.textContent = `${Math.round(q)} m³/s`;
    clockBar.style.width = `${Math.min(100, (q / 800) * 100)}%`;
    timeOut.textContent = fmtHM(t);
    timeIn.value = String(t / 3600);
  }

  // ── 수문곡선 (csat-chart.js) ──────────────────────────────
  const chartCanvas = $('.ch-chart');
  const xLabels = Array.from({ length: NREC }, (_, i) => { const tt = (i * SAMPLE) / 3600; return Number.isInteger(tt) && tt % 2 === 0 ? String(tt) : ''; });
  let chartIdx = -1;
  const FONT = "Pretendard, 'Pretendard Variable', 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif";
  const baseOpts = createDefaultGraphOptions();
  // 외부 글꼴을 받지 않고 페이지 글꼴·시스템 글꼴로 그린다
  const CHART_OPTS = { ...baseOpts, fontFamily: 'sans', fontStack: { sans: FONT, serif: FONT, numeral: 'Arial' },
    fontSize: { ...baseOpts.fontSize, tick: 30, axisLabel: 32, dataLabel: 32 } };
  function chartData(upto) {
    const cut = (arr) => arr.map((v, i) => (i <= upto ? Math.round(v * 100) / 100 : null));
    return {
      series: [
        { label: '직강화 전', values: cut(state.res.before.rec.village), lineStyle: 'solid', stroke: COLORS.before, lineWidth: 4 },
        { label: '직강화 후', values: cut(state.res.after.rec.village), lineStyle: 'solid', stroke: COLORS.after, lineWidth: 4 },
        { label: '마을 둑 높이', values: Array(NREC).fill(VILLAGE.Hb), lineStyle: 'dashed', stroke: '#868e96', lineWidth: 2.5 },
      ],
      xLabels, xUnit: '(시간)', yUnit: '(m)',
      yRange: { min: 0, max: 6, auto: false, step: 1 },
      labelPlacement: 'legend', showMarkers: false, xGrid: true,
    };
  }
  function refreshChart(force) {
    const upto = Math.min(NREC - 1, Math.floor(state.t / SAMPLE));
    if (!force && upto === chartIdx) return;
    chartIdx = upto;
    const data = chartData(upto);
    try {
      const ctx = chartCanvas.getContext('2d');
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, chartCanvas.width, chartCanvas.height);
      renderLineGraph(ctx, chartCanvas.width, chartCanvas.height, data, CHART_OPTS);
    } catch (e) { console.warn(e); }
  }

  function refresh(force) {
    refreshTable();
    refreshChart(force);
    if (renderer && !state.playing) for (const k of ['before', 'after']) updateWater(views[k], state.t);
  }

  // ── 루프 ──────────────────────────────────────────────────
  const HOURS_PER_SEC = 1 / 3; // 보통 속도: 1초에 20분
  let last = performance.now(), tableClock = 0, waterClock = 0;
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (state.playing) {
      state.t = Math.min(T_END, state.t + dt * HOURS_PER_SEC * 3600 * state.speed);
      if (state.t >= T_END) { state.playing = false; syncPlay(); }
    }
    tableClock += dt;
    if (state.playing && tableClock > 0.1) { tableClock = 0; refreshTable(); refreshChart(false); }
    rippleT += dt;
    waterClock += dt;
    const waterTick = waterClock > 0.08;
    if (waterTick) waterClock = 0;
    if (renderer) {
      controls.update();
      const W = stage.clientWidth, H = stage.clientHeight;
      for (const key of ['before', 'after']) {
        const V = views[key];
        if (!V.rect) continue;
        if (state.playing || waterTick) updateWater(V, state.t);
        updateStreaks(V, state.t, dt);
        const r = V.rect;
        renderer.setViewport(r.x, H - r.y - r.h, r.w, r.h);
        renderer.setScissor(r.x, H - r.y - r.h, r.w, r.h);
        renderer.render(V.scene, camera);
        placeLabels(V);
      }
      void W;
    }
    requestAnimationFrame(frame);
  }
  layout();
  syncPlay();
  refresh(true);
  requestAnimationFrame(frame);
}
