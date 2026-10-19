// © 2026 김용현
// src/atlas/labels.js — 지명 배치(순수 함수, DOM 없음). 우선순위(rank)와 확대 수준으로 지명을 골라 겹치지 않게 놓는다.
//
// 좌표 공간
//   - 입력 xy·pathXY 와 출력 at·boxes·bbox·glyphs[].at 은 모두 **화면 px**(무대 왼쪽 위 원점, y 아래로).
//     렌더러가 경위도(places.json lon/lat·path)를 투영하고 확대 변환(k, x, y)까지 적용해 넘긴다.
//   - 각도(angle, glyphs[].angle)는 도, 화면 기준 시계 방향 +(SVG rotate 와 같음). 늘 (−90°, 90°] — 뒤집힌 글자 없음.
//   - width·height = 무대 크기 px, k = d3-zoom 확대 배율(지명 등급의 보이는 수준만 정함).
//
// 규칙
//   rank 1(나라·대양) ~ 6(작은 지명), 없으면 6. rank r 은 k ≥ MIN_K[r] 일 때부터 보인다(항목에 minK 가 있으면 그것).
//   놓는 순서: rank 오름차순 → 글자 크기 내림차순 → 입력 순서.
//   점 지명(xy)        기호(symbol)가 있으면 위·오른쪽·왼쪽·아래 자리 중 처음 빈 곳, 없으면 xy 가운데.
//                      기호와 글자 상자 사이 간격 = symbolR + pad + 1(자기 기호를 가리지 않음).
//   선·면 지명(pathXY) 글자 줄 가운데에 줄 방향으로. 줄이 글자보다 길면 글자 사이를 벌리고(글자 폭의 maxSpread 배까지),
//                      짧으면 가운데에 자연 간격(줄 끝은 연장). 거의 곧으면 {at, angle, spacing} 한 덩어리,
//                      굽었으면 글자마다 {ch, at, angle}(glyphs). 읽는 방향은 왼쪽→오른쪽(줄 방향이 ±90° 넘으면 줄을 뒤집고,
//                      U·S 자 줄에서 글자 하나의 각이 넘으면 그 글자만 180° 돌림).
//   각도만 있는 지명(xy + angle, 기호 없음)  그 각도의 곧은 줄로 본다.
//   충돌: 글자 줄을 따라 표본 상자(글자 높이 크기의 축 정렬 상자)를 늘어놓아 회전한 글자를 어림한다.
//         보일 수 있는(minK 통과) 기호 자리도 미리 장애물로 넣는다(높은 등급 글자가 낮은 등급 기호를 가리지 않게, 자기 기호는 뺌).
//   measure(text, size) → 글자 폭(px) 은 주입한다. 렌더러는 createMeasureCache(오프스크린 캔버스 measureText)로 한 번 만들어 계속 쓴다.

export const MIN_K = { 1: 1, 2: 1, 3: 1.8, 4: 3, 5: 5, 6: 9 };
export const DEFAULT_RANK = 6;
/** 기호 있는 지명의 후보 자리 방향: 위·오른쪽·왼쪽·아래 */
const SYMBOL_SIDES = [[0, -1], [1, 0], [-1, 0], [0, 1]];
const LINE_HEIGHT = 1.2; // 글자 상자 높이 = 글자 크기 × 1.2
const SAMPLE_STEP = 0.8; // 곧은 줄 표본 상자 간격 = 글자 높이 × 0.8
const GRID_CELL = 64; // 충돌 격자 칸(px)
const RAD = Math.PI / 180;

const rankOf = (p) => p.rank ?? DEFAULT_RANK;
const minKOf = (p) => p.minK ?? MIN_K[rankOf(p)] ?? 9;
const hit = (b, o) => b[0] < o[2] && b[2] > o[0] && b[1] < o[3] && b[3] > o[1];
const inside = (b, w, h) => b[0] >= 0 && b[1] >= 0 && b[2] <= w && b[3] <= h;
const angDiff = (a, b) => Math.abs(((a - b + 540) % 360) - 180);
const upright = (a) => (a > 90 ? a - 180 : a <= -90 ? a + 180 : a);
const angleOf = (a, b) => Math.atan2(b[1] - a[1], b[0] - a[0]) / RAD;

/** measure 를 글자·크기별로 기억하는 함수로 감싼다(placeLabels 호출 사이에도 유지). */
export function createMeasureCache(measure) {
  const bySize = new Map();
  return (text, size) => {
    let m = bySize.get(size);
    if (!m) bySize.set(size, (m = new Map()));
    let w = m.get(text);
    if (w === undefined) m.set(text, (w = measure(text, size)));
    return w;
  };
}

/** 상자 격자 색인(정수 칸 열쇠). owner 가 있는 상자는 hits(b, self) 에서 self 것을 건너뛴다. */
function createGrid(cell = GRID_CELL) {
  const cells = new Map();
  const K = 1 << 16, OFF = 1 << 15; // 칸 좌표 −32768 ~ 32767
  const add = (b, owner = -1) => {
    const gx0 = Math.floor(b[0] / cell), gx1 = Math.floor(b[2] / cell), gy0 = Math.floor(b[1] / cell), gy1 = Math.floor(b[3] / cell);
    for (let gx = gx0; gx <= gx1; gx++) {
      for (let gy = gy0; gy <= gy1; gy++) {
        const key = (gx + OFF) * K + (gy + OFF);
        let arr = cells.get(key);
        if (!arr) cells.set(key, (arr = []));
        arr.push(b, owner);
      }
    }
  };
  const hits = (b, self = -2) => {
    const gx0 = Math.floor(b[0] / cell), gx1 = Math.floor(b[2] / cell), gy0 = Math.floor(b[1] / cell), gy1 = Math.floor(b[3] / cell);
    for (let gx = gx0; gx <= gx1; gx++) {
      for (let gy = gy0; gy <= gy1; gy++) {
        const arr = cells.get((gx + OFF) * K + (gy + OFF));
        if (!arr) continue;
        for (let i = 0; i < arr.length; i += 2) if (arr[i + 1] !== self && hit(b, arr[i])) return true;
      }
    }
    return false;
  };
  return { add, hits };
}

/** 연이어 같은 점을 뺀 폴리라인 + 누적 길이. */
function prepPath(pts) {
  const p = [];
  for (const q of pts) {
    const last = p[p.length - 1];
    if (!last || Math.hypot(q[0] - last[0], q[1] - last[1]) > 1e-9) p.push(q);
  }
  const cum = [0];
  for (let i = 1; i < p.length; i++) cum.push(cum[i - 1] + Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]));
  return { pts: p, cum, L: cum[cum.length - 1] };
}

/** 줄 위 호 길이 s 의 점(줄 밖이면 끝 마디를 연장). */
function pointAt({ pts, cum, L }, s) {
  let i = 0;
  if (s >= L) i = pts.length - 2;
  else if (s > 0) while (cum[i + 1] < s) i++;
  const a = pts[i], b = pts[i + 1], t = (s - cum[i]) / (cum[i + 1] - cum[i]);
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

/** 선·면 지명 하나의 배치(충돌 검사 전). P = prepPath 결과(점 2개 이상). */
function layoutPath(p, P, { measure, pad, maxSpread, straightDeg }) {
  const h = p.size * LINE_HEIGHT;
  const chars = [...p.name];
  const widths = chars.map((ch) => measure(ch, p.size));
  let w = 0;
  for (const v of widths) w += v;
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
  let cur = s0, straight = true;
  for (let i = 0; i < chars.length; i++) {
    const gw = widths[i], c = cur + gw / 2, half = Math.max(gw, 1e-6) / 2;
    const angle = angleOf(pointAt(P, c - half), pointAt(P, c + half));
    if (angDiff(angle, chord) > straightDeg) straight = false;
    glyphs.push({ ch: chars[i], at: pointAt(P, c), angle, w: gw });
    cur += gw + spacing;
  }
  const at = pointAt(P, s0 + span / 2);
  const boxes = [];
  if (straight) {
    const e = pad + h / 2;
    const run = Math.max(0, span - h); // 표본 상자 가운데가 움직이는 길이(양 끝 상자가 글자 끝에 닿게)
    const n = run > 0 ? Math.ceil(run / (h * SAMPLE_STEP)) : 0;
    const A = pointAt(P, s0), B = pointAt(P, s0 + span), ux = (B[0] - A[0]) / span, uy = (B[1] - A[1]) / span;
    const first = span > h ? h / 2 : span / 2;
    for (let i = 0; i <= n; i++) {
      const d = first + (n ? (run * i) / n : 0);
      const x = A[0] + ux * d, y = A[1] + uy * d;
      boxes.push([x - e, y - e, x + e, y + e]);
    }
    return { at, angle: chord, spacing, span, boxes };
  }
  for (const g of glyphs) {
    const e = Math.max(g.w, h) / 2 + pad;
    boxes.push([g.at[0] - e, g.at[1] - e, g.at[0] + e, g.at[1] + e]);
  }
  return { at, angle: chord, spacing, span, boxes, glyphs: glyphs.map((g) => ({ ch: g.ch, at: g.at, angle: upright(g.angle) })) };
}

/**
 * points: [{name, rank?, size, xy?, pathXY?, angle?, symbol?, minK?, …}] — 좌표 공간은 파일 머리 설명.
 * opts: {width, height, measure, k, pad=2, symbolR=3, maxSpread=3, straightDeg=8}
 * 반환: 놓인 지명만, 놓은 순서. 각 항목 = 입력 항목(pathXY 는 뺌) + {at, angle, boxes, bbox}
 *       (+ 선·면 지명은 spacing·span, 굽은 줄은 glyphs:[{ch, at, angle}]).
 */
export function placeLabels(points, { width, height, measure, k, pad = 2, symbolR = 3, maxSpread = 3, straightDeg = 8 }) {
  const gap = symbolR + pad + 1; // 기호 가장자리 ↔ 글자 상자 사이
  const eligible = [];
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (!p.name || k < minKOf(p)) continue;
    eligible.push(i);
  }
  eligible.sort((a, b) => rankOf(points[a]) - rankOf(points[b]) || points[b].size - points[a].size || a - b);
  const taken = createGrid();
  const symbols = createGrid();
  for (const i of eligible) {
    const p = points[i];
    if (p.symbol && p.xy) symbols.add([p.xy[0] - symbolR, p.xy[1] - symbolR, p.xy[0] + symbolR, p.xy[1] + symbolR], i);
  }
  const free = (bs, self) => {
    for (const b of bs) if (!inside(b, width, height) || taken.hits(b) || symbols.hits(b, self)) return false;
    return true;
  };
  const placed = [];
  for (const i of eligible) {
    const p = points[i];
    const { pathXY: rawPath, ...rest } = p;
    let pathXY = rawPath;
    if (!pathXY && p.xy && p.angle && !p.symbol) { // 각도만 있는 지명 → 그 각도의 곧은 줄
      const w = measure(p.name, p.size), dx = (Math.cos(p.angle * RAD) * w) / 2, dy = (Math.sin(p.angle * RAD) * w) / 2;
      pathXY = [[p.xy[0] - dx, p.xy[1] - dy], [p.xy[0] + dx, p.xy[1] + dy]];
    }
    if (pathXY) {
      const P = pathXY.length >= 2 ? prepPath(pathXY) : null;
      if (P && P.pts.length >= 2) {
        const lay = layoutPath(p, P, { measure, pad, maxSpread, straightDeg });
        if (!free(lay.boxes, i)) continue;
        lay.boxes.forEach((b) => taken.add(b));
        let bbox = [Infinity, Infinity, -Infinity, -Infinity];
        for (const b of lay.boxes) bbox = [Math.min(bbox[0], b[0]), Math.min(bbox[1], b[1]), Math.max(bbox[2], b[2]), Math.max(bbox[3], b[3])];
        placed.push({ ...rest, ...lay, bbox });
        continue;
      }
      if (!p.xy) continue; // 줄이 점 하나뿐이고 xy 도 없으면 건너뜀
    }
    if (!p.xy) continue;
    const w = measure(p.name, p.size), hgt = p.size * LINE_HEIGHT;
    const sides = p.symbol ? SYMBOL_SIDES : [[0, 0]];
    for (const [dx, dy] of sides) {
      const cx = p.xy[0] + dx * (w / 2 + pad + gap), cy = p.xy[1] + dy * (hgt / 2 + pad + gap);
      const b = [cx - w / 2 - pad, cy - hgt / 2 - pad, cx + w / 2 + pad, cy + hgt / 2 + pad];
      if (!free([b], i)) continue;
      taken.add(b);
      placed.push({ ...rest, at: [cx, cy], angle: 0, boxes: [b], bbox: b });
      break;
    }
  }
  return placed;
}
