// 각 자료를 붙여 넣을 수 있는 HTML 조각 하나로 만든다 (EMBED_RULES.md).
//   결과: embed/<id>.html = <div class="ds-<id>"><style>…</style><script>…</script></div>
//   - JS 는 IIFE 하나로 묶고(외부 파일·import()·fetch 없음), 자료 JSON 도 정적 import 로 안에 들어간다.
//   - CSS 의 .ds-sim 은 .ds-<id> 로 바꿔 래퍼에만 걸리게 한다.
//   - 만든 뒤 check-embed.mjs 로 규칙 검사.
// 사용: node scripts/build-embed.mjs [id ...]   (id 를 안 주면 sims/ 아래 전부)
import { build } from 'vite';
import { readdirSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { checkFragment } from './check-embed.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const SIMS = join(ROOT, 'sims');
const OUT = join(ROOT, 'embed');
const ENTRY_DIR = join(ROOT, 'node_modules', '.embed-entry');
mkdirSync(OUT, { recursive: true });
mkdirSync(ENTRY_DIR, { recursive: true });

const ids = process.argv.slice(2).length
  ? process.argv.slice(2)
  : readdirSync(SIMS).filter((d) => !d.startsWith('_') && existsSync(join(SIMS, d, 'main.js')));

// three.js 의 ImageUtils.getDataURL(텍스처를 JSON 으로 저장할 때만 쓰는 함수)은 data: URL 을 다룬다.
// 자료들은 텍스처 직렬화를 쓰지 않으므로 빌드 때 이 메서드 본문을 통째로 빼서 규칙(data: URL 금지)을 지킨다.
const stripThreeDataUrl = {
  name: 'strip-three-getDataURL',
  transform(code, id) {
    if (!/[\\/]three[\\/]build[\\/]three\.(module|core)\.js$/.test(id)) return null;
    const out = code.replace(/static getDataURL\( image \) \{[\s\S]*?\n\t\}\n/, "static getDataURL() {\n\t\tthrow new Error( 'getDataURL: embed 빌드에서 사용하지 않음' );\n\t}\n");
    if (out === code) this.warn('three.js getDataURL 을 찾지 못함 — 버전이 바뀌었는지 확인');
    return { code: out, map: null };
  },
};

let failed = 0;
for (const id of ids) {
  const entry = join(ENTRY_DIR, `${id}.js`);
  // document.currentScript = 래퍼 div 안의 <script>. 그 부모가 래퍼다.
  writeFileSync(entry, `import mount from ${JSON.stringify(join(SIMS, id, 'main.js').replaceAll('\\', '/'))};\nmount(document.currentScript.parentElement);\n`);
  const res = await build({
    configFile: false,
    logLevel: 'warn',
    root: ROOT,
    plugins: [stripThreeDataUrl],
    define: { 'process.env.NODE_ENV': '"production"' },
    build: {
      write: false,
      emptyOutDir: false,
      minify: true,
      assetsInlineLimit: 0, // 이미지 등을 data: URL 로 바꾸지 않는다(규칙 위반) — 자산 파일이 생기면 아래에서 실패 처리
      lib: { entry, formats: ['iife'], name: 'dsSim', fileName: () => 'sim.js' },
      rollupOptions: { output: { inlineDynamicImports: true } },
    },
  });
  const outputs = (Array.isArray(res) ? res : [res]).flatMap((r) => r.output);
  const js = outputs.filter((o) => o.type === 'chunk').map((o) => o.code).join('\n');
  const css = outputs.filter((o) => o.fileName.endsWith('.css')).map((o) => String(o.source)).join('\n');
  const others = outputs.filter((o) => o.type === 'asset' && !o.fileName.endsWith('.css'));
  if (others.length) {
    console.error(`[${id}] 조각에 넣을 수 없는 별도 파일: ${others.map((o) => o.fileName).join(', ')}`);
    failed++;
    continue;
  }
  const cls = `ds-${id}`;
  const scopedCss = css.replace(/\.ds-sim(?![\w-])/g, `.${cls}`);
  // 'var dsSim=(function(){…})();' 처럼 전역 변수가 생기지 않게 이름 없는 즉시 실행으로
  const safeJs = js.replace(/^\s*var dsSim\s*=\s*/, '').replace(/<\/script/gi, '<\\/script');
  const html = `<div class="${cls}">\n<style>\n${scopedCss}\n</style>\n<script>\n${safeJs}\n</script>\n</div>\n`;
  const file = join(OUT, `${id}.html`);
  writeFileSync(file, html);
  // 확인용: 조각을 다른 페이지에 붙여 넣은 상황을 흉내 낸 호스트 페이지 (배포물 아님)
  mkdirSync(join(OUT, 'preview'), { recursive: true });
  writeFileSync(join(OUT, 'preview', `${id}.html`), `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${id} 미리보기</title></head>
<body style="margin:0">
${html}</body></html>
`);
  const problems = checkFragment(html, cls);
  const kb = (Buffer.byteLength(html) / 1024).toFixed(0);
  if (problems.length) {
    failed++;
    console.error(`[${id}] 규칙 위반 ${problems.length}건 (${kb} KB) → embed/${id}.html`);
    for (const p of problems.slice(0, 40)) console.error('   - ' + p);
  } else {
    console.log(`[${id}] 통과 (${kb} KB) → embed/${id}.html`);
  }
}
process.exit(failed ? 1 : 0);
