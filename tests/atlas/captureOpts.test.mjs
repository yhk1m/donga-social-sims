// © 2026 김용현
// tests/atlas/captureOpts.test.mjs — 대조표 캡처 단원별 옵션(scripts/atlas/capture_opts.mjs, U1-G0)
//   u6 캡처가 Chrome 의 non-scaling-stroke 경로 캐시(이력 의존) 때문에 실행마다 몇 화소 달라지던 것 → u6 만 찍기 전 다시 계산.
//   u2~u5 는 옵션이 없어야 함(그 기준선은 옵션 없이 찍었음 — 켜면 기준선을 다시 찍어야 함).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { captureOptsOf, freshSvgLayoutExpr } from '../../scripts/atlas/capture_opts.mjs';

const ROOT = resolve(import.meta.dirname, '..', '..');
const cmpOf = (id) => {
  const f = join(ROOT, 'scripts/atlas/config', `${id}.compare.json`);
  return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : {};
};

test('captureOptsOf: 없으면 false, true/false 만', () => {
  assert.deepEqual(captureOptsOf({}), { freshSvgLayout: false });
  assert.deepEqual(captureOptsOf(undefined), { freshSvgLayout: false });
  assert.deepEqual(captureOptsOf({ freshSvgLayout: true }), { freshSvgLayout: true });
  assert.deepEqual(captureOptsOf({ freshSvgLayout: false }), { freshSvgLayout: false });
  for (const v of ['true', 1, [], {}]) assert.throws(() => captureOptsOf({ freshSvgLayout: v }), /true\/false/);
});

test('freshSvgLayoutExpr: 루트 식을 넣은 비동기 식(none 으로 껐다 원래 값으로)', () => {
  const e = freshSvgLayoutExpr('document.querySelector(".r")');
  assert.match(e, /^\(async\(\)=>/);
  assert.ok(e.includes('document.querySelector(".r").querySelectorAll(\'svg [vector-effect]\')'));
  assert.ok(e.includes("setAttribute('vector-effect','none')") && e.includes("setAttribute('vector-effect',v)"));
  assert.doesNotThrow(() => new Function(`return ${e}`)); // 문법만(실행은 캡처 도구 안 Chrome 에서)
});

test('freshSvgLayoutExpr: 가짜 DOM 에서 값을 되돌리고 none 인 요소는 건드리지 않음', async () => {
  const log = [];
  const el = (v) => ({ v, getAttribute: () => v, setAttribute(k, x) { log.push([this.id, x]); this.v = x; } });
  const a = Object.assign(el('non-scaling-stroke'), { id: 'a' }), b = Object.assign(el('none'), { id: 'b' });
  const root = { querySelectorAll: () => [a, b], getBoundingClientRect: () => ({}) };
  globalThis.requestAnimationFrame = (f) => setTimeout(f, 0);
  const n = await new Function('root', `return ${freshSvgLayoutExpr('root')}`)(root);
  delete globalThis.requestAnimationFrame;
  assert.equal(n, 1);
  assert.deepEqual(log, [['a', 'none'], ['a', 'non-scaling-stroke']]);
  assert.equal(a.v, 'non-scaling-stroke'); assert.equal(b.v, 'none');
});

test('u6 만 freshSvgLayout, u2~u5 는 없음(기준선 그대로)', () => {
  assert.equal(captureOptsOf(cmpOf('u6')).freshSvgLayout, true);
  for (const id of ['u2', 'u3', 'u4', 'u5']) assert.equal(captureOptsOf(cmpOf(id)).freshSvgLayout, false, id);
});
