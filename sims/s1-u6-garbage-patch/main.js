// © 2026 김용현
// 태평양 거대 쓰레기 지대의 형성 — 해류를 따라 떠다니던 쓰레기가 흐름이 약한 환류 가운데에 모이는 모형
// 규칙(EMBED_RULES.md): DOM 은 h()/createElement 로만, 탐색은 root 안에서만, 저장소·네트워크 없음.
//
// 사실 자료(출처)
//  - 면적 약 160만 km²(한반도의 약 7배), 플라스틱 개체의 94% 이상이 0.5 cm보다 작은 미세 플라스틱:
//    동아출판 중등 사회1 108쪽(『르몽드 디플로마티크』, 2022. 7. 2. 인용)
//  - 약 1조 8천억 개, 7만 9천 톤 이상: Lebreton 외(2018), Scientific Reports 8:4666 (The Ocean Cleanup)
//  - 동쪽(하와이~캘리포니아 사이)·서쪽(일본 가까이) 쓰레기 지대, '섬'이 아니라 물속에 흩어진 작은 조각:
//    미국 해양 대기청(NOAA) 해양 쓰레기 프로그램(Marine Debris Program)
//  - 해류 모양: 교과서 108쪽 지도(미국 해양 대기청, 2023). 빠르기는 모형 값(쿠로시오 최대 약 1.4 m/s로 맞춤).
import { createShell, addBlock } from '../../src/shared/shell.js';
import { h, s, icon } from '../../src/shared/dom.js';
import './style.css';
import landRings from './land.json';
import { buildLandMask, makeSampler, current, speed, PATCH_E } from './field.js';
import { createModel, SOURCES } from './model.js';
import { createMapView, CURRENTS, SPEED_CSS, TRASH } from './mapview.js';

const END_YEAR = 30;
const RATES = [{ t: '느리게', v: 0.12 }, { t: '보통', v: 0.3 }, { t: '빠르게', v: 0.8 }]; // 1초에 몇 년
const AMOUNTS = [{ t: '적게', v: 70 }, { t: '보통', v: 150 }, { t: '많게', v: 300 }]; // 한 해에 한 곳(연안)에서 나오는 입자 수
const AMERICA_SHARE = 0.5; // 북아메리카 연안은 아시아 연안의 절반만 내보냄(모형 가정 — 아시아 쪽 인구·하천이 더 많음)

const targetIcon = () => s('svg', { class: 'ds-icon', viewBox: '0 0 24 24', 'aria-hidden': 'true' },
  s('circle', { cx: 12, cy: 12, r: 8 }), s('circle', { cx: 12, cy: 12, r: 3 }),
  s('line', { x1: 12, y1: 1, x2: 12, y2: 4 }), s('line', { x1: 12, y1: 20, x2: 12, y2: 23 }),
  s('line', { x1: 1, y1: 12, x2: 4, y2: 12 }), s('line', { x1: 20, y1: 12, x2: 23, y2: 12 }));

const fmt = (n) => n.toLocaleString('ko-KR');
const fmtSpeed = (v) => (v >= 0.1 ? v.toFixed(1) : v.toFixed(2));

export default function mount(root) {
  const { stage, panel } = createShell(root, 's1-u6-garbage-patch');
  const mask = buildLandMask(landRings);
  const sample = makeSampler();
  const model = createModel(mask.isLand, sample);

  const S = {
    playing: true, rate: 1, amount: 1,
    src: { asia: true, america: true },
    showCurrents: true, showArrows: false, showShade: false, showZones: true,
    hover: null, tracked: null, acc: { asia: 0, america: 0 }, msg: '',
  };

  // ---------- 무대 ----------
  const timeV = h('b', { class: 'gp-time-v' }, '0년');
  const msgEl = h('span', { class: 'gp-msg' });
  const card = h('div', { class: 'gp-card' },
    h('span', { class: 'gp-time-k' }, '흐른 시간'), timeV,
    h('span', { class: 'gp-model' }, '모형 · 실제보다 단순하게 나타냄'), msgEl);
  const legend = h('ul', { class: 'gp-legend' });
  const tip = h('div', { class: 'gp-tip', hidden: true });
  const mapHost = h('div', { class: 'gp-maphost' });
  stage.append(mapHost, card, legend, tip);
  const map = createMapView(mapHost, landRings);
  map.buildArrows(mask.isLand);

  // ---------- 사이드바 ----------
  addBlock(panel, h('p', { class: 'ds-note gp-lead' },
    '아시아와 북아메리카 해안에서 바다로 흘러간 쓰레기가 해류를 따라 어디로 가는지 살펴보자. 쓰레기는 결국 어디에 모일까?'));

  const playBtn = h('button', { class: 'ds-btn ds-primary', type: 'button', on: { click: () => setPlaying(!S.playing) } });
  const resetBtn = h('button', { class: 'ds-btn', type: 'button', on: { click: () => restart() } }, icon('reset'), '처음부터');
  const rateBtns = RATES.map((r, i) => h('button', { class: 'ds-seg-btn', type: 'button', 'aria-pressed': String(i === S.rate), on: { click: () => { S.rate = i; syncSeg(rateBtns, i); } } }, r.t));
  addBlock(panel, h('div', { class: 'ds-ctl' },
    h('div', { class: 'ds-row' }, playBtn, resetBtn),
    h('span', { class: 'ds-label' }, '빠르기'),
    h('div', { class: 'ds-seg', role: 'group', 'aria-label': '빠르기' }, rateBtns)));

  const srcChecks = Object.entries(SOURCES).map(([key, src]) => {
    const cb = h('input', { type: 'checkbox', checked: true, on: { change: () => { S.src[key] = cb.checked; } } });
    return h('label', { class: 'ds-check' }, cb, src.name);
  });
  const amtBtns = AMOUNTS.map((a, i) => h('button', { class: 'ds-seg-btn', type: 'button', 'aria-pressed': String(i === S.amount), on: { click: () => { S.amount = i; syncSeg(amtBtns, i); } } }, a.t));
  const trackBtn = h('button', { class: 'ds-btn', type: 'button', on: { click: () => track() } }, targetIcon(), '쓰레기 하나 따라가기');
  addBlock(panel, h('div', { class: 'ds-ctl' },
    h('h2', { class: 'ds-h2' }, '쓰레기가 나오는 곳'),
    h('div', { class: 'gp-checks' }, srcChecks),
    h('span', { class: 'ds-label' }, '버려지는 양'),
    h('div', { class: 'ds-seg', role: 'group', 'aria-label': '버려지는 양' }, amtBtns),
    trackBtn));

  const toggles = [
    ['showCurrents', '주요 해류 이름과 방향'],
    ['showArrows', '흐름 화살표 (길이 = 빠르기)'],
    ['showShade', '해류 세기 색칠'],
    ['showZones', '쓰레기 지대 범위'],
  ].map(([key, text]) => {
    const cb = h('input', { type: 'checkbox', checked: S[key], on: { change: () => { S[key] = cb.checked; syncLegend(); } } });
    return h('label', { class: 'ds-check' }, cb, text);
  });
  addBlock(panel, h('div', { class: 'ds-ctl' }, h('h2', { class: 'ds-h2' }, '지도에 보이기'), toggles));

  const stat = {};
  const row = (key, k) => [h('dt', { class: 'ds-stat-k' }, k), (stat[key] = h('dd', { class: 'ds-stat-v' }, '0'))];
  const shareFill = h('span', { class: 'gp-share-fill' });
  const shareText = h('span', { class: 'gp-share-t' });
  addBlock(panel, h('div', { class: 'ds-ctl' },
    h('h2', { class: 'ds-h2' }, '지금 바다의 쓰레기'),
    h('dl', { class: 'ds-stat' },
      row('floating', '바다에 떠 있는 쓰레기'),
      row('e', '동쪽 쓰레기 지대 안'),
      row('w', '서쪽 쓰레기 지대 안'),
      row('beached', '해안에 다시 밀려옴')),
    h('div', { class: 'gp-share' }, h('span', { class: 'gp-share-bar' }, shareFill), shareText)));

  // 해류 빠르기 비교(모형 값) — 각 해류 경로 위 빠르기의 평균, 쓰레기 지대는 가운데 반지름 2° 안의 평균
  const nearMax = (lon, lat) => { let m = 0; for (let a = -1.5; a <= 1.5; a += 0.5) for (let b = -1.5; b <= 1.5; b += 0.5) m = Math.max(m, speed(lon + a, lat + b)); return m; };
  const pathSpeed = (name) => { const c = CURRENTS.find((x) => x.name === name); const v = c.path.map(([lo, la]) => nearMax(lo, la)); return v.reduce((a, b) => a + b, 0) / v.length; };
  const zoneSpeed = (p) => { let t = 0, n = 0; for (let a = -2; a <= 2; a += 0.5) for (let b = -2; b <= 2; b += 0.5) { t += speed(p.lon + a, p.lat + b); n++; } return t / n; };
  const cmp = [
    ['쿠로시오 해류', pathSpeed('쿠로시오 해류')],
    ['북태평양 해류', pathSpeed('북태평양 해류')],
    ['북적도 해류', pathSpeed('북적도 해류')],
    ['캘리포니아 해류', pathSpeed('캘리포니아 해류')],
    ['동쪽 쓰레기 지대 가운데', zoneSpeed(PATCH_E), true],
  ];
  const vmax = cmp[0][1];
  const ratio = Math.round(cmp[0][1] / cmp[4][1]);
  addBlock(panel, h('div', { class: 'ds-ctl' },
    h('h2', { class: 'ds-h2' }, '해류 빠르기 비교'),
    h('span', { class: 'gp-small' }, '모형 속 평균 빠르기(m/s = 1초에 몇 m)'),
    h('div', { class: 'gp-bars' }, cmp.map(([name, v, zone]) => h('div', { class: `gp-bar-row${zone ? ' gp-zone' : ''}` },
      h('span', { class: 'gp-bar-k' }, name),
      h('span', { class: 'gp-bar' }, h('span', { class: 'gp-bar-fill', style: { width: `${Math.max(1.5, (v / vmax) * 100)}%` } })),
      h('span', { class: 'gp-bar-v' }, `${fmtSpeed(v)} m/s`)))),
    h('p', { class: 'gp-small' }, `쓰레기 지대 가운데는 쿠로시오 해류보다 약 ${ratio}배 느리다. 흐름이 약하니 한번 들어온 쓰레기가 잘 빠져나가지 못하고, 바람의 영향으로 바닷물이 가운데로 조금씩 모여들어 쓰레기가 쌓인다.`)));

  addBlock(panel, h('div', { class: 'ds-ctl' },
    h('h2', { class: 'ds-h2' }, '실제 태평양 거대 쓰레기 지대'),
    h('ul', { class: 'gp-facts' },
      h('li', {}, '넓이 약 160만 km² 이상 — 한반도 면적의 약 7배'),
      h('li', {}, '플라스틱 조각의 94% 이상이 0.5 cm보다 작은 미세 플라스틱'),
      h('li', {}, '약 1조 8천억 개, 무게 7만 9천 톤 이상으로 추정'),
      h('li', {}, '단단한 섬이 아니라, 작은 조각이 물속에 흩어진 ‘플라스틱 수프’에 가까워 지도나 위성 사진에 잘 보이지 않음'),
      h('li', {}, '하와이와 캘리포니아 사이(동쪽)와 일본 가까이(서쪽)에 쓰레기가 많이 모인 곳이 있음'))));

  addBlock(panel, h('p', { class: 'gp-src' },
    '출처: 동아출판 중등 사회1 108쪽(『르몽드 디플로마티크』, 2022), 해류 모양은 교과서 지도(미국 해양 대기청, 2023)를 따름. 개수·무게: Lebreton 외(2018), Scientific Reports(The Ocean Cleanup). 쓰레기 지대 위치·특징: 미국 해양 대기청(NOAA) 해양 쓰레기 프로그램. 지도: Natural Earth. ',
    h('b', {}, '모형 안내: '),
    '해류는 실제 관측값이 아니라 환류 모양을 흉내 낸 단순한 흐름이고, 점 하나는 실제 쓰레기 한 개가 아니라 많은 쓰레기를 나타낸다.'));

  // ---------- 동작 ----------
  function syncSeg(btns, i) { btns.forEach((b, j) => b.setAttribute('aria-pressed', String(i === j))); }
  function setPlaying(v) {
    if (v && model.day / 365 >= END_YEAR) restart();
    S.playing = v;
    playBtn.replaceChildren(icon(v ? 'pause' : 'play'), v ? '일시 정지' : '재생');
  }
  function restart() {
    model.reset();
    S.tracked = null; S.acc = { asia: 0, america: 0 }; S.msg = '';
    setPlaying(true);
    updateStats(true);
  }
  function track() {
    if (model.day / 365 >= END_YEAR) restart();
    // 아시아 연안이 꺼져 있으면 북아메리카에서
    const key = S.src.asia || !S.src.america ? 'asia' : 'america';
    const p = model.release(key, 1, true);
    S.tracked = { p, trail: [[p.lon, p.lat]], lastDay: model.day };
    if (!S.playing) setPlaying(true);
  }

  function syncLegend() {
    const items = [];
    if (S.showCurrents) {
      items.push(h('li', { class: 'gp-li' }, h('span', { class: 'gp-line gp-sub' }), '북태평양 환류(시계 방향)'));
      items.push(h('li', { class: 'gp-li' }, h('span', { class: 'gp-line gp-polar' }), '북쪽 순환(시계 반대 방향)'));
    }
    items.push(h('li', { class: 'gp-li' }, h('span', { class: 'gp-dots' }, TRASH.slice(0, 3).map((c) => h('span', { class: 'gp-dot', style: { background: c } }))), '떠다니는 쓰레기'));
    items.push(h('li', { class: 'gp-li' }, h('span', { class: 'gp-dot gp-gray' }), '해안에 밀려온 쓰레기'));
    if (S.showZones) items.push(h('li', { class: 'gp-li' }, h('span', { class: 'gp-zone-sw' }), '쓰레기 지대 범위'));
    if (S.showShade) {
      items.push(h('li', { class: 'gp-li gp-li-grad' }, '해류 세기',
        h('span', { class: 'gp-grad' }, [0, 0.03, 0.1, 0.25, 0.5, 1].map((v) => h('span', { class: 'gp-grad-c', style: { background: SPEED_CSS(v) } }))),
        h('span', { class: 'gp-grad-t' }, '느림 → 빠름')));
    }
    if (S.showArrows) items.push(h('li', { class: 'gp-li' }, '화살표가 짧을수록(점일수록) 흐름이 약함'));
    legend.replaceChildren(...items);
  }

  let lastStat = 0;
  function updateStats(force) {
    const now = performance.now();
    if (!force && now - lastStat < 200) return;
    lastStat = now;
    const c = model.counts();
    stat.floating.textContent = `${fmt(c.floating)}개`;
    stat.e.textContent = `${fmt(c.e)}개`;
    stat.w.textContent = `${fmt(c.w)}개`;
    stat.beached.textContent = `${fmt(c.beached)}개`;
    const share = c.floating ? (c.e + c.w) / c.floating : 0;
    shareFill.style.width = `${(share * 100).toFixed(1)}%`;
    shareText.textContent = `떠 있는 쓰레기 중 ${Math.round(share * 100)}%가 두 쓰레기 지대 안에 있음`;
    const days = model.day, y = Math.floor(days / 365), m = Math.floor((days % 365) / 30.42);
    timeV.textContent = y ? `${y}년 ${m}개월` : `${m}개월`;
    msgEl.textContent = S.msg;
    msgEl.hidden = !S.msg;
    S.counts = c;
  }

  // 마우스를 올린 곳의 해류 빠르기
  map.canvas.addEventListener('pointermove', (e) => {
    const r = map.canvas.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    const [lon, lat] = map.unpx(x, y);
    if (mask.isLand(lon, lat) || lat < -7 || lat > 64 || lon < 106 || lon > 260) { S.hover = null; tip.hidden = true; return; }
    S.hover = { lon, lat };
    const [u, v] = current(lon, lat);
    const sp = Math.hypot(u, v);
    const note = sp < 0.05 ? '흐름이 아주 약한 곳' : sp < 0.15 ? '흐름이 약한 곳' : sp < 0.5 ? '흐름이 보통인 곳' : '흐름이 빠른 곳';
    tip.replaceChildren(
      h('b', {}, note),
      h('span', {}, `빠르기 약 ${fmtSpeed(sp)} m/s (하루 약 ${fmt(Math.round(sp * 86.4))} km)`));
    tip.hidden = false;
    const [W, H] = map.size;
    tip.style.left = `${Math.min(x + 14, W - 230)}px`;
    tip.style.top = `${Math.min(y + 14, H - 60)}px`;
  });
  map.canvas.addEventListener('pointerleave', () => { S.hover = null; tip.hidden = true; });

  let last = performance.now(), anim = 0;
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    anim += dt;
    if (S.playing) {
      const days = RATES[S.rate].v * 365 * dt;
      const perDay = AMOUNTS[S.amount].v / 365;
      for (const key of ['asia', 'america']) {
        if (!S.src[key]) continue;
        S.acc[key] += perDay * days * (key === 'america' ? AMERICA_SHARE : 1);
        const n = Math.floor(S.acc[key]);
        if (n > 0) { model.release(key, n); S.acc[key] -= n; }
      }
      model.step(days);
      const T = S.tracked;
      if (T && T.p.state === 0 && model.day - T.lastDay >= 8) { T.trail.push([T.p.lon, T.p.lat]); T.lastDay = model.day; }
      if (model.day / 365 >= END_YEAR) { S.msg = `${END_YEAR}년이 지나 멈췄어요. 처음부터 다시 볼 수 있어요.`; setPlaying(false); updateStats(true); }
      updateStats(false);
    }
    const c = S.counts || { e: 0, w: 0 };
    map.draw({ parts: model.parts, tracked: S.tracked, showCurrents: S.showCurrents, showArrows: S.showArrows, showShade: S.showShade, showZones: S.showZones, time: anim, hover: S.hover, countsE: c.e, countsW: c.w });
    if (root.isConnected) requestAnimationFrame(frame);
  }

  syncLegend();
  setPlaying(true);
  updateStats(true);
  requestAnimationFrame(frame);
}
