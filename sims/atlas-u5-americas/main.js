// © 2026 김용현
// 사회과부도 Ⅴ 아메리카(40~47쪽) — 단원 조각: 자료 정적 import + 아메리카 선택값 → 공유 조립 mountAtlas(src/atlas/mountAtlas.js, 2단계 U5-9).
// 조립 순서(셸 → 지도 → 도구·범례 칸·말풍선·원본 쪽 보기 → 목차 → 주제 buildTopic)와 개발 매개변수(?topic=&proj=)·확인용 root.atlas*,
// destroy(지도 destroy 뒤 releaseNatural)는 mountAtlas 에. 지구본 도구 몫(globeTools)만 이 파일이 잇고 푼다.
// 규칙(EMBED_RULES.md): 자료는 정적 import(fetch 없음 — 그래서 import 는 단원 파일에), 사진·쪽·음영은 공개 Pages 절대 주소.
import { mountAtlas } from '../../src/atlas/mountAtlas.js';
import { installExtraCharts } from '../../src/atlas/chartsExtra.js';
import { installAmericasExtras, globeTools } from '../../src/atlas/americasExtra.js';
import basemap from './data/basemap.json';
import places from './data/places.json';
import topics from './data/topics.json';
import charts from './data/charts.json';
import layerData from './data/layers.js';
import siliconValley from './data/inset-p47-hq-sv.json';
import './style.css'; // 이 단원만의 꾸밈(실리콘 밸리 확대 창 너비) — 공유 ui.css 뒤에 들어가게 import 끝에

// 등록 길(부르지 않는 아시아·유럽·아프리카 조각에서는 rollup 이 털어 냄) — 둘 다 mountAtlas 보다 먼저:
//   installExtraCharts()    46쪽 민족 고리 5(사이드바·카드 고리 그래프 pie+ring, 지도 위 고리 기호 chartSymbols — 아프리카 것 그대로)
//   installAmericasExtras() 평사·정사 도법, 지구본 보기(지도 도구 도법 고르기 상자의 6번째 「지구본」 — mapTools 가 상자를 만들 때
//                           PROJECTIONS 를 한 번 읽으므로 뒤에 부르면 옵션이 없음), 경로 화살표 pathFlow, 네모 단위 기호 unitSymbols,
//                           빗금 각도·고리 지시선 고리, 우리나라 윤곽 compareOutline, 기호 + 글자 symbolLabels
// 안 부르면 고리·지구본·윤곽·네모 기호가 「모르는 레이어 종류」·「그래프를 그리지 못했습니다」(시험으로 고정).
installExtraCharts();
installAmericasExtras();

// 주제별 바탕 색 기본값(지도 도구 「바탕」으로 바꿀 수 있음): 일반도 세 장(40·42·43쪽) = 고도 색, 지형 = 자연색(교과서 44쪽 Natural Earth
// 자연색 화상), 나머지 주제도 = 없음(주제 색이 잘 보이게) — 아시아·유럽·아프리카와 같은 규칙
const BASE_COLOR = { general: 'tint', north: 'tint', south: 'tint', relief: 'natural' };
// 47쪽 세계 지도 둘(본사·D사)은 교과서도 태평양 중심 밀러(중심 146.8°E — 동해·독도·이어도 글자) — 묶음을 고르면 중심 경도 150, 떠나면 되돌림
// (키 = 묶음 첫 레이어 ref, 아시아 24쪽 교역·아프리카 38쪽 태양광과 같은 꼴)
const CENTER_LON_OF = { 'layer-p47-hq': 150, 'layer-p47-agri-supply': 150 };
// 묶음 보기 범위(주제 view 대신 — U5-9 캡처): 세계 두 장 = 교과서 틀처럼 경도 한 바퀴(틀 끝 경선 약 −33°, 날짜변경선 건넘 e < w) ·
// 위도는 그린란드·아이슬란드 ~ 남아메리카 남쪽 끝·뉴질랜드까지. 바로가기 범위([−11.2, …, 329.6] — 틀 5~95%)는 아이슬란드·그린란드
// 동쪽을 자른다.
// 46쪽 중남미 민족 = 지도 틀(남아메리카)만이 아니라 둘레 바다의 고리 5(아르헨티나 고리 −48.7°, −42.6° 가 오른쪽 아래 범례 칸에 덮였다 —
// 1440 에서 −15px) 몫으로 동쪽·남쪽을 넓힘 → 1440 범례 칸까지 91px(1024 는 아직 가림 — 계획 「실행 중 결정」 U5-9).
const WORLD = [-32, -57, -34, 80];
const BOUNDS_OF = { 'layer-p47-hq': WORLD, 'layer-p47-agri-supply': WORLD, 'layer-p46-ethnic': [-120, -52, -12, 33] };
// 47쪽 실리콘 밸리 확대 창(교과서 삽입 틀 (−123.09, 36.86) ~ (−121.18, 38.20) — 윤곽 자료의 frame 점이 창 범위를 정함, U5-4) —
// 본사 묶음에서만(확대 창 레이어 p47-hq-sv 는 본사와 같은 묶음 이름)
const INSETS = { 'layer-p47-hq-sv': siliconValley };
// 41쪽 색칠하기 작은 나라(카리브 섬나라·엘살바도르·벨리즈): 가장 큰 조각의 화면 넓이 제곱근이 16px 보다 작으면 동그라미(아프리카와 같은 넓이 기준)
// — 카리브 확대 창은 두지 않는다(U5-9 캡처 — 계획 「실행 중 결정」).
const COLORING = { smallPx: 16, smallMetric: 'area' };

export default function mount(root) {
  const atlas = mountAtlas(root, {
    simId: 'atlas-u5-americas', basemap, places, topics, charts, layers: layerData,
    insets: INSETS, boundsOf: BOUNDS_OF, centerLonOf: CENTER_LON_OF, baseColor: BASE_COLOR, coloring: COLORING,
  });
  // 지구본 ↔ 평면 전환 페이드·「중심 경도」 숨김·지구본 「세계 전체 보기」(46쪽 인구 이동 묶음은 경로 자료 view 로 지구본을 연다)
  const offGlobe = globeTools(root.atlasMap, root.atlasUi.tools.el);
  const destroy = () => { offGlobe(); atlas.destroy(); };
  root.atlasDestroy = destroy;
  return { destroy };
}
