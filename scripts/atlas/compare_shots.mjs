// © 2026 김용현
// scripts/atlas/compare_shots.mjs — 교과서 대조표용 캡처: 개발 서버(vite, 이 스크립트 안에서 띄움) + 헤드리스 Chrome(CDP, 의존성 없음)
//   node scripts/atlas/compare_shots.mjs [--unit uN] [--only <장면 이름 앞부분,…>]
//   단원: --unit(또는 env ATLAS_UNIT, 기본 u2 — scripts/atlas/unit.mjs). 대조표 설정 = 단원 설정 옆 <uN>.compare.json(없으면 기본값만).
//   출력: 단원 작업 폴더의 <shotsDir>/<장면>.png (1440×900) + manifest.json(장면 → 주제·묶음·도법·화면에서 센 값)
//         shotsDir 기본 shots/compare(u2 는 설정대로 1단계 자리 $ATLAS_WORK/shots/e2)
//   - 장면 = 주제마다 기본 도법(설정 projections.default, 기본 robinson) + extra 도법: ?topic=<id>&proj=<도법>(mountAtlas 의 개발 서버
//     전용 매개변수)으로 새로 열고, 묶음(지도 고르기)마다 showGroup(i)로 한 장(묶음이 없으면 주제 한 장 + 바로가기마다 한 장)
//     + 설정 extraScenes(주제별 덧붙임 장면 — 단계 목록 eval·idle·sleep·scrollTop·scrollTo·showGroup·fitView·hover·mouse·take).
//   - 사진·원본 쪽·음영은 공개 Pages 주소라 Fetch 가로채기로 docs/assets 파일을 대답한다(아직 안 올린 이미지도 보임).
//   - Chrome 은 --disable-gpu + 새 user-data-dir, 끝나면 Chrome·vite 를 모두 끈다(한 번에 하나씩만 띄움).
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, statSync, unlinkSync, rmdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createServer } from 'vite';
import { resolveUnit, stripUnitArgs } from './unit.mjs';

const ROOT = resolve(import.meta.dirname, '..', '..');
const WORK = process.env.ATLAS_WORK || 'C:/Users/Public/atlas-work';
const UNIT = resolveUnit();
const CMP_FILE = UNIT.configPath.replace(/\.json$/, '.compare.json');
const CMP = existsSync(CMP_FILE) ? JSON.parse(readFileSync(CMP_FILE, 'utf8')) : {};
const OUT = UNIT.workFile(CMP.shotsDir || 'shots/compare');
const PROJ = { default: 'robinson', extra: {}, ...CMP.projections };
const EXTRA = CMP.extraScenes || {};
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PAGES = 'https://yhk1m.github.io/donga-social-sims/assets/';
const ASSETS = join(ROOT, 'docs', 'assets');
const W = 1440, H = 900;
const ARGV = stripUnitArgs(process.argv.slice(2)).rest;
const onlyArg = ARGV.indexOf('--only');
const ONLY = onlyArg >= 0 ? ARGV[onlyArg + 1].split(',') : null;
const want = (name) => !ONLY || ONLY.some((p) => name.startsWith(p));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const topics = JSON.parse(readFileSync(join(UNIT.dataDir, 'topics.json'), 'utf8'));

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
  await send('Page.navigate', { url: `${BASE}/sims/${UNIT.sim}/?topic=${topic}&proj=${proj}` });
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

// 장면: 주제 × 도법(기본 + 설정 extra) × 묶음(지도 고르기 — 없으면 주제 한 장 + 바로가기마다) + 설정 extraScenes.
// u2: 기본 robinson, 둘째 도법 = 교과서 지도에 더 가까운 것(일반도·색칠하기는 람베르트 정적 방위라 같은 정적 도법인 이퀄어스,
// 교역은 교과서와 같은 밀러 태평양 중심 — extraScenes). 1단계 코드의 장면 함수를 u2.compare.json 자료로 옮겼다(G3, 차례·기다림 그대로).
const fill = (expr) => expr.split('{R}').join(R);
/** 덧붙임 장면 하나(설정 단계 목록)를 지금 쪽에서 돌린다. ctx = {topic(주제 객체), proj}. eval 은 이 캡처 도구 안에서만(CDP Runtime.evaluate). */
async function runScene(scene, ctx) {
  let grp = null; // 마지막 showGroup 의 묶음 {label, refs, index}
  const val = (v) => (v === '@groupLabel' ? grp?.label : v === '@groupIndex' ? grp?.index : v === '@groupRefs' ? grp?.refs : v);
  for (const st of scene.steps) {
    if (st.eval) await evaluate(fill(st.eval));
    else if (st.idle) await evaluate(IDLE);
    else if (st.sleep) await sleep(st.sleep);
    else if (st.scrollTop) await scrollTop();
    else if (st.scrollTo) await scrollTo(st.scrollTo.sel, st.scrollTo.index ?? 0);
    else if (st.showGroup != null) {
      const gs = await evaluate(`${R}.atlasTopic.groups.map(g=>({label:g.label, refs:g.refs.map(r=>r.ref)}))`);
      const i = typeof st.showGroup === 'number' ? st.showGroup : gs.findIndex((g) => g.refs.includes(st.showGroup.ref));
      if (i < 0 || !gs[i]) throw new Error(`${scene.name}: 묶음 없음 ${JSON.stringify(st.showGroup)}`);
      grp = { ...gs[i], index: i };
      await evaluate(`${R}.atlasTopic.showGroup(${i})`);
    } else if (st.fitView) {
      const v = (ctx.topic.views || []).find((x) => x.id === st.fitView);
      if (!v) throw new Error(`${scene.name}: 바로가기 없음 ${st.fitView}`);
      await evaluate(`${R}.atlasMap.fitBounds(${JSON.stringify(v.bounds)})`);
    } else if (st.hover) {
      const c = await evaluate(`(()=>{const e=${R}.querySelectorAll(${JSON.stringify(st.hover.sel)})[${st.hover.index ?? 0}]?.getBoundingClientRect(); return e?[e.x+e.width/2, e.y+e.height/2]:null;})()`);
      if (c) await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: c[0], y: c[1], button: 'none', buttons: 0 });
    } else if (st.mouse) await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: st.mouse[0], y: st.mouse[1], button: 'none', buttons: 0 });
    else if (st.take) {
      const info = { topic: ctx.topic.id, proj: ctx.proj };
      for (const [k, v] of Object.entries(st.info || {})) info[k] = val(v);
      await take(st.take, info);
    } else throw new Error(`${scene.name}: 모르는 단계 ${JSON.stringify(st)}`);
  }
}

async function scenes() {
  for (const t of topics) {
    const extras = EXTRA[t.id] || [];
    for (const proj of [PROJ.default, ...(PROJ.extra[t.id] || [])]) {
      const tag = proj === PROJ.default ? '' : `-${proj}`;
      if (ONLY && !ONLY.some((p) => p.startsWith(t.id) || t.id.startsWith(p))) continue;
      await open(t.id, proj);
      const groups = await evaluate(`${R}.atlasTopic.groups.map(g=>({label:g.label, refs:g.refs.map(r=>r.ref)}))`);
      if (!groups.length) {
        const name = `${t.id}${tag}`;
        if (want(name)) { await scrollTop(); await take(name, { topic: t.id, proj, group: null, refs: [], kind: 'topic' }); }
        // 바로가기(일반도: 동아시아·동남아시아)마다
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
      if (proj !== PROJ.default) continue;
      // 덧붙임 장면(같은 쪽에서 이어서) — name 이 null 이면 늘 돈다(바탕 되돌리기 같은 상태 정리)
      for (const sc of extras.filter((x) => !x.open)) if (sc.name == null || want(sc.name)) await runScene(sc, { topic: t, proj });
    }
    // 덧붙임 장면(주제 장면을 다 찍은 뒤 다른 도법으로 새로 엶)
    for (const sc of extras.filter((x) => x.open)) {
      if (sc.name != null && !want(sc.name)) continue;
      await open(t.id, sc.open.proj);
      await runScene(sc, { topic: t, proj: sc.open.proj });
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
  writeFileSync(join(OUT, 'manifest.json'), JSON.stringify({ size: [W, H], base: `/sims/${UNIT.sim}/?topic=&proj=`, at: new Date().toISOString(), shots: merged }, null, 1));
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
