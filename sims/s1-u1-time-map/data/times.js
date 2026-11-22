// © 2026 김용현
// 서울 → 도시별 수단 시간 표와 수단 설정.
// 원칙
//  - 서울~부산은 교과서(사회1 13쪽 자료2) 수치로 고정: 도보 약 30일, 자동차 약 5시간, KTX 약 2시간 30분, 비행기 약 1시간.
//  - 도보(교사 결정): 도로 거리 ÷ (서울~부산 도로 거리 ÷ 30일). 모든 도시에 같은 하루 이동 거리를 쓴다.
//  - 자동차: OSRM 경로 시간(roads.js)에 「교과서 5시간 ÷ OSRM 서울~부산 시간」을 곱해 맞춘다(막힘 없는 계산값을 교과서 기준에 맞춤).
//  - KTX: 시간표 최단 소요 시간(서울역, 용산역, 청량리역 출발 중 가장 빠른 값). est:true 는 확인 못 한 추정값.
//  - 비행기: 김포 출발 국내선 시간표 운항 시간.
//  - 갈아타기(2026-11-22 교사 요청 「지도가 직관적이지 않다」): KTX, 비행기 지도에서 역이나 공항이 없는 도시도
//    「그 수단으로 가장 알맞은 역(공항)까지 + 갈아타기 10분 + 자동차」로 시간을 셈한다. 자동차로 바로 가는 게 더 빠르면 자동차 시간.
//    역(공항)에서 도시까지 자동차 시간은 직선 거리 × 1.3(도로 굽음) ÷ 서울~부산 자동차 평균 속력으로 어림한다.
//    그래서 모든 도시가 시간을 가지고, 빈 도시 때문에 지도가 찌그러지지 않는다. 섬(제주, 서귀포)은 바다를 차로 건너지 않는다.
import ROADS from './roads.js';
import MAP from './map.js';

const BUSAN = { walk: 30 * 1440, car: 300, ktx: 150, air: 60 };

// KTX 최단 소요 시간(분). 출발역, 도착역, 출처와 확인한 날을 함께 적는다.
export const KTX = {
  // 출처: info.koreacharts.com 코레일 일별 열차 시간표(…/traintime/{출발역}/{도착역}/contents.html?date=2026-11-18), 2026-11-16 조회
  //       대전, 울산은 kr.trip.com 「서울역 출발 ○○ 행 ktx 시간표」(2026-11-16 조회)
  suwon: { min: 34, station: '수원' },
  cheonan: { min: 36, station: '천안아산' },
  cheongju: { min: 42, station: '오송' },
  daejeon: { min: 54, station: '대전' },
  daegu: { min: 98, station: '동대구' },
  gyeongju: { min: 121, station: '경주' },
  pohang: { min: 135, station: '포항' },
  ulsan: { min: 128, station: '울산(통도사)' },
  // 부산: 시간표 최단은 2시간 18분(2026-11-07)이지만 교과서 수치 2시간 30분으로 고정
  busan: { min: BUSAN.ktx, station: '부산', note: '교과서 수치(약 2시간 30분)' },
  changwon: { min: 163, station: '창원중앙' },
  jinju: { min: 202, station: '진주' },
  jeonju: { min: 88, station: '전주', note: '용산역 출발' },
  gwangju: { min: 96, station: '광주송정', note: '용산역 출발' },
  mokpo: { min: 146, station: '목포', note: '용산역 출발' },
  suncheon: { min: 146, station: '순천', note: '용산역 출발' },
  yeosu: { min: 168, station: '여수엑스포', note: '용산역 출발' },
  wonju: { min: 49, station: '원주', note: '청량리역 출발 KTX-이음' },
  andong: { min: 109, station: '안동', note: '청량리역 출발 KTX-이음' },
  chungju: { min: 66, station: '충주', note: '판교역 출발 KTX-이음' },
  gangneung: { min: 87, station: '강릉', note: '청량리역 출발' },
};
// 강릉선 KTX 개통(2017-12-22) 전: 청량리~강릉 무궁화호 약 5시간 47분
// 출처: 경향신문 2017-11-07 기사(https://www.khan.co.kr/article/201711071526001) 인용 수치. 기사 원문은 직접 열어 보지 못함
export const GANGNEUNG_BEFORE = { min: 347, station: '강릉', note: '개통 전: 무궁화호(청량리역 출발)' };

// 김포 출발 국내선 운항 시간(분)
export const AIR = {
  // 출처: 항공편 시간표 모음(flightstats, flightconnections, trip.com 항공편 현황 등)에서 읽은 예정 운항 시간(이륙 전후 지상 이동 포함), 2026-11-16 조회
  //       항공사 공식 시간표로 다시 맞춰 보지는 못함. 김포~광주는 아시아나 노선(2026-12-17 이후 바뀔 수 있음)
  busan: { min: BUSAN.air, airport: '김해', note: '교과서 수치(약 1시간)' },
  jeju: { min: 70, airport: '제주' },
  gwangju: { min: 60, airport: '광주' },
  yeosu: { min: 60, airport: '여수' },
  ulsan: { min: 60, airport: '울산' },
  pohang: { min: 60, airport: '포항경주' },
  jinju: { min: 65, airport: '사천' },
};

const ISLAND = new Set(['jeju', 'seogwipo']); // 자동차, 도보로 바로 갈 수 없음(바다)
export const TRANSFER_MIN = 10;  // 역, 공항에서 자동차로 갈아타는 시간
const DETOUR = 1.3;               // 직선 거리 → 도로 거리
const CITY = new Map(MAP.cities.map((c) => [c.id, c]));

/** 두 도시 사이 자동차 시간 어림(분). 섬과 뭍 사이는 null */
export function carBetween(a, b) {
  if (a === b) return 0;
  if (ISLAND.has(a) !== ISLAND.has(b)) return null;
  const A = CITY.get(a), B = CITY.get(b);
  const km = Math.hypot(A.x - B.x, A.y - B.y) * MAP.kmPerPx * DETOUR;
  const kmPerMin = ROADS.busan.km / BUSAN.car;
  return km / kmPerMin;
}

/** 표(역, 공항이 있는 도시)를 바탕으로 모든 도시의 「그 수단 + 자동차」 가장 빠른 시간을 셈한다 */
function withTransfer(table, car, unit) {
  const out = {};
  for (const id of Object.keys(ROADS)) {
    if (table[id]) { out[id] = { ...table[id] }; continue; }
    let best = null;
    for (const [hub, t] of Object.entries(table)) {
      const leg = carBetween(hub, id);
      if (leg == null) continue;
      const total = t.min + TRANSFER_MIN + leg;
      if (!best || total < best.min) best = { min: total, est: true, via: hub, note: `${CITY.get(hub).name}${unit}까지 간 다음 자동차로 갈아탐(어림)` };
    }
    const direct = car[id]?.min;
    if (direct != null && (!best || direct <= best.min)) best = { min: direct, byCar: true, note: '자동차로 바로 가는 편이 더 빨라요' };
    out[id] = best ?? { min: null };
  }
  return out;
}

const cache = new Map();
/** 수단별 시간 표: { 도시id: { min, est?, note?, km? } }. 갈 수 없으면 { min: null } */
export function timesFor(mode, { ktxAfter = true } = {}) {
  const key = mode + (ktxAfter ? '+' : '-');
  if (cache.has(key)) return cache.get(key);
  const out = {};
  const ids = Object.keys(ROADS);
  if (mode === 'car' || mode === 'walk') {
    const carK = BUSAN.car / ROADS.busan.min;
    const kmPerDay = ROADS.busan.km / 30;
    for (const id of ids) {
      if (ISLAND.has(id)) { out[id] = { min: null }; continue; }
      const r = ROADS[id];
      out[id] = mode === 'car' ? { min: r.min * carK, km: r.km } : { min: (r.km / kmPerDay) * 1440, km: r.km };
    }
    out.busan.min = BUSAN[mode];
  } else if (mode === 'ktx' || mode === 'air') {
    const table = mode === 'ktx' ? { ...KTX } : { ...AIR };
    if (mode === 'ktx' && !ktxAfter) table.gangneung = { ...GANGNEUNG_BEFORE };
    Object.assign(out, withTransfer(table, timesFor('car'), mode === 'ktx' ? '역' : ' 공항'));
  }
  cache.set(key, out);
  return out;
}

const hm = (j, step) => { const m = j * step, hh = Math.floor(m / 60), mm = m % 60; return hh ? (mm ? `${hh}시간 ${mm}분` : `${hh}시간`) : `${mm}분`; };
export const MODES = {
  real: { name: '실제', button: '실제 지도', icon: 'map', title: '실제 지도', sub: '거리 그대로 그린 지도. 동심원은 서울에서 100km 간격', busanMin: null, busanText: '약 325km',
    ringKm: 100, major: 1, labelEvery: 1, ringLabel: (j) => `${j * 100}km`, ringLegend: '동심원: 서울에서 100km 간격' },
  walk: { name: '도보', button: '걸어서', icon: 'walk', title: '걸어서 가는 시간 지도', sub: '모든 시간 지도와 같은 축척이라 아주 커요. 동심원은 1일(24시간) 간격', busanMin: BUSAN.walk, busanText: '약 30일',
    ringMin: 1440, major: 5, labelEvery: 5, ringLabel: (j) => `${j}일`, ringLegend: '동심원: 1일(24시간) 간격. 1시간 원은 너무 촘촘해서 하루마다 그렸어요' },
  car: { name: '자동차', button: '자동차', icon: 'car', title: '자동차로 가는 시간 지도', sub: '서울에서 오래 걸릴수록 멀리 그렸어요. 동심원은 1시간 간격', busanMin: BUSAN.car, busanText: '약 5시간',
    ringMin: 60, major: 1, labelEvery: 1, ringLabel: (j) => `${j}시간`, ringLegend: '동심원: 1시간 간격(모든 시간 지도가 같은 축척)' },
  ktx: { name: 'KTX', button: 'KTX', icon: 'train', title: 'KTX로 가는 시간 지도', sub: '자동차 지도와 같은 축척이라 지도가 줄어들어요. 동심원은 1시간 간격', busanMin: BUSAN.ktx, busanText: '약 2시간 30분',
    ringMin: 60, major: 1, labelEvery: 1, ringLabel: (j) => `${j}시간`, ringLegend: '동심원: 1시간 간격(모든 시간 지도가 같은 축척)' },
  air: { name: '비행기', button: '비행기', icon: 'plane', title: '비행기로 가는 시간 지도', sub: '김포 공항에서 뜨는 시간만 셌어요. 같은 축척이라 지도가 가장 작아요. 동심원은 1시간 간격', busanMin: BUSAN.air, busanText: '약 1시간',
    ringMin: 60, major: 1, labelEvery: 1, ringLabel: (j) => `${j}시간`, ringLegend: '동심원: 1시간 간격(모든 시간 지도가 같은 축척)' },
};

export const SOURCES = [
  '서울에서 부산까지 시간: 사회1 교과서 13쪽 자료2 수치',
  '자동차 시간과 도로 거리: OpenStreetMap 도로망, OSRM 경로 계산(2026년 11월). 교과서 서울에서 부산까지 5시간에 맞춰 비율을 고침',
  '도보 시간: 도로 거리를 하루에 걷는 거리(서울에서 부산까지 도로 거리를 30일로 나눈 값)로 나눔',
  'KTX 시간: 코레일 열차 시간표에서 가장 빠른 열차(2026년 11월 조사). 강릉선 개통 전 시간은 2017년 신문 기사 수치',
  '비행기 시간: 김포 공항 출발 국내선 시간표의 운항 시간(2026년 11월 조사)',
  '역이나 공항이 없는 도시: 가장 빠른 역(공항)까지 시간 + 갈아타기 10분 + 자동차 시간(직선 거리 × 1.3을 자동차 평균 속력으로 나눈 어림값)',
  '지도 경계: 통계청 SGIS 행정 경계 기반 자료(vuski/admdongkor)를 단순하게 다듬음',
];
