// © 2026 김용현
// src/atlas/labels.js — 지명 배치(순수 함수, DOM 없음). 우선순위(rank)와 확대 수준으로 지명을 골라 겹치지 않게 놓는다.
//   rank 1(나라·대양) ~ 6(작은 지명). rank r 은 k ≥ MIN_K[r] 일 때부터 보인다(항목에 minK 가 있으면 그것).
//   놓는 순서: rank 오름차순 → 글자 크기 내림차순 → 입력 순서.
//   종류:
//     점 지명(xy)        기호(symbol)가 있으면 위·오른쪽·왼쪽·아래 자리 중 처음 빈 곳, 없으면 xy 가운데.
//     선·면 지명(pathXY)  화면에 투영한 글자 줄(교과서 path) 가운데에 줄 방향으로. 줄이 글자보다 길면 글자 사이를 벌리고
//                        (글자 폭의 maxSpread 배까지), 짧으면 가운데에 자연 간격(줄 끝은 연장). 줄이 거의 곧으면
//                        {at, angle, spacing} 한 덩어리, 굽었으면 글자마다 {ch, at, angle}(glyphs).
//                        읽는 방향은 늘 왼쪽→오른쪽: 줄 방향 각이 ±90° 를 넘으면 줄을 뒤집는다.
//     각도만 있는 지명(xy + angle)  그 각도의 곧은 줄로 본다.
//   충돌: 글자 줄을 따라 표본 상자(글자 높이 크기의 축 정렬 상자)를 늘어놓아 회전한 글자를 어림한다.
//         보일 수 있는(minK 통과) 기호 자리도 미리 장애물로 넣는다(높은 등급 글자가 낮은 등급 기호를 가리지 않게, 자기 기호는 뺌).
//   각도 단위: 도, 화면 좌표(y 아래로) 기준 시계 방향 + (SVG rotate 와 같음).
//   measure(text, size) → 글자 폭(px) 은 주입한다(렌더러는 오프스크린 캔버스 measureText).

export const MIN_K = { 1: 1, 2: 1, 3: 1.8, 4: 3, 5: 5, 6: 9 };
const OFFSETS = [[0, -1], [1, 0], [-1, 0], [0, 1]]; // 위·오른쪽·왼쪽·아래 (기호 있는 지명)
const RAD = Math.PI / 180;

const minKOf = (p) => p.minK ?? MIN_K[p.rank] ?? 9;
const hit = (b, o) => b[0] < o[2] && b[2] > o[0] && b[1] < o[3] && b[3] > o[1];
const inside = (b, w, h) => b[0] >= 0 && b[1] >= 0 && b[2] <= w && b[3] <= h;
const angDiff = (a, b) => Math.abs(((a - b + 540) % 360) - 180);
const unionBox = (boxes) => boxes.reduce((u, b) => [Math.min(u[0], b[0]), Math.min(u[1], b[1]), Math.max(u[2], b[2]), Math.max(u[3], b[3])], [Infinity, Infinity, -Infinity, -Infinity]);

/** 놓인 상자 격자 색인(칸 64px) — 지명이 많아도 충돌 검사가 빠르게. */
function createGrid(cell = 64) {
  const cells = new Map();
  const keys = (b) => {
    const out = [];
    for (let gx = Math.floor(b[0] / cell); gx <= Math.floor(b[2] / cell); gx++) {
      for (let gy = Math.floor(b[1] / cell); gy <= Math.floor(b[3] / cell); gy++) out.push(`${gx},${gy}`);
    }
    return out;
  };
  return {
    add: (b) => { for (const key of keys(b)) { if (!cells.has(key)) cells.set(key, []); cells.get(key).push(b); } },
    hits: (b) => keys(b).some((key) => (cells.get(key) || []).some((o) => hit(b, o))),
  };
}

/** 연이어 같은 점을 뺀 폴리라인 + 누적 길이. */
function prepPath(pts) {
  const p = [];
  for (const q of pts) if (!p.length || Math.hypot(q[0] - p.at(-1)[0], q[1] - p.at(-1)[1]) > 1e-9) p.push(q);
  const cum = [0];
  for (let i = 1; i < p.length; i++) cum.push(cum[i - 1] + Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]));
  return { pts: p, cum, L: cum.at(-1) };
}

/** 줄 위 호 길이 s 의 점(줄 밖이면 끝 마디를 연장). */
function pointAt({ pts, cum, L }, s) {
  let i = 0;
  if (s >= L) i = pts.length - 2;
  else if (s > 0) while (cum[i + 1] < s) i++;
  const a = pts[i], b = pts[i + 1], seg = cum[i + 1] - cum[i];
  const t = (s - cum[i]) / seg;
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

const angleOf = (a, b) => Math.atan2(b[1] - a[1], b[0] - a[0]) / RAD;

/** 선·면 지명 하나의 배치(충돌 검사 전). */
function layoutPath(p, pathXY, { measure, pad, maxSpread, straightDeg }) {
  let P = prepPath(pathXY);
  const h = p.size * 1.2;
  const chars = [...p.name];
  const widths = chars.map((ch) => measure(ch, p.size));
  const w = widths.reduce((s, v) => s + v, 0);
  if (P.pts.length < 2) return null;
  const span = Math.max(w, Math.min(P.L, w * maxSpread));
  const spacing = chars.length > 1 ? (span - w) / (chars.length - 1) : 0;
  let s0 = P.L / 2 - span / 2;
  let chord = angleOf(pointAt(P, s0), pointAt(P, s0 + span));
  if (chord > 90 || chord <= -90) { // 뒤집어 왼쪽→오른쪽으로 읽히게
    P = prepPath([...P.pts].reverse());
    s0 = P.L / 2 - span / 2;
    chord = angleOf(pointAt(P, s0), pointAt(P, s0 + span));
  }
  // 글자마다 줄 위 자리·접선(글자 폭 양 끝을 잇는 방향)
  const glyphs = [];
  let cur = s0;
  chars.forEach((ch, i) => {
    const gw = widths[i], c = cur + gw / 2, half = Math.max(gw, 1e-6) / 2;
    glyphs.push({ ch, at: pointAt(P, c), angle: angleOf(pointAt(P, c - half), pointAt(P, c + half)), w: gw });
    cur += gw + spacing;
  });
  const straight = glyphs.every((g) => angDiff(g.angle, chord) <= straightDeg);
  const boxes = [];
  if (straight) {
    const e = pad + h / 2;
    const run = Math.max(0, span - h); // 표본 상자 가운데가 움직이는 길이(양 끝 상자가 글자 끝에 닿게)
    const n = run > 0 ? Math.ceil(run / (h * 0.8)) : 0;
    const A = pointAt(P, s0), B = pointAt(P, s0 + span), ux = (B[0] - A[0]) / span, uy = (B[1] - A[1]) / span;
    const first = span > h ? h / 2 : span / 2;
    for (let i = 0; i <= n; i++) {
      const d = first + (n ? (run * i) / n : 0);
      const x = A[0] + ux * d, y = A[1] + uy * d;
      boxes.push([x - e, y - e, x + e, y + e]);
    }
    return { at: pointAt(P, s0 + span / 2), angle: chord, spacing, span, boxes };
  }
  for (const g of glyphs) {
    const e = Math.max(g.w, h) / 2 + pad;
    boxes.push([g.at[0] - e, g.at[1] - e, g.at[0] + e, g.at[1] + e]);
  }
  return {
    at: pointAt(P, s0 + span / 2), angle: chord, spacing, span, boxes,
    glyphs: glyphs.map(({ ch, at, angle }) => ({ ch, at, angle })),
  };
}

/**
 * points: [{name, rank, size, xy?, pathXY?, angle?, symbol?, minK?, …}] — xy·pathXY 는 화면 좌표(렌더러가 투영).
 * 반환: 놓인 지명만, 놓은 순서. 각 항목 = 입력 항목 + {at, angle, boxes, bbox} (+ 선·면 지명은 spacing·span, 굽은 줄은 glyphs).
 */
export function placeLabels(points, { width, height, measure, k, pad = 2, symbolR = 3, maxSpread = 3, straightDeg = 8 }) {
  const eligible = points
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => k >= minKOf(p))
    .sort((a, b) => a.p.rank - b.p.rank || b.p.size - a.p.size || a.i - b.i);
  // 보일 수 있는 기호 자리 = 장애물(자기 기호는 뺌)
  const symbolBoxes = new Map();
  for (const { p, i } of eligible) {
    if (p.symbol && p.xy) symbolBoxes.set(i, [p.xy[0] - symbolR, p.xy[1] - symbolR, p.xy[0] + symbolR, p.xy[1] + symbolR]);
  }
  const taken = createGrid();
  const symbols = [...symbolBoxes];
  const free = (bs, self) => bs.every((b) => inside(b, width, height) && !taken.hits(b)
    && !symbols.some(([j, o]) => j !== self && hit(b, o)));
  const placed = [];
  for (const { p, i } of eligible) {
    let pathXY = p.pathXY;
    if (!pathXY && p.xy && p.angle && !p.symbol) { // 각도만 있는 지명 → 그 각도의 곧은 줄
      const w = measure(p.name, p.size), dx = (Math.cos(p.angle * RAD) * w) / 2, dy = (Math.sin(p.angle * RAD) * w) / 2;
      pathXY = [[p.xy[0] - dx, p.xy[1] - dy], [p.xy[0] + dx, p.xy[1] + dy]];
    }
    if (pathXY && pathXY.length >= 2) {
      const lay = layoutPath(p, pathXY, { measure, pad, maxSpread, straightDeg });
      if (!lay || !free(lay.boxes, i)) continue;
      lay.boxes.forEach(taken.add);
      placed.push({ ...p, ...lay, bbox: unionBox(lay.boxes) });
      continue;
    }
    if (!p.xy) continue;
    const w = measure(p.name, p.size), hgt = p.size * 1.2;
    const cands = p.symbol ? OFFSETS.map(([dx, dy]) => [p.xy[0] + dx * (w / 2 + 6), p.xy[1] + dy * (hgt / 2 + 4)]) : [p.xy];
    for (const [cx, cy] of cands) {
      const b = [cx - w / 2 - pad, cy - hgt / 2 - pad, cx + w / 2 + pad, cy + hgt / 2 + pad];
      if (!free([b], i)) continue;
      taken.add(b);
      placed.push({ ...p, at: [cx, cy], angle: 0, boxes: [b], bbox: b });
      break;
    }
  }
  return placed;
}
