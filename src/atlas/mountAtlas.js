// © 2026 김용현
// src/atlas/mountAtlas.js — 사회과부도 단원 조각 조립(2단계 G4, 1단계 sims/atlas-u2-asia/main.js 본문을 옮김):
// 셸 → 지도(createMap) → 음영·고도 색 → 지도 도구·자연색(늦게)·범례 칸·말풍선·원본 쪽 보기 → 목차 → 주제 칸·출처 → 주제(buildTopic).
// 주제를 바꾸면 이전 주제(topic.js 가 만든 레이어·범례·카드·그래프·퀴즈·확대 창)를 destroy 하고 새로 펼친다. 목차·도구·출처 줄은 그대로.
// 단원 main.js 는 자료 정적 import(fetch 금지) + 단원 선택값만 넘긴다:
//   mountAtlas(root, { simId, basemap, places, topics, charts, layers, insets, boundsOf, centerLonOf, baseColor, locators, unitBoxes, coloring }) → { destroy }
//   insets      {레이어 ref: 바탕 윤곽 GeoJSON} — 무대 위 확대 창으로 그릴 레이어
//   boundsOf    {레이어 ref: [w, s, e, n]} — 묶음 보기 범위(주제 view 밖일 때)
//   centerLonOf {레이어 ref: 중심 경도} — 묶음을 고르면 그 중심(태평양 중심 등)
//   baseColor   {주제 id: 'tint'|'natural'|'none'} — 주제별 바탕 색 기본값(없으면 'none')
//   locators    {레이어 ref: {bounds, names, title}} — 작은 위치도
//   unitBoxes   10a 상세 상자(기본 basemap.meta.unitBoxes)
//   coloring    {smallPx, smallMetric?, markAt?} — 색칠하기에서 화면 상자(smallMetric 'area' 면 가장 큰 조각 넓이의 제곱근)가 smallPx 보다 작은 나라를 동그라미로 그리고 누를 수 있게(quiz.js coloringLayer, 없으면 0)
// 규칙(EMBED_RULES.md): DOM 은 h() 로만, 검색은 root 안에서만, 사진·쪽·음영은 공개 Pages 절대 주소.
import { feature } from 'topojson-client';
import { createShell, addBlock } from '../shared/shell.js';
import { h } from '../shared/dom.js';
import { createMap } from './renderer.js';
import { attachRelief } from './relief.js';
import { attachTint } from './tint.js';
import { attachNatural, lazyNatural, releaseNatural } from './natural.js';
import { topicNav, mapTools, pageViewer, tooltip, creditBlock, legendPanel } from './ui.js';
import { buildTopic } from './topic.js';

export function mountAtlas(root, {
  simId, basemap, places, topics, charts, layers,
  insets = {}, boundsOf = {}, centerLonOf = {}, baseColor = {}, locators = {}, unitBoxes = basemap.meta.unitBoxes, coloring = {},
}) {
  const { stage, panel } = createShell(root, simId);
  const map = createMap(stage, { basemap, places, unitBoxes });
  attachRelief(map).then((d) => { root.atlasRelief = d; }); // 공개 Pages 의 음영 이미지(실패하면 음영 없이 그대로)
  attachTint(map).then((d) => { root.atlasTint = d; });     // 공개 Pages 의 고도 색 분류 화상(실패하면 고도 색 없이 그대로)

  const tools = mapTools(stage, map);
  // 자연색 화상(1 MB)은 처음 자연색을 켤 때 불러온다 — 그동안 「자연색」 단추는 바쁨(aria-busy), 실패하면 앞 바탕으로 되돌리고 도구에 알림 한 줄
  // (다음에 다시 켜면 다시 시도)
  const natural = lazyNatural(map, {
    attach: (m) => attachNatural(m).then((d) => { root.atlasNatural = d; return d; }),
    onState: (st) => tools.setBaseState('natural', st),
  });
  // 범례는 무대 오른쪽 아래 떠 있는 칸 하나(접기·끌어 옮기기 — 옮긴 자리는 주제를 바꿔도 그대로, 교사 요청 2026-10-20)
  const legends = legendPanel(stage);
  const tip = tooltip(stage, { map });
  const viewer = pageViewer(stage);
  const nav = topicNav(panel, topics, (id) => show(id));
  const body = addBlock(panel, h('div', { class: 'at-topic' }));
  const credits = creditBlock(panel);
  const countryFeatures = {
    50: feature(basemap, basemap.objects.countries50).features,
    '10a': feature(basemap, basemap.objects.countries10a).features,
  };

  let current = null;
  function show(id) {
    const topic = topics.find((t) => t.id === id) || topics[0];
    current?.destroy();
    nav.update(topic.id);
    current = buildTopic({
      map, stage, body, viewer, credits, tip, topic, charts, layers, countryFeatures, insets, boundsOf, centerLonOf, locators, legendPanel: legends, baseColor: baseColor[topic.id] || 'none', coloring,
    });
    root.atlasTopic = current; // 확인용(헤드리스 캡처)
    return current;
  }

  let first = topics[0].id;
  if (import.meta.env?.DEV) {
    // 개발 미리보기 전용(조각 빌드에서는 DEV 가 false 로 접혀 없어짐): ?topic=<id>&proj=<도법> — E2 대조표 캡처용
    const q = new URLSearchParams(root.ownerDocument?.defaultView?.location?.search || '');
    if (q.get('proj')) map.setProjection(q.get('proj'));
    if (topics.some((t) => t.id === q.get('topic'))) first = q.get('topic');
  }
  show(first);

  // 확인용(헤드리스 캡처·성능 측정): 지도·부품·주제 바꾸기
  root.atlasMap = map;
  root.atlasUi = { map, tools, tip, viewer, nav, credits, legends };
  root.atlasShowTopic = show;
  root.atlasCharts = charts;

  /** 조각을 떼어 낼 때(개발 미리보기·시험용): 주제·구독·도구·지도를 모두 푼다 */
  function destroy() {
    current?.destroy(); current = null;
    natural.destroy();
    tools.destroy(); legends.destroy(); tip.destroy(); viewer.destroy(); nav.destroy(); credits.destroy();
    map.destroy();
    releaseNatural(); // 캐시한 자연색 화소(약 32MB)도 놓아줌
  }
  root.atlasDestroy = destroy;
  return { destroy };
}
