// scripts/atlas/cdp.mjs — 헤드리스 Chrome 하나를 띄워 CDP(WebSocket, 의존성 없음)로 다루는 작은 도우미.
//   const c = await launchChrome({ width, height });  await c.navigate(url);  await c.evaluate('1+1');  await c.screenshot({...});  await c.close();
//   이 PC 규칙: GPU 헤드리스 금지(블루스크린) → --disable-gpu + swiftshader, 매번 새 user-data-dir, 디스크 캐시 0.
//   user-data-dir 은 ASCII 경로(ATLAS_WORK, 기본 C:/Users/Public/atlas-work)에 만들고 끝나면 손으로 지운다(한글 경로 재귀 rmSync 크래시 회피).
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, readdirSync, rmdirSync, statSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const WORK = process.env.ATLAS_WORK || 'C:/Users/Public/atlas-work';
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function rmTree(p) {
  for (const n of readdirSync(p)) {
    const q = join(p, n);
    try { if (statSync(q).isDirectory()) rmTree(q); else unlinkSync(q); } catch { /* 잠김 */ }
  }
  try { rmdirSync(p); } catch { /* 잠김 */ }
}

export async function launchChrome({ width = 1440, height = 900 } = {}) {
  mkdirSync(WORK, { recursive: true });
  const udd = mkdtempSync(join(WORK, 'cdp-udd-'));
  const port = 9300 + Math.floor(Math.random() * 600);
  const proc = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    `--user-data-dir=${udd}`, `--remote-debugging-port=${port}`, '--hide-scrollbars', '--disable-extensions',
    `--window-size=${width},${height}`, '--disk-cache-size=0', 'about:blank',
  ], { stdio: 'ignore' });
  let targets;
  for (let i = 0; i < 150; i++) {
    try { targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); if (targets.some((t) => t.type === 'page')) break; } catch { /* 켜는 중 */ }
    await sleep(100);
  }
  const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r));
  const pending = new Map();
  const listeners = new Map();
  const errors = [];
  let seq = 0;
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const { res, rej } = pending.get(m.id); pending.delete(m.id);
      if (m.error) rej(new Error(`${m.error.message}`)); else res(m.result);
    } else if (m.method) for (const fn of listeners.get(m.method) || []) fn(m.params);
  });
  const send = (method, params = {}) => new Promise((res, rej) => { const i = ++seq; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
  const on = (method, fn) => { if (!listeners.has(method)) listeners.set(method, []); listeners.get(method).push(fn); };
  // 콘솔 오류·잡히지 않은 예외 모으기(확인용)
  on('Runtime.exceptionThrown', (p) => errors.push(`exception: ${p.exceptionDetails?.exception?.description || p.exceptionDetails?.text}`));
  on('Runtime.consoleAPICalled', (p) => { if (p.type === 'error') errors.push(`console.error: ${p.args.map((a) => a.value ?? a.description).join(' ')}`); });
  on('Log.entryAdded', (p) => { if (p.entry.level === 'error') errors.push(`log: ${p.entry.text} ${p.entry.url || ''}`); });
  await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable');
  await send('Network.enable'); await send('Network.setCacheDisabled', { cacheDisabled: true });
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });

  async function evaluate(expr) {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 600));
    return r.result.value;
  }
  async function navigate(url) {
    const loaded = new Promise((r) => on('Page.loadEventFired', r));
    await send('Page.navigate', { url });
    await Promise.race([loaded, sleep(20000)]);
  }
  async function resize(w, h) { await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false }); }
  /** {format:'png'|'jpeg'|'webp', quality, clip:{x,y,width,height,scale}} → Buffer */
  async function screenshot(opts = {}) {
    const r = await send('Page.captureScreenshot', { format: 'png', ...opts });
    return Buffer.from(r.data, 'base64');
  }
  async function close() {
    try { ws.close(); } catch { /* 이미 닫힘 */ }
    proc.kill();
    await sleep(800);
    rmTree(udd);
  }
  return { send, on, evaluate, navigate, resize, screenshot, close, errors };
}
