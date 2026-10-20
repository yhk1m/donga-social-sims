// © 2026 김용현
// src/atlas/uiCore.js — 사이드바·지도 도구·퀴즈가 쓰는 순수 함수(DOM 없음). ui.js·quiz.js 가 가져다 쓴다.
//   scaleBarSpec(kmPerPx)         축척 막대 길이·글자(1·2·5 단위)
//   hoverLabel(hoverEvent)        말풍선 글(레이어 label → name → 바탕 지도 ko)
//   mulberry32(seed)·shuffle·quizOptions·pickNext   씨앗 고정 난수와 보기 만들기
//   pageCrop(bbox)                원본 쪽 이미지에서 bbox 부분만 보이게 하는 백분율
//   pagesLabel(pages)·assetUrl(path)·panTarget(key, W, H)
//   photoCropStyle(crop, w, h)    사진 일부(비율 상자)만 보이는 백분율(세계유산 퀴즈의 이름 띠 빼기)

/** 공개 이미지 자리(GitHub Pages). 사진·원본 쪽은 여기 아래 절대 주소로만 연결한다(조각 규칙의 이미지 예외). */
export const ASSET_BASE = 'https://yhk1m.github.io/donga-social-sims/assets/atlas/';

/** 원본 쪽 이미지 크기(C3: 110dpi, 1191×1104px — 아시아 10쪽 모두 같음) */
export const PAGE_IMAGE = { pageW: 1191, pageH: 1104, dpi: 110 };

/** 경로(ASSET_BASE 기준) 또는 절대 https 주소 → 절대 주소. 빈 값이면 null. */
export function assetUrl(path) {
  if (!path) return null;
  if (/^https:\/\//.test(path)) return path;
  return ASSET_BASE + String(path).replace(/^\/+/, '');
}

const fmtInt = (v) => String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

/**
 * 축척 막대: 화면 가운데 가로 1px 의 km(map.view.kmPerPx) → {km, px, label} | null.
 * 1·2·5 × 10ⁿ km 가운데 maxPx 안에 드는 가장 긴 것. 1km 아래는 m 로 적는다.
 */
export function scaleBarSpec(kmPerPx, { maxPx = 120 } = {}) {
  if (!Number.isFinite(kmPerPx) || kmPerPx <= 0) return null;
  const maxKm = kmPerPx * maxPx;
  const e = Math.floor(Math.log10(maxKm));
  let km = 0;
  for (let p = e; p >= e - 1 && !km; p--) {
    for (const m of [5, 2, 1]) { const v = m * 10 ** p; if (v <= maxKm * (1 + 1e-9)) { km = v; break; } }
  }
  km = Number(km.toPrecision(6));
  const label = km >= 1 ? `${fmtInt(km)} km` : `${fmtInt(km * 1000)} m`;
  return { km, px: km / kmPerPx, label };
}

/** 렌더러 hover 이벤트 → 말풍선 글. 레이어 Feature 는 label → name, 바탕 지도 나라는 ko. 없으면 null. */
export function hoverLabel(e) {
  const p = e?.feature?.properties;
  if (!p) return null;
  return p.label || p.name || p.ko || null;
}

/** 씨앗 고정 난수(0 ≤ x < 1). 테스트·되풀이 가능한 퀴즈용. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 피셔–예이츠 섞기(사본). */
export function shuffle(arr, rand = Math.random) {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** 보기 n개: 정답 + 풀(중복 제거, 정답 뺌)에서 고른 오답, 섞음. 풀이 모자라면 있는 만큼. */
export function quizOptions(answer, pool, { n = 4, rand = Math.random } = {}) {
  const others = shuffle([...new Set(pool)].filter((x) => x !== answer), rand).slice(0, Math.max(0, n - 1));
  return shuffle([answer, ...others], rand);
}

/** 다음 문제: items 에서 무작위, 바로 앞 문제(prev)는 빼고(둘 이상일 때). 비었으면 null. */
export function pickNext(items, rand = Math.random, prev = null) {
  if (!items?.length) return null;
  const pool = items.length > 1 ? items.filter((x) => x !== prev) : items;
  return pool[Math.floor(rand() * pool.length)];
}

/**
 * 원본 쪽 이미지(너비 pageW px, dpi — 높이는 이미지 비율대로 따라옴)에서 bbox [x0, y0, x1, y1](pt)만 보이게 하는 값 →
 * {aspect(높이/너비), width(이미지 너비 %), left %, top %, nativeW(그 부분의 이미지 화소 너비)} — 감싼 상자 aspect-ratio = 1 / aspect, 이미지는 absolute.
 */
export function pageCrop(bbox, { pageW, dpi } = PAGE_IMAGE) {
  if (!Array.isArray(bbox) || bbox.length !== 4) return null;
  const [x0, y0, x1, y1] = bbox, bw = x1 - x0, bh = y1 - y0;
  if (!(bw > 0 && bh > 0)) return null;
  const pw = (pageW * 72) / dpi;
  return { aspect: bh / bw, width: (pw / bw) * 100, left: (-x0 / bw) * 100, top: (-y0 / bh) * 100, nativeW: (bw * dpi) / 72 };
}

/** [16, 18, 19] → '16·18·19쪽' */
export function pagesLabel(pages) {
  return pages?.length ? `${pages.join('·')}쪽` : '';
}

/** 방향키 → 새 화면 가운데로 삼을 화면 좌표(가로 20%·세로 20% 비켜). 방향키가 아니면 null. */
export function panTarget(key, W, H) {
  const dx = W * 0.2, dy = H * 0.2, cx = W / 2, cy = H / 2;
  switch (key) {
    case 'ArrowLeft': return [cx - dx, cy];
    case 'ArrowRight': return [cx + dx, cy];
    case 'ArrowUp': return [cx, cy - dy];
    case 'ArrowDown': return [cx, cy + dy];
    default: return null;
  }
}

/**
 * 사진 일부만 보이기(E1 세계유산 퀴즈 — 교과서 번호·이름 띠 빼기). crop = [x0, y0, x1, y1](사진 너비·높이에 대한 비율), w·h = 사진 화소.
 * → { aspect: 담는 상자 가로/세로, width, left, top: 이미지의 %(상자 기준, absolute) } | null(잘라 낼 것 없음·잘못된 값).
 * 상자: aspect-ratio + overflow hidden, 이미지: position absolute, width = 100/(x1−x0)%, left = −x0/(x1−x0)%, top = −y0/(y1−y0)%
 * (absolute 의 top % 는 담는 상자 높이 기준이고, 이미지 높이 / 상자 높이 = 1/(y1−y0) 이라 맞는다).
 */
export function photoCropStyle(crop, w, h) {
  if (!Array.isArray(crop) || crop.length !== 4 || !(w > 0) || !(h > 0)) return null;
  const [x0, y0, x1, y1] = crop;
  if (![x0, y0, x1, y1].every(Number.isFinite) || x0 < 0 || y0 < 0 || x1 > 1 || y1 > 1 || x1 - x0 < 0.05 || y1 - y0 < 0.05) return null;
  if (x0 === 0 && y0 === 0 && x1 === 1 && y1 === 1) return null;
  const r = (v) => Math.round(v * 1000) / 1000;
  return { aspect: r(((x1 - x0) * w) / ((y1 - y0) * h)), width: r(100 / (x1 - x0)), left: r((-100 * x0) / (x1 - x0)), top: r((-100 * y0) / (y1 - y0)) };
}
