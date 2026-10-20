// © 2026 김용현
// scripts/atlas/build_layers.mjs — 주제도 내용(지면 pt) → 경위도 GeoJSON 레이어 <config.out>/layer-<id>.json
//   node scripts/atlas/build_layers.mjs [id ...|all] [--verify] [--extract]
//   설정: scripts/atlas/config/u2.json (레이어별 map·type·tol·minArea·expectLegend·source, defaults.maxDroppedFrac)
//   0. 원통 도법 지도(세계 지도)는 경위도로 되돌릴 수 있는 지면 범위를 $ATLAS_WORK/geo/<map>.domain.json 에 쓴다(features.py 가 면을 그 안으로 자름).
//   1. python -I scripts/atlas/extract_vectors.py --features <id ...> → $ATLAS_WORK/vec/<id>.features.json (없거나 --extract 면, 한 프로세스로)
//   2. makeConverter(fit).invert 로 점마다 경위도. 실패한 점이 maxDroppedFrac 를 넘거나 면 고리가 점을 잃으면 멈춘다.
//      고리·선 안에서 경도를 앞 점에 이어 붙이고(±360), 구멍은 바깥 고리와 평균 경도가 같은 쪽으로 맞춘다.
//   3. $ATLAS_WORK/geo/<id>.raw.geojson → python -I scripts/atlas/clip_land.py <id ...> (한 프로세스: 육지·덮개 단순화·0.001° 격자·감김·날짜변경선 선 나누기)
//   4. layer-<id>.json. 맨 위 properties: {id, map, page, title, kind, layerType, approx, source, winding:'cw', legend[present, shape?]}.
//      기호 properties 에는 value·anchor, 지시선 막대면 barAt(막대 밑 가운데 경위도)도.
//   --verify: 레이어를 같은 fit 으로 지면에 되돌려 교과서 렌더와 겹친 그림 $ATLAS_WORK/shots/c1/<id>.png
//   source:'ne'(p22-kashmir)는 PDF 도형 대신 python -I scripts/atlas/kashmir.py 가 Natural Earth 로 만든다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { makeConverter } from './georef.mjs';
import { WORK, loadFit } from './geo_util.mjs';
import { resolveUnit, stripUnitArgs } from './unit.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..', '..');
const UNIT = resolveUnit();   // 단원 고르기(--unit uN · env ATLAS_UNIT · 옛 ATLAS_UNIT_CONFIG, 기본 u2) — scripts/atlas/unit.mjs
const CONFIG_FILE = UNIT.configPath;
const PY = process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
const CYLINDRICAL = new Set(['miller', 'robinson', 'equirectangular', 'mercator']);
const DOMAIN_EPS_DEG = 0.05;   // 도메인 경계: 중심 경도 ± (180 − 이 값)
const DOMAIN_LAT = 85;
const VERIFY_TARGET_PX = 900;  // 검증 그림 긴 변 목표(화소)

const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
const maps = Object.fromEntries(JSON.parse(fs.readFileSync(UNIT.mapsPath, 'utf8')).map((m) => [m.id, m]));   // 설정 maps(없으면 maps_<id>.json)
const OUT = UNIT.dataDir;                                                                                // 설정 out(없으면 sims/<sim>/data)
export const LAYERS = Object.entries(config.layers).map(([id, l]) => ({ ...config.defaults, ...l, id }));

const run = (args) => {
  const r = spawnSync(PY, ['-I', ...args], { cwd: root, encoding: 'utf8', maxBuffer: 1 << 26, env: UNIT.childEnv() }); // 자식도 같은 단원
  if (r.status !== 0) throw new Error(`${PY} ${args.join(' ')} 실패\n${r.stdout}\n${r.stderr}`);
  return r.stdout;
};
const r3 = (v) => Math.round(v * 1000) / 1000;

/** fit → 변환기. 만들 수 없으면 레이어 id 와 함께 멈춘다. */
function converter(layer, fit) {
  const cv = makeConverter(fit);
  if (!cv) throw new Error(`${layer.id}: ${layer.map}.fit.json 으로 변환기를 만들 수 없음`);
  return cv;
}

/** 지면 점 배열 → 경위도 점 배열(null 은 빼고, 경도는 바로 앞 점과 이어지게 ±360). [점들, 뺀 수] */
export function convertPath(cv, pts) {
  const out = []; let dropped = 0, prev = null;
  for (const p of pts) {
    const ll = cv.invert(p);
    if (!ll) { dropped++; continue; }
    let [lon, lat] = ll;
    if (prev) { while (lon - prev[0] > 180) lon -= 360; while (lon - prev[0] < -180) lon += 360; }
    out.push([lon, lat]); prev = out[out.length - 1];
  }
  return [out, dropped];
}

const meanLon = (R) => R.reduce((a, p) => a + p[0], 0) / R.length;
/** 구멍 고리를 바깥 고리와 평균 경도가 가까운 쪽(±360k)으로 옮긴다. */
export function alignHole(ext, hole) {
  const k = Math.round((meanLon(ext) - meanLon(hole)) / 360);
  return k ? hole.map(([x, y]) => [x + 360 * k, y]) : hole;
}
const closed = (R) => R.length > 0 && R[0][0] === R[R.length - 1][0] && R[0][1] === R[R.length - 1][1];

/** 원통 도법 fit → 경위도로 되돌릴 수 있는 지면 범위(GeoJSON Polygon, 지면 pt). 그 밖의 도법은 null. */
export function domainPolygon(fit) {
  if (!CYLINDRICAL.has(fit.family)) return null;
  const cv = makeConverter(fit), c = fit.params[0], a = c - 180 + DOMAIN_EPS_DEG, b = c + 180 - DOMAIN_EPS_DEG;
  const ring = [];
  for (let lon = a; lon <= b; lon += 1) ring.push([lon, -DOMAIN_LAT]);
  for (let lat = -DOMAIN_LAT; lat <= DOMAIN_LAT; lat += 1) ring.push([b, lat]);
  for (let lon = b; lon >= a; lon -= 1) ring.push([lon, DOMAIN_LAT]);
  for (let lat = DOMAIN_LAT; lat >= -DOMAIN_LAT; lat -= 1) ring.push([a, lat]);
  const xy = ring.map((p) => cv.apply(p));
  if (xy.some((p) => !p)) throw new Error(`${fit.id}: 도메인 경계를 지면으로 옮길 수 없음`);
  xy.push(xy[0]);
  return { type: 'Polygon', coordinates: [xy] };
}

function convert(layer, feat, fit) {
  const cv = converter(layer, fit);
  let dropped = 0, total = 0;
  const features = [];
  const ring = (R, what) => {
    total += R.length;
    const [o, d] = convertPath(cv, R); dropped += d;
    if (d) throw new Error(`${layer.id}: ${what} 고리에서 역변환 실패 점 ${d}/${R.length} — 면은 점을 잃으면 안 됨(도메인 자르기 확인)`);
    if (!closed(o)) o.push(o[0]);
    return o.length >= 4 ? o : null;
  };
  for (const p of feat.polys) {
    const polys = [];
    for (const poly of p.polygons) {
      const ext = ring(poly[0], p.label); if (!ext) continue;
      const holes = poly.slice(1).map((h) => ring(h, p.label)).filter(Boolean).map((h) => alignHole(ext, h));
      polys.push([ext, ...holes]);
    }
    if (!polys.length) continue;
    const props = { type: 'area', cls: p.cls, label: p.label, color: p.color };
    if (p.pattern) props.pattern = p.pattern;
    features.push({ type: 'Feature', properties: props, geometry: { type: 'MultiPolygon', coordinates: polys } });
  }
  for (const s of feat.symbols) {
    total++;
    const ll = cv.invert(s.xy);
    if (!ll) { dropped++; continue; }
    // label: 말풍선 글. 이름이 있으면 이름(사원·나라), 없으면 범례 항목(석유, 크리스트교 …). 이름이 있는 것만 name 도 둔다.
    const props = { type: 'symbol', cls: s.cls, kind: s.kind, label: s.label ?? s.kind, color: s.color, size: s.size };
    if (s.label != null) props.name = s.label;
    for (const k of ['value', 'anchor']) if (s[k] != null) props[k] = s[k];
    // 인구 막대: 지시선 끝(나라 위치)과 따로 놓인 막대 밑 가운데(barAt, 경위도)
    if (s.bar) {
      const b = cv.invert(s.bar);
      if (!b) throw new Error(`${layer.id}: 막대 자리 ${s.bar} 를 경위도로 되돌릴 수 없음`);
      props.barAt = b.map(r3);
    }
    features.push({ type: 'Feature', properties: props, geometry: { type: 'Point', coordinates: ll } });
  }
  for (const l of feat.lines) {
    total += l.points.length;
    const [o, d] = convertPath(cv, l.points); dropped += d;
    if (o.length < 2) continue;
    const props = { type: l.kind === 'isotherm' ? 'isotherm' : 'flow', cls: l.cls, kind: l.kind, color: l.color };
    for (const k of ['value', 'valueRank', 'width', 'widthPt', 'dir', 'label']) if (l[k] != null) props[k] = l[k];
    features.push({ type: 'Feature', properties: props, geometry: { type: 'LineString', coordinates: o } });
  }
  if (total && dropped / total > layer.maxDroppedFrac) {
    throw new Error(`${layer.id}: 역변환 실패 점 ${dropped}/${total} > ${layer.maxDroppedFrac * 100}%`);
  }
  return { features, dropped, total };
}

function prepare(layers, { extract }) {
  // 0. 도메인
  for (const l of layers) {
    if (l.source === 'ne') continue;
    const dom = domainPolygon(loadFit(l.map));
    const f = `${WORK}/geo/${l.map}.domain.json`;
    if (dom) fs.writeFileSync(f, JSON.stringify(dom)); else if (fs.existsSync(f)) fs.unlinkSync(f);
  }
  // 1. 뽑기(한 프로세스)
  const need = layers.filter((l) => l.source !== 'ne' && (extract || !fs.existsSync(`${WORK}/vec/${l.id}.features.json`))).map((l) => l.id);
  if (need.length) process.stdout.write(run([path.join(here, 'extract_vectors.py'), '--features', ...need]));
  if (layers.some((l) => l.source === 'ne')) run([path.join(here, 'kashmir.py')]);
}

function toRaw(layer) {
  const m = maps[layer.map];
  if (layer.source === 'ne') {
    const raw = JSON.parse(fs.readFileSync(`${WORK}/geo/${layer.id}.raw.geojson`, 'utf8'));
    return { meta: { ...raw.properties, approx: !!raw.properties.approx, convert: null, warnings: [] } }; // 카슈미르: 종교 면 안쪽 경계가 근사(kashmir.py)
  }
  const feat = JSON.parse(fs.readFileSync(`${WORK}/vec/${layer.id}.features.json`, 'utf8'));
  const fit = loadFit(layer.map);
  const { features, dropped, total } = convert(layer, feat, fit);
  const meta = {
    id: layer.id, source: `교과서 22개정 중학 사회과 부도 ${m.page}쪽 (경위도 맞추기: ${fit.family})`,
    approx: !!fit.approx, ...(fit.approx ? { approxReason: fit.approxReason } : {}),
    legend: feat.legend, convert: { points: total, dropped }, warnings: feat.report.warnings || [],
  };
  fs.writeFileSync(`${WORK}/geo/${layer.id}.raw.geojson`, JSON.stringify({ type: 'FeatureCollection', properties: meta, features }));
  return { meta };
}

function roundGeom(g) {
  const pt = ([x, y]) => [r3(x), r3(y)];
  switch (g.type) {
    case 'Point': return { type: g.type, coordinates: pt(g.coordinates) };
    case 'LineString': return { type: g.type, coordinates: g.coordinates.map(pt) };
    case 'MultiLineString': return { type: g.type, coordinates: g.coordinates.map((L) => L.map(pt)) };
    case 'MultiPolygon': return { type: g.type, coordinates: g.coordinates.map((p) => p.map((r) => r.map(pt))) };
    default: throw new Error(`도형 종류 ${g.type}`);
  }
}

/**
 * 뽑은 범례(box 뺌) → 화면 범례 항목: 설정 legendShapes·legendStrokes·legendGroups·legendColors(+ legendStyles)를 붙인다.
 * 설정 열쇠가 범례에 없는 이름이면 멈춘다. → {legend, colorOfCls(화면 색을 바꾼 분류 → 새 색)}
 */
export function decorateLegend(layer, rawLegend) {
  // 기호 모양(설정 legendShapes: 범례 이름 → 'circle'|'square'|'diamond'|'triangle'|'triangle-down'|'bar') — 앱 기호·범례 견본이 쓴다
  const shapes = layer.legendShapes || {};
  // 기호 테두리(설정 legendStrokes: 범례 이름 → 색 — 회색 석탄처럼 바탕에 묻히는 기호), 범례 묶음(설정 legendGroups: 묶음 이름 → [범례 이름] — 기후 열대·건조…)
  const strokes = layer.legendStrokes || {};
  const groupOf = Object.fromEntries(Object.entries(layer.legendGroups || {}).flatMap(([g, names]) => names.map((n) => [n, g])));
  // 화면 색 바꾸기(설정 legendColors: 범례 이름 → {color, why} — 웹 바탕 위에서 너무 옅은 분류). 범례·도형 색을 바꾸고 인쇄 색은 printColor 로 남긴다.
  const recolor = layer.legendColors || {};
  const legend = (rawLegend || []).map(({ box, ...e }) => ({
    ...e, ...(shapes[e.label] ? { shape: shapes[e.label] } : {}), ...(strokes[e.label] ? { stroke: strokes[e.label] } : {}), ...(groupOf[e.label] ? { group: groupOf[e.label] } : {}),
    ...(recolor[e.label] ? { color: recolor[e.label].color, printColor: e.color } : {}),
  }));
  for (const [key, names] of [['legendShapes', Object.keys(shapes)], ['legendStrokes', Object.keys(strokes)], ['legendGroups', Object.keys(groupOf)], ['legendColors', Object.keys(recolor)]]) {
    const unknown = names.filter((k) => !legend.some((e) => e.label === k));
    if (unknown.length) throw new Error(`${layer.id}: ${key} 에 범례에 없는 이름 ${unknown.join(', ')}`);
  }
  for (const [name, r] of Object.entries(recolor)) if (!/^#[0-9a-f]{6}$/.test(r?.color || '')) throw new Error(`${layer.id}: legendColors ${name} 색 ${r?.color}`);
  const colorOfCls = new Map(legend.filter((e) => e.printColor).map((e) => [e.cls, e.color]));
  return { legend, colorOfCls };
}

function finish(layer, meta) {
  const m = maps[layer.map];
  const clipped = JSON.parse(fs.readFileSync(`${WORK}/geo/${layer.id}.clipped.geojson`, 'utf8'));
  const features = clipped.features.map((f) => ({ type: 'Feature', properties: f.properties, geometry: roundGeom(f.geometry) }));
  const { legend, colorOfCls } = decorateLegend(layer, meta.legend);
  for (const f of features) if (colorOfCls.has(f.properties.cls)) f.properties = { ...f.properties, color: colorOfCls.get(f.properties.cls) };
  const present = new Set(features.map((f) => f.properties.cls));
  const ne = layer.source === 'ne';
  const props = {
    id: layer.id, map: layer.map, page: m.page, title: m.title, kind: m.kind, layerType: layer.type,
    approx: meta.approx, ...(meta.approxReason ? { approxReason: meta.approxReason } : {}),
    source: ne ? 'Natural Earth' : meta.source, ...(ne ? { sourceDetail: meta.source, note: meta.note } : {}),
    winding: 'cw', // 면 바깥 고리 시계 방향(d3-geo 규약), 구멍 반시계
    ...(layer.symbolStyle ? { symbolStyle: layer.symbolStyle } : {}), // 기호 크기 배율·최소/최대 지름(px) — symbolLayer 가 읽음
    legend: legend.map((e) => ({ ...e, present: present.has(e.cls) })),
  };
  fs.mkdirSync(OUT, { recursive: true });
  const file = path.join(OUT, `layer-${layer.id}.json`);
  fs.writeFileSync(file, JSON.stringify({ type: 'FeatureCollection', properties: props, features }));
  const geomLegend = legend.filter((e) => e.geometry !== false);
  const absent = geomLegend.filter((e) => !present.has(e.cls)).map((e) => e.label);
  if (layer.expectLegend != null && legend.length !== layer.expectLegend) throw new Error(`${layer.id}: 범례 ${legend.length} ≠ expectLegend ${layer.expectLegend}`);
  if (absent.length) throw new Error(`${layer.id}: 출력에 없는 범례 분류 ${absent.join(', ')}`);
  return {
    id: layer.id, type: layer.type, legend: geomLegend.length, classes: present.size, features: features.length,
    kb: +(fs.statSync(file).size / 1024).toFixed(1), approx: props.approx,
    dropped: meta.convert ? `${meta.convert.dropped}/${meta.convert.points}` : '-', warnings: meta.warnings,
  };
}

/**
 * 나라 단위 단계구분도(type 'countryClass'): country_class.py 결과($WORK/geo/<id>.cc.json) → layer-<id>.json
 * {type:'countryClass', properties:{id, map, page, title, kind, layerType, approx, source}, legend:[…, present], classes:{iso: cls}, overrides}.
 * 범례 꾸밈(legendColors·legendStyles 등)은 면 레이어와 같다. 웹은 바탕 지도 나라 도형(iso)을 칠한다(src/atlas/countryClass.js).
 */
export function countryClassLayerJson(layer, cc, m, fit) {
  const { legend } = decorateLegend(layer, cc.legend);
  const present = new Set(Object.values(cc.classes));
  const absent = legend.filter((e) => e.geometry !== false && !present.has(e.cls)).map((e) => e.label);
  if (layer.expectLegend != null && legend.length !== layer.expectLegend) throw new Error(`${layer.id}: 범례 ${legend.length} ≠ expectLegend ${layer.expectLegend}`);
  if (absent.length) throw new Error(`${layer.id}: 나라가 없는 범례 분류 ${absent.join(', ')}`);
  return {
    type: 'countryClass',
    properties: {
      id: layer.id, map: layer.map, page: m.page, title: m.title, kind: m.kind, layerType: layer.type,
      approx: !!fit.approx, ...(fit.approx ? { approxReason: fit.approxReason } : {}),
      source: `교과서 22개정 중학 사회과 부도 ${m.page}쪽 (나라별 분류 — Natural Earth 나라 표본점, 경위도 맞추기: ${fit.family})`,
    },
    legend: legend.map((e) => ({ ...e, present: present.has(e.cls) })),
    classes: cc.classes,
    overrides: cc.overrides || [],
  };
}

function finishCountryClass(layer) {
  const cc = JSON.parse(fs.readFileSync(`${WORK}/geo/${layer.id}.cc.json`, 'utf8'));
  const out = countryClassLayerJson(layer, cc, maps[layer.map], loadFit(layer.map));
  fs.mkdirSync(OUT, { recursive: true });
  const file = path.join(OUT, `layer-${layer.id}.json`);
  fs.writeFileSync(file, JSON.stringify(out));
  return {
    id: layer.id, type: layer.type, legend: out.legend.length, classes: new Set(Object.values(out.classes)).size, features: Object.keys(out.classes).length,
    kb: +(fs.statSync(file).size / 1024).toFixed(1), approx: out.properties.approx, dropped: '-', warnings: cc.report?.warnings || [],
  };
}

function verify(layer) {
  const file = path.join(OUT, `layer-${layer.id}.json`);
  const outPng = `${WORK}/shots/c1/${layer.id}.png`;
  fs.mkdirSync(`${WORK}/shots/c1`, { recursive: true });
  if (layer.source === 'ne') { run([path.join(here, 'kashmir.py'), '--verify', file.replace(/\\/g, '/'), outPng]); return outPng; }
  const gj = JSON.parse(fs.readFileSync(file, 'utf8'));
  const m = maps[layer.map];
  const cv = converter(layer, loadFit(layer.map));
  // 경도를 앞 점에 이어 붙인 뒤 투영해야 날짜변경선 근처 고리가 지면에서 끊기지 않는다
  const back = (L) => { let prev = null; return L.map(([x, y]) => { if (prev != null) { while (x - prev > 180) x -= 360; while (x - prev < -180) x += 360; } prev = x; return cv.apply([x, y]); }).filter(Boolean); };
  const areas = [], points = [], paths = [];
  for (const f of gj.features) {
    const p = f.properties, g = f.geometry;
    if (g.type === 'MultiPolygon') areas.push({ color: p.color, pattern: p.pattern, polygons: g.coordinates.map((poly) => poly.map(back)) });
    else if (g.type === 'Point') { const xy = cv.apply(g.coordinates); if (xy) points.push({ xy, color: p.color }); }
    else {
      const lines = g.type === 'LineString' ? [g.coordinates] : g.coordinates;
      lines.forEach((L, i) => paths.push({ points: back(L), color: p.color, width: p.width || 0.4,
        ...(p.type === 'flow' && i === 0 ? { label: `${p.label} ${p.value}`, labelAt: p.dir === 'to-korea' ? 'start' : 'end' } : {}) }));
    }
  }
  const span = Math.max(m.bbox[2] - m.bbox[0], m.bbox[3] - m.bbox[1]);
  const ov = { page: m.page, bbox: m.bbox, dpi: Math.min(300, Math.max(110, Math.round(72 * VERIFY_TARGET_PX / span))), out: outPng, title: `${layer.id} (lon/lat -> page)`, areas, points, paths };
  const ovf = `${WORK}/shots/c1/${layer.id}.overlay.json`;
  fs.writeFileSync(ovf, JSON.stringify(ov));
  run([path.join(here, 'overlay.py'), ovf]);
  return outPng;
}

function main(argv) {
  const flags = new Set(argv.filter((a) => a.startsWith('--')));
  const ids = argv.filter((a) => !a.startsWith('--'));
  const todo = !ids.length || ids.includes('all') ? LAYERS : ids.map((id) => {
    const l = LAYERS.find((x) => x.id === id); if (!l) throw new Error(`모르는 레이어 ${id}`); return l;
  });
  fs.mkdirSync(`${WORK}/geo`, { recursive: true });
  // 나라 단위 단계구분도는 도형을 옮기지 않는다(country_class.py → 나라별 분류만)
  const cc = todo.filter((l) => l.type === 'countryClass');
  const geo = todo.filter((l) => l.type !== 'countryClass');
  const byId = new Map();
  if (geo.length) {
    prepare(geo, { extract: flags.has('--extract') });
    const metas = geo.map((l) => toRaw(l).meta);
    process.stdout.write(run([path.join(here, 'clip_land.py'), ...geo.map((l) => l.id)]));
    geo.forEach((l, i) => {
      const r = finish(l, metas[i]);
      if (flags.has('--verify')) r.png = verify(l);
      byId.set(l.id, r);
    });
  }
  if (cc.length) {
    process.stdout.write(run([path.join(here, 'country_class.py'), ...cc.map((l) => l.id)]));
    for (const l of cc) byId.set(l.id, finishCountryClass(l));
  }
  const rows = todo.map((l) => byId.get(l.id));
  console.log(['id', 'type', 'legend', 'classes', 'features', 'KB', 'approx', 'dropped', 'warnings', 'png'].join('\t'));
  for (const r of rows) console.log([r.id, r.type, r.legend, r.classes, r.features, r.kb, r.approx, r.dropped, r.warnings.length, r.png || ''].join('\t'));
  for (const r of rows) for (const w of r.warnings) console.log(`경고 ${r.id}: ${w}`);
  console.log(`합계 ${rows.reduce((a, r) => a + r.kb, 0).toFixed(1)} KB`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(stripUnitArgs(process.argv.slice(2)).rest);
