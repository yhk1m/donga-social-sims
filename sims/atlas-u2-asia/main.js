// © 2026 김용현
// 사회과부도 Ⅱ 아시아(16~25쪽) — 조각 조립(Task E1): 셸 → 지도(createMap) → 지도 도구·말풍선·원본 쪽 보기 → 목차 → 주제(buildTopic).
// 주제를 바꾸면 이전 주제(topic.js 가 만든 레이어·범례·카드·그래프·퀴즈·확대 창)를 destroy 하고 새로 펼친다. 목차·도구·출처 줄은 그대로.
// 규칙(EMBED_RULES.md): DOM 은 h() 로만, 검색은 root 안에서만, 자료는 정적 import(fetch 없음), 사진·쪽·음영은 공개 Pages 절대 주소.
import { feature } from 'topojson-client';
import { createShell, addBlock } from '../../src/shared/shell.js';
import { h } from '../../src/shared/dom.js';
import { createMap } from '../../src/atlas/renderer.js';
import { attachRelief } from '../../src/atlas/relief.js';
import { attachTint } from '../../src/atlas/tint.js';
import { attachNatural, lazyNatural, releaseNatural } from '../../src/atlas/natural.js';
import { topicNav, mapTools, pageViewer, tooltip, creditBlock, legendPanel } from '../../src/atlas/ui.js';
import { buildTopic } from '../../src/atlas/topic.js';
import basemap from './data/basemap.json';
import places from './data/places.json';
import topics from './data/topics.json';
import charts from './data/charts.json';
import layerData from './data/layers.js';
import singaporeOutline from './data/inset-p22-singapore.json';

// 교역 흐름선(24쪽 주제도 활동, 세계 지도 쪽): 상대국이 아메리카까지라 주제 view 밖 — 날짜변경선을 건너는 범위
const BOUNDS_OF = { 'layer-p24-trade': [55, -45, -60, 72] };
const CENTER_LON_OF = { 'layer-p24-trade': 150 }; // 교과서 24쪽 교역 지도도 태평양 중심(밀러) — 미국행 흐름선이 지도 끝에서 끊기지 않게
// 무대 위 확대 창으로 그릴 레이어(큰 지도에서는 섬이 30px 남짓이라 기호 76개가 겹침) → 바탕 윤곽
const INSETS = { 'layer-p22-singapore': singaporeOutline };
// 작은 위치도(교과서 22쪽 카슈미르 지도 오른쪽 위의 인도 위치도) — 레이어의 type 'locator' 면(분쟁 지역)을 분홍으로
// 주제별 바탕 색 기본값(지도 도구 「바탕」으로 바꿀 수 있음): 일반도 = 고도 색(교과서 16·18·19쪽 높이·깊이 색), 지형 = 자연색(교과서 20쪽
// Natural Earth 자연색 화상), 나머지 주제도 = 없음(주제 색이 잘 보이게)
const BASE_COLOR = { general: 'tint', relief: 'natural' };
const LOCATORS = { 'layer-p22-kashmir': { bounds: [60, 5, 99, 38], names: { PAK: '파키스탄', IND: '인도' }, title: '인도 위치 — 분홍이 카슈미르' } };

export default function mount(root) {
  const { stage, panel } = createShell(root, 'atlas-u2-asia');
  const map = createMap(stage, { basemap, places, unitBoxes: basemap.meta.unitBoxes });
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
      map, stage, body, viewer, credits, tip, topic, charts, layers: layerData, countryFeatures, insets: INSETS, boundsOf: BOUNDS_OF, centerLonOf: CENTER_LON_OF, locators: LOCATORS, legendPanel: legends, baseColor: BASE_COLOR[topic.id] || 'none',
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
