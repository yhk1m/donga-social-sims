// tests/atlas/units/u5.content.test.mjs — Ⅴ 아메리카 주제 내용 생성물(sims/atlas-u5-americas/data/topics.json·charts.json, content/atlas/u5/coloring.json) 검사 (U5-8)
//   만드는 법: python -I scripts/atlas/extract_text.py --unit u5 --labels → node scripts/atlas/coloring_quiz.mjs --unit u5 --write
//            → python -I scripts/atlas/extract_text.py --unit u5 --fill --check → node scripts/atlas/build_content.mjs --unit u5
//   단원 공통 계약(쪽·레이어·사진·그래프 ref·빈 글·조각 크기)은 tests/atlas/unitContract.test.mjs. 여기는 아메리카 고유의 수·묶음·위치·글.
import test from 'node:test'; import assert from 'node:assert/strict'; import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { countryLabels, buildColoring, splitLabels, cutCountries } from '../../../scripts/atlas/coloring_quiz.mjs';
import { makeConverter } from '../../../scripts/atlas/georef.mjs';
import { WORK } from '../../../scripts/atlas/geo_util.mjs';

const D = 'sims/atlas-u5-americas/data';
const T = JSON.parse(readFileSync(`${D}/topics.json`, 'utf8'));
const C = JSON.parse(readFileSync(`${D}/charts.json`, 'utf8'));
const UNIT = JSON.parse(readFileSync('scripts/atlas/config/u5.json', 'utf8'));
const CFG = UNIT.content;
const COLORING = JSON.parse(readFileSync('content/atlas/u5/coloring.json', 'utf8'));
const OVERRIDES = JSON.parse(readFileSync('content/atlas/u5/overrides.json', 'utf8')).items;
const PHOTOS = Object.fromEntries(JSON.parse(readFileSync('content/atlas/u5/photos.json', 'utf8')).map((p) => [p.id, p]));
const layerData = (ref) => JSON.parse(readFileSync(`${D}/${ref}.json`, 'utf8'));
const by = Object.fromEntries(T.map((t) => [t.id, t]));
const groupLabels = (t) => [...new Set(t.layers.map((l) => l.label))];
const LABELS = `${WORK}/units/u5/text/p41-labels.json`;
const km = ([l1, p1], [l2, p2]) => {
  const r = Math.PI / 180, h = Math.sin((p2 - p1) * r / 2) ** 2 + Math.cos(p1 * r) * Math.cos(p2 * r) * Math.sin((l2 - l1) * r / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
};

test('주제 10개(교사 Q1 — 일반도 셋을 나눔), 40~47쪽 모두 덮음', () => {
  assert.deepEqual(T.map((t) => t.id), ['general', 'coloring', 'north', 'south', 'relief', 'climate', 'migration', 'ethnicity', 'tnc', 'change']);
  const pages = new Set(T.flatMap((t) => t.pages)); for (let p = 40; p <= 47; p++) assert.ok(pages.has(p), `${p}쪽`);
  assert.deepEqual(T.map((t) => t.pages), [[40], [41], [42], [43], [44], [45], [46], [46], [47], [47]]);
  assert.deepEqual(T.map((t) => t.title), ['일반도', '색칠하기', '북아메리카', '남아메리카', '지형', '기후', '인구 이동과 언어', '민족 구성과 문화 혼종성', '초국적 기업', '지역 변화']);
  assert.deepEqual(T.filter((t) => t.quiz?.type === 'coloring').map((t) => t.id), ['coloring']);
});

test('개수: 지형 핀 7(번호 숨김), 기후 그래프 마커 4(번호 숨김)', () => {
  assert.equal(by.relief.markers.length, 7); assert.equal(by.relief.pinNumbers, 'hidden');
  assert.equal(by.climate.markers.length, 4); assert.equal(by.climate.pinNumbers, 'hidden');
  assert.deepEqual(by.climate.markers.map((m) => m.chart), ['p45-barrow', 'p45-newyork', 'p45-bogota', 'p45-iquitos']);
});

test('마커 위치: 기후 그래프 4곳은 그래프 도시(교과서 핀은 textbookLonlat), 지형 7은 교과서 핀 그대로', () => {
  const moved = T.flatMap((t) => t.markers).filter((m) => m.lonlatFrom === 'place').map((m) => `${m.id}:${m.place}`);
  assert.deepEqual(moved, ['c-barrow:배로', 'c-newyork:뉴욕', 'c-bogota:보고타', 'c-iquitos:이키토스']);
  for (const m of by.climate.markers) { assert.ok(m.textbookLonlat, m.id); assert.ok(km(m.lonlat, m.textbookLonlat) < 100, m.id); }
  for (const m of by.relief.markers) { assert.equal(m.lonlatFrom, 'pin', m.id); assert.deepEqual(m.lonlat, PHOTOS[m.photo.id].lonlat, m.id); }
});

test('일반도: 바로가기 「아메리카」·「중앙아메리카」(교사 Q2 — 삽입 틀을 되돌린 범위), 도법 글 둘 다 지면 그대로', () => {
  assert.deepEqual(by.general.views.map((v) => [v.id, v.label]), [['americas', '아메리카'], ['central', '중앙아메리카']]);
  assert.equal(by.general.views[0].map, 'p40-americas');
  assert.deepEqual(by.general.views[1].bounds, [-94.7, 3, -48.3, 26]);
  assert.deepEqual(by.general.layers, []);   // 레이어 없음 → topic.js 가 바로가기 단추를 보임
  const b = Object.fromEntries(by.general.blocks.map((x) => [x.id, x]));
  assert.deepEqual([b['map-text'].title, b['map-text'].text, b['map-text'].view], ['아메리카', '입체 투영 도법 1:77,000,000', 'americas']);
  assert.deepEqual([b['inset-text'].title, b['inset-text'].text, b['inset-text'].view], ['중앙아메리카', '밀러 도법 43,000,000', 'central']);   // 「1:」 없음 — 교과서 그대로(issues.md 1)
});

test('우리나라 윤곽(교사 Q3): 42쪽 같은 위도(sameLat) · 43쪽 대척점(antipode), 안내 글 = 지면 글자', () => {
  assert.deepEqual(by.north.layers.map((l) => [l.ref, l.type]), [['layer-p42-korea', 'compareOutline']]);
  assert.deepEqual(by.south.layers.map((l) => [l.ref, l.type]), [['layer-p43-korea', 'compareOutline']]);
  assert.equal(layerData('layer-p42-korea').properties.mode, 'sameLat');
  assert.equal(layerData('layer-p43-korea').properties.mode, 'antipode');
  assert.equal(by.north.blocks.find((b) => b.id === 'outline-text').text, '같은 축척과 같은 위도의 우리나라');
  assert.equal(by.south.blocks.find((b) => b.id === 'outline-text').text, '같은 축척의 우리나라와 대척점');
  assert.equal(by.north.blocks.find((b) => b.id === 'map-text').text, '람베르트 정각 원뿔 도법 1:25,000,000');
  assert.equal(by.south.blocks.find((b) => b.id === 'map-text').text, '람베르트 정적 방위 도법 1:28,000,000');
});

test('지구본 묶음(교사 §8 Q2·Q6): 인구 이동 묶음의 경로 화살표 자료가 지구본 보기(rotate = p46-migration 정사 중심)를 지님 — 주제 view 키가 아니라 pathFlow properties.view(U5-3c)', () => {
  const ref = by.migration.layers.find((l) => l.type === 'pathFlow');
  assert.equal(ref.ref, 'layer-p46-migration-flows');
  const v = layerData(ref.ref).properties.view;
  assert.equal(v.projection, 'globe'); assert.ok(Array.isArray(v.rotate)); assert.deepEqual(v.rotate, [30.3, -9.2]);
  // 식민지 면과 화살표는 한 묶음(같은 label), 캐나다는 따로
  assert.deepEqual(groupLabels(by.migration), ['아메리카 인구 이동', '캐나다의 언어 분포']);
});

test('묶음(지도 고르기)·바로가기: label 은 지면 지도 제목·범례 제목, 바로가기 ↔ 묶음(topic.js groupView — ref 가 「-<view id>」로 끝남)', () => {
  assert.deepEqual(groupLabels(by.climate), ['아메리카의 기후 구분', '1월의 평균 기온과 강수량', '7월의 평균 기온과 강수량']);
  assert.deepEqual(groupLabels(by.ethnicity), ['유럽계 인구 비율(%)', '아프리카계 인구 비율(%)', '히스패닉계 인구 비율(%)', '아시아계 인구 비율(%)', '중앙 및 남아메리카의 민족(인종) 다양성']);
  assert.deepEqual(groupLabels(by.tnc), ['세계 100대 초국적 기업의 본사 위치', '미국에 본사를 둔 농업 회사']);
  assert.deepEqual(groupLabels(by.change), ['마킬라도라 시설(2021년)']);
  for (const id of ['migration', 'ethnicity', 'tnc', 'change']) {
    const t = by[id];
    for (const v of t.views) {
      const g = t.layers.filter((l) => l.ref.endsWith(`-${v.id}`));
      assert.ok(g.length, `${id}.${v.id}`);
      if (id !== 'change') assert.equal(g[0].label, v.label, `${id}.${v.id} 이름 = 묶음 이름`);
    }
  }
  assert.ok(by.tnc.views.some((v) => v.map === 'p47-hq'), '태평양 중심 묶음: 본사 세계 지도');
  assert.ok(by.tnc.views.some((v) => v.map === 'p47-agri'), '태평양 중심 묶음: D사 세계 지도');
  for (const v of by.tnc.views) assert.ok(v.bounds[0] < 0 && v.bounds[2] > 300, `${v.id} 범위가 태평양 중심 ${v.bounds}`);
});

test('레이어 종류(U5-4 넘김): 본사·D사 기호 = symbolLabels, 실리콘 밸리 확대 창 = symbol, 미국 주·멕시코 주 = area(regionClass 자료), 고리 = chartSymbols', () => {
  const type = Object.fromEntries(T.flatMap((t) => t.layers).map((l) => [l.ref, l.type]));
  assert.deepEqual([type['layer-p47-hq'], type['layer-p47-agri-sites'], type['layer-p47-hq-sv'], type['layer-p47-agri-supply']], ['symbolLabels', 'symbolLabels', 'symbol', 'countryClass']);
  for (const k of ['european', 'african', 'hispanic', 'asian']) {
    assert.equal(type[`layer-p46-us-${k}`], 'area'); assert.equal(layerData(`layer-p46-us-${k}`).properties.layerType, 'regionClass');
  }
  assert.equal(type['layer-p47-mex-states'], 'area');
  assert.deepEqual(by.change.layers.map((l) => [l.ref, l.type]), [['layer-p47-maquila', 'unitSymbols'], ['layer-p47-mex-states', 'area']]);   // 마킬라도라 묶음 둘째 = 주 경계
  assert.equal(type['layer-p46-ethnic-rings'], 'chartSymbols');
  assert.equal(by.ethnicity.layers.find((l) => l.ref === 'layer-p46-ethnic-rings').legend, false);
  assert.deepEqual(CFG.layerTypeAs, { area: ['regionClass'], symbolLabels: ['symbol'] });
});

test('build_content layerTypeAs: 키를 빼면 주제 type ≠ 레이어 layerType 경고(u2~u4 는 키가 없어 옛 검사 그대로)', { skip: !existsSync(`${WORK}/${CFG.charts}`) && '그래프 작업 파일 없음' }, async () => {
  process.env.ATLAS_UNIT = 'u5';
  const bc = await import('../../../scripts/atlas/build_content.mjs');
  const inp = bc.loadInputs();
  assert.deepEqual(bc.buildContent(inp).warnings, []);
  const W = bc.buildContent({ ...inp, cfg: { ...inp.cfg, layerTypeAs: undefined } }).warnings;
  for (const r of ['layer-p46-us-european', 'layer-p47-hq', 'layer-p47-agri-sites', 'layer-p47-mex-states']) assert.ok(W.some((w) => w.includes(`${r}: type`)), r);
  assert.equal(W.length, 7);
});

test('그래프: 13개 모두 참조 — 고리 5는 지도 위 고리 기호 레이어가, 기후 4는 마커가, 100% 띠·디트로이트·BPO 둘은 사이드바 그래프 블록', () => {
  assert.equal(Object.keys(C).length, 13);
  const rings = layerData('layer-p46-ethnic-rings').items.map((x) => x.chart);
  assert.deepEqual(rings, ['p46-mexico', 'p46-haiti', 'p46-brazil', 'p46-peru', 'p46-argentina']);
  for (const r of rings) assert.ok(C[r]?.ring, r);
  const blocks = T.flatMap((t) => t.blocks.filter((b) => b.type === 'chart').map((b) => `${t.id}:${b.ref}`));
  assert.deepEqual(blocks, ['ethnicity:p46-us-ethnic', 'change:p47-detroit', 'change:p47-bpo-revenue', 'change:p47-bpo-jobs']);
  // 100% 띠 1990·2020 = 막대 둘(topic.js 가 barPicker 로 보임 — u2 꼴), 설명 글은 블록 글
  assert.equal(C['p46-us-ethnic'].type, 'stackedBar'); assert.deepEqual(C['p46-us-ethnic'].categories.length, 2);
  assert.match(by.ethnicity.blocks.find((b) => b.id === 'p46-us-ethnic').text, /^미국은 시간이 지남에 따라/);
  assert.match(by.change.blocks.find((b) => b.id === 'p47-bpo-revenue').text, /^미국을 비롯한 세계 각국의/);
  // 잰 값 그래프(값 글자 없음)는 블록 주석으로 밝힘(overrides — 교과서에 없는 글)
  for (const id of ['p47-detroit', 'p47-bpo-revenue', 'p47-bpo-jobs']) assert.match(by.change.blocks.find((b) => b.id === id).note, /잰 값/, id);
  // 그래프 출처는 그래프 자료 source(블록 credit 이 아님)
  assert.equal(C['p47-detroit'].source, '(미국 통계청, 2020)'); assert.equal(C['p47-bpo-jobs'].source, '(한국 콘텐츠 진흥원, 2021)');
});

test('레이어 글: 교과서 범례 제목·출처·주석(원문 상자)', () => {
  const L = Object.fromEntries(T.flatMap((t) => t.layers).map((l) => [l.ref, l]));
  assert.equal(L['layer-p45-climate'].legendTitle, '기후 구분');
  assert.equal(L['layer-p45-jan'].legendTitle, '강수량(mm)'); assert.equal(L['layer-p45-jul'].lineLegendTitle, '기온 (°C)');
  assert.equal(L['layer-p46-colonies'].legendTitle, '17세기까지의 식민지 지역');
  assert.equal(L['layer-p46-us-asian'].legendTitle, '아시아계 인구 비율(%)');
  assert.equal(L['layer-p47-hq'].legendTitle, '기업 규모 (시가 총액, 백억 달러)');
  assert.equal(L['layer-p47-maquila'].legendTitle, '마킬라도라 시설*(2021년)');
  assert.equal(L['layer-p47-maquila'].note, '*주로 미국 수출을 목적으로 수입한 부품으로 완제품을 생산하는 조립업체');
  assert.equal(L['layer-p46-ethnic'].note, '*가로 안의 숫자는 각 국가의 인구(만 명)임.');   // 교과서 그대로(issues.md 2)
  const want = {
    'layer-p45-climate': '*1991~2020년 평균 (www.gloh2o.org, 2023)', 'layer-p45-jan': '*1970~2010년 평균 (www.worldclim.org, 2023)',
    'layer-p46-colonies': '(『세계의 여러 지역 NOW』, 2023)', 'layer-p46-canada': '(캐나다 통계청, 2016)', 'layer-p46-us-european': '(미국 통계청, 2020)',
    'layer-p46-ethnic': '(『신상 지리 자료』, 2023)', 'layer-p47-hq': '(LANDGEIST 누리집, 2021)', 'layer-p47-agri-supply': '(D사 누리집, 2023)',
    'layer-p47-maquila': '(『하크 세계 지도』, 2023)',
  };
  for (const [r, c] of Object.entries(want)) assert.equal(L[r].credit, c, r);
  assert.equal(by.relief.blocks.find((b) => b.id === 'section-1').credit, '(naturalearthdata.com, 2023)');
});

test('사이드바 블록: 46쪽 활동하기 3 은 문항 전체(사진 설명은 captionOverride 로 줄인 첫 문장), 만화 카드 설명 = 소제목, 원본 쪽 부분 보기 = 지구본·만화·A사 그림', () => {
  const a3 = by.ethnicity.blocks.find((b) => b.id === 'activity-3');
  assert.equal(a3.title, '활동하기 3');
  assert.match(a3.text, /^사진은 미국 남부에서 볼 수 있는 .*많이 사용되는 이유를 생각해 보자\.$/);
  assert.equal(by.ethnicity.blocks.find((b) => b.id === 'p46-6').text, '미국 남부에서 볼 수 있는 영어와 에스파냐어로 함께 표시한 광고물이다.');
  assert.equal(by.tnc.blocks.find((b) => b.id === 'p47-1').text, by.tnc.blocks.find((b) => b.id === 'section-1').text);
  const parts = T.flatMap((t) => t.blocks.filter((b) => b.type === 'page' && b.bbox).map((b) => `${t.id}:${b.page}:${b.bbox}`));
  assert.deepEqual(parts, ['migration:46:30,75,265,222', 'tnc:47:44,95,389,305', 'tnc:47:44,366,391,500']);
  for (const t of T) assert.ok(t.blocks.some((b) => b.type === 'page' && !b.bbox && b.page === t.pages[0]), `${t.id} 쪽 전체`);
  const ph = T.flatMap((t) => t.blocks.filter((b) => b.type === 'photo').map((b) => b.photo.id));
  assert.deepEqual(ph, ['p46-1', 'p46-2', 'p46-3', 'p46-4', 'p46-5', 'p46-6', 'p47-1', 'p47-2', 'p47-3']);
  assert.equal(by.migration.blocks.find((b) => b.id === 'text-1').text.startsWith('원주민이 거주하던 아메리카에 유럽계 민족이'), true);
});

test('색칠하기(교사 Q4): 나라 35 + 지역 2(그린란드·기아나 — 수도 「—」), 카리브 작은 나라 모두, 앤티가 바부다는 이름 칸 없는 문제', () => {
  const q = by.coloring.quiz;
  assert.deepEqual(q.countries, COLORING.countries);
  const qs = q.countries, isos = qs.map((c) => c.iso);
  assert.equal(qs.filter((c) => !c.region).length, 35); assert.equal(qs.filter((c) => c.region).length, 2);
  assert.equal(new Set(isos).size, 37);
  for (const iso of ['ATG', 'KNA', 'DMA', 'LCA', 'VCT', 'BRB', 'GRD', 'TTO', 'BHS', 'JAM', 'HTI', 'DOM', 'CUB', 'BLZ', 'SLV', 'GUY', 'SUR']) assert.ok(isos.includes(iso), iso);
  assert.deepEqual(qs.filter((c) => c.region).map((c) => [c.iso, c.name, c.capital]), [['GRL', '그린란드', undefined], ['GUF', '기아나', undefined]]);
  const c = Object.fromEntries(qs.map((x) => [x.iso, x]));
  assert.deepEqual([c.ATG.label, c.ATG.name, c.ATG.capital], [null, '앤티가 바부다', '세인트존스']);
  assert.ok(!isos.includes('FRA'), '기아나는 프랑스가 아니라 GUF(교사 Q5 — cutIsos)');
  assert.deepEqual([c.VEN.name, c.VEN.label], ['베네수엘라 볼리바르', 'ㅂㄴㅅㅇㄹ ㅂㄹㅂㄹ']);
  assert.deepEqual([c.VCT.name, c.VCT.label], ['세인트빈센트 그레나딘', '세인트빈센트 그레나딘']);
  assert.deepEqual([c.USA.name, c.USA.label], ['미국', 'ㅁ ㄱ']);
  // 「도미니카 공화국」(이름 같음 → DOM)·「도미니카」(isoByLabel → DMA) 가 갈림
  assert.deepEqual([c.DOM.label, c.DOM.capital, c.DMA.label, c.DMA.capital], ['도미니카 공화국', '산토도밍고', '도미니카', '로조']);
  const from = (k) => qs.filter((x) => x.capitalFrom === k).length;
  assert.deepEqual([from('printed'), from('places'), from('places+ne')], [17, 16, 2]);
  for (const [iso, cap] of Object.entries({ HTI: '포르토프랭스', GTM: '과테말라시티', PAN: '파나마시티', SUR: '파라마리보', CRI: '산호세', JAM: '킹스턴', TTO: '포트오브스페인', KNA: '바스테르', LCA: '캐스트리스', VCT: '킹스타운', GRD: '세인트조지스', BRB: '브리지타운', USA: '워싱턴', CAN: '오타와', BRA: '브라질리아', BOL: '라파스' }))
    assert.equal(c[iso]?.capital, cap, iso);
  assert.equal(c.ATG.capitalLonlat[0] < -61 && c.ATG.capitalLonlat[1] < 18, true, '세인트존스(앤티가) — 캐나다 세인트존스가 아님');
});

test('색칠하기 41쪽 글자: 두 줄 이름 둘(joinLabels)은 쪽 흐름에서 붙어 있고 지면에서 위아래로 맞닿음, 「알래스카(미)」는 뺌', { skip: !existsSync(LABELS) && '41쪽 글자 작업 파일 없음' }, () => {
  const lab = JSON.parse(readFileSync(LABELS, 'utf8'));
  const list = lab.countries;
  assert.equal(list.length, 39); assert.equal(lab.capitals.length, 16);
  for (const [top, bottom] of CFG.coloring.joinLabels) {
    const i = list.findIndex((l, k) => l.text === top && list[k + 1]?.text === bottom);
    assert.ok(i >= 0, top);
    const A = list[i].bbox, B = list[i + 1].bbox;
    assert.ok(B[1] - A[3] > -1 && B[1] - A[3] < 4, `${top}: 세로 틈 ${B[1] - A[3]}`);
    assert.ok(Math.min(A[2], B[2]) - Math.max(A[0], B[0]) > 0.6 * (B[2] - B[0]), `${top}: 가로로 겹침`);
  }
  const W = [];
  const out = countryLabels(list, CFG.coloring, W);
  assert.deepEqual(W, []);
  assert.equal(out.length, 36);   // 39 − 두 줄 둘째 줄 2 − 알래스카 1 (+ 이름 칸 없는 앤티가 바부다 = 37)
  assert.ok(!out.some((l) => l.text.startsWith('알래스카')));
  // 붙어 나온 손글씨 수도 「포르토프랭스 산토도밍고」 → 둘(splitLabels)
  const caps = splitLabels(lab.capitals, CFG.coloring.splitLabels);
  assert.equal(caps.length, 17);
  const pp = caps.find((x) => x.text === '포르토프랭스'), sd = caps.find((x) => x.text === '산토도밍고');
  assert.ok(pp.bbox[2] <= sd.bbox[0] + 1e-9, '포르토프랭스가 왼쪽');
});

test('buildColoring u5 새 설정(있을 때만 — u2~u4 설정에 없음): dropSuffix·cutIsos·extraCountries·splitLabels·capitalAlias', () => {
  const fit = { family: 'azimuthalEquidistant', params: [0, 0], sim: { a: 100, b: 0, tx: 400, ty: 400 } };
  const cv = makeConverter(fit);
  const lab = (text, ll, w = 1) => { const [x, y] = cv.apply(ll); return { text, bbox: [x - w, y - 0.5, x + w, y + 0.5] }; };
  const sq = ([lon, lat], r = 1) => [[[lon - r, lat - r], [lon + r, lat - r], [lon + r, lat + r], [lon - r, lat + r], [lon - r, lat - r]]];
  const countries = [
    { properties: { ADM0_A3: 'AAA', NAME_KO: '가나다', NAME: 'A' }, geometry: { type: 'MultiPolygon', coordinates: [sq([0, 0]), sq([10, 0], 0.5)] } },   // 둘째 다각형 = 떼어 낼 땅
    { properties: { ADM0_A3: 'BBB', NAME_KO: '라마 연방', NAME: 'B' }, geometry: { type: 'Polygon', coordinates: sq([5, 0]) } },
  ];
  const places = [{ name: '가나다', kind: 'country', lon: 0, lat: 0 }, { name: '라마 연방', kind: 'country', lon: 5, lat: 0 }, { name: '사아', kind: 'region', lon: 10, lat: 0 },
    { name: '바사', kind: 'capital', lon: 0.2, lat: 0.2 }, { name: '자차', kind: 'capital', lon: 5.2, lat: 0.2 }];
  const run = (cfg, capitals = []) => buildColoring({
    labels: { countries: [lab('ㄱㄴㄷ', [0, 0]), lab('사아(프)', [10, 0])], capitals }, fit, places, countries, nePlaces: [],
    cfg: { countryKinds: ['country'], capitalKinds: ['capital'], nameKm: 600, nearKm: 150, ...cfg },
  });
  // 키 없음: 소속 표시가 붙은 글자는 이름을 못 찾고(옛 경고), 땅이 AAA 의 일부라 같은 나라 두 번
  const r0 = run({});
  assert.ok(r0.warnings.some((w) => w.startsWith('사아(프): 교과서 나라 지명 정하지 못함')), r0.warnings.join('|'));
  assert.ok(!r0.countries.some((c) => c.iso === 'BBB'));
  const cfg = {
    dropSuffix: '\\([^()]*\\)$', regions: { CCC: '시험' }, noCapital: { CCC: '시험' },
    cutIsos: [{ from: 'AAA', to: 'CCC', box: [9, -1, 11, 1], name: '사아' }], extraCountries: { BBB: '시험' },
  };
  const r1 = run(cfg);
  assert.deepEqual(r1.warnings, []);
  const c = Object.fromEntries(r1.countries.map((x) => [x.iso, x]));
  assert.deepEqual([c.CCC.name, c.CCC.label, c.CCC.region, c.CCC.capital], ['사아', '사아(프)', true, undefined]);
  assert.deepEqual([c.AAA.capital, c.AAA.capitalFrom], ['바사', 'places']);
  assert.deepEqual([c.BBB.name, c.BBB.label, c.BBB.capital], ['라마 연방', null, '자차']);
  // cutCountries 는 원본 feature 를 바꾸지 않고, 상자에 든 다각형이 없으면 경고
  assert.equal(countries[0].geometry.coordinates.length, 2);
  const W = []; assert.equal(cutCountries(countries, [{ from: 'AAA', to: 'CCC', box: [50, 50, 51, 51] }], W).length, 2); assert.equal(W.length, 1);
  // splitLabels + capitalAlias: 붙은 손글씨 「바사시티 자차」 → 둘, 「바사시티」는 places 「바사」 자리·이름은 손글씨 그대로
  const caps = [lab('바사시티 자차', [2.6, 0], 300)];
  const r2 = run({ ...cfg, splitLabels: { '바사시티 자차': ['바사시티', '자차'] }, capitalAlias: { 바사시티: '바사' } }, caps);
  assert.deepEqual(r2.warnings, []);
  const c2 = Object.fromEntries(r2.countries.map((x) => [x.iso, x]));
  assert.deepEqual([c2.AAA.capital, c2.AAA.capitalFrom, c2.AAA.capitalLonlat], ['바사시티', 'printed', [0.2, 0.2]]);
  assert.deepEqual([c2.BBB.capital, c2.BBB.capitalFrom], ['자차', 'printed']);
  // 별칭 없이 손글씨 「바사시티」면 places 수도 지명 없음 경고(옛 동작)
  assert.ok(run({ ...cfg, splitLabels: { '바사시티 자차': ['바사시티', '자차'] } }, caps).warnings.includes('수도 글자 바사시티: places 수도 지명 없음'));
  // 지면에 없는 splitLabels·extraCountries 중복은 경고
  assert.ok(run({ ...cfg, splitLabels: { 없음: ['가', '나'] } }).warnings.includes('splitLabels 없음: 지면에 없음'));
});

test('출처: 44~47쪽 인쇄 출처 글이 생성물(topics·charts)에 모두 있다(공백 무시)', () => {
  const hay = (JSON.stringify(T) + JSON.stringify(C)).replace(/\s+/g, '');
  let n = 0;
  for (const [p, list] of Object.entries(CFG.expectCredits)) {
    if (!/^\d+$/.test(p)) continue;
    for (const c of list) { assert.ok(hay.includes(c.replace(/\s+/g, '')), `${p}쪽 ${c}`); n++; }
  }
  assert.equal(n, 14);
});

test('고침(overrides) 5: 깨진 곡선 글 둘(from = 원문 추출) + 잰 값 그래프 주석 셋(from null) — 모두 까닭', () => {
  assert.deepEqual(Object.keys(OVERRIDES).sort(), ['change.blocks.p47-bpo-jobs.note', 'change.blocks.p47-bpo-revenue.note', 'change.blocks.p47-detroit.note', 'migration.blocks.text-1.text', 'north.blocks.outline-text.text']);
  for (const [k, o] of Object.entries(OVERRIDES)) assert.ok(o.why?.length > 20, k);
  assert.equal(OVERRIDES['migration.blocks.text-1.text'].value.replace(/\s+/g, ''), OVERRIDES['migration.blocks.text-1.text'].from.replace(/\s+/g, ''), '글자는 그대로 — 빈칸만 지움');
  for (const k of ['change.blocks.p47-bpo-jobs.note', 'change.blocks.p47-bpo-revenue.note', 'change.blocks.p47-detroit.note']) assert.equal(OVERRIDES[k].from, null, k);
});

test('깨진 글자 없음: 「烋」(’ 글꼴 코드)·?글리프··→h·㎢→LN·『』→|…} 가 u5 생성물에 없다', () => {
  const files = [`${D}/topics.json`, `${D}/charts.json`, 'content/atlas/u5/coloring.json', ...readdirSync(D).filter((f) => /^layer-.*\.json$/.test(f)).map((f) => `${D}/${f}`)];
  for (const f of files) {
    const s = readFileSync(f, 'utf8');
    assert.ok(!s.includes('烋'), `${f}: 烋`);
    assert.ok(!/\?[가-힣]/.test(s), `${f}: 읽지 못한 글리프`);
    assert.ok(!/[가-힣]h[가-힣]/.test(s), `${f}: · → h`);
    assert.ok(!/[가-힣]LN|\|[^"|]{1,30}\}/.test(s), `${f}: ㎢·『』 복원 오류`);
  }
  assert.ok(JSON.stringify(T).includes('퀘벡의 프랑스어·영어 공존'), '46쪽 「·」(계획 메모의 h 오류) 바르게');
});
