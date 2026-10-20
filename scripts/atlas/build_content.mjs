// © 2026 김용현
// scripts/atlas/build_content.mjs — 주제 내용 원본 + 고침 + 생성물 → 앱 자료(C5)
//   node scripts/atlas/build_content.mjs [--force]
//   입력(설정 content, scripts/atlas/config/u2.json):
//     topics(사람이 고치는 원본, 글은 extract_text.py --fill 이 채움) · overrides(사람이 고친 값) · photos(C3) · coloringOut(coloring_quiz.mjs)
//     · places(C2) · $ATLAS_WORK/<charts>(C4) · 레이어 파일(C1, out 폴더) · fit(보기 범위)
//   출력(out): topics.json · charts.json · layers.js(주제가 참조하는 레이어를 정적 import — fetch 금지라서). 내용이 같으면 쓰지 않고, layers.js 는 맨 나중.
//   경고가 하나라도 있으면 쓰지 않고 종료 코드 1(--force 면 쓰고 1). 모르는 옵션은 2.
// 낡은 산출물 검사(설정 content.stamps, 입력 내용 해시): topics 도장(extract_text.py --fill/--check), charts 도장(extract_tables.py),
//   coloringOut.inputsHash(coloring_quiz.mjs) 가 지금 다시 계산한 해시와 다르면 무엇을 먼저 돌릴지 알리고 멈춘다.
// 검사(설정 content.schema): 모르는 키·블록 종류·퀴즈 종류는 경고(조용히 버리지 않음), 주제·마커·블록·보기·레이어 id 중복, 필수 칸.
//   원본 표기 키(src·…Src·why·_…)는 허용하고 생성물에서 뺀다.
// 주제 원본에서 바뀌는 것:
//   - view/views: {map} → 그 지도 틀(maps_u2 bbox) 안 격자를 fit 으로 되돌린 경위도의 퍼센트 범위 bounds[w,s,e,n]·center(틀 가운데),
//     {layer} → 레이어 도형 범위. 주제 view 는 마커를 모두 담도록 markerMargin 도만큼 넓힌다. 엔진은 bounds 를 화면에 맞춘다.
//   - layers: 레이어 파일의 layerType 과 type 이 같은지, label(없으면 레이어 제목), approx → approx·approxNote 「위치 근사」
//   - markers: photo id → 사진(주소·크기·제목·설명), lonlat 은 lonlat(출처 source) > lonlatFrom.place(교과서 지명 places) > 사진 핀,
//     핀이 아닌 위치로 옮긴 마커는 textbookLonlat(교과서 핀)을 남긴다. 핀 위치이고 그 지도 fit 이 approx 면 approx.
//     글은 교과서 원문만(사진 설명 또는 src) — 퀴즈가 있는 마커(세계유산)는 글이 없을 수 있다(정답은 퀴즈 화면이 보여 줌).
//   - blocks: photo/chart/page 참조를 풀고(사진·쪽 이미지 주소), quiz: coloring → coloringOut, heritage → 마커 정답 모음
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeConverter } from './georef.mjs';
import { WORK, REPO, loadFit, key, readJson, round, writeIfChanged, stampHash, stampPath } from './geo_util.mjs';
import { resolveUnit, stripUnitArgs } from './unit.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const UNIT = resolveUnit();   // 단원 고르기(--unit uN · env ATLAS_UNIT · 옛 ATLAS_UNIT_CONFIG, 기본 u2) — scripts/atlas/unit.mjs
const CONFIG = UNIT.configPath;
const r3 = (v) => round(v, 3), r5 = (v) => round(v, 5);
const isEqual = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ── 고침(overrides) ───────────────────────────────────────────────────────
const FORBIDDEN = new Set(['__proto__', 'constructor', 'prototype']);
const COLLECTIONS = { markers: 'id', blocks: 'id', layers: 'ref', views: 'id' };

/** 'topic.field' | 'topic.quiz.field' | 'topic.markers.<id>.field' | 'topic.blocks.<id>.field' | 'topic.layers.<ref>.field' | 'topic.views.<id>.field'
 *  (field 는 점으로 더 들어갈 수 있음) → {topic, path}. path 칸: 문자열 = 객체 키, {coll, id} = 그 목록에서 id(레이어는 ref)로 찾기. */
export function parseKey(k) {
  const parts = String(k).split('.');
  if (parts.length < 2 || parts.some((p) => !p)) throw new Error(`고침 키 형식 오류: ${k}`);
  const bad = parts.find((p) => FORBIDDEN.has(p));
  if (bad) throw new Error(`고침 키에 쓸 수 없는 이름 ${bad}: ${k}`);
  if (parts.some((p) => /[[\]]/.test(p))) throw new Error(`고침 키에 번호([i])는 쓰지 않는다 — blocks.<id> 꼴로: ${k}`);
  const [topic, ...rest] = parts;
  if (rest[0] in COLLECTIONS) {
    if (rest.length < 3) throw new Error(`고침 키 형식 오류(${rest[0]}.<id>.field): ${k}`);
    return { topic, path: [{ coll: rest[0], id: rest[1] }, ...rest.slice(2)] };
  }
  return { topic, path: rest };
}

/** topics(목록)에 고침을 덮은 새 목록. from 필수(null = 그 칸이 없어야 함). 대상이 없거나, 칸이 없는데 from 이 null 이 아니거나,
 *  from 이 지금 값과 다르면 오류. 입력은 바꾸지 않는다. */
export function applyOverrides(topics, items) {
  const out = structuredClone(topics);
  for (const [k, o] of Object.entries(items ?? {})) {
    const { topic, path: p } = parseKey(k);
    if (!o || typeof o !== 'object' || !('from' in o) || !('value' in o)) throw new Error(`고침 ${k}: value·from 이 모두 있어야 함(from: null = 칸이 없던 것)`);
    let node = out.find((t) => t.id === topic);
    if (!node) throw new Error(`고침 ${k}: 주제 ${topic} 없음`);
    for (let i = 0; i < p.length - 1; i++) {
      const s = p[i];
      const next = typeof s === 'object' ? (node[s.coll] ?? []).find((x) => x[COLLECTIONS[s.coll]] === s.id) : (Object.hasOwn(node, s) ? node[s] : undefined);
      if (next == null || typeof next !== 'object') throw new Error(`고침 ${k}: ${typeof s === 'object' ? `${s.coll}.${s.id}` : s} 없음`);
      node = next;
    }
    const field = p[p.length - 1];
    const has = Object.hasOwn(node, field);
    if (o.from === null) { if (has) throw new Error(`고침 ${k}: from 이 null(없던 칸)인데 지금 값 ${JSON.stringify(node[field])} 이 있음 — 낡은 고침`); }
    else if (!has) throw new Error(`고침 ${k}: 칸 ${field} 없음(새 칸이면 from: null)`);
    else if (!isEqual(node[field], o.from)) throw new Error(`고침 ${k}: 낡은 고침 — 지금 값 ${JSON.stringify(node[field])} ≠ from ${JSON.stringify(o.from)}`);
    node[field] = structuredClone(o.value);
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
/** GeoJSON 레이어의 모든 좌표 범위. */
export function layerView(gj) {
  const ll = [];
  const walk = (a) => { if (typeof a[0] === 'number') ll.push(a); else a.forEach(walk); };
  for (const f of gj.features) if (f.geometry) walk(f.geometry.coordinates);
  if (!ll.length) throw new Error(`${gj.properties?.id}: 좌표 없음`);
  const lons = ll.map((p) => p[0]), lats = ll.map((p) => p[1]);
  const b = [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)].map(r3);
  return { center: [r3((b[0] + b[2]) / 2), r3((b[1] + b[3]) / 2)], bounds: b };
}

// ── 원본 표기·검사 ────────────────────────────────────────────────────────
const isProvenance = (k) => k === 'src' || (k.endsWith('Src') && k.length > 3) || k === 'why' || k.startsWith('_');
/** 원본 표기 키(src·…Src·why·_…)를 뺀 깊은 복사. */
export function strip(o) {
  if (Array.isArray(o)) return o.map(strip);
  if (o && typeof o === 'object') return Object.fromEntries(Object.entries(o).filter(([k]) => !isProvenance(k)).map(([k, v]) => [k, strip(v)]));
  return o;
}
/** 객체 키가 allowed(+ 원본 표기) 안에만 있는지 → 경고 목록. src 는 text 가, fooSrc 는 foo 가 허용될 때만. */
function unknownKeys(o, allowed, where) {
  const ok = new Set(allowed), W = [];
  if (!o || typeof o !== 'object') return [`${where}: 객체가 아님`];
  for (const k of Object.keys(o)) {
    if (k === 'why' || k.startsWith('_') || ok.has(k)) continue;
    if (k === 'src' && ok.has('text')) continue;
    if (k.endsWith('Src') && ok.has(k.slice(0, -3))) continue;
    W.push(`${where}: 모르는 키 ${k}`);
  }
  return W;
}
const dupes = (ids) => ids.filter((x, i) => ids.indexOf(x) !== i);

/** 원본(고침 적용 뒤) 형식 검사 → 경고 목록. */
export function validateTopics(topics, schema) {
  const W = [];
  for (const d of new Set(dupes(topics.map((t) => t.id)))) W.push(`주제 id 중복: ${d}`);
  for (const t of topics) {
    const at = t.id ?? '(id 없음)';
    W.push(...unknownKeys(t, schema.topic, at));
    if (!t.id || !t.title) W.push(`${at}: id·title 필수`);
    if (t.view) W.push(...unknownKeys(t.view, schema.view, `${at}.view`));
    for (const v of t.views ?? []) { W.push(...unknownKeys(v, schema.view, `${at}.views.${v.id}`)); if (!v.id || !v.label) W.push(`${at}.views: id·label 필수`); }
    for (const l of t.layers ?? []) W.push(...unknownKeys(l, schema.layer, `${at}.layers.${l.ref}`));
    for (const m of t.markers ?? []) {
      const w = `${at}.markers.${m.id}`;
      W.push(...unknownKeys(m, schema.marker, w));
      if (m.lonlatFrom) W.push(...unknownKeys(m.lonlatFrom, schema.lonlatFrom, `${w}.lonlatFrom`));
      if (m.source) W.push(...unknownKeys(m.source, schema.source, `${w}.source`));
      if (m.quiz) W.push(...unknownKeys(m.quiz, schema.markerQuiz, `${w}.quiz`));
    }
    for (const b of t.blocks ?? []) {
      const w = `${at}.blocks.${b.id ?? '(id 없음)'}`, bt = schema.blockTypes[b.type];
      if (!b.id) W.push(`${w}: id 필수`);
      if (!bt) { W.push(`${w}: 모르는 블록 종류 ${b.type}`); continue; }
      W.push(...unknownKeys(b, ['id', 'type', ...bt.allowed], w));
    }
    if (t.quiz) {
      const qt = schema.quizTypes[t.quiz.type];
      if (!qt) W.push(`${at}.quiz: 모르는 퀴즈 종류 ${t.quiz.type}`); else W.push(...unknownKeys(t.quiz, qt, `${at}.quiz`));
    }
    for (const [coll, idKey] of Object.entries(COLLECTIONS)) for (const d of new Set(dupes((t[coll] ?? []).map((x) => x[idKey])))) W.push(`${at}.${coll}: id 중복 ${d}`);
  }
  return W;
}

// ── 풀기 ─────────────────────────────────────────────────────────────────
/** 쪽 이미지 파일 이름(설정 pageFile). */
export const pageFileName = (pf, page) => `${pf.prefix}${String(page).padStart(pf.pad, '0')}${pf.ext}`;

function makeContext(inp) {
  const { cfg } = inp;
  const ctx = { inp, cfg, W: [], usedCharts: new Set(), photoBy: new Map(inp.photos.map((p) => [p.id, p])) };
  ctx.view = (v, where) => {
    if (v.map) {
      const m = inp.mapsById[v.map];
      if (!m) { ctx.W.push(`${where}: 지도 ${v.map} 없음`); return null; }
      return { map: v.map, ...frameView(inp.fits(v.map), m.bbox, cfg.viewGrid, cfg.viewPercentile) };
    }
    if (v.layer) { const gj = inp.layerFile(v.layer); if (!gj) { ctx.W.push(`${where}: 레이어 ${v.layer} 없음`); return null; } return { layer: v.layer, ...layerView(gj) }; }
    if (v.center && v.bounds) return { center: v.center, bounds: v.bounds };
    ctx.W.push(`${where}: 보기에 map·layer·center+bounds 가 없음`); return null;
  };
  ctx.photo = (id, where) => {
    const p = ctx.photoBy.get(id);
    if (!p) { ctx.W.push(`${where}: 사진 ${id} 이 photos.json 에 없음`); return null; }
    const o = { id };
    cfg.photoExts.forEach((ext, i) => {
      const rel = `${cfg.photoDir}/${id}${ext}`;
      if (!inp.exists(rel)) ctx.W.push(`${where}: 사진 파일 ${rel} 없음`);
      o[i === 0 ? 'url' : ext.slice(1)] = inp.assetUrl(rel);
    });
    o.width = p.width; o.height = p.height;
    for (const k of ['mask', 'credit', 'pin']) if (p[k] != null) o[k] = p[k];
    return o;
  };
  ctx.place = (name, where) => {
    const hit = inp.places.filter((p) => key(p.name) === key(name));
    if (hit.length !== 1) { ctx.W.push(`${where}: 지명 「${name}」 ${hit.length}개`); return null; }
    return [hit[0].lon, hit[0].lat];
  };
  ctx.chart = (id, where) => { if (!inp.charts[id]) ctx.W.push(`${where}: 그래프 ${id} 없음`); ctx.usedCharts.add(id); };
  return ctx;
}

function resolveLayers(ctx, t, at) {
  return (t.layers ?? []).map((l) => {
    const gj = ctx.inp.layerFile(l.ref), where = `${at}.layers.${l.ref}`;
    if (!gj) { ctx.W.push(`${where}: 레이어 파일 없음`); return l; }
    const props = gj.properties ?? {}, type = props.layerType ?? (gj.url ? 'image' : null);
    if (l.type !== type) ctx.W.push(`${where}: type ${l.type} ≠ 레이어 ${type}`);
    const r = { ...l, label: l.label ?? props.title };
    if (!r.label) ctx.W.push(`${where}: label 없음(레이어에 제목도 없음)`);
    if (props.approx) { r.approx = true; r.approxNote = '위치 근사'; if (props.approxReason) r.approxReason = props.approxReason; }
    return r;
  });
}

function resolveMarkers(ctx, t0, at) {
  const { cfg, inp } = ctx, optionalWith = cfg.schema.markerTextOptionalWith;
  return (t0.markers ?? []).map((m0) => {
    const m = strip(m0), where = `${at}.markers.${m.id}`;
    const p = m.photo ? ctx.photoBy.get(m.photo) : null;
    const r = { id: m.id };
    if (m.photo) r.photo = ctx.photo(m.photo, where);
    r.title = m.title ?? p?.title ?? p?.caption;
    const text = m.text ?? (p?.title ? p.caption : undefined);
    if (text !== undefined) r.text = text;
    const pin = p?.lonlat ?? null;
    if (m0.lonlat) { r.lonlat = m0.lonlat.map(r5); r.lonlatFrom = 'source'; if (!m.source?.url) ctx.W.push(`${where}: 위치 출처(source.url) 없음`); }
    else if (m0.lonlatFrom?.place) { r.lonlat = ctx.place(m0.lonlatFrom.place, where); r.lonlatFrom = 'place'; r.place = m0.lonlatFrom.place; }
    else if (pin) { r.lonlat = pin; r.lonlatFrom = 'pin'; if (p.map && inp.fits(p.map)?.approx) r.approx = true; }
    else ctx.W.push(`${where}: 위치 없음(lonlat·lonlatFrom·사진 핀)`);
    if (pin && r.lonlatFrom !== 'pin') r.textbookLonlat = pin;
    if (m.chart) { ctx.chart(m.chart, where); r.chart = m.chart; }
    if (m.source) r.source = m.source;
    if (m.quiz) r.quiz = m.quiz;
    if (!r.title) ctx.W.push(`${where}: 제목 없음`);
    if (!r.text && !(optionalWith && m[optionalWith])) ctx.W.push(`${where}: 글 없음(${optionalWith} 가 있는 마커만 생략 가능)`);
    return r;
  });
}

function resolveBlocks(ctx, t, t0, at) {
  const { cfg, inp } = ctx;
  return (t.blocks ?? []).map((b) => {
    const where = `${at}.blocks.${b.id}`, r = { ...b };
    if (b.type === 'photo') {
      const p = ctx.photoBy.get(b.ref); r.photo = ctx.photo(b.ref, where); delete r.ref;
      const title = b.title ?? p?.title; if (title !== undefined) r.title = title;
      r.text = b.text ?? p?.caption;
    } else if (b.photo) {
      const p = ctx.photoBy.get(b.photo); r.photo = ctx.photo(b.photo, where);
      r.text = b.text ?? p?.caption;
    }
    if (b.type === 'chart') ctx.chart(b.ref, where);
    if (b.chart) ctx.chart(b.chart, where);
    for (const c of b.charts ?? []) ctx.chart(c, where);
    if (b.type === 'page') {
      if (!t.pages.includes(b.page)) ctx.W.push(`${where}: 주제 쪽 밖 ${b.page}`);
      const rel = `${cfg.pageDir}/${pageFileName(cfg.pageFile, b.page)}`;
      if (!inp.exists(rel)) ctx.W.push(`${where}: 쪽 이미지 ${rel} 없음`);
      r.url = inp.assetUrl(rel);
    }
    const req = cfg.schema.blockTypes[b.type]?.required ?? [];
    for (const k of req) { const v = r[k] ?? b[k]; if (v == null || v === '') ctx.W.push(`${where}: ${k} 없음`); }   // 사진 블록 ref 는 photo 로 바뀜
    if (b.view && !(t0.views ?? []).some((v) => v.id === b.view)) ctx.W.push(`${where}: 없는 보기 ${b.view}`);
    return r;
  });
}

function resolveQuiz(ctx, t, markers, at) {
  const quiz = t.quiz ?? null;
  if (quiz?.type === 'coloring') {
    const c = ctx.inp.coloring;
    return { type: 'coloring', page: c.page, map: c.map, countries: c.countries };
  }
  if (quiz?.type === 'heritage') {
    if (!quiz.answerKey) ctx.W.push(`${at}.quiz: 정답 원문(answerKey) 없음`);
    return { ...quiz, items: markers.map((m) => ({ marker: m.id, ...m.quiz })) };
  }
  return quiz;
}

function checkTotals(ctx, out) {
  const { cfg, inp } = ctx, ex = cfg.expect, W = [], by = Object.fromEntries(out.map((t) => [t.id, t]));
  if (!isEqual(out.map((t) => t.id), ex.topics)) W.push(`주제 순서 ${out.map((t) => t.id)} ≠ ${ex.topics}`);
  const pages = new Set(out.flatMap((t) => t.pages));
  for (let p = cfg.pages[0]; p <= cfg.pages[1]; p++) if (!pages.has(p)) W.push(`${p}쪽을 덮는 주제 없음`);
  for (const [id, n] of Object.entries(ex.markers)) if (by[id]?.markers.length !== n) W.push(`${id} 마커 ${by[id]?.markers.length} ≠ ${n}`);
  for (const [id, n] of Object.entries(ex.chartMarkers)) { const k = by[id]?.markers.filter((m) => m.chart).length; if (k !== n) W.push(`${id} 그래프 마커 ${k} ≠ ${n}`); }
  if (inp.coloring.countries.length !== ex.coloringCountries) W.push(`색칠하기 나라 ${inp.coloring.countries.length} ≠ ${ex.coloringCountries}`);
  if (Object.keys(inp.charts).length !== ex.charts) W.push(`그래프 ${Object.keys(inp.charts).length} ≠ ${ex.charts}`);
  for (const id of Object.keys(inp.charts)) if (!ctx.usedCharts.has(id)) W.push(`그래프 ${id}: 어느 주제도 참조하지 않음`);
  return W;
}

/** 입력(메모리) → {topics, charts, layerRefs, warnings}. 같은 입력이면 같은 결과(키 순서까지). */
export function buildContent(inp) {
  const ctx = makeContext(inp);
  let topics;
  try { topics = applyOverrides(inp.topics, inp.overrides); }
  catch (e) { return { topics: [], charts: {}, layerRefs: [], warnings: [e.message] }; }
  ctx.W.push(...validateTopics(topics, inp.cfg.schema));
  const out = topics.map((t0) => {
    const t = strip(t0), at = t.id;
    const o = { id: t.id, title: t.title, pages: t.pages };
    o.view = ctx.view(t0.view ?? {}, `${at}.view`);
    if (t0.views) o.views = t0.views.map((v) => ({ id: v.id, label: v.label, ...ctx.view(v, `${at}.views.${v.id}`) }));
    o.layers = resolveLayers(ctx, t, at);
    o.markers = resolveMarkers(ctx, t0, at);
    // 핀 번호 보이기(20쪽 활동하기 1 은 'hidden' — 교과서 핀이 번호 없는 빈칸, 학생이 사진 번호를 씀). 'shown' 이 기본이라 적지 않음
    if (t.pinNumbers != null) {
      if (t.pinNumbers === 'hidden' || t.pinNumbers === 'shown') { if (t.pinNumbers === 'hidden') o.pinNumbers = 'hidden'; }
      else ctx.W.push(`${at}.pinNumbers: 'hidden' | 'shown' 이어야 함 — ${JSON.stringify(t.pinNumbers)}`);
    }
    if (o.view) for (const m of o.markers) if (m.lonlat) {   // 주제 보기 범위는 마커를 모두 담도록 넓힌다
      const g = inp.cfg.markerMargin, b = o.view.bounds;
      o.view.bounds = [Math.min(b[0], m.lonlat[0] - g), Math.min(b[1], m.lonlat[1] - g), Math.max(b[2], m.lonlat[0] + g), Math.max(b[3], m.lonlat[1] + g)].map(r3);
    }
    o.blocks = resolveBlocks(ctx, t, t0, at);
    o.quiz = resolveQuiz(ctx, t, o.markers, at);
    return o;
  });
  ctx.W.push(...checkTotals(ctx, out));
  const chartsOut = Object.fromEntries(Object.keys(inp.charts).sort().map((id) => [id, { id, ...inp.charts[id] }]));
  const layerRefs = [...new Set(out.flatMap((t) => t.layers.map((l) => l.ref)))].sort();
  return { topics: out, charts: chartsOut, layerRefs, warnings: [...new Set(ctx.W)] };
}

/** 참조 레이어를 정적 import 로 묶는 모듈 글. refs 는 정렬된 id 목록(영숫자·_·- 만). outDir = 생성물 폴더(머리 주석 경로, 기본 단원 dataDir). */
export function layersModule(refs, outDir = UNIT.dataDir) {
  for (const r of refs) if (!/^[\w-]+$/.test(r)) throw new Error(`레이어 ref 에 쓸 수 없는 글자: ${JSON.stringify(r)}`);
  const rel = path.relative(REPO, path.join(outDir, 'layers.js')).split(path.sep).join('/');
  return ['// © 2026 김용현',
    `// ${rel} — 생성물(scripts/atlas/build_content.mjs, 직접 고치지 않음): 주제가 참조하는 레이어를 정적 import 로 묶는다(fetch 금지).`,
    ...refs.map((r, i) => `import L${i} from './${r}.json';`),
    'export default {',
    ...refs.map((r, i) => `  '${r}': L${i},`),
    '};', ''].join('\n');
}

// ── 입력·낡은 산출물 검사 ─────────────────────────────────────────────────
/** 도장 확인: 기록된 해시 ≠ 지금 다시 계산한 해시면 오류(무엇을 먼저 돌릴지). */
export function checkStamp(unit, name, recorded, fix) {
  const now = stampHash(unit, name);
  if (recorded !== now) throw new Error(`${name} 이(가) 지금 코드·설정·입력과 맞지 않음(도장 ${recorded ? recorded.slice(0, 12) : '없음'} ≠ ${now.slice(0, 12)}) — ${fix} 먼저`);
}

/** 설정·파일에서 입력을 읽는다(도장 확인 포함). */
export function loadInputs() {
  const unit = readJson(CONFIG), cfg = unit.content, pc = unit.photos;
  const st = cfg.stamps, stampOf = (s) => (fs.existsSync(stampPath(s.stamp)) ? readJson(stampPath(s.stamp)).inputsHash : null);
  checkStamp(unit, 'topics', stampOf(st.topics), 'python -I scripts/atlas/extract_text.py --check(또는 --fill)');
  checkStamp(unit, 'charts', stampOf(st.charts), 'python -I scripts/atlas/extract_tables.py --charts');
  const coloring = readJson(path.join(REPO, cfg.coloringOut));
  checkStamp(unit, 'coloring', coloring.inputsHash, 'node scripts/atlas/coloring_quiz.mjs --write');
  const outDir = path.join(REPO, cfg.out);
  const maps = readJson(path.resolve(path.dirname(CONFIG), unit.maps));
  const fitCache = new Map(), layerCache = new Map();
  return {
    cfg, overrides: readJson(path.join(REPO, cfg.overrides)).items,
    topics: readJson(path.join(REPO, cfg.topics)),
    photos: readJson(path.join(REPO, cfg.photos)),
    charts: readJson(`${WORK}/${cfg.charts}`),
    places: readJson(path.join(REPO, cfg.places)),
    coloring,
    mapsById: Object.fromEntries(maps.map((m) => [m.id, m])),
    fits: (id) => { if (!fitCache.has(id)) fitCache.set(id, loadFit(id)); return fitCache.get(id); },
    layerFile: (ref) => {
      if (!layerCache.has(ref)) { const f = path.join(outDir, `${ref}.json`); layerCache.set(ref, fs.existsSync(f) ? readJson(f) : null); }
      return layerCache.get(ref);
    },
    // 저장소 기준 경로(assetDir 아래) → 공개 주소
    assetUrl: (rel) => `${pc.assetBase}${pc.assetPrefix}${path.relative(pc.assetDir, rel).split(path.sep).join('/')}`,
    exists: (rel) => fs.existsSync(path.join(REPO, rel)),
    outDir,
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const bad = stripUnitArgs(process.argv.slice(2)).rest.filter((a) => a !== '--force');
  if (bad.length) { console.error(`모르는 옵션: ${bad.join(' ')} (쓸 수 있는 것: --force)`); process.exit(2); }
  const force = process.argv.includes('--force');
  try {
    const inp = loadInputs();
    const r = buildContent(inp);
    console.log(`주제 ${r.topics.length}개, 그래프 ${Object.keys(r.charts).length}개, 레이어 ${r.layerRefs.length}개`);
    if (!r.warnings.length || force) {
      const files = [['topics.json', JSON.stringify(r.topics) + '\n'], ['charts.json', JSON.stringify(r.charts) + '\n'], ['layers.js', layersModule(r.layerRefs, inp.outDir)]];
      for (const [name, text] of files) {   // layers.js 맨 나중(앞 단계가 실패하면 import 목록이 바뀌지 않게)
        const f = path.join(inp.outDir, name);
        console.log(`  ${path.relative(REPO, f)} (${writeIfChanged(f, text) ? `${Buffer.byteLength(text).toLocaleString()} B 씀` : '같음, 그대로'})`);
      }
    } else console.log('경고가 있어 쓰지 않음(--force 로 강제)');
    if (r.warnings.length) { console.log(`\n경고 ${r.warnings.length}개:`); for (const w of r.warnings) console.log('  - ' + w); process.exit(1); }
    console.log('경고 없음');
  } catch (e) { console.error(e.message); process.exit(1); }
}
