// © 2026 김용현
// src/atlas/imageLayer.js — 이미지 레이어: 교과서 지도 투영으로 그려진 래스터(23쪽 밀도 음영 PNG, overlay-*.json)를 화면 투영으로 다시 그린다(캔버스).
//   imageLayer(id, { url, fit, bbox, width, height, bounds, legend, opacity, step }, { legend, map, layerId, legendRefresh, dimAlpha, onLoad, load })
//   loadImageData(url) → Promise<{width, height, data(RGBA)} | null>
// 렌더러 계약 {id, z, draw, hit, destroy} + layer.ready(Promise<boolean> — 불러오기 성공 여부, UI 가 실패를 보여 줄 때), layer.failed·loaded·stats.
// 규칙(EMBED_RULES.md): fetch 없이 new Image() + crossOrigin='anonymous'(같은 GitHub Pages 공개 주소, Access-Control-Allow-Origin: *).
import { h } from '../shared/dom.js';
import { invertGrid } from './relief.js';
import { makeFitForward } from './fitProject.js';
import { alphaOf, parseHex, nearestColor, legendItems, mapGridBlocks } from './layerStyle.js';
import { LAYER_Z, connect } from './layerCommon.js';

const images = new Map();
/**
 * 이미지 RGBA 불러오기(같은 주소는 한 번). 실패(주소·교차 출처로 픽셀을 못 읽음)면 null + 콘솔 경고 한 줄(다음 호출에서 다시 시도).
 * relief.js loadRelief 와 같은 방식(new Image + crossOrigin), 색 채널을 모두 남긴다.
 */
export function loadImageData(url) {
  if (images.has(url)) return images.get(url);
  const p = new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    const fail = (why) => { images.delete(url); console.warn(`이미지 레이어 생략(${why}): ${url}`); resolve(null); };
    img.addEventListener('error', () => fail('불러오기 실패 — 주소 또는 교차 출처 허용(CORS) 헤더 확인'), { once: true });
    img.addEventListener('load', () => {
      try {
        const w = img.naturalWidth, ih = img.naturalHeight;
        if (!w || !ih) throw new Error('빈 이미지');
        const c = h('canvas'); c.width = w; c.height = ih;
        const cx = c.getContext('2d', { willReadFrequently: true });
        cx.drawImage(img, 0, 0);
        const data = cx.getImageData(0, 0, w, ih).data; // 교차 출처로 막히면 SecurityError
        c.width = c.height = 0;
        resolve({ width: w, height: ih, data });
      } catch (err) {
        fail(err?.name === 'SecurityError' ? '교차 출처로 픽셀을 읽을 수 없음' : err?.message || String(err));
      }
    }, { once: true });
    img.src = url;
  });
  images.set(url, p);
  return p;
}

/**
 * 이미지 레이어(캔버스). 화면 step px 격자 → invertGrid(relief.js, 화면 투영 invert·되돌림 검사) → 경위도 → makeFitForward(fit) → 지면 pt → 이미지 화소(가까운 화소)
 * (투영식은 4표본 마디만 정확히, 칸 안은 보간 — mapGridBlocks). 1/step 크기 ImageData 를 오프스크린 캔버스에 넣고 drawImage 로 키워(부드럽게) opacity 로 얹는다.
 * 역투영 격자·이미지 화소 좌표는 보기(도법·중심 경도·변환 k,x,y·크기)마다 한 번만 계산해 둔다(렌더러는 전체 그림마다 view 객체를 새로 만들어
 * 객체가 아니라 값으로 비교) — 범례만 바뀐 다시 그리기는 화소만 다시 칠한다.
 * 범례 legend(분류 'd1'… = 범례 순서)가 한 단계만 고르면 다른 단계 화소는 dimAlpha 로 흐리게(불러올 때 화소마다 가장 가까운 범례 색을 미리 정함).
 * 불러오기 실패면 아무것도 안 그린다(layer.failed, layer.ready → false). 불러오면 map.refreshLayer(layerId)(map 이 없으면 onLoad()).
 */
export function imageLayer(id, { url, fit, bbox, bounds = null, legend: legendSpec = null, opacity = 0.85, step = 2 } = {},
  { legend = null, map = null, layerId = id, legendRefresh = true, dimAlpha = 0.15, onLoad = null, z = LAYER_Z.image, load = loadImageData } = {}) {
  if (!url || !fit || !bbox) throw new Error(`imageLayer ${id}: url·fit·bbox 필요`);
  const fwd = makeFitForward(fit);
  const palette = (legendSpec || []).map((e) => parseHex(e.color));
  const items = legendItems({ legend: legendSpec || [] });
  let img = null, cls = null, off = null, offCtx = null, destroyed = false;
  let cache = null; // {sig, grid, ix} — 같은 보기(도법·중심 경도·변환·크기)면 다시 쓴다
  const sigOf = (v) => `${v.key}|${v.centerLon}|${v.k}|${v.x}|${v.y}|${v.width}|${v.height}`;
  const stats = [];

  /** 보기마다 한 번: 역투영 격자 + 이미지 화소 좌표 */
  function sampling(view) {
    const sig = sigOf(view);
    if (cache && cache.sig === sig) return cache;
    const proj = view.projection, iw = img.width, ih = img.height;
    const grid = invertGrid((p) => proj.invert(p), view.width, view.height, { step, forward: (ll) => proj(ll) });
    const bw = bbox[2] - bbox[0], bh = bbox[3] - bbox[1];
    const toIdx = (ll) => { const pt = fwd(ll); return pt ? [((pt[0] - bbox[0]) / bw) * iw - 0.5, ((pt[1] - bbox[1]) / bh) * ih - 0.5] : null; };
    cache = { sig, grid, ix: mapGridBlocks(grid, toIdx, { block: 4, tol: 0.3 }) };
    return cache;
  }
  const layer = {
    id, z, meta: { url, approx: false }, legendItems: items, stats, failed: false, loaded: false, ready: null,
    draw(ctx, path, view) {
      if (!img || !view?.width || !view?.height) return;
      const rect = view.geoRect; // 화면 경위도 상자가 이미지 위도 범위와 안 겹치면 건너뜀
      if (rect && bounds && (rect[1] > bounds[3] || rect[3] < bounds[1])) return;
      const t0 = performance.now();
      const { grid, ix } = sampling(view);
      if (!off) { off = h('canvas'); offCtx = off.getContext('2d'); }
      if (off.width !== grid.cols || off.height !== grid.rows) { off.width = grid.cols; off.height = grid.rows; }
      const out = offCtx.createImageData(grid.cols, grid.rows);
      const o = out.data, { data, width: iw, height: ih } = img;
      // 활성 단계(묶음 고름도 맞게 isActive) — 하나라도 흐리면 화소마다 그 단계가 활성인지 본다
      const active = legend ? items.map((e) => legend.isActive(e.cls)) : null;
      const dimAny = !!active && active.some((a) => !a);
      for (let k = 0, q = 0; k < grid.lon.length; k++, q += 4) {
        const fx = ix.x[k];
        if (Number.isNaN(fx)) continue;
        const x = Math.round(fx), y = Math.round(ix.y[k]);
        if (x < 0 || y < 0 || x >= iw || y >= ih) continue;
        const pi = y * iw + x, s4 = pi * 4;
        const a = data[s4 + 3];
        if (!a) continue;
        o[q] = data[s4]; o[q + 1] = data[s4 + 1]; o[q + 2] = data[s4 + 2];
        o[q + 3] = dimAny && cls && !active[cls[pi]] ? a * dimAlpha : a;
      }
      offCtx.putImageData(out, 0, 0);
      ctx.globalAlpha = opacity;
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(off, 0, 0, grid.cols * step, grid.rows * step);
      stats.push(performance.now() - t0); if (stats.length > 60) stats.shift();
    },
    /** 화면 자리의 단계(범례 항목) → Feature 모양 {properties:{label, cls, color}} | null */
    hit(xy, lonlat) {
      if (!img || !lonlat || !cls) return null;
      const pt = fwd(lonlat);
      if (!pt) return null;
      const x = Math.round(((pt[0] - bbox[0]) / (bbox[2] - bbox[0])) * img.width - 0.5), y = Math.round(((pt[1] - bbox[1]) / (bbox[3] - bbox[1])) * img.height - 0.5);
      if (x < 0 || y < 0 || x >= img.width || y >= img.height) return null;
      const pi = y * img.width + x;
      if (img.data[pi * 4 + 3] < 128) return null;
      const e = items[cls[pi]];
      if (!e || alphaOf(legend, e.cls, 0) === 0) return null;
      return { type: 'Feature', properties: { label: e.label, cls: e.cls, color: e.color }, geometry: null };
    },
    destroy() { destroyed = true; cache = null; offs.forEach((f) => f()); offs.length = 0; },
  };
  const offs = connect({ map, legend, layerId, legendRefresh });
  layer.ready = Promise.resolve()
    .then(() => load(url))
    .catch((err) => { console.warn(`이미지 레이어 생략(${err?.message || err}): ${url}`); return null; })
    .then((r) => {
      if (!r) { layer.failed = true; return false; }
      if (destroyed) return false;
      img = r;
      if (palette.length) { // 화소마다 가장 가까운 범례 단계(흐리게·맞히기용)
        cls = new Uint8Array(r.width * r.height);
        for (let i = 0, j = 0; i < cls.length; i++, j += 4) cls[i] = r.data[j + 3] ? nearestColor([r.data[j], r.data[j + 1], r.data[j + 2]], palette) : 0;
      }
      layer.loaded = true;
      if (map && !map.destroyed) map.refreshLayer(layerId); else onLoad?.();
      return true;
    });
  return layer;
}
