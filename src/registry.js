// © 2026 김용현
// 자료 목록. 새 자료를 만들면 여기에 한 줄 추가한다.
// page 는 교과서 인쇄 쪽수(PDF 쪽수 아님).
export const BOOKS = [
  { id: 's1', title: '중학 사회 ①' },
  { id: 's2', title: '중학 사회 ②' },
  { id: 't1', title: '고등 통합사회 1' },
  { id: 't2', title: '고등 통합사회 2' },
  { id: 'atlas', title: '중학 사회과 부도' },
];

export const SIMS = [
  { id: 's1-u1-sunlight', book: 's1', unit: 'Ⅰ. 지역의 다양성', page: 9, title: '위도별 태양 에너지 — 레이저 비유', kind: '3D' },
  { id: 't1-u5-channelization', book: 't1', unit: 'Ⅴ. 생활공간과 사회', page: 124, title: '하천 직강화와 범람', kind: '3D' },
  { id: 't1-u5-metro', book: 't1', unit: 'Ⅴ. 생활공간과 사회', page: 124, title: '대도시권 형성 과정', kind: '3D' },
  { id: 't1-u5-traffic', book: 't1', unit: 'Ⅴ. 생활공간과 사회', page: null, title: '시간대별 도로 통행 속도', kind: '지도' },
  { id: 't1-u5-extinction', book: 't1', unit: 'Ⅴ. 생활공간과 사회', page: null, title: '지방 소멸 위험 카토그램', kind: '지도' },
  { id: 't1-u5-ballast', book: 't1', unit: 'Ⅴ. 생활공간과 사회', page: 138, title: '선박 평형수와 외래 생물종', kind: '3D' },
  { id: 's1-u5-tnc', book: 's1', unit: 'Ⅴ. 아메리카', page: 94, title: '초국적 기업의 발달 과정', kind: '지도' },
  { id: 's1-u6-garbage-patch', book: 's1', unit: 'Ⅵ. 오세아니아와 극지방', page: 108, title: '태평양 거대 쓰레기 지대의 형성', kind: '지도' },
  { id: 's1-u6-northeast-route', book: 's1', unit: 'Ⅵ. 오세아니아와 극지방', page: 113, title: '북동 항로와 기존 항로 비교', kind: '지도' },
  { id: 's1-u6-arctic-claims', book: 's1', unit: 'Ⅵ. 오세아니아와 극지방', page: 115, title: '북극 영유권 주장', kind: '지도' },
  { id: 'atlas-u2-asia', book: 'atlas', unit: 'Ⅱ. 아시아', page: 16, title: '사회과부도 아시아', kind: '지도' },
];
