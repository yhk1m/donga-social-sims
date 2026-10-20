// © 2026 김용현
// 사회과부도 Ⅳ 아프리카(34~39쪽) — 단원 조각: 자료 정적 import + 아프리카 선택값 → 공유 조립 mountAtlas(src/atlas/mountAtlas.js, 2단계 U4-9).
// 조립 순서(셸 → 지도 → 도구·범례 칸·말풍선·원본 쪽 보기 → 목차 → 주제 buildTopic)와 개발 매개변수(?topic=&proj=)·확인용 root.atlas*,
// destroy(지도 destroy 뒤 releaseNatural)는 mountAtlas 에.
// 규칙(EMBED_RULES.md): 자료는 정적 import(fetch 없음 — 그래서 import 는 단원 파일에), 사진·쪽·음영은 공개 Pages 절대 주소.
import { mountAtlas } from '../../src/atlas/mountAtlas.js';
import { installExtraCharts } from '../../src/atlas/chartsExtra.js';
import basemap from './data/basemap.json';
import places from './data/places.json';
import topics from './data/topics.json';
import charts from './data/charts.json';
import layerData from './data/layers.js';

// 아프리카에서 처음 쓰는 그래프·레이어(사이드바 고리 그래프 pie+ring·원 크기 줄 bubbleRow, 지도 위 고리 기호 chartSymbols)는 등록 길(U4-3 —
// 부르지 않는 아시아·유럽 조각에서는 rollup 이 털어 냄). mountAtlas 보다 먼저 불러야 38쪽 자원 고리·39쪽 녹지 원이 그려진다.
installExtraCharts();

// 주제별 바탕 색 기본값(지도 도구 「바탕」으로 바꿀 수 있음): 일반도 = 고도 색(교과서 34쪽 높이·깊이 색), 지형 = 자연색(교과서 36쪽
// Natural Earth 자연색 화상), 나머지 주제도 = 없음(주제 색이 잘 보이게) — 아시아·유럽과 같은 규칙
const BASE_COLOR = { general: 'tint', relief: 'natural' };
// 38쪽 태양광 잠재력은 세계 지도(교과서도 태평양 중심 밀러, 중심 약 145°E) — 묶음을 고르면 중심 경도 150, 떠나면 되돌림(아시아 24쪽 교역과 같은 꼴)
const CENTER_LON_OF = { 'layer-p38-solar': 150 };
// 묶음 보기 범위(주제 view 대신 — U4-9 캡처):
//   태양광 = 교과서 지도 틀처럼 서아프리카 서쪽 끝(약 20°W)부터 브라질 동쪽 끝(약 34°W, 날짜변경선 건넘)까지 — 틀을 되돌린 바로가기 범위
//            [-5.8, …, 293.7]은 서쪽 끝이 세네갈·모리타니를 잘랐다.
//   자원 = 지도 틀(작은 아프리카)만이 아니라 둘레 바다의 고리 7(서 −23°·동 62°, 원판 반지름까지)도 들게 — 1024 에서는 오른쪽 고리 둘이 화면 밖이었다.
const BOUNDS_OF = { 'layer-p38-solar': [-20, -47, -34, 62], 'layer-p38-resource-charts': [-30, -42, 68, 38] };
// 35쪽 색칠하기 작은 나라: 감비아(가늘고 김)·카보베르데·코모로·세이셸(흩어진 섬)은 나라 상자가 커서 상자 기준(유럽)으로는 동그라미가 안 생긴다
// → 가장 큰 조각의 화면 넓이 제곱근이 16px 보다 작으면 동그라미(U4-3e 넓이 기준). 확대 창(insets)은 두지 않는다 — 교과서 35쪽도 확대 창 없이
// 이름만 쓰고, 동그라미로 처음 보기에서 칠하고 누를 수 있다(U4-9 캡처 확인 — 계획 「실행 중 결정」).
const COLORING = { smallPx: 16, smallMetric: 'area' };

export default function mount(root) {
  return mountAtlas(root, {
    simId: 'atlas-u4-africa', basemap, places, topics, charts, layers: layerData,
    boundsOf: BOUNDS_OF, centerLonOf: CENTER_LON_OF, baseColor: BASE_COLOR, coloring: COLORING,
  });
}
