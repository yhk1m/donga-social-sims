// © 2026 김용현
// DOM 만들기 도우미. 규칙상 innerHTML·insertAdjacentHTML 을 쓸 수 없으므로 모든 출력은 이걸로 만든다.
//   h('div', { class: 'ds-note' }, '설명 ', h('b', {}, '굵게'))
//   attrs: class, style(객체 또는 문자열), dataset(객체), on:{click: fn}, 그 밖은 setAttribute
//   ('on...' 속성 문자열은 규칙 위반이라 받지 않는다 — 이벤트는 on:{...} 로)
const SVG_NS = 'http://www.w3.org/2000/svg';
const SVG_TAGS = new Set(['svg', 'g', 'path', 'line', 'polyline', 'polygon', 'circle', 'ellipse', 'rect', 'text', 'tspan', 'defs', 'clipPath', 'linearGradient', 'radialGradient', 'stop', 'marker', 'title']);

function build(el, attrs, children) {
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'on') for (const [ev, fn] of Object.entries(v)) el.addEventListener(ev, fn);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k === 'text') el.textContent = v;
    else if (/^on/i.test(k)) throw new Error(`h(): '${k}' 속성 대신 on:{} 를 쓰세요`);
    else if (k in el && !(el instanceof SVGElement) && typeof v !== 'string') el[k] = v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  append(el, children);
  return el;
}

/** 자식 붙이기: 문자열은 텍스트 노드, 배열은 펼침, null/false 는 건너뜀 */
export function append(el, children) {
  for (const c of [children].flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

/** HTML 또는 SVG 요소 만들기 (svg 계열 태그 이름이면 SVG 네임스페이스) */
export function h(tag, attrs, ...children) {
  const el = SVG_TAGS.has(tag) ? document.createElementNS(SVG_NS, tag) : document.createElement(tag);
  return build(el, attrs, children);
}

/** 강제로 SVG 네임스페이스 요소 만들기 (a, title 등 HTML 과 이름이 겹칠 때) */
export function s(tag, attrs, ...children) {
  return build(document.createElementNS(SVG_NS, tag), attrs, children);
}

/** 요소의 자식 전부 비우기 */
export function clear(el) {
  el.replaceChildren();
  return el;
}

// 선 아이콘 (24x24 viewBox). 이모지 금지 — 아이콘은 여기 추가해서 쓴다.
const ICONS = {
  back: [['polyline', { points: '15 18 9 12 15 6' }]],
  play: [['polygon', { points: '6 4 20 12 6 20 6 4' }]],
  pause: [['line', { x1: 8, y1: 5, x2: 8, y2: 19 }], ['line', { x1: 16, y1: 5, x2: 16, y2: 19 }]],
  reset: [['polyline', { points: '1 4 1 10 7 10' }], ['path', { d: 'M3.5 15a9 9 0 1 0 2.1-9.4L1 10' }]],
  plus: [['line', { x1: 12, y1: 5, x2: 12, y2: 19 }], ['line', { x1: 5, y1: 12, x2: 19, y2: 12 }]],
  minus: [['line', { x1: 5, y1: 12, x2: 19, y2: 12 }]],
  search: [['circle', { cx: 11, cy: 11, r: 7 }], ['line', { x1: 21, y1: 21, x2: 16.65, y2: 16.65 }]],
  next: [['polyline', { points: '9 18 15 12 9 6' }]],
  prev: [['polyline', { points: '15 18 9 12 15 6' }]],
  expand: [['polyline', { points: '15 3 21 3 21 9' }], ['polyline', { points: '9 21 3 21 3 15' }], ['line', { x1: 21, y1: 3, x2: 14, y2: 10 }], ['line', { x1: 3, y1: 21, x2: 10, y2: 14 }]],
  eye: [['path', { d: 'M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z' }], ['circle', { cx: 12, cy: 12, r: 3 }]],
  close: [['line', { x1: 6, y1: 6, x2: 18, y2: 18 }], ['line', { x1: 18, y1: 6, x2: 6, y2: 18 }]],
  globe: [['circle', { cx: 12, cy: 12, r: 9 }], ['ellipse', { cx: 12, cy: 12, rx: 4, ry: 9 }], ['line', { x1: 3, y1: 12, x2: 21, y2: 12 }]],
  page: [['path', { d: 'M6 3h8l4 4v14H6z' }], ['polyline', { points: '14 3 14 7 18 7' }], ['line', { x1: 9, y1: 12, x2: 15, y2: 12 }], ['line', { x1: 9, y1: 16, x2: 15, y2: 16 }]],
  brush: [['path', { d: 'M4 20c3 0 5-1.5 5-4a3 3 0 0 0-3-3c-2 0-3 2-2 7z' }], ['path', { d: 'M9 13l9-9 2 2-9 9' }]],
};
export function icon(name) {
  const parts = ICONS[name];
  if (!parts) throw new Error(`icon(): '${name}' 없음`);
  return s('svg', { class: 'ds-icon', viewBox: '0 0 24 24', 'aria-hidden': 'true' }, parts.map(([t, a]) => s(t, a)));
}
