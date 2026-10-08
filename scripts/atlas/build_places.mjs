// © 2026 김용현
// scripts/atlas/build_places.mjs — 일반도(16·18·19쪽) 글자 → 지명(경위도·등급·종류) <config.out>/places.json, 찾아보기 대조
//   node scripts/atlas/build_places.mjs [--extract] [--verify]
//   설정: scripts/atlas/config/u2.json 의 places (maps·overview·rankBySize·rankAdjust·regionalRankPenalty·dedupKm·decimals·indexExclude)
//   1. python -I scripts/atlas/places.py → $ATLAS_WORK/text/places-<map>.json(지면 pt) + $ATLAS_WORK/tables/index.json
//      (파일이 없거나 --extract 면 다시 뽑는다)
//   2. 지도마다 makeConverter(fit).invert: 점 지명은 기호 위치, 그 밖은 글자 중심과 글자 줄(path).
//      역변환이 안 되는 지명은 빼고 경고로 남긴다.
//   3. 이름: 공백만 다른 찾아보기 지명이 있으면 찾아보기 표기(16~19쪽 항목 우선)를 쓴다.
//   4. 합치기: 같은 이름·같은 종류 묶음(수도·도시는 한 묶음)이 dedupKm(점 point / 그 밖 area) 안이면 하나로.
//      위치 = 가장 큰 축척 지도(점은 기호 있는 것 우선, 나라·큰 지물은 개관도), rank = 개관도(overview) 글자 크기 단계 + rankAdjust,
//      개관도에 없으면 지역도 단계 + regionalRankPenalty (1~6으로 자름). size·page 는 위치를 준 글자.
//   4b. 옮겨 그린 기호 바로잡기(snapToNe): 바탕 지도가 실제 지리라, 교과서가 겹치지 않게 옮겨 그린 도시 기호(에르데네트·냐짱 등)는
//      Natural Earth 위치로 옮기고 snapped: {from, km} 로 남긴다(설정 snapKm, keepTextbookPosition).
//   5. inIndex = 찾아보기에 16~19쪽 참조가 있는 지명. 찾아보기의 16~19쪽 지명이 없으면(indexExclude 제외) 누락 목록을 출력.
//   출력 항목: {name, lon, lat, rank, kind, size, page, symbol?: [lon,lat], path?: [[lon,lat]...], angle?, en?, alt?, elev?, snapped?, inIndex}
//   --verify: 지명을 같은 fit 으로 지면에 되돌려 교과서 렌더와 겹친 그림 $ATLAS_WORK/shots/c2/<map>.png
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { makeConverter } from './georef.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..', '..');
const WORK = (process.env.ATLAS_WORK || 'C:/Users/Public/atlas-work').replace(/\\/g, '/');
const CONFIG_FILE = process.env.ATLAS_UNIT_CONFIG || path.join(here, 'config', 'u2.json');
const PY = process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
const VERIFY_DPI = 200;

const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
const PC = config.places;
const maps = Object.fromEntries(JSON.parse(fs.readFileSync(path.resolve(path.dirname(CONFIG_FILE), config.maps), 'utf8')).map((m) => [m.id, m]));
const OUT = path.join(root, config.out, PC.out);

const run = (args) => {
  const r = spawnSync(PY, ['-I', ...args], { cwd: root, encoding: 'utf8', maxBuffer: 1 << 26 });
  if (r.status !== 0) throw new Error(`${PY} ${args.join(' ')} 실패\n${r.stdout}\n${r.stderr}`);
  return r.stdout;
};
export const key = (s) => s.replace(/\s+/g, '');
const round = (v, d = PC.decimals) => Math.round(v * 10 ** d) / 10 ** d;
const rr = ([a, b]) => [round(a), round(b)];
const denom = (m) => Number(String(m.scale || '').replace(/^1:/, '').replace(/,/g, '')) || Infinity;

/** 대권 거리(km). */
export function km(a, b) {
  const R = 6371, r = Math.PI / 180, dLat = (b[1] - a[1]) * r, dLon = (b[0] - a[0]) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * r) * Math.cos(b[1] * r) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** 글자 크기 → 등급(rankBySize: [[최소 크기, 등급], ...] 큰 것부터). */
export function sizeRank(size, table = PC.rankBySize) {
  for (const [min, r] of table) if (size >= min) return r;
  return table[table.length - 1][1];
}

/** 합치기 묶음: 수도와 도시는 같은 묶음(지도마다 기호가 다를 수 있음). */
const family = (kind) => (kind === 'capital' ? 'city' : kind);

/** 지명 출현(지도별 한 글자 묶음) 목록 → 합친 지명 목록.
 *  출현: {name, kind, point(점 지명: 도시·수도·산 봉우리), ll, size, page, map, scale, overview, symbol?, path?, angle?, en?, alt?, elev?} */
export function merge(occ, { dedupKm = PC.dedupKm, rankAdjust = PC.rankAdjust, penalty = PC.regionalRankPenalty,
  overviewKinds = PC.overviewKinds, overviewMinSize = PC.overviewMinSize } = {}) {
  const groups = [];
  const lim = (x, o) => (!o.point ? dedupKm.area : x.symbol && o.symbol ? dedupKm.point : dedupKm.pointNoSymbol);
  for (const o of occ) {
    const fam = `${family(o.kind)}/${o.point ? 'pt' : 'area'}`;
    const g = groups.find((G) => G.k === key(o.name) && G.fam === fam && G.items.some((x) => km(x.ll, o.ll) <= lim(x, o)));
    if (g) g.items.push(o); else groups.push({ k: key(o.name), fam, items: [o] });
  }
  return groups.map(({ items }) => {
    // 위치: 기호 있는 것 → 큰 축척(분모 작은 것) → 큰 글자. 단 나라·큰 지물(개관도 글자 ≥ overviewMinSize)은 개관도 글자 먼저
    const big = !items[0].point && (overviewKinds.includes(items[0].kind) || items.some((x) => x.overview && x.size >= overviewMinSize));
    const ovFirst = (a, b) => (big ? (b.overview - a.overview) : 0);
    const best = [...items].sort((a, b) => ovFirst(a, b) || (!!b.symbol - !!a.symbol) || (a.scale - b.scale) || (b.size - a.size))[0];
    const ov = items.filter((x) => x.overview);
    const kind = items.some((x) => x.kind === 'capital') ? 'capital' : best.kind;
    const base = ov.length ? Math.min(...ov.map((x) => sizeRank(x.size))) : Math.min(...items.map((x) => sizeRank(x.size))) + penalty;
    const rank = Math.max(1, Math.min(6, base + (rankAdjust[kind] || 0)));
    const sizeSrc = ov.length ? ov.reduce((a, b) => (b.size > a.size ? b : a)) : best;
    const pick = (f) => (items.find((x) => x.overview && x[f] !== undefined) || items.find((x) => x[f] !== undefined) || {})[f];
    const p = { name: best.name, lon: best.ll[0], lat: best.ll[1], rank, kind, size: sizeSrc.size, page: best.page };
    if (best.symbol) p.symbol = [best.ll[0], best.ll[1]];
    if (!best.point && best.path) p.path = best.path;
    if (!best.point && best.angle !== undefined && Math.abs(best.angle) >= 3) p.angle = Math.round(best.angle);
    for (const f of ['en', 'alt', 'elev']) { const v = pick(f); if (v !== undefined) p[f] = v; }
    return p;
  });
}

function extract(force) {
  const need = force || !fs.existsSync(`${WORK}/${PC.index.out}`) || PC.maps.some((id) => !fs.existsSync(`${WORK}/text/places-${id}.json`));
  if (need) process.stdout.write(run([path.join(here, 'places.py')]));
}

function main(argv) {
  const flags = new Set(argv);
  extract(flags.has('--extract'));
  const warnings = [];
  const index = JSON.parse(fs.readFileSync(`${WORK}/${PC.index.out}`, 'utf8'));
  const [p0, p1] = PC.index.checkPages;
  const mapRows = index.filter((r) => r.page >= p0 && r.page <= p1);
  const spell = new Map();                                    // 열쇠 → 찾아보기 표기(16~19쪽 우선)
  for (const r of [...mapRows, ...index]) if (!spell.has(key(r.name))) spell.set(key(r.name), r.name);
  for (const n of Object.keys(PC.extraNames || {})) if (!spell.has(key(n))) spell.set(key(n), n);
  const occ = [];
  for (const id of PC.maps) {
    const m = maps[id];
    const fit = JSON.parse(fs.readFileSync(`${WORK}/geo/${id}.fit.json`, 'utf8'));
    const cv = makeConverter(fit);
    if (!cv) throw new Error(`${id}: fit 으로 변환기를 만들 수 없음`);
    const src = JSON.parse(fs.readFileSync(`${WORK}/text/places-${id}.json`, 'utf8'));
    for (const w of src.report.warnings) warnings.push(w);
    for (const L of src.labels) {
      const point = L.role === 'city';                      // 점 지명 역할(도시·수도·산 봉우리)
      const xy = point && L.symbol ? L.symbol.xy : L.xy;
      const ll = cv.invert(xy);
      if (!ll) { warnings.push(`${id}: 「${L.name}」 역변환 실패(${xy}) → 뺌`); continue; }
      const o = { name: spell.get(key(L.name)) || L.name, kind: L.kind, point, ll: rr(ll), size: L.size, page: m.page, map: id,
        scale: denom(m), overview: id === PC.overview };
      if (point && L.symbol) o.symbol = true;
      if (!point) {
        const pts = L.path.map((q) => cv.invert(q));
        if (pts.every(Boolean)) {
          for (let i = 1; i < pts.length; i++) { while (pts[i][0] - pts[i - 1][0] > 180) pts[i][0] -= 360; while (pts[i][0] - pts[i - 1][0] < -180) pts[i][0] += 360; }
          o.path = pts.map(rr);
        } else warnings.push(`${id}: 「${L.name}」 글자 줄 역변환 일부 실패 → path 없음`);
        o.angle = L.angle;
      }
      for (const f of ['en', 'alt', 'elev']) if (L[f] !== undefined) o[f] = L[f];
      occ.push(o);
    }
  }
  const places = merge(occ);
  const ne = neIndex();
  if (!ne) warnings.push(`Natural Earth 인구 지점 파일이 없어 옮겨 그린 기호 바로잡기(snapToNe)를 못 함: ${NE_FILE}`);
  const snapped = ne ? snapToNe(places, ne) : [];
  const inIdx = new Set(mapRows.map((r) => key(r.name)));
  for (const p of places) p.inIndex = inIdx.has(key(p.name));
  places.sort((a, b) => a.rank - b.rank || b.size - a.size || a.name.localeCompare(b.name, 'ko'));
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(places) + '\n');

  // 찾아보기 대조
  const byKey = new Map();
  for (const o of occ) { const k = key(o.name); if (!byKey.has(k)) byKey.set(k, new Set()); byKey.get(k).add(o.page); }
  const missing = [], otherPage = [];
  for (const r of mapRows) {
    if (PC.indexExclude[r.name]) continue;
    const pages = byKey.get(key(r.name));
    if (!pages) missing.push(`${r.name} ${r.page}${r.grid}`);
    else if (!pages.has(r.page) && r.page !== 17) otherPage.push(`${r.name} ${r.page}${r.grid} (있는 쪽 ${[...pages].join(',')})`);
  }
  const kinds = {}, ranks = {};
  for (const p of places) { kinds[p.kind] = (kinds[p.kind] || 0) + 1; ranks[p.rank] = (ranks[p.rank] || 0) + 1; }
  const size = fs.statSync(OUT).size;
  console.log(`지명 ${places.length}개 (출현 ${occ.length}) → ${path.relative(root, OUT)} ${(size / 1024).toFixed(1)} KiB`);
  console.log('종류', JSON.stringify(kinds));
  console.log('등급', JSON.stringify(ranks));
  console.log(`찾아보기 ${p0}~${p1}쪽 ${mapRows.length}줄: 없음 ${missing.length}, 다른 쪽에만 ${otherPage.length}, 제외 ${Object.keys(PC.indexExclude).length}`);
  for (const s of missing) console.log('  없음:', s);
  for (const s of otherPage) console.log('  다른 쪽에만:', s);
  console.log(`inIndex ${places.filter((p) => p.inIndex).length}/${places.length}`);
  console.log(`Natural Earth 위치로 옮김 ${snapped.length}곳 (${PC.snapKm}km 넘게 어긋난 점 지명, 이름이 하나뿐인 짝만):`);
  for (const p of snapped) console.log(`  옮김: ${p.name}(${p.page}쪽 ${p.kind}) ${p.snapped.km}km  ${p.snapped.from} → ${p.lon},${p.lat}`);
  const kept = Object.keys(PC.keepTextbookPosition || {});
  if (kept.length) console.log(`교과서 위치 그대로 둠(keepTextbookPosition): ${kept.join(', ')}`);
  const nec = neCheck(places);
  if (nec) console.log(`Natural Earth 대조: 도시·수도 ${nec.n}곳 중앙값 ${nec.median.toFixed(1)}km, 90% ${nec.p90.toFixed(1)}km, ` +
    `최대 ${nec.max.toFixed(0)}km, 40km 넘음 ${nec.far.length}: ${nec.far.join(', ')}`);
  for (const w of warnings) console.log('  경고:', w);
  if (flags.has('--verify')) for (const id of PC.maps) console.log('검증 그림', verify(id, places));
}

const NE_FILE = `${WORK}/raw/ne/ne_10m_populated_places.geojson`;

/** Natural Earth 10m 인구 지점: NAME_KO 열쇠 → 아시아 범위(경도 ≥ 20, 위도 −15~82) 안 [lon, lat] 목록. 파일이 없으면 null. */
export function neIndex(file = NE_FILE) {
  if (!fs.existsSync(file)) return null;
  const by = new Map();
  for (const f of JSON.parse(fs.readFileSync(file, 'utf8')).features) {
    const k = key(f.properties.NAME_KO || ''), [lon, lat] = f.geometry.coordinates;
    if (!k || lon < 20 || lat < -15 || lat > 82) continue;
    if (!by.has(k)) by.set(k, []); by.get(k).push([lon, lat]);
  }
  return by;
}

/** 옮겨 그린 기호 바로잡기: 점 지명(도시·수도·산 봉우리) 중 Natural Earth 에 이름이 똑같은 지점이 하나뿐이고 places 에도 그 이름의
 *  점 지명이 하나뿐인데 snapKm 넘게 어긋나면 lon/lat·symbol 을 Natural Earth 경위도로 바꾸고 snapped: {from, km} 를 남긴다.
 *  keepTextbookPosition 에 있는 이름은 그대로. 면·선 지명은 건드리지 않는다. 바꾼 지명 목록을 돌려준다. */
export function snapToNe(places, ne, { snapKm = PC.snapKm, keep = PC.keepTextbookPosition || {} } = {}) {
  const isPoint = (p) => !!p.symbol || ['city', 'capital'].includes(p.kind);
  const count = new Map();
  for (const p of places) if (isPoint(p)) count.set(key(p.name), (count.get(key(p.name)) || 0) + 1);
  const out = [];
  for (const p of places) {
    const m = ne.get(key(p.name));
    if (!isPoint(p) || !m || m.length !== 1 || count.get(key(p.name)) !== 1 || keep[p.name]) continue;
    const d = km([p.lon, p.lat], m[0]);
    if (d <= snapKm) continue;
    p.snapped = { from: [p.lon, p.lat], km: Math.round(d) };
    p.lon = round(m[0][0]); p.lat = round(m[0][1]);
    if (p.symbol) p.symbol = [p.lon, p.lat];
    out.push(p);
  }
  return out;
}

/** 도시·수도 위치를 Natural Earth 10m 인구 지점(NAME_KO 가 같은 것, 아시아 범위)과 견준다.
 *  → {n, median, p90, max, far: ['이름(쪽) 거리', ...]} (km). 파일이 없거나 맞는 이름이 없으면 null. */
export function neCheck(places, file = NE_FILE, farKm = 40) {
  const by = neIndex(file);
  if (!by) return null;
  const ds = [], far = [];
  for (const p of places) {
    if (!['city', 'capital'].includes(p.kind) || !by.has(key(p.name))) continue;
    const d = Math.min(...by.get(key(p.name)).map((q) => km(q, [p.lon, p.lat]))); ds.push(d);
    if (d > farKm) far.push(`${p.name}(${p.page}쪽) ${d.toFixed(0)}km`);
  }
  if (!ds.length) return null;
  ds.sort((a, b) => a - b);
  return { n: ds.length, median: ds[ds.length >> 1], p90: ds[Math.floor(ds.length * 0.9)], max: ds[ds.length - 1], far };
}

/** 지명을 지도 id 의 fit 으로 지면에 되돌려 교과서 렌더 위에 겹친다: 점 = 기호 위치(빨강 수도·검정 도시·갈색 산), 글자 = 이름(종류 색), 글자 줄 = 파랑 선. */
function verify(id, places) {
  const m = maps[id];
  const cv = makeConverter(JSON.parse(fs.readFileSync(`${WORK}/geo/${id}.fit.json`, 'utf8')));
  const COLOR = { country: '#c0007a', capital: '#e00000', city: '#202020', mountain: '#8a4b00', river: '#0060d0', sea: '#0060d0',
    region: '#6a3d9a', island: '#007a3d', desert: '#b06000', plain: '#4a7a00', other: '#555555' };
  const inside = ([x, y]) => x >= m.bbox[0] && x <= m.bbox[2] && y >= m.bbox[1] && y <= m.bbox[3];
  const points = [], paths = [], texts = [];
  for (const p of places) {
    const xy = cv.apply([p.lon, p.lat]);
    if (!xy || !inside(xy)) continue;
    const color = COLOR[p.kind];
    if (p.symbol) points.push({ xy, color });
    if (p.path) { const q = p.path.map((ll) => cv.apply(ll)).filter(Boolean); if (q.length > 1) paths.push({ points: q, color: '#3070ff', width: 0.3, noEnd: true }); }
    texts.push({ xy: p.symbol ? [xy[0] + 3, xy[1] - 2] : xy, text: `${p.name}${p.rank}`, color, anchor: p.symbol ? 'ls' : 'mm' });
  }
  const out = `${WORK}/shots/c2/${id}.png`;
  fs.mkdirSync(`${WORK}/shots/c2`, { recursive: true });
  const ov = { page: m.page, bbox: m.bbox, dpi: VERIFY_DPI, out, title: `${id} places (lon/lat -> page), text = name+rank`, points, paths, texts, fontPx: 15 };
  const ovf = `${WORK}/shots/c2/${id}.overlay.json`;
  fs.writeFileSync(ovf, JSON.stringify(ov));
  run([path.join(here, 'overlay.py'), ovf]);
  return out;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
