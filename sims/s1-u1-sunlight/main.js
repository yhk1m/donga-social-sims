// © 2026 김용현
// 위도별 태양 에너지 — 레이저 비유
// 굵기가 일정한 나란한 빛(레이저)을 지구의 여러 위도에 쏘아, 지표에 생기는 빛 자국의
// 넓이와 진하기(단위 면적당 에너지)가 위도에 따라 어떻게 달라지는지 3D로 보여 준다.
// 좌표: 지구 반지름 1, 중심 원점, 자전축 = +Y, 햇빛은 +X 쪽에서 -X 방향으로 나란히 들어온다(춘분·추분).
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { createShell } from '../../src/shared/shell.js';
import { h } from '../../src/shared/dom.js';
import { drawInset } from './inset.js';
import { buildUI } from './ui.js';
import './style.css'; // 선택자는 모두 .ds-sim 으로 시작

const BEAM_R = 0.12;              // 레이저 반지름(지구 반지름 = 1)
const LASER_X = 3.1;              // 레이저 출구 위치
const LASER_COLOR = new THREE.Color('#ffb020');
const COMPARE_LATS = [0, 30, 60];
const rad = THREE.MathUtils.degToRad;

export default function mount(root) {
  const { stage, panel } = createShell(root, 's1-u1-sunlight');
  const ui = buildUI(stage, panel);

  const state = { mode: 'single', lat: 0, view: 'free', inset: true };

  // ---------- 렌더러·장면 ----------
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.domElement.classList.add('ds-canvas');
  stage.prepend(renderer.domElement);

  const labelRenderer = new CSS2DRenderer();
  Object.assign(labelRenderer.domElement.style, { position: 'absolute', inset: '0', pointerEvents: 'none', zIndex: '1' });
  stage.append(labelRenderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.05, 100);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.minDistance = 1.4;
  controls.maxDistance = 14;

  scene.add(new THREE.HemisphereLight(0xdfe8f5, 0x223344, 1.4));
  const key = new THREE.DirectionalLight(0xffffff, 1.6);
  key.position.set(2, 4, 5);
  scene.add(key);

  // ---------- 지구: 경위선 + 레이저 빛 자국을 셰이더로 정확히 그린다 ----------
  // 지표의 한 점이 빛 줄기 안에 있는지 = 그 점을 햇빛 방향(X축)으로 내다봤을 때 (y, z)가 빛 줄기 단면 원 안에 드는지.
  // 그 점이 받는 단위 면적당 에너지 = 지표 법선 · 햇빛 방향 = cos(입사 각도) (람베르트 법칙).
  const beamUniform = Array.from({ length: 3 }, () => new THREE.Vector3(0, 0, 0)); // (중심 y, 중심 z, 켜짐)
  const earthMat = new THREE.ShaderMaterial({
    uniforms: {
      uBeams: { value: beamUniform },
      uBeamR: { value: BEAM_R },
      uLaser: { value: LASER_COLOR },
    },
    vertexShader: /* glsl */ `
      varying vec3 vP;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vP = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uBeams[3];
      uniform float uBeamR;
      uniform vec3 uLaser;
      varying vec3 vP;

      float gridLine(float v, float step, float w) {
        float d = abs(fract(v / step + 0.5) - 0.5) * step;
        float fw = fwidth(v) * w;
        return 1.0 - smoothstep(0.0, fw, d);
      }

      void main() {
        vec3 n = normalize(vP);
        float lat = degrees(asin(clamp(n.y, -1.0, 1.0)));
        float lon = degrees(atan(n.z, n.x));

        // 바탕: 바다색 + 시점 쪽 은은한 음영(햇빛과 헷갈리지 않도록 시점 기준)
        vec3 V = normalize(cameraPosition - vP);
        float shade = 0.55 + 0.45 * max(dot(n, V), 0.0);
        vec3 base = mix(vec3(0.16, 0.36, 0.55), vec3(0.22, 0.45, 0.62), smoothstep(-1.0, 1.0, n.y));
        vec3 col = base * shade;

        // 경위선 15도 간격, 경선은 극에서 흐리게
        float g = max(gridLine(lat, 15.0, 1.0), gridLine(lon, 15.0, 1.0) * smoothstep(0.08, 0.3, cos(radians(lat))));
        col = mix(col, vec3(0.75, 0.85, 0.95), g * 0.35);
        // 적도, 30도, 60도 위선 강조
        float eq = 1.0 - smoothstep(0.0, fwidth(lat) * 1.6, abs(lat));
        float l30 = 1.0 - smoothstep(0.0, fwidth(lat) * 1.3, abs(abs(lat) - 30.0));
        float l60 = 1.0 - smoothstep(0.0, fwidth(lat) * 1.3, abs(abs(lat) - 60.0));
        col = mix(col, vec3(1.0), eq * 0.85);
        col = mix(col, vec3(0.9, 0.95, 1.0), max(l30, l60) * 0.6);

        // 레이저 빛 자국
        for (int i = 0; i < 3; i++) {
          vec3 b = uBeams[i];
          if (b.z < 0.5 || vP.x <= 0.0) continue;
          float dist = length(vP.yz - b.xy);
          float inside = 1.0 - smoothstep(uBeamR - fwidth(dist), uBeamR, dist);
          float I = max(n.x, 0.0); // 단위 면적당 에너지(적도 정면 = 1)
          // 진하기는 단위 면적당 에너지에 비례: 적도 정면(I = 1)이 가장 진하고 비스듬할수록 연해진다
          col = mix(col, uLaser, inside * (0.06 + 0.94 * I));
          col += uLaser * inside * I * I * 0.4;
          // 빛 자국 테두리
          float rim = 1.0 - smoothstep(0.0, fwidth(dist) * 1.4, abs(dist - uBeamR));
          col = mix(col, vec3(1.0, 0.93, 0.75), rim * 0.9);
        }
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const earth = new THREE.Mesh(new THREE.SphereGeometry(1, 160, 120), earthMat);
  scene.add(earth);

  // 자전축
  const axis = new THREE.Mesh(
    new THREE.CylinderGeometry(0.008, 0.008, 2.5, 8),
    new THREE.MeshBasicMaterial({ color: 0x9fb3c8 }),
  );
  scene.add(axis);

  // ---------- 레이저(빛 줄기) ----------
  const beamMat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: LASER_COLOR }, uAlpha: { value: 0.26 } },
    vertexShader: /* glsl */ `
      varying vec3 vP;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vP = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uAlpha;
      varying vec3 vP;
      void main() {
        // 지구에 가로막힌 뒤쪽(그림자 속)은 그리지 않음: 빛은 +X에서 들어와 지표에서 멈춘다
        float rr = dot(vP.yz, vP.yz);
        if (rr < 1.0 && vP.x < sqrt(1.0 - rr)) discard;
        float a = uAlpha * smoothstep(-3.5, -0.6, vP.x); // 지구를 스쳐 지난 빛은 멀어지며 사라짐
        gl_FragColor = vec4(uColor, a);
      }`,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });

  const BEAM_X0 = -3.6;
  const beamGeo = new THREE.CylinderGeometry(BEAM_R, BEAM_R, LASER_X - BEAM_X0, 48, 1, true);
  beamGeo.rotateZ(Math.PI / 2);
  beamGeo.translate((LASER_X + BEAM_X0) / 2, 0, 0);

  const deviceMat = new THREE.MeshStandardMaterial({ color: 0x4a5563, metalness: 0.5, roughness: 0.45 });
  const apertureMat = new THREE.MeshBasicMaterial({ color: LASER_COLOR });
  const RAY_OFFSETS = [[0, 0]];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    RAY_OFFSETS.push([Math.cos(a) * BEAM_R * 0.92, Math.sin(a) * BEAM_R * 0.92]);
  }

  function makeLaser() {
    const g = new THREE.Group();
    const beam = new THREE.Mesh(beamGeo, beamMat);
    beam.renderOrder = 2;
    g.add(beam);

    const device = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.17, 0.5, 32), deviceMat);
    body.rotation.z = Math.PI / 2;
    body.position.x = LASER_X + 0.26;
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(BEAM_R * 1.05, BEAM_R * 1.05, 0.02, 32), apertureMat);
    ring.rotation.z = Math.PI / 2;
    ring.position.x = LASER_X + 0.01;
    device.add(body, ring);
    g.add(device);

    const rayGeo = new THREE.BufferGeometry();
    rayGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(RAY_OFFSETS.length * 6), 3));
    const rays = new THREE.LineSegments(
      rayGeo,
      new THREE.LineBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.75 }),
    );
    g.add(rays);

    const tag = document.createElement('div');
    tag.className = 'sun-label3d sun-label3d-laser';
    tag.textContent = '레이저(햇빛 한 줄기)';
    const label = new CSS2DObject(tag);
    label.position.set(LASER_X + 0.26, 0.3, 0);
    g.add(label);

    scene.add(g);
    return { group: g, beam, device, rays, label };
  }
  const lasers = [makeLaser(), makeLaser(), makeLaser()];

  function setLaser(l, lat) {
    const cy = Math.sin(rad(lat));
    l.group.position.y = cy;
    // 나란한 빛살: 지구에 닿으면 그 지점에서 멈추고, 스쳐 지나면 계속 간다
    const pos = l.rays.geometry.attributes.position;
    RAY_OFFSETS.forEach(([dy, dz], i) => {
      const y = cy + dy, z = dz;
      const rr = y * y + z * z;
      const xEnd = rr < 1 ? Math.sqrt(1 - rr) : BEAM_X0 + 0.6;
      pos.setXYZ(i * 2, LASER_X, dy, dz);
      pos.setXYZ(i * 2 + 1, xEnd, dy, dz);
    });
    pos.needsUpdate = true;
    l.rays.geometry.computeBoundingSphere();
  }

  // ---------- 위도 이름표 ----------
  const latLabels = [
    [0, '저위도 0°'], [30, '중위도 30°'], [60, '고위도 60°'],
  ].map(([lat, text]) => {
    const el = document.createElement('div');
    el.className = 'sun-label3d';
    el.textContent = text;
    const o = new CSS2DObject(el);
    // 레이저가 오는 쪽에서 비스듬히 앞(+Z)으로 돌아간 경도에 둔다
    const lon = rad(100);
    const r = 1.0;
    o.position.set(Math.cos(rad(lat)) * Math.cos(lon) * r, Math.sin(rad(lat)) * r, Math.cos(rad(lat)) * Math.sin(lon) * r);
    o.center.set(0.5, 0.5);
    scene.add(o);
    return o;
  });
  const tmpV = new THREE.Vector3();
  function updateLabelVisibility() {
    for (const o of latLabels) {
      tmpV.copy(camera.position).sub(o.position);
      const facing = o.position.clone().normalize().dot(tmpV.normalize());
      o.element.style.opacity = facing > 0.05 ? '1' : '0';
    }
  }

  // ---------- 카메라 시점 ----------
  let tween = null;
  function targetLat() {
    return state.mode === 'compare' ? 30 : state.lat;
  }
  function viewPose(view) {
    const aspect = camera.aspect;
    const far = Math.max(1, 1.25 / Math.max(aspect, 0.45)); // 화면이 좁을수록 뒤로 물러남
    if (view === 'laser') {
      const y = state.mode === 'compare' ? 0.45 : Math.sin(rad(state.lat));
      const d = state.mode === 'compare' ? 8.5 * Math.max(far, 1) : 7.5;
      return { pos: new THREE.Vector3(d, y, 0), target: new THREE.Vector3(0, y, 0) };
    }
    if (view === 'ground') {
      const lat = Math.min(targetLat(), 87); // 극 바로 위는 카메라 방향이 정해지지 않으므로 살짝 비킨다
      const n = new THREE.Vector3(Math.cos(rad(lat)), Math.sin(rad(lat)), 0);
      const d = state.mode === 'compare' ? 2.6 * far : 1.7 * far;
      return { pos: n.clone().multiplyScalar(1 + d), target: n.clone() };
    }
    return { pos: new THREE.Vector3(1.3, 0.35, 0).add(new THREE.Vector3(3.7, 1.7, 4.4).multiplyScalar(far)), target: new THREE.Vector3(1.3, 0.35, 0) };
  }
  function goView(view, animate = true) {
    const { pos, target } = viewPose(view);
    if (!animate) {
      camera.position.copy(pos);
      controls.target.copy(target);
      tween = null;
      return;
    }
    tween = {
      t0: performance.now(), dur: 700,
      p0: camera.position.clone(), p1: pos,
      q0: controls.target.clone(), q1: target,
    };
  }
  function stepTween(now) {
    if (!tween) return;
    const t = Math.min(1, (now - tween.t0) / tween.dur);
    const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    camera.position.lerpVectors(tween.p0, tween.p1, e);
    controls.target.lerpVectors(tween.q0, tween.q1, e);
    if (t >= 1) tween = null;
  }
  controls.addEventListener('start', () => {
    tween = null;
    if (state.view !== 'free') setView('free', false);
  });

  // ---------- UI ----------
  const { latInput } = ui;
  const strong = (t) => h('b', { class: 'sun-b' }, t);

  function fmtArea(lat) {
    const c = Math.cos(rad(lat));
    if (c < 1e-6) return '끝없이 커짐';
    const v = 1 / c;
    return `${v < 10 ? v.toFixed(2) : v.toFixed(1)}배`;
  }
  function fmtEnergy(lat) {
    const c = Math.cos(rad(lat));
    return `${c < 1e-6 ? 0 : Math.round(c * 100)}%`;
  }

  function drawFootprint(lat) {
    // 지표 위에서 내려다본 빛 자국: 남북으로 d / cos(위도) 만큼 늘어난 타원 (사각 틀 밖은 잘림)
    const c = Math.cos(rad(lat));
    const r0 = 16;
    const ry = c < 1e-3 ? 400 : Math.min(r0 / c, 400);
    ui.fpSvg.replaceChildren(
      h('line', { x1: 60, y1: 4, x2: 60, y2: 116, stroke: '#6f8fb0', 'stroke-width': 0.8, 'stroke-dasharray': '2 3' }),
      h('text', { x: 64, y: 12, 'font-size': 9, fill: '#c6d6e6' }, '북'),
      h('ellipse', {
        cx: 60, cy: 60, rx: r0, ry: ry.toFixed(1), fill: '#ffb020', 'fill-opacity': (0.08 + 0.92 * c).toFixed(2),
        stroke: '#ffe7b8', 'stroke-width': 1.2,
      }),
      h('circle', { cx: 60, cy: 60, r: r0, fill: 'none', stroke: '#ffffff', 'stroke-width': 1, 'stroke-dasharray': '3 2.5' }),
    );
  }

  function updateExplain() {
    let parts;
    const lat = state.lat;
    if (state.mode === 'compare') {
      parts = ['세 레이저는 굵기와 에너지가 모두 같습니다. 하지만 ', strong('위도가 높을수록'), ' 빛이 비스듬히 닿아 같은 에너지가 ',
        strong('더 넓은 면적'), '에 퍼지고, 그만큼 빛 자국이 ', strong('연해집니다'), '.'];
    } else if (lat === 0) {
      parts = ['적도에서는 빛이 지표에 ', strong('수직'), '으로 닿습니다. 빛 자국이 가장 ', strong('작고 진해'), ' 단위 면적당 에너지가 가장 많습니다.'];
    } else if (lat >= 90) {
      parts = ['극에서는 빛이 지표를 ', strong('스치듯'), ' 지나가, 단위 면적당 에너지가 거의 없습니다.'];
    } else {
      parts = [`위도 ${lat}°에서는 빛이 ${90 - lat}°로 비스듬히 닿아, 같은 에너지가 적도보다 `, strong(fmtArea(lat)),
        ' 넓게 퍼집니다. 그래서 같은 넓이가 받는 에너지는 ', strong(fmtEnergy(lat)), '로 줄어듭니다.'];
    }
    ui.explain.replaceChildren(...parts);
  }

  function setPressed(segEl, fn) {
    for (const b of segEl.querySelectorAll('.ds-seg-btn')) b.setAttribute('aria-pressed', String(fn(b)));
  }

  function update() {
    const lats = state.mode === 'compare' ? COMPARE_LATS : [state.lat];
    // 레이저 시점·지표 위에서는 빛 줄기가 빛 자국 앞을 가려 진하기를 왜곡하므로 줄기는 숨긴다
    const showBeam = state.view === 'free';
    lasers.forEach((l, i) => {
      const on = i < lats.length;
      l.group.visible = on;
      beamUniform[i].set(on ? Math.sin(rad(lats[i])) : 0, 0, on ? 1 : 0);
      if (on) setLaser(l, lats[i]);
      l.label.visible = on && i === 0 && state.view !== 'laser'; // 이름표는 하나만
      l.device.visible = on && state.view !== 'laser';
      l.beam.visible = showBeam;
      l.rays.visible = showBeam;
    });

    const compare = state.mode === 'compare';
    ui.latOut.textContent = `${state.lat}°`;
    latInput.value = String(state.lat);
    latInput.disabled = compare;
    for (const b of ui.quickSeg.querySelectorAll('.ds-seg-btn')) b.disabled = compare;
    setPressed(ui.quickSeg, (b) => !compare && Number(b.dataset.lat) === state.lat);
    setPressed(ui.modeSeg, (b) => b.dataset.mode === state.mode);
    setPressed(ui.viewSeg, (b) => b.dataset.view === state.view);

    ui.singleStats.hidden = compare;
    ui.compareStats.hidden = !compare;
    if (!compare) {
      const lat = state.lat;
      ui.sLat.textContent = `${lat}°`;
      ui.sAlt.textContent = `${90 - lat}°`;
      ui.sArea.textContent = fmtArea(lat);
      ui.sEnergy.textContent = fmtEnergy(lat);
      ui.sBar.style.width = `${Math.max(0, Math.cos(rad(lat))) * 100}%`;
      drawFootprint(lat);
    } else {
      const names = ['저위도', '중위도', '고위도'];
      const td = (t) => h('td', { class: 'sun-cmp-td' }, t);
      ui.cmpBody.replaceChildren(...COMPARE_LATS.map((lat, i) =>
        h('tr', {}, td(`${names[i]} ${lat}°`), td(`${90 - lat}°`), td(fmtArea(lat)), td(fmtEnergy(lat)))));
    }
    updateExplain();
    drawInset(ui.insetSvg, lats, BEAM_R, !compare);
  }

  function setView(view, move = true) {
    state.view = view;
    if (move) goView(view);
    update();
  }

  function setInset(show) {
    state.inset = show;
    ui.inset.hidden = !show;
    ui.insetBtn.setAttribute('aria-pressed', String(show));
    ui.insetBtn.textContent = show ? '옆에서 본 단면 그림 숨기기' : '옆에서 본 단면 그림 보기';
  }

  const clickedSegBtn = (e) => {
    const b = e.target.closest('.ds-seg-btn');
    return b && !b.disabled ? b : null;
  };
  latInput.addEventListener('input', () => {
    state.lat = Number(latInput.value);
    update();
    if (state.view !== 'free') goView(state.view, false);
  });
  ui.quickSeg.addEventListener('click', (e) => {
    const b = clickedSegBtn(e);
    if (!b) return;
    state.lat = Number(b.dataset.lat);
    update();
    if (state.view !== 'free') goView(state.view);
  });
  ui.modeSeg.addEventListener('click', (e) => {
    const b = clickedSegBtn(e);
    if (!b) return;
    state.mode = b.dataset.mode;
    update();
    goView(state.view);
  });
  ui.viewSeg.addEventListener('click', (e) => {
    const b = clickedSegBtn(e);
    if (b) setView(b.dataset.view);
  });
  ui.insetBtn.addEventListener('click', () => setInset(!state.inset));

  // ---------- 크기·루프 ----------
  function resize() {
    const w = stage.clientWidth, hgt = stage.clientHeight;
    if (!w || !hgt) return;
    renderer.setSize(w, hgt, false);
    labelRenderer.setSize(w, hgt);
    camera.aspect = w / hgt;
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(stage);

  // 주소로 처음 상태 지정(수업 자료 링크용): ?lat=30&mode=compare&view=laser&inset=0
  const q = new URLSearchParams(location.search);
  if (q.has('lat')) state.lat = THREE.MathUtils.clamp(Math.round(Number(q.get('lat')) || 0), 0, 90);
  if (q.get('mode') === 'compare') state.mode = 'compare';
  // 좁은 무대에서는 단면 그림이 지구를 가리므로 처음에는 접어 둔다
  setInset(!(q.get('inset') === '0' || (q.get('inset') !== '1' && stage.clientWidth < 520)));
  resize();
  setView(['laser', 'ground'].includes(q.get('view')) ? q.get('view') : 'free', false);
  goView(state.view, false);

  renderer.setAnimationLoop((now) => {
    stepTween(now);
    controls.update();
    updateLabelVisibility();
    renderer.render(scene, camera);
    labelRenderer.render(scene, camera);
  });
}
