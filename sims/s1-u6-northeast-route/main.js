// © 2026 김용현
// 북동 항로와 기존 항로 비교 — 지구 온난화 전(1979년 9월 해빙)·후(2022년 9월 해빙)를 골라
// 부산 → 로테르담 두 항로의 배를 동시에 출발시키고, 운항 일수와 운송비(가정)를 비교한다.
// 규칙(EMBED_RULES.md): DOM 은 h() 로만 만들고, 탐색은 root 안에서만.
import { createShell, addBlock } from '../../src/shared/shell.js';
import { h, icon, clear, append } from '../../src/shared/dom.js';
import './style.css';
import { ROUTES, ASSUME, plan } from './model.js';
import { createGlobe } from './globe.js';

const DAYS_PER_SEC = 4; // 화면에서 1초 = 4일
const fmt = (n) => Math.round(n).toLocaleString('ko-KR');
const eok = (man) => `${(man / 10000).toFixed(1)}억 원`; // 만 원 → 억 원

export default function mount(root, opts = {}) {
  const { stage, panel } = createShell(root, 's1-u6-northeast-route');
  const S = { warm: false, knot: 12, fuelPrice: ASSUME.fuelPrice, day: 0, playing: false };
  let P = null; // { suez: plan, nsr: plan }

  // ---------- 무대 ----------
  const mapBox = h('div', { class: 'nr-map', 'aria-label': '북동 항로와 기존 항로 지구본 지도' });
  const hud = h('div', { class: 'nr-hud', 'aria-live': 'off' });
  const banner = h('div', { class: 'nr-banner', hidden: true, 'aria-live': 'polite' });
  const legend = h('ul', { class: 'nr-legend' });
  const viewBtns = h('div', { class: 'nr-viewbtns' },
    h('button', { class: 'ds-btn nr-mini', type: 'button', title: '크게', 'aria-label': '지도 크게', on: { click: () => { globe.zoomBy(1.2); kick(); } } }, icon('plus')),
    h('button', { class: 'ds-btn nr-mini', type: 'button', title: '작게', 'aria-label': '지도 작게', on: { click: () => { globe.zoomBy(1 / 1.2); kick(); } } }, icon('minus')),
    h('button', { class: 'ds-btn nr-mini', type: 'button', title: '지도 처음 모양으로', on: { click: () => { globe.resetView(); kick(); } } }, icon('reset'), '시점'));
  const hint = h('div', { class: 'nr-hint' }, '지구본을 끌어서 돌려 볼 수 있다');
  stage.append(mapBox, hud, banner, legend, viewBtns, hint);
  const globe = createGlobe(mapBox);

  // ---------- 사이드바 ----------
  const eraBtns = [
    ['전', false, '1979년 9월 해빙'],
    ['후', true, '2022년 9월 해빙'],
  ].map(([t, warm, sub]) => h('button', { class: 'ds-seg-btn nr-era', type: 'button', on: { click: () => setWarm(warm) } },
    h('b', { class: 'nr-era-t' }, `지구 온난화 ${t}`), h('small', { class: 'nr-era-s' }, sub)));
  const eraNote = h('p', { class: 'nr-era-note' });
  addBlock(panel, h('div', { class: 'ds-ctl' },
    h('h2', { class: 'ds-h2' }, '북극해의 여름 얼음'),
    h('div', { class: 'ds-seg', role: 'group', 'aria-label': '지구 온난화 전후' }, eraBtns),
    eraNote));

  const playBtn = h('button', { class: 'ds-btn ds-primary', type: 'button', on: { click: () => togglePlay() } });
  const resetBtn = h('button', { class: 'ds-btn', type: 'button', on: { click: () => { restart(); } } }, icon('reset'), '처음으로');
  const knotOut = h('output', { class: 'ds-out' });
  const knotIn = h('input', { class: 'ds-range', type: 'range', min: 8, max: 20, step: 1, value: S.knot, 'aria-label': '배의 속도(노트)',
    on: { input: () => { S.knot = +knotIn.value; recompute(); restart(); } } });
  addBlock(panel, h('div', { class: 'ds-ctl' },
    h('h2', { class: 'ds-h2' }, '항해하기'),
    h('div', { class: 'ds-row' }, playBtn, resetBtn),
    h('label', { class: 'ds-label nr-gap' }, '배의 속도', knotOut),
    knotIn,
    h('p', { class: 'nr-small' }, '노트: 배의 속력 단위. 1노트는 1시간에 1.852km를 가는 빠르기다. 속도를 바꾸면 처음부터 다시 출발한다.')));

  const cmp = addBlock(panel, h('div', { class: 'nr-cmp' }));
  const costBox = addBlock(panel, h('div', { class: 'nr-cost' }));

  const priceOut = h('output', { class: 'ds-out' });
  const priceIn = h('input', { class: 'ds-range', type: 'range', min: 50, max: 150, step: 5, value: S.fuelPrice, 'aria-label': '연료 1톤 값(만 원)',
    on: { input: () => { S.fuelPrice = +priceIn.value; recompute(); renderPanel(); } } });
  addBlock(panel, h('div', { class: 'nr-assume' },
    h('h2', { class: 'ds-h2' }, h('span', { class: 'nr-tag' }, '가정'), '운송비 계산에 쓴 값'),
    h('p', { class: 'nr-small' }, '대형 컨테이너선 한 척이 한 번 가는 경우를 단순하게 어림한 값이다. 실제 비용은 배 크기, 연료값, 환율, 계약에 따라 크게 달라진다.'),
    h('ul', { class: 'nr-ul' },
      h('li', {}, `연료: 12노트로 달리면 하루 약 ${ASSUME.baseFuel}톤. 빠르게 달릴수록 연료가 훨씬 많이 든다(속도의 세제곱에 비례).`),
      h('li', {}, `선박 운영비(선원 인건비, 배 빌리는 값 등): 하루 ${fmt(ASSUME.opsPerDay)}만 원`),
      h('li', {}, `기존 항로: 수에즈 운하 통행료 ${eok(ASSUME.suezToll)}`),
      h('li', {}, `북동 항로: 쇄빙선 안내·도선료 ${eok(ASSUME.icebreaker)}, 얼음 바다 추가 보험료 ${eok(ASSUME.insurance)}`),
      h('li', {}, `북동 항로의 얼음 구간(베링 해협 ~ 카라 해협, 약 ${fmt(ROUTES.nsr.iceTo - ROUTES.nsr.iceFrom)}km)에서는 떠다니는 얼음 때문에 최고 ${ASSUME.iceKnot}노트로만 달린다.`)),
    h('label', { class: 'ds-label nr-gap' }, '연료 1톤 값', priceOut),
    priceIn));

  addBlock(panel, h('div', { class: 'ds-note nr-limit' },
    h('b', { class: 'nr-b' }, '북동 항로의 한계'),
    h('ul', { class: 'nr-ul' },
      h('li', {}, '얼음이 가장 적은 여름~가을(대략 7~11월)에 주로 다닐 수 있다. 겨울에는 다시 얼어붙어 쇄빙선 없이 다니기 어렵다.'),
      h('li', {}, '떠다니는 얼음, 짙은 안개, 추위 때문에 속도를 늦춰야 하고, 얼음에 견디도록 만든 배가 필요하다.'),
      h('li', {}, '물이 얕은 해협이 있어 아주 큰 배는 지나가기 어렵다.'),
      h('li', {}, '기름이 새는 사고가 나면 북극의 자연환경이 크게 오염될 수 있다.'))));

  addBlock(panel, h('p', { class: 'nr-src' },
    h('b', { class: 'nr-b' }, '출처 '),
    '항로 거리: 교과서 113쪽 자료1(『한국무역신문』, 2022. 8. 12.). ',
    '교과서 지도의 운항 일수: 40일 → 30일(한국 해양 수산 개발원, 2021). ',
    '해빙 범위: 미국 국립 빙설 자료 센터(NSIDC) Sea Ice Index 4판, 1979년·2022년 9월 월평균 해빙 범위. ',
    '지도: Natural Earth 1:110m. 항로선은 교과서 지도를 따라 그린 설명용 경로이고, 운송비는 위의 가정으로 계산한 어림값이다.'));

  // ---------- 동작 ----------
  function recompute() {
    P = { suez: plan(ROUTES.suez, S.knot, S.fuelPrice), nsr: plan(ROUTES.nsr, S.knot, S.fuelPrice) };
  }
  function setWarm(w) { S.warm = w; restart(); }
  function restart() { S.day = 0; S.playing = false; syncUI(); renderPanel(); kick(); }
  function togglePlay() {
    if (finished()) S.day = 0;
    S.playing = !S.playing;
    syncUI(); kick();
  }
  const finished = () => S.day >= endDay();
  const endDay = () => (S.warm ? Math.max(P.suez.days, P.nsr.days) : P.suez.days);

  function syncUI() {
    eraBtns.forEach((b, i) => b.setAttribute('aria-pressed', String((i === 1) === S.warm)));
    clear(eraNote).append(S.warm
      ? '여름에 북극해 얼음이 크게 줄어 러시아 북쪽 바다에 뱃길이 열렸다. 두 배가 함께 출발한다.'
      : '여름에도 북극해 얼음이 러시아 북쪽 바다를 막고 있다. 일반 화물선은 기존 항로로만 갈 수 있다.');
    const label = S.playing ? '멈춤' : finished() ? '다시 출발' : S.day > 0 ? '계속' : '출발';
    clear(playBtn).append(icon(S.playing ? 'pause' : 'play'), label);
    knotOut.textContent = `${S.knot}노트 (시속 약 ${Math.round(S.knot * 1.852)}km)`;
    priceOut.textContent = `${S.fuelPrice}만 원`;
    clear(legend).append(
      h('li', { class: 'nr-li' }, h('i', { class: 'nr-sw nr-sw-suez' }), '기존 항로 (수에즈 운하 경유)'),
      h('li', { class: S.warm ? 'nr-li' : 'nr-li nr-off' }, h('i', { class: S.warm ? 'nr-sw nr-sw-nsr' : 'nr-sw nr-sw-off' }), S.warm ? '북동 항로 (북극해 경유)' : '북동 항로 (해빙에 막힘)'),
      h('li', { class: 'nr-li' }, h('i', { class: 'nr-sw nr-sw-ice' }), `${S.warm ? 2022 : 1979}년 9월 해빙 범위`));
  }

  const bar = (v, max, color, cls = '') => h('span', { class: `nr-bar ${cls}` }, h('span', { class: 'nr-fill', style: { width: `${Math.max(0, Math.min(100, (v / max) * 100))}%`, background: color } }));

  function renderPanel() {
    const a = P.suez, b = P.nsr, w = S.warm;
    const cell = (v, off) => h('div', { class: off ? 'nr-c nr-na' : 'nr-c' }, v);
    const rows = [
      ['운항 거리', `약 ${fmt(ROUTES.suez.km)}km`, `약 ${fmt(ROUTES.nsr.km)}km`],
      ['걸리는 날', `약 ${Math.round(a.days)}일`, `약 ${Math.round(b.days)}일`],
      ['연료 사용량', `약 ${fmt(a.fuelTon)}톤`, `약 ${fmt(b.fuelTon)}톤`],
      ['운송비(어림)', eok(a.total), eok(b.total)],
    ];
    const dDays = a.days - b.days, dCost = a.total - b.total;
    clear(cmp).append(
      h('h2', { class: 'ds-h2' }, '두 항로 비교', h('small', { class: 'nr-h2s' }, ' 부산 → 로테르담')),
      h('div', { class: 'nr-grid' },
        h('div', { class: 'nr-c nr-hd' }),
        h('div', { class: 'nr-c nr-hd nr-hd-suez' }, '기존 항로'),
        h('div', { class: w ? 'nr-c nr-hd nr-hd-nsr' : 'nr-c nr-hd nr-na' }, '북동 항로'),
        rows.flatMap(([k, x, y]) => [h('div', { class: 'nr-c nr-k' }, k), cell(x), cell(w ? y : (k === '운항 거리' ? y : '갈 수 없음'), !w)])),
      w
        ? h('p', { class: 'nr-sum' }, '북동 항로가 ', h('b', { class: 'nr-b' }, `약 ${Math.round(dDays)}일 먼저`), ' 도착하고, 운송비는 ',
          h('b', { class: 'nr-b' }, `약 ${eok(Math.abs(dCost))}(${Math.round(Math.abs(dCost) / a.total * 100)}%) ${dCost >= 0 ? '적게' : '많이'}`), ' 든다.',
          h('span', { class: 'nr-sum-s' }, ` 거리는 ${Math.round((1 - ROUTES.nsr.km / ROUTES.suez.km) * 100)}% 짧다.`))
        : h('p', { class: 'nr-sum nr-sum-off' }, '지구 온난화 전에는 여름에도 얼음 때문에 북동 항로를 이용하기 어려워, 아시아와 유럽 사이의 배는 수에즈 운하를 지나는 기존 항로로 다녔다.'));

    // 운송비 막대(쌓기)
    const max = Math.max(a.total, b.total) * 1.02;
    const stack = (p, on) => h('div', { class: on ? 'nr-stack' : 'nr-stack nr-stack-off' },
      h('span', { class: 'nr-seg nr-seg-fuel', style: { width: `${p.fuelCost / max * 100}%` }, title: `연료비 ${eok(p.fuelCost)}` }),
      h('span', { class: 'nr-seg nr-seg-ops', style: { width: `${p.opsCost / max * 100}%` }, title: `운영비 ${eok(p.opsCost)}` }),
      h('span', { class: 'nr-seg nr-seg-extra', style: { width: `${p.extraCost / max * 100}%` }, title: `통행료 등 ${eok(p.extraCost)}` }));
    const detail = (p) => h('dl', { class: 'nr-dl' },
      h('dt', { class: 'nr-dt' }, h('i', { class: 'nr-dot nr-seg-fuel' }), '연료비'), h('dd', { class: 'nr-dd' }, eok(p.fuelCost)),
      h('dt', { class: 'nr-dt' }, h('i', { class: 'nr-dot nr-seg-ops' }), '선박 운영비'), h('dd', { class: 'nr-dd' }, eok(p.opsCost)),
      p.extra.flatMap((e) => [h('dt', { class: 'nr-dt' }, h('i', { class: 'nr-dot nr-seg-extra' }), e.k), h('dd', { class: 'nr-dd' }, eok(e.v))]));
    append(clear(costBox), [
      h('h2', { class: 'ds-h2' }, '운송비 나누어 보기', h('span', { class: 'nr-tag' }, '가정')),
      h('div', { class: 'nr-crow' }, h('span', { class: 'nr-cname nr-t-suez' }, '기존 항로'), stack(a, true), h('span', { class: 'nr-cval' }, eok(a.total))),
      detail(a),
      w ? [h('div', { class: 'nr-crow' }, h('span', { class: 'nr-cname nr-t-nsr' }, '북동 항로'), stack(b, true), h('span', { class: 'nr-cval' }, eok(b.total))), detail(b)]
        : h('div', { class: 'nr-crow' }, h('span', { class: 'nr-cname nr-na' }, '북동 항로'), h('div', { class: 'nr-stack nr-stack-off' }), h('span', { class: 'nr-cval nr-na' }, '—'))]);
  }

  let lastHud = '';
  function renderHud() {
    const rows = [['suez', true], ['nsr', S.warm]];
    const key = `${Math.floor(S.day * 4)}|${S.warm}|${S.knot}|${finished()}|${S.day >= P.nsr.days}`;
    if (key === lastHud) return;
    lastHud = key;
    const shown = Math.min(S.day, endDay());
    append(clear(hud), [
      h('div', { class: 'nr-day' }, h('span', { class: 'nr-day-k' }, '출발 후'), h('b', { class: 'nr-day-v' }, String(Math.floor(shown))), h('span', { class: 'nr-day-u' }, '일째')),
      rows.map(([id, on]) => {
        const r = ROUTES[id], p = P[id];
        const d = on ? p.distAt(S.day) : 0;
        const done = on && S.day >= p.days;
        let st;
        if (!on) st = '해빙에 막혀 출발 못 함';
        else if (done) st = `도착 · ${Math.round(p.days)}일 걸림`;
        else if (S.day === 0) st = `출발 대기 · 약 ${Math.round(p.days)}일 예상`;
        else {
          const inIce = id === 'nsr' && d > r.iceFrom && d < r.iceTo;
          st = `남은 거리 ${fmt(r.km - d)}km${inIce ? ' · 얼음 구간' : ''}`;
        }
        return h('div', { class: on ? 'nr-run' : 'nr-run nr-off' },
          h('div', { class: 'nr-run-t' }, h('i', { class: `nr-dot nr-d-${on ? id : 'off'}` }), r.name, h('small', { class: 'nr-run-s' }, st)),
          bar(d, r.km, on ? r.color : '#c4c7cc', done ? 'nr-bar-done' : ''));
      })]);

    // 결과 알림
    const doneS = S.day >= P.suez.days, doneN = S.warm && S.day >= P.nsr.days;
    if (S.warm && (doneS || doneN)) {
      banner.hidden = false;
      clear(banner).append(doneS && doneN
        ? h('span', {}, h('b', { class: 'nr-b' }, '북동 항로 배'), `가 기존 항로 배보다 약 ${Math.round(P.suez.days - P.nsr.days)}일 먼저 도착했다.`)
        : h('span', {}, h('b', { class: 'nr-b' }, '북동 항로 배'), `가 먼저 도착했다! 기존 항로 배는 아직 ${fmt(ROUTES.suez.km - P.suez.distAt(S.day))}km 남았다.`));
    } else if (!S.warm && doneS) {
      banner.hidden = false;
      clear(banner).append(h('span', {}, h('b', { class: 'nr-b' }, '기존 항로 배'), `가 약 ${Math.round(P.suez.days)}일 만에 로테르담에 도착했다. 지구 온난화 후로 바꾸어 북동 항로와 비교해 보자.`));
    } else banner.hidden = true;
  }

  // ---------- 반복 ----------
  let raf = 0, prev = 0, running = false;
  function frame(now) {
    const dt = Math.min(0.05, (now - prev) / 1000 || 0);
    prev = now;
    if (S.playing) {
      S.day += dt * DAYS_PER_SEC;
      if (finished()) { S.day = endDay(); S.playing = false; syncUI(); }
    }
    const dist = { suez: P.suez.distAt(S.day), nsr: S.warm ? P.nsr.distAt(S.day) : 0 };
    globe.draw({
      warm: S.warm, dist,
      done: { suez: S.day >= P.suez.days, nsr: S.day >= P.nsr.days },
      days: { suez: P.suez.days, nsr: P.nsr.days },
    });
    renderHud();
    if (S.playing || globe.animating()) raf = requestAnimationFrame(frame);
    else running = false;
  }
  function kick() {
    if (running) return;
    running = true; prev = performance.now();
    raf = requestAnimationFrame(frame);
  }
  // 끌어서 돌리는 동안에도 다시 그린다
  mapBox.addEventListener('pointerdown', () => { hint.classList.add('nr-hide'); kick(); });
  mapBox.addEventListener('pointermove', () => { if (globe.animating()) kick(); });

  recompute();
  // 확인용 초기 상태 { warm, day, knot }
  const q = opts.debug || {};
  if (q.warm != null) S.warm = !!q.warm;
  if (q.knot != null) { S.knot = +q.knot; knotIn.value = S.knot; recompute(); }
  if (q.day != null) S.day = +q.day;
  syncUI(); renderPanel(); kick();

  return { destroy: () => cancelAnimationFrame(raf) };
}
