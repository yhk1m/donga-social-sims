// © 2026 김용현
// 교과서 사진 같은 작은 오두막 모형: 돌벽 + 함석 지붕, 앞벽에 창 하나, 방 안 흙바닥.
// 자기 좌표는 sunroom.js 와 같다(x = 앞벽을 따라, y = 위, z = 창 바깥쪽). 방 안 면은 직사광을 받지 않는 재질(MeshBasic)로
// 그리고, 창으로 드는 햇빛 자국은 sunroom.sunPatch() 로 정확히 계산해 밝은 면으로 덧그린다.
import * as THREE from 'three';
import { h } from '../../src/shared/dom.js';
import { HUT, sunPatch } from './sunroom.js';

const W = HUT.outerW, D = HUT.outerD, T = HUT.wall, WH = HUT.wallH, RH = HUT.ridgeH;
const { halfW: HW, sill: SILL, top: TOP } = HUT.win;
const IN_X = W / 2 - T, IN_Z = D / 2 - T;

function canvasTex(size, draw, repeat = true) {
  const c = h('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function stoneTexture() {
  return canvasTex(256, (cx, S) => {
    cx.fillStyle = '#8b8172';
    cx.fillRect(0, 0, S, S);
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let row = 0, y = 0; y < S; row++) {
      const rh = 22 + rnd() * 18;
      for (let x = -rnd() * 30; x < S;) {
        const rw = 30 + rnd() * 40;
        const g = 120 + rnd() * 60;
        cx.fillStyle = `rgb(${g + 10},${g + 2},${g - 12})`;
        cx.beginPath();
        cx.roundRect(x + 2, y + 2, rw - 4, rh - 4, 7);
        cx.fill();
        x += rw;
      }
      y += rh;
    }
  });
}

function ironTexture() {
  return canvasTex(128, (cx, S) => {
    for (let x = 0; x < S; x++) {
      const v = 150 + 45 * Math.sin((x / S) * Math.PI * 2 * 8);
      cx.fillStyle = `rgb(${v},${v + 4},${v + 8})`;
      cx.fillRect(x, 0, 1, S);
    }
    cx.fillStyle = 'rgba(140,80,40,0.25)';
    for (let i = 0; i < 14; i++) cx.fillRect((i * 37) % S, (i * 53) % S, 10, 18);
  });
}

/** 상자 UV 를 실제 크기(m)에 맞춰 늘려 무늬가 늘어지지 않게 */
function box(w, hgt, d, mat, x, y, z, scale = 1.2) {
  const g = new THREE.BoxGeometry(w, hgt, d);
  const uv = g.attributes.uv;
  const dims = [[d, hgt], [d, hgt], [w, d], [w, d], [w, hgt], [w, hgt]];
  for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) {
    const i = f * 4 + k;
    uv.setXY(i, (uv.getX(i) * dims[f][0]) / scale, (uv.getY(i) * dims[f][1]) / scale);
  }
  const m = new THREE.Mesh(g, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function plane(w, hgt, mat, x, y, z, ry = 0, rx = 0) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, hgt), mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, 0, 'YXZ');
  return m;
}

export function buildHut() {
  const group = new THREE.Group();
  const stone = new THREE.MeshLambertMaterial({ map: stoneTexture() });
  const wood = new THREE.MeshLambertMaterial({ color: 0x6b4f35 });
  const iron = new THREE.MeshLambertMaterial({ map: ironTexture(), side: THREE.DoubleSide });

  // 받침(비탈에 묻히도록 아래로 길게)
  group.add(box(W + 0.3, 1.6, D + 0.3, stone, 0, -0.8, 0));
  // 앞벽(창 구멍 둘레 네 조각)
  const zf = D / 2 - T / 2;
  const sideW = W / 2 - HW;
  group.add(box(sideW, WH, T, stone, -(HW + sideW / 2), WH / 2, zf));
  group.add(box(sideW, WH, T, stone, HW + sideW / 2, WH / 2, zf));
  group.add(box(2 * HW, SILL, T, stone, 0, SILL / 2, zf));
  group.add(box(2 * HW, WH - TOP, T, stone, 0, (TOP + WH) / 2, zf));
  // 뒷벽
  group.add(box(W, WH, T, stone, 0, WH / 2, -zf));
  // 옆벽(박공 삼각형까지)
  for (const sx of [-1, 1]) {
    const x = sx * (W / 2 - T / 2);
    group.add(box(T, WH, D - 2 * T, stone, x, WH / 2, 0));
    const tri = new THREE.Shape([new THREE.Vector2(-D / 2, 0), new THREE.Vector2(D / 2, 0), new THREE.Vector2(0, RH - WH)]);
    const g = new THREE.ExtrudeGeometry(tri, { depth: T, bevelEnabled: false });
    g.rotateY(Math.PI / 2);
    const gm = new THREE.Mesh(g, stone);
    gm.position.set(x - T / 2, WH, 0);
    gm.castShadow = gm.receiveShadow = true;
    group.add(gm);
  }
  // 문(왼쪽 옆벽 바깥) — 판자 문
  const door = box(0.06, 1.75, 0.85, wood, -(W / 2) - 0.03, 0.875, -0.3);
  group.add(door);
  // 굴뚝(오른쪽 박공)
  group.add(box(0.7, 1.4, 0.7, stone, W / 2 - 0.35, RH - 0.1, -0.6));
  // 창틀
  group.add(box(2 * HW + 0.12, 0.07, T + 0.06, wood, 0, SILL - 0.02, zf));
  group.add(box(2 * HW + 0.12, 0.07, T + 0.06, wood, 0, TOP + 0.02, zf));
  group.add(box(0.06, TOP - SILL, T + 0.06, wood, -HW - 0.02, (SILL + TOP) / 2, zf));
  group.add(box(0.06, TOP - SILL, T + 0.06, wood, HW + 0.02, (SILL + TOP) / 2, zf));

  // 지붕(함석): 두 비탈 면. 지붕 걷기 = 색은 안 그리고 그림자만 드리움
  const roof = new THREE.Group();
  const over = 0.3, run = D / 2 + over, rise = (RH - WH) * (run / (D / 2));
  const slopeLen = Math.hypot(run, rise);
  const ang = Math.atan2(rise, run);
  for (const sz of [-1, 1]) {
    const g = new THREE.BoxGeometry(W + 0.5, 0.05, slopeLen);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (W + 0.5) / 0.9, uv.getY(i) * 1);
    const m = new THREE.Mesh(g, iron);
    m.rotation.x = sz * ang;
    m.position.set(0, RH - rise / 2 + 0.03, (sz * run) / 2);
    m.castShadow = m.receiveShadow = true;
    roof.add(m);
  }
  group.add(roof);

  // 방 안(직사광 없이 그늘 밝기로만 칠함)
  const inner = new THREE.Group();
  const floorMat = new THREE.MeshBasicMaterial({ color: 0x5e4a36 });
  const wallMat = new THREE.MeshBasicMaterial({ color: 0x6d6458, side: THREE.DoubleSide });
  const eps = 0.006;
  inner.add(plane(2 * IN_X, 2 * IN_Z, floorMat, 0, eps, 0, 0, -Math.PI / 2));
  inner.add(plane(2 * IN_X, WH, wallMat, 0, WH / 2, -IN_Z + eps));
  for (const sx of [-1, 1]) inner.add(plane(2 * IN_Z, WH, wallMat, sx * (IN_X - eps), WH / 2, 0, (-sx * Math.PI) / 2));
  const fz = IN_Z - eps, sw = IN_X - HW;
  inner.add(plane(sw, WH, wallMat, -(HW + sw / 2), WH / 2, fz));
  inner.add(plane(sw, WH, wallMat, HW + sw / 2, WH / 2, fz));
  inner.add(plane(2 * HW, SILL, wallMat, 0, SILL / 2, fz));
  inner.add(plane(2 * HW, WH - TOP, wallMat, 0, (TOP + WH) / 2, fz));
  // 천장(지붕 안쪽)
  const ceil = plane(2 * IN_X, 2 * IN_Z, wallMat, 0, WH - 0.02, 0, 0, Math.PI / 2);
  inner.add(ceil);
  group.add(inner);

  // 햇빛 자국(바닥, 뒷벽)
  const patchMat = new THREE.MeshBasicMaterial({ color: 0xffe08a, side: THREE.DoubleSide });
  const floorPatch = new THREE.Mesh(new THREE.BufferGeometry(), patchMat);
  const backPatch = new THREE.Mesh(new THREE.BufferGeometry(), patchMat);
  // 창으로 들어오는 빛 줄기(옅은 기둥)
  const beamMat = new THREE.MeshBasicMaterial({ color: 0xffe7a0, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide });
  const beam = new THREE.Mesh(new THREE.BufferGeometry(), beamMat);
  group.add(floorPatch, backPatch, beam);

  function fan(mesh, pts3) {
    const pos = [];
    for (let i = 1; i + 1 < pts3.length; i++) pos.push(...pts3[0], ...pts3[i], ...pts3[i + 1]);
    mesh.geometry.dispose();
    mesh.geometry = new THREE.BufferGeometry();
    mesh.geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    mesh.visible = pos.length > 0;
  }

  /**
   * 해 방향(자기 좌표 단위 벡터, 해가 없으면 null)으로 햇빛 자국 갱신. 돌려줌: 해가 방에 드는지
   */
  function setSun(s, light) {
    const p = s ? sunPatch(s) : { floor: [], back: [] };
    fan(floorPatch, p.floor.map(([x, z]) => [x, 0.014, z]));
    fan(backPatch, p.back.map(([x, y]) => [x, y, -IN_Z + 0.014]));
    const lit = p.floor.length > 0 || p.back.length > 0;
    // 빛 줄기: 창 구멍 네 모서리에서 해 반대 방향으로 바닥(또는 뒷벽)까지
    if (lit) {
      const zo = D / 2;
      const ends = [[-HW, SILL], [HW, SILL], [HW, TOP], [-HW, TOP]].map(([x, y]) => {
        const k = Math.min(y / s.y, (zo + IN_Z) / s.z);
        return [[x, y, zo], [x - k * s.x, y - k * s.y, zo - k * s.z]];
      });
      const tris = [];
      for (let i = 0; i < 4; i++) {
        const [a0, a1] = ends[i], [b0, b1] = ends[(i + 1) % 4];
        tris.push(...a0, ...b0, ...b1, ...a0, ...b1, ...a1);
      }
      beam.geometry.dispose();
      beam.geometry = new THREE.BufferGeometry();
      beam.geometry.setAttribute('position', new THREE.Float32BufferAttribute(tris, 3));
      beam.visible = true;
    } else beam.visible = false;
    // 방 안 밝기: 낮 밝기 + 해가 들면 반사광으로 조금 더
    const k = 0.45 + 0.4 * light + (lit ? 0.15 : 0);
    floorMat.color.setRGB(0.36 * k, 0.27 * k, 0.19 * k, THREE.SRGBColorSpace);
    wallMat.color.setRGB(0.46 * k, 0.42 * k, 0.37 * k, THREE.SRGBColorSpace);
    patchMat.color.setRGB(1, 0.8 + 0.08 * light, 0.32 + 0.15 * light, THREE.SRGBColorSpace);
    return lit;
  }

  function setRoofOpen(open) {
    iron.colorWrite = !open;
    iron.depthWrite = !open;
    iron.transparent = open;
    iron.opacity = open ? 0 : 1;
    ceil.visible = !open;
    iron.needsUpdate = true;
  }

  /** 빛 줄기 진하기(방 안 시점에서는 눈앞을 가리지 않게 옅게) */
  function setBeamOpacity(a) { beamMat.opacity = a; }

  return { group, setSun, setRoofOpen, setBeamOpacity, dims: { W, D, RH } };
}
