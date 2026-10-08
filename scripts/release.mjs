// 자료의 새 버전을 docs/ 에 고정해 쌓는다 (GitHub Pages 가 docs/ 를 그대로 공개).
//   docs/<id>/<n>/index.html     그 버전 페이지 (한 번 만들면 다시 쓰지 않음)
//   docs/<id>/<n>/fragment.html  그 버전의 붙여 넣기용 HTML 조각
//   docs/<id>/index.html         최신 버전과 같은 내용 (/<id> 로 들어오면 최신)
//   docs/versions.json           버전 기록, docs/index.html 전체 목록
// 사용:
//   node scripts/release.mjs <id> [<id> ...] [--note "바뀐 점"]   지정한 자료만 새 버전
//   node scripts/release.mjs --all [--note "..."]                   바뀐 자료 전부
//   node scripts/release.mjs --index                                목록 페이지만 다시 만들기
// 조각 내용이 최신 버전과 똑같으면 새 번호를 만들지 않는다.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { BOOKS, SIMS } from '../src/registry.js';

const ROOT = resolve(import.meta.dirname, '..');
const DOCS = join(ROOT, 'docs');
const EMBED = join(ROOT, 'embed');
const MANIFEST = join(DOCS, 'versions.json');

const args = process.argv.slice(2);
const noteIdx = args.indexOf('--note');
const note = noteIdx >= 0 ? args[noteIdx + 1] ?? '' : '';
const flags = new Set(args.filter((a, i) => a.startsWith('--') || (noteIdx >= 0 && i === noteIdx + 1)));
let ids = args.filter((a) => !flags.has(a));
if (args.includes('--all')) ids = SIMS.map((s) => s.id).filter((id) => existsSync(join(ROOT, 'sims', id, 'main.js')));
const indexOnly = args.includes('--index');

if (!indexOnly && !ids.length) {
  console.error('사용: node scripts/release.mjs <id ...> | --all | --index  [--note "바뀐 점"]');
  process.exit(1);
}
for (const id of ids) {
  if (!SIMS.some((s) => s.id === id)) {
    console.error(`registry.js 에 없는 자료: ${id}`);
    process.exit(1);
  }
}

mkdirSync(DOCS, { recursive: true });
writeFileSync(join(DOCS, '.nojekyll'), ''); // GitHub Pages 가 Jekyll 처리 없이 파일 그대로 공개하게
const manifest = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, 'utf8')) : {};

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });

function pageHtml(meta, fragment, version) {
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(meta.title)}${version ? ` (v${version})` : ''}</title>
<link rel="icon" href="../favicon.ico">
<style>.ds-page{margin:0}</style>
</head>
<body class="ds-page" style="margin:0">
${fragment}</body>
</html>
`;
}

if (!indexOnly) {
  // 1) 조각 빌드 + 규칙 검사 (하나라도 실패하면 아무것도 쓰지 않는다)
  execFileSync(process.execPath, [join(ROOT, 'scripts', 'build-embed.mjs'), ...ids], { stdio: 'inherit' });

  // 2) 버전 고정
  for (const id of ids) {
    const meta = SIMS.find((s) => s.id === id);
    const fragment = readFileSync(join(EMBED, `${id}.html`), 'utf8');
    const dir = join(DOCS, id);
    mkdirSync(dir, { recursive: true });
    const nums = readdirSync(dir).filter((d) => /^\d+$/.test(d)).map(Number).sort((a, b) => a - b);
    const last = nums.at(-1);
    if (last && readFileSync(join(dir, String(last), 'fragment.html'), 'utf8') === fragment) {
      console.log(`[${id}] 최신 v${last} 와 같음 — 새 버전 만들지 않음`);
      continue;
    }
    const n = (last ?? 0) + 1;
    const vdir = join(dir, String(n));
    if (existsSync(vdir)) throw new Error(`${vdir} 가 이미 있음 — 덮어쓰지 않음`);
    mkdirSync(vdir);
    // 버전 폴더는 docs/<id>/<n>/ 이라 아이콘 경로가 한 단계 더 깊다
    writeFileSync(join(vdir, 'index.html'), pageHtml(meta, fragment, n).replace('href="../favicon.ico"', 'href="../../favicon.ico"'));
    writeFileSync(join(vdir, 'fragment.html'), fragment);
    writeFileSync(join(dir, 'index.html'), pageHtml(meta, fragment, null));
    (manifest[id] ??= []).push({ v: n, date: today, ...(note ? { note } : {}) });
    console.log(`[${id}] v${n} 공개 → docs/${id}/${n}/`);
  }
  writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n');
}

// 3) 목록 페이지
const favicon = join(ROOT, 'public', 'favicon.ico');
if (existsSync(favicon)) writeFileSync(join(DOCS, 'favicon.ico'), readFileSync(favicon));
const rows = BOOKS.map((book) => {
  const sims = SIMS.filter((s) => s.book === book.id && manifest[s.id]?.length);
  if (!sims.length) return '';
  return `<section class="hub-book"><h2 class="hub-h2">${esc(book.title)}</h2>${sims.map((s) => {
    const vers = manifest[s.id];
    const latest = vers.at(-1);
    return `<div class="hub-item">
  <a class="hub-title" href="./${s.id}/">${esc(s.title)}</a>
  <div class="hub-meta">${esc(s.unit)}${s.page ? ` · ${s.page}쪽` : ''} · <code class="hub-code">/${s.id}</code> · 최신 v${latest.v} (${latest.date})</div>
  <div class="hub-vers">${vers.slice().reverse().map((v) => `<a class="hub-ver" href="./${s.id}/${v.v}/" title="${esc(v.note ?? '')}">v${v.v}</a><a class="hub-frag" href="./${s.id}/${v.v}/fragment.html">조각</a>`).join('')}</div>
</div>`;
  }).join('')}</section>`;
}).join('');
writeFileSync(join(DOCS, 'index.html'), `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>사회과 인터랙티브 자료</title>
<link rel="icon" href="./favicon.ico">
<style>
.hub-body{margin:0;background:#f6f5f1;color:#1d2126;font-family:Pretendard,'Apple SD Gothic Neo','Malgun Gothic',system-ui,sans-serif;line-height:1.5}
.hub{max-width:880px;margin:0 auto;padding:32px 16px 64px}
.hub-h1{font-size:26px;margin:0 0 4px}
.hub-lead{color:#5b636d;margin:0 0 28px;font-size:14px}
.hub-h2{font-size:18px;margin:28px 0 8px;padding-bottom:8px;border-bottom:2px solid #1d2126}
.hub-item{background:#fff;border:1px solid #e2e0d9;border-radius:12px;padding:14px 16px;margin-top:10px}
.hub-title{font-weight:700;color:#1d2126;text-decoration:none;font-size:16px}
.hub-title:hover{color:#1f6feb}
.hub-meta{font-size:13px;color:#5b636d;margin-top:2px}
.hub-code{font-size:12px;background:#f1f0eb;padding:1px 5px;border-radius:4px}
.hub-vers{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}
.hub-ver{font-size:13px;padding:2px 9px;border-radius:6px 0 0 6px;background:#e6efff;color:#1f6feb;text-decoration:none;font-weight:600}
.hub-frag{font-size:12px;padding:2px 8px;border-radius:0 6px 6px 0;border:1px solid #e6efff;color:#5b636d;text-decoration:none;margin-right:6px}
.hub-ver:hover,.hub-frag:hover{filter:brightness(.95)}
</style>
</head>
<body class="hub-body">
<main class="hub">
<h1 class="hub-h1">사회과 인터랙티브 자료</h1>
<p class="hub-lead">동아출판 2022 개정 교과서 쪽별 자료. 주소 뒤에 <code class="hub-code">/자료이름</code> 은 최신 버전, <code class="hub-code">/자료이름/번호</code> 는 그 버전 고정 링크입니다. 「조각」은 다른 페이지에 붙여 넣는 HTML 입니다.</p>
${rows}
</main>
</body>
</html>
`);
console.log('docs/index.html 목록 갱신');
