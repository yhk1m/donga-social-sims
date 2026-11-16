// © 2026 김용현
// 공급망 끊기 — 순수 계산부(DOM 없음, Node 시험 대상).
// 교과서: 동아출판 중등 사회1 14쪽 사회 탐탐 「내 자동차는 도대체 언제 출고되지?」
// 모든 수치는 설명을 위한 「모형 수치」다.
//
// 한 주의 순서 (중학생에게 그대로 설명할 수 있게 단순하게):
//   1) 만들기: 공장은 (주문 + 밀린 주문) 만큼 만들고 싶지만, 한 주 최대 CAPACITY 대,
//      그리고 「가장 적게 남은 부품」 수만큼만 만들 수 있다. 부품 하나라도 0 이면 공장이 멈춘다.
//   2) 출고 대기: 주문은 매주 DEMAND 대씩 들어온다. 못 만든 만큼 밀린 주문이 쌓인다.
//      출고 대기(주) = 밀린 주문 ÷ 한 주 주문.
//   3) 부품 도착: 공급처는 창고를 다시 채울 만큼 보낸다(한 주 최대 MAX_SEND 대분).
//      공급이 멈춘 주에는 오지 않는다. 그래서 공급이 다시 되어도 부품은 그다음 주에야 쓸 수 있다.

export const WEEKS = 24; // 한 번 해 보는 기간(주)
export const DEMAND = 100; // 한 주에 들어오는 주문(대)
export const CAPACITY = 150; // 공장이 한 주에 만들 수 있는 최대 대수(밀린 주문이 있을 때 잔업)
export const MAX_SEND = 150; // 공급처 한 곳이 한 주에 보낼 수 있는 최대 부품(대분)
export const BACKUP_SEND = 80; // 추가 공급처가 한 주에 보낼 수 있는 최대 부품(대분)

// 부품과 생산지: 교과서 그대로. lon/lat 은 지도에 점을 찍을 자리(나라 안 대략의 위치, 도시를 뜻하지 않음).
export const PARTS = [
  { id: 'glass', name: '유리', country: '프랑스', iso: '250', lon: 2.4, lat: 48.6 },
  { id: 'aircon', name: '에어컨', country: '일본', iso: '392', lon: 139.2, lat: 36.0 },
  { id: 'airbag', name: '에어백', country: '이탈리아', iso: '380', lon: 12.0, lat: 43.3 },
  { id: 'audio', name: '오디오', country: '독일', iso: '276', lon: 9.8, lat: 51.2 },
  { id: 'wheel', name: '운전대', country: '미국', iso: '840', lon: -84.5, lat: 41.5 },
  { id: 'wire', name: '전선 묶음', country: '중국', iso: '156', lon: 120.6, lat: 31.0 },
  { id: 'bumper', name: '범퍼', country: '중국', iso: '156', lon: 116.4, lat: 38.4 },
  { id: 'tire', name: '타이어', country: '대한민국', iso: '410', lon: 127.4, lat: 36.4 },
  { id: 'mirror', name: '사이드 미러', country: '프랑스', iso: '250', lon: 0.6, lat: 45.6 },
  { id: 'chip', name: '반도체', country: '미국', iso: '840', lon: -97.7, lat: 30.8 },
];
export const FACTORY = { name: '조립 공장', country: '대한민국', iso: '410', lon: 129.2, lat: 35.6 };

// 사건 카드: 교과서 말풍선 세 개. weeks = 그 부품 공급이 멈추는 주 수(모형 수치)
export const EVENTS = [
  { id: 'texas', part: 'chip', country: '미국', iso: '840', weeks: 6, title: '텍사스 한파와 정전',
    text: '기록적인 한파와 폭설로 전기가 모자라 정전이 일어났어요. 반도체 공장이 멈췄어요.' },
  { id: 'lockdown', part: 'wire', country: '중국', iso: '156', weeks: 4, title: '도시 봉쇄',
    text: '감염병이 퍼지는 것을 막으려고 도시를 봉쇄했어요. 전선 묶음을 보낼 수 없었어요.' },
  { id: 'gas', part: 'glass', country: '프랑스', iso: '250', weeks: 3, title: '전쟁으로 천연가스 부족',
    text: '러시아와 우크라이나의 전쟁으로 유리를 만드는 데 필요한 천연가스가 모자랐어요.' },
];

// 대비 방법. stockWeeks = 창고에 두는 재고(몇 주 만들 수 있는 양), cost = 평소 한 주 비용 지수(대비 없음 = 100)
export const STRATEGIES = {
  none: { id: 'none', name: '대비 없음', stockWeeks: 2, cost: 100, backups: {} },
  multi: {
    id: 'multi', name: '공급처 늘리기', stockWeeks: 2, cost: 105,
    // 공급난을 겪은 세 부품을 다른 나라에서도 받는다
    backups: {
      chip: { country: '대만', iso: '158', lon: 121.0, lat: 23.8 },
      wire: { country: '베트남', iso: '704', lon: 105.8, lat: 20.6 },
      glass: { country: '인도', iso: '356', lon: 77.5, lat: 23.0 },
    },
  },
  stock: { id: 'stock', name: '재고 쌓아 두기', stockWeeks: 5, cost: 110, backups: {} },
};

const partIds = PARTS.map((p) => p.id);
export const eventById = (id) => EVENTS.find((e) => e.id === id);

/** 새 상태. schedule = [{ event, at }] 은 다시 해 보기에서 at 주가 끝난 뒤 자동으로 일으킬 사건 */
export function createState(strategyId = 'none', schedule = []) {
  const st = STRATEGIES[strategyId];
  if (!st) throw new Error(`대비 방법 없음: ${strategyId}`);
  const target = st.stockWeeks * DEMAND;
  return {
    strategy: strategyId,
    target,
    week: 0,
    stock: Object.fromEntries(partIds.map((id) => [id, target])),
    backlog: 0,
    stops: [], // { event, part, from, to } : from~to 주(둘 다 포함) 동안 그 부품 공급이 멈춤
    applied: [], // { event, at } 일으킨 사건 기록
    schedule: schedule.map((x) => ({ ...x })),
    history: [], // 주마다 { week, produced, backlog, wait, arrived }
  };
}

/** w 주에 그 부품의 (원래) 공급처가 멈췄는지 */
export function isStopped(state, part, w = state.week + 1) {
  return state.stops.some((s) => s.part === part && w >= s.from && w <= s.to);
}

/** 멈춤이 남은 주 수(다음 주부터 셈). 멈추지 않았으면 0 */
export function stopLeft(state, part) {
  const w = state.week + 1;
  let left = 0;
  for (const s of state.stops) if (s.part === part && s.to >= w) left = Math.max(left, s.to - Math.max(w, s.from) + 1);
  return left;
}

/** 사건 일으키기: 지금 주가 끝난 뒤(다음 주부터) n주 동안 공급이 멈춘다. 같은 사건은 한 번만. */
export function applyEvent(state, eventId) {
  const ev = eventById(eventId);
  if (!ev) throw new Error(`사건 없음: ${eventId}`);
  if (state.applied.some((a) => a.event === eventId)) return false;
  if (state.week >= WEEKS) return false;
  const from = state.week + 1;
  state.stops.push({ event: eventId, part: ev.part, from, to: from + ev.weeks - 1 });
  state.applied.push({ event: eventId, at: state.week });
  return true;
}

/** 그 부품이 이번 주에 받을 수 있는 최대량 */
export function supplyCap(state, part, w) {
  const backup = STRATEGIES[state.strategy].backups[part];
  return (isStopped(state, part, w) ? 0 : MAX_SEND) + (backup ? BACKUP_SEND : 0);
}

/** 한 주 진행. 끝났으면 null */
export function step(state) {
  if (state.week >= WEEKS) return null;
  for (const x of state.schedule) if (x.at === state.week) applyEvent(state, x.event);
  const w = state.week + 1;
  const want = Math.min(CAPACITY, DEMAND + state.backlog);
  const have = Math.min(...partIds.map((id) => state.stock[id]));
  const produced = Math.max(0, Math.min(want, have));
  for (const id of partIds) state.stock[id] -= produced;
  state.backlog += DEMAND - produced;
  const arrived = {};
  for (const id of partIds) {
    const a = Math.max(0, Math.min(supplyCap(state, id, w), state.target - state.stock[id]));
    state.stock[id] += a;
    arrived[id] = a;
  }
  state.week = w;
  const rec = { week: w, produced, backlog: state.backlog, wait: state.backlog / DEMAND, arrived };
  state.history.push(rec);
  return rec;
}

/** 공장 상태: 'run'(제대로 가동) | 'slow'(덜 만듦) | 'stop'(멈춤) */
export function factoryStatus(rec) {
  if (!rec) return 'run';
  if (rec.produced === 0) return 'stop';
  if (rec.produced < DEMAND) return 'slow';
  return 'run';
}

/** 결과 요약 */
export function summarize(state) {
  const hist = state.history;
  return {
    strategy: state.strategy,
    stoppedWeeks: hist.filter((r) => r.produced === 0).length,
    maxWait: hist.reduce((m, r) => Math.max(m, r.wait), 0),
    backlogEnd: state.backlog,
    cost: STRATEGIES[state.strategy].cost,
  };
}

/** 처음부터 끝까지 한 번에 돌리기 */
export function simulate(strategyId, schedule, weeks = WEEKS) {
  const s = createState(strategyId, schedule);
  while (s.week < weeks && step(s));
  return s;
}
