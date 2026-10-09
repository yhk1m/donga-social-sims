// © 2026 김용현
// src/atlas/relief.js — 지형 음영: 등장방형 음영기복도(Natural Earth SR_50M, 4096×2048 JPEG)를 화면 투영으로 다시 그려 육지에 곱하기(multiply)로 얹는다.
//
//   const data = await loadRelief(url)          // { width, height, data: Uint8Array(회색) } | null(불러오기·픽셀 읽기 실패 → 콘솔 한 줄)
//   map.setReliefDrawer(createReliefDrawer(data))   // 렌더러가 멈출 때만 fn(ctx, projection, view, { land, under, path, clipOutside }) 로 부른다
//   attachRelief(map, { url }) → Promise<drawer | null>   // 위 둘을 한 번에(주소 고르기·destroy 지킴). mount 는 이것만 부르면 된다
//   drawRelief(ctx, projection, view, data, { land, under, path, clipOutside, step }) → { ms, shadeMs, blitMs, step, cols, rows, exact, skipped }
//
// 그리는 법: 화면 step px(기본 2) 격자의 표본마다 경위도를 구한다(invertGrid — block 표본마다 놓인 마디만 projection.invert 로 정확히 구하고
// 칸 안은 양선형 보간, 칸 가운데 검사가 어긋나거나 마디가 지도 밖·틈이면 그 칸만 표본마다 정확히). 표본마다 이미지 회색을 양선형으로 뽑아
// 밝기 곡선(reliefLut: 평지 회색 ref 이상 = 흰색 → 곱해도 그대로, 그늘만 어둡게)을 거쳐 화면 1/step 크기 ImageData 로 만들고,
// 육지 경로로 자른 뒤 drawImage 로 키워(부드럽게) multiply·투명도 opacity 로 얹는다. 10a 일 때 단원 상자 밖 50m 육지(under)는
// clipOutside()(렌더러가 주는 단원 상자 밖 자르기) 안에서 한 번 더 얹는다.
// 경도는 감싸서 뽑으므로 날짜변경선에 이음매가 없고, 바다는 육지 자르기로 칠하지 않는다(구드 틈도 육지가 아니라 비어 있다).
//
// 규칙(EMBED_RULES.md): fetch 없이 new Image() + crossOrigin='anonymous'. 공개 이미지는 같은 GitHub Pages(Access-Control-Allow-Origin: *)에 둔다.
import { h } from '../shared/dom.js';

export const RELIEF_URL = 'https://yhk1m.github.io/donga-social-sims/assets/atlas/common/relief-4096.jpg';
/** 개발 서버(vite, 저장소 루트가 root)에서 쓰는 같은 파일 */
export const RELIEF_DEV_URL = '/docs/assets/atlas/common/relief-4096.jpg';
/**
 * 모양값. opacity = 곱하기 투명도, ref = 흰색으로 볼 회색(원본 평지·바다 = 206, 그보다 조금 위로 잡아 해 드는 비탈도 살짝 남김),
 * gamma = 그늘 대비(1 보다 크면 그늘이 더 짙게).
 */
export const RELIEF_STYLE = Object.freeze({ opacity: 0.45, ref: 206, gamma: 1.25 });
export const RELIEF_BUDGET_MS = 150;

// ---------- 순수 함수 ----------

/** 경위도 → 이미지 픽셀 좌표(픽셀 가운데 = 정수, 등장방형 −180..180 · 90..−90). 경도는 감싼다([−0.5, w−0.5)). */
export function lonLatToImage(lon, lat, iw, ih) {
  let u = (lon + 180) / 360;
  u -= Math.floor(u);
  return [u * iw - 0.5, ((90 - lat) / 180) * ih - 0.5];
}

/** 회색 이미지(data: 길이 iw·ih)에서 경위도 자리의 값을 양선형으로. 가로는 날짜변경선을 건너 감싸고, 세로는 첫·끝 행으로 자른다. */
export function sampleBilinear(data, iw, ih, lon, lat) {
  let u = (lon + 180) / 360;
  u -= Math.floor(u);
  const fx = u * iw - 0.5;
  let fy = ((90 - lat) / 180) * ih - 0.5;
  if (fy < 0) fy = 0; else if (fy > ih - 1) fy = ih - 1;
  const xf = Math.floor(fx), tx = fx - xf;
  const x0 = xf < 0 ? iw - 1 : xf, x1 = xf + 1 >= iw ? 0 : xf + 1;
  const y0 = Math.floor(fy), ty = fy - y0;
  const r0 = y0 * iw, r1 = (y0 + 1 < ih ? y0 + 1 : y0) * iw;
  const a = data[r0 + x0] + (data[r0 + x1] - data[r0 + x0]) * tx;
  const b = data[r1 + x0] + (data[r1 + x1] - data[r1 + x0]) * tx;
  return a + (b - a) * ty;
}

/** 밝기 곡선: 원본 회색 v → 곱할 회색. ref 이상은 255(곱해도 그대로), 아래는 (v/ref)^gamma. */
export function reliefLut({ ref = RELIEF_STYLE.ref, gamma = RELIEF_STYLE.gamma } = {}) {
  const lut = new Uint8ClampedArray(256);
  for (let v = 0; v < 256; v++) lut[v] = 255 * Math.pow(Math.min(1, v / ref), gamma);
  return lut;
}

const unwrap = (l, ref) => l + 360 * Math.round((ref - l) / 360);

/**
 * 화면 격자 역투영. 표본 (i, j) 의 화면 자리 = ((i+.5)·step, (j+.5)·step), cols = ⌈width/step⌉, rows = ⌈height/step⌉.
 * block 표본 간격의 마디만 invert 로 정확히 구하고, 네 마디가 다 지도 위이며 칸 가운데의 정확한 값과 보간 값의 차이가
 * max(tol(도), 표본 간격의 1/4) 안이면 칸 안을 보간한다.
 * 아니면 그 칸의 표본을 하나하나 정확히 구한다(exact 칸 수를 센다). 네 마디와 가운데가 모두 지도 밖인 칸은 비워 둔다(skipped).
 * forward(투영)를 주면 마디·가운데는 되돌려서 backTol(px) 안에 오는지도 본다(지도 밖 판정). 칸 안 표본을 하나하나 구할 때는 되돌리지 않는다
 * (지도 가장자리 칸뿐이고, 그리기는 육지로 자른다). 지도 밖(null·NaN·|위도| > 90)은 NaN. 경도는 감싸지 않은 값일 수 있다(±180 을 넘음).
 */
export function invertGrid(invert, width, height, { step = 2, block = 4, tol = 0.01, maxSpan = 60, forward = null, backTol = 0.5 } = {}) {
  const cols = Math.ceil(width / step), rows = Math.ceil(height / step);
  const n = cols * rows;
  const lon = new Float64Array(n).fill(NaN), lat = new Float64Array(n).fill(NaN);
  const inv = (x, y) => {
    let p = null;
    try { p = invert([x, y]); } catch { p = null; }
    return p && Number.isFinite(p[0]) && Number.isFinite(p[1]) && Math.abs(p[1]) <= 90 + 1e-6 ? p : null;
  };
  // 마디·가운데는 forward 로 되돌려 자리가 맞는지도 본다(로빈슨·이퀄어스는 지도 밖에서도 유한한 엉뚱한 값을 냄)
  const invC = !forward ? inv : (x, y) => {
    const p = inv(x, y);
    if (!p) return null;
    let q = null;
    try { q = forward(p); } catch { q = null; }
    return q && Math.abs(q[0] - x) <= backTol && Math.abs(q[1] - y) <= backTol ? p : null;
  };
  const nc = Math.floor((cols - 1) / block) + 2, nr = Math.floor((rows - 1) / block) + 2;
  const nLon = new Float64Array(nc * nr), nLat = new Float64Array(nc * nr);
  for (let b = 0; b < nr; b++) {
    for (let a = 0; a < nc; a++) {
      const p = invC((a * block + 0.5) * step, (b * block + 0.5) * step), k = b * nc + a;
      nLon[k] = p ? p[0] : NaN; nLat[k] = p ? p[1] : NaN;
    }
  }
  let exact = 0, skipped = 0;
  const half = block / 2;
  for (let b = 0; b < nr - 1; b++) {
    const j0 = b * block, j1 = Math.min(rows, j0 + block);
    if (j0 >= rows) break;
    for (let a = 0; a < nc - 1; a++) {
      const i0 = a * block, i1 = Math.min(cols, i0 + block);
      if (i0 >= cols) break;
      const k00 = b * nc + a, k10 = k00 + 1, k01 = k00 + nc, k11 = k01 + 1;
      const bad = Number.isNaN(nLon[k00]) + Number.isNaN(nLon[k10]) + Number.isNaN(nLon[k01]) + Number.isNaN(nLon[k11]);
      // 네 마디와 가운데가 모두 지도 밖이면 비워 둔다(세계 보기 지도 밖 여백을 표본마다 구하지 않게)
      if (bad === 4 && !invC((i0 + half + 0.5) * step, (j0 + half + 0.5) * step)) { skipped++; continue; }
      let ok = bad === 0;
      let l00, l10, l01, l11, t00, t10, t01, t11, tolB = tol;
      if (ok) {
        l00 = nLon[k00]; l10 = unwrap(nLon[k10], l00); l01 = unwrap(nLon[k01], l00); l11 = unwrap(nLon[k11], l00);
        t00 = nLat[k00]; t10 = nLat[k10]; t01 = nLat[k01]; t11 = nLat[k11];
        const spanL = Math.max(l00, l10, l01, l11) - Math.min(l00, l10, l01, l11);
        const spanT = Math.max(t00, t10, t01, t11) - Math.min(t00, t10, t01, t11);
        ok = spanL <= maxSpan && spanT <= maxSpan;
        // 허용 오차: tol(도)과 표본 간격의 1/4 중 큰 것(세계 보기는 한 표본이 0.7° 쯤이라 0.01° 는 너무 빡빡함)
        tolB = Math.max(tol, (0.25 * Math.max(spanL * Math.cos(((t00 + t11) * Math.PI) / 360), spanT)) / block);
      }
      if (ok) { // 칸 가운데 검사
        const c = invC((i0 + half + 0.5) * step, (j0 + half + 0.5) * step);
        if (!c) ok = false;
        else {
          const il = (l00 + l10 + l01 + l11) / 4, it = (t00 + t10 + t01 + t11) / 4;
          const dl = (unwrap(c[0], l00) - il) * Math.cos((c[1] * Math.PI) / 180);
          ok = Math.abs(dl) <= tolB && Math.abs(c[1] - it) <= tolB;
        }
      }
      if (ok) {
        for (let j = j0; j < j1; j++) {
          const v = (j - j0) / block;
          const la = l00 + (l01 - l00) * v, lb = l10 + (l11 - l10) * v;
          const ta = t00 + (t01 - t00) * v, tb = t10 + (t11 - t10) * v;
          let k = j * cols + i0;
          for (let i = i0; i < i1; i++, k++) {
            const u = (i - i0) / block;
            lon[k] = la + (lb - la) * u;
            lat[k] = ta + (tb - ta) * u;
          }
        }
      } else {
        exact++;
        for (let j = j0; j < j1; j++) {
          let k = j * cols + i0;
          for (let i = i0; i < i1; i++, k++) {
            const p = inv((i + 0.5) * step, (j + 0.5) * step);
            if (p) { lon[k] = p[0]; lat[k] = p[1]; }
          }
        }
      }
    }
  }
  return { cols, rows, step, lon, lat, exact, skipped };
}

/** 경위도 격자 → RGBA(out, 길이 cols·rows·4): 회색 = lut[표본], 지도 밖(NaN)은 투명. */
export function shadeGrid(grid, img, lut, out) {
  const { lon, lat } = grid, { width: iw, height: ih, data } = img;
  for (let k = 0, o = 0; k < lon.length; k++, o += 4) {
    const L = lon[k];
    if (Number.isNaN(L)) { out[o + 3] = 0; continue; }
    const g = lut[Math.round(sampleBilinear(data, iw, ih, L, lat[k]))];
    out[o] = g; out[o + 1] = g; out[o + 2] = g; out[o + 3] = 255;
  }
  return out;
}

/** 다음 격자 크기(px): 지난 계산이 예산을 넘으면 키우고(최대 max), 예산의 35% 보다 빠르면 줄인다(최소 min). */
export function nextStep(step, ms, { budget = RELIEF_BUDGET_MS, min = 2, max = 4 } = {}) {
  if (ms > budget) return Math.min(max, step + 1);
  if (ms < budget * 0.35) return Math.max(min, step - 1);
  return step;
}

// ---------- 브라우저 ----------

const loads = new Map();
/**
 * 음영 이미지를 불러와 회색 픽셀(R 채널)을 캐시한다. 실패(주소 오류·교차 출처로 픽셀을 못 읽음)하면 null 과 콘솔 경고 한 줄.
 * 같은 주소는 한 번만 불러온다(실패하면 다음 호출에서 다시 시도).
 */
export function loadRelief(url = RELIEF_URL) {
  if (loads.has(url)) return loads.get(url);
  const p = new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    const fail = (why) => { loads.delete(url); console.warn(`지형 음영 생략(${why}): ${url}`); resolve(null); };
    img.addEventListener('error', () => fail('불러오기 실패 — 주소 또는 교차 출처 허용(CORS) 헤더 확인'), { once: true });
    img.addEventListener('load', () => {
      try {
        const w = img.naturalWidth, hh = img.naturalHeight;
        if (!w || !hh) throw new Error('빈 이미지');
        const c = h('canvas');
        c.width = w; c.height = hh;
        const cx = c.getContext('2d', { willReadFrequently: true });
        cx.drawImage(img, 0, 0);
        const rgba = cx.getImageData(0, 0, w, hh).data; // 교차 출처로 막히면 SecurityError
        const grey = new Uint8Array(w * hh);
        for (let i = 0, o = 0; i < grey.length; i++, o += 4) grey[i] = rgba[o];
        c.width = c.height = 0;
        resolve({ width: w, height: hh, data: grey });
      } catch (err) {
        fail(err?.name === 'SecurityError' ? '교차 출처로 픽셀을 읽을 수 없음' : err?.message || String(err));
      }
    }, { once: true });
    img.src = url;
  });
  loads.set(url, p);
  return p;
}

let off = null, offCtx = null; // 1/step 크기 음영 그림(다시 씀)
const luts = new Map();
const lutOf = (style) => {
  const key = `${style.ref}|${style.gamma}`;
  if (!luts.has(key)) luts.set(key, reliefLut(style));
  return luts.get(key);
};

/** 음영 그리기(멈췄을 때 한 번). 육지(land, 10a 면 clipOutside 안의 under 도) 안에만 multiply 로 얹는다. */
export function drawRelief(ctx, projection, view, img, { land, under = null, path, clipOutside = null, step = 2, style = RELIEF_STYLE, clock = () => performance.now() } = {}) {
  const t0 = clock();
  if (!img || !land || !path || !view?.width || !view?.height) return null;
  const grid = invertGrid((p) => projection.invert(p), view.width, view.height, { step, forward: (ll) => projection(ll) });
  if (!off) { off = h('canvas'); offCtx = off.getContext('2d'); }
  if (off.width !== grid.cols || off.height !== grid.rows) { off.width = grid.cols; off.height = grid.rows; }
  const id = offCtx.createImageData(grid.cols, grid.rows);
  shadeGrid(grid, img, lutOf(style), id.data);
  offCtx.putImageData(id, 0, 0);
  const tShade = clock();
  // 지도 밖 표본(NaN)은 투명이라 drawImage 로 키울 때 지도 가장자리·구드 틈 언저리 반 칸이 반투명으로 섞인다. 곱하기를 옅게 할 뿐이고,
  // 그 자리는 육지 경로 자르기 밖(바다·지구 밖)이라 보이지 않는다.
  const blit = () => {
    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = style.opacity;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(off, 0, 0, grid.cols * step, grid.rows * step);
  };
  ctx.save();
  ctx.beginPath(); path(land); ctx.clip();
  blit();
  ctx.restore();
  if (under && clipOutside) {
    ctx.save();
    clipOutside();
    ctx.beginPath(); path(under); ctx.clip();
    blit();
    ctx.restore();
  }
  const t1 = clock();
  return { ms: t1 - t0, shadeMs: tShade - t0, blitMs: t1 - tShade, step, cols: grid.cols, rows: grid.rows, exact: grid.exact, skipped: grid.skipped };
}

/**
 * 렌더러 훅용 그리기 함수(setReliefDrawer 에 넘김). 지난 계산 시간으로 격자 크기를 고른다(nextStep, 2~4px).
 * fn.stats = 최근 계산 기록 [{ ms, shadeMs, blitMs, step, cols, rows, exact, skipped }].
 */
export function createReliefDrawer(img, { style = RELIEF_STYLE, budget = RELIEF_BUDGET_MS, clock } = {}) {
  let step = 2, warmed = false;
  const stats = [];
  const fn = (ctx, projection, view, extra = {}) => {
    const r = drawRelief(ctx, projection, view, img, { ...extra, step, style, ...(clock ? { clock } : {}) });
    if (!r) return;
    stats.push(r);
    if (stats.length > 60) stats.shift();
    // 첫 계산은 JIT 데우기·처음 할당이 섞여 느리므로 격자 크기 고르기에 쓰지 않는다
    if (warmed) step = nextStep(step, r.ms, { budget });
    warmed = true;
  };
  fn.stats = stats;
  return fn;
}

/**
 * 지도에 지형 음영 붙이기: 주소 고르기(개발 서버면 저장소 파일, 아니면 공개 주소) → loadRelief → createReliefDrawer → map.setReliefDrawer.
 * 불러오는 사이(또는 그 전에) 지도가 destroy 되면(map.destroyed) 붙이지 않는다. 돌려주는 값 = drawer(stats 확인용) | null(실패·destroy).
 */
export async function attachRelief(map, { url = import.meta.env?.DEV ? RELIEF_DEV_URL : RELIEF_URL, ...opts } = {}) {
  if (!map || map.destroyed) return null;
  const img = await loadRelief(url);
  if (!img || map.destroyed) return null;
  const drawer = createReliefDrawer(img, opts);
  map.setReliefDrawer(drawer);
  return drawer;
}
