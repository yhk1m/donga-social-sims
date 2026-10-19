// © 2026 김용현
// 북태평양 지도(2D 캔버스, 북위 30° 기준 정거 원통 도법). 경도는 0~360(날짜 변경선을 가운데로).
// 바다 → 해류 세기 색칠 → 육지 → 쓰레기 지대 범위 → 해류 화살표 → 쓰레기 입자 → 이름 순으로 그린다.
import { current, PATCH_E, PATCH_W, GRID } from './field.js';

const CS = Math.cos(30 * Math.PI / 180);
const BOX = { lon0: 117, lon1: 252, lat0: -4, lat1: 61 };

// 주요 해류(교과서 지도: 미국 해양 대기청, 2023 의 모양을 따름). ring: 'sub' 아열대 순환, 'polar' 북쪽 순환
export const CURRENTS = [
  { name: '쿠로시오 해류', ring: 'sub', path: [[122.6, 17], [122.4, 22.5], [125, 27], [129.5, 30.3], [134.5, 32.4], [139.5, 34.4], [145, 36.2]], label: [126.4, 31], rot: -32 },
  { name: '북태평양 해류', ring: 'sub', path: [[149, 37.6], [163, 40.2], [182, 41.6], [202, 41.2], [220, 39.6], [229, 37.6]], label: [184, 44.2] },
  { name: '캘리포니아 해류', ring: 'sub', path: [[233.5, 40.5], [236.6, 35.5], [238.6, 30.5], [238.4, 25.5], [233.5, 21]], label: [234.4, 31], rot: 80 },
  { name: '북적도 해류', ring: 'sub', path: [[229, 16.2], [208, 15.2], [185, 14.6], [162, 14.4], [140, 15.4], [128, 17.4]], label: [178, 11.6] },
  { name: '적도 반류', ring: 'sub', path: [[133, 6], [160, 6.6], [190, 6.8], [220, 6.6], [246, 6.8]], label: [190, 3.2] },
  { name: '쿠릴 해류', ring: 'polar', path: [[163, 53], [158, 49.8], [152, 45.8], [147, 42.6]], label: [150.5, 50.6], rot: 40, small: true },
  { name: '알래스카 해류', ring: 'polar', path: [[226, 49], [224, 53.5], [216, 57.6], [204, 57.2], [192, 54.4]], label: [214, 54.4], small: true },
];
const RING_COLOR = { sub: '#d9508a', polar: '#2f86d0' };

const PLACES = [
  { t: '아시아', lon: 125, lat: 46.5, big: true },
  { t: '북아메리카', lon: 248, lat: 52, big: true },
  { t: '일본', lon: 138.5, lat: 38.6 },
  { t: '하와이 제도', lon: 203.5, lat: 17.6, dot: [204.5, 20.6] },
  { t: '오스트레일리아', lon: 135, lat: -6.5, dim: true },
];

const TRASH = ['#e2552d', '#f0a21a', '#3a8f4f', '#7b4fb3', '#2b6fb6'];

export function createMapView(host, landRings) {
  const cv = document.createElement('canvas');
  cv.className = 'ds-canvas gp-map';
  host.appendChild(cv);
  const ctx = cv.getContext('2d');
  let W = 1, H = 1, dpr = 1, k = 1, cx = 0, cy = 0;
  const view = { lon: (BOX.lon0 + BOX.lon1) / 2, lat: (BOX.lat0 + BOX.lat1) / 2 + 1 };

  // 해류 세기 색칠: 격자마다 색을 정해 작은 캔버스에 찍어 두고, 지도에 늘여서 그린다(도법이 선형이라 가능)
  const shade = document.createElement('canvas');
  const sx = Math.round((GRID.lon1 - GRID.lon0) / 0.5), sy = Math.round((GRID.lat1 - GRID.lat0) / 0.5);
  shade.width = sx; shade.height = sy;
  (function buildShade() {
    const sc = shade.getContext('2d');
    const img = sc.createImageData(sx, sy);
    for (let j = 0; j < sy; j++) {
      const lat = GRID.lat1 - (j + 0.5) * 0.5;
      for (let i = 0; i < sx; i++) {
        const lon = GRID.lon0 + (i + 0.5) * 0.5;
        const [u, v] = current(lon, lat);
        const [r, g, b, a] = speedColor(Math.hypot(u, v));
        const o = (j * sx + i) * 4;
        img.data[o] = r; img.data[o + 1] = g; img.data[o + 2] = b; img.data[o + 3] = a;
      }
    }
    sc.putImageData(img, 0, 0);
  })();

  // 흐름 화살표 자리(바다 위, 3° 간격)
  let arrowPts = [];
  function buildArrows(isLand) {
    arrowPts = [];
    for (let lat = -1.5; lat <= 60; lat += 3) {
      for (let lon = 118.5; lon <= 252; lon += 3 / CS * 0.9) {
        if (isLand(lon, lat) || isLand(lon + 0.6, lat) || isLand(lon - 0.6, lat)) continue;
        const [u, v] = current(lon, lat);
        arrowPts.push({ lon, lat, u, v, sp: Math.hypot(u, v) });
      }
    }
  }

  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = host.clientWidth || 1; H = host.clientHeight || 1;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    // 상자(경도 117~252°, 위도 -4~61°)가 다 들어가도록 — 위·아래 안내 카드 자리를 남긴다
    const padX = 16, padTop = 64, padBot = 56;
    k = Math.min((W - padX * 2) / ((BOX.lon1 - BOX.lon0) * CS), (H - padTop - padBot) / (BOX.lat1 - BOX.lat0));
    cx = W / 2; cy = padTop + (H - padTop - padBot) / 2;
  }
  new ResizeObserver(resize).observe(host);
  resize();

  const px = (lon, lat) => [cx + (lon - view.lon) * k * CS, cy - (lat - view.lat) * k];
  const unpx = (x, y) => [view.lon + (x - cx) / (k * CS), view.lat - (y - cy) / k];

  function ringPath(ring) {
    for (let i = 0; i < ring.length; i++) {
      const [x, y] = px(ring[i][0], ring[i][1]);
      if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    }
    ctx.closePath();
  }

  function arrowHead(x, y, ang, size) {
    ctx.moveTo(x + Math.cos(ang) * size, y + Math.sin(ang) * size);
    ctx.lineTo(x + Math.cos(ang + 2.5) * size * 0.85, y + Math.sin(ang + 2.5) * size * 0.85);
    ctx.lineTo(x + Math.cos(ang - 2.5) * size * 0.85, y + Math.sin(ang - 2.5) * size * 0.85);
    ctx.closePath();
  }

  function smoothLine(pts) {
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length - 1; i++) {
      const mx = (pts[i][0] + pts[i + 1][0]) / 2, my = (pts[i][1] + pts[i + 1][1]) / 2;
      ctx.quadraticCurveTo(pts[i][0], pts[i][1], mx, my);
    }
    const l = pts[pts.length - 1];
    ctx.lineTo(l[0], l[1]);
  }

  function label(text, x, y, { size = 13, weight = 700, color = '#1d2126', halo = 'rgba(255,255,255,.92)', rot = 0, align = 'center' } = {}) {
    ctx.save();
    ctx.translate(x, y);
    if (rot) ctx.rotate(rot * Math.PI / 180);
    ctx.font = `${weight} ${size}px ${FONT}`;
    ctx.textAlign = align; ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = halo; ctx.lineWidth = 3.5;
    ctx.strokeText(text, 0, 0);
    ctx.fillStyle = color;
    ctx.fillText(text, 0, 0);
    ctx.restore();
  }

  /**
   * st: { parts, tracked, showCurrents, showArrows, showShade, showZones, time(초, 애니메이션용), hover:{lon,lat}|null, countsE, countsW }
   */
  function draw(st) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#d6e8f2';
    ctx.fillRect(0, 0, W, H);

    if (st.showShade) {
      const [x0, y0] = px(GRID.lon0, GRID.lat1), [x1, y1] = px(GRID.lon1, GRID.lat0);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(shade, x0, y0, x1 - x0, y1 - y0);
    }

    // 경위선
    ctx.strokeStyle = 'rgba(40,80,110,.13)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let lon = 120; lon <= 270; lon += 15) { const [x] = px(lon, 0); ctx.moveTo(x, 0); ctx.lineTo(x, H); }
    for (let lat = -15; lat <= 75; lat += 15) { const [, y] = px(0, lat); ctx.moveTo(0, y); ctx.lineTo(W, y); }
    ctx.stroke();
    // 적도·북회귀선 조금 진하게
    ctx.strokeStyle = 'rgba(40,80,110,.28)';
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    for (const lat of [0, 23.44]) { const [, y] = px(0, lat); ctx.moveTo(0, y); ctx.lineTo(W, y); }
    ctx.stroke();
    ctx.setLineDash([]);

    // 육지
    ctx.beginPath();
    for (const r of landRings) ringPath(r);
    ctx.fillStyle = '#efe9dc';
    ctx.fill('evenodd');
    ctx.strokeStyle = '#ada38d';
    ctx.lineWidth = 0.8;
    ctx.stroke();

    // 경위도 숫자
    for (let lon = 120; lon <= 255; lon += 30) {
      const [x] = px(lon, 0);
      const t = lon < 180 ? `${lon}°E` : lon === 180 ? '180°' : `${360 - lon}°W`;
      label(t, x, H - 12, { size: 11, weight: 500, color: '#5b636d' });
    }
    for (const lat of [0, 15, 30, 45, 60]) {
      const [, y] = px(0, lat);
      if (y < 56 || y > H - 30) continue;
      label(lat === 0 ? '적도' : `${lat}°N`, W - 8, y - 8, { size: 11, weight: 500, color: '#5b636d', align: 'right' });
    }

    // 쓰레기 지대 범위
    if (st.showZones) {
      for (const p of [PATCH_E, PATCH_W]) {
        const [x, y] = px(p.lon, p.lat);
        ctx.save();
        ctx.beginPath();
        ctx.ellipse(x, y, p.rx * k * CS, p.ry * k, 0, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(120,110,95,.10)';
        ctx.fill();
        ctx.setLineDash([6, 5]);
        ctx.strokeStyle = 'rgba(95,80,60,.75)';
        ctx.lineWidth = 1.4;
        ctx.stroke();
        ctx.restore();
      }
    }

    // 주요 해류(굵은 화살표 + 흐르는 점선)
    if (st.showCurrents) {
      for (const c of CURRENTS) {
        const pts = c.path.map(([lo, la]) => px(lo, la));
        const col = RING_COLOR[c.ring];
        const wdt = c.small ? 3 : 4.5;
        ctx.save();
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.globalAlpha = 0.85;
        ctx.strokeStyle = col; ctx.lineWidth = wdt;
        ctx.beginPath(); smoothLine(pts); ctx.stroke();
        // 흐르는 느낌: 흰 점선이 해류 방향으로 움직임
        ctx.globalAlpha = 0.9;
        ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = wdt * 0.4;
        ctx.setLineDash([2, 14]);
        ctx.lineDashOffset = -(st.time * 22) % 16;
        ctx.beginPath(); smoothLine(pts); ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
        const a = pts[pts.length - 2], b = pts[pts.length - 1];
        ctx.fillStyle = col;
        ctx.beginPath(); arrowHead(b[0], b[1], Math.atan2(b[1] - a[1], b[0] - a[0]), c.small ? 9 : 12); ctx.fill();
        ctx.restore();
      }
      for (const c of CURRENTS) {
        const [x, y] = px(c.label[0], c.label[1]);
        label(c.name, x, y, { size: c.small ? 11.5 : 13, color: c.ring === 'sub' ? '#9c2a5c' : '#1f5f9a', rot: c.rot || 0 });
      }
    }

    // 흐름 화살표(길이 = 빠르기, 0.4 m/s 넘으면 같은 길이)
    if (st.showArrows) {
      const L = Math.max(14, Math.min(26, k * 2.6));
      ctx.save();
      ctx.strokeStyle = 'rgba(25,60,95,.75)'; ctx.fillStyle = 'rgba(25,60,95,.75)';
      ctx.lineWidth = 1.3; ctx.lineCap = 'round';
      for (const p of arrowPts) {
        const [x, y] = px(p.lon, p.lat);
        const len = Math.min(1, p.sp / 0.4) * L;
        if (len < 1.6) { ctx.beginPath(); ctx.arc(x, y, 1.1, 0, Math.PI * 2); ctx.fill(); continue; }
        const ang = Math.atan2(-p.v, p.u * 1);
        const ex = x + Math.cos(ang) * len * 0.5, ey = y + Math.sin(ang) * len * 0.5;
        ctx.beginPath();
        ctx.moveTo(x - Math.cos(ang) * len * 0.5, y - Math.sin(ang) * len * 0.5); ctx.lineTo(ex, ey); ctx.stroke();
        if (len > 5) { ctx.beginPath(); arrowHead(ex + Math.cos(ang) * 1.5, ey + Math.sin(ang) * 1.5, ang, Math.min(5, 2 + len * 0.18)); ctx.fill(); }
      }
      ctx.restore();
    }

    // 쓰레기 입자
    const r = Math.max(1.6, Math.min(2.6, k * 0.26));
    // 배열 순서대로 그려 여러 색이 섞여 보이게(색별로 몰아 그리면 많이 모인 곳이 한 색 덩어리처럼 보임)
    ctx.globalAlpha = 0.8;
    let lastC = -1;
    for (const p of st.parts) {
      if (p.state !== 0) continue;
      if (p.c !== lastC) { ctx.fillStyle = TRASH[p.c]; lastC = p.c; }
      const [x, y] = px(p.lon, p.lat);
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    // 해안에 밀려온 쓰레기(회색)
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = '#6f6a60';
    ctx.beginPath();
    for (const p of st.parts) {
      if (p.state !== 1) continue;
      const [x, y] = px(p.lon, p.lat);
      ctx.rect(x - r * 0.7, y - r * 0.7, r * 1.4, r * 1.4);
    }
    ctx.fill();
    ctx.globalAlpha = 1;

    // 쓰레기 지대 이름
    if (st.showZones) {
      const [xe, ye] = px(PATCH_E.lon, PATCH_E.lat + PATCH_E.ry + 1.6);
      label(`${PATCH_E.name} ${st.countsE}개`, xe, ye, { size: 13, color: '#5a4630' });
      const [xw, yw] = px(PATCH_W.lon, PATCH_W.lat - PATCH_W.ry - 1.6);
      label(`${PATCH_W.name} ${st.countsW}개`, xw, yw, { size: 12, color: '#5a4630' });
    }

    // 따라가는 쓰레기 하나: 지나온 길 + 큰 점
    const tp = st.tracked;
    if (tp && tp.trail.length) {
      ctx.save();
      ctx.strokeStyle = 'rgba(29,33,38,.8)'; ctx.lineWidth = 1.8; ctx.lineJoin = 'round';
      ctx.beginPath();
      tp.trail.forEach(([lo, la], i) => { const [x, y] = px(lo, la); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
      const [hx, hy] = px(tp.p.lon, tp.p.lat);
      ctx.lineTo(hx, hy);
      ctx.stroke();
      ctx.beginPath(); ctx.arc(hx, hy, 6.5, 0, Math.PI * 2);
      ctx.fillStyle = '#fff'; ctx.fill();
      ctx.lineWidth = 3; ctx.strokeStyle = '#e2552d'; ctx.stroke();
      ctx.restore();
      label(tp.p.state === 1 ? '해안에 밀려옴' : '따라가는 쓰레기', hx, hy - 15, { size: 12, color: '#b13a12' });
    }

    // 지명
    for (const p of PLACES) {
      const [x, y] = px(p.lon, p.lat);
      if (p.dot) {
        const [dx, dy] = px(p.dot[0], p.dot[1]);
        ctx.beginPath(); ctx.arc(dx, dy, 2.6, 0, Math.PI * 2); ctx.fillStyle = '#5b636d'; ctx.fill();
      }
      label(p.t, x, y, { size: p.big ? 16 : 12, weight: p.big ? 800 : 600, color: p.dim ? '#8a8f96' : '#3f4650' });
    }
    {
      const [x, y] = px(186, 22.5);
      label('태 평 양', x, y, { size: 19, weight: 600, color: 'rgba(31,95,154,.55)', halo: 'rgba(255,255,255,0)' });
    }

    // 마우스 위치의 해류 빠르기
    if (st.hover) {
      const { lon, lat } = st.hover;
      const [x, y] = px(lon, lat);
      ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2);
      ctx.strokeStyle = '#1d2126'; ctx.lineWidth = 1.5; ctx.stroke();
    }
  }

  return { canvas: cv, draw, unpx, px, buildArrows, get scale() { return k; }, get size() { return [W, H]; } };
}

const FONT = "Pretendard, 'Apple SD Gothic Neo', 'Malgun Gothic', system-ui, sans-serif";

/** 빠르기(m/s) → 색(옅은 하늘색 = 느림, 진한 파랑 = 빠름). 제곱근 눈금 */
export function speedColor(sp) {
  const t = Math.min(1, Math.sqrt(sp / 1.0));
  const a = [241, 248, 250], b = [150, 200, 228], c = [24, 82, 150];
  let col;
  if (t < 0.32) { const f = t / 0.32; col = a.map((v, i) => v + (b[i] - v) * f); }
  else { const f = (t - 0.32) / 0.68; col = b.map((v, i) => v + (c[i] - v) * f); }
  return [col[0] | 0, col[1] | 0, col[2] | 0, 235];
}
export const SPEED_CSS = (sp) => { const [r, g, b] = speedColor(sp); return `rgb(${r},${g},${b})`; };
export { TRASH };
