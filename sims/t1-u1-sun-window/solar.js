// © 2026 김용현
// 태양 위치 계산(순수 함수, DOM·three.js 없음 — Node 시험 가능).
// NOAA 태양 계산기(Meeus 『Astronomical Algorithms』 기반)와 같은 식: 율리우스 세기 → 태양 황경 → 적위·균시차 → 시간각 → 고도·방위각.
// 대기 굴절은 넣지 않는다(기하학적 고도). 방위각은 북쪽 0도에서 시계 방향(동 90, 남 180, 서 270).
const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;

/** UTC 밀리초 → 율리우스 일 */
export function julianDay(ms) {
  return ms / 86400000 + 2440587.5;
}

/** 율리우스 세기(J2000.0 기준)에서 적위(도)와 균시차(분) */
export function declEot(T) {
  const L0 = (280.46646 + T * (36000.76983 + T * 0.0003032)) % 360; // 평균 황경
  const M = 357.52911 + T * (35999.05029 - 0.0001537 * T); // 평균 근점 이각
  const e = 0.016708634 - T * (0.000042037 + 0.0000001267 * T); // 이심률
  const Mr = M * D2R;
  const C = Math.sin(Mr) * (1.914602 - T * (0.004817 + 0.000014 * T))
    + Math.sin(2 * Mr) * (0.019993 - 0.000101 * T) + Math.sin(3 * Mr) * 0.000289;
  const trueLong = L0 + C;
  const omega = 125.04 - 1934.136 * T;
  const lambda = trueLong - 0.00569 - 0.00478 * Math.sin(omega * D2R); // 겉보기 황경
  const eps0 = 23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60;
  const eps = eps0 + 0.00256 * Math.cos(omega * D2R); // 황도 경사
  const decl = Math.asin(Math.sin(eps * D2R) * Math.sin(lambda * D2R)) * R2D;
  const y = Math.tan((eps / 2) * D2R) ** 2;
  const L0r = L0 * D2R;
  const eot = 4 * R2D * (y * Math.sin(2 * L0r) - 2 * e * Math.sin(Mr) + 4 * e * y * Math.sin(Mr) * Math.cos(2 * L0r)
    - 0.5 * y * y * Math.sin(4 * L0r) - 1.25 * e * e * Math.sin(2 * Mr));
  return { decl, eot };
}

/**
 * 태양 위치.
 * @param {number} ms UTC 밀리초
 * @param {number} lat 위도(도, 북 +)
 * @param {number} lon 경도(도, 동 +)
 * @returns {{alt:number, az:number, decl:number, eot:number}} 고도·방위각·적위(도), 균시차(분)
 */
export function sunPosition(ms, lat, lon) {
  const T = (julianDay(ms) - 2451545) / 36525;
  const { decl, eot } = declEot(T);
  const utcMin = ((ms % 86400000) + 86400000) % 86400000 / 60000;
  let tst = (utcMin + eot + 4 * lon) % 1440; // 진태양시(분)
  if (tst < 0) tst += 1440;
  const ha = tst / 4 - 180; // 시간각(도), 정오 0
  const latR = lat * D2R, dR = decl * D2R, haR = ha * D2R;
  const cosZ = Math.min(1, Math.max(-1, Math.sin(latR) * Math.sin(dR) + Math.cos(latR) * Math.cos(dR) * Math.cos(haR)));
  const zen = Math.acos(cosZ);
  const alt = 90 - zen * R2D;
  // 방위각: 동쪽 성분, 북쪽 성분에서 atan2
  const east = -Math.cos(dR) * Math.sin(haR);
  const north = Math.cos(latR) * Math.sin(dR) - Math.sin(latR) * Math.cos(dR) * Math.cos(haR);
  let az = Math.atan2(east, north) * R2D;
  if (az < 0) az += 360;
  return { alt, az, decl, eot };
}

/** 고도·방위각(도) → 해 쪽을 가리키는 단위 벡터 {e, n, u} (동, 북, 위) */
export function sunVector(alt, az) {
  const a = alt * D2R, z = az * D2R;
  return { e: Math.cos(a) * Math.sin(z), n: Math.cos(a) * Math.cos(z), u: Math.sin(a) };
}

/** 그해 몇째 날(1 = 1월 1일)과 그 지역 시각(분)을 UTC 밀리초로. tzHours = UTC 와의 시차(시간) */
export function localToUtc(year, dayOfYear, localMin, tzHours) {
  return Date.UTC(year, 0, dayOfYear, 0, 0) + (localMin - tzHours * 60) * 60000;
}

/** 그해 몇째 날 → {month(1~12), day} */
export function dayToMonthDay(year, dayOfYear) {
  const d = new Date(Date.UTC(year, 0, dayOfYear));
  return { month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

/** 월, 일 → 그해 몇째 날 */
export function monthDayToDay(year, month, day) {
  return Math.round((Date.UTC(year, month - 1, day) - Date.UTC(year, 0, 1)) / 86400000) + 1;
}
