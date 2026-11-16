// © 2026 김용현
// 지형: 높이 격자 PNG 불러오기 + 가까운 지형(1.6km) 면과 먼 산(24km) 면 만들기 + OSM 자료로 땅 색 칠하기.
// 규칙(EMBED_RULES.md): fetch 없이 new Image() + crossOrigin='anonymous' 로 GitHub Pages(Access-Control-Allow-Origin: *)에서 받아
// 캔버스에 그려 픽셀을 읽는다(src/atlas/relief.js 와 같은 방식). 개발 서버에서는 같은 파일을 /docs/assets/... 로 읽는다.
// 장면 좌표: x = 동쪽(m), y = 높이 - 오두막 바닥 높이(m), z = 남쪽(m) (북쪽 = -z). 원점 = 장면 가운데.
import * as THREE from 'three';
import { h } from '../../src/shared/dom.js';
import { TERRAIN } from './data/terrain-meta.js';

export const ASSET_URL = 'https://yhk1m.github.io/donga-social-sims/assets/t1-u1-sun-window/';
export const ASSET_DEV_URL = '/docs/assets/t1-u1-sun-window/';
const BASE = import.meta.env?.DEV ? ASSET_DEV_URL : ASSET_URL;

/** 높이 PNG(R*256+G = 0.1m 단위) → Float32Array(m). 실패하면 null */
export function loadHeights(file) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    const url = BASE + file;
    const fail = (why) => { console.warn(`지형 자료 생략(${why}): ${url}`); resolve(null); };
    img.addEventListener('error', () => fail('불러오기 실패'), { once: true });
    img.addEventListener('load', () => {
      try {
        const w = img.naturalWidth, hh = img.naturalHeight;
        const c = h('canvas');
        c.width = w; c.height = hh;
        const cx = c.getContext('2d', { willReadFrequently: true });
        cx.drawImage(img, 0, 0);
        const rgba = cx.getImageData(0, 0, w, hh).data;
        const out = new Float32Array(w * hh);
        for (let i = 0, o = 0; i < out.length; i++, o += 4) out[i] = (rgba[o] * 256 + rgba[o + 1]) / 10;
        c.width = c.height = 0;
        resolve({ size: w, data: out });
      } catch (err) {
        fail(err?.name === 'SecurityError' ? '교차 출처로 픽셀을 읽을 수 없음' : err?.message || String(err));
      }
    }, { once: true });
    img.src = url;
  });
}

/** 격자에서 (x, z) 높이(쌍선형). grid = {size, data}, half = 반폭(m) */
export function makeSampler(grid, half, base) {
  const n = grid.size, d = grid.data, step = (2 * half) / (n - 1);
  return (x, z) => {
    const fx = Math.min(n - 1.001, Math.max(0, (x + half) / step));
    const fz = Math.min(n - 1.001, Math.max(0, (z + half) / step));
    const i = Math.floor(fx), j = Math.floor(fz), tx = fx - i, tz = fz - j;
    const a = d[j * n + i], b = d[j * n + i + 1], c = d[(j + 1) * n + i], e = d[(j + 1) * n + i + 1];
    return (a * (1 - tx) + b * tx) * (1 - tz) + (c * (1 - tx) + e * tx) * tz - base;
  };
}

/** 정사각 격자 면. 행 0 = 북쪽(z = -half). skipInside > 0 이면 그 안쪽 칸은 뺀다(가까운 지형 자리) */
function gridGeometry(grid, half, base, skipInside = 0, drop = 0) {
  const n = grid.size;
  const geo = new THREE.PlaneGeometry(2 * half, 2 * half, n - 1, n - 1);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let k = 0; k < pos.count; k++) pos.setY(k, grid.data[k] - base - drop);
  if (skipInside > 0) {
    const idx = geo.index.array, keep = [];
    for (let t = 0; t < idx.length; t += 3) {
      let all = true;
      for (let q = 0; q < 3; q++) {
        const v = idx[t + q];
        if (Math.abs(pos.getX(v)) > skipInside || Math.abs(pos.getZ(v)) > skipInside) all = false;
      }
      if (!all) keep.push(idx[t], idx[t + 1], idx[t + 2]);
    }
    geo.setIndex(keep);
  }
  geo.computeVertexNormals();
  return geo;
}

// 땅 색: 낮은 골짜기 풀밭 → 언덕 마른 풀(터석) → 높은 산 바위 → 꼭대기 눈
function groundColor(hm, slope, out) {
  const t = THREE.MathUtils.clamp((hm - 380) / 1500, 0, 1);
  const grass = [0.47, 0.56, 0.32], tussock = [0.66, 0.6, 0.4], rock = [0.55, 0.52, 0.48], snow = [0.94, 0.95, 0.97];
  let c;
  if (t < 0.25) c = mix(grass, tussock, t / 0.25);
  else if (t < 0.7) c = mix(tussock, rock, (t - 0.25) / 0.45);
  else c = mix(rock, snow, Math.min(1, (t - 0.7) / 0.12));
  const k = THREE.MathUtils.clamp(slope * 1.2, 0, 0.5); // 가파르면 바위색
  c = mix(c, rock, k * (t < 0.7 ? 0.7 : 0));
  out[0] = c[0]; out[1] = c[1]; out[2] = c[2];
}
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** 먼 산 면(정점 색) */
export function buildFarMesh(far, nearHalf, base) {
  const half = TERRAIN.far.half;
  const geo = gridGeometry(far, half, base, nearHalf - 60, 2.5);
  const pos = geo.attributes.position, nrm = geo.attributes.normal;
  const col = new Float32Array(pos.count * 3), c = [0, 0, 0];
  for (let k = 0; k < pos.count; k++) {
    groundColor(pos.getY(k) + base, 1 - nrm.getY(k), c);
    col.set(c, k * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
  mesh.receiveShadow = false;
  return mesh;
}

/** 가까운 지형 면 + 땅 그림(캔버스 텍스처) */
export function buildNearMesh(near, base, osm, maxAniso) {
  const half = TERRAIN.near.half;
  const geo = gridGeometry(near, half, base);
  const tex = paintGround(near, half, base, osm);
  tex.anisotropy = maxAniso;
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: tex }));
  mesh.receiveShadow = true;
  mesh.castShadow = true;
  return mesh;
}

/** 땅 그림: 고도·경사 바탕색 위에 풀밭·숲·물·길을 그린다(위성 사진 대신) */
function paintGround(near, half, base, osm) {
  const S = 2048;
  const cv = h('canvas');
  cv.width = cv.height = S;
  const cx = cv.getContext('2d');
  // 바탕(격자 해상도로 그린 뒤 늘림)
  const n = near.size;
  const small = h('canvas');
  small.width = small.height = n;
  const sx = small.getContext('2d');
  const img = sx.createImageData(n, n);
  const step = (2 * half) / (n - 1), c = [0, 0, 0];
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const k = j * n + i;
      const hx = near.data[j * n + Math.min(n - 1, i + 1)] - near.data[j * n + Math.max(0, i - 1)];
      const hz = near.data[Math.min(n - 1, j + 1) * n + i] - near.data[Math.max(0, j - 1) * n + i];
      const slope = Math.hypot(hx, hz) / (2 * step);
      groundColor(near.data[k], slope, c);
      // 고르게 섞인 작은 얼룩(풀밭 결)
      const noise = 0.94 + 0.12 * fract(Math.sin(i * 12.9898 + j * 78.233) * 43758.5453);
      img.data[k * 4] = c[0] * 255 * noise;
      img.data[k * 4 + 1] = c[1] * 255 * noise;
      img.data[k * 4 + 2] = c[2] * 255 * noise;
      img.data[k * 4 + 3] = 255;
    }
  }
  sx.putImageData(img, 0, 0);
  cx.imageSmoothingEnabled = true;
  cx.drawImage(small, 0, 0, S, S);
  small.width = small.height = 0;

  const px = S / (2 * half);
  const P = (x, y) => [(x + half) * px, (half - y) * px]; // OSM 좌표(동 x, 북 y) → 그림 좌표
  const path = (arr, start, close) => {
    cx.beginPath();
    for (let i = start; i < arr.length; i += 2) {
      const [u, v] = P(arr[i], arr[i + 1]);
      if (i === start) cx.moveTo(u, v); else cx.lineTo(u, v);
    }
    if (close) cx.closePath();
  };
  cx.lineJoin = 'round'; cx.lineCap = 'round';
  cx.fillStyle = 'rgba(112,150,78,0.75)';
  for (const a of osm.grass) { path(a, 0, true); cx.fill(); }
  cx.fillStyle = 'rgba(52,86,46,0.85)';
  for (const a of osm.woods) { path(a, 0, true); cx.fill(); }
  // 강바닥 자갈
  cx.strokeStyle = '#b9b2a0';
  for (const l of osm.waterLines) if (l[0] === 0) { cx.lineWidth = 26 * px; path(l, 1, false); cx.stroke(); }
  cx.fillStyle = '#4f86b3';
  for (const a of osm.waterAreas) { path(a, 0, true); cx.fill(); }
  cx.strokeStyle = '#4f86b3';
  for (const l of osm.waterLines) { cx.lineWidth = (l[0] === 0 ? 9 : 2.6) * px; path(l, 1, false); cx.stroke(); }
  const ROAD = [['#8a8a86', 8], ['#9c9a94', 5.5], ['#c9b48e', 1.8]];
  for (const cls of [2, 1, 0]) {
    cx.strokeStyle = ROAD[cls][0];
    cx.lineWidth = ROAD[cls][1] * px;
    for (const r of osm.roads) if (r[0] === cls) { path(r, 1, false); cx.stroke(); }
  }
  // 건물 바닥 자리(벽 아래 어두운 테두리)
  cx.fillStyle = 'rgba(70,64,58,0.55)';
  for (const b of osm.buildings) { path(b.p, 0, true); cx.fill(); }

  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  return tex;
}
const fract = (v) => v - Math.floor(v);
