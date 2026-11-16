// © 2026 김용현
// 1952년 12월 런던 카운티(London Administrative County)의 날짜별 기록.
// 출처: London County Council, Report of the Medical Officer of Health for the year 1952, 153~154쪽
//   (Wellcome Library 「London's Pulse」 b18252965, 154~155번 화면). 날짜별 사망자 수는 이 보고서가
//   Logan, W. P. D. (1953) "Mortality in the London fog incident, 1952", The Lancet 1(6755): 336~338 에서 옮긴 것.
// deaths: 그날 카운티 안에서 일어난 사망(모든 원인), tempF: 큐(Kew)의 하루 평균 기온(°F),
// smoke: 카운티 홀 검은 연기(mg/m³, 측정 없는 날은 null; 8일 값은 6일 11시 30분부터 46시간 평균)
export const LONDON_1952 = [
  { day: 1, deaths: 112, tempF: 36.9, smoke: 0.30 },
  { day: 2, deaths: 140, tempF: 34.2, smoke: 0.49 },
  { day: 3, deaths: 143, tempF: 39.0, smoke: 0.61 },
  { day: 4, deaths: 120, tempF: 36.5, smoke: 0.49 },
  { day: 5, deaths: 196, tempF: 29.5, smoke: 2.64 },
  { day: 6, deaths: 294, tempF: 28.9, smoke: 3.45 },
  { day: 7, deaths: 513, tempF: 28.9, smoke: null },
  { day: 8, deaths: 518, tempF: 31.5, smoke: 4.46 },
  { day: 9, deaths: 430, tempF: 36.0, smoke: null },
  { day: 10, deaths: 274, tempF: 43.3, smoke: 1.22 },
];

export const WEEKDAY = { 1: '월', 2: '화', 3: '수', 4: '목', 5: '금', 6: '토', 7: '일', 8: '월', 9: '화', 10: '수' };

export const fToC = (f) => ((f - 32) * 5) / 9;
