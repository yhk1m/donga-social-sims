// scripts/atlas/hub_page.mjs — GitHub Pages 「사회과부도 모음」 보기 페이지 docs/atlas/index.html 을 만든다(조각이 아니라 사이트 페이지라 iframe 허용).
//   카드를 누르면 그 단원(같은 출처 ../<id>/)이 페이지 안 iframe 으로 열리고, 고른 단원은 주소 #<id> 에 남는다(새로 고침·공유해도 그대로).
//   카드 자료·모양은 조각(sims/atlas-hub)과 같다: src/atlas/hubData.js(hubUnits·cardTree) + sims/atlas-hub/style.css(.ds-sim → .av).
// 언제 갱신되나: scripts/release.mjs 가 목록 페이지(docs/index.html)를 다시 만들 때마다 이 페이지도 다시 쓴다(새 단원 공개·--index 모두).
//   손으로: node scripts/atlas/hub_page.mjs   (tests/atlas/hub.test.mjs 가 파일이 최신인지 확인한다)
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { SIMS } from '../../src/registry.js';
import { hubUnits, cardTree, topicTitles, resolveHubHash, HUB_THUMB_DIR } from '../../src/atlas/hubData.js';
import { ICONS } from '../../src/shared/dom.js';

const ROOT = resolve(import.meta.dirname, '..', '..');
export const HUB_PAGE = join(ROOT, 'docs', 'atlas', 'index.html');

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const attrText = (attrs) => Object.entries(attrs || {}).flatMap(([k, v]) => {
  if (v == null || v === false) return [];
  if (k === 'dataset') return Object.entries(v).map(([dk, dv]) => ` data-${dk.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}="${esc(dv)}"`);
  return [v === true ? ` ${k}` : ` ${k}="${esc(v)}"`];
}).join('');
const iconSvg = (name) => `<svg class="ds-icon" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name].map(([t, a]) => `<${t}${attrText(a)}/>`).join('')}</svg>`;

/** cardTree 마디 → HTML 글 */
function html(node) {
  if (node == null || node === false) return '';
  if (typeof node === 'string' || typeof node === 'number') return esc(node);
  const [tag, attrs, ...kids] = node;
  if (tag === '@icon') return iconSvg(attrs);
  if (tag === '@img') return `<img${attrText(attrs)}>`;
  return `<${tag}${attrText(attrs)}>${kids.map(html).join('')}</${tag}>`;
}

/** 단원 topics.json → 제목·쪽 (없으면 null) */
export function readTopics(id) {
  const f = join(ROOT, 'sims', id, 'data', 'topics.json');
  return existsSync(f) ? topicTitles(JSON.parse(readFileSync(f, 'utf8'))) : null;
}

/** 페이지 HTML (versions = docs/versions.json 내용) */
export function renderHubPage({ sims = SIMS, versions, topicsOf = readTopics } = {}) {
  const units = hubUnits({ sims, versions, topicsOf });
  const pub = units.filter((u) => u.status === 'published');
  const thumbOf = (u) => `../${HUB_THUMB_DIR}${u.id}.webp`;
  const cardCss = readFileSync(join(ROOT, 'sims', 'atlas-hub', 'style.css'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\.ds-sim(?![\w-])/g, '.av').replace(/\n{2,}/g, '\n').trim();
  const cards = units.map((u) => `<li class="ah-cell">${html(cardTree(u, { href: `#${u.id}`, thumb: thumbOf(u), openText: '이 페이지에서 열기' }))}</li>`).join('\n');
  const tabs = pub.map((u) => `<a class="av-tab" href="#${esc(u.id)}" data-unit="${esc(u.id)}"><img class="av-tab-img" src="${esc(thumbOf(u))}" alt="" width="64" height="40"><span class="av-tab-text"><b class="av-tab-name"><span class="ah-numeral">${esc(u.numeral)}.</span> ${esc(u.name)}</b><span class="av-tab-meta">${esc(u.pages ? `${u.pages[0]}~${u.pages[1]}쪽` : '')} · v${u.latest.v}</span></span></a>`).join('');
  const data = Object.fromEntries(pub.map((u) => [u.id, { label: u.label, v: u.latest.v }]));
  return `<!doctype html>
<!-- 만든 파일: scripts/atlas/hub_page.mjs (release.mjs 가 목록을 갱신할 때 함께 다시 씀) — 손으로 고치지 마세요 -->
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>사회과부도 모음</title>
<link rel="icon" href="../favicon.ico">
<style>
.av-body{margin:0;background:#f6f5f1}
${cardCss}
.av [hidden][hidden]{display:none}
.av-back{font-size:13px;color:var(--ink-2);text-decoration:none;display:inline-flex;align-items:center;gap:4px;margin-bottom:10px}
.av-back:hover{color:var(--accent)}
.av-view{display:flex;flex-direction:column;height:100vh;min-height:600px}
.av-bar{display:flex;align-items:center;gap:8px;padding:6px 10px;background:var(--panel);border-bottom:1px solid var(--line);flex-shrink:0;min-width:0}
.av-home,.av-solo{display:inline-flex;align-items:center;gap:6px;font-size:13px;font-weight:600;color:var(--ink);text-decoration:none;padding:7px 10px;border:1px solid var(--line);border-radius:8px;white-space:nowrap;background:var(--panel)}
.av-home:hover,.av-solo:hover{background:#f1f0eb}
.av-solo{color:var(--accent)}
.av-tabs{display:flex;gap:6px;overflow-x:auto;flex:1;min-width:0;padding:2px;scrollbar-width:thin}
.av-tab{display:flex;align-items:center;gap:8px;padding:4px 10px 4px 4px;border:1px solid var(--line);border-radius:10px;text-decoration:none;color:var(--ink);flex-shrink:0;background:var(--panel)}
.av-tab:hover{border-color:var(--accent)}
.av-tab[aria-current=page]{border-color:var(--accent);background:var(--accent-soft)}
.av-tab-img{width:64px;height:40px;object-fit:cover;border-radius:6px;background:#e9eef0;display:block}
.av-tab-text{display:flex;flex-direction:column;line-height:1.25}
.av-tab-name{font-size:14px;font-weight:800;white-space:nowrap}
.av-tab-meta{font-size:11.5px;color:var(--ink-2);white-space:nowrap;font-variant-numeric:tabular-nums}
.av-frame{flex:1;width:100%;border:0;display:block;background:var(--bg);min-height:0}
@media (max-width:820px){.av-tab-img{display:none}.av-solo-text{display:none}}
</style>
</head>
<body class="av-body">
<div class="av">
<div class="av-grid" id="av-grid">
<div class="ah-wrap">
<a class="av-back" href="../">${iconSvg('back')}사회과 인터랙티브 자료 전체 목록</a>
<header class="ah-top">
<div><h1 class="ah-h1">사회과부도 모음</h1><p class="ah-lead">중학 사회과 부도 단원별 인터랙티브 지도 · 카드를 누르면 이 페이지 안에서 열리고, 위 띠에서 다른 단원으로 바로 바꿀 수 있습니다.</p></div>
<span class="ah-count">공개 ${pub.length}개 단원 / ${units.length}개</span>
</header>
<ul class="ah-grid">
${cards}
</ul>
</div>
</div>
<div class="av-view" id="av-view" hidden>
<div class="av-bar">
<a class="av-home" href="#" title="단원 카드 모음으로">${iconSvg('grid')}모음</a>
<nav class="av-tabs" aria-label="단원">${tabs}</nav>
<a class="av-solo" id="av-solo" href="#" target="_blank" rel="noopener" title="이 단원만 새 창에서">${iconSvg('external')}<span class="av-solo-text">따로 열기</span></a>
</div>
<iframe class="av-frame" id="av-frame" title="사회과부도 단원" allow="fullscreen"></iframe>
</div>
</div>
<script>
(function () {
  var UNITS = ${JSON.stringify(data)};
  var IDS = Object.keys(UNITS);
  var resolveHubHash = ${resolveHubHash.toString()};
  var grid = document.getElementById('av-grid'), view = document.getElementById('av-view');
  var frame = document.getElementById('av-frame'), solo = document.getElementById('av-solo');
  var tabs = view.querySelectorAll('.av-tab');
  // 썸네일을 못 불러오면 숨김(빈 상자 대신 바탕색)
  document.querySelectorAll('img').forEach(function (img) { img.addEventListener('error', function () { img.style.visibility = 'hidden'; }, { once: true }); });
  function route() {
    var id = resolveHubHash(location.hash, IDS); // src/atlas/hubData.js 원문(깨진 주소·객체 키 → 모음)
    var u = id ? UNITS[id] : null;
    if (!u) {
      view.hidden = true; grid.hidden = false;
      if (frame.dataset.unit) { frame.removeAttribute('src'); delete frame.dataset.unit; }
      document.title = '사회과부도 모음';
      return;
    }
    grid.hidden = true; view.hidden = false;
    if (frame.dataset.unit !== id) { frame.src = '../' + id + '/'; frame.dataset.unit = id; frame.title = u.label; }
    solo.href = '../' + id + '/';
    tabs.forEach(function (t) { if (t.dataset.unit === id) t.setAttribute('aria-current', 'page'); else t.removeAttribute('aria-current'); });
    var cur = view.querySelector('.av-tab[aria-current]'); if (cur && cur.scrollIntoView) cur.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    document.title = u.label + ' · 사회과부도 모음';
  }
  window.addEventListener('hashchange', route);
  route();
})();
</script>
</body>
</html>
`;
}

/** docs/atlas/index.html 쓰기 (versions 를 안 주면 docs/versions.json) */
export function writeHubPage(versions) {
  const v = versions ?? JSON.parse(readFileSync(join(ROOT, 'docs', 'versions.json'), 'utf8'));
  mkdirSync(join(ROOT, 'docs', 'atlas'), { recursive: true });
  writeFileSync(HUB_PAGE, renderHubPage({ versions: v }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  writeHubPage();
  console.log('docs/atlas/index.html 갱신');
}
