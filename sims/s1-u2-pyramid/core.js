// © 2026 김용현
// 인구 피라미드 비교: 순수 계산부(DOM 없음). Node 시험(tests/s1-u2-pyramid)과 굽기 스크립트(scripts/s1-u2-pyramid)도 이 파일을 쓴다.
//
// 자료 한 묶음(set) = { years:[…], unit, regions:[{ id, name, d }] }
//   d 는 정수 열을 글자로 압축한 문자열. 한 해 = 남자 21칸(0-4 … 95-99, 100+) + 여자 21칸 = 42칸, 해 순서대로 이어 붙임.
//   값 = 사람 수 ÷ unit (UN 은 100명 단위, 주민등록은 1명 단위). 없는 해는 모든 칸이 -1.

export const AGES = ['0-4', '5-9', '10-14', '15-19', '20-24', '25-29', '30-34', '35-39', '40-44', '45-49', '50-54',
  '55-59', '60-64', '65-69', '70-74', '75-79', '80-84', '85-89', '90-94', '95-99', '100+'];
export const NA = AGES.length; // 21
export const PER_YEAR = NA * 2; // 42

// 64 글자: 앞 32 글자 = 마지막 자리(5비트), 뒤 32 글자 = 이어지는 자리(5비트 + 계속)
const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const IDX = new Int8Array(128).fill(-1);
for (let i = 0; i < ALPHA.length; i++) IDX[ALPHA.charCodeAt(i)] = i;

/** 0 이상 정수 하나 → 글자들 (큰 자리부터). -1(없음)은 0 으로 쓰고 +1 밀어서 구분 */
function encOne(v) {
  let n = v + 1; // -1 → 0
  if (!Number.isInteger(n) || n < 0) throw new Error(`encode: 정수가 아님 ${v}`);
  const digits = [];
  do { digits.push(n & 31); n = Math.floor(n / 32); } while (n > 0);
  let s = '';
  for (let i = digits.length - 1; i >= 0; i--) s += ALPHA[i === 0 ? digits[i] : digits[i] + 32];
  return s;
}

/** 정수 배열(각 값 -1 이상) → 압축 문자열 */
export function encodeInts(arr) {
  let s = '';
  for (const v of arr) s += encOne(v);
  return s;
}

/** 압축 문자열 → Int32Array */
export function decodeInts(str) {
  const out = [];
  let n = 0;
  for (let i = 0; i < str.length; i++) {
    const k = IDX[str.charCodeAt(i)];
    if (k < 0) throw new Error(`decode: 알 수 없는 글자 ${str[i]}`);
    if (k >= 32) n = n * 32 + (k - 32);
    else { out.push(n * 32 + k - 1); n = 0; }
  }
  return Int32Array.from(out);
}

/** 지역 한 곳의 한 해 → { male:[21], female:[21] } (사람 수). 그 해 자료가 없으면 null */
export function yearSlice(ints, yearIndex, unit = 1) {
  const o = yearIndex * PER_YEAR;
  if (o + PER_YEAR > ints.length || ints[o] < 0) return null;
  const male = new Array(NA), female = new Array(NA);
  for (let i = 0; i < NA; i++) { male[i] = ints[o + i] * unit; female[i] = ints[o + NA + i] * unit; }
  return { male, female };
}

export function total(p) {
  let t = 0;
  for (let i = 0; i < p.male.length; i++) t += p.male[i] + p.female[i];
  return t;
}

/** 사람 수 → 전체 인구 대비 비율(%) */
export function toShares(p) {
  const t = total(p) || 1;
  return { male: p.male.map((v) => (v / t) * 100), female: p.female.map((v) => (v / t) * 100) };
}

/** 단위에 맞는 값: 'share' 면 %, 'count' 면 사람 수 */
export function valuesFor(p, mode) {
  return mode === 'share' ? toShares(p) : { male: p.male.slice(), female: p.female.slice() };
}

/**
 * 두 해 차이. a = 이전(흐린 막대), b = 이후(진한 막대), 같은 단위의 값.
 * 연령대·성별마다 { a, b, delta: b - a, common: min, more: B 가 넘친 길이, less: B 가 모자란 길이 }
 */
export function diffBands(a, b) {
  const side = (xa, xb) => xa.map((va, i) => {
    const vb = xb[i];
    return { a: va, b: vb, delta: vb - va, common: Math.min(va, vb), more: Math.max(vb - va, 0), less: Math.max(va - vb, 0) };
  });
  return { male: side(a.male, b.male), female: side(a.female, b.female) };
}

/** 가로축 끝값: 가장 긴 막대보다 조금 큰 '보기 좋은' 수 */
export function niceMax(v) {
  if (!(v > 0)) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * p >= v * 1.02) return m * p;
  return 10 * p;
}

/** 눈금 간격: 끝값을 3~6 칸으로 */
export function tickStep(max) {
  const p = Math.pow(10, Math.floor(Math.log10(max)));
  for (const m of [0.1, 0.2, 0.25, 0.5, 1, 2, 2.5, 5, 10]) { const s = m * p; if (max / s <= 6) return s; }
  return max;
}

/** 차이 글자: 비율은 %p 한 자리, 사람 수는 만/천 단위로 짧게 */
export function fmtDelta(d, mode) {
  const sign = d > 0 ? '+' : d < 0 ? '-' : '';
  const x = Math.abs(d);
  if (mode === 'share') return `${sign}${x.toFixed(1)}%p`;
  return sign + fmtCount(x);
}

export function fmtCount(x) {
  if (x >= 1e8) return `${(x / 1e8).toFixed(x >= 1e9 ? 0 : 1)}억`;
  if (x >= 1e4) return `${(x / 1e4).toFixed(x >= 1e6 ? 0 : 1)}만`;
  if (x >= 1e3) return `${(x / 1e3).toFixed(1)}천`;
  return String(Math.round(x));
}

/** 인구 구조 요약(%): 0~14, 15~64, 65+ */
export function structure(p) {
  const t = total(p) || 1;
  let y = 0, w = 0, o = 0;
  for (let i = 0; i < p.male.length; i++) {
    const v = p.male[i] + p.female[i];
    if (i < 3) y += v; else if (i < 13) w += v; else o += v;
  }
  return { young: (y / t) * 100, work: (w / t) * 100, old: (o / t) * 100, total: t };
}

/**
 * 맨 위 칸 합치기: band 번째 칸(예 17 = 85-89)부터 위를 모두 더해 'band 세 이상' 한 칸으로.
 * 옛 주민등록 자료(85세 이상이 한 칸)와 요즘 자료를 같은 칸으로 견주려고 쓴다. 결과 길이 = band + 1.
 */
export function collapseTop(p, band) {
  if (band >= NA - 1) return { male: p.male.slice(), female: p.female.slice() };
  const one = (arr) => { const out = arr.slice(0, band + 1); for (let i = band + 1; i < arr.length; i++) out[band] += arr[i]; return out; };
  return { male: one(p.male), female: one(p.female) };
}

/** 칸 이름: 마지막 칸은 'n세 이상' 꼴(+) */
export function ageLabels(n) {
  return AGES.slice(0, n).map((a, i) => (i === n - 1 ? `${i * 5}+` : a));
}
