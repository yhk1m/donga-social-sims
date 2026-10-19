// © 2026 김용현
// scripts/atlas/compare_shots.mjs — E2 교과서 대조표용 캡처: 개발 서버(vite, 이 스크립트 안에서 띄움) + 헤드리스 Chrome(CDP, 의존성 없음)
//   node scripts/atlas/compare_shots.mjs [--only <장면 이름 앞부분,…>]
//   출력: $ATLAS_WORK/shots/e2/<장면>.png (1440×900) + manifest.json(장면 → 주제·묶음·도법·화면에서 센 값)
//   - 주제마다 ?topic=<id>&proj=<도법>(main.js 의 개발 서버 전용 매개변수)으로 새로 열고, 묶음(지도 고르기)마다 showGroup(i)로 한 장씩.
//   - 사진·원본 쪽·음영은 공개 Pages 주소라 Fetch 가로채기로 docs/assets 파일을 대답한다(아직 안 올린 이미지도 보임).
//   - Chrome 은 --disable-gpu + 새 user-data-dir, 끝나면 Chrome·vite 를 모두 끈다(한 번에 하나씩만 띄움).
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, statSync, unlinkSync, rmdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createServer } from 'vite';

const ROOT = resolve(import.meta.dirname, '..', '..');
const WORK = process.env.ATLAS_WORK || 'C:/Users/Public/atlas-work';
const OUT = join(WORK, 'shots', 'e2');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PAGES = 'https://yhk1m.github.io/donga-social-sims/assets/';
const ASSETS = join(ROOT, 'docs', 'assets');
const W = 1440, H = 900;
const onlyArg = process.argv.indexOf('--only');
const ONLY = onlyArg > 0 ? process.argv[onlyArg + 1].split(',') : null;
const want = (name) => !ONLY || ONLY.some((p) => name.startsWith(p));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const topics = JSON.parse(readFileSync(join(ROOT, 'sims/atlas-u2-asia/data/topics.json'), 'utf8'));

// 한글 경로에서 재귀 rmSync 가 죽는 일이 있어 손으로 지운다(작업 폴더는 ASCII 지만 같은 방식으로)
function rmTree(p) {
  for (const n of readdirSync(p)) {
    const q = join(p, n);
    try { if (statSync(q).isDirectory()) rmTree(q); else unlinkSync(q); } catch { /* 잠김 */ }
  }
  try { rmdirSync(p); } catch { /* 잠김 */ }
}

mkdirSync(OUT, { recursive: true });
const server = await createServer({ root: ROOT, logLevel: 'error', server: { port: 5310, strictPort: false, hmr: false } });
await server.listen();
const BASE = server.resolvedUrls.local[0].replace(/\/$/, '');
const udd = mkdtempSync(join(WORK, 'e2-udd-'));
const port = 9300 + Math.floor(Math.random() * 500);
const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
  `--user-data-dir=${udd}`, `--remote-debugging-port=${port}`, '--hide-scrollbars', '--disable-extensions',
  `--window-size=${W},${H}`, '--disk-cache-size=0', 'about:blank',
], { stdio: 'ignore' });

let ws;
const pending = new Map();
const logs = [];
let seq = 0;
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++seq; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
function onPaused(p) {
  const rel = p.request.url.slice(PAGES.length).split('?')[0];
  const type = rel.endsWith('.png') ? 'image/png' : rel.endsWith('.webp') ? 'image/webp' : rel.endsWith('.json') ? 'application/json' : 'image/jpeg';
  const headers = [{ name: 'Content-Type', value: type }, { name: 'Access-Control-Allow-Origin', value: '*' }];
  let body;
  try { body = readFileSync(join(ASSETS, rel)).toString('base64'); } catch {
    logs.push(`404 ${rel}`);
    send('Fetch.fulfillRequest', { requestId: p.requestId, responseCode: 404, responseHeaders: headers, body: '' }); return;
  }
  send('Fetch.fulfillRequest', { requestId: p.requestId, responseCode: 200, responseHeaders: headers, body });
}
async function evaluate(expr) {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 600));
  return r.result.value;
}
async function shot(name) {
  const r = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(OUT, `${name}.png`), Buffer.from(r.data, 'base64'));
}

const R = "document.querySelector('[class^=ds-]')";
const IDLE = `(async()=>{const m=${R}.atlasMap;let n=0;for(let i=0;i<200&&n<3;i++){await new Promise(r=>setTimeout(r,50));n=m.view.moving?0:n+1;}await new Promise(r=>setTimeout(r,400));return m.view.k})()`;
// 화면에서 센 값(대조표의 「웹」 칸 보조): 범례 항목·기호·핀·흐름선·사이드바 그래프·사진·출처 줄
const STATS = `(()=>{const r=${R};const q=(s)=>r.querySelectorAll(s).length;const t=r.atlasTopic;
  return {k:r.atlasMap.view.k, proj:r.atlasMap.view.projection||null, group:t.group?.label||null,
    legendItems:q('.at-legends .at-legend-item'), symbols:q('.at-sym-shape'), insetSymbols:q('.at-inset-sym'), pins:q('.at-pin'), flows:q('.at-flow'),
    labels:r.atlasMap.stats.labelCount??null, labelNames:[...r.querySelectorAll('.at-label-group')].map(e=>e.textContent.split(' ').join('').trim()).filter(Boolean),
    charts:q('.at-topic .at-chart'), photos:q('.at-topic .at-photo-img'), quiz:q('.at-quiz'),
    credits:[...r.querySelectorAll('.at-credits-item')].map(e=>e.textContent),
    title:r.querySelector('.at-topic-title')?.textContent||null};})()`;

async function open(topic, proj) {
  await send('Page.navigate', { url: `${BASE}/sims/atlas-u2-asia/?topic=${topic}&proj=${proj}` });
  for (let i = 0; i < 150; i++) { await sleep(100); try { if (await evaluate(`!!${R}?.atlasTopic`)) break; } catch { /* 불러오는 중 */ } }
  for (let i = 0; i < 60; i++) { await sleep(100); if (await evaluate(`!!${R}.atlasRelief`)) break; }
  for (let i = 0; i < 60; i++) { await sleep(100); if (await evaluate(`!!${R}.atlasTint`)) break; } // 고도 색 분류 화상(E2 대조 반영)
  await waitNatural();
  await evaluate(IDLE); await sleep(600);
}
// 자연색 화상(지형 주제 기본 — 처음 켤 때 불러옴)
async function waitNatural() {
  for (let i = 0; i < 100; i++) { if (!(await evaluate(`${R}.atlasMap.options.natural && !${R}.atlasMap.naturalReady`))) break; await sleep(100); }
}
const scrollTop = () => evaluate(`${R}.querySelector('.ds-panel').scrollTop=0`);
const scrollTo = (sel, i = 0) => evaluate(`(()=>{const e=[...${R}.querySelectorAll(${JSON.stringify(sel)})][${i}]; if(!e) return false; e.scrollIntoView({block:'start'}); return true;})()`);
const manifest = [];
async function take(name, info) {
  await sleep(300);
  await shot(name);
  const stats = await evaluate(STATS);
  manifest.push({ name, ...info, stats });
  console.log(`  ${name}  k=${stats.k?.toFixed?.(2)}  범례 ${stats.legendItems} 기호 ${stats.symbols} 핀 ${stats.pins}`);
}

// 장면: 주제 × 묶음(지도 고르기) × 도법. robinson = 계획 기본, 둘째 도법 = 교과서 지도에 더 가까운 것(일반도·색칠하기는
// 람베르트 정적 방위라 같은 정적 도법인 이퀄어스, 교역은 교과서와 같은 밀러 태평양 중심)
async function scenes() {
  for (const t of topics) {
    for (const proj of ['robinson', ...(['general', 'coloring'].includes(t.id) ? ['equalEarth'] : [])]) {
      const tag = proj === 'robinson' ? '' : `-${proj}`;
      if (ONLY && !ONLY.some((p) => p.startsWith(t.id) || t.id.startsWith(p))) continue;
      await open(t.id, proj);
      const groups = await evaluate(`${R}.atlasTopic.groups.map(g=>({label:g.label, refs:g.refs.map(r=>r.ref)}))`);
      if (!groups.length) {
        const name = `${t.id}${tag}`;
        if (want(name)) { await scrollTop(); await take(name, { topic: t.id, proj, group: null, refs: [], kind: 'topic' }); }
        // 일반도: 바로가기(동아시아·동남아시아)마다
        for (const v of (t.views || []).slice(1)) {
          const vn = `${t.id}${tag}-${v.id}`;
          if (!want(vn)) continue;
          await evaluate(`${R}.atlasMap.fitBounds(${JSON.stringify(v.bounds)})`); await evaluate(IDLE); await sleep(400);
          await take(vn, { topic: t.id, proj, group: null, view: v.id, map: v.map, refs: [], kind: 'view' });
        }
      }
      for (const [i, g] of groups.entries()) {
        const name = `${t.id}${tag}-g${i}`;
        if (!want(name)) continue;
        await evaluate(`${R}.atlasTopic.showGroup(${i})`); await evaluate(IDLE); await sleep(500); await scrollTop();
        await take(name, { topic: t.id, proj, group: g.label, groupIndex: i, refs: g.refs, kind: 'group' });
      }
      if (proj !== 'robinson') continue;
      // 덧붙임 장면
      // 바탕 색 바꾸기(E2 대조 반영 — 일반도 = 고도 색, 지형 = 자연색이 기본): 같은 보기에서 다른 바탕
      if (t.id === 'general' && want('general-tint-off')) {
        await evaluate(`${R}.atlasMap.setOptions({tint:false, natural:false})`); await evaluate(IDLE); await sleep(400); await scrollTop();
        await take('general-tint-off', { topic: t.id, proj, kind: 'extra', note: '바탕 색 없음(같은 보기)' });
        await evaluate(`${R}.atlasMap.setOptions({tint:true, natural:false})`); await evaluate(IDLE);
      }
      if (t.id === 'relief') {
        for (const [mode, note] of [['tint', '고도 색(같은 보기)'], ['none', '바탕 색 없음(같은 보기)']]) {
          if (!want(`relief-base-${mode}`)) continue;
          await evaluate(`${R}.atlasMap.setOptions({tint:${mode === 'tint'}, natural:false})`); await evaluate(IDLE); await sleep(400); await scrollTop();
          await take(`relief-base-${mode}`, { topic: t.id, proj, kind: 'extra', note });
        }
        await evaluate(`${R}.atlasMap.setOptions({tint:false, natural:true})`); await evaluate(IDLE);
        // 활동하기 1: 핀 번호 숨김 → 하나 누름 → 모두 보기
        if (want('relief-pins')) {
          await scrollTo('.at-reveal-btn'); await take('relief-pins-hidden', { topic: t.id, proj, kind: 'extra', note: '핀 번호 숨김(처음)' });
          await evaluate(`${R}.atlasTopic.pins.reveal(${R}.atlasTopic.pins.markers[1].id)`); await sleep(300);
          await take('relief-pins-one', { topic: t.id, proj, kind: 'extra', note: '핀 하나 번호 보임' });
          await evaluate(`${R}.querySelector('.at-reveal-btn').click()`); await sleep(300);
          await take('relief-pins-all', { topic: t.id, proj, kind: 'extra', note: '번호 모두 보기' });
          await evaluate(`${R}.querySelector('.at-reveal-btn').click()`); await sleep(200);
        }
      }
      if (t.id === 'religion' && want('religion-inset-hover')) {
        const gi = groups.findIndex((g) => g.refs.includes('layer-p22-singapore'));
        await evaluate(`${R}.atlasTopic.showGroup(${gi})`); await evaluate(IDLE); await sleep(500);
        const c = await evaluate(`(()=>{const e=${R}.querySelectorAll('.at-inset-sym')[10]?.getBoundingClientRect(); return e?[e.x+e.width/2, e.y+e.height/2]:null;})()`);
        if (c) await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: c[0], y: c[1], button: 'none', buttons: 0 });
        await take('religion-inset-hover', { topic: t.id, proj, group: groups[gi].label, groupIndex: gi, refs: groups[gi].refs, kind: 'extra', note: '싱가포르 확대 창 — 기호 말풍선' });
        await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 5, y: 5, button: 'none', buttons: 0 });
      }
      if (t.id === 'industry') {
        if (want('industry-barpick')) {
          await evaluate(`${R}.atlasTopic.showGroup(0)`); await evaluate(IDLE);
          await scrollTo('.at-barpick'); await sleep(300);
          await take('industry-barpick', { topic: t.id, proj, kind: 'extra', chart: 'p24-resources', note: '100% 막대 하나씩 보기(자원)' });
          await scrollTo('.at-barpick', 1); await sleep(300);
          await take('industry-barpick-2', { topic: t.id, proj, kind: 'extra', chart: 'p24-exports', note: '100% 막대 하나씩 보기(수출)' });
          await evaluate(`[...${R}.querySelectorAll('.at-barpick')][0].querySelector('.at-expand').click()`); await sleep(700);
          await take('industry-barpick-expand', { topic: t.id, proj, kind: 'extra', chart: 'p24-resources', note: '크게 보기(자원 다섯 막대)' });
          await evaluate(`${R}.atlasUi.viewer.hide()`);
        }
      }
      if (t.id === 'population' && want('population-charts')) {
        await scrollTo('.at-chart[data-chart=p23-world-pop]'); await sleep(400);
        await take('population-charts', { topic: t.id, proj, kind: 'extra', chart: 'p23-world-pop', note: '사이드바 그래프(세계 인구)' });
      }
      if (t.id === 'climate' && want('climate-charts')) {
        await scrollTo('.at-chart'); await sleep(400);
        await take('climate-charts', { topic: t.id, proj, kind: 'extra', note: '사이드바 기후 그래프' });
      }
      if (t.id === 'heritage' && want('heritage-quiz')) {
        await scrollTo('.at-quiz'); await sleep(800);
        await take('heritage-quiz', { topic: t.id, proj, kind: 'extra', note: '세계유산 퀴즈(첫 문제)' });
        await evaluate(`${R}.querySelector('.at-quiz-opt')?.click()`); await sleep(500);
        await take('heritage-quiz-answer', { topic: t.id, proj, kind: 'extra', note: '세계유산 퀴즈(답한 뒤)' });
      }
      if (t.id === 'coloring' && want('coloring-quiz')) {
        await scrollTo('.at-quiz'); await sleep(400);
        await take('coloring-quiz', { topic: t.id, proj, kind: 'extra', note: '색칠하기 활동' });
      }
    }
    // 고도 색: 구드(단속)·밀러 동아시아에서 켬/끔
    if (t.id === 'general') {
      for (const proj of ['goode', 'miller']) {
        if (!want(`general-${proj}-tint`)) continue;
        await open('general', proj);
        if (proj === 'miller') { await evaluate(`${R}.atlasMap.fitBounds(${JSON.stringify(t.views.find((v) => v.id === 'east-asia').bounds)})`); await evaluate(IDLE); await sleep(400); }
        await take(`general-${proj}-tint`, { topic: 'general', proj, kind: 'extra', note: `고도 색 켬(${proj})` });
        await evaluate(`${R}.atlasMap.setOptions({tint:false})`); await evaluate(IDLE); await sleep(400);
        await take(`general-${proj}-tint-off`, { topic: 'general', proj, kind: 'extra', note: `고도 색 끔(${proj})` });
      }
    }
    // 교역: 교과서와 같은 밀러(태평양 중심은 묶음이 스스로 맞춤)
    if (t.id === 'industry' && want('industry-miller-trade')) {
      await open('industry', 'miller');
      const gi = await evaluate(`${R}.atlasTopic.groups.findIndex(g=>g.refs.some(r=>r.ref==='layer-p24-trade'))`);
      await evaluate(`${R}.atlasTopic.showGroup(${gi})`); await evaluate(IDLE); await sleep(500); await scrollTop();
      await take('industry-miller-trade', { topic: 'industry', proj: 'miller', groupIndex: gi, refs: ['layer-p24-trade'], kind: 'group', note: '교과서와 같은 밀러 태평양 중심' });
    }
  }
}

try {
  let targets;
  for (let i = 0; i < 100; i++) {
    try { targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); if (targets.some((t) => t.type === 'page')) break; } catch { /* 켜는 중 */ }
    await sleep(100);
  }
  ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r));
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { const { res, rej } = pending.get(m.id); pending.delete(m.id); m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); }
    if (m.method === 'Fetch.requestPaused') onPaused(m.params);
    if (m.method === 'Runtime.exceptionThrown') logs.push('EXC ' + JSON.stringify(m.params.exceptionDetails).slice(0, 400));
    if (m.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(m.params.type)) logs.push(`${m.params.type} ` + m.params.args.map((a) => a.value ?? a.description).join(' '));
  });
  await send('Fetch.enable', { patterns: [{ urlPattern: PAGES + '*', requestStage: 'Request' }] });
  await send('Page.enable'); await send('Runtime.enable'); await send('Network.setCacheDisabled', { cacheDisabled: true });
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  await scenes();
  // --only 로 일부만 다시 찍으면 이전 manifest 의 나머지 장면은 그대로 둔다
  let old = [];
  try { old = JSON.parse(readFileSync(join(OUT, 'manifest.json'), 'utf8')).shots || []; } catch { /* 처음 */ }
  const names = new Set(manifest.map((m) => m.name));
  const merged = ONLY ? [...old.filter((m) => !names.has(m.name)), ...manifest] : manifest;
  writeFileSync(join(OUT, 'manifest.json'), JSON.stringify({ size: [W, H], base: '/sims/atlas-u2-asia/?topic=&proj=', at: new Date().toISOString(), shots: merged }, null, 1));
  console.log(`캡처 ${manifest.length}장 → ${OUT}`);
} catch (e) {
  console.error('캡처 실패', e); process.exitCode = 1;
} finally {
  if (logs.length) console.log('--- 페이지 콘솔 ---\n' + logs.slice(0, 40).join('\n'));
  try { ws?.close(); } catch { /* 닫힘 */ }
  chrome.kill();
  await server.close();
  await sleep(800);
  rmTree(udd);
}
