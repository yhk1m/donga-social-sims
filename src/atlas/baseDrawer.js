// © 2026 김용현
// src/atlas/baseDrawer.js — 바탕 색 그리기의 공통 틀(고도 색 tint.js · 자연색 natural.js 가 얇게 얹음, 품질 검토).
//
//   loadImagePixels(url, { label, decode }) → Promise<{ width, height, data } | null>
//       등장방형 화상을 new Image()(crossOrigin anonymous)로 불러 RGBA 를 decode(rgba, w, h) 로 바꿔 주소마다 캐시한다.
//       실패하면 콘솔 경고 한 줄 「{label} 생략(까닭): 주소」 + null, 캐시에서 빼므로 다음 호출이 다시 시도한다.
//   releaseImagePixels(url) — 캐시에서 뺀다(풀린 배열은 붙은 drawer 가 놓으면 GC). 자연색 RGBA 는 32 MB 라 지도를 아주 버릴 때 부른다.
//   createGridDrawer({ fill, clock, step }) → fn(ctx, projection, view, extra)   렌더러 훅(setTintDrawer·setNaturalDrawer)
//       fill(grid, seaRGBA, landRGBA, extra) 가 격자 표본마다 두 장(바다용·육지용)을 채운다(extra.selection = 고도 색 단계 고르기 — 값이 바뀌면 다시 채움). 'sea' 단계에서 한 번 계산해 두고 'land' 단계가 그대로 쓴다
//       (같은 view·같은 투영이면 — 그림 하나에 한 번). 격자는 렌더러의 공유 격자(extra.grid)를 쓰고, 없으면 혼자 step 2 로 invertGrid.
//       cols·rows 가 그대로면 캔버스·ImageData 를 다시 쓴다. fn.stats = [{ ms, step, cols, rows }](최근 60).
//       그리는 차례: sea = 지구 자르기(clipSphere) 안에 바다용 / land = 육지 경로 안에 육지용 → (10a 면) 단원 상자 밖 under 안에 육지용 →
//       상자 테두리 메우기(seal — 육지용 그림을 무늬로, 화면 좌표 = 그림 × step).
//   attachImageDrawer(map, { url, load, create, set }) → Promise<drawer | null>
//       load(url) → create(img) → map[set](drawer). 불러오는 사이(또는 그 전에) 지도가 destroy 되면 붙이지 않고 null.
import { h } from '../shared/dom.js';
import { invertGrid } from './relief.js';

const loads = new Map();

export function loadImagePixels(url, { label = '이미지', decode = (rgba) => rgba } = {}) {
  if (loads.has(url)) return loads.get(url);
  const p = new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    const fail = (why) => { loads.delete(url); console.warn(`${label} 생략(${why}): ${url}`); resolve(null); };
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
        const data = decode(rgba, w, hh);
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

/** 풀어 둔 화상 캐시에서 뺀다(같은 주소를 다시 부르면 새로 불러옴). 돌려주는 값 = 있었는지. */
export function releaseImagePixels(url) { return loads.delete(url); }

export function createGridDrawer({ fill, clock = () => performance.now(), step: ownStep = 2 }) {
  let cache = null;
  let offS = null, offL = null, ids = null, idl = null;
  const stats = [];
  function compute(projection, view, gridOf, extra) {
    const selKey = extra?.selection?.length ? extra.selection.join(',') : '';
    if (cache && cache.view === view && cache.projection === projection && cache.selKey === selKey) return cache;
    const t0 = clock();
    const grid = gridOf ? gridOf() : invertGrid((p) => projection.invert(p), view.width, view.height, { step: ownStep, forward: (ll) => projection(ll) });
    if (!offS) { offS = h('canvas'); offL = h('canvas'); }
    const cs = offS.getContext('2d'), cl = offL.getContext('2d');
    if (!ids || ids.width !== grid.cols || ids.height !== grid.rows) { // 크기가 그대로면 캔버스·ImageData 를 다시 씀(채우기가 모든 화소를 덮어씀)
      for (const c of [offS, offL]) { c.width = grid.cols; c.height = grid.rows; }
      ids = cs.createImageData(grid.cols, grid.rows); idl = cl.createImageData(grid.cols, grid.rows);
    }
    fill(grid, ids.data, idl.data, extra);
    cs.putImageData(ids, 0, 0); cl.putImageData(idl, 0, 0);
    const ms = clock() - t0;
    cache = { view, projection, selKey, step: grid.step, cols: grid.cols, rows: grid.rows, ms };
    stats.push({ ms, step: grid.step, cols: grid.cols, rows: grid.rows });
    if (stats.length > 60) stats.shift();
    return cache;
  }
  const fn = (ctx, projection, view, { phase, land, under = null, path, clipOutside = null, clipSphere = null, seal = null, grid = null, selection = null } = {}) => {
    if (!view?.width || !view?.height || !path) return;
    const c = compute(projection, view, grid, { selection });
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
    ctx.drawImage(offL, 0, 0, W, H);
    ctx.restore();
    if (under && clipOutside) {
      ctx.save();
      clipOutside();
      ctx.beginPath(); path(under); ctx.clip();
      ctx.drawImage(offL, 0, 0, W, H);
      ctx.restore();
      if (seal && ctx.createPattern) {
        const pat = ctx.createPattern(offL, 'no-repeat');
        if (pat?.setTransform && typeof DOMMatrix === 'function') pat.setTransform(new DOMMatrix([c.step, 0, 0, c.step, 0, 0]));
        if (pat) seal(pat);
      }
    }
  };
  fn.stats = stats;
  return fn;
}

export async function attachImageDrawer(map, { url, load, create, set }) {
  if (!map || map.destroyed) return null;
  const img = await load(url);
  if (!img || map.destroyed) return null;
  const drawer = create(img);
  map[set](drawer);
  return drawer;
}
