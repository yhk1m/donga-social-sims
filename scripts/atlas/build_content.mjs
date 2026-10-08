// © 2026 김용현
// scripts/atlas/build_content.mjs — 주제 내용 원본 + 고침 + 생성물 → 앱 자료(C5)
//   node scripts/atlas/build_content.mjs [--force]
//   입력(설정 content, scripts/atlas/config/u2.json):
//     topics(사람이 고치는 원본, 글은 extract_text.py --fill 이 채움) · overrides(사람이 고친 값) · photos(C3) · coloringOut(coloring_quiz.mjs)
//     · places(C2) · $ATLAS_WORK/<charts>(C4) · 레이어 파일(C1, out 폴더) · fit(보기 범위)
//   출력(out): topics.json · charts.json · layers.js(주제가 참조하는 레이어를 정적 import — fetch 금지라서)
//   경고가 하나라도 있으면 쓰지 않고 종료 코드 1(--force 면 쓰고 1).
// 주제 원본에서 바뀌는 것:
//   - view/views: {map} → 그 지도 틀(maps_u2 bbox) 안 격자를 fit 으로 되돌린 경위도의 퍼센트 범위 bounds[w,s,e,n]·center(틀 가운데),
//     {layer} → 레이어 도형 범위. 주제 view 는 마커를 모두 담도록 markerMargin 도만큼 넓힌다. 엔진은 bounds 를 화면에 맞춘다(확대 수준은 도법마다 달라 여기서 정하지 않는다).
//   - layers: 레이어 파일의 layerType 과 type 이 같은지, label(없으면 레이어 제목), approx → approx·approxNote 「위치 근사」
//   - markers: photo id → 사진(주소·크기·제목·설명), lonlat 은 lonlat(출처 source) > lonlatFrom.place(교과서 지명 places) > 사진 핀,
//     핀이 아닌 위치로 옮긴 마커는 textbookLonlat(교과서 핀)을 남긴다. 핀 위치이고 그 지도 fit 이 approx 면 approx.
//   - blocks: photo/chart/page 참조를 풀고(사진·쪽 이미지 주소), quiz: coloring → coloringOut, heritage → 마커 정답 모음
//   - src·…Src·why·_ 로 시작하는 키(원본 표기)는 뺀다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeConverter } from './georef.mjs';
import { WORK, loadFit, key, mtime } from './geo_util.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const CONFIG = process.env.ATLAS_UNIT_CONFIG || path.join(HERE, 'config', 'u2.json');
const readJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const r5 = (v) => Math.round(v * 1e5) / 1e5;
const r3 = (v) => Math.round(v * 1e3) / 1e3;

// ── 고침(overrides) ───────────────────────────────────────────────────────
const TOPIC_KEYS = new Set(['id', 'title', 'pages', 'view', 'views', 'layers', 'markers', 'blocks', 'quiz']);
/** 'topic.markerId.field' | 'topic.blocks[2].field' | 'topic.layers[0].field' | 'topic.quiz.field' | 'topic.field' → {topic, path}.
 *  path 칸: 문자열 = 객체 키, 수 = 목록 번호, {marker} = markers 에서 id 로 찾기(주제 칸 이름이 아닌 첫 칸). */
export function parseKey(k) {
  const parts = k.split('.');
  if (parts.length < 2 || parts.some((p) => !p)) throw new Error(`고침 키 형식 오류: ${k}`);
  const [topic, ...rest] = parts, out = [];
  rest.forEach((p, i) => {
    const m = /^(\w+)\[(\d+)\]$/.exec(p);
    if (m) out.push(m[1], Number(m[2]));
    else if (i === 0 && i < rest.length - 1 && !TOPIC_KEYS.has(p)) out.push({ marker: p });
    else out.push(p);
  });
  return { topic, path: out };
}

/** topics(목록)에 고침을 덮은 새 목록. 대상이 없거나 from 이 지금 값과 다르면 오류. 입력은 바꾸지 않는다. */
export function applyOverrides(topics, items) {
  const out = structuredClone(topics);
  for (const [k, o] of Object.entries(items ?? {})) {
    const { topic, path: p } = parseKey(k);
    let node = out.find((t) => t.id === topic);
    if (!node) throw new Error(`고침 ${k}: 주제 ${topic} 없음`);
    for (let i = 0; i < p.length - 1; i++) {
      const s = p[i];
      const next = s.marker ? (node.markers ?? []).find((m) => m.id === s.marker) : node?.[s];
      if (next == null || typeof next !== 'object') {
        const at = s.marker ?? (typeof s === 'number' ? `${p[i - 1]}[${s}]` : s);
        throw new Error(`고침 ${k}: ${at} 없음`);
      }
      node = next;
    }
    const field = p[p.length - 1];
    if ('from' in o && node[field] !== o.from) throw new Error(`고침 ${k}: 낡은 고침 — 지금 값 ${JSON.stringify(node[field])} ≠ from ${JSON.stringify(o.from)}`);
    node[field] = o.value;
  }
  return out;
}

// ── 보기 범위 ─────────────────────────────────────────────────────────────
/** 지도 틀(지면 bbox) 안 (n+1)×(n+1) 격자점을 fit 으로 되돌린 경위도의 퍼센트 범위(pct ~ 100−pct) = 지도에 실제로 보이는 땅의 범위.
 *  틀 모서리는 방위 도법에서 극 가까이로 가 경도 폭이 300°를 넘기 때문에 쓰지 않는다. 경도는 중심 경도 기준으로 편다(날짜변경선). */
export function frameView(fit, bbox, n, pct) {
  const conv = makeConverter(fit);
  const [x0, y0, x1, y1] = bbox, pts = [];
  for (let i = 0; i <= n; i++) for (let j = 0; j <= n; j++) pts.push([x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * j) / n]);
  const c = conv.invert([(x0 + x1) / 2, (y0 + y1) / 2]);
  if (!c) throw new Error(`${fit.id}: 지도 가운데를 되돌리지 못함`);
  const ll = pts.map((p) => conv.invert(p)).filter(Boolean).map(([lon, lat]) => [c[0] + (((lon - c[0] + 540) % 360) - 180), lat]);
  if (ll.length < pts.length / 2) throw new Error(`${fit.id}: 지도 틀 되돌리기 실패 ${pts.length - ll.length}/${pts.length}`);
  const q = (a, p) => { const v = [...a].sort((x, y) => x - y); return v[Math.min(v.length - 1, Math.max(0, Math.round((p / 100) * (v.length - 1))))]; };
  const lons = ll.map((p) => p[0]), lats = ll.map((p) => p[1]);
  return { center: c.map(r3), bounds: [q(lons, pct), q(lats, pct), q(lons, 100 - pct), q(lats, 100 - pct)].map(r3) };
}
function box(ll, c) {
  const lons = ll.map((p) => p[0]), lats = ll.map((p) => p[1]);
  const b = [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)].map(r3);
  return { center: (c ?? [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2]).map(r3), bounds: b };
}
/** GeoJSON 레이어의 모든 좌표 범위. */
export function layerView(gj) {
  const ll = [];
  const walk = (a) => { if (typeof a[0] === 'number') ll.push(a); else a.forEach(walk); };
  for (const f of gj.features) if (f.geometry) walk(f.geometry.coordinates);
  if (!ll.length) throw new Error(`${gj.properties?.id}: 좌표 없음`);
  return box(ll);
}

// ── 만들기 ────────────────────────────────────────────────────────────────
const isSrcKey = (k) => k === 'src' || (k.endsWith('Src') && k.length > 3) || k === 'why' || k.startsWith('_');
function strip(o) {
  if (Array.isArray(o)) return o.map(strip);
  if (o && typeof o === 'object') return Object.fromEntries(Object.entries(o).filter(([k]) => !isSrcKey(k)).map(([k, v]) => [k, strip(v)]));
  return o;
}

/** 입력(메모리) → {topics, charts, layerRefs, warnings}. 같은 입력이면 같은 결과(키 순서까지). */
export function buildContent(inp) {
  const { cfg, mapsById, fits, photos, charts, places, coloring, layerFile, assetUrl, overrides } = inp;
  const W = [];
  const topics = applyOverrides(inp.topics, overrides);
  const photoBy = new Map(photos.map((p) => [p.id, p]));
  const viewOf = (v, where) => {
    if (v.map) {
      const m = mapsById[v.map];
      if (!m) { W.push(`${where}: 지도 ${v.map} 없음`); return null; }
      return { map: v.map, ...frameView(fits(v.map), m.bbox, cfg.viewGrid, cfg.viewPercentile) };
    }
    if (v.layer) { const gj = layerFile(v.layer); if (!gj) { W.push(`${where}: 레이어 ${v.layer} 없음`); return null; } return { layer: v.layer, ...layerView(gj) }; }
    if (v.center && v.bounds) return { center: v.center, bounds: v.bounds };
    W.push(`${where}: 보기에 map·layer·center+bounds 가 없음`); return null;
  };
  const photoOut = (id, where) => {
    const p = photoBy.get(id);
    if (!p) { W.push(`${where}: 사진 ${id} 이 photos.json 에 없음`); return null; }
    if (!inp.photoExists(id)) W.push(`${where}: 사진 파일 ${id}.jpg 없음`);
    const o = { id, url: assetUrl(`photo/${id}.jpg`), webp: assetUrl(`photo/${id}.webp`), width: p.width, height: p.height };
    for (const k of ['mask', 'credit', 'pin']) if (p[k] != null) o[k] = p[k];
    return o;
  };
  const placeLonlat = (name, where) => {
    const hit = places.filter((p) => key(p.name) === key(name));
    if (hit.length !== 1) { W.push(`${where}: 지명 「${name}」 ${hit.length}개`); return null; }
    return [hit[0].lon, hit[0].lat];
  };
  const usedCharts = new Set();
  const chartRef = (id, where) => { if (!charts[id]) W.push(`${where}: 그래프 ${id} 없음`); usedCharts.add(id); };
  const out = [];
  for (const t0 of topics) {
    const t = strip(t0), at = t.id;
    const o = { id: t.id, title: t.title, pages: t.pages };
    o.view = viewOf(t0.view ?? {}, `${at}.view`);
    if (t0.views) o.views = t0.views.map((v) => ({ id: v.id, label: v.label, ...viewOf(v, `${at}.views.${v.id}`) }));
    o.layers = (t.layers ?? []).map((l, i) => {
      const gj = layerFile(l.ref), where = `${at}.layers[${i}] ${l.ref}`;
      if (!gj) { W.push(`${where}: 레이어 파일 없음`); return l; }
      const props = gj.properties ?? {}, type = props.layerType ?? (gj.url ? 'image' : null);
      if (l.type !== type) W.push(`${where}: type ${l.type} ≠ 레이어 ${type}`);
      const r = { ...l, label: l.label ?? props.title };
      if (!r.label) W.push(`${where}: label 없음(레이어에 제목도 없음)`);
      if (props.approx) { r.approx = true; r.approxNote = '위치 근사'; if (props.approxReason) r.approxReason = props.approxReason; }
      return r;
    });
    o.markers = (t0.markers ?? []).map((m0) => {
      const m = strip(m0), where = `${at}.${m.id}`;
      const p = m.photo ? photoBy.get(m.photo) : null;
      const r = { id: m.id };
      if (m.photo) r.photo = photoOut(m.photo, where);
      r.title = m.title ?? p?.title ?? p?.caption;
      r.text = m.text ?? (p?.title ? p.caption : undefined) ?? (m.quiz ? `국가: ${m.quiz.country} / 관련 종교: ${m.quiz.religions.join(', ')}` : undefined);
      const pin = p?.lonlat ?? null;
      if (m0.lonlat) { r.lonlat = m0.lonlat.map(r5); r.lonlatFrom = 'source'; if (!m.source?.url) W.push(`${where}: 위치 출처(source.url) 없음`); }
      else if (m0.lonlatFrom?.place) { r.lonlat = placeLonlat(m0.lonlatFrom.place, where); r.lonlatFrom = 'place'; r.place = m0.lonlatFrom.place; }
      else if (pin) { r.lonlat = pin; r.lonlatFrom = 'pin'; if (p.map && fits(p.map)?.approx) r.approx = true; }
      else W.push(`${where}: 위치 없음(lonlat·lonlatFrom·사진 핀)`);
      if (pin && r.lonlatFrom !== 'pin') r.textbookLonlat = pin;
      if (m.chart) { chartRef(m.chart, where); r.chart = m.chart; }
      if (m.source) r.source = m.source;
      if (m.quiz) r.quiz = m.quiz;
      if (!r.title || !r.text) W.push(`${where}: 제목·설명 없음`);
      return r;
    });
    // 주제 보기 범위는 마커를 모두 담도록 넓힌다(markerMargin 도)
    if (o.view) for (const m of o.markers) if (m.lonlat) {
      const g = cfg.markerMargin, b = o.view.bounds;
      o.view.bounds = [Math.min(b[0], m.lonlat[0] - g), Math.min(b[1], m.lonlat[1] - g), Math.max(b[2], m.lonlat[0] + g), Math.max(b[3], m.lonlat[1] + g)].map(r3);
    }
    o.blocks = (t.blocks ?? []).map((b, i) => {
      const where = `${at}.blocks[${i}]`, r = { ...b };
      if (b.type === 'photo') {
        const p = photoBy.get(b.ref); r.photo = photoOut(b.ref, where); delete r.ref;
        r.title = b.title ?? p?.title; r.text = b.text ?? p?.caption;
        if (r.title === undefined) delete r.title;
      } else if (b.photo) {
        const p = photoBy.get(b.photo); r.photo = photoOut(b.photo, where);
        r.text = b.text ?? p?.caption;
      }
      if (b.type === 'chart') chartRef(b.ref, where);
      if (b.chart) chartRef(b.chart, where);
      for (const c of b.charts ?? []) chartRef(c, where);
      if (b.type === 'page') {
        if (!t.pages.includes(b.page)) W.push(`${where}: 주제 쪽 밖 ${b.page}`);
        const f = `page/p${String(b.page).padStart(3, '0')}.jpg`;
        if (!inp.assetExists(f)) W.push(`${where}: 쪽 이미지 ${f} 없음`);
        r.url = assetUrl(f);
      }
      if (['text', 'activity', 'card', 'photo'].includes(b.type) && !r.text) W.push(`${where}: 글 없음`);
      if (b.type === 'card' && !r.title) W.push(`${where}: 카드 제목 없음`);
      if (b.view && !(t0.views ?? []).some((v) => v.id === b.view)) W.push(`${where}: 없는 보기 ${b.view}`);
      return r;
    });
    let quiz = t.quiz ?? null;
    if (quiz?.type === 'coloring') {
      quiz = { type: 'coloring', page: coloring.page, map: coloring.map, countries: coloring.countries };
    } else if (quiz?.type === 'heritage') {
      quiz = { ...quiz, items: o.markers.map((m) => ({ marker: m.id, ...m.quiz })) };
      if (!quiz.answerKey) W.push(`${at}.quiz: 112쪽 정답(answerKey) 없음`);
    }
    o.quiz = quiz;
    out.push(o);
  }
  // 전체 검사
  const ex = cfg.expect, by = Object.fromEntries(out.map((t) => [t.id, t]));
  if (JSON.stringify(out.map((t) => t.id)) !== JSON.stringify(ex.topics)) W.push(`주제 순서 ${out.map((t) => t.id)} ≠ ${ex.topics}`);
  const pages = new Set(out.flatMap((t) => t.pages));
  for (let p = cfg.pages[0]; p <= cfg.pages[1]; p++) if (!pages.has(p)) W.push(`${p}쪽을 덮는 주제 없음`);
  for (const [id, n] of Object.entries(ex.markers)) if (by[id]?.markers.length !== n) W.push(`${id} 마커 ${by[id]?.markers.length} ≠ ${n}`);
  for (const [id, n] of Object.entries(ex.chartMarkers)) { const k = by[id]?.markers.filter((m) => m.chart).length; if (k !== n) W.push(`${id} 그래프 마커 ${k} ≠ ${n}`); }
  if (coloring.countries.length !== ex.coloringCountries) W.push(`색칠하기 나라 ${coloring.countries.length} ≠ ${ex.coloringCountries}`);
  for (const id of Object.keys(charts)) if (!usedCharts.has(id)) W.push(`그래프 ${id}: 어느 주제도 참조하지 않음`);
  const chartsOut = Object.fromEntries(Object.keys(charts).sort().map((id) => [id, { id, ...charts[id] }]));
  const layerRefs = [...new Set(out.flatMap((t) => t.layers.map((l) => l.ref)))].sort();
  return { topics: out, charts: chartsOut, layerRefs, warnings: [...new Set(W)] };
}

/** 참조 레이어를 정적 import 로 묶는 모듈 글. refs 는 정렬된 id 목록. */
export function layersModule(refs) {
  return ['// © 2026 김용현',
    '// sims/atlas-u2-asia/data/layers.js — 생성물(scripts/atlas/build_content.mjs, 직접 고치지 않음): 주제가 참조하는 레이어를 정적 import 로 묶는다(fetch 금지).',
    ...refs.map((r, i) => `import L${i} from './${r}.json';`),
    'export default {',
    ...refs.map((r, i) => `  '${r}': L${i},`),
    '};', ''].join('\n');
}

/** 설정·파일에서 입력을 읽는다. */
export function loadInputs() {
  const unit = readJson(CONFIG), cfg = unit.content, pc = unit.photos;
  const outDir = path.join(ROOT, cfg.out);
  const maps = readJson(path.resolve(path.dirname(CONFIG), unit.maps));
  const coloringFile = path.join(ROOT, cfg.coloringOut), labels = `${WORK}/${cfg.labels}`;
  if (mtime(coloringFile) < Math.max(mtime(labels), mtime(path.join(HERE, 'coloring_quiz.mjs'))))
    throw new Error(`${cfg.coloringOut} 가 17쪽 글자·coloring_quiz.mjs 보다 오래됨 (node scripts/atlas/coloring_quiz.mjs --write 먼저)`);
  const chartsFile = `${WORK}/${cfg.charts}`;
  if (!fs.existsSync(chartsFile)) throw new Error(`${chartsFile} 없음 (python -I scripts/atlas/extract_tables.py 먼저)`);
  const fitCache = new Map(), layerCache = new Map();
  const assetDir = path.join(ROOT, pc.assetDir);
  return {
    cfg, overrides: readJson(path.join(ROOT, cfg.overrides)).items,
    topics: readJson(path.join(ROOT, cfg.topics)),
    photos: readJson(path.join(ROOT, cfg.photos)),
    charts: readJson(chartsFile),
    places: readJson(path.join(ROOT, cfg.places)),
    coloring: readJson(coloringFile),
    mapsById: Object.fromEntries(maps.map((m) => [m.id, m])),
    fits: (id) => { if (!fitCache.has(id)) fitCache.set(id, loadFit(id)); return fitCache.get(id); },
    layerFile: (ref) => {
      if (!layerCache.has(ref)) { const f = path.join(outDir, `${ref}.json`); layerCache.set(ref, fs.existsSync(f) ? readJson(f) : null); }
      return layerCache.get(ref);
    },
    assetUrl: (rel) => `${pc.assetBase}${pc.assetPrefix}${rel}`,
    assetExists: (rel) => fs.existsSync(path.join(assetDir, rel)),
    photoExists: (id) => fs.existsSync(path.join(assetDir, 'photo', `${id}.jpg`)),
    outDir,
  };
}

function writeAtomic(f, text) {
  const tmp = `${f}.tmp`;
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, f);
  console.log(`  ${path.relative(ROOT, f)} (${fs.statSync(f).size.toLocaleString()} B)`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const bad = process.argv.slice(2).filter((a) => a !== '--force');
  if (bad.length) { console.error(`모르는 옵션: ${bad.join(' ')} (쓸 수 있는 것: --force)`); process.exit(2); }
  const force = process.argv.includes('--force');
  try {
    const inp = loadInputs();
    const r = buildContent(inp);
    console.log(`주제 ${r.topics.length}개, 그래프 ${Object.keys(r.charts).length}개, 레이어 ${r.layerRefs.length}개`);
    if (!r.warnings.length || force) {
      writeAtomic(path.join(inp.outDir, 'topics.json'), JSON.stringify(r.topics) + '\n');
      writeAtomic(path.join(inp.outDir, 'charts.json'), JSON.stringify(r.charts) + '\n');
      writeAtomic(path.join(inp.outDir, 'layers.js'), layersModule(r.layerRefs));
    } else console.log('경고가 있어 쓰지 않음(--force 로 강제)');
    if (r.warnings.length) { console.log(`\n경고 ${r.warnings.length}개:`); for (const w of r.warnings) console.log('  - ' + w); process.exit(1); }
    console.log('경고 없음');
  } catch (e) { console.error(e.message); process.exit(1); }
}
