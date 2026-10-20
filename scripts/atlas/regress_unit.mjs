// © 2026 김용현
// scripts/atlas/regress_unit.mjs — 단원 일반 회귀 도구(U4-G0, regress_u2.mjs 를 단원 일반형으로 옮김): 공개된 단원 산출물이 바뀌지 않았는지 기준선과 견준다.
//   node scripts/atlas/regress_unit.mjs --unit uN --baseline   지금 산출물 해시·대조표 캡처·대조표 결과·조각 크기를 기준선으로 저장
//   node scripts/atlas/regress_unit.mjs --unit uN --check      같은 목록을 다시 재서 기준선과 비교(다르면 종료 코드 1)
//   --unit 을 안 주면 env ATLAS_UNIT → 기본 u2(scripts/atlas/unit.mjs 규칙). regress_u2.mjs 는 --unit u2 로 부르는 껍데기.
//   기준선: $ATLAS_WORK/units/<id>/baseline/ (저장소 밖) — hashes.json · shots/<장면>.png · shots/manifest.json · compare.json · <대조표 HTML 이름>
//           · files/<repo|work>/<경로> (JSON·JS 원본 — 다를 때 내용 비교)
//   먼저 돌릴 것: node scripts/atlas/compare_shots.mjs --unit uN → node scripts/atlas/compare.mjs --unit uN → npm run embed -- <sim>
//     (이 스크립트는 그 결과를 읽기만 한다)
//   단원 의존 값은 모두 unitSpec(id, env) 한 곳(단원 표 units.json + 단원 설정 + 대조표 설정 <id>.compare.json):
//   - 해시(저장소): sims/<sim>/data/** · content/atlas/<id>/** · docs/assets/atlas/<id>/** · docs/assets/atlas/common/** · embed/<sim>.html
//       + 공개된 단원(docs/versions.json 에 sim 이 있음)은 공개본 docs/<sim>/** 도. 단 u2 는 옛 목록 그대로(공개본 빼고 — G0 기준선이 그 목록이라
//       넣으면 「새로 생김」으로 잡힘. u2 공개본은 판 폴더라 새 판을 내지 않는 한 바뀌지 않는다).
//       docs/assets/atlas 전체가 아니라 그 단원·common 만 — 다른 단원 사진·쪽이 「새로 생김」 회귀로 잡히지 않게(U3-6 후속).
//   - 해시(작업 폴더): 단원 표 pages → 쪽 접두 p<쪽> → vec/<접두>-*.json · geo/<접두>*.fit.json · text/places-<접두>-*.json(다른 단원 쪽은 뺌)
//       + 단원 설정의 작업 산출물 content.labels · content.charts · charts.out.climate · places.index.out(작업 폴더 기준 경로 — 하나라도 없으면 오류)
//       + u2 밖 단원은 단원 작업 폴더 geo/city-holdout.json(u2 G0 기준선에는 없던 파일이라 u2 는 옛 목록 그대로).
//     JSON 이 다르면 도장(inputsHash — 입력 스크립트 내용 해시)만 다른지도 따로 알린다(스크립트를 고치면 도장은 정당하게 바뀜 — 실패로 세지 않음).
//     조각(embed)은 코드 위치가 바뀌면 달라지는 게 정당해(2단계 설계 §4.2) 해시 차이를 실패로 세지 않고 크기 차(±1%)만 본다.
//   - 캡처: 대조표 설정 shotsDir(없으면 shots/compare, 단원 작업 폴더 기준)의 manifest 장면마다 화소 비교(regress_png.py), 장면 이름·화면 값(stats) 비교.
//   - 대조표: 대조표 설정 out(없으면 compare.html)의 수(다름·알려진 차이·같음·참고)와, 만든 때·캡처 때 줄을 뺀 HTML 전체가 같은지.
//   - 해시에서 빼는 것: *.md(issues.md 같은 사람이 읽는 기록 — 산출물이 아님, U4-3 Step 0). 옛 기준선(u2·u3)에 남은 .md 키는
//     check 가 기준선 쪽에서도 같은 규칙으로 걸러 본다 — 기준선 파일은 다시 찍지 않는다(이미지·자료 키는 그대로).
//   - 낡은 출력 경고(U4-3 Step 0): 캡처 manifest·조각이 입력(src/** · sims/<sim>/** · 대조표 설정)보다, 대조표 HTML 이 캡처보다
//     오래되었으면 알린다(다시 찍기를 잊고 낡은 출력끼리 견주어 통과하는 일을 막음 — 실패로 세지는 않음).
//   - 기준선·캡처 manifest·대조표·조각이 없으면 ENOENT 대신 무엇을 먼저 돌릴지 알리고 종료 코드 2.
//   디렉터리는 손 순회(readdirSync + statSync) — 이 PC 한글 경로에서 재귀 fs 옵션이 죽는다.
//   진입점일 때만 명령줄을 돈다(시험에서 unitSpec·pagePrefixes 를 import 할 수 있게).
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_UNIT, loadUnits, resolveUnit, stripUnitArgs } from './unit.mjs';

const ROOT = resolve(import.meta.dirname, '..', '..');
const PY = process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
const slash = (p) => p.replace(/\\/g, '/');

const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));

/** 단원 표 pages [첫 쪽, 끝 쪽] → 쪽 접두 ['p16', …]. */
export function pagePrefixes(pages) {
  if (!Array.isArray(pages) || pages.length !== 2 || !Number.isInteger(pages[0]) || !Number.isInteger(pages[1]) || pages[0] > pages[1]) {
    throw new Error(`pages 가 [첫 쪽, 끝 쪽] 꼴이 아님: ${JSON.stringify(pages)}`);
  }
  const out = [];
  for (let p = pages[0]; p <= pages[1]; p++) out.push(`p${p}`);
  return out;
}

/** 쪽 접두 → 작업 폴더 파일 이름 무늬(regress_u2 옛 정규식과 같은 규칙). */
export function workPattern(prefixes) {
  const alt = prefixes.join('|');
  return {
    vec: new RegExp(`^(${alt})-.*\\.json$`),
    fit: new RegExp(`^(${alt}).*\\.fit\\.json$`),
    places: new RegExp(`^places-(${alt})-.*\\.json$`),
  };
}

/** 단원 설정에서 점 경로 값(없으면 오류 — 조용히 넘어가지 않음). */
export function need(cfg, id, dotted) {
  const v = dotted.split('.').reduce((o, k) => (o == null ? undefined : o[k]), cfg);
  if (typeof v !== 'string' || !v) throw new Error(`${id}: 단원 설정에 ${dotted} 가 없음 — 회귀 작업 파일 목록을 정할 수 없다`);
  return slash(v);
}

/** 공개된 단원인가(docs/versions.json 에 sim 이 있음). */
function published(sim) {
  const f = join(ROOT, 'docs', 'versions.json');
  return existsSync(f) && Object.hasOwn(readJson(f), sim);
}

/**
 * 단원 회귀 명세. env = { ATLAS_WORK }, opts.units = 단원 표(시험용).
 * → { id, sim, work, repoDirs, embed, prefixes, workExtra, base, shots, compare, compareName }
 *   경로: work·base·shots·compare 는 슬래시 절대 경로, repoDirs·embed 는 저장소 기준, workExtra 는 작업 폴더 기준.
 */
export function unitSpec(id, env = process.env, { units = null } = {}) {
  const table = units || loadUnits();
  const u = resolveUnit(['--unit', id], { ATLAS_WORK: env.ATLAS_WORK }, { units: table });
  if (!u.sim) throw new Error(`${id}: 단원 표에 sim 이 없음`);
  const prefixes = (() => { try { return pagePrefixes(u.pages); } catch (e) { throw new Error(`${id}: ${e.message}`); } })();
  const cfg = u.config;                                   // 없으면 오류(unit.mjs)
  // u2 = G0 기준선의 옛 목록 그대로(legacy): regress_u2.mjs 시절 손 목록은 저장소 4폴더 + 조각 + 작업 파일 4개
  //   (text/p17-labels · tables/charts-u2 · tables/climate-world · tables/index — 아래 u2 설정에서 끌어낸 값과 차례까지 같다).
  //   공개본 docs/atlas-u2-asia 와 geo/city-holdout.json 은 그 목록에 없었다 — 넣으면 u2 기준선에 없는 키라 「새로 생김」으로
  //   실패하고, 그러려면 u2 기준선을 다시 찍어야 하는데 계획이 그것을 막는다(공개본은 판 폴더라 새 판 없이는 안 바뀜).
  const legacy = id === DEFAULT_UNIT;
  const repoDirs = [`sims/${u.sim}/data`, `content/atlas/${id}`, `docs/assets/atlas/${id}`, 'docs/assets/atlas/common'];
  if (!legacy && published(u.sim)) repoDirs.push(`docs/${u.sim}`);
  const workExtra = [need(cfg, id, 'content.labels'), need(cfg, id, 'content.charts'), need(cfg, id, 'charts.out.climate'), need(cfg, id, 'places.index.out')];
  const rel = (abs) => { const w = `${u.work}/`; if (!abs.startsWith(w)) throw new Error(`${id}: 작업 폴더 밖 경로 ${abs}`); return abs.slice(w.length); };
  if (!legacy) workExtra.push(rel(u.workFile('geo/city-holdout.json')));
  const cmpFile = u.configPath.replace(/\.json$/, '.compare.json');
  const cmp = existsSync(cmpFile) ? readJson(cmpFile) : {};
  const compare = u.workFile(cmp.out || 'compare.html');
  return {
    id, sim: u.sim, work: u.work, repoDirs, embed: `embed/${u.sim}.html`, prefixes, workExtra,
    base: `${u.work}/units/${id}/baseline`,
    shots: u.workFile(cmp.shotsDir || 'shots/compare'),
    compare, compareName: compare.split('/').pop(),
    compareConfig: existsSync(cmpFile) ? slash(cmpFile) : null,
  };
}

/** 디렉터리 아래 파일(손 순회), 경로는 base 기준 슬래시. */
function walk(dir, base = dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) out.push(...walk(p, base));
    else out.push(slash(p.slice(base.length + 1)));
  }
  return out;
}

/** 비교할 파일 목록: 'repo:경로' | 'work:경로' → 절대 경로. */
function fileList(S) {
  const files = {};
  for (const d of S.repoDirs) for (const f of walk(join(ROOT, d))) files[`repo:${d}/${f}`] = join(ROOT, d, f);
  if (existsSync(join(ROOT, S.embed))) files[`repo:${S.embed}`] = join(ROOT, S.embed);
  const flat = (dir, re) => (existsSync(join(S.work, dir)) ? readdirSync(join(S.work, dir)).filter((n) => re.test(n)).map((n) => `${dir}/${n}`) : []);
  const pat = workPattern(S.prefixes);
  const work = [...flat('vec', pat.vec), ...flat('geo', pat.fit), ...flat('text', pat.places), ...S.workExtra.filter((f) => existsSync(join(S.work, f)))];
  for (const f of work) files[`work:${f}`] = join(S.work, f);
  return Object.fromEntries(Object.entries(files).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}
/** 해시에 넣는 키인가 — *.md 는 사람이 읽는 기록(issues.md 등)이라 뺀다. 옛 기준선 키에도 같은 규칙. */
export const hashable = (key) => !/\.md$/i.test(key);
const hashAll = (S) => Object.fromEntries(Object.entries(fileList(S)).filter(([k]) => hashable(k)).map(([k, p]) => [k, sha(p)]));

/** 디렉터리(또는 파일) 아래 가장 새 수정 시각(ms, 손 순회). 없으면 0. */
function newestMtime(p) {
  if (!existsSync(p)) return 0;
  const st = statSync(p);
  if (!st.isDirectory()) return st.mtimeMs;
  let m = 0;
  for (const n of readdirSync(p)) m = Math.max(m, newestMtime(join(p, n)));
  return m;
}

/**
 * 낡은 출력 경고 목록(순수 함수 — 시험용). t = { inputs, shots, compare, embed } 수정 시각 ms(없으면 null).
 *   캡처·조각 < 입력, 대조표 < 캡처 이면 한 줄씩.
 */
export function staleWarnings(t) {
  const out = [];
  const iso = (ms) => new Date(ms).toISOString().replace('T', ' ').slice(0, 19);
  if (t.shots != null && t.inputs != null && t.shots < t.inputs) out.push(`캡처 manifest(${iso(t.shots)})가 입력(src·sims·대조표 설정, ${iso(t.inputs)})보다 오래됨 — compare_shots 를 다시 돌렸나?`);
  if (t.embed != null && t.inputs != null && t.embed < t.inputs) out.push(`조각(${iso(t.embed)})이 입력(${iso(t.inputs)})보다 오래됨 — npm run embed 를 다시 돌렸나?`);
  if (t.compare != null && t.shots != null && t.compare < t.shots) out.push(`대조표 HTML(${iso(t.compare)})이 캡처(${iso(t.shots)})보다 오래됨 — compare.mjs 를 다시 돌렸나?`);
  return out;
}

function stalenessOf(S) {
  const mt = (p) => (existsSync(p) ? statSync(p).mtimeMs : null);
  const inputs = Math.max(newestMtime(join(ROOT, 'src')), newestMtime(join(ROOT, 'sims', S.sim)), S.compareConfig ? newestMtime(S.compareConfig) : 0);
  return staleWarnings({ inputs, shots: mt(join(S.shots, 'manifest.json')), compare: mt(S.compare), embed: mt(join(ROOT, S.embed)) });
}

/** 먼저 있어야 할 파일 — 빠진 것마다 무엇을 돌릴지 한 줄(빈 배열이면 다 있음). */
export function missingInputs(S, mode, exists = existsSync) {
  const out = [];
  if (mode === 'check' && !exists(join(S.base, 'hashes.json'))) out.push(`기준선 ${S.base}/hashes.json — 먼저 node scripts/atlas/regress_unit.mjs --unit ${S.id} --baseline`);
  if (mode === 'check' && !exists(join(S.base, 'shots', 'manifest.json'))) out.push(`기준선 캡처 ${S.base}/shots/manifest.json — 기준선을 다시 찍어야 함(--baseline)`);
  if (!exists(join(S.shots, 'manifest.json'))) out.push(`캡처 ${S.shots}/manifest.json — 먼저 node scripts/atlas/compare_shots.mjs --unit ${S.id}`);
  if (!exists(S.compare)) out.push(`대조표 ${S.compare} — 먼저 node scripts/atlas/compare.mjs --unit ${S.id}`);
  if (!exists(join(ROOT, S.embed))) out.push(`조각 ${S.embed} — 먼저 npm run embed -- ${S.sim}`);
  return out;
}

/** 도장(inputsHash) 값만 다르고 나머지 글자는 바이트까지 같은가(JSON 파일). */
function onlyStamp(a, b) {
  const strip = (t) => t.replace(/"inputsHash":\s*"[0-9a-f]*"/g, '"inputsHash":""');
  return strip(a) !== a && strip(a) === strip(b);
}

/** 대조표 HTML → {counts, body(만든 때·캡처 때 줄 뺌)}. */
function compareResult(html) {
  const n = (label) => { const m = html.match(new RegExp(`<span class="b-[a-z]+">${label} (\\d+)</span>`)); return m ? +m[1] : null; };
  return {
    counts: { diff: n('다름'), known: n('알려진 차이'), ok: n('같음'), info: n('참고') },
    body: html.replace(/만든 때 [^·]*· 캡처 [^(]*\(/, '만든 때 - · 캡처 - ('),
  };
}
const statsOf = (manifest) => Object.fromEntries(manifest.shots.map((s) => [s.name, s]));

function copy(src, dst) { writeFileSync(dst, readFileSync(src)); }

function baseline(S) {
  const BASE = S.base, EMBED = S.embed;
  mkdirSync(join(BASE, 'shots'), { recursive: true });
  const hashes = hashAll(S);
  writeFileSync(join(BASE, 'hashes.json'), JSON.stringify({ at: new Date().toISOString(), embedBytes: statSync(join(ROOT, EMBED)).size, files: hashes }, null, 1));
  const manifest = readJson(join(S.shots, 'manifest.json'));
  for (const s of manifest.shots) copy(join(S.shots, `${s.name}.png`), join(BASE, 'shots', `${s.name}.png`));
  copy(join(S.shots, 'manifest.json'), join(BASE, 'shots', 'manifest.json'));
  const html = readFileSync(S.compare, 'utf8');
  copy(S.compare, join(BASE, S.compareName));
  writeFileSync(join(BASE, 'compare.json'), JSON.stringify(compareResult(html).counts, null, 1));
  const c = compareResult(html).counts;
  console.log(`기준선 → ${BASE}`);
  console.log(`  해시 ${Object.keys(hashes).length}개 (저장소 ${Object.keys(hashes).filter((k) => k.startsWith('repo:')).length} · 작업 폴더 ${Object.keys(hashes).filter((k) => k.startsWith('work:')).length})`);
  console.log(`  캡처 ${manifest.shots.length}장, 대조표 다름 ${c.diff} · 알려진 차이 ${c.known} · 같음 ${c.ok} · 참고 ${c.info}, 조각 ${(statSync(join(ROOT, EMBED)).size / 1024).toFixed(1)} KB`);
}

function check(S) {
  const BASE = S.base, EMBED = S.embed, SHOTS = S.shots, COMPARE = S.compare;
  let fail = 0;
  const base = readJson(join(BASE, 'hashes.json'));
  const droppedMd = Object.keys(base.files).filter((k) => !hashable(k));
  base.files = Object.fromEntries(Object.entries(base.files).filter(([k]) => hashable(k)));   // 옛 기준선의 .md 키 — 비교에서 뺌
  const now = hashAll(S);
  const files = fileList(S);
  // 1. 해시
  const keys = [...new Set([...Object.keys(base.files), ...Object.keys(now)])].sort();
  const rows = [];
  for (const k of keys) {
    const a = base.files[k], b = now[k];
    if (a === b) continue;
    const kind = !a ? '새로 생김' : !b ? '없어짐' : '다름';
    rows.push({ k, kind, embed: k === `repo:${EMBED}` });
  }
  const real = rows.filter((r) => !r.embed);
  console.log(`\n[해시] ${keys.length}개 중 다른 파일 ${real.length}${rows.some((r) => r.embed) ? ' (+ 조각 — 크기만 봄)' : ''}`);
  if (droppedMd.length) console.log(`  (참고) 기준선의 .md 키 ${droppedMd.length}개는 비교에서 뺌(사람이 읽는 기록): ${droppedMd.join(', ')}`);
  for (const r of real) {
    let note = '';
    const kept = join(BASE, 'files', r.k.replace(':', '/'));
    if (r.kind === '다름' && existsSync(kept)) {
      const a = readFileSync(kept, 'utf8'), b = readFileSync(files[r.k], 'utf8');
      if (r.k.endsWith('.json') && onlyStamp(a, b)) { note = '  — 도장(inputsHash) 값만 다름(나머지 바이트 같음)'; r.stampOnly = true; }
      else { let i = 0; while (i < a.length && a[i] === b[i]) i++; note = `  — ${i}자째부터: 「${a.slice(i, i + 60)}」 → 「${b.slice(i, i + 60)}」`; }
    }
    console.log(`  ${r.kind}  ${r.k}${note}`);
  }
  const stampOnly = real.filter((x) => x.stampOnly).length;
  if (stampOnly) console.log(`  (그중 도장만 다름 ${stampOnly} — 입력 스크립트를 고치면 정당하게 바뀜, 내용은 같음)`);
  fail |= real.length - stampOnly > 0;   // 도장 값만 다른 것은 정당(입력 스크립트를 고침) — 알리기만
  // 2. 캡처
  const bm = readJson(join(BASE, 'shots', 'manifest.json'));
  const nm = existsSync(join(SHOTS, 'manifest.json')) ? readJson(join(SHOTS, 'manifest.json')) : { shots: [] };
  const bs = statsOf(bm), ns = statsOf(nm);
  const missing = Object.keys(bs).filter((n) => !ns[n]), extra = Object.keys(ns).filter((n) => !bs[n]);
  const pairsFile = join(BASE, '..', 'png-pairs.json');
  writeFileSync(pairsFile, JSON.stringify(Object.keys(bs).filter((n) => ns[n]).map((name) => ({ name, a: join(BASE, 'shots', `${name}.png`), b: join(SHOTS, `${name}.png`) }))));
  const r = spawnSync(PY, ['-I', join(ROOT, 'scripts/atlas/regress_png.py'), pairsFile], { encoding: 'utf8', maxBuffer: 1 << 24 });
  if (r.status !== 0) { console.error(r.stderr); fail = 1; }
  const px = r.status === 0 ? JSON.parse(r.stdout) : {};
  const pxDiff = Object.entries(px).filter(([, v]) => v.diff !== 0);
  // 화면 지명 수(labels·labelNames)는 캡처 뒤에 재는 값이라 지명 놓기 시점에 따라 흔들린다(G0 에서 같은 코드로 두 번 찍어
  // 화소는 같고 heritage 지명 100 ↔ 101 이 나옴) — 알리기만 하고 실패로 세지 않는다. 나머지 화면 값은 같아야 한다.
  const FLAKY = new Set(['labels', 'labelNames']);
  const strip = (st) => JSON.stringify(Object.fromEntries(Object.entries(st || {}).filter(([k]) => !FLAKY.has(k))));
  const statDiff = Object.keys(bs).filter((n) => ns[n] && strip(bs[n].stats) !== strip(ns[n].stats));
  const labelDiff = Object.keys(bs).filter((n) => ns[n] && !statDiff.includes(n) && JSON.stringify(bs[n].stats) !== JSON.stringify(ns[n].stats));
  console.log(`\n[캡처] 기준선 ${Object.keys(bs).length}장 · 새 ${Object.keys(ns).length}장 · 화소 다른 장면 ${pxDiff.length} · 화면 값(stats) 다른 장면 ${statDiff.length}`);
  if (missing.length) console.log(`  새 캡처에 없음: ${missing.join(', ')}`);
  if (extra.length) console.log(`  기준선에 없는 장면: ${extra.join(', ')}`);
  for (const [n, v] of pxDiff) console.log(`  화소 ${n}: ${v.error || `${v.diff}화소 상자 ${JSON.stringify(v.bbox)}`}`);
  if (labelDiff.length) console.log(`  (참고) 화면 지명 수만 다른 장면 ${labelDiff.length}: ${labelDiff.map((n) => `${n} ${bs[n].stats.labels}→${ns[n].stats.labels}`).join(', ')} — 재는 시점 흔들림, 화소가 같으면 무시`);
  for (const n of statDiff) console.log(`  화면 값 ${n}: ${JSON.stringify(bs[n].stats).slice(0, 200)} → ${JSON.stringify(ns[n].stats).slice(0, 200)}`);
  // 장면 차례·정보(이름·주제·도법·묶음·종류·설명 — stats 뺌)도 같아야 한다(대조표 HTML 의 캡처 차례가 이것을 따름)
  const infoOf = (m) => JSON.stringify(m.shots.map(({ stats, ...rest }) => rest));
  const sameInfo = infoOf(bm) === infoOf(nm);
  console.log(`  장면 차례·정보 ${sameInfo ? "같음" : "다름"}`);
  fail |= missing.length > 0 || extra.length > 0 || pxDiff.length > 0 || statDiff.length > 0 || !sameInfo;
  // 3. 대조표
  const bc = compareResult(readFileSync(join(BASE, S.compareName), 'utf8'));
  const nc = existsSync(COMPARE) ? compareResult(readFileSync(COMPARE, 'utf8')) : { counts: {}, body: '' };
  const sameCounts = JSON.stringify(bc.counts) === JSON.stringify(nc.counts);
  const sameBody = bc.body === nc.body;
  const fmt = (c) => `다름 ${c.diff} · 알려진 차이 ${c.known} · 같음 ${c.ok} · 참고 ${c.info}`;
  console.log(`\n[대조표] 기준선 ${fmt(bc.counts)} / 지금 ${fmt(nc.counts)} — 수 ${sameCounts ? '같음' : '다름'}, HTML(만든 때 줄 뺌) ${sameBody ? '같음' : '다름'}`);
  if (!sameBody) {
    const a = bc.body.split('\n'), b = nc.body.split('\n');
    let shown = 0;
    for (let i = 0; i < Math.max(a.length, b.length) && shown < 5; i++) if (a[i] !== b[i]) { console.log(`  ${i + 1}줄: ${(a[i] || '').slice(0, 160)}\n     → ${(b[i] || '').slice(0, 160)}`); shown++; }
  }
  fail |= !sameCounts || !sameBody;
  // 4. 조각 크기
  const eb = files[`repo:${EMBED}`] ? statSync(files[`repo:${EMBED}`]).size : null;
  const pct = eb == null ? null : ((eb - base.embedBytes) / base.embedBytes) * 100;
  console.log(`\n[조각] 기준선 ${(base.embedBytes / 1024).toFixed(1)} KB · 지금 ${eb == null ? '없음' : `${(eb / 1024).toFixed(1)} KB (${pct >= 0 ? '+' : ''}${pct.toFixed(3)}%)`} · 해시 ${base.files[`repo:${EMBED}`] === now[`repo:${EMBED}`] ? '같음' : '다름'}`);
  fail |= eb == null || Math.abs(pct) > 1;
  console.log(`\n${fail ? '회귀 있음 — 위 차이를 확인' : '회귀 없음'}`);
  process.exitCode = fail ? 1 : 0;
}

/** 기준선 원본 보관(차이 내용 보기용): JSON·JS 는 files/<repo|work>/경로 로 복사해 둔다. */
function keepSmallJson(S) {
  const dir = join(S.base, 'files');
  for (const [k, p] of Object.entries(fileList(S))) {
    if (!k.endsWith('.json') && !k.endsWith('.js')) continue;
    const dst = join(dir, k.replace(':', '/'));
    mkdirSync(resolve(dst, '..'), { recursive: true });
    copy(p, dst);
  }
}

/** 명령줄: [--unit uN] --baseline | --check. */
export function main(argv = process.argv.slice(2), env = process.env) {
  const { unit, rest } = stripUnitArgs(argv);
  const id = unit || env.ATLAS_UNIT || DEFAULT_UNIT;
  if (!rest.includes('--baseline') && !rest.includes('--check')) {
    console.error('사용: node scripts/atlas/regress_unit.mjs --unit uN --baseline | --check');
    process.exitCode = 2;
    return;
  }
  const S = unitSpec(id, { ATLAS_WORK: slash(env.ATLAS_WORK || 'C:/Users/Public/atlas-work') });
  const mode = rest.includes('--baseline') ? 'baseline' : 'check';
  const miss = missingInputs(S, mode);
  if (miss.length) {
    console.error(`${id}: 필요한 파일이 없어 ${mode === 'baseline' ? '기준선을 찍을' : '비교할'} 수 없다:`);
    for (const m of miss) console.error(`  - ${m}`);
    process.exitCode = 2;
    return;
  }
  for (const w of stalenessOf(S)) console.log(`[경고] ${w}`);
  if (mode === 'baseline') { baseline(S); keepSmallJson(S); }
  else check(S);
}

const isEntry = process.argv[1] && resolve(process.argv[1]).toLowerCase() === resolve(fileURLToPath(import.meta.url)).toLowerCase();
if (isEntry) main();
