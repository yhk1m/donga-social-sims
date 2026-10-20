// © 2026 김용현
// 사회과부도 Ⅱ 아시아(16~25쪽) — 단원 조각: 자료 정적 import + 아시아 선택값 → 공유 조립 mountAtlas(src/atlas/mountAtlas.js, 2단계 G4).
// 조립 순서(셸 → 지도 → 도구·범례 칸·말풍선·원본 쪽 보기 → 목차 → 주제 buildTopic)와 개발 매개변수(?topic=&proj=)·확인용 root.atlas* 는 mountAtlas 에.
// 규칙(EMBED_RULES.md): 자료는 정적 import(fetch 없음 — 그래서 import 는 단원 파일에), 사진·쪽·음영은 공개 Pages 절대 주소.
import { mountAtlas } from '../../src/atlas/mountAtlas.js';
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
// 주제별 바탕 색 기본값(지도 도구 「바탕」으로 바꿀 수 있음): 일반도 = 고도 색(교과서 16·18·19쪽 높이·깊이 색), 지형 = 자연색(교과서 20쪽
// Natural Earth 자연색 화상), 나머지 주제도 = 없음(주제 색이 잘 보이게)
const BASE_COLOR = { general: 'tint', relief: 'natural' };
// 작은 위치도(교과서 22쪽 카슈미르 지도 오른쪽 위의 인도 위치도) — 레이어의 type 'locator' 면(분쟁 지역)을 분홍으로
const LOCATORS = { 'layer-p22-kashmir': { bounds: [60, 5, 99, 38], names: { PAK: '파키스탄', IND: '인도' }, title: '인도 위치 — 분홍이 카슈미르' } };

export default function mount(root) {
  return mountAtlas(root, {
    simId: 'atlas-u2-asia', basemap, places, topics, charts, layers: layerData,
    insets: INSETS, boundsOf: BOUNDS_OF, centerLonOf: CENTER_LON_OF, baseColor: BASE_COLOR, locators: LOCATORS,
  });
}
