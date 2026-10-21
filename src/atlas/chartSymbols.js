// © 2026 김용현
// src/atlas/chartSymbols.js — 지도 위 고리 기호(type 'chartSymbols', U4-3c — 38쪽 주요 자원 생산량 비중 7, 2단계 설계 §6.2-11).
//   data = layer-<id>.json {type:'chartSymbols', properties:{id, map, page, title, approx, source}, items:[{id, chart, lonlat, title,
//          center:['39,100', '(만 톤)', '2020년'], sizePt, ring, series:[{name, values:[v], color}]}]}  (series·ring = 그래프 자료에서 build_layers 가 옮김)
//   chartSymbolLayer(id, data, { map, onPick, layerId }) → 렌더러 레이어(SVG — 누르기는 기호 레이어처럼 요소가 받음).
//   고리 하나 = <g class="at-ring">: 조각(계열 차례·교과서 색, 12시에서 시계 방향, 검은 선) + 가운데 글자 줄(안쪽 지름이 RING_STYLE.minTextPx 넘을 때만).
//   바깥 지름 = classSymbolPx(sizePt, k, 모든 sizePt) — 기호 레이어 규칙(확대해도 고리끼리 지름 비 그대로), 안쪽 = ring 비(없으면 0.6).
//   누르면 onPick(feature {properties:{type:'chartSymbol', label: title, chart}}) → 주제(topic.js)가 상세 카드에 그 그래프를 크게.
//   hit(xy): 바깥 원 안(가운데 빈 곳 포함) → 그 항목. labelObstacles = 보이는 고리 상자(지명이 피함). 범례 없음.
//   모양은 CSS 가 아니라 SVG 속성으로(공유 atlas.css 에 넣으면 이 레이어를 안 쓰는 u2·u3 조각도 커짐), 강조는 구멍 테두리 굵기,
//   키보드 초점은 focus·blur 때 고리 바깥에 그리는 파란 테두리 원(at-ring-focus — CSS :focus-visible 없이도 보임).
//   항목 leader [lon, lat](U5-3g — 46쪽 민족 고리, 있을 때만): 고리 가장자리 → 그 점까지 검은 점선 + 끝 점 — 그리기는 등록 길(ringHook.leader ←
//   americasExtra.ringLeader), 등록 안 한 조각에서는 아무것도 안 그림.
//   layerRef 에 직접 넣지 않고 chartsExtra.installExtraCharts() 가 'chartSymbols' 로 등록한다.
import { s } from '../shared/dom.js';
import { classSymbolPx } from './layerStyle.js';
import { ringRatio, ringSlices, sectorPath } from './chartCore.js';
import { LAYER_Z, round1, metaOf, setAttr, connect } from './layerCommon.js';

const INK = '#231f20', FOCUS = '#1a73e8';

/** 고리 기호 지름 규칙(px): 지면 pt × 2 × 확대 배율, 단계 전체 [52, 96] — 가운데 글자 3줄이 들어갈 만큼 */
export const RING_STYLE = Object.freeze({ pxPerPt: 2, min: 52, max: 96, minTextPx: 30 });
/** 지시선 고리(U5-3g): americasExtra.installAmericasExtras 가 ringLeader 를 검 — 항목 leader 가 있을 때만 부름(u3·u4 조각엔 그리는 코드 없음) */
export const ringHook = { leader() {} };
/** 글자 폭 어림(em): 한글 1, 그 밖 0.58 */
const emW = (t) => [...String(t)].reduce((a, ch) => a + (/[ㄱ-힣]/.test(ch) ? 1 : 0.58), 0);

export function chartSymbolLayer(id, data, { map = null, onPick = null, layerId = id, z = LAYER_Z.symbol } = {}) {
  // lonlat·series 가 없는 항목(손으로 고친·낡은 자료)은 건너뜀 — 지도 그리기 전체가 멈추지 않게
  const items = (data?.items || []).filter((it) => Array.isArray(it?.lonlat) && it.series?.length).map((it) => ({
    it, el: null, hole: null, ring: null, focused: false, xy: null, r: 0, key: '',
    f: { type: 'Feature', properties: { type: 'chartSymbol', label: it.title, name: it.title, chart: it.chart }, geometry: { type: 'Point', coordinates: it.lonlat } },
  }));
  const sizes = items.map((x) => x.it.sizePt || 30);
  const byF = new Map(items.map((x) => [x.f, x]));
  let root = null, hovered = null;
  const mark = (f) => { const x = byF.get(f); if (x?.hole) setAttr(x.hole, 'stroke-width', f === hovered ? 2.2 : 0.8); };
  /** 지도 hover(자기 고리면 구멍 테두리를 굵게) */
  const onHover = (f) => { const nf = f && byF.has(f) ? f : null; if (nf === hovered) return; const was = hovered; hovered = nf; mark(was); mark(nf); };

  /** 지름 d 에 맞춰 고리 조각·글자를 다시 만든다(확대가 바뀌어 크기가 바뀔 때만) */
  function paint(x, d) {
    const R = d / 2, r0 = R * ringRatio(x.it), kids = [s('title', {}, x.it.title)];
    for (const q of ringSlices(x.it)) kids.push(s('path', { class: 'at-ring-seg', d: sectorPath(0, 0, r0, R, q.a0, q.a1), fill: q.color, stroke: INK, 'stroke-width': 0.8 }));
    x.hole = s('circle', { class: 'at-ring-hole', r: round1(r0), fill: 'rgba(255,255,255,.92)', stroke: INK });
    kids.push(x.hole);
    const lines = x.it.center || [];
    if (2 * r0 >= RING_STYLE.minTextPx && lines.length) {
      const fs = Math.min(11, (2 * r0) / (lines.length + 0.9), (1.6 * r0) / Math.max(...lines.map(emW)));   // 줄 수·가장 긴 줄 폭에 맞춤
      lines.forEach((t, i) => kids.push(s('text', { class: 'at-ring-text', y: round1((i - (lines.length - 1) / 2) * fs * 1.05 + fs * 0.35), 'font-size': round1(fs),
        fill: INK, 'text-anchor': 'middle', 'font-weight': i ? 600 : 800, 'pointer-events': 'none' }, t)));
    }
    // 키보드 초점 테두리(바깥 지름 + 3px) — 다시 그려도 초점 상태를 이어 감
    x.ring = s('circle', { class: 'at-ring-focus', r: round1(R + 3), fill: 'none', stroke: FOCUS, 'stroke-width': 2.5, 'pointer-events': 'none', display: x.focused ? null : 'none' });
    kids.push(x.ring);
    x.el.replaceChildren(...kids);
  }
  const setFocus = (x, on) => { x.focused = on; if (x.ring) setAttr(x.ring, 'display', on ? null : 'none'); };

  function build(g) {
    root = s('g', { class: 'at-rings' });
    for (const x of items) {
      // 초점 표시는 파란 테두리 원(at-ring-focus) — 브라우저 기본 사각 윤곽은 끔(U4-9 캡처: 누른 고리에 검은 사각이 겹침, 핀 at-pin:focus 와 같은 처리)
      x.el = s('g', { class: 'at-ring', role: 'button', tabindex: 0, 'aria-label': x.it.title, cursor: 'pointer', style: { outline: 'none' },
        on: { focus: () => setFocus(x, true), blur: () => setFocus(x, false),
          click: (e) => { e.stopPropagation(); onPick?.(x.f, e); }, keydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick?.(x.f, e); } } } });
      x.key = '';
      root.append(x.el);
    }
    g.append(root);
  }

  const layer = {
    id, z, meta: metaOf(data), legendItems: [], features: items.map((x) => x.f),
    drawSvg(g, project, view) {
      if (!root || root.parentNode !== g) build(g);
      for (const x of items) {
        const d = classSymbolPx(x.it.sizePt || 30, view.k, sizes, RING_STYLE);
        const q = project(x.it.lonlat);
        const shown = !!q && q[0] > -d && q[0] < view.width + d && q[1] > -d && q[1] < view.height + d;
        x.xy = shown ? q : null;
        x.r = d / 2;
        setAttr(x.el, 'display', shown ? null : 'none');
        if (x.it.leader) ringHook.leader(x, shown && q, project, root);   // U5-3g 지시선(등록 길 — 키가 있을 때만)
        if (!shown) continue;
        const key = String(round1(d));
        if (key !== x.key) { x.key = key; paint(x, d); }
        setAttr(x.el, 'transform', `translate(${round1(q[0])},${round1(q[1])})`);
        mark(x.f);
      }
    },
    hit(xy) {
      for (let i = items.length - 1; i >= 0; i--) {
        const x = items[i];
        if (x.xy && Math.hypot(xy[0] - x.xy[0], xy[1] - x.xy[1]) <= x.r + 1) return x.f;
      }
      return null;
    },
    labelObstacles: () => items.filter((x) => x.xy).map((x) => [x.xy[0] - x.r, x.xy[1] - x.r, x.xy[0] + x.r, x.xy[1] + x.r]),
    destroy() { offs.forEach((off) => off()); offs.length = 0; root?.remove(); root = null; },
  };
  const offs = connect({ map, layerId, onHover });
  return layer;
}
