// tests/atlas/units/u6.content.test.mjs — Ⅵ 오세아니아와 극지방 주제 내용 생성물(sims/atlas-u6-oceania-polar/data/topics.json·charts.json, content/atlas/u6/coloring.json) 검사 (U6-8)
//   만드는 법: python -I scripts/atlas/extract_text.py --unit u6 --labels → node scripts/atlas/coloring_quiz.mjs --unit u6 --write
//            → python -I scripts/atlas/extract_text.py --unit u6 --fill --check → node scripts/atlas/build_content.mjs --unit u6
//   단원 공통 계약(쪽·레이어·사진·그래프 ref·빈 글·조각 크기)은 tests/atlas/unitContract.test.mjs, topicView 묶음 규칙은 polarExtra.test(helpers/topicViewGuard).
//   여기는 오세아니아·극지방 고유의 수·묶음·보기·글.
import test from 'node:test'; import assert from 'node:assert/strict'; import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { WORK } from '../../../scripts/atlas/geo_util.mjs';
// topic.js layerGroups·groupView 와 같은 규칙(topic.js 는 CSS 를 import 해 node 시험에서 불러오지 못함 — 규칙 사본)
const layerGroups = (topic) => { const gs = []; for (const r of topic.layers || []) { const label = r.label || r.ref; const g = gs.find((x) => x.label === label); if (g) g.refs.push(r); else gs.push({ label, refs: [r] }); } return gs; };
const groupView = (topic, group) => (topic.views || []).find((v) => group.refs.some((r) => r.ref === v.layer || r.ref.endsWith(`-${v.id}`))) || null;
import { topicViewBundleProblems } from '../helpers/topicViewGuard.mjs';

const D = 'sims/atlas-u6-oceania-polar/data';
const T = JSON.parse(readFileSync(`${D}/topics.json`, 'utf8'));
const C = JSON.parse(readFileSync(`${D}/charts.json`, 'utf8'));
const UNIT = JSON.parse(readFileSync('scripts/atlas/config/u6.json', 'utf8'));
const CFG = UNIT.content;
const COLORING = JSON.parse(readFileSync('content/atlas/u6/coloring.json', 'utf8'));
const OVERRIDES = JSON.parse(readFileSync('content/atlas/u6/overrides.json', 'utf8')).items;
const PHOTOS = Object.fromEntries(JSON.parse(readFileSync('content/atlas/u6/photos.json', 'utf8')).map((p) => [p.id, p]));
const layerData = (ref) => JSON.parse(readFileSync(`${D}/${ref}.json`, 'utf8'));
const by = Object.fromEntries(T.map((t) => [t.id, t]));
const refs = (t) => (t.layers ?? []).map((l) => l.ref);
const groupLabels = (t) => layerGroups(t).map((g) => g.label);
const LABELS = `${WORK}/units/u6/text/p49-labels.json`;
const km = ([l1, p1], [l2, p2]) => {
  const r = Math.PI / 180, h = Math.sin((p2 - p1) * r / 2) ** 2 + Math.cos(p1 * r) * Math.cos(p2 * r) * Math.sin((l2 - l1) * r / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
};

test('주제 10개(교사 Q1 — 55쪽을 북극 / 남극·극지 연구 둘로), 48~55쪽 모두 덮음', () => {
  assert.deepEqual(T.map((t) => t.id), ['general', 'coloring', 'arctic', 'antarctic', 'relief', 'climate', 'exchange', 'environment', 'arcticRoute', 'antarcticResearch']);
  const pages = new Set(T.flatMap((t) => t.pages)); for (let p = 48; p <= 55; p++) assert.ok(pages.has(p), `${p}쪽`);
  assert.deepEqual(T.map((t) => t.pages), [[48], [49], [50], [51], [52], [53], [54], [54], [55], [55]]);
  assert.deepEqual(T.map((t) => t.title), ['일반도', '색칠하기', '북극', '남극', '지형', '기후', '상호 교류', '환경 문제', '북극의 지리적 중요성', '남극의 지리적 중요성과 극지 연구']);
  assert.deepEqual(T.filter((t) => t.quiz?.type === 'coloring').map((t) => t.id), ['coloring']);
});

test('개수: 지형 핀 7(번호 숨김), 기후 그래프 마커 4(번호 숨김) — 그래프 도시로 옮김, 교과서 핀은 textbookLonlat', () => {
  assert.equal(by.relief.markers.length, 7); assert.equal(by.relief.pinNumbers, 'hidden');
  assert.equal(by.climate.markers.filter((m) => m.chart).length, 4); assert.equal(by.climate.pinNumbers, 'hidden');
  assert.deepEqual(by.climate.markers.map((m) => [m.chart, m.place]), [['p53-darwin', '다윈'], ['p53-alice', '앨리스스프링스'], ['p53-perth', '퍼스'], ['p53-christchurch', '크라이스트처치']]);
  for (const m of by.climate.markers) { assert.equal(m.lonlatFrom, 'place', m.id); assert.ok(km(m.lonlat, m.textbookLonlat) < 100, m.id); }
  for (const m of by.relief.markers) { assert.equal(m.lonlatFrom, 'pin', m.id); assert.deepEqual(m.lonlat, PHOTOS[m.photo.id].lonlat, m.id); }
  assert.deepEqual(by.relief.markers.map((m) => m.photo.id), ['p52-1', 'p52-2', 'p52-3', 'p52-4', 'p52-5', 'p52-6', 'p52-7']);
});

test('극 중심(교사 §8 Q1·Q6): 북극·남극·영유권·기지 묶음이 극 레이어를 쓰고, 보기 레이어가 같은 묶음에서 교과서 방향으로 연다', () => {
  assert.ok(refs(by.arctic).includes('layer-p50-lines')); assert.ok(refs(by.antarctic).includes('layer-p51-shelves'));
  assert.ok(refs(by.arcticRoute).includes('layer-p55-claims')); assert.ok(refs(by.antarcticResearch).includes('layer-p55-sectors'));
  const viewOf = (t, ref) => { const g = layerGroups(t).find((x) => x.refs.some((r) => r.ref === ref)); const tv = g.refs.find((r) => r.type === 'topicView'); return tv && layerData(tv.ref).properties.view; };
  assert.deepEqual(viewOf(by.arctic, 'layer-p50-lines'), { projection: 'polarN', up: -90 });
  assert.deepEqual(viewOf(by.antarctic, 'layer-p51-shelves'), { projection: 'polarS', up: -90 });
  assert.deepEqual(viewOf(by.arcticRoute, 'layer-p55-claims'), { projection: 'polarN', up: 180 });
  assert.deepEqual(viewOf(by.antarcticResearch, 'layer-p55-sectors'), { projection: 'polarS', up: -90 });
  // 극 묶음 처음 보기 = 극 둘레 위선 원(U6-3c ③ — 경도 한 바퀴, 극까지)
  for (const b of [by.arctic.view.bounds, by.antarctic.view.bounds, by.arcticRoute.views[1].bounds, by.antarcticResearch.views[1].bounds]) {
    assert.equal(b[0], -180); assert.equal(b[2], 180); assert.ok(b[3] === 90 || b[1] === -90, `${b}`);
  }
  assert.deepEqual([by.arctic.view.bounds[1], by.antarctic.view.bounds[3]], [44, -45]);
});

test('지구본(교사 §8 Q2·Q16): 북극 항로·아라온호 둘 — 경로 자료의 view 가 지구본(회전 = 55쪽 정사 중심)', () => {
  assert.ok(refs(by.arcticRoute).includes('layer-p55-route'));
  for (const id of ['layer-p55-araon-s', 'layer-p55-araon-n']) assert.ok(refs(by.antarcticResearch).includes(id), id);
  assert.deepEqual(layerData('layer-p55-route').properties.view, { projection: 'globe', rotate: [-100.9, -58], base: 'natural' });   // U6-9: 묶음 바탕 자연색(Q16 — polarExtra pathFlow 감쌈)
  assert.deepEqual(layerData('layer-p55-araon-s').properties.view, { projection: 'globe', rotate: [137.8, 59.9], base: 'natural' });   // U6-9: 묶음 바탕 자연색(Q16 — polarExtra pathFlow 감쌈)
  assert.deepEqual(layerData('layer-p55-araon-n').properties.view, { projection: 'globe', rotate: [-163.4, -39.7], base: 'natural' });   // U6-9: 묶음 바탕 자연색(Q16 — polarExtra pathFlow 감쌈)
});

test('우리나라 윤곽(교사 §8 Q3·Q4): 일반도에 48쪽 같은 경도 거울상 윤곽, 안내 글 = 지면 글자(overrides)', () => {
  assert.ok(refs(by.general).includes('layer-p48-korea'));
  assert.equal(layerData('layer-p48-korea').properties.mode, 'sameLat');
  assert.equal(by.general.blocks.find((b) => b.id === 'outline-text').text, '같은 축척과 같은 경도의 우리나라');
});

test('묶음(U6-4 → U6-8): 극·지구본 묶음은 보기 레이어와 그리는 레이어가 같은 label, topicView 검사 통과', () => {
  assert.deepEqual(topicViewBundleProblems(T), []);
  assert.deepEqual(groupLabels(by.general), ['오세아니아']);
  assert.deepEqual(groupLabels(by.coloring), ['오세아니아의 국가와 주요 도시(색칠하기)']);
  assert.deepEqual(groupLabels(by.arctic), ['북극 일반도']);
  assert.deepEqual(groupLabels(by.antarctic), ['남극 일반도']);
  assert.deepEqual(groupLabels(by.relief), ['오세아니아의 지형']);
  assert.deepEqual(groupLabels(by.climate), ['오세아니아의 기후 구분', '1월의 평균 기온과 강수량', '7월의 평균 기온과 강수량']);
  assert.deepEqual(groupLabels(by.exchange), ['오스트레일리아와 자유 무역 협정(FTA)을 맺은 국가들']);
  assert.deepEqual(groupLabels(by.environment), ['태평양의 거대 쓰레기 섬', '남태평양의 해수면 변화 예측']);
  assert.deepEqual(groupLabels(by.arcticRoute), ['북극 항로', '북극해를 둘러싼 영유권 분쟁']);
  assert.deepEqual(groupLabels(by.antarcticResearch), ['남극 조약', '세계 각국의 남극 연구 기지와 영유권 분쟁', '10월~4월', '7월~9월']);
  const g = Object.fromEntries(T.map((t) => [t.id, layerGroups(t).map((x) => x.refs.map((r) => r.ref.replace('layer-', '')))]));
  assert.deepEqual(g.arctic, [['p50-view', 'p50-lines', 'p50-dasan']]);
  assert.deepEqual(g.antarctic, [['p51-view', 'p51-shelves', 'p51-lines', 'p51-stations']]);
  assert.deepEqual(g.arcticRoute, [['p55-route', 'p55-route-cities'], ['p55-claims-view', 'p55-claims', 'p55-resources']]);
  assert.deepEqual(g.antarcticResearch, [['p55-treaty'], ['p55-bases-view', 'p55-sectors', 'p55-bases'], ['p55-araon-s', 'p55-araon-s-marks'], ['p55-araon-n', 'p55-araon-n-marks']]);
  assert.deepEqual(g.general, [['p48-view', 'p48-boundaries', 'p48-korea']]);
  // 묶음이 둘 이상인 주제: 바로가기(view)마다 그 묶음(topic.js groupView — ref 가 「-<view id>」로 끝남)이 있고 이름이 같음
  for (const id of ['environment', 'arcticRoute', 'antarcticResearch', 'exchange']) {
    const t = by[id];
    for (const v of t.views) {
      const grp = layerGroups(t).find((x) => groupView(t, x) === v);
      assert.ok(grp, `${id}.${v.id}`); assert.equal(grp.label, v.label, `${id}.${v.id} 이름 = 묶음 이름`);
    }
  }
});

test('레이어 종류(U6-4 넘김): 기호 + 글자 = symbolLabels(symbol 자료, layerTypeAs), FTA·남극 조약 = countryClass, 영유권 = sectorLines', () => {
  const type = Object.fromEntries(T.flatMap((t) => t.layers).map((l) => [l.ref, l.type]));
  for (const r of ['layer-p50-dasan', 'layer-p51-stations', 'layer-p55-route-cities', 'layer-p55-resources', 'layer-p55-bases', 'layer-p55-araon-s-marks', 'layer-p55-araon-n-marks']) {
    assert.equal(type[r], 'symbolLabels', r); assert.equal(layerData(r).properties.layerType, 'symbol', r);
  }
  assert.deepEqual(CFG.layerTypeAs, { symbolLabels: ['symbol'] });
  assert.deepEqual([type['layer-p54-fta'], type['layer-p55-treaty'], type['layer-p55-sectors'], type['layer-p54-fta-labels']], ['countryClass', 'countryClass', 'sectorLines', 'area']);
  assert.deepEqual(T.flatMap((t) => t.layers.filter((l) => l.type === 'topicView').map((l) => l.ref)),
    ['layer-p48-view', 'layer-p49-view', 'layer-p50-view', 'layer-p51-view', 'layer-p52-view', 'layer-p55-claims-view', 'layer-p55-bases-view']);
  for (const l of T.flatMap((t) => t.layers)) if (l.type === 'topicView' || /-marks$|fta-labels|korea/.test(l.ref)) assert.equal(l.legend, false, l.ref);
});

test('태평양 중심(교사 Q2): 일반도·색칠하기·지형은 보기 레이어 150, 세계·북태평양 바로가기 범위는 동쪽이 180 을 넘음', () => {
  for (const r of ['layer-p48-view', 'layer-p49-view', 'layer-p52-view']) assert.deepEqual(layerData(r).properties.view, { centerLon: 150 }, r);
  const vb = (t, id) => t.views.find((v) => v.id === id).bounds;
  for (const b of [vb(by.exchange, 'fta'), vb(by.antarcticResearch, 'treaty'), vb(by.environment, 'garbage'), vb(by.environment, 'sealevel'), by.general.view.bounds])
    assert.ok(b[2] > 180 && b[0] < b[2], `${b}`);
  assert.deepEqual(vb(by.environment, 'garbage'), [121.6, 3.3, 248.5, 63.1]);
  assert.deepEqual(vb(by.environment, 'sealevel'), [140, -28, 212, 28]);
});

test('일반도 바로가기(교사 Q3): 오세아니아·하와이 제도·타히티 — 묶음이 있어 블록 「지도에서 보기」로(삽입 틀 되돌린 범위)', () => {
  assert.deepEqual(by.general.views.map((v) => [v.id, v.label]), [['oceania', '오세아니아'], ['hawaii', '하와이 제도'], ['tahiti', '타히티']]);
  assert.deepEqual(by.general.views[1].bounds, [-161, 18.6, -153.5, 23.1]);
  assert.deepEqual(by.general.views[2].bounds, [-156.3, -21.1, -145.7, -14]);
  const b = Object.fromEntries(by.general.blocks.map((x) => [x.id, x]));
  assert.deepEqual([b['map-text'].title, b['map-text'].text, b['map-text'].view], ['오세아니아', '람베르트 정적 방위 도법 1:30,000,000', 'oceania']);
  assert.deepEqual([b['hawaii-text'].title, b['hawaii-text'].text, b['hawaii-text'].view], [null, '하와이 제도', 'hawaii']);   // U6-9 고침(축척 막대 글자 「0 100km」 → 틀 제목)
  assert.deepEqual([b['tahiti-text'].text, b['tahiti-text'].view], ['타히티(프)', 'tahiti']);
  for (const id of ['arctic', 'antarctic']) assert.equal(by[id].blocks.find((x) => x.id === 'map-text').text, '정거 방위 도법 1:39,000,000');
});

test('그래프 11: 기후 4는 마커, 원 2·반원·두 축 선·해수면·표 2는 사이드바 그래프 블록(잰 값 둘은 주석)', () => {
  assert.equal(Object.keys(C).length, 11);
  const blocks = T.flatMap((t) => t.blocks.filter((b) => b.type === 'chart').map((b) => `${t.id}:${b.ref}`));
  assert.deepEqual(blocks, ['exchange:p54-aus-exports', 'exchange:p54-nz-exports', 'exchange:p54-partners', 'environment:p54-plastic', 'environment:p54-temp-co2', 'environment:p54-sealevel', 'arcticRoute:p55-route-stats']);
  assert.deepEqual([C['p54-partners'].type, C['p54-temp-co2'].type, C['p54-plastic'].type, C['p55-route-stats'].type], ['halfPie', 'dualLine', 'table', 'table']);
  for (const id of ['p54-temp-co2', 'p54-sealevel']) assert.match(by.environment.blocks.find((b) => b.id === id).note, /잰 값/, id);
  assert.match(by.exchange.blocks.find((b) => b.id === 'p54-aus-exports').text, /^오스트레일리아는 천연자원을/);
  assert.match(by.exchange.blocks.find((b) => b.id === 'p54-partners').text, /^오스트레일리아는 최근 태평양 연안/);
});

test('해양 쓰레기 표 밖 문장 둘(U6-6·U6-7 리뷰 고침 → U6-8): 54쪽 삽화 위 글을 주제 글로, 표 카드에는 없음', () => {
  const b = Object.fromEntries(by.environment.blocks.map((x) => [x.id, x]));
  assert.equal(b['plastic-note-1'].text, '연간 플라스틱 생산량의 0.5%가 바다에 버려진다.');
  assert.equal(b['plastic-note-2'].text, '수만 톤~수십만 톤의 해양 플라스틱 부유물');
  const ids = by.environment.blocks.map((x) => x.id);
  assert.ok(ids.indexOf('p54-plastic') < ids.indexOf('plastic-note-1') && ids.indexOf('plastic-note-2') < ids.indexOf('page-54-plastic'));
  assert.ok(!JSON.stringify(C['p54-plastic']).includes('버려진다'));
});

test('레이어 글: 교과서 범례 제목·출처(원문 상자)', () => {
  const L = Object.fromEntries(T.flatMap((t) => t.layers).map((l) => [l.ref, l]));
  assert.equal(L['layer-p53-climate'].legendTitle, '기후 구분');
  assert.equal(L['layer-p53-jan'].legendTitle, '강수량(mm)'); assert.equal(L['layer-p53-jul'].lineLegendTitle, '기온 (°C)');
  assert.equal(L['layer-p55-claims'].legendTitle, '영유권 주장 국가');
  const want = {
    'layer-p53-climate': '*1991~2020년 평균 (www.gloh2o.org, 2023)', 'layer-p53-jan': '*1970~2010년 평균 (www.worldclim.org, 2023)',
    'layer-p54-fta': '(오스트레일리아 외교 통상부, 2023)', 'layer-p54-garbage': '(education.nationalgeographic.org, 2023)',
    'layer-p54-sealevel': '(유엔 정부 간 기후 변화 협의회(IPCC), 2013)', 'layer-p55-route': '(한국 무역 협회, 2022)', 'layer-p55-claims': '(해양 수산부, 2021)',
    'layer-p55-treaty': '(남극 조약 사무국 누리집, 2023)', 'layer-p55-sectors': '(「청소년을 위한 국가 지도집」, 2022)',
    'layer-p55-araon-s': '(「청소년을 위한 대한민국 국가지도집」, 2022)', 'layer-p55-araon-n': '(「청소년을 위한 대한민국 국가지도집」, 2022)',
  };
  for (const [r, c] of Object.entries(want)) assert.equal(L[r].credit, c, r);
  assert.equal(by.relief.blocks.find((b) => b.id === 'section-1').credit, '(naturalearthdata.com, 2023)');
  assert.equal(by.exchange.blocks.find((b) => b.id === 'fta-text').text, '*다자간 협정은 제외함.');
});

test('사이드바 블록: 활동하기 1~4, 주제도 활동(교사 §8 Q4 — 문항 카드 + 원본 쪽), 사진 블록, 원본 쪽 부분 보기 넷, 참고 사이트는 글(링크 아님)', () => {
  const acts = T.flatMap((t) => t.blocks.filter((b) => b.type === 'activity' && b.title?.startsWith('활동하기')).map((b) => `${t.id}:${b.title}`));
  assert.deepEqual(acts, ['relief:활동하기 1', 'climate:활동하기 2', 'environment:활동하기 3', 'antarcticResearch:활동하기 4']);
  const b = by.antarcticResearch.blocks;
  const theme = b.find((x) => x.type === 'activity' && x.role === 'theme');
  assert.deepEqual([theme.title, theme.text], ['극지 연구소의 연구 활동 알아보기', '우리나라 극지 연구소의 누리집에 접속하여 극지 연구소의 활동에 대해 자세히 살펴보자.']);
  assert.ok(b.some((x) => x.type === 'page' && x.page === 55 && x.bbox));
  const parts = T.flatMap((t) => t.blocks.filter((x) => x.type === 'page' && x.bbox).map((x) => `${t.id}:${x.id}`));
  assert.deepEqual(parts, ['environment:page-54-plastic', 'environment:page-54-sealevel', 'antarcticResearch:page-55-araon', 'antarcticResearch:page-55-theme']);
  for (const t of T) assert.ok(t.blocks.some((x) => x.type === 'page' && !x.bbox && x.page === t.pages[0]), `${t.id} 쪽 전체`);
  const ph = T.flatMap((t) => t.blocks.filter((x) => x.type === 'photo').map((x) => x.photo.id));
  assert.deepEqual(ph, ['p54-1', 'p54-2', 'p54-3', 'p54-4', 'p54-5', 'p55-1', 'p55-2', 'p55-3', 'p55-4', 'p55-5', 'p55-6', 'p55-7']);
  const sites = T.flatMap((t) => t.blocks.filter((x) => x.title === '참고 사이트').map((x) => x.text));
  assert.deepEqual(sites, ['탄소 중립 포인트 에너지 https://t25.kr/hpkm', '극지 연구소 https://t25.kr/6kv2']);
  // 바로가기 단추(view)가 붙는 글: 지도 이름이 있는 묶음마다 하나 이상
  const views = T.flatMap((t) => t.blocks.filter((x) => x.view).map((x) => `${t.id}:${x.view}`));
  assert.deepEqual(views, ['general:oceania', 'general:hawaii', 'general:tahiti', 'exchange:fta', 'environment:garbage', 'environment:sealevel',
    'arcticRoute:route', 'arcticRoute:claims', 'antarcticResearch:treaty', 'antarcticResearch:bases', 'antarcticResearch:araon-s', 'antarcticResearch:araon-n']);
});

test('색칠하기(교사 Q5): 독립국 14·수도 14, 지역 없음(뉴칼레도니아 퀴즈 밖), 섬나라 모두, 큰 초성 셋은 윤곽 글자라 extraCountries', () => {
  const q = by.coloring.quiz;
  assert.deepEqual(q.countries, COLORING.countries);
  const qs = q.countries, isos = qs.map((c) => c.iso);
  assert.equal(qs.filter((c) => !c.region).length, 14); assert.equal(qs.filter((c) => c.region).length, 0);
  for (const iso of ['AUS', 'NZL', 'PNG', 'FJI', 'SLB', 'VUT', 'WSM', 'TON', 'TUV', 'KIR', 'NRU', 'MHL', 'FSM', 'PLW']) assert.ok(isos.includes(iso), iso);
  assert.ok(!isos.includes('NCL'));
  const c = Object.fromEntries(qs.map((x) => [x.iso, x]));
  assert.deepEqual(Object.keys(CFG.coloring.extraCountries).sort(), ['AUS', 'NZL', 'PNG']);
  for (const iso of ['AUS', 'NZL', 'PNG']) assert.equal(c[iso].label, null, iso);
  assert.deepEqual([c.AUS.capital, c.NZL.capital, c.PNG.capital], ['캔버라', '웰링턴', '포트모르즈비']);
  for (const iso of ['AUS', 'NZL', 'PNG']) assert.equal(c[iso].capitalFrom, 'places', iso);
  assert.deepEqual([c.FSM.label, c.FSM.name, c.FSM.capital], ['미크로네시아', '미크로네시아', '팔리키르']);
  for (const [iso, cap] of Object.entries({ PLW: '응어룰무드', MHL: '마주로', KIR: '타라와', NRU: '야렌', SLB: '호니아라', TUV: '푸나푸티', WSM: '아피아', VUT: '포트빌라', FJI: '수바', TON: '누쿠알로파' })) {
    assert.equal(c[iso].capital, cap, iso); assert.equal(c[iso].capitalFrom, 'printed', iso);
  }
  // 날짜변경선 양쪽 섬나라 수도 자리(경도 부호)
  assert.ok(c.WSM.capitalLonlat[0] < -170 && c.TON.capitalLonlat[0] < -170 && c.TUV.capitalLonlat[0] > 179 && c.KIR.capitalLonlat[0] > 172);
});

test('색칠하기 49쪽 글자: 보이는 글자 = 초성·이름 11 + 손글씨 수도 11, 큰 초성 셋(12.8pt)은 투명 글자라 없음', { skip: !existsSync(LABELS) && '49쪽 글자 작업 파일 없음' }, () => {
  const lab = JSON.parse(readFileSync(LABELS, 'utf8'));
  assert.equal(lab.countries.length, 11); assert.equal(lab.capitals.length, 11);
  assert.ok(!lab.countries.some((l) => /ㅇㅅㅌ|ㄴㅈㄹ|ㅍㅍㅇ/.test(l.text.replace(/\s/g, ''))));
  assert.ok(lab.countries.some((l) => l.text === '미크로네시아'));
});

test('출처: 52~55쪽 인쇄 출처 글이 생성물(topics·charts)에 모두 있다(공백 무시)', () => {
  const hay = (JSON.stringify(T) + JSON.stringify(C)).replace(/\s+/g, '');
  let n = 0;
  for (const [p, list] of Object.entries(CFG.expectCredits)) {
    if (!/^\d+$/.test(p)) continue;
    for (const c of list) { assert.ok(hay.includes(c.replace(/\s+/g, '')), `${p}쪽 ${c}`); n++; }
  }
  assert.equal(n, 16);
});

test('고침(overrides) 9: 깨진 글 넷(from = 원문 추출) + 묶음 이름 하나 + 잰 값 그래프 주석 둘(from null) + 하와이 블록 둘(U6-9) — 모두 까닭', () => {
  assert.deepEqual(Object.keys(OVERRIDES).sort(), ['antarcticResearch.blocks.bases-text.text', 'antarcticResearch.blocks.bases-text.title', 'antarcticResearch.layers.layer-p55-sectors.label',
    'antarcticResearch.views.bases.label', 'environment.blocks.p54-sealevel.note', 'environment.blocks.p54-temp-co2.note', 'general.blocks.hawaii-text.text', 'general.blocks.hawaii-text.title',
    'general.blocks.outline-text.text']);
  // U6-9: 하와이 블록 = 축척 막대 글자 「0 100km」 대신 틀 제목 글자, 제목은 비움(타히티 블록 꼴)
  const hw = by.general.blocks.find((b) => b.id === 'hawaii-text');
  assert.equal(hw.text, '하와이 제도'); assert.ok(!hw.title); assert.equal(OVERRIDES['general.blocks.hawaii-text.text'].from, '0 100km');
  assert.ok(!JSON.stringify(by.general.blocks).includes('100km'));
  for (const [k, o] of Object.entries(OVERRIDES)) assert.ok(o.why?.length > 20, k);
  for (const k of ['antarcticResearch.blocks.bases-text.text', 'antarcticResearch.blocks.bases-text.title', 'antarcticResearch.views.bases.label'])
    assert.equal(OVERRIDES[k].value.replace(/\s+/g, ''), OVERRIDES[k].from.replace(/\s+/g, ''), `${k}: 글자는 그대로 — 빈칸만 지움`);
  for (const k of ['environment.blocks.p54-sealevel.note', 'environment.blocks.p54-temp-co2.note', 'antarcticResearch.layers.layer-p55-sectors.label']) assert.equal(OVERRIDES[k].from, null, k);
  assert.equal(OVERRIDES['antarcticResearch.layers.layer-p55-sectors.label'].value, layerData('layer-p55-bases').properties.title);
});

test('깨진 글자 없음: 「烋」·?글리프··→h·㎢→LN·『』→|…} 가 u6 생성물에 없다', () => {
  const files = [`${D}/topics.json`, `${D}/charts.json`, 'content/atlas/u6/coloring.json', ...readdirSync(D).filter((f) => /^layer-.*\.json$/.test(f)).map((f) => `${D}/${f}`)];
  for (const f of files) {
    const s = readFileSync(f, 'utf8');
    assert.ok(!s.includes('烋'), `${f}: 烋`);
    assert.ok(!/\?[가-힣]/.test(s), `${f}: 읽지 못한 글리프`);
    assert.ok(!/[가-힣]h[가-힣]/.test(s), `${f}: · → h`);
    assert.ok(!/[가-힣]LN|\|[^"|]{1,30}\}/.test(s), `${f}: ㎢·『』 복원 오류`);
  }
  assert.ok(JSON.stringify(T).includes('토의·토론'), '55쪽 「·」 바르게');
  assert.ok(JSON.stringify(T).includes('(『이과연표』, 2023)') || JSON.stringify(C).includes('(『이과연표』, 2023)'));
});

test('main.js(U6-9): 등록 셋을 mountAtlas 전에 이 차례로(옵션 8 — 평면 5 · 지구본 · 극 둘), viewTools 는 뒤에·destroy 때 풂, 선택값 열쇠가 실제 묶음 첫 레이어', async () => {
  const src = readFileSync('sims/atlas-u6-oceania-polar/main.js', 'utf8').replace(/^\s*\/\/.*$/gm, '');
  const at = (x) => { const i = src.indexOf(x); assert.ok(i >= 0, x); return i; };
  const mount = at('mountAtlas(root');
  assert.ok(at('installExtraCharts();') < at('installAmericasExtras();') && at('installAmericasExtras();') < at('installPolarExtras();') && at('installPolarExtras();') < mount, '등록 차례');
  assert.ok(at('viewTools(root.atlasMap, root.atlasUi.tools.el)') > mount, 'viewTools 는 mountAtlas 뒤');
  assert.ok(!src.includes('globeTools'), 'globeTools 대신 viewTools(U6-3b)');
  assert.match(src, /offView\(\);\s*atlas\.destroy\(\)/);
  // centerLonOf·boundsOf 열쇠 = 그 묶음의 첫 레이어(topic.js 는 묶음 refs 중 처음 찾은 것)
  const firsts = new Set(T.flatMap((t) => layerGroups(t).map((g) => g.refs[0].ref)));
  const keys = [...src.matchAll(/'(layer-p5\d-[a-z-]+)'/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(keys)].sort(), ['layer-p53-climate', 'layer-p53-jan', 'layer-p53-jul', 'layer-p54-fta', 'layer-p54-garbage', 'layer-p54-sealevel', 'layer-p55-treaty']);
  for (const k of keys) assert.ok(firsts.has(k), `${k} 는 묶음 첫 레이어`);
  assert.match(src, /'layer-p54-garbage': 180, 'layer-p54-sealevel': 180/);
  assert.match(src, /markAt: \{ KIR: \[173\.0, 1\.42\] \}/);
  const { SIMS } = await import('../../../src/registry.js');
  assert.deepEqual(SIMS.find((x) => x.id === 'atlas-u6-oceania-polar'), { id: 'atlas-u6-oceania-polar', book: 'atlas', unit: 'Ⅵ. 오세아니아와 극지방', page: 48, title: '사회과부도 오세아니아와 극지방', kind: '지도' });
});

test('U6-9 자료: 지구본 묶음 셋 경로 view.base 자연색(교사 Q16), 해수면 지도 나라 이름 글자 없음(지명과 둘씩 보였음)', () => {
  for (const ref of ['layer-p55-route', 'layer-p55-araon-s', 'layer-p55-araon-n']) assert.deepEqual(layerData(ref).properties.view.base, 'natural', ref);
  assert.equal(layerData('layer-p54-sealevel').features.filter((f) => f.properties.type === 'label').length, 0);
  assert.ok(UNIT.layers['p54-sealevel']._labelPoints?.length === 3 && !UNIT.layers['p54-sealevel'].labelPoints);
});
