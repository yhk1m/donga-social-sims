// © 2026 김용현
// scripts/atlas/regress_u2.mjs — 2단계 G(파이프라인 일반화) 회귀 증명: 아시아(u2) 산출물이 바뀌지 않았는지 기준선과 견준다.
//   node scripts/atlas/regress_u2.mjs --baseline   지금 산출물 해시·대조표 캡처·대조표 결과·조각 크기를 기준선으로 저장
//   node scripts/atlas/regress_u2.mjs --check      같은 목록을 다시 재서 기준선과 비교(다르면 종료 코드 1)
//   기준선: $ATLAS_WORK/units/u2/baseline/ (저장소 밖) — hashes.json · shots/<장면>.png · shots/manifest.json · compare.json · compare-u2.html
//           · files/<repo|work>/<경로> (JSON·JS 원본 — 다를 때 내용 비교)
//   먼저 돌릴 것: node scripts/atlas/compare_shots.mjs → node scripts/atlas/compare.mjs (이 스크립트는 그 결과를 읽기만 한다)
//   - 해시: 저장소 sims/atlas-u2-asia/data/** · content/atlas/u2/** · docs/assets/atlas/** · embed/atlas-u2-asia.html,
//           작업 폴더 vec/p16~p25-*.json · geo/p16~p25*.fit.json · text/places-*.json · text/p17-labels.json · tables/charts-u2.json·climate-world.json·index.json
//     JSON 이 다르면 도장(inputsHash — 입력 스크립트 내용 해시)만 다른지도 따로 알린다(스크립트를 고치면 도장은 정당하게 바뀜).
//     조각(embed)은 코드 위치가 바뀌면 달라지는 게 정당해(2단계 설계 §4.2) 해시 차이를 실패로 세지 않고 크기 차(±1%)만 본다.
//   - 캡처: 기준선 manifest 의 장면마다 화소 비교(regress_png.py — 다른 화소 수와 상자), 장면 이름·화면에서 센 값(stats) 비교.
//   - 대조표: compare-u2.html 의 수(다름·알려진 차이·같음·참고)와, 만든 때·캡처 때 줄을 뺀 HTML 전체가 같은지.
//   디렉터리는 손 순회(readdirSync + statSync) — 이 PC 한글 경로에서 재귀 fs 옵션이 죽는다.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..', '..');
const WORK = (process.env.ATLAS_WORK || 'C:/Users/Public/atlas-work').replace(/\\/g, '/');
const BASE = join(WORK, 'units', 'u2', 'baseline');
const SHOTS = join(WORK, 'shots', 'e2');
const COMPARE = join(WORK, 'compare-u2.html');
const EMBED = 'embed/atlas-u2-asia.html';
const PY = process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3');

const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));

/** 디렉터리 아래 파일(손 순회), 경로는 base 기준 슬래시. */
function walk(dir, base = dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) out.push(...walk(p, base));
    else out.push(p.slice(base.length + 1).replace(/\\/g, '/'));
  }
  return out;
}
/** 한 단계 디렉터리에서 이름이 re 에 맞는 파일. */
const flat = (dir, re) => (existsSync(join(WORK, dir)) ? readdirSync(join(WORK, dir)).filter((n) => re.test(n)).map((n) => `${dir}/${n}`) : []);

/** 비교할 파일 목록: 'repo:경로' | 'work:경로' → 절대 경로. */
function fileList() {
  const files = {};
  for (const d of ['sims/atlas-u2-asia/data', 'content/atlas/u2', 'docs/assets/atlas']) for (const f of walk(join(ROOT, d))) files[`repo:${d}/${f}`] = join(ROOT, d, f);
  if (existsSync(join(ROOT, EMBED))) files[`repo:${EMBED}`] = join(ROOT, EMBED);
  const work = [
    ...flat('vec', /^p(1[6-9]|2[0-5])-.*\.json$/),
    ...flat('geo', /^p(1[6-9]|2[0-5]).*\.fit\.json$/),
    ...flat('text', /^places-.*\.json$/), ...flat('text', /^p17-labels\.json$/),
    ...flat('tables', /^(charts-u2|climate-world|index)\.json$/),
  ];
  for (const f of work) files[`work:${f}`] = join(WORK, f);
  return Object.fromEntries(Object.entries(files).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}
const hashAll = () => Object.fromEntries(Object.entries(fileList()).map(([k, p]) => [k, sha(p)]));

/** 도장(inputsHash)을 뺀 JSON 이 같은가(둘 다 JSON 일 때만). */
function onlyStamp(a, b) {
  const strip = (o) => (Array.isArray(o) ? o.map(strip) : o && typeof o === 'object'
    ? Object.fromEntries(Object.entries(o).filter(([k]) => k !== 'inputsHash').map(([k, v]) => [k, strip(v)])) : o);
  try { return JSON.stringify(strip(JSON.parse(a))) === JSON.stringify(strip(JSON.parse(b))); } catch { return false; }
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

function baseline() {
  mkdirSync(join(BASE, 'shots'), { recursive: true });
  const hashes = hashAll();
  writeFileSync(join(BASE, 'hashes.json'), JSON.stringify({ at: new Date().toISOString(), embedBytes: statSync(join(ROOT, EMBED)).size, files: hashes }, null, 1));
  const manifest = readJson(join(SHOTS, 'manifest.json'));
  for (const s of manifest.shots) copy(join(SHOTS, `${s.name}.png`), join(BASE, 'shots', `${s.name}.png`));
  copy(join(SHOTS, 'manifest.json'), join(BASE, 'shots', 'manifest.json'));
  const html = readFileSync(COMPARE, 'utf8');
  copy(COMPARE, join(BASE, 'compare-u2.html'));
  writeFileSync(join(BASE, 'compare.json'), JSON.stringify(compareResult(html).counts, null, 1));
  const c = compareResult(html).counts;
  console.log(`기준선 → ${BASE}`);
  console.log(`  해시 ${Object.keys(hashes).length}개 (저장소 ${Object.keys(hashes).filter((k) => k.startsWith('repo:')).length} · 작업 폴더 ${Object.keys(hashes).filter((k) => k.startsWith('work:')).length})`);
  console.log(`  캡처 ${manifest.shots.length}장, 대조표 다름 ${c.diff} · 알려진 차이 ${c.known} · 같음 ${c.ok} · 참고 ${c.info}, 조각 ${(statSync(join(ROOT, EMBED)).size / 1024).toFixed(1)} KB`);
}

function check() {
  let fail = 0;
  const base = readJson(join(BASE, 'hashes.json'));
  const now = hashAll();
  const files = fileList();
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
  for (const r of real) {
    let note = '';
    const kept = join(BASE, 'files', r.k.replace(':', '/'));
    if (r.kind === '다름' && existsSync(kept)) {
      const a = readFileSync(kept, 'utf8'), b = readFileSync(files[r.k], 'utf8');
      if (r.k.endsWith('.json') && onlyStamp(a, b)) { note = '  — 도장(inputsHash)만 다름'; r.stampOnly = true; }
      else { let i = 0; while (i < a.length && a[i] === b[i]) i++; note = `  — ${i}자째부터: 「${a.slice(i, i + 60)}」 → 「${b.slice(i, i + 60)}」`; }
    }
    console.log(`  ${r.kind}  ${r.k}${note}`);
  }
  const stampOnly = real.filter((x) => x.stampOnly).length;
  if (stampOnly) console.log(`  (그중 도장만 다름 ${stampOnly} — 입력 스크립트를 고치면 정당하게 바뀜, 내용은 같음)`);
  fail |= real.length > 0;
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
  fail |= missing.length > 0 || extra.length > 0 || pxDiff.length > 0 || statDiff.length > 0;
  // 3. 대조표
  const bc = compareResult(readFileSync(join(BASE, 'compare-u2.html'), 'utf8'));
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
function keepSmallJson() {
  const dir = join(BASE, 'files');
  for (const [k, p] of Object.entries(fileList())) {
    if (!k.endsWith('.json') && !k.endsWith('.js')) continue;
    const dst = join(dir, k.replace(':', '/'));
    mkdirSync(resolve(dst, '..'), { recursive: true });
    copy(p, dst);
  }
}

const argv = process.argv.slice(2);
if (argv.includes('--baseline')) { baseline(); keepSmallJson(); }
else if (argv.includes('--check')) check();
else { console.error('사용: node scripts/atlas/regress_u2.mjs --baseline | --check'); process.exitCode = 2; }
