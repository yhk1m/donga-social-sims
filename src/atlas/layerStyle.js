// © 2026 김용현
// src/atlas/layerStyle.js — 주제 레이어(layers.js)의 순수 함수(DOM 없음). 테스트: tests/atlas/layerStyle.test.mjs
//   범례 투명도(alphaOf), 확대에 따른 크기(zoomScale·symbolPx·flowWidthPx·lineWidthPx·barMetrics), 곡선(bendControl·quadPath)·화살촉(arrowMarker),
//   선 잇기·나누기(unwrapLine·joinParts·splitJumps), 맞히기 거리(distToPolyline), 선 위 글자 자리(lineLabelAt),
//   이미지 색인(imageIndex), 색(parseHex·nearestColor), 기호 모양(shapePath·SHAPES), 화면 범례 항목(legendItems).

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const r1 = (v) => String(Math.round(v * 10) / 10);
const fmt = (p) => `${r1(p[0])},${r1(p[1])}`;

/** 범례 상태에서 분류 cls 의 투명도: 범례가 없거나 활성이면 1, 다른 분류만 고른 상태면 dimAlpha. */
export function alphaOf(legend, cls, dimAlpha = 0.15) {
  if (!legend) return 1;
  return legend.isActive(cls) ? 1 : dimAlpha;
}

/** 확대 배율 k 에 따른 크기 배율: (k/ref)^exp 를 [min, max] 로 자름. 웹지도처럼 확대하면 기호가 조금 커지되 끝없이 커지지 않게. */
export function zoomScale(k, { ref = 2.2, exp = 0.5, min = 0.75, max = 2 } = {}) {
  return clamp(Math.pow(Math.max(k, 1e-9) / ref, exp), min, max);
}

/** 기호 지름: 지면 pt → 화면 px(pxPerPt × 확대 배율), [min, max] px. */
export function symbolPx(sizePt, k, { pxPerPt = 2.4, min = 4, max = 18 } = {}) {
  return clamp(sizePt * pxPerPt * zoomScale(k), min, max);
}

/** 흐름선 굵기: 범례 굵기(pt, 0.6/1/1.5/2) → px. 세계 지도 축척이라 기준 확대가 낮다. */
export function flowWidthPx(pt, k, { pxPerPt = 2.2, min = 1.2, max = 9 } = {}) {
  return clamp(pt * pxPerPt * zoomScale(k, { ref: 1.2, exp: 0.35, min: 0.8, max: 1.8 }), min, max);
}

/** 주제도 선(등온선·국경 주장선) 굵기 px. */
export function lineWidthPx(pt, k, { pxPerPt = 1.4, min = 0.8, max = 5 } = {}) {
  return clamp(pt * pxPerPt * zoomScale(k, { ref: 2.2, exp: 0.35, min: 0.8, max: 1.6 }), min, max);
}

/** 인구 막대(1억 명 = 한 칸): 칸 크기·틈·너비·높이(px). 사람 아이콘은 따로 위에 얹는다. */
export function barMetrics(value, k, { cellPx = 7, min = 3, max = 12 } = {}) {
  const cells = Math.max(1, Math.round(value || 0));
  const cell = clamp(cellPx * zoomScale(k, { ref: 2.2, exp: 0.5, min: 0.5, max: 1.8 }), min, max);
  const gap = Math.max(1, cell * 0.18);
  return { cells, cell, gap, width: cell * 1.2, height: cells * cell + (cells - 1) * gap };
}

/** 두 점 a→b 를 잇는 이차 베지어 조절점: 가운데에서 진행 방향 왼쪽(화면 y 아래 기준)으로 길이 × bend. */
export function bendControl(a, b, bend = 0.18) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  return [(a[0] + b[0]) / 2 + dy * bend, (a[1] + b[1]) / 2 - dx * bend];
}

/**
 * 화면 점들 → SVG 경로. 두 점이면 이차 베지어 하나(bendControl), 셋 이상이면 마디를 조절점으로 이웃 가운데점끼리 이차 곡선으로 잇는다
 * (꺾인 선을 부드럽게, 처음·끝 점은 정확히 지남). 점이 둘 미만이면 ''.
 */
export function quadPath(pts, { bend = 0.18 } = {}) {
  if (!pts || pts.length < 2) return '';
  if (pts.length === 2) return `M${fmt(pts[0])}Q${fmt(bendControl(pts[0], pts[1], bend))} ${fmt(pts[1])}`;
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  let d = `M${fmt(pts[0])}L${fmt(mid(pts[0], pts[1]))}`;
  for (let i = 1; i < pts.length - 1; i++) d += `Q${fmt(pts[i])} ${fmt(mid(pts[i], pts[i + 1]))}`;
  return `${d}L${fmt(pts[pts.length - 1])}`;
}

/** 화살촉(SVG marker, userSpaceOnUse): 선 굵기 w px → {len, half, path}. 끝(len, 0)이 화살 끝. */
export function arrowMarker(w) {
  const len = Math.round(Math.max(6, 3 * w) * 10) / 10, half = Math.round(Math.max(3, 1.6 * w) * 10) / 10;
  return { len, half, path: `M0,-${half}L${len},0L0,${half}Z` };
}

/** 선의 경도를 앞 점에 이어 붙인다(±360) — 날짜변경선을 넘어도 끊기지 않게. */
export function unwrapLine(coords) {
  const out = [];
  let prev = null;
  for (const [lon0, lat] of coords) {
    let lon = lon0;
    if (prev !== null) { while (lon - prev > 180) lon -= 360; while (lon - prev < -180) lon += 360; }
    out.push([lon, lat]); prev = lon;
  }
  return out;
}

/** MultiLineString 조각(날짜변경선에서 나뉜 흐름선)을 하나로: 경도를 이어 붙이고, 이음 자리의 같은 점은 하나만. */
export function joinParts(parts) {
  const out = [];
  for (const p of parts) {
    for (const q of p) {
      const last = out[out.length - 1];
      let lon = q[0];
      if (last) { while (lon - last[0] > 180) lon -= 360; while (lon - last[0] < -180) lon += 360; }
      if (last && Math.abs(lon - last[0]) < 1e-9 && Math.abs(q[1] - last[1]) < 1e-9) continue;
      out.push([lon, q[1]]);
    }
  }
  return out;
}

/**
 * 경위도 점들을 투영해 화면 조각들로 나눈다. 투영 못 하는 점, 그리고 이음매(날짜변경선·구드 틈)를 건너는 마디에서 끊는다.
 * 이음매 판정: 마디의 경위도 가운데점을 투영한 자리가 화면 가운데점에서 max(tolPx, 길이 × tolFrac) 넘게 벗어나면 끊긴 것.
 * 점이 하나뿐인 조각은 버린다.
 */
export function splitJumps(geoPts, project, { tolPx = 4, tolFrac = 0.3 } = {}) {
  const runs = [];
  let cur = [], prevG = null, prevS = null;
  const flush = () => { if (cur.length >= 2) runs.push(cur); cur = []; };
  for (const g of geoPts) {
    const s = project(g);
    if (!s || !Number.isFinite(s[0]) || !Number.isFinite(s[1])) { flush(); prevG = prevS = null; continue; }
    if (prevS) {
      const m = project([(prevG[0] + g[0]) / 2, (prevG[1] + g[1]) / 2]);
      const len = Math.hypot(s[0] - prevS[0], s[1] - prevS[1]);
      const ok = m && Math.hypot(m[0] - (s[0] + prevS[0]) / 2, m[1] - (s[1] + prevS[1]) / 2) <= Math.max(tolPx, len * tolFrac);
      if (!ok) flush();
    }
    cur.push(s);
    prevG = g; prevS = s;
  }
  flush();
  return runs;
}

/** 점 xy 에서 꺾은선 pts 까지 가장 가까운 거리(px). 점이 하나면 그 점까지, 없으면 Infinity. */
export function distToPolyline(xy, pts) {
  if (!pts || !pts.length) return Infinity;
  if (pts.length === 1) return Math.hypot(xy[0] - pts[0][0], xy[1] - pts[0][1]);
  let best = Infinity;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], dx = b[0] - a[0], dy = b[1] - a[1];
    const L = dx * dx + dy * dy;
    const t = L ? clamp(((xy[0] - a[0]) * dx + (xy[1] - a[1]) * dy) / L, 0, 1) : 0;
    const d = Math.hypot(xy[0] - (a[0] + t * dx), xy[1] - (a[1] + t * dy));
    if (d < best) best = d;
  }
  return best;
}

/**
 * 선 위 글자 자리: 화면(0~W, 0~H) 안에 든 점들로 이어진 조각 중 가장 긴 것의 길이 가운데 → {at, angle}(각도는 화면 기준, (−90, 90]).
 * 화면 안 조각이 없으면 null.
 */
export function lineLabelAt(runs, W, H, { margin = 0 } = {}) {
  const inside = (p) => p[0] >= margin && p[0] <= W - margin && p[1] >= margin && p[1] <= H - margin;
  let best = null, bestLen = 0;
  for (const run of runs) {
    let sub = [];
    const take = () => {
      if (sub.length >= 2) {
        let len = 0;
        for (let i = 1; i < sub.length; i++) len += Math.hypot(sub[i][0] - sub[i - 1][0], sub[i][1] - sub[i - 1][1]);
        if (len > bestLen) { bestLen = len; best = sub; }
      }
      sub = [];
    };
    for (const p of run) { if (inside(p)) sub.push(p); else take(); }
    take();
  }
  if (!best) return null;
  let rest = bestLen / 2;
  for (let i = 1; i < best.length; i++) {
    const a = best[i - 1], b = best[i], seg = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (rest <= seg || i === best.length - 1) {
      const t = seg ? Math.min(1, rest / seg) : 0;
      let angle = (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;
      if (angle > 90) angle -= 180; else if (angle <= -90) angle += 180;
      return { at: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], angle };
    }
    rest -= seg;
  }
  return null;
}

/** 지면 pt → 이미지 화소 좌표(화소 가운데 = 정수). bbox = 이미지가 덮는 지면 상자 [x0, y0, x1, y1], 밖이면 null. */
export function imageIndex([x, y], bbox, w, h) {
  if (x < bbox[0] || x > bbox[2] || y < bbox[1] || y > bbox[3]) return null;
  return [((x - bbox[0]) / (bbox[2] - bbox[0])) * w - 0.5, ((y - bbox[1]) / (bbox[3] - bbox[1])) * h - 0.5];
}

/** '#rrggbb' → [r, g, b] */
export function parseHex(hex) {
  const v = parseInt(String(hex).replace('#', ''), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

/** RGB 에 가장 가까운 팔레트 색의 번호(RGB 거리 제곱). */
export function nearestColor(rgb, palette) {
  let best = 0, bd = Infinity;
  for (let i = 0; i < palette.length; i++) {
    const p = palette[i], d = (rgb[0] - p[0]) ** 2 + (rgb[1] - p[1]) ** 2 + (rgb[2] - p[2]) ** 2;
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}

/** 기호 모양(반지름 1 상자 안, 가운데 원점). 모르는 이름은 원. */
export const SHAPES = ['circle', 'square', 'diamond', 'triangle', 'triangle-down'];
const SHAPE_D = {
  circle: 'M1,0A1,1 0 1,1 -1,0A1,1 0 1,1 1,0Z',
  square: 'M-0.85,-0.85H0.85V0.85H-0.85Z',
  diamond: 'M0,-1L1,0L0,1L-1,0Z',
  triangle: 'M0,-1L0.95,0.7L-0.95,0.7Z',
  'triangle-down': 'M0,1L0.95,-0.7L-0.95,-0.7Z',
};
export function shapePath(shape) { return SHAPE_D[shape] || SHAPE_D.circle; }

/**
 * 레이어 자료 → 화면 범례 항목 [{cls, label, color, kind, shape?, pattern?, dashed?, geometry?, values?, widths?, unit?}].
 * 주제 레이어(FeatureCollection)는 properties.legend 그대로, 밀도 음영(overlay JSON)은 단계마다 cls 'd1'·'d2'… 를 붙인다.
 */
export function legendItems(data) {
  if (data?.type === 'FeatureCollection') return (data.properties?.legend || []).map(({ present, ...e }) => ({ ...e }));
  return (data?.legend || []).map((e, i) => ({ cls: `d${i + 1}`, label: e.label, color: e.color, kind: 'fill' }));
}

/**
 * 격자 표본(경위도, invertGrid 결과 {cols, rows, lon, lat})마다 f([lon, lat]) → [x, y] 를 구하되, block 표본 간격의 마디에서만 정확히 계산하고
 * 칸 안은 양선형 보간한다(f 가 매끄러울 때 — 교과서 투영식 → 이미지 화소). 칸의 마디 중 하나라도 없거나(지도 밖·f 가 null), 칸 안에 지도 밖 표본이 있거나,
 * 칸 가운데의 정확한 값과 보간 값이 tol 넘게 다르면 그 칸은 표본마다 정확히 계산한다. 값이 없는 표본은 NaN. → {x: Float64Array, y: Float64Array}
 */
export function mapGridBlocks({ cols, rows, lon, lat }, f, { block = 4, tol = 0.25 } = {}) {
  const n = cols * rows;
  const X = new Float64Array(n).fill(NaN), Y = new Float64Array(n).fill(NaN);
  const at = (k) => (Number.isNaN(lon[k]) ? null : f([lon[k], lat[k]]));
  const exact = (i0, i1, j0, j1) => {
    for (let j = j0; j <= j1; j++) for (let i = i0, k = j * cols + i0; i <= i1; i++, k++) { const p = at(k); if (p) { X[k] = p[0]; Y[k] = p[1]; } }
  };
  for (let j0 = 0; j0 < rows; j0 += block) {
    const j1 = Math.min(rows - 1, j0 + block);
    for (let i0 = 0; i0 < cols; i0 += block) {
      const i1 = Math.min(cols - 1, i0 + block);
      if (i1 === i0 || j1 === j0) { exact(i0, i1, j0, j1); continue; }
      const k00 = j0 * cols + i0, k10 = j0 * cols + i1, k01 = j1 * cols + i0, k11 = j1 * cols + i1;
      const p00 = at(k00), p10 = at(k10), p01 = at(k01), p11 = at(k11);
      let ok = !!(p00 && p10 && p01 && p11);
      if (ok) for (let j = j0; j <= j1 && ok; j++) for (let i = i0; i <= i1; i++) if (Number.isNaN(lon[j * cols + i])) { ok = false; break; }
      if (ok) {
        const ic = (i0 + i1) >> 1, jc = (j0 + j1) >> 1, c = at(jc * cols + ic);
        const u = (ic - i0) / (i1 - i0), v = (jc - j0) / (j1 - j0);
        const bx = (p00[0] * (1 - u) + p10[0] * u) * (1 - v) + (p01[0] * (1 - u) + p11[0] * u) * v;
        const by = (p00[1] * (1 - u) + p10[1] * u) * (1 - v) + (p01[1] * (1 - u) + p11[1] * u) * v;
        ok = !!c && Math.abs(c[0] - bx) <= tol && Math.abs(c[1] - by) <= tol;
      }
      if (!ok) { exact(i0, i1, j0, j1); continue; }
      for (let j = j0; j <= j1; j++) {
        const v = (j - j0) / (j1 - j0);
        const ax = p00[0] + (p01[0] - p00[0]) * v, ay = p00[1] + (p01[1] - p00[1]) * v;
        const bx = p10[0] + (p11[0] - p10[0]) * v, by = p10[1] + (p11[1] - p10[1]) * v;
        for (let i = i0, k = j * cols + i0; i <= i1; i++, k++) {
          const u = (i - i0) / (i1 - i0);
          X[k] = ax + (bx - ax) * u; Y[k] = ay + (by - ay) * u;
        }
      }
    }
  }
  return { x: X, y: Y };
}
