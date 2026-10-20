// scripts/atlas/hub_thumbs.mjs — 「사회과부도 모음」 카드 썸네일: 단원 기본 화면(첫 주제·기본 바탕)의 지도 무대를 찍어 640×400 WebP 로.
//   node scripts/atlas/hub_thumbs.mjs [<id> ...] [--local]
//     id 를 안 주면 공개한 사회과부도 단원 전부(hubUnits — registry + docs/versions.json).
//     기본은 공개 Pages 페이지(https://yhk1m.github.io/donga-social-sims/<id>/)를 찍는다.
//     --local: 아직 안 올린 단원은 이 저장소 개발 서버(vite, 이 스크립트가 5320 번대에서 띄우고 끔)의 /sims/<id>/ 를 찍는다.
//   출력: docs/assets/atlas/hub/<id>.webp (80 KB 넘으면 품질을 낮춰 다시)
//   헤드리스 Chrome 은 scripts/atlas/cdp.mjs(--disable-gpu + swiftshader + 새 user-data-dir + 캐시 0).
//   1600×800 창 = 무대 1280×800(사이드바 320) → clip scale 0.5 로 640×400. 지도 도구·축척 막대·범례 칸은 숨기고 찍는다(작은 그림에서 잡음).
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { SIMS } from '../../src/registry.js';
import { hubUnits, PAGES_BASE, HUB_THUMB_DIR } from '../../src/atlas/hubData.js';
import { launchChrome, sleep } from './cdp.mjs';
import { readFileSync } from 'node:fs';

const ROOT = resolve(import.meta.dirname, '..', '..');
const OUT = join(ROOT, 'docs', ...HUB_THUMB_DIR.split('/').filter(Boolean));
const args = process.argv.slice(2);
const local = args.includes('--local');
let ids = args.filter((a) => !a.startsWith('--'));
if (!ids.length) {
  const versions = JSON.parse(readFileSync(join(ROOT, 'docs', 'versions.json'), 'utf8'));
  ids = hubUnits({ sims: SIMS, versions, plan: [] }).map((u) => u.id);
}
const W = 1600, H = 800, MAX_BYTES = 80 * 1024;
mkdirSync(OUT, { recursive: true });

let server = null, base = PAGES_BASE;
if (local) {
  const { createServer } = await import('vite');
  server = await createServer({ root: ROOT, logLevel: 'error', server: { port: 5320, strictPort: false, hmr: false } });
  await server.listen();
  base = server.resolvedUrls.local[0].replace(/\/?$/, '/') + 'sims/';
}

const R = "document.querySelector('.ds-stage')?.parentElement"; // 래퍼(공개 페이지는 body 도 ds-page 라 [class^=ds-] 로는 못 고름)
const c = await launchChrome({ width: W, height: H });
try {
  for (const id of ids) {
    const url = `${base}${id}/`;
    await c.navigate(url);
    for (let i = 0; i < 200; i++) { await sleep(100); try { if (await c.evaluate(`!!${R}?.atlasTopic`)) break; } catch { /* 불러오는 중 */ } }
    for (const k of ['atlasRelief', 'atlasTint']) for (let i = 0; i < 100; i++) { if (await c.evaluate(`!!${R}.${k}`)) break; await sleep(100); }
    for (let i = 0; i < 100; i++) { if (!(await c.evaluate(`!!(${R}.atlasMap.options.natural && !${R}.atlasMap.naturalReady)`))) break; await sleep(100); }
    // 지도가 멈출 때까지(3번 연속 움직임 없음) + 여유
    await c.evaluate(`(async()=>{const m=${R}.atlasMap;let n=0;for(let i=0;i<200&&n<3;i++){await new Promise(r=>setTimeout(r,50));n=m.view.moving?0:n+1;}await new Promise(r=>setTimeout(r,600));})()`);
    await c.evaluate(`(()=>{const s=document.createElement('style');s.textContent='.at-tools,.at-scale,.at-legend-panel{visibility:hidden}';${R}.append(s);})()`);
    await sleep(300);
    const rect = await c.evaluate(`(()=>{const b=${R}.querySelector('.ds-stage').getBoundingClientRect();return {x:b.x,y:b.y,width:b.width,height:b.height};})()`);
    const clip = { x: rect.x, y: rect.y, width: rect.width, height: rect.width * 400 / 640, scale: 640 / rect.width };
    let q = 82, buf;
    do { buf = await c.screenshot({ format: 'webp', quality: q, clip }); q -= 8; } while (buf.length > MAX_BYTES && q > 30);
    writeFileSync(join(OUT, `${id}.webp`), buf);
    console.log(`[${id}] ${url} → docs/${HUB_THUMB_DIR}${id}.webp (${(buf.length / 1024).toFixed(0)} KB, 품질 ${q + 8})`);
  }
  if (c.errors.length) console.warn(`콘솔 오류 ${c.errors.length}건:\n  ${c.errors.join('\n  ')}`);
} finally {
  await c.close();
  if (server) await server.close();
}
