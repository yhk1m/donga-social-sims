// © 2026 김용현
// U1-4 주제 레이어(Ⅰ 세계화 시대, 지리의 힘 8~15쪽) — 생성물 sims/atlas-u1-world/data/layer-*.json 확인
//   맞히기·지구본 단추는 따로 레이어가 없음: 앱 type continentQuiz·continentGlobes 가 p10-continents 자료를 그대로 씀(U1-3e·3f),
//   색칠하기 도구는 앱 type paintTool 이 p15-paint(topicView) 자료를 씀(U1-3h).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { geoContains, geoDistance } from 'd3-geo';

const D = 'sims/atlas-u1-world/data';
const read = (id) => JSON.parse(readFileSync(`${D}/layer-${id}.json`, 'utf8'));
const has = existsSync(`${D}/layer-p13-climate.json`);
const t = has ? test : test.skip;
const kb = (id) => statSync(`${D}/layer-${id}.json`).size / 1024;
const clsOf = (v) => (typeof v === 'string' ? v : v?.[0]);
const lines = (f) => (f.geometry.type === 'LineString' ? [f.geometry.coordinates] : f.geometry.coordinates);

t('레이어 13 · 합계 ≤ 600KB, 예산(기후 ≤ 250 · 대륙·대양 ≤ 130 · 노선 ≤ 15 · 해양 경계 ≤ 45 · 한국어 ≤ 45)', () => {
  const ids = readdirSync(D).filter((f) => /^layer-.*\.json$/.test(f)).map((f) => f.slice(6, -5)).sort();
  assert.deepEqual(ids, ['p08-boundaries', 'p08-stations', 'p08-view', 'p10-continents', 'p12-view', 'p13-climate', 'p14-covid', 'p14-internet',
    'p14-mobile', 'p14-routes', 'p15-burger', 'p15-korean', 'p15-paint']);
  assert.ok(ids.reduce((a, id) => a + kb(id), 0) <= 600);
  for (const [id, max] of [['p13-climate', 250], ['p10-continents', 130], ['p14-routes', 15], ['p08-boundaries', 45], ['p15-korean', 45]]) assert.ok(kb(id) <= max, `${id} ${kb(id).toFixed(1)}KB`);
});

t('태평양 중심 보기 레이어(교사 Q2): 일반도·지형·색칠하기 도구 자료 centerLon 150', () => {
  for (const id of ['p08-view', 'p12-view', 'p15-paint']) {
    const L = read(id);
    assert.equal(L.properties.layerType, 'topicView', id);
    assert.equal(L.properties.view.centerLon, 150, id);
    assert.equal(L.features.length, 0, id);
  }
});

t('p08 해양 경계(8·9쪽 한 레이어) + 날짜 변경선(범례 밖): 범례 1, 육지 안 국경은 빠짐', () => {
  const L = read('p08-boundaries');
  assert.deepEqual(L.properties.legend.map((e) => e.label), ['해양 경계']);
  const sea = L.features.filter((f) => f.properties.cls === 'l1'), dl = L.features.filter((f) => f.properties.label === '날짜 변경선');
  assert.ok(sea.length >= 100);
  assert.equal(dl.length, 1);
  const pts = sea.flatMap((f) => lines(f).flat());
  assert.ok(pts.some(([lon]) => lon < -60) && pts.some(([lon]) => lon > 100), '9쪽(서반구)·8쪽(동반구) 모두');
  // 아프리카 한가운데(콩고 분지)·시베리아 내륙에는 선이 없음(국경 획은 seaOnly 로 뺌)
  for (const [w, s, e, n] of [[15, -5, 30, 8], [80, 52, 120, 65]]) assert.ok(!pts.some(([x, y]) => x > w && x < e && y > s && y < n), `${[w, s, e, n]}`);
  const dpts = lines(dl[0]).flat();
  assert.ok(dpts.every(([x]) => Math.abs(Math.abs(x) - 180) <= 31), '날짜 변경선은 180° 둘레(키리바시 라인 제도 쪽 150°W 까지)');
  assert.ok(Math.min(...dpts.map((p) => p[1])) < -60 && Math.max(...dpts.map((p) => p[1])) > 60);
});

t('p08 우리나라 과학 기지 3(다산·장보고·세종) + 지면 글자 6 + 이어도 종합 해양 과학 기지 글자 2(U1-8)', () => {
  const L = read('p08-stations');
  const sym = L.features.filter((f) => f.properties.type === 'symbol'), lab = L.features.filter((f) => f.properties.type === 'label');
  assert.equal(L.properties.legend.length, 1);
  assert.equal(lab.length, 8);
  assert.deepEqual(lab.slice(6).map((f) => f.properties.text), ['이어도', '종합 해양 과학 기지']);   // U1-8: 8쪽 명조 4.9pt 두 줄(기호 없음)
  assert.ok(geoDistance(lab[6].geometry.coordinates, [125.18, 32.12]) < 0.02, `이어도 ${lab[6].geometry.coordinates}`);   // 약 130km 안(지면 글자 자리 — 기지 실제 자리 남서쪽)
  const want = { 다산: [11.93, 78.92], 장보고: [164.23, -74.62], 세종: [-58.79, -62.22] };
  for (const [k, ll] of Object.entries(want)) {
    const f = sym.find((x) => x.properties.name.startsWith(k));
    assert.ok(f && geoDistance(f.geometry.coordinates, ll) < 0.06, `${k} ${f?.geometry.coordinates}`);   // 약 380km(지면 기호 자리 — 극지방 로빈슨)
  }
});

t('대륙 면(Q5 A): 대륙 7, 러시아 서쪽 조각 = 유럽 · 동쪽 = 아시아, 그린란드 분류 없음, 맞히기 꼬리표 12', () => {
  const L = read('p10-continents'), P = L.properties;
  assert.equal(new Set(Object.values(P.classes).map(clsOf)).size, 7);
  assert.equal(P.classes.GRL, undefined);
  const rus = L.features.filter((f) => f.properties.iso === 'RUS');
  assert.ok(rus.some((f) => f.properties.cls === 'europe' && geoContains(f, [37.6, 55.75])));   // 모스크바
  assert.ok(rus.some((f) => f.properties.cls === 'asia' && geoContains(f, [82.9, 55.0])));      // 노보시비르스크
  assert.equal(P.tags.length, 12);
  assert.deepEqual(new Set(P.tags.map((g) => g.cls)), new Set([...P.legend.map((e) => e.cls), ...P.oceans.map((o) => o.cls)]));
});

t('대양 면 5(Q7 A): 대표 점 포함', () => {
  const L = read('p10-continents');
  const O = L.features.filter((f) => f.properties.ocean);
  assert.equal(L.properties.oceans.length, 5);
  const want = { pacific: [-150, 30], atlantic: [-30, 0], indian: [80, -20], arctic: [0, 85], southern: [0, -65] };
  for (const [cls, pt] of Object.entries(want)) assert.ok(O.some((f) => f.properties.cls === cls && geoContains(f, pt)), cls);
});

t('p13 기후: 범례 6(열대·건조·온대·냉대·한대 + 고산 빗금), 빗금 면 = 티베트·안데스', () => {
  const gj = read('p13-climate');
  assert.deepEqual(gj.properties.legend.map((e) => e.label), ['열대 기후', '건조 기후', '온대 기후', '냉대 기후', '한대 기후', '고산 기후']);
  const h = gj.features.find((f) => f.properties.pattern === 'hatch');
  assert.ok(h);
  assert.equal(gj.properties.legend[5].pattern, 'hatch');
  assert.ok(geoContains(h, [88, 33]), '티베트고원');
  assert.ok(geoContains(h, [-68, -17]), '알티플라노(안데스)');
  const cls = (pt) => gj.features.find((f) => !f.properties.pattern && geoContains(f, pt))?.properties.label;
  assert.equal(cls([101.7, 3.1]), '열대 기후');    // 쿠알라룸푸르(싱가포르섬은 minArea 0.3°² 아래라 빠짐)
  assert.equal(cls([46.7, 24.7]), '건조 기후');    // 리야드
  assert.equal(cls([-73.6, 45.5]), '냉대 기후');   // 몬트리올
});

t('p14 항공망(Q10 A): 출발 인천, 노선 188(= 지면 빨간 점, 교과서 선 167 · 글 175개 도시는 대조표), 모두 인천과 다른 점', () => {
  const R = read('p14-routes');
  const [lon, lat] = R.properties.origin;
  assert.ok(Math.abs(lon - 126.45) < 1 && Math.abs(lat - 37.46) < 1);
  const C = R.features[0].geometry.coordinates;
  assert.equal(C.length, 188);
  for (const p of C) assert.ok(geoDistance(p, [lon, lat]) > 0.01);
});

t('p14 인터넷·이동 전화 5단계(위가 큰 값), 둘레에 묻힌 작은 나라 고침(까닭)', () => {
  const I = read('p14-internet'), M = read('p14-mobile');
  assert.deepEqual(I.legend.map((e) => e.label), ['80 ~ 100', '60 ~ 80', '40 ~ 60', '20 ~ 40', '0 ~ 20']);
  assert.deepEqual(M.legend.map((e) => e.label), ['120 초과', '100 ~ 120', '60 ~ 100', '30 ~ 60', '30 미만']);
  for (const L of [I, M]) {
    assert.ok(Object.keys(L.classes).length >= 190);
    for (const o of L.overrides) assert.ok(o.why, o.iso);
    assert.equal(clsOf(L.classes.VAT), clsOf(L.classes.ITA));
    assert.equal(clsOf(L.classes.SMR), clsOf(L.classes.ITA));
  }
  assert.equal(clsOf(I.classes.KOR), 'c1');
});

t('p14 코로나: 2020년 1월 20일 발생국 = 범례 「8개국」(속령·특별 행정구 4 는 그 나라 색), 3월 20일 분류 ≥ 150', () => {
  const C = read('p14-covid');
  assert.deepEqual(C.legend.map((e) => e.label), ['2020년 1월 20일(8개국)', '2020년 3월 20일(181개국)']);
  const jan = Object.keys(C.classes).filter((k) => clsOf(C.classes[k]) === C.legend[0].cls);
  const TERR = new Set(['HKG', 'MAC', 'ALD', 'PRI']);
  assert.deepEqual(jan.filter((k) => !TERR.has(k)).sort(), ['CHN', 'DEU', 'ESP', 'FIN', 'JPN', 'KOR', 'MMR', 'USA']);
  assert.ok(Object.values(C.classes).filter((v) => clsOf(v) === 'c2').length >= 150);
  for (const k of ['PRK', 'YEM', 'TJK']) assert.equal(C.classes[k], undefined, `${k} 칠 없음`);
});

t('p15 햄버거 5단계: 북한 「0(없음)」(사진 아래 보임), 스시버거 사진 밑 나라는 분류 없음', () => {
  const B = read('p15-burger');
  assert.deepEqual(B.legend.map((e) => e.label), ['1,000 이상', '100-999', '10-99', '1-9', '0(없음)']);
  assert.equal(clsOf(B.classes.PRK), 'c5');
  for (const k of ['FSM', 'GUM', 'MNP', 'MHL', 'KIR']) assert.equal(B.classes[k] ?? null, null, k);
  assert.equal(clsOf(B.classes.USA), 'c1');
  assert.equal(clsOf(B.classes.KOR), 'c2');
  for (const o of B.overrides) assert.ok(o.why, o.iso);
});

t('p15 한국어 기호 3종(Q14 A): 점 212 = 세종학당 145 · 문화원 32 · 교육원 35, 범례 견본 색', () => {
  const K = read('p15-korean');
  assert.deepEqual(K.properties.legend.map((e) => [e.label, e.color]), [['세종학당', '#ed1651'], ['문화원', '#0068a6'], ['교육원', '#01b49c']]);
  assert.equal(K.features.length, 212);
  const n = (c) => K.features.filter((f) => f.properties.cls === c).length;
  assert.deepEqual([n('c1'), n('c2'), n('c3')], [145, 32, 35]);
  assert.ok(K.features.some((f) => geoDistance(f.geometry.coordinates, [2.35, 48.86]) < 0.03), '파리 둘레 점');
});
