// © 2026 김용현
// 사회과부도 Ⅱ 아시아 — (임시, Task D3·D5) 지도 렌더러 + 지형 음영만 띄우는 mount. 단원 조립(Task E1)에서 바꾼다.
// 규칙(EMBED_RULES.md): DOM 은 h() 로만, 검색은 root 안에서만, 자료는 정적 import.
import { createShell, addBlock } from '../../src/shared/shell.js';
import { h } from '../../src/shared/dom.js';
import { createMap } from '../../src/atlas/renderer.js';
import { PROJECTIONS } from '../../src/atlas/projections.js';
import { attachRelief } from '../../src/atlas/relief.js';
import basemap from './data/basemap.json';
import places from './data/places.json';
import topics from './data/topics.json';

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
}
