// © 2026 김용현
// src/atlas/chartsExtra.js — 아프리카(U4-3c·d)에서 처음 쓰는 그래프 종류. installExtraCharts() 를 부른 단원 조각에만 들어간다
//   (charts.js registerSvgChart · layerRef.js registerLayerType 에 등록 — 부르지 않는 u2·u3 조각은 코드도 크기도 그대로).
//   - 고리 그래프(pie + ring): csat-chart.js 2.2.2 원그래프에 안쪽 반지름이 없어 시험지 양식 SVG(barSvg 꼴 — h()/s(), 검은 선·명조).
//     유럽 v2(31쪽 코펜하겐 고리)는 그 단원 main 에서 installExtraCharts() 를 부르고 자료에 ring: true 를 더하면 같은 길(donut 이 안쪽 반지름).
//   - 원 크기 줄(bubbleRow, 39쪽 복원 녹지 면적)
//   - 지도 위 고리 기호 레이어(type 'chartSymbols' — chartSymbols.js)
//   단원 main.js: import { installExtraCharts } from '../../src/atlas/chartsExtra.js'; installExtraCharts();  (mountAtlas 전에)
import { s } from '../shared/dom.js';
import { INK, txt, registerSvgChart } from './charts.js';
import { registerLayerType } from './layerRef.js';
import { chartSymbolLayer } from './chartSymbols.js';
import { fmtThousands, ringRatio, ringSlices, sectorPath, bubbleLayout } from './chartCore.js';

/**
 * 고리 그래프(pie + ring — U4-3c, 38쪽 자원 생산량 비중): 12시에서 시계 방향 조각(계열 차례·교과서 색), 조각 사이·둘레 검은 선 #231f20,
 * 조각에 들어가면 값 글자, 가운데 글자 줄(spec.center — 「39,100」·「(만 톤)」·「2020년」, 없으면 범주 이름), 아래 「견본 이름 값」 목록.
 */
function ringSvg(spec, label) {
  const W = 420, cx = 210, cy = 128, R = 112, r0 = R * ringRatio(spec), sl = ringSlices(spec);
  const center = spec.center || [spec.categories?.[0] ?? ''];
  const rows = Math.ceil(sl.length / 2), Hh = cy + R + 22 + rows * 20;
  const kids = sl.map((q) => {
    const mid = (((q.a0 + q.a1) / 2) * Math.PI) / 180, rm = (R + r0) / 2;
    return s('g', { class: 'at-ct-cell' },
      s('title', {}, `${q.name} ${q.value}${spec.unit ? ` ${spec.unit}` : ''}`),
      s('path', { d: sectorPath(cx, cy, r0, R, q.a0, q.a1), fill: q.color, stroke: INK, 'stroke-width': 0.8 }),
      q.a1 - q.a0 >= 22 ? txt((cx + rm * Math.sin(mid)).toFixed(1), (cy - rm * Math.cos(mid) + 4).toFixed(1), String(q.value), { 'text-anchor': 'middle', class: 'at-ct at-ct-val' }) : null);
  });
  const mid = center.map((t, i) => txt(cx, (cy + (i - (center.length - 1) / 2) * 17 + 5).toFixed(1), t, { 'text-anchor': 'middle', class: `at-ct ${i ? 'at-ct-sub' : 'at-ct-cat'}` }));
  const leg = sl.map((q, i) => {
    const x = 40 + (i % 2) * 190, y = cy + R + 24 + Math.floor(i / 2) * 20;
    return s('g', {}, s('rect', { x, y: y - 10, width: 12, height: 12, fill: q.color, stroke: INK, 'stroke-width': 0.6 }),
      txt(x + 18, y, `${q.name} ${q.value}${spec.unit === '%' ? '' : ` ${spec.unit ?? ''}`}`.trim(), { class: 'at-ct at-ct-legend' }));
  });
  return s('svg', { class: 'at-chart-svg', viewBox: `0 0 ${W} ${Hh}`, role: 'img', 'aria-label': label }, kids, mid, leg,
    spec.unit ? txt(W - 8, 16, `(${spec.unit})`, { 'text-anchor': 'end', class: 'at-ct at-ct-tick' }) : null);
}

/** 원 크기 줄(bubbleRow — U4-3d, 39쪽 복원 녹지 면적): 원 넓이 ∝ 값(bubbleLayout), 원 아래 끝을 맞춰 한 줄, 원 아래 이름·값 두 줄, 교과서 색. */
function bubbleSvg(spec, label) {
  const col = 62, maxD = 54, top = 26;
  const items = bubbleLayout(spec, { maxD });
  const W = Math.max(460, items.length * col + 20), base = top + maxD, fill = spec.series[0].color || '#8b6bb1';
  const kids = items.map((it, i) => {
    const cx = 10 + col * (i + 0.5);
    return s('g', { class: 'at-ct-bar' },
      s('title', {}, `${it.name} ${fmtThousands(it.value)}${spec.unit ? ` ${spec.unit}` : ''}`),
      s('circle', { cx, cy: (base - it.d / 2).toFixed(1), r: (it.d / 2).toFixed(2), fill }),
      txt(cx, base + 15, it.name, { 'text-anchor': 'middle' }),
      txt(cx, base + 29, fmtThousands(it.value), { 'text-anchor': 'middle', class: 'at-ct at-ct-tick' }));
  });
  return s('svg', { class: 'at-chart-svg', viewBox: `0 0 ${W} ${base + 38}`, role: 'img', 'aria-label': label }, kids,
    spec.unit ? txt(W - 8, 14, `(${spec.unit})`, { 'text-anchor': 'end', class: 'at-ct at-ct-tick' }) : null);
}

/** 이 파일의 그래프·레이어 종류를 등록한다(여러 번 불러도 같음). */
export function installExtraCharts() {
  registerSvgChart('pie', ringSvg);          // chartPlan 이 svg 로 보내는 pie 는 ring 이 있는 것뿐
  registerSvgChart('bubbleRow', bubbleSvg);
  registerLayerType('chartSymbols', (id, d, { map, layerId, onPick }) => chartSymbolLayer(id, d, { map, layerId, onPick }));
}
