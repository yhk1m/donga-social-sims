// © 2026 김용현
// src/atlas/tint.js — 고도 색(E2 대조 반영, 교사 요청): 교과서 16쪽 일반도처럼 육지는 높이, 바다는 깊이 단계마다 색을 칠한다.
//
//   const img = await loadTint(url)                 // { width, height, data: Uint8Array(분류 번호) } | null(실패 → 콘솔 한 줄, 지도는 고도 색 없이)
//   map.setTintDrawer(createTintDrawer(img))        // 렌더러가 멈출 때 fn(ctx, projection, view, { phase:'sea'|'land', land, under, path, clipOutside, clipSphere, seal })
//   attachTint(map, { url }) → Promise<drawer | null> // 위 둘을 한 번에(주소 고르기·destroy 지킴)
//   TINT — 분류 표(build_tint.py 설정 tint 와 같음 — tests 가 견줌), tintClassOf(높이, 육지, 빙하) → 번호, tintLegend() → 범례 줄(cls = 분류 번호)
//   단계 고르기(교사 요청 2026-10-20 「해발고도 특정 구간을 선택하면 그 구간만 색칠」): 렌더러 옵션 tintSelection([번호] | null) → 훅 extra.selection →
//   tintLuts(TINT, 고른 번호) 가 고르지 않은 단계를 바탕 쪽으로 흐린 색 표. 격자마다 분류 번호를 한 번 뽑아 두므로(tintIndex) 고르기만 바뀌면 색 표만 다시 칠한다.
//
// 자료: docs/assets/atlas/common/tint-4096.png — ETOPO 2022 60″ 표면 높이(NOAA NCEI, public domain)를 Natural Earth 10m 육지·빙하로 나눠
//   분류 번호 × 12 의 회색으로 담은 등장방형 4096×2048(relief-4096.jpg 와 같은 격자). build_tint.py 가 만든다.
// 그리는 법: relief.js 와 같은 화면 격자 역투영(렌더러의 공유 격자 extra.grid — 음영과 같은 격자·크기, 그림마다 한 번) → 표본마다 가장 가까운 화소의
//   분류 번호를 표로 색으로(교과서처럼 단계 사이가 섞이지 않는 평평한 띠, E2 대조 검토) → 1/step 크기 그림 두 장(바다용·육지용). 바다용 표는 육지 분류를 가장 얕은 바다색으로, 육지용 표는 바다 분류를 가장 낮은 땅 색(0~100 m)으로 바꿔
//   해안선은 언제나 벡터 해안선이 정한다(분류 화상의 해안 어긋남이 보이지 않음). 바다 그림은 바다를 칠한 직후 지구 안에(육지가 위에 덮음),
//   육지 그림은 육지를 칠한 직후 육지 경로 안에(10a 일 때 단원 상자 밖은 clipOutside 안의 50m 육지) 그리고, 그 위에 지형 음영(곱하기)이 얹힌다.
//   10a ↔ 50m 상자 테두리(D5 sealUnitSeam)는 고도 색 그림을 무늬로 한 번 더 그어 메운다(seal).
// 규칙(EMBED_RULES.md): fetch 없이 new Image() + crossOrigin='anonymous'(음영과 같은 공개 Pages 주소, 교사 승인 예외).
import { loadImagePixels, createGridDrawer, attachImageDrawer } from './baseDrawer.js';

export const TINT_URL = 'https://yhk1m.github.io/donga-social-sims/assets/atlas/common/tint-4096.png';
/** 개발 서버(vite, 저장소 루트가 root)에서 쓰는 같은 파일 */
export const TINT_DEV_URL = '/docs/assets/atlas/common/tint-4096.png';

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
/** 단계 고르기에서 고르지 않은 단계: 색을 바탕(육지 = 렌더러 바탕 육지색, 바다 = 아주 옅은 바다색) 쪽으로 mix 만큼 섞는다 — 고른 단계만 또렷이 */
export const TINT_FADE = Object.freeze({ land: '#f2efe9', sea: '#e3f1f7', mix: 0.82 });
const fadeRgb = (rgb, to, m) => rgb.map((v, k) => Math.round(v + (to[k] - v) * m));
/**
 * 색 표 두 장(번호 × 3 RGB): land = 육지 안에 칠할 표(바다 번호 → 0~100 m 색), sea = 바다에 칠할 표(육지·빙하 번호 → 0~200 m 바다색).
 * 해안선은 벡터가 정하므로 분류 화상과 해안이 어긋난 화소는 반대쪽 가장 가까운 단계 색으로 보인다.
 * selection(Set<번호> | null, 비었으면 전체): 고르지 않은 단계는 TINT_FADE 로 흐리게. 해안 어긋남 칸은 대신 칠하는 단계(0~100 m · 0~200 m)의 고름을 따른다.
 */
export function tintLuts(t = TINT, selection = null) {
  const cls = tintClasses(t);
  const sel = selection && selection.size ? selection : null;
  const on = (i) => !sel || sel.has(i);
  const land = new Uint8Array(cls.length * 3), sea = new Uint8Array(cls.length * 3);
  const fl = rgbOf(TINT_FADE.land), fs = rgbOf(TINT_FADE.sea);
  const lowLand = rgbOf(t.landColors[1]), shallow = rgbOf(t.seaColors[0]);
  const lowOn = on(LAND0), shallowOn = on(0);
  cls.forEach((c, i) => {
    const rgb = rgbOf(c.color);
    const isSea = c.kind === 'sea';
    const lc = isSea ? (lowOn ? lowLand : fadeRgb(lowLand, fl, TINT_FADE.mix)) : (on(i) ? rgb : fadeRgb(rgb, fl, TINT_FADE.mix));
    const sc = isSea ? (on(i) ? rgb : fadeRgb(rgb, fs, TINT_FADE.mix)) : (shallowOn ? shallow : fadeRgb(shallow, fs, TINT_FADE.mix));
    land.set(lc, i * 3);
    sea.set(sc, i * 3);
  });
  return { land, sea };
}

const fmtM = (v) => v.toLocaleString('en-US');
// 범례 줄의 분류 번호: 빙하 GLACIER, 육지 i(1 = 0~100 m) → LAND0 + i − 1, 해수면 아래 BELOW, 바다 i → i
/**
 * 범례 줄(교과서 16쪽 상자처럼 위 → 아래): 빙하 · 5,000 이상 … 0~100 · 해수면 아래 땅 · 0~200 바다 … 8,000 이상.
 * 줄마다 { color, kind, top(줄 위 경계 글자 | null), title, label? }. 경계 글자는 칸과 칸 사이(교과서처럼 칸 윗선에 붙임).
 */
export function tintLegend(t = TINT) {
  const rows = [{ color: t.glacierColor, kind: 'glacier', top: null, label: '빙하', title: '빙하', cls: LAND0 + t.landBreaks.length }];
  const lb = t.landBreaks;
  for (let i = t.landColors.length - 1; i >= 1; i--) {
    const lo = lb[i - 1], hi = lb[i] ?? null;
    rows.push({ color: t.landColors[i], kind: 'land', top: hi == null ? null : fmtM(hi), title: hi == null ? `${fmtM(lo)} m 이상` : `${fmtM(lo)}~${fmtM(hi)} m`, cls: LAND0 + i - 1 });
  }
  rows.push({ color: t.landColors[0], kind: 'below', top: '0', title: '해수면보다 낮은 땅', label: '해수면 아래', cls: BELOW });
  const sb = [0, ...t.seaBreaks];
  t.seaColors.forEach((color, i) => rows.push({
    color, kind: 'sea', top: i === 0 ? null : fmtM(sb[i]), title: sb[i + 1] == null ? `깊이 ${fmtM(sb[i])} m 이상` : `깊이 ${fmtM(sb[i])}~${fmtM(sb[i + 1])} m`, cls: i,
  }));
  return rows;
}

/**
 * 경위도 격자(invertGrid 결과) → 바다용·육지용 RGBA 두 장. 표본마다 가장 가까운 화소의 분류 번호를 색 표로(단계 사이 섞인 색 없음 — 교과서의 평평한 띠,
 * 가로는 날짜변경선을 건너 감쌈). 지도 밖(NaN)은 투명. img = { width, height, data: 분류 번호 }. 해안은 육지 자르기가 매끈하게 한다.
 */
export function tintGrid(grid, img, luts, outSea, outLand) {
  tintPaint(tintIndex(grid, img), luts, outSea, outLand);
}

/** 지도 밖 표본 표시(분류 번호는 CLASS_COUNT 보다 작다) */
const OUTSIDE = 255;
/** 경위도 격자 → 표본마다 가장 가까운 화소의 분류 번호(Uint8Array, 지도 밖 = 255). out 을 주면(길이가 같으면) 다시 씀. */
export function tintIndex(grid, img, out = null) {
  const { lon, lat } = grid, { width: iw, height: ih, data } = img;
  const idx = out && out.length === lon.length ? out : new Uint8Array(lon.length);
  for (let k = 0; k < lon.length; k++) {
    const lo = lon[k];
    if (Number.isNaN(lo)) { idx[k] = OUTSIDE; continue; }
    let u = (lo + 180) / 360; u -= Math.floor(u);
    let x = Math.round(u * iw - 0.5); if (x >= iw) x = 0; else if (x < 0) x = iw - 1;
    let y = Math.round(((90 - lat[k]) / 180) * ih - 0.5); if (y < 0) y = 0; else if (y > ih - 1) y = ih - 1;
    idx[k] = data[y * iw + x];
  }
  return idx;
}

/** 분류 번호 → 바다용·육지용 RGBA(색 표로) */
export function tintPaint(idx, luts, outSea, outLand) {
  const L = luts.land, Sx = luts.sea;
  for (let k = 0, o = 0; k < idx.length; k++, o += 4) {
    const v = idx[k];
    if (v === OUTSIDE) { outSea[o + 3] = 0; outLand[o + 3] = 0; continue; }
    const c = v * 3;
    outSea[o] = Sx[c]; outSea[o + 1] = Sx[c + 1]; outSea[o + 2] = Sx[c + 2];
    outLand[o] = L[c]; outLand[o + 1] = L[c + 1]; outLand[o + 2] = L[c + 2];
    outSea[o + 3] = 255; outLand[o + 3] = 255;
  }
}

// ---------- 브라우저(공통 틀 baseDrawer.js 위에 얇게) ----------
const decodeClasses = (rgba, w, hh) => {
  const data = new Uint8Array(w * hh);
  for (let i = 0, o = 0; i < data.length; i++, o += 4) data[i] = decodeClass(rgba[o]);
  return data;
};
/** 분류 화상을 불러와 번호(R 채널 ÷ codeStep)를 캐시한다. 실패하면 null + 콘솔 경고 한 줄(지도는 고도 색 없이 그대로). 같은 주소는 한 번만. */
export const loadTint = (url = TINT_URL) => loadImagePixels(url, { label: '고도 색', decode: decodeClasses });

/**
 * 렌더러 훅용(setTintDrawer). 'sea' 단계에서 두 장을 한 번에 계산해 두고 'land' 단계가 그대로 쓴다(같은 view·같은 격자면 — 그림 하나에 한 번).
 * 격자와 그 크기는 렌더러의 공유 격자(extra.grid, createGridShare)가 정한다 — 그림 도중 크기가 바뀌지 않는다. 혼자 쓰면 step 2 로 계산.
 * fn.stats = 최근 계산 기록 [{ ms, step, cols, rows }]. 그리는 차례는 baseDrawer.createGridDrawer.
 */
export function createTintDrawer(img, { clock, t = TINT, luts = tintLuts(t), step } = {}) {
  if (!img) return Object.assign(() => {}, { stats: [], indexBuilds: 0 });
  // 격자(공유 격자는 보기가 그대로면 같은 객체)마다 분류 번호를 한 번만 뽑고(fn.indexBuilds), 고르기에 따른 색 표는 고르기 값이 바뀔 때만 만든다
  let idxGrid = null, idx = null, lutKey = '', curLuts = luts;
  const fill = (grid, sea, land, extra) => {
    if (grid !== idxGrid) { idx = tintIndex(grid, img, idx); idxGrid = grid; fn.indexBuilds++; }
    const sel = extra?.selection?.length ? extra.selection : null;
    const key = sel ? sel.join(',') : '';
    if (key !== lutKey) { curLuts = sel ? tintLuts(t, new Set(sel)) : luts; lutKey = key; }
    tintPaint(idx, curLuts, sea, land);
  };
  const fn = createGridDrawer({ fill, clock, step });
  fn.indexBuilds = 0;
  return fn;
}

/**
 * 지도에 고도 색 붙이기: 주소 고르기(개발 서버면 저장소 파일, 아니면 공개 주소) → loadTint → createTintDrawer → map.setTintDrawer.
 * 불러오는 사이 지도가 destroy 되면 붙이지 않는다. 실패하면 null(지도는 고도 색 없이 그대로 — 켜도 바뀌지 않음).
 */
export function attachTint(map, { url = import.meta.env?.DEV ? TINT_DEV_URL : TINT_URL, ...opts } = {}) {
  return attachImageDrawer(map, { url, load: loadTint, create: (img) => createTintDrawer(img, opts), set: 'setTintDrawer' });
}
