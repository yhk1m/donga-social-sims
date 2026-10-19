// © 2026 김용현
// 사회과부도 Ⅱ 아시아 — (임시, Task D7) 화면 부품 확인용 mount: 목차 + 지도 도구 + 범례 + 상세 카드 + 그래프 + 퀴즈 + 원본 쪽 보기 + 말풍선.
// 주제 조립의 최종판(topic.js buildTopic)은 Task E1 에서 만든다. 여기서는 주제마다 부품을 만들고 바꿀 때 destroy 하는 간단한 연결만 둔다.
// 규칙(EMBED_RULES.md): DOM 은 h() 로만, 검색은 root 안에서만, 자료는 정적 import.
import { feature } from 'topojson-client';
import { createShell, addBlock } from '../../src/shared/shell.js';
import { h, icon } from '../../src/shared/dom.js';
import { createMap } from '../../src/atlas/renderer.js';
import { attachRelief } from '../../src/atlas/relief.js';
import { markerLayer } from '../../src/atlas/layers.js';
import { layerFromRef } from '../../src/atlas/layerRef.js';
import { topicNav, mapTools, legendBlock, detailCard, pageViewer, tooltip, creditBlock, imageUrl } from '../../src/atlas/ui.js';
import { renderChart } from '../../src/atlas/charts.js';
import { coloringLayer, coloringQuiz, heritageQuiz } from '../../src/atlas/quiz.js';
import basemap from './data/basemap.json';
import places from './data/places.json';
import topics from './data/topics.json';
import charts from './data/charts.json';
import layerData from './data/layers.js';

const TRADE_BOUNDS = [55, -45, -60, 72]; // 교역 흐름선(세계 지도 쪽): 날짜변경선을 건너는 범위

export default function mount(root) {
  const { stage, panel } = createShell(root, 'atlas-u2-asia');
  const map = createMap(stage, { basemap, places, unitBoxes: basemap.meta.unitBoxes });
  root.atlasMap = map; // 확인용(헤드리스 캡처·성능 측정)
  attachRelief(map).then((d) => { root.atlasRelief = d; });

  const tools = mapTools(stage, map);
  const tip = tooltip(stage, { map });
  const viewer = pageViewer(stage);
  const nav = topicNav(panel, topics, (id) => showTopic(id));
  const body = addBlock(panel, h('div', { class: 'at-topic' }));
  const credits = creditBlock(panel);
  const countryFeatures = {
    50: feature(basemap, basemap.objects.countries50).features,
    '10a': feature(basemap, basemap.objects.countries10a).features,
  };
  let parts = []; // 주제를 바꿀 때 destroy 할 것들
  const keep = (x) => { parts.push(x); return x; };
  root.atlasUi = { map, tools, tip, viewer, nav }; // 확인용

  const blockTitle = (text) => h('h3', { class: 'ds-h2' }, text);
  const chartBox = (spec) => {
    const box = h('div', { class: 'at-card-chart' });
    keep(renderChart(box, spec));
    box.append(h('button', { class: 'ds-btn at-expand', type: 'button', title: '그래프 크게 보기', 'aria-label': '그래프 크게 보기', on: { click: () => viewer.show({ title: spec.title, chart: spec }) } }, icon('expand'), '크게 보기'));
    return box;
  };

  function showLayers(t, refs, card, legendBox) {
    for (const L of map.layers) if (L.id !== `markers-${t.id}`) map.removeLayer(L.id);
    for (const p of parts.filter((x) => x.isLegend)) p.destroy();
    parts = parts.filter((x) => !x.isLegend);
    const made = [];
    for (const ref of refs) {
      const L = layerFromRef(ref, layerData, { map, onPick: (f) => card.show({ title: f.properties.label || f.properties.name, text: ref.label }) });
      map.addLayer(L);
      made.push(L);
      if (L.legendItems?.length) {
        const lb = legendBlock(null, L.legend, L.legendItems, { ...L.meta, title: L.meta.legendTitle || L.meta.title, lineTitle: L.meta.lineLegendTitle, ready: L.ready });
        lb.isLegend = true;
        legendBox.append(lb.el);
        keep(lb);
      }
    }
    credits.update(made.map((L) => L.meta?.credit));
    const v = (t.views || []).find((x) => refs.some((r) => r.ref === x.layer || r.ref.endsWith(`-${x.id}`)));
    const b = refs.some((r) => r.type === 'flow') ? TRADE_BOUNDS : (v || t.view)?.bounds;
    if (b) map.fitBounds(b);
    root.atlasLayers = made; // 확인용
  }

  function showTopic(id) {
    parts.forEach((p) => p.destroy());
    parts = [];
    map.clearLayers();
    viewer.hide();
    body.replaceChildren();
    const t = topics.find((x) => x.id === id) || topics[0];
    nav.update(t.id);
    body.append(h('h2', { class: 'at-topic-title' }, t.title));
    const card = keep(detailCard(null, { onExpand: (sp) => viewer.show({ title: sp.title, chart: sp }) }));
    const legendBox = h('div', { class: 'at-legends' });

    // 레이어: 같은 이름끼리 묶어(인구 분포 = 밀도 음영 + 1억 명 막대) 고르기
    const groups = [];
    for (const ref of t.layers || []) {
      const g = groups.find((x) => x.label === (ref.label || ref.ref));
      if (g) g.refs.push(ref); else groups.push({ label: ref.label || ref.ref, refs: [ref] });
    }
    if (groups.length > 1) {
      const btns = groups.map((g, i) => h('button', {
        class: 'ds-seg-btn', type: 'button', 'aria-pressed': String(i === 0), title: g.label,
        on: { click: () => { btns.forEach((b, j) => b.setAttribute('aria-pressed', String(j === i))); showLayers(t, g.refs, card, legendBox); } },
      }, g.label));
      body.append(h('div', { class: 'ds-ctl' }, h('span', { class: 'ds-label' }, '지도'), h('div', { class: 'ds-seg at-seg-wrap' }, btns)));
    }
    if (t.views?.length && !groups.length) {
      body.append(h('div', { class: 'ds-ctl' }, h('span', { class: 'ds-label' }, '바로가기'),
        h('div', { class: 'ds-row' }, t.views.map((v) => h('button', { class: 'ds-btn', type: 'button', on: { click: () => map.fitBounds(v.bounds) } }, v.label)))));
    }
    body.append(legendBox, card.el);
    if (groups.length) showLayers(t, groups[0].refs, card, legendBox);
    else { credits.update([]); if (t.view?.bounds) map.fitBounds(t.view.bounds); }

    // 핀
    let pins = null;
    if (t.markers?.length) {
      pins = markerLayer(`markers-${t.id}`, t.markers, {
        map,
        onPick: (m) => card.show({ kicker: `${m.photo?.pin ?? ''}`, title: m.title, photo: m.photo, text: m.text, chart: m.chart ? charts[m.chart] : null, approx: m.approx }),
      });
      map.addLayer(pins);
    }

    // 퀴즈
    if (t.quiz?.type === 'coloring') {
      const layer = coloringLayer(countryFeatures);
      map.addLayer(layer);
      const q = keep(coloringQuiz(map, layer, t.quiz.countries));
      body.append(q.el);
      root.atlasQuiz = q;
    } else if (t.quiz?.type === 'heritage') {
      const q = keep(heritageQuiz(t.markers, { onFocus: (m) => pins?.select(m.id) }));
      body.append(h('h3', { class: 'ds-h2' }, '어느 나라·어느 종교?'), q.el);
      root.atlasQuiz = q;
    }

    // 사이드바 글·그래프·사진·원본 쪽
    for (const b of t.blocks || []) {
      if (b.type === 'text' || b.type === 'activity') {
        body.append(h('div', { class: `at-text at-text-${b.role || b.type}` },
          b.title ? blockTitle(b.title) : null, h('p', { class: 'at-card-text' }, b.text), b.credit ? h('p', { class: 'at-card-credit' }, b.credit) : null));
      } else if (b.type === 'chart' && charts[b.ref]) {
        body.append(h('div', { class: 'at-text' }, b.text ? h('p', { class: 'at-card-text' }, b.text) : null), chartBox(charts[b.ref]),
          b.note ? h('p', { class: 'at-card-credit' }, b.note) : null);
      } else if (b.type === 'photo') {
        const c = keep(detailCard(null));
        c.show({ title: b.title, photo: b.photo, text: b.text });
        body.append(c.el);
      } else if (b.type === 'card') {
        const c = keep(detailCard(null, { onExpand: (sp) => viewer.show({ title: sp.title, chart: sp }) }));
        c.show({ title: b.title, photo: b.photo, text: b.text, chart: b.chart ? charts[b.chart] : null, charts: (b.charts || []).map((r) => charts[r]).filter(Boolean) });
        body.append(c.el);
      } else if (b.type === 'page') {
        body.append(h('button', { class: 'ds-btn at-page-btn', type: 'button', on: { click: () => viewer.show({ url: b.url, page: b.page, title: b.title ? `${b.title} (교과서 ${b.page}쪽)` : `교과서 ${b.page}쪽`, bbox: b.bbox }) } },
          icon('page'), b.bbox ? `원본 쪽 보기 — ${b.title || '부분'} (${b.page}쪽)` : `원본 쪽 보기 (${b.page}쪽)`));
      }
    }
    root.atlasPins = pins; // 확인용
  }

  showTopic('general');
  root.atlasShowTopic = showTopic; // 확인용(캡처 스크립트)
  root.atlasCharts = charts;
  root.atlasImageUrl = imageUrl;
}
