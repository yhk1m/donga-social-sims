// © 2026 김용현
// 사회과부도 Ⅰ 세계화 시대, 지리의 힘(8~15쪽) — 단원 조각: 자료 정적 import + 세계화 선택값 → 공유 조립 mountAtlas(src/atlas/mountAtlas.js, 2단계 U1-9).
// 조립 순서·개발 매개변수(?topic=&proj=)·확인용 root.atlas*·destroy 는 mountAtlas 에. 보기 도구 몫(viewTools — 지구본·극 중심)만 이 파일이 잇고 푼다.
// 규칙(EMBED_RULES.md): 자료는 정적 import(fetch 없음 — 그래서 import 는 단원 파일에), 사진·쪽·음영·지구본 단추 그림은 공개 Pages 절대 주소.
import { mountAtlas } from '../../src/atlas/mountAtlas.js';
import { installAmericasExtras } from '../../src/atlas/americasExtra.js';
import { installPolarExtras, viewTools } from '../../src/atlas/polarExtra.js';
import { installWorldExtras } from '../../src/atlas/worldExtra.js';
import basemap from './data/basemap.json';
import places from './data/places.json';
import topics from './data/topics.json';
import charts from './data/charts.json';
import layerData from './data/layers.js';

// 등록 길(부르지 않는 u2~u6 조각에서는 rollup 이 털어 냄) — 셋 다 mountAtlas 보다 먼저, 이 차례로(뒤 등록이 이김):
//   installAmericasExtras() 지구본 보기(도법 상자 6번째 — mapTools 가 상자를 만들 때 PROJECTIONS 를 한 번 읽으므로 뒤에 부르면 옵션이 없음),
//                           기호 + 글자 symbolLabels(8쪽 우리나라 과학 기지)
//   installPolarExtras()    극 중심 보기(상자 7·8번째 — 교사 Q3, 옵션 8), 주제 보기 레이어 topicView(태평양 중심 — Q2), 뒷면 글자 숨김
//   installWorldExtras()    대륙·대양 면 continents · 맞히기 continentQuiz(+대양 단추 5) · 대륙 지구본 단추 continentGlobes(Q4) · 대권 노선 routeFan(Q10) ·
//                           색칠하기 도구 paintTool(Q15). 일반도의 continentGlobes `legend: false`(범례 블록 없음)는 installWorldExtras 가
//                           등록하는 레이어에서만 듣는다(worldGlobe.js — topic.js 는 legend:false 로도 블록을 만듦).
// 안 부르면 지구본·극 중심·topicView·노선·대륙·맞히기·단추·색칠하기 도구가 「모르는 …」(시험으로 고정).
installAmericasExtras();
installPolarExtras();
installWorldExtras();

// 세계 단원 바탕 지도는 10a 없이 110m·50m 만(설계 §7, config/u1.json basemap) — mountAtlas 는 countries10a 를 늘 읽으므로 빈 모음을 끼움
// (U1-3b 코디네이터 결정 ① — 공유 바이트 0. lod.pickDetail 은 unitBoxes 가 비면 10a 를 고르지 않음, countryClass·quiz 는 빈 10a 로 문제없음).
if (!basemap.objects.countries10a) basemap.objects.countries10a = { type: 'GeometryCollection', geometries: [] };

// 주제별 바탕 색 기본값(지도 도구 「바탕」으로 바꿀 수 있음): 일반도 = 고도 색, 지형 = 자연색(12쪽), 나머지 = 없음.
const BASE_COLOR = { general: 'tint', relief: 'natural' };
// 태평양 중심(교사 Q2 — 8~15쪽 세계 지도 13장 모두 중심 약 150°E): 묶음 레이어가 있는 주제는 묶음을 고르면 150, 떠나면 되돌림
// (키 = 묶음 첫 레이어 ref). 일반도·지형·주제도 활동은 보기 레이어(topicView·paintTool)가 150.
const CENTER_LON_OF = Object.fromEntries([
  'layer-p10-continents', 'layer-p13-climate', 'layer-p14-covid', 'layer-p14-routes',
  'layer-p14-internet', 'layer-p14-mobile', 'layer-p15-burger', 'layer-p15-korean',
].map((ref) => [ref, 150]));

export default function mount(root) {
  const atlas = mountAtlas(root, {
    simId: 'atlas-u1-world', basemap, places, topics, charts, layers: layerData,
    centerLonOf: CENTER_LON_OF, baseColor: BASE_COLOR,
  });
  // 특별 보기(지구본·북극 중심·남극 중심) ↔ 평면 전환 페이드·「중심 경도」 숨김·「세계 전체 보기」(americasExtra.globeTools 대신 — U6-3b)
  const offView = viewTools(root.atlasMap, root.atlasUi.tools.el);
  const destroy = () => { offView(); atlas.destroy(); };
  root.atlasDestroy = destroy;
  return { destroy };
}
