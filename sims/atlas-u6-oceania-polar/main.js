// © 2026 김용현
// 사회과부도 Ⅵ 오세아니아와 극지방(48~55쪽) — 단원 조각: 자료 정적 import + 오세아니아·극지방 선택값 → 공유 조립 mountAtlas(src/atlas/mountAtlas.js, 2단계 U6-9).
// 조립 순서(셸 → 지도 → 도구·범례 칸·말풍선·원본 쪽 보기 → 목차 → 주제 buildTopic)와 개발 매개변수(?topic=&proj=)·확인용 root.atlas*,
// destroy(지도 destroy 뒤 releaseNatural)는 mountAtlas 에. 보기 도구 몫(viewTools — 지구본·극 중심)만 이 파일이 잇고 푼다.
// 규칙(EMBED_RULES.md): 자료는 정적 import(fetch 없음 — 그래서 import 는 단원 파일에), 사진·쪽·음영은 공개 Pages 절대 주소.
import { mountAtlas } from '../../src/atlas/mountAtlas.js';
import { installExtraCharts } from '../../src/atlas/chartsExtra.js';
import { installAmericasExtras } from '../../src/atlas/americasExtra.js';
import { installPolarExtras, viewTools } from '../../src/atlas/polarExtra.js';
import basemap from './data/basemap.json';
import places from './data/places.json';
import topics from './data/topics.json';
import charts from './data/charts.json';
import layerData from './data/layers.js';

// 등록 길(부르지 않는 u2~u5 조각에서는 rollup 이 털어 냄) — 셋 다 mountAtlas 보다 먼저, 이 차례로:
//   installExtraCharts()    54쪽 원그래프 2(사이드바·카드 원그래프 — 아프리카 것 그대로)
//   installAmericasExtras() 지구본 보기(지도 도구 도법 고르기 상자의 6번째 「지구본」 — mapTools 가 상자를 만들 때 PROJECTIONS 를 한 번 읽으므로
//                           뒤에 부르면 옵션이 없음), 경로 화살표 pathFlow(55쪽 북극 항로·아라온호·54쪽 해류), 우리나라 윤곽 compareOutline(48쪽),
//                           기호 + 글자 symbolLabels(기지·도시·자원·번호)
//   installPolarExtras()    극 중심 보기(상자 7·8번째 「북극 중심」·「남극 중심」 — 교사 Q6, 옵션 8), 주제 보기 레이어 topicView(태평양 중심·극 묶음),
//                           영유권 경계선 sectorLines(55쪽), 두 축 선·반원 그래프(54쪽), 지구본·극 뒷면 글자 숨김(symbolLabels 다시 등록),
//                           경로 화살표 묶음 바탕(pathFlow 다시 등록 — 55쪽 지구본 셋 자연색, 교사 Q16)
// 안 부르면 원그래프·지구본·윤곽·극 중심·영유권 선이 「모르는 …」·「그래프를 그리지 못했습니다」(시험으로 고정).
installExtraCharts();
installAmericasExtras();
installPolarExtras();

// 주제별 바탕 색 기본값(지도 도구 「바탕」으로 바꿀 수 있음): 일반도 세 장(48·50·51쪽) = 고도 색, 지형 = 자연색(교과서 52쪽 Natural Earth
// 자연색 화상), 나머지 주제도 = 없음(주제 색이 잘 보이게). 55쪽 지구본 묶음 셋(북극 항로·아라온호 둘)은 경로 자료 view.base 가 자연색으로(Q16).
const BASE_COLOR = { general: 'tint', arctic: 'tint', antarctic: 'tint', relief: 'natural' };
// 태평양 중심(교사 Q2): 묶음 레이어가 있는 주제는 묶음을 고르면 중심 경도, 떠나면 되돌림(키 = 묶음 첫 레이어 ref — 레이어가 없는 일반도·색칠하기·
// 지형은 보기 레이어 topicView 가 150). 기후 셋·FTA·남극 조약 = 150(오스트레일리아·뉴질랜드 · 교과서 세계 지도 중심 약 150~170°E),
// 쓰레기 섬·해수면 = 180(바로가기 범위가 동쪽 248.5°·212° 까지 — 중심 150 이면 동쪽 끝이 지도 가장자리 330° 에 가까워 맞춤이 좁아짐, U6-8 임시 틀 확인).
const CENTER_LON_OF = {
  'layer-p53-climate': 150, 'layer-p53-jan': 150, 'layer-p53-jul': 150,
  'layer-p54-fta': 150, 'layer-p55-treaty': 150,
  'layer-p54-garbage': 180, 'layer-p54-sealevel': 180,
};
// 묶음 보기 범위(주제 view 대신 — U6-9 캡처, 계획 「실행 중 결정」 U6-9): 53쪽 기후 셋은 교과서 틀(동쪽 177.2°)대로면 뉴질랜드가 펼친
// 범례 칸(오른쪽 아래) 밑에 들어가 크라이스트처치 핀을 누를 수 없음(1440·1024) → 동쪽을 210°(날짜변경선 너머 태평양)까지 넓혀 오스트레일리아·
// 뉴질랜드를 범례 칸 왼쪽으로(1440 k 3.6 — 크라이스트처치 범례 칸까지 약 170px, 1024 도 핀이 칸 밖).
const CLIMATE = [111.39, -48.5, 210, -4.9];
const BOUNDS_OF = { 'layer-p53-climate': CLIMATE, 'layer-p53-jan': CLIMATE, 'layer-p53-jul': CLIMATE };
// 49쪽 색칠하기 섬나라(투발루·나우루·키리바시·마셜·팔라우·미크로네시아·사모아·통가 등): 가장 큰 조각의 화면 넓이 제곱근이 16px 보다 작으면
// 동그라미(아프리카·아메리카와 같은 넓이 기준) — 확대 창은 두지 않는다. 키리바시 동그라미 자리 = 수도 타라와 환초(가장 큰 조각 키리티마티섬
// 157°W 는 처음 보기 밖 — 49쪽 「ㅋㄹㅂㅅ」 글자도 길버트 제도 곁, U6-9 캡처에서 처음 보기 누르기 실패 → quiz.js markAt).
const COLORING = { smallPx: 16, smallMetric: 'area', markAt: { KIR: [173.0, 1.42] } };

export default function mount(root) {
  const atlas = mountAtlas(root, {
    simId: 'atlas-u6-oceania-polar', basemap, places, topics, charts, layers: layerData,
    boundsOf: BOUNDS_OF, centerLonOf: CENTER_LON_OF, baseColor: BASE_COLOR, coloring: COLORING,
  });
  // 특별 보기(지구본·북극 중심·남극 중심) ↔ 평면 전환 페이드·「중심 경도」 숨김·「세계 전체 보기」(americasExtra.globeTools 대신 — U6-3b)
  const offView = viewTools(root.atlasMap, root.atlasUi.tools.el);
  const destroy = () => { offView(); atlas.destroy(); };
  root.atlasDestroy = destroy;
  return { destroy };
}
