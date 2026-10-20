// © 2026 김용현
// scripts/atlas/geo_util.mjs — 아틀라스 Node 단계가 함께 쓰는 작은 도구: 이름 열쇠, 대권 거리, 중앙값, Natural Earth 인구 지점 색인
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolveUnit } from './unit.mjs';

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

/** 저장소 루트(이 파일 기준 ../..). */
export const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** JSON 파일 읽기. */
export const readJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));

/** 소수 nd 자리 반올림. */
export const round = (v, nd) => { const k = 10 ** nd; return Math.round(v * k) / k; };

/** 내용이 다를 때만 임시 파일 → 이름 바꾸기로 쓴다(원자적). 썼으면 true. */
export function writeIfChanged(f, text) {
  if (fs.existsSync(f) && fs.readFileSync(f, 'utf8') === text) return false;
  const tmp = `${f}.tmp`;
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, f);
  return true;
}

// ── 평면(경위도) 점-다각형 ──────────────────────────────────────────────────
/** 고리 [[lon,lat]…] 안인가(짝수–홀수 규칙). */
export function inRing(p, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
const polysOf = (g) => (g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : []);
/** Polygon·MultiPolygon 안인가(구멍 빼고). */
export function contains(geom, p) {
  return polysOf(geom).some(([outer, ...holes]) => inRing(p, outer) && !holes.some((h) => inRing(p, h)));
}
/** 도형 꼭짓점까지 가장 짧은 거리(km) — 면 밖 점의 가까운 면 찾기용 어림. */
export function nearKm(geom, p) {
  let best = Infinity;
  for (const poly of polysOf(geom)) for (const ring of poly) for (const v of ring) best = Math.min(best, km(p, v));
  return best;
}

// ── 낡은 산출물 검사: 입력 내용 해시(도장) — atlas_common.stamp_hash 와 같은 값 ─────────────
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
/** 정렬 키·공백 없는 JSON(_ 로 시작하는 설명 키는 뺌). */
export function canonJson(o) {
  if (Array.isArray(o)) return `[${o.map(canonJson).join(',')}]`;
  if (o && typeof o === 'object') {
    return `{${Object.keys(o).filter((k) => !k.startsWith('_')).sort().map((k) => `${JSON.stringify(k)}:${canonJson(o[k])}`).join(',')}}`;
  }
  return JSON.stringify(o);
}
/** '@work/…' = 작업 폴더, '@unit/…' = 단원 작업 폴더(u2 는 작업 폴더 그대로, 새 단원은 units/<id> — unit.mjs workFile), 나머지 = 저장소 기준. */
export const stampPath = (p) => (p.startsWith('@work/') ? `${WORK}/${p.slice(6)}`
  : p.startsWith('@unit/') ? resolveUnit().workFile(p.slice(6)) : path.join(REPO, p));
/** 도장 이름 → 입력 해시. unit = 단원 설정 전체(sections 를 찾을 곳). */
export function stampHash(unit, name) {
  const spec = unit.content.stamps[name];
  if (!spec) throw new Error(`도장 설정 없음: ${name}`);
  const lines = [];
  for (const p of spec.files ?? []) { const f = stampPath(p); lines.push(`${p}\t${fs.existsSync(f) ? sha(fs.readFileSync(f)) : '없음'}`); }
  for (const s of spec.sections ?? []) lines.push(`${s}\t${sha(Buffer.from(canonJson(s.split('.').reduce((o, k) => o[k], unit)), 'utf8'))}`);
  return sha(Buffer.from(lines.join('\n'), 'utf8'));
}
