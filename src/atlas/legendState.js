// © 2026 김용현
// src/atlas/legendState.js — 범례 하나를 누르면 그 분류만 남기고 나머지는 흐리게. 다시 누르면 전체. (순수 상태, DOM 없음)
//   toggle(c) 는 classes 에 없는 분류면 오류. 상태가 바뀔 때만 알린다(이미 전체인데 reset 하면 조용히).
//   구독자 하나가 오류를 내도 나머지는 알림을 받는다(오류는 console.error 로 남김).
export function createLegendState(classes) {
  let only = null; const subs = new Set();
  const known = new Set(classes);
  const notify = () => {
    for (const f of [...subs]) {
      try { f(only); } catch (e) { console.error('범례 구독자 오류', e); }
    }
  };
  return {
    classes,
    isActive: (c) => only === null || only === c,
    selected: () => only,
    toggle(c) {
      if (!known.has(c)) throw new Error(`모르는 범례 분류: ${c}`);
      only = only === c ? null : c; notify();
    },
    reset() { if (only === null) return; only = null; notify(); },
    onChange(f) { subs.add(f); return () => subs.delete(f); },
  };
}
