// © 2026 김용현
// src/atlas/legendState.js — 범례 하나를 누르면 그 분류만 남기고 나머지는 흐리게. 다시 누르면 전체. (순수 상태, DOM 없음)
//   toggle(c) 는 classes 에 없는 분류면 오류. 상태가 바뀔 때만 알린다(이미 전체인데 reset 하면 조용히).
//   구독자 하나가 오류를 내도 나머지는 알림을 받는다(오류는 console.error 로 남김).
//   toggleGroup(name, members) — 묶음(기후 「열대」 등) 전체만 남기기. selected() 는 그동안 'group:<name>'(한 분류 cls 와 겹치지 않음),
//   isActive(c) 는 묶음 안 분류면 true. 같은 묶음을 다시 누르면 전체.
export function createLegendState(classes) {
  let only = null, members = null; const subs = new Set();
  const known = new Set(classes);
  const notify = () => {
    for (const f of [...subs]) {
      try { f(only); } catch (e) { console.error('범례 구독자 오류', e); }
    }
  };
  return {
    classes,
    isActive: (c) => only === null || only === c || (members !== null && members.has(c)),
    selected: () => only,
    toggle(c) {
      if (!known.has(c)) throw new Error(`모르는 범례 분류: ${c}`);
      only = only === c ? null : c; members = null; notify();
    },
    toggleGroup(name, list) {
      const bad = list.filter((c) => !known.has(c));
      if (bad.length || !list.length) throw new Error(`모르는 범례 분류(묶음 ${name}): ${bad.join(', ')}`);
      const key = `group:${name}`;
      if (only === key) { only = null; members = null; } else { only = key; members = new Set(list); }
      notify();
    },
    reset() { if (only === null) return; only = null; members = null; notify(); },
    onChange(f) { subs.add(f); return () => subs.delete(f); },
  };
}
