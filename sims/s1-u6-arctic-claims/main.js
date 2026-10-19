// © 2026 김용현
// 북극 영유권 주장 지도 (중등 사회1 115쪽 「북극 신문」)
// 북극 중심 정거 방위 도법 지도(SVG, km 단위)를 구역으로 나누고, 구역을 누르면 주장·근거·자료와 출처를 보여 준다.
import { createShell, addBlock } from '../../src/shared/shell.js';
import { h, s, clear, append, icon } from '../../src/shared/dom.js';
import GEO from './geo.js';
import { COUNTRIES, SOURCES, TERMS, WHY, REGIONS, MARKERS, LABELS, LOMONOSOV } from './data.js';
import './style.css';

const R_EARTH = 6371;
const toXY = (lon, lat) => {
  const r = ((90 - lat) * Math.PI / 180) * R_EARTH;
  const a = lon * Math.PI / 180;
  return [r * Math.sin(a), r * Math.cos(a)];
};

const KIND_LABEL = { ov: '여러 나라 주장이 겹치는 곳', dis: '200해리 안 경계 분쟁', ecs: '200해리 밖 대륙붕 연장 주장', eez: '200해리 배타적 경제 수역', pole: '지점', base: '우리나라 과학 기지', solved: '해결된 분쟁' };
const GROUPS = [
  { title: '분쟁 지역 (주장이 겹치는 곳)', kinds: ['ov', 'dis'] },
  { title: '한 나라만 주장하는 대륙붕', kinds: ['ecs'] },
  { title: '200해리 배타적 경제 수역', kinds: ['eez'] },
];
const CTX_IDS = ['eez-is', 'eez-fo', 'ecs-other'];

export default function mount(root) {
  const { stage, panel } = createShell(root, 's1-u6-arctic-claims');
  stage.classList.add('arc-stage');

  const byId = new Map([...REGIONS, ...MARKERS].map((r) => [r.id, r]));
  const paths = new Map(); // id -> path element

  // ───────── 지도 SVG ─────────
  const R = GEO.radius;
  const defs = h('defs', {});
  // 줄무늬(겹치는 주장). legend=true 면 범례용 고정 크기, 아니면 확대 비율에 맞춰 applyScale 이 크기를 바꾼다
  const makePattern = (owners, soft, legend) => {
    const id = `ds-arc-pat-${owners.join('-')}${soft ? '-s' : ''}${legend ? '-lg' : ''}`;
    if (defs.querySelector(`[id="${id}"]`)) return id;
    const w = legend ? 20 : 46;
    const pat = s('pattern', { id, class: legend ? 'arc-pat-lg' : 'arc-pat', patternUnits: 'userSpaceOnUse', width: w * owners.length, height: w * owners.length, patternTransform: 'rotate(45)' });
    owners.forEach((o, i) => pat.append(h('rect', { x: i * w, y: 0, width: w, height: w * owners.length, fill: soft ? COUNTRIES[o].soft : COUNTRIES[o].color })));
    defs.append(pat);
    return id;
  };
  const fillOf = (reg) => {
    if (reg.kind === 'ov') return `url(#${makePattern(reg.owners, false)})`;
    if (reg.kind === 'dis') return `url(#${makePattern(reg.owners, false)})`;
    const c = COUNTRIES[reg.owners[0]];
    return reg.kind === 'eez' ? c.soft : c.color;
  };

  const clip = s('clipPath', { id: 'ds-arc-clip' }, h('circle', { cx: 0, cy: 0, r: R }));
  defs.append(clip);

  const gEez = h('g', { class: 'arc-layer-eez' });
  const gEcs = h('g', { class: 'arc-layer-ecs' });
  const gCtx = h('g', { class: 'arc-layer-ctx' });
  for (const id of CTX_IDS) if (GEO.regions[id]) gCtx.append(h('path', { class: 'arc-ctx', d: GEO.regions[id] }));
  for (const reg of REGIONS) {
    const d = GEO.regions[reg.id];
    if (!d) continue;
    const p = h('path', { class: `arc-reg arc-k-${reg.kind}`, d, fill: fillOf(reg), dataset: { id: reg.id } });
    p.append(h('title', {}, reg.name));
    paths.set(reg.id, p);
    (reg.kind === 'eez' || reg.kind === 'dis' ? gEez : gEcs).append(p);
  }
  const gLand = h('g', { class: 'arc-land' });
  for (const [k, d] of Object.entries(GEO.land)) gLand.append(h('path', { class: `arc-land-${k === 'other' ? 'other' : 'own'}`, d }));

  const lomo = h('g', { class: 'arc-lomo' },
    h('polyline', { class: 'arc-lomo-line', points: LOMONOSOV.map((p) => toXY(...p).map(Math.round).join(',')).join(' ') }),
  );
  const [lx, ly] = toXY(150, 83.6);
  const lomoText = h('text', { class: 'arc-lomo-text', x: Math.round(lx), y: Math.round(ly) }, '로모노소프 해령(대략)');
  lomo.append(lomoText);

  const gLabels = h('g', { class: 'arc-labels' });
  for (const L of LABELS) {
    const [x, y] = toXY(L.lon, L.lat);
    gLabels.append(h('text', { class: `arc-lab arc-lab-${L.size}`, x: Math.round(x), y: Math.round(y) }, L.t));
  }

  const gMarkers = h('g', { class: 'arc-markers' });
  const markerEls = new Map();
  for (const m of MARKERS) {
    const [x, y] = toXY(m.lon, m.lat);
    const g = h('g', { class: `arc-mk arc-mk-${m.kind}`, transform: `translate(${Math.round(x)} ${Math.round(y)})`, dataset: { id: m.id } });
    g.append(h('circle', { class: 'arc-mk-hit', r: 1 }), h('circle', { class: 'arc-mk-dot', r: 1 }), h('text', { class: 'arc-mk-text', x: 0, y: 0 }, m.name));
    g.append(h('title', {}, m.name));
    markerEls.set(m.id, g);
    gMarkers.append(g);
  }

  const selPath = h('path', { class: 'arc-sel', d: '' });
  const hovPath = h('path', { class: 'arc-hov', d: '' });
  const famGroup = h('g', { class: 'arc-fam' });

  const svg = h('svg', { class: 'arc-map', role: 'img', 'aria-label': '북극 중심 지도: 나라별 200해리 배타적 경제 수역과 대륙붕 연장 주장 구역' },
    defs,
    h('circle', { class: 'arc-ocean', cx: 0, cy: 0, r: R }),
    h('g', { 'clip-path': 'url(#ds-arc-clip)' },
      h('path', { class: 'arc-grat', d: GEO.graticule }),
      gCtx, gEez, gEcs, famGroup, hovPath, selPath, gLand, lomo,
    ),
    h('circle', { class: 'arc-rim', cx: 0, cy: 0, r: R }),
    gLabels, gMarkers,
  );
  stage.append(svg);

  // 지도 위 조작: 층 켜고 끄기, 확대
  const layerState = { eez: true, ecs: true, lomo: true, labels: true };
  const layerEls = { eez: [gEez], ecs: [gEcs], lomo: [lomo], labels: [gLabels] };
  const layerNames = { eez: '200해리 경제 수역', ecs: '대륙붕 연장 주장', lomo: '로모노소프 해령', labels: '지명' };
  const layers = h('div', { class: 'arc-layers', role: 'group', 'aria-label': '지도에 보일 것' },
    Object.keys(layerState).map((k) => h('label', { class: 'arc-chk' },
      h('input', { type: 'checkbox', class: 'arc-chk-in', checked: true, on: { change: (e) => { layerState[k] = e.target.checked; layerEls[k].forEach((el) => el.classList.toggle('arc-off', !e.target.checked)); } } }),
      layerNames[k])),
  );
  const zoomBox = h('div', { class: 'arc-zoom' },
    h('button', { class: 'arc-zbtn', type: 'button', 'aria-label': '확대', on: { click: () => zoomBy(0.7) } }, icon('plus')),
    h('button', { class: 'arc-zbtn', type: 'button', 'aria-label': '축소', on: { click: () => zoomBy(1 / 0.7) } }, icon('minus')),
    h('button', { class: 'arc-zbtn', type: 'button', 'aria-label': '처음 화면', on: { click: () => setView(HOME.cx, HOME.cy, HOME.half) } }, icon('reset')),
  );

  // 범례
  const sw = (fill) => h('svg', { class: 'arc-sw', viewBox: '0 0 92 92', 'aria-hidden': 'true' }, h('rect', { width: 92, height: 92, fill }));
  const legend = h('div', { class: 'arc-legend' },
    h('div', { class: 'arc-leg-title' }, '북극해 영유권 주장 지역'),
    h('div', { class: 'arc-leg-grid' },
      Object.entries(COUNTRIES).map(([k, c]) => h('div', { class: 'arc-leg-row' },
        h('span', { class: 'arc-leg-pair' }, sw(c.color), sw(c.soft)), `${c.name}${c.sub ? `(${c.sub})` : ''}`)),
      h('div', { class: 'arc-leg-row' }, h('span', { class: 'arc-leg-pair' }, sw(`url(#${makePattern(['ru', 'ca'], false, true)})`), sw(`url(#${makePattern(['ru', 'dk'], false, true)})`)), '줄무늬: 주장이 겹치는 곳'),
    ),
    h('div', { class: 'arc-leg-note' }, '진한 색: 200해리 밖 대륙붕 연장 주장 · 연한 색: 200해리 배타적 경제 수역'),
  );
  const credit = h('div', { class: 'arc-credit' }, '경계: Marine Regions(2023·2024) 자료를 단순화 · 육지: Natural Earth · 북극 중심 정거 방위 도법');
  const tip = h('div', { class: 'arc-tip', hidden: true });
  stage.append(layers, zoomBox, legend, credit, tip);

  // ───────── 보기(확대·이동) ─────────
  const HOME = { cx: 0, cy: 150, half: 3300 };
  const view = { ...HOME };
  function kmPerPx() {
    const w = svg.clientWidth || 1, hgt = svg.clientHeight || 1;
    return (2 * view.half) / Math.min(w, hgt);
  }
  function setView(cx, cy, half) {
    view.half = Math.max(350, Math.min(3600, half));
    const lim = R;
    view.cx = Math.max(-lim, Math.min(lim, cx));
    view.cy = Math.max(-lim, Math.min(lim, cy));
    svg.setAttribute('viewBox', `${view.cx - view.half} ${view.cy - view.half} ${2 * view.half} ${2 * view.half}`);
    applyScale();
  }
  function applyScale() {
    const k = kmPerPx();
    svg.style.setProperty('--k', k);
    gLabels.setAttribute('font-size', (13 * k).toFixed(1));
    lomoText.setAttribute('font-size', (11.5 * k).toFixed(1));
    for (const g of markerEls.values()) {
      const [dot, hit, text] = [g.querySelector('.arc-mk-dot'), g.querySelector('.arc-mk-hit'), g.querySelector('.arc-mk-text')];
      dot.setAttribute('r', (5.5 * k).toFixed(1));
      hit.setAttribute('r', (13 * k).toFixed(1));
      text.setAttribute('font-size', (12.5 * k).toFixed(1));
      text.setAttribute('x', (9 * k).toFixed(1));
      text.setAttribute('y', (-8 * k).toFixed(1));
    }
    for (const p of defs.querySelectorAll('.arc-pat')) {
      const n = p.querySelectorAll('rect').length;
      const w = Math.max(6, 7 * k);
      p.setAttribute('width', w * n); p.setAttribute('height', w * n);
      p.querySelectorAll('rect').forEach((r, i) => { r.setAttribute('x', i * w); r.setAttribute('width', w); r.setAttribute('height', w * n); });
    }
  }
  function zoomBy(f, ax, ay) {
    const nh = Math.max(350, Math.min(3600, view.half * f));
    const fx = ax ?? view.cx, fy = ay ?? view.cy;
    const r = nh / view.half;
    setView(fx + (view.cx - fx) * r, fy + (view.cy - fy) * r, nh);
  }
  const toMap = (ev) => {
    const b = svg.getBoundingClientRect();
    const k = kmPerPx();
    return [view.cx + (ev.clientX - b.left - b.width / 2) * k, view.cy + (ev.clientY - b.top - b.height / 2) * k];
  };
  new ResizeObserver(() => setView(view.cx, view.cy, view.half)).observe(stage);
  setView(HOME.cx, HOME.cy, HOME.half);

  svg.addEventListener('wheel', (e) => { e.preventDefault(); const [x, y] = toMap(e); zoomBy(e.deltaY > 0 ? 1.15 : 1 / 1.15, x, y); }, { passive: false });
  let drag = null, moved = false;
  svg.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, cx: view.cx, cy: view.cy }; moved = false; });
  svg.addEventListener('pointermove', (e) => {
    if (drag) {
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (!moved && Math.hypot(dx, dy) > 4) { moved = true; svg.setPointerCapture(e.pointerId); svg.classList.add('arc-dragging'); hideTip(); }
      if (moved) { const k = kmPerPx(); setView(drag.cx - dx * k, drag.cy - dy * k, view.half); return; }
    }
    hoverAt(e);
  });
  const endDrag = (e) => {
    if (drag && !moved) { const id = idAt(e.target); if (id) select(id); }
    drag = null; svg.classList.remove('arc-dragging');
  };
  svg.addEventListener('pointerup', endDrag);
  svg.addEventListener('pointercancel', () => { drag = null; svg.classList.remove('arc-dragging'); });
  svg.addEventListener('pointerleave', () => { if (!drag) hideTip(); });

  function idAt(t) {
    const el = t.closest?.('[data-id]');
    return el && svg.contains(el) ? el.dataset.id : null;
  }
  let hovId = null;
  function hoverAt(e) {
    const id = idAt(e.target);
    if (id !== hovId) {
      hovId = id;
      const p = id && paths.get(id);
      hovPath.setAttribute('d', p ? p.getAttribute('d') : '');
    }
    if (!id) { hideTip(); return; }
    const it = byId.get(id);
    append(clear(tip), [
      h('div', { class: 'arc-tip-k' }, KIND_LABEL[it.kind] || ''),
      h('div', { class: 'arc-tip-n' }, it.name),
      it.owners ? h('div', { class: 'arc-tip-own' }, it.owners.map((o) => chip(o))) : null,
    ]);
    tip.hidden = false;
    const b = stage.getBoundingClientRect();
    let x = e.clientX - b.left + 14, y = e.clientY - b.top + 14;
    const tw = tip.offsetWidth, th = tip.offsetHeight;
    if (x + tw > b.width - 8) x = e.clientX - b.left - tw - 14;
    if (y + th > b.height - 8) y = e.clientY - b.top - th - 14;
    tip.style.left = `${x}px`; tip.style.top = `${y}px`;
  }
  function hideTip() { tip.hidden = true; hovId = null; hovPath.setAttribute('d', ''); }

  // ───────── 사이드바 ─────────
  const chip = (o) => h('span', { class: 'arc-chip', style: `--c: ${COUNTRIES[o].color}` }, h('span', { class: 'arc-chip-dot' }), COUNTRIES[o].name);
  const srcLine = (ids) => h('div', { class: 'arc-src' },
    h('span', { class: 'arc-src-k' }, '출처'),
    h('span', {}, ids.map((id, i) => [i ? ' · ' : '', SOURCES[id].org, ', ', SOURCES[id].date])),
  );
  const factEl = (f) => h('div', { class: 'arc-fact' },
    f.h ? h('div', { class: 'arc-fact-h' }, f.h) : null,
    h('p', { class: 'arc-fact-t' }, f.text),
    srcLine(f.src),
  );

  const detail = addBlock(panel, h('section', { class: 'arc-detail', 'aria-live': 'polite' }));
  function showIntro() {
    append(clear(detail), [
      h('p', { class: 'arc-intro' }, '지도에서 색칠된 구역이나 점(북극점·다산 과학 기지·한스섬)을 눌러 보세요. 그곳을 누가, 어떤 근거로 주장하는지 출처와 함께 나타납니다.'),
      h('div', { class: 'arc-h' }, '먼저 알아 둘 말'),
      TERMS.map((t) => factEl({ h: t.term, text: t.text, src: t.src })),
    ]);
  }
  function select(id) {
    const it = byId.get(id);
    if (!it) return;
    const p = paths.get(id);
    selPath.setAttribute('d', p ? p.getAttribute('d') : '');
    for (const [mid, g] of markerEls) g.classList.toggle('arc-mk-on', mid === id);
    for (const b of listBtns) b.setAttribute('aria-current', String(b.dataset.id === id));
    clearFamily();
    append(clear(detail), [
      h('div', { class: 'arc-d-top' },
        h('span', { class: `arc-kind arc-kind-${it.kind}` }, KIND_LABEL[it.kind]),
        h('button', { class: 'arc-x', type: 'button', 'aria-label': '선택 해제', on: { click: unselect } }, '닫기'),
      ),
      h('h2', { class: 'arc-d-title' }, it.name),
      it.owners ? h('div', { class: 'arc-d-own' }, h('span', { class: 'arc-d-own-k' }, it.owners.length > 1 ? '주장하는 나라' : '관할·주장 나라'), it.owners.map(chip)) : null,
      h('p', { class: 'arc-lead' }, it.lead),
      it.facts.map(factEl),
      GEO.regions[id] ? h('div', { class: 'arc-geo-note' }, '지도의 경계: ', it.kind === 'eez' || it.kind === 'dis' ? `${SOURCES.mrEez.org} ${SOURCES.mrEez.date}` : `${SOURCES.mrEcs.org} ${SOURCES.mrEcs.date}`, ' — 화면용으로 단순화하였으며 법적 효력이 없습니다.') : null,
    ]);
    panel.scrollTop = 0;
  }
  // 목록에서 고르면 그 구역이 화면에 들어오도록 옮긴다
  function focusOn(id) {
    const p = paths.get(id);
    if (p) {
      const b = p.getBBox();
      const half = Math.max(700, Math.max(b.width, b.height) / 2 * 1.35);
      if (half < view.half || Math.abs(b.x + b.width / 2 - view.cx) + half > view.half * 1.6) setView(b.x + b.width / 2, b.y + b.height / 2, Math.min(half, HOME.half));
      return;
    }
    const m = MARKERS.find((x) => x.id === id);
    if (m) { const [x, y] = toXY(m.lon, m.lat); setView(x, y, Math.min(view.half, 1500)); }
  }
  function unselect() {
    selPath.setAttribute('d', '');
    for (const g of markerEls.values()) g.classList.remove('arc-mk-on');
    for (const b of listBtns) b.setAttribute('aria-current', 'false');
    showIntro();
  }

  // 나라별 정리 (활동 1)
  const whyBody = h('div', { class: 'arc-why-body' });
  const whyBtns = [];
  function clearFamily() { clear(famGroup); for (const b of whyBtns) b.setAttribute('aria-pressed', 'false'); }
  function showWhy(k) {
    const on = whyBtns.find((b) => b.dataset.k === k)?.getAttribute('aria-pressed') === 'true';
    clearFamily();
    if (on) { clear(whyBody); return; }
    for (const b of whyBtns) b.setAttribute('aria-pressed', String(b.dataset.k === k));
    // 그 나라가 관련된 구역 모두 강조
    for (const reg of REGIONS) if (reg.owners.includes(k) && paths.get(reg.id)) famGroup.append(h('path', { class: 'arc-famp', d: paths.get(reg.id).getAttribute('d'), style: { stroke: COUNTRIES[k].color } }));
    append(clear(whyBody), [
      h('p', { class: 'arc-why-lead' }, `${COUNTRIES[k].name}${COUNTRIES[k].sub ? `(${COUNTRIES[k].sub})` : ''}가 관련된 구역을 지도에 굵은 선으로 표시했어요.`),
      WHY[k].map((f) => factEl(f)),
    ]);
    panel.scrollTop += whySec.getBoundingClientRect().top - panel.getBoundingClientRect().top - 8;
  }
  const whySec = addBlock(panel, h('section', { class: 'arc-why' },
    h('div', { class: 'arc-h' }, '나라별로 정리하기 — 왜 북극을 주장할까?'),
    h('div', { class: 'arc-why-btns' }, Object.entries(COUNTRIES).map(([k, c]) => {
      const b = h('button', { class: 'arc-why-btn', type: 'button', 'aria-pressed': 'false', dataset: { k }, style: `--c: ${c.color}`, on: { click: () => showWhy(k) } }, h('span', { class: 'arc-chip-dot' }), c.name);
      whyBtns.push(b);
      return b;
    })),
    whyBody,
  ));

  // 구역 목록 (키보드로도 고를 수 있게)
  const listBtns = [];
  const itemBtn = (it) => {
    const fill = it.owners ? (it.kind === 'eez' ? COUNTRIES[it.owners[0]].soft : null) : null;
    const b = h('button', { class: 'arc-li', type: 'button', 'aria-current': 'false', dataset: { id: it.id }, on: { click: () => { select(it.id); focusOn(it.id); }, mouseenter: () => { const p = paths.get(it.id); hovPath.setAttribute('d', p ? p.getAttribute('d') : ''); }, mouseleave: () => hovPath.setAttribute('d', '') } },
      h('span', { class: 'arc-li-sw' }, it.owners
        ? it.owners.map((o) => h('span', { class: 'arc-li-sw-part', style: { background: it.kind === 'eez' || it.kind === 'dis' ? COUNTRIES[o].soft : COUNTRIES[o].color } }))
        : h('span', { class: `arc-li-sw-pt arc-li-pt-${it.kind}` })),
      h('span', { class: 'arc-li-n' }, it.name),
    );
    void fill;
    listBtns.push(b);
    return b;
  };
  addBlock(panel, h('section', { class: 'arc-list' },
    h('div', { class: 'arc-h' }, '구역 목록'),
    GROUPS.map((g) => h('div', { class: 'arc-grp' },
      h('div', { class: 'arc-grp-t' }, g.title),
      REGIONS.filter((r) => g.kinds.includes(r.kind)).map(itemBtn))),
    h('div', { class: 'arc-grp' }, h('div', { class: 'arc-grp-t' }, '지점'), MARKERS.map(itemBtn)),
  ));

  // 전체 출처
  addBlock(panel, h('details', { class: 'arc-all-src' },
    h('summary', { class: 'arc-all-src-s' }, `이 자료에 쓴 출처 전체 (${Object.keys(SOURCES).length}개)`),
    h('ol', { class: 'arc-all-src-ol' }, Object.values(SOURCES).map((x) => h('li', { class: 'arc-all-src-li' }, h('b', {}, x.org), ' — ', x.date))),
    h('p', { class: 'arc-all-src-p' }, '지도 경계는 Marine Regions 자료를 화면에 맞게 단순화한 것으로, 실제 경계와 조금 다를 수 있고 법적 효력이 없습니다. 로모노소프 해령 선은 대략적인 위치입니다.'),
  ));

  showIntro();
}
