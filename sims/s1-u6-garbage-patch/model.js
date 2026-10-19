// © 2026 김용현
// 쓰레기 입자 모형: 해안에서 나온 쓰레기가 해류(+약한 수렴)를 따라 떠다니다 모이는 과정.
// 화면과 무관한 순수 계산 — 시간 단위는 '일'.
import { PATCH_E, PATCH_W } from './field.js';

// 쓰레기가 바다로 나오는 곳(바다 쪽으로 조금 떨어진 점). 경도는 0~360.
export const SOURCES = {
  asia: {
    name: '아시아 연안',
    pts: [
      [122.4, 17.0, '필리핀 루손섬'], [122.3, 24.2, '타이완'], [123.6, 28.6, '동중국해(중국·한국에서 흘러온 쓰레기)'],
      [131.6, 31.0, '일본 규슈'], [135.8, 33.3, '일본 오사카'], [140.4, 34.6, '일본 도쿄'], [141.9, 38.0, '일본 도호쿠'],
    ],
  },
  america: {
    name: '북아메리카 연안',
    pts: [
      [235.2, 46.2, '미국 컬럼비아강'], [236.9, 41.5, '미국 북캘리포니아'], [237.0, 37.6, '미국 샌프란시스코'],
      [240.9, 33.6, '미국 로스앤젤레스'], [243.9, 30.0, '멕시코 바하칼리포르니아'], [248.0, 22.4, '멕시코 서부'],
    ],
  },
};

const inEllipse = (p, lon, lat) => ((lon - p.lon) / p.rx) ** 2 + ((lat - p.lat) / p.ry) ** 2 <= 1;
export const inPatchE = (lon, lat) => inEllipse(PATCH_E, lon, lat);
export const inPatchW = (lon, lat) => inEllipse(PATCH_W, lon, lat);

const DIFF = 0.21; // 소용돌이(에디)에 의한 흩어짐: 하루 표준편차(도) — 약 23 km

// sample(lon, lat) → [경도/일, 위도/일] (field.js 의 makeSampler 결과)
export function createModel(isLand, sample, seed = 7) {
  let rnd = seed;
  const rand = () => ((rnd = (rnd * 16807) % 2147483647) / 2147483647);
  const gauss = () => { let u = 0; while (u === 0) u = rand(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand()); };

  const M = {
    parts: [], // {lon, lat, age, state:0 떠다님 1 해안 2 범위 밖, c: 색 번호, src}
    day: 0,
    beached: 0,
    rand,
  };

  M.reset = () => { M.parts = []; M.day = 0; M.beached = 0; rnd = seed; };

  M.release = (srcKey, n, tracked = false) => {
    const src = SOURCES[srcKey];
    for (let i = 0; i < n; i++) {
      const [lon, lat] = src.pts[Math.floor(rand() * src.pts.length)];
      const p = { lon: lon + gauss() * 0.25, lat: lat + gauss() * 0.2, age: 0, state: 0, c: Math.floor(rand() * 5), src: srcKey, tracked };
      if (isLand(p.lon, p.lat)) { p.lon = lon; p.lat = lat; }
      M.parts.push(p);
    }
    return M.parts[M.parts.length - 1];
  };

  /** dtDay 일만큼 진행(내부에서 1일 이하로 쪼갬) */
  M.step = (dtDay) => {
    const n = Math.max(1, Math.ceil(dtDay / 1));
    const h = dtDay / n;
    const sd = DIFF * Math.sqrt(h);
    const sdT = sd * 0.35; // 따라가는 쓰레기는 길이 잘 보이도록 흩어짐을 줄임
    for (let s = 0; s < n; s++) {
      for (const p of M.parts) {
        if (p.state !== 0) continue;
        // 중점법(RK2)
        const [a1, b1] = sample(p.lon, p.lat);
        const mlon = p.lon + a1 * h * 0.5, mlat = p.lat + b1 * h * 0.5;
        const [a2, b2] = sample(mlon, mlat);
        const d = p.tracked ? sdT : sd;
        const nlon = p.lon + a2 * h + gauss() * d / Math.cos(p.lat * Math.PI / 180);
        const nlat = p.lat + b2 * h + gauss() * d;
        p.age += h;
        if (isLand(nlon, nlat)) {
          // 갓 나온 쓰레기는 해안을 따라 미끄러지게, 오래 떠다닌 쓰레기는 일정 확률로 해안에 밀려옴
          if (p.age > 120 && rand() < 0.02 * h) { p.state = 1; M.beached++; }
          continue;
        }
        p.lon = nlon; p.lat = nlat;
        if (p.lat < -8 || p.lat > 66 || p.lon < 105 || p.lon > 262) p.state = 2;
      }
    }
    M.day += dtDay;
  };

  M.counts = () => {
    let floating = 0, e = 0, w = 0, out = 0;
    for (const p of M.parts) {
      if (p.state === 0) {
        floating++;
        if (inPatchE(p.lon, p.lat)) e++; else if (inPatchW(p.lon, p.lat)) w++;
      } else if (p.state === 2) out++;
    }
    return { total: M.parts.length, floating, e, w, beached: M.beached, out };
  };

  return M;
}
