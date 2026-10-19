// © 2026 김용현
// src/atlas/inset.js — 무대 위 확대 창(인셋)과 큰 지도의 위치 상자 (E1).
//   싱가포르 사원 76개는 지도 확대 상한(40배)에서 섬이 화면 30px 남짓이라 한 덩어리로 겹친다(D6 남은 것 ①). 그래서 종교·문화 주제의
//   싱가포르 보기에서는 섬만 따로 크게 그린 창을 무대에 띄우고, 큰 지도에는 싱가포르 자리에 상자(insetBoxLayer)만 둔다.
//
//   symbolInset(stage, { outline, points, legend, legendItems, title, credit, approx, approxNote, tip, onClose })
//     outline = 바탕 윤곽 GeoJSON(inset_outline.py — 교과서 지도 육지를 같은 fit 으로 되돌린 것), points = 기호 레이어 자료(Point Feature 들, properties
//     {cls, color, label, name?}), legend = 그 레이어의 legendState(범례 블록과 같은 것 — 고르면 창의 기호도 흐려짐), tip = ui.tooltip(무대 말풍선).
//     → { el, open, show(), hide(), destroy() }. 창은 absolute(무대 왼쪽 위), z 16(말풍선 17 아래 — 창 기호 말풍선이 창 위에 뜸, 원본 쪽 보기 20 아래), 닫기 단추·Esc.
//   insetBoxLayer(id, bounds, { onClick }) → 렌더러 레이어(SVG 사각형 + 「확대 창」 글자, z 90). 누르면 onClick(창 다시 열기).
// 규칙: h()/s() 로만 만들고(innerHTML 없음), 문서 전역 id 없음, 구독은 destroy 가 모두 푼다.
import { h, s, icon } from '../shared/dom.js';
import { LAYER_Z } from './layerCommon.js';

const KM_PER_DEG = 111.32;

/** 경위도 상자 → 국지 등장방형(위도 cos 보정) 투영: { project([lon,lat]) → [x,y], width, height, unitKm(viewBox 1 = km) } */
export function insetProjection([w, s0, e, n], { width = 520, pad = 10 } = {}) {
  const lat0 = (s0 + n) / 2, c = Math.cos((lat0 * Math.PI) / 180);
  const gw = (e - w) * c, gh = n - s0;
  const k = (width - 2 * pad) / gw;
  const height = Math.round(gh * k + 2 * pad);
  return {
    width, height, k,
    project: ([lon, lat]) => [pad + (lon - w) * c * k, pad + (n - lat) * k],
    unitKm: KM_PER_DEG / k,
  };
}

/** GeoJSON 의 경위도 상자 [w, s, e, n](날짜변경선을 넘지 않는 작은 지역용) */
export function geoBox(fc, padDeg = 0) {
  let w = Infinity, s0 = Infinity, e = -Infinity, n = -Infinity;
  const walk = (c) => { if (typeof c[0] === 'number') { w = Math.min(w, c[0]); e = Math.max(e, c[0]); s0 = Math.min(s0, c[1]); n = Math.max(n, c[1]); } else c.forEach(walk); };
  for (const f of fc.features || []) if (f.geometry) walk(f.geometry.coordinates);
  return [w - padDeg, s0 - padDeg, e + padDeg, n + padDeg];
}

const ringPath = (ring, project) => ring.map((p, i) => { const [x, y] = project(p); return `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`; }).join('') + 'Z';

/** 축척 막대 길이(km): 1·2·5 단위로 maxUnits(viewBox) 안 */
function niceKm(unitKm, maxUnits) {
  const max = unitKm * maxUnits;
  const e = Math.floor(Math.log10(max));
  for (let p = e; p >= e - 1; p--) for (const m of [5, 2, 1]) if (m * 10 ** p <= max) return m * 10 ** p;
  return max;
}

export function symbolInset(stage, { outline, points, legend = null, legendItems = [], title = '확대', credit = null, approx = false, approxNote = '위치 근사', approxReason = null, tip = null, onClose = null } = {}) {
  const box = geoBox(outline, 0.004);
  const P = insetProjection(box, { width: 640 }); // viewBox 너비 = CSS 최대 너비(640px) — 넓은 화면에서 기호 반지름이 화면 px 그대로
  const land = s('g', { class: 'at-inset-land' }, (outline.features || []).flatMap((f) => {
    const g = f.geometry;
    const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
    return polys.map((rings) => s('path', { class: 'at-inset-land-path', d: rings.map((r) => ringPath(r, P.project)).join(''), 'fill-rule': 'evenodd' }));
  }));
  const feats = (points?.features || []).filter((f) => f.geometry?.type === 'Point');
  const R = 5.2;
  const syms = feats.map((f) => {
    const [x, y] = P.project(f.geometry.coordinates);
    const label = f.properties.label || f.properties.name || '';
    const kind = f.properties.kind && f.properties.kind !== label ? ` (${f.properties.kind})` : '';
    const c = s('circle', {
      class: 'at-inset-sym', cx: x.toFixed(1), cy: y.toFixed(1), r: R, fill: f.properties.color || '#555', 'data-cls': f.properties.cls || '',
      on: {
        pointerenter: (e) => showTip(e, `${label}${kind}`),
        pointermove: (e) => showTip(e, `${label}${kind}`),
        pointerleave: () => tip?.hide(),
      },
    }, s('title', {}, `${label}${kind}`));
    return { f, c, x, y };
  });
  // 이름 있는 사원(교과서에 이름을 쓴 4곳): 가운데 무리의 오른쪽 아래로 지시선 + 이름(교과서 배치처럼 한 줄씩)
  const named = syms.filter((q) => q.f.properties.name).sort((a, b) => a.y - b.y);
  const lx = named.length ? Math.max(...named.map((q) => q.x)) + 46 : 0;
  const y0 = named.length ? Math.max(...named.map((q) => q.y)) - ((named.length - 1) * 17) / 2 + 22 : 0;
  const names = named.map((q, i) => {
    const ty = Math.min(P.height - 8, y0 + i * 17);
    const tx = Math.min(lx, P.width - 8);
    return s('g', { class: 'at-inset-name' },
      s('path', { class: 'at-inset-leader', d: `M${q.x.toFixed(1)},${q.y.toFixed(1)}L${(tx - 4).toFixed(1)},${(ty - 4).toFixed(1)}` }),
      s('text', { class: 'at-inset-name-text', x: tx.toFixed(1), y: ty.toFixed(1), 'text-anchor': 'start' }, q.f.properties.name));
  });
  const km = niceKm(P.unitKm, 90);
  const barW = km / P.unitKm;
  const scale = s('g', { class: 'at-inset-scale', transform: `translate(12,${P.height - 14})` },
    s('path', { class: 'at-inset-scale-line', d: `M0,-5V0H${barW.toFixed(1)}V-5` }),
    s('text', { class: 'at-inset-scale-text', x: 0, y: -8 }, '0'), s('text', { class: 'at-inset-scale-text', x: barW.toFixed(1), y: -8, 'text-anchor': 'middle' }, `${km}km`));
  const svg = s('svg', { class: 'at-inset-svg', viewBox: `0 0 ${P.width} ${P.height}`, role: 'img', 'aria-label': `${title} — 기호 ${feats.length}개` },
    s('rect', { class: 'at-inset-sea', x: 0, y: 0, width: P.width, height: P.height }), land, names, syms.map((q) => q.c), scale);
  const close = h('button', { class: 'ds-btn at-inset-close', type: 'button', 'aria-label': '확대 창 닫기', title: '닫기(Esc)', on: { click: () => hide() } }, icon('close'));
  const legendRow = legendItems.length ? h('ul', { class: 'at-inset-legend', 'aria-label': '범례' }, legendItems.map((e) => h('li', { class: 'at-inset-legend-item' },
    h('span', { class: 'at-inset-legend-dot', style: { background: e.color }, 'aria-hidden': 'true' }), e.label))) : null;
  const el = h('section', { class: 'at-inset', role: 'dialog', 'aria-modal': 'false', 'aria-label': title },
    h('div', { class: 'at-inset-head' },
      h('h2', { class: 'at-inset-title' }, title, approx ? h('span', { class: 'at-badge', title: approxReason || '교과서 지도의 위치를 눈으로 맞춘 근사' }, approxNote) : null),
      close),
    svg, legendRow, credit ? h('p', { class: 'at-inset-credit' }, credit) : null);
  const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); hide(); } };
  el.addEventListener('keydown', onKey);
  stage.append(el);

  function showTip(e, text) {
    if (!tip || !text) return;
    const r = stage.getBoundingClientRect?.() || { left: 0, top: 0 };
    tip.show(text, [e.clientX - r.left, e.clientY - r.top]);
  }
  /** 범례 고름: 고르지 않은 분류는 흐리게(큰 지도 기호 레이어와 같은 0.2) */
  function sync(sel) {
    for (const q of syms) q.c.setAttribute('opacity', sel == null || sel === q.f.properties.cls ? '1' : '0.2');
  }
  const off = legend ? legend.onChange(sync) : null;
  sync(legend?.selected?.() ?? null);
  let alive = true;
  function show() { if (alive) el.hidden = false; }
  function hide() { el.hidden = true; tip?.hide(); onClose?.(); }
  return {
    el, show, hide,
    get open() { return !el.hidden; },
    destroy() { alive = false; off?.(); el.removeEventListener('keydown', onKey); el.remove(); },
  };
}

/** 큰 지도의 확대 창 자리 상자(SVG). bounds = [w, s, e, n]. 화면에서 너무 작으면 최소 14px 로 그리고 「확대 창」 글자를 단다. */
export function insetBoxLayer(id, [w, s0, e, n], { onClick = null, label = '확대 창', z = LAYER_Z.marker + 10 } = {}) {
  let g = null, rect = null, text = null;
  const click = (ev) => { ev.stopPropagation?.(); onClick?.(); };
  return {
    id, z,
    meta: { title: label },
    drawSvg(group, project) {
      if (g !== group) {
        g = group;
        rect = s('rect', { class: 'at-inset-box', on: { click } });
        text = s('text', { class: 'at-inset-box-text', on: { click } }, label);
        group.replaceChildren(rect, text);
      }
      const a = project([w, n]), b = project([e, s0]);
      if (!a || !b) { rect.setAttribute('display', 'none'); text.setAttribute('display', 'none'); return; }
      const cx = (a[0] + b[0]) / 2, cy = (a[1] + b[1]) / 2;
      const bw = Math.max(14, Math.abs(b[0] - a[0])), bh = Math.max(14, Math.abs(b[1] - a[1]));
      rect.removeAttribute('display'); text.removeAttribute('display');
      rect.setAttribute('x', (cx - bw / 2).toFixed(1)); rect.setAttribute('y', (cy - bh / 2).toFixed(1));
      rect.setAttribute('width', bw.toFixed(1)); rect.setAttribute('height', bh.toFixed(1));
      text.setAttribute('x', (cx + bw / 2 + 4).toFixed(1)); text.setAttribute('y', (cy + 4).toFixed(1));
    },
    hit: () => null,
    destroy() { g?.replaceChildren(); g = null; },
  };
}
