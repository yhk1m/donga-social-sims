// © 2026 김용현
// src/atlas/seg.js — 고르기 단추 묶음(ds-seg): 지도 도구(도법·중심 경도), 주제의 지도 고르기, 막대 하나씩 보기, 퀴즈 방식. 한 곳에서 만든다(E1 검토).
//   segButtons(items, { onPick, label, className, btnClass, current }) → { el, btns, set(v), get value() }
//     items = [[값, 글자, title?], ...] — 단추마다 class 「ds-seg-btn {btnClass}」, data-v = String(값), aria-pressed, title = title || 글자
//     (말풍선 — 좁은 칸에서 글자가 잘려도 이름이 보이게, 옛 지도 도구 단추와 같음).
//     el = <div class="ds-seg {className}" role="group" aria-label={label}>. set(v) 는 aria-pressed 만 바꾸고 onPick 을 부르지 않는다.
//     누르면 onPick(값) — 고른 표시는 부르는 쪽이 set 으로(값이 바뀌지 않을 수도 있어서 — 지도 도구는 view 로 다시 맞춘다).
import { h } from '../shared/dom.js';

export function segButtons(items, { onPick = null, label = null, className = '', btnClass = '', current = undefined } = {}) {
  let value;
  const btns = items.map(([v, text, title]) => h('button', {
    class: `ds-seg-btn${btnClass ? ` ${btnClass}` : ''}`, type: 'button', 'aria-pressed': 'false', title: title || text, 'data-v': String(v),
    on: { click: () => onPick?.(v) },
  }, text));
  const el = h('div', { class: `ds-seg${className ? ` ${className}` : ''}`, role: 'group', 'aria-label': label }, btns);
  function set(v) {
    value = v;
    for (const b of btns) b.setAttribute('aria-pressed', String(b.getAttribute('data-v') === String(v)));
  }
  if (current !== undefined) set(current);
  return { el, btns, set, get value() { return value; } };
}
