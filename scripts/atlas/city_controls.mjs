// © 2026 김용현
// scripts/atlas/city_controls.mjs — 일반도(16·18·19쪽) 경위도 맞추기에 도시 기호 기준점(src:'city')을 더한다
//   node scripts/atlas/city_controls.mjs [--write] [--holdout]
//   설정: scripts/atlas/config/u2.json 의 cityControls (maps·madK·localK·localFloorPt·minSpacingPt·folds·seed)
//   왜: 이 세 지도는 경위선 교차점(src:'grid')이 지도 안쪽에만 있어 가장자리 도시가 수십~100km 어긋났다(18쪽 에르데네트 108km).
//   교과서 도시 기호(places.py 가 찾은 기호 위치)와 Natural Earth 10m 인구 지점(NAME_KO 가 똑같고, 아시아 범위 안에 하나뿐이며,
//   그 지도에도 그 이름이 하나뿐인 것)을 짝지어 기준점 후보로 쓴다.
//   고르기(잘못 짝지은 동명이인·일부러 옮겨 그린 기호를 믿지 않도록):
//     1. 경위선 교차점 + 후보로 투영식만(TPS 없이) 맞추고, 후보 잔차가 중앙값 + madK × 1.4826 × MAD 를 넘으면 빼고 다시 맞춘다.
//     2. 이웃 일치: 각 후보의 잔차 벡터가 가까운 기준점 localK 개(교차점·후보)의 잔차 벡터 중앙값과 localFloorPt 넘게 다르면 뺀다
//        (먼 점 하나만 믿지 않는다).
//     3. 성기게: 경위선 교차점 볼록 껍질 바깥(멀수록 먼저) → 안쪽 순으로, 이미 고른 기준점과 minSpacingPt 넘게 떨어진 것만.
//   --write: 고른 기준점을 maps_u2.json 의 controls 에 src:'city' 로 쓴다(이전 city 기준점은 바꿈, 손 기준점은 그대로).
//            그다음 python -I scripts/atlas/extract_vectors.py --controls all → node scripts/atlas/georef-cli.mjs --all.
//   --holdout: 고른 도시 기준점을 folds 겹으로 나눠, 나머지로 맞춘 fit(robustFit + fitWithTps, georef-cli 와 같음)이
//              빠진 도시를 얼마나 맞히는지(km) 잰다. 비교: 경위선 교차점만으로 맞춘 fit.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { fitControls, robustFit, fitWithTps, applyFit, makeConverter, familiesFor } from './georef.mjs';
import { key, km, median, neIndex as neIndexAt, WORK } from './geo_util.mjs';
import { resolveUnit, stripUnitArgs } from './unit.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..', '..');
const UNIT = resolveUnit();   // 단원 고르기(--unit uN · env ATLAS_UNIT · 옛 ATLAS_UNIT_CONFIG, 기본 u2) — scripts/atlas/unit.mjs
const CONFIG_FILE = UNIT.configPath;
const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
const CC = config.cityControls;
const PC = config.places;                                     // neFile·neBox 는 places 와 함께 쓴다
const MAPS_FILE = path.resolve(path.dirname(CONFIG_FILE), config.maps);
const mapEntry = (id) => JSON.parse(fs.readFileSync(MAPS_FILE, 'utf8')).find((m) => m.id === id);
const PY = process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
const r2 = (v) => Math.round(v * 100) / 100, r4 = (v) => Math.round(v * 1e4) / 1e4;

function hull(pts) {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const q of p) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (const q of p.reverse()) { while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}
/** 점에서 볼록 껍질까지 거리(안쪽이면 음수). */
function hullDist(H, q) {
  let inside = true, d = Infinity;
  for (let i = 0; i < H.length; i++) {
    const a = H[i], b = H[(i + 1) % H.length];
    const cr = (b[0] - a[0]) * (q[1] - a[1]) - (b[1] - a[1]) * (q[0] - a[0]);
    if (cr < 0) inside = false;
    const t = Math.max(0, Math.min(1, ((q[0] - a[0]) * (b[0] - a[0]) + (q[1] - a[1]) * (b[1] - a[1])) / ((b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2)));
    d = Math.min(d, Math.hypot(q[0] - a[0] - t * (b[0] - a[0]), q[1] - a[1] - t * (b[1] - a[1])));
  }
  return inside ? -d : d;
}

/** Natural Earth 인구 지점(places.neFile·neBox): NAME_KO 열쇠 → [{lon, lat, ne}]. 없으면 멈춘다. */
function neIndex() {
  const by = neIndexAt(`${WORK}/${PC.neFile}`, PC.neBox);
  if (!by) throw new Error(`${WORK}/${PC.neFile} 없음 — Natural Earth 10m populated places 를 받아 둘 것`);
  return by;
}

/** 지도 하나: 후보(이름 짝) → 고른 도시 기준점과 보고. */
export function selectCities(id, ne = neIndex()) {
  const all = JSON.parse(fs.readFileSync(`${WORK}/vec/${id}.controls.json`, 'utf8'));
  const base = all.filter((c) => c.src !== 'city');
  const labels = JSON.parse(fs.readFileSync(`${WORK}/text/places-${id}.json`, 'utf8')).labels
    .filter((L) => ['city', 'capital'].includes(L.kind) && L.symbol);
  const count = new Map();
  for (const L of labels) count.set(key(L.name), (count.get(key(L.name)) || 0) + 1);
  const report = { id, labels: labels.length, matched: 0, ambiguous: [], mad: [], local: [], spacing: 0 };
  let cand = [];
  for (const L of labels) {
    const m = ne.get(key(L.name));
    if (!m) continue;
    if (m.length !== 1 || count.get(key(L.name)) !== 1) { report.ambiguous.push(L.name); continue; }
    cand.push({ name: L.name, xy: L.symbol.xy, lon: m[0].lon, lat: m[0].lat, ne: m[0].ne, src: 'city' });
  }
  report.matched = cand.length;
  const fams = familiesFor(mapEntry(id), config);   // georef-cli 와 같은 도법 후보
  // 1. 투영식 잔차의 MAD 거르기(반복)
  for (;;) {
    const fit = fitControls([...base, ...cand], fams);
    const res = cand.map((c) => { const p = applyFit(fit, [c.lon, c.lat]); return p ? Math.hypot(p[0] - c.xy[0], p[1] - c.xy[1]) : Infinity; });
    const med = median(res), mad = median(res.map((r) => Math.abs(r - med)));
    const lim = med + CC.madK * 1.4826 * Math.max(mad, CC.madFloorPt);
    const bad = res.map((r, i) => [r, i]).filter(([r]) => r > lim);
    if (!bad.length) { cand.forEach((c, i) => { c.residPt = res[i]; }); break; }
    const [r, i] = bad.sort((a, b) => b[0] - a[0])[0];                // 가장 나쁜 것 하나씩
    report.mad.push(`${cand[i].name} ${r.toFixed(1)}pt>${lim.toFixed(1)}`);
    cand = cand.filter((_, k) => k !== i);
  }
  // 2. 이웃 일치(투영식 잔차 벡터)
  const fit = fitControls([...base, ...cand], fams);
  const vec = (c) => { const p = applyFit(fit, [c.lon, c.lat]); return [c.xy[0] - p[0], c.xy[1] - p[1]]; };
  const pts = [...base, ...cand].map((c) => ({ c, v: vec(c) }));
  const keep = [];
  for (const c of cand) {
    const v = vec(c);
    const nb = pts.filter((q) => q.c !== c).sort((a, b) => Math.hypot(a.c.xy[0] - c.xy[0], a.c.xy[1] - c.xy[1]) - Math.hypot(b.c.xy[0] - c.xy[0], b.c.xy[1] - c.xy[1]))
      .slice(0, CC.localK);
    const mv = [median(nb.map((q) => q.v[0])), median(nb.map((q) => q.v[1]))];
    const d = Math.hypot(v[0] - mv[0], v[1] - mv[1]);
    if (d > CC.localFloorPt) report.local.push(`${c.name} ${d.toFixed(1)}pt`); else keep.push(c);
  }
  // 3. 성기게: 교차점 껍질 바깥(먼 것)부터
  const H = hull(base.map((c) => c.xy));
  keep.forEach((c) => { c.hullPt = hullDist(H, c.xy); });
  keep.sort((a, b) => b.hullPt - a.hullPt);
  const chosen = [], taken = base.map((c) => c.xy);
  for (const c of keep) {
    if (taken.some((q) => Math.hypot(q[0] - c.xy[0], q[1] - c.xy[1]) < CC.minSpacingPt)) { report.spacing++; continue; }
    chosen.push(c); taken.push(c.xy);
  }
  report.chosen = chosen.length;
  report.outsideHull = chosen.filter((c) => c.hullPt > 0).length;
  return { base, chosen, kept: keep, report };
}

/** 기준점 → georef-cli 와 같은 fit(robustFit 뒤 fitWithTps, 같은 도법 후보 familiesFor). */
function fitLikeCli(cps, families) { return fitWithTps(robustFit(cps, { families }).cps, { families }); }

/** fit 으로 기호 지면 위치를 경위도로 되돌려 Natural Earth 와 견준 거리(km). */
function errKm(fit, c) { const ll = makeConverter(fit).invert(c.xy); return ll ? km(ll, [c.lon, c.lat]) : Infinity; }

function stats(a) {
  const s = [...a].sort((x, y) => x - y);
  return { n: s.length, median: r2(s[s.length >> 1]), p90: r2(s[Math.floor(s.length * 0.9)]), max: r2(s[s.length - 1]) };
}

/** 겹 나누기 검증: 도시 기준점을 folds 겹으로 나눠 나머지(+교차점)로 맞추고 빠진 도시 오차(km). 같은 도시를 교차점만으로 맞춘 오차와 함께. */
export function holdout(id, base, chosen, kept) {
  let seed = CC.seed;
  const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  const order = chosen.map((c) => [rand(), c]).sort((a, b) => a[0] - b[0]).map((t) => t[1]);
  const fams = familiesFor(mapEntry(id), config);   // georef-cli 와 같은 도법 후보
  const gridOnly = fitLikeCli(base, fams);
  const out = [], ref = [];
  for (let f = 0; f < CC.folds; f++) {
    const test = order.filter((_, i) => i % CC.folds === f), train = order.filter((_, i) => i % CC.folds !== f);
    const fit = fitLikeCli([...base, ...train], fams);
    for (const c of test) { out.push(errKm(fit, c)); ref.push(errKm(gridOnly, c)); }
  }
  // 고르기에서 성기게 하느라 뺀(기준점이 아닌) 도시: 모든 도시 기준점으로 맞춘 fit 의 독립 검사
  const full = fitLikeCli([...base, ...chosen], fams);
  const unused = kept.filter((c) => !chosen.includes(c));
  return { id, holdout: stats(out), gridOnlySame: stats(ref), unusedCities: unused.length ? stats(unused.map((c) => errKm(full, c))) : null,
    unusedGridOnly: unused.length ? stats(unused.map((c) => errKm(gridOnly, c))) : null };
}

/** 고른 기준점을 maps_u2.json controls 에 src:'city' 로 쓴다. 파일은 Python json.dump(indent=1) 모양이라(540.0 같은 실수 표기 포함)
 *  Python 이 읽고 고쳐 쓴다 — 다른 지도 항목은 글자 하나 바뀌지 않는다. */
function writeMaps(sel) {
  const payload = Object.fromEntries(Object.entries(sel).map(([id, cs]) => [id,
    cs.map((c) => ({ name: c.name, type: 'city', src: 'city', xy: c.xy.map(r2), lon: r4(c.lon), lat: r4(c.lat), ne: c.ne }))]));
  const py = [
    'import json,sys',
    'p=sys.argv[1]; d=json.loads(sys.stdin.buffer.read().decode("utf-8"))',
    'maps=json.load(open(p,encoding="utf-8"))',
    'for m in maps:',
    '    if m["id"] in d["sel"]:',
    '        m["controls"]=[c for c in m["controls"] if c.get("src")!="city"]+d["sel"][m["id"]]',
    '        m["controlsNote"]=d["note"]',
    'f=open(p,"w",encoding="utf-8",newline="\\n"); json.dump(maps,f,ensure_ascii=False,indent=1); f.close()',
  ].join('\n');
  const r = spawnSync(PY, ['-I', '-c', py, MAPS_FILE], { input: Buffer.from(JSON.stringify({ sel: payload, note: CC.note }), 'utf8') });
  if (r.status !== 0) throw new Error(String(r.stderr));
}

function main(argv) {
  const ne = neIndex(), sel = {}, hold = {};
  for (const id of CC.maps) {
    const { base, chosen, kept, report } = selectCities(id, ne);
    sel[id] = chosen;
    console.log(`${id}: 기호 지명 ${report.labels}, 이름 짝 ${report.matched}(동명 ${report.ambiguous.length}), MAD 로 뺌 ${report.mad.length}, ` +
      `이웃 불일치로 뺌 ${report.local.length}, 간격으로 뺌 ${report.spacing} → 고름 ${report.chosen}(교차점 껍질 밖 ${report.outsideHull}), 교차점 ${base.length}`);
    if (report.mad.length) console.log('   MAD:', report.mad.join(', '));
    if (report.local.length) console.log('   이웃:', report.local.join(', '));
    if (argv.includes('--holdout')) {
      const h = holdout(id, base, chosen, kept); hold[id] = h;
      console.log(`   겹 나누기(${CC.folds}겹) 빠진 도시 오차 km: 도시 기준점 ${JSON.stringify(h.holdout)} / 교차점만 ${JSON.stringify(h.gridOnlySame)}`);
      if (h.unusedCities) console.log(`   기준점 아닌 도시(간격으로 뺀 것) km: 도시 기준점 ${JSON.stringify(h.unusedCities)} / 교차점만 ${JSON.stringify(h.unusedGridOnly)}`);
    }
  }
  if (argv.includes('--holdout')) {                          // 테스트가 읽는 독립 검사 결과(도시 기준점 짝이 Natural Earth 라 places 대조는 표본 안)
    const holdFile = UNIT.workFile('geo/city-holdout.json');   // 단원 작업 파일(u2 는 옛 자리 $ATLAS_WORK/geo/)
    fs.writeFileSync(holdFile, JSON.stringify({ folds: CC.folds, seed: CC.seed, maps: hold }, null, 1));
    console.log(`겹 나누기 결과 → ${holdFile}`);
  }
  if (argv.includes('--write')) { writeMaps(sel); console.log(`maps_u2.json controls 에 src:'city' 기준점을 씀`); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(stripUnitArgs(process.argv.slice(2)).rest);
