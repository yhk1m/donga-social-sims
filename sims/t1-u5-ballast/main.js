// © 2026 김용현
// 선박 평형수와 외래 생물종 — 3D 선박 단면 + 세계 항로 지도
// 규칙(EMBED_RULES.md): DOM 은 h()/createElement 로만, 탐색은 root 안에서만.
import { createShell, addBlock } from '../../src/shared/shell.js';
import { h, s, icon, clear } from '../../src/shared/dom.js';
import './style.css';
import { CASES, STEPS } from './data.js';
import { createShipScene } from './ship3d.js';
import { createWorldMap } from './worldmap.js';

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const smooth = (a, b, v) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const DUR = [7, 6.5, 7, 6.5]; // 단계별 재생 시간(초)

const NATIVE = '#2a9d6f', DEAD = '#8b8e92', WATER = '#5d9fd6';

// dom.js 에 없는 선 아이콘
const qIcon = () => s('svg', { class: 'ds-icon', viewBox: '0 0 24 24', 'aria-hidden': 'true' },
  s('circle', { cx: 12, cy: 12, r: 10 }), s('path', { d: 'M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3' }), s('line', { x1: 12, y1: 17, x2: 12.01, y2: 17 }));

export default function mount(root, opts = {}) {
  const { stage, panel } = createShell(root, 't1-u5-ballast');
  const S = { ci: 0, step: 1, p: 0, playing: true, treat: false, noBallast: false, invasion: 0, frozen: false };

  // ---------- 무대: 3D(위) + 지도(아래) ----------
  const labels = h('div', { class: 'bw-labels' });
  const cap = h('div', { class: 'bw-cap', 'aria-live': 'polite' });
  const legend = h('ul', { class: 'bw-legend' });
  const viewReset = h('button', { class: 'ds-btn bw-mini bw-view-reset', type: 'button', title: '시점 처음으로' }, icon('reset'), '시점');
  const v3d = h('section', { class: 'bw-v3d', 'aria-label': '선박 단면 3D 모형' }, labels, cap, legend, viewReset);
  const mapCap = h('div', { class: 'bw-map-cap' });
  const vmap = h('section', { class: 'bw-vmap', 'aria-label': '세계 항로 지도' }, mapCap);
  stage.append(h('div', { class: 'bw-views' }, v3d, vmap));

  const ship = createShipScene(v3d, labels, { expose: opts.expose });
  const map = createWorldMap(vmap);

  // ---------- 사이드바 ----------
  const caseBtns = CASES.map((c, i) => h('button', { class: 'ds-seg-btn bw-seg-sm', type: 'button', on: { click: () => { setCase(i); restart(); } } }, c.tab));
  addBlock(panel, h('div', { class: 'ds-ctl' },
    h('h2', { class: 'ds-h2' }, '사례 고르기'),
    h('div', { class: 'ds-seg', role: 'group', 'aria-label': '외래 생물종 사례' }, caseBtns)));

  const stepBars = [];
  const stepBtns = STEPS.map((st) => {
    const bar = h('span', { class: 'bw-bar' });
    stepBars.push(bar);
    return h('button', { class: 'bw-step', type: 'button', on: { click: () => { S.noBallast = false; S.step = st.n; S.p = 0; syncUI(); } } },
      h('span', { class: 'bw-num' }, String(st.n)),
      h('span', { class: 'bw-tt' }, st.title),
      h('span', { class: 'bw-ss' }, `${st.sub} · ${st.state}`),
      bar);
  });
  const playBtn = h('button', { class: 'ds-btn ds-primary', type: 'button', on: { click: () => {
    if (S.noBallast) { S.noBallast = false; S.p = 0; }
    if (!S.playing && S.p >= 1) { S.step = (S.step % 4) + 1; S.p = 0; }
    S.playing = !S.playing;
    syncUI();
  } } });
  const resetBtn = h('button', { class: 'ds-btn', type: 'button', on: { click: () => restart() } }, icon('reset'), '처음부터');
  addBlock(panel, h('div', { class: 'ds-ctl' },
    h('h2', { class: 'ds-h2' }, '평형수가 오가는 과정'),
    h('div', { class: 'bw-steps' }, stepBtns),
    h('div', { class: 'ds-row' }, playBtn, resetBtn)));

  const treatBtn = h('button', { class: 'bw-switch', type: 'button', role: 'switch', 'aria-checked': 'false', on: { click: () => {
    S.treat = !S.treat;
    restart(); // 켜고 끌 때마다 같은 항해를 처음부터 비교
  } } },
  h('span', { class: 'bw-knob', 'aria-hidden': 'true' }),
  h('span', { class: 'bw-sw-text' }, h('b', { class: 'bw-b' }, '평형수 처리 장치'), h('small', { class: 'bw-small' }, '2024년 선박 평형수 관리 협약')));
  const nbBtn = h('button', { class: 'ds-btn bw-ghost-q', type: 'button', 'aria-pressed': 'false', on: { click: () => {
    S.noBallast = !S.noBallast;
    if (S.noBallast) { S.step = 2; S.p = 0.5; S.playing = false; }
    syncUI();
  } } }, qIcon(), '평형수가 없다면?');
  addBlock(panel, h('div', { class: 'ds-ctl' }, treatBtn, nbBtn));

  const stats = addBlock(panel, h('dl', { class: 'bw-meters' }));
  const flow = addBlock(panel, h('div', { class: 'bw-flow' }));
  const caseCard = addBlock(panel, h('article', { class: 'bw-case' }));

  addBlock(panel, h('p', { class: 'ds-note bw-note' },
    '배의 무게 중심을 유지하기 위해 채우는 물이 ', h('b', { class: 'bw-b' }, '선박 평형수'),
    '이다. 보통 출발하는 항구에서 채우고 도착하는 항구에서 배출하는데, 그 과정에서 매년 약 7,000종에 달하는 해양 생물이 국경을 넘는 ‘국제적인 이사’를 하게 된다. ',
    '2024년부터 모든 선박들은 ‘선박 평형수 관리 협약’에 의해 평형수를 버리기 전에 필수적으로 해양 생물을 전부 제거해야 한다.',
    h('span', { class: 'bw-cite' }, '— 교과서 138쪽 지식+ 「외래 생물종의 유입 과정」')));
  addBlock(panel, h('p', { class: 'ds-note bw-note-sm' },
    h('b', { class: 'bw-b' }, '참고 '),
    '선박 평형수 관리 협약은 국제해사기구(IMO)가 2004년 채택해 2017년 발효했고, 2024년 9월부터 모든 해당 선박에 평형수 처리 기준이 적용되었다. ',
    '얼룩말홍합: 미국 지질조사국(USGS) NAS 자료. 빗해파리: GESAMP 보고서 58호(1997), Shiganova(1998). ',
    '지도의 항로는 실제 항해 기록이 아닌 설명용 예시 경로이며, 3D 모형의 크기·수위·생물 수는 비율을 맞추지 않은 모식이다. ',
    '지도 자료: Natural Earth 1:110m (퍼블릭 도메인).'));

  viewReset.addEventListener('click', () => ship.resetView());

  function restart() {
    S.step = 1; S.p = 0; S.invasion = 0; S.noBallast = false; S.playing = true;
    syncUI();
  }

  function setCase(i, instant = false) {
    S.ci = i;
    const c = CASES[i];
    ship.setCase(c);
    map.setCase(c, instant);
    clear(caseCard).append(
      h('h3', { class: 'bw-h3' }, h('i', { class: 'bw-dot', style: { background: c.color } }), c.name),
      h('span', { class: 'bw-sci' }, c.sci),
      h('p', { class: 'bw-alias' }, c.alias),
      h('dl', { class: 'bw-facts' }, c.facts.map(([k, v]) => [h('dt', { class: 'bw-dt' }, k), h('dd', { class: 'bw-dd' }, v)])),
      h('p', { class: 'bw-story' }, c.story),
      h('span', { class: 'bw-srcline' }, `출처: ${c.source}`));
    const li = (col, text, sq) => h('li', { class: 'bw-li' }, h('i', { class: sq ? 'bw-dot bw-sq' : 'bw-dot', style: { background: col } }), text);
    clear(legend).append(
      li(c.color, `${c.tab} 등 실려 온 생물`), li(NATIVE, '도착항 토착 생물'), li(DEAD, '죽거나 걸러진 생물'), li(WATER, '평형수', true));
    syncUI();
  }

  function captionText() {
    const c = CASES[S.ci];
    if (S.noBallast) {
      return {
        alert: true, n: '?', t: '평형수가 없다면?', where: '화물을 모두 내린 빈 배',
        d: '빈 배가 물 위로 높이 떠올라 무게 중심이 불안정해지고 파도에 크게 흔들린다. 프로펠러가 물 밖으로 드러나 제대로 나아가기도 어렵다. 그래서 화물을 내린 만큼 바닷물을 채운다.',
      };
    }
    const st = STEPS[S.step - 1];
    const where = [`${c.fromPort} (${c.fromSea})`, `${c.fromPort} → ${c.toPort}`, `${c.toPort} (${c.toSea})`, `${c.toPort} → ${c.fromPort} (돌아가는 길)`][S.step - 1];
    const d = [
      `화물을 내려 가벼워진 만큼 바닷물을 평형수 탱크에 채운다. 이때 ${c.fromSea}의 해양 생물과 박테리아도 함께 빨려 들어온다.`,
      '탱크에 가득 찬 평형수가 배의 무게 중심을 잡아 준다. 탱크 속 생물은 배와 함께 먼 바다를 건넌다.',
      S.treat
        ? '화물을 실으면서 평형수를 버린다. 처리 장치가 버리기 전에 해양 생물을 걸러 내고 죽여서, 살아 있는 생물이 바다로 나가지 않는다.'
        : `화물을 실으면서 평형수를 버린다. 실려 온 ${c.tab}이(가) 낯선 바다에 풀려나 불어나고, 토착 생물은 먹이와 자리를 빼앗겨 죽어 간다.`,
      S.treat
        ? '화물이 무게 중심을 잡아 주므로 평형수가 필요 없다. 도착항 바다에는 외래 생물종이 들어오지 않았다.'
        : `화물이 무게 중심을 잡아 주므로 평형수가 필요 없다. 배는 떠났지만 ${c.toSea}에서는 ${c.tab}이(가) 계속 퍼진다.`,
    ][S.step - 1];
    return { n: String(S.step), t: `${st.title} — ${st.sub}`, where, d };
  }

  let lastCap = '', lastFlow = '';
  function syncUI() {
    caseBtns.forEach((b, i) => b.setAttribute('aria-pressed', String(i === S.ci)));
    stepBtns.forEach((b, i) => {
      if (i + 1 === S.step && !S.noBallast) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current');
    });
    clear(playBtn).append(icon(S.playing ? 'pause' : 'play'), S.playing ? '멈춤' : '자동 재생');
    treatBtn.setAttribute('aria-checked', String(S.treat));
    nbBtn.setAttribute('aria-pressed', String(S.noBallast));

    const cp = captionText();
    const key = JSON.stringify(cp);
    if (key !== lastCap) {
      lastCap = key;
      clear(cap).append(
        h('div', { class: 'bw-cap-t' }, h('span', { class: cp.alert ? 'bw-cap-num bw-alert' : 'bw-cap-num' }, cp.n), cp.t),
        h('div', { class: 'bw-where' }, cp.where),
        h('p', { class: 'bw-cap-d' }, cp.d));
    }
    const c = CASES[S.ci];
    clear(mapCap).append('세계 항로', h('small', { class: 'bw-map-sub' }, `${c.fromPort} → ${c.toPort} · 예시 경로`));

    const on = S.noBallast ? 0 : S.step <= 2 ? S.step - 1 : 2;
    const fk = `${on}|${S.treat}`;
    if (fk !== lastFlow) {
      lastFlow = fk;
      clear(flow).append(...[
        ['선박', ['대형화·고속화', '1일 교역량 증가']],
        ['평형수', ['연간 100억 톤 이동', '3천여 종 이상의 해양 생물 및 박테리아 이동']],
        ['환경 오염', ['해당 수역 생태계 교란 및 파괴', '박테리아에 의한 토속종 폐사']],
      ].map(([t, items], i) => {
        const blocked = i === 2 && S.treat;
        const cls = ['bw-f', i === on ? 'bw-on' : '', blocked ? 'bw-blocked' : ''].filter(Boolean).join(' ');
        return h('div', { class: cls },
          h('b', { class: 'bw-f-t' }, blocked ? `${t} — 처리 장치로 차단` : t),
          h('ul', { class: 'bw-ul' }, items.map((x) => h('li', { class: 'bw-f-li' }, x))));
      }));
    }
  }

  // ---------- 단계별 값 ----------
  function derive() {
    const { step, p } = S;
    let cargo, ballast;
    if (step === 1) { ballast = clamp01((p - 0.05) / 0.8); cargo = 1 - clamp01((p - 0.02) / 0.8); }
    else if (step === 2) { ballast = 1; cargo = 0; }
    else if (step === 3) { ballast = 1 - clamp01((p - 0.05) / 0.8); cargo = clamp01((p - 0.1) / 0.8); }
    else { ballast = 0; cargo = 1; }
    if (S.noBallast) ballast = 0;
    const sailing = step === 2 || step === 4;
    let portX = 0;
    if (sailing) portX = p < 0.5 ? -smooth(0, 0.3, p) * 50 : (1 - smooth(0.7, 1, p)) * 50;
    if (S.noBallast) portX = 50;
    let seaKind = step === 1 ? 'origin' : step === 3 ? 'arrive' : 'ocean';
    if (sailing && !S.noBallast) {
      const [a, b] = step === 2 ? ['origin', 'arrive'] : ['arrive', 'origin'];
      seaKind = p < 0.3 ? a : p > 0.7 ? b : 'ocean';
    }
    const seaFade = step === 1 ? smooth(0, 0.06, p) : step === 4 ? 1 - smooth(0, 0.22, p) : 1;
    const t = step === 1 ? 0 : step === 2 ? smooth(0.15, 0.85, p) : step === 3 ? 1 : 1 - smooth(0.15, 0.85, p);
    return { step, p, cargo, ballast, treat: S.treat, sailing, portX, seaKind, seaFade, noBallast: S.noBallast, t };
  }

  const meterRow = (k, v, txt, cls = '') => [
    h('dt', { class: 'bw-mdt' }, k),
    h('dd', { class: 'bw-mbar' }, h('div', { class: 'bw-m' }, h('span', { class: 'bw-mfill', style: { width: `${Math.round(v * 100)}%` } }))),
    h('dd', { class: `bw-mval ${cls}` }, txt)];
  let lastStats = '';
  function renderStats(v, r) {
    const sway = r.stable > 0.6 ? ['안정', 'bw-ok'] : r.stable > 0.3 ? ['조금 흔들림', ''] : ['크게 흔들림', 'bw-bad'];
    const inv = S.invasion <= 0.001 ? ['없음', 'bw-ok'] : S.invasion < 0.35 ? ['정착 시작', 'bw-bad'] : ['확산 중', 'bw-bad'];
    const dOk = r.draft >= 0.8;
    const rows = [
      ['화물', v.cargo, `${Math.round(v.cargo * 100)}%`, ''],
      ['평형수', v.ballast, `${Math.round(v.ballast * 100)}%`, ''],
      ['잠긴 깊이', clamp01((r.draft - 0.35) / 0.95), dOk ? '알맞음' : '얕음', dOk ? 'bw-ok' : 'bw-bad'],
      ['배의 흔들림', null, sway[0], sway[1]],
      ['도착항 외래종', S.invasion, inv[0], inv[1]],
    ];
    const key = rows.map((x) => `${x[0]}${x[1] == null ? '' : Math.round(x[1] * 100)}${x[2]}`).join('|');
    if (key === lastStats) return;
    lastStats = key;
    clear(stats).append(...rows.flatMap(([k, val, txt, cls]) => val == null
      ? [h('dt', { class: 'bw-mdt' }, k), h('dd', { class: 'bw-mbar' }), h('dd', { class: `bw-mval ${cls}` }, txt)]
      : meterRow(k, val, txt, cls)));
  }

  // ---------- 반복 ----------
  let prev = performance.now(), time = 0, raf = 0;
  function tick(now) {
    const dt = Math.min(0.05, (now - prev) / 1000);
    prev = now;
    time += dt;
    if (S.frozen) { /* 확인용 고정 */ }
    else if (!S.noBallast && S.p < 1) S.p = Math.min(1, S.p + dt / DUR[S.step - 1]);
    else if (!S.noBallast && S.playing) { S.step = (S.step % 4) + 1; S.p = 0; syncUI(); }

    // 외래종: 처리되지 않은 평형수를 버릴 때 정착하고, 그 뒤로 스스로 퍼진다
    if (!S.noBallast && !S.frozen) {
      if (S.step === 3 && !S.treat && S.p > 0.35) S.invasion += dt * 0.06;
      else if (S.invasion > 0) S.invasion += dt * (S.step === 4 ? 0.07 : 0.015);
      S.invasion = Math.min(1, S.invasion);
    }

    const v = derive();
    const r = ship.update(v, dt);
    map.draw({ t: v.t, sailing: v.sailing && !S.noBallast, invasion: S.invasion, treat: S.treat, step: S.step, time, ballast: v.ballast }, dt);
    stepBars.forEach((b, i) => { b.style.width = i + 1 === S.step && !S.noBallast ? `${S.p * 100}%` : '0'; });
    renderStats(v, r);
    raf = requestAnimationFrame(tick);
  }

  setCase(0, true);

  // 확인용 초기 상태: { case, step, p, treat, inv, pause, freeze, nb }
  const q = opts.debug || {};
  if (q.case != null) setCase(+q.case, true);
  if (q.treat != null) S.treat = !!q.treat;
  if (q.step != null) S.step = +q.step;
  if (q.p != null) S.p = +q.p;
  if (q.inv != null) S.invasion = +q.inv;
  if (q.pause) S.playing = false;
  if (q.freeze) S.frozen = true;
  if (q.nb) { S.noBallast = true; S.step = 2; S.p = 0.5; S.playing = false; }
  syncUI();
  raf = requestAnimationFrame(tick);

  return { destroy: () => cancelAnimationFrame(raf) };
}
