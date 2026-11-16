// 공급망 끊기 모형 시험: node --test tests/s1-u1-supply-chain/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PARTS, EVENTS, STRATEGIES, WEEKS, DEMAND, CAPACITY,
  createState, step, applyEvent, isStopped, stopLeft, factoryStatus, summarize, simulate,
} from '../../sims/s1-u1-supply-chain/model.js';

const run = (s, n) => { for (let i = 0; i < n; i++) step(s); return s; };

test('교과서 부품 10개와 생산지', () => {
  const m = Object.fromEntries(PARTS.map((p) => [p.name, p.country]));
  assert.deepEqual(m, {
    유리: '프랑스', 에어컨: '일본', 에어백: '이탈리아', 오디오: '독일', 운전대: '미국',
    '전선 묶음': '중국', 범퍼: '중국', 타이어: '대한민국', '사이드 미러': '프랑스', 반도체: '미국',
  });
  for (const e of EVENTS) assert.equal(PARTS.find((p) => p.id === e.part).iso, e.iso, `${e.id} 나라와 부품 생산지가 같아야 함`);
});

test('사건이 없으면 매주 주문만큼 만들고 재고는 그대로', () => {
  const s = run(createState(), WEEKS);
  assert.equal(s.history.length, WEEKS);
  for (const r of s.history) { assert.equal(r.produced, DEMAND); assert.equal(r.backlog, 0); }
  for (const p of PARTS) assert.equal(s.stock[p.id], 2 * DEMAND);
  assert.equal(step(s), null, '기간이 끝나면 더 진행하지 않음');
});

test('반도체 6주 멈춤: 재고 2주치로 버티다 공장이 멈추고, 부품이 다시 오기까지 한 주 더', () => {
  const s = createState();
  assert.equal(applyEvent(s, 'texas'), true);
  assert.equal(applyEvent(s, 'texas'), false, '같은 사건은 한 번만');
  assert.equal(isStopped(s, 'chip', 1), true);
  assert.equal(isStopped(s, 'chip', 7), false);
  assert.equal(stopLeft(s, 'chip'), 6);
  run(s, 7);
  const prod = s.history.map((r) => r.produced);
  assert.deepEqual(prod, [100, 100, 0, 0, 0, 0, 0]);
  assert.equal(factoryStatus(s.history[2]), 'stop');
  assert.equal(factoryStatus(s.history[0]), 'run');
  assert.equal(s.stock.chip, 150, '공급이 다시 되면 한 주 최대치가 도착');
  assert.equal(s.stock.tire, 200, '공장이 멈추면 다른 부품은 쓰이지 않아 그대로');
  assert.equal(s.backlog, 500);
  // 다시 돌기 시작하면 잔업으로 밀린 주문을 줄인다
  const r8 = step(s);
  assert.equal(r8.produced, CAPACITY);
  assert.equal(r8.backlog, 450);
  assert.equal(r8.wait, 4.5);
});

test('주 중간에 사건을 일으키면 다음 주부터 멈춘다', () => {
  const s = run(createState(), 3);
  applyEvent(s, 'gas');
  assert.deepEqual(s.stops[0], { event: 'gas', part: 'glass', from: 4, to: 6 });
  assert.deepEqual(s.applied, [{ event: 'gas', at: 3 }]);
  run(s, 4);
  assert.deepEqual(s.history.slice(3).map((r) => r.produced), [100, 100, 0, 0]);
});

test('부품 하나만 모자라도 가장 적은 부품만큼만 만든다', () => {
  const s = createState();
  s.stock.wire = 40;
  const r = step(s);
  assert.equal(r.produced, 40);
  assert.equal(factoryStatus(r), 'slow');
  assert.equal(s.backlog, 60);
});

test('공급처 늘리기: 반도체 사건에도 공장이 멈추지 않는다', () => {
  const sched = [{ event: 'texas', at: 2 }];
  const none = summarize(simulate('none', sched));
  const multi = summarize(simulate('multi', sched));
  assert.equal(none.stoppedWeeks, 5);
  assert.equal(multi.stoppedWeeks, 0);
  assert.ok(multi.maxWait < 1, "잠깐 덜 만들 뿐");
  assert.ok(multi.cost > none.cost);
});

test('재고 쌓아 두기: 멈춤이 짧아지고 창고비가 든다', () => {
  const sched = [{ event: 'texas', at: 0 }];
  const none = summarize(simulate('none', sched));
  const stock = summarize(simulate('stock', sched));
  assert.equal(stock.stoppedWeeks, 2);
  assert.ok(stock.stoppedWeeks < none.stoppedWeeks);
  assert.ok(stock.maxWait < none.maxWait);
  assert.equal(stock.cost, STRATEGIES.stock.cost);
  // 짧은 사건(유리 3주)은 재고만으로 버틴다
  assert.equal(summarize(simulate('stock', [{ event: 'gas', at: 0 }])).stoppedWeeks, 0);
});

test('다시 해 보기: 기록한 주에 같은 사건이 자동으로 일어나고, 대화형 진행과 결과가 같다', () => {
  const live = createState();
  run(live, 2); applyEvent(live, 'texas');
  run(live, 3); applyEvent(live, 'lockdown');
  run(live, WEEKS);
  const replay = simulate('none', live.applied);
  assert.deepEqual(replay.applied, live.applied);
  assert.deepEqual(replay.history.map((r) => r.produced), live.history.map((r) => r.produced));
});

test('세 사건을 함께: 대비 없음이 가장 오래 멈추고, 밀린 주문은 기간 안에 줄어든다', () => {
  const sched = EVENTS.map((e) => ({ event: e.id, at: 1 }));
  const r = Object.fromEntries(Object.keys(STRATEGIES).map((k) => [k, summarize(simulate(k, sched))]));
  assert.ok(r.none.stoppedWeeks > r.stock.stoppedWeeks);
  assert.ok(r.none.stoppedWeeks > r.multi.stoppedWeeks);
  assert.ok(r.none.backlogEnd < r.none.maxWait * DEMAND, '잔업으로 밀린 주문이 줄어듦');
});
