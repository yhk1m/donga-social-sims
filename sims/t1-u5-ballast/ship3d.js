// © 2026 김용현
// 3D 선박 단면: 배를 한가운데에서 가로로 잘라 평형수 탱크·화물칸·바닷속 생물을 보여 준다.
// 좌표: x = 배 길이(뱃머리 +x), y = 위, z = 배 폭. 배와 바다는 x = 0 에서 잘려 있다.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const D = 2.6;          // 선체 깊이
const HALF_B = 2.2;     // 선체 반폭
const TANK_TOP = 2.1;   // 옆 탱크 천장
const TANK_BOT = 0.07;  // 바닥 탱크 바닥
const HOLD_X0 = -5.5;   // 화물칸 뒤쪽 끝
const STERN_X = -7;

// 평형수 탱크(이중 바닥 + 양옆 이중 선체가 이어진 U 자 공간)
const TANK = [
  [-1.62, TANK_TOP], [-1.62, 0.43], [1.62, 0.43], [1.62, TANK_TOP], [2.13, TANK_TOP], [2.13, 0.38],
  [1.82, TANK_BOT], [-1.82, TANK_BOT], [-2.13, 0.38], [-2.13, TANK_TOP],
];

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const smooth = (a, b, v) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

// y <= level 쪽만 남기는 다각형 자르기
function clipBelow(poly, level) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const ain = a[1] <= level, bin = b[1] <= level;
    if (ain) out.push(a);
    if (ain !== bin) {
      const t = (level - a[1]) / (b[1] - a[1]);
      out.push([a[0] + (b[0] - a[0]) * t, level]);
    }
  }
  return out;
}

function shapeOf(poly) {
  const s = new THREE.Shape();
  poly.forEach(([z, y], i) => (i ? s.lineTo(z, y) : s.moveTo(z, y)));
  s.closePath();
  return s;
}

// 단면 모양을 x 축 방향으로 밀어 낸다 (x0 → x1)
function extrudeX(shape, x0, x1, opts = {}) {
  const g = new THREE.ExtrudeGeometry(shape, { depth: x1 - x0, bevelEnabled: false, ...opts });
  // 모양 좌표 (sx, sy, sz) → 월드 (x = x0 + sz, y = sy, z = -sx) : 대칭이므로 z 부호는 상관없다
  g.applyMatrix4(new THREE.Matrix4().set(0, 0, 1, x0, 0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 0, 1));
  return g;
}

function hullGeometry() {
  // 구멍 있는 모양은 삼각분할이 깨지므로, 철판을 구멍 없는 조각 4개로 나눠 만든다
  const right = [[2.13, 0.38], [HALF_B, 0.35], [HALF_B, 1.15], [HALF_B, D], [1.55, D], [1.55, TANK_TOP], [2.13, TANK_TOP]];
  const pieces = [
    [[-HALF_B, 0.35], [-1.85, 0], [1.85, 0], [HALF_B, 0.35], [2.13, 0.38], [1.82, TANK_BOT], [-1.82, TANK_BOT], [-2.13, 0.38]], // 바깥 바닥
    right,
    right.map(([z, y]) => [-z, y]).reverse(),
    [[-1.55, TANK_TOP], [-1.55, 0.5], [1.55, 0.5], [1.55, TANK_TOP], [1.62, TANK_TOP], [1.62, 0.43], [-1.62, 0.43], [-1.62, TANK_TOP]], // 안쪽 선체
  ];
  const g = mergeGeometries(pieces.map((pc) => extrudeX(shapeOf(pc), STERN_X, 0)));
  // 면마다 색: 자른 면 / 선체 바깥(위 남색, 아래 적색) / 갑판 / 화물칸 / 탱크 안쪽
  const pos = g.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const C = {
    cut: new THREE.Color('#4b5665'), top: new THREE.Color('#26374d'), bottom: new THREE.Color('#a8443a'),
    deck: new THREE.Color('#6f7f74'), hold: new THREE.Color('#c9c2b3'), tank: new THREE.Color('#8f9ba8'),
  };
  const v = new THREE.Vector3(), w = new THREE.Vector3(), u = new THREE.Vector3();
  for (let i = 0; i < pos.count; i += 3) {
    v.fromBufferAttribute(pos, i); w.fromBufferAttribute(pos, i + 1); u.fromBufferAttribute(pos, i + 2);
    const cy = (v.y + w.y + u.y) / 3, az = Math.abs((v.z + w.z + u.z) / 3);
    const flatX = Math.abs(v.x - w.x) < 1e-4 && Math.abs(v.x - u.x) < 1e-4;
    let c;
    if (flatX) c = C.cut;
    else if (az > 2.18 || cy < 0.02 || (az > 1.84 && cy < 0.36 && az - cy > 1.8)) c = cy < 1.15 ? C.bottom : C.top;
    else if (cy > D - 0.01) c = C.deck;
    else if ((az > 1.53 && az < 1.57 && cy > 0.5) || (Math.abs(cy - 0.5) < 0.01 && az < 1.55)) c = C.hold;
    else c = C.tank;
    for (let k = 0; k < 3; k++) col.set([c.r, c.g, c.b], (i + k) * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

// 잘려 나간 뱃머리의 갑판 윤곽(점선)
function bowOutline() {
  const pts = [];
  const len = 5.5;
  for (let k = 0; k <= 24; k++) {
    const side = k <= 12 ? 1 : -1;
    const t = side > 0 ? k / 12 : (24 - k) / 12;
    pts.push(new THREE.Vector3(t * len, D + 0.25 * t * t, side * HALF_B * (1 - 0.92 * Math.pow(t, 1.8))));
  }
  return new THREE.BufferGeometry().setFromPoints(pts);
}

function waveTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const x = c.getContext('2d');
  x.fillStyle = '#ffffff';
  x.fillRect(0, 0, 256, 256);
  x.strokeStyle = 'rgba(30,70,110,.18)';
  x.lineWidth = 2;
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 70; i++) {
    const cx = rnd() * 256, cy = rnd() * 256, r = 10 + rnd() * 22;
    x.beginPath();
    x.arc(cx, cy, r, Math.PI * 1.15, Math.PI * 1.85);
    x.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(9, 7);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const SEA_TINT = { origin: new THREE.Color('#3f86a8'), ocean: new THREE.Color('#2a5f8f'), arrive: new THREE.Color('#3f8f8a') };

export function createShipScene(host, labelHost, opts = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.localClippingEnabled = true;
  renderer.domElement.classList.add('ds-canvas', 'bw-canvas3d');
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#e6edf2');
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 200);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.enablePan = false;
  controls.minDistance = 8;
  controls.maxDistance = 40;
  controls.maxPolarAngle = Math.PI * 0.49;
  controls.minAzimuthAngle = -0.15;
  controls.maxAzimuthAngle = Math.PI * 0.62;
  const target = new THREE.Vector3(-2.4, 1.25, 0.3);
  controls.target.copy(target);

  scene.add(new THREE.HemisphereLight(0xffffff, 0x7a8a99, 1.25));
  const sun = new THREE.DirectionalLight(0xffffff, 1.7);
  sun.position.set(8, 12, 9);
  scene.add(sun);

  const cutPlane = new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0.03); // x <= 0.03 만 그림

  // ---------- 배 ----------
  const pivot = new THREE.Group(); // 수면 높이에서 좌우로 기울어짐
  scene.add(pivot);
  const ship = new THREE.Group();
  pivot.add(ship);

  const hull = new THREE.Mesh(hullGeometry(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0.05 }));
  ship.add(hull);
  // 화물칸 뒤 칸막이
  const bulk = new THREE.Mesh(new THREE.BoxGeometry(0.08, D - 0.5, 3.1), new THREE.MeshStandardMaterial({ color: '#b9b2a3' }));
  bulk.position.set(HOLD_X0, 0.5 + (D - 0.5) / 2, 0);
  ship.add(bulk);
  // 선실(뒤쪽)
  const white = new THREE.MeshStandardMaterial({ color: '#eceef1', roughness: 0.8 });
  const dark = new THREE.MeshStandardMaterial({ color: '#2b3440' });
  const house = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.9, 3.6), white);
  house.position.set(-6.25, D + 0.95, 0);
  ship.add(house);
  const bridge = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.42, 4.4), white);
  bridge.position.set(-6.0, D + 2.1, 0);
  ship.add(bridge);
  for (const [y, w] of [[D + 2.13, 4.42], [D + 1.45, 3.62], [D + 0.95, 3.62], [D + 0.45, 3.62]]) {
    const win = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.14, w - 0.3), dark);
    win.position.set(w > 4 ? -5.449 : -5.549, y, 0);
    ship.add(win);
  }
  const funnel = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.9, 0.7), new THREE.MeshStandardMaterial({ color: '#2b3440' }));
  funnel.position.set(-6.65, D + 2.55, 0);
  ship.add(funnel);
  const band = new THREE.Mesh(new THREE.BoxGeometry(0.57, 0.18, 0.72), new THREE.MeshStandardMaterial({ color: '#c8553d' }));
  band.position.set(-6.65, D + 2.75, 0);
  ship.add(band);
  // 프로펠러·방향타
  const prop = new THREE.Group();
  const bladeM = new THREE.MeshStandardMaterial({ color: '#b08d3c', metalness: 0.5, roughness: 0.4 });
  for (let i = 0; i < 4; i++) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.62, 0.16), bladeM);
    b.rotation.x = (i * Math.PI) / 2;
    b.position.set(0, 0, 0);
    b.geometry.translate(0, 0.31, 0);
    prop.add(b);
  }
  prop.position.set(STERN_X - 0.25, 0.55, 0);
  ship.add(prop);
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.3), bladeM);
  shaft.rotation.z = Math.PI / 2;
  shaft.position.set(STERN_X - 0.12, 0.55, 0);
  ship.add(shaft);
  const rudder = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.1, 0.06), new THREE.MeshStandardMaterial({ color: '#a8443a' }));
  rudder.position.set(STERN_X - 0.65, 0.75, 0);
  ship.add(rudder);

  // 잘려 나간 뱃머리 (유령)
  // 뱃머리는 갑판 윤곽선만 옅게 (단면을 가리지 않도록)
  const bowLine = new THREE.Line(bowOutline(), new THREE.LineDashedMaterial({ color: '#5a6b80', dashSize: 0.18, gapSize: 0.12, transparent: true, opacity: 0.6 }));
  bowLine.computeLineDistances();
  ship.add(bowLine);

  // 평형수 (수위에 따라 모양을 다시 만든다)
  const waterMat = new THREE.MeshStandardMaterial({ color: '#2f7fc1', transparent: true, opacity: 0.5, roughness: 0.2, depthWrite: false });
  const ballastMesh = new THREE.Mesh(new THREE.BufferGeometry(), waterMat);
  ballastMesh.renderOrder = 2;
  ship.add(ballastMesh);
  let lastLevel = -1;
  function setBallastLevel(level) {
    if (Math.abs(level - lastLevel) < 0.004) return;
    lastLevel = level;
    ballastMesh.geometry.dispose();
    if (level <= TANK_BOT + 0.01) { ballastMesh.geometry = new THREE.BufferGeometry(); return; }
    const poly = clipBelow(TANK, level);
    ballastMesh.geometry = extrudeX(shapeOf(poly), STERN_X + 0.05, -0.012);
  }

  // 처리 장치 (양쪽 배출구 안쪽)
  const unitMat = new THREE.MeshStandardMaterial({ color: '#16a3a3', emissive: '#0c6f6f', emissiveIntensity: 0.6 });
  const units = [-1, 1].map((s) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.26, 0.24), unitMat);
    m.position.set(-0.45, 0.22, s * 1.95);
    ship.add(m);
    return m;
  });

  // 화물(컨테이너) — 위층부터 내리고, 아래층부터 싣는다
  const boxes = [];
  const palette = ['#c0573e', '#2f6f9f', '#d9a441', '#4f7f52', '#8a8f99', '#a24b6b', '#3b8a8a'];
  const boxGeo = new THREE.BoxGeometry(1.24, 0.46, 0.7);
  const boxEdge = new THREE.EdgesGeometry(boxGeo);
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let tier = 0; tier < 5; tier++) {
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 4; col++) {
        const mat = new THREE.MeshStandardMaterial({ color: palette[Math.floor(rnd() * palette.length)], roughness: 0.85, transparent: true });
        const m = new THREE.Mesh(boxGeo, mat);
        m.add(new THREE.LineSegments(boxEdge, new THREE.LineBasicMaterial({ color: '#1d2126', transparent: true, opacity: 0.35 })));
        const base = new THREE.Vector3(-0.76 - row * 1.3, 0.53 + 0.23 + tier * 0.48, -1.17 + col * 0.78);
        m.position.copy(base);
        m.userData.base = base;
        ship.add(m);
        boxes.push(m);
      }
    }
  }
  // boxes 순서: 아래층 → 위층. 화물량 c 이면 앞쪽 c*N 개가 실려 있다.

  // ---------- 바다 ----------
  const seaGroup = new THREE.Group();
  scene.add(seaGroup);
  const waveTex = waveTexture();
  const surfShape = shapeOf([[-40, -30], [0.03, -30], [0.03, 30], [-40, 30]].map(([x, z]) => [x, z]));
  surfShape.holes.push(new THREE.Path([[-7.45, -2.12], [-7.45, 2.12], [0.03, 2.12], [0.03, -2.12]].map(([x, z]) => new THREE.Vector2(x, z))));
  const surfGeo = new THREE.ShapeGeometry(surfShape);
  surfGeo.rotateX(Math.PI / 2); // (x, z) 평면을 수평으로: shape y → world z
  const uv = surfGeo.attributes.uv;
  const sp = surfGeo.attributes.position;
  for (let i = 0; i < sp.count; i++) uv.setXY(i, (sp.getX(i) + 40) / 40, (sp.getZ(i) + 30) / 60);
  const surfMat = new THREE.MeshStandardMaterial({ color: SEA_TINT.origin.clone(), map: waveTex, transparent: true, opacity: 0.62, roughness: 0.35, side: THREE.DoubleSide, depthWrite: false });
  const surface = new THREE.Mesh(surfGeo, surfMat);
  surface.renderOrder = 3;
  seaGroup.add(surface);

  // 바다 단면(앞면) — 위에서 아래로 짙어지는 색
  const faceGeo = new THREE.PlaneGeometry(60, 7, 1, 8);
  faceGeo.rotateY(Math.PI / 2);
  faceGeo.translate(0.03, -3.5, 0);
  const faceCol = new Float32Array(faceGeo.attributes.position.count * 3);
  for (let i = 0; i < faceGeo.attributes.position.count; i++) {
    const t = -faceGeo.attributes.position.getY(i) / 7;
    faceCol.set([1 - 0.35 * t, 1 - 0.3 * t, 1 - 0.18 * t], i * 3);
  }
  faceGeo.setAttribute('color', new THREE.BufferAttribute(faceCol, 3));
  const faceMat = new THREE.MeshBasicMaterial({ color: SEA_TINT.origin.clone(), vertexColors: true, transparent: true, opacity: 0.4, depthWrite: false });
  const seaFace = new THREE.Mesh(faceGeo, faceMat);
  seaFace.renderOrder = 4;
  seaGroup.add(seaFace);
  const lineGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0.035, 0, -30), new THREE.Vector3(0.035, 0, 30)]);
  seaGroup.add(new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: '#1e5f8a' })));
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 60), new THREE.MeshStandardMaterial({ color: '#c8bfa6' }));
  floor.rotation.x = -Math.PI / 2;
  floor.rotation.z = 0;
  floor.position.set(-20, -7, 0);
  seaGroup.add(floor);

  // 부두와 크레인 (항구 단계에서만 미끄러져 들어온다)
  const port = new THREE.Group();
  scene.add(port);
  const clip = [cutPlane];
  const quayMat = new THREE.MeshStandardMaterial({ color: '#bdb7aa', clippingPlanes: clip });
  const quay = new THREE.Mesh(new THREE.BoxGeometry(26, 2.4, 8), quayMat);
  quay.position.set(-6, -0.95, -7.6);
  port.add(quay);
  const quayTop = new THREE.Mesh(new THREE.BoxGeometry(26, 0.06, 8), new THREE.MeshStandardMaterial({ color: '#9a9488', clippingPlanes: clip }));
  quayTop.position.set(-6, 0.28, -7.6);
  port.add(quayTop);
  const craneMat = new THREE.MeshStandardMaterial({ color: '#c9a46a', clippingPlanes: clip });
  const crane = new THREE.Group();
  for (const dx of [-1.1, 1.1]) for (const z of [-4.2, -8.4]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 5, 0.1), craneMat);
    leg.position.set(dx, 2.8, z);
    crane.add(leg);
  }
  for (const dx of [-1.1, 1.1]) {
    const boom = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.2, 12.4), craneMat);
    boom.position.set(dx, 5.35, -4.0);
    crane.add(boom);
  }
  const trolley = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.3, 0.7), new THREE.MeshStandardMaterial({ color: '#555c66', clippingPlanes: clip }));
  trolley.position.set(0, 5.1, 0);
  crane.add(trolley);
  crane.position.x = -2.1;
  port.add(crane);

  // ---------- 생물 ----------
  const N_CARRY = 64, N_SEA = 30, N_NATIVE = 44, N_OFF = 64;
  const N = N_CARRY + N_SEA + N_NATIVE + N_OFF;
  const orgGeo = new THREE.SphereGeometry(1, 10, 8);
  const orgMat = new THREE.MeshStandardMaterial({ roughness: 0.5 });
  const orgs = new THREE.InstancedMesh(orgGeo, orgMat, N);
  orgs.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  orgs.renderOrder = 1;
  orgs.frustumCulled = false;
  scene.add(orgs);
  const colors = new Float32Array(N * 3);
  orgs.instanceColor = new THREE.InstancedBufferAttribute(colors, 3);

  // 탱크 안 자리(배 기준 좌표). 수위가 그 높이를 지날 때 들어오고 나간다.
  const carry = [];
  for (let i = 0; i < N_CARRY; i++) {
    let z, y;
    if (rnd() < 0.42) { z = (rnd() * 2 - 1) * 1.7; y = 0.13 + rnd() * 0.24; }
    else { z = (rnd() < 0.5 ? -1 : 1) * (1.7 + rnd() * 0.38); y = 0.48 + rnd() * 1.55; }
    const side = Math.sign(z) || 1;
    const x = -0.12 - rnd() * 1.1;
    const fy = (y - TANK_BOT) / (TANK_TOP - TANK_BOT);
    carry.push({
      home: new THREE.Vector3(x, y, z), side, fy,
      sea: new THREE.Vector3(-0.15 - rnd() * 1.3, -0.5 - rnd() * 3.2, side * (2.7 + rnd() * 5)),
      out: new THREE.Vector3(-0.15 - rnd() * 1.3, -0.4 - rnd() * 2.8, side * (2.6 + rnd() * 6)),
      ph: rnd() * 6.28, rot: new THREE.Euler(rnd() * 3, rnd() * 3, rnd() * 3),
    });
  }
  const seaExtra = Array.from({ length: N_SEA }, () => ({
    pos: new THREE.Vector3(-0.15 - rnd() * 1.4, -0.4 - rnd() * 3.6, (rnd() < 0.5 ? -1 : 1) * (2.7 + rnd() * 9)),
    ph: rnd() * 6.28, rot: new THREE.Euler(rnd() * 3, rnd() * 3, rnd() * 3),
  }));
  const natives = Array.from({ length: N_NATIVE }, (_, i) => ({
    pos: new THREE.Vector3(-0.15 - rnd() * 1.4, -0.4 - rnd() * 3.6, (rnd() < 0.5 ? -1 : 1) * (2.6 + rnd() * 9)),
    ph: rnd() * 6.28, die: i % 2 === 0, dieAt: 0.62 + rnd() * 0.3,
  }));
  const offspring = Array.from({ length: N_OFF }, (_, i) => ({
    parent: i % N_CARRY, off: new THREE.Vector3((rnd() - 0.5) * 0.9, (rnd() - 0.5) * 0.9, (rnd() - 0.5) * 1.6),
    at: 0.5 + rnd() * 0.42, ph: rnd() * 6.28, rot: new THREE.Euler(rnd() * 3, rnd() * 3, rnd() * 3),
  }));

  const NATIVE_COL = new THREE.Color('#2a9d6f');
  const DEAD_COL = new THREE.Color('#8b8e92');
  const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpS = new THREE.Vector3(), tmpP = new THREE.Vector3();
  const tmpC = new THREE.Color();
  const va = new THREE.Vector3(), vb = new THREE.Vector3();

  // ---------- 라벨 ----------
  const labels = {};
  function addLabel(key, text, cls = '') {
    const el = document.createElement('div');
    el.className = cls ? `bw-lbl bw-lbl-${cls}` : 'bw-lbl';
    el.textContent = text;
    labelHost.appendChild(el);
    labels[key] = { el, world: new THREE.Vector3(), show: true };
  }
  addLabel('hold', '화물칸');
  addLabel('tank', '평형수 탱크', 'water');
  addLabel('unit', '처리 장치', 'unit');
  addLabel('prop', '프로펠러가 물 밖으로', 'warn');
  addLabel('wl', '수면');

  // ---------- 상태 ----------
  let draft = 1.25, roll = 0, time = 0, wavePhase = 0;
  const sh = { shape: 'mussel', color: new THREE.Color('#3d4f9f') };
  let w = 1, h = 1;

  function resize() {
    w = host.clientWidth || 1; h = host.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  function frameCamera() {
    const aspect = w / h;
    const dist = 16 * Math.max(1, 1.75 / aspect);
    const dir = new THREE.Vector3(0.92, 0.34, 0.42).normalize();
    camera.position.copy(target).addScaledVector(dir, dist);
    controls.update();
  }
  resize();
  frameCamera();
  new ResizeObserver(() => { resize(); frameCamera(); }).observe(host);

  function setCase(c) {
    sh.shape = c.shape;
    sh.color.set(c.color);
  }

  function setOrg(i, pos, scale, color, rot) {
    if (scale <= 0.001) { tmpM.makeScale(0, 0, 0); orgs.setMatrixAt(i, tmpM); return; }
    if (rot) tmpQ.setFromEuler(rot); else tmpQ.identity();
    tmpS.copy(scale);
    tmpM.compose(pos, tmpQ, tmpS);
    orgs.setMatrixAt(i, tmpM);
    colors.set([color.r, color.g, color.b], i * 3);
  }

  const alienScale = new THREE.Vector3(), nativeScale = new THREE.Vector3(0.12, 0.05, 0.055);
  const scl = new THREE.Vector3();

  // v: { step, p, cargo, ballast, treat, sailing, portIn, seaKind, noBallast }
  function update(v, dt) {
    time += dt;
    if (sh.shape === 'jelly') alienScale.set(0.085, 0.11, 0.085); else alienScale.set(0.13, 0.06, 0.07);

    // 무게 → 흘수, 안정성 → 흔들림
    const weight = v.cargo + v.ballast * 0.88;
    const targetDraft = 0.5 + 0.72 * Math.min(weight, 1.05);
    draft = lerp(draft, targetDraft, 1 - Math.exp(-dt * 2.5));
    const stable = smooth(0.15, 0.8, weight);
    const amp = lerp(0.17, 0.022, stable) * (v.sailing ? 1 : 0.35);
    roll = amp * Math.sin(time * 1.25) + amp * 0.3 * Math.sin(time * 2.3 + 1);
    pivot.rotation.x = roll;
    ship.position.y = -draft + 0.025 * Math.sin(time * 1.7);

    // 평형수 수위
    setBallastLevel(TANK_BOT + clamp01(v.ballast) * (TANK_TOP - TANK_BOT));
    units.forEach((u) => (u.visible = v.treat));
    unitMat.emissiveIntensity = 0.45 + 0.35 * Math.sin(time * 5) * (v.step === 3 ? 1 : 0.2);

    // 화물
    const n = boxes.length;
    const loaded = v.cargo * n;
    boxes.forEach((b, i) => {
      const base = b.userData.base;
      // i 는 아래층부터. i < loaded 이면 실려 있음, 경계 상자는 공중에 매달려 오르내림
      const f = clamp01(loaded - i);
      b.visible = f > 0.001;
      b.position.set(base.x, base.y + (1 - f) * 3.2, base.z);
      b.material.opacity = f < 1 ? 0.35 + 0.65 * f : 1;
    });

    // 바다 색과 물결
    const tint = SEA_TINT[v.seaKind] || SEA_TINT.ocean;
    surfMat.color.lerp(tint, 1 - Math.exp(-dt * 2));
    faceMat.color.lerp(tint, 1 - Math.exp(-dt * 2));
    wavePhase += dt * (v.sailing ? 0.11 : 0.012);
    waveTex.offset.set(-wavePhase, Math.sin(time * 0.3) * 0.01);

    // 부두: 항구 단계에서만. 출항하면 뒤로 밀려나고, 입항하면 앞에서 들어온다.
    port.position.x = v.portX;
    port.visible = Math.abs(v.portX) < 45;

    // 생물
    pivot.updateMatrixWorld(true);
    let idx = 0;
    const lvl = clamp01(v.ballast);
    for (const o of carry) {
      const bob = Math.sin(time * 1.3 + o.ph) * 0.03;
      let visible = false, alive = true, s = 1;
      if (v.step === 1) {
        const tArrive = 0.05 + 0.8 * o.fy, tStart = tArrive - 0.16;
        const mouth = va.set(o.home.x, 0.24, o.side * 2.3);
        if (v.p < tStart) { tmpP.copy(o.sea); tmpP.y += bob; visible = true; s = v.seaFade; }
        else if (v.p < tArrive) {
          const t = (v.p - tStart) / (tArrive - tStart);
          ship.localToWorld(vb.copy(mouth));
          if (t < 0.5) tmpP.lerpVectors(o.sea, vb, t * 2);
          else ship.localToWorld(tmpP.copy(mouth).lerp(o.home, (t - 0.5) * 2));
          visible = true;
        } else { ship.localToWorld(tmpP.copy(o.home)); tmpP.y += bob; visible = true; }
      } else if (v.step === 2) {
        visible = !v.noBallast && o.fy <= lvl + 0.02;
        ship.localToWorld(tmpP.copy(o.home)); tmpP.y += bob;
      } else if (v.step === 3) {
        const tLeave = 0.05 + 0.8 * (1 - o.fy), tEnd = tLeave + 0.16;
        const mouth = va.set(v.treat ? -0.45 : o.home.x, 0.22, o.side * (v.treat ? 1.95 : 2.3));
        if (v.p < tLeave) { ship.localToWorld(tmpP.copy(o.home)); tmpP.y += bob; visible = true; }
        else if (v.p < tEnd) {
          const t = (v.p - tLeave) / (tEnd - tLeave);
          if (t < 0.5) ship.localToWorld(tmpP.copy(o.home).lerp(mouth, t * 2));
          else {
            ship.localToWorld(vb.copy(mouth));
            tmpP.lerpVectors(vb, o.out, (t - 0.5) * 2);
            if (v.treat) { alive = false; s = 1 - (t - 0.5) * 2; }
          }
          visible = true;
        } else if (!v.treat) { tmpP.copy(o.out); tmpP.y += bob; visible = true; }
      } else if (v.step === 4 && !v.treat) {
        tmpP.copy(o.out); tmpP.y += bob; visible = v.seaFade > 0.01; s = v.seaFade;
      }
      setOrg(idx++, tmpP, visible ? scl.copy(alienScale).multiplyScalar(s) : scl.set(0, 0, 0), alive ? sh.color : DEAD_COL, o.rot);
    }
    for (const o of seaExtra) {
      const vis = v.step === 1;
      tmpP.copy(o.pos); tmpP.y += Math.sin(time * 1.2 + o.ph) * 0.04;
      setOrg(idx++, tmpP, vis ? scl.copy(alienScale).multiplyScalar(v.seaFade) : scl.set(0, 0, 0), sh.color, o.rot);
    }
    for (const o of natives) {
      const vis = v.step === 3 || (v.step === 4 && v.seaFade > 0.01);
      let dead = false, sink = 0;
      const harm = !v.treat && (v.step === 4 || (v.step === 3 && v.p > o.dieAt));
      if (o.die && harm) { dead = true; sink = v.step === 4 ? 0.8 : smooth(o.dieAt, o.dieAt + 0.3, v.p) * 0.8; }
      tmpP.copy(o.pos); tmpP.y += Math.sin(time * 1.1 + o.ph) * 0.05 - sink;
      tmpP.z += dead ? 0 : Math.sin(time * 0.6 + o.ph) * 0.15;
      const s = vis ? (v.step === 4 ? v.seaFade : 1) : 0;
      setOrg(idx++, tmpP, scl.copy(nativeScale).multiplyScalar(s), dead ? DEAD_COL : NATIVE_COL, null);
    }
    for (const o of offspring) {
      const par = carry[o.parent];
      let s = 0;
      if (!v.treat && v.step === 3) s = smooth(o.at, o.at + 0.08, v.p);
      if (!v.treat && v.step === 4) s = v.seaFade;
      tmpP.copy(par.out).add(o.off); tmpP.y += Math.sin(time * 1.3 + o.ph) * 0.03;
      setOrg(idx++, tmpP, scl.copy(alienScale).multiplyScalar(s * 0.85), sh.color, o.rot);
    }
    orgs.instanceMatrix.needsUpdate = true;
    orgs.instanceColor.needsUpdate = true;

    // 라벨
    const propTop = ship.localToWorld(va.set(STERN_X - 0.25, 0.55 + 0.5, 0)).y;
    labels.hold.world.copy(ship.localToWorld(va.set(-0.4, D + 0.2, -0.6)));
    labels.hold.show = true;
    labels.tank.world.copy(ship.localToWorld(va.set(-0.05, 1.45, 1.86)));
    labels.tank.show = true;
    labels.unit.world.copy(ship.localToWorld(va.set(-0.1, 0.05, -1.95)));
    labels.unit.show = v.treat;
    labels.prop.world.copy(ship.localToWorld(va.set(STERN_X - 0.3, 1.25, 0)));
    labels.prop.show = propTop > 0.02;
    labels.wl.world.set(0.05, 0.02, 5.6);
    labels.wl.show = true;

    controls.update();
    renderer.render(scene, camera);

    for (const k in labels) {
      const L = labels[k];
      tmpP.copy(L.world).project(camera);
      const on = L.show && tmpP.z < 1;
      L.el.style.display = on ? '' : 'none';
      if (on) L.el.style.transform = `translate(${((tmpP.x + 1) / 2) * w}px, ${((1 - tmpP.y) / 2) * h}px) translate(-50%, -50%)`;
    }

    return { draft, rollAmp: amp, stable, propOut: propTop > 0.02 };
  }

  if (opts.expose) opts.expose({ camera, controls, scene, Raycaster: THREE.Raycaster, Vector2: THREE.Vector2 });
  return { update, setCase, resetView: frameCamera };
}
