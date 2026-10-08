// © 2026 김용현
// 옆에서 본 단면 그림(2D SVG). 지구 한쪽 단면 위로 나란한 햇빛 줄기가 들어와
// 지표에 닿는 길이와 태양 고도(입사각)를 보여 준다.
import { h } from '../../src/shared/dom.js';

const CX = 40, CY = 186, R = 150;        // 지구 중심과 반지름(SVG 단위)
const RIGHT = 276;                         // 햇빛이 들어오는 오른쪽 끝
const LASER = '#ffb020';
const rad = (d) => (d * Math.PI) / 180;

// 수학 좌표(위가 +)의 각도 a(도)에 있는 지표 점
const onEarth = (a, r = R) => [CX + r * Math.cos(rad(a)), CY - r * Math.sin(rad(a))];
const f = (n) => n.toFixed(1);

function arcPath(a1, a2, r = R, cx = CX, cy = CY) {
  const [x1, y1] = [cx + r * Math.cos(rad(a1)), cy - r * Math.sin(rad(a1))];
  const [x2, y2] = [cx + r * Math.cos(rad(a2)), cy - r * Math.sin(rad(a2))];
  const large = Math.abs(a2 - a1) > 180 ? 1 : 0;
  const sweep = a2 > a1 ? 0 : 1; // 화면에서 반시계(각이 커짐) = sweep 0
  return `M${f(x1)},${f(y1)} A${r},${r} 0 ${large} ${sweep} ${f(x2)},${f(y2)}`;
}

// 같은 문서에 여러 자료가 붙어도 id 가 겹치지 않도록 접두어를 붙인다
const MARKER_ID = 'sun-inset-arrow';

/**
 * @param {SVGSVGElement} svg
 * @param {number[]} lats  레이저를 겨눈 위도(도)
 * @param {number} beamR   레이저 반지름(지구 반지름 = 1 기준)
 * @param {boolean} detail 각도 표시를 자세히 그릴지
 */
export function drawInset(svg, lats, beamR, detail) {
  const b = beamR * R;
  const out = [
    h('defs', {},
      h('marker', { id: MARKER_ID, viewBox: '0 0 8 8', refX: 7, refY: 4, markerWidth: 6, markerHeight: 6, orient: 'auto' },
        h('path', { d: 'M0,0 L8,4 L0,8 z', fill: LASER }))),
    h('circle', { cx: CX, cy: CY, r: R, fill: '#dce8f3', stroke: '#5b7a99', 'stroke-width': 1.5 }),
    h('line', { x1: CX, y1: CY, x2: f(onEarth(0)[0]), y2: CY, stroke: '#5b7a99', 'stroke-width': 1, 'stroke-dasharray': '3 3' }),
    h('text', { x: f(onEarth(0)[0] - 6), y: CY + 14, 'font-size': 11, fill: '#33506d', 'text-anchor': 'end' }, '적도'),
    h('text', { x: CX + 4, y: CY - R - 5, 'font-size': 11, fill: '#33506d' }, '북극'),
    h('text', { x: RIGHT, y: 14, 'font-size': 11, fill: '#9a6400', 'text-anchor': 'end', 'font-weight': 700 }, '햇빛(나란한 빛)'),
  ];

  for (const lat of lats) {
    const hy = R * Math.sin(rad(lat));
    const k = Math.cos(rad(lat));
    // 빛 줄기 5가닥: 지표에 닿으면 화살촉, 스쳐 지나가면 점선
    for (let i = 0; i < 5; i++) {
      const y = hy - b + (2 * b * i) / 4;
      const sy = CY - y;
      const hits = Math.abs(y) < R;
      const ex = hits ? CX + Math.sqrt(R * R - y * y) : 6;
      out.push(h('line', {
        x1: RIGHT, y1: f(sy), x2: f(ex + (hits ? 2 : 0)), y2: f(sy), stroke: LASER, 'stroke-width': 1.3,
        ...(hits ? { 'marker-end': `url(#${MARKER_ID})` } : { 'stroke-dasharray': '4 3', opacity: 0.6 }),
      }));
    }
    // 지표에 닿은 부분 (진하기 = 단위 면적당 에너지)
    const a1 = (Math.asin(Math.max(-1, (hy - b) / R)) * 180) / Math.PI;
    const a2 = (Math.asin(Math.min(1, (hy + b) / R)) * 180) / Math.PI;
    out.push(
      h('path', { d: arcPath(a1, a2), fill: 'none', stroke: LASER, 'stroke-width': 7, opacity: (0.18 + 0.82 * k).toFixed(2) }),
      h('path', { d: arcPath(a1, a2), fill: 'none', stroke: '#7a4b00', 'stroke-width': 1 }),
    );
    if (!detail) {
      const [lx, ly] = onEarth(lat, R + 12);
      out.push(h('text', { x: f(lx + 4), y: f(ly + 4), 'font-size': 10.5, fill: '#33506d' }, `${lat}° · 고도 ${90 - lat}°`));
    }
  }

  if (detail && lats.length === 1) {
    const lat = lats[0];
    const [px, py] = onEarth(lat);
    // 중심각 = 위도
    out.push(h('line', { x1: CX, y1: CY, x2: f(px), y2: f(py), stroke: '#5b7a99', 'stroke-width': 1, 'stroke-dasharray': '3 3' }));
    if (lat >= 4) {
      const [tx, ty] = onEarth(lat / 2, 30);
      out.push(
        h('path', { d: arcPath(0, lat, 24), fill: 'none', stroke: '#1f6feb', 'stroke-width': 1.5 }),
        h('text', { x: f(tx + 2), y: f(ty + 4), 'font-size': 10.5, fill: '#1f6feb', 'font-weight': 700 }, `위도 ${lat}°`),
      );
    }
    if (lat < 89.5) {
      // 지평면(접선)과 태양 고도
      const tx = Math.sin(rad(lat)), ty = Math.cos(rad(lat)); // 화면 좌표 방향(오른쪽 아래)
      const L = 46;
      const alt = 90 - lat;
      const r = 22;
      const ex = px + r * Math.cos(rad(-alt)), ey = py - r * Math.sin(rad(-alt));
      const lx = px + 30 * Math.cos(rad(-alt / 2)), ly = py - 30 * Math.sin(rad(-alt / 2));
      out.push(
        h('line', { x1: f(px - tx * L), y1: f(py - ty * L), x2: f(px + tx * L), y2: f(py + ty * L), stroke: '#33506d', 'stroke-width': 1.2 }),
        h('path', { d: `M${f(px + r)},${f(py)} A${r},${r} 0 0 1 ${f(ex)},${f(ey)}`, fill: 'none', stroke: '#d9480f', 'stroke-width': 1.8 }),
        h('text', { x: f(Math.min(lx, 280 - 76)), y: f(ly + 4), 'font-size': 11, fill: '#d9480f', 'font-weight': 700 }, `태양 고도 ${alt}°`),
      );
    }
  }
  svg.replaceChildren(...out);
}
