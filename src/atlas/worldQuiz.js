// © 2026 김용현
// src/atlas/worldQuiz.js — Ⅰ 세계화 U1-3e 대륙·대양 이름 맞히기(교사 Q6 A — 보기 4개) + 대륙 나라 목록(Q8 A — 사이드바).
//   installWorldExtras() 가 installWorldQuiz(continentsLayer) 로 registerLayerType('continentQuiz') 를 건다(부르지 않는 u2~u6 조각에는 코드가 없음).
//   topics.json 레이어 항목 {ref: 'p10-continents', type: 'continentQuiz'} = 대륙·대양 면 레이어(worldExtra.continentsLayer — 같은 자료)에 맞히기를 덧붙인 것
//   (type 'continents' 로 두면 맞히기 없이 면만 — 일반도 지구본 단추 3f 가 그 길).
//   자료 properties.tags [{cls, text:'ㅇㅅㅇ 대륙', at:[lon, lat]}](continent_layers.py — 10·11쪽 KCCChassam 12pt 초성 꼬리표 자리),
//   nameIso {나라 이름: iso}(목록 이름 → 바탕 지도 나라, 누르면 그 나라로 fitBounds).
//   - 꼬리표 = 레이어 SVG(<g class="at-wq-tag"> 둥근 상자 + 글자, 교과서 자리). 누르기·Enter·Space → layer.select(cls)(강조 3c) + 무대 왼쪽 위 보기 칸
//     「이 대륙의 이름은?」 보기 4(같은 종류 — 대륙 7 또는 대양 5, uiCore quizOptions·mulberry32). 맞히면 꼬리표 글자가 이름(「대륙」 붙음은 지면 그대로),
//     틀리면 그 보기만 막고 다시 고름(점수는 꼬리표마다 첫 답만 — 맞힌 수 / 푼 수). 「정답 모두 보기」·「다시 하기」. 상태는 메모리만.
//   - 대륙을 고르면(꼬리표·범례·지도에서 나라 누르기) 사이드바 주제 칸 끝에 그 대륙 나라 이름 목록(자료 names — 가나다순), 누르면 그 나라로 날아감.
//     레이어는 사이드바를 받지 못하므로 처음 drawSvg 때 레이어 <g> 에서 무대(.at-stage)를, 무대의 부모(조각 뿌리) 안에서 주제 칸(.at-topic)을 찾는다
//     (EMBED_RULES — 뿌리 안에서만 찾음). 주제 칸이 없으면 무대 보기 칸 아래.
//   - destroy(주제·묶음 바꿈): 고름 풂 → 무대 칸·목록·꼬리표·지도 click 구독을 모두 뗌.
import { geoBounds } from 'd3-geo';
import { h, s, icon } from '../shared/dom.js';
import { registerLayerType } from './layerRef.js';
import { countryLevel } from './countryClass.js';
import { mulberry32, quizOptions } from './uiCore.js';
import './worldQuiz.css';

/** 꼬리표 상자(px): 글자 크기·안쪽 여백·글자 폭 어림(한글 1em, 그 밖 0.6em) */
const TAG = Object.freeze({ font: 12, padX: 7, h: 22 });
const textW = (t) => [...t].reduce((a, c) => a + (/[ㄱ-ㆎ가-힣]/.test(c) ? 1 : c === ' ' ? 0.35 : 0.6), 0) * TAG.font;

/** 요소 위로 올라가며 클래스 c 를 가진 것(가짜 DOM 에도 되도록 closest 없이) */
function upTo(el, c) { for (let x = el; x; x = x.parentNode) if (x.classList?.contains(c)) return x; return null; }
/** 요소 아래에서 클래스 c 를 가진 첫 요소 */
function downTo(el, c) {
  for (const x of el?.children || []) { if (x.classList?.contains(c)) return x; const y = downTo(x, c); if (y) return y; }
  return null;
}

/**
 * 대륙·대양 면 레이어(continentsLayer 결과)에 맞히기를 덧붙여 돌려준다(같은 객체 — drawSvg·labelObstacles·quiz·destroy 를 덧씌움).
 * opts: map(click 구독·fitBounds), countryFeatures(목록 나라로 날아가기), seed(보기 차례 — 기본 Date.now).
 * layer.quiz = { open(cls), answer(label), revealAll(), reset(), score {right, total, solved}, current }.
 */
export function withContinentQuiz(layer, data, { map = null, countryFeatures = null, seed = Date.now() % 1e9 } = {}) {
  const P = data?.properties || {};
  const rand = mulberry32(seed);
  const legend = P.legend || [];
  const oceans = layer.oceans || [];
  const labelOf = new Map([...legend, ...oceans].map((e) => [e.cls, e.label]));
  const isOcean = (c) => oceans.some((o) => o.cls === c);
  const tags = (P.tags || []).filter((t) => labelOf.has(t.cls) && Array.isArray(t.at));
  const nameText = (t) => `${labelOf.get(t.cls)}${/대륙\s*$/.test(t.text) ? ' 대륙' : ''}`;
  const countries = countryFeatures ? countryFeatures[countryLevel(null, countryFeatures)] || [] : [];
  const nameIso = P.nameIso || {};

  const solved = new Set(), tried = new Set(), revealed = { all: false };
  const score = { right: 0, total: 0 };
  let cur = null;          // 지금 묻는 꼬리표
  let answered = false;    // 지금 꼬리표에 첫 답을 했는지
  let opening = false;     // open() 이 select 하는 동안(onSelect 에서 문제를 닫지 않게)

  // ── 무대 보기 칸 ──
  const qText = h('p', { class: 'at-quiz-q' });
  const opts = h('div', { class: 'at-quiz-opts' });
  const feedback = h('p', { class: 'at-quiz-feedback', role: 'status' });
  const scoreOut = h('span', { class: 'at-quiz-score' });
  const toggle = h('button', {
    class: 'ds-btn at-wq-toggle', type: 'button', 'aria-expanded': 'true', 'aria-label': '맞히기 칸 접기', title: '맞히기 칸 접기',
    on: { click: () => collapse(!collapsed) },
  }, icon('chevron'));
  const bodyEl = h('div', { class: 'at-wq-body' },
    qText, opts, feedback,
    h('div', { class: 'at-quiz-foot' }, scoreOut),
    h('div', { class: 'at-wq-actions' },
      h('button', { class: 'ds-btn at-wq-reveal', type: 'button', on: { click: () => revealAll() } }, icon('eye'), '정답 모두 보기'),
      h('button', { class: 'ds-btn at-wq-reset', type: 'button', on: { click: () => reset() } }, icon('reset'), '다시 하기')));
  const panel = h('section', { class: 'at-wq', 'aria-label': '대륙·대양 이름 맞히기' },
    h('div', { class: 'at-wq-head' }, h('h2', { class: 'at-wq-title' }, '대륙·대양 이름 맞히기'), toggle), bodyEl);
  let collapsed = false;
  function collapse(on) {
    collapsed = !!on;
    panel.classList.toggle('is-collapsed', collapsed);
    bodyEl.hidden = collapsed;
    toggle.setAttribute('aria-expanded', String(!collapsed));
    const t = collapsed ? '맞히기 칸 펴기' : '맞히기 칸 접기';
    toggle.setAttribute('aria-label', t); toggle.title = t;
  }

  // ── 사이드바 나라 목록(Q8) ──
  const namesTitle = h('h3', { class: 'ds-h2 at-wq-names-title' }, '대륙별 나라');
  const namesHint = h('p', { class: 'at-card-text at-wq-names-hint' });
  const namesList = h('div', { class: 'at-wq-name-list' });
  const namesBox = h('section', { class: 'at-text at-wq-names', 'aria-label': '대륙별 나라 이름' }, namesTitle, namesHint, namesList);

  // ── 꼬리표(SVG) ──
  let g = null, els = new Map(), boxes = [];
  let mounted = false, dead = false;
  function mount(group) {
    if (mounted) return;
    mounted = true;
    const stage = upTo(group, 'at-stage');
    if (stage) {
      const w = stage.getBoundingClientRect?.().width || 0;
      if (w > 0 && w < 560) collapse(true); // 휴대폰 폭: 접힌 채로 시작(꼬리표를 누르면 폄)
      stage.append(panel);
    }
    const side = stage?.parentNode ? downTo(stage.parentNode, 'at-topic') : null;
    // 주제 칸 끝(활동 블록 아래)에 — buildTopic 은 레이어를 올린 뒤 블록을 붙이므로 그 일이 끝난 다음(마이크로태스크)에
    if (side) queueMicrotask(() => { if (!dead) side.append(namesBox); });
    else bodyEl.append(namesBox);
  }
  function tagEl(t) {
    const rect = s('rect', { class: 'at-wq-tag-box', rx: TAG.h / 2, ry: TAG.h / 2, height: TAG.h, y: -TAG.h / 2 });
    const text = s('text', { class: 'at-wq-tag-text', 'text-anchor': 'middle', 'dominant-baseline': 'central' });
    const el = s('g', {
      class: 'at-wq-tag', 'data-cls': t.cls, role: 'button', tabindex: '0',
      on: {
        click: (e) => { e.stopPropagation?.(); open(t.cls); },
        keydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(t.cls); } },
      },
    }, rect, text);
    return { el, rect, text, t };
  }
  function paintTag(x) {
    const done = solved.has(x.t.cls), show = done || revealed.all;
    const label = show ? nameText(x.t) : x.t.text;
    x.text.textContent = label;
    const w = Math.ceil(textW(label) + TAG.padX * 2);
    x.w = w;
    x.rect.setAttribute('width', w); x.rect.setAttribute('x', -w / 2);
    x.el.classList.toggle('is-solved', done);
    x.el.classList.toggle('is-revealed', !done && revealed.all);
    x.el.classList.toggle('is-current', cur === x.t.cls);
    x.el.setAttribute('aria-label', `대륙·대양 이름 맞히기: ${label}${done ? '(맞힘)' : ''}`);
  }
  const paintAll = () => { for (const x of els.values()) paintTag(x); };

  // ── 문제 ──
  const kind = (c) => (isOcean(c) ? '대양' : '대륙');
  function idle(msg = '지도의 초성 꼬리표를 눌러 대륙과 대양의 이름을 골라 보자.') {
    cur = null; answered = false;
    qText.textContent = msg; opts.replaceChildren(); feedback.textContent = '';
    paintAll();
  }
  function updateScore() {
    scoreOut.textContent = `맞힌 수 ${score.right} / 푼 수 ${score.total} · 꼬리표 ${tags.length}`;
  }
  function open(cls) {
    const t = tags.find((x) => x.cls === cls);
    if (!t) return;
    if (collapsed) collapse(false);
    opening = true;
    try { layer.select(cls); } finally { opening = false; }
    cur = cls; answered = tried.has(cls);
    feedback.textContent = '';
    if (solved.has(cls) || revealed.all) {
      qText.textContent = `${nameText(t)}${solved.has(cls) ? ' — 맞혔어요.' : ''}`;
      opts.replaceChildren();
    } else {
      qText.textContent = `이 ${kind(cls)}의 이름은? (${t.text})`;
      const pool = (isOcean(cls) ? oceans : legend).map((e) => e.label);
      const choices = quizOptions(labelOf.get(cls), pool, { n: 4, rand });
      opts.replaceChildren(...choices.map((c) => h('button', {
        class: 'ds-btn at-quiz-opt', type: 'button', 'data-v': c, on: { click: (e) => answer(c, e.currentTarget) },
      }, c)));
    }
    paintAll();
  }
  function answer(c, btn = [...opts.children].find((b) => b.getAttribute('data-v') === c)) {
    if (!cur || solved.has(cur) || revealed.all || !btn || btn.disabled) return;
    const ok = c === labelOf.get(cur);
    if (!answered) { answered = true; tried.add(cur); score.total++; if (ok) score.right++; }
    if (ok) {
      solved.add(cur);
      for (const b of opts.children) { b.disabled = true; if (b === btn) b.classList.add('is-right'); }
      const t = tags.find((x) => x.cls === cur);
      feedback.textContent = `정답! ${nameText(t)}`;
    } else {
      btn.disabled = true; btn.classList.add('is-wrong');
      feedback.textContent = '아쉽다. 다른 보기를 다시 골라 보자.';
    }
    updateScore();
    paintAll();
  }
  function revealAll() {
    revealed.all = true;
    idle('모든 꼬리표에 정답을 보였어요. 「다시 하기」로 처음부터 풀 수 있어요.');
  }
  function reset() {
    solved.clear(); tried.clear(); revealed.all = false; score.right = 0; score.total = 0;
    layer.select(null);
    updateScore();
    idle();
  }

  // ── 나라 목록 ──
  function fly(name) {
    const f = countries.find((c) => c.properties?.iso === nameIso[name]);
    if (!f || !map?.fitBounds) return;
    const [[w, s0], [e, n]] = geoBounds(f), pad = 4;
    map.fitBounds([w - pad, Math.max(-80, s0 - pad), (e < w ? e + 360 : e) + pad, Math.min(84, n + pad)], { ms: 600 });
  }
  function showNames(cls) {
    const list = cls && !isOcean(cls) ? (layer.names?.[cls] || []) : [];
    namesTitle.textContent = cls && !isOcean(cls) ? `${labelOf.get(cls)}의 나라 ${list.length}` : '대륙별 나라';
    namesHint.textContent = !cls ? '대륙을 고르면(꼬리표·범례·지도의 나라 누르기) 그 대륙에 있는 나라 이름이 여기에 보입니다.'
      : isOcean(cls) ? `${labelOf.get(cls)}은 대양이에요. 대륙을 고르면 나라 이름이 보입니다.`
        : list.length ? '이름을 누르면 지도가 그 나라로 옮겨 갑니다.' : '교과서 지도에 쓰인 나라 이름이 없습니다.';
    namesList.replaceChildren(...list.map((nm) => h('button', {
      class: 'ds-btn at-wq-name', type: 'button', title: `지도: ${nm}`, on: { click: () => fly(nm) },
    }, nm)));
  }

  const offSel = layer.onSelect((v) => {
    showNames(v);
    if (!opening && cur && v !== cur) idle(); // 범례·지도로 다른 것을 고르면 보던 문제는 닫음
  });
  // 지도에서 나라를 누르면 그 대륙(이 레이어가 맞힌 나라 — cls 가 대륙일 때만)
  const offClick = map?.on ? map.on('click', (e) => {
    const c = e?.layerId === layer.id ? e.feature?.properties?.cls : null;
    if (c && legend.some((x) => x.cls === c) && layer.selected !== c) layer.select(c);
  }) : () => {};

  updateScore(); idle(); showNames(layer.selected);

  const baseObstacles = layer.labelObstacles;
  const baseDestroy = layer.destroy;
  Object.assign(layer, {
    drawSvg(group, project) {
      if (g !== group) {
        g = group; els = new Map();
        for (const t of tags) els.set(t.cls, tagEl(t));
        group.replaceChildren(...[...els.values()].map((x) => x.el));
        paintAll();
        mount(group);
      }
      boxes = [];
      for (const x of els.values()) {
        const p = project(x.t.at);
        if (!p || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) { x.el.setAttribute('display', 'none'); continue; }
        x.el.removeAttribute('display');
        x.el.setAttribute('transform', `translate(${p[0].toFixed(1)},${p[1].toFixed(1)})`);
        boxes.push([p[0] - x.w / 2, p[1] - TAG.h / 2, p[0] + x.w / 2, p[1] + TAG.h / 2]);
      }
    },
    labelObstacles: () => [...(baseObstacles?.() || []), ...boxes.map((b) => [...b])],
    quiz: {
      open, answer: (label) => answer(label), revealAll, reset,
      get score() { return { ...score, solved: solved.size }; },
      get current() { return cur; },
    },
    destroy() {
      dead = true;
      try { layer.select(null); } catch { /* 이미 풀린 레이어 */ }
      offSel(); offClick();
      panel.remove(); namesBox.remove();
      g?.replaceChildren(); g = null; els = new Map(); boxes = [];
      baseDestroy();
    },
  });
  return layer;
}

/** 등록(installWorldExtras 가 부름): 'continentQuiz' = 대륙·대양 면 레이어 + 맞히기 */
export function installWorldQuiz(makeContinents) {
  registerLayerType('continentQuiz', (id, d, ctx) => withContinentQuiz(makeContinents(id, d, ctx), d, ctx));
}
