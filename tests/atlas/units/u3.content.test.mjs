// tests/atlas/units/u3.content.test.mjs — Ⅲ 유럽 주제 내용 생성물(sims/atlas-u3-europe/data/topics.json·charts.json, content/atlas/u3/coloring.json) 검사 (U3-8)
//   만드는 법: python -I scripts/atlas/extract_text.py --unit u3 --labels → node scripts/atlas/coloring_quiz.mjs --unit u3 --write
//            → python -I scripts/atlas/extract_text.py --unit u3 --fill --check → node scripts/atlas/build_content.mjs --unit u3
//   단원 공통 계약(쪽·레이어·사진·그래프 ref·빈 글)은 tests/atlas/unitContract.test.mjs. 여기는 유럽 고유의 수·묶음·위치·글.
import test from 'node:test'; import assert from 'node:assert/strict'; import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { countryLabels } from '../../../scripts/atlas/coloring_quiz.mjs';
import { WORK } from '../../../scripts/atlas/geo_util.mjs';

const D = 'sims/atlas-u3-europe/data';
const T = JSON.parse(readFileSync(`${D}/topics.json`, 'utf8'));
const C = JSON.parse(readFileSync(`${D}/charts.json`, 'utf8'));
const CFG = JSON.parse(readFileSync('scripts/atlas/config/u3.json', 'utf8')).content;
const PHOTOS = Object.fromEntries(JSON.parse(readFileSync('content/atlas/u3/photos.json', 'utf8')).map((p) => [p.id, p]));
const by = Object.fromEntries(T.map((t) => [t.id, t]));
const groupLabels = (t) => [...new Set(t.layers.map((l) => l.label))];
const km = ([l1, p1], [l2, p2]) => {
  const r = Math.PI / 180, h = Math.sin((p2 - p1) * r / 2) ** 2 + Math.cos(p1 * r) * Math.cos(p2 * r) * Math.sin((l2 - l1) * r / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
};

test('주제 8개, 26~33쪽 모두 덮음', () => {
  assert.deepEqual(T.map((t) => t.id), ['general', 'coloring', 'relief', 'climate', 'cities', 'sustainable', 'integration', 'feature']);
  const pages = new Set(T.flatMap((t) => t.pages)); for (let p = 26; p <= 33; p++) assert.ok(pages.has(p), `${p}쪽`);
});

test('개수: 지형 핀 7(번호 숨김), 기후 그래프 마커 4(번호 숨김), 특집 핀 12(번호 01~11, 07 이 둘)', () => {
  assert.equal(by.relief.markers.length, 7); assert.equal(by.relief.pinNumbers, 'hidden');
  assert.equal(by.climate.markers.filter((m) => m.chart).length, 4); assert.equal(by.climate.pinNumbers, 'hidden');
  // 계획의 「특집 핀 11」은 번호 수 — 위치도에 07 이 둘(독일·이탈리아 동전 p33-07a·07b)이라 마커는 12(실행 중 결정 U3-8)
  assert.equal(by.feature.markers.length, 12);
  assert.equal(by.feature.pinNumbers, undefined);
  assert.deepEqual(by.feature.markers.map((m) => m.photo.pin), [1, 2, 3, 4, 5, 6, 7, 7, 8, 9, 10, 11]);
});

test('특집: 퀴즈 없음, 마커 제목 = 사진 굵은 제목(07 동전 둘은 07 사진의 제목), 글 = 사진 설명(동전은 동전 설명)', () => {
  assert.equal(by.feature.quiz, null);
  for (const m of by.feature.markers) {
    const p = PHOTOS[m.photo.id];
    if (p.title) { assert.equal(m.title, p.title, m.id); assert.equal(m.text, p.caption, m.id); }
    else { assert.equal(m.title, PHOTOS['p33-07'].title, m.id); assert.equal(m.text, p.caption, m.id); }
  }
  assert.ok(by.feature.blocks.some((b) => b.type === 'photo' && b.photo.id === 'p33-07'), '07 큰 사진(핀 없음)은 사진 블록');
});

test('묶음(지도 고르기): 기후 = 구분·1월·7월, 도시 = 도시화율 + 도시 분포 한 지도, 지속가능 = 녹색 수도·리스본, 통합 = EU·분리 독립·벨기에·이탈리아', () => {
  assert.deepEqual(groupLabels(by.climate), ['유럽의 기후 구분', '1월 평균 기온과 강수량', '7월 평균 기온과 강수량']);
  assert.deepEqual(by.cities.layers.map((l) => l.ref), ['layer-p30-urban', 'layer-p30-cities']);
  assert.equal(groupLabels(by.cities).length, 1);
  assert.deepEqual(by.sustainable.layers.map((l) => l.ref), ['layer-p31-green-capital', 'layer-p31-lisbon']);
  assert.equal(groupLabels(by.sustainable).length, 2);
  assert.deepEqual(by.integration.layers.map((l) => l.ref), ['layer-p32-eu', 'layer-p32-separatism', 'layer-p32-belgium', 'layer-p32-italy']);
  assert.equal(groupLabels(by.integration).length, 4);
  // 묶음마다 바로가기(view)가 있으면 그 범위로 맞춘다(topic.js groupView: ref 가 「-<view id>」로 끝남)
  for (const t of [by.sustainable, by.integration]) for (const l of t.layers) assert.ok(t.views.some((v) => l.ref.endsWith(`-${v.id}`)), l.ref);
  const v = Object.fromEntries(by.integration.views.map((x) => [x.id, x.bounds]));
  assert.ok(v.belgium[0] > 2 && v.belgium[2] < 7 && v.belgium[1] > 49 && v.belgium[3] < 52, `벨기에 ${v.belgium}`);
  assert.ok(v.italy[0] > 5 && v.italy[2] < 22 && v.italy[1] > 35 && v.italy[3] < 48, `이탈리아 ${v.italy}`);
});

test('레이어 글: 교과서 범례 제목·출처(원문 상자에서)', () => {
  const L = Object.fromEntries(T.flatMap((t) => t.layers).map((l) => [l.ref, l]));
  assert.equal(L['layer-p29-climate'].legendTitle, '기후 구분');
  assert.equal(L['layer-p29-jan'].lineLegendTitle, '기온 (°C)');
  assert.equal(L['layer-p30-urban'].legendTitle, '도시화율 (2020년, %)');
  assert.equal(L['layer-p30-cities'].legendTitle, '도시 인구 (2020년, 만 명)');
  assert.equal(L['layer-p32-italy'].legendTitle, '주별 1인당 지역 내 총생산(달러)');
  assert.equal(L['layer-p32-eu'].type, 'countryClass');
  for (const r of ['layer-p29-climate', 'layer-p30-urban', 'layer-p31-green-capital', 'layer-p31-lisbon', 'layer-p32-eu', 'layer-p32-separatism', 'layer-p32-belgium', 'layer-p32-italy'])
    assert.ok(L[r].credit, `${r} 출처`);
});

test('마커 위치: 기후 그래프 3곳·특집 04·06·07·09·베수비오산은 지명 위치(교과서 핀은 textbookLonlat), 나머지는 교과서 핀', () => {
  const all = T.flatMap((t) => t.markers);
  const moved = all.filter((m) => m.lonlatFrom === 'place').map((m) => m.id).sort();
  assert.deepEqual(moved, ['c-lisbon', 'c-moscow', 'c-paris', 'f04', 'f06', 'f07a', 'f07b', 'f09', 'r-vesuvius']);
  for (const m of all) {
    if (m.lonlatFrom === 'place') assert.ok(m.textbookLonlat, m.id);
    else { assert.equal(m.lonlatFrom, 'pin', m.id); assert.deepEqual(m.lonlat, PHOTOS[m.photo.id].lonlat, m.id); }
  }
  const want = { 'c-paris': [2.35, 48.86], 'c-moscow': [37.62, 55.75], f04: [4.35, 50.85], f07a: [13.4, 52.52], f07b: [12.5, 41.9], f09: [14.42, 50.09], 'r-vesuvius': [14.43, 40.82] };
  for (const [id, ll] of Object.entries(want)) { const m = all.find((x) => x.id === id); assert.ok(km(m.lonlat, ll) < 20, `${id} ${m.lonlat}`); }
  // 그레니비크(아이슬란드 삽입 핀)는 아이슬란드 북부
  const g = by.climate.markers.find((m) => m.id === 'c-grenivik').lonlat;
  assert.ok(g[0] > -20 && g[0] < -16 && g[1] > 65 && g[1] < 67, `${g}`);
});

test('색칠하기: 나라 46(27쪽 나라 글자 48 − 「(러)」 − 두 줄 보스니아 헤르체고비나), 작은 나라·수도', () => {
  const q = by.coloring.quiz;
  assert.equal(q.countries.length, CFG.expect.coloringCountries);
  assert.equal(q.countries.length, 46);
  const c = Object.fromEntries(q.countries.map((x) => [x.iso, x]));
  assert.equal(new Set(q.countries.map((x) => x.iso)).size, 46);
  assert.equal(c.BIH.name, '보스니아 헤르체고비나');
  for (const [iso, cap] of Object.entries({ LIE: '파두츠', MCO: '모나코', SMR: '산마리노', AND: '안도라라베야', MLT: '발레타', LUX: '룩셈부르크', CYP: '니코시아', FRA: '파리', AUT: '빈' }))
    assert.equal(c[iso]?.capital, cap, iso);
  assert.ok(c.VAT && c.VAT.capital === undefined, '바티칸: 나라는 있고 수도 이름은 없음(noCapital)');
  assert.ok(!c.RUS.label.includes('('), '「(러)」는 나라 글자가 아님');
});

test('색칠하기 나라가 모두 바탕 지도 50m 에 있다(110m 에는 작은 나라 6 이 없어 확대해야 보임)', { skip: !existsSync(`${WORK}/raw/ne/ne_50m_admin_0_countries.geojson`) && 'Natural Earth 없음' }, () => {
  const iso = (f) => new Set(JSON.parse(readFileSync(`${WORK}/raw/ne/${f}`, 'utf8')).features.map((x) => x.properties.ADM0_A3));
  const n50 = iso('ne_50m_admin_0_countries.geojson'), n110 = iso('ne_110m_admin_0_countries.geojson');
  const q = by.coloring.quiz.countries.map((x) => x.iso);
  assert.deepEqual(q.filter((i) => !n50.has(i)), []);
  assert.deepEqual(q.filter((i) => !n110.has(i)).sort(), ['AND', 'LIE', 'MCO', 'MLT', 'SMR', 'VAT']);
});

test('coloring_quiz countryLabels: 설정 없으면 그대로, ignoreLabels 빼고 joinLabels 잇기(상자 합침)', () => {
  const L = [{ text: 'ㄱ', bbox: [0, 0, 1, 1] }, { text: '(러)', bbox: [0, 0, 1, 1] }, { text: '보스니아', bbox: [10, 10, 20, 12] }, { text: '헤르체고비나', bbox: [8, 12, 24, 14] }];
  assert.deepEqual(countryLabels(L, {}), L);
  const W = [];
  const out = countryLabels(L, { ignoreLabels: ['(러)'], joinLabels: [['보스니아', '헤르체고비나']] }, W);
  assert.deepEqual(out, [L[0], { text: '보스니아 헤르체고비나', bbox: [8, 10, 24, 14] }]);
  assert.deepEqual(W, []);
  countryLabels(L, { ignoreLabels: ['없음'], joinLabels: [['헤르체고비나', '보스니아']] }, W);
  assert.equal(W.length, 2);
});

test('출처: 26~33쪽 인쇄 출처 글이 생성물(topics·charts)에 모두 있다(공백 무시)', () => {
  const hay = (JSON.stringify(T) + JSON.stringify(C)).replace(/\s+/g, '');
  for (const [p, list] of Object.entries(CFG.expectCredits)) {
    if (!/^\d+$/.test(p)) continue;
    for (const c of list) assert.ok(hay.includes(c.replace(/\s+/g, '')), `${p}쪽 ${c}`);
  }
});

test('깨진 글자 없음: 「烋」(’ 글꼴 코드)·?글리프··→h·℃→?·㎢→LN·『』→|…} 가 u3 생성물에 없다', () => {
  const files = [`${D}/topics.json`, `${D}/charts.json`, 'content/atlas/u3/coloring.json', ...readdirSync(D).filter((f) => /^layer-.*\.json$/.test(f)).map((f) => `${D}/${f}`)];
  for (const f of files) {
    const s = readFileSync(f, 'utf8');
    assert.ok(!s.includes('烋'), `${f}: 烋`);
    assert.ok(!/\?[가-힣]/.test(s), `${f}: 읽지 못한 글리프`);
    assert.ok(!/[가-힣]h[가-힣]/.test(s), `${f}: · → h`);
    assert.ok(!/[가-힣]LN|\|[^"|]{1,30}\}/.test(s), `${f}: ㎢·『』 복원 오류`);
  }
  // 31쪽 녹색 수도 글의 ’ 는 사진 설명 바로잡기(captionOverride)로 들어 있다
  const gc = by.sustainable.blocks.find((b) => b.id === 'p31-6');
  assert.match(gc.text, /‘녹색 수도’라는/);
});

test('사람이 고친 글(overrides)은 둘: 26쪽 제목 글자 사이 공백, 31쪽 리스본 「자 동차」', () => {
  const o = JSON.parse(readFileSync('content/atlas/u3/overrides.json', 'utf8')).items;
  assert.deepEqual(Object.keys(o).sort(), ['general.blocks.map-text.title', 'sustainable.blocks.lisbon-text.text']);
  assert.equal(by.general.blocks.find((b) => b.id === 'map-text').title, '유럽');
  assert.ok(!by.sustainable.blocks.find((b) => b.id === 'lisbon-text').text.includes('자 동차'));
});
