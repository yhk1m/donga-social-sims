// EMBED_RULES.md 검사기. 조각 HTML 을 받아 위반 목록(문자열 배열)을 돌려준다.
//   node scripts/check-embed.mjs embed/<id>.html ...  로 단독 실행도 된다.
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';

const JS_FORBIDDEN = [
  [/\beval\s*\(/, 'eval'],
  [/\bnew\s+Function\b/, 'new Function'],
  [/\bFunction\s*\(\s*["'`]/, 'Function(문자열)'],
  [/\bfetch\s*\(/, 'fetch'],
  [/\bXMLHttpRequest\b/, 'XMLHttpRequest'],
  [/\bWebSocket\b/, 'WebSocket'],
  [/\bEventSource\b/, 'EventSource'],
  [/\bsendBeacon\b/, 'sendBeacon'],
  [/\bnew\s+(Shared)?Worker\b/, 'Worker'],
  [/\bserviceWorker\b|\bServiceWorker\b/, 'ServiceWorker'],
  [/(^|[^\w.$])import\s*\(/, 'import()'],
  [/\bimport\s*[{*\w][^;]*\bfrom\b|^\s*import\s+["']/m, '정적 import 문(번들되지 않음)'],
  [/\bparent\.document\b/, 'parent.document'],
  [/\bwindow\.top\b|\btop\.location\b/, 'window.top'],
  [/\bdocument\.cookie\b/, 'document.cookie'],
  [/\bwindow\.open\s*\(/, 'window.open'],
  [/\blocation\.(href|replace|assign)\b/, 'location.href/replace'],
  [/\.innerHTML\b/, 'innerHTML'],
  [/\.outerHTML\b/, 'outerHTML'],
  [/\bdocument\.write(ln)?\s*\(/, 'document.write'],
  [/\binsertAdjacentHTML\b/, 'insertAdjacentHTML'],
  // URL 스킴: 문자열·정규식 시작 직후에 오거나(예: "data:…", /^data:/) MIME 형태가 따라올 때만 (객체 키 {data:x} 는 제외)
  [/(["'`]\s*|\/\^?)javascript:/i, 'javascript: URL'],
  [/(["'`(]\s*|\/\^?)data:|\bdata:[a-z-]+\/[\w.+-]+/i, 'data: URL'],
  [/(["'`(]\s*|\/\^?)blob:|\bblob:https?:/i, 'blob: URL'],
  [/\bcreateObjectURL\b/, 'blob URL(createObjectURL)'],
  [/setAttribute\s*\(\s*["'`]on/i, "setAttribute('on*')"],
  [/\bsrcdoc\b/, 'srcdoc'],
  [/\bparseFromString\b/, 'DOMParser.parseFromString'],
  [/\bpostMessage\b/, 'postMessage'],
  [/\bdocument\.(querySelector(All)?|getElementById|getElementsBy\w+)\s*\(/, 'document 전체 검색(래퍼 밖)'],
  [/\bdocument\.(body|documentElement|head)\b/, 'document.body/head 접근(래퍼 밖)'],
];

const HTML_FORBIDDEN = [
  [/<iframe\b/i, '<iframe>'],
  [/<object\b/i, '<object>'],
  [/<embed\b/i, '<embed>'],
  [/http-equiv\s*=\s*["']?refresh/i, 'meta refresh'],
  [/<form\b/i, '<form>'],
  [/<link\b/i, '<link>(외부 자원)'],
  [/<script\b[^>]*\bsrc\s*=/i, '<script src>(외부 스크립트)'],
  [/\son[a-z]+\s*=\s*["']/i, '인라인 on* 속성'],
];

const STORAGE_PERSONAL = /(email|e-mail|name|phone|tel|password|passwd|pwd|token|login|userid|user_id|uid|ssn|주민|이름|전화)/i;

function lineOf(text, idx) {
  return text.slice(0, idx).split('\n').length;
}

/** CSS 검사: 선택자 범위·금지 선택자·금지 선언 */
function checkCss(css, cls, problems) {
  const src = css.replace(/\/\*[\s\S]*?\*\//g, '');
  // 아주 단순한 파서: 블록 단위로 내려가며 선택자 { 선언 } 을 모은다.
  let i = 0;
  const walk = (inKeyframes) => {
    while (i < src.length) {
      const open = src.indexOf('{', i);
      const close = src.indexOf('}', i);
      if (close !== -1 && (open === -1 || close < open)) { i = close + 1; return; }
      if (open === -1) return;
      const prelude = src.slice(i, open).trim();
      i = open + 1;
      if (prelude.startsWith('@')) {
        if (/^@(media|supports|container|layer)\b/.test(prelude)) walk(false);
        else if (/^@(-\w+-)?keyframes\b/.test(prelude)) walk(true);
        else if (/^@font-face\b/.test(prelude)) { const end = src.indexOf('}', i); checkDecl(src.slice(i, end), prelude); i = end + 1; }
        else { problems.push(`CSS: 허용하지 않는 @규칙 '${prelude.slice(0, 40)}'`); const end = src.indexOf('}', i); i = end + 1; }
        continue;
      }
      const end = src.indexOf('}', i);
      const body = src.slice(i, end);
      i = end + 1;
      if (inKeyframes) { checkDecl(body, prelude); continue; }
      for (const sel of prelude.split(',').map((x) => x.trim()).filter(Boolean)) checkSelector(sel);
      checkDecl(body, prelude);
    }
  };
  const checkSelector = (sel) => {
    const clsRe = new RegExp(`^\\.${cls.replace(/[-]/g, '\\-')}(?![\\w-])`);
    if (!clsRe.test(sel)) problems.push(`CSS: 래퍼(.${cls})로 시작하지 않는 선택자 '${sel}'`);
    if (/:root\b/.test(sel)) problems.push(`CSS: :root '${sel}'`);
    if (/\*/.test(sel.replace(/\[[^\]]*\]/g, ''))) problems.push(`CSS: * 선택자 '${sel}'`);
    if (/\[\s*class\s*[*^$|~]?=/.test(sel)) problems.push(`CSS: [class…=] 선택자 '${sel}'`);
    // 태그 선택자: 속성·문자열·의사 클래스 인자를 지우고, 조합자 뒤나 맨 앞에 오는 식별자를 찾는다
    const bare = sel.replace(/\[[^\]]*\]/g, '').replace(/\((?:[^()]|\([^()]*\))*\)/g, (m) => m.replace(/[a-z]/gi, ''));
    const parts = bare.split(/[\s>+~]+/).filter(Boolean);
    for (const p of parts) if (/^[a-zA-Z]/.test(p)) problems.push(`CSS: 태그 선택자 '${p}' in '${sel}'`);
  };
  const checkDecl = (body, where) => {
    if (/!\s*important/i.test(body)) problems.push(`CSS: !important in '${where}'`);
    if (/position\s*:\s*fixed/i.test(body)) problems.push(`CSS: position:fixed in '${where}'`);
    for (const m of body.matchAll(/z-index\s*:\s*(-?\d+)/gi)) if (+m[1] > 100) problems.push(`CSS: z-index ${m[1]} in '${where}'`);
    if (/url\s*\(\s*["']?\s*(data:|blob:|javascript:)/i.test(body)) problems.push(`CSS: data/blob/javascript URL in '${where}'`);
    if (/url\s*\(\s*["']?\s*https?:/i.test(body)) problems.push(`CSS: 외부 URL in '${where}'`);
  };
  if (/@import\b/.test(src)) problems.push('CSS: @import (외부 자원)');
  walk(false);
}

function checkJs(js, problems) {
  for (const [re, name] of JS_FORBIDDEN) {
    const m = re.exec(js);
    if (m) problems.push(`JS: ${name} (줄 ${lineOf(js, m.index)}: …${js.slice(Math.max(0, m.index - 30), m.index + 40).replace(/\s+/g, ' ')}…)`);
  }
  for (const m of js.matchAll(/(localStorage|sessionStorage)\s*\.\s*setItem\s*\(\s*([^,]+),/g)) {
    if (STORAGE_PERSONAL.test(m[2])) problems.push(`JS: 개인정보로 보이는 저장 키 ${m[2]}`);
  }
  // inline style 에 position:fixed 를 넣는 경우
  if (/position\s*=\s*["']fixed["']|position:\s*["']fixed["']/.test(js)) problems.push('JS: style.position = fixed');
  for (const m of js.matchAll(/zIndex\s*[=:]\s*["']?(\d+)/g)) if (+m[1] > 100) problems.push(`JS: zIndex ${m[1]}`);
}

export function checkFragment(html, cls) {
  const problems = [];
  const trimmed = html.trim();
  if (!trimmed.startsWith(`<div class="${cls}">`) || !trimmed.endsWith('</div>')) problems.push(`구조: 래퍼 <div class="${cls}"> 로 감싸지 않음`);
  const styles = [...html.matchAll(/<style>([\s\S]*?)<\/style>/g)].map((m) => m[1]);
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  const markup = html.replace(/<style>[\s\S]*?<\/style>/g, '').replace(/<script>[\s\S]*?<\/script>/g, '');
  for (const [re, name] of HTML_FORBIDDEN) if (re.test(markup)) problems.push(`HTML: ${name}`);
  for (const css of styles) checkCss(css, cls, problems);
  for (const js of scripts) checkJs(js, problems);
  return problems;
}

if (process.argv[1] && basename(process.argv[1]) === 'check-embed.mjs') {
  let bad = 0;
  for (const f of process.argv.slice(2)) {
    const html = readFileSync(f, 'utf8');
    const cls = html.match(/^<div class="([^"]+)">/)?.[1] ?? '';
    const p = checkFragment(html, cls);
    console.log(`${f}: ${p.length ? `위반 ${p.length}건` : '통과'}`);
    p.forEach((x) => console.log('  - ' + x));
    if (p.length) bad++;
  }
  process.exit(bad ? 1 : 0);
}
