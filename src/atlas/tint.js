// © 2026 김용현
// src/atlas/tint.js — 고도 색(E2 대조 반영, 교사 요청): 교과서 16쪽 일반도처럼 육지는 높이, 바다는 깊이 단계마다 색을 칠한다.
//
//   const img = await loadTint(url)                 // { width, height, data: Uint8Array(분류 번호) } | null(실패 → 콘솔 한 줄, 지도는 고도 색 없이)
//   map.setTintDrawer(createTintDrawer(img))        // 렌더러가 멈출 때 fn(ctx, projection, view, { phase:'sea'|'land', land, under, path, clipOutside, clipSphere, seal })
//   attachTint(map, { url }) → Promise<drawer | null> // 위 둘을 한 번에(주소 고르기·destroy 지킴)
//   TINT — 분류 표(build_tint.py 설정 tint 와 같음 — tests 가 견줌), tintClassOf(높이, 육지, 빙하) → 번호, tintLegend() → 범례 줄
//
// 자료: docs/assets/atlas/common/tint-4096.png — ETOPO 2022 60″ 표면 높이(NOAA NCEI, public domain)를 Natural Earth 10m 육지·빙하로 나눠
//   분류 번호 × 12 의 회색으로 담은 등장방형 4096×2048(relief-4096.jpg 와 같은 격자). build_tint.py 가 만든다.
// 그리는 법: relief.js 와 같은 화면 격자 역투영(gridFor — 같은 그림 안에서 음영과 격자를 나눠 씀) → 표본마다 이웃 네 화소의 분류 색을 양선형으로 섞어
//   1/step 크기 그림 두 장(바다용·육지용). 바다용 표는 육지 분류를 가장 얕은 바다색으로, 육지용 표는 바다 분류를 가장 낮은 땅 색(0~100 m)으로 바꿔
//   해안선은 언제나 벡터 해안선이 정한다(분류 화상의 해안 어긋남이 보이지 않음). 바다 그림은 바다를 칠한 직후 지구 안에(육지가 위에 덮음),
//   육지 그림은 육지를 칠한 직후 육지 경로 안에(10a 일 때 단원 상자 밖은 clipOutside 안의 50m 육지) 그리고, 그 위에 지형 음영(곱하기)이 얹힌다.
//   10a ↔ 50m 상자 테두리(D5 sealUnitSeam)는 고도 색 그림을 무늬로 한 번 더 그어 메운다(seal).
// 규칙(EMBED_RULES.md): fetch 없이 new Image() + crossOrigin='anonymous'(음영과 같은 공개 Pages 주소, 교사 승인 예외).
import { h } from '../shared/dom.js';
import { gridFor, nextStep } from './relief.js';

export const TINT_URL = 'https://yhk1m.github.io/donga-social-sims/assets/atlas/common/tint-4096.png';
/** 개발 서버(vite, 저장소 루트가 root)에서 쓰는 같은 파일 */
export const TINT_DEV_URL = '/docs/assets/atlas/common/tint-4096.png';
export const TINT_BUDGET_MS = 150;

/** 분류 표 — scripts/atlas/config/u2.json tint 와 같은 값(교과서 16쪽 범례 견본 색). */
export const TINT = Object.freeze({
  codeStep: 12,
  landBreaks: [0, 100, 200, 500, 1000, 2000, 3000, 4000, 5000],
  landColors: ['#88b986', '#c4df9f', '#deeaae', '#f0f3c5', '#f7e1ad', '#efd2a1', '#e9c58f', '#e0b77f', '#d7ad70', '#cfa361'],
  glacierColor: '#ffffff',
  seaBreaks: [200, 1000, 2000, 4000, 6000, 8000],
  seaColors: ['#d4effc', '#c9e7f9', '#b1dcf6', '#96d0f1', '#7ac3ec', '#62bae9', '#3baee3'],
});

// ---------- 순수 함수 ----------
const S = TINT.seaColors.length - 1;           // 마지막 바다 번호
export const BELOW = S + 1;                     // 해수면보다 낮은 땅
export const LAND0 = S + 2;                     // 0~100 m
export const GLACIER = LAND0 + TINT.landBreaks.length; // 빙하
export const CLASS_COUNT = GLACIER + 1;

/** 분류 번호 → {kind, lo, hi, color}(build_tint.py classes 와 같은 차례). lo ≤ 값 < hi, 바다는 깊이(m). */
export function tintClasses(t = TINT) {
  const out = [];
  const sb = [0, ...t.seaBreaks];
  t.seaColors.forEach((color, i) => out.push({ kind: 'sea', lo: sb[i], hi: sb[i + 1] ?? null, color }));
  out.push({ kind: 'below', lo: null, hi: 0, color: t.landColors[0] });
  t.landColors.slice(1).forEach((color, i) => out.push({ kind: 'land', lo: t.landBreaks[i], hi: t.landBreaks[i + 1] ?? null, color }));
  out.push({ kind: 'glacier', lo: null, hi: null, color: t.glacierColor });
  return out;
}

/** 높이(m)·육지·빙하 → 분류 번호(build_tint.py classify 와 같은 규칙) */
export function tintClassOf(elev, land, glacier = false, t = TINT) {
  if (land && glacier) return LAND0 + t.landBreaks.length;
  if (land) {
    if (elev < 0) return BELOW;
    let i = 0; while (i + 1 < t.landBreaks.length && elev >= t.landBreaks[i + 1]) i++;
    return LAND0 + i;
  }
  if (elev >= 0) return 0;
  const d = -elev;
  let i = 0; while (i < t.seaBreaks.length && d >= t.seaBreaks[i]) i++;
  return i;
}

/** PNG 회색 → 분류 번호(반올림 — 색 관리로 한두 단계 어긋나도 되찾음), 범위 밖은 마지막 번호로 자름 */
export const decodeClass = (grey, step = TINT.codeStep) => Math.min(CLASS_COUNT - 1, Math.max(0, Math.round(grey / step)));

const rgbOf = (hex) => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
/**
 * 색 표 두 장(번호 × 3 RGB): land = 육지 안에 칠할 표(바다 번호 → 0~100 m 색), sea = 바다에 칠할 표(육지·빙하 번호 → 0~200 m 바다색).
 * 해안선은 벡터가 정하므로 분류 화상과 해안이 어긋난 화소는 반대쪽 가장 가까운 단계 색으로 보인다.
 */
export function tintLuts(t = TINT) {
  const cls = tintClasses(t);
  const land = new Uint8Array(cls.length * 3), sea = new Uint8Array(cls.length * 3);
  const lowLand = rgbOf(t.landColors[1]), shallow = rgbOf(t.seaColors[0]);
  cls.forEach((c, i) => {
    const rgb = rgbOf(c.color);
    land.set(c.kind === 'sea' ? lowLand : rgb, i * 3);
    sea.set(c.kind === 'sea' ? rgb : shallow, i * 3);
  });
  return { land, sea };
}

const fmtM = (v) => v.toLocaleString('en-US');
/**
 * 범례 줄(교과서 16쪽 상자처럼 위 → 아래): 빙하 · 5,000 이상 … 0~100 · 해수면 아래 땅 · 0~200 바다 … 8,000 이상.
 * 줄마다 { color, kind, top(줄 위 경계 글자 | null), title, label? }. 경계 글자는 칸과 칸 사이(교과서처럼 칸 윗선에 붙임).
 */
export function tintLegend(t = TINT) {
  const rows = [{ color: t.glacierColor, kind: 'glacier', top: null, label: '빙하', title: '빙하' }];
  const lb = t.landBreaks;
  for (let i = t.landColors.length - 1; i >= 1; i--) {
    const lo = lb[i - 1], hi = lb[i] ?? null;
    rows.push({ color: t.landColors[i], kind: 'land', top: hi == null ? null : fmtM(hi), title: hi == null ? `${fmtM(lo)} m 이상` : `${fmtM(lo)}~${fmtM(hi)} m` });
  }
  rows.push({ color: t.landColors[0], kind: 'below', top: '0', title: '해수면보다 낮은 땅', label: '해수면 아래' });
  const sb = [0, ...t.seaBreaks];
  t.seaColors.forEach((color, i) => rows.push({
    color, kind: 'sea', top: i === 0 ? null : fmtM(sb[i]), title: sb[i + 1] == null ? `깊이 ${fmtM(sb[i])} m 이상` : `깊이 ${fmtM(sb[i])}~${fmtM(sb[i + 1])} m`,
  }));
  return rows;
}

/**
 * 경위도 격자(invertGrid 결과) → 바다용·육지용 RGBA 두 장. 표본마다 이웃 네 화소의 분류 색(표)을 양선형으로 섞는다(가로는 날짜변경선을 건너 감쌈).
 * 지도 밖(NaN)은 투명. img = { width, height, data: 분류 번호 }.
 */
export function tintGrid(grid, img, luts, outSea, outLand) {
  const { lon, lat } = grid, { width: iw, height: ih, data } = img;
  const L = luts.land, Sx = luts.sea;
  for (let k = 0, o = 0; k < lon.length; k++, o += 4) {
    const lo = lon[k];
    if (Number.isNaN(lo)) { outSea[o + 3] = 0; outLand[o + 3] = 0; continue; }
    let u = (lo + 180) / 360; u -= Math.floor(u);
    const fx = u * iw - 0.5;
    let fy = ((90 - lat[k]) / 180) * ih - 0.5;
    if (fy < 0) fy = 0; else if (fy > ih - 1) fy = ih - 1;
    const xf = Math.floor(fx), tx = fx - xf;
    const x0 = xf < 0 ? iw - 1 : xf, x1 = xf + 1 >= iw ? 0 : xf + 1;
    const y0 = Math.floor(fy), ty = fy - y0;
    const r0 = y0 * iw, r1 = (y0 + 1 < ih ? y0 + 1 : y0) * iw;
    const c00 = data[r0 + x0] * 3, c10 = data[r0 + x1] * 3, c01 = data[r1 + x0] * 3, c11 = data[r1 + x1] * 3;
    const w00 = (1 - tx) * (1 - ty), w10 = tx * (1 - ty), w01 = (1 - tx) * ty, w11 = tx * ty;
    for (let ch = 0; ch < 3; ch++) {
      outSea[o + ch] = Sx[c00 + ch] * w00 + Sx[c10 + ch] * w10 + Sx[c01 + ch] * w01 + Sx[c11 + ch] * w11;
      outLand[o + ch] = L[c00 + ch] * w00 + L[c10 + ch] * w10 + L[c01 + ch] * w01 + L[c11 + ch] * w11;
    }
    outSea[o + 3] = 255; outLand[o + 3] = 255;
  }
}

// ---------- 브라우저 ----------
const loads = new Map();
/** 분류 화상을 불러와 번호(R 채널 ÷ codeStep)를 캐시한다. 실패하면 null + 콘솔 경고 한 줄(지도는 고도 색 없이 그대로). 같은 주소는 한 번만. */
export function loadTint(url = TINT_URL) {
  if (loads.has(url)) return loads.get(url);
  const p = new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    const fail = (why) => { loads.delete(url); console.warn(`고도 색 생략(${why}): ${url}`); resolve(null); };
    img.addEventListener('error', () => fail('불러오기 실패 — 주소 또는 교차 출처 허용(CORS) 헤더 확인'), { once: true });
    img.addEventListener('load', () => {
      try {
        const w = img.naturalWidth, hh = img.naturalHeight;
        if (!w || !hh) throw new Error('빈 이미지');
        const c = h('canvas');
        c.width = w; c.height = hh;
        const cx = c.getContext('2d', { willReadFrequently: true });
        cx.drawImage(img, 0, 0);
        const rgba = cx.getImageData(0, 0, w, hh).data;
        const data = new Uint8Array(w * hh);
        for (let i = 0, o = 0; i < data.length; i++, o += 4) data[i] = decodeClass(rgba[o]);
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
 * 렌더러 훅용(setTintDrawer). 'sea' 단계에서 두 장을 한 번에 계산해 두고(같은 view·격자면) 'land' 단계가 그대로 쓴다.
 * fn.stats = 최근 계산 기록 [{ ms, step, cols, rows }]. 격자 크기는 음영처럼 지난 계산 시간으로(nextStep).
 */
export function createTintDrawer(img, { budget = TINT_BUDGET_MS, clock = () => performance.now(), luts = tintLuts() } = {}) {
  let step = 2, warmed = false, cache = null; // cache: { view, step, sea, land, cols, rows }
  let offS = null, offL = null;
  const stats = [];
  function compute(projection, view) {
    if (cache && cache.view === view && cache.step === step) return cache;
    const t0 = clock();
    const grid = gridFor(projection, view, step);
    if (!offS) { offS = h('canvas'); offL = h('canvas'); }
    for (const c of [offS, offL]) if (c.width !== grid.cols || c.height !== grid.rows) { c.width = grid.cols; c.height = grid.rows; }
    const cs = offS.getContext('2d'), cl = offL.getContext('2d');
    const ds = cs.createImageData(grid.cols, grid.rows), dl = cl.createImageData(grid.cols, grid.rows);
    tintGrid(grid, img, luts, ds.data, dl.data);
    cs.putImageData(ds, 0, 0); cl.putImageData(dl, 0, 0);
    const ms = clock() - t0;
    cache = { view, step, cols: grid.cols, rows: grid.rows, ms };
    stats.push({ ms, step, cols: grid.cols, rows: grid.rows });
    if (stats.length > 60) stats.shift();
    if (warmed) step = nextStep(step, ms, { budget });
    warmed = true;
    return cache;
  }
  const fn = (ctx, projection, view, { phase, land, under = null, path, clipOutside = null, clipSphere = null, seal = null } = {}) => {
    if (!img || !view?.width || !view?.height || !path) return;
    const c = compute(projection, view);
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
      // 10a ↔ 50m 상자 테두리: 고도 색 그림을 무늬로 그어 메운다(무늬 좌표 = 화면, 그림을 step 배로)
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

/**
 * 지도에 고도 색 붙이기: 주소 고르기(개발 서버면 저장소 파일, 아니면 공개 주소) → loadTint → createTintDrawer → map.setTintDrawer.
 * 불러오는 사이 지도가 destroy 되면 붙이지 않는다. 실패하면 null(지도는 고도 색 없이 그대로 — 켜도 바뀌지 않음).
 */
export async function attachTint(map, { url = import.meta.env?.DEV ? TINT_DEV_URL : TINT_URL, ...opts } = {}) {
  if (!map || map.destroyed) return null;
  const img = await loadTint(url);
  if (!img || map.destroyed) return null;
  const drawer = createTintDrawer(img, opts);
  map.setTintDrawer(drawer);
  return drawer;
}
