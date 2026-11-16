// © 2026 김용현
// OSM 건물(바닥 모양을 높이만큼 세운 상자)과 숲·나무(낮은 다각형 나무)를 장면에 놓는다.
import * as THREE from 'three';

/** 건물 전부를 한 덩어리 면으로. heightAt(x, z) = 땅 높이. avoid = [x, z] 둘레 clear m 안의 건물은 오두막 모형이 잘 보이도록 뺀다 */
export function buildBuildings(osm, heightAt, avoid, clear = 32) {
  const pos = [], idx = [];
  let v = 0;
  for (const b of osm.buildings) {
    const p = b.p, n = p.length / 2;
    let near = false;
    for (let i = 0; i < n; i++) if (Math.hypot(p[i * 2] - avoid[0], -p[i * 2 + 1] - avoid[1]) < clear) near = true;
    if (near) continue;
    const pts = [];
    let gmin = Infinity, gsum = 0;
    for (let i = 0; i < n; i++) {
      const x = p[i * 2], z = -p[i * 2 + 1];
      const g = heightAt(x, z);
      gmin = Math.min(gmin, g); gsum += g;
      pts.push([x, z]);
    }
    const y0 = gmin - 0.6, y1 = gsum / n + b.h;
    // 벽
    for (let i = 0; i < n; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[(i + 1) % n];
      pos.push(ax, y0, az, bx, y0, bz, bx, y1, bz, ax, y1, az);
      idx.push(v, v + 1, v + 2, v, v + 2, v + 3);
      v += 4;
    }
    // 지붕(평평하게) — OSM 고리는 북쪽 +y 기준 반시계 → 장면(z = -y)에서는 시계 방향이 된다
    const tri = THREE.ShapeUtils.triangulateShape(pts.map(([x, z]) => new THREE.Vector2(x, z)), []);
    const top = v;
    for (const [x, z] of pts) pos.push(x, y1, z);
    v += n;
    for (const [a, c, d] of tri) idx.push(top + a, top + d, top + c);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  const g2 = geo.toNonIndexed();
  g2.computeVertexNormals();
  const mesh = new THREE.Mesh(g2, new THREE.MeshLambertMaterial({ color: 0xe9e2d4, side: THREE.DoubleSide }));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function inPoly(x, y, p) {
  let inside = false;
  for (let i = 0, j = p.length / 2 - 1; i < p.length / 2; j = i++) {
    const xi = p[i * 2], yi = p[i * 2 + 1], xj = p[j * 2], yj = p[j * 2 + 1];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** 숲 다각형 안에 나무를 흩뿌리고 OSM 나무 점에도 하나씩. 결정적 의사 난수(늘 같은 모습) */
export function buildTrees(osm, heightAt, half, avoid) {
  let seed = 12345;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const spots = [];
  for (const a of osm.woods) {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (let i = 0; i < a.length; i += 2) {
      x0 = Math.min(x0, a[i]); x1 = Math.max(x1, a[i]); y0 = Math.min(y0, a[i + 1]); y1 = Math.max(y1, a[i + 1]);
    }
    x0 = Math.max(x0, -half); x1 = Math.min(x1, half); y0 = Math.max(y0, -half); y1 = Math.min(y1, half);
    const tries = Math.min(2500, ((x1 - x0) * (y1 - y0)) / 70);
    for (let t = 0; t < tries; t++) {
      const x = x0 + rnd() * (x1 - x0), y = y0 + rnd() * (y1 - y0);
      if (inPoly(x, y, a)) spots.push([x, y, 0.8 + rnd() * 0.6]);
    }
  }
  for (let i = 0; i < osm.trees.length; i += 2) spots.push([osm.trees[i], osm.trees[i + 1], 1.2]);
  const keep = spots.filter(([x, y]) => Math.hypot(x - avoid[0], -y - avoid[1]) > 26).slice(0, 6000);

  const crownGeo = new THREE.IcosahedronGeometry(1, 0);
  crownGeo.scale(3.2, 4.5, 3.2);
  crownGeo.translate(0, 6, 0);
  const trunkGeo = new THREE.CylinderGeometry(0.25, 0.35, 3, 5);
  trunkGeo.translate(0, 1.5, 0);
  const crowns = new THREE.InstancedMesh(crownGeo, new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true }), keep.length);
  const trunks = new THREE.InstancedMesh(trunkGeo, new THREE.MeshLambertMaterial({ color: 0x5a4632 }), keep.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  const col = new THREE.Color();
  keep.forEach(([x, y, k], i) => {
    const z = -y;
    p.set(x, heightAt(x, z) - 0.2, z);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), (i * 2.39996) % 6.283);
    s.set(k, k, k);
    m.compose(p, q, s);
    crowns.setMatrixAt(i, m);
    trunks.setMatrixAt(i, m);
    // 나무마다 색을 조금씩 다르게(가을 애로타운의 노란 잎도 섞음)
    const r = (i * 0.618) % 1;
    col.setRGB(0.22 + r * 0.12 + (r > 0.85 ? 0.35 : 0), 0.38 + r * 0.1, 0.2);
    crowns.setColorAt(i, col);
  });
  for (const im of [crowns, trunks]) {
    im.castShadow = true;
    im.receiveShadow = true;
  }
  const g = new THREE.Group();
  g.add(crowns, trunks);
  return g;
}
