// © 2026 김용현
// src/atlas/polarExtra.js — 오세아니아·극지방(U6-3)에서 처음 쓰는 엔진 기능. installPolarExtras() 를 부른 단원 조각에만 들어간다
//   (americasExtra.js·chartsExtra.js 와 같은 등록 길 — 부르지 않는 u2~u5 조각은 코드도 크기도 그대로).
//   - 3b 극 중심 보기(registerProjection('polarN'|'polarS') — 지도 도구 「도법」 고르기 상자에 「북극 중심」·「남극 중심」 옵션이 생김.
//     상자는 mapTools 때 PROJECTIONS 로 한 번 만들므로 mountAtlas 전에, 지구본(installAmericasExtras) 뒤에 등록 → 옵션 8: 평면 5 + 지구본 + 극 둘)
//     = geoAzimuthalEquidistant().clipAngle(90) 을 극으로 돌린 것. 상태 up = 화면 위로 가는 경선(°, 교과서 방향 — 50·51쪽 −90 = 서경 90°,
//     55쪽 영유권 180). 반구 원판 반지름 = 무대 짧은 변 × POLAR.fill, 무대 가운데. 렌더러 등록 자리(U5-3c — 공유 코드 0 B): hidden(반대 반구 —
//     지명·기호가 원판 밖에 비치지 않게), invert 는 반구 밖이면 null(음영·고도 색·자연색 역투영 격자가 원판 밖을 건너뜀 — 정거 방위 역투영은 180° 까지
//     값을 내므로), step(k)(처음 경위선 10°). pan 은 두지 않음 — 끌기 = 옮기기, 회전 고정(교사 Q6).
//     주제가 극 중심으로 여는 길: polarView(map, {projection:'polarN', up}) — 3c 보기 레이어(topicView)가 부른다. 되돌리기 = 앞 도법·가운데·확대 + 앞 up
//     (그사이 사용자가 도법을 바꿨으면 도법은 그대로).
//   - 3b 보기 도구 viewTools(map, toolsEl) — u6 main 이 americasExtra.globeTools 대신 부름(지구본과 극 중심이 함께 있어서, americasExtra 는 고치지 않음):
//     특별 보기(지구본·극 둘) ↔ 평면·특별 ↔ 특별 전환 때 바탕 캔버스 페이드 · 특별 보기면 「중심 경도」 단추 숨김 · 「세계 전체 보기」·0 키 = 지구본은
//     처음 회전, 극은 그 반구 전체 · 사용자가 도법 상자로 고를 때만: 평면 → 지구본 = 앞 평면 화면 가운데를 원판 가운데로, → 극 = 반구 전체,
//     특별 → 평면 = 마지막 평면 보기(가운데·확대) 그대로(지구본 ↔ 극 직접 전환에도 잃지 않음). 코드가 바꾼 것(globeView·polarView·되돌리기)에는
//     페이드·단추만(되돌리기가 두 번 일어나지 않게).
//   단원 main.js: installAmericasExtras(); installPolarExtras();  (mountAtlas 전에) — mountAtlas 뒤 viewTools(root.atlasMap, root.atlasUi.tools.el)(풀기 함수)
import { geoAzimuthalEquidistant } from 'd3-geo';
import { PROJECTIONS } from './projections.js';
import { graticuleStep } from './lineStyle.js';
import { registerProjection, globeCenter, rotateFor } from './americasExtra.js';

/** 극 중심 규칙: 반구 원판 반지름 = 무대 짧은 변 × fill, 처음(k < 2) 경위선 간격(°), 처음 위쪽 경선(°, 50·51쪽 일반도 = 서경 90°) */
export const POLAR = Object.freeze({ fill: 0.48, step: 10, up: -90 });
const wrapLon = (v) => ((((v + 180) % 360) + 360) % 360) - 180;
const poleOf = (def) => [0, def.pole === 'N' ? 90 : -90];

/** 위쪽 경선 up(°) → d3 rotate [λ, ∓90]. 북극: λ = −up − 180(위에서 내려다봄 — 동쪽이 반시계), 남극: λ = −up(동쪽이 시계 방향). */
export function polarRotate(pole, up) {
  return pole === 'N' ? [wrapLon(-up - 180), -90] : [wrapLon(-up), 90];
}

/** 극 중심 도법 정의(PROJECTIONS 항목 꼴 + 렌더러 등록 자리 setup). pole 'N'|'S', up = 지금 위쪽 경선. */
export function polarProjection({ pole = 'N', label = pole === 'N' ? '북극 중심' : '남극 중심', up = POLAR.up } = {}) {
  const sgn = pole === 'N' ? 1 : -1;
  const def = {
    label, pole, up,
    make() {
      const p = geoAzimuthalEquidistant().clipAngle(90);
      p.hidden = (ll) => sgn * ll[1] < -1e-9; // 반대 반구(적도는 원판 가장자리라 보임)
      const inv = p.invert;
      p.invert = (xy) => { const ll = inv(xy); return ll && Number.isFinite(ll[0]) && Number.isFinite(ll[1]) && !p.hidden(ll) ? ll : null; };
      p.step = (k) => (k < 2 ? POLAR.step : graticuleStep(k));
      return p;
    },
    setup(p, w, h) {
      p.rotate(polarRotate(pole, def.up)).scale((POLAR.fill * Math.min(w, h)) / (Math.PI / 2)).translate([w / 2, h / 2]);
    },
  };
  return def;
}

/** 극 중심 처음 보기: 극점 = 무대 가운데, 확대 1(반구 원판 전체). */
export const polarHome = (map, def, ms = 0) => map.flyTo({ center: poleOf(def), zoom: 1 }, ms);
const globeHome = (map, ms = 0) => map.flyTo({ center: globeCenter(PROJECTIONS.globe.rot), zoom: 1 }, ms);

/**
 * 극 중심으로 열기(view = {projection:'polarN'|'polarS', up?}) → 되돌리는 함수. 보간 없이 바꾸고 반구 전체(묶음 범위 맞추기는 주제가 뒤이어).
 * 되돌리기 = 앞 up + 앞 도법·화면 가운데·확대(그사이 사용자가 다른 도법으로 바꿨으면 도법은 그대로). 이미 그 극 중심이었으면 up 만 바꾸고 되돌림.
 */
export function polarView(map, { projection, up = null } = {}) {
  const def = PROJECTIONS[projection];
  if (!def?.pole || !map?.view) return () => {};
  const v = map.view, prev = { key: v.key, center: v.center, k: v.k }, prevUp = def.up;
  if (up != null) def.up = up;
  if (v.key === projection) map.rebase(); else map.setProjection(projection, { animate: false });
  polarHome(map, def);
  let done = false;
  return () => {
    if (done || map.destroyed) return;
    done = true;
    def.up = prevUp;
    if (map.view?.key !== projection) return;
    if (prev.key === projection) { map.rebase(); return; }
    map.setProjection(prev.key, { animate: false });
    if (prev.center) map.flyTo({ center: prev.center, zoom: prev.k }, 0);
  };
}

/** 특별 보기(평면이 아닌 것): 지구본·극 중심. */
export const specialView = (key) => key === 'globe' || !!PROJECTIONS[key]?.pole;

/** 지도 도구에 지구본·극 중심 몫을 잇는다(단원 main 이 mountAtlas 뒤에 — globeTools 대신): toolsEl = mapTools(…).el(무대 안). → 풀기 함수. */
export function viewTools(map, toolsEl) {
  const stage = toolsEl?.parentNode;
  const canvas = stage?.querySelector?.('.at-base');
  const centerSeg = toolsEl?.querySelector?.('[aria-label="중심 경도"]');
  const sel = toolsEl?.querySelector?.('[aria-label="도법"]');
  let last = map.view?.key, flat = null, picked = false; // flat = 마지막 멈춘 평면 보기 {key, center, k}, picked = 사용자가 도법 상자로 고름
  const later = (fn) => Promise.resolve().then(() => { if (!map.destroyed) fn(); }); // viewchange 안에서 다시 그리지 않게
  const sync = (v) => { if (centerSeg) centerSeg.hidden = specialView(v.key); };
  // 도법 상자의 change(상자 자신의 setProjection 보다 먼저 — 대상 요소의 캡처 리스너): 그 setProjection 이 낸 viewchange 만 「사용자가 고름」
  const onPick = () => { picked = true; Promise.resolve().then(() => { picked = false; }); };
  const off = map.on('viewchange', (v) => {
    const was = last;
    last = v.key;
    sync(v);
    if (!specialView(v.key) && !v.moving && was === v.key) flat = { key: v.key, center: v.center, k: v.k };
    if (was === v.key || (!specialView(was) && !specialView(v.key))) return;
    canvas?.animate?.([{ opacity: 0.35 }, { opacity: 1 }], { duration: 260, easing: 'ease-out' });
    if (!picked) return;
    picked = false;
    const def = PROJECTIONS[v.key];
    if (v.key === 'globe') {
      if (flat?.center) def.rot = rotateFor(flat.center);
      def.home = def.rot.slice();
      later(() => { map.rebase(); globeHome(map); });
    } else if (def?.pole) later(() => polarHome(map, def));
    else if (flat?.center) { const f = flat; later(() => map.flyTo({ center: f.center, zoom: f.k }, 0)); }
  });
  const home = (e) => {
    const key = map.view?.key, def = PROJECTIONS[key];
    if (!specialView(key)) return;
    e.stopImmediatePropagation(); e.preventDefault();
    if (def.pole) { polarHome(map, def, 500); return; }
    if (def.home) def.rot = def.home.slice();
    map.rebase();
    globeHome(map, 500);
  };
  const onClick = (e) => { if (e.target?.closest?.('[aria-label="세계 전체 보기"]')) home(e); };
  const onKey = (e) => { if (e.key === '0' && e.target === stage && !e.altKey && !e.ctrlKey && !e.metaKey) home(e); };
  sel?.addEventListener('change', onPick, true);
  toolsEl?.addEventListener('click', onClick, true);
  stage?.addEventListener('keydown', onKey, true);
  if (map.view) sync(map.view);
  return () => { off(); sel?.removeEventListener('change', onPick, true); toolsEl?.removeEventListener('click', onClick, true); stage?.removeEventListener('keydown', onKey, true); };
}

/** 등록(단원 main 이 mountAtlas 전에, installAmericasExtras 뒤에 — 상자 옵션 차례 지구본 → 북극 중심 → 남극 중심). 두 번 불러도 같음. */
export function installPolarExtras() {
  if (!PROJECTIONS.polarN) registerProjection('polarN', polarProjection({ pole: 'N' }));
  if (!PROJECTIONS.polarS) registerProjection('polarS', polarProjection({ pole: 'S' }));
}
