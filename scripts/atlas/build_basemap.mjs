// © 2026 김용현
// scripts/atlas/build_basemap.mjs — Natural Earth → 바탕 지도 TopoJSON 하나(D2)
//   node scripts/atlas/build_basemap.mjs [--force]
//   설정: scripts/atlas/config/u2.json 의 basemap (out·mapshaper 버전·rawDir·sourceUrl·unitBoxes·quantization·maxBytes·levels)
//   입력: $ATLAS_WORK/<rawDir>/<이름>.geojson — 없으면 sourceUrl(nvkelso/natural-earth-vector 커밋 고정 geojson/)에서 받는다
//         (시간 제한·다시 시도, GeoJSON 검사 뒤 저장). mapshaper 는 $ATLAS_WORK/tools/ 에 한 번 설치해 node 로 바로 실행.
//   단계(mapshaper, 작업 폴더 $ATLAS_WORK/basemap 에서 — 한글 경로에 대량 출력하지 않음):
//     1. 상세도(level)마다 나라: [단원 상자로 자르기] → iso(ADM0_A3)·ko(NAME_KO) → 단순화(keep-shapes) → 녹여 육지(land, 같은 호 공유)
//        하천·호수: [자르기] → scalerank ≤ maxRank → s(scalerank) → 단순화. 결과는 양자화 없는 TopoJSON 조각.
//     2. 조각을 combine-files 로 한 위상(topology)에 모아 quantization 으로 양자화 → 객체 순서 고정, meta{source, mapshaper, unitBoxes, inputsHash}.
//   출력: out(basemap.json). maxBytes 를 넘으면 쓰지 않고 종료 코드 1. 내용이 같으면 쓰지 않는다.
//   낡은 산출물 검사: 설정 content.stamps.basemap(입력 파일·이 코드·설정 basemap 해시) = meta.inputsHash 면 다시 만들지 않는다(--force 면 만듦).
//   모르는 옵션은 종료 코드 2.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { WORK, REPO, readJson, writeIfChanged, stampHash } from './geo_util.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CONFIG = process.env.ATLAS_UNIT_CONFIG || path.join(HERE, 'config', 'u2.json');
const KINDS = ['land', 'countries', 'rivers', 'lakes'];

/** 설정 levels → 객체 이름 순서(land, countries, rivers, lakes 순, 상세도 순). */
export function objectOrder(levels) {
  const out = [];
  for (const lv of levels) for (const k of KINDS) if (k === 'land' || k === 'countries' || lv[k]) out.push(`${k}${lv.id}`);
  return out;
}

/** 필요한 원본 파일 이름(.geojson 없이) 목록. */
export function rawNames(levels) {
  const s = new Set();
  for (const lv of levels) { s.add(lv.countries); if (lv.rivers) s.add(lv.rivers.file); if (lv.lakes) s.add(lv.lakes.file); }
  return [...s];
}

/** 원본 파일 이름 → 필수 속성. */
const requiredProps = (name) => (/admin_0_countries/.test(name) ? ['ADM0_A3', 'NAME_KO'] : ['scalerank']);

/** 받은 글이 쓸 만한 GeoJSON 인지(FeatureCollection, 도형 1개 이상, 첫 도형에 필수 속성). 아니면 오류. */
export function validateGeojson(text, required) {
  let gj;
  try { gj = JSON.parse(text); } catch { throw new Error('JSON 이 아님(오류 쪽을 받았을 수 있음)'); }
  if (gj?.type !== 'FeatureCollection' || !Array.isArray(gj.features)) throw new Error(`FeatureCollection 이 아님: ${gj?.type}`);
  if (!gj.features.length) throw new Error('도형이 없음');
  const props = gj.features[0].properties || {};
  for (const k of required) if (!(k in props)) throw new Error(`필수 속성 없음: ${k}`);
  return gj.features.length;
}

/** fetch + 시간 제한(timeoutMs) + 다시 시도(tries, 사이 waitMs·2^n). 성공하면 ArrayBuffer. */
export async function fetchWithRetry(url, { tries = 3, timeoutMs = 60000, waitMs = 1000, fetchImpl = fetch } = {}) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs) });
      if (!r.ok) throw new Error(`HTTP ${r.status}: ${url}`);
      return await r.arrayBuffer();
    } catch (e) {
      last = e;
      if (i < tries - 1 && waitMs) await new Promise((res) => setTimeout(res, waitMs * 2 ** i));
    }
  }
  throw new Error(`받기 실패(${tries}번): ${last?.message}`);
}

async function ensureRaw(cfg) {
  const dir = `${WORK}/${cfg.rawDir}`;
  fs.mkdirSync(dir, { recursive: true });
  for (const name of rawNames(cfg.levels)) {
    const f = `${dir}/${name}.geojson`;
    if (fs.existsSync(f)) continue;
    const url = `${cfg.sourceUrl}${name}.geojson`;
    console.log(`받기: ${url}`);
    const buf = Buffer.from(await fetchWithRetry(url));
    const n = validateGeojson(buf.toString('utf8'), requiredProps(name));
    console.log(`  도형 ${n}개`);
    fs.writeFileSync(`${f}.tmp`, buf);
    fs.renameSync(`${f}.tmp`, f);
  }
}

/** mapshaper 를 작업 폴더 tools/<버전> 에 한 번 설치하고 실행 파일(js) 경로를 돌려준다. 이후 node 로 바로 실행(셸·npx 없음). */
let mapshaperBin = null;
function resolveMapshaper(cfg) {
  if (mapshaperBin) return mapshaperBin;
  const [, version] = cfg.mapshaper.split('@');
  const dir = `${WORK}/tools/${cfg.mapshaper.replace(/[^\w.-]/g, '_')}`;
  const pkg = `${dir}/node_modules/mapshaper/package.json`;
  if (!fs.existsSync(pkg) || JSON.parse(fs.readFileSync(pkg, 'utf8')).version !== version) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`mapshaper 설치: ${cfg.mapshaper} → ${dir}`);
    // npm 은 Windows 에서 .cmd 라 셸이 필요하다 → 한 줄 명령(작업 폴더·버전 글자는 ASCII 라 따옴표로 충분)
    const cmd = `npm install --prefix "${dir}" --no-save --no-audit --no-fund ${cfg.mapshaper}`;
    if (!/^[\w@.-]+$/.test(cfg.mapshaper) || /"/.test(dir)) throw new Error(`mapshaper 버전·작업 폴더 글자 확인: ${cfg.mapshaper} ${dir}`);
    const r = spawnSync(cmd, { encoding: 'utf8', shell: true, maxBuffer: 1 << 26 });
    if (r.status !== 0) throw new Error(`mapshaper 설치 실패: ${r.stderr || r.stdout}`);
  }
  mapshaperBin = `${dir}/node_modules/mapshaper/bin/mapshaper`;
  if (!fs.existsSync(mapshaperBin)) throw new Error(`mapshaper 실행 파일 없음: ${mapshaperBin}`);
  return mapshaperBin;
}

/** mapshaper 실행(작업 폴더에서, 셸 없이 인자 그대로). */
function mapshaper(cfg, cwd, args) {
  const r = spawnSync(process.execPath, [resolveMapshaper(cfg), ...args], { cwd, encoding: 'utf8', maxBuffer: 1 << 26 });
  if (r.status !== 0) throw new Error(`mapshaper 실패(${r.status}): ${args.join(' ')}\n${r.stderr || r.stdout}`);
  return r.stderr + r.stdout;
}

/** 상세도 하나의 mapshaper 단계들 → 만든 조각 파일 이름 목록. */
function buildLevel(cfg, lv, cwd, raw) {
  const clip = lv.clip ? ['-clip', 'unit-boxes.json'] : [];
  const files = [];
  const simp = (s) => (s ? ['-simplify', s, 'keep-shapes'] : []);
  const ctry = `part-${lv.id}-countries.json`;
  mapshaper(cfg, cwd, ['-i', `${raw}/${lv.countries}.geojson`, `name=countries${lv.id}`, ...clip,
    '-each', 'iso=ADM0_A3,ko=NAME_KO', '-filter-fields', 'iso,ko', ...simp(lv.simplify),
    '-dissolve2', '+', `name=land${lv.id}`,
    '-o', 'format=topojson', 'no-quantization', `target=land${lv.id},countries${lv.id}`, ctry]);
  files.push(ctry);
  for (const kind of ['rivers', 'lakes']) {
    const k = lv[kind];
    if (!k) continue;
    const out = `part-${lv.id}-${kind}.json`;
    mapshaper(cfg, cwd, ['-i', `${raw}/${k.file}.geojson`, `name=${kind}${lv.id}`, ...clip,
      '-filter', `scalerank<=${k.maxRank}`, '-each', 's=scalerank', '-filter-fields', 's',
      ...(k.simplify ? ['-simplify', k.simplify] : []),
      '-o', 'format=topojson', 'no-quantization', out]);
    files.push(out);
  }
  return files;
}

/** 조각 TopoJSON 들 → 한 위상으로 합치고 양자화. 객체 순서 고정 + meta. */
function combine(cfg, cwd, parts, inputsHash) {
  mapshaper(cfg, cwd, ['-i', 'combine-files', ...parts, '-o', 'format=topojson', `quantization=${cfg.quantization}`, 'target=*', 'combined.json']);
  const topo = JSON.parse(fs.readFileSync(`${cwd}/combined.json`, 'utf8'));
  const order = objectOrder(cfg.levels);
  const got = Object.keys(topo.objects);
  const missing = order.filter((n) => !got.includes(n)), extra = got.filter((n) => !order.includes(n));
  if (missing.length || extra.length) throw new Error(`객체 이름이 다름: 없음 ${missing} / 남음 ${extra}`);
  const objects = Object.fromEntries(order.map((n) => [n, topo.objects[n]]));
  const meta = {
    source: 'Natural Earth (public domain) via github.com/nvkelso/natural-earth-vector geojson',
    mapshaper: cfg.mapshaper,
    unitBoxes: cfg.unitBoxes,
    inputsHash,
  };
  const { type, arcs, transform, bbox } = topo;
  return { type, bbox, transform, objects, arcs, meta };
}

export async function buildBasemap({ force = false } = {}) {
  const unit = readJson(CONFIG);
  const cfg = unit.basemap;
  const outFile = path.join(REPO, cfg.out);
  await ensureRaw(cfg);
  const inputsHash = stampHash(unit, 'basemap');
  if (!force && fs.existsSync(outFile)) {
    try {
      if (readJson(outFile).meta?.inputsHash === inputsHash) { console.log(`최신: ${cfg.out} (입력 해시 같음, --force 로 다시 만듦)`); return { changed: false }; }
    } catch { /* 깨진 파일이면 다시 만든다 */ }
  }
  const cwd = `${WORK}/basemap`;
  fs.mkdirSync(cwd, { recursive: true });
  for (const f of fs.readdirSync(cwd)) if (/^part-.*\.json$|^combined\.json$/.test(f)) fs.unlinkSync(`${cwd}/${f}`);
  const boxes = {
    type: 'FeatureCollection',
    features: cfg.unitBoxes.map(([w, s, e, n]) => ({ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]] } })),
  };
  fs.writeFileSync(`${cwd}/unit-boxes.json`, JSON.stringify(boxes));
  const raw = `../${cfg.rawDir}`;
  const parts = [];
  for (const lv of cfg.levels) { console.log(`상세도 ${lv.id}`); parts.push(...buildLevel(cfg, lv, cwd, raw)); }
  const topo = combine(cfg, cwd, parts, inputsHash);
  const text = JSON.stringify(topo);
  const bytes = Buffer.byteLength(text);
  const sizes = Object.fromEntries(Object.keys(topo.objects).map((n) => [n, Buffer.byteLength(JSON.stringify(topo.objects[n]))]));
  console.log(`객체(도형 참조 크기, 호는 따로): ${JSON.stringify(sizes)}`);
  console.log(`호 ${topo.arcs.length}개, 합계 ${bytes} B (${(bytes / 1024).toFixed(1)} KiB), 상한 ${cfg.maxBytes} B`);
  if (bytes > cfg.maxBytes) throw new Error(`용량 초과: ${bytes} > ${cfg.maxBytes} — 설정 basemap.levels 의 simplify·maxRank 를 줄이세요`);
  const changed = writeIfChanged(outFile, text);
  console.log(changed ? `썼음: ${cfg.out}` : `같음: ${cfg.out}`);
  return { changed, bytes };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const bad = args.filter((a) => a !== '--force');
  if (bad.length) { console.error(`모르는 옵션: ${bad.join(' ')}`); process.exit(2); }
  buildBasemap({ force: args.includes('--force') }).catch((e) => { console.error(e.message); process.exit(1); });
}
