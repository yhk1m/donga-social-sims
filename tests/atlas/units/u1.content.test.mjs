// © 2026 김용현
// tests/atlas/units/u1.content.test.mjs — Ⅰ 세계화 시대, 지리의 힘 주제 내용 생성물(sims/atlas-u1-world/data/topics.json·charts.json) 검사 (U1-8)
//   만드는 법: python -I scripts/atlas/extract_text.py --unit u1 --fill --check → node scripts/atlas/build_content.mjs --unit u1
//   (색칠하기 퀴즈가 없어 coloring_quiz 는 돌리지 않음 — 설정 content 에 coloringOut 이 없음)
//   단원 공통 계약(쪽·레이어·사진·그래프 ref·빈 글·조각 크기)은 tests/atlas/unitContract.test.mjs, topicView 묶음 규칙은 helpers/topicViewGuard.
//   여기는 세계화 고유의 수·묶음·보기·글.
import test from 'node:test'; import assert from 'node:assert/strict'; import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { WORK } from '../../../scripts/atlas/geo_util.mjs';
import { topicViewBundleProblems } from '../helpers/topicViewGuard.mjs';
// topic.js layerGroups·groupView 와 같은 규칙(topic.js 는 CSS 를 import 해 node 시험에서 불러오지 못함 — 규칙 사본, u6 시험과 같음)
const layerGroups = (topic) => { const gs = []; for (const r of topic.layers || []) { const label = r.label || r.ref; const g = gs.find((x) => x.label === label); if (g) g.refs.push(r); else gs.push({ label, refs: [r] }); } return gs; };
const groupView = (topic, group) => (topic.views || []).find((v) => group.refs.some((r) => r.ref === v.layer || r.ref.endsWith(`-${v.id}`))) || null;

const D = 'sims/atlas-u1-world/data';
const T = JSON.parse(readFileSync(`${D}/topics.json`, 'utf8'));
const C = JSON.parse(readFileSync(`${D}/charts.json`, 'utf8'));
const UNIT = JSON.parse(readFileSync('scripts/atlas/config/u1.json', 'utf8'));
const CFG = UNIT.content;
const OVERRIDES = JSON.parse(readFileSync('content/atlas/u1/overrides.json', 'utf8')).items;
const PHOTOS = Object.fromEntries(JSON.parse(readFileSync('content/atlas/u1/photos.json', 'utf8')).map((p) => [p.id, p]));
const layerData = (ref) => JSON.parse(readFileSync(`${D}/${ref}.json`, 'utf8'));
const by = Object.fromEntries(T.map((t) => [t.id, t]));
const refs = (t) => (t.layers ?? []).map((l) => l.ref);
const layerOf = (t, ref) => t.layers.find((l) => l.ref === ref);
const km = ([l1, p1], [l2, p2]) => {
  const r = Math.PI / 180, h = Math.sin((p2 - p1) * r / 2) ** 2 + Math.cos(p1 * r) * Math.cos(p2 * r) * Math.sin((l2 - l1) * r / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
};

test('주제 8개(교사 Q1 A), 8~15쪽 모두 덮음, 목차 제목', () => {
  assert.deepEqual(T.map((t) => t.id), ['general', 'continents', 'relief', 'climate', 'connection', 'interaction', 'glocal', 'themeActivity']);
  const pages = new Set(T.flatMap((t) => t.pages)); for (let p = 8; p <= 15; p++) assert.ok(pages.has(p), `${p}쪽`);
  assert.deepEqual(T.map((t) => t.pages), [[8, 9], [10, 11], [12], [13], [14], [14], [15], [15]]);
  assert.deepEqual(T.map((t) => t.title), ['세계 일반도', '대륙과 대양', '지형', '기후', '세계의 연결', '공간적 상호 작용', '세계화와 지역화', '주제도 활동']);
  assert.ok(T.every((t) => t.quiz === null), '색칠하기·세계유산 퀴즈 없음(맞히기·색칠하기 도구는 레이어)');
});

test('개수: 지형 핀 8 · 기후 사진 핀 8(번호 숨김 — 교사 Q9 A), 기후 그래프 마커 6, 햄버거 핀 4(번호 보임 — Q13 A)', () => {
  assert.equal(by.relief.markers.length, 8); assert.equal(by.relief.pinNumbers, 'hidden');
  assert.equal(by.climate.markers.filter((m) => m.chart).length, 6); assert.equal(by.climate.markers.filter((m) => !m.chart).length, 8);
  assert.equal(by.climate.pinNumbers, 'hidden');
  assert.equal(by.glocal.markers.length, 4); assert.equal(by.glocal.pinNumbers, undefined);
  for (const t of [by.relief, by.climate, by.glocal]) for (const m of t.markers.filter((x) => x.photo)) {
    assert.equal(m.lonlatFrom, 'pin', m.id); assert.deepEqual(m.lonlat, PHOTOS[m.photo.id].lonlat, m.id);
    assert.equal(m.text, PHOTOS[m.photo.id].caption, `${m.id} 글 = 사진 설명`);
  }
  assert.deepEqual(by.relief.markers.map((m) => m.photo.pin), [5, 8, 2, 6, 1, 3, 7, 4]);   // 사진 차례(설정) — 지도 번호는 U1-6 짝
  assert.deepEqual(by.glocal.markers.map((m) => m.photo.pin), [1, 2, 3, 4]);
  assert.deepEqual(by.relief.markers.map((m) => m.title), ['산지와 평야의 농업', '산지와 평야의 농업', '산지와 하천의 교통', '산지와 하천의 교통',
    '구릉과 산지의 겨울 스포츠', '구릉과 산지의 겨울 스포츠', '화산 지대와 사막의 에너지 개발', '화산 지대와 사막의 에너지 개발']);
});

test('기후 그래프 마커 6(U1-7 넘김 — 지면 차례): 그래프 도시 실제 자리(Natural Earth 10m 인구 지점), 제목 = 13쪽 지도 도시 글자, 글 = 그래프 제목', () => {
  const cm = by.climate.markers.filter((m) => m.chart);
  assert.deepEqual(cm.map((m) => m.chart), ['p13-singapore', 'p13-riyadh', 'p13-london', 'p13-montreal', 'p13-vostok', 'p13-bogota']);
  assert.deepEqual(cm.map((m) => [m.title, m.text]), [['싱가포르', '열대 기후(싱가포르)'], ['리야드', '건조 기후(리야드)'], ['런던', '온대 기후(런던)'],
    ['몬트리올', '냉대 기후(몬트리올)'], ['보스토크', '한대 기후(보스토크)'], ['보고타', '고산 기후(보고타)']]);
  for (const m of cm) {
    assert.equal(m.lonlatFrom, 'source', m.id); assert.match(m.source.url, /naturalearthdata\.com/); assert.equal(m.photo, undefined, m.id);
    assert.equal(C[m.chart].title, m.text, `${m.id} 글 = 그래프 제목`);
  }
  // 13쪽 지도 흰 도시 점(fit 되돌림 — U1-8 조사)과의 거리: 다섯은 150km 안, 보스토크는 로빈슨 극 둘레라 약 410km
  const dots = { 'c-singapore': [104.41, 1.34], 'c-riyadh': [45.91, 24.78], 'c-london': [-0.62, 52.13], 'c-montreal': [-74.61, 45.82], 'c-vostok': [124.4, -77.52], 'c-bogota': [-75.32, 4.67] };
  for (const m of cm) assert.ok(km(m.lonlat, dots[m.id]) < (m.id === 'c-vostok' ? 450 : 150), `${m.id} ${km(m.lonlat, dots[m.id]).toFixed(0)}km`);
});

test('지구본 단추(교사 §8 Q2·Q4 A): 일반도 대륙 5 = p10-continents 를 continentGlobes(legend false — 범례 블록 없음), 대륙과 대양 대양 5 = continentQuiz', () => {
  // 계획 초안의 layer-p09-globes·layer-p11-globes·layer-p10-quiz 는 없음 — 레이어 make 가 ref 의 다른 키를 못 받아 종류 이름이 동작을 고름(U1-3e·3f·U1-4):
  // 같은 대륙·대양 자료(layer-p10-continents) 하나를 일반도는 continentGlobes(대륙 단추), 10~11쪽은 continentQuiz(맞히기 + 대양 단추)로 그림
  for (const r of ['layer-p09-globes', 'layer-p11-globes', 'layer-p10-quiz']) assert.ok(!T.some((t) => refs(t).includes(r)), r);
  assert.deepEqual(layerOf(by.general, 'layer-p10-continents'), { ...layerOf(by.general, 'layer-p10-continents'), type: 'continentGlobes', legend: false });
  assert.deepEqual([layerOf(by.continents, 'layer-p10-continents').type, layerOf(by.continents, 'layer-p10-continents').legend], ['continentQuiz', true]);
  assert.equal(layerData('layer-p10-continents').properties.layerType, 'continents');
});

test('대륙·대양 맞히기(설계 §6.4-19 · 교사 Q6 A): 10~11쪽 주제 레이어가 continentQuiz, 자료 꼬리표 12 = 대륙 7 + 대양 5', () => {
  assert.deepEqual(refs(by.continents), ['layer-p10-continents']);
  const P = layerData('layer-p10-continents').properties;
  assert.equal(P.tags.length, 12); assert.equal(P.legend.length, 7); assert.equal(P.oceans.length, 5);
});

test('주제도 활동(교사 §8 Q4 · Q15 A): 문항 카드(role theme) + 조사표 + 원본 쪽 부분 + 색칠하기 도구(p15-paint 를 paintTool — topicView 따로 없음)', () => {
  const b = by.themeActivity.blocks;
  const theme = b.find((x) => x.type === 'activity' && x.role === 'theme');
  assert.equal(theme.title, '생활 속의 세계화 지도 만들기');
  assert.match(theme.text, /^① 다음 항목을 조사하여 조사표에 기록한다\. · 우리가 일상생활에서/); assert.match(theme.text, /④ 백지도에 각 항목의 생산 국가를 색칠하고, 상품 기호를 표시한다\.$/);
  assert.equal(b.find((x) => x.id === 'survey').text, '항목 · 기호 · 국가 — 운동화 · 베트남 / 볼펜 · 독일');
  assert.ok(b.some((x) => x.type === 'page' && x.page === 15 && x.bbox));
  assert.deepEqual(by.themeActivity.layers.map((l) => [l.ref, l.type, l.legend]), [['layer-p15-paint', 'paintTool', false]]);
  assert.equal(layerData('layer-p15-paint').properties.layerType, 'topicView');
  assert.deepEqual(layerData('layer-p15-paint').properties.view, { centerLon: 150 });
});

test('묶음: label 이 같으면 한 묶음, topicView 검사 통과, 바로가기마다 그 묶음', () => {
  assert.deepEqual(topicViewBundleProblems(T), []);
  const g = Object.fromEntries(T.map((t) => [t.id, layerGroups(t).map((x) => [x.label, x.refs.map((r) => r.ref.replace('layer-', ''))])]));
  assert.deepEqual(g.general, [['세계의 여러 나라', ['p08-view', 'p08-boundaries', 'p08-stations', 'p10-continents']]]);
  assert.deepEqual(g.continents, [['세계의 여러 나라', ['p10-continents']]]);
  assert.deepEqual(g.relief, [['세계의 지형', ['p12-view']]]);
  assert.deepEqual(g.climate, [['세계의 기후', ['p13-climate']]]);
  assert.deepEqual(g.connection, [['급속한 질병의 확산', ['p14-covid']]]);
  assert.deepEqual(g.interaction, [['우리나라의 항공망', ['p14-routes']], ['인터넷 이용률', ['p14-internet']], ['이동 전화 가입자', ['p14-mobile']]]);
  assert.deepEqual(g.glocal, [['음식 문화의 세계화', ['p15-burger']], ['세계를 잇는 한국어', ['p15-korean']]]);
  assert.deepEqual(g.themeActivity, [['생활 속의 세계화 지도 만들기', ['p15-paint']]]);
  for (const id of ['interaction', 'glocal', 'connection']) for (const v of by[id].views) {
    const grp = layerGroups(by[id]).find((x) => groupView(by[id], x) === v);
    assert.ok(grp, `${id}.${v.id}`); assert.equal(grp.label, v.label, `${id}.${v.id} 이름 = 묶음 이름`);
  }
  assert.equal(layerOf(by.general, 'layer-p08-stations').legendHead, false);
});

test('레이어 종류(설정 layerTypeAs — U1-3e·3f·3h·U1-4): 기지 symbolLabels · 맞히기·지구본 단추 = continents 자료 · 색칠하기 도구 = topicView 자료', () => {
  assert.deepEqual(CFG.layerTypeAs, { symbolLabels: ['symbol'], continentQuiz: ['continents'], continentGlobes: ['continents'], paintTool: ['topicView'] });
  const type = Object.fromEntries(T.flatMap((t) => t.layers).map((l) => [`${l.ref}:${l.type}`, layerData(l.ref).properties.layerType]));
  assert.deepEqual(type, {
    'layer-p08-view:topicView': 'topicView', 'layer-p08-boundaries:area': 'area', 'layer-p08-stations:symbolLabels': 'symbol', 'layer-p10-continents:continentGlobes': 'continents',
    'layer-p10-continents:continentQuiz': 'continents', 'layer-p12-view:topicView': 'topicView', 'layer-p13-climate:area': 'area', 'layer-p14-covid:countryClass': 'countryClass',
    'layer-p14-routes:routeFan': 'routeFan', 'layer-p14-internet:countryClass': 'countryClass', 'layer-p14-mobile:countryClass': 'countryClass',
    'layer-p15-burger:countryClass': 'countryClass', 'layer-p15-korean:symbol': 'symbol', 'layer-p15-paint:paintTool': 'topicView',
  });
  // 레이어 13 모두 어느 주제가 씀(layers.js 묶음)
  const used = new Set(T.flatMap(refs));
  assert.deepEqual([...used].sort(), readdirSync(D).filter((f) => /^layer-.*\.json$/.test(f)).map((f) => f.replace('.json', '')).sort());
  assert.equal(used.size, 13);
});

test('태평양 중심(교사 Q2 A): 보기 레이어 셋 150, 세계 지도 보기·바로가기 범위는 동쪽이 180 을 넘음(+360 꼴)', () => {
  for (const r of ['layer-p08-view', 'layer-p12-view', 'layer-p15-paint']) assert.deepEqual(layerData(r).properties.view, { centerLon: 150 }, r);
  for (const t of T) assert.ok(t.view.bounds[2] > 180 && t.view.bounds[0] < t.view.bounds[2], `${t.id} ${t.view.bounds}`);
  for (const id of ['interaction', 'glocal', 'connection']) for (const v of by[id].views) assert.ok(v.bounds[2] > 180, `${id}.${v.id}`);
  assert.deepEqual(by.general.view.bounds, [-30, -60, 330, 84]);
});

test('일반도 바로가기 둘: 세계·유럽 — 묶음이 있어 글 블록 「지도에서 보기」로(계획의 8쪽·9쪽 범위는 원본 쪽 블록에 단추가 안 달려 뺌 — U1-8 결정)', () => {
  const v = Object.fromEntries(by.general.views.map((x) => [x.id, x]));
  assert.deepEqual(by.general.views.map((x) => [x.id, x.label]), [['world', '세계의 여러 나라'], ['europe', '유럽']]);
  assert.deepEqual(v.world.bounds, [-30, -60, 330, 84]);
  const [w, s, e, n] = v.europe.bounds; assert.ok(w > -5 && e < 35 && s > 34 && n < 60, `유럽 ${v.europe.bounds}`);   // 삽입 원 틀(람베르트 정각 원뿔)
  const views = T.flatMap((t) => t.blocks.filter((x) => x.view).map((x) => `${t.id}:${x.id}:${x.view}`));
  assert.deepEqual(views, ['general:map-text:world', 'general:europe-text:europe', 'connection:covid-text:covid',
    'interaction:routes-text:routes', 'interaction:internet-text:internet', 'interaction:mobile-text:mobile', 'glocal:burger-text:burger', 'glocal:korean-text:korean']);
  const b = Object.fromEntries(by.general.blocks.map((x) => [x.id, x]));
  assert.deepEqual([b['map-text'].title, b['map-text'].text], ['세계의 여러 나라', '로빈슨 도법 1:75,000,000']);
  assert.equal(b['europe-text'].text, '람베르트 정각 원뿔 도법 1:20,000,000');
});

test('그래프 7(설정 expect.charts — U1-7): 기후 6은 마커, 「작아지는 지구」 표는 세계의 연결 사이드바 그래프 블록', () => {
  assert.equal(Object.keys(C).length, 7); assert.equal(CFG.expect.charts, 7);
  const blocks = T.flatMap((t) => t.blocks.filter((b) => b.type === 'chart').map((b) => `${t.id}:${b.ref}`));
  assert.deepEqual(blocks, ['connection:p14-shrink']);
  assert.equal(C['p14-shrink'].type, 'table');
});

test('세계의 연결(교사 Q11·Q12 A): 작아지는 지구 = 인물 사진 3 + 표 카드 + 원본 쪽 부분, 삽화 3 = 설명 글 + 원본 쪽 부분', () => {
  const ids = by.connection.blocks.map((b) => b.id);
  assert.deepEqual(ids, ['question', 'goal', 'section-1', 'p14-1', 'p14-2', 'p14-3', 'p14-shrink', 'page-14-shrink', 'section-3', 'text-3', 'page-14-division',
    'section-4', 'text-4', 'page-14-ict', 'section-5', 'text-5', 'page-14-exchange', 'section-6', 'covid-text', 'page-14']);
  const sec = by.connection.blocks.filter((b) => b.role === 'section').map((b) => b.text);
  assert.deepEqual(sec, ['작아지는 지구', '국제적 분업', '정보 통신 기술의 발달', '활발한 인적 교류', '급속한 질병의 확산']);
  for (const id of ['p14-1', 'p14-2', 'p14-3']) assert.ok(!/[➊➋➌]/.test(by.connection.blocks.find((b) => b.id === id).text), `${id} 번호 딩뱃 없음(captionOverride)`);
});

test('사진 블록 = 상자 소제목 아래(U1-6 _section), 15쪽 사진 10(햄버거 4는 핀 카드에도)', () => {
  const ph = T.flatMap((t) => t.blocks.filter((x) => x.type === 'photo').map((x) => x.photo.id));
  assert.deepEqual(ph, [...Array.from({ length: 8 }, (_, i) => `p12-${i + 1}`), ...Array.from({ length: 8 }, (_, i) => `p13-${i + 1}`), 'p14-1', 'p14-2', 'p14-3',
    ...Array.from({ length: 10 }, (_, i) => `p15-${i + 1}`)]);
  assert.deepEqual(by.relief.blocks.filter((b) => b.role === 'section').map((b) => b.text), ['세계의 지형', '산지와 평야의 농업', '산지와 하천의 교통', '구릉과 산지의 겨울 스포츠', '화산 지대와 사막의 에너지 개발']);
  assert.deepEqual(by.climate.blocks.filter((b) => b.role === 'section').map((b) => b.text), ['세계의 기후', '유목과 정착 농경', '눈과 비가 많은 지역의 전통 가옥', '온대와 사막 지역의 의생활', '계절이 반대인 북반구와 남반구']);
  assert.deepEqual(by.glocal.blocks.filter((b) => b.role === 'section').map((b) => b.text), ['음식 문화의 세계화', '커피 문화의 지역화', '세계를 잇는 한국어', '한류의 확산']);
});

test('사이드바 글: 질문·학습 목표(12·13쪽 둘 다 — u6 꼴), 활동하기 1·2(①~⑧), 대륙과 대양 개관·활동, 출처', () => {
  const goal = (id) => by[id].blocks.find((b) => b.role === 'goal').text;
  assert.equal(goal('relief'), '세계 각 지역의 지역성을 해당 지역의 위치와 자연·인문환경을 연결 지어 설명할 수 있다.');
  assert.equal(goal('climate'), goal('relief'));
  assert.equal(goal('connection'), '다양한 지역이 서로 연계되어 있음을 공간적 상호 작용의 사례를 통해 파악할 수 있다.');
  assert.equal(goal('interaction'), goal('connection'));
  assert.equal(goal('glocal'), '세계의 변화가 지역에 영향을 미치고, 지역의 변화가 세계에 영향을 미치는 사례를 조사할 수 있다.');
  for (const id of ['relief', 'climate']) assert.equal(by[id].blocks.find((b) => b.role === 'question').text, '세계의 다양한 자연환경은 인간 생활에 어떤 영향을 미쳤을까?');
  const acts = T.flatMap((t) => t.blocks.filter((b) => b.type === 'activity' && b.title?.startsWith('활동하기')).map((b) => `${t.id}:${b.title}:${b.text}`));
  assert.deepEqual(acts, ['relief:활동하기 1:아래 사진은 ①~⑧ 지역에서 볼 수 있는 모습이다. 사진의 빈칸에 해당 지역의 번호를 써 보자.',
    'climate:활동하기 2:아래 사진은 ①~⑧ 지역에서 볼 수 있는 모습이다. 사진의 빈칸에 해당 지역의 번호를 써 보자.']);
  const c = Object.fromEntries(by.continents.blocks.map((b) => [b.id, b]));
  assert.match(c['text-1'].text, /^지구 전체 면적의 71\.1%는 바다가, 28\.9%는 육지가/); assert.equal(c['text-1'].title, '세계의 여러 나라');
  assert.equal(c['activity-1'].text, '초성으로 쓰인 대륙과 대양의 이름을 적고, 각 대륙에는 어떤 나라들이 있는지 이야기해 보자.');
  assert.equal(by.relief.blocks.find((b) => b.id === 'section-1').credit, '(naturalearthdata.com, 2023)');
  const L = Object.fromEntries(T.flatMap((t) => t.layers).map((l) => [l.ref, l]));
  assert.deepEqual(Object.fromEntries(Object.entries(L).filter(([, l]) => l.credit).map(([r, l]) => [r, l.credit])), {
    'layer-p13-climate': '(www.gloh2o.org, 1991~2020 평균, 2023)', 'layer-p14-covid': '(세계 보건 기구, 2020)', 'layer-p14-routes': '(「대한민국 국가 지도집 1권」, 2019)',
    'layer-p14-internet': '(국가데이터처, 2020)', 'layer-p14-mobile': '(국가데이터처, 2020)', 'layer-p15-burger': '(M사 누리집, 2022)', 'layer-p15-korean': '(문화 체육 관광부, 2020)',
  });
  assert.deepEqual(Object.fromEntries(Object.entries(L).filter(([, l]) => l.legendTitle).map(([r, l]) => [r, l.legendTitle])), {
    'layer-p14-covid': '코로나 19 확진자 발생국', 'layer-p14-internet': '인터넷 이용률(%)', 'layer-p14-mobile': '이동 전화 가입자 수(인구 100명당)',
    'layer-p15-burger': 'M햄버거 매장 수(개소)', 'layer-p15-korean': '한국 문화 보급 기관',
  });
});

test('출처: 12~15쪽 인쇄 출처 글이 생성물(topics·charts)에 모두 있다(공백 무시)', () => {
  const hay = (JSON.stringify(T) + JSON.stringify(C)).replace(/\s+/g, '');
  let n = 0;
  for (const [p, list] of Object.entries(CFG.expectCredits)) {
    if (!/^\d+$/.test(p)) continue;
    for (const c of list) { assert.ok(hay.includes(c.replace(/\s+/g, '')), `${p}쪽 ${c}`); n++; }
  }
  assert.equal(n, 9);
});

test('고침(overrides) 6: 가운뎃점 빈칸 둘 · 핀 그림 번호 둘 · 주제도 제작 순서 · 조사표 — 모두 까닭', () => {
  assert.deepEqual(Object.keys(OVERRIDES).sort(), ['climate.blocks.activity-2.text', 'climate.blocks.goal.text',
    'relief.blocks.activity-1.text', 'relief.blocks.goal.text', 'themeActivity.blocks.survey.text', 'themeActivity.blocks.theme-1.text']);
  for (const [k, o] of Object.entries(OVERRIDES)) assert.ok(o.why?.length > 20, k);
  for (const k of ['relief.blocks.goal.text', 'climate.blocks.goal.text']) assert.equal(OVERRIDES[k].value.replace(/\s+/g, ''), OVERRIDES[k].from.replace(/\s+/g, ''), `${k}: 빈칸만`);
  // 주제도 제작 순서·조사표: 지면 글자는 그대로(번호·글머리·칸 나눔만 고침)
  const letters = (s) => s.replace(/[\s?·①-④1-4/—]/g, '');
  for (const k of ['themeActivity.blocks.theme-1.text', 'themeActivity.blocks.survey.text']) assert.equal(letters(OVERRIDES[k].value), letters(OVERRIDES[k].from), k);
});

test('깨진 글자 없음: 「烋」·?글리프··→h·㎢→LN·『』→|…} 가 u1 생성물에 없다', () => {
  const files = [`${D}/topics.json`, `${D}/charts.json`, ...readdirSync(D).filter((f) => /^layer-.*\.json$/.test(f)).map((f) => `${D}/${f}`)];
  for (const f of files) {
    const s = readFileSync(f, 'utf8');
    assert.ok(!s.includes('烋'), `${f}: 烋`);
    assert.ok(!/\?[가-힣]/.test(s), `${f}: 읽지 못한 글리프`);
    assert.ok(!/[가-힣]h[가-힣]/.test(s), `${f}: · → h`);
    assert.ok(!/[가-힣]LN|\|[^"|]{1,30}\}/.test(s), `${f}: ㎢·『』 복원 오류`);
  }
  const s = JSON.stringify(T);
  assert.ok(s.includes('인적·물적') && s.includes('사회적·경제적'), '14쪽 「·」 바르게');
  assert.ok(JSON.stringify(C).includes('(『이과연표』, 2023)'));
});

test('색칠하기 산출물 없음(U1-8 — 설정 coloringOut 없음): build_content 를 다시 돌려도 경고 없이 생성물이 바이트까지 같다', { skip: !existsSync(`${WORK}/units/u1/text/topics-check.json`) && `작업 폴더 없음(${WORK})` }, () => {
  assert.equal(CFG.coloringOut, undefined);
  assert.ok(!existsSync('content/atlas/u1/coloring.json'));
  const env = { ...process.env }; delete env.ATLAS_UNIT; delete env.ATLAS_UNIT_CONFIG;
  const r = spawnSync(process.execPath, ['scripts/atlas/build_content.mjs', '--unit', 'u1'], { encoding: 'utf8', env, timeout: 120000 });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /주제 8개, 그래프 7개, 레이어 13개/);
  assert.equal((r.stdout.match(/같음, 그대로/g) || []).length, 3, r.stdout);
  assert.match(r.stdout, /경고 없음/);
});
