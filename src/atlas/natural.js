// © 2026 김용현
// src/atlas/natural.js — 자연색 지형(교사 요청 「20쪽 지형은 교과서처럼」): 교과서 20쪽 지형 지도처럼 Natural Earth 자연색 음영기복 화상을 바탕에 칠한다.
//
//   const img = await loadNatural(url)                // { width, height, data: Uint8ClampedArray(RGBA) } | null(실패 → 콘솔 한 줄, 지도는 자연색 없이)
//   map.setNaturalDrawer(createNaturalDrawer(img))    // 렌더러가 멈출 때 fn(ctx, projection, view, { phase:'sea'|'land', land, under, path, clipOutside, clipSphere, seal, grid })
//   attachNatural(map, { url }) → Promise<drawer | null>  // 위 둘을 한 번에(주소 고르기·destroy 지킴)
//
// 자료: docs/assets/atlas/common/natural-4096.jpg — Natural Earth II with Shaded Relief and Water 1:50m(public domain)을 relief-4096.jpg 와 같은
//   등장방형 4096×2048 로 줄인 것(build_natural.py). 화상에 음영·바다·빙하가 다 들어 있다.
// 그리는 법: 고도 색(tint.js)과 같은 틀 — 렌더러의 공유 격자(extra.grid, 음영·고도 색과 같은 격자·크기, 그림마다 한 번)로 표본마다 RGB 를 양선형으로
//   뽑아 1/step 크기 그림(육지용·바다용)을 만들고, 바다를 칠한 직후 지구 안에, 육지를 칠한 직후 육지 안(10a 면 상자 밖 50m 도, 상자 테두리 메우기)에 같은 그림을
//   다시 그린다(벡터 바다·육지 칠이 화상을 가리지 않음). 바다용 그림은 흰색을 seaFade 만큼 섞어 교과서처럼 옅게(같은 표본에서 두 장),
//   육지용은 그대로이므로 옅은 바다와 짙은 땅의 경계 = 벡터 해안선. 채도는 saturate 배(교과서 육지 색이 원본보다 짙음).
// 규칙(EMBED_RULES.md): fetch 없이 new Image() + crossOrigin='anonymous'(음영과 같은 공개 Pages 주소).
import { h } from '../shared/dom.js';
import { invertGrid } from './relief.js';

export const NATURAL_URL = 'https://yhk1m.github.io/donga-social-sims/assets/atlas/common/natural-4096.jpg';
/** 개발 서버(vite, 저장소 루트가 root)에서 쓰는 같은 파일 */
export const NATURAL_DEV_URL = '/docs/assets/atlas/common/natural-4096.jpg';
export const NATURAL_CREDIT = '자연색 지형: Natural Earth II (naturalearthdata.com, 공공 저작물)';
/**
 * 모양값(교과서 20쪽에 맞춤): saturate = 채도 배수(교과서 육지 초록·황토가 원본 화상보다 짙음), seaFade = 바다를 흰색으로 덮는 정도
 * (교과서 바다는 아주 옅은 파랑 — 화상 바다 위에 흰색을 이만큼, 해안선은 벡터가 정함: 육지 안은 덮지 않은 그림).
 */
export const NATURAL_STYLE = Object.freeze({ saturate: 1.3, seaFade: 0.55 });

/** 바탕 색 방식(지도 도구 한 단추 묶음): 없음 · 고도 색(tint.js) · 자연색(이 파일). 렌더러 옵션 { tint, natural } 두 개로 담는다. */
export const BASE_MODES = Object.freeze([['none', '없음', '바탕 색 없음(옅은 바탕 + 음영)'], ['tint', '고도 색', '교과서 일반도처럼 높이·깊이에 따라 색(범례는 사이드바)'], ['natural', '자연색', '교과서 20쪽 지형처럼 자연색 위성 느낌 화상(Natural Earth)']]);
/** 렌더러 옵션 → 방식(자연색이 앞섬) */
export const baseModeOf = (o = {}) => (o.natural ? 'natural' : o.tint ? 'tint' : 'none');
/** 방식 → 렌더러 옵션(모르는 값은 없음) */
export const baseOptions = (mode) => ({ tint: mode === 'tint', natural: mode === 'natural' });

/**
 * 경위도 격자(invertGrid 결과) → RGBA(out). 표본마다 화상 RGB 를 양선형으로(가로는 날짜변경선을 건너 감싸고, 세로는 첫·끝 행으로 자름).
 * 지도 밖(NaN)은 투명. img = { width, height, data: RGBA(길이 w·h·4) }.
 */
export function naturalGrid(grid, img, out, { saturate = 1, seaFade = 0 } = {}, outSea = null) {
  const keep = 1 - seaFade, add = 255 * seaFade;
  const { lon, lat } = grid, { width: iw, height: ih, data } = img;
  for (let k = 0, o = 0; k < lon.length; k++, o += 4) {
    const lo = lon[k];
    if (Number.isNaN(lo)) { out[o + 3] = 0; if (outSea) outSea[o + 3] = 0; continue; }
    let u = (lo + 180) / 360; u -= Math.floor(u);
    const fx = u * iw - 0.5;
    let fy = ((90 - lat[k]) / 180) * ih - 0.5;
    if (fy < 0) fy = 0; else if (fy > ih - 1) fy = ih - 1;
    const xf = Math.floor(fx), tx = fx - xf;
    const x0 = xf < 0 ? iw - 1 : xf, x1 = xf + 1 >= iw ? 0 : xf + 1;
    const y0 = Math.floor(fy), ty = fy - y0;
    const y1 = y0 + 1 < ih ? y0 + 1 : y0;
    const a = (y0 * iw + x0) * 4, b = (y0 * iw + x1) * 4, c = (y1 * iw + x0) * 4, d = (y1 * iw + x1) * 4;
    const w00 = (1 - tx) * (1 - ty), w10 = tx * (1 - ty), w01 = (1 - tx) * ty, w11 = tx * ty;
    let r = data[a] * w00 + data[b] * w10 + data[c] * w01 + data[d] * w11;
    let g = data[a + 1] * w00 + data[b + 1] * w10 + data[c + 1] * w01 + data[d + 1] * w11;
    let bl = data[a + 2] * w00 + data[b + 2] * w10 + data[c + 2] * w01 + data[d + 2] * w11;
    if (saturate !== 1) { // 밝기(Rec. 601)는 그대로 두고 회색에서 멀어지게
      const y = 0.299 * r + 0.587 * g + 0.114 * bl;
      r = y + (r - y) * saturate; g = y + (g - y) * saturate; bl = y + (bl - y) * saturate;
    }
    out[o] = r; out[o + 1] = g; out[o + 2] = bl; // Uint8ClampedArray 가 0~255 로 자르고 반올림
    out[o + 3] = 255;
    if (outSea) { // 바다용: 흰색을 seaFade 만큼 섞은 옅은 그림(교과서 바다)
      outSea[o] = out[o] * keep + add; outSea[o + 1] = out[o + 1] * keep + add; outSea[o + 2] = out[o + 2] * keep + add; outSea[o + 3] = 255;
    }
  }
  return out;
}

// ---------- 브라우저 ----------
const loads = new Map();
/** 자연색 화상을 불러와 RGBA 를 캐시한다. 실패하면 null + 콘솔 경고 한 줄(지도는 자연색 없이 그대로). 같은 주소는 한 번만. */
export function loadNatural(url = NATURAL_URL) {
  if (loads.has(url)) return loads.get(url);
  const p = new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    const fail = (why) => { loads.delete(url); console.warn(`자연색 지형 생략(${why}): ${url}`); resolve(null); };
    img.addEventListener('error', () => fail('불러오기 실패 — 주소 또는 교차 출처 허용(CORS) 헤더 확인'), { once: true });
    img.addEventListener('load', () => {
      try {
        const w = img.naturalWidth, hh = img.naturalHeight;
        if (!w || !hh) throw new Error('빈 이미지');
        const c = h('canvas');
        c.width = w; c.height = hh;
        const cx = c.getContext('2d', { willReadFrequently: true });
        cx.drawImage(img, 0, 0);
        const data = cx.getImageData(0, 0, w, hh).data; // 교차 출처로 막히면 SecurityError
        c.width = c.height = 0;
        resolve({ width: w, height: hh, data });
      } catch (err) {
        fail(err?.name === 'SecurityError' ? '교차 출처로 픽셀을 읽을 수 없음' : err?.message || String(err));
      }
    }, { once: true });
    img.src = url;
  });
  loads.set(url, p);
  return p;
}

/**
 * 렌더러 훅용(setNaturalDrawer). 'sea' 단계에서 그림 두 장(바다용·육지용)을 계산해 두고 'land' 단계가 그대로 쓴다(같은 view·같은 격자면 — 그림 하나에 한 번).
 * 격자와 그 크기는 렌더러의 공유 격자(extra.grid)가 정한다. 혼자 쓰면 step 2. fn.stats = 최근 계산 기록 [{ ms, step, cols, rows }].
 */
export function createNaturalDrawer(img, { clock = () => performance.now(), step: ownStep = 2, style = NATURAL_STYLE } = {}) {
  let cache = null;
  let off = null, offS = null;
  const stats = [];
  function compute(projection, view, gridOf) {
    if (cache && cache.view === view && cache.projection === projection) return cache;
    const t0 = clock();
    const grid = gridOf ? gridOf() : invertGrid((p) => projection.invert(p), view.width, view.height, { step: ownStep, forward: (ll) => projection(ll) });
    if (!off) { off = h('canvas'); offS = h('canvas'); }
    for (const c of [off, offS]) if (c.width !== grid.cols || c.height !== grid.rows) { c.width = grid.cols; c.height = grid.rows; }
    const cx = off.getContext('2d'), cs = offS.getContext('2d');
    const id = cx.createImageData(grid.cols, grid.rows), ids = cs.createImageData(grid.cols, grid.rows);
    naturalGrid(grid, img, id.data, style, ids.data);
    cx.putImageData(id, 0, 0); cs.putImageData(ids, 0, 0);
    const ms = clock() - t0;
    cache = { view, projection, step: grid.step, cols: grid.cols, rows: grid.rows, ms };
    stats.push({ ms, step: grid.step, cols: grid.cols, rows: grid.rows });
    if (stats.length > 60) stats.shift();
    return cache;
  }
  const fn = (ctx, projection, view, { phase, land, under = null, path, clipOutside = null, clipSphere = null, seal = null, grid = null } = {}) => {
    if (!img || !view?.width || !view?.height || !path) return;
    const c = compute(projection, view, grid);
    const W = c.cols * c.step, H = c.rows * c.step;
    ctx.imageSmoothingEnabled = true;
    if (phase === 'sea') {
      ctx.save();
      if (clipSphere) clipSphere();
      ctx.drawImage(offS, 0, 0, W, H);
      ctx.restore();
      return;
    }
    if (phase !== 'land' || !land) return;
    ctx.save();
    ctx.beginPath(); path(land); ctx.clip();
    ctx.drawImage(off, 0, 0, W, H);
    ctx.restore();
    if (under && clipOutside) {
      ctx.save();
      clipOutside();
      ctx.beginPath(); path(under); ctx.clip();
      ctx.drawImage(off, 0, 0, W, H);
      ctx.restore();
      if (seal && ctx.createPattern) {
        const pat = ctx.createPattern(off, 'no-repeat');
        if (pat?.setTransform && typeof DOMMatrix === 'function') pat.setTransform(new DOMMatrix([c.step, 0, 0, c.step, 0, 0]));
        if (pat) seal(pat);
      }
    }
  };
  fn.stats = stats;
  return fn;
}

/**
 * 지도에 자연색 붙이기: 주소 고르기(개발 서버면 저장소 파일, 아니면 공개 주소) → loadNatural → createNaturalDrawer → map.setNaturalDrawer.
 * 불러오는 사이 지도가 destroy 되면 붙이지 않는다. 실패하면 null(지도는 자연색 없이 그대로). 화상이 커서(1 MB, 풀면 32 MB) 처음 자연색을 켤 때 부른다.
 */
export async function attachNatural(map, { url = import.meta.env?.DEV ? NATURAL_DEV_URL : NATURAL_URL, ...opts } = {}) {
  if (!map || map.destroyed) return null;
  const img = await loadNatural(url);
  if (!img || map.destroyed) return null;
  const drawer = createNaturalDrawer(img, opts);
  map.setNaturalDrawer(drawer);
  return drawer;
}
