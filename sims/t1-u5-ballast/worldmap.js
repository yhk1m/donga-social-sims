// © 2026 김용현
// 세계 항로 지도(정거 원통 도법, 2D 캔버스). 배 위치와 도착항의 외래종 확산을 그린다.
import world from './world-110m.json';

const lerp = (a, b, t) => a + (b - a) * t;

function routeTable(route) {
  const cum = [0];
  for (let i = 1; i < route.length; i++) {
    const [a, b] = [route[i - 1], route[i]];
    const k = Math.cos(((a[1] + b[1]) / 2) * Math.PI / 180);
    cum.push(cum[i - 1] + Math.hypot((b[0] - a[0]) * k, b[1] - a[1]));
  }
  return { route, cum, total: cum[cum.length - 1] };
}

function pointAt(tab, t) {
  const d = Math.min(1, Math.max(0, t)) * tab.total;
  let i = 1;
  while (i < tab.cum.length - 1 && tab.cum[i] < d) i++;
  const [a, b] = [tab.route[i - 1], tab.route[i]];
  const f = (d - tab.cum[i - 1]) / (tab.cum[i] - tab.cum[i - 1] || 1);
  return { lon: lerp(a[0], b[0], f), lat: lerp(a[1], b[1], f), dir: Math.atan2(-(b[1] - a[1]), b[0] - a[0]) };
}

export function createWorldMap(host) {
  const cv = document.createElement('canvas');
  cv.className = 'ds-canvas';
  host.appendChild(cv);
  const ctx = cv.getContext('2d');
  let W = 1, H = 1, dpr = 1;
  const view = { lon: 40, lat: 30, span: 160 };
  const goal = { lon: 40, lat: 30, span: 160 };
  let kase = null, tab = null, blob = [];

  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = host.clientWidth || 1; H = host.clientHeight || 1;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    fitGoal();
  }
  new ResizeObserver(resize).observe(host);

  function fitGoal() {
    if (!kase) return;
    let x0 = 180, x1 = -180, y0 = 90, y1 = -90;
    for (const [x, y] of kase.route) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    // 화면 가장자리에 항구 이름이 들어갈 여백(px)을 남기고 맞춘다
    const mx = Math.min(130, W * 0.17), myTop = Math.min(80, H * 0.3), myBot = Math.min(40, H * 0.12);
    const spanX = Math.max(30, x1 - x0) / Math.max(0.3, 1 - (2 * mx) / W);
    const spanY = Math.max(15, y1 - y0) / Math.max(0.3, 1 - (myTop + myBot) / H);
    goal.span = Math.max(spanX, spanY * (W / H));
    goal.lon = (x0 + x1) / 2;
    const k = W / goal.span;
    goal.lat = (y0 + y1) / 2 + ((myTop - myBot) / 2) / k;
  }

  function setCase(c, instant) {
    kase = c;
    tab = routeTable(c.route);
    let seed = c.id.length * 97 + 13;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    blob = Array.from({ length: 16 }, () => ({ a: rnd() * Math.PI * 2, d: rnd(), r: 0.35 + rnd() * 0.55, at: rnd() * 0.6 }));
    fitGoal();
    if (instant) Object.assign(view, goal);
  }

  const px = (lon, lat) => {
    const k = W / view.span;
    return [W / 2 + (lon - view.lon) * k, H / 2 - (lat - view.lat) * k];
  };

  function ringPath(ring) {
    ring.forEach(([lon, lat], i) => {
      const [x, y] = px(lon, lat);
      if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    });
    ctx.closePath();
  }

  // s: { t(0..1 항로 위치), sailing, invasion(0..1), treat, step, time, ballast }
  function draw(s, dt) {
    const e = 1 - Math.exp(-dt * 3);
    view.lon = lerp(view.lon, goal.lon, e); view.lat = lerp(view.lat, goal.lat, e); view.span = lerp(view.span, goal.span, e);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#cfe1ec';
    ctx.fillRect(0, 0, W, H);

    // 경위선
    const k = W / view.span;
    ctx.strokeStyle = 'rgba(40,80,110,.12)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let lon = -180; lon <= 180; lon += 15) { const [x] = px(lon, 0); ctx.moveTo(x, 0); ctx.lineTo(x, H); }
    for (let lat = -75; lat <= 75; lat += 15) { const [, y] = px(0, lat); ctx.moveTo(0, y); ctx.lineTo(W, y); }
    ctx.stroke();

    // 육지·호수
    ctx.beginPath();
    for (const poly of world.land) for (const ring of poly) ringPath(ring);
    ctx.fillStyle = '#efe9dc';
    ctx.fill('evenodd');
    ctx.strokeStyle = '#b3aa96';
    ctx.lineWidth = 0.8;
    ctx.stroke();
    ctx.beginPath();
    for (const poly of world.lakes) for (const ring of poly) ringPath(ring);
    ctx.fillStyle = '#cfe1ec';
    ctx.fill('evenodd');
    ctx.stroke();

    if (!kase) return;
    const color = kase.color;
    const start = kase.route[0], end = kase.route[kase.route.length - 1];

    // 외래종 확산(도착항)
    if (s.invasion > 0.001) {
      const [cx, cy] = px(end[0], end[1]);
      const R = (2 + s.invasion * 9) * k;
      ctx.save();
      ctx.globalAlpha = 0.28;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(cx, cy, R * 0.55, 0, Math.PI * 2);
      for (const b of blob) {
        const g = Math.min(1, Math.max(0, (s.invasion - b.at * 0.5) / 0.5));
        if (g <= 0) continue;
        const bx = cx + Math.cos(b.a) * b.d * R * 0.75, by = cy + Math.sin(b.a) * b.d * R * 0.6;
        ctx.moveTo(bx + b.r * R * 0.5 * g, by);
        ctx.arc(bx, by, b.r * R * 0.5 * g, 0, Math.PI * 2);
      }
      ctx.fill();
      ctx.globalAlpha = 1;
      // 점들(생물)
      ctx.fillStyle = color;
      for (let i = 0; i < blob.length; i++) {
        const b = blob[i];
        const g = Math.min(1, Math.max(0, (s.invasion - b.at * 0.5) / 0.5));
        if (g <= 0) continue;
        const bx = cx + Math.cos(b.a + 0.4) * b.d * R * 0.8, by = cy + Math.sin(b.a + 0.4) * b.d * R * 0.55;
        ctx.beginPath(); ctx.arc(bx, by, 2.2, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }

    // 항로
    ctx.save();
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.beginPath();
    kase.route.forEach(([lon, lat], i) => { const [x, y] = px(lon, lat); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
    ctx.strokeStyle = 'rgba(255,255,255,.85)';
    ctx.lineWidth = 5;
    ctx.stroke();
    ctx.setLineDash([7, 6]);
    ctx.lineDashOffset = -s.time * (s.sailing ? 18 : 3);
    ctx.strokeStyle = '#1f6feb';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();

    // 항구
    const port = ([lon, lat], name, active, align) => {
      const [x, y] = px(lon, lat);
      ctx.beginPath();
      ctx.arc(x, y, active ? 6 : 4.5, 0, Math.PI * 2);
      ctx.fillStyle = '#fff';
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = active ? '#1d2126' : '#5b636d';
      ctx.stroke();
      ctx.font = `${active ? 700 : 600} 12.5px 'Pretendard Variable', Pretendard, system-ui, sans-serif`;
      ctx.textAlign = align; ctx.textBaseline = 'middle';
      const tw = ctx.measureText(name).width;
      let tx = x + (align === 'left' ? 10 : -10);
      if (align === 'left') tx = Math.min(tx, W - 6 - tw); else tx = Math.max(tx, 6 + tw);
      ctx.lineWidth = 3.5; ctx.strokeStyle = 'rgba(255,255,255,.9)';
      ctx.strokeText(name, tx, y - 12);
      ctx.fillStyle = '#1d2126';
      ctx.fillText(name, tx, y - 12);
    };
    const startLeft = start[0] < end[0];
    port(start, `출발항 · ${kase.fromPort}`, s.step === 1, startLeft ? 'right' : 'left');
    port(end, `도착항 · ${kase.toPort}`, s.step === 3, startLeft ? 'left' : 'right');

    // 처리 장치로 막았다는 표시
    if (s.treat && s.invasion <= 0.001 && s.step >= 3) {
      const [x, y] = px(end[0], end[1]);
      ctx.save();
      ctx.font = "600 12px 'Pretendard Variable', Pretendard, system-ui, sans-serif";
      ctx.textAlign = startLeft ? 'left' : 'right'; ctx.textBaseline = 'middle';
      const text = '처리된 평형수 — 외래종 정착 없음';
      const tw = ctx.measureText(text).width;
      const bx = Math.min(W - tw - 22, Math.max(6, startLeft ? x + 10 : x - 10 - tw - 12));
      ctx.fillStyle = 'rgba(22,163,163,.95)';
      ctx.beginPath(); ctx.roundRect(bx - 2, y + 4, tw + 16, 22, 6); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'left';
      ctx.fillText(text, bx + 6, y + 15);
      ctx.restore();
    }

    // 배
    const p = pointAt(tab, s.t);
    const [sx, sy] = px(p.lon, p.lat);
    let dir = p.dir;
    if (s.step === 4) dir += Math.PI;
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(dir);
    ctx.beginPath();
    ctx.moveTo(11, 0); ctx.lineTo(4, -5); ctx.lineTo(-9, -5); ctx.lineTo(-9, 5); ctx.lineTo(4, 5); ctx.closePath();
    ctx.fillStyle = '#26374d';
    ctx.fill();
    ctx.lineWidth = 1.5; ctx.strokeStyle = '#fff'; ctx.stroke();
    if (s.ballast > 0.02) {
      ctx.fillStyle = '#5fb0ea';
      ctx.fillRect(-7, -3, 12 * Math.min(1, s.ballast), 6);
    }
    ctx.restore();
  }

  resize();
  return { setCase, draw };
}
