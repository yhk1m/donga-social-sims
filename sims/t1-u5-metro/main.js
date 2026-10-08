// © 2026 김용현
// 대도시권 형성 과정 — 가상 도시의 1960~2020년 변화를 시간 슬라이더로 본다.
// 규칙(EMBED_RULES.md): mount(root) 안에서만 DOM 을 만들고(root 밖 접근 없음), innerHTML 없이 h() 로 출력한다.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
// CsatChart 클래스 대신 저수준 렌더러만 쓴다 — ensureFonts(외부 글꼴 CDN·document.head 접근)를 번들에 넣지 않기 위해
import { renderLineGraph, createDefaultGraphOptions } from 'csat-chart.js';
import { createShell, addBlock } from '../../src/shared/shell.js';
import { h, icon } from '../../src/shared/dom.js';
import './style.css';
import {
  YEAR_MIN, YEAR_MAX, N, USE, STAGES, SATS, LINES, cells, stageAt, lineOpen, satActive,
  makeState, computeState, stats, flows, metroBoundary, boundaryOpacity, SUBURB_R, POP_SCALE,
} from './model.js';

const clampYear = (y) => Math.min(YEAR_MAX, Math.max(YEAR_MIN, y));

// '**용어**' 표시를 굵은 글씨 요소로 바꾼다
function richText(text) {
  return text.split(/\*\*(.+?)\*\*/).map((part, i) => (i % 2 ? h('b', { class: 'metro-term' }, part) : part));
}

export default function mount(root) {
  const { stage, panel } = createShell(root, 't1-u5-metro');
  stage.classList.add('metro-stage');
  const params = new URLSearchParams(location.search);

  // ---------- 상태 ----------
  const view = {
    year: clampYear(Number(params.get('year')) || YEAR_MIN),
    playing: false,
    price: params.get('price') === '1',
    flow: params.get('flow') !== '0',
    func: params.get('func') !== '0',
  };
  const st = makeState();

  // ---------- 무대 위 글자 ----------
  const hudYear = h('span', { class: 'metro-hud-year' });
  const hudStage = h('span', { class: 'metro-hud-stage' });
  stage.append(
    h('div', { class: 'metro-hud' }, hudYear, hudStage),
    h('div', { class: 'metro-hint' }, '끌어서 돌리기 · 휠로 확대'),
  );

  // ---------- 사이드바 ----------
  const yearOut = h('output', { class: 'ds-out' });
  const slider = h('input', { class: 'ds-range', type: 'range', min: YEAR_MIN, max: YEAR_MAX, step: 0.1, value: view.year, 'aria-label': '연도' });
  const playBtn = h('button', { class: 'ds-btn ds-primary', type: 'button' });
  const resetBtn = h('button', { class: 'ds-btn', type: 'button' }, icon('reset'), '처음으로');
  addBlock(panel, h('div', { class: 'ds-ctl' },
    h('label', { class: 'ds-label' }, '연도', yearOut),
    slider,
    h('div', { class: 'ds-row' }, playBtn, resetBtn),
  ));

  const stageBtns = STAGES.map((S, i) => h('button', {
    class: 'ds-seg-btn metro-seg-btn', type: 'button', title: `${S.name} (${S.from}~${S.to}년)`,
    on: { click: () => { stop(); setYear(i === STAGES.length - 1 ? YEAR_MAX : S.to - 1); } },
  }, S.short));
  addBlock(panel, h('div', { class: 'ds-seg', role: 'group', 'aria-label': '단계로 이동' }, stageBtns));

  const stKicker = h('span', { class: 'metro-kicker' });
  const stName = h('h2', { class: 'metro-card-title' });
  const stText = h('p', { class: 'metro-card-text' });
  addBlock(panel, h('section', { class: 'metro-card', 'aria-live': 'polite' }, stKicker, stName, stText));

  const tCbd = h('span', { class: 'metro-trend' }), sCbd = h('span');
  const tSub = h('span', { class: 'metro-trend' }), sSub = h('span');
  const sBuilt = h('dd', { class: 'ds-stat-v' });
  const sPrice = h('dd', { class: 'ds-stat-v' });
  const sComm = h('dd', { class: 'ds-stat-v' });
  addBlock(panel, h('section', { class: 'ds-ctl' },
    h('h2', { class: 'ds-h2' }, '숫자로 보기'),
    h('dl', { class: 'ds-stat' },
      h('dt', { class: 'ds-stat-k' }, '도심 인구'), h('dd', { class: 'ds-stat-v' }, tCbd, sCbd),
      h('dt', { class: 'ds-stat-k' }, '교외 인구'), h('dd', { class: 'ds-stat-v' }, tSub, sSub),
      h('dt', { class: 'ds-stat-k' }, '시가지 면적 비율'), sBuilt,
      h('dt', { class: 'ds-stat-k' }, '도심 지가 ', h('span', { class: 'metro-unit' }, '(1960=100)')), sPrice,
      h('dt', { class: 'ds-stat-k' }, '도심으로 통근'), sComm,
    ),
  ));

  const chartCanvas = h('canvas', { class: 'metro-chart', width: 800, height: 540, 'aria-label': '중심 도시와 교외의 인구 변화 그래프' });
  addBlock(panel, h('section', { class: 'metro-chart-box' },
    chartCanvas,
    h('span', { class: 'metro-cap' }, '중심 도시는 도심에서 반지름 10칸 안, 교외는 그 바깥(위성 도시 포함)이다. 가상 도시의 값이다.'),
  ));

  const toggle = (label, key, after) => {
    const input = h('input', { class: 'metro-sw-input', type: 'checkbox' });
    input.checked = view[key];
    input.addEventListener('change', () => { view[key] = input.checked; after?.(); setYear(view.year); });
    return h('label', { class: 'ds-check metro-sw' }, label, input);
  };
  const ramp = h('div', { class: 'metro-ramp' },
    h('div', { class: 'metro-ramp-bar' }),
    h('div', { class: 'metro-ramp-ends' }, h('span', {}, '낮음'), h('span', {}, '2020년 도심 수준')),
  );
  addBlock(panel, h('section', { class: 'metro-toggles' },
    h('h2', { class: 'ds-h2' }, '보기'),
    toggle('지가 보기', 'price', syncLegend),
    ramp,
    toggle('통근 흐름 보기', 'flow'),
    toggle('기능 분화 색 보기', 'func', syncLegend),
  ));

  const chip = (style, extra = '') => h('span', { class: `metro-sw-chip ${extra}`, style });
  const item = (c, label) => h('span', { class: 'metro-legend-item' }, c, label);
  const legend = h('div', { class: 'metro-legend' },
    item(chip({ background: '#e0565b' }), '상업·업무'),
    item(chip({ background: '#f2c14e' }), '주거'),
    item(chip({ background: '#8e6fc1' }), '공업'),
    item(chip({ background: '#c7dd9a' }), '농경지'),
    item(chip({ background: '#4f8a4a' }), '녹지(산림)'),
    item(chip({ background: '#6fa8dc' }), '하천'),
    item(chip({ background: '#7d838b' }, 'metro-chip-line'), '고속 국도'),
    item(chip({ background: '#2f3640' }, 'metro-chip-line'), '전철'),
    item(chip({ background: '#1f6feb' }, 'metro-chip-line'), '통근 흐름'),
    item(chip({}, 'metro-chip-dash'), '대도시권'),
  );
  addBlock(panel, h('section', { class: 'ds-ctl' }, h('h2', { class: 'ds-h2' }, '범례'), legend));
  addBlock(panel, h('p', { class: 'ds-note' }, '가상의 도시다. 같은 씨앗 값으로 만들기 때문에 어느 컴퓨터에서 열어도 똑같은 도시가 그려진다.'));

  function syncLegend() {
    ramp.classList.toggle('metro-on', view.price);
    legend.classList.toggle('metro-off', view.price);
  }

  // ---------- 장면 ----------
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.domElement.classList.add('ds-canvas');
  stage.prepend(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.5, 500);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.maxPolarAngle = 1.38;
  controls.minDistance = 14;
  controls.maxDistance = 140;
  controls.target.set(0, 0, 2);

  scene.add(new THREE.HemisphereLight(0xffffff, 0xb9b2a0, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 1.7);
  sun.position.set(-30, 60, 25);
  scene.add(sun);

  // 바탕 판
  const base = new THREE.Mesh(new THREE.BoxGeometry(N + 1.2, 1, N + 1.2), new THREE.MeshLambertMaterial({ color: 0xcfc8b6 }));
  base.position.y = -0.5;
  scene.add(base);

  // 칸 블록 (하나의 InstancedMesh)
  const boxGeo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const blocks = new THREE.InstancedMesh(boxGeo, new THREE.MeshLambertMaterial({ flatShading: true }), cells.length);
  blocks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(blocks);

  const COLORS = {
    [USE.FARM]: new THREE.Color('#c7dd9a'),
    [USE.FOREST]: new THREE.Color('#4f8a4a'),
    [USE.WATER]: new THREE.Color('#6fa8dc'),
    [USE.ROAD]: new THREE.Color('#c9c5ba'),
    [USE.RAIL]: new THREE.Color('#c9c5ba'),
    [USE.COM]: new THREE.Color('#e0565b'),
    [USE.RES]: new THREE.Color('#f2c14e'),
    [USE.IND]: new THREE.Color('#8e6fc1'),
  };
  const GREY = new THREE.Color('#bdb6a8');
  const RAMP = ['#fff6d5', '#fdd27a', '#f58b4c', '#d7301f', '#7f0000'].map((c) => new THREE.Color(c));
  const rampColor = (v, out) => {
    const x = Math.min(0.9999, Math.max(0, v)) * (RAMP.length - 1);
    const k = Math.floor(x);
    return out.copy(RAMP[k]).lerp(RAMP[k + 1], x - k);
  };
  const FOOT = { [USE.FARM]: 0.95, [USE.FOREST]: 0.86, [USE.WATER]: 1.0, [USE.ROAD]: 1.0, [USE.RAIL]: 1.0, [USE.COM]: 0.74, [USE.RES]: 0.8, [USE.IND]: 0.93 };

  const m4 = new THREE.Matrix4();
  const tmpC = new THREE.Color();
  function updateBlocks() {
    for (let k = 0; k < cells.length; k++) {
      const c = cells[k];
      const u = st.use[k];
      const f = FOOT[u];
      m4.makeScale(f, Math.max(0.02, st.h[k]), f);
      m4.setPosition(c.x, 0, c.z);
      blocks.setMatrixAt(k, m4);
      if (view.price && u !== USE.WATER) rampColor(st.price[k], tmpC);
      else if (!view.func && (u === USE.COM || u === USE.RES || u === USE.IND)) tmpC.copy(GREY);
      else tmpC.copy(COLORS[u]);
      tmpC.multiplyScalar(0.93 + 0.12 * c.h3);
      blocks.setColorAt(k, tmpC);
    }
    blocks.instanceMatrix.needsUpdate = true;
    blocks.instanceColor.needsUpdate = true;
  }

  // ---------- 교통로 리본 ----------
  const lineMeshes = LINES.map((L) => {
    const mesh = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshLambertMaterial({ color: L.type === 'road' ? 0x7d838b : 0x2f3640 }));
    mesh.position.y = L.type === 'road' ? 0.09 : 0.1;
    mesh.userData.frac = -1;
    scene.add(mesh);
    return mesh;
  });
  function ribbonGeometry(pts, width) {
    const pos = [], idx = [];
    for (let k = 0; k < pts.length; k++) {
      const p = pts[k];
      const a = pts[Math.max(0, k - 1)], b = pts[Math.min(pts.length - 1, k + 1)];
      let dx = b[0] - a[0], dz = b[1] - a[1];
      const l = Math.hypot(dx, dz) || 1;
      dx /= l; dz /= l;
      const nx = -dz * width / 2, nz = dx * width / 2;
      pos.push(p[0] + nx, 0, p[1] + nz, p[0] - nx, 0, p[1] - nz);
      if (k > 0) { const o = (k - 1) * 2; idx.push(o, o + 2, o + 1, o + 1, o + 2, o + 3); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }
  function partialPolyline(L, frac) {
    const want = L.len * frac;
    const out = [L.pts[0]];
    let acc = 0;
    for (let k = 1; k < L.pts.length; k++) {
      const seg = L.segLen[k - 1];
      if (acc + seg >= want) {
        const u = (want - acc) / seg;
        const [ax, az] = L.pts[k - 1], [bx, bz] = L.pts[k];
        out.push([ax + (bx - ax) * u, az + (bz - az) * u]);
        return out;
      }
      out.push(L.pts[k]);
      acc += seg;
    }
    return out;
  }
  function updateLines(t) {
    LINES.forEach((L, i) => {
      const frac = Math.round(lineOpen(L, t) * 200) / 200;
      const mesh = lineMeshes[i];
      if (frac === mesh.userData.frac) return;
      mesh.userData.frac = frac;
      mesh.geometry.dispose();
      mesh.visible = frac > 0.005;
      mesh.geometry = mesh.visible ? ribbonGeometry(partialPolyline(L, frac), L.type === 'road' ? 0.72 : 0.42) : new THREE.BufferGeometry();
    });
  }

  // ---------- 통근 흐름 ----------
  const flowMat = new THREE.MeshBasicMaterial({ color: 0x1f6feb, transparent: true, opacity: 0.5, depthWrite: false });
  const flowObjs = SATS.map((S) => {
    const from = new THREE.Vector3(S.x, 0.4, S.z);
    const to = new THREE.Vector3(0, 0.4, 0);
    const mid = from.clone().lerp(to, 0.5);
    mid.y = 3 + from.distanceTo(to) * 0.16;
    const mesh = new THREE.Mesh(new THREE.BufferGeometry(), flowMat);
    mesh.userData.r = -1;
    mesh.renderOrder = 2;
    scene.add(mesh);
    return { S, curve: new THREE.QuadraticBezierCurve3(from, mid, to), mesh, v: 0, n: 0 };
  });
  const MAX_DOTS = 14;
  const dots = new THREE.InstancedMesh(new THREE.SphereGeometry(0.2, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }), SATS.length * MAX_DOTS);
  dots.renderOrder = 3;
  scene.add(dots);
  function updateFlows(fl) {
    fl.forEach((f, i) => {
      const o = flowObjs[i];
      o.v = f.v;
      const r = f.v < 0.8 ? 0 : Math.round((0.06 + 0.032 * Math.sqrt(f.v)) * 100) / 100;
      o.n = r === 0 ? 0 : Math.min(MAX_DOTS, 2 + Math.round(f.v / 5));
      if (r !== o.mesh.userData.r) {
        o.mesh.userData.r = r;
        o.mesh.geometry.dispose();
        o.mesh.geometry = r ? new THREE.TubeGeometry(o.curve, 48, r, 8, false) : new THREE.BufferGeometry();
      }
      o.mesh.visible = view.flow && r > 0;
    });
  }
  const p3 = new THREE.Vector3();
  function animateDots(time) {
    let k = 0;
    for (const o of flowObjs) {
      for (let d = 0; d < MAX_DOTS; d++, k++) {
        if (!view.flow || d >= o.n) { m4.makeScale(0, 0, 0); dots.setMatrixAt(k, m4); continue; }
        const u = (time * 0.12 + d / o.n + o.S.x * 0.013) % 1;
        o.curve.getPoint(u, p3);
        const sc = 0.6 + 0.6 * Math.min(1, o.v / 40);
        m4.makeScale(sc, sc, sc);
        m4.setPosition(p3);
        dots.setMatrixAt(k, m4);
      }
    }
    dots.instanceMatrix.needsUpdate = true;
  }

  // ---------- 대도시권 경계(점선) ----------
  const boundMat = new THREE.MeshBasicMaterial({ color: 0xd9480f, transparent: true, opacity: 0, depthWrite: false });
  const boundMesh = new THREE.Mesh(new THREE.BufferGeometry(), boundMat);
  boundMesh.position.y = 0.16;
  boundMesh.renderOrder = 1;
  scene.add(boundMesh);
  const boundLabelPos = new THREE.Vector3();
  function updateBoundary(t) {
    const op = boundaryOpacity(t);
    boundMat.opacity = op * 0.95;
    boundMesh.visible = op > 0.01;
    if (!boundMesh.visible) return;
    const pts = metroBoundary(t, st);
    // 둘레를 따라 대시(길이 0.8, 틈 0.5)를 납작한 사각형으로 깐다
    const pos = [], idx = [];
    const W = 0.21;
    let carry = 0;
    for (let s = 0; s < pts.length; s++) {
      const a = pts[s], b = pts[(s + 1) % pts.length];
      const dx = b[0] - a[0], dz = b[1] - a[1];
      const len = Math.hypot(dx, dz);
      const ux = dx / len, uz = dz / len, nx = -uz * W, nz = ux * W;
      let u = carry;
      while (u < len) {
        const e = Math.min(len, u + 0.8);
        const x0 = a[0] + ux * u, z0 = a[1] + uz * u, x1 = a[0] + ux * e, z1 = a[1] + uz * e;
        const o = pos.length / 3;
        pos.push(x0 + nx, 0, z0 + nz, x0 - nx, 0, z0 - nz, x1 + nx, 0, z1 + nz, x1 - nx, 0, z1 - nz);
        idx.push(o, o + 2, o + 1, o + 1, o + 2, o + 3);
        u += 1.3;
      }
      carry = u - len;
    }
    boundMesh.geometry.dispose();
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    boundMesh.geometry = g;
    // 이름표는 북서쪽(화면 왼쪽 위) 둘레에
    const at = pts[Math.round(pts.length * 0.61) % pts.length];
    boundLabelPos.set(at[0], 0.3, at[1]);
  }

  // ---------- 화면 이름표 ----------
  const tags = [];
  const addTag = (text, cls, getPos, getOpacity) => {
    const el = h('div', { class: `metro-tag ${cls}` }, text);
    stage.append(el);
    tags.push({ el, getPos, getOpacity });
  };
  const cbdTop = () => {
    let top = 0;
    for (let k = 0; k < cells.length; k++) if (cells[k].r < 1.6) top = Math.max(top, st.h[k]);
    return top;
  };
  addTag('도심(CBD)', 'metro-tag-cbd', () => new THREE.Vector3(0, cbdTop() + 0.8, 0), () => 1);
  for (const S of SATS) addTag(S.label, '', () => new THREE.Vector3(S.x, 3.2, S.z), (t) => satActive(S, t));
  addTag('대도시권(통근권)', 'metro-tag-bound', () => boundLabelPos, (t) => boundaryOpacity(t));
  const proj = new THREE.Vector3();
  function placeTags() {
    const w = stage.clientWidth, hh = stage.clientHeight;
    for (const tg of tags) {
      const op = tg.getOpacity(view.year);
      proj.copy(tg.getPos()).project(camera);
      const vis = op > 0.5 && proj.z < 1;
      tg.el.style.opacity = vis ? String(Math.min(1, op)) : '0';
      if (vis) tg.el.style.transform = `translate(${(proj.x * 0.5 + 0.5) * w}px, ${(-proj.y * 0.5 + 0.5) * hh}px) translate(-50%, -100%)`;
    }
  }

  // ---------- 카메라 맞춤 ----------
  let placed = false;
  function resize() {
    const w = stage.clientWidth, hh = stage.clientHeight;
    if (!w || !hh) return;
    renderer.setSize(w, hh, false);
    camera.aspect = w / hh;
    if (!placed) {
      // 무대가 좁을수록 멀리서 본다
      const dist = camera.aspect >= 1.2 ? 72 : 84;
      camera.position.set(0, dist * 0.78, dist * 0.62).add(controls.target);
      placed = true;
    }
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(stage);

  // ---------- 그래프 (csat-chart.js 꺾은선) ----------
  const CH_YEARS = [];
  for (let y = YEAR_MIN; y <= YEAR_MAX; y += 5) CH_YEARS.push(y);
  const chSeries = { core: [], sub: [] };
  {
    const tmp = makeState();
    for (const y of CH_YEARS) {
      computeState(y, tmp);
      let c = 0, s = 0;
      for (let k = 0; k < cells.length; k++) {
        const p = tmp.pop[k] * POP_SCALE;
        if (cells[k].r > SUBURB_R) s += p; else c += p;
      }
      chSeries.core.push(Math.round(c));
      chSeries.sub.push(Math.round(s));
    }
  }
  const chartCtx = chartCanvas.getContext('2d');
  const chartOpts = {
    ...createDefaultGraphOptions(),
    title: '중심 도시와 교외의 인구',
    fontFamily: 'sans',
    legendPosition: 'bottom',
    fontSize: { title: 42, axisLabel: 38, tick: 36, dataLabel: 38 },
    // 웹 글꼴을 내려받지 않으므로 보는 컴퓨터의 글꼴로 그린다
    fontStack: {
      serif: "'HY신명조', 'Noto Serif KR', Batang, '바탕', serif",
      sans: "'Noto Sans KR', 'Malgun Gothic', '맑은 고딕', 'Apple SD Gothic Neo', sans-serif",
    },
  };
  let chartIdx = -1;
  function updateChart() {
    const idx = Math.floor((view.year - YEAR_MIN) / 5 + 1e-6);
    if (idx === chartIdx) return;
    chartIdx = idx;
    const cut = (arr) => arr.map((v, i) => (i <= idx ? v : null));
    renderLineGraph(chartCtx, chartCanvas.width, chartCanvas.height, {
      series: [
        { label: '중심 도시', values: cut(chSeries.core), lineStyle: 'solid', marker: 'circle', stroke: '#1d2126' },
        { label: '교외', values: cut(chSeries.sub), lineStyle: 'dashed', marker: 'square', hollowMarker: true, stroke: '#1d2126' },
      ],
      xLabels: CH_YEARS.map((y) => (y % 20 === 0 ? String(y) : '')),
      xUnit: '(년)',
      yUnit: '(만 명)',
      yRange: { min: 0, max: 700, auto: false, step: 100 },
      labelPlacement: 'legend',
      showMarkers: true,
      xGrid: false,
    }, chartOpts);
  }

  // ---------- 숫자 ----------
  const fmtPop = (v) => (v >= 100 ? `${Math.round(v).toLocaleString('ko-KR')}만 명` : `${v.toFixed(1)}만 명`);
  const base1960Price = (() => { const tmp = makeState(); computeState(YEAR_MIN, tmp); return stats(YEAR_MIN, tmp).cbdPrice; })();
  const backState = makeState();
  const statsAt = (y) => { if (y < YEAR_MIN) return null; computeState(y, backState); return stats(y, backState); };
  function trend(el, now, before) {
    if (before == null) { el.textContent = ''; el.className = 'metro-trend'; return; }
    const d = now - before, eps = Math.max(0.05, before * 0.004);
    const up = d > eps, down = d < -eps;
    el.textContent = up ? '▲' : down ? '▼' : '';
    el.className = `metro-trend${up ? ' metro-up' : down ? ' metro-down' : ''}`;
  }
  let lastStage = -1;
  function updatePanel(s) {
    const y = Math.floor(view.year + 1e-6);
    const si = stageAt(view.year);
    const S = STAGES[si];
    yearOut.textContent = `${y}년`;
    hudYear.textContent = `${y}년`;
    hudStage.textContent = `${si + 1}단계 · ${S.name}`;
    if (si !== lastStage) {
      lastStage = si;
      stKicker.textContent = `${si + 1}단계 · ${S.from}~${S.to}년`;
      stName.textContent = S.name;
      stText.replaceChildren(...richText(S.text));
      stageBtns.forEach((b, i) => b.setAttribute('aria-pressed', String(i === si)));
    }
    sCbd.textContent = fmtPop(s.cbd);
    sSub.textContent = fmtPop(s.sub);
    sBuilt.textContent = `${s.builtPct.toFixed(1)}%`;
    sPrice.textContent = Math.round((s.cbdPrice / base1960Price) * 100).toLocaleString('ko-KR');
    sComm.textContent = s.commuters < 0.5 ? '거의 없음' : fmtPop(s.commuters);
    // 증감 화살표는 3년 전과 비교
    const back = statsAt(view.year - 3);
    trend(tCbd, s.cbd, back && back.cbd);
    trend(tSub, s.sub, back && back.sub);
    slider.value = String(view.year);
  }

  // ---------- 갱신 ----------
  function setYear(y) {
    view.year = clampYear(y);
    computeState(view.year, st);
    const s = stats(view.year, st);
    updateBlocks();
    updateLines(view.year);
    updateFlows(flows(view.year, st));
    updateBoundary(view.year);
    updatePanel(s);
    updateChart();
  }

  // ---------- 조작 ----------
  function drawPlay() { playBtn.replaceChildren(icon(view.playing ? 'pause' : 'play'), view.playing ? '멈춤' : '재생'); }
  function stop() { view.playing = false; drawPlay(); }
  playBtn.addEventListener('click', () => {
    if (!view.playing && view.year >= YEAR_MAX) setYear(YEAR_MIN);
    view.playing = !view.playing;
    drawPlay();
  });
  resetBtn.addEventListener('click', () => { stop(); setYear(YEAR_MIN); });
  slider.addEventListener('input', () => { stop(); setYear(Number(slider.value)); });

  syncLegend();
  drawPlay();
  resize();
  setYear(view.year);

  // ---------- 그리기 반복 ----------
  const clock = new THREE.Clock();
  const YEARS_PER_SEC = 2.4;
  function frame() {
    const dt = Math.min(0.1, clock.getDelta());
    if (view.playing) {
      const next = view.year + dt * YEARS_PER_SEC;
      setYear(next);
      if (next >= YEAR_MAX) stop();
    }
    controls.update();
    animateDots(clock.elapsedTime);
    renderer.render(scene, camera);
    placeTags();
    requestAnimationFrame(frame);
  }
  frame();
}
