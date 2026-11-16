// © 2026 김용현
// 우리 집 창은 어느 쪽? 남반구의 햇빛 (통합사회1 13쪽 ◎02 뉴질랜드 애로타운의 중국인 거주지 유적)
// 실제 지형(LINZ 8m DEM)과 OSM 건물·길·하천·숲 위에 오두막 모형을 놓고, 날짜·시각에 따른 해의 위치(NOAA 식)로
// 그림자와 하늘의 해 길을 그린다. 창 방향(북향/남향)에 따라 방 안 바닥에 드는 햇빛 자국과 하루 동안 해가 드는 시간을 보여 준다.
// 장면 좌표: x = 동쪽(m), y = 높이 - 오두막 자리 땅 높이(m), z = 남쪽(m). 원점 = 장면 가운데(중국인 거주지 부근).
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { createShell } from '../../src/shared/shell.js';
import { h, icon } from '../../src/shared/dom.js';
import { buildUI } from './ui.js';
import { TERRAIN, HORIZON, HORIZON_FAR } from './data/terrain-meta.js';
import { OSM } from './data/osm.js';
import { sunPosition, sunVector, localToUtc, dayToMonthDay, monthDayToDay } from './solar.js';
import { toLocal, horizonAt, windowState, sunHours } from './sunroom.js';
import { loadHeights, makeSampler, buildNearMesh, buildFarMesh } from './terrain.js';
import { buildBuildings, buildTrees } from './town.js';
import { buildHut } from './hut.js';
import './style.css'; // 선택자는 모두 .ds-sim 으로 시작

const YEAR = 2026;
const ARROW = { lat: TERRAIN.hut[0], lon: TERRAIN.hut[1], tz: 12, name: '애로타운' };
const CANTON = { lat: 23, lon: 113.2644, tz: 8, name: '광둥' };
const FACE_AZ = { north: 0, south: 180 };
const BASE = TERRAIN.hutGround;
const HUT_X = (TERRAIN.hut[1] - TERRAIN.center[1]) * TERRAIN.mPerDegLon;
const HUT_Z = -(TERRAIN.hut[0] - TERRAIN.center[0]) * TERRAIN.mPerDegLat;
const NEAR_HALF = TERRAIN.near.half;
const DIRS16 = ['북', '북북동', '북동', '동북동', '동', '동남동', '남동', '남남동', '남', '남남서', '남서', '서남서', '서', '서북서', '북서', '북북서'];
const VIEW = {
  village: { R: 230, minD: 60, maxD: 4500, fov: 45 },
  hut: { R: 7, minD: 3, maxD: 300, fov: 45 },
  room: { R: 7, minD: 0.15, maxD: 2.2, fov: 84 },
};

const fmtClock = (m) => { const r = Math.floor(m); return `${Math.floor(r / 60)}:${String(r % 60).padStart(2, '0')}`; };
const fmtDur = (m) => (m % 60 ? `${Math.floor(m / 60)}시간 ${m % 60}분` : `${m / 60}시간`);
const dirName = (az) => DIRS16[Math.round(az / 22.5) % 16];
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export default function mount(root) {
  const { stage, panel } = createShell(root, 't1-u1-sun-window');
  const ui = buildUI(stage, panel);

  const state = { day: 172, min: 720, face: 'north', home: false, view: 'hut', roof: true, playing: false };
  const q = new URLSearchParams(location.search);
  if (q.has('day')) state.day = THREE.MathUtils.clamp(Math.round(Number(q.get('day')) || 172), 1, 365);
  if (q.has('t')) state.min = THREE.MathUtils.clamp(Math.round(Number(q.get('t')) || 0), 0, 1435);
  if (q.get('face') === 'south') state.face = 'south';
  if (q.get('home') === '1') state.home = true;
  if (VIEW[q.get('view')]) state.view = q.get('view');
  if (q.get('roof') === '0') state.roof = false;

  // ---------- 렌더러·장면 ----------
  const renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.classList.add('ds-canvas');
  stage.prepend(renderer.domElement);

  const labelRenderer = new CSS2DRenderer();
  Object.assign(labelRenderer.domElement.style, { position: 'absolute', inset: '0', pointerEvents: 'none', zIndex: '1' });
  stage.append(labelRenderer.domElement);

  const scene = new THREE.Scene();
  const skyCol = new THREE.Color();
  scene.background = skyCol;
  scene.fog = new THREE.Fog(skyCol, 5000, 30000);
  const camera = new THREE.PerspectiveCamera(45, 1, 0.05, 60000);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.maxPolarAngle = Math.PI * 0.495;

  const hemi = new THREE.HemisphereLight(0xcfe3f5, 0x6b6450, 1);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff1d8, 2.4);
  sun.castShadow = true;
  const maxTex = renderer.capabilities.maxTextureSize;
  sun.shadow.mapSize.set(Math.min(4096, maxTex), Math.min(4096, maxTex));
  sun.shadow.camera.near = 10;
  sun.shadow.camera.far = 6000;
  scene.add(sun, sun.target);

  // ---------- 땅 높이(불러오기 전에는 평평) ----------
  let heightAt = () => 0;
  let hutFloor = 0.05;

  // ---------- 오두막 ----------
  const hut = buildHut();
  scene.add(hut.group);
  function placeHut() {
    let m = -Infinity;
    for (let a = 0; a < 16; a++) {
      for (const r of [0, 1.2, 2.6]) m = Math.max(m, heightAt(HUT_X + r * Math.cos(a * 0.39), HUT_Z + r * Math.sin(a * 0.39)));
    }
    hutFloor = m + 0.05;
    hut.group.position.set(HUT_X, hutFloor, HUT_Z);
    hut.group.rotation.y = Math.PI - FACE_AZ[state.face] * (Math.PI / 180);
    hut.group.updateMatrixWorld(true);
    sky.position.set(HUT_X, hutFloor, HUT_Z);
  }

  // ---------- 하늘: 해 길, 지형 가림 선, 동서남북, 해 ----------
  const sky = new THREE.Group();
  scene.add(sky);
  const unitDir = (alt, az) => {
    const v = sunVector(alt, az);
    return new THREE.Vector3(v.e, v.u, -v.n);
  };
  // 동서남북 둘레
  const ringPts = [];
  for (let a = 0; a <= 128; a++) ringPts.push(new THREE.Vector3(Math.cos((a / 128) * Math.PI * 2), 0.002, Math.sin((a / 128) * Math.PI * 2)));
  const ring = new THREE.Line(new THREE.BufferGeometry().setFromPoints(ringPts), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, depthTest: false }));
  ring.renderOrder = 5;
  sky.add(ring);
  const cross = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0.002, -1), new THREE.Vector3(0, 0.002, 1), new THREE.Vector3(-1, 0.002, 0), new THREE.Vector3(1, 0.002, 0),
  ]), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, depthTest: false }));
  cross.renderOrder = 5;
  sky.add(cross);
  // CSS2DRenderer 는 부모가 숨겨져도 이름표를 그리므로 이름표마다 따로 켜고 끈다
  const showLabels = (group, on) => group.traverse((o) => { if (o.isCSS2DObject) o.visible = on; });
  const label = (text, cls) => {
    const el = h('div', { class: `sw-l3d ${cls || ''}` }, text);
    return new CSS2DObject(el);
  };
  for (const [t, az] of [['북', 0], ['동', 90], ['남', 180], ['서', 270]]) {
    const o = label(t, t === '북' ? 'sw-l3d-n' : 'sw-l3d-dir');
    o.position.copy(unitDir(0, az).multiplyScalar(1.1));
    sky.add(o);
  }
  // 지형이 가리는 높이(오두막에서 본 지평선)
  const hzPts = HORIZON.filter((_, i) => i % 2 === 0).map((alt, i) => unitDir(Math.max(0, alt), i));
  hzPts.push(hzPts[0].clone());
  const horizonLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints(hzPts), new THREE.LineBasicMaterial({ color: 0x7a5a3a, transparent: true, opacity: 0.9 }));
  sky.add(horizonLine);
  // 해 길
  const pathMat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.95, depthTest: false });
  const path = new THREE.LineSegments(new THREE.BufferGeometry(), pathMat);
  path.renderOrder = 6;
  sky.add(path);
  const hourLabels = new THREE.Group();
  sky.add(hourLabels);
  // 해
  const sunBall = new THREE.Mesh(new THREE.SphereGeometry(0.05, 24, 16), new THREE.MeshBasicMaterial({ color: 0xffd23f, depthTest: false }));
  sunBall.renderOrder = 7;
  const sunTag = label('해', 'sw-l3d-sun');
  sunTag.position.set(0, 0.11, 0);
  sunBall.add(sunTag);
  sky.add(sunBall);
  const sunRay = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
    new THREE.LineDashedMaterial({ color: 0xffc533, dashSize: 0.03, gapSize: 0.02, depthTest: false, transparent: true, opacity: 0.8 }));
  sunRay.renderOrder = 6;
  sky.add(sunRay);

  // ---------- 장소 이름표(마을 전체 시점) ----------
  const placeLabels = new THREE.Group();
  scene.add(placeLabels);
  const hutTag = label('오두막 모형 (중국인 거주지)', 'sw-l3d-hut');
  scene.add(hutTag);

  // ---------- 지형·마을 불러오기 ----------
  placeHut();
  Promise.all([loadHeights(TERRAIN.near.file), loadHeights(TERRAIN.far.file)]).then(([near, far]) => {
    const aniso = renderer.capabilities.getMaxAnisotropy();
    if (!near) {
      ui.loading.textContent = '지형 자료를 불러오지 못해 평평한 땅으로 보여 줍니다.';
      ui.loading.classList.add('sw-loading-warn');
      near = { size: 64, data: new Float32Array(64 * 64).fill(BASE) };
    } else ui.loading.hidden = true;
    heightAt = makeSampler(near, NEAR_HALF, BASE);
    const ground = buildNearMesh(near, BASE, OSM, aniso);
    scene.add(ground);
    if (far) scene.add(buildFarMesh(far, NEAR_HALF, BASE));
    scene.add(buildBuildings(OSM, heightAt, [HUT_X, HUT_Z]));
    scene.add(buildTrees(OSM, heightAt, NEAR_HALF, [HUT_X, HUT_Z]));
    placeHut();
    addPlaceLabels();
    goView(state.view, false);
    update();
  });

  function addPlaceLabels() {
    placeLabels.clear();
    const at = (text, x, z, dy = 25) => {
      const o = label(text, 'sw-l3d-place');
      o.position.set(x, heightAt(x, z) + dy, z);
      placeLabels.add(o);
    };
    // 애로강: 장면 안에 있는 강 선의 가운데쯤
    const river = OSM.waterLines.filter((l) => l[0] === 0).flatMap((l) => {
      const pts = [];
      for (let i = 1; i < l.length; i += 2) if (Math.abs(l[i]) < NEAR_HALF * 0.8 && Math.abs(l[i + 1]) < NEAR_HALF * 0.8) pts.push([l[i], -l[i + 1]]);
      return pts;
    });
    if (river.length) {
      // 화면 안쪽에 오도록 오두막 북동쪽 300m 무렵에서 가장 가까운 강 점
      const [x, z] = river.reduce((a, b) => (Math.hypot(b[0] - HUT_X - 250, b[1] - HUT_Z + 200) < Math.hypot(a[0] - HUT_X - 250, a[1] - HUT_Z + 200) ? b : a));
      at('애로강 (Arrow River)', x, z);
    }
    // 부시 개울: 오두막에서 가장 가까운 개울 점에서 조금 떨어진 곳
    let best = null;
    for (const l of OSM.waterLines) if (l[0] === 1) {
      for (let i = 1; i < l.length; i += 2) {
        const x = l[i], z = -l[i + 1], d = Math.hypot(x - HUT_X + 160, z - HUT_Z);
        if (!best || d < best[2]) best = [x, z, d];
      }
    }
    if (best) at('부시 개울 (Bush Creek)', best[0], best[1], 18);
    at('애로타운 시가지', 420, 330, 30);
  }

  // ---------- 시점 ----------
  let tween = null;
  function hutLocalToWorld(x, y, z) {
    return new THREE.Vector3(x, y, z).applyMatrix4(hut.group.matrixWorld);
  }
  function viewPose(view) {
    const hp = new THREE.Vector3(HUT_X, hutFloor, HUT_Z);
    if (view === 'village') return { pos: hp.clone().add(new THREE.Vector3(420, 560, 900)), target: hp.clone().add(new THREE.Vector3(0, 40, -120)) };
    // 방 안: 창 맞은편 구석에 서서 창과 방바닥을 함께 본다
    if (view === 'room') return { pos: hutLocalToWorld(-1.55, 1.75, -1.25), target: hutLocalToWorld(0.7, 0.3, 0.1) };
    // 오두막: 창이 난 쪽 바깥 높은 곳에서 창과 방 안을 내려다본다
    return { pos: hutLocalToWorld(6, 13.5, 14.5), target: hutLocalToWorld(0, 0.2, -0.2) };
  }
  function goView(view, animate = true) {
    const { pos, target } = viewPose(view);
    const v = VIEW[view];
    controls.minDistance = v.minD;
    controls.maxDistance = v.maxD;
    sky.scale.setScalar(v.R);
    camera.fov = v.fov;
    camera.updateProjectionMatrix();
    hut.setBeamOpacity(view === 'room' ? 0.05 : 0.16);
    // 방 안에서는 하늘 선과 이름표가 벽을 뚫고 보이지 않게 깊이 검사를 켜고 이름표는 숨긴다
    for (const m of [ring.material, cross.material, pathMat, sunBall.material, sunRay.material]) { m.depthTest = view === 'room'; m.needsUpdate = true; }
    showLabels(sky, view !== 'room');
    if (!animate) {
      camera.position.copy(pos);
      controls.target.copy(target);
      tween = null;
      return;
    }
    controls.minDistance = 0.05;
    controls.maxDistance = 10000;
    tween = { t0: performance.now(), dur: 900, p0: camera.position.clone(), p1: pos, q0: controls.target.clone(), q1: target, v };
  }
  function stepTween(now) {
    if (!tween) return;
    const t = Math.min(1, (now - tween.t0) / tween.dur);
    const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    camera.position.lerpVectors(tween.p0, tween.p1, e);
    controls.target.lerpVectors(tween.q0, tween.q1, e);
    if (t >= 1) {
      controls.minDistance = tween.v.minD;
      controls.maxDistance = tween.v.maxD;
      tween = null;
    }
  }
  controls.addEventListener('start', () => { tween = null; });

  // ---------- 계산 ----------
  const place = () => (state.home ? CANTON : ARROW);
  let dayInfo = null;
  function recomputeDay() {
    const p = place();
    const faceAz = FACE_AZ[state.face];
    const res = sunHours({ year: YEAR, day: state.day, tz: p.tz, lat: p.lat, lon: p.lon, facingAz: faceAz, horizon: HORIZON });
    // 해 길(5분 간격): 지평선 위는 노란색, 산에 가린 부분은 회색
    const pos = [], col = [];
    const yellow = new THREE.Color(0xffc533), grey = new THREE.Color(0x8d8d8d);
    const dayRanges = [];
    let prev = null, dayStart = null;
    hourLabels.clear();
    for (let m = 0; m <= 1440; m += 5) {
      const s = sunPosition(localToUtc(YEAR, state.day, m, p.tz), p.lat, p.lon);
      const up = s.alt > 0;
      if (up && dayStart == null) dayStart = m;
      if (!up && dayStart != null) { dayRanges.push([dayStart, m]); dayStart = null; }
      const cur = { v: unitDir(s.alt, s.az), up, hidden: s.alt <= horizonAt(HORIZON, s.az) };
      if (prev && prev.up && up) {
        const c = cur.hidden || prev.hidden ? grey : yellow;
        pos.push(prev.v.x, prev.v.y, prev.v.z, cur.v.x, cur.v.y, cur.v.z);
        col.push(c.r, c.g, c.b, c.r, c.g, c.b);
      }
      if (m % 180 === 0 && m > 0 && m < 1440 && s.alt > 3) {
        const o = label(`${m / 60}시`, 'sw-l3d-hour');
        o.position.copy(cur.v.clone().multiplyScalar(1.07));
        hourLabels.add(o);
      }
      prev = cur;
    }
    if (dayStart != null) dayRanges.push([dayStart, 1440]);
    showLabels(hourLabels, state.view !== 'room');
    path.geometry.dispose();
    path.geometry = new THREE.BufferGeometry();
    path.geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    path.geometry.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    dayInfo = { ...res, dayRanges };

    ui.hoursBig.textContent = fmtDur(res.minutes);
    ui.hoursSpan.textContent = res.spans.length
      ? res.spans.map(([a, b]) => `${fmtClock(a)} ~ ${fmtClock(b)}`).join(', ')
      : '하루 내내 이 창으로는 해가 들지 않습니다';
    ui.hoursBig.classList.toggle('sw-zero', res.minutes === 0);
    drawDayBar();
    updateExplain();
  }

  function drawDayBar() {
    if (!dayInfo) return;
    const X = (m) => (m / 1440) * 240;
    const kids = [h('rect', { x: 0, y: 2, width: 240, height: 12, rx: 3, class: 'sw-db-night' })];
    for (const [a, b] of dayInfo.dayRanges) kids.push(h('rect', { x: X(a), y: 2, width: X(b) - X(a), height: 12, class: 'sw-db-day' }));
    for (const [a, b] of dayInfo.spans) kids.push(h('rect', { x: X(a), y: 2, width: Math.max(1, X(b) - X(a)), height: 12, class: 'sw-db-lit' }));
    for (const hr of [6, 12, 18]) {
      kids.push(h('line', { x1: X(hr * 60), y1: 14, x2: X(hr * 60), y2: 17, class: 'sw-db-tick' }));
      kids.push(h('text', { x: X(hr * 60), y: 25, 'text-anchor': 'middle', class: 'sw-db-text' }, `${hr}시`));
    }
    kids.push(h('line', { x1: X(state.min), y1: 0, x2: X(state.min), y2: 16, class: 'sw-db-now' }));
    ui.dayBar.replaceChildren(...kids);
  }

  function season(lat, month) {
    const northWinter = month === 12 || month <= 2, northSummer = month >= 6 && month <= 8;
    if (!northWinter && !northSummer) return month <= 5 ? (lat > 0 ? '봄' : '가을') : (lat > 0 ? '가을' : '봄');
    return (northWinter === (lat > 0)) ? '겨울' : '여름';
  }

  function updateExplain() {
    const { month } = dayToMonthDay(YEAR, state.day);
    const b = (t) => h('b', { class: 'sw-b' }, t);
    const lit = dayInfo && dayInfo.minutes > 0;
    let parts;
    if (!state.home) {
      parts = ['애로타운은 ', b('남반구'), '(남위 45°)라서 해가 ', b('북쪽 하늘'), '로 지나갑니다. '];
      if (state.face === 'north') parts.push(lit ? '그래서 북향 창으로 햇빛이 들어옵니다.' : '그래도 이날은 해가 너무 높거나 산에 가려 창으로 들지 않습니다.');
      else parts.push(lit ? '남향 창에는 이른 아침이나 저녁에만 잠깐 해가 듭니다.' : b('남향 창으로는 해가 들지 않습니다.'), ' 교과서 속 중국인 이주민의 집이 바로 이랬습니다.');
      parts.push(` 지금 애로타운은 ${season(-1, month)}입니다.`);
    } else {
      parts = ['광둥은 ', b('북반구'), '(북위 23°)라서 해가 대체로 ', b('남쪽 하늘'), '로 지나갑니다. 그래서 고향에서는 ',
        b('남향 창'), '이 햇빛을 받았습니다. ',
        `같은 ${month}월이라도 광둥은 ${season(1, month)}, 애로타운은 ${season(-1, month)}으로 계절이 반대입니다.`];
      if (month >= 5 && month <= 7) parts.push(' 이 무렵 광둥은 한낮의 해가 거의 머리 위에 있어 어느 창으로도 햇빛이 깊이 들지 않습니다.');
    }
    ui.explain.replaceChildren(...parts);
  }

  function update() {
    const p = place();
    const faceAz = FACE_AZ[state.face];
    const s = sunPosition(localToUtc(YEAR, state.day, state.min, p.tz), p.lat, p.lon);
    const dir = unitDir(s.alt, s.az);
    const ws = windowState(s, faceAz, HORIZON);

    // 하늘 밝기와 빛
    const dayK = smooth(-6, 12, s.alt);
    const farBlocked = s.alt <= horizonAt(HORIZON_FAR, s.az);
    const cNight = new THREE.Color(0x0e1a2b), cDay = new THREE.Color(0xa7cbe8), cDusk = new THREE.Color(0xe6a477);
    skyCol.copy(cNight).lerp(cDay, dayK).lerp(cDusk, Math.max(0, 1 - Math.abs(s.alt - 1) / 7) * 0.55);
    scene.fog.color.copy(skyCol);
    hemi.intensity = 0.25 + 1.0 * dayK;
    sun.intensity = s.alt > 0 && !farBlocked ? 2.6 * smooth(0, 8, s.alt) : 0;
    sun.visible = sun.intensity > 0;

    // 그림자 범위: 마을 전체는 1.7km, 오두막 둘레는 좁게(촘촘한 그림자)
    const wide = state.view === 'village';
    const cam = sun.shadow.camera;
    const half = wide ? 900 : 22;
    cam.left = -half; cam.right = half; cam.top = half; cam.bottom = -half;
    cam.updateProjectionMatrix();
    sun.shadow.bias = wide ? -0.0008 : -0.0004;
    sun.shadow.normalBias = wide ? 0.6 : 0.03;
    const tgt = wide ? new THREE.Vector3(0, 0, 0) : new THREE.Vector3(HUT_X, hutFloor, HUT_Z);
    sun.target.position.copy(tgt);
    sun.position.copy(tgt).addScaledVector(dir, 3000);
    sun.target.updateMatrixWorld();

    // 해 공과 해 길
    sunBall.visible = s.alt > -3;
    sunTag.visible = sunBall.visible && state.view !== 'room';
    sunBall.position.copy(dir);
    const rp = sunRay.geometry.attributes.position;
    rp.setXYZ(1, dir.x, dir.y, dir.z);
    rp.needsUpdate = true;
    sunRay.computeLineDistances();
    sunRay.visible = s.alt > 0 && state.view !== 'room';

    // 방 안 햇빛 자국
    const lit = hut.setSun(ws === 'lit' ? toLocal(sunVector(s.alt, s.az), faceAz) : null, dayK * (sun.visible ? 1 : 0.5));

    // 글
    const { month, day } = dayToMonthDay(YEAR, state.day);
    ui.dateOut.textContent = `${month}월 ${day}일`;
    ui.dateInput.value = String(state.day);
    ui.timeOut.textContent = fmtClock(state.min);
    ui.timeInput.value = String(state.min);
    ui.timeLabel.textContent = state.home ? '시각 (광둥 시각)' : '시각 (애로타운 시각)';
    ui.sunAlt.textContent = s.alt > 0 ? `${s.alt.toFixed(1)}°` : '지평선 아래';
    ui.sunDir.textContent = s.alt > -6 ? `${dirName(s.az)} (방위각 ${Math.round(s.az)}°)` : '-';
    const NOW = {
      lit: '지금 창으로 햇빛이 들어와 방바닥을 비춥니다.',
      wall: s.alt > 0 && Math.abs(((s.az - faceAz + 540) % 360) - 180) < 90 ? '해가 너무 높거나 옆에 있어 창으로 들지 않습니다.' : '해가 창 반대쪽 하늘에 있어 창으로 들지 않습니다.',
      terrain: '해가 산에 가려 오두막이 그늘에 들었습니다.',
      night: '해가 진 밤입니다.',
    };
    ui.nowText.textContent = NOW[ws];
    ui.nowText.classList.toggle('sw-now-lit', lit);
    ui.status.replaceChildren(
      h('b', {}, `${state.home ? '광둥의 해' : '애로타운의 해'}`),
      ` ${month}월 ${day}일 ${fmtClock(state.min)}, ${state.face === 'north' ? '북향' : '남향'} 창`);
    ui.homeBtn.setAttribute('aria-pressed', String(state.home));
    setPressed(ui.faceSeg, (b) => b.dataset.face === state.face);
    setPressed(ui.viewSeg, (b) => b.dataset.view === state.view);
    const presets = { jun: monthDayToDay(YEAR, 6, 21), dec: monthDayToDay(YEAR, 12, 22), equinox: monthDayToDay(YEAR, 3, 20) };
    setPressed(ui.dateSeg, (b) => presets[b.dataset.preset] === state.day);
    hut.setRoofOpen(state.roof && state.view !== 'room');
    showLabels(placeLabels, state.view === 'village');
    hutTag.visible = state.view === 'village';
    hutTag.position.set(HUT_X, hutFloor + 22, HUT_Z);
    drawDayBar();
  }
  function setPressed(segEl, fn) {
    for (const b of segEl.querySelectorAll('.ds-seg-btn')) b.setAttribute('aria-pressed', String(fn(b)));
  }

  // ---------- 조작 ----------
  const segBtn = (e) => e.target.closest('.ds-seg-btn');
  ui.dateInput.addEventListener('input', () => { state.day = Number(ui.dateInput.value); recomputeDay(); update(); });
  ui.dateSeg.addEventListener('click', (e) => {
    const b = segBtn(e);
    if (!b) return;
    state.day = { jun: monthDayToDay(YEAR, 6, 21), dec: monthDayToDay(YEAR, 12, 22), equinox: monthDayToDay(YEAR, 3, 20) }[b.dataset.preset];
    recomputeDay(); update();
  });
  ui.timeInput.addEventListener('input', () => { state.min = Number(ui.timeInput.value); update(); });
  ui.faceSeg.addEventListener('click', (e) => {
    const b = segBtn(e);
    if (!b) return;
    state.face = b.dataset.face;
    placeHut();
    recomputeDay(); update();
    if (state.view !== 'village') goView(state.view);
  });
  ui.homeBtn.addEventListener('click', () => {
    state.home = !state.home;
    recomputeDay(); update();
  });
  ui.viewSeg.addEventListener('click', (e) => {
    const b = segBtn(e);
    if (!b) return;
    state.view = b.dataset.view;
    goView(state.view);
    update();
  });
  ui.roofInput.checked = state.roof;
  ui.roofInput.addEventListener('change', () => { state.roof = ui.roofInput.checked; update(); });
  function setPlaying(on) {
    state.playing = on;
    ui.playBtn.replaceChildren(icon(on ? 'pause' : 'play'), on ? '멈춤' : '재생');
  }
  ui.playBtn.addEventListener('click', () => setPlaying(!state.playing));
  ui.timeInput.addEventListener('pointerdown', () => setPlaying(false));

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
  resize();
  placeHut();
  recomputeDay();
  goView(state.view, false);
  update();

  // 개발 미리보기 전용 진단 손잡이(조각 빌드에서는 DEV 가 false 로 접혀 없어짐)
  if (import.meta.env?.DEV) window.__sw = { scene, camera, renderer, hut, state, update };

  let last = performance.now();
  renderer.setAnimationLoop((now) => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (state.playing) {
      state.min = (state.min + dt * 50) % 1440; // 하루 = 약 29초
      update();
    }
    stepTween(now);
    controls.update();
    renderer.render(scene, camera);
    labelRenderer.render(scene, camera);
  });
}
