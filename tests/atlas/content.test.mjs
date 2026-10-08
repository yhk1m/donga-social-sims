// © 2026 김용현
// tests/atlas/content.test.mjs — 주제 내용(build_content.mjs 생성물 sims/atlas-u2-asia/data/topics.json·charts.json·layers.js) 검사
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { applyOverrides, parseKey, buildContent, loadInputs, layersModule } from '../../scripts/atlas/build_content.mjs';
import { km, key, WORK } from '../../scripts/atlas/geo_util.mjs';

const DIR = 'sims/atlas-u2-asia/data';
const T = JSON.parse(readFileSync(`${DIR}/topics.json`, 'utf8'));
const C = JSON.parse(readFileSync(`${DIR}/charts.json`, 'utf8'));
const by = Object.fromEntries(T.map((t) => [t.id, t]));
const CFG = JSON.parse(readFileSync('scripts/atlas/config/u2.json', 'utf8')).content;

test('주제 8개, 쪽 16~25 모두 덮음', () => {
  assert.deepEqual(T.map((t) => t.id), ['general', 'coloring', 'relief', 'climate', 'religion', 'population', 'industry', 'heritage']);
  const pages = new Set(T.flatMap((t) => t.pages)); for (let p = 16; p <= 25; p++) assert.ok(pages.has(p), `${p}쪽`);
});

test('개수: 지형 핀 7, 기후 그래프 마커 4, 세계유산 11 (C3·C4 실측)', () => {
  assert.equal(by.relief.markers.length, 7);
  assert.equal(by.climate.markers.filter((m) => m.chart).length, 4);
  assert.equal(by.heritage.markers.length, 11);
});

test('빈 글 없음, 참조한 레이어·사진·그래프가 모두 있음', () => {
  for (const t of T) {
    for (const l of t.layers) assert.ok(existsSync(`${DIR}/${l.ref}.json`), l.ref);
    for (const m of t.markers) { assert.ok(m.title && m.text, m.id); if (m.photo) assert.ok(existsSync(`docs/assets/atlas/u2/photo/${m.photo.id}.jpg`), m.photo.id); }
  }
});

// 모든 글 칸(title·text·note·credit·label·caption)이 비어 있지 않다 + 원본 표기(src·…Src·why)는 생성물에 남지 않는다
function* strings(o, path = '') {
  if (Array.isArray(o)) { for (let i = 0; i < o.length; i++) yield* strings(o[i], `${path}[${i}]`); return; }
  if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) {
    if (typeof v === 'string') yield [`${path}.${k}`, k, v]; else yield* strings(v, `${path}.${k}`);
  }
}
test('글 칸이 비어 있지 않고 원본 표기·깨진 글자가 없다', () => {
  for (const [p, k, v] of strings(T)) {
    if (['title', 'text', 'note', 'credit', 'label', 'caption', 'name', 'capital'].includes(k)) assert.ok(v.trim().length > 0, p);
    assert.ok(!/\uFFFD/.test(v), `${p}: 깨진 글자`);
    assert.ok(!/\?[가-힣]/.test(v), `${p}: 읽지 못한 글리프(?)`);
  }
  const keys = JSON.stringify(T);
  assert.ok(!/"src"|Src"|"why"|"_[a-z]/.test(keys), '원본 표기가 생성물에 남음');
});

test('블록 종류별 필수 칸과 참조', () => {
  const types = new Set(['text', 'activity', 'card', 'chart', 'photo', 'page']);
  for (const t of T) for (const [i, b] of t.blocks.entries()) {
    const at = `${t.id}.blocks[${i}]`;
    assert.ok(types.has(b.type), `${at}: 모르는 종류 ${b.type}`);
    if (b.type === 'text' || b.type === 'activity') assert.ok(b.text, at);
    if (b.type === 'card') assert.ok(b.title && b.text, at);
    if (b.type === 'chart') assert.ok(C[b.ref], `${at}: 그래프 ${b.ref}`);
    for (const r of b.charts ?? (b.chart ? [b.chart] : [])) assert.ok(C[r], `${at}: 그래프 ${r}`);
    if (b.type === 'photo' || b.photo) { const ph = b.photo ?? b; assert.ok(existsSync(`docs/assets/atlas/u2/photo/${ph.id}.jpg`), at); assert.match(ph.url, /^https:\/\//); }
    if (b.type === 'page') {
      assert.ok(t.pages.includes(b.page), `${at}: 주제 쪽 밖 ${b.page}`);
      assert.ok(existsSync(`docs/assets/atlas/u2/page/p${String(b.page).padStart(3, '0')}.jpg`), at);
      assert.match(b.url, /^https:\/\/.*\/page\/p0\d\d\.jpg$/);
    }
    if (b.view) assert.ok((t.views ?? []).some((v) => v.id === b.view), `${at}: 없는 보기 ${b.view}`);
  }
  // 주제마다 원본 쪽 보기가 쪽마다 하나씩
  for (const t of T) for (const p of t.pages) assert.ok(t.blocks.some((b) => b.type === 'page' && b.page === p && !b.bbox), `${t.id} ${p}쪽 원본 쪽 보기`);
});

test('그래프: 생성물 charts.json = 그래프 17개, 모두 어딘가에서 참조', () => {
  assert.equal(Object.keys(C).length, 17);
  const used = new Set();
  for (const t of T) {
    for (const m of t.markers) if (m.chart) used.add(m.chart);
    for (const b of t.blocks) { if (b.type === 'chart') used.add(b.ref); for (const r of b.charts ?? (b.chart ? [b.chart] : [])) used.add(r); }
  }
  assert.deepEqual([...used].sort(), Object.keys(C).sort());
  for (const [id, c] of Object.entries(C)) assert.equal(c.id, id);
});

test('레이어: 종류가 레이어 파일과 같고, 위치 근사·카슈미르 표시', () => {
  for (const t of T) for (const l of t.layers) {
    const gj = JSON.parse(readFileSync(`${DIR}/${l.ref}.json`, 'utf8'));
    assert.equal(l.type, gj.properties?.layerType ?? (gj.url ? 'image' : null), l.ref);
    assert.equal(!!l.approx, !!gj.properties?.approx, `${l.ref} approx`);
    assert.ok(l.label, `${l.ref} label`);
  }
  const sg = by.religion.layers.find((l) => l.ref === 'layer-p22-singapore');
  assert.equal(sg.approx, true); assert.equal(sg.approxNote, '위치 근사');
  assert.equal(by.religion.layers.find((l) => l.ref === 'layer-p22-kashmir').note, '위치: 실제 경계 자료(Natural Earth)');
});

test('마커: 경위도·보기 범위가 정상, 지형 핀(위치 근사 지도)에는 approx', () => {
  const ok = ([lon, lat]) => Number.isFinite(lon) && Number.isFinite(lat) && lon >= -180 && lon <= 180 && lat >= -90 && lat <= 90;
  for (const t of T) {
    assert.ok(ok(t.view.center), `${t.id} view`); assert.equal(t.view.bounds.length, 4);
    for (const v of t.views ?? []) assert.ok(ok(v.center) && v.bounds[0] < v.bounds[2] && v.bounds[1] < v.bounds[3], `${t.id}.${v.id}`);
    for (const m of t.markers) {
      assert.ok(ok(m.lonlat), m.id);
      assert.ok(['pin', 'place', 'source'].includes(m.lonlatFrom), `${m.id} ${m.lonlatFrom}`);
      // 마커 경위도는 같은 주제 보기 범위 안
      const [w, s, e, n] = t.view.bounds;
      assert.ok(m.lonlat[0] >= w && m.lonlat[0] <= e && m.lonlat[1] >= s && m.lonlat[1] <= n, `${m.id} 보기 범위 밖`);
    }
  }
  for (const m of by.relief.markers) if (m.lonlatFrom === 'pin') assert.equal(m.approx, true, m.id);
  // 교과서 위치도 핀에서 옮긴 마커는 핀 위치를 남긴다
  for (const t of T) for (const m of t.markers) if (m.lonlatFrom !== 'pin' && m.photo?.pin) assert.ok(m.textbookLonlat, m.id);
});

test('기후 마커: 도시 위치(지명)와 그래프 도시가 같다', () => {
  for (const m of by.climate.markers) {
    assert.equal(m.lonlatFrom, 'place');
    assert.ok(C[m.chart].title.startsWith(m.place), `${m.id}: ${m.place} ↔ ${C[m.chart].title}`);
  }
});

test('세계유산: 실제 위치 출처(UNESCO)·교과서 핀 위치·국가와 종교 정답', () => {
  const answerKey = by.heritage.quiz.answerKey;
  for (const m of by.heritage.markers) {
    assert.equal(m.lonlatFrom, 'source');
    assert.match(m.source.url, /^https:\/\/whc\.unesco\.org\/en\/list\/\d+\/$/, m.id);
    assert.equal(m.textbookLonlat.length, 2, m.id);
    assert.ok(km(m.lonlat, m.textbookLonlat) < 600, `${m.id}: 교과서 핀과 ${km(m.lonlat, m.textbookLonlat).toFixed(0)}km`);
    assert.ok(m.quiz.country && m.quiz.religions.length, m.id);
    const expect = `${m.quiz.country}${m.quiz.religions.join(',')}`;
    if (m.quiz.answerFrom === 'p25') assert.equal(key(m.quiz.answer), expect, m.id);   // 25쪽 인쇄 정답(공백 무시)
    else assert.ok(key(answerKey).includes(key(`${m.quiz.country}, ${m.quiz.religions.join(', ')}`)), `${m.id}: 112쪽 정답에 없음`);
  }
  assert.equal(by.heritage.quiz.type, 'heritage');
});

test('색칠하기: 17쪽 나라 46개, Natural Earth 나라 코드·교과서 이름·수도', () => {
  const q = by.coloring.quiz;
  assert.equal(q.type, 'coloring');
  assert.equal(q.countries.length, 46);
  assert.equal(new Set(q.countries.map((c) => c.iso)).size, 46);
  const places = JSON.parse(readFileSync(`${DIR}/places.json`, 'utf8'));
  const countryNames = new Set(places.filter((p) => p.kind === 'country').map((p) => key(p.name)));
  const capitalNames = new Set(places.filter((p) => p.kind === 'capital').map((p) => key(p.name)));
  for (const c of q.countries) {
    assert.ok(countryNames.has(key(c.name)), `${c.name}: 교과서 나라 지명 아님`);
    assert.ok(capitalNames.has(key(c.capital)), `${c.name}: 수도 ${c.capital}`);
    assert.match(c.iso, /^[A-Z0-9]{3}$/);
  }
  const ne = `${WORK}/${CFG.coloring.neCountries}`;
  if (!existsSync(ne)) return;   // Natural Earth 파일이 없으면 코드 대조는 건너뜀
  const codes = new Set(JSON.parse(readFileSync(ne, 'utf8')).features.map((f) => f.properties.ADM0_A3));
  for (const c of q.countries) assert.ok(codes.has(c.iso), `${c.name}: ${c.iso}`);
});

test('overrides: 키 읽기·적용·없는 대상과 낡은 값은 오류', () => {
  assert.deepEqual(parseKey('relief.r-gobi.text'), { topic: 'relief', path: [{ marker: 'r-gobi' }, 'text'] });
  assert.deepEqual(parseKey('general.blocks[0].title'), { topic: 'general', path: ['blocks', 0, 'title'] });
  assert.deepEqual(parseKey('heritage.quiz.answerKey'), { topic: 'heritage', path: ['quiz', 'answerKey'] });
  assert.deepEqual(parseKey('climate.layers[1].label'), { topic: 'climate', path: ['layers', 1, 'label'] });
  const topics = [{ id: 'a', markers: [{ id: 'm1', text: 'x' }], blocks: [{ title: '가 나' }] }];
  const out = applyOverrides(topics, { 'a.m1.text': { value: 'y', from: 'x' }, 'a.blocks[0].title': { value: '가나', from: '가 나' } });
  assert.equal(out[0].markers[0].text, 'y'); assert.equal(out[0].blocks[0].title, '가나');
  assert.equal(topics[0].markers[0].text, 'x', '입력은 그대로');
  assert.throws(() => applyOverrides(topics, { 'a.m9.text': { value: 'y' } }), /m9/);
  assert.throws(() => applyOverrides(topics, { 'b.blocks[0].title': { value: 'y' } }), /b/);
  assert.throws(() => applyOverrides(topics, { 'a.blocks[3].title': { value: 'y' } }), /blocks\[3\]/);
  assert.throws(() => applyOverrides(topics, { 'a.m1.text': { value: 'y', from: 'z' } }), /낡은/);
});

test('실제 overrides.json 의 키가 모두 풀리고, 생성물에 반영됨', () => {
  const ov = JSON.parse(readFileSync('content/atlas/u2/overrides.json', 'utf8')).items;
  const src = JSON.parse(readFileSync('content/atlas/u2/topics.json', 'utf8'));
  applyOverrides(src, ov);   // 던지지 않음
  for (const [k, o] of Object.entries(ov)) {
    const { topic, path } = parseKey(k);
    let node = by[topic];
    for (const p of path) node = p.marker ? node.markers.find((m) => m.id === p.marker) : node[p];
    assert.equal(node, o.value, k);
  }
});

test('layers.js: 참조한 레이어만 정적 import, fetch 없음', () => {
  const js = readFileSync(`${DIR}/layers.js`, 'utf8');
  const refs = [...new Set(T.flatMap((t) => t.layers.map((l) => l.ref)))].sort();
  const imported = [...js.matchAll(/^import \w+ from '\.\/([\w-]+)\.json';$/gm)].map((m) => m[1]).sort();
  assert.deepEqual(imported, refs);
  for (const r of refs) assert.ok(js.includes(`'${r}': `), r);
  assert.ok(!/\bfetch\s*\(|\bimport\s*\(/.test(js));
  assert.equal(layersModule(refs), js);
});

test('다시 만들어도 생성물이 바이트까지 같다', () => {
  const inp = loadInputs();
  const a = buildContent(inp), b = buildContent(loadInputs());
  assert.deepEqual(a.warnings, []);
  assert.equal(JSON.stringify(a.topics), JSON.stringify(b.topics));
  assert.equal(JSON.stringify(a.topics), readFileSync(`${DIR}/topics.json`, 'utf8').trimEnd());
  assert.equal(JSON.stringify(a.charts), readFileSync(`${DIR}/charts.json`, 'utf8').trimEnd());
});

test('16~25쪽에 인쇄된 출처 글이 모두 주제 자료(topics·charts)에 있다', () => {
  const hay = key(JSON.stringify(T) + JSON.stringify(C)).replace(/\\"/g, '"');
  for (const [p, list] of Object.entries(CFG.expectCredits)) {
    if (!/^\d+$/.test(p)) continue;
    for (const c of list) assert.ok(hay.includes(key(c)), `${p}쪽 출처 ${c}`);
  }
  // 싱가포르 공휴일 달력 출처는 그 블록에
  const sg = by.religion.blocks.find((b) => b.role === 'subtitle' && b.view === 'singapore');
  assert.equal(sg.credit, '(Public Holidays Global, 2023)');
});

test('범례 제목: 교과서가 범례 제목을 인쇄한 레이어에 legendTitle(선 범례는 lineLegendTitle)', () => {
  const L = Object.fromEntries(T.flatMap((t) => t.layers.map((l) => [l.ref, l])));
  const want = {
    'layer-p21-climate': ['기후 구분'], 'layer-p21-jan': ['강수량(mm)', '기온 (°C)'], 'layer-p21-jul': ['강수량(mm)', '기온 (°C)'],
    'layer-p22-religion': ['지역별 종교 분포 비율'], 'overlay-p23-density': ['인구 밀도(명/km²)'], 'layer-p23-density-cities': ['인구'],
    'layer-p23-growth': ['인구 증가율(%)'], 'layer-p24-trade': ['우리나라와의 무역액(억 달러, 2022)', '우리나라의 수출입액 (백억 달러, 2022)'],
  };
  for (const [ref, [area, line]] of Object.entries(want)) {
    assert.equal(L[ref].legendTitle, area, ref);
    assert.equal(L[ref].lineLegendTitle, line, `${ref} 선`);
  }
  for (const l of Object.values(L)) if (!(l.ref in want)) assert.equal(l.legendTitle, undefined, `${l.ref}: 교과서에 범례 제목 없음`);
});
