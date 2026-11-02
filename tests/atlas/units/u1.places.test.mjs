// © 2026 김용현
// tests/atlas/units/u1.places.test.mjs — Ⅰ 세계화 일반도(8·9쪽 「세계의 여러 나라」 두 쪽 지도 + 8쪽 유럽 삽입) 지명 생성물
//   (sims/atlas-u1-world/data/places.json) 검사 (U1-5)
//   만드는 법: python -I scripts/atlas/places.py --unit u1 → node scripts/atlas/build_places.mjs --unit u1 --verify
import test from 'node:test'; import assert from 'node:assert/strict'; import { readFileSync, statSync, existsSync } from 'node:fs';
import { key } from '../../../scripts/atlas/geo_util.mjs';

process.env.ATLAS_UNIT = 'u1';                                     // build_places 의 설정(neBox 세계·neAlias)을 u1 으로
const { neCheck } = await import('../../../scripts/atlas/build_places.mjs');

const FILE = 'sims/atlas-u1-world/data/places.json';
const places = JSON.parse(readFileSync(FILE, 'utf8'));
const cfg = JSON.parse(readFileSync('scripts/atlas/config/u1.json', 'utf8')).places;
const WORK = (process.env.ATLAS_WORK || 'C:/Users/Public/atlas-work').replace(/\\/g, '/');
const near = (p, lon, lat, tol) => Math.abs(((p.lon - lon + 540) % 360) - 180) < tol && Math.abs(p.lat - lat) < tol;
const one = (name, kind) => { const f = places.filter((x) => x.name === name && (!kind || x.kind === kind)); assert.equal(f.length, 1, `${name} ${f.length}개`); return f[0]; };

test('대표 지명 위치가 실제와 1° 안(두 쪽·날짜변경선 양쪽)', () => {
  const want = { 서울: [126.98, 37.57], 런던: [-0.13, 51.51], 카이로: [31.24, 30.04], 모스크바: [37.62, 55.75], 워싱턴: [-77.04, 38.9], 브라질리아: [-47.93, -15.78], 캔버라: [149.13, -35.28], 수바: [178.44, -18.14], 아피아: [-171.76, -13.83] };
  for (const [name, [lon, lat]] of Object.entries(want)) { const p = places.find((x) => x.name === name); assert.ok(p, name); assert.ok(near(p, lon, lat, 1), `${name} ${p.lon},${p.lat}`); }
});

test('가름선 토막 글자가 하나로(3a): 나우루 하나, 「나」 토막 없음', () => {
  assert.equal(places.filter((p) => p.name === '나우루').length, 1);
  assert.ok(!places.some((p) => p.name === '나'));
  // 가름선 둘레(8쪽 오른쪽 끝·9쪽 왼쪽 끝) 지명도 하나씩, 9쪽 것은 9쪽에서만
  for (const n of ['나우루', '바누아투', '솔로몬 제도', '마셜 제도', '누벨칼레도니섬', '호니아라', '포트빌라', '야렌', '마주로']) one(n);
  assert.deepEqual(one('나우루').from, ['p09-world']);
  assert.deepEqual(one('솔로몬 제도').from, ['p08-world']);
  assert.ok(!places.some((p) => /^(로몬 제도|우루|누아투)$/.test(p.name)));
  assert.ok(!cfg.spread && cfg._spread);                           // 새 키 없이(설명만) — PDF 글자 조각은 잘린 글자도 문자열 전체
});

test('유럽 삽입 지명이 실제 자리로 합쳐짐', () => { const p = places.find((x) => x.name === '류블랴나'); assert.ok(p && near(p, 14.51, 46.06, 0.6)); });

test('합치기 차례: 유럽 삽입 → 8쪽 → 9쪽, 삽입 원 밖 글자는 본 지도 몫', () => {
  assert.deepEqual(cfg.mergePriority, ['p08-europe', 'p08-world', 'p09-world']);
  assert.deepEqual(one('프랑스').from, ['p08-europe', 'p08-world']);
  assert.equal(one('프랑스').rank, 5);                             // 삽입 표 rankBySizeMaps(8.6pt → 5)
  assert.deepEqual(one('영국').from, ['p08-world']);               // 삽입 「영 국」은 원 클립 밖(안 보임) → 본 지도 8.6pt
  assert.equal(one('영국').rank, 3);
  assert.ok(near(one('케이프타운'), 18.42, -33.92, 0.5) && !one('케이프타운').snapped);   // 삽입 외접 상자 모서리의 본 지도 글자(addLabels)
  assert.ok(near(one('남아프리카 공화국'), 24, -30, 4));
  for (const n of ['리히텐슈타인', '산마리노', '코소보', '슬로베니아']) assert.equal(one(n, 'country').rank, 6, n);
  assert.ok(!places.some((p) => /도법$/.test(p.name)));
});

test('기지 글자는 지명이 아님(레이어)', () => { assert.ok(!places.some((p) => /과학 기지/.test(p.name))); });

test('선 이름·소속 표시·반구 화살표·찾아보기 격자 글자는 지명이 아님', () => {
  for (const n of ['북극권', '남극권', '북회귀선', '남회귀선', '적도', '날짜 변경선', '본초 자오선', '북반구', '남반구', '서반구', '동반구', '이어도']) assert.ok(!places.some((p) => p.name === n), n);
  assert.ok(!places.some((p) => /^\(|\)$/.test(p.name) || /^[A-Z]$|^\d$/.test(p.name)));
  const short = places.filter((p) => p.name.replace(/\s/g, '').length < 2).map((p) => p.name);
  assert.deepEqual(short, ['빈']);                                  // 한 글자 지명은 오스트리아 수도 빈뿐(토막 없음)
});

test('rank 1~6, kind 목록 안', () => { for (const p of places) { assert.ok(p.rank >= 1 && p.rank <= 6); assert.match(p.kind, /^(country|capital|city|mountain|river|sea|region|island|desert|plain|other)$/); } });

test('종류별 수(8·9쪽 + 유럽 삽입 합친 한 벌)', () => {
  const n = {}; for (const p of places) n[p.kind] = (n[p.kind] || 0) + 1;
  assert.deepEqual(n, { country: 194, capital: 192, city: 26, sea: 75, island: 61, mountain: 37, river: 33, region: 23, plain: 10, desert: 9 });
  assert.equal(places.length, 660);
});

test('고친 글자: 낱자 지명 손 넣기·두 지명 한 조각·수도 기호 짝 고정·괄호 병기·표기', () => {
  for (const [n, kind] of [['나일강', 'river'], ['랴오허강', 'river'], ['인더스강', 'river'], ['미시시피강', 'river'], ['리오그란데강', 'river'],
    ['우랄산맥', 'mountain'], ['토고', 'country'], ['가나', 'country'], ['베냉', 'country'], ['콜라반도', 'region'], ['카닌반도', 'region'],
    ['체르스키산맥', 'mountain'], ['콜리마산맥', 'mountain'], ['서시베리아 평원', 'plain'], ['래브라도고원', 'plain']]) assert.equal(one(n).kind, kind, n);
  assert.ok(near(one('나일강'), 31, 21, 4) && near(one('미시시피강'), -91, 33, 5) && near(one('토고'), 1, 8.5, 1.5) && near(one('우랄산맥'), 59, 60, 6));
  for (const n of ['가나고', '토베냉', '우서시베리아평원', '체르스키산맥콜리마산맥', '콜라반도 카닌반도', '오리 그란데강', '래브라도']) assert.ok(!places.some((p) => p.name === n), n);
  for (const n of ['트빌리시', '두샨베', '이슬라마바드', '팀푸']) { const p = one(n); assert.equal(p.kind, 'capital', n); assert.ok(!p.snapped, n); }
  const k2 = one('고드윈오스턴산'); assert.equal(k2.alt, 'K2'); assert.equal(k2.elev, 8611);
  assert.equal(one('룹알할리 사막').kind, 'desert'); assert.ok(!places.some((p) => p.name.startsWith('룹압')));   // 지면 「룹압할리」 → 찾아보기 표기(issues 8)
  for (const n of ['칠레 해구', '페루 해구', '하와이 해령', '남동인도양 해령']) one(n, 'sea');
  for (const n of ['서사하라', '기아나']) assert.equal(one(n).kind, 'region', n);
  for (const n of ['다마스쿠스', '로메', '아크라', '포르토노보', '야무수크로', '반다르스리브가완', '아시가바트', '포르토프랭스']) assert.equal(one(n).kind, 'capital', n);   // 좁은 자리 작은 수도 글자(4.5~5.1pt)
  for (const n of ['에베레스트산', '킬리만자로산', '아콩카과산', '디날리산', '몽블랑산', '백두산']) { const p = one(n); assert.equal(p.kind, 'mountain', n); assert.ok(p.elev > 2000, n); }
  for (const n of ['제주도', '울릉도', '독도']) one(n, 'island');
});

test('찾아보기 8·9쪽 지명이 모두 places 에 있음(누락 0 — indexExclude 없음), 쪽도 같음', () => {
  const idx = `${WORK}/${cfg.index.out}`;
  if (!existsSync(idx)) return;                                    // 작업 폴더 없음(다른 PC) — 건너뜀
  const rows = JSON.parse(readFileSync(idx, 'utf8')).filter((r) => [8, 9].includes(r.page));
  assert.equal(rows.length, 578);
  assert.deepEqual(cfg.indexExclude, {});
  const have = new Set(places.map((p) => key(p.name)));
  assert.deepEqual(rows.filter((r) => !have.has(key(r.name))).map((r) => r.name), []);
  const pageOf = { 'p08-world': 8, 'p08-europe': 8, 'p09-world': 9 };
  const pages = new Map(); for (const p of places) { const k = key(p.name); if (!pages.has(k)) pages.set(k, new Set()); for (const m of p.from) pages.get(k).add(pageOf[m]); }
  assert.deepEqual(rows.filter((r) => !pages.get(key(r.name))?.has(r.page)).map((r) => `${r.name} ${r.page}`), []);
});

// 찾아보기 격자 칸: 8·9쪽 = 경위선 칸(위·아래 파랑 글자는 지도 위 끝 경선 사이, 양옆 초록 숫자는 위선 사이 — 지면 조사 U1-5)
//   A~R = 경선 20°(A = 40°~20°W … J = 140°~160°E, K = 160°E~180°(찾아보기는 9쪽), L = 180°~160°W … R = 60°~40°W)
//   × 1~9 = 위선 20°(1 = 80°N 위, 4 = 40°~20°N, 9 = 60°S 아래). 유럽 삽입 자체 격자(S~U · 1~2)를 가리키는 찾아보기 줄은 없음.
//   지명 자리(점 = 기호, 옮겼으면 snapped.from · 면 = 글자 줄 path) 중 하나가 그 칸이면 맞음. 아는 차이는 「실행 중 결정」 U1-5.
const COLS = 'ABCDEFGHIJKLMNOPQR';
const GRID = ([lon, lat]) => COLS[Math.floor((((lon + 40) % 360) + 360) % 360 / 20)] + Math.min(9, Math.max(1, Math.floor((100 - lat) / 20) + 1));
const TOL = 3;                                                     // 칸 경계 둘레 3°(1:75,000,000 에서 약 11pt — 글자 한두 자) 안은 맞음으로
const GRID_KNOWN = {
  '그린란드 9R2': '8·9쪽 두 글자(8A2·9R2)가 면 지명 하나로 합쳐져 mergePriority 앞 8쪽 글자 자리(A2)',
  '대서양 9R4': '8쪽 「대 서 양」(A4 — 찾아보기에 없음)과 9쪽 글자가 하나로 합쳐져 8쪽 자리',
  '북대서양 9R3': '두 쪽 글자(8A3·9R3)가 하나로 — 8쪽 자리',
  '남대서양 9R8': '두 쪽 글자(8B6·9R8)가 하나로 — 8쪽 자리',
  '남극해 9M9': '두 쪽 글자(8쪽 E9 — 찾아보기에 없음·9M9)가 하나로 — 8쪽 자리',
  '킹스턴 9P5': '기호 76.77°W(80°W 경선 동쪽 3.2° — Q) — 찾아보기 P(글자가 기호 왼쪽)',
};
test('찾아보기 격자 칸 대조(8·9쪽 경위선 20° 칸)', () => {
  const idx = `${WORK}/${cfg.index.out}`;
  if (!existsSync(idx)) return;
  const rows = JSON.parse(readFileSync(idx, 'utf8')).filter((r) => [8, 9].includes(r.page));
  const bad = []; let exact = 0;
  for (const r of rows) {
    const k = key(r.name);
    const pts = places.filter((p) => key(p.name) === k).flatMap((p) => [p.snapped ? p.snapped.from : [p.lon, p.lat], ...(p.path || [])]);
    if (!pts.map(GRID).includes(r.grid)) exact++;
    const near3 = pts.flatMap(([lon, lat]) => [-TOL, 0, TOL].flatMap((a) => [-TOL, 0, TOL].map((b) => GRID([lon + a, lat + b]))));
    if (!near3.includes(r.grid)) bad.push(`${r.name} ${r.page}${r.grid}`);
  }
  assert.ok(exact <= 35, `칸 경계 3° 밖까지 보지 않은 다름 ${exact}`);   // 지명 자리(기호·글자 가운데)와 찾아보기 칸(글자 첫머리)이 칸 경계 둘레에서 엇갈림
  assert.deepEqual(bad.sort(), Object.keys(GRID_KNOWN).sort());
  assert.equal(GRID([126.98, 37.57]), 'I4'); assert.equal(GRID([-0.13, 51.51]), 'B3'); assert.equal(GRID([178.44, -18.14]), 'K6');
  assert.equal(GRID([-171.76, -13.83]), 'L6'); assert.equal(GRID([-58.38, -34.6]), 'R7'); assert.equal(GRID([-21.9, 64.1]), 'A2');
});

test('neAlias: 세계 상자 동명 18 은 nearest, 한글 이름이 다른 도시는 name', () => {
  for (const n of ['런던', '로마', '빈', '빅토리아', '산티아고', '산호세', '킹스턴', '트리폴리', '시드니', '멜버른', '샌프란시스코']) assert.ok(cfg.neAlias[n]?.nearest && cfg.neAlias[n].why, n);
  assert.equal(cfg.neAlias.서울.name, '서울특별시'); assert.equal(cfg.neAlias.키이우.name, '키예프');
  assert.ok(near(one('빅토리아'), 55.45, -4.62, 0.3) && near(one('트리폴리'), 13.18, 32.89, 0.3) && near(one('킹스턴'), -76.77, 17.98, 0.3));
});

test('Natural Earth 대조: 지도마다 중앙값 ≤ 5km · 90% ≤ 11km, 전체 최대 ≤ 30km · 40km 넘음 0', () => {
  const NE = `${WORK}/${cfg.neFile}`;
  if (!existsSync(NE)) return;
  const r = neCheck(places, NE);
  assert.ok(r.n >= 215 && r.far.length === 0 && r.max <= 30, JSON.stringify(r));
  for (const [id, n] of [['p08-world', 135], ['p09-world', 54], ['p08-europe', 24]]) {
    const q = neCheck(places.filter((p) => p.from[0] === id), NE);
    assert.ok(q.n >= n && q.median <= 5 && q.p90 <= 11, `${id} ${JSON.stringify(q)}`);
  }
});

test('옮긴 기호는 snapped 기록(snapKm 넘음), 용량 ≤ 250KB', () => {
  const moved = places.filter((x) => x.snapped);
  assert.deepEqual(moved.map((p) => p.name).sort(), ['기테가', '도도마', '마이애미', '브라자빌', '비엔티안', '킨샤사'].sort());
  for (const p of moved) assert.ok(p.snapped.km > cfg.snapKm - 0.5 && p.snapped.km < 150, `${p.name} ${p.snapped.km}`);
  assert.ok(statSync(FILE).size <= 250 * 1024, `${statSync(FILE).size}`);
});
