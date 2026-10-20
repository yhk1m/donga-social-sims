// tests/atlas/units/u4.content.test.mjs — Ⅳ 아프리카 주제 내용 생성물(sims/atlas-u4-africa/data/topics.json·charts.json, content/atlas/u4/coloring.json) 검사 (U4-8)
//   만드는 법: python -I scripts/atlas/extract_text.py --unit u4 --labels → node scripts/atlas/coloring_quiz.mjs --unit u4 --write
//            → python -I scripts/atlas/extract_text.py --unit u4 --fill --check → node scripts/atlas/build_content.mjs --unit u4
//   단원 공통 계약(쪽·레이어·사진·그래프 ref·빈 글·조각 크기)은 tests/atlas/unitContract.test.mjs. 여기는 아프리카 고유의 수·묶음·위치·글.
import test from 'node:test'; import assert from 'node:assert/strict'; import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { countryLabels, buildColoring } from '../../../scripts/atlas/coloring_quiz.mjs';
import { makeConverter } from '../../../scripts/atlas/georef.mjs';
import { WORK, loadFit } from '../../../scripts/atlas/geo_util.mjs';

const D = 'sims/atlas-u4-africa/data';
const T = JSON.parse(readFileSync(`${D}/topics.json`, 'utf8'));
const C = JSON.parse(readFileSync(`${D}/charts.json`, 'utf8'));
const UNIT = JSON.parse(readFileSync('scripts/atlas/config/u4.json', 'utf8'));
const CFG = UNIT.content;
const COLORING = JSON.parse(readFileSync('content/atlas/u4/coloring.json', 'utf8'));
const PHOTOS = Object.fromEntries(JSON.parse(readFileSync('content/atlas/u4/photos.json', 'utf8')).map((p) => [p.id, p]));
const by = Object.fromEntries(T.map((t) => [t.id, t]));
const groupLabels = (t) => [...new Set(t.layers.map((l) => l.label))];
const km = ([l1, p1], [l2, p2]) => {
  const r = Math.PI / 180, h = Math.sin((p2 - p1) * r / 2) ** 2 + Math.cos(p1 * r) * Math.cos(p2 * r) * Math.sin((l2 - l1) * r / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
};
const LABELS = `${WORK}/units/u4/text/p35-labels.json`;
const FIT = `${WORK}/geo/p35-coloring.fit.json`;

test('주제 8개, 34~39쪽 모두 덮음', () => {
  assert.deepEqual(T.map((t) => t.id), ['general', 'coloring', 'relief', 'climate', 'culture', 'potential', 'cooperation', 'sustainable']);
  const pages = new Set(T.flatMap((t) => t.pages)); for (let p = 34; p <= 39; p++) assert.ok(pages.has(p), `${p}쪽`);
  assert.deepEqual(T.map((t) => t.pages), [[34], [35], [36], [37], [38], [38], [39], [39]]);
});

test('개수: 지형 핀 7(번호 숨김), 기후 그래프 마커 4(번호 숨김)', () => {
  assert.equal(by.relief.markers.length, 7); assert.equal(by.relief.pinNumbers, 'hidden');
  assert.equal(by.climate.markers.length, 4);
  assert.equal(by.climate.markers.filter((m) => m.chart).length, 4); assert.equal(by.climate.pinNumbers, 'hidden');
  assert.deepEqual(by.climate.markers.map((m) => m.chart), ['p37-cairo', 'p37-kisangani', 'p37-dodoma', 'p37-capetown']);
});

test('주제도 활동(교사 답): 38·39쪽 문항 카드 2씩(첫 문항에 활동 제목) + 원본 쪽 부분 보기(U4-6 상자), 색칠 도구 없음', () => {
  const want = { potential: [38, [30, 524, 750, 692], '아프리카에 대해 우리가 지니고 있는 인식 알아보기'], sustainable: [39, [402, 499, 750, 692], '생활 속 공정 무역 조사해 보기'] };
  for (const [id, [page, bbox, title]] of Object.entries(want)) {
    const b = by[id].blocks;
    const theme = b.filter((x) => x.type === 'activity' && x.role === 'theme');
    assert.equal(theme.length, 2, id);
    assert.equal(theme[0].title, title, id); assert.equal(theme[1].title, undefined, id);
    assert.ok(theme.every((x) => x.text), id);
    assert.ok(b.some((x) => x.type === 'page' && x.page === page && JSON.stringify(x.bbox) === JSON.stringify(bbox)), id);
    assert.ok(b.some((x) => x.type === 'page' && x.page === page && !x.bbox), `${id} 쪽 전체`);
    assert.notEqual(by[id].quiz?.type, 'coloring');
  }
  // 색칠하기 도구는 35쪽 하나뿐
  assert.deepEqual(T.filter((t) => t.quiz?.type === 'coloring').map((t) => t.id), ['coloring']);
  // 38쪽 주제도 활동: 도시 사진 4 + 면적 비교 카드(교사 Q7 = 사진 카드), 39쪽: 공정 무역 사진 2 + 참고 사이트(링크 아닌 글)
  const ph = (id) => by[id].blocks.filter((x) => x.type === 'photo').map((x) => x.photo.id);
  for (const p of ['p38-7', 'p38-8', 'p38-9', 'p38-10', 'p38-11']) assert.ok(ph('potential').includes(p), p);
  for (const p of ['p39-12', 'p39-13']) assert.ok(ph('sustainable').includes(p), p);
  const link = by.sustainable.blocks.find((x) => x.role === 'link');
  assert.equal(link.title, '참고 사이트'); assert.match(link.text, /https:\/\/t25\.kr\/83sz$/);
});

test('묶음(지도 고르기)·바로가기: 기후 3 · 문화 언어/종교 · 잠재력 자원(나라 칠함 + 고리 기호 한 묶음)/태양광 · 협력 AfCFTA · 지속가능 사막화', () => {
  assert.deepEqual(groupLabels(by.climate), ['아프리카의 기후 구분', '1월의 평균 기온과 강수량', '7월의 평균 기온과 강수량']);
  assert.deepEqual(groupLabels(by.culture), ['주요 언어 분포', '주요 종교 분포']);
  assert.deepEqual(by.potential.layers.map((l) => [l.ref, l.type]), [['layer-p38-resources', 'countryClass'], ['layer-p38-resource-charts', 'chartSymbols'], ['layer-p38-solar', 'area']]);
  assert.deepEqual(groupLabels(by.potential), ['주요 자원의 생산량 비중', '아프리카의 태양광 에너지 잠재력']);
  assert.deepEqual(by.cooperation.layers.map((l) => l.ref), ['layer-p39-afcfta']);
  assert.deepEqual(by.sustainable.layers.map((l) => l.ref), ['layer-p39-desert']);
  // 바로가기 ↔ 묶음(topic.js groupView: ref 가 「-<view id>」로 끝남), 이름은 지면 지도 제목
  for (const t of [by.culture, by.potential]) for (const v of t.views) assert.ok(t.layers.some((l) => l.ref.endsWith(`-${v.id}`)), `${t.id}.${v.id}`);
  assert.deepEqual(by.culture.views.map((v) => v.label), ['주요 언어 분포', '주요 종교 분포']);
  assert.deepEqual(by.potential.views.map((v) => [v.id, v.map, v.label]), [['resources', 'p38-resources', '주요 자원의 생산량 비중'], ['solar', 'p38-solar', '아프리카의 태양광 에너지 잠재력']]);
  assert.ok(by.potential.views.some((v) => v.map === 'p38-solar'), '태양광 묶음은 태평양 중심 세계 지도');
  // 태양광 세계 지도: 범위가 태평양 중심(경도 0~360 꼴 — 동쪽 끝이 180 넘음, 중심 경도 150 은 U4-9 main.js centerLonOf)
  const sb = by.potential.views.find((v) => v.id === 'solar').bounds;
  assert.ok(sb[0] < 20 && sb[2] > 250, `태양광 범위 ${sb}`);
});

test('미확정 국경 점선(교사 Q2): 일반도·색칠하기에만, 면 레이어(선 Feature)로', () => {
  const has = T.filter((t) => t.layers.some((l) => l.ref === 'layer-ne-disputed')).map((t) => t.id);
  assert.deepEqual(has, ['general', 'coloring']);
  for (const id of has) {
    const l = by[id].layers.find((x) => x.ref === 'layer-ne-disputed');
    assert.equal(l.type, 'area'); assert.equal(l.label, '미확정 국경');
  }
  const L = JSON.parse(readFileSync(`${D}/layer-ne-disputed.json`, 'utf8'));
  assert.equal(L.properties.layerType, 'area');
  assert.ok(L.features.every((f) => f.properties.type === 'line' && f.properties.dashed));
});

test('그래프: 15개 모두 참조 — 고리 7은 지도 위 고리 기호 레이어가, 피라미드 2·원 크기 줄·AfCFTA 표는 사이드바 그래프 블록', () => {
  assert.equal(Object.keys(C).length, 15);
  const rings = JSON.parse(readFileSync(`${D}/layer-p38-resource-charts.json`, 'utf8')).items.map((x) => x.chart);
  assert.deepEqual(rings, ['p38-bauxite', 'p38-uranium', 'p38-diamond', 'p38-chromium', 'p38-cobalt', 'p38-platinum', 'p38-manganese']);
  for (const r of rings) assert.ok(C[r]?.ring, r);
  const blocks = T.flatMap((t) => t.blocks.filter((b) => b.type === 'chart').map((b) => `${t.id}:${b.ref}`));
  assert.deepEqual(blocks, ['potential:p38-pyramid-world', 'potential:p38-pyramid-africa', 'cooperation:p39-afcfta', 'sustainable:p39-greenwall']);
  // 피라미드는 한 장씩(barPicker 아님), 설명 글은 첫 블록에
  const pw = by.potential.blocks.find((b) => b.id === 'p38-pyramid-world');
  assert.match(pw.text, /유소년층 인구 비율이 가장 높은 대륙/);
  assert.equal(C['p38-pyramid-world'].subtitle, '세계(2021년)'); assert.equal(C['p38-pyramid-africa'].subtitle, '아프리카(2021년)');
});

test('레이어 글: 교과서 범례 제목·출처(원문 상자), 손으로 단 것은 고침 둘(자원 「주요 생산국」·태양광 단위)', () => {
  const L = Object.fromEntries(T.flatMap((t) => t.layers).map((l) => [l.ref, l]));
  assert.equal(L['layer-p37-climate'].legendTitle, '기후 구분');
  assert.equal(L['layer-p37-jan'].legendTitle, '강수량(mm)'); assert.equal(L['layer-p37-jan'].lineLegendTitle, '기온 (°C)');
  assert.equal(L['layer-p38-religion'].legendTitle, '지역별 종교 분포 비중');
  assert.equal(L['layer-p39-desert'].legendTitle, '사막화의 위험성');
  assert.equal(L['layer-p38-resources'].legendTitle, '주요 생산국');
  assert.equal(L['layer-p38-solar'].legendTitle, '1일당 태양광 잠재력 (kWh/kWp)');
  assert.equal(L['layer-p38-language'].legendTitle, undefined, '언어 지도는 범례 제목이 없다(교과서대로)');
  const want = {
    'layer-p37-climate': '*1991~2020년 평균 (www.gloh2o.org, 2023)', 'layer-p37-jan': '*1970~2010년 평균 (www.worldclim.org, 2023)',
    'layer-p38-language': '(wikimedia.org, 2023)', 'layer-p38-religion': '(『필립스 세계 지도』, 2021)', 'layer-p38-resources': '(『지리 데이터 파일』, 2023)',
    'layer-p38-solar': '(globalsolaratlas.info/map, 2023)', 'layer-p39-afcfta': '(AfCFTA, 2023)', 'layer-p39-desert': '(미국 농무부, 2016)',
  };
  for (const [r, c] of Object.entries(want)) assert.equal(L[r].credit, c, r);
  assert.equal(by.relief.blocks.find((b) => b.id === 'section-1').credit, '(naturalearthdata.com, 2023)');
});

test('마커 위치: 기후 그래프 4곳·킬리만자로산·테이블 마운틴(케이프타운)은 점 지명 위치(교과서 핀은 textbookLonlat), 넓이·하천 지명 사진은 교과서 핀', () => {
  const all = T.flatMap((t) => t.markers);
  const moved = all.filter((m) => m.lonlatFrom === 'place').map((m) => `${m.id}:${m.place}`).sort();
  assert.deepEqual(moved, ['c-cairo:카이로', 'c-capetown:케이프타운', 'c-dodoma:도도마', 'c-kisangani:키상가니', 'r-kilimanjaro:킬리만자로산', 'r-table-mountain:케이프타운']);
  for (const m of all) {
    if (m.lonlatFrom === 'place') assert.ok(m.textbookLonlat, m.id);
    else { assert.equal(m.lonlatFrom, 'pin', m.id); assert.deepEqual(m.lonlat, PHOTOS[m.photo.id].lonlat, m.id); }
  }
  const want = { 'c-cairo': [31.24, 30.04], 'c-kisangani': [25.19, 0.52], 'c-dodoma': [35.74, -6.17], 'c-capetown': [18.42, -33.92], 'r-kilimanjaro': [37.36, -3.07], 'r-table-mountain': [18.42, -33.96] };
  for (const [id, ll] of Object.entries(want)) { const m = all.find((x) => x.id === id); assert.ok(km(m.lonlat, ll) < 25, `${id} ${m.lonlat}`); }
  // 넓이 지명(사하라·나미브 사막, 마다가스카르)·하천(나일강)·글자 자리 지명(빅토리아 폭포)으로는 옮기지 않는다(유럽 06 교훈)
  for (const id of ['r-nile', 'r-sahara', 'r-namib', 'r-victoria-falls', 'r-tsingy']) assert.equal(all.find((x) => x.id === id).lonlatFrom, 'pin', id);
});

test('색칠하기: 나라 54 + 서사하라 「지역」 1(교사 Q1 — 수도 「—」), 소말릴란드 없음, 수도 출처', () => {
  const q = by.coloring.quiz;
  assert.equal(q.countries.length, CFG.expect.coloringCountries);
  assert.deepEqual(q.countries, COLORING.countries);
  const nations = q.countries.filter((c) => !c.region), regions = q.countries.filter((c) => c.region);
  assert.equal(nations.length, 54);
  assert.deepEqual(regions.map((c) => [c.iso, c.name, c.capital]), [['SAH', '서사하라', undefined]]);
  assert.equal(new Set(q.countries.map((x) => x.iso)).size, 55);
  const isos = q.countries.map((c) => c.iso);
  for (const iso of ['GMB', 'CPV', 'STP', 'COM', 'SYC', 'MUS', 'SWZ', 'LSO', 'DJI']) assert.ok(isos.includes(iso), iso);
  assert.ok(!isos.includes('SOL'), '소말릴란드는 소말리아 한 면(교사 Q3)');
  const c = Object.fromEntries(q.countries.map((x) => [x.iso, x]));
  assert.equal(c.COD.name, '콩고 민주 공화국'); assert.equal(c.COD.label, 'ㅋㄱ ㅁㅈ ㄱㅎㄱ');
  assert.equal(c.ZAF.name, '남아프리카 공화국'); assert.equal(c.ZAF.label, 'ㄴㅇㅍㄹㅋ ㄱㅎㄱ');
  assert.equal(c.COG.name, '콩고'); assert.equal(c.CAF.name, '중앙아프리카 공화국');
  assert.equal(c.GAB.name, '가봉'); assert.equal(c.GAB.label, '가 봉');
  const from = (k) => q.countries.filter((x) => x.capitalFrom === k).length;
  assert.deepEqual([from('printed'), from('places'), from('places+ne')], [27, 26, 1]);
  assert.deepEqual([c.MAR.capital, c.MAR.capitalFrom], ['라바트', 'places+ne']);   // 라바트는 Natural Earth 10m 모로코 면 밖(바다 2km)
  for (const [iso, cap] of Object.entries({ TUN: '튀니스', TGO: '로메', CAF: '방기', LSO: '마세루', SWZ: '음바바네', DJI: '지부티', COM: '모로니', SYC: '빅토리아', MUS: '포트루이스', CPV: '프라이아', STP: '상투메', GNB: '비사우', GMB: '반줄', COD: '킨샤사', COG: '브라자빌', ZAF: '프리토리아', TZA: '도도마' }))
    assert.equal(c[iso]?.capital, cap, iso);
});

test('색칠하기 같은 초성 「ㄱㄴ」: 기니(8.8pt, 서쪽)·가나(12.8pt, 동쪽)는 글자 자리로 갈림', () => {
  const c = Object.fromEntries(COLORING.countries.map((x) => [x.iso, x]));
  assert.equal(c.GIN.label, 'ㄱㄴ'); assert.equal(c.GHA.label, 'ㄱㄴ');
  assert.ok(c.GIN.labelLonlat[0] < -8 && c.GHA.labelLonlat[0] > -4, `${c.GIN.labelLonlat} ${c.GHA.labelLonlat}`);
  assert.deepEqual([c.GIN.capital, c.GHA.capital], ['코나크리', '아크라']);
});

test('buildColoring: 같은 초성 글자 둘은 나라 면 자리로 짝 — 면을 맞바꾸면 짝도 바뀜(이름 순서·글자 순서와 무관)', { skip: (!existsSync(FIT) || !existsSync(LABELS)) && '35쪽 fit·글자 작업 파일 없음' }, () => {
  const fit = loadFit('p35-coloring'), conv = makeConverter(fit);
  const L = JSON.parse(readFileSync(LABELS, 'utf8')).countries.filter((l) => l.text === 'ㄱㄴ');
  assert.equal(L.length, 2);
  const [a, b] = L.map((l) => conv.invert([(l.bbox[0] + l.bbox[2]) / 2, (l.bbox[1] + l.bbox[3]) / 2]));
  const sq = ([lon, lat]) => ({ type: 'Polygon', coordinates: [[[lon - 1, lat - 1], [lon + 1, lat - 1], [lon + 1, lat + 1], [lon - 1, lat + 1], [lon - 1, lat - 1]]] });
  const run = (pGin, pGha, labels = L) => buildColoring({
    labels: { countries: labels, capitals: [] }, fit, nePlaces: [],
    places: [{ name: '가나', kind: 'country', lon: 0, lat: 0 }, { name: '기니', kind: 'country', lon: 0, lat: 0 }],
    countries: [{ properties: { ADM0_A3: 'GHA', NAME_KO: '가나', NAME: 'Ghana' }, geometry: sq(pGha) }, { properties: { ADM0_A3: 'GIN', NAME_KO: '기니', NAME: 'Guinea' }, geometry: sq(pGin) }],
    cfg: { countryKinds: ['country'], capitalKinds: ['capital'], nameKm: 600, nearKm: 150, noCapital: { GIN: '시험', GHA: '시험' } },
  });
  const pick = (r) => Object.fromEntries(r.countries.map((x) => [x.labelLonlat[0] < -6 ? 'west' : 'east', x.iso]));
  const r1 = run(a, b);
  assert.deepEqual(r1.warnings, []);
  assert.deepEqual(pick(r1), { west: 'GIN', east: 'GHA' });
  assert.deepEqual(pick(run(b, a)), { west: 'GHA', east: 'GIN' });
  assert.deepEqual(pick(run(a, b, [...L].reverse())), { west: 'GIN', east: 'GHA' });
});

test('buildColoring 새 설정(있을 때만 — u2·u3 설정에 없음): regions → region:true·이름은 region 지명에서, capitalByNeNear 이면 면 밖 해안 수도는 Natural Earth 수도 가까운 places 수도(capitalByNe 만으로는 켜지지 않음 — u3 그대로, U4-9)', () => {
  const fit = { family: 'azimuthalEquidistant', params: [0, 0], sim: { a: 100, b: 0, tx: 400, ty: 400 } };
  const cv = makeConverter(fit);
  const lab = (text, ll) => { const [x, y] = cv.apply(ll); return { text, bbox: [x - 0.5, y - 0.5, x + 0.5, y + 0.5] }; };
  const sq = ([lon, lat]) => ({ type: 'Polygon', coordinates: [[[lon - 1, lat - 1], [lon + 1, lat - 1], [lon + 1, lat + 1], [lon - 1, lat + 1], [lon - 1, lat - 1]]] });
  const inp = (cfg) => buildColoring({
    labels: { countries: [lab('ㄱㄴㄷ', [0, 0]), lab('라마', [5, 0])], capitals: [] }, fit,
    places: [{ name: '가나다', kind: 'country', lon: 0, lat: 0 }, { name: '라마', kind: 'region', lon: 5, lat: 0 }, { name: '바사', kind: 'capital', lon: 1.05, lat: 0.2 }],
    countries: [{ properties: { ADM0_A3: 'AAA', NAME_KO: '가나다', NAME: 'A' }, geometry: sq([0, 0]) }, { properties: { ADM0_A3: 'BBB', NAME_KO: '라마', NAME: 'B' }, geometry: sq([5, 0]) }],
    nePlaces: [{ adm0: 'AAA', cls: 'Admin-0 capital', ll: [1.04, 0.2] }],
    cfg: { countryKinds: ['country'], capitalKinds: ['capital'], nameKm: 600, nearKm: 150, ...cfg },
  });
  const r0 = inp({});   // 옛 동작: 지역 이름은 나라 지명에 없어 경고, 면 밖 수도도 경고
  assert.ok(r0.warnings.some((w) => w.startsWith('라마: 교과서 나라 지명 정하지 못함')), r0.warnings.join('|'));
  assert.ok(r0.warnings.includes('가나다: 면 안 places 수도 없음'), r0.warnings.join('|'));
  assert.ok(r0.countries.every((c) => !('region' in c)));
  // capitalByNe 만(u3 설정 꼴)이면 면 밖 수도 길은 꺼져 옛 경고 그대로
  assert.ok(inp({ regions: { BBB: '시험' }, noCapital: { BBB: '시험' }, capitalByNe: true }).warnings.includes('가나다: 면 안 places 수도 없음'));
  const r1 = inp({ regions: { BBB: '시험' }, noCapital: { BBB: '시험' }, capitalByNe: true, capitalByNeNear: true });
  assert.deepEqual(r1.warnings, []);
  const c = Object.fromEntries(r1.countries.map((x) => [x.iso, x]));
  assert.deepEqual([c.AAA.capital, c.AAA.capitalFrom, c.AAA.region], ['바사', 'places+ne', undefined]);
  assert.deepEqual([c.BBB.name, c.BBB.region, c.BBB.capital], ['라마', true, undefined]);
  // regions 에 적은 나라가 지면 글자에 없으면 경고
  assert.ok(inp({ regions: { BBB: '시험', CCC: '없음' }, noCapital: { BBB: '시험' }, capitalByNe: true }).warnings.includes('regions CCC: 색칠하기 지도 글자에 없음'));
});

test('색칠하기 두 줄 나라 이름: joinLabels 짝은 쪽 흐름에서 붙어 있고 지면에서도 위아래로 맞닿은 두 줄', { skip: !existsSync(LABELS) && '35쪽 글자 작업 파일 없음' }, () => {
  const list = JSON.parse(readFileSync(LABELS, 'utf8')).countries;
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
  assert.equal(out.length, 55);
  assert.equal(out.filter((l) => l.text === 'ㄱㅎㄱ').length, 0, '둘째 줄 「ㄱㅎㄱ」 둘 다 앞 줄과 이어짐');
});

test('색칠하기 나라가 모두 바탕 지도 50m·10m(10a = 단원 상자로 자른 10m)에 있다 — 110m 에는 섬나라 5가 없어 확대해야 보임', { skip: !existsSync(`${WORK}/raw/ne/ne_50m_admin_0_countries.geojson`) && 'Natural Earth 없음' }, () => {
  const feats = (f) => JSON.parse(readFileSync(`${WORK}/raw/ne/${f}`, 'utf8')).features;
  const iso = (f) => new Set(feats(f).map((x) => x.properties.ADM0_A3));
  const q = by.coloring.quiz.countries.map((x) => x.iso);
  assert.deepEqual(q.filter((i) => !iso('ne_50m_admin_0_countries.geojson').has(i)), []);
  assert.deepEqual(q.filter((i) => !iso('ne_110m_admin_0_countries.geojson').has(i)).sort(), ['COM', 'CPV', 'MUS', 'STP', 'SYC']);
  const [w, s, e, n] = UNIT.basemap.unitBoxes[0];
  const n10 = new Map(feats('ne_10m_admin_0_countries.geojson').map((f) => [f.properties.ADM0_A3, f]));
  for (const i of q) {
    const f = n10.get(i); assert.ok(f, `10m ${i}`);
    const pts = JSON.stringify(f.geometry.coordinates).match(/-?\d+(\.\d+)?,-?\d+(\.\d+)?/g).map((p) => p.split(',').map(Number));
    assert.ok(pts.some(([x, y]) => x >= w && x <= e && y >= s && y <= n), `10a 상자 안에 ${i} 없음`);
  }
});

test('출처: 34~39쪽 인쇄 출처 글이 생성물(topics·charts)에 모두 있다(공백 무시)', () => {
  const hay = (JSON.stringify(T) + JSON.stringify(C)).replace(/\s+/g, '');
  let n = 0;
  for (const [p, list] of Object.entries(CFG.expectCredits)) {
    if (!/^\d+$/.test(p)) continue;
    for (const c of list) { assert.ok(hay.includes(c.replace(/\s+/g, '')), `${p}쪽 ${c}`); n++; }
  }
  assert.equal(n, 14);
});

test('깨진 글자 없음: 「烋」(’ 글꼴 코드)·?글리프··→h·℃→?·㎢→LN·『』→|…} 가 u4 생성물에 없다', () => {
  const files = [`${D}/topics.json`, `${D}/charts.json`, 'content/atlas/u4/coloring.json', ...readdirSync(D).filter((f) => /^layer-.*\.json$/.test(f)).map((f) => `${D}/${f}`)];
  for (const f of files) {
    const s = readFileSync(f, 'utf8');
    assert.ok(!s.includes('烋'), `${f}: 烋`);
    assert.ok(!/\?[가-힣]/.test(s), `${f}: 읽지 못한 글리프`);
    assert.ok(!/[가-힣]h[가-힣]/.test(s), `${f}: · → h`);
    assert.ok(!/[가-힣]LN|\|[^"|]{1,30}\}/.test(s), `${f}: ㎢·『』 복원 오류`);
  }
  // ‘ ’ 짝(지면 그대로)·가운뎃점·물결표
  const s = JSON.stringify(T);
  assert.equal((s.match(/‘/g) || []).length, (s.match(/’/g) || []).length);
  assert.match(by.coloring.blocks.find((b) => b.id === 'text-1').text, /중·남부 아프리카/);
  assert.match(by.sustainable.blocks.find((b) => b.id === 'p39-greenwall').text, /‘그레이트 그린 월 프로젝트’/);
});

test('사람이 고친 글(overrides)은 둘: 자원 범례 제목 「주요 생산국」·태양광 범례 제목(그림 글자) — 둘 다 칸이 없던 것(from null)', () => {
  const o = JSON.parse(readFileSync('content/atlas/u4/overrides.json', 'utf8')).items;
  assert.deepEqual(Object.keys(o).sort(), ['potential.layers.layer-p38-resources.legendTitle', 'potential.layers.layer-p38-solar.legendTitle']);
  for (const v of Object.values(o)) { assert.equal(v.from, null); assert.ok(v.why); }
});
