// © 2026 김용현
// 사회과부도 Ⅲ 유럽(26~33쪽) — 단원 조각: 자료 정적 import + 유럽 선택값 → 공유 조립 mountAtlas(src/atlas/mountAtlas.js, 2단계 U3-9).
// 조립 순서(셸 → 지도 → 도구·범례 칸·말풍선·원본 쪽 보기 → 목차 → 주제 buildTopic)와 개발 매개변수(?topic=&proj=)·확인용 root.atlas*,
// destroy(지도 destroy 뒤 releaseNatural)는 mountAtlas 에.
// 규칙(EMBED_RULES.md): 자료는 정적 import(fetch 없음 — 그래서 import 는 단원 파일에), 사진·쪽·음영은 공개 Pages 절대 주소.
import { mountAtlas } from '../../src/atlas/mountAtlas.js';
import basemap from './data/basemap.json';
import places from './data/places.json';
import topics from './data/topics.json';
import charts from './data/charts.json';
import layerData from './data/layers.js';

// 주제별 바탕 색 기본값(지도 도구 「바탕」으로 바꿀 수 있음): 일반도 = 고도 색(교과서 26쪽 높이·깊이 색), 지형 = 자연색(교과서 28쪽
// Natural Earth 자연색 화상), 나머지 주제도 = 없음(주제 색이 잘 보이게) — 아시아와 같은 규칙
const BASE_COLOR = { general: 'tint', relief: 'natural' };
// 확대 창(insets)은 두지 않는다: 30쪽 소피아 앙티폴리스·베네치아는 사진 카드이고, 27쪽 색칠하기의 작은 나라(안도라·리히텐슈타인·모나코·
// 몰타·산마리노·바티칸·룩셈부르크)는 교과서도 확대 창 없이 ★·이름만 둔다. 대신 바티칸(최대 확대에서도 약 1px)·모나코(약 7px)처럼
// 나라 전체가 화면에서 8px 보다 작은 27쪽 나라는 반지름 7px 동그라미(수도 기호 네모를 둘러싸는 테)로 그려 칠하고 누를 수 있게 한다
// (U3-9 캡처 확인 — 계획 「실행 중 결정」).
const COLORING = { smallPx: 8 };

export default function mount(root) {
  return mountAtlas(root, {
    simId: 'atlas-u3-europe', basemap, places, topics, charts, layers: layerData,
    baseColor: BASE_COLOR, coloring: COLORING,
  });
}
