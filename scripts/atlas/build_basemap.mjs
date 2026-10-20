// © 2026 김용현
// scripts/atlas/build_basemap.mjs — Natural Earth → 바탕 지도 TopoJSON 하나(D2)
//   node scripts/atlas/build_basemap.mjs [--force]
//   설정: scripts/atlas/config/u2.json 의 basemap (out·mapshaper 버전·rawDir·sourceUrl·unitBoxes·quantization·maxBytes·levels)
//   입력: $ATLAS_WORK/<rawDir>/<이름>.geojson — 없으면 sourceUrl(nvkelso/natural-earth-vector 커밋 고정 geojson/)에서 받는다
//         (시간 제한·다시 시도, GeoJSON 검사 뒤 저장). mapshaper 는 $ATLAS_WORK/tools/ 에 한 번 설치해 node 로 바로 실행.
//   단계(mapshaper, 작업 폴더 $ATLAS_WORK/basemap 에서 — 한글 경로에 대량 출력하지 않음):
//     1. 상세도(level)마다 나라: [단원 상자로 자르기] → iso(ADM0_A3)·ko(NAME_KO) → 단순화(keep-shapes, simplifyByIso 면 나라별 비율) → 녹여 육지(land, 같은 호 공유)
//        하천·호수: [자르기] → scalerank ≤ maxRank → s(scalerank) → 단순화. 결과는 양자화 없는 TopoJSON 조각.
//        단원 설정이 있을 때만(u4 아프리카 — 없으면 명령 목록이 옛 그대로): basemap.mergeIsos {남길 iso: [합칠 iso…]}(소말릴란드 → 소말리아, 교사 Q3)·
//        basemap.cutIsos [{from, to, box}](모로코 면 중 box 안 = 서사하라로, 교사 Q1 「교과서대로」) → editArgs. 고친 나라만 따로 녹이고(dissolve2) 다시 합침.
//     2. 조각을 combine-files 로 한 위상(topology)에 모아 quantization 으로 양자화 → 객체 순서 고정, meta{source, mapshaper, unitBoxes, inputsHash}.
//   출력: out(basemap.json). maxBytes 를 넘으면 쓰지 않고 종료 코드 1. 내용이 같으면 쓰지 않는다.
//   낡은 산출물 검사: 설정 content.stamps.basemap(입력 파일·이 코드·설정 basemap 해시) = meta.inputsHash 면 다시 만들지 않는다(--force 면 만듦).
//   모르는 옵션은 종료 코드 2.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { WORK, REPO, readJson, writeIfChanged, stampHash } from './geo_util.mjs';
import { resolveUnit, stripUnitArgs } from './unit.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const UNIT = resolveUnit();   // 단원 고르기(--unit uN · env ATLAS_UNIT · 옛 ATLAS_UNIT_CONFIG, 기본 u2) — scripts/atlas/unit.mjs
const CONFIG = UNIT.configPath;
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

const pct = (v) => {
  const m = /^(\d+(?:\.\d+)?)%$/.exec(String(v));
  if (!m || +m[1] <= 0 || +m[1] > 100) throw new Error(`단순화 비율은 「n%」(0 초과 100 이하): ${v}`);
  return +m[1] / 100;
};
/**
 * 나라 단순화 인자. byIso({ADM0_A3: 'n%'})가 있으면 그 나라만 다른 비율로(mapshaper `variable percentage=` 식 — 나라 Feature 마다 평가,
 * 해안 호는 그 나라 것이라 그 나라 비율을 따른다). 예: 한반도(KOR·PRK)만 덜 단순화(E1, 교사 결정 2026-10-19).
 */
export function simplifyArgs(base, byIso) {
  if (!byIso || !Object.keys(byIso).length) return [base];
  const d = pct(base);
  const terms = Object.entries(byIso).map(([iso, v]) => {
    if (!/^[A-Z0-9]{3}$/.test(iso)) throw new Error(`simplifyByIso 열쇠는 ADM0_A3 세 글자: ${iso}`);
    return `iso=='${iso}'?${pct(v)}:`;
  });
  return ['variable', `percentage=${terms.join('')}${d}`];
}

/** simplifyByIso 의 나라 열쇠가 만든 위상의 그 상세도 나라(countries<id>) iso 에 모두 있는지 — 없는 열쇠(오타·자르기 밖)는 오류. */
export function checkByIso(topo, levels) {
  for (const lv of levels) {
    const keys = Object.keys(lv.simplifyByIso || {});
    if (!keys.length) continue;
    const have = new Set((topo.objects[`countries${lv.id}`]?.geometries || []).map((g) => g.properties?.iso));
    const missing = keys.filter((k) => !have.has(k));
    if (missing.length) throw new Error(`simplifyByIso: 상세도 ${lv.id} 나라에 없는 iso ${missing.join(', ')} — 설정 basemap.levels 확인`);
  }
}

/** 나라 iso 목록 → mapshaper 식 안의 배열 글자(검사한 세 글자 iso 만). */
const isoList = (isos) => JSON.stringify(isos.map((iso) => {
  if (!/^[A-Z0-9]{3}$/.test(iso)) throw new Error(`나라 고치기 iso 는 ADM0_A3 세 글자: ${iso}`);
  return iso;
}));
const isBox = (b) => Array.isArray(b) && b.length === 4 && b.every(Number.isFinite) && b[0] < b[2] && b[1] < b[3];
const mergeEntries = (m) => Object.entries(m || {}).filter(([k]) => !k.startsWith('_'));

/**
 * 나라 고치기(설정 basemap.mergeIsos·cutIsos — u4 아프리카, 있을 때만) → mapshaper 인자. 둘 다 없으면 [] (u2·u3 명령 그대로).
 *   mergeIsos {SOM: ['SOL']}: SOL 면의 iso 를 SOM 으로 바꿔 한 나라로 녹임(국경선이 없어짐).
 *   cutIsos [{from: 'MAR', to: 'SAH', box: [w, s, e, n]}]: from 면 중 box 안 부분을 to 로 옮김(box 밖 부분은 from 그대로).
 * 고치는 나라(합치는·남기는·자르는·받는)만 따로 된 층(edits)으로 떼어 내 자르고 녹인 뒤 나라 층 뒤에 다시 합친다(다른 나라 도형은
 * dissolve2 의 틈 메우기를 거치지 않음). ko = names[iso](원본 NAME_KO — 녹이면 첫 면의 이름이 남으므로 남긴·받은 나라 이름으로 다시 씀).
 */
export function editArgs(layer, { mergeIsos = null, cutIsos = null } = {}, names = {}) {
  const merges = mergeEntries(mergeIsos);
  const cuts = cutIsos || [];
  if (!merges.length && !cuts.length) return [];
  const keep = [], gone = [];
  for (const [to, from] of merges) {
    if (!Array.isArray(from) || !from.length) throw new Error(`mergeIsos.${to}: 합칠 iso 배열이 아님`);
    keep.push(to); gone.push(...from);
  }
  for (const c of cuts) {
    if (!c?.from || !c?.to || !isBox(c.box)) throw new Error(`cutIsos 항목은 {from, to, box: [w, s, e, n]}: ${JSON.stringify(c)}`);
    keep.push(c.to); gone.push(c.from);
  }
  const touched = isoList([...new Set([...keep, ...gone])]);
  const a = ['-filter', `${touched}.indexOf(iso)>=0`, '+', 'name=edits', `target=${layer}`,
    '-filter', `${touched}.indexOf(iso)<0`, `target=${layer}`];
  cuts.forEach((c, i) => {
    const [from, to] = JSON.parse(isoList([c.from, c.to])), bbox = `bbox=${c.box.join(',')}`;
    a.push('-filter', `iso=='${from}'`, '+', `name=cutin${i}`, 'target=edits',
      '-filter', `iso=='${from}'`, '+', `name=cutout${i}`, 'target=edits',
      '-filter', `iso!='${from}'`, 'target=edits',
      '-clip', bbox, `target=cutin${i}`, '-each', `iso='${to}'`, `target=cutin${i}`,
      '-erase', bbox, `target=cutout${i}`,
      '-merge-layers', `target=edits,cutin${i},cutout${i}`, 'name=edits', 'force');
  });
  for (const [to, from] of merges) a.push('-each', `if (${isoList(from)}.indexOf(iso)>=0) iso='${JSON.parse(isoList([to]))[0]}'`, 'target=edits');
  const ko = {};
  for (const iso of new Set(keep)) { if (!names[iso]) throw new Error(`나라 고치기: 원본에 ${iso} 이름(NAME_KO)이 없음`); ko[iso] = names[iso]; }
  a.push('-dissolve2', 'iso', 'copy-fields=ko', 'target=edits',
    '-each', `ko=(${JSON.stringify(ko)})[iso]||ko`, 'target=edits',
    '-merge-layers', `target=${layer},edits`, `name=${layer}`, 'force');
  return a;
}

/** 상세도 하나의 나라 층 mapshaper 인자(자르기 → iso·ko → [나라 고치기] → 단순화 → 녹여 육지 → 조각 파일). */
export function countryArgs(lv, raw, edits = {}, names = {}) {
  const clip = lv.clip ? ['-clip', 'unit-boxes.json'] : [];
  const simp = (s) => (s ? ['-simplify', ...simplifyArgs(s, lv.simplifyByIso), 'keep-shapes'] : []);
  return ['-i', `${raw}/${lv.countries}.geojson`, `name=countries${lv.id}`, ...clip,
    '-each', 'iso=ADM0_A3,ko=NAME_KO', '-filter-fields', 'iso,ko', ...editArgs(`countries${lv.id}`, edits, names), ...simp(lv.simplify),
    '-dissolve2', '+', `name=land${lv.id}`,
    '-o', 'format=topojson', 'no-quantization', `target=land${lv.id},countries${lv.id}`, `part-${lv.id}-countries.json`];
}

/** 나라 고치기 결과 검사: 합친 iso 는 어느 상세도에도 없고, 남긴·받은 iso 는 상세도마다 하나. 아니면 오류. */
export function checkEdits(topo, cfg) {
  const merges = mergeEntries(cfg.mergeIsos);
  const gone = merges.flatMap(([, f]) => f), keep = [...merges.map(([t]) => t), ...(cfg.cutIsos || []).map((c) => c.to)];
  for (const lv of cfg.levels) {
    const isos = (topo.objects[`countries${lv.id}`]?.geometries || []).map((g) => g.properties?.iso);
    const bad = gone.filter((i) => isos.includes(i));
    if (bad.length) throw new Error(`mergeIsos: 상세도 ${lv.id} 에 합친 나라가 남음 ${bad.join(', ')}`);
    for (const k of keep) {
      const n = isos.filter((i) => i === k).length;
      if (n !== 1) throw new Error(`나라 고치기: 상세도 ${lv.id} 의 ${k} 가 ${n}개(하나여야 함)`);
    }
  }
}

/** 남긴·받은 나라의 원본 이름(NAME_KO) — 첫 상세도 원본에서(상세도끼리 같음). 고치기가 없으면 {}. */
function editNames(cfg, rawDir) {
  const want = new Set([...mergeEntries(cfg.mergeIsos).map(([t]) => t), ...(cfg.cutIsos || []).map((c) => c.to)]);
  if (!want.size) return {};
  const out = {};
  for (const f of readJson(`${rawDir}/${cfg.levels[0].countries}.geojson`).features) {
    const p = f.properties; if (want.has(p.ADM0_A3)) out[p.ADM0_A3] = p.NAME_KO;
  }
  return out;
}

/** 상세도 하나의 mapshaper 단계들 → 만든 조각 파일 이름 목록. */
function buildLevel(cfg, lv, cwd, raw, names = {}) {
  const clip = lv.clip ? ['-clip', 'unit-boxes.json'] : [];
  const files = [];
  const ctry = `part-${lv.id}-countries.json`;
  mapshaper(cfg, cwd, countryArgs(lv, raw, { mergeIsos: cfg.mergeIsos, cutIsos: cfg.cutIsos }, names));
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
  const names = editNames(cfg, `${WORK}/${cfg.rawDir}`);
  for (const lv of cfg.levels) { console.log(`상세도 ${lv.id}`); parts.push(...buildLevel(cfg, lv, cwd, raw, names)); }
  const topo = combine(cfg, cwd, parts, inputsHash);
  checkByIso(topo, cfg.levels);
  if (cfg.mergeIsos || cfg.cutIsos) checkEdits(topo, cfg);
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
  const args = stripUnitArgs(process.argv.slice(2)).rest;
  const bad = args.filter((a) => a !== '--force');
  if (bad.length) { console.error(`모르는 옵션: ${bad.join(' ')}`); process.exit(2); }
  buildBasemap({ force: args.includes('--force') }).catch((e) => { console.error(e.message); process.exit(1); });
}
