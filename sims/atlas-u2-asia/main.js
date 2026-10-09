// © 2026 김용현
// 사회과부도 Ⅱ 아시아 — (임시, Task D3·D5·D6) 지도 렌더러 + 지형 음영 + 주제 레이어 확인용 mount. 단원 조립(Task E1)에서 바꾼다.
// 규칙(EMBED_RULES.md): DOM 은 h() 로만, 검색은 root 안에서만, 자료는 정적 import.
import { createShell, addBlock } from '../../src/shared/shell.js';
import { h } from '../../src/shared/dom.js';
import { createMap } from '../../src/atlas/renderer.js';
import { PROJECTIONS } from '../../src/atlas/projections.js';
import { attachRelief } from '../../src/atlas/relief.js';
import { markerLayer } from '../../src/atlas/layers.js';
import { layerFromRef } from '../../src/atlas/layerRef.js';
import basemap from './data/basemap.json';
import places from './data/places.json';
import topics from './data/topics.json';
import layerData from './data/layers.js';

const PAGES = 'https://yhk1m.github.io/donga-social-sims/assets/';
/** 개발 서버(vite, 저장소 루트)에서는 아직 공개 전인 이미지를 저장소 파일로 */
const assetUrl = (u) => (import.meta.env?.DEV && u?.startsWith(PAGES) ? `/docs/assets/${u.slice(PAGES.length)}` : u);
const TRADE_BOUNDS = [55, -45, -60, 72]; // 교역 흐름선(세계 지도 쪽): 날짜변경선을 건너는 범위

export default function mount(root) {
  const { stage, panel } = createShell(root, 'atlas-u2-asia');
  const map = createMap(stage, { basemap, places, unitBoxes: basemap.meta.unitBoxes });
  root.atlasMap = map; // 확인용(헤드리스 캡처·성능 측정)

  // 지형 음영(개발 서버는 저장소 파일, 조각은 공개 주소, 실패하면 음영 없이 그대로). root.atlasRelief = drawer 는 확인용(drawer.stats = 계산 시간)
  attachRelief(map).then((d) => { root.atlasRelief = d; });

  const seg = (items, cur, onPick) => {
    const btns = items.map(([v, label]) => h('button', {
      class: 'ds-seg-btn', type: 'button', 'aria-pressed': String(v === cur),
      on: { click: () => { btns.forEach((b) => b.setAttribute('aria-pressed', String(b === btns[items.findIndex((x) => x[0] === v)]))); onPick(v); } },
    }, label));
    return h('div', { class: 'ds-seg' }, btns);
  };
  addBlock(panel, h('div', { class: 'ds-ctl' },
    h('span', { class: 'ds-label' }, '도법'),
    seg(Object.entries(PROJECTIONS).map(([k, d]) => [k, d.label]), 'miller', (k) => map.setProjection(k)),
  ));
  addBlock(panel, h('div', { class: 'ds-ctl' },
    h('span', { class: 'ds-label' }, '중심 경도'),
    seg([[0, '대서양'], [150, '태평양']], 0, (c) => map.setCenterLon(c)),
  ));
  addBlock(panel, h('label', { class: 'ds-check' },
    h('input', { type: 'checkbox', checked: true, on: { change: (ev) => map.setOptions({ relief: ev.target.checked }) } }),
    '지형 음영'));
  const general = topics.find((t) => t.id === 'general');
  const views = [['world', '세계', null], ...(general?.views || []).map((v) => [v.id, v.label || v.title || v.id, v.bounds])];
  addBlock(panel, h('div', { class: 'ds-ctl' },
    h('span', { class: 'ds-label' }, '보기'),
    h('div', { class: 'ds-row' }, views.map(([id, label, b]) => h('button', {
      class: 'ds-btn', type: 'button',
      on: { click: () => (b ? map.fitBounds(b) : map.flyTo({ center: [map.view.centerLon, 20], zoom: 1 })) },
    }, label))),
  ));

  // ---------- 주제 레이어(임시): 주제 레이어 고르기 + 범례 목록(누르면 그 분류만) ----------
  // 같은 주제에서 이름이 같은 레이어(인구 분포 = 밀도 음영 + 1억 명 막대)는 함께 띄운다.
  const choices = [];
  for (const t of topics) {
    const byLabel = new Map();
    for (const ref of t.layers || []) {
      const key = ref.label || ref.ref;
      if (!byLabel.has(key)) byLabel.set(key, []);
      byLabel.get(key).push(ref);
    }
    for (const [label, refs] of byLabel) choices.push({ id: refs.map((r) => r.ref).join('+'), text: `${t.title} — ${label}`, topic: t, refs });
    if (t.markers?.length) choices.push({ id: `markers-${t.id}`, text: `${t.title} — 핀 ${t.markers.length}개`, topic: t, markers: t.markers });
  }
  const legendBox = h('div', { class: 'ds-ctl' });
  const info = h('div', { class: 'ds-note' }, '주제 레이어를 고르세요.');
  const hoverOut = h('div', { class: 'ds-note' }, '가리킨 것: —');
  let current = [];
  const boundsFor = (c) => {
    if (c.refs?.some((r) => r.type === 'flow')) return TRADE_BOUNDS;
    const v = (c.topic.views || []).find((x) => c.refs?.some((r) => r.ref.endsWith(`-${x.id}`)));
    return (v || c.topic.view)?.bounds;
  };
  function show(id) {
    map.clearLayers();
    current = [];
    legendBox.replaceChildren();
    const c = choices.find((x) => x.id === id);
    if (!c) { info.textContent = '주제 레이어를 고르세요.'; root.atlasLayers = current; return; }
    if (c.markers) {
      const L = markerLayer(c.id, c.markers, { map, onPick: (m) => { info.textContent = `${m.title}${m.approx ? ' (위치 근사)' : ''}`; } });
      map.addLayer(L); current.push(L);
    }
    for (const ref of c.refs || []) {
      const d = layerData[ref.ref];
      const data = d.url ? { ...d, url: assetUrl(d.url) } : d;
      const L = layerFromRef(ref, { [ref.ref]: data }, { map, onPick: (f) => { info.textContent = `누름: ${f.properties.label ?? ''}`; } });
      map.addLayer(L); current.push(L);
      if (L.legend) {
        const title = h('div', { class: 'ds-label' }, ref.legendTitle || ref.label);
        const btns = L.legendItems.map((e) => h('button', {
          class: 'ds-btn', type: 'button', 'aria-pressed': 'false', disabled: e.geometry === false ? true : null,
          style: { justifyContent: 'flex-start', padding: '4px 8px', fontSize: '13px' },
          on: { click: () => L.legend.toggle(e.cls) },
        }, h('span', { style: { display: 'inline-block', width: '14px', height: e.kind === 'line' || e.kind === 'flow' ? '3px' : '12px', background: e.color, border: '1px solid rgba(0,0,0,.2)' } }), e.label));
        L.legend.onChange((sel) => btns.forEach((b, i) => b.setAttribute('aria-pressed', String(L.legendItems[i].cls === sel))));
        legendBox.append(title, h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '4px' } }, btns),
          h('button', { class: 'ds-btn', type: 'button', style: { padding: '4px 8px', fontSize: '13px' }, on: { click: () => L.legend.reset() } }, '전체 보기'));
      }
    }
    const metas = current.map((L) => L.meta).filter(Boolean);
    info.textContent = metas.map((m) => [m.title, m.credit, m.note, m.approx ? `「${m.approxNote}」` : null].filter(Boolean).join(' · ')).join(' / ') || c.text;
    const b = boundsFor(c);
    if (b) map.fitBounds(b);
    root.atlasLayers = current; // 확인용
  }
  map.on('hover', (e) => {
    const p = e.feature?.properties;
    hoverOut.textContent = `가리킨 것: ${e.layerId && e.layerId !== 'basemap' ? `${p?.label ?? p?.name ?? ''} (${e.layerId})` : p?.ko ? `${p.ko}` : '—'}`;
  });
  const select = h('select', { class: 'ds-btn', on: { change: (ev) => show(ev.target.value) } },
    h('option', { value: '' }, '(주제 레이어 없음)'),
    choices.map((c) => h('option', { value: c.id }, c.text)));
  addBlock(panel, h('div', { class: 'ds-ctl' }, h('span', { class: 'ds-label' }, '주제 레이어(임시)'), select));
  addBlock(panel, legendBox);
  addBlock(panel, info);
  addBlock(panel, hoverOut);
  root.atlasShowLayer = (id) => { select.value = id; show(id); }; // 확인용(캡처 스크립트)
  root.atlasLayerChoices = choices.map((c) => c.id);
}
