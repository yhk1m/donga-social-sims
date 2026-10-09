// © 2026 김용현
// src/atlas/labelLayout.js — 렌더러가 지명을 놓기 전후에 쓰는 보조 계산(순수 함수). labels.js(배치)와 짝. 테스트: tests/atlas/labelLayout.test.mjs
//   fontPx(교과서 pt → 화면 px), trimPath(자간 상한용 줄 줄이기), glyphLayout(글자별·세로 배치), pathBroken(투영한 줄 끊김 → 점 지명으로).
import { geoDistance, geoInterpolate } from 'd3-geo';

const finite2 = (p) => !!p && Number.isFinite(p[0]) && Number.isFinite(p[1]);

/**
 * 경위도 줄 geoPts 를 proj 로 투영하면 끊기는가(구드 단속 틈·날짜변경선 이음매·투영 실패).
 * 마디마다 0.5° 간격으로 표본을 찍어, 한 걸음이 걸음 중앙값의 4배(그리고 3px)를 넘으면 끊김.
 * 적도 근처 구드 틈(1px 남짓)은 끊김으로 보지 않는다.
 */
export function pathBroken(geoPts, proj, stepDeg = 0.5) {
  const pts = [];
  for (let i = 1; i < geoPts.length; i++) {
    const a = geoPts[i - 1], b = geoPts[i];
    const n = Math.max(4, Math.ceil((geoDistance(a, b) * 180) / Math.PI / stepDeg));
    const f = geoInterpolate(a, b);
    for (let j = i === 1 ? 0 : 1; j <= n; j++) pts.push(proj(f(j / n)));
  }
  if (pts.some((p) => !finite2(p))) return true;
  const steps = [];
  for (let i = 1; i < pts.length; i++) steps.push(Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const sorted = [...steps].sort((x, y) => x - y);
  const med = sorted[Math.floor(sorted.length / 2)];
  return sorted[sorted.length - 1] > Math.max(3, 4 * med);
}

/** 교과서 글자 크기(pt, 5.4~12.4) → 화면 글자 크기(px). 가장 작은 글자도 10.5px. */
export function fontPx(size) {
  return Math.max(10.5, Math.round((10.5 + (size - 5.4) * 0.7) * 10) / 10);
}

/** 폴리라인 pts 의 가운데 len 만큼(길이가 len 이하면 그대로). 선·면 지명의 자간 상한을 종류별로 두려고 줄을 줄인다. */
export function trimPath(pts, len) {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const L = cum[cum.length - 1];
  if (L <= len) return pts;
  const s0 = (L - len) / 2, s1 = s0 + len;
  const at = (sv) => {
    let i = 1;
    while (i < pts.length - 1 && cum[i] < sv) i++;
    const a = pts[i - 1], b = pts[i], seg = cum[i] - cum[i - 1], t = seg ? (sv - cum[i - 1]) / seg : 0;
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  };
  const out = [at(s0)];
  for (let i = 1; i < pts.length - 1; i++) if (cum[i] > s0 && cum[i] < s1) out.push(pts[i]);
  out.push(at(s1));
  return out;
}

/**
 * 놓인 선·면 지명(placeLabels 결과 L)을 글자별로 그릴지 정한다.
 *  - 굽은 줄(L.glyphs)이 완만하면 {upright:false, glyphs: L.glyphs}(글자마다 줄 방향으로 회전).
 *  - 줄 방향이 가파르면(|angle| ≥ uprightDeg) 글자를 세우고(회전 0) 위 → 아래로 읽히게 글자 순서를 맞춘다(한글 세로쓰기).
 *    곧은 줄은 at·angle·span·spacing 과 글자 폭(measure)으로 글자 자리를 다시 만든다.
 *  - 완만한 곧은 줄은 null(글자 하나로 회전해 그린다).
 */
export function glyphLayout(L, measure, { uprightDeg = 55 } = {}) {
  const steep = Math.abs(L.angle || 0) >= uprightDeg;
  if (L.glyphs && !steep) return { upright: false, glyphs: L.glyphs };
  if (!steep) return null;
  let chars, pos;
  if (L.glyphs) {
    chars = L.glyphs.map((g) => g.ch);
    pos = L.glyphs.map((g) => g.at);
  } else {
    chars = [...L.name];
    const a = (L.angle * Math.PI) / 180, ux = Math.cos(a), uy = Math.sin(a);
    let cur = -(L.span ?? 0) / 2;
    pos = chars.map((ch) => {
      const w = measure(ch, L.size);
      const c = cur + w / 2;
      cur += w + (L.spacing || 0);
      return [L.at[0] + ux * c, L.at[1] + uy * c];
    });
  }
  if (pos.length > 1 && pos[0][1] > pos[pos.length - 1][1]) pos = [...pos].reverse();
  return { upright: true, glyphs: chars.map((ch, i) => ({ ch, at: pos[i], angle: 0 })) };
}

