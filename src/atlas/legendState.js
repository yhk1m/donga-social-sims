// © 2026 김용현
// src/atlas/legendState.js — 범례 하나를 누르면 그 분류만 남기고 나머지는 흐리게. 다시 누르면 전체. (순수 상태, DOM 없음)
export function createLegendState(classes) {
  let only = null; const subs = new Set();
  return {
    classes,
    isActive: (c) => only === null || only === c,
    selected: () => only,
    toggle(c) { only = only === c ? null : c; subs.forEach((f) => f(only)); },
    reset() { only = null; subs.forEach((f) => f(only)); },
    onChange(f) { subs.add(f); return () => subs.delete(f); },
  };
}
