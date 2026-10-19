// © 2026 김용현
// src/atlas/topic.js — 주제 하나를 지도·범례·사이드바에 펼치기(Task E1).
//
//   const t = buildTopic({ map, stage, body, viewer, credits, tip, topic, charts, layers, countryFeatures, insets, boundsOf, seed })
//     map      렌더러(createMap)            stage   무대(확대 창을 띄울 곳)
//     body     사이드바 안 주제 칸(요소 — 주제를 바꿀 때마다 비우고 다시 채움)
//     viewer   pageViewer(원본 쪽·그래프 크게 보기)   credits creditBlock(레이어 출처)   tip tooltip(확대 창 말풍선)
//     topic    topics.json 항목              charts  charts.json(id → spec)   layers layers.js 묶음(ref → 자료)
//     countryFeatures  색칠하기 나라 도형({ '50': [...], '10a': [...] })
//     insets   { 레이어 ref: 바탕 윤곽 GeoJSON } — 그 레이어는 큰 지도 대신 무대 위 확대 창(symbolInset)에 그리고, 큰 지도에는 위치 상자만
//     boundsOf { 레이어 ref: [w, s, e, n] } — 그 레이어를 고를 때 맞출 범위(교역 흐름선처럼 주제 view 밖까지 가는 것)
//     tint     이 주제의 고도 색 기본값(일반도·지형 = true — 교과서처럼 높이·깊이 색, 주제도는 false — 주제 색이 잘 보이게). 주제를 펼칠 때
//              map.setOptions({ tint }) 로 맞추고, 켜져 있고 고도 색 자료가 붙었으면 사이드바에 고도 색 범례(tintLegendBlock)를 보인다
//              (지도 도구 「고도 색」으로 바꾸면 범례도 따라감 — map.on('options')).
//     locators { 레이어 ref: {bounds, names, title} } — 그 레이어를 고르면 무대에 작은 위치도(locatorInset — 레이어의 type 'locator' 면을 강조,
//              바탕은 countryFeatures['50']). 카슈미르 = 인도 위치도(교과서 22쪽 오른쪽 위).
//     centerLonOf { 레이어 ref: 중심 경도 } — 그 레이어를 고를 때 지도 중심 경도(교역 = 150, 교과서도 태평양 중심 밀러). 묶음을 떠나면 되돌린다
//              (그사이 사용자가 중심 경도를 바꿨으면 그대로 둔다).
//   → { topic, groups, showGroup(i), group, pins, quiz, layers, inset, card, destroy() }
//
// 순서: 1 map.clearLayers() → 2 레이어 묶음(같은 label = 한 지도: 인구 분포 = 밀도 음영 + 1억 명 막대)의 첫 묶음을 layerFromRef 로 올리고
// 범례 블록(legendBlock) → 3 핀(markerLayer, 누르면 상세 카드) → 4 사이드바 블록(text·activity·chart·photo·card·page) → 5 보기 맞추기
// (묶음에 딸린 view, 없으면 주제 view) → 6 퀴즈(coloring·heritage).
// 주제를 바꿀 때는 destroy() — 레이어(렌더러가 레이어 destroy 를 부름)·범례·카드·그래프·퀴즈·확대 창·구독을 모두 푼다. 목차·지도 도구는 부르는 쪽 것이라 그대로.
import { h, icon } from '../shared/dom.js';
import { markerLayer } from './layers.js';
import { layerFromRef } from './layerRef.js';
import { legendBlock, detailCard, tintLegendBlock } from './ui.js';
import { renderChart, barPicker, isMultiBar } from './charts.js';
import { coloringLayer, coloringQuiz, heritageQuiz } from './quiz.js';
import { symbolInset, insetBoxLayer, geoBox, insetAvoidOffset, locatorInset } from './inset.js';
import { segButtons } from './seg.js';

/** 레이어 묶음: 같은 label 의 레이어는 한 지도(함께 올림). [{ label, refs }] */
export function layerGroups(topic) {
  const groups = [];
  for (const ref of topic.layers || []) {
    const label = ref.label || ref.ref;
    const g = groups.find((x) => x.label === label);
    if (g) g.refs.push(ref); else groups.push({ label, refs: [ref] });
  }
  return groups;
}

/** 묶음에 딸린 바로가기(view): view.layer 가 묶음의 ref 이거나, ref 가 「-<view id>」로 끝나면(layer-p22-singapore ↔ singapore). */
export function groupView(topic, group) {
  return (topic.views || []).find((v) => group.refs.some((r) => r.ref === v.layer || r.ref.endsWith(`-${v.id}`))) || null;
}

/** 묶음 보기 범위: boundsOf(레이어별 지정) → 딸린 view → 주제 view */
export function groupBounds(topic, group, boundsOf = {}) {
  for (const r of group?.refs || []) if (boundsOf[r.ref]) return boundsOf[r.ref];
  return (group && groupView(topic, group))?.bounds || topic.view?.bounds || null;
}

export function buildTopic({
  map, stage = null, body, viewer = null, credits = null, tip = null, topic, charts = {}, layers: layerData = {}, countryFeatures = null,
  insets = {}, boundsOf = {}, centerLonOf = {}, locators = {}, tint = false, seed = undefined,
}) {
  const parts = [];            // 주제가 끝날 때 destroy 할 사이드바 부품(카드·그래프·퀴즈)
  let groupParts = [];         // 묶음을 바꿀 때 destroy 할 것(범례 블록·확대 창·지도에 안 올린 레이어)
  let groupLayerIds = [];      // 묶음을 바꿀 때 지도에서 내릴 레이어 id
  let made = [], cur = -1, pins = null, quiz = null, inset = null, alive = true, centerRestore = null; // centerRestore: {from, to}
  const keep = (x) => { parts.push(x); return x; };
  const expand = (spec) => viewer?.show({ title: spec.title, chart: spec });

  map.clearLayers();
  viewer?.hide();
  body.replaceChildren();
  body.append(h('h2', { class: 'at-topic-title' }, topic.title));

  const card = keep(detailCard(null, { onExpand: expand }));
  const legendBox = h('div', { class: 'at-legends' });
  const groups = layerGroups(topic);

  // ---- 지도 고르기(묶음이 둘 이상) ----
  const groupSeg = groups.length > 1
    ? segButtons(groups.map((g, i) => [i, g.label, g.label]), { onPick: (i) => showGroup(i), label: '지도 고르기', className: 'at-seg-wrap', btnClass: 'at-group-btn' })
    : null;
  if (groupSeg) body.append(h('div', { class: 'ds-ctl at-topic-maps' }, h('span', { class: 'ds-label' }, '지도'), groupSeg.el));
  // ---- 바로가기(묶음이 없는 주제의 view — 일반도 아시아·동아시아·동남아시아) ----
  if (topic.views?.length && !groups.length) {
    body.append(h('div', { class: 'ds-ctl' }, h('span', { class: 'ds-label' }, '바로가기'),
      h('div', { class: 'ds-row at-topic-views' }, topic.views.map((v) => h('button', { class: 'ds-btn', type: 'button', on: { click: () => goView(v) } }, v.label)))));
  }
  // 고도 색: 주제 기본값으로 맞추고, 켜져 있고 자료가 붙었을 때만 범례
  const tintBox = tintLegendBlock(null, { note: '높이 자료: ETOPO 2022(NOAA), 단계와 색은 교과서 16쪽 범례' });
  const syncTint = () => tintBox.show(!!(map.options?.tint && map.tintReady));
  map.setOptions?.({ tint: !!tint });
  let offTint = null;
  try { offTint = map.on('options', syncTint); } catch { offTint = null; } // 옵션 알림이 없는 지도(시험용)면 처음 값만
  syncTint();
  body.append(legendBox, tintBox.el, card.el);

  function goView(v) {
    const gi = groups.findIndex((g) => groupView(topic, g) === v);
    if (gi >= 0) showGroup(gi);
    else if (v?.bounds) map.fitBounds(v.bounds);
  }

  function clearGroup() {
    if (centerRestore && map.view?.centerLon === centerRestore.to) map.setCenterLon(centerRestore.from);
    centerRestore = null;
    for (const id of groupLayerIds) map.removeLayer(id); // 렌더러가 레이어 destroy(범례·hover 구독 풀기)를 부른다
    groupLayerIds = [];
    groupParts.forEach((p) => p.destroy());
    groupParts = [];
    inset = null;
    made = [];
  }

  /** i 번째 묶음을 지도에 올린다(앞 묶음은 내림). 핀·색칠하기 레이어는 그대로. */
  function showGroup(i, { fit = true } = {}) {
    const g = groups[i];
    if (!alive || !g) return;
    clearGroup();
    cur = i;
    groupSeg?.set(i);
    for (const ref of g.refs) {
      const outline = insets[ref.ref];
      // 확대 창 레이어는 큰 지도에 올리지 않으므로 map 구독도 하지 않는다(범례는 창이 구독)
      const L = layerFromRef(ref, layerData, {
        map: outline ? null : map,
        onPick: (f) => card.show({ title: f.properties.label || f.properties.name, text: ref.label }),
      });
      made.push(L);
      if (outline) {
        groupParts.push({ destroy: () => L.destroy?.() });
        const d = layerData[ref.ref];
        inset = symbolInset(stage || body, {
          outline, points: d, legend: L.legend, legendItems: L.legendItems,
          title: `${L.meta.title}(확대)`, credit: L.meta.credit, approx: L.meta.approx, approxNote: L.meta.approxNote, approxReason: L.meta.approxReason, tip,
        });
        groupParts.push(inset);
        const vl = groupView(topic, g)?.label; // 상자 글자: 「싱가포르 확대 창」(상자가 지명 장애물이라 그 자리 지명이 빠지므로 이름을 함께)
        const box = insetBoxLayer(`${ref.ref}:box`, geoBox(outline, 0.02), { onClick: () => inset?.show(), label: vl ? `${vl} 확대 창` : '확대 창' });
        map.addLayer(box);
        groupLayerIds.push(box.id);
      } else {
        map.addLayer(L);
        groupLayerIds.push(L.id);
      }
      const loc = locators[ref.ref];
      if (loc && L.locator && countryFeatures?.['50']) {
        groupParts.push(locatorInset(stage || body, { ...loc, countries: countryFeatures['50'], highlight: L.locator }));
      }
      if (L.legendItems?.length) {
        const lb = legendBlock(null, L.legend, L.legendItems, {
          ...L.meta, title: L.meta.legendTitle || L.meta.title, lineTitle: L.meta.lineLegendTitle, ready: L.ready,
        });
        legendBox.append(lb.el);
        groupParts.push(lb);
      }
    }
    credits?.update(made.map((L) => L.meta?.credit));
    const c = g.refs.map((r) => centerLonOf[r.ref]).find((v) => v != null);
    if (c != null && map.view && map.view.centerLon !== c) { centerRestore = { from: map.view.centerLon, to: c }; map.setCenterLon(c); }
    if (fit) {
      const b = groupBounds(topic, g, boundsOf);
      // 확대 창이 떠 있으면 위치 상자가 창 밑에 깔리지 않게 창이 없는 쪽으로 옮겨 맞춘다
      const offset = inset ? insetAvoidOffset(stage?.getBoundingClientRect?.(), inset.el.getBoundingClientRect?.()) : null;
      if (b) map.fitBounds(b, offset ? { offset } : undefined);
    }
  }

  // ---- 1·2 레이어 ----
  if (groups.length) showGroup(0);
  else { credits?.update([]); if (topic.view?.bounds) map.fitBounds(topic.view.bounds); }

  // ---- 3 핀 ----
  if (topic.markers?.length) {
    pins = markerLayer(`markers-${topic.id}`, topic.markers, {
      map,
      onPick: (m) => card.show({
        kicker: `${m.photo?.pin ?? ''}`, title: m.title, photo: m.photo, text: m.text,
        chart: m.chart ? charts[m.chart] : null, approx: m.approx,
      }),
    });
    map.addLayer(pins);
  }

  // ---- 6 퀴즈(사이드바에서 블록보다 위 — 활동이 먼저 보이게) ----
  if (topic.quiz?.type === 'coloring' && countryFeatures) {
    const layer = coloringLayer(countryFeatures);
    map.addLayer(layer);
    quiz = keep(coloringQuiz(map, layer, topic.quiz.countries, seed !== undefined ? { seed } : {}));
    body.append(quiz.el);
  } else if (topic.quiz?.type === 'heritage') {
    quiz = keep(heritageQuiz(topic.markers || [], { ...(seed !== undefined ? { seed } : {}), onFocus: (m) => pins?.select(m.id) }));
    body.append(h('h3', { class: 'ds-h2' }, '어느 나라·어느 종교?'), quiz.el);
  }

  // ---- 4 사이드바 블록 ----
  const viewOf = (id) => (topic.views || []).find((v) => v.id === id) || null;
  const viewBtn = (b) => {
    const v = b.view ? viewOf(b.view) : null;
    if (!v) return null;
    return h('button', { class: 'ds-btn at-view-btn', type: 'button', title: `지도: ${v.label}`, on: { click: () => goView(v) } }, icon('globe'), `지도에서 보기 — ${v.label}`);
  };
  for (const b of topic.blocks || []) {
    if (b.type === 'text' || b.type === 'activity') {
      // 바로가기에 딸린 글(view)에는 「지도에서 보기」 — 부제(subtitle)는 바로 위 글과 같은 바로가기라 빼고
      body.append(h('div', { class: `at-text at-text-${b.role || b.type}` },
        b.title ? h('h3', { class: 'ds-h2' }, b.title) : null,
        h('p', { class: 'at-card-text' }, b.text),
        b.credit ? h('p', { class: 'at-card-credit' }, b.credit) : null,
        b.role === 'subtitle' ? null : viewBtn(b)));
    } else if (b.type === 'chart' && charts[b.ref]) {
      const spec = charts[b.ref];
      if (b.text) body.append(h('div', { class: 'at-text' }, h('p', { class: 'at-card-text' }, b.text)));
      const box = h('div', { class: 'at-card-chart' });
      if (isMultiBar(spec)) keep(barPicker(box, spec, { onExpand: expand }));
      else {
        keep(renderChart(box, spec));
        box.append(h('button', { class: 'ds-btn at-expand', type: 'button', title: '그래프 크게 보기', 'aria-label': '그래프 크게 보기', on: { click: () => expand(spec) } }, icon('expand'), '크게 보기'));
      }
      body.append(box);
      if (b.note) body.append(h('p', { class: 'at-card-credit' }, b.note));
    } else if (b.type === 'photo') {
      const c = keep(detailCard(null));
      c.show({ title: b.title, photo: b.photo, text: b.text });
      body.append(c.el);
    } else if (b.type === 'card') {
      const c = keep(detailCard(null, { onExpand: expand }));
      c.show({ title: b.title, photo: b.photo, text: b.text, chart: b.chart ? charts[b.chart] : null, charts: (b.charts || []).map((r) => charts[r]).filter(Boolean) });
      body.append(c.el);
    } else if (b.type === 'page') {
      body.append(h('button', {
        class: 'ds-btn at-page-btn', type: 'button',
        on: { click: () => viewer?.show({ url: b.url, page: b.page, title: b.title ? `${b.title} (교과서 ${b.page}쪽)` : `교과서 ${b.page}쪽`, bbox: b.bbox }) },
      }, icon('page'), b.bbox ? `원본 쪽 보기 — ${b.title || '부분'} (${b.page}쪽)` : `원본 쪽 보기 (${b.page}쪽)`));
    }
  }

  function destroy() {
    if (!alive) return;
    alive = false;
    offTint?.();
    tintBox.destroy();
    clearGroup();
    for (let i = parts.length - 1; i >= 0; i--) parts[i].destroy();
    parts.length = 0;
    map.clearLayers();   // 핀·색칠하기 레이어 destroy(렌더러)
    viewer?.hide();
    tip?.hide();
    body.replaceChildren();
    pins = null; quiz = null;
  }

  return {
    topic, groups, showGroup, card, destroy,
    get group() { return cur; },
    get pins() { return pins; },
    get quiz() { return quiz; },
    get layers() { return [...made]; },
    get inset() { return inset; },
    get alive() { return alive; },
  };
}
