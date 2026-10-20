// © 2026 김용현
// src/atlas/layerStyle.js — 주제 레이어(layers.js)의 순수 함수(DOM 없음). 테스트: tests/atlas/layerStyle.test.mjs
//   범례 투명도(alphaOf), 확대에 따른 크기(zoomScale·symbolPx·classSymbolPx·flowWidthPx·lineWidthPx·barMetrics), 겹친 원 범례(nestedCircles), 곡선(bendControl·quadPath)·화살촉(arrowSize·endTangent·arrowHead·trimRunEnd),
//   선 잇기·나누기(unwrapLine·joinParts·splitJumps), 맞히기 거리(distToPolyline), 선 위 글자 자리(lineLabelAt),
//   이미지 색인(imageIndex), 색(parseHex·nearestColor), 기호 모양(shapePath·SHAPES), 화면 범례 항목(legendItems).

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const fmt1 = (v) => String(Math.round(v * 10) / 10); // 소수 한 자리 글자(SVG 경로용)
const fmt = (p) => `${fmt1(p[0])},${fmt1(p[1])}`;

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

/**
 * 크기 단계 기호(sizeBy 'class' — 30쪽 도시 인구 5단계) 지름: 단계마다 따로 [min, max] 로 자르면 큰 단계끼리 같은 크기가 되어 단계가 사라진다.
 * 그래서 배율 하나(pxPerPt × 확대 배율)를 단계 전체(sizes = 모든 단계 pt)에 맞춰 줄이거나 늘린다 — 가장 큰 단계가 max 를 넘지 않게,
 * (그 안에서) 가장 작은 단계가 min 보다 작지 않게. 지름 비 = pt 비가 어느 확대에서나 그대로.
 */
export function classSymbolPx(sizePt, k, sizes, { pxPerPt = 2.4, min = 4, max = 26 } = {}) {
  const hi = Math.max(...sizes), lo = Math.min(...sizes);
  let f = pxPerPt * zoomScale(k);
  if (lo * f < min) f = min / lo;
  if (hi * f > max) f = max / hi;
  return sizePt * f;
}

/**
 * 겹친 원 범례(legendStyle 'nested-circles'): 항목 [{cls, size(pt)}] → 큰 원부터 아래 끝을 맞춰 겹친 원과 오른쪽 값 글자 자리.
 * 반지름 = maxR × size / 가장 큰 size, 원 가운데 (maxR, 2maxR − r). 글자 줄(labelY)은 원 꼭대기 높이에서 시작하되 앞 글자와 gap 이상 떨어지게 아래로.
 * → {width(원 칸), height, items:[{cls, r, cx, cy, top, labelY}]}(큰 원부터)
 */
export function nestedCircles(entries, { maxR = 18, gap = 12 } = {}) {
  const list = [...entries].filter((e) => e.size > 0).sort((a, b) => b.size - a.size);
  const big = list[0]?.size || 1;
  let prev = -Infinity;
  const items = list.map((e) => {
    const r = (maxR * e.size) / big, cy = 2 * maxR - r, top = cy - r;
    const labelY = Math.max(top, prev + gap);
    prev = labelY;
    return { cls: e.cls, r, cx: maxR, cy, top, labelY };
  });
  return { width: 2 * maxR, height: Math.max(2 * maxR, prev + gap / 2) + 2, items };
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

/** 화살촉 크기: 선 굵기 w px → {len(길이), half(반폭)} px. */
export function arrowSize(w) {
  return { len: Math.round(Math.max(6, 3 * w) * 10) / 10, half: Math.round(Math.max(3, 1.6 * w) * 10) / 10 };
}

/**
 * quadPath 로 그린 곡선 끝의 접선: {tip, dir(단위 벡터)} | null. 셋 이상이면 마지막 마디(가운데점 → 끝점 직선)의 방향 = 마지막 두 점,
 * 두 점이면 베지어 조절점(bendControl) → 끝점. 길이 0 이면 null.
 */
export function endTangent(run, { bend = 0.18 } = {}) {
  if (!run || run.length < 2) return null;
  const tip = run[run.length - 1];
  const from = run.length === 2 ? bendControl(run[0], run[1], bend) : run[run.length - 2];
  const dx = tip[0] - from[0], dy = tip[1] - from[1], L = Math.hypot(dx, dy);
  return L > 1e-9 ? { tip, dir: [dx / L, dy / L] } : null;
}

/** 화살촉 세모: 끝 tip, 진행 방향 dir(단위), 선 굵기 w → {path, base(밑변 가운데)}. SVG marker(문서 전역 id)를 쓰지 않으려고 경로로 직접 그린다. */
export function arrowHead(tip, dir, w) {
  const { len, half } = arrowSize(w);
  const base = [tip[0] - dir[0] * len, tip[1] - dir[1] * len];
  const nx = -dir[1] * half, ny = dir[0] * half;
  return { base, path: `M${fmt(tip)}L${fmt([base[0] + nx, base[1] + ny])}L${fmt([base[0] - nx, base[1] - ny])}Z` };
}

/** 마지막 점을 마지막 마디 반대쪽으로 by 만큼 당긴 사본(선 끝이 화살촉 끝으로 삐져나오지 않게). 마지막 마디가 by × 1.2 보다 짧으면 그대로. */
export function trimRunEnd(run, by) {
  const n = run.length;
  if (n < 2) return run;
  const a = run[n - 2], b = run[n - 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (L <= by * 1.2) return run;
  const t = (L - by) / L;
  return [...run.slice(0, -1), [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]];
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

// ---------- 값 붙은 기호(31쪽 리스본 충전소 — 기호 옆 「아이콘 값」 상자) ----------
/** 값 아이콘(0~10 상자, 선 없이 채움 경로). 모르는 이름은 작은 네모. */
export const VALUE_ICONS = Object.freeze({
  charger: 'M2,1H7V9.5H2Z M3,2.2V4.6H6V2.2Z M7,3.4H8.4V7.2Q8.4,8.4 9.4,8.4V9.4Q7.4,9.4 7.4,7.2V4.4H7Z M4.9,5.2L3.6,7.3H4.6L4.1,8.8L5.6,6.6H4.6Z',
  person: 'M5,0.6A1.9,1.9 0 1,1 4.99,0.6Z M2.4,9.6V6.2Q2.4,4.4 5,4.4Q7.6,4.4 7.6,6.2V9.6Z',
});
export const valueIconPath = (name) => VALUE_ICONS[name] || 'M2,2H8V8H2Z';

/** 값 상자 크기(px): 줄마다 아이콘(fs) + 틈 + 글자(숫자·점 0.6em, 그 밖 1em) → {w, h, rows:[{icon, text, tw}]} */
export function valueBoxSize(values, { fs = 10, pad = 3, gap = 2, lineGap = 1 } = {}) {
  const rows = (values || []).map((v) => ({ icon: v.icon, text: String(v.text ?? ''), tw: [...String(v.text ?? '')].reduce((a, ch) => a + (/[\d.,\-]/.test(ch) ? 0.6 : 1) * fs, 0) }));
  const w = pad * 2 + fs + gap + Math.max(0, ...rows.map((r) => r.tw));
  const h = pad * 2 + rows.length * fs + Math.max(0, rows.length - 1) * lineGap;
  return { w, h, rows };
}

const boxHit = (a, b) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];
const boxOverlap = (a, b) => Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0])) * Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));
/**
 * 값 상자 자리(지명 배치기와 같은 생각 — 장애물을 피해 후보 자리 중 첫째): items [{xy(기호 화면 자리), r(기호 반지름), w, h}](우선순위 차례) →
 * 같은 차례로 [x0, y0, x1, y1]. 후보 = 오른쪽·왼쪽·오른쪽 위·오른쪽 아래·위·아래·왼쪽 위·왼쪽 아래(기호에서 r + gap 떨어짐).
 * 피할 것 = 모든 기호 원 상자 + 앞서 놓은 값 상자 + obstacles(화면 px 상자). 다 겹치면 겹친 넓이가 가장 작은 후보.
 */
export function placeValueBoxes(items, { gap = 3, obstacles = [] } = {}) {
  const syms = items.map((it) => [it.xy[0] - it.r, it.xy[1] - it.r, it.xy[0] + it.r, it.xy[1] + it.r]);
  const placed = [];
  return items.map((it) => {
    const [x, y] = it.xy, d = it.r + gap, { w, h } = it;
    const cands = [
      [x + d, y - h / 2], [x - d - w, y - h / 2], [x + d * 0.7, y - d * 0.7 - h], [x + d * 0.7, y + d * 0.7],
      [x - w / 2, y - d - h], [x - w / 2, y + d], [x - d * 0.7 - w, y - d * 0.7 - h], [x - d * 0.7 - w, y + d * 0.7],
    ].map(([x0, y0]) => [x0, y0, x0 + w, y0 + h]);
    const avoid = [...syms, ...placed, ...obstacles];
    let best = cands.find((c) => !avoid.some((b) => boxHit(c, b)));
    if (!best) best = cands.map((c) => [c, avoid.reduce((a, b) => a + boxOverlap(c, b), 0)]).sort((a, b) => a[1] - b[1])[0][0];
    placed.push(best);
    return best;
  });
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
 * 주제 레이어(FeatureCollection)는 properties.legend 그대로(나라 단위 단계구분도 countryClass 는 맨 위 legend), 밀도 음영(overlay JSON)은 단계마다 cls 'd1'·'d2'… 를 붙인다.
 */
export function legendItems(data) {
  // 나라 단위 단계구분도(countryClass)는 범례가 자료 맨 위 legend
  if (data?.type === 'countryClass') return (data.legend || []).map(({ present, ...e }) => ({ ...e }));
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
