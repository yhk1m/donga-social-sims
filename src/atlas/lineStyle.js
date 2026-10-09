// © 2026 김용현
// src/atlas/lineStyle.js — 바탕 지도 선 굵기·표시 규칙(확대 k 에 따라, 웹지도처럼 확대하면 굵게). 순수 함수. 테스트: tests/atlas/lineStyle.test.mjs

/** 하천 선: 등급 s(Natural Earth scalerank, 1 = 큰 강)와 확대 k → {visible, width(px)}. 작은 하천(s 6)은 k ≥ 3 부터. */
export function riverStyle(s, k) {
  const visible = k >= 3 || s <= 5;
  const base = 1.5 - 0.17 * (Math.max(1, Math.min(6, s)) - 1);
  const f = Math.max(0.85, Math.min(1.6, 1 + 0.35 * Math.log2(k / 2)));
  return { visible, width: Math.max(0.5, Math.min(2.4, base * f)) };
}

/** 호수: 등급 s 가 클수록 작은 호수 — s ≤ 6 은 늘, 7 은 k ≥ 6, 8 이상은 k ≥ 10. */
export function lakeVisible(s, k) {
  if (s <= 6) return true;
  if (s <= 7) return k >= 6;
  return k >= 10;
}

/** 경위선 간격(도): 세계 30°, k ≥ 2 는 10°, k ≥ 8 은 5°. */
export function graticuleStep(k) {
  return k < 2 ? 30 : k < 8 ? 10 : 5;
}

/** 국경 굵기(px, 실선): k < 2 → 0.6, k < 4 → 0.75, 그 위 0.9. */
export function borderWidth(k) {
  return k < 2 ? 0.6 : k < 4 ? 0.75 : 0.9;
}

/** 해안선 강조 굵기(px): k < 2 → 0.6, 그 위 0.8. */
export function coastWidth(k) {
  return k < 2 ? 0.6 : 0.8;
}
