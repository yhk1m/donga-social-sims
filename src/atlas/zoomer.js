// © 2026 김용현
// src/atlas/zoomer.js — 지도 확대·이동 조작(끌기·휠·두 손가락·두 번 누르기·날아가기). d3-zoom 과 같은 변환 {k, x, y}(화면 = k·지도 + [x, y]).
// d3-zoom 을 쓰지 않는 까닭: d3-zoom 이 끌어오는 d3-selection 의 프로토타입(html()·select(문자열)·document.documentElement)이
// 조각 규칙 검사(innerHTML·document 전체 검색)에 걸리고, 프로토타입 메서드라 번들에서 빠지지 않는다.
// 계산은 순수 함수로 두고(tests/atlas/zoomer.test.mjs), createZoomer 가 포인터 이벤트에 잇는다. 관성 없음.
import { interpolateZoom } from 'd3-interpolate';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const CLICK_DISTANCE = 3; // 이만큼(px) 움직이면 끌기 — 뒤따르는 click 은 막는다
const WHEEL_END_MS = 150;
const DBL_MS = 250;
const easeCubicInOut = (t) => ((t *= 2) <= 1 ? t * t * t : (t -= 2) * t * t + 2) / 2;

/**
 * 변환 제한. 가로·세로 따로: 확대한 지도(translateExtent × k)가 화면(extent)보다 크면 화면이 지도 밖으로 못 나가고,
 * 작으면 지도가 화면 밖으로 못 나간다(그 안에서는 움직일 수 있음). d3-zoom 기본(작으면 늘 가운데)과 달리,
 * 세로로 낮은 구드·로빈슨에서도 아시아를 화면 가운데 가까이 둘 수 있다. k 는 scaleExtent 로 자른다.
 * slack [sx, sy](px): 그만큼은 지도 밖 빈 곳이 화면에 들어와도 된다(렌더러는 k=1 에서 0, 확대하면 화면의 30% 까지).
 */
export function constrainTransform(t, extent, translateExtent, [k0, k1] = [1, 40], [sx, sy] = [0, 0]) {
  const k = clamp(t.k, k0, k1);
  // 지도 끝이 화면 끝에 닿는 두 값 a·b 사이(+ slack)만 허용: 크면 화면이 지도 안, 작으면 지도가 화면 안
  const axis = (v, e0, e1, m0, m1, sl) => {
    const a = e0 - m0 * k, b = e1 - m1 * k;
    return clamp(v, Math.min(a, b) - sl, Math.max(a, b) + sl);
  };
  return {
    k,
    x: axis(t.x, extent[0][0], extent[1][0], translateExtent[0][0], translateExtent[1][0], sx),
    y: axis(t.y, extent[0][1], extent[1][1], translateExtent[0][1], translateExtent[1][1], sy),
  };
}

/** 화면 점 p 아래 지점을 고정한 채 배율을 k1 로. */
export function zoomAround(t, k1, p) {
  return { k: k1, x: p[0] - ((p[0] - t.x) * k1) / t.k, y: p[1] - ((p[1] - t.y) * k1) / t.k };
}

/** 두 손가락: 이전 두 점 a → 지금 두 점 b. 배율 = 거리 비, 이전 가운데 지점이 지금 가운데로. */
export function pinchTransform(t, [a0, a1], [b0, b1]) {
  const da = Math.hypot(a1[0] - a0[0], a1[1] - a0[1]), db = Math.hypot(b1[0] - b0[0], b1[1] - b0[1]);
  const k = da > 0 ? (t.k * db) / da : t.k;
  const ma = [(a0[0] + a1[0]) / 2, (a0[1] + a1[1]) / 2], mb = [(b0[0] + b1[0]) / 2, (b0[1] + b1[1]) / 2];
  const g = [(ma[0] - t.x) / t.k, (ma[1] - t.y) / t.k];
  return { k, x: mb[0] - g[0] * k, y: mb[1] - g[1] * k };
}

/** 휠 한 번의 배율(d3-zoom 기본과 같음): 2^(−deltaY × 단위), 줄 단위 0.05, 쪽 단위 1, 화소 0.002, ctrl(트랙패드 오므리기) ×10. */
export function wheelFactor(e) {
  const unit = e.deltaMode === 1 ? 0.05 : e.deltaMode ? 1 : 0.002;
  return Math.pow(2, -e.deltaY * unit * (e.ctrlKey ? 10 : 1));
}

/** 두 변환 사이 날아가기 보간(van Wijk, d3 interpolateZoom). u=0·1 은 정확히 a·b. 화면 가운데 기준. */
export function flyInterpolator(a, b, width, height) {
  const p = [width / 2, height / 2], w = Math.max(width, height);
  const ga = [(p[0] - a.x) / a.k, (p[1] - a.y) / a.k], gb = [(p[0] - b.x) / b.k, (p[1] - b.y) / b.k];
  const i = interpolateZoom([ga[0], ga[1], w / a.k], [gb[0], gb[1], w / b.k]);
  return (u) => {
    if (u <= 0) return { ...a };
    if (u >= 1) return { ...b };
    const l = i(u), k = w / l[2];
    return { k, x: p[0] - l[0] * k, y: p[1] - l[1] * k };
  };
}

/**
 * el(지도 위 SVG)에 확대·이동 조작을 건다.
 * opts: { scaleExtent:[1,40], slack(k) → [sx, sy], onStart(src), onZoom(t, src), onEnd(src), pan?(dx, dy) } — src: 'drag' | 'pinch' | 'wheel' | 'dblclick' | 'fly'
 *   pan: 한 손가락·마우스 끌기 한 걸음(px)을 먼저 받아 참을 돌려주면 옮기지 않는다(지구본 = 끌어 돌리기 — 렌더러가 보기 종류에 따라 정함)
 * 반환: { get(), set(t)(이벤트 없음), extent([[0,0],[w,h]]), translateExtent(te), constrain(t), flyTo(t, ms), interrupt(), destroy() }
 * 끌기·두 손가락은 Pointer Events(touch-action: none 필요), 끌기가 시작될 때만 포인터를 잡는다(그냥 누르면 레이어 요소의 click 이 그대로 감).
 */
export function createZoomer(el, { scaleExtent = [1, 40], slack = () => [0, 0], onStart = () => {}, onZoom = () => {}, onEnd = () => {}, pan } = {}) {
  let T = { k: 1, x: 0, y: 0 };
  let ext = [[0, 0], [1, 1]], tex = [[-Infinity, -Infinity], [Infinity, Infinity]];
  const pointers = new Map(); // id → [x, y]
  let gesture = null; // {src, start, moved}
  let wheelTimer = 0, wheeling = false, suppressUntil = 0;
  let anim = null; // {raf, src}

  const local = (e) => { const r = el.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  const constrain = (t) => constrainTransform(t, ext, tex, scaleExtent, slack(clamp(t.k, scaleExtent[0], scaleExtent[1])));
  const apply = (t, src) => {
    const c = constrain(t);
    if (c.k === T.k && c.x === T.x && c.y === T.y) return;
    T = c;
    onZoom({ ...T }, src);
  };

  function interrupt() {
    if (!anim) return;
    cancelAnimationFrame(anim.raf);
    const src = anim.src;
    anim = null;
    onEnd(src);
  }
  function animate(to, ms, src, interp) {
    interrupt();
    const target = constrain(to);
    const f = interp ? interp(T, target) : flyInterpolator(T, target, ext[1][0] - ext[0][0], ext[1][1] - ext[0][1]);
    const t0 = performance.now();
    anim = { raf: 0, src };
    onStart(src);
    const step = () => {
      if (!anim) return;
      const u = Math.min(1, (performance.now() - t0) / Math.max(1, ms));
      const t = f(easeCubicInOut(u));
      T = { k: t.k, x: t.x, y: t.y };
      onZoom({ ...T }, src);
      if (u >= 1) { anim = null; onEnd(src); return; }
      anim.raf = requestAnimationFrame(step);
    };
    anim.raf = requestAnimationFrame(step);
  }

  function onPointerDown(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    interrupt();
    pointers.set(e.pointerId, local(e));
    if (pointers.size === 1) gesture = { src: 'drag', start: local(e), moved: false, started: false };
  }
  function onPointerMove(e) {
    if (!pointers.has(e.pointerId) || !gesture) return;
    const prev = new Map(pointers);
    const p = local(e);
    pointers.set(e.pointerId, p);
    if (!gesture.moved) {
      if (pointers.size < 2 && Math.hypot(p[0] - gesture.start[0], p[1] - gesture.start[1]) < CLICK_DISTANCE) return;
      gesture.moved = true;
      try { el.setPointerCapture(e.pointerId); } catch { /* 이미 놓인 포인터 */ }
    }
    if (!gesture.started) { gesture.started = true; onStart(gesture.src); }
    if (pointers.size >= 2) {
      const ids = [...pointers.keys()].slice(0, 2);
      if (!ids.includes(e.pointerId)) return;
      gesture.src = 'pinch';
      apply(pinchTransform(T, ids.map((id) => prev.get(id)), ids.map((id) => pointers.get(id))), 'pinch');
    } else {
      const q = prev.get(e.pointerId), dx = p[0] - q[0], dy = p[1] - q[1];
      pan?.(dx, dy) || apply({ k: T.k, x: T.x + dx, y: T.y + dy }, 'drag');
    }
  }
  function onPointerUp(e) {
    if (!pointers.delete(e.pointerId)) return;
    try { el.releasePointerCapture(e.pointerId); } catch { /* 잡지 않았음 */ }
    if (pointers.size || !gesture) return;
    if (gesture.moved) suppressUntil = performance.now() + 100;
    if (gesture.started) onEnd(gesture.src);
    gesture = null;
  }
  function onWheel(e) {
    e.preventDefault();
    interrupt();
    if (!wheeling) { wheeling = true; onStart('wheel'); }
    apply(zoomAround(T, clamp(T.k * wheelFactor(e), scaleExtent[0], scaleExtent[1]), local(e)), 'wheel');
    clearTimeout(wheelTimer);
    wheelTimer = setTimeout(() => { wheeling = false; onEnd('wheel'); }, WHEEL_END_MS);
  }
  function onDblClick(e) {
    e.preventDefault();
    const p = local(e);
    const k1 = clamp(T.k * (e.shiftKey ? 0.5 : 2), scaleExtent[0], scaleExtent[1]);
    const to = zoomAround(T, k1, p);
    // 두 번 누르기는 그 점을 붙잡고 확대(날아가기 곡선이 아니라 곧은 보간)
    animate(to, DBL_MS, 'dblclick', (a, b) => (u) => {
      const k = a.k * Math.pow(b.k / a.k, u);
      const g = [(p[0] - a.x) / a.k, (p[1] - a.y) / a.k];
      const gb = [(p[0] - b.x) / b.k, (p[1] - b.y) / b.k];
      const gx = g[0] + (gb[0] - g[0]) * u, gy = g[1] + (gb[1] - g[1]) * u;
      return u >= 1 ? { ...b } : { k, x: p[0] - gx * k, y: p[1] - gy * k };
    });
  }
  function onClickCapture(e) {
    if (performance.now() < suppressUntil) { e.stopImmediatePropagation(); e.preventDefault(); }
  }

  el.addEventListener('pointerdown', onPointerDown);
  el.addEventListener('pointermove', onPointerMove);
  el.addEventListener('pointerup', onPointerUp);
  el.addEventListener('pointercancel', onPointerUp);
  el.addEventListener('wheel', onWheel, { passive: false });
  el.addEventListener('dblclick', onDblClick);
  el.addEventListener('click', onClickCapture, true);

  return {
    get: () => ({ ...T }),
    set(t) { interrupt(); T = constrain(t); return { ...T }; },
    extent(e) { ext = e; return this; },
    translateExtent(te) { tex = te; return this; },
    constrain,
    flyTo(t, ms = 700) { animate(t, ms, 'fly'); },
    get active() { return !!(anim || wheeling || gesture?.started); },
    interrupt,
    destroy() {
      interrupt();
      clearTimeout(wheelTimer);
      el.removeEventListener('pointerdown', onPointerDown);
      el.removeEventListener('pointermove', onPointerMove);
      el.removeEventListener('pointerup', onPointerUp);
      el.removeEventListener('pointercancel', onPointerUp);
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('dblclick', onDblClick);
      el.removeEventListener('click', onClickCapture, true);
    },
  };
}
