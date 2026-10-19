// © 2026 김용현
// 지구본 지도(정사 도법, 2D 캔버스). 교과서 113쪽 지도처럼 유라시아를 가운데 두고 북극해가 보이게 기울인다.
// 끌어서 돌려 볼 수 있다.
import { geoOrthographic, geoPath, geoGraticule10, geoDistance, geoContains } from 'd3-geo';
import geo from './data/geo.json';
import { ROUTES, pointAt, pathUpTo } from './model.js';

const HOME = [-75, -50, 0]; // 회전(지도 가운데 = 동경 75도, 북위 50도)

const LAND = { type: 'MultiPolygon', coordinates: geo.land };
const ICE = {
  1979: { type: 'MultiPolygon', coordinates: geo.ice['1979'] },
  2022: { type: 'MultiPolygon', coordinates: geo.ice['2022'] },
};
const GRAT = geoGraticule10();
const SPHERE = { type: 'Sphere' };
const line = (pts) => ({ type: 'LineString', coordinates: pts });

// 지도 글씨 [이름, 경도, 위도, 종류]
const PLACES = [
  ['아시아', 95, 47, 'cont'], ['유럽', 30, 55, 'cont'], ['아프리카', 22, 12, 'cont'], ['북아메리카', -105, 55, 'cont'],
  ['북극해', 70, 82, 'sea'], ['태평양', 158, 34, 'sea'], ['인도양', 75, -2, 'sea'], ['대서양', -28, 45, 'sea'],
  ['동해', 134.6, 37.8, 'sea-s'], ['지중해', 17.5, 33.4, 'sea-s'], ['남중국해', 116.8, 13.0, 'sea-s'], ['노르웨이해', 2, 67, 'sea-s'],
  ['수에즈 운하', 32.4, 30.6, 'pt'], ['말라카 해협', 100.5, 3.2, 'pt'], ['베링 해협', -169.0, 65.9, 'pt'], ['지브롤터 해협', -5.6, 35.95, 'pt'],
];

export function createGlobe(host) {
  const cv = document.createElement('canvas');
  cv.className = 'ds-canvas nr-globe';
  host.append(cv);
  const ctx = cv.getContext('2d');
  const proj = geoOrthographic().rotate(HOME).precision(0.3);
  const path = geoPath(proj, ctx);
  let W = 1, H = 1, dpr = 1, baseScale = 1, zoom = 1;
  let rot = HOME.slice(), rotGoal = null;
  let last = null; // 마지막 그리기 상태

  // 1979년 해빙에 북동 항로가 처음 막히는 곳
  const blockKm = (() => {
    const r = ROUTES.nsr;
    for (let d = 0; d <= r.km; d += 25) if (geoContains(ICE[1979], pointAt(r, d))) return d;
    return null;
  })();

  function fit() {
    // 두 항로가 모두 들어오게 맞춘다(오른쪽 위 계기판·왼쪽 아래 범례 자리를 남김)
    proj.rotate(HOME);
    const padL = Math.min(100, W * 0.1), padR = 40, padT = Math.min(120, H * 0.17), padB = Math.min(70, H * 0.1);
    proj.fitExtent([[padL, padT], [W - padR, H - padB]], { type: 'MultiLineString', coordinates: [ROUTES.suez.pts, ROUTES.nsr.pts] });
    baseScale = proj.scale();
    proj.rotate(rot).scale(baseScale * zoom);
  }

  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = host.clientWidth || 1; H = host.clientHeight || 1;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    fit();
    if (last) draw(last);
  }
  new ResizeObserver(resize).observe(host);

  // 끌어서 돌리기
  let drag = null;
  cv.addEventListener('pointerdown', (e) => {
    drag = { x: e.clientX, y: e.clientY, r: rot.slice() };
    rotGoal = null;
    cv.setPointerCapture(e.pointerId);
    cv.classList.add('nr-grab');
  });
  cv.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const k = 57.3 / proj.scale(); // 화면 1px = 몇 도
    rot = [drag.r[0] + (e.clientX - drag.x) * k, Math.max(-89, Math.min(10, drag.r[1] - (e.clientY - drag.y) * k)), 0];
    proj.rotate(rot);
    if (last) draw(last);
  });
  const end = () => { drag = null; cv.classList.remove('nr-grab'); };
  cv.addEventListener('pointerup', end);
  cv.addEventListener('pointercancel', end);

  const visible = (lonlat) => geoDistance(lonlat, [-rot[0], -rot[1]]) < Math.PI / 2 - 0.02;

  function shipGlyph(x, y, ang, color) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang);
    ctx.beginPath();
    ctx.moveTo(11, 0); ctx.lineTo(4, -5); ctx.lineTo(-9, -5); ctx.lineTo(-9, 5); ctx.lineTo(4, 5); ctx.closePath();
    ctx.fillStyle = color; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = '#fff'; ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.9)';
    ctx.fillRect(-6, -2.2, 6, 4.4);
    ctx.restore();
  }

  function tag(x, y, text, color, dy = -16, align = 'center') {
    ctx.font = '700 12px ' + FONT;
    const w = ctx.measureText(text).width + 12;
    const tx = align === 'right' ? x - w : x - w / 2, ty = y + dy - 10;
    ctx.fillStyle = color;
    roundRect(tx, ty, w, 20, 6); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, tx + w / 2, ty + 10.5);
  }
  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  /**
   * s: { warm(bool), dist: {suez, nsr} (간 거리 km), done: {suez, nsr}, days: {suez, nsr}, time }
   */
  function draw(s) {
    last = s;
    if (rotGoal) {
      rot = rot.map((v, i) => v + (rotGoal[i] - v) * 0.15);
      if (Math.abs(rot[0] - rotGoal[0]) + Math.abs(rot[1] - rotGoal[1]) < 0.05) { rot = rotGoal; rotGoal = null; }
      proj.rotate(rot);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    // 바다(구)
    const [cx, cy] = proj.translate(), R = proj.scale();
    const g = ctx.createRadialGradient(cx - R * 0.3, cy - R * 0.35, R * 0.1, cx, cy, R);
    g.addColorStop(0, '#d8ecf6'); g.addColorStop(1, '#a9d2e8');
    ctx.beginPath(); path(SPHERE); ctx.fillStyle = g; ctx.fill();

    ctx.beginPath(); path(GRAT); ctx.strokeStyle = 'rgba(40,90,130,.16)'; ctx.lineWidth = 0.8; ctx.stroke();

    // 9월 해빙
    const ice = ICE[s.warm ? 2022 : 1979];
    ctx.beginPath(); path(ice);
    ctx.fillStyle = 'rgba(255,255,255,.96)'; ctx.fill();
    ctx.strokeStyle = '#8fbcd8'; ctx.lineWidth = 1; ctx.stroke();

    // 육지
    ctx.beginPath(); path(LAND);
    ctx.fillStyle = '#f2ead8'; ctx.fill();
    ctx.strokeStyle = '#b9ab8e'; ctx.lineWidth = 0.7; ctx.stroke();

    ctx.beginPath(); path(SPHERE); ctx.strokeStyle = 'rgba(30,80,120,.35)'; ctx.lineWidth = 1.2; ctx.stroke();

    // 지명
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const [name, lo, la, kind] of PLACES) {
      if (!visible([lo, la])) continue;
      const p = proj([lo, la]);
      if (kind === 'pt') {
        ctx.beginPath(); ctx.arc(p[0], p[1], 3, 0, Math.PI * 2);
        ctx.fillStyle = '#fff'; ctx.fill(); ctx.strokeStyle = '#5b636d'; ctx.lineWidth = 1.2; ctx.stroke();
        if (name === '말라카 해협') halo(name, p[0] - 4, p[1] + 15, '600 12px', '#3b4450');
        else if (name === '수에즈 운하') halo(name, p[0] - 7, p[1], '600 12px', '#3b4450', 'right');
        else halo(name, p[0] + 7, p[1], '600 12px', '#3b4450', 'left');
      } else if (kind === 'cont') halo(name, p[0], p[1], '700 15px', '#6b5d43');
      else if (kind === 'sea') halo(name, p[0], p[1], 'italic 600 14px', '#2f6f99');
      else halo(name, p[0], p[1], 'italic 12px', '#2f6f99');
    }

    // 항로
    const S = ROUTES.suez, N = ROUTES.nsr;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    // 기존 항로
    ctx.setLineDash([7, 5]);
    ctx.beginPath(); path(line(S.pts)); ctx.strokeStyle = S.color; ctx.globalAlpha = 0.55; ctx.lineWidth = 2.2; ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.setLineDash([]);
    // 북동 항로
    if (s.warm) {
      ctx.beginPath(); path(line(N.pts)); ctx.strokeStyle = N.color; ctx.globalAlpha = 0.45; ctx.lineWidth = 2.4; ctx.stroke();
      ctx.globalAlpha = 1;
    } else {
      ctx.setLineDash([3, 5]);
      ctx.beginPath(); path(line(N.pts)); ctx.strokeStyle = '#8b8e92'; ctx.globalAlpha = 0.7; ctx.lineWidth = 2; ctx.stroke();
      ctx.globalAlpha = 1; ctx.setLineDash([]);
    }
    // 지나온 길(진하게)
    const trail = (r, d, dash) => {
      if (d <= 0) return;
      ctx.setLineDash(dash);
      ctx.beginPath(); path(line(pathUpTo(r, d))); ctx.strokeStyle = r.color; ctx.lineWidth = 4; ctx.stroke();
      ctx.setLineDash([]);
    };
    trail(S, s.dist.suez, []);
    if (s.warm) trail(N, s.dist.nsr, []);

    // 1979년: 해빙에 막힌 곳 표시
    if (!s.warm && blockKm != null) {
      const b = pointAt(N, blockKm);
      if (visible(b)) {
        const [x, y] = proj(b);
        ctx.beginPath(); ctx.arc(x, y, 11, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill();
        ctx.strokeStyle = '#c92a2a'; ctx.lineWidth = 2.5; ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x - 5, y - 5); ctx.lineTo(x + 5, y + 5); ctx.moveTo(x + 5, y - 5); ctx.lineTo(x - 5, y + 5); ctx.stroke();
        tag(x - 62, y, '해빙에 막힘', '#c92a2a', 0);
      }
    }

    // 항구
    for (const [name, ll, side] of [['부산', S.pts[0], 'right'], ['로테르담', S.pts[S.pts.length - 1], 'left']]) {
      if (!visible(ll)) continue;
      const [x, y] = proj(ll);
      ctx.beginPath(); ctx.arc(x, y, 5.5, 0, Math.PI * 2);
      ctx.fillStyle = '#fff'; ctx.fill(); ctx.strokeStyle = '#1d2126'; ctx.lineWidth = 2; ctx.stroke();
      halo(name, x + 12, y + 14, '800 14px', '#1d2126', 'left');
    }

    // 배
    const ship = (r, d, label) => {
      const p = pointAt(r, d);
      if (!visible(p)) return;
      const q = pointAt(r, Math.min(r.km, d + 60)), p0 = pointAt(r, Math.max(0, d - 60));
      const [x, y] = proj(p), a = proj(p0), b = proj(q);
      shipGlyph(x, y, Math.atan2(b[1] - a[1], b[0] - a[0]), r.color);
      return [x, y];
    };
    const sp = ship(S, s.dist.suez);
    const np = s.warm ? ship(N, s.dist.nsr) : null;
    // 도착 표시
    const end = S.pts[S.pts.length - 1];
    if (visible(end)) {
      const [x, y] = proj(end);
      let row = 0;
      for (const r of [N, S]) {
        if (!s.done[r.id] || (r === N && !s.warm)) continue;
        tag(x - 6, y - 26 - row * 24, `${r.name} ${Math.round(s.days[r.id])}일 만에 도착`, r.color, 0, 'right');
        row++;
      }
    }
    // 출발 전 배 이름
    if (s.dist.suez === 0 && sp) {
      tag(sp[0] - 46, sp[1] + 26, '기존 항로 배', S.color, 0);
      if (np) tag(np[0] + 50, np[1] - 22, '북동 항로 배', N.color, 0);
    }
  }

  function halo(text, x, y, font, color, align = 'center') {
    ctx.font = `${font} ${FONT}`;
    ctx.textAlign = align; ctx.textBaseline = 'middle';
    ctx.lineWidth = 3.5; ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineJoin = 'round';
    ctx.strokeText(text, x, y);
    ctx.fillStyle = color; ctx.fillText(text, x, y);
  }

  return {
    draw,
    animating: () => !!rotGoal || !!drag,
    resetView() { rotGoal = HOME.slice(); zoom = 1; proj.scale(baseScale); },
    zoomBy(f) { zoom = Math.max(0.7, Math.min(2.5, zoom * f)); proj.scale(baseScale * zoom); if (last) draw(last); },
    blockKm,
  };
}

const FONT = "Pretendard, 'Apple SD Gothic Neo', 'Malgun Gothic', system-ui, sans-serif";
