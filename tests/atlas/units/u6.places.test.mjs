// © 2026 김용현
// tests/atlas/units/u6.places.test.mjs — Ⅵ 오세아니아·극지방 일반도(48쪽 본 지도·하와이·타히티 삽입, 50쪽 북극, 51쪽 남극) 지명 생성물
//   (sims/atlas-u6-oceania-polar/data/places.json) 검사 (U6-5)
//   만드는 법: python -I scripts/atlas/places.py --unit u6 → node scripts/atlas/build_places.mjs --unit u6 --verify
import test from 'node:test'; import assert from 'node:assert/strict'; import { readFileSync, statSync, existsSync } from 'node:fs';
import { key } from '../../../scripts/atlas/geo_util.mjs';

process.env.ATLAS_UNIT = 'u6';                                     // build_places 의 설정(neBox 27·neAlias)을 u6 으로
const { neCheck } = await import('../../../scripts/atlas/build_places.mjs');

const FILE = 'sims/atlas-u6-oceania-polar/data/places.json';
const places = JSON.parse(readFileSync(FILE, 'utf8'));
const cfg = JSON.parse(readFileSync('scripts/atlas/config/u6.json', 'utf8')).places;
const WORK = (process.env.ATLAS_WORK || 'C:/Users/Public/atlas-work').replace(/\\/g, '/');
const near = (p, lon, lat, tol) => Math.abs(((p.lon - lon + 540) % 360) - 180) < tol && Math.abs(p.lat - lat) < tol;
const one = (name, kind) => { const f = places.filter((x) => x.name === name && (!kind || x.kind === kind)); assert.equal(f.length, 1, `${name} ${f.length}개`); return f[0]; };

test('대표 지명 위치가 실제와 1° 안(날짜변경선 양쪽 포함)', () => {
  const want = { 캔버라: [149.13, -35.28], 웰링턴: [174.78, -41.29], 포트모르즈비: [147.18, -9.44], 수바: [178.44, -18.14], 아피아: [-171.76, -13.83], 누쿠알로파: [-175.2, -21.14], 호놀룰루: [-157.86, 21.31] };
  for (const [name, [lon, lat]] of Object.entries(want)) { const p = places.find((x) => x.name === name); assert.ok(p, name); assert.ok(near(p, lon, lat, 1), `${name} ${p.lon},${p.lat}`); }
});

test('극 지도 지명: 다산·세종 기지 글자는 지명이 아님(기지 레이어), 북극점·남극점은 있음(극 위로 relocate)', () => {
  assert.ok(!places.some((p) => /과학 기지/.test(p.name)));
  for (const n of ['모슨', '보스토크', '파머', '로데라', '맥머도', '아문센 스콧']) assert.ok(!places.some((p) => p.name === n), n);   // 51쪽 기지 이름도 레이어(p51-stations)
  assert.ok(places.some((p) => p.name === '북극점' && p.lat > 89 && p.moved));
  assert.ok(places.some((p) => p.name === '남극점' && p.lat < -89 && p.moved));
  for (const n of ['북극권', '남극권', '날짜 변경선', '유빙 한계', '영구빙 한계']) assert.ok(!places.some((p) => p.name === n), n);   // 선 레이어 이름
});

test('50쪽 글자 겹쳐 그림이 하나로(overdraw — 같은 글자 4~11번·토막 사본)', () => {
  assert.ok(places.filter((p) => p.name === '그린란드').length <= 1);
  for (const n of ['테헤란', '상트페테르부르크', '에스토니아', '북극해', '엘즈미어섬', '퀸엘리자베스 제도', '바렌츠해']) one(n);
  for (const n of ['마우나케아산', '할레아칼라산', '킬라우에아산', '마우나로아산', '카우아이 해협', '알레누이하하 해협']) one(n);   // 하와이 타일 토막(「마우나」+「나케아산」) 이어짐
  assert.ok(!places.some((p) => /^(마우나|나케아산|우나|케아산|로|오슬|파|머)$/.test(p.name)));
  assert.equal(cfg.overdraw.maps.join(), 'p48-hawaii,p50-arctic,p51-antarctic');
});

test('하와이 삽입 지명이 실제 자리로 합쳐짐(Q3)', () => {
  const p = places.find((x) => x.name === '마우나케아산'); assert.ok(p && near(p, -155.47, 19.82, 0.5));
  assert.equal(p.kind, 'mountain'); assert.equal(p.elev, 4205); assert.deepEqual(p.from, ['p48-hawaii']);
  assert.ok(near(one('호놀룰루'), -157.86, 21.31, 0.1));
  assert.ok(!places.some((x) => x.name === '하와이 제도'));      // 삽입 탭 = 바로가기 이름(U6-8)
  const tp = one('태평양'); assert.equal(tp.from[0], 'p48-oceania');   // 하와이 삽입 안 「태 평 양」은 뺌(본 지도 자리)
  assert.ok(!one('미국').from.includes('p48-hawaii'));           // 하와이 「미 국」(속한 나라 표시)은 뺌
});

test('국립 공원·유적 글자는 지명이 아님', () => { assert.ok(!places.some((p) => /국립 공원|유적|야생 지대|오페라 하우스/.test(p.name))); });

test('rank 1~6, kind 목록 안', () => { for (const p of places) { assert.ok(p.rank >= 1 && p.rank <= 6); assert.match(p.kind, /^(country|capital|city|mountain|river|sea|region|island|desert|plain|other)$/); } });

test('수도: 오세아니아 독립국 14 영문 병기 + 48쪽 아시아 이웃 + 50쪽 유라시아(벡터 수도 기호와 짝)', () => {
  const oc = ['캔버라', '웰링턴', '포트모르즈비', '응어룰무드', '팔리키르', '마주로', '타라와', '야렌', '호니아라', '포트빌라', '푸나푸티', '아피아', '수바', '누쿠알로파'];
  assert.equal(oc.length, 14);
  for (const n of oc) { const p = one(n, 'capital'); assert.ok(p.en, `${n} 영문`); }
  for (const n of ['딜리', '반다르스리브가완', '파리', '모스크바', '서울', '도쿄', '앙카라', '오슬로', '레이캬비크']) one(n, 'capital');
  assert.equal(places.filter((p) => p.kind === 'capital').length, 36);
  assert.equal(one('마주로').snapped.km > 100, true);              // 하와이 잘린 자리 옆에 옮겨 그린 기호 → Natural Earth
});

test('종류별 수(48쪽 셋 + 50·51쪽 합친 한 벌)', () => {
  const n = (k) => places.filter((p) => p.kind === k).length;
  assert.equal(places.length, 638);   // U6-10t: 50쪽 강·호수 래스터 글자 10 + 51쪽 래스터 산 2(교사 답 Q2)
  assert.deepEqual({ country: n('country'), capital: n('capital'), city: n('city'), sea: n('sea'), river: n('river'), mountain: n('mountain'), island: n('island'), region: n('region'), plain: n('plain'), desert: n('desert'), other: n('other') },
    { country: 72, capital: 36, city: 168, sea: 89, river: 19, mountain: 40, island: 153, region: 31, plain: 9, desert: 5, other: 16 });
  const from = (m) => places.filter((p) => p.from.includes(m)).length;
  assert.deepEqual(['p48-hawaii', 'p48-tahiti', 'p48-oceania', 'p50-arctic', 'p51-antarctic'].map(from), [21, 1, 343, 224, 62]);
  const by = {}; for (const p of places) (by[p.name] ||= []).push(p);
  assert.deepEqual(Object.entries(by).filter(([, v]) => v.length > 1).map(([k]) => k).sort(), ['미크로네시아', '솔로몬 제도', '포틀랜드'].sort());   // 나라 ↔ 지역·섬, 오리건 ↔ 빅토리아주
});

test('고친 글자: 덮개 밖 상자·소속 표시·래스터 글자 손 넣기·묶기 이름', () => {
  assert.ok(!places.some((p) => p.name === '타히티' && p.from.includes('p48-oceania')));   // 48쪽 본 지도 안 타히티 틀(dropBoxes)
  for (const bad of ['(노)', '(영)', '(프)', '(뉴)', '앙', '강', '날리산', '소순다', '열도', '플라이강파푸아만', '킴벌리', '고원', '캐롤라인제도']) assert.ok(!places.some((p) => p.name === bad), bad);
  assert.ok(!places.some((p) => ['노', '영', '프', '뉴'].includes(p.alt)));   // 소속 표시가 alt 로 붙지 않음
  for (const n of ['소순다 열도', '플라이강', '파푸아만', '킴벌리 고원', '타나미 사막', '체스터필드 제도', '사모아 제도', '캐롤라인 제도', '알류샨 열도', '쿠릴 열도']) one(n);
  for (const n of ['멜라네시아', '폴리네시아']) assert.equal(one(n).kind, 'region');
  assert.equal(one('웨델해').alt, '웨들해');
  // 래스터로 묻힌 지면 글자(addLabels) — 50쪽 나라·수도, 51쪽 랜드·산맥, 산 삼각형 자리
  for (const n of ['러시아', '중국', '몽골', '카자흐스탄', '프랑스', '독일']) assert.deepEqual(one(n, 'country').from, ['p50-arctic'], n);
  for (const n of ['퀸모드랜드', '빅토리아랜드', '아델리랜드', '윌크스랜드', '그레이엄랜드']) assert.equal(one(n).kind, 'region');
  for (const n of ['남극 횡단 산맥', '엘즈워스산맥']) assert.equal(one(n).kind, 'mountain');
  assert.ok(near(one('빈슨산'), -85.62, -78.53, 0.6) && one('빈슨산').elev === 4892);
  assert.ok(near(one('백두산'), 128.06, 41.99, 0.5) && one('백두산').elev === 2744 && one('군비요른산').elev === 3700);
  assert.ok(near(one('디날리산'), -151.0, 63.07, 1) && one('디날리산').elev === 6190);
  assert.ok(near(one('그레이트오스트레일리아만'), 130, -34, 2) && one('그레이트오스트레일리아만').from[0] === 'p48-oceania');
  // U6-10t 교사 답 Q2: 50쪽 강·호수 파란 래스터 글자 10(교과서 글자 자리 — 강줄기 곁) + 51쪽 래스터 산 둘(삼각형 자리 + 높이)
  for (const [n, lon, lat] of [['볼가강', 46, 51.5], ['페초라강', 52.5, 66], ['오비강', 65.5, 64.5], ['예니세이강', 86.5, 67], ['레나강', 124, 68],
    ['안가라강', 97, 58.5], ['아무르강', 127, 52], ['시르다리야강', 65, 45], ['매켄지강', -125, 64.5]]) {
    const p = one(n, 'river'); assert.ok(near(p, lon, lat, 2.5), `${n} ${p.lon},${p.lat}`); assert.deepEqual(p.from, ['p50-arctic']);
  }
  assert.equal(one('아무르강').alt, '헤이룽강');
  assert.ok(near(one('발하슈호', 'sea'), 75, 46.5, 2));
  assert.ok(one('시들리산', 'mountain').elev === 4181 && near(one('시들리산'), -126.1, -77.0, 6));   // 교과서 삼각형 자리(실제 정상과 약 145km)
  assert.ok(one('멘지스산', 'mountain').elev === 3355 && near(one('멘지스산'), 61.8, -73.5, 2.5));   // 교과서 삼각형 자리(실제 정상과 약 225km — 극 쪽으로 그려짐)
});

test('찾아보기 48·50·51쪽 지명이 모두 places 에 있음(뺀 것은 indexExclude 에 까닭 — 기지 레이어·alt)', () => {
  const idx = `${WORK}/${cfg.index.out}`;
  if (!existsSync(idx)) return;                                    // 작업 폴더 없음(다른 PC) — 건너뜀
  const rows = JSON.parse(readFileSync(idx, 'utf8')).filter((r) => [48, 50, 51].includes(r.page));
  assert.equal(rows.length, 102);
  const have = new Set(places.map((p) => key(p.name)));
  assert.deepEqual(rows.filter((r) => !cfg.indexExclude[r.name] && !have.has(key(r.name))).map((r) => r.name), []);
  assert.deepEqual(Object.keys(cfg.indexExclude).sort(), ['다산 과학 기지', '모슨', '보스토크', '세종 과학 기지', '웨들해', '장보고 과학 기지'].sort());
  const pageOf = { 'p48-oceania': 48, 'p48-hawaii': 48, 'p48-tahiti': 48, 'p50-arctic': 50, 'p51-antarctic': 51 };
  const pages = new Map(); for (const p of places) { const k = key(p.name); if (!pages.has(k)) pages.set(k, new Set()); for (const m of p.from) pages.get(k).add(pageOf[m]); }
  assert.deepEqual(rows.filter((r) => !cfg.indexExclude[r.name] && !pages.get(key(r.name))?.has(r.page)).map((r) => `${r.name} ${r.page}`), []);
});

// 찾아보기 격자 칸: 48쪽 = 경위선 칸(곡선 격자 — 위·아래 글자 간격이 달라 지면 네모 칸이 아님) A~I × 1~7 = 경선 10°(A = 110°~120°E, H = 180°~170°W)
//   × 위선 10°(1 = 20°~10°N, 5 = 20°~30°S). 50·51쪽 = 극 격자: 가장자리 글자 A~L = 경도 30° 부채꼴(50쪽 A = 120°~90°W 에서 서쪽으로 —
//   I = 0°~30°E(다산 I2), 51쪽 A = 90°~60°W 에서 동쪽으로 — B = 60°~30°W(세종 B3)), 초록 숫자 1~4 = 극에서 위도 10° 고리(1 = 극 ~ 80°).
// 지명 자리(점 = 기호 자리, 옮겼으면 snapped.from · 면 = 글자 줄 path) 중 하나가 그 칸이면 맞음. 아는 차이는 「실행 중 결정」 U6-5.
const L12 = (i) => String.fromCharCode(65 + (((i % 12) + 12) % 12));
const GRID = {
  48: ([lon, lat]) => String.fromCharCode(65 + Math.floor((((lon - 110) % 360) + 360) % 360 / 10)) + (Math.floor((20 - lat) / 10) + 1),
  50: ([lon, lat]) => L12(Math.floor((-90 - lon) / 30)) + (Math.floor((90 - lat) / 10) + 1),
  51: ([lon, lat]) => L12(Math.floor((lon + 90) / 30)) + (Math.floor((lat + 90) / 10) + 1),
};
const GRID_KNOWN = {
  '뉴먼 48B5': '기호 119.73°E(120°E 경선 서쪽 0.27° — A) — 찾아보기 B',
  '울런공 48D6': '기호 150.89°E(150°E 동쪽 0.89° — E) — 찾아보기 D',
  '쿡산 48F7': '삼각형 170.16°E(170°E 동쪽 0.16° — G) — 찾아보기 F',
  '수바 48G3': '기호 18.13°S(4 = 10~20°S) — 찾아보기 3(이웃 아피아 13.8°S 는 H4 — 찾아보기 쪽 차이)',
  '남극해 51D3': '51쪽 「남 극 해」 글자 둘(D3·K3)이 면 지명 하나로 합쳐져 앞 글자(K3) 자리',
  '라센 빙붕 51A2': '글자 67~69°S(3 = 60~70°S) — 찾아보기 2',
  '윌크스랜드 51H2': '래스터 글자 손 넣기 자리 경계(H3·G2) — 찾아보기 H2',
};
test('찾아보기 격자 칸 대조(48쪽 경위선 칸, 50·51쪽 극 부채꼴 × 위도 고리)', () => {
  const idx = `${WORK}/${cfg.index.out}`;
  if (!existsSync(idx)) return;
  const rows = JSON.parse(readFileSync(idx, 'utf8')).filter((r) => [48, 50, 51].includes(r.page) && !cfg.indexExclude[r.name]);
  const bad = [];
  for (const r of rows) {
    const k = key(r.name);
    const pts = places.filter((p) => key(p.name) === k).flatMap((p) => [p.snapped ? p.snapped.from : [p.lon, p.lat], ...(p.path || [])]);
    if (!pts.map(GRID[r.page]).includes(r.grid)) bad.push(`${r.name} ${r.page}${r.grid}`);
  }
  assert.deepEqual(bad.sort(), Object.keys(GRID_KNOWN).sort());
  assert.equal(GRID[48]([149.13, -35.28]), 'D6'); assert.equal(GRID[48]([-171.76, -13.83]), 'H4'); assert.equal(GRID[48]([134.62, 7.5]), 'C2');
  assert.equal(GRID[50]([11.93, 78.92]), 'I2'); assert.equal(GRID[50]([80.4, 73.5]), 'G2'); assert.equal(GRID[50]([-5, 75]), 'J2');
  assert.equal(GRID[51]([-58.79, -62.22]), 'B3'); assert.equal(GRID[51]([164.23, -74.62]), 'I2'); assert.equal(GRID[51]([-175, -81]), 'J1');
});

test('neAlias: 극 지도 상자가 받는 북반구·다른 나라 동명은 nearest, 오거스타는 maxKm(Natural Earth 에 없음 — 교과서 자리)', () => {
  for (const n of ['퍼스', '포틀랜드', '해밀턴', '시드니', '오클랜드', '밴쿠버']) assert.ok(cfg.neAlias[n]?.nearest && cfg.neAlias[n].why, n);
  assert.equal(cfg.neAlias.오거스타.maxKm, 100);
  assert.ok(near(one('퍼스'), 115.86, -31.95, 0.2) && near(one('해밀턴'), 175.28, -37.79, 0.2) && near(one('시드니'), 151.21, -33.87, 0.3));
  const og = one('오거스타'); assert.ok(near(og, 115.16, -34.32, 0.3) && !og.snapped, `${og.lon},${og.lat}`);   // 오스트레일리아 서부(메인주로 옮기지 않음)
  const pt = places.filter((p) => p.name === '포틀랜드').sort((a, b) => a.lon - b.lon);
  assert.ok(near(pt[0], -122.68, 45.52, 0.5) && near(pt[1], 141.6, -38.34, 0.5), JSON.stringify(pt.map((p) => [p.lon, p.lat])));
});

test('Natural Earth 대조: 48쪽 중앙값 ≤ 1km · 90% ≤ 12km · 최대 ≤ 32km, 50쪽 90% ≤ 25km, 전체 40km 넘음 0', () => {
  const NE = `${WORK}/${cfg.neFile}`;
  if (!existsSync(NE)) return;
  const r = neCheck(places, NE);
  assert.ok(r.n >= 145 && r.far.length === 0 && r.max <= 32, JSON.stringify(r));
  const r48 = neCheck(places.filter((p) => p.from[0] === 'p48-oceania'), NE);
  assert.ok(r48.n >= 85 && r48.median <= 1 && r48.p90 <= 12, JSON.stringify(r48));
  const r50 = neCheck(places.filter((p) => p.from[0] === 'p50-arctic'), NE);
  assert.ok(r50.n >= 50 && r50.p90 <= 25, JSON.stringify(r50));
});

test('50쪽 래스터 도시 22·상자 글자 14(U6-5 리뷰 — addLabels): 기호 자리 = NE(기호와 1pt 안) 또는 교과서 기호, rank 는 글자 크기 표', () => {
  const ad = cfg.addLabels['p50-arctic'];
  const cities = ad.filter((a) => a.dot === 'city'); assert.equal(cities.length, 22);
  for (const a of cities) assert.match(a.why, /Natural Earth 「.+」\(.+\) 을 50쪽 fit 으로 지면에 — .+와 (0\.\d\d|1\.00)pt|교과서 .+ 자리 — Natural Earth 「.+」 은 \d+\.\dpt 떨어짐/, a.text);
  for (const n of ['니즈니노브고로드', '카잔', '사마라', '우파', '첼랴빈스크', '옴스크', '톰스크', '바르나울', '크라스노야르스크', '이르쿠츠크', '볼로그다', '로스토프',
    '야쿠츠크', '베르호얀스크', '하바롭스크', '치치하얼', '하얼빈', '지린', '창춘', '선양', '캘거리', '에드먼턴']) {
    const p = one(n, 'city'); assert.ok(p.symbol && p.from[0] === 'p50-arctic', n);
    assert.equal(p.rank, ['하얼빈', '창춘', '선양'].includes(n) ? 4 : 6, n);   // 굵은 7.1pt = 4, 5.7pt = 6(이 쪽 다른 도시와 같은 표)
  }
  assert.ok(near(one('로스토프'), 39.71, 47.24, 0.2));             // 로스토프나도누(neAlias name) — 로스토프벨리키로 옮기지 않음
  assert.ok(near(one('카잔'), 49.12, 55.75, 0.05) && !one('카잔').snapped);   // NE 자리
  for (const n of ['래브라도 고원', '매켄지산맥', '코스트산맥', '동유럽 평원', '우랄산맥', '북시베리아 평원', '중앙시베리아고원', '체르스키산맥', '베르호얀스크산맥',
    '콜리마산맥', '주그주르산맥', '스타노보이산맥', '야블로노비산맥', '알타이산맥']) assert.match(one(n).kind, /^(mountain|plain)$/, n);
  assert.ok(near(one('우랄산맥'), 59, 60, 4) && near(one('중앙시베리아고원'), 103, 64, 6));
});

test('옮긴 기호는 snapped 기록(snapKm 넘음), 용량 ≤ 220KB', () => {
  const moved = places.filter((x) => x.snapped);
  assert.equal(moved.length, 12);
  for (const p of moved) assert.ok(p.snapped.km > cfg.snapKm - 0.5 && p.snapped.km < 150, `${p.name} ${p.snapped.km}`);
  assert.ok(statSync(FILE).size <= 220 * 1024, `${statSync(FILE).size}`);
});
