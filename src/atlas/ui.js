// © 2026 김용현
// src/atlas/ui.js — 아틀라스 화면 부품(사이드바·무대 위). 모두 h()/s() 로 만들고(innerHTML 없음) { el, update?, destroy() } 를 돌려준다.
// 주제를 바꿀 때 destroy() 하고 다시 만들면 된다 — 지도·범례 구독, 무대 키 입력 등 붙인 것은 destroy 가 모두 푼다.
//
//   topicNav(panel, topics, onSelect, { current })  목차(세로 목록, 지금 주제 강조, 쪽 표시) — update(id)
//   mapTools(stage, map, { relief, tint })           무대 오른쪽 위 도구(도법 고르기 상자·대서양/태평양·경위선/지명/음영·바탕 색 없음/고도 색/자연색·확대/축소/전체) + 왼쪽 아래 축척 막대,
//                                                    무대 키보드(무대에 초점이 있을 때만: +/− 확대·축소, 방향키 이동, 0 전체) — update()
//   legendBlock(panel, legend, items, opts)          범례(색 견본 + 이름, 누르면 legend.toggle) + 제목·출처·위치 근사·이미지 실패 알림
//   legendPanel(stage)                               무대 오른쪽 아래 떠 있는 범례 칸(머리 「범례」·접기 단추·머리 끌어 옮기기·두 번 누르면 제자리) — body 에 범례를 담음
//   tintLegendBlock(panel, { map })                  고도 색 범례(교과서 16쪽 상자). map 을 주면 단계를 눌러 그 단계만 색칠(여러 개, 렌더러 옵션 tintSelection)
//   detailCard(panel, { onExpand })                  .show({ title, photo, text, chart | charts, credit, approx }) / .hide()
//   pageViewer(stage)                                「원본 쪽 보기」 겹침 창(absolute, z 20): .show({ url, title, bbox } | { title, node }) / .hide()
//   tooltip(stage, { map })                          포인터 자리 이름 말풍선(map 을 주면 hover 를 구독)
//   creditBlock(panel)                               출처 줄(바탕 지도: Natural Earth + 주제 레이어 출처) — update(credits), setNatural(on)(자연색 출처 줄)
// 사진·원본 쪽은 공개 Pages 의 절대 주소 <img src> 로만 연결한다(ASSET_BASE). 개발 서버에서는 아직 공개 전이라 저장소 파일로 바꿔 쓴다.
import { h, s, icon, append } from '../shared/dom.js';
import { addBlock } from '../shared/shell.js';
import { PROJECTIONS } from './projections.js';
import { renderChart } from './charts.js';
import { segButtons } from './seg.js';
import { tintLegend } from './tint.js';
import { nestedCircles, valueIconPath } from './layerStyle.js';
import { BASE_MODES, baseModeOf, baseOptions, NATURAL_CREDIT } from './natural.js';
import { scaleBarSpec, hoverLabel, pageCrop, pagesLabel, assetUrl, panTarget, ASSET_BASE } from './uiCore.js';
import './ui.css';

export { ASSET_BASE };

const PAGES = 'https://yhk1m.github.io/donga-social-sims/assets/';
/** 이미지 주소: 경로면 ASSET_BASE 아래 절대 주소, 개발 서버(vite)에서는 공개 전 파일을 저장소에서(조각 빌드에서는 DEV 가 false 로 접혀 없어짐) */
export function imageUrl(pathOrUrl) {
  const u = assetUrl(pathOrUrl);
  if (u && import.meta.env?.DEV && u.startsWith(PAGES)) return `/docs/assets/${u.slice(PAGES.length)}`;
  return u;
}

/** 사진 <img>: 늦게 불러오고(lazy), 실패하면 감싼 요소째 숨긴다. */
function photoEl(photo, alt) {
  const url = imageUrl(typeof photo === 'string' ? photo : photo?.url);
  if (!url) return null;
  const fig = h('figure', { class: `at-photo${photo?.mask === 'circle' ? ' at-photo-circle' : ''}` });
  const img = h('img', {
    class: 'at-photo-img', src: url, loading: 'lazy', alt: alt || '',
    width: photo?.width || null, height: photo?.height || null,
    on: { error: () => { fig.hidden = true; } },
  });
  fig.append(img);
  if (photo?.credit) fig.append(h('figcaption', { class: 'at-photo-credit' }, photo.credit));
  return fig;
}

// ---------- 목차 ----------
export function topicNav(panel, topics, onSelect, { current = null } = {}) {
  const btns = new Map();
  const list = h('ol', { class: 'at-toc-list' }, topics.map((t) => {
    const b = h('button', {
      class: 'at-toc-btn', type: 'button',
      on: { click: () => onSelect?.(t.id, t) },
    }, h('span', { class: 'at-toc-title' }, t.title), h('span', { class: 'at-toc-page' }, pagesLabel(t.pages)));
    btns.set(t.id, b);
    return h('li', { class: 'at-toc-item' }, b);
  }));
  const el = h('nav', { class: 'at-toc', 'aria-label': '주제 목차' }, h('h2', { class: 'ds-h2' }, '목차'), list);
  if (panel) addBlock(panel, el);
  function update(id) {
    for (const [k, b] of btns) {
      const on = k === id;
      b.classList.toggle('is-current', on);
      if (on) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current');
    }
  }
  update(current);
  return { el, update, destroy() { el.remove(); btns.clear(); } };
}

// ---------- 지도 도구 ----------
/** 지도 도구 고르기 단추(중심 경도) — seg.js segButtons, 지금 값은 update() 가 view 로 맞춘다 */
const seg = (items, label, onPick) => segButtons(items, { label, onPick, className: 'at-tools-seg', btnClass: 'at-tools-seg-btn' });

const PROJ_SHORT = { miller: '밀러', mercator: '메르카토르', robinson: '로빈슨', goode: '구드', equalEarth: '이퀄어스' };

export function mapTools(stage, map, { relief = true, tint = true } = {}) {
  // 도법: 고르기 상자(<select> — 교사 요청 2026-10-21, 단추 5개 대신). 키보드는 브라우저 기본, 바꾸면 setProjection, 지금 값은 update() 가 view 로 맞춘다
  const projSel = h('select', { class: 'at-tools-select', 'aria-label': '도법', on: { change: (e) => { map.setProjection(e.target.value); update(); } } },
    Object.keys(PROJECTIONS).map((k) => h('option', { value: k }, PROJ_SHORT[k] || PROJECTIONS[k].label)));
  const center = seg([[0, '대서양', '대서양 중심(경도 0°)'], [150, '태평양', '태평양 중심(경도 150°)']], '중심 경도', (c) => { map.setCenterLon(c); update(); });
  const opts = { graticule: true, labels: true, relief };
  // 바탕 색(없음·고도 색·자연색) 한 묶음 — 렌더러 옵션 tint·natural 두 개를 함께 바꾼다
  const base = tint ? segButtons(BASE_MODES, { label: '바탕 색', className: 'at-tools-seg at-tools-base', btnClass: 'at-tools-seg-btn', current: baseModeOf(map.options),
    onPick: (m) => { baseNote.hidden = true; map.setOptions(baseOptions(m)); base.set(baseModeOf(map.options)); } }) : null;
  // 바탕 화상 알림 한 줄(범례 이미지 실패 알림과 같은 꼴 — role status): 자연색 화상을 못 불러와 앞 바탕으로 돌아갔을 때
  const baseNote = h('p', { class: 'at-legend-fail at-tools-note', role: 'status' }, '자연색 화상을 불러오지 못해 앞의 바탕으로 돌아갔습니다.');
  baseNote.hidden = true;
  /** 바탕 단추 상태: 'loading'(단추 바쁨 — aria-busy) | 'failed'(바쁨 풀고 알림) | 'ready'·그 밖(바쁨·알림 풂) */
  function setBaseState(mode, state) {
    const b = base?.btns.find((x) => x.getAttribute('data-v') === mode);
    if (!b) return;
    const busy = state === 'loading';
    if (busy) b.setAttribute('aria-busy', 'true'); else b.removeAttribute('aria-busy');
    b.classList.toggle('is-busy', busy);
    b.title = busy ? '자연색 화상을 불러오는 중…' : BASE_MODES.find((m) => m[0] === mode)?.[2] || b.title;
    baseNote.hidden = state !== 'failed';
  }
  const inputs = {};
  const check = (key, text, title = null) => {
    const input = h('input', { type: 'checkbox', class: 'at-tools-check-input', checked: opts[key], on: { change: (e) => { opts[key] = !!e.target.checked; map.setOptions({ [key]: opts[key] }); } } });
    inputs[key] = input;
    return h('label', { class: 'ds-check at-tools-check', title }, input, text);
  };
  const zoomBy = (f) => { const v = map.view; map.flyTo({ zoom: Math.max(1, Math.min(40, v.k * f)) }, 300); };
  const whole = () => map.flyTo({ center: [map.view.centerLon, 0], zoom: 1 }, 500);
  const btn = (name, text, fn) => h('button', { class: 'ds-btn at-tools-btn', type: 'button', 'aria-label': text, title: text, on: { click: fn } }, icon(name));
  const el = h('div', { class: 'at-tools', role: 'toolbar', 'aria-label': '지도 도구' },
    h('div', { class: 'at-tools-card' },
      h('label', { class: 'at-tools-row' }, h('span', { class: 'at-tools-label' }, '도법'),
        h('span', { class: 'at-tools-select-wrap' }, projSel, icon('chevron'))),
      h('div', { class: 'at-tools-row' }, center.el,
        check('graticule', '경위선'), check('labels', '지명'), relief ? check('relief', '음영') : null),
      base ? h('div', { class: 'at-tools-row' }, h('span', { class: 'at-tools-label' }, '바탕'), base.el) : null,
      base ? baseNote : null),
    h('div', { class: 'at-tools-zoom', role: 'group', 'aria-label': '확대·축소' },
      btn('plus', '확대', () => zoomBy(2)), btn('minus', '축소', () => zoomBy(0.5)), btn('globe', '세계 전체 보기', whole)));
  const barLine = h('div', { class: 'at-scale-bar' });
  const barText = h('span', { class: 'at-scale-text' });
  const scale = h('div', { class: 'at-scale', 'aria-live': 'off', title: '축척(화면 가운데 기준)' }, barLine, barText);
  stage.append(el, scale);

  // 접근성: 무대에 초점을 줄 수 있게, 바탕 캔버스·SVG 에 이름
  const hadTab = stage.getAttribute('tabindex');
  stage.setAttribute('tabindex', '0');
  stage.setAttribute('aria-label', '지도 — 초점이 있을 때 방향키로 이동, + − 로 확대·축소, 0 으로 전체 보기');
  for (const c of stage.children || []) {
    if (c.classList?.contains('at-base')) { c.setAttribute('role', 'img'); c.setAttribute('aria-label', '지도 바탕(바다·육지·국경·지형 음영·주제 면)'); }
    if (c.classList?.contains('at-overlay')) { c.setAttribute('role', 'group'); c.setAttribute('aria-label', '지명·기호·핀'); }
  }
  function onKey(e) {
    if (e.target !== stage || e.altKey || e.ctrlKey || e.metaKey) return; // 무대 자체에 초점이 있을 때만(도구 버튼 등은 제 기능)
    const v = map.view;
    if (e.key === '+' || e.key === '=') zoomBy(2);
    else if (e.key === '-' || e.key === '_') zoomBy(0.5);
    else if (e.key === '0') whole();
    else {
      const xy = panTarget(e.key, v.width, v.height);
      if (!xy) return;
      const c = map.invert(xy);
      if (c) map.flyTo({ center: c, zoom: v.k }, 250);
    }
    e.preventDefault();
  }
  stage.addEventListener('keydown', onKey);

  function update() {
    const v = map.view;
    if (!v) return;
    if (projSel.value !== v.key) projSel.value = v.key;
    center.set(v.centerLon);
    const sp = scaleBarSpec(v.kmPerPx, { maxPx: 110 });
    scale.hidden = !sp;
    if (sp) { barLine.style.width = `${Math.round(sp.px)}px`; barText.textContent = sp.label; }
  }
  const off = map.on('viewchange', update);
  // 주제가 바탕 색을 바꾸면(일반도 = 고도 색, 지형 = 자연색) 단추·체크 상자도 따라간다
  const offOpt = map.on('options', (o) => {
    for (const [k, input] of Object.entries(inputs)) if (k in o && input.checked !== !!o[k]) { input.checked = !!o[k]; opts[k] = !!o[k]; }
    base?.set(baseModeOf(o));
  });
  update();
  return {
    el, scale, update, base, setBaseState,
    destroy() {
      off(); offOpt();
      stage.removeEventListener('keydown', onKey);
      if (hadTab == null) stage.removeAttribute('tabindex'); else stage.setAttribute('tabindex', hadTab);
      stage.removeAttribute('aria-label');
      el.remove(); scale.remove();
    },
  };
}

// ---------- 고도 색 범례(교과서 16쪽 「육지 높이·바다 깊이」 상자) ----------
/**
 * 세로 색띠 + 칸 경계 숫자(m). 위에서부터 빙하 · 5,000 … 0 · 해수면 아래 땅 · 바다 200 … 8,000(교과서 차례).
 * → { el, show(on), destroy() }. map 이 없으면 누를 것 없음(그림과 글).
 * map 을 주면(교사 요청 2026-10-20) 줄마다 단추 — 누르면 그 단계만 색칠(map.setOptions({ tintSelection })), 여러 개 고를 수 있고 다시 누르면 뺌,
 * 「전체 보기」로 모두 풂. aria-pressed 는 지도 옵션(map 'options')을 따라간다. destroy 는 고름을 풀고(주제를 바꾸면 처음처럼) 구독을 푼다.
 */
export function tintLegendBlock(panel, { title = '높이와 깊이', note = null, map = null } = {}) {
  const rows = tintLegend();
  const pick = !!map?.setOptions;
  const selected = () => new Set(map?.options?.tintSelection || []);
  const setSel = (set) => map.setOptions({ tintSelection: set.size ? [...set].sort((a, b) => a - b) : null });
  const btns = [];
  const items = rows.map((r, i) => {
    const kids = [
      h('span', { class: 'at-tint-top', 'aria-hidden': pick ? 'true' : null }, r.top ?? ''),
      h('span', { class: 'at-tint-sw', style: { background: r.kind === 'glacier' ? `repeating-linear-gradient(135deg, rgba(0, 0, 0, .08) 0 2px, transparent 2px 5px), ${r.color}` : r.color }, 'aria-hidden': 'true' }),
      r.label ? h('span', { class: 'at-tint-label', 'aria-hidden': pick ? 'true' : null }, r.label) : null];
    const cls = `at-tint-row at-tint-${r.kind}${i === rows.length - 1 ? ' at-tint-last' : ''}`;
    if (!pick) return h('div', { class: cls, title: r.title }, kids);
    const name = r.kind === 'sea' ? `바다 ${r.title}` : r.kind === 'land' ? `육지 ${r.title}` : r.title;
    const b = h('button', {
      class: `${cls} is-pick`, type: 'button', 'aria-pressed': 'false', 'aria-label': name, title: `${name} 만 색칠(여러 개 고를 수 있음, 다시 누르면 뺌)`, dataset: { cls: String(r.cls) },
      on: { click: () => { const s0 = selected(); if (s0.has(r.cls)) s0.delete(r.cls); else s0.add(r.cls); setSel(s0); } },
    }, kids);
    btns.push([r.cls, b]);
    return b;
  });
  const reset = pick ? h('button', { class: 'ds-btn at-legend-reset', type: 'button', on: { click: () => setSel(new Set()) } }, '전체 보기') : null;
  if (reset) reset.hidden = true;
  const el = h('section', { class: `at-legend at-tint-legend${pick ? ' is-pickable' : ''}`, 'aria-label': `${title} 범례` },
    h('div', { class: 'at-legend-head' }, h('h3', { class: 'ds-h2 at-legend-title' }, title)),
    h('div', { class: 'at-tint-cols' },
      h('div', { class: 'at-tint-caption' }, h('span', {}, '육지 높이 (m)'), h('span', {}, '바다 깊이 (m)')),
      pick
        ? h('div', { class: 'at-tint-ramp', role: 'group', 'aria-label': '높이·깊이 단계 — 누르면 그 단계만 색칠' }, items)
        : h('div', { class: 'at-tint-ramp', role: 'img', 'aria-label': '육지 높이 0·100·200·500·1,000·2,000·3,000·4,000·5,000 m, 빙하, 해수면 아래 땅, 바다 깊이 200·1,000·2,000·4,000·6,000·8,000 m' },
          items)),
    reset,
    note ? h('p', { class: 'at-legend-note' }, note) : null);
  if (panel) addBlock(panel, el);
  const sync = (o) => {
    const set = new Set(o?.tintSelection || []);
    for (const [c, b] of btns) b.setAttribute('aria-pressed', String(set.has(c)));
    if (reset) reset.hidden = !set.size;
  };
  let off = null;
  if (pick) { try { off = map.on('options', sync); } catch { off = null; } sync(map.options); }
  return {
    el, show(on) { el.hidden = !on; },
    destroy() {
      off?.(); off = null;
      if (pick && !map.destroyed && map.options?.tintSelection?.length) map.setOptions({ tintSelection: null });
      el.remove(); btns.length = 0;
    },
  };
}

// ---------- 떠 있는 범례 칸(무대 오른쪽 아래) ----------
/**
 * 교사 요청(2026-10-20): 범례를 지도 오른쪽 아래로. 머리(「범례」 + 접기 단추 — aria-expanded)를 끌면 무대 안에서 옮기고(pointer capture,
 * 지도 끌기로 번지지 않게 stopPropagation, 접기 단추에서는 시작 안 함), 무대 크기가 바뀌거나 접고 펼 때 무대 안으로 다시 맞춘다. 머리를 두 번 누르면 제자리.
 * 옮긴 자리는 주제를 바꿔도 그대로(칸은 조각에 하나 — main.js 가 만들고 주제는 body 에 범례만 넣고 뺌).
 * → { el, body, sync()(보이는 내용이 없으면 칸째 숨김), collapse(on), reclamp(), resetPosition(), collapsed, destroy() }
 */
let panelSeq = 0;
export function legendPanel(stage, { title = '범례' } = {}) {
  // aria-controls 용 id: 같은 쪽에 조각이 둘 붙어도(모듈마다 번호가 1부터) 겹치지 않게 난수를 붙임
  const bodyId = `at-legend-panel-${++panelSeq}-${Math.random().toString(36).slice(2, 8)}`;
  const body = h('div', { class: 'at-legend-panel-body', id: bodyId });
  const toggle = h('button', {
    class: 'ds-btn at-legend-panel-toggle', type: 'button', 'aria-expanded': 'true', 'aria-controls': bodyId, 'aria-label': '범례 접기', title: '범례 접기',
    on: { click: () => collapse(!collapsed) },
  }, icon('chevron'));
  const head = h('div', {
    class: 'at-legend-panel-head', tabindex: '0', role: 'group',
    'aria-label': '범례 칸 — 끌거나 방향키로 옮기기, 두 번 누르거나 Home 키로 제자리', title: '끌어서 옮기기(두 번 누르면 제자리)',
  }, h('h2', { class: 'at-legend-panel-title' }, title), toggle);
  const el = h('section', { class: 'at-legend-panel', 'aria-label': title }, head, body);
  stage.append(el);
  let collapsed = false, pos = null, drag = null;

  const stageRect = () => stage.getBoundingClientRect?.() || { left: 0, top: 0, width: 0, height: 0 };
  function place(left, top) {
    const sr = stageRect(), r = el.getBoundingClientRect?.() || { width: 0, height: 0 };
    const maxL = Math.max(0, sr.width - r.width), maxT = Math.max(0, sr.height - r.height);
    pos = { left: Math.round(Math.min(maxL, Math.max(0, left))), top: Math.round(Math.min(maxT, Math.max(0, top))) };
    Object.assign(el.style, { left: `${pos.left}px`, top: `${pos.top}px`, right: 'auto', bottom: 'auto' });
    el.classList.add('is-moved');
  }
  /** 옮긴 칸을 무대 안으로 다시 맞춤(무대·칸 크기가 바뀔 때). 숨었거나 크기를 모르면(0) 그대로 — 0 으로 재면 옮긴 자리를 잃는다. 자리는 저장한 pos 기준. */
  function reclamp() {
    if (!pos || el.hidden) return;
    const sr = stageRect(), r = el.getBoundingClientRect?.();
    if (!r || !r.width || !sr.width) return;
    place(pos.left, pos.top);
  }
  function resetPosition() {
    pos = null;
    Object.assign(el.style, { left: '', top: '', right: '', bottom: '' });
    el.classList.remove('is-moved');
  }
  function collapse(on) {
    collapsed = !!on;
    body.hidden = collapsed;
    el.classList.toggle('is-collapsed', collapsed);
    toggle.setAttribute('aria-expanded', String(!collapsed));
    toggle.setAttribute('aria-label', collapsed ? '범례 펼치기' : '범례 접기');
    toggle.title = collapsed ? '범례 펼치기' : '범례 접기';
    reclamp(); // 펼쳐서 커지면 무대 밖으로 나가지 않게
  }
  const isToggle = (t) => { for (let n = t; n && n !== head; n = n.parentNode) if (n === toggle) return true; return false; };
  function onDown(e) {
    if ((e.button ?? 0) !== 0 || isToggle(e.target)) return;
    e.stopPropagation();
    const sr = stageRect(), r = el.getBoundingClientRect();
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, left: r.left - sr.left, top: r.top - sr.top };
    try { head.setPointerCapture?.(e.pointerId); } catch { /* 이미 놓은 포인터 */ }
    el.classList.add('is-dragging');
    e.preventDefault?.();
  }
  function onMove(e) {
    if (!drag || (e.pointerId != null && drag.id != null && e.pointerId !== drag.id)) return;
    e.stopPropagation();
    place(drag.left + e.clientX - drag.x, drag.top + e.clientY - drag.y);
  }
  function onUp(e) {
    if (!drag) return;
    e?.stopPropagation?.();
    try { head.releasePointerCapture?.(drag.id); } catch { /* 이미 놓음 */ }
    drag = null;
    el.classList.remove('is-dragging');
  }
  const stop = (e) => e.stopPropagation();
  head.addEventListener('pointerdown', onDown);
  head.addEventListener('pointermove', onMove);
  head.addEventListener('pointerup', onUp);
  head.addEventListener('pointercancel', onUp);
  head.addEventListener('lostpointercapture', onUp);
  head.addEventListener('dblclick', (e) => { if (!isToggle(e.target)) resetPosition(); });
  // 머리에 초점: 방향키 10px(Shift 40px)씩 옮김, Home 은 제자리
  head.addEventListener('keydown', (e) => {
    if (e.target !== head) return;
    if (e.key === 'Home') { resetPosition(); e.preventDefault(); return; }
    const d = e.shiftKey ? 40 : 10;
    const mv = { ArrowLeft: [-d, 0], ArrowRight: [d, 0], ArrowUp: [0, -d], ArrowDown: [0, d] }[e.key];
    if (!mv) return;
    const sr = stageRect(), r = el.getBoundingClientRect();
    const cur = pos || { left: r.left - sr.left, top: r.top - sr.top };
    place(cur.left + mv[0], cur.top + mv[1]);
    e.preventDefault(); e.stopPropagation();
  });
  // 칸 안의 휠·누르기가 지도(확대·끌기)로 번지지 않게. 스크롤하는 body 밖(머리)의 휠은 쪽(호스트 페이지)도 굴리지 않게 막음.
  const inBody = (t) => { for (let n = t; n && n !== el; n = n.parentNode) if (n === body) return true; return false; };
  el.addEventListener('wheel', (e) => { e.stopPropagation(); if (!inBody(e.target)) e.preventDefault(); }, { passive: false });
  el.addEventListener('pointerdown', stop);
  // 무대 크기·칸 크기(다른 주제의 더 긴 범례, 옮긴 뒤 최대 높이)가 바뀌면 다시 맞춤
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => reclamp()) : null;
  ro?.observe(stage);
  ro?.observe(el);
  function sync() {
    el.hidden = ![...body.children].some((c) => !c.hidden && c.childNodes.length > 0); // 빈 묶음(.at-legends)·숨긴 고도 색 범례는 내용 아님
    reclamp();
  }
  sync();
  return {
    el, body, sync, collapse, reclamp, resetPosition,
    get collapsed() { return collapsed; },
    get position() { return pos ? { ...pos } : null; },
    destroy() { ro?.disconnect(); el.remove(); },
  };
}

// ---------- 범례 ----------
function swatch(e) {
  const k = e.kind || 'fill';
  if (k === 'line' || k === 'flow' || k === 'isotherm') {
    const w = Math.max(1.2, Math.min(4, (e.width ?? 1) * 1.6));
    return s('svg', { class: 'at-swatch at-swatch-line', viewBox: '0 0 24 12', 'aria-hidden': 'true' },
      s('line', { x1: 2, y1: 6, x2: k === 'flow' ? 17 : 22, y2: 6, stroke: e.color, 'stroke-width': w, 'stroke-dasharray': e.dashed ? '3 2' : null }),
      k === 'flow' ? s('path', { d: 'M16,2 L23,6 L16,10Z', fill: e.color }) : null);
  }
  if (e.shape === 'bar') {
    return s('svg', { class: 'at-swatch at-swatch-sym', viewBox: '0 0 12 12', 'aria-hidden': 'true' }, s('rect', { x: 3.5, y: 1, width: 5, height: 10, fill: e.color }));
  }
  if (e.shape) {
    const d = { circle: null, square: 'M2,2H10V10H2Z', diamond: 'M6,1L11,6L6,11L1,6Z', triangle: 'M6,1L11,10H1Z', 'triangle-down': 'M1,2H11L6,11Z' }[e.shape];
    return s('svg', { class: 'at-swatch at-swatch-sym', viewBox: '0 0 12 12', 'aria-hidden': 'true' },
      d ? s('path', { d, fill: e.color, stroke: e.stroke || '#fff', 'stroke-width': e.stroke ? 1 : 0.8 }) : s('circle', { cx: 6, cy: 6, r: 4.5, fill: e.color, stroke: e.stroke || '#fff', 'stroke-width': e.stroke ? 1 : 0.8 }));
  }
  // 윤곽만 분류(style 'outline' — 유로 사용국): 칠하지 않은 테두리 상자
  if (e.style === 'outline') return h('span', { class: 'at-swatch at-swatch-outline', style: { borderColor: e.color || '#231f20' }, 'aria-hidden': 'true' });
  const st = { background: e.color || '#ccc' };
  if (e.pattern === 'hatch') st.background = `repeating-linear-gradient(45deg, ${e.color || '#ba703d'} 0 1.5px, transparent 1.5px 4px)`;
  else if (e.pattern === 'dots') st.background = `radial-gradient(circle, ${e.color || '#231f20'} 0 0.9px, transparent 1.1px) 0 0 / 4px 4px`; // 점무늬(사하라 사막, U4-3b)
  return h('span', { class: 'at-swatch at-swatch-fill', style: st, 'aria-hidden': 'true' });
}

/**
 * 겹친 원 범례(legendStyle 'nested-circles' — 30쪽 도시 인구 5단계): 큰 원부터 아래 끝을 맞춰 겹치고 값 글자는 오른쪽(지시선).
 * 원 + 글자 하나 = 누를 수 있는 <g role=button>(Enter·Space 도) — legend.toggle(cls). btns 에 [항목, 요소] 를 넣어 aria-pressed 를 맞춘다.
 */
function nestedLegend(items, legend, btns, label) {
  const lay = nestedCircles(items.map((e) => ({ cls: e.cls, size: e.size })));
  const by = new Map(items.map((e) => [e.cls, e]));
  const r1 = (v) => Math.round(v * 10) / 10;
  const W = lay.width + 96;
  const press = (e) => { if (legend && e.geometry !== false) legend.toggle(e.cls); };
  const gs = lay.items.map((it) => {
    const e = by.get(it.cls);
    // 범례 상태가 없으면(누를 수 없는 범례) 단추 역할·초점 없이 그림만
    const g = s('g', legend ? {
      class: 'at-legend-nest-item', role: 'button', tabindex: '0', 'aria-pressed': 'false', 'aria-label': `${e.label} 만 보기(다시 누르면 전체)`,
      on: { click: () => press(e), keydown: (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault?.(); press(e); } } },
    } : { class: 'at-legend-nest-item', 'aria-label': e.label },
      s('circle', { class: 'at-legend-nest-circle', cx: it.cx, cy: r1(it.cy), r: r1(it.r), fill: e.color, stroke: e.stroke || '#fff' }),
      s('path', { class: 'at-legend-nest-leader', d: `M${it.cx},${r1(it.top)}H${lay.width + 2}L${lay.width + 6},${r1(it.labelY)}` }),
      s('text', { class: 'at-legend-nest-label', x: lay.width + 9, y: r1(it.labelY + 4) }, e.label));
    btns.push([e, g]);
    return g;
  });
  return s('svg', { class: 'at-legend-nested', viewBox: `0 0 ${W} ${r1(lay.height)}`, width: W, height: r1(lay.height), role: 'group', 'aria-label': label }, gs);
}

/**
 * 범례 블록. legend = legendState(없으면 누를 수 없는 목록), items = 화면 범례 항목(layer.legendItems).
 * opts: { title, lineTitle, credit, note, approx, approxNote, approxReason, ready(Promise<boolean>), legendStyle('nested-circles' = 겹친 원),
 *         valueLegend([{icon, label}] — 값 붙은 기호의 아이콘 설명) }
 */
export function legendBlock(panel, legend, items, opts = {}) {
  const lineKinds = new Set(['line', 'flow', 'isotherm']);
  const btns = [];
  const row = (e) => {
    const disabled = !legend || e.geometry === false;
    const b = h('button', {
      class: 'at-legend-item', type: 'button', disabled: disabled ? true : null, 'aria-pressed': 'false',
      title: e.geometry === false ? '지도에는 없는 범례 항목' : `${e.label} 만 보기(다시 누르면 전체)`,
      on: { click: () => { if (legend && e.geometry !== false) legend.toggle(e.cls); } },
    }, swatch(e), h('span', { class: 'at-legend-label' }, e.label));
    btns.push([e, b]);
    return b;
  };
  const fills = items.filter((e) => !lineKinds.has(e.kind));
  // 묶음(항목 group — 기후 열대·건조·온대·냉대·한대): 이어진 같은 묶음을 제목 아래로. 제목을 누르면 그 묶음만(legend.toggleGroup).
  const groupBtns = [];
  const fillRows = (fills) => {
    const out = [];
    for (let i = 0; i < fills.length;) {
      const g = fills[i].group;
      if (!g) { out.push(row(fills[i])); i++; continue; }
      let j = i; while (j < fills.length && fills[j].group === g) j++;
      const members = fills.slice(i, j);
      const can = !!legend?.toggleGroup && members.every((e) => e.geometry !== false);
      const head = h('button', {
        class: 'at-legend-group-head', type: 'button', 'aria-pressed': 'false', disabled: can ? null : true, title: `「${g}」 묶음만 보기(다시 누르면 전체)`,
        on: { click: () => { if (can) legend.toggleGroup(g, members.map((e) => e.cls)); } },
      }, g);
      groupBtns.push([g, head]);
      out.push(h('div', { class: 'at-legend-group', role: 'group', 'aria-label': g }, head, h('div', { class: 'at-legend-group-items' }, members.map(row))));
      i = j;
    }
    return out;
  };
  const lines = items.filter((e) => lineKinds.has(e.kind));
  // 겹친 원: 첫 항목과 같은 색이고 크기(size)가 있는 항목들(크기 단계). 색이 다르거나 크기 없는 항목(30쪽 「사례 도시」 흰 원)은 아래 줄 목록
  const nestItems = opts.legendStyle === 'nested-circles' && fills.length ? fills.filter((e) => e.size > 0 && e.color === fills[0].color) : [];
  const nested = nestItems.length > 1;
  const listFills = nested ? fills.filter((e) => !nestItems.includes(e)) : fills;
  const reset = h('button', { class: 'ds-btn at-legend-reset', type: 'button', on: { click: () => legend?.reset() } }, '전체 보기');
  const notice = h('p', { class: 'at-legend-fail', role: 'status' }, '이미지를 불러오지 못했습니다. 지도의 다른 내용은 그대로 볼 수 있습니다.');
  reset.hidden = true; notice.hidden = true;
  const widthItem = lines.find((e) => e.kind === 'flow' && Array.isArray(e.widths) && Array.isArray(e.values));
  const widthRow = widthItem ? h('div', { class: 'at-legend-widths', 'aria-label': '선 굵기' },
    widthItem.widths.map((w, i) => h('span', { class: 'at-legend-width' },
      s('svg', { class: 'at-swatch at-swatch-line', viewBox: '0 0 24 12', 'aria-hidden': 'true' }, s('line', { x1: 2, y1: 6, x2: 22, y2: 6, stroke: '#555', 'stroke-width': Math.max(0.8, w * 2.2) })),
      widthItem.values[i])),
    widthItem.unit ? h('span', { class: 'at-legend-unit' }, `(${widthItem.unit})`) : null) : null;
  const head = h('div', { class: 'at-legend-head' },
    h('h3', { class: 'ds-h2 at-legend-title' }, opts.title || opts.label || '범례'),
    opts.approx ? h('span', { class: 'at-badge', title: opts.approxReason || '교과서 지도의 위치를 눈으로 맞춘 근사' }, opts.approxNote || '위치 근사') : null);
  const el = h('section', { class: 'at-legend', 'aria-label': opts.title || '범례' },
    head,
    nested ? nestedLegend(nestItems, legend, btns, opts.title || '범례') : null,
    listFills.length ? h('div', { class: `at-legend-list${listFills.some((e) => e.group) ? ' has-groups' : ''}` }, fillRows(listFills)) : null,
    lines.length ? h('div', { class: 'at-legend-sub' }, opts.lineTitle || null) : null,
    lines.length ? h('div', { class: 'at-legend-list' }, lines.map(row)) : null,
    widthRow,
    // 값 붙은 기호의 아이콘 설명(31쪽 리스본: 충전소 아이콘 = 1km²당 충전소, 사람 아이콘 = 인구 100명당 충전소)
    opts.valueLegend?.length ? h('div', { class: 'at-legend-values', role: 'list', 'aria-label': '값 아이콘' }, opts.valueLegend.map((v) => h('div', { class: 'at-legend-value', role: 'listitem' },
      s('svg', { class: 'at-swatch at-swatch-sym at-legend-vicon', viewBox: '0 0 10 10', 'aria-hidden': 'true' }, s('path', { d: valueIconPath(v.icon), fill: '#231f20' })),
      h('span', { class: 'at-legend-label' }, v.label)))) : null,
    reset, notice,
    opts.note ? h('p', { class: 'at-legend-note' }, opts.note) : null,
    opts.credit ? h('p', { class: 'at-legend-credit' }, opts.credit) : null);
  if (panel) addBlock(panel, el);
  const sync = (sel) => {
    for (const [e, b] of btns) b.setAttribute('aria-pressed', String(sel === e.cls));
    for (const [g, b] of groupBtns) b.setAttribute('aria-pressed', String(sel === `group:${g}`));
    reset.hidden = sel == null;
  };
  const off = legend ? legend.onChange(sync) : null;
  sync(legend?.selected?.() ?? null);
  let alive = true;
  opts.ready?.then?.((ok) => { if (alive && ok === false) notice.hidden = false; });
  return { el, update: sync, destroy() { alive = false; off?.(); el.remove(); btns.length = 0; groupBtns.length = 0; } };
}

// ---------- 상세 카드 ----------
export function detailCard(panel, { onExpand = null } = {}) {
  const el = h('section', { class: 'at-card', 'aria-live': 'polite' });
  el.hidden = true;
  if (panel) addBlock(panel, el);
  let charts = [];
  const clearCharts = () => { charts.forEach((c) => c.destroy()); charts = []; };
  function show(c = {}) {
    clearCharts();
    el.replaceChildren();
    const specs = [c.chart, ...(c.charts || [])].filter(Boolean);
    append(el, [ // dom.append: null 은 건너뜀(Element.append 는 null 을 글자 「null」로 넣는다)
      c.kicker ? h('div', { class: 'at-card-kicker' }, c.kicker) : null,
      c.title ? h('h3', { class: 'at-card-title' }, c.title, c.approx ? h('span', { class: 'at-badge', title: '교과서 핀 위치(근사)' }, '위치 근사') : null) : null,
      c.photo ? photoEl(c.photo, c.title) : null,
      c.text ? h('p', { class: 'at-card-text' }, c.text) : null]);
    for (const sp of specs) {
      const box = h('div', { class: 'at-card-chart' });
      el.append(box);
      charts.push(renderChart(box, sp));
      if (onExpand) box.append(h('button', { class: 'ds-btn at-expand', type: 'button', title: '그래프 크게 보기', 'aria-label': '그래프 크게 보기', on: { click: () => onExpand(sp) } }, icon('expand'), '크게 보기'));
    }
    if (c.credit) el.append(h('p', { class: 'at-card-credit' }, c.credit));
    el.hidden = false;
  }
  function hide() { clearCharts(); el.replaceChildren(); el.hidden = true; }
  return { el, show, hide, destroy() { hide(); el.remove(); } };
}

// ---------- 원본 쪽 보기(겹침 창) ----------
export function pageViewer(stage) {
  const title = h('h2', { class: 'at-viewer-title' });
  const body = h('div', { class: 'at-viewer-body' });
  const close = h('button', { class: 'ds-btn at-viewer-close', type: 'button', 'aria-label': '닫기', title: '닫기(Esc)', on: { click: () => hide() } }, icon('close'));
  const el = h('div', { class: 'at-viewer', role: 'dialog', 'aria-modal': 'false', 'aria-label': '원본 쪽 보기' },
    h('div', { class: 'at-viewer-head' }, title, close), body);
  el.hidden = true;
  const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); hide(); } };
  el.addEventListener('keydown', onKey);
  stage.append(el);
  let chart = null;
  /** {url(쪽 이미지), title, page, bbox?(pt — 그 부분만)} 또는 {title, node(요소)} 또는 {title, chart(spec)} */
  function show(o = {}) {
    chart?.destroy(); chart = null;
    body.replaceChildren();
    title.textContent = o.title || (o.page ? `교과서 ${o.page}쪽` : '');
    if (o.chart) {
      // 그래프 제목은 창 머리에 — 부제(「2010년 주요 수출품」 등, 같은 제목 그래프를 가름)도 함께
      const sub = o.chart.subtitle && !title.textContent.includes(o.chart.subtitle) ? o.chart.subtitle : '';
      if (sub) title.textContent = title.textContent ? `${title.textContent} — ${sub}` : sub;
      chart = renderChart(body, o.chart, { title: false });
    } else if (o.node) {
      body.append(o.node);
    } else if (o.url) {
      // loading:'lazy' 를 쓰지 않는다 — 부분 보기의 이미지는 불러오기 전 높이 0 인 채 멀리(음수 %) 놓여 화면과 겹치지 않아 lazy 면 끝내 불러오지 않는다.
      // 누를 때만 여는 창이라 미리 불러올 까닭도 없다.
      const img = h('img', { class: 'at-viewer-img', src: imageUrl(o.url), alt: title.textContent, on: { error: () => { img.hidden = true; body.append(h('p', { class: 'ds-note' }, '쪽 이미지를 불러오지 못했습니다.')); } } });
      const crop = pageCrop(o.bbox);
      if (crop) {
        Object.assign(img.style, { position: 'absolute', width: `${crop.width}%`, maxWidth: 'none', left: `${crop.left}%`, top: `${crop.top}%` });
        // 상자 비율은 aspect-ratio 로(padding-top % 는 자기 너비가 아니라 담는 상자(flex 본문) 너비 기준이라 높이가 틀어지고, 그러면 top % 도 어긋난다)
        body.append(h('div', { class: 'at-viewer-crop', style: { aspectRatio: `1 / ${crop.aspect}`, width: `min(100%, ${Math.round(crop.nativeW * 2.5)}px)` } }, img)); // 원본 화소의 2.5배까지만 키움(110dpi 라 더 키우면 뭉개짐)
      } else body.append(img);
    }
    el.hidden = false;
    close.focus?.();
  }
  function hide() { chart?.destroy(); chart = null; body.replaceChildren(); el.hidden = true; }
  return {
    el, show, hide,
    get open() { return !el.hidden; },
    destroy() { hide(); el.removeEventListener('keydown', onKey); el.remove(); },
  };
}

// ---------- 말풍선 ----------
export function tooltip(stage, { map = null, offset = 14 } = {}) {
  const el = h('div', { class: 'at-tip', role: 'tooltip' });
  el.hidden = true;
  stage.append(el);
  function show(text, [x, y]) {
    el.textContent = text;
    el.hidden = false;
    const W = stage.getBoundingClientRect?.().width || 0;
    const w = el.offsetWidth || 0;
    const left = W && x + offset + w > W - 4 ? x - offset - w : x + offset;
    el.style.left = `${Math.max(4, Math.round(left))}px`;
    el.style.top = `${Math.max(4, Math.round(y + offset))}px`;
  }
  function hide() { el.hidden = true; }
  const off = map ? map.on('hover', (e) => { const t = hoverLabel(e); if (t && e.xy) show(t, e.xy); else hide(); }) : null;
  // 보기가 바뀌면(주제 바꿈·fitBounds·퀴즈 이동 등 포인터 없이 움직여도) 포인터 아래가 달라졌으니 숨긴다 — 렌더러는 포인터가 움직였을 때만
  // hover 를 다시 내므로, 숨기지 않으면 옛 이름이 엉뚱한 땅 위에 남는다. 끌기는 멈춘 뒤 렌더러가 마지막 자리로 다시 내어 돌아온다.
  const offView = map ? map.on('viewchange', hide) : null;
  return { el, show, hide, destroy() { off?.(); offView?.(); el.remove(); } };
}

// ---------- 출처 줄 ----------
export function creditBlock(panel) {
  const list = h('ul', { class: 'at-credits-list' });
  const natural = h('p', { class: 'at-credits-base at-credits-natural', hidden: true }, NATURAL_CREDIT);
  const el = h('footer', { class: 'at-credits' }, h('p', { class: 'at-credits-base' }, '바탕 지도: Natural Earth (공공 저작물) · 지형 음영: Natural Earth'), natural, list);
  if (panel) addBlock(panel, el);
  function update(credits = []) {
    list.replaceChildren(...[...new Set(credits.filter(Boolean))].map((c) => h('li', { class: 'at-credits-item' }, c)));
  }
  update();
  /** 자연색 바탕이 보일 때 그 출처 줄(Natural Earth II) */
  const setNatural = (on) => { natural.hidden = !on; };
  return { el, update, setNatural, destroy() { el.remove(); } };
}
