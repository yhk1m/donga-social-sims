// © 2026 김용현
// scripts/atlas/build_layers.mjs — 주제도 내용(지면 pt) → 경위도 GeoJSON 레이어 sims/atlas-u2-asia/data/layer-<id>.json
//   node scripts/atlas/build_layers.mjs [id ...|all] [--verify] [--extract]
//   1. $ATLAS_WORK/vec/<id>.features.json (python -I scripts/atlas/extract_vectors.py --features <map>; 없거나 --extract 면 부름)
//   2. $ATLAS_WORK/geo/<map>.fit.json 의 makeConverter(fit).invert 로 점마다 경위도. null(역변환 실패)인 점은 빼고 수를 보고.
//      고리 안에서 경도를 이어 붙여(±360) 날짜변경선을 넘는 고리도 끊기지 않게 한다.
//   3. $ATLAS_WORK/geo/<id>.raw.geojson → python -I scripts/atlas/clip_land.py (육지 자르기·단순화·조각 버림·감김·centroid)
//   4. 좌표 소수 3자리로 써서 layer-<id>.json. 맨 위 properties 에 {id, map, title, kind, approx, source, legend, counts}.
//   --verify: 레이어를 같은 fit 으로 지면에 되돌려 교과서 렌더와 겹친 그림 $ATLAS_WORK/shots/c1/<id>.png
//   p22-kashmir(maps_u2 의 georef:false)는 PDF 도형 대신 python -I scripts/atlas/kashmir.py 가 Natural Earth 로 만든다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { makeConverter } from './georef.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..', '..');
const WORK = (process.env.ATLAS_WORK || 'C:/Users/Public/atlas-work').replace(/\\/g, '/');
const OUT = path.join(root, 'sims', 'atlas-u2-asia', 'data');
const PY = process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
const maps = Object.fromEntries(JSON.parse(fs.readFileSync(path.join(here, 'maps_u2.json'), 'utf8')).map((m) => [m.id, m]));

// 레이어 목록: id(출력 이름) ← map(maps_u2), type, tol(clip_land 단순화 °)
// tol: 단순화 허용치(°). 아시아 전도(약 1:4천만, 1pt ≈ 0.13°)에서 0.13~0.22 ≈ 지면 1~1.7pt(약 0.4~0.6mm).
// minArea: 이보다 작은 조각(°²)은 버린다(섬 부스러기·띠 조각). 합계 ≤ 약 600KB 를 맞추려고 고른 값.
export const LAYERS = [
  { id: 'p21-climate', map: 'p21-climate', type: 'area', tol: 0.2, minArea: 0.5 },
  { id: 'p21-jan', map: 'p21-jan', type: 'area', tol: 0.22, minArea: 0.6 },
  { id: 'p21-jul', map: 'p21-jul', type: 'area', tol: 0.22, minArea: 0.6 },
  { id: 'p22-religion', map: 'p22-religion', type: 'area', tol: 0.13, minArea: 0.25 },
  { id: 'p22-singapore', map: 'p22-singapore', type: 'symbol' },
  { id: 'p22-kashmir', map: 'p22-kashmir', type: 'area', tol: 0.01, ne: true },
  { id: 'p23-growth', map: 'p23-growth', type: 'area', tol: 0.13, minArea: 0.25 },
  { id: 'p23-density-cities', map: 'p23-density', type: 'symbol' },
  { id: 'p24-resources', map: 'p24-resources', type: 'symbol' },
  { id: 'p24-exports', map: 'p24-exports', type: 'area', tol: 0.15, minArea: 0.25 },
  { id: 'p24-trade', map: 'p24-trade', type: 'flow', tol: 0.45, minArea: 2.5 },
];

const run = (args) => {
  const r = spawnSync(PY, ['-I', ...args], { cwd: root, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`${PY} ${args.join(' ')} 실패\n${r.stdout}\n${r.stderr}`);
  return r.stdout;
};
const r3 = (v) => Math.round(v * 1000) / 1000;

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

function convert(layer, feat, fit) {
  const cv = makeConverter(fit);
  let dropped = 0, total = 0;
  const features = [];
  const ring = (R) => { total += R.length; const [o, d] = convertPath(cv, R); dropped += d; if (o.length >= 3) o.push(o[0]); return o.length >= 4 ? o : null; };
  for (const p of feat.polys) {
    const polys = [];
    for (const poly of p.polygons) {
      const ext = ring(poly[0]); if (!ext) continue;
      // 바깥 고리와 경도 기준을 맞춘다
      const holes = poly.slice(1).map(ring).filter(Boolean).map((h) => { const k = Math.round((ext[0][0] - h[0][0]) / 360); return h.map(([x, y]) => [x + 360 * k, y]); });
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
  return { features, dropped, total };
}

function roundGeom(g) {
  const pt = ([x, y]) => [r3(x), r3(y)];
  const line = (L) => L.map(pt).filter((p, i, a) => i === 0 || p[0] !== a[i - 1][0] || p[1] !== a[i - 1][1]);
  switch (g.type) {
    case 'Point': return { type: 'Point', coordinates: pt(g.coordinates) };
    case 'LineString': return { type: g.type, coordinates: line(g.coordinates) };
    case 'MultiLineString': return { type: g.type, coordinates: g.coordinates.map(line) };
    case 'Polygon': return { type: 'MultiPolygon', coordinates: [g.coordinates.map(line).filter((r) => r.length >= 4)] };
    case 'MultiPolygon': return { type: g.type, coordinates: g.coordinates.map((p) => p.map(line).filter((r) => r.length >= 4)).filter((p) => p.length) };
    default: throw new Error(`도형 종류 ${g.type}`);
  }
}

function build(layer, { extract = false } = {}) {
  const m = maps[layer.map];
  let raw, meta = {};
  if (layer.ne) {
    run([path.join(here, 'kashmir.py')]);
    raw = JSON.parse(fs.readFileSync(`${WORK}/geo/${layer.id}.raw.geojson`, 'utf8'));
    meta = { ...raw.properties, approx: false, convert: null };
  } else {
    const ff = `${WORK}/vec/${layer.id}.features.json`;
    if (extract || !fs.existsSync(ff)) run([path.join(here, 'extract_vectors.py'), '--features', layer.map]);
    const feat = JSON.parse(fs.readFileSync(ff, 'utf8'));
    const fit = JSON.parse(fs.readFileSync(`${WORK}/geo/${layer.map}.fit.json`, 'utf8'));
    const { features, dropped, total } = convert(layer, feat, fit);
    meta = {
      id: layer.id, source: '교과서 22개정 중학 사회과 부도 ' + m.page + '쪽 (경위도 맞추기: ' + fit.family + ')',
      approx: !!fit.approx, ...(fit.approx ? { approxReason: fit.approxReason } : {}),
      legend: feat.legend, convert: { points: total, dropped }, extract: feat.report,
    };
    raw = { type: 'FeatureCollection', properties: meta, features };
    fs.mkdirSync(`${WORK}/geo`, { recursive: true });
    fs.writeFileSync(`${WORK}/geo/${layer.id}.raw.geojson`, JSON.stringify(raw));
  }
  const args = [path.join(here, 'clip_land.py'), layer.id];
  if (layer.ne) args.push('--no-land');
  if (layer.tol) args.push('--tol', String(layer.tol));
  if (layer.minArea) args.push('--min-area', String(layer.minArea));
  run(args);
  const clipped = JSON.parse(fs.readFileSync(`${WORK}/geo/${layer.id}.clipped.geojson`, 'utf8'));
  const features = clipped.features.map((f) => ({
    type: 'Feature',
    properties: f.properties.centroid ? { ...f.properties, centroid: f.properties.centroid.map(r3) } : f.properties,
    geometry: roundGeom(f.geometry),
  }));
  const legend = (meta.legend || []).map(({ box, ...e }) => e);
  const present = new Set(features.map((f) => f.properties.cls));
  const props = {
    id: layer.id, map: layer.map, page: m.page, title: m.title, kind: m.kind, layerType: layer.type,
    approx: meta.approx, ...(meta.approxReason ? { approxReason: meta.approxReason } : {}),
    source: layer.ne ? 'Natural Earth' : meta.source, ...(layer.ne ? { sourceDetail: meta.source, note: meta.note } : {}),
    legend: legend.map((e) => ({ ...e, present: present.has(e.cls) })),
  };
  const out = { type: 'FeatureCollection', properties: props, features };
  fs.mkdirSync(OUT, { recursive: true });
  const file = path.join(OUT, `layer-${layer.id}.json`);
  fs.writeFileSync(file, JSON.stringify(out));
  const legendCount = legend.filter((e) => e.geometry !== false).length;
  return {
    id: layer.id, type: layer.type, legend: legendCount, classes: [...present].length, features: features.length,
    kb: +(fs.statSync(file).size / 1024).toFixed(1), approx: props.approx,
    dropped: meta.convert ? `${meta.convert.dropped}/${meta.convert.points}` : '-',
    absent: legend.filter((e) => e.geometry !== false && !present.has(e.cls)).map((e) => e.label),
  };
}

function verify(layer) {
  const file = path.join(OUT, `layer-${layer.id}.json`);
  const gj = JSON.parse(fs.readFileSync(file, 'utf8'));
  const outPng = `${WORK}/shots/c1/${layer.id}.png`;
  fs.mkdirSync(`${WORK}/shots/c1`, { recursive: true });
  if (layer.ne) { run([path.join(here, 'kashmir.py'), '--verify', file.replace(/\\/g, '/'), outPng]); return outPng; }
  const m = maps[layer.map];
  const fit = JSON.parse(fs.readFileSync(`${WORK}/geo/${layer.map}.fit.json`, 'utf8'));
  const cv = makeConverter(fit);
  // 경도를 앞 점에 이어 붙인 뒤 투영해야 날짜변경선 근처 고리가 지면에서 끊기지 않는다
  const back = (L) => { let prev = null; return L.map(([x, y]) => { if (prev != null) { while (x - prev > 180) x -= 360; while (x - prev < -180) x += 360; } prev = x; return cv.apply([x, y]); }).filter(Boolean); };
  const areas = [], points = [], paths = [];
  for (const f of gj.features) {
    const p = f.properties, g = f.geometry;
    if (g.type === 'MultiPolygon') areas.push({ color: p.color, pattern: p.pattern, polygons: g.coordinates.map((poly) => poly.map(back)) });
    else if (g.type === 'Point') { const xy = cv.apply(g.coordinates); if (xy) points.push({ xy, color: p.color }); }
    else if (g.type === 'LineString') {
      paths.push({ points: back(g.coordinates), color: p.color, width: p.width || 0.4,
        ...(p.type === 'flow' ? { label: `${p.label} ${p.value}`, labelAt: p.dir === 'to-korea' ? 'start' : 'end' } : {}) });
    }
  }
  const span = Math.max(m.bbox[2] - m.bbox[0], m.bbox[3] - m.bbox[1]);
  const ov = { page: m.page, bbox: m.bbox, dpi: Math.min(300, Math.max(110, Math.round(72 * 900 / span))), out: outPng, title: `${layer.id} (lon/lat -> page)`, areas, points, paths };
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
  const rows = [];
  for (const l of todo) {
    const r = build(l, { extract: flags.has('--extract') });
    if (flags.has('--verify')) r.png = verify(l);
    rows.push(r);
  }
  console.log(['id', 'type', 'legend', 'classes', 'features', 'KB', 'approx', 'dropped', 'absent', 'png'].join('\t'));
  for (const r of rows) console.log([r.id, r.type, r.legend, r.classes, r.features, r.kb, r.approx, r.dropped, r.absent.join(',') || '-', r.png || ''].join('\t'));
  console.log(`합계 ${rows.reduce((a, r) => a + r.kb, 0).toFixed(1)} KB`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
