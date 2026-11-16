// 확인용 화면 캡처: 개발 서버(npx vite --port 5185)를 켠 뒤
//   node scripts/s1-u1-supply-chain/shots.mjs <출력 폴더>
// 장면: normal(평소), chip(반도체 사건 뒤 공장 멈춤), compare(대비 비교 표), drag(카드 끌어 놓기 실제 조작)
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { launchChrome, sleep } from '../atlas/cdp.mjs';

const out = process.argv[2] || '.';
const base = 'http://localhost:5185/sims/s1-u1-supply-chain/index.html';
const c = await launchChrome({ width: 1280, height: 800 });
try {
  for (const scene of ['normal', 'chip', 'compare']) {
    await c.navigate(`${base}?scene=${scene}`);
    await sleep(1500);
    writeFileSync(join(out, `supply-${scene}.png`), await c.screenshot());
  }
  // 실제 조작: 처음 화면에서 미국 카드를 미국 땅 위로 끌어다 놓고, 몇 주 재생
  await c.navigate(base);
  await sleep(1200);
  const pos = await c.evaluate(`(() => {
    const r = document.getElementById('root');
    const card = r.querySelectorAll('.sc-card')[0].getBoundingClientRect();
    const svg = r.querySelector('.sc-svg'); const m = svg.getScreenCTM();
    return { cx: card.x + 40, cy: card.y + 20, m: [m.a, m.d, m.e, m.f] };
  })()`);
  // 텍사스 근처 화면 좌표: 미국 땅(경도 -100, 위도 38)을 페이지에서 계산
  const target = await c.evaluate(`(() => { const p = document.getElementById('root').querySelectorAll('.sc-mk')[9].getBoundingClientRect(); return { x: p.x + 30, y: p.y - 40 }; })()`);
  const mouse = (type, x, y) => c.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1, pointerType: 'mouse' });
  await mouse('mousePressed', pos.cx, pos.cy);
  for (let i = 1; i <= 12; i++) await mouse('mouseMoved', pos.cx + (target.x - pos.cx) * i / 12, pos.cy + (target.y - pos.cy) * i / 12);
  writeFileSync(join(out, 'supply-dragging.png'), await c.screenshot());
  await mouse('mouseReleased', target.x, target.y);
  await sleep(300);
  const applied = await c.evaluate(`document.getElementById('root').querySelectorAll('.sc-card')[0].className`);
  console.log('카드 상태 after drop:', applied);
  writeFileSync(join(out, 'supply-dropped.png'), await c.screenshot());
  console.log('오류:', c.errors.length ? c.errors : 0);
} finally { await c.close(); }

// 조작 흐름 점검: 재생 → 카드 누르기 → 끝까지 → 대비 고르기 → 다시 해 보기 → 끝까지 → 비교 표
{
  const d = await launchChrome({ width: 1280, height: 800 });
  try {
    await d.navigate(base);
    await sleep(800);
    const q = (js) => d.evaluate(`(() => { const r = document.getElementById('root'); const btn = (t) => [...r.querySelectorAll('button')].find((b) => b.textContent.includes(t)); ${js} })()`);
    await q(`btn('재생').click()`);
    await sleep(2600);
    console.log('재생 2.6초 뒤:', await q(`return r.querySelector('.sc-hud-week').textContent`));
    await q(`btn('일시 정지').click(); r.querySelectorAll('.sc-card')[1].dispatchEvent(new PointerEvent('pointerdown', { button: 0, pointerId: 1, bubbles: true })); r.querySelectorAll('.sc-card')[1].dispatchEvent(new PointerEvent('pointerup', { button: 0, pointerId: 1, bubbles: true }));`);
    console.log('카드 누른 뒤:', await q(`return r.querySelectorAll('.sc-card')[1].querySelector('.sc-card-state').textContent`));
    await q(`btn('끝까지').click()`);
    console.log('1단계 끝:', await q(`return [r.querySelector('.sc-hud-week').textContent, r.querySelector('.sc-rec').textContent, r.querySelector('.sc-cmp').hidden]`));
    await q(`btn('재고 쌓아 두기').click(); btn('같은 사건으로').click()`);
    await sleep(500);
    console.log('다시 해 보기 중:', await q(`return [r.querySelector('.sc-hud-mode').textContent, r.querySelectorAll('.sc-card')[1].querySelector('.sc-card-state').textContent]`));
    await q(`btn('끝까지').click()`);
    console.log('비교 표:', await q(`return [r.querySelector('.sc-cmp').hidden, [...r.querySelectorAll('.sc-table tbody tr')].map((tr) => tr.textContent)]`));
    console.log('조작 오류:', d.errors.length ? d.errors : 0);
  } finally { await d.close(); }
}
