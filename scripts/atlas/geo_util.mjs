// © 2026 김용현
// scripts/atlas/geo_util.mjs — 아틀라스 Node 단계가 함께 쓰는 작은 도구: 이름 열쇠, 대권 거리, 중앙값, Natural Earth 인구 지점 색인
import fs from 'node:fs';

/** 작업 폴더(ASCII). env ATLAS_WORK, 기본 C:/Users/Public/atlas-work (슬래시로). */
export const WORK = (process.env.ATLAS_WORK || 'C:/Users/Public/atlas-work').replace(/\\/g, '/');

/** 경위도 맞추기 결과 파일 경로. */
export const fitPath = (id) => `${WORK}/geo/${id}.fit.json`;

/** fit 읽기. 없으면 무엇을 먼저 돌릴지 알려 주는 오류. */
export function loadFit(id) {
  const f = fitPath(id);
  if (!fs.existsSync(f)) throw new Error(`fit 파일 없음: ${f} (node scripts/atlas/georef-cli.mjs --all 먼저)`);
  return JSON.parse(fs.readFileSync(f, 'utf8'));
}

/** 이름 비교 열쇠: 공백 없앰(「고비 사막」 = 「고비사막」). */
export const key = (s) => String(s ?? '').replace(/\s+/g, '');

/** 대권 거리(km). a, b = [lon, lat]. */
export function km(a, b) {
  const R = 6371, r = Math.PI / 180, dLat = (b[1] - a[1]) * r, dLon = (b[0] - a[0]) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * r) * Math.cos(b[1] * r) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** 중앙값(빈 배열이면 NaN). 짝수 개면 위쪽 가운데 값. */
export function median(a) {
  const s = [...a].sort((x, y) => x - y);
  return s.length ? s[s.length >> 1] : NaN;
}

/** 오름차순 비교(NaN·Infinity 안전): 둘 다 같거나 비교할 수 없으면 0, NaN 은 뒤로. */
export function cmp(a, b) {
  const na = Number.isNaN(a), nb = Number.isNaN(b);
  if (na || nb) return na === nb ? 0 : na ? 1 : -1;
  return a < b ? -1 : a > b ? 1 : 0;
}

const neCache = new Map();
/** Natural Earth 10m 인구 지점: NAME_KO 열쇠 → box([경도 최소, 위도 최소, 경도 최대, 위도 최대]) 안 [{lon, lat, ne}] 목록.
 *  파일이 없으면 null. 같은 (파일, box)는 한 번만 읽는다. */
export function neIndex(file, box) {
  const ck = `${file}|${box}`;
  if (neCache.has(ck)) return neCache.get(ck);
  if (!fs.existsSync(file)) return null;
  const [x0, y0, x1, y1] = box, by = new Map();
  for (const f of JSON.parse(fs.readFileSync(file, 'utf8')).features) {
    const k = key(f.properties.NAME_KO), [lon, lat] = f.geometry.coordinates;
    if (!k || lon < x0 || lon > x1 || lat < y0 || lat > y1) continue;
    if (!by.has(k)) by.set(k, []); by.get(k).push({ lon, lat, ne: f.properties.NAME });
  }
  neCache.set(ck, by);
  return by;
}

/** 파일 수정 시각(ms), 없으면 -Infinity. */
export const mtime = (f) => (fs.existsSync(f) ? fs.statSync(f).mtimeMs : -Infinity);

/** outputs 가 하나라도 없거나 inputs 중 하나라도 outputs 의 가장 오래된 것보다 새로우면 true. */
export function stale(inputs, outputs) {
  const oldest = Math.min(...outputs.map(mtime));
  return !Number.isFinite(oldest) || inputs.some((f) => mtime(f) > oldest);
}
